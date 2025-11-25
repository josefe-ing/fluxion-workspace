-- =========================================================================
-- Migration 007 UP: Add inventario_actual table
-- Description: Creates current inventory state table (~800K records)
-- Date: 2025-11-25
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Create inventario_actual table
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventario_actual (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tienda_codigo VARCHAR(10) NOT NULL,
    almacen_codigo VARCHAR(20),
    producto_codigo VARCHAR(50) NOT NULL,
    producto_descripcion VARCHAR(200),
    producto_categoria VARCHAR(50),
    producto_unidad VARCHAR(20),
    cantidad_disponible NUMERIC(12,4) NOT NULL CHECK (cantidad_disponible >= 0),
    cantidad_reservada NUMERIC(12,4),
    cantidad_transito NUMERIC(12,4),
    valor_inventario NUMERIC(18,2) CHECK (valor_inventario >= 0),
    costo_unitario NUMERIC(12,2),
    requiere_reposicion BOOLEAN DEFAULT FALSE,
    dias_inventario INTEGER,
    metadata JSONB,
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inventario_actual_tienda_codigo_producto_codigo_key UNIQUE (tienda_codigo, producto_codigo)
);

-- -------------------------------------------------------------------------
-- 2. Create indexes
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_inventario_actual_tienda ON inventario_actual(tienda_codigo);
CREATE INDEX IF NOT EXISTS idx_inventario_actual_producto ON inventario_actual(producto_codigo);
CREATE INDEX IF NOT EXISTS idx_inventario_actual_tienda_producto ON inventario_actual(tienda_codigo, producto_codigo);
CREATE INDEX IF NOT EXISTS idx_inventario_actual_categoria ON inventario_actual(producto_categoria);
CREATE INDEX IF NOT EXISTS idx_inventario_actual_requiere_reposicion ON inventario_actual(tienda_codigo, producto_codigo)
    WHERE requiere_reposicion = TRUE;
CREATE INDEX IF NOT EXISTS idx_inventario_actual_metadata_gin ON inventario_actual USING GIN (metadata);

-- -------------------------------------------------------------------------
-- 3. Add table and column comments
-- -------------------------------------------------------------------------

COMMENT ON TABLE inventario_actual IS
    'Estado actual del inventario (~800K registros). Fuente: POST /maestra/articulos/almacen (KLK API). UPSERT cada 30 minutos';

COMMENT ON COLUMN inventario_actual.cantidad_disponible IS
    'Stock disponible para venta en este momento';

COMMENT ON COLUMN inventario_actual.requiere_reposicion IS
    'Flag calculado: true si stock < nivel objetivo';

COMMENT ON COLUMN inventario_actual.dias_inventario IS
    'Días de inventario proyectados basado en venta promedio';

COMMENT ON COLUMN inventario_actual.metadata IS
    'Respuesta completa del KLK API para este producto/almacén';

COMMENT ON COLUMN inventario_actual.ultima_actualizacion IS
    'Timestamp de la última actualización del ETL';

-- -------------------------------------------------------------------------
-- 4. Record this migration in schema_migrations
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('007', 'add_inventario_actual')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 007 UP
-- =========================================================================
