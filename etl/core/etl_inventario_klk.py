#!/usr/bin/env python3
"""
ETL de Inventario para Sistema KLK - La Granja Mercado
Extrae, transforma y carga datos de inventario desde API KLK a DuckDB

Tiendas KLK:
- PERIFERICO (tienda_01)
- BOSQUE (tienda_08)

Autor: ETL Team
Fecha: 2025-01-17
"""

import sys
import argparse
from pathlib import Path
from typing import List, Dict
from datetime import datetime
import logging
import pandas as pd

# Agregar el directorio core al path para imports
sys.path.insert(0, str(Path(__file__).parent))

# Imports relativos dentro de core/
try:
    from extractor_inventario_klk import InventarioKLKExtractor, KLKAPIConfig
    from transformer_inventario_klk import InventarioKLKTransformer
    from loader import DuckDBLoader
    from tiendas_config import get_tiendas_klk, get_tienda_config
    from config import ETLConfig
except ImportError:
    from core.extractor_inventario_klk import InventarioKLKExtractor, KLKAPIConfig
    from core.transformer_inventario_klk import InventarioKLKTransformer
    from core.loader import DuckDBLoader
    from core.tiendas_config import get_tiendas_klk, get_tienda_config
    from core.config import ETLConfig


class ETLInventarioKLK:
    """Orquestador del ETL de inventario KLK"""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.logger = self._setup_logger()

        # Componentes del ETL
        self.extractor = InventarioKLKExtractor()
        self.transformer = InventarioKLKTransformer()
        self.loader = DuckDBLoader() if not dry_run else None

        # Estadísticas
        self.stats = {
            'tiendas_procesadas': 0,
            'tiendas_exitosas': 0,
            'tiendas_fallidas': 0,
            'total_productos_extraidos': 0,
            'total_productos_cargados': 0,
            'total_stock_cargado': 0,
            'inicio': datetime.now(),
            'fin': None,
            'duracion_segundos': 0
        }

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger principal del ETL"""
        logger = logging.getLogger('etl_inventario_klk')
        logger.setLevel(logging.INFO)

        # Handler para archivo
        log_file = ETLConfig.LOG_DIR / f"etl_inventario_klk_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
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

    def procesar_tienda(self, config) -> bool:
        """
        Procesa una tienda individual: extrae, transforma y carga

        Returns:
            True si exitoso, False si falló
        """
        tienda_id = config.ubicacion_id
        tienda_nombre = config.ubicacion_nombre

        self.logger.info(f"\n{'='*80}")
        self.logger.info(f"🏪 PROCESANDO: {tienda_nombre} ({tienda_id})")
        self.logger.info(f"{'='*80}")

        try:
            # PASO 1: EXTRACCIÓN
            self.logger.info(f"\n📡 PASO 1/3: Extrayendo inventario desde KLK API...")
            df_raw = self.extractor.extract_inventario_data(config)

            if df_raw is None or df_raw.empty:
                self.logger.error(f"❌ No se pudo extraer inventario de {tienda_nombre}")
                return False

            self.logger.info(f"✅ Extraídos {len(df_raw):,} productos")
            self.stats['total_productos_extraidos'] += len(df_raw)

            # PASO 2: TRANSFORMACIÓN
            self.logger.info(f"\n🔄 PASO 2/3: Transformando datos al esquema DuckDB...")
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

            # PASO 3: CARGA
            if self.dry_run:
                self.logger.info(f"\n⚠️  DRY RUN: Saltando carga a DuckDB")
                self.logger.info(f"   Productos a cargar: {len(df_productos):,}")
                self.logger.info(f"   Stock a cargar: {len(df_stock):,}")
            else:
                self.logger.info(f"\n💾 PASO 3/3: Cargando datos a DuckDB...")

                # PASO 3A: Cargar productos primero (necesario por FK de stock_actual)
                productos_cargados = self._cargar_productos(df_productos)
                self.logger.info(f"   ✅ Productos cargados: {productos_cargados:,}")
                self.stats['total_productos_cargados'] += productos_cargados

                # PASO 3B: Cargar stock actual
                result_stock = self.loader.update_stock_actual_table(df_stock)
                records_updated = result_stock.get('records_updated', 0)
                self.logger.info(f"   ✅ Stock cargado: {records_updated:,}")
                self.stats['total_stock_cargado'] += records_updated

            self.logger.info(f"\n✅ {tienda_nombre} procesada exitosamente")
            return True

        except Exception as e:
            self.logger.error(f"❌ Error procesando {tienda_nombre}: {e}", exc_info=True)
            return False

    def ejecutar(self, tienda_ids: List[str] = None) -> bool:
        """
        Ejecuta el ETL para tiendas KLK

        Args:
            tienda_ids: Lista de IDs de tiendas a procesar. Si None, procesa todas las tiendas KLK

        Returns:
            True si todas las tiendas se procesaron exitosamente
        """
        self.logger.info(f"\n{'#'*80}")
        self.logger.info(f"# ETL INVENTARIO KLK - INICIO")
        self.logger.info(f"# Fecha: {self.stats['inicio'].strftime('%Y-%m-%d %H:%M:%S')}")
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
            self.logger.info(f"   - {config.ubicacion_nombre} ({tienda_id}) - Almacén: {config.codigo_almacen_klk}")

        # Procesar cada tienda
        for tienda_id, config in tiendas_klk.items():
            self.stats['tiendas_procesadas'] += 1

            exitoso = self.procesar_tienda(config)

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
        self.logger.info(f"# ETL INVENTARIO KLK - RESUMEN")
        self.logger.info(f"{'#'*80}")
        self.logger.info(f"\n📊 ESTADÍSTICAS:")
        self.logger.info(f"   Tiendas procesadas:     {self.stats['tiendas_procesadas']}")
        self.logger.info(f"   Tiendas exitosas:       {self.stats['tiendas_exitosas']} ✅")
        self.logger.info(f"   Tiendas fallidas:       {self.stats['tiendas_fallidas']} ❌")
        self.logger.info(f"   Productos extraídos:    {self.stats['total_productos_extraidos']:,}")

        if not self.dry_run:
            self.logger.info(f"   Productos cargados:     {self.stats['total_productos_cargados']:,}")
            self.logger.info(f"   Stock cargado:          {self.stats['total_stock_cargado']:,}")

        self.logger.info(f"\n⏱️  TIEMPO:")
        self.logger.info(f"   Inicio:   {self.stats['inicio'].strftime('%Y-%m-%d %H:%M:%S')}")
        self.logger.info(f"   Fin:      {self.stats['fin'].strftime('%Y-%m-%d %H:%M:%S')}")
        self.logger.info(f"   Duración: {self.stats['duracion_segundos']:.2f} segundos")

        if self.stats['tiendas_fallidas'] == 0:
            self.logger.info(f"\n✅ ETL COMPLETADO EXITOSAMENTE")
        else:
            self.logger.warning(f"\n⚠️  ETL COMPLETADO CON ERRORES")

        self.logger.info(f"{'#'*80}\n")

    def _cargar_productos(self, df_productos: pd.DataFrame) -> int:
        """
        Carga productos a DuckDB de forma idempotente

        Estrategia:
        1. Insertar solo productos nuevos (que no existen por codigo)
        2. Ignorar productos existentes (ON CONFLICT DO NOTHING)
        3. Para productos existentes con stock_actual FK refs, saltar actualización

        Returns:
            Número de productos cargados
        """
        try:
            conn = self.loader.get_connection()

            # Registrar DataFrame temporalmente
            conn.register('productos_temp', df_productos)

            # Insertar solo productos nuevos (que no existen)
            # Productos que ya existen se ignoran automáticamente
            conn.execute("""
                INSERT INTO productos
                (id, codigo, codigo_barras,
                 descripcion,
                 categoria, grupo, subgrupo,
                 marca, modelo, presentacion,
                 costo_promedio, precio_venta,
                 stock_minimo, stock_maximo,
                 activo, es_perecedero, dias_vencimiento,
                 created_at, updated_at,
                 conjunto_sustituible)
                SELECT
                    temp.id, temp.codigo, temp.codigo_barras,
                    temp.descripcion,
                    temp.categoria, temp.grupo, temp.subgrupo,
                    temp.marca, temp.modelo, temp.presentacion,
                    temp.costo_promedio, temp.precio_venta,
                    temp.stock_minimo, temp.stock_maximo,
                    temp.activo, temp.es_perecedero, temp.dias_vencimiento,
                    temp.created_at, temp.updated_at,
                    temp.conjunto_sustituible
                FROM productos_temp temp
                WHERE NOT EXISTS (
                    SELECT 1 FROM productos p WHERE p.codigo = temp.codigo
                )
            """)

            # Intentar actualizar productos existentes SIN stock_actual referencias
            # Si falla por FK, simplemente continuar
            try:
                conn.execute("""
                    UPDATE productos
                    SET
                        codigo_barras = temp.codigo_barras,
                        descripcion = temp.descripcion,
                        categoria = temp.categoria,
                        grupo = temp.grupo,
                        subgrupo = temp.subgrupo,
                        marca = temp.marca,
                        modelo = temp.modelo,
                        presentacion = temp.presentacion,
                        costo_promedio = temp.costo_promedio,
                        precio_venta = temp.precio_venta,
                        stock_minimo = temp.stock_minimo,
                        stock_maximo = temp.stock_maximo,
                        activo = temp.activo,
                        es_perecedero = temp.es_perecedero,
                        dias_vencimiento = temp.dias_vencimiento,
                        updated_at = temp.updated_at,
                        conjunto_sustituible = temp.conjunto_sustituible
                    FROM productos_temp temp
                    WHERE productos.codigo = temp.codigo
                      AND NOT EXISTS (
                          SELECT 1 FROM stock_actual sa WHERE sa.producto_id = productos.id
                      )
                """)
            except Exception as e_update:
                # Si falla actualización por FK, log pero continuar
                self.logger.debug(f"   ⚠️  No se pudieron actualizar algunos productos (tienen stock_actual): {str(e_update)[:100]}")

            conn.close()
            return len(df_productos)

        except Exception as e:
            self.logger.error(f"❌ Error cargando productos: {e}")
            return 0

    def cerrar(self):
        """Cierra conexiones y recursos"""
        if self.extractor:
            self.extractor.close()

        # DuckDBLoader no necesita close() explícito
        # Las conexiones se cierran automáticamente


def main():
    """Función principal - CLI"""
    parser = argparse.ArgumentParser(
        description='ETL de Inventario para tiendas con sistema KLK',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos de uso:

  # Procesar todas las tiendas KLK
  python etl_inventario_klk.py

  # Procesar solo PERIFERICO
  python etl_inventario_klk.py --tiendas tienda_01

  # Procesar PERIFERICO y BOSQUE
  python etl_inventario_klk.py --tiendas tienda_01 tienda_08

  # Modo dry-run (sin cargar a DB)
  python etl_inventario_klk.py --dry-run

  # Procesar con logging en modo DEBUG
  python etl_inventario_klk.py --verbose
        """
    )

    parser.add_argument(
        '--tiendas',
        nargs='+',
        help='IDs de tiendas específicas a procesar (ej: tienda_01 tienda_08)'
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

    # Crear y ejecutar ETL
    etl = ETLInventarioKLK(dry_run=args.dry_run)

    try:
        exitoso = etl.ejecutar(tienda_ids=args.tiendas)

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
