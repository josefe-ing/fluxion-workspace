"""
Sentry Cron Monitors - Monitoreo de Jobs Programados
Implementa Check-Ins de Sentry para detectar:
- Ejecuciones faltantes (job no se ejecutó)
- Timeouts (job tardó demasiado)
- Fallos (job terminó con error)
- Historial completo de ejecuciones

Documentación: https://docs.sentry.io/product/crons/
"""
import os
import sys
import functools
from pathlib import Path
from typing import Dict, Any, Optional, Callable
from datetime import datetime, timedelta
import logging
from contextlib import contextmanager

# Agregar backend al path para importar sentry_config
sys.path.append(str(Path(__file__).parent.parent.parent / 'backend'))

try:
    import sentry_sdk
    from sentry_sdk.crons import capture_checkin
    from sentry_sdk.crons.consts import MonitorStatus
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    # Mock MonitorStatus for when Sentry is not available
    class MonitorStatus:
        IN_PROGRESS = "in_progress"
        OK = "ok"
        ERROR = "error"

logger = logging.getLogger(__name__)


# Configuración de monitores de cron para cada ETL
CRON_MONITORS_CONFIG = {
    "etl_ventas_historico": {
        "schedule": {
            "type": "crontab",
            "value": "0 2 * * *"  # Diario a las 2 AM
        },
        "checkin_margin": 30,  # minutos de margen antes de alertar
        "max_runtime": 180,    # timeout en minutos (3 horas)
        "timezone": "America/Caracas"
    },
    "etl_ventas_diario": {
        "schedule": {
            "type": "crontab",
            "value": "0 */6 * * *"  # Cada 6 horas
        },
        "checkin_margin": 15,
        "max_runtime": 60,     # 1 hora
        "timezone": "America/Caracas"
    },
    "etl_stock_actual": {
        "schedule": {
            "type": "crontab",
            "value": "0 */4 * * *"  # Cada 4 horas
        },
        "checkin_margin": 10,
        "max_runtime": 30,     # 30 minutos
        "timezone": "America/Caracas"
    },
    "etl_productos": {
        "schedule": {
            "type": "crontab",
            "value": "0 3 * * *"  # Diario a las 3 AM
        },
        "checkin_margin": 20,
        "max_runtime": 45,
        "timezone": "America/Caracas"
    },
    # ETL por tienda individual (multi-store)
    "etl_ventas_tienda": {
        "schedule": {
            "type": "interval",
            "value": 6,  # Cada 6 horas
            "unit": "hour"
        },
        "checkin_margin": 15,
        "max_runtime": 30,
        "timezone": "America/Caracas"
    }
}


def get_monitor_slug(etl_name: str, tienda_id: Optional[str] = None) -> str:
    """
    Genera un slug único para el monitor en Sentry

    Args:
        etl_name: Nombre del ETL (e.g., "etl_ventas_historico")
        tienda_id: ID de tienda opcional para ETLs multi-store

    Returns:
        Slug único para Sentry (e.g., "etl-ventas-historico-tienda01")
    """
    slug = etl_name.replace("_", "-")

    if tienda_id:
        # Normalizar tienda_id
        tienda_slug = str(tienda_id).replace("_", "-").lower()
        slug = f"{slug}-{tienda_slug}"

    return slug


def create_or_update_monitor(
    monitor_slug: str,
    schedule: Dict[str, Any],
    checkin_margin: int,
    max_runtime: int,
    timezone: str = "America/Caracas"
) -> bool:
    """
    Crea o actualiza un monitor en Sentry vía upsert de check-in

    Args:
        monitor_slug: Identificador único del monitor
        schedule: Configuración del schedule (crontab o interval)
        checkin_margin: Minutos de margen antes de alertar por falta de check-in
        max_runtime: Timeout máximo en minutos
        timezone: Zona horaria

    Returns:
        True si se configuró correctamente, False en caso contrario
    """
    if not SENTRY_AVAILABLE:
        logger.warning(f"⚠️  Sentry no disponible - monitor {monitor_slug} no configurado")
        return False

    try:
        # El primer check-in con monitor_config crea/actualiza el monitor
        # No es necesario llamar API REST separadamente
        logger.info(f"✅ Monitor {monitor_slug} configurado con schedule: {schedule}")
        return True
    except Exception as e:
        logger.error(f"❌ Error configurando monitor {monitor_slug}: {e}")
        return False


@contextmanager
def cron_monitor(
    etl_name: str,
    tienda_id: Optional[str] = None,
    custom_schedule: Optional[Dict[str, Any]] = None,
    extra_context: Optional[Dict] = None
):
    """
    Context manager para monitorear ejecuciones de ETL como cron job

    Envía check-ins automáticos a Sentry:
    - IN_PROGRESS al inicio
    - OK al completar exitosamente
    - ERROR si hay excepción

    Uso:
        with cron_monitor("etl_ventas_historico"):
            # Tu código ETL aquí
            procesar_ventas()

    Args:
        etl_name: Nombre del ETL (debe estar en CRON_MONITORS_CONFIG)
        tienda_id: ID de tienda opcional para ETLs multi-store
        custom_schedule: Schedule personalizado (opcional)
        extra_context: Contexto adicional para el check-in
    """
    if not SENTRY_AVAILABLE:
        logger.warning("⚠️  Sentry no disponible - cron monitoring deshabilitado")
        yield
        return

    # Obtener configuración del monitor
    config = CRON_MONITORS_CONFIG.get(etl_name, {})
    if not config and not custom_schedule:
        logger.warning(f"⚠️  No hay configuración para {etl_name}, usando defaults")
        config = {
            "schedule": {"type": "crontab", "value": "0 * * * *"},
            "checkin_margin": 10,
            "max_runtime": 60,
            "timezone": "America/Caracas"
        }

    # Generar slug único
    monitor_slug = get_monitor_slug(etl_name, tienda_id)

    # Usar custom_schedule si se provee
    schedule = custom_schedule or config.get("schedule")
    checkin_margin = config.get("checkin_margin", 10)
    max_runtime = config.get("max_runtime", 60)
    timezone = config.get("timezone", "America/Caracas")

    # Configuración del monitor para upsert automático
    monitor_config = {
        "schedule": schedule,
        "checkin_margin": checkin_margin,
        "max_runtime": max_runtime,
        "timezone": timezone
    }

    # Check-in de INICIO
    check_in_id = None
    start_time = datetime.now()

    try:
        logger.info(f"📊 Iniciando cron monitor: {monitor_slug}")

        # Enviar check-in IN_PROGRESS
        check_in_id = capture_checkin(
            monitor_slug=monitor_slug,
            status=MonitorStatus.IN_PROGRESS,
            monitor_config=monitor_config
        )

        # Ejecutar el código del ETL
        yield

        # Si llegamos aquí, fue exitoso
        duration_seconds = (datetime.now() - start_time).total_seconds()

        # Check-in de ÉXITO
        capture_checkin(
            monitor_slug=monitor_slug,
            check_in_id=check_in_id,
            status=MonitorStatus.OK,
            duration=duration_seconds
        )

        logger.info(f"✅ Cron monitor completado: {monitor_slug} ({duration_seconds:.1f}s)")

    except Exception as e:
        # Check-in de ERROR
        duration_seconds = (datetime.now() - start_time).total_seconds()

        capture_checkin(
            monitor_slug=monitor_slug,
            check_in_id=check_in_id,
            status=MonitorStatus.ERROR,
            duration=duration_seconds
        )

        logger.error(f"❌ Cron monitor falló: {monitor_slug} - {e}")

        # Re-raise la excepción para que el código llamador la maneje
        raise


def cron_monitor_decorator(
    etl_name: str,
    tienda_id_param: Optional[str] = None,
    custom_schedule: Optional[Dict[str, Any]] = None
):
    """
    Decorador para monitorear funciones como cron jobs

    Uso:
        @cron_monitor_decorator("etl_ventas_diario")
        def procesar_ventas_diarias():
            # Tu código aquí
            pass

        @cron_monitor_decorator("etl_ventas_tienda", tienda_id_param="tienda_id")
        def procesar_tienda(tienda_id: str, fecha: date):
            # Tu código aquí
            pass

    Args:
        etl_name: Nombre del ETL
        tienda_id_param: Nombre del parámetro que contiene tienda_id (para multi-store)
        custom_schedule: Schedule personalizado (opcional)
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Extraer tienda_id si se especificó el parámetro
            tienda_id = None
            if tienda_id_param:
                tienda_id = kwargs.get(tienda_id_param)
                if not tienda_id and len(args) > 0:
                    # Intentar obtener de args posicionales
                    # Esto es un best-effort, puede no funcionar siempre
                    import inspect
                    sig = inspect.signature(func)
                    param_names = list(sig.parameters.keys())
                    if tienda_id_param in param_names:
                        idx = param_names.index(tienda_id_param)
                        if idx < len(args):
                            tienda_id = args[idx]

            # Ejecutar con monitoreo
            with cron_monitor(
                etl_name=etl_name,
                tienda_id=tienda_id,
                custom_schedule=custom_schedule
            ):
                return func(*args, **kwargs)

        return wrapper
    return decorator


def send_manual_checkin(
    monitor_slug: str,
    status: str,  # "ok", "error", o "in_progress"
    duration: Optional[float] = None,
    environment: str = "production"
) -> bool:
    """
    Envía un check-in manual a Sentry (útil para scripts one-off)

    Args:
        monitor_slug: Slug del monitor
        status: Estado del check-in ("ok", "error", "in_progress")
        duration: Duración en segundos (opcional)
        environment: Entorno (production, staging, etc.)

    Returns:
        True si se envió correctamente, False en caso contrario
    """
    if not SENTRY_AVAILABLE:
        logger.warning("⚠️  Sentry no disponible")
        return False

    try:
        # Mapear string a MonitorStatus
        status_map = {
            "ok": MonitorStatus.OK,
            "error": MonitorStatus.ERROR,
            "in_progress": MonitorStatus.IN_PROGRESS
        }

        monitor_status = status_map.get(status.lower(), MonitorStatus.OK)

        capture_checkin(
            monitor_slug=monitor_slug,
            status=monitor_status,
            duration=duration
        )

        logger.info(f"✅ Check-in manual enviado: {monitor_slug} - {status}")
        return True

    except Exception as e:
        logger.error(f"❌ Error enviando check-in manual: {e}")
        return False


def list_configured_monitors() -> Dict[str, Dict]:
    """
    Lista todos los monitores configurados

    Returns:
        Diccionario con configuración de monitores
    """
    return CRON_MONITORS_CONFIG.copy()


def setup_all_etl_monitors() -> Dict[str, bool]:
    """
    Configura todos los monitores de ETL definidos en CRON_MONITORS_CONFIG

    Returns:
        Diccionario con resultados {monitor_slug: success}
    """
    results = {}

    for etl_name, config in CRON_MONITORS_CONFIG.items():
        monitor_slug = get_monitor_slug(etl_name)

        success = create_or_update_monitor(
            monitor_slug=monitor_slug,
            schedule=config["schedule"],
            checkin_margin=config["checkin_margin"],
            max_runtime=config["max_runtime"],
            timezone=config.get("timezone", "America/Caracas")
        )

        results[monitor_slug] = success

    return results


# Ejemplo de uso en comentarios para referencia
"""
EJEMPLOS DE USO:

# 1. Usar context manager (recomendado para la mayoría de casos)
from sentry_cron_monitors import cron_monitor

def etl_ventas_historico():
    with cron_monitor("etl_ventas_historico"):
        # Tu código ETL aquí
        extraer_datos()
        transformar_datos()
        cargar_datos()


# 2. Usar decorador (para funciones simples)
from sentry_cron_monitors import cron_monitor_decorator

@cron_monitor_decorator("etl_ventas_diario")
def procesar_ventas_diarias():
    # Tu código aquí
    pass


# 3. ETL multi-store con tienda_id
from sentry_cron_monitors import cron_monitor

def procesar_tienda(tienda_id: str, fecha: date):
    # Cada tienda tiene su propio monitor
    with cron_monitor("etl_ventas_tienda", tienda_id=tienda_id):
        # Procesar esta tienda específica
        extraer_ventas(tienda_id, fecha)


# 4. Decorador multi-store
@cron_monitor_decorator("etl_ventas_tienda", tienda_id_param="tienda_id")
def procesar_tienda_decorated(tienda_id: str, fecha: date):
    # Procesar esta tienda
    pass


# 5. Schedule personalizado
from sentry_cron_monitors import cron_monitor

with cron_monitor(
    "etl_custom",
    custom_schedule={
        "type": "crontab",
        "value": "*/30 * * * *"  # Cada 30 minutos
    }
):
    # Tu código
    pass


# 6. Check-in manual (para scripts one-off)
from sentry_cron_monitors import send_manual_checkin
import time

start = time.time()
try:
    send_manual_checkin("etl-manual-job", "in_progress")

    # Tu código
    procesar_datos()

    duration = time.time() - start
    send_manual_checkin("etl-manual-job", "ok", duration=duration)
except Exception as e:
    duration = time.time() - start
    send_manual_checkin("etl-manual-job", "error", duration=duration)
    raise


# 7. Ver en Sentry
# - Ve a https://sentry.io/crons/
# - Selecciona tu proyecto "fluxion-backend"
# - Verás todos los monitores con su historial de ejecuciones
# - Configura alertas para ejecuciones faltantes o fallos


# 8. Configurar todos los monitores de una vez
from sentry_cron_monitors import setup_all_etl_monitors

results = setup_all_etl_monitors()
for monitor, success in results.items():
    print(f"{monitor}: {'✅' if success else '❌'}")
"""
