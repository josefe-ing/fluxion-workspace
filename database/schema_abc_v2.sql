-- =====================================================================================
-- CLASIFICACIÓN ABC V2 BASADA EN VALOR ECONÓMICO (PRINCIPIO DE PARETO)
-- Sistema de clasificación ABC basado en valor de consumo anual
-- =====================================================================================

-- =====================================================================================
-- MIGRACIÓN: Añadir columnas faltantes si la tabla ya existe
-- =====================================================================================

-- Añadir codigo_producto y ubicacion_id si no existen (migración desde schema anterior)
-- Estas ALTER TABLE se ejecutarán antes del CREATE TABLE IF NOT EXISTS
-- para asegurar que las tablas existentes tengan las columnas correctas

ALTER TABLE IF EXISTS productos_abc_v2 ADD COLUMN IF NOT EXISTS codigo_producto VARCHAR;
ALTER TABLE IF EXISTS productos_abc_v2 ADD COLUMN IF NOT EXISTS ubicacion_id VARCHAR;

ALTER TABLE IF EXISTS productos_abc_v2_historico ADD COLUMN IF NOT EXISTS codigo_producto VARCHAR;
ALTER TABLE IF EXISTS productos_abc_v2_historico ADD COLUMN IF NOT EXISTS ubicacion_id VARCHAR;

ALTER TABLE IF EXISTS productos_abc_v2_evolucion ADD COLUMN IF NOT EXISTS codigo_producto VARCHAR;
ALTER TABLE IF EXISTS productos_abc_v2_evolucion ADD COLUMN IF NOT EXISTS ubicacion_id VARCHAR;

-- =====================================================================================
-- TABLA PRINCIPAL: PRODUCTOS_ABC_V2
-- =====================================================================================

CREATE TABLE IF NOT EXISTS productos_abc_v2 (
    id VARCHAR PRIMARY KEY,
    codigo_producto VARCHAR NOT NULL,  -- Código del producto (no producto_id)
    ubicacion_id VARCHAR NOT NULL,     -- ID de la tienda (análisis por tienda)

    -- Periodo de análisis
    periodo_analisis VARCHAR(20) NOT NULL, -- 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Métricas de ventas
    unidades_vendidas_total DECIMAL(18,4) NOT NULL DEFAULT 0,
    numero_transacciones INTEGER NOT NULL DEFAULT 0,
    numero_ubicaciones INTEGER NOT NULL DEFAULT 0, -- Cuántas tiendas lo vendieron

    -- Costos y valores
    costo_promedio_ponderado DECIMAL(12,4), -- Costo promedio ponderado del periodo
    costo_minimo DECIMAL(12,4), -- Costo mínimo observado
    costo_maximo DECIMAL(12,4), -- Costo máximo observado
    desviacion_std_costo DECIMAL(12,4), -- Volatilidad del costo

    -- Valor de consumo (métrica principal para ABC)
    valor_consumo_total DECIMAL(18,2) NOT NULL DEFAULT 0, -- unidades × costo
    valor_venta_total DECIMAL(18,2) DEFAULT 0, -- Para comparación
    margen_total DECIMAL(18,2) DEFAULT 0, -- Margen bruto total generado

    -- Clasificación ABC v2 (basada en valor)
    clasificacion_abc_valor VARCHAR(20) NOT NULL, -- 'A', 'B', 'C', 'NUEVO', 'SIN_MOVIMIENTO', 'ERROR_COSTO'
    porcentaje_valor DECIMAL(8,4) NOT NULL, -- % del valor total
    porcentaje_acumulado DECIMAL(8,4) NOT NULL, -- % acumulado (para Pareto)
    ranking_valor INTEGER NOT NULL, -- Posición en el ranking por valor

    -- Clasificación anterior (para comparación)
    clasificacion_velocidad VARCHAR(10), -- De la clasificación actual
    ranking_anterior INTEGER, -- Posición en cálculo anterior
    cambio_ranking INTEGER, -- Cambio de posición vs anterior

    -- Métricas de distribución
    concentracion_geografica DECIMAL(5,2), -- % de ventas en top ubicación
    estacionalidad_score DECIMAL(5,2), -- Variabilidad mensual (CV)

    -- Flags de validación
    tiene_costo_valido BOOLEAN DEFAULT true,
    tiene_ventas_consistentes BOOLEAN DEFAULT true,
    es_producto_nuevo BOOLEAN DEFAULT false, -- < 1 mes en el periodo
    es_producto_descontinuado BOOLEAN DEFAULT false,

    -- Metadata
    version_calculo VARCHAR(10) DEFAULT '2.0',
    observaciones TEXT,

    -- Constraints
    -- Note: codigo_producto references productos.codigo (not productos.id)
    -- Foreign key omitted as DuckDB may not support it on non-PK columns

    -- Validaciones
    CHECK (unidades_vendidas_total >= 0),
    CHECK (valor_consumo_total >= 0),
    CHECK (porcentaje_valor >= 0 AND porcentaje_valor <= 100),
    CHECK (porcentaje_acumulado >= 0 AND porcentaje_acumulado <= 100),
    CHECK (clasificacion_abc_valor IN ('A', 'B', 'C', 'NUEVO', 'SIN_MOVIMIENTO', 'ERROR_COSTO'))
);

-- =====================================================================================
-- TABLA HISTÓRICA: CLASIFICACIONES ANTERIORES
-- =====================================================================================

CREATE TABLE IF NOT EXISTS productos_abc_v2_historico (
    id VARCHAR PRIMARY KEY,
    codigo_producto VARCHAR NOT NULL,
    ubicacion_id VARCHAR NOT NULL,
    periodo_analisis VARCHAR(20) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    fecha_calculo TIMESTAMP NOT NULL,

    -- Snapshot de la clasificación en ese momento
    clasificacion_abc_valor VARCHAR(20) NOT NULL,
    valor_consumo_total DECIMAL(18,2) NOT NULL,
    ranking_valor INTEGER NOT NULL,
    porcentaje_valor DECIMAL(8,4) NOT NULL,
    porcentaje_acumulado DECIMAL(8,4) NOT NULL

    -- Metadata: Foreign key omitted (references productos.codigo)
);

-- =====================================================================================
-- TABLA: EVOLUCIÓN DE CLASIFICACIONES
-- =====================================================================================

CREATE TABLE IF NOT EXISTS productos_abc_v2_evolucion (
    id VARCHAR PRIMARY KEY,
    codigo_producto VARCHAR NOT NULL,
    ubicacion_id VARCHAR NOT NULL,

    -- Periodo de comparación
    periodo_desde DATE NOT NULL,
    periodo_hasta DATE NOT NULL,

    -- Cambios observados
    clasificacion_inicial VARCHAR(20),
    clasificacion_final VARCHAR(20),
    cambio_clasificacion VARCHAR(50), -- 'C_a_A', 'A_a_B', 'sin_cambio', etc.

    -- Métricas de cambio
    cambio_valor_consumo DECIMAL(18,2), -- Diferencia absoluta
    cambio_porcentual DECIMAL(8,2), -- % de cambio
    cambio_ranking INTEGER,

    -- Análisis del cambio
    tipo_tendencia VARCHAR(20), -- 'ascendente', 'descendente', 'estable', 'volatil'
    velocidad_cambio VARCHAR(20), -- 'rapido', 'gradual', 'lento'

    -- Metadata
    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    -- Foreign key omitted (references productos.codigo)
);

-- =====================================================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================================================

-- Índice principal para búsquedas por producto, ubicación y periodo
CREATE INDEX IF NOT EXISTS idx_abc_v2_producto_ubicacion_periodo
    ON productos_abc_v2(codigo_producto, ubicacion_id, periodo_analisis, fecha_inicio);

-- Índice para búsquedas por ubicación
CREATE INDEX IF NOT EXISTS idx_abc_v2_ubicacion
    ON productos_abc_v2(ubicacion_id);

-- Índice para búsqueda por clasificación
CREATE INDEX IF NOT EXISTS idx_abc_v2_clasificacion
    ON productos_abc_v2(clasificacion_abc_valor, ranking_valor);

-- Índice para análisis de valor
CREATE INDEX IF NOT EXISTS idx_abc_v2_valor
    ON productos_abc_v2(valor_consumo_total DESC);

-- Índice para análisis temporal
CREATE INDEX IF NOT EXISTS idx_abc_v2_fecha_calculo
    ON productos_abc_v2(fecha_calculo DESC);

-- Índice para búsquedas por flags
CREATE INDEX IF NOT EXISTS idx_abc_v2_flags
    ON productos_abc_v2(es_producto_nuevo, tiene_costo_valido);

-- Índices para tabla histórica
CREATE INDEX IF NOT EXISTS idx_abc_v2_hist_producto_ubicacion
    ON productos_abc_v2_historico(codigo_producto, ubicacion_id, fecha_calculo DESC);

CREATE INDEX IF NOT EXISTS idx_abc_v2_hist_periodo
    ON productos_abc_v2_historico(fecha_inicio, fecha_fin);

-- Índices para tabla de evolución
CREATE INDEX IF NOT EXISTS idx_abc_v2_evol_producto_ubicacion
    ON productos_abc_v2_evolucion(codigo_producto, ubicacion_id);

CREATE INDEX IF NOT EXISTS idx_abc_v2_evol_cambio
    ON productos_abc_v2_evolucion(cambio_clasificacion);

-- =====================================================================================
-- VISTAS ÚTILES
-- =====================================================================================

-- Vista: Resumen por clasificación ABC v2
CREATE OR REPLACE VIEW v_abc_v2_resumen AS
SELECT
    clasificacion_abc_valor,
    COUNT(*) as num_productos,
    SUM(valor_consumo_total) as valor_total,
    AVG(valor_consumo_total) as valor_promedio,
    MIN(valor_consumo_total) as valor_minimo,
    MAX(valor_consumo_total) as valor_maximo,
    SUM(porcentaje_valor) as porcentaje_total,
    AVG(unidades_vendidas_total) as unidades_promedio
FROM productos_abc_v2
WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
GROUP BY clasificacion_abc_valor
ORDER BY
    CASE clasificacion_abc_valor
        WHEN 'A' THEN 1
        WHEN 'B' THEN 2
        WHEN 'C' THEN 3
    END;

-- Vista: Comparación velocidad vs valor
CREATE OR REPLACE VIEW v_abc_comparacion_velocidad_valor AS
SELECT
    p.id,
    p.codigo,
    p.descripcion,
    p.categoria,
    abc.ubicacion_id,
    abc.clasificacion_velocidad,
    abc.clasificacion_abc_valor,
    abc.valor_consumo_total,
    abc.unidades_vendidas_total,
    abc.ranking_valor,
    CASE
        WHEN abc.clasificacion_velocidad = 'A' AND abc.clasificacion_abc_valor = 'C' THEN 'Alta velocidad, bajo valor'
        WHEN abc.clasificacion_velocidad = 'C' AND abc.clasificacion_abc_valor = 'A' THEN 'Baja velocidad, alto valor'
        WHEN abc.clasificacion_velocidad = abc.clasificacion_abc_valor THEN 'Coherente'
        ELSE 'Discrepancia moderada'
    END as tipo_discrepancia
FROM productos p
LEFT JOIN productos_abc_v2 abc ON p.codigo = abc.codigo_producto
WHERE abc.clasificacion_abc_valor IS NOT NULL
    AND abc.clasificacion_abc_valor IN ('A', 'B', 'C');

-- Vista: TOP productos por valor
CREATE OR REPLACE VIEW v_abc_top_productos AS
SELECT
    abc.ranking_valor,
    abc.codigo_producto,
    abc.ubicacion_id,
    p.descripcion,
    p.categoria,
    p.marca,
    abc.clasificacion_abc_valor,
    abc.valor_consumo_total,
    abc.unidades_vendidas_total,
    abc.porcentaje_valor,
    abc.porcentaje_acumulado,
    abc.numero_ubicaciones,
    abc.margen_total
FROM productos_abc_v2 abc
JOIN productos p ON abc.codigo_producto = p.codigo
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
ORDER BY abc.ranking_valor
LIMIT 100;

-- Vista: Productos con cambios significativos
CREATE OR REPLACE VIEW v_abc_cambios_significativos AS
SELECT
    e.codigo_producto,
    e.ubicacion_id,
    p.descripcion,
    p.categoria,
    e.clasificacion_inicial,
    e.clasificacion_final,
    e.cambio_clasificacion,
    e.cambio_valor_consumo,
    e.cambio_porcentual,
    e.cambio_ranking,
    e.tipo_tendencia,
    e.velocidad_cambio
FROM productos_abc_v2_evolucion e
JOIN productos p ON e.codigo_producto = p.codigo
WHERE e.clasificacion_inicial != e.clasificacion_final
    OR ABS(e.cambio_ranking) > 100
ORDER BY ABS(e.cambio_porcentual) DESC;

-- =====================================================================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- =====================================================================================

COMMENT ON TABLE productos_abc_v2 IS
'Clasificación ABC basada en Valor de Consumo (Principio de Pareto 80/20).
Clase A: productos que acumulan 80% del valor.
Clase B: productos que acumulan del 80% al 95% del valor.
Clase C: productos que acumulan del 95% al 100% del valor.';

COMMENT ON COLUMN productos_abc_v2.valor_consumo_total IS
'Valor de consumo = Σ(cantidad_vendida × costo_promedio_ponderado).
Esta es la métrica principal para la clasificación ABC v2.';

COMMENT ON COLUMN productos_abc_v2.porcentaje_acumulado IS
'Porcentaje acumulado del valor total. Usado para determinar las clases A/B/C según Pareto.';

COMMENT ON TABLE productos_abc_v2_historico IS
'Histórico de clasificaciones ABC para análisis de evolución temporal.
Permite identificar productos que cambian de clase y tendencias de valor.';

COMMENT ON TABLE productos_abc_v2_evolucion IS
'Análisis de cambios en clasificación ABC entre periodos.
Identifica productos con tendencias ascendentes/descendentes y velocidad de cambio.';
