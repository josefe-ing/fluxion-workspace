#!/usr/bin/env python3
"""
Script para verificar resultados del cálculo ABC v2 + XYZ por tienda.
"""

import duckdb
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"

def main():
    conn = duckdb.connect(str(DB_PATH), read_only=True)

    print("\n=== PRODUCTO 003289 (HUEVOS) - Clasificación por Tienda ===\n")
    result = conn.execute("""
        SELECT
            ubicacion_id,
            clasificacion_abc_valor,
            clasificacion_xyz,
            matriz_abc_xyz,
            ranking_valor,
            ROUND(valor_consumo_total, 2) as valor_total,
            ROUND(coeficiente_variacion, 4) as cv,
            ROUND(demanda_promedio_semanal, 2) as dem_semanal
        FROM productos_abc_v2
        WHERE codigo_producto = '003289'
        ORDER BY ubicacion_id
    """).fetchall()

    print(f"{'Tienda':<12} {'ABC':<4} {'XYZ':<4} {'Matriz':<7} {'Rank':<5} {'Valor Total':<15} {'CV':<8} {'Dem/Sem'}")
    print("-" * 90)

    for row in result:
        print(f"{row[0]:<12} {row[1]:<4} {row[2]:<4} {row[3]:<7} {row[4]:<5} ${row[5]:<14,.2f} {row[6]:<8.4f} {row[7]:,.2f}")

    print(f"\n✓ Total registros: {len(result)}")

    # Verificar distribución general
    print("\n=== RESUMEN TOTAL DE REGISTROS ===\n")
    total = conn.execute("SELECT COUNT(*) FROM productos_abc_v2").fetchone()[0]
    con_xyz = conn.execute("SELECT COUNT(*) FROM productos_abc_v2 WHERE clasificacion_xyz IS NOT NULL").fetchone()[0]

    print(f"Total productos en productos_abc_v2: {total:,}")
    print(f"Productos con clasificación XYZ: {con_xyz:,}")

    # Verificar diferencias entre tiendas
    print("\n=== DIFERENCIAS ENTRE TIENDAS (Producto 003289) ===\n")

    abc_counts = conn.execute("""
        SELECT clasificacion_abc_valor, COUNT(*) as count
        FROM productos_abc_v2
        WHERE codigo_producto = '003289'
        GROUP BY clasificacion_abc_valor
        ORDER BY clasificacion_abc_valor
    """).fetchall()

    print("Clasificación ABC:")
    for abc, count in abc_counts:
        print(f"  {abc}: {count} tiendas")

    xyz_counts = conn.execute("""
        SELECT clasificacion_xyz, COUNT(*) as count
        FROM productos_abc_v2
        WHERE codigo_producto = '003289'
        GROUP BY clasificacion_xyz
        ORDER BY clasificacion_xyz
    """).fetchall()

    print("\nClasificación XYZ:")
    for xyz, count in xyz_counts:
        print(f"  {xyz}: {count} tiendas")

    matriz_counts = conn.execute("""
        SELECT matriz_abc_xyz, COUNT(*) as count
        FROM productos_abc_v2
        WHERE codigo_producto = '003289'
        GROUP BY matriz_abc_xyz
        ORDER BY matriz_abc_xyz
    """).fetchall()

    print("\nMatriz ABC-XYZ:")
    for matriz, count in matriz_counts:
        print(f"  {matriz}: {count} tiendas")

    # Ejemplo de productos críticos AZ por tienda
    print("\n=== PRODUCTOS AZ (CRÍTICOS) POR TIENDA ===\n")
    az_counts = conn.execute("""
        SELECT
            ubicacion_id,
            COUNT(*) as num_productos_az
        FROM productos_abc_v2
        WHERE matriz_abc_xyz = 'AZ'
        GROUP BY ubicacion_id
        ORDER BY num_productos_az DESC
    """).fetchall()

    print(f"{'Tienda':<12} {'Productos AZ'}")
    print("-" * 30)
    for ubicacion, count in az_counts:
        print(f"{ubicacion:<12} {count:,}")

    conn.close()
    print("\n✅ Verificación completada\n")

if __name__ == '__main__':
    main()
