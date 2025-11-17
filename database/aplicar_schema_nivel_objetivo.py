#!/usr/bin/env python3
"""
Script para aplicar schema de nivel objetivo y migración de columnas

Descripción:
    Ejecuta el schema de nivel objetivo y la migración 002 en la base de datos.

Uso:
    python3 aplicar_schema_nivel_objetivo.py

Autor: Sistema FluxionIA
Fecha: 2025-01-12
"""

import duckdb
from pathlib import Path

def aplicar_schema():
    """Aplica el schema de nivel objetivo y migraciones"""

    # Rutas de archivos
    base_dir = Path(__file__).parent
    db_path = base_dir.parent / "data" / "fluxion_production.db"
    schema_path = base_dir / "schema_nivel_objetivo.sql"
    migration_path = base_dir / "migrations" / "002_add_nivel_objetivo_columns.sql"

    print("\n" + "="*70)
    print("APLICANDO SCHEMA DE NIVEL OBJETIVO")
    print("="*70)
    print(f"Base de datos: {db_path}")
    print(f"Schema: {schema_path.name}")
    print(f"Migración: {migration_path.name}")
    print("="*70 + "\n")

    if not db_path.exists():
        print(f"✗ Base de datos no encontrada: {db_path}")
        return False

    try:
        # Conectar a DuckDB
        print("1. Conectando a la base de datos...")
        conn = duckdb.connect(str(db_path))
        print("   ✓ Conexión establecida\n")

        # Aplicar schema principal
        if schema_path.exists():
            print("2. Aplicando schema de nivel objetivo...")
            with open(schema_path, 'r', encoding='utf-8') as f:
                schema_sql = f.read()

            # Ejecutar SQL
            conn.execute(schema_sql)
            print("   ✓ Schema aplicado exitosamente\n")

            # Verificar tablas creadas
            result = conn.execute("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'main'
                  AND table_name IN ('parametros_reposicion_tienda', 'pedidos_sugeridos_auditoria')
                ORDER BY table_name
            """).fetchall()

            print("   Tablas creadas:")
            for (table_name,) in result:
                print(f"     - {table_name}")
            print()

        else:
            print(f"   ⚠ Schema no encontrado: {schema_path}\n")

        # Aplicar migración de columnas
        if migration_path.exists():
            print("3. Aplicando migración de columnas...")
            with open(migration_path, 'r', encoding='utf-8') as f:
                migration_sql = f.read()

            # Ejecutar SQL
            conn.execute(migration_sql)
            print("   ✓ Migración aplicada exitosamente\n")

            # Verificar columnas agregadas (si la tabla existe)
            try:
                result = conn.execute("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'pedidos_sugeridos_detalle'
                      AND column_name IN ('matriz_abc_xyz', 'nivel_objetivo', 'stock_seguridad',
                                          'demanda_ciclo', 'inventario_en_transito', 'metodo_calculo', 'datos_calculo')
                    ORDER BY column_name
                """).fetchall()

                print("   Columnas agregadas a pedidos_sugeridos_detalle:")
                for (column_name,) in result:
                    print(f"     - {column_name}")
                print()

            except Exception as e:
                print(f"   ⚠ No se pudo verificar columnas: {e}\n")

        else:
            print(f"   ⚠ Migración no encontrada: {migration_path}\n")

        # Commit y cerrar
        conn.commit()
        conn.close()

        print("="*70)
        print("✓ SCHEMA Y MIGRACIÓN APLICADOS EXITOSAMENTE")
        print("="*70 + "\n")

        return True

    except Exception as e:
        print(f"\n✗ Error al aplicar schema: {e}\n")
        return False


if __name__ == "__main__":
    success = aplicar_schema()
    exit(0 if success else 1)
