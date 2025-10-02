#!/usr/bin/env python3
"""
Orquestador ETL para ubicaciones específicas
"""

import argparse
import sys
from pathlib import Path
from datetime import datetime
import logging

# Agregar el directorio actual al path
sys.path.append(str(Path(__file__).parent))

from config import ETLConfig
from extractor import SQLServerExtractor
from transformer import InventoryTransformer
from loader import DuckDBLoader

def setup_logging():
    """Configurar logging"""
    log_dir = Path(__file__).parent / "logs"
    log_dir.mkdir(exist_ok=True)

    log_file = log_dir / f"orchestrator_{datetime.now().strftime('%Y%m%d')}.log"

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    return logging.getLogger(__name__)

def run_etl_for_ubicacion(ubicacion_id: str, logger):
    """Ejecutar ETL para una ubicación específica"""

    try:
        # Obtener configuración específica
        config = ETLConfig.get_database_config(ubicacion_id)
        logger.info(f"🏪 Iniciando ETL para {config.ubicacion_nombre} ({ubicacion_id})")

        # Extractor
        logger.info("📥 Iniciando extracción...")
        extractor = SQLServerExtractor()

        query_file = "el_bosque_query_completa.sql"  # Usar query completa sin filtros restrictivos
        raw_data = extractor.extract_inventory_data(config, query_file=query_file)

        if raw_data.empty:
            logger.warning(f"❌ No se obtuvieron datos para {ubicacion_id}")
            return {"success": False, "message": "No hay datos para extraer"}

        logger.info(f"📊 Extraídos {len(raw_data)} registros")

        # Transformer
        logger.info("🔄 Iniciando transformación...")
        transformer = InventoryTransformer()
        transformed_data = transformer.transform_inventory_data(raw_data, config)

        logger.info(f"✅ Transformados {len(transformed_data)} registros")

        # Loader
        logger.info("💾 Iniciando carga...")
        loader = DuckDBLoader()
        result = loader.load_inventory_data(transformed_data)

        if result.get('success'):
            logger.info(f"🎯 ETL completado exitosamente para {config.ubicacion_nombre}")
            logger.info(f"📈 Estadísticas: {result.get('stats', {})}")

            return {
                "success": True,
                "message": f"ETL completado para {config.ubicacion_nombre}",
                "stats": result.get('stats', {}),
                "ubicacion": config.ubicacion_nombre
            }
        else:
            logger.error(f"❌ Error en carga: {result.get('message', 'Error desconocido')}")
            return {
                "success": False,
                "message": f"Error en carga: {result.get('message', 'Error desconocido')}"
            }

    except Exception as e:
        logger.error(f"💥 Error crítico en ETL para {ubicacion_id}: {str(e)}")
        return {
            "success": False,
            "message": f"Error crítico: {str(e)}"
        }

def main():
    parser = argparse.ArgumentParser(description='Orquestador ETL para ubicaciones específicas')
    parser.add_argument('--ubicacion', required=True, help='ID de la ubicación a procesar')

    args = parser.parse_args()

    logger = setup_logging()

    logger.info(f"🚀 Iniciando orquestador ETL")
    logger.info(f"📍 Ubicación objetivo: {args.ubicacion}")

    start_time = datetime.now()

    result = run_etl_for_ubicacion(args.ubicacion, logger)

    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    logger.info(f"⏱️ Duración total: {duration:.2f} segundos")

    if result['success']:
        logger.info("🎉 ETL completado exitosamente")
        print(f"SUCCESS: {result['message']}")
        sys.exit(0)
    else:
        logger.error("❌ ETL falló")
        print(f"ERROR: {result['message']}")
        sys.exit(1)

if __name__ == "__main__":
    main()