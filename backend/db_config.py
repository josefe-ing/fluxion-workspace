"""
Database Configuration for Fluxion AI
PostgreSQL only - DuckDB eliminado completamente

Supports Read Replica architecture:
- POSTGRES_HOST: Default host (can be primary or replica)
- POSTGRES_HOST_PRIMARY: Primary for writes (INSERT, UPDATE, DELETE, CREATE)
- Backend uses replica for reads, primary for writes
"""

import os

# PostgreSQL Configuration
# In production: POSTGRES_HOST = replica, POSTGRES_HOST_PRIMARY = primary
# Locally: both point to same localhost
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'localhost')  # Default (replica in prod)
POSTGRES_HOST_PRIMARY = os.getenv('POSTGRES_HOST_PRIMARY', POSTGRES_HOST)  # Primary for writes
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
POSTGRES_DB = os.getenv('POSTGRES_DB', 'fluxion_production')
POSTGRES_USER = os.getenv('POSTGRES_USER', 'fluxion')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'fluxion_dev_2025')

# Connection string PostgreSQL (default - for reads, uses replica in prod)
POSTGRES_DSN = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

# Connection string PostgreSQL PRIMARY (for writes - always uses primary)
POSTGRES_DSN_PRIMARY = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST_PRIMARY}:{POSTGRES_PORT}/{POSTGRES_DB}"

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
