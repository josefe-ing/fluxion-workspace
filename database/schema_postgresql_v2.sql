-- ============================================================================
-- SCHEMA POSTGRESQL v2.0 - Fluxion AI
-- Limpia y recrea todas las tablas con diseño optimizado para KLK
-- Fecha: 2025-01-25
-- ============================================================================

-- ============================================================================
-- PASO 1: LIMPIAR TODO (DROP CASCADE)
-- ============================================================================

DROP TABLE IF EXISTS inventario_historico CASCADE;
DROP TABLE IF EXISTS inventario_actual CASCADE;
DROP TABLE IF EXISTS ventas CASCADE;
DROP TABLE IF EXISTS almacenes CASCADE;
DROP TABLE IF EXISTS productos CASCADE;
DROP TABLE IF EXISTS ubicaciones CASCADE;

-- ============================================================================
-- PASO 2: TABLAS CORE (Maestras)
-- ============================================================================

-- Tabla: ubicaciones (Tiendas/Sucursales)
CREATE TABLE ubicaciones (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    codigo_klk VARCHAR(50),
    ciudad VARCHAR(100),
    estado VARCHAR(100),
    direccion TEXT,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE ubicaciones IS 'Tiendas y sucursales de La Granja';
COMMENT ON COLUMN ubicaciones.id IS 'ID interno (ej: tienda_01)';
COMMENT ON COLUMN ubicaciones.codigo_klk IS 'Código en sistema KLK';

-- Tabla: almacenes (Almacenes por tienda)
CREATE TABLE almacenes (
    codigo VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    ubicacion_id VARCHAR(50) NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id)
);

CREATE INDEX idx_almacenes_ubicacion ON almacenes(ubicacion_id);

COMMENT ON TABLE almacenes IS 'Almacenes por tienda (APP-TPF: PISO DE VENTA, APP-PPF: PRINCIPAL)';

-- Tabla: productos (Catálogo maestro - auto-registro desde ventas/inventario)
CREATE TABLE productos (
    -- Identificación
    id VARCHAR(50) PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    codigo_barras VARCHAR(100),

    -- Información básica
    nombre VARCHAR(500) NOT NULL,
    descripcion TEXT,
    marca VARCHAR(200),
    modelo VARCHAR(200),

    -- Identificadores adicionales
    serial VARCHAR(100),
    imei VARCHAR(100),

    -- Clasificación (jerarquía de 4 niveles desde KLK)
    categoria VARCHAR(200),
    grupo_articulo VARCHAR(200),
    subgrupo VARCHAR(200),
    categoria_nombre VARCHAR(200),

    -- Unidad de medida
    unidad_medida VARCHAR(20) DEFAULT 'UNIDAD',
    factor_unidad_medida NUMERIC(10,4) DEFAULT 1,

    -- Medidas físicas (si aplica)
    peso_unitario NUMERIC(12,4) DEFAULT 0,
    peso_bruto NUMERIC(12,4) DEFAULT 0,
    volumen_unitario NUMERIC(12,4) DEFAULT 0,

    -- Metadata
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para búsqueda rápida
CREATE INDEX idx_productos_nombre ON productos(nombre);
CREATE INDEX idx_productos_codigo_barras ON productos(codigo_barras) WHERE codigo_barras IS NOT NULL;
CREATE INDEX idx_productos_categoria ON productos(categoria);
CREATE INDEX idx_productos_grupo ON productos(grupo_articulo);
CREATE INDEX idx_productos_marca ON productos(marca);

COMMENT ON TABLE productos IS 'Catálogo maestro de productos (auto-registro desde ventas/inventario KLK)';
COMMENT ON COLUMN productos.id IS 'codigo_producto (ej: 002148)';
COMMENT ON COLUMN productos.codigo IS 'Mismo que id, para compatibilidad';
COMMENT ON COLUMN productos.categoria IS 'categoria_producto desde KLK';
COMMENT ON COLUMN productos.grupo_articulo IS 'grupo_articulo desde KLK';
COMMENT ON COLUMN productos.subgrupo IS 'subgrupo_producto desde KLK';


-- ============================================================================
-- PASO 3: TABLAS OPERACIONALES
-- ============================================================================

-- Tabla: inventario_actual (Snapshot actual por almacén)
CREATE TABLE inventario_actual (
    -- Primary key compuesta: tienda + almacén + producto
    ubicacion_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,
    almacen_codigo VARCHAR(50) NOT NULL,

    -- Stock actual (PUEDE SER NEGATIVO - importante para análisis!)
    cantidad NUMERIC(12,4) NOT NULL DEFAULT 0,

    -- Metadata
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Primary key INCLUYE almacen_codigo
    PRIMARY KEY (ubicacion_id, producto_id, almacen_codigo),

    -- Foreign keys
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (almacen_codigo) REFERENCES almacenes(codigo)
);

-- Índices para queries rápidas
CREATE INDEX idx_inv_actual_ubicacion ON inventario_actual(ubicacion_id);
CREATE INDEX idx_inv_actual_producto ON inventario_actual(producto_id);
CREATE INDEX idx_inv_actual_almacen ON inventario_actual(almacen_codigo);
CREATE INDEX idx_inv_actual_cantidad_neg ON inventario_actual(cantidad) WHERE cantidad < 0;

COMMENT ON TABLE inventario_actual IS 'Snapshot actual de stock por almacén (ETL cada 30 min)';
COMMENT ON COLUMN inventario_actual.cantidad IS 'Stock actual - PUEDE SER NEGATIVO (crítico para análisis de mermas)';


-- Tabla: inventario_historico (Time series - job cada 30 min)
CREATE TABLE inventario_historico (
    -- ID autogenerado
    id BIGSERIAL PRIMARY KEY,

    -- Dimensiones (tienda + almacén + producto)
    ubicacion_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,
    almacen_codigo VARCHAR(50) NOT NULL,

    -- Timestamp del snapshot (cada 30 min exactos)
    fecha_snapshot TIMESTAMP NOT NULL,

    -- Stock en ese momento
    cantidad NUMERIC(12,4) NOT NULL,

    -- Delta calculado vs snapshot anterior (para análisis)
    cantidad_cambio NUMERIC(12,4),

    -- Metadata del job ETL
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    etl_batch_id VARCHAR(100),

    -- Foreign keys
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (almacen_codigo) REFERENCES almacenes(codigo),

    -- UNIQUE: solo un snapshot por combinación + timestamp
    UNIQUE (ubicacion_id, producto_id, almacen_codigo, fecha_snapshot)
);

-- Índices para time-series queries
CREATE INDEX idx_hist_fecha ON inventario_historico(fecha_snapshot DESC);
CREATE INDEX idx_hist_ubicacion_fecha ON inventario_historico(ubicacion_id, fecha_snapshot DESC);
CREATE INDEX idx_hist_producto_fecha ON inventario_historico(producto_id, fecha_snapshot DESC);
CREATE INDEX idx_hist_composite ON inventario_historico(ubicacion_id, producto_id, almacen_codigo, fecha_snapshot DESC);
CREATE INDEX idx_hist_cambios ON inventario_historico(cantidad_cambio) WHERE cantidad_cambio IS NOT NULL;

COMMENT ON TABLE inventario_historico IS 'Time series de inventario (ETL cada 30 min) para correlación ventas vs stock';
COMMENT ON COLUMN inventario_historico.cantidad_cambio IS 'Delta vs snapshot anterior (negativo = venta, positivo = reabastecimiento)';


-- Tabla: ventas (Transacciones de venta desde KLK)
CREATE TABLE ventas (
    -- Identificación de la venta
    id BIGSERIAL PRIMARY KEY,
    numero_factura VARCHAR(50) NOT NULL,
    fecha_venta TIMESTAMP NOT NULL,

    -- Ubicación y almacén
    ubicacion_id VARCHAR(50) NOT NULL,
    almacen_codigo VARCHAR(50),
    almacen_nombre VARCHAR(200),

    -- Producto vendido
    producto_id VARCHAR(50) NOT NULL,

    -- Cantidades
    cantidad_vendida NUMERIC(12,4) NOT NULL,
    peso_unitario NUMERIC(12,4) DEFAULT 0,
    peso_calculado NUMERIC(12,4) DEFAULT 0,
    total_cantidad_por_unidad_medida NUMERIC(12,4),

    -- Unidad de medida
    unidad_medida_venta VARCHAR(20),
    factor_unidad_medida NUMERIC(10,4) DEFAULT 1,

    -- Financiero (USD)
    precio_unitario NUMERIC(12,4),
    costo_unitario NUMERIC(12,4),
    venta_total NUMERIC(18,2),
    costo_total NUMERIC(18,2),
    utilidad_bruta NUMERIC(18,2),
    margen_bruto_pct NUMERIC(8,2),

    -- Metadata
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id)
);

-- Índices para queries analíticos
CREATE INDEX idx_ventas_fecha ON ventas(fecha_venta DESC);
CREATE INDEX idx_ventas_ubicacion_fecha ON ventas(ubicacion_id, fecha_venta DESC);
CREATE INDEX idx_ventas_producto_fecha ON ventas(producto_id, fecha_venta DESC);
CREATE INDEX idx_ventas_factura ON ventas(numero_factura);
CREATE INDEX idx_ventas_almacen ON ventas(almacen_codigo);

COMMENT ON TABLE ventas IS 'Transacciones de venta desde KLK (ETL diario)';


-- ============================================================================
-- PASO 4: DATOS INICIALES
-- ============================================================================

-- Insertar ubicaciones existentes
INSERT INTO ubicaciones (id, nombre, codigo_klk, ciudad, estado, activo) VALUES
('tienda_01', 'Tienda Principal', 'TIENDA_01', 'Caracas', 'Miranda', true)
ON CONFLICT (id) DO NOTHING;

-- Insertar almacenes por tienda
INSERT INTO almacenes (codigo, nombre, ubicacion_id, activo) VALUES
('APP-TPF', 'PISO DE VENTA', 'tienda_01', true),
('APP-PPF', 'PRINCIPAL', 'tienda_01', true)
ON CONFLICT (codigo) DO NOTHING;


-- ============================================================================
-- RESUMEN DEL SCHEMA
-- ============================================================================

SELECT
    '✅ Schema v2.0 creado exitosamente' as status,
    COUNT(*) FILTER (WHERE table_name = 'productos') as productos_table,
    COUNT(*) FILTER (WHERE table_name = 'ubicaciones') as ubicaciones_table,
    COUNT(*) FILTER (WHERE table_name = 'almacenes') as almacenes_table,
    COUNT(*) FILTER (WHERE table_name = 'inventario_actual') as inventario_actual_table,
    COUNT(*) FILTER (WHERE table_name = 'inventario_historico') as inventario_historico_table,
    COUNT(*) FILTER (WHERE table_name = 'ventas') as ventas_table
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_name IN ('productos', 'ubicaciones', 'almacenes', 'inventario_actual', 'inventario_historico', 'ventas');
