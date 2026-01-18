-- =========================================================================
-- Migration 026 UP: Add prom_ventas_20dias_unid column to pedidos_sugeridos_detalle
-- Description: Adds column for 20-day average sales metric
-- Date: 2026-01-18
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Add prom_ventas_20dias_unid column to pedidos_sugeridos_detalle
-- This stores the 20-day average sales in units
-- -------------------------------------------------------------------------

ALTER TABLE pedidos_sugeridos_detalle
ADD COLUMN IF NOT EXISTS prom_ventas_20dias_unid DECIMAL(12,4) DEFAULT 0;

-- -------------------------------------------------------------------------
-- 2. Record migration
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('026', 'add_prom_ventas_20dias_column')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 026 UP
-- =========================================================================
