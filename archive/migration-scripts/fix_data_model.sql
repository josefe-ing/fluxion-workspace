-- ============================================================================
-- AJUSTES AL MODELO DE DATOS - VENTAS_RAW
-- ============================================================================
-- Problema: numero_factura no es único globalmente, solo por ubicación
-- Solución: Crear índices únicos con la clave correcta [ubicacion_id + numero_factura + linea]
-- ============================================================================

-- ============================================================================
-- 1. CREAR ÍNDICES ÚNICOS CON LA CLAVE CORRECTA
-- ============================================================================

-- NOTA: Primero verificamos que no haya duplicados REALES con la nueva clave
-- Si este índice falla, significa que SÍ hay duplicados reales

-- Índice único compuesto: ubicacion_id + numero_factura + linea
-- Esta es la verdadera clave primaria de negocio
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_raw_unique_key
ON ventas_raw(ubicacion_id, numero_factura, linea);

-- Índice único para la combinación completa con fecha/hora (para verificación)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_raw_unique_transaction
ON ventas_raw(ubicacion_id, numero_factura, codigo_producto, fecha_hora_completa, linea);


-- ============================================================================
-- 2. ÍNDICES ADICIONALES PARA OPTIMIZAR QUERIES COMUNES
-- ============================================================================

-- Índice compuesto para buscar facturas de una ubicación específica
CREATE INDEX IF NOT EXISTS idx_ventas_raw_ubicacion_factura
ON ventas_raw(ubicacion_id, numero_factura);

-- Índice compuesto para análisis por ubicación y fecha
CREATE INDEX IF NOT EXISTS idx_ventas_raw_ubicacion_fecha_producto
ON ventas_raw(ubicacion_id, fecha, codigo_producto);


-- ============================================================================
-- 3. CREAR VISTAS PARA FACILITAR ANÁLISIS
-- ============================================================================

-- Vista: Ventas con información de ubicación explícita
CREATE OR REPLACE VIEW ventas_por_ubicacion AS
SELECT
    ubicacion_id,
    ubicacion_nombre,
    numero_factura,
    linea,
    fecha,
    fecha_hora_completa,
    codigo_producto,
    descripcion_producto,
    categoria_producto,
    cantidad_vendida,
    precio_unitario,
    venta_total,
    costo_total,
    utilidad_bruta,
    margen_bruto_pct
FROM ventas_raw
ORDER BY ubicacion_id, fecha DESC, numero_factura;


-- Vista: Resumen de ventas por factura (agrupado correctamente por ubicación)
CREATE OR REPLACE VIEW facturas_resumen AS
SELECT
    ubicacion_id,
    ubicacion_nombre,
    numero_factura,
    fecha,
    fecha_hora_completa,
    COUNT(*) as total_lineas,
    COUNT(DISTINCT codigo_producto) as productos_unicos,
    SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_total,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total_factura,
    SUM(CAST(costo_total AS DECIMAL)) as costo_total_factura,
    SUM(CAST(utilidad_bruta AS DECIMAL)) as utilidad_total,
    AVG(CAST(margen_bruto_pct AS DECIMAL)) as margen_promedio
FROM ventas_raw
WHERE numero_factura IS NOT NULL
GROUP BY
    ubicacion_id,
    ubicacion_nombre,
    numero_factura,
    fecha,
    fecha_hora_completa;


-- Vista: Análisis de unicidad de números de factura
CREATE OR REPLACE VIEW analisis_numeracion_facturas AS
SELECT
    numero_factura,
    COUNT(DISTINCT ubicacion_id) as ubicaciones_que_usan_numero,
    ARRAY_AGG(DISTINCT ubicacion_nombre) as ubicaciones,
    MIN(fecha) as primera_fecha_uso,
    MAX(fecha) as ultima_fecha_uso,
    COUNT(*) as total_lineas_en_todas_ubicaciones
FROM ventas_raw
WHERE numero_factura IS NOT NULL
GROUP BY numero_factura
HAVING COUNT(DISTINCT ubicacion_id) > 1
ORDER BY ubicaciones_que_usan_numero DESC, total_lineas_en_todas_ubicaciones DESC;


-- ============================================================================
-- 4. VERIFICACIONES DE INTEGRIDAD
-- ============================================================================

-- Verificar que no haya duplicados REALES con la nueva clave
-- Si esta query retorna registros, hay un problema de datos
CREATE OR REPLACE VIEW verificacion_duplicados_reales AS
SELECT
    ubicacion_id,
    numero_factura,
    linea,
    COUNT(*) as copias,
    ARRAY_AGG(DISTINCT fecha) as fechas,
    ARRAY_AGG(DISTINCT codigo_producto) as productos
FROM ventas_raw
WHERE ubicacion_id IS NOT NULL
  AND numero_factura IS NOT NULL
  AND linea IS NOT NULL
GROUP BY ubicacion_id, numero_factura, linea
HAVING COUNT(*) > 1;


-- ============================================================================
-- RESUMEN DE AJUSTES
-- ============================================================================
-- ✓ Índice único creado: [ubicacion_id + numero_factura + linea]
-- ✓ Índices adicionales para performance de queries comunes
-- ✓ Vistas creadas para facilitar análisis correcto
-- ✓ Vista de verificación para monitorear integridad
-- ============================================================================
