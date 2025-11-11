-- =====================================================================================
-- MIGRACIÓN SEGURA: Recrear tabla productos_abc_v2 con schema correcto
-- =====================================================================================
-- Esta migración elimina la tabla vieja y la recrea con el schema correcto.
-- Los datos se perderán pero pueden ser recalculados con el script Python.
-- =====================================================================================

-- 1. Hacer backup de datos existentes (opcional)
CREATE TABLE IF NOT EXISTS productos_abc_v2_backup_20251111 AS
SELECT * FROM productos_abc_v2;

-- 2. Eliminar tabla antigua
DROP TABLE IF EXISTS productos_abc_v2;
DROP TABLE IF EXISTS productos_abc_v2_historico;
DROP TABLE IF EXISTS productos_abc_v2_evolucion;

-- 3. Eliminar vistas que dependen de estas tablas
DROP VIEW IF EXISTS v_abc_v2_resumen;
DROP VIEW IF EXISTS v_abc_comparacion_velocidad_valor;
DROP VIEW IF EXISTS v_abc_top_productos;
DROP VIEW IF EXISTS v_abc_cambios_significativos;
DROP VIEW IF EXISTS vista_matriz_abc_xyz;
DROP VIEW IF EXISTS vista_productos_az_criticos;
DROP VIEW IF EXISTS vista_productos_bz_cz;
DROP VIEW IF EXISTS vista_productos_ax_bx;
DROP VIEW IF EXISTS vista_auditoria_confiabilidad;

-- 4. Las tablas se recrearán con schema_abc_v2.sql y schema_abc_xyz.sql
-- Este archivo debe ejecutarse ANTES de esos schemas
