#!/usr/bin/env python3
"""
Script interactivo para consultar resultados ABC v2.
"""

import duckdb
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"


def menu_principal():
    """Mostrar menú principal."""
    print("\n" + "=" * 70)
    print("CONSULTAS ABC V2 - SISTEMA INTERACTIVO")
    print("=" * 70)
    print("\n1. Resumen General")
    print("2. TOP 50 Productos por Valor")
    print("3. Productos Clase A (críticos)")
    print("4. Análisis por Categoría")
    print("5. Productos con Mayor Margen")
    print("6. Buscar producto por código")
    print("7. Verificación Pareto")
    print("8. Exportar a CSV")
    print("0. Salir")
    print()
    return input("Seleccione opción: ")


def resumen_general(conn):
    """Mostrar resumen general."""
    print("\n" + "=" * 70)
    print("RESUMEN GENERAL ABC V2")
    print("=" * 70)

    # Obtener periodo
    periodo = conn.execute("""
        SELECT MIN(fecha_inicio), MAX(fecha_fin), COUNT(*)
        FROM productos_abc_v2
    """).fetchone()

    print(f"\n📅 Periodo: {periodo[0]} a {periodo[1]}")
    print(f"📊 Total productos: {periodo[2]:,}\n")

    # Distribución por clase
    distribucion = conn.execute("""
        SELECT
            clasificacion_abc_valor,
            COUNT(*) as productos,
            ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as pct_productos,
            ROUND(SUM(valor_consumo_total), 2) as valor_total,
            ROUND(SUM(porcentaje_valor), 2) as pct_valor
        FROM productos_abc_v2
        GROUP BY clasificacion_abc_valor
        ORDER BY
            CASE clasificacion_abc_valor
                WHEN 'A' THEN 1
                WHEN 'B' THEN 2
                WHEN 'C' THEN 3
                ELSE 4
            END
    """).fetchall()

    print(f"{'Clase':<10} {'Productos':<12} {'% Prod':<10} {'Valor Total':<18} {'% Valor':<10}")
    print("-" * 70)

    for row in distribucion:
        print(f"{row[0]:<10} {row[1]:>6,} ({row[2]:>4.1f}%)  {row[2]:>4.1f}%    ${row[3]:>15,.2f}  {row[4]:>5.1f}%")


def top_productos(conn, limite=50):
    """Mostrar TOP productos."""
    print(f"\n" + "=" * 70)
    print(f"TOP {limite} PRODUCTOS POR VALOR")
    print("=" * 70)

    query = f"""
    SELECT
        abc.ranking_valor,
        abc.codigo_producto,
        COALESCE(v.descripcion_producto, 'N/A') as descripcion,
        COALESCE(v.categoria_producto, 'N/A') as categoria,
        abc.clasificacion_abc_valor,
        ROUND(abc.valor_consumo_total, 2) as valor,
        ROUND(abc.unidades_vendidas_total, 0) as unidades,
        ROUND(abc.porcentaje_acumulado, 2) as pct_acum
    FROM productos_abc_v2 abc
    LEFT JOIN (
        SELECT DISTINCT codigo_producto, descripcion_producto, categoria_producto
        FROM ventas_raw
    ) v ON abc.codigo_producto = v.codigo_producto
    WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    ORDER BY abc.ranking_valor
    LIMIT {limite}
    """

    result = conn.execute(query).fetchall()

    print(f"\n{'#':<4} {'Código':<10} {'Descripción':<35} {'Cat':<10} {'Valor':<15} {'%Acum':<8}")
    print("-" * 90)

    for row in result:
        desc = (row[2][:32] + '...') if len(row[2]) > 35 else row[2]
        cat = row[3][:8]
        print(f"{row[0]:<4} {row[1]:<10} {desc:<35} {cat:<10} ${row[5]:>12,.2f} {row[7]:>6.1f}%")


def productos_clase_a(conn):
    """Mostrar todos los productos clase A."""
    print("\n" + "=" * 70)
    print("PRODUCTOS CLASE A (CRÍTICOS)")
    print("=" * 70)

    query = """
    SELECT
        abc.ranking_valor,
        abc.codigo_producto,
        COALESCE(v.descripcion_producto, 'N/A') as descripcion,
        COALESCE(v.categoria_producto, 'N/A') as categoria,
        ROUND(abc.valor_consumo_total, 2) as valor,
        abc.numero_ubicaciones as tiendas
    FROM productos_abc_v2 abc
    LEFT JOIN (
        SELECT DISTINCT codigo_producto, descripcion_producto, categoria_producto
        FROM ventas_raw
    ) v ON abc.codigo_producto = v.codigo_producto
    WHERE abc.clasificacion_abc_valor = 'A'
    ORDER BY abc.ranking_valor
    """

    result = conn.execute(query).fetchall()

    print(f"\nTotal productos clase A: {len(result):,}")
    print(f"\n{'#':<4} {'Código':<10} {'Descripción':<35} {'Cat':<10} {'Valor':<15} {'Tiendas':<8}")
    print("-" * 90)

    for row in result:
        desc = (row[2][:32] + '...') if len(row[2]) > 35 else row[2]
        cat = row[3][:8]
        print(f"{row[0]:<4} {row[1]:<10} {desc:<35} {cat:<10} ${row[4]:>12,.2f} {row[5]:>5}")


def analisis_categoria(conn):
    """Análisis por categoría."""
    print("\n" + "=" * 70)
    print("ANÁLISIS POR CATEGORÍA")
    print("=" * 70)

    query = """
    SELECT
        v.categoria_producto as categoria,
        COUNT(DISTINCT abc.codigo_producto) as total_productos,
        COUNT(CASE WHEN abc.clasificacion_abc_valor = 'A' THEN 1 END) as productos_a,
        COUNT(CASE WHEN abc.clasificacion_abc_valor = 'B' THEN 1 END) as productos_b,
        COUNT(CASE WHEN abc.clasificacion_abc_valor = 'C' THEN 1 END) as productos_c,
        ROUND(SUM(abc.valor_consumo_total), 2) as valor_total,
        ROUND(
            SUM(CASE WHEN abc.clasificacion_abc_valor = 'A' THEN abc.valor_consumo_total ELSE 0 END) * 100.0 /
            NULLIF(SUM(abc.valor_consumo_total), 0),
            1
        ) as concentracion_a_pct
    FROM productos_abc_v2 abc
    LEFT JOIN (
        SELECT DISTINCT codigo_producto, categoria_producto
        FROM ventas_raw
    ) v ON abc.codigo_producto = v.codigo_producto
    WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
        AND v.categoria_producto IS NOT NULL
    GROUP BY v.categoria_producto
    ORDER BY valor_total DESC
    """

    result = conn.execute(query).fetchall()

    print(f"\n{'Categoría':<15} {'Total':<7} {'A':<4} {'B':<4} {'C':<5} {'Valor Total':<17} {'Conc A%':<8}")
    print("-" * 75)

    for row in result:
        cat = row[0][:13]
        print(f"{cat:<15} {row[1]:>5} {row[2]:>3} {row[3]:>3} {row[4]:>4} ${row[5]:>14,.2f} {row[6]:>6.1f}%")


def productos_mayor_margen(conn):
    """Productos con mayor margen."""
    print("\n" + "=" * 70)
    print("TOP 30 PRODUCTOS CON MAYOR MARGEN BRUTO")
    print("=" * 70)

    query = """
    SELECT
        abc.codigo_producto,
        COALESCE(v.descripcion_producto, 'N/A') as descripcion,
        abc.clasificacion_abc_valor,
        ROUND(abc.valor_consumo_total, 2) as costo,
        ROUND(abc.valor_venta_total, 2) as venta,
        ROUND(abc.margen_total, 2) as margen,
        ROUND((abc.margen_total / NULLIF(abc.valor_venta_total, 0)) * 100, 1) as margen_pct
    FROM productos_abc_v2 abc
    LEFT JOIN (
        SELECT DISTINCT codigo_producto, descripcion_producto
        FROM ventas_raw
    ) v ON abc.codigo_producto = v.codigo_producto
    WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
        AND abc.margen_total > 0
    ORDER BY abc.margen_total DESC
    LIMIT 30
    """

    result = conn.execute(query).fetchall()

    print(f"\n{'Código':<10} {'Descripción':<30} {'Clase':<6} {'Costo':<12} {'Venta':<12} {'Margen':<12} {'%':<6}")
    print("-" * 95)

    for row in result:
        desc = (row[1][:27] + '...') if len(row[1]) > 30 else row[1]
        print(f"{row[0]:<10} {desc:<30} {row[2]:<6} ${row[3]:>9,.2f} ${row[4]:>9,.2f} ${row[5]:>9,.2f} {row[6]:>5.1f}%")


def buscar_producto(conn):
    """Buscar producto por código."""
    codigo = input("\nIngrese código del producto: ").strip()

    if not codigo:
        print("⚠ Código inválido")
        return

    query = f"""
    SELECT
        abc.*,
        v.descripcion_producto,
        v.categoria_producto
    FROM productos_abc_v2 abc
    LEFT JOIN (
        SELECT DISTINCT codigo_producto, descripcion_producto, categoria_producto
        FROM ventas_raw
    ) v ON abc.codigo_producto = v.codigo_producto
    WHERE abc.codigo_producto = '{codigo}'
    """

    result = conn.execute(query).fetchone()

    if not result:
        print(f"✗ Producto {codigo} no encontrado en ABC v2")
        return

    print("\n" + "=" * 70)
    print(f"PRODUCTO: {codigo}")
    print("=" * 70)
    print(f"\nDescripción: {result[-2] or 'N/A'}")
    print(f"Categoría: {result[-1] or 'N/A'}")
    print(f"\n--- Clasificación ABC v2 ---")
    print(f"Clase: {result[16]}")
    print(f"Ranking: #{result[19]}")
    print(f"% Valor: {result[17]:.4f}%")
    print(f"% Acumulado: {result[18]:.2f}%")
    print(f"\n--- Métricas ---")
    print(f"Valor de consumo: ${result[13]:,.2f}")
    print(f"Unidades vendidas: {result[6]:,.0f}")
    print(f"Transacciones: {result[7]:,}")
    print(f"Ubicaciones: {result[8]}")
    print(f"Costo promedio: ${result[9]:,.4f}")
    print(f"Margen total: ${result[15]:,.2f}")


def verificar_pareto(conn):
    """Verificar cumplimiento del Principio de Pareto."""
    print("\n" + "=" * 70)
    print("VERIFICACIÓN PRINCIPIO DE PARETO (80/20)")
    print("=" * 70)

    query = """
    WITH totales AS (
        SELECT
            COUNT(*) as total_productos,
            SUM(valor_consumo_total) as valor_total
        FROM productos_abc_v2
        WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
    )
    SELECT
        abc.clasificacion_abc_valor,
        COUNT(*) as productos,
        ROUND(COUNT(*) * 100.0 / t.total_productos, 2) as pct_productos,
        ROUND(SUM(abc.porcentaje_valor), 2) as pct_valor
    FROM productos_abc_v2 abc
    CROSS JOIN totales t
    WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    GROUP BY abc.clasificacion_abc_valor, t.total_productos
    ORDER BY
        CASE abc.clasificacion_abc_valor
            WHEN 'A' THEN 1
            WHEN 'B' THEN 2
            WHEN 'C' THEN 3
        END
    """

    result = conn.execute(query).fetchall()

    print(f"\n{'Clase':<10} {'Productos':<15} {'% Productos':<15} {'% Valor':<15} {'Pareto':<20}")
    print("-" * 75)

    for row in result:
        pareto_check = ""
        if row[0] == 'A':
            if row[2] <= 25 and row[3] >= 75:
                pareto_check = "✓ Cumple Pareto"
            else:
                pareto_check = "~ Cercano a Pareto"

        print(f"{row[0]:<10} {row[1]:>7,} ({row[2]:>5.1f}%)  {row[2]:>5.1f}%          {row[3]:>5.1f}%         {pareto_check}")

    print("\nPareto ideal: ~20% de productos generan ~80% del valor")


def exportar_csv(conn):
    """Exportar a CSV."""
    filename = input("\nNombre del archivo (default: abc_v2_export.csv): ").strip()
    if not filename:
        filename = "abc_v2_export.csv"

    if not filename.endswith('.csv'):
        filename += '.csv'

    query = """
    SELECT
        abc.ranking_valor,
        abc.codigo_producto,
        v.descripcion_producto,
        v.categoria_producto,
        abc.clasificacion_abc_valor,
        abc.valor_consumo_total,
        abc.unidades_vendidas_total,
        abc.porcentaje_valor,
        abc.porcentaje_acumulado,
        abc.numero_ubicaciones,
        abc.margen_total
    FROM productos_abc_v2 abc
    LEFT JOIN (
        SELECT DISTINCT codigo_producto, descripcion_producto, categoria_producto
        FROM ventas_raw
    ) v ON abc.codigo_producto = v.codigo_producto
    WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
    ORDER BY abc.ranking_valor
    """

    conn.execute(f"COPY ({query}) TO '{filename}' (HEADER, DELIMITER ',')")
    print(f"\n✓ Exportado a: {filename}")


def main():
    """Función principal."""
    if not DB_PATH.exists():
        print(f"✗ No se encuentra la BD: {DB_PATH}")
        sys.exit(1)

    conn = duckdb.connect(str(DB_PATH), read_only=True)

    # Verificar que existan datos ABC v2
    count = conn.execute("SELECT COUNT(*) FROM productos_abc_v2").fetchone()[0]
    if count == 0:
        print("⚠ No hay datos ABC v2. Ejecutar primero: python3 calcular_abc_v2_adaptado.py")
        conn.close()
        sys.exit(1)

    try:
        while True:
            opcion = menu_principal()

            if opcion == '1':
                resumen_general(conn)
            elif opcion == '2':
                top_productos(conn, 50)
            elif opcion == '3':
                productos_clase_a(conn)
            elif opcion == '4':
                analisis_categoria(conn)
            elif opcion == '5':
                productos_mayor_margen(conn)
            elif opcion == '6':
                buscar_producto(conn)
            elif opcion == '7':
                verificar_pareto(conn)
            elif opcion == '8':
                exportar_csv(conn)
            elif opcion == '0':
                print("\n👋 Hasta luego!\n")
                break
            else:
                print("\n⚠ Opción inválida")

            input("\nPresione Enter para continuar...")

    except KeyboardInterrupt:
        print("\n\n⚠ Interrumpido\n")
    finally:
        conn.close()


if __name__ == '__main__':
    main()
