BEGIN;

DROP INDEX IF EXISTS idx_ventas_cuadrante;
ALTER TABLE ventas DROP COLUMN IF EXISTS cuadrante_producto;

DELETE FROM schema_migrations WHERE version = '029';

COMMIT;
