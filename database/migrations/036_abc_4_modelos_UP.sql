-- =========================================================================
-- Migration 036 UP: 4-Model ABC Classification with Active Switch
-- Description: Adds 4 parallel classification models (ranking_volumen,
--              ranking_valor, pareto_volumen, pareto_valor) to ABC cache
--              tables. A config switch controls which model is active.
--              All downstream consumers keep reading clase_abc unchanged.
-- Date: 2026-01-31
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. New columns on productos_abc_cache
-- -------------------------------------------------------------------------

ALTER TABLE productos_abc_cache
ADD COLUMN IF NOT EXISTS rank_valor INTEGER;

ALTER TABLE productos_abc_cache
ADD COLUMN IF NOT EXISTS clase_ranking_vol CHAR(1);

ALTER TABLE productos_abc_cache
ADD COLUMN IF NOT EXISTS clase_ranking_val CHAR(1);

ALTER TABLE productos_abc_cache
ADD COLUMN IF NOT EXISTS clase_pareto_vol CHAR(1);

ALTER TABLE productos_abc_cache
ADD COLUMN IF NOT EXISTS clase_pareto_val CHAR(1);

CREATE INDEX IF NOT EXISTS idx_abc_cache_rank_valor ON productos_abc_cache(rank_valor);

-- -------------------------------------------------------------------------
-- 2. New columns on productos_abc_tienda
-- -------------------------------------------------------------------------

ALTER TABLE productos_abc_tienda
ADD COLUMN IF NOT EXISTS rank_valor INTEGER;

ALTER TABLE productos_abc_tienda
ADD COLUMN IF NOT EXISTS clase_ranking_vol CHAR(1);

ALTER TABLE productos_abc_tienda
ADD COLUMN IF NOT EXISTS clase_ranking_val CHAR(1);

ALTER TABLE productos_abc_tienda
ADD COLUMN IF NOT EXISTS clase_pareto_vol CHAR(1);

ALTER TABLE productos_abc_tienda
ADD COLUMN IF NOT EXISTS clase_pareto_val CHAR(1);

CREATE INDEX IF NOT EXISTS idx_abc_tienda_rank_valor
    ON productos_abc_tienda(ubicacion_id, rank_valor);

-- -------------------------------------------------------------------------
-- 3. Config: active model selector + Pareto thresholds
-- -------------------------------------------------------------------------

INSERT INTO config_inventario_global
    (id, categoria, parametro, valor_texto, descripcion, unidad, activo)
VALUES
    ('abc_modelo_activo', 'abc_modelo', 'modelo_activo', 'ranking_volumen',
     'Modelo ABC activo: ranking_volumen, ranking_valor, pareto_volumen, pareto_valor',
     'texto', true)
ON CONFLICT (id) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    fecha_modificacion = CURRENT_TIMESTAMP;

INSERT INTO config_inventario_global
    (id, categoria, parametro, valor_numerico, descripcion, unidad, activo)
VALUES
    ('pareto_umbral_a_pct', 'abc_umbrales_pareto', 'umbral_a_pct', 80,
     'Porcentaje acumulado para clase A en modelos Pareto', 'porcentaje', true),
    ('pareto_umbral_b_pct', 'abc_umbrales_pareto', 'umbral_b_pct', 95,
     'Porcentaje acumulado para clase B en modelos Pareto', 'porcentaje', true)
ON CONFLICT (id) DO UPDATE SET
    valor_numerico = EXCLUDED.valor_numerico,
    descripcion = EXCLUDED.descripcion,
    fecha_modificacion = CURRENT_TIMESTAMP;

-- -------------------------------------------------------------------------
-- 4. Replace recalcular_abc_cache() - now computes 4 models in one pass
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recalcular_abc_cache(
    p_dias INTEGER DEFAULT 30,
    p_producto_excluido VARCHAR DEFAULT '003760',
    p_umbral_a INTEGER DEFAULT 50,
    p_umbral_b INTEGER DEFAULT 200,
    p_umbral_c INTEGER DEFAULT 800,
    p_pareto_a_pct NUMERIC DEFAULT 80,
    p_pareto_b_pct NUMERIC DEFAULT 95,
    p_modelo_activo VARCHAR DEFAULT 'ranking_volumen'
)
RETURNS TABLE(
    productos_procesados INTEGER,
    tiempo_ms INTEGER,
    productos_a INTEGER,
    productos_b INTEGER,
    productos_c INTEGER,
    productos_d INTEGER
) AS $$
DECLARE
    v_inicio TIMESTAMP;
    v_productos INTEGER;
    v_control_id INTEGER;
    v_productos_a INTEGER;
    v_productos_b INTEGER;
    v_productos_c INTEGER;
    v_productos_d INTEGER;
BEGIN
    v_inicio := clock_timestamp();

    -- Log to control table
    INSERT INTO abc_cache_control (nombre_proceso, fecha_inicio, estado, parametros)
    VALUES (
        'recalcular_abc_cache',
        v_inicio,
        'en_proceso',
        jsonb_build_object(
            'dias', p_dias,
            'producto_excluido', p_producto_excluido,
            'umbral_a', p_umbral_a, 'umbral_b', p_umbral_b, 'umbral_c', p_umbral_c,
            'pareto_a_pct', p_pareto_a_pct, 'pareto_b_pct', p_pareto_b_pct,
            'modelo_activo', p_modelo_activo,
            'metodo', '4_modelos'
        )
    )
    RETURNING id INTO v_control_id;

    TRUNCATE TABLE productos_abc_cache;

    WITH metricas AS (
        SELECT
            v.producto_id,
            SUM(v.cantidad_vendida) as cantidad_30d,
            SUM(v.venta_total) as venta_30d,
            COUNT(DISTINCT regexp_replace(v.numero_factura, '_L[0-9]+$', '')) as tickets_30d
        FROM ventas v
        WHERE v.fecha_venta >= CURRENT_DATE - (p_dias || ' days')::INTERVAL
          AND v.producto_id != p_producto_excluido
        GROUP BY v.producto_id
    ),
    total_tickets AS (
        SELECT COUNT(DISTINCT regexp_replace(numero_factura, '_L[0-9]+$', '')) as total
        FROM ventas
        WHERE fecha_venta >= CURRENT_DATE - (p_dias || ' days')::INTERVAL
          AND producto_id != p_producto_excluido
    ),
    rankings AS (
        SELECT
            m.*,
            t.total as total_tickets,
            ROW_NUMBER() OVER (ORDER BY m.cantidad_30d DESC) as rank_cantidad,
            ROW_NUMBER() OVER (ORDER BY m.venta_30d DESC) as rank_valor,
            ROW_NUMBER() OVER (ORDER BY m.tickets_30d DESC) as rank_penetracion,
            -- Accumulated quantity (for Pareto volumen)
            SUM(m.cantidad_30d) OVER (ORDER BY m.cantidad_30d DESC) as cantidad_acum,
            SUM(m.cantidad_30d) OVER () as cantidad_total,
            -- Accumulated value (for Pareto valor)
            SUM(m.venta_30d) OVER (ORDER BY m.venta_30d DESC) as venta_acum,
            SUM(m.venta_30d) OVER () as venta_total
        FROM metricas m
        CROSS JOIN total_tickets t
    ),
    clasificado AS (
        SELECT
            r.*,
            ROUND(r.tickets_30d::numeric / NULLIF(r.total_tickets, 0) * 100, 4) as penetracion_pct,
            ROUND(r.venta_30d / NULLIF(r.venta_total, 0) * 100, 4) as porcentaje_venta,
            ROUND(r.venta_acum / NULLIF(r.venta_total, 0) * 100, 4) as porcentaje_acumulado,
            r.rank_cantidad - r.rank_penetracion as gap,

            -- MODEL 1: Ranking Volumen (current default)
            CASE
                WHEN r.rank_cantidad <= p_umbral_a THEN 'A'
                WHEN r.rank_cantidad <= p_umbral_b THEN 'B'
                WHEN r.rank_cantidad <= p_umbral_c THEN 'C'
                ELSE 'D'
            END as clase_ranking_vol,

            -- MODEL 2: Ranking Valor
            CASE
                WHEN r.rank_valor <= p_umbral_a THEN 'A'
                WHEN r.rank_valor <= p_umbral_b THEN 'B'
                WHEN r.rank_valor <= p_umbral_c THEN 'C'
                ELSE 'D'
            END as clase_ranking_val,

            -- MODEL 3: Pareto Volumen (80/95% accumulated quantity)
            CASE
                WHEN r.cantidad_acum <= r.cantidad_total * (p_pareto_a_pct / 100.0) THEN 'A'
                WHEN r.cantidad_acum <= r.cantidad_total * (p_pareto_b_pct / 100.0) THEN 'B'
                WHEN r.cantidad_30d > 0 THEN 'C'
                ELSE 'D'
            END as clase_pareto_vol,

            -- MODEL 4: Pareto Valor (80/95% accumulated revenue)
            CASE
                WHEN r.venta_acum <= r.venta_total * (p_pareto_a_pct / 100.0) THEN 'A'
                WHEN r.venta_acum <= r.venta_total * (p_pareto_b_pct / 100.0) THEN 'B'
                WHEN r.venta_30d > 0 THEN 'C'
                ELSE 'D'
            END as clase_pareto_val
        FROM rankings r
    )
    INSERT INTO productos_abc_cache (
        producto_id, cantidad_30d, venta_30d, tickets_30d,
        total_tickets_periodo, penetracion_pct,
        venta_acumulada, venta_total_periodo,
        porcentaje_venta, porcentaje_acumulado,
        rank_cantidad, rank_valor, rank_penetracion, gap,
        clase_ranking_vol, clase_ranking_val,
        clase_pareto_vol, clase_pareto_val,
        clase_abc,
        fecha_calculo, periodo_inicio, periodo_fin, dias_periodo
    )
    SELECT
        c.producto_id, c.cantidad_30d, c.venta_30d, c.tickets_30d,
        c.total_tickets, c.penetracion_pct,
        c.venta_acum, c.venta_total,
        c.porcentaje_venta, c.porcentaje_acumulado,
        c.rank_cantidad, c.rank_valor, c.rank_penetracion, c.gap,
        c.clase_ranking_vol, c.clase_ranking_val,
        c.clase_pareto_vol, c.clase_pareto_val,
        -- Copy active model to clase_abc
        CASE p_modelo_activo
            WHEN 'ranking_volumen' THEN c.clase_ranking_vol
            WHEN 'ranking_valor'   THEN c.clase_ranking_val
            WHEN 'pareto_volumen'  THEN c.clase_pareto_vol
            WHEN 'pareto_valor'    THEN c.clase_pareto_val
            ELSE c.clase_ranking_vol
        END,
        CURRENT_TIMESTAMP,
        CURRENT_DATE - (p_dias || ' days')::INTERVAL,
        CURRENT_DATE,
        p_dias
    FROM clasificado c;

    GET DIAGNOSTICS v_productos = ROW_COUNT;

    -- Count by active clase_abc
    SELECT COUNT(*) INTO v_productos_a FROM productos_abc_cache WHERE clase_abc = 'A';
    SELECT COUNT(*) INTO v_productos_b FROM productos_abc_cache WHERE clase_abc = 'B';
    SELECT COUNT(*) INTO v_productos_c FROM productos_abc_cache WHERE clase_abc = 'C';
    SELECT COUNT(*) INTO v_productos_d FROM productos_abc_cache WHERE clase_abc = 'D';

    UPDATE abc_cache_control
    SET fecha_fin = clock_timestamp(),
        estado = 'completado',
        productos_procesados = v_productos,
        tiempo_ejecucion_ms = EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::INTEGER
    WHERE id = v_control_id;

    RETURN QUERY SELECT v_productos,
                        EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::INTEGER,
                        v_productos_a, v_productos_b, v_productos_c, v_productos_d;

EXCEPTION WHEN OTHERS THEN
    UPDATE abc_cache_control
    SET fecha_fin = clock_timestamp(), estado = 'error', error_mensaje = SQLERRM
    WHERE id = v_control_id;
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------------
-- 5. Replace recalcular_abc_por_tienda() - 4 models partitioned by store
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recalcular_abc_por_tienda(
    p_dias INTEGER DEFAULT 30,
    p_producto_excluido VARCHAR DEFAULT '003760',
    p_umbral_a INTEGER DEFAULT 50,
    p_umbral_b INTEGER DEFAULT 200,
    p_umbral_c INTEGER DEFAULT 800,
    p_pareto_a_pct NUMERIC DEFAULT 80,
    p_pareto_b_pct NUMERIC DEFAULT 95,
    p_modelo_activo VARCHAR DEFAULT 'ranking_volumen'
)
RETURNS TABLE(
    tiendas_procesadas INTEGER,
    productos_procesados INTEGER,
    tiempo_ms INTEGER
) AS $$
DECLARE
    v_inicio TIMESTAMP;
    v_tiendas INTEGER;
    v_productos INTEGER;
    v_control_id INTEGER;
BEGIN
    v_inicio := clock_timestamp();

    INSERT INTO abc_cache_control (nombre_proceso, fecha_inicio, estado, parametros)
    VALUES (
        'recalcular_abc_por_tienda',
        v_inicio,
        'en_proceso',
        jsonb_build_object(
            'dias', p_dias,
            'producto_excluido', p_producto_excluido,
            'umbral_a', p_umbral_a, 'umbral_b', p_umbral_b, 'umbral_c', p_umbral_c,
            'pareto_a_pct', p_pareto_a_pct, 'pareto_b_pct', p_pareto_b_pct,
            'modelo_activo', p_modelo_activo,
            'metodo', '4_modelos'
        )
    )
    RETURNING id INTO v_control_id;

    TRUNCATE TABLE productos_abc_tienda;

    WITH ventas_por_tienda AS (
        SELECT
            v.producto_id,
            v.ubicacion_id,
            SUM(v.cantidad_vendida) as cantidad_30d,
            SUM(v.venta_total) as venta_30d,
            COUNT(DISTINCT regexp_replace(v.numero_factura, '_L[0-9]+$', '')) as tickets_30d
        FROM ventas v
        WHERE v.fecha_venta >= CURRENT_DATE - (p_dias || ' days')::INTERVAL
          AND v.producto_id != p_producto_excluido
        GROUP BY v.producto_id, v.ubicacion_id
    ),
    rankings_por_tienda AS (
        SELECT
            vt.*,
            -- Rankings within each store
            ROW_NUMBER() OVER (PARTITION BY vt.ubicacion_id ORDER BY vt.cantidad_30d DESC) as rank_cantidad,
            ROW_NUMBER() OVER (PARTITION BY vt.ubicacion_id ORDER BY vt.venta_30d DESC) as rank_valor,
            -- Accumulated value within each store (for Pareto valor + porcentaje columns)
            SUM(vt.venta_30d) OVER (PARTITION BY vt.ubicacion_id ORDER BY vt.venta_30d DESC) as venta_acum,
            SUM(vt.venta_30d) OVER (PARTITION BY vt.ubicacion_id) as venta_total_tienda,
            -- Accumulated quantity within each store (for Pareto volumen)
            SUM(vt.cantidad_30d) OVER (PARTITION BY vt.ubicacion_id ORDER BY vt.cantidad_30d DESC) as cantidad_acum,
            SUM(vt.cantidad_30d) OVER (PARTITION BY vt.ubicacion_id) as cantidad_total_tienda
        FROM ventas_por_tienda vt
    ),
    clasificado AS (
        SELECT
            r.*,
            ROUND(r.venta_30d / NULLIF(r.venta_total_tienda, 0) * 100, 4) as porcentaje_venta,
            ROUND(r.venta_acum / NULLIF(r.venta_total_tienda, 0) * 100, 4) as porcentaje_acumulado,

            -- MODEL 1: Ranking Volumen
            CASE
                WHEN r.rank_cantidad <= p_umbral_a THEN 'A'
                WHEN r.rank_cantidad <= p_umbral_b THEN 'B'
                WHEN r.rank_cantidad <= p_umbral_c THEN 'C'
                ELSE 'D'
            END as clase_ranking_vol,

            -- MODEL 2: Ranking Valor
            CASE
                WHEN r.rank_valor <= p_umbral_a THEN 'A'
                WHEN r.rank_valor <= p_umbral_b THEN 'B'
                WHEN r.rank_valor <= p_umbral_c THEN 'C'
                ELSE 'D'
            END as clase_ranking_val,

            -- MODEL 3: Pareto Volumen
            CASE
                WHEN r.cantidad_acum <= r.cantidad_total_tienda * (p_pareto_a_pct / 100.0) THEN 'A'
                WHEN r.cantidad_acum <= r.cantidad_total_tienda * (p_pareto_b_pct / 100.0) THEN 'B'
                WHEN r.cantidad_30d > 0 THEN 'C'
                ELSE 'D'
            END as clase_pareto_vol,

            -- MODEL 4: Pareto Valor
            CASE
                WHEN r.venta_acum <= r.venta_total_tienda * (p_pareto_a_pct / 100.0) THEN 'A'
                WHEN r.venta_acum <= r.venta_total_tienda * (p_pareto_b_pct / 100.0) THEN 'B'
                WHEN r.venta_30d > 0 THEN 'C'
                ELSE 'D'
            END as clase_pareto_val
        FROM rankings_por_tienda r
    )
    INSERT INTO productos_abc_tienda (
        producto_id, ubicacion_id,
        cantidad_30d, venta_30d, tickets_30d,
        venta_acumulada, venta_total_tienda,
        porcentaje_venta, porcentaje_acumulado,
        rank_cantidad, rank_valor,
        clase_ranking_vol, clase_ranking_val,
        clase_pareto_vol, clase_pareto_val,
        clase_abc,
        fecha_calculo, periodo_inicio, periodo_fin
    )
    SELECT
        c.producto_id, c.ubicacion_id,
        c.cantidad_30d, c.venta_30d, c.tickets_30d,
        c.venta_acum, c.venta_total_tienda,
        c.porcentaje_venta, c.porcentaje_acumulado,
        c.rank_cantidad, c.rank_valor,
        c.clase_ranking_vol, c.clase_ranking_val,
        c.clase_pareto_vol, c.clase_pareto_val,
        -- Copy active model to clase_abc
        CASE p_modelo_activo
            WHEN 'ranking_volumen' THEN c.clase_ranking_vol
            WHEN 'ranking_valor'   THEN c.clase_ranking_val
            WHEN 'pareto_volumen'  THEN c.clase_pareto_vol
            WHEN 'pareto_valor'    THEN c.clase_pareto_val
            ELSE c.clase_ranking_vol
        END,
        CURRENT_TIMESTAMP,
        CURRENT_DATE - (p_dias || ' days')::INTERVAL,
        CURRENT_DATE
    FROM clasificado c;

    GET DIAGNOSTICS v_productos = ROW_COUNT;
    SELECT COUNT(DISTINCT ubicacion_id) INTO v_tiendas FROM productos_abc_tienda;

    UPDATE abc_cache_control
    SET fecha_fin = clock_timestamp(),
        estado = 'completado',
        productos_procesados = v_productos,
        tiempo_ejecucion_ms = EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::INTEGER
    WHERE id = v_control_id;

    RETURN QUERY SELECT v_tiendas,
                        v_productos,
                        EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::INTEGER;

EXCEPTION WHEN OTHERS THEN
    UPDATE abc_cache_control
    SET fecha_fin = clock_timestamp(), estado = 'error', error_mensaje = SQLERRM
    WHERE id = v_control_id;
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------------
-- 6. New function: instant model switch (no recalculation needed)
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cambiar_modelo_abc_activo(
    p_modelo VARCHAR
)
RETURNS TABLE(
    filas_actualizadas_cache INTEGER,
    filas_actualizadas_tienda INTEGER,
    tiempo_ms INTEGER
) AS $$
DECLARE
    v_inicio TIMESTAMP;
    v_cache INTEGER;
    v_tienda INTEGER;
    v_col_name VARCHAR;
BEGIN
    v_inicio := clock_timestamp();

    -- Validate model name
    IF p_modelo NOT IN ('ranking_volumen', 'ranking_valor', 'pareto_volumen', 'pareto_valor') THEN
        RAISE EXCEPTION 'Modelo invalido: %. Valores validos: ranking_volumen, ranking_valor, pareto_volumen, pareto_valor', p_modelo;
    END IF;

    -- Map model name to column name
    v_col_name := CASE p_modelo
        WHEN 'ranking_volumen' THEN 'clase_ranking_vol'
        WHEN 'ranking_valor'   THEN 'clase_ranking_val'
        WHEN 'pareto_volumen'  THEN 'clase_pareto_vol'
        WHEN 'pareto_valor'    THEN 'clase_pareto_val'
    END;

    -- Update productos_abc_cache
    EXECUTE format('UPDATE productos_abc_cache SET clase_abc = %I', v_col_name);
    GET DIAGNOSTICS v_cache = ROW_COUNT;

    -- Update productos_abc_tienda
    EXECUTE format('UPDATE productos_abc_tienda SET clase_abc = %I', v_col_name);
    GET DIAGNOSTICS v_tienda = ROW_COUNT;

    -- Update config
    UPDATE config_inventario_global
    SET valor_texto = p_modelo, fecha_modificacion = CURRENT_TIMESTAMP
    WHERE id = 'abc_modelo_activo';

    RETURN QUERY SELECT v_cache, v_tienda,
                        EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------------
-- 7. Update view v_productos_abc to expose all 4 classifications
-- -------------------------------------------------------------------------

DROP VIEW IF EXISTS v_productos_abc;

CREATE OR REPLACE VIEW v_productos_abc AS
SELECT
    p.id as producto_id,
    p.codigo,
    p.descripcion,
    p.categoria,
    COALESCE(c.cantidad_30d, 0) as cantidad_30d,
    COALESCE(c.venta_30d, 0) as venta_30d,
    COALESCE(c.tickets_30d, 0) as tickets_30d,
    COALESCE(c.penetracion_pct, 0) as penetracion_pct,
    COALESCE(c.rank_cantidad, 9999) as rank_cantidad,
    COALESCE(c.rank_valor, 9999) as rank_valor,
    COALESCE(c.rank_penetracion, 9999) as rank_penetracion,
    COALESCE(c.gap, 0) as gap,
    -- Active classification (used by all downstream consumers)
    COALESCE(c.clase_abc, 'D') as clase_abc,
    -- All 4 model classifications (for comparison/BI)
    c.clase_ranking_vol,
    c.clase_ranking_val,
    c.clase_pareto_vol,
    c.clase_pareto_val,
    c.fecha_calculo,
    -- Traffic generators
    COALESCE(p.es_generador_trafico, FALSE) as es_generador_trafico,
    COALESCE(p.generador_trafico_sugerido, FALSE) as generador_trafico_sugerido,
    COALESCE(p.generador_trafico_ignorado, FALSE) as generador_trafico_ignorado,
    p.generador_trafico_fecha_marcado as fecha_marcado,
    p.generador_trafico_fecha_sugerido as fecha_sugerido
FROM productos p
LEFT JOIN productos_abc_cache c ON c.producto_id = p.id;

-- -------------------------------------------------------------------------
-- 8. Comments
-- -------------------------------------------------------------------------

COMMENT ON FUNCTION recalcular_abc_cache(INTEGER, VARCHAR, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, VARCHAR)
    IS 'Recalcula ABC con 4 modelos (ranking_vol, ranking_val, pareto_vol, pareto_val). Copia el modelo activo a clase_abc.';
COMMENT ON FUNCTION recalcular_abc_por_tienda(INTEGER, VARCHAR, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, VARCHAR)
    IS 'Recalcula ABC por tienda con 4 modelos. Copia el modelo activo a clase_abc.';
COMMENT ON FUNCTION cambiar_modelo_abc_activo(VARCHAR)
    IS 'Cambia el modelo ABC activo sin recalcular. UPDATE instantaneo de clase_abc en ambas tablas cache.';

COMMIT;
