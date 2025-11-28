-- =====================================================================================
-- CÁLCULO DEL ÍNDICE DE GINI PARA CONCENTRACIÓN DEL VALOR
-- =====================================================================================
-- El índice de Gini mide la desigualdad en la distribución del valor entre productos.
-- Rango: 0 (igualdad perfecta) a 1 (desigualdad máxima)
-- En ABC, valores altos de Gini (>0.7) indican alta concentración (pocas SKUs generan la mayoría del valor)
-- =====================================================================================

-- =====================================================================================
-- MÉTODO 1: ÍNDICE DE GINI USANDO FÓRMULA DIRECTA
-- =====================================================================================

WITH productos_ordenados AS (
    -- Ordenar productos por valor de consumo ascendente
    SELECT
        producto_id,
        valor_consumo_total,
        ROW_NUMBER() OVER (ORDER BY valor_consumo_total ASC) as ranking,
        COUNT(*) OVER () as total_productos,
        SUM(valor_consumo_total) OVER () as valor_total
    FROM productos_abc_v2
    WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
        AND valor_consumo_total > 0
),
acumulados AS (
    -- Calcular valores acumulados
    SELECT
        ranking,
        valor_consumo_total,
        total_productos,
        valor_total,
        -- Proporción acumulada de productos (eje X de Lorenz)
        ranking * 1.0 / total_productos as proporcion_productos,
        -- Proporción acumulada de valor (eje Y de Lorenz)
        SUM(valor_consumo_total) OVER (ORDER BY ranking) * 1.0 / valor_total as proporcion_valor_acumulada
    FROM productos_ordenados
),
areas AS (
    -- Calcular área bajo la curva de Lorenz usando método trapezoidal
    SELECT
        ranking,
        proporcion_productos,
        proporcion_valor_acumulada,
        -- Área del trapecio
        CASE
            WHEN ranking > 1 THEN
                (proporcion_valor_acumulada + LAG(proporcion_valor_acumulada) OVER (ORDER BY ranking)) / 2.0
                * (proporcion_productos - LAG(proporcion_productos) OVER (ORDER BY ranking))
            ELSE 0
        END as area_trapecio
    FROM acumulados
)
SELECT
    'Índice de Gini' as metrica,
    ROUND(1 - 2 * SUM(area_trapecio), 4) as valor,
    CASE
        WHEN (1 - 2 * SUM(area_trapecio)) >= 0.9 THEN 'Concentración extrema (>0.9)'
        WHEN (1 - 2 * SUM(area_trapecio)) >= 0.7 THEN 'Concentración muy alta (0.7-0.9)'
        WHEN (1 - 2 * SUM(area_trapecio)) >= 0.5 THEN 'Concentración alta (0.5-0.7)'
        WHEN (1 - 2 * SUM(area_trapecio)) >= 0.3 THEN 'Concentración moderada (0.3-0.5)'
        ELSE 'Distribución relativamente equitativa (<0.3)'
    END as interpretacion,
    COUNT(*) as productos_analizados
FROM areas;

-- =====================================================================================
-- MÉTODO 2: ÍNDICE DE GINI SIMPLIFICADO (FÓRMULA ALTERNATIVA)
-- =====================================================================================

WITH productos_ordenados AS (
    SELECT
        producto_id,
        valor_consumo_total,
        ROW_NUMBER() OVER (ORDER BY valor_consumo_total ASC) as i,
        COUNT(*) OVER () as n,
        SUM(valor_consumo_total) OVER () as suma_total
    FROM productos_abc_v2
    WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
        AND valor_consumo_total > 0
)
SELECT
    'Índice de Gini (método simplificado)' as metrica,
    ROUND(
        (2 * SUM(i * valor_consumo_total) / (MAX(n) * SUM(valor_consumo_total)))
        - ((MAX(n) + 1) / MAX(n)),
        4
    ) as valor_gini,
    MAX(n) as total_productos,
    ROUND(SUM(valor_consumo_total), 2) as valor_total_analizado
FROM productos_ordenados;

-- =====================================================================================
-- MÉTODO 3: CURVA DE LORENZ COMPLETA (PARA VISUALIZACIÓN)
-- =====================================================================================

WITH productos_ordenados AS (
    SELECT
        producto_id,
        valor_consumo_total,
        ROW_NUMBER() OVER (ORDER BY valor_consumo_total ASC) as ranking,
        COUNT(*) OVER () as total_productos
    FROM productos_abc_v2
    WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
        AND valor_consumo_total > 0
),
lorenz AS (
    SELECT
        ranking,
        total_productos,
        -- % acumulado de productos
        ROUND(ranking * 100.0 / total_productos, 2) as porcentaje_productos,
        -- % acumulado de valor
        ROUND(
            SUM(valor_consumo_total) OVER (ORDER BY ranking) * 100.0 /
            SUM(valor_consumo_total) OVER (),
            2
        ) as porcentaje_valor_acumulado,
        -- Línea de igualdad perfecta (45 grados)
        ROUND(ranking * 100.0 / total_productos, 2) as linea_igualdad
    FROM productos_ordenados
)
SELECT
    ranking,
    porcentaje_productos,
    porcentaje_valor_acumulado,
    linea_igualdad,
    -- Distancia de la línea de igualdad (brecha)
    ROUND(linea_igualdad - porcentaje_valor_acumulado, 2) as brecha
FROM lorenz
WHERE ranking % GREATEST(1, total_productos / 100) = 0  -- Muestreo cada 1% de productos
    OR ranking = total_productos  -- Incluir último punto
ORDER BY ranking;

-- =====================================================================================
-- MÉTODO 4: ÍNDICE DE GINI POR CATEGORÍA
-- =====================================================================================

WITH productos_por_categoria AS (
    SELECT
        p.categoria,
        abc.producto_id,
        abc.valor_consumo_total,
        ROW_NUMBER() OVER (PARTITION BY p.categoria ORDER BY abc.valor_consumo_total ASC) as i,
        COUNT(*) OVER (PARTITION BY p.categoria) as n
    FROM productos_abc_v2 abc
    JOIN productos p ON abc.producto_id = p.id
    WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
        AND abc.valor_consumo_total > 0
        AND p.categoria IS NOT NULL
)
SELECT
    categoria,
    ROUND(
        (2 * SUM(i * valor_consumo_total) / (MAX(n) * SUM(valor_consumo_total)))
        - ((MAX(n) + 1) / MAX(n)),
        4
    ) as indice_gini,
    MAX(n) as productos_en_categoria,
    ROUND(SUM(valor_consumo_total), 2) as valor_total_categoria,
    CASE
        WHEN (2 * SUM(i * valor_consumo_total) / (MAX(n) * SUM(valor_consumo_total))) - ((MAX(n) + 1) / MAX(n)) >= 0.7
            THEN 'Alta concentración'
        WHEN (2 * SUM(i * valor_consumo_total) / (MAX(n) * SUM(valor_consumo_total))) - ((MAX(n) + 1) / MAX(n)) >= 0.5
            THEN 'Concentración moderada'
        ELSE 'Distribución más equitativa'
    END as interpretacion
FROM productos_por_categoria
GROUP BY categoria
HAVING MAX(n) >= 5  -- Solo categorías con al menos 5 productos
ORDER BY indice_gini DESC;

-- =====================================================================================
-- MÉTODO 5: COEFICIENTE DE VARIACIÓN (MÉTRICA COMPLEMENTARIA)
-- =====================================================================================

WITH estadisticas AS (
    SELECT
        COUNT(*) as num_productos,
        AVG(valor_consumo_total) as media,
        STDDEV(valor_consumo_total) as desviacion_std,
        MIN(valor_consumo_total) as minimo,
        MAX(valor_consumo_total) as maximo,
        -- Percentiles
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_consumo_total) as p25,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY valor_consumo_total) as mediana,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_consumo_total) as p75,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY valor_consumo_total) as p90,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY valor_consumo_total) as p95,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY valor_consumo_total) as p99
    FROM productos_abc_v2
    WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
        AND valor_consumo_total > 0
)
SELECT
    'Estadísticas de concentración' as seccion,
    NULL as metrica,
    NULL as valor,
    NULL as interpretacion

UNION ALL

SELECT
    'Productos analizados',
    num_productos::VARCHAR,
    NULL,
    NULL
FROM estadisticas

UNION ALL

SELECT
    'Coeficiente de variación (CV)',
    ROUND(desviacion_std / NULLIF(media, 0), 4)::VARCHAR,
    desviacion_std::VARCHAR,
    CASE
        WHEN desviacion_std / NULLIF(media, 0) > 2 THEN 'Variabilidad muy alta'
        WHEN desviacion_std / NULLIF(media, 0) > 1 THEN 'Variabilidad alta'
        ELSE 'Variabilidad moderada'
    END
FROM estadisticas

UNION ALL

SELECT
    'Ratio P90/P10 (riqueza relativa)',
    ROUND(p90 / NULLIF(p25, 0), 2)::VARCHAR,
    NULL,
    CASE
        WHEN p90 / NULLIF(p25, 0) > 100 THEN 'Concentración extrema'
        WHEN p90 / NULLIF(p25, 0) > 50 THEN 'Concentración muy alta'
        WHEN p90 / NULLIF(p25, 0) > 20 THEN 'Concentración alta'
        ELSE 'Distribución más equitativa'
    END
FROM estadisticas

UNION ALL

SELECT
    'Ratio Máximo/Mediana',
    ROUND(maximo / NULLIF(mediana, 0), 2)::VARCHAR,
    NULL,
    NULL
FROM estadisticas;

-- =====================================================================================
-- MÉTODO 6: ÍNDICE DE HERFINDAHL-HIRSCHMAN (HHI)
-- =====================================================================================
-- El HHI mide la concentración del mercado. Complementa el análisis de Gini.
-- HHI = Σ(share_i^2) donde share_i es la participación en valor de cada producto
-- Rango: 0 (competencia perfecta) a 10000 (monopolio)

WITH market_shares AS (
    SELECT
        producto_id,
        valor_consumo_total,
        -- Participación de mercado (como porcentaje)
        (valor_consumo_total * 100.0 / SUM(valor_consumo_total) OVER ()) as market_share
    FROM productos_abc_v2
    WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
        AND valor_consumo_total > 0
)
SELECT
    'Índice de Herfindahl-Hirschman (HHI)' as metrica,
    ROUND(SUM(market_share * market_share), 2) as hhi_valor,
    CASE
        WHEN SUM(market_share * market_share) > 2500 THEN 'Mercado altamente concentrado (>2500)'
        WHEN SUM(market_share * market_share) > 1500 THEN 'Mercado moderadamente concentrado (1500-2500)'
        ELSE 'Mercado poco concentrado (<1500)'
    END as interpretacion,
    COUNT(*) as productos_analizados,
    -- Número de productos que representan el 50% del valor (N50)
    (
        SELECT COUNT(*)
        FROM (
            SELECT
                valor_consumo_total,
                SUM(valor_consumo_total) OVER (ORDER BY valor_consumo_total DESC) * 100.0 /
                SUM(valor_consumo_total) OVER () as porcentaje_acumulado
            FROM productos_abc_v2
            WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
                AND valor_consumo_total > 0
        ) sub
        WHERE porcentaje_acumulado <= 50
    ) as n50_productos_50_pct_valor
FROM market_shares;

-- =====================================================================================
-- VISTA CONSOLIDADA: MÉTRICAS DE CONCENTRACIÓN
-- =====================================================================================

CREATE OR REPLACE VIEW v_metricas_concentracion AS
WITH gini_calc AS (
    -- Calcular Gini
    SELECT
        producto_id,
        valor_consumo_total,
        ROW_NUMBER() OVER (ORDER BY valor_consumo_total ASC) as i,
        COUNT(*) OVER () as n
    FROM productos_abc_v2
    WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
        AND valor_consumo_total > 0
),
gini_result AS (
    SELECT
        ROUND(
            (2 * SUM(i * valor_consumo_total) / (MAX(n) * SUM(valor_consumo_total)))
            - ((MAX(n) + 1) / MAX(n)),
            4
        ) as indice_gini,
        MAX(n) as total_productos
    FROM gini_calc
),
hhi_calc AS (
    -- Calcular HHI
    SELECT
        ROUND(
            SUM(
                POWER(valor_consumo_total * 100.0 / SUM(valor_consumo_total) OVER (), 2)
            ),
            2
        ) as hhi
    FROM productos_abc_v2
    WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
        AND valor_consumo_total > 0
),
percentiles AS (
    -- Calcular percentiles
    SELECT
        PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY porcentaje_acumulado) as productos_80_pct
    FROM productos_abc_v2
    WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
)
SELECT
    g.indice_gini,
    h.hhi as indice_hhi,
    g.total_productos,
    ROUND(p.productos_80_pct, 2) as porcentaje_productos_80_valor,
    -- Interpretaciones
    CASE
        WHEN g.indice_gini >= 0.7 THEN 'Alta concentración'
        WHEN g.indice_gini >= 0.5 THEN 'Concentración moderada'
        ELSE 'Distribución más equitativa'
    END as interpretacion_gini,
    CASE
        WHEN h.hhi > 2500 THEN 'Mercado altamente concentrado'
        WHEN h.hhi > 1500 THEN 'Mercado moderadamente concentrado'
        ELSE 'Mercado poco concentrado'
    END as interpretacion_hhi,
    CURRENT_TIMESTAMP as fecha_calculo
FROM gini_result g
CROSS JOIN hhi_calc h
CROSS JOIN percentiles p;

-- =====================================================================================
-- REPORTE EJECUTIVO: CONCENTRACIÓN DEL VALOR
-- =====================================================================================

SELECT
    '=== ANÁLISIS DE CONCENTRACIÓN DEL VALOR ===' as reporte,
    NULL as metrica,
    NULL as valor,
    NULL as interpretacion

UNION ALL

SELECT
    'Índice de Gini',
    indice_gini::VARCHAR,
    NULL,
    interpretacion_gini
FROM v_metricas_concentracion

UNION ALL

SELECT
    'Índice HHI',
    indice_hhi::VARCHAR,
    NULL,
    interpretacion_hhi
FROM v_metricas_concentracion

UNION ALL

SELECT
    'Productos analizados',
    total_productos::VARCHAR,
    NULL,
    NULL
FROM v_metricas_concentracion

UNION ALL

SELECT
    'Productos que generan 80% del valor',
    CONCAT(porcentaje_productos_80_valor, '%'),
    NULL,
    CASE
        WHEN porcentaje_productos_80_valor < 20 THEN 'Cumple Pareto estricto'
        WHEN porcentaje_productos_80_valor < 30 THEN 'Cercano a Pareto'
        ELSE 'Distribución más dispersa'
    END
FROM v_metricas_concentracion;
