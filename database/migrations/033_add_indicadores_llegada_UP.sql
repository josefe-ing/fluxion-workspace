-- =========================================================================
-- Migration 033 UP: Agregar indicadores de llegada a pedidos_sugeridos
-- Description: Columnas para almacenar y mostrar indicadores de exito de llegada
-- Date: 2026-01-27
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Agregar columnas de indicadores de llegada a pedidos_sugeridos
-- -------------------------------------------------------------------------

-- Conteo de productos por estado de llegada
ALTER TABLE pedidos_sugeridos
ADD COLUMN IF NOT EXISTS llegada_productos_completos INTEGER DEFAULT 0;

ALTER TABLE pedidos_sugeridos
ADD COLUMN IF NOT EXISTS llegada_productos_parciales INTEGER DEFAULT 0;

ALTER TABLE pedidos_sugeridos
ADD COLUMN IF NOT EXISTS llegada_productos_no_llegaron INTEGER DEFAULT 0;

-- Porcentajes calculados (para mostrar en UI)
ALTER TABLE pedidos_sugeridos
ADD COLUMN IF NOT EXISTS llegada_pct_completos DECIMAL(5,2) DEFAULT 0;

ALTER TABLE pedidos_sugeridos
ADD COLUMN IF NOT EXISTS llegada_pct_parciales DECIMAL(5,2) DEFAULT 0;

ALTER TABLE pedidos_sugeridos
ADD COLUMN IF NOT EXISTS llegada_pct_no_llegaron DECIMAL(5,2) DEFAULT 0;

-- Timestamp de ultima verificacion
ALTER TABLE pedidos_sugeridos
ADD COLUMN IF NOT EXISTS fecha_ultima_verificacion TIMESTAMP;

-- Si ya tiene datos de llegada verificados
ALTER TABLE pedidos_sugeridos
ADD COLUMN IF NOT EXISTS tiene_verificacion_llegada BOOLEAN DEFAULT FALSE;

-- -------------------------------------------------------------------------
-- 2. Record migration
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('033', 'add_indicadores_llegada')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 033 UP
-- =========================================================================
