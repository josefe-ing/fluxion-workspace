-- =========================================================================
-- Migration 005 UP: Add configuraciones table
-- Description: Creates flexible configuration table (JSONB schema-less)
-- Date: 2025-11-25
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Create configuraciones table
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS configuraciones (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tipo VARCHAR(50) NOT NULL,
    clave VARCHAR(100) NOT NULL,
    nombre VARCHAR(200),
    config JSONB NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT configuraciones_tipo_clave_key UNIQUE (tipo, clave)
);

-- -------------------------------------------------------------------------
-- 2. Create indexes
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_config_tipo ON configuraciones(tipo);
CREATE INDEX IF NOT EXISTS idx_config_clave ON configuraciones(clave);
CREATE INDEX IF NOT EXISTS idx_config_tipo_clave ON configuraciones(tipo, clave);
CREATE INDEX IF NOT EXISTS idx_config_activo ON configuraciones(activo) WHERE activo = TRUE;
CREATE INDEX IF NOT EXISTS idx_config_jsonb_gin ON configuraciones USING GIN (config);

-- -------------------------------------------------------------------------
-- 3. Add table and column comments
-- -------------------------------------------------------------------------

COMMENT ON TABLE configuraciones IS
    'Configuraciones flexibles del sistema (JSONB schema-less)';

COMMENT ON COLUMN configuraciones.tipo IS
    'Tipo de configuración: sistema, tienda, producto, categoria, abc_xyz, forecasting, etc';

COMMENT ON COLUMN configuraciones.clave IS
    'Identificador único de la configuración (ej: SUC001, categoria_lacteos, forecast_prophet_params)';

COMMENT ON COLUMN configuraciones.config IS
    'Configuración en formato JSONB flexible (permite cualquier estructura)';

-- -------------------------------------------------------------------------
-- 4. Record this migration in schema_migrations
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('005', 'add_configuraciones')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 005 UP
-- =========================================================================
