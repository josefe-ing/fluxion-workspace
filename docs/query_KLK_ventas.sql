-- Query ETL para extraer ventas por tienda
-- Base de datos: CONSOLIDADO
-- Rango: Ayer a Hoy
-- Fecha de ejecución: 2025-11-17

SELECT TOP 100
    -- Información de la transacción
    fl.NumFactura AS numero_factura,
    CAST(fl.FechaFactura AS DATE) AS fecha,
    CAST(fh.Hora AS TIME) AS hora,
    DATEADD(SECOND,
        DATEPART(HOUR, fh.Hora) * 3600 +
        DATEPART(MINUTE, fh.Hora) * 60 +
        DATEPART(SECOND, fh.Hora),
        CAST(fl.FechaFactura AS DATETIME)) AS fecha_hora_completa,
    fl.NumLineas AS linea,

    -- Información del producto
    fl.CodArticulo AS codigo_producto,
    fl.Descripcion AS descripcion_producto,
    art.Marca AS marca_producto,
    art.Modelo AS modelo_producto,
    art.Categoria AS categoria_producto,

    -- Categorización del producto
    dep.Descripcion AS departamento_descripcion,
    ga.Descripcion AS grupo_articulo,
    art.Subgrupo AS subgrupo_producto,
    cat.NombreCategoria AS categoria_nombre,

    -- Información del almacén/tienda
    fl.CodigoAlmacen AS codigo_almacen,
    alm.NombreAlmacen AS nombre_almacen,
    fh.IDSucursal AS id_sucursal,
    fh.Sucursal AS nombre_sucursal,

    -- Cantidades y medidas
    fl.Cantidad AS cantidad_vendida,
    art.Peso AS peso_unitario,
    art.PesoBruto AS peso_bruto,
    art.Volumen AS volumen_unitario,
    art.UMVenta AS unidad_medida_venta,
    art.FactorUM AS factor_unidad_medida,
    fl.TotalCantidadXUndMed AS total_cantidad_por_unidad_medida,

    -- Lógica especial para peso calculado (productos pesables)
    CASE
        WHEN art.Pesable = '1' OR art.Pesable = 'Y' THEN fl.Cantidad
        ELSE art.Peso
    END AS peso_calculado,

    -- Información financiera
    fl.CostoBs AS costo_unitario_bs,
    fl.CostoUsd AS costo_unitario_usd,
    fl.Precio AS precio_unitario_bs,
    fl.PrecioUSD AS precio_unitario_usd,
    fl.PorcImpuesto AS impuesto_porcentaje,
    fl.MontoImpuesto AS impuesto_monto,

    -- Descuentos
    fl.PorcDescuento AS porcentaje_descuento,
    fl.MontoDescuento AS monto_descuento,
    fl.PorcDescFidel AS porcentaje_descuento_fidelizacion,
    fl.MontoDescuentoFidel AS monto_descuento_fidelizacion,
    fl.PorcDescFormPago AS porcentaje_descuento_forma_pago,
    fl.MontoDescuentoFormPago AS monto_descuento_forma_pago,

    -- Cálculos derivados
    fl.TotalLinea AS venta_total_bs,
    fl.TotalLineaUSD AS venta_total_usd,
    ROUND(fl.Cantidad * fl.CostoBs, 2) AS costo_total_bs,
    ROUND(fl.Cantidad * fl.CostoUsd, 2) AS costo_total_usd,
    ROUND(fl.TotalLinea - (fl.Cantidad * fl.CostoBs), 2) AS utilidad_bruta_bs,
    ROUND(fl.TotalLineaUSD - (fl.Cantidad * fl.CostoUsd), 2) AS utilidad_bruta_usd,

    -- Información adicional del encabezado
    fh.CodCliente AS codigo_cliente,
    fh.NomCliente AS nombre_cliente,
    fh.CodigoVendedorPOS AS codigo_vendedor,
    fh.NombreVendedorPOS AS nombre_vendedor,
    fh.Total AS total_factura,
    fh.CodigoMoneda AS moneda,
    fh.TasaUSD AS tasa_usd,

    -- Información adicional de la línea
    fl.CodBarra AS codigo_barras,
    fl.Serial AS serial,
    fl.IMEI AS imei,
    fl.NoFiscal AS es_no_fiscal,
    fl.Devolucion AS es_devolucion,
    fh.Anulado AS factura_anulada,

    -- Información de promociones
    fl.TienePromocion AS tiene_promocion,
    fl.CodPromocion AS codigo_promocion

FROM KLK_FACTURALINE fl
    INNER JOIN KLK_FACTURAHDR fh
        ON fl.NumFactura = fh.NumFactura
    LEFT JOIN KLK_SAP_ARTICULO art
        ON fl.CodArticulo = art.CodArticulo
    LEFT JOIN KLK_SAP_ALMACEN alm
        ON fl.CodigoAlmacen = alm.CodigoAlmacen
    LEFT JOIN KLK_DEPARTAMENTO dep
        ON art.Departamento = dep.CodDepartamento
    LEFT JOIN KLK_GRUPOARTICULO ga
        ON art.GrpArticulo = ga.id
    LEFT JOIN KLK_CATEGORIAS cat
        ON art.Cod_Categoria = cat.IdCategoria

WHERE
    -- Filtro por rango de fechas: AYER A HOY
    fl.FechaFactura >= '2025-11-16'  -- Ayer
    AND fl.FechaFactura <= '2025-11-17'  -- Hoy

    -- Filtro por almacén/tienda específica
    AND fl.CodigoAlmacen = 'APP-TPF'

    -- Solo transacciones válidas
    AND fl.Cantidad > 0
    AND fl.CodArticulo IS NOT NULL

    -- Excluir facturas anuladas
    AND ISNULL(fh.Anulado, 0) = 0

    -- Excluir devoluciones
    AND ISNULL(fl.Devolucion, 0) = 0

ORDER BY
    fl.FechaFactura DESC,
    fh.Hora DESC,
    fl.NumFactura DESC,
    fl.NumLineas