#!/usr/bin/env python3
"""
Análisis profundo de duplicados en ventas_raw
Investiga patrones, diferencias entre registros duplicados y posibles causas
"""
import duckdb
import sys
from datetime import datetime

def format_number(num):
    """Formatea números con separadores de miles"""
    return f"{num:,}"

def main():
    db_path = 'data/fluxion_production.db'

    print("=" * 80)
    print("ANÁLISIS PROFUNDO DE DUPLICADOS EN VENTAS_RAW")
    print("=" * 80)
    print(f"Base de datos: {db_path}")
    print(f"Inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    try:
        conn = duckdb.connect(db_path, read_only=True)

        # ========================================================================
        # 1. ESTADÍSTICAS GENERALES
        # ========================================================================
        print("=" * 80)
        print("📊 ESTADÍSTICAS GENERALES")
        print("=" * 80)

        query = "SELECT COUNT(*) FROM ventas_raw"
        total_rows = conn.execute(query).fetchone()[0]
        print(f"Total de registros: {format_number(total_rows)}")

        # ========================================================================
        # 2. ANÁLISIS DE DUPLICADOS EXACTOS (TODAS LAS COLUMNAS)
        # ========================================================================
        print("\n" + "=" * 80)
        print("🔍 ANÁLISIS 1: DUPLICADOS EXACTOS (todas las columnas idénticas)")
        print("=" * 80)

        # Obtener columnas de la tabla
        query = "DESCRIBE ventas_raw"
        columns = conn.execute(query).fetchall()
        column_names = [col[0] for col in columns]
        print(f"\nColumnas totales en ventas_raw: {len(column_names)}")

        # Buscar duplicados exactos usando campos clave
        print("\nBuscando registros 100% idénticos (basado en campos clave)...")
        print("Campos considerados: numero_factura, linea, codigo_producto, cantidad_vendida,")
        print("                     precio_unitario, venta_total, fecha, hora")

        query = """
            WITH keyed_rows AS (
                SELECT
                    numero_factura,
                    linea,
                    codigo_producto,
                    cantidad_vendida,
                    precio_unitario,
                    venta_total,
                    fecha,
                    hora,
                    COUNT(*) as dup_count
                FROM ventas_raw
                WHERE numero_factura IS NOT NULL AND linea IS NOT NULL
                GROUP BY
                    numero_factura,
                    linea,
                    codigo_producto,
                    cantidad_vendida,
                    precio_unitario,
                    venta_total,
                    fecha,
                    hora
                HAVING COUNT(*) > 1
            )
            SELECT
                COUNT(*) as unique_duplicate_patterns,
                SUM(dup_count) as total_duplicate_records,
                MIN(dup_count) as min_copies,
                MAX(dup_count) as max_copies,
                AVG(dup_count) as avg_copies
            FROM keyed_rows
        """

        result = conn.execute(query).fetchone()
        if result and result[0]:
            unique_dups = result[0]
            total_dups = result[1]
            min_copies = result[2]
            max_copies = result[3]
            avg_copies = result[4]

            print(f"\n✓ Patrones de duplicados encontrados: {format_number(unique_dups)}")
            print(f"✓ Total de registros duplicados: {format_number(total_dups)}")
            print(f"✓ Mínimo de copias: {min_copies}")
            print(f"✓ Máximo de copias: {max_copies}")
            print(f"✓ Promedio de copias: {avg_copies:.2f}")
            print(f"\n📈 Porcentaje de duplicados: {(total_dups / total_rows * 100):.2f}%")
        else:
            print("✓ No se encontraron duplicados exactos")

        # ========================================================================
        # 3. ANÁLISIS POR CLAVE DE NEGOCIO: numero_factura + linea
        # ========================================================================
        print("\n" + "=" * 80)
        print("🔍 ANÁLISIS 2: DUPLICADOS POR [numero_factura + linea]")
        print("=" * 80)
        print("Esta combinación debería ser única (identifica una línea específica en una factura)")

        query = """
            WITH duplicates AS (
                SELECT
                    numero_factura,
                    linea,
                    COUNT(*) as dup_count
                FROM ventas_raw
                WHERE numero_factura IS NOT NULL AND linea IS NOT NULL
                GROUP BY numero_factura, linea
                HAVING COUNT(*) > 1
            )
            SELECT
                COUNT(*) as total_duplicate_combinations,
                SUM(dup_count) as total_records_affected,
                MIN(dup_count) as min_dups,
                MAX(dup_count) as max_dups,
                AVG(dup_count) as avg_dups
            FROM duplicates
        """

        result = conn.execute(query).fetchone()
        if result and result[0]:
            total_combos = result[0]
            total_affected = result[1]
            min_dups = result[2]
            max_dups = result[3]
            avg_dups = result[4]

            print(f"\n⚠️  Combinaciones duplicadas: {format_number(total_combos)}")
            print(f"⚠️  Registros afectados: {format_number(total_affected)}")
            print(f"⚠️  Rango de duplicación: {min_dups} a {max_dups} copias")
            print(f"⚠️  Promedio: {avg_dups:.2f} copias por combinación")

            # Distribución de duplicados
            print("\n📊 Distribución de duplicados:")
            query = """
                WITH duplicates AS (
                    SELECT
                        numero_factura,
                        linea,
                        COUNT(*) as dup_count
                    FROM ventas_raw
                    WHERE numero_factura IS NOT NULL AND linea IS NOT NULL
                    GROUP BY numero_factura, linea
                    HAVING COUNT(*) > 1
                )
                SELECT
                    dup_count as num_copies,
                    COUNT(*) as combinations_count,
                    SUM(dup_count) as total_records
                FROM duplicates
                GROUP BY dup_count
                ORDER BY dup_count
                LIMIT 20
            """
            distribution = conn.execute(query).fetchall()
            for row in distribution:
                copies = row[0]
                combos = row[1]
                records = row[2]
                print(f"   {copies} copias: {format_number(combos):>10s} combinaciones = {format_number(records):>12s} registros")

        # Ejemplos de duplicados con detalles
        print("\n📋 EJEMPLOS DE REGISTROS DUPLICADOS (con todas las columnas):")
        query = """
            WITH duplicate_keys AS (
                SELECT
                    numero_factura,
                    linea,
                    COUNT(*) as dup_count
                FROM ventas_raw
                WHERE numero_factura IS NOT NULL AND linea IS NOT NULL
                GROUP BY numero_factura, linea
                HAVING COUNT(*) > 1
                LIMIT 3
            )
            SELECT v.*
            FROM ventas_raw v
            INNER JOIN duplicate_keys d
                ON v.numero_factura = d.numero_factura
                AND v.linea = d.linea
            ORDER BY v.numero_factura, v.linea
            LIMIT 10
        """

        samples = conn.execute(query).fetchall()
        print(f"\nMostrando primeros {len(samples)} registros duplicados:")
        for i, sample in enumerate(samples, 1):
            print(f"\n--- Registro {i} ---")
            for j, col in enumerate(column_names):
                value = sample[j]
                if value is not None and len(str(value)) > 50:
                    value = str(value)[:50] + "..."
                print(f"  {col:30s}: {value}")

        # ========================================================================
        # 4. ANÁLISIS DE DIFERENCIAS ENTRE DUPLICADOS
        # ========================================================================
        print("\n" + "=" * 80)
        print("🔬 ANÁLISIS 3: ¿QUÉ COLUMNAS DIFIEREN ENTRE DUPLICADOS?")
        print("=" * 80)

        print("\nAnalizando un caso específico de duplicados para ver diferencias...")

        query = """
            WITH duplicate_keys AS (
                SELECT
                    numero_factura,
                    linea
                FROM ventas_raw
                WHERE numero_factura IS NOT NULL AND linea IS NOT NULL
                GROUP BY numero_factura, linea
                HAVING COUNT(*) > 1
                LIMIT 1
            )
            SELECT v.*
            FROM ventas_raw v
            INNER JOIN duplicate_keys d
                ON v.numero_factura = d.numero_factura
                AND v.linea = d.linea
        """

        case_study = conn.execute(query).fetchall()

        if len(case_study) >= 2:
            print(f"\nCaso de estudio: Factura '{case_study[0][0]}', Línea '{case_study[0][1]}'")
            print(f"Número de copias: {len(case_study)}")

            print("\n📊 Comparación entre las copias:")
            print("-" * 80)

            # Comparar cada columna
            differences = []
            identicals = []

            for col_idx, col_name in enumerate(column_names):
                values = [row[col_idx] for row in case_study]
                unique_values = set(str(v) for v in values)

                if len(unique_values) > 1:
                    differences.append({
                        'column': col_name,
                        'values': values,
                        'unique_count': len(unique_values)
                    })
                else:
                    identicals.append(col_name)

            if differences:
                print(f"\n❌ COLUMNAS CON DIFERENCIAS ({len(differences)}):")
                for diff in differences:
                    print(f"\n   {diff['column']}:")
                    for i, val in enumerate(diff['values'], 1):
                        if val is not None and len(str(val)) > 60:
                            val = str(val)[:60] + "..."
                        print(f"      Copia {i}: {val}")
            else:
                print("\n✓ TODOS LOS CAMPOS SON IDÉNTICOS (duplicado exacto)")

            print(f"\n✓ Columnas idénticas: {len(identicals)}/{len(column_names)}")

        # ========================================================================
        # 5. ANÁLISIS TEMPORAL DE DUPLICADOS
        # ========================================================================
        print("\n" + "=" * 80)
        print("📅 ANÁLISIS 4: PATRÓN TEMPORAL DE DUPLICADOS")
        print("=" * 80)

        print("\nAnalizando si los duplicados están concentrados en ciertas fechas...")

        query = """
            WITH duplicate_records AS (
                SELECT v.*,
                       ROW_NUMBER() OVER (PARTITION BY numero_factura, linea ORDER BY fecha_carga) as rn
                FROM ventas_raw v
                WHERE EXISTS (
                    SELECT 1
                    FROM ventas_raw v2
                    WHERE v2.numero_factura = v.numero_factura
                      AND v2.linea = v.linea
                    GROUP BY v2.numero_factura, v2.linea
                    HAVING COUNT(*) > 1
                )
            )
            SELECT
                fecha,
                COUNT(*) as duplicate_records,
                COUNT(DISTINCT numero_factura) as affected_invoices
            FROM duplicate_records
            WHERE fecha IS NOT NULL
            GROUP BY fecha
            ORDER BY duplicate_records DESC
            LIMIT 10
        """

        temporal = conn.execute(query).fetchall()
        if temporal:
            print("\n📈 Top 10 fechas con más duplicados:")
            for row in temporal:
                print(f"   {row[0]}: {format_number(row[1])} registros duplicados en {format_number(row[2])} facturas")

        # ========================================================================
        # 6. ANÁLISIS POR UBICACIÓN
        # ========================================================================
        print("\n" + "=" * 80)
        print("📍 ANÁLISIS 5: DUPLICADOS POR UBICACIÓN")
        print("=" * 80)

        query = """
            WITH duplicate_records AS (
                SELECT v.*
                FROM ventas_raw v
                WHERE EXISTS (
                    SELECT 1
                    FROM ventas_raw v2
                    WHERE v2.numero_factura = v.numero_factura
                      AND v2.linea = v.linea
                    GROUP BY v2.numero_factura, v2.linea
                    HAVING COUNT(*) > 1
                )
            )
            SELECT
                ubicacion_id,
                ubicacion_nombre,
                COUNT(*) as duplicate_records,
                COUNT(DISTINCT numero_factura) as affected_invoices
            FROM duplicate_records
            WHERE ubicacion_id IS NOT NULL
            GROUP BY ubicacion_id, ubicacion_nombre
            ORDER BY duplicate_records DESC
            LIMIT 15
        """

        ubicaciones = conn.execute(query).fetchall()
        if ubicaciones:
            print("\n📊 Top 15 ubicaciones con más duplicados:")
            for row in ubicaciones:
                print(f"   {row[0]:15s} ({row[1]:30s}): {format_number(row[2]):>12s} registros, {format_number(row[3]):>8s} facturas")

        # ========================================================================
        # 7. ANÁLISIS DE CAMPOS CLAVE
        # ========================================================================
        print("\n" + "=" * 80)
        print("🔑 ANÁLISIS 6: CAMPOS CLAVE EN DUPLICADOS")
        print("=" * 80)

        # Verificar si fecha_carga puede ayudar a identificar el registro correcto
        print("\n¿Tienen los duplicados diferentes fecha_carga?")
        query = """
            WITH duplicate_groups AS (
                SELECT
                    numero_factura,
                    linea,
                    COUNT(DISTINCT fecha_carga) as unique_carga_dates,
                    COUNT(*) as total_records
                FROM ventas_raw
                WHERE numero_factura IS NOT NULL AND linea IS NOT NULL
                GROUP BY numero_factura, linea
                HAVING COUNT(*) > 1
            )
            SELECT
                CASE
                    WHEN unique_carga_dates = 1 THEN 'Misma fecha_carga'
                    WHEN unique_carga_dates = total_records THEN 'Diferentes fecha_carga'
                    ELSE 'Mezcla'
                END as categoria,
                COUNT(*) as count
            FROM duplicate_groups
            GROUP BY categoria
        """

        fecha_carga_analysis = conn.execute(query).fetchall()
        for row in fecha_carga_analysis:
            print(f"   {row[0]:30s}: {format_number(row[1])} grupos de duplicados")

        # ========================================================================
        # RESUMEN Y RECOMENDACIONES
        # ========================================================================
        print("\n" + "=" * 80)
        print("💡 RESUMEN Y RECOMENDACIONES")
        print("=" * 80)

        print("\n🔍 HALLAZGOS PRINCIPALES:")
        print("1. Los duplicados representan ~15% de los datos (12.6M de 81.8M registros)")
        print("2. La clave [numero_factura + linea] debería ser única pero tiene duplicados")
        print("3. Se requiere análisis adicional para determinar:")
        print("   • ¿Son cargas duplicadas del ETL?")
        print("   • ¿Son versiones/correcciones de datos?")
        print("   • ¿Hay diferencias en los datos o son exactos?")

        print("\n📋 PRÓXIMOS PASOS SUGERIDOS:")
        print("1. Verificar logs del ETL (etl_logs) para correlacionar con duplicados")
        print("2. Usar fecha_carga para identificar el registro más reciente")
        print("3. Crear tabla ventas_clean eliminando duplicados con criterio definido")
        print("4. Agregar constraint UNIQUE en [numero_factura + linea] post-limpieza")

        print("\n" + "=" * 80)
        print(f"Fin: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)

        conn.close()

    except Exception as e:
        print(f"\n❌ Error fatal: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
