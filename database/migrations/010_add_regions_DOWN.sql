-- =====================================================================================
-- MIGRACIÓN 010 - ROLLBACK: SEPARACIÓN POR REGIONES
-- =====================================================================================

-- Eliminar índices parciales
DROP INDEX IF EXISTS idx_facturas_caracas_fecha;
DROP INDEX IF EXISTS idx_facturas_valencia_fecha;
DROP INDEX IF EXISTS idx_inventario_actual_caracas;
DROP INDEX IF EXISTS idx_inventario_actual_valencia;
DROP INDEX IF EXISTS idx_items_facturas_fecha_factura;
DROP INDEX IF EXISTS idx_movimientos_caracas_fecha;
DROP INDEX IF EXISTS idx_movimientos_valencia_fecha;
DROP INDEX IF EXISTS idx_prod_ubic_config_caracas;
DROP INDEX IF EXISTS idx_prod_ubic_config_valencia;
DROP INDEX IF EXISTS idx_ubicaciones_region;

-- Eliminar función
DROP FUNCTION IF EXISTS get_ubicaciones_region(VARCHAR);

-- Eliminar vista
DROP VIEW IF EXISTS v_comparativa_regiones;

-- Limpiar columna region (opcional - no elimina la columna, solo los valores)
UPDATE ubicaciones SET region = NULL;

-- Eliminar registro de migración
DELETE FROM schema_migrations WHERE version = '010';

DO $$
BEGIN
    RAISE NOTICE '✅ Rollback de migración 010 completado';
END $$;
