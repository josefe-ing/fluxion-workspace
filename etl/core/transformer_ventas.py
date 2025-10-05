#!/usr/bin/env python3
"""
Transformador de datos de ventas para ETL - La Granja Mercado
Limpia, normaliza y enriquece los datos de ventas
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional
from datetime import datetime, date
import logging
from pathlib import Path

from config import ETLConfig

class VentasTransformer:
    """Transformador especializado para datos de ventas"""

    def __init__(self):
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_ventas_transformer')
        logger.setLevel(logging.INFO)

        log_file = ETLConfig.LOG_DIR / f"ventas_transformer_{datetime.now().strftime('%Y%m%d')}.log"
        handler = logging.FileHandler(log_file)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        return logger

    def transform_ventas_data(self, raw_data: pd.DataFrame) -> pd.DataFrame:
        """
        Transforma los datos brutos de ventas

        Args:
            raw_data: DataFrame con datos brutos de ventas

        Returns:
            DataFrame transformado y limpio
        """

        if raw_data.empty:
            self.logger.warning("⚠️ DataFrame de entrada vacío")
            return pd.DataFrame()

        self.logger.info(f"🔄 Iniciando transformación de {len(raw_data):,} registros de ventas")

        df = raw_data.copy()

        # 1. Limpiar y normalizar campos de texto
        df = self._limpiar_campos_texto(df)

        # 2. Procesar fechas y horas
        df = self._procesar_fechas(df)

        # 3. Normalizar datos numéricos
        df = self._normalizar_numeros(df)

        # 4. Calcular métricas derivadas
        df = self._calcular_metricas_derivadas(df)

        # 5. Categorizar productos
        df = self._categorizar_productos(df)

        # 6. Enriquecer con datos de negocio
        df = self._enriquecer_datos_negocio(df)

        # 7. Validar y limpiar registros inválidos
        df = self._validar_y_limpiar(df)

        # 8. Agregar metadatos
        df = self._agregar_metadatos(df)

        self.logger.info(f"✅ Transformación completada: {len(df):,} registros válidos")

        # DEBUG: Verificar cantidad_bultos después de transformación
        if 'cantidad_bultos' in df.columns:
            non_null_bultos = df[df['cantidad_bultos'].notna()]
            self.logger.info(f"🔍 DEBUG TRANSFORMER - cantidad_bultos:")
            self.logger.info(f"   Total registros: {len(df)}")
            self.logger.info(f"   Con cantidad_bultos no nulo: {len(non_null_bultos)}")
            if len(non_null_bultos) > 0:
                self.logger.info(f"   Primeros 5 valores: {non_null_bultos['cantidad_bultos'].head().tolist()}")
                self.logger.info(f"   Tipos de datos: {df['cantidad_bultos'].dtype}")
        else:
            self.logger.warning(f"⚠️ DEBUG TRANSFORMER - cantidad_bultos NO está en las columnas transformadas!")
            self.logger.info(f"   Columnas disponibles: {df.columns.tolist()}")

        return df

    def _limpiar_campos_texto(self, df: pd.DataFrame) -> pd.DataFrame:
        """Limpia y normaliza campos de texto"""
        self.logger.info("🧹 Limpiando campos de texto...")

        campos_texto = [
            'descripcion_producto', 'marca_producto', 'modelo_producto',
            'categoria_producto', 'grupo_producto', 'subgrupo_producto',
            'presentacion_producto', 'cuadrante_producto'
        ]

        for campo in campos_texto:
            if campo in df.columns:
                # Limpiar y normalizar
                df[campo] = df[campo].astype(str)
                df[campo] = df[campo].str.strip()
                df[campo] = df[campo].str.upper()
                df[campo] = df[campo].replace(['NAN', 'NONE', ''], 'NO ESPECIFICADO')

                # Limpiar caracteres especiales
                df[campo] = df[campo].str.replace(r'[^\w\s-]', '', regex=True)
                df[campo] = df[campo].str.replace(r'\s+', ' ', regex=True)

        return df

    def _procesar_fechas(self, df: pd.DataFrame) -> pd.DataFrame:
        """Procesa y enriquece campos de fecha y hora"""
        self.logger.info("📅 Procesando fechas y horas...")

        # Convertir fechas con manejo de errores
        if 'fecha' in df.columns:
            df['fecha'] = pd.to_datetime(df['fecha'], errors='coerce')
            # Convertir a string en formato ISO para compatibilidad con DuckDB
            df['fecha'] = df['fecha'].dt.strftime('%Y-%m-%d')

        if 'fecha_hora_completa' in df.columns:
            df['fecha_hora_completa'] = pd.to_datetime(df['fecha_hora_completa'], errors='coerce')
            # Usar fecha_hora_completa como base para extraer componentes
            fecha_base = df['fecha_hora_completa']

            # Extraer componentes de tiempo usando fecha_base
            df['ano'] = fecha_base.dt.year
            df['mes'] = fecha_base.dt.month
            df['dia'] = fecha_base.dt.day
            df['hora_numero'] = fecha_base.dt.hour  # Guardar hora como número para clasificaciones
            df['dia_semana'] = fecha_base.dt.dayofweek
            df['nombre_dia'] = fecha_base.dt.strftime('%A')
            df['nombre_mes'] = fecha_base.dt.strftime('%B')

            # Mantener hora como string en formato TIME
            if 'hora' not in df.columns:
                df['hora'] = fecha_base.dt.strftime('%H:%M:%S')
            else:
                # Si ya existe hora, convertirla a string
                df['hora'] = df['hora'].astype(str)

            # Convertir fecha_hora_completa a string también
            df['fecha_hora_completa'] = fecha_base.dt.strftime('%Y-%m-%d %H:%M:%S')

        # También procesar campo 'hora' si existe como TIME
        if 'hora' in df.columns and 'fecha_hora_completa' not in df.columns:
            # Si solo tenemos hora como campo separado
            try:
                hora_temp = pd.to_datetime(df['hora'], format='%H:%M:%S', errors='coerce').dt.time
                df['hora'] = hora_temp.astype(str)
            except:
                # Si falla, convertir a string directamente
                df['hora'] = df['hora'].astype(str)

        # Categorías de tiempo para análisis (SIEMPRE crear estas columnas)
        if 'hora_numero' in df.columns:
            df['turno'] = df['hora_numero'].apply(self._clasificar_turno)
            df['periodo_dia'] = df['hora_numero'].apply(self._clasificar_periodo_dia)
        elif 'hora' in df.columns:
            # Si no hay hora_numero pero sí hora string, extraer el número
            try:
                df['hora_numero'] = pd.to_datetime(df['hora'], format='%H:%M:%S', errors='coerce').dt.hour
                df['turno'] = df['hora_numero'].apply(self._clasificar_turno)
                df['periodo_dia'] = df['hora_numero'].apply(self._clasificar_periodo_dia)
            except:
                # Si falla, crear valores por defecto
                df['turno'] = 'NO_ESPECIFICADO'
                df['periodo_dia'] = 'NO_ESPECIFICADO'
        else:
            # Si no hay información de hora
            df['turno'] = 'NO_ESPECIFICADO'
            df['periodo_dia'] = 'NO_ESPECIFICADO'

        if 'dia_semana' in df.columns:
            df['tipo_dia'] = df['dia_semana'].apply(self._clasificar_tipo_dia)
        else:
            df['tipo_dia'] = 'NO_ESPECIFICADO'

        return df

    def _clasificar_turno(self, hora: int) -> str:
        """Clasifica el turno basado en la hora"""
        if 6 <= hora < 14:
            return 'MAÑANA'
        elif 14 <= hora < 22:
            return 'TARDE'
        else:
            return 'NOCHE'

    def _clasificar_periodo_dia(self, hora: int) -> str:
        """Clasifica el período del día con más granularidad"""
        if 6 <= hora < 10:
            return 'TEMPRANO'
        elif 10 <= hora < 12:
            return 'MEDIA_MAÑANA'
        elif 12 <= hora < 14:
            return 'MEDIODIA'
        elif 14 <= hora < 17:
            return 'TARDE'
        elif 17 <= hora < 20:
            return 'NOCHE_TEMPRANA'
        else:
            return 'NOCHE_TARDIA'

    def _clasificar_tipo_dia(self, dia_semana: int) -> str:
        """Clasifica el tipo de día"""
        if dia_semana in [5, 6]:  # Sábado y Domingo
            return 'FIN_DE_SEMANA'
        else:
            return 'DIA_LABORAL'

    def _normalizar_numeros(self, df: pd.DataFrame) -> pd.DataFrame:
        """Normaliza y valida campos numéricos (modo permisivo)"""
        self.logger.info("🔢 Normalizando campos numéricos...")

        # Campos numéricos a procesar
        campos_numericos = [
            'cantidad_vendida', 'cantidad_bultos', 'peso_unitario', 'volumen_unitario',
            'costo_unitario', 'precio_unitario', 'impuesto_porcentaje',
            'peso_calculado'
        ]

        for campo in campos_numericos:
            if campo in df.columns:
                # Convertir a numérico, forzar errores a NaN
                df[campo] = pd.to_numeric(df[campo], errors='coerce')

                # MODO PERMISIVO: Ya NO reemplazamos valores negativos o zero
                # Permitimos todos los valores (pueden ser devoluciones, ajustes, obsequios, etc.)

        # Redondear campos monetarios a 2 decimales (solo si no son NaN)
        campos_monetarios = ['costo_unitario', 'precio_unitario']
        for campo in campos_monetarios:
            if campo in df.columns:
                df[campo] = df[campo].round(2)

        return df

    def _calcular_metricas_derivadas(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calcula métricas financieras y de negocio derivadas"""
        self.logger.info("📊 Calculando métricas derivadas...")

        # Verificar campos requeridos
        if 'cantidad_vendida' not in df.columns:
            self.logger.warning("⚠️ Campo 'cantidad_vendida' faltante, no se pueden calcular métricas")
            return df

        # Métricas financieras básicas
        if 'precio_unitario' in df.columns:
            df['venta_total'] = (df['cantidad_vendida'] * df['precio_unitario']).round(2)

        if 'costo_unitario' in df.columns:
            df['costo_total'] = (df['cantidad_vendida'] * df['costo_unitario']).round(2)

        # Utilidad bruta
        if 'venta_total' in df.columns and 'costo_total' in df.columns:
            df['utilidad_bruta'] = (df['venta_total'] - df['costo_total']).round(2)
            df['margen_bruto_pct'] = ((df['utilidad_bruta'] / df['venta_total']) * 100).round(2)

        # Impuestos
        if 'impuesto_porcentaje' in df.columns and 'venta_total' in df.columns:
            df['impuesto_total'] = (df['venta_total'] * df['impuesto_porcentaje'] / 100).round(2)
            df['venta_sin_impuesto'] = (df['venta_total'] - df['impuesto_total']).round(2)

        # Métricas de peso/volumen
        if 'peso_calculado' in df.columns:
            df['peso_total_vendido'] = (df['cantidad_vendida'] * df['peso_calculado']).round(3)

        if 'volumen_unitario' in df.columns:
            df['volumen_total_vendido'] = (df['cantidad_vendida'] * df['volumen_unitario']).round(3)

        # Precio por unidad de peso (para productos por peso)
        if 'precio_unitario' in df.columns and 'peso_calculado' in df.columns:
            df['precio_por_kg'] = (df['precio_unitario'] / df['peso_calculado']).round(2)
            df['precio_por_kg'] = df['precio_por_kg'].replace([np.inf, -np.inf], np.nan)

        return df

    def _categorizar_productos(self, df: pd.DataFrame) -> pd.DataFrame:
        """Categoriza productos para análisis de negocio"""
        self.logger.info("🏷️ Categorizando productos...")

        # Categorías de precio
        if 'precio_unitario' in df.columns:
            df['categoria_precio'] = pd.cut(df['precio_unitario'],
                                          bins=[0, 10, 50, 200, 1000, float('inf')],
                                          labels=['MUY_BAJO', 'BAJO', 'MEDIO', 'ALTO', 'PREMIUM'],
                                          include_lowest=True)

        # Productos por peso vs por unidad
        if 'tipo_peso' in df.columns:
            df['tipo_venta'] = df['tipo_peso'].map({
                0: 'POR_UNIDAD',
                1: 'POR_PESO',
                4: 'SERVICIO'
            }).fillna('NO_ESPECIFICADO')

        # Clasificación de departamentos especiales
        if 'categoria_producto' in df.columns:
            df['es_peso_variable'] = df['categoria_producto'].isin(['CHARCUTERIA', 'FRUVER'])
            df['categoria_especial'] = df['categoria_producto'].apply(self._clasificar_categoria_especial)

        return df

    def _clasificar_categoria_especial(self, categoria: str) -> str:
        """Clasifica categorías en grupos especiales para análisis"""
        if pd.isna(categoria):
            return 'NO_ESPECIFICADO'

        categoria = str(categoria).upper()

        if categoria in ['CHARCUTERIA', 'FRUVER']:
            return 'PRODUCTOS_FRESCOS'
        elif categoria in ['LACTEOS', 'CONGELADOS']:
            return 'REFRIGERADOS'
        elif categoria in ['LIMPIEZA', 'ASEO']:
            return 'HIGIENE_HOGAR'
        elif categoria in ['LICORES', 'CERVEZAS']:
            return 'LICORES'
        else:
            return 'ABARROTES'

    def _enriquecer_datos_negocio(self, df: pd.DataFrame) -> pd.DataFrame:
        """Enriquece con datos adicionales de negocio"""
        self.logger.info("💼 Enriqueciendo con datos de negocio...")

        # Identificar productos de alta rotación (simplificado)
        if 'codigo_producto' in df.columns:
            conteo_productos = df['codigo_producto'].value_counts()
            productos_top = conteo_productos.head(100).index
            df['producto_alta_rotacion'] = df['codigo_producto'].isin(productos_top)

        # Identificar ventas de alto valor
        if 'venta_total' in df.columns:
            umbral_alto_valor = df['venta_total'].quantile(0.9)
            df['venta_alto_valor'] = df['venta_total'] > umbral_alto_valor

        # Clasificar por tamaño de transacción
        if 'cantidad_vendida' in df.columns:
            df['tamano_transaccion'] = pd.cut(df['cantidad_vendida'],
                                            bins=[0, 1, 5, 20, float('inf')],
                                            labels=['UNITARIA', 'PEQUEÑA', 'MEDIANA', 'GRANDE'],
                                            include_lowest=True)

        return df

    def _validar_y_limpiar(self, df: pd.DataFrame) -> pd.DataFrame:
        """Valida y limpia registros inválidos (validación mínima)"""
        self.logger.info("🔍 Validando datos (modo permisivo)...")

        inicial = len(df)

        # SOLO eliminar registros que realmente no tienen sentido:
        # - Sin numero_factura (no podemos identificar la transacción)
        if 'numero_factura' in df.columns:
            antes = len(df)
            df = df.dropna(subset=['numero_factura'])
            eliminados = antes - len(df)
            if eliminados > 0:
                self.logger.warning(f"⚠️ Eliminados {eliminados} registros sin número de factura")

        # NOTA: Ya NO eliminamos por:
        # - codigo_producto nulo (puede ser servicio o producto sin código)
        # - cantidad_vendida nulo o <= 0 (pueden ser devoluciones, ajustes, etc.)
        # - precio_unitario <= 0 (pueden ser promociones, obsequios, etc.)

        final = len(df)
        if inicial != final:
            self.logger.info(f"📉 Registros filtrados: {inicial:,} → {final:,} ({final/inicial*100:.1f}%)")
        else:
            self.logger.info(f"✅ Todos los registros pasaron validación: {final:,}")

        return df

    def _agregar_metadatos(self, df: pd.DataFrame) -> pd.DataFrame:
        """Agrega metadatos al DataFrame"""
        if not df.empty:
            df['fecha_transformacion'] = datetime.now()
            df['version_transformacion'] = '1.0'

            # Convertir campos específicos a string para evitar problemas de tipo en DuckDB
            string_cols = ['fecha', 'fecha_hora_completa', 'fecha_extraccion', 'fecha_transformacion']
            for col in string_cols:
                if col in df.columns:
                    df[col] = df[col].astype(str)

            # Eliminar columna temporal hora_numero si existe
            if 'hora_numero' in df.columns:
                df = df.drop(columns=['hora_numero'])

        return df

    def generar_estadisticas_transformacion(self, df_original: pd.DataFrame, df_transformado: pd.DataFrame) -> Dict[str, Any]:
        """
        Genera estadísticas del proceso de transformación

        Returns:
            Dict con estadísticas detalladas
        """

        return {
            "registros_entrada": len(df_original),
            "registros_salida": len(df_transformado),
            "tasa_supervivencia": len(df_transformado) / max(len(df_original), 1) * 100,
            "columnas_entrada": len(df_original.columns) if not df_original.empty else 0,
            "columnas_salida": len(df_transformado.columns) if not df_transformado.empty else 0,
            "rango_fechas": {
                "desde": df_transformado['fecha'].min() if 'fecha' in df_transformado.columns and not df_transformado.empty else None,
                "hasta": df_transformado['fecha'].max() if 'fecha' in df_transformado.columns and not df_transformado.empty else None
            },
            "metricas_negocio": {
                "total_facturas": df_transformado['numero_factura'].nunique() if 'numero_factura' in df_transformado.columns and not df_transformado.empty else 0,
                "total_productos": df_transformado['codigo_producto'].nunique() if 'codigo_producto' in df_transformado.columns and not df_transformado.empty else 0,
                "venta_total": df_transformado['venta_total'].sum() if 'venta_total' in df_transformado.columns and not df_transformado.empty else 0,
                "ticket_promedio": df_transformado.groupby('numero_factura')['venta_total'].sum().mean() if not df_transformado.empty else 0
            }
        }