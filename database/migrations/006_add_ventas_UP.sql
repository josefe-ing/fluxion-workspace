-- =========================================================================
-- Migration 006 UP: Add ventas table (KLK API format)
-- Description: Creates sales transactions table matching KLK API response
-- Date: 2025-11-26
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Drop existing ventas table if exists (clean slate)
-- -------------------------------------------------------------------------

DROP TABLE IF EXISTS ventas CASCADE;

-- -------------------------------------------------------------------------
-- 2. Create ventas table (matching KLK API structure)
-- -------------------------------------------------------------------------

CREATE TABLE ventas (
    id BIGSERIAL PRIMARY KEY,
    numero_factura VARCHAR(100) NOT NULL,
    fecha_venta TIMESTAMP NOT NULL,
    ubicacion_id VARCHAR(50) NOT NULL,
    almacen_codigo VARCHAR(50),
    almacen_nombre VARCHAR(200),
    producto_id VARCHAR(50) NOT NULL,
    cantidad_vendida NUMERIC(18,4) NOT NULL DEFAULT 0,
    peso_unitario NUMERIC(18,4) DEFAULT 0,
    peso_calculado NUMERIC(18,4) DEFAULT 0,
    total_cantidad_por_unidad_medida NUMERIC(18,4) DEFAULT 0,
    unidad_medida_venta VARCHAR(50) DEFAULT 'UNIDAD',
    factor_unidad_medida NUMERIC(18,4) DEFAULT 1,
    precio_unitario NUMERIC(18,4) DEFAULT 0,
    costo_unitario NUMERIC(18,4) DEFAULT 0,
    venta_total NUMERIC(18,4) DEFAULT 0,
    costo_total NUMERIC(18,4) DEFAULT 0,
    utilidad_bruta NUMERIC(18,4) DEFAULT 0,
    margen_bruto_pct NUMERIC(8,2) DEFAULT 0,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ventas_numero_factura_unique UNIQUE (numero_factura)
);

-- -------------------------------------------------------------------------
-- 3. Create indexes (optimized for analytics and ETL queries)
-- -------------------------------------------------------------------------

-- Primary lookup indexes
CREATE INDEX idx_ventas_fecha_venta ON ventas(fecha_venta DESC);
CREATE INDEX idx_ventas_ubicacion ON ventas(ubicacion_id);
CREATE INDEX idx_ventas_producto ON ventas(producto_id);

-- Composite indexes for common queries
CREATE INDEX idx_ventas_ubicacion_fecha ON ventas(ubicacion_id, fecha_venta DESC);
CREATE INDEX idx_ventas_producto_fecha ON ventas(producto_id, fecha_venta DESC);
CREATE INDEX idx_ventas_ubicacion_producto ON ventas(ubicacion_id, producto_id);

-- Date-based analytics
CREATE INDEX idx_ventas_fecha_venta_date ON ventas((fecha_venta::date));

-- ABC/XYZ analysis index
CREATE INDEX idx_ventas_abc_xyz ON ventas(ubicacion_id, producto_id, fecha_venta, cantidad_vendida, venta_total);

-- -------------------------------------------------------------------------
-- 4. Add table and column comments
-- -------------------------------------------------------------------------

COMMENT ON TABLE ventas IS
    'Transacciones de venta desde KLK API. UPSERT por numero_factura (factura_linea).';

COMMENT ON COLUMN ventas.numero_factura IS
    'ID unico: {numero_factura}_L{linea} - permite UPSERT sin duplicados';

COMMENT ON COLUMN ventas.fecha_venta IS
    'Timestamp de la venta (fecha + hora)';

COMMENT ON COLUMN ventas.ubicacion_id IS
    'ID de ubicacion/tienda (tienda_01, tienda_08, etc)';

COMMENT ON COLUMN ventas.producto_id IS
    'Codigo SKU del producto (000001, 001234, etc)';

COMMENT ON COLUMN ventas.venta_total IS
    'Total de venta en USD';

COMMENT ON COLUMN ventas.costo_total IS
    'Costo total en USD';

COMMENT ON COLUMN ventas.utilidad_bruta IS
    'Utilidad bruta = venta_total - costo_total (USD)';

COMMENT ON COLUMN ventas.margen_bruto_pct IS
    'Margen bruto porcentual = (utilidad_bruta / venta_total) * 100';

-- -------------------------------------------------------------------------
-- 5. Record this migration in schema_migrations
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('006', 'add_ventas')
ON CONFLICT (version) DO UPDATE SET
    name = 'add_ventas',
    applied_at = CURRENT_TIMESTAMP;

COMMIT;

-- =========================================================================
-- End of Migration 006 UP
-- =========================================================================
