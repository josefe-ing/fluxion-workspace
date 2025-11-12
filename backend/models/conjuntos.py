"""
Modelos Pydantic para Conjuntos Sustituibles (Pronóstico Jerárquico)
Sistema de productos intercambiables para optimización de inventario
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, validator


# =====================================================================================
# MODELOS BASE
# =====================================================================================

class ConjuntoBase(BaseModel):
    """Modelo base para un conjunto sustituible"""
    nombre: str = Field(..., min_length=1, max_length=200, description="Nombre del conjunto (ej: 'Azúcar Blanca 1kg')")
    descripcion: Optional[str] = Field(None, description="Descripción detallada del conjunto")
    categoria: Optional[str] = Field(None, max_length=100, description="Categoría del conjunto")
    activo: bool = Field(True, description="Si el conjunto está activo")


class ConjuntoCreate(ConjuntoBase):
    """Modelo para crear un nuevo conjunto"""
    pass


class ConjuntoUpdate(BaseModel):
    """Modelo para actualizar un conjunto existente"""
    nombre: Optional[str] = Field(None, min_length=1, max_length=200)
    descripcion: Optional[str] = None
    categoria: Optional[str] = Field(None, max_length=100)
    activo: Optional[bool] = None


class Conjunto(ConjuntoBase):
    """Modelo completo de un conjunto"""
    id: str = Field(..., description="ID único del conjunto")
    fecha_creacion: datetime = Field(..., description="Fecha de creación")
    fecha_actualizacion: datetime = Field(..., description="Última actualización")

    # Estadísticas calculadas (opcionales, se agregan en endpoints específicos)
    total_productos: Optional[int] = Field(None, description="Total de productos en el conjunto")
    productos_activos: Optional[int] = Field(None, description="Productos activos en el conjunto")
    demanda_diaria_total: Optional[Decimal] = Field(None, description="Demanda diaria total del conjunto")

    class Config:
        from_attributes = True


# =====================================================================================
# MODELOS DE PRODUCTOS EN CONJUNTO
# =====================================================================================

class ConjuntoProductoBase(BaseModel):
    """Modelo base para producto en conjunto"""
    codigo_producto: str = Field(..., min_length=1, max_length=50, description="Código del producto")
    share_manual: Optional[Decimal] = Field(
        None,
        ge=0,
        le=100,
        description="Share manual (% de participación). Si es None, se calcula automáticamente"
    )
    activo: bool = Field(True, description="Si este producto está activo en el conjunto")


class ConjuntoProductoCreate(ConjuntoProductoBase):
    """Modelo para agregar un producto a un conjunto"""
    pass


class ConjuntoProductoUpdate(BaseModel):
    """Modelo para actualizar producto en conjunto"""
    share_manual: Optional[Decimal] = Field(None, ge=0, le=100)
    activo: Optional[bool] = None


class ConjuntoProducto(ConjuntoProductoBase):
    """Modelo completo de producto en conjunto"""
    id: str = Field(..., description="ID único de la relación")
    conjunto_id: str = Field(..., description="ID del conjunto")
    fecha_agregado: datetime = Field(..., description="Fecha en que se agregó al conjunto")

    # Información del producto (agregada por el endpoint)
    descripcion: Optional[str] = Field(None, description="Descripción del producto")
    categoria: Optional[str] = Field(None, description="Categoría del producto")
    marca: Optional[str] = Field(None, description="Marca del producto")

    # Shares y estadísticas (calculadas)
    share_porcentaje: Optional[Decimal] = Field(None, description="Share calculado (manual o automático)")
    demanda_diaria: Optional[Decimal] = Field(None, description="Demanda diaria promedio")
    stock_actual: Optional[Decimal] = Field(None, description="Stock actual total")
    dias_inventario: Optional[Decimal] = Field(None, description="Días de inventario disponible")

    class Config:
        from_attributes = True


# =====================================================================================
# MODELOS DE RESPUESTA (PARA ENDPOINTS)
# =====================================================================================

class ConjuntoListResponse(BaseModel):
    """Respuesta para lista de conjuntos"""
    conjuntos: List[Conjunto]
    total: int = Field(..., description="Total de conjuntos")


class ConjuntoDetalleResponse(BaseModel):
    """Respuesta detallada de un conjunto con sus productos"""
    conjunto: Conjunto
    productos: List[ConjuntoProducto]
    demanda_total_diaria: Decimal = Field(..., description="Demanda total del conjunto por día")


# =====================================================================================
# MODELOS PARA PRONÓSTICO JERÁRQUICO
# =====================================================================================

class ProductoDistribucion(BaseModel):
    """Distribución de un producto dentro del conjunto"""
    codigo_producto: str
    descripcion: str
    marca: Optional[str] = None
    share_original: Decimal = Field(..., description="Share original del producto (%)")
    share_ajustado: Decimal = Field(..., description="Share ajustado después de redistribución (%)")
    demanda_original: Decimal = Field(..., description="Demanda calculada con share original")
    demanda_ajustada: Decimal = Field(..., description="Demanda calculada con share ajustado")
    stock_actual: Decimal = Field(..., description="Stock actual del producto")
    stock_cd: Optional[Decimal] = Field(None, description="Stock en Centro de Distribución")
    deficit: Decimal = Field(..., description="Déficit si demanda > stock")
    motivo_ajuste: Optional[str] = Field(None, description="Razón del ajuste si aplica")


class Alerta(BaseModel):
    """Alerta generada en el pronóstico"""
    tipo: str = Field(..., description="Tipo de alerta: 'redistribucion', 'stockout', 'warning'")
    mensaje: str = Field(..., description="Mensaje descriptivo")
    severidad: str = Field(..., description="Severidad: 'info', 'warning', 'error', 'critical'")
    productos_afectados: Optional[List[str]] = Field(None, description="Códigos de productos afectados")


class PronosticoJerarquicoResponse(BaseModel):
    """Respuesta completa del pronóstico jerárquico con redistribución"""
    conjunto_id: str
    nombre: str
    ubicacion_id: Optional[str] = Field(None, description="Ubicación específica si aplica")
    dias_pronostico: int = Field(..., description="Días a pronosticar")
    demanda_total_conjunto: Decimal = Field(..., description="Demanda total del conjunto para el período")

    # Distribuciones
    distribucion_normal: List[ProductoDistribucion] = Field(
        ...,
        description="Distribución normal sin considerar disponibilidad"
    )
    distribucion_con_redistribucion: List[ProductoDistribucion] = Field(
        ...,
        description="Distribución ajustada considerando stockouts"
    )

    # Alertas
    alertas: List[Alerta] = Field(default_factory=list, description="Alertas generadas")

    # Métricas
    productos_sin_stock_cd: int = Field(0, description="Cantidad de productos sin stock en CD")
    porcentaje_redistribuido: Decimal = Field(0, description="% de demanda que fue redistribuida")


# =====================================================================================
# MODELOS PARA SHARES
# =====================================================================================

class ShareProducto(BaseModel):
    """Share de un producto en su conjunto"""
    codigo_producto: str
    descripcion: str
    marca: Optional[str] = None
    share_porcentaje: Decimal = Field(..., description="Participación en el conjunto (%)")
    unidades_vendidas_12s: Decimal = Field(..., description="Unidades vendidas últimas 12 semanas")
    promedio_diario: Decimal = Field(..., description="Promedio de ventas diarias")
    dias_con_ventas: int = Field(..., description="Días con ventas en el período")
    es_share_manual: bool = Field(False, description="Si el share fue definido manualmente")


class SharesConjuntoResponse(BaseModel):
    """Respuesta con shares de todos los productos de un conjunto"""
    conjunto_id: str
    nombre: str
    shares: List[ShareProducto]
    total_share: Decimal = Field(..., description="Suma de todos los shares (debe ser ~100%)")


# =====================================================================================
# VALIDATORS
# =====================================================================================

# Validator para asegurar que shares sumen 100% si son manuales
def validate_shares_sum_100(shares: List[Decimal]) -> bool:
    """Valida que shares manuales sumen aproximadamente 100%"""
    total = sum(shares)
    return 99.0 <= total <= 101.0  # Tolerancia de 1%


# =====================================================================================
# MODELOS DE SIMULACIÓN
# =====================================================================================

class SimulacionStockout(BaseModel):
    """Simulación de qué pasa si falta un producto"""
    conjunto_id: str
    productos_sin_stock: List[str] = Field(..., description="Códigos de productos a simular como sin stock")
    dias_pronostico: int = Field(7, description="Días a simular")


class SimulacionStockoutResponse(BaseModel):
    """Respuesta de simulación de stockout"""
    conjunto_id: str
    nombre: str
    demanda_total: Decimal
    redistribucion: List[ProductoDistribucion]
    productos_sin_stock: List[str]
    impacto_resumen: str = Field(..., description="Resumen del impacto de la redistribución")
