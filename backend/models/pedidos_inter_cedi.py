"""
Modelos Pydantic para Pedidos Inter-CEDI
Sistema de reposición CEDI Caracas desde CEDIs Valencia (Seco, Frio, Verde)
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List, Dict
from pydantic import BaseModel, Field


# =====================================================================================
# ENUMS Y CONSTANTES
# =====================================================================================

class EstadoPedidoInterCedi:
    """Estados del pedido Inter-CEDI (flujo simplificado)"""
    BORRADOR = "borrador"
    CONFIRMADO = "confirmado"
    DESPACHADO = "despachado"
    RECIBIDO = "recibido"
    CANCELADO = "cancelado"

    @classmethod
    def all(cls):
        return [cls.BORRADOR, cls.CONFIRMADO, cls.DESPACHADO, cls.RECIBIDO, cls.CANCELADO]

    @classmethod
    def editables(cls):
        """Estados donde el pedido es editable"""
        return [cls.BORRADOR]

    @classmethod
    def transiciones_validas(cls):
        """Transiciones de estado permitidas"""
        return {
            cls.BORRADOR: [cls.CONFIRMADO, cls.CANCELADO],
            cls.CONFIRMADO: [cls.DESPACHADO],
            cls.DESPACHADO: [cls.RECIBIDO],
            cls.RECIBIDO: [],
            cls.CANCELADO: []
        }


class PrioridadPedido:
    BAJA = "baja"
    NORMAL = "normal"
    ALTA = "alta"
    URGENTE = "urgente"

    @classmethod
    def all(cls):
        return [cls.BAJA, cls.NORMAL, cls.ALTA, cls.URGENTE]


class CediOrigen:
    """CEDIs origen en Valencia"""
    SECO = "cedi_seco"
    FRIO = "cedi_frio"
    VERDE = "cedi_verde"

    @classmethod
    def all(cls):
        return [cls.SECO, cls.FRIO, cls.VERDE]

    @classmethod
    def nombre(cls, cedi_id: str) -> str:
        nombres = {
            cls.SECO: "CEDI Seco",
            cls.FRIO: "CEDI Frio",
            cls.VERDE: "CEDI Verde"
        }
        return nombres.get(cedi_id, cedi_id)


# =====================================================================================
# MODELOS DE CONFIGURACIÓN
# =====================================================================================

class ConfiguracionDiasCobertura(BaseModel):
    """Configuración de días de cobertura por clase ABC y perecederos"""
    # Productos normales (Seco/Frío) por clase ABC
    dias_cobertura_a: int = Field(default=12, ge=1, le=60, description="Días cobertura clase A")
    dias_cobertura_b: int = Field(default=15, ge=1, le=90, description="Días cobertura clase B")
    dias_cobertura_c: int = Field(default=18, ge=1, le=120, description="Días cobertura clase C")
    dias_cobertura_d: int = Field(default=18, ge=1, le=180, description="Días cobertura clase D")
    # Productos congelados/refrigerados (ignoran clase ABC)
    dias_cobertura_congelados: int = Field(default=7, ge=1, le=30, description="Días cobertura Congelados/Refrigerados")


class ConfiguracionRutaInterCedi(BaseModel):
    """Configuración de ruta entre CEDIs"""
    id: Optional[int] = None
    cedi_origen_id: str
    cedi_origen_nombre: Optional[str] = None
    cedi_destino_id: str
    cedi_destino_nombre: Optional[str] = None
    lead_time_dias: Decimal = Field(default=Decimal("2.0"))
    frecuencia_viajes_dias: str = "Mar,Jue,Sab"
    activo: bool = True

    class Config:
        from_attributes = True


# =====================================================================================
# MODELOS DE DETALLE (PRODUCTOS)
# =====================================================================================

class ProductoInterCediBase(BaseModel):
    """Base para producto en pedido Inter-CEDI"""
    # Identificación del producto
    codigo_producto: str
    codigo_barras: Optional[str] = None
    descripcion_producto: str

    # Clasificación
    categoria: Optional[str] = None
    grupo: Optional[str] = None
    marca: Optional[str] = None
    presentacion: Optional[str] = None
    cuadrante: Optional[str] = None
    clasificacion_abc: Optional[str] = None

    # CEDI Origen (quien surte)
    cedi_origen_id: str
    cedi_origen_nombre: Optional[str] = None

    # Cantidades físicas del producto
    unidades_por_bulto: Decimal = Field(default=Decimal("1"))
    unidad_pedido: Optional[str] = Field(default="Bulto", description="Unidad de pedido: Bulto, Blister, Cesta, etc.")
    peso_unitario_kg: Optional[Decimal] = None


class P75PorTienda(BaseModel):
    """P75 de demanda para una tienda específica"""
    tienda_id: str
    tienda_nombre: str
    p75_unidades: Decimal = Field(default=Decimal("0"))


class StockPorTienda(BaseModel):
    """Stock de un producto en una tienda específica"""
    tienda_id: str
    tienda_nombre: str
    stock_unidades: Decimal = Field(default=Decimal("0"))


class ProductoInterCediCalculado(ProductoInterCediBase):
    """Producto con cálculos del sistema (response del endpoint /calcular)"""

    # Stock en CEDI origen
    stock_cedi_origen: Decimal = Field(default=Decimal("0"))

    # Demanda regional agregada (suma de P75 de todas las tiendas de la región)
    demanda_regional_p75: Decimal = Field(default=Decimal("0"), description="P75 agregado de tiendas región")
    demanda_regional_promedio: Decimal = Field(default=Decimal("0"))
    num_tiendas_region: int = Field(default=0, description="Cuántas tiendas se consideraron")

    # Desglose de P75 por tienda
    p75_por_tienda: List[P75PorTienda] = Field(default_factory=list, description="P75 desglosado por tienda")

    # Stock en tiendas de la región
    stock_tiendas_total: Decimal = Field(default=Decimal("0"), description="Suma de stock en todas las tiendas")
    stock_por_tienda: List[StockPorTienda] = Field(default_factory=list, description="Stock desglosado por tienda")

    # Stock en CEDI destino
    stock_actual_cedi: Decimal = Field(default=Decimal("0"))
    stock_en_transito: Decimal = Field(default=Decimal("0"))

    # Parámetros de inventario calculados para el CEDI
    stock_minimo_cedi: Decimal = Field(default=Decimal("0"))
    stock_seguridad_cedi: Decimal = Field(default=Decimal("0"))
    stock_maximo_cedi: Decimal = Field(default=Decimal("0"))
    punto_reorden_cedi: Decimal = Field(default=Decimal("0"))

    # Cantidades sugeridas (calculadas por el sistema)
    cantidad_sugerida_unidades: Decimal = Field(default=Decimal("0"))
    cantidad_sugerida_bultos: Decimal = Field(default=Decimal("0"))
    cantidad_ideal_unidades: Decimal = Field(default=Decimal("0"), description="Cantidad ideal antes de limitar por stock origen")

    # Metadata
    dias_cobertura_objetivo: int = Field(default=7)
    razon_pedido: str = ""

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "codigo_producto": "001234",
                "descripcion_producto": "ARROZ MARY 1KG",
                "cedi_origen_id": "cedi_seco",
                "cedi_origen_nombre": "CEDI Seco",
                "demanda_regional_p75": 125.5,
                "num_tiendas_region": 2,
                "stock_actual_cedi": 50.0,
                "cantidad_sugerida_bultos": 10,
                "clasificacion_abc": "A"
            }
        }


class ProductoInterCediAjustado(ProductoInterCediCalculado):
    """Producto con ajustes del usuario (para guardar pedido)"""
    # Cantidades pedidas (ajustadas por usuario)
    cantidad_pedida_unidades: Decimal = Field(default=Decimal("0"))
    cantidad_pedida_bultos: Decimal = Field(default=Decimal("0"))
    total_unidades: Decimal = Field(default=Decimal("0"))

    # Control
    incluido: bool = True
    observaciones: Optional[str] = None
    linea_numero: Optional[int] = None


# =====================================================================================
# MODELOS DE REQUEST
# =====================================================================================

class CalcularPedidoInterCediRequest(ConfiguracionDiasCobertura):
    """Request para calcular pedido Inter-CEDI"""
    cedi_destino_id: str = Field(description="CEDI destino (ej: cedi_caracas)")
    cedi_origen_id: str = Field(description="CEDI origen: cedi_seco | cedi_frio | cedi_verde")
    frecuencia_viajes_dias: str = Field(default="Mar,Jue,Sab")
    lead_time_dias: Decimal = Field(default=Decimal("2.0"))

    class Config:
        json_schema_extra = {
            "example": {
                "cedi_destino_id": "cedi_caracas",
                "dias_cobertura_a": 7,
                "dias_cobertura_b": 14,
                "dias_cobertura_c": 21,
                "dias_cobertura_d": 30,
                "frecuencia_viajes_dias": "Mar,Jue,Sab"
            }
        }


class GuardarPedidoInterCediRequest(ConfiguracionDiasCobertura):
    """Request para guardar pedido Inter-CEDI"""
    cedi_destino_id: str
    cedi_destino_nombre: Optional[str] = None
    productos: List[ProductoInterCediAjustado]

    fecha_pedido: Optional[date] = None
    frecuencia_viajes_dias: str = "Mar,Jue,Sab"
    lead_time_dias: Decimal = Field(default=Decimal("2.0"))
    prioridad: str = "normal"

    observaciones: Optional[str] = None
    notas_logistica: Optional[str] = None


class ActualizarPedidoInterCediRequest(BaseModel):
    """Request para actualizar pedido Inter-CEDI en borrador"""
    productos: Optional[List[ProductoInterCediAjustado]] = None
    observaciones: Optional[str] = None
    notas_logistica: Optional[str] = None
    prioridad: Optional[str] = None


class CambiarEstadoPedidoRequest(BaseModel):
    """Request para cambiar estado del pedido"""
    motivo: Optional[str] = None
    usuario: Optional[str] = None
    notas: Optional[str] = None


# =====================================================================================
# MODELOS DE RESPONSE
# =====================================================================================

class CalcularPedidoInterCediResponse(ConfiguracionDiasCobertura):
    """Response al calcular pedido Inter-CEDI"""
    # Productos calculados
    productos: List[ProductoInterCediCalculado]
    productos_por_cedi_origen: Dict[str, List[ProductoInterCediCalculado]] = Field(default_factory=dict)

    # Totales
    total_cedis_origen: int = 0
    total_productos: int  # Total de productos analizados (con y sin sugerido)
    total_productos_con_sugerido: int = Field(default=0, description="Productos con cantidad_sugerida > 0")
    total_productos_sin_sugerido: int = Field(default=0, description="Productos con cantidad_sugerida = 0 (visibles para análisis)")
    total_bultos: Decimal
    total_unidades: Decimal

    # Información del pedido
    cedi_destino_id: str
    cedi_destino_nombre: str
    region: str
    num_tiendas_region: int

    # Desglose por CEDI origen
    totales_por_cedi: Dict[str, Dict[str, Decimal]] = Field(default_factory=dict)

    # Productos excluidos (explícito)
    total_excluidos_inter_cedi: int = Field(default=0, description="Productos omitidos por exclusión Inter-CEDI")
    codigos_excluidos_inter_cedi: List[str] = Field(default_factory=list, description="Códigos de productos excluidos")

    # Timestamp del cálculo
    fecha_calculo: datetime = Field(default_factory=datetime.now)
    mensaje: str = "Pedido Inter-CEDI calculado exitosamente"


class PedidoInterCediGuardadoResponse(BaseModel):
    """Response al guardar pedido Inter-CEDI"""
    id: str
    numero_pedido: str
    estado: str
    total_cedis_origen: int
    total_productos: int
    total_bultos: Decimal
    total_unidades: Decimal
    fecha_creacion: datetime
    mensaje: str = "Pedido Inter-CEDI guardado exitosamente"


class PedidoInterCediResumen(BaseModel):
    """Resumen de pedido Inter-CEDI (para listado)"""
    id: str
    numero_pedido: str
    fecha_pedido: date
    fecha_creacion: datetime

    cedi_destino_id: str
    cedi_destino_nombre: Optional[str] = None
    region: Optional[str] = None

    estado: str
    prioridad: str = "normal"

    total_cedis_origen: int = 0
    total_productos: int = 0
    total_bultos: float = 0
    total_unidades: float = 0
    total_peso_kg: Optional[float] = None

    usuario_creador: Optional[str] = None
    dias_desde_creacion: Optional[int] = None

    # Desglose por CEDI
    productos_cedi_seco: int = 0
    productos_cedi_frio: int = 0
    productos_cedi_verde: int = 0

    class Config:
        from_attributes = True


class PedidoInterCediCompleto(PedidoInterCediResumen, ConfiguracionDiasCobertura):
    """Pedido Inter-CEDI completo con detalles"""
    frecuencia_viajes_dias: str = "Mar,Jue,Sab"
    lead_time_dias: Decimal = Field(default=Decimal("2.0"))

    observaciones: Optional[str] = None
    notas_logistica: Optional[str] = None
    notas_recepcion: Optional[str] = None

    fecha_modificacion: Optional[datetime] = None
    fecha_confirmacion: Optional[datetime] = None
    fecha_despacho: Optional[datetime] = None
    fecha_recepcion: Optional[datetime] = None

    usuario_confirmador: Optional[str] = None
    usuario_despachador: Optional[str] = None
    usuario_receptor: Optional[str] = None

    productos: List[ProductoInterCediAjustado] = Field(default_factory=list)

    version: int = 1


class HistorialEstadoPedido(BaseModel):
    """Registro de cambio de estado"""
    id: str
    pedido_id: str
    estado_anterior: Optional[str] = None
    estado_nuevo: str
    motivo_cambio: Optional[str] = None
    usuario: str
    fecha_cambio: datetime

    class Config:
        from_attributes = True


# =====================================================================================
# MODELOS DE EXPORTACIÓN
# =====================================================================================

class ExportarPedidoRequest(BaseModel):
    """Request para exportar pedido a Excel"""
    cedi_origen_id: Optional[str] = Field(
        default=None,
        description="Filtrar por CEDI origen (None = todos)"
    )
    formato: str = Field(default="xlsx", description="Formato: xlsx")


class ExportarPedidoResponse(BaseModel):
    """Response de exportación"""
    filename: str
    content_type: str
    size_bytes: int
    num_productos: int
    cedi_origen_filtro: Optional[str] = None
