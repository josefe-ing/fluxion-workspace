-- ============================================================================
-- SCRIPT DE OPTIMIZACIÓN: CREACIÓN DE ÍNDICES PARA FLUXION
-- ============================================================================
-- Propósito: Mejorar el performance de consultas en tablas críticas
-- Tabla crítica: ventas_raw (81M+ registros sin índices)
-- ============================================================================

-- ============================================================================
-- 1. ÍNDICES PARA VENTAS_RAW (PRIORIDAD MÁXIMA)
-- ============================================================================
-- Esta tabla tiene 81,815,010 registros y actualmente NO tiene índices
-- Esto causa queries extremadamente lentas

-- Índice por fecha (para consultas de rangos de tiempo)
CREATE INDEX IF NOT EXISTS idx_ventas_raw_fecha
ON ventas_raw(fecha);

-- Índice por ubicación (para filtrar por sucursal/almacén)
CREATE INDEX IF NOT EXISTS idx_ventas_raw_ubicacion
ON ventas_raw(ubicacion_id);

-- Índice por producto (para análisis de productos específicos)
CREATE INDEX IF NOT EXISTS idx_ventas_raw_producto
ON ventas_raw(codigo_producto);

-- Índice compuesto para queries comunes (fecha + ubicación)
CREATE INDEX IF NOT EXISTS idx_ventas_raw_fecha_ubicacion
ON ventas_raw(fecha, ubicacion_id);

-- Índice compuesto para análisis de producto por fecha
CREATE INDEX IF NOT EXISTS idx_ventas_raw_fecha_producto
ON ventas_raw(fecha, codigo_producto);

-- Índice para análisis por categoría
CREATE INDEX IF NOT EXISTS idx_ventas_raw_categoria
ON ventas_raw(categoria_producto);

-- Índice para análisis temporal (turno, periodo del día)
CREATE INDEX IF NOT EXISTS idx_ventas_raw_turno
ON ventas_raw(turno);

-- Índice compuesto para dashboards ejecutivos (fecha + ubicacion + categoria)
CREATE INDEX IF NOT EXISTS idx_ventas_raw_ejecutivo
ON ventas_raw(fecha, ubicacion_id, categoria_producto);


-- ============================================================================
-- 2. ÍNDICES PARA PRODUCTOS (PRIORIDAD ALTA)
-- ============================================================================

-- Índice por código (búsquedas rápidas de productos)
CREATE INDEX IF NOT EXISTS idx_productos_codigo
ON productos(codigo);

-- Índice por código de barras
CREATE INDEX IF NOT EXISTS idx_productos_codigo_barras
ON productos(codigo_barras);

-- Índice por categoría (para filtrado y análisis)
CREATE INDEX IF NOT EXISTS idx_productos_categoria
ON productos(categoria);

-- Índice por marca
CREATE INDEX IF NOT EXISTS idx_productos_marca
ON productos(marca);

-- Índice compuesto categoría + marca
CREATE INDEX IF NOT EXISTS idx_productos_cat_marca
ON productos(categoria, marca);


-- ============================================================================
-- 3. ÍNDICES PARA UBICACIONES (PRIORIDAD ALTA)
-- ============================================================================

-- Índice por código de ubicación
CREATE INDEX IF NOT EXISTS idx_ubicaciones_codigo
ON ubicaciones(codigo);

-- Índice por tipo de ubicación (tienda, almacén, etc)
CREATE INDEX IF NOT EXISTS idx_ubicaciones_tipo
ON ubicaciones(tipo);

-- Índice por región (para análisis geográficos)
CREATE INDEX IF NOT EXISTS idx_ubicaciones_region
ON ubicaciones(region);

-- Índice por estado activo
CREATE INDEX IF NOT EXISTS idx_ubicaciones_activo
ON ubicaciones(activo);


-- ============================================================================
-- 4. ÍNDICES PARA PRODUCTO_UBICACION_CONFIG (PRIORIDAD MEDIA)
-- ============================================================================

-- Índice por producto
CREATE INDEX IF NOT EXISTS idx_prod_ubic_config_producto
ON producto_ubicacion_config(producto_id);

-- Índice por ubicación
CREATE INDEX IF NOT EXISTS idx_prod_ubic_config_ubicacion
ON producto_ubicacion_config(ubicacion_id);

-- Índice compuesto (producto + ubicación) - único por diseño
CREATE INDEX IF NOT EXISTS idx_prod_ubic_config_prod_ubic
ON producto_ubicacion_config(producto_id, ubicacion_id);

-- Índice para productos estrella
CREATE INDEX IF NOT EXISTS idx_prod_ubic_config_estrella
ON producto_ubicacion_config(es_producto_estrella)
WHERE es_producto_estrella = true;


-- ============================================================================
-- 5. ÍNDICES PARA PRODUCTOS_UBICACION_COMPLETA (PRIORIDAD MEDIA)
-- ============================================================================

-- Índice por producto
CREATE INDEX IF NOT EXISTS idx_prod_ubic_completa_producto
ON productos_ubicacion_completa(producto_id);

-- Índice por ubicación
CREATE INDEX IF NOT EXISTS idx_prod_ubic_completa_ubicacion
ON productos_ubicacion_completa(ubicacion_id);

-- Índice por estado de stock
CREATE INDEX IF NOT EXISTS idx_prod_ubic_completa_estado
ON productos_ubicacion_completa(estado_stock);

-- Índice compuesto (ubicación + estado)
CREATE INDEX IF NOT EXISTS idx_prod_ubic_completa_ubic_estado
ON productos_ubicacion_completa(ubicacion_id, estado_stock);


-- ============================================================================
-- 6. ÍNDICES PARA CATEGORIAS_CONFIG (PRIORIDAD BAJA)
-- ============================================================================

-- Índice por categoría
CREATE INDEX IF NOT EXISTS idx_categorias_config_categoria
ON categorias_config(categoria);

-- Índice por estado activo
CREATE INDEX IF NOT EXISTS idx_categorias_config_activo
ON categorias_config(activo);


-- ============================================================================
-- 7. ÍNDICES PARA VENTAS_DIARIAS (PRIORIDAD ALTA - para cuando tenga datos)
-- ============================================================================

-- Índice por fecha
CREATE INDEX IF NOT EXISTS idx_ventas_diarias_fecha
ON ventas_diarias(fecha);

-- Índice por ubicación
CREATE INDEX IF NOT EXISTS idx_ventas_diarias_ubicacion
ON ventas_diarias(ubicacion_id);

-- Índice compuesto (fecha + ubicación)
CREATE INDEX IF NOT EXISTS idx_ventas_diarias_fecha_ubicacion
ON ventas_diarias(fecha, ubicacion_id);


-- ============================================================================
-- 8. ÍNDICES PARA DASHBOARD_TEST (PRIORIDAD BAJA)
-- ============================================================================

-- Índice por tipo (para filtrar por tipo de dashboard)
CREATE INDEX IF NOT EXISTS idx_dashboard_test_tipo
ON dashboard_test(tipo);


-- ============================================================================
-- RESUMEN DE ÍNDICES CREADOS
-- ============================================================================
-- ventas_raw: 8 índices (tabla crítica con 81M registros)
-- productos: 5 índices
-- ubicaciones: 4 índices
-- producto_ubicacion_config: 4 índices
-- productos_ubicacion_completa: 4 índices
-- categorias_config: 2 índices
-- ventas_diarias: 3 índices
-- dashboard_test: 1 índice
--
-- TOTAL: 31 índices nuevos
-- ============================================================================

-- ============================================================================
-- NOTA IMPORTANTE: TIEMPO DE EJECUCIÓN
-- ============================================================================
-- La creación de índices en ventas_raw (81M registros) puede tomar varios minutos
-- Se recomienda ejecutar este script durante horas de baja carga
-- Progreso esperado:
-- - Índices simples: 2-5 minutos cada uno
-- - Índices compuestos: 5-10 minutos cada uno
-- - Tiempo total estimado: 30-60 minutos
-- ============================================================================
