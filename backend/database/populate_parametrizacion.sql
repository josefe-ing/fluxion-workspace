-- =====================================================
-- POBLACIÓN: Sistema de Parametrización de Productos
-- =====================================================
-- Fecha: 2025-10-03
-- Descripción: Puebla las tablas de parametrización con datos reales
-- =====================================================

-- =====================================================
-- PASO 1: Poblar productos_maestro desde inventario_raw
-- =====================================================

INSERT INTO productos_maestro (
    producto_id,
    codigo_producto,
    descripcion_producto,
    categoria_producto,
    unidad_medida,
    codigo_barras,
    unidades_por_bulto,
    activo,
    fecha_creacion,
    fecha_actualizacion
)
SELECT DISTINCT
    codigo_producto AS producto_id,
    codigo_producto,
    descripcion_producto,
    categoria_producto,
    unidad_medida,
    codigo_barras,
    CAST(COALESCE(unidades_bulto, 1) AS INTEGER) AS unidades_por_bulto,
    TRUE AS activo,
    CURRENT_TIMESTAMP AS fecha_creacion,
    CURRENT_TIMESTAMP AS fecha_actualizacion
FROM inventario_raw
WHERE codigo_producto IS NOT NULL
  AND TRIM(codigo_producto) != ''
  AND descripcion_producto IS NOT NULL
ON CONFLICT (producto_id) DO UPDATE SET
    descripcion_producto = EXCLUDED.descripcion_producto,
    categoria_producto = EXCLUDED.categoria_producto,
    unidad_medida = EXCLUDED.unidad_medida,
    codigo_barras = EXCLUDED.codigo_barras,
    unidades_por_bulto = EXCLUDED.unidades_por_bulto,
    fecha_actualizacion = CURRENT_TIMESTAMP;

-- =====================================================
-- PASO 2: Poblar parametros_clasificacion
-- =====================================================
-- Reglas de negocio según La Granja:
-- A:  venta_diaria_bultos >= 20
-- AB: venta_diaria_bultos >= 5 hasta 19.99
-- B:  venta_diaria_bultos >= 0.45 hasta 4.99
-- BC: venta_diaria_bultos >= 0.20 hasta 0.449
-- C:  venta_diaria_bultos >= 0.001 hasta 0.199
-- =====================================================

INSERT INTO parametros_clasificacion (
    parametro_id,
    clasificacion,
    variabilidad,
    venta_diaria_bultos_min,
    venta_diaria_bultos_max,
    dias_cobertura_min,
    dias_cobertura_seguridad,
    dias_cobertura_max,
    factor_seguridad,
    factor_estacionalidad,
    activo,
    notas
) VALUES
-- Clase A: Productos de alta rotación (>= 20 bultos/día)
(1, 'A', 'Baja', 20.0, 999999.99, 3, 5, 7, 1.0, 1.0, TRUE, 'Productos de altísima rotación - Reposición frecuente'),
(2, 'A', 'Media', 20.0, 999999.99, 5, 7, 10, 1.2, 1.1, TRUE, 'Productos de altísima rotación - Variabilidad moderada'),
(3, 'A', 'Alta', 20.0, 999999.99, 7, 10, 14, 1.5, 1.2, TRUE, 'Productos de altísima rotación - Alta variabilidad'),

-- Clase AB: Productos de rotación alta-media (5-19.99 bultos/día)
(4, 'AB', 'Baja', 5.0, 19.99, 7, 10, 14, 1.0, 1.0, TRUE, 'Productos de rotación alta-media - Demanda estable'),
(5, 'AB', 'Media', 5.0, 19.99, 10, 14, 21, 1.2, 1.1, TRUE, 'Productos de rotación alta-media - Variabilidad moderada'),
(6, 'AB', 'Alta', 5.0, 19.99, 14, 21, 30, 1.5, 1.2, TRUE, 'Productos de rotación alta-media - Alta variabilidad'),

-- Clase B: Productos de rotación media (0.45-4.99 bultos/día)
(7, 'B', 'Baja', 0.45, 4.99, 14, 21, 30, 1.0, 1.0, TRUE, 'Productos de rotación media - Demanda estable'),
(8, 'B', 'Media', 0.45, 4.99, 21, 30, 45, 1.2, 1.1, TRUE, 'Productos de rotación media - Variabilidad moderada'),
(9, 'B', 'Alta', 0.45, 4.99, 30, 45, 60, 1.5, 1.2, TRUE, 'Productos de rotación media - Alta variabilidad'),

-- Clase BC: Productos de rotación baja-media (0.20-0.449 bultos/día)
(10, 'BC', 'Baja', 0.20, 0.449, 30, 45, 60, 1.0, 1.0, TRUE, 'Productos de rotación baja-media - Demanda estable'),
(11, 'BC', 'Media', 0.20, 0.449, 45, 60, 90, 1.2, 1.1, TRUE, 'Productos de rotación baja-media - Variabilidad moderada'),
(12, 'BC', 'Alta', 0.20, 0.449, 60, 90, 120, 1.5, 1.2, TRUE, 'Productos de rotación baja-media - Alta variabilidad'),

-- Clase C: Productos de baja rotación (0.001-0.199 bultos/día)
(13, 'C', 'Baja', 0.001, 0.199, 60, 90, 120, 1.0, 1.0, TRUE, 'Productos de baja rotación - Casi no se venden'),
(14, 'C', 'Media', 0.001, 0.199, 90, 120, 180, 1.2, 1.1, TRUE, 'Productos de baja rotación - Variabilidad moderada'),
(15, 'C', 'Alta', 0.001, 0.199, 120, 180, 365, 1.5, 1.2, TRUE, 'Productos de baja rotación - Alta variabilidad')
ON CONFLICT (parametro_id) DO UPDATE SET
    venta_diaria_bultos_min = EXCLUDED.venta_diaria_bultos_min,
    venta_diaria_bultos_max = EXCLUDED.venta_diaria_bultos_max,
    dias_cobertura_min = EXCLUDED.dias_cobertura_min,
    dias_cobertura_seguridad = EXCLUDED.dias_cobertura_seguridad,
    dias_cobertura_max = EXCLUDED.dias_cobertura_max,
    factor_seguridad = EXCLUDED.factor_seguridad,
    factor_estacionalidad = EXCLUDED.factor_estacionalidad,
    notas = EXCLUDED.notas;

-- =====================================================
-- PASO 3: Calcular y poblar clasificacion_producto_tienda
-- =====================================================
-- Calcula la venta diaria en bultos para cada producto-tienda
-- basado en los últimos 90 días de ventas
-- =====================================================

-- Primero, crear una tabla temporal con las métricas calculadas
CREATE TEMP TABLE IF NOT EXISTS temp_metricas_ventas AS
SELECT
    v.ubicacion_id,
    v.codigo_producto AS producto_id,

    -- Período de análisis (últimos 90 días)
    DATE_TRUNC('day', MAX(v.fecha))::DATE AS fecha_fin_periodo,
    DATE_TRUNC('day', MAX(v.fecha) - INTERVAL '90 days')::DATE AS fecha_inicio_periodo,

    -- Métricas de ventas
    COUNT(DISTINCT v.fecha) AS dias_con_venta,
    90 - COUNT(DISTINCT v.fecha) AS dias_sin_venta,

    -- Venta total en período
    SUM(CAST(v.cantidad_vendida AS DECIMAL)) AS cantidad_total_vendida,

    -- Venta diaria promedio (total / 90 días)
    SUM(CAST(v.cantidad_vendida AS DECIMAL)) / 90.0 AS venta_diaria_unidades,

    -- Venta diaria en bultos (usando unidades_por_bulto de productos_maestro)
    (SUM(CAST(v.cantidad_vendida AS DECIMAL)) / 90.0) /
        COALESCE(NULLIF(pm.unidades_por_bulto, 0), 1) AS venta_diaria_bultos,

    -- Venta mensual en bultos
    (SUM(CAST(v.cantidad_vendida AS DECIMAL)) / 3.0) /
        COALESCE(NULLIF(pm.unidades_por_bulto, 0), 1) AS venta_mensual_bultos,

    -- Coeficiente de variación (para clasificación XYZ futura)
    CASE
        WHEN AVG(CAST(v.cantidad_vendida AS DECIMAL)) > 0
        THEN (STDDEV(CAST(v.cantidad_vendida AS DECIMAL)) /
              AVG(CAST(v.cantidad_vendida AS DECIMAL))) * 100
        ELSE 0
    END AS coeficiente_variacion

FROM ventas_raw v
INNER JOIN productos_maestro pm ON v.codigo_producto = pm.producto_id
WHERE v.fecha >= CURRENT_DATE - INTERVAL '90 days'
  AND v.codigo_producto IS NOT NULL
  AND CAST(v.cantidad_vendida AS DECIMAL) > 0
GROUP BY
    v.ubicacion_id,
    v.codigo_producto,
    pm.unidades_por_bulto;

-- Ahora insertar en clasificacion_producto_tienda con la clasificación calculada
INSERT INTO clasificacion_producto_tienda (
    clasificacion_id,
    ubicacion_id,
    producto_id,
    clasificacion,
    variabilidad,
    venta_diaria_bultos,
    venta_diaria_unidades,
    venta_mensual_bultos,
    coeficiente_variacion,
    fecha_inicio_periodo,
    fecha_fin_periodo,
    dias_con_venta,
    dias_sin_venta,
    fecha_calculo
)
SELECT
    ROW_NUMBER() OVER (ORDER BY ubicacion_id, producto_id) AS clasificacion_id,
    ubicacion_id,
    producto_id,

    -- Clasificación según reglas de negocio de La Granja
    CASE
        WHEN venta_diaria_bultos >= 20.0  THEN 'A'
        WHEN venta_diaria_bultos >= 5.0   THEN 'AB'
        WHEN venta_diaria_bultos >= 0.45  THEN 'B'
        WHEN venta_diaria_bultos >= 0.20  THEN 'BC'
        WHEN venta_diaria_bultos >= 0.001 THEN 'C'
        ELSE 'C'
    END AS clasificacion,

    -- Variabilidad según coeficiente de variación (CV%)
    CASE
        WHEN coeficiente_variacion <= 25 THEN 'Baja'
        WHEN coeficiente_variacion <= 50 THEN 'Media'
        ELSE 'Alta'
    END AS variabilidad,

    venta_diaria_bultos,
    venta_diaria_unidades,
    venta_mensual_bultos,
    coeficiente_variacion,
    fecha_inicio_periodo,
    fecha_fin_periodo,
    dias_con_venta,
    dias_sin_venta,
    CURRENT_TIMESTAMP AS fecha_calculo

FROM temp_metricas_ventas
ON CONFLICT (ubicacion_id, producto_id) DO UPDATE SET
    clasificacion = EXCLUDED.clasificacion,
    variabilidad = EXCLUDED.variabilidad,
    venta_diaria_bultos = EXCLUDED.venta_diaria_bultos,
    venta_diaria_unidades = EXCLUDED.venta_diaria_unidades,
    venta_mensual_bultos = EXCLUDED.venta_mensual_bultos,
    coeficiente_variacion = EXCLUDED.coeficiente_variacion,
    fecha_inicio_periodo = EXCLUDED.fecha_inicio_periodo,
    fecha_fin_periodo = EXCLUDED.fecha_fin_periodo,
    dias_con_venta = EXCLUDED.dias_con_venta,
    dias_sin_venta = EXCLUDED.dias_sin_venta,
    fecha_calculo = CURRENT_TIMESTAMP;

-- Limpiar tabla temporal
DROP TABLE IF EXISTS temp_metricas_ventas;

-- =====================================================
-- PASO 4: Poblar producto_ubicacion_config
-- =====================================================
-- Calcula los parámetros de stock (min, reorden, seguridad, max)
-- basándose en la clasificación y variabilidad
-- =====================================================

INSERT INTO producto_ubicacion_config (
    ubicacion_id,
    producto_id,
    clasificacion,
    variabilidad,
    stock_minimo,
    punto_reorden,
    stock_seguridad,
    stock_maximo,
    lead_time_dias,
    fecha_calculo
)
SELECT
    cpt.ubicacion_id,
    cpt.producto_id,
    cpt.clasificacion,
    cpt.variabilidad,

    -- Stock Mínimo = Venta Diaria × Días Cobertura Mínima
    CEIL(cpt.venta_diaria_unidades * pc.dias_cobertura_min) AS stock_minimo,

    -- Punto de Reorden = Venta Diaria × (Lead Time + Días Seguridad)
    CEIL(cpt.venta_diaria_unidades * (7 + pc.dias_cobertura_seguridad)) AS punto_reorden,

    -- Stock de Seguridad = Venta Diaria × Días Seguridad × Factor Seguridad
    CEIL(cpt.venta_diaria_unidades * pc.dias_cobertura_seguridad * pc.factor_seguridad) AS stock_seguridad,

    -- Stock Máximo = Venta Diaria × Días Cobertura Máxima × Factor Estacionalidad
    CEIL(cpt.venta_diaria_unidades * pc.dias_cobertura_max * pc.factor_estacionalidad) AS stock_maximo,

    7 AS lead_time_dias,  -- Lead time default de 7 días
    CURRENT_TIMESTAMP AS fecha_calculo

FROM clasificacion_producto_tienda cpt
INNER JOIN parametros_clasificacion pc
    ON cpt.clasificacion = pc.clasificacion
    AND cpt.variabilidad = pc.variabilidad
WHERE pc.activo = TRUE
  AND cpt.venta_diaria_unidades > 0
ON CONFLICT (ubicacion_id, producto_id) DO UPDATE SET
    clasificacion = EXCLUDED.clasificacion,
    variabilidad = EXCLUDED.variabilidad,
    stock_minimo = EXCLUDED.stock_minimo,
    punto_reorden = EXCLUDED.punto_reorden,
    stock_seguridad = EXCLUDED.stock_seguridad,
    stock_maximo = EXCLUDED.stock_maximo,
    lead_time_dias = EXCLUDED.lead_time_dias,
    fecha_calculo = CURRENT_TIMESTAMP;

-- =====================================================
-- FIN DE POBLACIÓN
-- =====================================================
