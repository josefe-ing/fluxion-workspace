-- ============================================================================
-- Migration 022: Materialized View for Ventas Summary
-- Description: Creates mv_ventas_summary for fast /api/ventas/summary endpoint
-- Date: 2025-12-22
-- Impact: Reduces query time from 109s to <100ms
-- ============================================================================

BEGIN;

-- Drop if exists (for idempotency)
DROP MATERIALIZED VIEW IF EXISTS mv_ventas_summary;

-- Create materialized view with pre-aggregated ventas data
CREATE MATERIALIZED VIEW mv_ventas_summary AS
SELECT
    v.ubicacion_id,
    u.nombre as ubicacion_nombre,
    'tienda'::text as tipo_ubicacion,
    COUNT(DISTINCT v.numero_factura)::integer as total_transacciones,
    COUNT(DISTINCT v.producto_id)::integer as productos_unicos,
    SUM(v.cantidad_vendida)::integer as unidades_vendidas,
    TO_CHAR(MIN(v.fecha_venta), 'YYYY-MM-DD HH24:MI') as primera_venta,
    TO_CHAR(MAX(v.fecha_venta), 'YYYY-MM-DD HH24:MI') as ultima_venta
FROM ventas v
INNER JOIN ubicaciones u ON v.ubicacion_id = u.id
GROUP BY v.ubicacion_id, u.nombre
ORDER BY u.nombre;

-- Create unique index for fast lookups and REFRESH CONCURRENTLY support
CREATE UNIQUE INDEX idx_mv_ventas_summary_ubicacion ON mv_ventas_summary(ubicacion_id);

-- Add comment
COMMENT ON MATERIALIZED VIEW mv_ventas_summary IS
    'Pre-aggregated ventas summary by ubicacion. Refreshed every 30 min by ETL. Query time: <100ms vs 109s raw.';

-- Record migration
INSERT INTO schema_migrations (version, name)
VALUES ('022', 'mv_ventas_summary')
ON CONFLICT (version) DO UPDATE SET
    name = 'mv_ventas_summary',
    applied_at = CURRENT_TIMESTAMP;

COMMIT;

-- ============================================================================
-- To refresh this view (run in ETL after ventas load):
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ventas_summary;
-- ============================================================================
