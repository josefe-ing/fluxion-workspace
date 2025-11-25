-- =========================================================================
-- Migration 003 UP: Add Foreign Keys to inventario_historico
-- Description: Adds foreign key constraints now that base tables exist
-- Date: 2025-11-25
-- Author: System
-- =========================================================================
--
-- This migration adds the foreign key constraints that were deferred in
-- migration 001. Now that ubicaciones and productos tables exist, we can
-- enforce referential integrity.
--
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Add foreign key constraints to inventario_historico
-- -------------------------------------------------------------------------

ALTER TABLE inventario_historico
    ADD CONSTRAINT fk_hist_ubicacion
    FOREIGN KEY (ubicacion_id)
    REFERENCES ubicaciones(id)
    ON DELETE CASCADE;

ALTER TABLE inventario_historico
    ADD CONSTRAINT fk_hist_producto
    FOREIGN KEY (producto_id)
    REFERENCES productos(id)
    ON DELETE CASCADE;

-- -------------------------------------------------------------------------
-- 2. Add constraint comments
-- -------------------------------------------------------------------------

COMMENT ON CONSTRAINT fk_hist_ubicacion ON inventario_historico IS
    'Ensures all inventory snapshots reference valid locations';

COMMENT ON CONSTRAINT fk_hist_producto ON inventario_historico IS
    'Ensures all inventory snapshots reference valid products';

-- -------------------------------------------------------------------------
-- 3. Record this migration in schema_migrations
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('003', 'add_foreign_keys')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 003 UP
-- =========================================================================
