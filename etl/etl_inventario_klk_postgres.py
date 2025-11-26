#!/usr/bin/env python3
"""
ETL Inventario KLK - PostgreSQL Mode
Extrae inventario desde KLK API y carga directamente a PostgreSQL AWS RDS

Diferencias vs DuckDB version:
- Usa loader_inventario_postgres.PostgreSQLInventarioLoader
- DB_MODE='postgresql' por defecto
- Sin dependencia de DuckDB
"""

import sys
from pathlib import Path

# Agregar directorio core al path
CORE_DIR = Path(__file__).parent / "core"
sys.path.insert(0, str(CORE_DIR))

import os
import logging
from datetime import datetime
from typing import List, Dict, Any

# Set DB_MODE to postgresql BEFORE any other imports
os.environ['DB_MODE'] = 'postgresql'

from core.extractor_inventario_klk import InventarioKLKExtractor
from core.transformer_inventario_klk import InventarioKLKTransformer
from core.loader_inventario_postgres import PostgreSQLInventarioLoader
from core.tiendas_config import get_tiendas_klk, TiendaConfig
from core.config import ETLConfig

# Tracking y Sentry
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


class InventarioKLKETLPostgres:
    """
    ETL para inventario KLK - PostgreSQL Mode
    Extrae desde KLK API → Transforma → Carga a PostgreSQL
    """

    def __init__(self, dry_run: bool = False):
        """
        Args:
            dry_run: Si True, no carga datos (solo extrae y transforma)
        """
        self.dry_run = dry_run
        self.logger = self._setup_logger()

        # Componentes ETL
        self.extractor = InventarioKLKExtractor()
        self.transformer = InventarioKLKTransformer()
        self.loader = PostgreSQLInventarioLoader()

        # Tracking (opcional)
        self.tracker = ETLTracker() if TRACKER_AVAILABLE else None

        # Estadísticas
        self.stats = {
            'inicio': datetime.now(),
            'tiendas_procesadas': 0,
            'tiendas_exitosas': 0,
            'tiendas_fallidas': 0,
            'total_productos_extraidos': 0,
            'total_productos_cargados': 0,
            'total_stock_cargado': 0
        }

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_inventario_klk_postgres')
        logger.setLevel(logging.INFO)

        # File handler
        log_file = ETLConfig.LOG_DIR / f"inventario_klk_postgres_{datetime.now().strftime('%Y%m%d')}.log"
        handler = logging.FileHandler(log_file)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        # Console handler
        console = logging.StreamHandler()
        console.setFormatter(formatter)
        logger.addHandler(console)

        return logger

    def procesar_tienda(self, config: TiendaConfig) -> bool:
        """
        Procesa una tienda individual: extrae TODOS los almacenes activos, transforma y carga a PostgreSQL

        Returns:
            True si exitoso, False si falló
        """
        tienda_id = config.ubicacion_id
        tienda_nombre = config.ubicacion_nombre

        self.logger.info(f"\n{'='*80}")
        self.logger.info(f"🏪 PROCESANDO: {tienda_nombre} ({tienda_id})")
        self.logger.info(f"{'='*80}")

        # Tracking: Iniciar ejecución
        ejecucion_id = None
        fecha_hoy = datetime.now().date()
        registros_extraidos = 0

        if self.tracker:
            ejecucion = ETLEjecucion(
                etl_tipo='inventario_postgres',
                ubicacion_id=tienda_id,
                ubicacion_nombre=tienda_nombre,
                fecha_desde=fecha_hoy,
                fecha_hasta=fecha_hoy,
                modo='postgresql'
            )
            ejecucion_id = self.tracker.iniciar_ejecucion(ejecucion)

        # Sentry: Iniciar monitoreo
        sentry_monitor = None
        if SENTRY_AVAILABLE:
            sentry_monitor = SentryETLMonitor(
                etl_name="inventario_klk_postgres",
                tienda_id=tienda_id,
                fecha_inicio=str(fecha_hoy),
                fecha_fin=str(fecha_hoy),
                extra_context={"modo": "postgresql", "db": "AWS RDS"}
            )
            sentry_monitor.__enter__()

        try:
            # PASO 1: EXTRACCIÓN DE TODOS LOS ALMACENES ACTIVOS
            self.logger.info(f"\n📡 PASO 1/3: Extrayendo inventario desde KLK API...")

            # Usar el método que extrae todos los almacenes activos
            dfs_raw = self.extractor.extract_all_almacenes_tienda(config)

            if not dfs_raw:
                self.logger.error(f"❌ No se pudo extraer inventario de {tienda_nombre}")
                return False

            # Combinar todos los DataFrames de almacenes
            import pandas as pd
            df_raw = pd.concat(dfs_raw, ignore_index=True)

            registros_extraidos = len(df_raw)
            self.logger.info(f"✅ Extraídos {registros_extraidos:,} productos de {len(dfs_raw)} almacén(es)")
            self.stats['total_productos_extraidos'] += registros_extraidos

            # PASO 2: TRANSFORMACIÓN
            self.logger.info(f"\n🔄 PASO 2/3: Transformando datos al esquema PostgreSQL...")
            df_productos, df_stock = self.transformer.transform(df_raw)

            if df_productos.empty or df_stock.empty:
                self.logger.error(f"❌ Error en transformación de {tienda_nombre}")
                return False

            # Validar datos transformados
            validacion = self.transformer.validate_transformed_data(df_productos, df_stock)

            if not validacion['valido']:
                self.logger.error(f"❌ Validación falló para {tienda_nombre}")
                self.logger.error(f"Errores: {validacion['errores']}")
                return False

            self.logger.info(f"✅ Transformación exitosa:")
            self.logger.info(f"   - Productos: {len(df_productos):,}")
            self.logger.info(f"   - Stock: {len(df_stock):,}")

            # PASO 3: CARGA A POSTGRESQL
            if self.dry_run:
                self.logger.info(f"\n⚠️  DRY RUN: Saltando carga a PostgreSQL")
                self.logger.info(f"   Productos a cargar: {len(df_productos):,}")
                self.logger.info(f"   Stock a cargar: {len(df_stock):,}")
                # Mostrar almacenes extraídos
                if 'almacen_codigo' in df_stock.columns:
                    almacenes = df_stock['almacen_codigo'].unique()
                    self.logger.info(f"   Almacenes: {list(almacenes)}")
            else:
                self.logger.info(f"\n💾 PASO 3/3: Cargando datos a PostgreSQL (AWS RDS)...")

                # PASO 3A: Cargar productos primero (necesario por FK de inventario_actual)
                productos_cargados = self.loader.load_productos(df_productos)
                self.logger.info(f"   ✅ Productos cargados: {productos_cargados:,}")
                self.stats['total_productos_cargados'] += productos_cargados

                # PASO 3B: Cargar stock actual (con snapshot histórico)
                stock_cargado = self.loader.load_stock(df_stock)
                self.logger.info(f"   ✅ Stock cargado: {stock_cargado:,}")
                self.stats['total_stock_cargado'] += stock_cargado

            self.logger.info(f"\n✅ {tienda_nombre} procesada exitosamente")

            # Tracking: Finalizar exitosamente
            if self.tracker and ejecucion_id:
                self.tracker.finalizar_ejecucion_exitosa(
                    ejecucion_id,
                    registros_extraidos=registros_extraidos,
                    registros_cargados=registros_extraidos  # Para inventario, extraídos = cargados
                )

            # Sentry: Reportar métricas
            if sentry_monitor:
                sentry_monitor.add_metric("productos_extraidos", registros_extraidos)
                sentry_monitor.add_metric("productos_cargados", registros_extraidos)
                sentry_monitor.set_success(registros_procesados=registros_extraidos)
                sentry_monitor.__exit__(None, None, None)

            return True

        except Exception as e:
            self.logger.error(f"❌ Error procesando {tienda_nombre}: {e}", exc_info=True)

            # Tracking: Finalizar con error
            if self.tracker and ejecucion_id:
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

            # Sentry: Reportar error
            if sentry_monitor:
                sentry_monitor.__exit__(type(e), e, e.__traceback__)

            return False

    def ejecutar(self, tienda_ids: List[str] = None) -> bool:
        """
        Ejecuta el ETL para tiendas KLK cargando a PostgreSQL

        Args:
            tienda_ids: Lista de IDs de tiendas a procesar. Si None, procesa todas las tiendas KLK

        Returns:
            True si todas las tiendas se procesaron exitosamente
        """
        self.logger.info(f"\n{'#'*80}")
        self.logger.info(f"# ETL INVENTARIO KLK → POSTGRESQL")
        self.logger.info(f"# Fecha: {self.stats['inicio'].strftime('%Y-%m-%d %H:%M:%S')}")
        self.logger.info(f"# Modo: {'DRY RUN' if self.dry_run else 'PRODUCCIÓN - PostgreSQL AWS RDS'}")
        self.logger.info(f"# DB_MODE: {os.getenv('DB_MODE', 'postgresql')}")
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
            self.logger.info(f"   - {config.ubicacion_nombre} ({tienda_id}) - Almacén: {config.codigo_almacen_klk}")

        # Procesar cada tienda
        for tienda_id, config in tiendas_klk.items():
            self.stats['tiendas_procesadas'] += 1

            exitoso = self.procesar_tienda(config)

            if exitoso:
                self.stats['tiendas_exitosas'] += 1
            else:
                self.stats['tiendas_fallidas'] += 1

        # Resumen final
        self.stats['fin'] = datetime.now()
        duracion = (self.stats['fin'] - self.stats['inicio']).total_seconds()

        self.logger.info(f"\n{'#'*80}")
        self.logger.info(f"# RESUMEN ETL INVENTARIO KLK → POSTGRESQL")
        self.logger.info(f"{'#'*80}")
        self.logger.info(f"⏱️  Duración: {duracion:.2f}s")
        self.logger.info(f"🏪 Tiendas procesadas: {self.stats['tiendas_procesadas']}")
        self.logger.info(f"✅ Tiendas exitosas: {self.stats['tiendas_exitosas']}")
        self.logger.info(f"❌ Tiendas fallidas: {self.stats['tiendas_fallidas']}")
        self.logger.info(f"📦 Total productos extraídos: {self.stats['total_productos_extraidos']:,}")
        self.logger.info(f"💾 Total productos cargados: {self.stats['total_productos_cargados']:,}")
        self.logger.info(f"📊 Total stock cargado: {self.stats['total_stock_cargado']:,}")
        self.logger.info(f"{'#'*80}\n")

        return self.stats['tiendas_fallidas'] == 0


def main():
    """Punto de entrada principal"""
    import argparse

    parser = argparse.ArgumentParser(description='ETL Inventario KLK → PostgreSQL')
    parser.add_argument('--dry-run', action='store_true',
                       help='Ejecuta sin cargar datos (solo extrae y transforma)')
    parser.add_argument('--tiendas', nargs='+',
                       help='IDs de tiendas a procesar (ej: tienda_01 tienda_08). Si no se especifica, procesa todas')

    args = parser.parse_args()

    # Crear y ejecutar ETL
    etl = InventarioKLKETLPostgres(dry_run=args.dry_run)
    exitoso = etl.ejecutar(tienda_ids=args.tiendas)

    # Exit code
    sys.exit(0 if exitoso else 1)


if __name__ == "__main__":
    main()
