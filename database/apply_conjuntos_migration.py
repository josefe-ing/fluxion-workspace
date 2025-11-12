#!/usr/bin/env python3
"""
Script para aplicar la migración de Conjuntos Sustituibles
"""
import duckdb
import sys
from pathlib import Path

def apply_conjuntos_migration():
    """Aplica la migración de conjuntos sustituibles"""

    db_path = 'data/fluxion_production.db'
    migration_path = 'database/migrations/001_create_conjuntos_sustituibles.sql'

    if not Path(db_path).exists():
        print(f"❌ Base de datos no encontrada: {db_path}")
        return False

    if not Path(migration_path).exists():
        print(f"❌ Archivo de migración no encontrado: {migration_path}")
        return False

    try:
        print(f"📦 Conectando a {db_path}...")
        conn = duckdb.connect(db_path)

        print(f"📝 Leyendo migración {migration_path}...")
        with open(migration_path, 'r') as f:
            sql_content = f.read()

        # Dividir en statements y ejecutar uno por uno
        statements = [s.strip() for s in sql_content.split(';') if s.strip()]

        for i, stmt in enumerate(statements, 1):
            if stmt and not stmt.startswith('--'):
                try:
                    # Mostrar preview del statement
                    preview = stmt[:80].replace('\n', ' ')
                    print(f"  [{i}/{len(statements)}] Ejecutando: {preview}...")

                    conn.execute(stmt)
                    print(f"  ✅ OK")

                except Exception as e:
                    error_msg = str(e).lower()
                    if "already exists" in error_msg or "duplicate" in error_msg:
                        print(f"  ⚠️  Ya existe (ignorado)")
                    else:
                        print(f"  ❌ Error: {e}")
                        raise

        # Verificar que las tablas fueron creadas
        print("\n📊 Verificando tablas creadas...")

        tables = conn.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'main'
            AND table_name LIKE '%conjunto%'
            ORDER BY table_name
        """).fetchall()

        print(f"✅ Tablas encontradas:")
        for table in tables:
            count = conn.execute(f"SELECT COUNT(*) FROM {table[0]}").fetchone()[0]
            print(f"   - {table[0]}: {count} registros")

        # Verificar vistas
        views = conn.execute("""
            SELECT table_name
            FROM information_schema.views
            WHERE table_schema = 'main'
            AND table_name LIKE '%conjunto%'
            ORDER BY table_name
        """).fetchall()

        if views:
            print(f"\n✅ Vistas creadas:")
            for view in views:
                print(f"   - {view[0]}")

        conn.close()

        print("\n✅ Migración aplicada exitosamente!")
        print("\n📌 Próximos pasos:")
        print("   1. Crear modelos Pydantic en backend")
        print("   2. Implementar endpoints CRUD")
        print("   3. Crear UI de administración")

        return True

    except Exception as e:
        print(f"\n❌ Error aplicando migración: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = apply_conjuntos_migration()
    sys.exit(0 if success else 1)
