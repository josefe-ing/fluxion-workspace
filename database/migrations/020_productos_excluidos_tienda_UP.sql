-- ============================================================================
-- Migration 020: Productos Excluidos por Tienda
--
-- Permite excluir permanentemente productos de las sugerencias de pedido
-- para tiendas específicas.
-- ============================================================================

-- Tabla principal de exclusiones
CREATE TABLE IF NOT EXISTS productos_excluidos_tienda (
    id SERIAL PRIMARY KEY,

    -- Identificadores
    tienda_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50),
    codigo_producto VARCHAR(50) NOT NULL,

    -- Info del producto (desnormalizada para UI)
    descripcion_producto VARCHAR(200),
    categoria VARCHAR(100),

    -- Razón de exclusión
    motivo VARCHAR(50) NOT NULL DEFAULT 'MANUAL',  -- MANUAL, DESCONTINUADO, NO_VENDE, OTRO
    observaciones TEXT,

    -- Metadata
    creado_por VARCHAR(100) NOT NULL DEFAULT 'admin',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT TRUE,

    -- Constraint de unicidad
    UNIQUE(tienda_id, codigo_producto)
);

-- Índice para búsqueda rápida durante cálculo de pedidos sugeridos
CREATE INDEX IF NOT EXISTS idx_excluidos_tienda_activo
    ON productos_excluidos_tienda(tienda_id, activo);

CREATE INDEX IF NOT EXISTS idx_excluidos_codigo
    ON productos_excluidos_tienda(codigo_producto);

-- Comentarios
COMMENT ON TABLE productos_excluidos_tienda IS 'Productos excluidos permanentemente de pedidos sugeridos por tienda';
COMMENT ON COLUMN productos_excluidos_tienda.motivo IS 'MANUAL | DESCONTINUADO | NO_VENDE | OTRO';
