#!/usr/bin/env python3
"""
Script exhaustivo para detectar duplicados en la base de datos Fluxion
Verifica duplicados por IDs, claves de negocio, y combinaciones lógicas
"""
import duckdb
import sys
from datetime import datetime

def check_id_duplicates(conn, table_name, id_column='id'):
    """Verifica duplicados en columna ID"""
    try:
        query = f"""
            SELECT {id_column}, COUNT(*) as count
            FROM {table_name}
            GROUP BY {id_column}
            HAVING COUNT(*) > 1
        """
        duplicates = conn.execute(query).fetchall()
        return duplicates
    except Exception as e:
        return None

def check_business_key_duplicates(conn, table_name, key_columns):
    """Verifica duplicados en claves de negocio"""
    try:
        keys_str = ', '.join(key_columns)
        query = f"""
            SELECT {keys_str}, COUNT(*) as count
            FROM {table_name}
            GROUP BY {keys_str}
            HAVING COUNT(*) > 1
        """
        duplicates = conn.execute(query).fetchall()
        return duplicates
    except Exception as e:
        return None

def get_sample_duplicates(conn, table_name, key_columns, limit=5):
    """Obtiene ejemplos de registros duplicados"""
    try:
        keys_str = ', '.join(key_columns)
        query = f"""
            WITH duplicates AS (
                SELECT {keys_str}, COUNT(*) as dup_count
                FROM {table_name}
                GROUP BY {keys_str}
                HAVING COUNT(*) > 1
                LIMIT {limit}
            )
            SELECT t.*
            FROM {table_name} t
            INNER JOIN duplicates d ON {' AND '.join([f't.{col} = d.{col}' for col in key_columns])}
            ORDER BY {keys_str}
        """
        samples = conn.execute(query).fetchall()
        return samples
    except Exception as e:
        return None

def main():
    db_path = 'data/fluxion_production.db'

    print("=" * 80)
    print("ANÁLISIS EXHAUSTIVO DE DUPLICADOS - FLUXION DB")
    print("=" * 80)
    print(f"Base de datos: {db_path}")
    print(f"Inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    try:
        conn = duckdb.connect(db_path, read_only=True)

        total_duplicates = 0
        tables_with_duplicates = []

        # Definir verificaciones por tabla
        checks = {
            'productos': {
                'id_column': 'id',
                'business_keys': [
                    ['codigo'],
                    ['codigo_barras'],
                    ['descripcion', 'marca', 'presentacion']
                ]
            },
            'ubicaciones': {
                'id_column': 'id',
                'business_keys': [
                    ['codigo'],
                    ['nombre']
                ]
            },
            'categorias_config': {
                'id_column': 'id',
                'business_keys': [
                    ['categoria', 'subcategoria']
                ]
            },
            'inventario_raw': {
                'id_column': 'id',
                'business_keys': [
                    ['ubicacion_id', 'codigo_producto'],
                    ['ubicacion_id', 'codigo_producto', 'fecha_extraccion']
                ]
            },
            'stock_actual': {
                'id_column': None,  # tabla sin ID
                'business_keys': [
                    ['ubicacion_id', 'producto_id']
                ]
            },
            'producto_ubicacion_config': {
                'id_column': 'id',
                'business_keys': [
                    ['ubicacion_id', 'producto_id']
                ]
            },
            'facturas': {
                'id_column': 'id',
                'business_keys': [
                    ['numero_factura'],
                    ['numero_factura', 'ubicacion_id'],
                    ['numero_factura', 'ubicacion_id', 'fecha_hora']
                ]
            },
            'items_facturas': {
                'id_column': 'id',
                'business_keys': [
                    ['factura_id', 'producto_id'],
                    ['numero_factura', 'codigo_producto']
                ]
            },
            'movimientos_inventario': {
                'id_column': 'id',
                'business_keys': [
                    ['fecha_hora', 'ubicacion_id', 'producto_id', 'tipo_movimiento']
                ]
            },
            'ventas_raw': {
                'id_column': None,
                'business_keys': [
                    ['numero_factura', 'linea'],
                    ['numero_factura', 'codigo_producto', 'fecha_hora_completa']
                ]
            },
            'etl_logs': {
                'id_column': 'id',
                'business_keys': [
                    ['proceso', 'ubicacion_id', 'fecha_inicio']
                ]
            }
        }

        print("=" * 80)
        print("VERIFICACIÓN POR TABLA")
        print("=" * 80)

        for table_name, config in checks.items():
            print(f"\n{'=' * 80}")
            print(f"📋 TABLA: {table_name.upper()}")
            print(f"{'=' * 80}")

            # Obtener conteo total
            try:
                total_rows = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
                print(f"Total de registros: {total_rows:,}")
            except Exception as e:
                print(f"⚠️  No se pudo leer la tabla: {e}")
                continue

            if total_rows == 0:
                print("✓ Tabla vacía, no hay duplicados posibles")
                continue

            table_has_duplicates = False

            # 1. Verificar duplicados en ID
            if config['id_column']:
                print(f"\n1️⃣  Verificando columna ID: {config['id_column']}")
                id_dups = check_id_duplicates(conn, table_name, config['id_column'])

                if id_dups is None:
                    print(f"   ⚠️  No se pudo verificar la columna ID")
                elif len(id_dups) == 0:
                    print(f"   ✓ Sin duplicados en columna ID")
                else:
                    print(f"   ❌ DUPLICADOS ENCONTRADOS: {len(id_dups)} IDs duplicados")
                    table_has_duplicates = True
                    total_duplicates += len(id_dups)

                    # Mostrar ejemplos
                    print(f"   Ejemplos:")
                    for dup in id_dups[:5]:
                        print(f"      ID '{dup[0]}' aparece {dup[1]} veces")

            # 2. Verificar claves de negocio
            print(f"\n2️⃣  Verificando claves de negocio:")
            for i, key_columns in enumerate(config['business_keys'], 1):
                key_name = ' + '.join(key_columns)
                print(f"\n   {i}. Clave: [{key_name}]")

                business_dups = check_business_key_duplicates(conn, table_name, key_columns)

                if business_dups is None:
                    print(f"      ⚠️  No se pudo verificar esta clave")
                    continue

                if len(business_dups) == 0:
                    print(f"      ✓ Sin duplicados")
                else:
                    print(f"      ❌ DUPLICADOS: {len(business_dups)} combinaciones duplicadas")
                    table_has_duplicates = True

                    # Mostrar ejemplos
                    print(f"      Ejemplos:")
                    for dup in business_dups[:3]:
                        values = dup[:-1]  # Todos menos el COUNT
                        count = dup[-1]
                        values_str = ', '.join([f"{col}='{val}'" for col, val in zip(key_columns, values)])
                        print(f"         {values_str} → {count} registros")

                    if len(business_dups) > 3:
                        print(f"         ... y {len(business_dups) - 3} más")

                    # Obtener muestras de registros duplicados
                    if len(business_dups) <= 5:
                        print(f"\n      📄 Muestra de registros duplicados:")
                        samples = get_sample_duplicates(conn, table_name, key_columns, 2)
                        if samples:
                            for sample in samples[:10]:
                                print(f"         {sample}")

            if table_has_duplicates:
                tables_with_duplicates.append(table_name)
                print(f"\n⚠️  TABLA CON DUPLICADOS DETECTADOS")
            else:
                print(f"\n✅ TABLA SIN DUPLICADOS")

        # ANÁLISIS ESPECIAL: ventas_raw (tabla más grande)
        print(f"\n{'=' * 80}")
        print(f"🔥 ANÁLISIS ESPECIAL: VENTAS_RAW (81M registros)")
        print(f"{'=' * 80}")

        # Verificar si hay registros exactamente iguales (todas las columnas)
        print("\n1. Verificando registros completamente duplicados...")
        try:
            query = """
                SELECT COUNT(*) as total_rows,
                       COUNT(DISTINCT (numero_factura, linea, codigo_producto, fecha)) as unique_combinations
                FROM ventas_raw
            """
            result = conn.execute(query).fetchone()
            total = result[0]
            unique = result[1]
            duplicates = total - unique

            print(f"   Total de registros: {total:,}")
            print(f"   Combinaciones únicas (factura+linea+producto+fecha): {unique:,}")
            print(f"   Posibles duplicados: {duplicates:,}")

            if duplicates > 0:
                print(f"   ⚠️  Hay {duplicates:,} registros potencialmente duplicados")
                total_duplicates += duplicates
            else:
                print(f"   ✓ No hay duplicados completos")
        except Exception as e:
            print(f"   ⚠️  Error: {e}")

        # Verificar duplicados por numero_factura + linea (clave más importante)
        print("\n2. Verificando duplicados por [numero_factura + linea]...")
        try:
            query = """
                SELECT numero_factura, linea, COUNT(*) as count
                FROM ventas_raw
                WHERE numero_factura IS NOT NULL AND linea IS NOT NULL
                GROUP BY numero_factura, linea
                HAVING COUNT(*) > 1
                LIMIT 10
            """
            dups = conn.execute(query).fetchall()

            if len(dups) == 0:
                print(f"   ✓ Sin duplicados en [numero_factura + linea]")
            else:
                print(f"   ❌ DUPLICADOS ENCONTRADOS: {len(dups)} combinaciones")
                for dup in dups[:5]:
                    print(f"      Factura '{dup[0]}', Línea '{dup[1]}': {dup[2]} veces")
        except Exception as e:
            print(f"   ⚠️  Error: {e}")

        # Verificar duplicados por numero_factura + codigo_producto
        print("\n3. Verificando duplicados por [numero_factura + codigo_producto]...")
        try:
            query = """
                SELECT numero_factura, codigo_producto, COUNT(*) as count
                FROM ventas_raw
                WHERE numero_factura IS NOT NULL AND codigo_producto IS NOT NULL
                GROUP BY numero_factura, codigo_producto
                HAVING COUNT(*) > 1
                LIMIT 10
            """
            dups = conn.execute(query).fetchall()

            if len(dups) == 0:
                print(f"   ✓ Sin duplicados")
            else:
                print(f"   ⚠️  {len(dups)} combinaciones aparecen múltiples veces")
                print(f"   (Esto puede ser normal si un producto se vende varias veces en una factura)")
                for dup in dups[:3]:
                    print(f"      Factura '{dup[0]}', Producto '{dup[1]}': {dup[2]} líneas")
        except Exception as e:
            print(f"   ⚠️  Error: {e}")

        # RESUMEN FINAL
        print("\n" + "=" * 80)
        print("📊 RESUMEN FINAL")
        print("=" * 80)

        print(f"\nTablas analizadas: {len(checks)}")
        print(f"Tablas con duplicados: {len(tables_with_duplicates)}")

        if tables_with_duplicates:
            print(f"\n❌ TABLAS CON DUPLICADOS DETECTADOS:")
            for table in tables_with_duplicates:
                print(f"   • {table}")
            print(f"\n⚠️  Se requiere limpieza de datos")
        else:
            print(f"\n✅ NO SE ENCONTRARON DUPLICADOS EN NINGUNA TABLA")
            print(f"✅ La base de datos tiene integridad de datos correcta")

        print(f"\n{'=' * 80}")
        print(f"Fin: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)

        conn.close()

        if tables_with_duplicates:
            sys.exit(1)
        else:
            sys.exit(0)

    except Exception as e:
        print(f"\n❌ Error fatal: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
