-- =========================================================================
-- Migration 020 UP: Business Intelligence Materialized Views (FIXED)
-- Description: Vistas materializadas para métricas de BI (GMROI, rotación, cobertura)
-- Date: 2025-12-26
-- Author: System - Fixed for production schema
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Tabla de activación de Fluxion por tienda (para calcular baseline)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tiendas_fluxion_activacion (
    ubicacion_id VARCHAR(50) PRIMARY KEY,
    fecha_activacion DATE NOT NULL,
    stock_baseline NUMERIC(18,2) DEFAULT 0,  -- Stock valorizado el día de activación
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE tiendas_fluxion_activacion IS 'Registro de fecha de activación de Fluxion por tienda para calcular ROI';
COMMENT ON COLUMN tiendas_fluxion_activacion.stock_baseline IS 'Stock valorizado el día 1 de activación (baseline para calcular reducción)';

-- Datos iniciales: Paraíso activa desde 15 Dic 2025
INSERT INTO tiendas_fluxion_activacion (ubicacion_id, fecha_activacion, activo)
VALUES ('tienda_18', '2025-12-15', true)
ON CONFLICT (ubicacion_id) DO NOTHING;

-- -------------------------------------------------------------------------
-- 2. Vista Materializada: Stock valorizado por ubicación
-- -------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS mv_bi_stock_por_ubicacion CASCADE;

CREATE MATERIALIZED VIEW mv_bi_stock_por_ubicacion AS
SELECT
    u.id as ubicacion_id,
    u.nombre,
    u.tipo,
    u.region,
    COALESCE(SUM(i.cantidad * p.costo_promedio), 0) as stock_actual,
    COUNT(DISTINCT i.producto_id) as skus_con_stock,
    COUNT(DISTINCT i.producto_id) FILTER (WHERE i.cantidad <= 0) as skus_sin_stock,
    COUNT(DISTINCT i.producto_id) FILTER (WHERE i.cantidad > 0) as skus_activos,
    -- Fill rate: % de SKUs con stock > 0
    ROUND(
        COUNT(DISTINCT i.producto_id) FILTER (WHERE i.cantidad > 0)::numeric /
        NULLIF(COUNT(DISTINCT i.producto_id), 0) * 100, 2
    ) as fill_rate_pct
FROM ubicaciones u
LEFT JOIN inventario_actual i ON u.id = i.ubicacion_id
LEFT JOIN productos p ON i.producto_id = p.id
WHERE u.activo = true
GROUP BY u.id, u.nombre, u.tipo, u.region;

CREATE UNIQUE INDEX ON mv_bi_stock_por_ubicacion(ubicacion_id);
CREATE INDEX ON mv_bi_stock_por_ubicacion(region);
CREATE INDEX ON mv_bi_stock_por_ubicacion(tipo);

COMMENT ON MATERIALIZED VIEW mv_bi_stock_por_ubicacion IS 'Stock valorizado y fill rate por ubicación - refrescar cada 30 min';

-- -------------------------------------------------------------------------
-- 3. Vista Materializada: GMROI y rotación por producto-ubicación
-- -------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS mv_bi_producto_metricas CASCADE;

CREATE MATERIALIZED VIEW mv_bi_producto_metricas AS
WITH ventas_30d AS (
    SELECT
        v.producto_id,
        v.ubicacion_id,
        SUM(v.venta_total) as venta_total,
        SUM(v.costo_total) as costo_total,
        SUM(v.utilidad_bruta) as utilidad_bruta,
        AVG(v.margen_bruto_pct) as margen_promedio,
        COUNT(*) as transacciones,
        SUM(v.cantidad_vendida) as unidades_vendidas
    FROM ventas v
    WHERE v.fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY v.producto_id, v.ubicacion_id
),
stock_actual AS (
    SELECT
        i.producto_id,
        i.ubicacion_id,
        SUM(i.cantidad * p.costo_promedio) as inv_actual,
        SUM(i.cantidad) as cantidad_disponible,
        MAX(p.costo_promedio) as costo_unitario
    FROM inventario_actual i
    JOIN productos p ON i.producto_id = p.id
    WHERE i.cantidad >= 0
    GROUP BY i.producto_id, i.ubicacion_id
)
SELECT
    v.producto_id,
    v.ubicacion_id,
    p.nombre as producto_nombre,
    p.cedi_origen_id as categoria,
    v.venta_total as ventas_30d,
    v.costo_total as costo_30d,
    v.utilidad_bruta as utilidad_30d,
    v.margen_promedio,
    v.transacciones,
    v.unidades_vendidas,
    COALESCE(s.inv_actual, 0) as inventario_actual,
    COALESCE(s.cantidad_disponible, 0) as stock_unidades,
    -- GMROI = Utilidad Bruta / Inventario Promedio (usamos actual como proxy)
    CASE
        WHEN COALESCE(s.inv_actual, 0) > 0
        THEN ROUND(v.utilidad_bruta / s.inv_actual, 2)
        ELSE 0
    END as gmroi,
    -- Rotación Anual = (Costo Ventas 30d / Inventario) * 12
    CASE
        WHEN COALESCE(s.inv_actual, 0) > 0
        THEN ROUND((v.costo_total / s.inv_actual) * 12, 2)
        ELSE 0
    END as rotacion_anual,
    -- Velocidad de venta (unidades/día)
    ROUND(v.unidades_vendidas / 30.0, 2) as velocidad_diaria
FROM ventas_30d v
JOIN productos p ON v.producto_id = p.id
LEFT JOIN stock_actual s ON v.producto_id = s.producto_id AND v.ubicacion_id = s.ubicacion_id;

CREATE INDEX ON mv_bi_producto_metricas(producto_id);
CREATE INDEX ON mv_bi_producto_metricas(ubicacion_id);
CREATE INDEX ON mv_bi_producto_metricas(categoria);
CREATE INDEX ON mv_bi_producto_metricas(gmroi DESC);
CREATE INDEX ON mv_bi_producto_metricas(rotacion_anual DESC);
CREATE INDEX ON mv_bi_producto_metricas(ventas_30d DESC);

COMMENT ON MATERIALIZED VIEW mv_bi_producto_metricas IS 'Métricas de rentabilidad por producto-ubicación - refrescar cada 30 min';

-- -------------------------------------------------------------------------
-- 4. Vista Materializada: Cobertura de productos por región
-- -------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS mv_bi_cobertura_productos CASCADE;

CREATE MATERIALIZED VIEW mv_bi_cobertura_productos AS
WITH tiendas_por_region AS (
    SELECT
        region,
        COUNT(*) as total_tiendas
    FROM ubicaciones
    WHERE tipo = 'tienda' AND activo = true
    GROUP BY region
),
cobertura AS (
    SELECT
        p.id as producto_id,
        p.nombre as producto_nombre,
        p.cedi_origen_id as categoria,
        u.region,
        COUNT(DISTINCT i.ubicacion_id) FILTER (WHERE i.cantidad > 20) as tiendas_con_stock,
        COUNT(DISTINCT i.ubicacion_id) FILTER (WHERE i.cantidad > 0 AND i.cantidad <= 20) as tiendas_stock_bajo,
        COUNT(DISTINCT i.ubicacion_id) FILTER (WHERE i.cantidad <= 0 OR i.cantidad IS NULL) as tiendas_sin_stock,
        SUM(i.cantidad) FILTER (WHERE i.cantidad > 0) as stock_total_tiendas,
        SUM(i.cantidad * pr.costo_promedio) FILTER (WHERE i.cantidad > 0) as valor_total_tiendas
    FROM productos p
    CROSS JOIN (SELECT DISTINCT region FROM ubicaciones WHERE tipo = 'tienda' AND activo = true) u
    LEFT JOIN inventario_actual i ON p.id = i.producto_id
    LEFT JOIN productos pr ON p.id = pr.id
    LEFT JOIN ubicaciones ub ON i.ubicacion_id = ub.id AND ub.region = u.region AND ub.tipo = 'tienda'
    WHERE p.activo = true
    GROUP BY p.id, p.nombre, p.cedi_origen_id, u.region
)
SELECT
    c.*,
    t.total_tiendas,
    ROUND(c.tiendas_con_stock::numeric / NULLIF(t.total_tiendas, 0) * 100, 1) as cobertura_pct,
    ROUND((c.tiendas_con_stock + c.tiendas_stock_bajo)::numeric / NULLIF(t.total_tiendas, 0) * 100, 1) as cobertura_parcial_pct
FROM cobertura c
JOIN tiendas_por_region t ON c.region = t.region;

CREATE INDEX ON mv_bi_cobertura_productos(producto_id);
CREATE INDEX ON mv_bi_cobertura_productos(region);
CREATE INDEX ON mv_bi_cobertura_productos(categoria);
CREATE INDEX ON mv_bi_cobertura_productos(cobertura_pct);

COMMENT ON MATERIALIZED VIEW mv_bi_cobertura_productos IS 'Cobertura de productos por región - umbral 20 unidades';

-- -------------------------------------------------------------------------
-- 5. Vista Materializada: Stock atrapado en CEDI
-- -------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS mv_bi_stock_atrapado_cedi CASCADE;

CREATE MATERIALIZED VIEW mv_bi_stock_atrapado_cedi AS
WITH stock_cedi AS (
    SELECT
        i.producto_id,
        i.ubicacion_id as cedi_id,
        u.region,
        i.cantidad as stock_cedi,
        i.cantidad * pr.costo_promedio as valor_cedi
    FROM inventario_actual i
    JOIN ubicaciones u ON i.ubicacion_id = u.id
    JOIN productos pr ON i.producto_id = pr.id
    WHERE u.tipo = 'cedi' AND i.cantidad > 0
),
stock_tiendas AS (
    SELECT
        i.producto_id,
        u.region,
        SUM(i.cantidad) as stock_total_tiendas,
        COUNT(DISTINCT i.ubicacion_id) FILTER (WHERE i.cantidad > 20) as tiendas_con_stock
    FROM inventario_actual i
    JOIN ubicaciones u ON i.ubicacion_id = u.id
    WHERE u.tipo = 'tienda' AND u.activo = true
    GROUP BY i.producto_id, u.region
),
ventas_recientes AS (
    SELECT
        v.producto_id,
        u.region,
        SUM(v.venta_total) as venta_30d,
        COUNT(DISTINCT v.ubicacion_id) as tiendas_vendiendo
    FROM ventas v
    JOIN ubicaciones u ON v.ubicacion_id = u.id
    WHERE v.fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
      AND u.tipo = 'tienda'
    GROUP BY v.producto_id, u.region
)
SELECT
    sc.producto_id,
    p.nombre as producto_nombre,
    p.cedi_origen_id as categoria,
    sc.cedi_id,
    sc.region,
    sc.stock_cedi,
    sc.valor_cedi as valor_atrapado,
    COALESCE(st.stock_total_tiendas, 0) as stock_en_tiendas,
    COALESCE(st.tiendas_con_stock, 0) as tiendas_con_stock,
    COALESCE(vr.venta_30d, 0) as venta_30d,
    -- Días de stock estimado basado en ventas recientes
    CASE
        WHEN COALESCE(vr.venta_30d, 0) > 0
        THEN ROUND((sc.stock_cedi * sc.valor_cedi) / (vr.venta_30d / 30.0), 0)::int
        ELSE 999
    END as dias_stock_estimado
FROM stock_cedi sc
JOIN productos p ON sc.producto_id = p.id
LEFT JOIN stock_tiendas st ON sc.producto_id = st.producto_id AND sc.region = st.region
LEFT JOIN ventas_recientes vr ON sc.producto_id = vr.producto_id AND sc.region = vr.region
WHERE COALESCE(st.stock_total_tiendas, 0) < 20;  -- Umbral bajo stock en tiendas

CREATE INDEX ON mv_bi_stock_atrapado_cedi(producto_id);
CREATE INDEX ON mv_bi_stock_atrapado_cedi(cedi_id);
CREATE INDEX ON mv_bi_stock_atrapado_cedi(region);
CREATE INDEX ON mv_bi_stock_atrapado_cedi(valor_atrapado DESC);

COMMENT ON MATERIALIZED VIEW mv_bi_stock_atrapado_cedi IS 'Productos con stock en CEDI pero < 20 unidades en tiendas de su región';

-- -------------------------------------------------------------------------
-- 6. Vista Materializada: Rentabilidad por categoría
-- -------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS mv_bi_rentabilidad_categoria CASCADE;

CREATE MATERIALIZED VIEW mv_bi_rentabilidad_categoria AS
SELECT
    categoria,
    SUM(ventas_30d) as ventas_30d,
    SUM(utilidad_30d) as utilidad_30d,
    CASE
        WHEN SUM(ventas_30d) > 0
        THEN ROUND(AVG(margen_promedio), 2)
        ELSE 0
    END as margen_promedio,
    SUM(inventario_actual) as stock_valorizado,
    -- GMROI ponderado por categoría
    CASE
        WHEN SUM(inventario_actual) > 0
        THEN ROUND(SUM(utilidad_30d) / SUM(inventario_actual), 2)
        ELSE 0
    END as gmroi,
    -- Rotación ponderada
    CASE
        WHEN SUM(inventario_actual) > 0
        THEN ROUND((SUM(costo_30d) / SUM(inventario_actual)) * 12, 2)
        ELSE 0
    END as rotacion_anual,
    COUNT(DISTINCT producto_id) as productos_vendidos,
    COUNT(DISTINCT ubicacion_id) as ubicaciones,
    COUNT(DISTINCT producto_id) FILTER (WHERE inventario_actual > 0) as skus_con_stock
FROM mv_bi_producto_metricas
WHERE categoria IS NOT NULL
GROUP BY categoria
ORDER BY ventas_30d DESC;

CREATE INDEX ON mv_bi_rentabilidad_categoria(categoria);
CREATE INDEX ON mv_bi_rentabilidad_categoria(gmroi DESC);

COMMENT ON MATERIALIZED VIEW mv_bi_rentabilidad_categoria IS 'Rentabilidad agregada por categoría (CEDI origen)';

-- -------------------------------------------------------------------------
-- 7. Función para refrescar todas las vistas
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_bi_views() RETURNS TABLE(
    vista_nombre TEXT,
    tiempo_ms BIGINT,
    status TEXT
) AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
BEGIN
    -- Vista 1: Stock por ubicación
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_stock_por_ubicacion;
    end_time := clock_timestamp();
    vista_nombre := 'mv_bi_stock_por_ubicacion';
    tiempo_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::BIGINT;
    status := 'OK';
    RETURN NEXT;

    -- Vista 2: Producto métricas
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_producto_metricas;
    end_time := clock_timestamp();
    vista_nombre := 'mv_bi_producto_metricas';
    tiempo_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::BIGINT;
    status := 'OK';
    RETURN NEXT;

    -- Vista 3: Cobertura
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_cobertura_productos;
    end_time := clock_timestamp();
    vista_nombre := 'mv_bi_cobertura_productos';
    tiempo_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::BIGINT;
    status := 'OK';
    RETURN NEXT;

    -- Vista 4: Stock atrapado
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_stock_atrapado_cedi;
    end_time := clock_timestamp();
    vista_nombre := 'mv_bi_stock_atrapado_cedi';
    tiempo_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::BIGINT;
    status := 'OK';
    RETURN NEXT;

    -- Vista 5: Rentabilidad categoría
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_rentabilidad_categoria;
    end_time := clock_timestamp();
    vista_nombre := 'mv_bi_rentabilidad_categoria';
    tiempo_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::BIGINT;
    status := 'OK';
    RETURN NEXT;

    RETURN;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_bi_views() IS 'Refresca todas las vistas materializadas de BI de forma concurrente';

COMMIT;
