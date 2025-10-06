-- =====================================================================================
-- ESQUEMA DE BASE DE DATOS FLUXION AI - DuckDB
-- Sistema de gestión de inventarios para La Granja Mercado
-- =====================================================================================

-- =====================================================================================
-- TABLAS MAESTRAS
-- =====================================================================================

-- Tabla unificada para tiendas y CEDIs
CREATE TABLE ubicaciones (
    id VARCHAR PRIMARY KEY,
    codigo VARCHAR(10) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) NOT NULL, -- 'tienda' | 'cedi'
    region VARCHAR(50),
    ciudad VARCHAR(50),
    direccion TEXT,

    -- Coordenadas geográficas
    latitud DECIMAL(10,6),
    longitud DECIMAL(10,6),

    -- Capacidades
    superficie_m2 DECIMAL(10,2),
    capacidad_actual DECIMAL(10,2),
    capacidad_maxima DECIMAL(10,2),

    -- Operación
    horario_apertura TIME,
    horario_cierre TIME,
    activo BOOLEAN DEFAULT true,

    -- Metadatos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de productos/SKUs
CREATE TABLE productos (
    id VARCHAR PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL, -- Código interno
    codigo_barras VARCHAR(50), -- EAN/UPC
    descripcion VARCHAR(200) NOT NULL,

    -- Clasificación
    categoria VARCHAR(50),
    grupo VARCHAR(50),
    subgrupo VARCHAR(50),
    marca VARCHAR(100),
    modelo VARCHAR(100),
    presentacion VARCHAR(50),

    -- Costos y precios
    costo_promedio DECIMAL(12,4),
    precio_venta DECIMAL(12,4),

    -- Inventario
    stock_minimo INTEGER DEFAULT 0,
    stock_maximo INTEGER DEFAULT 0,

    -- Control
    activo BOOLEAN DEFAULT true,
    es_perecedero BOOLEAN DEFAULT false,
    dias_vencimiento INTEGER,

    -- Metadatos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================================
-- TABLAS TRANSACCIONALES
-- =====================================================================================

-- Tabla de facturas/transacciones
CREATE TABLE facturas (
    id VARCHAR PRIMARY KEY,
    numero_factura VARCHAR(50) NOT NULL,
    ubicacion_id VARCHAR NOT NULL,
    caja VARCHAR(10),
    cajero VARCHAR(50),

    -- Fecha y hora
    fecha_hora TIMESTAMP NOT NULL,
    fecha DATE NOT NULL,
    hora INTEGER,
    dia_semana INTEGER,
    turno INTEGER,

    -- Cliente
    cliente_nombre VARCHAR(200),
    cliente_rif VARCHAR(20),

    -- Montos en Bs
    subtotal_bs DECIMAL(18,2),
    descuento_bs DECIMAL(18,2),
    base_imponible_bs DECIMAL(18,2),
    impuesto_bs DECIMAL(18,2),
    imp_igtf_bs DECIMAL(18,2),
    total_bs DECIMAL(18,2),

    -- Montos en USD
    tasa_cambio DECIMAL(18,2),
    total_usd DECIMAL(18,2),

    -- Métodos de pago
    efectivo_bs DECIMAL(18,2),
    efectivo_usd DECIMAL(18,2),
    tarjeta_debito_bs DECIMAL(18,2),
    tarjeta_credito_bs DECIMAL(18,2),
    pago_movil_bs DECIMAL(18,2),
    transferencia_bs DECIMAL(18,2),
    zelle_usd DECIMAL(18,2),
    otros_bs DECIMAL(18,2),
    otros_usd DECIMAL(18,2),

    -- Resumen
    cantidad_items INTEGER,
    cantidad_metodos INTEGER,
    moneda_principal VARCHAR(3),
    es_pago_mixto BOOLEAN,
    metodos_utilizados VARCHAR(200),

    -- Métricas calculadas
    ticket_promedio_usd DECIMAL(18,2),

    -- Constraints
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id)
);

-- Tabla de items de facturas (líneas de detalle)
CREATE TABLE items_facturas (
    id VARCHAR PRIMARY KEY,
    factura_id VARCHAR NOT NULL,
    numero_factura VARCHAR(50) NOT NULL,
    producto_id VARCHAR,

    -- Fecha y hora (desnormalizado para performance)
    fecha_hora TIMESTAMP NOT NULL,
    fecha DATE NOT NULL,

    -- Producto (desnormalizado para queries rápidas)
    codigo_producto VARCHAR(50),
    descripcion_producto VARCHAR(200),
    categoria_producto VARCHAR(50),
    marca_producto VARCHAR(100),
    modelo_producto VARCHAR(100),
    presentacion VARCHAR(50),

    -- Transacción
    cantidad DECIMAL(12,4) NOT NULL,
    precio_unitario DECIMAL(12,4),
    precio_total DECIMAL(18,2),
    descuento DECIMAL(18,2) DEFAULT 0,

    -- Costos
    costo_unitario DECIMAL(12,4),
    costo_total DECIMAL(18,2),
    margen DECIMAL(18,2),

    -- Constraints
    FOREIGN KEY (factura_id) REFERENCES facturas(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- =====================================================================================
-- TABLAS DE INVENTARIO
-- =====================================================================================

-- Tabla de movimientos de inventario
CREATE TABLE movimientos_inventario (
    id VARCHAR PRIMARY KEY,
    fecha_hora TIMESTAMP NOT NULL,
    fecha DATE NOT NULL,

    -- Ubicación y producto
    ubicacion_id VARCHAR NOT NULL,
    producto_id VARCHAR NOT NULL,

    -- Tipo de movimiento
    tipo_movimiento VARCHAR(30) NOT NULL, -- 'entrada', 'salida', 'ajuste', 'transferencia'
    origen VARCHAR(100), -- Proveedor, tienda origen, etc.
    destino VARCHAR(100), -- Cliente, tienda destino, etc.
    referencia VARCHAR(100), -- Número de factura, orden, etc.

    -- Cantidades
    cantidad DECIMAL(12,4) NOT NULL,
    stock_anterior DECIMAL(12,4),
    stock_nuevo DECIMAL(12,4),

    -- Valores
    costo_unitario DECIMAL(12,4),
    valor_total DECIMAL(18,2),

    -- Usuario y metadatos
    usuario VARCHAR(100),
    observaciones TEXT,

    -- Constraints
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- Tabla de stock actual (snapshot)
CREATE TABLE stock_actual (
    ubicacion_id VARCHAR NOT NULL,
    producto_id VARCHAR NOT NULL,

    -- Stock
    cantidad DECIMAL(12,4) NOT NULL DEFAULT 0,
    valor_inventario DECIMAL(18,2),
    costo_promedio DECIMAL(12,4),

    -- Fechas
    ultima_entrada TIMESTAMP,
    ultima_salida TIMESTAMP,
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Alertas
    stock_minimo DECIMAL(12,4),
    stock_maximo DECIMAL(12,4),
    dias_sin_movimiento INTEGER DEFAULT 0,

    -- Constraints
    PRIMARY KEY (ubicacion_id, producto_id),
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- =====================================================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================================================

-- Índices para facturas
CREATE INDEX idx_facturas_fecha ON facturas(fecha);
CREATE INDEX idx_facturas_ubicacion ON facturas(ubicacion_id);
CREATE INDEX idx_facturas_fecha_ubicacion ON facturas(fecha, ubicacion_id);

-- Índices para items_facturas
CREATE INDEX idx_items_fecha ON items_facturas(fecha);
CREATE INDEX idx_items_producto ON items_facturas(producto_id);
CREATE INDEX idx_items_categoria ON items_facturas(categoria_producto);

-- Índices para movimientos_inventario
CREATE INDEX idx_movimientos_fecha ON movimientos_inventario(fecha);
CREATE INDEX idx_movimientos_ubicacion ON movimientos_inventario(ubicacion_id);
CREATE INDEX idx_movimientos_producto ON movimientos_inventario(producto_id);

-- Índices para stock_actual
CREATE INDEX idx_stock_ubicacion ON stock_actual(ubicacion_id);
CREATE INDEX idx_stock_producto ON stock_actual(producto_id);

-- =====================================================================================
-- VISTAS MATERIALIZADAS PARA DASHBOARDS
-- =====================================================================================

-- Vista de resumen diario de ventas por ubicación
CREATE VIEW ventas_diarias AS
SELECT
    f.ubicacion_id,
    u.nombre as ubicacion_nombre,
    u.tipo as ubicacion_tipo,
    f.fecha,
    COUNT(DISTINCT f.numero_factura) as num_facturas,
    SUM(f.total_bs) as venta_total_bs,
    SUM(f.total_usd) as venta_total_usd,
    SUM(f.cantidad_items) as items_vendidos,
    AVG(f.total_bs) as ticket_promedio_bs,
    AVG(f.total_usd) as ticket_promedio_usd
FROM facturas f
JOIN ubicaciones u ON f.ubicacion_id = u.id
GROUP BY f.ubicacion_id, u.nombre, u.tipo, f.fecha;

-- Vista de productos más vendidos
CREATE VIEW productos_top_ventas AS
SELECT
    i.producto_id,
    i.descripcion_producto,
    i.categoria_producto,
    i.marca_producto,
    DATE_TRUNC('month', i.fecha) as mes,
    SUM(i.cantidad) as cantidad_vendida,
    SUM(i.precio_total) as venta_total,
    COUNT(DISTINCT i.numero_factura) as num_transacciones,
    AVG(i.precio_unitario) as precio_promedio
FROM items_facturas i
GROUP BY i.producto_id, i.descripcion_producto, i.categoria_producto,
         i.marca_producto, DATE_TRUNC('month', i.fecha);

-- Vista de estado de inventario por ubicación
CREATE VIEW inventario_resumen AS
SELECT
    s.ubicacion_id,
    u.nombre as ubicacion_nombre,
    u.tipo as ubicacion_tipo,
    COUNT(DISTINCT s.producto_id) as skus_unicos,
    SUM(s.cantidad) as unidades_totales,
    SUM(s.valor_inventario) as valor_total_inventario,
    SUM(CASE WHEN s.cantidad <= s.stock_minimo THEN 1 ELSE 0 END) as productos_stock_bajo,
    SUM(CASE WHEN s.dias_sin_movimiento > 30 THEN 1 ELSE 0 END) as productos_sin_movimiento
FROM stock_actual s
JOIN ubicaciones u ON s.ubicacion_id = u.id
GROUP BY s.ubicacion_id, u.nombre, u.tipo;

-- =====================================================================================
-- TRIGGERS Y FUNCIONES (Si DuckDB las soporta en versiones futuras)
-- =====================================================================================

-- Por ahora, la lógica de actualización de stock se manejará en el backend