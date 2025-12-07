-- =========================================================================
-- Migration 013 UP: Top50 y ABC por Tienda
-- Description: Agrega clasificación Top50 como cuarta categoría y soporte
--              para ABC por tienda individual
-- Date: 2025-12-06
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Agregar campo is_top50 a productos_abc_cache (global)
-- -------------------------------------------------------------------------

ALTER TABLE productos_abc_cache
ADD COLUMN IF NOT EXISTS is_top50 BOOLEAN DEFAULT FALSE;

-- Índice para consultas de Top50
CREATE INDEX IF NOT EXISTS idx_abc_cache_top50 ON productos_abc_cache(is_top50) WHERE is_top50 = TRUE;

-- -------------------------------------------------------------------------
-- 2. Crear tabla para ABC por tienda (cache por ubicación)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS productos_abc_tienda (
    id SERIAL PRIMARY KEY,
    producto_id VARCHAR(50) NOT NULL,
    ubicacion_id VARCHAR(50) NOT NULL,

    -- Métricas de ventas (últimos 30 días para esta tienda)
    venta_30d DECIMAL(18,2) DEFAULT 0,
    tickets_30d INTEGER DEFAULT 0,

    -- Clasificación ABC para esta tienda
    venta_acumulada DECIMAL(18,2) DEFAULT 0,
    venta_total_tienda DECIMAL(18,2) DEFAULT 0,
    porcentaje_venta DECIMAL(8,4) DEFAULT 0,
    porcentaje_acumulado DECIMAL(8,4) DEFAULT 0,
    rank_venta INTEGER,
    clase_abc CHAR(1),  -- 'A', 'B', 'C'
    is_top50 BOOLEAN DEFAULT FALSE,

    -- Metadata
    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    periodo_inicio DATE,
    periodo_fin DATE,

    -- Constraint de unicidad por producto+tienda
    CONSTRAINT uq_productos_abc_tienda UNIQUE (producto_id, ubicacion_id)
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_abc_tienda_ubicacion ON productos_abc_tienda(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_abc_tienda_clase ON productos_abc_tienda(ubicacion_id, clase_abc);
CREATE INDEX IF NOT EXISTS idx_abc_tienda_rank ON productos_abc_tienda(ubicacion_id, rank_venta);
CREATE INDEX IF NOT EXISTS idx_abc_tienda_top50 ON productos_abc_tienda(ubicacion_id, is_top50) WHERE is_top50 = TRUE;
CREATE INDEX IF NOT EXISTS idx_abc_tienda_producto ON productos_abc_tienda(producto_id);

-- -------------------------------------------------------------------------
-- 3. Actualizar función recalcular_abc_cache para incluir Top50
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recalcular_abc_cache(
    p_dias INTEGER DEFAULT 30,
    p_producto_excluido VARCHAR DEFAULT '003760',
    p_top_n INTEGER DEFAULT 50
)
RETURNS TABLE(
    productos_procesados INTEGER,
    tiempo_ms INTEGER,
    productos_a INTEGER,
    productos_b INTEGER,
    productos_c INTEGER,
    productos_top50 INTEGER
) AS $$
DECLARE
    v_inicio TIMESTAMP;
    v_productos INTEGER;
    v_control_id INTEGER;
    v_productos_a INTEGER;
    v_productos_b INTEGER;
    v_productos_c INTEGER;
    v_productos_top50 INTEGER;
BEGIN
    v_inicio := clock_timestamp();

    -- Registrar inicio en control
    INSERT INTO abc_cache_control (nombre_proceso, fecha_inicio, estado, parametros)
    VALUES (
        'recalcular_abc_cache',
        v_inicio,
        'en_proceso',
        jsonb_build_object('dias', p_dias, 'producto_excluido', p_producto_excluido, 'top_n', p_top_n)
    )
    RETURNING id INTO v_control_id;

    -- Limpiar tabla cache
    TRUNCATE TABLE productos_abc_cache;

    -- Insertar datos recalculados con Top50
    WITH metricas AS (
        SELECT
            v.producto_id,
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
            ROW_NUMBER() OVER (ORDER BY m.venta_30d DESC) as rank_venta,
            ROW_NUMBER() OVER (ORDER BY m.tickets_30d DESC) as rank_penetracion,
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
            r.rank_venta - r.rank_penetracion as gap,
            CASE
                WHEN r.venta_acum <= r.venta_total * 0.80 THEN 'A'
                WHEN r.venta_acum <= r.venta_total * 0.95 THEN 'B'
                ELSE 'C'
            END as clase_abc,
            -- Top50: los primeros N productos por venta
            (r.rank_venta <= p_top_n) as is_top50
        FROM rankings r
    )
    INSERT INTO productos_abc_cache (
        producto_id,
        venta_30d,
        tickets_30d,
        total_tickets_periodo,
        penetracion_pct,
        venta_acumulada,
        venta_total_periodo,
        porcentaje_venta,
        porcentaje_acumulado,
        rank_venta,
        rank_penetracion,
        gap,
        clase_abc,
        is_top50,
        fecha_calculo,
        periodo_inicio,
        periodo_fin,
        dias_periodo
    )
    SELECT
        c.producto_id,
        c.venta_30d,
        c.tickets_30d,
        c.total_tickets,
        c.penetracion_pct,
        c.venta_acum,
        c.venta_total,
        c.porcentaje_venta,
        c.porcentaje_acumulado,
        c.rank_venta,
        c.rank_penetracion,
        c.gap,
        c.clase_abc,
        c.is_top50,
        CURRENT_TIMESTAMP,
        CURRENT_DATE - (p_dias || ' days')::INTERVAL,
        CURRENT_DATE,
        p_dias
    FROM clasificado c;

    GET DIAGNOSTICS v_productos = ROW_COUNT;

    -- Contar por clase
    SELECT COUNT(*) INTO v_productos_a FROM productos_abc_cache WHERE clase_abc = 'A';
    SELECT COUNT(*) INTO v_productos_b FROM productos_abc_cache WHERE clase_abc = 'B';
    SELECT COUNT(*) INTO v_productos_c FROM productos_abc_cache WHERE clase_abc = 'C';
    SELECT COUNT(*) INTO v_productos_top50 FROM productos_abc_cache WHERE is_top50 = TRUE;

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
                        v_productos_top50;

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
-- 4. Función para recalcular ABC por tienda
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recalcular_abc_por_tienda(
    p_dias INTEGER DEFAULT 30,
    p_producto_excluido VARCHAR DEFAULT '003760',
    p_top_n INTEGER DEFAULT 50
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
        jsonb_build_object('dias', p_dias, 'producto_excluido', p_producto_excluido, 'top_n', p_top_n)
    )
    RETURNING id INTO v_control_id;

    -- Limpiar tabla
    TRUNCATE TABLE productos_abc_tienda;

    -- Calcular ABC por cada tienda
    WITH ventas_por_tienda AS (
        SELECT
            v.producto_id,
            v.ubicacion_id,
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
            ROW_NUMBER() OVER (PARTITION BY vt.ubicacion_id ORDER BY vt.venta_30d DESC) as rank_venta,
            SUM(vt.venta_30d) OVER (PARTITION BY vt.ubicacion_id ORDER BY vt.venta_30d DESC) as venta_acum,
            SUM(vt.venta_30d) OVER (PARTITION BY vt.ubicacion_id) as venta_total_tienda
        FROM ventas_por_tienda vt
    ),
    clasificado AS (
        SELECT
            r.*,
            ROUND(r.venta_30d / NULLIF(r.venta_total_tienda, 0) * 100, 4) as porcentaje_venta,
            ROUND(r.venta_acum / NULLIF(r.venta_total_tienda, 0) * 100, 4) as porcentaje_acumulado,
            CASE
                WHEN r.venta_acum <= r.venta_total_tienda * 0.80 THEN 'A'
                WHEN r.venta_acum <= r.venta_total_tienda * 0.95 THEN 'B'
                ELSE 'C'
            END as clase_abc,
            (r.rank_venta <= p_top_n) as is_top50
        FROM rankings_por_tienda r
    )
    INSERT INTO productos_abc_tienda (
        producto_id,
        ubicacion_id,
        venta_30d,
        tickets_30d,
        venta_acumulada,
        venta_total_tienda,
        porcentaje_venta,
        porcentaje_acumulado,
        rank_venta,
        clase_abc,
        is_top50,
        fecha_calculo,
        periodo_inicio,
        periodo_fin
    )
    SELECT
        c.producto_id,
        c.ubicacion_id,
        c.venta_30d,
        c.tickets_30d,
        c.venta_acum,
        c.venta_total_tienda,
        c.porcentaje_venta,
        c.porcentaje_acumulado,
        c.rank_venta,
        c.clase_abc,
        c.is_top50,
        CURRENT_TIMESTAMP,
        CURRENT_DATE - (p_dias || ' days')::INTERVAL,
        CURRENT_DATE
    FROM clasificado c;

    GET DIAGNOSTICS v_productos = ROW_COUNT;

    -- Contar tiendas únicas
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
-- 5. Vista actualizada para incluir Top50
-- -------------------------------------------------------------------------

DROP VIEW IF EXISTS v_productos_abc;

CREATE OR REPLACE VIEW v_productos_abc AS
SELECT
    p.id as producto_id,
    p.codigo,
    p.descripcion,
    p.categoria,
    COALESCE(c.venta_30d, 0) as venta_30d,
    COALESCE(c.tickets_30d, 0) as tickets_30d,
    COALESCE(c.penetracion_pct, 0) as penetracion_pct,
    COALESCE(c.rank_venta, 9999) as rank_venta,
    COALESCE(c.rank_penetracion, 9999) as rank_penetracion,
    COALESCE(c.gap, 0) as gap,
    COALESCE(c.clase_abc, 'C') as clase_abc,
    COALESCE(c.is_top50, FALSE) as is_top50,
    c.fecha_calculo,
    -- Campos de generadores de tráfico
    COALESCE(p.es_generador_trafico, FALSE) as es_generador_trafico,
    COALESCE(p.generador_trafico_sugerido, FALSE) as generador_trafico_sugerido,
    COALESCE(p.generador_trafico_ignorado, FALSE) as generador_trafico_ignorado,
    p.generador_trafico_fecha_marcado as fecha_marcado,
    p.generador_trafico_fecha_sugerido as fecha_sugerido
FROM productos p
LEFT JOIN productos_abc_cache c ON c.producto_id = p.id;

-- -------------------------------------------------------------------------
-- 6. Comentarios
-- -------------------------------------------------------------------------

COMMENT ON COLUMN productos_abc_cache.is_top50 IS 'TRUE si el producto está en el Top 50 por valor de venta';
COMMENT ON TABLE productos_abc_tienda IS 'Cache de clasificación ABC por tienda individual';
COMMENT ON FUNCTION recalcular_abc_por_tienda IS 'Recalcula ABC para cada tienda. Ejecutar después de recalcular_abc_cache';

COMMIT;
