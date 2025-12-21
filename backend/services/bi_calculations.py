"""
Servicio de cálculos para Business Intelligence.

Contiene funciones para calcular métricas de BI como GMROI, rotación,
clasificación de productos, y oportunidades de distribución.
"""

from dataclasses import dataclass
from typing import Optional
from enum import Enum


class CuadranteProducto(str, Enum):
    """Clasificación de productos según GMROI y Rotación."""
    ESTRELLA = "ESTRELLA"  # Alto GMROI + Alta Rotación -> Priorizar
    VACA = "VACA"          # Bajo GMROI + Alta Rotación -> Mantener volumen
    NICHO = "NICHO"        # Alto GMROI + Baja Rotación -> Evaluar
    PERRO = "PERRO"        # Bajo GMROI + Baja Rotación -> Eliminar


class CategoriaProducto(str, Enum):
    """Categorías de producto por tipo de almacenamiento."""
    SECO = "cedi_seco"
    FRIO = "cedi_frio"
    VERDE = "cedi_verde"


@dataclass
class UmbralesCategoria:
    """Umbrales de GMROI y Rotación por categoría."""
    gmroi_alto: float
    gmroi_bajo: float
    rotacion_alta: float
    rotacion_baja: float


# Umbrales basados en benchmarks de la industria grocery
UMBRALES_POR_CATEGORIA = {
    CategoriaProducto.SECO: UmbralesCategoria(
        gmroi_alto=2.5,
        gmroi_bajo=1.5,
        rotacion_alta=8.0,
        rotacion_baja=4.0
    ),
    CategoriaProducto.FRIO: UmbralesCategoria(
        gmroi_alto=2.0,
        gmroi_bajo=1.2,
        rotacion_alta=15.0,
        rotacion_baja=8.0
    ),
    CategoriaProducto.VERDE: UmbralesCategoria(
        gmroi_alto=1.8,
        gmroi_bajo=1.0,
        rotacion_alta=25.0,
        rotacion_baja=12.0
    ),
}

# Umbral para considerar stock bajo (casi sin stock)
UMBRAL_STOCK_BAJO = 20

# Mapeo de regiones a CEDIs
REGION_CEDI_MAP = {
    "CARACAS": ["cedi_caracas"],
    "VALENCIA": ["cedi_seco", "cedi_frio", "cedi_verde"],
}

# Mapeo de regiones a tiendas
REGION_TIENDAS_MAP = {
    "CARACAS": ["tienda_17", "tienda_18"],
    "VALENCIA": [f"tienda_{str(i).zfill(2)}" for i in range(1, 17)] + ["tienda_19", "tienda_20"],
}


def calcular_gmroi(utilidad_bruta: float, inventario_promedio: float) -> float:
    """
    Calcula el GMROI (Gross Margin Return on Investment).

    GMROI = Utilidad Bruta / Inventario Promedio

    Args:
        utilidad_bruta: Utilidad bruta en USD del período
        inventario_promedio: Valor promedio del inventario en USD

    Returns:
        GMROI redondeado a 2 decimales. Retorna 0 si inventario <= 0.
    """
    if inventario_promedio <= 0:
        return 0.0
    return round(utilidad_bruta / inventario_promedio, 2)


def calcular_rotacion_anual(costo_ventas: float, inventario_promedio: float, dias: int = 30) -> float:
    """
    Calcula la rotación de inventario anualizada.

    Rotación = (Costo Ventas / Inventario Promedio) × (365 / días)

    Args:
        costo_ventas: Costo total de ventas del período en USD
        inventario_promedio: Valor promedio del inventario en USD
        dias: Número de días del período (default 30)

    Returns:
        Rotación anual redondeada a 2 decimales. Retorna 0 si inventario <= 0.
    """
    if inventario_promedio <= 0:
        return 0.0
    return round((costo_ventas / inventario_promedio) * (365 / dias), 2)


def calcular_fill_rate(skus_con_stock: int, skus_totales: int) -> float:
    """
    Calcula el fill rate (nivel de servicio).

    Fill Rate = (SKUs con stock > 0 / SKUs totales) × 100

    Args:
        skus_con_stock: Número de SKUs con stock disponible
        skus_totales: Número total de SKUs

    Returns:
        Fill rate como porcentaje. Retorna 0 si no hay SKUs.
    """
    if skus_totales <= 0:
        return 0.0
    return round((skus_con_stock / skus_totales) * 100, 2)


def calcular_reduccion_stock(stock_actual: float, stock_baseline: float) -> tuple[float, float]:
    """
    Calcula la reducción de stock vs baseline.

    Args:
        stock_actual: Stock valorizado actual en USD
        stock_baseline: Stock valorizado inicial (baseline) en USD

    Returns:
        Tupla (capital_liberado, reduccion_pct)
    """
    if stock_baseline <= 0:
        return (0.0, 0.0)

    capital_liberado = stock_baseline - stock_actual
    reduccion_pct = round((capital_liberado / stock_baseline) * 100, 2)

    return (round(capital_liberado, 2), reduccion_pct)


def obtener_umbrales(categoria: Optional[str]) -> UmbralesCategoria:
    """
    Obtiene los umbrales de GMROI y Rotación para una categoría.

    Args:
        categoria: ID de categoría (cedi_seco, cedi_frio, cedi_verde)

    Returns:
        UmbralesCategoria con los umbrales correspondientes.
        Si la categoría no existe, retorna umbrales de SECO por defecto.
    """
    try:
        cat = CategoriaProducto(categoria)
        return UMBRALES_POR_CATEGORIA.get(cat, UMBRALES_POR_CATEGORIA[CategoriaProducto.SECO])
    except (ValueError, KeyError):
        return UMBRALES_POR_CATEGORIA[CategoriaProducto.SECO]


def clasificar_producto_matriz(
    gmroi: float,
    rotacion: float,
    categoria: Optional[str] = None
) -> CuadranteProducto:
    """
    Clasifica un producto en la matriz GMROI/Rotación.

    Matriz:
    |              | Alta Rotación | Baja Rotación |
    |--------------|---------------|---------------|
    | Alto GMROI   | ESTRELLA      | NICHO         |
    | Bajo GMROI   | VACA          | PERRO         |

    Args:
        gmroi: GMROI del producto
        rotacion: Rotación anual del producto
        categoria: Categoría para determinar umbrales específicos

    Returns:
        CuadranteProducto indicando la clasificación
    """
    umbrales = obtener_umbrales(categoria)

    # Usar punto medio entre alto y bajo como umbral
    umbral_gmroi = (umbrales.gmroi_alto + umbrales.gmroi_bajo) / 2
    umbral_rotacion = (umbrales.rotacion_alta + umbrales.rotacion_baja) / 2

    alto_gmroi = gmroi >= umbral_gmroi
    alta_rotacion = rotacion >= umbral_rotacion

    if alto_gmroi and alta_rotacion:
        return CuadranteProducto.ESTRELLA
    elif alto_gmroi and not alta_rotacion:
        return CuadranteProducto.NICHO
    elif not alto_gmroi and alta_rotacion:
        return CuadranteProducto.VACA
    else:
        return CuadranteProducto.PERRO


def calcular_oportunidad_distribucion(
    venta_mensual_origen: float,
    margen_promedio: float,
    factor_conservador: float = 0.5
) -> float:
    """
    Estima la oportunidad de venta si se distribuye un producto a una tienda.

    Usa un factor conservador (50% por defecto) para no sobreestimar.

    Args:
        venta_mensual_origen: Venta mensual en tienda origen en USD
        margen_promedio: Margen bruto promedio (0-100)
        factor_conservador: Factor de ajuste (default 0.5 = 50%)

    Returns:
        Oportunidad estimada en USD
    """
    # Convertir margen a decimal si viene como porcentaje
    if margen_promedio > 1:
        margen_promedio = margen_promedio / 100

    return round(venta_mensual_origen * factor_conservador * margen_promedio, 2)


def calcular_dias_cobertura(stock_actual: float, venta_diaria_promedio: float) -> int:
    """
    Calcula los días de cobertura con el stock actual.

    Args:
        stock_actual: Unidades en stock
        venta_diaria_promedio: Venta promedio diaria en unidades

    Returns:
        Días de cobertura (máximo 999 si no hay ventas)
    """
    if venta_diaria_promedio <= 0:
        return 999

    return min(999, int(stock_actual / venta_diaria_promedio))


def es_stock_bajo(cantidad: float, umbral: float = UMBRAL_STOCK_BAJO) -> bool:
    """
    Determina si un nivel de stock se considera "bajo" (casi sin stock).

    Args:
        cantidad: Cantidad en stock
        umbral: Umbral para considerar stock bajo (default 20)

    Returns:
        True si el stock es menor o igual al umbral
    """
    return cantidad <= umbral


def obtener_cedis_region(region: str) -> list[str]:
    """
    Obtiene los CEDIs que abastecen una región.

    Args:
        region: "CARACAS" o "VALENCIA"

    Returns:
        Lista de IDs de CEDIs
    """
    return REGION_CEDI_MAP.get(region.upper(), [])


def obtener_tiendas_region(region: str) -> list[str]:
    """
    Obtiene las tiendas de una región.

    Args:
        region: "CARACAS" o "VALENCIA"

    Returns:
        Lista de IDs de tiendas
    """
    return REGION_TIENDAS_MAP.get(region.upper(), [])


def calcular_cobertura_pct(tiendas_con_stock: int, total_tiendas: int) -> float:
    """
    Calcula el porcentaje de cobertura de un producto.

    Args:
        tiendas_con_stock: Número de tiendas con stock > umbral
        total_tiendas: Total de tiendas en la región

    Returns:
        Porcentaje de cobertura (0-100)
    """
    if total_tiendas <= 0:
        return 0.0
    return round((tiendas_con_stock / total_tiendas) * 100, 1)
