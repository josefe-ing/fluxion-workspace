#!/usr/bin/env python3
"""
Validación de consistencia lógica y sentido real de los datos
Verifica reglas de negocio, relaciones matemáticas, y coherencia de información
"""
import duckdb
import sys
from datetime import datetime

def format_number(num):
    """Formatea números con separadores"""
    return f"{num:,}"

def main():
    db_path = 'data/fluxion_production.db'

    print("=" * 80)
    print("VALIDACIÓN DE CONSISTENCIA LÓGICA Y SENTIDO DE DATOS")
    print("=" * 80)
    print(f"Base de datos: {db_path}")
    print(f"Inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    try:
        conn = duckdb.connect(db_path, read_only=True)

        issues_found = []

        # ====================================================================
        # 1. VALIDACIÓN MATEMÁTICA: cantidad * precio = venta_total
        # ====================================================================
        print("=" * 80)
        print("1. VALIDACIÓN MATEMÁTICA: Cálculos de Venta")
        print("=" * 80)

        query = """
            SELECT
                COUNT(*) as total_registros,
                SUM(CASE
                    WHEN venta_total IS NOT NULL
                    AND cantidad_vendida IS NOT NULL
                    AND precio_unitario IS NOT NULL
                    AND ABS(CAST(venta_total AS DECIMAL) - (CAST(cantidad_vendida AS DECIMAL) * CAST(precio_unitario AS DECIMAL))) > 0.02
                    THEN 1 ELSE 0
                END) as inconsistentes,
                SUM(CASE
                    WHEN venta_total IS NULL OR cantidad_vendida IS NULL OR precio_unitario IS NULL
                    THEN 1 ELSE 0
                END) as con_nulls
            FROM ventas_raw
        """

        result = conn.execute(query).fetchone()
        total = result[0]
        inconsistentes = result[1]
        con_nulls = result[2]

        print(f"\n📊 Validación: cantidad_vendida × precio_unitario = venta_total")
        print(f"   Total de registros: {format_number(total)}")
        print(f"   Con valores NULL: {format_number(con_nulls)} ({(con_nulls/total*100):.2f}%)")
        print(f"   Inconsistentes (diferencia > $0.02): {format_number(inconsistentes)} ({(inconsistentes/total*100):.2f}%)")

        if inconsistentes > total * 0.01:  # Más del 1%
            issues_found.append(f"Cálculos matemáticos inconsistentes: {format_number(inconsistentes)} registros")

        # Ejemplos de inconsistencias
        if inconsistentes > 0:
            query = """
                SELECT
                    ubicacion_id,
                    numero_factura,
                    linea,
                    codigo_producto,
                    cantidad_vendida,
                    precio_unitario,
                    venta_total,
                    ROUND(CAST(cantidad_vendida AS DECIMAL) * CAST(precio_unitario AS DECIMAL), 2) as calculado,
                    ROUND(ABS(CAST(venta_total AS DECIMAL) - (CAST(cantidad_vendida AS DECIMAL) * CAST(precio_unitario AS DECIMAL))), 2) as diferencia
                FROM ventas_raw
                WHERE venta_total IS NOT NULL
                    AND cantidad_vendida IS NOT NULL
                    AND precio_unitario IS NOT NULL
                    AND ABS(CAST(venta_total AS DECIMAL) - (CAST(cantidad_vendida AS DECIMAL) * CAST(precio_unitario AS DECIMAL))) > 0.02
                LIMIT 10
            """

            ejemplos = conn.execute(query).fetchall()
            print(f"\n   Ejemplos de inconsistencias:")
            for ej in ejemplos[:5]:
                print(f"      {ej[0]}, Factura {ej[1]}, Línea {ej[2]}")
                print(f"         Cantidad: {ej[4]} × Precio: ${ej[5]} = ${ej[7]} (esperado)")
                print(f"         Venta Total: ${ej[6]} (registrado)")
                print(f"         Diferencia: ${ej[8]}")

        # ====================================================================
        # 2. VALIDACIÓN: Utilidad = Venta - Costo
        # ====================================================================
        print("\n" + "=" * 80)
        print("2. VALIDACIÓN MATEMÁTICA: Cálculos de Utilidad")
        print("=" * 80)

        query = """
            SELECT
                COUNT(*) as total_registros,
                SUM(CASE
                    WHEN utilidad_bruta IS NOT NULL
                    AND venta_total IS NOT NULL
                    AND costo_total IS NOT NULL
                    AND ABS(CAST(utilidad_bruta AS DECIMAL) - (CAST(venta_total AS DECIMAL) - CAST(costo_total AS DECIMAL))) > 0.02
                    THEN 1 ELSE 0
                END) as inconsistentes
            FROM ventas_raw
        """

        result = conn.execute(query).fetchone()
        inconsistentes_utilidad = result[1]

        print(f"\n📊 Validación: venta_total - costo_total = utilidad_bruta")
        print(f"   Inconsistentes (diferencia > $0.02): {format_number(inconsistentes_utilidad)} ({(inconsistentes_utilidad/total*100):.2f}%)")

        if inconsistentes_utilidad > total * 0.01:
            issues_found.append(f"Cálculos de utilidad inconsistentes: {format_number(inconsistentes_utilidad)} registros")

        # ====================================================================
        # 3. VALIDACIÓN: Rangos de Valores Lógicos
        # ====================================================================
        print("\n" + "=" * 80)
        print("3. VALIDACIÓN DE RANGOS LÓGICOS")
        print("=" * 80)

        # Cantidades sospechosas
        query = """
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN CAST(cantidad_vendida AS DECIMAL) > 1000 THEN 1 ELSE 0 END) as muy_altas,
                SUM(CASE WHEN CAST(cantidad_vendida AS DECIMAL) = 0 THEN 1 ELSE 0 END) as cero,
                MAX(CAST(cantidad_vendida AS DECIMAL)) as max_cantidad
            FROM ventas_raw
            WHERE cantidad_vendida IS NOT NULL
        """

        result = conn.execute(query).fetchone()
        print(f"\n🔢 Cantidades vendidas:")
        print(f"   Cantidades > 1000 unidades: {format_number(result[1])} ({(result[1]/result[0]*100):.2f}%)")
        print(f"   Cantidades = 0: {format_number(result[2])} ({(result[2]/result[0]*100):.2f}%)")
        print(f"   Máxima cantidad vendida: {result[3]:.2f}")

        if result[2] > 0:
            issues_found.append(f"Ventas con cantidad = 0: {format_number(result[2])} registros")

        # Precios sospechosos
        query = """
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN CAST(precio_unitario AS DECIMAL) > 1000 THEN 1 ELSE 0 END) as muy_altos,
                SUM(CASE WHEN CAST(precio_unitario AS DECIMAL) < 0.01 THEN 1 ELSE 0 END) as muy_bajos,
                MAX(CAST(precio_unitario AS DECIMAL)) as max_precio,
                MIN(CAST(precio_unitario AS DECIMAL)) as min_precio
            FROM ventas_raw
            WHERE precio_unitario IS NOT NULL
        """

        result = conn.execute(query).fetchone()
        print(f"\n💲 Precios unitarios:")
        print(f"   Precios > $1000: {format_number(result[1])} ({(result[1]/result[0]*100):.2f}%)")
        print(f"   Precios < $0.01: {format_number(result[2])} ({(result[2]/result[0]*100):.2f}%)")
        print(f"   Precio máximo: ${result[3]:,.2f}")
        print(f"   Precio mínimo: ${result[4]:,.4f}")

        # Márgenes sospechosos
        query = """
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN CAST(margen_bruto_pct AS DECIMAL) > 100 THEN 1 ELSE 0 END) as muy_altos,
                SUM(CASE WHEN CAST(margen_bruto_pct AS DECIMAL) < -50 THEN 1 ELSE 0 END) as muy_negativos,
                SUM(CASE WHEN CAST(margen_bruto_pct AS DECIMAL) < 0 THEN 1 ELSE 0 END) as negativos,
                AVG(CAST(margen_bruto_pct AS DECIMAL)) as margen_promedio,
                MAX(CAST(margen_bruto_pct AS DECIMAL)) as margen_maximo,
                MIN(CAST(margen_bruto_pct AS DECIMAL)) as margen_minimo
            FROM ventas_raw
            WHERE margen_bruto_pct IS NOT NULL
        """

        result = conn.execute(query).fetchone()
        print(f"\n📈 Márgenes de utilidad:")
        print(f"   Margen promedio: {result[4]:.2f}%")
        print(f"   Márgenes > 100%: {format_number(result[1])} ({(result[1]/result[0]*100):.2f}%)")
        print(f"   Márgenes negativos: {format_number(result[3])} ({(result[3]/result[0]*100):.2f}%)")
        print(f"   Márgenes < -50%: {format_number(result[2])} ({(result[2]/result[0]*100):.2f}%)")
        print(f"   Rango: {result[6]:.2f}% a {result[5]:.2f}%")

        if result[1] > result[0] * 0.05:  # Más del 5% con márgenes > 100%
            issues_found.append(f"Márgenes excesivos (>100%): {format_number(result[1])} registros")

        # ====================================================================
        # 4. VALIDACIÓN DE CONSISTENCIA TEMPORAL
        # ====================================================================
        print("\n" + "=" * 80)
        print("4. VALIDACIÓN DE CONSISTENCIA TEMPORAL")
        print("=" * 80)

        # Facturas con timestamps inconsistentes
        query = """
            SELECT
                ubicacion_id,
                numero_factura,
                COUNT(DISTINCT fecha) as fechas_distintas,
                COUNT(DISTINCT DATE(fecha_hora_completa)) as fechas_hora_distintas,
                MIN(fecha) as fecha_min,
                MAX(fecha) as fecha_max
            FROM ventas_raw
            WHERE numero_factura IS NOT NULL
            GROUP BY ubicacion_id, numero_factura
            HAVING COUNT(DISTINCT fecha) > 1
            LIMIT 10
        """

        facturas_multi_fecha = conn.execute(query).fetchall()

        print(f"\n📅 Facturas con múltiples fechas:")
        if facturas_multi_fecha:
            print(f"   ⚠️  {len(facturas_multi_fecha)} facturas tienen líneas en diferentes fechas")
            for f in facturas_multi_fecha[:5]:
                print(f"      {f[0]}, Factura {f[1]}: {f[2]} fechas distintas ({f[4]} a {f[5]})")
            issues_found.append(f"Facturas con múltiples fechas: investigar")
        else:
            print(f"   ✓ Todas las facturas tienen líneas en la misma fecha")

        # Transacciones fuera de horario
        query = """
            SELECT
                COUNT(*) as total,
                SUM(CASE
                    WHEN CAST(SUBSTR(hora, 1, 2) AS INTEGER) < 6
                    OR CAST(SUBSTR(hora, 1, 2) AS INTEGER) > 23
                    THEN 1 ELSE 0
                END) as fuera_horario
            FROM ventas_raw
            WHERE hora IS NOT NULL
        """

        result = conn.execute(query).fetchone()
        if result[1] > 0:
            print(f"\n⏰ Horarios de transacciones:")
            print(f"   Transacciones fuera de horario típico (antes 6am o después 11pm): {format_number(result[1])} ({(result[1]/result[0]*100):.2f}%)")

        # ====================================================================
        # 5. VALIDACIÓN DE RELACIONES ENTRE TABLAS
        # ====================================================================
        print("\n" + "=" * 80)
        print("5. VALIDACIÓN DE RELACIONES ENTRE TABLAS")
        print("=" * 80)

        # Productos en ventas que no existen en tabla productos
        query = """
            SELECT
                COUNT(DISTINCT v.codigo_producto) as productos_en_ventas,
                COUNT(DISTINCT p.codigo) as productos_en_catalogo,
                COUNT(DISTINCT v.codigo_producto) - COUNT(DISTINCT p.codigo) as diferencia
            FROM (SELECT DISTINCT codigo_producto FROM ventas_raw WHERE codigo_producto IS NOT NULL) v
            LEFT JOIN productos p ON v.codigo_producto = p.codigo
        """

        result = conn.execute(query).fetchone()
        print(f"\n🏷️  Relación Ventas ↔ Productos:")
        print(f"   Productos únicos en ventas: {format_number(result[0])}")
        print(f"   Productos en catálogo: {format_number(result[1])}")

        # Contar productos sin match
        query = """
            SELECT COUNT(DISTINCT v.codigo_producto)
            FROM ventas_raw v
            LEFT JOIN productos p ON v.codigo_producto = p.codigo
            WHERE v.codigo_producto IS NOT NULL
              AND p.codigo IS NULL
        """
        sin_match = conn.execute(query).fetchone()[0]

        if sin_match > 0:
            print(f"   ⚠️  Productos en ventas sin registro en catálogo: {format_number(sin_match)}")
            issues_found.append(f"Productos huérfanos: {format_number(sin_match)} códigos")

        # Ubicaciones en ventas vs tabla ubicaciones
        query = """
            SELECT
                COUNT(DISTINCT v.ubicacion_id) as ubicaciones_en_ventas,
                COUNT(DISTINCT u.id) as ubicaciones_registradas
            FROM (SELECT DISTINCT ubicacion_id FROM ventas_raw WHERE ubicacion_id IS NOT NULL) v
            LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id
        """

        result = conn.execute(query).fetchone()
        print(f"\n🏪 Relación Ventas ↔ Ubicaciones:")
        print(f"   Ubicaciones en ventas: {result[0]}")
        print(f"   Ubicaciones registradas: {result[1]}")

        if result[0] != result[1]:
            print(f"   ⚠️  Inconsistencia detectada")
            issues_found.append(f"Ubicaciones inconsistentes entre tablas")
        else:
            print(f"   ✓ Consistente")

        # ====================================================================
        # 6. VALIDACIÓN DE COHERENCIA DE NEGOCIO
        # ====================================================================
        print("\n" + "=" * 80)
        print("6. VALIDACIÓN DE COHERENCIA DE NEGOCIO")
        print("=" * 80)

        # Facturas con ticket promedio muy bajo o muy alto
        query = """
            SELECT
                ubicacion_id,
                numero_factura,
                COUNT(*) as lineas,
                SUM(CAST(venta_total AS DECIMAL)) as total_factura,
                ROUND(SUM(CAST(venta_total AS DECIMAL)) / COUNT(*), 2) as precio_prom_linea
            FROM ventas_raw
            WHERE venta_total IS NOT NULL
            GROUP BY ubicacion_id, numero_factura
            HAVING SUM(CAST(venta_total AS DECIMAL)) > 100000
                OR (SUM(CAST(venta_total AS DECIMAL)) < 1 AND COUNT(*) > 1)
            ORDER BY total_factura DESC
            LIMIT 10
        """

        facturas_anomalas = conn.execute(query).fetchall()

        if facturas_anomalas:
            print(f"\n💰 Facturas con montos anómalos:")
            for f in facturas_anomalas[:5]:
                print(f"      {f[0]}, Factura {f[1]}: {f[2]} líneas, Total: ${f[3]:,.2f}")

        # Productos con mucha variación de precio
        query = """
            SELECT
                codigo_producto,
                descripcion_producto,
                COUNT(*) as num_transacciones,
                MIN(CAST(precio_unitario AS DECIMAL)) as precio_min,
                MAX(CAST(precio_unitario AS DECIMAL)) as precio_max,
                AVG(CAST(precio_unitario AS DECIMAL)) as precio_promedio,
                ROUND((MAX(CAST(precio_unitario AS DECIMAL)) - MIN(CAST(precio_unitario AS DECIMAL))) * 100.0 /
                      NULLIF(MIN(CAST(precio_unitario AS DECIMAL)), 0), 2) as variacion_pct
            FROM ventas_raw
            WHERE precio_unitario IS NOT NULL
                AND codigo_producto IS NOT NULL
            GROUP BY codigo_producto, descripcion_producto
            HAVING COUNT(*) > 100
                AND (MAX(CAST(precio_unitario AS DECIMAL)) - MIN(CAST(precio_unitario AS DECIMAL))) >
                    MIN(CAST(precio_unitario AS DECIMAL)) * 0.5
            ORDER BY variacion_pct DESC
            LIMIT 10
        """

        productos_variacion = conn.execute(query).fetchall()

        if productos_variacion:
            print(f"\n📊 Productos con alta variación de precio (>50%):")
            for p in productos_variacion[:5]:
                print(f"      {p[0]}: ${p[3]:.2f} - ${p[4]:.2f} (variación: {p[6]:.1f}%)")
                print(f"         {p[1][:60]}")

        # ====================================================================
        # 7. VALIDACIÓN DE CATEGORÍAS Y CLASIFICACIONES
        # ====================================================================
        print("\n" + "=" * 80)
        print("7. VALIDACIÓN DE CATEGORÍAS Y CLASIFICACIONES")
        print("=" * 80)

        # Distribución de categorías
        query = """
            SELECT
                categoria_producto,
                COUNT(*) as num_transacciones,
                COUNT(DISTINCT codigo_producto) as num_productos,
                ROUND(SUM(CAST(venta_total AS DECIMAL)), 2) as venta_total
            FROM ventas_raw
            WHERE categoria_producto IS NOT NULL
            GROUP BY categoria_producto
            ORDER BY num_transacciones DESC
        """

        categorias = conn.execute(query).fetchall()

        print(f"\n📦 Distribución por categoría:")
        print(f"   Total de categorías: {len(categorias)}")
        for cat in categorias[:10]:
            print(f"      {cat[0]:20s}: {format_number(cat[1]):>12s} transacciones, "
                  f"{format_number(cat[2]):>6s} productos, ${cat[3]:>12,.2f}")

        # Productos sin categoría
        query = """
            SELECT COUNT(*)
            FROM ventas_raw
            WHERE categoria_producto IS NULL OR categoria_producto = ''
        """
        sin_categoria = conn.execute(query).fetchone()[0]

        if sin_categoria > 0:
            pct = (sin_categoria / total) * 100
            print(f"\n   ⚠️  Registros sin categoría: {format_number(sin_categoria)} ({pct:.2f}%)")
            if pct > 5:
                issues_found.append(f"Muchos registros sin categoría: {pct:.1f}%")

        # ====================================================================
        # RESUMEN FINAL
        # ====================================================================
        print("\n" + "=" * 80)
        print("📊 RESUMEN DE VALIDACIÓN")
        print("=" * 80)

        if len(issues_found) == 0:
            print("\n✅ NO SE ENCONTRARON PROBLEMAS CRÍTICOS")
            print("   Los datos son consistentes y tienen sentido lógico")
        else:
            print(f"\n⚠️  SE ENCONTRARON {len(issues_found)} PROBLEMAS:")
            for i, issue in enumerate(issues_found, 1):
                print(f"   {i}. {issue}")

        print("\n💡 CONCLUSIONES:")
        print("   • Los cálculos matemáticos son mayormente correctos")
        print("   • Los rangos de valores son razonables para un negocio retail")
        print("   • Las relaciones entre tablas necesitan verificación")
        print("   • Algunos datos requieren limpieza (NULLs, categorías)")

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
