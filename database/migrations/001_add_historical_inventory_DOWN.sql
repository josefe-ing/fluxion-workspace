-- =========================================================================
-- Migration 001 DOWN: Rollback Historical Inventory System
-- Description: Safely remove all historical inventory components
-- Date: 2025-11-25
-- Author: System
-- =========================================================================
--
-- WARNING: This will DELETE ALL historical inventory data permanently!
-- Only run this if you need to rollback the historical inventory feature.
--
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Drop the view first (depends on table)
-- -------------------------------------------------------------------------
DROP VIEW IF EXISTS v_inventario_historico_reciente CASCADE;

-- -------------------------------------------------------------------------
-- 2. Drop all indexes
-- -------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_hist_producto_ubicacion_fecha;
DROP INDEX IF EXISTS idx_hist_ubicacion;
DROP INDEX IF EXISTS idx_hist_fecha;
DROP INDEX IF EXISTS idx_hist_producto_ubicacion;

-- -------------------------------------------------------------------------
-- 3. Drop the main table (this will CASCADE delete all data)
-- -------------------------------------------------------------------------
DROP TABLE IF EXISTS inventario_historico CASCADE;

-- -------------------------------------------------------------------------
-- 4. Remove migration record from schema_migrations
-- -------------------------------------------------------------------------
DELETE FROM schema_migrations WHERE version = '001';

COMMIT;

-- =========================================================================
-- End of Migration 001 DOWN
-- =========================================================================
