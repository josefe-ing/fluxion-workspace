-- Migration: 033_etl_executions_enhanced_DOWN.sql
-- Rollback de mejoras a etl_executions

-- ============================================================================
-- PARTE 1: Eliminar función auxiliar
-- ============================================================================

DROP FUNCTION IF EXISTS get_latest_etl_execution(VARCHAR);

-- ============================================================================
-- PARTE 2: Eliminar vistas
-- ============================================================================

DROP VIEW IF EXISTS v_etl_problematic_tiendas;
DROP VIEW IF EXISTS v_etl_error_stats;
DROP VIEW IF EXISTS v_etl_executions_with_phases;
DROP VIEW IF EXISTS v_etl_error_categories;

-- ============================================================================
-- PARTE 3: Eliminar tabla etl_execution_details
-- ============================================================================

DROP TABLE IF EXISTS etl_execution_details CASCADE;

-- ============================================================================
-- PARTE 4: Eliminar columnas agregadas a etl_executions
-- ============================================================================

ALTER TABLE etl_executions
DROP CONSTRAINT IF EXISTS fk_recovered_gap,
DROP CONSTRAINT IF EXISTS chk_error_phase;

ALTER TABLE etl_executions
DROP COLUMN IF EXISTS error_phase,
DROP COLUMN IF EXISTS error_category,
DROP COLUMN IF EXISTS error_source,
DROP COLUMN IF EXISTS extract_duration_seconds,
DROP COLUMN IF EXISTS transform_duration_seconds,
DROP COLUMN IF EXISTS load_duration_seconds,
DROP COLUMN IF EXISTS source_system,
DROP COLUMN IF EXISTS api_requests_count,
DROP COLUMN IF EXISTS api_errors_count,
DROP COLUMN IF EXISTS records_upserted,
DROP COLUMN IF EXISTS records_failed,
DROP COLUMN IF EXISTS network_diagnostics,
DROP COLUMN IF EXISTS is_recovery,
DROP COLUMN IF EXISTS recovered_gap_id;

-- ============================================================================
-- PARTE 5: Eliminar índices
-- ============================================================================

DROP INDEX IF EXISTS idx_etl_executions_triggered_by;
DROP INDEX IF EXISTS idx_etl_executions_recovery;
DROP INDEX IF EXISTS idx_etl_executions_source;
DROP INDEX IF EXISTS idx_etl_executions_error_phase;

-- ============================================================================
-- FIN DE ROLLBACK 033
-- ============================================================================

-- Log de rollback exitoso
DO $$
BEGIN
    RAISE NOTICE 'Migration 033_etl_executions_enhanced_DOWN.sql completed successfully';
    RAISE NOTICE 'Rolled back all changes from migration 033';
    RAISE NOTICE 'Table etl_executions restored to previous state';
    RAISE NOTICE 'Table etl_execution_details removed';
END $$;
