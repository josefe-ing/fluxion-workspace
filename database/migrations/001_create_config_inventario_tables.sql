-- ============================================================================
-- MIGRACIÓN: Sistema de Configuración Dinámica de Inventario
-- Fecha: 2025-11-05
-- Descripción: Mueve parametrización de stock desde código a base de datos
-- ============================================================================

-- 1. Configuración Global (parámetros del sistema)
CREATE TABLE IF NOT EXISTS config_inventario_global (
    id VARCHAR PRIMARY KEY,
    categoria VARCHAR NOT NULL,  -- 'abc_umbrales', 'xyz_umbrales', 'niveles_servicio', etc.
    parametro VARCHAR NOT NULL,
    valor_numerico DECIMAL(10,4),
    valor_texto VARCHAR,
    descripcion VARCHAR,
    unidad VARCHAR,  -- 'bultos_dia', 'coeficiente', 'porcentaje', 'dias', 'zscore'
    activo BOOLEAN DEFAULT true,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modificado_por VARCHAR DEFAULT 'sistema',
    UNIQUE(categoria, parametro)
);

-- 2. Configuración por Tienda
CREATE TABLE IF NOT EXISTS config_inventario_tienda (
    id VARCHAR PRIMARY KEY,
    tienda_id VARCHAR NOT NULL,
    categoria_producto VARCHAR NOT NULL,  -- 'seco', 'frio', 'verde'
    clasificacion_abc VARCHAR NOT NULL,   -- 'A', 'AB', 'B', 'BC', 'C'
    stock_min_multiplicador DECIMAL(6,2),
    stock_seg_multiplicador DECIMAL(6,2),
    stock_max_multiplicador DECIMAL(6,2),
    lead_time_dias INTEGER DEFAULT 3,
    activo BOOLEAN DEFAULT true,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modificado_por VARCHAR DEFAULT 'sistema',
    UNIQUE(tienda_id, categoria_producto, clasificacion_abc)
);

-- 3. Configuración por Producto Individual (SOLO Frío/Verde)
CREATE TABLE IF NOT EXISTS config_inventario_producto (
    id VARCHAR PRIMARY KEY,
    codigo_producto VARCHAR NOT NULL,
    tienda_id VARCHAR NOT NULL,
    categoria_producto VARCHAR NOT NULL,  -- 'frio' o 'verde' únicamente

    -- Parámetros de stock
    stock_min_multiplicador DECIMAL(6,2),
    stock_seg_multiplicador DECIMAL(6,2),
    stock_max_multiplicador DECIMAL(6,2),
    lead_time_dias INTEGER,

    -- Parámetros específicos de perecederos
    dias_vida_util INTEGER,
    umbral_merma_pct DECIMAL(5,2),

    -- Patrones de demanda
    patron_fin_semana BOOLEAN DEFAULT false,
    patron_quincena BOOLEAN DEFAULT false,
    dias_no_pedir VARCHAR,  -- Ej: 'Lunes,Miércoles'

    -- Override de clasificación ABC (opcional)
    clasificacion_abc_override VARCHAR,

    observaciones TEXT,
    activo BOOLEAN DEFAULT true,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modificado_por VARCHAR DEFAULT 'sistema',

    UNIQUE(codigo_producto, tienda_id)
);

-- 4. Mapeo de Productos a Categorías
CREATE TABLE IF NOT EXISTS productos_categoria (
    codigo_producto VARCHAR PRIMARY KEY,
    categoria_producto VARCHAR NOT NULL,  -- 'seco', 'frio', 'verde'
    subcategoria VARCHAR,  -- 'carniceria', 'charcuteria', 'fruver', etc.
    cedi_origen_id VARCHAR,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ÍNDICES para optimizar consultas
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_config_global_categoria
    ON config_inventario_global(categoria, activo);

CREATE INDEX IF NOT EXISTS idx_config_tienda_lookup
    ON config_inventario_tienda(tienda_id, categoria_producto, clasificacion_abc);

CREATE INDEX IF NOT EXISTS idx_config_producto_lookup
    ON config_inventario_producto(codigo_producto, tienda_id, activo);

CREATE INDEX IF NOT EXISTS idx_productos_categoria_lookup
    ON productos_categoria(codigo_producto);

CREATE INDEX IF NOT EXISTS idx_productos_categoria_tipo
    ON productos_categoria(categoria_producto);

-- ============================================================================
-- DATOS INICIALES: Configuración Global
-- ============================================================================

-- Umbrales de Clasificación ABC
INSERT INTO config_inventario_global (id, categoria, parametro, valor_numerico, descripcion, unidad) VALUES
('abc_umbral_a', 'abc_umbrales', 'umbral_a', 20.0, 'Umbral mínimo para clasificación A', 'bultos_dia'),
('abc_umbral_ab', 'abc_umbrales', 'umbral_ab', 5.0, 'Umbral mínimo para clasificación AB', 'bultos_dia'),
('abc_umbral_b', 'abc_umbrales', 'umbral_b', 0.45, 'Umbral mínimo para clasificación B', 'bultos_dia'),
('abc_umbral_bc', 'abc_umbrales', 'umbral_bc', 0.2, 'Umbral mínimo para clasificación BC', 'bultos_dia'),
('abc_umbral_c', 'abc_umbrales', 'umbral_c', 0.001, 'Umbral mínimo para clasificación C', 'bultos_dia');

-- Umbrales de Clasificación XYZ
INSERT INTO config_inventario_global (id, categoria, parametro, valor_numerico, descripcion, unidad) VALUES
('xyz_umbral_x', 'xyz_umbrales', 'umbral_x', 0.5, 'CV máximo para clasificación X (Predecible)', 'coeficiente'),
('xyz_umbral_y', 'xyz_umbrales', 'umbral_y', 1.0, 'CV máximo para clasificación Y (Variable)', 'coeficiente');

-- Niveles de Servicio (Z-scores) por ABC
INSERT INTO config_inventario_global (id, categoria, parametro, valor_numerico, descripcion, unidad) VALUES
('zscore_a', 'niveles_servicio', 'zscore_a', 2.33, 'Z-score para clase A (99% servicio)', 'zscore'),
('zscore_ab', 'niveles_servicio', 'zscore_ab', 2.05, 'Z-score para clase AB (98% servicio)', 'zscore'),
('zscore_b', 'niveles_servicio', 'zscore_b', 1.65, 'Z-score para clase B (95% servicio)', 'zscore'),
('zscore_bc', 'niveles_servicio', 'zscore_bc', 1.28, 'Z-score para clase BC (90% servicio)', 'zscore'),
('zscore_c', 'niveles_servicio', 'zscore_c', 0.84, 'Z-score para clase C (80% servicio)', 'zscore');

-- Ajustes por Variabilidad XYZ
INSERT INTO config_inventario_global (id, categoria, parametro, valor_numerico, descripcion, unidad) VALUES
('ajuste_xyz_x', 'ajustes_xyz', 'ajuste_x', 0.8, 'Ajuste para productos X (Predecibles): -20%', 'multiplicador'),
('ajuste_xyz_y', 'ajustes_xyz', 'ajuste_y', 1.0, 'Ajuste para productos Y (Variables): 0%', 'multiplicador'),
('ajuste_xyz_z', 'ajustes_xyz', 'ajuste_z', 1.3, 'Ajuste para productos Z (Erráticos): +30%', 'multiplicador');

-- Parámetros de Tendencias
INSERT INTO config_inventario_global (id, categoria, parametro, valor_numerico, descripcion, unidad) VALUES
('tend_periodo_corto', 'tendencias', 'periodo_corto', 5, 'Días para calcular venta reciente', 'dias'),
('tend_periodo_largo', 'tendencias', 'periodo_largo', 20, 'Días para calcular venta histórica', 'dias'),
('tend_umbral_sig', 'tendencias', 'umbral_significancia', 0.20, 'Umbral para considerar tendencia significativa', 'porcentaje');

-- Factores Estacionales
INSERT INTO config_inventario_global (id, categoria, parametro, valor_numerico, descripcion, unidad) VALUES
('estac_fin_semana', 'estacionalidad', 'factor_fin_semana', 1.4, 'Factor de ajuste para fin de semana (+40%)', 'multiplicador'),
('estac_quincena', 'estacionalidad', 'factor_quincena', 1.2, 'Factor de ajuste para quincena (+20%)', 'multiplicador');

INSERT INTO config_inventario_global (id, categoria, parametro, valor_texto, descripcion, unidad) VALUES
('estac_quin_dias_1', 'estacionalidad', 'quincena_dias_1', '1-7', 'Días de primera quincena', 'texto'),
('estac_quin_dias_2', 'estacionalidad', 'quincena_dias_2', '15-22', 'Días de segunda quincena', 'texto');

-- Parámetros Generales de Stock
INSERT INTO config_inventario_global (id, categoria, parametro, valor_numerico, descripcion, unidad) VALUES
('stock_lead_time', 'stock_general', 'lead_time_dias', 3, 'Lead time por defecto desde CEDI', 'dias'),
('stock_min_dias', 'stock_general', 'stock_min_dias', 3, 'Días de cobertura para stock mínimo', 'dias'),
('stock_max_dias', 'stock_general', 'stock_max_dias', 6, 'Días de cobertura para stock máximo', 'dias');

-- ============================================================================
-- COMENTARIOS Y METADATA (DuckDB no soporta COMMENT ON TABLE)
-- ============================================================================
-- config_inventario_global: Configuración global del sistema de inventario
-- config_inventario_tienda: Configuración específica por tienda y categoría de producto
-- config_inventario_producto: Configuración individual de productos perecederos (Frío/Verde)
-- productos_categoria: Mapeo de productos a categorías (Seco/Frío/Verde)
