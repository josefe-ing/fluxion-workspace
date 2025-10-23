#!/usr/bin/env python3
"""
Extractor de datos de ventas para ETL - La Granja Mercado
Extrae transacciones de ventas desde SQL Server
"""

import os
import pyodbc
import pandas as pd
from typing import Optional, Dict, Any
from datetime import datetime, date
import logging
from pathlib import Path
import time
import re

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
        """Crea la cadena de conexión para SQL Server (pyodbc)"""
        # SIMPLIFICADO: Usar EXACTAMENTE la misma configuración que inventario (que funciona)
        odbc_driver = os.environ.get('SQL_ODBC_DRIVER', 'ODBC Driver 18 for SQL Server')

        return (
            f"DRIVER={{{odbc_driver}}};"
            f"SERVER={config.server_ip},{config.port};"
            f"DATABASE={config.database_name};"
            f"UID={config.username};"
            f"PWD={config.password};"
            f"TrustServerCertificate=yes;"
            f"Connection Timeout={config.timeout_seconds};"
        )

    def _create_sqlalchemy_engine(self, config):
        """Crea un engine de SQLAlchemy para SQL Server (mejor manejo de conexiones)"""
        odbc_driver = os.environ.get('SQL_ODBC_DRIVER', 'ODBC Driver 17 for SQL Server')

        # Construir connection string para SQLAlchemy con configuración TCP optimizada
        params = quote_plus(
            f"DRIVER={{{odbc_driver}}};"
            f"SERVER={config.server_ip},{config.port};"
            f"DATABASE={config.database_name};"
            f"UID={config.username};"
            f"PWD={config.password};"
            f"Encrypt=no;"
            f"TrustServerCertificate=yes;"
            f"Connection Timeout=600;"
            f"Query Timeout=600;"
            f"PacketSize=32767;"
            f"MARS_Connection=yes;"
            f"KeepAlive=yes;"  # Habilitar TCP keepalive a nivel ODBC
            f"KeepAliveInterval=30;"  # Intervalo de 30 segundos
        )

        connection_string = f"mssql+pyodbc:///?odbc_connect={params}"

        # Crear engine con pool de conexiones
        engine = create_engine(
            connection_string,
            poolclass=pool.NullPool,  # No usar pool, crear conexiones frescas
            connect_args={
                "timeout": 600,
                "autocommit": True
            }
        )

        # Event listener para configurar keepalive a nivel de socket
        from sqlalchemy import event
        import socket

        @event.listens_for(engine, "connect", insert=True)
        def set_socket_keepalive(dbapi_conn, connection_record):
            """Configura TCP keepalive a nivel de socket Python"""
            try:
                # Obtener el socket subyacente del pyodbc connection
                # Nota: esto puede no funcionar en todas las versiones de pyodbc
                # pero no es crítico si falla
                sock = dbapi_conn.connection  # pyodbc connection
                if hasattr(sock, 'socket'):
                    raw_socket = sock.socket()

                    # Habilitar SO_KEEPALIVE
                    raw_socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)

                    # Configurar parámetros TCP keepalive (macOS/Linux)
                    if hasattr(socket, 'TCP_KEEPIDLE'):
                        raw_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 30)  # 30 segundos
                    if hasattr(socket, 'TCP_KEEPINTVL'):
                        raw_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 10)  # 10 segundos
                    if hasattr(socket, 'TCP_KEEPCNT'):
                        raw_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 5)  # 5 reintentos

                    self.logger.info("   🔧 TCP Keepalive configurado en socket")
            except Exception as e:
                # No es crítico si falla, solo informar
                self.logger.debug(f"   ℹ️ Keepalive en socket no disponible: {e}")

        return engine

    def _extract_chunk_with_offset(self,
                                   config,
                                   query_base: str,
                                   offset: int,
                                   fetch_size: int,
                                   max_retries: int = 2) -> Optional[pd.DataFrame]:
        """
        Extrae un chunk de datos usando OFFSET/FETCH, con reconexión en cada chunk
        para evitar timeouts de conexión TCP
        """
        conn = None  # Inicializar conn antes del try

        for retry in range(max_retries):
            try:
                # Nueva conexión para cada chunk (evita timeout de VPN/TCP)
                connection_string = self._create_connection_string(config)
                conn = pyodbc.connect(connection_string)
                conn.timeout = 300

                # Agregar OFFSET/FETCH al final del query
                # Primero remover TOP si existe (incompatible con OFFSET/FETCH)
                query_with_pagination = re.sub(r'SELECT\s+TOP\s+\d+', 'SELECT', query_base, flags=re.IGNORECASE)

                # Agregar paginación al final
                query_with_pagination = query_with_pagination.rstrip().rstrip(';')
                query_with_pagination += f"\nOFFSET {offset} ROWS FETCH NEXT {fetch_size} ROWS ONLY"

                # Ejecutar query rápido (solo fetch_size registros)
                df = pd.read_sql_query(query_with_pagination, conn)
                conn.close()

                return df

            except Exception as e:
                if conn:
                    try:
                        conn.close()
                    except:
                        pass

                if retry < max_retries - 1:
                    self.logger.warning(f"⚠️ Error en chunk offset={offset}, reintentando... ({str(e)})")
                    time.sleep(2)
                else:
                    raise

        return None

    def extract_ventas_data(self,
                          config,
                          fecha_inicio: date,
                          fecha_fin: date,
                          limite_registros: int = None,
                          query_file: str = "query_ventas_generic.sql") -> Optional[pd.DataFrame]:
        """
        Extrae datos de ventas para un rango de fechas específico
        Usa múltiples conexiones cortas (una por chunk) para evitar timeouts TCP

        Args:
            config: Configuración de la base de datos
            fecha_inicio: Fecha inicial del rango
            fecha_fin: Fecha final del rango
            limite_registros: Límite máximo de registros (None = sin límite, extrae todo)
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

        # Reemplazar parámetros dinámicos (sin TOP, usaremos OFFSET/FETCH)
        query_base = query_template.format(
            fecha_inicio=fecha_inicio.strftime('%Y-%m-%d'),
            fecha_fin=fecha_fin.strftime('%Y-%m-%d'),
            limite_registros=limite_registros if limite_registros else 999999999
        )

        self.logger.info(f"📄 Query preparado: {len(query_base)} caracteres")
        self.logger.info(f"📅 Rango: {fecha_inicio} a {fecha_fin}")
        if limite_registros:
            self.logger.info(f"🔢 Límite total: {limite_registros:,} registros")
        else:
            self.logger.info(f"🔢 Sin límite - extrayendo TODOS los registros del período")

        # Intentar extracción con múltiples conexiones cortas
        max_intentos = 3
        for intento in range(1, max_intentos + 1):
            try:
                self.logger.info(f"🔌 Iniciando extracción de {config.ubicacion_nombre} (intento {intento}/3)")
                self.logger.info(f"   📡 {config.server_ip}:{config.port}")

                inicio = datetime.now()

                # SIMPLIFICADO: Usar pyodbc simple, igual que inventario
                self.logger.info(f"   🚀 Extracción con pyodbc simple (como inventario ETL)")

                # Crear conexión simple
                connection_string = self._create_connection_string(config)
                conn = pyodbc.connect(connection_string, timeout=config.timeout_seconds)
                conn.autocommit = True

                self.logger.info(f"   ✅ Conexión establecida")
                self.logger.info(f"   📥 Ejecutando query de ventas...")

                # Remover TOP del query si existe
                query_final = re.sub(r'SELECT\s+TOP\s+\d+', 'SELECT', query_base, flags=re.IGNORECASE)

                # Ejecutar query simple - IGUAL que inventario
                df = pd.read_sql_query(query_final, conn)
                conn.close()

                self.logger.info(f"   ✅ Query completado: {len(df):,} registros extraídos")

                fin = datetime.now()
                duracion = (fin - inicio).total_seconds()

                if df.empty:
                    self.logger.warning(f"⚠️ No se encontraron ventas para el período {fecha_inicio} - {fecha_fin}")
                    return df

                self.logger.info(f"✅ Datos extraídos de {config.ubicacion_nombre}: {len(df):,} registros en {duracion:.2f}s")

                # DEBUG: Verificar cantidad_bultos inmediatamente después de extracción
                if 'cantidad_bultos' in df.columns:
                    non_null_bultos = df[df['cantidad_bultos'].notna()]
                    self.logger.info(f"🔍 DEBUG EXTRACTOR - cantidad_bultos:")
                    self.logger.info(f"   Total registros: {len(df)}")
                    self.logger.info(f"   Con cantidad_bultos no nulo: {len(non_null_bultos)}")
                    if len(non_null_bultos) > 0:
                        self.logger.info(f"   Primeros 5 valores: {non_null_bultos['cantidad_bultos'].head().tolist()}")
                        self.logger.info(f"   Tipos de datos: {df['cantidad_bultos'].dtype}")
                else:
                    self.logger.warning(f"⚠️ DEBUG EXTRACTOR - cantidad_bultos NO está en las columnas extraídas!")
                    self.logger.info(f"   Columnas disponibles: {df.columns.tolist()}")

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
                    time.sleep(5)

            except Exception as e:
                self.logger.error(f"❌ Error inesperado en {config.ubicacion_nombre}: {str(e)}")
                if intento < max_intentos:
                    self.logger.info(f"🔄 Reintentando (intento {intento + 1}/3) en 5 segundos...")
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