-- ============================================================================
-- MIGRATION: Agregar columna metodo_calculo a pedidos_sugeridos
-- ============================================================================
-- Descripción: Permite distinguir entre diferentes métodos de cálculo de
--              pedidos sugeridos (NIVEL_OBJETIVO_V2, FORECAST_PMP, etc.)
--
-- Autor: Sistema FluxionIA
-- Fecha: 2025-01-13
-- Versión: 1.0
-- ============================================================================

-- Agregar columna metodo_calculo si no existe
ALTER TABLE pedidos_sugeridos
ADD COLUMN IF NOT EXISTS metodo_calculo VARCHAR DEFAULT 'NIVEL_OBJETIVO_V1';

-- Comentario en la columna
COMMENT ON COLUMN pedidos_sugeridos.metodo_calculo IS
'Método de cálculo utilizado: NIVEL_OBJETIVO_V1 (demanda histórica simple),
NIVEL_OBJETIVO_V2 (ABC-XYZ con stock de seguridad), FORECAST_PMP (pronóstico avanzado)';

-- Actualizar registros existentes a v1
UPDATE pedidos_sugeridos
SET metodo_calculo = 'NIVEL_OBJETIVO_V1'
WHERE metodo_calculo IS NULL;

-- Nota: La columna 'version' ya existe en la tabla con default = 1
