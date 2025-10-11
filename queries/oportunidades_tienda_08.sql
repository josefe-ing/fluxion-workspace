-- =====================================================================================
-- QUERY: OPORTUNIDADES DE PRODUCTOS PARA TIENDA_08 (EL BOSQUE)
-- =====================================================================================
-- Descripción: Identifica productos que se venden bien en otras tiendas pero NO se
--              venden en tienda_08, con información de disponibilidad en CEDIs
--
-- Uso: Este query ayuda a identificar:
--   1. Productos con demanda comprobada en otras tiendas
--   2. Oportunidades de expansión de catálogo para tienda_08
--   3. Productos con stock disponible en CEDI para envío inmediato
--
-- Parámetros configurables:
--   - Período de análisis: Últimos 90 días (modificar fecha_inicio)
--   - Mínimo de tiendas: 3 (modificar en WHERE num_tiendas_venta >= 3)
--   - Límite de resultados: 50 (modificar en LIMIT)
-- =====================================================================================

WITH ventas_otras_tiendas AS (
    -- Agregar ventas de productos en todas las tiendas excepto tienda_08
    SELECT
        codigo_producto,
        descripcion_producto,
        categoria_producto,
        grupo_producto,
        marca_producto,
        COUNT(DISTINCT ubicacion_id) as num_tiendas_venta,
        COUNT(DISTINCT numero_factura) as num_transacciones,
        SUM(CAST(cantidad_vendida AS DOUBLE)) as cantidad_total_vendida,
        AVG(CAST(cantidad_vendida AS DOUBLE)) as promedio_unidades_transaccion,
        SUM(CAST(venta_total AS DOUBLE)) as venta_total_bs,
        AVG(CAST(precio_unitario AS DOUBLE)) as precio_promedio
    FROM ventas_raw
    WHERE ubicacion_id != 'tienda_08'
        AND fecha >= '2025-07-12'  -- Últimos 90 días (ajustar según necesidad)
    GROUP BY
        codigo_producto,
        descripcion_producto,
        categoria_producto,
        grupo_producto,
        marca_producto
),
productos_tienda_08 AS (
    -- Productos que YA se venden en tienda_08
    SELECT DISTINCT codigo_producto
    FROM ventas_raw
    WHERE ubicacion_id = 'tienda_08'
        AND fecha >= '2025-07-12'  -- Mismo período
),
productos_oportunidad AS (
    -- Productos en otras tiendas pero NO en tienda_08
    SELECT v.*
    FROM ventas_otras_tiendas v
    LEFT JOIN productos_tienda_08 t8 ON v.codigo_producto = t8.codigo_producto
    WHERE t8.codigo_producto IS NULL
        AND v.num_tiendas_venta >= 3  -- Vendido en al menos 3 tiendas
),
stock_info AS (
    -- Stock disponible en CEDIs
    SELECT
        producto_id,
        SUM(CASE WHEN ubicacion_id LIKE 'cedi%' THEN cantidad ELSE 0 END) as stock_cedis,
        MAX(CASE WHEN ubicacion_id LIKE 'cedi%' THEN ubicacion_id ELSE NULL END) as cedi_disponible
    FROM stock_actual
    WHERE cantidad > 0
    GROUP BY producto_id
)
SELECT
    p.codigo_producto,
    p.descripcion_producto,
    p.categoria_producto,
    p.grupo_producto,
    p.marca_producto,
    p.num_tiendas_venta,
    CAST(p.cantidad_total_vendida AS INTEGER) as total_unidades_vendidas,
    CAST(p.num_transacciones AS INTEGER) as num_transacciones,
    CAST(p.promedio_unidades_transaccion AS DECIMAL(10,2)) as prom_unid_transaccion,
    CAST(p.venta_total_bs AS INTEGER) as venta_total_bs,
    CAST(p.precio_promedio AS DECIMAL(10,2)) as precio_promedio,
    COALESCE(CAST(s.stock_cedis AS INTEGER), 0) as stock_cedi,
    CASE
        WHEN s.stock_cedis > 0 THEN 'HAY STOCK'
        ELSE 'SIN STOCK'
    END as disponibilidad_cedi
FROM productos_oportunidad p
LEFT JOIN stock_info s ON p.codigo_producto = s.producto_id
ORDER BY
    CASE WHEN s.stock_cedis > 0 THEN 0 ELSE 1 END,  -- Primero los que tienen stock
    p.num_tiendas_venta DESC,                       -- Luego por presencia en tiendas
    p.venta_total_bs DESC                           -- Finalmente por volumen de venta
LIMIT 50;

-- =====================================================================================
-- INTERPRETACIÓN DE RESULTADOS:
-- =====================================================================================
--
-- • num_tiendas_venta: Número de tiendas donde se vende el producto
--   → Mayor número = Mayor adopción del producto en la red
--
-- • total_unidades_vendidas: Suma de todas las unidades vendidas en el período
--   → Indica el volumen total de demanda
--
-- • venta_total_bs: Ingreso total generado por el producto
--   → Indica el potencial de ingresos
--
-- • stock_cedi: Unidades disponibles en CEDI
--   → 0 = Requiere compra/producción
--   → >0 = Puede enviarse inmediatamente
--
-- =====================================================================================
-- ACCIONES RECOMENDADAS:
-- =====================================================================================
--
-- 1. PRODUCTOS CON STOCK (disponibilidad_cedi = 'HAY STOCK'):
--    → Enviar inmediatamente a tienda_08
--    → Crear pedido de transferencia desde CEDI
--
-- 2. PRODUCTOS SIN STOCK (disponibilidad_cedi = 'SIN STOCK'):
--    → Evaluar proveedores y costos
--    → Considerar orden de compra
--    → Priorizar según venta_total_bs
--
-- 3. PRODUCTOS DE ALTA ROTACIÓN (num_tiendas_venta >= 10):
--    → Prioridad ALTA - Alta probabilidad de éxito
--    → Considerar como productos "core"
--
-- 4. PRODUCTOS DE ROTACIÓN MEDIA (num_tiendas_venta 5-9):
--    → Prioridad MEDIA - Evaluar características de tiendas similares
--
-- 5. PRODUCTOS DE ROTACIÓN BAJA (num_tiendas_venta 3-4):
--    → Prioridad BAJA - Evaluar perfil de clientes de tienda_08
--
-- =====================================================================================
