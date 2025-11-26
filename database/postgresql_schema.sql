-- =====================================================================================
-- ESQUEMA POSTGRESQL - FLUXION AI
-- Migrado desde DuckDB schema_extended.sql
-- =====================================================================================

-- =====================================================================================
-- TABLAS MAESTRAS (BÁSICAS)
-- =====================================================================================

-- Tabla unificada para tiendas y CEDIs
CREATE TABLE IF NOT EXISTS ubicaciones (
    id VARCHAR(50) PRIMARY KEY,
    codigo VARCHAR(10) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('tienda', 'cedi')),
    region VARCHAR(50),
    ciudad VARCHAR(50),
    direccion TEXT,

    -- Coordenadas geográficas
    latitud NUMERIC(10,6),
    longitud NUMERIC(10,6),

    -- Capacidades físicas
    superficie_m2 NUMERIC(10,2),
    capacidad_almacenamiento_m3 NUMERIC(10,2),
    capacidad_maxima_productos INTEGER,

    -- Operación
    horario_apertura TIME,
    horario_cierre TIME,
    dias_operacion VARCHAR(20) DEFAULT '1234567',
    zona_horaria VARCHAR(50) DEFAULT 'America/Caracas',

    -- Configuración de inventario
    dias_reposicion_promedio INTEGER DEFAULT 7,
    factor_seguridad NUMERIC(4,2) DEFAULT 1.5,

    -- Metadatos
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================================
-- CONFIGURACIÓN DE PRODUCTOS (CATÁLOGO MAESTRO)
-- =====================================================================================

-- Tabla principal de productos
CREATE TABLE IF NOT EXISTS productos (
    id VARCHAR(50) PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    codigo_barras VARCHAR(50),
    codigo_proveedor VARCHAR(50),

    -- Descripción
    descripcion VARCHAR(200) NOT NULL,
    descripcion_corta VARCHAR(50),
    descripcion_extendida TEXT,

    -- Clasificación
    categoria_id VARCHAR(20),
    categoria VARCHAR(50) NOT NULL,
    subcategoria VARCHAR(50),
    grupo VARCHAR(50),
    subgrupo VARCHAR(50),
    linea VARCHAR(50),

    -- Marca y fabricante
    marca VARCHAR(100),
    fabricante VARCHAR(100),
    modelo VARCHAR(100),
    presentacion VARCHAR(50),

    -- Características físicas
    peso_unidad NUMERIC(10,4),
    volumen_unidad NUMERIC(10,4),
    unidad_medida VARCHAR(10) DEFAULT 'UND',

    -- Costos y precios base
    costo_promedio NUMERIC(12,4),
    precio_sugerido NUMERIC(12,4),
    margen_sugerido NUMERIC(5,2),

    -- Configuración de inventario (defaults globales)
    dias_vencimiento INTEGER,
    es_perecedero BOOLEAN DEFAULT false,
    requiere_refrigeracion BOOLEAN DEFAULT false,
    requiere_lote BOOLEAN DEFAULT false,

    -- Configuración de demanda
    estacionalidad VARCHAR(50),
    patron_demanda VARCHAR(50),
    abc_classification VARCHAR(1) CHECK (abc_classification IN ('A', 'B', 'C')),
    xyz_classification VARCHAR(1) CHECK (xyz_classification IN ('X', 'Y', 'Z')),

    -- Conjuntos sustituibles
    conjunto_sustituible VARCHAR(100),
    es_lider_conjunto BOOLEAN DEFAULT false,

    -- Control
    activo BOOLEAN DEFAULT true,
    discontinuado BOOLEAN DEFAULT false,
    fecha_discontinuacion DATE,

    -- Metadatos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================================
-- CONFIGURACIÓN DE CATEGORÍAS
-- =====================================================================================

CREATE TABLE IF NOT EXISTS categorias_config (
    id VARCHAR(50) PRIMARY KEY,
    categoria VARCHAR(50) NOT NULL,
    subcategoria VARCHAR(50),

    -- Configuración de inventario por categoría
    rotacion_objetivo INTEGER,
    dias_cobertura_min INTEGER DEFAULT 7,
    dias_cobertura_max INTEGER DEFAULT 30,
    factor_seguridad NUMERIC(4,2) DEFAULT 1.2,

    -- Configuración de alertas
    alerta_stock_bajo_porcentaje NUMERIC(5,2) DEFAULT 20.0,
    alerta_vencimiento_dias INTEGER DEFAULT 30,
    alerta_sin_movimiento_dias INTEGER DEFAULT 60,

    -- Configuración de reposición
    frecuencia_revision_dias INTEGER DEFAULT 7,
    lote_minimo_pedido INTEGER DEFAULT 1,
    multiple_pedido INTEGER DEFAULT 1,

    -- Configuración de precios
    margen_minimo NUMERIC(5,2),
    margen_objetivo NUMERIC(5,2),
    margen_maximo NUMERIC(5,2),

    -- Metadatos
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(categoria, subcategoria)
);

-- =====================================================================================
-- CONFIGURACIÓN POR PRODUCTO Y UBICACIÓN (TABLA CRUCIAL)
-- =====================================================================================

CREATE TABLE IF NOT EXISTS producto_ubicacion_config (
    id VARCHAR(50) PRIMARY KEY,
    ubicacion_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,

    -- Stock mínimo y máximo específicos para esta ubicación
    stock_minimo NUMERIC(12,4) NOT NULL CHECK (stock_minimo >= 0),
    stock_maximo NUMERIC(12,4) NOT NULL CHECK (stock_maximo > stock_minimo),
    punto_reorden NUMERIC(12,4),

    -- Configuración de demanda específica
    demanda_diaria_promedio NUMERIC(12,4),
    demanda_diaria_maxima NUMERIC(12,4),
    variabilidad_demanda NUMERIC(5,2),

    -- Tiempos específicos para esta ubicación
    lead_time_dias INTEGER DEFAULT 7 CHECK (lead_time_dias > 0),
    dias_cobertura_objetivo INTEGER,
    dias_seguridad INTEGER DEFAULT 3 CHECK (dias_seguridad >= 0),

    -- Configuración de pedidos
    lote_minimo_compra NUMERIC(12,4) DEFAULT 1,
    lote_multiple NUMERIC(12,4) DEFAULT 1,
    cantidad_maxima_pedido NUMERIC(12,4),

    -- Configuración de precios para esta ubicación
    precio_venta NUMERIC(12,4),
    margen_actual NUMERIC(5,2),
    precio_promocional NUMERIC(12,4),
    fecha_precio_promo_inicio DATE,
    fecha_precio_promo_fin DATE,

    -- Configuración de alertas específicas
    generar_alerta_stock_bajo BOOLEAN DEFAULT true,
    generar_alerta_vencimiento BOOLEAN DEFAULT true,
    generar_alerta_sobrestock BOOLEAN DEFAULT true,

    -- Restricciones específicas
    permitir_venta BOOLEAN DEFAULT true,
    permitir_transferencia BOOLEAN DEFAULT true,
    es_producto_estrella BOOLEAN DEFAULT false,

    -- Configuración de exhibición/ubicación física
    ubicacion_fisica VARCHAR(100),
    orden_exhibicion INTEGER,
    espacio_exhibicion_m2 NUMERIC(6,2),

    -- Metadatos
    activo BOOLEAN DEFAULT true,
    fecha_ultima_revision DATE,
    usuario_ultima_modificacion VARCHAR(100),
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    UNIQUE(ubicacion_id, producto_id)
);

-- =====================================================================================
-- CONFIGURACIÓN DE PROVEEDORES POR PRODUCTO
-- =====================================================================================

CREATE TABLE IF NOT EXISTS proveedores (
    id VARCHAR(50) PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    rif VARCHAR(20),

    -- Contacto
    direccion TEXT,
    telefono VARCHAR(50),
    email VARCHAR(100),
    contacto_principal VARCHAR(100),

    -- Configuración comercial
    dias_credito INTEGER DEFAULT 0,
    descuento_pronto_pago NUMERIC(5,2) DEFAULT 0,
    monto_minimo_pedido NUMERIC(12,2),

    -- Configuración operativa
    lead_time_promedio INTEGER DEFAULT 7,
    dias_entrega VARCHAR(20),
    horario_recepcion_pedidos TIME,
    acepta_pedidos_urgentes BOOLEAN DEFAULT false,

    -- Calificación
    calificacion_calidad INTEGER CHECK (calificacion_calidad BETWEEN 1 AND 5),
    calificacion_servicio INTEGER CHECK (calificacion_servicio BETWEEN 1 AND 5),
    calificacion_precio INTEGER CHECK (calificacion_precio BETWEEN 1 AND 5),

    -- Control
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS producto_proveedor_config (
    id VARCHAR(50) PRIMARY KEY,
    producto_id VARCHAR(50) NOT NULL,
    proveedor_id VARCHAR(50) NOT NULL,

    -- Códigos del proveedor
    codigo_proveedor VARCHAR(50),
    descripcion_proveedor VARCHAR(200),

    -- Precios y condiciones
    precio_compra NUMERIC(12,4) NOT NULL,
    precio_anterior NUMERIC(12,4),
    fecha_ultimo_precio DATE,
    moneda VARCHAR(3) DEFAULT 'VES',

    -- Condiciones de compra
    cantidad_minima NUMERIC(12,4) DEFAULT 1,
    multiple_compra NUMERIC(12,4) DEFAULT 1,
    lead_time_dias INTEGER DEFAULT 7,

    -- Preferencia
    es_proveedor_principal BOOLEAN DEFAULT false,
    orden_preferencia INTEGER DEFAULT 1,

    -- Control
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
    UNIQUE(producto_id, proveedor_id)
);

-- =====================================================================================
-- TABLAS TRANSACCIONALES
-- =====================================================================================

CREATE TABLE IF NOT EXISTS facturas (
    id VARCHAR(50) PRIMARY KEY,
    numero_factura VARCHAR(50) NOT NULL,
    ubicacion_id VARCHAR(50) NOT NULL,
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
    subtotal_bs NUMERIC(18,2),
    descuento_bs NUMERIC(18,2),
    base_imponible_bs NUMERIC(18,2),
    impuesto_bs NUMERIC(18,2),
    imp_igtf_bs NUMERIC(18,2),
    total_bs NUMERIC(18,2),

    -- Montos en USD
    tasa_cambio NUMERIC(18,2),
    total_usd NUMERIC(18,2),

    -- Métodos de pago
    efectivo_bs NUMERIC(18,2),
    efectivo_usd NUMERIC(18,2),
    tarjeta_debito_bs NUMERIC(18,2),
    tarjeta_credito_bs NUMERIC(18,2),
    pago_movil_bs NUMERIC(18,2),
    transferencia_bs NUMERIC(18,2),
    zelle_usd NUMERIC(18,2),
    otros_bs NUMERIC(18,2),
    otros_usd NUMERIC(18,2),

    -- Resumen
    cantidad_items INTEGER,
    cantidad_metodos INTEGER,
    moneda_principal VARCHAR(3),
    es_pago_mixto BOOLEAN,
    metodos_utilizados VARCHAR(200),

    -- Métricas calculadas
    ticket_promedio_usd NUMERIC(18,2),

    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id)
);

CREATE TABLE IF NOT EXISTS items_facturas (
    id VARCHAR(50) PRIMARY KEY,
    factura_id VARCHAR(50) NOT NULL,
    numero_factura VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50),

    -- Fecha y hora (desnormalizado)
    fecha_hora TIMESTAMP NOT NULL,
    fecha DATE NOT NULL,

    -- Producto (desnormalizado)
    codigo_producto VARCHAR(50),
    descripcion_producto VARCHAR(200),
    categoria_producto VARCHAR(50),
    marca_producto VARCHAR(100),
    modelo_producto VARCHAR(100),
    presentacion VARCHAR(50),

    -- Transacción
    cantidad NUMERIC(12,4) NOT NULL,
    precio_unitario NUMERIC(12,4),
    precio_total NUMERIC(18,2),
    descuento NUMERIC(18,2) DEFAULT 0,

    -- Costos
    costo_unitario NUMERIC(12,4),
    costo_total NUMERIC(18,2),
    margen NUMERIC(18,2),

    FOREIGN KEY (factura_id) REFERENCES facturas(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- =====================================================================================
-- TABLAS DE INVENTARIO
-- =====================================================================================

CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id VARCHAR(50) PRIMARY KEY,
    fecha_hora TIMESTAMP NOT NULL,
    fecha DATE NOT NULL,

    -- Ubicación y producto
    ubicacion_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,

    -- Tipo de movimiento
    tipo_movimiento VARCHAR(30) NOT NULL,
    subtipo_movimiento VARCHAR(30),
    origen VARCHAR(100),
    destino VARCHAR(100),
    referencia VARCHAR(100),

    -- Cantidades
    cantidad NUMERIC(12,4) NOT NULL,
    stock_anterior NUMERIC(12,4),
    stock_nuevo NUMERIC(12,4),

    -- Valores
    costo_unitario NUMERIC(12,4),
    valor_total NUMERIC(18,2),

    -- Usuario y metadatos
    usuario VARCHAR(100),
    observaciones TEXT,

    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

CREATE TABLE IF NOT EXISTS stock_actual (
    ubicacion_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,

    -- Stock
    cantidad NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
    cantidad_reservada NUMERIC(12,4) DEFAULT 0 CHECK (cantidad_reservada >= 0),
    cantidad_disponible NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (cantidad_disponible >= 0),

    -- Valores
    valor_inventario NUMERIC(18,2),
    costo_promedio NUMERIC(12,4),

    -- Fechas de movimientos
    ultima_entrada TIMESTAMP,
    ultima_salida TIMESTAMP,
    ultima_venta TIMESTAMP,
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Estadísticas de demanda (calculadas)
    demanda_7_dias NUMERIC(12,4) DEFAULT 0,
    demanda_30_dias NUMERIC(12,4) DEFAULT 0,
    rotacion_anual NUMERIC(8,2) DEFAULT 0,

    -- Alertas y control
    requiere_reposicion BOOLEAN DEFAULT false,
    dias_sin_movimiento INTEGER DEFAULT 0,
    fecha_proximo_vencimiento DATE,

    PRIMARY KEY (ubicacion_id, producto_id),
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- =====================================================================================
-- TABLAS DE CONJUNTOS SUSTITUIBLES
-- =====================================================================================

CREATE TABLE IF NOT EXISTS conjuntos_sustituibles (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(200),
    categoria VARCHAR(50),
    tipo_conjunto VARCHAR(50) DEFAULT 'sustituibles',
    activo BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================================
-- HISTÓRICO DE CLASIFICACIONES ABC-XYZ
-- =====================================================================================

CREATE TABLE IF NOT EXISTS productos_abc_v2_historico (
    id VARCHAR(50) PRIMARY KEY,
    codigo_producto VARCHAR(50) NOT NULL,
    ubicacion_id VARCHAR(20) NOT NULL,
    fecha_calculo DATE NOT NULL,
    clasificacion_abc_valor VARCHAR(20),
    clasificacion_xyz VARCHAR(1),
    matriz_abc_xyz VARCHAR(2),
    ranking_valor INTEGER,
    valor_consumo_total NUMERIC(18,2),
    porcentaje_valor NUMERIC(8,4),
    porcentaje_acumulado NUMERIC(8,4),
    coeficiente_variacion NUMERIC(8,4),
    demanda_promedio_semanal NUMERIC(12,4),
    UNIQUE(codigo_producto, ubicacion_id, fecha_calculo)
);

-- =====================================================================================
-- ÍNDICES OPTIMIZADOS PARA PERFORMANCE
-- =====================================================================================

-- Índices principales
CREATE INDEX IF NOT EXISTS idx_facturas_fecha_ubicacion
    ON facturas(fecha, ubicacion_id);

CREATE INDEX IF NOT EXISTS idx_items_fecha_producto
    ON items_facturas(fecha, producto_id);

CREATE INDEX IF NOT EXISTS idx_movimientos_fecha_ubicacion_producto
    ON movimientos_inventario(fecha, ubicacion_id, producto_id);

-- Índices para configuración
CREATE INDEX IF NOT EXISTS idx_producto_ubicacion_activo
    ON producto_ubicacion_config(ubicacion_id, activo);

CREATE INDEX IF NOT EXISTS idx_productos_categoria
    ON productos(categoria, activo);

CREATE INDEX IF NOT EXISTS idx_productos_abc
    ON productos(abc_classification, activo);

-- Índices para stock
CREATE INDEX IF NOT EXISTS idx_stock_ubicacion
    ON stock_actual(ubicacion_id);

CREATE INDEX IF NOT EXISTS idx_stock_reposicion
    ON stock_actual(requiere_reposicion)
    WHERE requiere_reposicion = true;

-- Índices para conjuntos sustituibles
CREATE INDEX IF NOT EXISTS idx_conjuntos_nombre
    ON conjuntos_sustituibles(nombre);

CREATE INDEX IF NOT EXISTS idx_conjuntos_categoria
    ON conjuntos_sustituibles(categoria);

-- Índices para histórico ABC-XYZ
CREATE INDEX IF NOT EXISTS idx_historico_codigo
    ON productos_abc_v2_historico(codigo_producto);

CREATE INDEX IF NOT EXISTS idx_historico_ubicacion
    ON productos_abc_v2_historico(ubicacion_id);

CREATE INDEX IF NOT EXISTS idx_historico_fecha
    ON productos_abc_v2_historico(fecha_calculo);

-- =====================================================================================
-- VISTAS PARA DASHBOARDS Y REPORTES
-- =====================================================================================

-- Vista de productos con configuración completa por ubicación
CREATE OR REPLACE VIEW productos_ubicacion_completa AS
SELECT
    p.id as producto_id,
    p.codigo,
    p.descripcion,
    p.categoria,
    p.marca,
    u.id as ubicacion_id,
    u.nombre as ubicacion_nombre,
    u.tipo as ubicacion_tipo,
    pc.stock_minimo,
    pc.stock_maximo,
    pc.punto_reorden,
    pc.precio_venta,
    s.cantidad as stock_actual,
    s.cantidad_disponible,
    s.demanda_30_dias,
    CASE
        WHEN s.cantidad <= pc.stock_minimo THEN 'CRITICO'
        WHEN s.cantidad <= pc.punto_reorden THEN 'BAJO'
        WHEN s.cantidad >= pc.stock_maximo THEN 'EXCESO'
        ELSE 'NORMAL'
    END as estado_stock
FROM productos p
JOIN producto_ubicacion_config pc ON p.id = pc.producto_id
JOIN ubicaciones u ON pc.ubicacion_id = u.id
LEFT JOIN stock_actual s ON pc.ubicacion_id = s.ubicacion_id
    AND pc.producto_id = s.producto_id
WHERE p.activo = true AND pc.activo = true;

-- Vista de alertas de inventario
CREATE OR REPLACE VIEW alertas_inventario AS
SELECT
    u.nombre as ubicacion,
    u.tipo,
    p.descripcion as producto,
    p.categoria,
    s.cantidad as stock_actual,
    pc.stock_minimo,
    pc.stock_maximo,
    s.dias_sin_movimiento,
    CASE
        WHEN s.cantidad <= pc.stock_minimo THEN 'Stock crítico'
        WHEN s.dias_sin_movimiento > 60 THEN 'Sin movimiento'
        WHEN s.cantidad >= pc.stock_maximo THEN 'Sobrestock'
        WHEN s.fecha_proximo_vencimiento <= CURRENT_DATE + INTERVAL '30 days' THEN 'Próximo a vencer'
        ELSE 'Sin alerta'
    END as tipo_alerta,
    CASE
        WHEN s.cantidad <= pc.stock_minimo THEN 'CRITICA'
        WHEN s.dias_sin_movimiento > 60 THEN 'MEDIA'
        WHEN s.cantidad >= pc.stock_maximo THEN 'BAJA'
        WHEN s.fecha_proximo_vencimiento <= CURRENT_DATE + INTERVAL '30 days' THEN 'ALTA'
        ELSE 'SIN_ALERTA'
    END as prioridad
FROM stock_actual s
JOIN producto_ubicacion_config pc
    ON s.ubicacion_id = pc.ubicacion_id
    AND s.producto_id = pc.producto_id
JOIN productos p ON s.producto_id = p.id
JOIN ubicaciones u ON s.ubicacion_id = u.id
WHERE (
    s.cantidad <= pc.stock_minimo OR
    s.dias_sin_movimiento > 60 OR
    s.cantidad >= pc.stock_maximo OR
    s.fecha_proximo_vencimiento <= CURRENT_DATE + INTERVAL '30 days'
)
AND p.activo = true
AND pc.activo = true;

-- =====================================================================================
-- COMENTARIOS DE TABLAS (DOCUMENTACIÓN)
-- =====================================================================================

COMMENT ON TABLE ubicaciones IS 'Tabla maestra de tiendas y CEDIs';
COMMENT ON TABLE productos IS 'Catálogo maestro de productos';
COMMENT ON TABLE producto_ubicacion_config IS 'Configuración específica de stock por producto y ubicación';
COMMENT ON TABLE facturas IS 'Transacciones de venta';
COMMENT ON TABLE items_facturas IS 'Líneas de detalle de facturas';
COMMENT ON TABLE stock_actual IS 'Snapshot de inventario actual por ubicación';
COMMENT ON TABLE movimientos_inventario IS 'Histórico de movimientos de inventario';
COMMENT ON TABLE conjuntos_sustituibles IS 'Grupos de productos intercambiables';
COMMENT ON TABLE productos_abc_v2_historico IS 'Histórico de clasificaciones ABC-XYZ para análisis de tendencias';

-- =====================================================================================
-- PERMISOS (ajustar según usuarios PostgreSQL)
-- =====================================================================================

-- Crear usuario para backend (si no existe)
-- CREATE USER fluxion_backend WITH PASSWORD 'secure_password_here';

-- Grant permisos
-- GRANT CONNECT ON DATABASE fluxion_production TO fluxion_backend;
-- GRANT USAGE ON SCHEMA public TO fluxion_backend;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fluxion_backend;
-- GRANT SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO fluxion_backend;

-- =====================================================================================
-- FIN DEL SCHEMA
-- =====================================================================================
