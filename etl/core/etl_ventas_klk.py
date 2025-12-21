#!/usr/bin/env python3
"""
ETL de Ventas para Sistema KLK - La Granja Mercado
Extrae, transforma y carga datos de ventas desde API KLK a PostgreSQL
PostgreSQL only - DuckDB removed (Dec 2025)

Tiendas KLK:
- PERIFERICO (tienda_01) - SUC001
- BOSQUE (tienda_08) - SUC002
- ARTIGAS (tienda_17) - SUC003
- PARAISO (tienda_18) - SUC004
- TAZAJAL (tienda_20) - SUC005

Autor: ETL Team
Fecha: 2025-11-24
"""

import sys
import argparse
from pathlib import Path
from typing import List
from datetime import datetime, date, timedelta
import logging
import pandas as pd

# Agregar el directorio core al path para imports
sys.path.insert(0, str(Path(__file__).parent))

# Imports relativos dentro de core/
try:
    from extractor_ventas_klk import VentasKLKExtractor
    from transformer_ventas_klk import VentasKLKTransformer
    from loader_inventario import DuckDBLoader
    from tiendas_config import get_tiendas_klk, get_tienda_config
    from config import ETLConfig
    from etl_tracker import ETLTracker, ETLEjecucion
    from sentry_etl import init_sentry_for_etl, SentryETLMonitor
    SENTRY_AVAILABLE = True
except ImportError:
    from core.extractor_ventas_klk import VentasKLKExtractor
    from core.transformer_ventas_klk import VentasKLKTransformer
    from core.loader_inventario import DuckDBLoader
    from core.tiendas_config import get_tiendas_klk, get_tienda_config
    from core.config import ETLConfig
    from core.etl_tracker import ETLTracker, ETLEjecucion
    try:
        from core.sentry_etl import init_sentry_for_etl, SentryETLMonitor
        SENTRY_AVAILABLE = True
    except ImportError:
        SENTRY_AVAILABLE = False


class ETLVentasKLK:
    """Orquestador del ETL de ventas KLK"""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.logger = self._setup_logger()

        # Componentes del ETL
        self.extractor = VentasKLKExtractor()
        self.transformer = VentasKLKTransformer()
        self.loader = DuckDBLoader() if not dry_run else None
        self.tracker = ETLTracker(version_etl="2.0") if not dry_run else None

        # Estadísticas
        self.stats = {
            'tiendas_procesadas': 0,
            'tiendas_exitosas': 0,
            'tiendas_fallidas': 0,
            'total_ventas_extraidas': 0,
            'total_ventas_cargadas': 0,
            'total_facturas': 0,
            'total_venta_usd': 0.0,
            'inicio': datetime.now(),
            'fin': None,
            'duracion_segundos': 0
        }

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger principal del ETL"""
        logger = logging.getLogger('etl_ventas_klk')
        logger.setLevel(logging.INFO)

        # Handler para archivo
        log_file = ETLConfig.LOG_DIR / f"etl_ventas_klk_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.INFO)

        # Handler para consola
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)

        # Formato
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)

        logger.addHandler(file_handler)
        logger.addHandler(console_handler)

        return logger

    def procesar_tienda(self, config, fecha_desde: date, fecha_hasta: date,
                       hora_desde: str = None, hora_hasta: str = None, modo: str = 'completo') -> bool:
        """
        Procesa ventas de una tienda individual

        Args:
            config: Configuración de la tienda
            fecha_desde: Fecha inicial
            fecha_hasta: Fecha final
            hora_desde: Hora inicial opcional (para modo incremental)
            hora_hasta: Hora final opcional (para modo incremental)
            modo: Modo de ejecución ('completo', 'incremental_30min', 'recuperacion')

        Returns:
            True si exitoso, False si falló
        """
        tienda_id = config.ubicacion_id
        tienda_nombre = config.ubicacion_nombre

        self.logger.info(f"\n{'='*80}")
        self.logger.info(f"🏪 PROCESANDO: {tienda_nombre} ({tienda_id})")
        self.logger.info(f"📅 Período: {fecha_desde} a {fecha_hasta}")
        if hora_desde and hora_hasta:
            self.logger.info(f"⏰ Horario: {hora_desde} a {hora_hasta}")
        self.logger.info(f"🔧 Modo: {modo}")
        self.logger.info(f"{'='*80}")

        # Iniciar tracking de ejecución
        ejecucion_id = None
        if self.tracker:
            from datetime import time as time_type
            ejecucion = ETLEjecucion(
                etl_tipo='ventas',
                ubicacion_id=tienda_id,
                ubicacion_nombre=tienda_nombre,
                fecha_desde=fecha_desde,
                fecha_hasta=fecha_hasta,
                hora_desde=time_type.fromisoformat(hora_desde) if hora_desde else None,
                hora_hasta=time_type.fromisoformat(hora_hasta) if hora_hasta else None,
                modo=modo
            )
            ejecucion_id = self.tracker.iniciar_ejecucion(ejecucion)

        # Iniciar monitoreo de Sentry
        sentry_monitor = None
        if SENTRY_AVAILABLE:
            sentry_monitor = SentryETLMonitor(
                etl_name=f"ventas_klk_{modo}",
                tienda_id=tienda_id,
                fecha_inicio=str(fecha_desde),
                fecha_fin=str(fecha_hasta),
                extra_context={
                    "modo": modo,
                    "hora_desde": hora_desde,
                    "hora_hasta": hora_hasta
                }
            )
            sentry_monitor.__enter__()

        try:
            # PASO 1: EXTRACCIÓN
            self.logger.info(f"\n📡 PASO 1/3: Extrayendo ventas desde KLK API...")

            df_raw = self.extractor.extract_ventas(
                ubicacion_id=tienda_id,
                ubicacion_nombre=tienda_nombre,
                fecha_desde=fecha_desde,
                fecha_hasta=fecha_hasta,
                hora_desde=hora_desde,
                hora_hasta=hora_hasta
            )

            if df_raw is None or df_raw.empty:
                self.logger.warning(f"⚠️  No se obtuvieron ventas de {tienda_nombre}")

                # Finalizar tracking como exitoso (sin datos no es un error)
                if self.tracker and ejecucion_id:
                    self.tracker.finalizar_ejecucion_exitosa(ejecucion_id, 0, 0)

                return True  # No es un error, simplemente no hay ventas

            registros_extraidos = len(df_raw)
            self.logger.info(f"✅ Extraídas {registros_extraidos:,} líneas de venta")
            self.stats['total_ventas_extraidas'] += registros_extraidos

            # PASO 2: TRANSFORMACIÓN
            self.logger.info(f"\n🔄 PASO 2/3: Transformando datos al esquema ventas_raw...")
            df_transformed = self.transformer.transform(df_raw)

            if df_transformed.empty:
                self.logger.error(f"❌ Error en transformación de {tienda_nombre}")
                return False

            # Calcular estadísticas
            facturas_unicas = df_transformed['numero_factura'].nunique()
            venta_total = pd.to_numeric(df_transformed['venta_total'], errors='coerce').sum()

            self.logger.info(f"✅ Transformación exitosa:")
            self.logger.info(f"   - Líneas: {len(df_transformed):,}")
            self.logger.info(f"   - Facturas: {facturas_unicas:,}")
            self.logger.info(f"   - Venta total USD: ${venta_total:,.2f}")

            self.stats['total_facturas'] += facturas_unicas
            self.stats['total_venta_usd'] += venta_total

            # PASO 3: CARGA
            records_loaded = 0
            if self.dry_run:
                self.logger.info(f"\n⚠️  DRY RUN: Saltando carga a DuckDB")
                self.logger.info(f"   Líneas a cargar: {len(df_transformed):,}")
                records_loaded = len(df_transformed)
            else:
                self.logger.info(f"\n💾 PASO 3/3: Cargando datos a DuckDB...")

                records_loaded = self._cargar_ventas(df_transformed)
                self.logger.info(f"   ✅ Ventas cargadas: {records_loaded:,}")
                self.stats['total_ventas_cargadas'] += records_loaded

            self.logger.info(f"\n✅ {tienda_nombre} procesada exitosamente")

            # Finalizar tracking como exitoso
            if self.tracker and ejecucion_id:
                self.tracker.finalizar_ejecucion_exitosa(
                    ejecucion_id,
                    registros_extraidos=registros_extraidos,
                    registros_cargados=records_loaded
                )

            # Reportar métricas a Sentry
            if sentry_monitor:
                sentry_monitor.add_metric("registros_extraidos", registros_extraidos)
                sentry_monitor.add_metric("registros_cargados", records_loaded)
                sentry_monitor.add_metric("facturas", facturas_unicas)
                sentry_monitor.add_metric("venta_total_usd", float(venta_total))
                sentry_monitor.set_success(registros_procesados=registros_extraidos)
                sentry_monitor.__exit__(None, None, None)

            return True

        except Exception as e:
            self.logger.error(f"❌ Error procesando {tienda_nombre}: {e}", exc_info=True)

            # Finalizar tracking como fallido
            if self.tracker and ejecucion_id:
                # Determinar tipo de error
                error_tipo = 'unknown'
                error_msg = str(e)

                if 'timeout' in error_msg.lower():
                    error_tipo = 'timeout'
                elif 'connection' in error_msg.lower() or 'conectar' in error_msg.lower():
                    error_tipo = 'conexion'
                elif 'api' in error_msg.lower():
                    error_tipo = 'api_error'
                elif 'database' in error_msg.lower() or 'duckdb' in error_msg.lower():
                    error_tipo = 'db_error'

                self.tracker.finalizar_ejecucion_fallida(
                    ejecucion_id,
                    error_mensaje=error_msg,
                    error_tipo=error_tipo,
                    registros_extraidos=registros_extraidos if 'registros_extraidos' in locals() else 0
                )

            # Reportar error a Sentry
            if sentry_monitor:
                sentry_monitor.__exit__(type(e), e, e.__traceback__)

            return False

    def _cargar_ventas(self, df: pd.DataFrame) -> int:
        """
        Carga ventas a la tabla ventas_raw en DuckDB

        Returns:
            Número de registros cargados
        """
        try:
            conn = self.loader.get_connection()

            # Registrar DataFrame temporalmente
            conn.register('ventas_temp', df)

            # Lista de columnas del DataFrame (sin fecha_carga que se genera automáticamente)
            columns = ', '.join(df.columns.tolist())

            # Insertar ventas con fecha_carga como CURRENT_TIMESTAMP
            conn.execute(f"""
                INSERT INTO ventas_raw ({columns}, fecha_carga)
                SELECT *, CURRENT_TIMESTAMP FROM ventas_temp
            """)

            conn.close()
            return len(df)

        except Exception as e:
            self.logger.error(f"❌ Error cargando ventas: {e}")
            return 0

    def ejecutar(
        self,
        tienda_ids: List[str] = None,
        fecha_desde: date = None,
        fecha_hasta: date = None,
        incremental_minutos: int = None
    ) -> bool:
        """
        Ejecuta el ETL de ventas para tiendas KLK

        Args:
            tienda_ids: Lista de IDs de tiendas a procesar. Si None, procesa todas las tiendas KLK
            fecha_desde: Fecha inicial. Si None, usa fecha de hoy
            fecha_hasta: Fecha final. Si None, usa fecha de hoy
            incremental_minutos: Si se especifica, extrae solo los últimos N minutos (modo incremental)

        Returns:
            True si todas las tiendas se procesaron exitosamente
        """
        # Modo incremental: calcular rango de tiempo automáticamente
        hora_desde = None
        hora_hasta = None
        modo = 'completo'

        if incremental_minutos:
            from datetime import datetime, timedelta
            ahora = datetime.now()
            hora_hasta = ahora.strftime("%H:%M:%S")
            hora_desde = (ahora - timedelta(minutes=incremental_minutos)).strftime("%H:%M:%S")

            # En modo incremental, usar solo fecha de hoy
            fecha_desde = date.today()
            fecha_hasta = date.today()
            modo = f'incremental_{incremental_minutos}min'

            self.logger.info(f"🔄 MODO INCREMENTAL: Últimos {incremental_minutos} minutos")
            self.logger.info(f"⏰ Rango: {hora_desde} - {hora_hasta}")
        else:
            # Establecer fechas por defecto (modo completo)
            if fecha_desde is None:
                fecha_desde = date.today()
            if fecha_hasta is None:
                fecha_hasta = date.today()

        self.logger.info(f"\n{'#'*80}")
        self.logger.info(f"# ETL VENTAS KLK - INICIO")
        self.logger.info(f"# Fecha: {self.stats['inicio'].strftime('%Y-%m-%d %H:%M:%S')}")
        self.logger.info(f"# Período: {fecha_desde} a {fecha_hasta}")
        if incremental_minutos:
            self.logger.info(f"# Modo: INCREMENTAL ({incremental_minutos} minutos)")
        else:
            self.logger.info(f"# Modo: {'DRY RUN' if self.dry_run else 'PRODUCCIÓN'}")
        self.logger.info(f"{'#'*80}\n")

        # Obtener configuraciones de tiendas KLK
        tiendas_klk = get_tiendas_klk()

        if not tiendas_klk:
            self.logger.error("❌ No hay tiendas configuradas con sistema KLK")
            return False

        # Filtrar por tienda_ids si se especificó
        if tienda_ids:
            tiendas_klk = {k: v for k, v in tiendas_klk.items() if k in tienda_ids}

            if not tiendas_klk:
                self.logger.error(f"❌ Ninguna de las tiendas especificadas usa KLK: {tienda_ids}")
                return False

        self.logger.info(f"🎯 Tiendas KLK a procesar: {len(tiendas_klk)}")
        for tienda_id, config in tiendas_klk.items():
            self.logger.info(f"   - {config.ubicacion_nombre} ({tienda_id})")

        # RECUPERACIÓN AUTOMÁTICA DE GAPS (solo si no es dry_run)
        if self.tracker and not incremental_minutos:  # No recuperar en modo incremental
            self.logger.info(f"\n{'='*80}")
            self.logger.info(f"🔍 VERIFICANDO GAPS POR RECUPERAR...")
            self.logger.info(f"{'='*80}\n")

            gaps = self.tracker.obtener_gaps_por_recuperar(
                etl_tipo='ventas',
                ubicacion_id=list(tiendas_klk.keys())[0] if tienda_ids else None,
                max_horas=168  # 7 días
            )

            if gaps:
                self.logger.info(f"⚠️  Encontrados {len(gaps)} gaps por recuperar")
                self.logger.info(f"📋 Recuperando automáticamente (máx 5 gaps)...\n")

                gaps_recuperados = 0
                for i, gap in enumerate(gaps[:5]):  # Limitar a 5 gaps por ejecución
                    self.logger.info(f"🔧 Gap {i+1}/5: {gap.ubicacion_nombre} - "
                                   f"{gap.fecha_desde} {gap.hora_desde or ''}")

                    # Obtener config de la tienda
                    gap_config = tiendas_klk.get(gap.ubicacion_id)
                    if not gap_config:
                        self.logger.warning(f"   ⚠️  Tienda {gap.ubicacion_id} no encontrada en config")
                        continue

                    # Ejecutar recuperación
                    exitoso = self.procesar_tienda(
                        gap_config,
                        fecha_desde=gap.fecha_desde,
                        fecha_hasta=gap.fecha_hasta,
                        hora_desde=str(gap.hora_desde) if gap.hora_desde else None,
                        hora_hasta=str(gap.hora_hasta) if gap.hora_hasta else None,
                        modo='recuperacion'
                    )

                    if exitoso:
                        gaps_recuperados += 1
                        self.logger.info(f"   ✅ Gap recuperado\n")
                    else:
                        self.logger.warning(f"   ❌ Gap no pudo ser recuperado\n")

                self.logger.info(f"📊 Recuperación completada: {gaps_recuperados}/{len(gaps[:5])} gaps exitosos\n")
            else:
                self.logger.info("✅ No hay gaps por recuperar\n")

        # Procesar cada tienda
        for tienda_id, config in tiendas_klk.items():
            self.stats['tiendas_procesadas'] += 1

            exitoso = self.procesar_tienda(config, fecha_desde, fecha_hasta, hora_desde, hora_hasta, modo)

            if exitoso:
                self.stats['tiendas_exitosas'] += 1
            else:
                self.stats['tiendas_fallidas'] += 1

        # Finalizar
        self.stats['fin'] = datetime.now()
        self.stats['duracion_segundos'] = (self.stats['fin'] - self.stats['inicio']).total_seconds()

        self._mostrar_resumen()

        # Retornar True solo si todas las tiendas fueron exitosas
        return self.stats['tiendas_fallidas'] == 0

    def _mostrar_resumen(self):
        """Muestra resumen de la ejecución del ETL"""
        self.logger.info(f"\n{'#'*80}")
        self.logger.info(f"# ETL VENTAS KLK - RESUMEN")
        self.logger.info(f"{'#'*80}")
        self.logger.info(f"\n📊 ESTADÍSTICAS:")
        self.logger.info(f"   Tiendas procesadas:     {self.stats['tiendas_procesadas']}")
        self.logger.info(f"   Tiendas exitosas:       {self.stats['tiendas_exitosas']} ✅")
        self.logger.info(f"   Tiendas fallidas:       {self.stats['tiendas_fallidas']} ❌")
        self.logger.info(f"   Líneas extraídas:       {self.stats['total_ventas_extraidas']:,}")
        self.logger.info(f"   Facturas totales:       {self.stats['total_facturas']:,}")
        self.logger.info(f"   Venta total USD:        ${self.stats['total_venta_usd']:,.2f}")

        if not self.dry_run:
            self.logger.info(f"   Líneas cargadas:        {self.stats['total_ventas_cargadas']:,}")

        self.logger.info(f"\n⏱️  TIEMPO:")
        self.logger.info(f"   Inicio:   {self.stats['inicio'].strftime('%Y-%m-%d %H:%M:%S')}")
        self.logger.info(f"   Fin:      {self.stats['fin'].strftime('%Y-%m-%d %H:%M:%S')}")
        self.logger.info(f"   Duración: {self.stats['duracion_segundos']:.2f} segundos")

        if self.stats['tiendas_fallidas'] == 0:
            self.logger.info(f"\n✅ ETL COMPLETADO EXITOSAMENTE")
        else:
            self.logger.warning(f"\n⚠️  ETL COMPLETADO CON ERRORES")

        self.logger.info(f"{'#'*80}\n")

    def cerrar(self):
        """Cierra conexiones y recursos"""
        if self.extractor:
            self.extractor.close()


def main():
    """Función principal - CLI"""
    parser = argparse.ArgumentParser(
        description='ETL de Ventas para tiendas con sistema KLK',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos de uso:

  # Procesar todas las tiendas KLK (ventas de hoy)
  python etl_ventas_klk.py

  # Modo incremental: últimos 30 minutos (para cron jobs)
  python etl_ventas_klk.py --incremental 30

  # Procesar solo PERIFERICO
  python etl_ventas_klk.py --tiendas tienda_01

  # Procesar rango de fechas
  python etl_ventas_klk.py --desde 2025-11-20 --hasta 2025-11-24

  # Modo dry-run (sin cargar a DB)
  python etl_ventas_klk.py --dry-run

  # Procesar con logging en modo DEBUG
  python etl_ventas_klk.py --verbose
        """
    )

    parser.add_argument(
        '--tiendas',
        nargs='+',
        help='IDs de tiendas específicas a procesar (ej: tienda_01 tienda_08)'
    )

    parser.add_argument(
        '--desde',
        type=str,
        help='Fecha inicial (YYYY-MM-DD). Default: hoy'
    )

    parser.add_argument(
        '--hasta',
        type=str,
        help='Fecha final (YYYY-MM-DD). Default: hoy'
    )

    parser.add_argument(
        '--incremental',
        type=int,
        metavar='MINUTOS',
        help='Modo incremental: extrae solo los últimos N minutos (ej: 30 para últimos 30 min). Ideal para cron jobs.'
    )

    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Modo dry-run: extrae y transforma pero NO carga a DuckDB'
    )

    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Modo verbose: logging en nivel DEBUG'
    )

    args = parser.parse_args()

    # Configurar nivel de logging
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Parsear fechas
    fecha_desde = None
    fecha_hasta = None

    if args.desde:
        fecha_desde = datetime.strptime(args.desde, '%Y-%m-%d').date()
    if args.hasta:
        fecha_hasta = datetime.strptime(args.hasta, '%Y-%m-%d').date()

    # Crear y ejecutar ETL
    etl = ETLVentasKLK(dry_run=args.dry_run)

    try:
        exitoso = etl.ejecutar(
            tienda_ids=args.tiendas,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            incremental_minutos=args.incremental
        )

        # Exit code
        sys.exit(0 if exitoso else 1)

    except KeyboardInterrupt:
        print("\n\n⚠️  ETL interrumpido por el usuario")
        sys.exit(130)

    except Exception as e:
        print(f"\n❌ Error fatal en ETL: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    finally:
        etl.cerrar()


if __name__ == "__main__":
    main()
