-- ============================================================================
-- ÍNDICES FALTANTES PARA OPTIMIZAR ETL DELETE
-- ============================================================================
-- Fecha: 2025-10-26
-- Propósito: Acelerar operación DELETE del ETL de ventas
-- Tiempo estimado: 5-10 minutos por índice (con 55M registros)
-- ============================================================================

-- 1. Índice simple en ubicacion_id
-- Optimiza filtrado por tienda: WHERE ubicacion_id IN (...)
CREATE INDEX IF NOT EXISTS idx_ventas_raw_ubicacion
ON ventas_raw(ubicacion_id);

-- 2. Índice compuesto (fecha + ubicacion)
-- Optimiza el DELETE completo: WHERE ubicacion_id IN (...) AND fecha BETWEEN ... AND ...
CREATE INDEX IF NOT EXISTS idx_ventas_raw_fecha_ubicacion
ON ventas_raw(fecha, ubicacion_id);

-- ============================================================================
-- NOTA: Estos índices acelerarán el DELETE del ETL de ~minutos a ~segundos
-- ============================================================================
