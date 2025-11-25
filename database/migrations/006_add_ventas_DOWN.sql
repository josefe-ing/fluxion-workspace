-- =========================================================================
-- Migration 006 DOWN: Remove ventas table
-- =========================================================================

BEGIN;

DROP TABLE IF EXISTS ventas CASCADE;

DELETE FROM schema_migrations WHERE version = '006';

COMMIT;
