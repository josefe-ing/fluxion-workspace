#!/usr/bin/env python3
"""
Script ETL para extraer inventario de todas las tiendas y CEDIs
Fecha: 2025-10-02
"""

import argparse
import asyncio
import sys
import time
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime
import logging

# Agregar el directorio core al path
sys.path.append(str(Path(__file__).parent / 'core'))

# Agregar el directorio backend al path para imports
sys.path.append(str(Path(__file__).parent.parent / 'backend'))

from core.tiendas_config import TIENDAS_CONFIG, get_tiendas_activas, get_tiendas_klk, get_tiendas_stellar
from core.config import ETLConfig, DatabaseConfig
from core.extractor import SQLServerExtractor
from core.transformer import InventoryTransformer
from core.loader_inventario_postgres import PostgreSQLInventarioLoader

# Configurar logging PRIMERO (antes de usarlo)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('etl_multi_tienda')

# Import KLK ETL components
try:
    from core.extractor_inventario_klk import InventarioKLKExtractor
    from core.transformer_inventario_klk import InventarioKLKTransformer
    KLK_AVAILABLE = True
except ImportError:
    KLK_AVAILABLE = False
    logger.warning("⚠️ KLK ETL components not available")

# Import Sentry ETL monitoring
try:
    from sentry_etl import init_sentry_for_etl, SentryETLMonitor, capture_etl_error
    SENTRY_AVAILABLE = True
    logger.info("✅ Sentry ETL monitoring available")
except ImportError:
    SENTRY_AVAILABLE = False
    logger.warning("⚠️ Sentry ETL module not available")

# Import email notifier (only in production)
try:
    from etl_notifier import send_etl_notification
    NOTIFICATIONS_AVAILABLE = True
    logger.info("✅ Email notifications available")
except ImportError:
    NOTIFICATIONS_AVAILABLE = False
    logger.warning("⚠️ Email notifications not available (etl_notifier not found)")


class MultiTiendaETL:
    """Orquestador de ETL para múltiples tiendas (Stellar y KLK)"""

    def __init__(self):
        # Stellar POS components
        self.extractor = SQLServerExtractor()
        self.transformer = InventoryTransformer()
        self.loader = PostgreSQLInventarioLoader()

        # KLK POS components
        self.klk_extractor = InventarioKLKExtractor() if KLK_AVAILABLE else None
        self.klk_transformer = InventarioKLKTransformer() if KLK_AVAILABLE else None

        self.results = []

    def ejecutar_etl_tienda(self, tienda_id: str) -> Dict[str, Any]:
        """Ejecuta el ETL para una tienda específica (Stellar o KLK)"""
        start_time = time.time()

        # Monitoreo de Sentry para este ETL
        monitor = None
        if SENTRY_AVAILABLE:
            monitor = SentryETLMonitor(
                etl_name="inventario_tienda",
                tienda_id=tienda_id,
                extra_context={"etl_type": "inventario"}
            )
            monitor.__enter__()

        try:
            # Obtener configuración
            if tienda_id not in TIENDAS_CONFIG:
                raise ValueError(f"Tienda {tienda_id} no configurada")

            config = TIENDAS_CONFIG[tienda_id]

            if not config.activo:
                logger.warning(f"⏭️  {config.ubicacion_nombre} está INACTIVA - Saltando")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": "Tienda inactiva",
                    "registros": 0,
                    "tiempo_proceso": time.time() - start_time
                }

            # DETECTAR SISTEMA POS Y DELEGAR AL ETL APROPIADO
            sistema_pos = getattr(config, 'sistema_pos', 'stellar')

            if sistema_pos == 'klk':
                logger.info(f"🏪 Procesando: {config.ubicacion_nombre} (KLK POS)")
                return self._ejecutar_etl_klk(tienda_id, config, start_time, monitor)
            else:
                logger.info(f"🏪 Procesando: {config.ubicacion_nombre} (Stellar POS)")
                logger.info(f"   📡 Conectando a {config.server_ip}:{config.port}")
                return self._ejecutar_etl_stellar(tienda_id, config, start_time, monitor)

        except Exception as e:
            logger.error(f"❌ Error procesando {tienda_id}: {str(e)}")

            # Capturar error en Sentry
            if SENTRY_AVAILABLE:
                capture_etl_error(
                    error=e,
                    etl_name="inventario_tienda",
                    tienda_id=tienda_id,
                    context={"etl_type": "inventario"}
                )

            return {
                "tienda_id": tienda_id,
                "nombre": TIENDAS_CONFIG.get(tienda_id).ubicacion_nombre if tienda_id in TIENDAS_CONFIG else tienda_id,
                "success": False,
                "message": str(e),
                "registros": 0,
                "tiempo_proceso": time.time() - start_time
            }

        finally:
            if monitor:
                monitor.__exit__(None, None, None)

    def _ejecutar_etl_stellar(self, tienda_id: str, config, start_time: float, monitor) -> Dict[str, Any]:
        """Ejecuta ETL para tiendas con Stellar POS (SQL Server)"""
        try:
            # Configurar config de base de datos
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

            # 1. EXTRACCIÓN
            logger.info(f"   📥 Extrayendo datos...")
            query_params = {'codigo_deposito': config.codigo_deposito}

            raw_data = self.extractor.extract_inventory_data(
                config=db_config,
                query_file=config.query_file,
                query_params=query_params
            )

            if raw_data is None or raw_data.empty:
                logger.warning(f"   ⚠️ Sin datos para {config.ubicacion_nombre}")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": "Sin datos extraídos",
                    "registros": 0,
                    "tiempo_proceso": time.time() - start_time
                }

            registros_extraidos = len(raw_data)
            logger.info(f"   ✅ Extraídos: {registros_extraidos} registros")

            # 2. TRANSFORMACIÓN
            logger.info(f"   🔄 Transformando datos...")
            raw_data_dict = {config.ubicacion_id: raw_data}
            transformed_data = self.transformer.transform_inventory_data(raw_data_dict)

            if transformed_data.empty:
                logger.warning(f"   ⚠️ Sin datos transformados para {config.ubicacion_nombre}")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": "Error en transformación",
                    "registros": 0,
                    "tiempo_proceso": time.time() - start_time
                }

            registros_transformados = len(transformed_data)
            logger.info(f"   ✅ Transformados: {registros_transformados} registros")

            # 3. CARGA
            logger.info(f"   💾 Cargando a base de datos...")
            result = self.loader.load_inventory_data(transformed_data)

            if result["success"]:
                logger.info(f"   ✅ Cargados: {result['stats']['insertados']} registros")

                # Reportar métricas a Sentry
                if monitor:
                    tiempo_proceso = time.time() - start_time
                    monitor.add_metric("registros_cargados", result['stats']['insertados'])
                    monitor.add_metric("tiempo_proceso", tiempo_proceso)
                    monitor.set_success(registros_cargados=result['stats']['insertados'])

                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": True,
                    "message": "ETL completado exitosamente",
                    "registros": result['stats']['insertados'],
                    "tiempo_proceso": time.time() - start_time
                }
            else:
                logger.error(f"   ❌ Error en carga: {result.get('message')}")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": result.get('message'),
                    "registros": 0,
                    "tiempo_proceso": time.time() - start_time
                }

        except Exception as e:
            logger.error(f"   ❌ Error en ETL Stellar: {str(e)}")
            return {
                "tienda_id": tienda_id,
                "nombre": config.ubicacion_nombre,
                "success": False,
                "message": str(e),
                "registros": 0,
                "tiempo_proceso": time.time() - start_time
            }

    def _ejecutar_etl_klk(self, tienda_id: str, config, start_time: float, monitor) -> Dict[str, Any]:
        """Ejecuta ETL para tiendas con KLK POS (REST API)"""
        if not KLK_AVAILABLE:
            logger.error("   ❌ KLK ETL components not available")
            return {
                "tienda_id": tienda_id,
                "nombre": config.ubicacion_nombre,
                "success": False,
                "message": "KLK ETL components not available",
                "registros": 0,
                "tiempo_proceso": time.time() - start_time
            }

        try:
            logger.info(f"   📡 API: {self.klk_extractor.api_config.base_url}")
            logger.info(f"   🏪 Almacén: {config.codigo_almacen_klk}")

            # 1. EXTRACCIÓN
            logger.info(f"   📥 Extrayendo datos desde KLK API...")
            df_raw = self.klk_extractor.extract_inventario_data(config)

            if df_raw is None or df_raw.empty:
                logger.warning(f"   ⚠️ Sin datos para {config.ubicacion_nombre}")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": "Sin datos extraídos",
                    "registros": 0,
                    "tiempo_proceso": time.time() - start_time
                }

            registros_extraidos = len(df_raw)
            logger.info(f"   ✅ Extraídos: {registros_extraidos} registros")

            # 2. TRANSFORMACIÓN
            logger.info(f"   🔄 Transformando datos...")
            df_productos, df_stock = self.klk_transformer.transform(df_raw)

            if df_productos.empty or df_stock.empty:
                logger.warning(f"   ⚠️ Error en transformación para {config.ubicacion_nombre}")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": "Error en transformación",
                    "registros": 0,
                    "tiempo_proceso": time.time() - start_time
                }

            logger.info(f"   ✅ Transformados: {len(df_productos)} productos, {len(df_stock)} stock")

            # 3. CARGA
            logger.info(f"   💾 Cargando a base de datos...")

            # 3A: Cargar productos primero (necesario por FK)
            productos_cargados = self._cargar_productos_klk(df_productos)
            logger.info(f"   ✅ Productos cargados: {productos_cargados}")

            # 3B: Cargar stock (a inventario_actual con almacenes KLK correctos)
            result_stock = self.loader.update_stock_actual_table(df_stock)
            stock_cargado = result_stock.get('records_updated', 0)
            logger.info(f"   ✅ Stock cargado: {stock_cargado}")

            # Reportar métricas a Sentry
            if monitor:
                tiempo_proceso = time.time() - start_time
                monitor.add_metric("registros_cargados", stock_cargado)
                monitor.add_metric("tiempo_proceso", tiempo_proceso)
                monitor.set_success(registros_cargados=stock_cargado)

            return {
                "tienda_id": tienda_id,
                "nombre": config.ubicacion_nombre,
                "success": True,
                "message": "ETL KLK completado exitosamente",
                "registros": stock_cargado,
                "tiempo_proceso": time.time() - start_time
            }

        except Exception as e:
            logger.error(f"   ❌ Error en ETL KLK: {str(e)}")
            return {
                "tienda_id": tienda_id,
                "nombre": config.ubicacion_nombre,
                "success": False,
                "message": str(e),
                "registros": 0,
                "tiempo_proceso": time.time() - start_time
            }

    def _cargar_productos_klk(self, df_productos) -> int:
        """Carga productos KLK a PostgreSQL usando el loader"""
        try:
            # Usar el método load_productos del loader PostgreSQL
            return self.loader.load_productos(df_productos)

        except Exception as e:
            logger.error(f"   ❌ Error cargando productos KLK: {e}")
            return 0

    def ejecutar_todas_las_tiendas(self, paralelo: bool = False) -> List[Dict[str, Any]]:
        """Ejecuta el ETL para todas las tiendas activas"""
        etl_start_time = datetime.now()
        tiendas_activas = get_tiendas_activas()

        logger.info(f"\n🚀 INICIANDO ETL MULTI-TIENDA")
        logger.info(f"   📊 Tiendas activas: {len(tiendas_activas)}")
        logger.info("=" * 60)

        resultados = []

        if paralelo:
            # TODO: Implementar ejecución en paralelo con asyncio
            logger.warning("⚠️ Ejecución en paralelo aún no implementada, ejecutando secuencialmente")

        # Ejecución secuencial
        for tienda_id in tiendas_activas:
            resultado = self.ejecutar_etl_tienda(tienda_id)
            resultados.append(resultado)
            logger.info("-" * 40)

        etl_end_time = datetime.now()

        # Send email notification (only in production)
        if NOTIFICATIONS_AVAILABLE:
            try:
                # Calculate global summary
                exitosos = [r for r in resultados if r["success"]]
                total_registros = sum(r["registros"] for r in exitosos)
                tiempo_promedio = sum(r.get("tiempo_proceso", 0) for r in exitosos) / len(exitosos) if exitosos else 0

                global_summary = {
                    'Ejecución': 'Automática' if paralelo else 'Secuencial',
                    'Productos únicos': f"{total_registros:,}",
                    'Promedio por tienda': f"{tiempo_promedio:.1f}s"
                }

                send_etl_notification(
                    etl_name='ETL Inventario',
                    etl_type='inventario',
                    start_time=etl_start_time,
                    end_time=etl_end_time,
                    tiendas_results=resultados,
                    global_summary=global_summary
                )
            except Exception as e:
                logger.error(f"Error sending email notification: {e}")

        return resultados

    def generar_resumen(self, resultados: List[Dict[str, Any]]):
        """Genera un resumen de la ejecución"""
        logger.info("\n" + "=" * 60)
        logger.info("📊 RESUMEN DE EJECUCIÓN ETL MULTI-TIENDA")
        logger.info("=" * 60)

        exitosos = [r for r in resultados if r["success"]]
        fallidos = [r for r in resultados if not r["success"]]

        logger.info(f"\n✅ Exitosos: {len(exitosos)}/{len(resultados)}")
        for r in exitosos:
            logger.info(f"   • {r['nombre']}: {r['registros']} registros ({r.get('tiempo', 0):.2f}s)")

        if fallidos:
            logger.info(f"\n❌ Fallidos: {len(fallidos)}/{len(resultados)}")
            for r in fallidos:
                logger.info(f"   • {r['nombre']}: {r['message']}")

        total_registros = sum(r["registros"] for r in exitosos)
        logger.info(f"\n📈 Total registros cargados: {total_registros}")
        logger.info("=" * 60)


def main():
    """Función principal"""

    # Inicializar Sentry para ETL
    if SENTRY_AVAILABLE:
        init_sentry_for_etl()
        logger.info("✅ Sentry ETL monitoring inicializado")

    parser = argparse.ArgumentParser(description='ETL Multi-Tienda para La Granja Mercado')
    parser.add_argument('--tienda', type=str, help='ID de tienda específica (ej: tienda_01)')
    parser.add_argument('--tiendas', nargs='+', help='Lista de IDs de tiendas (ej: tienda_01 tienda_08 cedi_seco)')
    parser.add_argument('--todas', action='store_true', help='Ejecutar para todas las tiendas activas')
    parser.add_argument('--listar', action='store_true', help='Listar tiendas configuradas')
    parser.add_argument('--paralelo', action='store_true', help='Ejecutar en paralelo (experimental)')

    args = parser.parse_args()

    # Listar tiendas
    if args.listar:
        from tiendas_config import listar_tiendas
        listar_tiendas()
        return

    # Ejecutar ETL
    etl = MultiTiendaETL()

    if args.tiendas:
        # Ejecutar múltiples tiendas específicas (secuencialmente)
        etl_start_time = datetime.now()
        logger.info(f"🎯 Ejecutando ETL para {len(args.tiendas)} tiendas: {args.tiendas}")
        resultados = []
        for tienda_id in args.tiendas:
            resultado = etl.ejecutar_etl_tienda(tienda_id)
            resultados.append(resultado)
        etl_end_time = datetime.now()
        etl.generar_resumen(resultados)

        # Send email notification (only in production)
        if NOTIFICATIONS_AVAILABLE:
            try:
                exitosos = [r for r in resultados if r["success"]]
                total_registros = sum(r["registros"] for r in exitosos)
                tiempo_promedio = sum(r.get("tiempo_proceso", 0) for r in exitosos) / len(exitosos) if exitosos else 0

                global_summary = {
                    'Tiendas seleccionadas': ', '.join(args.tiendas),
                    'Productos únicos': f"{total_registros:,}",
                    'Promedio por tienda': f"{tiempo_promedio:.1f}s"
                }

                send_etl_notification(
                    etl_name='ETL Inventario (Scheduled)',
                    etl_type='inventario',
                    start_time=etl_start_time,
                    end_time=etl_end_time,
                    tiendas_results=resultados,
                    global_summary=global_summary
                )
            except Exception as e:
                logger.error(f"Error sending email notification: {e}")

    elif args.tienda:
        # Ejecutar una tienda específica
        resultado = etl.ejecutar_etl_tienda(args.tienda)
        etl.generar_resumen([resultado])

    elif args.todas:
        # Ejecutar todas las tiendas activas
        resultados = etl.ejecutar_todas_las_tiendas(paralelo=args.paralelo)
        etl.generar_resumen(resultados)

    else:
        print("❌ Debe especificar --tienda ID, --tiendas IDs o --todas")
        print("   Ejemplo: python3 etl_inventario.py --tienda tienda_01")
        print("   Ejemplo: python3 etl_inventario.py --tiendas tienda_01 tienda_08 cedi_seco")
        print("   Ejemplo: python3 etl_inventario.py --todas")
        print("   Use --listar para ver las tiendas disponibles")
        sys.exit(1)


if __name__ == "__main__":
    main()