-- ============================================================================
-- MIGRACIÓN 002: Agregar Columnas de Nivel Objetivo
-- ============================================================================
-- Descripción: Agrega columnas necesarias para cálculo y tracking de nivel
--              objetivo en la tabla pedidos_sugeridos_detalle existente
--
-- Autor: Sistema FluxionIA
-- Fecha: 2025-01-12
-- Versión: 1.0
-- ============================================================================

-- ============================================================================
-- AGREGAR COLUMNAS A pedidos_sugeridos_detalle
-- ============================================================================

-- Clasificación ABC-XYZ del producto al momento del pedido
ALTER TABLE pedidos_sugeridos_detalle
ADD COLUMN IF NOT EXISTS matriz_abc_xyz VARCHAR(2);

COMMENT ON COLUMN pedidos_sugeridos_detalle.matriz_abc_xyz IS
'Matriz ABC-XYZ del producto al momento de generar el pedido (ej: AX, BY, CZ)';

-- Nivel objetivo calculado para este producto en esta tienda
ALTER TABLE pedidos_sugeridos_detalle
ADD COLUMN IF NOT EXISTS nivel_objetivo DECIMAL(12,4);

COMMENT ON COLUMN pedidos_sugeridos_detalle.nivel_objetivo IS
'Nivel objetivo de inventario calculado: Demanda_Ciclo + Stock_Seguridad';

-- Stock de seguridad calculado
ALTER TABLE pedidos_sugeridos_detalle
ADD COLUMN IF NOT EXISTS stock_seguridad DECIMAL(12,4);

COMMENT ON COLUMN pedidos_sugeridos_detalle.stock_seguridad IS
'Stock de seguridad calculado: Z × Desv_Std × √(Lead_Time + Ciclo_Revisión) × Multiplicador_SS';

-- Demanda esperada durante el ciclo de reposición
ALTER TABLE pedidos_sugeridos_detalle
ADD COLUMN IF NOT EXISTS demanda_ciclo DECIMAL(12,4);

COMMENT ON COLUMN pedidos_sugeridos_detalle.demanda_ciclo IS
'Demanda esperada durante ciclo de reposición: Demanda_Promedio_Diaria × (Lead_Time + Ciclo) × Multiplicador_Demanda';

-- Inventario en tránsito (pedidos aprobados no recibidos aún)
ALTER TABLE pedidos_sugeridos_detalle
ADD COLUMN IF NOT EXISTS inventario_en_transito DECIMAL(12,4) DEFAULT 0;

COMMENT ON COLUMN pedidos_sugeridos_detalle.inventario_en_transito IS
'Cantidad en tránsito: suma de pedidos aprobados/en_picking/despachados no recibidos aún';

-- Método usado para calcular la cantidad sugerida
ALTER TABLE pedidos_sugeridos_detalle
ADD COLUMN IF NOT EXISTS metodo_calculo VARCHAR(50) DEFAULT 'NORMAL';

COMMENT ON COLUMN pedidos_sugeridos_detalle.metodo_calculo IS
'Método de cálculo: NORMAL (nivel objetivo estándar), FAIR_SHARE (distribución equitativa), OVERRIDE (manual)';

-- Datos de cálculo en formato JSON para trazabilidad completa
ALTER TABLE pedidos_sugeridos_detalle
ADD COLUMN IF NOT EXISTS datos_calculo JSON;

COMMENT ON COLUMN pedidos_sugeridos_detalle.datos_calculo IS
'Objeto JSON con todos los parámetros usados en el cálculo para auditoría y debugging';


-- ============================================================================
-- CREAR ÍNDICES PARA OPTIMIZACIÓN
-- ============================================================================

-- Índice para consultas por matriz ABC-XYZ
CREATE INDEX IF NOT EXISTS idx_pedido_detalle_matriz
    ON pedidos_sugeridos_detalle(matriz_abc_xyz);

-- Nota: DuckDB no soporta índices parciales (WHERE clause)
-- CREATE INDEX IF NOT EXISTS idx_pedido_detalle_en_transito
--     ON pedidos_sugeridos_detalle(inventario_en_transito)
--     WHERE inventario_en_transito > 0;

-- Índice para métodos de cálculo (útil para análisis de overrides)
CREATE INDEX IF NOT EXISTS idx_pedido_detalle_metodo
    ON pedidos_sugeridos_detalle(metodo_calculo);


-- ============================================================================
-- NOTAS DE MIGRACIÓN
-- ============================================================================

-- IMPORTANTE: Esta migración usa ADD COLUMN IF NOT EXISTS por lo que es
-- seguro ejecutarla múltiples veces sin error.

-- Las columnas existentes en pedidos_sugeridos_detalle NO se modifican:
-- - cantidad_pedida_bultos
-- - cantidad_pedida_unidades
-- - cantidad_sugerida_bultos
-- - cantidad_sugerida_unidades
-- - stock_tienda
-- - stock_cedi_origen
-- - prom_ventas_5dias_unid
-- - prom_ventas_8sem_unid
-- - etc.

-- Las nuevas columnas se agregan SIN valores por defecto (NULL permitido)
-- para no afectar pedidos históricos ya generados.

-- ============================================================================
-- EJEMPLO DE datos_calculo JSON
-- ============================================================================

-- {
--   "parametros_usados": {
--     "nivel_servicio_z": 1.96,
--     "multiplicador_demanda": 1.05,
--     "multiplicador_ss": 1.25,
--     "incluir_stock_seguridad": true
--   },
--   "metricas_base": {
--     "demanda_promedio_diaria": 15.3,
--     "desviacion_estandar_diaria": 4.2,
--     "coeficiente_variacion": 0.27,
--     "semanas_analizadas": 8
--   },
--   "calculos_intermedios": {
--     "lead_time_dias": 1.5,
--     "ciclo_revision_dias": 1,
--     "periodo_total_dias": 2.5,
--     "demanda_ciclo_base": 38.25,
--     "demanda_ciclo_ajustada": 40.16,
--     "stock_seguridad_base": 12.97,
--     "stock_seguridad_ajustado": 16.21
--   },
--   "resultado": {
--     "nivel_objetivo": 56,
--     "stock_actual": 25,
--     "en_transito": 10,
--     "cantidad_sugerida": 21
--   }
-- }
