-- Migration: 021_etl_executions_UP.sql
-- Tabla para tracking de ejecuciones de ETL
-- Permite monitorear duracion, status, y detectar overlaps

CREATE TABLE IF NOT EXISTS etl_executions (
    id SERIAL PRIMARY KEY,

    -- Identificacion del ETL
    etl_name VARCHAR(100) NOT NULL,           -- 'ventas', 'inventario', 'productos', etc.
    etl_type VARCHAR(50) NOT NULL,            -- 'scheduled', 'manual', 'recovery'

    -- Tiempos
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    duration_seconds DECIMAL(10,2),

    -- Rango de datos procesado
    fecha_desde TIMESTAMP,
    fecha_hasta TIMESTAMP,

    -- Tiendas procesadas (NULL = todas)
    tiendas_procesadas TEXT[],                -- Array de tienda_ids

    -- Resultados
    status VARCHAR(20) NOT NULL DEFAULT 'running',  -- 'running', 'success', 'failed', 'partial'
    records_extracted INTEGER DEFAULT 0,
    records_loaded INTEGER DEFAULT 0,
    duplicates_skipped INTEGER DEFAULT 0,
    gaps_recovered INTEGER DEFAULT 0,

    -- Detalles por tienda (JSON)
    tiendas_detail JSONB,

    -- Errores
    error_message TEXT,
    error_detail TEXT,

    -- Metadata
    triggered_by VARCHAR(100),                -- 'eventbridge', 'manual', 'cli'
    task_arn VARCHAR(500),                    -- ECS Task ARN si aplica

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indices para queries comunes
CREATE INDEX idx_etl_executions_name ON etl_executions(etl_name);
CREATE INDEX idx_etl_executions_started ON etl_executions(started_at DESC);
CREATE INDEX idx_etl_executions_status ON etl_executions(status);
CREATE INDEX idx_etl_executions_name_started ON etl_executions(etl_name, started_at DESC);

-- Vista para detectar overlaps (ETLs que corren al mismo tiempo)
CREATE OR REPLACE VIEW v_etl_overlaps AS
SELECT
    e1.id as etl1_id,
    e1.etl_name as etl1_name,
    e1.started_at as etl1_started,
    e1.finished_at as etl1_finished,
    e2.id as etl2_id,
    e2.etl_name as etl2_name,
    e2.started_at as etl2_started,
    e2.finished_at as etl2_finished,
    -- Duracion del overlap en segundos
    EXTRACT(EPOCH FROM (LEAST(e1.finished_at, e2.finished_at) - GREATEST(e1.started_at, e2.started_at))) as overlap_seconds
FROM etl_executions e1
JOIN etl_executions e2 ON e1.id < e2.id  -- Evitar duplicados
WHERE e1.etl_name = e2.etl_name
  AND e1.started_at < e2.finished_at
  AND e2.started_at < e1.finished_at;

-- Vista resumen de ETLs ultimas 24 horas
CREATE OR REPLACE VIEW v_etl_summary_24h AS
SELECT
    etl_name,
    COUNT(*) as total_runs,
    COUNT(*) FILTER (WHERE status = 'success') as successful,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    ROUND(AVG(duration_seconds)::numeric, 2) as avg_duration_sec,
    MAX(duration_seconds) as max_duration_sec,
    MIN(duration_seconds) as min_duration_sec,
    SUM(records_loaded) as total_records,
    SUM(duplicates_skipped) as total_duplicates,
    MAX(finished_at) as last_run
FROM etl_executions
WHERE started_at > NOW() - INTERVAL '24 hours'
GROUP BY etl_name
ORDER BY etl_name;

COMMENT ON TABLE etl_executions IS 'Tracking de ejecuciones de ETL para monitoreo y debugging';
