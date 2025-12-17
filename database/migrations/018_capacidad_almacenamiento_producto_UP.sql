-- Migration: 018_capacidad_almacenamiento_producto_UP.sql
-- Description: Crear tabla para configurar capacidad máxima de almacenamiento por producto y tienda
-- Author: Fluxion AI
-- Date: 2025-12-17

-- =====================================================
-- TABLA: capacidad_almacenamiento_producto
-- =====================================================
-- Permite configurar límites de capacidad física por producto en cada tienda.
-- Ejemplo: Producto congelado X tiene máximo 200 unidades en Tienda Y (capacidad del congelador)

CREATE TABLE IF NOT EXISTS capacidad_almacenamiento_producto (
    id VARCHAR(100) PRIMARY KEY,
    tienda_id VARCHAR(50) NOT NULL,
    producto_codigo VARCHAR(50) NOT NULL,

    -- Capacidad máxima en unidades (opcional - NULL si solo se configura mínimo exhibición)
    capacidad_maxima_unidades DECIMAL(12,2),

    -- Tipo de restricción para mostrar al usuario
    -- Valores: 'congelador', 'refrigerador', 'anaquel', 'piso', 'exhibidor', 'custom'
    tipo_restriccion VARCHAR(50) DEFAULT 'espacio_fisico',

    -- Notas adicionales (ej: "2 freezers de 100 unidades cada uno")
    notas TEXT,

    -- Control de estado
    activo BOOLEAN DEFAULT true,

    -- Auditoría
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modificado_por VARCHAR(100) DEFAULT 'sistema',

    -- Constraint: un producto solo puede tener una configuración por tienda
    UNIQUE(tienda_id, producto_codigo)
);

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_cap_alm_tienda
    ON capacidad_almacenamiento_producto(tienda_id);

CREATE INDEX IF NOT EXISTS idx_cap_alm_producto
    ON capacidad_almacenamiento_producto(producto_codigo);

CREATE INDEX IF NOT EXISTS idx_cap_alm_activo
    ON capacidad_almacenamiento_producto(activo)
    WHERE activo = true;

-- Comentarios de documentación
COMMENT ON TABLE capacidad_almacenamiento_producto IS
    'Configuración de capacidad máxima de almacenamiento por producto y tienda. Usado para limitar sugerencias de pedido cuando el espacio físico es limitado (congeladores, refrigeradores, etc.)';

COMMENT ON COLUMN capacidad_almacenamiento_producto.capacidad_maxima_unidades IS
    'Máximo de unidades que pueden almacenarse físicamente en la tienda';

COMMENT ON COLUMN capacidad_almacenamiento_producto.tipo_restriccion IS
    'Tipo de restricción física: congelador, refrigerador, anaquel, piso, exhibidor, custom';

COMMENT ON COLUMN capacidad_almacenamiento_producto.notas IS
    'Notas explicativas visibles al usuario (ej: "2 freezers de 100 unidades")';
