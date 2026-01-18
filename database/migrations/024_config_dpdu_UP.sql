-- Migración: Agregar configuración de pesos DPD+U
-- Fecha: 2026-01-16
-- Descripción: Campos configurables para el algoritmo de Distribución Proporcional por Demanda + Urgencia

-- Agregar campos a tabla existente config_inventario_global
ALTER TABLE config_inventario_global
ADD COLUMN IF NOT EXISTS dpdu_peso_demanda DECIMAL(3,2) DEFAULT 0.60,
ADD COLUMN IF NOT EXISTS dpdu_peso_urgencia DECIMAL(3,2) DEFAULT 0.40,
ADD COLUMN IF NOT EXISTS dpdu_dias_minimo_urgencia DECIMAL(3,1) DEFAULT 0.5;

-- Comentarios descriptivos
COMMENT ON COLUMN config_inventario_global.dpdu_peso_demanda IS 'Peso del factor demanda en algoritmo DPD+U (0.00-1.00). Default: 0.60 (60%)';
COMMENT ON COLUMN config_inventario_global.dpdu_peso_urgencia IS 'Peso del factor urgencia en algoritmo DPD+U (0.00-1.00). Default: 0.40 (40%)';
COMMENT ON COLUMN config_inventario_global.dpdu_dias_minimo_urgencia IS 'Días de stock mínimo para considerar urgencia máxima. Default: 0.5 días';

-- Actualizar registro existente con valores por defecto
UPDATE config_inventario_global
SET
    dpdu_peso_demanda = 0.60,
    dpdu_peso_urgencia = 0.40,
    dpdu_dias_minimo_urgencia = 0.5
WHERE dpdu_peso_demanda IS NULL;

-- Tabla para log de distribuciones DPD+U (auditoría)
CREATE TABLE IF NOT EXISTS distribucion_dpdu_log (
    id SERIAL PRIMARY KEY,
    grupo_pedido_id VARCHAR(50),
    codigo_producto VARCHAR(50) NOT NULL,
    descripcion_producto VARCHAR(255),
    stock_cedi_inicial DECIMAL(12,4),
    unidades_por_bulto INTEGER,

    -- Datos por tienda (JSON array)
    distribucion_tiendas JSONB NOT NULL,

    -- Configuración usada
    peso_demanda_usado DECIMAL(3,2),
    peso_urgencia_usado DECIMAL(3,2),

    -- Metadata
    usuario_calculo VARCHAR(100),
    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Índices
    CONSTRAINT idx_distribucion_producto UNIQUE (grupo_pedido_id, codigo_producto)
);

CREATE INDEX IF NOT EXISTS idx_dpdu_log_fecha ON distribucion_dpdu_log(fecha_calculo DESC);
CREATE INDEX IF NOT EXISTS idx_dpdu_log_grupo ON distribucion_dpdu_log(grupo_pedido_id);

COMMENT ON TABLE distribucion_dpdu_log IS 'Log de distribuciones calculadas con algoritmo DPD+U para auditoría';

-- Agregar campo grupo_pedido_id a pedidos_sugeridos para agrupar pedidos multi-tienda
ALTER TABLE pedidos_sugeridos
ADD COLUMN IF NOT EXISTS grupo_pedido_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS orden_en_grupo INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_pedidos_grupo ON pedidos_sugeridos(grupo_pedido_id) WHERE grupo_pedido_id IS NOT NULL;

COMMENT ON COLUMN pedidos_sugeridos.grupo_pedido_id IS 'ID del grupo para pedidos multi-tienda creados juntos';
COMMENT ON COLUMN pedidos_sugeridos.orden_en_grupo IS 'Orden de la tienda dentro del grupo (1, 2, 3...)';
