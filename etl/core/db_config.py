"""
Database Configuration for Fluxion AI
PostgreSQL only - DuckDB removed (Dec 2025)
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


def is_postgres_mode() -> bool:
    """Always returns True - PostgreSQL only mode"""
    return True


def get_primary_db() -> str:
    """Returns 'postgresql' - the only database mode"""
    return "postgresql"
