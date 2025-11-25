-- =========================================================================
-- Migration 008 UP: Add pedidos_sugeridos and pedidos_productos tables
-- Description: Creates suggested orders with foreign keys
-- Date: 2025-11-25
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Create pedidos_sugeridos table (header/master)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pedidos_sugeridos (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tienda_codigo VARCHAR(10) NOT NULL,
    fecha_generacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'borrador',
    observaciones TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_pedidos_estado CHECK (estado IN ('borrador', 'enviado', 'aprobado', 'rechazado', 'cancelado'))
);

-- -------------------------------------------------------------------------
-- 2. Create pedidos_productos table (lines/detail)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pedidos_productos (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    pedido_id VARCHAR(50) NOT NULL,
    producto_codigo VARCHAR(50) NOT NULL,
    producto_descripcion VARCHAR(200),
    cantidad_sugerida NUMERIC(12,4) NOT NULL CHECK (cantidad_sugerida > 0),
    cantidad_final NUMERIC(12,4) CHECK (cantidad_final IS NULL OR cantidad_final >= 0),
    razon TEXT,
    comentarios TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------------------
-- 3. Create indexes on pedidos_sugeridos
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_pedidos_tienda ON pedidos_sugeridos(tienda_codigo);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos_sugeridos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos_sugeridos(fecha_generacion DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_tienda_estado ON pedidos_sugeridos(tienda_codigo, estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_metadata_gin ON pedidos_sugeridos USING GIN (metadata);

-- -------------------------------------------------------------------------
-- 4. Create indexes on pedidos_productos
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_pedidos_productos_pedido ON pedidos_productos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_productos_producto ON pedidos_productos(producto_codigo);
CREATE INDEX IF NOT EXISTS idx_pedidos_productos_pedido_producto ON pedidos_productos(pedido_id, producto_codigo);
CREATE INDEX IF NOT EXISTS idx_pedidos_productos_metadata_gin ON pedidos_productos USING GIN (metadata);

-- -------------------------------------------------------------------------
-- 5. Add foreign keys
-- -------------------------------------------------------------------------

ALTER TABLE pedidos_sugeridos
    ADD CONSTRAINT fk_pedidos_tienda
    FOREIGN KEY (tienda_codigo)
    REFERENCES ubicaciones(codigo)
    ON DELETE CASCADE;

ALTER TABLE pedidos_productos
    ADD CONSTRAINT fk_pedidos_productos_pedido
    FOREIGN KEY (pedido_id)
    REFERENCES pedidos_sugeridos(id)
    ON DELETE CASCADE;

ALTER TABLE pedidos_productos
    ADD CONSTRAINT fk_pedidos_productos_producto
    FOREIGN KEY (producto_codigo)
    REFERENCES productos(codigo)
    ON DELETE RESTRICT;

-- -------------------------------------------------------------------------
-- 6. Add table and column comments on pedidos_sugeridos
-- -------------------------------------------------------------------------

COMMENT ON TABLE pedidos_sugeridos IS
    'Encabezados de pedidos sugeridos generados automáticamente por algoritmos de reposición';

COMMENT ON COLUMN pedidos_sugeridos.tienda_codigo IS
    'Tienda destino del pedido (FK a ubicaciones.codigo)';

COMMENT ON COLUMN pedidos_sugeridos.estado IS
    'Estado del pedido: borrador, enviado, aprobado, rechazado, cancelado';

COMMENT ON COLUMN pedidos_sugeridos.observaciones IS
    'Notas del sistema o usuario sobre el pedido';

COMMENT ON COLUMN pedidos_sugeridos.metadata IS
    'Metadatos flexibles: algoritmo usado, parámetros, nivel de confianza, etc';

-- -------------------------------------------------------------------------
-- 7. Add table and column comments on pedidos_productos
-- -------------------------------------------------------------------------

COMMENT ON TABLE pedidos_productos IS
    'Líneas/detalle de productos en cada pedido sugerido';

COMMENT ON COLUMN pedidos_productos.pedido_id IS
    'Pedido al que pertenece esta línea (FK a pedidos_sugeridos.id, ON DELETE CASCADE)';

COMMENT ON COLUMN pedidos_productos.producto_codigo IS
    'SKU del producto (FK a productos.codigo)';

COMMENT ON COLUMN pedidos_productos.cantidad_sugerida IS
    'Cantidad original sugerida por el algoritmo de reposición';

COMMENT ON COLUMN pedidos_productos.cantidad_final IS
    'Cantidad ajustada manualmente por usuario (NULL si no se modificó)';

COMMENT ON COLUMN pedidos_productos.razon IS
    'Justificación del algoritmo para esta cantidad (ej: venta promedio, días de inventario)';

COMMENT ON COLUMN pedidos_productos.comentarios IS
    'Comentarios del usuario sobre ajustes realizados';

COMMENT ON COLUMN pedidos_productos.metadata IS
    'Metadatos adicionales: nivel de stock, días de inventario, prioridad, etc';

-- -------------------------------------------------------------------------
-- 8. Record this migration in schema_migrations
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('008', 'add_pedidos')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 008 UP
-- =========================================================================
