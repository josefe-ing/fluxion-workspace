-- =========================================================================
-- Migration 015 UP: Cambio ABC de Valor a Ranking por Cantidad
-- Description: Cambia la clasificacion ABC de Pareto por valor a ranking
--              por cantidad vendida con umbrales configurables.
--              Agrega clase D y elimina is_top50 (redundante con A).
-- Date: 2025-12-11
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Agregar umbrales de ranking en config_inventario_global
-- -------------------------------------------------------------------------

INSERT INTO config_inventario_global (id, categoria, parametro, valor_numerico, descripcion, unidad, activo)
VALUES
  ('abc_umbral_a', 'abc_umbrales_ranking', 'umbral_a', 50, 'Top N productos para clase A (ranking 1 a N)', 'ranking', true),
  ('abc_umbral_b', 'abc_umbrales_ranking', 'umbral_b', 200, 'Top N productos para clase B (ranking umbral_a+1 a N)', 'ranking', true),
  ('abc_umbral_c', 'abc_umbrales_ranking', 'umbral_c', 800, 'Top N productos para clase C (ranking umbral_b+1 a N)', 'ranking', true)
ON CONFLICT (id) DO UPDATE SET
  valor_numerico = EXCLUDED.valor_numerico,
  descripcion = EXCLUDED.descripcion,
  fecha_modificacion = CURRENT_TIMESTAMP;

-- Agregar dias de cobertura para clase D
INSERT INTO config_inventario_global (id, categoria, parametro, valor_numerico, descripcion, unidad, activo)
VALUES
  ('dias_cobertura_d', 'niveles_servicio', 'dias_cobertura_d', 30, 'Dias de cobertura maxima para clase D', 'dias', true),
  ('zscore_d', 'niveles_servicio', 'zscore_d', 0, 'Z-score para clase D (Padre Prudente, no aplica)', 'zscore', true)
ON CONFLICT (id) DO UPDATE SET
  valor_numerico = EXCLUDED.valor_numerico,
  descripcion = EXCLUDED.descripcion,
  fecha_modificacion = CURRENT_TIMESTAMP;

-- Actualizar dias de cobertura de clase C (ahora es ranking 201-800, mas importante)
UPDATE config_inventario_global
SET valor_numerico = 21, descripcion = 'Dias de cobertura maxima para clase C (ranking 201-800)'
WHERE id = 'dias_cobertura_c';

-- -------------------------------------------------------------------------
-- 2. Agregar columna cantidad_30d a productos_abc_cache
-- -------------------------------------------------------------------------

ALTER TABLE productos_abc_cache
ADD COLUMN IF NOT EXISTS cantidad_30d DECIMAL(18,2) DEFAULT 0;

-- Renombrar rank_venta a rank_cantidad (mas descriptivo)
-- Primero verificar si existe rank_venta
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'productos_abc_cache' AND column_name = 'rank_venta') THEN
        ALTER TABLE productos_abc_cache RENAME COLUMN rank_venta TO rank_cantidad;
    END IF;
END $$;

-- Agregar indice para rank_cantidad si no existe
CREATE INDEX IF NOT EXISTS idx_abc_cache_rank_cantidad ON productos_abc_cache(rank_cantidad);

-- -------------------------------------------------------------------------
-- 3. Agregar columna cantidad_30d a productos_abc_tienda
-- -------------------------------------------------------------------------

ALTER TABLE productos_abc_tienda
ADD COLUMN IF NOT EXISTS cantidad_30d DECIMAL(18,2) DEFAULT 0;

-- Renombrar rank_venta a rank_cantidad en productos_abc_tienda
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'productos_abc_tienda' AND column_name = 'rank_venta') THEN
        ALTER TABLE productos_abc_tienda RENAME COLUMN rank_venta TO rank_cantidad;
    END IF;
END $$;

-- -------------------------------------------------------------------------
-- 4. Agregar dias_cobertura_d a config_parametros_abc_tienda
-- -------------------------------------------------------------------------

ALTER TABLE config_parametros_abc_tienda
ADD COLUMN IF NOT EXISTS clase_c_z_score DECIMAL(6,4) DEFAULT 1.28;

ALTER TABLE config_parametros_abc_tienda
ADD COLUMN IF NOT EXISTS clase_c_dias_cobertura INTEGER DEFAULT 21;

ALTER TABLE config_parametros_abc_tienda
ADD COLUMN IF NOT EXISTS clase_d_dias_cobertura INTEGER DEFAULT 30;

-- -------------------------------------------------------------------------
-- 5. Actualizar funcion recalcular_abc_cache con ranking por cantidad
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recalcular_abc_cache(
    p_dias INTEGER DEFAULT 30,
    p_producto_excluido VARCHAR DEFAULT '003760',
    p_umbral_a INTEGER DEFAULT 50,
    p_umbral_b INTEGER DEFAULT 200,
    p_umbral_c INTEGER DEFAULT 800
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

    -- Registrar inicio en control
    INSERT INTO abc_cache_control (nombre_proceso, fecha_inicio, estado, parametros)
    VALUES (
        'recalcular_abc_cache',
        v_inicio,
        'en_proceso',
        jsonb_build_object(
            'dias', p_dias,
            'producto_excluido', p_producto_excluido,
            'umbral_a', p_umbral_a,
            'umbral_b', p_umbral_b,
            'umbral_c', p_umbral_c,
            'metodo', 'ranking_cantidad'
        )
    )
    RETURNING id INTO v_control_id;

    -- Limpiar tabla cache
    TRUNCATE TABLE productos_abc_cache;

    -- Insertar datos recalculados por CANTIDAD (no valor)
    WITH metricas AS (
        SELECT
            v.producto_id,
            SUM(v.cantidad_vendida) as cantidad_30d,  -- Por cantidad vendida
            SUM(v.venta_total) as venta_30d,          -- Mantener para referencia
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
            -- Ranking por CANTIDAD (no por valor)
            ROW_NUMBER() OVER (ORDER BY m.cantidad_30d DESC) as rank_cantidad,
            ROW_NUMBER() OVER (ORDER BY m.tickets_30d DESC) as rank_penetracion,
            -- Mantener acumulados de valor para referencia
            SUM(m.venta_30d) OVER (ORDER BY m.cantidad_30d DESC) as venta_acum,
            SUM(m.venta_30d) OVER () as venta_total,
            -- Acumulados de cantidad
            SUM(m.cantidad_30d) OVER (ORDER BY m.cantidad_30d DESC) as cantidad_acum,
            SUM(m.cantidad_30d) OVER () as cantidad_total
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
            -- Clasificacion ABC por RANKING de cantidad (no Pareto)
            CASE
                WHEN r.rank_cantidad <= p_umbral_a THEN 'A'
                WHEN r.rank_cantidad <= p_umbral_b THEN 'B'
                WHEN r.rank_cantidad <= p_umbral_c THEN 'C'
                ELSE 'D'
            END as clase_abc
        FROM rankings r
    )
    INSERT INTO productos_abc_cache (
        producto_id,
        cantidad_30d,
        venta_30d,
        tickets_30d,
        total_tickets_periodo,
        penetracion_pct,
        venta_acumulada,
        venta_total_periodo,
        porcentaje_venta,
        porcentaje_acumulado,
        rank_cantidad,
        rank_penetracion,
        gap,
        clase_abc,
        fecha_calculo,
        periodo_inicio,
        periodo_fin,
        dias_periodo
    )
    SELECT
        c.producto_id,
        c.cantidad_30d,
        c.venta_30d,
        c.tickets_30d,
        c.total_tickets,
        c.penetracion_pct,
        c.venta_acum,
        c.venta_total,
        c.porcentaje_venta,
        c.porcentaje_acumulado,
        c.rank_cantidad,
        c.rank_penetracion,
        c.gap,
        c.clase_abc,
        CURRENT_TIMESTAMP,
        CURRENT_DATE - (p_dias || ' days')::INTERVAL,
        CURRENT_DATE,
        p_dias
    FROM clasificado c;

    GET DIAGNOSTICS v_productos = ROW_COUNT;

    -- Contar por clase (ahora incluye D)
    SELECT COUNT(*) INTO v_productos_a FROM productos_abc_cache WHERE clase_abc = 'A';
    SELECT COUNT(*) INTO v_productos_b FROM productos_abc_cache WHERE clase_abc = 'B';
    SELECT COUNT(*) INTO v_productos_c FROM productos_abc_cache WHERE clase_abc = 'C';
    SELECT COUNT(*) INTO v_productos_d FROM productos_abc_cache WHERE clase_abc = 'D';

    -- Actualizar control
    UPDATE abc_cache_control
    SET fecha_fin = clock_timestamp(),
        estado = 'completado',
        productos_procesados = v_productos,
        tiempo_ejecucion_ms = EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::INTEGER
    WHERE id = v_control_id;

    RETURN QUERY SELECT v_productos,
                        EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::INTEGER,
                        v_productos_a,
                        v_productos_b,
                        v_productos_c,
                        v_productos_d;

EXCEPTION WHEN OTHERS THEN
    -- Registrar error
    UPDATE abc_cache_control
    SET fecha_fin = clock_timestamp(),
        estado = 'error',
        error_mensaje = SQLERRM
    WHERE id = v_control_id;
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------------
-- 6. Actualizar funcion recalcular_abc_por_tienda con ranking por cantidad
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recalcular_abc_por_tienda(
    p_dias INTEGER DEFAULT 30,
    p_producto_excluido VARCHAR DEFAULT '003760',
    p_umbral_a INTEGER DEFAULT 50,
    p_umbral_b INTEGER DEFAULT 200,
    p_umbral_c INTEGER DEFAULT 800
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

    -- Registrar inicio en control
    INSERT INTO abc_cache_control (nombre_proceso, fecha_inicio, estado, parametros)
    VALUES (
        'recalcular_abc_por_tienda',
        v_inicio,
        'en_proceso',
        jsonb_build_object(
            'dias', p_dias,
            'producto_excluido', p_producto_excluido,
            'umbral_a', p_umbral_a,
            'umbral_b', p_umbral_b,
            'umbral_c', p_umbral_c,
            'metodo', 'ranking_cantidad'
        )
    )
    RETURNING id INTO v_control_id;

    -- Limpiar tabla
    TRUNCATE TABLE productos_abc_tienda;

    -- Calcular ABC por cada tienda usando CANTIDAD
    WITH ventas_por_tienda AS (
        SELECT
            v.producto_id,
            v.ubicacion_id,
            SUM(v.cantidad_vendida) as cantidad_30d,  -- Por cantidad
            SUM(v.venta_total) as venta_30d,          -- Mantener para referencia
            COUNT(DISTINCT regexp_replace(v.numero_factura, '_L[0-9]+$', '')) as tickets_30d
        FROM ventas v
        WHERE v.fecha_venta >= CURRENT_DATE - (p_dias || ' days')::INTERVAL
          AND v.producto_id != p_producto_excluido
        GROUP BY v.producto_id, v.ubicacion_id
    ),
    rankings_por_tienda AS (
        SELECT
            vt.*,
            -- Ranking por CANTIDAD dentro de cada tienda
            ROW_NUMBER() OVER (PARTITION BY vt.ubicacion_id ORDER BY vt.cantidad_30d DESC) as rank_cantidad,
            SUM(vt.venta_30d) OVER (PARTITION BY vt.ubicacion_id ORDER BY vt.cantidad_30d DESC) as venta_acum,
            SUM(vt.venta_30d) OVER (PARTITION BY vt.ubicacion_id) as venta_total_tienda
        FROM ventas_por_tienda vt
    ),
    clasificado AS (
        SELECT
            r.*,
            ROUND(r.venta_30d / NULLIF(r.venta_total_tienda, 0) * 100, 4) as porcentaje_venta,
            ROUND(r.venta_acum / NULLIF(r.venta_total_tienda, 0) * 100, 4) as porcentaje_acumulado,
            -- Clasificacion ABC por RANKING de cantidad
            CASE
                WHEN r.rank_cantidad <= p_umbral_a THEN 'A'
                WHEN r.rank_cantidad <= p_umbral_b THEN 'B'
                WHEN r.rank_cantidad <= p_umbral_c THEN 'C'
                ELSE 'D'
            END as clase_abc
        FROM rankings_por_tienda r
    )
    INSERT INTO productos_abc_tienda (
        producto_id,
        ubicacion_id,
        cantidad_30d,
        venta_30d,
        tickets_30d,
        venta_acumulada,
        venta_total_tienda,
        porcentaje_venta,
        porcentaje_acumulado,
        rank_cantidad,
        clase_abc,
        fecha_calculo,
        periodo_inicio,
        periodo_fin
    )
    SELECT
        c.producto_id,
        c.ubicacion_id,
        c.cantidad_30d,
        c.venta_30d,
        c.tickets_30d,
        c.venta_acum,
        c.venta_total_tienda,
        c.porcentaje_venta,
        c.porcentaje_acumulado,
        c.rank_cantidad,
        c.clase_abc,
        CURRENT_TIMESTAMP,
        CURRENT_DATE - (p_dias || ' days')::INTERVAL,
        CURRENT_DATE
    FROM clasificado c;

    GET DIAGNOSTICS v_productos = ROW_COUNT;

    -- Contar tiendas unicas
    SELECT COUNT(DISTINCT ubicacion_id) INTO v_tiendas FROM productos_abc_tienda;

    -- Actualizar control
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
    SET fecha_fin = clock_timestamp(),
        estado = 'error',
        error_mensaje = SQLERRM
    WHERE id = v_control_id;
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------------
-- 7. Actualizar vista v_productos_abc
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
    COALESCE(c.rank_penetracion, 9999) as rank_penetracion,
    COALESCE(c.gap, 0) as gap,
    COALESCE(c.clase_abc, 'D') as clase_abc,
    c.fecha_calculo,
    -- Campos de generadores de trafico
    COALESCE(p.es_generador_trafico, FALSE) as es_generador_trafico,
    COALESCE(p.generador_trafico_sugerido, FALSE) as generador_trafico_sugerido,
    COALESCE(p.generador_trafico_ignorado, FALSE) as generador_trafico_ignorado,
    p.generador_trafico_fecha_marcado as fecha_marcado,
    p.generador_trafico_fecha_sugerido as fecha_sugerido
FROM productos p
LEFT JOIN productos_abc_cache c ON c.producto_id = p.id;

-- -------------------------------------------------------------------------
-- 8. Comentarios actualizados
-- -------------------------------------------------------------------------

COMMENT ON FUNCTION recalcular_abc_cache(INTEGER, VARCHAR, INTEGER, INTEGER, INTEGER) IS 'Recalcula ABC por ranking de cantidad vendida. Clases: A (Top umbral_a), B (umbral_a+1 a umbral_b), C (umbral_b+1 a umbral_c), D (resto)';
COMMENT ON FUNCTION recalcular_abc_por_tienda(INTEGER, VARCHAR, INTEGER, INTEGER, INTEGER) IS 'Recalcula ABC por tienda usando ranking de cantidad vendida';
COMMENT ON COLUMN productos_abc_cache.cantidad_30d IS 'Cantidad total vendida en los ultimos 30 dias (unidades)';
COMMENT ON COLUMN productos_abc_cache.rank_cantidad IS 'Ranking por cantidad vendida (1 = mas vendido)';
COMMENT ON COLUMN productos_abc_cache.clase_abc IS 'Clasificacion ABC por ranking: A (Top 50), B (51-200), C (201-800), D (801+)';

COMMIT;
