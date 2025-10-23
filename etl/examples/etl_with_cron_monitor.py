#!/usr/bin/env python3
"""
Ejemplo de ETL con Sentry Cron Monitors
Demuestra cómo usar el sistema de monitoreo de cron jobs

Este ejemplo muestra:
1. Monitoreo básico con context manager
2. Monitoreo multi-store (una tienda = un monitor)
3. Uso de decoradores
4. Combinación de Cron Monitor + Performance Tracking
"""

import sys
from pathlib import Path
from datetime import datetime, date, timedelta
import time
import logging

# Agregar core al path
sys.path.append(str(Path(__file__).parent.parent / 'core'))

# Import de sentry cron monitors
from sentry_cron_monitors import (
    cron_monitor,
    cron_monitor_decorator,
    get_monitor_slug,
    list_configured_monitors
)

# Import del monitor de performance (opcional, para métricas custom)
from sentry_etl import SentryETLMonitor, init_sentry_for_etl

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# EJEMPLO 1: ETL Simple con Context Manager
def etl_ventas_diario_example():
    """
    ETL diario de ventas con monitoreo de cron
    """
    logger.info("🚀 Iniciando ETL ventas diario (ejemplo)")

    # El context manager maneja automáticamente:
    # - Check-in IN_PROGRESS al inicio
    # - Check-in OK si termina exitosamente
    # - Check-in ERROR si hay excepción
    with cron_monitor("etl_ventas_diario"):
        # Simular extracción
        logger.info("📥 Extrayendo datos de ventas...")
        time.sleep(2)

        # Simular transformación
        logger.info("⚙️  Transformando datos...")
        time.sleep(1)

        # Simular carga
        logger.info("💾 Cargando datos a DuckDB...")
        time.sleep(1)

        logger.info("✅ ETL completado exitosamente")


# EJEMPLO 2: ETL con Decorador
@cron_monitor_decorator("etl_productos")
def etl_productos_example():
    """
    ETL de productos usando decorador (más limpio)
    """
    logger.info("🚀 Iniciando ETL productos (ejemplo)")

    # Tu código ETL normal
    logger.info("📥 Extrayendo catálogo de productos...")
    time.sleep(1.5)

    logger.info("💾 Actualizando catálogo en DuckDB...")
    time.sleep(1)

    logger.info("✅ Catálogo actualizado")


# EJEMPLO 3: ETL Multi-Store (una tienda = un monitor)
def etl_ventas_tienda_example(tienda_id: str, fecha: date):
    """
    Procesa ventas de UNA tienda específica
    Cada tienda tiene su propio monitor en Sentry
    """
    logger.info(f"🚀 Procesando tienda {tienda_id} para {fecha}")

    # Cada tienda_id genera un monitor separado:
    # - etl-ventas-tienda-tienda01
    # - etl-ventas-tienda-tienda02
    # etc.
    with cron_monitor("etl_ventas_tienda", tienda_id=tienda_id):
        logger.info(f"📥 Extrayendo ventas de {tienda_id}...")
        time.sleep(1)

        logger.info(f"💾 Cargando datos de {tienda_id}...")
        time.sleep(0.5)

        logger.info(f"✅ Tienda {tienda_id} procesada")


# EJEMPLO 4: Decorador Multi-Store
@cron_monitor_decorator("etl_ventas_tienda", tienda_id_param="tienda_id")
def etl_ventas_tienda_decorated(tienda_id: str, fecha: date):
    """
    Mismo que ejemplo 3, pero con decorador
    """
    logger.info(f"🚀 Procesando tienda {tienda_id} (decorated)")
    time.sleep(1.5)
    logger.info(f"✅ Tienda {tienda_id} procesada")


# EJEMPLO 5: Combinar Cron Monitor + Performance Tracking
def etl_completo_con_metricas():
    """
    Combina monitoreo de cron (check-ins) con tracking de métricas custom
    """
    logger.info("🚀 ETL completo con métricas")

    # Cron monitor para detectar si el job no se ejecuta o falla
    with cron_monitor("etl_ventas_historico"):
        # Performance monitor para métricas custom
        with SentryETLMonitor(
            etl_name="ventas_historico",
            fecha_inicio="2024-01-01",
            fecha_fin="2024-12-31"
        ) as monitor:

            # Simular extracción
            monitor.add_breadcrumb("Iniciando extracción")
            logger.info("📥 Extrayendo datos históricos...")
            time.sleep(2)
            registros_extraidos = 1_500_000

            monitor.add_breadcrumb(f"Extraídos {registros_extraidos:,} registros")

            # Simular transformación
            logger.info("⚙️  Transformando datos...")
            time.sleep(1.5)
            registros_transformados = 1_450_000

            # Simular carga
            logger.info("💾 Cargando a DuckDB...")
            time.sleep(1)
            registros_cargados = 1_450_000

            # Reportar métricas custom
            monitor.add_metric("registros_extraidos", registros_extraidos)
            monitor.add_metric("registros_transformados", registros_transformados)
            monitor.add_metric("registros_cargados", registros_cargados)
            monitor.add_metric("tasa_exito", registros_cargados / registros_extraidos)

            # Marcar como exitoso
            monitor.set_success(
                registros_procesados=registros_cargados
            )

            logger.info(f"✅ Procesados {registros_cargados:,} registros")


# EJEMPLO 6: ETL con schedule personalizado
def etl_custom_schedule_example():
    """
    ETL con schedule personalizado (no en CRON_MONITORS_CONFIG)
    """
    logger.info("🚀 ETL con schedule custom")

    # Schedule custom: cada 30 minutos
    custom_schedule = {
        "type": "crontab",
        "value": "*/30 * * * *"  # Cada 30 minutos
    }

    with cron_monitor(
        "etl_custom_job",
        custom_schedule=custom_schedule
    ):
        logger.info("⚙️  Procesando job custom...")
        time.sleep(2)
        logger.info("✅ Job custom completado")


# EJEMPLO 7: Simular fallo (para ver check-in ERROR)
def etl_con_error_example():
    """
    Demuestra cómo se captura un error
    """
    logger.info("🚀 ETL que va a fallar (ejemplo)")

    try:
        with cron_monitor("etl_ventas_diario"):
            logger.info("📥 Extrayendo datos...")
            time.sleep(1)

            # Simular error
            raise Exception("Error de conexión simulado a SQL Server")

    except Exception as e:
        logger.error(f"❌ ETL falló: {e}")
        # En este caso, el context manager ya envió check-in ERROR
        # Tu código puede decidir si re-lanzar o manejar el error


# EJEMPLO 8: Procesamiento paralelo multi-store
def procesar_todas_las_tiendas(fecha: date):
    """
    Procesa múltiples tiendas, cada una con su propio monitor
    """
    tiendas = ["tienda01", "tienda02", "tienda03", "tienda04"]

    logger.info(f"🚀 Procesando {len(tiendas)} tiendas para {fecha}")

    for tienda_id in tiendas:
        try:
            # Cada tienda tiene su propio check-in independiente
            etl_ventas_tienda_example(tienda_id, fecha)
        except Exception as e:
            logger.error(f"❌ Error procesando {tienda_id}: {e}")
            # Continuar con las demás tiendas


# EJEMPLO 9: Ver configuración de monitores
def listar_monitores():
    """
    Lista todos los monitores configurados
    """
    logger.info("📋 Monitores configurados:")

    monitors = list_configured_monitors()

    for etl_name, config in monitors.items():
        monitor_slug = get_monitor_slug(etl_name)
        schedule = config["schedule"]
        max_runtime = config["max_runtime"]

        logger.info(f"  - {monitor_slug}")
        logger.info(f"    Schedule: {schedule}")
        logger.info(f"    Max Runtime: {max_runtime} minutos")
        logger.info("")


def main():
    """
    Ejecuta los ejemplos
    """
    logger.info("=" * 60)
    logger.info("Ejemplos de Sentry Cron Monitors")
    logger.info("=" * 60)

    # Inicializar Sentry
    logger.info("\n1️⃣  Inicializando Sentry...")
    init_sentry_for_etl()

    # Listar monitores configurados
    logger.info("\n2️⃣  Monitores configurados:")
    listar_monitores()

    # Ejemplos básicos
    logger.info("\n3️⃣  Ejemplo: ETL diario simple")
    etl_ventas_diario_example()

    logger.info("\n4️⃣  Ejemplo: ETL con decorador")
    etl_productos_example()

    # Multi-store
    logger.info("\n5️⃣  Ejemplo: ETL multi-store")
    fecha_hoy = date.today()
    etl_ventas_tienda_example("tienda01", fecha_hoy)
    etl_ventas_tienda_example("tienda02", fecha_hoy)

    # Decorador multi-store
    logger.info("\n6️⃣  Ejemplo: ETL multi-store con decorador")
    etl_ventas_tienda_decorated("tienda03", fecha_hoy)

    # Métricas custom
    logger.info("\n7️⃣  Ejemplo: ETL con métricas custom")
    etl_completo_con_metricas()

    # Schedule custom
    logger.info("\n8️⃣  Ejemplo: ETL con schedule personalizado")
    etl_custom_schedule_example()

    # Procesamiento múltiple
    logger.info("\n9️⃣  Ejemplo: Procesar múltiples tiendas")
    procesar_todas_las_tiendas(fecha_hoy)

    # Error handling
    logger.info("\n🔟 Ejemplo: ETL con error (check-in ERROR)")
    etl_con_error_example()

    logger.info("\n" + "=" * 60)
    logger.info("✅ Todos los ejemplos completados")
    logger.info("=" * 60)
    logger.info("\n📊 Ahora ve a Sentry:")
    logger.info("   https://sentry.io/crons/")
    logger.info("   Selecciona tu proyecto 'fluxion-backend'")
    logger.info("   Verás todos los check-ins de estos ejemplos")


if __name__ == "__main__":
    main()
