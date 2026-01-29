#!/usr/bin/env python3
"""
ETL Execution Tracker - Sistema mejorado de tracking con detalle por fase

Este módulo proporciona clases para registrar ejecuciones ETL con detalle granular:
- Métricas por fase (extract, transform, load)
- Errores clasificados por fase y categoría
- Resultados individuales por tienda
- Diagnóstico de red para debugging

Uso básico:
    tracker = ExecutionTracker()
    execution = tracker.start_execution('ventas', 'scheduled', fecha_desde, fecha_hasta, tiendas)

    tracker.start_tienda(tienda_id, tienda_nombre, 'klk')
    tracker.start_phase(ETLPhase.EXTRACT)
    # ... proceso ...
    tracker.finish_phase(ETLPhase.EXTRACT, records=1000)
    tracker.finish_tienda_success(extracted=1000, loaded=998, duplicates=2)

    tracker.finish_execution()
"""

import socket
import time
from datetime import datetime
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, field, asdict
from enum import Enum
import logging
import json
import traceback

try:
    from core.config import DatabaseConfig
    import psycopg2
    from psycopg2.extras import Json
except ImportError:
    from config import DatabaseConfig
    import psycopg2
    from psycopg2.extras import Json


# =============================================================================
# ENUMS
# =============================================================================

class ETLPhase(Enum):
    """Fases del proceso ETL"""
    EXTRACT = 'extract'
    TRANSFORM = 'transform'
    LOAD = 'load'


class ErrorCategory(Enum):
    """Categorías de error por fase"""
    # Extract errors
    VPN_TIMEOUT = 'vpn_timeout'
    VPN_UNREACHABLE = 'vpn_unreachable'
    API_TIMEOUT = 'api_timeout'
    API_ERROR = 'api_error'
    API_AUTH = 'api_auth'
    DB_CONNECTION = 'db_connection'
    DB_TIMEOUT = 'db_timeout'
    DB_ERROR = 'db_error'
    NETWORK_ERROR = 'network_error'

    # Transform errors
    DATA_VALIDATION = 'data_validation'
    DATA_FORMAT = 'data_format'
    MISSING_FIELDS = 'missing_fields'
    ENCODING_ERROR = 'encoding_error'

    # Load errors
    PG_CONNECTION = 'pg_connection'
    PG_TIMEOUT = 'pg_timeout'
    CONSTRAINT_VIOLATION = 'constraint_violation'
    DISK_FULL = 'disk_full'
    DEADLOCK = 'deadlock'


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class PhaseMetrics:
    """Métricas de una fase de ETL"""
    phase: ETLPhase
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    duration_seconds: float = 0
    records_processed: int = 0
    errors_count: int = 0

    def start(self):
        """Marca inicio de la fase"""
        self.started_at = datetime.now()

    def finish(self, records: int = 0, errors: int = 0):
        """Marca fin de la fase y calcula duración"""
        self.finished_at = datetime.now()
        if self.started_at:
            self.duration_seconds = (self.finished_at - self.started_at).total_seconds()
        self.records_processed = records
        self.errors_count = errors


@dataclass
class TiendaResult:
    """Resultado de procesamiento de una tienda individual"""
    tienda_id: str
    tienda_nombre: str
    source_system: str  # 'klk' o 'stellar'
    status: str = 'pending'  # 'success', 'failed', 'skipped'

    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    duration_seconds: float = 0

    records_extracted: int = 0
    records_loaded: int = 0
    duplicates_skipped: int = 0

    error_phase: Optional[ETLPhase] = None
    error_category: Optional[ErrorCategory] = None
    error_message: Optional[str] = None

    # Network diagnostics
    server_ip: Optional[str] = None
    server_port: Optional[int] = None
    connection_latency_ms: Optional[float] = None


@dataclass
class ETLExecution:
    """Representa una ejecución completa de ETL"""
    etl_name: str  # 'ventas', 'inventario'
    etl_type: str  # 'scheduled', 'manual', 'recovery'

    # Fechas de datos
    fecha_desde: datetime
    fecha_hasta: datetime
    tiendas_procesadas: List[str] = field(default_factory=list)

    # Estado
    id: Optional[int] = None
    status: str = 'running'  # 'running', 'success', 'partial', 'failed'
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    duration_seconds: float = 0

    # Métricas agregadas
    records_extracted: int = 0
    records_loaded: int = 0
    duplicates_skipped: int = 0
    gaps_recovered: int = 0

    # Métricas por fase
    extract_metrics: Optional[PhaseMetrics] = None
    transform_metrics: Optional[PhaseMetrics] = None
    load_metrics: Optional[PhaseMetrics] = None

    # Error si falló
    error_phase: Optional[ETLPhase] = None
    error_category: Optional[ErrorCategory] = None
    error_source: Optional[str] = None
    error_message: Optional[str] = None
    error_detail: Optional[str] = None

    # Network diagnostics
    network_diagnostics: Optional[Dict] = None

    # Detalle por tienda
    tiendas_results: List[TiendaResult] = field(default_factory=list)

    # Metadata
    triggered_by: str = 'cli'
    task_arn: Optional[str] = None
    source_system: Optional[str] = None  # 'klk', 'stellar', 'mixed'
    is_recovery: bool = False
    recovered_gap_id: Optional[int] = None


# =============================================================================
# EXECUTION TRACKER
# =============================================================================

class ExecutionTracker:
    """
    Tracker mejorado para ejecuciones ETL con detalle por fase.

    Este tracker registra:
    - Inicio/fin de ejecución y cada fase
    - Métricas por fase (extract, transform, load)
    - Resultados individuales por tienda
    - Errores clasificados automáticamente
    - Diagnóstico de red para debugging

    Ejemplo de uso:
        tracker = ExecutionTracker()
        execution = tracker.start_execution('ventas', 'scheduled', fecha_desde, fecha_hasta, tiendas)

        for tienda in tiendas:
            tracker.start_tienda(tienda_id, tienda_nombre, 'klk')

            try:
                tracker.start_phase(ETLPhase.EXTRACT)
                datos = extraer_datos()
                tracker.finish_phase(ETLPhase.EXTRACT, records=len(datos))

                tracker.start_phase(ETLPhase.LOAD)
                result = cargar_datos(datos)
                tracker.finish_phase(ETLPhase.LOAD, records=result['loaded'])

                tracker.finish_tienda_success(
                    records_extracted=len(datos),
                    records_loaded=result['loaded'],
                    duplicates_skipped=result['duplicates']
                )
            except Exception as e:
                category = ExecutionTracker.classify_error(e, ETLPhase.EXTRACT)
                tracker.finish_tienda_error(ETLPhase.EXTRACT, category, str(e))

        tracker.finish_execution()
    """

    def __init__(self):
        self.logger = logging.getLogger('execution_tracker')
        self._current_execution: Optional[ETLExecution] = None
        self._current_tienda: Optional[TiendaResult] = None

    def _get_connection(self):
        """Obtiene conexión a PostgreSQL"""
        return psycopg2.connect(DatabaseConfig.get_dsn())

    def start_execution(
        self,
        etl_name: str,
        etl_type: str,
        fecha_desde: datetime,
        fecha_hasta: datetime,
        tiendas: List[str],
        triggered_by: str = None,
        is_recovery: bool = False,
        recovered_gap_id: int = None
    ) -> ETLExecution:
        """
        Inicia tracking de una nueva ejecución.

        Args:
            etl_name: Nombre del ETL ('ventas', 'inventario')
            etl_type: Tipo ('scheduled', 'manual', 'recovery')
            fecha_desde: Fecha inicio del rango de datos
            fecha_hasta: Fecha fin del rango de datos
            tiendas: Lista de tienda_ids a procesar
            triggered_by: Origen de ejecución ('eventbridge', 'fluxion_admin', 'cli')
            is_recovery: Si es recuperación de gap
            recovered_gap_id: ID del gap que recupera

        Returns:
            ETLExecution con ID asignado
        """
        import os

        # Detectar origen automáticamente si no se especifica
        if triggered_by is None:
            if os.environ.get('AWS_EXECUTION_ENV'):
                triggered_by = 'eventbridge'
            elif os.environ.get('FLUXION_ADMIN') == 'true':
                triggered_by = 'fluxion_admin'
            else:
                triggered_by = 'cli'

        execution = ETLExecution(
            etl_name=etl_name,
            etl_type=etl_type,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            tiendas_procesadas=tiendas,
            started_at=datetime.now(),
            triggered_by=triggered_by,
            is_recovery=is_recovery,
            recovered_gap_id=recovered_gap_id,
            extract_metrics=PhaseMetrics(ETLPhase.EXTRACT),
            transform_metrics=PhaseMetrics(ETLPhase.TRANSFORM),
            load_metrics=PhaseMetrics(ETLPhase.LOAD)
        )

        # Insertar en BD
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO etl_executions (
                    etl_name, etl_type, started_at, fecha_desde, fecha_hasta,
                    tiendas_procesadas, status, triggered_by, is_recovery, recovered_gap_id
                ) VALUES (%s, %s, %s, %s, %s, %s, 'running', %s, %s, %s)
                RETURNING id
            """, (
                etl_name, etl_type, execution.started_at,
                fecha_desde, fecha_hasta, tiendas,
                triggered_by, is_recovery, recovered_gap_id
            ))

            execution.id = cursor.fetchone()[0]
            conn.commit()
            cursor.close()
            conn.close()

            self.logger.info(f"Execution started: ID={execution.id}, name={etl_name}, type={etl_type}, triggered_by={triggered_by}")

        except Exception as e:
            self.logger.warning(f"Could not persist execution start: {e}")

        self._current_execution = execution
        return execution

    def start_tienda(
        self,
        tienda_id: str,
        tienda_nombre: str,
        source_system: str,
        server_ip: str = None,
        server_port: int = None
    ) -> TiendaResult:
        """
        Inicia tracking de una tienda individual.

        Args:
            tienda_id: ID de la tienda ('tienda_01')
            tienda_nombre: Nombre de la tienda ('PERIFERICO')
            source_system: Sistema origen ('klk' o 'stellar')
            server_ip: IP del servidor (para diagnóstico)
            server_port: Puerto del servidor

        Returns:
            TiendaResult iniciado
        """
        result = TiendaResult(
            tienda_id=tienda_id,
            tienda_nombre=tienda_nombre,
            source_system=source_system,
            started_at=datetime.now(),
            server_ip=server_ip,
            server_port=server_port
        )

        self._current_tienda = result
        return result

    def finish_tienda_success(
        self,
        records_extracted: int,
        records_loaded: int,
        duplicates_skipped: int = 0
    ):
        """
        Marca tienda actual como exitosa.

        Args:
            records_extracted: Registros extraídos
            records_loaded: Registros cargados
            duplicates_skipped: Duplicados omitidos
        """
        if not self._current_tienda:
            self.logger.warning("finish_tienda_success called without active tienda")
            return

        t = self._current_tienda
        t.status = 'success'
        t.finished_at = datetime.now()
        if t.started_at:
            t.duration_seconds = (t.finished_at - t.started_at).total_seconds()
        t.records_extracted = records_extracted
        t.records_loaded = records_loaded
        t.duplicates_skipped = duplicates_skipped

        if self._current_execution:
            self._current_execution.tiendas_results.append(t)
            self._current_execution.records_extracted += records_extracted
            self._current_execution.records_loaded += records_loaded
            self._current_execution.duplicates_skipped += duplicates_skipped

        self._current_tienda = None

    def finish_tienda_error(
        self,
        phase: ETLPhase,
        category: ErrorCategory,
        message: str,
        records_extracted: int = 0
    ):
        """
        Marca tienda actual como fallida.

        Args:
            phase: Fase donde ocurrió el error
            category: Categoría del error
            message: Mensaje de error
            records_extracted: Registros extraídos antes del error
        """
        if not self._current_tienda:
            self.logger.warning("finish_tienda_error called without active tienda")
            return

        t = self._current_tienda
        t.status = 'failed'
        t.finished_at = datetime.now()
        if t.started_at:
            t.duration_seconds = (t.finished_at - t.started_at).total_seconds()
        t.records_extracted = records_extracted
        t.error_phase = phase
        t.error_category = category
        t.error_message = message[:500] if message else None

        if self._current_execution:
            self._current_execution.tiendas_results.append(t)
            self._current_execution.records_extracted += records_extracted

        self._current_tienda = None

    def start_phase(self, phase: ETLPhase):
        """
        Inicia una fase del ETL.

        Args:
            phase: Fase a iniciar (EXTRACT, TRANSFORM, LOAD)
        """
        if not self._current_execution:
            return

        metrics = getattr(self._current_execution, f"{phase.value}_metrics")
        if metrics:
            metrics.start()
            self.logger.debug(f"Phase {phase.value} started")

    def finish_phase(self, phase: ETLPhase, records: int = 0, errors: int = 0):
        """
        Finaliza una fase del ETL.

        Args:
            phase: Fase a finalizar
            records: Número de registros procesados
            errors: Número de errores en la fase
        """
        if not self._current_execution:
            return

        metrics = getattr(self._current_execution, f"{phase.value}_metrics")
        if metrics:
            metrics.finish(records, errors)
            self.logger.debug(f"Phase {phase.value} finished: {records} records, {metrics.duration_seconds:.2f}s")

    def record_error(
        self,
        phase: ETLPhase,
        category: ErrorCategory,
        message: str,
        source: str = None,
        detail: str = None,
        network_diagnostics: Dict = None
    ):
        """
        Registra un error en la ejecución.

        Args:
            phase: Fase donde ocurrió el error
            category: Categoría del error
            message: Mensaje breve del error
            source: Fuente del error ('klk_api', 'stellar_db', 'postgresql')
            detail: Detalle completo (traceback)
            network_diagnostics: Diagnóstico de red (IP, puerto, latencia)
        """
        if not self._current_execution:
            return

        ex = self._current_execution
        ex.error_phase = phase
        ex.error_category = category
        ex.error_message = message[:500] if message else None
        ex.error_source = source
        ex.error_detail = detail[:2000] if detail else None
        ex.network_diagnostics = network_diagnostics

        self.logger.error(f"Error recorded: {phase.value} - {category.value} - {message}")

    def finish_execution(self, status: str = None) -> Optional[ETLExecution]:
        """
        Finaliza la ejecución y persiste resultados en BD.

        Args:
            status: Status final ('success', 'partial', 'failed').
                   Si None, se calcula automáticamente.

        Returns:
            ETLExecution finalizada con métricas completas
        """
        if not self._current_execution:
            self.logger.warning("finish_execution called without active execution")
            return None

        ex = self._current_execution
        ex.finished_at = datetime.now()
        if ex.started_at:
            ex.duration_seconds = (ex.finished_at - ex.started_at).total_seconds()

        # Determinar status si no se proporciona
        if status is None:
            tiendas_exitosas = sum(1 for t in ex.tiendas_results if t.status == 'success')
            tiendas_fallidas = sum(1 for t in ex.tiendas_results if t.status == 'failed')

            if tiendas_fallidas == 0:
                status = 'success'
            elif tiendas_exitosas == 0:
                status = 'failed'
            else:
                status = 'partial'

        ex.status = status

        # Determinar source_system
        source_systems = {t.source_system for t in ex.tiendas_results if t.source_system}
        if len(source_systems) == 1:
            ex.source_system = list(source_systems)[0]
        elif len(source_systems) > 1:
            ex.source_system = 'mixed'

        # Persistir en BD
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # Actualizar ejecución principal
            cursor.execute("""
                UPDATE etl_executions SET
                    finished_at = %s,
                    duration_seconds = %s,
                    status = %s,
                    records_extracted = %s,
                    records_loaded = %s,
                    duplicates_skipped = %s,
                    gaps_recovered = %s,
                    extract_duration_seconds = %s,
                    transform_duration_seconds = %s,
                    load_duration_seconds = %s,
                    source_system = %s,
                    error_phase = %s,
                    error_category = %s,
                    error_source = %s,
                    error_message = %s,
                    error_detail = %s,
                    network_diagnostics = %s,
                    tiendas_detail = %s
                WHERE id = %s
            """, (
                ex.finished_at,
                ex.duration_seconds,
                status,
                ex.records_extracted,
                ex.records_loaded,
                ex.duplicates_skipped,
                ex.gaps_recovered,
                ex.extract_metrics.duration_seconds if ex.extract_metrics else None,
                ex.transform_metrics.duration_seconds if ex.transform_metrics else None,
                ex.load_metrics.duration_seconds if ex.load_metrics else None,
                ex.source_system,
                ex.error_phase.value if ex.error_phase else None,
                ex.error_category.value if ex.error_category else None,
                ex.error_source,
                ex.error_message,
                ex.error_detail,
                Json(ex.network_diagnostics) if ex.network_diagnostics else None,
                Json([self._tienda_to_dict(t) for t in ex.tiendas_results]),
                ex.id
            ))

            # Insertar detalles por tienda
            for t in ex.tiendas_results:
                cursor.execute("""
                    INSERT INTO etl_execution_details (
                        execution_id, tienda_id, tienda_nombre, source_system,
                        status, started_at, finished_at, duration_seconds,
                        records_extracted, records_loaded, duplicates_skipped,
                        error_phase, error_category, error_message,
                        server_ip, server_port, connection_latency_ms
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    ex.id, t.tienda_id, t.tienda_nombre, t.source_system,
                    t.status, t.started_at, t.finished_at, t.duration_seconds,
                    t.records_extracted, t.records_loaded, t.duplicates_skipped,
                    t.error_phase.value if t.error_phase else None,
                    t.error_category.value if t.error_category else None,
                    t.error_message,
                    t.server_ip, t.server_port, t.connection_latency_ms
                ))

            conn.commit()
            cursor.close()
            conn.close()

            self.logger.info(
                f"Execution finished: ID={ex.id}, status={status}, "
                f"duration={ex.duration_seconds:.1f}s, "
                f"records={ex.records_loaded:,}, "
                f"tiendas={len(ex.tiendas_results)}"
            )

        except Exception as e:
            self.logger.error(f"Could not persist execution finish: {e}")
            self.logger.debug(traceback.format_exc())

        result = ex
        self._current_execution = None
        return result

    def _tienda_to_dict(self, t: TiendaResult) -> Dict:
        """Convierte TiendaResult a dict para JSON"""
        return {
            'tienda_id': t.tienda_id,
            'tienda_nombre': t.tienda_nombre,
            'source_system': t.source_system,
            'status': t.status,
            'duration_seconds': t.duration_seconds,
            'records_extracted': t.records_extracted,
            'records_loaded': t.records_loaded,
            'duplicates_skipped': t.duplicates_skipped,
            'error_phase': t.error_phase.value if t.error_phase else None,
            'error_category': t.error_category.value if t.error_category else None,
            'error_message': t.error_message
        }

    @staticmethod
    def classify_error(exception: Exception, phase: ETLPhase) -> ErrorCategory:
        """
        Clasifica una excepción en una categoría de error.

        Args:
            exception: La excepción capturada
            phase: La fase donde ocurrió (para contexto)

        Returns:
            ErrorCategory apropiada
        """
        msg = str(exception).lower()

        if phase == ETLPhase.EXTRACT:
            # Timeouts
            if 'timeout' in msg:
                if 'vpn' in msg or 'connection' in msg:
                    return ErrorCategory.VPN_TIMEOUT
                return ErrorCategory.API_TIMEOUT

            # Conexión
            if 'unreachable' in msg or 'no route' in msg or 'cannot reach' in msg:
                return ErrorCategory.VPN_UNREACHABLE
            if 'connection' in msg or 'connect' in msg:
                return ErrorCategory.DB_CONNECTION

            # Autenticación
            if 'auth' in msg or '401' in msg or '403' in msg or 'unauthorized' in msg:
                return ErrorCategory.API_AUTH

            # Errores HTTP
            if '500' in msg or '502' in msg or '503' in msg or '504' in msg:
                return ErrorCategory.API_ERROR

            # SQL Server
            if 'sqlserver' in msg or 'pyodbc' in msg:
                return ErrorCategory.DB_ERROR

            return ErrorCategory.NETWORK_ERROR

        elif phase == ETLPhase.TRANSFORM:
            # Encoding
            if 'encoding' in msg or 'codec' in msg or 'utf' in msg or 'decode' in msg:
                return ErrorCategory.ENCODING_ERROR

            # Campos faltantes
            if 'missing' in msg or 'required' in msg or 'null' in msg:
                return ErrorCategory.MISSING_FIELDS

            # Formato
            if 'format' in msg or 'parse' in msg or 'invalid' in msg:
                return ErrorCategory.DATA_FORMAT

            return ErrorCategory.DATA_VALIDATION

        elif phase == ETLPhase.LOAD:
            # Timeouts
            if 'timeout' in msg:
                return ErrorCategory.PG_TIMEOUT

            # Conexión
            if 'connection' in msg or 'connect' in msg:
                return ErrorCategory.PG_CONNECTION

            # Constraints
            if 'constraint' in msg or 'duplicate' in msg or 'foreign key' in msg or 'unique' in msg:
                return ErrorCategory.CONSTRAINT_VIOLATION

            # Disco
            if 'disk' in msg or 'space' in msg or 'full' in msg:
                return ErrorCategory.DISK_FULL

            # Deadlock
            if 'deadlock' in msg:
                return ErrorCategory.DEADLOCK

            return ErrorCategory.PG_CONNECTION

        return ErrorCategory.NETWORK_ERROR


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def detect_triggered_by() -> str:
    """
    Detecta el origen de ejecución basándose en variables de entorno.

    Returns:
        'eventbridge', 'fluxion_admin', o 'cli'
    """
    import os

    if os.environ.get('AWS_EXECUTION_ENV'):
        return 'eventbridge'
    elif os.environ.get('FLUXION_ADMIN') == 'true':
        return 'fluxion_admin'
    else:
        return 'cli'


if __name__ == '__main__':
    # Tests básicos
    print("ExecutionTracker module loaded successfully")
    print(f"Available phases: {[p.value for p in ETLPhase]}")
    print(f"Available error categories: {[c.value for c in ErrorCategory]}")
