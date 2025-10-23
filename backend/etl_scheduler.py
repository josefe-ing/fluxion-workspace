#!/usr/bin/env python3
"""
ETL Scheduler para Fluxion AI - Ventas Automáticas
Ejecuta ETL de ventas diariamente a las 5:00 AM con política de reintentos
"""

import logging
import asyncio
from datetime import datetime, time, timedelta, date
from typing import Dict, List, Optional, Set
import threading
from dataclasses import dataclass, field
import duckdb
from pathlib import Path
import sys

# Configure logger FIRST before any code that uses it
logger = logging.getLogger(__name__)

# Agregar path de ETL core para imports
sys.path.append(str(Path(__file__).parent.parent / 'etl' / 'core'))

# Importar módulo de Sentry para ETL
try:
    from sentry_etl import (
        init_sentry_for_etl,
        SentryETLMonitor,
        capture_etl_error,
        track_etl_retry
    )
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False
    logger.warning("⚠️  Sentry ETL module not available - monitoring disabled")

@dataclass
class RetryConfig:
    """Configuración de reintentos para tiendas fallidas"""
    max_retries: int = 3
    retry_interval_minutes: int = 20
    failed_stores: Dict[str, int] = field(default_factory=dict)  # store_id -> retry_count
    pending_retries: Set[str] = field(default_factory=set)  # stores pendientes de retry

@dataclass
class SchedulerStatus:
    """Estado del scheduler"""
    enabled: bool = True
    last_execution: Optional[datetime] = None
    next_execution: Optional[datetime] = None
    is_running: bool = False
    daily_summary: Dict = field(default_factory=dict)
    retry_config: RetryConfig = field(default_factory=RetryConfig)

class VentasETLScheduler:
    """
    Scheduler para ETL automático de ventas
    - Ejecuta diariamente a las 5:00 AM
    - Procesa todas las tiendas del día anterior
    - Implementa política de reintentos cada 20 minutos
    """

    def __init__(self, db_path: str, execution_hour: int = 5, execution_minute: int = 0):
        self.db_path = Path(db_path)
        self.execution_time = time(hour=execution_hour, minute=execution_minute)
        self.status = SchedulerStatus()
        self.is_running_flag = False
        self._scheduler_thread = None
        self._retry_thread = None

        # Callbacks para ejecutar ETL (se inyectan desde main.py)
        self.etl_callback = None

        # Inicializar Sentry para ETL
        if SENTRY_AVAILABLE:
            init_sentry_for_etl()
            logger.info("✅ Sentry ETL monitoring habilitado")

        logger.info(f"📅 VentasETLScheduler inicializado - Ejecución diaria: {self.execution_time}")

    def set_etl_callback(self, callback):
        """Establece el callback para ejecutar ETL de ventas"""
        self.etl_callback = callback
        logger.info("✅ ETL callback registrado")

    def start(self):
        """Inicia el scheduler en un thread separado"""
        if self._scheduler_thread and self._scheduler_thread.is_alive():
            logger.warning("⚠️  Scheduler ya está corriendo")
            return

        self.status.enabled = True
        self._scheduler_thread = threading.Thread(target=self._run_scheduler, daemon=True)
        self._scheduler_thread.start()

        # Thread para reintentos
        self._retry_thread = threading.Thread(target=self._run_retry_scheduler, daemon=True)
        self._retry_thread.start()

        logger.info("🚀 Scheduler iniciado exitosamente")

    def stop(self):
        """Detiene el scheduler"""
        self.status.enabled = False
        logger.info("🛑 Scheduler detenido")

    def _calculate_next_execution(self) -> datetime:
        """Calcula la próxima ejecución basada en la hora configurada"""
        now = datetime.now()
        next_exec = datetime.combine(now.date(), self.execution_time)

        # Si ya pasó la hora hoy, programar para mañana
        if next_exec <= now:
            next_exec += timedelta(days=1)

        return next_exec

    def _get_all_tiendas(self) -> List[str]:
        """Obtiene todas las tiendas desde la base de datos"""
        try:
            conn = duckdb.connect(str(self.db_path), read_only=True)

            # Obtener tiendas únicas que tienen ventas
            query = """
                SELECT DISTINCT ubicacion_id
                FROM ventas_raw
                ORDER BY ubicacion_id
            """

            result = conn.execute(query).fetchall()
            conn.close()

            tiendas = [row[0] for row in result]
            logger.info(f"📊 Tiendas encontradas: {len(tiendas)}")

            return tiendas

        except Exception as e:
            logger.error(f"❌ Error obteniendo tiendas: {str(e)}")
            return []

    def _run_scheduler(self):
        """Loop principal del scheduler"""
        logger.info("📅 Scheduler thread iniciado")

        while self.status.enabled:
            try:
                # Calcular próxima ejecución
                self.status.next_execution = self._calculate_next_execution()
                seconds_until_execution = (self.status.next_execution - datetime.now()).total_seconds()

                logger.info(f"⏰ Próxima ejecución automática: {self.status.next_execution.strftime('%Y-%m-%d %H:%M:%S')} "
                           f"(en {seconds_until_execution/3600:.1f} horas)")

                # Esperar hasta la hora de ejecución (revisar cada minuto)
                while datetime.now() < self.status.next_execution and self.status.enabled:
                    threading.Event().wait(60)  # Esperar 1 minuto

                # Ejecutar ETL si el scheduler sigue habilitado
                if self.status.enabled:
                    logger.info("🎯 Iniciando ejecución automática de ETL de ventas")
                    self._execute_daily_etl()

            except Exception as e:
                logger.error(f"❌ Error en scheduler loop: {str(e)}")
                threading.Event().wait(300)  # Esperar 5 minutos antes de reintentar

    def _execute_daily_etl_with_dates(self, fecha_inicio: date, fecha_fin: date):
        """
        Ejecuta ETL para todas las tiendas con fechas personalizadas

        Args:
            fecha_inicio: Fecha inicial del rango
            fecha_fin: Fecha final del rango
        """
        if self.status.is_running:
            logger.warning("⚠️  ETL ya está en ejecución, saltando ejecución programada")
            return

        self.status.is_running = True
        self.status.last_execution = datetime.now()

        # Resetear contadores diarios
        self.status.daily_summary = {
            "inicio": datetime.now().isoformat(),
            "fecha_procesada": f"{fecha_inicio} a {fecha_fin}",
            "total_tiendas": 0,
            "exitosas": 0,
            "fallidas": 0,
            "tiendas_exitosas": [],
            "tiendas_fallidas": []
        }

        # Resetear reintentos
        self.status.retry_config.failed_stores.clear()
        self.status.retry_config.pending_retries.clear()

        # Monitoreo de Sentry para toda la ejecución del scheduler
        monitor = None
        if SENTRY_AVAILABLE:
            monitor = SentryETLMonitor(
                etl_name="ventas_scheduler_daily",
                fecha_inicio=str(fecha_inicio),
                fecha_fin=str(fecha_fin),
                extra_context={"execution_time": self.execution_time.isoformat()}
            )
            monitor.__enter__()

        try:
            logger.info(f"📅 Procesando ventas del: {fecha_inicio} al {fecha_fin}")

            # Obtener todas las tiendas
            tiendas = self._get_all_tiendas()
            self.status.daily_summary["total_tiendas"] = len(tiendas)

            if monitor:
                monitor.add_metric("total_tiendas", len(tiendas))
                monitor.add_breadcrumb(f"Iniciando procesamiento de {len(tiendas)} tiendas")

            if not tiendas:
                logger.warning("⚠️  No se encontraron tiendas para procesar")
                self.status.is_running = False
                if monitor:
                    monitor.add_breadcrumb("No se encontraron tiendas", level="warning")
                    monitor.__exit__(None, None, None)
                return

            logger.info(f"🏪 Lanzando ETL para {len(tiendas)} tiendas en un solo task")

            # Ejecutar ETL una vez con --todas (como el scheduler de inventario)
            # Esto permite que el ETL script envíe email de notificación consolidado
            success = self._execute_etl_all_stores(fecha_inicio, fecha_fin)

            if success:
                self.status.daily_summary["exitosas"] = len(tiendas)
                self.status.daily_summary["tiendas_exitosas"] = tiendas
                logger.info(f"✅ ETL multi-tienda completado exitosamente")

                if monitor:
                    monitor.add_breadcrumb(f"ETL completado para {len(tiendas)} tiendas", level="info")
            else:
                self.status.daily_summary["fallidas"] = len(tiendas)
                self.status.daily_summary["tiendas_fallidas"] = tiendas
                logger.error(f"❌ ETL multi-tienda falló")

                if monitor:
                    monitor.add_breadcrumb("ETL falló", level="error")

            self.status.daily_summary["fin"] = datetime.now().isoformat()

            logger.info(f"✅ Ejecución completada: "
                       f"{self.status.daily_summary['exitosas']} exitosas, "
                       f"{self.status.daily_summary['fallidas']} fallidas")

            # Reportar métricas finales a Sentry
            if monitor:
                monitor.add_metric("tiendas_exitosas", self.status.daily_summary["exitosas"])
                monitor.add_metric("tiendas_fallidas", self.status.daily_summary["fallidas"])
                monitor.set_success(
                    tiendas_procesadas=self.status.daily_summary["exitosas"],
                    tiendas_fallidas=self.status.daily_summary["fallidas"]
                )

        except Exception as e:
            logger.error(f"❌ Error ejecutando ETL: {str(e)}")
            if monitor:
                monitor.add_breadcrumb(f"Error crítico: {str(e)}", level="error")

        finally:
            self.status.is_running = False
            if monitor:
                monitor.__exit__(None, None, None)

    def _execute_daily_etl(self):
        """Ejecuta ETL para todas las tiendas del día anterior"""
        # Fecha de ayer
        fecha_inicio = date.today() - timedelta(days=1)
        fecha_fin = fecha_inicio

        # Delegar a la función con fechas personalizadas
        self._execute_daily_etl_with_dates(fecha_inicio, fecha_fin)

    def _run_retry_scheduler(self):
        """Thread para manejar reintentos cada 20 minutos"""
        logger.info("🔄 Retry scheduler thread iniciado")

        while self.status.enabled:
            try:
                # Esperar intervalo de reintentos
                threading.Event().wait(self.status.retry_config.retry_interval_minutes * 60)

                if not self.status.enabled:
                    break

                # Revisar si hay tiendas pendientes de retry
                if self.status.retry_config.pending_retries:
                    logger.info(f"🔄 Ejecutando reintentos para {len(self.status.retry_config.pending_retries)} tiendas")
                    self._execute_retries()

            except Exception as e:
                logger.error(f"❌ Error en retry scheduler: {str(e)}")

    def _execute_retries(self):
        """Ejecuta reintentos para tiendas fallidas"""
        if self.status.is_running:
            logger.info("⏳ ETL principal en ejecución, postergando reintentos")
            return

        # Fecha del día anterior (fecha del último ETL fallido)
        fecha_inicio = date.today() - timedelta(days=1)
        fecha_fin = fecha_inicio

        stores_to_retry = list(self.status.retry_config.pending_retries)

        for tienda_id in stores_to_retry:
            retry_count = self.status.retry_config.failed_stores.get(tienda_id, 0)

            if retry_count >= self.status.retry_config.max_retries:
                logger.warning(f"⚠️  {tienda_id} alcanzó máximo de reintentos ({self.status.retry_config.max_retries})")
                self.status.retry_config.pending_retries.remove(tienda_id)
                continue

            logger.info(f"🔄 Reintentando {tienda_id} (intento {retry_count + 1}/{self.status.retry_config.max_retries})")

            success = self._execute_etl_for_store(tienda_id, fecha_inicio, fecha_fin)

            if success:
                # Exitoso - remover de reintentos
                self.status.retry_config.pending_retries.remove(tienda_id)
                del self.status.retry_config.failed_stores[tienda_id]

                # Actualizar summary
                self.status.daily_summary["exitosas"] += 1
                self.status.daily_summary["fallidas"] -= 1
                self.status.daily_summary["tiendas_exitosas"].append(tienda_id)
                self.status.daily_summary["tiendas_fallidas"].remove(tienda_id)

                logger.info(f"✅ {tienda_id} procesada exitosamente en reintento")
            else:
                # Incrementar contador de reintentos
                self.status.retry_config.failed_stores[tienda_id] += 1
                logger.warning(f"❌ {tienda_id} falló nuevamente")

            threading.Event().wait(2)

    def _execute_etl_for_store(self, tienda_id: str, fecha_inicio: date, fecha_fin: date) -> bool:
        """
        Ejecuta ETL para una tienda específica
        Retorna True si es exitoso, False si falla
        """
        if not self.etl_callback:
            logger.error("❌ ETL callback no configurado")
            return False

        try:
            # Llamar al callback asíncrono (ejecutar en loop de asyncio)
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            result = loop.run_until_complete(
                self.etl_callback(
                    tienda_id,
                    fecha_inicio.isoformat(),
                    fecha_fin.isoformat()
                )
            )

            loop.close()

            return result.get("success", False)

        except Exception as e:
            logger.error(f"❌ Error ejecutando ETL para {tienda_id}: {str(e)}")
            return False

    def _execute_etl_all_stores(self, fecha_inicio: date, fecha_fin: date) -> bool:
        """
        Ejecuta ETL para TODAS las tiendas en un solo task (con --todas)
        Esto permite que el script ETL genere un reporte consolidado y envíe email

        Similar a como funciona el ETL de inventario

        Retorna True si es exitoso, False si falla
        """
        if not self.etl_callback:
            logger.error("❌ ETL callback no configurado")
            return False

        try:
            # Llamar al callback con "--todas" en lugar de tienda específica
            # El callback debe detectar esto y usar el flag --todas
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            result = loop.run_until_complete(
                self.etl_callback(
                    "--todas",  # Pasamos "--todas" como ubicacion_id
                    fecha_inicio.isoformat(),
                    fecha_fin.isoformat()
                )
            )

            loop.close()

            return result.get("success", False)

        except Exception as e:
            logger.error(f"❌ Error ejecutando ETL multi-tienda: {str(e)}")
            return False

    def get_status(self) -> Dict:
        """Retorna el estado actual del scheduler"""
        return {
            "enabled": self.status.enabled,
            "is_running": self.status.is_running,
            "last_execution": self.status.last_execution.isoformat() if self.status.last_execution else None,
            "next_execution": self.status.next_execution.isoformat() if self.status.next_execution else None,
            "execution_time": self.execution_time.strftime("%H:%M"),
            "daily_summary": self.status.daily_summary,
            "retry_config": {
                "max_retries": self.status.retry_config.max_retries,
                "retry_interval_minutes": self.status.retry_config.retry_interval_minutes,
                "pending_retries": list(self.status.retry_config.pending_retries),
                "failed_stores": dict(self.status.retry_config.failed_stores)
            }
        }

    def trigger_manual_execution(self, fecha_inicio: Optional[str] = None, fecha_fin: Optional[str] = None):
        """
        Ejecuta el ETL manualmente (fuera del horario programado)

        Args:
            fecha_inicio: Fecha inicial en formato YYYY-MM-DD (opcional, por defecto: ayer)
            fecha_fin: Fecha final en formato YYYY-MM-DD (opcional, por defecto: ayer)
        """
        if self.status.is_running:
            return {"success": False, "message": "ETL ya está en ejecución"}

        # Si no se proporcionan fechas, usar ayer por defecto
        if not fecha_inicio or not fecha_fin:
            ayer = date.today() - timedelta(days=1)
            fecha_inicio_date = ayer
            fecha_fin_date = ayer
        else:
            try:
                fecha_inicio_date = date.fromisoformat(fecha_inicio)
                fecha_fin_date = date.fromisoformat(fecha_fin)
            except ValueError as e:
                return {"success": False, "message": f"Formato de fecha inválido: {str(e)}"}

        logger.info(f"🎯 Ejecución manual iniciada: {fecha_inicio_date} a {fecha_fin_date}")

        # Ejecutar en un thread separado para no bloquear
        thread = threading.Thread(
            target=self._execute_daily_etl_with_dates,
            args=(fecha_inicio_date, fecha_fin_date),
            daemon=True
        )
        thread.start()

        return {
            "success": True,
            "message": f"ETL manual iniciado para rango {fecha_inicio_date} a {fecha_fin_date}",
            "fecha_inicio": fecha_inicio_date.isoformat(),
            "fecha_fin": fecha_fin_date.isoformat()
        }

    def update_config(self, max_retries: Optional[int] = None,
                     retry_interval_minutes: Optional[int] = None,
                     execution_hour: Optional[int] = None,
                     execution_minute: Optional[int] = None):
        """Actualiza configuración del scheduler"""
        if max_retries is not None:
            self.status.retry_config.max_retries = max_retries
            logger.info(f"📝 max_retries actualizado: {max_retries}")

        if retry_interval_minutes is not None:
            self.status.retry_config.retry_interval_minutes = retry_interval_minutes
            logger.info(f"📝 retry_interval actualizado: {retry_interval_minutes} minutos")

        if execution_hour is not None or execution_minute is not None:
            hour = execution_hour if execution_hour is not None else self.execution_time.hour
            minute = execution_minute if execution_minute is not None else self.execution_time.minute
            self.execution_time = time(hour=hour, minute=minute)
            logger.info(f"📝 Horario de ejecución actualizado: {self.execution_time}")

        return {"success": True, "message": "Configuración actualizada"}
