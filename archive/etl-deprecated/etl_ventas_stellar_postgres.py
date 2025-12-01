#!/usr/bin/env python3
"""
ETL Ventas Stellar - PostgreSQL Mode
Extrae ventas desde Stellar POS (SQL Server) y carga directamente a PostgreSQL AWS RDS

Modo de operacion:
- Ejecutar cada 30 minutos
- Extraer ultimos 30 minutos de ventas
- Deduplicacion por numero_factura (incluye linea)

Tiendas soportadas:
- Solo tiendas Stellar (tienda_03, tienda_02, etc.)
"""

import sys
from pathlib import Path

# Agregar directorio core al path
CORE_DIR = Path(__file__).parent / "core"
sys.path.insert(0, str(CORE_DIR))

import os
import logging
from datetime import datetime, timedelta, date
from typing import List, Dict, Any, Optional

# Set DB_MODE to postgresql BEFORE any other imports
os.environ['DB_MODE'] = 'postgresql'

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


def get_tiendas_stellar() -> Dict[str, Any]:
    """Obtiene tiendas con sistema Stellar (no KLK)"""
    tiendas_stellar = {}
    for tienda_id, config in TIENDAS_CONFIG.items():
        sistema_pos = getattr(config, 'sistema_pos', 'stellar')
        if sistema_pos == 'stellar' and config.activo and config.tipo != 'cedi':
            tiendas_stellar[tienda_id] = config
    return tiendas_stellar


class VentasStellarETLPostgres:
    """
    ETL para ventas Stellar - PostgreSQL Mode
    Extrae desde SQL Server -> Transforma -> Carga a PostgreSQL
    """

    def __init__(self, dry_run: bool = False, minutos_atras: int = 30):
        """
        Args:
            dry_run: Si True, no carga datos (solo extrae y transforma)
            minutos_atras: Minutos hacia atras para extraer (default: 30)
        """
        self.dry_run = dry_run
        self.minutos_atras = minutos_atras
        self.logger = self._setup_logger()

        # Componentes ETL
        self.extractor = VentasExtractor()
        self.transformer = VentasTransformer()
        self.loader = VentasLoader()

        # Estadisticas
        self.stats = {
            'inicio': datetime.now(),
            'tiendas_procesadas': 0,
            'tiendas_exitosas': 0,
            'tiendas_fallidas': 0,
            'total_ventas_extraidas': 0,
            'total_ventas_cargadas': 0,
            'total_duplicados_omitidos': 0
        }

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_ventas_stellar_postgres')
        logger.setLevel(logging.INFO)

        # Evitar handlers duplicados
        if logger.handlers:
            return logger

        # File handler
        log_file = ETLConfig.LOG_DIR / f"ventas_stellar_postgres_{datetime.now().strftime('%Y%m%d')}.log"
        handler = logging.FileHandler(log_file)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        # Console handler
        console = logging.StreamHandler()
        console.setFormatter(formatter)
        logger.addHandler(console)

        return logger

    def procesar_tienda(self, config, fecha_desde: datetime, fecha_hasta: datetime) -> Dict[str, Any]:
        """
        Procesa ventas de una tienda individual

        Args:
            config: Configuracion de la tienda
            fecha_desde: Fecha/hora inicio
            fecha_hasta: Fecha/hora fin

        Returns:
            Dict con resultado: tienda_id, nombre, success, registros, tiempo_proceso, message
        """
        tienda_id = config.ubicacion_id
        tienda_nombre = config.ubicacion_nombre
        tiempo_inicio = datetime.now()

        self.logger.info(f"\n{'='*80}")
        self.logger.info(f"PROCESANDO: {tienda_nombre} ({tienda_id})")
        self.logger.info(f"   Server: {config.server_ip}:{config.port}")
        self.logger.info(f"   Rango: {fecha_desde.strftime('%Y-%m-%d %H:%M')} -> {fecha_hasta.strftime('%Y-%m-%d %H:%M')}")
        self.logger.info(f"{'='*80}")

        # Sentry: Iniciar monitoreo
        sentry_monitor = None
        if SENTRY_AVAILABLE:
            sentry_monitor = SentryETLMonitor(
                etl_name="ventas_stellar_postgres",
                tienda_id=tienda_id,
                fecha_inicio=fecha_desde.strftime('%Y-%m-%d %H:%M'),
                fecha_fin=fecha_hasta.strftime('%Y-%m-%d %H:%M'),
                extra_context={"modo": "postgresql", "db": "AWS RDS"}
            )
            sentry_monitor.__enter__()

        registros_extraidos = 0

        try:
            # Configurar conexion de base de datos
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

            # PASO 1: EXTRACCION
            self.logger.info(f"\n PASO 1/3: Extrayendo ventas desde SQL Server...")

            # Extraer ventas del rango especificado (usar date para extractor)
            raw_data = self.extractor.extract_ventas_data(
                config=db_config,
                fecha_inicio=fecha_desde.date(),
                fecha_fin=fecha_hasta.date(),
                limite_registros=None  # Sin limite
            )

            if raw_data is None or raw_data.empty:
                self.logger.warning(f"Sin ventas para {tienda_nombre} en el rango")
                tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
                return {
                    'tienda_id': tienda_id,
                    'nombre': tienda_nombre,
                    'success': True,
                    'registros': 0,
                    'tiempo_proceso': tiempo_proceso,
                    'message': 'Sin ventas en el rango'
                }

            registros_extraidos = len(raw_data)
            self.logger.info(f"   Extraidas {registros_extraidos:,} lineas de venta")
            self.stats['total_ventas_extraidas'] += registros_extraidos

            # PASO 2: TRANSFORMACION
            self.logger.info(f"\n PASO 2/3: Transformando datos...")

            transformed_data = self.transformer.transform_ventas_data(raw_data)

            if transformed_data.empty:
                self.logger.warning(f"Sin datos transformados para {tienda_nombre}")
                tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
                return {
                    'tienda_id': tienda_id,
                    'nombre': tienda_nombre,
                    'success': False,
                    'registros': 0,
                    'tiempo_proceso': tiempo_proceso,
                    'message': 'Error en transformacion'
                }

            registros_transformados = len(transformed_data)
            self.logger.info(f"   Transformados: {registros_transformados:,} registros")

            # Generar estadisticas
            stats = self.transformer.generar_estadisticas_transformacion(raw_data, transformed_data)
            self.logger.info(f"   Venta total: ${stats['metricas_negocio']['venta_total']:,.2f}")
            self.logger.info(f"   Facturas: {stats['metricas_negocio']['total_facturas']:,}")

            # PASO 3: CARGA A POSTGRESQL
            if self.dry_run:
                self.logger.info(f"\n DRY RUN: Saltando carga a PostgreSQL")
                self.logger.info(f"   Ventas a cargar: {registros_transformados:,}")
                registros_cargados = registros_transformados
            else:
                self.logger.info(f"\n PASO 3/3: Cargando ventas a PostgreSQL...")

                # Cargar usando el loader (maneja deduplicacion con ON CONFLICT)
                result = self.loader.load_ventas_postgresql(transformed_data)

                if result['success']:
                    registros_cargados = result.get('records_loaded', 0)
                    duplicados_omitidos = result.get('duplicates_skipped', 0)
                    self.logger.info(f"   Ventas cargadas: {registros_cargados:,}")
                    self.logger.info(f"   Duplicados omitidos: {duplicados_omitidos:,}")
                    self.stats['total_ventas_cargadas'] += registros_cargados
                    self.stats['total_duplicados_omitidos'] += duplicados_omitidos
                else:
                    self.logger.error(f"   Error cargando: {result.get('message')}")
                    raise Exception(result.get('message'))

            self.logger.info(f"\n {tienda_nombre} procesada exitosamente")

            # Sentry: Reportar metricas
            if sentry_monitor:
                sentry_monitor.add_metric("ventas_extraidas", registros_extraidos)
                sentry_monitor.add_metric("ventas_cargadas", registros_cargados if not self.dry_run else 0)
                sentry_monitor.set_success(registros_procesados=registros_extraidos)
                sentry_monitor.__exit__(None, None, None)

            tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
            return {
                'tienda_id': tienda_id,
                'nombre': tienda_nombre,
                'success': True,
                'registros': registros_cargados if not self.dry_run else registros_transformados,
                'tiempo_proceso': tiempo_proceso,
                'message': f'{registros_cargados:,} ventas cargadas' if not self.dry_run else f'{registros_transformados:,} ventas (dry run)'
            }

        except Exception as e:
            self.logger.error(f"Error procesando {tienda_nombre}: {e}", exc_info=True)

            # Sentry: Reportar error
            if sentry_monitor:
                sentry_monitor.__exit__(type(e), e, e.__traceback__)

            tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
            return {
                'tienda_id': tienda_id,
                'nombre': tienda_nombre,
                'success': False,
                'registros': 0,
                'tiempo_proceso': tiempo_proceso,
                'message': str(e)
            }

    def ejecutar(self, tienda_ids: List[str] = None, fecha_desde: datetime = None, fecha_hasta: datetime = None) -> bool:
        """
        Ejecuta el ETL para tiendas Stellar cargando a PostgreSQL

        Args:
            tienda_ids: Lista de IDs de tiendas a procesar. Si None, procesa todas las tiendas Stellar
            fecha_desde: Fecha/hora inicio. Si None, usa ahora - minutos_atras
            fecha_hasta: Fecha/hora fin. Si None, usa ahora

        Returns:
            True si todas las tiendas se procesaron exitosamente
        """
        # Calcular rango de fechas
        if fecha_hasta is None:
            fecha_hasta = datetime.now()

        if fecha_desde is None:
            fecha_desde = fecha_hasta - timedelta(minutes=self.minutos_atras)

        self.logger.info(f"\n{'#'*80}")
        self.logger.info(f"# ETL VENTAS STELLAR -> POSTGRESQL")
        self.logger.info(f"# Fecha: {self.stats['inicio'].strftime('%Y-%m-%d %H:%M:%S')}")
        self.logger.info(f"# Modo: {'DRY RUN' if self.dry_run else 'PRODUCCION - PostgreSQL AWS RDS'}")
        self.logger.info(f"# Rango: {fecha_desde.strftime('%Y-%m-%d %H:%M')} -> {fecha_hasta.strftime('%Y-%m-%d %H:%M')}")
        self.logger.info(f"# Minutos: {self.minutos_atras}")
        self.logger.info(f"{'#'*80}\n")

        # Obtener configuraciones de tiendas Stellar
        tiendas_stellar = get_tiendas_stellar()

        if not tiendas_stellar:
            self.logger.error("No hay tiendas configuradas con sistema Stellar")
            return False

        # Filtrar por tienda_ids si se especifico
        if tienda_ids:
            tiendas_stellar = {k: v for k, v in tiendas_stellar.items() if k in tienda_ids}

            if not tiendas_stellar:
                self.logger.error(f"Ninguna de las tiendas especificadas usa Stellar: {tienda_ids}")
                return False

        self.logger.info(f"Tiendas Stellar a procesar: {len(tiendas_stellar)}")
        for tienda_id, config in tiendas_stellar.items():
            self.logger.info(f"   - {config.ubicacion_nombre} ({tienda_id}) - {config.server_ip}")

        # Lista para recolectar resultados
        tiendas_results = []

        # Procesar cada tienda
        for tienda_id, config in tiendas_stellar.items():
            self.stats['tiendas_procesadas'] += 1

            resultado = self.procesar_tienda(config, fecha_desde, fecha_hasta)
            tiendas_results.append(resultado)

            if resultado['success']:
                self.stats['tiendas_exitosas'] += 1
            else:
                self.stats['tiendas_fallidas'] += 1

        # Resumen final
        self.stats['fin'] = datetime.now()
        duracion = (self.stats['fin'] - self.stats['inicio']).total_seconds()

        self.logger.info(f"\n{'#'*80}")
        self.logger.info(f"# RESUMEN ETL VENTAS STELLAR -> POSTGRESQL")
        self.logger.info(f"{'#'*80}")
        self.logger.info(f"Duracion: {duracion:.2f}s")
        self.logger.info(f"Tiendas procesadas: {self.stats['tiendas_procesadas']}")
        self.logger.info(f"Tiendas exitosas: {self.stats['tiendas_exitosas']}")
        self.logger.info(f"Tiendas fallidas: {self.stats['tiendas_fallidas']}")
        self.logger.info(f"Total ventas extraidas: {self.stats['total_ventas_extraidas']:,}")
        self.logger.info(f"Total ventas cargadas: {self.stats['total_ventas_cargadas']:,}")
        self.logger.info(f"Total duplicados omitidos: {self.stats['total_duplicados_omitidos']:,}")
        self.logger.info(f"{'#'*80}\n")

        # Enviar notificacion por email (solo en produccion)
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
                    etl_name="ETL Ventas Stellar PostgreSQL",
                    etl_type="ventas",
                    start_time=self.stats['inicio'],
                    end_time=self.stats['fin'],
                    tiendas_results=tiendas_results,
                    global_summary=global_summary
                )
                self.logger.info("Notificacion por email enviada")
            except Exception as email_err:
                self.logger.warning(f"Error enviando email (no-critico): {email_err}")

        return self.stats['tiendas_fallidas'] == 0


def main():
    """Punto de entrada principal"""
    import argparse

    parser = argparse.ArgumentParser(description='ETL Ventas Stellar -> PostgreSQL')
    parser.add_argument('--dry-run', action='store_true',
                       help='Ejecuta sin cargar datos (solo extrae y transforma)')
    parser.add_argument('--tiendas', nargs='+',
                       help='IDs de tiendas a procesar (ej: tienda_03). Si no se especifica, procesa todas')
    parser.add_argument('--minutos', type=int, default=30,
                       help='Minutos hacia atras para extraer (default: 30)')
    parser.add_argument('--fecha-desde', type=str,
                       help='Fecha/hora inicio (formato: YYYY-MM-DD HH:MM). Si no se especifica, usa ahora - minutos')
    parser.add_argument('--fecha-hasta', type=str,
                       help='Fecha/hora fin (formato: YYYY-MM-DD HH:MM). Si no se especifica, usa ahora')

    args = parser.parse_args()

    # Parsear fechas si se especificaron
    fecha_desde = None
    fecha_hasta = None

    if args.fecha_desde:
        try:
            fecha_desde = datetime.strptime(args.fecha_desde, '%Y-%m-%d %H:%M')
        except ValueError:
            print(f"Error: formato de fecha invalido para --fecha-desde: {args.fecha_desde}")
            print("Use formato: YYYY-MM-DD HH:MM")
            sys.exit(1)

    if args.fecha_hasta:
        try:
            fecha_hasta = datetime.strptime(args.fecha_hasta, '%Y-%m-%d %H:%M')
        except ValueError:
            print(f"Error: formato de fecha invalido para --fecha-hasta: {args.fecha_hasta}")
            print("Use formato: YYYY-MM-DD HH:MM")
            sys.exit(1)

    # Crear y ejecutar ETL
    etl = VentasStellarETLPostgres(dry_run=args.dry_run, minutos_atras=args.minutos)
    exitoso = etl.ejecutar(tienda_ids=args.tiendas, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)

    # Exit code
    sys.exit(0 if exitoso else 1)


if __name__ == "__main__":
    main()
