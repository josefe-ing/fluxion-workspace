-- =========================================================================
-- Migration 001 UP: Add Historical Inventory System
-- Description: Comprehensive historical inventory tracking with snapshots
-- Date: 2025-11-25
-- Author: System
-- =========================================================================
--
-- This migration includes ABSOLUTELY EVERYTHING for the historical inventory feature:
-- - Table: inventario_historico
-- - View: v_inventario_historico_reciente
-- - Indexes: 4 indexes for query optimization
-- - Foreign key constraints
-- - Comments on table and columns
--
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Create inventario_historico table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventario_historico (
    id SERIAL PRIMARY KEY,
    ubicacion_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,
    almacen_codigo VARCHAR(50),
    cantidad DECIMAL(15,3) NOT NULL,
    fecha_snapshot TIMESTAMP NOT NULL,
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign Keys
    CONSTRAINT fk_hist_ubicacion FOREIGN KEY (ubicacion_id)
        REFERENCES ubicaciones(id) ON DELETE CASCADE,
    CONSTRAINT fk_hist_producto FOREIGN KEY (producto_id)
        REFERENCES productos(id) ON DELETE CASCADE
);

-- -------------------------------------------------------------------------
-- 2. Create indexes for query performance
-- -------------------------------------------------------------------------

-- Index for queries by product and location
CREATE INDEX IF NOT EXISTS idx_hist_producto_ubicacion
    ON inventario_historico(producto_id, ubicacion_id, fecha_snapshot DESC);

-- Index for queries by date (temporal queries)
CREATE INDEX IF NOT EXISTS idx_hist_fecha
    ON inventario_historico(fecha_snapshot DESC);

-- Index for queries by location
CREATE INDEX IF NOT EXISTS idx_hist_ubicacion
    ON inventario_historico(ubicacion_id, fecha_snapshot DESC);

-- Composite index for product in specific location with INCLUDE clause
CREATE INDEX IF NOT EXISTS idx_hist_producto_ubicacion_fecha
    ON inventario_historico(producto_id, ubicacion_id, fecha_snapshot DESC)
    INCLUDE (cantidad, almacen_codigo);

-- -------------------------------------------------------------------------
-- 3. Add table and column comments
-- -------------------------------------------------------------------------
COMMENT ON TABLE inventario_historico IS
    'Histórico de snapshots de inventario - un registro por cada ejecución del ETL';

COMMENT ON COLUMN inventario_historico.fecha_snapshot IS
    'Fecha/hora del snapshot de inventario (fecha_actualizacion de inventario_actual)';

COMMENT ON COLUMN inventario_historico.fecha_carga IS
    'Fecha/hora cuando se insertó este registro histórico';

COMMENT ON COLUMN inventario_historico.almacen_codigo IS
    'Código del almacén KLK (solo para tiendas KLK)';

-- -------------------------------------------------------------------------
-- 4. Create view for common historical queries
-- -------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_inventario_historico_reciente AS
SELECT
    h.id,
    h.fecha_snapshot,
    h.ubicacion_id,
    u.nombre as ubicacion_nombre,
    u.tipo as tipo_ubicacion,
    h.producto_id,
    p.codigo as codigo_producto,
    p.descripcion as descripcion_producto,
    p.categoria,
    p.marca,
    h.almacen_codigo,
    h.cantidad,
    h.fecha_carga,
    -- Calculate variation vs previous snapshot
    LAG(h.cantidad) OVER (
        PARTITION BY h.producto_id, h.ubicacion_id
        ORDER BY h.fecha_snapshot
    ) as cantidad_anterior,
    h.cantidad - LAG(h.cantidad) OVER (
        PARTITION BY h.producto_id, h.ubicacion_id
        ORDER BY h.fecha_snapshot
    ) as variacion
FROM inventario_historico h
JOIN productos p ON h.producto_id = p.id
JOIN ubicaciones u ON h.ubicacion_id = u.id
WHERE h.fecha_snapshot >= CURRENT_DATE - INTERVAL '90 days'  -- Last 90 days
ORDER BY h.fecha_snapshot DESC;

COMMENT ON VIEW v_inventario_historico_reciente IS
    'Vista del histórico de inventario de los últimos 90 días con cálculo de variaciones';

-- -------------------------------------------------------------------------
-- 5. Record this migration in schema_migrations
-- -------------------------------------------------------------------------
INSERT INTO schema_migrations (version, name)
VALUES ('001', 'add_historical_inventory')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 001 UP
-- =========================================================================
