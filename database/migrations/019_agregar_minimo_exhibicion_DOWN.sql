-- Migration: 019_agregar_minimo_exhibicion_DOWN.sql
-- Description: Rollback - eliminar columna de mínimo de exhibición
-- Author: Fluxion AI
-- Date: 2025-12-17

ALTER TABLE capacidad_almacenamiento_producto
DROP COLUMN IF EXISTS minimo_exhibicion_unidades;
