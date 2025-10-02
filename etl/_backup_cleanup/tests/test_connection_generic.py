#!/usr/bin/env python3
"""
Prueba de conexión genérica y creación del archivo de configuración final
"""

import pyodbc
import os

def list_available_drivers():
    """Lista los drivers ODBC disponibles"""
    print("🔍 DRIVERS ODBC DISPONIBLES:")
    print("=" * 40)

    drivers = pyodbc.drivers()
    if drivers:
        for i, driver in enumerate(drivers, 1):
            print(f"   {i}. {driver}")
    else:
        print("   ❌ No se encontraron drivers ODBC")

    return drivers

def test_basic_connection():
    """Prueba una conexión básica usando drivers disponibles"""

    drivers = list_available_drivers()

    if not drivers:
        print("\n❌ No hay drivers ODBC disponibles")
        print("💡 Instala Microsoft ODBC Driver 17 para SQL Server")
        return False

    # Buscar driver SQL Server
    sql_server_drivers = [d for d in drivers if 'SQL Server' in d or 'ODBC Driver' in d]

    if sql_server_drivers:
        driver = sql_server_drivers[0]
        print(f"\n🎯 Usando driver: {driver}")

        connection_string = (
            f"DRIVER={{{driver}}};"
            f"SERVER=192.168.150.10,14348;"
            f"DATABASE=VAD10;"
            f"UID=beliveryApp;"
            f"PWD=AxPG_25!;"
            f"TrustServerCertificate=yes;"
        )

        try:
            print("🔌 Intentando conexión...")
            conn = pyodbc.connect(connection_string, timeout=10)

            # Test query simple
            cursor = conn.cursor()
            cursor.execute("SELECT 'Conexión exitosa' as mensaje, GETDATE() as fecha")
            result = cursor.fetchone()

            print(f"✅ {result[0]} - {result[1]}")

            # Query de conteo de productos
            cursor.execute("""
                SELECT COUNT(*) as total_productos
                FROM MA_PRODUCTOS
                WHERE n_Activo = 1
            """)
            count = cursor.fetchone()
            print(f"📦 Productos activos en BD: {count[0]:,}")

            conn.close()
            return True

        except pyodbc.Error as e:
            print(f"❌ Error SQL: {str(e)}")
            return False
        except Exception as e:
            print(f"❌ Error general: {str(e)}")
            return False

    else:
        print("\n❌ No se encontró driver compatible con SQL Server")
        return False

def create_final_config():
    """Crea la configuración final para El Bosque"""

    config_content = f'''# Configuración ETL - La Granja Mercado - El Bosque
# Generado automáticamente

# Credenciales SQL Server
SQL_USER=beliveryApp
SQL_PASS=AxPG_25!

# Configuración VPN
VPN_CONNECTED=true

# Configuración de logging
LOG_LEVEL=INFO
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY_SECONDS=5

# Configuración específica El Bosque
EL_BOSQUE_SERVER=192.168.150.10
EL_BOSQUE_PORT=14348
EL_BOSQUE_DATABASE=VAD10
EL_BOSQUE_DEPOSITO=0802

# Configuración de batch
DEFAULT_BATCH_SIZE=1000
TIMEOUT_SECONDS=30
'''

    env_file = "/Users/jose/Developer/fluxion-workspace/etl/.env"

    with open(env_file, 'w') as f:
        f.write(config_content)

    # Cambiar permisos
    os.chmod(env_file, 0o600)

    print(f"✅ Archivo .env creado: {env_file}")

def main():
    """Función principal"""

    print("🧪 DIAGNÓSTICO DE CONEXIÓN SQL SERVER")
    print("====================================")

    # Listar drivers
    drivers = list_available_drivers()

    if drivers:
        # Intentar conexión
        print(f"\n🔌 PROBANDO CONEXIÓN A EL BOSQUE")
        print("-" * 40)

        success = test_basic_connection()

        if success:
            print(f"\n🎉 ¡CONEXIÓN EXITOSA!")
            print("✅ El sistema puede conectarse a El Bosque")

            # Crear configuración
            create_final_config()

            print(f"\n🚀 PRÓXIMOS PASOS:")
            print("1. El ETL puede ejecutarse con datos reales")
            print("2. Ejecuta: python3 el_bosque_config.py")
            print("3. Si funciona, ejecuta el ETL completo:")
            print("   python3 etl_orchestrator.py --action etl --ubicaciones tienda_01")

        else:
            print(f"\n❌ CONEXIÓN FALLÓ")
            print("🔧 Posibles soluciones:")
            print("1. Verificar que estés conectado a la VPN")
            print("2. Verificar credenciales y configuración de red")
            print("3. Instalar Microsoft ODBC Driver 17:")
            print("   brew install microsoft/mssql-release/msodbcsql17")

    else:
        print(f"\n❌ PROBLEMA CON DRIVERS ODBC")
        print("🔧 Solución:")
        print("1. Instalar unixODBC: brew install unixodbc")
        print("2. Instalar MS ODBC Driver: brew install microsoft/mssql-release/msodbcsql17")

if __name__ == "__main__":
    main()