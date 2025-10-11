-- ========================================
-- Índices de Optimización para Queries de Ventas
-- Fluxion AI - La Granja Mercado
-- ========================================
-- Propósito: Optimizar performance de queries en la tabla ventas_raw
-- Fecha: 2025-10-10
-- ========================================

-- Índice para búsquedas por producto y rango de fechas
-- Usado en: /api/ventas/detail, /api/ventas/producto/diario
CREATE INDEX IF NOT EXISTS idx_ventas_producto_fecha
ON ventas_raw(codigo_producto, fecha DESC);

-- Índice compuesto para filtros por ubicación, fecha y categoría
-- Usado en: /api/ventas/detail con filtros
CREATE INDEX IF NOT EXISTS idx_ventas_ubicacion_fecha_categoria
ON ventas_raw(ubicacion_id, fecha DESC, categoria_producto);

-- Índice para rangos de fechas (queries con BETWEEN)
-- Usado en: Todas las queries con fecha_inicio, fecha_fin
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_range
ON ventas_raw(fecha DESC);

-- Índice para búsquedas por código de producto (exactas y LIKE)
-- Usado en: Búsquedas en frontend
CREATE INDEX IF NOT EXISTS idx_ventas_codigo_producto
ON ventas_raw(codigo_producto);

-- Índice para búsquedas por descripción de producto
-- Usado en: Búsquedas ILIKE en frontend
CREATE INDEX IF NOT EXISTS idx_ventas_descripcion_producto
ON ventas_raw(LOWER(descripcion_producto));

-- Índice para agregaciones por categoría
-- Usado en: Estadísticas y reportes por categoría
CREATE INDEX IF NOT EXISTS idx_ventas_categoria
ON ventas_raw(categoria_producto, fecha DESC);

-- Índice para cálculos de día de semana
-- Usado en: Queries de promedio por día de semana
CREATE INDEX IF NOT EXISTS idx_ventas_dia_semana
ON ventas_raw(codigo_producto, dia_semana);

-- Índice para análisis de ubicaciones
-- Usado en: Dashboard principal de ventas
CREATE INDEX IF NOT EXISTS idx_ventas_ubicacion_nombre
ON ventas_raw(ubicacion_id, ubicacion_nombre);

-- ========================================
-- Verificación de Índices
-- ========================================
-- Ejecutar para verificar que los índices fueron creados:
-- SELECT * FROM duckdb_indexes() WHERE table_name = 'ventas_raw';
