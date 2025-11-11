#!/usr/bin/env python3
"""
Script interactivo para consultar resultados XYZ y Matriz ABC-XYZ.
"""

import duckdb
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"


def menu_principal():
    """Mostrar menú principal."""
    print("\n" + "=" * 70)
    print("CONSULTAS XYZ - SISTEMA INTERACTIVO")
    print("=" * 70)
    print("\n1. Resumen de Matriz ABC-XYZ")
    print("2. Productos AZ (Críticos + Erráticos)")
    print("3. Productos AX/BX (Ideales - Estables)")
    print("4. Productos CZ (Baja prioridad + Erráticos)")
    print("5. Distribución por Clasificación XYZ")
    print("6. Productos Extremadamente Volátiles (CV > 2.0)")
    print("7. Buscar producto por código")
    print("8. Análisis de Confiabilidad")
    print("9. Exportar a CSV")
    print("0. Salir")
    print()
    return input("Seleccione opción: ")


def resumen_matriz(conn):
    """Mostrar resumen de la matriz ABC-XYZ."""
    print("\n" + "=" * 70)
    print("RESUMEN MATRIZ ABC-XYZ")
    print("=" * 70)

    result = conn.execute("""
        SELECT * FROM vista_matriz_abc_xyz
    """).fetchall()

    print(f"\n{'Matriz':<8} {'#Prod':<8} {'%Prod':<8} {'Valor Total':<15} {'%Valor':<8} {'CV Prom':<10}")
    print("-" * 75)

    for row in result:
        print(f"{row[0]:<8} {row[1]:<8,} {row[2]:<8.1f} ${row[3]:<14,.2f} {row[4]:<8.2f} {row[5]:<10.4f}")


def productos_az(conn):
    """Mostrar productos AZ (alto valor + errático)."""
    print("\n" + "=" * 70)
    print("PRODUCTOS AZ - ALTO VALOR + DEMANDA ERRÁTICA")
    print("=" * 70)

    result = conn.execute("""
        SELECT * FROM vista_productos_az_criticos
        LIMIT 30
    """).fetchall()

    print(f"\nTotal productos AZ: {len(result):,}")
    print(f"\n{'Código':<10} {'Valor':<15} {'CV':<10} {'Dem/Sem':<12} {'Conf':<8} {'Alerta'}")
    print("-" * 80)

    for row in result:
        print(f"{row[0]:<10} ${row[1]:<14,.2f} {row[2]:<10.4f} {row[3]:<12.2f} {row[6]:<8} {row[9]}")


def productos_ax_bx(conn):
    """Mostrar productos AX/BX (ideales)."""
    print("\n" + "=" * 70)
    print("PRODUCTOS AX/BX - ALTO VALOR + DEMANDA ESTABLE (IDEALES)")
    print("=" * 70)

    result = conn.execute("""
        SELECT * FROM vista_productos_ax_bx
        LIMIT 30
    """).fetchall()

    print(f"\nTotal productos AX/BX: {len(result):,}")
    print(f"\n{'Código':<10} {'Clase':<6} {'Valor':<15} {'CV':<10} {'Dem/Sem':<12} {'Estrategia'}")
    print("-" * 85)

    for row in result:
        estrategia_short = row[6][:30] if len(row[6]) > 30 else row[6]
        print(f"{row[0]:<10} {row[1]:<6} ${row[2]:<14,.2f} {row[3]:<10.4f} {row[4]:<12.2f} {estrategia_short}")


def productos_cz(conn):
    """Mostrar productos CZ (baja prioridad + errático)."""
    print("\n" + "=" * 70)
    print("PRODUCTOS CZ - BAJA PRIORIDAD + DEMANDA ERRÁTICA")
    print("=" * 70)

    result = conn.execute("""
        SELECT
            codigo_producto,
            coeficiente_variacion,
            demanda_promedio_semanal,
            semanas_con_venta,
            confiabilidad_calculo,
            CASE
                WHEN semanas_con_venta < 4 THEN 'CANDIDATO_DESCONTINUACION'
                WHEN coeficiente_variacion > 3.0 THEN 'STOCK_BAJO_SOLO_DEMANDA'
                ELSE 'MANTENER_STOCK_MINIMO'
            END as recomendacion
        FROM productos_abc_v2
        WHERE matriz_abc_xyz = 'CZ'
        ORDER BY coeficiente_variacion DESC
        LIMIT 30
    """).fetchall()

    print(f"\nTotal productos CZ: {len(result):,}")
    print(f"\n{'Código':<10} {'CV':<10} {'Dem/Sem':<12} {'Sem':<5} {'Conf':<8} {'Recomendación'}")
    print("-" * 80)

    for row in result:
        print(f"{row[0]:<10} {row[1]:<10.4f} {row[2]:<12.2f} {row[3]:<5} {row[4]:<8} {row[5]}")


def distribucion_xyz(conn):
    """Mostrar distribución por clasificación XYZ."""
    print("\n" + "=" * 70)
    print("DISTRIBUCIÓN POR CLASIFICACIÓN XYZ")
    print("=" * 70)

    result = conn.execute("""
        SELECT
            clasificacion_xyz,
            COUNT(*) as productos,
            ROUND(AVG(coeficiente_variacion), 4) as cv_promedio,
            ROUND(MIN(coeficiente_variacion), 4) as cv_min,
            ROUND(MAX(coeficiente_variacion), 4) as cv_max,
            ROUND(AVG(demanda_promedio_semanal), 2) as demanda_promedio,
            COUNT(CASE WHEN confiabilidad_calculo = 'ALTA' THEN 1 END) as alta_conf
        FROM productos_abc_v2
        WHERE clasificacion_xyz IS NOT NULL
        GROUP BY clasificacion_xyz
        ORDER BY clasificacion_xyz
    """).fetchall()

    print(f"\n{'Clase':<6} {'#Prod':<8} {'CV Prom':<10} {'CV Min':<10} {'CV Max':<10} {'Dem Prom':<12} {'Alta Conf'}")
    print("-" * 75)

    for row in result:
        print(f"{row[0]:<6} {row[1]:<8,} {row[2]:<10.4f} {row[3]:<10.4f} {row[4]:<10.4f} {row[5]:<12.2f} {row[6]:,}")

    print("\n📖 Interpretación:")
    print("   X (CV < 0.5):  Demanda estable y predecible → Fácil de gestionar")
    print("   Y (0.5≤CV<1.0): Demanda variable con tendencia → Requiere monitoreo")
    print("   Z (CV ≥ 1.0):  Demanda errática → Difícil de predecir, riesgo alto")


def productos_volatiles(conn):
    """Mostrar productos extremadamente volátiles."""
    print("\n" + "=" * 70)
    print("PRODUCTOS EXTREMADAMENTE VOLÁTILES (CV > 2.0)")
    print("=" * 70)

    result = conn.execute("""
        SELECT
            codigo_producto,
            clasificacion_abc_valor,
            clasificacion_xyz,
            matriz_abc_xyz,
            coeficiente_variacion,
            demanda_promedio_semanal,
            confiabilidad_calculo
        FROM productos_abc_v2
        WHERE es_extremadamente_volatil = true
        ORDER BY coeficiente_variacion DESC
        LIMIT 30
    """).fetchall()

    print(f"\n⚠️  Total productos con CV > 2.0: {len(result):,}")
    print(f"\n{'Código':<10} {'ABC':<4} {'XYZ':<4} {'Matriz':<7} {'CV':<10} {'Dem/Sem':<12} {'Conf'}")
    print("-" * 70)

    for row in result:
        print(f"{row[0]:<10} {row[1]:<4} {row[2]:<4} {row[3]:<7} {row[4]:<10.4f} {row[5]:<12.2f} {row[6]}")


def buscar_producto(conn):
    """Buscar producto por código."""
    codigo = input("\nIngrese código del producto: ").strip()

    if not codigo:
        print("⚠ Código inválido")
        return

    result = conn.execute(f"""
        SELECT
            codigo_producto,
            clasificacion_abc_valor,
            clasificacion_xyz,
            matriz_abc_xyz,
            coeficiente_variacion,
            demanda_promedio_semanal,
            desviacion_estandar_semanal,
            semanas_con_venta,
            semanas_analizadas,
            confiabilidad_calculo,
            es_extremadamente_volatil,
            ranking_valor
        FROM productos_abc_v2
        WHERE codigo_producto = '{codigo}'
    """).fetchone()

    if not result:
        print(f"✗ Producto {codigo} no encontrado")
        return

    print("\n" + "=" * 70)
    print(f"PRODUCTO: {codigo}")
    print("=" * 70)

    print(f"\n--- Clasificación ---")
    print(f"ABC (Valor):     {result[1]}")
    print(f"XYZ (Variab):    {result[2]}")
    print(f"Matriz:          {result[3]}")
    print(f"Ranking:         #{result[11]}")

    print(f"\n--- Métricas de Variabilidad ---")
    print(f"Coef. Variación: {result[4]:.4f}")
    print(f"Demanda Prom/Sem: {result[5]:,.2f} unidades")
    print(f"Desv. Estándar:  {result[6]:,.2f}")
    print(f"Semanas con venta: {result[7]}/{result[8]}")

    print(f"\n--- Confiabilidad y Flags ---")
    print(f"Confiabilidad:   {result[9]}")
    print(f"Muy volátil:     {'SÍ 🔥' if result[10] else 'No'}")

    # Interpretación
    print(f"\n--- Interpretación ---")
    cv = result[4]
    if cv < 0.5:
        print("✓ Demanda ESTABLE - Fácil de planificar y gestionar")
    elif cv < 1.0:
        print("~ Demanda VARIABLE - Requiere monitoreo regular")
    else:
        print("⚠️ Demanda ERRÁTICA - Difícil de predecir, alto riesgo")

    if result[3] == 'AZ':
        print("\n🔥 ALERTA: Producto crítico con demanda impredecible")
        print("   → Requiere atención especial para evitar quiebres")


def analisis_confiabilidad(conn):
    """Análisis de confiabilidad del cálculo."""
    print("\n" + "=" * 70)
    print("ANÁLISIS DE CONFIABILIDAD DEL CÁLCULO XYZ")
    print("=" * 70)

    result = conn.execute("""
        SELECT
            clasificacion_abc_valor,
            clasificacion_xyz,
            confiabilidad_calculo,
            COUNT(*) as num_productos,
            ROUND(AVG(semanas_con_venta), 1) as promedio_semanas_venta,
            ROUND(AVG(coeficiente_variacion), 4) as cv_promedio
        FROM productos_abc_v2
        WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
          AND clasificacion_xyz IS NOT NULL
        GROUP BY
            clasificacion_abc_valor,
            clasificacion_xyz,
            confiabilidad_calculo
        ORDER BY
            clasificacion_abc_valor,
            clasificacion_xyz,
            CASE confiabilidad_calculo
                WHEN 'ALTA' THEN 1
                WHEN 'MEDIA' THEN 2
                WHEN 'BAJA' THEN 3
            END
    """).fetchall()

    print(f"\n{'ABC':<4} {'XYZ':<4} {'Confiab':<8} {'#Prod':<8} {'Sem Prom':<10} {'CV Prom'}")
    print("-" * 60)

    for row in result:
        print(f"{row[0]:<4} {row[1]:<4} {row[2]:<8} {row[3]:<8,} {row[4]:<10.1f} {row[5]:.4f}")


def exportar_csv(conn):
    """Exportar a CSV."""
    filename = input("\nNombre del archivo (default: xyz_export.csv): ").strip()
    if not filename:
        filename = "xyz_export.csv"

    if not filename.endswith('.csv'):
        filename += '.csv'

    query = """
    SELECT
        codigo_producto,
        clasificacion_abc_valor,
        clasificacion_xyz,
        matriz_abc_xyz,
        coeficiente_variacion,
        demanda_promedio_semanal,
        desviacion_estandar_semanal,
        semanas_con_venta,
        confiabilidad_calculo,
        es_extremadamente_volatil,
        ranking_valor
    FROM productos_abc_v2
    WHERE clasificacion_xyz IS NOT NULL
    ORDER BY ranking_valor
    """

    conn.execute(f"COPY ({query}) TO '{filename}' (HEADER, DELIMITER ',')")
    print(f"\n✓ Exportado a: {filename}")


def main():
    """Función principal."""
    if not DB_PATH.exists():
        print(f"✗ No se encuentra la BD: {DB_PATH}")
        sys.exit(1)

    conn = duckdb.connect(str(DB_PATH), read_only=True)

    # Verificar que existan datos XYZ
    count = conn.execute("""
        SELECT COUNT(*) FROM productos_abc_v2 WHERE clasificacion_xyz IS NOT NULL
    """).fetchone()[0]

    if count == 0:
        print("⚠ No hay datos XYZ. Ejecutar primero: python3 calcular_xyz.py")
        conn.close()
        sys.exit(1)

    try:
        while True:
            opcion = menu_principal()

            if opcion == '1':
                resumen_matriz(conn)
            elif opcion == '2':
                productos_az(conn)
            elif opcion == '3':
                productos_ax_bx(conn)
            elif opcion == '4':
                productos_cz(conn)
            elif opcion == '5':
                distribucion_xyz(conn)
            elif opcion == '6':
                productos_volatiles(conn)
            elif opcion == '7':
                buscar_producto(conn)
            elif opcion == '8':
                analisis_confiabilidad(conn)
            elif opcion == '9':
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
