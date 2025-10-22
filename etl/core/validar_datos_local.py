#!/usr/bin/env python3
"""
Script de Validación Local de Datos - Solo DuckDB
Analiza datos sincronizados en DuckDB para detectar gaps y anomalías
"""

import sys
from pathlib import Path
from datetime import datetime, date, timedelta
import duckdb
import pandas as pd
from typing import Dict, List
import argparse

# Agregar el directorio actual al path
sys.path.append(str(Path(__file__).parent))

from tiendas_config import TIENDAS_CONFIG


def validar_tienda_local(
    tienda_id: str,
    fecha_inicio: date,
    fecha_fin: date,
    db_path: str
) -> pd.DataFrame:
    """
    Valida datos locales en DuckDB para detectar gaps y anomalías

    Returns:
        DataFrame con columnas: fecha, registros, estado, observaciones
    """

    if tienda_id not in TIENDAS_CONFIG:
        raise ValueError(f"Tienda {tienda_id} no configurada")

    config = TIENDAS_CONFIG[tienda_id]

    print(f"\n{'='*80}")
    print(f"🔍 VALIDACIÓN LOCAL DE DATOS: {config.ubicacion_nombre}")
    print(f"{'='*80}")
    print(f"📅 Período: {fecha_inicio} a {fecha_fin}")
    print(f"💾 DuckDB: {db_path}")
    print(f"{'='*80}\n")

    # Consultar DuckDB
    print("📊 Consultando datos sincronizados...")

    query_duckdb = """
        SELECT
            fecha::DATE as fecha,
            COUNT(*) as registros,
            COUNT(DISTINCT numero_factura) as facturas,
            ROUND(SUM(TRY_CAST(venta_total AS DECIMAL(18,2))), 2) as venta_total,
            ROUND(AVG(TRY_CAST(venta_total AS DECIMAL(18,2))), 2) as venta_promedio
        FROM ventas_raw
        WHERE
            ubicacion_id = ?
            AND fecha >= ?
            AND fecha <= ?
        GROUP BY fecha::DATE
        ORDER BY fecha
    """

    try:
        conn = duckdb.connect(db_path, read_only=True)
        df_duckdb = conn.execute(
            query_duckdb,
            [config.ubicacion_id, fecha_inicio.strftime('%Y-%m-%d'), fecha_fin.strftime('%Y-%m-%d')]
        ).fetchdf()
        conn.close()
        print(f"   ✅ Encontrados datos para {len(df_duckdb)} días")
    except Exception as e:
        print(f"   ❌ Error consultando DuckDB: {e}")
        return pd.DataFrame()

    # Crear rango completo de fechas
    dias_totales = (fecha_fin - fecha_inicio).days + 1
    todas_las_fechas = [fecha_inicio + timedelta(days=i) for i in range(dias_totales)]
    df_fechas = pd.DataFrame({'fecha': todas_las_fechas})

    # Merge con datos
    df_duckdb['fecha'] = pd.to_datetime(df_duckdb['fecha']).dt.date

    df_analisis = df_fechas.merge(
        df_duckdb,
        on='fecha',
        how='left'
    )

    # Rellenar NaN con 0
    df_analisis['registros'] = df_analisis['registros'].fillna(0).astype(int)
    df_analisis['facturas'] = df_analisis['facturas'].fillna(0).astype(int)
    df_analisis['venta_total'] = df_analisis['venta_total'].fillna(0)
    df_analisis['venta_promedio'] = df_analisis['venta_promedio'].fillna(0)

    # Calcular estadísticas para detectar anomalías
    registros_no_cero = df_analisis[df_analisis['registros'] > 0]['registros']

    if len(registros_no_cero) > 0:
        promedio = registros_no_cero.mean()
        std = registros_no_cero.std()
        mediana = registros_no_cero.median()

        # Detectar anomalías (> 2 desviaciones estándar)
        umbral_bajo = max(0, promedio - 2 * std)
        umbral_alto = promedio + 2 * std
    else:
        promedio = 0
        std = 0
        mediana = 0
        umbral_bajo = 0
        umbral_alto = 0

    # Clasificar cada día
    def clasificar_dia(row):
        if row['registros'] == 0:
            return '❌ SIN DATOS', 'No hay registros para este día'
        elif row['registros'] < umbral_bajo and std > 0:
            return '⚠️ BAJO', f'Registros muy por debajo del promedio ({promedio:.0f})'
        elif row['registros'] > umbral_alto and std > 0:
            return '⚠️ ALTO', f'Registros muy por encima del promedio ({promedio:.0f})'
        else:
            return '✅ NORMAL', 'Dentro del rango esperado'

    df_analisis[['estado', 'observaciones']] = df_analisis.apply(
        lambda row: pd.Series(clasificar_dia(row)),
        axis=1
    )

    # Agregar estadísticas globales al DataFrame para referencia
    df_analisis['promedio_periodo'] = promedio
    df_analisis['mediana_periodo'] = mediana
    df_analisis['std_periodo'] = std

    return df_analisis


def imprimir_reporte_local(df: pd.DataFrame, tienda_nombre: str):
    """Imprime un reporte detallado de la validación local"""

    if df.empty:
        print("❌ No hay datos para generar reporte")
        return

    print(f"\n{'='*100}")
    print(f"📊 REPORTE DE VALIDACIÓN LOCAL - {tienda_nombre}")
    print(f"{'='*100}\n")

    # RESUMEN GENERAL
    total_dias = len(df)
    dias_con_datos = len(df[df['registros'] > 0])
    dias_sin_datos = len(df[df['estado'] == '❌ SIN DATOS'])
    dias_anomalos = len(df[df['estado'].isin(['⚠️ BAJO', '⚠️ ALTO'])])
    dias_normales = len(df[df['estado'] == '✅ NORMAL'])

    total_registros = df['registros'].sum()
    total_facturas = df['facturas'].sum()
    total_ventas = df['venta_total'].sum()

    promedio = df['promedio_periodo'].iloc[0] if len(df) > 0 else 0
    mediana = df['mediana_periodo'].iloc[0] if len(df) > 0 else 0
    std = df['std_periodo'].iloc[0] if len(df) > 0 else 0

    print("📈 RESUMEN GENERAL:")
    print(f"   Total días analizados: {total_dias}")
    print(f"   ✅ Días con datos: {dias_con_datos} ({round(dias_con_datos/total_dias*100, 1)}%)")
    print(f"   ❌ Días sin datos: {dias_sin_datos}")
    print(f"   ⚠️  Días con anomalías: {dias_anomalos}")
    print(f"   ✅ Días normales: {dias_normales}")
    print()
    print(f"   📊 Total registros: {total_registros:,}")
    print(f"   🧾 Total facturas: {total_facturas:,}")
    print(f"   💰 Venta total: ${total_ventas:,.2f}")
    print()
    print(f"   📊 Promedio diario: {promedio:,.0f} registros")
    print(f"   📊 Mediana diaria: {mediana:,.0f} registros")
    print(f"   📊 Desviación estándar: {std:,.0f} registros")

    # DETALLE POR DÍA
    print(f"\n{'='*120}")
    print("📅 DETALLE POR DÍA:")
    print(f"{'='*120}")
    print(f"{'Fecha':<12} {'Registros':>12} {'Facturas':>12} {'Venta Total':>15} {'Venta Prom':>15} {'Estado':<15} {'Observaciones':<30}")
    print(f"{'-'*120}")

    for _, row in df.iterrows():
        fecha_str = row['fecha'].strftime('%Y-%m-%d')
        reg_str = f"{row['registros']:,}"
        fact_str = f"{row['facturas']:,}"
        venta_str = f"${row['venta_total']:,.2f}"
        prom_str = f"${row['venta_promedio']:,.2f}"
        estado_str = row['estado']
        obs_str = row['observaciones'][:30]

        print(f"{fecha_str:<12} {reg_str:>12} {fact_str:>12} {venta_str:>15} {prom_str:>15} {estado_str:<15} {obs_str:<30}")

    # DÍAS CON PROBLEMAS
    df_problemas = df[df['estado'] != '✅ NORMAL']

    if not df_problemas.empty:
        print(f"\n{'='*100}")
        print("⚠️  DÍAS CON PROBLEMAS O ANOMALÍAS:")
        print(f"{'='*100}")

        for _, row in df_problemas.iterrows():
            fecha_str = row['fecha'].strftime('%Y-%m-%d')
            print(f"   {row['estado']} {fecha_str}: {row['registros']:,} registros - {row['observaciones']}")

    print(f"\n{'='*100}\n")

    # RECOMENDACIONES
    if dias_sin_datos > 0:
        print("💡 RECOMENDACIONES:")
        fechas_sin_datos = df[df['estado'] == '❌ SIN DATOS']['fecha'].tolist()
        if fechas_sin_datos:
            # Agrupar fechas consecutivas en rangos
            rangos = []
            inicio_rango = fechas_sin_datos[0]
            fin_rango = fechas_sin_datos[0]

            for i in range(1, len(fechas_sin_datos)):
                if (fechas_sin_datos[i] - fin_rango).days == 1:
                    fin_rango = fechas_sin_datos[i]
                else:
                    rangos.append((inicio_rango, fin_rango))
                    inicio_rango = fechas_sin_datos[i]
                    fin_rango = fechas_sin_datos[i]

            rangos.append((inicio_rango, fin_rango))

            print(f"   • Faltan datos para {len(fechas_sin_datos)} días")
            print(f"   • Re-ejecutar ETL para los siguientes rangos:")

            for inicio, fin in rangos:
                if inicio == fin:
                    print(f"     - {inicio}")
                else:
                    print(f"     - {inicio} a {fin}")
        print()


def main():
    """Función principal del script"""

    parser = argparse.ArgumentParser(description="Validación Local de Datos - ETL Ventas")
    parser.add_argument("--tienda", required=True, help="ID de la tienda (ej: tienda_01)")
    parser.add_argument("--fecha-inicio", required=True, help="Fecha inicial (YYYY-MM-DD)")
    parser.add_argument("--fecha-fin", required=True, help="Fecha final (YYYY-MM-DD)")
    parser.add_argument("--db-path",
                       default=str(Path(__file__).parent.parent.parent / "data" / "fluxion_production.db"),
                       help="Ruta a la base de datos DuckDB")
    parser.add_argument("--export-csv", help="Exportar resultado a CSV (opcional)")

    args = parser.parse_args()

    # Validar y convertir fechas
    try:
        fecha_inicio = datetime.strptime(args.fecha_inicio, "%Y-%m-%d").date()
        fecha_fin = datetime.strptime(args.fecha_fin, "%Y-%m-%d").date()
    except ValueError:
        print("❌ Error: Formato de fecha inválido. Use YYYY-MM-DD")
        sys.exit(1)

    if fecha_inicio > fecha_fin:
        print("❌ Error: La fecha de inicio no puede ser mayor que la fecha final")
        sys.exit(1)

    # Ejecutar validación
    try:
        df_resultado = validar_tienda_local(
            tienda_id=args.tienda,
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
            db_path=args.db_path
        )

        if df_resultado.empty:
            print("❌ No se pudo generar el reporte de validación")
            sys.exit(1)

        # Obtener nombre de tienda
        tienda_nombre = TIENDAS_CONFIG[args.tienda].ubicacion_nombre

        # Imprimir reporte
        imprimir_reporte_local(df_resultado, tienda_nombre)

        # Exportar a CSV si se solicita
        if args.export_csv:
            df_resultado.to_csv(args.export_csv, index=False, encoding='utf-8')
            print(f"📄 Reporte exportado a: {args.export_csv}\n")

        # Código de salida según resultados
        dias_sin_datos = len(df_resultado[df_resultado['estado'] == '❌ SIN DATOS'])
        if dias_sin_datos > 0:
            print(f"⚠️  Se encontraron {dias_sin_datos} días sin datos")
            sys.exit(1)
        else:
            print("✅ Validación exitosa: Todos los días tienen datos")
            sys.exit(0)

    except Exception as e:
        print(f"❌ Error durante la validación: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
