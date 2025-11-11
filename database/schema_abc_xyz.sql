-- =====================================================================================
-- EXTENSIÓN XYZ PARA CLASIFICACIÓN ABC V2
-- Análisis de Variabilidad de Demanda mediante Coeficiente de Variación (CV)
-- =====================================================================================

-- Agregar columnas XYZ a la tabla productos_abc_v2 existente
ALTER TABLE productos_abc_v2 ADD COLUMN IF NOT EXISTS clasificacion_xyz VARCHAR(1);
ALTER TABLE productos_abc_v2 ADD COLUMN IF NOT EXISTS coeficiente_variacion DECIMAL(8,4);
ALTER TABLE productos_abc_v2 ADD COLUMN IF NOT EXISTS demanda_promedio_semanal DECIMAL(12,4);
ALTER TABLE productos_abc_v2 ADD COLUMN IF NOT EXISTS desviacion_estandar_semanal DECIMAL(12,4);
ALTER TABLE productos_abc_v2 ADD COLUMN IF NOT EXISTS semanas_con_venta INTEGER;
ALTER TABLE productos_abc_v2 ADD COLUMN IF NOT EXISTS semanas_analizadas INTEGER;
ALTER TABLE productos_abc_v2 ADD COLUMN IF NOT EXISTS matriz_abc_xyz VARCHAR(2);
ALTER TABLE productos_abc_v2 ADD COLUMN IF NOT EXISTS confiabilidad_calculo VARCHAR(10);
ALTER TABLE productos_abc_v2 ADD COLUMN IF NOT EXISTS es_estacional BOOLEAN DEFAULT false;
ALTER TABLE productos_abc_v2 ADD COLUMN IF NOT EXISTS es_extremadamente_volatil BOOLEAN DEFAULT false;

-- Agregar constraints
ALTER TABLE productos_abc_v2 ADD CONSTRAINT IF NOT EXISTS check_clasificacion_xyz
  CHECK (clasificacion_xyz IN ('X', 'Y', 'Z', NULL));

ALTER TABLE productos_abc_v2 ADD CONSTRAINT IF NOT EXISTS check_confiabilidad
  CHECK (confiabilidad_calculo IN ('ALTA', 'MEDIA', 'BAJA', NULL));

ALTER TABLE productos_abc_v2 ADD CONSTRAINT IF NOT EXISTS check_cv_positive
  CHECK (coeficiente_variacion IS NULL OR coeficiente_variacion >= 0);

-- Índices para optimizar consultas XYZ
CREATE INDEX IF NOT EXISTS idx_abc_v2_clasificacion_xyz
  ON productos_abc_v2(clasificacion_xyz);

CREATE INDEX IF NOT EXISTS idx_abc_v2_matriz_abc_xyz
  ON productos_abc_v2(matriz_abc_xyz);

CREATE INDEX IF NOT EXISTS idx_abc_v2_confiabilidad
  ON productos_abc_v2(confiabilidad_calculo);

CREATE INDEX IF NOT EXISTS idx_abc_v2_cv
  ON productos_abc_v2(coeficiente_variacion);

-- =====================================================================================
-- VISTA: Distribución de la Matriz ABC-XYZ
-- =====================================================================================

CREATE OR REPLACE VIEW vista_matriz_abc_xyz AS
SELECT
    matriz_abc_xyz,
    COUNT(*) as num_productos,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as porcentaje_productos,
    ROUND(SUM(valor_consumo_total), 2) as valor_total,
    ROUND(SUM(valor_consumo_total) * 100.0 / SUM(SUM(valor_consumo_total)) OVER (), 2) as porcentaje_valor,
    ROUND(AVG(coeficiente_variacion), 4) as cv_promedio,
    ROUND(AVG(demanda_promedio_semanal), 2) as demanda_promedio,
    COUNT(CASE WHEN confiabilidad_calculo = 'ALTA' THEN 1 END) as productos_alta_confiabilidad,
    COUNT(CASE WHEN es_extremadamente_volatil THEN 1 END) as productos_muy_volatiles
FROM productos_abc_v2
WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
  AND clasificacion_xyz IS NOT NULL
GROUP BY matriz_abc_xyz
ORDER BY
    CASE SUBSTRING(matriz_abc_xyz, 1, 1)
        WHEN 'A' THEN 1
        WHEN 'B' THEN 2
        WHEN 'C' THEN 3
        ELSE 4
    END,
    CASE SUBSTRING(matriz_abc_xyz, 2, 1)
        WHEN 'X' THEN 1
        WHEN 'Y' THEN 2
        WHEN 'Z' THEN 3
        ELSE 4
    END;

-- =====================================================================================
-- VISTA: Productos Críticos (AZ) - Alto valor pero impredecibles
-- =====================================================================================

CREATE OR REPLACE VIEW vista_productos_az_criticos AS
SELECT
    p.codigo_producto,
    p.valor_consumo_total,
    p.coeficiente_variacion,
    p.demanda_promedio_semanal,
    p.desviacion_estandar_semanal,
    p.semanas_con_venta,
    p.confiabilidad_calculo,
    p.es_extremadamente_volatil,
    p.ranking_valor,
    CASE
        WHEN p.coeficiente_variacion > 2.0 THEN 'CRÍTICO - CV Extremo'
        WHEN p.coeficiente_variacion > 1.5 THEN 'ALTO RIESGO - CV Alto'
        WHEN p.semanas_con_venta < 8 THEN 'ADVERTENCIA - Datos Insuficientes'
        ELSE 'MONITOREAR - CV Moderado'
    END as nivel_alerta
FROM productos_abc_v2 p
WHERE p.matriz_abc_xyz = 'AZ'
  AND p.clasificacion_abc_valor = 'A'
ORDER BY p.valor_consumo_total DESC;

-- =====================================================================================
-- VISTA: Productos BZ y CZ - Baja prioridad + impredecibles
-- =====================================================================================

CREATE OR REPLACE VIEW vista_productos_bz_cz AS
SELECT
    p.codigo_producto,
    p.clasificacion_abc_valor,
    p.clasificacion_xyz,
    p.matriz_abc_xyz,
    p.valor_consumo_total,
    p.coeficiente_variacion,
    p.confiabilidad_calculo,
    CASE
        WHEN p.semanas_con_venta < 4 THEN 'CANDIDATO_DESCONTINUACION'
        WHEN p.coeficiente_variacion > 3.0 THEN 'STOCK_BAJO_SOLO_DEMANDA'
        ELSE 'MANTENER_STOCK_MINIMO'
    END as estrategia_recomendada
FROM productos_abc_v2 p
WHERE p.matriz_abc_xyz IN ('BZ', 'CZ')
ORDER BY
    p.clasificacion_abc_valor,
    p.coeficiente_variacion DESC;

-- =====================================================================================
-- VISTA: Productos AX y BX - Alta prioridad + predecibles (ideales)
-- =====================================================================================

CREATE OR REPLACE VIEW vista_productos_ax_bx AS
SELECT
    p.codigo_producto,
    p.clasificacion_abc_valor,
    p.valor_consumo_total,
    p.coeficiente_variacion,
    p.demanda_promedio_semanal,
    p.ranking_valor,
    p.confiabilidad_calculo,
    CASE
        WHEN p.clasificacion_abc_valor = 'A' AND p.clasificacion_xyz = 'X' THEN 'STOCK_ALTO_REPOSICION_AUTOMATICA'
        WHEN p.clasificacion_abc_valor = 'B' AND p.clasificacion_xyz = 'X' THEN 'STOCK_MEDIO_REPOSICION_PROGRAMADA'
        ELSE 'REVISAR_ESTRATEGIA'
    END as estrategia_recomendada
FROM productos_abc_v2 p
WHERE p.matriz_abc_xyz IN ('AX', 'BX')
  AND p.confiabilidad_calculo = 'ALTA'
ORDER BY p.valor_consumo_total DESC;

-- =====================================================================================
-- VISTA: Auditoría de Confiabilidad
-- =====================================================================================

CREATE OR REPLACE VIEW vista_auditoria_confiabilidad AS
SELECT
    p.clasificacion_abc_valor,
    p.clasificacion_xyz,
    p.confiabilidad_calculo,
    COUNT(*) as num_productos,
    ROUND(AVG(p.semanas_con_venta), 1) as promedio_semanas_venta,
    ROUND(AVG(p.coeficiente_variacion), 4) as cv_promedio,
    COUNT(CASE WHEN p.semanas_con_venta < 8 THEN 1 END) as productos_datos_insuficientes,
    COUNT(CASE WHEN p.es_extremadamente_volatil THEN 1 END) as productos_volatiles
FROM productos_abc_v2 p
WHERE p.clasificacion_abc_valor IN ('A', 'B', 'C')
  AND p.clasificacion_xyz IS NOT NULL
GROUP BY
    p.clasificacion_abc_valor,
    p.clasificacion_xyz,
    p.confiabilidad_calculo
ORDER BY
    p.clasificacion_abc_valor,
    p.clasificacion_xyz,
    CASE p.confiabilidad_calculo
        WHEN 'ALTA' THEN 1
        WHEN 'MEDIA' THEN 2
        WHEN 'BAJA' THEN 3
    END;

-- =====================================================================================
-- COMENTARIOS EN COLUMNAS (Documentación)
-- =====================================================================================

COMMENT ON COLUMN productos_abc_v2.clasificacion_xyz IS
  'Clasificación por variabilidad de demanda: X (CV<0.5 estable), Y (0.5≤CV<1.0 variable), Z (CV≥1.0 errática)';

COMMENT ON COLUMN productos_abc_v2.coeficiente_variacion IS
  'Coeficiente de Variación (CV) = Desviación Estándar / Media. Mide la variabilidad relativa de la demanda.';

COMMENT ON COLUMN productos_abc_v2.demanda_promedio_semanal IS
  'Promedio de unidades vendidas por semana en el periodo analizado (últimas 12 semanas).';

COMMENT ON COLUMN productos_abc_v2.desviacion_estandar_semanal IS
  'Desviación estándar de las ventas semanales. Indica la dispersión de la demanda.';

COMMENT ON COLUMN productos_abc_v2.semanas_con_venta IS
  'Número de semanas con al menos una venta en el periodo. Usado para calcular confiabilidad.';

COMMENT ON COLUMN productos_abc_v2.semanas_analizadas IS
  'Número total de semanas incluidas en el análisis (típicamente 12 semanas = 3 meses).';

COMMENT ON COLUMN productos_abc_v2.matriz_abc_xyz IS
  'Combinación de clasificaciones ABC y XYZ (ej: AX, BY, CZ). Define estrategia de inventario.';

COMMENT ON COLUMN productos_abc_v2.confiabilidad_calculo IS
  'Confiabilidad del cálculo XYZ: ALTA (≥8 semanas venta), MEDIA (4-7 semanas), BAJA (<4 semanas).';

COMMENT ON COLUMN productos_abc_v2.es_estacional IS
  'Flag que indica si el producto muestra patrones estacionales significativos.';

COMMENT ON COLUMN productos_abc_v2.es_extremadamente_volatil IS
  'Flag que indica si CV > 2.0 (demanda extremadamente impredecible).';
