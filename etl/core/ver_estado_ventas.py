#!/usr/bin/env python3
"""
Script para visualizar el estado actual de los datos de ventas en DuckDB
"""

import duckdb
from datetime import datetime

def main():
    conn = duckdb.connect('/Users/jose/Developer/fluxion-workspace/data/fluxion_production.db')

    print(f'\n📊 ESTADO DE DATOS DE VENTAS - {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    print('='*100)
    print(f'{"Tienda":<15} {"Jul 2025":>12} {"Ago 2025":>12} {"Sep 2025":>12} {"TOTAL":>14} {"Estado":<20} {"Observación":<20}')
    print('-'*100)

    todas_tiendas = [
        'tienda_01', 'tienda_02', 'tienda_03', 'tienda_04', 'tienda_05',
        'tienda_06', 'tienda_07', 'tienda_08', 'tienda_09', 'tienda_10',
        'tienda_11', 'tienda_12', 'tienda_13', 'tienda_15', 'tienda_16',
        'tienda_19'
    ]

    total_jul = 0
    total_ago = 0
    total_sep = 0
    tiendas_sin_agosto = []

    for tienda in todas_tiendas:
        # Contar registros por mes
        jul = conn.execute(f"SELECT COUNT(*) FROM ventas_raw WHERE ubicacion_id = '{tienda}' AND fecha >= '2025-07-01' AND fecha < '2025-08-01'").fetchone()[0]
        ago = conn.execute(f"SELECT COUNT(*) FROM ventas_raw WHERE ubicacion_id = '{tienda}' AND fecha >= '2025-08-01' AND fecha < '2025-09-01'").fetchone()[0]
        sep = conn.execute(f"SELECT COUNT(*) FROM ventas_raw WHERE ubicacion_id = '{tienda}' AND fecha >= '2025-09-01' AND fecha < '2025-10-01'").fetchone()[0]
        total = jul + ago + sep

        total_jul += jul
        total_ago += ago
        total_sep += sep

        # Determinar estado
        if total == 0:
            estado = '❌ Sin datos'
            obs = 'Sin conectividad'
        elif jul > 0 and ago > 0 and sep > 0:
            estado = '✅ Completo'
            obs = ''
        elif ago > 0 and sep > 0:
            estado = '🟡 Ago+Sep'
            obs = 'Falta julio'
        elif sep > 0 and jul > 0:
            estado = '🟠 Jul+Sep'
            obs = 'Falta agosto'
        elif sep > 0:
            estado = '🟠 Solo Sep'
            obs = 'Falta jul+ago'
            if ago == 0:
                tiendas_sin_agosto.append(tienda)
        else:
            estado = '❓ Revisar'
            obs = 'Verificar'

        # Formatear números
        jul_str = f'{jul:,}' if jul > 0 else '-'
        ago_str = f'{ago:,}' if ago > 0 else '-'
        sep_str = f'{sep:,}' if sep > 0 else '-'
        total_str = f'{total:,}' if total > 0 else '-'

        print(f'{tienda:<15} {jul_str:>12} {ago_str:>12} {sep_str:>12} {total_str:>14} {estado:<20} {obs:<20}')

    print('-'*100)
    print(f"{'TOTALES':<15} {total_jul:>12,} {total_ago:>12,} {total_sep:>12,} {total_jul+total_ago+total_sep:>14,}")

    # Resumen
    print(f'\n📅 RESUMEN POR MES:')
    print('='*60)

    for mes, nombre in [('07', 'JULIO'), ('08', 'AGOSTO'), ('09', 'SEPTIEMBRE')]:
        count = conn.execute(f"""
            SELECT COUNT(DISTINCT ubicacion_id), COUNT(*)
            FROM ventas_raw
            WHERE fecha >= '2025-{mes}-01' AND fecha < DATE '2025-{mes}-01' + INTERVAL '1 month'
        """).fetchone()
        print(f'{nombre} 2025: {count[0]} tiendas, {count[1]:,} registros')

    # Total general
    total = conn.execute('SELECT COUNT(*) FROM ventas_raw').fetchone()[0]
    print(f'\n📦 TOTAL EN BASE DE DATOS: {total:,} registros')

    # Alertas
    if tiendas_sin_agosto:
        print(f'\n⚠️ TIENDAS SIN DATOS DE AGOSTO:')
        for t in tiendas_sin_agosto:
            print(f'  - {t}')

    conn.close()

if __name__ == "__main__":
    main()