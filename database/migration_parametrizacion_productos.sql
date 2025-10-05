-- =====================================================
-- MIGRACIÓN: Sistema de Parametrización de Productos
-- =====================================================
-- Fecha: 2025-10-03
-- Descripción: Crea la estructura para parametrización de productos por tienda
--              con clasificación A/AB/B/BC/C basada en venta diaria/bultos
-- =====================================================

-- =====================================================
-- 1. TABLA: productos_maestro
-- =====================================================
-- Catálogo maestro de productos consolidado
-- Fuente: inventario_raw
-- Registros esperados: ~4,159 productos únicos
-- =====================================================

CREATE TABLE IF NOT EXISTS productos_maestro (
    producto_id VARCHAR PRIMARY KEY,
    codigo_producto VARCHAR NOT NULL,
    descripcion_producto VARCHAR NOT NULL,
    categoria_producto VARCHAR,
    unidad_medida VARCHAR,
    codigo_barras VARCHAR,
    peso_neto DECIMAL(12,4),
    peso_bruto DECIMAL(12,4),
    volumen DECIMAL(12,4),
    unidades_por_bulto INTEGER DEFAULT 1,
    es_perecedero BOOLEAN DEFAULT FALSE,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Índices
    CONSTRAINT uk_productos_maestro_codigo UNIQUE (codigo_producto)
);

CREATE INDEX IF NOT EXISTS idx_productos_maestro_categoria
    ON productos_maestro(categoria_producto);
CREATE INDEX IF NOT EXISTS idx_productos_maestro_activo
    ON productos_maestro(activo);

COMMENT ON TABLE productos_maestro IS 'Catálogo maestro de productos consolidado';

-- =====================================================
-- 2. TABLA: parametros_clasificacion
-- =====================================================
-- Reglas de negocio para clasificación A/AB/B/BC/C
-- Registros esperados: 15 (5 clasificaciones × 3 niveles variabilidad)
-- =====================================================

CREATE TABLE IF NOT EXISTS parametros_clasificacion (
    parametro_id INTEGER PRIMARY KEY,
    clasificacion VARCHAR(2) NOT NULL,  -- A, AB, B, BC, C
    variabilidad VARCHAR(10) NOT NULL,  -- Baja, Media, Alta

    -- Criterios de clasificación
    venta_diaria_bultos_min DECIMAL(10,4) NOT NULL,
    venta_diaria_bultos_max DECIMAL(10,4) NOT NULL,

    -- Parámetros de stock
    dias_cobertura_min INTEGER NOT NULL,
    dias_cobertura_seguridad INTEGER NOT NULL,
    dias_cobertura_max INTEGER NOT NULL,

    -- Factores de ajuste
    factor_seguridad DECIMAL(4,2) DEFAULT 1.0,
    factor_estacionalidad DECIMAL(4,2) DEFAULT 1.0,

    -- Metadata
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notas TEXT,

    -- Constraints
    CONSTRAINT uk_parametros_clasificacion
        UNIQUE (clasificacion, variabilidad),
    CONSTRAINT chk_venta_diaria_range
        CHECK (venta_diaria_bultos_min <= venta_diaria_bultos_max),
    CONSTRAINT chk_dias_cobertura_orden
        CHECK (dias_cobertura_min <= dias_cobertura_seguridad
           AND dias_cobertura_seguridad <= dias_cobertura_max)
);

CREATE INDEX IF NOT EXISTS idx_parametros_clasificacion_activo
    ON parametros_clasificacion(activo);

COMMENT ON TABLE parametros_clasificacion IS 'Reglas de negocio para clasificación ABC';

-- =====================================================
-- 3. TABLA: clasificacion_producto_tienda
-- =====================================================
-- Clasificación A/AB/B/BC/C de cada producto por tienda
-- Fuente: Calculado desde ventas_raw
-- Registros esperados: ~75,000 (4,159 productos × 18 tiendas)
-- =====================================================

CREATE TABLE IF NOT EXISTS clasificacion_producto_tienda (
    clasificacion_id INTEGER PRIMARY KEY,
    ubicacion_id VARCHAR NOT NULL,
    producto_id VARCHAR NOT NULL,

    -- Clasificación calculada
    clasificacion VARCHAR(2) NOT NULL,  -- A, AB, B, BC, C
    variabilidad VARCHAR(10),           -- Baja, Media, Alta (basado en CV%)

    -- Métricas de ventas (últimos 90 días)
    venta_diaria_bultos DECIMAL(12,4),
    venta_diaria_unidades DECIMAL(12,4),
    venta_mensual_bultos DECIMAL(12,4),
    coeficiente_variacion DECIMAL(6,2), -- CV% para clasificación XYZ

    -- Metadata de cálculo
    fecha_inicio_periodo DATE,
    fecha_fin_periodo DATE,
    dias_con_venta INTEGER,
    dias_sin_venta INTEGER,
    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(ubicacion_id),
    FOREIGN KEY (producto_id) REFERENCES productos_maestro(producto_id),

    -- Constraints
    CONSTRAINT uk_clasificacion_producto_tienda
        UNIQUE (ubicacion_id, producto_id),
    CONSTRAINT chk_clasificacion_valida
        CHECK (clasificacion IN ('A', 'AB', 'B', 'BC', 'C'))
);

CREATE INDEX IF NOT EXISTS idx_clasificacion_producto_tienda_ubicacion
    ON clasificacion_producto_tienda(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_clasificacion_producto_tienda_producto
    ON clasificacion_producto_tienda(producto_id);
CREATE INDEX IF NOT EXISTS idx_clasificacion_producto_tienda_clase
    ON clasificacion_producto_tienda(clasificacion);

COMMENT ON TABLE clasificacion_producto_tienda IS 'Clasificación ABC de productos por tienda';

-- =====================================================
-- 4. ACTUALIZAR: producto_ubicacion_config
-- =====================================================
-- Esta tabla YA EXISTE con 300 registros
-- Solo agregamos foreign keys y campos faltantes
-- =====================================================

-- Agregar foreign keys si no existen
ALTER TABLE producto_ubicacion_config
    ADD COLUMN IF NOT EXISTS clasificacion VARCHAR(2);

ALTER TABLE producto_ubicacion_config
    ADD COLUMN IF NOT EXISTS variabilidad VARCHAR(10);

ALTER TABLE producto_ubicacion_config
    ADD COLUMN IF NOT EXISTS fecha_calculo TIMESTAMP;

-- Crear índices si no existen
CREATE INDEX IF NOT EXISTS idx_producto_ubicacion_config_ubicacion
    ON producto_ubicacion_config(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_producto_ubicacion_config_producto
    ON producto_ubicacion_config(producto_id);
CREATE INDEX IF NOT EXISTS idx_producto_ubicacion_config_clasificacion
    ON producto_ubicacion_config(clasificacion);

COMMENT ON TABLE producto_ubicacion_config IS 'Parametrización final de productos por tienda con stock mínimo/máximo';

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================
