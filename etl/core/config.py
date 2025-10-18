#!/usr/bin/env python3
"""
Configuración del sistema ETL para La Granja Mercado
Manejo de conexiones SQL Server por ubicación
"""

import os
from typing import Dict, List
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

# Cargar variables de entorno desde .env
load_dotenv()

@dataclass
class DatabaseConfig:
    """Configuración de conexión para cada ubicación"""
    ubicacion_id: str
    ubicacion_nombre: str
    tipo: str  # 'tienda' | 'cedi'

    # Conexión SQL Server
    server_ip: str
    database_name: str
    username: str
    password: str
    port: int = 1433

    # Configuración ETL
    activo: bool = True
    prioridad: int = 1  # 1=alta, 2=media, 3=baja
    timeout_seconds: int = 90  # Aumentado de 30 a 90 segundos para conexiones via WireGuard
    max_reintentos: int = 3

class ETLConfig:
    """Configuración principal del ETL"""

    # Directorio base (workspace raíz, no etl/)
    BASE_DIR = Path(__file__).parent.parent.parent

    # Base de datos destino (DuckDB) - puede ser sobreescrito por DATABASE_PATH env var
    DATABASE_PATH_ENV = os.environ.get('DATABASE_PATH')
    if DATABASE_PATH_ENV:
        DUCKDB_PATH = Path(DATABASE_PATH_ENV)
    else:
        DUCKDB_PATH = BASE_DIR / "data" / "fluxion_production.db"

    # Logs del ETL - usar /app/logs en Docker, etl/logs localmente
    LOG_DIR_ENV = os.environ.get('LOG_DIR')
    if LOG_DIR_ENV:
        LOG_DIR = Path(LOG_DIR_ENV)
    elif Path('/app/logs').exists():
        # Running in Docker container
        LOG_DIR = Path('/app/logs')
    else:
        # Running locally
        LOG_DIR = BASE_DIR / "etl" / "logs"

    LOG_DIR.mkdir(parents=True, exist_ok=True)

    # Configuraciones de conexión por ubicación
    # NOTA: Estas configuraciones deberán ser actualizadas con los datos reales
    DATABASES: Dict[str, DatabaseConfig] = {

        # CEDIs - Prioridad Alta
        "cedi_01": DatabaseConfig(
            ubicacion_id="cedi_01",
            ubicacion_nombre="CEDI Inventario Mayor",
            tipo="cedi",
            server_ip="192.168.1.10",  # IP ejemplo
            database_name="CEDI_VALENCIA",
            username=os.getenv("SQL_USER", "etl_user"),
            password=os.getenv("SQL_PASS", "password"),
            prioridad=1,
            timeout_seconds=60
        ),

        "cedi_02": DatabaseConfig(
            ubicacion_id="cedi_02",
            ubicacion_nombre="CEDI Norte",
            tipo="cedi",
            server_ip="192.168.2.10",  # IP ejemplo
            database_name="CEDI_NORTE",
            username=os.getenv("SQL_USER", "etl_user"),
            password=os.getenv("SQL_PASS", "password"),
            prioridad=1,
            timeout_seconds=60
        ),

        "cedi_03": DatabaseConfig(
            ubicacion_id="cedi_03",
            ubicacion_nombre="CEDI Sur",
            tipo="cedi",
            server_ip="192.168.3.10",  # IP ejemplo
            database_name="CEDI_SUR",
            username=os.getenv("SQL_USER", "etl_user"),
            password=os.getenv("SQL_PASS", "password"),
            prioridad=1,
            timeout_seconds=60
        ),

        # Tiendas Principales - Prioridad Media
        "tienda_01": DatabaseConfig(
            ubicacion_id="tienda_01",
            ubicacion_nombre="El Bosque",
            tipo="tienda",
            server_ip="192.168.150.10",  # IP real El Bosque
            database_name="VAD10",  # Nombre real BD
            username=os.getenv("SQL_USER", "beliveryApp"),
            password=os.getenv("SQL_PASS", "AxPG_25!"),
            port=14348,  # Puerto específico
            prioridad=1,  # Alta prioridad para testing
            timeout_seconds=30
        ),

        "tienda_04": DatabaseConfig(
            ubicacion_id="tienda_04",
            ubicacion_nombre="Aranzazu Mayorista",
            tipo="tienda",
            server_ip="192.168.10.14",  # IP ejemplo
            database_name="TIENDA_ARANZAZU_MAY",
            username=os.getenv("SQL_USER", "etl_user"),
            password=os.getenv("SQL_PASS", "password"),
            prioridad=2
        ),

        "tienda_12": DatabaseConfig(
            ubicacion_id="tienda_12",
            ubicacion_nombre="Centro Valencia",
            tipo="tienda",
            server_ip="192.168.10.22",  # IP ejemplo
            database_name="TIENDA_CENTRO",
            username=os.getenv("SQL_USER", "etl_user"),
            password=os.getenv("SQL_PASS", "password"),
            prioridad=2
        ),

        # Resto de tiendas se pueden agregar gradualmente
    }

    # Configuración de frecuencias
    SCHEDULE_CONFIG = {
        "inventario": {
            "cedis": "*/30 * * * *",      # Cada 30 minutos
            "tiendas": "0 */2 * * *",     # Cada 2 horas
            "tiendas_prioritarias": "*/45 * * * *"  # Cada 45 minutos
        },
        "ventas": {
            "cedis": "*/15 * * * *",      # Cada 15 minutos
            "tiendas": "*/30 * * * *",    # Cada 30 minutos
        }
    }

    # Configuración de conexión DuckDB
    DUCKDB_CONFIG = {
        "max_connections": 10,
        "timeout_seconds": 30,
        "auto_vacuum": True
    }

    @classmethod
    def get_active_databases(cls, tipo: str = None) -> List[DatabaseConfig]:
        """Obtiene las bases de datos activas, opcionalmente filtradas por tipo"""
        databases = [db for db in cls.DATABASES.values() if db.activo]

        if tipo:
            databases = [db for db in databases if db.tipo == tipo]

        # Ordenar por prioridad
        return sorted(databases, key=lambda x: x.prioridad)

    @classmethod
    def get_database_config(cls, ubicacion_id: str) -> DatabaseConfig:
        """Obtiene la configuración de una ubicación específica"""
        if ubicacion_id not in cls.DATABASES:
            raise ValueError(f"Ubicación {ubicacion_id} no configurada")

        return cls.DATABASES[ubicacion_id]

    @classmethod
    def add_database_config(cls, config: DatabaseConfig):
        """Agrega una nueva configuración de base de datos"""
        cls.DATABASES[config.ubicacion_id] = config

# Variables de entorno requeridas
REQUIRED_ENV_VARS = [
    "SQL_USER",      # Usuario SQL Server
    "SQL_PASS",      # Contraseña SQL Server
    "VPN_CONNECTED", # Indicador de conexión VPN (opcional)
]

def validate_environment():
    """Valida que las variables de entorno estén configuradas"""
    missing = []
    for var in REQUIRED_ENV_VARS:
        if not os.getenv(var) and var != "VPN_CONNECTED":
            missing.append(var)

    if missing:
        raise EnvironmentError(f"Variables de entorno faltantes: {missing}")

    return True

def create_env_template():
    """Crea un template de variables de entorno"""
    template = """# Variables de entorno para ETL - La Granja Mercado
# Copiar a .env y completar con valores reales

# Credenciales SQL Server
SQL_USER=tu_usuario_sql
SQL_PASS=tu_password_sql

# Conexión VPN (opcional)
VPN_CONNECTED=true

# Configuración de logs
LOG_LEVEL=INFO

# Configuración de reintentos
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY_SECONDS=5
"""

    env_file = Path(__file__).parent / ".env.template"
    with open(env_file, 'w') as f:
        f.write(template)

    print(f"📋 Template de variables de entorno creado en: {env_file}")
    print("💡 Copia el archivo a .env y completa con tus credenciales")

if __name__ == "__main__":
    # Crear template de configuración
    create_env_template()

    # Mostrar configuraciones disponibles
    print("\n🏪 CONFIGURACIONES DE UBICACIONES DISPONIBLES:")
    print("=" * 60)

    for tipo in ["cedi", "tienda"]:
        configs = ETLConfig.get_active_databases(tipo)
        print(f"\n{tipo.upper()}S ({len(configs)}):")

        for config in configs:
            print(f"  📍 {config.ubicacion_nombre}")
            print(f"      ID: {config.ubicacion_id}")
            print(f"      IP: {config.server_ip}")
            print(f"      BD: {config.database_name}")
            print(f"      Prioridad: {config.prioridad}")
            print()

    print(f"📊 Total configuraciones: {len(ETLConfig.DATABASES)}")
    print(f"🎯 DuckDB destino: {ETLConfig.DUCKDB_PATH}")