#!/usr/bin/env python3
"""
Cargador de datos de ventas para ETL - La Granja Mercado
PostgreSQL only - DuckDB removed (Dec 2025)
"""

import pandas as pd
from typing import Dict, Any
from datetime import datetime
import logging
from pathlib import Path

from config import ETLConfig


class VentasLoader:
    """Cargador especializado para datos de ventas - PostgreSQL"""

    def __init__(self):
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_ventas_loader')
        logger.setLevel(logging.INFO)

        if not logger.handlers:
            log_file = ETLConfig.LOG_DIR / f"ventas_loader_{datetime.now().strftime('%Y%m%d')}.log"
            handler = logging.FileHandler(log_file)
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            logger.addHandler(handler)

        return logger

    def load_ventas_postgresql(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Carga datos de ventas en PostgreSQL

        Args:
            df: DataFrame con datos de ventas transformados

        Returns:
            Dict con resultados de la carga
        """
        if df.empty:
            return {
                "success": False,
                "message": "DataFrame vacío",
                "records_loaded": 0
            }

        # Import PostgreSQL connection at runtime
        try:
            from db_manager import get_postgres_connection
        except ImportError:
            self.logger.error("❌ No se pudo importar get_postgres_connection")
            return {
                "success": False,
                "message": "Error importando db_manager",
                "records_loaded": 0
            }

        self.logger.info(f"📦 Preparando carga de {len(df):,} registros de ventas a PostgreSQL")

        # 1. RENOMBRAR CAMPOS para match con PostgreSQL v2.0
        df_prep = df.copy()
        if 'codigo_producto' in df_prep.columns:
            df_prep['producto_id'] = df_prep['codigo_producto']

        # Mapear fecha a 'fecha_venta'
        if 'fecha_venta' not in df_prep.columns:
            if 'fecha_hora_completa' in df_prep.columns:
                df_prep['fecha_venta'] = df_prep['fecha_hora_completa']
            elif 'fecha' in df_prep.columns:
                df_prep['fecha_venta'] = df_prep['fecha']

        # Construir numero_factura_unico incluyendo linea
        if 'linea' in df_prep.columns:
            df_prep['numero_factura'] = df_prep.apply(
                lambda row: f"{row['ubicacion_id']}_{row['numero_factura']}_L{int(row.get('linea', 0))}",
                axis=1
            )
            self.logger.info(f"   📝 Generado numero_factura único con linea")
        else:
            df_prep['numero_factura'] = df_prep.apply(
                lambda row: f"{row['ubicacion_id']}_{row['numero_factura']}_L{row.name}",
                axis=1
            )
            self.logger.info(f"   📝 Generado numero_factura único con índice")

        # 2. AGREGAR CAMPOS FALTANTES con defaults
        if 'peso_calculado' not in df_prep.columns:
            df_prep['peso_calculado'] = 0.0
        if 'total_cantidad_por_unidad_medida' not in df_prep.columns:
            df_prep['total_cantidad_por_unidad_medida'] = None

        self.logger.info(f"   📊 DataFrame preparado: {len(df_prep):,} filas")

        # 3. SINCRONIZAR UBICACIONES Y PRODUCTOS
        try:
            with get_postgres_connection() as pg_conn:
                cursor = pg_conn.cursor()

                # Sincronizar ubicaciones únicas
                ubicaciones_unicas = df_prep['ubicacion_id'].unique()
                for ubicacion_id in ubicaciones_unicas:
                    from tiendas_config import TIENDAS_CONFIG
                    tienda_config = TIENDAS_CONFIG.get(ubicacion_id, None)
                    ubicacion_nombre = tienda_config.ubicacion_nombre if tienda_config else ubicacion_id.replace('_', ' ').upper()
                    ubicacion_tipo = tienda_config.tipo if tienda_config and hasattr(tienda_config, 'tipo') else ('cedi' if 'cedi' in ubicacion_id.lower() else 'tienda')
                    cursor.execute("""
                        INSERT INTO ubicaciones (id, nombre, tipo, activo)
                        VALUES (%s, %s, %s, TRUE)
                        ON CONFLICT (id) DO NOTHING
                    """, (ubicacion_id, ubicacion_nombre, ubicacion_tipo))

                # Sincronizar productos únicos
                productos_unicos = df_prep['producto_id'].unique()
                for producto_id in productos_unicos:
                    nombre_producto = f'Producto {producto_id}'
                    cursor.execute("""
                        INSERT INTO productos (id, codigo, nombre, descripcion, activo)
                        VALUES (%s, %s, %s, %s, TRUE)
                        ON CONFLICT (codigo) DO NOTHING
                    """, (producto_id, producto_id, nombre_producto, nombre_producto))

                pg_conn.commit()
                self.logger.info(f"✅ Sincronizadas {len(ubicaciones_unicas)} ubicaciones y {len(productos_unicos)} productos")

        except Exception as e:
            self.logger.error(f"❌ Error sincronizando ubicaciones/productos: {e}")
            return {
                "success": False,
                "message": f"Error sincronizando: {str(e)}",
                "records_loaded": 0
            }

        # 4. INSERTAR VENTAS
        records_loaded = 0
        errors = 0
        total_rows = len(df_prep)
        self.logger.info(f"📝 Iniciando inserción de {total_rows:,} registros a PostgreSQL...")

        try:
            with get_postgres_connection() as pg_conn:
                cursor = pg_conn.cursor()

                for idx, row in df_prep.iterrows():
                    try:
                        cursor.execute("""
                            INSERT INTO ventas (
                                numero_factura,
                                fecha_venta,
                                ubicacion_id,
                                almacen_codigo,
                                almacen_nombre,
                                producto_id,
                                cantidad_vendida,
                                peso_unitario,
                                peso_calculado,
                                total_cantidad_por_unidad_medida,
                                unidad_medida_venta,
                                factor_unidad_medida,
                                precio_unitario,
                                costo_unitario,
                                venta_total,
                                costo_total,
                                utilidad_bruta,
                                margen_bruto_pct
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (numero_factura) DO NOTHING
                        """, (
                            row.get('numero_factura'),
                            row.get('fecha_venta'),
                            row['ubicacion_id'],
                            row.get('almacen_codigo'),
                            row.get('almacen_nombre'),
                            row['producto_id'],
                            row.get('cantidad_vendida', 0),
                            row.get('peso_unitario', 0),
                            row.get('peso_calculado', 0),
                            row.get('total_cantidad_por_unidad_medida'),
                            row.get('unidad_medida_venta'),
                            row.get('factor_unidad_medida', 1),
                            row.get('precio_unitario'),
                            row.get('costo_unitario'),
                            row.get('venta_total'),
                            row.get('costo_total'),
                            row.get('utilidad_bruta'),
                            row.get('margen_bruto_pct')
                        ))
                        records_loaded += 1

                        if records_loaded % 1000 == 0:
                            pg_conn.commit()
                            self.logger.info(f"   💾 Commit: {records_loaded:,} registros cargados...")

                    except Exception as e:
                        if errors < 3:
                            self.logger.error(f"❌ Error en registro {idx}: {str(e)}")
                        errors += 1
                        if errors > 10:
                            self.logger.error(f"⚠️ Demasiados errores ({errors}), deteniendo carga.")
                            break

                pg_conn.commit()
                self.logger.info(f"✅ Carga completada: {records_loaded:,} registros, {errors} errores")

                # Refresh materialized views for performance
                if records_loaded > 0:
                    self._refresh_materialized_views(pg_conn)

        except Exception as e:
            self.logger.error(f"❌ Error cargando ventas a PostgreSQL: {str(e)}")
            return {
                "success": False,
                "message": f"Error en carga: {str(e)}",
                "records_loaded": records_loaded
            }

        # Determinar resultado
        error_threshold = max(100, int(total_rows * 0.01))
        success = records_loaded > 0 and (errors == 0 or errors <= error_threshold)

        if records_loaded == 0 and errors > 0:
            message = f"Carga fallida: {errors} errores"
        elif records_loaded == 0:
            message = "0 registros insertados (posibles duplicados)"
        elif errors > 0:
            message = f"Carga parcial: {records_loaded:,} registros, {errors} errores"
        else:
            message = f"Carga exitosa: {records_loaded:,} registros"

        return {
            "success": success,
            "message": message,
            "records_loaded": records_loaded,
            "duplicates_skipped": total_rows - records_loaded - errors,
            "errors": errors
        }

    def _refresh_materialized_views(self, conn) -> None:
        """
        Refresh materialized views after ventas load.
        Uses CONCURRENTLY to avoid blocking reads.
        """
        views_to_refresh = [
            'mv_ventas_summary',  # Summary by ubicacion for /api/ventas/summary
        ]

        for view_name in views_to_refresh:
            try:
                cursor = conn.cursor()
                # Check if view exists
                cursor.execute("""
                    SELECT 1 FROM pg_matviews WHERE matviewname = %s
                """, (view_name,))

                if cursor.fetchone():
                    self.logger.info(f"🔄 Refreshing materialized view: {view_name}")
                    # CONCURRENTLY allows reads during refresh (requires unique index)
                    cursor.execute(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {view_name}")
                    conn.commit()
                    self.logger.info(f"✅ Refreshed {view_name}")
                else:
                    self.logger.warning(f"⚠️ Materialized view {view_name} not found, skipping refresh")

                cursor.close()
            except Exception as e:
                self.logger.error(f"❌ Error refreshing {view_name}: {e}")
                # Don't fail the whole ETL if view refresh fails
                conn.rollback()
