#!/usr/bin/env python3
"""
Extractor de inventario para POS KLK - La Granja Mercado
Extrae datos de inventario desde API REST del sistema KLK

Stores usando KLK:
- BOSQUE (tienda_08)
- PERIFERICO (tienda_01)
"""

import os
import requests
import pandas as pd
from typing import Optional, Dict, Any, List
from datetime import datetime
from dataclasses import dataclass
import logging
from pathlib import Path
import time

# Import relativo dentro de core/
try:
    from config import ETLConfig
except ImportError:
    from core.config import ETLConfig


@dataclass
class KLKAPIConfig:
    """Configuración para el API del POS KLK"""
    base_url: str
    timeout_seconds: int = 60
    max_retries: int = 3
    retry_delay_seconds: int = 5
    # Mapeo de ubicacion_id a CodigoAlmacen de KLK
    codigo_almacen_map: Dict[str, str] = None


# Mapeo de tiendas a códigos de almacén de KLK
# Este mapeo se obtiene dinámicamente de tiendas_config.py
# basado en el campo codigo_almacen_klk de cada tienda


class InventarioKLKExtractor:
    """Extractor especializado para inventario desde API REST de KLK"""

    def __init__(self, api_config: Optional[KLKAPIConfig] = None):
        self.logger = self._setup_logger()

        # Configuración del API desde variables de entorno o parámetros
        if api_config is None:
            # Construir mapeo dinámico desde tiendas_config
            from tiendas_config import get_tiendas_klk

            codigo_almacen_map = {}
            for tienda_id, config in get_tiendas_klk().items():
                if config.codigo_almacen_klk:
                    codigo_almacen_map[tienda_id] = config.codigo_almacen_klk

            api_config = KLKAPIConfig(
                base_url=os.getenv("KLK_API_BASE_URL", "http://190.6.32.3:7002"),
                timeout_seconds=int(os.getenv("KLK_API_TIMEOUT", "60")),
                max_retries=int(os.getenv("KLK_API_MAX_RETRIES", "3")),
                retry_delay_seconds=int(os.getenv("KLK_API_RETRY_DELAY", "5")),
                codigo_almacen_map=codigo_almacen_map
            )

        self.api_config = api_config
        self.session = requests.Session()

        # Headers comunes para todas las requests
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_inventario_klk_extractor')
        logger.setLevel(logging.INFO)

        # Handler para archivo
        log_file = ETLConfig.LOG_DIR / f"inventario_klk_extractor_{datetime.now().strftime('%Y%m%d')}.log"
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.INFO)

        # Handler para consola
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)

        # Formato
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)

        logger.addHandler(file_handler)
        logger.addHandler(console_handler)

        return logger

    def get_codigo_almacen(self, ubicacion_id: str) -> str:
        """Obtiene el código de almacén KLK para una ubicación"""
        if ubicacion_id not in self.api_config.codigo_almacen_map:
            raise ValueError(
                f"Ubicación {ubicacion_id} no tiene código de almacén KLK configurado. "
                f"Ubicaciones KLK disponibles: {list(self.api_config.codigo_almacen_map.keys())}"
            )
        return self.api_config.codigo_almacen_map[ubicacion_id]

    def extract_inventario_data(self, config) -> Optional[pd.DataFrame]:
        """
        Extrae datos de inventario para una tienda específica desde API KLK

        Args:
            config: Configuración de la ubicación/tienda (TiendaConfig o DatabaseConfig)

        Returns:
            DataFrame con los datos de inventario o None si falla
        """

        ubicacion_id = config.ubicacion_id
        ubicacion_nombre = config.ubicacion_nombre

        # Validar que esta tienda use KLK
        if ubicacion_id not in self.api_config.codigo_almacen_map:
            self.logger.error(
                f"❌ {ubicacion_nombre} ({ubicacion_id}) no está configurada para usar KLK API. "
                f"Tiendas KLK: {list(self.api_config.codigo_almacen_map.keys())}"
            )
            return None

        codigo_almacen = self.get_codigo_almacen(ubicacion_id)

        self.logger.info(f"📡 Extrayendo inventario desde KLK API")
        self.logger.info(f"   🏪 Tienda: {ubicacion_nombre} ({ubicacion_id})")
        self.logger.info(f"   📦 Código Almacén KLK: {codigo_almacen}")

        # Construir URL del endpoint
        endpoint = f"{self.api_config.base_url}/maestra/articulos"

        # Payload del request
        payload = {
            "CodigoAlmacen": codigo_almacen
        }

        self.logger.info(f"   🌐 Endpoint: POST {endpoint}")
        self.logger.debug(f"   📤 Payload: {payload}")

        # Intentar extracción con reintentos
        for intento in range(1, self.api_config.max_retries + 1):
            try:
                self.logger.info(f"   🔄 Intento {intento}/{self.api_config.max_retries}")

                start_time = time.time()

                # Realizar POST request
                response = self.session.post(
                    endpoint,
                    json=payload,
                    timeout=self.api_config.timeout_seconds
                )

                request_time = time.time() - start_time

                # Verificar status code
                if response.status_code != 200:
                    self.logger.error(
                        f"❌ Error HTTP {response.status_code}: {response.text[:200]}"
                    )

                    if intento < self.api_config.max_retries:
                        self.logger.info(f"   ⏳ Reintentando en {self.api_config.retry_delay_seconds}s...")
                        time.sleep(self.api_config.retry_delay_seconds)
                        continue
                    else:
                        return None

                # Parsear JSON response
                try:
                    data = response.json()
                except ValueError as e:
                    self.logger.error(f"❌ Error parseando JSON: {e}")
                    self.logger.debug(f"Response text: {response.text[:500]}")

                    if intento < self.api_config.max_retries:
                        time.sleep(self.api_config.retry_delay_seconds)
                        continue
                    else:
                        return None

                # Validar que sea una lista
                if not isinstance(data, list):
                    self.logger.error(f"❌ Response no es una lista: {type(data)}")
                    return None

                # Convertir a DataFrame
                df = pd.DataFrame(data)

                if df.empty:
                    self.logger.warning(f"⚠️  API retornó 0 registros para {ubicacion_nombre}")
                    return df

                self.logger.info(
                    f"✅ Inventario extraído: {len(df):,} productos en {request_time:.2f}s"
                )

                # Agregar metadatos de la tienda
                df['ubicacion_id'] = ubicacion_id
                df['ubicacion_nombre'] = ubicacion_nombre
                df['codigo_almacen_klk'] = codigo_almacen
                df['fecha_extraccion'] = datetime.now()
                df['fuente_sistema'] = 'KLK'

                # Log de primeras filas para debug
                self.logger.debug(f"Primeros registros:\n{df.head(3).to_dict('records')}")

                return df

            except requests.exceptions.Timeout:
                self.logger.error(
                    f"❌ Timeout ({self.api_config.timeout_seconds}s) en intento {intento}"
                )
                if intento < self.api_config.max_retries:
                    time.sleep(self.api_config.retry_delay_seconds)
                    continue

            except requests.exceptions.ConnectionError as e:
                self.logger.error(f"❌ Error de conexión: {e}")
                if intento < self.api_config.max_retries:
                    time.sleep(self.api_config.retry_delay_seconds)
                    continue

            except requests.exceptions.RequestException as e:
                self.logger.error(f"❌ Error en request HTTP: {e}")
                if intento < self.api_config.max_retries:
                    time.sleep(self.api_config.retry_delay_seconds)
                    continue

            except Exception as e:
                self.logger.error(f"❌ Error inesperado: {e}", exc_info=True)
                if intento < self.api_config.max_retries:
                    time.sleep(self.api_config.retry_delay_seconds)
                    continue

        # Si llegamos aquí, fallaron todos los intentos
        self.logger.error(
            f"💥 Falló extracción de {ubicacion_nombre} después de {self.api_config.max_retries} intentos"
        )
        return None

    def extract_multiple_inventarios(self, configs: List) -> Dict[str, pd.DataFrame]:
        """
        Extrae inventarios de múltiples ubicaciones KLK

        Args:
            configs: Lista de configuraciones de ubicaciones

        Returns:
            Diccionario {ubicacion_id: DataFrame}
        """
        results = {}

        # Filtrar solo tiendas que usan KLK
        klk_configs = [
            cfg for cfg in configs
            if cfg.ubicacion_id in self.api_config.codigo_almacen_map
        ]

        total_configs = len(klk_configs)

        if total_configs == 0:
            self.logger.warning("⚠️  Ninguna de las ubicaciones proporcionadas usa KLK")
            return results

        self.logger.info(f"🚀 Iniciando extracción de {total_configs} ubicaciones KLK")

        for i, config in enumerate(klk_configs, 1):
            self.logger.info(f"\n📍 Procesando [{i}/{total_configs}]: {config.ubicacion_nombre}")

            df = self.extract_inventario_data(config)

            if df is not None:
                results[config.ubicacion_id] = df
                self.logger.info(f"✅ [{i}/{total_configs}] Completado: {config.ubicacion_nombre}")
            else:
                self.logger.error(f"❌ [{i}/{total_configs}] Falló: {config.ubicacion_nombre}")

        self.logger.info(f"\n📊 Extracción completada: {len(results)}/{total_configs} exitosas")
        return results

    def test_connection(self, config) -> bool:
        """
        Prueba la conexión al API KLK para una tienda

        Args:
            config: Configuración de la ubicación

        Returns:
            True si la conexión es exitosa, False si falla
        """
        try:
            ubicacion_id = config.ubicacion_id

            if ubicacion_id not in self.api_config.codigo_almacen_map:
                self.logger.error(f"❌ {ubicacion_id} no usa KLK")
                return False

            self.logger.info(f"🧪 Probando conexión KLK API para {config.ubicacion_nombre}")

            # Intentar extraer solo un producto
            df = self.extract_inventario_data(config)

            if df is not None:
                self.logger.info(f"✅ Conexión exitosa - {len(df)} productos disponibles")
                return True
            else:
                self.logger.error(f"❌ Conexión fallida")
                return False

        except Exception as e:
            self.logger.error(f"❌ Error en test de conexión: {e}")
            return False

    def close(self):
        """Cierra la sesión HTTP"""
        self.session.close()
        self.logger.info("🔌 Sesión HTTP cerrada")

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()


def test_klk_extractor():
    """Función para probar el extractor KLK"""
    from tiendas_config import get_tienda_config

    print("\n" + "="*80)
    print("🧪 PROBANDO EXTRACTOR KLK API")
    print("="*80)

    with InventarioKLKExtractor() as extractor:
        # Probar con PERIFERICO (tienda_01)
        print("\n📍 TEST 1: PERIFERICO")
        print("-" * 80)

        try:
            config_periferico = get_tienda_config("tienda_01")
            success = extractor.test_connection(config_periferico)

            if success:
                print("✅ Test PERIFERICO exitoso")
            else:
                print("❌ Test PERIFERICO falló")
        except Exception as e:
            print(f"❌ Error en test PERIFERICO: {e}")

        # Probar con BOSQUE (tienda_08)
        print("\n📍 TEST 2: BOSQUE")
        print("-" * 80)

        try:
            config_bosque = get_tienda_config("tienda_08")
            success = extractor.test_connection(config_bosque)

            if success:
                print("✅ Test BOSQUE exitoso")
            else:
                print("❌ Test BOSQUE falló")
        except Exception as e:
            print(f"❌ Error en test BOSQUE: {e}")

    print("\n" + "="*80)
    print("✅ Test de extractor KLK completado")
    print("="*80 + "\n")


if __name__ == "__main__":
    test_klk_extractor()
