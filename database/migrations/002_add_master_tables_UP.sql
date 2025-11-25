-- =========================================================================
-- Migration 002 UP: Add Master Tables (ubicaciones, productos)
-- Description: Core master tables for locations and products
-- Date: 2025-11-25
-- Author: System
-- =========================================================================
--
-- This migration creates the foundational master tables:
-- - Tabla: ubicaciones (tiendas y CEDIs)
-- - Tabla: productos (SKUs y catálogo)
-- - Indexes: Performance indexes for both tables
-- - Comments: Table and column documentation
--
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Create ubicaciones table (Locations: Stores and Distribution Centers)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ubicaciones (
    id VARCHAR(50) PRIMARY KEY,
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

-- -------------------------------------------------------------------------
-- 2. Create productos table (Products/SKUs)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
    id VARCHAR(50) PRIMARY KEY,
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

-- -------------------------------------------------------------------------
-- 3. Create indexes for query performance
-- -------------------------------------------------------------------------

-- Indexes for ubicaciones
CREATE INDEX IF NOT EXISTS idx_ubicaciones_codigo
    ON ubicaciones(codigo);

CREATE INDEX IF NOT EXISTS idx_ubicaciones_tipo
    ON ubicaciones(tipo);

CREATE INDEX IF NOT EXISTS idx_ubicaciones_ciudad
    ON ubicaciones(ciudad);

CREATE INDEX IF NOT EXISTS idx_ubicaciones_activo
    ON ubicaciones(activo);

-- Indexes for productos
CREATE INDEX IF NOT EXISTS idx_productos_codigo
    ON productos(codigo);

CREATE INDEX IF NOT EXISTS idx_productos_codigo_barras
    ON productos(codigo_barras);

CREATE INDEX IF NOT EXISTS idx_productos_categoria
    ON productos(categoria);

CREATE INDEX IF NOT EXISTS idx_productos_marca
    ON productos(marca);

CREATE INDEX IF NOT EXISTS idx_productos_activo
    ON productos(activo);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_productos_categoria_marca
    ON productos(categoria, marca);

-- -------------------------------------------------------------------------
-- 4. Add table and column comments
-- -------------------------------------------------------------------------

-- Ubicaciones table
COMMENT ON TABLE ubicaciones IS
    'Tabla maestra de ubicaciones (tiendas y CEDIs)';

COMMENT ON COLUMN ubicaciones.tipo IS
    'Tipo de ubicación: "tienda" para puntos de venta, "cedi" para centros de distribución';

COMMENT ON COLUMN ubicaciones.codigo IS
    'Código único corto de la ubicación (ej: T01, CEDI01)';

COMMENT ON COLUMN ubicaciones.capacidad_actual IS
    'Capacidad utilizada actual en m³ o unidades equivalentes';

COMMENT ON COLUMN ubicaciones.capacidad_maxima IS
    'Capacidad máxima de almacenamiento en m³ o unidades equivalentes';

-- Productos table
COMMENT ON TABLE productos IS
    'Catálogo maestro de productos (SKUs)';

COMMENT ON COLUMN productos.codigo IS
    'Código interno del producto en el sistema';

COMMENT ON COLUMN productos.codigo_barras IS
    'Código de barras EAN/UPC del producto';

COMMENT ON COLUMN productos.es_perecedero IS
    'Indica si el producto tiene fecha de vencimiento';

COMMENT ON COLUMN productos.dias_vencimiento IS
    'Días típicos hasta vencimiento para productos perecederos';

-- -------------------------------------------------------------------------
-- 5. Record this migration in schema_migrations
-- -------------------------------------------------------------------------
INSERT INTO schema_migrations (version, name)
VALUES ('002', 'add_master_tables')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 002 UP
-- =========================================================================
