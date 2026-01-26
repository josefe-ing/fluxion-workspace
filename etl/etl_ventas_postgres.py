#!/usr/bin/env python3
"""
ETL Ventas Unificado - PostgreSQL Mode
Extrae ventas desde KLK API o Stellar SQL Server y carga a PostgreSQL AWS RDS

Modo de operacion:
- Ejecutar cada 30 minutos
- Extraer ultimos 30 minutos de ventas
- Detecta automaticamente el sistema POS (KLK o Stellar)
- Deduplicacion por numero_factura (UPSERT con ON CONFLICT)

Uso:
  python etl_ventas_postgres.py --todas                              # Todas las tiendas activas
  python etl_ventas_postgres.py --tiendas tienda_01 tienda_03        # Tiendas específicas
  python etl_ventas_postgres.py                                      # Default = todas las tiendas activas

Modo Recuperacion (para llenar gaps de datos):
  python etl_ventas_postgres.py --recovery-mode                    # Procesa dia anterior completo
  python etl_ventas_postgres.py --recovery-mode --recovery-days 2  # Procesa hace 2 dias

Este modo se ejecuta automaticamente cada noche a las 3am Venezuela para recuperar
cualquier dato que se haya perdido durante las ejecuciones de 30 minutos del dia.
"""

import sys
from pathlib import Path

# Agregar directorio core al path
CORE_DIR = Path(__file__).parent / "core"
sys.path.insert(0, str(CORE_DIR))

import os
import logging
import time
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

# Set DB_MODE to postgresql BEFORE any other imports
os.environ['DB_MODE'] = 'postgresql'

# KLK components
from core.extractor_ventas_klk import VentasKLKExtractor
from core.loader_ventas_postgres import PostgreSQLVentasLoader

# Stellar components
from core.extractor_ventas import VentasExtractor
from core.transformer_ventas import VentasTransformer
from core.loader_ventas import VentasLoader

from core.tiendas_config import TIENDAS_CONFIG, get_tiendas_activas
from core.config import ETLConfig, DatabaseConfig

# Sentry monitoring (optional)
try:
    from core.sentry_monitor import SentryETLMonitor
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

# Email notifications (solo en produccion)
try:
    from etl_notifier import send_etl_notification
    NOTIFIER_AVAILABLE = True
except ImportError:
    NOTIFIER_AVAILABLE = False

# PostgreSQL tracking
try:
    import psycopg2
    import json as _json
    TRACKING_AVAILABLE = True
except ImportError:
    TRACKING_AVAILABLE = False


class VentasETLPostgres:
    """
    ETL Unificado para ventas - PostgreSQL Mode
    Detecta automaticamente KLK vs Stellar y usa el extractor apropiado
    """

    def __init__(self, dry_run: bool = False, minutos_atras: int = 30, auto_gap_recovery: bool = True):
        """
        Args:
            dry_run: Si True, no carga datos (solo extrae)
            minutos_atras: Minutos hacia atras para extraer (default: 30)
            auto_gap_recovery: Si True, detecta y recupera gaps automáticamente (default: True)
        """
        self.dry_run = dry_run
        self.minutos_atras = minutos_atras
        self.auto_gap_recovery = auto_gap_recovery
        self.logger = self._setup_logger()

        # KLK components
        self.klk_extractor = VentasKLKExtractor()
        self.klk_loader = PostgreSQLVentasLoader()

        # Stellar components
        self.stellar_extractor = VentasExtractor()
        self.stellar_transformer = VentasTransformer()
        self.stellar_loader = VentasLoader()

        # Estadisticas
        self.stats = {
            'inicio': datetime.now(),
            'tiendas_procesadas': 0,
            'tiendas_exitosas': 0,
            'tiendas_fallidas': 0,
            'total_ventas_extraidas': 0,
            'total_ventas_cargadas': 0,
            'total_duplicados_omitidos': 0,
            'tiendas_klk': 0,
            'tiendas_stellar': 0,
            'gaps_recuperados': 0
        }

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_ventas_postgres')
        logger.setLevel(logging.INFO)

        if logger.handlers:
            return logger

        log_file = ETLConfig.LOG_DIR / f"ventas_postgres_{datetime.now().strftime('%Y%m%d')}.log"
        handler = logging.FileHandler(log_file)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        console = logging.StreamHandler()
        console.setFormatter(formatter)
        logger.addHandler(console)

        return logger

    def _check_concurrent_execution(self, max_age_minutes: int = 120) -> Optional[Dict]:
        """
        Verifica si hay otra ejecución ETL corriendo.

        Args:
            max_age_minutes: Máximo tiempo (en minutos) para considerar una ejecución como "activa"
                            Ejecuciones más antiguas se consideran huérfanas.

        Returns:
            Dict con info de la ejecución activa si existe, None si no hay conflicto
        """
        if not TRACKING_AVAILABLE:
            return None

        try:
            conn = self.klk_loader._get_connection()
            cursor = conn.cursor()

            # Buscar ejecuciones "running" que no sean muy antiguas
            cursor.execute("""
                SELECT id, started_at, triggered_by
                FROM etl_executions
                WHERE etl_name = 'ventas'
                  AND status = 'running'
                  AND started_at > NOW() - INTERVAL '%s minutes'
                ORDER BY started_at DESC
                LIMIT 1
            """, (max_age_minutes,))

            row = cursor.fetchone()
            conn.close()

            if row:
                return {
                    'id': row[0],
                    'started_at': row[1],
                    'triggered_by': row[2]
                }
            return None

        except Exception as e:
            self.logger.warning(f"Concurrency check failed: {e}")
            return None  # En caso de error, permitir ejecución

    def _cleanup_orphan_executions(self, max_age_minutes: int = 180):
        """
        Marca como 'killed' las ejecuciones huérfanas (running por más de max_age_minutes).
        """
        if not TRACKING_AVAILABLE:
            return

        try:
            conn = self.klk_loader._get_connection()
            cursor = conn.cursor()

            cursor.execute("""
                UPDATE etl_executions
                SET status = 'killed',
                    finished_at = NOW(),
                    error_message = 'Orphan execution - cleaned up by concurrency check'
                WHERE etl_name = 'ventas'
                  AND status = 'running'
                  AND started_at < NOW() - INTERVAL '%s minutes'
            """, (max_age_minutes,))

            cleaned = cursor.rowcount
            conn.commit()
            conn.close()

            if cleaned > 0:
                self.logger.info(f"Concurrency: Limpiadas {cleaned} ejecuciones huérfanas")

        except Exception as e:
            self.logger.warning(f"Orphan cleanup failed: {e}")

    def _track_start(self, fecha_desde: datetime, fecha_hasta: datetime, tiendas: List[str], etl_type: str = 'scheduled') -> Optional[int]:
        """Registra inicio de ejecución ETL en PostgreSQL"""
        if not TRACKING_AVAILABLE or self.dry_run:
            return None

        try:
            conn = self.klk_loader._get_connection()
            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO etl_executions (
                    etl_name, etl_type, started_at, fecha_desde, fecha_hasta,
                    tiendas_procesadas, status, triggered_by
                ) VALUES (%s, %s, %s, %s, %s, %s, 'running', %s)
                RETURNING id
            """, (
                'ventas',
                etl_type,
                datetime.now(),
                fecha_desde,
                fecha_hasta,
                tiendas,
                'eventbridge' if os.environ.get('AWS_EXECUTION_ENV') else 'cli'
            ))

            execution_id = cursor.fetchone()[0]
            conn.commit()
            conn.close()
            self.logger.info(f"Tracking: Ejecución iniciada (ID: {execution_id})")
            return execution_id
        except Exception as e:
            self.logger.warning(f"Tracking: Error al registrar inicio: {e}")
            return None

    def _track_finish(self, execution_id: Optional[int], tiendas_results: List[Dict], status: str = 'success', error_msg: str = None):
        """Registra fin de ejecución ETL en PostgreSQL"""
        if not TRACKING_AVAILABLE or execution_id is None:
            return

        try:
            conn = self.klk_loader._get_connection()
            cursor = conn.cursor()

            finished_at = datetime.now()

            # Calcular duración
            cursor.execute("SELECT started_at FROM etl_executions WHERE id = %s", (execution_id,))
            row = cursor.fetchone()
            duration_seconds = (finished_at - row[0]).total_seconds() if row else None

            cursor.execute("""
                UPDATE etl_executions SET
                    finished_at = %s,
                    duration_seconds = %s,
                    status = %s,
                    records_extracted = %s,
                    records_loaded = %s,
                    duplicates_skipped = %s,
                    gaps_recovered = %s,
                    tiendas_detail = %s,
                    error_message = %s
                WHERE id = %s
            """, (
                finished_at,
                duration_seconds,
                status,
                self.stats['total_ventas_extraidas'],
                self.stats['total_ventas_cargadas'],
                self.stats['total_duplicados_omitidos'],
                self.stats['gaps_recuperados'],
                _json.dumps(tiendas_results) if tiendas_results else None,
                error_msg,
                execution_id
            ))

            conn.commit()
            conn.close()
            self.logger.info(f"Tracking: Ejecución finalizada (ID: {execution_id}, status: {status}, duración: {duration_seconds:.1f}s)")
        except Exception as e:
            self.logger.warning(f"Tracking: Error al registrar fin: {e}")

    def _get_sistema_pos(self, tienda_id: str) -> str:
        """Detecta el sistema POS de una tienda"""
        if tienda_id not in TIENDAS_CONFIG:
            return 'unknown'
        config = TIENDAS_CONFIG[tienda_id]
        return getattr(config, 'sistema_pos', 'stellar')

    def _detectar_gaps_recientes(self, tienda_id: str, horas_atras: int = 6) -> List[Dict]:
        """
        Detecta gaps de datos en las últimas N horas para una tienda.
        Un gap es un periodo de 30+ minutos sin ventas durante horario comercial (6am-11pm).

        Args:
            tienda_id: ID de tienda (ej: tienda_18)
            horas_atras: Cuántas horas hacia atrás revisar

        Returns:
            Lista de gaps detectados con hora_inicio y hora_fin
        """
        try:
            import psycopg2
            from core.config import DatabaseConfig

            conn = psycopg2.connect(DatabaseConfig.get_dsn())
            cursor = conn.cursor()

            ahora = datetime.now()
            desde = ahora - timedelta(hours=horas_atras)

            # Obtener conteo de ventas por hora para la tienda
            query = """
                SELECT
                    DATE_TRUNC('hour', fecha_venta) as hora,
                    COUNT(*) as num_ventas
                FROM ventas
                WHERE ubicacion_id = %s
                  AND fecha_venta >= %s
                  AND fecha_venta <= %s
                GROUP BY DATE_TRUNC('hour', fecha_venta)
                ORDER BY hora
            """
            cursor.execute(query, (tienda_id, desde, ahora))
            rows = cursor.fetchall()
            conn.close()

            if not rows:
                return []

            # Construir conjunto de horas con datos
            horas_con_datos = {row[0].replace(tzinfo=None) for row in rows}

            # Detectar horas faltantes en horario comercial (6am-11pm)
            gaps = []
            hora_actual = desde.replace(minute=0, second=0, microsecond=0)
            while hora_actual < ahora:
                hora_local = hora_actual.hour
                # Solo horario comercial (6am a 11pm)
                if 6 <= hora_local <= 22:
                    if hora_actual not in horas_con_datos:
                        gaps.append({
                            'hora_inicio': hora_actual,
                            'hora_fin': hora_actual + timedelta(hours=1)
                        })
                hora_actual += timedelta(hours=1)

            return gaps

        except Exception as e:
            self.logger.warning(f"Error detectando gaps para {tienda_id}: {e}")
            return []

    def _recuperar_gap(self, config, gap: Dict) -> bool:
        """
        Intenta recuperar un gap de datos específico.

        Args:
            config: Configuración de la tienda
            gap: Dict con hora_inicio y hora_fin

        Returns:
            True si se recuperó exitosamente
        """
        tienda_id = config.ubicacion_id
        sistema_pos = self._get_sistema_pos(tienda_id)

        self.logger.info(f"   Recuperando gap: {gap['hora_inicio'].strftime('%H:%M')} - {gap['hora_fin'].strftime('%H:%M')}")

        try:
            if sistema_pos == 'klk':
                resultado = self._procesar_tienda_klk(config, gap['hora_inicio'], gap['hora_fin'])
            else:
                resultado = self._procesar_tienda_stellar(config, gap['hora_inicio'], gap['hora_fin'])

            if resultado['success']:
                self.stats['gaps_recuperados'] += 1
                registros = resultado.get('registros', 0)
                self.logger.info(f"   Gap recuperado: {registros} registros")
                return True
            else:
                self.logger.warning(f"   Error recuperando gap: {resultado.get('message', 'Unknown')}")
                return False
        except Exception as e:
            self.logger.warning(f"   Excepción recuperando gap: {e}")
            return False

    def _procesar_tienda_klk(self, config, fecha_desde: datetime, fecha_hasta: datetime) -> Dict[str, Any]:
        """Procesa tienda KLK usando API REST"""
        tienda_id = config.ubicacion_id
        tienda_nombre = config.ubicacion_nombre
        tiempo_inicio = datetime.now()

        codigo_sucursal = self.klk_extractor.get_codigo_sucursal(tienda_id)

        self.logger.info(f"   Sucursal KLK: {codigo_sucursal}")

        try:
            # Extraer ventas
            response = self.klk_extractor.extract_ventas_raw(
                sucursal=codigo_sucursal,
                fecha_desde=fecha_desde.strftime('%Y-%m-%d'),
                fecha_hasta=fecha_hasta.strftime('%Y-%m-%d'),
                hora_desde=fecha_desde.strftime('%H:%M'),
                hora_hasta=fecha_hasta.strftime('%H:%M')
            )

            if not response or 'ventas' not in response:
                tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
                return {
                    'tienda_id': tienda_id,
                    'tienda_nombre': tienda_nombre,
                    'sistema': 'KLK',
                    'success': True,
                    'registros': 0,
                    'tiempo_proceso': tiempo_proceso,
                    'message': 'Sin ventas en el rango'
                }

            ventas_data = response.get('ventas', [])
            registros_extraidos = len(ventas_data)
            self.stats['total_ventas_extraidas'] += registros_extraidos

            if registros_extraidos == 0:
                tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
                return {
                    'tienda_id': tienda_id,
                    'tienda_nombre': tienda_nombre,
                    'sistema': 'KLK',
                    'success': True,
                    'registros': 0,
                    'tiempo_proceso': tiempo_proceso,
                    'message': 'Sin ventas nuevas'
                }

            # Cargar a PostgreSQL
            if self.dry_run:
                self.logger.info(f"   DRY RUN: {registros_extraidos:,} ventas")
                registros_cargados = registros_extraidos
            else:
                result = self.klk_loader.load_ventas_raw(ventas_data, codigo_sucursal)
                if result['success']:
                    registros_cargados = result.get('records_loaded', 0)
                    duplicados = result.get('duplicates_skipped', 0)
                    self.stats['total_ventas_cargadas'] += registros_cargados
                    self.stats['total_duplicados_omitidos'] += duplicados
                    self.logger.info(f"   Cargadas: {registros_cargados:,} | Duplicados: {duplicados:,}")
                else:
                    raise Exception(result.get('message'))

            tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
            return {
                'tienda_id': tienda_id,
                'tienda_nombre': tienda_nombre,
                'sistema': 'KLK',
                'success': True,
                'registros': registros_cargados,
                'tiempo_proceso': tiempo_proceso,
                'message': f'{registros_cargados:,} ventas'
            }

        except Exception as e:
            self.logger.error(f"   Error KLK: {e}")
            tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
            return {
                'tienda_id': tienda_id,
                'tienda_nombre': tienda_nombre,
                'sistema': 'KLK',
                'success': False,
                'registros': 0,
                'tiempo_proceso': tiempo_proceso,
                'message': str(e)
            }

    def _procesar_tienda_stellar(self, config, fecha_desde: datetime, fecha_hasta: datetime) -> Dict[str, Any]:
        """Procesa tienda Stellar usando SQL Server"""
        tienda_id = config.ubicacion_id
        tienda_nombre = config.ubicacion_nombre
        tiempo_inicio = datetime.now()

        self.logger.info(f"   Server: {config.server_ip}:{config.port}")

        try:
            # Configurar conexion
            db_config = DatabaseConfig(
                ubicacion_id=config.ubicacion_id,
                ubicacion_nombre=config.ubicacion_nombre,
                tipo=config.tipo,
                server_ip=config.server_ip,
                database_name=config.database_name,
                username=config.username,
                password=config.password,
                port=config.port
            )

            # Extraer - pasamos datetime completo para filtrar por hora
            raw_data = self.stellar_extractor.extract_ventas_data(
                config=db_config,
                fecha_inicio=fecha_desde,
                fecha_fin=fecha_hasta,
                limite_registros=None
            )

            if raw_data is None or raw_data.empty:
                tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
                return {
                    'tienda_id': tienda_id,
                    'tienda_nombre': tienda_nombre,
                    'sistema': 'Stellar',
                    'success': True,
                    'registros': 0,
                    'tiempo_proceso': tiempo_proceso,
                    'message': 'Sin ventas en el rango'
                }

            registros_extraidos = len(raw_data)
            self.stats['total_ventas_extraidas'] += registros_extraidos

            # Transformar
            transformed_data = self.stellar_transformer.transform_ventas_data(raw_data)
            if transformed_data.empty:
                tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
                return {
                    'tienda_id': tienda_id,
                    'tienda_nombre': tienda_nombre,
                    'sistema': 'Stellar',
                    'success': False,
                    'registros': 0,
                    'tiempo_proceso': tiempo_proceso,
                    'message': 'Error en transformacion'
                }

            registros_transformados = len(transformed_data)

            # Cargar
            if self.dry_run:
                self.logger.info(f"   DRY RUN: {registros_transformados:,} ventas")
                registros_cargados = registros_transformados
            else:
                result = self.stellar_loader.load_ventas_postgresql(transformed_data)
                if result['success']:
                    registros_cargados = result.get('records_loaded', 0)
                    duplicados = result.get('duplicates_skipped', 0)
                    self.stats['total_ventas_cargadas'] += registros_cargados
                    self.stats['total_duplicados_omitidos'] += duplicados
                    self.logger.info(f"   Cargadas: {registros_cargados:,} | Duplicados: {duplicados:,}")
                else:
                    raise Exception(result.get('message'))

            tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
            return {
                'tienda_id': tienda_id,
                'tienda_nombre': tienda_nombre,
                'sistema': 'Stellar',
                'success': True,
                'registros': registros_cargados,
                'tiempo_proceso': tiempo_proceso,
                'message': f'{registros_cargados:,} ventas'
            }

        except Exception as e:
            self.logger.error(f"   Error Stellar: {e}")
            tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
            return {
                'tienda_id': tienda_id,
                'tienda_nombre': tienda_nombre,
                'sistema': 'Stellar',
                'success': False,
                'registros': 0,
                'tiempo_proceso': tiempo_proceso,
                'message': str(e)
            }

    def procesar_tienda(self, config, fecha_desde: datetime, fecha_hasta: datetime) -> Dict[str, Any]:
        """Procesa una tienda detectando automaticamente el sistema POS"""
        tienda_id = config.ubicacion_id
        tienda_nombre = config.ubicacion_nombre
        sistema_pos = self._get_sistema_pos(tienda_id)

        self.logger.info(f"\n{'='*70}")
        self.logger.info(f"PROCESANDO: {tienda_nombre} ({tienda_id}) - {sistema_pos.upper()}")
        self.logger.info(f"   Rango: {fecha_desde.strftime('%Y-%m-%d %H:%M')} -> {fecha_hasta.strftime('%Y-%m-%d %H:%M')}")
        self.logger.info(f"{'='*70}")

        if sistema_pos == 'klk':
            self.stats['tiendas_klk'] += 1
            return self._procesar_tienda_klk(config, fecha_desde, fecha_hasta)
        else:
            self.stats['tiendas_stellar'] += 1
            return self._procesar_tienda_stellar(config, fecha_desde, fecha_hasta)

    def ejecutar(self, tienda_ids: List[str] = None, fecha_desde: datetime = None, fecha_hasta: datetime = None) -> bool:
        """
        Ejecuta el ETL para las tiendas especificadas

        Args:
            tienda_ids: Lista de IDs de tiendas. Si None, procesa todas las activas (no CEDIs)
            fecha_desde: Fecha/hora inicio. Si None, usa ahora - minutos_atras
            fecha_hasta: Fecha/hora fin. Si None, usa ahora

        Returns:
            True si todas las tiendas se procesaron exitosamente
        """
        # =====================================================================
        # CONCURRENCY CHECK: Evitar múltiples ejecuciones simultáneas
        # =====================================================================
        # Primero limpiar ejecuciones huérfanas (más de 3 horas running)
        self._cleanup_orphan_executions(max_age_minutes=180)

        # Verificar si hay otra ejecución activa (menos de 2 horas)
        active_execution = self._check_concurrent_execution(max_age_minutes=120)
        if active_execution:
            running_minutes = (datetime.now() - active_execution['started_at'].replace(tzinfo=None)).total_seconds() / 60
            self.logger.warning(f"\n{'!'*80}")
            self.logger.warning(f"! EJECUCIÓN ABORTADA: Ya hay un ETL de ventas corriendo")
            self.logger.warning(f"! Execution ID: {active_execution['id']}")
            self.logger.warning(f"! Iniciado: {active_execution['started_at']} ({running_minutes:.0f} min ago)")
            self.logger.warning(f"! Triggered by: {active_execution['triggered_by']}")
            self.logger.warning(f"! Esta instancia terminará para evitar conflictos")
            self.logger.warning(f"{'!'*80}\n")
            # Retornar True para no marcar como fallo (es comportamiento esperado)
            return True

        # Calcular rango de fechas
        if fecha_hasta is None:
            fecha_hasta = datetime.now()
        if fecha_desde is None:
            # Agregar 60 minutos de overlap para evitar gaps por timing
            # Si ETL corre cada 30 min, extraemos 90 min hacia atras
            # Los duplicados se descartan automaticamente por UPSERT con ON CONFLICT
            overlap_minutos = 60
            fecha_desde = fecha_hasta - timedelta(minutes=self.minutos_atras + overlap_minutos)

        self.logger.info(f"\n{'#'*80}")
        self.logger.info(f"# ETL VENTAS UNIFICADO -> POSTGRESQL")
        self.logger.info(f"# Fecha: {self.stats['inicio'].strftime('%Y-%m-%d %H:%M:%S')}")
        self.logger.info(f"# Modo: {'DRY RUN' if self.dry_run else 'PRODUCCION - PostgreSQL AWS RDS'}")
        self.logger.info(f"# Rango: {fecha_desde.strftime('%Y-%m-%d %H:%M')} -> {fecha_hasta.strftime('%Y-%m-%d %H:%M')}")
        self.logger.info(f"# Minutos: {self.minutos_atras}")
        self.logger.info(f"{'#'*80}\n")

        # Obtener tiendas a procesar
        if tienda_ids:
            tiendas = {k: v for k, v in TIENDAS_CONFIG.items()
                      if k in tienda_ids and v.activo and v.tipo != 'cedi'}
        else:
            tiendas = {k: v for k, v in get_tiendas_activas().items() if v.tipo != 'cedi'}

        if not tiendas:
            self.logger.error("No hay tiendas para procesar")
            return False

        # Iniciar tracking
        tienda_ids_list = list(tiendas.keys())
        execution_id = self._track_start(fecha_desde, fecha_hasta, tienda_ids_list)

        # Mostrar tiendas
        self.logger.info(f"Tiendas a procesar: {len(tiendas)}")
        for tienda_id, config in tiendas.items():
            sistema = self._get_sistema_pos(tienda_id)
            self.logger.info(f"   - {config.ubicacion_nombre} ({tienda_id}) - {sistema.upper()}")

        # Auto-recuperación de gaps (si está habilitada y no es modo manual con fechas)
        if self.auto_gap_recovery and fecha_desde is None:
            self.logger.info(f"\n{'='*70}")
            self.logger.info(f"DETECCIÓN AUTOMÁTICA DE GAPS (últimas 6 horas)")
            self.logger.info(f"{'='*70}")

            total_gaps_detectados = 0
            for tienda_id, config in tiendas.items():
                gaps = self._detectar_gaps_recientes(tienda_id, horas_atras=6)
                if gaps:
                    total_gaps_detectados += len(gaps)
                    self.logger.info(f"\n{config.ubicacion_nombre}: {len(gaps)} gap(s) detectado(s)")
                    for gap in gaps:
                        self._recuperar_gap(config, gap)

            if total_gaps_detectados == 0:
                self.logger.info("No se detectaron gaps en las últimas 6 horas")
            else:
                self.logger.info(f"\nTotal gaps detectados: {total_gaps_detectados}")
                self.logger.info(f"Gaps recuperados: {self.stats['gaps_recuperados']}")

            self.logger.info(f"{'='*70}\n")

        # Separar tiendas por sistema POS
        tiendas_klk = {k: v for k, v in tiendas.items() if self._get_sistema_pos(k) == 'klk'}
        tiendas_stellar = {k: v for k, v in tiendas.items() if self._get_sistema_pos(k) == 'stellar'}

        self.logger.info(f"\n{'='*70}")
        self.logger.info(f"PROCESANDO TIENDAS (KLK: {len(tiendas_klk)} paralelo, Stellar: {len(tiendas_stellar)} secuencial)")
        self.logger.info(f"{'='*70}")

        tiendas_results = []

        # ===== FASE 1: Tiendas KLK (paralelo con 3 workers) =====
        if tiendas_klk:
            self.logger.info(f"\n📦 FASE 1: Procesando {len(tiendas_klk)} tiendas KLK (3 workers paralelo)...")
            klk_start = time.time()

            # Función wrapper para procesar tienda y manejar stats
            def process_klk_tienda(tienda_item):
                tienda_id, config = tienda_item
                return self.procesar_tienda(config, fecha_desde, fecha_hasta)

            with ThreadPoolExecutor(max_workers=3, thread_name_prefix='KLK-Ventas') as executor:
                futures = {
                    executor.submit(process_klk_tienda, item): item[0]
                    for item in tiendas_klk.items()
                }

                for future in as_completed(futures):
                    tienda_id = futures[future]
                    try:
                        resultado = future.result()
                        tiendas_results.append(resultado)
                        self.stats['tiendas_procesadas'] += 1

                        if resultado['success']:
                            self.stats['tiendas_exitosas'] += 1
                            status = "✅"
                        else:
                            self.stats['tiendas_fallidas'] += 1
                            status = "❌"

                        self.logger.info(f"   {status} {resultado['tienda_nombre']}: {resultado.get('ventas_cargadas', 0):,} ventas")
                    except Exception as e:
                        self.logger.error(f"   ❌ Error en {tienda_id}: {e}")
                        self.stats['tiendas_procesadas'] += 1
                        self.stats['tiendas_fallidas'] += 1
                        tiendas_results.append({
                            'tienda_id': tienda_id,
                            'tienda_nombre': tienda_id,
                            'success': False,
                            'error': str(e)
                        })

            klk_elapsed = time.time() - klk_start
            self.logger.info(f"   ⏱️ Fase KLK completada en {klk_elapsed:.1f}s")

        # ===== FASE 2: Tiendas Stellar (secuencial) =====
        if tiendas_stellar:
            self.logger.info(f"\n📦 FASE 2: Procesando {len(tiendas_stellar)} tiendas Stellar (secuencial)...")
            stellar_start = time.time()

            for tienda_id, config in tiendas_stellar.items():
                self.stats['tiendas_procesadas'] += 1
                resultado = self.procesar_tienda(config, fecha_desde, fecha_hasta)
                tiendas_results.append(resultado)

                if resultado['success']:
                    self.stats['tiendas_exitosas'] += 1
                else:
                    self.stats['tiendas_fallidas'] += 1

            stellar_elapsed = time.time() - stellar_start
            self.logger.info(f"   ⏱️ Fase Stellar completada en {stellar_elapsed:.1f}s")

        # Resumen final
        self.stats['fin'] = datetime.now()
        duracion = (self.stats['fin'] - self.stats['inicio']).total_seconds()

        self.logger.info(f"\n{'#'*80}")
        self.logger.info(f"# RESUMEN ETL VENTAS UNIFICADO")
        self.logger.info(f"{'#'*80}")
        self.logger.info(f"Duracion: {duracion:.2f}s")
        self.logger.info(f"Tiendas procesadas: {self.stats['tiendas_procesadas']} (KLK: {self.stats['tiendas_klk']}, Stellar: {self.stats['tiendas_stellar']})")
        self.logger.info(f"Tiendas exitosas: {self.stats['tiendas_exitosas']}")
        self.logger.info(f"Tiendas fallidas: {self.stats['tiendas_fallidas']}")
        self.logger.info(f"Total ventas extraidas: {self.stats['total_ventas_extraidas']:,}")
        self.logger.info(f"Total ventas cargadas: {self.stats['total_ventas_cargadas']:,}")
        self.logger.info(f"Total duplicados omitidos: {self.stats['total_duplicados_omitidos']:,}")
        if self.stats['gaps_recuperados'] > 0:
            self.logger.info(f"Gaps recuperados: {self.stats['gaps_recuperados']}")
        self.logger.info(f"{'#'*80}\n")

        # Email notification
        if NOTIFIER_AVAILABLE and not self.dry_run:
            try:
                global_summary = {
                    'total_tiendas': self.stats['tiendas_procesadas'],
                    'tiendas_exitosas': self.stats['tiendas_exitosas'],
                    'tiendas_fallidas': self.stats['tiendas_fallidas'],
                    'total_registros': self.stats['total_ventas_cargadas'],
                    'duplicados_omitidos': self.stats['total_duplicados_omitidos'],
                    'duracion_segundos': duracion,
                    'rango_fechas': f"{fecha_desde.strftime('%Y-%m-%d %H:%M')} - {fecha_hasta.strftime('%Y-%m-%d %H:%M')}"
                }
                send_etl_notification(
                    etl_name="ETL Ventas Unificado PostgreSQL",
                    etl_type="ventas",
                    start_time=self.stats['inicio'],
                    end_time=self.stats['fin'],
                    tiendas_results=tiendas_results,
                    global_summary=global_summary
                )
            except Exception as e:
                self.logger.warning(f"Error enviando email: {e}")

        # Finalizar tracking
        status = 'success' if self.stats['tiendas_fallidas'] == 0 else 'partial' if self.stats['tiendas_exitosas'] > 0 else 'failed'
        self._track_finish(execution_id, tiendas_results, status=status)

        return self.stats['tiendas_fallidas'] == 0


def main():
    """Punto de entrada principal"""
    import argparse

    parser = argparse.ArgumentParser(description='ETL Ventas Unificado -> PostgreSQL')
    parser.add_argument('--dry-run', action='store_true',
                       help='Ejecuta sin cargar datos')
    parser.add_argument('--tiendas', nargs='+',
                       help='IDs de tiendas a procesar (ej: tienda_01 tienda_03)')
    parser.add_argument('--todas', action='store_true',
                       help='Ejecutar para todas las tiendas activas (solo tiendas, no CEDIs)')
    parser.add_argument('--minutos', type=int, default=30,
                       help='Minutos hacia atras para extraer (default: 30)')
    parser.add_argument('--fecha-desde', type=str,
                       help='Fecha/hora inicio (formato: YYYY-MM-DD HH:MM)')
    parser.add_argument('--fecha-hasta', type=str,
                       help='Fecha/hora fin (formato: YYYY-MM-DD HH:MM)')
    parser.add_argument('--chunk-days', type=int, default=0,
                       help='Dividir rango en chunks de N dias (ej: 5 para procesar de 5 en 5 dias)')
    parser.add_argument('--recovery-mode', action='store_true',
                       help='Modo recuperacion: procesa el dia anterior completo (00:00 a 23:59) para llenar gaps')
    parser.add_argument('--recovery-days', type=int, default=1,
                       help='Dias hacia atras para recovery-mode (default: 1 = ayer)')
    parser.add_argument('--auto-gap-recovery', action='store_true', default=True,
                       help='Detecta y recupera gaps automaticamente en ultimas 6 horas (default: activado)')
    parser.add_argument('--no-gap-recovery', action='store_true',
                       help='Desactiva la recuperacion automatica de gaps')

    args = parser.parse_args()

    # Determinar tiendas a procesar
    if args.todas:
        # --todas: procesar todas las tiendas activas (solo tiendas, no CEDIs)
        tiendas_a_procesar = None  # None = todas las tiendas activas (el método ejecutar lo maneja)
        print("\n📍 Modo: --todas (todas las tiendas activas)")
    elif args.tiendas:
        tiendas_a_procesar = args.tiendas
        print(f"\n📍 Modo: tiendas específicas: {', '.join(args.tiendas)}")
    else:
        # Default: todas las tiendas activas (para backwards compatibility)
        tiendas_a_procesar = None
        print("\n📍 Modo: default (todas las tiendas activas)")

    # Determinar si hacer auto-recovery de gaps
    auto_gap_recovery = args.auto_gap_recovery and not args.no_gap_recovery

    # Recovery mode: calcular día anterior automáticamente
    if args.recovery_mode:
        # Calcular el día a recuperar (ayer por defecto)
        hoy = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        dia_recovery = hoy - timedelta(days=args.recovery_days)

        fecha_desde = dia_recovery.replace(hour=0, minute=0)
        fecha_hasta = dia_recovery.replace(hour=23, minute=59)

        print(f"\n{'='*70}")
        print(f"MODO RECUPERACIÓN ACTIVADO")
        print(f"{'='*70}")
        print(f"Procesando día completo: {dia_recovery.strftime('%Y-%m-%d')}")
        print(f"Rango: {fecha_desde.strftime('%Y-%m-%d %H:%M')} -> {fecha_hasta.strftime('%Y-%m-%d %H:%M')}")
        print(f"Este modo reprocesa el día completo para llenar gaps de datos")
        print(f"{'='*70}\n")

    # Parsear fechas (solo si no estamos en recovery-mode)
    elif args.fecha_desde or args.fecha_hasta:
        fecha_desde = None
        fecha_hasta = None

        if args.fecha_desde:
            try:
                fecha_desde = datetime.strptime(args.fecha_desde, '%Y-%m-%d %H:%M')
            except ValueError:
                print(f"Error: formato invalido para --fecha-desde: {args.fecha_desde}")
                sys.exit(1)

        if args.fecha_hasta:
            try:
                fecha_hasta = datetime.strptime(args.fecha_hasta, '%Y-%m-%d %H:%M')
            except ValueError:
                print(f"Error: formato invalido para --fecha-hasta: {args.fecha_hasta}")
                sys.exit(1)
    else:
        fecha_desde = None
        fecha_hasta = None

    # Ejecutar ETL con chunking si se especifica
    chunk_days = args.chunk_days

    if chunk_days > 0 and fecha_desde and fecha_hasta:
        # Modo chunking: dividir el rango en chunks de N días
        from datetime import timedelta

        print(f"\n{'='*70}")
        print(f"MODO CHUNKING: Dividiendo rango en chunks de {chunk_days} días")
        print(f"Rango total: {fecha_desde.strftime('%Y-%m-%d')} -> {fecha_hasta.strftime('%Y-%m-%d')}")
        print(f"{'='*70}\n")

        chunks = []
        current_start = fecha_desde
        while current_start < fecha_hasta:
            current_end = min(current_start + timedelta(days=chunk_days) - timedelta(seconds=1), fecha_hasta)
            # Ajustar hora final al final del día si no es el último chunk
            if current_end < fecha_hasta:
                current_end = current_end.replace(hour=23, minute=59, second=59)
            chunks.append((current_start, current_end))
            current_start = current_end + timedelta(seconds=1)
            current_start = current_start.replace(hour=0, minute=0, second=0)

        print(f"Chunks a procesar: {len(chunks)}")
        for i, (start, end) in enumerate(chunks, 1):
            print(f"  Chunk {i}: {start.strftime('%Y-%m-%d %H:%M')} -> {end.strftime('%Y-%m-%d %H:%M')}")
        print()

        # Ejecutar cada chunk secuencialmente
        total_exitosos = 0
        total_fallidos = 0

        # IMPORTANTE: Crear UNA sola instancia del ETL y reutilizarla para todos los chunks
        # Esto evita memory leak al no crear nuevos extractors/loaders en cada iteración
        etl = VentasETLPostgres(dry_run=args.dry_run, minutos_atras=args.minutos, auto_gap_recovery=False)

        for i, (chunk_start, chunk_end) in enumerate(chunks, 1):
            print(f"\n{'#'*70}")
            print(f"# CHUNK {i}/{len(chunks)}: {chunk_start.strftime('%Y-%m-%d')} -> {chunk_end.strftime('%Y-%m-%d')}")
            print(f"{'#'*70}\n")

            # Resetear estadísticas para este chunk
            etl.stats = {
                'inicio': datetime.now(),
                'tiendas_procesadas': 0,
                'tiendas_exitosas': 0,
                'tiendas_fallidas': 0,
                'total_ventas_extraidas': 0,
                'total_ventas_cargadas': 0,
                'total_duplicados_omitidos': 0,
                'tiendas_klk': 0,
                'tiendas_stellar': 0,
                'gaps_recuperados': 0
            }

            exitoso = etl.ejecutar(tienda_ids=tiendas_a_procesar, fecha_desde=chunk_start, fecha_hasta=chunk_end)

            if exitoso:
                total_exitosos += 1
            else:
                total_fallidos += 1

        print(f"\n{'='*70}")
        print(f"RESUMEN CHUNKING")
        print(f"{'='*70}")
        print(f"Total chunks: {len(chunks)}")
        print(f"Exitosos: {total_exitosos}")
        print(f"Fallidos: {total_fallidos}")
        print(f"{'='*70}\n")

        sys.exit(0 if total_fallidos == 0 else 1)
    else:
        # Modo normal: ejecutar una sola vez
        # auto_gap_recovery solo aplica si no hay fechas manuales especificadas
        etl = VentasETLPostgres(dry_run=args.dry_run, minutos_atras=args.minutos, auto_gap_recovery=auto_gap_recovery)
        exitoso = etl.ejecutar(tienda_ids=tiendas_a_procesar, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)
        sys.exit(0 if exitoso else 1)


if __name__ == "__main__":
    main()
