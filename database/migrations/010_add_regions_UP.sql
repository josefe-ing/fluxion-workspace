-- =====================================================================================
-- MIGRACIÓN 010: SEPARACIÓN POR REGIONES (CARACAS vs VALENCIA)
-- Fecha: 2025-12-03
-- Propósito: Habilitar filtrado y optimización por región para "Pedidos Sugeridos"
-- =====================================================================================

-- =====================================================================================
-- PARTE 1: POBLAR COLUMNA REGION EN UBICACIONES
-- =====================================================================================

-- La columna 'region' ya existe en el schema (postgresql_schema.sql línea 16)
-- Solo necesitamos poblar los valores

-- CARACAS: cedi_caracas + tienda_17 (ARTIGAS) + tienda_18 (PARAISO)
UPDATE ubicaciones SET region = 'CARACAS'
WHERE id IN ('cedi_caracas', 'tienda_17', 'tienda_18');

-- VALENCIA: Todo lo demás
UPDATE ubicaciones SET region = 'VALENCIA'
WHERE region IS NULL OR region = '';

-- Verificar distribución
DO $$
DECLARE
    v_caracas INTEGER;
    v_valencia INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_caracas FROM ubicaciones WHERE region = 'CARACAS';
    SELECT COUNT(*) INTO v_valencia FROM ubicaciones WHERE region = 'VALENCIA';

    RAISE NOTICE '✅ Regiones pobladas:';
    RAISE NOTICE '   CARACAS: % ubicaciones', v_caracas;
    RAISE NOTICE '   VALENCIA: % ubicaciones', v_valencia;
END $$;

-- =====================================================================================
-- PARTE 2: ÍNDICE SOBRE REGIÓN EN UBICACIONES
-- =====================================================================================

CREATE INDEX IF NOT EXISTS idx_ubicaciones_region
ON ubicaciones(region);

-- =====================================================================================
-- PARTE 3: VISTA PARA COMPARATIVA DE REGIONES (FUTURO)
-- =====================================================================================

CREATE OR REPLACE VIEW v_comparativa_regiones AS
WITH ventas_por_region AS (
    SELECT
        u.region,
        f.fecha,
        COUNT(DISTINCT f.id) as num_facturas,
        SUM(f.total_usd) as ventas_usd,
        COUNT(DISTINCT i.producto_id) as productos_vendidos
    FROM facturas f
    JOIN ubicaciones u ON f.ubicacion_id = u.id
    LEFT JOIN items_facturas i ON f.id = i.factura_id
    WHERE f.fecha >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY u.region, f.fecha
),
stock_por_region AS (
    SELECT
        u.region,
        COUNT(DISTINCT s.producto_id) as productos_en_stock,
        SUM(s.cantidad) as unidades_totales,
        SUM(COALESCE(s.cantidad, 0) * 1) as valor_inventario  -- TODO: agregar costo cuando esté disponible
    FROM inventario_actual s
    JOIN ubicaciones u ON s.ubicacion_id = u.id
    WHERE s.cantidad > 0
    GROUP BY u.region
)
SELECT
    v.region,
    v.fecha,
    v.num_facturas,
    v.ventas_usd,
    v.productos_vendidos,
    s.productos_en_stock,
    s.unidades_totales,
    s.valor_inventario
FROM ventas_por_region v
LEFT JOIN stock_por_region s ON v.region = s.region
ORDER BY v.region, v.fecha DESC;

COMMENT ON VIEW v_comparativa_regiones IS
'Vista para comparar métricas entre CARACAS y VALENCIA - últimos 90 días';

-- =====================================================================================
-- PARTE 4: FUNCIÓN HELPER PARA CONSULTAS POR REGIÓN
-- =====================================================================================

-- Función para obtener IDs de ubicaciones por región
CREATE OR REPLACE FUNCTION get_ubicaciones_region(p_region VARCHAR)
RETURNS TABLE(ubicacion_id VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT id FROM ubicaciones WHERE region = UPPER(p_region) AND activo = true;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_ubicaciones_region IS
'Retorna los IDs de ubicaciones activas para una región (CARACAS o VALENCIA)';

-- =====================================================================================
-- PARTE 5: REGISTRAR MIGRACIÓN
-- =====================================================================================

-- Crear tabla de migraciones si no existe
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version, name)
VALUES ('010', 'add_regions')
ON CONFLICT (version) DO NOTHING;

-- =====================================================================================
-- FIN DE MIGRACIÓN (PARTE 1)
-- =====================================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE '✅ MIGRACIÓN 010 PARTE 1 COMPLETADA';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Cambios aplicados:';
    RAISE NOTICE '  1. Columna region poblada (CARACAS vs VALENCIA)';
    RAISE NOTICE '  2. Índice idx_ubicaciones_region creado';
    RAISE NOTICE '  3. Vista v_comparativa_regiones creada';
    RAISE NOTICE '  4. Función get_ubicaciones_region() creada';
    RAISE NOTICE '';
    RAISE NOTICE 'SIGUIENTE PASO:';
    RAISE NOTICE '  Ejecutar 010_add_regions_INDEXES.sql para crear índices parciales';
    RAISE NOTICE '  (debe ejecutarse FUERA de transacción por CONCURRENTLY)';
    RAISE NOTICE '';
END $$;
