-- Schema para tracking de ejecuciones de ETL KLK
-- Permite monitorear fallos y recuperar gaps automáticamente

-- Drop existing table if exists to recreate with proper sequence
DROP TABLE IF EXISTS etl_ejecuciones;
DROP SEQUENCE IF EXISTS etl_ejecuciones_id_seq;

-- Create sequence for auto-incrementing IDs
CREATE SEQUENCE etl_ejecuciones_id_seq START 1;

CREATE TABLE etl_ejecuciones (
    id INTEGER PRIMARY KEY DEFAULT nextval('etl_ejecuciones_id_seq'),
    etl_tipo VARCHAR NOT NULL,              -- 'inventario' o 'ventas'
    ubicacion_id VARCHAR NOT NULL,          -- ej: 'tienda_01'
    ubicacion_nombre VARCHAR NOT NULL,      -- ej: 'PERIFERICO'

    -- Timestamps de la ejecución
    fecha_inicio TIMESTAMP NOT NULL,
    fecha_fin TIMESTAMP,
    duracion_segundos DOUBLE,

    -- Rango de datos procesados
    fecha_desde DATE NOT NULL,
    fecha_hasta DATE NOT NULL,
    hora_desde TIME,                        -- NULL para inventario, valor para ventas incrementales
    hora_hasta TIME,

    -- Resultado
    estado VARCHAR NOT NULL,                -- 'exitoso', 'fallido', 'parcial', 'en_proceso'
    registros_extraidos INTEGER DEFAULT 0,
    registros_cargados INTEGER DEFAULT 0,

    -- Detalles del error (si aplica)
    error_mensaje TEXT,
    error_tipo VARCHAR,                     -- 'timeout', 'conexion', 'api_error', 'db_error'

    -- Metadata
    modo VARCHAR,                           -- 'completo', 'incremental_30min', 'recuperacion'
    version_etl VARCHAR,
    host VARCHAR                            -- Hostname donde se ejecutó
);

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_etl_ejecuciones_tipo_ubicacion
    ON etl_ejecuciones(etl_tipo, ubicacion_id, fecha_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_etl_ejecuciones_estado
    ON etl_ejecuciones(estado, fecha_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_etl_ejecuciones_fecha
    ON etl_ejecuciones(fecha_desde, fecha_hasta);

-- Vista para últimas ejecuciones por tienda
CREATE OR REPLACE VIEW v_ultimas_ejecuciones AS
SELECT
    e.*,
    ROW_NUMBER() OVER (
        PARTITION BY etl_tipo, ubicacion_id
        ORDER BY fecha_inicio DESC
    ) as rn
FROM etl_ejecuciones e
QUALIFY rn <= 10;  -- Últimas 10 ejecuciones por tienda/tipo

-- Vista para gaps detectados (ejecuciones fallidas que necesitan recuperación)
CREATE OR REPLACE VIEW v_gaps_por_recuperar AS
WITH ejecuciones_fallidas AS (
    SELECT
        etl_tipo,
        ubicacion_id,
        ubicacion_nombre,
        fecha_desde,
        fecha_hasta,
        hora_desde,
        hora_hasta,
        fecha_inicio,
        error_tipo,
        error_mensaje
    FROM etl_ejecuciones
    WHERE estado = 'fallido'
        AND fecha_inicio >= CURRENT_DATE - INTERVAL '7 days'  -- Últimos 7 días
),
ejecuciones_exitosas AS (
    SELECT
        etl_tipo,
        ubicacion_id,
        fecha_desde,
        fecha_hasta,
        hora_desde,
        hora_hasta
    FROM etl_ejecuciones
    WHERE estado = 'exitoso'
)
SELECT DISTINCT
    f.etl_tipo,
    f.ubicacion_id,
    f.ubicacion_nombre,
    f.fecha_desde,
    f.fecha_hasta,
    f.hora_desde,
    f.hora_hasta,
    f.fecha_inicio as fecha_fallo,
    f.error_tipo,
    f.error_mensaje,
    -- Calcular tiempo desde el fallo
    EXTRACT(HOUR FROM (CURRENT_TIMESTAMP - f.fecha_inicio)) as horas_desde_fallo
FROM ejecuciones_fallidas f
LEFT JOIN ejecuciones_exitosas e ON (
    f.etl_tipo = e.etl_tipo
    AND f.ubicacion_id = e.ubicacion_id
    AND f.fecha_desde = e.fecha_desde
    AND f.fecha_hasta = e.fecha_hasta
    AND (f.hora_desde IS NULL OR f.hora_desde = e.hora_desde)
    AND (f.hora_hasta IS NULL OR f.hora_hasta = e.hora_hasta)
)
WHERE e.etl_tipo IS NULL  -- No existe ejecución exitosa para este rango
ORDER BY f.fecha_inicio DESC;

-- Vista para métricas de confiabilidad
CREATE OR REPLACE VIEW v_metricas_confiabilidad AS
SELECT
    etl_tipo,
    ubicacion_id,
    ubicacion_nombre,
    DATE_TRUNC('day', fecha_inicio) as fecha,
    COUNT(*) as total_ejecuciones,
    SUM(CASE WHEN estado = 'exitoso' THEN 1 ELSE 0 END) as ejecuciones_exitosas,
    SUM(CASE WHEN estado = 'fallido' THEN 1 ELSE 0 END) as ejecuciones_fallidas,
    ROUND(100.0 * SUM(CASE WHEN estado = 'exitoso' THEN 1 ELSE 0 END) / COUNT(*), 2) as tasa_exito_pct,
    AVG(duracion_segundos) as duracion_promedio_seg,
    SUM(registros_cargados) as total_registros_cargados
FROM etl_ejecuciones
WHERE fecha_inicio >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY etl_tipo, ubicacion_id, ubicacion_nombre, DATE_TRUNC('day', fecha_inicio)
ORDER BY fecha DESC, ubicacion_id;

-- Comentarios de la tabla
COMMENT ON TABLE etl_ejecuciones IS 'Registro histórico de todas las ejecuciones de ETL KLK para tracking y recuperación de fallos';
COMMENT ON COLUMN etl_ejecuciones.estado IS 'Estado de la ejecución: exitoso, fallido, parcial, en_proceso';
COMMENT ON COLUMN etl_ejecuciones.modo IS 'Modo de ejecución: completo, incremental_30min, recuperacion';
COMMENT ON VIEW v_gaps_por_recuperar IS 'Gaps detectados que requieren recuperación automática';
