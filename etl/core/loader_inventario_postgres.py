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

            # UPSERT: INSERT ... ON CONFLICT DO UPDATE
            # Solo columnas que existen en PostgreSQL
            upsert_query = """
                INSERT INTO productos (
                    id, codigo, codigo_barras, nombre, descripcion, marca, modelo,
                    categoria, grupo_articulo, subgrupo, activo, fecha_actualizacion
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s
                )
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

            records_loaded = 0
            for _, row in df.iterrows():
                # Usar descripcion como nombre si no existe nombre
                nombre = row.get('nombre') or row.get('descripcion', '')
                # Usar codigo como id (ambos son únicos)
                codigo = row.get('codigo')

                cursor.execute(upsert_query, (
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
                records_loaded += 1

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
                    ubicacion_nombre = TIENDAS_CONFIG[ubicacion_id].get('nombre', ubicacion_id)
            except Exception:
                pass

            # PASO 0A: Crear/actualizar ubicación (requerido por FK de inventario_actual)
            self.logger.info(f"📍 Verificando ubicación: {ubicacion_nombre} ({ubicacion_id})")
            cursor.execute("""
                INSERT INTO ubicaciones (id, nombre, codigo_klk, activo)
                VALUES (%s, %s, %s, TRUE)
                ON CONFLICT (id) DO UPDATE SET
                    nombre = EXCLUDED.nombre,
                    codigo_klk = EXCLUDED.codigo_klk
            """, (ubicacion_id, ubicacion_nombre, ubicacion_id))
            self.logger.info(f"   ✅ Ubicación sincronizada: {ubicacion_id}")

            # PASO 0B: Crear almacén si no existe (requerido por FK de inventario_actual)
            if almacen_codigo:
                cursor.execute("""
                    INSERT INTO almacenes (codigo, nombre, ubicacion_id, activo)
                    VALUES (%s, %s, %s, TRUE)
                    ON CONFLICT (codigo) DO NOTHING
                """, (almacen_codigo, f'Almacén {ubicacion_nombre}', ubicacion_id))
                self.logger.info(f"   ✅ Almacén sincronizado: {almacen_codigo}")

            # PASO 1: Guardar snapshot histórico ANTES de eliminar
            # Solo si hay datos previos en inventario_actual
            self.logger.info(f"📸 Guardando snapshot histórico para ubicacion_id={ubicacion_id}, almacen={almacen_codigo}")

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
                  AND (ia.almacen_codigo = %s OR (ia.almacen_codigo IS NULL AND %s IS NULL))
            """
            cursor.execute(historico_insert, (ubicacion_id, almacen_codigo, almacen_codigo))
            historico_saved = cursor.rowcount
            self.logger.info(f"✅ {historico_saved} registros guardados en histórico")

            # PASO 2: Eliminar stock anterior de esta ubicación
            cursor.execute("""
                DELETE FROM inventario_actual
                WHERE ubicacion_id = %s
                  AND (almacen_codigo = %s OR (almacen_codigo IS NULL AND %s IS NULL))
            """, (ubicacion_id, almacen_codigo, almacen_codigo))

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

            # PASO 1: Crear/actualizar ubicación
            cursor.execute("""
                INSERT INTO ubicaciones (id, nombre, codigo_klk, activo)
                VALUES (%s, %s, %s, TRUE)
                ON CONFLICT (id) DO UPDATE SET
                    nombre = EXCLUDED.nombre,
                    codigo_klk = EXCLUDED.codigo_klk
            """, (ubicacion_id, ubicacion_nombre, ubicacion_id))
            self.logger.info(f"   ✅ Ubicación sincronizada: {ubicacion_id}")

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

            # PASO 5: Insertar productos y stock
            productos_insertados = 0
            stock_insertado = 0

            for _, row in df.iterrows():
                codigo_producto = row.get('codigo_producto')
                if not codigo_producto:
                    continue

                # 5a: Upsert producto
                nombre_producto = row.get('descripcion_producto', f'Producto {codigo_producto}')
                cursor.execute("""
                    INSERT INTO productos (id, codigo, nombre, descripcion, categoria, marca, activo)
                    VALUES (%s, %s, %s, %s, %s, %s, TRUE)
                    ON CONFLICT (codigo) DO UPDATE SET
                        nombre = EXCLUDED.nombre,
                        descripcion = EXCLUDED.descripcion,
                        categoria = COALESCE(EXCLUDED.categoria, productos.categoria),
                        marca = COALESCE(EXCLUDED.marca, productos.marca),
                        fecha_actualizacion = CURRENT_TIMESTAMP
                """, (
                    codigo_producto,  # id = codigo
                    codigo_producto,
                    nombre_producto,
                    nombre_producto,
                    row.get('categoria'),
                    row.get('marca')
                ))
                productos_insertados += 1

                # 5b: Insert stock
                cantidad = row.get('cantidad_actual', 0) or 0
                fecha_extraccion = row.get('fecha_extraccion', datetime.now())

                cursor.execute("""
                    INSERT INTO inventario_actual (
                        ubicacion_id, producto_id, almacen_codigo, cantidad, fecha_actualizacion
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (ubicacion_id, producto_id, almacen_codigo) DO UPDATE SET
                        cantidad = EXCLUDED.cantidad,
                        fecha_actualizacion = EXCLUDED.fecha_actualizacion
                """, (
                    ubicacion_id,
                    codigo_producto,
                    almacen_codigo,
                    cantidad,
                    fecha_extraccion
                ))
                stock_insertado += 1

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
