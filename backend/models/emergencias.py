"""
Modelos Pydantic para Sistema de Detección de Emergencias de Inventario
Fluxion AI - Pedido de Emergencia v2
"""

from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum


# =====================================================================================
# ENUMS
# =====================================================================================

class TipoEmergencia(str, Enum):
    """Tipos de emergencia según nivel de cobertura"""
    STOCKOUT = "STOCKOUT"       # Cobertura = 0 (sin stock)
    CRITICO = "CRITICO"         # Cobertura < 25%
    INMINENTE = "INMINENTE"     # Cobertura < 50%
    ALERTA = "ALERTA"           # Cobertura < 75%


class TipoAnomalia(str, Enum):
    """Tipos de anomalías de inventario"""
    STOCK_NEGATIVO = "STOCK_NEGATIVO"       # Stock < 0
    VENTA_IMPOSIBLE = "VENTA_IMPOSIBLE"     # Venta > stock disponible
    SPIKE_VENTAS = "SPIKE_VENTAS"           # Ventas muy por encima de lo esperado
    DISCREPANCIA = "DISCREPANCIA"           # Diferencia entre sistemas


class SeveridadAnomalia(str, Enum):
    """Severidad de las anomalías detectadas"""
    BAJA = "BAJA"
    MEDIA = "MEDIA"
    ALTA = "ALTA"
    CRITICA = "CRITICA"


class EstadoAnomalia(str, Enum):
    """Estado de resolución de una anomalía"""
    PENDIENTE = "PENDIENTE"
    REVISADO = "REVISADO"
    RESUELTO = "RESUELTO"
    IGNORADO = "IGNORADO"


class TriggerTipo(str, Enum):
    """Tipo de trigger que inició el scan"""
    MANUAL = "MANUAL"
    SCHEDULER = "SCHEDULER"
    API = "API"


class EstadoScan(str, Enum):
    """Estado de ejecución del scan"""
    EN_PROGRESO = "EN_PROGRESO"
    COMPLETADO = "COMPLETADO"
    ERROR = "ERROR"


# =====================================================================================
# MODELOS DE CONFIGURACIÓN POR TIENDA
# =====================================================================================

class ConfigTiendaBase(BaseModel):
    """Configuración base de una tienda para emergencias"""
    ubicacion_id: str
    habilitado: bool = False
    umbral_critico: Decimal = Field(default=Decimal("0.25"), description="Cobertura < este valor = CRITICO")
    umbral_inminente: Decimal = Field(default=Decimal("0.50"), description="Cobertura < este valor = INMINENTE")
    umbral_alerta: Decimal = Field(default=Decimal("0.75"), description="Cobertura < este valor = ALERTA")
    emails_notificacion: List[str] = Field(default_factory=list)
    notificaciones_activas: bool = True


class ConfigTiendaResumen(BaseModel):
    """Resumen de configuración de tienda para listados"""
    ubicacion_id: str
    nombre_tienda: str
    habilitado: bool
    fecha_habilitacion: Optional[datetime] = None
    umbral_critico: Decimal
    umbral_inminente: Decimal
    umbral_alerta: Decimal

    class Config:
        from_attributes = True


class ConfigTiendaCompleta(ConfigTiendaBase):
    """Configuración completa de tienda con metadata"""
    nombre_tienda: Optional[str] = None
    fecha_habilitacion: Optional[datetime] = None
    emails_notificacion: List[str] = Field(default_factory=list)
    notificaciones_activas: bool = True
    creado_por: Optional[str] = None
    fecha_creacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None

    class Config:
        from_attributes = True


class HabilitarTiendaRequest(BaseModel):
    """Request para habilitar una tienda"""
    emails_notificacion: List[str] = Field(default_factory=list)
    umbral_critico: Optional[Decimal] = None
    umbral_inminente: Optional[Decimal] = None
    umbral_alerta: Optional[Decimal] = None
    usuario: Optional[str] = None


class ActualizarConfigRequest(BaseModel):
    """Request para actualizar configuración de tienda"""
    umbral_critico: Optional[Decimal] = None
    umbral_inminente: Optional[Decimal] = None
    umbral_alerta: Optional[Decimal] = None
    emails_notificacion: Optional[List[str]] = None
    notificaciones_activas: Optional[bool] = None


# =====================================================================================
# MODELOS DE EMERGENCIAS DETECTADAS
# =====================================================================================

class EmergenciaDetectada(BaseModel):
    """Resultado de detección de emergencia para un producto"""
    # Identificación
    ubicacion_id: str
    nombre_tienda: str
    producto_id: str
    nombre_producto: str
    categoria: Optional[str] = None

    # Clasificación ABC
    clase_abc: Optional[str] = None  # A, B, C, D

    # Tipo de emergencia
    tipo_emergencia: TipoEmergencia

    # Valores calculados
    stock_actual: Decimal
    ventas_hoy: Decimal
    demanda_restante: Decimal
    cobertura: Decimal = Field(description="stock_actual / demanda_restante")

    # Factor de intensidad del día
    factor_intensidad: Decimal = Field(description="ventas_reales / ventas_esperadas")

    # Horas restantes estimadas
    horas_restantes: Optional[Decimal] = None

    # Metadata
    almacen_codigo: Optional[str] = None


class EmergenciasResumen(BaseModel):
    """Resumen de emergencias por tienda"""
    ubicacion_id: str
    nombre_tienda: str
    total_emergencias: int
    stockouts: int = 0
    criticos: int = 0
    inminentes: int = 0
    alertas: int = 0
    factor_intensidad_promedio: Decimal


# =====================================================================================
# MODELOS DE ANOMALÍAS
# =====================================================================================

class AnomaliaDetectada(BaseModel):
    """Anomalía de inventario detectada"""
    # Identificación
    ubicacion_id: str
    nombre_tienda: str
    producto_id: str
    nombre_producto: str
    almacen_codigo: Optional[str] = None

    # Tipo y severidad
    tipo_anomalia: TipoAnomalia
    severidad: SeveridadAnomalia = SeveridadAnomalia.MEDIA

    # Valores
    valor_detectado: Decimal
    valor_esperado: Optional[Decimal] = None
    desviacion_porcentual: Optional[Decimal] = None

    # Descripción
    descripcion: str

    # Estado
    estado: EstadoAnomalia = EstadoAnomalia.PENDIENTE
    fecha_deteccion: datetime = Field(default_factory=datetime.now)


class AnomaliaDB(BaseModel):
    """Anomalía como se guarda en la BD"""
    id: int
    ubicacion_id: str
    producto_id: str
    almacen_codigo: Optional[str] = None
    tipo_anomalia: str
    valor_detectado: Decimal
    valor_esperado: Optional[Decimal] = None
    desviacion_porcentual: Optional[Decimal] = None
    descripcion: Optional[str] = None
    severidad: str
    estado: str
    resuelto_por: Optional[str] = None
    fecha_resolucion: Optional[datetime] = None
    notas_resolucion: Optional[str] = None
    fecha_deteccion: datetime
    scan_id: Optional[str] = None

    class Config:
        from_attributes = True


# =====================================================================================
# MODELOS DE SCAN
# =====================================================================================

class ScanRequest(BaseModel):
    """Request para ejecutar un scan de emergencias"""
    tiendas: Optional[List[str]] = Field(
        default=None,
        description="Lista de ubicacion_id a escanear. None = todas las habilitadas"
    )
    incluir_anomalias: bool = Field(default=True, description="Detectar también anomalías de inventario")
    usuario: Optional[str] = None


class ScanResponse(BaseModel):
    """Respuesta del scan de emergencias"""
    # Metadata del scan
    scan_id: str
    fecha_inicio: datetime
    fecha_fin: datetime
    duracion_ms: int
    trigger_tipo: TriggerTipo
    trigger_usuario: Optional[str] = None

    # Scope
    tiendas_escaneadas: List[str]

    # Conteos
    total_productos_analizados: int
    total_emergencias: int
    total_anomalias: int

    # Breakdown por tipo de emergencia
    stockouts: int = 0
    criticos: int = 0
    inminentes: int = 0
    alertas: int = 0

    # Resultados detallados
    emergencias: List[EmergenciaDetectada]
    anomalias: List[AnomaliaDetectada] = Field(default_factory=list)

    # Resumen por tienda
    resumen_por_tienda: List[EmergenciasResumen]


class ScanHistorial(BaseModel):
    """Registro histórico de un scan"""
    id: str
    fecha_inicio: datetime
    fecha_fin: Optional[datetime] = None
    duracion_ms: Optional[int] = None
    tiendas_escaneadas: List[str]
    total_productos_analizados: int
    emergencias_detectadas: int
    anomalias_detectadas: int
    stockouts: int
    criticos: int
    inminentes: int
    alertas: int
    estado: EstadoScan
    error_mensaje: Optional[str] = None
    trigger_tipo: TriggerTipo
    trigger_usuario: Optional[str] = None

    class Config:
        from_attributes = True


# =====================================================================================
# MODELOS DE FACTOR DE INTENSIDAD
# =====================================================================================

class FactorIntensidad(BaseModel):
    """Factor de intensidad del día para una tienda"""
    ubicacion_id: str
    nombre_tienda: str
    fecha: date

    # Ventas
    ventas_esperadas_hasta_ahora: Decimal
    ventas_reales_hasta_ahora: Decimal

    # Factor calculado
    factor_intensidad: Decimal = Field(
        description="ventas_reales / ventas_esperadas. >1 = día intenso, <1 = día tranquilo"
    )

    # Interpretación
    intensidad: str = Field(
        description="MUY_BAJO | BAJO | NORMAL | ALTO | MUY_ALTO"
    )

    # Metadata
    hora_actual: int
    porcentaje_dia_transcurrido: Decimal


class FactorIntensidadResponse(BaseModel):
    """Respuesta del endpoint de factor de intensidad"""
    fecha: date
    hora_actual: int
    factores: List[FactorIntensidad]


# =====================================================================================
# MODELOS DE RESPUESTA API
# =====================================================================================

class EmergenciasListResponse(BaseModel):
    """Respuesta del listado de emergencias"""
    fecha_consulta: datetime
    total: int
    emergencias: List[EmergenciaDetectada]
    resumen_por_tienda: List[EmergenciasResumen]


class AnomaliasListResponse(BaseModel):
    """Respuesta del listado de anomalías"""
    fecha_consulta: datetime
    total: int
    anomalias: List[AnomaliaDetectada]


class ConfigTiendasListResponse(BaseModel):
    """Respuesta del listado de configuración de tiendas"""
    total: int
    habilitadas: int
    tiendas: List[ConfigTiendaResumen]


class OperacionExitosaResponse(BaseModel):
    """Respuesta genérica de operación exitosa"""
    ok: bool = True
    mensaje: str
    ubicacion_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)
