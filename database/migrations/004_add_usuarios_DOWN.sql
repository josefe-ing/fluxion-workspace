-- =========================================================================
-- Migration 004 DOWN: Remove usuarios table
-- =========================================================================

BEGIN;

DROP TABLE IF EXISTS usuarios CASCADE;

DELETE FROM schema_migrations WHERE version = '004';

COMMIT;
