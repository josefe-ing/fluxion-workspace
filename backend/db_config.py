"""
Database Configuration for Fluxion AI
PostgreSQL only - DuckDB eliminado completamente
"""

import os

# PostgreSQL Configuration
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'localhost')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
POSTGRES_DB = os.getenv('POSTGRES_DB', 'fluxion_production')
POSTGRES_USER = os.getenv('POSTGRES_USER', 'fluxion')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'fluxion_dev_2025')

# Connection string PostgreSQL
POSTGRES_DSN = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

# DB_MODE always postgresql (no more DuckDB)
DB_MODE = "postgresql"

# DuckDB path (dummy, no se usa pero algunos imports lo esperan)
DUCKDB_PATH = None

# Helper functions (compatibilidad con código legacy)
def get_db_mode():
    """Returns 'postgresql' always"""
    return "postgresql"

def is_postgres_mode():
    """Always returns True"""
    return True

def is_duckdb_mode():
    """Always returns False"""
    return False

def get_primary_db():
    """Returns 'postgresql' always"""
    return "postgresql"
