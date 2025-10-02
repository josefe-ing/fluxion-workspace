#!/usr/bin/env python3
"""
Extractor de datos SQL Server para ETL - La Granja Mercado
Maneja conexiones múltiples y extracción de inventarios
"""

import pyodbc
import pandas as pd
from typing import Optional, Dict, List, Any
from datetime import datetime
import logging
from pathlib import Path
import time

from config import DatabaseConfig, ETLConfig

class SQLServerExtractor:
    """Extractor de datos desde SQL Server"""

    def __init__(self):
        self.logger = self._setup_logger()
        self.active_connections: Dict[str, pyodbc.Connection] = {}

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger para el extractor"""
        logger = logging.getLogger('etl_extractor')
        logger.setLevel(logging.INFO)

        # Handler para archivo
        log_file = ETLConfig.LOG_DIR / f"extractor_{datetime.now().strftime('%Y%m%d')}.log"
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.INFO)

        # Handler para consola
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)

        # Formato
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)

        logger.addHandler(file_handler)
        logger.addHandler(console_handler)

        return logger

    def create_connection(self, config: DatabaseConfig) -> Optional[pyodbc.Connection]:
        """Crea una conexión a SQL Server"""

        try:
            # String de conexión SQL Server
            connection_string = (
                f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                f"SERVER={config.server_ip},{config.port};"
                f"DATABASE={config.database_name};"
                f"UID={config.username};"
                f"PWD={config.password};"
                f"TrustServerCertificate=yes;"
                f"Connection Timeout={config.timeout_seconds};"
            )

            self.logger.info(f"🔌 Conectando a {config.ubicacion_nombre} ({config.server_ip})")

            connection = pyodbc.connect(
                connection_string,
                timeout=config.timeout_seconds
            )

            # Configurar la conexión
            connection.autocommit = True

            self.logger.info(f"✅ Conexión exitosa a {config.ubicacion_nombre}")
            return connection

        except pyodbc.Error as e:
            self.logger.error(f"❌ Error conectando a {config.ubicacion_nombre}: {str(e)}")
            return None

        except Exception as e:
            self.logger.error(f"❌ Error inesperado conectando a {config.ubicacion_nombre}: {str(e)}")
            return None

    def test_connection(self, config: DatabaseConfig) -> bool:
        """Prueba la conexión a una base de datos"""

        connection = self.create_connection(config)

        if connection:
            try:
                # Test query simple
                cursor = connection.cursor()
                cursor.execute("SELECT 1 as test")
                result = cursor.fetchone()

                if result and result[0] == 1:
                    self.logger.info(f"✅ Test de conexión exitoso para {config.ubicacion_nombre}")
                    connection.close()
                    return True

            except Exception as e:
                self.logger.error(f"❌ Error en test de conexión para {config.ubicacion_nombre}: {str(e)}")

            finally:
                if connection:
                    connection.close()

        return False

    def get_connection(self, config: DatabaseConfig) -> Optional[pyodbc.Connection]:
        """Obtiene una conexión (reutiliza si existe)"""

        connection_key = f"{config.ubicacion_id}_{config.server_ip}"

        # Verificar si ya existe una conexión activa
        if connection_key in self.active_connections:
            try:
                # Test de la conexión existente
                connection = self.active_connections[connection_key]
                cursor = connection.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                return connection

            except Exception:
                # La conexión está cerrada, removerla
                self.logger.warning(f"🔄 Reconectando a {config.ubicacion_nombre}")
                del self.active_connections[connection_key]

        # Crear nueva conexión
        connection = self.create_connection(config)
        if connection:
            self.active_connections[connection_key] = connection

        return connection

    def load_query_from_file(self, query_file: str) -> str:
        """Carga query desde un archivo SQL"""

        query_path = Path(query_file)
        if not query_path.is_absolute():
            # Si es relativo, buscar en el directorio del script
            query_path = Path(__file__).parent / query_file

        if not query_path.exists():
            raise FileNotFoundError(f"Archivo de query no encontrado: {query_path}")

        self.logger.info(f"📄 Cargando query desde: {query_path}")

        with open(query_path, 'r', encoding='utf-8') as f:
            query = f.read().strip()

        if not query:
            raise ValueError(f"El archivo de query está vacío: {query_path}")

        self.logger.info(f"📄 Query cargado: {len(query)} caracteres, inicia con: {query[:50]}...")
        return query

    def load_and_parameterize_query(self, query_file: str, parameters: dict = None) -> str:
        """Carga query desde archivo y reemplaza parámetros dinámicos"""

        query = self.load_query_from_file(query_file)

        if parameters:
            # Reemplazar parámetros en el query
            for param_name, param_value in parameters.items():
                placeholder = f"{{{param_name}}}"
                query = query.replace(placeholder, str(param_value))
                self.logger.info(f"🔧 Parámetro {param_name} = {param_value}")

        return query

    def extract_inventory_data(self, config: DatabaseConfig, query: str = None, query_file: str = None, query_params: dict = None) -> Optional[pd.DataFrame]:
        """Extrae datos de inventario usando el query personalizado"""

        max_reintentos = config.max_reintentos
        reintento = 0

        # Determinar el query a usar
        if query_file:
            if query_params:
                query = self.load_and_parameterize_query(query_file, query_params)
            else:
                query = self.load_query_from_file(query_file)
        elif not query:
            raise ValueError("Debe proporcionar 'query' o 'query_file'")

        while reintento < max_reintentos:
            try:
                connection = self.get_connection(config)

                if not connection:
                    self.logger.error(f"❌ No se pudo conectar a {config.ubicacion_nombre}")
                    reintento += 1
                    if reintento < max_reintentos:
                        time.sleep(5)
                    continue

                self.logger.info(f"📊 Ejecutando query de inventario en {config.ubicacion_nombre}")
                start_time = time.time()

                # Ejecutar query y obtener datos
                df = pd.read_sql_query(query, connection)

                execution_time = time.time() - start_time
                self.logger.info(f"✅ Datos extraídos de {config.ubicacion_nombre}: {len(df)} registros en {execution_time:.2f}s")

                # Agregar metadatos
                df['ubicacion_id'] = config.ubicacion_id
                df['ubicacion_nombre'] = config.ubicacion_nombre
                df['tipo_ubicacion'] = config.tipo
                df['fecha_extraccion'] = datetime.now()
                df['server_ip'] = config.server_ip

                return df

            except pd.errors.DatabaseError as e:
                self.logger.error(f"❌ Error SQL en {config.ubicacion_nombre}: {str(e)}")
                reintento += 1
                if reintento < max_reintentos:
                    self.logger.info(f"🔄 Reintentando ({reintento}/{max_reintentos}) en 5 segundos...")
                    time.sleep(5)

            except Exception as e:
                self.logger.error(f"❌ Error inesperado en {config.ubicacion_nombre}: {str(e)}")
                reintento += 1
                if reintento < max_reintentos:
                    time.sleep(5)

        self.logger.error(f"💥 Falló extracción de {config.ubicacion_nombre} después de {max_reintentos} intentos")
        return None

    def extract_multiple_inventories(self, configs: List[DatabaseConfig], query: str = None, query_file: str = None) -> Dict[str, pd.DataFrame]:
        """Extrae inventarios de múltiples ubicaciones"""

        results = {}
        total_configs = len(configs)

        self.logger.info(f"🚀 Iniciando extracción de {total_configs} ubicaciones")

        for i, config in enumerate(configs, 1):
            self.logger.info(f"📍 Procesando [{i}/{total_configs}]: {config.ubicacion_nombre}")

            df = self.extract_inventory_data(config, query=query, query_file=query_file)

            if df is not None:
                results[config.ubicacion_id] = df
                self.logger.info(f"✅ [{i}/{total_configs}] Completado: {config.ubicacion_nombre}")
            else:
                self.logger.error(f"❌ [{i}/{total_configs}] Falló: {config.ubicacion_nombre}")

        self.logger.info(f"📊 Extracción completada: {len(results)}/{total_configs} exitosas")
        return results

    def close_connections(self):
        """Cierra todas las conexiones activas"""
        for connection_key, connection in self.active_connections.items():
            try:
                connection.close()
                self.logger.info(f"🔌 Conexión cerrada: {connection_key}")
            except Exception as e:
                self.logger.warning(f"⚠️  Error cerrando conexión {connection_key}: {str(e)}")

        self.active_connections.clear()

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - cierra conexiones"""
        self.close_connections()


# Query ejemplo para inventario (debe ser personalizado según el esquema real)
INVENTORY_QUERY_TEMPLATE = """
SELECT
    -- Identificación del producto
    p.codigo_producto,
    p.codigo_barras,
    p.descripcion_producto,
    p.categoria,
    p.subcategoria,
    p.marca,
    p.presentacion,

    -- Stock actual
    i.cantidad_actual,
    i.cantidad_disponible,
    i.cantidad_reservada,
    i.cantidad_en_transito,

    -- Costos y valores
    p.costo_unitario_actual,
    p.precio_venta_actual,
    i.valor_inventario_actual,

    -- Control de stock
    p.stock_minimo,
    p.stock_maximo,
    p.punto_reorden,

    -- Fechas
    i.fecha_ultima_entrada,
    i.fecha_ultima_salida,
    i.fecha_ultimo_conteo,

    -- Ubicación física
    u.ubicacion_fisica,
    u.pasillo,
    u.estante,

    -- Estado
    p.activo,
    p.es_perecedero,
    p.dias_vencimiento

FROM productos p
    INNER JOIN inventario i ON p.id_producto = i.id_producto
    LEFT JOIN ubicaciones_fisicas u ON i.id_ubicacion_fisica = u.id_ubicacion_fisica

WHERE p.activo = 1
    AND i.cantidad_actual >= 0

ORDER BY p.categoria, p.descripcion_producto
"""

def test_extractor():
    """Función para probar el extractor"""

    print("🧪 PROBANDO EXTRACTOR SQL SERVER")
    print("=" * 50)

    # Crear extractor
    with SQLServerExtractor() as extractor:

        # Probar conexiones
        print("\n🔌 Probando conexiones...")

        active_dbs = ETLConfig.get_active_databases()

        for config in active_dbs[:3]:  # Solo probar las primeras 3
            print(f"\n📍 {config.ubicacion_nombre}:")
            success = extractor.test_connection(config)

            if success:
                print(f"   ✅ Conexión exitosa")
            else:
                print(f"   ❌ Falló la conexión")

    print("\n✅ Test de extractor completado")

if __name__ == "__main__":
    test_extractor()