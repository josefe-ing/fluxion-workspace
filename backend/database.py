"""
Database connection utilities for Fluxion AI
Provides context managers for DuckDB connections
"""

import duckdb
import os
from pathlib import Path
from contextlib import contextmanager
from fastapi import HTTPException

# Configuración de la base de datos
DB_PATH = Path(os.getenv('DATABASE_PATH', str(Path(__file__).parent.parent / "data" / "fluxion_production.db")))


@contextmanager
def get_db_connection():
    """
    Context manager para conexiones DuckDB READ-ONLY (para queries de lectura)
    Permite múltiples lectores simultáneos y no bloquea ETL
    """
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Base de datos no encontrada")

    conn = None
    try:
        # Conexión read-only: permite múltiples lectores y no bloquea ETL
        conn = duckdb.connect(str(DB_PATH), read_only=True)
        yield conn
    finally:
        if conn:
            conn.close()


@contextmanager
def get_db_connection_write():
    """
    Context manager para conexiones DuckDB READ-WRITE (para escrituras)
    Solo usar cuando realmente necesites INSERT/UPDATE/DELETE
    """
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Base de datos no encontrada")

    conn = None
    try:
        # Conexión read-write: solo para operaciones de escritura
        conn = duckdb.connect(str(DB_PATH), read_only=False)
        yield conn
    finally:
        if conn:
            conn.close()
