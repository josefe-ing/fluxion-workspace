#!/usr/bin/env python3
"""
Transformador de datos para ETL - La Granja Mercado
Normaliza y limpia los datos extraídos de SQL Server
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
import re
from pathlib import Path

from config import ETLConfig

class InventoryTransformer:
    """Transformador de datos de inventario"""

    def __init__(self):
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_transformer')
        logger.setLevel(logging.INFO)

        log_file = ETLConfig.LOG_DIR / f"transformer_{datetime.now().strftime('%Y%m%d')}.log"
        handler = logging.FileHandler(log_file)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        return logger

    def clean_text_fields(self, df: pd.DataFrame) -> pd.DataFrame:
        """Limpia campos de texto"""
        text_columns = df.select_dtypes(include=['object']).columns

        for col in text_columns:
            if col in df.columns:
                # Limpiar espacios y caracteres especiales
                df[col] = df[col].astype(str).str.strip()
                df[col] = df[col].str.replace(r'\s+', ' ', regex=True)  # Múltiples espacios
                df[col] = df[col].str.replace(r'[^\w\s\-\.\,]', '', regex=True)  # Caracteres especiales
                df[col] = df[col].replace('nan', None)
                df[col] = df[col].replace('', None)

        return df

    def standardize_product_codes(self, df: pd.DataFrame) -> pd.DataFrame:
        """Estandariza códigos de productos"""

        if 'codigo_producto' in df.columns:
            # Solo procesar valores no-nulos
            mask = df['codigo_producto'].notna()
            if mask.any():
                # Limpiar códigos solo para valores no-nulos
                df.loc[mask, 'codigo_producto'] = (df.loc[mask, 'codigo_producto']
                                                  .astype(str)
                                                  .str.upper()
                                                  .str.strip())
                df.loc[mask, 'codigo_producto'] = (df.loc[mask, 'codigo_producto']
                                                  .str.replace(r'[^A-Z0-9]', '', regex=True))

                # Convertir strings vacíos a None después de la limpieza
                df.loc[df['codigo_producto'] == '', 'codigo_producto'] = None
                df.loc[df['codigo_producto'] == 'NAN', 'codigo_producto'] = None

        if 'codigo_barras' in df.columns:
            # Solo procesar valores no-nulos
            mask = df['codigo_barras'].notna()
            if mask.any():
                # Limpiar códigos de barras
                df.loc[mask, 'codigo_barras'] = (df.loc[mask, 'codigo_barras']
                                               .astype(str)
                                               .str.strip())
                df.loc[mask, 'codigo_barras'] = (df.loc[mask, 'codigo_barras']
                                               .str.replace(r'[^0-9]', '', regex=True))
                # Códigos de barras vacíos o inválidos
                df.loc[(df['codigo_barras'].str.len() < 8) | (df['codigo_barras'] == ''), 'codigo_barras'] = None

        return df

    def normalize_categories(self, df: pd.DataFrame) -> pd.DataFrame:
        """Normaliza categorías de productos"""

        # Mapeo de categorías para normalizar
        category_mapping = {
            # Alimentos
            'ALIMENTOS': 'Alimentos',
            'COMIDA': 'Alimentos',
            'FOOD': 'Alimentos',
            'HARINAS': 'Alimentos',
            'CEREALES': 'Alimentos',
            'ACEITES': 'Alimentos',
            'CONDIMENTOS': 'Alimentos',

            # Bebidas
            'BEBIDAS': 'Bebidas',
            'DRINKS': 'Bebidas',
            'REFRESCOS': 'Bebidas',
            'GASEOSAS': 'Bebidas',
            'AGUAS': 'Bebidas',

            # Limpieza
            'LIMPIEZA': 'Limpieza',
            'CLEANING': 'Limpieza',
            'DETERGENTES': 'Limpieza',
            'DESINFECTANTES': 'Limpieza',

            # Cuidado Personal
            'CUIDADO_PERSONAL': 'Cuidado Personal',
            'PERSONAL_CARE': 'Cuidado Personal',
            'HIGIENE': 'Cuidado Personal',
            'COSMETICOS': 'Cuidado Personal',

            # Lácteos
            'LACTEOS': 'Lácteos',
            'DAIRY': 'Lácteos',
            'LECHES': 'Lácteos',
            'QUESOS': 'Lácteos',

            # Carnes
            'CARNES': 'Carnes',
            'MEAT': 'Carnes',
            'EMBUTIDOS': 'Carnes',
        }

        if 'categoria' in df.columns:
            # Normalizar formato
            df['categoria'] = df['categoria'].astype(str).str.upper().str.strip()

            # Aplicar mapeo
            df['categoria'] = df['categoria'].map(category_mapping).fillna(df['categoria'])

            # Capitalizar
            df['categoria'] = df['categoria'].str.title()

        return df

    def validate_numeric_fields(self, df: pd.DataFrame) -> pd.DataFrame:
        """Valida y corrige campos numéricos"""

        numeric_fields = [
            'cantidad_actual', 'cantidad_disponible', 'cantidad_reservada',
            'costo_unitario_actual', 'precio_venta_actual', 'valor_inventario_actual',
            'stock_minimo', 'stock_maximo', 'punto_reorden'
        ]

        for field in numeric_fields:
            if field in df.columns:
                # Convertir a numérico, valores inválidos se vuelven NaN
                df[field] = pd.to_numeric(df[field], errors='coerce')

                # Valores negativos no válidos para cantidades
                if 'cantidad' in field or 'stock' in field:
                    df.loc[df[field] < 0, field] = 0

                # Valores negativos no válidos para precios/costos
                if 'precio' in field or 'costo' in field or 'valor' in field:
                    df.loc[df[field] < 0, field] = 0

        return df

    def add_calculated_fields(self, df: pd.DataFrame) -> pd.DataFrame:
        """Agrega campos calculados"""

        # Estado de stock
        if all(col in df.columns for col in ['cantidad_actual', 'stock_minimo', 'stock_maximo']):

            def determine_stock_status(row):
                cantidad = row['cantidad_actual'] or 0
                minimo = row['stock_minimo'] or 0
                maximo = row['stock_maximo'] or 0
                punto_reorden = row.get('punto_reorden', minimo * 1.5)

                if cantidad == 0:
                    return 'SIN_STOCK'
                elif cantidad <= minimo:
                    return 'CRITICO'
                elif cantidad <= punto_reorden:
                    return 'BAJO'
                elif cantidad >= maximo:
                    return 'EXCESO'
                else:
                    return 'NORMAL'

            df['estado_stock'] = df.apply(determine_stock_status, axis=1)

        # Margen de ganancia
        if all(col in df.columns for col in ['precio_venta_actual', 'costo_unitario_actual']):
            df['margen_porcentaje'] = np.where(
                (df['costo_unitario_actual'] > 0) & (df['precio_venta_actual'] > 0),
                ((df['precio_venta_actual'] - df['costo_unitario_actual']) / df['costo_unitario_actual']) * 100,
                0
            )

        # Días sin movimiento (si tenemos fechas)
        if 'fecha_ultima_salida' in df.columns:
            df['fecha_ultima_salida'] = pd.to_datetime(df['fecha_ultima_salida'], errors='coerce')
            df['dias_sin_movimiento'] = (datetime.now() - df['fecha_ultima_salida']).dt.days
            df['dias_sin_movimiento'] = df['dias_sin_movimiento'].fillna(999)

        return df

    def remove_duplicates(self, df: pd.DataFrame) -> pd.DataFrame:
        """Elimina duplicados priorizando los más recientes"""

        # Identificar duplicados por código de producto y ubicación
        if all(col in df.columns for col in ['codigo_producto', 'ubicacion_id']):

            # Ordenar por fecha de extracción (más reciente primero)
            df = df.sort_values('fecha_extraccion', ascending=False)

            # Mantener el primer registro (más reciente) de cada combinación
            df = df.drop_duplicates(subset=['codigo_producto', 'ubicacion_id'], keep='first')

            self.logger.info(f"🔍 Duplicados eliminados. Registros finales: {len(df)}")

        return df

    def validate_required_fields(self, df: pd.DataFrame) -> pd.DataFrame:
        """Valida que los campos requeridos estén presentes"""

        required_fields = [
            'ubicacion_id', 'codigo_producto', 'descripcion_producto',
            'cantidad_actual', 'fecha_extraccion'
        ]

        # Verificar campos requeridos
        missing_fields = [field for field in required_fields if field not in df.columns]
        if missing_fields:
            self.logger.warning(f"⚠️  Campos requeridos faltantes: {missing_fields}")

        # Solo eliminar registros sin ubicacion_id (crítico)
        if 'ubicacion_id' in df.columns:
            initial_count = len(df)
            df = df.dropna(subset=['ubicacion_id'])
            removed = initial_count - len(df)
            if removed > 0:
                self.logger.warning(f"⚠️  {removed} registros eliminados por ubicacion_id vacío")

        # Generar código sintético para productos sin codigo_producto
        if 'codigo_producto' in df.columns and 'descripcion_producto' in df.columns:
            # Identificar registros sin código de producto
            missing_code_mask = df['codigo_producto'].isna()
            missing_code_count = missing_code_mask.sum()

            if missing_code_count > 0:
                self.logger.warning(f"⚠️  {missing_code_count} registros sin codigo_producto - generando códigos sintéticos")

                # Generar códigos sintéticos basados en la descripción del producto
                for idx in df[missing_code_mask].index:
                    descripcion = str(df.loc[idx, 'descripcion_producto'])
                    # Crear código sintético: primeras 3 palabras + hash de descripción
                    palabras = descripcion.upper().replace('Ñ', 'N').replace('Á', 'A').replace('É', 'E').replace('Í', 'I').replace('Ó', 'O').replace('Ú', 'U')
                    palabras = ''.join(c for c in palabras if c.isalnum() or c.isspace()).split()[:3]
                    codigo_base = ''.join(palabras)[:10]  # Máximo 10 caracteres
                    codigo_hash = str(hash(descripcion) % 1000).zfill(3)  # 3 dígitos
                    codigo_sintetico = f"SYN_{codigo_base}_{codigo_hash}"[:20]  # Máximo 20 caracteres

                    df.loc[idx, 'codigo_producto'] = codigo_sintetico

        # Eliminar registros sin descripción del producto (crítico)
        if 'descripcion_producto' in df.columns:
            initial_count = len(df)
            df = df.dropna(subset=['descripcion_producto'])
            removed = initial_count - len(df)
            if removed > 0:
                self.logger.warning(f"⚠️  {removed} registros eliminados por descripcion_producto vacía")

        return df

    def map_generic_tienda_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Mapea las columnas del query genérico al esquema estándar"""

        # Crear DataFrame con el esquema estándar
        mapped_df = pd.DataFrame()

        # Mapeo directo de columnas del query nuevo (mejorado) a esquema DuckDB
        # Solo mapear a columnas que existen en la tabla inventario_raw
        direct_mapping = {
            'descripcion_producto': 'descripcion_producto',
            'codigo_producto': 'codigo_producto',
            'categoria_producto': 'categoria',
            'marca_producto': 'marca',
            'precio_producto': 'precio_venta_actual',
            'costo_producto': 'costo_unitario_actual',
            'stock': 'cantidad_actual',
            'presentacion_producto': 'presentacion',
            'peso_producto': 'peso_producto',
            'volumen_producto': 'volumen_producto',
            'tipo_peso': 'tipo_peso',
            'cantidad_bultos': 'cantidad_bultos'
            # Nuevas columnas disponibles en query pero no en tabla DuckDB:
            # id, codigo_deposito, descripcion_deposito, grupo_producto, subgrupo_producto,
            # cuadrante_producto, impuesto_producto
        }

        # Aplicar mapeo directo
        for original_col, standard_col in direct_mapping.items():
            if original_col in df.columns:
                mapped_df[standard_col] = df[original_col]

        # Mantener columnas del extractor
        extractor_columns = ['ubicacion_id', 'ubicacion_nombre', 'tipo_ubicacion',
                           'fecha_extraccion', 'server_ip']
        for col in extractor_columns:
            if col in df.columns:
                mapped_df[col] = df[col]

        # Agregar columnas faltantes con valores por defecto
        default_columns = {
            'presentacion': 'UNIDAD',
            'cantidad_disponible': 0.0,
            'cantidad_reservada': 0.0,
            'cantidad_en_transito': 0.0,
            'costo_unitario_actual': 0.0,
            'valor_inventario_actual': 0.0,
            'margen_porcentaje': 0.0,
            'stock_minimo': 10.0,
            'stock_maximo': 100.0,
            'punto_reorden': 20.0,
            'estado_stock': 'NORMAL',
            'ubicacion_fisica': '',
            'pasillo': '',
            'estante': '',
            'fecha_ultima_entrada': None,
            'fecha_ultima_salida': None,
            'fecha_ultimo_conteo': None,
            'dias_sin_movimiento': 0,
            'activo': True,
            'es_perecedero': False,
            'dias_vencimiento': None,
            'batch_id': f"batch_{pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')}"
        }

        for col, default_value in default_columns.items():
            if col not in mapped_df.columns:
                mapped_df[col] = default_value

        # Los costos ya vienen directamente del query nuevo, no necesitan cálculo con IVA
        # Solo asegurarse de que los tipos de datos sean correctos
        if 'costo_unitario_actual' in mapped_df.columns:
            mapped_df['costo_unitario_actual'] = mapped_df['costo_unitario_actual'].fillna(0).astype(float)

        if 'precio_venta_actual' in mapped_df.columns:
            mapped_df['precio_venta_actual'] = mapped_df['precio_venta_actual'].fillna(0).astype(float)

        if 'cantidad_actual' in mapped_df.columns and 'precio_venta_actual' in mapped_df.columns:
            mapped_df['valor_inventario_actual'] = (mapped_df['cantidad_actual'].fillna(0).astype(float) *
                                                   mapped_df['precio_venta_actual'].fillna(0).astype(float))

        # Limpiar tipos de datos para DuckDB
        mapped_df = self.clean_data_types_for_duckdb(mapped_df)

        return mapped_df

    def map_el_bosque_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Mapea las columnas específicas de El Bosque al esquema estándar"""

        # Crear DataFrame con el esquema estándar
        mapped_df = pd.DataFrame()

        # Mapeo directo de columnas (solo las que existen en la tabla)
        column_mapping = {
            'nombreProducto': 'descripcion_producto',
            'Codigo': 'codigo_producto',
            'c_Codigo': 'codigo_barras',
            'descripcion': 'categoria',  # Usar la descripción en lugar del código
            'descripcion_subcategoria': 'subcategoria',  # Usar la descripción de subcategoría
            'marca': 'marca',
            'precio': 'precio_venta_actual',
            'stock': 'cantidad_actual'
        }

        # Aplicar mapeo
        for original_col, standard_col in column_mapping.items():
            if original_col in df.columns:
                mapped_df[standard_col] = df[original_col]

        # Mantener columnas del extractor
        extractor_columns = ['ubicacion_id', 'ubicacion_nombre', 'tipo_ubicacion',
                           'fecha_extraccion', 'server_ip']
        for col in extractor_columns:
            if col in df.columns:
                mapped_df[col] = df[col]

        # Agregar columnas faltantes con valores por defecto (solo las 37 columnas de la tabla)
        default_columns = {
            'presentacion': 'UNIDAD',
            'cantidad_disponible': 0.0,
            'cantidad_reservada': 0.0,
            'cantidad_en_transito': 0.0,
            'costo_unitario_actual': 0.0,
            'valor_inventario_actual': 0.0,
            'margen_porcentaje': 0.0,
            'stock_minimo': 10.0,
            'stock_maximo': 100.0,
            'punto_reorden': 20.0,
            'estado_stock': 'NORMAL',
            'ubicacion_fisica': '',
            'pasillo': '',
            'estante': '',
            'fecha_ultima_entrada': None,
            'fecha_ultima_salida': None,
            'fecha_ultimo_conteo': None,
            'dias_sin_movimiento': 0,
            'activo': True,
            'es_perecedero': False,
            'dias_vencimiento': None,
            'batch_id': f"batch_{pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')}"
            # No incluir 'id' - se genera automáticamente
            # No incluir 'created_at' - se genera automáticamente
        }

        for col, default_value in default_columns.items():
            mapped_df[col] = default_value

        # Calcular campos derivados usando IVA pero sin crear columna iva_porcentaje
        if 'precio_venta_actual' in mapped_df.columns and 'iva' in df.columns:
            # Calcular costo sin IVA usando los datos del IVA
            iva_porcentaje = df['iva'].astype(float)
            mapped_df['costo_unitario_actual'] = mapped_df['costo_unitario_actual'].astype(float)

            mask = iva_porcentaje > 0
            mapped_df.loc[mask, 'costo_unitario_actual'] = (
                mapped_df.loc[mask, 'precio_venta_actual'] / (1 + (iva_porcentaje.loc[mask] / 100))
            )

        if 'cantidad_actual' in mapped_df.columns and 'precio_venta_actual' in mapped_df.columns:
            mapped_df['valor_inventario_actual'] = mapped_df['cantidad_actual'] * mapped_df['precio_venta_actual']

        # Limpiar tipos de datos para DuckDB
        mapped_df = self.clean_data_types_for_duckdb(mapped_df)

        return mapped_df

    def clean_data_types_for_duckdb(self, df: pd.DataFrame) -> pd.DataFrame:
        """Limpia los tipos de datos para compatibilidad con DuckDB"""

        # Convertir fechas NULL a pd.NaT
        date_columns = ['fecha_ultima_entrada', 'fecha_ultima_salida', 'fecha_ultimo_conteo']
        for col in date_columns:
            if col in df.columns:
                df[col] = df[col].where(df[col].notna(), None)

        # Convertir INTEGER NULL a None
        int_columns = ['dias_vencimiento', 'dias_sin_movimiento']
        for col in int_columns:
            if col in df.columns:
                df[col] = df[col].where(df[col].notna(), None)

        return df

    def transform_inventory_data(self, raw_data: Dict[str, pd.DataFrame]) -> pd.DataFrame:
        """Transforma los datos de inventario de múltiples ubicaciones"""

        if not raw_data:
            self.logger.warning("⚠️  No hay datos para transformar")
            return pd.DataFrame()

        transformed_dfs = []
        total_records_input = 0
        total_records_output = 0

        self.logger.info(f"🔄 Transformando datos de {len(raw_data)} ubicaciones")

        for ubicacion_id, df in raw_data.items():
            if df.empty:
                self.logger.warning(f"⚠️  Sin datos para ubicación {ubicacion_id}")
                continue

            initial_count = len(df)
            total_records_input += initial_count

            self.logger.info(f"🔄 Transformando {ubicacion_id}: {initial_count} registros")

            try:
                # Mapear columnas al esquema estándar
                # Todas las tiendas ahora usan el query genérico (incluyendo tienda_01/PERIFERICO)
                df = self.map_generic_tienda_columns(df)

                # Aplicar transformaciones estándar
                df = self.clean_text_fields(df)
                df = self.standardize_product_codes(df)
                df = self.normalize_categories(df)
                df = self.validate_numeric_fields(df)
                df = self.add_calculated_fields(df)
                df = self.validate_required_fields(df)

                final_count = len(df)
                total_records_output += final_count

                if final_count > 0:
                    transformed_dfs.append(df)
                    self.logger.info(f"✅ {ubicacion_id} transformado: {final_count} registros válidos")
                else:
                    self.logger.warning(f"⚠️  {ubicacion_id}: Sin registros válidos después de transformación")

            except Exception as e:
                self.logger.error(f"❌ Error transformando {ubicacion_id}: {str(e)}")

        if not transformed_dfs:
            self.logger.error("❌ No hay datos transformados válidos")
            return pd.DataFrame()

        # Combinar todos los DataFrames
        combined_df = pd.concat(transformed_dfs, ignore_index=True)

        # Eliminar duplicados globales
        combined_df = self.remove_duplicates(combined_df)

        final_total = len(combined_df)

        self.logger.info(f"📊 Transformación completada:")
        self.logger.info(f"   📥 Registros entrada: {total_records_input:,}")
        self.logger.info(f"   📤 Registros salida: {final_total:,}")
        self.logger.info(f"   📈 Eficiencia: {(final_total/total_records_input)*100:.1f}%" if total_records_input > 0 else "   📈 Eficiencia: N/A")

        return combined_df

    def create_summary_report(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Crea un reporte resumen de los datos transformados"""

        if df.empty:
            return {"error": "No hay datos para analizar"}

        summary = {
            "timestamp": datetime.now().isoformat(),
            "total_records": len(df),
            "ubicaciones": {
                "total": df['ubicacion_id'].nunique(),
                "list": df['ubicacion_id'].value_counts().to_dict()
            },
            "productos": {
                "total": df['codigo_producto'].nunique(),
                "por_categoria": df['categoria'].value_counts().to_dict() if 'categoria' in df.columns else {}
            },
            "stock": {
                "total_unidades": df['cantidad_actual'].sum() if 'cantidad_actual' in df.columns else 0,
                "valor_total": df['valor_inventario_actual'].sum() if 'valor_inventario_actual' in df.columns else 0,
                "estados": df['estado_stock'].value_counts().to_dict() if 'estado_stock' in df.columns else {}
            },
            "calidad_datos": {
                "registros_completos": df.dropna().shape[0],
                "porcentaje_completitud": (df.dropna().shape[0] / len(df)) * 100 if len(df) > 0 else 0
            }
        }

        return summary

def test_transformer():
    """Función de prueba para el transformador"""

    print("🧪 PROBANDO TRANSFORMADOR DE INVENTARIO")
    print("=" * 50)

    # Crear datos de prueba
    test_data = {
        "tienda_01": pd.DataFrame({
            'codigo_producto': ['  HAR001  ', 'arr002', 'ACE-003'],
            'descripcion_producto': ['  Harina PAN  ', 'Arroz Primor', 'Aceite Girasol'],
            'categoria': ['ALIMENTOS', 'alimentos', 'Aceites'],
            'cantidad_actual': [150.5, 80, -5],  # -5 será corregido a 0
            'stock_minimo': [50, 30, 25],
            'stock_maximo': [500, 300, 200],
            'precio_venta_actual': [3.20, 4.50, 5.10],
            'costo_unitario_actual': [2.50, 3.80, 4.20],
            'ubicacion_id': ['tienda_01', 'tienda_01', 'tienda_01'],
            'fecha_extraccion': [datetime.now(), datetime.now(), datetime.now()]
        })
    }

    # Crear transformador y procesar
    transformer = InventoryTransformer()
    result_df = transformer.transform_inventory_data(test_data)

    print(f"\n📊 RESULTADO DE LA TRANSFORMACIÓN:")
    print(f"   📥 Registros originales: 3")
    print(f"   📤 Registros transformados: {len(result_df)}")

    if not result_df.empty:
        print(f"\n🔍 MUESTRA DE DATOS TRANSFORMADOS:")
        print(result_df[['codigo_producto', 'descripcion_producto', 'categoria', 'cantidad_actual', 'estado_stock']].head())

        # Crear reporte
        summary = transformer.create_summary_report(result_df)
        print(f"\n📋 REPORTE RESUMEN:")
        print(f"   📦 Total productos: {summary['productos']['total']}")
        print(f"   📍 Total ubicaciones: {summary['ubicaciones']['total']}")
        print(f"   📊 Estados de stock: {summary['stock']['estados']}")

    print("\n✅ Test de transformador completado")

if __name__ == "__main__":
    test_transformer()