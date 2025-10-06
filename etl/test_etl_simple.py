#!/usr/bin/env python3
"""
Test simple de ETL inventario - Una tienda
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

def test_connection():
    """Test básico de conexión SQL"""
    print(f"🧪 Testing connection to {TEST_STORE['nombre']}...")
    print(f"   Server: {TEST_STORE['ip']}:{TEST_STORE['port']}")

    try:
        conn_str = (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={TEST_STORE['ip']},{TEST_STORE['port']};"
            f"DATABASE={TEST_STORE['database']};"
            f"UID={SQL_USER};"
            f"PWD={SQL_PASS};"
            f"TrustServerCertificate=yes;"
        )

        conn = pyodbc.connect(conn_str, timeout=10)
        cursor = conn.cursor()

        # Test query simple
        cursor.execute("SELECT @@VERSION")
        version = cursor.fetchone()[0]
        print(f"✅ Connected! SQL Server version: {version[:50]}...")

        # Query inventario
        query = """
        SELECT TOP 10
            Codigo_Producto,
            Nombre_Producto,
            Existencia,
            Precio_Venta
        FROM V_Inventario
        WHERE Codigo_Deposito = ?
        ORDER BY Existencia DESC
        """

        cursor.execute(query, TEST_STORE['codigo_deposito'])
        rows = cursor.fetchall()

        print(f"\n📦 Sample inventory data (top 10 items):")
        print("-" * 80)
        for row in rows:
            print(f"   {row[0]:20} {row[1][:40]:40} Stock: {row[2]:8.2f} Precio: {row[3]:10.2f}")

        print(f"\n✅ ETL test successful for {TEST_STORE['nombre']}")

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_connection()
    sys.exit(0 if success else 1)
