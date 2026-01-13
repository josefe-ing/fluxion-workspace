"""
Schemas Pydantic para endpoints de Ubicaciones
"""

from pydantic import BaseModel
from typing import List, Optional


class UbicacionResponse(BaseModel):
    id: str
    codigo: str
    nombre: str
    tipo: str
    region: Optional[str]
    ciudad: Optional[str]
    superficie_m2: Optional[float]
    activo: bool
    visible_pedidos: bool = False  # Mostrar en módulo de Pedidos Sugeridos
    sistema_pos: str = "stellar"  # Sistema POS: "stellar" o "klk"


class UbicacionSummaryResponse(BaseModel):
    ubicacion_id: str
    ubicacion_nombre: str
    tipo_ubicacion: str
    total_productos: int
    stock_cero: int
    stock_negativo: int
    ultima_actualizacion: Optional[str]
    # Campos para almacenes KLK (solo aplica a tiendas KLK)
    almacen_codigo: Optional[str] = None
    almacen_nombre: Optional[str] = None


class UbicacionRegionalDetail(BaseModel):
    """Detalle de una ubicación dentro del resumen regional"""
    ubicacion_id: str
    ubicacion_nombre: str
    tipo: str  # 'tienda' o 'cedi'
    almacen_codigo: Optional[str] = None
    almacen_nombre: Optional[str] = None
    total_skus: int
    skus_con_stock: int
    stock_cero: int
    stock_negativo: int
    fill_rate: float  # % SKUs con stock (excluyendo fantasmas)
    dias_cobertura_a: Optional[float] = None
    dias_cobertura_b: Optional[float] = None
    dias_cobertura_c: Optional[float] = None
    riesgo_quiebre: int  # SKUs con < 1 día cobertura
    ultima_actualizacion: Optional[str] = None


class RegionSummary(BaseModel):
    """Resumen agregado de una región"""
    region: str
    total_ubicaciones: int
    total_skus_unicos: int
    fill_rate_promedio: float
    dias_cobertura_a: Optional[float] = None
    dias_cobertura_b: Optional[float] = None
    dias_cobertura_c: Optional[float] = None
    total_stock_cero: int
    total_stock_negativo: int
    total_riesgo_quiebre: int
    ubicaciones: List[UbicacionRegionalDetail]


class AlmacenKLKResponse(BaseModel):
    """Representa un almacén KLK"""
    codigo: str
    nombre: str
    tipo: str  # "piso_venta" | "principal" | "procura" | etc.
    incluir_en_deficit: bool
    activo: bool


class AlmacenesUbicacionResponse(BaseModel):
    """Lista de almacenes para una ubicación KLK"""
    ubicacion_id: str
    ubicacion_nombre: str
    sistema_pos: str
    almacenes: List[AlmacenKLKResponse]
