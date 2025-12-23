"""
Modelos Pydantic para Pedidos Sugeridos
Basado en el formato Excel: FORMATO PARA PEDIDO DE TIENDAS.xlsx
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, validator


# =====================================================================================
# ENUMS Y CONSTANTES
# =====================================================================================

class EstadoPedido:
    BORRADOR = "borrador"
    SOLICITADO = "solicitado"
    APROBADO = "aprobado"
    EN_PREPARACION = "en_preparacion"
    EN_TRANSITO = "en_transito"
    RECIBIDO = "recibido"
    RECHAZADO = "rechazado"
    CANCELADO = "cancelado"

    @classmethod
    def all(cls):
        return [
            cls.BORRADOR, cls.SOLICITADO, cls.APROBADO, cls.EN_PREPARACION,
            cls.EN_TRANSITO, cls.RECIBIDO, cls.RECHAZADO, cls.CANCELADO
        ]


class PrioridadPedido:
    BAJA = "baja"
    NORMAL = "normal"
    ALTA = "alta"
    URGENTE = "urgente"

    @classmethod
    def all(cls):
        return [cls.BAJA, cls.NORMAL, cls.ALTA, cls.URGENTE]


class TipoPedido:
    REPOSICION = "reposicion"
    URGENTE = "urgente"
    PROMOCION = "promocion"
    NUEVO_PRODUCTO = "nuevo_producto"
    ESTACIONAL = "estacional"

    @classmethod
    def all(cls):
        return [cls.REPOSICION, cls.URGENTE, cls.PROMOCION, cls.NUEVO_PRODUCTO, cls.ESTACIONAL]


class EstadoLinea:
    PENDIENTE = "pendiente"
    APROBADA = "aprobada"
    PICKEADA = "pickeada"
    EMPACADA = "empacada"
    DESPACHADA = "despachada"
    RECIBIDA = "recibida"
    RECHAZADA = "rechazada"
    FALTANTE = "faltante"

    @classmethod
    def all(cls):
        return [
            cls.PENDIENTE, cls.APROBADA, cls.PICKEADA, cls.EMPACADA,
            cls.DESPACHADA, cls.RECIBIDA, cls.RECHAZADA, cls.FALTANTE
        ]


# =====================================================================================
# MODELOS DE DETALLE (PRODUCTOS)
# =====================================================================================

class ProductoPedidoSugeridoBase(BaseModel):
    """Base para producto en pedido sugerido"""
    # Información del producto
    codigo_producto: str
    codigo_barras: Optional[str] = None
    descripcion_producto: str

    # Clasificación
    categoria: Optional[str] = None
    grupo: Optional[str] = None
    subgrupo: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    presentacion: Optional[str] = None

    # Cuadrante y disponibilidad
    cuadrante_producto: Optional[str] = None
    disponibilidad: Optional[str] = None
    producto_activo: bool = True

    # Cantidades físicas del producto (del maestro)
    cantidad_bultos: Decimal = Field(description="Unidades por bulto")
    peso_unitario_kg: Optional[Decimal] = None
    volumen_unitario_m3: Optional[Decimal] = None
    peso_bulto_kg: Optional[Decimal] = None
    volumen_bulto_m3: Optional[Decimal] = None


class ProductoPedidoSugeridoCalculado(ProductoPedidoSugeridoBase):
    """Producto con cálculos de sistema (response del endpoint de cálculo)"""
    # Cantidades SUGERIDAS (calculadas por el sistema)
    # Acepta tanto 'cantidad_sugerida_unidades' como 'cantidad_sugerida_unid' del frontend
    cantidad_sugerida_unidades: Decimal = Field(default=0, alias="cantidad_sugerida_unid")
    cantidad_sugerida_bultos: Decimal = 0
    cantidad_sugerida_kg: Optional[Decimal] = None

    # Métricas de ventas usadas en el cálculo
    prom_ventas_3dias_unid: Decimal = 0
    prom_ventas_5dias_unid: Decimal = 0
    prom_ventas_8sem_unid: Decimal = 0
    prom_ventas_8sem_bultos: Decimal = 0
    prom_ventas_20dias_unid: Decimal = 0
    prom_mismo_dia_unid: Decimal = 0

    # Forecast
    pronostico_3dias_unid: Optional[Decimal] = 0
    pronostico_3dias_bultos: Optional[Decimal] = 0
    pronostico_7dias_unid: Optional[Decimal] = 0

    # Stock en diferentes ubicaciones
    stock_tienda: Decimal = 0
    stock_en_transito: Decimal = 0
    stock_total: Decimal = 0
    stock_total_bultos: Decimal = 0
    stock_dias_cobertura: Optional[Decimal] = None

    stock_cedi_origen: Decimal = 0
    stock_cedi_seco: Decimal = 0
    stock_cedi_frio: Decimal = 0
    stock_cedi_verde: Decimal = 0

    # Parámetros de inventario
    stock_minimo: Decimal = 0
    stock_maximo: Decimal = 0
    stock_seguridad: Decimal = 0
    punto_reorden: Decimal = 0
    clasificacion_abc: Optional[str] = None

    # Razón del pedido
    razon_pedido: str = ""
    es_urgente: bool = False
    es_critico: bool = False

    class Config:
        # Permitir campos extra del frontend sin fallar
        extra = 'ignore'
        # Permitir usar alias o nombre real
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "codigo_producto": "12345",
                "codigo_barras": "7501234567890",
                "descripcion_producto": "PRODUCTO EJEMPLO 500GR",
                "categoria": "ABARROTES",
                "cuadrante_producto": "CUADRANTE I",
                "cantidad_bultos": 12,
                "cantidad_sugerida_unidades": 36,
                "cantidad_sugerida_bultos": 3,
                "prom_ventas_5dias_unid": 12.5,
                "stock_tienda": 24,
                "stock_cedi_origen": 240,
                "razon_pedido": "Stock bajo punto de reorden"
            }
        }


class ProductoPedidoSugeridoAjustado(ProductoPedidoSugeridoCalculado):
    """Producto con ajustes del usuario (para guardar pedido)"""
    # Cantidades PEDIDAS (ajustadas por usuario)
    cantidad_pedida_unidades: Decimal = 0
    cantidad_pedida_bultos: Decimal = 0
    cantidad_pedida_kg: Optional[Decimal] = None

    # Totales calculados (calculado si no viene)
    total_unidades: Decimal = 0
    total_kg: Optional[Decimal] = None

    # Control de inclusión
    incluido: bool = True
    motivo_exclusion: Optional[str] = None

    # Observaciones por línea
    observaciones: Optional[str] = None

    class Config:
        # Permitir campos extra del frontend sin fallar
        extra = 'ignore'
        # Permitir usar alias o nombre real
        populate_by_name = True

    @validator('cantidad_pedida_bultos', 'cantidad_pedida_unidades', pre=True)
    def validate_positive(cls, v):
        if v is None:
            return 0
        if v < 0:
            raise ValueError('Las cantidades deben ser positivas')
        return v

    @validator('total_unidades', pre=True, always=True)
    def calcular_total_unidades(cls, v, values):
        if v and v > 0:
            return v
        # Calcular si no viene: cantidad_pedida_bultos * cantidad_bultos
        pedida = values.get('cantidad_pedida_bultos', 0) or 0
        bultos = values.get('cantidad_bultos', 1) or 1
        return pedida * bultos


class ProductoPedidoSugeridoCompleto(ProductoPedidoSugeridoAjustado):
    """Producto con información completa de ejecución del pedido"""
    id: str
    pedido_id: str
    linea_numero: int

    # Cantidades REALES (lo que finalmente se envía/recibe)
    cantidad_pickeada_bultos: Optional[Decimal] = None
    cantidad_pickeada_unidades: Optional[Decimal] = None
    cantidad_recibida_bultos: Optional[Decimal] = None
    cantidad_recibida_unidades: Optional[Decimal] = None
    cantidad_rechazada_unidades: Optional[Decimal] = None

    # Información de vencimiento
    fecha_vencimiento: Optional[date] = None
    dias_hasta_vencimiento: Optional[int] = None
    requiere_lote: bool = False
    numero_lote: Optional[str] = None

    # Notas adicionales
    notas_picking: Optional[str] = None
    notas_calidad: Optional[str] = None

    # Estado de la línea
    estado_linea: str = EstadoLinea.PENDIENTE
    motivo_rechazo: Optional[str] = None

    # Auditoría
    fecha_creacion: datetime
    fecha_modificacion: Optional[datetime] = None

    class Config:
        from_attributes = True


# =====================================================================================
# MODELOS DE PEDIDO (ENCABEZADO)
# =====================================================================================

class PedidoSugeridoBase(BaseModel):
    """Base para pedido sugerido"""
    # Ubicaciones
    cedi_origen_id: str
    cedi_origen_nombre: str
    tienda_destino_id: str
    tienda_destino_nombre: str

    # Configuración
    dias_cobertura: int = 3
    tipo_pedido: str = TipoPedido.REPOSICION
    prioridad: str = PrioridadPedido.NORMAL

    # Observaciones
    observaciones: Optional[str] = None

    @validator('prioridad')
    def validate_prioridad(cls, v):
        if v not in PrioridadPedido.all():
            raise ValueError(f'Prioridad debe ser una de: {PrioridadPedido.all()}')
        return v

    @validator('tipo_pedido')
    def validate_tipo(cls, v):
        if v not in TipoPedido.all():
            raise ValueError(f'Tipo de pedido debe ser uno de: {TipoPedido.all()}')
        return v


# =====================================================================================
# MODELOS DE DEVOLUCIONES (debe estar antes de CalcularPedidoResponse)
# =====================================================================================

class ProductoDevolucionSugeridaBase(BaseModel):
    """Base para producto sugerido para devolución"""
    # Información del producto
    codigo_producto: str
    codigo_barras: Optional[str] = None
    descripcion_producto: str

    # Clasificación
    categoria: Optional[str] = None
    grupo: Optional[str] = None
    subgrupo: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    presentacion: Optional[str] = None

    # Cuadrante y disponibilidad
    cuadrante_producto: Optional[str] = None
    disponibilidad: Optional[str] = None

    # Cantidades físicas del producto
    cantidad_bultos: Decimal = Field(description="Unidades por bulto")
    peso_unitario_kg: Optional[Decimal] = None
    volumen_unitario_m3: Optional[Decimal] = None
    peso_bulto_kg: Optional[Decimal] = None
    volumen_bulto_m3: Optional[Decimal] = None


class ProductoDevolucionSugeridaCalculada(ProductoDevolucionSugeridaBase):
    """Producto con cálculo de devolución sugerida (response)"""
    # Stock actual y límites
    stock_actual_tienda: Decimal
    stock_maximo: Decimal
    stock_optimo: Optional[Decimal] = None
    exceso_unidades: Decimal
    exceso_bultos: Decimal

    # Devolución SUGERIDA (calculada por el sistema)
    devolucion_sugerida_unidades: Decimal
    devolucion_sugerida_bultos: Decimal
    devolucion_sugerida_kg: Optional[Decimal] = None

    # Razón de la devolución
    razon_devolucion: str
    prioridad_devolucion: str = "media"  # baja, media, alta, urgente

    # Análisis de rotación
    dias_sin_venta: Optional[int] = None
    prom_ventas_30dias: Optional[Decimal] = None
    dias_cobertura_actual: Optional[Decimal] = None

    # Información de vencimiento
    fecha_vencimiento_cercano: Optional[date] = None
    dias_hasta_vencimiento: Optional[int] = None
    tiene_producto_vencido: bool = False

    class Config:
        json_schema_extra = {
            "example": {
                "codigo_producto": "12345",
                "descripcion_producto": "PRODUCTO EJEMPLO 500GR",
                "categoria": "ABARROTES",
                "cantidad_bultos": 12,
                "stock_actual_tienda": 144,
                "stock_maximo": 96,
                "exceso_unidades": 48,
                "exceso_bultos": 4,
                "devolucion_sugerida_bultos": 4,
                "devolucion_sugerida_unidades": 48,
                "razon_devolucion": "Stock excede máximo por 48 unidades (4.0 bultos)",
                "prioridad_devolucion": "alta"
            }
        }


class ProductoDevolucionConfirmada(ProductoDevolucionSugeridaCalculada):
    """Producto con devolución confirmada (para guardar)"""
    # Devolución CONFIRMADA (ajustada por analista)
    devolucion_confirmada_unidades: Decimal
    devolucion_confirmada_bultos: Decimal
    devolucion_confirmada_kg: Optional[Decimal] = None

    # Totales calculados
    total_unidades_devolver: Decimal
    total_kg_devolver: Optional[Decimal] = None

    # Control de inclusión
    incluido: bool = True
    motivo_exclusion: Optional[str] = None

    # Observaciones
    observaciones: Optional[str] = None

    @validator('devolucion_confirmada_bultos', 'devolucion_confirmada_unidades')
    def validate_positive(cls, v):
        if v < 0:
            raise ValueError('Las cantidades deben ser positivas')
        return v


class ProductoDevolucionCompleto(ProductoDevolucionConfirmada):
    """Devolución con información completa guardada en DB"""
    id: str
    pedido_id: str
    linea_numero: int

    # Aprobación del gerente
    aprobado_por_gerente: bool = True
    comentario_gerente: Optional[str] = None
    comentario_revisado_analista: bool = False

    # Notas adicionales
    notas_calidad: Optional[str] = None

    # Estado de la devolución
    estado_devolucion: str = "pendiente"  # pendiente, aprobada, rechazada
    motivo_rechazo: Optional[str] = None

    # Auditoría
    fecha_creacion: datetime
    fecha_modificacion: Optional[datetime] = None

    class Config:
        from_attributes = True


# =====================================================================================
# MODELOS DE REQUEST/RESPONSE PARA API
# =====================================================================================

class CalcularPedidoRequest(PedidoSugeridoBase):
    """Request para calcular pedido sugerido"""
    incluir_devoluciones: bool = True  # Si se deben calcular devoluciones sugeridas

    class Config:
        json_schema_extra = {
            "example": {
                "cedi_origen_id": "cedi-001",
                "cedi_origen_nombre": "CEDI Los Guayos",
                "tienda_destino_id": "tienda-042",
                "tienda_destino_nombre": "Tienda Mañongo",
                "dias_cobertura": 3,
                "tipo_pedido": "reposicion",
                "prioridad": "normal",
                "incluir_devoluciones": True
            }
        }


class CalcularPedidoResponse(BaseModel):
    """Response al calcular pedido sugerido"""
    # Productos a RECIBIR en la tienda
    productos_recibir: List[ProductoPedidoSugeridoCalculado]

    # Productos a DEVOLVER al CEDI
    productos_devolver: List[ProductoDevolucionSugeridaCalculada] = []

    # Totales de productos a recibir
    total_productos_recibir: int
    total_bultos_recibir: Decimal
    total_unidades_recibir: Decimal

    # Totales de productos a devolver
    total_productos_devolver: int = 0
    total_bultos_devolver: Decimal = 0
    total_unidades_devolver: Decimal = 0

    # Información del pedido
    cedi_origen_id: str
    cedi_origen_nombre: str
    tienda_destino_id: str
    tienda_destino_nombre: str
    dias_cobertura: int

    # Timestamp del cálculo
    fecha_calculo: datetime = Field(default_factory=datetime.now)

    # Resumen
    mensaje: str = "Pedido calculado exitosamente"

    class Config:
        json_schema_extra = {
            "example": {
                "productos_recibir": [],
                "productos_devolver": [],
                "total_productos_recibir": 45,
                "total_bultos_recibir": 120,
                "total_unidades_recibir": 1440,
                "total_productos_devolver": 8,
                "total_bultos_devolver": 15,
                "total_unidades_devolver": 180,
                "cedi_origen_id": "cedi-001",
                "cedi_origen_nombre": "CEDI Los Guayos",
                "tienda_destino_id": "tienda-042",
                "tienda_destino_nombre": "Tienda Mañongo",
                "dias_cobertura": 3,
                "mensaje": "Pedido calculado exitosamente"
            }
        }


class GuardarPedidoRequest(PedidoSugeridoBase):
    """Request para guardar pedido sugerido"""
    # Productos a RECIBIR
    productos: List[ProductoPedidoSugeridoAjustado]

    # Productos a DEVOLVER (opcional)
    devoluciones: List[ProductoDevolucionConfirmada] = []

    # Información adicional del pedido
    fecha_pedido: Optional[date] = None
    fecha_entrega_solicitada: Optional[date] = None
    numero_guia: Optional[str] = None
    requiere_aprobacion: bool = False

    # Observaciones adicionales
    notas_picking: Optional[str] = None
    notas_entrega: Optional[str] = None

    @validator('productos')
    def validate_productos(cls, v):
        if not v:
            raise ValueError('Debe incluir al menos un producto')
        # Validar que hay productos incluidos
        productos_incluidos = [p for p in v if p.incluido]
        if not productos_incluidos:
            raise ValueError('Debe incluir al menos un producto marcado como incluido')
        return v


class ActualizarEstadoPedidoRequest(BaseModel):
    """Request para cambiar estado del pedido"""
    estado_nuevo: str
    motivo_cambio: Optional[str] = None
    usuario: str = "sistema"

    @validator('estado_nuevo')
    def validate_estado(cls, v):
        if v not in EstadoPedido.all():
            raise ValueError(f'Estado debe ser uno de: {EstadoPedido.all()}')
        return v


class PedidoSugeridoResumen(BaseModel):
    """Resumen de pedido sugerido (para listado)"""
    id: str
    numero_pedido: str
    fecha_pedido: date
    fecha_creacion: datetime

    # Ubicaciones
    cedi_origen_nombre: str
    tienda_destino_nombre: str

    # Estado
    estado: str
    prioridad: str
    tipo_pedido: str

    # Totales
    total_productos: int
    total_lineas: int
    total_bultos: float
    total_unidades: float
    total_peso_kg: Optional[float] = None

    # Fechas importantes
    fecha_entrega_solicitada: Optional[date] = None
    fecha_aprobacion: Optional[datetime] = None
    fecha_recepcion: Optional[datetime] = None

    # Usuario
    usuario_creador: str

    # Calculados
    dias_desde_creacion: Optional[int] = None
    porcentaje_avance: Optional[int] = None

    class Config:
        from_attributes = True


class PedidoSugeridoCompleto(PedidoSugeridoResumen):
    """Pedido completo con todos los detalles"""
    # Ubicaciones completas
    cedi_origen_id: str
    tienda_destino_id: str

    # Guías y control
    numero_guia: Optional[str] = None
    numero_orden_compra: Optional[str] = None
    numero_picking: Optional[str] = None

    # Estados adicionales
    sub_estado: Optional[str] = None
    requiere_aprobacion: bool

    # Totales adicionales
    total_volumen_m3: Optional[Decimal] = None

    # Información de devoluciones
    tiene_devoluciones: bool = False
    total_productos_devolucion: int = 0
    total_bultos_devolucion: Decimal = 0
    total_unidades_devolucion: Decimal = 0

    # Configuración
    dias_cobertura: int

    # Logística
    requiere_refrigeracion: bool
    requiere_congelacion: bool
    paleta_asignada: Optional[str] = None

    # Observaciones
    observaciones: Optional[str] = None
    notas_picking: Optional[str] = None
    notas_entrega: Optional[str] = None
    notas_recepcion: Optional[str] = None

    # Usuarios
    usuario_aprobador: Optional[str] = None
    usuario_picker: Optional[str] = None
    usuario_receptor: Optional[str] = None

    # Todas las fechas
    fecha_modificacion: Optional[datetime] = None
    fecha_inicio_picking: Optional[datetime] = None
    fecha_fin_picking: Optional[datetime] = None
    fecha_despacho: Optional[datetime] = None
    fecha_cancelacion: Optional[datetime] = None
    fecha_entrega_real: Optional[date] = None

    # Control de versiones
    version: int
    pedido_padre_id: Optional[str] = None

    # Métricas
    porcentaje_cumplimiento: Optional[Decimal] = None
    tiempo_preparacion_horas: Optional[Decimal] = None

    # Productos a RECIBIR (detalle)
    productos: List[ProductoPedidoSugeridoCompleto] = []

    # Productos a DEVOLVER (devoluciones)
    devoluciones: List[ProductoDevolucionCompleto] = []

    class Config:
        from_attributes = True


class PedidoGuardadoResponse(BaseModel):
    """Response al guardar un pedido"""
    id: str
    numero_pedido: str
    estado: str

    # Totales de productos a recibir
    total_productos: int
    total_bultos: Decimal

    # Totales de devoluciones
    tiene_devoluciones: bool = False
    total_productos_devolucion: int = 0
    total_bultos_devolucion: Decimal = 0

    fecha_creacion: datetime
    mensaje: str = "Pedido guardado exitosamente"


# =====================================================================================
# MODELOS DE HISTORIAL Y COMENTARIOS
# =====================================================================================

class PedidoHistorial(BaseModel):
    """Entrada en el historial de cambios"""
    id: str
    pedido_id: str
    estado_anterior: Optional[str]
    estado_nuevo: str
    motivo_cambio: Optional[str]
    usuario: str
    fecha_cambio: datetime

    class Config:
        from_attributes = True


class PedidoComentario(BaseModel):
    """Comentario en un pedido"""
    id: str
    pedido_id: str
    tipo_comentario: str  # 'general', 'picking', 'entrega', 'calidad', 'interno'
    comentario: str
    usuario: str
    fecha_comentario: datetime
    es_publico: bool = True
    es_importante: bool = False

    class Config:
        from_attributes = True


class CrearComentarioRequest(BaseModel):
    """Request para crear comentario"""
    tipo_comentario: str
    comentario: str
    usuario: str = "sistema"
    es_publico: bool = True
    es_importante: bool = False


# =====================================================================================
# MODELOS DE EXPORTACIÓN
# =====================================================================================

class PedidoExportExcel(BaseModel):
    """Datos para exportar pedido a Excel (formato original)"""
    # Encabezado del pedido
    fecha: date
    numero_guia: Optional[str]
    tienda: str

    # Productos
    productos: List[dict]  # Formato específico del Excel

    class Config:
        json_schema_extra = {
            "example": {
                "fecha": "2025-10-23",
                "numero_guia": "ATC-001",
                "tienda": "MAÑONGO",
                "productos": [
                    {
                        "N°": 1,
                        "CODIGO STELLAR": "12345",
                        "CODIGO BARRA": "7501234567890",
                        "DESCRIPCION": "PRODUCTO EJEMPLO",
                        "Cuadrante": "CUADRANTE I",
                        "Cantidad": 3,
                        "Total Und": 36
                    }
                ]
            }
        }


# =====================================================================================
# MODELOS PARA VERIFICACIÓN DE LLEGADA
# =====================================================================================

class EstadoLlegada:
    """Estados posibles de llegada de un producto"""
    COMPLETO = "completo"      # >= 95% llegó
    PARCIAL = "parcial"        # 1-94% llegó
    NO_LLEGO = "no_llego"      # 0% o sin incremento detectado
    SIN_DATOS = "sin_datos"    # No hay snapshots en el período


class ProductoLlegadaVerificacion(BaseModel):
    """Resultado de verificación de llegada para un producto"""
    codigo_producto: str
    descripcion_producto: str

    # Cantidades del pedido
    cantidad_pedida_bultos: Decimal
    cantidad_pedida_unidades: Decimal

    # Llegadas detectadas
    total_llegadas_detectadas: Decimal = 0  # Suma de todos los incrementos positivos
    cantidad_ya_guardada: Decimal = 0       # Lo que ya estaba en cantidad_recibida_bultos
    nuevo_incremento: Decimal = 0           # total_llegadas - ya_guardada

    # Porcentaje y estado
    porcentaje_llegada: Decimal = 0
    estado_llegada: str = EstadoLlegada.SIN_DATOS

    # Metadata
    tiene_datos: bool = False
    mensaje: Optional[str] = None

    # Detalle de snapshots (opcional, para debug)
    snapshot_inicial: Optional[Decimal] = None
    snapshot_final: Optional[Decimal] = None
    fecha_primer_incremento: Optional[datetime] = None


class VerificarLlegadaResponse(BaseModel):
    """Response completo de verificación de llegada"""
    pedido_id: str
    numero_pedido: str
    tienda_destino_id: str
    tienda_destino_nombre: str
    fecha_pedido: date
    fecha_verificacion: datetime

    # Productos con su verificación
    productos: List[ProductoLlegadaVerificacion]

    # Resumen
    total_productos: int
    productos_completos: int = 0
    productos_parciales: int = 0
    productos_no_llegaron: int = 0
    productos_sin_datos: int = 0

    # Porcentaje global
    porcentaje_cumplimiento_global: Decimal = 0

    # Flags
    tiene_datos_suficientes: bool = True
    hay_nuevos_incrementos: bool = False  # True si hay algo nuevo para guardar

    mensaje: str = "Verificación completada"


class RegistrarLlegadaProducto(BaseModel):
    """Un producto para registrar su llegada"""
    codigo_producto: str
    cantidad_llegada: Decimal  # Lo que se va a sumar a cantidad_recibida_bultos


class RegistrarLlegadaRequest(BaseModel):
    """Request para registrar/guardar llegadas detectadas"""
    productos: List[RegistrarLlegadaProducto]

    @validator('productos')
    def validate_productos(cls, v):
        if not v:
            raise ValueError('Debe incluir al menos un producto')
        return v


class RegistrarLlegadaResponse(BaseModel):
    """Response al registrar llegadas"""
    pedido_id: str
    numero_pedido: str
    productos_actualizados: int
    mensaje: str = "Llegadas registradas exitosamente"
