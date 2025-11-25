-- =========================================================================
-- Migration 002 DOWN: Rollback Master Tables
-- Description: Removes ubicaciones and productos tables
-- Date: 2025-11-25
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Drop indexes first
-- -------------------------------------------------------------------------

-- Indexes for productos
DROP INDEX IF EXISTS idx_productos_categoria_marca;
DROP INDEX IF EXISTS idx_productos_activo;
DROP INDEX IF EXISTS idx_productos_marca;
DROP INDEX IF EXISTS idx_productos_categoria;
DROP INDEX IF EXISTS idx_productos_codigo_barras;
DROP INDEX IF EXISTS idx_productos_codigo;

-- Indexes for ubicaciones
DROP INDEX IF EXISTS idx_ubicaciones_activo;
DROP INDEX IF EXISTS idx_ubicaciones_ciudad;
DROP INDEX IF EXISTS idx_ubicaciones_tipo;
DROP INDEX IF EXISTS idx_ubicaciones_codigo;

-- -------------------------------------------------------------------------
-- 2. Drop tables
-- -------------------------------------------------------------------------

DROP TABLE IF EXISTS productos CASCADE;
DROP TABLE IF EXISTS ubicaciones CASCADE;

-- -------------------------------------------------------------------------
-- 3. Remove migration record
-- -------------------------------------------------------------------------

DELETE FROM schema_migrations WHERE version = '002';

COMMIT;

-- =========================================================================
-- End of Migration 002 DOWN
-- =========================================================================
