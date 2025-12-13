-- =========================================================================
-- Migration 017 DOWN: Revert cedi_origen_id fix
-- Description: Reverts to the original "highest stock" assignment logic
-- Date: 2025-12-13
-- =========================================================================

BEGIN;

-- Re-run the original logic from migration 016
-- (assigns based on which CEDI has highest stock)

-- Reset all to NULL first
UPDATE productos SET cedi_origen_id = NULL;

-- Assign based on highest stock
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
WHERE p.id = sub.producto_id;

-- Default remaining to cedi_seco
UPDATE productos
SET cedi_origen_id = 'cedi_seco'
WHERE cedi_origen_id IS NULL;

-- Remove migration record
DELETE FROM schema_migrations WHERE version = '017';

COMMIT;

-- =========================================================================
-- End of Migration 017 DOWN
-- =========================================================================
