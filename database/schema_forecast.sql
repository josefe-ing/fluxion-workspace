-- ============================================
-- SCHEMA: Forecast de Ventas
-- ============================================
-- Tabla para almacenar predicciones de ventas
-- usando diferentes modelos (PMP, ETS, Prophet, etc.)

CREATE TABLE IF NOT EXISTS forecast_ventas (
    -- Identificadores
    forecast_id VARCHAR PRIMARY KEY,
    ubicacion_id VARCHAR NOT NULL,
    codigo_producto VARCHAR NOT NULL,

    -- Fecha del forecast
    fecha_forecast DATE NOT NULL,  -- Fecha para la cual se predice
    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Cuándo se calculó

    -- Modelo utilizado
    modelo VARCHAR NOT NULL,  -- 'PMP', 'ETS', 'ARIMA', 'PROPHET', 'ML'
    version_modelo VARCHAR,   -- Versión del modelo (e.g., 'v1.0')

    -- Predicciones
    forecast_unidades DECIMAL(12,2),  -- Unidades predichas
    forecast_bultos DECIMAL(12,2),    -- Bultos predichos

    -- Intervalo de confianza (opcional)
    forecast_min DECIMAL(12,2),  -- Límite inferior (80% confianza)
    forecast_max DECIMAL(12,2),  -- Límite superior (80% confianza)

    -- Parámetros del modelo PMP
    ventana_dias INTEGER,        -- Días usados para calcular (e.g., 56 = 8 semanas)
    peso_semana1 DECIMAL(5,2),   -- Peso última semana (e.g., 0.40)
    peso_semana2 DECIMAL(5,2),   -- Peso semana -2 (e.g., 0.30)
    peso_semana3 DECIMAL(5,2),   -- Peso semana -3 (e.g., 0.20)
    peso_semana4 DECIMAL(5,2),   -- Peso semana -4 (e.g., 0.10)

    -- Metadata
    venta_real DECIMAL(12,2),    -- Venta real (se llena después para validación)
    error_absoluto DECIMAL(12,2), -- |forecast - real|
    error_porcentual DECIMAL(5,2), -- MAPE = |forecast - real| / real * 100

    -- Contexto
    es_dia_especial BOOLEAN DEFAULT FALSE,  -- Quincena, fin de mes, etc.
    observaciones TEXT,

    -- Índices
    UNIQUE(ubicacion_id, codigo_producto, fecha_forecast, modelo)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_forecast_ubicacion_fecha
    ON forecast_ventas(ubicacion_id, fecha_forecast);

CREATE INDEX IF NOT EXISTS idx_forecast_producto_fecha
    ON forecast_ventas(codigo_producto, fecha_forecast);

CREATE INDEX IF NOT EXISTS idx_forecast_modelo
    ON forecast_ventas(modelo, fecha_calculo);

-- ============================================
-- TABLA: Parámetros de Forecast por Ubicación
-- ============================================
-- Permite configurar diferentes parámetros de forecast
-- para cada tienda según sus características

CREATE TABLE IF NOT EXISTS forecast_params (
    ubicacion_id VARCHAR PRIMARY KEY,

    -- Parámetros PMP
    pmp_ventana_dias INTEGER DEFAULT 56,  -- 8 semanas
    pmp_peso_semana1 DECIMAL(5,2) DEFAULT 0.40,
    pmp_peso_semana2 DECIMAL(5,2) DEFAULT 0.30,
    pmp_peso_semana3 DECIMAL(5,2) DEFAULT 0.20,
    pmp_peso_semana4 DECIMAL(5,2) DEFAULT 0.10,

    -- Ajustes
    ajuste_estacionalidad DECIMAL(5,2) DEFAULT 1.0,  -- Multiplicador estacional
    ajuste_tendencia DECIMAL(5,2) DEFAULT 1.0,       -- Multiplicador tendencia

    -- Metadata
    modelo_default VARCHAR DEFAULT 'PMP',
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT
);

-- Insertar parámetros default para tiendas principales
INSERT INTO forecast_params (ubicacion_id, modelo_default)
SELECT ubicacion_id, 'PMP' as modelo_default
FROM (VALUES
    ('tienda_01'),
    ('tienda_02'),
    ('tienda_03'),
    ('tienda_04'),
    ('tienda_05'),
    ('tienda_06'),
    ('tienda_07'),
    ('tienda_08'),
    ('tienda_09'),
    ('tienda_10')
) AS t(ubicacion_id)
WHERE NOT EXISTS (
    SELECT 1 FROM forecast_params WHERE forecast_params.ubicacion_id = t.ubicacion_id
);

-- ============================================
-- VISTA: Forecast con Ventas Reales
-- ============================================
-- Combina forecast con ventas reales para análisis

CREATE OR REPLACE VIEW v_forecast_performance AS
SELECT
    f.forecast_id,
    f.ubicacion_id,
    ANY_VALUE(v.ubicacion_nombre) as ubicacion_nombre,
    f.codigo_producto,
    ANY_VALUE(v.descripcion_producto) as descripcion_producto,
    f.fecha_forecast,
    f.modelo,
    f.forecast_unidades,
    f.forecast_bultos,
    SUM(CAST(v.cantidad_vendida AS DECIMAL)) as venta_real_unidades,
    ABS(f.forecast_unidades - SUM(CAST(v.cantidad_vendida AS DECIMAL))) as error_absoluto,
    ABS(f.forecast_unidades - SUM(CAST(v.cantidad_vendida AS DECIMAL))) /
        NULLIF(SUM(CAST(v.cantidad_vendida AS DECIMAL)), 0) * 100 as mape
FROM forecast_ventas f
LEFT JOIN ventas_raw v
    ON f.ubicacion_id = v.ubicacion_id
    AND f.codigo_producto = v.codigo_producto
    AND CAST(v.fecha AS DATE) = f.fecha_forecast
GROUP BY
    f.forecast_id,
    f.ubicacion_id,
    f.codigo_producto,
    f.fecha_forecast,
    f.modelo,
    f.forecast_unidades,
    f.forecast_bultos;
