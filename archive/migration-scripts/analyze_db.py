#!/usr/bin/env python3
"""
Análisis de base de datos Fluxion para detectar duplicados y evaluar performance
"""
import duckdb
import sys

def main():
    db_path = 'data/fluxion_production.db'

    try:
        conn = duckdb.connect(db_path, read_only=True)

        print("=" * 80)
        print("ANÁLISIS DE BASE DE DATOS FLUXION")
        print("=" * 80)

        # 1. ESTRUCTURA DE LA BASE DE DATOS
        print("\n📊 TABLAS EN LA BASE DE DATOS:")
        print("-" * 80)
        tables = conn.execute("SHOW TABLES;").fetchall()
        for table in tables:
            print(f"  • {table[0]}")

        # 2. CONTEO DE REGISTROS POR TABLA
        print("\n📈 CONTEO DE REGISTROS:")
        print("-" * 80)
        for table in tables:
            table_name = table[0]
            count = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
            print(f"  {table_name:30s} : {count:,} registros")

        # 3. SCHEMA DE CADA TABLA
        print("\n🏗️  ESQUEMA DE TABLAS:")
        print("-" * 80)
        for table in tables:
            table_name = table[0]
            print(f"\n{table_name}:")
            schema = conn.execute(f"DESCRIBE {table_name}").fetchall()
            for col in schema:
                print(f"  - {col[0]:25s} {col[1]:15s} {col[2]}")

        # 4. ANÁLISIS DE DUPLICADOS
        print("\n" + "=" * 80)
        print("🔍 ANÁLISIS DE DUPLICADOS")
        print("=" * 80)

        for table in tables:
            table_name = table[0]
            print(f"\n{table_name}:")

            # Obtener columnas
            schema = conn.execute(f"DESCRIBE {table_name}").fetchall()
            columns = [col[0] for col in schema]

            # Buscar duplicados por ID si existe
            if 'id' in columns:
                dup_query = f"""
                    SELECT id, COUNT(*) as count
                    FROM {table_name}
                    GROUP BY id
                    HAVING COUNT(*) > 1
                """
                duplicates = conn.execute(dup_query).fetchall()
                if duplicates:
                    print(f"  ⚠️  IDs duplicados: {len(duplicates)}")
                    for dup in duplicates[:5]:
                        print(f"     ID {dup[0]}: {dup[1]} veces")
                else:
                    print(f"  ✓ Sin IDs duplicados")

            # Buscar duplicados por combinaciones de columnas clave
            if table_name == 'products' and 'sku' in columns:
                dup_query = f"""
                    SELECT sku, COUNT(*) as count
                    FROM {table_name}
                    GROUP BY sku
                    HAVING COUNT(*) > 1
                """
                duplicates = conn.execute(dup_query).fetchall()
                if duplicates:
                    print(f"  ⚠️  SKUs duplicados: {len(duplicates)}")
                    for dup in duplicates[:5]:
                        print(f"     SKU '{dup[0]}': {dup[1]} veces")
                else:
                    print(f"  ✓ Sin SKUs duplicados")

            if table_name == 'inventory' and all(col in columns for col in ['product_id', 'location_id']):
                dup_query = f"""
                    SELECT product_id, location_id, COUNT(*) as count
                    FROM {table_name}
                    GROUP BY product_id, location_id
                    HAVING COUNT(*) > 1
                """
                duplicates = conn.execute(dup_query).fetchall()
                if duplicates:
                    print(f"  ⚠️  Duplicados product_id+location_id: {len(duplicates)}")
                    for dup in duplicates[:5]:
                        print(f"     Product {dup[0]}, Location {dup[1]}: {dup[2]} veces")
                else:
                    print(f"  ✓ Sin duplicados product_id+location_id")

            if table_name == 'sales' and 'transaction_id' in columns:
                dup_query = f"""
                    SELECT transaction_id, COUNT(*) as count
                    FROM {table_name}
                    GROUP BY transaction_id
                    HAVING COUNT(*) > 1
                """
                duplicates = conn.execute(dup_query).fetchall()
                if duplicates:
                    print(f"  ⚠️  Transaction IDs duplicados: {len(duplicates)}")
                    for dup in duplicates[:5]:
                        print(f"     Transaction {dup[0]}: {dup[1]} veces")
                else:
                    print(f"  ✓ Sin transaction IDs duplicados")

        # 5. ANÁLISIS DE PERFORMANCE E ÍNDICES
        print("\n" + "=" * 80)
        print("⚡ ANÁLISIS DE PERFORMANCE")
        print("=" * 80)

        # Verificar índices
        print("\n📑 ÍNDICES EXISTENTES:")
        print("-" * 80)
        for table in tables:
            table_name = table[0]
            try:
                indexes = conn.execute(f"""
                    SELECT * FROM duckdb_indexes()
                    WHERE table_name = '{table_name}'
                """).fetchall()
                if indexes:
                    print(f"\n{table_name}:")
                    for idx in indexes:
                        print(f"  - {idx}")
                else:
                    print(f"\n{table_name}: Sin índices explícitos")
            except:
                print(f"\n{table_name}: No se pudo obtener información de índices")

        # 6. ESTADÍSTICAS ADICIONALES
        print("\n" + "=" * 80)
        print("📊 ESTADÍSTICAS ADICIONALES")
        print("=" * 80)

        for table in tables:
            table_name = table[0]
            schema = conn.execute(f"DESCRIBE {table_name}").fetchall()
            columns = [col[0] for col in schema]

            print(f"\n{table_name}:")

            # Contar NULLs
            for col in columns[:10]:  # Primeras 10 columnas
                null_count = conn.execute(f"""
                    SELECT COUNT(*) FROM {table_name} WHERE {col} IS NULL
                """).fetchone()[0]
                total_count = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
                if null_count > 0:
                    pct = (null_count / total_count * 100) if total_count > 0 else 0
                    print(f"  • {col:25s}: {null_count:,} NULLs ({pct:.1f}%)")

        # 7. TAMAÑO DE LA BASE DE DATOS
        print("\n" + "=" * 80)
        print("💾 TAMAÑO Y METADATA")
        print("=" * 80)

        import os
        if os.path.exists(db_path):
            size_bytes = os.path.getsize(db_path)
            size_mb = size_bytes / (1024 * 1024)
            print(f"  Tamaño del archivo: {size_mb:.2f} MB ({size_bytes:,} bytes)")

        conn.close()

        print("\n" + "=" * 80)
        print("✅ ANÁLISIS COMPLETADO")
        print("=" * 80)

    except Exception as e:
        print(f"❌ Error al analizar la base de datos: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
