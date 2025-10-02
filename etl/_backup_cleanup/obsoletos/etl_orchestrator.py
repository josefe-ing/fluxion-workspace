#!/usr/bin/env python3
"""
Orquestador ETL principal para La Granja Mercado
Coordina extracción, transformación y carga de inventarios
"""

import os
import sys
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
import time
import json
from pathlib import Path
import argparse

# Importar componentes ETL
from config import ETLConfig, DatabaseConfig, validate_environment
from extractor import SQLServerExtractor
from transformer import InventoryTransformer
from loader import DuckDBLoader

class ETLOrchestrator:
    """Orquestador principal del proceso ETL"""

    def __init__(self):
        self.logger = self._setup_logger()
        self.start_time = datetime.now()

        # Componentes ETL
        self.extractor = None
        self.transformer = InventoryTransformer()
        self.loader = DuckDBLoader()

        # Estadísticas de ejecución
        self.stats = {
            'ubicaciones_procesadas': 0,
            'ubicaciones_exitosas': 0,
            'ubicaciones_fallidas': 0,
            'total_registros_extraidos': 0,
            'total_registros_cargados': 0,
            'tiempo_total': 0,
            'errores': []
        }

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger principal"""
        logger = logging.getLogger('etl_orchestrator')
        logger.setLevel(logging.INFO)

        # Handler para consola
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)

        # Handler para archivo
        log_file = ETLConfig.LOG_DIR / f"orchestrator_{datetime.now().strftime('%Y%m%d')}.log"
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.INFO)

        # Formato
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        console_handler.setFormatter(formatter)
        file_handler.setFormatter(formatter)

        logger.addHandler(console_handler)
        logger.addHandler(file_handler)

        return logger

    def validate_environment(self) -> bool:
        """Valida el entorno antes de ejecutar"""

        try:
            # Validar variables de entorno
            validate_environment()

            # Validar que DuckDB existe
            if not ETLConfig.DUCKDB_PATH.exists():
                self.logger.error(f"❌ Base de datos DuckDB no existe: {ETLConfig.DUCKDB_PATH}")
                return False

            # Crear directorio de logs si no existe
            ETLConfig.LOG_DIR.mkdir(exist_ok=True)

            # Crear tablas ETL si no existen
            if not self.loader.create_etl_tables():
                self.logger.error("❌ No se pudieron crear/verificar tablas ETL")
                return False

            self.logger.info("✅ Validación de entorno exitosa")
            return True

        except Exception as e:
            self.logger.error(f"❌ Error en validación de entorno: {str(e)}")
            return False

    def run_inventory_etl(self,
                         ubicaciones: Optional[List[str]] = None,
                         query: Optional[str] = None,
                         query_file: Optional[str] = None,
                         update_stock_actual: bool = True) -> Dict[str, Any]:
        """Ejecuta el proceso ETL completo para inventarios"""

        self.logger.info("🚀 INICIANDO PROCESO ETL DE INVENTARIOS")
        self.logger.info("=" * 60)

        # Validar entorno
        if not self.validate_environment():
            return {"success": False, "error": "Validación de entorno falló"}

        # Query por defecto si no se proporciona
        if not query:
            # TODO: Aquí debes poner tu query real de inventario
            query = """
            SELECT
                p.codigo AS codigo_producto,
                p.codigo_barras,
                p.descripcion AS descripcion_producto,
                p.categoria,
                p.marca,
                p.presentacion,
                i.cantidad_actual,
                i.cantidad_disponible,
                p.costo_unitario AS costo_unitario_actual,
                p.precio_venta AS precio_venta_actual,
                i.valor_inventario AS valor_inventario_actual,
                p.stock_minimo,
                p.stock_maximo,
                i.fecha_ultimo_movimiento AS fecha_ultima_salida,
                p.activo,
                GETDATE() AS fecha_sistema
            FROM productos p
            INNER JOIN inventario i ON p.id = i.producto_id
            WHERE p.activo = 1
            """

        try:
            # 1. FASE DE EXTRACCIÓN
            self.logger.info("🔍 FASE 1: EXTRACCIÓN DE DATOS")
            self.logger.info("-" * 40)

            self.extractor = SQLServerExtractor()

            # Obtener configuraciones de ubicaciones
            if ubicaciones:
                configs = [ETLConfig.get_database_config(u) for u in ubicaciones]
            else:
                configs = ETLConfig.get_active_databases()

            self.logger.info(f"📍 Procesando {len(configs)} ubicaciones")

            # Extraer datos
            raw_data = self.extractor.extract_multiple_inventories(configs, query=query, query_file=query_file)

            if not raw_data:
                self.logger.error("❌ No se extrajeron datos de ninguna ubicación")
                return {"success": False, "error": "Sin datos extraídos"}

            # Actualizar estadísticas
            self.stats['ubicaciones_procesadas'] = len(configs)
            self.stats['ubicaciones_exitosas'] = len(raw_data)
            self.stats['ubicaciones_fallidas'] = len(configs) - len(raw_data)
            self.stats['total_registros_extraidos'] = sum(len(df) for df in raw_data.values())

            self.logger.info(f"✅ Extracción completada:")
            self.logger.info(f"   📊 Ubicaciones exitosas: {len(raw_data)}/{len(configs)}")
            self.logger.info(f"   📈 Total registros: {self.stats['total_registros_extraidos']:,}")

            # 2. FASE DE TRANSFORMACIÓN
            self.logger.info("\n🔄 FASE 2: TRANSFORMACIÓN DE DATOS")
            self.logger.info("-" * 40)

            transformed_df = self.transformer.transform_inventory_data(raw_data)

            if transformed_df.empty:
                self.logger.error("❌ No hay datos válidos después de la transformación")
                return {"success": False, "error": "Transformación sin resultados válidos"}

            self.logger.info(f"✅ Transformación completada: {len(transformed_df):,} registros")

            # 3. FASE DE CARGA
            self.logger.info("\n💾 FASE 3: CARGA DE DATOS")
            self.logger.info("-" * 40)

            # Cargar datos en tabla raw
            load_result = self.loader.load_inventory_data(transformed_df)

            if not load_result['success']:
                self.logger.error(f"❌ Error cargando datos: {load_result.get('error', 'Error desconocido')}")
                return {"success": False, "error": "Error en carga de datos", "details": load_result}

            self.stats['total_registros_cargados'] = load_result['stats']['insertados']

            # Actualizar stock_actual si se solicita
            if update_stock_actual:
                self.logger.info("🔄 Actualizando tabla stock_actual...")
                stock_result = self.loader.update_stock_actual_table(transformed_df)

                if stock_result['success']:
                    self.logger.info(f"✅ stock_actual actualizada: {stock_result['records_updated']} registros")
                else:
                    self.logger.warning(f"⚠️  Error actualizando stock_actual: {stock_result.get('error', '')}")

            # 4. FINALIZACIÓN
            self.stats['tiempo_total'] = (datetime.now() - self.start_time).total_seconds()

            self.logger.info("\n🎉 PROCESO ETL COMPLETADO")
            self.logger.info("=" * 60)
            self.logger.info(f"📊 ESTADÍSTICAS FINALES:")
            self.logger.info(f"   ⏱️  Tiempo total: {self.stats['tiempo_total']:.2f}s")
            self.logger.info(f"   📍 Ubicaciones procesadas: {self.stats['ubicaciones_exitosas']}/{self.stats['ubicaciones_procesadas']}")
            self.logger.info(f"   📥 Registros extraídos: {self.stats['total_registros_extraidos']:,}")
            self.logger.info(f"   📤 Registros cargados: {self.stats['total_registros_cargados']:,}")
            self.logger.info(f"   📈 Eficiencia: {(self.stats['total_registros_cargados']/self.stats['total_registros_extraidos']*100):.1f}%" if self.stats['total_registros_extraidos'] > 0 else "   📈 Eficiencia: N/A")

            return {
                "success": True,
                "message": "ETL completado exitosamente",
                "stats": self.stats,
                "batch_id": load_result.get('batch_id'),
                "log_id": load_result.get('log_id')
            }

        except Exception as e:
            self.stats['tiempo_total'] = (datetime.now() - self.start_time).total_seconds()
            error_msg = f"Error crítico en ETL: {str(e)}"

            self.logger.error(f"💥 {error_msg}")
            self.stats['errores'].append(error_msg)

            return {
                "success": False,
                "error": error_msg,
                "stats": self.stats
            }

        finally:
            # Limpiar recursos
            if self.extractor:
                self.extractor.close_connections()

    def run_inventory_etl_by_priority(self, max_priority: int = 2) -> Dict[str, Any]:
        """Ejecuta ETL solo para ubicaciones de alta prioridad"""

        configs = [
            config for config in ETLConfig.get_active_databases()
            if config.prioridad <= max_priority
        ]

        ubicaciones = [config.ubicacion_id for config in configs]

        self.logger.info(f"🎯 Ejecutando ETL prioritario para {len(ubicaciones)} ubicaciones (prioridad <= {max_priority})")

        return self.run_inventory_etl(ubicaciones=ubicaciones)

    def test_connections(self) -> Dict[str, Any]:
        """Prueba las conexiones a todas las ubicaciones configuradas"""

        self.logger.info("🧪 PROBANDO CONEXIONES A UBICACIONES")
        self.logger.info("=" * 50)

        results = {}
        configs = ETLConfig.get_active_databases()

        with SQLServerExtractor() as extractor:
            for config in configs:
                self.logger.info(f"🔌 Probando {config.ubicacion_nombre}...")

                success = extractor.test_connection(config)
                results[config.ubicacion_id] = {
                    "nombre": config.ubicacion_nombre,
                    "tipo": config.tipo,
                    "ip": config.server_ip,
                    "success": success
                }

        # Resumen
        successful = sum(1 for r in results.values() if r['success'])
        total = len(results)

        self.logger.info(f"\n📊 RESUMEN DE CONEXIONES:")
        self.logger.info(f"   ✅ Exitosas: {successful}")
        self.logger.info(f"   ❌ Fallidas: {total - successful}")
        self.logger.info(f"   📈 Éxito: {(successful/total*100):.1f}%" if total > 0 else "   📈 Éxito: N/A")

        return {
            "total": total,
            "successful": successful,
            "failed": total - successful,
            "results": results
        }

def main():
    """Función principal para ejecución por línea de comandos"""

    parser = argparse.ArgumentParser(description="ETL de Inventarios - La Granja Mercado")

    parser.add_argument("--action", choices=["etl", "etl-priority", "test-connections"],
                       default="etl", help="Acción a ejecutar")
    parser.add_argument("--ubicaciones", nargs="+", help="IDs de ubicaciones específicas")
    parser.add_argument("--max-priority", type=int, default=2,
                       help="Prioridad máxima para ETL prioritario")
    parser.add_argument("--no-update-stock", action="store_true",
                       help="No actualizar tabla stock_actual")
    parser.add_argument("--query-file", help="Archivo con query personalizado")

    args = parser.parse_args()

    # Crear orquestador
    orchestrator = ETLOrchestrator()

    try:
        if args.action == "test-connections":
            result = orchestrator.test_connections()

        elif args.action == "etl-priority":
            result = orchestrator.run_inventory_etl_by_priority(args.max_priority)

        else:  # etl

            result = orchestrator.run_inventory_etl(
                ubicaciones=args.ubicaciones,
                query_file=args.query_file,
                update_stock_actual=not args.no_update_stock
            )

        # Mostrar resultado
        if result.get('success'):
            print(f"\n✅ Proceso completado exitosamente")
            if 'stats' in result:
                stats = result['stats']
                print(f"📊 Estadísticas:")
                print(f"   ⏱️  Tiempo: {stats.get('tiempo_total', 0):.2f}s")
                print(f"   📈 Registros: {stats.get('total_registros_cargados', 0):,}")
        else:
            print(f"\n❌ Proceso falló: {result.get('error', 'Error desconocido')}")
            sys.exit(1)

    except KeyboardInterrupt:
        print("\n🛑 Proceso interrumpido por usuario")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Error crítico: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()