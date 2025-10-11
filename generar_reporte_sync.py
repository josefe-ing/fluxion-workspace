#!/usr/bin/env python3
"""
Reporte de Sincronización - Fluxion AI
Estado de datos por ubicación
"""

import duckdb
import json
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / 'data' / 'fluxion_production.db'
CONFIG_HISTORICO_PATH = Path(__file__).parent / 'config_historico_tiendas.json'

# Colores ANSI
RESET = '\033[0m'
BOLD = '\033[1m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
RED = '\033[91m'
CYAN = '\033[96m'
MAGENTA = '\033[95m'
BLUE = '\033[94m'

def generar_reporte():
    print(f'{CYAN}{BOLD}')
    print('═' * 80)
    print('  REPORTE DE SINCRONIZACIÓN - FLUXION AI')
    print('  Estado de Datos por Ubicación')
    print(f'  Generado: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print('═' * 80)
    print(RESET)

    conn = duckdb.connect(str(DB_PATH), read_only=True)

    query = '''
    SELECT
        ubicacion_id,
        ubicacion_nombre,
        MIN(fecha) as fecha_inicio,
        MAX(fecha) as fecha_fin,
        COUNT(DISTINCT fecha) as dias_con_data,
        COUNT(*) as total_registros
    FROM ventas_raw
    WHERE fecha IS NOT NULL
    GROUP BY ubicacion_id, ubicacion_nombre
    ORDER BY COUNT(*) ASC
    '''

    resultado = conn.execute(query).fetchall()
    conn.close()

    todas_tiendas = {
        'tienda_01': 'MERCADO ESTE',
        'tienda_02': 'MERCADO OESTE',
        'tienda_03': 'MERCADO NORTE',
        'tienda_04': 'GRANJA NORTE',
        'tienda_05': 'GRANJA SUR',
        'tienda_06': 'GRANJA ESTE',
        'tienda_07': 'GRANJA OESTE',
        'tienda_08': 'BOSQUE',
        'tienda_09': 'MARACAY',
        'tienda_10': 'TIENDA 10',
        'tienda_11': 'TIENDA 11',
        'tienda_12': 'TIENDA 12',
        'tienda_13': 'TIENDA 13',
        'tienda_15': 'TIENDA 15',
        'tienda_16': 'TIENDA 16',
        'tienda_19': 'TIENDA 19',
        'cedi_seco': 'CEDI SECO',
        'cedi_frio': 'CEDI FRÍO',
        'cedi_verde': 'CEDI VERDE'
    }

    # Cargar configuración de históricos desde archivo JSON
    historico_conocido = {}
    historico_completo_config = {}  # Bandera de si está confirmado como completo

    if CONFIG_HISTORICO_PATH.exists():
        try:
            with open(CONFIG_HISTORICO_PATH, 'r', encoding='utf-8') as f:
                config = json.load(f)
                for tienda_id, info in config.get('tiendas', {}).items():
                    historico_conocido[tienda_id] = info['fecha_inicio_historico']
                    # Solo marcar como completo si explícitamente dice historico_completo: true
                    historico_completo_config[tienda_id] = info.get('historico_completo', False)
        except Exception as e:
            print(f'⚠️ Error cargando config de históricos: {e}')
            # Fallback a valores por defecto
            historico_conocido = {
                'tienda_01': '2024-07-03',
                'tienda_02': '2024-07-03',
                'tienda_03': '2024-07-03',
                'tienda_04': '2024-10-01',
                'tienda_05': '2025-01-02',
                'tienda_06': '2025-01-02',
                'tienda_07': '2025-01-02',
                'tienda_08': '2025-07-01',
                'tienda_09': '2024-07-03',
                'tienda_10': '2025-07-01',
                'tienda_11': '2025-09-01',
                'tienda_12': '2025-07-01',
                'tienda_13': '2025-07-01',
                'tienda_15': '2025-07-01',
                'tienda_16': '2025-05-01',
                'tienda_19': '2025-07-30',
            }

    tiendas_con_data = {r[0]: r for r in resultado}
    tiendas_sin_data = [tid for tid in todas_tiendas.keys() if tid not in tiendas_con_data]

    # Definir hoy aquí para usarlo en el preview
    hoy = datetime.now()

    print(f'{BOLD}📊 RESUMEN GENERAL{RESET}')
    print(f'  Total ubicaciones: {len(todas_tiendas)}')
    print(f'  {GREEN}✓ Con datos: {len(tiendas_con_data)}{RESET}')
    print(f'  {RED}✗ Sin datos: {len(tiendas_sin_data)}{RESET}')
    print()

    # Pre-calcular tiendas con histórico completo para mostrarlo arriba
    tiendas_completas_preview = []
    tiendas_incompletas_preview = []

    for data in resultado:
        ubicacion_id = data[0]
        inicio = data[2]
        fin = data[3]

        if ubicacion_id in historico_conocido:
            fecha_inicio_conocida = datetime.strptime(historico_conocido[ubicacion_id], '%Y-%m-%d')
            fecha_inicio_data = datetime.strptime(inicio, '%Y-%m-%d')
            fin_dt = datetime.strptime(fin, '%Y-%m-%d')
            gap_dias = (hoy - fin_dt).days

            # Solo si config dice historico_completo: true
            if (fecha_inicio_data <= fecha_inicio_conocida and
                gap_dias <= 1 and
                historico_completo_config.get(ubicacion_id, False)):
                tiendas_completas_preview.append(ubicacion_id)
            else:
                tiendas_incompletas_preview.append(ubicacion_id)

    if tiendas_completas_preview:
        print(f'{GREEN}{BOLD}✓ HISTÓRICO COMPLETO ({len(tiendas_completas_preview)} tiendas):{RESET}')
        print(f'  {", ".join(sorted(tiendas_completas_preview))}')
        print()

    if tiendas_incompletas_preview:
        print(f'{YELLOW}{BOLD}⚠️ HISTÓRICO INCOMPLETO ({len(tiendas_incompletas_preview)} tiendas):{RESET}')
        print(f'  {", ".join(sorted(tiendas_incompletas_preview))}')
        print()

    print(f'{BOLD}📅 LÍNEA DE TIEMPO (ordenado por número de registros){RESET}')
    print()

    fechas_fin = [datetime.strptime(r[3], '%Y-%m-%d') for r in resultado if r[3]]
    fecha_mas_reciente = max(fechas_fin) if fechas_fin else datetime.now()

    # Iterar sobre resultado que ya viene ordenado por número de registros ASC
    for data in resultado:
        ubicacion_id = data[0]
        nombre = data[1]
        inicio = data[2]
        fin = data[3]
        dias = data[4]
        registros = data[5]

        fin_dt = datetime.strptime(fin, '%Y-%m-%d')
        gap_dias = (hoy - fin_dt).days

        # Verificar si tenemos TODO el histórico disponible
        historico_completo = False
        if ubicacion_id in historico_conocido:
            fecha_inicio_conocida = datetime.strptime(historico_conocido[ubicacion_id], '%Y-%m-%d')
            fecha_inicio_data = datetime.strptime(inicio, '%Y-%m-%d')

            # Solo marcar como completo si:
            # 1. Tenemos datos desde la fecha conocida O antes
            # 2. Y el config explícitamente dice historico_completo: true
            if fecha_inicio_data <= fecha_inicio_conocida and historico_completo_config.get(ubicacion_id, False):
                historico_completo = True

        # Determinar status (sin mencionar histórico completo)
        if gap_dias == 0:
            status_icon = f'{GREEN}●{RESET}'
            status_text = f'{GREEN}[ACTUALIZADO]{RESET}'
        elif gap_dias <= 3:
            status_icon = f'{YELLOW}◐{RESET}'
            status_text = f'{YELLOW}[GAP: {gap_dias}d]{RESET}'
        else:
            status_icon = f'{RED}○{RESET}'
            status_text = f'{RED}[GAP: {gap_dias}d]{RESET}'

        # Mostrar info de histórico si está configurado
        if ubicacion_id in historico_conocido:
            fecha_historico = historico_conocido[ubicacion_id]
            if historico_completo:
                # Marcado como completo en config
                historico_text = f'{GREEN}✓ Confirmado: datos desde {fecha_historico} (máximo histórico){RESET}'
            else:
                # Requiere verificación
                historico_text = f'{YELLOW}⚠️ Por verificar: disponible desde {fecha_historico} - ejecutar ETL en fechas anteriores{RESET}'
        else:
            historico_text = ''

        barra_length = 40
        barra_fill = int((dias / 365) * barra_length)
        barra = f'{CYAN}{"█" * barra_fill}{RESET}{"░" * (barra_length - barra_fill)}'

        print(f'{status_icon} {BOLD}{ubicacion_id:12}{RESET} {nombre:20} {status_text}')
        print(f'  {barra}')
        print(f'  📅 {inicio} → {fin}  |  📊 {dias:,} días  |  📈 {registros:,} registros')
        if historico_text:
            print(f'  {historico_text}')
        print()

    if tiendas_sin_data:
        print(f'{RED}{BOLD}⚠️  UBICACIONES SIN DATOS{RESET}')
        print()
        for tid in tiendas_sin_data:
            nombre = todas_tiendas[tid]
            print(f'  {RED}✗{RESET} {BOLD}{tid:12}{RESET} {nombre}')
        print()

    print(f'{CYAN}{BOLD}')
    print('═' * 80)
    print('  RECOMENDACIONES')
    print('═' * 80)
    print(RESET)

    # Separar tiendas con histórico completo vs incompleto
    tiendas_historico_completo = []
    tiendas_historico_incompleto = []

    for tid in tiendas_con_data.keys():
        data = tiendas_con_data[tid]
        inicio = data[2]

        if tid in historico_conocido:
            fecha_inicio_conocida = datetime.strptime(historico_conocido[tid], '%Y-%m-%d')
            fecha_inicio_data = datetime.strptime(inicio, '%Y-%m-%d')

            if fecha_inicio_data <= fecha_inicio_conocida:
                tiendas_historico_completo.append(tid)
            else:
                tiendas_historico_incompleto.append((tid, historico_conocido[tid], inicio))

    gaps = [(tid, (hoy - datetime.strptime(tiendas_con_data[tid][3], '%Y-%m-%d')).days)
            for tid in tiendas_con_data.keys()]
    gaps_significativos = [(tid, gap) for tid, gap in gaps if gap > 0]

    # Mostrar históricos faltantes primero
    if tiendas_historico_incompleto:
        print(f'{MAGENTA}📚 Cargar datos históricos faltantes:{RESET}')
        for tid, fecha_disponible, fecha_actual in sorted(tiendas_historico_incompleto):
            print(f'  • {tid}: faltan desde {fecha_disponible} hasta {fecha_actual}')
            print(f'    Comando: python3 etl/core/etl_ventas_historico.py --tiendas {tid} --fecha-inicio {fecha_disponible} --fecha-fin {fecha_actual}')
        print()

    if gaps_significativos:
        print(f'{YELLOW}📌 Sincronizar datos recientes:{RESET}')
        for tid, gap in sorted(gaps_significativos, key=lambda x: x[1], reverse=True):
            # No mostrar en recomendaciones si ya está en histórico completo
            if tid in tiendas_historico_completo:
                continue
            print(f'  • {tid}: {gap} días de retraso')
        print()

    if tiendas_sin_data:
        print(f'{RED}📌 Verificar conectividad:{RESET}')
        for tid in tiendas_sin_data[:5]:
            print(f'  • {tid}')
        if len(tiendas_sin_data) > 5:
            print(f'  ... y {len(tiendas_sin_data) - 5} más')
        print()

    # Resumen de históricos
    total_tiendas = len([t for t in todas_tiendas.keys() if t.startswith('tienda_')])
    completas = len([t for t in tiendas_historico_completo if t.startswith('tienda_')])
    incompletas = len(tiendas_historico_incompleto)

    print(f'{CYAN}{BOLD}' + '─' * 80 + f'{RESET}')
    print(f'{CYAN}{BOLD}📊 ESTADO DE HISTÓRICOS{RESET}')
    print(f'{CYAN}{BOLD}' + '─' * 80 + f'{RESET}')

    porcentaje = (completas / total_tiendas * 100) if total_tiendas > 0 else 0

    if completas == total_tiendas:
        print(f'  {GREEN}{BOLD}✓✓ COMPLETOS: {completas}/{total_tiendas} tiendas (100%) 🎉{RESET}')
        print(f'  {GREEN}{BOLD}   ¡TODAS LAS TIENDAS TIENEN SU HISTÓRICO COMPLETO!{RESET}')
    else:
        print(f'  {GREEN}✓ Completos: {completas}/{total_tiendas} tiendas ({porcentaje:.1f}%){RESET}')
        print(f'  {YELLOW}⚠️ Incompletos: {incompletas}/{total_tiendas} tiendas{RESET}')

        if tiendas_historico_incompleto:
            print(f'\n  {YELLOW}Tiendas pendientes de histórico:{RESET}')
            for tid, _, _ in sorted(tiendas_historico_incompleto):
                print(f'    • {tid}')

    print()

    print(f'{GREEN}💡 Comandos sugeridos:{RESET}')
    print(f'  cd etl')
    print(f'  python3 etl_inventario.py      # Sincronizar inventario')
    print(f'  python3 etl_ventas.py           # Sincronizar ventas')
    print()

if __name__ == '__main__':
    generar_reporte()
