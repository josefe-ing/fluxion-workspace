-- =========================================================================
-- Migration 007 DOWN: Remove inventario_actual table
-- =========================================================================

BEGIN;

DROP TABLE IF EXISTS inventario_actual CASCADE;

DELETE FROM schema_migrations WHERE version = '007';

COMMIT;
