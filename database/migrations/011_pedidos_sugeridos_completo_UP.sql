-- =========================================================================
-- Migration 011 UP: Pedidos Sugeridos - Schema Completo para PostgreSQL
-- Description: Crea tablas completas para el sistema de pedidos sugeridos
-- Date: 2025-12-03
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Tabla principal: pedidos_sugeridos (encabezado)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pedidos_sugeridos (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    numero_pedido VARCHAR(20) UNIQUE NOT NULL,

    -- Ubicaciones
    cedi_origen_id VARCHAR(50) NOT NULL,
    cedi_origen_nombre VARCHAR(100),
    tienda_destino_id VARCHAR(50) NOT NULL,
    tienda_destino_nombre VARCHAR(100),

    -- Fechas
    fecha_pedido DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_entrega_solicitada DATE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_aprobacion TIMESTAMP,
    fecha_recepcion TIMESTAMP,
    fecha_inicio_picking TIMESTAMP,
    fecha_fin_picking TIMESTAMP,
    fecha_despacho TIMESTAMP,
    fecha_cancelacion TIMESTAMP,
    fecha_entrega_real DATE,
    fecha_aprobacion_gerente TIMESTAMP,

    -- Estado y control
    estado VARCHAR(50) NOT NULL DEFAULT 'borrador',
    sub_estado VARCHAR(50),
    requiere_aprobacion BOOLEAN DEFAULT false,

    -- Totales productos a recibir
    total_productos INTEGER DEFAULT 0,
    total_lineas INTEGER DEFAULT 0,
    total_bultos DECIMAL(12,4) DEFAULT 0,
    total_unidades DECIMAL(12,4) DEFAULT 0,
    total_peso_kg DECIMAL(12,4),
    total_volumen_m3 DECIMAL(12,4),

    -- Devoluciones
    tiene_devoluciones BOOLEAN DEFAULT false,
    total_productos_devolucion INTEGER DEFAULT 0,
    total_bultos_devolucion DECIMAL(12,4) DEFAULT 0,
    total_unidades_devolucion DECIMAL(12,4) DEFAULT 0,

    -- Configuración
    dias_cobertura INTEGER DEFAULT 3,
    tipo_pedido VARCHAR(50) DEFAULT 'reposicion',
    prioridad VARCHAR(20) DEFAULT 'normal',
    metodo_calculo VARCHAR(50) DEFAULT 'NIVEL_OBJETIVO_V2',

    -- Logística
    requiere_refrigeracion BOOLEAN DEFAULT false,
    requiere_congelacion BOOLEAN DEFAULT false,
    paleta_asignada VARCHAR(50),
    numero_guia VARCHAR(50),
    numero_orden_compra VARCHAR(50),
    numero_picking VARCHAR(50),

    -- Observaciones
    observaciones TEXT,
    notas_picking TEXT,
    notas_entrega TEXT,
    notas_recepcion TEXT,

    -- Usuarios
    usuario_creador VARCHAR(100) DEFAULT 'sistema',
    usuario_aprobador VARCHAR(100),
    usuario_aprobador_gerente VARCHAR(100),
    usuario_picker VARCHAR(100),
    usuario_receptor VARCHAR(100),

    -- Control de versiones
    version INTEGER DEFAULT 1,
    pedido_padre_id VARCHAR(50),

    -- Métricas
    porcentaje_cumplimiento DECIMAL(5,2),
    tiempo_preparacion_horas DECIMAL(8,2),

    -- Comentarios del gerente
    tiene_comentarios_gerente BOOLEAN DEFAULT false,

    -- Constraints
    CONSTRAINT chk_pedidos_estado CHECK (estado IN (
        'borrador', 'solicitado', 'pendiente_aprobacion_gerente',
        'aprobado_gerente', 'rechazado_gerente', 'aprobado',
        'en_preparacion', 'en_transito', 'recibido',
        'rechazado', 'cancelado', 'finalizado'
    )),
    CONSTRAINT chk_pedidos_prioridad CHECK (prioridad IN ('baja', 'normal', 'alta', 'urgente')),
    CONSTRAINT chk_pedidos_tipo CHECK (tipo_pedido IN ('reposicion', 'urgente', 'promocion', 'nuevo_producto', 'estacional', 'sugerido_v2'))
);

-- Índices para pedidos_sugeridos
CREATE INDEX IF NOT EXISTS idx_pedidos_numero ON pedidos_sugeridos(numero_pedido);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos_sugeridos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_tienda ON pedidos_sugeridos(tienda_destino_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cedi ON pedidos_sugeridos(cedi_origen_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha_creacion ON pedidos_sugeridos(fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha_pedido ON pedidos_sugeridos(fecha_pedido DESC);

-- -------------------------------------------------------------------------
-- 2. Tabla de detalle: pedidos_sugeridos_detalle (productos a recibir)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pedidos_sugeridos_detalle (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    pedido_id VARCHAR(50) NOT NULL REFERENCES pedidos_sugeridos(id) ON DELETE CASCADE,
    linea_numero INTEGER NOT NULL,

    -- Identificación del producto
    codigo_producto VARCHAR(50) NOT NULL,
    codigo_barras VARCHAR(50),
    descripcion_producto VARCHAR(200),

    -- Clasificación
    categoria VARCHAR(100),
    grupo VARCHAR(100),
    subgrupo VARCHAR(100),
    marca VARCHAR(100),
    modelo VARCHAR(100),
    presentacion VARCHAR(100),
    cuadrante_producto VARCHAR(20),
    clasificacion_abc VARCHAR(5),

    -- Cantidades físicas del producto
    cantidad_bultos DECIMAL(12,4) DEFAULT 1,
    peso_unitario_kg DECIMAL(12,4),
    volumen_unitario_m3 DECIMAL(12,4),

    -- Cantidades sugeridas (sistema)
    cantidad_sugerida_unidades DECIMAL(12,4) DEFAULT 0,
    cantidad_sugerida_bultos DECIMAL(12,4) DEFAULT 0,

    -- Cantidades pedidas (usuario)
    cantidad_pedida_unidades DECIMAL(12,4) DEFAULT 0,
    cantidad_pedida_bultos DECIMAL(12,4) DEFAULT 0,

    -- Totales
    total_unidades DECIMAL(12,4) DEFAULT 0,

    -- Métricas de ventas
    prom_ventas_5dias_unid DECIMAL(12,4) DEFAULT 0,
    prom_ventas_8sem_unid DECIMAL(12,4) DEFAULT 0,
    prom_ventas_8sem_bultos DECIMAL(12,4) DEFAULT 0,

    -- Stock
    stock_tienda DECIMAL(12,4) DEFAULT 0,
    stock_cedi_origen DECIMAL(12,4) DEFAULT 0,
    stock_total DECIMAL(12,4) DEFAULT 0,

    -- Parámetros de inventario
    stock_minimo DECIMAL(12,4) DEFAULT 0,
    stock_maximo DECIMAL(12,4) DEFAULT 0,
    punto_reorden DECIMAL(12,4) DEFAULT 0,

    -- Control
    razon_pedido VARCHAR(500),
    incluido BOOLEAN DEFAULT true,
    observaciones TEXT,

    -- Cantidades reales (picking/recepción)
    cantidad_pickeada_bultos DECIMAL(12,4),
    cantidad_pickeada_unidades DECIMAL(12,4),
    cantidad_recibida_bultos DECIMAL(12,4),
    cantidad_recibida_unidades DECIMAL(12,4),
    cantidad_rechazada_unidades DECIMAL(12,4),

    -- Estado
    estado_linea VARCHAR(50) DEFAULT 'pendiente',
    motivo_rechazo TEXT,

    -- Auditoría
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP,

    CONSTRAINT chk_detalle_estado CHECK (estado_linea IN (
        'pendiente', 'aprobada', 'pickeada', 'empacada',
        'despachada', 'recibida', 'rechazada', 'faltante'
    ))
);

-- Índices para pedidos_sugeridos_detalle
CREATE INDEX IF NOT EXISTS idx_detalle_pedido ON pedidos_sugeridos_detalle(pedido_id);
CREATE INDEX IF NOT EXISTS idx_detalle_producto ON pedidos_sugeridos_detalle(codigo_producto);
CREATE INDEX IF NOT EXISTS idx_detalle_pedido_linea ON pedidos_sugeridos_detalle(pedido_id, linea_numero);

-- -------------------------------------------------------------------------
-- 3. Tabla de devoluciones: pedidos_sugeridos_devoluciones
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pedidos_sugeridos_devoluciones (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    pedido_id VARCHAR(50) NOT NULL REFERENCES pedidos_sugeridos(id) ON DELETE CASCADE,
    linea_numero INTEGER NOT NULL,

    -- Identificación del producto
    codigo_producto VARCHAR(50) NOT NULL,
    codigo_barras VARCHAR(50),
    descripcion_producto VARCHAR(200),

    -- Clasificación
    categoria VARCHAR(100),
    grupo VARCHAR(100),
    subgrupo VARCHAR(100),
    marca VARCHAR(100),
    presentacion VARCHAR(100),
    cuadrante_producto VARCHAR(20),

    -- Cantidades físicas
    cantidad_bultos DECIMAL(12,4) DEFAULT 1,

    -- Stock y límites
    stock_actual_tienda DECIMAL(12,4) DEFAULT 0,
    stock_maximo DECIMAL(12,4) DEFAULT 0,
    stock_optimo DECIMAL(12,4),
    exceso_unidades DECIMAL(12,4) DEFAULT 0,
    exceso_bultos DECIMAL(12,4) DEFAULT 0,

    -- Devolución sugerida
    devolucion_sugerida_unidades DECIMAL(12,4) DEFAULT 0,
    devolucion_sugerida_bultos DECIMAL(12,4) DEFAULT 0,

    -- Devolución confirmada
    devolucion_confirmada_unidades DECIMAL(12,4) DEFAULT 0,
    devolucion_confirmada_bultos DECIMAL(12,4) DEFAULT 0,
    total_unidades_devolver DECIMAL(12,4) DEFAULT 0,

    -- Análisis
    razon_devolucion VARCHAR(500),
    prioridad_devolucion VARCHAR(20) DEFAULT 'media',
    dias_sin_venta INTEGER,
    prom_ventas_30dias DECIMAL(12,4),
    dias_cobertura_actual DECIMAL(12,4),

    -- Control
    incluido BOOLEAN DEFAULT true,
    observaciones TEXT,

    -- Auditoría
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_devolucion_prioridad CHECK (prioridad_devolucion IN ('baja', 'media', 'alta', 'urgente'))
);

-- Índices para devoluciones
CREATE INDEX IF NOT EXISTS idx_devoluciones_pedido ON pedidos_sugeridos_devoluciones(pedido_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_producto ON pedidos_sugeridos_devoluciones(codigo_producto);

-- -------------------------------------------------------------------------
-- 4. Tabla de historial: pedidos_sugeridos_historial
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pedidos_sugeridos_historial (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    pedido_id VARCHAR(50) NOT NULL REFERENCES pedidos_sugeridos(id) ON DELETE CASCADE,
    estado_anterior VARCHAR(50),
    estado_nuevo VARCHAR(50) NOT NULL,
    motivo_cambio TEXT,
    usuario VARCHAR(100) DEFAULT 'sistema',
    fecha_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para historial
CREATE INDEX IF NOT EXISTS idx_historial_pedido ON pedidos_sugeridos_historial(pedido_id);
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON pedidos_sugeridos_historial(fecha_cambio DESC);

-- -------------------------------------------------------------------------
-- 5. Tabla de comentarios: pedidos_sugeridos_comentarios
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pedidos_sugeridos_comentarios (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    pedido_id VARCHAR(50) NOT NULL REFERENCES pedidos_sugeridos(id) ON DELETE CASCADE,
    tipo_comentario VARCHAR(50) DEFAULT 'general',
    comentario TEXT NOT NULL,
    usuario VARCHAR(100) DEFAULT 'sistema',
    fecha_comentario TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    es_publico BOOLEAN DEFAULT true,
    es_importante BOOLEAN DEFAULT false
);

-- Índices para comentarios
CREATE INDEX IF NOT EXISTS idx_comentarios_pedido ON pedidos_sugeridos_comentarios(pedido_id);

-- -------------------------------------------------------------------------
-- 6. Record migration
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('011', 'pedidos_sugeridos_completo')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 011 UP
-- =========================================================================
