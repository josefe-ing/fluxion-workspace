"""
Servicio de Cálculo de Nivel Objetivo

Descripción:
    Servicio para calcular niveles objetivo de inventario basados en:
    - Clasificación ABC-XYZ del producto
    - Parámetros configurables por tienda y matriz
    - Demanda promedio histórica (últimas 8 semanas)
    - Inventario en tránsito

Fórmulas:
    Demanda_Ciclo = Demanda_Promedio_Diaria × Periodo_Reposicion × Multiplicador_Demanda
    Stock_Seguridad = Z × Desviación_Estándar_Diaria × √Periodo_Reposicion × Multiplicador_SS
    Nivel_Objetivo = Demanda_Ciclo + Stock_Seguridad
    Cantidad_Sugerida = MAX(0, Nivel_Objetivo - (Stock_Actual + Inventario_En_Tránsito))

Parámetros del sistema:
    - Periodo_Reposicion = Lead_Time + Ciclo_Revisión = 1.5 + 1.0 = 2.5 días
    - Lead_Time = 1.5 días (tiempo desde pedido hasta recepción)
    - Ciclo_Revisión = 1 día (frecuencia de envíos)

Autor: Sistema FluxionIA
Fecha: 2025-01-12
Versión: 1.0
"""

import duckdb
import math
from pathlib import Path
from typing import Dict, Optional, List
from datetime import datetime, timedelta


class NivelObjetivoService:
    """Servicio para cálculo de niveles objetivo de inventario"""

    # Constantes del sistema
    LEAD_TIME_DIAS = 1.5
    CICLO_REVISION_DIAS = 1.0
    PERIODO_REPOSICION_DIAS = LEAD_TIME_DIAS + CICLO_REVISION_DIAS  # 2.5 días

    def __init__(self, db_path: str):
        """
        Inicializa el servicio con conexión a DuckDB

        Args:
            db_path: Ruta al archivo de base de datos DuckDB
        """
        self.db_path = db_path
        self.conn = None

    def _conectar(self):
        """Establece conexión a la base de datos si no existe"""
        if self.conn is None:
            self.conn = duckdb.connect(self.db_path)

    def _cerrar(self):
        """Cierra la conexión a la base de datos"""
        if self.conn is not None:
            self.conn.close()
            self.conn = None

    def __enter__(self):
        """Context manager entry"""
        self._conectar()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self._cerrar()

    # ========================================================================
    # FUNCIÓN 1: Obtener Demanda Promedio Diaria
    # ========================================================================

    def obtener_demanda_promedio_diaria(
        self,
        producto_id: str,
        tienda_id: str
    ) -> Dict:
        """
        Obtiene demanda promedio diaria del producto en la tienda desde productos_abc_v2.

        La demanda se calcula a partir de las métricas XYZ que ya están calculadas
        en la tabla productos_abc_v2, que usa datos de las últimas 8 semanas.

        Args:
            producto_id: ID del producto
            tienda_id: ID de la tienda

        Returns:
            Dict con:
                - demanda_promedio_semanal: float - Demanda semanal promedio
                - demanda_promedio_diaria: float - Demanda diaria (semanal / 7)
                - desviacion_estandar_semanal: float - Desviación estándar semanal
                - desviacion_estandar_diaria: float - Desviación estándar diaria
                - coeficiente_variacion: float - CV (desv / media)
                - matriz_abc_xyz: str - Clasificación del producto (ej: 'AX', 'BY')
                - clasificacion_abc_valor: str - Clasificación ABC ('A', 'B', 'C')
                - clasificacion_xyz: str - Clasificación XYZ ('X', 'Y', 'Z')
                - semanas_con_venta: int - Semanas con al menos una venta
                - semanas_analizadas: int - Total de semanas incluidas
                - confiabilidad_calculo: str - ALTA, MEDIA, BAJA

        Raises:
            ValueError: Si el producto no existe o no tiene datos ABC-XYZ
        """
        self._conectar()

        query = """
        SELECT
            demanda_promedio_semanal,
            desviacion_estandar_semanal,
            coeficiente_variacion,
            matriz_abc_xyz,
            clasificacion_abc_valor,
            clasificacion_xyz,
            semanas_con_venta,
            semanas_analizadas,
            confiabilidad_calculo
        FROM productos_abc_v2
        WHERE codigo_producto = ?
          AND ubicacion_id = ?
        """

        result = self.conn.execute(query, [producto_id, tienda_id]).fetchone()

        if not result:
            raise ValueError(
                f"No se encontraron datos ABC-XYZ para producto '{producto_id}' "
                f"en tienda '{tienda_id}'. Asegúrate de que el producto tenga "
                f"clasificación calculada en productos_abc_v2."
            )

        (
            demanda_prom_semanal,
            desv_std_semanal,
            coef_variacion,
            matriz,
            clase_abc,
            clase_xyz,
            semanas_con_venta,
            semanas_analizadas,
            confiabilidad
        ) = result

        # Convertir demanda semanal a diaria
        # Asumimos distribución uniforme de la demanda durante la semana
        demanda_prom_diaria = float(demanda_prom_semanal) / 7.0 if demanda_prom_semanal else 0

        # Convertir desviación estándar semanal a diaria
        # σ_diaria = σ_semanal / √7 (por propiedad de varianza de variables independientes)
        desv_std_diaria = float(desv_std_semanal) / math.sqrt(7) if desv_std_semanal else 0

        return {
            'demanda_promedio_semanal': float(demanda_prom_semanal or 0),
            'demanda_promedio_diaria': float(demanda_prom_diaria),
            'desviacion_estandar_semanal': float(desv_std_semanal or 0),
            'desviacion_estandar_diaria': float(desv_std_diaria),
            'coeficiente_variacion': float(coef_variacion or 0),
            'matriz_abc_xyz': str(matriz) if matriz else None,
            'clasificacion_abc_valor': str(clase_abc) if clase_abc else None,
            'clasificacion_xyz': str(clase_xyz) if clase_xyz else None,
            'semanas_con_venta': int(semanas_con_venta or 0),
            'semanas_analizadas': int(semanas_analizadas or 0),
            'confiabilidad_calculo': str(confiabilidad) if confiabilidad else 'BAJA'
        }

    # ========================================================================
    # FUNCIÓN 2: Calcular Inventario en Tránsito
    # ========================================================================

    def calcular_inventario_en_transito(
        self,
        producto_id: str,
        tienda_id: str
    ) -> float:
        """
        Calcula el inventario en tránsito para un producto en una tienda.

        El inventario en tránsito es la suma de cantidades de pedidos que están:
        - Aprobados por gerente
        - En proceso de picking
        - Despachados del CEDI
        - En tránsito hacia la tienda

        Pero que AÚN NO han sido recibidos físicamente en la tienda.

        Args:
            producto_id: ID del producto
            tienda_id: ID de la tienda

        Returns:
            float: Cantidad total en tránsito (en unidades)
        """
        self._conectar()

        # Estados que se consideran "en tránsito"
        estados_en_transito = [
            'aprobado_gerente',
            'en_picking',
            'en_transito',
            'despachado'
        ]

        query = """
        SELECT
            COALESCE(SUM(pd.total_unidades), 0) as total_en_transito
        FROM pedidos_sugeridos_detalle pd
        JOIN pedidos_sugeridos p ON pd.pedido_id = p.id
        WHERE pd.codigo_producto = ?
          AND p.tienda_destino_id = ?
          AND p.estado IN (?, ?, ?, ?)
          AND pd.incluido = true
        """

        result = self.conn.execute(
            query,
            [producto_id, tienda_id] + estados_en_transito
        ).fetchone()

        return float(result[0] if result else 0)

    # ========================================================================
    # FUNCIÓN 3: Obtener Parámetros de Reposición
    # ========================================================================

    def obtener_parametros_reposicion(
        self,
        tienda_id: str,
        matriz_abc_xyz: str
    ) -> Dict:
        """
        Obtiene los parámetros de reposición configurados para una tienda y matriz.

        Args:
            tienda_id: ID de la tienda
            matriz_abc_xyz: Matriz ABC-XYZ (ej: 'AX', 'BY', 'CZ')

        Returns:
            Dict con parámetros:
                - nivel_servicio_z: float - Z-score
                - multiplicador_demanda: float - Factor para demanda ciclo
                - multiplicador_ss: float - Factor para stock seguridad
                - incluir_stock_seguridad: bool - Si incluir SS en cálculo
                - prioridad_reposicion: int - Prioridad (1-9)

        Raises:
            ValueError: Si no existen parámetros para la combinación tienda+matriz
        """
        self._conectar()

        query = """
        SELECT
            nivel_servicio_z,
            multiplicador_demanda,
            multiplicador_ss,
            incluir_stock_seguridad,
            prioridad_reposicion
        FROM parametros_reposicion_tienda
        WHERE tienda_id = ?
          AND matriz_abc_xyz = ?
          AND activo = true
        """

        result = self.conn.execute(query, [tienda_id, matriz_abc_xyz]).fetchone()

        if not result:
            raise ValueError(
                f"No se encontraron parámetros de reposición para tienda '{tienda_id}' "
                f"y matriz '{matriz_abc_xyz}'. Ejecuta init_parametros_reposicion.py primero."
            )

        z, mult_demanda, mult_ss, incluir_ss, prioridad = result

        return {
            'nivel_servicio_z': float(z),
            'multiplicador_demanda': float(mult_demanda),
            'multiplicador_ss': float(mult_ss),
            'incluir_stock_seguridad': bool(incluir_ss),
            'prioridad_reposicion': int(prioridad)
        }

    # ========================================================================
    # FUNCIÓN 4: Calcular Nivel Objetivo (Principal)
    # ========================================================================

    def calcular_nivel_objetivo(
        self,
        producto_id: str,
        tienda_id: str
    ) -> Dict:
        """
        Calcula el nivel objetivo de inventario para un producto en una tienda.

        Este es el método principal que orquesta todo el cálculo.

        FÓRMULAS:
        ---------
        1. Demanda_Ciclo = Demanda_Promedio_Diaria × Periodo_Reposicion × Multiplicador_Demanda
        2. Stock_Seguridad = Z × Desviación_Estándar_Diaria × √Periodo_Reposicion × Multiplicador_SS
        3. Nivel_Objetivo = Demanda_Ciclo + Stock_Seguridad

        Args:
            producto_id: ID del producto
            tienda_id: ID de la tienda

        Returns:
            Dict con resultado completo:
                - nivel_objetivo: int - Nivel objetivo redondeado
                - stock_seguridad: int - Stock de seguridad redondeado
                - demanda_ciclo: float - Demanda esperada durante ciclo
                - matriz_abc_xyz: str - Clasificación del producto
                - parametros_usados: dict - Parámetros aplicados
                - metricas_base: dict - Métricas de demanda
                - calculos_intermedios: dict - Pasos del cálculo
                - alertas: list - Mensajes de advertencia si aplican

        Raises:
            ValueError: Si faltan datos o hay configuración inválida
        """
        self._conectar()

        alertas = []

        # Paso 1: Obtener demanda promedio y variabilidad
        try:
            demanda_data = self.obtener_demanda_promedio_diaria(producto_id, tienda_id)
        except ValueError as e:
            raise ValueError(f"Error al obtener demanda: {e}")

        demanda_prom_diaria = demanda_data['demanda_promedio_diaria']
        desv_std_diaria = demanda_data['desviacion_estandar_diaria']
        matriz_abc_xyz = demanda_data['matriz_abc_xyz']

        if not matriz_abc_xyz:
            raise ValueError(
                f"Producto '{producto_id}' no tiene matriz ABC-XYZ calculada. "
                f"Ejecuta calcular_xyz_por_tienda.py primero."
            )

        # Paso 2: Obtener parámetros de reposición para esta tienda y matriz
        try:
            parametros = self.obtener_parametros_reposicion(tienda_id, matriz_abc_xyz)
        except ValueError as e:
            raise ValueError(f"Error al obtener parámetros: {e}")

        # Paso 3: Calcular demanda durante el ciclo de reposición
        demanda_ciclo_base = demanda_prom_diaria * self.PERIODO_REPOSICION_DIAS
        demanda_ciclo_ajustada = demanda_ciclo_base * parametros['multiplicador_demanda']

        # Paso 4: Calcular stock de seguridad
        if parametros['incluir_stock_seguridad'] and parametros['nivel_servicio_z'] > 0:
            # SS = Z × σ_diaria × √T × Multiplicador_SS
            # Donde T = periodo de reposición en días
            stock_seguridad_base = (
                parametros['nivel_servicio_z'] *
                desv_std_diaria *
                math.sqrt(self.PERIODO_REPOSICION_DIAS)
            )
            stock_seguridad_ajustado = stock_seguridad_base * parametros['multiplicador_ss']
        else:
            stock_seguridad_base = 0
            stock_seguridad_ajustado = 0

            if not parametros['incluir_stock_seguridad']:
                alertas.append(
                    f"Stock de seguridad desactivado para matriz {matriz_abc_xyz}"
                )

        # Paso 5: Calcular nivel objetivo
        nivel_objetivo_float = demanda_ciclo_ajustada + stock_seguridad_ajustado
        nivel_objetivo_redondeado = int(math.ceil(nivel_objetivo_float))

        # Paso 6: Validar resultados
        if demanda_prom_diaria <= 0:
            alertas.append(
                "Demanda promedio diaria es 0 o negativa. Revisar historial de ventas."
            )

        if demanda_data['confiabilidad_calculo'] == 'BAJA':
            alertas.append(
                f"Confiabilidad del cálculo es BAJA. "
                f"Semanas con venta: {demanda_data['semanas_con_venta']}/{demanda_data['semanas_analizadas']}"
            )

        # Construir respuesta completa
        return {
            'nivel_objetivo': nivel_objetivo_redondeado,
            'stock_seguridad': int(math.ceil(stock_seguridad_ajustado)),
            'demanda_ciclo': round(demanda_ciclo_ajustada, 2),
            'matriz_abc_xyz': matriz_abc_xyz,
            'parametros_usados': parametros,
            'metricas_base': {
                'demanda_promedio_diaria': round(demanda_prom_diaria, 2),
                'demanda_promedio_semanal': demanda_data['demanda_promedio_semanal'],
                'desviacion_estandar_diaria': round(desv_std_diaria, 2),
                'coeficiente_variacion': demanda_data['coeficiente_variacion'],
                'semanas_analizadas': demanda_data['semanas_analizadas'],
                'semanas_con_venta': demanda_data['semanas_con_venta'],
                'confiabilidad_calculo': demanda_data['confiabilidad_calculo']
            },
            'calculos_intermedios': {
                'lead_time_dias': self.LEAD_TIME_DIAS,
                'ciclo_revision_dias': self.CICLO_REVISION_DIAS,
                'periodo_total_dias': self.PERIODO_REPOSICION_DIAS,
                'demanda_ciclo_base': round(demanda_ciclo_base, 2),
                'demanda_ciclo_ajustada': round(demanda_ciclo_ajustada, 2),
                'stock_seguridad_base': round(stock_seguridad_base, 2),
                'stock_seguridad_ajustado': round(stock_seguridad_ajustado, 2),
                'nivel_objetivo_float': round(nivel_objetivo_float, 2)
            },
            'alertas': alertas,
            'fecha_calculo': datetime.now().isoformat()
        }

    # ========================================================================
    # FUNCIÓN 5: Calcular Cantidad Sugerida
    # ========================================================================

    def calcular_cantidad_sugerida(
        self,
        producto_id: str,
        tienda_id: str,
        stock_actual: Optional[float] = None
    ) -> Dict:
        """
        Calcula la cantidad sugerida a pedir considerando:
        - Nivel objetivo
        - Stock actual
        - Inventario en tránsito

        FÓRMULA:
        Cantidad_Sugerida = MAX(0, Nivel_Objetivo - (Stock_Actual + Inventario_En_Tránsito))

        Args:
            producto_id: ID del producto
            tienda_id: ID de la tienda
            stock_actual: Stock actual (si no se provee, se consulta de stock_actual)

        Returns:
            Dict con:
                - cantidad_sugerida: int - Cantidad a pedir
                - nivel_objetivo: int - Nivel objetivo calculado
                - stock_actual: float - Stock actual de la tienda
                - inventario_en_transito: float - Cantidad en tránsito
                - disponible_total: float - Stock + En tránsito
                - deficit: float - Diferencia entre objetivo y disponible
                - (más detalles del cálculo)
        """
        # Calcular nivel objetivo
        nivel_data = self.calcular_nivel_objetivo(producto_id, tienda_id)

        # Obtener inventario en tránsito
        en_transito = self.calcular_inventario_en_transito(producto_id, tienda_id)

        # Obtener stock actual si no se proveyó
        if stock_actual is None:
            query = """
            SELECT COALESCE(cantidad, 0)
            FROM stock_actual
            WHERE producto_id = ?
              AND ubicacion_id = ?
            """
            result = self.conn.execute(query, [producto_id, tienda_id]).fetchone()
            stock_actual = float(result[0] if result else 0)

        # Calcular cantidad sugerida
        disponible_total = stock_actual + en_transito
        deficit = nivel_data['nivel_objetivo'] - disponible_total
        cantidad_sugerida = max(0, int(math.ceil(deficit)))

        return {
            'cantidad_sugerida': cantidad_sugerida,
            'nivel_objetivo': nivel_data['nivel_objetivo'],
            'stock_seguridad': nivel_data['stock_seguridad'],
            'demanda_ciclo': nivel_data['demanda_ciclo'],
            'stock_actual': round(stock_actual, 2),
            'inventario_en_transito': round(en_transito, 2),
            'disponible_total': round(disponible_total, 2),
            'deficit': round(deficit, 2),
            'matriz_abc_xyz': nivel_data['matriz_abc_xyz'],
            'detalles_calculo': nivel_data,
            'requiere_reposicion': cantidad_sugerida > 0
        }
