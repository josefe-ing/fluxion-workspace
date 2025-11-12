-- =====================================================================================
-- MIGRATION: 001_create_conjuntos_sustituibles.sql
-- Fecha: 2025-11-11
-- Descripción: Crea estructura completa para Conjuntos Sustituibles
-- =====================================================================================

-- PASO 1: Drop vistas si existen (para recrearlas)
DROP VIEW IF EXISTS conjunto_productos_detalle;
DROP VIEW IF EXISTS conjunto_demanda_total;
DROP VIEW IF EXISTS conjunto_shares;

-- PASO 2: Crear vista de alias para conjuntos (compatibilidad)
DROP VIEW IF EXISTS conjuntos;
CREATE VIEW conjuntos AS SELECT * FROM conjuntos_sustituibles;

-- PASO 3: Crear tabla de relación conjunto-productos (nueva)
CREATE TABLE IF NOT EXISTS conjunto_productos (
    id VARCHAR PRIMARY KEY,
    conjunto_id VARCHAR NOT NULL,
    codigo_producto VARCHAR(50) NOT NULL,
    share_manual DECIMAL(5,2),
    activo BOOLEAN DEFAULT true,
    fecha_agregado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (conjunto_id) REFERENCES conjuntos_sustituibles(id),
    UNIQUE(conjunto_id, codigo_producto)
);

-- PASO 4: Crear vista de shares calculados
CREATE VIEW conjunto_shares AS
SELECT
    cp.conjunto_id,
    cp.codigo_producto,
    p.descripcion,
    p.categoria,
    p.marca,
    COALESCE(
        cp.share_manual,
        (SUM(COALESCE(v.cantidad, 0)) * 100.0 /
         NULLIF(SUM(SUM(COALESCE(v.cantidad, 0))) OVER (PARTITION BY cp.conjunto_id), 0))
    ) as share_porcentaje,
    SUM(COALESCE(v.cantidad, 0)) as unidades_vendidas_12s,
    AVG(COALESCE(v.cantidad, 0)) as promedio_diario,
    COUNT(DISTINCT v.fecha) as dias_con_ventas,
    cp.activo,
    cp.fecha_agregado
FROM conjunto_productos cp
JOIN productos p ON cp.codigo_producto = p.codigo
LEFT JOIN items_facturas v ON v.codigo_producto = cp.codigo_producto
    AND v.fecha >= CURRENT_DATE - INTERVAL '12 weeks'
WHERE cp.activo = true
GROUP BY
    cp.conjunto_id,
    cp.codigo_producto,
    p.descripcion,
    p.categoria,
    p.marca,
    cp.share_manual,
    cp.activo,
    cp.fecha_agregado;

-- PASO 5: Crear vista de demanda total por conjunto
CREATE VIEW conjunto_demanda_total AS
SELECT
    c.id as conjunto_id,
    c.nombre,
    c.categoria,
    SUM(
        COALESCE(v.cantidad, 0) / NULLIF(COUNT(DISTINCT v.fecha), 0)
    ) as demanda_diaria_promedio,
    COUNT(DISTINCT cp.codigo_producto) as total_productos,
    COUNT(DISTINCT CASE WHEN cp.activo THEN cp.codigo_producto END) as productos_activos,
    MAX(v.fecha) as ultima_venta,
    c.activo
FROM conjuntos c
LEFT JOIN conjunto_productos cp ON c.id = cp.conjunto_id
LEFT JOIN items_facturas v ON v.codigo_producto = cp.codigo_producto
    AND v.fecha >= CURRENT_DATE - INTERVAL '12 weeks'
WHERE c.activo = true
GROUP BY c.id, c.nombre, c.categoria, c.activo;

-- PASO 6: Crear vista detallada de productos en conjuntos
CREATE VIEW conjunto_productos_detalle AS
SELECT
    c.id as conjunto_id,
    c.nombre as conjunto_nombre,
    c.descripcion as conjunto_descripcion,
    c.categoria as conjunto_categoria,
    cs.codigo_producto,
    cs.descripcion as producto_descripcion,
    cs.marca as producto_marca,
    cs.share_porcentaje,
    cs.unidades_vendidas_12s,
    cs.promedio_diario as demanda_diaria,
    COALESCE(SUM(s.cantidad), 0) as stock_total,
    CASE
        WHEN cs.promedio_diario > 0 THEN COALESCE(SUM(s.cantidad), 0) / cs.promedio_diario
        ELSE NULL
    END as dias_inventario,
    cp.activo,
    c.activo as conjunto_activo
FROM conjuntos c
JOIN conjunto_productos cp ON c.id = cp.conjunto_id
JOIN conjunto_shares cs ON cs.conjunto_id = c.id AND cs.codigo_producto = cp.codigo_producto
LEFT JOIN stock_actual s ON s.producto_id = (
    SELECT id FROM productos WHERE codigo = cp.codigo_producto
)
GROUP BY
    c.id, c.nombre, c.descripcion, c.categoria,
    cs.codigo_producto, cs.descripcion, cs.marca,
    cs.share_porcentaje, cs.unidades_vendidas_12s, cs.promedio_diario,
    cp.activo, c.activo;

-- PASO 7: Crear índices
CREATE INDEX IF NOT EXISTS idx_conjuntos_sustituibles_nombre ON conjuntos_sustituibles(nombre);
CREATE INDEX IF NOT EXISTS idx_conjuntos_sustituibles_categoria ON conjuntos_sustituibles(categoria);
CREATE INDEX IF NOT EXISTS idx_conjuntos_sustituibles_activo ON conjuntos_sustituibles(activo);
CREATE INDEX IF NOT EXISTS idx_conjunto_productos_conjunto ON conjunto_productos(conjunto_id);
CREATE INDEX IF NOT EXISTS idx_conjunto_productos_codigo ON conjunto_productos(codigo_producto);
CREATE INDEX IF NOT EXISTS idx_conjunto_productos_activo ON conjunto_productos(conjunto_id, activo);

-- Verificación
SELECT 'Migration 001 completada exitosamente' as status;
