-- Migration 003: Extend ubicaciones table for admin management
-- Purpose: Add SQL Server connection info and visibility flags
-- Author: Claude Code
-- Date: 2025-11-13

-- Add SQL Server connection columns
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS server_ip VARCHAR(50);
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS server_port INTEGER DEFAULT 1433;
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS database_name VARCHAR(50) DEFAULT 'VAD10';
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS codigo_deposito VARCHAR(10);

-- Add visibility flags for different modules
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS visible_pedidos BOOLEAN DEFAULT false;
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS visible_reportes BOOLEAN DEFAULT true;
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS visible_dashboards BOOLEAN DEFAULT true;

-- Add comments for documentation
COMMENT ON COLUMN ubicaciones.server_ip IS 'IP del servidor SQL Server de la tienda/CEDI';
COMMENT ON COLUMN ubicaciones.server_port IS 'Puerto SQL Server (normalmente 1433 o 14348)';
COMMENT ON COLUMN ubicaciones.database_name IS 'Nombre de la base de datos (VAD10, VAD20, etc.)';
COMMENT ON COLUMN ubicaciones.codigo_deposito IS 'Código del depósito en el sistema legacy';
COMMENT ON COLUMN ubicaciones.visible_pedidos IS 'Mostrar en módulo de Pedidos Sugeridos';
COMMENT ON COLUMN ubicaciones.visible_reportes IS 'Mostrar en módulo de Reportes';
COMMENT ON COLUMN ubicaciones.visible_dashboards IS 'Mostrar en Dashboards';

-- Create indexes on visibility flags for performance
-- Note: DuckDB doesn't support partial indexes (WHERE clause), so we create full indexes
CREATE INDEX IF NOT EXISTS idx_ubicaciones_visible_pedidos ON ubicaciones(visible_pedidos);
CREATE INDEX IF NOT EXISTS idx_ubicaciones_activo ON ubicaciones(activo);

-- Migration complete
SELECT 'Migration 003 applied successfully' as status;
