#!/usr/bin/env python3
"""
ETL Ventas Unificado - PostgreSQL Mode
Extrae ventas desde KLK API o Stellar SQL Server y carga a PostgreSQL AWS RDS

Modo de operacion:
- Ejecutar cada 30 minutos
- Extraer ultimos 30 minutos de ventas
- Detecta automaticamente el sistema POS (KLK o Stellar)
- Deduplicacion por numero_factura

Uso:
  python etl_ventas_postgres.py --tiendas tienda_01 tienda_03 tienda_08
  python etl_ventas_postgres.py  # Sin args = ultimos 30 min, todas las tiendas activas
"""

import sys
from pathlib import Path

# Agregar directorio core al path
CORE_DIR = Path(__file__).parent / "core"
sys.path.insert(0, str(CORE_DIR))

import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

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


class VentasETLPostgres:
    """
    ETL Unificado para ventas - PostgreSQL Mode
    Detecta automaticamente KLK vs Stellar y usa el extractor apropiado
    """

    def __init__(self, dry_run: bool = False, minutos_atras: int = 30):
        """
        Args:
            dry_run: Si True, no carga datos (solo extrae)
            minutos_atras: Minutos hacia atras para extraer (default: 30)
        """
        self.dry_run = dry_run
        self.minutos_atras = minutos_atras
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
            'tiendas_stellar': 0
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

    def _get_sistema_pos(self, tienda_id: str) -> str:
        """Detecta el sistema POS de una tienda"""
        if tienda_id not in TIENDAS_CONFIG:
            return 'unknown'
        config = TIENDAS_CONFIG[tienda_id]
        return getattr(config, 'sistema_pos', 'stellar')

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
                    'nombre': tienda_nombre,
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
                    'nombre': tienda_nombre,
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
                'nombre': tienda_nombre,
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
                'nombre': tienda_nombre,
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

            # Extraer
            raw_data = self.stellar_extractor.extract_ventas_data(
                config=db_config,
                fecha_inicio=fecha_desde.date(),
                fecha_fin=fecha_hasta.date(),
                limite_registros=None
            )

            if raw_data is None or raw_data.empty:
                tiempo_proceso = (datetime.now() - tiempo_inicio).total_seconds()
                return {
                    'tienda_id': tienda_id,
                    'nombre': tienda_nombre,
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
                    'nombre': tienda_nombre,
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
                'nombre': tienda_nombre,
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
                'nombre': tienda_nombre,
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
        # Calcular rango de fechas
        if fecha_hasta is None:
            fecha_hasta = datetime.now()
        if fecha_desde is None:
            fecha_desde = fecha_hasta - timedelta(minutes=self.minutos_atras)

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

        # Mostrar tiendas
        self.logger.info(f"Tiendas a procesar: {len(tiendas)}")
        for tienda_id, config in tiendas.items():
            sistema = self._get_sistema_pos(tienda_id)
            self.logger.info(f"   - {config.ubicacion_nombre} ({tienda_id}) - {sistema.upper()}")

        # Procesar cada tienda
        tiendas_results = []
        for tienda_id, config in tiendas.items():
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
        self.logger.info(f"# RESUMEN ETL VENTAS UNIFICADO")
        self.logger.info(f"{'#'*80}")
        self.logger.info(f"Duracion: {duracion:.2f}s")
        self.logger.info(f"Tiendas procesadas: {self.stats['tiendas_procesadas']} (KLK: {self.stats['tiendas_klk']}, Stellar: {self.stats['tiendas_stellar']})")
        self.logger.info(f"Tiendas exitosas: {self.stats['tiendas_exitosas']}")
        self.logger.info(f"Tiendas fallidas: {self.stats['tiendas_fallidas']}")
        self.logger.info(f"Total ventas extraidas: {self.stats['total_ventas_extraidas']:,}")
        self.logger.info(f"Total ventas cargadas: {self.stats['total_ventas_cargadas']:,}")
        self.logger.info(f"Total duplicados omitidos: {self.stats['total_duplicados_omitidos']:,}")
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

        return self.stats['tiendas_fallidas'] == 0


def main():
    """Punto de entrada principal"""
    import argparse

    parser = argparse.ArgumentParser(description='ETL Ventas Unificado -> PostgreSQL')
    parser.add_argument('--dry-run', action='store_true',
                       help='Ejecuta sin cargar datos')
    parser.add_argument('--tiendas', nargs='+',
                       help='IDs de tiendas a procesar (ej: tienda_01 tienda_03). Si no se especifica, procesa todas')
    parser.add_argument('--minutos', type=int, default=30,
                       help='Minutos hacia atras para extraer (default: 30)')
    parser.add_argument('--fecha-desde', type=str,
                       help='Fecha/hora inicio (formato: YYYY-MM-DD HH:MM)')
    parser.add_argument('--fecha-hasta', type=str,
                       help='Fecha/hora fin (formato: YYYY-MM-DD HH:MM)')

    args = parser.parse_args()

    # Parsear fechas
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

    # Ejecutar ETL
    etl = VentasETLPostgres(dry_run=args.dry_run, minutos_atras=args.minutos)
    exitoso = etl.ejecutar(tienda_ids=args.tiendas, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)

    sys.exit(0 if exitoso else 1)


if __name__ == "__main__":
    main()
