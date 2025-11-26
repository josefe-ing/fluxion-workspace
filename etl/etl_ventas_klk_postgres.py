#!/usr/bin/env python3
"""
ETL Ventas KLK - PostgreSQL Mode
Extrae ventas desde KLK API y carga directamente a PostgreSQL AWS RDS

Modo de operacion:
- Ejecutar cada 30 minutos
- Extraer ultimos 30 minutos de ventas
- Deduplicacion por ID (factura_linea_producto)

Tiendas soportadas:
- Solo tiendas KLK (tienda_01, tienda_08)
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

from core.extractor_ventas_klk import VentasKLKExtractor
from core.loader_ventas_postgres import PostgreSQLVentasLoader
from core.tiendas_config import get_tiendas_klk, TiendaConfig
from core.config import ETLConfig

# Tracking y Sentry (opcional)
try:
    from core.etl_tracker import ETLTracker, ETLEjecucion
    TRACKER_AVAILABLE = True
except ImportError:
    TRACKER_AVAILABLE = False

try:
    from core.sentry_monitor import SentryETLMonitor
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False


class VentasKLKETLPostgres:
    """
    ETL para ventas KLK - PostgreSQL Mode
    Extrae desde KLK API → Carga directo a PostgreSQL (sin transformar)
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

        # Componentes ETL
        self.extractor = VentasKLKExtractor()
        self.loader = PostgreSQLVentasLoader()

        # Tracking (opcional)
        self.tracker = ETLTracker() if TRACKER_AVAILABLE else None

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
        logger = logging.getLogger('etl_ventas_klk_postgres')
        logger.setLevel(logging.INFO)

        # Evitar handlers duplicados
        if logger.handlers:
            return logger

        # File handler
        log_file = ETLConfig.LOG_DIR / f"ventas_klk_postgres_{datetime.now().strftime('%Y%m%d')}.log"
        handler = logging.FileHandler(log_file)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        # Console handler
        console = logging.StreamHandler()
        console.setFormatter(formatter)
        logger.addHandler(console)

        return logger

    def procesar_tienda(self, config: TiendaConfig, fecha_desde: datetime, fecha_hasta: datetime) -> bool:
        """
        Procesa ventas de una tienda individual

        Args:
            config: Configuracion de la tienda
            fecha_desde: Fecha/hora inicio
            fecha_hasta: Fecha/hora fin

        Returns:
            True si exitoso, False si fallo
        """
        tienda_id = config.ubicacion_id
        tienda_nombre = config.ubicacion_nombre
        codigo_sucursal = self.extractor.get_codigo_sucursal(tienda_id)

        self.logger.info(f"\n{'='*80}")
        self.logger.info(f"🏪 PROCESANDO: {tienda_nombre} ({tienda_id})")
        self.logger.info(f"   Sucursal KLK: {codigo_sucursal}")
        self.logger.info(f"   Rango: {fecha_desde.strftime('%Y-%m-%d %H:%M')} → {fecha_hasta.strftime('%Y-%m-%d %H:%M')}")
        self.logger.info(f"{'='*80}")

        # Tracking: Iniciar ejecucion
        ejecucion_id = None
        registros_extraidos = 0

        if self.tracker:
            ejecucion = ETLEjecucion(
                etl_tipo='ventas_postgres',
                ubicacion_id=tienda_id,
                ubicacion_nombre=tienda_nombre,
                fecha_desde=fecha_desde.date(),
                fecha_hasta=fecha_hasta.date(),
                modo='postgresql'
            )
            ejecucion_id = self.tracker.iniciar_ejecucion(ejecucion)

        # Sentry: Iniciar monitoreo
        sentry_monitor = None
        if SENTRY_AVAILABLE:
            sentry_monitor = SentryETLMonitor(
                etl_name="ventas_klk_postgres",
                tienda_id=tienda_id,
                fecha_inicio=fecha_desde.strftime('%Y-%m-%d %H:%M'),
                fecha_fin=fecha_hasta.strftime('%Y-%m-%d %H:%M'),
                extra_context={"modo": "postgresql", "db": "AWS RDS"}
            )
            sentry_monitor.__enter__()

        try:
            # PASO 1: EXTRACCION
            self.logger.info(f"\n📡 PASO 1/2: Extrayendo ventas desde KLK API...")

            # Extraer ventas del rango especificado
            response = self.extractor.extract_ventas_raw(
                sucursal=codigo_sucursal,
                fecha_desde=fecha_desde.strftime('%Y-%m-%d'),
                fecha_hasta=fecha_hasta.strftime('%Y-%m-%d'),
                hora_desde=fecha_desde.strftime('%H:%M'),
                hora_hasta=fecha_hasta.strftime('%H:%M')
            )

            if not response or 'ventas' not in response:
                self.logger.warning(f"⚠️ No se obtuvieron ventas de {tienda_nombre}")
                # No es error si no hay ventas en el rango
                if self.tracker and ejecucion_id:
                    self.tracker.finalizar_ejecucion_exitosa(ejecucion_id, 0, 0)
                return True

            ventas_data = response.get('ventas', [])
            registros_extraidos = len(ventas_data)

            self.logger.info(f"✅ Extraidas {registros_extraidos:,} lineas de venta")
            self.stats['total_ventas_extraidas'] += registros_extraidos

            if registros_extraidos == 0:
                self.logger.info(f"ℹ️ No hay ventas nuevas en el rango especificado")
                if self.tracker and ejecucion_id:
                    self.tracker.finalizar_ejecucion_exitosa(ejecucion_id, 0, 0)
                return True

            # PASO 2: CARGA A POSTGRESQL
            if self.dry_run:
                self.logger.info(f"\n⚠️  DRY RUN: Saltando carga a PostgreSQL")
                self.logger.info(f"   Ventas a cargar: {registros_extraidos:,}")
                # Mostrar muestra de datos
                if ventas_data:
                    sample = ventas_data[0]
                    self.logger.info(f"   Muestra - Factura: {sample.get('numero_factura')}")
                    self.logger.info(f"   Muestra - Fecha: {sample.get('fecha')}")
                    self.logger.info(f"   Muestra - Hora: {sample.get('hora')}")
            else:
                self.logger.info(f"\n💾 PASO 2/2: Cargando ventas a PostgreSQL (AWS RDS)...")

                # Cargar directamente (el loader maneja deduplicacion)
                result = self.loader.load_ventas_raw(ventas_data, codigo_sucursal)

                if result['success']:
                    self.logger.info(f"   ✅ Ventas cargadas: {result['records_loaded']:,}")
                    self.logger.info(f"   ⏭️  Duplicados omitidos: {result['duplicates_skipped']:,}")
                    self.stats['total_ventas_cargadas'] += result['records_loaded']
                    self.stats['total_duplicados_omitidos'] += result['duplicates_skipped']
                else:
                    self.logger.error(f"   ❌ Error cargando: {result['message']}")
                    raise Exception(result['message'])

            self.logger.info(f"\n✅ {tienda_nombre} procesada exitosamente")

            # Tracking: Finalizar exitosamente
            if self.tracker and ejecucion_id:
                try:
                    self.tracker.finalizar_ejecucion_exitosa(
                        ejecucion_id,
                        registros_extraidos=registros_extraidos,
                        registros_cargados=result.get('records_loaded', 0) if not self.dry_run else 0
                    )
                except Exception as tracker_err:
                    self.logger.warning(f"⚠️ Error en tracker (no-critico): {tracker_err}")

            # Sentry: Reportar metricas
            if sentry_monitor:
                sentry_monitor.add_metric("ventas_extraidas", registros_extraidos)
                sentry_monitor.add_metric("ventas_cargadas", result.get('records_loaded', 0) if not self.dry_run else 0)
                sentry_monitor.set_success(registros_procesados=registros_extraidos)
                sentry_monitor.__exit__(None, None, None)

            return True

        except Exception as e:
            self.logger.error(f"❌ Error procesando {tienda_nombre}: {e}", exc_info=True)

            # Tracking: Finalizar con error
            if self.tracker and ejecucion_id:
                try:
                    error_tipo = 'api_error'
                    if 'timeout' in str(e).lower():
                        error_tipo = 'timeout'
                    elif 'connection' in str(e).lower():
                        error_tipo = 'conexion'
                    elif 'postgres' in str(e).lower():
                        error_tipo = 'db_error'

                    self.tracker.finalizar_ejecucion_fallida(
                        ejecucion_id,
                        error_mensaje=str(e),
                        error_tipo=error_tipo,
                        registros_extraidos=registros_extraidos
                    )
                except Exception as tracker_err:
                    self.logger.warning(f"⚠️ Error en tracker (no-critico): {tracker_err}")

            # Sentry: Reportar error
            if sentry_monitor:
                sentry_monitor.__exit__(type(e), e, e.__traceback__)

            return False

    def ejecutar(self, tienda_ids: List[str] = None, fecha_desde: datetime = None, fecha_hasta: datetime = None) -> bool:
        """
        Ejecuta el ETL para tiendas KLK cargando a PostgreSQL

        Args:
            tienda_ids: Lista de IDs de tiendas a procesar. Si None, procesa todas las tiendas KLK
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
        self.logger.info(f"# ETL VENTAS KLK → POSTGRESQL")
        self.logger.info(f"# Fecha: {self.stats['inicio'].strftime('%Y-%m-%d %H:%M:%S')}")
        self.logger.info(f"# Modo: {'DRY RUN' if self.dry_run else 'PRODUCCION - PostgreSQL AWS RDS'}")
        self.logger.info(f"# Rango: {fecha_desde.strftime('%Y-%m-%d %H:%M')} → {fecha_hasta.strftime('%Y-%m-%d %H:%M')}")
        self.logger.info(f"# Minutos: {self.minutos_atras}")
        self.logger.info(f"{'#'*80}\n")

        # Obtener configuraciones de tiendas KLK
        tiendas_klk = get_tiendas_klk()

        if not tiendas_klk:
            self.logger.error("❌ No hay tiendas configuradas con sistema KLK")
            return False

        # Filtrar por tienda_ids si se especifico
        if tienda_ids:
            tiendas_klk = {k: v for k, v in tiendas_klk.items() if k in tienda_ids}

            if not tiendas_klk:
                self.logger.error(f"❌ Ninguna de las tiendas especificadas usa KLK: {tienda_ids}")
                return False

        self.logger.info(f"🎯 Tiendas KLK a procesar: {len(tiendas_klk)}")
        for tienda_id, config in tiendas_klk.items():
            codigo_sucursal = self.extractor.get_codigo_sucursal(tienda_id)
            self.logger.info(f"   - {config.ubicacion_nombre} ({tienda_id}) - Sucursal: {codigo_sucursal}")

        # Procesar cada tienda
        for tienda_id, config in tiendas_klk.items():
            self.stats['tiendas_procesadas'] += 1

            exitoso = self.procesar_tienda(config, fecha_desde, fecha_hasta)

            if exitoso:
                self.stats['tiendas_exitosas'] += 1
            else:
                self.stats['tiendas_fallidas'] += 1

        # Resumen final
        self.stats['fin'] = datetime.now()
        duracion = (self.stats['fin'] - self.stats['inicio']).total_seconds()

        self.logger.info(f"\n{'#'*80}")
        self.logger.info(f"# RESUMEN ETL VENTAS KLK → POSTGRESQL")
        self.logger.info(f"{'#'*80}")
        self.logger.info(f"⏱️  Duracion: {duracion:.2f}s")
        self.logger.info(f"🏪 Tiendas procesadas: {self.stats['tiendas_procesadas']}")
        self.logger.info(f"✅ Tiendas exitosas: {self.stats['tiendas_exitosas']}")
        self.logger.info(f"❌ Tiendas fallidas: {self.stats['tiendas_fallidas']}")
        self.logger.info(f"📊 Total ventas extraidas: {self.stats['total_ventas_extraidas']:,}")
        self.logger.info(f"💾 Total ventas cargadas: {self.stats['total_ventas_cargadas']:,}")
        self.logger.info(f"⏭️  Total duplicados omitidos: {self.stats['total_duplicados_omitidos']:,}")
        self.logger.info(f"{'#'*80}\n")

        return self.stats['tiendas_fallidas'] == 0


def main():
    """Punto de entrada principal"""
    import argparse

    parser = argparse.ArgumentParser(description='ETL Ventas KLK → PostgreSQL')
    parser.add_argument('--dry-run', action='store_true',
                       help='Ejecuta sin cargar datos (solo extrae)')
    parser.add_argument('--tiendas', nargs='+',
                       help='IDs de tiendas a procesar (ej: tienda_01 tienda_08). Si no se especifica, procesa todas')
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
    etl = VentasKLKETLPostgres(dry_run=args.dry_run, minutos_atras=args.minutos)
    exitoso = etl.ejecutar(tienda_ids=args.tiendas, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)

    # Exit code
    sys.exit(0 if exitoso else 1)


if __name__ == "__main__":
    main()
