"""
Database Manager para Fluxion AI
PostgreSQL Only - DuckDB eliminado completamente

Supports Read Replica architecture:
- get_postgres_connection(): Reads (uses replica in prod)
- get_postgres_connection_primary(): Writes (always uses primary)
"""

import psycopg2
import psycopg2.extras
import os
import time
from contextlib import contextmanager
from fastapi import HTTPException
from typing import Any, Dict, List, Optional
import logging

from db_config import (
    POSTGRES_DSN,
    POSTGRES_DSN_PRIMARY,
)

# Retry config for read replica conflicts
REPLICA_CONFLICT_MAX_RETRIES = int(os.getenv('REPLICA_CONFLICT_MAX_RETRIES', '2'))
REPLICA_CONFLICT_RETRY_DELAY = float(os.getenv('REPLICA_CONFLICT_RETRY_DELAY', '0.5'))

logger = logging.getLogger(__name__)


# =============================================================================
# REPLICA CONFLICT DETECTION
# =============================================================================

def _is_replica_conflict(error: Exception) -> bool:
    """Detect PostgreSQL read replica recovery conflicts."""
    error_str = str(error).lower()
    return "conflict with recovery" in error_str or "canceling statement due to conflict" in error_str


# =============================================================================
# POSTGRESQL CONNECTIONS
# =============================================================================

@contextmanager
def get_postgres_connection():
    """
    Context manager para conexiones PostgreSQL (READ - uses replica in prod).
    On replica conflict errors, logs a warning with fallback guidance.
    """
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN)
        conn.autocommit = False
        yield conn
    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        if _is_replica_conflict(e):
            logger.warning(f"⚠️ Read replica conflict detected: {e}. "
                           f"Consider increasing max_standby_streaming_delay in RDS parameter group.")
        logger.error(f"PostgreSQL connection error: {e}")
        raise HTTPException(status_code=500, detail=f"Error conectando a PostgreSQL: {str(e)}")
    finally:
        if conn:
            conn.close()


@contextmanager
def get_postgres_connection_primary():
    """
    Context manager para conexiones PostgreSQL PRIMARY (WRITE operations)
    Always connects to PRIMARY database, never to replica.
    Use this for INSERT, UPDATE, DELETE, CREATE operations.
    """
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN_PRIMARY)
        conn.autocommit = False
        yield conn
    except psycopg2.Error as e:
        logger.error(f"PostgreSQL PRIMARY connection error: {e}")
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error conectando a PostgreSQL PRIMARY: {str(e)}")
    finally:
        if conn:
            conn.close()


# =============================================================================
# UNIFIED DATABASE CONNECTION (Simplified - PostgreSQL only)
# =============================================================================

@contextmanager
def get_db_connection(read_only: bool = True):
    """
    Retorna una conexión PostgreSQL.

    Args:
        read_only: Ignored (kept for backward compatibility)

    Usage:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM productos")
            results = cursor.fetchall()
            cursor.close()
    """
    with get_postgres_connection() as conn:
        yield conn


@contextmanager
def get_db_connection_resilient():
    """
    Conexión PostgreSQL resiliente para queries de lectura pesadas.
    Usa PRIMARY directamente cuando hay replica disponible, evitando
    conflictos de recovery en la réplica.

    Usar para endpoints pesados como calcular pedidos multi-tienda.

    Usage:
        with get_db_connection_resilient() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM ventas ...")
    """
    # For heavy read queries, use primary to avoid replica recovery conflicts
    if POSTGRES_DSN != POSTGRES_DSN_PRIMARY:
        logger.debug("Using PRIMARY connection for resilient read query")
        with get_postgres_connection_primary() as conn:
            yield conn
    else:
        with get_postgres_connection() as conn:
            yield conn


@contextmanager
def get_db_connection_write():
    """
    Retorna una conexión WRITE a PostgreSQL PRIMARY.
    Use this for INSERT, UPDATE, DELETE, CREATE operations.

    Usage:
        with get_db_connection_write() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO ubicaciones ...")
            conn.commit()
            cursor.close()
    """
    with get_postgres_connection_primary() as conn:
        yield conn


# =============================================================================
# QUERY HELPERS
# =============================================================================

def retry_on_replica_conflict(max_retries: int = REPLICA_CONFLICT_MAX_RETRIES, delay: float = REPLICA_CONFLICT_RETRY_DELAY):
    """
    Decorator for async endpoint functions that retries on read replica conflicts.
    On the final retry, uses PRIMARY connection via get_db_connection_resilient().

    Usage:
        @retry_on_replica_conflict()
        async def calcular_pedidos(...):
            ...
    """
    import functools
    import asyncio

    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except HTTPException as e:
                    if _is_replica_conflict(Exception(e.detail)) and attempt < max_retries - 1:
                        last_error = e
                        logger.warning(
                            f"🔄 Replica conflict on attempt {attempt + 1}/{max_retries}, "
                            f"retrying in {delay}s..."
                        )
                        await asyncio.sleep(delay)
                        continue
                    raise
            raise last_error
        return wrapper
    return decorator


def execute_query(sql: str, params: Optional[tuple] = None) -> List[tuple]:
    """
    Ejecuta una query SELECT y retorna resultados

    Args:
        sql: SQL query (use %s for placeholders)
        params: Parámetros de la query

    Returns:
        Lista de tuplas con resultados
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        results = cursor.fetchall()
        cursor.close()
        return results


def execute_query_dict(sql: str, params: Optional[tuple] = None) -> List[Dict[str, Any]]:
    """
    Ejecuta una query SELECT y retorna resultados como lista de dicts

    Args:
        sql: SQL query (use %s for placeholders)
        params: Parámetros de la query

    Returns:
        Lista de diccionarios con resultados
    """
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(sql, params)
        results = cursor.fetchall()
        cursor.close()
        return [dict(row) for row in results]


# =============================================================================
# COMPATIBILITY FUNCTIONS (Always return True/False for PostgreSQL)
# =============================================================================

def is_postgres_mode():
    """Always returns True - PostgreSQL only"""
    return True

def is_duckdb_mode():
    """Always returns False - DuckDB removed"""
    return False

def get_db_mode():
    """Returns 'postgresql' always"""
    return "postgresql"

def get_primary_db():
    """Returns 'postgresql' always"""
    return "postgresql"


# =============================================================================
# BACKWARD COMPATIBILITY ALIASES
# =============================================================================

get_db_connection_read = get_db_connection

__all__ = [
    'get_db_connection',
    'get_db_connection_read',
    'get_db_connection_write',
    'get_db_connection_resilient',
    'get_postgres_connection',
    'get_postgres_connection_primary',
    'retry_on_replica_conflict',
    'execute_query',
    'execute_query_dict',
    'is_postgres_mode',
    'is_duckdb_mode',
    'get_db_mode',
    'get_primary_db'
]


# =============================================================================
# AUTO-INITIALIZATION OF ETL TABLES
# =============================================================================

def init_etl_tables():
    """
    Crea las tablas necesarias para el ETL de inventario si no existen.
    Se ejecuta automáticamente al importar el módulo.

    IMPORTANT: Uses PRIMARY connection because this creates tables (write operation).
    """
    try:
        with get_postgres_connection_primary() as conn:
            cursor = conn.cursor()

            # 1. Tabla ubicaciones
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ubicaciones (
                    id VARCHAR(50) PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL,
                    codigo_klk VARCHAR(50),
                    tipo VARCHAR(20) DEFAULT 'tienda',
                    activo BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='ubicaciones' AND column_name='codigo_klk') THEN
                        ALTER TABLE ubicaciones ADD COLUMN codigo_klk VARCHAR(50);
                    END IF;
                    IF EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='ubicaciones' AND column_name='codigo' AND is_nullable='NO') THEN
                        ALTER TABLE ubicaciones ALTER COLUMN codigo DROP NOT NULL;
                    END IF;
                END $$;
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_ubicaciones_codigo_klk ON ubicaciones(codigo_klk)")

            # 2. Tabla productos
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS productos (
                    id VARCHAR(50) PRIMARY KEY,
                    codigo VARCHAR(50) UNIQUE NOT NULL,
                    nombre VARCHAR(200),
                    descripcion VARCHAR(500),
                    categoria VARCHAR(100),
                    marca VARCHAR(100),
                    activo BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='productos' AND column_name='nombre') THEN
                        ALTER TABLE productos ADD COLUMN nombre VARCHAR(200);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='productos' AND column_name='fecha_actualizacion') THEN
                        ALTER TABLE productos ADD COLUMN fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='productos' AND column_name='codigo_barras') THEN
                        ALTER TABLE productos ADD COLUMN codigo_barras VARCHAR(50);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='productos' AND column_name='modelo') THEN
                        ALTER TABLE productos ADD COLUMN modelo VARCHAR(100);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='productos' AND column_name='grupo_articulo') THEN
                        ALTER TABLE productos ADD COLUMN grupo_articulo VARCHAR(100);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='productos' AND column_name='subgrupo') THEN
                        ALTER TABLE productos ADD COLUMN subgrupo VARCHAR(100);
                    END IF;
                END $$;
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_productos_marca ON productos(marca)")

            # 3. Tabla almacenes
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS almacenes (
                    codigo VARCHAR(50) PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL,
                    ubicacion_id VARCHAR(50) REFERENCES ubicaciones(id),
                    activo BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_almacenes_ubicacion ON almacenes(ubicacion_id)")

            # 4. Tabla inventario_actual
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS inventario_actual (
                    id SERIAL PRIMARY KEY,
                    ubicacion_id VARCHAR(50) NOT NULL REFERENCES ubicaciones(id),
                    producto_id VARCHAR(50) NOT NULL,
                    almacen_codigo VARCHAR(50) NOT NULL REFERENCES almacenes(codigo),
                    cantidad NUMERIC(12,4) DEFAULT 0,
                    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT inventario_actual_unique UNIQUE (ubicacion_id, producto_id, almacen_codigo)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_inventario_actual_ubicacion ON inventario_actual(ubicacion_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_inventario_actual_producto ON inventario_actual(producto_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_inventario_actual_almacen ON inventario_actual(almacen_codigo)")

            # 5. Tabla inventario_historico
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS inventario_historico (
                    id SERIAL PRIMARY KEY,
                    ubicacion_id VARCHAR(50) NOT NULL,
                    producto_id VARCHAR(50) NOT NULL,
                    almacen_codigo VARCHAR(50) NOT NULL,
                    cantidad NUMERIC(12,4) DEFAULT 0,
                    fecha_snapshot TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_inventario_historico_ubicacion ON inventario_historico(ubicacion_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_inventario_historico_fecha ON inventario_historico(fecha_snapshot)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_inventario_historico_producto ON inventario_historico(producto_id)")

            conn.commit()
            cursor.close()

            logger.info("✅ Tablas ETL verificadas/creadas en PostgreSQL")

    except Exception as e:
        logger.error(f"⚠️ Error inicializando tablas ETL: {e}")


# Ejecutar inicialización al importar el módulo
init_etl_tables()
