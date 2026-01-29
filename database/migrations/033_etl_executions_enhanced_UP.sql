-- Migration: 033_etl_executions_enhanced_UP.sql
-- Mejoras a etl_executions para tracking detallado de errores por fase y métricas

-- ============================================================================
-- PARTE 1: Extender tabla etl_executions con columnas de fase y métricas
-- ============================================================================

-- Fase y tipo de error
ALTER TABLE etl_executions
ADD COLUMN IF NOT EXISTS error_phase VARCHAR(20),           -- 'extract', 'transform', 'load'
ADD COLUMN IF NOT EXISTS error_category VARCHAR(50),        -- Categoría específica de error
ADD COLUMN IF NOT EXISTS error_source VARCHAR(100);         -- Fuente: 'klk_api', 'stellar_db', 'postgresql', etc.

-- Métricas por fase (tiempo en segundos)
ALTER TABLE etl_executions
ADD COLUMN IF NOT EXISTS extract_duration_seconds DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS transform_duration_seconds DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS load_duration_seconds DECIMAL(10,2);

-- Detalle de extracción
ALTER TABLE etl_executions
ADD COLUMN IF NOT EXISTS source_system VARCHAR(20),         -- 'klk', 'stellar', 'mixed'
ADD COLUMN IF NOT EXISTS api_requests_count INTEGER,        -- Número de llamadas a API/DB
ADD COLUMN IF NOT EXISTS api_errors_count INTEGER DEFAULT 0;

-- Detalle de carga
ALTER TABLE etl_executions
ADD COLUMN IF NOT EXISTS records_upserted INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS records_failed INTEGER DEFAULT 0;

-- Network diagnostics (para errores de conexión)
ALTER TABLE etl_executions
ADD COLUMN IF NOT EXISTS network_diagnostics JSONB;         -- IP, puerto, timeout, etc.

-- Para identificar ejecución que recuperó un gap
ALTER TABLE etl_executions
ADD COLUMN IF NOT EXISTS is_recovery BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recovered_gap_id INTEGER;

-- Constraint para validar fase de error
ALTER TABLE etl_executions
DROP CONSTRAINT IF EXISTS chk_error_phase;

ALTER TABLE etl_executions
ADD CONSTRAINT chk_error_phase CHECK (
    error_phase IS NULL OR error_phase IN ('extract', 'transform', 'load')
);

-- Foreign key para recovered_gap_id (referencia a otra ejecución)
ALTER TABLE etl_executions
DROP CONSTRAINT IF EXISTS fk_recovered_gap;

ALTER TABLE etl_executions
ADD CONSTRAINT fk_recovered_gap FOREIGN KEY (recovered_gap_id)
    REFERENCES etl_executions(id) ON DELETE SET NULL;

-- Índices adicionales para queries de historial
CREATE INDEX IF NOT EXISTS idx_etl_executions_error_phase
    ON etl_executions(error_phase) WHERE error_phase IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_etl_executions_source
    ON etl_executions(source_system);

CREATE INDEX IF NOT EXISTS idx_etl_executions_recovery
    ON etl_executions(is_recovery) WHERE is_recovery = TRUE;

CREATE INDEX IF NOT EXISTS idx_etl_executions_triggered_by
    ON etl_executions(triggered_by);

-- Comentarios
COMMENT ON COLUMN etl_executions.error_phase IS 'Fase donde ocurrió el error: extract, transform, load';
COMMENT ON COLUMN etl_executions.error_category IS 'Categoría: vpn_timeout, api_error, db_connection, transformation_error, load_constraint, etc.';
COMMENT ON COLUMN etl_executions.error_source IS 'Fuente del error: klk_api, stellar_db, postgresql';
COMMENT ON COLUMN etl_executions.extract_duration_seconds IS 'Tiempo en fase de extracción (segundos)';
COMMENT ON COLUMN etl_executions.transform_duration_seconds IS 'Tiempo en fase de transformación (segundos)';
COMMENT ON COLUMN etl_executions.load_duration_seconds IS 'Tiempo en fase de carga (segundos)';
COMMENT ON COLUMN etl_executions.source_system IS 'Sistema origen: klk, stellar, mixed';
COMMENT ON COLUMN etl_executions.network_diagnostics IS 'Diagnóstico de red: IP, puerto, latencia, etc (JSONB)';
COMMENT ON COLUMN etl_executions.is_recovery IS 'TRUE si es ejecución de recuperación de gap';
COMMENT ON COLUMN etl_executions.recovered_gap_id IS 'ID de la ejecución cuyo gap fue recuperado';

-- ============================================================================
-- PARTE 2: Nueva tabla etl_execution_details para detalle por tienda
-- ============================================================================

CREATE TABLE IF NOT EXISTS etl_execution_details (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER NOT NULL,

    -- Identificación de tienda
    tienda_id VARCHAR(50) NOT NULL,
    tienda_nombre VARCHAR(100),
    source_system VARCHAR(20),              -- 'klk' o 'stellar'

    -- Resultado individual
    status VARCHAR(20) NOT NULL,            -- 'success', 'failed', 'skipped'
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    duration_seconds DECIMAL(10,2),

    -- Métricas
    records_extracted INTEGER DEFAULT 0,
    records_loaded INTEGER DEFAULT 0,
    duplicates_skipped INTEGER DEFAULT 0,

    -- Error si falló
    error_phase VARCHAR(20),                -- 'extract', 'transform', 'load'
    error_category VARCHAR(50),
    error_message TEXT,

    -- Diagnóstico de red
    server_ip VARCHAR(45),
    server_port INTEGER,
    connection_latency_ms DECIMAL(10,2),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key a ejecución principal
    CONSTRAINT fk_execution FOREIGN KEY (execution_id)
        REFERENCES etl_executions(id) ON DELETE CASCADE,

    -- Validación de fase de error
    CONSTRAINT chk_detail_error_phase CHECK (
        error_phase IS NULL OR error_phase IN ('extract', 'transform', 'load')
    ),

    -- Validación de status
    CONSTRAINT chk_detail_status CHECK (
        status IN ('success', 'failed', 'skipped')
    )
);

-- Índices para queries eficientes
CREATE INDEX idx_etl_details_execution ON etl_execution_details(execution_id);
CREATE INDEX idx_etl_details_tienda ON etl_execution_details(tienda_id);
CREATE INDEX idx_etl_details_status ON etl_execution_details(status);
CREATE INDEX idx_etl_details_error_phase ON etl_execution_details(error_phase) WHERE error_phase IS NOT NULL;

-- Comentarios
COMMENT ON TABLE etl_execution_details IS 'Detalle granular por tienda de cada ejecución ETL';
COMMENT ON COLUMN etl_execution_details.execution_id IS 'ID de la ejecución ETL principal';
COMMENT ON COLUMN etl_execution_details.error_phase IS 'Fase donde ocurrió el error en esta tienda';
COMMENT ON COLUMN etl_execution_details.error_category IS 'Categoría de error específica de esta tienda';
COMMENT ON COLUMN etl_execution_details.server_ip IS 'IP del servidor de la tienda (para diagnóstico)';
COMMENT ON COLUMN etl_execution_details.connection_latency_ms IS 'Latencia de conexión en milisegundos';

-- ============================================================================
-- PARTE 3: Vista para documentar categorías de error válidas
-- ============================================================================

CREATE OR REPLACE VIEW v_etl_error_categories AS
SELECT * FROM (VALUES
    -- Errores de Extracción
    ('extract', 'vpn_timeout', 'VPN no responde o timeout de conexión'),
    ('extract', 'vpn_unreachable', 'VPN no alcanzable - IP no responde'),
    ('extract', 'api_timeout', 'API KLK timeout en request'),
    ('extract', 'api_error', 'API KLK retornó error (4xx, 5xx)'),
    ('extract', 'api_auth', 'Error de autenticación con API KLK'),
    ('extract', 'db_connection', 'No se puede conectar a Stellar SQL Server'),
    ('extract', 'db_timeout', 'Query a Stellar timeout'),
    ('extract', 'db_error', 'Error SQL en Stellar'),
    ('extract', 'network_error', 'Error de red genérico'),

    -- Errores de Transformación
    ('transform', 'data_validation', 'Datos no pasan validación'),
    ('transform', 'data_format', 'Formato de datos inesperado'),
    ('transform', 'missing_fields', 'Campos requeridos faltantes'),
    ('transform', 'encoding_error', 'Error de codificación de caracteres'),

    -- Errores de Carga
    ('load', 'pg_connection', 'No se puede conectar a PostgreSQL'),
    ('load', 'pg_timeout', 'Timeout escribiendo a PostgreSQL'),
    ('load', 'constraint_violation', 'Violación de constraint (FK, unique)'),
    ('load', 'disk_full', 'Disco lleno en RDS'),
    ('load', 'deadlock', 'Deadlock detectado')
) AS t(error_phase, error_category, description);

COMMENT ON VIEW v_etl_error_categories IS 'Taxonomía de categorías de error válidas por fase';

-- ============================================================================
-- PARTE 4: Vistas mejoradas para análisis
-- ============================================================================

-- Vista de ejecuciones con métricas por fase
CREATE OR REPLACE VIEW v_etl_executions_with_phases AS
SELECT
    id,
    etl_name,
    etl_type,
    started_at,
    finished_at,
    duration_seconds,
    status,
    triggered_by,
    source_system,

    -- Métricas
    records_extracted,
    records_loaded,
    duplicates_skipped,

    -- Tiempos por fase
    extract_duration_seconds,
    transform_duration_seconds,
    load_duration_seconds,

    -- Porcentaje de tiempo por fase
    CASE WHEN duration_seconds > 0 THEN
        ROUND((extract_duration_seconds / duration_seconds * 100)::numeric, 1)
    ELSE NULL END as extract_percentage,

    CASE WHEN duration_seconds > 0 THEN
        ROUND((transform_duration_seconds / duration_seconds * 100)::numeric, 1)
    ELSE NULL END as transform_percentage,

    CASE WHEN duration_seconds > 0 THEN
        ROUND((load_duration_seconds / duration_seconds * 100)::numeric, 1)
    ELSE NULL END as load_percentage,

    -- Error info
    error_phase,
    error_category,
    error_source,
    error_message,

    -- Recovery info
    is_recovery,
    recovered_gap_id

FROM etl_executions;

COMMENT ON VIEW v_etl_executions_with_phases IS 'Vista enriquecida de ejecuciones con métricas por fase';

-- Vista de estadísticas de error por categoría
CREATE OR REPLACE VIEW v_etl_error_stats AS
SELECT
    error_phase,
    error_category,
    COUNT(*) as total_occurrences,
    COUNT(DISTINCT etl_name) as affected_etls,
    MIN(started_at) as first_occurrence,
    MAX(started_at) as last_occurrence,
    ROUND(AVG(duration_seconds)::numeric, 2) as avg_duration_before_error
FROM etl_executions
WHERE error_phase IS NOT NULL
GROUP BY error_phase, error_category
ORDER BY total_occurrences DESC;

COMMENT ON VIEW v_etl_error_stats IS 'Estadísticas de errores por fase y categoría';

-- Vista de tiendas problemáticas
CREATE OR REPLACE VIEW v_etl_problematic_tiendas AS
SELECT
    tienda_id,
    tienda_nombre,
    COUNT(*) as total_executions,
    COUNT(*) FILTER (WHERE status = 'failed') as failures,
    COUNT(*) FILTER (WHERE status = 'success') as successes,
    ROUND((COUNT(*) FILTER (WHERE status = 'failed')::numeric / COUNT(*) * 100), 2) as failure_rate,
    mode() WITHIN GROUP (ORDER BY error_category) as most_common_error,
    MAX(created_at) as last_failure
FROM etl_execution_details
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY tienda_id, tienda_nombre
HAVING COUNT(*) FILTER (WHERE status = 'failed') > 0
ORDER BY failure_rate DESC, failures DESC;

COMMENT ON VIEW v_etl_problematic_tiendas IS 'Tiendas con más fallos en últimos 7 días';

-- ============================================================================
-- PARTE 5: Funciones auxiliares
-- ============================================================================

-- Función para obtener resumen de última ejecución de un ETL
CREATE OR REPLACE FUNCTION get_latest_etl_execution(p_etl_name VARCHAR)
RETURNS TABLE (
    execution_id INTEGER,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    duration_seconds DECIMAL,
    status VARCHAR,
    records_loaded INTEGER,
    error_info TEXT,
    tiendas_exitosas BIGINT,
    tiendas_fallidas BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.started_at,
        e.finished_at,
        e.duration_seconds,
        e.status,
        e.records_loaded,
        CASE
            WHEN e.error_phase IS NOT NULL THEN
                e.error_phase || ': ' || COALESCE(e.error_category, 'unknown')
            ELSE NULL
        END as error_info,
        COUNT(*) FILTER (WHERE d.status = 'success') as tiendas_exitosas,
        COUNT(*) FILTER (WHERE d.status = 'failed') as tiendas_fallidas
    FROM etl_executions e
    LEFT JOIN etl_execution_details d ON d.execution_id = e.id
    WHERE e.etl_name = p_etl_name
    GROUP BY e.id, e.started_at, e.finished_at, e.duration_seconds,
             e.status, e.records_loaded, e.error_phase, e.error_category
    ORDER BY e.started_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_latest_etl_execution IS 'Obtiene resumen de la última ejecución de un ETL específico';

-- ============================================================================
-- FIN DE MIGRACIÓN 033
-- ============================================================================

-- Log de migración exitosa
DO $$
BEGIN
    RAISE NOTICE 'Migration 033_etl_executions_enhanced_UP.sql completed successfully';
    RAISE NOTICE 'Added % new columns to etl_executions', (
        SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'etl_executions'
        AND column_name IN (
            'error_phase', 'error_category', 'error_source',
            'extract_duration_seconds', 'transform_duration_seconds', 'load_duration_seconds',
            'source_system', 'api_requests_count', 'api_errors_count',
            'records_upserted', 'records_failed', 'network_diagnostics',
            'is_recovery', 'recovered_gap_id'
        )
    );
    RAISE NOTICE 'Created table etl_execution_details';
    RAISE NOTICE 'Created 3 new views: v_etl_error_categories, v_etl_executions_with_phases, v_etl_error_stats';
END $$;
