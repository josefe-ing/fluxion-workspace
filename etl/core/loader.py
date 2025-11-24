#!/usr/bin/env python3
"""
Cargador de datos para ETL - La Granja Mercado
Inserta datos transformados en DuckDB
"""

import duckdb
import pandas as pd
from typing import Optional, Dict, List, Any, Tuple
from datetime import datetime
import logging
from pathlib import Path
import json

from config import ETLConfig

class DuckDBLoader:
    """Cargador de datos a DuckDB"""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or ETLConfig.DUCKDB_PATH
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_loader')
        logger.setLevel(logging.INFO)

        log_file = ETLConfig.LOG_DIR / f"loader_{datetime.now().strftime('%Y%m%d')}.log"
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

    def create_etl_tables(self) -> bool:
        """Crea las tablas necesarias para el ETL si no existen"""

        try:
            conn = self.get_connection()

            # Tabla para datos de inventario en crudo
            conn.execute("""
                CREATE TABLE IF NOT EXISTS inventario_raw (
                    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

                    -- Identificación
                    ubicacion_id VARCHAR NOT NULL,
                    ubicacion_nombre VARCHAR,
                    tipo_ubicacion VARCHAR,
                    codigo_producto VARCHAR NOT NULL,
                    codigo_barras VARCHAR,

                    -- Descripción del producto
                    descripcion_producto VARCHAR NOT NULL,
                    categoria VARCHAR,
                    subcategoria VARCHAR,
                    marca VARCHAR,
                    presentacion VARCHAR,

                    -- Características del producto
                    peso_producto DECIMAL(12,4),
                    volumen_producto DECIMAL(12,4),
                    tipo_peso VARCHAR(20),
                    cantidad_bultos DECIMAL(12,4),

                    -- Cantidades
                    cantidad_actual DECIMAL(12,4) DEFAULT 0,
                    cantidad_disponible DECIMAL(12,4) DEFAULT 0,
                    cantidad_reservada DECIMAL(12,4) DEFAULT 0,
                    cantidad_en_transito DECIMAL(12,4) DEFAULT 0,

                    -- Valores monetarios
                    costo_unitario_actual DECIMAL(12,4),
                    precio_venta_actual DECIMAL(12,4),
                    valor_inventario_actual DECIMAL(18,2),
                    margen_porcentaje DECIMAL(5,2),

                    -- Control de stock
                    stock_minimo DECIMAL(12,4),
                    stock_maximo DECIMAL(12,4),
                    punto_reorden DECIMAL(12,4),
                    estado_stock VARCHAR(20) DEFAULT 'NORMAL',

                    -- Ubicación física
                    ubicacion_fisica VARCHAR(100),
                    pasillo VARCHAR(20),
                    estante VARCHAR(20),

                    -- Fechas
                    fecha_ultima_entrada TIMESTAMP,
                    fecha_ultima_salida TIMESTAMP,
                    fecha_ultimo_conteo TIMESTAMP,
                    dias_sin_movimiento INTEGER DEFAULT 0,

                    -- Control
                    activo BOOLEAN DEFAULT true,
                    es_perecedero BOOLEAN DEFAULT false,
                    dias_vencimiento INTEGER,

                    -- Metadatos ETL
                    fecha_extraccion TIMESTAMP NOT NULL,
                    server_ip VARCHAR(50),
                    batch_id VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    -- Constraints
                    CONSTRAINT uk_inventario_raw UNIQUE (ubicacion_id, codigo_producto, fecha_extraccion)
                )
            """)

            # Tabla para logs del ETL
            conn.execute("""
                CREATE TABLE IF NOT EXISTS etl_logs (
                    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
                    proceso VARCHAR(50) NOT NULL,
                    ubicacion_id VARCHAR,
                    fecha_inicio TIMESTAMP NOT NULL,
                    fecha_fin TIMESTAMP,
                    estado VARCHAR(20) NOT NULL, -- 'INICIADO', 'EXITOSO', 'FALLIDO'
                    registros_procesados INTEGER DEFAULT 0,
                    registros_insertados INTEGER DEFAULT 0,
                    registros_actualizados INTEGER DEFAULT 0,
                    registros_errores INTEGER DEFAULT 0,
                    tiempo_ejecucion_segundos DECIMAL(10,2),
                    mensaje TEXT,
                    detalles JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Índices para performance
            try:
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inventario_raw_ubicacion ON inventario_raw(ubicacion_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inventario_raw_producto ON inventario_raw(codigo_producto)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inventario_raw_fecha ON inventario_raw(fecha_extraccion)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_etl_logs_proceso ON etl_logs(proceso, fecha_inicio)")
            except Exception as e:
                self.logger.warning(f"⚠️  Advertencia creando índices: {str(e)}")

            conn.close()

            self.logger.info("✅ Tablas ETL verificadas/creadas")
            return True

        except Exception as e:
            self.logger.error(f"❌ Error creando tablas ETL: {str(e)}")
            return False

    def start_etl_log(self, proceso: str, ubicacion_id: Optional[str] = None) -> str:
        """Inicia un log de proceso ETL"""

        try:
            conn = self.get_connection()

            log_id = f"etl_{proceso}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

            conn.execute("""
                INSERT INTO etl_logs
                (id, proceso, ubicacion_id, fecha_inicio, estado)
                VALUES (?, ?, ?, ?, 'INICIADO')
            """, (log_id, proceso, ubicacion_id, datetime.now()))

            conn.close()

            self.logger.info(f"📝 Log ETL iniciado: {log_id}")
            return log_id

        except Exception as e:
            self.logger.error(f"❌ Error iniciando log ETL: {str(e)}")
            return f"error_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    def finish_etl_log(self, log_id: str, estado: str, stats: Dict[str, Any]):
        """Finaliza un log de proceso ETL"""

        try:
            conn = self.get_connection()

            tiempo_ejecucion = stats.get('tiempo_ejecucion', 0)

            conn.execute("""
                UPDATE etl_logs
                SET fecha_fin = ?,
                    estado = ?,
                    registros_procesados = ?,
                    registros_insertados = ?,
                    registros_actualizados = ?,
                    registros_errores = ?,
                    tiempo_ejecucion_segundos = ?,
                    mensaje = ?,
                    detalles = ?
                WHERE id = ?
            """, (
                datetime.now(),
                estado,
                stats.get('procesados', 0),
                stats.get('insertados', 0),
                stats.get('actualizados', 0),
                stats.get('errores', 0),
                tiempo_ejecucion,
                stats.get('mensaje', ''),
                json.dumps(stats.get('detalles', {})),
                log_id
            ))

            conn.close()

            self.logger.info(f"📝 Log ETL finalizado: {log_id} - {estado}")

        except Exception as e:
            self.logger.error(f"❌ Error finalizando log ETL: {str(e)}")

    def load_inventory_data(self, df: pd.DataFrame, batch_id: Optional[str] = None) -> Dict[str, Any]:
        """Carga datos de inventario en DuckDB"""

        if df.empty:
            self.logger.warning("⚠️  No hay datos para cargar")
            return {"success": False, "message": "Sin datos para cargar"}

        # Asegurar que las tablas existan antes de cargar
        self.create_etl_tables()

        start_time = datetime.now()
        batch_id = batch_id or f"batch_{start_time.strftime('%Y%m%d_%H%M%S')}"

        # Iniciar log
        log_id = self.start_etl_log("carga_inventario")

        try:
            conn = self.get_connection()

            # Agregar batch_id a los datos
            df['batch_id'] = batch_id

            initial_count = len(df)
            self.logger.info(f"📦 Cargando {initial_count:,} registros de inventario")

            # Estrategia: INSERT con ON CONFLICT para manejar duplicados
            inserted_count = 0
            updated_count = 0
            error_count = 0

            # Procesar en lotes para mejor performance
            batch_size = 1000
            total_batches = (len(df) + batch_size - 1) // batch_size

            for i in range(0, len(df), batch_size):
                batch_df = df.iloc[i:i+batch_size].copy()
                current_batch = (i // batch_size) + 1

                try:
                    self.logger.info(f"🔄 Procesando lote {current_batch}/{total_batches} ({len(batch_df)} registros)")

                    # Usar REPLACE para manejar duplicados automáticamente
                    conn.execute("BEGIN TRANSACTION")

                    # Eliminar TODOS los registros existentes para esta ubicación (SOLO EN EL PRIMER LOTE)
                    # Esto previene duplicados al re-ejecutar el ETL
                    if current_batch == 1 and 'ubicacion_id' in batch_df.columns:
                        ubicaciones = batch_df['ubicacion_id'].unique()

                        for ubicacion in ubicaciones:
                            # Contar registros antes de eliminar
                            count_antes = conn.execute("""
                                SELECT COUNT(*) FROM inventario_raw
                                WHERE ubicacion_id = ?
                            """, (ubicacion,)).fetchone()[0]

                            # Eliminar registros
                            conn.execute("""
                                DELETE FROM inventario_raw
                                WHERE ubicacion_id = ?
                            """, (ubicacion,))

                            self.logger.info(f"🗑️  Eliminados {count_antes} registros antiguos de {ubicacion}")

                    # Insertar nuevos datos (excluyendo columnas auto-generadas y problemáticas)
                    conn.register('batch_data', batch_df)

                    # Excluir columnas auto-generadas y las que causan problemas con NULL
                    excluded_columns = ['id', 'created_at', 'fecha_ultima_entrada', 'fecha_ultima_salida', 'fecha_ultimo_conteo', 'dias_vencimiento']
                    columns = [col for col in batch_df.columns if col not in excluded_columns]
                    columns_str = ', '.join(columns)

                    conn.execute(f"""
                        INSERT INTO inventario_raw ({columns_str})
                        SELECT {columns_str} FROM batch_data
                    """)

                    conn.execute("COMMIT")
                    inserted_count += len(batch_df)

                    self.logger.info(f"✅ Lote {current_batch}/{total_batches} completado")

                except Exception as e:
                    conn.execute("ROLLBACK")
                    error_count += len(batch_df)
                    self.logger.error(f"❌ Error en lote {current_batch}: {str(e)}")

            # Estadísticas finales
            end_time = datetime.now()
            execution_time = (end_time - start_time).total_seconds()

            stats = {
                "procesados": initial_count,
                "insertados": inserted_count,
                "actualizados": updated_count,
                "errores": error_count,
                "tiempo_ejecucion": execution_time,
                "mensaje": f"Carga completada: {inserted_count} insertados, {error_count} errores",
                "detalles": {
                    "batch_id": batch_id,
                    "ubicaciones": df['ubicacion_id'].nunique() if 'ubicacion_id' in df.columns else 0,
                    "productos_unicos": df['codigo_producto'].nunique() if 'codigo_producto' in df.columns else 0
                }
            }

            # Finalizar log
            estado = "EXITOSO" if error_count == 0 else "PARCIAL" if inserted_count > 0 else "FALLIDO"
            self.finish_etl_log(log_id, estado, stats)

            conn.close()

            self.logger.info(f"📊 Carga completada:")
            self.logger.info(f"   📥 Procesados: {initial_count:,}")
            self.logger.info(f"   ✅ Insertados: {inserted_count:,}")
            self.logger.info(f"   ❌ Errores: {error_count:,}")
            self.logger.info(f"   ⏱️  Tiempo: {execution_time:.2f}s")

            return {
                "success": error_count == 0,
                "stats": stats,
                "batch_id": batch_id,
                "log_id": log_id
            }

        except Exception as e:
            execution_time = (datetime.now() - start_time).total_seconds()

            stats = {
                "procesados": len(df),
                "insertados": 0,
                "actualizados": 0,
                "errores": len(df),
                "tiempo_ejecucion": execution_time,
                "mensaje": f"Error crítico: {str(e)}",
                "detalles": {}
            }

            self.finish_etl_log(log_id, "FALLIDO", stats)

            self.logger.error(f"❌ Error crítico cargando datos: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "stats": stats,
                "log_id": log_id
            }

    def update_stock_actual_table(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Actualiza la tabla stock_actual con los datos más recientes"""

        if df.empty:
            return {"success": False, "message": "Sin datos para actualizar"}

        try:
            conn = self.get_connection()

            self.logger.info(f"🔄 Actualizando tabla stock_actual con {len(df):,} registros")

            # Preparar datos para stock_actual
            columnas_base = [
                'ubicacion_id', 'codigo_producto', 'cantidad_actual',
                'costo_unitario_actual', 'valor_inventario_actual',
                'stock_minimo', 'stock_maximo', 'fecha_extraccion'
            ]

            # Incluir almacen_codigo si existe en los datos
            tiene_almacen = 'almacen_codigo' in df.columns
            if tiene_almacen:
                columnas_base.append('almacen_codigo')
                self.logger.info(f"   📦 Incluye almacen_codigo en actualización")

            stock_df = df[columnas_base].copy()

            stock_df = stock_df.rename(columns={
                'codigo_producto': 'producto_id',
                'cantidad_actual': 'cantidad',
                'costo_unitario_actual': 'costo_promedio',
                'valor_inventario_actual': 'valor_inventario',
                'fecha_extraccion': 'ultima_actualizacion'
            })

            # Usar REPLACE para actualizar/insertar
            conn.execute("BEGIN TRANSACTION")

            # Registrar DataFrame temporalmente
            conn.register('stock_updates', stock_df)

            # Actualizar stock_actual usando MERGE-like operation
            # IMPORTANTE: Hacer JOIN con productos para obtener el UUID correcto
            # stock_updates.producto_id contiene el CODIGO del producto
            # pero stock_actual.producto_id debe ser el UUID (productos.id)
            if tiene_almacen:
                conn.execute("""
                    INSERT OR REPLACE INTO stock_actual
                    (ubicacion_id, producto_id, cantidad, valor_inventario, costo_promedio,
                     stock_minimo, stock_maximo, ultima_actualizacion, almacen_codigo)
                    SELECT
                        s.ubicacion_id,
                        p.id as producto_id,
                        s.cantidad,
                        s.valor_inventario,
                        s.costo_promedio,
                        s.stock_minimo,
                        s.stock_maximo,
                        s.ultima_actualizacion,
                        s.almacen_codigo
                    FROM stock_updates s
                    INNER JOIN productos p ON p.codigo = s.producto_id
                """)
            else:
                conn.execute("""
                    INSERT OR REPLACE INTO stock_actual
                    (ubicacion_id, producto_id, cantidad, valor_inventario, costo_promedio,
                     stock_minimo, stock_maximo, ultima_actualizacion)
                    SELECT
                        s.ubicacion_id,
                        p.id as producto_id,
                        s.cantidad,
                        s.valor_inventario,
                        s.costo_promedio,
                        s.stock_minimo,
                        s.stock_maximo,
                        s.ultima_actualizacion
                    FROM stock_updates s
                    INNER JOIN productos p ON p.codigo = s.producto_id
                """)

            conn.execute("COMMIT")
            conn.close()

            self.logger.info("✅ Tabla stock_actual actualizada")

            return {
                "success": True,
                "records_updated": len(stock_df),
                "message": "stock_actual actualizado correctamente"
            }

        except Exception as e:
            self.logger.error(f"❌ Error actualizando stock_actual: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": "Error actualizando stock_actual"
            }

    def get_etl_statistics(self, dias: int = 7) -> Dict[str, Any]:
        """Obtiene estadísticas del ETL de los últimos días"""

        try:
            conn = self.get_connection()

            # Estadísticas de logs
            stats_query = f"""
                SELECT
                    proceso,
                    COUNT(*) as total_ejecuciones,
                    SUM(CASE WHEN estado = 'EXITOSO' THEN 1 ELSE 0 END) as exitosos,
                    SUM(CASE WHEN estado = 'FALLIDO' THEN 1 ELSE 0 END) as fallidos,
                    AVG(tiempo_ejecucion_segundos) as tiempo_promedio,
                    SUM(registros_procesados) as total_registros,
                    MAX(fecha_inicio) as ultima_ejecucion
                FROM etl_logs
                WHERE fecha_inicio >= CURRENT_DATE - INTERVAL '{dias} days'
                GROUP BY proceso
                ORDER BY total_ejecuciones DESC
            """

            logs_stats = conn.execute(stats_query).fetchdf()

            # Estadísticas de inventario
            inventory_query = """
                SELECT
                    COUNT(*) as total_registros,
                    COUNT(DISTINCT ubicacion_id) as ubicaciones,
                    COUNT(DISTINCT codigo_producto) as productos,
                    MAX(fecha_extraccion) as ultima_extraccion,
                    AVG(cantidad_actual) as cantidad_promedio
                FROM inventario_raw
                WHERE fecha_extraccion >= CURRENT_DATE - INTERVAL '1 day'
            """

            inventory_stats = conn.execute(inventory_query).fetchone()

            conn.close()

            return {
                "periodo_dias": dias,
                "logs": logs_stats.to_dict('records') if not logs_stats.empty else [],
                "inventario_reciente": {
                    "total_registros": inventory_stats[0] if inventory_stats else 0,
                    "ubicaciones": inventory_stats[1] if inventory_stats else 0,
                    "productos": inventory_stats[2] if inventory_stats else 0,
                    "ultima_extraccion": inventory_stats[3] if inventory_stats else None,
                    "cantidad_promedio": float(inventory_stats[4]) if inventory_stats and inventory_stats[4] else 0
                }
            }

        except Exception as e:
            self.logger.error(f"❌ Error obteniendo estadísticas ETL: {str(e)}")
            return {"error": str(e)}

def test_loader():
    """Función de prueba para el cargador"""

    print("🧪 PROBANDO CARGADOR DUCKDB")
    print("=" * 50)

    # Crear datos de prueba
    test_df = pd.DataFrame({
        'ubicacion_id': ['tienda_01', 'tienda_01', 'cedi_01'],
        'codigo_producto': ['HAR001', 'ARR002', 'ACE003'],
        'descripcion_producto': ['Harina PAN', 'Arroz Primor', 'Aceite Girasol'],
        'categoria': ['Alimentos', 'Alimentos', 'Alimentos'],
        'cantidad_actual': [150.5, 80.0, 1200.0],
        'precio_venta_actual': [3.20, 4.50, 5.10],
        'costo_unitario_actual': [2.50, 3.80, 4.20],
        'stock_minimo': [50, 30, 500],
        'stock_maximo': [500, 300, 5000],
        'valor_inventario_actual': [376.25, 304.0, 5040.0],
        'estado_stock': ['NORMAL', 'NORMAL', 'NORMAL'],
        'fecha_extraccion': [datetime.now(), datetime.now(), datetime.now()]
    })

    # Crear cargador y procesar
    loader = DuckDBLoader()

    # Crear tablas
    print("🏗️  Creando tablas...")
    tables_ok = loader.create_etl_tables()

    if tables_ok:
        print("✅ Tablas creadas correctamente")

        # Cargar datos
        print("📦 Cargando datos de prueba...")
        result = loader.load_inventory_data(test_df)

        if result['success']:
            print(f"✅ Carga exitosa:")
            print(f"   📊 Registros: {result['stats']['insertados']}")
            print(f"   ⏱️  Tiempo: {result['stats']['tiempo_ejecucion']:.2f}s")
            print(f"   🏷️  Batch ID: {result['batch_id']}")

            # Obtener estadísticas
            print("\n📊 Estadísticas ETL:")
            stats = loader.get_etl_statistics(1)
            if 'error' not in stats:
                print(f"   📈 Registros recientes: {stats['inventario_reciente']['total_registros']}")
                print(f"   📍 Ubicaciones: {stats['inventario_reciente']['ubicaciones']}")
                print(f"   🏷️  Productos: {stats['inventario_reciente']['productos']}")
        else:
            print(f"❌ Carga falló: {result.get('error', 'Error desconocido')}")

    else:
        print("❌ Error creando tablas")

    print("\n✅ Test de cargador completado")

if __name__ == "__main__":
    test_loader()