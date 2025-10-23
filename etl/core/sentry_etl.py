"""
Integración de Sentry para ETL - Monitoreo y Tracking
Provee funciones helper para instrumentar ETLs con Sentry
"""
import os
import sys
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
import logging

# Agregar backend al path para importar sentry_config
sys.path.append(str(Path(__file__).parent.parent.parent / 'backend'))

try:
    import sentry_sdk
    from sentry_sdk import start_transaction, set_context, set_tag
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

logger = logging.getLogger(__name__)


def init_sentry_for_etl():
    """
    Inicializa Sentry específicamente para procesos ETL
    Lee configuración de variables de entorno
    """
    if not SENTRY_AVAILABLE:
        logger.warning("⚠️  Sentry SDK no disponible - monitoreo deshabilitado")
        return False

    sentry_dsn = os.getenv("SENTRY_DSN")
    if not sentry_dsn:
        logger.warning("⚠️  SENTRY_DSN no configurado - monitoreo deshabilitado")
        return False

    try:
        sentry_sdk.init(
            dsn=sentry_dsn,
            environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            # Configuración específica para ETL
            send_default_pii=False,
            attach_stacktrace=True,
            before_send=_etl_before_send,
        )

        logger.info("✅ Sentry inicializado para ETL")
        return True
    except Exception as e:
        logger.error(f"❌ Error inicializando Sentry: {e}")
        return False


def _etl_before_send(event, hint):
    """Handler personalizado para eventos de ETL"""
    # Agregar tag de ETL
    event.setdefault("tags", {})
    event["tags"]["app"] = "fluxion-etl"
    event["tags"]["component"] = "etl"
    return event


class SentryETLMonitor:
    """
    Context manager para monitorear ejecuciones de ETL con Sentry

    Uso:
        with SentryETLMonitor(
            etl_name="ventas_historico",
            tienda_id="tienda_01",
            fecha_inicio="2024-01-01",
            fecha_fin="2024-12-31"
        ) as monitor:
            # Tu código ETL aquí
            resultado = procesar_datos()

            # Reportar métricas
            monitor.add_metric("registros_procesados", 1000000)
            monitor.add_metric("tiempo_extraccion", 120.5)

            # Reportar éxito
            monitor.set_success(registros_procesados=1000000)
    """

    def __init__(
        self,
        etl_name: str,
        tienda_id: Optional[str] = None,
        fecha_inicio: Optional[str] = None,
        fecha_fin: Optional[str] = None,
        extra_context: Optional[Dict] = None
    ):
        self.etl_name = etl_name
        self.tienda_id = tienda_id
        self.fecha_inicio = fecha_inicio
        self.fecha_fin = fecha_fin
        self.extra_context = extra_context or {}

        self.transaction = None
        self.start_time = None
        self.metrics = {}
        self.success = False

    def __enter__(self):
        """Inicia el monitoreo"""
        if not SENTRY_AVAILABLE:
            return self

        self.start_time = datetime.now()

        # Iniciar transacción de Sentry
        self.transaction = start_transaction(
            op="etl.run",
            name=f"ETL: {self.etl_name}"
        )

        # Agregar contexto
        context = {
            "etl_name": self.etl_name,
            "start_time": self.start_time.isoformat(),
        }

        if self.tienda_id:
            context["tienda_id"] = self.tienda_id
            set_tag("tienda", self.tienda_id)

        if self.fecha_inicio:
            context["fecha_inicio"] = self.fecha_inicio

        if self.fecha_fin:
            context["fecha_fin"] = self.fecha_fin

        context.update(self.extra_context)

        set_context("etl", context)
        set_tag("etl_name", self.etl_name)

        logger.info(f"📊 Sentry monitoring iniciado: {self.etl_name}")

        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Finaliza el monitoreo y reporta resultados"""
        if not SENTRY_AVAILABLE:
            return False

        end_time = datetime.now()
        duration_seconds = (end_time - self.start_time).total_seconds()

        # Agregar duración a métricas
        self.add_metric("duration_seconds", duration_seconds)

        # Si hubo excepción, capturarla
        if exc_type is not None:
            self.success = False

            # Capturar excepción con contexto completo
            sentry_sdk.capture_exception(
                exc_val,
                contexts={
                    "etl": {
                        "name": self.etl_name,
                        "tienda_id": self.tienda_id,
                        "duration_seconds": duration_seconds,
                        "metrics": self.metrics,
                    }
                }
            )

            logger.error(f"❌ ETL {self.etl_name} falló: {exc_val}")

        # Finalizar transacción
        if self.transaction:
            # Agregar métricas a la transacción
            for key, value in self.metrics.items():
                self.transaction.set_measurement(key, value)

            # Establecer status
            if self.success:
                self.transaction.set_status("ok")
                logger.info(f"✅ ETL {self.etl_name} completado exitosamente")
            else:
                self.transaction.set_status("internal_error")

            self.transaction.finish()

        return False  # No suprimir excepciones

    def add_metric(self, name: str, value: float):
        """Agrega una métrica personalizada"""
        self.metrics[name] = value

    def set_success(self, **kwargs):
        """Marca el ETL como exitoso con métricas adicionales"""
        self.success = True
        self.metrics.update(kwargs)

    def add_breadcrumb(self, message: str, level: str = "info", **data):
        """Agrega un breadcrumb para tracking de pasos"""
        if SENTRY_AVAILABLE:
            sentry_sdk.add_breadcrumb(
                category="etl",
                message=message,
                level=level,
                data=data
            )


def capture_etl_error(
    error: Exception,
    etl_name: str,
    tienda_id: Optional[str] = None,
    context: Optional[Dict] = None
):
    """
    Captura un error de ETL con contexto adicional

    Args:
        error: La excepción a capturar
        etl_name: Nombre del ETL
        tienda_id: ID de la tienda (opcional)
        context: Contexto adicional (opcional)
    """
    if not SENTRY_AVAILABLE:
        return

    with sentry_sdk.push_scope() as scope:
        scope.set_tag("etl_name", etl_name)

        if tienda_id:
            scope.set_tag("tienda", tienda_id)

        if context:
            scope.set_context("etl_error", context)

        sentry_sdk.capture_exception(error)

    logger.error(f"❌ Error en ETL {etl_name}: {error}")


def capture_etl_success(
    etl_name: str,
    tienda_id: Optional[str] = None,
    metrics: Optional[Dict[str, Any]] = None
):
    """
    Captura una ejecución exitosa de ETL con métricas

    Args:
        etl_name: Nombre del ETL
        tienda_id: ID de la tienda (opcional)
        metrics: Métricas del ETL (registros procesados, duración, etc.)
    """
    if not SENTRY_AVAILABLE:
        return

    message = f"ETL {etl_name} completado exitosamente"

    if tienda_id:
        message += f" - Tienda: {tienda_id}"

    # Crear mensaje con métricas
    sentry_sdk.capture_message(
        message,
        level="info",
        contexts={
            "etl_success": {
                "etl_name": etl_name,
                "tienda_id": tienda_id,
                "metrics": metrics or {},
                "timestamp": datetime.now().isoformat()
            }
        }
    )

    logger.info(f"✅ {message}")


def track_etl_retry(
    etl_name: str,
    tienda_id: str,
    retry_count: int,
    error: Optional[str] = None
):
    """
    Trackea reintentos de ETL

    Args:
        etl_name: Nombre del ETL
        tienda_id: ID de la tienda
        retry_count: Número de reintento
        error: Mensaje de error (opcional)
    """
    if not SENTRY_AVAILABLE:
        return

    sentry_sdk.capture_message(
        f"ETL {etl_name} reintentando - Tienda: {tienda_id}, Intento: {retry_count}",
        level="warning",
        contexts={
            "etl_retry": {
                "etl_name": etl_name,
                "tienda_id": tienda_id,
                "retry_count": retry_count,
                "error": error,
                "timestamp": datetime.now().isoformat()
            }
        }
    )


# Ejemplo de uso en comentarios para referencia
"""
EJEMPLO DE USO:

# 1. Inicializar Sentry al inicio del script ETL
init_sentry_for_etl()

# 2. Usar context manager para monitorear ETL completo
with SentryETLMonitor(
    etl_name="ventas_historico",
    tienda_id="tienda_01",
    fecha_inicio="2024-01-01",
    fecha_fin="2024-12-31"
) as monitor:

    # Agregar breadcrumbs para tracking de pasos
    monitor.add_breadcrumb("Iniciando extracción de datos")

    # Tu código ETL
    datos = extraer_datos()

    monitor.add_breadcrumb(f"Datos extraídos: {len(datos)} registros")

    transformados = transformar_datos(datos)

    monitor.add_breadcrumb("Datos transformados")

    cargar_datos(transformados)

    # Reportar métricas
    monitor.add_metric("registros_procesados", len(datos))
    monitor.add_metric("registros_cargados", len(transformados))

    # Marcar como exitoso
    monitor.set_success(
        registros_procesados=len(datos),
        registros_cargados=len(transformados)
    )

# 3. Capturar errores específicos
try:
    procesar_tienda(tienda_id)
except Exception as e:
    capture_etl_error(
        error=e,
        etl_name="ventas_diarias",
        tienda_id=tienda_id,
        context={"fecha": fecha_proceso}
    )

# 4. Reportar éxito con métricas
capture_etl_success(
    etl_name="ventas_diarias",
    tienda_id=tienda_id,
    metrics={
        "registros_procesados": 50000,
        "duration_seconds": 120.5,
        "registros_duplicados": 5
    }
)

# 5. Trackear reintentos
track_etl_retry(
    etl_name="ventas_diarias",
    tienda_id="tienda_01",
    retry_count=2,
    error="Timeout en conexión SQL Server"
)
"""
