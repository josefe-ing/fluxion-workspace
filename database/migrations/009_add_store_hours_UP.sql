-- Migration 009: Add store operating hours to ubicaciones
-- Purpose: Track store opening/closing hours to filter out false positives in alerts
-- Author: Claude Code
-- Date: 2025-11-28

-- Add opening and closing hour columns (stored as TIME)
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS hora_apertura TIME DEFAULT '07:00:00';
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS hora_cierre TIME DEFAULT '21:00:00';

-- Add comments for documentation
COMMENT ON COLUMN ubicaciones.hora_apertura IS 'Hora de apertura de la tienda (ej: 07:00:00)';
COMMENT ON COLUMN ubicaciones.hora_cierre IS 'Hora de cierre de la tienda (ej: 21:00:00)';

-- Update store hours based on real data
-- tienda_01 PERIFERICO: 7am-9pm
UPDATE ubicaciones SET hora_apertura = '07:00:00', hora_cierre = '21:00:00' WHERE id = 'tienda_01';

-- tienda_08 BOSQUE: 8am-12am (midnight)
UPDATE ubicaciones SET hora_apertura = '08:00:00', hora_cierre = '00:00:00' WHERE id = 'tienda_08';

-- tienda_15 ISABELICA: 7am-9pm
UPDATE ubicaciones SET hora_apertura = '07:00:00', hora_cierre = '21:00:00' WHERE id = 'tienda_15';

-- tienda_20 TAZAJAL: 7am-9pm
UPDATE ubicaciones SET hora_apertura = '07:00:00', hora_cierre = '21:00:00' WHERE id = 'tienda_20';

-- tienda_22 Artigas: 7am-9pm
UPDATE ubicaciones SET hora_apertura = '07:00:00', hora_cierre = '21:00:00' WHERE id = 'tienda_22';

-- tienda_25 Paraiso: 7am-9pm (assumed based on pattern)
UPDATE ubicaciones SET hora_apertura = '07:00:00', hora_cierre = '21:00:00' WHERE id = 'tienda_25';

-- CEDIs typically operate longer hours or 24/7
UPDATE ubicaciones SET hora_apertura = '06:00:00', hora_cierre = '22:00:00' WHERE tipo = 'cedi';

-- Migration complete
SELECT 'Migration 009 applied successfully - Store hours added' as status;
