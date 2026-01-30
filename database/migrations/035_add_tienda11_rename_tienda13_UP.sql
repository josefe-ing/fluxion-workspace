-- Migración: Corregir tienda_11 (FLOR AMARILLO) y renombrar tienda_13 a PARAMACAY
-- tienda_11 existía sin region asignada, no aparecía en multi-tienda
-- tienda_13 fue renombrada de NAGUANAGUA III a PARAMACAY en la operación

-- 1. Insertar tienda_11 si no existe, o corregir su region si ya existe
INSERT INTO ubicaciones (id, nombre, tipo, region, activo, codigo_klk)
VALUES ('tienda_11', 'FLOR AMARILLO', 'tienda', 'VALENCIA', true, 'tienda_11')
ON CONFLICT (id) DO UPDATE SET
    region = 'VALENCIA',
    updated_at = NOW()
WHERE ubicaciones.region IS NULL OR ubicaciones.region != 'VALENCIA';

-- 2. Renombrar tienda_13 de NAGUANAGUA III a PARAMACAY
UPDATE ubicaciones
SET nombre = 'PARAMACAY', updated_at = NOW()
WHERE id = 'tienda_13' AND nombre != 'PARAMACAY';
