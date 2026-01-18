-- =========================================================================
-- Migration 025 UP: Add grupo_pedido_id columns for multi-store orders
-- Description: Adds columns to group multiple orders created together
-- Date: 2026-01-18
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Add grupo_pedido_id column to pedidos_sugeridos
-- This allows grouping multiple orders that were created together
-- (e.g., from the multi-store wizard)
-- -------------------------------------------------------------------------

ALTER TABLE pedidos_sugeridos
ADD COLUMN IF NOT EXISTS grupo_pedido_id VARCHAR(50);

-- -------------------------------------------------------------------------
-- 2. Add orden_en_grupo column to pedidos_sugeridos
-- This indicates the order number within a group (1, 2, 3, etc.)
-- -------------------------------------------------------------------------

ALTER TABLE pedidos_sugeridos
ADD COLUMN IF NOT EXISTS orden_en_grupo INTEGER DEFAULT 1;

-- -------------------------------------------------------------------------
-- 3. Create index for efficient group queries
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_pedidos_grupo ON pedidos_sugeridos(grupo_pedido_id);

-- -------------------------------------------------------------------------
-- 4. Record migration
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('025', 'add_grupo_pedido_columns')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 025 UP
-- =========================================================================
