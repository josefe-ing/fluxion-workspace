#!/usr/bin/env python3
"""
Ejemplo de uso del sistema ABC v2 desde Python.

Este script muestra cómo:
1. Conectar a la base de datos
2. Ejecutar el cálculo ABC v2
3. Consultar resultados
4. Generar reportes
"""

import duckdb
import pandas as pd
from pathlib import Path

# Configuración
DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"


def conectar_bd():
    """Conectar a la base de datos."""
    return duckdb.connect(str(DB_PATH))


def mostrar_kpis(conn):
    """Mostrar KPIs principales del ABC v2."""
    print("\n" + "=" * 70)
    print("KPIs PRINCIPALES - ABC V2")
    print("=" * 70)

    df = conn.execute("SELECT * FROM v_dashboard_abc_kpis").fetchdf()

    print(f"\n📊 Total productos analizados: {df['total_productos'].iloc[0]:,}")
    print(f"💰 Valor total de consumo: ${df['valor_total_consumo'].iloc[0]:,.2f}")

    print(f"\n🟢 Clase A:")
    print(f"   - Productos: {df['productos_clase_a'].iloc[0]} ({df['porcentaje_productos_a'].iloc[0]:.1f}%)")
    print(f"   - Valor: ${df['valor_clase_a'].iloc[0]:,.2f} ({df['porcentaje_valor_a'].iloc[0]:.1f}%)")

    print(f"\n🟡 Clase B:")
    print(f"   - Productos: {df['productos_clase_b'].iloc[0]} ({df['porcentaje_productos_b'].iloc[0]:.1f}%)")
    print(f"   - Valor: ${df['valor_clase_b'].iloc[0]:,.2f} ({df['porcentaje_valor_b'].iloc[0]:.1f}%)")

    print(f"\n🔴 Clase C:")
    print(f"   - Productos: {df['productos_clase_c'].iloc[0]} ({df['porcentaje_productos_c'].iloc[0]:.1f}%)")
    print(f"   - Valor: ${df['valor_clase_c'].iloc[0]:,.2f} ({df['porcentaje_valor_c'].iloc[0]:.1f}%)")

    print(f"\n✅ Cumple Pareto: {df['cumple_pareto'].iloc[0]}")
    print(f"📅 Periodo: {df['periodo_desde'].iloc[0]} a {df['periodo_hasta'].iloc[0]}")


def mostrar_top_productos(conn, limite=20):
    """Mostrar TOP productos por valor."""
    print("\n" + "=" * 70)
    print(f"TOP {limite} PRODUCTOS POR VALOR")
    print("=" * 70)

    query = f"""
    SELECT
        ranking_valor,
        codigo,
        descripcion,
        clase,
        valor_consumo,
        unidades_vendidas,
        porcentaje_acumulado,
        tendencia_ranking
    FROM v_dashboard_top20_productos
    LIMIT {limite}
    """

    df = conn.execute(query).fetchdf()

    print(f"\n{'#':<5} {'Código':<15} {'Descripción':<40} {'Clase':<6} {'Valor':<15} {'% Acum':<10}")
    print("-" * 95)

    for _, row in df.iterrows():
        desc = row['descripcion'][:38] + '..' if len(str(row['descripcion'])) > 40 else row['descripcion']
        print(f"{row['ranking_valor']:<5} {row['codigo']:<15} {desc:<40} {row['clase']:<6} "
              f"${row['valor_consumo']:>12,.2f} {row['porcentaje_acumulado']:>8.1f}%")


def mostrar_alertas(conn, limite=10):
    """Mostrar alertas y oportunidades."""
    print("\n" + "=" * 70)
    print(f"ALERTAS Y OPORTUNIDADES (TOP {limite})")
    print("=" * 70)

    query = f"""
    SELECT
        tipo_alerta,
        codigo,
        descripcion,
        clase,
        valor_consumo,
        accion_recomendada,
        prioridad
    FROM v_dashboard_alertas_abc
    ORDER BY prioridad DESC, valor_consumo DESC
    LIMIT {limite}
    """

    df = conn.execute(query).fetchdf()

    if len(df) == 0:
        print("\n✅ No hay alertas críticas")
        return

    for _, row in df.iterrows():
        emoji = "🔴" if row['prioridad'] == 'ALTA' else "🟡"
        print(f"\n{emoji} {row['tipo_alerta']} - Prioridad {row['prioridad']}")
        print(f"   Producto: {row['codigo']} - {row['descripcion'][:50]}")
        print(f"   Valor: ${row['valor_consumo']:,.2f}")
        print(f"   Acción: {row['accion_recomendada']}")


def mostrar_concentracion(conn):
    """Mostrar métricas de concentración."""
    print("\n" + "=" * 70)
    print("MÉTRICAS DE CONCENTRACIÓN")
    print("=" * 70)

    df = conn.execute("SELECT * FROM v_dashboard_metricas_concentracion").fetchdf()

    print(f"\n📊 Índice de Gini: {df['indice_gini'].iloc[0]:.4f}")
    print(f"   Interpretación: {df['interpretacion_gini'].iloc[0]}")

    print(f"\n📊 Índice HHI: {df['indice_hhi'].iloc[0]:,.2f}")
    print(f"   Interpretación: {df['interpretacion_hhi'].iloc[0]}")

    print(f"\n📊 Productos que generan 50% del valor: {df['productos_50_pct'].iloc[0]}")
    print(f"📊 Productos que generan 80% del valor: {df['productos_80_pct'].iloc[0]} "
          f"({df['pct_productos_80_valor'].iloc[0]:.1f}%)")

    print(f"\n{df['estado_pareto'].iloc[0]}")


def mostrar_por_categoria(conn, limite=10):
    """Mostrar distribución ABC por categoría."""
    print("\n" + "=" * 70)
    print(f"DISTRIBUCIÓN POR CATEGORÍA (TOP {limite})")
    print("=" * 70)

    query = f"""
    SELECT
        categoria,
        total_productos,
        valor_total,
        productos_a,
        productos_b,
        productos_c,
        concentracion_clase_a
    FROM v_dashboard_abc_por_categoria
    ORDER BY valor_total DESC
    LIMIT {limite}
    """

    df = conn.execute(query).fetchdf()

    print(f"\n{'Categoría':<25} {'Total':<8} {'Valor Total':<15} {'A':<5} {'B':<5} {'C':<5} {'Conc A%':<10}")
    print("-" * 85)

    for _, row in df.iterrows():
        cat = row['categoria'][:23] if row['categoria'] else 'SIN CATEGORIA'
        print(f"{cat:<25} {row['total_productos']:<8} ${row['valor_total']:>12,.2f} "
              f"{row['productos_a']:<5} {row['productos_b']:<5} {row['productos_c']:<5} "
              f"{row['concentracion_clase_a']:>8.1f}%")


def generar_reporte_completo(conn):
    """Generar reporte completo en consola."""
    print("\n" + "=" * 70)
    print("REPORTE COMPLETO ABC V2")
    print("Sistema de Clasificación Basada en Valor Económico (Pareto)")
    print("=" * 70)

    mostrar_kpis(conn)
    mostrar_concentracion(conn)
    mostrar_top_productos(conn, limite=15)
    mostrar_por_categoria(conn, limite=10)
    mostrar_alertas(conn, limite=10)

    print("\n" + "=" * 70)
    print("Fin del reporte")
    print("=" * 70 + "\n")


def exportar_a_excel(conn, filename="reporte_abc_v2.xlsx"):
    """Exportar reportes a Excel."""
    print(f"\n📊 Exportando a Excel: {filename}")

    with pd.ExcelWriter(filename, engine='openpyxl') as writer:
        # KPIs
        df_kpis = conn.execute("SELECT * FROM v_dashboard_abc_kpis").fetchdf()
        df_kpis.to_excel(writer, sheet_name='KPIs', index=False)

        # TOP 50 productos
        df_top = conn.execute("SELECT * FROM v_dashboard_top20_productos LIMIT 50").fetchdf()
        df_top.to_excel(writer, sheet_name='TOP 50 Productos', index=False)

        # Por categoría
        df_cat = conn.execute("SELECT * FROM v_dashboard_abc_por_categoria").fetchdf()
        df_cat.to_excel(writer, sheet_name='Por Categoria', index=False)

        # Alertas
        df_alertas = conn.execute("SELECT * FROM v_dashboard_alertas_abc").fetchdf()
        df_alertas.to_excel(writer, sheet_name='Alertas', index=False)

        # Discrepancias
        df_disc = conn.execute("SELECT * FROM v_dashboard_discrepancias").fetchdf()
        df_disc.to_excel(writer, sheet_name='Discrepancias', index=False)

        # Métricas concentración
        df_conc = conn.execute("SELECT * FROM v_dashboard_metricas_concentracion").fetchdf()
        df_conc.to_excel(writer, sheet_name='Concentracion', index=False)

    print(f"✅ Reporte exportado exitosamente: {filename}")


def main():
    """Función principal."""
    print("\n🚀 Ejemplo de Uso - Sistema ABC v2")
    print("Sistema de Clasificación Basada en Valor Económico\n")

    # Conectar
    print("📡 Conectando a la base de datos...")
    conn = conectar_bd()
    print("✅ Conectado\n")

    # Generar reporte completo
    generar_reporte_completo(conn)

    # Preguntar si quiere exportar
    respuesta = input("¿Exportar a Excel? (s/n): ").lower()
    if respuesta == 's':
        try:
            exportar_a_excel(conn)
        except Exception as e:
            print(f"⚠️ Error al exportar: {e}")
            print("Instala openpyxl: pip install openpyxl")

    # Cerrar conexión
    conn.close()
    print("\n✅ Proceso completado\n")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️ Proceso interrumpido por el usuario")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
