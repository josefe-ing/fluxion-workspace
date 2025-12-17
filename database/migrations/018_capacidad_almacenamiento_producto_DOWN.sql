-- Migration: 018_capacidad_almacenamiento_producto_DOWN.sql
-- Description: Rollback - eliminar tabla de capacidad de almacenamiento
-- Author: Fluxion AI
-- Date: 2025-12-17

DROP TABLE IF EXISTS capacidad_almacenamiento_producto;
