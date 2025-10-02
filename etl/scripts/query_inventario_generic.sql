-- Query mejorado para extraer inventario completo de VAD10
-- Con información de depósitos, grupos, subgrupos y cuadrantes
-- Fecha: 2025-09-25
-- Parámetro dinámico: {codigo_deposito} será reemplazado por el código específico de cada tienda

SELECT
    dpp.id as id,
    dpp.c_coddeposito as codigo_deposito,
    de.c_descripcion as descripcion_deposito,
    dpp.c_codarticulo as codigo_producto,
    p.c_Descri as descripcion_producto,
    CASE
        WHEN d.C_DESCRIPCIO = 'CB' THEN 'CANASTA BASICA'
        ELSE d.C_DESCRIPCIO
    END as categoria_producto,
    g.C_DESCRIPCIO as grupo_producto,
    sg.c_DESCRIPCIO as subgrupo_producto,
    p.c_Marca as marca_producto,
    p.Text2 as cuadrante_producto,
    p.n_CostoAct as costo_producto,
    p.n_Precio1 as precio_producto,
    p.n_Impuesto1 as impuesto_producto,
    p.c_Presenta as presentacion_producto,
    p.n_Peso as peso_producto,
    p.n_Volumen as volumen_producto,
    p.n_TipoPeso as tipo_peso,
    dpp.n_cantidad as stock
FROM
    VAD10.dbo.MA_DEPOPROD dpp
    LEFT JOIN VAD10.dbo.MA_PRODUCTOS p ON dpp.c_codarticulo = p.c_Codigo
    LEFT JOIN VAD10.dbo.MA_CODIGOS c ON p.c_Codigo = c.c_CodNasa
    LEFT JOIN VAD10.dbo.MA_DEPARTAMENTOS d ON p.c_Departamento = d.C_CODIGO
    LEFT JOIN VAD10.dbo.MA_GRUPOS g ON p.c_Grupo = g.c_CODIGO
    LEFT JOIN VAD10.dbo.MA_SUBGRUPOS sg ON p.c_Subgrupo = sg.c_CODIGO
    LEFT JOIN VAD10.dbo.MA_DEPOSITO de ON dpp.c_coddeposito = de.c_coddeposito
WHERE
    de.c_coddeposito = '{codigo_deposito}'
    AND d.C_CODIGO <> '000017'  -- Excluye departamento PROCURA
    AND (
        c.c_Descripcion = 'BARRA'
        AND p.n_TipoPeso = 0
        AND c.nu_Intercambio = 1
        AND p.n_Activo = 1
    )
ORDER BY
    dpp.id DESC