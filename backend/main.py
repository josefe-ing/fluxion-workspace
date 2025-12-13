#!/usr/bin/env python3
"""
FastAPI Backend para Fluxion AI - La Granja Mercado
PostgreSQL only - DuckDB removido completamente (Dic 2025)
"""

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path
from datetime import datetime, date, timedelta, time as dt_time
import logging
import subprocess
import asyncio
import os
import time
from contextlib import contextmanager
# from forecast_pmp import ForecastPMP  # DEPRECADO: usa DuckDB
from zoneinfo import ZoneInfo

# Sentry para monitoreo de errores (optional)
try:
    from sentry_config import init_sentry
    SENTRY_AVAILABLE = True
except ImportError as e:
    SENTRY_AVAILABLE = False
    def init_sentry():
        """Dummy function when Sentry is not available"""
        pass

# AWS SDK for ECS task execution in production
try:
    import boto3
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False
    logger.warning("boto3 not available - ETL sync in production will not work")

# Importar módulo de autenticación
from auth import (
    LoginRequest,
    TokenResponse,
    Usuario,
    CreateUserRequest,
    authenticate_user,
    create_access_token,
    create_user,
    verify_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    auto_bootstrap_admin
)

# Importar ETL Scheduler
from etl_scheduler import VentasETLScheduler

# Importar Tenant Middleware
from middleware.tenant import TenantMiddleware

# Importar routers
from routers.pedidos_sugeridos import router as pedidos_sugeridos_router
from routers.generadores_trafico_router import router as generadores_trafico_router
from routers.config_inventario import router as config_inventario_router
from routers.pedidos_inter_cedi import router as pedidos_inter_cedi_router
from routers.emergencias import router as emergencias_router
# from routers.conjuntos_router import router as conjuntos_router  # TODO: Uncomment when router is ready

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuración de la aplicación
app = FastAPI(
    title="Fluxion AI - La Granja Mercado API",
    description="API para gestión de inventarios en tiempo real",
    version="1.0.0"
)

# ============================================================================
# CACHE REFRESH (Manual/Post-ETL)
# ============================================================================
# Cache refresh is now triggered by ETL processes after inventory sync
# instead of running on a fixed schedule. This ensures cache is only
# refreshed when there's new data (after each ETL run).


# Auto-bootstrap admin user on startup
@app.on_event("startup")
async def startup_event():
    """Execute startup tasks"""
    global ventas_scheduler

    logger.info("🚀 Starting Fluxion AI Backend...")

    # Inicializar Sentry
    init_sentry()

    # Re-enabled with 8GB memory allocation
    try:
        auto_bootstrap_admin()
    except Exception as e:
        logger.error(f"⚠️  Auto-bootstrap failed: {e}")

    logger.info("⚠️  VentasETLScheduler DISABLED - Use manual ETL sync endpoints or increase RAM to 8GB")
    logger.info("ℹ️  Cache refresh triggered by ETL processes after inventory sync")

# Configurar CORS para el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "https://d20a0g9yxinot2.cloudfront.net",  # Frontend CloudFront (current)
        "https://d3jghnkvt6d1is.cloudfront.net",  # Frontend CloudFront (old)
        "https://dynsftz61igf5.cloudfront.net",  # Frontend CloudFront (old)
        "http://fluxion-alb-433331665.us-east-1.elb.amazonaws.com",  # Backend ALB (current)
        "http://fluxion-alb-1002393067.us-east-1.elb.amazonaws.com",  # Backend ALB (old)
        "http://fluxion-frontend-611395766952.s3-website-us-east-1.amazonaws.com",
        # Multi-tenant domains
        "https://fluxionia.co",
        "https://www.fluxionia.co",
        "https://granja.fluxionia.co",
        "https://admin.fluxionia.co",
        "https://api.fluxionia.co"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-Tenant-ID"],
)

# Registrar routers
app.include_router(pedidos_sugeridos_router)
app.include_router(generadores_trafico_router)
app.include_router(config_inventario_router)
app.include_router(pedidos_inter_cedi_router)
app.include_router(emergencias_router)
# app.include_router(conjuntos_router)  # TODO: Uncomment when router is ready

# ============================================================================
# CACHE CONFIGURATION
# ============================================================================
# Simple TTL cache for expensive queries
# Format: {"data": [...], "timestamp": float}
_ventas_summary_cache: Dict[str, Any] = {}
VENTAS_SUMMARY_CACHE_TTL = 300  # 5 minutes in seconds

def get_cached_ventas_summary() -> Optional[List[Any]]:
    """Returns cached data if valid, None otherwise"""
    if "data" in _ventas_summary_cache:
        if time.time() - _ventas_summary_cache.get("timestamp", 0) < VENTAS_SUMMARY_CACHE_TTL:
            logger.info("📦 Ventas summary served from cache")
            return _ventas_summary_cache["data"]
    return None

def set_ventas_summary_cache(data: List[Any]) -> None:
    """Store data in cache with current timestamp"""
    _ventas_summary_cache["data"] = data
    _ventas_summary_cache["timestamp"] = time.time()
    logger.info("💾 Ventas summary cached for 5 minutes")

# Global Exception Handler con CORS
@app.middleware("http")
async def cors_exception_handler(request: Request, call_next):
    """
    Middleware que garantiza que CORS headers estén presentes incluso en errores
    """
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        # Log error
        logger.error(f"Unhandled exception: {e}", exc_info=True)

        # Import JSONResponse aquí para evitar circular imports
        from fastapi.responses import JSONResponse

        # Crear response de error con CORS headers
        origin = request.headers.get("origin")

        # Lista de origins permitidos (debe coincidir con CORSMiddleware)
        allowed_origins = [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:5173",
            "https://d20a0g9yxinot2.cloudfront.net",
            "https://d3jghnkvt6d1is.cloudfront.net",
            "https://dynsftz61igf5.cloudfront.net",
            "http://fluxion-alb-433331665.us-east-1.elb.amazonaws.com",
            "http://fluxion-alb-1002393067.us-east-1.elb.amazonaws.com",
            "http://fluxion-frontend-611395766952.s3-website-us-east-1.amazonaws.com",
            "https://fluxionia.co",
            "https://www.fluxionia.co",
            "https://granja.fluxionia.co",
            "https://admin.fluxionia.co",
            "https://api.fluxionia.co"
        ]

        response = JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {str(e)}"}
        )

        # Agregar CORS headers si el origin está permitido
        if origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, X-Tenant-ID"

        return response

# Tenant Middleware - Detecta tenant desde hostname o header
@app.middleware("http")
async def tenant_middleware(request: Request, call_next):
    """
    Middleware que extrae el tenant_id del request y lo agrega al estado
    """
    tenant_id = TenantMiddleware.extract_tenant(request)
    request.state.tenant_id = tenant_id

    # Log tenant detection (solo en desarrollo)
    if os.getenv("ENVIRONMENT") != "production":
        logger.info(f"🏢 Request for tenant: {tenant_id or 'default (granja)'} - Path: {request.url.path}")

    response = await call_next(request)
    return response

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """
    Agrega headers de seguridad a todas las respuestas
    """
    response = await call_next(request)

    # Prevenir MIME sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"

    # Protección contra clickjacking
    response.headers["X-Frame-Options"] = "DENY"

    # Protección XSS (legacy, pero no hace daño)
    response.headers["X-XSS-Protection"] = "1; mode=block"

    # Referrer policy (no enviar info sensible en referer)
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    # Permissions Policy (deshabilitar features innecesarias)
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

    # HSTS solo si es HTTPS (CloudFront lo maneja, pero por si acaso)
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response

# Importar utilidades de base de datos
from db_manager import get_db_connection, get_db_connection_write, execute_query_dict, get_postgres_connection
# from database import DB_PATH  # DEPRECADO: ya no usamos DuckDB

# Modelos Pydantic
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

class ProductoResponse(BaseModel):
    id: str
    codigo: str
    descripcion: str
    categoria: str
    marca: Optional[str]
    presentacion: Optional[str]
    precio_venta: Optional[float]
    costo_promedio: Optional[float]
    activo: bool

class StockResponse(BaseModel):
    ubicacion_id: str
    ubicacion_nombre: str
    ubicacion_tipo: str
    producto_id: str
    codigo_producto: str
    codigo_barras: Optional[str]
    descripcion_producto: str
    categoria: str
    marca: Optional[str]
    stock_actual: Optional[float]
    stock_minimo: Optional[float]
    stock_maximo: Optional[float]
    punto_reorden: Optional[float]
    precio_venta: Optional[float]
    cantidad_bultos: Optional[float]
    estado_stock: str
    dias_cobertura_actual: Optional[float]
    es_producto_estrella: bool
    fecha_extraccion: Optional[str]  # Fecha de última actualización
    peso_producto_kg: Optional[float]  # Peso unitario en kilogramos
    peso_total_kg: Optional[float]  # Peso total del stock en kilogramos
    # Nuevos campos para análisis de inventario
    demanda_p75: Optional[float] = None  # Demanda diaria P75 (últimos 20 días)
    ventas_60d: Optional[float] = None  # Ventas acumuladas últimos 60 días
    estado_criticidad: Optional[str] = None  # CRITICO, URGENTE, OPTIMO, EXCESO, SIN_DEMANDA
    clasificacion_producto: Optional[str] = None  # FANTASMA, ANOMALIA, DORMIDO, ACTIVO
    clase_abc: Optional[str] = None  # A, B, C, SIN_VENTAS
    rank_ventas: Optional[int] = None  # Posición por ventas en la tienda
    velocidad_venta: Optional[str] = None  # SIN_VENTAS, BAJA, MEDIA, ALTA, MUY_ALTA

class PaginationMetadata(BaseModel):
    total_items: int
    total_pages: int
    current_page: int
    page_size: int
    has_next: bool
    has_previous: bool
    stock_cero: Optional[int] = 0  # Productos con stock en cero
    stock_negativo: Optional[int] = 0  # Productos con stock negativo
    # Estadísticas de criticidad
    criticos: Optional[int] = 0  # Productos con estado CRITICO
    urgentes: Optional[int] = 0  # Productos con estado URGENTE
    # Estadísticas de clasificación producto
    fantasmas: Optional[int] = 0  # Sin stock y sin ventas 30d
    anomalias: Optional[int] = 0  # Sin stock pero con ventas
    dormidos: Optional[int] = 0  # Con stock pero sin ventas 14d
    activos: Optional[int] = 0  # Con stock y ventas

class PaginatedStockResponse(BaseModel):
    data: List[StockResponse]
    pagination: PaginationMetadata

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


# ============================================================================
# MODELOS PARA CENTRO DE COMANDO DE CORRECCIÓN
# ============================================================================

class EvidenciaVenta(BaseModel):
    """Una venta como evidencia de anomalía"""
    numero_factura: str
    fecha_venta: str
    cantidad_vendida: float
    hora: str  # Solo la hora para mostrar
    stock_al_momento: Optional[float] = None  # Stock en el snapshot más cercano a la venta


class AnomaliaStockItem(BaseModel):
    """Producto con anomalía de stock detectada"""
    producto_id: str
    codigo_producto: str
    descripcion_producto: str
    categoria: Optional[str]
    stock_actual: float
    tipo_anomalia: str  # "negativo" | "venta_zombie"
    prioridad: int  # 1 = alta (negativo), 2 = media (venta zombie)
    # Evidencia: lista de ventas recientes
    total_ventas_evidencia: int
    suma_cantidad_vendida: float
    evidencias: List[EvidenciaVenta]  # Lista de facturas como evidencia
    # Histórico del día (para análisis)
    stock_max_hoy: Optional[float] = None  # Máximo stock durante el día
    stock_min_hoy: Optional[float] = None  # Mínimo stock durante el día
    snapshots_hoy: Optional[int] = None  # Número de snapshots del día


class AnomaliaStockResponse(BaseModel):
    """Respuesta con lista de anomalías de stock (productos con stock negativo)"""
    ubicacion_id: str
    ubicacion_nombre: str
    total_anomalias: int
    items: List[AnomaliaStockItem]


class AjusteAuditoriaItem(BaseModel):
    """Item individual de ajuste de auditoría"""
    producto_id: str
    conteo_fisico: float  # Lo que el usuario contó


class AjusteAuditoriaRequest(BaseModel):
    """Request para aplicar ajustes de auditoría"""
    ubicacion_id: str
    almacen_codigo: Optional[str] = None
    ajustes: List[AjusteAuditoriaItem]
    observaciones: Optional[str] = None


class AjusteAuditoriaResultItem(BaseModel):
    """Resultado de un ajuste individual"""
    producto_id: str
    stock_anterior: float
    conteo_fisico: float
    diferencia: float
    ajuste_aplicado: bool
    mensaje: Optional[str] = None


class AjusteAuditoriaResponse(BaseModel):
    """Respuesta después de aplicar ajustes"""
    success: bool
    ubicacion_id: str
    total_procesados: int
    total_ajustados: int
    resultados: List[AjusteAuditoriaResultItem]


# ============================================================================
# Modelos para Detección de Agotados Visuales (Zero Sales Scan)
# ============================================================================

class UltimaVentaInfo(BaseModel):
    """Información de la última venta de un producto"""
    numero_factura: str
    fecha_venta: str
    hora: str
    cantidad_vendida: float


class AgotadoVisualItem(BaseModel):
    """Producto detectado como posible agotado visual"""
    producto_id: str
    codigo_producto: str
    descripcion_producto: str
    categoria: Optional[str]
    stock_actual: float
    # Métricas de velocidad de venta
    ventas_ultimas_2_semanas: int
    promedio_horas_entre_ventas: float  # Velocidad histórica
    horas_sin_vender: float  # Tiempo actual sin ventas
    factor_alerta: float  # horas_sin_vender / promedio_horas_entre_ventas
    # Última venta registrada
    ultima_venta: Optional[UltimaVentaInfo]
    # Prioridad (más alto = más urgente)
    prioridad: int  # 1 = crítico (>4x), 2 = alto (>3x), 3 = medio (>2x)


class AgotadoVisualResponse(BaseModel):
    """Respuesta con lista de posibles agotados visuales"""
    ubicacion_id: str
    ubicacion_nombre: str
    fecha_analisis: str
    total_alertas: int
    alertas_criticas: int  # >4x
    alertas_altas: int  # >3x
    alertas_medias: int  # >2x
    items: List[AgotadoVisualItem]
    # Info de horarios de operación
    hora_apertura: Optional[str] = None
    hora_cierre: Optional[str] = None
    tienda_abierta: bool = True
    horas_operacion_diarias: float = 14.0


# ============================================================================
# Modelos para Análisis de Ventas Perdidas por Agotados
# ============================================================================

class VentaPerdidaItemV2(BaseModel):
    """Producto con venta perdida - Criterio V2: Comparación por slot día/hora"""
    producto_id: str
    codigo_producto: str
    descripcion_producto: str
    categoria: Optional[str]
    # Contexto temporal
    slot_actual: str  # Ej: "10am-12pm"
    dia_semana: str  # Ej: "Lunes"
    # Comparación con histórico
    ventas_slot_actual: float  # Unidades vendidas en este slot
    promedio_historico: float  # Promedio mismo día/slot últimas 8 semanas
    semanas_con_datos: int  # Cuántas semanas de histórico tenemos
    # Cálculo de pérdida
    porcentaje_vendido: float  # ventas_slot_actual / promedio_historico * 100
    unidades_perdidas: float  # promedio_historico - ventas_slot_actual
    precio_unitario_promedio: float
    venta_perdida_usd: float
    # Nivel de alerta
    nivel_alerta: str  # "critico", "alto", "medio"
    # Info adicional
    stock_actual: float


class VentaPerdidaPorCategoria(BaseModel):
    """Resumen de ventas perdidas por categoría"""
    categoria: str
    total_venta_perdida_usd: float
    total_incidentes: int
    porcentaje_del_total: float


class VentasPerdidasResponseV2(BaseModel):
    """Respuesta del análisis de ventas perdidas - V2 con slots"""
    ubicacion_id: str
    ubicacion_nombre: str
    # Contexto temporal
    slot_analizado: str  # Ej: "10am-12pm"
    dia_semana: str  # Ej: "Lunes"
    fecha_analisis: str
    semanas_historico: int  # Semanas usadas para comparación
    # KPIs principales
    total_venta_perdida_usd: float
    total_incidentes: int
    incidentes_criticos: int
    incidentes_altos: int
    incidentes_medios: int
    producto_mayor_perdida: Optional[str]
    producto_mayor_perdida_valor: float
    # Lista de items detallados
    items: List[VentaPerdidaItemV2]
    # Agregaciones para gráficos
    por_categoria: List[VentaPerdidaPorCategoria]
    top_productos: List[VentaPerdidaItemV2]  # Top 10


# ============================================================================
# MODELOS PARA HISTORIAL VENTAS + INVENTARIO (ProductoDetalleModal)
# ============================================================================

class HistorialDataPoint(BaseModel):
    """Punto de dato en el historial combinado ventas+inventario"""
    fecha: str  # ISO format: YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss
    timestamp: int  # Unix timestamp para ordenamiento
    ventas: float  # Unidades vendidas en este período
    inventario: Optional[float]  # Stock al momento en unidades (puede ser null si no hay snapshot)
    inventario_bultos: Optional[float] = None  # Stock al momento en bultos
    es_estimado: bool = False  # True si el inventario fue interpolado


class DiagnosticoVentaPerdida(BaseModel):
    """Diagnóstico automático de por qué se perdieron ventas"""
    tipo: str  # "ruptura_stock", "falta_exhibicion", "baja_demanda", "sin_diagnostico"
    confianza: float  # 0-100%
    descripcion: str
    evidencia: List[str]  # Lista de evidencias que soportan el diagnóstico


class HistorialProductoResponse(BaseModel):
    """Respuesta del historial combinado ventas+inventario de un producto"""
    producto_id: str
    codigo_producto: str
    descripcion_producto: str
    categoria: Optional[str]
    ubicacion_id: str
    ubicacion_nombre: str
    # Rango de datos
    fecha_inicio: str
    fecha_fin: str
    granularidad: str  # "diario" o "horario"
    # Serie temporal combinada
    datos: List[HistorialDataPoint]
    # Estadísticas resumen
    total_ventas_periodo: float
    promedio_diario_ventas: float
    stock_promedio: float
    stock_actual: float
    dias_con_stock_cero: int
    # Info del producto para conversión
    unidades_por_bulto: float = 1.0  # Para convertir unidades a bultos
    # Diagnóstico (si aplica)
    diagnostico: Optional[DiagnosticoVentaPerdida] = None


# ============================================================================
# MODELOS V3: Ventas Perdidas con Rango de Fechas Configurable
# ============================================================================

class VentaPerdidaItemV3(BaseModel):
    """Producto con venta perdida - V3: Análisis por rango de fechas"""
    producto_id: str
    codigo_producto: str
    descripcion_producto: str
    categoria: Optional[str]
    # Ventas en el período analizado
    ventas_periodo: float  # Unidades vendidas en el período seleccionado
    dias_con_ventas: int  # Días que tuvo al menos 1 venta
    dias_analizados: int  # Total de días en el período
    promedio_diario_periodo: float  # ventas_periodo / dias_analizados
    # Comparación con histórico
    promedio_diario_historico: float  # Promedio diario de los últimos N días previos
    dias_historico: int  # Días usados para calcular el histórico
    # Cálculo de pérdida
    porcentaje_vs_historico: float  # (promedio_diario_periodo / promedio_diario_historico) * 100
    unidades_perdidas_diarias: float  # promedio_diario_historico - promedio_diario_periodo
    unidades_perdidas_total: float  # unidades_perdidas_diarias * dias_analizados
    precio_unitario_promedio: float
    venta_perdida_usd: float
    # Nivel de alerta
    nivel_alerta: str  # "critico", "alto", "medio"
    # Info adicional
    stock_actual: float
    dias_stock_cero: int  # Días con stock en 0 durante el período


class VentasPerdidasResponseV3(BaseModel):
    """Respuesta del análisis de ventas perdidas - V3 con rango de fechas"""
    ubicacion_id: str
    ubicacion_nombre: str
    # Período analizado
    fecha_inicio: str
    fecha_fin: str
    dias_analizados: int
    # Período de referencia (histórico)
    dias_historico: int
    # KPIs principales
    total_venta_perdida_usd: float
    total_incidentes: int
    incidentes_criticos: int
    incidentes_altos: int
    incidentes_medios: int
    producto_mayor_perdida: Optional[str]
    producto_mayor_perdida_valor: float
    # Lista de items detallados
    items: List[VentaPerdidaItemV3]
    # Agregaciones para gráficos
    por_categoria: List[VentaPerdidaPorCategoria]
    top_productos: List[VentaPerdidaItemV3]  # Top 10


# Mantener modelos antiguos para compatibilidad
class VentaPerdidaItem(BaseModel):
    """Producto con venta perdida estimada por agotado (V1 - deprecado)"""
    producto_id: str
    codigo_producto: str
    descripcion_producto: str
    categoria: Optional[str]
    horas_sin_vender: float
    promedio_horas_entre_ventas: float
    factor_alerta: float
    prioridad: int
    unidades_perdidas_estimadas: float
    precio_unitario_promedio: float
    venta_perdida_usd: float
    ultima_venta_fecha: Optional[str]
    ultima_venta_hora: Optional[str]
    stock_actual: float


class VentasPerdidasResponse(BaseModel):
    """Respuesta del análisis de ventas perdidas (V1 - deprecado)"""
    ubicacion_id: str
    ubicacion_nombre: str
    fecha_inicio: str
    fecha_fin: str
    fecha_analisis: str
    total_venta_perdida_usd: float
    total_incidentes: int
    producto_mayor_perdida: Optional[str]
    producto_mayor_perdida_valor: float
    items: List[VentaPerdidaItem]
    por_categoria: List[VentaPerdidaPorCategoria]
    top_productos: List[VentaPerdidaItem]


class AlmacenesUbicacionResponse(BaseModel):
    """Lista de almacenes para una ubicación KLK"""
    ubicacion_id: str
    ubicacion_nombre: str
    sistema_pos: str
    almacenes: List[AlmacenKLKResponse]


class DashboardMetrics(BaseModel):
    total_ubicaciones: int
    total_productos: int
    total_configuraciones: int
    valor_inventario_total: float
    productos_stock_critico: int
    productos_stock_bajo: int
    productos_normal: int
    productos_exceso: int

class CategoryMetrics(BaseModel):
    categoria: str
    productos_count: int
    stock_critico: int
    stock_bajo: int
    stock_normal: int
    stock_exceso: int
    valor_total: float

class VentasSummaryResponse(BaseModel):
    ubicacion_id: str
    ubicacion_nombre: str
    tipo_ubicacion: str
    total_transacciones: int
    productos_unicos: int
    unidades_vendidas: int
    primera_venta: Optional[str]
    ultima_venta: Optional[str]

class VentasDetailResponse(BaseModel):
    codigo_producto: str
    descripcion_producto: str
    categoria: str
    cantidad_total: float
    promedio_diario: float
    promedio_mismo_dia_semana: float
    comparacion_ano_anterior: Optional[float]
    porcentaje_total: float
    cantidad_bultos: Optional[float]  # Unidades por bulto
    total_bultos: Optional[float]  # Total vendido en bultos
    promedio_bultos_diario: Optional[float]  # Promedio diario en bultos

class PaginatedVentasResponse(BaseModel):
    data: List[VentasDetailResponse]
    pagination: PaginationMetadata

# Modelos para Pedidos Sugeridos
class CalcularPedidoRequest(BaseModel):
    cedi_origen: str
    tienda_destino: str
    dias_cobertura: int = 3
    filtros: Optional[Dict[str, Any]] = None

class ProductoPedidoSugerido(BaseModel):
    # Producto
    codigo_producto: str
    codigo_barras: Optional[str]
    descripcion_producto: str
    categoria: str
    grupo: Optional[str]
    subgrupo: Optional[str]
    marca: Optional[str]
    presentacion: Optional[str]
    cantidad_bultos: float
    peso_unidad: float  # Peso por unidad en gramos
    cuadrante_producto: Optional[str]

    # Ventas (unidades y bultos)
    prom_ventas_5dias_unid: float
    prom_ventas_20dias_unid: float
    prom_mismo_dia_unid: float
    prom_ventas_8sem_unid: float
    prom_ventas_8sem_bultos: float
    prom_ventas_3dias_unid: float
    prom_ventas_3dias_bultos: float
    prom_mismo_dia_bultos: float
    pronostico_3dias_unid: float
    pronostico_3dias_bultos: float

    # Inventario
    stock_tienda: float
    stock_en_transito: float
    stock_total: float
    stock_total_bultos: float
    stock_dias_cobertura: float
    stock_cedi_seco: float
    stock_cedi_frio: float
    stock_cedi_verde: float
    stock_cedi_origen: float  # Stock del CEDI seleccionado

    # Configuración
    clasificacion_abc: Optional[str]
    stock_minimo: float
    stock_maximo: float
    stock_seguridad: float
    punto_reorden: float

    # Cálculo pedido
    cantidad_sugerida_unid: float
    cantidad_sugerida_bultos: float
    cantidad_ajustada_bultos: int
    razon_pedido: str

class PedidoSugeridoResponse(BaseModel):
    id: str
    numero_pedido: str
    cedi_origen_id: str
    cedi_origen_nombre: str
    tienda_destino_id: str
    tienda_destino_nombre: str
    estado: str
    total_productos: int
    total_bultos: float
    total_unidades: float
    dias_cobertura: int
    fecha_creacion: str

# Endpoints de la API

@app.get("/", tags=["Health"])
async def health_check():
    """Endpoint de salud de la API"""
    return {
        "status": "OK",
        "service": "Fluxion AI - La Granja Mercado API",
        "timestamp": datetime.now().isoformat(),
        "database": "PostgreSQL"
    }

@app.get("/maintenance-status", tags=["Health"])
async def get_maintenance_status():
    """
    Verifica si el sistema está en ventana de mantenimiento
    Ventana: 1:00 AM - 6:00 AM (Venezuela Time UTC-4)
    """
    # Obtener hora actual en Venezuela (UTC-4)
    venezuela_tz = ZoneInfo("America/Caracas")
    now_venezuela = datetime.now(venezuela_tz)

    current_hour = now_venezuela.hour
    current_minute = now_venezuela.minute

    # Ventana de mantenimiento: 1:00 AM - 6:00 AM
    MAINTENANCE_START_HOUR = 1
    MAINTENANCE_END_HOUR = 6

    is_maintenance = (
        current_hour >= MAINTENANCE_START_HOUR and
        current_hour < MAINTENANCE_END_HOUR
    )

    # Calcular tiempo restante si está en mantenimiento
    minutes_remaining = None
    if is_maintenance:
        # Minutos hasta las 6:00 AM
        minutes_until_6am = (MAINTENANCE_END_HOUR - current_hour) * 60 - current_minute
        minutes_remaining = minutes_until_6am

    return {
        "is_maintenance": is_maintenance,
        "current_time": now_venezuela.strftime("%H:%M:%S"),
        "maintenance_window": "1:00 AM - 6:00 AM",
        "timezone": "America/Caracas (UTC-4)",
        "estimated_end_time": "6:00 AM",
        "minutes_remaining": minutes_remaining,
        "message": "Estamos recolectando la data. Sistema disponible después de las 6:00 AM" if is_maintenance else "Sistema operativo"
    }

@app.get("/test-sentry", tags=["Health"])
async def test_sentry():
    """
    Endpoint de prueba para verificar integración de Sentry
    SOLO PARA DESARROLLO - Remover en producción
    """
    import sentry_sdk

    # Enviar un mensaje de prueba
    sentry_sdk.capture_message("Test message from Fluxion Backend API endpoint")

    # Generar un error de prueba (comentado por defecto)
    # raise HTTPException(status_code=500, detail="Error de prueba para Sentry")

    return {
        "status": "OK",
        "message": "Sentry test message sent",
        "tip": "Descomentar la línea 390 para probar captura de errores"
    }

# =====================================================================================
# ENDPOINTS DE AUTENTICACIÓN
# =====================================================================================

@app.post("/api/auth/login", response_model=TokenResponse, tags=["Autenticación"])
async def login(request: LoginRequest):
    """
    Endpoint de login
    Recibe username y password, retorna JWT token
    """
    # Autenticar usuario
    user = authenticate_user(request.username, request.password)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Usuario o contraseña incorrectos"
        )

    # Crear token JWT
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        username=user.username,
        nombre_completo=user.nombre_completo
    )

@app.get("/api/auth/me", response_model=Usuario, tags=["Autenticación"])
async def get_current_user(current_user: Usuario = Depends(verify_token)):
    """
    Obtiene información del usuario autenticado actual
    Requiere token JWT válido
    """
    return current_user

@app.post("/api/auth/logout", tags=["Autenticación"])
async def logout():
    """
    Endpoint de logout (solo para consistencia de API)
    El token se invalida en el cliente
    """
    return {"message": "Logout exitoso"}

@app.post("/api/auth/register", response_model=Usuario, tags=["Autenticación"])
async def register(request: CreateUserRequest, current_user: Usuario = Depends(verify_token)):
    """
    Crea un nuevo usuario (requiere autenticación)
    Solo usuarios autenticados pueden crear nuevos usuarios
    """
    new_user = create_user(
        username=request.username,
        password=request.password,
        nombre_completo=request.nombre_completo,
        email=request.email
    )

    logger.info(f"Usuario '{new_user.username}' creado por '{current_user.username}'")
    return new_user

# =====================================================================================
# ENDPOINTS DE DATOS (PROTEGIDOS)
# =====================================================================================

@app.get("/api/ubicaciones", response_model=List[UbicacionResponse], tags=["Ubicaciones"])
async def get_ubicaciones(
    tipo: Optional[str] = None,
    visible_pedidos: Optional[bool] = None
):
    """
    Obtiene todas las ubicaciones (tiendas y CEDIs) desde la base de datos

    Query params:
    - tipo: Filtrar por tipo ('tienda' | 'cedi')
    - visible_pedidos: Filtrar por visibilidad en pedidos sugeridos
    """
    try:
        # PostgreSQL v2.0: Simplified flat table with minimal schema
        # Available columns: id, nombre, codigo_klk, ciudad, direccion, activo, fecha_creacion
        # Note: 'estado' column may not exist in all deployments
        query = "SELECT id, nombre, codigo_klk, ciudad, activo FROM ubicaciones WHERE activo = true"

        # tipo filter not supported in PostgreSQL v2.0 (all are tiendas by default)
        # visible_pedidos filter not supported (no config column)

        # Execute query using db_manager
        ubicaciones_data = execute_query_dict(query)

        ubicaciones = []
        for row in ubicaciones_data:
            ubicaciones.append(UbicacionResponse(
                id=row['id'],
                codigo=row.get('codigo_klk') or row['id'],  # Use codigo_klk or fallback to id (handles None)
                nombre=row['nombre'],
                tipo='tienda',  # Default to 'tienda' (all locations are stores in v2.0)
                region=None,  # Not in PostgreSQL v2.0
                ciudad=row.get('ciudad'),
                superficie_m2=None,  # Not in PostgreSQL v2.0
                activo=row['activo'],
                visible_pedidos=True,  # Default to True (all visible in v2.0)
                sistema_pos='stellar'  # Default to 'stellar'
            ))

        # Sort by nombre (tipo is always 'tienda' in v2.0)
        ubicaciones.sort(key=lambda u: u.nombre)

        return ubicaciones

    except Exception as e:
        logger.error(f"Error obteniendo ubicaciones: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/ubicaciones/summary", response_model=List[UbicacionSummaryResponse], tags=["Ubicaciones"])
async def get_ubicaciones_summary():
    """
    Obtiene un resumen de inventario por ubicación (Stellar + KLK)

    Migrado a PostgreSQL v2.0: Tablas stock_actual e inventario_raw son INDEPENDIENTES.
    No se hace JOIN con ubicaciones - los nombres vienen directamente de cada tabla.
    """
    try:
        with get_db_connection() as conn:
            # Importar tiendas_config para saber qué tiendas usan KLK
            import sys
            from pathlib import Path
            etl_core_path = Path(__file__).parent.parent / 'etl' / 'core'
            if str(etl_core_path) not in sys.path:
                sys.path.insert(0, str(etl_core_path))

            from tiendas_config import get_tiendas_klk, ALMACENES_KLK
            tiendas_klk_ids = list(get_tiendas_klk().keys())

            # Construir mapeo de código de almacén -> nombre
            almacen_nombres = {}
            for tienda_id, almacenes in ALMACENES_KLK.items():
                for alm in almacenes:
                    almacen_nombres[alm.codigo] = alm.nombre

            # Mapeo simple ubicacion_id -> nombre para tiendas KLK
            ubicacion_nombres_klk = {}
            for tienda_id in tiendas_klk_ids:
                if tienda_id.startswith('tienda_'):
                    num = int(tienda_id.replace('tienda_', ''))
                    ubicacion_nombres_klk[tienda_id] = f"Tienda {num:02d}"
                elif tienda_id.startswith('cedi_'):
                    tipo = tienda_id.replace('cedi_', '').title()
                    ubicacion_nombres_klk[tienda_id] = f"CEDI {tipo}"
                else:
                    ubicacion_nombres_klk[tienda_id] = tienda_id

            # Query: Resumen de inventario por ubicación y almacén
            query = """
                SELECT
                    ia.ubicacion_id,
                    u.nombre as ubicacion_nombre,
                    'tienda' as tipo_ubicacion,
                    COUNT(DISTINCT ia.producto_id) as total_productos,
                    SUM(CASE WHEN ia.cantidad = 0 THEN 1 ELSE 0 END) as stock_cero,
                    SUM(CASE WHEN ia.cantidad < 0 THEN 1 ELSE 0 END) as stock_negativo,
                    TO_CHAR(MAX(ia.fecha_actualizacion), 'YYYY-MM-DD HH24:MI:SS') as ultima_actualizacion,
                    ia.almacen_codigo
                FROM inventario_actual ia
                LEFT JOIN ubicaciones u ON ia.ubicacion_id = u.id
                GROUP BY ia.ubicacion_id, u.nombre, ia.almacen_codigo
                ORDER BY ia.ubicacion_id, ia.almacen_codigo
            """

            # Ejecutar query
            cursor = conn.cursor()
            cursor.execute(query)
            result = cursor.fetchall()
            cursor.close()

            summary = []
            for row in result:
                ubicacion_id = row[0]
                ubicacion_nombre = row[1]
                almacen_codigo = row[7]
                almacen_nombre = almacen_nombres.get(almacen_codigo) if almacen_codigo else None

                # Para tiendas KLK, reemplazar ubicacion_id con nombre legible
                if ubicacion_id in ubicacion_nombres_klk:
                    ubicacion_nombre = ubicacion_nombres_klk[ubicacion_id]

                summary.append(UbicacionSummaryResponse(
                    ubicacion_id=ubicacion_id,
                    ubicacion_nombre=ubicacion_nombre,
                    tipo_ubicacion=row[2],
                    total_productos=row[3],
                    stock_cero=row[4],
                    stock_negativo=row[5],
                    ultima_actualizacion=row[6],
                    almacen_codigo=almacen_codigo,
                    almacen_nombre=almacen_nombre
                ))

            return summary

    except Exception as e:
        logger.error(f"Error obteniendo resumen de ubicaciones: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/ubicaciones/summary-regional", response_model=List[RegionSummary], tags=["Ubicaciones"])
async def get_ubicaciones_summary_regional():
    """
    Obtiene resumen de inventario agrupado por región (CARACAS / VALENCIA).

    Métricas por ubicación:
    - Fill Rate: % SKUs con stock > 0 (excluyendo fantasmas)
    - Días de cobertura promedio por clase ABC
    - Riesgo de quiebre: SKUs con < 1 día de cobertura
    - Stock cero y negativo
    """
    try:
        with get_db_connection() as conn:
            # Importar configuración de almacenes KLK
            import sys
            from pathlib import Path
            etl_core_path = Path(__file__).parent.parent / 'etl' / 'core'
            if str(etl_core_path) not in sys.path:
                sys.path.insert(0, str(etl_core_path))

            from tiendas_config import ALMACENES_KLK

            # Construir mapeo de código de almacén -> nombre
            almacen_nombres = {}
            for tienda_id, almacenes in ALMACENES_KLK.items():
                for alm in almacenes:
                    almacen_nombres[alm.codigo] = alm.nombre

            cursor = conn.cursor()

            # Query principal con métricas por ubicación y almacén
            # Calcula métricas usando inventario_actual, productos_abc_tienda, y ventas
            query = """
                WITH ubicacion_data AS (
                    SELECT
                        u.id as ubicacion_id,
                        u.nombre as ubicacion_nombre,
                        u.tipo,
                        COALESCE(u.region, 'VALENCIA') as region,
                        ia.almacen_codigo,
                        COUNT(DISTINCT ia.producto_id) as total_skus,
                        SUM(CASE WHEN ia.cantidad > 0 THEN 1 ELSE 0 END) as skus_con_stock,
                        SUM(CASE WHEN ia.cantidad = 0 THEN 1 ELSE 0 END) as stock_cero,
                        SUM(CASE WHEN ia.cantidad < 0 THEN 1 ELSE 0 END) as stock_negativo,
                        TO_CHAR(MAX(ia.fecha_actualizacion), 'YYYY-MM-DD HH24:MI:SS') as ultima_actualizacion
                    FROM inventario_actual ia
                    JOIN ubicaciones u ON ia.ubicacion_id = u.id
                    GROUP BY u.id, u.nombre, u.tipo, u.region, ia.almacen_codigo
                ),
                -- Ventas diarias últimos 20 días para calcular P75
                -- NOTA: Para tienda_18 (PARAÍSO) se excluye 2025-12-06 (inauguración con ventas atípicas)
                ventas_20d AS (
                    SELECT
                        ubicacion_id,
                        producto_id,
                        DATE(fecha_venta) as fecha,
                        SUM(cantidad_vendida) as total_dia
                    FROM ventas
                    WHERE fecha_venta >= CURRENT_DATE - INTERVAL '20 days'
                      AND fecha_venta < CURRENT_DATE
                      AND NOT (ubicacion_id = 'tienda_18' AND DATE(fecha_venta) = '2025-12-06')
                    GROUP BY ubicacion_id, producto_id, DATE(fecha_venta)
                ),
                demanda_p75 AS (
                    SELECT
                        ubicacion_id,
                        producto_id,
                        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_dia) as p75
                    FROM ventas_20d
                    GROUP BY ubicacion_id, producto_id
                ),
                -- Combinar stock con demanda y ABC
                stock_con_demanda AS (
                    SELECT
                        ia.ubicacion_id,
                        ia.almacen_codigo,
                        ia.producto_id,
                        ia.cantidad as stock_actual,
                        COALESCE(dp.p75, 0) as demanda_p75,
                        COALESCE(abc.clase_abc, 'SIN_VENTAS') as clase_abc,
                        -- Días cobertura
                        CASE WHEN COALESCE(dp.p75, 0) > 0 THEN
                            ia.cantidad / dp.p75
                        ELSE NULL END as dias_cobertura
                    FROM inventario_actual ia
                    LEFT JOIN demanda_p75 dp ON dp.ubicacion_id = ia.ubicacion_id
                        AND dp.producto_id = ia.producto_id
                    LEFT JOIN productos_abc_tienda abc ON abc.ubicacion_id = ia.ubicacion_id
                        AND abc.producto_id = ia.producto_id
                ),
                -- Métricas ABC agregadas por ubicación
                abc_metrics AS (
                    SELECT
                        ubicacion_id,
                        almacen_codigo,
                        -- Días cobertura promedio por clase (excluyendo NULL y valores extremos)
                        AVG(CASE WHEN clase_abc = 'A' AND dias_cobertura IS NOT NULL AND dias_cobertura BETWEEN 0 AND 365 THEN dias_cobertura END) as dias_cobertura_a,
                        AVG(CASE WHEN clase_abc = 'B' AND dias_cobertura IS NOT NULL AND dias_cobertura BETWEEN 0 AND 365 THEN dias_cobertura END) as dias_cobertura_b,
                        AVG(CASE WHEN clase_abc = 'C' AND dias_cobertura IS NOT NULL AND dias_cobertura BETWEEN 0 AND 365 THEN dias_cobertura END) as dias_cobertura_c,
                        -- Riesgo de quiebre: productos ABC con stock > 0, demanda > 0, y < 1 día cobertura
                        SUM(CASE
                            WHEN stock_actual > 0
                            AND demanda_p75 > 0
                            AND dias_cobertura < 1
                            AND clase_abc IN ('A', 'B', 'C')
                            THEN 1 ELSE 0
                        END) as riesgo_quiebre,
                        -- Fill rate: SKUs con stock / SKUs con demanda o stock (excluyendo fantasmas)
                        COUNT(CASE WHEN stock_actual > 0 THEN 1 END)::float /
                            NULLIF(COUNT(CASE WHEN demanda_p75 > 0 OR stock_actual > 0 THEN 1 END), 0) * 100 as fill_rate
                    FROM stock_con_demanda
                    GROUP BY ubicacion_id, almacen_codigo
                )
                SELECT
                    ud.region,
                    ud.ubicacion_id,
                    ud.ubicacion_nombre,
                    ud.tipo,
                    ud.almacen_codigo,
                    ud.total_skus,
                    ud.skus_con_stock,
                    ud.stock_cero,
                    ud.stock_negativo,
                    ud.ultima_actualizacion,
                    COALESCE(am.fill_rate, 0) as fill_rate,
                    am.dias_cobertura_a,
                    am.dias_cobertura_b,
                    am.dias_cobertura_c,
                    COALESCE(am.riesgo_quiebre, 0) as riesgo_quiebre
                FROM ubicacion_data ud
                LEFT JOIN abc_metrics am ON ud.ubicacion_id = am.ubicacion_id
                    AND COALESCE(ud.almacen_codigo, '') = COALESCE(am.almacen_codigo, '')
                ORDER BY ud.region, ud.tipo DESC, ud.ubicacion_nombre, ud.almacen_codigo
            """

            cursor.execute(query)
            rows = cursor.fetchall()
            cursor.close()

            # Agrupar por región
            regions_data: Dict[str, List[UbicacionRegionalDetail]] = {}

            for row in rows:
                region = row[0]
                ubicacion_id = row[1]
                almacen_codigo = row[4]

                if region not in regions_data:
                    regions_data[region] = []

                detail = UbicacionRegionalDetail(
                    ubicacion_id=ubicacion_id,
                    ubicacion_nombre=row[2],
                    tipo=row[3],
                    almacen_codigo=almacen_codigo,
                    almacen_nombre=almacen_nombres.get(almacen_codigo) if almacen_codigo else None,
                    total_skus=row[5] or 0,
                    skus_con_stock=row[6] or 0,
                    stock_cero=row[7] or 0,
                    stock_negativo=row[8] or 0,
                    ultima_actualizacion=row[9],
                    fill_rate=round(row[10] or 0, 1),
                    dias_cobertura_a=round(row[11], 1) if row[11] else None,
                    dias_cobertura_b=round(row[12], 1) if row[12] else None,
                    dias_cobertura_c=round(row[13], 1) if row[13] else None,
                    riesgo_quiebre=row[14] or 0
                )
                regions_data[region].append(detail)

            # Construir respuesta con agregados por región
            result = []
            for region, ubicaciones in regions_data.items():
                # Calcular agregados
                total_stock_cero = sum(u.stock_cero for u in ubicaciones)
                total_stock_negativo = sum(u.stock_negativo for u in ubicaciones)
                total_riesgo_quiebre = sum(u.riesgo_quiebre for u in ubicaciones)

                # Fill rate promedio ponderado por SKUs
                total_skus_con_stock = sum(u.skus_con_stock for u in ubicaciones)
                total_skus = sum(u.total_skus for u in ubicaciones)
                fill_rate_promedio = (total_skus_con_stock / total_skus * 100) if total_skus > 0 else 0

                # Días cobertura promedio por clase (promedio de promedios, excluyendo None)
                dias_a = [u.dias_cobertura_a for u in ubicaciones if u.dias_cobertura_a is not None]
                dias_b = [u.dias_cobertura_b for u in ubicaciones if u.dias_cobertura_b is not None]
                dias_c = [u.dias_cobertura_c for u in ubicaciones if u.dias_cobertura_c is not None]

                # SKUs únicos en la región (aproximación: suma de ubicaciones)
                # TODO: Query separada para contar SKUs únicos reales por región

                region_summary = RegionSummary(
                    region=region,
                    total_ubicaciones=len(set(u.ubicacion_id for u in ubicaciones)),
                    total_skus_unicos=total_skus,  # Aproximación
                    fill_rate_promedio=round(fill_rate_promedio, 1),
                    dias_cobertura_a=round(sum(dias_a) / len(dias_a), 1) if dias_a else None,
                    dias_cobertura_b=round(sum(dias_b) / len(dias_b), 1) if dias_b else None,
                    dias_cobertura_c=round(sum(dias_c) / len(dias_c), 1) if dias_c else None,
                    total_stock_cero=total_stock_cero,
                    total_stock_negativo=total_stock_negativo,
                    total_riesgo_quiebre=total_riesgo_quiebre,
                    ubicaciones=ubicaciones
                )
                result.append(region_summary)

            # Ordenar: VALENCIA primero (más ubicaciones), luego CARACAS
            result.sort(key=lambda r: (0 if r.region == 'VALENCIA' else 1, r.region))

            return result

    except Exception as e:
        logger.error(f"Error obteniendo resumen regional: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


# ============================================================================
# ANÁLISIS DE DISTRIBUCIÓN REGIONAL
# ============================================================================

class StockTiendaDetalle(BaseModel):
    """Detalle de stock y P75 de una tienda"""
    tienda_id: str
    tienda_nombre: str
    stock: float
    p75_diario: float


class OportunidadCediItem(BaseModel):
    """Producto con stock en CEDI pero bajo/sin stock en tiendas"""
    producto_id: str
    codigo: str
    descripcion: str
    categoria: str
    stock_cedi_unidades: float  # Stock en unidades
    stock_cedi_bultos: float    # Stock en bultos
    unidades_por_bulto: int
    clase_abc_predominante: str
    tiendas: List[StockTiendaDetalle]  # Detalle por tienda


class OportunidadesCediResponse(BaseModel):
    """Respuesta del análisis de oportunidades CEDI"""
    region: str
    cedi_id: str
    cedi_nombre: str
    umbral_stock_bajo: int
    total_oportunidades: int
    productos: List[OportunidadCediItem]


@app.get("/api/inventario/oportunidades-cedi", response_model=List[OportunidadesCediResponse], tags=["Análisis Distribución"])
async def get_oportunidades_cedi(
    region: Optional[str] = None,
    umbral_stock: int = 5,  # Stock <= este valor se considera "sin stock"
    min_stock_cedi: int = 10,  # Mínimo stock en CEDI para considerar (en unidades)
    limit: int = 50
):
    """
    Identifica productos con stock en CEDI pero bajo/sin stock en tiendas.
    Muestra stock CEDI en bultos y detalle por tienda con P75.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Construir filtro de región
            region_filter = "AND u.region = %(region)s" if region else ""

            # Query para obtener productos con stock en CEDI y al menos una tienda con stock bajo
            query = f"""
                WITH cedi_stock AS (
                    SELECT
                        ia.producto_id,
                        u.id as cedi_id,
                        u.nombre as cedi_nombre,
                        u.region,
                        SUM(ia.cantidad) as stock_cedi
                    FROM inventario_actual ia
                    JOIN ubicaciones u ON ia.ubicacion_id = u.id
                    WHERE u.tipo = 'cedi' AND ia.cantidad >= %(min_stock_cedi)s {region_filter}
                    GROUP BY ia.producto_id, u.id, u.nombre, u.region
                ),
                tiendas_con_bajo_stock AS (
                    SELECT
                        ia.producto_id,
                        u.region,
                        COUNT(*) FILTER (WHERE ia.cantidad <= %(umbral_stock)s) as tiendas_bajo
                    FROM inventario_actual ia
                    JOIN ubicaciones u ON ia.ubicacion_id = u.id
                    WHERE u.tipo = 'tienda' {region_filter}
                    GROUP BY ia.producto_id, u.region
                    HAVING COUNT(*) FILTER (WHERE ia.cantidad <= %(umbral_stock)s) > 0
                ),
                producto_abc AS (
                    SELECT
                        producto_id,
                        MODE() WITHIN GROUP (ORDER BY clase_abc) as clase_abc
                    FROM productos_abc_tienda
                    GROUP BY producto_id
                )
                SELECT
                    cs.producto_id,
                    COALESCE(p.codigo, cs.producto_id) as codigo,
                    COALESCE(p.descripcion, 'Sin descripción') as descripcion,
                    COALESCE(p.categoria, 'Sin categoría') as categoria,
                    cs.cedi_id,
                    cs.cedi_nombre,
                    cs.region,
                    cs.stock_cedi,
                    COALESCE(p.unidades_por_bulto, 1) as unidades_por_bulto,
                    COALESCE(pa.clase_abc, 'C') as clase_abc
                FROM cedi_stock cs
                JOIN tiendas_con_bajo_stock tb ON cs.producto_id = tb.producto_id AND cs.region = tb.region
                LEFT JOIN productos p ON cs.producto_id = p.id
                LEFT JOIN producto_abc pa ON cs.producto_id = pa.producto_id
                ORDER BY cs.stock_cedi DESC
                LIMIT %(query_limit)s
            """

            params = {
                'umbral_stock': umbral_stock,
                'min_stock_cedi': min_stock_cedi,
                'query_limit': limit
            }
            if region:
                params['region'] = region

            cursor.execute(query, params)
            productos_rows = cursor.fetchall()

            if not productos_rows:
                return []

            # Obtener IDs de productos para buscar detalle de tiendas
            producto_ids = [row[0] for row in productos_rows]

            # Query para obtener stock y venta diaria por tienda para estos productos
            tiendas_query = f"""
                SELECT
                    ia.producto_id,
                    ia.ubicacion_id as tienda_id,
                    u.nombre as tienda_nombre,
                    u.region,
                    ia.cantidad as stock,
                    COALESCE(abc.venta_30d / 30.0, 0) as venta_diaria
                FROM inventario_actual ia
                JOIN ubicaciones u ON ia.ubicacion_id = u.id
                LEFT JOIN productos_abc_tienda abc ON ia.producto_id = abc.producto_id AND ia.ubicacion_id = abc.ubicacion_id
                WHERE u.tipo = 'tienda' AND ia.producto_id = ANY(%(producto_ids)s) {region_filter}
                ORDER BY ia.producto_id, u.nombre
            """
            tiendas_params = {'producto_ids': producto_ids}
            if region:
                tiendas_params['region'] = region
            cursor.execute(tiendas_query, tiendas_params)
            tiendas_rows = cursor.fetchall()
            cursor.close()

            # Organizar datos de tiendas por producto y región
            tiendas_por_producto: Dict[str, Dict[str, List[StockTiendaDetalle]]] = {}
            for row in tiendas_rows:
                prod_id = row[0]
                region_tienda = row[3]
                if prod_id not in tiendas_por_producto:
                    tiendas_por_producto[prod_id] = {}
                if region_tienda not in tiendas_por_producto[prod_id]:
                    tiendas_por_producto[prod_id][region_tienda] = []
                tiendas_por_producto[prod_id][region_tienda].append(
                    StockTiendaDetalle(
                        tienda_id=row[1],
                        tienda_nombre=row[2],
                        stock=float(row[4] or 0),
                        p75_diario=float(row[5] or 0)
                    )
                )

            # Construir respuesta agrupada por CEDI
            cedis_data: Dict[str, OportunidadesCediResponse] = {}

            for row in productos_rows:
                prod_id = row[0]
                cedi_id = row[4]
                cedi_nombre = row[5]
                prod_region = row[6]
                stock_cedi = float(row[7] or 0)
                unidades_por_bulto = int(row[8] or 1)
                clase_abc = row[9]

                # Filtrar por región si se especifica
                if region and prod_region != region:
                    continue

                cedi_key = f"{cedi_id}_{prod_region}"

                if cedi_key not in cedis_data:
                    cedis_data[cedi_key] = OportunidadesCediResponse(
                        region=prod_region,
                        cedi_id=cedi_id,
                        cedi_nombre=cedi_nombre,
                        umbral_stock_bajo=umbral_stock,
                        total_oportunidades=0,
                        productos=[]
                    )

                if len(cedis_data[cedi_key].productos) < limit:
                    # Obtener tiendas de esta región para este producto
                    tiendas_detalle = tiendas_por_producto.get(prod_id, {}).get(prod_region, [])

                    item = OportunidadCediItem(
                        producto_id=prod_id,
                        codigo=row[1],
                        descripcion=row[2],
                        categoria=row[3],
                        stock_cedi_unidades=stock_cedi,
                        stock_cedi_bultos=round(stock_cedi / unidades_por_bulto, 1) if unidades_por_bulto > 0 else stock_cedi,
                        unidades_por_bulto=unidades_por_bulto,
                        clase_abc_predominante=clase_abc,
                        tiendas=tiendas_detalle
                    )
                    cedis_data[cedi_key].productos.append(item)
                    cedis_data[cedi_key].total_oportunidades += 1

            result = list(cedis_data.values())
            result.sort(key=lambda x: x.total_oportunidades, reverse=True)
            return result

    except Exception as e:
        logger.error(f"Error obteniendo oportunidades CEDI: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


class ExpansionCatalogoItem(BaseModel):
    """Producto con baja cobertura de tiendas pero buenas ventas"""
    producto_id: str
    codigo: str
    descripcion: str
    categoria: str
    tiendas_con_producto: int  # Tiendas donde hay stock o ventas
    total_tiendas: int
    cobertura_porcentaje: float
    venta_promedio_donde_hay: float  # Venta diaria promedio donde sí hay
    venta_potencial_expansion: float  # Venta estimada si expandimos
    tiendas_sin_producto: List[str]  # IDs de tiendas donde no hay
    clase_abc_predominante: str


class ExpansionCatalogoResponse(BaseModel):
    """Respuesta del análisis de expansión de catálogo"""
    region: str
    cobertura_minima_filtro: float
    cobertura_maxima_filtro: float
    total_oportunidades: int
    venta_potencial_total: float
    productos: List[ExpansionCatalogoItem]


@app.get("/api/inventario/expansion-catalogo", response_model=List[ExpansionCatalogoResponse], tags=["Análisis Distribución"])
async def get_expansion_catalogo(
    region: Optional[str] = None,
    cobertura_min: float = 10,  # Mínimo % de cobertura (para excluir productos muy nuevos)
    cobertura_max: float = 50,  # Máximo % de cobertura (objetivo: expandir estos)
    venta_minima_semanal: float = 5,  # Venta mínima semanal donde sí hay
    limit: int = 50
):
    """
    Identifica productos con baja cobertura de tiendas pero buenas ventas donde existen.
    Usa productos_abc_tienda para determinar presencia y ventas.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Query simplificado usando solo productos_abc_tienda
            query = """
                SELECT
                    c.producto_id,
                    COALESCE(p.codigo, c.producto_id) as codigo,
                    COALESCE(p.descripcion, 'Sin descripción') as descripcion,
                    COALESCE(p.categoria, 'Sin categoría') as categoria,
                    c.region,
                    c.tiendas_con_producto,
                    c.total_tiendas,
                    c.cobertura_pct,
                    c.venta_semanal_promedio,
                    c.venta_potencial_semanal,
                    c.tiendas_presentes,
                    c.clase_abc
                FROM (
                    SELECT
                        abc.producto_id,
                        u.region,
                        COUNT(DISTINCT abc.ubicacion_id) as tiendas_con_producto,
                        tr.total_tiendas,
                        (COUNT(DISTINCT abc.ubicacion_id)::float / tr.total_tiendas * 100) as cobertura_pct,
                        AVG(abc.venta_30d) / 30.0 * 7 as venta_semanal_promedio,
                        AVG(abc.venta_30d) / 30.0 * (tr.total_tiendas - COUNT(DISTINCT abc.ubicacion_id)) * 7 as venta_potencial_semanal,
                        ARRAY_AGG(DISTINCT abc.ubicacion_id) as tiendas_presentes,
                        MODE() WITHIN GROUP (ORDER BY abc.clase_abc) as clase_abc
                    FROM productos_abc_tienda abc
                    JOIN ubicaciones u ON abc.ubicacion_id = u.id
                    JOIN (
                        SELECT region, COUNT(*) as total_tiendas
                        FROM ubicaciones WHERE tipo = 'tienda'
                        GROUP BY region
                    ) tr ON tr.region = u.region
                    WHERE u.tipo = 'tienda' AND abc.venta_30d > 0
                    GROUP BY abc.producto_id, u.region, tr.total_tiendas
                    HAVING (COUNT(DISTINCT abc.ubicacion_id)::float / tr.total_tiendas * 100) >= %(cobertura_min)s
                       AND (COUNT(DISTINCT abc.ubicacion_id)::float / tr.total_tiendas * 100) <= %(cobertura_max)s
                       AND AVG(abc.venta_30d) / 30.0 * 7 >= %(venta_minima_semanal)s
                ) c
                LEFT JOIN productos p ON c.producto_id = p.id
                ORDER BY c.venta_potencial_semanal DESC
                LIMIT %(query_limit)s
            """

            cursor.execute(query, {
                'cobertura_min': cobertura_min,
                'cobertura_max': cobertura_max,
                'venta_minima_semanal': venta_minima_semanal,
                'query_limit': limit * 3
            })
            rows = cursor.fetchall()

            # Obtener tiendas por región
            cursor.execute("""
                SELECT region, ARRAY_AGG(id ORDER BY id) as tiendas
                FROM ubicaciones WHERE tipo = 'tienda'
                GROUP BY region
            """)
            tiendas_por_region = {row[0]: set(row[1]) for row in cursor.fetchall()}
            cursor.close()

            regions_data: Dict[str, ExpansionCatalogoResponse] = {}

            for row in rows:
                region_key = row[4]

                if region and region_key != region:
                    continue

                if region_key not in regions_data:
                    regions_data[region_key] = ExpansionCatalogoResponse(
                        region=region_key,
                        cobertura_minima_filtro=cobertura_min,
                        cobertura_maxima_filtro=cobertura_max,
                        total_oportunidades=0,
                        venta_potencial_total=0,
                        productos=[]
                    )

                if len(regions_data[region_key].productos) < limit:
                    tiendas_presentes = set(row[10]) if row[10] else set()
                    tiendas_region = tiendas_por_region.get(region_key, set())
                    tiendas_sin = list(tiendas_region - tiendas_presentes)

                    item = ExpansionCatalogoItem(
                        producto_id=row[0],
                        codigo=row[1],
                        descripcion=row[2],
                        categoria=row[3],
                        tiendas_con_producto=row[5] or 0,
                        total_tiendas=row[6] or 0,
                        cobertura_porcentaje=round(float(row[7] or 0), 1),
                        venta_promedio_donde_hay=round(float(row[8] or 0), 2),
                        venta_potencial_expansion=round(float(row[9] or 0), 2),
                        tiendas_sin_producto=tiendas_sin,
                        clase_abc_predominante=row[11] or 'C'
                    )
                    regions_data[region_key].productos.append(item)
                    regions_data[region_key].total_oportunidades += 1
                    regions_data[region_key].venta_potencial_total += item.venta_potencial_expansion

            result = list(regions_data.values())
            result.sort(key=lambda x: x.venta_potencial_total, reverse=True)
            return result

    except Exception as e:
        logger.error(f"Error obteniendo expansión catálogo: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/ubicaciones/{ubicacion_id}/stock-params", tags=["Ubicaciones"])
async def get_stock_params(ubicacion_id: str):
    """Obtiene los parámetros de stock para una tienda (valores por defecto)"""
    # Valores por defecto hardcodeados (antes venían de DuckDB)
    DEFAULTS = {
        'a':  {'min': 2.0, 'seg': 1.0, 'max': 5.0},
        'ab': {'min': 2.0, 'seg': 2.5, 'max': 7.0},
        'b':  {'min': 3.0, 'seg': 2.0, 'max': 12.0},
        'bc': {'min': 9.0, 'seg': 3.0, 'max': 17.0},
        'c':  {'min': 15.0, 'seg': 7.0, 'max': 26.0},
    }

    result = {"ubicacion_id": ubicacion_id}
    for abc, vals in DEFAULTS.items():
        result[f"stock_min_mult_{abc}"] = vals['min']
        result[f"stock_seg_mult_{abc}"] = vals['seg']
        result[f"stock_max_mult_{abc}"] = vals['max']

    return result


@app.get("/api/ubicaciones/{ubicacion_id}/almacenes", response_model=AlmacenesUbicacionResponse, tags=["Ubicaciones"])
async def get_almacenes_ubicacion(ubicacion_id: str):
    """
    Obtiene los almacenes KLK disponibles para una ubicación.

    Solo aplica a tiendas con sistema_pos='klk'. Para tiendas Stellar
    retorna una lista vacía de almacenes.
    """
    try:
        from tiendas_config import TIENDAS_CONFIG, get_almacenes_tienda

        if ubicacion_id not in TIENDAS_CONFIG:
            raise HTTPException(status_code=404, detail=f"Ubicación {ubicacion_id} no encontrada")

        config = TIENDAS_CONFIG[ubicacion_id]

        # Obtener almacenes si es tienda KLK
        almacenes = []
        if config.sistema_pos == "klk":
            almacenes_klk = get_almacenes_tienda(ubicacion_id)
            almacenes = [
                AlmacenKLKResponse(
                    codigo=a.codigo,
                    nombre=a.nombre,
                    tipo=a.tipo,
                    incluir_en_deficit=a.incluir_en_deficit,
                    activo=a.activo
                )
                for a in almacenes_klk
            ]

        return AlmacenesUbicacionResponse(
            ubicacion_id=config.ubicacion_id,
            ubicacion_nombre=config.ubicacion_nombre,
            sistema_pos=config.sistema_pos,
            almacenes=almacenes
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo almacenes de ubicación: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/almacenes/klk", tags=["Ubicaciones"])
async def get_all_almacenes_klk():
    """
    Obtiene todos los almacenes KLK de todas las tiendas.

    Útil para la vista de inventarios que necesita mostrar
    cada almacén como una fila separada.
    """
    try:
        from tiendas_config import get_tiendas_klk, get_almacenes_tienda

        result = []
        tiendas_klk = get_tiendas_klk()

        for tienda_id, config in tiendas_klk.items():
            almacenes = get_almacenes_tienda(tienda_id)
            for almacen in almacenes:
                result.append({
                    "ubicacion_id": tienda_id,
                    "ubicacion_nombre": config.ubicacion_nombre,
                    "almacen_codigo": almacen.codigo,
                    "almacen_nombre": almacen.nombre,
                    "almacen_tipo": almacen.tipo,
                    "incluir_en_deficit": almacen.incluir_en_deficit,
                    "activo": almacen.activo
                })

        return {
            "total": len(result),
            "almacenes": result
        }

    except Exception as e:
        logger.error(f"Error obteniendo almacenes KLK: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/productos", response_model=List[ProductoResponse], tags=["Productos"])
async def get_productos(categoria: Optional[str] = None, activo: bool = True):
    """Obtiene todos los productos"""
    try:
        # PostgreSQL v2.0: usar execute_query_dict para compatibilidad
        query = """
            SELECT p.id, p.codigo, p.nombre as descripcion, p.categoria, p.marca,
                   NULL as presentacion, NULL as precio_venta, NULL as costo_promedio, p.activo
            FROM productos p
            WHERE p.activo = %s
        """
        params = [activo]

        if categoria:
            query += " AND p.categoria = %s"
            params.append(categoria)

        query += " ORDER BY p.categoria, p.nombre LIMIT 1000"

        results = execute_query_dict(query, tuple(params))

        productos = []
        for row in results:
            productos.append(ProductoResponse(
                id=row['id'],
                codigo=row['codigo'],
                descripcion=row['descripcion'],
                categoria=row['categoria'],
                marca=row['marca'],
                presentacion=row['presentacion'],
                precio_venta=row['precio_venta'],
                costo_promedio=row['costo_promedio'],
                activo=row['activo']
            ))

        return productos

    except Exception as e:
        logger.error(f"Error obteniendo productos: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/categorias", tags=["Productos"])
async def get_categorias():
    """
    Obtiene todas las categorías de productos
    """
    try:
        query = """
            SELECT DISTINCT categoria
            FROM productos
            WHERE activo = true
                AND categoria IS NOT NULL
            ORDER BY categoria
        """

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query)
            result = cursor.fetchall()
            cursor.close()

            return [row[0] for row in result]

    except Exception as e:
        logger.error(f"Error obteniendo categorías: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

# =====================================================================================
# HELPERS PARA CÁLCULO ABC-XYZ ON-DEMAND (PostgreSQL)
# =====================================================================================

def calcular_abc_xyz_on_demand(ubicacion_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Calcula clasificación ABC-XYZ on-demand usando PostgreSQL

    ABC: Basado en valor de consumo (Principio de Pareto)
        - A: Productos que acumulan 80% del valor
        - B: Productos que acumulan 80-95% del valor
        - C: Productos que acumulan 95-100% del valor

    XYZ: Basado en Coeficiente de Variación de demanda semanal
        - X: CV < 0.5 (demanda estable y predecible)
        - Y: 0.5 ≤ CV < 1.0 (demanda variable)
        - Z: CV ≥ 1.0 (demanda errática e impredecible)

    Returns:
        Dict con matriz completa, resumenes ABC y XYZ
    """
    ubicacion_filter = ""
    params = []

    if ubicacion_id:
        ubicacion_filter = "AND v.ubicacion_id = %s"
        params = [ubicacion_id]

    # Clasificación ABC por cantidad de SKUs (no por valor Pareto)
    # Regla simple:
    # - A: Top 20% de SKUs por valor de ventas
    # - B: Siguientes 30% de SKUs
    # - C: Resto 50% de SKUs
    # - Excluye productos nuevos (< 4 semanas de historial)

    query = f"""
    WITH ventas_6m AS (
        -- Ventas últimos 6 meses agregadas por producto (todas las tiendas)
        SELECT
            v.producto_id,
            p.nombre as descripcion,
            SUM(v.cantidad_vendida * COALESCE(v.costo_unitario, 0)) as valor_consumo,
            COUNT(DISTINCT DATE_TRUNC('week', v.fecha_venta)) as semanas_con_venta
        FROM ventas v
        JOIN productos p ON v.producto_id = p.id
        WHERE v.fecha_venta >= CURRENT_DATE - INTERVAL '6 months'
            {ubicacion_filter}
        GROUP BY v.producto_id, p.nombre
        HAVING COUNT(DISTINCT DATE_TRUNC('week', v.fecha_venta)) >= 4  -- Mínimo 4 semanas
    ),
    productos_rankeados AS (
        -- Rankear productos por valor de consumo
        SELECT
            producto_id,
            descripcion,
            valor_consumo,
            semanas_con_venta,
            ROW_NUMBER() OVER (ORDER BY valor_consumo DESC) as ranking,
            COUNT(*) OVER () as total_productos
        FROM ventas_6m
        WHERE valor_consumo > 0
    ),
    productos_clasificados AS (
        -- Asignar clasificación ABC por percentiles de cantidad
        SELECT
            producto_id,
            descripcion,
            valor_consumo,
            semanas_con_venta,
            ranking,
            total_productos,
            CASE
                WHEN ranking <= (total_productos * 0.20) THEN 'A'  -- Top 20%
                WHEN ranking <= (total_productos * 0.50) THEN 'B'  -- 20-50% (siguiente 30%)
                ELSE 'C'  -- Resto 50%
            END as clasificacion_abc
        FROM productos_rankeados
    )
    SELECT
        clasificacion_abc,
        COUNT(*) as count,
        SUM(valor_consumo) as total_valor,
        AVG(semanas_con_venta) as promedio_semanas_historial
    FROM productos_clasificados
    GROUP BY clasificacion_abc
    ORDER BY clasificacion_abc
    """

    results = execute_query_dict(query, tuple(params) if params else None)

    # Calcular totales
    total_productos = sum(int(r['count']) for r in results)
    total_valor = sum(float(r['total_valor'] or 0) for r in results)

    # Construir resumen ABC (solo clasificación ABC, sin XYZ)
    resumen_abc = {'A': {'count': 0, 'porcentaje_productos': 0, 'porcentaje_valor': 0},
                   'B': {'count': 0, 'porcentaje_productos': 0, 'porcentaje_valor': 0},
                   'C': {'count': 0, 'porcentaje_productos': 0, 'porcentaje_valor': 0}}

    for row in results:
        abc = row['clasificacion_abc']
        count = int(row['count'])
        valor = float(row['total_valor']) if row['total_valor'] else 0.0

        resumen_abc[abc]['count'] = count
        resumen_abc[abc]['porcentaje_productos'] = round(float(count) * 100.0 / float(total_productos), 2) if total_productos > 0 else 0
        resumen_abc[abc]['porcentaje_valor'] = round(valor * 100.0 / float(total_valor), 2) if total_valor > 0 else 0

    return {
        'total_productos': int(total_productos),
        'total_valor': round(float(total_valor), 2),
        'resumen_abc': resumen_abc
    }


def calculate_ventas_semanales_metricas(semanas: List[Dict]) -> Dict[str, Any]:
    """
    Calcula métricas agregadas de ventas semanales

    Args:
        semanas: Lista de ventas por semana con 'unidades' y 'valor'

    Returns:
        Dict con métricas: semanas_con_ventas, total_unidades, total_valor,
        promedio_semanal, coeficiente_variacion
    """
    if not semanas:
        return {
            'semanas_con_ventas': 0,
            'total_unidades': 0,
            'total_valor': 0,
            'promedio_semanal': 0,
            'coeficiente_variacion': None
        }

    unidades = [s.get('unidades', 0) for s in semanas]
    total_unidades = sum(unidades)
    promedio = total_unidades / len(unidades) if len(unidades) > 0 else 0

    # Calcular CV = desviación estándar / media
    if promedio > 0 and len(unidades) > 1:
        varianza = sum((x - promedio) ** 2 for x in unidades) / len(unidades)
        desviacion = varianza ** 0.5
        cv = desviacion / promedio
    else:
        cv = None

    return {
        'semanas_con_ventas': len([u for u in unidades if u > 0]),
        'total_unidades': int(total_unidades),
        'total_valor': round(sum(s.get('valor', 0) for s in semanas), 2),
        'promedio_semanal': round(promedio, 2),
        'coeficiente_variacion': round(cv, 4) if cv is not None else None
    }


# =====================================================================================
# ENDPOINTS PARA SECCIÓN PRODUCTOS (ABC-XYZ) - PostgreSQL v2.0
# =====================================================================================

@app.get("/api/productos/matriz-abc-xyz", tags=["Productos"])
async def get_matriz_abc_xyz(ubicacion_id: Optional[str] = None):
    """
    Retorna clasificación ABC-XYZ.

    ABC: Por ranking de cantidad vendida (30 días)
        - A: Top 1-50 (productos más vendidos por cantidad)
        - B: Top 51-200
        - C: Top 201-800
        - D: Top 801+ (productos menos vendidos)

    XYZ: Clasificación por variabilidad de demanda (Coeficiente de Variación diario)
        - X: CV < 0.5 (demanda estable/predecible)
        - Y: 0.5 ≤ CV < 1.0 (demanda variable)
        - Z: CV ≥ 1.0 (demanda errática)

    Args:
        ubicacion_id: Si se proporciona, calcula ABC y XYZ para esa tienda específica.
                      Si es None o "todas", usa la cache global.

    Returns:
        {
            "total_productos": 2766,
            "total_valor": 34983191.36,
            "ubicacion_id": "tienda_01" | "todas",
            "resumen_abc": { "A": {...}, "B": {...}, "C": {...}, "D": {...} },
            "resumen_xyz": { "X": {...}, "Y": {...}, "Z": {...} },
            "matriz": { "AX": {...}, "AY": {...}, ... "DX": {...}, "DY": {...}, "DZ": {...} }
        }
    """
    try:
        # Si ubicacion_id es "todas" o vacío, usar análisis global
        usar_global = ubicacion_id is None or ubicacion_id == "" or ubicacion_id.lower() == "todas"

        # Resolver ubicacion_id si se envía el nombre en lugar del ID
        ubicacion_id_resuelto = ubicacion_id
        if not usar_global and ubicacion_id and not ubicacion_id.startswith('tienda_'):
            try:
                resolve_query = "SELECT id FROM ubicaciones WHERE nombre = %s OR id = %s LIMIT 1"
                result = execute_query_dict(resolve_query, (ubicacion_id, ubicacion_id))
                if result:
                    ubicacion_id_resuelto = result[0]['id']
                    logger.info(f"📍 Ubicación resuelta: {ubicacion_id} -> {ubicacion_id_resuelto}")
            except Exception as e:
                logger.warning(f"No se pudo resolver ubicacion_id: {e}")

        logger.info(f"📊 Calculando clasificación ABC-XYZ (ubicacion_id={ubicacion_id_resuelto}, global={usar_global})")

        # =====================================================================
        # 0. Cargar umbrales ABC desde config_inventario_global
        # =====================================================================
        umbral_a, umbral_b, umbral_c = 50, 200, 800  # Defaults
        try:
            umbrales_query = """
                SELECT id, valor_numerico
                FROM config_inventario_global
                WHERE categoria = 'abc_umbrales_ranking' AND activo = true
            """
            umbrales_results = execute_query_dict(umbrales_query)
            for row in umbrales_results:
                if row['id'] == 'abc_umbral_a' and row['valor_numerico']:
                    umbral_a = int(row['valor_numerico'])
                elif row['id'] == 'abc_umbral_b' and row['valor_numerico']:
                    umbral_b = int(row['valor_numerico'])
                elif row['id'] == 'abc_umbral_c' and row['valor_numerico']:
                    umbral_c = int(row['valor_numerico'])
        except Exception as e:
            logger.warning(f"No se pudieron cargar umbrales ABC: {e}. Usando defaults.")

        # =====================================================================
        # 1. Obtener ABC (por ranking de cantidad vendida)
        # =====================================================================
        if usar_global:
            # Usar cache global pre-calculada
            abc_query = """
            SELECT
                clase_abc,
                COUNT(*) as count,
                SUM(venta_30d) as total_valor,
                SUM(cantidad_30d) as total_cantidad
            FROM productos_abc_cache
            WHERE clase_abc IN ('A', 'B', 'C', 'D')
            GROUP BY clase_abc
            ORDER BY clase_abc
            """
            abc_results = execute_query_dict(abc_query)
        else:
            # Usar cache de tienda (productos_abc_tienda) - MUCHO más rápido
            abc_query = """
            SELECT
                clase_abc,
                COUNT(*) as count,
                SUM(venta_30d) as total_valor,
                SUM(cantidad_30d) as total_cantidad
            FROM productos_abc_tienda
            WHERE ubicacion_id = %s
              AND clase_abc IN ('A', 'B', 'C', 'D')
            GROUP BY clase_abc
            ORDER BY clase_abc
            """
            abc_results = execute_query_dict(abc_query, (ubicacion_id_resuelto,))

        # Calcular totales ABC
        total_productos_abc = sum(int(r['count']) for r in abc_results) if abc_results else 0
        total_valor = sum(float(r['total_valor'] or 0) for r in abc_results) if abc_results else 0

        # Calcular totales para porcentajes
        total_cantidad = sum(float(r['total_cantidad'] or 0) for r in abc_results) if abc_results else 0

        # Construir resumen ABC (ahora con 4 clases: A, B, C, D)
        resumen_abc = {
            'A': {'count': 0, 'porcentaje_productos': 0, 'porcentaje_valor': 0, 'total_cantidad': 0, 'descripcion': f'Top 1-{umbral_a}'},
            'B': {'count': 0, 'porcentaje_productos': 0, 'porcentaje_valor': 0, 'total_cantidad': 0, 'descripcion': f'Ranking {umbral_a+1}-{umbral_b}'},
            'C': {'count': 0, 'porcentaje_productos': 0, 'porcentaje_valor': 0, 'total_cantidad': 0, 'descripcion': f'Ranking {umbral_b+1}-{umbral_c}'},
            'D': {'count': 0, 'porcentaje_productos': 0, 'porcentaje_valor': 0, 'total_cantidad': 0, 'descripcion': f'Ranking {umbral_c+1}+'}
        }

        for row in abc_results:
            abc = row['clase_abc']
            if abc in resumen_abc:
                count = int(row['count'])
                valor = float(row['total_valor']) if row['total_valor'] else 0.0
                cantidad = float(row['total_cantidad']) if row['total_cantidad'] else 0.0

                resumen_abc[abc]['count'] = count
                resumen_abc[abc]['total_cantidad'] = int(cantidad)
                resumen_abc[abc]['porcentaje_productos'] = round(
                    float(count) * 100.0 / float(total_productos_abc), 2
                ) if total_productos_abc > 0 else 0
                resumen_abc[abc]['porcentaje_valor'] = round(
                    valor * 100.0 / float(total_valor), 2
                ) if total_valor > 0 else 0

        # NOTA: Top50 ya no se usa (es redundante con clase A = Top 50)
        # Se mantiene solo por compatibilidad pero no se calcula

        # =====================================================================
        # 2. Calcular XYZ desde ventas DIARIAS (CV diario para reposición diaria)
        # =====================================================================
        # Usamos últimos 30 días para tener suficientes observaciones

        if usar_global:
            xyz_query = """
            WITH ventas_diarias AS (
                SELECT
                    producto_id,
                    fecha_venta::date as dia,
                    SUM(cantidad_vendida) as unidades,
                    SUM(venta_total) as venta
                FROM ventas
                WHERE fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY producto_id, fecha_venta::date
            ),
            metricas_cv AS (
                SELECT
                    producto_id,
                    COUNT(*) as dias,
                    AVG(unidades) as promedio,
                    STDDEV_POP(unidades) as desviacion,
                    SUM(venta) as venta_total,
                    CASE
                        WHEN AVG(unidades) > 0 THEN STDDEV_POP(unidades) / AVG(unidades)
                        ELSE 0
                    END as cv
                FROM ventas_diarias
                GROUP BY producto_id
                HAVING COUNT(*) >= 15  -- Al menos 15 días de venta en el mes
            ),
            clasificacion_xyz AS (
                SELECT
                    producto_id,
                    cv,
                    venta_total,
                    CASE
                        WHEN cv < 0.5 THEN 'X'
                        WHEN cv < 1.0 THEN 'Y'
                        ELSE 'Z'
                    END as clase_xyz
                FROM metricas_cv
            )
            SELECT
                clase_xyz,
                COUNT(*) as count,
                SUM(venta_total) as total_valor
            FROM clasificacion_xyz
            GROUP BY clase_xyz
            ORDER BY clase_xyz
            """
            xyz_results = execute_query_dict(xyz_query)
        else:
            # XYZ por tienda - usar subquery optimizada con índices
            # Limitamos a productos que están en el cache ABC de la tienda
            xyz_query = """
            WITH productos_tienda AS (
                SELECT producto_id, venta_30d
                FROM productos_abc_tienda
                WHERE ubicacion_id = %s
            ),
            ventas_diarias AS (
                SELECT
                    v.producto_id,
                    v.fecha_venta::date as dia,
                    SUM(v.cantidad_vendida) as unidades
                FROM ventas v
                INNER JOIN productos_tienda pt ON v.producto_id = pt.producto_id
                WHERE v.ubicacion_id = %s
                  AND v.fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY v.producto_id, v.fecha_venta::date
            ),
            metricas_cv AS (
                SELECT
                    vd.producto_id,
                    pt.venta_30d as venta_total,
                    CASE
                        WHEN AVG(vd.unidades) > 0 THEN STDDEV_POP(vd.unidades) / AVG(vd.unidades)
                        ELSE 0
                    END as cv
                FROM ventas_diarias vd
                JOIN productos_tienda pt ON vd.producto_id = pt.producto_id
                GROUP BY vd.producto_id, pt.venta_30d
                HAVING COUNT(*) >= 15
            ),
            clasificacion_xyz AS (
                SELECT
                    producto_id,
                    venta_total,
                    CASE
                        WHEN cv < 0.5 THEN 'X'
                        WHEN cv < 1.0 THEN 'Y'
                        ELSE 'Z'
                    END as clase_xyz
                FROM metricas_cv
            )
            SELECT
                clase_xyz,
                COUNT(*) as count,
                SUM(venta_total) as total_valor
            FROM clasificacion_xyz
            GROUP BY clase_xyz
            ORDER BY clase_xyz
            """
            xyz_results = execute_query_dict(xyz_query, (ubicacion_id_resuelto, ubicacion_id_resuelto))

        # Calcular totales XYZ
        total_productos_xyz = sum(int(r['count']) for r in xyz_results) if xyz_results else 0
        total_valor_xyz = sum(float(r['total_valor'] or 0) for r in xyz_results) if xyz_results else 0

        # Construir resumen XYZ
        resumen_xyz = {
            'X': {'count': 0, 'porcentaje_productos': 0, 'porcentaje_valor': 0},
            'Y': {'count': 0, 'porcentaje_productos': 0, 'porcentaje_valor': 0},
            'Z': {'count': 0, 'porcentaje_productos': 0, 'porcentaje_valor': 0}
        }

        for row in xyz_results:
            xyz = row['clase_xyz']
            if xyz in resumen_xyz:
                count = int(row['count'])
                valor = float(row['total_valor']) if row['total_valor'] else 0.0

                resumen_xyz[xyz]['count'] = count
                resumen_xyz[xyz]['porcentaje_productos'] = round(
                    float(count) * 100.0 / float(total_productos_xyz), 2
                ) if total_productos_xyz > 0 else 0
                resumen_xyz[xyz]['porcentaje_valor'] = round(
                    valor * 100.0 / float(total_valor_xyz), 2
                ) if total_valor_xyz > 0 else 0

        # =====================================================================
        # 3. Calcular Matriz ABC-XYZ combinada (CV DIARIO)
        # =====================================================================
        if usar_global:
            # Usar cache global para ABC + cálculo XYZ diario global
            matriz_query = """
            WITH clasificacion_xyz AS (
                SELECT
                    producto_id,
                    CASE
                        WHEN AVG(unidades) > 0 THEN STDDEV_POP(unidades) / AVG(unidades)
                        ELSE 0
                    END as cv
                FROM (
                    SELECT
                        producto_id,
                        fecha_venta::date as dia,
                        SUM(cantidad_vendida) as unidades
                    FROM ventas
                    WHERE fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
                    GROUP BY producto_id, fecha_venta::date
                ) vs
                GROUP BY producto_id
                HAVING COUNT(*) >= 15
            ),
            xyz_clasificado AS (
                SELECT
                    producto_id,
                    CASE
                        WHEN cv < 0.5 THEN 'X'
                        WHEN cv < 1.0 THEN 'Y'
                        ELSE 'Z'
                    END as clase_xyz
                FROM clasificacion_xyz
            ),
            combinada AS (
                SELECT
                    abc.producto_id,
                    abc.clase_abc,
                    COALESCE(xyz.clase_xyz, 'Y') as clase_xyz,
                    abc.venta_30d as venta_total
                FROM productos_abc_cache abc
                LEFT JOIN xyz_clasificado xyz ON abc.producto_id = xyz.producto_id
                WHERE abc.clase_abc IN ('A', 'B', 'C', 'D')
            )
            SELECT
                clase_abc || clase_xyz as celda,
                COUNT(*) as count,
                SUM(venta_total) as total_valor
            FROM combinada
            GROUP BY clase_abc, clase_xyz
            ORDER BY clase_abc, clase_xyz
            """
            matriz_results = execute_query_dict(matriz_query)
        else:
            # Usar cache ABC de tienda + calcular XYZ optimizado
            matriz_query = """
            WITH abc_tienda AS (
                SELECT producto_id, clase_abc, venta_30d
                FROM productos_abc_tienda
                WHERE ubicacion_id = %s
                  AND clase_abc IN ('A', 'B', 'C', 'D')
            ),
            ventas_diarias AS (
                SELECT
                    v.producto_id,
                    v.fecha_venta::date as dia,
                    SUM(v.cantidad_vendida) as unidades
                FROM ventas v
                INNER JOIN abc_tienda abc ON v.producto_id = abc.producto_id
                WHERE v.ubicacion_id = %s
                  AND v.fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY v.producto_id, v.fecha_venta::date
            ),
            xyz_calc AS (
                SELECT
                    producto_id,
                    CASE
                        WHEN AVG(unidades) > 0 THEN STDDEV_POP(unidades) / AVG(unidades)
                        ELSE 0
                    END as cv
                FROM ventas_diarias
                GROUP BY producto_id
                HAVING COUNT(*) >= 15
            ),
            xyz_clasificado AS (
                SELECT
                    producto_id,
                    CASE
                        WHEN cv < 0.5 THEN 'X'
                        WHEN cv < 1.0 THEN 'Y'
                        ELSE 'Z'
                    END as clase_xyz
                FROM xyz_calc
            ),
            combinada AS (
                SELECT
                    abc.producto_id,
                    abc.clase_abc,
                    COALESCE(xyz.clase_xyz, 'Y') as clase_xyz,
                    abc.venta_30d as venta_total
                FROM abc_tienda abc
                LEFT JOIN xyz_clasificado xyz ON abc.producto_id = xyz.producto_id
            )
            SELECT
                clase_abc || clase_xyz as celda,
                COUNT(*) as count,
                SUM(venta_total) as total_valor
            FROM combinada
            GROUP BY clase_abc, clase_xyz
            ORDER BY clase_abc, clase_xyz
            """
            matriz_results = execute_query_dict(matriz_query, (ubicacion_id_resuelto, ubicacion_id_resuelto))

        # Construir matriz
        matriz = {}
        total_productos_matriz = sum(int(r['count']) for r in matriz_results) if matriz_results else 0
        total_valor_matriz = sum(float(r['total_valor'] or 0) for r in matriz_results) if matriz_results else 0

        for row in matriz_results:
            celda = row['celda']
            count = int(row['count'])
            valor = float(row['total_valor']) if row['total_valor'] else 0.0

            matriz[celda] = {
                'count': count,
                'porcentaje_productos': round(
                    float(count) * 100.0 / float(total_productos_matriz), 2
                ) if total_productos_matriz > 0 else 0,
                'porcentaje_valor': round(
                    valor * 100.0 / float(total_valor_matriz), 2
                ) if total_valor_matriz > 0 else 0
            }

        logger.info(f"✅ Clasificación ABC-XYZ calculada: {total_productos_abc} productos ABC, {total_productos_xyz} productos XYZ (tienda={ubicacion_id or 'todas'})")

        return {
            'total_productos': int(total_productos_abc),
            'total_valor': round(float(total_valor), 2),
            'ubicacion_id': ubicacion_id_resuelto if not usar_global else 'todas',
            'resumen_abc': resumen_abc,
            'resumen_xyz': resumen_xyz,
            'matriz': matriz,
            'umbrales': {
                'umbral_a': umbral_a,
                'umbral_b': umbral_b,
                'umbral_c': umbral_c
            }
        }

    except Exception as e:
        logger.error(f"Error calculando clasificación ABC-XYZ: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/productos/lista-por-matriz", tags=["Productos"])
async def get_productos_por_matriz(
    matriz: Optional[str] = None,
    ubicacion_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    """
    Retorna lista de productos con clasificación ABC-XYZ.

    Args:
        matriz: Filtro por celda de matriz: "A", "B", "C", "AX", "AY", "AZ", "Top50", etc.
        ubicacion_id: Si se proporciona, calcula ABC y XYZ para esa tienda específica.
                      Si es None o "todas", usa la cache global.
        limit: Cantidad máxima de productos a retornar
        offset: Offset para paginación

    Returns:
        Lista de productos con clasificación ABC, XYZ, stock e insights
    """
    try:
        # Parsear filtro de matriz
        clase_abc_filtro = None
        clase_xyz_filtro = None
        filtro_top50 = False

        if matriz:
            if matriz.lower() == 'top50':
                filtro_top50 = True
            elif len(matriz) == 2:  # "AX", "BY", etc.
                clase_abc_filtro = matriz[0]
                clase_xyz_filtro = matriz[1]
            elif len(matriz) == 1:  # "A", "B", "C"
                clase_abc_filtro = matriz

        # Determinar si usar cache global o calcular por tienda
        usar_global = ubicacion_id is None or ubicacion_id == "" or ubicacion_id.lower() == "todas"

        # Resolver ubicacion_id si es nombre de tienda
        ubicacion_id_resuelto = ubicacion_id
        if not usar_global and ubicacion_id and not ubicacion_id.startswith('tienda_'):
            try:
                resolve_query = "SELECT id FROM ubicaciones WHERE nombre = %s OR id = %s LIMIT 1"
                result = execute_query_dict(resolve_query, (ubicacion_id, ubicacion_id))
                if result:
                    ubicacion_id_resuelto = result[0]['id']
                    logger.info(f"lista-por-matriz: Resuelto '{ubicacion_id}' -> '{ubicacion_id_resuelto}'")
            except Exception as e:
                logger.warning(f"No se pudo resolver ubicacion_id: {e}")

        if usar_global:
            # OPTIMIZADO: Usar cache global productos_abc_cache + cálculo XYZ solo para productos filtrados
            # Primero filtramos por ABC (rápido), luego calculamos XYZ solo para esos productos
            query = """
            WITH productos_filtrados AS (
                SELECT
                    c.producto_id,
                    c.clase_abc,
                    c.rank_cantidad,
                    c.venta_30d,
                    c.cantidad_30d,
                    c.porcentaje_venta
                FROM productos_abc_cache c
                WHERE c.clase_abc IN ('A', 'B', 'C', 'D')
            """
            params = []

            # Filtro ABC dentro del CTE para optimización
            if clase_abc_filtro:
                query += " AND c.clase_abc = %s"
                params.append(clase_abc_filtro)
            if filtro_top50:
                query += " AND c.rank_cantidad <= 50"

            query += """
            ),
            ventas_diarias AS (
                SELECT
                    v.producto_id,
                    v.fecha_venta::date as dia,
                    SUM(v.cantidad_vendida) as unidades
                FROM ventas v
                INNER JOIN productos_filtrados pf ON v.producto_id = pf.producto_id
                WHERE v.fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY v.producto_id, v.fecha_venta::date
            ),
            xyz_calc AS (
                SELECT
                    producto_id,
                    CASE
                        WHEN AVG(unidades) > 0 THEN STDDEV_POP(unidades) / AVG(unidades)
                        ELSE 0
                    END as cv
                FROM ventas_diarias
                GROUP BY producto_id
                HAVING COUNT(*) >= 15
            )
            SELECT
                p.id as codigo_producto,
                p.descripcion as descripcion,
                p.categoria,
                pf.clase_abc as clasificacion_abc,
                CASE
                    WHEN xyz.cv IS NULL THEN 'Y'
                    WHEN xyz.cv < 0.5 THEN 'X'
                    WHEN xyz.cv < 1.0 THEN 'Y'
                    ELSE 'Z'
                END as clasificacion_xyz,
                (pf.rank_cantidad <= 50) as is_top50,
                COALESCE(pf.venta_30d, 0) as valor_consumo_total,
                COALESCE(pf.cantidad_30d, 0) as cantidad_30d,
                COALESCE(pf.porcentaje_venta, 0) as porcentaje_valor,
                pf.rank_cantidad as ranking_valor,
                COALESCE(i.stock_total, 0) as stock_actual,
                xyz.cv as coeficiente_variacion,
                0 as demanda_p75
            FROM productos_filtrados pf
            JOIN productos p ON p.id = pf.producto_id
            LEFT JOIN xyz_calc xyz ON xyz.producto_id = pf.producto_id
            LEFT JOIN (
                SELECT producto_id, SUM(cantidad) as stock_total
                FROM inventario_actual
                GROUP BY producto_id
            ) i ON i.producto_id = pf.producto_id
            WHERE 1=1
            """

            # Filtro XYZ después del cálculo
            if clase_xyz_filtro:
                query += """
                AND CASE
                    WHEN xyz.cv IS NULL THEN 'Y'
                    WHEN xyz.cv < 0.5 THEN 'X'
                    WHEN xyz.cv < 1.0 THEN 'Y'
                    ELSE 'Z'
                END = %s
                """
                params.append(clase_xyz_filtro)

            query += " ORDER BY pf.rank_cantidad ASC, p.descripcion ASC LIMIT %s OFFSET %s"
            params.extend([limit, offset])

        else:
            # OPTIMIZADO: Usar cache de tienda productos_abc_tienda + cálculo XYZ
            query = """
            WITH productos_filtrados AS (
                SELECT
                    c.producto_id,
                    c.clase_abc,
                    c.rank_cantidad,
                    c.venta_30d,
                    c.cantidad_30d,
                    c.porcentaje_venta
                FROM productos_abc_tienda c
                WHERE c.ubicacion_id = %s
                  AND c.clase_abc IN ('A', 'B', 'C', 'D')
            """
            params = [ubicacion_id_resuelto]

            # Filtro ABC dentro del CTE para optimización
            if clase_abc_filtro:
                query += " AND c.clase_abc = %s"
                params.append(clase_abc_filtro)
            if filtro_top50:
                query += " AND c.rank_cantidad <= 50"

            query += """
            ),
            ventas_diarias AS (
                SELECT
                    v.producto_id,
                    v.fecha_venta::date as dia,
                    SUM(v.cantidad_vendida) as unidades
                FROM ventas v
                INNER JOIN productos_filtrados pf ON v.producto_id = pf.producto_id
                WHERE v.ubicacion_id = %s
                  AND v.fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
                  AND NOT (v.ubicacion_id = 'tienda_18' AND v.fecha_venta::date = '2025-12-06')
                GROUP BY v.producto_id, v.fecha_venta::date
            ),
            xyz_calc AS (
                SELECT
                    producto_id,
                    CASE
                        WHEN AVG(unidades) > 0 THEN STDDEV_POP(unidades) / AVG(unidades)
                        ELSE 0
                    END as cv
                FROM ventas_diarias
                GROUP BY producto_id
                HAVING COUNT(*) >= 15
            )
            SELECT
                p.id as codigo_producto,
                p.descripcion as descripcion,
                p.categoria,
                pf.clase_abc as clasificacion_abc,
                CASE
                    WHEN xyz.cv IS NULL THEN 'Y'
                    WHEN xyz.cv < 0.5 THEN 'X'
                    WHEN xyz.cv < 1.0 THEN 'Y'
                    ELSE 'Z'
                END as clasificacion_xyz,
                (pf.rank_cantidad <= 50) as is_top50,
                COALESCE(pf.venta_30d, 0) as valor_consumo_total,
                COALESCE(pf.cantidad_30d, 0) as cantidad_30d,
                COALESCE(pf.porcentaje_venta, 0) as porcentaje_valor,
                pf.rank_cantidad as ranking_valor,
                COALESCE(i.stock_tienda, 0) as stock_actual,
                xyz.cv as coeficiente_variacion,
                0 as demanda_p75
            FROM productos_filtrados pf
            JOIN productos p ON p.id = pf.producto_id
            LEFT JOIN xyz_calc xyz ON xyz.producto_id = pf.producto_id
            LEFT JOIN (
                SELECT producto_id, SUM(cantidad) as stock_tienda
                FROM inventario_actual
                WHERE ubicacion_id = %s
                GROUP BY producto_id
            ) i ON i.producto_id = pf.producto_id
            WHERE 1=1
            """
            params.append(ubicacion_id_resuelto)  # for ventas_diarias
            params.append(ubicacion_id_resuelto)  # for inventario_actual

            # Filtro XYZ después del cálculo
            if clase_xyz_filtro:
                query += """
                AND CASE
                    WHEN xyz.cv IS NULL THEN 'Y'
                    WHEN xyz.cv < 0.5 THEN 'X'
                    WHEN xyz.cv < 1.0 THEN 'Y'
                    ELSE 'Z'
                END = %s
                """
                params.append(clase_xyz_filtro)

            query += " ORDER BY pf.rank_cantidad ASC, p.descripcion ASC LIMIT %s OFFSET %s"
            params.extend([limit, offset])

        results = execute_query_dict(query, tuple(params))
        return results

    except Exception as e:
        logger.error(f"Error obteniendo productos por matriz: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/productos/analisis-maestro", tags=["Productos"])
async def get_productos_analisis_maestro(
    estado: Optional[str] = None,
    clasificacion_abc: Optional[str] = None,
    categoria: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 500,
    offset: int = 0
):
    """
    Análisis maestro de productos para detectar productos fantasma y problemas.

    OPTIMIZADO: Usa productos_abc_cache para clasificación ABC (Pareto 80/15/5)
    y productos_analisis_cache para estados y stock.

    Args:
        estado: Filtrar por estado (FANTASMA, CRITICO, ANOMALIA, DORMIDO, AGOTANDOSE, ACTIVO)
        clasificacion_abc: Filtrar por clase ABC (A, B, C, SIN_VENTAS)
        categoria: Filtrar por categoría
        search: Buscar por código o descripción
        limit: Máximo de resultados
        offset: Offset para paginación
    """
    try:
        # Construir filtros dinámicos
        filters = []
        params = []

        if search:
            filters.append("(pac.codigo ILIKE %s OR pac.descripcion ILIKE %s)")
            params.extend([f'%{search}%', f'%{search}%'])

        if categoria:
            filters.append("pac.categoria = %s")
            params.append(categoria)

        if estado:
            filters.append("pac.estado = %s")
            params.append(estado)

        if clasificacion_abc:
            if clasificacion_abc == 'SIN_VENTAS':
                filters.append("abc.clase_abc IS NULL")
            else:
                filters.append("abc.clase_abc = %s")
                params.append(clasificacion_abc)

        where_clause = " AND ".join(filters) if filters else "1=1"

        # Usar productos_abc_cache para clasificación ABC (Pareto correcto)
        query = f"""
        SELECT
            pac.codigo, pac.descripcion, pac.categoria,
            COALESCE(abc.clase_abc, 'SIN_VENTAS') as clasificacion_abc,
            pac.stock_cedi_seco, pac.stock_cedi_caracas, pac.stock_tiendas, pac.num_tiendas_con_stock,
            pac.ventas_2m, pac.num_tiendas_con_ventas, pac.ultima_venta, pac.dias_sin_venta,
            pac.rank_cantidad, COALESCE(abc.rank_cantidad, pac.rank_valor) as rank_valor,
            pac.stock_total, pac.estado
        FROM productos_analisis_cache pac
        LEFT JOIN productos_abc_cache abc ON abc.producto_id = pac.codigo
        WHERE {where_clause}
        ORDER BY
            CASE pac.estado
                WHEN 'FANTASMA' THEN 1
                WHEN 'CRITICO' THEN 2
                WHEN 'ANOMALIA' THEN 3
                WHEN 'DORMIDO' THEN 4
                WHEN 'AGOTANDOSE' THEN 5
                WHEN 'ACTIVO' THEN 6
            END,
            COALESCE(abc.rank_cantidad, pac.rank_valor) ASC
        LIMIT %s OFFSET %s
        """

        params.extend([limit, offset])

        results = execute_query_dict(query, tuple(params))

        # Convertir fechas a string para JSON
        for r in results:
            if r.get('ultima_venta'):
                r['ultima_venta'] = r['ultima_venta'].strftime('%Y-%m-%d') if hasattr(r['ultima_venta'], 'strftime') else str(r['ultima_venta'])

        return results

    except Exception as e:
        import traceback
        error_msg = str(e)

        # Si la tabla cache no existe, usar query original (fallback)
        if "productos_analisis_cache" in error_msg and ("does not exist" in error_msg or "no existe" in error_msg):
            logger.warning("Cache table not found, using slow query fallback. Run migration to create cache table.")
            return await _get_productos_analisis_maestro_slow(estado, clasificacion_abc, categoria, search, limit, offset)

        logger.error(f"Error en análisis maestro: {error_msg}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error interno: {error_msg}")


async def _get_productos_analisis_maestro_slow(
    estado: Optional[str] = None,
    clasificacion_abc: Optional[str] = None,
    categoria: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 500,
    offset: int = 0
):
    """Fallback lento si la tabla cache no existe."""
    search_filter = ""
    categoria_filter = ""
    params = []

    if search:
        search_filter = "AND (p.id ILIKE %s OR p.nombre ILIKE %s)"
        params.extend([f'%{search}%', f'%{search}%'])

    if categoria:
        categoria_filter = "AND p.categoria = %s"
        params.append(categoria)

    query = f"""
    WITH stock_por_ubicacion AS (
        SELECT ia.producto_id, ia.ubicacion_id, SUM(ia.cantidad) as stock
        FROM inventario_actual ia
        GROUP BY ia.producto_id, ia.ubicacion_id
    ),
    stock_agregado AS (
        SELECT s.producto_id,
            SUM(CASE WHEN s.ubicacion_id = 'cedi_seco' THEN s.stock ELSE 0 END) as stock_cedi_seco,
            SUM(CASE WHEN s.ubicacion_id = 'cedi_caracas' THEN s.stock ELSE 0 END) as stock_cedi_caracas,
            SUM(CASE WHEN POSITION('cedi' IN s.ubicacion_id) != 1 THEN s.stock ELSE 0 END) as stock_tiendas,
            COUNT(DISTINCT CASE WHEN POSITION('cedi' IN s.ubicacion_id) != 1 AND s.stock > 0 THEN s.ubicacion_id END) as num_tiendas_con_stock,
            SUM(s.stock) as stock_total
        FROM stock_por_ubicacion s
        GROUP BY s.producto_id
    ),
    ventas_2m AS (
        SELECT v.producto_id, v.ubicacion_id,
            SUM(v.cantidad_vendida) as unidades_vendidas,
            SUM(v.venta_total) as valor_vendido,
            -- Excluir devoluciones (cantidad < 0) del cálculo de última venta
            MAX(CASE WHEN v.cantidad_vendida > 0 THEN v.fecha_venta END) as ultima_venta
        FROM ventas v
        WHERE v.fecha_venta >= CURRENT_DATE - INTERVAL '2 months'
        GROUP BY v.producto_id, v.ubicacion_id
    ),
    ventas_agregadas AS (
        SELECT v.producto_id,
            SUM(v.unidades_vendidas) as ventas_2m_unidades,
            SUM(v.valor_vendido) as ventas_2m_valor,
            COUNT(DISTINCT v.ubicacion_id) as num_tiendas_con_ventas,
            MAX(v.ultima_venta) as ultima_venta
        FROM ventas_2m v
        GROUP BY v.producto_id
    ),
    ventas_6m AS (
        SELECT v.producto_id,
            SUM(v.cantidad_vendida * COALESCE(v.costo_unitario, 0)) as valor_consumo,
            COUNT(DISTINCT DATE_TRUNC('week', v.fecha_venta)) as semanas_con_venta
        FROM ventas v
        WHERE v.fecha_venta >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY v.producto_id
        HAVING COUNT(DISTINCT DATE_TRUNC('week', v.fecha_venta)) >= 4
    ),
    rankings AS (
        SELECT producto_id,
            ROW_NUMBER() OVER (ORDER BY ventas_2m_unidades DESC NULLS LAST) as rank_cantidad,
            ROW_NUMBER() OVER (ORDER BY ventas_2m_valor DESC NULLS LAST) as rank_valor
        FROM ventas_agregadas
    ),
    abc_ranked AS (
        SELECT producto_id, valor_consumo,
            ROW_NUMBER() OVER (ORDER BY valor_consumo DESC) as ranking,
            COUNT(*) OVER () as total_productos_abc
        FROM ventas_6m WHERE valor_consumo > 0
    ),
    abc_classification AS (
        SELECT producto_id,
            CASE
                WHEN ranking <= (total_productos_abc * 0.20) THEN 'A'
                WHEN ranking <= (total_productos_abc * 0.50) THEN 'B'
                ELSE 'C'
            END as clasificacion_abc
        FROM abc_ranked
    ),
    producto_completo AS (
        SELECT p.id as codigo, p.nombre as descripcion, p.categoria,
            COALESCE(abc.clasificacion_abc, 'SIN_VENTAS') as clasificacion_abc,
            COALESCE(sa.stock_cedi_seco, 0) as stock_cedi_seco,
            COALESCE(sa.stock_cedi_caracas, 0) as stock_cedi_caracas,
            COALESCE(sa.stock_tiendas, 0) as stock_tiendas,
            COALESCE(sa.num_tiendas_con_stock, 0) as num_tiendas_con_stock,
            COALESCE(va.ventas_2m_unidades, 0) as ventas_2m,
            COALESCE(va.num_tiendas_con_ventas, 0) as num_tiendas_con_ventas,
            va.ultima_venta,
            CASE WHEN va.ultima_venta IS NULL THEN NULL ELSE (CURRENT_DATE - va.ultima_venta::date) END as dias_sin_venta,
            COALESCE(r.rank_cantidad, 999999) as rank_cantidad,
            COALESCE(r.rank_valor, 999999) as rank_valor,
            COALESCE(sa.stock_total, 0) as stock_total,
            CASE
                WHEN COALESCE(sa.stock_total, 0) = 0 AND COALESCE(va.ventas_2m_unidades, 0) = 0 THEN 'FANTASMA'
                WHEN COALESCE(sa.stock_total, 0) = 0 AND COALESCE(va.ventas_2m_unidades, 0) > 0 THEN 'ANOMALIA'
                WHEN COALESCE(sa.stock_tiendas, 0) = 0 AND (COALESCE(sa.stock_cedi_seco, 0) > 0 OR COALESCE(sa.stock_cedi_caracas, 0) > 0) AND COALESCE(va.ventas_2m_unidades, 0) = 0 THEN 'CRITICO'
                WHEN COALESCE(sa.stock_total, 0) > 0 AND COALESCE(va.ventas_2m_unidades, 0) = 0 THEN 'DORMIDO'
                WHEN COALESCE(va.ventas_2m_unidades, 0) > 0 AND (COALESCE(sa.stock_tiendas, 0) < 10 OR (COALESCE(sa.stock_cedi_seco, 0) = 0 AND COALESCE(sa.stock_cedi_caracas, 0) = 0)) THEN 'AGOTANDOSE'
                ELSE 'ACTIVO'
            END as estado
        FROM productos p
        LEFT JOIN stock_agregado sa ON p.id = sa.producto_id
        LEFT JOIN ventas_agregadas va ON p.id = va.producto_id
        LEFT JOIN rankings r ON p.id = r.producto_id
        LEFT JOIN abc_classification abc ON p.id = abc.producto_id
        WHERE 1=1 {search_filter} {categoria_filter}
    )
    SELECT * FROM producto_completo
    WHERE 1=1
    {"AND estado = %s" if estado else ""}
    {"AND clasificacion_abc = %s" if clasificacion_abc and clasificacion_abc != 'SIN_VENTAS' else ""}
    {"AND clasificacion_abc = 'SIN_VENTAS'" if clasificacion_abc == 'SIN_VENTAS' else ""}
    ORDER BY CASE estado WHEN 'FANTASMA' THEN 1 WHEN 'CRITICO' THEN 2 WHEN 'ANOMALIA' THEN 3 WHEN 'DORMIDO' THEN 4 WHEN 'AGOTANDOSE' THEN 5 WHEN 'ACTIVO' THEN 6 END, rank_valor ASC
    LIMIT %s OFFSET %s
    """

    if estado:
        params.append(estado)
    if clasificacion_abc and clasificacion_abc != 'SIN_VENTAS':
        params.append(clasificacion_abc)
    params.extend([limit, offset])

    results = execute_query_dict(query, tuple(params) if params else None)

    for r in results:
        if r.get('ultima_venta'):
            r['ultima_venta'] = r['ultima_venta'].strftime('%Y-%m-%d')

    return results


@app.get("/api/productos/analisis-maestro/resumen", tags=["Productos"])
async def get_productos_analisis_resumen(
    clasificacion_abc: Optional[str] = None
):
    """
    Resumen de conteos por estado y ABC para el análisis maestro.

    OPTIMIZADO: Usa productos_abc_cache para clasificación ABC (Pareto 80/15/5)
    y productos_analisis_cache para estados.

    Args:
        clasificacion_abc: Filtrar por clase ABC (A, B, C, SIN_VENTAS)

    Returns:
        Objeto con conteos por estado, por ABC, y totales
    """
    try:
        abc_filter = ""
        params = []
        if clasificacion_abc:
            if clasificacion_abc == "SIN_VENTAS":
                abc_filter = "WHERE abc.clase_abc IS NULL"
            else:
                abc_filter = "WHERE abc.clase_abc = %s"
                params.append(clasificacion_abc)

        # Usar productos_abc_cache para clasificación ABC (Pareto correcto)
        # y productos_analisis_cache para estados
        query = f"""
        SELECT
            COALESCE(abc.clase_abc, 'SIN_VENTAS') as clasificacion_abc,
            pac.estado,
            COUNT(*) as cantidad
        FROM productos_analisis_cache pac
        LEFT JOIN productos_abc_cache abc ON abc.producto_id = pac.codigo
        {abc_filter}
        GROUP BY COALESCE(abc.clase_abc, 'SIN_VENTAS'), pac.estado
        """

        results = execute_query_dict(query, tuple(params) if params else None)

        # Construir respuesta estructurada
        por_estado = {}
        por_abc = {}

        for r in results:
            abc = r['clasificacion_abc']
            estado = r['estado']
            cantidad = r['cantidad']

            # Acumular por estado
            por_estado[estado] = por_estado.get(estado, 0) + cantidad

            # Acumular por ABC
            por_abc[abc] = por_abc.get(abc, 0) + cantidad

        total = sum(por_estado.values())

        # Obtener timestamp de última actualización de ABC cache
        try:
            ts_result = execute_query_dict("SELECT MAX(fecha_calculo) as last_update FROM productos_abc_cache")
            last_update = ts_result[0]['last_update'] if ts_result else None
        except Exception:
            last_update = None

        return {
            "por_estado": por_estado,
            "por_abc": por_abc,
            "total": total,
            "filtro_abc": clasificacion_abc,
            "cache_updated_at": str(last_update) if last_update else None
        }

    except Exception as e:
        error_msg = str(e)
        # Fallback si la tabla cache no existe
        if "productos_analisis_cache" in error_msg and ("does not exist" in error_msg or "no existe" in error_msg):
            logger.warning("Cache table not found for resumen, using slow query fallback.")
            return await _get_productos_analisis_resumen_slow(clasificacion_abc)

        logger.error(f"Error en resumen análisis: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Error interno: {error_msg}")


async def _get_productos_analisis_resumen_slow(clasificacion_abc: Optional[str] = None):
    """Fallback lento para resumen si la tabla cache no existe."""
    abc_filter = ""
    if clasificacion_abc:
        if clasificacion_abc == "SIN_VENTAS":
            abc_filter = "WHERE clasificacion_abc IS NULL"
        else:
            abc_filter = f"WHERE clasificacion_abc = '{clasificacion_abc}'"

    query = f"""
    WITH stock_por_ubicacion AS (
        SELECT ia.producto_id, ia.ubicacion_id, SUM(ia.cantidad) as stock
        FROM inventario_actual ia GROUP BY ia.producto_id, ia.ubicacion_id
    ),
    stock_agregado AS (
        SELECT s.producto_id,
            SUM(CASE WHEN s.ubicacion_id = 'cedi_seco' THEN s.stock ELSE 0 END) as stock_cedi_seco,
            SUM(CASE WHEN s.ubicacion_id = 'cedi_caracas' THEN s.stock ELSE 0 END) as stock_cedi_caracas,
            SUM(CASE WHEN POSITION('cedi' IN s.ubicacion_id) != 1 THEN s.stock ELSE 0 END) as stock_tiendas,
            SUM(s.stock) as stock_total
        FROM stock_por_ubicacion s GROUP BY s.producto_id
    ),
    ventas_2m AS (
        SELECT v.producto_id, SUM(v.cantidad_vendida) as ventas_2m_unidades
        FROM ventas v WHERE v.fecha_venta >= CURRENT_DATE - INTERVAL '2 months'
        GROUP BY v.producto_id
    ),
    ventas_6m AS (
        SELECT v.producto_id, SUM(v.cantidad_vendida * COALESCE(v.costo_unitario, 0)) as valor_consumo
        FROM ventas v WHERE v.fecha_venta >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY v.producto_id
        HAVING COUNT(DISTINCT DATE_TRUNC('week', v.fecha_venta)) >= 4
    ),
    abc_ranked AS (
        SELECT producto_id, ROW_NUMBER() OVER (ORDER BY valor_consumo DESC) as ranking, COUNT(*) OVER () as total
        FROM ventas_6m WHERE valor_consumo > 0
    ),
    abc_classification AS (
        SELECT producto_id,
            CASE WHEN ranking <= (total * 0.20) THEN 'A' WHEN ranking <= (total * 0.50) THEN 'B' ELSE 'C' END as clasificacion_abc
        FROM abc_ranked
    ),
    producto_completo AS (
        SELECT p.id, abc.clasificacion_abc,
            CASE
                WHEN COALESCE(sa.stock_total, 0) = 0 AND COALESCE(va.ventas_2m_unidades, 0) = 0 THEN 'FANTASMA'
                WHEN COALESCE(sa.stock_total, 0) = 0 AND COALESCE(va.ventas_2m_unidades, 0) > 0 THEN 'ANOMALIA'
                WHEN COALESCE(sa.stock_tiendas, 0) = 0 AND (COALESCE(sa.stock_cedi_seco, 0) > 0 OR COALESCE(sa.stock_cedi_caracas, 0) > 0) AND COALESCE(va.ventas_2m_unidades, 0) = 0 THEN 'CRITICO'
                WHEN COALESCE(sa.stock_total, 0) > 0 AND COALESCE(va.ventas_2m_unidades, 0) = 0 THEN 'DORMIDO'
                WHEN COALESCE(va.ventas_2m_unidades, 0) > 0 AND (COALESCE(sa.stock_tiendas, 0) < 10 OR (COALESCE(sa.stock_cedi_seco, 0) = 0 AND COALESCE(sa.stock_cedi_caracas, 0) = 0)) THEN 'AGOTANDOSE'
                ELSE 'ACTIVO'
            END as estado
        FROM productos p
        LEFT JOIN stock_agregado sa ON p.id = sa.producto_id
        LEFT JOIN ventas_2m va ON p.id = va.producto_id
        LEFT JOIN abc_classification abc ON p.id = abc.producto_id
    )
    SELECT COALESCE(clasificacion_abc, 'SIN_VENTAS') as clasificacion_abc, estado, COUNT(*) as cantidad
    FROM producto_completo {abc_filter} GROUP BY clasificacion_abc, estado
    """

    results = execute_query_dict(query)
    por_estado = {}
    por_abc = {}

    for r in results:
        abc = r['clasificacion_abc']
        estado = r['estado']
        cantidad = r['cantidad']
        por_estado[estado] = por_estado.get(estado, 0) + cantidad
        por_abc[abc] = por_abc.get(abc, 0) + cantidad

    return {"por_estado": por_estado, "por_abc": por_abc, "total": sum(por_estado.values()), "filtro_abc": clasificacion_abc}


@app.get("/api/productos/{codigo}/detalle-tiendas", tags=["Productos"])
async def get_producto_detalle_tiendas(codigo: str):
    """
    Detalle de stock y ventas por tienda para un producto específico.
    """
    try:
        query = """
        WITH stock_por_tienda AS (
            SELECT
                ia.ubicacion_id,
                SUM(ia.cantidad) as stock
            FROM inventario_actual ia
            WHERE ia.producto_id = %s
            GROUP BY ia.ubicacion_id
        ),
        ventas_por_tienda AS (
            SELECT
                v.ubicacion_id,
                SUM(v.cantidad_vendida) as ventas_2m,
                SUM(v.venta_total) as valor_2m,
                MAX(v.fecha_venta) as ultima_venta,
                SUM(CASE WHEN v.cantidad_vendida > 0 THEN 1 ELSE 0 END) as num_ventas,
                SUM(CASE WHEN v.cantidad_vendida < 0 THEN 1 ELSE 0 END) as num_devoluciones
            FROM ventas v
            WHERE v.producto_id = %s
              AND v.fecha_venta >= CURRENT_DATE - INTERVAL '2 months'
            GROUP BY v.ubicacion_id
        )
        SELECT
            u.id as ubicacion_id,
            u.nombre as ubicacion_nombre,
            CASE WHEN POSITION('cedi' IN u.id) = 1 THEN 'CEDI' ELSE 'TIENDA' END as tipo,
            COALESCE(s.stock, 0) as stock,
            COALESCE(v.ventas_2m, 0) as ventas_2m,
            COALESCE(v.valor_2m, 0) as valor_2m,
            v.ultima_venta,
            COALESCE(v.num_ventas, 0) as num_ventas,
            COALESCE(v.num_devoluciones, 0) as num_devoluciones
        FROM ubicaciones u
        LEFT JOIN stock_por_tienda s ON u.id = s.ubicacion_id
        LEFT JOIN ventas_por_tienda v ON u.id = v.ubicacion_id
        ORDER BY
            CASE WHEN POSITION('cedi' IN u.id) = 1 THEN 1 ELSE 0 END,
            u.nombre
        """

        results = execute_query_dict(query, (codigo, codigo))

        # Convertir fechas
        for r in results:
            if r.get('ultima_venta'):
                r['ultima_venta'] = r['ultima_venta'].strftime('%Y-%m-%d')

        # Info del producto
        producto_query = """
            SELECT id as codigo, nombre as descripcion, categoria
            FROM productos WHERE id = %s
        """
        producto = execute_query_dict(producto_query, (codigo,))

        return {
            "producto": producto[0] if producto else None,
            "tiendas": results
        }

    except Exception as e:
        logger.error(f"Error en detalle tiendas: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/productos/{codigo}/detalle-completo", tags=["Productos"])
async def get_producto_detalle_completo(codigo: str):
    """
    Vista 360° de un producto: info básica, clasificación ABC global,
    inventarios por tienda.

    Args:
        codigo: Código del producto (ej: "003289")

    Returns:
        Objeto completo con toda la información del producto
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # 1. Información básica del producto desde tabla productos
            cursor.execute("""
                SELECT
                    p.id,
                    p.codigo,
                    p.nombre as descripcion,
                    p.categoria,
                    p.marca,
                    c.clase_abc,
                    c.venta_30d,
                    c.rank_cantidad,
                    c.penetracion_pct,
                    c.gap
                FROM productos p
                LEFT JOIN productos_abc_cache c ON c.producto_id = p.id
                WHERE p.id = %s OR p.codigo = %s
                LIMIT 1
            """, (codigo, codigo))

            producto_row = cursor.fetchone()

            if not producto_row:
                raise HTTPException(status_code=404, detail=f"Producto {codigo} no encontrado")

            producto_info = {
                "codigo": producto_row[1] or producto_row[0],
                "descripcion": producto_row[2],
                "categoria": producto_row[3],
                "marca": producto_row[4]
            }

            # Clasificación ABC global (desde cache)
            clasificacion_global = {
                "clasificacion_abc": producto_row[5] or "SIN_VENTAS",
                "clasificacion_xyz": None,  # TODO: Implementar XYZ
                "matriz": producto_row[5] if producto_row[5] else None,
                "venta_30d": float(producto_row[6]) if producto_row[6] else 0,
                "ranking_valor": producto_row[7],
                "penetracion_pct": float(producto_row[8]) if producto_row[8] else 0,
                "gap": producto_row[9]
            }

            # 2. Clasificaciones por ubicación (vacío por ahora - ABC es global)
            # En el futuro se puede implementar ABC por tienda
            clasificaciones = [{
                "ubicacion_id": "GLOBAL",
                "ubicacion_nombre": "Todas las tiendas",
                "clasificacion_abc": clasificacion_global["clasificacion_abc"],
                "clasificacion_xyz": None,
                "matriz": clasificacion_global["matriz"],
                "ranking_valor": clasificacion_global["ranking_valor"],
                "valor_consumo": clasificacion_global["venta_30d"],
                "coeficiente_variacion": None
            }]

            # 3. Inventarios por ubicación (TODAS las ubicaciones, no solo las que tienen stock)
            cursor.execute("""
                SELECT
                    u.id as ubicacion_id,
                    u.nombre as ubicacion_nombre,
                    u.tipo as tipo_ubicacion,
                    COALESCE(i.cantidad, 0) as cantidad,
                    i.fecha_actualizacion
                FROM ubicaciones u
                LEFT JOIN inventario_actual i ON i.ubicacion_id = u.id AND i.producto_id = %s
                ORDER BY u.tipo, u.nombre
            """, (codigo,))

            inv_result = cursor.fetchall()
            inventarios = []
            total_inventario = 0
            ubicaciones_con_stock = 0
            ubicaciones_sin_stock = 0

            for row in inv_result:
                cantidad = float(row[3]) if row[3] else 0
                total_inventario += cantidad
                if cantidad > 0:
                    ubicaciones_con_stock += 1
                else:
                    ubicaciones_sin_stock += 1

                inventarios.append({
                    "ubicacion_id": row[0],
                    "ubicacion_nombre": row[1],
                    "tipo_ubicacion": row[2],
                    "cantidad_actual": cantidad,
                    "ultima_actualizacion": row[4].isoformat() if row[4] else None
                })

            cursor.close()

            # 4. Métricas globales
            metricas_globales = {
                "total_inventario": total_inventario,
                "ubicaciones_con_stock": ubicaciones_con_stock,
                "ubicaciones_sin_stock": ubicaciones_sin_stock,
                "total_ubicaciones": ubicaciones_con_stock + ubicaciones_sin_stock if inventarios else ubicaciones_sin_stock
            }

            return {
                "producto": producto_info,
                "clasificacion_global": clasificacion_global,
                "clasificaciones": clasificaciones,
                "inventarios": inventarios,
                "metricas_globales": metricas_globales
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo detalle completo de producto: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/productos/{codigo}/ventas-semanales", tags=["Productos"])
async def get_ventas_semanales(codigo: str, ubicacion_id: Optional[str] = None):
    """
    Obtiene serie temporal de ventas semanales para un producto.

    Retorna datos agrupados por semana (últimas 52 semanas) con:
    - semana: YYYY-Www (ej: 2025-W01)
    - unidades: Total de unidades vendidas
    - valor: Valor total de ventas
    - promedio_diario: Promedio de unidades por día en esa semana

    Args:
        codigo: Código del producto
        ubicacion_id: Opcional - filtrar por ubicación específica
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Query PostgreSQL para ventas semanales
            if ubicacion_id:
                cursor.execute("""
                    SELECT
                        TO_CHAR(fecha_venta, 'IYYY-"W"IW') as semana,
                        SUM(cantidad_vendida) as unidades,
                        SUM(venta_total) as valor,
                        SUM(cantidad_vendida) / 7.0 as promedio_diario,
                        MIN(fecha_venta) as fecha_inicio_semana
                    FROM ventas
                    WHERE producto_id = %s
                        AND ubicacion_id = %s
                        AND fecha_venta >= CURRENT_DATE - INTERVAL '52 weeks'
                    GROUP BY TO_CHAR(fecha_venta, 'IYYY-"W"IW')
                    ORDER BY semana ASC
                """, (codigo, ubicacion_id))
            else:
                # Agregar todas las ubicaciones
                cursor.execute("""
                    SELECT
                        TO_CHAR(fecha_venta, 'IYYY-"W"IW') as semana,
                        SUM(cantidad_vendida) as unidades,
                        SUM(venta_total) as valor,
                        SUM(cantidad_vendida) / 7.0 as promedio_diario,
                        MIN(fecha_venta) as fecha_inicio_semana
                    FROM ventas
                    WHERE producto_id = %s
                        AND fecha_venta >= CURRENT_DATE - INTERVAL '52 weeks'
                    GROUP BY TO_CHAR(fecha_venta, 'IYYY-"W"IW')
                    ORDER BY semana ASC
                """, (codigo,))

            rows = cursor.fetchall()
            cursor.close()

            if not rows:
                return {
                    "codigo_producto": codigo,
                    "ubicacion_id": ubicacion_id,
                    "semanas": [],
                    "metricas": {
                        "semanas_con_ventas": 0,
                        "total_unidades": 0,
                        "total_valor": 0,
                        "promedio_semanal": 0,
                        "coeficiente_variacion": None
                    }
                }

            # Formatear datos de semanas
            semanas = []
            total_unidades = 0
            total_valor = 0
            unidades_por_semana = []

            for row in rows:
                unidades = float(row[1]) if row[1] else 0
                valor = float(row[2]) if row[2] else 0
                promedio_diario = float(row[3]) if row[3] else 0

                semanas.append({
                    "semana": row[0],
                    "unidades": round(unidades, 2),
                    "valor": round(valor, 2),
                    "promedio_diario": round(promedio_diario, 2),
                    "fecha_inicio": row[4].isoformat() if row[4] else None
                })

                total_unidades += unidades
                total_valor += valor
                unidades_por_semana.append(unidades)

            # Calcular métricas
            num_semanas = len(unidades_por_semana)
            promedio_semanal = total_unidades / num_semanas if num_semanas > 0 else 0

            # Calcular coeficiente de variación
            if num_semanas > 1 and promedio_semanal > 0:
                varianza = sum((x - promedio_semanal) ** 2 for x in unidades_por_semana) / (num_semanas - 1)
                desviacion = varianza ** 0.5
                cv = desviacion / promedio_semanal
            else:
                cv = None

            return {
                "codigo_producto": codigo,
                "ubicacion_id": ubicacion_id,
                "semanas": semanas,
                "metricas": {
                    "semanas_con_ventas": num_semanas,
                    "total_unidades": round(total_unidades, 2),
                    "total_valor": round(total_valor, 2),
                    "promedio_semanal": round(promedio_semanal, 2),
                    "coeficiente_variacion": round(cv, 4) if cv is not None else None
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo ventas semanales: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/productos/{codigo}/ventas-por-tienda", tags=["Productos"])
async def get_ventas_por_tienda(codigo: str, periodo: str = "1w"):
    """
    Obtiene ventas por tienda para un producto en un período específico.

    Args:
        codigo: Código del producto
        periodo: Período de tiempo (1w, 2w, 1m, 2m, 3m, 4m, 5m, 6m)

    Returns:
        Lista de ventas por tienda con total de unidades y transacciones
    """
    try:
        # Mapeo de períodos a días
        periodo_dias = {
            "1w": 7,
            "2w": 14,
            "1m": 30,
            "2m": 60,
            "3m": 90,
            "4m": 120,
            "5m": 150,
            "6m": 180
        }

        dias = periodo_dias.get(periodo, 7)

        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute(f"""
                SELECT
                    u.id as ubicacion_id,
                    u.nombre as ubicacion_nombre,
                    COALESCE(SUM(v.cantidad_vendida), 0) as total_unidades,
                    COUNT(DISTINCT v.numero_factura) as total_transacciones,
                    MAX(v.fecha_venta) as ultima_venta
                FROM ubicaciones u
                LEFT JOIN ventas v ON u.id = v.ubicacion_id
                    AND v.producto_id = %s
                    AND v.fecha_venta >= CURRENT_DATE - INTERVAL '{dias} days'
                WHERE u.tipo = 'tienda'
                GROUP BY u.id, u.nombre
                ORDER BY total_unidades DESC
            """, (codigo,))

            rows = cursor.fetchall()
            cursor.close()

            ventas_por_tienda = []
            total_general_unidades = 0
            total_general_transacciones = 0

            for row in rows:
                unidades = float(row[2]) if row[2] else 0
                transacciones = int(row[3]) if row[3] else 0

                ventas_por_tienda.append({
                    "ubicacion_id": row[0],
                    "ubicacion_nombre": row[1],
                    "total_unidades": round(unidades, 2),
                    "total_transacciones": transacciones,
                    "ultima_venta": row[4].isoformat() if row[4] else None
                })

                total_general_unidades += unidades
                total_general_transacciones += transacciones

            return {
                "codigo_producto": codigo,
                "periodo": periodo,
                "dias": dias,
                "ventas": ventas_por_tienda,
                "totales": {
                    "total_unidades": round(total_general_unidades, 2),
                    "total_transacciones": total_general_transacciones,
                    "tiendas_con_ventas": sum(1 for v in ventas_por_tienda if v["total_unidades"] > 0)
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo ventas por tienda: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/productos/{codigo}/historico-clasificacion", tags=["Productos"])
async def get_historico_clasificacion(codigo: str, ubicacion_id: Optional[str] = None):
    """
    Obtiene el histórico de clasificación ABC-XYZ de un producto.

    Por ahora, genera datos simulados basados en la clasificación actual.
    En el futuro, cuando implementemos snapshots periódicos, devolverá datos reales.

    Args:
        codigo: Código del producto
        ubicacion_id: ID de ubicación (opcional, si no se provee devuelve histórico global)

    Returns:
        Histórico de clasificación con datos por mes
    """
    try:
        with get_db_connection() as conn:
            # Obtener clasificación actual del producto
            if ubicacion_id:
                query = """
                    SELECT
                        clasificacion_abc_valor,
                        clasificacion_xyz,
                        matriz_abc_xyz,
                        ranking_valor,
                        coeficiente_variacion
                    FROM productos_abc_v2
                    WHERE codigo_producto = ? AND ubicacion_id = ?
                """
                params = [codigo, ubicacion_id]
            else:
                # Si no hay ubicacion_id, usar la clasificación dominante (la de mayor valor)
                query = """
                    SELECT
                        clasificacion_abc_valor,
                        clasificacion_xyz,
                        matriz_abc_xyz,
                        ranking_valor,
                        coeficiente_variacion
                    FROM productos_abc_v2
                    WHERE codigo_producto = ?
                    ORDER BY valor_consumo_total DESC
                    LIMIT 1
                """
                params = [codigo]

            row = conn.execute(query, params).fetchone()

            if not row:
                raise HTTPException(status_code=404, detail=f"No se encontró clasificación para el producto {codigo}")

            clasificacion_abc = row[0]
            clasificacion_xyz = row[1]
            matriz = row[2]
            ranking = row[3]
            cv = float(row[4]) if row[4] else None

            # Generar datos históricos simulados (últimos 6 meses)
            # TODO: Reemplazar con datos reales cuando implementemos snapshots históricos
            from datetime import datetime, timedelta

            historico = []
            fecha_actual = datetime.now()

            # Mapeo de clasificaciones a números para variación
            abc_to_num = {'A': 1, 'B': 2, 'C': 3}
            xyz_to_num = {'X': 1, 'Y': 2, 'Z': 3}
            num_to_abc = {1: 'A', 2: 'B', 3: 'C'}
            num_to_xyz = {1: 'X', 2: 'Y', 3: 'Z'}

            abc_num = abc_to_num.get(clasificacion_abc, 2)
            xyz_num = xyz_to_num.get(clasificacion_xyz, 2)

            for i in range(12, 0, -1):
                # Fecha del mes
                fecha = fecha_actual - timedelta(days=30 * i)
                mes = fecha.strftime('%Y-%m')

                # Simular pequeñas variaciones en la clasificación
                # Productos estables (X) varían menos que los volátiles (Z)
                import random

                if clasificacion_xyz == 'X':
                    # Muy estable, casi no cambia
                    abc_var = random.choice([0, 0, 0, -1, 1]) if i > 3 else 0
                    xyz_var = 0
                elif clasificacion_xyz == 'Y':
                    # Algo variable
                    abc_var = random.choice([0, 0, -1, 1]) if i > 3 else 0
                    xyz_var = random.choice([0, 0, -1, 1]) if i > 4 else 0
                else:  # Z
                    # Muy variable
                    abc_var = random.choice([0, -1, 1, -1, 1]) if i > 2 else 0
                    xyz_var = random.choice([0, -1, 1]) if i > 3 else 0

                abc_hist = max(1, min(3, abc_num + abc_var))
                xyz_hist = max(1, min(3, xyz_num + xyz_var))

                abc_hist_str = num_to_abc[abc_hist]
                xyz_hist_str = num_to_xyz[xyz_hist]
                matriz_hist = f"{abc_hist_str}{xyz_hist_str}"

                # Simular ranking con variación
                ranking_var = random.randint(-20, 20) if i > 2 else 0
                ranking_hist = max(1, ranking + ranking_var)

                # Simular CV con variación para productos volátiles
                if cv is not None:
                    if clasificacion_xyz == 'Z':
                        cv_var = random.uniform(-0.2, 0.2)
                    elif clasificacion_xyz == 'Y':
                        cv_var = random.uniform(-0.1, 0.1)
                    else:
                        cv_var = random.uniform(-0.05, 0.05)
                    cv_hist = max(0, cv + cv_var)
                else:
                    cv_hist = None

                historico.append({
                    "mes": mes,
                    "clasificacion_abc": abc_hist_str,
                    "clasificacion_xyz": xyz_hist_str,
                    "matriz": matriz_hist,
                    "ranking_valor": ranking_hist,
                    "coeficiente_variacion": round(cv_hist, 4) if cv_hist is not None else None
                })

            return {
                "codigo_producto": codigo,
                "ubicacion_id": ubicacion_id,
                "clasificacion_actual": {
                    "abc": clasificacion_abc,
                    "xyz": clasificacion_xyz,
                    "matriz": matriz,
                    "ranking": ranking,
                    "cv": round(cv, 4) if cv is not None else None
                },
                "historico": historico,
                "nota": "Datos históricos simulados. Implementación de snapshots reales pendiente."
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo histórico de clasificación: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/productos/{codigo}/historico-inventario", tags=["Productos"])
async def get_historico_inventario(
    codigo: str,
    ubicacion_id: Optional[str] = None,
    almacen_codigo: Optional[str] = None,
    dias: int = 90
):
    """
    Obtiene el histórico de inventario de un producto específico.
    Incluye tanto los snapshots históricos como el estado actual.

    Args:
        codigo: Código del producto
        ubicacion_id: Filtrar por ubicación específica
        almacen_codigo: Filtrar por almacén específico (para tiendas KLK)
        dias: Número de días hacia atrás (default 90)

    Returns:
        Lista de snapshots históricos + estado actual (marcado con es_actual=true)
    """
    try:
        with get_postgres_connection() as conn:
            cursor = conn.cursor()

            # Obtener producto_id desde el código
            cursor.execute("SELECT id FROM productos WHERE codigo = %s", (codigo,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Producto {codigo} no encontrado")

            producto_id = row[0]

            # 1. Construir query para histórico
            query_historico = """
                SELECT
                    h.fecha_snapshot,
                    h.ubicacion_id,
                    u.nombre as ubicacion_nombre,
                    h.almacen_codigo,
                    h.cantidad
                FROM inventario_historico h
                JOIN ubicaciones u ON h.ubicacion_id = u.id
                WHERE h.producto_id = %s
                  AND h.fecha_snapshot >= CURRENT_DATE - INTERVAL '%s days'
            """
            params_historico = [producto_id, dias]

            if ubicacion_id:
                query_historico += " AND h.ubicacion_id = %s"
                params_historico.append(ubicacion_id)

            if almacen_codigo:
                query_historico += " AND h.almacen_codigo = %s"
                params_historico.append(almacen_codigo)

            query_historico += " ORDER BY h.fecha_snapshot ASC"

            cursor.execute(query_historico, params_historico)
            rows_historico = cursor.fetchall()

            historico = []
            for row in rows_historico:
                historico.append({
                    "fecha_snapshot": row[0].isoformat() if row[0] else None,
                    "ubicacion_id": row[1],
                    "ubicacion_nombre": row[2],
                    "almacen_codigo": row[3],
                    "cantidad": float(row[4]),
                    "es_actual": False
                })

            # 2. Obtener inventario actual
            query_actual = """
                SELECT
                    ia.fecha_actualizacion,
                    ia.ubicacion_id,
                    u.nombre as ubicacion_nombre,
                    ia.almacen_codigo,
                    ia.cantidad
                FROM inventario_actual ia
                JOIN ubicaciones u ON ia.ubicacion_id = u.id
                WHERE ia.producto_id = %s
            """
            params_actual = [producto_id]

            if ubicacion_id:
                query_actual += " AND ia.ubicacion_id = %s"
                params_actual.append(ubicacion_id)

            if almacen_codigo:
                query_actual += " AND ia.almacen_codigo = %s"
                params_actual.append(almacen_codigo)

            cursor.execute(query_actual, params_actual)
            rows_actual = cursor.fetchall()

            # Agregar el inventario actual al final (marcado como es_actual=True)
            for row in rows_actual:
                historico.append({
                    "fecha_snapshot": row[0].isoformat() if row[0] else None,
                    "ubicacion_id": row[1],
                    "ubicacion_nombre": row[2],
                    "almacen_codigo": row[3],
                    "cantidad": float(row[4]),
                    "es_actual": True
                })

            # Ordenar todo por fecha (histórico + actual)
            historico.sort(key=lambda x: x["fecha_snapshot"] if x["fecha_snapshot"] else "")

            cursor.close()

            return {
                "codigo_producto": codigo,
                "ubicacion_id": ubicacion_id,
                "almacen_codigo": almacen_codigo,
                "dias": dias,
                "total_snapshots": len(historico),
                "historico": historico
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo histórico de inventario: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/productos/{codigo}/reconciliacion-inventario", tags=["Productos"])
async def get_reconciliacion_inventario(
    codigo: str,
    ubicacion_id: str,
    almacen_codigo: Optional[str] = None,
    horas: int = 24
):
    """
    Obtiene la reconciliación de inventario vs ventas para un producto.
    Agrupa los datos en períodos de 2 horas para un análisis más compacto.

    Args:
        codigo: Código del producto
        ubicacion_id: Ubicación específica (requerido)
        almacen_codigo: Filtrar por almacén específico
        horas: Número de horas hacia atrás (default 24)

    Returns:
        Lista de períodos (cada 2 horas) con stock_inicio, stock_fin, ventas y diferencia
    """
    try:
        with get_postgres_connection() as conn:
            cursor = conn.cursor()

            # Obtener producto_id desde el código
            cursor.execute("SELECT id FROM productos WHERE codigo = %s", (codigo,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Producto {codigo} no encontrado")

            producto_id = row[0]

            # Query de reconciliación agrupada cada 2 horas
            # Usamos date_trunc para agrupar en bloques de 2 horas
            query = """
                WITH snapshots_raw AS (
                    SELECT
                        fecha_snapshot,
                        almacen_codigo,
                        cantidad,
                        -- Agrupar en bloques de 2 horas (0-2, 2-4, 4-6, etc.)
                        DATE_TRUNC('hour', fecha_snapshot) -
                            INTERVAL '1 hour' * (EXTRACT(HOUR FROM fecha_snapshot)::int %% 2) as bloque_2h
                    FROM inventario_historico
                    WHERE ubicacion_id = %s
                        AND producto_id = %s
                        AND fecha_snapshot >= NOW() - INTERVAL '1 hour' * %s
            """
            params = [ubicacion_id, producto_id, horas]

            if almacen_codigo:
                query += " AND almacen_codigo = %s"
                params.append(almacen_codigo)

            query += """
                ),
                -- Obtener primer y último snapshot de cada bloque de 2 horas
                bloques AS (
                    SELECT
                        bloque_2h,
                        almacen_codigo,
                        MIN(fecha_snapshot) as fecha_inicio,
                        MAX(fecha_snapshot) as fecha_fin,
                        (SELECT cantidad FROM snapshots_raw sr2
                         WHERE sr2.bloque_2h = sr.bloque_2h
                           AND sr2.almacen_codigo = sr.almacen_codigo
                         ORDER BY sr2.fecha_snapshot ASC LIMIT 1) as stock_inicio,
                        (SELECT cantidad FROM snapshots_raw sr2
                         WHERE sr2.bloque_2h = sr.bloque_2h
                           AND sr2.almacen_codigo = sr.almacen_codigo
                         ORDER BY sr2.fecha_snapshot DESC LIMIT 1) as stock_fin
                    FROM snapshots_raw sr
                    GROUP BY bloque_2h, almacen_codigo
                )
                SELECT
                    b.fecha_inicio,
                    b.fecha_fin,
                    b.almacen_codigo,
                    b.stock_inicio,
                    b.stock_fin,
                    b.stock_fin - b.stock_inicio as cambio_inventario,
                    COALESCE((
                        SELECT SUM(cantidad_vendida)
                        FROM ventas
                        WHERE ubicacion_id = %s
                        AND producto_id = %s
                        AND fecha_venta >= b.fecha_inicio
                        AND fecha_venta <= b.fecha_fin
                    ), 0) as ventas_periodo
                FROM bloques b
                ORDER BY b.almacen_codigo, b.bloque_2h
            """
            params.extend([ubicacion_id, producto_id])

            cursor.execute(query, params)
            rows = cursor.fetchall()

            reconciliacion = []
            for row in rows:
                cambio_inv = float(row[5]) if row[5] else 0
                ventas = float(row[6]) if row[6] else 0
                # Diferencia = cambio_inventario + ventas
                # Si es 0, todo cuadra (el inventario bajó exactamente lo que se vendió)
                # Si es positivo, hay entrada de mercancía o ajuste positivo
                # Si es negativo, hay merma/pérdida no explicada
                diferencia = cambio_inv + ventas

                reconciliacion.append({
                    "fecha_inicio": row[0].isoformat() if row[0] else None,
                    "fecha_fin": row[1].isoformat() if row[1] else None,
                    "almacen_codigo": row[2],
                    "stock_inicio": float(row[3]) if row[3] else 0,
                    "stock_fin": float(row[4]) if row[4] else 0,
                    "cambio_inventario": cambio_inv,
                    "ventas": ventas,
                    "diferencia": diferencia
                })

            cursor.close()

            # Calcular totales
            total_ventas = sum(r["ventas"] for r in reconciliacion)
            total_cambio = sum(r["cambio_inventario"] for r in reconciliacion)
            total_diferencia = sum(r["diferencia"] for r in reconciliacion)

            return {
                "codigo_producto": codigo,
                "ubicacion_id": ubicacion_id,
                "almacen_codigo": almacen_codigo,
                "horas": horas,
                "total_periodos": len(reconciliacion),
                "resumen": {
                    "total_ventas": total_ventas,
                    "total_cambio_inventario": total_cambio,
                    "total_diferencia": total_diferencia
                },
                "periodos": reconciliacion
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo reconciliación de inventario: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/stock", response_model=PaginatedStockResponse, tags=["Inventario"])
async def get_stock(
    ubicacion_id: Optional[str] = None,
    almacen_codigo: Optional[str] = None,
    categoria: Optional[str] = None,
    estado_criticidad: Optional[str] = None,
    clasificacion_producto: Optional[str] = None,
    clase_abc: Optional[str] = None,
    top_ventas: Optional[int] = None,
    velocidad_venta: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = 'desc'
):
    """
    Obtiene el estado del stock actual con paginación server-side y métricas avanzadas.

    Incluye:
    - Demanda P75 (últimos 20 días)
    - Días de cobertura de stock
    - Estado de criticidad (CRITICO, URGENTE, OPTIMO, EXCESO, SIN_DEMANDA)
    - Clasificación de producto (FANTASMA, ANOMALIA, DORMIDO, ACTIVO)
    - Clasificación ABC (A, B, C, SIN_VENTAS)
    - Ranking por ventas en la tienda

    Args:
        ubicacion_id: Filtrar por ID de ubicación (requerido para métricas avanzadas)
        almacen_codigo: Filtrar por código de almacén
        categoria: Filtrar por categoría
        estado_criticidad: CRITICO, URGENTE, OPTIMO, EXCESO, SIN_DEMANDA
        clasificacion_producto: FANTASMA, ANOMALIA, DORMIDO, ACTIVO
        clase_abc: A, B, C, SIN_VENTAS
        top_ventas: Top N productos por ventas (50, 100, 200)
        velocidad_venta: SIN_VENTAS, BAJA (1-5/mes), MEDIA (6-15/mes), ALTA (16-30/mes), MUY_ALTA (>30/mes)
        page: Número de página
        page_size: Items por página
        search: Buscar por código o descripción
        sort_by: stock, peso, dias_stock, rank_ventas
        sort_order: asc o desc
    """
    try:
        if page < 1:
            raise HTTPException(status_code=400, detail="El número de página debe ser >= 1")
        if page_size < 1 or page_size > 100000:
            raise HTTPException(status_code=400, detail="page_size debe estar entre 1 y 100000")

        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Base params para filtros
            base_params = []
            base_where = "p.activo = true AND u.activo = true"

            if ubicacion_id:
                base_where += " AND ia.ubicacion_id = %s"
                base_params.append(ubicacion_id)

            if almacen_codigo:
                base_where += " AND ia.almacen_codigo = %s"
                base_params.append(almacen_codigo)

            if categoria:
                base_where += " AND p.categoria = %s"
                base_params.append(categoria)

            if search:
                search_term = f"%{search}%"
                base_where += " AND (p.codigo ILIKE %s OR p.descripcion ILIKE %s)"
                base_params.extend([search_term, search_term])

            # Query principal con CTEs para calcular métricas
            # Lead time default: 1.5 días
            # NOTA: Para tienda_18 (PARAÍSO) se excluye 2025-12-06 (inauguración con ventas atípicas)
            main_query = f"""
            WITH ventas_20d AS (
                -- Ventas diarias por producto en la ubicación (últimos 20 días)
                SELECT
                    producto_id,
                    DATE(fecha_venta) as fecha,
                    SUM(cantidad_vendida) as total_dia
                FROM ventas
                WHERE ubicacion_id = %s
                  AND fecha_venta >= CURRENT_DATE - INTERVAL '20 days'
                  AND fecha_venta < CURRENT_DATE
                  AND NOT (ubicacion_id = 'tienda_18' AND DATE(fecha_venta) = '2025-12-06')
                GROUP BY producto_id, DATE(fecha_venta)
            ),
            demanda_p75 AS (
                -- P75 de ventas diarias (más conservador que promedio)
                SELECT
                    producto_id,
                    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_dia) as p75,
                    STDDEV(total_dia) as sigma_demanda,
                    COUNT(DISTINCT fecha) as dias_con_venta
                FROM ventas_20d
                GROUP BY producto_id
            ),
            ventas_30d AS (
                -- Total ventas 30 días para clasificación producto
                SELECT
                    producto_id,
                    SUM(cantidad_vendida) as total_30d
                FROM ventas
                WHERE ubicacion_id = %s
                  AND fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY producto_id
            ),
            ventas_14d AS (
                -- Total ventas 14 días para detectar dormidos
                SELECT
                    producto_id,
                    SUM(cantidad_vendida) as total_14d
                FROM ventas
                WHERE ubicacion_id = %s
                  AND fecha_venta >= CURRENT_DATE - INTERVAL '14 days'
                GROUP BY producto_id
            ),
            ventas_60d AS (
                -- Total ventas 60 días (2 meses)
                SELECT
                    producto_id,
                    SUM(cantidad_vendida) as total_60d
                FROM ventas
                WHERE ubicacion_id = %s
                  AND fecha_venta >= CURRENT_DATE - INTERVAL '60 days'
                GROUP BY producto_id
            ),
            abc_tienda AS (
                -- Clasificación ABC de la tienda
                SELECT
                    producto_id,
                    clase_abc,
                    rank_cantidad
                FROM productos_abc_tienda
                WHERE ubicacion_id = %s
            ),
            config_abc AS (
                -- Configuración de multiplicadores por clase ABC
                SELECT
                    clasificacion_abc,
                    stock_min_multiplicador,
                    stock_seg_multiplicador,
                    stock_max_multiplicador,
                    lead_time_dias
                FROM config_inventario_tienda
                WHERE tienda_id = %s AND activo = true
            ),
            stock_data AS (
                SELECT
                    ia.ubicacion_id,
                    u.nombre as ubicacion_nombre,
                    'tienda' as tipo_ubicacion,
                    ia.producto_id,
                    COALESCE(p.codigo, '') as codigo_producto,
                    COALESCE(p.codigo_barras, '') as codigo_barras,
                    COALESCE(NULLIF(p.descripcion, ''), 'Sin Descripción') as descripcion_producto,
                    COALESCE(NULLIF(p.categoria, ''), 'Sin Categoría') as categoria,
                    COALESCE(p.marca, '') as marca,
                    ia.cantidad as stock_actual,
                    -- Demanda P75
                    COALESCE(dp.p75, 0) as demanda_p75,
                    COALESCE(dp.sigma_demanda, 0) as sigma_demanda,
                    -- Clase ABC y ranking
                    COALESCE(abc.clase_abc, 'SIN_VENTAS') as clase_abc,
                    abc.rank_cantidad as rank_ventas,
                    -- Configuración ABC (usar defaults si no hay config específica)
                    COALESCE(cfg.stock_min_multiplicador, 1.5) as stock_min_mult,
                    COALESCE(cfg.stock_seg_multiplicador, 1.0) as stock_seg_mult,
                    COALESCE(cfg.stock_max_multiplicador,
                        CASE COALESCE(abc.clase_abc, 'C')
                            WHEN 'A' THEN 5
                            WHEN 'B' THEN 10
                            ELSE 20
                        END
                    ) as stock_max_mult,
                    COALESCE(cfg.lead_time_dias, 1.5) as lead_time,
                    -- Ventas para clasificación producto
                    COALESCE(v30.total_30d, 0) as ventas_30d,
                    COALESCE(v14.total_14d, 0) as ventas_14d,
                    COALESCE(v60.total_60d, 0) as ventas_60d,
                    -- Metadata
                    TO_CHAR(ia.fecha_actualizacion, 'YYYY-MM-DD HH24:MI:SS') as fecha_extraccion
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                INNER JOIN ubicaciones u ON ia.ubicacion_id = u.id
                LEFT JOIN demanda_p75 dp ON dp.producto_id = ia.producto_id
                LEFT JOIN abc_tienda abc ON abc.producto_id = ia.producto_id
                LEFT JOIN ventas_60d v60 ON v60.producto_id = ia.producto_id
                LEFT JOIN config_abc cfg ON cfg.clasificacion_abc = abc.clase_abc
                LEFT JOIN ventas_30d v30 ON v30.producto_id = ia.producto_id
                LEFT JOIN ventas_14d v14 ON v14.producto_id = ia.producto_id
                WHERE {base_where}
            ),
            calculated AS (
                SELECT
                    *,
                    -- Calcular parámetros de inventario
                    CASE WHEN demanda_p75 > 0 THEN
                        demanda_p75 * lead_time + (1.65 * sigma_demanda * SQRT(lead_time))
                    ELSE 0 END as stock_seguridad,
                    CASE WHEN demanda_p75 > 0 THEN
                        demanda_p75 * lead_time * stock_min_mult + (1.65 * sigma_demanda * SQRT(lead_time))
                    ELSE 0 END as punto_reorden,
                    CASE WHEN demanda_p75 > 0 THEN
                        demanda_p75 * stock_max_mult
                    ELSE 0 END as stock_maximo,
                    -- Días de cobertura
                    CASE WHEN demanda_p75 > 0 THEN
                        stock_actual / demanda_p75
                    ELSE NULL END as dias_cobertura_actual,
                    -- Clasificación de producto
                    CASE
                        WHEN stock_actual <= 0 AND ventas_30d = 0 THEN 'FANTASMA'
                        WHEN stock_actual <= 0 AND ventas_30d > 0 THEN 'ANOMALIA'
                        WHEN stock_actual > 0 AND ventas_14d = 0 THEN 'DORMIDO'
                        ELSE 'ACTIVO'
                    END as clasificacion_producto,
                    -- Velocidad de venta (basado en ventas_30d)
                    CASE
                        WHEN ventas_30d = 0 THEN 'SIN_VENTAS'
                        WHEN ventas_30d BETWEEN 1 AND 5 THEN 'BAJA'
                        WHEN ventas_30d BETWEEN 6 AND 15 THEN 'MEDIA'
                        WHEN ventas_30d BETWEEN 16 AND 30 THEN 'ALTA'
                        ELSE 'MUY_ALTA'
                    END as velocidad_venta
                FROM stock_data
            ),
            final AS (
                SELECT
                    *,
                    -- Estado de criticidad basado en SS, ROP, MAX
                    CASE
                        WHEN demanda_p75 = 0 OR demanda_p75 IS NULL THEN 'SIN_DEMANDA'
                        WHEN dias_cobertura_actual IS NULL THEN 'SIN_DEMANDA'
                        WHEN stock_actual <= stock_seguridad THEN 'CRITICO'
                        WHEN stock_actual <= punto_reorden THEN 'URGENTE'
                        WHEN stock_actual <= stock_maximo THEN 'OPTIMO'
                        ELSE 'EXCESO'
                    END as estado_criticidad,
                    -- Estado stock legacy
                    CASE
                        WHEN stock_actual = 0 THEN 'sin_stock'
                        WHEN stock_actual < 0 THEN 'stock_negativo'
                        ELSE 'normal'
                    END as estado_stock
                FROM calculated
            )
            SELECT * FROM final
            WHERE 1=1
            """

            # Params para los CTEs (ubicacion_id se usa 6 veces en CTEs)
            # Luego base_params puede agregar más (ubicacion_id, almacen, categoria, search)
            query_params = []
            if ubicacion_id:
                # 6 veces para los CTEs: ventas_20d, ventas_30d, ventas_14d, ventas_60d, abc_tienda, config_abc
                query_params = [ubicacion_id] * 6 + base_params
            else:
                # Sin ubicacion_id, los CTEs de ventas no funcionan bien
                # Usamos un valor que no matchea nada para evitar errores SQL
                query_params = ['__none__'] * 6 + base_params

            # Filtros adicionales sobre campos calculados
            filter_params = []
            if estado_criticidad:
                main_query += " AND estado_criticidad = %s"
                filter_params.append(estado_criticidad)

            if clasificacion_producto:
                main_query += " AND clasificacion_producto = %s"
                filter_params.append(clasificacion_producto)

            if clase_abc:
                main_query += " AND clase_abc = %s"
                filter_params.append(clase_abc)

            if top_ventas:
                main_query += " AND rank_ventas <= %s"
                filter_params.append(top_ventas)

            if velocidad_venta:
                main_query += " AND velocidad_venta = %s"
                filter_params.append(velocidad_venta)

            # Count query
            count_query = f"SELECT COUNT(*) FROM ({main_query}) as counted"
            cursor.execute(count_query, tuple(query_params + filter_params))
            total_items = cursor.fetchone()[0]

            # Stats query
            stats_query = f"""
            SELECT
                SUM(CASE WHEN stock_actual = 0 THEN 1 ELSE 0 END) as stock_cero,
                SUM(CASE WHEN stock_actual < 0 THEN 1 ELSE 0 END) as stock_negativo,
                SUM(CASE WHEN estado_criticidad = 'CRITICO' THEN 1 ELSE 0 END) as criticos,
                SUM(CASE WHEN estado_criticidad = 'URGENTE' THEN 1 ELSE 0 END) as urgentes,
                SUM(CASE WHEN clasificacion_producto = 'FANTASMA' THEN 1 ELSE 0 END) as fantasmas,
                SUM(CASE WHEN clasificacion_producto = 'ANOMALIA' THEN 1 ELSE 0 END) as anomalias,
                SUM(CASE WHEN clasificacion_producto = 'DORMIDO' THEN 1 ELSE 0 END) as dormidos,
                SUM(CASE WHEN clasificacion_producto = 'ACTIVO' THEN 1 ELSE 0 END) as activos
            FROM ({main_query}) as stats
            """
            cursor.execute(stats_query, tuple(query_params + filter_params))
            stats = cursor.fetchone()

            # Paginación
            total_pages = max(1, (total_items + page_size - 1) // page_size)
            offset = (page - 1) * page_size

            # Ordenamiento
            order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
            order_field = 'stock_actual'
            if sort_by == 'dias_stock':
                order_field = 'dias_cobertura_actual'
            elif sort_by == 'rank_ventas':
                order_field = 'rank_ventas'
                order_direction = 'ASC' if sort_order == 'asc' else 'ASC'  # Default ASC for rank
            elif sort_by == 'peso':
                order_field = 'stock_actual'  # No tenemos peso, usar stock
            elif sort_by == 'stock':
                order_field = 'stock_actual'

            final_query = f"""
            {main_query}
            ORDER BY {order_field} {order_direction} NULLS LAST
            LIMIT %s OFFSET %s
            """

            cursor.execute(final_query, tuple(query_params + filter_params + [page_size, offset]))
            result = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]
            cursor.close()

        # Construir respuesta
        stock_data = []
        for row in result:
            row_dict = dict(zip(columns, row))
            stock_data.append(StockResponse(
                ubicacion_id=row_dict['ubicacion_id'],
                ubicacion_nombre=row_dict['ubicacion_nombre'],
                ubicacion_tipo=row_dict['tipo_ubicacion'],
                producto_id=row_dict['producto_id'],
                codigo_producto=row_dict['codigo_producto'],
                codigo_barras=row_dict['codigo_barras'],
                descripcion_producto=row_dict['descripcion_producto'],
                categoria=row_dict['categoria'],
                marca=row_dict['marca'],
                stock_actual=row_dict['stock_actual'],
                stock_minimo=row_dict.get('stock_seguridad'),
                stock_maximo=row_dict.get('stock_maximo'),
                punto_reorden=row_dict.get('punto_reorden'),
                precio_venta=None,
                cantidad_bultos=None,
                estado_stock=row_dict['estado_stock'],
                dias_cobertura_actual=row_dict.get('dias_cobertura_actual'),
                es_producto_estrella=False,
                fecha_extraccion=row_dict['fecha_extraccion'],
                peso_producto_kg=None,
                peso_total_kg=None,
                # Nuevos campos
                demanda_p75=row_dict.get('demanda_p75'),
                ventas_60d=row_dict.get('ventas_60d'),
                estado_criticidad=row_dict.get('estado_criticidad'),
                clasificacion_producto=row_dict.get('clasificacion_producto'),
                clase_abc=row_dict.get('clase_abc'),
                rank_ventas=row_dict.get('rank_ventas'),
                velocidad_venta=row_dict.get('velocidad_venta')
            ))

        pagination = PaginationMetadata(
            total_items=total_items,
            total_pages=total_pages,
            current_page=page,
            page_size=page_size,
            has_next=page < total_pages,
            has_previous=page > 1,
            stock_cero=stats[0] or 0,
            stock_negativo=stats[1] or 0,
            criticos=stats[2] or 0,
            urgentes=stats[3] or 0,
            fantasmas=stats[4] or 0,
            anomalias=stats[5] or 0,
            dormidos=stats[6] or 0,
            activos=stats[7] or 0
        )

        return PaginatedStockResponse(
            data=stock_data,
            pagination=pagination
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo stock: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


# ============================================================================
# ENDPOINTS CENTRO DE COMANDO DE CORRECCIÓN (Auditoría de Inventario)
# ============================================================================

@app.get("/api/stock/anomalias/{ubicacion_id}", response_model=AnomaliaStockResponse, tags=["Auditoría Inventario"])
async def get_anomalias_stock(
    ubicacion_id: str,
    almacen_codigo: Optional[str] = None
):
    """
    Detecta productos con stock negativo para una ubicación específica.

    Muestra productos con cantidad < 0, junto con evidencia de ventas recientes
    (últimos 7 días) que pueden haber causado el problema.

    Args:
        ubicacion_id: ID de la tienda (ej: tienda_08, cedi_caracas)
        almacen_codigo: Código del almacén (opcional, ej: APP-TPF, APP-PPF)

    Returns:
        Lista de productos con stock negativo y su evidencia de ventas
    """
    try:
        with get_postgres_connection() as conn:
            cursor = conn.cursor()

            # Obtener nombre de la ubicación
            cursor.execute("SELECT nombre FROM ubicaciones WHERE id = %s", (ubicacion_id,))
            ubicacion_row = cursor.fetchone()
            if not ubicacion_row:
                raise HTTPException(status_code=404, detail=f"Ubicación {ubicacion_id} no encontrada")
            ubicacion_nombre = ubicacion_row[0]

            # Fecha de hace 7 días para buscar ventas recientes como evidencia
            hoy_inicio = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

            items = []

            # Query: Productos con Stock Negativo
            query_negativos = """
                SELECT
                    ia.producto_id,
                    p.codigo as codigo_producto,
                    COALESCE(NULLIF(p.descripcion, ''), p.nombre, 'Sin Descripción') as descripcion_producto,
                    p.categoria,
                    ia.cantidad as stock_actual
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                WHERE ia.ubicacion_id = %s
                  AND ia.cantidad < 0
                  AND p.activo = true
            """
            params_negativos = [ubicacion_id]

            if almacen_codigo:
                query_negativos += " AND ia.almacen_codigo = %s"
                params_negativos.append(almacen_codigo)

            query_negativos += " ORDER BY ia.cantidad ASC"

            cursor.execute(query_negativos, params_negativos)
            negativos = cursor.fetchall()

            # Buscar ventas de los últimos 7 días como evidencia
            hace_7_dias = hoy_inicio - timedelta(days=7)

            for row in negativos:
                producto_id, codigo, descripcion, categoria, stock = row

                # Contar total de ventas RECIENTES (últimos 7 días) para este producto
                cursor.execute("""
                    SELECT COUNT(*), COALESCE(SUM(cantidad_vendida), 0)
                    FROM ventas
                    WHERE producto_id = %s AND ubicacion_id = %s
                      AND fecha_venta >= %s
                """, [producto_id, ubicacion_id, hace_7_dias])
                count_row = cursor.fetchone()
                total_ventas_recientes = count_row[0] if count_row else 0
                suma_cantidad_recientes = float(count_row[1]) if count_row else 0.0

                # Obtener últimas 10 ventas RECIENTES como evidencia (para mostrar detalles)
                cursor.execute("""
                    SELECT numero_factura, fecha_venta,
                           TO_CHAR(fecha_venta, 'YYYY-MM-DD') as fecha,
                           TO_CHAR(fecha_venta, 'HH24:MI') as hora, cantidad_vendida
                    FROM ventas
                    WHERE producto_id = %s AND ubicacion_id = %s
                      AND fecha_venta >= %s
                    ORDER BY fecha_venta DESC
                    LIMIT 10
                """, [producto_id, ubicacion_id, hace_7_dias])
                ventas_evidencia = cursor.fetchall()

                # Para cada venta, buscar el stock histórico más cercano
                evidencias = []
                for v in ventas_evidencia:
                    numero_factura, fecha_venta_ts, fecha_str, hora_str, cantidad = v

                    # Buscar el snapshot más cercano (antes o igual) a la fecha de venta
                    stock_query = """
                        SELECT cantidad
                        FROM inventario_historico
                        WHERE producto_id = %s
                          AND ubicacion_id = %s
                          AND fecha_snapshot <= %s
                    """
                    stock_params = [producto_id, ubicacion_id, fecha_venta_ts]
                    if almacen_codigo:
                        stock_query += " AND almacen_codigo = %s"
                        stock_params.append(almacen_codigo)
                    stock_query += " ORDER BY fecha_snapshot DESC LIMIT 1"

                    cursor.execute(stock_query, stock_params)
                    stock_row = cursor.fetchone()

                    if stock_row:
                        stock_al_momento = float(stock_row[0])
                    else:
                        # Si no hay histórico antes de la venta, usar el stock actual
                        stock_al_momento = float(stock)

                    evidencias.append(EvidenciaVenta(
                        numero_factura=numero_factura,
                        fecha_venta=fecha_str,
                        hora=hora_str,
                        cantidad_vendida=float(cantidad),
                        stock_al_momento=stock_al_momento
                    ))

                # Obtener histórico del día para este producto
                hist_query = """
                    SELECT MAX(cantidad) as max_stock,
                           MIN(cantidad) as min_stock,
                           COUNT(*) as snapshots
                    FROM inventario_historico
                    WHERE producto_id = %s
                      AND ubicacion_id = %s
                      AND fecha_snapshot >= %s
                """
                hist_params = [producto_id, ubicacion_id, hoy_inicio]
                if almacen_codigo:
                    hist_query += " AND almacen_codigo = %s"
                    hist_params.append(almacen_codigo)

                cursor.execute(hist_query, hist_params)
                hist_row = cursor.fetchone()
                stock_max_hoy = float(hist_row[0]) if hist_row and hist_row[0] is not None else None
                stock_min_hoy = float(hist_row[1]) if hist_row and hist_row[1] is not None else None
                snapshots_hoy = hist_row[2] if hist_row else 0

                items.append(AnomaliaStockItem(
                    producto_id=producto_id,
                    codigo_producto=codigo,
                    descripcion_producto=descripcion,
                    categoria=categoria,
                    stock_actual=float(stock),
                    tipo_anomalia="negativo",
                    prioridad=1,
                    total_ventas_evidencia=total_ventas_recientes,
                    suma_cantidad_vendida=suma_cantidad_recientes,
                    evidencias=evidencias,
                    stock_max_hoy=stock_max_hoy,
                    stock_min_hoy=stock_min_hoy,
                    snapshots_hoy=snapshots_hoy
                ))

            cursor.close()

            return AnomaliaStockResponse(
                ubicacion_id=ubicacion_id,
                ubicacion_nombre=ubicacion_nombre,
                total_anomalias=len(items),
                items=items
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo anomalías de stock: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.post("/api/stock/ajustes", response_model=AjusteAuditoriaResponse, tags=["Auditoría Inventario"])
async def aplicar_ajustes_auditoria(request: AjusteAuditoriaRequest):
    """
    Aplica ajustes de auditoría basados en conteo físico.

    El sistema calcula el diferencial: Ajuste = Conteo_Físico - Stock_Sistema
    Y genera un registro de movimiento tipo "Ajuste por Auditoría".

    Args:
        request: Datos de los ajustes a aplicar

    Returns:
        Resultado de cada ajuste aplicado
    """
    try:
        resultados = []
        total_ajustados = 0

        with get_postgres_connection() as conn:
            cursor = conn.cursor()

            for ajuste in request.ajustes:
                try:
                    # Obtener stock actual del producto
                    query_stock = """
                        SELECT cantidad
                        FROM inventario_actual
                        WHERE ubicacion_id = %s AND producto_id = %s
                    """
                    params = [request.ubicacion_id, ajuste.producto_id]

                    if request.almacen_codigo:
                        query_stock += " AND almacen_codigo = %s"
                        params.append(request.almacen_codigo)

                    cursor.execute(query_stock, params)
                    row = cursor.fetchone()

                    if not row:
                        resultados.append(AjusteAuditoriaResultItem(
                            producto_id=ajuste.producto_id,
                            stock_anterior=0,
                            conteo_fisico=ajuste.conteo_fisico,
                            diferencia=ajuste.conteo_fisico,
                            ajuste_aplicado=False,
                            mensaje="Producto no encontrado en inventario"
                        ))
                        continue

                    stock_anterior = float(row[0])
                    diferencia = ajuste.conteo_fisico - stock_anterior

                    # Si no hay diferencia, no hacer nada
                    if diferencia == 0:
                        resultados.append(AjusteAuditoriaResultItem(
                            producto_id=ajuste.producto_id,
                            stock_anterior=stock_anterior,
                            conteo_fisico=ajuste.conteo_fisico,
                            diferencia=0,
                            ajuste_aplicado=False,
                            mensaje="Sin diferencia - no se requiere ajuste"
                        ))
                        continue

                    # Actualizar inventario_actual
                    update_query = """
                        UPDATE inventario_actual
                        SET cantidad = %s, fecha_actualizacion = CURRENT_TIMESTAMP
                        WHERE ubicacion_id = %s AND producto_id = %s
                    """
                    update_params = [ajuste.conteo_fisico, request.ubicacion_id, ajuste.producto_id]

                    if request.almacen_codigo:
                        update_query += " AND almacen_codigo = %s"
                        update_params.append(request.almacen_codigo)

                    cursor.execute(update_query, update_params)

                    # Registrar en inventario_historico como snapshot de auditoría
                    insert_historico = """
                        INSERT INTO inventario_historico
                        (ubicacion_id, producto_id, almacen_codigo, fecha_snapshot, cantidad, cantidad_cambio, etl_batch_id)
                        VALUES (%s, %s, %s, CURRENT_TIMESTAMP, %s, %s, %s)
                    """
                    almacen = request.almacen_codigo or 'APP-TPF'
                    batch_id = f"AUDITORIA_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                    cursor.execute(insert_historico, [
                        request.ubicacion_id,
                        ajuste.producto_id,
                        almacen,
                        ajuste.conteo_fisico,
                        diferencia,
                        batch_id
                    ])

                    total_ajustados += 1
                    resultados.append(AjusteAuditoriaResultItem(
                        producto_id=ajuste.producto_id,
                        stock_anterior=stock_anterior,
                        conteo_fisico=ajuste.conteo_fisico,
                        diferencia=diferencia,
                        ajuste_aplicado=True,
                        mensaje=f"Ajuste aplicado: {'+' if diferencia > 0 else ''}{diferencia:.2f} unidades"
                    ))

                except Exception as e:
                    logger.error(f"Error procesando ajuste para {ajuste.producto_id}: {str(e)}")
                    resultados.append(AjusteAuditoriaResultItem(
                        producto_id=ajuste.producto_id,
                        stock_anterior=0,
                        conteo_fisico=ajuste.conteo_fisico,
                        diferencia=0,
                        ajuste_aplicado=False,
                        mensaje=f"Error: {str(e)}"
                    ))

            # Commit de la transacción
            conn.commit()
            cursor.close()

        return AjusteAuditoriaResponse(
            success=True,
            ubicacion_id=request.ubicacion_id,
            total_procesados=len(request.ajustes),
            total_ajustados=total_ajustados,
            resultados=resultados
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error aplicando ajustes de auditoría: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/stock/anomalias/{ubicacion_id}/count", tags=["Auditoría Inventario"])
async def get_anomalias_count(
    ubicacion_id: str,
    almacen_codigo: Optional[str] = None
):
    """
    Obtiene solo el conteo de anomalías (para mostrar badge sin cargar todos los datos).

    Args:
        ubicacion_id: ID de la tienda
        almacen_codigo: Código del almacén (opcional)

    Returns:
        Conteo de anomalías
    """
    try:
        with get_postgres_connection() as conn:
            cursor = conn.cursor()

            query = """
                SELECT COUNT(*)
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                WHERE ia.ubicacion_id = %s
                  AND ia.cantidad < 0
                  AND p.activo = true
            """
            params = [ubicacion_id]

            if almacen_codigo:
                query += " AND ia.almacen_codigo = %s"
                params.append(almacen_codigo)

            cursor.execute(query, params)
            negativos = cursor.fetchone()[0]

            # Contar ventas zombie (stock <= 0 TODO el día Y con ventas HOY)
            hoy_inicio = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

            # Construir filtros de almacén
            almacen_filter_hist = ""
            almacen_filter_hist2 = ""
            almacen_filter_actual = ""
            if almacen_codigo:
                almacen_filter_hist = "AND ih.almacen_codigo = %s"
                almacen_filter_hist2 = "AND almacen_codigo = %s"
                almacen_filter_actual = "AND ia.almacen_codigo = %s"

            query_zombies = f"""
                WITH productos_con_ventas_hoy AS (
                    SELECT DISTINCT v.producto_id
                    FROM ventas v
                    WHERE v.ubicacion_id = %s
                      AND v.fecha_venta >= %s
                ),
                productos_sin_stock_todo_el_dia AS (
                    SELECT ih.producto_id
                    FROM inventario_historico ih
                    WHERE ih.ubicacion_id = %s
                      AND ih.fecha_snapshot >= %s
                      {almacen_filter_hist}
                    GROUP BY ih.producto_id
                    HAVING MAX(ih.cantidad) <= 0
                ),
                productos_con_historico_hoy AS (
                    SELECT DISTINCT producto_id
                    FROM inventario_historico
                    WHERE ubicacion_id = %s
                      AND fecha_snapshot >= %s
                      {almacen_filter_hist2}
                )
                SELECT COUNT(DISTINCT ia.producto_id)
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                INNER JOIN productos_con_ventas_hoy pv ON pv.producto_id = ia.producto_id
                WHERE ia.ubicacion_id = %s
                  AND ia.cantidad = 0
                  AND p.activo = true
                  {almacen_filter_actual}
                  AND (
                      ia.producto_id IN (SELECT producto_id FROM productos_sin_stock_todo_el_dia)
                      OR ia.producto_id NOT IN (SELECT producto_id FROM productos_con_historico_hoy)
                  )
            """

            if almacen_codigo:
                params_zombies = [
                    ubicacion_id, hoy_inicio,  # productos_con_ventas_hoy
                    ubicacion_id, hoy_inicio, almacen_codigo,  # productos_sin_stock_todo_el_dia
                    ubicacion_id, hoy_inicio, almacen_codigo,  # productos_con_historico_hoy
                    ubicacion_id, almacen_codigo,  # SELECT principal
                ]
            else:
                params_zombies = [
                    ubicacion_id, hoy_inicio,  # productos_con_ventas_hoy
                    ubicacion_id, hoy_inicio,  # productos_sin_stock_todo_el_dia
                    ubicacion_id, hoy_inicio,  # productos_con_historico_hoy
                    ubicacion_id,  # SELECT principal
                ]

            cursor.execute(query_zombies, params_zombies)
            zombies = cursor.fetchone()[0]

            cursor.close()

            return {
                "ubicacion_id": ubicacion_id,
                "total_anomalias": negativos + zombies,
                "anomalias_negativas": negativos,
                "anomalias_venta_zombie": zombies
            }

    except Exception as e:
        logger.error(f"Error obteniendo conteo de anomalías: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


# ============================================================================
# ENDPOINTS: Detección de Agotados Visuales (Zero Sales Scan)
# ============================================================================

@app.get("/api/ventas/agotados-visuales/{ubicacion_id}", response_model=AgotadoVisualResponse, tags=["Centro Comando Ventas"])
async def get_agotados_visuales(
    ubicacion_id: str,
    almacen_codigo: Optional[str] = None,
    factor_minimo: float = 2.0,  # Umbral mínimo de alerta (default 2x)
    min_ventas_historicas: int = 5,  # Mínimo de ventas en 2 semanas para considerar
    max_horas_entre_ventas: int = 24  # Excluir productos que venden menos de 1/día
):
    """
    Detecta productos con posible agotamiento visual (Zero Sales Scan).

    Lógica:
    1. Productos con stock > 0
    2. Al menos N ventas en últimas 2 semanas (rotación media/alta)
    3. Tiempo promedio entre ventas < 24 horas
    4. Tiempo sin ventas >= factor_minimo * promedio histórico
    5. Solo considera horas de operación de la tienda (ignora horas cerradas)

    Args:
        ubicacion_id: ID de la tienda
        almacen_codigo: Código del almacén (opcional)
        factor_minimo: Umbral de alerta (default 2x el promedio)
        min_ventas_historicas: Mínimo de ventas en 2 semanas
        max_horas_entre_ventas: Máximo promedio de horas entre ventas (excluir baja rotación)

    Returns:
        Lista de productos con posible agotamiento visual
    """
    try:
        with get_postgres_connection() as conn:
            cursor = conn.cursor()

            # Obtener nombre de la ubicación (y horarios si existen)
            # Primero verificamos si las columnas de horario existen
            cursor.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'ubicaciones' AND column_name = 'hora_apertura'
            """)
            has_hours_columns = cursor.fetchone() is not None

            if has_hours_columns:
                cursor.execute("""
                    SELECT nombre, hora_apertura, hora_cierre
                    FROM ubicaciones
                    WHERE id = %s
                """, [ubicacion_id])
                ubicacion_row = cursor.fetchone()
                if not ubicacion_row:
                    raise HTTPException(status_code=404, detail=f"Ubicación {ubicacion_id} no encontrada")
                ubicacion_nombre = ubicacion_row[0]
                hora_apertura = ubicacion_row[1]  # TIME type or None
                hora_cierre = ubicacion_row[2]    # TIME type or None
            else:
                # Columnas no existen aún - usar solo nombre
                cursor.execute("SELECT nombre FROM ubicaciones WHERE id = %s", [ubicacion_id])
                ubicacion_row = cursor.fetchone()
                if not ubicacion_row:
                    raise HTTPException(status_code=404, detail=f"Ubicación {ubicacion_id} no encontrada")
                ubicacion_nombre = ubicacion_row[0]
                hora_apertura = None
                hora_cierre = None

            # Zona horaria de Venezuela
            tz_vzla = ZoneInfo("America/Caracas")
            ahora = datetime.now(tz_vzla)
            hace_2_semanas = ahora - timedelta(days=14)

            # Calcular horas de operación diarias
            if hora_apertura and hora_cierre:
                # Convertir TIME a minutos para calcular
                apertura_mins = hora_apertura.hour * 60 + hora_apertura.minute
                cierre_mins = hora_cierre.hour * 60 + hora_cierre.minute

                # Si cierre es 00:00, significa medianoche (24:00)
                if cierre_mins == 0:
                    cierre_mins = 24 * 60

                # Si cierre < apertura, la tienda cruza medianoche
                if cierre_mins <= apertura_mins:
                    horas_operacion_diarias = (24 * 60 - apertura_mins + cierre_mins) / 60.0
                else:
                    horas_operacion_diarias = (cierre_mins - apertura_mins) / 60.0
            else:
                # Default: 14 horas de operación (7am-9pm)
                horas_operacion_diarias = 14.0
                hora_apertura = dt_time(7, 0)
                hora_cierre = dt_time(21, 0)

            # Construir filtro de almacén
            almacen_filter = ""
            almacen_filter_ventas = ""
            if almacen_codigo:
                almacen_filter = "AND ia.almacen_codigo = %s"
                almacen_filter_ventas = "AND v.almacen_codigo = %s"

            # Verificar si la tienda está abierta ahora
            hora_actual = ahora.time()
            apertura_mins = hora_apertura.hour * 60 + hora_apertura.minute if hora_apertura else 7 * 60
            cierre_mins = hora_cierre.hour * 60 + hora_cierre.minute if hora_cierre else 21 * 60
            if cierre_mins == 0:
                cierre_mins = 24 * 60
            actual_mins = hora_actual.hour * 60 + hora_actual.minute

            # Determinar si está abierto (considerando tiendas que cruzan medianoche)
            if cierre_mins <= apertura_mins:
                # Tienda cruza medianoche (ej: 8am-12am)
                tienda_abierta = actual_mins >= apertura_mins or actual_mins < cierre_mins
            else:
                tienda_abierta = apertura_mins <= actual_mins < cierre_mins

            # Query principal: detectar productos con velocidad de venta anómala
            # Usa horas de operación en vez de horas absolutas
            # El promedio entre ventas se calcula sobre el período total
            # pero las horas sin vender se calculan considerando horarios de operación

            query = f"""
                WITH ventas_periodo AS (
                    -- Ventas de cada producto en últimas 2 semanas
                    SELECT
                        v.producto_id,
                        COUNT(*) as total_ventas,
                        MIN(v.fecha_venta) as primera_venta,
                        MAX(v.fecha_venta) as ultima_venta
                    FROM ventas v
                    WHERE v.ubicacion_id = %s
                      AND v.fecha_venta >= %s
                      {almacen_filter_ventas}
                    GROUP BY v.producto_id
                    HAVING COUNT(*) >= %s  -- Mínimo de ventas para considerar
                ),
                velocidad_venta AS (
                    -- Calcular velocidad promedio (horas de OPERACIÓN entre ventas)
                    SELECT
                        vp.producto_id,
                        vp.total_ventas,
                        vp.ultima_venta,
                        -- Días entre primera venta y ahora * horas operación/día / (ventas-1) = promedio horas operación entre ventas
                        (EXTRACT(EPOCH FROM (%s::timestamp - vp.primera_venta)) / 86400.0 * %s) / NULLIF(vp.total_ventas - 1, 0) as promedio_horas_entre_ventas,
                        -- Días desde última venta * horas operación/día = horas operación sin vender
                        EXTRACT(EPOCH FROM (%s::timestamp - vp.ultima_venta)) / 86400.0 * %s as horas_sin_vender
                    FROM ventas_periodo vp
                    WHERE vp.total_ventas > 1  -- Necesitamos al menos 2 ventas para calcular intervalo
                )
                SELECT
                    ia.producto_id,
                    p.codigo as codigo_producto,
                    p.nombre as descripcion_producto,
                    p.categoria,
                    ia.cantidad as stock_actual,
                    vv.total_ventas as ventas_ultimas_2_semanas,
                    COALESCE(vv.promedio_horas_entre_ventas, 0) as promedio_horas_entre_ventas,
                    COALESCE(vv.horas_sin_vender, 0) as horas_sin_vender,
                    vv.ultima_venta
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                INNER JOIN velocidad_venta vv ON vv.producto_id = ia.producto_id
                WHERE ia.ubicacion_id = %s
                  AND ia.cantidad > 0  -- Solo productos con stock positivo
                  AND p.activo = true
                  AND vv.promedio_horas_entre_ventas > 0
                  AND vv.promedio_horas_entre_ventas <= %s  -- Excluir baja rotación
                  AND vv.horas_sin_vender >= (%s * vv.promedio_horas_entre_ventas)  -- Factor de alerta
                  {almacen_filter}
                ORDER BY (vv.horas_sin_vender / NULLIF(vv.promedio_horas_entre_ventas, 1)) DESC
                LIMIT 100
            """

            # Construir parámetros
            if almacen_codigo:
                params = [
                    ubicacion_id, hace_2_semanas, almacen_codigo,  # ventas_periodo
                    min_ventas_historicas,  # HAVING
                    ahora, horas_operacion_diarias,  # velocidad_venta: promedio
                    ahora, horas_operacion_diarias,  # velocidad_venta: sin vender
                    ubicacion_id, max_horas_entre_ventas, factor_minimo, almacen_codigo  # SELECT principal
                ]
            else:
                params = [
                    ubicacion_id, hace_2_semanas,  # ventas_periodo
                    min_ventas_historicas,  # HAVING
                    ahora, horas_operacion_diarias,  # velocidad_venta: promedio
                    ahora, horas_operacion_diarias,  # velocidad_venta: sin vender
                    ubicacion_id, max_horas_entre_ventas, factor_minimo  # SELECT principal
                ]

            cursor.execute(query, params)
            rows = cursor.fetchall()

            items = []
            alertas_criticas = 0
            alertas_altas = 0
            alertas_medias = 0

            for row in rows:
                producto_id, codigo, descripcion, categoria, stock, ventas_2sem, prom_horas, horas_sin, ultima_venta_ts = row

                # Calcular factor de alerta
                factor = horas_sin / prom_horas if prom_horas > 0 else 0

                # Determinar prioridad
                if factor >= 4:
                    prioridad = 1  # Crítico
                    alertas_criticas += 1
                elif factor >= 3:
                    prioridad = 2  # Alto
                    alertas_altas += 1
                else:
                    prioridad = 3  # Medio
                    alertas_medias += 1

                # Obtener info de última venta
                ultima_venta_info = None
                if ultima_venta_ts:
                    cursor.execute("""
                        SELECT numero_factura, fecha_venta, cantidad_vendida
                        FROM ventas
                        WHERE producto_id = %s
                          AND ubicacion_id = %s
                          AND fecha_venta = %s
                        LIMIT 1
                    """, [producto_id, ubicacion_id, ultima_venta_ts])
                    venta_row = cursor.fetchone()
                    if venta_row:
                        fecha_venta_local = venta_row[1].astimezone(tz_vzla) if venta_row[1].tzinfo else venta_row[1]
                        ultima_venta_info = UltimaVentaInfo(
                            numero_factura=venta_row[0],
                            fecha_venta=fecha_venta_local.strftime('%Y-%m-%d'),
                            hora=fecha_venta_local.strftime('%H:%M'),
                            cantidad_vendida=float(venta_row[2])
                        )

                items.append(AgotadoVisualItem(
                    producto_id=producto_id,
                    codigo_producto=codigo,
                    descripcion_producto=descripcion,
                    categoria=categoria,
                    stock_actual=float(stock),
                    ventas_ultimas_2_semanas=ventas_2sem,
                    promedio_horas_entre_ventas=round(prom_horas, 1),
                    horas_sin_vender=round(horas_sin, 1),
                    factor_alerta=round(factor, 1),
                    ultima_venta=ultima_venta_info,
                    prioridad=prioridad
                ))

            cursor.close()

            return AgotadoVisualResponse(
                ubicacion_id=ubicacion_id,
                ubicacion_nombre=ubicacion_nombre,
                fecha_analisis=ahora.strftime('%Y-%m-%d %H:%M'),
                total_alertas=len(items),
                alertas_criticas=alertas_criticas,
                alertas_altas=alertas_altas,
                alertas_medias=alertas_medias,
                items=items,
                hora_apertura=hora_apertura.strftime('%H:%M') if hora_apertura else '07:00',
                hora_cierre=hora_cierre.strftime('%H:%M') if hora_cierre else '21:00',
                tienda_abierta=tienda_abierta,
                horas_operacion_diarias=round(horas_operacion_diarias, 1)
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error detectando agotados visuales: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/ventas/agotados-visuales/{ubicacion_id}/count", tags=["Centro Comando Ventas"])
async def get_agotados_visuales_count(
    ubicacion_id: str,
    almacen_codigo: Optional[str] = None,
    factor_minimo: float = 2.0,
    min_ventas_historicas: int = 5,
    max_horas_entre_ventas: int = 24
):
    """
    Obtiene solo el conteo de agotados visuales (para mostrar badge sin cargar todos los datos).
    Considera horarios de operación de la tienda.
    """
    try:
        with get_postgres_connection() as conn:
            cursor = conn.cursor()

            # Verificar si las columnas de horario existen
            cursor.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'ubicaciones' AND column_name = 'hora_apertura'
            """)
            has_hours_columns = cursor.fetchone() is not None

            # Obtener horarios de la ubicación (si existen)
            hora_apertura = dt_time(7, 0)
            hora_cierre = dt_time(21, 0)
            if has_hours_columns:
                cursor.execute("""
                    SELECT hora_apertura, hora_cierre
                    FROM ubicaciones
                    WHERE id = %s
                """, [ubicacion_id])
                ub_row = cursor.fetchone()
                if ub_row:
                    hora_apertura = ub_row[0] if ub_row[0] else dt_time(7, 0)
                    hora_cierre = ub_row[1] if ub_row[1] else dt_time(21, 0)

            # Calcular horas de operación diarias
            apertura_mins = hora_apertura.hour * 60 + hora_apertura.minute
            cierre_mins = hora_cierre.hour * 60 + hora_cierre.minute
            if cierre_mins == 0:
                cierre_mins = 24 * 60
            if cierre_mins <= apertura_mins:
                horas_operacion_diarias = (24 * 60 - apertura_mins + cierre_mins) / 60.0
            else:
                horas_operacion_diarias = (cierre_mins - apertura_mins) / 60.0

            tz_vzla = ZoneInfo("America/Caracas")
            ahora = datetime.now(tz_vzla)
            hace_2_semanas = ahora - timedelta(days=14)

            # Verificar si la tienda está abierta
            actual_mins = ahora.hour * 60 + ahora.minute
            if cierre_mins <= apertura_mins:
                tienda_abierta = actual_mins >= apertura_mins or actual_mins < cierre_mins
            else:
                tienda_abierta = apertura_mins <= actual_mins < cierre_mins

            almacen_filter = ""
            almacen_filter_ventas = ""
            if almacen_codigo:
                almacen_filter = "AND ia.almacen_codigo = %s"
                almacen_filter_ventas = "AND v.almacen_codigo = %s"

            query = f"""
                WITH ventas_periodo AS (
                    SELECT
                        v.producto_id,
                        COUNT(*) as total_ventas,
                        MIN(v.fecha_venta) as primera_venta,
                        MAX(v.fecha_venta) as ultima_venta
                    FROM ventas v
                    WHERE v.ubicacion_id = %s
                      AND v.fecha_venta >= %s
                      {almacen_filter_ventas}
                    GROUP BY v.producto_id
                    HAVING COUNT(*) >= %s
                ),
                velocidad_venta AS (
                    SELECT
                        vp.producto_id,
                        vp.total_ventas,
                        -- Usar horas de operación en vez de horas absolutas
                        (EXTRACT(EPOCH FROM (%s::timestamp - vp.primera_venta)) / 86400.0 * %s) / NULLIF(vp.total_ventas - 1, 0) as promedio_horas_entre_ventas,
                        EXTRACT(EPOCH FROM (%s::timestamp - vp.ultima_venta)) / 86400.0 * %s as horas_sin_vender
                    FROM ventas_periodo vp
                    WHERE vp.total_ventas > 1
                )
                SELECT COUNT(*)
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                INNER JOIN velocidad_venta vv ON vv.producto_id = ia.producto_id
                WHERE ia.ubicacion_id = %s
                  AND ia.cantidad > 0
                  AND p.activo = true
                  AND vv.promedio_horas_entre_ventas > 0
                  AND vv.promedio_horas_entre_ventas <= %s
                  AND vv.horas_sin_vender >= (%s * vv.promedio_horas_entre_ventas)
                  {almacen_filter}
            """

            if almacen_codigo:
                params = [
                    ubicacion_id, hace_2_semanas, almacen_codigo,
                    min_ventas_historicas,
                    ahora, horas_operacion_diarias,
                    ahora, horas_operacion_diarias,
                    ubicacion_id, max_horas_entre_ventas, factor_minimo, almacen_codigo
                ]
            else:
                params = [
                    ubicacion_id, hace_2_semanas,
                    min_ventas_historicas,
                    ahora, horas_operacion_diarias,
                    ahora, horas_operacion_diarias,
                    ubicacion_id, max_horas_entre_ventas, factor_minimo
                ]

            cursor.execute(query, params)
            total = cursor.fetchone()[0]
            cursor.close()

            return {
                "ubicacion_id": ubicacion_id,
                "total_alertas": total,
                "tienda_abierta": tienda_abierta
            }

    except Exception as e:
        logger.error(f"Error obteniendo conteo de agotados visuales: {str(e)}")
        return {"ubicacion_id": ubicacion_id, "total_alertas": 0, "tienda_abierta": True}


@app.get("/api/ventas/ventas-perdidas/{ubicacion_id}", response_model=VentasPerdidasResponse, tags=["Centro Comando Ventas"])
async def get_ventas_perdidas(
    ubicacion_id: str,
    almacen_codigo: Optional[str] = None,
    factor_minimo: float = 2.0,
    min_ventas_historicas: int = 5,
    max_horas_entre_ventas: int = 24
):
    """
    Calcula las ventas perdidas estimadas por agotados visuales.

    Lógica:
    1. Detecta productos con stock pero sin ventas anormalmente largo tiempo
    2. Calcula unidades que se debieron vender: (horas_sin_vender - promedio) / promedio
    3. Multiplica por precio unitario promedio de últimas 2 semanas
    4. Agrega por categoría para visualizaciones

    Args:
        ubicacion_id: ID de la tienda
        almacen_codigo: Código del almacén (opcional)
        factor_minimo: Umbral de alerta (default 2x)
        min_ventas_historicas: Mínimo de ventas en 2 semanas
        max_horas_entre_ventas: Máximo promedio de horas entre ventas

    Returns:
        Análisis de ventas perdidas con KPIs, detalle y agregaciones
    """
    try:
        with get_postgres_connection() as conn:
            cursor = conn.cursor()

            # Obtener nombre de la ubicación y horarios
            cursor.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'ubicaciones' AND column_name = 'hora_apertura'
            """)
            has_hours_columns = cursor.fetchone() is not None

            if has_hours_columns:
                cursor.execute("""
                    SELECT nombre, hora_apertura, hora_cierre
                    FROM ubicaciones
                    WHERE id = %s
                """, [ubicacion_id])
                ubicacion_row = cursor.fetchone()
                if not ubicacion_row:
                    raise HTTPException(status_code=404, detail=f"Ubicación {ubicacion_id} no encontrada")
                ubicacion_nombre = ubicacion_row[0]
                hora_apertura = ubicacion_row[1]
                hora_cierre = ubicacion_row[2]
            else:
                cursor.execute("SELECT nombre FROM ubicaciones WHERE id = %s", [ubicacion_id])
                ubicacion_row = cursor.fetchone()
                if not ubicacion_row:
                    raise HTTPException(status_code=404, detail=f"Ubicación {ubicacion_id} no encontrada")
                ubicacion_nombre = ubicacion_row[0]
                hora_apertura = None
                hora_cierre = None

            # Zona horaria de Venezuela
            tz_vzla = ZoneInfo("America/Caracas")
            ahora = datetime.now(tz_vzla)
            hace_2_semanas = ahora - timedelta(days=14)

            # Calcular horas de operación diarias
            if hora_apertura and hora_cierre:
                apertura_mins = hora_apertura.hour * 60 + hora_apertura.minute
                cierre_mins = hora_cierre.hour * 60 + hora_cierre.minute
                if cierre_mins == 0:
                    cierre_mins = 24 * 60
                if cierre_mins <= apertura_mins:
                    horas_operacion_diarias = (24 * 60 - apertura_mins + cierre_mins) / 60.0
                else:
                    horas_operacion_diarias = (cierre_mins - apertura_mins) / 60.0
            else:
                horas_operacion_diarias = 14.0
                hora_apertura = dt_time(7, 0)
                hora_cierre = dt_time(21, 0)

            # Construir filtro de almacén
            almacen_filter = ""
            almacen_filter_ventas = ""
            if almacen_codigo:
                almacen_filter = "AND ia.almacen_codigo = %s"
                almacen_filter_ventas = "AND v.almacen_codigo = %s"

            # Query principal con precio promedio
            query = f"""
                WITH ventas_periodo AS (
                    SELECT
                        v.producto_id,
                        COUNT(*) as total_ventas,
                        MIN(v.fecha_venta) as primera_venta,
                        MAX(v.fecha_venta) as ultima_venta,
                        AVG(v.precio_unitario) as precio_promedio
                    FROM ventas v
                    WHERE v.ubicacion_id = %s
                      AND v.fecha_venta >= %s
                      AND v.precio_unitario > 0
                      {almacen_filter_ventas}
                    GROUP BY v.producto_id
                    HAVING COUNT(*) >= %s
                ),
                velocidad_venta AS (
                    SELECT
                        vp.producto_id,
                        vp.total_ventas,
                        vp.ultima_venta,
                        vp.precio_promedio,
                        (EXTRACT(EPOCH FROM (%s::timestamp - vp.primera_venta)) / 86400.0 * %s) / NULLIF(vp.total_ventas - 1, 0) as promedio_horas_entre_ventas,
                        EXTRACT(EPOCH FROM (%s::timestamp - vp.ultima_venta)) / 86400.0 * %s as horas_sin_vender
                    FROM ventas_periodo vp
                    WHERE vp.total_ventas > 1
                )
                SELECT
                    ia.producto_id,
                    p.codigo as codigo_producto,
                    p.nombre as descripcion_producto,
                    p.categoria,
                    ia.cantidad as stock_actual,
                    vv.total_ventas as ventas_ultimas_2_semanas,
                    COALESCE(vv.promedio_horas_entre_ventas, 0) as promedio_horas_entre_ventas,
                    COALESCE(vv.horas_sin_vender, 0) as horas_sin_vender,
                    COALESCE(vv.precio_promedio, 0) as precio_promedio,
                    vv.ultima_venta
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                INNER JOIN velocidad_venta vv ON vv.producto_id = ia.producto_id
                WHERE ia.ubicacion_id = %s
                  AND ia.cantidad > 0
                  AND p.activo = true
                  AND vv.promedio_horas_entre_ventas > 0
                  AND vv.promedio_horas_entre_ventas <= %s
                  AND vv.horas_sin_vender >= (%s * vv.promedio_horas_entre_ventas)
                  {almacen_filter}
                ORDER BY (vv.horas_sin_vender / NULLIF(vv.promedio_horas_entre_ventas, 1)) DESC
                LIMIT 200
            """

            # Construir parámetros
            if almacen_codigo:
                params = [
                    ubicacion_id, hace_2_semanas, almacen_codigo,
                    min_ventas_historicas,
                    ahora, horas_operacion_diarias,
                    ahora, horas_operacion_diarias,
                    ubicacion_id, max_horas_entre_ventas, factor_minimo, almacen_codigo
                ]
            else:
                params = [
                    ubicacion_id, hace_2_semanas,
                    min_ventas_historicas,
                    ahora, horas_operacion_diarias,
                    ahora, horas_operacion_diarias,
                    ubicacion_id, max_horas_entre_ventas, factor_minimo
                ]

            cursor.execute(query, params)
            rows = cursor.fetchall()

            items = []
            total_venta_perdida = 0.0
            categoria_totales: dict = {}

            for row in rows:
                (producto_id, codigo, descripcion, categoria, stock,
                 ventas_2sem, prom_horas, horas_sin, precio_promedio, ultima_venta_ts) = row

                # Convertir Decimal a float para operaciones
                prom_horas = float(prom_horas) if prom_horas else 0.0
                horas_sin = float(horas_sin) if horas_sin else 0.0
                precio_promedio = float(precio_promedio) if precio_promedio else 0.0

                # Calcular factor de alerta
                factor = horas_sin / prom_horas if prom_horas > 0 else 0

                # Calcular unidades perdidas estimadas
                # Fórmula: Unidades_Perdidas = Tiempo_Sin_Vender / Velocidad_Normal
                # Ejemplo: Si vende 1 cada 6 min y lleva 19h (1140 min) sin vender → 1140/6 = 190 unidades
                unidades_perdidas = horas_sin / prom_horas if prom_horas > 0 else 0

                # Calcular valor perdido
                venta_perdida = unidades_perdidas * precio_promedio
                total_venta_perdida += venta_perdida

                # Determinar prioridad
                if factor >= 4:
                    prioridad = 1
                elif factor >= 3:
                    prioridad = 2
                else:
                    prioridad = 3

                # Agregar por categoría
                cat_key = categoria or "Sin Categoría"
                if cat_key not in categoria_totales:
                    categoria_totales[cat_key] = {"total": 0.0, "count": 0}
                categoria_totales[cat_key]["total"] += venta_perdida
                categoria_totales[cat_key]["count"] += 1

                # Formatear última venta
                ultima_venta_fecha = None
                ultima_venta_hora = None
                if ultima_venta_ts:
                    if hasattr(ultima_venta_ts, 'astimezone'):
                        fecha_local = ultima_venta_ts.astimezone(tz_vzla)
                    else:
                        fecha_local = ultima_venta_ts
                    ultima_venta_fecha = fecha_local.strftime('%Y-%m-%d') if hasattr(fecha_local, 'strftime') else str(fecha_local)[:10]
                    ultima_venta_hora = fecha_local.strftime('%H:%M') if hasattr(fecha_local, 'strftime') else ""

                items.append(VentaPerdidaItem(
                    producto_id=producto_id,
                    codigo_producto=codigo,
                    descripcion_producto=descripcion,
                    categoria=categoria,
                    horas_sin_vender=round(horas_sin, 1),
                    promedio_horas_entre_ventas=round(prom_horas, 1),
                    factor_alerta=round(factor, 1),
                    prioridad=prioridad,
                    unidades_perdidas_estimadas=round(unidades_perdidas, 1),
                    precio_unitario_promedio=round(float(precio_promedio), 2),
                    venta_perdida_usd=round(venta_perdida, 2),
                    ultima_venta_fecha=ultima_venta_fecha,
                    ultima_venta_hora=ultima_venta_hora,
                    stock_actual=float(stock)
                ))

            cursor.close()

            # Construir agregación por categoría
            por_categoria = []
            for cat, data in sorted(categoria_totales.items(), key=lambda x: -x[1]["total"]):
                porcentaje = (data["total"] / total_venta_perdida * 100) if total_venta_perdida > 0 else 0
                por_categoria.append(VentaPerdidaPorCategoria(
                    categoria=cat,
                    total_venta_perdida_usd=round(data["total"], 2),
                    total_incidentes=data["count"],
                    porcentaje_del_total=round(porcentaje, 1)
                ))

            # Producto con mayor pérdida
            producto_mayor = None
            producto_mayor_valor = 0.0
            if items:
                item_mayor = max(items, key=lambda x: x.venta_perdida_usd)
                producto_mayor = f"{item_mayor.codigo_producto} - {item_mayor.descripcion_producto[:30]}"
                producto_mayor_valor = item_mayor.venta_perdida_usd

            return VentasPerdidasResponse(
                ubicacion_id=ubicacion_id,
                ubicacion_nombre=ubicacion_nombre,
                fecha_inicio=hace_2_semanas.strftime('%Y-%m-%d'),
                fecha_fin=ahora.strftime('%Y-%m-%d'),
                fecha_analisis=ahora.strftime('%Y-%m-%d %H:%M'),
                total_venta_perdida_usd=round(total_venta_perdida, 2),
                total_incidentes=len(items),
                producto_mayor_perdida=producto_mayor,
                producto_mayor_perdida_valor=round(producto_mayor_valor, 2),
                items=items,
                por_categoria=por_categoria,
                top_productos=items[:10]
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculando ventas perdidas: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


# Mapeo de slots a nombres legibles
SLOTS_HORARIOS = {
    0: ("6am-8am", 6, 8),
    1: ("8am-10am", 8, 10),
    2: ("10am-12pm", 10, 12),
    3: ("12pm-2pm", 12, 14),
    4: ("2pm-4pm", 14, 16),
    5: ("4pm-6pm", 16, 18),
    6: ("6pm-8pm", 18, 20),
    7: ("8pm-10pm", 20, 22),
}

DIAS_SEMANA = {
    0: "Domingo",
    1: "Lunes",
    2: "Martes",
    3: "Miércoles",
    4: "Jueves",
    5: "Viernes",
    6: "Sábado",
}


@app.get("/api/ventas/ventas-perdidas-v2/{ubicacion_id}", response_model=VentasPerdidasResponseV2, tags=["Centro Comando Ventas"])
async def get_ventas_perdidas_v2(
    ubicacion_id: str,
    almacen_codigo: Optional[str] = None,
    semanas_historico: int = 8,
    umbral_critico: float = 3.0,  # Promedio histórico mínimo para alerta crítica cuando ventas=0
    umbral_alto: float = 50.0,    # % del promedio para alerta alta
    umbral_medio: float = 75.0    # % del promedio para alerta media
):
    """
    Calcula ventas perdidas usando comparación por slot de 2 horas y día de semana.

    Nuevo criterio V2:
    - Compara el slot actual (2 horas) con el promedio del mismo día/hora en semanas anteriores
    - Ejemplo: Lunes 10am-12pm actual vs promedio de Lunes 10am-12pm de las últimas 8 semanas

    Niveles de alerta:
    - Crítico: Vendió 0 cuando promedio histórico >= umbral_critico
    - Alto: Vendió < umbral_alto% del promedio histórico
    - Medio: Vendió < umbral_medio% del promedio histórico

    Args:
        ubicacion_id: ID de la tienda
        almacen_codigo: Código del almacén (opcional)
        semanas_historico: Semanas a comparar (default 8)
        umbral_critico: Unidades promedio mínimas para alerta crítica cuando ventas=0
        umbral_alto: Porcentaje del promedio para alerta alta (default 50%)
        umbral_medio: Porcentaje del promedio para alerta media (default 75%)
    """
    try:
        with get_postgres_connection() as conn:
            cursor = conn.cursor()

            # Obtener nombre de la ubicación
            cursor.execute("SELECT nombre FROM ubicaciones WHERE id = %s", [ubicacion_id])
            ubicacion_row = cursor.fetchone()
            if not ubicacion_row:
                raise HTTPException(status_code=404, detail=f"Ubicación {ubicacion_id} no encontrada")
            ubicacion_nombre = ubicacion_row[0]

            # Zona horaria de Venezuela
            tz_vzla = ZoneInfo("America/Caracas")
            ahora = datetime.now(tz_vzla)

            # Determinar slot actual (0-7) y día de semana (0-6)
            hora_actual = ahora.hour
            slot_actual = max(0, min(7, (hora_actual - 6) // 2))  # 6am = slot 0, 8am = slot 1, etc.
            dia_semana = ahora.weekday()  # 0 = Lunes, 6 = Domingo
            # Convertir a formato PostgreSQL (0 = Domingo)
            dia_semana_pg = (dia_semana + 1) % 7

            slot_info = SLOTS_HORARIOS.get(slot_actual, ("6am-8am", 6, 8))
            slot_nombre, hora_inicio, hora_fin = slot_info[0], slot_info[1], slot_info[2]
            dia_nombre = DIAS_SEMANA.get(dia_semana_pg, "Lunes")

            logger.info(f"V2 Debug: hora={hora_actual}, slot={slot_actual}, slot_nombre={slot_nombre}, dia_pg={dia_semana_pg}, dia_nombre={dia_nombre}")

            # Calcular inicio del slot actual
            inicio_slot_actual = ahora.replace(hour=hora_inicio, minute=0, second=0, microsecond=0)
            fin_slot_actual = ahora.replace(hour=hora_fin, minute=0, second=0, microsecond=0)

            # Filtro de almacén
            almacen_filter = ""
            almacen_filter_inv = ""
            if almacen_codigo:
                almacen_filter = "AND v.almacen_codigo = %s"
                almacen_filter_inv = "AND ia.almacen_codigo = %s"

            # Query principal: comparar slot actual con histórico mismo día/hora
            query = f"""
                WITH ventas_slot_actual AS (
                    -- Ventas del slot actual (últimas 2 horas de hoy)
                    SELECT
                        v.producto_id,
                        COALESCE(SUM(v.cantidad_vendida), 0) as cantidad_actual,
                        AVG(v.precio_unitario) as precio_promedio
                    FROM ventas v
                    WHERE v.ubicacion_id = %s
                      AND v.fecha_venta >= %s
                      AND v.fecha_venta < %s
                      AND v.precio_unitario > 0
                      {almacen_filter}
                    GROUP BY v.producto_id
                ),
                historico_mismo_slot AS (
                    -- Histórico del mismo día de semana y slot horario
                    SELECT
                        v.producto_id,
                        DATE(v.fecha_venta) as fecha,
                        SUM(v.cantidad_vendida) as cantidad_dia,
                        AVG(v.precio_unitario) as precio_dia
                    FROM ventas v
                    WHERE v.ubicacion_id = %s
                      AND EXTRACT(DOW FROM v.fecha_venta) = %s  -- Mismo día de semana
                      AND EXTRACT(HOUR FROM v.fecha_venta) >= %s  -- Hora inicio del slot
                      AND EXTRACT(HOUR FROM v.fecha_venta) < %s   -- Hora fin del slot
                      AND v.fecha_venta >= %s  -- Desde hace N semanas
                      AND v.fecha_venta < %s   -- Hasta inicio del slot actual (excluir hoy)
                      AND v.precio_unitario > 0
                      {almacen_filter}
                    GROUP BY v.producto_id, DATE(v.fecha_venta)
                ),
                promedio_historico AS (
                    -- Calcular promedio por producto
                    SELECT
                        producto_id,
                        AVG(cantidad_dia) as promedio_cantidad,
                        AVG(precio_dia) as promedio_precio,
                        COUNT(DISTINCT fecha) as semanas_datos
                    FROM historico_mismo_slot
                    GROUP BY producto_id
                ),
                productos_con_stock AS (
                    -- Solo productos con stock positivo
                    SELECT
                        ia.producto_id,
                        ia.cantidad as stock_actual
                    FROM inventario_actual ia
                    WHERE ia.ubicacion_id = %s
                      AND ia.cantidad > 0
                      {almacen_filter_inv}
                )
                SELECT
                    pcs.producto_id,
                    p.codigo as codigo_producto,
                    p.nombre as descripcion_producto,
                    p.categoria,
                    pcs.stock_actual,
                    COALESCE(vsa.cantidad_actual, 0) as ventas_actuales,
                    COALESCE(ph.promedio_cantidad, 0) as promedio_historico,
                    COALESCE(ph.semanas_datos, 0) as semanas_datos,
                    COALESCE(vsa.precio_promedio, ph.promedio_precio, 0) as precio_promedio
                FROM productos_con_stock pcs
                INNER JOIN productos p ON pcs.producto_id = p.id
                LEFT JOIN ventas_slot_actual vsa ON vsa.producto_id = pcs.producto_id
                LEFT JOIN promedio_historico ph ON ph.producto_id = pcs.producto_id
                WHERE p.activo = true
                  AND COALESCE(ph.promedio_cantidad, 0) >= 1  -- Solo productos que normalmente venden en este slot
                  AND (
                      -- Caso 1: Vendió 0 cuando debería vender al menos umbral_critico
                      (COALESCE(vsa.cantidad_actual, 0) = 0 AND COALESCE(ph.promedio_cantidad, 0) >= %s)
                      OR
                      -- Caso 2: Vendió menos del umbral_medio porciento del promedio
                      (COALESCE(vsa.cantidad_actual, 0) < COALESCE(ph.promedio_cantidad, 0) * %s / 100.0)
                  )
                ORDER BY
                    (COALESCE(ph.promedio_cantidad, 0) - COALESCE(vsa.cantidad_actual, 0))
                    * COALESCE(vsa.precio_promedio, ph.promedio_precio, 0) DESC
                LIMIT 200
            """

            # Calcular fechas para el histórico
            inicio_historico = ahora - timedelta(weeks=semanas_historico)

            # Construir parámetros
            if almacen_codigo:
                params = [
                    # ventas_slot_actual
                    ubicacion_id, inicio_slot_actual, fin_slot_actual, almacen_codigo,
                    # historico_mismo_slot
                    ubicacion_id, dia_semana_pg, hora_inicio, hora_fin,
                    inicio_historico, inicio_slot_actual, almacen_codigo,
                    # productos_con_stock
                    ubicacion_id, almacen_codigo,
                    # filtros finales
                    umbral_critico, umbral_medio
                ]
            else:
                params = [
                    # ventas_slot_actual (3 params)
                    ubicacion_id, inicio_slot_actual, fin_slot_actual,
                    # historico_mismo_slot (6 params)
                    ubicacion_id, dia_semana_pg, hora_inicio, hora_fin,
                    inicio_historico, inicio_slot_actual,
                    # productos_con_stock (1 param)
                    ubicacion_id,
                    # filtros finales (2 params)
                    umbral_critico, umbral_medio
                ]

            logger.info(f"V2 Debug: Query params count = {len(params)}")
            logger.info(f"V2 Debug: Query placeholders count = {query.count('%s')}")

            cursor.execute(query, params)
            rows = cursor.fetchall()

            items = []
            total_venta_perdida = 0.0
            categoria_totales: dict = {}
            incidentes_criticos = 0
            incidentes_altos = 0
            incidentes_medios = 0

            for row in rows:
                (producto_id, codigo, descripcion, categoria, stock,
                 ventas_actuales, promedio_hist, semanas_datos, precio_prom) = row

                # Convertir a float
                ventas_actuales = float(ventas_actuales) if ventas_actuales else 0.0
                promedio_hist = float(promedio_hist) if promedio_hist else 0.0
                precio_prom = float(precio_prom) if precio_prom else 0.0
                stock = float(stock) if stock else 0.0

                # Calcular porcentaje vendido
                porcentaje_vendido = (ventas_actuales / promedio_hist * 100) if promedio_hist > 0 else 0

                # Calcular unidades perdidas
                unidades_perdidas = max(0, promedio_hist - ventas_actuales)

                # Calcular venta perdida
                venta_perdida = unidades_perdidas * precio_prom
                total_venta_perdida += venta_perdida

                # Determinar nivel de alerta
                if ventas_actuales == 0 and promedio_hist >= umbral_critico:
                    nivel_alerta = "critico"
                    incidentes_criticos += 1
                elif porcentaje_vendido < umbral_alto:
                    nivel_alerta = "alto"
                    incidentes_altos += 1
                else:
                    nivel_alerta = "medio"
                    incidentes_medios += 1

                # Agregar por categoría
                cat_key = categoria or "Sin Categoría"
                if cat_key not in categoria_totales:
                    categoria_totales[cat_key] = {"total": 0.0, "count": 0}
                categoria_totales[cat_key]["total"] += venta_perdida
                categoria_totales[cat_key]["count"] += 1

                items.append(VentaPerdidaItemV2(
                    producto_id=producto_id,
                    codigo_producto=codigo,
                    descripcion_producto=descripcion,
                    categoria=categoria,
                    slot_actual=slot_nombre,
                    dia_semana=dia_nombre,
                    ventas_slot_actual=round(ventas_actuales, 1),
                    promedio_historico=round(promedio_hist, 1),
                    semanas_con_datos=int(semanas_datos),
                    porcentaje_vendido=round(porcentaje_vendido, 1),
                    unidades_perdidas=round(unidades_perdidas, 1),
                    precio_unitario_promedio=round(precio_prom, 2),
                    venta_perdida_usd=round(venta_perdida, 2),
                    nivel_alerta=nivel_alerta,
                    stock_actual=round(stock, 1)
                ))

            cursor.close()

            # Construir agregación por categoría
            por_categoria = []
            for cat, data in sorted(categoria_totales.items(), key=lambda x: -x[1]["total"]):
                porcentaje = (data["total"] / total_venta_perdida * 100) if total_venta_perdida > 0 else 0
                por_categoria.append(VentaPerdidaPorCategoria(
                    categoria=cat,
                    total_venta_perdida_usd=round(data["total"], 2),
                    total_incidentes=data["count"],
                    porcentaje_del_total=round(porcentaje, 1)
                ))

            # Producto con mayor pérdida
            producto_mayor = None
            producto_mayor_valor = 0.0
            if items:
                item_mayor = max(items, key=lambda x: x.venta_perdida_usd)
                producto_mayor = f"{item_mayor.codigo_producto} - {item_mayor.descripcion_producto[:30]}"
                producto_mayor_valor = item_mayor.venta_perdida_usd

            return VentasPerdidasResponseV2(
                ubicacion_id=ubicacion_id,
                ubicacion_nombre=ubicacion_nombre,
                slot_analizado=slot_nombre,
                dia_semana=dia_nombre,
                fecha_analisis=ahora.strftime('%Y-%m-%d %H:%M'),
                semanas_historico=semanas_historico,
                total_venta_perdida_usd=round(total_venta_perdida, 2),
                total_incidentes=len(items),
                incidentes_criticos=incidentes_criticos,
                incidentes_altos=incidentes_altos,
                incidentes_medios=incidentes_medios,
                producto_mayor_perdida=producto_mayor,
                producto_mayor_perdida_valor=round(producto_mayor_valor, 2),
                items=items,
                por_categoria=por_categoria,
                top_productos=items[:10]
            )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"Error calculando ventas perdidas V2: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/ventas/ventas-perdidas-v3/{ubicacion_id}", response_model=VentasPerdidasResponseV3, tags=["Centro Comando Ventas"])
async def get_ventas_perdidas_v3(
    ubicacion_id: str,
    fecha_inicio: str,  # YYYY-MM-DD
    fecha_fin: str,     # YYYY-MM-DD
    dias_historico: int = 30,  # Días previos para calcular el promedio histórico
    umbral_critico: float = 30.0,   # % del histórico para alerta crítica
    umbral_alto: float = 50.0,      # % del histórico para alerta alta
    umbral_medio: float = 75.0      # % del histórico para alerta media
):
    """
    Analiza ventas perdidas en un rango de fechas específico.

    Compara las ventas de cada producto en el período seleccionado contra
    su promedio histórico de los N días anteriores al período.

    Ejemplo: Si analizas del 1-7 de Nov, compara contra el promedio del 2-31 Oct.

    Args:
        ubicacion_id: ID de la tienda
        fecha_inicio: Inicio del período a analizar (YYYY-MM-DD)
        fecha_fin: Fin del período a analizar (YYYY-MM-DD)
        dias_historico: Días previos para calcular promedio histórico (default 30)
        umbral_critico: % del histórico para alerta crítica (default 30%)
        umbral_alto: % del histórico para alerta alta (default 50%)
        umbral_medio: % del histórico para alerta media (default 75%)

    Returns:
        Análisis de ventas perdidas con comparación histórica
    """
    try:
        # Parsear fechas
        try:
            fecha_inicio_dt = datetime.strptime(fecha_inicio, '%Y-%m-%d')
            fecha_fin_dt = datetime.strptime(fecha_fin, '%Y-%m-%d')
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")

        if fecha_fin_dt < fecha_inicio_dt:
            raise HTTPException(status_code=400, detail="fecha_fin debe ser >= fecha_inicio")

        dias_analizados = (fecha_fin_dt - fecha_inicio_dt).days + 1

        # Calcular período histórico (días previos al período analizado)
        fecha_hist_fin = fecha_inicio_dt - timedelta(days=1)
        fecha_hist_inicio = fecha_hist_fin - timedelta(days=dias_historico - 1)

        with get_postgres_connection() as conn:
            cursor = conn.cursor()

            # Obtener nombre de la ubicación
            cursor.execute("SELECT nombre FROM ubicaciones WHERE id = %s", [ubicacion_id])
            ubicacion_row = cursor.fetchone()
            if not ubicacion_row:
                raise HTTPException(status_code=404, detail=f"Ubicación {ubicacion_id} no encontrada")
            ubicacion_nombre = ubicacion_row[0]

            # Query principal: comparar período seleccionado vs histórico
            query = """
                WITH ventas_periodo AS (
                    -- Ventas en el período seleccionado
                    SELECT
                        v.producto_id,
                        SUM(v.cantidad_vendida) as total_vendido,
                        COUNT(DISTINCT v.fecha_venta::date) as dias_con_ventas,
                        AVG(v.precio_unitario) as precio_promedio
                    FROM ventas v
                    WHERE v.ubicacion_id = %s
                      AND v.fecha_venta::date BETWEEN %s AND %s
                      AND v.precio_unitario > 0
                    GROUP BY v.producto_id
                ),
                ventas_historico AS (
                    -- Ventas en el período histórico (para comparación)
                    SELECT
                        v.producto_id,
                        SUM(v.cantidad_vendida) as total_vendido,
                        COUNT(DISTINCT v.fecha_venta::date) as dias_con_ventas
                    FROM ventas v
                    WHERE v.ubicacion_id = %s
                      AND v.fecha_venta::date BETWEEN %s AND %s
                      AND v.precio_unitario > 0
                    GROUP BY v.producto_id
                ),
                stock_cero_periodo AS (
                    -- Días con stock 0 durante el período analizado
                    SELECT
                        ih.producto_id,
                        COUNT(DISTINCT ih.fecha_snapshot::date) as dias_stock_cero
                    FROM inventario_historico ih
                    WHERE ih.ubicacion_id = %s
                      AND ih.fecha_snapshot::date BETWEEN %s AND %s
                      AND ih.cantidad = 0
                    GROUP BY ih.producto_id
                ),
                productos_con_stock AS (
                    -- Stock actual de cada producto
                    SELECT
                        ia.producto_id,
                        SUM(ia.cantidad) as stock_actual
                    FROM inventario_actual ia
                    WHERE ia.ubicacion_id = %s
                    GROUP BY ia.producto_id
                )
                SELECT
                    p.id as producto_id,
                    p.codigo as codigo_producto,
                    p.nombre as descripcion_producto,
                    p.categoria,
                    COALESCE(vp.total_vendido, 0) as ventas_periodo,
                    COALESCE(vp.dias_con_ventas, 0) as dias_con_ventas_periodo,
                    COALESCE(vp.precio_promedio, 0) as precio_promedio,
                    COALESCE(vh.total_vendido, 0) as ventas_historico,
                    COALESCE(vh.dias_con_ventas, 0) as dias_con_ventas_historico,
                    COALESCE(pcs.stock_actual, 0) as stock_actual,
                    COALESCE(scz.dias_stock_cero, 0) as dias_stock_cero
                FROM productos p
                LEFT JOIN ventas_periodo vp ON vp.producto_id = p.codigo
                LEFT JOIN ventas_historico vh ON vh.producto_id = p.codigo
                LEFT JOIN productos_con_stock pcs ON pcs.producto_id = p.id
                LEFT JOIN stock_cero_periodo scz ON scz.producto_id = p.id
                WHERE p.activo = true
                  AND (
                      -- Tiene histórico significativo
                      COALESCE(vh.total_vendido, 0) >= %s  -- Al menos N unidades en histórico
                  )
                  AND (
                      -- Vendió menos del umbral_medio porciento del esperado
                      COALESCE(vp.total_vendido, 0) < (COALESCE(vh.total_vendido, 0) / %s * %s * %s / 100.0)
                  )
                ORDER BY
                    ((COALESCE(vh.total_vendido, 0) / %s * %s) - COALESCE(vp.total_vendido, 0))
                    * COALESCE(vp.precio_promedio, 1) DESC
                LIMIT 200
            """

            # Parámetros
            min_unidades_historico = dias_historico * 0.5  # Al menos 0.5 unidades/día en promedio histórico
            params = [
                # ventas_periodo
                ubicacion_id, fecha_inicio, fecha_fin,
                # ventas_historico
                ubicacion_id, fecha_hist_inicio.strftime('%Y-%m-%d'), fecha_hist_fin.strftime('%Y-%m-%d'),
                # stock_cero_periodo
                ubicacion_id, fecha_inicio, fecha_fin,
                # productos_con_stock
                ubicacion_id,
                # filtros
                min_unidades_historico,
                dias_historico, dias_analizados, umbral_medio,
                # order by
                dias_historico, dias_analizados
            ]

            cursor.execute(query, params)
            rows = cursor.fetchall()

            items = []
            total_venta_perdida = 0.0
            categoria_totales: dict = {}
            incidentes_criticos = 0
            incidentes_altos = 0
            incidentes_medios = 0

            for row in rows:
                (producto_id, codigo, descripcion, categoria, ventas_periodo,
                 dias_con_ventas, precio_prom, ventas_hist, dias_ventas_hist,
                 stock_actual, dias_stock_cero) = row

                # Convertir a float
                ventas_periodo = float(ventas_periodo) if ventas_periodo else 0.0
                ventas_hist = float(ventas_hist) if ventas_hist else 0.0
                precio_prom = float(precio_prom) if precio_prom else 0.0
                stock_actual = float(stock_actual) if stock_actual else 0.0

                # Calcular promedios diarios
                promedio_diario_periodo = ventas_periodo / dias_analizados if dias_analizados > 0 else 0
                promedio_diario_historico = ventas_hist / dias_historico if dias_historico > 0 else 0

                # Calcular porcentaje vs histórico
                if promedio_diario_historico > 0:
                    porcentaje_vs_hist = (promedio_diario_periodo / promedio_diario_historico) * 100
                else:
                    porcentaje_vs_hist = 100 if promedio_diario_periodo > 0 else 0

                # Calcular unidades perdidas
                unidades_perdidas_diarias = max(0, promedio_diario_historico - promedio_diario_periodo)
                unidades_perdidas_total = unidades_perdidas_diarias * dias_analizados

                # Calcular venta perdida
                venta_perdida = unidades_perdidas_total * precio_prom
                total_venta_perdida += venta_perdida

                # Determinar nivel de alerta
                if porcentaje_vs_hist <= umbral_critico:
                    nivel_alerta = "critico"
                    incidentes_criticos += 1
                elif porcentaje_vs_hist <= umbral_alto:
                    nivel_alerta = "alto"
                    incidentes_altos += 1
                else:
                    nivel_alerta = "medio"
                    incidentes_medios += 1

                # Agregar por categoría
                cat_key = categoria or "Sin Categoría"
                if cat_key not in categoria_totales:
                    categoria_totales[cat_key] = {"total": 0.0, "count": 0}
                categoria_totales[cat_key]["total"] += venta_perdida
                categoria_totales[cat_key]["count"] += 1

                items.append(VentaPerdidaItemV3(
                    producto_id=producto_id,
                    codigo_producto=codigo,
                    descripcion_producto=descripcion,
                    categoria=categoria,
                    ventas_periodo=round(ventas_periodo, 1),
                    dias_con_ventas=int(dias_con_ventas),
                    dias_analizados=dias_analizados,
                    promedio_diario_periodo=round(promedio_diario_periodo, 2),
                    promedio_diario_historico=round(promedio_diario_historico, 2),
                    dias_historico=dias_historico,
                    porcentaje_vs_historico=round(porcentaje_vs_hist, 1),
                    unidades_perdidas_diarias=round(unidades_perdidas_diarias, 2),
                    unidades_perdidas_total=round(unidades_perdidas_total, 1),
                    precio_unitario_promedio=round(precio_prom, 2),
                    venta_perdida_usd=round(venta_perdida, 2),
                    nivel_alerta=nivel_alerta,
                    stock_actual=round(stock_actual, 1),
                    dias_stock_cero=int(dias_stock_cero)
                ))

            cursor.close()

            # Construir agregación por categoría
            por_categoria = []
            for cat, cat_data in sorted(categoria_totales.items(), key=lambda x: -x[1]["total"]):
                porcentaje = (cat_data["total"] / total_venta_perdida * 100) if total_venta_perdida > 0 else 0
                por_categoria.append(VentaPerdidaPorCategoria(
                    categoria=cat,
                    total_venta_perdida_usd=round(cat_data["total"], 2),
                    total_incidentes=cat_data["count"],
                    porcentaje_del_total=round(porcentaje, 1)
                ))

            # Producto con mayor pérdida
            producto_mayor = None
            producto_mayor_valor = 0.0
            if items:
                item_mayor = max(items, key=lambda x: x.venta_perdida_usd)
                producto_mayor = f"{item_mayor.codigo_producto} - {item_mayor.descripcion_producto[:30]}"
                producto_mayor_valor = item_mayor.venta_perdida_usd

            return VentasPerdidasResponseV3(
                ubicacion_id=ubicacion_id,
                ubicacion_nombre=ubicacion_nombre,
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
                dias_analizados=dias_analizados,
                dias_historico=dias_historico,
                total_venta_perdida_usd=round(total_venta_perdida, 2),
                total_incidentes=len(items),
                incidentes_criticos=incidentes_criticos,
                incidentes_altos=incidentes_altos,
                incidentes_medios=incidentes_medios,
                producto_mayor_perdida=producto_mayor,
                producto_mayor_perdida_valor=round(producto_mayor_valor, 2),
                items=items,
                por_categoria=por_categoria,
                top_productos=items[:10]
            )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"Error calculando ventas perdidas V3: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/dashboard/metrics", response_model=DashboardMetrics, tags=["Dashboard"])
async def get_dashboard_metrics():
    """Obtiene métricas principales para el dashboard"""
    try:
        with get_db_connection() as conn:
            # Métricas generales
            result = conn.execute("""
                SELECT
                    COUNT(DISTINCT puc.ubicacion_id) as total_ubicaciones,
                    COUNT(DISTINCT puc.producto_id) as total_productos,
                    COUNT(*) as total_configuraciones,
                    COALESCE(SUM(s.valor_inventario), 0) as valor_inventario_total
                FROM producto_ubicacion_config puc
                LEFT JOIN stock_actual s ON puc.ubicacion_id = s.ubicacion_id
                                        AND puc.producto_id = s.producto_id
                WHERE puc.activo = true
            """).fetchone()

            total_ubicaciones, total_productos, total_configuraciones, valor_inventario_total = result

            # Contar por estados de stock
            estados = conn.execute("""
                SELECT
                    SUM(CASE WHEN s.cantidad IS NULL OR s.cantidad <= puc.stock_minimo THEN 1 ELSE 0 END) as critico,
                    SUM(CASE WHEN s.cantidad > puc.stock_minimo AND s.cantidad <= puc.punto_reorden THEN 1 ELSE 0 END) as bajo,
                    SUM(CASE WHEN s.cantidad > puc.punto_reorden AND s.cantidad < puc.stock_maximo THEN 1 ELSE 0 END) as normal,
                    SUM(CASE WHEN s.cantidad >= puc.stock_maximo THEN 1 ELSE 0 END) as exceso
                FROM producto_ubicacion_config puc
                LEFT JOIN stock_actual s ON puc.ubicacion_id = s.ubicacion_id
                                        AND puc.producto_id = s.producto_id
                WHERE puc.activo = true
            """).fetchone()

            critico, bajo, normal, exceso = estados

            return DashboardMetrics(
                total_ubicaciones=total_ubicaciones,
                total_productos=total_productos,
                total_configuraciones=total_configuraciones,
                valor_inventario_total=float(valor_inventario_total or 0),
                productos_stock_critico=critico or 0,
                productos_stock_bajo=bajo or 0,
                productos_normal=normal or 0,
                productos_exceso=exceso or 0
            )

    except Exception as e:
        logger.error(f"Error obteniendo métricas de dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/dashboard/categories", response_model=List[CategoryMetrics], tags=["Dashboard"])
async def get_category_metrics():
    """Obtiene métricas por categoría"""
    try:
        with get_db_connection() as conn:
            result = conn.execute("""
                SELECT
                    p.categoria,
                    COUNT(DISTINCT puc.producto_id) as productos_count,
                    SUM(CASE WHEN s.cantidad IS NULL OR s.cantidad <= puc.stock_minimo THEN 1 ELSE 0 END) as stock_critico,
                    SUM(CASE WHEN s.cantidad > puc.stock_minimo AND s.cantidad <= puc.punto_reorden THEN 1 ELSE 0 END) as stock_bajo,
                    SUM(CASE WHEN s.cantidad > puc.punto_reorden AND s.cantidad < puc.stock_maximo THEN 1 ELSE 0 END) as stock_normal,
                    SUM(CASE WHEN s.cantidad >= puc.stock_maximo THEN 1 ELSE 0 END) as stock_exceso,
                    COALESCE(SUM(s.valor_inventario), 0) as valor_total
                FROM producto_ubicacion_config puc
                JOIN productos p ON puc.producto_id = p.id
                LEFT JOIN stock_actual s ON puc.ubicacion_id = s.ubicacion_id
                                        AND puc.producto_id = s.producto_id
                WHERE puc.activo = true AND p.activo = true
                GROUP BY p.categoria
                ORDER BY productos_count DESC
            """).fetchall()

            categories = []
            for row in result:
                categories.append(CategoryMetrics(
                    categoria=row[0],
                    productos_count=row[1],
                    stock_critico=row[2] or 0,
                    stock_bajo=row[3] or 0,
                    stock_normal=row[4] or 0,
                    stock_exceso=row[5] or 0,
                    valor_total=float(row[6] or 0)
                ))

            return categories

    except Exception as e:
        logger.error(f"Error obteniendo métricas por categoría: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

# ============================================================================
# ETL SYNC ENDPOINTS
# ============================================================================

class ETLSyncRequest(BaseModel):
    ubicacion_id: Optional[str] = None  # Si es None, ejecuta todas las tiendas

class ETLSyncResponse(BaseModel):
    success: bool
    message: str
    ubicaciones_procesadas: List[str]
    total_registros: int
    tiempo_ejecucion: float
    errores: List[str]

class VentasETLSyncRequest(BaseModel):
    ubicacion_id: Optional[str] = None  # Si es None, ejecuta todas las tiendas
    fecha_inicio: Optional[str] = None  # Formato YYYY-MM-DD
    fecha_fin: Optional[str] = None  # Formato YYYY-MM-DD

# Variable global para tracking del estado del ETL de Inventario
etl_status = {
    "running": False,
    "current_ubicacion": None,
    "progress": 0,
    "message": "",
    "result": None,
    "logs": [],  # Lista de logs del ETL
    "tiendas_status": []  # Status de cada tienda durante la sincronización
}

# Variable global para tracking del estado del ETL de Ventas
ventas_etl_status = {
    "running": False,
    "current_ubicacion": None,
    "progress": 0,
    "message": "",
    "result": None,
    "logs": [],  # Lista de logs del ETL de ventas
    "tiendas_status": [],  # Status de cada tienda durante la sincronización
    "fecha_inicio": None,
    "fecha_fin": None
}

# Instancia global del scheduler de ventas
ventas_scheduler: Optional[VentasETLScheduler] = None

def is_production_environment() -> bool:
    """Detecta si estamos en producción (AWS ECS) o desarrollo (local)"""
    # En AWS ECS, la variable ECS_CONTAINER_METADATA_URI_V4 está disponible
    return os.getenv("ECS_CONTAINER_METADATA_URI_V4") is not None

async def run_etl_production(ubicacion_id: Optional[str] = None):
    """Ejecuta ETL en producción lanzando una tarea ECS en AWS"""
    if not BOTO3_AVAILABLE:
        etl_status["running"] = False
        etl_status["result"] = {
            "exitoso": False,
            "mensaje": "boto3 no disponible - no se puede ejecutar ETL en producción",
            "errores": ["boto3 module not installed"]
        }
        etl_status["logs"].append({
            "timestamp": datetime.now().isoformat(),
            "level": "error",
            "message": "boto3 no disponible"
        })
        return

    try:
        start_time = datetime.now()

        # Configuración de ECS desde variables de entorno
        cluster_name = os.getenv("ECS_CLUSTER_NAME", "fluxion-cluster")
        task_definition = os.getenv("ETL_TASK_DEFINITION")
        subnets = os.getenv("ETL_SUBNETS", "").split(",")
        security_groups = os.getenv("ETL_SECURITY_GROUPS", "").split(",")
        aws_region = os.getenv("AWS_REGION", "us-east-1")

        if not task_definition:
            raise ValueError("ETL_TASK_DEFINITION environment variable not set")

        # Construir comando ETL
        etl_command = ["python3", "/app/etl_inventario.py"]
        if ubicacion_id:
            etl_command.extend(["--tienda", ubicacion_id])
            etl_status["message"] = f"Lanzando ETL para {ubicacion_id} en ECS..."
        else:
            etl_command.append("--todas")
            etl_status["message"] = "Lanzando ETL para todas las tiendas en ECS..."

        logger.info(f"Lanzando tarea ECS: {cluster_name} / {task_definition}")
        logger.info(f"Comando ETL: {' '.join(etl_command)}")

        etl_status["logs"].append({
            "timestamp": datetime.now().isoformat(),
            "level": "info",
            "message": f"Lanzando tarea ECS en cluster {cluster_name}"
        })

        # Crear cliente ECS
        ecs = boto3.client("ecs", region_name=aws_region)

        # Lanzar tarea ECS
        response = ecs.run_task(
            cluster=cluster_name,
            taskDefinition=task_definition,
            launchType="FARGATE",
            networkConfiguration={
                "awsvpcConfiguration": {
                    "subnets": subnets,
                    "securityGroups": security_groups,
                    "assignPublicIp": "DISABLED"  # En subnet privada con NAT
                }
            },
            overrides={
                "containerOverrides": [
                    {
                        "name": "etl",
                        "command": etl_command
                    }
                ]
            },
            propagateTags="TASK_DEFINITION"
        )

        # Obtener ARN de la tarea
        if response["tasks"]:
            task_arn = response["tasks"][0]["taskArn"]
            task_id = task_arn.split("/")[-1]

            logger.info(f"Tarea ECS lanzada: {task_id}")

            etl_status["logs"].append({
                "timestamp": datetime.now().isoformat(),
                "level": "info",
                "message": f"✅ Tarea ECS lanzada exitosamente: {task_id}"
            })
            etl_status["logs"].append({
                "timestamp": datetime.now().isoformat(),
                "level": "info",
                "message": "La sincronización está en progreso. Los datos se actualizarán cuando la tarea finalice."
            })

            # Guardar task_arn para streaming de logs
            etl_status["task_arn"] = task_arn
            etl_status["task_id"] = task_id
            etl_status["log_group"] = os.getenv("ETL_LOG_GROUP", "FluxionStackV2-FluxionETLTasketlLogGroupEB088C6B-xzaljvRuwjkm")
            etl_status["last_log_timestamp"] = None  # Para paginación de logs

            # Marcar como completado el lanzamiento (no esperamos a que termine la tarea)
            etl_status["running"] = False
            etl_status["result"] = {
                "exitoso": True,
                "mensaje": f"Tarea ECS lanzada exitosamente: {task_id}",
                "task_arn": task_arn,
                "task_id": task_id,
                "tiempo_ejecucion": (datetime.now() - start_time).total_seconds()
            }
        else:
            raise Exception("No se pudo lanzar la tarea ECS - respuesta vacía")

    except Exception as e:
        logger.error(f"Error lanzando tarea ECS: {str(e)}")
        etl_status["running"] = False
        etl_status["result"] = {
            "exitoso": False,
            "mensaje": f"Error lanzando ETL en producción: {str(e)}",
            "errores": [str(e)]
        }
        etl_status["logs"].append({
            "timestamp": datetime.now().isoformat(),
            "level": "error",
            "message": f"❌ Error: {str(e)}"
        })

async def run_etl_ventas_production(ubicacion_id: Optional[str] = None, fecha_inicio: Optional[str] = None, fecha_fin: Optional[str] = None):
    """Ejecuta ETL de ventas en producción lanzando una tarea ECS en AWS"""
    if not BOTO3_AVAILABLE:
        ventas_etl_status["running"] = False
        ventas_etl_status["result"] = {
            "exitoso": False,
            "mensaje": "boto3 no disponible - no se puede ejecutar ETL de ventas en producción",
            "errores": ["boto3 module not installed"]
        }
        ventas_etl_status["logs"].append({
            "timestamp": datetime.now().isoformat(),
            "level": "error",
            "message": "boto3 no disponible"
        })
        return

    try:
        start_time = datetime.now()

        # Configuración de ECS desde variables de entorno
        cluster_name = os.getenv("ECS_CLUSTER_NAME", "fluxion-cluster")
        task_definition = os.getenv("VENTAS_TASK_DEFINITION")
        subnets = os.getenv("ETL_SUBNETS", "").split(",")
        security_groups = os.getenv("ETL_SECURITY_GROUPS", "").split(",")
        aws_region = os.getenv("AWS_REGION", "us-east-1")

        if not task_definition:
            raise ValueError("VENTAS_TASK_DEFINITION environment variable not set")

        # Construir comando ETL de ventas
        etl_command = ["python3", "/app/etl_ventas_multi_tienda.py"]

        if ubicacion_id == "--todas":
            etl_command.append("--todas")
            ventas_etl_status["message"] = "Lanzando ETL de ventas para todas las tiendas en ECS..."
        elif ubicacion_id:
            etl_command.extend(["--tienda", ubicacion_id])
            ventas_etl_status["message"] = f"Lanzando ETL de ventas para {ubicacion_id} en ECS..."
        else:
            etl_command.append("--todas")
            ventas_etl_status["message"] = "Lanzando ETL de ventas para todas las tiendas en ECS..."

        # Agregar parámetros de fecha si se proporcionan
        if fecha_inicio:
            etl_command.extend(["--fecha-inicio", fecha_inicio])
        if fecha_fin:
            etl_command.extend(["--fecha-fin", fecha_fin])

        logger.info(f"Lanzando tarea ECS de ventas: {cluster_name} / {task_definition}")
        logger.info(f"Comando ETL de ventas: {' '.join(etl_command)}")

        ventas_etl_status["logs"].append({
            "timestamp": datetime.now().isoformat(),
            "level": "info",
            "message": f"Lanzando tarea ECS de ventas en cluster {cluster_name}"
        })

        # Crear cliente ECS
        ecs = boto3.client("ecs", region_name=aws_region)

        # Lanzar tarea ECS
        response = ecs.run_task(
            cluster=cluster_name,
            taskDefinition=task_definition,
            launchType="FARGATE",
            networkConfiguration={
                "awsvpcConfiguration": {
                    "subnets": subnets,
                    "securityGroups": security_groups,
                    "assignPublicIp": "DISABLED"  # En subnet privada con NAT
                }
            },
            overrides={
                "containerOverrides": [
                    {
                        "name": "ventas-etl",
                        "command": etl_command
                    }
                ]
            },
            propagateTags="TASK_DEFINITION"
        )

        # Obtener ARN de la tarea
        if response["tasks"]:
            task_arn = response["tasks"][0]["taskArn"]
            task_id = task_arn.split("/")[-1]

            logger.info(f"Tarea ECS de ventas lanzada: {task_id}")

            ventas_etl_status["logs"].append({
                "timestamp": datetime.now().isoformat(),
                "level": "info",
                "message": f"✅ Tarea ECS de ventas lanzada exitosamente: {task_id}"
            })
            ventas_etl_status["logs"].append({
                "timestamp": datetime.now().isoformat(),
                "level": "info",
                "message": "La sincronización de ventas está en progreso. Los datos se actualizarán cuando la tarea finalice."
            })

            # Marcar como completado el lanzamiento (no esperamos a que termine la tarea)
            ventas_etl_status["running"] = False
            ventas_etl_status["result"] = {
                "exitoso": True,
                "mensaje": f"Tarea ECS de ventas lanzada exitosamente: {task_id}",
                "task_arn": task_arn,
                "task_id": task_id,
                "tiempo_ejecucion": (datetime.now() - start_time).total_seconds()
            }
        else:
            raise Exception("No se pudo lanzar la tarea ECS de ventas - respuesta vacía")

    except Exception as e:
        logger.error(f"Error lanzando tarea ECS de ventas: {str(e)}")
        ventas_etl_status["running"] = False
        ventas_etl_status["result"] = {
            "exitoso": False,
            "mensaje": f"Error lanzando ETL de ventas en producción: {str(e)}",
            "errores": [str(e)]
        }
        ventas_etl_status["logs"].append({
            "timestamp": datetime.now().isoformat(),
            "level": "error",
            "message": f"❌ Error: {str(e)}"
        })

async def run_etl_ventas_background(ubicacion_id: Optional[str] = None, fecha_inicio: Optional[str] = None, fecha_fin: Optional[str] = None):
    """Ejecuta el ETL de ventas en background sin bloquear el servidor"""
    try:
        start_time = datetime.now()
        etl_script = Path(__file__).parent.parent / "etl" / "etl_ventas_multi_tienda.py"

        # Usar Python del venv de ETL si existe, sino usar python3 del sistema
        etl_venv_python = Path(__file__).parent.parent / "etl" / "venv" / "bin" / "python3"
        python_cmd = str(etl_venv_python) if etl_venv_python.exists() else "python3"

        # Construir comando
        if ubicacion_id:
            command = [python_cmd, str(etl_script), "--tienda", ubicacion_id]
            ventas_etl_status["message"] = f"Sincronizando ventas de {ubicacion_id}..."
        else:
            command = [python_cmd, str(etl_script), "--todas"]
            ventas_etl_status["message"] = "Sincronizando ventas de todas las tiendas..."

        # Agregar parámetros de fecha si se proporcionan
        if fecha_inicio:
            command.extend(["--fecha-inicio", fecha_inicio])
        if fecha_fin:
            command.extend(["--fecha-fin", fecha_fin])

        logger.info(f"Ejecutando ETL de ventas en background: {' '.join(command)}")

        # Agregar log inicial
        ventas_etl_status["logs"].append({
            "timestamp": datetime.now().isoformat(),
            "level": "info",
            "message": f"Ejecutando comando: {' '.join(command)}"
        })

        # Ejecutar ETL de forma asíncrona
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        # Leer stdout y stderr línea por línea en tiempo real
        async def read_stream(stream, stream_name):
            while True:
                line = await stream.readline()
                if not line:
                    break
                line_text = line.decode().strip()
                if line_text:
                    # Detectar el nivel real del log basado en contenido
                    if "ERROR" in line_text or "❌" in line_text or "falló" in line_text.lower():
                        level = "error"
                    elif "WARNING" in line_text or "⚠️" in line_text or "warning" in line_text.lower():
                        level = "warning"
                    elif "✅" in line_text or "exitoso" in line_text.lower() or "completado" in line_text.lower():
                        level = "success"
                    else:
                        level = "info"

                    ventas_etl_status["logs"].append({
                        "timestamp": datetime.now().isoformat(),
                        "level": level,
                        "message": line_text
                    })
                    logger.info(f"[ETL Ventas {stream_name}] {line_text}")

        # Leer ambos streams simultáneamente
        await asyncio.gather(
            read_stream(process.stdout, "stdout"),
            read_stream(process.stderr, "stderr")
        )

        # Esperar a que el proceso termine
        await asyncio.wait_for(process.wait(), timeout=600)

        end_time = datetime.now()
        tiempo_ejecucion = (end_time - start_time).total_seconds()

        # Marcar resultado
        exitoso = process.returncode == 0

        if exitoso:
            ventas_etl_status["logs"].append({
                "timestamp": datetime.now().isoformat(),
                "level": "info",
                "message": f"✅ ETL de ventas completado exitosamente en {tiempo_ejecucion:.2f}s"
            })
            ventas_etl_status["result"] = {
                "exitoso": True,
                "mensaje": "ETL de ventas completado",
                "tiempo_ejecucion": tiempo_ejecucion
            }
        else:
            ventas_etl_status["logs"].append({
                "timestamp": datetime.now().isoformat(),
                "level": "error",
                "message": f"❌ ETL de ventas falló con código {process.returncode}"
            })
            ventas_etl_status["result"] = {
                "exitoso": False,
                "mensaje": f"ETL de ventas falló con código {process.returncode}",
                "errores": [f"Exit code: {process.returncode}"]
            }

        ventas_etl_status["running"] = False

    except asyncio.TimeoutError:
        logger.error("Timeout ejecutando ETL de ventas")
        ventas_etl_status["running"] = False
        ventas_etl_status["result"] = {
            "exitoso": False,
            "mensaje": "Timeout ejecutando ETL de ventas (>10 minutos)",
            "errores": ["Timeout"]
        }
        ventas_etl_status["logs"].append({
            "timestamp": datetime.now().isoformat(),
            "level": "error",
            "message": "❌ Timeout ejecutando ETL de ventas"
        })
    except Exception as e:
        logger.error(f"Error ejecutando ETL de ventas: {str(e)}")
        ventas_etl_status["running"] = False
        ventas_etl_status["result"] = {
            "exitoso": False,
            "mensaje": f"Error ejecutando ETL de ventas: {str(e)}",
            "errores": [str(e)]
        }
        ventas_etl_status["logs"].append({
            "timestamp": datetime.now().isoformat(),
            "level": "error",
            "message": f"❌ Error: {str(e)}"
        })

async def run_etl_background(ubicacion_id: Optional[str] = None):
    """Ejecuta el ETL en background sin bloquear el servidor"""
    try:
        start_time = datetime.now()
        etl_script = Path(__file__).parent.parent / "etl" / "etl_inventario.py"

        # Usar Python del venv de ETL si existe, sino usar python3 del sistema
        etl_venv_python = Path(__file__).parent.parent / "etl" / "venv" / "bin" / "python3"
        python_cmd = str(etl_venv_python) if etl_venv_python.exists() else "python3"

        # Construir comando
        if ubicacion_id:
            command = [python_cmd, str(etl_script), "--tienda", ubicacion_id]
            etl_status["message"] = f"Sincronizando {ubicacion_id}..."
        else:
            command = [python_cmd, str(etl_script), "--todas"]
            etl_status["message"] = "Sincronizando todas las tiendas..."

        logger.info(f"Ejecutando ETL en background: {' '.join(command)}")

        # Agregar log inicial
        etl_status["logs"].append({
            "timestamp": datetime.now().isoformat(),
            "level": "info",
            "message": f"Ejecutando comando: {' '.join(command)}"
        })

        # Ejecutar ETL de forma asíncrona
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        # Leer stdout y stderr línea por línea en tiempo real
        async def read_stream(stream, stream_name):
            while True:
                line = await stream.readline()
                if not line:
                    break
                line_text = line.decode().strip()
                if line_text:
                    # Detectar el nivel real del log basado en contenido
                    if "ERROR" in line_text or "❌" in line_text or "falló" in line_text.lower():
                        level = "error"
                    elif "WARNING" in line_text or "⚠️" in line_text or "warning" in line_text.lower():
                        level = "warning"
                    elif "✅" in line_text or "exitoso" in line_text.lower() or "completado" in line_text.lower():
                        level = "success"
                    else:
                        level = "info"

                    # Detectar progreso de tiendas en el output
                    import re
                    tienda_match = re.search(r'tienda_(\d+)', line_text.lower())
                    if tienda_match:
                        tienda_id = f"tienda_{tienda_match.group(1)}"

                        # Actualizar o agregar status de tienda
                        tienda_found = False
                        for t in etl_status["tiendas_status"]:
                            if t["id"] == tienda_id:
                                t["status"] = "processing"
                                t["last_update"] = datetime.now().isoformat()
                                tienda_found = True
                                break

                        if not tienda_found:
                            etl_status["tiendas_status"].append({
                                "id": tienda_id,
                                "status": "processing",
                                "last_update": datetime.now().isoformat()
                            })

                        # Detectar éxito o error
                        if "✅" in line_text or "exitoso" in line_text.lower() or "completado" in line_text.lower():
                            for t in etl_status["tiendas_status"]:
                                if t["id"] == tienda_id:
                                    t["status"] = "completed"
                                    t["success"] = True
                                    # Extraer registros si están disponibles
                                    registros_match = re.search(r'(\d+)\s*registros', line_text)
                                    if registros_match:
                                        t["registros"] = int(registros_match.group(1))
                                    break
                        elif "❌" in line_text or "error" in line_text.lower() or "falló" in line_text.lower():
                            for t in etl_status["tiendas_status"]:
                                if t["id"] == tienda_id:
                                    t["status"] = "error"
                                    t["success"] = False
                                    t["error_message"] = line_text
                                    break

                    etl_status["logs"].append({
                        "timestamp": datetime.now().isoformat(),
                        "level": level,
                        "message": line_text
                    })
                    logger.info(f"[ETL {stream_name}] {line_text}")

        # Leer ambos streams simultáneamente
        await asyncio.gather(
            read_stream(process.stdout, "stdout"),
            read_stream(process.stderr, "stderr")
        )

        # Esperar a que el proceso termine
        await asyncio.wait_for(process.wait(), timeout=600)

        # Simular captura de stdout/stderr para compatibilidad
        stdout = b""
        stderr = b""

        end_time = datetime.now()
        tiempo_ejecucion = (end_time - start_time).total_seconds()

        # Parsear resultados
        exitoso = process.returncode == 0
        ubicaciones_procesadas = []
        errores = []

        if exitoso:
            # Contar registros actualizados CON DETALLE POR TIENDA
            with get_db_connection() as conn:
                # Obtener detalle por ubicación
                ubicaciones_detalle = []
                if ubicacion_id:
                    # Una sola ubicación
                    result = conn.execute("""
                        SELECT
                            ubicacion_id,
                            ubicacion_nombre,
                            COUNT(*) as registros,
                            COUNT(DISTINCT codigo_producto) as productos
                        FROM inventario_raw
                        WHERE DATE(fecha_extraccion) = CURRENT_DATE
                          AND ubicacion_id = ?
                        GROUP BY ubicacion_id, ubicacion_nombre
                    """, [ubicacion_id]).fetchone()

                    if result:
                        ubicaciones_detalle.append({
                            "id": result[0],
                            "nombre": result[1],
                            "registros": result[2],
                            "productos": result[3],
                            "success": True
                        })
                else:
                    # Todas las ubicaciones
                    result_ubicaciones = conn.execute("""
                        SELECT
                            ubicacion_id,
                            ubicacion_nombre,
                            COUNT(*) as registros,
                            COUNT(DISTINCT codigo_producto) as productos
                        FROM inventario_raw
                        WHERE DATE(fecha_extraccion) = CURRENT_DATE
                        GROUP BY ubicacion_id, ubicacion_nombre
                        ORDER BY ubicacion_id
                    """).fetchall()

                    for row in result_ubicaciones:
                        ubicaciones_detalle.append({
                            "id": row[0],
                            "nombre": row[1],
                            "registros": row[2],
                            "productos": row[3],
                            "success": True
                        })

                ubicaciones_procesadas = [u["id"] for u in ubicaciones_detalle]
                # Calcular total de registros de las ubicaciones procesadas
                total_registros = sum(u["registros"] for u in ubicaciones_detalle)

            message = f"✅ ETL completado: {len(ubicaciones_procesadas)} ubicaciones, {total_registros:,} registros"

            # Agregar log de éxito
            etl_status["logs"].append({
                "timestamp": datetime.now().isoformat(),
                "level": "success",
                "message": message
            })
        else:
            total_registros = 0
            ubicaciones_detalle = []
            error_msg = "Ver logs para detalles"
            errores.append(error_msg)
            message = f"❌ ETL falló: {error_msg}"

            # Agregar log de error
            etl_status["logs"].append({
                "timestamp": datetime.now().isoformat(),
                "level": "error",
                "message": f"ETL terminó con código de error: {process.returncode}"
            })

        etl_status["running"] = False
        etl_status["progress"] = 100
        etl_status["message"] = message
        etl_status["result"] = {
            "success": exitoso,
            "message": message,
            "ubicaciones_procesadas": ubicaciones_procesadas,
            "ubicaciones_detalle": ubicaciones_detalle,  # NUEVO: Detalle por tienda
            "total_registros": total_registros,
            "tiempo_ejecucion": tiempo_ejecucion,
            "errores": errores
        }

    except asyncio.TimeoutError:
        etl_status["running"] = False
        etl_status["message"] = "❌ ETL timeout después de 10 minutos"
        etl_status["result"] = {
            "success": False,
            "message": "ETL timeout",
            "ubicaciones_procesadas": [],
            "ubicaciones_detalle": [],
            "total_registros": 0,
            "tiempo_ejecucion": 600,
            "errores": ["Timeout después de 10 minutos"]
        }
    except Exception as e:
        etl_status["running"] = False
        etl_status["message"] = f"❌ Error: {str(e)}"
        etl_status["result"] = {
            "success": False,
            "message": f"Error: {str(e)}",
            "ubicaciones_procesadas": [],
            "ubicaciones_detalle": [],
            "total_registros": 0,
            "tiempo_ejecucion": 0,
            "errores": [str(e)]
        }
        logger.error(f"Error ejecutando ETL: {str(e)}")

@app.get("/api/etl/status", tags=["ETL"])
async def get_etl_status():
    """Obtiene el estado actual del ETL"""
    return etl_status

@app.get("/api/etl/check-connectivity", tags=["ETL"])
async def check_connectivity():
    """Verifica la conectividad a todas las tiendas antes de ejecutar el ETL"""
    import socket
    from datetime import datetime

    async def test_ip_port(ip: str, port: int, timeout: float = 0.5):
        """Test IP and port connectivity"""
        import time
        start_time = time.time()

        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex((ip, port))
            sock.close()

            response_time = (time.time() - start_time) * 1000  # ms

            # result == 0 means successful connection
            return True, result == 0, response_time
        except (socket.gaierror, socket.timeout, OSError):
            response_time = (time.time() - start_time) * 1000
            return False, False, response_time

    # Hardcoded server IPs and ports from tiendas_config.py
    TIENDAS_NETWORK = {
            "tienda_01": {"ip": "192.168.20.12", "port": 14348},
            "tienda_02": {"ip": "192.168.30.52", "port": 14348},
            "tienda_03": {"ip": "192.168.50.20", "port": 14348},
            "tienda_04": {"ip": "192.168.140.10", "port": 14348},
            "tienda_05": {"ip": "192.168.80.10", "port": 14348},
            "tienda_06": {"ip": "192.168.40.53", "port": 14348},
            "tienda_07": {"ip": "192.168.130.10", "port": 14348},
            "tienda_08": {"ip": "192.168.150.10", "port": 14348},
            "tienda_09": {"ip": "192.168.120.10", "port": 14348},
            "tienda_10": {"ip": "192.168.70.10", "port": 14348},
            "tienda_11": {"ip": "192.168.160.10", "port": 14348},
            "tienda_12": {"ip": "192.168.170.10", "port": 1433},
            "tienda_13": {"ip": "192.168.190.10", "port": 14348},
            "tienda_15": {"ip": "192.168.180.10", "port": 1433},
            "tienda_16": {"ip": "192.168.110.10", "port": 1433},
            "tienda_19": {"ip": "192.168.210.10", "port": 1433},
            "tienda_20": {"ip": "192.168.220.10", "port": 1433},
            "cedi_seco": {"ip": "192.168.90.20", "port": 1433},
            "cedi_frio": {"ip": "192.168.170.20", "port": 1433},
            "cedi_verde": {"ip": "192.168.200.10", "port": 1433},
        }

    try:
        # Get ubicaciones from database
        ubicaciones_response = await get_ubicaciones()
        ubicaciones = ubicaciones_response if isinstance(ubicaciones_response, list) else []

        # Test connectivity for each ubicacion
        tiendas_status = []
        for ubicacion in ubicaciones:
            # Get ubicacion data (could be dict or object)
            ub_id = ubicacion.id if hasattr(ubicacion, 'id') else ubicacion.get('id')
            ub_nombre = ubicacion.nombre if hasattr(ubicacion, 'nombre') else ubicacion.get('nombre')

            # Get network info from hardcoded config
            network_info = TIENDAS_NETWORK.get(ub_id)
            if not network_info:
                continue

            ub_server_ip = network_info['ip']
            ub_port = network_info['port']

            ip_ok, puerto_ok, tiempo = await test_ip_port(ub_server_ip, ub_port)

            accesible = puerto_ok or ip_ok
            error_msg = None
            if not accesible:
                error_msg = "No alcanzable" if not ip_ok else "Puerto cerrado"

            tiendas_status.append({
                "ubicacion_id": ub_id,
                "nombre": ub_nombre,
                "accesible": accesible,
                "tiempo_respuesta": tiempo,
                "error": error_msg
            })

        # Contar tiendas accesibles
        conectadas = sum(1 for t in tiendas_status if t['accesible'])
        total = len(tiendas_status)

        return {
            "success": True,
            "tiendas": tiendas_status,
            "resumen": {
                "total": total,
                "conectadas": conectadas,
                "porcentaje": (conectadas / total * 100) if total > 0 else 0
            }
        }

    except Exception as e:
        logger.error(f"Error verificando conectividad: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "tiendas": [],
            "resumen": {"total": 0, "conectadas": 0, "porcentaje": 0}
        }

@app.get("/api/etl/test-connection-generic", tags=["ETL"])
async def test_connection_generic():
    """Ejecuta el test de conexión genérico para identificar tiendas con problemas"""
    try:
        test_script = Path(__file__).parent.parent / "etl" / "_backup_cleanup" / "tests" / "test_connection_generic.py"
        etl_venv_python = Path(__file__).parent.parent / "etl" / "venv" / "bin" / "python3"
        python_cmd = str(etl_venv_python) if etl_venv_python.exists() else "python3"

        if not test_script.exists():
            raise HTTPException(status_code=404, detail=f"Script de test no encontrado: {test_script}")

        # Ejecutar el script de test genérico
        process = await asyncio.create_subprocess_exec(
            python_cmd, str(test_script),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(test_script.parent)
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60)

        # Capturar toda la salida para los logs
        output_lines = stdout.decode().split('\n')
        error_lines = stderr.decode().split('\n') if stderr else []

        # Parsear resultados
        drivers_disponibles = []
        tiendas_results = []
        current_tienda = None

        for line in output_lines:
            line = line.strip()
            if not line:
                continue

            # Detectar drivers ODBC
            if "DRIVERS ODBC DISPONIBLES" in line:
                continue
            elif line and line[0].isdigit() and '. ' in line:
                driver_name = line.split('. ', 1)[1]
                drivers_disponibles.append(driver_name)

            # Detectar inicio de prueba de tienda
            elif "Usando driver:" in line:
                current_tienda = {"driver": line.split("Usando driver:", 1)[1].strip()}
            elif "PRUEBAS DE CONEXIÓN" in line:
                continue
            elif line.startswith("Probando") and ":" in line:
                tienda_info = line.split("Probando", 1)[1].split(":")[0].strip()
                current_tienda = {"tienda": tienda_info, "status": "testing"}
            elif "✅" in line and current_tienda:
                current_tienda["success"] = True
                current_tienda["message"] = line
                if "productos" in line.lower():
                    # Extraer número de productos
                    import re
                    match = re.search(r'(\d+[\d,]*)\s*productos', line)
                    if match:
                        current_tienda["productos"] = int(match.group(1).replace(',', ''))
                tiendas_results.append(current_tienda)
                current_tienda = None
            elif "❌" in line and current_tienda:
                current_tienda["success"] = False
                current_tienda["message"] = line
                tiendas_results.append(current_tienda)
                current_tienda = None

        # Resumen
        exitosas = sum(1 for t in tiendas_results if t.get("success", False))
        total_tiendas = len(tiendas_results)

        return {
            "success": process.returncode == 0,
            "drivers_disponibles": drivers_disponibles,
            "tiendas": tiendas_results,
            "resumen": {
                "total": total_tiendas,
                "exitosas": exitosas,
                "fallidas": total_tiendas - exitosas,
                "porcentaje_exito": (exitosas / total_tiendas * 100) if total_tiendas > 0 else 0
            },
            "logs": output_lines,
            "errors": error_lines if error_lines else []
        }

    except asyncio.TimeoutError:
        return {
            "success": False,
            "error": "Timeout ejecutando test de conexión (>60s)",
            "drivers_disponibles": [],
            "tiendas": [],
            "resumen": {"total": 0, "exitosas": 0, "fallidas": 0, "porcentaje_exito": 0},
            "logs": [],
            "errors": ["Timeout después de 60 segundos"]
        }
    except Exception as e:
        logger.error(f"Error ejecutando test de conexión genérico: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.post("/api/etl/sync", tags=["ETL"])
async def trigger_etl_sync(request: ETLSyncRequest, background_tasks: BackgroundTasks):
    """Inicia el ETL de inventario en background y retorna inmediatamente"""

    # Check si hay un ETL corriendo, pero con timeout de 10 minutos
    if etl_status["running"]:
        # Si ha pasado más de 10 minutos, asumir que está colgado y permitir override
        last_update = etl_status.get("last_update")
        if last_update:
            time_elapsed = datetime.now() - last_update
            if time_elapsed > timedelta(minutes=10):
                logger.warning(f"ETL colgado detectado (>10 min), permitiendo override")
                etl_status["running"] = False
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"ETL ya está en ejecución. Tiempo transcurrido: {time_elapsed.seconds}s"
                )
        else:
            raise HTTPException(status_code=409, detail="ETL ya está en ejecución")

    # Inicializar estado COMPLETAMENTE LIMPIO
    etl_status.clear()
    etl_status["running"] = True
    etl_status["progress"] = 0
    etl_status["message"] = f"Iniciando ETL para {request.ubicacion_id if request.ubicacion_id else 'todas las ubicaciones'}..."
    etl_status["result"] = None
    etl_status["logs"] = []
    etl_status["tiendas_status"] = []
    etl_status["last_update"] = datetime.now()
    etl_status["ubicacion_solicitada"] = request.ubicacion_id

    # Log inicial claro
    logger.info(f"🔄 Iniciando sincronización para: {request.ubicacion_id if request.ubicacion_id else 'TODAS'}")

    # Detectar entorno y ejecutar la función correspondiente
    if is_production_environment():
        # En producción (AWS ECS), lanzar tarea ECS
        logger.info("Entorno de producción detectado - lanzando tarea ECS")
        background_tasks.add_task(run_etl_production, request.ubicacion_id)
        message = "ETL task being launched on ECS. Data will update when task completes."
    else:
        # En desarrollo (local), usar subprocess
        logger.info("Entorno de desarrollo detectado - ejecutando ETL local")
        background_tasks.add_task(run_etl_background, request.ubicacion_id)
        message = "ETL iniciado en background. Use /api/etl/status para monitorear el progreso."

    return {
        "success": True,
        "message": message,
        "status": "running",
        "environment": "production" if is_production_environment() else "development",
        "ubicacion_id": request.ubicacion_id
    }

@app.get("/api/etl/logs", tags=["ETL"])
async def get_etl_logs():
    """Obtiene los logs del ETL en ejecución o el último ejecutado

    En producción: obtiene logs de CloudWatch usando el task_arn
    En desarrollo: obtiene logs del proceso local
    """

    # Si está en producción y hay un task_arn, obtener logs de CloudWatch
    if is_production_environment() and etl_status.get("task_arn") and BOTO3_AVAILABLE:
        try:
            task_id = etl_status.get("task_id")
            log_group = etl_status.get("log_group")

            # El log stream en ECS Fargate tiene el formato: prefix/container-name/task-id
            log_stream_prefix = f"fluxion-etl/etl/{task_id}"

            logs_client = boto3.client("logs", region_name=os.getenv("AWS_REGION", "us-east-1"))

            # Obtener streams que coincidan con el task_id
            # Nota: Cuando usas logStreamNamePrefix, SOLO puedes ordenar por LogStreamName
            streams_response = logs_client.describe_log_streams(
                logGroupName=log_group,
                logStreamNamePrefix=log_stream_prefix,
                orderBy='LogStreamName',
                descending=True,
                limit=1
            )

            if not streams_response.get('logStreams'):
                # Todavía no hay logs, pero verificar si la tarea ya terminó
                ecs = boto3.client("ecs", region_name=os.getenv("AWS_REGION", "us-east-1"))
                task_response = ecs.describe_tasks(
                    cluster=os.getenv("ECS_CLUSTER_NAME", "fluxion-cluster"),
                    tasks=[etl_status["task_arn"]]
                )

                task_status = "starting"
                if task_response.get('tasks'):
                    last_status = task_response['tasks'][0]['lastStatus']
                    if last_status == "RUNNING":
                        task_status = "running"
                    elif last_status == "STOPPED":
                        task_status = "completed"
                        etl_status["running"] = False

                return {
                    "logs": etl_status.get("logs", []),
                    "status": task_status,
                    "progress": 10 if task_status == "starting" else (50 if task_status == "running" else 100),
                    "task_id": task_id,
                    "message": f"Tarea ECS {task_status}, esperando logs..." if task_status != "completed" else "ETL completado"
                }

            log_stream_name = streams_response['logStreams'][0]['logStreamName']

            # Obtener logs desde el último timestamp
            get_logs_params = {
                "logGroupName": log_group,
                "logStreamName": log_stream_name,
                "startFromHead": True
            }

            # Si ya tenemos un timestamp, solo obtener logs nuevos
            if etl_status.get("last_log_timestamp"):
                get_logs_params["startTime"] = etl_status["last_log_timestamp"] + 1

            logs_response = logs_client.get_log_events(**get_logs_params)

            # Convertir logs de CloudWatch al formato esperado
            cloudwatch_logs = []
            for event in logs_response.get('events', []):
                message = event['message'].strip()
                if message:
                    # Detectar nivel del log
                    if "ERROR" in message or "❌" in message or "falló" in message.lower():
                        level = "error"
                    elif "WARNING" in message or "⚠️" in message:
                        level = "warning"
                    elif "✅" in message or "exitoso" in message.lower():
                        level = "success"
                    else:
                        level = "info"

                    cloudwatch_logs.append({
                        "timestamp": datetime.fromtimestamp(event['timestamp'] / 1000).isoformat(),
                        "level": level,
                        "message": message
                    })

            # Actualizar último timestamp
            if logs_response.get('events'):
                etl_status["last_log_timestamp"] = logs_response['events'][-1]['timestamp']

            # Combinar logs iniciales con logs de CloudWatch
            all_logs = etl_status.get("logs", []) + cloudwatch_logs

            # IMPORTANTE: Guardar los logs combinados en memoria para persistirlos
            # Esto asegura que los logs no se pierdan cuando CloudWatch falla o la tarea termina
            etl_status["logs"] = all_logs

            # Verificar si la tarea sigue corriendo
            ecs = boto3.client("ecs", region_name=os.getenv("AWS_REGION", "us-east-1"))
            task_response = ecs.describe_tasks(
                cluster=os.getenv("ECS_CLUSTER_NAME", "fluxion-cluster"),
                tasks=[etl_status["task_arn"]]
            )

            task_status = "running"
            if task_response.get('tasks'):
                last_status = task_response['tasks'][0]['lastStatus']
                if last_status == "STOPPED":
                    task_status = "completed"
                    etl_status["running"] = False

            return {
                "logs": all_logs,
                "status": task_status,
                "progress": 50 if task_status == "running" else 100,
                "task_id": task_id,
                "log_stream": log_stream_name,
                "ubicacion_solicitada": etl_status.get("ubicacion_solicitada")
            }

        except Exception as e:
            logger.error(f"Error obteniendo logs de CloudWatch: {str(e)}")

            # Aunque falle CloudWatch, verificar el estado real de la tarea ECS
            try:
                ecs = boto3.client("ecs", region_name=os.getenv("AWS_REGION", "us-east-1"))
                task_response = ecs.describe_tasks(
                    cluster=os.getenv("ECS_CLUSTER_NAME", "fluxion-cluster"),
                    tasks=[etl_status["task_arn"]]
                )

                task_status = "running"
                progress = 50
                message = "ETL en progreso. Logs disponibles en CloudWatch."

                if task_response.get('tasks'):
                    last_status = task_response['tasks'][0]['lastStatus']
                    if last_status == "STOPPED":
                        task_status = "completed"
                        progress = 100
                        etl_status["running"] = False

                        # Verificar exit code
                        containers = task_response['tasks'][0].get('containers', [])
                        exit_code = containers[0].get('exitCode', -1) if containers else -1

                        if exit_code == 0:
                            message = "ETL completado exitosamente. Los logs están disponibles en CloudWatch."
                        else:
                            message = f"ETL finalizado con código de salida {exit_code}. Revisar logs en CloudWatch."
                    elif last_status == "RUNNING":
                        task_status = "running"
                        progress = 50

                return {
                    "logs": etl_status.get("logs", []),
                    "status": task_status,
                    "progress": progress,
                    "task_id": task_id,
                    "message": message,
                    "warning": f"No se pudieron obtener logs de CloudWatch: {str(e)}"
                }
            except Exception as ecs_error:
                logger.error(f"Error verificando estado ECS: {str(ecs_error)}")
                # Fallback total
                return {
                    "logs": etl_status.get("logs", []),
                    "status": "running" if etl_status["running"] else "completed",
                    "progress": etl_status.get("progress", 0),
                    "error": f"Error obteniendo logs de CloudWatch: {str(e)}"
                }

    # Modo desarrollo: logs locales
    return {
        "logs": etl_status.get("logs", []),
        "status": "running" if etl_status["running"] else "completed",
        "progress": etl_status.get("progress", 0),
        "ubicacion_solicitada": etl_status.get("ubicacion_solicitada")
    }

# ============================================================================
# ETL VENTAS SCHEDULER - Callback Function
# ============================================================================

async def run_etl_ventas_for_scheduler(ubicacion_id: str, fecha_inicio: str, fecha_fin: str) -> Dict:
    """
    Función callback para el scheduler de ventas
    Lanza ETL como ECS task - puede ser para una tienda específica o todas las tiendas

    Si ubicacion_id == "--todas", lanza ETL para todas las tiendas (con email de notificación)
    Si ubicacion_id es un ID específico, lanza solo esa tienda (sin email)
    """
    try:
        logger.info(f"🔄 Scheduler ejecutando ETL: {ubicacion_id} ({fecha_inicio} a {fecha_fin})")

        if not BOTO3_AVAILABLE:
            logger.error("❌ boto3 no disponible - no se puede lanzar ETL")
            return {"success": False, "tienda": ubicacion_id, "error": "boto3 not available"}

        # Configuración de ECS
        cluster_name = os.getenv("ECS_CLUSTER_NAME", "fluxion-cluster")
        task_definition = os.getenv("VENTAS_TASK_DEFINITION")
        subnets = os.getenv("ETL_SUBNETS", "").split(",")
        security_groups = os.getenv("ETL_SECURITY_GROUPS", "").split(",")
        aws_region = os.getenv("AWS_REGION", "us-east-1")

        if not task_definition:
            logger.error("❌ VENTAS_TASK_DEFINITION no configurado")
            return {"success": False, "tienda": ubicacion_id, "error": "VENTAS_TASK_DEFINITION not set"}

        # Construir comando para el contenedor ECS
        # Si ubicacion_id es "--todas", usar flag --todas en lugar de --tienda
        if ubicacion_id == "--todas":
            etl_command = [
                "python3", "/app/etl_ventas_multi_tienda.py",
                "--todas",
                "--fecha-inicio", fecha_inicio,
                "--fecha-fin", fecha_fin
            ]
            logger.info(f"📝 Lanzando ETL multi-tienda (TODAS las tiendas)")
        else:
            etl_command = [
                "python3", "/app/etl_ventas_multi_tienda.py",
                "--tienda", ubicacion_id,
                "--fecha-inicio", fecha_inicio,
                "--fecha-fin", fecha_fin
            ]
            logger.info(f"📝 Lanzando ETL para tienda: {ubicacion_id}")

        logger.info(f"📝 Comando ECS: {' '.join(etl_command)}")

        # Lanzar tarea ECS
        ecs = boto3.client('ecs', region_name=aws_region)

        response = ecs.run_task(
            cluster=cluster_name,
            taskDefinition=task_definition,
            launchType="FARGATE",
            networkConfiguration={
                "awsvpcConfiguration": {
                    "subnets": subnets,
                    "securityGroups": security_groups,
                    "assignPublicIp": "DISABLED"
                }
            },
            overrides={
                "containerOverrides": [{
                    "name": "ventas-etl",
                    "command": etl_command
                }]
            },
            propagateTags="TASK_DEFINITION"
        )

        if response.get("tasks"):
            task_arn = response["tasks"][0]["taskArn"]
            task_id = task_arn.split("/")[-1]
            logger.info(f"✅ ECS task lanzado: {task_id}")
            return {"success": True, "tienda": ubicacion_id, "task_id": task_id}
        elif response.get("failures"):
            failure = response["failures"][0]
            error_msg = failure.get("reason", "Unknown failure")
            logger.error(f"❌ {ubicacion_id} falló: {error_msg}")
            return {"success": False, "tienda": ubicacion_id, "error": error_msg}
        else:
            logger.error(f"❌ {ubicacion_id} - respuesta inesperada de ECS")
            return {"success": False, "tienda": ubicacion_id, "error": "Unexpected ECS response"}

    except Exception as e:
        logger.error(f"❌ Error lanzando ETL para {ubicacion_id}: {str(e)}")
        return {"success": False, "tienda": ubicacion_id, "error": str(e)}

# ============================================================================
# ETL VENTAS SCHEDULER ENDPOINTS
# ============================================================================

@app.get("/api/etl/scheduler/status", tags=["ETL Scheduler"])
async def get_scheduler_status():
    """Obtiene el estado del scheduler automático de ventas"""
    if not ventas_scheduler:
        raise HTTPException(status_code=500, detail="Scheduler no inicializado")

    return ventas_scheduler.get_status()

@app.post("/api/etl/scheduler/enable", tags=["ETL Scheduler"])
async def enable_scheduler():
    """Habilita el scheduler automático"""
    if not ventas_scheduler:
        raise HTTPException(status_code=500, detail="Scheduler no inicializado")

    if not ventas_scheduler.status.enabled:
        ventas_scheduler.start()
        return {"success": True, "message": "Scheduler habilitado"}

    return {"success": True, "message": "Scheduler ya está habilitado"}

@app.post("/api/etl/scheduler/disable", tags=["ETL Scheduler"])
async def disable_scheduler():
    """Deshabilita el scheduler automático"""
    if not ventas_scheduler:
        raise HTTPException(status_code=500, detail="Scheduler no inicializado")

    ventas_scheduler.stop()
    return {"success": True, "message": "Scheduler deshabilitado"}

@app.post("/api/etl/scheduler/trigger", tags=["ETL Scheduler"])
async def trigger_scheduler_manual(
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None
):
    """
    Ejecuta el ETL programado manualmente (fuera del horario)

    Args:
        fecha_inicio: Fecha inicial en formato YYYY-MM-DD (opcional, default: ayer)
        fecha_fin: Fecha final en formato YYYY-MM-DD (opcional, default: ayer)
    """
    if not ventas_scheduler:
        raise HTTPException(status_code=500, detail="Scheduler no inicializado")

    result = ventas_scheduler.trigger_manual_execution(fecha_inicio, fecha_fin)
    return result

@app.put("/api/etl/scheduler/config", tags=["ETL Scheduler"])
async def update_scheduler_config(
    max_retries: Optional[int] = None,
    retry_interval_minutes: Optional[int] = None,
    execution_hour: Optional[int] = None,
    execution_minute: Optional[int] = None
):
    """Actualiza la configuración del scheduler"""
    if not ventas_scheduler:
        raise HTTPException(status_code=500, detail="Scheduler no inicializado")

    result = ventas_scheduler.update_config(
        max_retries=max_retries,
        retry_interval_minutes=retry_interval_minutes,
        execution_hour=execution_hour,
        execution_minute=execution_minute
    )
    return result

# ============================================================================
# ETL VENTAS ENDPOINTS (Manual)
# ============================================================================

@app.post("/api/etl/sync/ventas", tags=["ETL"])
async def trigger_ventas_etl_sync(request: VentasETLSyncRequest, background_tasks: BackgroundTasks):
    """Inicia el ETL de ventas en background y retorna inmediatamente"""

    if ventas_etl_status["running"]:
        raise HTTPException(status_code=409, detail="ETL de ventas ya está en ejecución")

    # Inicializar estado
    ventas_etl_status["running"] = True
    ventas_etl_status["progress"] = 0
    ventas_etl_status["message"] = "Iniciando ETL de ventas..."
    ventas_etl_status["result"] = None
    ventas_etl_status["logs"] = []  # Limpiar logs anteriores
    ventas_etl_status["tiendas_status"] = []  # Limpiar status de tiendas
    ventas_etl_status["fecha_inicio"] = request.fecha_inicio
    ventas_etl_status["fecha_fin"] = request.fecha_fin

    # Detectar entorno y ejecutar la función correspondiente
    if is_production_environment():
        # En producción (AWS ECS), lanzar tarea ECS
        logger.info("Entorno de producción detectado - lanzando tarea ECS de ventas")
        background_tasks.add_task(
            run_etl_ventas_production,
            request.ubicacion_id,
            request.fecha_inicio,
            request.fecha_fin
        )
        message = "ETL de ventas task being launched on ECS. Data will update when task completes."
    else:
        # En desarrollo (local), usar subprocess
        logger.info("Entorno de desarrollo detectado - ejecutando ETL de ventas local")
        background_tasks.add_task(
            run_etl_ventas_background,
            request.ubicacion_id,
            request.fecha_inicio,
            request.fecha_fin
        )
        message = "ETL de ventas iniciado en background. Use /api/etl/ventas/status para monitorear el progreso."

    return {
        "success": True,
        "message": message,
        "status": "running",
        "environment": "production" if is_production_environment() else "development",
        "fecha_inicio": request.fecha_inicio,
        "fecha_fin": request.fecha_fin
    }

@app.get("/api/etl/ventas/status", tags=["ETL"])
async def get_ventas_etl_status():
    """Obtiene el estado actual del ETL de ventas"""
    return {
        "running": ventas_etl_status["running"],
        "progress": ventas_etl_status.get("progress", 0),
        "message": ventas_etl_status.get("message", ""),
        "result": ventas_etl_status.get("result"),
        "tiendas_status": ventas_etl_status.get("tiendas_status", []),
        "fecha_inicio": ventas_etl_status.get("fecha_inicio"),
        "fecha_fin": ventas_etl_status.get("fecha_fin")
    }

@app.get("/api/etl/ventas/logs", tags=["ETL"])
async def get_ventas_etl_logs():
    """Obtiene los logs del ETL de ventas en ejecución o el último ejecutado"""
    return {
        "logs": ventas_etl_status.get("logs", []),
        "status": "running" if ventas_etl_status["running"] else "completed",
        "progress": ventas_etl_status.get("progress", 0),
        "fecha_inicio": ventas_etl_status.get("fecha_inicio"),
        "fecha_fin": ventas_etl_status.get("fecha_fin")
    }

# ============================================================================
# VENTAS ENDPOINTS
# ============================================================================

@app.get("/api/ventas/summary", response_model=List[VentasSummaryResponse], tags=["Ventas"])
async def get_ventas_summary():
    """
    Obtiene resumen de ventas por ubicación
    PostgreSQL only - incluye cache TTL de 5 minutos para mejorar rendimiento
    """
    # Check cache first
    cached = get_cached_ventas_summary()
    if cached is not None:
        return cached

    try:
        with get_db_connection() as conn:
            query = """
                SELECT
                    u.id as ubicacion_id,
                    u.nombre as ubicacion_nombre,
                    'tienda' as tipo_ubicacion,
                    COUNT(DISTINCT v.numero_factura) as total_transacciones,
                    COUNT(DISTINCT v.producto_id) as productos_unicos,
                    CAST(SUM(v.cantidad_vendida) AS INTEGER) as unidades_vendidas,
                    TO_CHAR(MIN(v.fecha_venta), 'YYYY-MM-DD HH24:MI') as primera_venta,
                    TO_CHAR(MAX(v.fecha_venta), 'YYYY-MM-DD HH24:MI') as ultima_venta
                FROM ventas v
                INNER JOIN ubicaciones u ON v.ubicacion_id = u.id
                GROUP BY u.id, u.nombre
                ORDER BY u.nombre
            """
            cursor = conn.cursor()
            cursor.execute(query)
            result = cursor.fetchall()
            cursor.close()

            response_data = [
                VentasSummaryResponse(
                    ubicacion_id=row[0],
                    ubicacion_nombre=row[1],
                    tipo_ubicacion=row[2],
                    total_transacciones=row[3],
                    productos_unicos=row[4],
                    unidades_vendidas=row[5],
                    primera_venta=row[6],
                    ultima_venta=row[7]
                )
                for row in result
            ]

            # Store in cache before returning
            set_ventas_summary_cache(response_data)
            return response_data

    except Exception as e:
        logger.error(f"Error obteniendo resumen de ventas: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/ventas/gaps", tags=["Ventas"], deprecated=True)
async def get_ventas_gaps():
    """
    [DEPRECADO] Este endpoint usaba DuckDB y ha sido deprecado.
    Use /api/ventas/summary para información de ventas.
    """
    raise HTTPException(
        status_code=501,
        detail="Endpoint deprecado. Usaba tabla DuckDB ventas_raw que ya no existe."
    )

@app.get("/api/ventas/coverage-calendar", tags=["Ventas"], deprecated=True)
async def get_ventas_coverage_calendar(days: Optional[int] = 90, mode: str = "days"):
    """
    [DEPRECADO] Este endpoint usaba DuckDB y ha sido deprecado.
    Use /api/ventas/producto/diario para datos de ventas por día.
    """
    raise HTTPException(
        status_code=501,
        detail="Endpoint deprecado. Usaba tabla DuckDB ventas_raw que ya no existe."
    )

@app.get("/api/ventas/detail", response_model=PaginatedVentasResponse, tags=["Ventas"])
async def get_ventas_detail(
    ubicacion_id: Optional[str] = None,
    categoria: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = 'desc'
):
    """
    Obtiene detalle de ventas por producto con promedios y comparaciones (paginado)

    Args:
        ubicacion_id: Filtrar por ID de ubicación
        categoria: Filtrar por categoría
        fecha_inicio: Fecha inicial del rango (YYYY-MM-DD)
        fecha_fin: Fecha final del rango (YYYY-MM-DD)
        page: Número de página (inicia en 1)
        page_size: Cantidad de items por página (máx 500)
        search: Buscar por código o descripción de producto
        sort_by: Campo por el cual ordenar (cantidad_total, promedio_diario, categoria, porcentaje_total)
        sort_order: Orden ascendente (asc) o descendente (desc)
    """
    try:
        # Validar parámetros de paginación
        if page < 1:
            raise HTTPException(status_code=400, detail="El número de página debe ser >= 1")
        if page_size < 1 or page_size > 500:
            raise HTTPException(status_code=400, detail="page_size debe estar entre 1 y 500")

        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Calcular fechas por defecto
            if not fecha_fin:
                fecha_fin = datetime.now().strftime('%Y-%m-%d')
            if not fecha_inicio:
                fecha_inicio = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

            # Construir filtros
            where_clauses = ["fecha_venta >= %s::timestamp AND fecha_venta < (%s::date + interval '1 day')::timestamp"]
            params = [fecha_inicio, fecha_fin]

            if ubicacion_id:
                where_clauses.append("ubicacion_id = %s")
                params.append(ubicacion_id)
                # Excluir día de inauguración atípico para PARAÍSO (tienda_18)
                if ubicacion_id == 'tienda_18':
                    where_clauses.append("fecha_venta::date != '2025-12-06'")

            if search:
                # Buscar en código de producto y descripción (JOIN con productos)
                where_clauses.append("""
                    (producto_id ILIKE %s OR EXISTS (
                        SELECT 1 FROM productos p WHERE p.codigo = ventas.producto_id AND p.descripcion ILIKE %s
                    ))
                """)
                params.append(f"%{search}%")
                params.append(f"%{search}%")

            # Filtro por categoría (requiere JOIN con productos)
            categoria_filter = ""
            if categoria:
                categoria_filter = f" AND p.categoria = %s"

            where_clause = " AND ".join(where_clauses)

            # Contar productos únicos
            count_query = f"""
                SELECT COUNT(DISTINCT producto_id)
                FROM ventas
                WHERE {where_clause}
            """
            cursor.execute(count_query, params)
            total_items = cursor.fetchone()[0]

            total_pages = (total_items + page_size - 1) // page_size
            offset = (page - 1) * page_size

            # Calcular días distintos en el rango
            dias_query = f"""
                SELECT COUNT(DISTINCT fecha_venta::date) FROM ventas WHERE {where_clause}
            """
            cursor.execute(dias_query, params)
            dias_distintos = cursor.fetchone()[0] or 1

            # Query principal
            order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
            order_by = 'cantidad_total' if sort_by in ['cantidad_total', None] else 'cantidad_total'

            # Construir parámetros finales (incluyendo categoría si se especificó)
            final_params = params.copy()
            if categoria:
                final_params.append(categoria)

            main_query = f"""
                WITH ventas_filtradas AS (
                    SELECT producto_id, cantidad_vendida, venta_total, fecha_venta::date as fecha
                    FROM ventas
                    WHERE {where_clause}
                ),
                producto_stats AS (
                    SELECT
                        producto_id,
                        SUM(cantidad_vendida) as cantidad_total,
                        SUM(venta_total) as venta_total_sum
                    FROM ventas_filtradas
                    GROUP BY producto_id
                ),
                totales AS (
                    SELECT SUM(cantidad_total) as gran_total FROM producto_stats
                ),
                -- Calcular P75 de ventas diarias
                ventas_diarias AS (
                    SELECT
                        producto_id,
                        fecha,
                        SUM(cantidad_vendida) as cantidad_dia
                    FROM ventas_filtradas
                    GROUP BY producto_id, fecha
                ),
                p75_stats AS (
                    SELECT
                        producto_id,
                        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY cantidad_dia) as p75_unidades
                    FROM ventas_diarias
                    GROUP BY producto_id
                )
                SELECT
                    ps.producto_id,
                    COALESCE(p.descripcion, ps.producto_id) as descripcion,
                    COALESCE(p.categoria, 'Sin categoría') as categoria,
                    ps.cantidad_total,
                    ps.cantidad_total / {dias_distintos}::float as promedio_diario,
                    0 as promedio_mismo_dia_semana,
                    NULL as comparacion_ano_anterior,
                    (ps.cantidad_total / NULLIF(t.gran_total, 0) * 100) as porcentaje_total,
                    COALESCE(p.unidades_por_bulto, 1) as cantidad_bultos,
                    ps.cantidad_total / NULLIF(COALESCE(p.unidades_por_bulto, 1), 0) as total_bultos,
                    COALESCE(p75.p75_unidades, ps.cantidad_total / {dias_distintos}::float) / NULLIF(COALESCE(p.unidades_por_bulto, 1), 0) as promedio_bultos_diario
                FROM producto_stats ps
                CROSS JOIN totales t
                LEFT JOIN productos p ON ps.producto_id = p.codigo
                LEFT JOIN p75_stats p75 ON ps.producto_id = p75.producto_id
                WHERE 1=1 {categoria_filter}
                ORDER BY {order_by} {order_direction}
                LIMIT %s OFFSET %s
            """
            cursor.execute(main_query, final_params + [page_size, offset])
            result = cursor.fetchall()
            cursor.close()

            items = [
                VentasDetailResponse(
                    codigo_producto=row[0],
                    descripcion_producto=row[1],
                    categoria=row[2],
                    cantidad_total=float(row[3]) if row[3] else 0,
                    promedio_diario=float(row[4]) if row[4] else 0,
                    promedio_mismo_dia_semana=float(row[5]) if row[5] else 0,
                    comparacion_ano_anterior=float(row[6]) if row[6] else None,
                    porcentaje_total=float(row[7]) if row[7] else 0,
                    cantidad_bultos=float(row[8]) if row[8] else None,
                    total_bultos=float(row[9]) if row[9] else None,
                    promedio_bultos_diario=float(row[10]) if row[10] else None
                )
                for row in result
            ]

            return PaginatedVentasResponse(
                data=items,
                pagination=PaginationMetadata(
                    total_items=total_items,
                    total_pages=total_pages,
                    current_page=page,
                    page_size=page_size,
                    has_next=page < total_pages,
                    has_previous=page > 1
                )
            )

    except Exception as e:
        logger.error(f"Error obteniendo detalle de ventas: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/ventas/categorias", tags=["Ventas"])
async def get_ventas_categorias():
    """Obtiene todas las categorías de productos vendidos"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT DISTINCT p.categoria
                FROM productos p
                WHERE p.categoria IS NOT NULL
                  AND EXISTS (SELECT 1 FROM ventas v WHERE v.producto_id = p.codigo)
                ORDER BY p.categoria
            """)
            result = cursor.fetchall()
            cursor.close()
            return [{"value": row[0], "label": row[0]} for row in result]

    except Exception as e:
        logger.error(f"Error obteniendo categorías de ventas: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/ventas/producto/diario", tags=["Ventas"])
async def get_ventas_producto_diario(
    codigo_producto: str,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None
):
    """
    Obtiene ventas diarias de un producto específico, desglosado por tienda.
    Retorna cantidad en bultos por día y por tienda.
    """
    try:
        # Validar parámetros
        if not codigo_producto:
            raise HTTPException(status_code=400, detail="codigo_producto es requerido")

        # Calcular fechas por defecto (últimas 8 semanas = 56 días)
        if not fecha_fin:
            fecha_fin = datetime.now().strftime('%Y-%m-%d')
        if not fecha_inicio:
            fecha_inicio = (datetime.now() - timedelta(days=56)).strftime('%Y-%m-%d')

        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Obtener información del producto desde tabla productos (incluyendo unidades_por_bulto)
            cursor.execute("""
                SELECT codigo, descripcion, categoria, COALESCE(unidades_por_bulto, 1) as unidades_por_bulto
                FROM productos
                WHERE codigo = %s
            """, [codigo_producto])
            producto_info = cursor.fetchone()

            if not producto_info:
                cursor.close()
                raise HTTPException(status_code=404, detail="Producto no encontrado")

            unidades_por_bulto = float(producto_info[3]) if producto_info[3] else 1.0

            # Obtener ventas diarias por tienda
            ventas_query = """
                SELECT
                    v.fecha_venta::date as fecha,
                    v.ubicacion_id,
                    COALESCE(u.nombre, v.ubicacion_id) as ubicacion_nombre,
                    SUM(v.cantidad_vendida) / %s as total_bultos,
                    SUM(v.cantidad_vendida) as total_unidades,
                    SUM(v.venta_total) as venta_total
                FROM ventas v
                LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id
                WHERE v.producto_id = %s
                    AND v.fecha_venta::date BETWEEN %s AND %s
                    AND v.cantidad_vendida > 0
                GROUP BY v.fecha_venta::date, v.ubicacion_id, u.nombre
                ORDER BY v.fecha_venta::date, v.ubicacion_id
            """

            cursor.execute(ventas_query, [unidades_por_bulto, codigo_producto, fecha_inicio, fecha_fin])
            ventas_result = cursor.fetchall()
            cursor.close()

            # Obtener inventario histórico por día y tienda
            inventario_por_fecha_tienda = {}
            try:
                cursor = conn.cursor()
                inv_query = """
                    SELECT
                        fecha_snapshot::date as fecha,
                        ubicacion_id,
                        SUM(cantidad) as inventario_total
                    FROM inventario_historico
                    WHERE producto_id = %s
                        AND fecha_snapshot::date BETWEEN %s AND %s
                    GROUP BY fecha_snapshot::date, ubicacion_id
                    ORDER BY fecha_snapshot::date, ubicacion_id
                """
                cursor.execute(inv_query, [codigo_producto, fecha_inicio, fecha_fin])
                inv_result = cursor.fetchall()
                cursor.close()

                for row in inv_result:
                    fecha_inv, ubic_id, inv_total = row
                    fecha_inv_str = fecha_inv.strftime('%Y-%m-%d') if fecha_inv else None
                    if fecha_inv_str:
                        if fecha_inv_str not in inventario_por_fecha_tienda:
                            inventario_por_fecha_tienda[fecha_inv_str] = {}
                        inventario_por_fecha_tienda[fecha_inv_str][ubic_id] = float(inv_total) if inv_total else 0
            except Exception as inv_err:
                logger.warning(f"No se pudo obtener inventario histórico: {inv_err}")

            # Organizar datos por fecha y tienda
            ventas_por_fecha = {}
            tiendas_set = set()
            ventas_por_tienda = {}  # Para detectar outliers

            for row in ventas_result:
                fecha, ubicacion_id, ubicacion_nombre, bultos, unidades, venta = row
                fecha_str = fecha.strftime('%Y-%m-%d') if fecha else None

                if not fecha_str:
                    continue

                if fecha_str not in ventas_por_fecha:
                    ventas_por_fecha[fecha_str] = {}

                bultos_val = float(bultos) if bultos else 0

                # Obtener inventario histórico para esta fecha/tienda si existe
                inventario_dia = inventario_por_fecha_tienda.get(fecha_str, {}).get(ubicacion_id, None)

                ventas_por_fecha[fecha_str][ubicacion_id] = {
                    "tienda": ubicacion_nombre,
                    "bultos": bultos_val,
                    "unidades": float(unidades) if unidades else 0,
                    "venta_total": float(venta) if venta else 0,
                    "inventario": inventario_dia
                }

                # Guardar para análisis de outliers
                if ubicacion_id not in ventas_por_tienda:
                    ventas_por_tienda[ubicacion_id] = []
                ventas_por_tienda[ubicacion_id].append(bultos_val)

                tiendas_set.add(ubicacion_id)

            # Detectar outliers por tienda usando múltiples criterios (más agresivo)
            outliers_por_tienda = {}
            for tienda_id, valores in ventas_por_tienda.items():
                if len(valores) < 4:  # Necesita al menos 4 valores
                    outliers_por_tienda[tienda_id] = set()
                    continue

                valores_sorted = sorted(valores)
                n = len(valores_sorted)
                q1_idx = n // 4
                q3_idx = (3 * n) // 4
                mediana_idx = n // 2
                q1 = valores_sorted[q1_idx]
                q3 = valores_sorted[q3_idx]
                mediana = valores_sorted[mediana_idx]
                iqr = q3 - q1

                # Umbrales múltiples (más agresivos)
                umbral_iqr = max(0, q1 - 1.0 * iqr)  # Más estricto: 1.0x en lugar de 1.5x
                umbral_mediana = mediana * 0.30  # Excluir valores < 30% de la mediana
                umbral_q3 = q3 * 0.20  # Excluir valores < 20% del Q3

                outliers_por_tienda[tienda_id] = set()
                # Fecha de hoy (no marcar como outlier porque tiene datos parciales)
                hoy_str = datetime.now().strftime('%Y-%m-%d')
                for fecha in sorted(ventas_por_fecha.keys()):
                    if tienda_id in ventas_por_fecha[fecha]:
                        # Nunca marcar el día de hoy como outlier (datos incompletos)
                        if fecha == hoy_str:
                            continue
                        valor = ventas_por_fecha[fecha][tienda_id]["bultos"]
                        # Marcar como outlier si falla cualquiera de los 3 filtros
                        if (valor < umbral_iqr or
                            valor < umbral_mediana or
                            valor < umbral_q3):
                            outliers_por_tienda[tienda_id].add(fecha)

            # Convertir a lista ordenada y marcar outliers
            ventas_list = []
            for fecha in sorted(ventas_por_fecha.keys()):
                fecha_data = {
                    "fecha": fecha,
                    "tiendas": {}
                }
                for tienda_id, datos in ventas_por_fecha[fecha].items():
                    fecha_data["tiendas"][tienda_id] = {
                        **datos,
                        "es_outlier": fecha in outliers_por_tienda.get(tienda_id, set())
                    }
                ventas_list.append(fecha_data)

            return {
                "producto": {
                    "codigo": producto_info[0],
                    "descripcion": producto_info[1],
                    "categoria": producto_info[2]
                },
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin,
                "tiendas_disponibles": sorted(list(tiendas_set)),
                "ventas_diarias": ventas_list
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo ventas diarias del producto: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/ventas/producto/forecast", tags=["Ventas"])
async def get_forecast_producto(
    ubicacion_id: str,
    codigo_producto: str,
    dias_adelante: int = 7
):
    """
    Genera forecast de ventas usando Promedio Móvil Ponderado (PMP).

    Usa los últimos 20 días de ventas, excluyendo días con ventas anormalmente bajas
    (posibles quiebres de stock), y aplica pesos que dan más importancia a días recientes.

    Args:
        ubicacion_id: ID de la tienda
        codigo_producto: Código SKU del producto
        dias_adelante: Número de días a proyectar (default: 7)

    Returns:
        forecasts: Lista de proyecciones diarias con fecha, día de semana, y valores en unidades/bultos
    """
    try:
        from datetime import datetime, timedelta

        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Obtener unidades por bulto del producto
            cursor.execute("""
                SELECT COALESCE(unidades_por_bulto, 1) as unidades_por_bulto
                FROM productos
                WHERE codigo = %s
            """, [codigo_producto])
            producto_row = cursor.fetchone()

            if not producto_row:
                cursor.close()
                raise HTTPException(status_code=404, detail="Producto no encontrado")

            unidades_por_bulto = float(producto_row[0]) if producto_row[0] else 1.0

            # Obtener ventas de las últimas 6 semanas (42 días) para tener suficiente data por día de semana
            cursor.execute("""
                SELECT
                    fecha_venta::date as fecha,
                    EXTRACT(DOW FROM fecha_venta::date) as dia_semana,
                    SUM(cantidad_vendida) as total_unidades
                FROM ventas
                WHERE producto_id = %s
                    AND ubicacion_id = %s
                    AND fecha_venta >= CURRENT_DATE - INTERVAL '42 days'
                    AND fecha_venta < CURRENT_DATE
                GROUP BY fecha_venta::date
                ORDER BY fecha_venta::date
            """, [codigo_producto, ubicacion_id])

            ventas_rows = cursor.fetchall()
            cursor.close()

            # Construir lista de ventas diarias
            ventas_diarias = []
            for row in ventas_rows:
                ventas_diarias.append({
                    'fecha': row[0],
                    'dia_semana': int(row[1]),  # 0=domingo, 6=sábado (PostgreSQL DOW)
                    'unidades': float(row[2]) if row[2] else 0
                })

            # Si no hay datos históricos, retornar forecast vacío
            if len(ventas_diarias) == 0:
                return {
                    "ubicacion_id": ubicacion_id,
                    "codigo_producto": codigo_producto,
                    "dias_adelante": dias_adelante,
                    "forecasts": [],
                    "dias_excluidos": 0,
                    "metodo": "PMP_DIA_SEMANA"
                }

            # Calcular mediana global para detectar quiebres
            valores_ordenados = sorted([v['unidades'] for v in ventas_diarias])
            n = len(valores_ordenados)
            p50_idx = int(n * 0.5)
            mediana_global = valores_ordenados[p50_idx] if p50_idx < n else 0

            # Umbral: si un día tiene ventas < 30% de la mediana, considerarlo quiebre
            umbral_quiebre = mediana_global * 0.3

            # Filtrar días válidos (excluir posibles quiebres)
            dias_validos = [v for v in ventas_diarias if v['unidades'] >= umbral_quiebre or mediana_global == 0]
            dias_excluidos = len(ventas_diarias) - len(dias_validos)

            # Agrupar ventas por día de semana (0=Dom, 1=Lun, ..., 6=Sáb)
            ventas_por_dia_semana = {i: [] for i in range(7)}
            for venta in dias_validos:
                ventas_por_dia_semana[venta['dia_semana']].append(venta['unidades'])

            # Calcular promedio ponderado por día de semana
            # Pesos: más reciente = más peso
            promedios_dia_semana = {}
            for dia_sem, ventas_lista in ventas_por_dia_semana.items():
                if len(ventas_lista) == 0:
                    promedios_dia_semana[dia_sem] = None
                else:
                    # Aplicar pesos: más reciente = más peso
                    total_peso = 0
                    suma_ponderada = 0
                    for i, unidades in enumerate(ventas_lista):
                        peso = i + 1
                        suma_ponderada += unidades * peso
                        total_peso += peso
                    promedios_dia_semana[dia_sem] = suma_ponderada / total_peso if total_peso > 0 else 0

            # Calcular promedio general como fallback
            promedio_general = sum(v['unidades'] for v in dias_validos) / len(dias_validos) if dias_validos else 0

            # Generar forecasts para los próximos días
            dias_semana_nombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
            forecasts = []

            # Fecha base: hoy
            fecha_base = datetime.now().date()

            for i in range(1, dias_adelante + 1):
                fecha_forecast = fecha_base + timedelta(days=i)
                # Python weekday: 0=Lunes, 6=Domingo
                # PostgreSQL DOW: 0=Domingo, 6=Sábado
                python_weekday = fecha_forecast.weekday()
                dia_semana_dow = (python_weekday + 1) % 7  # Convertir a formato DOW

                # Usar promedio del día de semana específico, o fallback al general
                forecast_unidades = promedios_dia_semana.get(dia_semana_dow)
                if forecast_unidades is None:
                    forecast_unidades = promedio_general

                forecast_bultos = forecast_unidades / unidades_por_bulto

                forecasts.append({
                    "dia": i,
                    "fecha": fecha_forecast.strftime('%Y-%m-%d'),
                    "fecha_display": fecha_forecast.strftime('%d/%m'),
                    "dia_semana": dias_semana_nombres[dia_semana_dow],
                    "forecast_unidades": round(forecast_unidades, 2),
                    "forecast_bultos": round(forecast_bultos, 2)
                })

            return {
                "ubicacion_id": ubicacion_id,
                "codigo_producto": codigo_producto,
                "dias_adelante": dias_adelante,
                "forecasts": forecasts,
                "dias_excluidos": dias_excluidos,
                "metodo": "PMP_DIA_SEMANA"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generando forecast: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@app.get("/api/ventas/producto/horario", tags=["Ventas"])
async def get_ventas_producto_horario(
    codigo_producto: str,
    fecha: str,
    ubicacion_ids: Optional[str] = None
):
    """
    Obtiene ventas por hora de un producto para un día específico, desglosado por tienda.

    Permite hacer drill-down desde la vista diaria para ver el patrón de ventas
    hora a hora durante el día seleccionado.

    Args:
        codigo_producto: Código SKU del producto
        fecha: Fecha del día a consultar (YYYY-MM-DD)
        ubicacion_ids: IDs de tiendas separados por coma (opcional, si no se especifica retorna todas)

    Returns:
        producto: Info del producto
        fecha: Fecha consultada
        tiendas_disponibles: Lista de tiendas con datos
        ventas_horarias: Lista de objetos con hora y ventas por tienda
    """
    try:
        if not codigo_producto:
            raise HTTPException(status_code=400, detail="codigo_producto es requerido")
        if not fecha:
            raise HTTPException(status_code=400, detail="fecha es requerida")

        # Parsear ubicaciones si se proporcionan
        ubicaciones_filtro = None
        if ubicacion_ids:
            ubicaciones_filtro = [u.strip() for u in ubicacion_ids.split(',')]

        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Obtener información del producto
            cursor.execute("""
                SELECT codigo, descripcion, categoria, COALESCE(unidades_por_bulto, 1) as unidades_por_bulto
                FROM productos
                WHERE codigo = %s
            """, [codigo_producto])
            producto_info = cursor.fetchone()

            if not producto_info:
                cursor.close()
                raise HTTPException(status_code=404, detail="Producto no encontrado")

            unidades_por_bulto = float(producto_info[3]) if producto_info[3] else 1.0

            # Query base para ventas por hora
            query = """
                SELECT
                    EXTRACT(HOUR FROM v.fecha_venta)::integer as hora,
                    v.ubicacion_id,
                    COALESCE(u.nombre, v.ubicacion_id) as ubicacion_nombre,
                    SUM(v.cantidad_vendida) / %s as total_bultos,
                    SUM(v.cantidad_vendida) as total_unidades,
                    SUM(v.venta_total) as venta_total,
                    COUNT(*) as num_transacciones
                FROM ventas v
                LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id
                WHERE v.producto_id = %s
                    AND v.fecha_venta::date = %s
                    AND v.cantidad_vendida > 0
            """
            params = [unidades_por_bulto, codigo_producto, fecha]

            # Agregar filtro de ubicaciones si se especifica
            if ubicaciones_filtro:
                placeholders = ', '.join(['%s'] * len(ubicaciones_filtro))
                query += f" AND v.ubicacion_id IN ({placeholders})"
                params.extend(ubicaciones_filtro)

            query += """
                GROUP BY EXTRACT(HOUR FROM v.fecha_venta), v.ubicacion_id, u.nombre
                ORDER BY hora, v.ubicacion_id
            """

            cursor.execute(query, params)
            ventas_result = cursor.fetchall()
            cursor.close()

            # Organizar datos por hora y tienda
            ventas_por_hora = {}
            tiendas_set = set()

            for row in ventas_result:
                hora, ubicacion_id, ubicacion_nombre, bultos, unidades, venta, num_trans = row
                hora_int = int(hora) if hora is not None else 0
                hora_str = f"{hora_int:02d}:00"

                tiendas_set.add(ubicacion_id)

                if hora_str not in ventas_por_hora:
                    ventas_por_hora[hora_str] = {}

                ventas_por_hora[hora_str][ubicacion_id] = {
                    "tienda": ubicacion_nombre or ubicacion_id,
                    "bultos": float(bultos) if bultos else 0,
                    "unidades": float(unidades) if unidades else 0,
                    "venta_total": float(venta) if venta else 0,
                    "transacciones": int(num_trans) if num_trans else 0
                }

            # Crear lista ordenada por hora (6:00 AM a 22:00 PM típicamente)
            # Incluir todas las horas del día laborable aunque no haya ventas
            ventas_horarias = []
            for h in range(6, 23):  # 6 AM a 10 PM
                hora_str = f"{h:02d}:00"
                tiendas_data = ventas_por_hora.get(hora_str, {})

                # Solo agregar hora si tiene datos o está en el rango de operación
                ventas_horarias.append({
                    "hora": hora_str,
                    "hora_display": f"{h:02d}:00",
                    "tiendas": tiendas_data
                })

            # Calcular totales por tienda para el día
            totales_por_tienda = {}
            for hora_data in ventas_por_hora.values():
                for tienda_id, tienda_data in hora_data.items():
                    if tienda_id not in totales_por_tienda:
                        totales_por_tienda[tienda_id] = {
                            "tienda": tienda_data["tienda"],
                            "bultos": 0,
                            "unidades": 0,
                            "venta_total": 0,
                            "transacciones": 0
                        }
                    totales_por_tienda[tienda_id]["bultos"] += tienda_data["bultos"]
                    totales_por_tienda[tienda_id]["unidades"] += tienda_data["unidades"]
                    totales_por_tienda[tienda_id]["venta_total"] += tienda_data["venta_total"]
                    totales_por_tienda[tienda_id]["transacciones"] += tienda_data["transacciones"]

            return {
                "producto": {
                    "codigo": producto_info[0],
                    "descripcion": producto_info[1],
                    "categoria": producto_info[2]
                },
                "fecha": fecha,
                "tiendas_disponibles": sorted(list(tiendas_set)),
                "ventas_horarias": ventas_horarias,
                "totales_dia": totales_por_tienda
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo ventas horarias: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ventas/producto/{codigo_producto}/ultimos-20-dias", tags=["Ventas"])
async def get_ventas_ultimos_20_dias(
    codigo_producto: str,
    ubicacion_id: str
):
    """
    Obtiene el detalle de ventas diarias de un producto para los últimos 20 días.

    Retorna fecha, día de la semana y cantidad vendida para cada día.
    Usado para mostrar el detalle del cálculo del promedio de 20 días.

    Args:
        codigo_producto: Código del producto
        ubicacion_id: ID de la ubicación (tienda)

    Returns:
        ventas: Lista de ventas diarias con fecha, dia_semana y cantidad_vendida
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Obtener la fecha máxima disponible en ventas (excluyendo hoy que puede estar incompleto)
            cursor.execute("""
                SELECT MAX(fecha_venta::date)
                FROM ventas
                WHERE fecha_venta::date < CURRENT_DATE
            """)
            fecha_max_result = cursor.fetchone()
            fecha_max = fecha_max_result[0] if fecha_max_result else None

            if not fecha_max:
                cursor.close()
                return {"ventas": []}

            # Obtener ventas de los últimos 20 días
            # NOTA: Excluir 2025-12-06 para tienda_18 (PARAISO) por ser día de inauguración con ventas atípicas
            cursor.execute("""
                SELECT
                    fecha_venta::date as fecha,
                    TO_CHAR(fecha_venta::date, 'Dy') as dia_semana,
                    SUM(cantidad_vendida) as cantidad_vendida
                FROM ventas
                WHERE producto_id = %s
                    AND ubicacion_id = %s
                    AND fecha_venta::date > %s - INTERVAL '20 days'
                    AND fecha_venta::date <= %s
                    AND NOT (ubicacion_id = 'tienda_18' AND fecha_venta::date = '2025-12-06')
                GROUP BY fecha_venta::date
                ORDER BY fecha_venta::date ASC
            """, [codigo_producto, ubicacion_id, fecha_max, fecha_max])

            result = cursor.fetchall()
            cursor.close()

            # Mapear días de semana de inglés a español
            dias_map = {
                'Mon': 'Lunes', 'Tue': 'Martes', 'Wed': 'Miércoles',
                'Thu': 'Jueves', 'Fri': 'Viernes', 'Sat': 'Sábado', 'Sun': 'Domingo'
            }

            ventas = []
            for row in result:
                dia_en = row[1] if row[1] else ''
                dia_es = dias_map.get(dia_en, dia_en)
                ventas.append({
                    "fecha": str(row[0]) if row[0] else '',
                    "dia_semana": dia_es,
                    "cantidad_vendida": float(row[2]) if row[2] else 0
                })

            logger.info(f"✅ Obtenidos {len(ventas)} días de ventas para {codigo_producto} en {ubicacion_id}")

            return {"ventas": ventas}

    except Exception as e:
        logger.error(f"Error obteniendo ventas últimos 20 días: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo ventas: {str(e)}")


@app.get("/api/ventas/producto/{codigo_producto}/transacciones", tags=["Ventas"])
async def get_transacciones_producto(
    codigo_producto: str,
    ubicacion_id: str,
    fecha_inicio: str = None,
    fecha_fin: str = None,
    page: int = 1,
    page_size: int = 50
):
    """
    Obtiene las transacciones individuales (facturas) de un producto en una ubicación.

    PostgreSQL v2.0: Usa tabla 'ventas' con datos granulares por línea de factura.

    Args:
        codigo_producto: Código SKU del producto
        ubicacion_id: ID de la tienda (tienda_01, tienda_08, etc.)
        fecha_inicio: Fecha inicio (opcional, default: últimos 30 días)
        fecha_fin: Fecha fin (opcional, default: hoy)
        page: Número de página para paginación
        page_size: Tamaño de página (max 100)

    Returns:
        transacciones: Lista de transacciones con factura, fecha, cantidad, precio, total
        pagination: Metadata de paginación
        totales: Totales agregados (cantidad, venta, costo, utilidad)
    """
    try:
        # Validar page_size
        page_size = min(page_size, 100)
        offset = (page - 1) * page_size

        # Si no hay fechas, usar últimos 30 días
        if not fecha_fin:
            fecha_fin = datetime.now().strftime('%Y-%m-%d')
        if not fecha_inicio:
            fecha_inicio = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Query para contar total de registros
            count_query = """
                SELECT COUNT(*)
                FROM ventas
                WHERE producto_id = %s
                  AND ubicacion_id = %s
                  AND fecha_venta >= %s::timestamp
                  AND fecha_venta < (%s::date + interval '1 day')::timestamp
            """
            cursor.execute(count_query, [codigo_producto, ubicacion_id, fecha_inicio, fecha_fin])
            total_items = cursor.fetchone()[0]

            # Query para totales agregados
            totales_query = """
                SELECT
                    COALESCE(SUM(cantidad_vendida), 0) as total_cantidad,
                    COALESCE(SUM(venta_total), 0) as total_venta,
                    COALESCE(SUM(costo_total), 0) as total_costo,
                    COALESCE(SUM(utilidad_bruta), 0) as total_utilidad,
                    COUNT(DISTINCT SPLIT_PART(numero_factura, '_L', 1)) as total_facturas
                FROM ventas
                WHERE producto_id = %s
                  AND ubicacion_id = %s
                  AND fecha_venta >= %s::timestamp
                  AND fecha_venta < (%s::date + interval '1 day')::timestamp
            """
            cursor.execute(totales_query, [codigo_producto, ubicacion_id, fecha_inicio, fecha_fin])
            totales_row = cursor.fetchone()

            # Query principal con paginación
            query = """
                SELECT
                    numero_factura,
                    TO_CHAR(fecha_venta, 'YYYY-MM-DD HH24:MI') as fecha_venta,
                    almacen_nombre,
                    cantidad_vendida,
                    unidad_medida_venta,
                    precio_unitario,
                    costo_unitario,
                    venta_total,
                    costo_total,
                    utilidad_bruta,
                    margen_bruto_pct
                FROM ventas
                WHERE producto_id = %s
                  AND ubicacion_id = %s
                  AND fecha_venta >= %s::timestamp
                  AND fecha_venta < (%s::date + interval '1 day')::timestamp
                ORDER BY fecha_venta DESC
                LIMIT %s OFFSET %s
            """
            cursor.execute(query, [codigo_producto, ubicacion_id, fecha_inicio, fecha_fin, page_size, offset])
            result = cursor.fetchall()

            # Obtener información del producto desde tabla productos
            cursor.execute("""
                SELECT descripcion, categoria
                FROM productos
                WHERE codigo = %s
            """, [codigo_producto])
            producto_info = cursor.fetchone()
            cursor.close()

            descripcion_producto = producto_info[0] if producto_info else codigo_producto
            categoria_producto = producto_info[1] if producto_info else "Sin categoría"

            transacciones = []
            for row in result:
                # Extraer número de factura sin el sufijo _L{linea}
                factura_completa = row[0]
                factura_base = factura_completa.split('_L')[0] if '_L' in factura_completa else factura_completa

                transacciones.append({
                    "numero_factura": factura_base,
                    "numero_factura_linea": factura_completa,
                    "fecha_venta": row[1],
                    "almacen": row[2] or "N/A",
                    "cantidad": float(row[3]) if row[3] else 0,
                    "unidad_medida": row[4] or "UNIDAD",
                    "precio_unitario": float(row[5]) if row[5] else 0,
                    "costo_unitario": float(row[6]) if row[6] else 0,
                    "venta_total": float(row[7]) if row[7] else 0,
                    "costo_total": float(row[8]) if row[8] else 0,
                    "utilidad": float(row[9]) if row[9] else 0,
                    "margen_pct": float(row[10]) if row[10] else 0
                })

            total_pages = (total_items + page_size - 1) // page_size

            return {
                "transacciones": transacciones,
                "pagination": {
                    "total_items": total_items,
                    "total_pages": total_pages,
                    "current_page": page,
                    "page_size": page_size,
                    "has_next": page < total_pages,
                    "has_previous": page > 1
                },
                "totales": {
                    "total_cantidad": float(totales_row[0]) if totales_row[0] else 0,
                    "total_venta": float(totales_row[1]) if totales_row[1] else 0,
                    "total_costo": float(totales_row[2]) if totales_row[2] else 0,
                    "total_utilidad": float(totales_row[3]) if totales_row[3] else 0,
                    "total_facturas": totales_row[4] if totales_row[4] else 0
                },
                "filtros": {
                    "codigo_producto": codigo_producto,
                    "ubicacion_id": ubicacion_id,
                    "fecha_inicio": fecha_inicio,
                    "fecha_fin": fecha_fin
                },
                "producto": {
                    "codigo": codigo_producto,
                    "descripcion": descripcion_producto,
                    "categoria": categoria_producto
                }
            }

    except Exception as e:
        logger.error(f"Error obteniendo transacciones de producto: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo transacciones: {str(e)}")


# ========== ENDPOINTS PEDIDOS SUGERIDOS (LEGACY - Deshabilitado, usar router) ==========
# NOTE: Este endpoint usa tablas DuckDB (ventas_raw, inventario_raw) que ya no existen.
# El nuevo endpoint está en routers/pedidos_sugeridos.py y usa PostgreSQL.

# @app.post("/api/pedidos-sugeridos/calcular", response_model=List[ProductoPedidoSugerido], tags=["Pedidos Sugeridos"])
async def calcular_pedido_sugerido_legacy_disabled(request: CalcularPedidoRequest):
    """
    Calcula pedido sugerido basado en ventas, inventario y configuración.

    El cálculo considera:
    - Promedios de venta (8 semanas, 3 días, mismo día de semana)
    - Inventario actual en tienda y CEDI
    - Stock mínimo, máximo y punto de reorden
    - Pronóstico de ventas para los próximos días
    """
    try:
        with get_db_connection() as conn:
            # Obtener fecha actual (última fecha en ventas)
            fecha_actual = conn.execute("SELECT MAX(fecha) FROM ventas_raw").fetchone()[0]

            # Query principal para calcular pedido sugerido
            query = f"""
        WITH ventas_8sem AS (
            SELECT
                v.codigo_producto,
                COUNT(DISTINCT v.fecha) as dias_con_venta,
                SUM(CAST(v.cantidad_vendida AS DECIMAL)) as total_vendido_8sem,
                AVG(CAST(v.cantidad_vendida AS DECIMAL)) as prom_diario_8sem,
                AVG(CAST(v.cantidad_bultos AS DECIMAL)) as bultos_por_unidad
            FROM ventas_raw v
            WHERE v.ubicacion_id = '{request.tienda_destino}'
                AND v.fecha >= CAST(CAST('{fecha_actual}' AS DATE) - INTERVAL 56 DAY AS VARCHAR)
            GROUP BY v.codigo_producto
        ),
        ventas_3dias AS (
            SELECT
                v.codigo_producto,
                AVG(CAST(v.cantidad_vendida AS DECIMAL)) as prom_diario_3dias
            FROM ventas_raw v
            WHERE v.ubicacion_id = '{request.tienda_destino}'
                AND v.fecha >= CAST(CAST('{fecha_actual}' AS DATE) - INTERVAL 3 DAY AS VARCHAR)
            GROUP BY v.codigo_producto
        ),
        ventas_5dias AS (
            SELECT
                codigo_producto,
                AVG(total_dia) as prom_diario_5dias
            FROM (
                SELECT
                    v.codigo_producto,
                    v.fecha,
                    SUM(CAST(v.cantidad_vendida AS DECIMAL)) as total_dia
                FROM ventas_raw v
                WHERE v.ubicacion_id = '{request.tienda_destino}'
                    AND v.fecha >= CAST(CAST('{fecha_actual}' AS DATE) - INTERVAL 5 DAY AS VARCHAR)
                GROUP BY v.codigo_producto, v.fecha
            )
            GROUP BY codigo_producto
        ),
        ventas_20dias AS (
            SELECT
                codigo_producto,
                AVG(total_dia) as prom_diario_20dias
            FROM (
                SELECT
                    v.codigo_producto,
                    v.fecha,
                    SUM(CAST(v.cantidad_vendida AS DECIMAL)) as total_dia
                FROM ventas_raw v
                WHERE v.ubicacion_id = '{request.tienda_destino}'
                    AND v.fecha >= CAST(CAST('{fecha_actual}' AS DATE) - INTERVAL 20 DAY AS VARCHAR)
                GROUP BY v.codigo_producto, v.fecha
            )
            GROUP BY codigo_producto
        ),
        ventas_mismo_dia AS (
            SELECT
                codigo_producto,
                AVG(total_dia) as prom_mismo_dia
            FROM (
                SELECT
                    v.codigo_producto,
                    v.fecha,
                    SUM(CAST(v.cantidad_vendida AS DECIMAL)) as total_dia
                FROM ventas_raw v
                WHERE v.ubicacion_id = '{request.tienda_destino}'
                    AND v.fecha >= CAST(CAST('{fecha_actual}' AS DATE) - INTERVAL 56 DAY AS VARCHAR)
                    AND v.dia_semana = (SELECT dia_semana FROM ventas_raw WHERE fecha = '{fecha_actual}' LIMIT 1)
                GROUP BY v.codigo_producto, v.fecha
            )
            GROUP BY codigo_producto
        ),
        inv_tienda AS (
            SELECT
                i.codigo_producto,
                i.codigo_barras,
                i.descripcion_producto,
                i.categoria,
                i.subcategoria as grupo,
                '' as subgrupo,
                i.marca,
                i.presentacion,
                i.cantidad_bultos,
                -- Peso en gramos (peso_producto está en kg, multiplicar x1000)
                COALESCE(i.peso_producto * 1000, 1000.0) as peso_unidad,
                COALESCE(i.cantidad_actual, 0) as stock_tienda,
                COALESCE(i.cantidad_en_transito, 0) as stock_en_transito,
                COALESCE(i.stock_minimo, 10) as stock_minimo,
                COALESCE(i.stock_maximo, 100) as stock_maximo,
                COALESCE(i.punto_reorden, 30) as punto_reorden
            FROM inventario_raw i
            WHERE i.ubicacion_id = '{request.tienda_destino}'
        ),
        productos_cuadrante AS (
            SELECT DISTINCT
                codigo_producto,
                FIRST_VALUE(cuadrante_producto) OVER (PARTITION BY codigo_producto ORDER BY fecha DESC) as cuadrante_producto
            FROM ventas_raw
            WHERE ubicacion_id = '{request.tienda_destino}'
                AND cuadrante_producto IS NOT NULL
        ),
        inv_cedi AS (
            SELECT
                codigo_producto,
                SUM(CASE WHEN ubicacion_id = 'cedi_seco' THEN COALESCE(cantidad_actual, 0) ELSE 0 END) as stock_cedi_seco,
                SUM(CASE WHEN ubicacion_id = 'cedi_frio' THEN COALESCE(cantidad_actual, 0) ELSE 0 END) as stock_cedi_frio,
                SUM(CASE WHEN ubicacion_id = 'cedi_verde' THEN COALESCE(cantidad_actual, 0) ELSE 0 END) as stock_cedi_verde
            FROM inventario_raw
            WHERE tipo_ubicacion = 'cedi'
            GROUP BY codigo_producto
        )
        SELECT
            -- Producto
            it.codigo_producto,
            it.codigo_barras,
            it.descripcion_producto,
            it.categoria,
            it.grupo,
            it.subgrupo,
            it.marca,
            it.presentacion,
            it.cantidad_bultos,
            it.peso_unidad,
            pc.cuadrante_producto,

            -- Ventas
            COALESCE(v5.prom_diario_5dias, 0) as prom_ventas_5dias_unid,
            COALESCE(v20.prom_diario_20dias, 0) as prom_ventas_20dias_unid,
            COALESCE(vmd.prom_mismo_dia, 0) as prom_mismo_dia_unid,
            COALESCE(v8.prom_diario_8sem, 0) as prom_ventas_8sem_unid,
            COALESCE(v8.prom_diario_8sem / NULLIF(v8.bultos_por_unidad, 0), 0) as prom_ventas_8sem_bultos,
            COALESCE(v3.prom_diario_3dias, 0) as prom_ventas_3dias_unid,
            COALESCE(v3.prom_diario_3dias / NULLIF(v8.bultos_por_unidad, 0), 0) as prom_ventas_3dias_bultos,
            COALESCE(vmd.prom_mismo_dia / NULLIF(v8.bultos_por_unidad, 0), 0) as prom_mismo_dia_bultos,
            COALESCE(v8.prom_diario_8sem * {request.dias_cobertura}, 0) as pronostico_unid,
            COALESCE((v8.prom_diario_8sem * {request.dias_cobertura}) / NULLIF(v8.bultos_por_unidad, 0), 0) as pronostico_bultos,

            -- Inventario
            it.stock_tienda,
            it.stock_en_transito,
            (it.stock_tienda + it.stock_en_transito) as stock_total,
            (it.stock_tienda + it.stock_en_transito) / NULLIF(it.cantidad_bultos, 0) as stock_total_bultos,
            (it.stock_tienda + it.stock_en_transito) / NULLIF(v8.prom_diario_8sem, 0) as stock_dias_cobertura,
            COALESCE(ic.stock_cedi_seco, 0) as stock_cedi_seco,
            COALESCE(ic.stock_cedi_frio, 0) as stock_cedi_frio,
            COALESCE(ic.stock_cedi_verde, 0) as stock_cedi_verde,
            -- Stock del CEDI seleccionado
            CASE
                WHEN '{request.cedi_origen}' = 'cedi_seco' THEN COALESCE(ic.stock_cedi_seco, 0)
                WHEN '{request.cedi_origen}' = 'cedi_frio' THEN COALESCE(ic.stock_cedi_frio, 0)
                WHEN '{request.cedi_origen}' = 'cedi_verde' THEN COALESCE(ic.stock_cedi_verde, 0)
                ELSE 0
            END as stock_cedi_origen,

            -- Configuración
            it.stock_minimo,
            it.stock_maximo,
            it.punto_reorden,

            -- Cálculos
            v8.prom_diario_8sem,
            it.cantidad_bultos,
            (it.stock_tienda + it.stock_en_transito)

        FROM inv_tienda it
        LEFT JOIN ventas_8sem v8 ON it.codigo_producto = v8.codigo_producto
        LEFT JOIN ventas_3dias v3 ON it.codigo_producto = v3.codigo_producto
        LEFT JOIN ventas_5dias v5 ON it.codigo_producto = v5.codigo_producto
        LEFT JOIN ventas_20dias v20 ON it.codigo_producto = v20.codigo_producto
        LEFT JOIN ventas_mismo_dia vmd ON it.codigo_producto = vmd.codigo_producto
        LEFT JOIN inv_cedi ic ON it.codigo_producto = ic.codigo_producto
        LEFT JOIN productos_cuadrante pc ON it.codigo_producto = pc.codigo_producto
        ORDER BY COALESCE(v8.prom_diario_8sem, 0) DESC
            """

            result = conn.execute(query).fetchall()

            # Importar servicio de configuración
            from services.config_inventario_service import ConfigInventarioService

            productos = []
            for row in result:
                # Desempaquetar datos de los índices calculados (33-35 - ajustado por cuadrante y peso)
                codigo_producto = row[0]
                prom_diario = float(row[33]) if row[33] else 0
                cantidad_bultos = float(row[34]) if row[34] else 1
                stock_total = float(row[35]) if row[35] else 0
                pronostico_unid = float(row[19]) if row[19] else 0

                # ===== NUEVO: Clasificación ABC y configuración dinámica =====

                # 1. Calcular venta diaria en bultos
                venta_diaria_bultos = prom_diario / cantidad_bultos if cantidad_bultos > 0 else 0

                # 2. Clasificar producto en ABC usando umbrales desde BD
                clasificacion = ConfigInventarioService.clasificar_abc(venta_diaria_bultos, conn)

                # 3. Obtener configuración jerárquica (producto → tienda → global)
                config = ConfigInventarioService.obtener_config_producto(
                    codigo_producto=codigo_producto,
                    tienda_id=request.tienda_destino,
                    clasificacion_abc=clasificacion,
                    conn=conn
                )

                # 4. Calcular niveles de stock dinámicamente con multiplicadores
                stock_minimo = prom_diario * config['stock_min_mult']
                stock_seguridad = prom_diario * config['stock_seg_mult']
                stock_maximo = prom_diario * config['stock_max_mult']

                # Punto de reorden = stock_mínimo + (demanda durante lead time)
                lead_time_dias = config['lead_time_dias']
                punto_reorden = stock_minimo + (prom_diario * lead_time_dias)

                # ===== Lógica de pedido =====
                if stock_total < punto_reorden:
                    cantidad_sugerida = (stock_maximo - stock_total) + pronostico_unid
                    razon = "Stock bajo punto de reorden"
                elif stock_total < stock_minimo:
                    cantidad_sugerida = stock_maximo - stock_total
                    razon = "Stock bajo mínimo"
                elif stock_total < stock_seguridad:
                    cantidad_sugerida = stock_maximo - stock_total
                    razon = "Stock bajo seguridad"
                else:
                    cantidad_sugerida = 0
                    razon = "Stock suficiente"

                # Convertir a bultos
                cantidad_bultos_sugerida = cantidad_sugerida / cantidad_bultos if cantidad_bultos > 0 else 0
                cantidad_bultos_ajustada = int(cantidad_bultos_sugerida) + (1 if cantidad_bultos_sugerida % 1 >= 0.5 else 0)

                # Incluir todos los productos para permitir búsqueda y pedido manual
                productos.append(ProductoPedidoSugerido(
                    codigo_producto=row[0],
                    codigo_barras=row[1],
                    descripcion_producto=row[2],
                    categoria=row[3],
                    grupo=row[4],
                    subgrupo=row[5],
                    marca=row[6],
                    presentacion=row[7],
                    cantidad_bultos=float(row[8]) if row[8] else 1,
                    peso_unidad=float(row[9]) if row[9] else 1000.0,
                    cuadrante_producto=row[10],
                    # Ventas - actualizados índices (+2 por cuadrante y peso_unidad)
                    prom_ventas_5dias_unid=float(row[11]) if row[11] else 0,
                    prom_ventas_20dias_unid=float(row[12]) if row[12] else 0,
                    prom_mismo_dia_unid=float(row[13]) if row[13] else 0,
                    prom_ventas_8sem_unid=float(row[14]) if row[14] else 0,
                    prom_ventas_8sem_bultos=float(row[15]) if row[15] else 0,
                    prom_ventas_3dias_unid=float(row[16]) if row[16] else 0,
                    prom_ventas_3dias_bultos=float(row[17]) if row[17] else 0,
                    prom_mismo_dia_bultos=float(row[18]) if row[18] else 0,
                    pronostico_3dias_unid=float(row[19]) if row[19] else 0,
                    pronostico_3dias_bultos=float(row[20]) if row[20] else 0,
                    # Inventario
                    stock_tienda=float(row[21]) if row[21] else 0,
                    stock_en_transito=float(row[22]) if row[22] else 0,
                    stock_total=float(row[23]) if row[23] else 0,
                    stock_total_bultos=float(row[24]) if row[24] else 0,
                    stock_dias_cobertura=float(row[25]) if row[25] else 0,
                    stock_cedi_seco=float(row[26]) if row[26] else 0,
                    stock_cedi_frio=float(row[27]) if row[27] else 0,
                    stock_cedi_verde=float(row[28]) if row[28] else 0,
                    stock_cedi_origen=float(row[29]) if row[29] else 0,
                    clasificacion_abc=clasificacion,
                    stock_minimo=stock_minimo,
                    stock_maximo=stock_maximo,
                    stock_seguridad=stock_seguridad,
                    punto_reorden=punto_reorden,
                    cantidad_sugerida_unid=cantidad_sugerida,
                    cantidad_sugerida_bultos=cantidad_bultos_sugerida,
                    cantidad_ajustada_bultos=cantidad_bultos_ajustada,
                    razon_pedido=razon
                ))

            logger.info(f"✅ Calculados {len(productos)} productos para pedido sugerido")
            return productos

    except Exception as e:
        logger.error(f"Error calculando pedido sugerido: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculando pedido: {str(e)}")

# Modelo para guardar pedido
class ProductoGuardarPedido(BaseModel):
    codigo_producto: str
    descripcion_producto: str
    cantidad_bultos: float
    cantidad_pedida_bultos: float  # Cambiado de int a float para aceptar decimales
    cantidad_sugerida_bultos: float  # Cambiado de int a float para aceptar decimales
    clasificacion_abc: Optional[str]
    razon_pedido: str
    incluido: bool
    # Datos adicionales para detalle
    prom_ventas_8sem_unid: float
    prom_ventas_8sem_bultos: float
    stock_tienda: float
    stock_total: float

class GuardarPedidoRequest(BaseModel):
    cedi_origen: str
    cedi_origen_nombre: str
    tienda_destino: str
    tienda_destino_nombre: str
    dias_cobertura: int
    productos: List[ProductoGuardarPedido]
    observaciones: Optional[str] = ""
    enviar_aprobacion: bool = False  # True = Pendiente Aprobación, False = Borrador

class PedidoGuardadoResponse(BaseModel):
    id: str
    numero_pedido: str
    estado: str
    total_productos: int
    total_bultos: float
    fecha_creacion: str

# LEGACY ENDPOINT DISABLED - Use router in routers/pedidos_sugeridos.py instead
# @app.post("/api/pedidos-sugeridos", response_model=PedidoGuardadoResponse, tags=["Pedidos Sugeridos"])
async def guardar_pedido_sugerido_legacy_disabled(request: GuardarPedidoRequest):
    """
    DISABLED: Guarda un pedido sugerido en la base de datos.
    Use POST /api/pedidos-sugeridos/ (con trailing slash) del router en su lugar.
    """
    try:
        logger.info(f"💾 [LEGACY DISABLED] Guardando pedido: CEDI {request.cedi_origen} → Tienda {request.tienda_destino}")

        # Generar IDs únicos
        import uuid
        from datetime import datetime

        pedido_id = str(uuid.uuid4())
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        # Usar context manager con conexión de escritura
        with get_db_connection_write() as conn:
            # Obtener último número de pedido para generar secuencia
            result = conn.execute("SELECT MAX(numero_pedido) as ultimo FROM pedidos_sugeridos").fetchone()
            ultimo_numero = result[0] if result[0] else "PED-0000"
            siguiente_numero = int(ultimo_numero.split('-')[1]) + 1
            numero_pedido = f"PED-{siguiente_numero:04d}"

            # Filtrar solo productos incluidos
            productos_incluidos = [p for p in request.productos if p.incluido]

            # Calcular totales
            total_productos = len(productos_incluidos)
            total_bultos = sum(p.cantidad_pedida_bultos for p in productos_incluidos)
            total_unidades = sum(p.cantidad_pedida_bultos * p.cantidad_bultos for p in productos_incluidos)

            # Determinar estado según si se envía para aprobación
            estado = 'pendiente_aprobacion_gerente' if request.enviar_aprobacion else 'borrador'

            # Insertar pedido principal
            conn.execute("""
                INSERT INTO pedidos_sugeridos (
                    id, numero_pedido, cedi_origen_id, cedi_origen_nombre,
                    tienda_destino_id, tienda_destino_nombre, estado,
                    total_productos, total_bultos, total_unidades,
                    dias_cobertura, observaciones, fecha_creacion,
                    usuario_creador, fecha_modificacion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
            """, [
                pedido_id, numero_pedido, request.cedi_origen, request.cedi_origen_nombre,
                request.tienda_destino, request.tienda_destino_nombre, estado,
                total_productos, float(total_bultos), float(total_unidades),
                request.dias_cobertura, request.observaciones,
                'sistema'  # TODO: Obtener usuario real
            ])

            # Insertar detalle de productos
            for idx, producto in enumerate(productos_incluidos):
                detalle_id = str(uuid.uuid4())
                conn.execute("""
                    INSERT INTO pedidos_sugeridos_detalle (
                        id, pedido_id, linea_numero, codigo_producto, descripcion_producto,
                        cantidad_bultos, cantidad_pedida_bultos, cantidad_pedida_unidades,
                        cantidad_sugerida_bultos, cantidad_sugerida_unidades,
                        total_unidades,
                        clasificacion_abc, razon_pedido, incluido,
                        prom_ventas_8sem_unid, prom_ventas_8sem_bultos,
                        stock_tienda, stock_total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    detalle_id, pedido_id, idx + 1,
                    producto.codigo_producto, producto.descripcion_producto,
                    float(producto.cantidad_bultos),
                    int(producto.cantidad_pedida_bultos),
                    float(producto.cantidad_pedida_bultos * producto.cantidad_bultos),
                    int(producto.cantidad_sugerida_bultos),
                    float(producto.cantidad_sugerida_bultos * producto.cantidad_bultos),
                    float(producto.cantidad_pedida_bultos * producto.cantidad_bultos),  # total_unidades
                    producto.clasificacion_abc, producto.razon_pedido, producto.incluido,
                    float(producto.prom_ventas_8sem_unid), float(producto.prom_ventas_8sem_bultos),
                    float(producto.stock_tienda), float(producto.stock_total)
                ])

            logger.info(f"✅ Pedido guardado: {numero_pedido} con {total_productos} productos, {total_bultos} bultos - Estado: {estado}")

            return PedidoGuardadoResponse(
                id=pedido_id,
                numero_pedido=numero_pedido,
                estado=estado,
                total_productos=total_productos,
                total_bultos=float(total_bultos),
                fecha_creacion=timestamp
            )

    except Exception as e:
        logger.error(f"Error guardando pedido sugerido: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error guardando pedido: {str(e)}")

# ==================================================
# FORECAST - Predicción de Ventas
# ==================================================

@app.get("/api/forecast/productos", tags=["Forecast"])
def get_forecast_productos(
    ubicacion_id: str,
    productos: Optional[str] = None,
    dias_adelante: int = 7,
    limit: int = 20
):
    """
    Calcula forecast para productos de una ubicación

    Args:
        ubicacion_id: ID de la ubicación (e.g., 'tienda_01')
        productos: Códigos de productos separados por coma (opcional, default: top N)
        dias_adelante: Días hacia el futuro para predecir (default: 7)
        limit: Número máximo de productos (default: 20)

    Returns:
        Lista de forecasts por producto
    """
    try:
        logger.info(f"🔮 Iniciando forecast para {ubicacion_id}, dias={dias_adelante}, limit={limit}")
        from forecast_pmp import ForecastPMP

        productos_list = productos.split(",") if productos else None

        with ForecastPMP() as forecaster:
            logger.info(f"📊 ForecastPMP inicializado, calculando...")
            forecasts = forecaster.calcular_forecast_tienda(
                ubicacion_id=ubicacion_id,
                productos=productos_list,
                dias_adelante=dias_adelante,
                limit=limit
            )

        logger.info(f"✅ Forecast completado: {len(forecasts)} productos")
        return {
            "success": True,
            "ubicacion_id": ubicacion_id,
            "dias_adelante": dias_adelante,
            "total_productos": len(forecasts),
            "forecasts": forecasts
        }

    except Exception as e:
        logger.error(f"❌ Error calculando forecast: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error en forecast: {str(e)}")


@app.get("/api/forecast/producto/{codigo_producto}", tags=["Forecast"])
def get_forecast_producto(
    codigo_producto: str,
    ubicacion_id: str,
    dias_adelante: int = 7
):
    """
    Calcula forecast para un producto específico

    Args:
        codigo_producto: Código del producto
        ubicacion_id: ID de la ubicación
        dias_adelante: Días hacia el futuro

    Returns:
        Forecast para el producto
    """
    try:
        from forecast_pmp import ForecastPMP

        with ForecastPMP() as forecaster:
            forecast = forecaster.calcular_forecast_producto(
                ubicacion_id=ubicacion_id,
                codigo_producto=codigo_producto,
                dias_adelante=dias_adelante
            )

        return {
            "success": True,
            "forecast": forecast
        }

    except Exception as e:
        logger.error(f"Error calculando forecast: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error en forecast: {str(e)}")


@app.get("/api/forecast/producto/{codigo_producto}/diario", tags=["Forecast"])
def get_forecast_producto_diario(
    codigo_producto: str,
    ubicacion_id: str,
    dias_adelante: int = 7
):
    """
    Calcula forecast día por día para un producto específico

    Args:
        codigo_producto: Código del producto
        ubicacion_id: ID de la ubicación
        dias_adelante: Días hacia el futuro (default: 7)

    Returns:
        Lista de forecasts diarios
    """
    try:
        from forecast_pmp import ForecastPMP

        with ForecastPMP() as forecaster:
            forecasts = forecaster.calcular_forecast_diario(
                ubicacion_id=ubicacion_id,
                codigo_producto=codigo_producto,
                dias_adelante=dias_adelante
            )

        return {
            "success": True,
            "ubicacion_id": ubicacion_id,
            "codigo_producto": codigo_producto,
            "dias_adelante": dias_adelante,
            "forecasts": forecasts
        }

    except Exception as e:
        logger.error(f"Error calculando forecast diario: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error en forecast diario: {str(e)}")


# ======================================================================================
# ENDPOINTS ADMIN - CÁLCULOS ABC-XYZ
# ======================================================================================

@app.post("/api/admin/calcular-abc-xyz", tags=["Admin"])
async def calcular_abc_xyz(
    background_tasks: BackgroundTasks,
    current_user: Usuario = Depends(verify_token)
):
    """
    Ejecuta el cálculo de ABC v2 y XYZ para todas las tiendas.
    Esto puede tardar varios minutos. Se ejecuta en background.

    Requiere autenticación.
    """
    def run_calculations():
        """Ejecuta los scripts de cálculo en background"""
        import time
        logger.info("🔄 Iniciando cálculo ABC v2 por tienda...")

        try:
            # Ejecutar cálculo ABC v2
            result_abc = subprocess.run(
                ["python3", "/app/database/calcular_abc_v2_por_tienda.py", "--verbose"],
                capture_output=True,
                text=True,
                timeout=600  # 10 minutos máximo
            )

            if result_abc.returncode == 0:
                logger.info(f"✅ ABC v2 completado:\n{result_abc.stdout}")
            else:
                logger.error(f"❌ Error en ABC v2:\n{result_abc.stderr}")
                return

            logger.info("🔄 Iniciando cálculo XYZ por tienda...")

            # Ejecutar cálculo XYZ
            result_xyz = subprocess.run(
                ["python3", "/app/database/calcular_xyz_por_tienda.py", "--verbose"],
                capture_output=True,
                text=True,
                timeout=600  # 10 minutos máximo
            )

            if result_xyz.returncode == 0:
                logger.info(f"✅ XYZ completado:\n{result_xyz.stdout}")
            else:
                logger.error(f"❌ Error en XYZ:\n{result_xyz.stderr}")

        except subprocess.TimeoutExpired:
            logger.error("❌ Timeout ejecutando cálculos ABC-XYZ")
        except Exception as e:
            logger.error(f"❌ Error ejecutando cálculos: {e}")

    # Añadir tarea en background
    background_tasks.add_task(run_calculations)

    return {
        "success": True,
        "message": "Cálculo ABC-XYZ iniciado en background. Revisa los logs del servidor para ver el progreso.",
        "usuario": current_user.email
    }


@app.post("/api/admin/refresh-analisis-cache", tags=["Admin"])
async def refresh_analisis_cache(
    background_tasks: BackgroundTasks
):
    """
    Refresca la tabla cache productos_analisis_cache.
    Ejecuta la función SQL refresh_productos_analisis_cache() que recalcula
    todos los estados y métricas de productos.

    No requiere autenticación para permitir llamadas desde cron/scheduler.
    Tiempo estimado: 20-40 segundos.
    """
    def run_refresh():
        try:
            logger.info("🔄 Iniciando refresh de productos_analisis_cache...")
            start_time = time.time()

            with get_db_connection_write() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT refresh_productos_analisis_cache()")
                conn.commit()
                cursor.close()

            elapsed = time.time() - start_time
            logger.info(f"✅ Cache refrescada exitosamente en {elapsed:.2f}s")

        except Exception as e:
            logger.error(f"❌ Error refrescando cache: {e}")

    background_tasks.add_task(run_refresh)

    return {
        "success": True,
        "message": "Refresh de cache iniciado en background. La cache estará actualizada en ~30 segundos."
    }


@app.get("/api/admin/analisis-cache-status", tags=["Admin"])
async def get_analisis_cache_status():
    """
    Obtiene el estado actual de la tabla cache productos_analisis_cache.
    Incluye: total de registros, última actualización, y conteos por estado.
    """
    try:
        query = """
        SELECT
            COUNT(*) as total_productos,
            MAX(updated_at) as ultima_actualizacion,
            COUNT(CASE WHEN estado = 'FANTASMA' THEN 1 END) as fantasma,
            COUNT(CASE WHEN estado = 'CRITICO' THEN 1 END) as critico,
            COUNT(CASE WHEN estado = 'ANOMALIA' THEN 1 END) as anomalia,
            COUNT(CASE WHEN estado = 'DORMIDO' THEN 1 END) as dormido,
            COUNT(CASE WHEN estado = 'AGOTANDOSE' THEN 1 END) as agotandose,
            COUNT(CASE WHEN estado = 'ACTIVO' THEN 1 END) as activo
        FROM productos_analisis_cache
        """
        result = execute_query_dict(query)

        if result and len(result) > 0:
            data = result[0]
            return {
                "cache_exists": True,
                "total_productos": data['total_productos'],
                "ultima_actualizacion": str(data['ultima_actualizacion']) if data['ultima_actualizacion'] else None,
                "por_estado": {
                    "FANTASMA": data['fantasma'],
                    "CRITICO": data['critico'],
                    "ANOMALIA": data['anomalia'],
                    "DORMIDO": data['dormido'],
                    "AGOTANDOSE": data['agotandose'],
                    "ACTIVO": data['activo']
                }
            }
        else:
            return {"cache_exists": False, "message": "Cache vacía o no existe"}

    except Exception as e:
        error_msg = str(e)
        if "does not exist" in error_msg or "no existe" in error_msg:
            return {
                "cache_exists": False,
                "message": "La tabla productos_analisis_cache no existe. Ejecute la migración 001_performance_optimization.sql"
            }
        raise HTTPException(status_code=500, detail=f"Error: {error_msg}")


# ======================================================================================
# ENDPOINTS - ALERTAS Y CAMBIOS DE CLASIFICACIÓN
# ======================================================================================

@app.get("/api/alertas/cambios-clasificacion", tags=["Alertas"], deprecated=True)
async def get_alertas_cambios(
    ubicacion_id: Optional[str] = None,
    solo_pendientes: bool = True,
    solo_criticas: bool = False,
    dias: int = 30,
    limit: int = 100
):
    """[DEPRECADO] Este endpoint usaba DuckDB y ha sido deprecado."""
    raise HTTPException(
        status_code=501,
        detail="Endpoint deprecado. Usaba tablas DuckDB que ya no existen."
    )


@app.get("/api/alertas/resumen-tiendas", tags=["Alertas"], deprecated=True)
async def get_resumen_alertas_tiendas(dias: int = 30):
    """[DEPRECADO] Este endpoint usaba DuckDB y ha sido deprecado."""
    raise HTTPException(
        status_code=501,
        detail="Endpoint deprecado. Usaba tablas DuckDB que ya no existen."
    )


@app.post("/api/alertas/{alerta_id}/revisar", tags=["Alertas"], deprecated=True)
async def marcar_alerta_revisada(
    alerta_id: str,
    notas: Optional[str] = None,
    current_user: Usuario = Depends(verify_token)
):
    """[DEPRECADO] Este endpoint usaba DuckDB y ha sido deprecado."""
    raise HTTPException(
        status_code=501,
        detail="Endpoint deprecado. Usaba tablas DuckDB que ya no existen."
    )


@app.get("/api/productos/{codigo}/historico-abc-xyz", tags=["Productos"], deprecated=True)
async def get_historico_abc_xyz_completo(
    codigo: str,
    ubicacion_id: Optional[str] = None,
    limit: int = 50
):
    """[DEPRECADO] Este endpoint usaba DuckDB y ha sido deprecado."""
    raise HTTPException(
        status_code=501,
        detail="Endpoint deprecado. Usaba tablas DuckDB que ya no existen."
    )


# ============================================================================
# ENDPOINTS: NIVEL OBJETIVO
# ============================================================================

# from services.nivel_objetivo_service import NivelObjetivoService  # COMENTADO: Router ya maneja esto

class CalcularNivelObjetivoRequest(BaseModel):
    producto_id: str
    tienda_id: str

class CalcularNivelObjetivoResponse(BaseModel):
    success: bool
    producto_id: str
    tienda_id: str
    nivel_objetivo: int
    stock_seguridad: int
    demanda_ciclo: float
    matriz_abc_xyz: str
    parametros_usados: Dict[str, Any]
    metricas_base: Dict[str, Any]
    calculos_intermedios: Dict[str, Any]
    alertas: List[str]
    fecha_calculo: str

class CalcularCantidadSugeridaRequest(BaseModel):
    producto_id: str
    tienda_id: str
    stock_actual: Optional[float] = None

class CalcularCantidadSugeridaResponse(BaseModel):
    success: bool
    producto_id: str
    tienda_id: str
    cantidad_sugerida: int
    nivel_objetivo: int
    stock_actual: float
    inventario_en_transito: float
    disponible_total: float
    deficit: float
    requiere_reposicion: bool
    matriz_abc_xyz: str


# @app.post("/api/niveles-inventario/calcular", response_model=CalcularNivelObjetivoResponse)  # DESHABILITADO: Usar router
async def calcular_nivel_objetivo_endpoint_DISABLED(request: CalcularNivelObjetivoRequest):
    """
    Calcula el nivel objetivo de inventario para un producto en una tienda.

    Este endpoint calcula:
    - Nivel objetivo basado en demanda y variabilidad
    - Stock de seguridad según matriz ABC-XYZ
    - Demanda esperada durante ciclo de reposición

    Returns:
        CalcularNivelObjetivoResponse con todos los detalles del cálculo
    """
    try:
        db_path = Path(__file__).parent.parent / "data" / "fluxion_production.db"

        with NivelObjetivoService(str(db_path)) as service:
            resultado = service.calcular_nivel_objetivo(
                request.producto_id,
                request.tienda_id
            )

        return CalcularNivelObjetivoResponse(
            success=True,
            producto_id=request.producto_id,
            tienda_id=request.tienda_id,
            **resultado
        )

    except ValueError as e:
        logger.error(f"Error de validación al calcular nivel objetivo: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error al calcular nivel objetivo: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# @app.post("/api/niveles-inventario/cantidad-sugerida", response_model=CalcularCantidadSugeridaResponse)  # DESHABILITADO: Usar router
async def calcular_cantidad_sugerida_endpoint_DISABLED(request: CalcularCantidadSugeridaRequest):
    """
    Calcula la cantidad sugerida a pedir para un producto.

    Considera:
    - Nivel objetivo calculado
    - Stock actual en tienda
    - Inventario en tránsito (pedidos aprobados no recibidos)

    Returns:
        CalcularCantidadSugeridaResponse con cantidad sugerida y detalles
    """
    try:
        db_path = Path(__file__).parent.parent / "data" / "fluxion_production.db"

        with NivelObjetivoService(str(db_path)) as service:
            resultado = service.calcular_cantidad_sugerida(
                request.producto_id,
                request.tienda_id,
                request.stock_actual
            )

        return CalcularCantidadSugeridaResponse(
            success=True,
            producto_id=request.producto_id,
            tienda_id=request.tienda_id,
            cantidad_sugerida=resultado['cantidad_sugerida'],
            nivel_objetivo=resultado['nivel_objetivo'],
            stock_actual=resultado['stock_actual'],
            inventario_en_transito=resultado['inventario_en_transito'],
            disponible_total=resultado['disponible_total'],
            deficit=resultado['deficit'],
            requiere_reposicion=resultado['requiere_reposicion'],
            matriz_abc_xyz=resultado['matriz_abc_xyz']
        )

    except ValueError as e:
        logger.error(f"Error de validación al calcular cantidad sugerida: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error al calcular cantidad sugerida: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# @app.get("/api/niveles-inventario/tienda/{tienda_id}")  # DESHABILITADO: Usar router
async def calcular_niveles_tienda_DISABLED(
    tienda_id: str,
    limite: Optional[int] = 100,
    solo_con_deficit: bool = False
):
    """
    Calcula niveles objetivo para múltiples productos de una tienda.

    Args:
        tienda_id: ID de la tienda
        limite: Máximo de productos a calcular (default: 100)
        solo_con_deficit: Si true, solo muestra productos con deficit > 0

    Returns:
        Lista de productos con sus niveles objetivo y cantidades sugeridas
    """
    try:
        db_path = Path(__file__).parent.parent / "data" / "fluxion_production.db"

        with NivelObjetivoService(str(db_path)) as service:
            # Obtener productos activos con clasificación ABC-XYZ en esta tienda
            conn = service.conn
            query = """
            SELECT DISTINCT
                abc.codigo_producto,
                p.descripcion as nombre_producto,
                abc.matriz_abc_xyz,
                abc.clasificacion_abc_valor,
                s.cantidad as stock_actual
            FROM productos_abc_v2 abc
            JOIN productos p ON abc.codigo_producto = p.codigo
            LEFT JOIN stock_actual s ON abc.codigo_producto = s.producto_id
                                     AND abc.ubicacion_id = s.ubicacion_id
            WHERE abc.ubicacion_id = ?
              AND abc.matriz_abc_xyz IS NOT NULL
            ORDER BY abc.clasificacion_abc_valor, abc.matriz_abc_xyz
            LIMIT ?
            """

            productos = conn.execute(query, [tienda_id, limite]).fetchall()

            resultados = []
            for producto_id, nombre, matriz, clase_abc, stock_actual in productos:
                try:
                    resultado = service.calcular_cantidad_sugerida(
                        producto_id,
                        tienda_id,
                        float(stock_actual) if stock_actual else None
                    )

                    # Filtrar si solo_con_deficit
                    if solo_con_deficit and resultado['cantidad_sugerida'] <= 0:
                        continue

                    resultados.append({
                        'producto_id': producto_id,
                        'nombre_producto': nombre,
                        'matriz_abc_xyz': matriz,
                        'clasificacion_abc': clase_abc,
                        **resultado
                    })

                except Exception as e:
                    logger.warning(f"Error al calcular producto {producto_id}: {str(e)}")
                    continue

        return {
            'success': True,
            'tienda_id': tienda_id,
            'total_productos': len(resultados),
            'productos': resultados
        }

    except Exception as e:
        logger.error(f"Error al calcular niveles para tienda: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINT: HISTORIAL VENTAS + INVENTARIO POR PRODUCTO
# Para modal de detalle de producto en Ventas Perdidas
# ============================================================================

@app.get("/api/productos/{codigo_producto}/historial-ventas-inventario",
         response_model=HistorialProductoResponse,
         tags=["Centro Comando Ventas"])
async def get_historial_ventas_inventario(
    codigo_producto: str,
    ubicacion_id: str,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    granularidad: str = "diario",  # "diario" o "horario"
    incluir_diagnostico: bool = True
):
    """
    Obtiene historial combinado de ventas e inventario para un producto.

    Diseñado para el modal de detalle de producto en Ventas Perdidas,
    permite visualizar correlación entre stock y ventas para diagnosticar
    causas de ventas perdidas.

    Args:
        codigo_producto: Código SKU del producto
        ubicacion_id: ID de la tienda
        fecha_inicio: Fecha inicio (default: 30 días atrás)
        fecha_fin: Fecha fin (default: hoy)
        granularidad: "diario" para vista general, "horario" para zoom detallado
        incluir_diagnostico: Si calcular diagnóstico automático de causa

    Returns:
        Serie temporal combinada con ventas e inventario para gráficos dual Y-axis
    """
    try:
        # Calcular fechas por defecto
        tz_vzla = ZoneInfo("America/Caracas")
        ahora = datetime.now(tz_vzla)

        if not fecha_fin:
            fecha_fin = ahora.strftime('%Y-%m-%d')
        if not fecha_inicio:
            # Default: 30 días para diario, 7 días para horario
            dias_atras = 7 if granularidad == "horario" else 30
            fecha_inicio = (ahora - timedelta(days=dias_atras)).strftime('%Y-%m-%d')

        with get_postgres_connection() as conn:
            cursor = conn.cursor()

            # 1. Obtener información del producto (incluyendo unidades_por_bulto)
            cursor.execute("""
                SELECT id, codigo, nombre, categoria, COALESCE(unidades_por_bulto, 1) as unidades_por_bulto
                FROM productos
                WHERE codigo = %s
            """, [codigo_producto])
            prod_row = cursor.fetchone()

            if not prod_row:
                raise HTTPException(status_code=404, detail=f"Producto {codigo_producto} no encontrado")

            producto_id, codigo, nombre_producto, categoria, unidades_por_bulto = prod_row
            unidades_por_bulto = float(unidades_por_bulto) if unidades_por_bulto else 1.0

            # 2. Obtener nombre de ubicación
            cursor.execute("SELECT nombre FROM ubicaciones WHERE id = %s", [ubicacion_id])
            ubic_row = cursor.fetchone()
            if not ubic_row:
                raise HTTPException(status_code=404, detail=f"Ubicación {ubicacion_id} no encontrada")
            ubicacion_nombre = ubic_row[0]

            # 3. Obtener ventas según granularidad
            if granularidad == "horario":
                # Ventas por hora
                ventas_query = """
                    SELECT
                        DATE_TRUNC('hour', fecha_venta) as periodo,
                        SUM(cantidad_vendida) as total_vendido
                    FROM ventas
                    WHERE producto_id = %s
                      AND ubicacion_id = %s
                      AND fecha_venta::date BETWEEN %s AND %s
                    GROUP BY DATE_TRUNC('hour', fecha_venta)
                    ORDER BY periodo
                """
            else:
                # Ventas por día
                ventas_query = """
                    SELECT
                        fecha_venta::date as periodo,
                        SUM(cantidad_vendida) as total_vendido
                    FROM ventas
                    WHERE producto_id = %s
                      AND ubicacion_id = %s
                      AND fecha_venta::date BETWEEN %s AND %s
                    GROUP BY fecha_venta::date
                    ORDER BY periodo
                """

            cursor.execute(ventas_query, [codigo_producto, ubicacion_id, fecha_inicio, fecha_fin])
            ventas_rows = cursor.fetchall()

            # Crear diccionario de ventas por período
            ventas_dict = {}
            for row in ventas_rows:
                periodo = row[0]
                if granularidad == "horario":
                    key = periodo.strftime('%Y-%m-%dT%H:00:00') if periodo else None
                else:
                    key = periodo.strftime('%Y-%m-%d') if periodo else None
                if key:
                    ventas_dict[key] = float(row[1]) if row[1] else 0.0

            # 4. Obtener snapshots de inventario
            if granularidad == "horario":
                # Inventario por hora (agrupado por hora)
                inv_query = """
                    SELECT
                        DATE_TRUNC('hour', fecha_snapshot) as periodo,
                        AVG(cantidad) as stock_promedio
                    FROM inventario_historico
                    WHERE producto_id = %s
                      AND ubicacion_id = %s
                      AND fecha_snapshot::date BETWEEN %s AND %s
                    GROUP BY DATE_TRUNC('hour', fecha_snapshot)
                    ORDER BY periodo
                """
            else:
                # Inventario por día (último snapshot del día)
                inv_query = """
                    SELECT DISTINCT ON (fecha_snapshot::date)
                        fecha_snapshot::date as periodo,
                        cantidad as stock
                    FROM inventario_historico
                    WHERE producto_id = %s
                      AND ubicacion_id = %s
                      AND fecha_snapshot::date BETWEEN %s AND %s
                    ORDER BY fecha_snapshot::date, fecha_snapshot DESC
                """

            cursor.execute(inv_query, [producto_id, ubicacion_id, fecha_inicio, fecha_fin])
            inv_rows = cursor.fetchall()

            # Crear diccionario de inventario por período
            inventario_dict = {}
            for row in inv_rows:
                periodo = row[0]
                if granularidad == "horario":
                    key = periodo.strftime('%Y-%m-%dT%H:00:00') if periodo else None
                else:
                    key = periodo.strftime('%Y-%m-%d') if periodo else None
                if key:
                    inventario_dict[key] = float(row[1]) if row[1] else 0.0

            # 5. Obtener stock actual
            cursor.execute("""
                SELECT COALESCE(SUM(cantidad), 0)
                FROM inventario_actual
                WHERE producto_id = %s AND ubicacion_id = %s
            """, [producto_id, ubicacion_id])
            stock_actual_row = cursor.fetchone()
            stock_actual = float(stock_actual_row[0]) if stock_actual_row and stock_actual_row[0] else 0.0

            cursor.close()

            # 6. Generar serie temporal completa
            datos = []
            fecha_inicio_dt = datetime.strptime(fecha_inicio, '%Y-%m-%d')
            fecha_fin_dt = datetime.strptime(fecha_fin, '%Y-%m-%d')

            if granularidad == "horario":
                # Generar puntos por hora (6am a 10pm)
                current = fecha_inicio_dt.replace(hour=6, minute=0, second=0)
                end = fecha_fin_dt.replace(hour=22, minute=0, second=0)
                delta = timedelta(hours=1)

                while current <= end:
                    # Solo horas de operación (6am-10pm)
                    if 6 <= current.hour <= 22:
                        key = current.strftime('%Y-%m-%dT%H:00:00')
                        ventas = ventas_dict.get(key, 0.0)
                        inventario = inventario_dict.get(key)
                        # Calcular inventario en bultos
                        inventario_bultos = inventario / unidades_por_bulto if inventario is not None else None

                        datos.append(HistorialDataPoint(
                            fecha=key,
                            timestamp=int(current.timestamp()),
                            ventas=ventas,
                            inventario=inventario,
                            inventario_bultos=inventario_bultos,
                            es_estimado=False
                        ))
                    current += delta
            else:
                # Generar puntos por día
                current = fecha_inicio_dt
                delta = timedelta(days=1)

                while current <= fecha_fin_dt:
                    key = current.strftime('%Y-%m-%d')
                    ventas = ventas_dict.get(key, 0.0)
                    inventario = inventario_dict.get(key)
                    # Calcular inventario en bultos
                    inventario_bultos = inventario / unidades_por_bulto if inventario is not None else None

                    datos.append(HistorialDataPoint(
                        fecha=key,
                        timestamp=int(current.timestamp()),
                        ventas=ventas,
                        inventario=inventario,
                        inventario_bultos=inventario_bultos,
                        es_estimado=False
                    ))
                    current += delta

            # 7. Calcular estadísticas
            total_ventas = sum(d.ventas for d in datos)
            dias_totales = max(1, (fecha_fin_dt - fecha_inicio_dt).days + 1)
            promedio_diario = total_ventas / dias_totales

            inventarios_validos = [d.inventario for d in datos if d.inventario is not None]
            stock_promedio = sum(inventarios_validos) / len(inventarios_validos) if inventarios_validos else 0.0

            # Contar días con stock cero
            dias_stock_cero = sum(1 for d in datos if d.inventario is not None and d.inventario == 0)

            # 8. Calcular diagnóstico si se solicita
            diagnostico = None
            if incluir_diagnostico and dias_stock_cero > 0:
                # Analizar correlación entre stock cero y ventas bajas
                periodos_sin_stock = [d for d in datos if d.inventario is not None and d.inventario == 0]
                periodos_con_stock = [d for d in datos if d.inventario is not None and d.inventario > 0]

                ventas_sin_stock = sum(d.ventas for d in periodos_sin_stock) / max(1, len(periodos_sin_stock))
                ventas_con_stock = sum(d.ventas for d in periodos_con_stock) / max(1, len(periodos_con_stock))

                evidencias = []

                if ventas_sin_stock < ventas_con_stock * 0.3:
                    # Ventas cayeron más del 70% cuando no hay stock
                    tipo = "ruptura_stock"
                    confianza = min(95, 70 + (dias_stock_cero / dias_totales) * 25)
                    descripcion = f"Ruptura de stock: Las ventas cayeron {((1 - ventas_sin_stock/max(0.01, ventas_con_stock)) * 100):.0f}% cuando el inventario llegó a cero"
                    evidencias.append(f"{dias_stock_cero} días con stock en cero")
                    evidencias.append(f"Promedio ventas con stock: {ventas_con_stock:.1f} unidades")
                    evidencias.append(f"Promedio ventas sin stock: {ventas_sin_stock:.1f} unidades")
                elif stock_actual > promedio_diario * 3 and promedio_diario < 1:
                    # Hay stock pero no se vende
                    tipo = "falta_exhibicion"
                    confianza = 60
                    descripcion = "Posible falta de exhibición: Hay stock disponible pero las ventas son muy bajas"
                    evidencias.append(f"Stock actual: {stock_actual:.0f} unidades")
                    evidencias.append(f"Ventas promedio diarias: {promedio_diario:.1f} unidades")
                    evidencias.append("El producto podría no estar visible en tienda")
                elif total_ventas == 0:
                    tipo = "baja_demanda"
                    confianza = 50
                    descripcion = "Sin ventas en el período analizado"
                    evidencias.append(f"0 ventas en {dias_totales} días")
                    if stock_actual > 0:
                        evidencias.append(f"Stock disponible: {stock_actual:.0f} unidades")
                else:
                    tipo = "sin_diagnostico"
                    confianza = 30
                    descripcion = "No se pudo determinar una causa clara"
                    evidencias.append("Se requiere análisis manual")

                diagnostico = DiagnosticoVentaPerdida(
                    tipo=tipo,
                    confianza=round(confianza, 1),
                    descripcion=descripcion,
                    evidencia=evidencias
                )

            return HistorialProductoResponse(
                producto_id=producto_id,
                codigo_producto=codigo,
                descripcion_producto=nombre_producto,
                categoria=categoria,
                ubicacion_id=ubicacion_id,
                ubicacion_nombre=ubicacion_nombre,
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
                granularidad=granularidad,
                datos=datos,
                total_ventas_periodo=round(total_ventas, 1),
                promedio_diario_ventas=round(promedio_diario, 2),
                stock_promedio=round(stock_promedio, 1),
                stock_actual=round(stock_actual, 1),
                dias_con_stock_cero=dias_stock_cero,
                unidades_por_bulto=unidades_por_bulto,
                diagnostico=diagnostico
            )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"Error obteniendo historial ventas+inventario: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)