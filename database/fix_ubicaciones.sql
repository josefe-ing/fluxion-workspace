-- Actualizar ubicaciones para que coincidan con tiendas_config.py
-- Basado en: etl/core/tiendas_config.py

-- Primero eliminar ubicaciones que no están en tiendas_config.py
DELETE FROM ubicaciones WHERE id NOT IN (
    'tienda_01', 'tienda_02', 'tienda_03', 'tienda_04', 'tienda_05',
    'tienda_06', 'tienda_07', 'tienda_08', 'tienda_09', 'tienda_10',
    'tienda_11', 'tienda_12', 'tienda_13', 'tienda_15', 'tienda_16',
    'tienda_17', 'tienda_18', 'tienda_19', 'tienda_20',
    'cedi_seco', 'cedi_frio', 'cedi_verde', 'cedi_frutas'
);

-- Actualizar tiendas existentes con nombres correctos
UPDATE ubicaciones SET nombre = 'PERIFERICO', codigo = 'T01' WHERE id = 'tienda_01';
UPDATE ubicaciones SET nombre = 'AV. BOLIVAR', codigo = 'T02' WHERE id = 'tienda_02';
UPDATE ubicaciones SET nombre = 'MAÑONGO', codigo = 'T03' WHERE id = 'tienda_03';
UPDATE ubicaciones SET nombre = 'SAN DIEGO', codigo = 'T04' WHERE id = 'tienda_04';
UPDATE ubicaciones SET nombre = 'VIVIENDA', codigo = 'T05' WHERE id = 'tienda_05';
UPDATE ubicaciones SET nombre = 'NAGUANAGUA', codigo = 'T06' WHERE id = 'tienda_06';
UPDATE ubicaciones SET nombre = 'CENTRO', codigo = 'T07' WHERE id = 'tienda_07';
UPDATE ubicaciones SET nombre = 'BOSQUE', codigo = 'T08' WHERE id = 'tienda_08';
UPDATE ubicaciones SET nombre = 'GUACARA', codigo = 'T09' WHERE id = 'tienda_09';
UPDATE ubicaciones SET nombre = 'FERIAS', codigo = 'T10' WHERE id = 'tienda_10';
UPDATE ubicaciones SET nombre = 'FLOR AMARILLO', codigo = 'T11' WHERE id = 'tienda_11';
UPDATE ubicaciones SET nombre = 'PARAPARAL', codigo = 'T12' WHERE id = 'tienda_12';
UPDATE ubicaciones SET nombre = 'NAGUANAGUA III', codigo = 'T13' WHERE id = 'tienda_13';
UPDATE ubicaciones SET nombre = 'ISABELICA', codigo = 'T15' WHERE id = 'tienda_15';
UPDATE ubicaciones SET nombre = 'TOCUYITO', codigo = 'T16' WHERE id = 'tienda_16';

-- Insertar tiendas KLK nuevas si no existen
INSERT INTO ubicaciones (id, codigo, nombre, tipo, region, ciudad, superficie_m2, activo)
SELECT 'tienda_17', 'T17', 'ARTIGAS', 'tienda', 'Centro', 'Valencia', 150.0, true
WHERE NOT EXISTS (SELECT 1 FROM ubicaciones WHERE id = 'tienda_17');

INSERT INTO ubicaciones (id, codigo, nombre, tipo, region, ciudad, superficie_m2, activo)
SELECT 'tienda_18', 'T18', 'PARAISO', 'tienda', 'Centro', 'Valencia', 150.0, true
WHERE NOT EXISTS (SELECT 1 FROM ubicaciones WHERE id = 'tienda_18');

INSERT INTO ubicaciones (id, codigo, nombre, tipo, region, ciudad, superficie_m2, activo)
SELECT 'tienda_19', 'T19', 'GUIGUE', 'tienda', 'Sur', 'Guigue', 120.0, true
WHERE NOT EXISTS (SELECT 1 FROM ubicaciones WHERE id = 'tienda_19');

INSERT INTO ubicaciones (id, codigo, nombre, tipo, region, ciudad, superficie_m2, activo)
SELECT 'tienda_20', 'T20', 'TAZAJAL', 'tienda', 'Centro', 'Valencia', 150.0, true
WHERE NOT EXISTS (SELECT 1 FROM ubicaciones WHERE id = 'tienda_20');

-- Actualizar CEDIs
UPDATE ubicaciones SET nombre = 'CEDI Seco', codigo = 'C01', id = 'cedi_seco' WHERE id = 'cedi_01';
UPDATE ubicaciones SET nombre = 'CEDI Frio', codigo = 'C02', id = 'cedi_frio' WHERE id = 'cedi_02';
UPDATE ubicaciones SET nombre = 'CEDI Verde', codigo = 'C03', id = 'cedi_verde' WHERE id = 'cedi_03';

-- Insertar CEDI Frutas (inactivo por ahora)
INSERT INTO ubicaciones (id, codigo, nombre, tipo, region, ciudad, superficie_m2, activo)
SELECT 'cedi_frutas', 'C04', 'CEDI Frutas', 'cedi', 'Centro', 'Valencia', 1000.0, false
WHERE NOT EXISTS (SELECT 1 FROM ubicaciones WHERE id = 'cedi_frutas');

-- Verificar el resultado
SELECT id, codigo, nombre, tipo, activo FROM ubicaciones ORDER BY tipo DESC, id;
