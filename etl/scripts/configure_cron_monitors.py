#!/usr/bin/env python3
"""
Script para configurar Cron Monitors según tus ETLs reales

Este script te ayuda a:
1. Identificar qué ETLs tienes
2. Definir schedules para cada uno
3. Configurar timeouts y márgenes
4. Generar configuración lista para usar
"""

import sys
from pathlib import Path
from typing import Dict, Any
import json

# Agregar core al path
sys.path.append(str(Path(__file__).parent.parent / 'core'))

from sentry_cron_monitors import (
    CRON_MONITORS_CONFIG,
    get_monitor_slug,
    list_configured_monitors
)


def print_current_config():
    """
    Muestra la configuración actual
    """
    print("=" * 70)
    print("CONFIGURACIÓN ACTUAL DE CRON MONITORS")
    print("=" * 70)
    print()

    monitors = list_configured_monitors()

    if not monitors:
        print("⚠️  No hay monitores configurados")
        return

    for etl_name, config in monitors.items():
        slug = get_monitor_slug(etl_name)
        schedule = config["schedule"]
        margin = config["checkin_margin"]
        runtime = config["max_runtime"]
        tz = config.get("timezone", "UTC")

        print(f"📊 Monitor: {slug}")
        print(f"   ETL: {etl_name}")

        if schedule["type"] == "crontab":
            print(f"   Schedule: {schedule['value']} (crontab)")
            print(f"   Frecuencia: {_explain_crontab(schedule['value'])}")
        else:
            print(f"   Schedule: Cada {schedule['value']} {schedule['unit']}(s)")

        print(f"   Check-in Margin: {margin} minutos")
        print(f"   Max Runtime: {runtime} minutos ({runtime/60:.1f} horas)")
        print(f"   Timezone: {tz}")
        print()


def _explain_crontab(cron_expr: str) -> str:
    """
    Explica en lenguaje humano qué significa la expresión cron
    """
    # Simplificado - solo casos comunes
    explanations = {
        "0 2 * * *": "Diario a las 2:00 AM",
        "0 */6 * * *": "Cada 6 horas",
        "0 */4 * * *": "Cada 4 horas",
        "0 */2 * * *": "Cada 2 horas",
        "0 * * * *": "Cada hora",
        "*/30 * * * *": "Cada 30 minutos",
        "*/15 * * * *": "Cada 15 minutos",
        "0 3 * * *": "Diario a las 3:00 AM",
        "0 0 * * *": "Diario a medianoche",
    }

    return explanations.get(cron_expr, cron_expr)


def suggest_config_for_etl(
    etl_name: str,
    frequency: str,
    expected_duration_minutes: int
) -> Dict[str, Any]:
    """
    Sugiere configuración para un ETL basado en frecuencia y duración

    Args:
        etl_name: Nombre del ETL
        frequency: "hourly", "every-2h", "every-4h", "every-6h", "daily", "weekly"
        expected_duration_minutes: Duración esperada en minutos

    Returns:
        Configuración sugerida
    """
    # Mapear frecuencia a crontab
    frequency_map = {
        "hourly": "0 * * * *",
        "every-2h": "0 */2 * * *",
        "every-4h": "0 */4 * * *",
        "every-6h": "0 */6 * * *",
        "daily": "0 2 * * *",  # 2 AM por defecto
        "weekly": "0 2 * * 0",  # Domingos a las 2 AM
    }

    cron_expr = frequency_map.get(frequency, "0 * * * *")

    # Calcular margin (10-20% del período)
    margin_map = {
        "hourly": 10,
        "every-2h": 15,
        "every-4h": 20,
        "every-6h": 30,
        "daily": 60,
        "weekly": 180,
    }

    checkin_margin = margin_map.get(frequency, 10)

    # Max runtime = duración esperada + 50% buffer
    max_runtime = int(expected_duration_minutes * 1.5)

    config = {
        etl_name: {
            "schedule": {
                "type": "crontab",
                "value": cron_expr
            },
            "checkin_margin": checkin_margin,
            "max_runtime": max_runtime,
            "timezone": "America/Caracas"
        }
    }

    return config


def interactive_setup():
    """
    Setup interactivo para configurar nuevos monitores
    """
    print()
    print("=" * 70)
    print("CONFIGURAR NUEVO MONITOR")
    print("=" * 70)
    print()

    # Nombre del ETL
    etl_name = input("Nombre del ETL (ej: etl_productos): ").strip()

    if not etl_name:
        print("❌ Nombre requerido")
        return

    # Frecuencia
    print()
    print("Frecuencia:")
    print("  1) Cada hora")
    print("  2) Cada 2 horas")
    print("  3) Cada 4 horas")
    print("  4) Cada 6 horas")
    print("  5) Diario")
    print("  6) Semanal")
    print("  7) Custom (crontab)")
    print()

    freq_choice = input("Selecciona (1-7): ").strip()

    freq_map = {
        "1": "hourly",
        "2": "every-2h",
        "3": "every-4h",
        "4": "every-6h",
        "5": "daily",
        "6": "weekly",
    }

    if freq_choice == "7":
        # Custom crontab
        cron_expr = input("Expresión crontab (ej: 0 2 * * *): ").strip()
        schedule = {"type": "crontab", "value": cron_expr}
        checkin_margin = int(input("Check-in margin (minutos, ej: 30): ").strip() or "30")
    else:
        frequency = freq_map.get(freq_choice, "daily")

        # Duración esperada
        print()
        duration = int(input("Duración esperada (minutos, ej: 60): ").strip() or "60")

        # Generar config sugerida
        config = suggest_config_for_etl(etl_name, frequency, duration)
        schedule = config[etl_name]["schedule"]
        checkin_margin = config[etl_name]["checkin_margin"]
        max_runtime = config[etl_name]["max_runtime"]

    if freq_choice != "7":
        max_runtime = int(input(f"Max runtime (minutos, sugerido: {max_runtime}): ").strip() or str(max_runtime))

    # Timezone
    timezone = input("Timezone (default: America/Caracas): ").strip() or "America/Caracas"

    # Construir config final
    final_config = {
        etl_name: {
            "schedule": schedule,
            "checkin_margin": checkin_margin,
            "max_runtime": max_runtime,
            "timezone": timezone
        }
    }

    # Mostrar resultado
    print()
    print("=" * 70)
    print("CONFIGURACIÓN GENERADA")
    print("=" * 70)
    print()
    print("Agrega esto a etl/core/sentry_cron_monitors.py:")
    print()
    print("```python")
    print(f'"{etl_name}": {{')
    print(f'    "schedule": {json.dumps(final_config[etl_name]["schedule"], indent=8)[:-1]},')
    print(f'    "checkin_margin": {final_config[etl_name]["checkin_margin"]},')
    print(f'    "max_runtime": {final_config[etl_name]["max_runtime"]},')
    print(f'    "timezone": "{final_config[etl_name]["timezone"]}"')
    print('},')
    print("```")
    print()

    # Ejemplo de uso
    slug = get_monitor_slug(etl_name)
    print("Ejemplo de uso en tu código:")
    print()
    print("```python")
    print("from sentry_cron_monitors import cron_monitor")
    print()
    print(f'with cron_monitor("{etl_name}"):')
    print("    # Tu código ETL aquí")
    print("    procesar_datos()")
    print("```")
    print()
    print(f"Monitor slug en Sentry: {slug}")
    print()


def print_template_for_aws_eventbridge():
    """
    Muestra templates para AWS EventBridge basados en la config actual
    """
    print()
    print("=" * 70)
    print("AWS EVENTBRIDGE RULES (Terraform/CloudFormation)")
    print("=" * 70)
    print()

    monitors = list_configured_monitors()

    for etl_name, config in monitors.items():
        schedule = config["schedule"]

        if schedule["type"] != "crontab":
            continue

        cron_expr = schedule["value"]

        # Convertir cron Unix a cron AWS (diferente sintaxis)
        # Unix: min hour day month weekday
        # AWS:  min hour day month weekday year
        aws_cron = f"cron({cron_expr} *)"  # Agregar year wildcard

        print(f"# {etl_name}")
        print("resource \"aws_cloudwatch_event_rule\" \"{etl_name}_schedule\" {{")
        print(f'  name                = "{etl_name}"')
        print(f'  description         = "Schedule for {etl_name}"')
        print(f'  schedule_expression = "{aws_cron}"')
        print("}")
        print()


def main():
    """
    Menu principal
    """
    while True:
        print()
        print("=" * 70)
        print("CONFIGURADOR DE SENTRY CRON MONITORS")
        print("=" * 70)
        print()
        print("Opciones:")
        print("  1) Ver configuración actual")
        print("  2) Configurar nuevo monitor (interactivo)")
        print("  3) Generar templates AWS EventBridge")
        print("  4) Salir")
        print()

        choice = input("Selecciona (1-4): ").strip()

        if choice == "1":
            print_current_config()
        elif choice == "2":
            interactive_setup()
        elif choice == "3":
            print_template_for_aws_eventbridge()
        elif choice == "4":
            print("\n👋 Bye!")
            break
        else:
            print("❌ Opción inválida")

        input("\nPresiona Enter para continuar...")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Cancelled by user")
        sys.exit(0)
