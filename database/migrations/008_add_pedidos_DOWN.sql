-- =========================================================================
-- Migration 008 DOWN: Remove pedidos tables
-- =========================================================================

BEGIN;

-- Drop in reverse order (child first, then parent)
DROP TABLE IF EXISTS pedidos_productos CASCADE;
DROP TABLE IF EXISTS pedidos_sugeridos CASCADE;

DELETE FROM schema_migrations WHERE version = '008';

COMMIT;
