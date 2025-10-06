#!/usr/bin/env python3
"""
Test ETL inventario en producción - BOSQUE
"""
import pyodbc
import sys

# Credenciales
SQL_USER = "beliveryApp"
SQL_PASS = "AxPG_25!"

# Tienda de prueba: BOSQUE (tienda_08)
TEST_STORE = {
    "nombre": "BOSQUE",
    "ip": "192.168.150.10",
    "port": 14348,
    "database": "VAD10",
    "codigo_deposito": "01"
}

def test_etl():
    """Test ETL inventario con query real"""
    print(f"🧪 ETL Test: {TEST_STORE['nombre']}")
    print(f"   Server: {TEST_STORE['ip']}:{TEST_STORE['port']}")
    print(f"   Database: {TEST_STORE['database']}")
    print(f"   Deposito: {TEST_STORE['codigo_deposito']}")
    print("-" * 80)

    try:
        # Conexión
        conn_str = (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={TEST_STORE['ip']},{TEST_STORE['port']};"
            f"DATABASE={TEST_STORE['database']};"
            f"UID={SQL_USER};"
            f"PWD={SQL_PASS};"
            f"TrustServerCertificate=yes;"
        )

        print("📡 Connecting...")
        conn = pyodbc.connect(conn_str, timeout=15)
        cursor = conn.cursor()
        print("✅ Connected!")

        # Query inventario (simplificado para test)
        print("\n📥 Extracting inventory data...")
        query = f"""
        SELECT TOP 5
            dpp.id as id,
            dpp.c_coddeposito as codigo_deposito,
            dpp.c_codarticulo as codigo_producto,
            p.c_Descri as descripcion_producto,
            p.c_Marca as marca_producto,
            p.n_CostoAct as costo_producto,
            p.n_Precio1 as precio_producto,
            dpp.n_cantidad as stock
        FROM
            VAD10.dbo.MA_DEPOPROD dpp
            LEFT JOIN VAD10.dbo.MA_PRODUCTOS p ON dpp.c_codarticulo = p.c_Codigo
            LEFT JOIN VAD10.dbo.MA_DEPOSITO de ON dpp.c_coddeposito = de.c_coddeposito
        WHERE
            de.c_coddeposito = ?
        ORDER BY
            dpp.id DESC
        """

        cursor.execute(query, TEST_STORE['codigo_deposito'])
        rows = cursor.fetchall()

        if not rows:
            print("⚠️  No data found")
            return False

        print(f"✅ Extracted {len(rows)} rows (sample)")
        print("\n📦 Sample data:")
        print("-" * 80)
        for row in rows:
            print(f"   ID: {row[0]:<8} Código: {row[2]:<15} {row[3][:35]:<35} Stock: {row[7]:>8.2f}")

        # Contar total de registros
        print("\n📊 Counting total records...")
        count_query = f"""
        SELECT COUNT(*) as total
        FROM VAD10.dbo.MA_DEPOPROD dpp
        LEFT JOIN VAD10.dbo.MA_DEPOSITO de ON dpp.c_coddeposito = de.c_coddeposito
        WHERE de.c_coddeposito = ?
        """

        cursor.execute(count_query, TEST_STORE['codigo_deposito'])
        total = cursor.fetchone()[0]
        print(f"✅ Total records available: {total:,}")

        cursor.close()
        conn.close()

        print(f"\n✅ ETL test successful for {TEST_STORE['nombre']}")
        print(f"   Ready to process {total:,} inventory records")
        return True

    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_etl()
    sys.exit(0 if success else 1)
