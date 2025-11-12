-- =====================================================================================
-- SCHEMA: CONJUNTOS SUSTITUIBLES (Pronóstico Jerárquico)
-- =====================================================================================
-- Este schema implementa la funcionalidad de productos intercambiables
-- para mejorar el pronóstico de demanda y optimizar inventario.
--
-- Ejemplo: Si vendemos 3 marcas de azúcar blanca (A, B, C) y falta una,
-- el sistema redistribuye automáticamente la demanda entre las disponibles.
-- =====================================================================================

-- =====================================================================================
-- TABLA PRINCIPAL: conjuntos
-- =====================================================================================
-- Define grupos de productos que son funcionalmente intercambiables
CREATE TABLE IF NOT EXISTS conjuntos (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,              -- "Azúcar Blanca 1kg"
    descripcion TEXT,                          -- "Todas las marcas de azúcar blanca en presentación 1kg"
    categoria VARCHAR(100),                    -- "Alimentos > Granos"
    activo BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================================
-- TABLA: conjunto_productos
-- =====================================================================================
-- Relación many-to-many entre conjuntos y productos
-- Incluye share manual opcional para forzar distribución específica
CREATE TABLE IF NOT EXISTS conjunto_productos (
    id VARCHAR PRIMARY KEY,
    conjunto_id VARCHAR NOT NULL,
    codigo_producto VARCHAR(50) NOT NULL,
    share_manual DECIMAL(5,2),                 -- Share definido manualmente (opcional, 0-100)
    activo BOOLEAN DEFAULT true,
    fecha_agregado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (conjunto_id) REFERENCES conjuntos(id) ON DELETE CASCADE,
    UNIQUE(conjunto_id, codigo_producto)
);

-- =====================================================================================
-- VISTA: conjunto_shares
-- =====================================================================================
-- Calcula shares automáticamente basado en ventas históricas (últimas 12 semanas)
-- Si existe share_manual, lo usa; si no, calcula basado en ventas
CREATE OR REPLACE VIEW conjunto_shares AS
SELECT
    cp.conjunto_id,
    cp.codigo_producto,
    p.descripcion,
    p.categoria,
    p.marca,

    -- Cálculo de share: manual si existe, sino calculado de ventas
    COALESCE(
        cp.share_manual,
        (SUM(COALESCE(v.cantidad, 0)) * 100.0 /
         NULLIF(SUM(SUM(COALESCE(v.cantidad, 0))) OVER (PARTITION BY cp.conjunto_id), 0))
    ) as share_porcentaje,

    -- Estadísticas de ventas (últimas 12 semanas)
    SUM(COALESCE(v.cantidad, 0)) as unidades_vendidas_12s,
    AVG(COALESCE(v.cantidad, 0)) as promedio_diario,
    COUNT(DISTINCT v.fecha) as dias_con_ventas,

    -- Metadatos
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

-- =====================================================================================
-- VISTA: conjunto_demanda_total
-- =====================================================================================
-- Calcula la demanda total diaria de cada conjunto
-- Esto es más estable que la demanda individual de cada SKU
CREATE OR REPLACE VIEW conjunto_demanda_total AS
SELECT
    c.id as conjunto_id,
    c.nombre,
    c.categoria,

    -- Demanda total del conjunto (suma de todos los productos)
    SUM(
        COALESCE(v.cantidad, 0) / NULLIF(COUNT(DISTINCT v.fecha), 0)
    ) as demanda_diaria_promedio,

    -- Estadísticas
    COUNT(DISTINCT cp.codigo_producto) as total_productos,
    COUNT(DISTINCT CASE WHEN cp.activo THEN cp.codigo_producto END) as productos_activos,

    -- Última actualización
    MAX(v.fecha) as ultima_venta,
    c.activo

FROM conjuntos c
JOIN conjunto_productos cp ON c.id = cp.conjunto_id
LEFT JOIN items_facturas v ON v.codigo_producto = cp.codigo_producto
    AND v.fecha >= CURRENT_DATE - INTERVAL '12 weeks'
WHERE c.activo = true
GROUP BY c.id, c.nombre, c.categoria, c.activo;

-- =====================================================================================
-- VISTA: conjunto_productos_detalle
-- =====================================================================================
-- Vista completa con productos, shares, stock actual y demanda
-- Útil para dashboards y UI de administración
CREATE OR REPLACE VIEW conjunto_productos_detalle AS
SELECT
    c.id as conjunto_id,
    c.nombre as conjunto_nombre,
    c.descripcion as conjunto_descripcion,
    c.categoria as conjunto_categoria,

    -- Producto
    cs.codigo_producto,
    cs.descripcion as producto_descripcion,
    cs.marca as producto_marca,

    -- Shares y demanda
    cs.share_porcentaje,
    cs.unidades_vendidas_12s,
    cs.promedio_diario as demanda_diaria,

    -- Stock actual (agregado de todas las ubicaciones)
    COALESCE(SUM(s.cantidad), 0) as stock_total,

    -- Días de inventario (stock / demanda diaria)
    CASE
        WHEN cs.promedio_diario > 0 THEN COALESCE(SUM(s.cantidad), 0) / cs.promedio_diario
        ELSE NULL
    END as dias_inventario,

    -- Estado
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

-- =====================================================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================================================

CREATE INDEX IF NOT EXISTS idx_conjuntos_nombre ON conjuntos(nombre);
CREATE INDEX IF NOT EXISTS idx_conjuntos_categoria ON conjuntos(categoria);
CREATE INDEX IF NOT EXISTS idx_conjuntos_activo ON conjuntos(activo);

CREATE INDEX IF NOT EXISTS idx_conjunto_productos_conjunto ON conjunto_productos(conjunto_id);
CREATE INDEX IF NOT EXISTS idx_conjunto_productos_codigo ON conjunto_productos(codigo_producto);
CREATE INDEX IF NOT EXISTS idx_conjunto_productos_activo ON conjunto_productos(conjunto_id, activo);

-- =====================================================================================
-- COMENTARIOS EN TABLAS
-- =====================================================================================

COMMENT ON TABLE conjuntos IS 'Grupos de productos funcionalmente intercambiables para pronóstico jerárquico';
COMMENT ON TABLE conjunto_productos IS 'Productos que pertenecen a cada conjunto sustituible';
COMMENT ON VIEW conjunto_shares IS 'Participación de mercado (share) de cada producto en su conjunto';
COMMENT ON VIEW conjunto_demanda_total IS 'Demanda total agregada por conjunto';
COMMENT ON VIEW conjunto_productos_detalle IS 'Vista completa de productos con shares, stock y demanda';
