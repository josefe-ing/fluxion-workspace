#!/usr/bin/env python3
"""
Cargador de datos de ventas para ETL - La Granja Mercado
Inserta datos de ventas transformados en DuckDB
"""

import duckdb
import pandas as pd
from typing import Optional, Dict, List, Any, Tuple
from datetime import datetime
import logging
from pathlib import Path
import json
import uuid
import os

from config import ETLConfig

class VentasLoader:
    """Cargador especializado para datos de ventas"""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or ETLConfig.DUCKDB_PATH
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_ventas_loader')
        logger.setLevel(logging.INFO)

        log_file = ETLConfig.LOG_DIR / f"ventas_loader_{datetime.now().strftime('%Y%m%d')}.log"
        handler = logging.FileHandler(log_file)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        return logger

    def get_connection(self) -> duckdb.DuckDBPyConnection:
        """Obtiene conexión a DuckDB"""
        try:
            conn = duckdb.connect(str(self.db_path))
            return conn
        except Exception as e:
            self.logger.error(f"❌ Error conectando a DuckDB: {str(e)}")
            raise

    def create_ventas_tables(self) -> bool:
        """Crea las tablas necesarias para almacenar ventas"""

        try:
            conn = self.get_connection()

            # COMENTADO: No eliminar tabla existente para permitir acumulación de datos
            # self.logger.info("🗑️ Eliminando tabla existente para recrear con esquema correcto...")
            # conn.execute("DROP TABLE IF EXISTS ventas_raw")

            # Tabla principal de ventas
            ventas_table = """
            CREATE TABLE IF NOT EXISTS ventas_raw (
                -- Identificadores
                numero_factura VARCHAR,
                ubicacion_id VARCHAR,
                ubicacion_nombre VARCHAR,
                linea VARCHAR,

                -- Información temporal
                fecha VARCHAR,
                hora VARCHAR,
                fecha_hora_completa VARCHAR,
                ano VARCHAR,
                mes VARCHAR,
                dia VARCHAR,
                dia_semana VARCHAR,
                nombre_dia VARCHAR,
                nombre_mes VARCHAR,
                turno VARCHAR,
                periodo_dia VARCHAR,
                tipo_dia VARCHAR,

                -- Información del producto
                codigo_transaccion VARCHAR,
                codigo_producto VARCHAR,
                descripcion_producto VARCHAR,
                marca_producto VARCHAR,
                modelo_producto VARCHAR,
                cuadrante_producto VARCHAR,
                presentacion_producto VARCHAR,

                -- Categorización
                categoria_producto VARCHAR,
                grupo_producto VARCHAR,
                subgrupo_producto VARCHAR,
                categoria_especial VARCHAR,
                categoria_precio VARCHAR,
                tipo_venta VARCHAR,

                -- Cantidades y medidas
                cantidad_vendida VARCHAR,
                cantidad_bultos VARCHAR,
                peso_unitario VARCHAR,
                volumen_unitario VARCHAR,
                peso_calculado VARCHAR,
                peso_total_vendido VARCHAR,
                volumen_total_vendido VARCHAR,
                tipo_peso VARCHAR,

                -- Información financiera
                costo_unitario VARCHAR,
                precio_unitario VARCHAR,
                impuesto_porcentaje VARCHAR,
                precio_por_kg VARCHAR,

                -- Métricas calculadas
                costo_total VARCHAR,
                venta_total VARCHAR,
                utilidad_bruta VARCHAR,
                margen_bruto_pct VARCHAR,
                impuesto_total VARCHAR,
                venta_sin_impuesto VARCHAR,

                -- Clasificaciones de negocio
                es_peso_variable VARCHAR,
                producto_alta_rotacion VARCHAR,
                venta_alto_valor VARCHAR,
                tamano_transaccion VARCHAR,

                -- Metadatos
                fecha_extraccion VARCHAR,
                fecha_transformacion VARCHAR,
                version_transformacion VARCHAR,
                fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """

            conn.execute(ventas_table)

            # Tabla resumen de ventas diarias
            ventas_resumen = """
            CREATE TABLE IF NOT EXISTS ventas_resumen_diario (
                ubicacion_id VARCHAR NOT NULL,
                ubicacion_nombre VARCHAR NOT NULL,
                fecha DATE NOT NULL,

                -- Métricas básicas
                total_facturas INTEGER NOT NULL,
                total_items INTEGER NOT NULL,
                total_productos_unicos INTEGER NOT NULL,

                -- Métricas financieras
                venta_bruta DECIMAL(15,2) NOT NULL,
                impuestos_total DECIMAL(15,2),
                venta_neta DECIMAL(15,2) NOT NULL,
                costo_total DECIMAL(15,2),
                utilidad_bruta DECIMAL(15,2),
                margen_bruto_pct DECIMAL(5,2),

                -- Métricas operativas
                ticket_promedio DECIMAL(12,2),
                items_por_ticket DECIMAL(8,2),
                precio_promedio_item DECIMAL(12,2),

                -- Métricas por turno
                ventas_mañana DECIMAL(15,2),
                ventas_tarde DECIMAL(15,2),
                ventas_noche DECIMAL(15,2),

                -- Metadatos
                fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY (ubicacion_id, fecha)
            )
            """

            conn.execute(ventas_resumen)

            # Tabla de productos top vendidos
            productos_top = """
            CREATE TABLE IF NOT EXISTS productos_top_ventas (
                ubicacion_id VARCHAR NOT NULL,
                periodo VARCHAR NOT NULL, -- 'diario', 'semanal', 'mensual'
                fecha_periodo DATE NOT NULL,
                ranking INTEGER NOT NULL,

                codigo_producto VARCHAR NOT NULL,
                descripcion_producto VARCHAR,
                categoria_producto VARCHAR,
                marca_producto VARCHAR,

                cantidad_vendida DECIMAL(12,3),
                venta_total DECIMAL(15,2),
                frecuencia_compra INTEGER, -- Número de facturas

                fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY (ubicacion_id, periodo, fecha_periodo, ranking)
            )
            """

            conn.execute(productos_top)

            # NOTA: Los índices ya existen en la tabla ventas_raw (creados una vez en producción)
            # No se recrean en cada ETL para evitar el overhead de 9+ minutos
            # Índices existentes: idx_ventas_ubicacion_fecha, idx_ventas_fecha, idx_ventas_ubicacion

            conn.close()
            self.logger.info("✅ Tablas de ventas creadas/verificadas exitosamente")
            return True

        except Exception as e:
            self.logger.error(f"❌ Error creando tablas de ventas: {str(e)}")
            return False

    def load_ventas_data(self, df: pd.DataFrame, batch_size: int = 1000) -> Dict[str, Any]:
        """
        Carga datos de ventas en DuckDB

        Args:
            df: DataFrame con datos de ventas transformados
            batch_size: Tamaño del lote para inserción

        Returns:
            Dict con resultados de la carga
        """

        if df.empty:
            return {
                "success": False,
                "message": "DataFrame vacío",
                "stats": {"procesados": 0, "insertados": 0, "errores": 0}
            }

        inicio = datetime.now()
        etl_id = f"etl_ventas_{inicio.strftime('%Y%m%d_%H%M%S')}"

        self.logger.info(f"📝 Log ETL iniciado: {etl_id}")
        self.logger.info(f"📦 Cargando {len(df):,} registros de ventas")

        # Crear tablas si no existen
        if not self.create_ventas_tables():
            return {
                "success": False,
                "message": "Error creando tablas",
                "stats": {"procesados": 0, "insertados": 0, "errores": 0}
            }

        try:
            self.logger.info("🔌 Obteniendo conexión a DuckDB...")
            conn = self.get_connection()
            self.logger.info(f"✅ Conexión establecida a {self.db_path}")

            # Verificar estado de la base de datos
            try:
                result = conn.execute("SELECT COUNT(*) as count FROM ventas_raw").fetchone()
                self.logger.info(f"📊 Registros existentes en ventas_raw: {result[0]:,}")
            except Exception as e:
                self.logger.warning(f"⚠️ No se pudo contar registros existentes (tabla nueva?): {e}")

            # Eliminar datos existentes SOLO del período específico (sin COUNT costoso)
            # Esto previene duplicados al re-ejecutar el ETL
            # Respeta históricos: solo elimina/reemplaza datos del rango de fechas actual
            ubicaciones = df['ubicacion_id'].unique().tolist()
            fecha_min = df['fecha'].min()
            fecha_max = df['fecha'].max()

            if ubicaciones and fecha_min and fecha_max:
                ubicaciones_str = "', '".join(ubicaciones)

                # DELETE directo sin COUNT previo (más rápido y no bloquea)
                # Solo elimina registros del período específico que se va a cargar
                delete_query = f"""
                DELETE FROM ventas_raw
                WHERE ubicacion_id IN ('{ubicaciones_str}')
                  AND fecha >= '{fecha_min}'
                  AND fecha <= '{fecha_max}'
                """

                self.logger.info(f"🗑️  Eliminando registros existentes del período (si existen):")
                self.logger.info(f"   Ubicaciones: {ubicaciones}")
                self.logger.info(f"   Período: {fecha_min} a {fecha_max}")
                self.logger.info(f"   Query: {delete_query[:200]}...")

                delete_start = datetime.now()
                self.logger.info(f"   🚀 Ejecutando DELETE...")
                conn.execute(delete_query)
                delete_duration = (datetime.now() - delete_start).total_seconds()
                self.logger.info(f"   ✅ DELETE completado en {delete_duration:.2f}s")

                self.logger.info(f"✅ DELETE completado - listo para insertar datos actualizados")

            # Agregar fecha de carga
            df['fecha_carga'] = datetime.now()

            registros_insertados = 0
            errores = 0

            # =================================================================
            # CARGA POR LOTES: Igual que inventario ETL (probado y funcional)
            # =================================================================
            self.logger.info("🚀 Usando carga por lotes (método probado de inventario)")

            # Preparar DataFrame completo para inserción
            df_prep = df.copy()

            # Convertir columnas categóricas a string antes de fillna
            for col in df_prep.columns:
                if df_prep[col].dtype.name == 'category':
                    df_prep[col] = df_prep[col].astype(str)

            # Limpiar valores NaN y preparar datos
            text_columns = [
                'numero_factura', 'ubicacion_id', 'ubicacion_nombre', 'linea',
                'fecha', 'hora', 'fecha_hora_completa', 'ano', 'mes', 'dia',
                'dia_semana', 'nombre_dia', 'nombre_mes', 'turno', 'periodo_dia', 'tipo_dia',
                'codigo_transaccion', 'codigo_producto', 'descripcion_producto',
                'marca_producto', 'modelo_producto', 'cuadrante_producto', 'presentacion_producto',
                'categoria_producto', 'grupo_producto', 'subgrupo_producto',
                'categoria_especial', 'categoria_precio', 'tipo_venta',
                'tipo_peso', 'es_peso_variable', 'producto_alta_rotacion',
                'venta_alto_valor', 'tamano_transaccion',
                'fecha_extraccion', 'fecha_transformacion', 'version_transformacion', 'fecha_carga'
            ]

            numeric_columns = [
                'cantidad_vendida', 'cantidad_bultos', 'peso_unitario', 'volumen_unitario',
                'peso_calculado', 'peso_total_vendido', 'volumen_total_vendido',
                'costo_unitario', 'precio_unitario', 'impuesto_porcentaje', 'precio_por_kg',
                'costo_total', 'venta_total', 'utilidad_bruta', 'margen_bruto_pct',
                'impuesto_total', 'venta_sin_impuesto'
            ]

            # Aplicar limpieza
            for col in df_prep.columns:
                if col in text_columns:
                    df_prep[col] = df_prep[col].fillna('').astype(str).replace('nan', '')
                elif col in numeric_columns:
                    # Mantener como numérico pero reemplazar NaN con None
                    df_prep[col] = df_prep[col].replace('nan', None).replace('None', None)

            # Seleccionar columnas en orden correcto
            table_columns = [
                'numero_factura', 'ubicacion_id', 'ubicacion_nombre', 'linea',
                'fecha', 'hora', 'fecha_hora_completa', 'ano', 'mes', 'dia',
                'dia_semana', 'nombre_dia', 'nombre_mes', 'turno', 'periodo_dia', 'tipo_dia',
                'codigo_transaccion', 'codigo_producto', 'descripcion_producto',
                'marca_producto', 'modelo_producto', 'cuadrante_producto', 'presentacion_producto',
                'categoria_producto', 'grupo_producto', 'subgrupo_producto',
                'categoria_especial', 'categoria_precio', 'tipo_venta',
                'cantidad_vendida', 'cantidad_bultos', 'peso_unitario', 'volumen_unitario',
                'peso_calculado', 'peso_total_vendido', 'volumen_total_vendido', 'tipo_peso',
                'costo_unitario', 'precio_unitario', 'impuesto_porcentaje', 'precio_por_kg',
                'costo_total', 'venta_total', 'utilidad_bruta', 'margen_bruto_pct',
                'impuesto_total', 'venta_sin_impuesto',
                'es_peso_variable', 'producto_alta_rotacion', 'venta_alto_valor', 'tamano_transaccion',
                'fecha_extraccion', 'fecha_transformacion', 'version_transformacion'
            ]

            available_columns = [col for col in table_columns if col in df_prep.columns]
            df_final = df_prep[available_columns].copy()

            # Procesar por lotes (igual que inventario)
            batch_size = 5000
            total_batches = (len(df_final) + batch_size - 1) // batch_size

            for i in range(0, len(df_final), batch_size):
                batch_df = df_final.iloc[i:i+batch_size].copy()
                current_batch = (i // batch_size) + 1

                try:
                    self.logger.info(f"🔄 Procesando lote {current_batch}/{total_batches} ({len(batch_df)} registros)")
                    self.logger.info(f"   📊 Memoria del batch: {batch_df.memory_usage(deep=True).sum() / 1024 / 1024:.2f} MB")

                    self.logger.info(f"   🔓 Iniciando transacción...")
                    conn.execute("BEGIN TRANSACTION")
                    self.logger.info(f"   ✅ Transacción iniciada")

                    # Registrar DataFrame temporal en DuckDB
                    self.logger.info(f"   📝 Registrando batch_data en DuckDB...")
                    conn.register('batch_data', batch_df)
                    self.logger.info(f"   ✅ batch_data registrado - {len(batch_df)} filas")

                    # Insertar datos usando SELECT FROM batch_data
                    columns_str = ', '.join(available_columns)
                    self.logger.info(f"   💾 Ejecutando INSERT de {len(batch_df)} registros...")
                    insert_start = datetime.now()
                    conn.execute(f"""
                        INSERT INTO ventas_raw ({columns_str})
                        SELECT {columns_str} FROM batch_data
                    """)
                    insert_duration = (datetime.now() - insert_start).total_seconds()
                    self.logger.info(f"   ✅ INSERT completado en {insert_duration:.2f}s")

                    self.logger.info(f"   🔒 Haciendo COMMIT...")
                    conn.execute("COMMIT")
                    registros_insertados += len(batch_df)
                    self.logger.info(f"   ✅ COMMIT exitoso")

                    self.logger.info(f"✅ Lote {current_batch}/{total_batches} completado - Total insertados: {registros_insertados:,}")

                except Exception as e:
                    self.logger.error(f"❌ Error en lote {current_batch}: {str(e)}")
                    self.logger.error(f"   Tipo de error: {type(e).__name__}")
                    self.logger.error(f"   Intentando ROLLBACK...")
                    try:
                        conn.execute("ROLLBACK")
                        self.logger.info(f"   ✅ ROLLBACK exitoso")
                    except Exception as rollback_error:
                        self.logger.error(f"   ❌ Error en ROLLBACK: {str(rollback_error)}")
                    errores += len(batch_df)
                    self.logger.error(f"   Total errores acumulados: {errores}")

            # ETL enfocado solo en extracción y carga - sin procesamiento adicional

            self.logger.info(f"🧹 Cerrando conexión principal...")
            conn.close()
            self.logger.info(f"✅ Conexión cerrada")

            fin = datetime.now()
            duracion = (fin - inicio).total_seconds()
            self.logger.info(f"⏱️  Duración total de carga: {duracion:.2f}s")
            self.logger.info(f"📊 Registros insertados: {registros_insertados:,}")
            self.logger.info(f"❌ Errores: {errores}")

            # Registrar en log de ETL (after calculating duration)
            self.logger.info(f"📝 Registrando en log de ETL...")
            conn_log = self.get_connection()
            self._registrar_etl_log(conn_log, etl_id, {
                "tipo": "ventas",
                "registros_procesados": len(df),
                "registros_insertados": registros_insertados,
                "errores": errores,
                "ubicaciones": df['ubicacion_id'].unique().tolist() if not df.empty else [],
                "tiempo_ejecucion": duracion,
                "rango_fechas": {
                    "desde": str(df['fecha'].min()) if 'fecha' in df.columns else None,
                    "hasta": str(df['fecha'].max()) if 'fecha' in df.columns else None
                }
            })
            conn_log.close()

            self.logger.info(f"📝 Log ETL finalizado: {etl_id} - {'EXITOSO' if errores == 0 else 'CON ERRORES'}")
            self.logger.info(f"📊 Carga completada:")
            self.logger.info(f"   📥 Procesados: {len(df):,}")
            self.logger.info(f"   ✅ Insertados: {registros_insertados:,}")
            self.logger.info(f"   ❌ Errores: {errores:,}")
            self.logger.info(f"   ⏱️  Tiempo: {duracion:.2f}s")

            return {
                "success": errores == 0,
                "message": f"Carga {'exitosa' if errores == 0 else 'con errores'}",
                "etl_id": etl_id,
                "stats": {
                    "procesados": len(df),
                    "insertados": registros_insertados,
                    "errores": errores,
                    "tiempo_ejecucion": duracion
                }
            }

        except Exception as e:
            self.logger.error(f"❌ Error crítico en carga: {str(e)}")
            return {
                "success": False,
                "message": f"Error crítico: {str(e)}",
                "stats": {"procesados": 0, "insertados": 0, "errores": len(df)}
            }

    def _actualizar_resumen_diario(self, conn: duckdb.DuckDBPyConnection, df: pd.DataFrame):
        """Actualiza la tabla de resumen diario"""
        try:
            self.logger.info("📊 Actualizando resumen diario...")

            resumen_query = """
            INSERT OR REPLACE INTO ventas_resumen_diario
            SELECT
                ubicacion_id,
                ubicacion_nombre,
                fecha,

                COUNT(DISTINCT numero_factura) as total_facturas,
                COUNT(*) as total_items,
                COUNT(DISTINCT codigo_producto) as total_productos_unicos,

                SUM(CASE WHEN venta_total != 'NULL' AND venta_total != '' THEN CAST(venta_total AS DECIMAL) ELSE 0 END) as venta_bruta,
                SUM(CASE WHEN impuesto_total != 'NULL' AND impuesto_total != '' THEN CAST(impuesto_total AS DECIMAL) ELSE 0 END) as impuestos_total,
                SUM(CASE WHEN venta_sin_impuesto != 'NULL' AND venta_sin_impuesto != '' THEN CAST(venta_sin_impuesto AS DECIMAL) ELSE 0 END) as venta_neta,
                SUM(CASE WHEN costo_total != 'NULL' AND costo_total != '' THEN CAST(costo_total AS DECIMAL) ELSE 0 END) as costo_total,
                SUM(CASE WHEN utilidad_bruta != 'NULL' AND utilidad_bruta != '' THEN CAST(utilidad_bruta AS DECIMAL) ELSE 0 END) as utilidad_bruta,
                AVG(CASE WHEN margen_bruto_pct != 'NULL' AND margen_bruto_pct != '' THEN CAST(margen_bruto_pct AS DECIMAL) ELSE 0 END) as margen_bruto_pct,

                AVG(CASE WHEN venta_total != 'NULL' AND venta_total != '' THEN CAST(venta_total AS DECIMAL) ELSE 0 END) as ticket_promedio,
                COUNT(*) / COUNT(DISTINCT numero_factura) as items_por_ticket,
                AVG(CASE WHEN precio_unitario != 'NULL' AND precio_unitario != '' THEN CAST(precio_unitario AS DECIMAL) ELSE 0 END) as precio_promedio_item,

                SUM(CASE WHEN turno = 'MAÑANA' AND venta_total != 'NULL' AND venta_total != '' THEN CAST(venta_total AS DECIMAL) ELSE 0 END) as ventas_mañana,
                SUM(CASE WHEN turno = 'TARDE' AND venta_total != 'NULL' AND venta_total != '' THEN CAST(venta_total AS DECIMAL) ELSE 0 END) as ventas_tarde,
                SUM(CASE WHEN turno = 'NOCHE' AND venta_total != 'NULL' AND venta_total != '' THEN CAST(venta_total AS DECIMAL) ELSE 0 END) as ventas_noche,

                CURRENT_TIMESTAMP as fecha_calculo

            FROM ventas_raw
            WHERE fecha >= (SELECT MIN(CAST(fecha AS DATE)) FROM temp_ventas)
              AND fecha <= (SELECT MAX(CAST(fecha AS DATE)) FROM temp_ventas)
              AND ubicacion_id IN (SELECT DISTINCT ubicacion_id FROM temp_ventas)
            GROUP BY ubicacion_id, ubicacion_nombre, fecha
            """

            conn.execute(resumen_query)
            self.logger.info("✅ Resumen diario actualizado")

        except Exception as e:
            self.logger.error(f"❌ Error actualizando resumen diario: {str(e)}")

    def _actualizar_productos_top(self, conn: duckdb.DuckDBPyConnection, df: pd.DataFrame):
        """Actualiza la tabla de productos top vendidos"""
        try:
            self.logger.info("🏆 Actualizando productos top...")

            # Top productos diarios
            top_diario_query = """
            INSERT OR REPLACE INTO productos_top_ventas
            SELECT
                ubicacion_id,
                'diario' as periodo,
                fecha as fecha_periodo,
                ROW_NUMBER() OVER (PARTITION BY ubicacion_id, fecha ORDER BY total_venta DESC) as ranking,

                codigo_producto,
                MAX(descripcion_producto) as descripcion_producto,
                MAX(categoria_producto) as categoria_producto,
                MAX(marca_producto) as marca_producto,

                SUM(CASE WHEN cantidad_vendida != 'NULL' AND cantidad_vendida != '' THEN CAST(cantidad_vendida AS DECIMAL) ELSE 0 END) as cantidad_vendida,
                SUM(CASE WHEN venta_total != 'NULL' AND venta_total != '' THEN CAST(venta_total AS DECIMAL) ELSE 0 END) as total_venta,
                COUNT(DISTINCT numero_factura) as frecuencia_compra,

                CURRENT_TIMESTAMP as fecha_calculo

            FROM ventas_raw
            WHERE fecha >= (SELECT MIN(CAST(fecha AS DATE)) FROM temp_ventas)
              AND fecha <= (SELECT MAX(CAST(fecha AS DATE)) FROM temp_ventas)
              AND ubicacion_id IN (SELECT DISTINCT ubicacion_id FROM temp_ventas)
            GROUP BY ubicacion_id, fecha, codigo_producto
            QUALIFY ranking <= 20
            """

            conn.execute(top_diario_query)
            self.logger.info("✅ Productos top actualizados")

        except Exception as e:
            self.logger.error(f"❌ Error actualizando productos top: {str(e)}")

    def _registrar_etl_log(self, conn: duckdb.DuckDBPyConnection, etl_id: str, stats: Dict[str, Any]):
        """Registra el log del proceso ETL"""
        try:
            # Use the existing etl_logs table schema (14 columns from inventory loader)
            inicio = datetime.now()
            fin = datetime.now()

            conn.execute("""
                INSERT INTO etl_logs (
                    id, proceso, ubicacion_id, fecha_inicio, fecha_fin, estado,
                    registros_procesados, registros_insertados, registros_actualizados,
                    registros_errores, tiempo_ejecucion_segundos, mensaje, detalles
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                etl_id,                                          # id
                'ventas',                                        # proceso
                stats.get('ubicaciones', [''])[0] if stats.get('ubicaciones') else '',  # ubicacion_id
                inicio,                                          # fecha_inicio
                fin,                                            # fecha_fin
                'EXITOSO' if stats.get('errores', 0) == 0 else 'FALLIDO',  # estado
                stats.get('registros_procesados', 0),          # registros_procesados
                stats.get('registros_insertados', 0),          # registros_insertados
                0,                                              # registros_actualizados
                stats.get('errores', 0),                       # registros_errores
                stats.get('tiempo_ejecucion', 0),              # tiempo_ejecucion_segundos
                f"ETL Ventas - {stats.get('registros_procesados', 0)} registros", # mensaje
                json.dumps(stats)                               # detalles
            ])

        except Exception as e:
            self.logger.error(f"❌ Error registrando log ETL: {str(e)}")

    def get_ventas_summary(self, ubicacion_id: str = None, fecha_desde: str = None, fecha_hasta: str = None) -> Dict[str, Any]:
        """
        Obtiene resumen de las ventas cargadas

        Returns:
            Dict con estadísticas de ventas
        """
        try:
            conn = self.get_connection()

            where_clause = "WHERE 1=1"
            params = []

            if ubicacion_id:
                where_clause += " AND ubicacion_id = ?"
                params.append(ubicacion_id)

            if fecha_desde:
                where_clause += " AND fecha >= ?"
                params.append(fecha_desde)

            if fecha_hasta:
                where_clause += " AND fecha <= ?"
                params.append(fecha_hasta)

            query = f"""
            SELECT
                COUNT(*) as total_registros,
                COUNT(DISTINCT ubicacion_id) as total_ubicaciones,
                COUNT(DISTINCT numero_factura) as total_facturas,
                COUNT(DISTINCT codigo_producto) as total_productos,
                SUM(CASE WHEN venta_total != 'NULL' AND venta_total != '' THEN CAST(venta_total AS DECIMAL) ELSE 0 END) as venta_total_global,
                AVG(CASE WHEN venta_total != 'NULL' AND venta_total != '' THEN CAST(venta_total AS DECIMAL) ELSE 0 END) as venta_promedio,
                MIN(fecha) as fecha_min,
                MAX(fecha) as fecha_max
            FROM ventas_raw
            {where_clause}
            """

            result = conn.execute(query, params).fetchone()
            conn.close()

            return {
                "total_registros": result[0] or 0,
                "total_ubicaciones": result[1] or 0,
                "total_facturas": result[2] or 0,
                "total_productos": result[3] or 0,
                "venta_total_global": float(result[4] or 0),
                "venta_promedio": float(result[5] or 0),
                "fecha_min": str(result[6]) if result[6] else None,
                "fecha_max": str(result[7]) if result[7] else None
            }

        except Exception as e:
            self.logger.error(f"❌ Error obteniendo resumen: {str(e)}")
            return {}

    def load_ventas_postgresql(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Carga datos de ventas en PostgreSQL v2.0

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

        # 2. AGREGAR CAMPOS FALTANTES con defaults
        if 'peso_calculado' not in df_prep.columns:
            df_prep['peso_calculado'] = 0.0
        if 'total_cantidad_por_unidad_medida' not in df_prep.columns:
            df_prep['total_cantidad_por_unidad_medida'] = None

        # 3. SINCRONIZAR UBICACIONES Y PRODUCTOS
        try:
            with get_postgres_connection() as pg_conn:
                cursor = pg_conn.cursor()

                # Sincronizar ubicaciones únicas
                ubicaciones_unicas = df_prep['ubicacion_id'].unique()
                for ubicacion_id in ubicaciones_unicas:
                    cursor.execute("""
                        INSERT INTO ubicaciones (id, nombre, activo)
                        VALUES (%s, %s, TRUE)
                        ON CONFLICT (id) DO UPDATE
                        SET nombre = EXCLUDED.nombre
                    """, (ubicacion_id, ubicacion_id))

                # Sincronizar productos únicos (auto-registro)
                productos_unicos = df_prep['producto_id'].unique()
                for producto_id in productos_unicos:
                    cursor.execute("""
                        INSERT INTO productos (id, codigo, nombre, activo)
                        VALUES (%s, %s, %s, TRUE)
                        ON CONFLICT (codigo) DO NOTHING
                    """, (producto_id, producto_id, f'Producto {producto_id}'))

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

                        # Commit cada 1000 registros
                        if records_loaded % 1000 == 0:
                            pg_conn.commit()
                            self.logger.info(f"   💾 Commit: {records_loaded:,} registros cargados...")

                    except Exception as e:
                        self.logger.error(f"❌ Error en registro {idx}: {str(e)}")
                        errors += 1
                        if errors > 10:  # Stop after 10 errors
                            self.logger.error(f"⚠️  Demasiados errores, deteniendo carga")
                            break

                # Commit final
                pg_conn.commit()
                self.logger.info(f"✅ Carga completada: {records_loaded:,} registros, {errors} errores")

        except Exception as e:
            self.logger.error(f"❌ Error cargando ventas a PostgreSQL: {str(e)}")
            return {
                "success": False,
                "message": f"Error en carga: {str(e)}",
                "records_loaded": records_loaded
            }

        return {
            "success": errors == 0,
            "message": f"Ventas cargadas (DB_MODE=postgresql)",
            "records_loaded": records_loaded,
            "errors": errors
        }