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
            conn = self.get_connection()

            # Agregar fecha de carga
            df['fecha_carga'] = datetime.now()

            registros_insertados = 0
            errores = 0

            # Procesar en lotes
            total_lotes = (len(df) + batch_size - 1) // batch_size

            for i in range(0, len(df), batch_size):
                lote_num = i // batch_size + 1
                lote_df = df.iloc[i:i + batch_size].copy()

                self.logger.info(f"🔄 Procesando lote {lote_num}/{total_lotes} ({len(lote_df)} registros)")

                try:
                    # Preparar lote para inserción con manejo de NULLs
                    lote_prep = lote_df.copy()

                    # Convertir columnas categóricas a string antes de fillna
                    for col in lote_prep.columns:
                        if lote_prep[col].dtype.name == 'category':
                            lote_prep[col] = lote_prep[col].astype(str)

                    # Para columnas de texto, reemplazar NaN con cadenas vacías
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

                    # Para columnas numéricas, convertir a string manteniendo NaN como 'NULL'
                    numeric_columns = [
                        'cantidad_vendida', 'peso_unitario', 'volumen_unitario',
                        'peso_calculado', 'peso_total_vendido', 'volumen_total_vendido',
                        'costo_unitario', 'precio_unitario', 'impuesto_porcentaje', 'precio_por_kg',
                        'costo_total', 'venta_total', 'utilidad_bruta', 'margen_bruto_pct',
                        'impuesto_total', 'venta_sin_impuesto'
                    ]

                    # Aplicar fillna selectivamente con manejo robusto
                    for col in lote_prep.columns:
                        if col in text_columns:
                            # Para campos de texto: reemplazar NaN con cadenas vacías
                            lote_prep[col] = lote_prep[col].fillna('').astype(str).replace('nan', '')
                        elif col in numeric_columns:
                            # Para campos numéricos: convertir a string, manteniendo NaN como 'NULL'
                            lote_prep[col] = lote_prep[col].astype(str).replace('nan', 'NULL').replace('None', 'NULL')
                        else:
                            # Para cualquier otra columna no clasificada, tratarla como texto
                            lote_prep[col] = lote_prep[col].fillna('').astype(str).replace('nan', '')

                    # Insertar lote en ventas_raw con mapeo explícito de columnas
                    conn.register('temp_ventas', lote_prep)

                    # Construir lista de columnas de la tabla en el orden correcto
                    table_columns = [
                        'numero_factura', 'ubicacion_id', 'ubicacion_nombre', 'linea',
                        'fecha', 'hora', 'fecha_hora_completa', 'ano', 'mes', 'dia',
                        'dia_semana', 'nombre_dia', 'nombre_mes', 'turno', 'periodo_dia', 'tipo_dia',
                        'codigo_transaccion', 'codigo_producto', 'descripcion_producto',
                        'marca_producto', 'modelo_producto', 'cuadrante_producto', 'presentacion_producto',
                        'categoria_producto', 'grupo_producto', 'subgrupo_producto',
                        'categoria_especial', 'categoria_precio', 'tipo_venta',
                        'cantidad_vendida', 'peso_unitario', 'volumen_unitario',
                        'peso_calculado', 'peso_total_vendido', 'volumen_total_vendido', 'tipo_peso',
                        'costo_unitario', 'precio_unitario', 'impuesto_porcentaje', 'precio_por_kg',
                        'costo_total', 'venta_total', 'utilidad_bruta', 'margen_bruto_pct',
                        'impuesto_total', 'venta_sin_impuesto',
                        'es_peso_variable', 'producto_alta_rotacion', 'venta_alto_valor', 'tamano_transaccion',
                        'fecha_extraccion', 'fecha_transformacion', 'version_transformacion'
                    ]

                    # Verificar qué columnas están disponibles en el DataFrame
                    available_columns = [col for col in table_columns if col in lote_prep.columns]

                    # Construir query con manejo de NULLs para campos numéricos
                    select_list = []
                    for col in available_columns:
                        if col in numeric_columns:
                            # Para campos numéricos, convertir 'NULL' string a NULL real
                            select_list.append(f"CASE WHEN \"{col}\" = 'NULL' THEN NULL ELSE \"{col}\" END AS {col}")
                        else:
                            # Para campos de texto, usar directamente
                            select_list.append(f'"{col}"')
                    select_columns = ', '.join(select_list)

                    insert_query = f"""
                    INSERT INTO ventas_raw ({', '.join(available_columns)})
                    SELECT {select_columns} FROM temp_ventas
                    """

                    conn.execute(insert_query)
                    registros_insertados += len(lote_df)

                    self.logger.info(f"✅ Lote {lote_num}/{total_lotes} completado")

                except Exception as e:
                    errores += len(lote_df)
                    self.logger.error(f"❌ Error en lote {lote_num}: {str(e)}")

            # ETL enfocado solo en extracción y carga - sin procesamiento adicional

            conn.close()

            fin = datetime.now()
            duracion = (fin - inicio).total_seconds()

            # Registrar en log de ETL (after calculating duration)
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