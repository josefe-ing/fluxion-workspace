-- Script para pre-calentar caché de tienda_08 (Bosque)
-- Ejecutar después de reiniciar RDS o cuando hay lentitud

\timing on

\echo '🔥 Pre-calentando caché para tienda_08...'

-- Cargar datos de ventas recientes en caché
SELECT COUNT(*) as ventas_cargadas
FROM ventas
WHERE ubicacion_id = 'tienda_08'
  AND fecha_venta::date >= CURRENT_DATE - INTERVAL '30 days';

-- Cargar inventario en caché
SELECT COUNT(*) as inventario_cargado
FROM inventario_actual
WHERE ubicacion_id IN ('tienda_08', 'cedi_01', 'cedi_02');

-- Cargar productos activos en caché
SELECT COUNT(*) as productos_cargados
FROM productos
WHERE activo = true;

\echo '✅ Caché pre-calentada'
