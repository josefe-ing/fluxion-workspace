-- ============================================================================
-- Migration 031 DOWN: Revert Productos Excluidos Inter-CEDI
-- ============================================================================

DROP INDEX IF EXISTS idx_excluidos_intercedi_codigo;
DROP INDEX IF EXISTS idx_excluidos_intercedi_destino_activo;
DROP TABLE IF EXISTS productos_excluidos_inter_cedi;
