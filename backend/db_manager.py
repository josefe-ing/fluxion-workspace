"""
Dual Database Manager para Fluxion AI
Soporta migración gradual DuckDB → PostgreSQL

Durante la migración, el sistema puede funcionar en 3 modos:
1. duckdb: Solo DuckDB (legacy, default)
2. dual: DuckDB + PostgreSQL en paralelo (para validación)
3. postgresql: Solo PostgreSQL (después de migración completa)
"""

import duckdb
import psycopg2
import psycopg2.extras
import os
from pathlib import Path
from contextlib import contextmanager
from fastapi import HTTPException
from typing import Union, Any, Dict, List, Optional
import logging

from db_config import (
    DB_MODE,
    DUCKDB_PATH,
    POSTGRES_DSN,
    get_db_mode,
    is_duckdb_mode,
    is_postgres_mode,
    get_primary_db
)

logger = logging.getLogger(__name__)


# =============================================================================
# DUCKDB CONNECTIONS (Legacy)
# =============================================================================

@contextmanager
def get_duckdb_connection(read_only: bool = True):
    """
    Context manager para conexiones DuckDB

    Args:
        read_only: Si True, abre en modo read-only (permite múltiples lectores)
    """
    db_path = Path(DUCKDB_PATH)

    if not db_path.exists():
        raise HTTPException(status_code=500, detail=f"DuckDB no encontrada en {db_path}")

    conn = None
    try:
        conn = duckdb.connect(str(db_path), read_only=read_only)
        yield conn
    finally:
        if conn:
            conn.close()


# =============================================================================
# POSTGRESQL CONNECTIONS (New)
# =============================================================================

@contextmanager
def get_postgres_connection():
    """
    Context manager para conexiones PostgreSQL
    Usa connection pooling implícito de psycopg2
    """
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN)
        conn.autocommit = False  # Transacciones explícitas
        yield conn
    except psycopg2.Error as e:
        logger.error(f"PostgreSQL connection error: {e}")
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error conectando a PostgreSQL: {str(e)}")
    finally:
        if conn:
            conn.close()


# =============================================================================
# UNIFIED DATABASE CONNECTION (Abstraction Layer)
# =============================================================================

@contextmanager
def get_db_connection(read_only: bool = True):
    """
    Retorna una conexión a la base de datos primaria según DB_MODE

    - duckdb mode: Retorna DuckDB connection
    - dual mode: Retorna DuckDB connection (DuckDB es primary durante dual-mode)
    - postgresql mode: Retorna PostgreSQL connection

    Args:
        read_only: Para DuckDB, si abrir en modo read-only. Ignorado para PostgreSQL.

    Usage:
        with get_db_connection() as conn:
            cursor = conn.cursor() if is_postgres else conn
            cursor.execute("SELECT * FROM productos")
            results = cursor.fetchall()
    """
    primary_db = get_primary_db()

    if primary_db == "duckdb":
        with get_duckdb_connection(read_only=read_only) as conn:
            yield conn
    else:  # postgresql
        with get_postgres_connection() as conn:
            yield conn


@contextmanager
def get_db_connection_write():
    """
    Retorna una conexión WRITE a la base de datos primaria

    Para migración dual-mode, escribe en AMBAS bases de datos:
    - Primero escribe en PostgreSQL (nueva DB)
    - Luego en DuckDB (legacy, para backward compatibility)

    Usage:
        with get_db_connection_write() as conn:
            # conn es PostgreSQL o DuckDB según modo
            cursor = conn.cursor() if is_postgres_mode() else conn
            cursor.execute("INSERT INTO ubicaciones ...")
            conn.commit()
    """
    primary_db = get_primary_db()

    if primary_db == "duckdb":
        with get_duckdb_connection(read_only=False) as conn:
            yield conn
    else:  # postgresql
        with get_postgres_connection() as conn:
            yield conn


# =============================================================================
# DUAL-MODE HELPERS (Para write operations en ambas DBs)
# =============================================================================

def execute_dual_write(
    duckdb_sql: str,
    postgres_sql: str,
    params: Optional[tuple] = None,
    duckdb_params: Optional[tuple] = None,
    postgres_params: Optional[tuple] = None
):
    """
    Ejecuta un INSERT/UPDATE/DELETE en ambas bases de datos durante dual-mode

    Args:
        duckdb_sql: SQL para DuckDB
        postgres_sql: SQL para PostgreSQL
        params: Parámetros compartidos (si son iguales para ambas DBs)
        duckdb_params: Parámetros específicos para DuckDB
        postgres_params: Parámetros específicos para PostgreSQL

    Returns:
        Dict con resultados de ambas ejecuciones

    Raises:
        Exception si alguna de las dos falla
    """
    if DB_MODE != "dual":
        raise ValueError("execute_dual_write solo funciona en modo 'dual'")

    # Usar parámetros específicos o fallback a params compartidos
    duck_params = duckdb_params if duckdb_params is not None else params
    pg_params = postgres_params if postgres_params is not None else params

    results = {"duckdb": None, "postgresql": None}
    errors = []

    # Ejecutar en PostgreSQL primero (nueva DB tiene prioridad)
    try:
        with get_postgres_connection() as pg_conn:
            cursor = pg_conn.cursor()
            cursor.execute(postgres_sql, pg_params)
            pg_conn.commit()
            results["postgresql"] = {"rowcount": cursor.rowcount, "success": True}
            logger.info(f"✅ PostgreSQL write OK: {cursor.rowcount} rows affected")
    except Exception as e:
        logger.error(f"❌ PostgreSQL write failed: {e}")
        errors.append(("postgresql", str(e)))
        results["postgresql"] = {"error": str(e), "success": False}

    # Ejecutar en DuckDB (para backward compatibility)
    try:
        with get_duckdb_connection(read_only=False) as duck_conn:
            duck_conn.execute(duckdb_sql, duck_params)
            results["duckdb"] = {"success": True}
            logger.info("✅ DuckDB write OK")
    except Exception as e:
        logger.error(f"❌ DuckDB write failed: {e}")
        errors.append(("duckdb", str(e)))
        results["duckdb"] = {"error": str(e), "success": False}

    # Si ambas fallaron, lanzar excepción
    if len(errors) == 2:
        error_msg = "; ".join([f"{db}: {err}" for db, err in errors])
        raise Exception(f"Dual write failed on both databases: {error_msg}")

    # Si solo una falló, logear warning pero no fallar
    if len(errors) == 1:
        db, err = errors[0]
        logger.warning(f"⚠️  Dual write partially failed on {db}: {err}")

    return results


# =============================================================================
# QUERY HELPERS (Cross-database compatibility)
# =============================================================================

def execute_query(sql: str, params: Optional[tuple] = None) -> List[tuple]:
    """
    Ejecuta una query SELECT y retorna resultados
    Funciona con DuckDB o PostgreSQL según el modo

    Args:
        sql: SQL query
        params: Parámetros de la query

    Returns:
        Lista de tuplas con resultados
    """
    with get_db_connection(read_only=True) as conn:
        if is_postgres_mode():
            cursor = conn.cursor()
            cursor.execute(sql, params)
            results = cursor.fetchall()
            cursor.close()
            return results
        else:  # DuckDB
            result = conn.execute(sql, params)
            return result.fetchall()


def execute_query_dict(sql: str, params: Optional[tuple] = None) -> List[Dict[str, Any]]:
    """
    Ejecuta una query SELECT y retorna resultados como lista de dicts

    Args:
        sql: SQL query
        params: Parámetros de la query

    Returns:
        Lista de diccionarios con resultados
    """
    with get_db_connection(read_only=True) as conn:
        if is_postgres_mode():
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute(sql, params)
            results = cursor.fetchall()
            cursor.close()
            return [dict(row) for row in results]
        else:  # DuckDB
            result = conn.execute(sql, params)
            columns = [desc[0] for desc in result.description]
            return [dict(zip(columns, row)) for row in result.fetchall()]


# =============================================================================
# BACKWARD COMPATIBILITY (Para código legacy que usa database.py)
# =============================================================================

# Aliases para compatibilidad con código existente
get_db_connection_read = get_db_connection

# Para facilitar migración gradual
__all__ = [
    'get_db_connection',
    'get_db_connection_read',
    'get_db_connection_write',
    'get_duckdb_connection',
    'get_postgres_connection',
    'execute_dual_write',
    'execute_query',
    'execute_query_dict',
    'get_db_mode',
    'is_duckdb_mode',
    'is_postgres_mode',
    'get_primary_db'
]


# =============================================================================
# AUTO-INITIALIZATION OF ETL TABLES (PostgreSQL Only)
# =============================================================================

def init_etl_tables():
    """
    Crea las tablas necesarias para el ETL de inventario si no existen.
    Se ejecuta automáticamente al importar el módulo en modo PostgreSQL.

    Tablas creadas:
    - ubicaciones: Tiendas y CEDIs
    - productos: Catálogo de productos
    - almacenes: Almacenes por ubicación
    - inventario_actual: Stock actual
    - inventario_historico: Snapshots históricos
    """
    if not is_postgres_mode():
        return

    try:
        with get_postgres_connection() as conn:
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
            # Add codigo_klk column if it doesn't exist (for existing tables)
            cursor.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='ubicaciones' AND column_name='codigo_klk') THEN
                        ALTER TABLE ubicaciones ADD COLUMN codigo_klk VARCHAR(50);
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
            # Add nombre column if it doesn't exist (for existing tables with only descripcion)
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

            logger.info("✅ Tablas ETL verificadas/creadas en PostgreSQL:")
            logger.info("   - ubicaciones, productos, almacenes")
            logger.info("   - inventario_actual, inventario_historico")

    except Exception as e:
        logger.error(f"⚠️ Error inicializando tablas ETL: {e}")


# Ejecutar inicialización al importar el módulo
init_etl_tables()
