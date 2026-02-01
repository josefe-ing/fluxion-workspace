#!/usr/bin/env python3
"""
Script para recalcular las tablas cache de clasificación ABC.

Ejecuta las funciones SQL:
- recalcular_abc_cache() - ABC global por cantidad vendida
- recalcular_abc_por_tienda() - ABC por cada tienda

Se recomienda ejecutar diariamente a las 4:00 AM (después de que terminen los ETLs de ventas del día anterior).

Uso:
    python recalcular_abc_cache.py [--dias 30] [--solo-global]

Diciembre 2025
"""

import os
import sys
import argparse
import logging
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


def recalcular_abc_cache(dias: int = 30, incluir_por_tienda: bool = True):
    """
    Recalcular las tablas cache de clasificación ABC.

    Args:
        dias: Período de análisis en días (default: 30)
        incluir_por_tienda: Si True, también recalcula ABC por tienda
    """
    conn = None
    try:
        conn = get_postgres_connection()
        cursor = conn.cursor()

        # Obtener producto excluido de configuración
        cursor.execute("""
            SELECT valor FROM config_generadores_trafico
            WHERE parametro = 'producto_excluido_bolsas'
        """)
        row = cursor.fetchone()
        producto_excluido = row['valor'] if row else '003760'

        # Obtener umbrales ABC de configuración (ranking)
        cursor.execute("""
            SELECT parametro, valor_numerico
            FROM config_inventario_global
            WHERE categoria = 'abc_umbrales_ranking'
        """)
        umbrales = {row['parametro']: int(row['valor_numerico']) for row in cursor.fetchall()}
        umbral_a = umbrales.get('umbral_a', 50)
        umbral_b = umbrales.get('umbral_b', 200)
        umbral_c = umbrales.get('umbral_c', 800)

        # Obtener umbrales Pareto
        cursor.execute("""
            SELECT parametro, valor_numerico
            FROM config_inventario_global
            WHERE categoria = 'abc_umbrales_pareto' AND activo = true
        """)
        pareto = {row['parametro']: float(row['valor_numerico']) for row in cursor.fetchall()}
        pareto_a_pct = pareto.get('umbral_a_pct', 80)
        pareto_b_pct = pareto.get('umbral_b_pct', 95)

        # Obtener modelo activo
        cursor.execute("""
            SELECT valor_texto FROM config_inventario_global
            WHERE id = 'abc_modelo_activo'
        """)
        row_modelo = cursor.fetchone()
        modelo_activo = row_modelo['valor_texto'] if row_modelo else 'ranking_volumen'

        logger.info(
            f"Configuración: dias={dias}, umbrales=A:{umbral_a}, B:{umbral_b}, C:{umbral_c}, "
            f"pareto={pareto_a_pct}/{pareto_b_pct}%, modelo={modelo_activo}, excluido={producto_excluido}"
        )

        # 1. Recalcular ABC GLOBAL
        logger.info("Recalculando ABC cache global...")
        inicio_global = datetime.now()

        cursor.execute(
            "SELECT * FROM recalcular_abc_cache(%s, %s, %s, %s, %s, %s, %s, %s)",
            (dias, producto_excluido, umbral_a, umbral_b, umbral_c,
             pareto_a_pct, pareto_b_pct, modelo_activo)
        )
        result_global = cursor.fetchone()

        tiempo_global = (datetime.now() - inicio_global).total_seconds()
        logger.info(
            f"ABC GLOBAL completado: {result_global['productos_procesados']} productos "
            f"(A:{result_global['productos_a']}, B:{result_global['productos_b']}, "
            f"C:{result_global['productos_c']}, D:{result_global['productos_d']}) "
            f"en {tiempo_global:.1f}s"
        )

        # 2. Recalcular ABC POR TIENDA
        tiendas_procesadas = 0
        productos_por_tienda = 0

        if incluir_por_tienda:
            logger.info("Recalculando ABC cache por tienda...")
            inicio_tienda = datetime.now()

            cursor.execute(
                "SELECT * FROM recalcular_abc_por_tienda(%s, %s, %s, %s, %s, %s, %s, %s)",
                (dias, producto_excluido, umbral_a, umbral_b, umbral_c,
                 pareto_a_pct, pareto_b_pct, modelo_activo)
            )
            result_tienda = cursor.fetchone()

            tiendas_procesadas = result_tienda['tiendas_procesadas']
            productos_por_tienda = result_tienda['productos_procesados']
            tiempo_tienda = (datetime.now() - inicio_tienda).total_seconds()

            logger.info(
                f"ABC POR TIENDA completado: {productos_por_tienda} productos "
                f"en {tiendas_procesadas} tiendas en {tiempo_tienda:.1f}s"
            )

        conn.commit()
        cursor.close()

        logger.info("=" * 60)
        logger.info("RECÁLCULO ABC COMPLETADO EXITOSAMENTE")
        logger.info(f"  - Modelo activo: {modelo_activo}")
        logger.info(f"  - Productos globales: {result_global['productos_procesados']}")
        logger.info(f"  - Productos por tienda: {productos_por_tienda}")
        logger.info(f"  - Tiendas procesadas: {tiendas_procesadas}")
        logger.info("=" * 60)

        return True

    except Exception as e:
        logger.error(f"Error recalculando ABC cache: {e}")
        if conn:
            conn.rollback()
        raise

    finally:
        if conn:
            conn.close()


def main():
    parser = argparse.ArgumentParser(
        description='Recalcular tablas cache de clasificación ABC'
    )
    parser.add_argument(
        '--dias',
        type=int,
        default=30,
        help='Período de análisis en días (default: 30)'
    )
    parser.add_argument(
        '--solo-global',
        action='store_true',
        help='Solo recalcular ABC global, no por tienda'
    )

    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("INICIANDO RECÁLCULO DE ABC CACHE")
    logger.info(f"Fecha: {datetime.now().isoformat()}")
    logger.info(f"Días de análisis: {args.dias}")
    logger.info(f"Incluir por tienda: {not args.solo_global}")
    logger.info("=" * 60)

    try:
        recalcular_abc_cache(
            dias=args.dias,
            incluir_por_tienda=not args.solo_global
        )
        sys.exit(0)
    except Exception as e:
        logger.error(f"Error fatal: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
