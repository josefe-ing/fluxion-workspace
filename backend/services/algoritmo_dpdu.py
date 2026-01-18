"""
Algoritmo DPD+U: Distribución Proporcional por Demanda + Urgencia

Este módulo implementa el algoritmo para distribuir stock limitado entre
múltiples tiendas de forma justa cuando hay escasez en el CEDI.

Fórmula:
- Factor Demanda: % de ventas diarias de cada tienda vs total
- Factor Urgencia: 1 / días_stock (más urgente si menos días)
- Peso Final: (pct_demanda × peso_demanda) + (pct_urgencia × peso_urgencia)
- Asignación: stock_disponible × peso_final

Los pesos son configurables desde la BD (tabla config_inventario_global):
- dpdu_peso_demanda: default 0.60 (60%)
- dpdu_peso_urgencia: default 0.40 (40%)
"""

import math
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from decimal import Decimal


# === DATACLASSES ===

@dataclass
class ConfigDPDU:
    """Configuración del algoritmo DPD+U (viene de BD)."""
    peso_demanda: float = 0.60
    peso_urgencia: float = 0.40
    dias_minimo_urgencia: float = 0.5  # Debajo de esto = urgencia máxima


@dataclass
class DatosTiendaProducto:
    """Datos de una tienda para un producto específico."""
    tienda_id: str
    tienda_nombre: str
    demanda_p75: float          # Ventas diarias P75 (unidades)
    stock_actual: float         # Stock actual en tienda (unidades)
    dias_stock: float           # dias_stock = stock_actual / demanda_p75
    cantidad_necesaria: float   # Cantidad que necesita según cálculo ABC


@dataclass
class AsignacionTienda:
    """Resultado de la asignación DPD+U para una tienda."""
    tienda_id: str
    tienda_nombre: str

    # Datos de entrada
    demanda_p75: float
    stock_actual: float
    dias_stock: float
    cantidad_necesaria: float

    # Cálculos intermedios
    urgencia: float             # 1 / dias_stock
    pct_demanda: float          # % del total de demanda
    pct_urgencia: float         # % del total de urgencia
    peso_final: float           # Peso combinado (0-1)

    # Resultado
    cantidad_asignada_unid: float
    cantidad_asignada_bultos: int

    # Indicadores
    deficit_vs_necesidad: float  # cantidad_asignada - cantidad_necesaria (negativo = déficit)
    cobertura_dias_resultante: float  # Días de stock después de recibir


@dataclass
class ResultadoDistribucion:
    """Resultado completo de la distribución DPD+U para un producto."""
    codigo_producto: str
    descripcion_producto: str

    # Stock disponible
    stock_cedi_disponible: float
    stock_cedi_bultos: int
    unidades_por_bulto: int

    # Demanda total
    demanda_total_tiendas: float
    necesidad_total_tiendas: float

    # Es conflicto?
    es_conflicto: bool  # True si stock_cedi < necesidad_total

    # Distribución por tienda
    asignaciones: List[AsignacionTienda]

    # Configuración usada
    config_usada: ConfigDPDU


# === FUNCIONES PRINCIPALES ===

def calcular_urgencia(dias_stock: float, dias_minimo: float = 0.5) -> float:
    """
    Calcula el factor de urgencia basado en días de stock.

    - Si dias_stock <= dias_minimo: urgencia máxima (100.0)
    - Si dias_stock > dias_minimo: urgencia = 1 / dias_stock

    Args:
        dias_stock: Días de cobertura actual
        dias_minimo: Umbral para urgencia máxima

    Returns:
        Factor de urgencia (mayor = más urgente)
    """
    if dias_stock <= 0:
        return 100.0  # Urgencia máxima si no hay stock
    elif dias_stock <= dias_minimo:
        return 100.0  # Urgencia máxima si está por debajo del mínimo
    else:
        return 1.0 / dias_stock


def calcular_distribucion_dpdu(
    stock_cedi: float,
    unidades_por_bulto: int,
    datos_tiendas: List[DatosTiendaProducto],
    config: ConfigDPDU
) -> List[AsignacionTienda]:
    """
    Distribuye stock limitado entre tiendas usando el algoritmo DPD+U.

    Pasos:
    1. Calcular % de demanda de cada tienda vs total
    2. Calcular urgencia de cada tienda (1 / días_stock)
    3. Normalizar urgencias a porcentajes
    4. Combinar: peso_final = (pct_demanda × peso_demanda) + (pct_urgencia × peso_urgencia)
    5. Distribuir: cantidad = stock_disponible × peso_final

    Args:
        stock_cedi: Stock disponible en CEDI (unidades)
        unidades_por_bulto: Unidades por bulto del producto
        datos_tiendas: Lista de datos por tienda
        config: Configuración de pesos DPD+U

    Returns:
        Lista de asignaciones por tienda
    """
    if not datos_tiendas:
        return []

    if stock_cedi <= 0:
        # No hay stock, todas las tiendas reciben 0
        return [
            AsignacionTienda(
                tienda_id=t.tienda_id,
                tienda_nombre=t.tienda_nombre,
                demanda_p75=t.demanda_p75,
                stock_actual=t.stock_actual,
                dias_stock=t.dias_stock,
                cantidad_necesaria=t.cantidad_necesaria,
                urgencia=calcular_urgencia(t.dias_stock, config.dias_minimo_urgencia),
                pct_demanda=0,
                pct_urgencia=0,
                peso_final=0,
                cantidad_asignada_unid=0,
                cantidad_asignada_bultos=0,
                deficit_vs_necesidad=-t.cantidad_necesaria,
                cobertura_dias_resultante=t.dias_stock
            )
            for t in datos_tiendas
        ]

    # === PASO 1: Calcular totales para normalización ===
    total_demanda = sum(t.demanda_p75 for t in datos_tiendas)

    # Calcular urgencias
    urgencias = []
    for t in datos_tiendas:
        urgencia = calcular_urgencia(t.dias_stock, config.dias_minimo_urgencia)
        urgencias.append(urgencia)

    total_urgencia = sum(urgencias)

    # === PASO 2: Calcular pesos normalizados ===
    pesos_finales = []
    for i, tienda in enumerate(datos_tiendas):
        # Porcentaje de demanda
        pct_demanda = tienda.demanda_p75 / total_demanda if total_demanda > 0 else 1 / len(datos_tiendas)

        # Porcentaje de urgencia
        pct_urgencia = urgencias[i] / total_urgencia if total_urgencia > 0 else 1 / len(datos_tiendas)

        # Peso final combinado
        peso_final = (pct_demanda * config.peso_demanda) + (pct_urgencia * config.peso_urgencia)

        pesos_finales.append({
            'pct_demanda': pct_demanda,
            'pct_urgencia': pct_urgencia,
            'peso_final': peso_final,
            'urgencia': urgencias[i]
        })

    # Normalizar pesos finales para que sumen 1
    total_peso = sum(p['peso_final'] for p in pesos_finales)
    if total_peso > 0:
        for p in pesos_finales:
            p['peso_final'] = p['peso_final'] / total_peso

    # === PASO 3: Distribuir stock ===
    resultados = []
    stock_asignado_total = 0

    for i, tienda in enumerate(datos_tiendas):
        pesos = pesos_finales[i]

        # Calcular cantidad en unidades
        cantidad_unid = stock_cedi * pesos['peso_final']

        # Convertir a bultos (redondear hacia abajo para no exceder stock)
        cantidad_bultos = math.floor(cantidad_unid / unidades_por_bulto) if unidades_por_bulto > 0 else 0

        # Recalcular unidades exactas basadas en bultos
        cantidad_unid_final = cantidad_bultos * unidades_por_bulto
        stock_asignado_total += cantidad_unid_final

        # Calcular cobertura resultante
        stock_despues = tienda.stock_actual + cantidad_unid_final
        cobertura_dias = stock_despues / tienda.demanda_p75 if tienda.demanda_p75 > 0 else 999

        resultados.append(AsignacionTienda(
            tienda_id=tienda.tienda_id,
            tienda_nombre=tienda.tienda_nombre,
            demanda_p75=tienda.demanda_p75,
            stock_actual=tienda.stock_actual,
            dias_stock=tienda.dias_stock,
            cantidad_necesaria=tienda.cantidad_necesaria,
            urgencia=pesos['urgencia'],
            pct_demanda=round(pesos['pct_demanda'] * 100, 2),
            pct_urgencia=round(pesos['pct_urgencia'] * 100, 2),
            peso_final=round(pesos['peso_final'] * 100, 2),
            cantidad_asignada_unid=cantidad_unid_final,
            cantidad_asignada_bultos=cantidad_bultos,
            deficit_vs_necesidad=cantidad_unid_final - tienda.cantidad_necesaria,
            cobertura_dias_resultante=round(cobertura_dias, 1)
        ))

    # === PASO 4: Distribuir bultos sobrantes (si hay) ===
    # Por el redondeo hacia abajo, pueden quedar bultos sin asignar
    bultos_sobrantes = math.floor((stock_cedi - stock_asignado_total) / unidades_por_bulto) if unidades_por_bulto > 0 else 0

    if bultos_sobrantes > 0:
        # Dar bultos sobrantes a tiendas con mayor urgencia
        resultados_ordenados = sorted(
            enumerate(resultados),
            key=lambda x: (-x[1].urgencia, -x[1].pct_demanda)  # Mayor urgencia primero
        )

        for idx, _ in resultados_ordenados:
            if bultos_sobrantes <= 0:
                break
            resultados[idx].cantidad_asignada_bultos += 1
            resultados[idx].cantidad_asignada_unid += unidades_por_bulto
            resultados[idx].deficit_vs_necesidad += unidades_por_bulto

            # Recalcular cobertura
            stock_despues = resultados[idx].stock_actual + resultados[idx].cantidad_asignada_unid
            resultados[idx].cobertura_dias_resultante = round(
                stock_despues / resultados[idx].demanda_p75 if resultados[idx].demanda_p75 > 0 else 999,
                1
            )
            bultos_sobrantes -= 1

    return resultados


def detectar_conflicto(
    stock_cedi: float,
    datos_tiendas: List[DatosTiendaProducto]
) -> bool:
    """
    Detecta si hay conflicto de stock (escasez).

    Conflicto = stock_cedi < suma de necesidades de todas las tiendas

    Args:
        stock_cedi: Stock disponible en CEDI
        datos_tiendas: Datos de demanda por tienda

    Returns:
        True si hay conflicto, False si hay suficiente stock
    """
    necesidad_total = sum(t.cantidad_necesaria for t in datos_tiendas)
    return stock_cedi < necesidad_total


def crear_resultado_distribucion(
    codigo_producto: str,
    descripcion_producto: str,
    stock_cedi: float,
    unidades_por_bulto: int,
    datos_tiendas: List[DatosTiendaProducto],
    config: ConfigDPDU
) -> ResultadoDistribucion:
    """
    Crea el resultado completo de distribución para un producto.

    Args:
        codigo_producto: Código del producto
        descripcion_producto: Descripción del producto
        stock_cedi: Stock disponible en CEDI
        unidades_por_bulto: Unidades por bulto
        datos_tiendas: Datos por tienda
        config: Configuración DPD+U

    Returns:
        ResultadoDistribucion con toda la información
    """
    es_conflicto = detectar_conflicto(stock_cedi, datos_tiendas)

    asignaciones = calcular_distribucion_dpdu(
        stock_cedi=stock_cedi,
        unidades_por_bulto=unidades_por_bulto,
        datos_tiendas=datos_tiendas,
        config=config
    )

    return ResultadoDistribucion(
        codigo_producto=codigo_producto,
        descripcion_producto=descripcion_producto,
        stock_cedi_disponible=stock_cedi,
        stock_cedi_bultos=math.floor(stock_cedi / unidades_por_bulto) if unidades_por_bulto > 0 else 0,
        unidades_por_bulto=unidades_por_bulto,
        demanda_total_tiendas=sum(t.demanda_p75 for t in datos_tiendas),
        necesidad_total_tiendas=sum(t.cantidad_necesaria for t in datos_tiendas),
        es_conflicto=es_conflicto,
        asignaciones=asignaciones,
        config_usada=config
    )


# === FUNCIONES AUXILIARES ===

def to_dict(asignacion: AsignacionTienda) -> Dict:
    """Convierte AsignacionTienda a diccionario para JSON."""
    return {
        'tienda_id': asignacion.tienda_id,
        'tienda_nombre': asignacion.tienda_nombre,
        'demanda_p75': asignacion.demanda_p75,
        'stock_actual': asignacion.stock_actual,
        'dias_stock': round(asignacion.dias_stock, 2),
        'cantidad_necesaria': asignacion.cantidad_necesaria,
        'urgencia': round(asignacion.urgencia, 2),
        'pct_demanda': asignacion.pct_demanda,
        'pct_urgencia': asignacion.pct_urgencia,
        'peso_final': asignacion.peso_final,
        'cantidad_asignada_unid': asignacion.cantidad_asignada_unid,
        'cantidad_asignada_bultos': asignacion.cantidad_asignada_bultos,
        'deficit_vs_necesidad': round(asignacion.deficit_vs_necesidad, 0),
        'cobertura_dias_resultante': asignacion.cobertura_dias_resultante
    }


def resultado_to_dict(resultado: ResultadoDistribucion) -> Dict:
    """Convierte ResultadoDistribucion a diccionario para JSON."""
    return {
        'codigo_producto': resultado.codigo_producto,
        'descripcion_producto': resultado.descripcion_producto,
        'stock_cedi_disponible': resultado.stock_cedi_disponible,
        'stock_cedi_bultos': resultado.stock_cedi_bultos,
        'unidades_por_bulto': resultado.unidades_por_bulto,
        'demanda_total_tiendas': round(resultado.demanda_total_tiendas, 2),
        'necesidad_total_tiendas': round(resultado.necesidad_total_tiendas, 0),
        'es_conflicto': resultado.es_conflicto,
        'asignaciones': [to_dict(a) for a in resultado.asignaciones],
        'config_usada': {
            'peso_demanda': resultado.config_usada.peso_demanda,
            'peso_urgencia': resultado.config_usada.peso_urgencia,
            'dias_minimo_urgencia': resultado.config_usada.dias_minimo_urgencia
        }
    }
