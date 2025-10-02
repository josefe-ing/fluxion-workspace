#!/usr/bin/env python3
"""
Mostrar ejemplos concretos de duplicados reales en ventas_raw
"""
import duckdb
from datetime import datetime

def main():
    db_path = 'data/fluxion_production.db'

    print("=" * 80)
    print("EJEMPLOS DE DUPLICADOS REALES EN VENTAS_RAW")
    print("=" * 80)
    print(f"Base de datos: {db_path}")
    print(f"Inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    try:
        conn = duckdb.connect(db_path, read_only=True)

        # ========================================================================
        # 1. OBTENER CASOS DE DUPLICADOS
        # ========================================================================
        print("=" * 80)
        print("1. OBTENER CASOS DE DUPLICADOS CON CLAVE [ubicacion_id + numero_factura + linea]")
        print("=" * 80)

        # Obtener 5 casos de duplicados
        query = """
            SELECT
                ubicacion_id,
                numero_factura,
                linea,
                COUNT(*) as copias
            FROM ventas_raw
            WHERE ubicacion_id IS NOT NULL
              AND numero_factura IS NOT NULL
              AND linea IS NOT NULL
            GROUP BY ubicacion_id, numero_factura, linea
            HAVING COUNT(*) > 1
            ORDER BY copias DESC
            LIMIT 5
        """

        casos = conn.execute(query).fetchall()

        print(f"\nEncontrados {len(casos)} casos de ejemplo:")
        for i, caso in enumerate(casos, 1):
            print(f"\n{i}. ubicacion_id='{caso[0]}', numero_factura='{caso[1]}', linea='{caso[2]}' → {caso[3]} copias")

        # ========================================================================
        # 2. MOSTRAR DETALLES DE CADA CASO
        # ========================================================================
        print("\n" + "=" * 80)
        print("2. DETALLES COMPLETOS DE CADA CASO")
        print("=" * 80)

        for i, caso in enumerate(casos, 1):
            ubicacion_id = caso[0]
            numero_factura = caso[1]
            linea = caso[2]
            copias = caso[3]

            print(f"\n{'=' * 80}")
            print(f"CASO {i}: {copias} registros duplicados")
            print(f"Clave: ubicacion_id='{ubicacion_id}', numero_factura='{numero_factura}', linea='{linea}'")
            print(f"{'=' * 80}")

            # Obtener todos los registros duplicados
            query = f"""
                SELECT
                    ubicacion_id,
                    ubicacion_nombre,
                    numero_factura,
                    linea,
                    fecha,
                    hora,
                    fecha_hora_completa,
                    codigo_producto,
                    descripcion_producto,
                    categoria_producto,
                    marca_producto,
                    cantidad_vendida,
                    precio_unitario,
                    venta_total,
                    costo_total,
                    utilidad_bruta,
                    margen_bruto_pct,
                    fecha_extraccion,
                    fecha_transformacion,
                    fecha_carga,
                    turno,
                    tipo_venta
                FROM ventas_raw
                WHERE ubicacion_id = '{ubicacion_id}'
                  AND numero_factura = '{numero_factura}'
                  AND linea = '{linea}'
                ORDER BY fecha_carga
            """

            registros = conn.execute(query).fetchall()
            columnas = ['ubicacion_id', 'ubicacion_nombre', 'numero_factura', 'linea',
                       'fecha', 'hora', 'fecha_hora_completa', 'codigo_producto',
                       'descripcion_producto', 'categoria_producto', 'marca_producto',
                       'cantidad_vendida', 'precio_unitario', 'venta_total', 'costo_total',
                       'utilidad_bruta', 'margen_bruto_pct', 'fecha_extraccion',
                       'fecha_transformacion', 'fecha_carga', 'turno', 'tipo_venta']

            print(f"\nMostrando las {len(registros)} copias del registro:")

            for idx, registro in enumerate(registros, 1):
                print(f"\n--- COPIA {idx} ---")
                for col_idx, col_name in enumerate(columnas):
                    valor = registro[col_idx]
                    if valor is not None and isinstance(valor, str) and len(valor) > 60:
                        valor = valor[:60] + "..."
                    print(f"  {col_name:25s}: {valor}")

            # Análisis de diferencias
            print(f"\n📊 ANÁLISIS DE DIFERENCIAS:")
            print("-" * 80)

            # Identificar columnas con diferencias
            diferencias = []
            identicas = []

            for col_idx, col_name in enumerate(columnas):
                valores = [reg[col_idx] for reg in registros]
                valores_str = [str(v) for v in valores]
                unicos = set(valores_str)

                if len(unicos) > 1:
                    diferencias.append({
                        'columna': col_name,
                        'valores': valores,
                        'unicos': len(unicos)
                    })
                else:
                    identicas.append(col_name)

            if diferencias:
                print(f"\n❌ CAMPOS CON DIFERENCIAS ({len(diferencias)}):")
                for diff in diferencias:
                    print(f"\n   • {diff['columna']} ({diff['unicos']} valores únicos):")
                    for j, val in enumerate(diff['valores'], 1):
                        if val is not None and isinstance(val, str) and len(str(val)) > 60:
                            val = str(val)[:60] + "..."
                        print(f"      Copia {j}: {val}")
            else:
                print("\n✅ TODAS las columnas son idénticas (duplicado 100% exacto)")

            print(f"\n✅ CAMPOS IDÉNTICOS: {len(identicas)}/{len(columnas)}")
            if len(identicas) < len(columnas):
                print(f"   Campos sin cambios: {', '.join(identicas[:10])}")
                if len(identicas) > 10:
                    print(f"   ... y {len(identicas) - 10} más")

            # Conclusión del caso
            print(f"\n💡 CONCLUSIÓN:")
            if len(diferencias) == 0:
                print("   ✓ Duplicado EXACTO - Todas las columnas son idénticas")
                print("   ✓ Causa probable: Carga duplicada en el ETL")
            elif any(d['columna'] in ['fecha_carga', 'fecha_extraccion', 'fecha_transformacion'] for d in diferencias):
                if len(diferencias) <= 3:
                    print("   ✓ Solo difieren timestamps de ETL (fecha_carga, etc.)")
                    print("   ✓ Los datos de negocio son idénticos")
                    print("   ✓ Causa probable: Reprocesamiento del ETL")
                else:
                    print("   ⚠️  Hay diferencias en datos de negocio además de timestamps")
                    print("   ⚠️  Podría ser corrección/actualización de datos")
            else:
                print("   ⚠️  Hay diferencias significativas en los datos")
                print("   ⚠️  Requiere análisis manual para determinar causa")

        # ========================================================================
        # 3. ESTADÍSTICAS GENERALES DE DUPLICADOS
        # ========================================================================
        print("\n" + "=" * 80)
        print("3. ESTADÍSTICAS GENERALES")
        print("=" * 80)

        # Total de duplicados
        query = """
            SELECT
                COUNT(*) as total_grupos_duplicados,
                SUM(copias) as total_registros_duplicados,
                MIN(copias) as min_copias,
                MAX(copias) as max_copias,
                AVG(copias) as avg_copias
            FROM (
                SELECT
                    ubicacion_id,
                    numero_factura,
                    linea,
                    COUNT(*) as copias
                FROM ventas_raw
                WHERE ubicacion_id IS NOT NULL
                  AND numero_factura IS NOT NULL
                  AND linea IS NOT NULL
                GROUP BY ubicacion_id, numero_factura, linea
                HAVING COUNT(*) > 1
            )
        """

        stats = conn.execute(query).fetchone()
        print(f"\n📊 Estadísticas de duplicados:")
        print(f"   Total de grupos con duplicados: {stats[0]:,}")
        print(f"   Total de registros duplicados: {stats[1]:,}")
        print(f"   Mínimo de copias: {stats[2]}")
        print(f"   Máximo de copias: {stats[3]}")
        print(f"   Promedio de copias: {stats[4]:.2f}")

        # Distribución de duplicados
        query = """
            SELECT
                copias,
                COUNT(*) as num_grupos,
                copias * COUNT(*) as total_registros
            FROM (
                SELECT
                    ubicacion_id,
                    numero_factura,
                    linea,
                    COUNT(*) as copias
                FROM ventas_raw
                WHERE ubicacion_id IS NOT NULL
                  AND numero_factura IS NOT NULL
                  AND linea IS NOT NULL
                GROUP BY ubicacion_id, numero_factura, linea
                HAVING COUNT(*) > 1
            )
            GROUP BY copias
            ORDER BY copias
            LIMIT 10
        """

        distribucion = conn.execute(query).fetchall()
        print(f"\n📈 Distribución de copias:")
        for row in distribucion:
            print(f"   {row[0]} copias: {row[1]:,} grupos = {row[2]:,} registros")

        # Duplicados por ubicación
        query = """
            SELECT
                ubicacion_id,
                COUNT(*) as grupos_duplicados,
                SUM(copias) as registros_duplicados
            FROM (
                SELECT
                    ubicacion_id,
                    numero_factura,
                    linea,
                    COUNT(*) as copias
                FROM ventas_raw
                WHERE ubicacion_id IS NOT NULL
                  AND numero_factura IS NOT NULL
                  AND linea IS NOT NULL
                GROUP BY ubicacion_id, numero_factura, linea
                HAVING COUNT(*) > 1
            )
            GROUP BY ubicacion_id
            ORDER BY registros_duplicados DESC
        """

        por_ubicacion = conn.execute(query).fetchall()
        print(f"\n🏪 Duplicados por ubicación (Top 10):")
        for row in por_ubicacion[:10]:
            print(f"   {row[0]:15s}: {row[1]:,} grupos, {row[2]:,} registros")

        # ========================================================================
        # 4. ANÁLISIS DE FECHAS DE CARGA
        # ========================================================================
        print("\n" + "=" * 80)
        print("4. ANÁLISIS DE FECHAS DE CARGA")
        print("=" * 80)

        query = """
            WITH duplicados AS (
                SELECT
                    ubicacion_id,
                    numero_factura,
                    linea
                FROM ventas_raw
                WHERE ubicacion_id IS NOT NULL
                  AND numero_factura IS NOT NULL
                  AND linea IS NOT NULL
                GROUP BY ubicacion_id, numero_factura, linea
                HAVING COUNT(*) > 1
                LIMIT 1000
            )
            SELECT
                v.ubicacion_id,
                v.numero_factura,
                v.linea,
                COUNT(DISTINCT DATE(v.fecha_carga)) as fechas_carga_distintas,
                MIN(v.fecha_carga) as primera_carga,
                MAX(v.fecha_carga) as ultima_carga
            FROM ventas_raw v
            INNER JOIN duplicados d
                ON v.ubicacion_id = d.ubicacion_id
                AND v.numero_factura = d.numero_factura
                AND v.linea = d.linea
            GROUP BY v.ubicacion_id, v.numero_factura, v.linea
            ORDER BY fechas_carga_distintas DESC
            LIMIT 10
        """

        fechas_carga = conn.execute(query).fetchall()
        print(f"\n📅 Ejemplos con diferentes fechas de carga:")
        for row in fechas_carga:
            print(f"   {row[0]}, {row[1]}, línea {row[2]}:")
            print(f"      {row[3]} fechas distintas: {row[4]} → {row[5]}")

        conn.close()

        print("\n" + "=" * 80)
        print(f"Fin: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)

    except Exception as e:
        print(f"\n❌ Error fatal: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
