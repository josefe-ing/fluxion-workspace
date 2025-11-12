#!/usr/bin/env python3
"""
Extractor de datos de ventas para ETL - Nuevo Proveedor POS (API)
Reemplaza extractor_ventas.py que conectaba a SQL Server
Extrae transacciones de ventas desde API REST del nuevo proveedor POS
"""

import os
import requests
import pandas as pd
from typing import Optional, Dict, Any, List
from datetime import datetime, date
import logging
from pathlib import Path
import time
from dataclasses import dataclass

from config import ETLConfig


@dataclass
class APIConfig:
    """Configuración para el API del nuevo proveedor POS"""
    base_url: str
    api_key: str
    timeout_seconds: int = 600
    max_retries: int = 3
    retry_delay_seconds: int = 5


class VentasAPIExtractor:
    """Extractor especializado para datos de ventas desde API REST"""

    def __init__(self, api_config: Optional[APIConfig] = None):
        self.logger = self._setup_logger()

        # Configuración del API desde variables de entorno
        if api_config is None:
            api_config = APIConfig(
                base_url=os.getenv("POS_API_BASE_URL", "https://pos-api.ejemplo.com"),
                api_key=os.getenv("POS_API_KEY", ""),
                timeout_seconds=int(os.getenv("POS_API_TIMEOUT", "600")),
                max_retries=int(os.getenv("POS_API_MAX_RETRIES", "3")),
                retry_delay_seconds=int(os.getenv("POS_API_RETRY_DELAY", "5"))
            )

        self.api_config = api_config

        if not self.api_config.api_key:
            self.logger.warning("⚠️ POS_API_KEY no configurada - usar variable de entorno POS_API_KEY")

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_ventas_api_extractor')
        logger.setLevel(logging.INFO)

        log_file = ETLConfig.LOG_DIR / f"ventas_api_extractor_{datetime.now().strftime('%Y%m%d')}.log"
        handler = logging.FileHandler(log_file)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        return logger

    def extract_ventas_data(self,
                          config,
                          fecha_inicio: date,
                          fecha_fin: date,
                          limite_registros: int = None) -> Optional[pd.DataFrame]:
        """
        Extrae datos de ventas para un rango de fechas específico desde API REST

        Args:
            config: Configuración de la ubicación/tienda (DatabaseConfig)
            fecha_inicio: Fecha inicial del rango
            fecha_fin: Fecha final del rango
            limite_registros: Límite máximo de registros (None = sin límite, extrae todo)

        Returns:
            DataFrame con los datos de ventas o None si falla
        """

        # Extraer código de tienda desde ubicacion_id (ej: "tienda_08" -> "08")
        tienda_codigo = config.ubicacion_id.replace("tienda_", "")

        self.logger.info(f"📡 Extrayendo ventas desde API REST")
        self.logger.info(f"   🏪 Tienda: {config.ubicacion_nombre} (código: {tienda_codigo})")
        self.logger.info(f"   📅 Rango: {fecha_inicio} a {fecha_fin}")
        if limite_registros:
            self.logger.info(f"   🔢 Límite: {limite_registros:,} registros")
        else:
            self.logger.info(f"   🔢 Sin límite - extrayendo TODOS los registros del período")

        # Construir URL del endpoint
        endpoint = f"{self.api_config.base_url}/api/ventas"

        # Parámetros de query
        params = {
            "tienda_codigo": tienda_codigo,
            "fecha_desde": fecha_inicio.strftime('%Y-%m-%d'),
            "fecha_hasta": fecha_fin.strftime('%Y-%m-%d'),
            "formato_fecha": "ISO8601"
        }

        # Headers
        headers = {
            "Authorization": f"Bearer {self.api_config.api_key}",
            "Accept": "application/json",
            "User-Agent": "FluxionAI-ETL/1.0"
        }

        # Reintentos
        max_intentos = self.api_config.max_retries

        for intento in range(1, max_intentos + 1):
            try:
                self.logger.info(f"🔌 Conectando al API (intento {intento}/{max_intentos})")
                self.logger.info(f"   🌐 URL: {endpoint}")

                inicio = datetime.now()

                # Hacer request HTTP GET
                response = requests.get(
                    endpoint,
                    params=params,
                    headers=headers,
                    timeout=self.api_config.timeout_seconds
                )

                # Verificar código de respuesta
                response.raise_for_status()

                fin = datetime.now()
                duracion = (fin - inicio).total_seconds()

                self.logger.info(f"   ✅ Respuesta HTTP {response.status_code} en {duracion:.2f}s")

                # Parsear JSON
                data = response.json()

                # Validar estructura de respuesta
                if "meta" not in data or "ventas" not in data:
                    self.logger.error("❌ Respuesta del API no tiene la estructura esperada")
                    return None

                meta = data["meta"]
                ventas_array = data["ventas"]

                total_registros = meta.get("total_registros", len(ventas_array))

                self.logger.info(f"   📊 Metadatos:")
                self.logger.info(f"      Tienda: {meta.get('tienda_nombre')}")
                self.logger.info(f"      Total registros: {total_registros:,}")
                self.logger.info(f"      Fecha generación: {meta.get('fecha_generacion')}")

                # Si no hay ventas, retornar DataFrame vacío
                if not ventas_array or len(ventas_array) == 0:
                    self.logger.warning(f"⚠️ No se encontraron ventas para el período {fecha_inicio} - {fecha_fin}")
                    return pd.DataFrame()

                # Convertir array de ventas a DataFrame
                df = self._parse_ventas_to_dataframe(ventas_array)

                # Aplicar límite si se especificó
                if limite_registros and len(df) > limite_registros:
                    self.logger.info(f"   ✂️ Aplicando límite: {len(df):,} -> {limite_registros:,} registros")
                    df = df.head(limite_registros)

                self.logger.info(f"✅ Datos extraídos de {config.ubicacion_nombre}: {len(df):,} registros")

                # Agregar metadatos de ubicación
                df['ubicacion_id'] = config.ubicacion_id
                df['ubicacion_nombre'] = config.ubicacion_nombre
                df['fecha_extraccion'] = datetime.now()

                return df

            except requests.exceptions.Timeout:
                self.logger.error(f"❌ Timeout al conectar al API ({self.api_config.timeout_seconds}s)")

                if intento < max_intentos:
                    self.logger.info(f"🔄 Reintentando en {self.api_config.retry_delay_seconds} segundos...")
                    time.sleep(self.api_config.retry_delay_seconds)

            except requests.exceptions.HTTPError as e:
                status_code = e.response.status_code if e.response else "N/A"

                self.logger.error(f"❌ Error HTTP {status_code}: {str(e)}")

                # Intentar parsear mensaje de error del API
                try:
                    error_data = e.response.json()
                    if "error" in error_data:
                        error_info = error_data["error"]
                        self.logger.error(f"   Código error: {error_info.get('codigo')}")
                        self.logger.error(f"   Mensaje: {error_info.get('mensaje')}")
                except:
                    pass

                # No reintentar si es error 4xx (error del cliente)
                if status_code and str(status_code).startswith('4'):
                    self.logger.error(f"💥 Error del cliente ({status_code}) - no se reintenta")
                    return None

                if intento < max_intentos:
                    self.logger.info(f"🔄 Reintentando en {self.api_config.retry_delay_seconds} segundos...")
                    time.sleep(self.api_config.retry_delay_seconds)

            except requests.exceptions.RequestException as e:
                self.logger.error(f"❌ Error de conexión: {str(e)}")

                if intento < max_intentos:
                    self.logger.info(f"🔄 Reintentando en {self.api_config.retry_delay_seconds} segundos...")
                    time.sleep(self.api_config.retry_delay_seconds)

            except Exception as e:
                self.logger.error(f"❌ Error inesperado: {str(e)}")

                if intento < max_intentos:
                    self.logger.info(f"🔄 Reintentando (intento {intento + 1}/{max_intentos}) en {self.api_config.retry_delay_seconds} segundos...")
                    time.sleep(self.api_config.retry_delay_seconds)

        self.logger.error(f"💥 Falló extracción de ventas de {config.ubicacion_nombre} después de {max_intentos} intentos")
        return None

    def _parse_ventas_to_dataframe(self, ventas_array: List[Dict]) -> pd.DataFrame:
        """
        Convierte el array de ventas del API a DataFrame con estructura compatible con ETL actual

        Args:
            ventas_array: Array de objetos de venta desde el API

        Returns:
            DataFrame con columnas compatibles con transformer_ventas.py
        """

        # Aplanar la estructura anidada del JSON a estructura plana
        records = []

        for venta in ventas_array:
            # Extraer objetos anidados
            producto = venta.get("producto", {})
            cantidad = venta.get("cantidad", {})
            financiero = venta.get("financiero", {})

            # Crear registro plano
            record = {
                # Información de transacción
                "numero_factura": venta.get("numero_factura"),
                "fecha": venta.get("fecha"),
                "hora": venta.get("hora"),
                "linea": venta.get("linea"),
                "codigo_transaccion": venta.get("codigo_transaccion"),

                # Fecha/hora completa (reconstruir)
                "fecha_hora_completa": f"{venta.get('fecha')} {venta.get('hora')}" if venta.get('fecha') and venta.get('hora') else None,

                # Información del producto
                "codigo_producto": producto.get("codigo"),
                "descripcion_producto": producto.get("descripcion"),
                "marca_producto": producto.get("marca"),
                "modelo_producto": producto.get("modelo"),
                "presentacion_producto": producto.get("presentacion"),
                "cuadrante_producto": producto.get("cuadrante"),

                # Categorización del producto
                "categoria_producto": producto.get("categoria"),
                "grupo_producto": producto.get("grupo"),
                "subgrupo_producto": producto.get("subgrupo"),

                # Cantidades y medidas
                "cantidad_vendida": cantidad.get("vendida"),
                "cantidad_bultos": cantidad.get("bultos"),
                "peso_unitario": cantidad.get("peso_unitario"),
                "volumen_unitario": cantidad.get("volumen_unitario"),
                "peso_calculado": cantidad.get("peso_total"),  # API retorna peso_total
                "tipo_peso": cantidad.get("tipo_peso"),

                # Información financiera
                "costo_unitario": financiero.get("costo_unitario"),
                "precio_unitario": financiero.get("precio_unitario"),
                "impuesto_porcentaje": financiero.get("impuesto_porcentaje"),

                # Cálculos derivados (ya vienen del API)
                "costo_total": financiero.get("costo_total"),
                "venta_total": financiero.get("venta_total"),
                "impuesto_total": financiero.get("impuesto_total"),
                "utilidad_bruta": financiero.get("utilidad_bruta")
            }

            records.append(record)

        # Convertir a DataFrame
        df = pd.DataFrame(records)

        # Convertir tipos de datos
        if not df.empty:
            # Fechas
            if 'fecha' in df.columns:
                df['fecha'] = pd.to_datetime(df['fecha'])

            # Numéricos
            numeric_cols = [
                'cantidad_vendida', 'cantidad_bultos', 'peso_unitario',
                'volumen_unitario', 'peso_calculado', 'tipo_peso',
                'costo_unitario', 'precio_unitario', 'impuesto_porcentaje',
                'costo_total', 'venta_total', 'impuesto_total', 'utilidad_bruta'
            ]

            for col in numeric_cols:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce')

        self.logger.info(f"   📊 DataFrame creado: {len(df)} registros x {len(df.columns)} columnas")

        return df

    def validar_datos_ventas(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Valida la calidad de los datos extraídos
        Compatible con validación del extractor anterior

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


# Alias para compatibilidad con código existente
# Esto permite cambiar de extractor SQL a extractor API sin cambiar etl_ventas.py
VentasExtractor = VentasAPIExtractor
