#!/usr/bin/env python3
"""
Transformer de inventario KLK - La Granja Mercado
Transforma datos de API KLK al esquema DuckDB de Fluxion

Mapeo de campos:
KLK API → DuckDB Schema

PRODUCTOS:
- Codigo → codigo
- Barra → codigo_barras
- NombreProducto → descripcion
- Categoria → categoria_id
- Descripcion → categoria (nombre completo)
- Subcategoria → subcategoria
- Descripcion_categoria → descripcion_categoria
- Marca → marca
- Precio → precio_venta
- Iva → impuesto_porcentaje

STOCK_ACTUAL:
- stock → cantidad
- Codigo → producto_id (via lookup)
"""

import pandas as pd
import numpy as np
from typing import Optional, Dict, Tuple
from datetime import datetime
import logging
from pathlib import Path
import uuid

# Import relativo dentro de core/
try:
    from config import ETLConfig
except ImportError:
    from core.config import ETLConfig


class InventarioKLKTransformer:
    """Transformer especializado para datos de inventario KLK"""

    def __init__(self):
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_inventario_klk_transformer')
        logger.setLevel(logging.INFO)

        # Handler para archivo
        log_file = ETLConfig.LOG_DIR / f"inventario_klk_transformer_{datetime.now().strftime('%Y%m%d')}.log"
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

    def transform_to_productos(self, df_raw: pd.DataFrame) -> pd.DataFrame:
        """
        Transforma datos KLK al formato de tabla productos

        Args:
            df_raw: DataFrame con datos crudos de KLK API

        Returns:
            DataFrame con formato de tabla productos
        """
        self.logger.info(f"🔄 Transformando {len(df_raw)} registros KLK a formato productos")

        if df_raw.empty:
            self.logger.warning("⚠️  DataFrame vacío, retornando DataFrame vacío")
            return pd.DataFrame()

        # Crear copia para no modificar el original
        df = df_raw.copy()

        # Generar IDs únicos para productos (basado en código)
        df['id'] = df['Codigo'].apply(lambda x: str(uuid.uuid5(uuid.NAMESPACE_DNS, f"producto_{x}")))

        # Mapeo de campos KLK → DuckDB (esquema real simplificado)
        productos_df = pd.DataFrame({
            # Identificadores
            'id': df['id'],
            'codigo': df['Codigo'].astype(str).str.strip(),
            'codigo_barras': df['Barra'].astype(str).str.strip(),

            # Descripción
            'descripcion': df['NombreProducto'].fillna('').astype(str).str.strip().str[:200],

            # Clasificación
            'categoria': df['Descripcion'].replace('N/A', None).fillna('SIN CATEGORIA').astype(str).str.strip(),
            'grupo': df['Descripcion_categoria'].replace('N/A', None).astype(str).str.strip(),
            'subgrupo': df['Subcategoria'].replace('N/A', None).astype(str).str.strip(),

            # Marca
            'marca': df['Marca'].replace('N/A', None).astype(str).str.strip(),
            'modelo': None,
            'presentacion': None,

            # Costos y precios
            'costo_promedio': pd.to_numeric(df['Precio'], errors='coerce').fillna(0),
            'precio_venta': pd.to_numeric(df['Precio'], errors='coerce').fillna(0),

            # Stock (valores por defecto)
            'stock_minimo': 0,
            'stock_maximo': None,

            # Estado
            'activo': True,
            'es_perecedero': False,
            'dias_vencimiento': None,

            # Timestamps
            'created_at': datetime.now(),
            'updated_at': datetime.now(),

            # Conjunto sustituible (opcional)
            'conjunto_sustituible': None
        })

        # Limpiar valores N/A y strings vacíos a None
        for col in productos_df.columns:
            if productos_df[col].dtype == 'object':
                productos_df[col] = productos_df[col].replace(['N/A', 'n/a', '', ' '], None)

        # Validaciones
        self.logger.info(f"   📊 Registros transformados: {len(productos_df)}")
        self.logger.info(f"   🏷️  Productos únicos por código: {productos_df['codigo'].nunique()}")
        self.logger.info(f"   💰 Productos con precio > 0: {(productos_df['precio_venta'] > 0).sum()}")

        # Detectar duplicados por código
        duplicados = productos_df[productos_df.duplicated(subset=['codigo'], keep=False)]
        if not duplicados.empty:
            self.logger.warning(
                f"⚠️  {len(duplicados)} registros duplicados detectados por código. "
                f"Códigos duplicados: {duplicados['codigo'].unique()[:10]}"
            )

        return productos_df

    def transform_to_stock_actual(self, df_raw: pd.DataFrame) -> pd.DataFrame:
        """
        Transforma datos KLK al formato de tabla stock_actual

        Args:
            df_raw: DataFrame con datos crudos de KLK API (debe incluir ubicacion_id)

        Returns:
            DataFrame con formato de tabla stock_actual
        """
        self.logger.info(f"🔄 Transformando {len(df_raw)} registros KLK a formato stock_actual")

        if df_raw.empty:
            self.logger.warning("⚠️  DataFrame vacío, retornando DataFrame vacío")
            return pd.DataFrame()

        # Validar que tenga ubicacion_id
        if 'ubicacion_id' not in df_raw.columns:
            self.logger.error("❌ DataFrame no contiene columna 'ubicacion_id'")
            raise ValueError("DataFrame debe contener 'ubicacion_id' para stock_actual")

        # Crear copia
        df = df_raw.copy()

        # Convertir stock a numérico
        df['stock_numerico'] = pd.to_numeric(df['stock'], errors='coerce').fillna(0)

        # Mapeo de campos KLK → DuckDB (formato esperado por loader)
        stock_df = pd.DataFrame({
            # Claves primarias
            'ubicacion_id': df['ubicacion_id'],
            'codigo_producto': df['Codigo'].astype(str).str.strip(),

            # Stock
            'cantidad_actual': df['stock_numerico'],

            # Valores (calculados con precio)
            'valor_inventario_actual': (
                df['stock_numerico'] * pd.to_numeric(df['Precio'], errors='coerce').fillna(0)
            ),
            'costo_unitario_actual': pd.to_numeric(df['Precio'], errors='coerce').fillna(0),  # Usar precio como proxy

            # Alertas (valores por defecto)
            'stock_minimo': 0,
            'stock_maximo': None,

            # Metadatos
            'fecha_extraccion': df.get('fecha_extraccion', datetime.now())
        })

        # Validaciones
        total_registros = len(stock_df)
        stock_positivo = (stock_df['cantidad_actual'] > 0).sum()
        stock_negativo = (stock_df['cantidad_actual'] < 0).sum()
        stock_cero = (stock_df['cantidad_actual'] == 0).sum()

        self.logger.info(f"   📊 Stock transformado:")
        self.logger.info(f"      Total: {total_registros}")
        self.logger.info(f"      Stock > 0: {stock_positivo} ({stock_positivo/total_registros*100:.1f}%)")
        self.logger.info(f"      Stock = 0: {stock_cero} ({stock_cero/total_registros*100:.1f}%)")
        self.logger.info(f"      Stock < 0: {stock_negativo} ({stock_negativo/total_registros*100:.1f}%)")

        if stock_negativo > 0:
            self.logger.warning(f"⚠️  {stock_negativo} productos con stock negativo detectados")

        # Validar ubicaciones
        ubicaciones_unicas = stock_df['ubicacion_id'].unique()
        self.logger.info(f"   🏪 Ubicaciones en stock: {ubicaciones_unicas}")

        return stock_df

    def transform(self, df_raw: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Transforma datos KLK a ambos formatos: productos y stock_actual

        Args:
            df_raw: DataFrame con datos crudos de KLK API

        Returns:
            Tupla (df_productos, df_stock)
        """
        self.logger.info(f"\n🔄 INICIANDO TRANSFORMACIÓN KLK → DUCKDB")
        self.logger.info(f"   Registros de entrada: {len(df_raw)}")

        if df_raw.empty:
            self.logger.warning("⚠️  No hay datos para transformar")
            return pd.DataFrame(), pd.DataFrame()

        # Log de muestra de datos
        self.logger.debug(f"Muestra de datos de entrada:\n{df_raw.head(2).to_dict('records')}")

        # Transformar a productos
        df_productos = self.transform_to_productos(df_raw)

        # Transformar a stock_actual
        df_stock = self.transform_to_stock_actual(df_raw)

        self.logger.info(f"\n✅ TRANSFORMACIÓN COMPLETADA")
        self.logger.info(f"   Productos: {len(df_productos)} registros")
        self.logger.info(f"   Stock: {len(df_stock)} registros")

        return df_productos, df_stock

    def validate_transformed_data(
        self,
        df_productos: pd.DataFrame,
        df_stock: pd.DataFrame
    ) -> Dict[str, any]:
        """
        Valida datos transformados antes de cargar a DuckDB

        Returns:
            Diccionario con resultados de validación
        """
        self.logger.info("\n🔍 VALIDANDO DATOS TRANSFORMADOS")

        validacion = {
            'valido': True,
            'errores': [],
            'warnings': [],
            'stats': {}
        }

        # Validar productos
        if df_productos.empty:
            validacion['errores'].append("Tabla productos vacía")
            validacion['valido'] = False
        else:
            # Códigos únicos
            duplicados_codigo = df_productos[df_productos.duplicated(subset=['codigo'], keep=False)]
            if not duplicados_codigo.empty:
                validacion['warnings'].append(
                    f"{len(duplicados_codigo)} productos con código duplicado"
                )

            # Productos sin descripción
            sin_descripcion = df_productos['descripcion'].isna().sum()
            if sin_descripcion > 0:
                validacion['errores'].append(f"{sin_descripcion} productos sin descripción")
                validacion['valido'] = False

            # Productos sin categoría
            sin_categoria = df_productos['categoria'].isna().sum()
            if sin_categoria > 0:
                validacion['warnings'].append(f"{sin_categoria} productos sin categoría")

            validacion['stats']['total_productos'] = len(df_productos)
            validacion['stats']['productos_unicos'] = df_productos['codigo'].nunique()
            validacion['stats']['con_precio'] = (df_productos['precio_venta'] > 0).sum()

        # Validar stock
        if df_stock.empty:
            validacion['errores'].append("Tabla stock_actual vacía")
            validacion['valido'] = False
        else:
            # Stock sin ubicación
            sin_ubicacion = df_stock['ubicacion_id'].isna().sum()
            if sin_ubicacion > 0:
                validacion['errores'].append(f"{sin_ubicacion} registros de stock sin ubicacion_id")
                validacion['valido'] = False

            # Stock sin producto
            sin_producto = df_stock['codigo_producto'].isna().sum()
            if sin_producto > 0:
                validacion['errores'].append(f"{sin_producto} registros de stock sin codigo_producto")
                validacion['valido'] = False

            validacion['stats']['total_stock'] = len(df_stock)
            validacion['stats']['stock_positivo'] = (df_stock['cantidad_actual'] > 0).sum()
            validacion['stats']['stock_negativo'] = (df_stock['cantidad_actual'] < 0).sum()
            validacion['stats']['ubicaciones'] = df_stock['ubicacion_id'].nunique()

        # Log de resultados
        if validacion['valido']:
            self.logger.info("✅ Validación exitosa")
        else:
            self.logger.error(f"❌ Validación falló: {len(validacion['errores'])} errores")

        if validacion['errores']:
            for error in validacion['errores']:
                self.logger.error(f"   ❌ {error}")

        if validacion['warnings']:
            for warning in validacion['warnings']:
                self.logger.warning(f"   ⚠️  {warning}")

        self.logger.info(f"\n📊 Estadísticas de validación:")
        for key, value in validacion['stats'].items():
            self.logger.info(f"   {key}: {value}")

        return validacion


def test_transformer():
    """Función para probar el transformer con datos de ejemplo"""

    print("\n" + "="*80)
    print("🧪 PROBANDO TRANSFORMER KLK")
    print("="*80)

    # Datos de ejemplo del API KLK
    sample_data = [
        {
            "NombreProducto": "JAMON ESPALDA AHUM. SHOULDER DRAGOS KG PZA COMP",
            "Codigo": "000001",
            "Barra": "001",
            "Categoria": "N/A",
            "Descripcion": "N/A",
            "Subcategoria": "N/A",
            "Descripcion_categoria": "N/A",
            "Marca": "DRAGOS",
            "Precio": 4.939655,
            "Iva": 16,
            "stock": 0,
            "ubicacion_id": "tienda_01",
            "ubicacion_nombre": "PERIFERICO",
            "fecha_extraccion": datetime.now()
        },
        {
            "NombreProducto": "QUESO AMARILLO KEMMENTAL KG",
            "Codigo": "000002",
            "Barra": "00010",
            "Categoria": "99",
            "Descripcion": "N/A",
            "Subcategoria": "99",
            "Descripcion_categoria": "DE TRIGO",
            "Marca": "N/A",
            "Precio": 12.08,
            "Iva": 16,
            "stock": 0,
            "ubicacion_id": "tienda_01",
            "ubicacion_nombre": "PERIFERICO",
            "fecha_extraccion": datetime.now()
        },
        {
            "NombreProducto": "ROMERO KG",
            "Codigo": "000006",
            "Barra": "01024",
            "Categoria": "08",
            "Descripcion": "FRUVER",
            "Subcategoria": "1",
            "Descripcion_categoria": "POR PESO",
            "Precio": 5.77,
            "Iva": 0,
            "stock": 10,
            "ubicacion_id": "tienda_01",
            "ubicacion_nombre": "PERIFERICO",
            "fecha_extraccion": datetime.now()
        }
    ]

    df_sample = pd.DataFrame(sample_data)

    print(f"\n📥 Datos de entrada:")
    print(df_sample[['Codigo', 'NombreProducto', 'Precio', 'stock']].to_string(index=False))

    # Crear transformer
    transformer = InventarioKLKTransformer()

    # Transformar
    df_productos, df_stock = transformer.transform(df_sample)

    print(f"\n📤 PRODUCTOS transformados:")
    print(df_productos[['codigo', 'descripcion', 'categoria', 'marca', 'precio_venta']].to_string(index=False))

    print(f"\n📤 STOCK transformado:")
    print(df_stock[['ubicacion_id', 'producto_id', 'cantidad', 'valor_inventario']].to_string(index=False))

    # Validar
    validacion = transformer.validate_transformed_data(df_productos, df_stock)

    print(f"\n✅ Test completado")
    print(f"   Validación: {'EXITOSA' if validacion['valido'] else 'FALLIDA'}")
    print("="*80 + "\n")


def transform_to_inventario_raw(self, df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Transforma datos KLK al formato de tabla inventario_raw

    Esta tabla es la que usa el dashboard para mostrar datos en tiempo real.

    Args:
        df_raw: DataFrame con datos crudos de KLK API (debe incluir ubicacion_id)

    Returns:
        DataFrame con formato de tabla inventario_raw
    """
    self.logger.info(f"🔄 Transformando {len(df_raw)} registros KLK a formato inventario_raw")

    if df_raw.empty:
        self.logger.warning("⚠️  DataFrame vacío para inventario_raw")
        return pd.DataFrame()

    # Validar que tenga ubicacion_id
    if 'ubicacion_id' not in df_raw.columns:
        raise ValueError("DataFrame debe contener 'ubicacion_id' para inventario_raw")

    # Obtener nombre de ubicación desde tiendas_config
    from tiendas_config import TIENDAS_CONFIG
    ubicacion_id = df_raw['ubicacion_id'].iloc[0]
    config = TIENDAS_CONFIG.get(ubicacion_id)
    ubicacion_nombre = config.ubicacion_nombre if config else ubicacion_id
    tipo_ubicacion = config.tipo if config else 'tienda'

    # Crear copia
    df = df_raw.copy()

    # Transformar datos
    inventario_df = pd.DataFrame({
        # Identificación
        'ubicacion_id': df['ubicacion_id'],
        'ubicacion_nombre': ubicacion_nombre,
        'tipo_ubicacion': tipo_ubicacion,
        'codigo_producto': df['Codigo'].astype(str).str.strip(),
        'codigo_barras': df['Barra'].astype(str).str.strip(),

        # Descripción del producto
        'descripcion_producto': df['NombreProducto'].fillna('').astype(str).str.strip().str[:200],
        'categoria': df['Descripcion'].replace('N/A', None).fillna('SIN CATEGORIA').astype(str).str.strip(),
        'subcategoria': df['Subcategoria'].replace('N/A', None).astype(str).str.strip(),
        'marca': df['Marca'].replace('N/A', None).astype(str).str.strip(),
        'presentacion': None,

        # Características del producto
        'peso_producto': None,  # KLK no tiene este dato
        'volumen_producto': None,
        'tipo_peso': None,
        'cantidad_bultos': 1.0,  # Valor por defecto

        # Cantidades
        'cantidad_actual': pd.to_numeric(df['stock'], errors='coerce').fillna(0),
        'cantidad_disponible': pd.to_numeric(df['stock'], errors='coerce').fillna(0),
        'cantidad_reservada': 0.0,
        'cantidad_en_transito': 0.0,

        # Valores monetarios
        'costo_unitario_actual': pd.to_numeric(df['Precio'], errors='coerce').fillna(0),
        'precio_venta_actual': pd.to_numeric(df['Precio'], errors='coerce').fillna(0),
        'valor_inventario_actual': (
            pd.to_numeric(df['stock'], errors='coerce').fillna(0) *
            pd.to_numeric(df['Precio'], errors='coerce').fillna(0)
        ),
        'margen_porcentaje': 0.0,  # No disponible en KLK

        # Control de stock
        'stock_minimo': 0.0,
        'stock_maximo': None,
        'punto_reorden': None,
        'estado_stock': 'NORMAL',

        # Ubicación física
        'ubicacion_fisica': None,
        'pasillo': None,
        'estante': None,

        # Fechas
        'fecha_ultima_entrada': None,
        'fecha_ultima_salida': None,
        'fecha_ultimo_conteo': None,
        'dias_sin_movimiento': 0,

        # Control
        'activo': True,
        'es_perecedero': False,
        'dias_vencimiento': None,

        # Metadatos ETL - IMPORTANTE: fecha_extraccion es el timestamp que ve el dashboard
        'fecha_extraccion': datetime.now(),
        'server_ip': None,  # KLK usa REST API, no tiene server_ip
        'batch_id': f"klk_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    })

    # Limpiar valores N/A
    for col in inventario_df.columns:
        if inventario_df[col].dtype == 'object':
            inventario_df[col] = inventario_df[col].replace(['N/A', 'n/a', '', ' '], None)

    self.logger.info(f"✅ inventario_raw transformado: {len(inventario_df)} registros")

    return inventario_df

# Agregar método a la clase
InventarioKLKTransformer.transform_to_inventario_raw = transform_to_inventario_raw


if __name__ == "__main__":
    test_transformer()
