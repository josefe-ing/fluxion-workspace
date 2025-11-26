#!/usr/bin/env python3
"""
Transformer de Ventas para Sistema KLK - La Granja Mercado
Transforma datos de ventas KLK al esquema ventas_raw de DuckDB

Autor: ETL Team
Fecha: 2025-11-24
"""

import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Tuple
import logging


class VentasKLKTransformer:
    """Transformer para datos de ventas KLK"""

    def __init__(self):
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_ventas_klk_transformer')
        if not logger.handlers:
            logger.setLevel(logging.INFO)
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Transforma datos de ventas KLK al esquema ventas_raw

        Args:
            df: DataFrame con datos de ventas KLK

        Returns:
            DataFrame transformado al esquema ventas_raw
        """
        if df.empty:
            self.logger.warning("⚠️  DataFrame de entrada está vacío")
            return pd.DataFrame()

        self.logger.info(f"\n🔄 INICIANDO TRANSFORMACIÓN VENTAS KLK → VENTAS_RAW")
        self.logger.info(f"   Registros de entrada: {len(df):,}")

        # Parsear fecha y hora
        df['fecha_parsed'] = pd.to_datetime(df['fecha'], errors='coerce')
        df['hora_parsed'] = df['hora'].apply(self._parse_hora)

        # Crear columnas temporales
        df['ano'] = df['fecha_parsed'].dt.year.astype(str)
        df['mes'] = df['fecha_parsed'].dt.month.astype(str).str.zfill(2)
        df['dia'] = df['fecha_parsed'].dt.day.astype(str).str.zfill(2)
        df['dia_semana'] = df['fecha_parsed'].dt.dayofweek.astype(str)
        df['nombre_dia'] = df['fecha_parsed'].dt.day_name()
        df['nombre_mes'] = df['fecha_parsed'].dt.month_name()

        # Calcular turno y período del día basado en la hora
        df['turno'] = df['hora_parsed'].apply(self._calcular_turno)
        df['periodo_dia'] = df['hora_parsed'].apply(self._calcular_periodo)
        df['tipo_dia'] = df['fecha_parsed'].dt.dayofweek.apply(
            lambda x: 'fin_semana' if x >= 5 else 'laboral'
        )

        # Crear DataFrame transformado
        transformed_df = pd.DataFrame({
            # Identificadores
            'numero_factura': df['numero_factura'].astype(str),
            'ubicacion_id': df['ubicacion_id'].astype(str),
            'ubicacion_nombre': df['ubicacion_nombre'].astype(str),
            'linea': df['linea'].astype(str),

            # Fecha y hora
            'fecha': df['fecha'].astype(str),
            'fecha_venta': df['fecha_hora_completa'],  # Para PostgreSQL v2.0
            'hora': df['hora_parsed'].astype(str),
            'fecha_hora_completa': df['fecha_hora_completa'].astype(str),

            # Componentes de fecha
            'ano': df['ano'],
            'mes': df['mes'],
            'dia': df['dia'],
            'dia_semana': df['dia_semana'],
            'nombre_dia': df['nombre_dia'],
            'nombre_mes': df['nombre_mes'],
            'turno': df['turno'],
            'periodo_dia': df['periodo_dia'],
            'tipo_dia': df['tipo_dia'],

            # Producto
            'codigo_transaccion': df['numero_factura'].astype(str),
            'codigo_producto': df['codigo_producto'].astype(str),
            'descripcion_producto': df['descripcion_producto'].fillna('').astype(str),
            'marca_producto': df['marca_producto'].fillna('').astype(str),
            'modelo_producto': df['modelo_producto'].fillna('').astype(str),
            'cuadrante_producto': '',  # No disponible en KLK
            'presentacion_producto': '',  # No disponible en KLK
            'categoria_producto': df['categoria_producto'].fillna('').astype(str),
            'grupo_producto': df['grupo_producto'].fillna('').astype(str),
            'subgrupo_producto': df['subgrupo_producto'].fillna('').astype(str),
            'categoria_especial': '',  # No disponible en KLK
            'categoria_precio': '',  # No disponible en KLK
            'tipo_venta': 'normal',  # Default para KLK

            # Cantidades - mantener como float para agregaciones correctas
            'cantidad_vendida': pd.to_numeric(df['cantidad_vendida'], errors='coerce').fillna(0),
            'cantidad_bultos': 0.0,  # No disponible en KLK
            'peso_unitario': pd.to_numeric(df['peso_unitario'], errors='coerce').fillna(0),
            'volumen_unitario': 0.0,  # No disponible en KLK
            'peso_calculado': 0.0,  # No disponible en KLK
            'peso_total_vendido': 0.0,  # No disponible en KLK
            'volumen_total_vendido': 0.0,  # No disponible en KLK
            'tipo_peso': df['unidad_medida_venta'].fillna('UNIDAD').astype(str),

            # Financiero - mantener como float para agregaciones correctas (usar USD como base - más estable que Bs)
            'costo_unitario': pd.to_numeric(df['costo_unitario_usd'], errors='coerce').fillna(0),
            'precio_unitario': pd.to_numeric(df['precio_unitario_usd'], errors='coerce').fillna(0),
            'impuesto_porcentaje': pd.to_numeric(df['impuesto_porcentaje'], errors='coerce').fillna(0),
            'precio_por_kg': 0.0,  # No disponible en KLK
            'costo_total': pd.to_numeric(df['costo_total_usd'], errors='coerce').fillna(0),
            'venta_total': pd.to_numeric(df['venta_total_usd'], errors='coerce').fillna(0),
            'utilidad_bruta': pd.to_numeric(df['utilidad_bruta_usd'], errors='coerce').fillna(0),
            'margen_bruto_pct': self._calcular_margen(
                pd.to_numeric(df['utilidad_bruta_usd'], errors='coerce').fillna(0),
                pd.to_numeric(df['venta_total_usd'], errors='coerce').fillna(0)
            ),
            'impuesto_total': pd.to_numeric(df['impuesto_monto'], errors='coerce').fillna(0),
            'venta_sin_impuesto': (
                pd.to_numeric(df['venta_total_usd'], errors='coerce').fillna(0) -
                pd.to_numeric(df['impuesto_monto'], errors='coerce').fillna(0) /
                pd.to_numeric(df['tasa_usd'], errors='coerce').fillna(1)
            ),

            # Flags
            'es_peso_variable': (df['unidad_medida_venta'] == 'KG').astype(str).str.lower(),
            'producto_alta_rotacion': 'false',  # Se puede calcular después
            'venta_alto_valor': (pd.to_numeric(df['venta_total_usd'], errors='coerce') > 50).astype(str).str.lower(),
            'tamano_transaccion': self._clasificar_tamano_transaccion(
                pd.to_numeric(df['venta_total_usd'], errors='coerce').fillna(0)
            ),

            # Metadatos
            'fecha_extraccion': df['fecha_extraccion'].astype(str),
            'fecha_transformacion': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'version_transformacion': 'klk_v1.0',
        })

        # Validaciones
        self.logger.info(f"\n✅ TRANSFORMACIÓN COMPLETADA")
        self.logger.info(f"   Registros transformados: {len(transformed_df):,}")
        self.logger.info(f"   Facturas únicas: {transformed_df['numero_factura'].nunique():,}")
        self.logger.info(f"   Productos únicos: {transformed_df['codigo_producto'].nunique():,}")

        # Estadísticas financieras
        venta_total = pd.to_numeric(transformed_df['venta_total'], errors='coerce').sum()
        self.logger.info(f"   Venta total USD: ${venta_total:,.2f}")

        return transformed_df

    def _parse_hora(self, hora_str: str) -> str:
        """Parsea la hora de KLK (formato con microsegundos) a HH:MM:SS"""
        if not hora_str:
            return "00:00:00"
        try:
            # Formato: "12:20:15.2762433"
            parts = str(hora_str).split('.')
            return parts[0] if parts else "00:00:00"
        except:
            return "00:00:00"

    def _calcular_turno(self, hora: str) -> str:
        """Calcula el turno basado en la hora"""
        try:
            hour = int(hora.split(':')[0])
            if 6 <= hour < 14:
                return 'mañana'
            elif 14 <= hour < 22:
                return 'tarde'
            else:
                return 'noche'
        except:
            return 'mañana'

    def _calcular_periodo(self, hora: str) -> str:
        """Calcula el período del día basado en la hora"""
        try:
            hour = int(hora.split(':')[0])
            if 6 <= hour < 10:
                return 'apertura'
            elif 10 <= hour < 13:
                return 'media_mañana'
            elif 13 <= hour < 16:
                return 'almuerzo'
            elif 16 <= hour < 19:
                return 'tarde'
            elif 19 <= hour < 22:
                return 'cierre'
            else:
                return 'fuera_horario'
        except:
            return 'media_mañana'

    def _calcular_margen(self, utilidad: pd.Series, venta: pd.Series) -> pd.Series:
        """Calcula el margen bruto porcentual"""
        return np.where(venta != 0, (utilidad / venta * 100).round(2), 0)

    def _clasificar_tamano_transaccion(self, venta: pd.Series) -> pd.Series:
        """Clasifica el tamaño de la transacción"""
        conditions = [
            venta < 5,
            (venta >= 5) & (venta < 20),
            (venta >= 20) & (venta < 50),
            venta >= 50
        ]
        choices = ['pequeña', 'mediana', 'grande', 'muy_grande']
        return pd.Series(np.select(conditions, choices, default='mediana'))


def test_transformer():
    """Test básico del transformer"""
    print("\n" + "="*80)
    print("TEST: Transformer de Ventas KLK")
    print("="*80 + "\n")

    # Crear datos de prueba
    test_data = pd.DataFrame({
        'numero_factura': ['F001', 'F001', 'F002'],
        'linea': [1, 2, 1],
        'fecha': ['2025-11-24', '2025-11-24', '2025-11-24'],
        'hora': ['10:30:15.123', '10:30:15.123', '14:45:00.000'],
        'fecha_hora_completa': ['2025-11-24T10:30:15', '2025-11-24T10:30:15', '2025-11-24T14:45:00'],
        'codigo_producto': ['001', '002', '003'],
        'descripcion_producto': ['Producto A', 'Producto B', 'Producto C'],
        'marca_producto': ['Marca1', 'Marca2', 'Marca3'],
        'modelo_producto': ['', '', ''],
        'categoria_producto': ['Cat1', 'Cat1', 'Cat2'],
        'grupo_producto': ['Grupo1', 'Grupo1', 'Grupo2'],
        'subgrupo_producto': ['Sub1', 'Sub2', 'Sub1'],
        'codigo_barras': ['123', '456', '789'],
        'codigo_almacen': ['APP-TPF', 'APP-TPF', 'APP-TPF'],
        'nombre_almacen': ['PISO DE VENTA', 'PISO DE VENTA', 'PISO DE VENTA'],
        'cantidad_vendida': [2, 1, 5],
        'peso_unitario': [0, 0, 0],
        'unidad_medida_venta': ['UNIDAD', 'UNIDAD', 'KG'],
        'factor_unidad_medida': [1, 1, 1],
        'costo_unitario_bs': [100, 200, 50],
        'precio_unitario_bs': [150, 300, 75],
        'venta_total_bs': [300, 300, 375],
        'costo_total_bs': [200, 200, 250],
        'utilidad_bruta_bs': [100, 100, 125],
        'costo_unitario_usd': [1.0, 2.0, 0.5],
        'precio_unitario_usd': [1.5, 3.0, 0.75],
        'venta_total_usd': [3.0, 3.0, 3.75],
        'costo_total_usd': [2.0, 2.0, 2.5],
        'utilidad_bruta_usd': [1.0, 1.0, 1.25],
        'impuesto_porcentaje': [16, 16, 0],
        'impuesto_monto': [48, 48, 0],
        'porcentaje_descuento': [0, 0, 0],
        'monto_descuento': [0, 0, 0],
        'total_factura': [600, 600, 375],
        'tasa_usd': [100, 100, 100],
        'es_no_fiscal': [False, False, False],
        'tiene_promocion': ['', '', ''],
        'codigo_promocion': ['', '', ''],
        'ubicacion_id': ['tienda_01', 'tienda_01', 'tienda_01'],
        'ubicacion_nombre': ['PERIFERICO', 'PERIFERICO', 'PERIFERICO'],
        'fecha_extraccion': [datetime.now(), datetime.now(), datetime.now()],
        'fuente_sistema': ['KLK', 'KLK', 'KLK']
    })

    transformer = VentasKLKTransformer()
    result = transformer.transform(test_data)

    print(f"\n📊 Resultado:")
    print(f"   Columnas: {len(result.columns)}")
    print(f"   Filas: {len(result)}")
    print(f"\n📋 Primeras columnas del resultado:")
    print(result[['numero_factura', 'codigo_producto', 'venta_total', 'turno', 'periodo_dia']].to_string())

    print("\n" + "="*80)
    print("✅ Test de transformer completado")
    print("="*80 + "\n")


if __name__ == "__main__":
    test_transformer()
