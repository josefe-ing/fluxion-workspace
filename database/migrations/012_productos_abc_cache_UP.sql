-- =========================================================================
-- Migration 012 UP: Tabla Cache para Clasificacion ABC y Metricas
-- Description: Tabla pre-calculada con clasificacion ABC, rankings y
--              metricas de penetracion para optimizar consultas
-- Date: 2025-12-04
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Tabla cache para metricas ABC pre-calculadas
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS productos_abc_cache (
    id SERIAL PRIMARY KEY,
    producto_id VARCHAR(50) NOT NULL,

    -- Metricas de ventas (ultimos 30 dias)
    venta_30d DECIMAL(18,2) DEFAULT 0,
    tickets_30d INTEGER DEFAULT 0,
    total_tickets_periodo INTEGER DEFAULT 0,
    penetracion_pct DECIMAL(8,4) DEFAULT 0,

    -- Venta acumulada para clasificacion
    venta_acumulada DECIMAL(18,2) DEFAULT 0,
    venta_total_periodo DECIMAL(18,2) DEFAULT 0,
    porcentaje_venta DECIMAL(8,4) DEFAULT 0,
    porcentaje_acumulado DECIMAL(8,4) DEFAULT 0,

    -- Rankings
    rank_venta INTEGER,
    rank_penetracion INTEGER,
    gap INTEGER DEFAULT 0,  -- rank_venta - rank_penetracion

    -- Clasificacion ABC
    clase_abc CHAR(1),  -- 'A', 'B', 'C'

    -- Metadata de calculo
    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    periodo_inicio DATE,
    periodo_fin DATE,
    dias_periodo INTEGER DEFAULT 30,

    -- Constraint de unicidad
    CONSTRAINT uq_productos_abc_cache_producto UNIQUE (producto_id)
);

-- -------------------------------------------------------------------------
-- 2. Indices para consultas rapidas
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_abc_cache_clase ON productos_abc_cache(clase_abc);
CREATE INDEX IF NOT EXISTS idx_abc_cache_gap ON productos_abc_cache(gap DESC);
CREATE INDEX IF NOT EXISTS idx_abc_cache_rank_venta ON productos_abc_cache(rank_venta);
CREATE INDEX IF NOT EXISTS idx_abc_cache_rank_penetracion ON productos_abc_cache(rank_penetracion);
CREATE INDEX IF NOT EXISTS idx_abc_cache_penetracion ON productos_abc_cache(penetracion_pct DESC);
CREATE INDEX IF NOT EXISTS idx_abc_cache_clase_gap ON productos_abc_cache(clase_abc, gap DESC);

-- -------------------------------------------------------------------------
-- 3. Tabla de control de recalculos
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS abc_cache_control (
    id SERIAL PRIMARY KEY,
    nombre_proceso VARCHAR(100) NOT NULL,
    fecha_inicio TIMESTAMP,
    fecha_fin TIMESTAMP,
    estado VARCHAR(50) DEFAULT 'pendiente', -- pendiente, en_proceso, completado, error
    productos_procesados INTEGER DEFAULT 0,
    tiempo_ejecucion_ms INTEGER,
    error_mensaje TEXT,
    parametros JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------------------
-- 4. Funcion para recalcular la cache ABC
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recalcular_abc_cache(
    p_dias INTEGER DEFAULT 30,
    p_producto_excluido VARCHAR DEFAULT '003760'
)
RETURNS TABLE(
    productos_procesados INTEGER,
    tiempo_ms INTEGER,
    productos_a INTEGER,
    productos_b INTEGER,
    productos_c INTEGER
) AS $$
DECLARE
    v_inicio TIMESTAMP;
    v_productos INTEGER;
    v_control_id INTEGER;
    v_productos_a INTEGER;
    v_productos_b INTEGER;
    v_productos_c INTEGER;
BEGIN
    v_inicio := clock_timestamp();

    -- Registrar inicio en control
    INSERT INTO abc_cache_control (nombre_proceso, fecha_inicio, estado, parametros)
    VALUES (
        'recalcular_abc_cache',
        v_inicio,
        'en_proceso',
        jsonb_build_object('dias', p_dias, 'producto_excluido', p_producto_excluido)
    )
    RETURNING id INTO v_control_id;

    -- Limpiar tabla cache
    TRUNCATE TABLE productos_abc_cache;

    -- Insertar datos recalculados
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
            END as clase_abc
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
                        v_productos_c;

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
-- 5. Vista para facilitar consultas
-- -------------------------------------------------------------------------

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
-- 6. Comentarios
-- -------------------------------------------------------------------------

COMMENT ON TABLE productos_abc_cache IS 'Cache pre-calculada de clasificacion ABC y metricas de penetracion';
COMMENT ON COLUMN productos_abc_cache.gap IS 'Diferencia entre rank_venta y rank_penetracion. Positivo = aparece en mas tickets de lo esperado por sus ventas';
COMMENT ON COLUMN productos_abc_cache.penetracion_pct IS 'Porcentaje de tickets donde aparece este producto';
COMMENT ON FUNCTION recalcular_abc_cache IS 'Recalcula toda la cache ABC. Ejecutar diariamente o segun necesidad';

COMMIT;
