#!/usr/bin/env python3
"""
=============================================================================
EXTRACCION HISTORICA DE VENTAS - STELLAR → POSTGRESQL
=============================================================================
Script one-time para migrar historial de ventas desde SQL Server (Stellar POS)
a PostgreSQL (local y luego RDS).

Uso:
    # Probar con una tienda y un dia
    python extract_historico_stellar.py --tienda tienda_02 --fecha-inicio 2024-11-01 --fecha-fin 2024-11-01 --test

    # Extraer un mes de una tienda
    python extract_historico_stellar.py --tienda tienda_02 --fecha-inicio 2024-11-01 --fecha-fin 2024-11-30

    # Extraer todo el historico de todas las tiendas Stellar
    python extract_historico_stellar.py --all --fecha-inicio 2023-11-01 --fecha-fin 2024-11-26

Autor: Claude + Jose
Fecha: 2024-11-27
=============================================================================
"""

import os
import sys
import argparse
import logging
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Optional, Dict, List, Any
import time

# Agregar paths necesarios
sys.path.insert(0, str(Path(__file__).parent.parent / 'core'))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'backend'))

import pyodbc
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

# Importar configuraciones
from tiendas_config import (
    TIENDAS_CONFIG,
    get_tiendas_stellar,
    get_tienda_config,
    TiendaConfig
)

# Configurar logging
LOG_DIR = Path(__file__).parent.parent / 'logs'
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-8s | %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / f"historico_stellar_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('historico_stellar')

# Directorio para CSVs de staging
STAGING_DIR = Path(__file__).parent.parent.parent / 'data' / 'staging' / 'historico_stellar'


class HistoricoStellarExtractor:
    """Extractor de historico de ventas desde Stellar (SQL Server)"""

    def __init__(self, postgres_dsn: str = None):
        """
        Args:
            postgres_dsn: DSN de PostgreSQL. Si es None, usa variables de entorno.
        """
        self.postgres_dsn = postgres_dsn or self._build_postgres_dsn()
        self.staging_dir = STAGING_DIR
        self.staging_dir.mkdir(parents=True, exist_ok=True)

        # Query para extraccion (basado en query_ventas_generic.sql)
        self.query_template = self._load_query_template()

    def _build_postgres_dsn(self) -> str:
        """Construye DSN de PostgreSQL desde variables de entorno"""
        host = os.getenv('POSTGRES_HOST', 'localhost')
        port = os.getenv('POSTGRES_PORT', '5432')
        db = os.getenv('POSTGRES_DB', 'fluxion_production')
        user = os.getenv('POSTGRES_USER', 'fluxion')
        password = os.getenv('POSTGRES_PASSWORD', 'fluxion_dev_2025')
        return f"postgresql://{user}:{password}@{host}:{port}/{db}"

    def _load_query_template(self) -> str:
        """Carga el template del query SQL"""
        # Query optimizado para extraccion historica
        return """
        SELECT
            -- Identificadores de transaccion
            t.c_Numero AS numero_factura,
            CAST(t.f_Fecha AS DATE) AS fecha,
            CAST(t.h_Hora AS TIME) AS hora,
            t.n_Linea AS linea,

            -- Producto
            p.c_Codigo AS codigo_producto,
            p.c_Descri AS descripcion_producto,

            -- Cantidades
            t.Cantidad AS cantidad_vendida,
            p.n_Peso AS peso_unitario,

            -- Financiero
            p.n_CostoAct AS costo_unitario,
            p.n_Precio1 AS precio_unitario,

            -- Calculados
            ROUND(t.Cantidad * p.n_CostoAct, 2) AS costo_total,
            ROUND(t.Cantidad * p.n_Precio1, 2) AS venta_total,
            ROUND(t.Cantidad * (p.n_Precio1 - p.n_CostoAct), 2) AS utilidad_bruta

        FROM {database}.dbo.MA_TRANSACCION t
            LEFT JOIN {database}.dbo.MA_CODIGOS c ON t.Codigo = c.c_Codigo
            LEFT JOIN {database}.dbo.MA_PRODUCTOS p ON c.c_CodNasa = p.c_Codigo

        WHERE
            t.f_Fecha >= '{fecha_inicio}'
            AND t.f_Fecha <= '{fecha_fin}'
            AND p.c_Codigo IS NOT NULL

        ORDER BY
            t.f_Fecha ASC,
            t.h_Hora ASC,
            t.c_Numero ASC
        """

    def _create_connection_string(self, config: TiendaConfig) -> str:
        """Crea string de conexion para SQL Server"""
        odbc_driver = os.environ.get('SQL_ODBC_DRIVER', 'ODBC Driver 18 for SQL Server')
        return (
            f"DRIVER={{{odbc_driver}}};"
            f"SERVER={config.server_ip},{config.port};"
            f"DATABASE={config.database_name};"
            f"UID={config.username};"
            f"PWD={config.password};"
            f"TrustServerCertificate=yes;"
            f"Connection Timeout=120;"
        )

    def test_connection(self, tienda_id: str) -> bool:
        """Prueba conexion a una tienda"""
        try:
            config = get_tienda_config(tienda_id)
            conn_str = self._create_connection_string(config)

            logger.info(f"Probando conexion a {config.ubicacion_nombre} ({config.server_ip}:{config.port})...")

            conn = pyodbc.connect(conn_str, timeout=30)
            cursor = conn.cursor()
            cursor.execute("SELECT 1 AS test")
            result = cursor.fetchone()
            conn.close()

            if result and result[0] == 1:
                logger.info(f"  ✅ Conexion exitosa a {config.ubicacion_nombre}")
                return True
            return False

        except Exception as e:
            logger.error(f"  ❌ Error conectando a {tienda_id}: {e}")
            return False

    def extract_tienda(self,
                       tienda_id: str,
                       fecha_inicio: date,
                       fecha_fin: date,
                       save_csv: bool = True) -> Optional[pd.DataFrame]:
        """
        Extrae ventas de una tienda para un rango de fechas.

        Args:
            tienda_id: ID de la tienda (ej: tienda_02)
            fecha_inicio: Fecha inicial
            fecha_fin: Fecha final
            save_csv: Si guarda CSV intermedio

        Returns:
            DataFrame con las ventas o None si falla
        """
        config = get_tienda_config(tienda_id)

        logger.info(f"\n{'='*60}")
        logger.info(f"EXTRAYENDO: {config.ubicacion_nombre} ({tienda_id})")
        logger.info(f"Periodo: {fecha_inicio} a {fecha_fin}")
        logger.info(f"Server: {config.server_ip}:{config.port} | DB: {config.database_name}")
        logger.info(f"{'='*60}")

        try:
            # Conexion
            conn_str = self._create_connection_string(config)
            conn = pyodbc.connect(conn_str, timeout=120)

            # Preparar query
            query = self.query_template.format(
                database=config.database_name,
                fecha_inicio=fecha_inicio.strftime('%Y-%m-%d'),
                fecha_fin=fecha_fin.strftime('%Y-%m-%d')
            )

            logger.info(f"  📥 Ejecutando query...")
            start_time = time.time()

            # Ejecutar extraccion
            df = pd.read_sql_query(query, conn)
            conn.close()

            elapsed = time.time() - start_time
            logger.info(f"  ✅ Extraidos {len(df):,} registros en {elapsed:.1f}s")

            if df.empty:
                logger.warning(f"  ⚠️ No hay datos para el periodo especificado")
                return df

            # Agregar metadatos
            df['ubicacion_id'] = tienda_id
            df['fecha_extraccion'] = datetime.now()

            # Crear numero_factura unico (factura + linea)
            df['numero_factura_unico'] = df['numero_factura'].astype(str) + '_L' + df['linea'].astype(str) + '_' + tienda_id

            # Crear timestamp de venta
            df['fecha_venta'] = pd.to_datetime(
                df['fecha'].astype(str) + ' ' + df['hora'].astype(str).str.split('.').str[0]
            )

            # Stats
            logger.info(f"  📊 Stats:")
            logger.info(f"     - Facturas unicas: {df['numero_factura'].nunique():,}")
            logger.info(f"     - Productos unicos: {df['codigo_producto'].nunique():,}")
            logger.info(f"     - Venta total: ${df['venta_total'].sum():,.2f}")
            logger.info(f"     - Rango fechas: {df['fecha'].min()} a {df['fecha'].max()}")

            # Guardar CSV si se solicita
            if save_csv:
                csv_filename = f"ventas_{tienda_id}_{fecha_inicio.strftime('%Y%m%d')}_{fecha_fin.strftime('%Y%m%d')}.csv"
                csv_path = self.staging_dir / csv_filename
                df.to_csv(csv_path, index=False)
                logger.info(f"  💾 CSV guardado: {csv_path}")

            return df

        except pyodbc.OperationalError as e:
            logger.error(f"  ❌ Error de conexion: {e}")
            return None
        except Exception as e:
            logger.error(f"  ❌ Error inesperado: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None

    def load_to_postgres(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Carga DataFrame a PostgreSQL usando UPSERT.

        Args:
            df: DataFrame con ventas extraidas

        Returns:
            Dict con resultado de la carga
        """
        if df is None or df.empty:
            return {"success": False, "message": "DataFrame vacio", "records": 0}

        logger.info(f"\n  📤 Cargando {len(df):,} registros a PostgreSQL...")

        try:
            conn = psycopg2.connect(self.postgres_dsn)
            cursor = conn.cursor()

            # Preparar datos para insert
            records = []
            for _, row in df.iterrows():
                # Calcular margen
                venta = float(row['venta_total'] or 0)
                utilidad = float(row['utilidad_bruta'] or 0)
                margen_pct = (utilidad / venta * 100) if venta > 0 else 0

                records.append((
                    row['numero_factura_unico'],          # numero_factura (unique)
                    row['fecha_venta'],                    # fecha_venta
                    row['ubicacion_id'],                   # ubicacion_id
                    None,                                  # almacen_codigo (N/A Stellar)
                    None,                                  # almacen_nombre (N/A Stellar)
                    str(row['codigo_producto']),           # producto_id
                    float(row['cantidad_vendida'] or 0),   # cantidad_vendida
                    float(row['peso_unitario'] or 0),      # peso_unitario
                    float(row['peso_unitario'] or 0) * float(row['cantidad_vendida'] or 0),  # peso_calculado
                    float(row['cantidad_vendida'] or 0),   # total_cantidad_por_unidad_medida
                    'UNIDAD',                              # unidad_medida_venta
                    1.0,                                   # factor_unidad_medida
                    float(row['precio_unitario'] or 0),    # precio_unitario
                    float(row['costo_unitario'] or 0),     # costo_unitario
                    float(row['venta_total'] or 0),        # venta_total
                    float(row['costo_total'] or 0),        # costo_total
                    float(row['utilidad_bruta'] or 0),     # utilidad_bruta
                    round(margen_pct, 2),                  # margen_bruto_pct
                    datetime.now()                         # fecha_creacion
                ))

            # UPSERT query
            upsert_query = """
                INSERT INTO ventas (
                    numero_factura, fecha_venta, ubicacion_id, almacen_codigo, almacen_nombre,
                    producto_id, cantidad_vendida, peso_unitario, peso_calculado,
                    total_cantidad_por_unidad_medida, unidad_medida_venta, factor_unidad_medida,
                    precio_unitario, costo_unitario, venta_total, costo_total,
                    utilidad_bruta, margen_bruto_pct, fecha_creacion
                )
                VALUES %s
                ON CONFLICT (numero_factura) DO UPDATE SET
                    fecha_venta = EXCLUDED.fecha_venta,
                    cantidad_vendida = EXCLUDED.cantidad_vendida,
                    precio_unitario = EXCLUDED.precio_unitario,
                    costo_unitario = EXCLUDED.costo_unitario,
                    venta_total = EXCLUDED.venta_total,
                    costo_total = EXCLUDED.costo_total,
                    utilidad_bruta = EXCLUDED.utilidad_bruta,
                    margen_bruto_pct = EXCLUDED.margen_bruto_pct,
                    fecha_creacion = EXCLUDED.fecha_creacion
            """

            # Ejecutar batch insert
            start_time = time.time()
            execute_values(cursor, upsert_query, records, page_size=1000)
            conn.commit()
            elapsed = time.time() - start_time

            cursor.close()
            conn.close()

            logger.info(f"  ✅ Cargados {len(records):,} registros en {elapsed:.1f}s")

            return {
                "success": True,
                "message": f"{len(records)} registros cargados",
                "records": len(records),
                "elapsed_seconds": elapsed
            }

        except Exception as e:
            logger.error(f"  ❌ Error cargando a PostgreSQL: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {"success": False, "message": str(e), "records": 0}

    def extract_and_load_tienda(self,
                                 tienda_id: str,
                                 fecha_inicio: date,
                                 fecha_fin: date,
                                 save_csv: bool = True) -> Dict[str, Any]:
        """
        Extrae y carga ventas de una tienda.

        Returns:
            Dict con resultados
        """
        # Extraer
        df = self.extract_tienda(tienda_id, fecha_inicio, fecha_fin, save_csv)

        if df is None:
            return {"success": False, "tienda": tienda_id, "error": "Extraccion fallida"}

        if df.empty:
            return {"success": True, "tienda": tienda_id, "records": 0, "message": "Sin datos"}

        # Cargar a PostgreSQL
        result = self.load_to_postgres(df)
        result["tienda"] = tienda_id
        result["fecha_inicio"] = str(fecha_inicio)
        result["fecha_fin"] = str(fecha_fin)

        return result

    def extract_all_stellar(self,
                            fecha_inicio: date,
                            fecha_fin: date,
                            save_csv: bool = True) -> List[Dict[str, Any]]:
        """
        Extrae y carga ventas de TODAS las tiendas Stellar.

        Returns:
            Lista de resultados por tienda
        """
        tiendas_stellar = get_tiendas_stellar()

        logger.info(f"\n{'#'*70}")
        logger.info(f"EXTRACCION MASIVA - TODAS LAS TIENDAS STELLAR")
        logger.info(f"Tiendas a procesar: {len(tiendas_stellar)}")
        logger.info(f"Periodo: {fecha_inicio} a {fecha_fin}")
        logger.info(f"{'#'*70}\n")

        results = []
        total_records = 0

        for tienda_id, config in tiendas_stellar.items():
            try:
                result = self.extract_and_load_tienda(
                    tienda_id, fecha_inicio, fecha_fin, save_csv
                )
                results.append(result)

                if result.get("success") and result.get("records"):
                    total_records += result["records"]

            except Exception as e:
                logger.error(f"Error procesando {tienda_id}: {e}")
                results.append({
                    "success": False,
                    "tienda": tienda_id,
                    "error": str(e)
                })

        # Resumen final
        logger.info(f"\n{'#'*70}")
        logger.info(f"RESUMEN FINAL")
        logger.info(f"{'#'*70}")
        logger.info(f"Total tiendas procesadas: {len(results)}")
        logger.info(f"Exitosas: {sum(1 for r in results if r.get('success'))}")
        logger.info(f"Fallidas: {sum(1 for r in results if not r.get('success'))}")
        logger.info(f"Total registros cargados: {total_records:,}")

        return results


def main():
    """Punto de entrada principal"""
    parser = argparse.ArgumentParser(
        description='Extraccion historica de ventas Stellar → PostgreSQL',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  # Test de conexion
  python extract_historico_stellar.py --tienda tienda_02 --test-connection

  # Extraer un dia (modo test)
  python extract_historico_stellar.py --tienda tienda_02 --fecha-inicio 2024-11-01 --fecha-fin 2024-11-01 --test

  # Extraer un mes completo
  python extract_historico_stellar.py --tienda tienda_02 --fecha-inicio 2024-11-01 --fecha-fin 2024-11-30

  # Extraer todas las tiendas Stellar
  python extract_historico_stellar.py --all --fecha-inicio 2024-01-01 --fecha-fin 2024-11-26
        """
    )

    parser.add_argument('--tienda', type=str, help='ID de tienda (ej: tienda_02)')
    parser.add_argument('--all', action='store_true', help='Procesar todas las tiendas Stellar')
    parser.add_argument('--fecha-inicio', type=str, help='Fecha inicio (YYYY-MM-DD)')
    parser.add_argument('--fecha-fin', type=str, help='Fecha fin (YYYY-MM-DD)')
    parser.add_argument('--test-connection', action='store_true', help='Solo probar conexion')
    parser.add_argument('--test', action='store_true', help='Modo test (solo extrae, no carga)')
    parser.add_argument('--no-csv', action='store_true', help='No guardar CSV intermedio')
    parser.add_argument('--list-tiendas', action='store_true', help='Listar tiendas Stellar disponibles')

    args = parser.parse_args()

    # Listar tiendas
    if args.list_tiendas:
        tiendas = get_tiendas_stellar()
        print("\nTiendas Stellar disponibles:")
        print("-" * 50)
        for tid, cfg in tiendas.items():
            print(f"  {tid}: {cfg.ubicacion_nombre} ({cfg.server_ip}:{cfg.port})")
        return

    # Validar que se especificaron fechas
    if not args.fecha_inicio or not args.fecha_fin:
        parser.error("Debe especificar --fecha-inicio y --fecha-fin")

    # Parsear fechas
    fecha_inicio = datetime.strptime(args.fecha_inicio, '%Y-%m-%d').date()
    fecha_fin = datetime.strptime(args.fecha_fin, '%Y-%m-%d').date()

    # Crear extractor
    extractor = HistoricoStellarExtractor()

    # Test de conexion
    if args.test_connection:
        if args.tienda:
            extractor.test_connection(args.tienda)
        elif args.all:
            tiendas = get_tiendas_stellar()
            for tid in tiendas:
                extractor.test_connection(tid)
        return

    # Validar argumentos
    if not args.tienda and not args.all:
        parser.error("Debe especificar --tienda o --all")

    save_csv = not args.no_csv

    # Modo test (solo extrae)
    if args.test:
        if args.tienda:
            df = extractor.extract_tienda(args.tienda, fecha_inicio, fecha_fin, save_csv)
            if df is not None and not df.empty:
                print(f"\n📋 Preview de datos ({len(df)} registros):")
                print(df.head(10).to_string())
        return

    # Extraccion completa
    if args.tienda:
        result = extractor.extract_and_load_tienda(args.tienda, fecha_inicio, fecha_fin, save_csv)
        print(f"\nResultado: {result}")
    elif args.all:
        results = extractor.extract_all_stellar(fecha_inicio, fecha_fin, save_csv)
        print(f"\nResultados: {len(results)} tiendas procesadas")


if __name__ == "__main__":
    main()
