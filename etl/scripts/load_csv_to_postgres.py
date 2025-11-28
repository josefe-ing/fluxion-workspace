#!/usr/bin/env python3
"""
=============================================================================
CARGA DE CSVs HISTORICOS A POSTGRESQL
=============================================================================
Script para cargar CSVs extraidos de Stellar (via DataGrip) a PostgreSQL.

Uso:
    # Cargar un CSV especifico
    python load_csv_to_postgres.py --file ventas_tienda_02_202411.csv --tienda tienda_02

    # Cargar todos los CSVs de un directorio
    python load_csv_to_postgres.py --dir ./staging/

    # Preview sin cargar
    python load_csv_to_postgres.py --file ventas.csv --tienda tienda_02 --preview

Autor: Claude + Jose
Fecha: 2024-11-27
=============================================================================
"""

import os
import sys
import argparse
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any
import time

# Agregar paths necesarios
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'backend'))

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

# Configurar logging
LOG_DIR = Path(__file__).parent.parent / 'logs'
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-8s | %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / f"load_csv_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('load_csv')


class CSVToPostgresLoader:
    """Cargador de CSVs a PostgreSQL"""

    # Mapeo de columnas CSV (Stellar) -> PostgreSQL
    COLUMN_MAPPING = {
        # Columnas que vienen del query Stellar
        'numero_factura': 'numero_factura_raw',
        'fecha': 'fecha',
        'hora': 'hora',
        'linea': 'linea',
        'codigo_producto': 'producto_id',
        'descripcion_producto': 'descripcion',
        'cantidad_vendida': 'cantidad_vendida',
        'peso_unitario': 'peso_unitario',
        'costo_unitario': 'costo_unitario',
        'precio_unitario': 'precio_unitario',
        'costo_total': 'costo_total',
        'venta_total': 'venta_total',
        'utilidad_bruta': 'utilidad_bruta',
    }

    def __init__(self, postgres_dsn: str = None):
        self.postgres_dsn = postgres_dsn or self._build_postgres_dsn()

    def _build_postgres_dsn(self) -> str:
        """Construye DSN de PostgreSQL desde variables de entorno"""
        host = os.getenv('POSTGRES_HOST', 'localhost')
        port = os.getenv('POSTGRES_PORT', '5432')
        db = os.getenv('POSTGRES_DB', 'fluxion_production')
        user = os.getenv('POSTGRES_USER', 'fluxion')
        password = os.getenv('POSTGRES_PASSWORD', 'fluxion_dev_2025')
        return f"postgresql://{user}:{password}@{host}:{port}/{db}"

    def load_csv(self,
                 csv_path: str,
                 tienda_id: str,
                 preview_only: bool = False,
                 batch_size: int = 5000) -> Dict[str, Any]:
        """
        Carga un CSV a PostgreSQL.

        Args:
            csv_path: Ruta al archivo CSV
            tienda_id: ID de la tienda (ej: tienda_02)
            preview_only: Solo mostrar preview, no cargar
            batch_size: Tamano del batch para insert

        Returns:
            Dict con resultado
        """
        csv_path = Path(csv_path)

        if not csv_path.exists():
            logger.error(f"Archivo no encontrado: {csv_path}")
            return {"success": False, "error": "Archivo no encontrado"}

        logger.info(f"\n{'='*60}")
        logger.info(f"CARGANDO: {csv_path.name}")
        logger.info(f"Tienda: {tienda_id}")
        logger.info(f"{'='*60}")

        # Leer CSV
        logger.info(f"  📖 Leyendo CSV...")
        try:
            df = pd.read_csv(csv_path, low_memory=False)
        except Exception as e:
            logger.error(f"  ❌ Error leyendo CSV: {e}")
            return {"success": False, "error": str(e)}

        logger.info(f"  ✅ Leidos {len(df):,} registros")
        logger.info(f"  📋 Columnas: {list(df.columns)}")

        # Preview
        if preview_only:
            logger.info(f"\n  📋 PREVIEW (primeros 10 registros):")
            print(df.head(10).to_string())
            logger.info(f"\n  📊 Stats:")
            logger.info(f"     - Total registros: {len(df):,}")
            if 'numero_factura' in df.columns:
                logger.info(f"     - Facturas unicas: {df['numero_factura'].nunique():,}")
            if 'codigo_producto' in df.columns:
                logger.info(f"     - Productos unicos: {df['codigo_producto'].nunique():,}")
            if 'venta_total' in df.columns:
                logger.info(f"     - Venta total: ${df['venta_total'].sum():,.2f}")
            if 'fecha' in df.columns:
                logger.info(f"     - Rango fechas: {df['fecha'].min()} a {df['fecha'].max()}")
            return {"success": True, "preview": True, "records": len(df)}

        # Transformar datos
        logger.info(f"  🔄 Transformando datos...")
        df_transformed = self._transform_dataframe(df, tienda_id)

        # Cargar a PostgreSQL
        result = self._load_to_postgres(df_transformed, batch_size)

        return result

    def _transform_dataframe(self, df: pd.DataFrame, tienda_id: str) -> pd.DataFrame:
        """Transforma el DataFrame al formato de PostgreSQL"""

        # Crear copia para no modificar original
        df = df.copy()

        # Normalizar nombres de columnas (minusculas, sin espacios)
        df.columns = df.columns.str.lower().str.strip().str.replace(' ', '_')

        # Crear numero_factura unico (incluye tienda, linea y hora para evitar colisiones)
        if 'numero_factura' in df.columns and 'linea' in df.columns:
            # Incluir hora para diferenciar transacciones con mismo numero_factura y linea
            if 'hora' in df.columns:
                hora_clean = df['hora'].astype(str).str.replace(':', '').str.replace('.', '').str[:6]
                df['numero_factura_unico'] = (
                    df['numero_factura'].astype(str) + '_L' +
                    df['linea'].astype(str) + '_H' +
                    hora_clean + '_' + tienda_id
                )
            else:
                df['numero_factura_unico'] = (
                    df['numero_factura'].astype(str) + '_L' +
                    df['linea'].astype(str) + '_' + tienda_id
                )
        else:
            # Fallback: usar indice
            df['numero_factura_unico'] = [f"ROW_{i}_{tienda_id}" for i in range(len(df))]

        # Verificar que no haya duplicados
        duplicados = df['numero_factura_unico'].duplicated().sum()
        if duplicados > 0:
            logger.warning(f"  ⚠️ {duplicados} duplicados encontrados, agregando indice...")
            # Agregar indice para hacer unicos
            df['numero_factura_unico'] = df['numero_factura_unico'] + '_' + df.groupby('numero_factura_unico').cumcount().astype(str)

        # Crear timestamp de venta
        if 'fecha' in df.columns:
            if 'hora' in df.columns:
                # Limpiar hora (quitar microsegundos si existen)
                df['hora_clean'] = df['hora'].astype(str).str.split('.').str[0]
                df['fecha_venta'] = pd.to_datetime(
                    df['fecha'].astype(str) + ' ' + df['hora_clean'],
                    errors='coerce'
                )
            else:
                df['fecha_venta'] = pd.to_datetime(df['fecha'], errors='coerce')
        else:
            df['fecha_venta'] = datetime.now()

        # Agregar ubicacion_id
        df['ubicacion_id'] = tienda_id

        # Asegurar tipos numericos
        numeric_cols = ['cantidad_vendida', 'peso_unitario', 'costo_unitario',
                       'precio_unitario', 'costo_total', 'venta_total', 'utilidad_bruta']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # Calcular margen si no existe
        if 'venta_total' in df.columns and 'utilidad_bruta' in df.columns:
            df['margen_bruto_pct'] = df.apply(
                lambda r: round((r['utilidad_bruta'] / r['venta_total'] * 100), 2)
                if r['venta_total'] > 0 else 0,
                axis=1
            )
        else:
            df['margen_bruto_pct'] = 0

        return df

    def _load_to_postgres(self, df: pd.DataFrame, batch_size: int) -> Dict[str, Any]:
        """Carga DataFrame transformado a PostgreSQL"""

        logger.info(f"  📤 Cargando a PostgreSQL...")

        try:
            conn = psycopg2.connect(self.postgres_dsn)
            cursor = conn.cursor()

            # Preparar registros
            records = []
            for _, row in df.iterrows():
                records.append((
                    row.get('numero_factura_unico', ''),
                    row.get('fecha_venta'),
                    row.get('ubicacion_id', ''),
                    None,  # almacen_codigo
                    None,  # almacen_nombre
                    str(row.get('codigo_producto', '')),
                    float(row.get('cantidad_vendida', 0)),
                    float(row.get('peso_unitario', 0)),
                    float(row.get('peso_unitario', 0)) * float(row.get('cantidad_vendida', 0)),
                    float(row.get('cantidad_vendida', 0)),
                    'UNIDAD',
                    1.0,
                    float(row.get('precio_unitario', 0)),
                    float(row.get('costo_unitario', 0)),
                    float(row.get('venta_total', 0)),
                    float(row.get('costo_total', 0)),
                    float(row.get('utilidad_bruta', 0)),
                    float(row.get('margen_bruto_pct', 0)),
                    datetime.now()
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

            # Cargar en batches
            start_time = time.time()
            total_loaded = 0

            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                execute_values(cursor, upsert_query, batch, page_size=1000)
                conn.commit()
                total_loaded += len(batch)

                if total_loaded % 50000 == 0:
                    logger.info(f"     ... {total_loaded:,} registros cargados")

            elapsed = time.time() - start_time

            cursor.close()
            conn.close()

            logger.info(f"  ✅ Cargados {total_loaded:,} registros en {elapsed:.1f}s")
            logger.info(f"     ({total_loaded/elapsed:.0f} registros/segundo)")

            return {
                "success": True,
                "records": total_loaded,
                "elapsed_seconds": elapsed,
                "records_per_second": total_loaded/elapsed if elapsed > 0 else 0
            }

        except Exception as e:
            logger.error(f"  ❌ Error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {"success": False, "error": str(e)}

    def load_directory(self,
                       dir_path: str,
                       tienda_pattern: str = None) -> List[Dict[str, Any]]:
        """
        Carga todos los CSVs de un directorio.

        Args:
            dir_path: Ruta al directorio
            tienda_pattern: Patron para extraer tienda_id del nombre del archivo

        Returns:
            Lista de resultados
        """
        dir_path = Path(dir_path)
        csv_files = list(dir_path.glob("*.csv"))

        logger.info(f"\n{'#'*60}")
        logger.info(f"CARGA MASIVA DE DIRECTORIO")
        logger.info(f"Directorio: {dir_path}")
        logger.info(f"Archivos encontrados: {len(csv_files)}")
        logger.info(f"{'#'*60}\n")

        results = []
        for csv_file in csv_files:
            # Intentar extraer tienda_id del nombre del archivo
            # Patron esperado: ventas_tienda_02_202411.csv
            tienda_id = self._extract_tienda_from_filename(csv_file.name)

            if not tienda_id:
                logger.warning(f"  ⚠️ No se pudo extraer tienda_id de: {csv_file.name}")
                logger.warning(f"     Usa --file con --tienda para especificar manualmente")
                continue

            result = self.load_csv(str(csv_file), tienda_id)
            result["file"] = csv_file.name
            results.append(result)

        return results

    def _extract_tienda_from_filename(self, filename: str) -> Optional[str]:
        """Extrae tienda_id del nombre del archivo"""
        import re

        # Patron: tienda_XX o tienda_X
        match = re.search(r'tienda_(\d+)', filename.lower())
        if match:
            return f"tienda_{match.group(1).zfill(2)}"

        # Patron: cedi_XXX
        match = re.search(r'cedi_(\w+)', filename.lower())
        if match:
            return f"cedi_{match.group(1)}"

        return None


def main():
    parser = argparse.ArgumentParser(
        description='Cargar CSVs de ventas historicas a PostgreSQL',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  # Preview de un CSV (sin cargar)
  python load_csv_to_postgres.py --file ventas.csv --tienda tienda_02 --preview

  # Cargar un CSV
  python load_csv_to_postgres.py --file ventas_tienda_02.csv --tienda tienda_02

  # Cargar todos los CSVs de un directorio
  python load_csv_to_postgres.py --dir ./staging/

Formato esperado del CSV (columnas del query Stellar):
  numero_factura, fecha, hora, linea, codigo_producto, descripcion_producto,
  cantidad_vendida, peso_unitario, costo_unitario, precio_unitario,
  costo_total, venta_total, utilidad_bruta
        """
    )

    parser.add_argument('--file', type=str, help='Ruta al archivo CSV')
    parser.add_argument('--dir', type=str, help='Ruta al directorio con CSVs')
    parser.add_argument('--tienda', type=str, help='ID de tienda (ej: tienda_02)')
    parser.add_argument('--preview', action='store_true', help='Solo mostrar preview')
    parser.add_argument('--batch-size', type=int, default=5000, help='Tamano del batch (default: 5000)')

    args = parser.parse_args()

    if not args.file and not args.dir:
        parser.error("Debe especificar --file o --dir")

    loader = CSVToPostgresLoader()

    if args.file:
        if not args.tienda:
            # Intentar extraer del nombre
            tienda = loader._extract_tienda_from_filename(args.file)
            if not tienda:
                parser.error("Debe especificar --tienda o usar un nombre de archivo con formato tienda_XX")
            args.tienda = tienda

        result = loader.load_csv(args.file, args.tienda, args.preview, args.batch_size)
        print(f"\nResultado: {result}")

    elif args.dir:
        results = loader.load_directory(args.dir)
        print(f"\nResultados: {len(results)} archivos procesados")
        for r in results:
            status = "✅" if r.get("success") else "❌"
            print(f"  {status} {r.get('file', 'unknown')}: {r.get('records', 0):,} registros")


if __name__ == "__main__":
    main()
