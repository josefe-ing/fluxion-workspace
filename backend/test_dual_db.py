#!/usr/bin/env python3
"""
Test script para verificar dual-database mode
Prueba conexiones a DuckDB y PostgreSQL
"""

import os
import sys
from pathlib import Path

# Set DB_MODE para testing
os.environ['DB_MODE'] = 'duckdb'  # Cambiar a 'dual' o 'postgresql' para probar otros modos
os.environ['DATABASE_PATH'] = str(Path(__file__).parent.parent / "data" / "fluxion_production.db")

# Import después de configurar env vars
from db_config import get_db_mode, is_duckdb_mode, is_postgres_mode, get_primary_db
from db_manager import (
    get_db_connection,
    get_duckdb_connection,
    get_postgres_connection,
    execute_query,
    execute_query_dict
)

def test_config():
    """Prueba configuración de DB"""
    print("=" * 60)
    print("TEST 1: Database Configuration")
    print("=" * 60)
    print(f"DB_MODE: {get_db_mode()}")
    print(f"is_duckdb_mode(): {is_duckdb_mode()}")
    print(f"is_postgres_mode(): {is_postgres_mode()}")
    print(f"get_primary_db(): {get_primary_db()}")
    print()


def test_duckdb_connection():
    """Prueba conexión a DuckDB"""
    print("=" * 60)
    print("TEST 2: DuckDB Connection")
    print("=" * 60)

    try:
        with get_duckdb_connection(read_only=True) as conn:
            result = conn.execute("SELECT COUNT(*) as count FROM ubicaciones").fetchone()
            print(f"✅ DuckDB connection OK")
            print(f"   Ubicaciones count: {result[0] if result else 0}")
            print()
    except Exception as e:
        print(f"❌ DuckDB connection failed: {e}")
        print()


def test_postgres_connection():
    """Prueba conexión a PostgreSQL"""
    print("=" * 60)
    print("TEST 3: PostgreSQL Connection")
    print("=" * 60)

    try:
        with get_postgres_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM ubicaciones")
            result = cursor.fetchone()
            cursor.close()
            print(f"✅ PostgreSQL connection OK")
            print(f"   Ubicaciones count: {result[0] if result else 0}")
            print()
    except Exception as e:
        print(f"❌ PostgreSQL connection failed: {e}")
        print()


def test_unified_connection():
    """Prueba conexión unificada (según DB_MODE)"""
    print("=" * 60)
    print("TEST 4: Unified Connection (según DB_MODE)")
    print("=" * 60)

    try:
        with get_db_connection(read_only=True) as conn:
            if is_postgres_mode():
                cursor = conn.cursor()
                cursor.execute("SELECT codigo, nombre, tipo FROM ubicaciones LIMIT 3")
                results = cursor.fetchall()
                cursor.close()
            else:  # DuckDB
                result = conn.execute("SELECT codigo, nombre, tipo FROM ubicaciones LIMIT 3")
                results = result.fetchall()

            print(f"✅ Unified connection OK (using {get_primary_db()})")
            print(f"   Primeras 3 ubicaciones:")
            for row in results:
                print(f"     - {row[0]}: {row[1]} ({row[2]})")
            print()
    except Exception as e:
        print(f"❌ Unified connection failed: {e}")
        print()


def test_execute_query_helpers():
    """Prueba helpers execute_query y execute_query_dict"""
    print("=" * 60)
    print("TEST 5: Query Helpers")
    print("=" * 60)

    try:
        # Test execute_query (retorna tuplas)
        results = execute_query("SELECT COUNT(*) FROM ubicaciones")
        print(f"✅ execute_query() OK")
        print(f"   Total ubicaciones: {results[0][0]}")

        # Test execute_query_dict (retorna dicts)
        results_dict = execute_query_dict("SELECT codigo, nombre, activo FROM ubicaciones WHERE tipo = 'tienda' LIMIT 3")
        print(f"✅ execute_query_dict() OK")
        print(f"   Primeras 3 tiendas:")
        for row in results_dict:
            status = "✅" if row['activo'] else "❌"
            print(f"     {status} {row['codigo']}: {row['nombre']}")
        print()
    except Exception as e:
        print(f"❌ Query helpers failed: {e}")
        print()


def main():
    print("\n🧪 DUAL DATABASE MODE - TEST SUITE")
    print("=" * 60)
    print()

    # Run all tests
    test_config()
    test_duckdb_connection()
    test_postgres_connection()
    test_unified_connection()
    test_execute_query_helpers()

    print("=" * 60)
    print("✅ All tests completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
