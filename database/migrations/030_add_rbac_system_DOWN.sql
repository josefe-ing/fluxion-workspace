-- Migration 030 DOWN: Rollback RBAC System
-- Fecha: 2026-01-26
-- Descripción: Revierte cambios de sistema de roles y permisos

BEGIN;

-- =====================================================================================
-- 1. ELIMINAR TABLA DE ASIGNACIÓN DE TIENDAS
-- =====================================================================================
DROP TABLE IF EXISTS usuarios_tiendas CASCADE;

-- =====================================================================================
-- 2. ELIMINAR COLUMNA ROL_ID DE USUARIOS
-- =====================================================================================
ALTER TABLE usuarios DROP COLUMN IF EXISTS rol_id;

-- =====================================================================================
-- 3. ELIMINAR TABLA DE ROLES
-- =====================================================================================
DROP TABLE IF EXISTS roles CASCADE;

-- =====================================================================================
-- 4. ELIMINAR REGISTRO DE MIGRACIÓN
-- =====================================================================================
DELETE FROM schema_migrations WHERE version = '030';

COMMIT;

-- =====================================================================================
-- NOTA: Este rollback revierte todos los cambios de RBAC
-- =====================================================================================
-- Después del rollback:
--   - Sistema vuelve a autenticación básica sin roles
--   - Todos los usuarios tendrán acceso completo como antes
--   - Se pierde información de roles asignados
