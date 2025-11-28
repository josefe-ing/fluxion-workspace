-- ============================================================================
-- VERIFICACIÓN DE ÍNDICES PARA ABC-XYZ ON-DEMAND
-- ============================================================================
-- Asegura que tabla ventas tenga índices necesarios para queries rápidas
-- Target: Queries ABC-XYZ < 3 segundos
-- ============================================================================

\echo '🔍 Verificando índices en tabla ventas para ABC-XYZ...'
\echo ''

-- ============================================================================
-- 1. MOSTRAR ÍNDICES ACTUALES
-- ============================================================================

\echo '📊 Índices actuales en tabla ventas:'
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'ventas'
ORDER BY indexname;

\echo ''

-- ============================================================================
-- 2. VERIFICAR ÍNDICES CRÍTICOS PARA ABC-XYZ
-- ============================================================================

\echo '✅ Verificando índices críticos...'

-- Índice 1: fecha_venta (para filtrar últimos 6 meses)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'ventas'
        AND indexname = 'idx_ventas_fecha'
    ) THEN
        RAISE NOTICE '❌ Falta idx_ventas_fecha - CREANDO...';
        CREATE INDEX idx_ventas_fecha ON ventas(fecha_venta DESC);
        RAISE NOTICE '✅ idx_ventas_fecha creado';
    ELSE
        RAISE NOTICE '✅ idx_ventas_fecha existe';
    END IF;
END $$;

-- Índice 2: ubicacion_id + fecha_venta (para filtrar por tienda)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'ventas'
        AND indexname = 'idx_ventas_ubicacion_fecha'
    ) THEN
        RAISE NOTICE '❌ Falta idx_ventas_ubicacion_fecha - CREANDO...';
        CREATE INDEX idx_ventas_ubicacion_fecha ON ventas(ubicacion_id, fecha_venta DESC);
        RAISE NOTICE '✅ idx_ventas_ubicacion_fecha creado';
    ELSE
        RAISE NOTICE '✅ idx_ventas_ubicacion_fecha existe';
    END IF;
END $$;

-- Índice 3: producto_id + fecha_venta (para queries de producto individual)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'ventas'
        AND indexname = 'idx_ventas_producto_fecha'
    ) THEN
        RAISE NOTICE '❌ Falta idx_ventas_producto_fecha - CREANDO...';
        CREATE INDEX idx_ventas_producto_fecha ON ventas(producto_id, fecha_venta DESC);
        RAISE NOTICE '✅ idx_ventas_producto_fecha creado';
    ELSE
        RAISE NOTICE '✅ idx_ventas_producto_fecha existe';
    END IF;
END $$;

-- Índice 4: almacen_codigo (para filtrar por almacén)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'ventas'
        AND indexname = 'idx_ventas_almacen'
    ) THEN
        RAISE NOTICE '❌ Falta idx_ventas_almacen - CREANDO...';
        CREATE INDEX idx_ventas_almacen ON ventas(almacen_codigo);
        RAISE NOTICE '✅ idx_ventas_almacen creado';
    ELSE
        RAISE NOTICE '✅ idx_ventas_almacen existe';
    END IF;
END $$;

-- Índice 5: numero_factura (para joins y deduplicación)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'ventas'
        AND indexname = 'idx_ventas_factura'
    ) THEN
        RAISE NOTICE '❌ Falta idx_ventas_factura - CREANDO...';
        CREATE INDEX idx_ventas_factura ON ventas(numero_factura);
        RAISE NOTICE '✅ idx_ventas_factura creado';
    ELSE
        RAISE NOTICE '✅ idx_ventas_factura existe';
    END IF;
END $$;

-- Índice COMPUESTO ADICIONAL: producto_id + ubicacion_id + fecha_venta
-- (Optimiza queries ABC-XYZ por producto y tienda específica)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'ventas'
        AND indexname = 'idx_ventas_producto_ubicacion_fecha'
    ) THEN
        RAISE NOTICE '❌ Falta idx_ventas_producto_ubicacion_fecha - CREANDO...';
        CREATE INDEX idx_ventas_producto_ubicacion_fecha
            ON ventas(producto_id, ubicacion_id, fecha_venta DESC);
        RAISE NOTICE '✅ idx_ventas_producto_ubicacion_fecha creado';
    ELSE
        RAISE NOTICE '✅ idx_ventas_producto_ubicacion_fecha existe';
    END IF;
END $$;

\echo ''

-- ============================================================================
-- 3. ACTUALIZAR ESTADÍSTICAS (CRÍTICO para performance)
-- ============================================================================

\echo '📈 Actualizando estadísticas de tabla ventas...'
ANALYZE ventas;
\echo '✅ Estadísticas actualizadas'
\echo ''

-- ============================================================================
-- 4. VERIFICAR TAMAÑO DE TABLA E ÍNDICES
-- ============================================================================

\echo '📊 Tamaño de tabla ventas e índices:'
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) -
                   pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE tablename = 'ventas';

\echo ''

-- ============================================================================
-- 5. CONTAR REGISTROS (para estimar performance)
-- ============================================================================

\echo '🔢 Contando registros en ventas...'
SELECT
    COUNT(*) as total_registros,
    COUNT(*) FILTER (WHERE fecha_venta >= CURRENT_DATE - INTERVAL '6 months') as ultimos_6_meses,
    COUNT(*) FILTER (WHERE fecha_venta >= CURRENT_DATE - INTERVAL '12 weeks') as ultimas_12_semanas,
    MIN(fecha_venta) as fecha_mas_antigua,
    MAX(fecha_venta) as fecha_mas_reciente
FROM ventas;

\echo ''

-- ============================================================================
-- 6. TEST DE PERFORMANCE: Query ABC básico
-- ============================================================================

\echo '⚡ Test de performance: Query ABC-XYZ básico'
\echo 'Target: < 3000ms'
\echo ''

\timing on

EXPLAIN ANALYZE
WITH ventas_6m AS (
    SELECT
        v.producto_id,
        v.ubicacion_id,
        SUM(v.cantidad_vendida * COALESCE(v.costo_unitario, 0)) as valor_consumo
    FROM ventas v
    WHERE v.fecha_venta >= CURRENT_DATE - INTERVAL '6 months'
    GROUP BY v.producto_id, v.ubicacion_id
)
SELECT
    producto_id,
    ubicacion_id,
    valor_consumo,
    SUM(valor_consumo) OVER (ORDER BY valor_consumo DESC) /
        NULLIF(SUM(valor_consumo) OVER (), 0) * 100 as pct_acumulado
FROM ventas_6m
WHERE valor_consumo > 0
ORDER BY valor_consumo DESC
LIMIT 100;

\timing off

\echo ''
\echo '============================================================================'
\echo '✅ Verificación completada'
\echo '============================================================================'
\echo ''
\echo 'Próximo paso: Migrar endpoints en backend/main.py'
\echo 'Ver: PLAN_MIGRACION_PRODUCTOS_MVP.md (Fase 2)'
\echo ''
