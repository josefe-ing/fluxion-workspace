-- Migration 009 DOWN: Remove store operating hours from ubicaciones
-- Author: Claude Code
-- Date: 2025-11-28

ALTER TABLE ubicaciones DROP COLUMN IF EXISTS hora_apertura;
ALTER TABLE ubicaciones DROP COLUMN IF EXISTS hora_cierre;

SELECT 'Migration 009 rolled back successfully' as status;
