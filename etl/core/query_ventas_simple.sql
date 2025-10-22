-- Query ETL SIMPLIFICADO para extraer ventas por tienda
-- Solo datos esenciales, sin JOINs pesados

SELECT TOP {limite_registros}
    -- Información básica de la transacción
    t.c_Numero AS numero_factura,
    CAST(t.f_Fecha AS DATE) AS fecha,
    CAST(t.h_Hora AS TIME) AS hora,
    t.n_Linea AS linea,
    t.Codigo AS codigo_transaccion,
    t.Cantidad AS cantidad_vendida,

    -- Información del producto (1 solo JOIN)
    p.c_Codigo AS codigo_producto,
    p.c_Descri AS descripcion_producto,
    p.c_Marca AS marca_producto,
    p.n_CantiBul AS cantidad_bultos,
    p.n_Peso AS peso_unitario,
    p.n_CostoAct AS costo_unitario,
    p.n_Precio1 AS precio_unitario,
    p.n_Impuesto1 AS impuesto_porcentaje

FROM VAD20.dbo.MA_TRANSACCION t
    LEFT JOIN VAD20.dbo.MA_CODIGOS c ON t.Codigo = c.c_Codigo
    LEFT JOIN VAD20.dbo.MA_PRODUCTOS p ON c.c_CodNasa = p.c_Codigo

WHERE
    t.f_Fecha >= '{fecha_inicio}'
    AND t.f_Fecha <= '{fecha_fin}'
    AND p.c_Codigo IS NOT NULL

ORDER BY
    t.f_Fecha DESC,
    t.h_Hora DESC
