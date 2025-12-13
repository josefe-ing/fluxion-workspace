-- =========================================================================
-- Migration 017 UP: Fix cedi_origen_id for cedi_verde products
-- Description: Corrects assignment logic - if a product EXISTS in cedi_verde
--              inventory, it belongs to cedi_verde (regardless of stock levels)
-- Date: 2025-12-13
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Fix: Products that exist in cedi_verde should be assigned to cedi_verde
--    The original migration used "highest stock" logic, but the correct
--    logic is: if a product is managed by cedi_verde, it belongs there
-- -------------------------------------------------------------------------

-- First, let's see what we're about to change (for logging)
DO $$
DECLARE
    v_count_before INTEGER;
    v_count_verde_inv INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count_before FROM productos WHERE cedi_origen_id = 'cedi_verde';
    SELECT COUNT(DISTINCT producto_id) INTO v_count_verde_inv FROM inventario_actual WHERE ubicacion_id = 'cedi_verde';

    RAISE NOTICE 'Before fix: % products assigned to cedi_verde', v_count_before;
    RAISE NOTICE 'Products in cedi_verde inventory: %', v_count_verde_inv;
END $$;

-- Update products that exist in cedi_verde inventory to be assigned to cedi_verde
UPDATE productos p
SET cedi_origen_id = 'cedi_verde'
WHERE EXISTS (
    SELECT 1
    FROM inventario_actual ia
    WHERE ia.producto_id = p.id
      AND ia.ubicacion_id = 'cedi_verde'
)
AND p.cedi_origen_id != 'cedi_verde';

-- -------------------------------------------------------------------------
-- 2. Same logic for cedi_frio - products in frio inventory belong to frio
-- -------------------------------------------------------------------------

UPDATE productos p
SET cedi_origen_id = 'cedi_frio'
WHERE EXISTS (
    SELECT 1
    FROM inventario_actual ia
    WHERE ia.producto_id = p.id
      AND ia.ubicacion_id = 'cedi_frio'
)
AND p.cedi_origen_id NOT IN ('cedi_verde', 'cedi_frio');

-- Note: Priority order is verde > frio > seco
-- This ensures products that are in both verde and seco stay in verde

-- -------------------------------------------------------------------------
-- 3. Verification query
-- -------------------------------------------------------------------------

DO $$
DECLARE
    v_total INTEGER;
    v_seco INTEGER;
    v_frio INTEGER;
    v_verde INTEGER;
    v_null INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM productos;
    SELECT COUNT(*) INTO v_seco FROM productos WHERE cedi_origen_id = 'cedi_seco';
    SELECT COUNT(*) INTO v_frio FROM productos WHERE cedi_origen_id = 'cedi_frio';
    SELECT COUNT(*) INTO v_verde FROM productos WHERE cedi_origen_id = 'cedi_verde';
    SELECT COUNT(*) INTO v_null FROM productos WHERE cedi_origen_id IS NULL;

    RAISE NOTICE 'Migration 017: cedi_origen_id fixed';
    RAISE NOTICE '  Total productos: %', v_total;
    RAISE NOTICE '  cedi_seco: %', v_seco;
    RAISE NOTICE '  cedi_frio: %', v_frio;
    RAISE NOTICE '  cedi_verde: %', v_verde;
    RAISE NOTICE '  NULL: %', v_null;
END $$;

-- -------------------------------------------------------------------------
-- 4. Record this migration
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('017', 'fix_cedi_origen_verde')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 017 UP
-- =========================================================================
