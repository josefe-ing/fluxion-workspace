#!/usr/bin/env python3
"""
Script de configuración del sistema ETL
Configura credenciales, prueba conexiones y prepara el entorno
"""

import os
import sys
from pathlib import Path
import getpass
import json
from datetime import datetime

def create_env_file():
    """Crea archivo .env con credenciales"""

    print("🔐 CONFIGURACIÓN DE CREDENCIALES SQL SERVER")
    print("=" * 50)

    env_file = Path(__file__).parent / ".env"

    if env_file.exists():
        print(f"⚠️  Archivo .env ya existe en {env_file}")
        overwrite = input("¿Sobrescribir? (s/N): ").lower().strip()
        if overwrite != 's':
            print("❌ Configuración cancelada")
            return False

    # Solicitar credenciales
    print("Ingresa las credenciales para SQL Server:")
    sql_user = input("Usuario SQL Server: ").strip()

    if not sql_user:
        print("❌ Usuario es requerido")
        return False

    sql_pass = getpass.getpass("Contraseña SQL Server: ").strip()

    if not sql_pass:
        print("❌ Contraseña es requerida")
        return False

    # VPN check (opcional)
    vpn_connected = input("¿Estás conectado a la VPN? (S/n): ").lower().strip()
    vpn_status = vpn_connected in ['', 's', 'si', 'yes', 'y']

    # Configuraciones adicionales
    log_level = input("Nivel de log (INFO/DEBUG/ERROR) [INFO]: ").strip().upper() or "INFO"
    max_retries = input("Máximo reintentos por ubicación [3]: ").strip() or "3"

    # Crear contenido .env
    env_content = f"""# Configuración ETL - La Granja Mercado
# Generado el: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

# Credenciales SQL Server
SQL_USER={sql_user}
SQL_PASS={sql_pass}

# Configuración VPN
VPN_CONNECTED={str(vpn_status).lower()}

# Configuración de logging
LOG_LEVEL={log_level}

# Configuración de reintentos
MAX_RETRY_ATTEMPTS={max_retries}
RETRY_DELAY_SECONDS=5

# Configuración de batch
DEFAULT_BATCH_SIZE=1000
TIMEOUT_SECONDS=30

# Configuración de notificaciones (opcional)
# WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
# EMAIL_ALERTS=admin@tuempresa.com
"""

    try:
        with open(env_file, 'w') as f:
            f.write(env_content)

        # Cambiar permisos para mayor seguridad
        os.chmod(env_file, 0o600)

        print(f"✅ Archivo .env creado en: {env_file}")
        print("🔒 Permisos de seguridad aplicados (600)")
        return True

    except Exception as e:
        print(f"❌ Error creando archivo .env: {str(e)}")
        return False

def update_database_config():
    """Actualiza configuraciones de base de datos con IPs reales"""

    print("\n🏪 CONFIGURACIÓN DE UBICACIONES")
    print("=" * 50)

    config_file = Path(__file__).parent / "database_config.json"

    # Template de configuración
    template_config = {
        "cedis": [
            {
                "ubicacion_id": "cedi_01",
                "ubicacion_nombre": "CEDI Inventario Mayor",
                "tipo": "cedi",
                "server_ip": "",
                "database_name": "CEDI_VALENCIA",
                "prioridad": 1,
                "timeout_seconds": 60,
                "activo": True
            },
            {
                "ubicacion_id": "cedi_02",
                "ubicacion_nombre": "CEDI Norte",
                "tipo": "cedi",
                "server_ip": "",
                "database_name": "CEDI_NORTE",
                "prioridad": 1,
                "timeout_seconds": 60,
                "activo": True
            },
            {
                "ubicacion_id": "cedi_03",
                "ubicacion_nombre": "CEDI Sur",
                "tipo": "cedi",
                "server_ip": "",
                "database_name": "CEDI_SUR",
                "prioridad": 1,
                "timeout_seconds": 60,
                "activo": True
            }
        ],
        "tiendas_principales": [
            {
                "ubicacion_id": "tienda_01",
                "ubicacion_nombre": "El Bosque",
                "tipo": "tienda",
                "server_ip": "",
                "database_name": "TIENDA_BOSQUE",
                "prioridad": 2,
                "timeout_seconds": 30,
                "activo": True
            },
            {
                "ubicacion_id": "tienda_04",
                "ubicacion_nombre": "Aranzazu Mayorista",
                "tipo": "tienda",
                "server_ip": "",
                "database_name": "TIENDA_ARANZAZU_MAY",
                "prioridad": 2,
                "timeout_seconds": 30,
                "activo": True
            },
            {
                "ubicacion_id": "tienda_12",
                "ubicacion_nombre": "Centro Valencia",
                "tipo": "tienda",
                "server_ip": "",
                "database_name": "TIENDA_CENTRO",
                "prioridad": 2,
                "timeout_seconds": 30,
                "activo": True
            }
        ]
    }

    print("💡 Se creará un archivo de configuración de base de datos template")
    print("   Deberás completar las IPs reales de tus servidores")
    print()

    create_template = input("¿Crear template de configuración? (S/n): ").lower().strip()

    if create_template not in ['', 's', 'si', 'yes', 'y']:
        print("❌ Configuración de base de datos omitida")
        return False

    try:
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(template_config, f, indent=2, ensure_ascii=False)

        print(f"✅ Template de configuración creado en: {config_file}")
        print()
        print("📝 SIGUIENTE PASO:")
        print(f"   1. Edita el archivo: {config_file}")
        print("   2. Completa las IPs reales de tus servidores SQL Server")
        print("   3. Actualiza los nombres de base de datos si es necesario")
        print("   4. Ejecuta: python setup_etl.py --test-connections")

        return True

    except Exception as e:
        print(f"❌ Error creando configuración: {str(e)}")
        return False

def create_sample_query():
    """Crea un query de ejemplo personalizable"""

    print("\n📝 QUERY DE INVENTARIO PERSONALIZADO")
    print("=" * 50)

    query_file = Path(__file__).parent / "inventory_query.sql"

    sample_query = """-- Query de inventario personalizado para La Granja Mercado
-- Modifica según tu esquema de base de datos real

SELECT
    -- Identificación del producto
    p.codigo_producto,
    p.codigo_barras,
    p.descripcion AS descripcion_producto,
    p.categoria,
    p.subcategoria,
    p.marca,
    p.presentacion,

    -- Stock actual
    ISNULL(i.cantidad_actual, 0) AS cantidad_actual,
    ISNULL(i.cantidad_disponible, 0) AS cantidad_disponible,
    ISNULL(i.cantidad_reservada, 0) AS cantidad_reservada,
    ISNULL(i.cantidad_en_transito, 0) AS cantidad_en_transito,

    -- Costos y valores
    p.costo_unitario AS costo_unitario_actual,
    p.precio_venta AS precio_venta_actual,
    (ISNULL(i.cantidad_actual, 0) * p.costo_unitario) AS valor_inventario_actual,

    -- Control de stock
    p.stock_minimo,
    p.stock_maximo,
    p.punto_reorden,

    -- Fechas (ajustar nombres según tu esquema)
    i.fecha_ultima_entrada,
    i.fecha_ultima_salida,
    i.fecha_ultimo_conteo,

    -- Ubicación física (opcional)
    uf.ubicacion_fisica,
    uf.pasillo,
    uf.estante,

    -- Control
    p.activo,
    p.es_perecedero,
    p.dias_vencimiento,

    -- Timestamp del sistema
    GETDATE() AS fecha_sistema

FROM productos p
    LEFT JOIN inventario i ON p.id_producto = i.producto_id
    LEFT JOIN ubicaciones_fisicas uf ON i.ubicacion_fisica_id = uf.id

WHERE p.activo = 1
    AND p.categoria IS NOT NULL
    AND p.codigo_producto IS NOT NULL

ORDER BY p.categoria, p.descripcion
"""

    create_query = input("¿Crear query de ejemplo personalizable? (S/n): ").lower().strip()

    if create_query not in ['', 's', 'si', 'yes', 'y']:
        print("❌ Query de ejemplo omitido")
        return False

    try:
        with open(query_file, 'w', encoding='utf-8') as f:
            f.write(sample_query)

        print(f"✅ Query de ejemplo creado en: {query_file}")
        print()
        print("📝 PERSONALIZACIÓN REQUERIDA:")
        print("   1. Ajusta los nombres de tablas según tu esquema")
        print("   2. Modifica los nombres de columnas")
        print("   3. Agrega/elimina campos según necesites")
        print("   4. Prueba el query en SQL Server Management Studio")

        return True

    except Exception as e:
        print(f"❌ Error creando query: {str(e)}")
        return False

def test_basic_setup():
    """Prueba la configuración básica del ETL"""

    print("\n🧪 PRUEBA DE CONFIGURACIÓN BÁSICA")
    print("=" * 50)

    try:
        # Verificar importaciones
        print("📦 Verificando dependencias...")

        try:
            import pyodbc
            print("   ✅ pyodbc (SQL Server)")
        except ImportError:
            print("   ❌ pyodbc no instalado - ejecuta: pip install pyodbc")
            return False

        try:
            import duckdb
            print("   ✅ duckdb")
        except ImportError:
            print("   ❌ duckdb no instalado - ejecuta: pip install duckdb")
            return False

        try:
            import pandas
            print("   ✅ pandas")
        except ImportError:
            print("   ❌ pandas no instalado - ejecuta: pip install pandas")
            return False

        # Verificar archivos de configuración
        print("\n📁 Verificando archivos de configuración...")

        env_file = Path(__file__).parent / ".env"
        if env_file.exists():
            print("   ✅ .env encontrado")
        else:
            print("   ❌ .env no encontrado - ejecuta la configuración de credenciales")

        config_file = Path(__file__).parent / "database_config.json"
        if config_file.exists():
            print("   ✅ database_config.json encontrado")
        else:
            print("   ⚠️  database_config.json no encontrado - se usará configuración por defecto")

        # Verificar DuckDB
        print("\n🦆 Verificando DuckDB...")
        duckdb_path = Path(__file__).parent.parent / "data" / "fluxion_production.db"

        if duckdb_path.exists():
            conn = duckdb.connect(str(duckdb_path))
            result = conn.execute("SELECT COUNT(*) FROM ubicaciones").fetchone()
            conn.close()
            print(f"   ✅ DuckDB conectado - {result[0]} ubicaciones")
        else:
            print(f"   ❌ DuckDB no encontrado en {duckdb_path}")
            print("        Ejecuta primero: cd database && python3 init_db.py")
            return False

        print("\n✅ Configuración básica correcta")
        return True

    except Exception as e:
        print(f"❌ Error en prueba básica: {str(e)}")
        return False

def main():
    """Función principal de configuración"""

    if len(sys.argv) > 1 and sys.argv[1] == "--test-basic":
        test_basic_setup()
        return

    print("🚀 CONFIGURACIÓN INICIAL DEL SISTEMA ETL")
    print("  La Granja Mercado - Sistema de Inventarios")
    print("=" * 60)

    steps_completed = 0
    total_steps = 4

    # Paso 1: Credenciales
    print(f"\n[1/{total_steps}] Configurando credenciales...")
    if create_env_file():
        steps_completed += 1

    # Paso 2: Base de datos
    print(f"\n[2/{total_steps}] Configurando ubicaciones de base de datos...")
    if update_database_config():
        steps_completed += 1

    # Paso 3: Query personalizado
    print(f"\n[3/{total_steps}] Creando query personalizable...")
    if create_sample_query():
        steps_completed += 1

    # Paso 4: Prueba básica
    print(f"\n[4/{total_steps}] Probando configuración...")
    if test_basic_setup():
        steps_completed += 1

    # Resumen final
    print(f"\n📊 CONFIGURACIÓN COMPLETADA")
    print("=" * 60)
    print(f"✅ Pasos completados: {steps_completed}/{total_steps}")

    if steps_completed == total_steps:
        print("🎉 ¡Sistema ETL listo para usar!")
        print()
        print("🚀 PRÓXIMOS PASOS:")
        print("1. Completa las IPs en database_config.json")
        print("2. Personaliza inventory_query.sql")
        print("3. Ejecuta: python3 etl_orchestrator.py --action test-connections")
        print("4. Si las conexiones funcionan, ejecuta: python3 etl_orchestrator.py --action etl-priority")
    else:
        print("⚠️  Algunos pasos fallaron. Revisa los errores arriba.")

if __name__ == "__main__":
    main()