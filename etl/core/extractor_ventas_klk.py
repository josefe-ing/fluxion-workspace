#!/usr/bin/env python3
"""
Extractor de Ventas para Sistema KLK - La Granja Mercado
Extrae transacciones de ventas desde API REST KLK

Autor: ETL Team
Fecha: 2025-11-24
"""

import requests
import pandas as pd
from typing import Optional, List, Dict
from datetime import datetime, date, timedelta
from dataclasses import dataclass
import logging
import time

from config import ETLConfig


@dataclass
class KLKVentasAPIConfig:
    """Configuración de la API KLK para ventas"""
    base_url: str = "http://190.6.32.3:7002"
    timeout_seconds: int = 120
    max_retries: int = 3
    retry_delay_seconds: int = 5


# Mapeo de tienda_id a código de sucursal KLK
TIENDA_TO_SUCURSAL = {
    "tienda_01": "SUC001",  # PERIFERICO
    "tienda_08": "SUC002",  # BOSQUE
    "tienda_17": "SUC003",  # ARTIGAS
    "tienda_18": "SUC004",  # PARAISO
    "tienda_20": "SUC005",  # TAZAJAL
    "tienda_15": "SUC006",  # ISABELICA
}


class VentasKLKExtractor:
    """Extractor de ventas desde API KLK"""

    def __init__(self, api_config: KLKVentasAPIConfig = None):
        self.api_config = api_config or KLKVentasAPIConfig()
        self.logger = self._setup_logger()
        self.session = self._setup_session()

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_ventas_klk_extractor')
        if not logger.handlers:
            logger.setLevel(logging.INFO)
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger

    def _setup_session(self) -> requests.Session:
        """Configura la sesión HTTP con reintentos"""
        session = requests.Session()
        session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        return session

    def get_codigo_sucursal(self, ubicacion_id: str) -> Optional[str]:
        """Obtiene el código de sucursal KLK para una ubicación"""
        return TIENDA_TO_SUCURSAL.get(ubicacion_id)

    def extract_ventas(
        self,
        ubicacion_id: str,
        ubicacion_nombre: str,
        fecha_desde: date,
        fecha_hasta: date,
        almacen: str = None,
        hora_desde: str = None,
        hora_hasta: str = None
    ) -> Optional[pd.DataFrame]:
        """
        Extrae ventas de una tienda KLK para un rango de fechas y horas

        Args:
            ubicacion_id: ID de la ubicación (ej: tienda_01)
            ubicacion_nombre: Nombre de la ubicación (ej: PERIFERICO)
            fecha_desde: Fecha inicial
            fecha_hasta: Fecha final
            almacen: Código de almacén opcional (ej: APP-TPF)
            hora_desde: Hora inicial opcional (ej: "12:00:00")
            hora_hasta: Hora final opcional (ej: "12:30:00")

        Returns:
            DataFrame con las ventas o None si falla
        """
        codigo_sucursal = self.get_codigo_sucursal(ubicacion_id)

        if not codigo_sucursal:
            self.logger.error(f"❌ {ubicacion_id} no tiene código de sucursal KLK configurado")
            return None

        self.logger.info(f"📡 Extrayendo ventas desde KLK API")
        self.logger.info(f"   🏪 Tienda: {ubicacion_nombre} ({ubicacion_id})")
        self.logger.info(f"   📋 Sucursal KLK: {codigo_sucursal}")
        self.logger.info(f"   📅 Período: {fecha_desde} a {fecha_hasta}")
        if hora_desde and hora_hasta:
            self.logger.info(f"   ⏰ Horario: {hora_desde} a {hora_hasta}")

        endpoint = f"{self.api_config.base_url}/ventas"

        # Construir payload
        payload = {
            "sucursal": codigo_sucursal,
            "fecha_desde": fecha_desde.strftime("%Y-%m-%d"),
            "fecha_hasta": fecha_hasta.strftime("%Y-%m-%d")
        }

        if almacen:
            payload["almacen"] = almacen
            self.logger.info(f"   📦 Almacén: {almacen}")

        # Agregar filtros de hora si se especifican
        if hora_desde:
            payload["hora_desde"] = hora_desde
        if hora_hasta:
            payload["hora_hasta"] = hora_hasta

        # Intentar extracción con reintentos
        for intento in range(1, self.api_config.max_retries + 1):
            try:
                self.logger.info(f"   🔄 Intento {intento}/{self.api_config.max_retries}")

                # LOGGING DETALLADO DE LA REQUEST
                self.logger.info(f"   📡 Endpoint: {endpoint}")
                self.logger.info(f"   📦 Payload: {payload}")
                self.logger.info(f"   🔑 Headers: {dict(self.session.headers)}")

                start_time = time.time()

                response = self.session.post(
                    endpoint,
                    json=payload,
                    timeout=self.api_config.timeout_seconds
                )
                request_time = time.time() - start_time

                # LOGGING DETALLADO DE LA RESPONSE
                self.logger.info(f"   📨 Status Code: {response.status_code}")
                self.logger.info(f"   ⏱️  Request Time: {request_time:.2f}s")
                self.logger.info(f"   📄 Response Headers: {dict(response.headers)}")
                self.logger.info(f"   📝 Response Body (primeros 500 chars): {response.text[:500]}")

                if response.status_code != 200:
                    self.logger.error(f"❌ Error HTTP {response.status_code}: {response.text[:200]}")
                    if intento < self.api_config.max_retries:
                        time.sleep(self.api_config.retry_delay_seconds)
                        continue
                    return None

                data = response.json()

                # Parsear respuesta
                if isinstance(data, dict):
                    if 'error' in data:
                        self.logger.error(f"❌ Error de API: {data['error']}")
                        return None

                    ventas = data.get('ventas', [])
                    meta = data.get('meta', {})
                    self.logger.info(f"   📊 Meta: {meta.get('total_registros', 'N/A')} registros")
                elif isinstance(data, list):
                    ventas = data
                else:
                    self.logger.error(f"❌ Response inesperado: {type(data)}")
                    return None

                if not ventas:
                    self.logger.warning(f"⚠️  API retornó 0 ventas para {ubicacion_nombre}")
                    return pd.DataFrame()

                # Aplanar la estructura anidada de ventas
                df = self._flatten_ventas(ventas)

                self.logger.info(f"✅ Extraídas: {len(df):,} líneas de venta en {request_time:.2f}s")

                # Agregar metadatos
                df['ubicacion_id'] = ubicacion_id
                df['ubicacion_nombre'] = ubicacion_nombre
                df['fecha_extraccion'] = datetime.now()
                df['fuente_sistema'] = 'KLK'

                return df

            except requests.exceptions.Timeout:
                self.logger.error(f"❌ Timeout después de {self.api_config.timeout_seconds}s")
                if intento < self.api_config.max_retries:
                    time.sleep(self.api_config.retry_delay_seconds)
                    continue
            except requests.exceptions.RequestException as e:
                self.logger.error(f"❌ Error de conexión: {e}")
                if intento < self.api_config.max_retries:
                    time.sleep(self.api_config.retry_delay_seconds)
                    continue
            except Exception as e:
                self.logger.error(f"❌ Error inesperado: {e}")
                if intento < self.api_config.max_retries:
                    time.sleep(self.api_config.retry_delay_seconds)
                    continue

        return None

    def _flatten_ventas(self, ventas: List[Dict]) -> pd.DataFrame:
        """
        Aplana la estructura anidada de ventas KLK a un DataFrame plano

        La estructura de KLK tiene arrays anidados para producto, cantidad y financiero
        """
        rows = []

        for venta in ventas:
            # Extraer datos del producto (primer elemento del array)
            producto = venta.get('producto', [{}])[0] if venta.get('producto') else {}
            cantidad = venta.get('cantidad', [{}])[0] if venta.get('cantidad') else {}
            financiero = venta.get('financiero', [{}])[0] if venta.get('financiero') else {}

            row = {
                # Identificadores de la transacción
                'numero_factura': venta.get('numero_factura'),
                'linea': venta.get('linea'),

                # Fecha y hora
                'fecha': venta.get('fecha'),
                'hora': venta.get('hora'),
                'fecha_hora_completa': venta.get('fecha_hora_completa'),

                # Producto
                'codigo_producto': producto.get('codigo_producto'),
                'descripcion_producto': producto.get('descripcion_producto'),
                'marca_producto': producto.get('marca_producto'),
                'modelo_producto': producto.get('modelo_producto'),
                'categoria_producto': producto.get('categoria_producto'),
                'grupo_producto': producto.get('grupo_articulo'),
                'subgrupo_producto': producto.get('subgrupo_producto'),
                'codigo_barras': producto.get('codigo_barras'),

                # Cantidad y almacén
                'codigo_almacen': cantidad.get('codigo_almacen'),
                'nombre_almacen': cantidad.get('nombre_almacen'),
                'cantidad_vendida': cantidad.get('cantidad_vendida'),
                'peso_unitario': cantidad.get('peso_unitario'),
                'unidad_medida_venta': cantidad.get('unidad_medida_venta'),
                'factor_unidad_medida': cantidad.get('factor_unidad_medida'),

                # Financiero en Bs
                'costo_unitario_bs': financiero.get('costo_unitario_bs'),
                'precio_unitario_bs': financiero.get('precio_unitario_bs'),
                'venta_total_bs': financiero.get('venta_total_bs'),
                'costo_total_bs': financiero.get('costo_total_bs'),
                'utilidad_bruta_bs': financiero.get('utilidad_bruta_bs'),

                # Financiero en USD
                'costo_unitario_usd': financiero.get('costo_unitario_usd'),
                'precio_unitario_usd': financiero.get('precio_unitario_usd'),
                'venta_total_usd': financiero.get('venta_total_usd'),
                'costo_total_usd': financiero.get('costo_total_usd'),
                'utilidad_bruta_usd': financiero.get('utilidad_bruta_usd'),

                # Impuestos y descuentos
                'impuesto_porcentaje': financiero.get('impuesto_porcentaje'),
                'impuesto_monto': financiero.get('impuesto_monto'),
                'porcentaje_descuento': financiero.get('porcentaje_descuento'),
                'monto_descuento': financiero.get('monto_descuento'),

                # Totales de factura
                'total_factura': venta.get('total_factura'),
                'tasa_usd': venta.get('tasa_usd'),

                # Otros
                'es_no_fiscal': venta.get('es_no_fiscal'),
                'tiene_promocion': venta.get('tiene_promocion'),
                'codigo_promocion': venta.get('codigo_promocion'),
            }

            rows.append(row)

        return pd.DataFrame(rows)

    def extract_ventas_rango(
        self,
        config,
        fecha_desde: date,
        fecha_hasta: date,
        dias_por_chunk: int = 1
    ) -> List[pd.DataFrame]:
        """
        Extrae ventas de una tienda para un rango de fechas, dividido en chunks

        Args:
            config: Configuración de la tienda (TiendaConfig)
            fecha_desde: Fecha inicial
            fecha_hasta: Fecha final
            dias_por_chunk: Días por cada request (default: 1)

        Returns:
            Lista de DataFrames con las ventas
        """
        ubicacion_id = config.ubicacion_id
        ubicacion_nombre = config.ubicacion_nombre

        self.logger.info(f"🏪 {ubicacion_nombre}: Extrayendo ventas {fecha_desde} a {fecha_hasta}")

        results = []
        current_date = fecha_desde

        while current_date <= fecha_hasta:
            chunk_end = min(current_date + timedelta(days=dias_por_chunk - 1), fecha_hasta)

            df = self.extract_ventas(
                ubicacion_id=ubicacion_id,
                ubicacion_nombre=ubicacion_nombre,
                fecha_desde=current_date,
                fecha_hasta=chunk_end
            )

            if df is not None and not df.empty:
                results.append(df)
                self.logger.info(f"   ✅ {current_date}: {len(df):,} líneas")
            else:
                self.logger.warning(f"   ⚠️  {current_date}: sin datos")

            current_date = chunk_end + timedelta(days=1)

        return results

    def extract_ventas_raw(
        self,
        sucursal: str,
        fecha_desde: str,
        fecha_hasta: str,
        hora_desde: str = None,
        hora_hasta: str = None,
        almacen: str = None
    ) -> Optional[Dict]:
        """
        Extrae ventas crudas desde KLK API (sin transformar).
        Devuelve el JSON completo del response para carga directa.

        Args:
            sucursal: Codigo de sucursal KLK (ej: SUC001)
            fecha_desde: Fecha inicio (YYYY-MM-DD)
            fecha_hasta: Fecha fin (YYYY-MM-DD)
            hora_desde: Hora inicio opcional (HH:MM)
            hora_hasta: Hora fin opcional (HH:MM)
            almacen: Codigo de almacen opcional

        Returns:
            Dict con 'meta' y 'ventas' o None si falla
        """
        self.logger.info(f"📡 Extrayendo ventas raw desde KLK API")
        self.logger.info(f"   📋 Sucursal: {sucursal}")
        self.logger.info(f"   📅 Periodo: {fecha_desde} a {fecha_hasta}")
        if hora_desde and hora_hasta:
            self.logger.info(f"   ⏰ Horario: {hora_desde} a {hora_hasta}")

        endpoint = f"{self.api_config.base_url}/ventas"

        # Construir payload
        payload = {
            "sucursal": sucursal,
            "fecha_desde": fecha_desde,
            "fecha_hasta": fecha_hasta
        }

        if almacen:
            payload["almacen"] = almacen
        if hora_desde:
            payload["hora_desde"] = hora_desde
        if hora_hasta:
            payload["hora_hasta"] = hora_hasta

        # Intentar extraccion con reintentos
        for intento in range(1, self.api_config.max_retries + 1):
            try:
                self.logger.info(f"   🔄 Intento {intento}/{self.api_config.max_retries}")

                start_time = time.time()

                response = self.session.post(
                    endpoint,
                    json=payload,
                    timeout=self.api_config.timeout_seconds
                )
                request_time = time.time() - start_time

                self.logger.info(f"   📨 Status: {response.status_code}, Time: {request_time:.2f}s")

                if response.status_code != 200:
                    self.logger.error(f"❌ Error HTTP {response.status_code}: {response.text[:200]}")
                    if intento < self.api_config.max_retries:
                        time.sleep(self.api_config.retry_delay_seconds)
                        continue
                    return None

                data = response.json()

                # Validar respuesta
                if isinstance(data, dict):
                    if 'error' in data:
                        self.logger.error(f"❌ Error de API: {data['error']}")
                        return None

                    ventas = data.get('ventas', [])
                    meta = data.get('meta', {})
                    self.logger.info(f"   ✅ {len(ventas):,} lineas de venta extraidas")
                    return data

                elif isinstance(data, list):
                    # Si devuelve lista directa, envolverla
                    self.logger.info(f"   ✅ {len(data):,} lineas de venta extraidas")
                    return {'ventas': data, 'meta': {'total_registros': len(data)}}

                else:
                    self.logger.error(f"❌ Response inesperado: {type(data)}")
                    return None

            except requests.exceptions.Timeout:
                self.logger.error(f"❌ Timeout despues de {self.api_config.timeout_seconds}s")
                if intento < self.api_config.max_retries:
                    time.sleep(self.api_config.retry_delay_seconds)
                    continue
            except requests.exceptions.RequestException as e:
                self.logger.error(f"❌ Error de conexion: {e}")
                if intento < self.api_config.max_retries:
                    time.sleep(self.api_config.retry_delay_seconds)
                    continue
            except Exception as e:
                self.logger.error(f"❌ Error inesperado: {e}")
                if intento < self.api_config.max_retries:
                    time.sleep(self.api_config.retry_delay_seconds)
                    continue

        return None

    def close(self):
        """Cierra la sesion HTTP"""
        if self.session:
            self.session.close()
            self.logger.info("🔌 Sesión HTTP cerrada")


def test_klk_ventas_extractor():
    """Test básico del extractor de ventas KLK"""
    print("\n" + "="*80)
    print("TEST: Extractor de Ventas KLK")
    print("="*80 + "\n")

    extractor = VentasKLKExtractor()

    # Test con Periférico
    hoy = date.today()

    print(f"📅 Extrayendo ventas de hoy ({hoy}) para PERIFERICO...")

    df = extractor.extract_ventas(
        ubicacion_id="tienda_01",
        ubicacion_nombre="PERIFERICO",
        fecha_desde=hoy,
        fecha_hasta=hoy
    )

    if df is not None and not df.empty:
        print(f"\n✅ Ventas extraídas: {len(df):,} líneas")
        print(f"\n📊 Columnas: {list(df.columns)}")
        print(f"\n📈 Resumen:")
        print(f"   - Facturas únicas: {df['numero_factura'].nunique():,}")
        print(f"   - Productos únicos: {df['codigo_producto'].nunique():,}")
        print(f"   - Venta total USD: ${df['venta_total_usd'].sum():,.2f}")
        print(f"\n📋 Primeras 5 filas:")
        print(df[['numero_factura', 'codigo_producto', 'descripcion_producto', 'cantidad_vendida', 'venta_total_usd']].head())
    else:
        print("❌ No se pudieron extraer ventas")

    extractor.close()

    print("\n" + "="*80)
    print("✅ Test de extractor de ventas KLK completado")
    print("="*80 + "\n")


if __name__ == "__main__":
    test_klk_ventas_extractor()
