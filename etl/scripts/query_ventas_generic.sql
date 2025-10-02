-- Query ETL para extraer ventas por tienda
-- Compatible con todas las tiendas de La Granja Mercado
-- Fecha: 2025-09-25

-- Parámetros dinámicos que serán reemplazados por Python:
-- {fecha_inicio} - Fecha inicial del rango
-- {fecha_fin} - Fecha final del rango
-- {limite_registros} - Límite de registros para evitar sobrecargar

SELECT
    -- Información de la transacción
    t.c_Numero AS numero_factura,
    CAST(t.f_Fecha AS DATE) AS fecha,
    CAST(t.h_Hora AS TIME) AS hora,
    CAST(t.f_Fecha AS DATETIME) + CAST(t.h_Hora AS TIME) AS fecha_hora_completa,
    t.n_Linea AS linea,

    -- Información del producto
    t.Codigo AS codigo_transaccion,
    p.c_Codigo AS codigo_producto,
    p.c_Descri AS descripcion_producto,
    p.c_Marca AS marca_producto,
    p.c_Modelo AS modelo_producto,
    p.Text2 AS cuadrante_producto,
    p.c_Presenta AS presentacion_producto,

    -- Categorización del producto
    d.c_descripcio AS categoria_producto,
    g.c_descripcio AS grupo_producto,
    sg.c_descripcio AS subgrupo_producto,

    -- Cantidades y medidas
    t.Cantidad AS cantidad_vendida,
    p.n_Peso AS peso_unitario,
    p.n_Volumen AS volumen_unitario,
    p.n_TipoPeso AS tipo_peso,

    -- Lógica especial para peso calculado (CHARCUTERIA/FRUVER)
    CASE
        WHEN d.c_descripcio IN ('CHARCUTERIA', 'FRUVER') THEN t.Cantidad
        ELSE p.n_Peso
    END AS peso_calculado,

    -- Información financiera
    p.n_CostoAct AS costo_unitario,
    p.n_Precio1 AS precio_unitario,
    p.n_Impuesto1 AS impuesto_porcentaje,

    -- Cálculos derivados
    ROUND(t.Cantidad * p.n_CostoAct, 2) AS costo_total,
    ROUND(t.Cantidad * p.n_Precio1, 2) AS venta_total,
    ROUND(t.Cantidad * p.n_Precio1 * p.n_Impuesto1 / 100, 2) AS impuesto_total,
    ROUND(t.Cantidad * (p.n_Precio1 - p.n_CostoAct), 2) AS utilidad_bruta

FROM VAD20.dbo.MA_TRANSACCION t
    LEFT JOIN VAD20.dbo.MA_CODIGOS c ON t.Codigo = c.c_Codigo
    LEFT JOIN VAD20.dbo.MA_PRODUCTOS p ON c.c_CodNasa = p.c_Codigo
    LEFT JOIN VAD10.dbo.MA_DEPARTAMENTOS d ON p.c_Departamento = d.c_codigo
    LEFT JOIN VAD10.dbo.MA_GRUPOS g ON p.c_Grupo = g.c_codigo
    LEFT JOIN VAD10.dbo.MA_SUBGRUPOS sg ON p.c_Subgrupo = sg.c_codigo

WHERE
    -- Filtro por rango de fechas
    t.f_Fecha >= '{fecha_inicio}'
    AND t.f_Fecha <= '{fecha_fin}'

    -- Solo transacciones válidas
    --AND t.Cantidad > 0
    AND p.c_Codigo IS NOT NULL

ORDER BY
    t.f_Fecha DESC,
    t.h_Hora DESC,
    t.c_Numero DESC