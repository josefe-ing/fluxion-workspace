-- ============================================================================
-- Migration 023: Performance Indexes for Ventas
-- Description: Optimized indexes for /api/ventas/producto/diario endpoint
-- Date: 2025-12-22
-- Impact: Reduces query time from 41s to ~2-5s
-- ============================================================================

-- NOTE: These indexes were already created directly in production.
-- This migration file exists for documentation and reproducibility.

BEGIN;

-- Partial index for queries filtering cantidad_vendida > 0
-- Reduces index size and speeds up common filter pattern
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ventas_producto_fecha_positivo
ON ventas(producto_id, fecha_venta DESC)
WHERE cantidad_vendida > 0;

-- Index on date expression to avoid ::date cast in queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ventas_producto_fecha_date
ON ventas(producto_id, (fecha_venta::date));

-- Record migration
INSERT INTO schema_migrations (version, name)
VALUES ('023', 'ventas_performance_indexes')
ON CONFLICT (version) DO UPDATE SET
    name = 'ventas_performance_indexes',
    applied_at = CURRENT_TIMESTAMP;

COMMIT;
