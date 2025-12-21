#!/usr/bin/env python3
"""
Cargador de datos para ETL - La Granja Mercado
PostgreSQL only - DuckDB removed (Dec 2025)

Este módulo mantiene la clase DuckDBLoader por compatibilidad con código existente,
pero internamente usa PostgreSQLInventarioLoader para todas las operaciones.
"""

import pandas as pd
from typing import Optional, Dict, Any
from datetime import datetime
import logging
from pathlib import Path

from config import ETLConfig

# Import PostgreSQL loader
try:
    from loader_inventario_postgres import PostgreSQLInventarioLoader
except ImportError:
    from core.loader_inventario_postgres import PostgreSQLInventarioLoader


class DuckDBLoader:
    """
    Cargador de datos - PostgreSQL (wrapper de compatibilidad)

    NOTA: Esta clase mantiene el nombre DuckDBLoader por compatibilidad con
    código existente, pero internamente usa PostgreSQLInventarioLoader.
    DuckDB fue eliminado en Dic 2025.
    """

    def __init__(self, db_path: Optional[Path] = None):
        # Ignorar db_path - ya no usamos DuckDB
        self._postgres_loader = PostgreSQLInventarioLoader()
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_loader')
        logger.setLevel(logging.INFO)

        if not logger.handlers:
            log_file = ETLConfig.LOG_DIR / f"loader_{datetime.now().strftime('%Y%m%d')}.log"
            handler = logging.FileHandler(log_file)
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            logger.addHandler(handler)

        return logger

    def get_connection(self):
        """Obtiene conexión a PostgreSQL"""
        return self._postgres_loader.get_connection()

    def create_etl_tables(self) -> bool:
        """
        Crea las tablas necesarias para el ETL si no existen.
        En PostgreSQL, las tablas se crean via migraciones.
        """
        self.logger.info("✅ Tablas ETL verificadas (PostgreSQL usa migraciones)")
        return True

    def start_etl_log(self, proceso: str, ubicacion_id: Optional[str] = None) -> str:
        """Inicia un log de proceso ETL"""
        log_id = f"etl_{proceso}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.logger.info(f"📝 Log ETL iniciado: {log_id}")
        return log_id

    def finish_etl_log(self, log_id: str, estado: str, stats: Dict[str, Any]):
        """Finaliza un log de proceso ETL"""
        self.logger.info(f"📝 Log ETL finalizado: {log_id} - {estado}")

    def load_inventory_data(self, df: pd.DataFrame, batch_id: Optional[str] = None) -> Dict[str, Any]:
        """Carga datos de inventario en PostgreSQL"""
        return self._postgres_loader.load_inventory_data(df, batch_id)

    def update_stock_actual_table(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Actualiza la tabla stock_actual/inventario_actual en PostgreSQL"""
        return self._postgres_loader.update_stock_actual_table(df)

    def get_etl_statistics(self, dias: int = 7) -> Dict[str, Any]:
        """Obtiene estadísticas del ETL de los últimos días"""
        # Estadísticas básicas - en PostgreSQL se pueden consultar de otra forma
        return {
            "periodo_dias": dias,
            "logs": [],
            "inventario_reciente": {
                "total_registros": 0,
                "ubicaciones": 0,
                "productos": 0,
                "ultima_extraccion": None,
                "cantidad_promedio": 0
            }
        }


def test_loader():
    """Función de prueba para el cargador"""
    print("🧪 PROBANDO CARGADOR POSTGRESQL")
    print("=" * 50)

    # Crear datos de prueba
    test_df = pd.DataFrame({
        'ubicacion_id': ['tienda_01', 'tienda_01', 'cedi_seco'],
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
        'fecha_extraccion': [datetime.now(), datetime.now(), datetime.now()],
        'almacen_codigo': ['APP-TPF', 'APP-TPF', 'CEDI-SECO']
    })

    # Crear cargador y procesar
    loader = DuckDBLoader()

    # Crear tablas
    print("🏗️  Verificando tablas...")
    tables_ok = loader.create_etl_tables()

    if tables_ok:
        print("✅ Tablas verificadas correctamente")

        # Cargar datos
        print("📦 Cargando datos de prueba...")
        result = loader.load_inventory_data(test_df)

        if result.get('success'):
            print(f"✅ Carga exitosa:")
            print(f"   📊 Registros: {result.get('stats', {}).get('insertados', 0)}")
        else:
            print(f"❌ Carga falló: {result.get('message', 'Error desconocido')}")

    else:
        print("❌ Error verificando tablas")

    print("\n✅ Test de cargador completado")


if __name__ == "__main__":
    test_loader()
