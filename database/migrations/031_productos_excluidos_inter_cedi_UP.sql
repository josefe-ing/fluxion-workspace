-- ============================================================================
-- Migration 031: Productos Excluidos para Pedidos Inter-CEDI
--
-- Permite excluir productos de los pedidos de reposición inter-CEDI.
-- Separado de productos_excluidos_tienda ya que aplica a un contexto diferente
-- (transferencias entre CEDIs vs pedidos a tiendas individuales).
-- ============================================================================

-- Tabla principal de exclusiones inter-CEDI
CREATE TABLE IF NOT EXISTS productos_excluidos_inter_cedi (
    id SERIAL PRIMARY KEY,

    -- CEDI destino al que aplica la exclusión
    cedi_destino_id VARCHAR(50) NOT NULL,  -- ej: 'cedi_caracas'

    -- Identificadores del producto
    producto_id VARCHAR(50),
    codigo_producto VARCHAR(50) NOT NULL,

    -- Info del producto (desnormalizada para UI)
    descripcion_producto VARCHAR(200),
    categoria VARCHAR(100),
    cedi_origen_id VARCHAR(50),  -- De cuál CEDI origen viene normalmente

    -- Razón de exclusión
    motivo VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
    -- MANUAL, SOLO_TIENDA, PROVEEDOR_LOCAL, DESCONTINUADO, OTRO
    observaciones TEXT,

    -- Metadata
    creado_por VARCHAR(100) NOT NULL DEFAULT 'admin',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT TRUE,

    -- Constraint de unicidad: un producto solo puede estar excluido una vez por destino
    UNIQUE(cedi_destino_id, codigo_producto)
);

-- Índice para búsqueda rápida durante cálculo de pedidos inter-CEDI
CREATE INDEX IF NOT EXISTS idx_excluidos_intercedi_destino_activo
    ON productos_excluidos_inter_cedi(cedi_destino_id, activo);

CREATE INDEX IF NOT EXISTS idx_excluidos_intercedi_codigo
    ON productos_excluidos_inter_cedi(codigo_producto);

-- Comentarios
COMMENT ON TABLE productos_excluidos_inter_cedi IS 'Productos excluidos de pedidos inter-CEDI por destino';
COMMENT ON COLUMN productos_excluidos_inter_cedi.cedi_destino_id IS 'CEDI destino al que aplica la exclusión (ej: cedi_caracas)';
COMMENT ON COLUMN productos_excluidos_inter_cedi.motivo IS 'MANUAL | SOLO_TIENDA | PROVEEDOR_LOCAL | DESCONTINUADO | OTRO';
