-- ============================================================================
-- MIGRACIÓN: Generadores de Tráfico
-- Fecha: 2025-12-04
-- Descripción: Agrega campos para identificar productos que venden poco en $
--              pero aparecen en muchos tickets (críticos para la experiencia
--              del cliente)
-- ============================================================================

-- 1. Agregar columnas a la tabla productos
ALTER TABLE productos
ADD COLUMN IF NOT EXISTS es_generador_trafico BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS generador_trafico_sugerido BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS generador_trafico_fecha_marcado TIMESTAMP,
ADD COLUMN IF NOT EXISTS generador_trafico_fecha_sugerido TIMESTAMP,
ADD COLUMN IF NOT EXISTS generador_trafico_gap INTEGER,
ADD COLUMN IF NOT EXISTS generador_trafico_ignorado BOOLEAN DEFAULT FALSE;

-- 2. Crear índice para búsquedas rápidas de generadores de tráfico
CREATE INDEX IF NOT EXISTS idx_productos_generador_trafico
ON productos(es_generador_trafico)
WHERE es_generador_trafico = TRUE;

CREATE INDEX IF NOT EXISTS idx_productos_generador_trafico_sugerido
ON productos(generador_trafico_sugerido)
WHERE generador_trafico_sugerido = TRUE AND es_generador_trafico = FALSE;

-- 3. Crear tabla de historial de sugerencias (para auditoría)
CREATE TABLE IF NOT EXISTS generadores_trafico_historial (
    id SERIAL PRIMARY KEY,
    producto_id VARCHAR(50) NOT NULL REFERENCES productos(id),
    accion VARCHAR(50) NOT NULL, -- 'sugerido', 'aprobado', 'rechazado', 'removido'
    gap_score INTEGER,
    venta_30d NUMERIC(12,2),
    tickets_30d INTEGER,
    penetracion_pct NUMERIC(6,2),
    clase_abc VARCHAR(1),
    usuario VARCHAR(100),
    comentario TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gt_historial_producto
ON generadores_trafico_historial(producto_id);

CREATE INDEX IF NOT EXISTS idx_gt_historial_fecha
ON generadores_trafico_historial(fecha DESC);

-- 4. Crear tabla de configuración para generadores de tráfico
CREATE TABLE IF NOT EXISTS config_generadores_trafico (
    id SERIAL PRIMARY KEY,
    parametro VARCHAR(100) UNIQUE NOT NULL,
    valor VARCHAR(255) NOT NULL,
    descripcion TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Insertar configuración inicial
INSERT INTO config_generadores_trafico (parametro, valor, descripcion)
VALUES
    ('gap_minimo', '400', 'GAP mínimo para sugerir como generador de tráfico'),
    ('clase_abc_requerida', 'C', 'Clase ABC requerida para ser sugerido'),
    ('stock_seguridad_extra_pct', '50', 'Porcentaje extra de stock de seguridad para generadores'),
    ('producto_excluido_bolsas', '003760', 'Producto ID de bolsas a excluir del análisis'),
    ('dias_analisis', '30', 'Días de ventas a analizar para calcular sugerencias'),
    ('frecuencia_calculo', 'diario', 'Frecuencia de recálculo: diario, semanal')
ON CONFLICT (parametro) DO NOTHING;

-- 6. Comentarios de documentación
COMMENT ON COLUMN productos.es_generador_trafico IS 'TRUE si el producto fue marcado manualmente como generador de tráfico';
COMMENT ON COLUMN productos.generador_trafico_sugerido IS 'TRUE si el sistema sugiere este producto como generador de tráfico';
COMMENT ON COLUMN productos.generador_trafico_fecha_marcado IS 'Fecha en que fue marcado manualmente';
COMMENT ON COLUMN productos.generador_trafico_fecha_sugerido IS 'Fecha de la última sugerencia del sistema';
COMMENT ON COLUMN productos.generador_trafico_gap IS 'GAP score actual (rank_venta - rank_penetracion)';
COMMENT ON COLUMN productos.generador_trafico_ignorado IS 'TRUE si el admin ignoró la sugerencia (no volver a sugerir)';

COMMENT ON TABLE generadores_trafico_historial IS 'Historial de cambios en clasificación de generadores de tráfico';
COMMENT ON TABLE config_generadores_trafico IS 'Configuración del módulo de generadores de tráfico';
