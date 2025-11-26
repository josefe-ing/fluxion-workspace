-- ============================================================================
-- POSTGRESQL SCHEMA SIMPLIFICADO - FLUXION AI
-- ============================================================================
-- Diseñado para:
--   - Migración schema-first desde DuckDB (16GB) a PostgreSQL RDS
--   - ETL cada 30 minutos desde KLK API
--   - Enfoque en: Ventas + Inventario histórico + Configuraciones
--
-- Arquitectura: 9 tablas core
--   1. ubicaciones (maestro - 16 tiendas)
--   2. productos (maestro ligero - ~50K SKUs)
--   3. ventas (transaccional - 81M registros)
--   4. inventario_actual (NEW - estado actual ~800K registros)
--   5. inventario_historico (NEW - snapshots cada 30min time-series)
--   6. pedidos_sugeridos (módulo de pedidos)
--   7. pedidos_productos (líneas de pedido)
--   8. configuraciones (flexible - JSONB)
--   9. usuarios (autenticación y autorización)
-- ============================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ============================================================================
-- 1. UBICACIONES (Maestro de Tiendas/Almacenes)
-- ============================================================================
-- Fuente: GET /maestra/almacenes/Reposicion (KLK API)
-- Datos: 16 tiendas La Granja Mercado
-- Uso: Maestro referencial para ventas e inventario

CREATE TABLE ubicaciones (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    codigo VARCHAR(10) UNIQUE NOT NULL,           -- SUC001, SUC004, etc (del KLK)
    nombre VARCHAR(100) NOT NULL,                 -- La Granja - Altamira, etc
    tipo VARCHAR(20) NOT NULL,                    -- 'tienda', 'cedi', 'reposicion', 'pisoventa'
    ciudad VARCHAR(50),
    estado VARCHAR(50),
    activo BOOLEAN DEFAULT true,
    config JSONB,                                 -- Configuraciones específicas por tienda

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CHECK (tipo IN ('tienda', 'cedi', 'reposicion', 'pisoventa'))
);

-- Índices ubicaciones
CREATE INDEX idx_ubicaciones_codigo ON ubicaciones(codigo);
CREATE INDEX idx_ubicaciones_tipo ON ubicaciones(tipo);
CREATE INDEX idx_ubicaciones_activo ON ubicaciones(activo) WHERE activo = true;

COMMENT ON TABLE ubicaciones IS 'Maestro de tiendas y almacenes (16 ubicaciones La Granja)';
COMMENT ON COLUMN ubicaciones.codigo IS 'Código de sucursal del sistema KLK (SUC001, SUC004, etc)';
COMMENT ON COLUMN ubicaciones.tipo IS 'Tipo de almacén: tienda, cedi, reposicion, pisoventa';
COMMENT ON COLUMN ubicaciones.config IS 'Configuraciones específicas por tienda (horarios, capacidad, etc)';

-- ============================================================================
-- 2. PRODUCTOS (Maestro Ligero)
-- ============================================================================
-- Fuente: POST /maestra/articulos/almacen (KLK API)
-- Datos: ~50K SKUs activos
-- Peso: ~50MB
-- Uso: Catálogo de productos, endpoints /productos

CREATE TABLE productos (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    codigo VARCHAR(50) UNIQUE NOT NULL,           -- SKU del producto
    descripcion VARCHAR(200) NOT NULL,            -- Nombre descriptivo
    categoria VARCHAR(50),                        -- Categoría del producto
    unidad VARCHAR(20),                           -- Unidad de medida (kg, unidad, caja, etc)
    activo BOOLEAN DEFAULT true,
    metadata JSONB,                               -- Campos adicionales flexibles (marca, modelo, etc)

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices productos
CREATE INDEX idx_productos_codigo ON productos(codigo);
CREATE INDEX idx_productos_categoria ON productos(categoria);
CREATE INDEX idx_productos_activo ON productos(activo) WHERE activo = true;
CREATE INDEX idx_productos_descripcion ON productos USING gin(to_tsvector('spanish', descripcion));
CREATE INDEX idx_productos_metadata_gin ON productos USING gin(metadata);

COMMENT ON TABLE productos IS 'Maestro ligero de productos (~50K SKUs). Fuente: POST /maestra/articulos/almacen (KLK API)';
COMMENT ON COLUMN productos.codigo IS 'SKU único del producto';
COMMENT ON COLUMN productos.metadata IS 'Campos adicionales: marca, modelo, presentación, proveedor, etc';

-- ============================================================================
-- 3. VENTAS (Tabla Transaccional Principal)
-- ============================================================================
-- Fuente: POST /ventas (KLK API)
-- Datos: 81M registros históricos (13 meses: Sep 2024 - Sep 2025)
-- Peso: ~10GB (más pesada del sistema)
-- Uso: Base para forecasting, ABC-XYZ, pedidos sugeridos

CREATE TABLE ventas (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

    -- Dimensiones principales
    fecha DATE NOT NULL,                          -- Fecha de venta
    tienda_codigo VARCHAR(10) NOT NULL,          -- Código de tienda (SUC001, etc)
    almacen_codigo VARCHAR(20),                   -- Código de almacén (APP-TPF, PALT, etc)
    producto_codigo VARCHAR(50) NOT NULL,         -- Código de producto (001853, etc)

    -- Información de producto (denormalizado desde KLK API)
    producto_descripcion VARCHAR(200),            -- Descripción del producto
    producto_categoria VARCHAR(50),               -- Categoría
    producto_unidad VARCHAR(20),                  -- Unidad de medida

    -- Métricas de venta
    cantidad NUMERIC(12,4) NOT NULL,              -- Cantidad vendida
    precio_unitario NUMERIC(12,2),                -- Precio unitario
    monto_total NUMERIC(18,2),                    -- Monto total de la venta

    -- Metadatos adicionales del KLK (flexible)
    metadata JSONB,                               -- Datos extra del API (cliente, factura, etc)

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys (soft - no enforced por performance)
    -- tienda_codigo → ubicaciones.codigo (lookup)

    -- Constraints
    CHECK (cantidad >= 0),
    CHECK (monto_total >= 0)
);

-- Índices ventas (optimizados para queries OLAP)
CREATE INDEX idx_ventas_fecha ON ventas(fecha DESC);
CREATE INDEX idx_ventas_tienda ON ventas(tienda_codigo);
CREATE INDEX idx_ventas_producto ON ventas(producto_codigo);
CREATE INDEX idx_ventas_fecha_tienda ON ventas(fecha, tienda_codigo);
CREATE INDEX idx_ventas_fecha_producto ON ventas(fecha, producto_codigo);
CREATE INDEX idx_ventas_tienda_producto ON ventas(tienda_codigo, producto_codigo);

-- Índice compuesto para queries ABC-XYZ (frecuente)
CREATE INDEX idx_ventas_abc_xyz ON ventas(fecha, tienda_codigo, producto_codigo, cantidad, monto_total);

-- Índice JSONB para queries en metadata
CREATE INDEX idx_ventas_metadata_gin ON ventas USING gin(metadata);

-- Particionamiento por fecha (opcional - para futuro cuando crezca a 200M+)
-- CREATE TABLE ventas_2024 PARTITION OF ventas FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
-- CREATE TABLE ventas_2025 PARTITION OF ventas FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

COMMENT ON TABLE ventas IS 'Transacciones de venta (81M registros, ~10GB). Fuente: POST /ventas (KLK API)';
COMMENT ON COLUMN ventas.fecha IS 'Fecha de la transacción de venta';
COMMENT ON COLUMN ventas.tienda_codigo IS 'Código de sucursal (SUC001, SUC004, etc)';
COMMENT ON COLUMN ventas.almacen_codigo IS 'Código de almacén específico (APP-TPF, PALT, etc)';
COMMENT ON COLUMN ventas.producto_codigo IS 'Código SKU del producto';
COMMENT ON COLUMN ventas.metadata IS 'Datos adicionales del KLK API (cliente, factura, descuentos, etc)';

-- ============================================================================
-- 4. INVENTARIO_ACTUAL (Estado Actual del Inventario)
-- ============================================================================
-- Fuente: POST /maestra/articulos/almacen + POST /maestra/articulos/reposicion (KLK API)
-- Frecuencia: UPSERT cada 30 minutos (ETL automático)
-- Datos: ~800K registros (1 por producto/tienda - SOLO ESTADO ACTUAL)
-- Uso: Dashboard, consultas de stock actual, alertas de reposición

CREATE TABLE inventario_actual (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

    -- Dimensiones
    tienda_codigo VARCHAR(10) NOT NULL,          -- Código de sucursal (SUC001, etc)
    almacen_codigo VARCHAR(20),                   -- Código de almacén (PALT, APP-TPF, etc)
    producto_codigo VARCHAR(50) NOT NULL,         -- Código SKU

    -- Información de producto (denormalizado desde KLK API)
    producto_descripcion VARCHAR(200),            -- Descripción del producto
    producto_categoria VARCHAR(50),               -- Categoría
    producto_unidad VARCHAR(20),                  -- Unidad de medida

    -- Métricas de inventario
    cantidad_disponible NUMERIC(12,4) NOT NULL,   -- Stock actual disponible
    cantidad_reservada NUMERIC(12,4),             -- Stock reservado/comprometido
    cantidad_transito NUMERIC(12,4),              -- Stock en tránsito
    valor_inventario NUMERIC(18,2),               -- Valor monetario del inventario
    costo_unitario NUMERIC(12,2),                 -- Costo unitario del producto

    -- Flags de alerta
    requiere_reposicion BOOLEAN DEFAULT false,    -- Flag de reposición necesaria
    dias_inventario INTEGER,                      -- Días de inventario proyectados

    -- Metadatos del KLK (flexible)
    metadata JSONB,                               -- Datos extra del API response

    -- Timestamps
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CHECK (cantidad_disponible >= 0),
    CHECK (valor_inventario >= 0),

    -- Unique constraint: Un solo registro por producto/tienda
    UNIQUE(tienda_codigo, producto_codigo)
);

-- Índices inventario_actual (optimizados para queries rápidas de dashboard)
CREATE INDEX idx_inventario_actual_tienda ON inventario_actual(tienda_codigo);
CREATE INDEX idx_inventario_actual_producto ON inventario_actual(producto_codigo);
CREATE INDEX idx_inventario_actual_tienda_producto ON inventario_actual(tienda_codigo, producto_codigo);

-- Índice parcial para productos que requieren reposición (queries frecuentes)
CREATE INDEX idx_inventario_actual_requiere_reposicion
    ON inventario_actual(tienda_codigo, producto_codigo)
    WHERE requiere_reposicion = true;

-- Índice para búsquedas por categoría
CREATE INDEX idx_inventario_actual_categoria ON inventario_actual(producto_categoria);

-- Índice JSONB para queries en metadata
CREATE INDEX idx_inventario_actual_metadata_gin ON inventario_actual USING gin(metadata);

COMMENT ON TABLE inventario_actual IS 'Estado actual del inventario (~800K registros). Fuente: POST /maestra/articulos/almacen (KLK API). UPSERT cada 30 minutos';
COMMENT ON COLUMN inventario_actual.cantidad_disponible IS 'Stock disponible para venta en este momento';
COMMENT ON COLUMN inventario_actual.requiere_reposicion IS 'Flag calculado: true si stock < nivel objetivo';
COMMENT ON COLUMN inventario_actual.dias_inventario IS 'Días de inventario proyectados basado en venta promedio';
COMMENT ON COLUMN inventario_actual.ultima_actualizacion IS 'Timestamp de la última actualización del ETL';
COMMENT ON COLUMN inventario_actual.metadata IS 'Respuesta completa del KLK API para este producto/almacén';

-- ============================================================================
-- 5. INVENTARIO_HISTORICO (Time-Series para Gráficos de Tendencias)
-- ============================================================================
-- Fuente: POST /maestra/articulos/almacen + POST /maestra/articulos/reposicion (KLK API)
-- Frecuencia: INSERT cada 30 minutos (ETL automático)
-- Datos: Crece continuamente (snapshots históricos)
-- Crecimiento: ~38M registros/día (800K productos × 48 snapshots/día)
-- Uso: Gráficos de evolución de inventario, análisis histórico, tendencias

CREATE TABLE inventario_historico (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

    -- Snapshot temporal
    fecha_snapshot TIMESTAMP NOT NULL,            -- Timestamp exacto del snapshot (cada 30min)
    fecha_snapshot_date DATE GENERATED ALWAYS AS (fecha_snapshot::DATE) STORED,

    -- Dimensiones
    tienda_codigo VARCHAR(10) NOT NULL,          -- Código de sucursal (SUC001, etc)
    almacen_codigo VARCHAR(20),                   -- Código de almacén (PALT, APP-TPF, etc)
    producto_codigo VARCHAR(50) NOT NULL,         -- Código SKU

    -- Métricas de inventario (snapshot del momento)
    cantidad_disponible NUMERIC(12,4) NOT NULL,   -- Stock disponible en este snapshot
    cantidad_reservada NUMERIC(12,4),             -- Stock reservado en este snapshot
    cantidad_transito NUMERIC(12,4),              -- Stock en tránsito en este snapshot
    valor_inventario NUMERIC(18,2),               -- Valor monetario en este snapshot

    -- Flags de alerta (snapshot del momento)
    requiere_reposicion BOOLEAN DEFAULT false,    -- Flag de reposición en este snapshot
    dias_inventario INTEGER,                      -- Días de inventario en este snapshot

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CHECK (cantidad_disponible >= 0),

    -- Unique constraint: Un solo snapshot por producto/tienda/timestamp
    UNIQUE(fecha_snapshot, tienda_codigo, producto_codigo)
);

-- Índices inventario_historico (optimizados para time-series queries)
CREATE INDEX idx_inventario_hist_fecha_snapshot ON inventario_historico(fecha_snapshot DESC);
CREATE INDEX idx_inventario_hist_tienda ON inventario_historico(tienda_codigo);
CREATE INDEX idx_inventario_hist_producto ON inventario_historico(producto_codigo);
CREATE INDEX idx_inventario_hist_fecha_tienda_producto ON inventario_historico(fecha_snapshot, tienda_codigo, producto_codigo);

-- Índice para queries por rango de fechas (gráficos de evolución)
CREATE INDEX idx_inventario_hist_fecha_date ON inventario_historico(fecha_snapshot_date, producto_codigo, tienda_codigo);

-- Particionamiento por mes (recomendado para datos históricos grandes)
-- CREATE TABLE inventario_historico_2025_11 PARTITION OF inventario_historico
--     FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

COMMENT ON TABLE inventario_historico IS 'Snapshots históricos de inventario cada 30 minutos (time-series). Para gráficos de tendencias y análisis histórico';
COMMENT ON COLUMN inventario_historico.fecha_snapshot IS 'Timestamp exacto del snapshot ETL (cada 30 minutos)';
COMMENT ON COLUMN inventario_historico.cantidad_disponible IS 'Stock disponible en el momento del snapshot';
COMMENT ON COLUMN inventario_historico.requiere_reposicion IS 'Flag de reposición en el momento del snapshot';
COMMENT ON COLUMN inventario_historico.dias_inventario IS 'Días de inventario proyectados en el momento del snapshot';

-- ============================================================================
-- 5. PEDIDOS_SUGERIDOS (Módulo de Pedidos)
-- ============================================================================
-- Uso: Encabezado de pedidos sugeridos por el sistema
-- Origen: Generados automáticamente por algoritmos de reposición
-- Frecuencia: Cada 30 minutos (junto con snapshot de inventario)
-- Dependencias: 9 endpoints del módulo de pedidos dependen de esta tabla

CREATE TABLE pedidos_sugeridos (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

    -- Identificación del pedido
    tienda_codigo VARCHAR(10) NOT NULL,           -- Código de tienda destino (FK a ubicaciones)
    fecha_generacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Estado del pedido
    estado VARCHAR(20) NOT NULL DEFAULT 'borrador',  -- 'borrador', 'enviado', 'aprobado', 'rechazado', 'cancelado'

    -- Información adicional
    observaciones TEXT,                            -- Notas del sistema o usuario
    metadata JSONB,                                -- Metadatos flexibles (algoritmo usado, parámetros, etc)

    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT fk_pedidos_tienda FOREIGN KEY (tienda_codigo) REFERENCES ubicaciones(codigo) ON DELETE CASCADE,
    CONSTRAINT chk_pedidos_estado CHECK (estado IN ('borrador', 'enviado', 'aprobado', 'rechazado', 'cancelado'))
);

-- Índices pedidos_sugeridos
CREATE INDEX idx_pedidos_tienda ON pedidos_sugeridos(tienda_codigo);
CREATE INDEX idx_pedidos_fecha ON pedidos_sugeridos(fecha_generacion DESC);
CREATE INDEX idx_pedidos_estado ON pedidos_sugeridos(estado);
CREATE INDEX idx_pedidos_tienda_estado ON pedidos_sugeridos(tienda_codigo, estado);
CREATE INDEX idx_pedidos_metadata_gin ON pedidos_sugeridos USING gin(metadata);

-- Comentarios pedidos_sugeridos
COMMENT ON TABLE pedidos_sugeridos IS 'Encabezados de pedidos sugeridos generados automáticamente por algoritmos de reposición';
COMMENT ON COLUMN pedidos_sugeridos.tienda_codigo IS 'Tienda destino del pedido (FK a ubicaciones.codigo)';
COMMENT ON COLUMN pedidos_sugeridos.estado IS 'Estado del pedido: borrador, enviado, aprobado, rechazado, cancelado';
COMMENT ON COLUMN pedidos_sugeridos.observaciones IS 'Notas del sistema o usuario sobre el pedido';
COMMENT ON COLUMN pedidos_sugeridos.metadata IS 'Metadatos flexibles: algoritmo usado, parámetros, nivel de confianza, etc';

-- ============================================================================
-- 6. PEDIDOS_PRODUCTOS (Líneas de Pedido)
-- ============================================================================
-- Uso: Detalle/líneas de productos en cada pedido sugerido
-- Relación: N productos por cada pedido_sugerido (1:N)
-- Cantidades: cantidad_sugerida (original) vs cantidad_final (ajustada por usuario)

CREATE TABLE pedidos_productos (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

    -- Relaciones
    pedido_id VARCHAR(50) NOT NULL,                -- FK a pedidos_sugeridos
    producto_codigo VARCHAR(50) NOT NULL,          -- SKU del producto (referencia a productos.codigo)

    -- Información del producto (denormalizada para performance)
    producto_descripcion VARCHAR(200),             -- Descripción del producto al momento del pedido

    -- Cantidades
    cantidad_sugerida NUMERIC(12,4) NOT NULL,      -- Cantidad original sugerida por el algoritmo
    cantidad_final NUMERIC(12,4),                  -- Cantidad final ajustada por usuario (puede ser NULL si no se ajustó)

    -- Justificación
    razon TEXT,                                    -- Por qué se sugiere esta cantidad (ej: "Venta promedio: 50 unidades/día, stock actual: 10 unidades")
    comentarios TEXT,                              -- Comentarios del usuario sobre ajustes

    -- Metadata flexible
    metadata JSONB,                                -- Metadatos adicionales (nivel de stock, días de inventario, etc)

    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT fk_pedidos_productos_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos_sugeridos(id) ON DELETE CASCADE,
    CONSTRAINT fk_pedidos_productos_producto FOREIGN KEY (producto_codigo) REFERENCES productos(codigo) ON DELETE RESTRICT,
    CONSTRAINT chk_cantidad_sugerida_positiva CHECK (cantidad_sugerida > 0),
    CONSTRAINT chk_cantidad_final_positiva CHECK (cantidad_final IS NULL OR cantidad_final >= 0)
);

-- Índices pedidos_productos
CREATE INDEX idx_pedidos_productos_pedido ON pedidos_productos(pedido_id);
CREATE INDEX idx_pedidos_productos_producto ON pedidos_productos(producto_codigo);
CREATE INDEX idx_pedidos_productos_pedido_producto ON pedidos_productos(pedido_id, producto_codigo);
CREATE INDEX idx_pedidos_productos_metadata_gin ON pedidos_productos USING gin(metadata);

-- Comentarios pedidos_productos
COMMENT ON TABLE pedidos_productos IS 'Líneas/detalle de productos en cada pedido sugerido';
COMMENT ON COLUMN pedidos_productos.pedido_id IS 'Pedido al que pertenece esta línea (FK a pedidos_sugeridos.id, ON DELETE CASCADE)';
COMMENT ON COLUMN pedidos_productos.producto_codigo IS 'SKU del producto (FK a productos.codigo)';
COMMENT ON COLUMN pedidos_productos.cantidad_sugerida IS 'Cantidad original sugerida por el algoritmo de reposición';
COMMENT ON COLUMN pedidos_productos.cantidad_final IS 'Cantidad ajustada manualmente por usuario (NULL si no se modificó)';
COMMENT ON COLUMN pedidos_productos.razon IS 'Justificación del algoritmo para esta cantidad (ej: venta promedio, días de inventario)';
COMMENT ON COLUMN pedidos_productos.comentarios IS 'Comentarios del usuario sobre ajustes realizados';
COMMENT ON COLUMN pedidos_productos.metadata IS 'Metadatos adicionales: nivel de stock, días de inventario, prioridad, etc';

-- ============================================================================
-- 7. CONFIGURACIONES (Tabla Flexible JSONB)
-- ============================================================================
-- Uso: Todas las configuraciones del sistema (reemplaza ~5 tablas de config)
-- Tipos: 'sistema', 'tienda', 'producto', 'categoria', 'proveedor', etc
-- Ventaja: Schema-less, fácil de extender sin migraciones

CREATE TABLE configuraciones (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

    -- Identificación de la configuración
    tipo VARCHAR(50) NOT NULL,                    -- 'sistema', 'tienda', 'producto', 'categoria', etc
    clave VARCHAR(100) NOT NULL,                  -- Identificador único de la config
    nombre VARCHAR(200),                          -- Nombre descriptivo

    -- Configuración (JSONB flexible)
    config JSONB NOT NULL,                        -- Toda la configuración aquí

    -- Estado
    activo BOOLEAN DEFAULT true,

    -- Metadatos
    descripcion TEXT,                             -- Descripción de qué hace esta config

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint: Un tipo+clave único
    UNIQUE(tipo, clave)
);

-- Índices configuraciones
CREATE INDEX idx_config_tipo ON configuraciones(tipo);
CREATE INDEX idx_config_clave ON configuraciones(clave);
CREATE INDEX idx_config_tipo_clave ON configuraciones(tipo, clave);
CREATE INDEX idx_config_activo ON configuraciones(activo) WHERE activo = true;

-- Índice JSONB para queries dentro del config
CREATE INDEX idx_config_jsonb_gin ON configuraciones USING gin(config);

COMMENT ON TABLE configuraciones IS 'Configuraciones flexibles del sistema (JSONB schema-less)';
COMMENT ON COLUMN configuraciones.tipo IS 'Tipo de configuración: sistema, tienda, producto, categoria, abc_xyz, forecasting, etc';
COMMENT ON COLUMN configuraciones.clave IS 'Identificador único de la configuración (ej: SUC001, categoria_lacteos, forecast_prophet_params)';
COMMENT ON COLUMN configuraciones.config IS 'Configuración en formato JSONB flexible (permite cualquier estructura)';

-- ============================================================================
-- 8. USUARIOS (Autenticación y Autorización)
-- ============================================================================
-- Uso: Gestión de usuarios y autenticación del sistema
-- Auth: Contraseñas hasheadas con bcrypt
-- Permisos: Manejados a nivel de aplicación (no RLS por ahora)

CREATE TABLE usuarios (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,        -- bcrypt hash
    nombre_completo VARCHAR(100),
    email VARCHAR(100),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_login TIMESTAMP
);

-- Índices usuarios
CREATE INDEX idx_usuarios_username ON usuarios(username);
CREATE INDEX idx_usuarios_activo ON usuarios(activo) WHERE activo = true;
CREATE INDEX idx_usuarios_email ON usuarios(email);

COMMENT ON TABLE usuarios IS 'Usuarios del sistema con autenticación basada en bcrypt';
COMMENT ON COLUMN usuarios.username IS 'Nombre de usuario único para login';
COMMENT ON COLUMN usuarios.password_hash IS 'Hash bcrypt de la contraseña (nunca almacenar passwords en texto plano)';
COMMENT ON COLUMN usuarios.activo IS 'Flag de usuario activo (false = deshabilitado, no puede hacer login)';
COMMENT ON COLUMN usuarios.ultimo_login IS 'Timestamp del último login exitoso';

-- Trigger para updated_at
CREATE TRIGGER update_usuarios_updated_at
    BEFORE UPDATE ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- EJEMPLOS DE USO - CONFIGURACIONES
-- ============================================================================

-- Ejemplo 1: Configuración de sistema
-- INSERT INTO configuraciones (tipo, clave, nombre, config) VALUES (
--     'sistema',
--     'forecast_params',
--     'Parámetros de Forecasting con Prophet',
--     '{"model": "prophet", "seasonality_mode": "multiplicative", "changepoint_prior_scale": 0.05}'::JSONB
-- );

-- Ejemplo 2: Configuración por tienda
-- INSERT INTO configuraciones (tipo, clave, nombre, config) VALUES (
--     'tienda',
--     'SUC001',
--     'Configuración La Granja Altamira',
--     '{"capacidad_almacen_m2": 500, "horario_apertura": "08:00", "horario_cierre": "20:00", "dias_laborables": [1,2,3,4,5,6,7]}'::JSONB
-- );

-- Ejemplo 3: Configuración de producto
-- INSERT INTO configuraciones (tipo, clave, nombre, config) VALUES (
--     'producto',
--     '001853',
--     'Config Producto 001853',
--     '{"nivel_objetivo_dias": 30, "lead_time_dias": 7, "proveedor_principal": "PROV123", "es_perecedero": true, "dias_vencimiento": 90}'::JSONB
-- );

-- Ejemplo 4: Configuración de categoría ABC-XYZ
-- INSERT INTO configuraciones (tipo, clave, nombre, config) VALUES (
--     'categoria_abc',
--     'default',
--     'Umbrales de Clasificación ABC',
--     '{"A_threshold": 0.8, "B_threshold": 0.95, "metrica": "monto_acumulado"}'::JSONB
-- );

-- Ejemplo 5: Configuración de proveedor
-- INSERT INTO configuraciones (tipo, clave, nombre, config) VALUES (
--     'proveedor',
--     'PROV123',
--     'Proveedor ABC S.A.',
--     '{"razon_social": "ABC S.A.", "rif": "J-12345678-9", "lead_time_dias": 7, "pedido_minimo_unidades": 100, "contacto_email": "ventas@abc.com"}'::JSONB
-- );

-- ============================================================================
-- VISTAS ÚTILES
-- ============================================================================

-- Vista: Productos que requieren reposición urgente
CREATE OR REPLACE VIEW productos_requieren_reposicion AS
SELECT
    i.tienda_codigo,
    u.nombre AS tienda_nombre,
    i.producto_codigo,
    i.producto_descripcion,
    i.producto_categoria,
    i.cantidad_disponible,
    i.dias_inventario,
    i.valor_inventario,
    i.fecha_snapshot
FROM inventario_actual i
LEFT JOIN ubicaciones u ON i.tienda_codigo = u.codigo
WHERE i.requiere_reposicion = true
    AND i.cantidad_disponible >= 0  -- Excluir productos sin stock
ORDER BY i.dias_inventario ASC, i.valor_inventario DESC;

COMMENT ON VIEW productos_requieren_reposicion IS 'Productos que requieren reposición urgente (ordenados por días de inventario y valor)';

-- Vista: Resumen de ventas por tienda (últimos 30 días)
CREATE OR REPLACE VIEW resumen_ventas_30d AS
SELECT
    v.tienda_codigo,
    u.nombre AS tienda_nombre,
    COUNT(DISTINCT v.producto_codigo) AS productos_vendidos,
    SUM(v.cantidad) AS cantidad_total,
    SUM(v.monto_total) AS monto_total,
    AVG(v.monto_total) AS ticket_promedio,
    COUNT(*) AS numero_transacciones
FROM ventas v
LEFT JOIN ubicaciones u ON v.tienda_codigo = u.codigo
WHERE v.fecha >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY v.tienda_codigo, u.nombre
ORDER BY monto_total DESC;

COMMENT ON VIEW resumen_ventas_30d IS 'Resumen de ventas por tienda en los últimos 30 días';

-- ============================================================================
-- FUNCIONES ÚTILES
-- ============================================================================

-- Función: Obtener configuración por tipo y clave
CREATE OR REPLACE FUNCTION get_config(p_tipo VARCHAR, p_clave VARCHAR)
RETURNS JSONB AS $$
DECLARE
    v_config JSONB;
BEGIN
    SELECT config INTO v_config
    FROM configuraciones
    WHERE tipo = p_tipo
        AND clave = p_clave
        AND activo = true;

    RETURN COALESCE(v_config, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_config(VARCHAR, VARCHAR) IS 'Obtiene configuración por tipo y clave (retorna {} si no existe)';

-- Función: Actualizar timestamp de updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_ubicaciones_updated_at
    BEFORE UPDATE ON ubicaciones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_configuraciones_updated_at
    BEFORE UPDATE ON configuraciones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MONITORING & PERFORMANCE
-- ============================================================================

-- Habilitar pg_stat_statements para query performance monitoring
-- (Requiere: shared_preload_libraries = 'pg_stat_statements' en postgresql.conf)

-- Query para ver top queries por tiempo de ejecución
-- SELECT
--     query,
--     calls,
--     total_exec_time,
--     mean_exec_time,
--     max_exec_time
-- FROM pg_stat_statements
-- ORDER BY mean_exec_time DESC
-- LIMIT 20;

-- Query para ver tamaño de tablas
-- SELECT
--     schemaname,
--     tablename,
--     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
--     pg_total_relation_size(schemaname||'.'||tablename) AS bytes
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY bytes DESC;

-- ============================================================================
-- SECURITY
-- ============================================================================

-- Crear roles para acceso
CREATE ROLE fluxion_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO fluxion_readonly;

CREATE ROLE fluxion_readwrite;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO fluxion_readwrite;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO fluxion_readwrite;

-- Row Level Security (RLS) - opcional para multi-tenancy futuro
-- ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY ventas_tienda_policy ON ventas
--     FOR SELECT
--     USING (tienda_codigo = current_setting('app.current_tienda', TRUE));

-- ============================================================================
-- VACUUM & MAINTENANCE
-- ============================================================================

-- Configurar autovacuum para tablas de alto volumen
-- ALTER TABLE ventas SET (autovacuum_vacuum_scale_factor = 0.05);
-- ALTER TABLE inventario_historico SET (autovacuum_vacuum_scale_factor = 0.05);

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
--
-- 1. Este schema está diseñado para población vía ETL (no migración directa)
--
-- 2. INVENTARIO - Estrategia de dos tablas:
--    a) inventario_actual:
--       - UPSERT cada 30 minutos desde KLK API
--       - ON CONFLICT (tienda_codigo, producto_codigo) DO UPDATE
--       - Siempre contiene el estado más reciente (800K registros)
--    b) inventario_historico:
--       - INSERT cada 30 minutos (snapshot del momento)
--       - Time-series para gráficos de tendencias
--       - Crece ~38M registros/día (considerar particionamiento)
--    Ventaja: Queries de "inventario actual" son instantáneas (no buscan en histórico)
--
-- 3. VENTAS - Estrategia transaccional (una sola tabla):
--    - Naturaleza inmutable (write-once, no updates)
--    - Carga batch histórico (81M registros) + incremental diario
--    - Optimizar con particionamiento por mes/año
--    - No separar en actual/historico (no tiene sentido para eventos transaccionales)
--
-- 4. Configuraciones deben migrarse manualmente desde schema anterior
--
-- 5. Ubicaciones son maestro de 16 tiendas (carga one-time)
--
-- 6. Usuarios: Crear usuario admin por defecto después del deploy (ver ejemplo abajo)
--
-- Ejemplo: Crear usuario admin por defecto
-- import bcrypt
-- password = "admin123"
-- salt = bcrypt.gensalt()
-- hashed = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
-- INSERT INTO usuarios (id, username, password_hash, nombre_completo, email, activo)
-- VALUES (gen_random_uuid()::TEXT, 'admin', '{hashed}', 'Administrador', 'admin@fluxion.ai', true);
--
-- Estimación de almacenamiento:
-- - ventas: ~10GB (81M registros históricos + incremental)
-- - inventario_actual: ~50MB (800K registros - estado actual solamente)
-- - inventario_historico: ~1-2GB (snapshots cada 30 min x 30 días retention)
--   * Crece ~70MB/día (800K registros x 48 snapshots/día x ~2KB/registro)
--   * Considerar particionamiento por fecha cuando supere 5GB
-- - ubicaciones: <1MB (16 tiendas)
-- - productos: ~50MB (50K SKUs)
-- - pedidos_sugeridos + pedidos_productos: ~100MB (estimado)
-- - usuarios: <1MB (decenas de usuarios)
-- - configuraciones: <10MB (cientos de configs)
-- TOTAL: ~12GB (vs 16GB DuckDB - compresión mejorada)
--
-- RDS Sizing recomendado:
-- - Instance: db.t3.small (2 vCPU, 2GB RAM) - suficiente para empezar
-- - Storage: 30GB gp3 (con autoscaling hasta 100GB para crecimiento de inventario_historico)
-- - Backup: 7 días de retención automática
-- - Costo estimado: ~$35/mes
--
-- Performance considerations:
-- - Índices optimizados para queries OLAP típicos
-- - Particionamiento opcional cuando crezca a 200M+ registros
-- - JSONB para flexibilidad sin sacrificar performance de queries
-- - Views materializadas para dashboards si se necesitan (futuro)
--
-- ============================================================================
