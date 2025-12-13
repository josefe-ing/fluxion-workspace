-- =========================================================================
-- Migration 016 UP: Add cedi_origen_id to productos table
-- Description: Adds field to track which CEDI (Seco/Frio/Verde) supplies
--              each product. Required for Inter-CEDI ordering system.
-- Date: 2025-12-13
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Add cedi_origen_id column to productos table
-- -------------------------------------------------------------------------

ALTER TABLE productos
ADD COLUMN IF NOT EXISTS cedi_origen_id VARCHAR(50);

COMMENT ON COLUMN productos.cedi_origen_id IS
    'CEDI that supplies this product: cedi_seco, cedi_frio, or cedi_verde';

-- -------------------------------------------------------------------------
-- 2. Create index for efficient queries
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_productos_cedi_origen
    ON productos(cedi_origen_id);

-- -------------------------------------------------------------------------
-- 3. Populate from existing CEDI inventory data
--    Priority: CEDI with highest stock for this product
-- -------------------------------------------------------------------------

-- Update products that exist in CEDI inventories
UPDATE productos p
SET cedi_origen_id = sub.ubicacion_id
FROM (
    SELECT DISTINCT ON (producto_id)
        producto_id,
        ubicacion_id
    FROM inventario_actual
    WHERE ubicacion_id IN ('cedi_seco', 'cedi_frio', 'cedi_verde')
      AND cantidad > 0
    ORDER BY producto_id, cantidad DESC
) sub
WHERE p.id = sub.producto_id
  AND p.cedi_origen_id IS NULL;

-- Default remaining products to cedi_seco (main warehouse)
UPDATE productos
SET cedi_origen_id = 'cedi_seco'
WHERE cedi_origen_id IS NULL;

-- -------------------------------------------------------------------------
-- 4. Add constraint to ensure valid values (soft constraint, allows NULL)
-- -------------------------------------------------------------------------

-- Note: Not adding a hard constraint to allow flexibility for future CEDIs
-- ALTER TABLE productos ADD CONSTRAINT chk_cedi_origen_valid
--     CHECK (cedi_origen_id IN ('cedi_seco', 'cedi_frio', 'cedi_verde') OR cedi_origen_id IS NULL);

-- -------------------------------------------------------------------------
-- 5. Create helper function to get CEDI origen for a product
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_producto_cedi_origen(p_producto_id VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN (
        SELECT cedi_origen_id
        FROM productos
        WHERE id = p_producto_id
    );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_producto_cedi_origen(VARCHAR) IS
    'Returns the CEDI origen ID for a given product';

-- -------------------------------------------------------------------------
-- 6. Verification query (for logging purposes)
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

    RAISE NOTICE 'Migration 016: cedi_origen_id populated';
    RAISE NOTICE '  Total productos: %', v_total;
    RAISE NOTICE '  cedi_seco: %', v_seco;
    RAISE NOTICE '  cedi_frio: %', v_frio;
    RAISE NOTICE '  cedi_verde: %', v_verde;
    RAISE NOTICE '  NULL: %', v_null;
END $$;

-- -------------------------------------------------------------------------
-- 7. Record this migration
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('016', 'add_cedi_origen_to_productos')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 016 UP
-- =========================================================================
