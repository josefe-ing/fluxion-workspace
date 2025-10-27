#!/usr/bin/env python3
"""
Módulo de Análisis XYZ para Fluxion AI
Implementa clasificación por variabilidad, detección de tendencias y cálculo científico de stocks
"""

import math
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass
import statistics


@dataclass
class MetricasXYZ:
    """Métricas calculadas para análisis XYZ"""
    venta_diaria_5d: float
    venta_diaria_20d: float
    desviacion_estandar: float
    coeficiente_variacion: float

    tendencia_tipo: str  # 'creciente', 'decreciente', 'estable'
    tendencia_porcentaje: float
    tendencia_confianza: float

    estacionalidad_factor: float
    estacionalidad_patron: str


@dataclass
class StockCalculado:
    """Stock calculado según metodología"""
    minimo: float
    seguridad: float
    maximo: float
    punto_reorden: float
    sugerido: int


@dataclass
class AnalisisXYZProducto:
    """Resultado completo del análisis XYZ para un producto"""
    codigo_producto: str
    clasificacion_abc: str
    clasificacion_xyz: str
    clasificacion_combinada: str

    metricas: MetricasXYZ
    stock_abc: StockCalculado
    stock_xyz: StockCalculado

    diferencia_bultos: int
    razones: List[str]


# ============================================================================
# 1. CLASIFICACIÓN XYZ POR VARIABILIDAD
# ============================================================================

def calcular_coeficiente_variacion(ventas_diarias: List[float]) -> Tuple[float, float, float]:
    """
    Calcula el coeficiente de variación (CV) de la demanda.

    CV = σ / μ

    - X (Predecible): CV < 0.5
    - Y (Variable): 0.5 ≤ CV ≤ 1.0
    - Z (Errático): CV > 1.0

    Args:
        ventas_diarias: Lista de ventas diarias en unidades

    Returns:
        Tupla (media, desviación_estándar, coeficiente_variación)
    """
    if not ventas_diarias or len(ventas_diarias) < 2:
        return 0.0, 0.0, 0.0

    # Filtrar valores None y negativos
    ventas_validas = [v for v in ventas_diarias if v is not None and v >= 0]

    if len(ventas_validas) < 2:
        return 0.0, 0.0, 0.0

    media = statistics.mean(ventas_validas)
    desv_std = statistics.stdev(ventas_validas)

    # Evitar división por cero
    cv = desv_std / media if media > 0 else 0.0

    return media, desv_std, cv


def clasificar_xyz(cv: float) -> str:
    """
    Clasifica producto según coeficiente de variación.

    Args:
        cv: Coeficiente de variación

    Returns:
        'X', 'Y', o 'Z'
    """
    if cv < 0.5:
        return 'X'  # Predecible
    elif cv <= 1.0:
        return 'Y'  # Variable
    else:
        return 'Z'  # Errático


# ============================================================================
# 2. DETECCIÓN DE TENDENCIAS
# ============================================================================

def detectar_tendencia(
    venta_5d: float,
    venta_20d: float,
    umbral_significancia: float = 0.20
) -> Tuple[str, float, float]:
    """
    Detecta si hay tendencia creciente o decreciente en la demanda.

    Compara promedio de últimos 5 días vs últimos 20 días.

    Args:
        venta_5d: Promedio de ventas últimos 5 días
        venta_20d: Promedio de ventas últimos 20 días
        umbral_significancia: Umbral para considerar tendencia significativa (20% por defecto)

    Returns:
        Tupla (tipo, porcentaje_cambio, confianza)
        - tipo: 'creciente', 'decreciente', 'estable'
        - porcentaje_cambio: % de cambio
        - confianza: 0.0 a 1.0
    """
    if venta_20d == 0:
        return 'estable', 0.0, 0.0

    cambio = (venta_5d - venta_20d) / venta_20d
    porcentaje = cambio * 100

    # Determinar tipo de tendencia
    if cambio > umbral_significancia:
        tipo = 'creciente'
    elif cambio < -umbral_significancia:
        tipo = 'decreciente'
    else:
        tipo = 'estable'

    # Confianza basada en magnitud del cambio (máximo 1.0)
    confianza = min(abs(cambio), 1.0)

    return tipo, porcentaje, confianza


# ============================================================================
# 3. DETECCIÓN DE ESTACIONALIDAD
# ============================================================================

def calcular_factor_estacional(
    fecha_analisis: datetime,
    incluir_fin_semana: bool = True,
    incluir_quincena: bool = True
) -> Tuple[float, str]:
    """
    Calcula factor de ajuste por estacionalidad.

    Patrones detectados:
    - Fin de semana (Sábado-Domingo): +40%
    - Quincena (días 1-7 y 15-22): +20%

    Args:
        fecha_analisis: Fecha para la cual calcular factor
        incluir_fin_semana: Considerar patrón de fin de semana
        incluir_quincena: Considerar patrón de quincena

    Returns:
        Tupla (factor, patron_detectado)
        - factor: Multiplicador (1.0 = normal, 1.4 = +40%)
        - patron: Descripción del patrón
    """
    factor = 1.0
    patrones = []

    # Patrón de fin de semana
    if incluir_fin_semana:
        dia_semana = fecha_analisis.weekday()  # 0=Lunes, 6=Domingo
        if dia_semana >= 5:  # Sábado o Domingo
            factor *= 1.4
            patrones.append('fin de semana')

    # Patrón de quincena (días de pago)
    if incluir_quincena:
        dia_mes = fecha_analisis.day
        if (1 <= dia_mes <= 7) or (15 <= dia_mes <= 22):
            factor *= 1.2
            patrones.append('quincena')

    patron_str = ' + '.join(patrones) if patrones else 'normal'

    return factor, patron_str


# ============================================================================
# 4. STOCK DE SEGURIDAD CIENTÍFICO
# ============================================================================

def calcular_z_score(
    clasificacion_abc: str,
    clasificacion_xyz: str
) -> Tuple[float, float]:
    """
    Calcula Z-score para nivel de servicio objetivo.

    Z-scores por ABC (nivel de servicio):
    - A: 2.33 (99%)
    - AB: 2.05 (98%)
    - B: 1.65 (95%)
    - BC: 1.28 (90%)
    - C: 0.84 (80%)

    Ajustes por XYZ:
    - X (Predecible): -20% (menos stock de seguridad)
    - Y (Variable): 0% (normal)
    - Z (Errático): +30% (más stock de seguridad)

    Args:
        clasificacion_abc: 'A', 'AB', 'B', 'BC', 'C'
        clasificacion_xyz: 'X', 'Y', 'Z'

    Returns:
        Tupla (z_score, nivel_servicio)
    """
    # Z-scores base por ABC
    z_scores_abc = {
        'A': (2.33, 0.99),
        'AB': (2.05, 0.98),
        'B': (1.65, 0.95),
        'BC': (1.28, 0.90),
        'C': (0.84, 0.80),
    }

    z_base, nivel_servicio = z_scores_abc.get(clasificacion_abc, (1.65, 0.95))

    # Ajustes por variabilidad XYZ
    ajustes_xyz = {
        'X': 0.8,   # Reducir 20%
        'Y': 1.0,   # Normal
        'Z': 1.3,   # Aumentar 30%
    }

    ajuste = ajustes_xyz.get(clasificacion_xyz, 1.0)
    z_final = z_base * ajuste

    return z_final, nivel_servicio


def calcular_stock_seguridad_cientifico(
    desviacion_std_diaria: float,
    lead_time_dias: int,
    z_score: float
) -> float:
    """
    Calcula stock de seguridad usando fórmula científica.

    SS = Z × σ × √(LT)

    Donde:
    - SS: Stock de Seguridad
    - Z: Z-score del nivel de servicio deseado
    - σ: Desviación estándar de la demanda diaria
    - LT: Lead Time (tiempo de reposición en días)

    Args:
        desviacion_std_diaria: Desviación estándar de ventas diarias
        lead_time_dias: Días de lead time
        z_score: Z-score calculado

    Returns:
        Stock de seguridad en unidades
    """
    if desviacion_std_diaria <= 0 or lead_time_dias <= 0:
        return 0.0

    ss = z_score * desviacion_std_diaria * math.sqrt(lead_time_dias)

    return max(0.0, ss)


# ============================================================================
# 5. CÁLCULO DE STOCKS CON MÉTODO XYZ
# ============================================================================

def calcular_stocks_xyz(
    venta_diaria_proyectada: float,
    desviacion_std_diaria: float,
    clasificacion_abc: str,
    clasificacion_xyz: str,
    lead_time_dias: int = 3,
    stock_min_dias: int = 3,
    stock_max_dias: int = 6
) -> StockCalculado:
    """
    Calcula todos los niveles de stock usando metodología XYZ mejorada.

    Args:
        venta_diaria_proyectada: Venta diaria ajustada por tendencia y estacionalidad
        desviacion_std_diaria: Desviación estándar de la demanda
        clasificacion_abc: Clasificación ABC del producto
        clasificacion_xyz: Clasificación XYZ del producto
        lead_time_dias: Días de lead time para reposición
        stock_min_dias: Días de cobertura para stock mínimo
        stock_max_dias: Días de cobertura para stock máximo

    Returns:
        StockCalculado con todos los niveles
    """
    # 1. Stock Mínimo (días de cobertura base)
    stock_minimo = venta_diaria_proyectada * stock_min_dias

    # 2. Stock de Seguridad (científico)
    z_score, _ = calcular_z_score(clasificacion_abc, clasificacion_xyz)
    stock_seguridad = calcular_stock_seguridad_cientifico(
        desviacion_std_diaria,
        lead_time_dias,
        z_score
    )

    # 3. Punto de Reorden
    # ROP = (Demanda diaria × Lead Time) + Stock de Seguridad
    demanda_durante_lt = venta_diaria_proyectada * lead_time_dias
    punto_reorden = demanda_durante_lt + stock_seguridad

    # 4. Stock Máximo
    stock_maximo = venta_diaria_proyectada * stock_max_dias

    return StockCalculado(
        minimo=stock_minimo,
        seguridad=stock_seguridad,
        maximo=stock_maximo,
        punto_reorden=punto_reorden,
        sugerido=0  # Se calcula después con lógica de reposición
    )


# ============================================================================
# 6. CÁLCULO DE PEDIDO SUGERIDO
# ============================================================================

def calcular_pedido_sugerido_xyz(
    stock_actual_bultos: float,
    stock_cedi_bultos: float,
    punto_reorden_bultos: float,
    stock_maximo_bultos: float,
    venta_diaria_bultos: float
) -> Tuple[int, List[str]]:
    """
    Calcula cantidad sugerida a pedir según metodología XYZ.

    Lógica:
    1. Si Stock Actual (en días) <= Punto de Reorden (en días): PEDIR
    2. Cantidad = Stock Máximo - Stock Actual
    3. Limitar por disponibilidad en CEDI

    Args:
        stock_actual_bultos: Stock actual + tránsito en bultos
        stock_cedi_bultos: Stock disponible en CEDI origen
        punto_reorden_bultos: Punto de reorden en bultos
        stock_maximo_bultos: Stock máximo en bultos
        venta_diaria_bultos: Venta diaria promedio en bultos

    Returns:
        Tupla (cantidad_sugerida, razones)
    """
    razones = []

    # Convertir a días
    if venta_diaria_bultos <= 0:
        return 0, ['Sin historial de ventas']

    stock_actual_dias = stock_actual_bultos / venta_diaria_bultos
    punto_reorden_dias = punto_reorden_bultos / venta_diaria_bultos

    # ¿Necesitamos pedir?
    if stock_actual_dias > punto_reorden_dias:
        razones.append(f'Stock suficiente: {stock_actual_dias:.1f} días > {punto_reorden_dias:.1f} días reorden')
        return 0, razones

    # Calcular cantidad a pedir
    cantidad_ideal = stock_maximo_bultos - stock_actual_bultos
    cantidad_limitada = min(cantidad_ideal, stock_cedi_bultos)
    cantidad_final = max(0, round(cantidad_limitada))

    # Razones
    if cantidad_final > 0:
        razones.append(f'Stock bajo punto de reorden ({stock_actual_dias:.1f}d ≤ {punto_reorden_dias:.1f}d)')
        razones.append(f'Cantidad para llegar a stock máximo: {cantidad_ideal:.1f} bultos')

        if cantidad_limitada < cantidad_ideal:
            razones.append(f'⚠️ Limitado por stock CEDI: {stock_cedi_bultos:.0f} bultos disponibles')

    return cantidad_final, razones


# ============================================================================
# 7. ANÁLISIS COMPLETO XYZ
# ============================================================================

def analizar_producto_xyz(
    codigo_producto: str,
    ventas_diarias_20d: List[float],
    clasificacion_abc: str,
    stock_tienda: float,
    stock_transito: float,
    stock_cedi: float,
    cantidad_bulto: float,
    fecha_analisis: Optional[datetime] = None,
    stock_params_abc: Optional[Dict] = None
) -> AnalisisXYZProducto:
    """
    Realiza análisis completo XYZ de un producto.

    Este es el método principal que orquesta todos los cálculos.

    Args:
        codigo_producto: Código del producto
        ventas_diarias_20d: Lista de ventas diarias (últimos 20 días)
        clasificacion_abc: Clasificación ABC actual
        stock_tienda: Stock en tienda (unidades)
        stock_transito: Stock en tránsito (unidades)
        stock_cedi: Stock en CEDI origen (unidades)
        cantidad_bulto: Unidades por bulto
        fecha_analisis: Fecha del análisis (default: hoy)
        stock_params_abc: Parámetros del método ABC (para comparación)

    Returns:
        AnalisisXYZProducto con todos los cálculos y comparaciones
    """
    if fecha_analisis is None:
        fecha_analisis = datetime.now()

    # 1. Calcular métricas base
    media_20d, desv_std_20d, cv = calcular_coeficiente_variacion(ventas_diarias_20d)

    # 2. Clasificar XYZ
    clasificacion_xyz = clasificar_xyz(cv)
    clasificacion_combinada = f"{clasificacion_abc}-{clasificacion_xyz}"

    # 3. Detectar tendencia
    venta_5d = statistics.mean(ventas_diarias_20d[-5:]) if len(ventas_diarias_20d) >= 5 else media_20d
    tendencia_tipo, tendencia_pct, tendencia_conf = detectar_tendencia(venta_5d, media_20d)

    # 4. Calcular factor estacional
    factor_estacional, patron_estacional = calcular_factor_estacional(fecha_analisis)

    # 5. Venta proyectada (con tendencia y estacionalidad)
    venta_proyectada = media_20d
    if tendencia_tipo == 'creciente':
        venta_proyectada *= (1 + tendencia_pct / 100)
    elif tendencia_tipo == 'decreciente':
        venta_proyectada *= (1 + tendencia_pct / 100)  # Ya es negativo

    venta_proyectada *= factor_estacional

    # 6. Convertir a bultos
    venta_diaria_bultos = media_20d / cantidad_bulto
    venta_proyectada_bultos = venta_proyectada / cantidad_bulto
    desv_std_bultos = desv_std_20d / cantidad_bulto

    # 7. Calcular stocks XYZ
    stock_xyz = calcular_stocks_xyz(
        venta_diaria_proyectada=venta_proyectada_bultos,
        desviacion_std_diaria=desv_std_bultos,
        clasificacion_abc=clasificacion_abc,
        clasificacion_xyz=clasificacion_xyz,
        lead_time_dias=3
    )

    # 8. Calcular stocks ABC (para comparación)
    # TODO: Implementar con stock_params_abc
    stock_abc = StockCalculado(
        minimo=0, seguridad=0, maximo=0, punto_reorden=0, sugerido=0
    )

    # 9. Calcular pedido sugerido XYZ
    stock_total_bultos = (stock_tienda + stock_transito) / cantidad_bulto
    stock_cedi_bultos = stock_cedi / cantidad_bulto

    sugerido_xyz, razones_xyz = calcular_pedido_sugerido_xyz(
        stock_actual_bultos=stock_total_bultos,
        stock_cedi_bultos=stock_cedi_bultos,
        punto_reorden_bultos=stock_xyz.punto_reorden,
        stock_maximo_bultos=stock_xyz.maximo,
        venta_diaria_bultos=venta_proyectada_bultos
    )

    stock_xyz.sugerido = sugerido_xyz

    # 10. Crear métricas
    metricas = MetricasXYZ(
        venta_diaria_5d=venta_5d / cantidad_bulto,
        venta_diaria_20d=venta_diaria_bultos,
        desviacion_estandar=desv_std_bultos,
        coeficiente_variacion=cv,
        tendencia_tipo=tendencia_tipo,
        tendencia_porcentaje=tendencia_pct,
        tendencia_confianza=tendencia_conf,
        estacionalidad_factor=factor_estacional,
        estacionalidad_patron=patron_estacional
    )

    # 11. Generar razones de diferencia
    diferencia = sugerido_xyz - stock_abc.sugerido
    razones = generar_razones_diferencia(
        diferencia=diferencia,
        metricas=metricas,
        clasificacion_xyz=clasificacion_xyz
    )

    return AnalisisXYZProducto(
        codigo_producto=codigo_producto,
        clasificacion_abc=clasificacion_abc,
        clasificacion_xyz=clasificacion_xyz,
        clasificacion_combinada=clasificacion_combinada,
        metricas=metricas,
        stock_abc=stock_abc,
        stock_xyz=stock_xyz,
        diferencia_bultos=diferencia,
        razones=razones
    )


def generar_razones_diferencia(
    diferencia: int,
    metricas: MetricasXYZ,
    clasificacion_xyz: str
) -> List[str]:
    """
    Genera explicaciones de por qué XYZ difiere de ABC.

    Args:
        diferencia: Diferencia en bultos (XYZ - ABC)
        metricas: Métricas calculadas
        clasificacion_xyz: Clasificación XYZ

    Returns:
        Lista de razones explicativas
    """
    razones = []

    # Tendencia
    if abs(metricas.tendencia_porcentaje) > 10:
        emoji = '📈' if metricas.tendencia_tipo == 'creciente' else '📉'
        razones.append(
            f"{emoji} Tendencia {metricas.tendencia_tipo} detectada "
            f"({metricas.tendencia_porcentaje:+.0f}% últimas 2 semanas)"
        )

    # Variabilidad
    if clasificacion_xyz == 'Y':
        razones.append(
            f"⚡ Variabilidad media (CV={metricas.coeficiente_variacion:.2f}) "
            f"→ Stock seguridad científico ajustado"
        )
    elif clasificacion_xyz == 'Z':
        razones.append(
            f"🌀 Alta variabilidad (CV={metricas.coeficiente_variacion:.2f}) "
            f"→ Stock seguridad +30% vs. predecibles"
        )

    # Estacionalidad
    if metricas.estacionalidad_factor > 1.1:
        razones.append(
            f"📅 Patrón estacional: {metricas.estacionalidad_patron} "
            f"→ Factor {metricas.estacionalidad_factor:.1f}x demanda base"
        )

    # Conclusión
    if diferencia > 0:
        razones.append(f"🎯 XYZ sugiere +{diferencia} bultos para evitar stockout")
    elif diferencia < 0:
        razones.append(f"🎯 XYZ sugiere {diferencia} bultos (optimizar inventario)")
    else:
        razones.append("🎯 ABC y XYZ coinciden - producto bien gestionado")

    return razones
