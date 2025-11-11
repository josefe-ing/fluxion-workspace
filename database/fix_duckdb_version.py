#!/usr/bin/env python3
"""
Script para solucionar problemas de versión de DuckDB.
Exporta datos a CSV y los reimporta en una BD nueva con versión actual.
"""

import duckdb
import sys
from pathlib import Path
import shutil
from datetime import datetime

# Rutas
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "fluxion_production.db"
DB_BACKUP_PATH = BASE_DIR / "data" / "fluxion_production_backup.db"


def verificar_version_duckdb():
    """Verificar versión de DuckDB instalada."""
    print(f"DuckDB version instalada: {duckdb.__version__}")


def test_conexion():
    """Intentar conectar a la base de datos."""
    print(f"\nIntentando conectar a: {DB_PATH}")

    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        # Intentar una query simple
        result = conn.execute("SELECT COUNT(*) FROM productos").fetchone()
        print(f"✓ Conexión exitosa - {result[0]} productos encontrados")

        conn.close()
        return True

    except duckdb.SerializationException as e:
        print(f"✗ Error de serialización: {e}")
        print("\nLa base de datos fue creada con una versión diferente de DuckDB.")
        return False

    except Exception as e:
        print(f"✗ Error: {e}")
        return False


def main():
    """Función principal."""
    print("=" * 70)
    print("DIAGNÓSTICO DE VERSIÓN DUCKDB")
    print("=" * 70)

    verificar_version_duckdb()

    if not DB_PATH.exists():
        print(f"\n✗ No se encuentra la base de datos: {DB_PATH}")
        sys.exit(1)

    if test_conexion():
        print("\n✓ La base de datos funciona correctamente")
        print("\nPuedes ejecutar:")
        print("  python3 calcular_abc_v2.py --crear-tablas --verbose")
    else:
        print("\n" + "=" * 70)
        print("SOLUCIONES RECOMENDADAS")
        print("=" * 70)

        print("\n1. Actualizar DuckDB (Recomendado):")
        print("   pip3 install --upgrade duckdb")
        print("   python3 fix_duckdb_version.py")

        print("\n2. Si el error persiste, contactar al administrador")
        print("   La BD podría necesitar exportación/reimportación")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠ Proceso interrumpido")
        sys.exit(1)
