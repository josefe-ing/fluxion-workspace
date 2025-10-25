#!/usr/bin/env python3
"""
Verificador de Límites Históricos - Fluxion AI
Identifica el límite real de datos históricos disponibles para cada tienda
"""

import json
import duckdb
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple
import sys

# Agregar el directorio core al path
sys.path.append(str(Path(__file__).parent / 'etl' / 'core'))

DB_PATH = Path(__file__).parent / 'data' / 'fluxion_production.db'
CONFIG_PATH = Path(__file__).parent / 'config_historico_tiendas.json'

# Colores
GREEN = '\033[92m'
YELLOW = '\033[93m'
RED = '\033[91m'
CYAN = '\033[96m'
BOLD = '\033[1m'
RESET = '\033[0m'

def obtener_fechas_actuales() -> Dict[str, Tuple[str, str]]:
    """Obtiene las fechas mínimas y máximas de cada tienda en la BD"""
    conn = duckdb.connect(str(DB_PATH), read_only=True)

    query = """
    SELECT
        ubicacion_id,
        MIN(fecha) as fecha_min,
        MAX(fecha) as fecha_max
    FROM ventas_raw
    WHERE ubicacion_id LIKE 'tienda_%'
    GROUP BY ubicacion_id
    ORDER BY ubicacion_id
    """

    resultado = conn.execute(query).fetchall()
    conn.close()

    fechas = {}
    for ubicacion_id, fecha_min, fecha_max in resultado:
        fechas[ubicacion_id] = (fecha_min, fecha_max)

    return fechas

def identificar_grupos_historicos(fechas: Dict[str, Tuple[str, str]]) -> Dict[str, List[str]]:
    """Agrupa tiendas por fecha de inicio (posible límite histórico común)"""
    grupos = {}

    for tienda_id, (fecha_min, fecha_max) in fechas.items():
        if fecha_min not in grupos:
            grupos[fecha_min] = []
        grupos[fecha_min].append(tienda_id)

    return grupos

def verificar_limite_historico_grupo(tienda_referencia: str, fecha_actual_min: str) -> bool:
    """
    Verifica si hay datos antes de la fecha mínima actual.
    Intenta buscar datos 30 días antes de la fecha mínima conocida.

    Returns:
        True si NO hay datos anteriores (límite confirmado)
        False si SÍ hay datos anteriores (falta histórico)
    """
    from core.extractor_ventas import VentasExtractor
    from core.tiendas_config import TIENDAS_CONFIG

    if tienda_referencia not in TIENDAS_CONFIG:
        return False

    config = TIENDAS_CONFIG[tienda_referencia]

    # Intentar buscar datos 30 días antes
    fecha_min_dt = datetime.strptime(fecha_actual_min, '%Y-%m-%d')
    fecha_buscar_inicio = (fecha_min_dt - timedelta(days=30)).date()
    fecha_buscar_fin = (fecha_min_dt - timedelta(days=1)).date()

    print(f"  🔍 Verificando {tienda_referencia}: buscando datos entre {fecha_buscar_inicio} y {fecha_buscar_fin}...")

    try:
        extractor = VentasExtractor(
            server_ip=config.server_ip,
            port=config.port,
            database=config.database,
            username=config.username,
            password=config.password
        )

        resultado = extractor.extraer_ventas(
            fecha_inicio=fecha_buscar_inicio,
            fecha_fin=fecha_buscar_fin,
            limite=100  # Solo necesitamos saber si hay algún dato
        )

        if resultado['success'] and resultado['total_registros'] > 0:
            print(f"  {YELLOW}⚠️  Encontrados {resultado['total_registros']} registros anteriores!{RESET}")
            return False
        else:
            print(f"  {GREEN}✓ Sin datos anteriores - Límite confirmado{RESET}")
            return True

    except Exception as e:
        print(f"  {RED}❌ Error verificando: {str(e)}{RESET}")
        return False

def generar_reporte():
    """Genera reporte de límites históricos"""

    print(f'{CYAN}{BOLD}')
    print('=' * 80)
    print('  VERIFICACIÓN DE LÍMITES HISTÓRICOS - FLUXION AI')
    print('  Identificando el máximo histórico disponible por tienda')
    print(f'  Fecha: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print('=' * 80)
    print(RESET)

    # 1. Obtener fechas actuales de la BD
    print(f'{BOLD}📊 PASO 1: Analizando fechas en la base de datos{RESET}')
    fechas = obtener_fechas_actuales()

    print(f'\n  Total tiendas con datos: {len(fechas)}')
    print()

    # 2. Agrupar por fecha de inicio
    print(f'{BOLD}📊 PASO 2: Agrupando tiendas por fecha de inicio{RESET}\n')
    grupos = identificar_grupos_historicos(fechas)

    for fecha_inicio in sorted(grupos.keys()):
        tiendas = grupos[fecha_inicio]
        print(f'  📅 {fecha_inicio}: {len(tiendas)} tiendas')
        print(f'     {", ".join(sorted(tiendas))}')
    print()

    # 3. Identificar grupos candidatos a límite histórico
    print(f'{BOLD}📊 PASO 3: Identificando candidatos a límite histórico{RESET}\n')

    candidatos_confirmados = {}

    for fecha_inicio in sorted(grupos.keys()):
        tiendas = grupos[fecha_inicio]

        # Si hay 2 o más tiendas con la misma fecha, es probable que sea el límite
        if len(tiendas) >= 2:
            print(f'\n{CYAN}🔍 Grupo: {fecha_inicio} ({len(tiendas)} tiendas){RESET}')
            print(f'   Tiendas: {", ".join(sorted(tiendas))}')
            print(f'   {BOLD}Probable límite histórico común{RESET}\n')

            # Verificar con una tienda del grupo
            tienda_referencia = sorted(tiendas)[0]
            es_limite = verificar_limite_historico_grupo(tienda_referencia, fecha_inicio)

            if es_limite:
                candidatos_confirmados[fecha_inicio] = {
                    'tiendas': tiendas,
                    'verificado': True
                }
                print(f'   {GREEN}{BOLD}✓✓ LÍMITE HISTÓRICO CONFIRMADO para este grupo{RESET}')
            else:
                print(f'   {YELLOW}⚠️  Posible histórico incompleto - hay datos anteriores{RESET}')
        else:
            # Tienda única con esta fecha - caso especial
            tienda = tiendas[0]
            print(f'\n{YELLOW}📍 Tienda única: {tienda} - {fecha_inicio}{RESET}')
            print(f'   Verificación manual recomendada')

    print()

    # 4. Mostrar resumen
    print(f'{CYAN}{BOLD}')
    print('=' * 80)
    print('  RESUMEN DE LÍMITES HISTÓRICOS CONFIRMADOS')
    print('=' * 80)
    print(RESET)

    if candidatos_confirmados:
        for fecha_inicio, info in sorted(candidatos_confirmados.items()):
            tiendas = info['tiendas']
            print(f'\n{GREEN}{BOLD}✓ Límite: {fecha_inicio}{RESET}')
            print(f'  Tiendas ({len(tiendas)}): {", ".join(sorted(tiendas))}')
            print(f'  {GREEN}Estas tiendas YA tienen su máximo histórico disponible{RESET}')
    else:
        print(f'\n{YELLOW}No se identificaron límites históricos confirmados automáticamente{RESET}')

    print()

    # 5. Sugerir actualización del config
    if candidatos_confirmados:
        print(f'{BOLD}📝 PASO 4: Actualizar configuración{RESET}\n')

        # Cargar config actual
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                config = json.load(f)
        else:
            config = {'tiendas': {}}

        cambios = []

        for fecha_inicio, info in candidatos_confirmados.items():
            for tienda_id in info['tiendas']:
                if tienda_id in config.get('tiendas', {}):
                    config_actual = config['tiendas'][tienda_id]

                    # Solo actualizar si la fecha es igual o anterior
                    fecha_config = config_actual.get('fecha_inicio_historico')

                    if fecha_config != fecha_inicio:
                        cambios.append({
                            'tienda': tienda_id,
                            'fecha_anterior': fecha_config,
                            'fecha_nueva': fecha_inicio,
                            'accion': 'actualizar'
                        })

                        config['tiendas'][tienda_id]['fecha_inicio_historico'] = fecha_inicio
                        config['tiendas'][tienda_id]['historico_completo'] = True
                        config['tiendas'][tienda_id]['verificado'] = True
                        config['tiendas'][tienda_id]['notas'] = f"Límite histórico confirmado: {fecha_inicio}. Verificado automáticamente {datetime.now().strftime('%Y-%m-%d')}"

        if cambios:
            print(f'  {YELLOW}Cambios propuestos en configuración:{RESET}\n')
            for cambio in cambios:
                print(f"  • {cambio['tienda']}:")
                print(f"    Anterior: {cambio['fecha_anterior']}")
                print(f"    Nueva:    {cambio['fecha_nueva']}")

            respuesta = input(f'\n  {BOLD}¿Aplicar cambios a {CONFIG_PATH.name}? (s/n): {RESET}')

            if respuesta.lower() == 's':
                config['ultima_actualizacion'] = datetime.now().strftime('%Y-%m-%d')

                with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
                    json.dump(config, f, indent=2, ensure_ascii=False)

                print(f'\n  {GREEN}✓ Configuración actualizada exitosamente{RESET}')
            else:
                print(f'\n  {YELLOW}⚠️  Cambios no aplicados{RESET}')
        else:
            print(f'  {GREEN}✓ Configuración ya está actualizada - no hay cambios necesarios{RESET}')

    print()

    # 6. Casos especiales - tiendas únicas
    print(f'{BOLD}📌 CASOS ESPECIALES (verificación manual){RESET}\n')

    for fecha_inicio, tiendas in sorted(grupos.items()):
        if len(tiendas) == 1:
            tienda = tiendas[0]
            fecha_max = fechas[tienda][1]
            print(f'  • {tienda}: {fecha_inicio} → {fecha_max}')
            print(f'    Sugerencia: Ejecutar ETL en fechas anteriores para confirmar')
            print(f'    Comando: python3 etl/core/etl_ventas_historico.py --tiendas {tienda} --fecha-inicio 2024-06-01 --fecha-fin {fecha_inicio}')
            print()

if __name__ == '__main__':
    generar_reporte()
