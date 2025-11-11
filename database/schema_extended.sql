-- =====================================================================================
-- ESQUEMA EXTENDIDO FLUXION AI - CONFIGURACIÓN GRANULAR
-- Configuración por producto y por ubicación
-- =====================================================================================

-- =====================================================================================
-- TABLAS MAESTRAS (BÁSICAS)
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

    -- Capacidades físicas
    superficie_m2 DECIMAL(10,2),
    capacidad_almacenamiento_m3 DECIMAL(10,2),
    capacidad_maxima_productos INTEGER,

    -- Operación
    horario_apertura TIME,
    horario_cierre TIME,
    dias_operacion VARCHAR(20) DEFAULT '1234567', -- Lun-Dom como números
    zona_horaria VARCHAR(50) DEFAULT 'America/Caracas',

    -- Configuración de inventario
    dias_reposicion_promedio INTEGER DEFAULT 7,
    factor_seguridad DECIMAL(4,2) DEFAULT 1.5, -- Multiplicador para stock de seguridad

    -- Metadatos
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================================
-- CONFIGURACIÓN DE PRODUCTOS (CATÁLOGO MAESTRO)
-- =====================================================================================

-- Tabla principal de productos
CREATE TABLE productos (
    id VARCHAR PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL, -- Código interno
    codigo_barras VARCHAR(50), -- EAN/UPC
    codigo_proveedor VARCHAR(50), -- Código del proveedor

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
    peso_unidad DECIMAL(10,4), -- en gramos
    volumen_unidad DECIMAL(10,4), -- en ml/cm3
    unidad_medida VARCHAR(10) DEFAULT 'UND', -- UND, KG, L, etc.

    -- Costos y precios base
    costo_promedio DECIMAL(12,4),
    precio_sugerido DECIMAL(12,4),
    margen_sugerido DECIMAL(5,2), -- Porcentaje

    -- Configuración de inventario (defaults globales)
    dias_vencimiento INTEGER, -- NULL si no vence
    es_perecedero BOOLEAN DEFAULT false,
    requiere_refrigeracion BOOLEAN DEFAULT false,
    requiere_lote BOOLEAN DEFAULT false,

    -- Configuración de demanda
    estacionalidad VARCHAR(50), -- 'alta_demanda_diciembre', 'baja_verano', etc.
    patron_demanda VARCHAR(50), -- 'constante', 'variable', 'esporadico'
    abc_classification VARCHAR(1), -- A, B, C según importancia
    xyz_classification VARCHAR(1), -- X, Y, Z según variabilidad

    -- Conjuntos sustituibles
    conjunto_sustituible VARCHAR(100), -- ID del conjunto al que pertenece
    es_lider_conjunto BOOLEAN DEFAULT false, -- Si es el producto principal del conjunto

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

-- Tabla de configuración de categorías
CREATE TABLE categorias_config (
    id VARCHAR PRIMARY KEY,
    categoria VARCHAR(50) NOT NULL,
    subcategoria VARCHAR(50),

    -- Configuración de inventario por categoría
    rotacion_objetivo INTEGER, -- Rotaciones por año objetivo
    dias_cobertura_min INTEGER DEFAULT 7,
    dias_cobertura_max INTEGER DEFAULT 30,
    factor_seguridad DECIMAL(4,2) DEFAULT 1.2,

    -- Configuración de alertas
    alerta_stock_bajo_porcentaje DECIMAL(5,2) DEFAULT 20.0, -- % del stock mínimo
    alerta_vencimiento_dias INTEGER DEFAULT 30,
    alerta_sin_movimiento_dias INTEGER DEFAULT 60,

    -- Configuración de reposición
    frecuencia_revision_dias INTEGER DEFAULT 7,
    lote_minimo_pedido INTEGER DEFAULT 1,
    multiple_pedido INTEGER DEFAULT 1, -- Pedidos en múltiplos de esta cantidad

    -- Configuración de precios
    margen_minimo DECIMAL(5,2),
    margen_objetivo DECIMAL(5,2),
    margen_maximo DECIMAL(5,2),

    -- Metadatos
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(categoria, subcategoria)
);

-- =====================================================================================
-- CONFIGURACIÓN POR PRODUCTO Y UBICACIÓN (TABLA CRUCIAL)
-- =====================================================================================

-- Configuración específica de cada producto en cada ubicación
CREATE TABLE producto_ubicacion_config (
    id VARCHAR PRIMARY KEY,
    ubicacion_id VARCHAR NOT NULL,
    producto_id VARCHAR NOT NULL,

    -- Stock mínimo y máximo específicos para esta ubicación
    stock_minimo DECIMAL(12,4) NOT NULL,
    stock_maximo DECIMAL(12,4) NOT NULL,
    punto_reorden DECIMAL(12,4), -- Calculado o manual

    -- Configuración de demanda específica
    demanda_diaria_promedio DECIMAL(12,4), -- Calculada históricamente
    demanda_diaria_maxima DECIMAL(12,4),
    variabilidad_demanda DECIMAL(5,2), -- Coeficiente de variación %

    -- Tiempos específicos para esta ubicación
    lead_time_dias INTEGER DEFAULT 7, -- Tiempo de reposición
    dias_cobertura_objetivo INTEGER, -- Override del global
    dias_seguridad INTEGER DEFAULT 3, -- Stock de seguridad en días

    -- Configuración de pedidos
    lote_minimo_compra DECIMAL(12,4) DEFAULT 1,
    lote_multiple DECIMAL(12,4) DEFAULT 1, -- Pedidos en múltiplos
    cantidad_maxima_pedido DECIMAL(12,4), -- Límite por pedido

    -- Configuración de precios para esta ubicación
    precio_venta DECIMAL(12,4),
    margen_actual DECIMAL(5,2),
    precio_promocional DECIMAL(12,4),
    fecha_precio_promo_inicio DATE,
    fecha_precio_promo_fin DATE,

    -- Configuración de alertas específicas
    generar_alerta_stock_bajo BOOLEAN DEFAULT true,
    generar_alerta_vencimiento BOOLEAN DEFAULT true,
    generar_alerta_sobrestock BOOLEAN DEFAULT true,

    -- Restricciones específicas
    permitir_venta BOOLEAN DEFAULT true,
    permitir_transferencia BOOLEAN DEFAULT true,
    es_producto_estrella BOOLEAN DEFAULT false, -- Producto importante para esta ubicación

    -- Configuración de exhibición/ubicación física
    ubicacion_fisica VARCHAR(100), -- Pasillo, estante, etc.
    orden_exhibicion INTEGER, -- Para ordenar productos
    espacio_exhibicion_m2 DECIMAL(6,2),

    -- Metadatos
    activo BOOLEAN DEFAULT true,
    fecha_ultima_revision DATE,
    usuario_ultima_modificacion VARCHAR(100),
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    UNIQUE(ubicacion_id, producto_id),

    -- Validaciones
    CHECK (stock_minimo >= 0),
    CHECK (stock_maximo > stock_minimo),
    CHECK (lead_time_dias > 0),
    CHECK (dias_seguridad >= 0)
);

-- =====================================================================================
-- CONFIGURACIÓN DE PROVEEDORES POR PRODUCTO
-- =====================================================================================

-- Tabla de proveedores
CREATE TABLE proveedores (
    id VARCHAR PRIMARY KEY,
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
    descuento_pronto_pago DECIMAL(5,2) DEFAULT 0,
    monto_minimo_pedido DECIMAL(12,2),

    -- Configuración operativa
    lead_time_promedio INTEGER DEFAULT 7,
    dias_entrega VARCHAR(20), -- '1,3,5' para Lun, Mié, Vie
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

-- Productos por proveedor con configuración específica
CREATE TABLE producto_proveedor_config (
    id VARCHAR PRIMARY KEY,
    producto_id VARCHAR NOT NULL,
    proveedor_id VARCHAR NOT NULL,

    -- Códigos del proveedor
    codigo_proveedor VARCHAR(50),
    descripcion_proveedor VARCHAR(200),

    -- Precios y condiciones
    precio_compra DECIMAL(12,4) NOT NULL,
    precio_anterior DECIMAL(12,4),
    fecha_ultimo_precio DATE,
    moneda VARCHAR(3) DEFAULT 'VES',

    -- Condiciones de compra
    cantidad_minima DECIMAL(12,4) DEFAULT 1,
    multiple_compra DECIMAL(12,4) DEFAULT 1,
    lead_time_dias INTEGER DEFAULT 7,

    -- Preferencia
    es_proveedor_principal BOOLEAN DEFAULT false,
    orden_preferencia INTEGER DEFAULT 1,

    -- Control
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
    UNIQUE(producto_id, proveedor_id)
);

-- =====================================================================================
-- TABLAS TRANSACCIONALES (MANTENIDAS DEL ESQUEMA ANTERIOR)
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
-- TABLAS DE INVENTARIO (ACTUALIZADAS)
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
    subtipo_movimiento VARCHAR(30), -- 'venta', 'compra', 'devolucion', 'merma', etc.
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
    cantidad_reservada DECIMAL(12,4) DEFAULT 0,
    cantidad_disponible DECIMAL(12,4) NOT NULL DEFAULT 0,

    -- Valores
    valor_inventario DECIMAL(18,2),
    costo_promedio DECIMAL(12,4),

    -- Fechas de movimientos
    ultima_entrada TIMESTAMP,
    ultima_salida TIMESTAMP,
    ultima_venta TIMESTAMP,
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Estadísticas de demanda (calculadas)
    demanda_7_dias DECIMAL(12,4) DEFAULT 0,
    demanda_30_dias DECIMAL(12,4) DEFAULT 0,
    rotacion_anual DECIMAL(8,2) DEFAULT 0,

    -- Alertas y control
    requiere_reposicion BOOLEAN DEFAULT false,
    dias_sin_movimiento INTEGER DEFAULT 0,
    fecha_proximo_vencimiento DATE,

    -- Constraints
    PRIMARY KEY (ubicacion_id, producto_id),
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id),

    CHECK (cantidad >= 0),
    CHECK (cantidad_disponible >= 0),
    CHECK (cantidad_reservada >= 0)
);

-- =====================================================================================
-- TABLAS DE CONJUNTOS SUSTITUIBLES (PRODUCTOS INTERCAMBIABLES)
-- =====================================================================================

-- Tabla de conjuntos sustituibles
CREATE TABLE IF NOT EXISTS conjuntos_sustituibles (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,  -- ej: "azucar_blanca"
    descripcion VARCHAR(200),             -- ej: "Azúcar Blanca 1kg"
    categoria VARCHAR(50),
    tipo_conjunto VARCHAR(50) DEFAULT 'sustituibles',  -- 'sustituibles', 'complementarios'
    activo BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================================
-- HISTÓRICO DE CLASIFICACIONES ABC-XYZ
-- =====================================================================================

-- Tabla de histórico para tracking de clasificaciones en el tiempo
CREATE TABLE IF NOT EXISTS productos_abc_v2_historico (
    id VARCHAR PRIMARY KEY,
    codigo_producto VARCHAR(50) NOT NULL,
    ubicacion_id VARCHAR(20) NOT NULL,
    fecha_calculo DATE NOT NULL,
    clasificacion_abc_valor VARCHAR(20),
    clasificacion_xyz VARCHAR(1),
    matriz_abc_xyz VARCHAR(2),
    ranking_valor INTEGER,
    valor_consumo_total DECIMAL(18,2),
    porcentaje_valor DECIMAL(8,4),
    porcentaje_acumulado DECIMAL(8,4),
    coeficiente_variacion DECIMAL(8,4),
    demanda_promedio_semanal DECIMAL(12,4),
    UNIQUE(codigo_producto, ubicacion_id, fecha_calculo)
);

-- =====================================================================================
-- ÍNDICES OPTIMIZADOS PARA PERFORMANCE
-- =====================================================================================

-- Índices principales
CREATE INDEX IF NOT EXISTS idx_facturas_fecha_ubicacion ON facturas(fecha, ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_items_fecha_producto ON items_facturas(fecha, producto_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha_ubicacion_producto ON movimientos_inventario(fecha, ubicacion_id, producto_id);

-- Índices para configuración
CREATE INDEX IF NOT EXISTS idx_producto_ubicacion_activo ON producto_ubicacion_config(ubicacion_id, activo);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria, activo);
CREATE INDEX IF NOT EXISTS idx_productos_abc ON productos(abc_classification, activo);

-- Índices para stock
CREATE INDEX IF NOT EXISTS idx_stock_ubicacion ON stock_actual(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_stock_reposicion ON stock_actual(requiere_reposicion) WHERE requiere_reposicion = true;

-- Índices para conjuntos sustituibles
CREATE INDEX IF NOT EXISTS idx_conjuntos_nombre ON conjuntos_sustituibles(nombre);
CREATE INDEX IF NOT EXISTS idx_conjuntos_categoria ON conjuntos_sustituibles(categoria);

-- Índices para histórico ABC-XYZ
CREATE INDEX IF NOT EXISTS idx_historico_codigo ON productos_abc_v2_historico(codigo_producto);
CREATE INDEX IF NOT EXISTS idx_historico_ubicacion ON productos_abc_v2_historico(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_historico_fecha ON productos_abc_v2_historico(fecha_calculo);

-- =====================================================================================
-- VISTAS PARA DASHBOARDS Y REPORTES
-- =====================================================================================

-- Vista de productos con configuración completa por ubicación
CREATE VIEW productos_ubicacion_completa AS
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
LEFT JOIN stock_actual s ON pc.ubicacion_id = s.ubicacion_id AND pc.producto_id = s.producto_id
WHERE p.activo = true AND pc.activo = true;

-- Vista de alertas de inventario
CREATE VIEW alertas_inventario AS
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
        WHEN s.fecha_proximo_vencimiento <= CURRENT_DATE + INTERVAL 30 DAY THEN 'Próximo a vencer'
        ELSE 'Sin alerta'
    END as tipo_alerta,
    CASE
        WHEN s.cantidad <= pc.stock_minimo THEN 'CRITICA'
        WHEN s.dias_sin_movimiento > 60 THEN 'MEDIA'
        WHEN s.cantidad >= pc.stock_maximo THEN 'BAJA'
        WHEN s.fecha_proximo_vencimiento <= CURRENT_DATE + INTERVAL 30 DAY THEN 'ALTA'
        ELSE 'SIN_ALERTA'
    END as prioridad
FROM stock_actual s
JOIN producto_ubicacion_config pc ON s.ubicacion_id = pc.ubicacion_id AND s.producto_id = pc.producto_id
JOIN productos p ON s.producto_id = p.id
JOIN ubicaciones u ON s.ubicacion_id = u.id
WHERE (
    s.cantidad <= pc.stock_minimo OR
    s.dias_sin_movimiento > 60 OR
    s.cantidad >= pc.stock_maximo OR
    s.fecha_proximo_vencimiento <= CURRENT_DATE + INTERVAL 30 DAY
)
AND p.activo = true
AND pc.activo = true;