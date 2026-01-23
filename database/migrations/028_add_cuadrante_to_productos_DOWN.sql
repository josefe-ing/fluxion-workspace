BEGIN;

DROP INDEX IF EXISTS idx_productos_cuadrante;
DROP INDEX IF EXISTS idx_productos_categoria_cuadrante;
ALTER TABLE productos DROP COLUMN IF EXISTS cuadrante;

DELETE FROM schema_migrations WHERE version = '028';

COMMIT;
