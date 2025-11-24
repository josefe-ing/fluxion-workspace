-- Agregar tiendas ARTIGAS y PARAISO (integración KLK)
-- Fecha: 2025-11-17
-- SUC003: ARTIGAS (Código almacén KLK: TANT)
-- SUC004: PARAISO (Código almacén KLK: PALT)

-- Primero, actualizar la lista de IDs válidos para incluir tienda_17, tienda_18 y tienda_20
-- (Nota: tienda_20 ya existe pero no está en el DELETE anterior)

-- Verificar que no existan ya
SELECT 'Verificando tiendas existentes...' as status;
SELECT id, nombre FROM ubicaciones WHERE id IN ('tienda_17', 'tienda_18', 'tienda_20');

-- Insertar ARTIGAS si no existe
INSERT INTO ubicaciones (id, codigo, nombre, tipo, region, ciudad, superficie_m2, activo)
SELECT 'tienda_17', 'T17', 'ARTIGAS', 'tienda', 'Centro', 'Valencia', 150.0, true
WHERE NOT EXISTS (SELECT 1 FROM ubicaciones WHERE id = 'tienda_17');

-- Insertar PARAISO si no existe
INSERT INTO ubicaciones (id, codigo, nombre, tipo, region, ciudad, superficie_m2, activo)
SELECT 'tienda_18', 'T18', 'PARAISO', 'tienda', 'Centro', 'Valencia', 150.0, true
WHERE NOT EXISTS (SELECT 1 FROM ubicaciones WHERE id = 'tienda_18');

-- Asegurar que TAZAJAL existe (tienda_20)
INSERT INTO ubicaciones (id, codigo, nombre, tipo, region, ciudad, superficie_m2, activo)
SELECT 'tienda_20', 'T20', 'TAZAJAL', 'tienda', 'Centro', 'Valencia', 150.0, true
WHERE NOT EXISTS (SELECT 1 FROM ubicaciones WHERE id = 'tienda_20');

-- Verificar el resultado
SELECT 'Resultado final:' as status;
SELECT id, codigo, nombre, tipo, activo
FROM ubicaciones
WHERE id IN ('tienda_17', 'tienda_18', 'tienda_20')
ORDER BY id;

-- Mostrar todas las tiendas KLK
SELECT 'Todas las tiendas KLK configuradas:' as status;
SELECT id, codigo, nombre
FROM ubicaciones
WHERE id IN ('tienda_01', 'tienda_08', 'tienda_17', 'tienda_18', 'tienda_20')
ORDER BY id;
