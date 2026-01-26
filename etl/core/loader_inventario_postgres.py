#!/usr/bin/env python3
"""
PostgreSQL Loader - Escritura directa a PostgreSQL
Sin DuckDB - PostgreSQL only
"""

import psycopg2
import pandas as pd
from typing import Optional, Dict, Any
from datetime import datetime
import logging
from pathlib import Path

# Importar configuración PostgreSQL desde backend
import sys
sys.path.append(str(Path(__file__).parent.parent.parent / 'backend'))
from db_config import POSTGRES_DSN

logger = logging.getLogger('etl_loader_postgres')


class PostgreSQLInventarioLoader:
    """Cargador directo a PostgreSQL - Sin DuckDB"""

    def __init__(self):
        self.dsn = POSTGRES_DSN
        self.logger = logger
        self._ensure_schema_compatibility()

    def _get_connection(self):
        """Obtiene conexión a PostgreSQL"""
        return psycopg2.connect(self.dsn)

    def _ensure_schema_compatibility(self):
        """
        Asegura que el schema de PostgreSQL tiene todas las columnas necesarias.
        Ejecuta ALTER TABLE para agregar columnas faltantes y hacer nullable
        las columnas que el ETL no usa.
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # Fix ubicaciones table
            cursor.execute("""
                DO $$
                BEGIN
                    -- Add codigo_klk column if not exists
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='ubicaciones' AND column_name='codigo_klk') THEN
                        ALTER TABLE ubicaciones ADD COLUMN codigo_klk VARCHAR(50);
                    END IF;
                    -- Make 'codigo' nullable (migration 002 created it as NOT NULL but loader doesn't use it)
                    IF EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='ubicaciones' AND column_name='codigo' AND is_nullable='NO') THEN
                        ALTER TABLE ubicaciones ALTER COLUMN codigo DROP NOT NULL;
                    END IF;
                END $$;
            """)

            # Fix productos table
            cursor.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='productos' AND column_name='nombre') THEN
                        ALTER TABLE productos ADD COLUMN nombre VARCHAR(200);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='productos' AND column_name='fecha_actualizacion') THEN
                        ALTER TABLE productos ADD COLUMN fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='productos' AND column_name='codigo_barras') THEN
                        ALTER TABLE productos ADD COLUMN codigo_barras VARCHAR(50);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='productos' AND column_name='modelo') THEN
                        ALTER TABLE productos ADD COLUMN modelo VARCHAR(100);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='productos' AND column_name='grupo_articulo') THEN
                        ALTER TABLE productos ADD COLUMN grupo_articulo VARCHAR(100);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='productos' AND column_name='subgrupo') THEN
                        ALTER TABLE productos ADD COLUMN subgrupo VARCHAR(100);
                    END IF;
                END $$;
            """)

            conn.commit()
            cursor.close()
            conn.close()
            self.logger.info("✅ Schema PostgreSQL verificado/actualizado")

        except Exception as e:
            self.logger.warning(f"⚠️ Error verificando schema (ignorable si tablas no existen aún): {e}")

    def load_productos(self, df: pd.DataFrame) -> int:
        """
        Carga productos a PostgreSQL usando UPSERT

        Mapea columnas del ETL al esquema PostgreSQL:
        - grupo → grupo_articulo
        - nombre se toma de descripcion si existe

        Args:
            df: DataFrame con columnas del ETL KLK

        Returns:
            Número de productos cargados
        """
        if df.empty:
            self.logger.warning("DataFrame de productos vacío")
            return 0

        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # Preparar datos para batch insert
            batch_data = []
            for _, row in df.iterrows():
                nombre = row.get('nombre') or row.get('descripcion', '')
                codigo = row.get('codigo')
                batch_data.append((
                    codigo,  # id
                    codigo,  # codigo
                    row.get('codigo_barras'),
                    nombre,
                    row.get('descripcion'),
                    row.get('marca'),
                    row.get('modelo'),
                    row.get('categoria'),
                    row.get('grupo'),  # Mapeado a grupo_articulo
                    row.get('subgrupo'),
                    row.get('activo', True),
                    row.get('updated_at', datetime.now())
                ))

            # De-duplicar por codigo (índice 1)
            seen = {}
            for record in batch_data:
                seen[record[1]] = record
            batch_data = list(seen.values())

            # Batch insert con execute_values
            from psycopg2.extras import execute_values
            batch_upsert_query = """
                INSERT INTO productos (
                    id, codigo, codigo_barras, nombre, descripcion, marca, modelo,
                    categoria, grupo_articulo, subgrupo, activo, fecha_actualizacion
                )
                VALUES %s
                ON CONFLICT (codigo) DO UPDATE SET
                    id = EXCLUDED.id,
                    codigo_barras = EXCLUDED.codigo_barras,
                    nombre = EXCLUDED.nombre,
                    descripcion = EXCLUDED.descripcion,
                    marca = EXCLUDED.marca,
                    modelo = EXCLUDED.modelo,
                    categoria = EXCLUDED.categoria,
                    grupo_articulo = EXCLUDED.grupo_articulo,
                    subgrupo = EXCLUDED.subgrupo,
                    activo = EXCLUDED.activo,
                    fecha_actualizacion = EXCLUDED.fecha_actualizacion
            """

            # Query individual para fallback
            individual_query = """
                INSERT INTO productos (
                    id, codigo, codigo_barras, nombre, descripcion, marca, modelo,
                    categoria, grupo_articulo, subgrupo, activo, fecha_actualizacion
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (codigo) DO UPDATE SET
                    id = EXCLUDED.id,
                    codigo_barras = EXCLUDED.codigo_barras,
                    nombre = EXCLUDED.nombre,
                    descripcion = EXCLUDED.descripcion,
                    marca = EXCLUDED.marca,
                    modelo = EXCLUDED.modelo,
                    categoria = EXCLUDED.categoria,
                    grupo_articulo = EXCLUDED.grupo_articulo,
                    subgrupo = EXCLUDED.subgrupo,
                    activo = EXCLUDED.activo,
                    fecha_actualizacion = EXCLUDED.fecha_actualizacion
            """

            try:
                execute_values(cursor, batch_upsert_query, batch_data, page_size=1000)
                records_loaded = len(batch_data)
            except Exception as e:
                self.logger.error(f"Error en batch insert productos: {e}")
                conn.rollback()
                # Fallback individual
                records_loaded = 0
                for record in batch_data:
                    try:
                        cursor.execute(individual_query, record)
                        records_loaded += 1
                    except Exception:
                        pass

            conn.commit()
            cursor.close()
            conn.close()

            self.logger.info(f"✅ {records_loaded} productos cargados a PostgreSQL")
            return records_loaded

        except Exception as e:
            self.logger.error(f"❌ Error cargando productos: {e}")
            return 0

    def load_stock(self, df: pd.DataFrame) -> int:
        """
        Carga stock a inventario_actual en PostgreSQL
        Guarda snapshot histórico antes de actualizar

        Args:
            df: DataFrame con: ubicacion_id, codigo_producto, cantidad_actual, etc.

        Returns:
            Número de registros cargados
        """
        if df.empty:
            self.logger.warning("DataFrame de stock vacío")
            return 0

        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            ubicacion_id = df['ubicacion_id'].iloc[0]
            almacen_codigo = df['almacen_codigo'].iloc[0] if 'almacen_codigo' in df.columns else None
            fecha_snapshot = df['fecha_extraccion'].iloc[0] if 'fecha_extraccion' in df.columns else datetime.now()

            # Get ubicacion name from tiendas_config or use ubicacion_id
            ubicacion_nombre = ubicacion_id.replace('_', ' ').upper()
            try:
                from core.tiendas_config import TIENDAS_CONFIG
                if ubicacion_id in TIENDAS_CONFIG:
                    ubicacion_nombre = TIENDAS_CONFIG[ubicacion_id].ubicacion_nombre
            except Exception:
                pass

            # PASO 0A: Crear/actualizar ubicación (requerido por FK de inventario_actual)
            # Determinar tipo: 'cedi' si es CEDI, 'tienda' si no
            ubicacion_tipo = 'cedi' if 'cedi' in ubicacion_id.lower() else 'tienda'
            self.logger.info(f"📍 Verificando ubicación: {ubicacion_nombre} ({ubicacion_id}) - tipo: {ubicacion_tipo}")
            # Solo insertar si no existe, NO sobrescribir nombre existente
            cursor.execute("""
                INSERT INTO ubicaciones (id, nombre, codigo_klk, tipo, activo)
                VALUES (%s, %s, %s, %s, TRUE)
                ON CONFLICT (id) DO UPDATE SET
                    codigo_klk = COALESCE(EXCLUDED.codigo_klk, ubicaciones.codigo_klk),
                    tipo = EXCLUDED.tipo
            """, (ubicacion_id, ubicacion_nombre, ubicacion_id, ubicacion_tipo))
            self.logger.info(f"   ✅ Ubicación sincronizada: {ubicacion_id}")

            # PASO 0B: Crear TODOS los almacenes únicos del DataFrame (requerido por FK de inventario_actual)
            # Nota: df puede tener múltiples almacenes (APP-TPF, APP-PPF, etc.)
            almacenes_unicos = df['almacen_codigo'].dropna().unique() if 'almacen_codigo' in df.columns else []
            for alm_codigo in almacenes_unicos:
                cursor.execute("""
                    INSERT INTO almacenes (codigo, nombre, ubicacion_id, activo)
                    VALUES (%s, %s, %s, TRUE)
                    ON CONFLICT (codigo) DO NOTHING
                """, (alm_codigo, f'Almacén {ubicacion_nombre} - {alm_codigo}', ubicacion_id))
            if len(almacenes_unicos) > 0:
                self.logger.info(f"   ✅ Almacenes sincronizados: {list(almacenes_unicos)}")

            # PASO 1: Guardar snapshot histórico ANTES de eliminar
            # Para TODOS los almacenes de esta ubicación que vamos a actualizar
            self.logger.info(f"📸 Guardando snapshot histórico para ubicacion_id={ubicacion_id}, almacenes={list(almacenes_unicos)}")

            historico_insert = """
                INSERT INTO inventario_historico (
                    ubicacion_id, producto_id, almacen_codigo, cantidad, fecha_snapshot
                )
                SELECT
                    ia.ubicacion_id,
                    ia.producto_id,
                    ia.almacen_codigo,
                    ia.cantidad,
                    ia.fecha_actualizacion
                FROM inventario_actual ia
                WHERE ia.ubicacion_id = %s
                  AND ia.almacen_codigo = ANY(%s)
            """
            cursor.execute(historico_insert, (ubicacion_id, list(almacenes_unicos) if len(almacenes_unicos) > 0 else [None]))
            historico_saved = cursor.rowcount
            self.logger.info(f"✅ {historico_saved} registros guardados en histórico")

            # PASO 2: Eliminar stock anterior de esta ubicación para los almacenes que vamos a actualizar
            cursor.execute("""
                DELETE FROM inventario_actual
                WHERE ubicacion_id = %s
                  AND almacen_codigo = ANY(%s)
            """, (ubicacion_id, list(almacenes_unicos) if len(almacenes_unicos) > 0 else [None]))

            # PASO 3: INSERT stock nuevo
            insert_query = """
                INSERT INTO inventario_actual (
                    ubicacion_id, producto_id, almacen_codigo, cantidad, fecha_actualizacion
                )
                SELECT %s, p.id, %s, %s, %s
                FROM productos p
                WHERE p.codigo = %s
            """

            records_loaded = 0
            for _, row in df.iterrows():
                cursor.execute(insert_query, (
                    row['ubicacion_id'],
                    row.get('almacen_codigo'),
                    row['cantidad_actual'],
                    row.get('fecha_extraccion', datetime.now()),
                    row['codigo_producto']
                ))
                records_loaded += 1

            conn.commit()
            cursor.close()
            conn.close()

            self.logger.info(f"✅ {records_loaded} registros de stock cargados a PostgreSQL")
            return records_loaded

        except Exception as e:
            self.logger.error(f"❌ Error cargando stock: {e}")
            return 0

    def load_inventory_data(self, df: pd.DataFrame, batch_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Carga datos de inventario a PostgreSQL (para tiendas Stellar)

        Este método recibe el DataFrame del transformer Stellar con columnas:
        - ubicacion_id, codigo_producto, descripcion_producto, categoria
        - cantidad_actual, costo_unitario_actual, precio_venta_actual
        - stock_minimo, stock_maximo, fecha_extraccion, etc.

        Args:
            df: DataFrame con datos de inventario transformados
            batch_id: ID opcional del batch

        Returns:
            Dict con success y stats
        """
        if df.empty:
            self.logger.warning("DataFrame de inventario vacío")
            return {
                "success": False,
                "message": "DataFrame vacío",
                "stats": {"insertados": 0}
            }

        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            ubicacion_id = df['ubicacion_id'].iloc[0]
            ubicacion_nombre = df.get('ubicacion_nombre', pd.Series([ubicacion_id])).iloc[0] or ubicacion_id

            # Stellar no tiene almacen_codigo, usar código por defecto basado en tipo
            # CEDIs usan su propio código, tiendas usan "STELLAR"
            if 'cedi' in ubicacion_id.lower():
                almacen_codigo = ubicacion_id.upper().replace('_', '-')  # cedi_seco -> CEDI-SECO
            else:
                almacen_codigo = 'STELLAR'

            self.logger.info(f"📦 Cargando inventario Stellar: {ubicacion_nombre} ({ubicacion_id})")
            self.logger.info(f"   Almacén: {almacen_codigo}, Registros: {len(df)}")

            # Determinar tipo de ubicación
            ubicacion_tipo = 'cedi' if 'cedi' in ubicacion_id.lower() else 'tienda'

            # PASO 1: Crear/actualizar ubicación
            # Schema: id (PK), nombre, codigo_klk, tipo, activo
            # NO sobrescribir nombre existente para preservar cambios manuales
            cursor.execute("""
                INSERT INTO ubicaciones (id, nombre, codigo_klk, tipo, activo)
                VALUES (%s, %s, %s, %s, TRUE)
                ON CONFLICT (id) DO UPDATE SET
                    codigo_klk = COALESCE(EXCLUDED.codigo_klk, ubicaciones.codigo_klk),
                    tipo = EXCLUDED.tipo
            """, (ubicacion_id, ubicacion_nombre, ubicacion_id, ubicacion_tipo))
            self.logger.info(f"   ✅ Ubicación sincronizada: {ubicacion_id} (tipo: {ubicacion_tipo})")

            # PASO 2: Crear almacén si no existe
            cursor.execute("""
                INSERT INTO almacenes (codigo, nombre, ubicacion_id, activo)
                VALUES (%s, %s, %s, TRUE)
                ON CONFLICT (codigo) DO NOTHING
            """, (almacen_codigo, f'Almacén {ubicacion_nombre}', ubicacion_id))
            self.logger.info(f"   ✅ Almacén sincronizado: {almacen_codigo}")

            # PASO 3: Guardar snapshot histórico ANTES de eliminar
            self.logger.info(f"   📸 Guardando snapshot histórico...")
            cursor.execute("""
                INSERT INTO inventario_historico (
                    ubicacion_id, producto_id, almacen_codigo, cantidad, fecha_snapshot
                )
                SELECT
                    ia.ubicacion_id,
                    ia.producto_id,
                    ia.almacen_codigo,
                    ia.cantidad,
                    ia.fecha_actualizacion
                FROM inventario_actual ia
                WHERE ia.ubicacion_id = %s AND ia.almacen_codigo = %s
            """, (ubicacion_id, almacen_codigo))
            historico_saved = cursor.rowcount
            self.logger.info(f"   ✅ {historico_saved} registros guardados en histórico")

            # PASO 4: Eliminar stock anterior de esta ubicación/almacén
            cursor.execute("""
                DELETE FROM inventario_actual
                WHERE ubicacion_id = %s AND almacen_codigo = %s
            """, (ubicacion_id, almacen_codigo))
            deleted = cursor.rowcount
            self.logger.info(f"   🗑️ {deleted} registros anteriores eliminados")

            # PASO 5: Preparar datos para batch insert
            productos_data = []
            stock_data = []

            for _, row in df.iterrows():
                codigo_producto = row.get('codigo_producto')
                if not codigo_producto:
                    continue

                # Datos para productos
                nombre_producto = row.get('descripcion_producto') or f'Producto {codigo_producto}'
                productos_data.append((
                    codigo_producto,  # id = codigo
                    codigo_producto,
                    nombre_producto,
                    nombre_producto,
                    row.get('categoria'),
                    row.get('marca')
                ))

                # Datos para stock
                cantidad = row.get('cantidad_actual', 0) or 0
                fecha_extraccion = row.get('fecha_extraccion', datetime.now())
                stock_data.append((
                    ubicacion_id,
                    codigo_producto,
                    almacen_codigo,
                    cantidad,
                    fecha_extraccion
                ))

            # De-duplicar por codigo (productos) y por key compuesta (stock)
            seen_productos = {}
            for p in productos_data:
                seen_productos[p[0]] = p  # key = codigo
            productos_data = list(seen_productos.values())

            seen_stock = {}
            for s in stock_data:
                key = (s[0], s[1], s[2])  # ubicacion_id, producto_id, almacen_codigo
                seen_stock[key] = s
            stock_data = list(seen_stock.values())

            # PASO 5a: Batch insert productos
            from psycopg2.extras import execute_values
            try:
                productos_query = """
                    INSERT INTO productos (id, codigo, nombre, descripcion, categoria, marca, activo)
                    VALUES %s
                    ON CONFLICT (codigo) DO UPDATE SET
                        nombre = EXCLUDED.nombre,
                        descripcion = EXCLUDED.descripcion,
                        categoria = COALESCE(EXCLUDED.categoria, productos.categoria),
                        marca = COALESCE(EXCLUDED.marca, productos.marca),
                        fecha_actualizacion = CURRENT_TIMESTAMP
                """
                # Agregar activo=TRUE a cada tupla
                productos_with_activo = [p + (True,) for p in productos_data]
                execute_values(cursor, productos_query, productos_with_activo, page_size=1000)
                productos_insertados = len(productos_data)
            except Exception as e:
                self.logger.error(f"Error en batch insert productos: {e}")
                conn.rollback()
                # Fallback individual
                productos_insertados = 0
                for p in productos_data:
                    try:
                        cursor.execute("""
                            INSERT INTO productos (id, codigo, nombre, descripcion, categoria, marca, activo)
                            VALUES (%s, %s, %s, %s, %s, %s, TRUE)
                            ON CONFLICT (codigo) DO UPDATE SET
                                nombre = EXCLUDED.nombre,
                                descripcion = EXCLUDED.descripcion,
                                categoria = COALESCE(EXCLUDED.categoria, productos.categoria),
                                marca = COALESCE(EXCLUDED.marca, productos.marca),
                                fecha_actualizacion = CURRENT_TIMESTAMP
                        """, p)
                        productos_insertados += 1
                    except Exception:
                        pass

            # PASO 5b: Batch insert stock
            try:
                stock_query = """
                    INSERT INTO inventario_actual (
                        ubicacion_id, producto_id, almacen_codigo, cantidad, fecha_actualizacion
                    )
                    VALUES %s
                    ON CONFLICT (ubicacion_id, producto_id, almacen_codigo) DO UPDATE SET
                        cantidad = EXCLUDED.cantidad,
                        fecha_actualizacion = EXCLUDED.fecha_actualizacion
                """
                execute_values(cursor, stock_query, stock_data, page_size=1000)
                stock_insertado = len(stock_data)
            except Exception as e:
                self.logger.error(f"Error en batch insert stock: {e}")
                conn.rollback()
                # Fallback individual
                stock_insertado = 0
                for s in stock_data:
                    try:
                        cursor.execute("""
                            INSERT INTO inventario_actual (
                                ubicacion_id, producto_id, almacen_codigo, cantidad, fecha_actualizacion
                            )
                            VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (ubicacion_id, producto_id, almacen_codigo) DO UPDATE SET
                                cantidad = EXCLUDED.cantidad,
                                fecha_actualizacion = EXCLUDED.fecha_actualizacion
                        """, s)
                        stock_insertado += 1
                    except Exception:
                        pass

            conn.commit()
            cursor.close()
            conn.close()

            self.logger.info(f"   ✅ Productos upserted: {productos_insertados}")
            self.logger.info(f"   ✅ Stock insertado: {stock_insertado}")

            return {
                "success": True,
                "message": f"{stock_insertado} registros cargados a PostgreSQL",
                "stats": {
                    "insertados": stock_insertado,
                    "productos": productos_insertados,
                    "historico": historico_saved
                }
            }

        except Exception as e:
            self.logger.error(f"❌ Error en load_inventory_data: {e}")
            import traceback
            self.logger.error(traceback.format_exc())
            return {
                "success": False,
                "message": str(e),
                "stats": {"insertados": 0}
            }

    def update_stock_actual_table(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Actualiza la tabla inventario_actual en PostgreSQL

        Args:
            df: DataFrame con columnas: ubicacion_id, codigo_producto, cantidad, etc.

        Returns:
            Dict con success y records_updated
        """
        if df.empty:
            self.logger.warning("DataFrame de stock vacío")
            return {
                "success": False,
                "message": "DataFrame vacío",
                "records_updated": 0
            }

        try:
            records_loaded = self.load_stock(df)

            return {
                "success": True,
                "message": f"{records_loaded} registros actualizados",
                "records_updated": records_loaded
            }

        except Exception as e:
            self.logger.error(f"❌ Error actualizando stock: {e}")
            return {
                "success": False,
                "message": str(e),
                "records_updated": 0
            }

    def get_connection(self):
        """
        Obtiene conexión a PostgreSQL (para compatibilidad)
        """
        return self._get_connection()

    def refresh_productos_analisis_cache(self) -> Dict[str, Any]:
        """
        Refresca la tabla productos_analisis_cache después del ETL.
        Esta tabla materializa cálculos de ABC, estados, etc. para consultas rápidas.

        Returns:
            Dict con success, message y tiempo de ejecución
        """
        import time
        start_time = time.time()

        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            self.logger.info("🔄 Refrescando productos_analisis_cache...")
            cursor.execute("SELECT refresh_productos_analisis_cache()")
            conn.commit()
            cursor.close()
            conn.close()

            elapsed = time.time() - start_time
            self.logger.info(f"✅ Cache refrescada en {elapsed:.2f}s")

            return {
                "success": True,
                "message": f"Cache refrescada en {elapsed:.2f}s",
                "elapsed_seconds": elapsed
            }

        except Exception as e:
            error_msg = str(e)
            if "does not exist" in error_msg or "no existe" in error_msg:
                self.logger.warning("⚠️  productos_analisis_cache no existe - saltando refresh")
                return {
                    "success": True,
                    "message": "Cache table does not exist (skipped)",
                    "elapsed_seconds": 0
                }
            else:
                self.logger.error(f"❌ Error refrescando cache: {e}")
                return {
                    "success": False,
                    "message": str(e),
                    "elapsed_seconds": time.time() - start_time
                }
