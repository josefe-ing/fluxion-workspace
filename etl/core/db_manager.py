"""
Database Manager para Fluxion AI
PostgreSQL only - DuckDB removed (Dec 2025)
"""

import psycopg2
import psycopg2.extras
import logging
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from db_config import POSTGRES_DSN

logger = logging.getLogger(__name__)


class DatabaseError(Exception):
    """Database error compatible with ETL and FastAPI"""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


@contextmanager
def get_postgres_connection():
    """
    Context manager for PostgreSQL connections
    """
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN)
        conn.autocommit = False
        yield conn
    except psycopg2.Error as e:
        logger.error(f"PostgreSQL connection error: {e}")
        if conn:
            conn.rollback()
        raise DatabaseError(f"Error connecting to PostgreSQL: {str(e)}", status_code=500)
    finally:
        if conn:
            conn.close()


@contextmanager
def get_db_connection(read_only: bool = True):
    """
    Returns a PostgreSQL connection.
    read_only parameter kept for backward compatibility but ignored.
    """
    with get_postgres_connection() as conn:
        yield conn


@contextmanager
def get_db_connection_write():
    """
    Returns a write connection to PostgreSQL
    """
    with get_postgres_connection() as conn:
        yield conn


def execute_query(sql: str, params: Optional[tuple] = None) -> List[tuple]:
    """
    Execute a SELECT query and return results
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        results = cursor.fetchall()
        cursor.close()
        return results


def execute_query_dict(sql: str, params: Optional[tuple] = None) -> List[Dict[str, Any]]:
    """
    Execute a SELECT query and return results as list of dicts
    """
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(sql, params)
        results = cursor.fetchall()
        cursor.close()
        return [dict(row) for row in results]


def is_postgres_mode() -> bool:
    """Always returns True - PostgreSQL only mode"""
    return True


def get_primary_db() -> str:
    """Returns 'postgresql' - the only database mode"""
    return "postgresql"


# Backward compatibility aliases
get_db_connection_read = get_db_connection

__all__ = [
    'get_db_connection',
    'get_db_connection_read',
    'get_db_connection_write',
    'get_postgres_connection',
    'execute_query',
    'execute_query_dict',
    'is_postgres_mode',
    'get_primary_db',
    'DatabaseError'
]
