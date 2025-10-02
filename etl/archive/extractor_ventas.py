#!/usr/bin/env python3
"""
Extractor de datos de ventas para ETL - La Granja Mercado
Extrae transacciones de ventas desde SQL Server
"""

import pyodbc
import pandas as pd
from typing import Optional, Dict, Any
from datetime import datetime, date
import logging
from pathlib import Path

from config import ETLConfig

class VentasExtractor:
    """Extractor especializado para datos de ventas"""

    def __init__(self):
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_ventas_extractor')
        logger.setLevel(logging.INFO)

        log_file = ETLConfig.LOG_DIR / f"ventas_extractor_{datetime.now().strftime('%Y%m%d')}.log"
        handler = logging.FileHandler(log_file)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        return logger

    def _create_connection_string(self, config) -> str:
        """Crea la cadena de conexión para SQL Server"""
        return (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={config.server_ip},{config.port};"
            f"DATABASE={config.database_name};"
            f"UID={config.username};"
            f"PWD={config.password};"
            f"Encrypt=no;"
            f"TrustServerCertificate=yes;"
            f"Connection Timeout=30;"
        )

    def extract_ventas_data(self,
                          config,
                          fecha_inicio: date,
                          fecha_fin: date,
                          limite_registros: int = 10000,
                          query_file: str = "query_ventas_generic.sql") -> Optional[pd.DataFrame]:
        """
        Extrae datos de ventas para un rango de fechas específico

        Args:
            config: Configuración de la base de datos
            fecha_inicio: Fecha inicial del rango
            fecha_fin: Fecha final del rango
            limite_registros: Límite máximo de registros
            query_file: Archivo con el query SQL

        Returns:
            DataFrame con los datos de ventas o None si falla
        """

        self.logger.info(f"📄 Cargando query desde: {Path(__file__).parent / query_file}")

        # Cargar el query desde archivo
        query_path = Path(__file__).parent / query_file
        if not query_path.exists():
            self.logger.error(f"❌ Archivo de query no encontrado: {query_path}")
            return None

        with open(query_path, 'r', encoding='utf-8') as f:
            query_template = f.read()

        # Reemplazar parámetros dinámicos
        query = query_template.format(
            fecha_inicio=fecha_inicio.strftime('%Y-%m-%d'),
            fecha_fin=fecha_fin.strftime('%Y-%m-%d'),
            limite_registros=limite_registros
        )

        self.logger.info(f"📄 Query preparado: {len(query)} caracteres")
        self.logger.info(f"📅 Rango: {fecha_inicio} a {fecha_fin}")
        self.logger.info(f"🔢 Límite: {limite_registros:,} registros")

        # Intentar conexión y extracción
        max_intentos = 3
        for intento in range(1, max_intentos + 1):
            try:
                self.logger.info(f"🔌 Conectando a {config.ubicacion_nombre} (intento {intento}/3)")
                self.logger.info(f"   📡 {config.server_ip}:{config.port}")

                # Crear conexión
                connection_string = self._create_connection_string(config)
                conn = pyodbc.connect(connection_string)

                self.logger.info(f"✅ Conexión exitosa a {config.ubicacion_nombre}")

                # Ejecutar query
                self.logger.info(f"📊 Ejecutando query de ventas en {config.ubicacion_nombre}")
                inicio = datetime.now()

                df = pd.read_sql_query(query, conn)

                fin = datetime.now()
                duracion = (fin - inicio).total_seconds()

                conn.close()

                if df.empty:
                    self.logger.warning(f"⚠️ No se encontraron ventas para el período {fecha_inicio} - {fecha_fin}")
                    return df

                self.logger.info(f"✅ Datos extraídos de {config.ubicacion_nombre}: {len(df):,} registros en {duracion:.2f}s")

                # Agregar metadatos
                df['ubicacion_id'] = config.ubicacion_id
                df['ubicacion_nombre'] = config.ubicacion_nombre
                df['fecha_extraccion'] = datetime.now()

                return df

            except pyodbc.OperationalError as e:
                error_msg = str(e)
                if 'timeout expired' in error_msg.lower():
                    self.logger.error(f"❌ Error conectando a {config.ubicacion_nombre}: Timeout de conexión")
                else:
                    self.logger.error(f"❌ Error conectando a {config.ubicacion_nombre}: {error_msg}")

                self.logger.error(f"❌ No se pudo conectar a {config.ubicacion_nombre}")

                if intento < max_intentos:
                    self.logger.info(f"🔄 Reintentando en 5 segundos...")
                    import time
                    time.sleep(5)

            except Exception as e:
                self.logger.error(f"❌ Error inesperado en {config.ubicacion_nombre}: {str(e)}")
                if intento < max_intentos:
                    self.logger.info(f"🔄 Reintentando (intento {intento + 1}/3) en 5 segundos...")
                    import time
                    time.sleep(5)

        self.logger.error(f"💥 Falló extracción de ventas de {config.ubicacion_nombre} después de {max_intentos} intentos")
        return None

    def validar_datos_ventas(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Valida la calidad de los datos extraídos

        Returns:
            Dict con estadísticas de validación
        """
        if df.empty:
            return {
                "valido": False,
                "registros": 0,
                "errores": ["DataFrame vacío"]
            }

        errores = []
        advertencias = []

        # Validaciones básicas
        campos_requeridos = [
            'numero_factura', 'fecha', 'codigo_producto',
            'cantidad_vendida', 'precio_unitario'
        ]

        for campo in campos_requeridos:
            if campo not in df.columns:
                errores.append(f"Campo requerido faltante: {campo}")
            elif df[campo].isna().sum() > len(df) * 0.5:  # Más del 50% nulos
                advertencias.append(f"Campo {campo} tiene {df[campo].isna().sum()} valores nulos")

        # Validaciones de negocio
        if 'cantidad_vendida' in df.columns:
            cantidades_negativas = df[df['cantidad_vendida'] <= 0]
            if len(cantidades_negativas) > 0:
                advertencias.append(f"{len(cantidades_negativas)} registros con cantidad <= 0")

        if 'precio_unitario' in df.columns:
            precios_negativos = df[df['precio_unitario'] <= 0]
            if len(precios_negativos) > 0:
                advertencias.append(f"{len(precios_negativos)} registros con precio <= 0")

        # Validaciones de fechas
        if 'fecha' in df.columns:
            try:
                fechas_futuras = df[pd.to_datetime(df['fecha']) > datetime.now()]
                if len(fechas_futuras) > 0:
                    advertencias.append(f"{len(fechas_futuras)} registros con fechas futuras")
            except:
                errores.append("Error procesando fechas")

        return {
            "valido": len(errores) == 0,
            "registros": len(df),
            "errores": errores,
            "advertencias": advertencias,
            "rango_fechas": {
                "desde": df['fecha'].min() if 'fecha' in df.columns else None,
                "hasta": df['fecha'].max() if 'fecha' in df.columns else None
            },
            "estadisticas": {
                "total_facturas": df['numero_factura'].nunique() if 'numero_factura' in df.columns else 0,
                "total_productos": df['codigo_producto'].nunique() if 'codigo_producto' in df.columns else 0,
                "venta_total": df['venta_total'].sum() if 'venta_total' in df.columns else 0
            }
        }