-- =====================================================================================
-- QUERIES DE ANÁLISIS PARA CLASIFICACIÓN ABC V2
-- =====================================================================================
-- Colección de queries útiles para analizar la clasificación ABC basada en valor.
-- Incluye análisis comparativo, distribución, evolución y anomalías.
-- =====================================================================================

-- =====================================================================================
-- 1. ANÁLISIS BÁSICO: DISTRIBUCIÓN POR CLASIFICACIÓN
-- =====================================================================================

-- Resumen general de la clasificación ABC v2
SELECT
    clasificacion_abc_valor,
    COUNT(*) as num_productos,
    ROUND(SUM(valor_consumo_total), 2) as valor_total,
    ROUND(AVG(valor_consumo_total), 2) as valor_promedio,
    ROUND(MIN(valor_consumo_total), 2) as valor_minimo,
    ROUND(MAX(valor_consumo_total), 2) as valor_maximo,
    ROUND(SUM(porcentaje_valor), 2) as porcentaje_valor_total,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as porcentaje_productos
FROM productos_abc_v2
GROUP BY clasificacion_abc_valor
ORDER BY
    CASE clasificacion_abc_valor
        WHEN 'A' THEN 1
        WHEN 'B' THEN 2
        WHEN 'C' THEN 3
        WHEN 'NUEVO' THEN 4
        WHEN 'SIN_MOVIMIENTO' THEN 5
        WHEN 'ERROR_COSTO' THEN 6
    END;

-- =====================================================================================
-- 2. VERIFICACIÓN PRINCIPIO DE PARETO
-- =====================================================================================

-- Verificar si realmente el 20% de productos genera el 80% del valor
WITH resumen AS (
    SELECT
        clasificacion_abc_valor,
        COUNT(*) as num_productos,
        SUM(valor_consumo_total) as valor_total,
        SUM(porcentaje_valor) as porcentaje_valor_total
    FROM productos_abc_v2
    WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
    GROUP BY clasificacion_abc_valor
),
totales AS (
    SELECT
        SUM(num_productos) as total_productos,
        SUM(valor_total) as total_valor
    FROM resumen
)
SELECT
    r.clasificacion_abc_valor,
    r.num_productos,
    ROUND(r.num_productos * 100.0 / t.total_productos, 2) as porcentaje_productos,
    ROUND(r.valor_total, 2) as valor_total,
    ROUND(r.porcentaje_valor_total, 2) as porcentaje_valor,
    -- Verificación de Pareto
    CASE
        WHEN r.clasificacion_abc_valor = 'A' THEN
            CASE
                WHEN r.num_productos * 100.0 / t.total_productos <= 30
                    AND r.porcentaje_valor_total >= 75 THEN '✓ Cumple Pareto'
                ELSE '✗ No cumple Pareto'
            END
        ELSE 'N/A'
    END as cumple_pareto
FROM resumen r
CROSS JOIN totales t
ORDER BY
    CASE r.clasificacion_abc_valor
        WHEN 'A' THEN 1
        WHEN 'B' THEN 2
        WHEN 'C' THEN 3
    END;

-- =====================================================================================
-- 3. ANÁLISIS COMPARATIVO: VELOCIDAD VS VALOR
-- =====================================================================================

-- Comparación entre clasificación por velocidad y por valor
SELECT
    COALESCE(p.abc_classification, 'SIN_CLASIFICACION') as clasificacion_velocidad,
    abc.clasificacion_abc_valor,
    COUNT(*) as num_productos,
    ROUND(SUM(abc.valor_consumo_total), 2) as valor_total,
    ROUND(AVG(abc.valor_consumo_total), 2) as valor_promedio,
    ROUND(SUM(abc.unidades_vendidas_total), 2) as unidades_totales
FROM productos_abc_v2 abc
LEFT JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
GROUP BY p.abc_classification, abc.clasificacion_abc_valor
ORDER BY
    CASE p.abc_classification
        WHEN 'A' THEN 1
        WHEN 'B' THEN 2
        WHEN 'C' THEN 3
        ELSE 4
    END,
    CASE abc.clasificacion_abc_valor
        WHEN 'A' THEN 1
        WHEN 'B' THEN 2
        WHEN 'C' THEN 3
    END;

-- Matriz de confusión velocidad vs valor
SELECT
    'Velocidad \\ Valor' as matriz,
    SUM(CASE WHEN abc.clasificacion_abc_valor = 'A' THEN 1 ELSE 0 END) as "A (Valor)",
    SUM(CASE WHEN abc.clasificacion_abc_valor = 'B' THEN 1 ELSE 0 END) as "B (Valor)",
    SUM(CASE WHEN abc.clasificacion_abc_valor = 'C' THEN 1 ELSE 0 END) as "C (Valor)"
FROM productos p
JOIN productos_abc_v2 abc ON p.id = abc.producto_id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    AND p.abc_classification = 'A'

UNION ALL

SELECT
    'A (Velocidad)' as matriz,
    SUM(CASE WHEN abc.clasificacion_abc_valor = 'A' THEN 1 ELSE 0 END),
    SUM(CASE WHEN abc.clasificacion_abc_valor = 'B' THEN 1 ELSE 0 END),
    SUM(CASE WHEN abc.clasificacion_abc_valor = 'C' THEN 1 ELSE 0 END)
FROM productos p
JOIN productos_abc_v2 abc ON p.id = abc.producto_id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    AND p.abc_classification = 'A'

UNION ALL

SELECT
    'B (Velocidad)' as matriz,
    SUM(CASE WHEN abc.clasificacion_abc_valor = 'A' THEN 1 ELSE 0 END),
    SUM(CASE WHEN abc.clasificacion_abc_valor = 'B' THEN 1 ELSE 0 END),
    SUM(CASE WHEN abc.clasificacion_abc_valor = 'C' THEN 1 ELSE 0 END)
FROM productos p
JOIN productos_abc_v2 abc ON p.id = abc.producto_id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    AND p.abc_classification = 'B'

UNION ALL

SELECT
    'C (Velocidad)' as matriz,
    SUM(CASE WHEN abc.clasificacion_abc_valor = 'A' THEN 1 ELSE 0 END),
    SUM(CASE WHEN abc.clasificacion_abc_valor = 'B' THEN 1 ELSE 0 END),
    SUM(CASE WHEN abc.clasificacion_abc_valor = 'C' THEN 1 ELSE 0 END)
FROM productos p
JOIN productos_abc_v2 abc ON p.id = abc.producto_id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    AND p.abc_classification = 'C';

-- =====================================================================================
-- 4. PRODUCTOS CON DISCREPANCIAS SIGNIFICATIVAS
-- =====================================================================================

-- Alta velocidad pero bajo valor (productos baratos de alto volumen)
SELECT
    p.codigo,
    p.descripcion,
    p.categoria,
    p.abc_classification as clasificacion_velocidad,
    abc.clasificacion_abc_valor,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    ROUND(abc.unidades_vendidas_total, 2) as unidades_vendidas,
    ROUND(abc.costo_promedio_ponderado, 4) as costo_promedio,
    abc.ranking_valor,
    'Alta velocidad, bajo valor' as tipo_discrepancia
FROM productos p
JOIN productos_abc_v2 abc ON p.id = abc.producto_id
WHERE p.abc_classification IN ('A', 'AB')
    AND abc.clasificacion_abc_valor = 'C'
ORDER BY abc.valor_consumo_total DESC
LIMIT 20;

-- Baja velocidad pero alto valor (productos caros de bajo volumen)
SELECT
    p.codigo,
    p.descripcion,
    p.categoria,
    p.abc_classification as clasificacion_velocidad,
    abc.clasificacion_abc_valor,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    ROUND(abc.unidades_vendidas_total, 2) as unidades_vendidas,
    ROUND(abc.costo_promedio_ponderado, 4) as costo_promedio,
    abc.ranking_valor,
    'Baja velocidad, alto valor' as tipo_discrepancia
FROM productos p
JOIN productos_abc_v2 abc ON p.id = abc.producto_id
WHERE p.abc_classification IN ('C', 'BC')
    AND abc.clasificacion_abc_valor = 'A'
ORDER BY abc.valor_consumo_total DESC
LIMIT 20;

-- =====================================================================================
-- 5. TOP PRODUCTOS POR VALOR
-- =====================================================================================

-- TOP 50 productos por valor de consumo
SELECT
    abc.ranking_valor,
    p.codigo,
    p.descripcion,
    p.categoria,
    p.marca,
    abc.clasificacion_abc_valor,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    ROUND(abc.unidades_vendidas_total, 2) as unidades,
    ROUND(abc.porcentaje_valor, 4) as porcentaje_valor,
    ROUND(abc.porcentaje_acumulado, 2) as porcentaje_acumulado,
    abc.numero_ubicaciones as tiendas,
    ROUND(abc.margen_total, 2) as margen_total
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
ORDER BY abc.ranking_valor
LIMIT 50;

-- TOP productos por categoría
SELECT
    p.categoria,
    p.codigo,
    p.descripcion,
    abc.clasificacion_abc_valor,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    abc.ranking_valor,
    ROW_NUMBER() OVER (PARTITION BY p.categoria ORDER BY abc.valor_consumo_total DESC) as ranking_categoria
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    AND p.categoria IS NOT NULL
QUALIFY ranking_categoria <= 5  -- TOP 5 por categoría
ORDER BY p.categoria, ranking_categoria;

-- =====================================================================================
-- 6. ANÁLISIS POR CATEGORÍA
-- =====================================================================================

-- Distribución de clasificación ABC por categoría
SELECT
    p.categoria,
    abc.clasificacion_abc_valor,
    COUNT(*) as num_productos,
    ROUND(SUM(abc.valor_consumo_total), 2) as valor_total,
    ROUND(AVG(abc.valor_consumo_total), 2) as valor_promedio
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    AND p.categoria IS NOT NULL
GROUP BY p.categoria, abc.clasificacion_abc_valor
ORDER BY p.categoria,
    CASE abc.clasificacion_abc_valor
        WHEN 'A' THEN 1
        WHEN 'B' THEN 2
        WHEN 'C' THEN 3
    END;

-- Categorías con mayor concentración de valor
SELECT
    p.categoria,
    COUNT(*) as total_productos,
    COUNT(CASE WHEN abc.clasificacion_abc_valor = 'A' THEN 1 END) as productos_a,
    ROUND(SUM(abc.valor_consumo_total), 2) as valor_total_categoria,
    ROUND(SUM(CASE WHEN abc.clasificacion_abc_valor = 'A' THEN abc.valor_consumo_total ELSE 0 END), 2) as valor_clase_a,
    ROUND(
        SUM(CASE WHEN abc.clasificacion_abc_valor = 'A' THEN abc.valor_consumo_total ELSE 0 END) * 100.0 /
        NULLIF(SUM(abc.valor_consumo_total), 0),
        2
    ) as porcentaje_concentracion_a
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    AND p.categoria IS NOT NULL
GROUP BY p.categoria
HAVING SUM(abc.valor_consumo_total) > 0
ORDER BY valor_total_categoria DESC;

-- =====================================================================================
-- 7. ANÁLISIS DE EVOLUCIÓN TEMPORAL
-- =====================================================================================

-- Productos que cambiaron de clasificación
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
    e.velocidad_cambio
FROM productos_abc_v2_evolucion e
JOIN productos p ON e.producto_id = p.id
WHERE e.clasificacion_inicial != e.clasificacion_final
ORDER BY ABS(e.cambio_porcentual) DESC
LIMIT 50;

-- Productos con tendencia ascendente (mayor potencial)
SELECT
    p.codigo,
    p.descripcion,
    p.categoria,
    abc.clasificacion_abc_valor as clasificacion_actual,
    e.clasificacion_inicial,
    ROUND(e.cambio_valor_consumo, 2) as incremento_valor,
    ROUND(e.cambio_porcentual, 2) as porcentaje_crecimiento,
    e.velocidad_cambio
FROM productos_abc_v2_evolucion e
JOIN productos p ON e.producto_id = p.id
JOIN productos_abc_v2 abc ON e.producto_id = abc.producto_id
WHERE e.tipo_tendencia = 'ascendente'
    AND e.velocidad_cambio IN ('rapido', 'gradual')
ORDER BY e.cambio_porcentual DESC
LIMIT 30;

-- Productos con tendencia descendente (posible alerta)
SELECT
    p.codigo,
    p.descripcion,
    p.categoria,
    abc.clasificacion_abc_valor as clasificacion_actual,
    e.clasificacion_inicial,
    ROUND(e.cambio_valor_consumo, 2) as decremento_valor,
    ROUND(e.cambio_porcentual, 2) as porcentaje_decrecimiento,
    e.velocidad_cambio
FROM productos_abc_v2_evolucion e
JOIN productos p ON e.producto_id = p.id
JOIN productos_abc_v2 abc ON e.producto_id = abc.producto_id
WHERE e.tipo_tendencia = 'descendente'
    AND e.velocidad_cambio IN ('rapido', 'gradual')
ORDER BY e.cambio_porcentual ASC
LIMIT 30;

-- =====================================================================================
-- 8. ANÁLISIS DE CONCENTRACIÓN
-- =====================================================================================

-- Productos con alta concentración geográfica (vendidos principalmente en pocas tiendas)
SELECT
    p.codigo,
    p.descripcion,
    p.categoria,
    abc.clasificacion_abc_valor,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    abc.numero_ubicaciones as num_tiendas,
    ROUND(abc.concentracion_geografica, 2) as concentracion_top_tienda,
    CASE
        WHEN abc.concentracion_geografica > 80 THEN 'Muy alta (>80%)'
        WHEN abc.concentracion_geografica > 60 THEN 'Alta (60-80%)'
        WHEN abc.concentracion_geografica > 40 THEN 'Media (40-60%)'
        ELSE 'Distribuida (<40%)'
    END as nivel_concentracion
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    AND abc.concentracion_geografica IS NOT NULL
ORDER BY abc.concentracion_geografica DESC
LIMIT 50;

-- =====================================================================================
-- 9. PRODUCTOS CON ALERTAS O PROBLEMAS
-- =====================================================================================

-- Productos sin costo válido (ERROR_COSTO)
SELECT
    p.codigo,
    p.descripcion,
    p.categoria,
    abc.unidades_vendidas_total,
    abc.valor_venta_total,
    abc.observaciones
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor = 'ERROR_COSTO'
ORDER BY abc.unidades_vendidas_total DESC
LIMIT 50;

-- Productos nuevos con potencial
SELECT
    p.codigo,
    p.descripcion,
    p.categoria,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    ROUND(abc.unidades_vendidas_total, 2) as unidades_vendidas,
    abc.numero_ubicaciones as num_tiendas,
    DATE_DIFF('day', abc.fecha_inicio, abc.fecha_fin) as dias_en_periodo
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor = 'NUEVO'
    AND abc.valor_consumo_total > 0
ORDER BY abc.valor_consumo_total DESC
LIMIT 30;

-- =====================================================================================
-- 10. ANÁLISIS DE MARGEN
-- =====================================================================================

-- Productos clase A con mejor margen (más rentables)
SELECT
    abc.ranking_valor,
    p.codigo,
    p.descripcion,
    p.categoria,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    ROUND(abc.valor_venta_total, 2) as valor_venta,
    ROUND(abc.margen_total, 2) as margen_total,
    ROUND(
        (abc.margen_total / NULLIF(abc.valor_venta_total, 0)) * 100,
        2
    ) as porcentaje_margen
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor = 'A'
    AND abc.margen_total > 0
ORDER BY abc.margen_total DESC
LIMIT 30;

-- Productos clase A con bajo margen (revisar precios)
SELECT
    abc.ranking_valor,
    p.codigo,
    p.descripcion,
    p.categoria,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    ROUND(abc.valor_venta_total, 2) as valor_venta,
    ROUND(abc.margen_total, 2) as margen_total,
    ROUND(
        (abc.margen_total / NULLIF(abc.valor_venta_total, 0)) * 100,
        2
    ) as porcentaje_margen
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor = 'A'
    AND abc.valor_venta_total > 0
ORDER BY porcentaje_margen ASC
LIMIT 30;

-- =====================================================================================
-- 11. CURVA DE PARETO (VISUALIZACIÓN)
-- =====================================================================================

-- Datos para graficar la curva de Pareto
SELECT
    abc.ranking_valor,
    p.codigo,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    ROUND(abc.porcentaje_valor, 4) as porcentaje_valor,
    ROUND(abc.porcentaje_acumulado, 2) as porcentaje_acumulado,
    abc.clasificacion_abc_valor,
    -- Línea teórica del 80/20
    CASE
        WHEN abc.ranking_valor * 100.0 / (SELECT COUNT(*) FROM productos_abc_v2 WHERE clasificacion_abc_valor IN ('A','B','C')) <= 20 THEN 80.0
        ELSE NULL
    END as linea_teorica_80_20
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
ORDER BY abc.ranking_valor;

-- =====================================================================================
-- 12. EXPORT PARA ANÁLISIS EXTERNO
-- =====================================================================================

-- Vista completa para export a CSV/Excel
SELECT
    abc.ranking_valor,
    p.codigo,
    p.descripcion,
    p.categoria,
    p.subcategoria,
    p.marca,
    p.abc_classification as clasificacion_velocidad,
    abc.clasificacion_abc_valor,
    ROUND(abc.unidades_vendidas_total, 2) as unidades_vendidas,
    abc.numero_transacciones,
    abc.numero_ubicaciones,
    ROUND(abc.costo_promedio_ponderado, 4) as costo_promedio,
    ROUND(abc.valor_consumo_total, 2) as valor_consumo,
    ROUND(abc.valor_venta_total, 2) as valor_venta,
    ROUND(abc.margen_total, 2) as margen,
    ROUND(abc.porcentaje_valor, 4) as porcentaje_valor,
    ROUND(abc.porcentaje_acumulado, 2) as porcentaje_acumulado,
    ROUND(abc.concentracion_geografica, 2) as concentracion_geografica,
    abc.fecha_inicio,
    abc.fecha_fin,
    abc.fecha_calculo
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
ORDER BY abc.ranking_valor;
