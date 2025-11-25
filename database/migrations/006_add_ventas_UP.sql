-- =========================================================================
-- Migration 006 UP: Add ventas table
-- Description: Creates sales transactions table (large dataset ~81M records)
-- Date: 2025-11-25
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Create ventas table
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ventas (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    fecha DATE NOT NULL,
    tienda_codigo VARCHAR(10) NOT NULL,
    almacen_codigo VARCHAR(20),
    producto_codigo VARCHAR(50) NOT NULL,
    producto_descripcion VARCHAR(200),
    producto_categoria VARCHAR(50),
    producto_unidad VARCHAR(20),
    cantidad NUMERIC(12,4) NOT NULL CHECK (cantidad >= 0),
    precio_unitario NUMERIC(12,2),
    monto_total NUMERIC(18,2) CHECK (monto_total >= 0),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------------------
-- 2. Create indexes (optimized for analytics queries)
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_tienda ON ventas(tienda_codigo);
CREATE INDEX IF NOT EXISTS idx_ventas_producto ON ventas(producto_codigo);
CREATE INDEX IF NOT EXISTS idx_ventas_tienda_producto ON ventas(tienda_codigo, producto_codigo);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_tienda ON ventas(fecha, tienda_codigo);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_producto ON ventas(fecha, producto_codigo);
CREATE INDEX IF NOT EXISTS idx_ventas_abc_xyz ON ventas(fecha, tienda_codigo, producto_codigo, cantidad, monto_total);
CREATE INDEX IF NOT EXISTS idx_ventas_metadata_gin ON ventas USING GIN (metadata);

-- -------------------------------------------------------------------------
-- 3. Add table and column comments
-- -------------------------------------------------------------------------

COMMENT ON TABLE ventas IS
    'Transacciones de venta (81M registros, ~10GB). Fuente: POST /ventas (KLK API)';

COMMENT ON COLUMN ventas.fecha IS
    'Fecha de la transacción de venta';

COMMENT ON COLUMN ventas.tienda_codigo IS
    'Código de sucursal (SUC001, SUC004, etc)';

COMMENT ON COLUMN ventas.almacen_codigo IS
    'Código de almacén específico (APP-TPF, PALT, etc)';

COMMENT ON COLUMN ventas.producto_codigo IS
    'Código SKU del producto';

COMMENT ON COLUMN ventas.metadata IS
    'Datos adicionales del KLK API (cliente, factura, descuentos, etc)';

-- -------------------------------------------------------------------------
-- 4. Record this migration in schema_migrations
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('006', 'add_ventas')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 006 UP
-- =========================================================================
