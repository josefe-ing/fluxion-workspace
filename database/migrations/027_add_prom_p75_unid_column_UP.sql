-- =========================================================================
-- Migration 027 UP: Add prom_p75_unid column to pedidos_sugeridos_detalle
-- Description: Adds column for P75 percentile sales metric
-- Date: 2026-01-18
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Add prom_p75_unid column to pedidos_sugeridos_detalle
-- This stores the P75 percentile daily sales in units
-- -------------------------------------------------------------------------

ALTER TABLE pedidos_sugeridos_detalle
ADD COLUMN IF NOT EXISTS prom_p75_unid DECIMAL(12,4) DEFAULT 0;

-- -------------------------------------------------------------------------
-- 2. Record migration
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('027', 'add_prom_p75_unid_column')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 027 UP
-- =========================================================================
