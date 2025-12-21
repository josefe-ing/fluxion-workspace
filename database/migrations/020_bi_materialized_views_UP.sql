-- =========================================================================
-- Migration 020 UP: Business Intelligence Materialized Views
-- Description: Vistas materializadas para m??tricas de BI (GMROI, rotaci??n, cobertura)
-- Date: 2025-12-20
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Tabla de activaci??n de Fluxion por tienda (para calcular baseline)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tiendas_fluxion_activacion (
    ubicacion_id VARCHAR(50) PRIMARY KEY,
    fecha_activacion DATE NOT NULL,
    stock_baseline NUMERIC(18,2) DEFAULT 0,  -- Stock valorizado el d??a de activaci??n
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE tiendas_fluxion_activacion IS 'Registro de fecha de activaci??n de Fluxion por tienda para calcular ROI';
COMMENT ON COLUMN tiendas_fluxion_activacion.stock_baseline IS 'Stock valorizado el d??a 1 de activaci??n (baseline para calcular reducci??n)';

-- Datos iniciales: Para??so activa desde 15 Dic 2025
INSERT INTO tiendas_fluxion_activacion (ubicacion_id, fecha_activacion, activo)
VALUES ('tienda_18', '2025-12-15', true)
ON CONFLICT (ubicacion_id) DO NOTHING;

-- -------------------------------------------------------------------------
-- 2. Vista Materializada: Stock valorizado por ubicaci??n
-- -------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS mv_bi_stock_por_ubicacion CASCADE;

CREATE MATERIALIZED VIEW mv_bi_stock_por_ubicacion AS
SELECT
    u.id as ubicacion_id,
    u.nombre,
    u.tipo,
    u.region,
    COALESCE(SUM(i.valor_inventario), 0) as stock_actual,
    COUNT(DISTINCT i.producto_codigo) as skus_con_stock,
    COUNT(DISTINCT i.producto_codigo) FILTER (WHERE i.cantidad_disponible <= 0) as skus_sin_stock,
    COUNT(DISTINCT i.producto_codigo) FILTER (WHERE i.cantidad_disponible > 0) as skus_activos,
    -- Fill rate: % de SKUs con stock > 0
    ROUND(
        COUNT(DISTINCT i.producto_codigo) FILTER (WHERE i.cantidad_disponible > 0)::numeric /
        NULLIF(COUNT(DISTINCT i.producto_codigo), 0) * 100, 2
    ) as fill_rate_pct
FROM ubicaciones u
LEFT JOIN inventario_actual i ON u.id = i.tienda_codigo
WHERE u.activo = true
GROUP BY u.id, u.nombre, u.tipo, u.region;

CREATE UNIQUE INDEX ON mv_bi_stock_por_ubicacion(ubicacion_id);
CREATE INDEX ON mv_bi_stock_por_ubicacion(region);
CREATE INDEX ON mv_bi_stock_por_ubicacion(tipo);

COMMENT ON MATERIALIZED VIEW mv_bi_stock_por_ubicacion IS 'Stock valorizado y fill rate por ubicaci??n - refrescar cada 30 min';

-- -------------------------------------------------------------------------
-- 3. Vista Materializada: GMROI y rotaci??n por producto-ubicaci??n
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
        i.producto_codigo as producto_id,
        i.tienda_codigo as ubicacion_id,
        i.valor_inventario as inv_actual,
        i.cantidad_disponible,
        i.costo_unitario
    FROM inventario_actual i
    WHERE i.cantidad_disponible >= 0
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
    -- Rotaci??n Anual = (Costo Ventas 30d / Inventario) * 12
    CASE
        WHEN COALESCE(s.inv_actual, 0) > 0
        THEN ROUND((v.costo_total / s.inv_actual) * 12, 2)
        ELSE 0
    END as rotacion_anual,
    -- Velocidad de venta (unidades/d??a)
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

COMMENT ON MATERIALIZED VIEW mv_bi_producto_metricas IS 'M??tricas de rentabilidad por producto-ubicaci??n - refrescar cada 30 min';

-- -------------------------------------------------------------------------
-- 4. Vista Materializada: Cobertura de productos por regi??n
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
        COUNT(DISTINCT i.tienda_codigo) FILTER (WHERE i.cantidad_disponible > 20) as tiendas_con_stock,
        COUNT(DISTINCT i.tienda_codigo) FILTER (WHERE i.cantidad_disponible > 0 AND i.cantidad_disponible <= 20) as tiendas_stock_bajo,
        COUNT(DISTINCT i.tienda_codigo) FILTER (WHERE i.cantidad_disponible <= 0 OR i.cantidad_disponible IS NULL) as tiendas_sin_stock,
        SUM(i.cantidad_disponible) FILTER (WHERE i.cantidad_disponible > 0) as stock_total_tiendas,
        SUM(i.valor_inventario) FILTER (WHERE i.cantidad_disponible > 0) as valor_total_tiendas
    FROM productos p
    CROSS JOIN (SELECT DISTINCT region FROM ubicaciones WHERE tipo = 'tienda' AND activo = true) u
    LEFT JOIN inventario_actual i ON p.id = i.producto_codigo
    LEFT JOIN ubicaciones ub ON i.tienda_codigo = ub.id AND ub.region = u.region AND ub.tipo = 'tienda'
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

COMMENT ON MATERIALIZED VIEW mv_bi_cobertura_productos IS 'Cobertura de productos por regi??n - umbral 20 unidades';

-- -------------------------------------------------------------------------
-- 5. Vista Materializada: Stock atrapado en CEDI
-- -------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS mv_bi_stock_atrapado_cedi CASCADE;

CREATE MATERIALIZED VIEW mv_bi_stock_atrapado_cedi AS
WITH stock_cedi AS (
    SELECT
        i.producto_codigo as producto_id,
        i.tienda_codigo as cedi_id,
        u.region,
        i.cantidad_disponible as stock_cedi,
        i.valor_inventario as valor_cedi
    FROM inventario_actual i
    JOIN ubicaciones u ON i.tienda_codigo = u.id
    WHERE u.tipo = 'cedi' AND i.cantidad_disponible > 0
),
stock_tiendas AS (
    SELECT
        i.producto_codigo as producto_id,
        u.region,
        SUM(i.cantidad_disponible) as stock_total_tiendas,
        COUNT(DISTINCT i.tienda_codigo) FILTER (WHERE i.cantidad_disponible > 20) as tiendas_con_stock
    FROM inventario_actual i
    JOIN ubicaciones u ON i.tienda_codigo = u.id
    WHERE u.tipo = 'tienda' AND u.activo = true
    GROUP BY i.producto_codigo, u.region
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
    COALESCE(vr.tiendas_vendiendo, 0) as tiendas_vendiendo,
    -- D??as sin movimiento estimado
    CASE
        WHEN COALESCE(vr.venta_30d, 0) > 0 THEN
            ROUND(sc.valor_cedi / (vr.venta_30d / 30.0), 0)
        ELSE 999
    END as dias_stock_estimado
FROM stock_cedi sc
JOIN productos p ON sc.producto_id = p.id
LEFT JOIN stock_tiendas st ON sc.producto_id = st.producto_id AND sc.region = st.region
LEFT JOIN ventas_recientes vr ON sc.producto_id = vr.producto_id AND sc.region = vr.region
WHERE COALESCE(st.stock_total_tiendas, 0) < 20  -- Stock bajo o nulo en tiendas
ORDER BY sc.valor_cedi DESC;

CREATE INDEX ON mv_bi_stock_atrapado_cedi(producto_id);
CREATE INDEX ON mv_bi_stock_atrapado_cedi(region);
CREATE INDEX ON mv_bi_stock_atrapado_cedi(cedi_id);
CREATE INDEX ON mv_bi_stock_atrapado_cedi(valor_atrapado DESC);

COMMENT ON MATERIALIZED VIEW mv_bi_stock_atrapado_cedi IS 'Productos con stock en CEDI pero <20 unidades en tiendas de su regi??n';

-- -------------------------------------------------------------------------
-- 6. Vista Materializada: Resumen por categor??a (seco/frio/verde)
-- -------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS mv_bi_rentabilidad_categoria CASCADE;

CREATE MATERIALIZED VIEW mv_bi_rentabilidad_categoria AS
WITH ventas_categoria AS (
    SELECT
        p.cedi_origen_id as categoria,
        SUM(v.venta_total) as ventas_30d,
        SUM(v.costo_total) as costo_30d,
        SUM(v.utilidad_bruta) as utilidad_30d,
        AVG(v.margen_bruto_pct) as margen_promedio,
        COUNT(DISTINCT v.producto_id) as productos_vendidos,
        COUNT(*) as transacciones
    FROM ventas v
    JOIN productos p ON v.producto_id = p.id
    WHERE v.fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY p.cedi_origen_id
),
stock_categoria AS (
    SELECT
        p.cedi_origen_id as categoria,
        SUM(i.valor_inventario) as stock_valorizado,
        COUNT(DISTINCT i.producto_codigo) as skus_con_stock
    FROM inventario_actual i
    JOIN productos p ON i.producto_codigo = p.id
    WHERE i.cantidad_disponible > 0
    GROUP BY p.cedi_origen_id
)
SELECT
    COALESCE(vc.categoria, sc.categoria) as categoria,
    COALESCE(vc.ventas_30d, 0) as ventas_30d,
    COALESCE(vc.costo_30d, 0) as costo_30d,
    COALESCE(vc.utilidad_30d, 0) as utilidad_30d,
    COALESCE(vc.margen_promedio, 0) as margen_promedio,
    COALESCE(vc.productos_vendidos, 0) as productos_vendidos,
    COALESCE(vc.transacciones, 0) as transacciones,
    COALESCE(sc.stock_valorizado, 0) as stock_valorizado,
    COALESCE(sc.skus_con_stock, 0) as skus_con_stock,
    -- GMROI por categor??a
    CASE
        WHEN COALESCE(sc.stock_valorizado, 0) > 0
        THEN ROUND(COALESCE(vc.utilidad_30d, 0) / sc.stock_valorizado, 2)
        ELSE 0
    END as gmroi,
    -- Rotaci??n anual por categor??a
    CASE
        WHEN COALESCE(sc.stock_valorizado, 0) > 0
        THEN ROUND((COALESCE(vc.costo_30d, 0) / sc.stock_valorizado) * 12, 2)
        ELSE 0
    END as rotacion_anual
FROM ventas_categoria vc
FULL OUTER JOIN stock_categoria sc ON vc.categoria = sc.categoria
WHERE COALESCE(vc.categoria, sc.categoria) IS NOT NULL;

CREATE UNIQUE INDEX ON mv_bi_rentabilidad_categoria(categoria);

COMMENT ON MATERIALIZED VIEW mv_bi_rentabilidad_categoria IS 'Rentabilidad agregada por categor??a (seco/frio/verde)';

-- -------------------------------------------------------------------------
-- 7. Funci??n para refrescar todas las vistas BI
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_bi_views()
RETURNS TABLE(
    vista VARCHAR,
    tiempo_ms INTEGER,
    status VARCHAR
) AS $$
DECLARE
    v_inicio TIMESTAMP;
    v_tiempo INTEGER;
BEGIN
    -- Refrescar mv_bi_stock_por_ubicacion
    v_inicio := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_stock_por_ubicacion;
    v_tiempo := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::INTEGER;
    vista := 'mv_bi_stock_por_ubicacion';
    tiempo_ms := v_tiempo;
    status := 'OK';
    RETURN NEXT;

    -- Refrescar mv_bi_producto_metricas
    v_inicio := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_producto_metricas;
    v_tiempo := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::INTEGER;
    vista := 'mv_bi_producto_metricas';
    tiempo_ms := v_tiempo;
    status := 'OK';
    RETURN NEXT;

    -- Refrescar mv_bi_cobertura_productos
    v_inicio := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_cobertura_productos;
    v_tiempo := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::INTEGER;
    vista := 'mv_bi_cobertura_productos';
    tiempo_ms := v_tiempo;
    status := 'OK';
    RETURN NEXT;

    -- Refrescar mv_bi_stock_atrapado_cedi
    v_inicio := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_stock_atrapado_cedi;
    v_tiempo := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::INTEGER;
    vista := 'mv_bi_stock_atrapado_cedi';
    tiempo_ms := v_tiempo;
    status := 'OK';
    RETURN NEXT;

    -- Refrescar mv_bi_rentabilidad_categoria
    v_inicio := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_rentabilidad_categoria;
    v_tiempo := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::INTEGER;
    vista := 'mv_bi_rentabilidad_categoria';
    tiempo_ms := v_tiempo;
    status := 'OK';
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    vista := 'ERROR';
    tiempo_ms := 0;
    status := SQLERRM;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_bi_views IS 'Refresca todas las vistas materializadas de BI - llamar cada 30 min';

-- -------------------------------------------------------------------------
-- 8. Registrar migraci??n
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('020', 'bi_materialized_views')
ON CONFLICT (version) DO UPDATE SET
    name = 'bi_materialized_views',
    applied_at = CURRENT_TIMESTAMP;

COMMIT;

-- =========================================================================
-- End of Migration 020 UP
-- =========================================================================
