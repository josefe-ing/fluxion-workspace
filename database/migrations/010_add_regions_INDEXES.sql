-- =====================================================================================
-- MIGRACIÓN 010 - ÍNDICES PARCIALES POR REGIÓN
-- =====================================================================================
-- IMPORTANTE: Este script debe ejecutarse FUERA de una transacción
-- porque CREATE INDEX CONCURRENTLY no puede ejecutarse dentro de transacciones.
--
-- Ejecutar con: psql -f 010_add_regions_INDEXES.sql (sin BEGIN/COMMIT)
-- O en pgAdmin: desmarcar "Execute as single transaction"
-- =====================================================================================

-- =====================================================================================
-- ÍNDICES PARA FACTURAS
-- =====================================================================================

-- CARACAS - Facturas ordenadas por fecha desc para consultas recientes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_facturas_caracas_fecha
ON facturas(fecha DESC, ubicacion_id)
WHERE ubicacion_id IN ('cedi_caracas', 'tienda_17', 'tienda_18');

-- VALENCIA - Facturas ordenadas por fecha desc
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_facturas_valencia_fecha
ON facturas(fecha DESC, ubicacion_id)
WHERE ubicacion_id NOT IN ('cedi_caracas', 'tienda_17', 'tienda_18');

-- =====================================================================================
-- ÍNDICES PARA INVENTARIO_ACTUAL
-- =====================================================================================

-- CARACAS - Inventario para consultas de pedidos sugeridos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventario_actual_caracas
ON inventario_actual(ubicacion_id, producto_id)
WHERE ubicacion_id IN ('cedi_caracas', 'tienda_17', 'tienda_18');

-- VALENCIA - Inventario
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventario_actual_valencia
ON inventario_actual(ubicacion_id, producto_id)
WHERE ubicacion_id NOT IN ('cedi_caracas', 'tienda_17', 'tienda_18');

-- =====================================================================================
-- ÍNDICES PARA ITEMS_FACTURAS
-- =====================================================================================

-- Índice compuesto para optimizar JOINs con facturas regionales
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_facturas_fecha_factura
ON items_facturas(fecha, factura_id);

-- =====================================================================================
-- ÍNDICES PARA MOVIMIENTOS_INVENTARIO
-- =====================================================================================

-- CARACAS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movimientos_caracas_fecha
ON movimientos_inventario(fecha DESC, ubicacion_id, producto_id)
WHERE ubicacion_id IN ('cedi_caracas', 'tienda_17', 'tienda_18');

-- VALENCIA
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movimientos_valencia_fecha
ON movimientos_inventario(fecha DESC, ubicacion_id, producto_id)
WHERE ubicacion_id NOT IN ('cedi_caracas', 'tienda_17', 'tienda_18');

-- =====================================================================================
-- ÍNDICES PARA PRODUCTO_UBICACION_CONFIG
-- =====================================================================================

-- CARACAS - Para consultas de configuración de pedidos sugeridos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prod_ubic_config_caracas
ON producto_ubicacion_config(ubicacion_id, producto_id)
WHERE ubicacion_id IN ('cedi_caracas', 'tienda_17', 'tienda_18');

-- VALENCIA
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prod_ubic_config_valencia
ON producto_ubicacion_config(ubicacion_id, producto_id)
WHERE ubicacion_id NOT IN ('cedi_caracas', 'tienda_17', 'tienda_18');

-- =====================================================================================
-- VERIFICACIÓN
-- =====================================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM pg_indexes
    WHERE indexname LIKE 'idx_%caracas%' OR indexname LIKE 'idx_%valencia%';

    RAISE NOTICE '';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE '✅ ÍNDICES PARCIALES CREADOS: %', v_count;
    RAISE NOTICE '=====================================================';
END $$;

-- Listar índices creados
SELECT
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size
FROM pg_indexes
WHERE schemaname = 'public'
AND (indexname LIKE 'idx_%caracas%' OR indexname LIKE 'idx_%valencia%')
ORDER BY tablename, indexname;
