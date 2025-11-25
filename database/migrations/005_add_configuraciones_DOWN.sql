-- =========================================================================
-- Migration 005 DOWN: Remove configuraciones table
-- =========================================================================

BEGIN;

DROP TABLE IF EXISTS configuraciones CASCADE;

DELETE FROM schema_migrations WHERE version = '005';

COMMIT;
