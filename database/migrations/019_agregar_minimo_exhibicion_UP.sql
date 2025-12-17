-- Migration: 019_agregar_minimo_exhibicion_UP.sql
-- Description: Agregar columna de mínimo de exhibición a la tabla de capacidad de almacenamiento
-- Author: Fluxion AI
-- Date: 2025-12-17

-- =====================================================
-- AGREGAR MÍNIMO DE EXHIBICIÓN
-- =====================================================
-- El mínimo de exhibición es la cantidad mínima que debe haber en la tienda
-- para que el producto "se vea bien" en el mostrador/anaquel.
-- Ejemplo: Chocolates clase D con SS=5 unidades, pero para que el mostrador
-- se vea lleno necesitas mínimo 30 unidades.

-- Agregar columna de mínimo de exhibición
ALTER TABLE capacidad_almacenamiento_producto
ADD COLUMN IF NOT EXISTS minimo_exhibicion_unidades DECIMAL(12,2);

-- Renombrar tabla para reflejar que ahora tiene ambos límites (máx y mín)
-- NOTA: No renombramos la tabla para mantener compatibilidad, pero
-- conceptualmente ahora es "limites_inventario_producto"

-- Actualizar comentario de la tabla
COMMENT ON TABLE capacidad_almacenamiento_producto IS
    'Configuración de límites de inventario por producto y tienda. Incluye:
     - capacidad_maxima_unidades: Límite superior por espacio físico (congelador, anaquel, etc.)
     - minimo_exhibicion_unidades: Límite inferior para que el producto se vea bien en exhibición';

COMMENT ON COLUMN capacidad_almacenamiento_producto.minimo_exhibicion_unidades IS
    'Mínimo de unidades requeridas para que el producto se vea bien en exhibición. Si el ROP calculado es menor que este valor, se usa este valor como ROP efectivo.';
