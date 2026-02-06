"""
Modelos Pydantic para Pedidos Multi-Tienda con algoritmo DPD+U

Este módulo define las estructuras de datos para:
- Solicitudes de cálculo multi-tienda
- Respuestas con conflictos y distribuciones
- Guardado de múltiples pedidos en lote
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# =====================================================================================
# MODELOS DE REQUEST
# =====================================================================================

class TiendaSeleccionadaRequest(BaseModel):
    """Tienda seleccionada para pedido multi-tienda."""
    tienda_id: str = Field(..., description="ID de la tienda (ej: tienda_17)")
    tienda_nombre: str = Field(..., description="Nombre de la tienda (ej: ARTIGAS)")


class CalcularMultiTiendaRequest(BaseModel):
    """Request para calcular pedidos de múltiples tiendas."""
    cedi_origen: str = Field(..., description="ID del CEDI origen (ej: cedi_caracas)")
    tiendas_destino: List[TiendaSeleccionadaRequest] = Field(
        ...,
        min_items=1,
        description="Lista de tiendas destino (mínimo 1)"
    )
    dias_cobertura: int = Field(
        default=3,
        ge=1,
        le=30,
        description="Días de cobertura para el cálculo"
    )
    incluir_solo_conflictos: bool = Field(
        default=False,
        description="Si es True, solo retorna productos con conflicto"
    )
    incluir_cedi_caracas: bool = Field(
        default=False,
        description="Si es True, incluye CEDI Caracas como destino para distribución DPD+U"
    )


# =====================================================================================
# MODELOS DE RESPONSE - DISTRIBUCIÓN DPD+U
# =====================================================================================

class TransitoDesgloseResponse(BaseModel):
    """Desglose de un pedido pendiente que contribuye al tránsito."""
    numero_pedido: str
    fecha_pedido: str
    estado: str
    pedido_bultos: float
    llegadas_bultos: float
    pendiente_bultos: float


class AsignacionTiendaResponse(BaseModel):
    """Asignación de un producto a una tienda según DPD+U."""
    tienda_id: str
    tienda_nombre: str
    abc: str = Field(default='D', description="Clasificación ABC de este producto en esta tienda")

    # Datos de entrada
    demanda_p75: float = Field(..., description="Ventas diarias P75 (unidades)")
    stock_actual: float = Field(..., description="Stock actual en tienda")
    dias_stock: float = Field(..., description="Días de cobertura actual")
    cantidad_necesaria: float = Field(..., description="Cantidad necesaria según ABC")

    # Tránsito (productos en pedidos previos que no han llegado)
    transito_bultos: float = Field(default=0, description="Bultos en tránsito desde pedidos anteriores")
    transito_desglose: Optional[List[TransitoDesgloseResponse]] = Field(
        default=None,
        description="Desglose de pedidos que contribuyen al tránsito"
    )

    # Cálculos DPD+U
    urgencia: float = Field(..., description="Factor de urgencia (1/días_stock)")
    pct_demanda: float = Field(..., description="% de demanda vs total tiendas")
    pct_urgencia: float = Field(..., description="% de urgencia vs total tiendas")
    peso_final: float = Field(..., description="Peso final combinado (%)")

    # Resultado
    cantidad_asignada_unid: float = Field(..., description="Unidades asignadas")
    cantidad_asignada_bultos: int = Field(..., description="Bultos asignados")

    # Indicadores
    deficit_vs_necesidad: float = Field(..., description="Déficit vs lo necesario (negativo = falta)")
    cobertura_dias_resultante: float = Field(..., description="Días de cobertura después de recibir")


class ConflictoProductoResponse(BaseModel):
    """Producto con conflicto de stock (escasez)."""
    codigo_producto: str
    descripcion_producto: str
    categoria: Optional[str] = None
    clasificacion_abc: Optional[str] = None
    unidades_por_bulto: int

    # Stock CEDI
    stock_cedi_disponible: float
    stock_cedi_bultos: int

    # Demanda combinada
    demanda_total_tiendas: float = Field(..., description="Suma de demanda P75 de todas las tiendas")
    necesidad_total_tiendas: float = Field(..., description="Suma de cantidades necesarias")

    # Es conflicto?
    es_conflicto: bool = Field(..., description="True si stock_cedi < necesidad_total")

    # Distribución DPD+U
    distribucion_dpdu: List[AsignacionTiendaResponse] = Field(
        ...,
        description="Distribución sugerida por el algoritmo DPD+U"
    )

    # Para ajustes manuales (opcional)
    distribucion_manual: Optional[List[AsignacionTiendaResponse]] = Field(
        default=None,
        description="Distribución manual ajustada por el usuario"
    )
    resolucion_usuario: Optional[str] = Field(
        default="dpdu",
        description="Tipo de resolución: 'dpdu' o 'manual'"
    )


class ConfigDPDUResponse(BaseModel):
    """Configuración del algoritmo DPD+U usada."""
    peso_demanda: float = Field(..., description="Peso del factor demanda (0-1)")
    peso_urgencia: float = Field(..., description="Peso del factor urgencia (0-1)")
    dias_minimo_urgencia: float = Field(..., description="Umbral de días para urgencia máxima")


class ProductoPedidoSimplificado(BaseModel):
    """Producto simplificado para el pedido por tienda."""
    codigo_producto: str
    descripcion_producto: str
    categoria: Optional[str] = None
    clasificacion_abc: Optional[str] = None
    cuadrante: Optional[str] = None

    # Cantidades
    unidades_por_bulto: int
    cantidad_sugerida_unid: float
    cantidad_sugerida_bultos: int

    # Stock
    stock_tienda: float
    stock_cedi_origen: float

    # Tránsito (productos en pedidos previos que no han llegado)
    transito_bultos: float = Field(default=0, description="Bultos en tránsito desde pedidos anteriores")
    transito_desglose: Optional[List[TransitoDesgloseResponse]] = Field(
        default=None,
        description="Desglose de pedidos que contribuyen al tránsito"
    )

    # Métricas
    prom_p75_unid: float
    dias_stock: float

    # Ajustado por conflicto?
    ajustado_por_dpdu: bool = Field(
        default=False,
        description="True si fue ajustado por algoritmo DPD+U"
    )
    cantidad_original_bultos: Optional[int] = Field(
        default=None,
        description="Cantidad original antes del ajuste DPD+U"
    )

    # Sugerido por el algoritmo?
    es_sugerido: bool = Field(
        default=True,
        description="True si el algoritmo sugiere pedir este producto (stock < ROP)"
    )


class PedidoTiendaResponse(BaseModel):
    """Pedido calculado para una tienda."""
    tienda_id: str
    tienda_nombre: str

    # Productos
    productos: List[ProductoPedidoSimplificado]

    # Totales
    total_productos: int
    total_bultos: int
    total_unidades: float

    # Productos ajustados por DPD+U
    productos_ajustados_dpdu: int = Field(
        default=0,
        description="Cantidad de productos ajustados por conflicto"
    )


class CalcularMultiTiendaResponse(BaseModel):
    """Response del cálculo multi-tienda."""
    # Metadata
    cedi_origen: str
    cedi_origen_nombre: str
    fecha_calculo: datetime
    dias_cobertura: int

    # Configuración usada
    config_dpdu: ConfigDPDUResponse

    # Conflictos detectados
    conflictos: List[ConflictoProductoResponse] = Field(
        ...,
        description="Productos con stock insuficiente que requieren distribución"
    )
    total_conflictos: int

    # Productos sin conflicto
    productos_sin_conflicto: int

    # Pedidos por tienda
    pedidos_por_tienda: List[PedidoTiendaResponse]

    # Resumen global
    resumen: Dict[str, Any] = Field(
        default_factory=dict,
        description="Resumen consolidado de todos los pedidos"
    )


# =====================================================================================
# MODELOS PARA GUARDAR PEDIDOS EN LOTE
# =====================================================================================

class ProductoPedidoAjustado(BaseModel):
    """Producto con cantidad final ajustada (para guardar)."""
    codigo_producto: str
    descripcion_producto: str
    categoria: Optional[str] = None
    clasificacion_abc: Optional[str] = None
    cuadrante: Optional[str] = None

    # Cantidades - usando float para mayor compatibilidad con JSON
    unidades_por_bulto: float = 1
    cantidad_pedida_bultos: int = Field(0, description="Cantidad final a pedir (bultos)")
    cantidad_pedida_unidades: float = Field(0, description="Cantidad final a pedir (unidades)")

    # Stock al momento del pedido
    stock_tienda: float = 0
    stock_cedi_origen: float = 0

    # Métricas
    prom_p75_unid: float = 0
    prom_ventas_5dias_unid: Optional[float] = None
    prom_ventas_20dias_unid: Optional[float] = None

    # Parámetros ABC
    stock_minimo: Optional[float] = None
    stock_maximo: Optional[float] = None
    punto_reorden: Optional[float] = None

    # DPD+U
    ajustado_por_dpdu: bool = False
    cantidad_original_bultos: Optional[int] = None
    razon_ajuste_dpdu: Optional[str] = None

    # Control
    incluido: bool = True


class PedidoTiendaParaGuardar(BaseModel):
    """Un pedido individual para una tienda (para guardar en lote)."""
    tienda_destino_id: str
    tienda_destino_nombre: str
    productos: List[ProductoPedidoAjustado]
    observaciones: Optional[str] = None

    # Opcional: devoluciones
    devoluciones: List[Dict[str, Any]] = Field(default_factory=list)


class GuardarMultiTiendaRequest(BaseModel):
    """Request para guardar múltiples pedidos en una transacción."""
    cedi_origen_id: str
    cedi_origen_nombre: str

    # Lista de pedidos por tienda
    pedidos: List[PedidoTiendaParaGuardar] = Field(
        ...,
        min_items=1,
        description="Lista de pedidos, uno por cada tienda"
    )

    # Metadata
    dias_cobertura: int = 3
    fecha_pedido: Optional[str] = None
    fecha_entrega_solicitada: Optional[str] = None
    tipo_pedido: str = "reposicion"
    prioridad: str = "normal"
    requiere_aprobacion: bool = False

    # Observaciones globales
    observaciones_globales: Optional[str] = None

    # Usuario
    usuario_creador: Optional[str] = None


class PedidoGuardadoInfo(BaseModel):
    """Información de un pedido guardado."""
    pedido_id: str
    numero_pedido: str
    tienda_id: str
    tienda_nombre: str
    total_productos: int
    total_bultos: int
    estado: str


class GuardarMultiTiendaResponse(BaseModel):
    """Response del guardado de múltiples pedidos."""
    success: bool
    grupo_pedido_id: str = Field(..., description="ID del grupo de pedidos")
    pedidos_creados: List[PedidoGuardadoInfo]
    total_pedidos: int
    mensaje: str
