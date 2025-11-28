-- =====================================================================================
-- DASHBOARD ABC V2 - VISTAS Y QUERIES PARA VISUALIZACIÓN
-- =====================================================================================
-- Vistas optimizadas para dashboards de BI, reportes ejecutivos y análisis operativo
-- =====================================================================================

-- =====================================================================================
-- VISTA 1: DASHBOARD EJECUTIVO - KPIs PRINCIPALES
-- =====================================================================================

CREATE OR REPLACE VIEW v_dashboard_abc_kpis AS
WITH totales AS (
    SELECT
        COUNT(*) as total_productos,
        SUM(valor_consumo_total) as valor_total,
        SUM(unidades_vendidas_total) as unidades_totales,
        SUM(margen_total) as margen_total
    FROM productos_abc_v2
    WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
),
por_clase AS (
    SELECT
        clasificacion_abc_valor,
        COUNT(*) as productos,
        SUM(valor_consumo_total) as valor,
        SUM(porcentaje_valor) as porcentaje_valor
    FROM productos_abc_v2
    WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
    GROUP BY clasificacion_abc_valor
),
clase_a AS (
    SELECT * FROM por_clase WHERE clasificacion_abc_valor = 'A'
),
clase_b AS (
    SELECT * FROM por_clase WHERE clasificacion_abc_valor = 'B'
),
clase_c AS (
    SELECT * FROM por_clase WHERE clasificacion_abc_valor = 'C'
)
SELECT
    -- KPIs Generales
    t.total_productos,
    ROUND(t.valor_total, 2) as valor_total_consumo,
    ROUND(t.unidades_totales, 2) as unidades_totales,
    ROUND(t.margen_total, 2) as margen_total,

    -- Clase A
    a.productos as productos_clase_a,
    ROUND(a.productos * 100.0 / t.total_productos, 2) as porcentaje_productos_a,
    ROUND(a.valor, 2) as valor_clase_a,
    ROUND(a.porcentaje_valor, 2) as porcentaje_valor_a,

    -- Clase B
    b.productos as productos_clase_b,
    ROUND(b.productos * 100.0 / t.total_productos, 2) as porcentaje_productos_b,
    ROUND(b.valor, 2) as valor_clase_b,
    ROUND(b.porcentaje_valor, 2) as porcentaje_valor_b,

    -- Clase C
    c.productos as productos_clase_c,
    ROUND(c.productos * 100.0 / t.total_productos, 2) as porcentaje_productos_c,
    ROUND(c.valor, 2) as valor_clase_c,
    ROUND(c.porcentaje_valor, 2) as porcentaje_valor_c,

    -- Métricas de Pareto
    CASE
        WHEN a.porcentaje_valor >= 75 AND a.productos * 100.0 / t.total_productos <= 30
            THEN 'Sí'
        ELSE 'No'
    END as cumple_pareto,

    -- Fecha del cálculo
    (SELECT MAX(fecha_calculo) FROM productos_abc_v2) as fecha_ultimo_calculo,
    (SELECT fecha_inicio FROM productos_abc_v2 LIMIT 1) as periodo_desde,
    (SELECT fecha_fin FROM productos_abc_v2 LIMIT 1) as periodo_hasta

FROM totales t
CROSS JOIN clase_a a
CROSS JOIN clase_b b
CROSS JOIN clase_c c;

-- =====================================================================================
-- VISTA 2: TOP 20 PRODUCTOS POR VALOR (DASHBOARD PRINCIPAL)
-- =====================================================================================

CREATE OR REPLACE VIEW v_dashboard_top20_productos AS
SELECT
    abc.ranking_valor,
    p.codigo,
    p.descripcion,
    p.categoria,
    p.marca,
    abc.clasificacion_abc_valor as clase,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    ROUND(abc.unidades_vendidas_total, 2) as unidades_vendidas,
    ROUND(abc.porcentaje_valor, 4) as porcentaje_valor,
    ROUND(abc.porcentaje_acumulado, 2) as porcentaje_acumulado,
    abc.numero_ubicaciones as tiendas_activas,
    ROUND(abc.margen_total, 2) as margen_bruto,
    ROUND((abc.margen_total / NULLIF(abc.valor_venta_total, 0)) * 100, 2) as margen_porcentual,
    ROUND(abc.costo_promedio_ponderado, 4) as costo_promedio,

    -- Indicadores visuales
    CASE
        WHEN abc.concentracion_geografica > 80 THEN '⚠ Muy concentrado'
        WHEN abc.concentracion_geografica > 60 THEN '⚡ Concentrado'
        ELSE '✓ Distribuido'
    END as distribucion_geografica,

    CASE
        WHEN abc.cambio_ranking IS NOT NULL AND abc.cambio_ranking < 0 THEN CONCAT('↑ ', ABS(abc.cambio_ranking))
        WHEN abc.cambio_ranking IS NOT NULL AND abc.cambio_ranking > 0 THEN CONCAT('↓ ', abc.cambio_ranking)
        ELSE '→ Sin cambio'
    END as tendencia_ranking

FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
ORDER BY abc.ranking_valor
LIMIT 20;

-- =====================================================================================
-- VISTA 3: RESUMEN POR CATEGORÍA (ANÁLISIS MULTI-DIMENSIONAL)
-- =====================================================================================

CREATE OR REPLACE VIEW v_dashboard_abc_por_categoria AS
SELECT
    p.categoria,

    -- Totales por categoría
    COUNT(*) as total_productos,
    ROUND(SUM(abc.valor_consumo_total), 2) as valor_total,
    ROUND(AVG(abc.valor_consumo_total), 2) as valor_promedio,

    -- Clase A
    COUNT(CASE WHEN abc.clasificacion_abc_valor = 'A' THEN 1 END) as productos_a,
    ROUND(SUM(CASE WHEN abc.clasificacion_abc_valor = 'A' THEN abc.valor_consumo_total ELSE 0 END), 2) as valor_a,

    -- Clase B
    COUNT(CASE WHEN abc.clasificacion_abc_valor = 'B' THEN 1 END) as productos_b,
    ROUND(SUM(CASE WHEN abc.clasificacion_abc_valor = 'B' THEN abc.valor_consumo_total ELSE 0 END), 2) as valor_b,

    -- Clase C
    COUNT(CASE WHEN abc.clasificacion_abc_valor = 'C' THEN 1 END) as productos_c,
    ROUND(SUM(CASE WHEN abc.clasificacion_abc_valor = 'C' THEN abc.valor_consumo_total ELSE 0 END), 2) as valor_c,

    -- Concentración en la categoría
    ROUND(
        SUM(CASE WHEN abc.clasificacion_abc_valor = 'A' THEN abc.valor_consumo_total ELSE 0 END) * 100.0 /
        NULLIF(SUM(abc.valor_consumo_total), 0),
        2
    ) as concentracion_clase_a,

    -- Margen total
    ROUND(SUM(abc.margen_total), 2) as margen_total_categoria

FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    AND p.categoria IS NOT NULL
GROUP BY p.categoria
ORDER BY valor_total DESC;

-- =====================================================================================
-- VISTA 4: ALERTAS Y OPORTUNIDADES (ACTIONABLE INSIGHTS)
-- =====================================================================================

CREATE OR REPLACE VIEW v_dashboard_alertas_abc AS
-- Productos A con bajo margen (revisar precios)
SELECT
    'ALERTA_MARGEN_BAJO' as tipo_alerta,
    'Clase A con margen <15%' as descripcion,
    p.codigo,
    p.descripcion as producto,
    p.categoria,
    abc.clasificacion_abc_valor as clase,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    ROUND((abc.margen_total / NULLIF(abc.valor_venta_total, 0)) * 100, 2) as margen_pct,
    'Revisar estrategia de precios' as accion_recomendada,
    'ALTA' as prioridad
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor = 'A'
    AND (abc.margen_total / NULLIF(abc.valor_venta_total, 0)) < 0.15

UNION ALL

-- Productos A con alta concentración geográfica (riesgo)
SELECT
    'ALERTA_CONCENTRACION' as tipo_alerta,
    'Clase A muy concentrado geográficamente' as descripcion,
    p.codigo,
    p.descripcion,
    p.categoria,
    abc.clasificacion_abc_valor,
    ROUND(abc.valor_consumo_total, 2),
    ROUND(abc.concentracion_geografica, 2),
    'Diversificar ventas entre tiendas' as accion_recomendada,
    'MEDIA' as prioridad
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor = 'A'
    AND abc.concentracion_geografica > 80

UNION ALL

-- Productos con tendencia descendente rápida
SELECT
    'ALERTA_TENDENCIA_NEGATIVA' as tipo_alerta,
    'Caída rápida en ranking' as descripcion,
    p.codigo,
    p.descripcion,
    p.categoria,
    abc.clasificacion_abc_valor,
    ROUND(abc.valor_consumo_total, 2),
    abc.cambio_ranking,
    'Investigar causa de la caída' as accion_recomendada,
    'ALTA' as prioridad
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.cambio_ranking > 50  -- Cayó más de 50 posiciones
    AND abc.clasificacion_abc_valor IN ('A', 'B')

UNION ALL

-- Oportunidades: productos con tendencia ascendente
SELECT
    'OPORTUNIDAD_CRECIMIENTO' as tipo_alerta,
    'Crecimiento rápido - potencial A' as descripcion,
    p.codigo,
    p.descripcion,
    p.categoria,
    abc.clasificacion_abc_valor,
    ROUND(abc.valor_consumo_total, 2),
    abc.cambio_ranking,
    'Asegurar stock y disponibilidad' as accion_recomendada,
    'MEDIA' as prioridad
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.cambio_ranking < -30  -- Subió más de 30 posiciones
    AND abc.clasificacion_abc_valor IN ('B', 'C')

ORDER BY prioridad DESC, valor_consumo DESC
LIMIT 50;

-- =====================================================================================
-- VISTA 5: DISCREPANCIAS VELOCIDAD VS VALOR (INSIGHTS ESTRATÉGICOS)
-- =====================================================================================

CREATE OR REPLACE VIEW v_dashboard_discrepancias AS
SELECT
    p.codigo,
    p.descripcion,
    p.categoria,
    p.marca,
    p.abc_classification as clase_velocidad,
    abc.clasificacion_abc_valor as clase_valor,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    ROUND(abc.unidades_vendidas_total, 2) as unidades,
    ROUND(abc.costo_promedio_ponderado, 4) as costo_unitario,

    -- Tipo de discrepancia
    CASE
        WHEN p.abc_classification IN ('A', 'AB') AND abc.clasificacion_abc_valor = 'C'
            THEN 'Alta velocidad / Bajo valor'
        WHEN p.abc_classification IN ('C', 'BC') AND abc.clasificacion_abc_valor = 'A'
            THEN 'Baja velocidad / Alto valor'
        WHEN p.abc_classification = 'A' AND abc.clasificacion_abc_valor = 'B'
            THEN 'Velocidad A / Valor B'
        WHEN p.abc_classification = 'B' AND abc.clasificacion_abc_valor = 'A'
            THEN 'Velocidad B / Valor A'
        ELSE 'Otra discrepancia'
    END as tipo_discrepancia,

    -- Insight
    CASE
        WHEN p.abc_classification IN ('A', 'AB') AND abc.clasificacion_abc_valor = 'C'
            THEN 'Producto de alto volumen pero bajo valor unitario. Revisar si el margen compensa.'
        WHEN p.abc_classification IN ('C', 'BC') AND abc.clasificacion_abc_valor = 'A'
            THEN 'Producto de alto valor pero baja rotación. Optimizar stock y evitar quiebres.'
        ELSE 'Discrepancia moderada - revisar estrategia.'
    END as insight,

    abc.ranking_valor

FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    AND p.abc_classification IS NOT NULL
    AND (
        -- Discrepancias significativas
        (p.abc_classification IN ('A', 'AB') AND abc.clasificacion_abc_valor IN ('C'))
        OR (p.abc_classification IN ('C', 'BC') AND abc.clasificacion_abc_valor IN ('A'))
        OR (p.abc_classification = 'A' AND abc.clasificacion_abc_valor = 'B')
        OR (p.abc_classification = 'B' AND abc.clasificacion_abc_valor = 'A')
    )
ORDER BY abc.valor_consumo_total DESC;

-- =====================================================================================
-- VISTA 6: EVOLUCIÓN TEMPORAL (TRENDING PRODUCTS)
-- =====================================================================================

CREATE OR REPLACE VIEW v_dashboard_trending AS
SELECT
    p.codigo,
    p.descripcion,
    p.categoria,
    e.clasificacion_inicial,
    e.clasificacion_final,
    e.cambio_clasificacion,
    ROUND(e.cambio_valor_consumo, 2) as cambio_valor,
    ROUND(e.cambio_porcentual, 2) as cambio_porcentual,
    e.cambio_ranking,
    e.tipo_tendencia,
    e.velocidad_cambio,

    -- Indicador visual
    CASE
        WHEN e.tipo_tendencia = 'ascendente' AND e.velocidad_cambio = 'rapido'
            THEN '🚀 Crecimiento explosivo'
        WHEN e.tipo_tendencia = 'ascendente' AND e.velocidad_cambio = 'gradual'
            THEN '📈 Crecimiento sostenido'
        WHEN e.tipo_tendencia = 'descendente' AND e.velocidad_cambio = 'rapido'
            THEN '⚠️ Caída abrupta'
        WHEN e.tipo_tendencia = 'descendente' AND e.velocidad_cambio = 'gradual'
            THEN '📉 Declive gradual'
        WHEN e.tipo_tendencia = 'estable'
            THEN '➡️ Estable'
        ELSE '🔄 Volátil'
    END as indicador,

    -- Clasificación de importancia
    CASE
        WHEN e.clasificacion_final = 'A' OR e.clasificacion_inicial = 'A'
            THEN 'CRÍTICO'
        WHEN e.clasificacion_final = 'B' OR e.clasificacion_inicial = 'B'
            THEN 'IMPORTANTE'
        ELSE 'MONITOREAR'
    END as nivel_atencion

FROM productos_abc_v2_evolucion e
JOIN productos p ON e.producto_id = p.id
WHERE e.tipo_tendencia != 'estable'
    OR ABS(e.cambio_ranking) > 20
ORDER BY ABS(e.cambio_porcentual) DESC
LIMIT 100;

-- =====================================================================================
-- VISTA 7: CURVA DE PARETO (DATOS PARA GRÁFICO)
-- =====================================================================================

CREATE OR REPLACE VIEW v_dashboard_curva_pareto AS
SELECT
    abc.ranking_valor,
    p.codigo,
    p.descripcion,
    abc.clasificacion_abc_valor,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    ROUND(abc.porcentaje_valor, 4) as porcentaje_valor,
    ROUND(abc.porcentaje_acumulado, 2) as porcentaje_acumulado,

    -- Línea ideal 80/20
    CASE
        WHEN abc.ranking_valor * 100.0 / (SELECT COUNT(*) FROM productos_abc_v2 WHERE clasificacion_abc_valor IN ('A','B','C')) <= 20
            THEN 80.0
        ELSE NULL
    END as linea_pareto_ideal,

    -- Zonas de color para el gráfico
    CASE
        WHEN abc.porcentaje_acumulado <= 80 THEN 'verde'
        WHEN abc.porcentaje_acumulado <= 95 THEN 'amarillo'
        ELSE 'rojo'
    END as zona_abc

FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
ORDER BY abc.ranking_valor;

-- =====================================================================================
-- VISTA 8: MÉTRICAS DE CONCENTRACIÓN (PANEL DE CONTROL)
-- =====================================================================================

CREATE OR REPLACE VIEW v_dashboard_metricas_concentracion AS
WITH gini AS (
    SELECT * FROM v_metricas_concentracion
),
top_contribuidores AS (
    SELECT
        COUNT(CASE WHEN porcentaje_acumulado <= 50 THEN 1 END) as productos_50_pct,
        COUNT(CASE WHEN porcentaje_acumulado <= 80 THEN 1 END) as productos_80_pct
    FROM productos_abc_v2
    WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
)
SELECT
    -- Índices de concentración
    g.indice_gini,
    g.indice_hhi,
    g.interpretacion_gini,
    g.interpretacion_hhi,

    -- Número de productos
    g.total_productos,
    t.productos_50_pct,
    t.productos_80_pct,

    -- Porcentajes
    ROUND(t.productos_50_pct * 100.0 / g.total_productos, 2) as pct_productos_50_valor,
    ROUND(t.productos_80_pct * 100.0 / g.total_productos, 2) as pct_productos_80_valor,

    -- Estado del Pareto
    CASE
        WHEN t.productos_80_pct * 100.0 / g.total_productos <= 25 THEN '✓ Pareto fuerte'
        WHEN t.productos_80_pct * 100.0 / g.total_productos <= 35 THEN '✓ Pareto moderado'
        ELSE '⚠ Distribución dispersa'
    END as estado_pareto,

    g.fecha_calculo

FROM gini g
CROSS JOIN top_contribuidores t;

-- =====================================================================================
-- QUERY: REPORTE EJECUTIVO COMPLETO
-- =====================================================================================

-- Query para reporte ejecutivo en una sola vista
CREATE OR REPLACE VIEW v_reporte_ejecutivo_abc_v2 AS
SELECT
    'KPIs Principales' as seccion,
    'Total productos analizados' as metrica,
    total_productos::VARCHAR as valor,
    NULL as porcentaje,
    NULL as interpretacion
FROM v_dashboard_abc_kpis

UNION ALL

SELECT
    'KPIs Principales',
    'Valor total de consumo',
    TO_CHAR(valor_total_consumo, 'FM999,999,999,990.00') as valor,
    NULL,
    NULL
FROM v_dashboard_abc_kpis

UNION ALL

SELECT
    'Clase A (Alta prioridad)',
    'Productos clase A',
    productos_clase_a::VARCHAR,
    CONCAT(porcentaje_productos_a::VARCHAR, '%'),
    CONCAT('Generan ', porcentaje_valor_a::VARCHAR, '% del valor')
FROM v_dashboard_abc_kpis

UNION ALL

SELECT
    'Clase B (Prioridad media)',
    'Productos clase B',
    productos_clase_b::VARCHAR,
    CONCAT(porcentaje_productos_b::VARCHAR, '%'),
    CONCAT('Generan ', porcentaje_valor_b::VARCHAR, '% del valor')
FROM v_dashboard_abc_kpis

UNION ALL

SELECT
    'Clase C (Baja prioridad)',
    'Productos clase C',
    productos_clase_c::VARCHAR,
    CONCAT(porcentaje_productos_c::VARCHAR, '%'),
    CONCAT('Generan ', porcentaje_valor_c::VARCHAR, '% del valor')
FROM v_dashboard_abc_kpis

UNION ALL

SELECT
    'Principio de Pareto',
    '¿Cumple regla 80/20?',
    cumple_pareto,
    NULL,
    CASE
        WHEN cumple_pareto = 'Sí' THEN '✓ La distribución sigue el principio de Pareto'
        ELSE '⚠ Distribución más dispersa de lo esperado'
    END
FROM v_dashboard_abc_kpis

UNION ALL

SELECT
    'Concentración',
    'Índice de Gini',
    indice_gini::VARCHAR,
    NULL,
    interpretacion_gini
FROM v_dashboard_metricas_concentracion

UNION ALL

SELECT
    'Periodo de análisis',
    'Desde - Hasta',
    CONCAT(periodo_desde::VARCHAR, ' a ', periodo_hasta::VARCHAR),
    NULL,
    NULL
FROM v_dashboard_abc_kpis;

-- =====================================================================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- =====================================================================================

COMMENT ON VIEW v_dashboard_abc_kpis IS
'Vista principal de KPIs para dashboard ejecutivo. Muestra resumen de clasificación ABC v2.';

COMMENT ON VIEW v_dashboard_top20_productos IS
'TOP 20 productos por valor de consumo con métricas clave y tendencias.';

COMMENT ON VIEW v_dashboard_abc_por_categoria IS
'Distribución ABC por categoría de productos para análisis multi-dimensional.';

COMMENT ON VIEW v_dashboard_alertas_abc IS
'Alertas y oportunidades accionables basadas en clasificación ABC v2.';

COMMENT ON VIEW v_dashboard_discrepancias IS
'Productos con discrepancia entre clasificación por velocidad y por valor.';

COMMENT ON VIEW v_dashboard_trending IS
'Productos con cambios significativos en clasificación (trending up/down).';

COMMENT ON VIEW v_dashboard_curva_pareto IS
'Datos para graficar la curva de Pareto y visualizar distribución 80/20.';

COMMENT ON VIEW v_dashboard_metricas_concentracion IS
'Métricas de concentración (Gini, HHI) y análisis de distribución del valor.';
