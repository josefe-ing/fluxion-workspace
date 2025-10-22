#!/usr/bin/env python3
"""
Script de Validación de Calidad de Datos - ETL Ventas
Compara registros por día entre SQL Server (fuente) y DuckDB (destino)
"""

import sys
from pathlib import Path
from datetime import datetime, date, timedelta
import pyodbc
import duckdb
import pandas as pd
from typing import Dict, List
import argparse

# Agregar el directorio actual al path
sys.path.append(str(Path(__file__).parent))

from tiendas_config import TIENDAS_CONFIG
from config import DatabaseConfig

def validar_tienda_por_fecha(
    tienda_id: str,
    fecha_inicio: date,
    fecha_fin: date,
    db_path: str
) -> pd.DataFrame:
    """
    Valida la calidad de datos comparando SQL Server vs DuckDB día por día

    Returns:
        DataFrame con columnas: fecha, registros_sql_server, registros_duckdb, diferencia, porcentaje_match
    """

    if tienda_id not in TIENDAS_CONFIG:
        raise ValueError(f"Tienda {tienda_id} no configurada")

    config = TIENDAS_CONFIG[tienda_id]

    print(f"\n{'='*80}")
    print(f"🔍 VALIDANDO CALIDAD DE DATOS: {config.ubicacion_nombre}")
    print(f"{'='*80}")
    print(f"📅 Período: {fecha_inicio} a {fecha_fin}")
    print(f"📡 SQL Server: {config.server_ip}:{config.port}")
    print(f"💾 DuckDB: {db_path}")
    print(f"{'='*80}\n")

    # 1. EXTRAER CONTEOS DE SQL SERVER (FUENTE DE VERDAD)
    print("📊 Consultando SQL Server (fuente de verdad)...")

    odbc_driver = 'ODBC Driver 17 for SQL Server'

    sql_server_conn_string = (
        f"DRIVER={{{odbc_driver}}};"
        f"SERVER={config.server_ip},{config.port};"
        f"DATABASE={config.database_name};"
        f"UID={config.username};"
        f"PWD={config.password};"
        f"Encrypt=no;"
        f"TrustServerCertificate=yes;"
        f"Connection Timeout=60;"
    )

    query_sql_server = """
        SELECT
            CAST(t.f_Fecha AS DATE) as fecha,
            COUNT(*) as registros
        FROM VAD20.dbo.MA_TRANSACCION t
            LEFT JOIN VAD20.dbo.MA_CODIGOS c ON t.Codigo = c.c_Codigo
            LEFT JOIN VAD20.dbo.MA_PRODUCTOS p ON c.c_CodNasa = p.c_Codigo
        WHERE
            t.f_Fecha >= ?
            AND t.f_Fecha <= ?
            AND p.c_Codigo IS NOT NULL
        GROUP BY CAST(t.f_Fecha AS DATE)
        ORDER BY fecha
    """

    try:
        conn_sql = pyodbc.connect(sql_server_conn_string)
        df_sql_server = pd.read_sql_query(
            query_sql_server,
            conn_sql,
            params=[fecha_inicio.strftime('%Y-%m-%d'), fecha_fin.strftime('%Y-%m-%d')]
        )
        conn_sql.close()
        print(f"   ✅ SQL Server: {len(df_sql_server)} días con datos")
    except Exception as e:
        print(f"   ❌ Error consultando SQL Server: {e}")
        return pd.DataFrame()

    # 2. EXTRAER CONTEOS DE DUCKDB (LO QUE SINCRONIZAMOS)
    print("💾 Consultando DuckDB (datos sincronizados)...")

    query_duckdb = """
        SELECT
            CAST(fecha AS DATE) as fecha,
            COUNT(*) as registros
        FROM ventas_raw
        WHERE
            ubicacion_id = ?
            AND CAST(fecha AS DATE) >= CAST(? AS DATE)
            AND CAST(fecha AS DATE) <= CAST(? AS DATE)
        GROUP BY CAST(fecha AS DATE)
        ORDER BY fecha
    """

    try:
        conn_duck = duckdb.connect(db_path, read_only=True)
        df_duckdb = conn_duck.execute(
            query_duckdb,
            [config.ubicacion_id, fecha_inicio.strftime('%Y-%m-%d'), fecha_fin.strftime('%Y-%m-%d')]
        ).fetchdf()
        conn_duck.close()
        print(f"   ✅ DuckDB: {len(df_duckdb)} días con datos")
    except Exception as e:
        print(f"   ❌ Error consultando DuckDB: {e}")
        return pd.DataFrame()

    # 3. COMPARAR Y GENERAR REPORTE
    print("\n🔍 Comparando datos día por día...")

    # Crear rango completo de fechas
    dias_totales = (fecha_fin - fecha_inicio).days + 1
    todas_las_fechas = [fecha_inicio + timedelta(days=i) for i in range(dias_totales)]
    df_fechas = pd.DataFrame({'fecha': todas_las_fechas})

    # Merge con ambas fuentes
    df_sql_server['fecha'] = pd.to_datetime(df_sql_server['fecha']).dt.date
    df_duckdb['fecha'] = pd.to_datetime(df_duckdb['fecha']).dt.date

    df_comparacion = df_fechas.merge(
        df_sql_server.rename(columns={'registros': 'registros_sql_server'}),
        on='fecha',
        how='left'
    ).merge(
        df_duckdb.rename(columns={'registros': 'registros_duckdb'}),
        on='fecha',
        how='left'
    )

    # Rellenar NaN con 0
    df_comparacion['registros_sql_server'] = df_comparacion['registros_sql_server'].fillna(0).astype(int)
    df_comparacion['registros_duckdb'] = df_comparacion['registros_duckdb'].fillna(0).astype(int)

    # Calcular diferencias y porcentajes
    df_comparacion['diferencia'] = df_comparacion['registros_duckdb'] - df_comparacion['registros_sql_server']
    df_comparacion['diferencia_abs'] = df_comparacion['diferencia'].abs()

    df_comparacion['porcentaje_match'] = df_comparacion.apply(
        lambda row: (
            100.0 if row['registros_sql_server'] == 0 and row['registros_duckdb'] == 0
            else 0.0 if row['registros_sql_server'] == 0
            else round((row['registros_duckdb'] / row['registros_sql_server']) * 100, 2)
        ),
        axis=1
    )

    df_comparacion['estado'] = df_comparacion.apply(
        lambda row: (
            '✅ PERFECTO' if row['diferencia'] == 0 and row['registros_sql_server'] > 0
            else '⚠️  SIN DATOS' if row['registros_sql_server'] == 0 and row['registros_duckdb'] == 0
            else '❌ FALTANTE' if row['registros_duckdb'] < row['registros_sql_server']
            else '⚠️  EXCESO' if row['registros_duckdb'] > row['registros_sql_server']
            else '❓ REVISAR'
        ),
        axis=1
    )

    return df_comparacion


def imprimir_reporte(df: pd.DataFrame, tienda_nombre: str):
    """Imprime un reporte detallado de la validación"""

    if df.empty:
        print("❌ No hay datos para generar reporte")
        return

    print(f"\n{'='*100}")
    print(f"📊 REPORTE DE VALIDACIÓN DE CALIDAD - {tienda_nombre}")
    print(f"{'='*100}\n")

    # RESUMEN GENERAL
    total_dias = len(df)
    dias_perfectos = len(df[df['estado'] == '✅ PERFECTO'])
    dias_sin_datos = len(df[df['estado'] == '⚠️  SIN DATOS'])
    dias_con_faltantes = len(df[df['estado'] == '❌ FALTANTE'])
    dias_con_exceso = len(df[df['estado'] == '⚠️  EXCESO'])

    total_sql_server = df['registros_sql_server'].sum()
    total_duckdb = df['registros_duckdb'].sum()
    diferencia_total = total_duckdb - total_sql_server
    porcentaje_total = round((total_duckdb / total_sql_server * 100), 2) if total_sql_server > 0 else 0

    print("📈 RESUMEN GENERAL:")
    print(f"   Total días analizados: {total_dias}")
    print(f"   ✅ Días con match perfecto: {dias_perfectos} ({round(dias_perfectos/total_dias*100, 1)}%)")
    print(f"   ⚠️  Días sin datos (ambas fuentes): {dias_sin_datos}")
    print(f"   ❌ Días con registros faltantes: {dias_con_faltantes}")
    print(f"   ⚠️  Días con registros de más: {dias_con_exceso}")
    print()
    print(f"   📊 Total registros en SQL Server: {total_sql_server:,}")
    print(f"   💾 Total registros en DuckDB: {total_duckdb:,}")
    print(f"   📉 Diferencia: {diferencia_total:+,}")
    print(f"   📊 Porcentaje de completitud: {porcentaje_total}%")

    # DETALLE POR DÍA
    print(f"\n{'='*100}")
    print("📅 DETALLE POR DÍA:")
    print(f"{'='*100}")
    print(f"{'Fecha':<12} {'SQL Server':>12} {'DuckDB':>12} {'Diferencia':>12} {'Match %':>10} {'Estado':<15}")
    print(f"{'-'*100}")

    for _, row in df.iterrows():
        fecha_str = row['fecha'].strftime('%Y-%m-%d')
        sql_str = f"{row['registros_sql_server']:,}"
        duck_str = f"{row['registros_duckdb']:,}"
        diff_str = f"{row['diferencia']:+,}"
        match_str = f"{row['porcentaje_match']:.1f}%"
        estado_str = row['estado']

        print(f"{fecha_str:<12} {sql_str:>12} {duck_str:>12} {diff_str:>12} {match_str:>10} {estado_str:<15}")

    # DÍAS CON PROBLEMAS
    df_problemas = df[df['estado'].isin(['❌ FALTANTE', '⚠️  EXCESO'])]

    if not df_problemas.empty:
        print(f"\n{'='*100}")
        print("⚠️  DÍAS CON DISCREPANCIAS:")
        print(f"{'='*100}")

        for _, row in df_problemas.iterrows():
            fecha_str = row['fecha'].strftime('%Y-%m-%d')
            print(f"   {row['estado']} {fecha_str}: SQL={row['registros_sql_server']:,}, DuckDB={row['registros_duckdb']:,}, Dif={row['diferencia']:+,}")

    print(f"\n{'='*100}\n")

    # RECOMENDACIONES
    if dias_con_faltantes > 0:
        print("💡 RECOMENDACIONES:")
        fechas_faltantes = df[df['estado'] == '❌ FALTANTE']['fecha'].tolist()
        if fechas_faltantes:
            fecha_inicio = min(fechas_faltantes)
            fecha_fin = max(fechas_faltantes)
            print(f"   • Re-ejecutar ETL para el período: {fecha_inicio} a {fecha_fin}")
            print(f"   • Comando sugerido:")
            print(f"     python3 etl_ventas.py --tienda {list(TIENDAS_CONFIG.keys())[0]} --fecha-inicio {fecha_inicio} --fecha-fin {fecha_fin}")
        print()


def main():
    """Función principal del script"""

    parser = argparse.ArgumentParser(description="Validación de Calidad de Datos - ETL Ventas")
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
        df_resultado = validar_tienda_por_fecha(
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
        imprimir_reporte(df_resultado, tienda_nombre)

        # Exportar a CSV si se solicita
        if args.export_csv:
            df_resultado.to_csv(args.export_csv, index=False, encoding='utf-8')
            print(f"📄 Reporte exportado a: {args.export_csv}\n")

        # Código de salida según resultados
        dias_con_problemas = len(df_resultado[df_resultado['estado'].isin(['❌ FALTANTE', '⚠️  EXCESO'])])
        if dias_con_problemas > 0:
            print(f"⚠️  Se encontraron {dias_con_problemas} días con discrepancias")
            sys.exit(1)
        else:
            print("✅ Validación exitosa: Todos los días tienen datos correctos")
            sys.exit(0)

    except Exception as e:
        print(f"❌ Error durante la validación: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
