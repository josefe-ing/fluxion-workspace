SELECT  Producto.c_Descri AS nombreProducto,
                Producto.c_Codigo AS Codigo,
                Codigos.c_Codigo,
                Departamento.C_CODIGO AS categoria,
                Departamento.C_DESCRIPCIO AS descripcion,
                CASE
                WHEN Grupo.c_CODIGO IS NULL THEN 'NO POSEE' ELSE Grupo.c_CODIGO END AS subcategoria,
                CASE
                WHEN Grupo.C_DESCRIPCIO IS NULL THEN 'NO POSEE' ELSE LTRIM(RTRIM(Grupo.C_DESCRIPCIO)) END AS descripcion_subcategoria,
                CASE
                WHEN Producto.c_Marca = '' THEN 'NO POSEE' ELSE TRIM(Producto.c_Marca) END AS marca,
                Producto.n_Peso,
                Producto.n_Volumen,
                Producto.n_Precio1 AS precio,
                Producto.n_Impuesto1 AS iva,
                CASE WHEN n_TipoPeso = 4 THEN 0 ELSE isNULL(ROUND(ExLocal.n_Cantidad, 8, 0), 0) END AS stock

FROM MA_PRODUCTOS Producto LEFT JOIN MA_DEPOPROD ExLocal           ON Producto.c_Codigo = ExLocal.c_CodArticulo AND ExLocal.c_CodDeposito = '0802'
                           LEFT JOIN MA_CODIGOS Codigos            ON Producto.c_Codigo = Codigos.c_CodNasa
                           LEFT JOIN MA_DEPARTAMENTOS Departamento ON Departamento.C_CODIGO = Producto.c_Departamento
                           LEFT JOIN MA_GRUPOS Grupo               ON Grupo.c_CODIGO = Producto.c_Grupo
WHERE Producto.n_Activo = 1  -- Solo productos activos, sin otros filtros restrictivos
  AND Departamento.C_CODIGO IS NOT NULL  -- Evitar productos sin categoría
ORDER BY Producto.c_Descri