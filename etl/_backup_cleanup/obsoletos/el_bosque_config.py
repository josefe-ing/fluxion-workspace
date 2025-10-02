#!/usr/bin/env python3
"""
Configuración específica para El Bosque - Test de ETL
"""

from config import DatabaseConfig, ETLConfig

# Configuración real para El Bosque
EL_BOSQUE_CONFIG = DatabaseConfig(
    ubicacion_id="tienda_01",
    ubicacion_nombre="El Bosque",
    tipo="tienda",
    server_ip="192.168.150.10",
    database_name="VAD10",
    username="beliveryApp",
    password="AxPG_25!",
    port=14348,  # Puerto personalizado
    prioridad=1,  # Alta prioridad para testing
    timeout_seconds=30,
    max_reintentos=3,
    activo=True
)

# Query real de inventario adaptado
INVENTORY_QUERY_EL_BOSQUE = """
SELECT
    Producto.c_Codigo AS codigo_producto,
    Codigos.c_Codigo AS codigo_barras,
    Producto.c_Descri AS descripcion_producto,
    Departamento.C_CODIGO AS categoria_codigo,
    Departamento.C_DESCRIPCIO AS categoria,
    CASE
        WHEN Grupo.c_CODIGO IS NULL THEN 'NO POSEE'
        ELSE Grupo.c_CODIGO
    END AS subcategoria_codigo,
    CASE
        WHEN Grupo.C_DESCRIPCIO IS NULL THEN 'NO POSEE'
        ELSE LTRIM(RTRIM(Grupo.C_DESCRIPCIO))
    END AS subcategoria,
    CASE
        WHEN Producto.c_Marca = '' THEN 'NO POSEE'
        ELSE TRIM(Producto.c_Marca)
    END AS marca,
    Producto.n_Peso AS peso,
    Producto.n_Volumen AS volumen,
    Producto.n_Precio1 AS precio_venta_actual,
    Producto.n_Impuesto1 AS iva_porcentaje,
    CASE
        WHEN n_TipoPeso = 4 THEN 0
        ELSE ISNULL(ROUND(ExLocal.n_Cantidad, 8, 0), 0)
    END AS cantidad_actual,

    -- Campos adicionales calculados
    (Producto.n_Precio1 / (1 + (Producto.n_Impuesto1/100))) AS precio_sin_iva,
    (CASE
        WHEN n_TipoPeso = 4 THEN 0
        ELSE ISNULL(ROUND(ExLocal.n_Cantidad, 8, 0), 0)
    END * Producto.n_Precio1) AS valor_inventario_actual,

    -- Campos de control
    Producto.n_Activo AS activo_flag,
    Producto.n_TipoPeso AS tipo_peso,

    -- Campos requeridos para el ETL (valores por defecto)
    50 AS stock_minimo,  -- Valor por defecto, se puede configurar después
    500 AS stock_maximo,  -- Valor por defecto, se puede configurar después
    75 AS punto_reorden,  -- 1.5x el stock mínimo

    -- Metadatos
    GETDATE() AS fecha_sistema,
    'El Bosque' AS nombre_ubicacion

FROM MA_PRODUCTOS Producto
    LEFT JOIN MA_DEPOPROD ExLocal ON Producto.c_Codigo = ExLocal.c_CodArticulo
                                  AND ExLocal.c_CodDeposito = '0802'
    LEFT JOIN MA_CODIGOS Codigos ON Producto.c_Codigo = Codigos.c_CodNasa
    LEFT JOIN MA_DEPARTAMENTOS Departamento ON Departamento.C_CODIGO = Producto.c_Departamento
    LEFT JOIN MA_GRUPOS Grupo ON Grupo.c_CODIGO = Producto.c_Grupo

WHERE Departamento.C_CODIGO <> '000017'
  AND Producto.n_TipoPeso = 0
  AND Codigos.c_Descripcion = 'BARRA'
  AND Codigos.nu_Intercambio = 1
  AND Producto.n_Activo = 1

ORDER BY Departamento.C_DESCRIPCIO, Producto.c_Descri
"""

def test_el_bosque_connection():
    """Función para probar la conexión a El Bosque"""

    print("🧪 PROBANDO CONEXIÓN A EL BOSQUE")
    print("=" * 40)
    print(f"🏪 Ubicación: {EL_BOSQUE_CONFIG.ubicacion_nombre}")
    print(f"🌐 Servidor: {EL_BOSQUE_CONFIG.server_ip}:{EL_BOSQUE_CONFIG.port}")
    print(f"🗄️  Base de datos: {EL_BOSQUE_CONFIG.database_name}")
    print(f"👤 Usuario: {EL_BOSQUE_CONFIG.username}")
    print()

    try:
        from extractor import SQLServerExtractor

        with SQLServerExtractor() as extractor:
            success = extractor.test_connection(EL_BOSQUE_CONFIG)

            if success:
                print("✅ ¡Conexión exitosa a El Bosque!")

                # Probar query básico
                print("\n🔍 Probando query de inventario...")

                test_query = """
                SELECT TOP 5
                    Producto.c_Codigo,
                    Producto.c_Descri,
                    Departamento.C_DESCRIPCIO,
                    ISNULL(ExLocal.n_Cantidad, 0) AS stock
                FROM MA_PRODUCTOS Producto
                    LEFT JOIN MA_DEPOPROD ExLocal ON Producto.c_Codigo = ExLocal.c_CodArticulo
                                                  AND ExLocal.c_CodDeposito = '0802'
                    LEFT JOIN MA_DEPARTAMENTOS Departamento ON Departamento.C_CODIGO = Producto.c_Departamento
                WHERE Producto.n_Activo = 1
                ORDER BY Producto.c_Descri
                """

                df = extractor.extract_inventory_data(EL_BOSQUE_CONFIG, test_query)

                if df is not None and not df.empty:
                    print(f"✅ Query exitoso: {len(df)} productos encontrados")
                    print("\n📋 Muestra de productos:")
                    for _, row in df.head().iterrows():
                        print(f"   • {row.get('c_Codigo', 'N/A')}: {row.get('c_Descri', 'N/A')} (Stock: {row.get('stock', 0)})")
                else:
                    print("⚠️  Query ejecutado pero sin resultados")

                return True
            else:
                print("❌ Falló la conexión a El Bosque")
                return False

    except Exception as e:
        print(f"❌ Error probando conexión: {str(e)}")
        return False

if __name__ == "__main__":
    test_el_bosque_connection()