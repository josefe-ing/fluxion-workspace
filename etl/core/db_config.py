"""
Database Configuration for Fluxion AI
Soporta dual-database mode durante la migración DuckDB → PostgreSQL
"""

import os
from typing import Literal

# Tipo de base de datos a usar
DatabaseType = Literal["duckdb", "postgresql", "dual"]

# Configuración de base de datos (desde variables de entorno)
DB_MODE: DatabaseType = os.getenv("DB_MODE", "postgresql")  # duckdb | postgresql | dual

# DuckDB Configuration - Aligned with ETL config.py
from pathlib import Path
BASE_DIR = Path(__file__).parent.parent.parent
DATABASE_PATH_ENV = os.getenv('DATABASE_PATH')
if DATABASE_PATH_ENV:
    DUCKDB_PATH = DATABASE_PATH_ENV  # Keep as string for psycopg2 compatibility
else:
    DUCKDB_PATH = str(BASE_DIR / "data" / "fluxion_production.db")

# PostgreSQL Configuration
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'localhost')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
POSTGRES_DB = os.getenv('POSTGRES_DB', 'fluxion_production')
POSTGRES_USER = os.getenv('POSTGRES_USER', 'fluxion')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'fluxion_dev_2025')

# Connection string PostgreSQL
POSTGRES_DSN = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"


def get_db_mode() -> DatabaseType:
    """Retorna el modo de base de datos actual"""
    return DB_MODE


def is_duckdb_mode() -> bool:
    """Verifica si está en modo DuckDB (legacy)"""
    return DB_MODE in ("duckdb", "dual")


def is_postgres_mode() -> bool:
    """Verifica si está en modo PostgreSQL"""
    return DB_MODE in ("postgresql", "dual")


def get_primary_db() -> Literal["duckdb", "postgresql"]:
    """
    Retorna la base de datos primaria para queries
    - duckdb: Durante desarrollo inicial y testing
    - dual: DuckDB es primary, PostgreSQL es secondary (para validación) [DEPRECADO]
    - postgresql: PostgreSQL es primary (migración completa)
    """
    if DB_MODE == "postgresql" or DB_MODE == "dual":
        return "postgresql"
    else:  # duckdb
        return "duckdb"
