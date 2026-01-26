-- ============================================================================
-- MIGRATION: Optimize refresh_productos_analisis_cache
-- Date: 2026-01-26
-- Description: Scan ventas table only once instead of twice (2m + 6m)
--              This reduces scan from ~23M rows to ~4M rows
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_productos_analisis_cache()
RETURNS void AS $$
BEGIN
    -- Truncar y repoblar la tabla cache
    TRUNCATE TABLE productos_analisis_cache;

    INSERT INTO productos_analisis_cache (
        codigo, descripcion, categoria, clasificacion_abc,
        stock_cedi_seco, stock_cedi_caracas, stock_tiendas, num_tiendas_con_stock,
        ventas_2m, num_tiendas_con_ventas, ultima_venta, dias_sin_venta,
        rank_cantidad, rank_valor, stock_total, estado, updated_at
    )
    WITH stock_por_ubicacion AS (
        SELECT
            ia.producto_id,
            ia.ubicacion_id,
            SUM(ia.cantidad) as stock
        FROM inventario_actual ia
        GROUP BY ia.producto_id, ia.ubicacion_id
    ),
    stock_agregado AS (
        SELECT
            s.producto_id,
            SUM(CASE WHEN s.ubicacion_id = 'cedi_seco' THEN s.stock ELSE 0 END) as stock_cedi_seco,
            SUM(CASE WHEN s.ubicacion_id = 'cedi_caracas' THEN s.stock ELSE 0 END) as stock_cedi_caracas,
            SUM(CASE WHEN POSITION('cedi' IN s.ubicacion_id) != 1 THEN s.stock ELSE 0 END) as stock_tiendas,
            COUNT(DISTINCT CASE WHEN POSITION('cedi' IN s.ubicacion_id) != 1 AND s.stock > 0 THEN s.ubicacion_id END) as num_tiendas_con_stock,
            SUM(s.stock) as stock_total
        FROM stock_por_ubicacion s
        GROUP BY s.producto_id
    ),
    -- OPTIMIZATION: Single scan of ventas for 6-month window, compute both 2m and 6m metrics
    ventas_base AS (
        SELECT
            v.producto_id,
            v.ubicacion_id,
            v.cantidad_vendida,
            v.venta_total,
            v.costo_unitario,
            v.fecha_venta,
            (v.fecha_venta >= CURRENT_DATE - INTERVAL '2 months') as is_2m
        FROM ventas v
        WHERE v.fecha_venta >= CURRENT_DATE - INTERVAL '6 months'
    ),
    -- 2-month aggregation by producto + ubicacion (for num_tiendas_con_ventas)
    ventas_2m_por_ubicacion AS (
        SELECT
            producto_id,
            ubicacion_id,
            SUM(cantidad_vendida) as unidades_vendidas,
            SUM(venta_total) as valor_vendido,
            MAX(CASE WHEN cantidad_vendida > 0 THEN fecha_venta END) as ultima_venta
        FROM ventas_base
        WHERE is_2m = true
        GROUP BY producto_id, ubicacion_id
    ),
    ventas_agregadas AS (
        SELECT
            v.producto_id,
            SUM(v.unidades_vendidas) as ventas_2m_unidades,
            SUM(v.valor_vendido) as ventas_2m_valor,
            COUNT(DISTINCT v.ubicacion_id) as num_tiendas_con_ventas,
            MAX(v.ultima_venta) as ultima_venta
        FROM ventas_2m_por_ubicacion v
        GROUP BY v.producto_id
    ),
    -- 6-month aggregation for ABC classification (from same base table)
    ventas_6m AS (
        SELECT
            producto_id,
            SUM(cantidad_vendida * COALESCE(costo_unitario, 0)) as valor_consumo,
            COUNT(DISTINCT DATE_TRUNC('week', fecha_venta)) as semanas_con_venta
        FROM ventas_base
        GROUP BY producto_id
        HAVING COUNT(DISTINCT DATE_TRUNC('week', fecha_venta)) >= 4
    ),
    rankings AS (
        SELECT
            producto_id,
            ROW_NUMBER() OVER (ORDER BY ventas_2m_unidades DESC NULLS LAST) as rank_cantidad,
            ROW_NUMBER() OVER (ORDER BY ventas_2m_valor DESC NULLS LAST) as rank_valor
        FROM ventas_agregadas
    ),
    abc_ranked AS (
        SELECT
            producto_id,
            valor_consumo,
            ROW_NUMBER() OVER (ORDER BY valor_consumo DESC) as ranking,
            COUNT(*) OVER () as total_productos_abc
        FROM ventas_6m
        WHERE valor_consumo > 0
    ),
    abc_classification AS (
        SELECT
            producto_id,
            CASE
                WHEN ranking <= (total_productos_abc * 0.20) THEN 'A'
                WHEN ranking <= (total_productos_abc * 0.50) THEN 'B'
                ELSE 'C'
            END as clasificacion_abc
        FROM abc_ranked
    )
    SELECT
        p.id as codigo,
        p.nombre as descripcion,
        p.categoria,
        COALESCE(abc.clasificacion_abc, 'SIN_VENTAS') as clasificacion_abc,
        COALESCE(sa.stock_cedi_seco, 0)::INTEGER as stock_cedi_seco,
        COALESCE(sa.stock_cedi_caracas, 0)::INTEGER as stock_cedi_caracas,
        COALESCE(sa.stock_tiendas, 0)::INTEGER as stock_tiendas,
        COALESCE(sa.num_tiendas_con_stock, 0)::INTEGER as num_tiendas_con_stock,
        COALESCE(va.ventas_2m_unidades, 0)::INTEGER as ventas_2m,
        COALESCE(va.num_tiendas_con_ventas, 0)::INTEGER as num_tiendas_con_ventas,
        va.ultima_venta::DATE as ultima_venta,
        CASE
            WHEN va.ultima_venta IS NULL THEN NULL
            ELSE (CURRENT_DATE - va.ultima_venta::date)
        END as dias_sin_venta,
        COALESCE(r.rank_cantidad, 999999) as rank_cantidad,
        COALESCE(r.rank_valor, 999999) as rank_valor,
        COALESCE(sa.stock_total, 0)::INTEGER as stock_total,
        CASE
            WHEN COALESCE(sa.stock_total, 0) = 0 AND COALESCE(va.ventas_2m_unidades, 0) = 0 THEN 'FANTASMA'
            WHEN COALESCE(sa.stock_total, 0) = 0 AND COALESCE(va.ventas_2m_unidades, 0) > 0 THEN 'ANOMALIA'
            WHEN COALESCE(sa.stock_tiendas, 0) = 0
                 AND (COALESCE(sa.stock_cedi_seco, 0) > 0 OR COALESCE(sa.stock_cedi_caracas, 0) > 0)
                 AND COALESCE(va.ventas_2m_unidades, 0) = 0 THEN 'CRITICO'
            WHEN COALESCE(sa.stock_total, 0) > 0 AND COALESCE(va.ventas_2m_unidades, 0) = 0 THEN 'DORMIDO'
            WHEN COALESCE(va.ventas_2m_unidades, 0) > 0 AND (
                COALESCE(sa.stock_tiendas, 0) < 10
                OR (COALESCE(sa.stock_cedi_seco, 0) = 0 AND COALESCE(sa.stock_cedi_caracas, 0) = 0)
            ) THEN 'AGOTANDOSE'
            ELSE 'ACTIVO'
        END as estado,
        CURRENT_TIMESTAMP as updated_at
    FROM productos p
    LEFT JOIN stock_agregado sa ON p.id = sa.producto_id
    LEFT JOIN ventas_agregadas va ON p.id = va.producto_id
    LEFT JOIN rankings r ON p.id = r.producto_id
    LEFT JOIN abc_classification abc ON p.id = abc.producto_id;

    -- Log de actualización
    RAISE NOTICE 'productos_analisis_cache actualizada: % registros',
        (SELECT COUNT(*) FROM productos_analisis_cache);
END;
$$ LANGUAGE plpgsql;
