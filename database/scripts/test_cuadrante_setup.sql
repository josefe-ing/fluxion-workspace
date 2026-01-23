-- Script de prueba: Verificar setup de cuadrante
-- Este script agrega datos de prueba para verificar que el sistema funciona

BEGIN;

-- 1. Verificar que las columnas existen
\echo '=== Verificando columnas ==='
SELECT 'productos.cuadrante' as tabla_columna, COUNT(*) as registros
FROM productos
WHERE cuadrante IS NOT NULL;

SELECT 'ventas.cuadrante_producto' as tabla_columna, COUNT(*) as registros
FROM ventas
WHERE cuadrante_producto IS NOT NULL;

-- 2. Agregar datos de prueba en ventas (simulando ETL)
\echo '=== Agregando datos de prueba en ventas ==='
UPDATE ventas
SET cuadrante_producto =
    CASE
        WHEN producto_id IN (SELECT codigo FROM productos LIMIT 100) THEN 'CUADRANTE I'
        WHEN producto_id IN (SELECT codigo FROM productos OFFSET 100 LIMIT 100) THEN 'CUADRANTE II'
        WHEN producto_id IN (SELECT codigo FROM productos OFFSET 200 LIMIT 100) THEN 'CUADRANTE III'
        ELSE 'CUADRANTE IV'
    END
WHERE fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
  AND producto_id IN (SELECT codigo FROM productos);

-- 3. Ver distribución de cuadrantes en ventas
\echo '=== Distribución de cuadrantes en ventas ==='
SELECT
    cuadrante_producto,
    COUNT(DISTINCT producto_id) as productos_unicos,
    COUNT(*) as transacciones
FROM ventas
WHERE cuadrante_producto IS NOT NULL
GROUP BY cuadrante_producto
ORDER BY COUNT(*) DESC;

COMMIT;

\echo '=== Setup de cuadrante completado ==='
\echo 'Ejecuta ahora: python3 database/scripts/populate_cuadrantes_from_ventas.py'
