-- ============================================================================
-- EJEMPLOS DE QUERIES - VENTAS_RAW CON MEJORES PRÁCTICAS
-- ============================================================================
-- IMPORTANTE: Siempre incluir ubicacion_id en queries de ventas_raw
-- Los números de factura NO son únicos globalmente, solo por ubicación
-- ============================================================================

-- ============================================================================
-- SECCIÓN 1: CONSULTAS BÁSICAS
-- ============================================================================

-- Ejemplo 1.1: Obtener ventas de una tienda específica en un día
SELECT
    numero_factura,
    linea,
    codigo_producto,
    descripcion_producto,
    cantidad_vendida,
    precio_unitario,
    venta_total
FROM ventas_raw
WHERE ubicacion_id = 'tienda_01'
  AND fecha = '2025-09-01'
ORDER BY numero_factura, CAST(linea AS INTEGER);


-- Ejemplo 1.2: Buscar una factura específica (con ubicación)
SELECT *
FROM ventas_raw
WHERE ubicacion_id = 'tienda_01'
  AND numero_factura = '001086268'
ORDER BY CAST(linea AS INTEGER);


-- Ejemplo 1.3: Buscar todas las facturas con un número en TODAS las ubicaciones
SELECT
    ubicacion_id,
    ubicacion_nombre,
    numero_factura,
    fecha,
    COUNT(*) as lineas,
    SUM(CAST(venta_total AS DECIMAL)) as total_factura
FROM ventas_raw
WHERE numero_factura = '001086268'
GROUP BY ubicacion_id, ubicacion_nombre, numero_factura, fecha
ORDER BY fecha DESC;


-- Ejemplo 1.4: Ventas de un producto específico por ubicación
SELECT
    ubicacion_id,
    ubicacion_nombre,
    codigo_producto,
    descripcion_producto,
    COUNT(*) as num_ventas,
    SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_total,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total
FROM ventas_raw
WHERE codigo_producto = '000796'
  AND fecha BETWEEN '2025-09-01' AND '2025-09-30'
GROUP BY ubicacion_id, ubicacion_nombre, codigo_producto, descripcion_producto
ORDER BY venta_total DESC;


-- ============================================================================
-- SECCIÓN 2: REPORTES DE VENTAS
-- ============================================================================

-- Ejemplo 2.1: Reporte de Ventas Diarias por Tienda
SELECT
    fecha,
    ubicacion_id,
    ubicacion_nombre,
    COUNT(DISTINCT numero_factura) as num_facturas,
    COUNT(*) as lineas_vendidas,
    SUM(CAST(cantidad_vendida AS DECIMAL)) as unidades_vendidas,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total_dia,
    SUM(CAST(costo_total AS DECIMAL)) as costo_total_dia,
    SUM(CAST(utilidad_bruta AS DECIMAL)) as utilidad_dia,
    AVG(CAST(margen_bruto_pct AS DECIMAL)) as margen_promedio
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
GROUP BY fecha, ubicacion_id, ubicacion_nombre
ORDER BY fecha DESC, venta_total_dia DESC;


-- Ejemplo 2.2: Reporte de Ventas Mensuales por Tienda
SELECT
    STRFTIME(fecha, '%Y-%m') as mes,
    ubicacion_id,
    ubicacion_nombre,
    COUNT(DISTINCT numero_factura) as num_facturas,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total_mes,
    SUM(CAST(utilidad_bruta AS DECIMAL)) as utilidad_mes,
    AVG(CAST(margen_bruto_pct AS DECIMAL)) as margen_promedio
FROM ventas_raw
WHERE fecha >= '2025-01-01'
GROUP BY mes, ubicacion_id, ubicacion_nombre
ORDER BY mes DESC, venta_total_mes DESC;


-- Ejemplo 2.3: Ranking de Tiendas por Ventas
SELECT
    ubicacion_id,
    ubicacion_nombre,
    COUNT(DISTINCT numero_factura) as total_facturas,
    COUNT(*) as lineas_vendidas,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total,
    SUM(CAST(venta_total AS DECIMAL)) / COUNT(DISTINCT numero_factura) as ticket_promedio,
    RANK() OVER (ORDER BY SUM(CAST(venta_total AS DECIMAL)) DESC) as ranking
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
GROUP BY ubicacion_id, ubicacion_nombre
ORDER BY ranking;


-- ============================================================================
-- SECCIÓN 3: ANÁLISIS DE PRODUCTOS
-- ============================================================================

-- Ejemplo 3.1: Top 20 Productos Más Vendidos por Tienda
SELECT
    ubicacion_id,
    ubicacion_nombre,
    codigo_producto,
    descripcion_producto,
    categoria_producto,
    SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_total,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total,
    COUNT(DISTINCT numero_factura) as num_facturas,
    RANK() OVER (
        PARTITION BY ubicacion_id
        ORDER BY SUM(CAST(venta_total AS DECIMAL)) DESC
    ) as ranking_en_tienda
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
GROUP BY ubicacion_id, ubicacion_nombre, codigo_producto, descripcion_producto, categoria_producto
QUALIFY ranking_en_tienda <= 20
ORDER BY ubicacion_id, ranking_en_tienda;


-- Ejemplo 3.2: Comparación de Ventas de Producto entre Tiendas
WITH ventas_producto AS (
    SELECT
        ubicacion_id,
        ubicacion_nombre,
        SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_vendida,
        SUM(CAST(venta_total AS DECIMAL)) as venta_total
    FROM ventas_raw
    WHERE codigo_producto = '000796'  -- Harina PAN
      AND fecha BETWEEN '2025-09-01' AND '2025-09-30'
    GROUP BY ubicacion_id, ubicacion_nombre
)
SELECT
    ubicacion_id,
    ubicacion_nombre,
    cantidad_vendida,
    venta_total,
    ROUND(cantidad_vendida * 100.0 / SUM(cantidad_vendida) OVER (), 2) as porcentaje_cantidad,
    ROUND(venta_total * 100.0 / SUM(venta_total) OVER (), 2) as porcentaje_venta
FROM ventas_producto
ORDER BY venta_total DESC;


-- Ejemplo 3.3: Análisis de Categorías por Tienda
SELECT
    ubicacion_id,
    ubicacion_nombre,
    categoria_producto,
    COUNT(DISTINCT codigo_producto) as productos_distintos,
    SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_total,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total,
    AVG(CAST(margen_bruto_pct AS DECIMAL)) as margen_promedio,
    ROUND(
        SUM(CAST(venta_total AS DECIMAL)) * 100.0 /
        SUM(SUM(CAST(venta_total AS DECIMAL))) OVER (PARTITION BY ubicacion_id),
        2
    ) as porcentaje_venta_tienda
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
  AND categoria_producto IS NOT NULL
GROUP BY ubicacion_id, ubicacion_nombre, categoria_producto
ORDER BY ubicacion_id, venta_total DESC;


-- ============================================================================
-- SECCIÓN 4: ANÁLISIS TEMPORAL
-- ============================================================================

-- Ejemplo 4.1: Ventas por Turno (Mañana, Tarde, Noche)
SELECT
    ubicacion_id,
    ubicacion_nombre,
    turno,
    COUNT(DISTINCT numero_factura) as num_facturas,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total,
    AVG(CAST(venta_total AS DECIMAL)) as venta_promedio,
    ROUND(
        SUM(CAST(venta_total AS DECIMAL)) * 100.0 /
        SUM(SUM(CAST(venta_total AS DECIMAL))) OVER (PARTITION BY ubicacion_id),
        2
    ) as porcentaje_del_dia
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
  AND turno IS NOT NULL
GROUP BY ubicacion_id, ubicacion_nombre, turno
ORDER BY ubicacion_id, venta_total DESC;


-- Ejemplo 4.2: Ventas por Día de la Semana
SELECT
    ubicacion_id,
    ubicacion_nombre,
    nombre_dia,
    COUNT(DISTINCT fecha) as dias_operados,
    COUNT(DISTINCT numero_factura) as total_facturas,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total,
    SUM(CAST(venta_total AS DECIMAL)) / COUNT(DISTINCT fecha) as venta_promedio_por_dia
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
GROUP BY ubicacion_id, ubicacion_nombre, nombre_dia, dia_semana
ORDER BY ubicacion_id, dia_semana;


-- Ejemplo 4.3: Evolución de Ventas Semanales
SELECT
    STRFTIME(fecha, '%Y-W%W') as semana,
    ubicacion_id,
    ubicacion_nombre,
    COUNT(DISTINCT numero_factura) as num_facturas,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total,
    AVG(CAST(venta_total AS DECIMAL)) as ticket_promedio
FROM ventas_raw
WHERE fecha >= '2025-01-01'
GROUP BY semana, ubicacion_id, ubicacion_nombre
ORDER BY semana DESC, venta_total DESC;


-- ============================================================================
-- SECCIÓN 5: ANÁLISIS DE RENTABILIDAD
-- ============================================================================

-- Ejemplo 5.1: Productos Más Rentables por Tienda
SELECT
    ubicacion_id,
    ubicacion_nombre,
    codigo_producto,
    descripcion_producto,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total,
    SUM(CAST(costo_total AS DECIMAL)) as costo_total,
    SUM(CAST(utilidad_bruta AS DECIMAL)) as utilidad_bruta,
    AVG(CAST(margen_bruto_pct AS DECIMAL)) as margen_promedio,
    RANK() OVER (
        PARTITION BY ubicacion_id
        ORDER BY SUM(CAST(utilidad_bruta AS DECIMAL)) DESC
    ) as ranking_utilidad
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
GROUP BY ubicacion_id, ubicacion_nombre, codigo_producto, descripcion_producto
QUALIFY ranking_utilidad <= 20
ORDER BY ubicacion_id, ranking_utilidad;


-- Ejemplo 5.2: Análisis de Márgenes por Categoría y Tienda
SELECT
    ubicacion_id,
    ubicacion_nombre,
    categoria_producto,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total,
    SUM(CAST(costo_total AS DECIMAL)) as costo_total,
    SUM(CAST(utilidad_bruta AS DECIMAL)) as utilidad_bruta,
    ROUND(
        SUM(CAST(utilidad_bruta AS DECIMAL)) * 100.0 /
        NULLIF(SUM(CAST(venta_total AS DECIMAL)), 0),
        2
    ) as margen_real
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
  AND categoria_producto IS NOT NULL
GROUP BY ubicacion_id, ubicacion_nombre, categoria_producto
ORDER BY ubicacion_id, utilidad_bruta DESC;


-- ============================================================================
-- SECCIÓN 6: ANÁLISIS DE FACTURAS
-- ============================================================================

-- Ejemplo 6.1: Estadísticas de Facturas por Tienda
SELECT
    ubicacion_id,
    ubicacion_nombre,
    COUNT(DISTINCT numero_factura) as total_facturas,
    AVG(lineas_por_factura) as lineas_promedio,
    AVG(total_factura) as ticket_promedio,
    MIN(total_factura) as ticket_minimo,
    MAX(total_factura) as ticket_maximo,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_factura) as mediana_ticket
FROM (
    SELECT
        ubicacion_id,
        ubicacion_nombre,
        numero_factura,
        COUNT(*) as lineas_por_factura,
        SUM(CAST(venta_total AS DECIMAL)) as total_factura
    FROM ventas_raw
    WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
    GROUP BY ubicacion_id, ubicacion_nombre, numero_factura
)
GROUP BY ubicacion_id, ubicacion_nombre
ORDER BY ticket_promedio DESC;


-- Ejemplo 6.2: Facturas de Alto Valor por Tienda
SELECT
    ubicacion_id,
    ubicacion_nombre,
    numero_factura,
    fecha,
    fecha_hora_completa,
    COUNT(*) as lineas,
    SUM(CAST(venta_total AS DECIMAL)) as total_factura,
    SUM(CAST(utilidad_bruta AS DECIMAL)) as utilidad_factura
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
GROUP BY ubicacion_id, ubicacion_nombre, numero_factura, fecha, fecha_hora_completa
HAVING SUM(CAST(venta_total AS DECIMAL)) > 100
ORDER BY total_factura DESC
LIMIT 100;


-- ============================================================================
-- SECCIÓN 7: ANÁLISIS COMPARATIVO ENTRE TIENDAS
-- ============================================================================

-- Ejemplo 7.1: Comparación de KPIs entre Tiendas
WITH metricas_tienda AS (
    SELECT
        ubicacion_id,
        ubicacion_nombre,
        COUNT(DISTINCT numero_factura) as num_facturas,
        COUNT(*) as lineas_totales,
        SUM(CAST(venta_total AS DECIMAL)) as venta_total,
        SUM(CAST(utilidad_bruta AS DECIMAL)) as utilidad_total,
        COUNT(DISTINCT codigo_producto) as productos_distintos,
        COUNT(DISTINCT fecha) as dias_operados
    FROM ventas_raw
    WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
    GROUP BY ubicacion_id, ubicacion_nombre
)
SELECT
    ubicacion_id,
    ubicacion_nombre,
    num_facturas,
    ROUND(venta_total, 2) as venta_total,
    ROUND(venta_total / dias_operados, 2) as venta_promedio_diaria,
    ROUND(venta_total / num_facturas, 2) as ticket_promedio,
    ROUND(lineas_totales * 1.0 / num_facturas, 2) as lineas_por_factura,
    productos_distintos,
    ROUND(utilidad_total * 100.0 / venta_total, 2) as margen_general,
    RANK() OVER (ORDER BY venta_total DESC) as ranking_ventas
FROM metricas_tienda
ORDER BY ranking_ventas;


-- Ejemplo 7.2: Matriz de Productos vs Tiendas
SELECT
    codigo_producto,
    descripcion_producto,
    SUM(CASE WHEN ubicacion_id = 'tienda_01' THEN CAST(cantidad_vendida AS DECIMAL) ELSE 0 END) as tienda_01,
    SUM(CASE WHEN ubicacion_id = 'tienda_02' THEN CAST(cantidad_vendida AS DECIMAL) ELSE 0 END) as tienda_02,
    SUM(CASE WHEN ubicacion_id = 'tienda_03' THEN CAST(cantidad_vendida AS DECIMAL) ELSE 0 END) as tienda_03,
    SUM(CAST(cantidad_vendida AS DECIMAL)) as total_general
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
  AND codigo_producto IN (
      SELECT codigo_producto
      FROM ventas_raw
      WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
      GROUP BY codigo_producto
      ORDER BY SUM(CAST(venta_total AS DECIMAL)) DESC
      LIMIT 20
  )
GROUP BY codigo_producto, descripcion_producto
ORDER BY total_general DESC;


-- ============================================================================
-- SECCIÓN 8: USANDO LAS VISTAS CREADAS
-- ============================================================================

-- Ejemplo 8.1: Usar vista facturas_resumen
SELECT *
FROM facturas_resumen
WHERE ubicacion_id = 'tienda_01'
  AND fecha BETWEEN '2025-09-01' AND '2025-09-30'
  AND venta_total_factura > 50
ORDER BY venta_total_factura DESC
LIMIT 50;


-- Ejemplo 8.2: Verificar que no hay duplicados reales
SELECT * FROM verificacion_duplicados_reales;
-- Esta query debería retornar 0 registros


-- Ejemplo 8.3: Analizar numeración compartida entre tiendas
SELECT *
FROM analisis_numeracion_facturas
WHERE ubicaciones_que_usan_numero >= 3
LIMIT 100;


-- ============================================================================
-- SECCIÓN 9: VALIDACIONES Y AUDITORÍA
-- ============================================================================

-- Ejemplo 9.1: Verificar integridad de clave primaria
SELECT
    ubicacion_id,
    numero_factura,
    linea,
    COUNT(*) as duplicados
FROM ventas_raw
WHERE ubicacion_id IS NOT NULL
  AND numero_factura IS NOT NULL
  AND linea IS NOT NULL
GROUP BY ubicacion_id, numero_factura, linea
HAVING COUNT(*) > 1;
-- Debería retornar 0 registros


-- Ejemplo 9.2: Verificar consistencia de datos por factura
SELECT
    ubicacion_id,
    numero_factura,
    COUNT(DISTINCT fecha) as fechas_distintas,
    COUNT(DISTINCT fecha_hora_completa) as horas_distintas
FROM ventas_raw
GROUP BY ubicacion_id, numero_factura
HAVING COUNT(DISTINCT fecha) > 1;
-- Facturas con múltiples fechas (posible problema)


-- Ejemplo 9.3: Detectar valores anómalos
SELECT
    ubicacion_id,
    numero_factura,
    codigo_producto,
    cantidad_vendida,
    precio_unitario,
    venta_total
FROM ventas_raw
WHERE CAST(cantidad_vendida AS DECIMAL) > 100
   OR CAST(precio_unitario AS DECIMAL) > 1000
   OR CAST(venta_total AS DECIMAL) > 10000
ORDER BY CAST(venta_total AS DECIMAL) DESC;


-- ============================================================================
-- FIN DE EJEMPLOS
-- ============================================================================
