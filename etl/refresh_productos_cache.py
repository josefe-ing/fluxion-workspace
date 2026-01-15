#!/usr/bin/env python3
"""
Script para refrescar la tabla productos_analisis_cache.

Ejecuta la función SQL refresh_productos_analisis_cache() que recalcula
estados, clasificación ABC y métricas de todos los productos.

La función incluye:
- Advisory lock para evitar ejecuciones simultáneas
- Timeout de 5 minutos

Se recomienda ejecutar cada 6 horas: 5:00, 11:00, 17:00, 23:00 (hora Venezuela)

Uso:
    python refresh_productos_cache.py

Enero 2026
"""

import os
import sys
import logging
import time
from datetime import datetime

import psycopg2
from psycopg2.extras import RealDictCursor

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


def get_postgres_connection():
    """Obtener conexión a PostgreSQL desde variables de entorno."""
    return psycopg2.connect(
        host=os.environ.get('POSTGRES_HOST', 'localhost'),
        port=int(os.environ.get('POSTGRES_PORT', 5432)),
        database=os.environ.get('POSTGRES_DB', 'fluxion_production'),
        user=os.environ.get('POSTGRES_USER', 'fluxion'),
        password=os.environ.get('POSTGRES_PASSWORD', ''),
        cursor_factory=RealDictCursor
    )


def refresh_productos_cache():
    """
    Ejecutar refresh de productos_analisis_cache.

    La función SQL tiene advisory lock integrado, por lo que si ya está
    corriendo en otro proceso, esta ejecución se saltará automáticamente.
    """
    conn = None
    start_time = time.time()

    try:
        logger.info("🔄 Conectando a PostgreSQL...")
        conn = get_postgres_connection()
        cursor = conn.cursor()

        # Establecer timeout de 10 minutos para la sesión
        cursor.execute("SET statement_timeout = '600000'")  # 10 min en ms

        logger.info("🔄 Ejecutando refresh_productos_analisis_cache()...")
        cursor.execute("SELECT refresh_productos_analisis_cache()")
        conn.commit()

        # Verificar resultado
        cursor.execute("SELECT COUNT(*) as total, MAX(updated_at) as ultima FROM productos_analisis_cache")
        result = cursor.fetchone()

        elapsed = time.time() - start_time

        logger.info(f"✅ Cache refrescada exitosamente en {elapsed:.1f}s")
        logger.info(f"   Productos en cache: {result['total']}")
        logger.info(f"   Última actualización: {result['ultima']}")

        cursor.close()
        return True

    except psycopg2.Error as e:
        elapsed = time.time() - start_time
        logger.error(f"❌ Error refrescando cache después de {elapsed:.1f}s: {e}")
        if conn:
            conn.rollback()
        return False

    finally:
        if conn:
            conn.close()


def main():
    """Entry point principal."""
    logger.info("=" * 60)
    logger.info("REFRESH PRODUCTOS ANÁLISIS CACHE")
    logger.info(f"Inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 60)

    success = refresh_productos_cache()

    logger.info("=" * 60)
    logger.info(f"Fin: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"Resultado: {'✅ ÉXITO' if success else '❌ ERROR'}")
    logger.info("=" * 60)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
