-- =====================================================================================
-- CÁLCULO DE CLASIFICACIÓN ABC V2 BASADA EN VALOR (PRINCIPIO DE PARETO)
-- =====================================================================================
-- Este script calcula la clasificación ABC basándose en el valor de consumo anual.
-- Implementa el Principio de Pareto (80/20):
--   - Clase A: productos que acumulan hasta el 80% del valor total
--   - Clase B: productos que acumulan del 80% al 95% del valor total
--   - Clase C: productos que acumulan del 95% al 100% del valor total
-- =====================================================================================

-- =====================================================================================
-- PASO 0: CONFIGURACIÓN DE PARÁMETROS
-- =====================================================================================

-- Definir periodo de análisis (últimos 3 meses por defecto)
-- Ajustar según necesidad: 1 mes, 3 meses, 6 meses, 12 meses
CREATE OR REPLACE TEMPORARY TABLE parametros_abc AS
SELECT
    CURRENT_DATE - INTERVAL '3 months' as fecha_inicio,
    CURRENT_DATE as fecha_fin,
    'TRIMESTRAL' as periodo_analisis,
    80.0 as umbral_clase_a,  -- % acumulado para clase A
    95.0 as umbral_clase_b,  -- % acumulado para clase B
    30 as dias_minimos_nuevo -- Productos con menos de N días = NUEVO
;

-- =====================================================================================
-- PASO 1: CALCULAR VALOR DE CONSUMO POR PRODUCTO
-- =====================================================================================

CREATE OR REPLACE TEMPORARY TABLE valor_consumo_productos AS
SELECT
    i.producto_id,

    -- Métricas de ventas
    SUM(i.cantidad) as unidades_vendidas_total,
    COUNT(DISTINCT i.numero_factura) as numero_transacciones,
    COUNT(DISTINCT f.ubicacion_id) as numero_ubicaciones,

    -- Fechas para validar productos nuevos
    MIN(i.fecha) as fecha_primera_venta,
    MAX(i.fecha) as fecha_ultima_venta,

    -- Costos (manejo de NULL y volatilidad)
    AVG(COALESCE(i.costo_unitario, 0)) as costo_promedio_ponderado,
    MIN(COALESCE(i.costo_unitario, 0)) as costo_minimo,
    MAX(COALESCE(i.costo_unitario, 0)) as costo_maximo,
    STDDEV(COALESCE(i.costo_unitario, 0)) as desviacion_std_costo,

    -- Valor de consumo (métrica principal)
    SUM(COALESCE(i.costo_total, i.cantidad * COALESCE(i.costo_unitario, 0))) as valor_consumo_total,
    SUM(COALESCE(i.precio_total, 0)) as valor_venta_total,
    SUM(COALESCE(i.margen, 0)) as margen_total,

    -- Flags de validación
    COUNT(CASE WHEN i.costo_unitario IS NULL OR i.costo_unitario = 0 THEN 1 END) as transacciones_sin_costo,
    COUNT(*) as total_transacciones,

    -- Concentración geográfica (% en top ubicación)
    MAX(ubicacion_ventas.valor_ubicacion) * 100.0 / NULLIF(SUM(COALESCE(i.costo_total, 0)), 0) as concentracion_geografica

FROM items_facturas i
JOIN facturas f ON i.factura_id = f.id
CROSS JOIN parametros_abc p
LEFT JOIN (
    -- Subconsulta para obtener el valor máximo por ubicación
    SELECT
        i2.producto_id,
        f2.ubicacion_id,
        SUM(COALESCE(i2.costo_total, 0)) as valor_ubicacion,
        ROW_NUMBER() OVER (PARTITION BY i2.producto_id ORDER BY SUM(COALESCE(i2.costo_total, 0)) DESC) as rn
    FROM items_facturas i2
    JOIN facturas f2 ON i2.factura_id = f2.id
    CROSS JOIN parametros_abc p2
    WHERE i2.fecha BETWEEN p2.fecha_inicio AND p2.fecha_fin
        AND i2.producto_id IS NOT NULL
    GROUP BY i2.producto_id, f2.ubicacion_id
) ubicacion_ventas ON i.producto_id = ubicacion_ventas.producto_id AND ubicacion_ventas.rn = 1

WHERE i.fecha BETWEEN p.fecha_inicio AND p.fecha_fin
    AND i.producto_id IS NOT NULL

GROUP BY i.producto_id
HAVING SUM(i.cantidad) > 0  -- Excluir productos sin ventas reales
;

-- =====================================================================================
-- PASO 2: CALCULAR RANKING Y PORCENTAJES ACUMULADOS
-- =====================================================================================

CREATE OR REPLACE TEMPORARY TABLE productos_con_ranking AS
SELECT
    v.*,

    -- Ranking por valor de consumo
    ROW_NUMBER() OVER (ORDER BY v.valor_consumo_total DESC) as ranking_valor,

    -- Porcentaje individual del valor total
    (v.valor_consumo_total * 100.0) / SUM(v.valor_consumo_total) OVER () as porcentaje_valor,

    -- Porcentaje acumulado (para Pareto)
    (SUM(v.valor_consumo_total) OVER (ORDER BY v.valor_consumo_total DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) * 100.0) /
    SUM(v.valor_consumo_total) OVER () as porcentaje_acumulado,

    -- Flags de validación
    CASE
        WHEN v.transacciones_sin_costo * 1.0 / v.total_transacciones > 0.5 THEN false
        WHEN v.costo_promedio_ponderado = 0 THEN false
        ELSE true
    END as tiene_costo_valido,

    CASE
        WHEN v.numero_transacciones >= 3 AND v.numero_ubicaciones >= 1 THEN true
        ELSE false
    END as tiene_ventas_consistentes

FROM valor_consumo_productos v
;

-- =====================================================================================
-- PASO 3: ASIGNAR CLASIFICACIÓN ABC SEGÚN PARETO
-- =====================================================================================

CREATE OR REPLACE TEMPORARY TABLE productos_con_clasificacion AS
SELECT
    r.*,
    p.fecha_inicio,
    p.fecha_fin,
    p.periodo_analisis,

    -- Determinar si es producto nuevo
    CASE
        WHEN DATE_DIFF('day', r.fecha_primera_venta, p.fecha_fin) < p.dias_minimos_nuevo THEN true
        ELSE false
    END as es_producto_nuevo,

    -- Clasificación ABC basada en valor
    CASE
        -- Casos especiales primero
        WHEN NOT r.tiene_costo_valido THEN 'ERROR_COSTO'
        WHEN r.valor_consumo_total = 0 THEN 'SIN_MOVIMIENTO'
        WHEN DATE_DIFF('day', r.fecha_primera_venta, p.fecha_fin) < p.dias_minimos_nuevo THEN 'NUEVO'

        -- Clasificación Pareto estándar
        WHEN r.porcentaje_acumulado <= p.umbral_clase_a THEN 'A'
        WHEN r.porcentaje_acumulado <= p.umbral_clase_b THEN 'B'
        ELSE 'C'
    END as clasificacion_abc_valor

FROM productos_con_ranking r
CROSS JOIN parametros_abc p
;

-- =====================================================================================
-- PASO 4: ENRIQUECER CON DATOS DE PRODUCTO Y CLASIFICACIÓN ANTERIOR
-- =====================================================================================

CREATE OR REPLACE TEMPORARY TABLE productos_abc_final AS
SELECT
    -- ID único para el registro
    gen_random_uuid()::VARCHAR as id,

    -- Datos del producto
    c.producto_id,
    c.periodo_analisis,
    c.fecha_inicio,
    c.fecha_fin,
    CURRENT_TIMESTAMP as fecha_calculo,

    -- Métricas de ventas
    c.unidades_vendidas_total,
    c.numero_transacciones,
    c.numero_ubicaciones,

    -- Costos y valores
    c.costo_promedio_ponderado,
    c.costo_minimo,
    c.costo_maximo,
    c.desviacion_std_costo,
    c.valor_consumo_total,
    c.valor_venta_total,
    c.margen_total,

    -- Clasificación ABC v2
    c.clasificacion_abc_valor,
    c.porcentaje_valor,
    c.porcentaje_acumulado,
    c.ranking_valor,

    -- Clasificación anterior (velocidad)
    p.abc_classification as clasificacion_velocidad,

    -- Ranking anterior (si existe cálculo previo)
    abc_prev.ranking_valor as ranking_anterior,
    c.ranking_valor - COALESCE(abc_prev.ranking_valor, c.ranking_valor) as cambio_ranking,

    -- Métricas de distribución
    COALESCE(c.concentracion_geografica, 0) as concentracion_geografica,
    0.0 as estacionalidad_score,  -- Calcular en análisis más profundo

    -- Flags de validación
    c.tiene_costo_valido,
    c.tiene_ventas_consistentes,
    c.es_producto_nuevo,
    p.discontinuado as es_producto_descontinuado,

    -- Metadata
    '2.0' as version_calculo,
    CASE
        WHEN NOT c.tiene_costo_valido THEN 'Producto con costos inconsistentes o faltantes'
        WHEN c.es_producto_nuevo THEN 'Producto nuevo en el periodo de análisis'
        WHEN c.valor_consumo_total = 0 THEN 'Sin movimiento en el periodo'
        ELSE NULL
    END as observaciones

FROM productos_con_clasificacion c
LEFT JOIN productos p ON c.producto_id = p.id
LEFT JOIN productos_abc_v2 abc_prev ON c.producto_id = abc_prev.producto_id
    AND abc_prev.fecha_calculo = (
        SELECT MAX(fecha_calculo)
        FROM productos_abc_v2
        WHERE producto_id = c.producto_id
    )
;

-- =====================================================================================
-- PASO 5: GUARDAR EN TABLA HISTÓRICA (ANTES DE ACTUALIZAR)
-- =====================================================================================

INSERT INTO productos_abc_v2_historico (
    id,
    producto_id,
    periodo_analisis,
    fecha_inicio,
    fecha_fin,
    fecha_calculo,
    clasificacion_abc_valor,
    valor_consumo_total,
    ranking_valor,
    porcentaje_valor,
    porcentaje_acumulado
)
SELECT
    gen_random_uuid()::VARCHAR,
    producto_id,
    periodo_analisis,
    fecha_inicio,
    fecha_fin,
    fecha_calculo,
    clasificacion_abc_valor,
    valor_consumo_total,
    ranking_valor,
    porcentaje_valor,
    porcentaje_acumulado
FROM productos_abc_v2
WHERE clasificacion_abc_valor IN ('A', 'B', 'C');  -- Solo guardar clasificaciones válidas

-- =====================================================================================
-- PASO 6: ACTUALIZAR TABLA PRINCIPAL
-- =====================================================================================

-- Borrar cálculos anteriores para el mismo periodo (si existen)
DELETE FROM productos_abc_v2
WHERE fecha_inicio = (SELECT fecha_inicio FROM parametros_abc LIMIT 1)
    AND fecha_fin = (SELECT fecha_fin FROM parametros_abc LIMIT 1);

-- Insertar nuevos cálculos
INSERT INTO productos_abc_v2
SELECT * FROM productos_abc_final;

-- =====================================================================================
-- PASO 7: CALCULAR EVOLUCIÓN (COMPARAR CON PERIODO ANTERIOR)
-- =====================================================================================

-- Identificar cambios significativos comparando con el cálculo anterior
INSERT INTO productos_abc_v2_evolucion (
    id,
    producto_id,
    periodo_desde,
    periodo_hasta,
    clasificacion_inicial,
    clasificacion_final,
    cambio_clasificacion,
    cambio_valor_consumo,
    cambio_porcentual,
    cambio_ranking,
    tipo_tendencia,
    velocidad_cambio,
    fecha_calculo
)
SELECT
    gen_random_uuid()::VARCHAR as id,
    actual.producto_id,
    anterior.fecha_inicio as periodo_desde,
    actual.fecha_fin as periodo_hasta,

    -- Clasificaciones
    anterior.clasificacion_abc_valor as clasificacion_inicial,
    actual.clasificacion_abc_valor as clasificacion_final,

    -- Descripción del cambio
    CONCAT(anterior.clasificacion_abc_valor, '_a_', actual.clasificacion_abc_valor) as cambio_clasificacion,

    -- Cambios numéricos
    actual.valor_consumo_total - anterior.valor_consumo_total as cambio_valor_consumo,
    ((actual.valor_consumo_total - anterior.valor_consumo_total) * 100.0) /
        NULLIF(anterior.valor_consumo_total, 0) as cambio_porcentual,
    actual.ranking_valor - anterior.ranking_valor as cambio_ranking,

    -- Análisis de tendencia
    CASE
        WHEN actual.valor_consumo_total > anterior.valor_consumo_total * 1.1 THEN 'ascendente'
        WHEN actual.valor_consumo_total < anterior.valor_consumo_total * 0.9 THEN 'descendente'
        WHEN ABS(actual.valor_consumo_total - anterior.valor_consumo_total) / anterior.valor_consumo_total < 0.1 THEN 'estable'
        ELSE 'volatil'
    END as tipo_tendencia,

    -- Velocidad de cambio
    CASE
        WHEN ABS((actual.valor_consumo_total - anterior.valor_consumo_total) / anterior.valor_consumo_total) > 0.5 THEN 'rapido'
        WHEN ABS((actual.valor_consumo_total - anterior.valor_consumo_total) / anterior.valor_consumo_total) > 0.2 THEN 'gradual'
        ELSE 'lento'
    END as velocidad_cambio,

    CURRENT_TIMESTAMP as fecha_calculo

FROM productos_abc_v2 actual
JOIN productos_abc_v2_historico anterior ON actual.producto_id = anterior.producto_id
WHERE anterior.fecha_calculo = (
    SELECT MAX(h.fecha_calculo)
    FROM productos_abc_v2_historico h
    WHERE h.producto_id = anterior.producto_id
        AND h.fecha_calculo < actual.fecha_calculo
)
AND actual.clasificacion_abc_valor IN ('A', 'B', 'C')
AND anterior.clasificacion_abc_valor IN ('A', 'B', 'C');

-- =====================================================================================
-- PASO 8: ACTUALIZAR TABLA PRODUCTOS CON NUEVA CLASIFICACIÓN
-- =====================================================================================

-- Opcionalmente, actualizar el campo abc_classification en la tabla productos
-- con la nueva clasificación basada en valor
UPDATE productos p
SET abc_classification = abc.clasificacion_abc_valor
FROM productos_abc_v2 abc
WHERE p.id = abc.producto_id
    AND abc.clasificacion_abc_valor IN ('A', 'B', 'C');

-- =====================================================================================
-- RESULTADOS: RESUMEN DEL CÁLCULO
-- =====================================================================================

-- Mostrar resumen de la clasificación ABC v2
SELECT
    '=== RESUMEN CLASIFICACIÓN ABC V2 ===' as seccion,
    NULL as clasificacion,
    NULL as num_productos,
    NULL as valor_total,
    NULL as porcentaje_total,
    NULL as porcentaje_productos

UNION ALL

SELECT
    'Periodo de análisis:' as seccion,
    CONCAT(fecha_inicio, ' a ', fecha_fin) as clasificacion,
    NULL, NULL, NULL, NULL
FROM parametros_abc

UNION ALL

SELECT
    'Clasificación' as seccion,
    clasificacion_abc_valor as clasificacion,
    COUNT(*)::VARCHAR as num_productos,
    ROUND(SUM(valor_consumo_total), 2)::VARCHAR as valor_total,
    ROUND(SUM(porcentaje_valor), 2)::VARCHAR as porcentaje_total,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2)::VARCHAR as porcentaje_productos
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

-- Mostrar TOP 20 productos por valor
SELECT
    '=== TOP 20 PRODUCTOS POR VALOR ===' as info,
    NULL as ranking,
    NULL as codigo,
    NULL as descripcion,
    NULL as clasificacion,
    NULL as valor_consumo,
    NULL as porcentaje_acum

UNION ALL

SELECT
    'Ranking' as info,
    abc.ranking_valor::VARCHAR,
    p.codigo,
    p.descripcion,
    abc.clasificacion_abc_valor,
    ROUND(abc.valor_consumo_total, 2)::VARCHAR,
    ROUND(abc.porcentaje_acumulado, 2)::VARCHAR
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
ORDER BY abc.ranking_valor
LIMIT 21;  -- 1 header + 20 productos

-- =====================================================================================
-- FIN DEL SCRIPT
-- =====================================================================================
