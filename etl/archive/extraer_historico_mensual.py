#!/usr/bin/env python3
"""
Script para extracción histórica mensual de ventas
Extrae datos mes a mes hacia atrás desde septiembre 2025 hasta enero 2024
"""

import subprocess
import sys
from datetime import datetime, date
import calendar

# Lista de tiendas (excluyendo CEDIs)
TIENDAS = [
    "tienda_01", "tienda_02", "tienda_03", "tienda_04", "tienda_05",
    "tienda_06", "tienda_07", "tienda_08", "tienda_09", "tienda_10",
    "tienda_11", "tienda_12", "tienda_13", "tienda_15", "tienda_16",
    "tienda_19", "mayorista_01"
]

def ejecutar_etl_mes(año, mes, tiendas=None):
    """Ejecuta ETL para un mes específico"""
    if tiendas is None:
        tiendas = TIENDAS

    # Calcular fechas del mes
    primer_dia = date(año, mes, 1)
    ultimo_dia = date(año, mes, calendar.monthrange(año, mes)[1])

    fecha_inicio = primer_dia.strftime('%Y-%m-%d')
    fecha_fin = ultimo_dia.strftime('%Y-%m-%d')

    print(f"\n🗓️  PROCESANDO: {calendario_mes(mes)} {año}")
    print(f"📅 Periodo: {fecha_inicio} al {fecha_fin}")
    print(f"🏪 Tiendas: {len(tiendas)} ubicaciones")
    print("=" * 60)

    # Construir comando
    cmd = [
        "python3", "etl_ventas_historico.py",
        "--fecha-inicio", fecha_inicio,
        "--fecha-fin", fecha_fin,
        "--secuencial",  # Procesamiento secuencial para evitar problemas
        "--tiendas"
    ] + tiendas

    try:
        # Ejecutar comando
        print(f"🚀 Ejecutando: {' '.join(cmd[:6])} ... (con {len(tiendas)} tiendas)")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)  # 1 hora timeout

        if result.returncode == 0:
            print(f"✅ {calendario_mes(mes)} {año} completado exitosamente")
            return True
        else:
            print(f"❌ Error en {calendario_mes(mes)} {año}:")
            print(result.stderr)
            return False

    except subprocess.TimeoutExpired:
        print(f"⏰ Timeout en {calendario_mes(mes)} {año}")
        return False
    except Exception as e:
        print(f"💥 Error ejecutando {calendario_mes(mes)} {año}: {str(e)}")
        return False

def calendario_mes(mes):
    """Convierte número de mes a nombre"""
    meses = [
        "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]
    return meses[mes]

def main():
    """Función principal"""
    print("🎯 EXTRACCIÓN HISTÓRICA DE VENTAS")
    print("📈 Desde Septiembre 2025 hasta Enero 2024")
    print("🏪 17 ubicaciones (excluyendo CEDIs)")
    print("=" * 60)

    # Rango de extracción: Sept 2025 hacia atrás hasta Enero 2024
    meses_proceso = []

    # 2025: Septiembre hacia atrás hasta Enero
    for mes in range(9, 0, -1):  # Sept=9 a Enero=1
        meses_proceso.append((2025, mes))

    # 2024: Diciembre hacia atrás hasta Enero
    for mes in range(12, 0, -1):  # Dic=12 a Enero=1
        meses_proceso.append((2024, mes))

    print(f"📋 Total de meses a procesar: {len(meses_proceso)}")
    print(f"🗓️  Desde: {calendario_mes(meses_proceso[0][1])} {meses_proceso[0][0]}")
    print(f"🗓️  Hasta: {calendario_mes(meses_proceso[-1][1])} {meses_proceso[-1][0]}")

    # Confirmar antes de empezar
    respuesta = input(f"\n¿Continuar con la extracción? (s/n): ").lower().strip()
    if respuesta not in ['s', 'si', 'sí', 'y', 'yes']:
        print("❌ Proceso cancelado por el usuario")
        return

    # Procesar cada mes
    exitosos = 0
    fallidos = 0

    for i, (año, mes) in enumerate(meses_proceso, 1):
        print(f"\n📊 PROGRESO: {i}/{len(meses_proceso)} meses")

        if ejecutar_etl_mes(año, mes):
            exitosos += 1
        else:
            fallidos += 1
            print(f"⚠️  ¿Continuar con el siguiente mes? (s/n): ", end='')
            if input().lower().strip() not in ['s', 'si', 'sí', 'y', 'yes']:
                break

    print(f"\n🎉 PROCESO COMPLETADO")
    print(f"✅ Exitosos: {exitosos}")
    print(f"❌ Fallidos: {fallidos}")
    print(f"📊 Total procesado: {exitosos + fallidos} de {len(meses_proceso)} meses")

if __name__ == "__main__":
    main()