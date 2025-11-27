#!/usr/bin/env python3
"""
FastAPI Backend para Fluxion AI - La Granja Mercado
Conecta con DuckDB para servir datos de inventario en tiempo real
"""

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Tuple
import duckdb
from pathlib import Path
from datetime import datetime, date, timedelta
import logging
import subprocess
import asyncio
import os
import time
from contextlib import contextmanager
from forecast_pmp import ForecastPMP
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
from routers.analisis_xyz_router import router as analisis_xyz_router
from routers.config_inventario_router import router as config_inventario_router
from routers.abc_v2_router import router as abc_v2_router
from routers.nivel_objetivo_router import router as nivel_objetivo_router
from routers.etl_tracking_router import router as etl_tracking_router
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

    # TEMPORARILY DISABLED: VentasETLScheduler causes OOM during startup
    # This scheduler opens a second DuckDB connection during FastAPI startup
    # Combined with auto_bootstrap_admin(), it exceeds 4GB RAM
    # TODO: Re-enable after implementing lazy initialization or increasing memory to 8GB
    #
    # # Inicializar scheduler de ventas automáticas
    # try:
    #     db_path = Path(__file__).parent.parent / "data" / "fluxion_production.db"
    #     ventas_scheduler = VentasETLScheduler(
    #         db_path=str(db_path),
    #         execution_hour=5,  # 5:00 AM
    #         execution_minute=0
    #     )
    #
    #     # Registrar callback para ejecutar ETL
    #     ventas_scheduler.set_etl_callback(run_etl_ventas_for_scheduler)
    #
    #     # Iniciar scheduler
    #     ventas_scheduler.start()
    #
    #     logger.info("✅ Ventas ETL Scheduler iniciado - Ejecución diaria: 5:00 AM")
    # except Exception as e:
    #     logger.error(f"⚠️  Error iniciando scheduler de ventas: {e}")

    logger.info("⚠️  VentasETLScheduler DISABLED - Use manual ETL sync endpoints or increase RAM to 8GB")

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
app.include_router(analisis_xyz_router)
app.include_router(config_inventario_router)
app.include_router(abc_v2_router)
app.include_router(nivel_objetivo_router)
app.include_router(etl_tracking_router)
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
from db_manager import get_db_connection, get_db_connection_write, execute_query_dict, is_postgres_mode, get_postgres_connection
from database import DB_PATH

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

class PaginationMetadata(BaseModel):
    total_items: int
    total_pages: int
    current_page: int
    page_size: int
    has_next: bool
    has_previous: bool
    stock_cero: Optional[int] = 0  # Productos con stock en cero
    stock_negativo: Optional[int] = 0  # Productos con stock negativo

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
        "database": "DuckDB Connected" if DB_PATH.exists() else "Database Missing"
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
        # Available columns: id, nombre, codigo_klk, ciudad, estado, direccion, activo, fecha_creacion
        query = "SELECT id, nombre, codigo_klk, ciudad, estado, activo FROM ubicaciones WHERE activo = true"

        # tipo filter not supported in PostgreSQL v2.0 (all are tiendas by default)
        # visible_pedidos filter not supported (no config column)

        # Execute query using db_manager
        ubicaciones_data = execute_query_dict(query)

        ubicaciones = []
        for row in ubicaciones_data:
            ubicaciones.append(UbicacionResponse(
                id=row['id'],
                codigo=row.get('codigo_klk', row['id']),  # Use codigo_klk or fallback to id
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
            # PostgreSQL v2.0: usa inventario_actual con LEFT JOIN a ubicaciones y almacenes
            if is_postgres_mode():
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
            else:
                # DuckDB usa CAST() para fechas y tiene tabla stock_actual
                query = """
                    SELECT
                        sa.ubicacion_id,
                        sa.ubicacion_id as ubicacion_nombre,
                        'tienda' as tipo_ubicacion,
                        COUNT(DISTINCT sa.producto_id) as total_productos,
                        SUM(CASE WHEN sa.cantidad = 0 THEN 1 ELSE 0 END) as stock_cero,
                        SUM(CASE WHEN sa.cantidad < 0 THEN 1 ELSE 0 END) as stock_negativo,
                        CAST(MAX(sa.ultima_actualizacion) AS VARCHAR) as ultima_actualizacion,
                        sa.almacen_codigo
                    FROM stock_actual sa
                    WHERE sa.ubicacion_id IN ('""" + "','".join(tiendas_klk_ids) + """')
                    GROUP BY sa.ubicacion_id, sa.almacen_codigo
                    ORDER BY sa.ubicacion_id, sa.almacen_codigo
                """

            # Ejecutar query según base de datos
            if is_postgres_mode():
                cursor = conn.cursor()
                cursor.execute(query)
                result = cursor.fetchall()
                cursor.close()
            else:
                result = conn.execute(query).fetchall()

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

@app.get("/api/ubicaciones/{ubicacion_id}/stock-params", tags=["Ubicaciones"])
async def get_stock_params(ubicacion_id: str):
    """Obtiene los parámetros de stock para una tienda específica desde base de datos"""
    try:
        with get_db_connection() as conn:
            from services.config_inventario_service import ConfigInventarioService

            # Obtener multiplicadores para cada categoría y clasificación ABC
            # Nota: Este endpoint retorna config para categoria 'seco' por compatibilidad
            # En el frontend se debe llamar con categoría específica si se necesita

            result = {}
            result["ubicacion_id"] = ubicacion_id

            # Obtener config para cada ABC en categoría SECO (mayoría de productos)
            for abc in ['A', 'AB', 'B', 'BC', 'C']:
                config = ConfigInventarioService.obtener_config_global('seco', abc, conn)

                suffix = abc.lower()
                result[f"stock_min_mult_{suffix}"] = config['stock_min_mult']
                result[f"stock_seg_mult_{suffix}"] = config['stock_seg_mult']
                result[f"stock_max_mult_{suffix}"] = config['stock_max_mult']

            return result

    except Exception as e:
        logger.error(f"Error obteniendo parámetros de stock: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


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

    PostgreSQL v2.0: usa tabla productos
    DuckDB legacy: usa tabla inventario_raw
    """
    try:
        if is_postgres_mode():
            # PostgreSQL v2.0: obtener categorías desde tabla productos
            query = """
                SELECT DISTINCT categoria
                FROM productos
                WHERE activo = true
                    AND categoria IS NOT NULL
                ORDER BY categoria
            """
        else:
            # DuckDB legacy: usa inventario_raw
            query = """
                SELECT DISTINCT categoria
                FROM inventario_raw
                WHERE activo = true
                    AND categoria IS NOT NULL
                    AND tipo_ubicacion != 'mayorista'
                ORDER BY categoria
            """

        with get_db_connection() as conn:
            if is_postgres_mode():
                cursor = conn.cursor()
                cursor.execute(query)
                result = cursor.fetchall()
                cursor.close()
            else:
                result = conn.execute(query).fetchall()

            return [row[0] for row in result]

    except Exception as e:
        logger.error(f"Error obteniendo categorías: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

# =====================================================================================
# ENDPOINTS PARA SECCIÓN PRODUCTOS (ABC-XYZ)
# =====================================================================================

@app.get("/api/productos/matriz-abc-xyz", tags=["Productos"])
async def get_matriz_abc_xyz(ubicacion_id: Optional[str] = None):
    """
    Retorna matriz 3×3 ABC-XYZ con conteos y porcentajes

    Args:
        ubicacion_id: Filtro por tienda (opcional, None = todas las tiendas)

    Returns:
        {
            "total_productos": 3133,
            "matriz": {
                "AX": { "count": 45, "porcentaje_productos": 1.4, "porcentaje_valor": 35.2 },
                ...
            },
            "resumen_abc": { "A": {...}, "B": {...}, "C": {...} },
            "resumen_xyz": { "X": {...}, "Y": {...}, "Z": {...} }
        }
    """
    try:
        with get_db_connection() as conn:
            if ubicacion_id:
                # Si hay ubicacion_id, mostrar datos de esa tienda específica
                where_clause = "WHERE matriz_abc_xyz IS NOT NULL AND ubicacion_id = ?"
                params = [ubicacion_id]

                # Contar productos por matriz
                matriz_query = f"""
                    SELECT
                        matriz_abc_xyz,
                        COUNT(DISTINCT codigo_producto) as count,
                        SUM(valor_consumo_total) as valor_total
                    FROM productos_abc_v2
                    {where_clause}
                    GROUP BY matriz_abc_xyz
                """

                matriz_result = conn.execute(matriz_query, params).fetchall()

                # Resumen por ABC
                abc_query = f"""
                    SELECT
                        clasificacion_abc_valor,
                        COUNT(DISTINCT codigo_producto) as count,
                        SUM(valor_consumo_total) as valor_total
                    FROM productos_abc_v2
                    {where_clause}
                    GROUP BY clasificacion_abc_valor
                """

                abc_result = conn.execute(abc_query, params).fetchall()

                # Resumen por XYZ
                xyz_query = f"""
                    SELECT
                        clasificacion_xyz,
                        COUNT(DISTINCT codigo_producto) as count
                    FROM productos_abc_v2
                    {where_clause}
                        AND clasificacion_xyz IS NOT NULL
                    GROUP BY clasificacion_xyz
                """

                xyz_result = conn.execute(xyz_query, params).fetchall()

            else:
                # Sin ubicacion_id: agregar por producto primero, luego clasificar
                # Esto evita contar el mismo producto múltiples veces si tiene diferentes
                # clasificaciones en diferentes tiendas

                # Matriz: tomar la clasificación más común por producto
                matriz_query = """
                    WITH producto_matriz AS (
                        SELECT
                            codigo_producto,
                            matriz_abc_xyz,
                            SUM(valor_consumo_total) as valor_total,
                            COUNT(*) as tiendas_count
                        FROM productos_abc_v2
                        WHERE matriz_abc_xyz IS NOT NULL
                        GROUP BY codigo_producto, matriz_abc_xyz
                        QUALIFY ROW_NUMBER() OVER (PARTITION BY codigo_producto ORDER BY tiendas_count DESC, valor_total DESC) = 1
                    )
                    SELECT
                        matriz_abc_xyz,
                        COUNT(codigo_producto) as count,
                        SUM(valor_total) as valor_total
                    FROM producto_matriz
                    GROUP BY matriz_abc_xyz
                """

                matriz_result = conn.execute(matriz_query).fetchall()

                # Resumen ABC: tomar la clasificación más común por producto
                abc_query = """
                    WITH producto_abc AS (
                        SELECT
                            codigo_producto,
                            clasificacion_abc_valor,
                            SUM(valor_consumo_total) as valor_total,
                            COUNT(*) as tiendas_count
                        FROM productos_abc_v2
                        WHERE clasificacion_abc_valor IS NOT NULL
                        GROUP BY codigo_producto, clasificacion_abc_valor
                        QUALIFY ROW_NUMBER() OVER (PARTITION BY codigo_producto ORDER BY tiendas_count DESC, valor_total DESC) = 1
                    )
                    SELECT
                        clasificacion_abc_valor,
                        COUNT(codigo_producto) as count,
                        SUM(valor_total) as valor_total
                    FROM producto_abc
                    GROUP BY clasificacion_abc_valor
                """

                abc_result = conn.execute(abc_query).fetchall()

                # Resumen XYZ: tomar la clasificación más común por producto
                xyz_query = """
                    WITH producto_xyz AS (
                        SELECT
                            codigo_producto,
                            clasificacion_xyz,
                            COUNT(*) as tiendas_count
                        FROM productos_abc_v2
                        WHERE clasificacion_xyz IS NOT NULL
                        GROUP BY codigo_producto, clasificacion_xyz
                        QUALIFY ROW_NUMBER() OVER (PARTITION BY codigo_producto ORDER BY tiendas_count DESC) = 1
                    )
                    SELECT
                        clasificacion_xyz,
                        COUNT(codigo_producto) as count
                    FROM producto_xyz
                    GROUP BY clasificacion_xyz
                """

                xyz_result = conn.execute(xyz_query).fetchall()

            # Calcular totales
            total_productos = sum(row[1] for row in matriz_result)
            total_valor = sum(row[2] if row[2] else 0 for row in matriz_result)

            # Construir matriz con todos los cuadrantes
            matriz = {}
            for abc in ['A', 'B', 'C']:
                for xyz in ['X', 'Y', 'Z']:
                    key = f"{abc}{xyz}"
                    matriz[key] = {
                        "count": 0,
                        "porcentaje_productos": 0.0,
                        "porcentaje_valor": 0.0
                    }

            # Llenar con datos reales
            for row in matriz_result:
                if row[0]:  # matriz_abc_xyz no es NULL
                    matriz[row[0]] = {
                        "count": row[1],
                        "porcentaje_productos": round((row[1] / total_productos * 100), 2) if total_productos > 0 else 0,
                        "porcentaje_valor": round((row[2] / total_valor * 100), 2) if total_valor > 0 else 0
                    }

            # Procesar resumen ABC (derivar de la matriz para consistencia)
            resumen_abc = {}
            for abc in ['A', 'B', 'C']:
                abc_count = sum(matriz[f"{abc}{xyz}"]["count"] for xyz in ['X', 'Y', 'Z'])
                abc_porcentaje_valor = sum(matriz[f"{abc}{xyz}"]["porcentaje_valor"] for xyz in ['X', 'Y', 'Z'])
                if abc_count > 0:
                    resumen_abc[abc] = {
                        "count": abc_count,
                        "porcentaje_productos": round((abc_count / total_productos * 100), 2) if total_productos > 0 else 0,
                        "porcentaje_valor": round(abc_porcentaje_valor, 2)
                    }

            # Procesar resumen XYZ (derivar de la matriz para consistencia)
            resumen_xyz = {}
            for xyz in ['X', 'Y', 'Z']:
                xyz_count = sum(matriz[f"{abc}{xyz}"]["count"] for abc in ['A', 'B', 'C'])
                if xyz_count > 0:
                    resumen_xyz[xyz] = {
                        "count": xyz_count,
                        "porcentaje_productos": round((xyz_count / total_productos * 100), 2) if total_productos > 0 else 0
                    }

            return {
                "total_productos": total_productos,
                "total_valor": float(total_valor) if total_valor else 0,
                "matriz": matriz,
                "resumen_abc": resumen_abc,
                "resumen_xyz": resumen_xyz
            }

    except Exception as e:
        logger.error(f"Error obteniendo matriz ABC-XYZ: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/productos/lista-por-matriz", tags=["Productos"])
async def get_productos_por_matriz(
    matriz: Optional[str] = None,
    ubicacion_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    """
    Retorna lista de productos con clasificación ABC-XYZ

    Args:
        matriz: "AX", "AY", "AZ", "BX", "BY", "BZ", "CX", "CY", "CZ" (opcional, None = todos)
        ubicacion_id: Filtro por tienda (opcional)
        limit: Cantidad máxima de productos a retornar
        offset: Offset para paginación

    Returns:
        Lista de productos con clasificación ABC-XYZ
    """
    try:
        with get_db_connection() as conn:
            if ubicacion_id:
                # Si hay ubicacion_id, mostrar productos de esa tienda específica
                # Usar COALESCE para obtener descripción de inventario o ventas
                where_clause = "WHERE ubicacion_id = ?"
                params_ventas = [ubicacion_id]

                if matriz:
                    where_clause += " AND matriz_abc_xyz = ?"
                    params_ventas.append(matriz)

                query = f"""
                    WITH producto_ventas AS (
                        SELECT
                            codigo_producto,
                            descripcion_producto,
                            categoria_producto
                        FROM ventas_raw
                        WHERE codigo_producto IN (
                            SELECT codigo_producto FROM productos_abc_v2
                            {where_clause}
                        )
                        GROUP BY codigo_producto, descripcion_producto, categoria_producto
                        QUALIFY ROW_NUMBER() OVER (PARTITION BY codigo_producto ORDER BY COUNT(*) DESC) = 1
                    )
                    SELECT
                        abc.codigo_producto,
                        COALESCE(inv.descripcion_producto, pv.descripcion_producto, 'Sin descripción') as descripcion,
                        COALESCE(inv.categoria, pv.categoria_producto, 'Sin categoría') as categoria,
                        abc.clasificacion_abc_valor,
                        abc.clasificacion_xyz,
                        abc.matriz_abc_xyz,
                        abc.valor_consumo_total,
                        abc.porcentaje_valor,
                        abc.ranking_valor,
                        abc.coeficiente_variacion,
                        COALESCE(inv.cantidad_actual, 0) as stock_actual
                    FROM productos_abc_v2 abc
                    LEFT JOIN inventario_raw inv ON abc.codigo_producto = inv.codigo_producto
                        AND abc.ubicacion_id = inv.ubicacion_id
                    LEFT JOIN producto_ventas pv ON abc.codigo_producto = pv.codigo_producto
                    {where_clause.replace('ubicacion_id', 'abc.ubicacion_id').replace('matriz_abc_xyz', 'abc.matriz_abc_xyz')}
                    ORDER BY abc.ranking_valor ASC
                    LIMIT ? OFFSET ?
                """
                params = params_ventas + params_ventas + [limit, offset]
            else:
                # Sin ubicacion_id: usar la clasificación más común para cada producto
                # Esto asegura que cada producto aparezca una sola vez con su clasificación principal
                where_filter = "WHERE matriz_abc_xyz IS NOT NULL" if not matriz else "WHERE matriz_abc_xyz = ?"
                params = [] if not matriz else [matriz]

                query = f"""
                    WITH total_tiendas AS (
                        SELECT COUNT(DISTINCT ubicacion_id) as total
                        FROM productos_abc_v2
                    ),
                    producto_clasificacion AS (
                        SELECT
                            codigo_producto,
                            matriz_abc_xyz,
                            clasificacion_abc_valor,
                            clasificacion_xyz,
                            SUM(valor_consumo_total) as valor_total,
                            AVG(porcentaje_valor) as porcentaje_promedio,
                            AVG(coeficiente_variacion) as cv_promedio,
                            COUNT(*) as tiendas_count
                        FROM productos_abc_v2
                        {where_filter}
                        GROUP BY codigo_producto, matriz_abc_xyz, clasificacion_abc_valor, clasificacion_xyz
                        QUALIFY ROW_NUMBER() OVER (PARTITION BY codigo_producto ORDER BY tiendas_count DESC, valor_total DESC) = 1
                    ),
                    producto_ranked AS (
                        SELECT
                            pc.*,
                            tt.total as total_tiendas,
                            ROW_NUMBER() OVER (ORDER BY pc.tiendas_count DESC, pc.valor_total DESC) as ranking_global
                        FROM producto_clasificacion pc
                        CROSS JOIN total_tiendas tt
                    ),
                    producto_stock AS (
                        SELECT
                            codigo_producto,
                            MIN(descripcion_producto) as descripcion_inv,
                            MIN(categoria) as categoria_inv,
                            SUM(cantidad_actual) as stock_total
                        FROM inventario_raw
                        GROUP BY codigo_producto
                    ),
                    producto_ventas AS (
                        SELECT
                            codigo_producto,
                            descripcion_producto,
                            categoria_producto
                        FROM ventas_raw
                        WHERE codigo_producto IN (SELECT codigo_producto FROM producto_clasificacion)
                        GROUP BY codigo_producto, descripcion_producto, categoria_producto
                        QUALIFY ROW_NUMBER() OVER (PARTITION BY codigo_producto ORDER BY COUNT(*) DESC) = 1
                    )
                    SELECT
                        pr.codigo_producto,
                        COALESCE(ps.descripcion_inv, pv.descripcion_producto) as descripcion,
                        COALESCE(ps.categoria_inv, pv.categoria_producto) as categoria,
                        pr.clasificacion_abc_valor,
                        pr.clasificacion_xyz,
                        pr.matriz_abc_xyz,
                        pr.valor_total,
                        pr.porcentaje_promedio,
                        pr.ranking_global,
                        pr.cv_promedio,
                        ps.stock_total,
                        pr.tiendas_count,
                        pr.total_tiendas
                    FROM producto_ranked pr
                    LEFT JOIN producto_stock ps ON pr.codigo_producto = ps.codigo_producto
                    LEFT JOIN producto_ventas pv ON pr.codigo_producto = pv.codigo_producto
                    ORDER BY pr.tiendas_count DESC, pr.valor_total DESC
                    LIMIT ? OFFSET ?
                """
                params = params + [limit, offset]

            result = conn.execute(query, params).fetchall()

            productos = []
            for row in result:
                producto = {
                    "codigo_producto": row[0],
                    "descripcion": row[1],
                    "categoria": row[2],
                    "clasificacion_abc": row[3],
                    "clasificacion_xyz": row[4],
                    "matriz": row[5],
                    "valor_consumo_total": float(row[6]) if row[6] else 0,
                    "porcentaje_valor": float(row[7]) if row[7] else 0,
                    "ranking_valor": row[8],
                    "coeficiente_variacion": float(row[9]) if row[9] else None,
                    "stock_actual": float(row[10]) if row[10] else 0
                }

                # Si es vista global (sin ubicacion_id), agregar info de tiendas
                if not ubicacion_id:
                    producto["tiendas_con_clasificacion"] = row[11]
                    producto["total_tiendas"] = row[12]
                    producto["porcentaje_tiendas"] = round((row[11] / row[12] * 100), 1) if row[12] > 0 else 0

                productos.append(producto)

            return productos

    except Exception as e:
        logger.error(f"Error obteniendo productos por matriz: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/productos/{codigo}/detalle-completo", tags=["Productos"])
async def get_producto_detalle_completo(codigo: str):
    """
    Vista 360° de un producto: info básica, clasificaciones por tienda,
    inventarios, velocidades de venta

    Args:
        codigo: Código del producto

    Returns:
        Objeto completo con toda la información del producto
    """
    try:
        with get_db_connection() as conn:
            # 1. Información básica del producto
            # Primero buscar en inventario, si no está, buscar en ventas históricas
            producto_query_inv = """
                SELECT DISTINCT
                    codigo_producto as codigo,
                    descripcion_producto as descripcion,
                    categoria,
                    marca
                FROM inventario_raw
                WHERE codigo_producto = ?
                LIMIT 1
            """

            producto_row = conn.execute(producto_query_inv, [codigo]).fetchone()

            # Si no está en inventario, buscar en ventas históricas
            if not producto_row:
                producto_query_ventas = """
                    SELECT
                        codigo_producto,
                        descripcion_producto,
                        categoria_producto,
                        marca_producto
                    FROM ventas_raw
                    WHERE codigo_producto = ?
                    GROUP BY codigo_producto, descripcion_producto, categoria_producto, marca_producto
                    ORDER BY COUNT(*) DESC
                    LIMIT 1
                """
                producto_row = conn.execute(producto_query_ventas, [codigo]).fetchone()

            if not producto_row:
                raise HTTPException(status_code=404, detail=f"Producto {codigo} no encontrado")

            producto_info = {
                "codigo": producto_row[0],
                "descripcion": producto_row[1],
                "categoria": producto_row[2],
                "marca": producto_row[3] if len(producto_row) > 3 else None
            }

            # 2. Clasificaciones ABC-XYZ por ubicación
            clasificaciones_query = """
                SELECT
                    abc.ubicacion_id,
                    COALESCE(
                        (SELECT DISTINCT ubicacion_nombre FROM inventario_raw WHERE ubicacion_id = abc.ubicacion_id LIMIT 1),
                        (SELECT DISTINCT ubicacion_nombre FROM ventas_raw WHERE ubicacion_id = abc.ubicacion_id LIMIT 1),
                        abc.ubicacion_id
                    ) as ubicacion_nombre,
                    abc.clasificacion_abc_valor,
                    abc.clasificacion_xyz,
                    abc.matriz_abc_xyz,
                    abc.ranking_valor,
                    abc.valor_consumo_total,
                    abc.coeficiente_variacion
                FROM productos_abc_v2 abc
                WHERE abc.codigo_producto = ?
                ORDER BY abc.ranking_valor ASC
            """

            clasif_result = conn.execute(clasificaciones_query, [codigo]).fetchall()
            clasificaciones = []
            for row in clasif_result:
                clasificaciones.append({
                    "ubicacion_id": row[0],
                    "ubicacion_nombre": row[1],
                    "clasificacion_abc": row[2],
                    "clasificacion_xyz": row[3],
                    "matriz": row[4],
                    "ranking_valor": row[5],
                    "valor_consumo": float(row[6]) if row[6] else 0,
                    "coeficiente_variacion": float(row[7]) if row[7] else None
                })

            # 3. Inventarios por ubicación
            inventarios_query = """
                SELECT
                    ubicacion_id,
                    ubicacion_nombre,
                    tipo_ubicacion,
                    cantidad_actual,
                    fecha_extraccion as ultima_actualizacion
                FROM inventario_raw
                WHERE codigo_producto = ?
                    AND activo = true
                ORDER BY tipo_ubicacion, ubicacion_nombre
            """

            inv_result = conn.execute(inventarios_query, [codigo]).fetchall()
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
                    "ultima_actualizacion": str(row[4]) if row[4] else None
                })

            # 4. Métricas globales
            metricas_globales = {
                "total_inventario": total_inventario,
                "ubicaciones_con_stock": ubicaciones_con_stock,
                "ubicaciones_sin_stock": ubicaciones_sin_stock,
                "total_ubicaciones": ubicaciones_con_stock + ubicaciones_sin_stock
            }

            return {
                "producto": producto_info,
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
            # Query para ventas semanales
            if ubicacion_id:
                query = """
                    WITH ventas_semanales AS (
                        SELECT
                            STRFTIME(TRY_CAST(fecha AS DATE), '%Y-W%W') as semana,
                            TRY_CAST(fecha AS DATE) as fecha,
                            SUM(TRY_CAST(cantidad_vendida AS DOUBLE)) as unidades,
                            SUM(TRY_CAST(venta_total AS DOUBLE)) as valor
                        FROM ventas_raw
                        WHERE codigo_producto = ?
                            AND ubicacion_id = ?
                            AND TRY_CAST(fecha AS DATE) >= CURRENT_DATE - INTERVAL '52 weeks'
                        GROUP BY STRFTIME(TRY_CAST(fecha AS DATE), '%Y-W%W'), TRY_CAST(fecha AS DATE)
                    )
                    SELECT
                        semana,
                        SUM(unidades) as unidades,
                        SUM(valor) as valor,
                        SUM(unidades) / 7.0 as promedio_diario,
                        MIN(fecha) as fecha_inicio_semana
                    FROM ventas_semanales
                    GROUP BY semana
                    ORDER BY semana ASC
                """
                params = [codigo, ubicacion_id]
            else:
                # Agregar todas las ubicaciones
                query = """
                    WITH ventas_semanales AS (
                        SELECT
                            STRFTIME(TRY_CAST(fecha AS DATE), '%Y-W%W') as semana,
                            TRY_CAST(fecha AS DATE) as fecha,
                            SUM(TRY_CAST(cantidad_vendida AS DOUBLE)) as unidades,
                            SUM(TRY_CAST(venta_total AS DOUBLE)) as valor
                        FROM ventas_raw
                        WHERE codigo_producto = ?
                            AND TRY_CAST(fecha AS DATE) >= CURRENT_DATE - INTERVAL '52 weeks'
                        GROUP BY STRFTIME(TRY_CAST(fecha AS DATE), '%Y-W%W'), TRY_CAST(fecha AS DATE)
                    )
                    SELECT
                        semana,
                        SUM(unidades) as unidades,
                        SUM(valor) as valor,
                        SUM(unidades) / 7.0 as promedio_diario,
                        MIN(fecha) as fecha_inicio_semana
                    FROM ventas_semanales
                    GROUP BY semana
                    ORDER BY semana ASC
                """
                params = [codigo]

            rows = conn.execute(query, params).fetchall()

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
            query = f"""
                SELECT
                    u.id as ubicacion_id,
                    u.nombre as ubicacion_nombre,
                    COALESCE(SUM(TRY_CAST(v.cantidad_vendida AS DOUBLE)), 0) as total_unidades,
                    COUNT(DISTINCT v.numero_factura) as total_transacciones,
                    MAX(TRY_CAST(v.fecha AS DATE)) as ultima_venta
                FROM ubicaciones u
                LEFT JOIN ventas_raw v ON u.id = v.ubicacion_id
                    AND v.codigo_producto = ?
                    AND TRY_CAST(v.fecha AS DATE) >= CURRENT_DATE - INTERVAL {dias} DAY
                WHERE u.tipo = 'tienda'
                GROUP BY u.id, u.nombre
                ORDER BY total_unidades DESC
            """

            rows = conn.execute(query, [codigo]).fetchall()

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
    estado: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = 'desc'
):
    """
    Obtiene el estado del stock actual con paginación server-side

    PostgreSQL v2.0: usa inventario_actual con JOINs a productos y ubicaciones
    DuckDB legacy: usa inventario_raw

    Args:
        ubicacion_id: Filtrar por ID de ubicación
        almacen_codigo: Filtrar por código de almacén (ej: APP-TPF, APP-PPF)
        categoria: Filtrar por categoría
        estado: Filtrar por estado de stock
        page: Número de página (inicia en 1)
        page_size: Cantidad de items por página (máx 500)
        search: Buscar por código o descripción de producto
        sort_by: Campo por el cual ordenar (stock, peso)
        sort_order: Orden ascendente (asc) o descendente (desc)
    """
    try:
        # Validar parámetros de paginación
        if page < 1:
            raise HTTPException(status_code=400, detail="El número de página debe ser >= 1")
        if page_size < 1 or page_size > 500:
            raise HTTPException(status_code=400, detail="page_size debe estar entre 1 y 500")

        if is_postgres_mode():
            # ===================================================================
            # PostgreSQL v2.0: Query simplificado usando inventario_actual
            # ===================================================================
            count_query = """
                SELECT COUNT(*)
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                INNER JOIN ubicaciones u ON ia.ubicacion_id = u.id
                WHERE p.activo = true AND u.activo = true
            """

            query = """
                SELECT DISTINCT ON (ia.producto_id, ia.ubicacion_id)
                    ia.ubicacion_id,
                    u.nombre as ubicacion_nombre,
                    'tienda' as tipo_ubicacion,
                    ia.producto_id,
                    COALESCE(p.codigo, '') as codigo_producto,
                    COALESCE(NULLIF(p.descripcion, ''), 'Sin Descripción') as descripcion_producto,
                    COALESCE(NULLIF(p.categoria, ''), 'Sin Categoría') as categoria,
                    COALESCE(p.marca, '') as marca,
                    ia.cantidad as stock_actual,
                    NULL as stock_minimo,
                    NULL as stock_maximo,
                    NULL as punto_reorden,
                    NULL as precio_venta,
                    NULL as cantidad_bultos,
                    CASE
                        WHEN ia.cantidad = 0 THEN 'sin_stock'
                        WHEN ia.cantidad < 0 THEN 'stock_negativo'
                        ELSE 'normal'
                    END as estado_stock,
                    NULL as dias_cobertura_actual,
                    false as es_producto_estrella,
                    TO_CHAR(ia.fecha_actualizacion, 'YYYY-MM-DD HH24:MI:SS') as fecha_extraccion,
                    NULL as peso_producto_kg,
                    NULL as peso_total_kg
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                INNER JOIN ubicaciones u ON ia.ubicacion_id = u.id
                WHERE p.activo = true AND u.activo = true
            """

            stats_query = """
                SELECT
                    SUM(CASE WHEN ia.cantidad = 0 THEN 1 ELSE 0 END) as stock_cero,
                    SUM(CASE WHEN ia.cantidad < 0 THEN 1 ELSE 0 END) as stock_negativo
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                INNER JOIN ubicaciones u ON ia.ubicacion_id = u.id
                WHERE p.activo = true AND u.activo = true
            """

            params = []

            # Aplicar filtros
            if ubicacion_id:
                query += " AND ia.ubicacion_id = %s"
                count_query += " AND ia.ubicacion_id = %s"
                stats_query += " AND ia.ubicacion_id = %s"
                params.append(ubicacion_id)

            if almacen_codigo:
                query += " AND ia.almacen_codigo = %s"
                count_query += " AND ia.almacen_codigo = %s"
                stats_query += " AND ia.almacen_codigo = %s"
                params.append(almacen_codigo)

            if categoria:
                query += " AND p.categoria = %s"
                count_query += " AND p.categoria = %s"
                stats_query += " AND p.categoria = %s"
                params.append(categoria)

            if search:
                search_term = f"%{search}%"
                query += " AND (p.codigo ILIKE %s OR p.descripcion ILIKE %s)"
                count_query += " AND (p.codigo ILIKE %s OR p.descripcion ILIKE %s)"
                stats_query += " AND (p.codigo ILIKE %s OR p.descripcion ILIKE %s)"
                params.extend([search_term, search_term])

            # Ejecutar queries con PostgreSQL
            with get_db_connection() as conn:
                cursor = conn.cursor()

                # Count
                cursor.execute(count_query, tuple(params))
                total_items = cursor.fetchone()[0]

                # Stats
                cursor.execute(stats_query, tuple(params))
                stats_result = cursor.fetchone()
                stock_cero = stats_result[0] if stats_result[0] is not None else 0
                stock_negativo = stats_result[1] if stats_result[1] is not None else 0

                # Paginación
                total_pages = (total_items + page_size - 1) // page_size
                offset = (page - 1) * page_size

                # Ordenamiento - DISTINCT ON columns must appear first, but then sorted by user-requested field
                if sort_by == 'stock':
                    order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                    # DISTINCT ON requires these fields first, but we can sub-sort by cantidad
                    query += f" ORDER BY ia.producto_id, ia.ubicacion_id"
                    # Now add pagination query with proper sort by cantidad
                    paginated_query = f"""
                        SELECT * FROM ({query}) AS distinct_rows
                        ORDER BY stock_actual {order_direction}
                    """
                    query = paginated_query
                elif sort_by == 'peso':
                    order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                    query += f" ORDER BY ia.producto_id, ia.ubicacion_id"
                    paginated_query = f"""
                        SELECT * FROM ({query}) AS distinct_rows
                        ORDER BY peso_total_kg {order_direction} NULLS LAST
                    """
                    query = paginated_query
                else:
                    query += " ORDER BY ia.producto_id, ia.ubicacion_id, ia.fecha_actualizacion DESC"

                query += f" LIMIT {page_size} OFFSET {offset}"

                cursor.execute(query, tuple(params))
                result = cursor.fetchall()
                cursor.close()

        else:
            # ===================================================================
            # DuckDB legacy: mantener query original con inventario_raw
            # ===================================================================
            count_query = """
                SELECT COUNT(*)
                FROM inventario_raw inv
                WHERE inv.activo = true
            """

            query = """
                SELECT
                    inv.ubicacion_id,
                    inv.ubicacion_nombre,
                    inv.tipo_ubicacion,
                    inv.codigo_producto as producto_id,
                    inv.codigo_producto,
                    inv.descripcion_producto,
                    inv.categoria,
                    inv.marca,
                    inv.cantidad_actual as stock_actual,
                    inv.stock_minimo,
                    inv.stock_maximo,
                    inv.punto_reorden,
                    inv.precio_venta_actual as precio_venta,
                    inv.cantidad_bultos,
                    inv.estado_stock,
                    inv.dias_sin_movimiento as dias_cobertura_actual,
                    false as es_producto_estrella,
                    CAST(inv.fecha_extraccion AS VARCHAR) as fecha_extraccion,
                    inv.peso_producto as peso_producto_kg,
                    (inv.cantidad_actual * inv.peso_producto) as peso_total_kg
                FROM inventario_raw inv
                WHERE inv.activo = true
            """

            stats_query = """
                SELECT
                    SUM(CASE WHEN inv.cantidad_actual = 0 THEN 1 ELSE 0 END) as stock_cero,
                    SUM(CASE WHEN inv.cantidad_actual < 0 THEN 1 ELSE 0 END) as stock_negativo
                FROM inventario_raw inv
                WHERE inv.activo = true
            """

            params = []

            # Aplicar filtros
            if ubicacion_id:
                query += " AND inv.ubicacion_id = ?"
                count_query += " AND inv.ubicacion_id = ?"
                stats_query += " AND inv.ubicacion_id = ?"
                params.append(ubicacion_id)

            if categoria:
                query += " AND inv.categoria = ?"
                count_query += " AND inv.categoria = ?"
                stats_query += " AND inv.categoria = ?"
                params.append(categoria)

            if estado:
                query += " AND inv.estado_stock = ?"
                count_query += " AND inv.estado_stock = ?"
                stats_query += " AND inv.estado_stock = ?"
                params.append(estado)

            if search:
                search_term = f"%{search}%"
                query += " AND (inv.codigo_producto ILIKE ? OR inv.descripcion_producto ILIKE ?)"
                count_query += " AND (inv.codigo_producto ILIKE ? OR inv.descripcion_producto ILIKE ?)"
                stats_query += " AND (inv.codigo_producto ILIKE ? OR inv.descripcion_producto ILIKE ?)"
                params.extend([search_term, search_term])

            # Ejecutar queries con DuckDB
            with get_db_connection() as conn:
                # Count
                total_items = conn.execute(count_query, params).fetchone()[0]

                # Stats
                stats_result = conn.execute(stats_query, params).fetchone()
                stock_cero = stats_result[0] if stats_result[0] is not None else 0
                stock_negativo = stats_result[1] if stats_result[1] is not None else 0

                # Paginación
                total_pages = (total_items + page_size - 1) // page_size
                offset = (page - 1) * page_size

                # Ordenamiento
                if sort_by == 'stock':
                    order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                    query += f" ORDER BY (CASE WHEN inv.cantidad_bultos > 0 THEN inv.cantidad_actual / inv.cantidad_bultos ELSE inv.cantidad_actual END) {order_direction}, inv.descripcion_producto"
                elif sort_by == 'peso':
                    order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                    query += f" ORDER BY (inv.cantidad_actual * inv.peso_producto) {order_direction} NULLS LAST, inv.descripcion_producto"
                else:
                    query += " ORDER BY inv.tipo_ubicacion, inv.ubicacion_nombre, inv.categoria, inv.descripcion_producto"

                query += f" LIMIT {page_size} OFFSET {offset}"

                result = conn.execute(query, params).fetchall()

        # Construir respuesta (común para ambos modos)
        stock_data = []
        for row in result:
            stock_data.append(StockResponse(
                ubicacion_id=row[0],
                ubicacion_nombre=row[1],
                ubicacion_tipo=row[2],
                producto_id=row[3],
                codigo_producto=row[4],
                descripcion_producto=row[5],
                categoria=row[6],
                marca=row[7],
                stock_actual=row[8],
                stock_minimo=row[9],
                stock_maximo=row[10],
                punto_reorden=row[11],
                precio_venta=row[12],
                cantidad_bultos=row[13],
                estado_stock=row[14],
                dias_cobertura_actual=row[15],
                es_producto_estrella=row[16],
                fecha_extraccion=row[17],
                peso_producto_kg=row[18],
                peso_total_kg=row[19]
            ))

        # Crear metadata de paginación
        pagination = PaginationMetadata(
            total_items=total_items,
            total_pages=total_pages,
            current_page=page,
            page_size=page_size,
            has_next=page < total_pages,
            has_previous=page > 1,
            stock_cero=stock_cero,
            stock_negativo=stock_negativo
        )

        return PaginatedStockResponse(
            data=stock_data,
            pagination=pagination
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo stock: {str(e)}")
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
    Soporta PostgreSQL v2.0 y DuckDB (legacy)
    Incluye cache TTL de 5 minutos para mejorar rendimiento
    """
    # Check cache first
    cached = get_cached_ventas_summary()
    if cached is not None:
        return cached

    try:
        with get_db_connection() as conn:
            # Adaptar query según base de datos
            if is_postgres_mode():
                # PostgreSQL v2.0: usa tabla ventas con JOIN a ubicaciones
                # Incluye fecha Y hora de primera y última venta sincronizada
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
                # PostgreSQL - usar cursor
                cursor = conn.cursor()
                cursor.execute(query)
                result = cursor.fetchall()
                cursor.close()
            else:
                # DuckDB (legacy): usa ventas_raw con ubicacion_id/nombre dentro
                query = """
                    SELECT
                        v.ubicacion_id,
                        v.ubicacion_nombre,
                        'tienda' as tipo_ubicacion,
                        COUNT(DISTINCT v.numero_factura) as total_transacciones,
                        COUNT(DISTINCT v.codigo_producto) as productos_unicos,
                        CAST(SUM(CAST(v.cantidad_vendida AS DECIMAL)) AS INTEGER) as unidades_vendidas,
                        MIN(v.fecha) as primera_venta,
                        MAX(v.fecha) as ultima_venta
                    FROM ventas_raw v
                    GROUP BY v.ubicacion_id, v.ubicacion_nombre
                    ORDER BY v.ubicacion_nombre
                """
                result = conn.execute(query).fetchall()

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

@app.get("/api/ventas/gaps", tags=["Ventas"])
async def get_ventas_gaps():
    """
    Analiza gaps de data de ventas por tienda
    Retorna: fecha más antigua, más reciente, días atrasados, y gaps detectados
    """
    try:
        with get_db_connection() as conn:
            # Query para obtener rango de fechas por tienda
            query = """
                SELECT
                    ubicacion_id,
                    ubicacion_nombre,
                    COUNT(*) as total_registros,
                    MIN(fecha)::DATE as fecha_mas_antigua,
                    MAX(fecha)::DATE as fecha_mas_reciente,
                    DATE_DIFF('day', MAX(fecha)::DATE, CURRENT_DATE) as dias_atrasados
                FROM ventas_raw
                GROUP BY ubicacion_id, ubicacion_nombre
                ORDER BY ubicacion_id
            """

            result = conn.execute(query).fetchall()

            gaps_info = []
            for row in result:
                ubicacion_id = row[0]
                ubicacion_nombre = row[1]
                total_registros = row[2]
                fecha_mas_antigua = row[3]
                fecha_mas_reciente = row[4]
                dias_atrasados = row[5] if row[5] is not None else 0

                # Calcular días esperados vs días con data
                if fecha_mas_antigua and fecha_mas_reciente:
                    from datetime import datetime, timedelta
                    fecha_antigua_dt = datetime.strptime(str(fecha_mas_antigua), '%Y-%m-%d')
                    fecha_reciente_dt = datetime.strptime(str(fecha_mas_reciente), '%Y-%m-%d')
                    dias_totales = (fecha_reciente_dt - fecha_antigua_dt).days + 1

                    # Query para contar días únicos con ventas
                    dias_con_data_query = f"""
                        SELECT COUNT(DISTINCT fecha::DATE)
                        FROM ventas_raw
                        WHERE ubicacion_id = '{ubicacion_id}'
                    """
                    dias_con_data = conn.execute(dias_con_data_query).fetchone()[0]

                    gaps_info.append({
                        "ubicacion_id": ubicacion_id,
                        "ubicacion_nombre": ubicacion_nombre,
                        "total_registros": total_registros,
                        "fecha_mas_antigua": str(fecha_mas_antigua),
                        "fecha_mas_reciente": str(fecha_mas_reciente),
                        "dias_atrasados": dias_atrasados,
                        "dias_totales_periodo": dias_totales,
                        "dias_con_data": dias_con_data,
                        "dias_faltantes": dias_totales - dias_con_data,
                        "completitud_porcentaje": round((dias_con_data / dias_totales * 100), 2) if dias_totales > 0 else 0,
                        "necesita_actualizacion": dias_atrasados > 1,
                        "tiene_gaps_historicos": (dias_totales - dias_con_data) > 0
                    })

            return {
                "tiendas": gaps_info,
                "total_tiendas": len(gaps_info),
                "tiendas_desactualizadas": sum(1 for t in gaps_info if t["necesita_actualizacion"]),
                "tiendas_con_gaps": sum(1 for t in gaps_info if t["tiene_gaps_historicos"])
            }

    except Exception as e:
        logger.error(f"Error analizando gaps de ventas: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/ventas/coverage-calendar", tags=["Ventas"])
async def get_ventas_coverage_calendar(days: Optional[int] = 90, mode: str = "days"):
    """
    Retorna un calendario de cobertura de datos de ventas para los últimos N días
    por tienda. Útil para visualizar qué días tienen datos y cuáles faltan.

    Args:
        days: Número de días hacia atrás a consultar (default: 90)
        mode: 'days' para últimos N días, 'all' para todo el histórico

    Returns:
        {
            "ubicaciones": [...],
            "fechas": ["2025-01-01", "2025-01-02", ...],
            "data": {
                "tienda_01": {"2025-01-01": 150, "2025-01-02": null, ...},
                ...
            },
            "meses": [...] // solo si mode='all'
        }
    """
    try:
        with get_db_connection() as conn:
            # Calcular rango de fechas
            fecha_fin = date.today()

            if mode == "all":
                # Obtener la fecha más antigua en la base de datos
                fecha_min_query = "SELECT MIN(fecha::DATE) as fecha_min FROM ventas_raw"
                result = conn.execute(fecha_min_query).fetchone()
                fecha_inicio = result[0] if result[0] else fecha_fin - timedelta(days=365)
            else:
                fecha_inicio = fecha_fin - timedelta(days=days)

            # Generar lista de todas las fechas en el rango
            fechas = []
            fecha_actual = fecha_inicio
            while fecha_actual <= fecha_fin:
                fechas.append(fecha_actual.strftime('%Y-%m-%d'))
                fecha_actual += timedelta(days=1)

            # Obtener lista de ubicaciones
            ubicaciones_query = """
                SELECT DISTINCT ubicacion_id, ubicacion_nombre
                FROM ventas_raw
                ORDER BY ubicacion_id
            """
            ubicaciones_result = conn.execute(ubicaciones_query).fetchall()
            ubicaciones = [
                {"id": row[0], "nombre": row[1]}
                for row in ubicaciones_result
            ]

            # Obtener datos de ventas agrupados por ubicación y fecha
            ventas_query = """
                SELECT
                    ubicacion_id,
                    fecha::DATE as fecha,
                    COUNT(*) as registros,
                    SUM(TRY_CAST(venta_total AS DOUBLE)) as total_venta
                FROM ventas_raw
                WHERE fecha >= ? AND fecha <= ?
                GROUP BY ubicacion_id, fecha::DATE
                ORDER BY ubicacion_id, fecha::DATE
            """
            ventas_result = conn.execute(
                ventas_query,
                [fecha_inicio.strftime('%Y-%m-%d'), fecha_fin.strftime('%Y-%m-%d')]
            ).fetchall()

            # Organizar datos en estructura de mapa
            data = {}
            for ubicacion in ubicaciones:
                ubicacion_id = ubicacion["id"]
                data[ubicacion_id] = {fecha: None for fecha in fechas}

            # Rellenar con datos reales
            for row in ventas_result:
                ubicacion_id = row[0]
                fecha = str(row[1])
                registros = row[2]
                venta_total = float(row[3]) if row[3] else 0

                if ubicacion_id in data and fecha in data[ubicacion_id]:
                    data[ubicacion_id][fecha] = {
                        "registros": registros,
                        "venta_total": round(venta_total, 2)
                    }

            # Agrupar fechas por mes para facilitar visualización
            from collections import defaultdict
            meses = defaultdict(list)
            for fecha_str in fechas:
                fecha_obj = date.fromisoformat(fecha_str)
                mes_key = fecha_obj.strftime('%Y-%m')  # "2024-09"
                mes_nombre = fecha_obj.strftime('%B %Y')  # "September 2024"
                meses[mes_key].append(fecha_str)

            # Convertir a lista ordenada de meses con metadata
            meses_list = []
            for mes_key in sorted(meses.keys()):
                fechas_mes = meses[mes_key]
                # Calcular estadísticas por ubicación para este mes
                estadisticas_ubicaciones = {}
                for ubicacion in ubicaciones:
                    ubicacion_id = ubicacion["id"]
                    dias_con_datos = sum(1 for f in fechas_mes if data[ubicacion_id].get(f) is not None)
                    total_dias = len(fechas_mes)
                    estadisticas_ubicaciones[ubicacion_id] = {
                        "dias_con_datos": dias_con_datos,
                        "total_dias": total_dias,
                        "porcentaje": round((dias_con_datos / total_dias * 100), 1) if total_dias > 0 else 0
                    }

                fecha_obj = date.fromisoformat(fechas_mes[0])
                meses_list.append({
                    "key": mes_key,
                    "nombre": fecha_obj.strftime('%B %Y'),
                    "nombre_corto": fecha_obj.strftime('%b %Y'),
                    "fechas": fechas_mes,
                    "total_dias": len(fechas_mes),
                    "estadisticas": estadisticas_ubicaciones
                })

            response = {
                "ubicaciones": ubicaciones,
                "fechas": fechas,
                "data": data,
                "meses": meses_list,
                "periodo": {
                    "fecha_inicio": fecha_inicio.strftime('%Y-%m-%d'),
                    "fecha_fin": fecha_fin.strftime('%Y-%m-%d'),
                    "total_dias": len(fechas),
                    "total_meses": len(meses_list)
                }
            }

            return response

    except Exception as e:
        logger.error(f"Error obteniendo calendario de cobertura: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

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
            # PostgreSQL v2.0 - versión simplificada (sin categorías ni descripciones)
            if is_postgres_mode():
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
                    WITH producto_stats AS (
                        SELECT
                            producto_id,
                            SUM(cantidad_vendida) as cantidad_total,
                            SUM(venta_total) as venta_total_sum
                        FROM ventas
                        WHERE {where_clause}
                        GROUP BY producto_id
                    ),
                    totales AS (
                        SELECT SUM(cantidad_total) as gran_total FROM producto_stats
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
                        NULL as cantidad_bultos,
                        NULL as total_bultos,
                        NULL as promedio_bultos_diario
                    FROM producto_stats ps
                    CROSS JOIN totales t
                    LEFT JOIN productos p ON ps.producto_id = p.codigo
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

            # DuckDB (legacy)
            # Si no se especifican fechas, usar último mes
            if not fecha_inicio or not fecha_fin:
                fecha_fin = conn.execute("SELECT MAX(fecha) FROM ventas_raw").fetchone()[0]
                fecha_inicio = conn.execute(
                    "SELECT CAST(CAST(? AS DATE) - INTERVAL 30 DAY AS VARCHAR)",
                    (fecha_fin,)
                ).fetchone()[0]

            # Construir query base (fecha es VARCHAR, usar comparación de strings)
            where_clauses = ["v.fecha >= ? AND v.fecha <= ?"]
            params = [fecha_inicio, fecha_fin]

            if ubicacion_id:
                where_clauses.append("v.ubicacion_id = ?")
                params.append(ubicacion_id)

            if categoria:
                where_clauses.append("v.categoria_producto = ?")
                params.append(categoria)

            # Añadir búsqueda si se proporciona
            if search:
                search_term = f"%{search}%"
                where_clauses.append("(v.codigo_producto ILIKE ? OR v.descripcion_producto ILIKE ?)")
                params.append(search_term)
                params.append(search_term)

            where_clause = " AND ".join(where_clauses)

            # Primero obtener el conteo total para paginación
            # Simplificamos para solo contar productos únicos que cumplen filtros
            count_query = f"""
                SELECT COUNT(DISTINCT v.codigo_producto)
                FROM ventas_raw v
                WHERE {where_clause}
            """

            total_items = conn.execute(count_query, params).fetchone()[0]

            # Calcular paginación
            total_pages = (total_items + page_size - 1) // page_size
            offset = (page - 1) * page_size

            # Query principal con todos los cálculos
            # NOTA: Removemos el cálculo de año anterior para mejorar performance (muy pesado)
            # Se puede añadir condicionalmente si el usuario lo solicita
            query = f"""
                WITH periodo_actual AS (
                    SELECT
                        v.codigo_producto,
                        v.descripcion_producto,
                        v.categoria_producto,
                        CAST(SUM(CAST(v.cantidad_vendida AS DECIMAL)) AS DECIMAL) as cantidad_total,
                        COUNT(DISTINCT v.fecha) as dias_distintos,
                        AVG(CAST(v.cantidad_bultos AS DECIMAL)) as cantidad_bultos_promedio
                    FROM ventas_raw v
                    WHERE {where_clause}
                    GROUP BY v.codigo_producto, v.descripcion_producto, v.categoria_producto
                ),
                por_dia_semana AS (
                    SELECT
                        v.codigo_producto,
                        v.dia_semana,
                        SUM(CAST(v.cantidad_vendida AS DECIMAL)) as cantidad_por_dia_semana,
                        COUNT(DISTINCT v.fecha) as dias_de_este_dia_semana
                    FROM ventas_raw v
                    WHERE {where_clause}
                    GROUP BY v.codigo_producto, v.dia_semana
                ),
                promedio_dia_semana AS (
                    SELECT
                        codigo_producto,
                        AVG(cantidad_por_dia_semana / NULLIF(dias_de_este_dia_semana, 0)) as promedio_mismo_dia
                    FROM por_dia_semana
                    GROUP BY codigo_producto
                ),
                totales AS (
                    SELECT SUM(cantidad_total) as gran_total
                    FROM periodo_actual
                )
                SELECT
                    pa.codigo_producto,
                    pa.descripcion_producto,
                    pa.categoria_producto,
                    pa.cantidad_total,
                    pa.cantidad_total / NULLIF(pa.dias_distintos, 0) as promedio_diario,
                    COALESCE(pds.promedio_mismo_dia, 0) as promedio_mismo_dia_semana,
                    NULL as comparacion_ano_anterior,
                    (pa.cantidad_total / NULLIF(t.gran_total, 0) * 100) as porcentaje_total,
                    pa.cantidad_bultos_promedio as cantidad_bultos,
                    pa.cantidad_total / NULLIF(pa.cantidad_bultos_promedio, 0) as total_bultos,
                    (pa.cantidad_total / NULLIF(pa.dias_distintos, 0)) / NULLIF(pa.cantidad_bultos_promedio, 0) as promedio_bultos_diario
                FROM periodo_actual pa
                CROSS JOIN totales t
                LEFT JOIN promedio_dia_semana pds ON pa.codigo_producto = pds.codigo_producto
            """

            # Añadir ORDER BY según sort_by
            if sort_by == 'cantidad_total':
                order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                query += f" ORDER BY pa.cantidad_total {order_direction}, pa.descripcion_producto"
            elif sort_by == 'promedio_diario':
                order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                query += f" ORDER BY promedio_diario {order_direction}, pa.descripcion_producto"
            elif sort_by == 'categoria':
                order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                query += f" ORDER BY pa.categoria_producto {order_direction}, pa.descripcion_producto"
            elif sort_by == 'porcentaje_total':
                order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                query += f" ORDER BY porcentaje_total {order_direction}, pa.descripcion_producto"
            else:
                # Orden por defecto: mayor cantidad vendida primero
                query += " ORDER BY pa.cantidad_total DESC, pa.descripcion_producto"

            # Añadir LIMIT y OFFSET para paginación
            query += f" LIMIT {page_size} OFFSET {offset}"

            # Construir lista de parámetros:
            # params para count, params para periodo_actual, params para por_dia_semana
            all_params = params.copy()  # Para periodo_actual
            all_params.extend(params.copy())  # Para por_dia_semana (mismos parámetros)

            result = conn.execute(query, all_params).fetchall()

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
            if is_postgres_mode():
                # PostgreSQL v2.0: Obtener categorías desde tabla productos
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
            else:
                # DuckDB (legacy)
                result = conn.execute("""
                    SELECT DISTINCT categoria_producto
                    FROM ventas_raw
                    WHERE categoria_producto IS NOT NULL
                    ORDER BY categoria_producto
                """).fetchall()
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
            # PostgreSQL v2.0
            if is_postgres_mode():
                cursor = conn.cursor()

                # Obtener información del producto desde tabla productos
                cursor.execute("""
                    SELECT codigo, descripcion, categoria
                    FROM productos
                    WHERE codigo = %s
                """, [codigo_producto])
                producto_info = cursor.fetchone()

                if not producto_info:
                    cursor.close()
                    raise HTTPException(status_code=404, detail="Producto no encontrado")

                # Obtener ventas diarias por tienda
                # En PostgreSQL v2.0, cantidad_vendida ya está en unidades
                # No tenemos cantidad_bultos, así que usamos cantidad_vendida directamente
                # Agrupamos solo por ubicacion_id y hacemos JOIN con ubicaciones para obtener nombre real
                ventas_query = """
                    SELECT
                        v.fecha_venta::date as fecha,
                        v.ubicacion_id,
                        COALESCE(u.nombre, v.ubicacion_id) as ubicacion_nombre,
                        SUM(v.cantidad_vendida) as total_bultos,
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

                cursor.execute(ventas_query, [codigo_producto, fecha_inicio, fecha_fin])
                ventas_result = cursor.fetchall()
                cursor.close()

            else:
                # DuckDB (legacy)
                # Obtener información del producto
                producto_info = conn.execute("""
                    SELECT DISTINCT
                        codigo_producto,
                        descripcion_producto,
                        categoria_producto
                    FROM ventas_raw
                    WHERE codigo_producto = ?
                    LIMIT 1
                """, [codigo_producto]).fetchone()

                if not producto_info:
                    raise HTTPException(status_code=404, detail="Producto no encontrado")

                # Obtener ventas diarias por tienda
                # Calcular bultos correctamente: cantidad_vendida / cantidad_bultos
                # cantidad_bultos representa las unidades por bulto para ese producto
                ventas_query = """
                    SELECT
                        TRY_CAST(fecha AS DATE) as fecha,
                        ubicacion_id,
                        ubicacion_nombre,
                        SUM(TRY_CAST(cantidad_vendida AS DOUBLE) / NULLIF(TRY_CAST(cantidad_bultos AS DOUBLE), 0)) as total_bultos,
                        SUM(TRY_CAST(cantidad_vendida AS DOUBLE)) as total_unidades,
                        SUM(TRY_CAST(venta_total AS DOUBLE)) as venta_total
                    FROM ventas_raw
                    WHERE codigo_producto = ?
                        AND TRY_CAST(fecha AS DATE) BETWEEN ? AND ?
                        AND TRY_CAST(cantidad_vendida AS DOUBLE) > 0
                        AND TRY_CAST(cantidad_bultos AS DOUBLE) > 0
                    GROUP BY fecha, ubicacion_id, ubicacion_nombre
                    ORDER BY fecha, ubicacion_id
                """

                ventas_result = conn.execute(ventas_query, [
                    codigo_producto,
                    fecha_inicio,
                    fecha_fin
                ]).fetchall()

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

                ventas_por_fecha[fecha_str][ubicacion_id] = {
                    "tienda": ubicacion_nombre,
                    "bultos": bultos_val,
                    "unidades": float(unidades) if unidades else 0,
                    "venta_total": float(venta) if venta else 0
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
                for fecha in sorted(ventas_por_fecha.keys()):
                    if tienda_id in ventas_por_fecha[fecha]:
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
    Calcula el forecast PMP (Promedio Móvil Ponderado) para un producto en una ubicación específica.

    Retorna proyección diaria de ventas para los próximos N días basado en:
    - Promedios por día de la semana (últimas 8 semanas)
    - Ajustes de estacionalidad y tendencia
    """
    try:
        with ForecastPMP(str(DB_PATH)) as forecaster:
            resultado = forecaster.calcular_forecast_diario(
                ubicacion_id=ubicacion_id,
                codigo_producto=codigo_producto,
                dias_adelante=dias_adelante
            )

            if not resultado or not resultado.get("forecasts"):
                return {
                    "ubicacion_id": ubicacion_id,
                    "codigo_producto": codigo_producto,
                    "forecasts": [],
                    "dias_excluidos": 0,
                    "mensaje": "No hay datos históricos suficientes para calcular forecast"
                }

            return {
                "ubicacion_id": ubicacion_id,
                "codigo_producto": codigo_producto,
                "dias_adelante": dias_adelante,
                "forecasts": resultado.get("forecasts", []),
                "dias_excluidos": resultado.get("dias_excluidos", 0),
                "metodo": resultado.get("metodo", "PMP")
            }

    except Exception as e:
        logger.error(f"Error calculando forecast PMP: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculando forecast: {str(e)}")


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
            # Obtener la fecha máxima disponible en ventas
            fecha_max_result = conn.execute("SELECT MAX(fecha) FROM ventas_raw").fetchone()
            fecha_max = fecha_max_result[0] if fecha_max_result else None

            if not fecha_max:
                return {"ventas": []}

            # Calcular fecha inicial (20 días atrás)
            query = """
                SELECT
                    fecha,
                    dia_semana,
                    SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_vendida
                FROM ventas_raw
                WHERE codigo_producto = ?
                    AND ubicacion_id = ?
                    AND fecha >= CAST(CAST(? AS DATE) - INTERVAL 20 DAY AS VARCHAR)
                    AND fecha <= ?
                GROUP BY fecha, dia_semana
                ORDER BY fecha ASC
            """

            result = conn.execute(query, [codigo_producto, ubicacion_id, fecha_max, fecha_max]).fetchall()

            ventas = []
            for row in result:
                ventas.append({
                    "fecha": row[0],
                    "dia_semana": row[1],
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
            if is_postgres_mode():
                # PostgreSQL v2.0: tabla ventas
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
            else:
                # DuckDB (legacy) - no implementado para transacciones
                return {
                    "transacciones": [],
                    "pagination": {
                        "total_items": 0,
                        "total_pages": 0,
                        "current_page": 1,
                        "page_size": page_size,
                        "has_next": False,
                        "has_previous": False
                    },
                    "totales": {
                        "total_cantidad": 0,
                        "total_venta": 0,
                        "total_costo": 0,
                        "total_utilidad": 0,
                        "total_facturas": 0
                    },
                    "filtros": {
                        "codigo_producto": codigo_producto,
                        "ubicacion_id": ubicacion_id,
                        "fecha_inicio": fecha_inicio,
                        "fecha_fin": fecha_fin
                    },
                    "error": "Transacciones solo disponibles en PostgreSQL v2.0"
                }

    except Exception as e:
        logger.error(f"Error obteniendo transacciones de producto: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo transacciones: {str(e)}")


# ========== ENDPOINTS PEDIDOS SUGERIDOS ==========

@app.post("/api/pedidos-sugeridos/calcular", response_model=List[ProductoPedidoSugerido], tags=["Pedidos Sugeridos"])
async def calcular_pedido_sugerido(request: CalcularPedidoRequest):
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

@app.post("/api/pedidos-sugeridos", response_model=PedidoGuardadoResponse, tags=["Pedidos Sugeridos"])
async def guardar_pedido_sugerido(request: GuardarPedidoRequest):
    """
    Guarda un pedido sugerido en la base de datos.
    """
    try:
        logger.info(f"💾 Guardando pedido: CEDI {request.cedi_origen} → Tienda {request.tienda_destino}")

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


# ======================================================================================
# ENDPOINTS - ALERTAS Y CAMBIOS DE CLASIFICACIÓN
# ======================================================================================

@app.get("/api/alertas/cambios-clasificacion", tags=["Alertas"])
async def get_alertas_cambios(
    ubicacion_id: Optional[str] = None,
    solo_pendientes: bool = True,
    solo_criticas: bool = False,
    dias: int = 30,
    limit: int = 100
):
    """
    Obtiene alertas de cambios de clasificación ABC-XYZ.

    Args:
        ubicacion_id: Filtrar por tienda específica
        solo_pendientes: Solo alertas no revisadas
        solo_criticas: Solo alertas críticas
        dias: Ventana de tiempo en días
        limit: Número máximo de resultados
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        conditions = [f"fecha_cambio >= CURRENT_TIMESTAMP - INTERVAL '{dias} days'"]

        if ubicacion_id:
            conditions.append(f"ubicacion_id = '{ubicacion_id}'")

        if solo_pendientes:
            conditions.append("revisado = false")

        if solo_criticas:
            conditions.append("es_critico = true")

        where_clause = " AND ".join(conditions)

        query = f"""
            SELECT
                a.id,
                a.codigo_producto,
                p.descripcion as producto_descripcion,
                p.categoria,
                p.marca,
                a.ubicacion_id,
                a.tipo_cambio,
                a.cambio_clasificacion,
                a.clasificacion_anterior,
                a.clasificacion_nueva,
                a.fecha_cambio,
                a.es_critico,
                a.nivel_prioridad,
                a.valor_anterior,
                a.valor_nuevo,
                a.cambio_porcentual,
                a.ranking_anterior,
                a.ranking_nuevo,
                a.matriz_anterior,
                a.matriz_nueva,
                a.cv_anterior,
                a.cv_nuevo,
                a.accion_recomendada,
                a.revisado,
                a.revisado_por,
                a.revisado_fecha,
                a.notas
            FROM alertas_cambio_clasificacion a
            LEFT JOIN productos p ON a.codigo_producto = p.codigo
            WHERE {where_clause}
            ORDER BY
                CASE a.nivel_prioridad
                    WHEN 'ALTA' THEN 1
                    WHEN 'MEDIA' THEN 2
                    WHEN 'BAJA' THEN 3
                END,
                a.fecha_cambio DESC
            LIMIT {limit}
        """

        result = conn.execute(query).fetchall()
        columns = [desc[0] for desc in conn.description]

        alertas = [dict(zip(columns, row)) for row in result]

        # Estadísticas
        stats_query = f"""
            SELECT
                COUNT(*) as total,
                COUNT(CASE WHEN es_critico THEN 1 END) as criticas,
                COUNT(CASE WHEN nivel_prioridad = 'ALTA' THEN 1 END) as alta_prioridad,
                COUNT(CASE WHEN revisado = false THEN 1 END) as pendientes,
                COUNT(CASE WHEN tipo_cambio = 'ABC' THEN 1 END) as cambios_abc,
                COUNT(CASE WHEN tipo_cambio = 'XYZ' THEN 1 END) as cambios_xyz
            FROM alertas_cambio_clasificacion
            WHERE {where_clause}
        """

        stats = conn.execute(stats_query).fetchone()

        conn.close()

        return {
            "success": True,
            "alertas": alertas,
            "total": len(alertas),
            "estadisticas": {
                "total_en_periodo": stats[0],
                "criticas": stats[1],
                "alta_prioridad": stats[2],
                "pendientes": stats[3],
                "cambios_abc": stats[4],
                "cambios_xyz": stats[5]
            }
        }

    except Exception as e:
        logger.error(f"Error obteniendo alertas: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/alertas/resumen-tiendas", tags=["Alertas"])
async def get_resumen_alertas_tiendas(dias: int = 30):
    """
    Obtiene resumen de alertas agrupadas por tienda.
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        query = f"""
            SELECT
                ubicacion_id,
                COUNT(*) as total_alertas,
                COUNT(CASE WHEN es_critico THEN 1 END) as alertas_criticas,
                COUNT(CASE WHEN nivel_prioridad = 'ALTA' THEN 1 END) as prioridad_alta,
                COUNT(CASE WHEN nivel_prioridad = 'MEDIA' THEN 1 END) as prioridad_media,
                COUNT(CASE WHEN nivel_prioridad = 'BAJA' THEN 1 END) as prioridad_baja,
                COUNT(CASE WHEN revisado = false THEN 1 END) as pendientes_revision,
                COUNT(CASE WHEN tipo_cambio = 'ABC' THEN 1 END) as cambios_abc,
                COUNT(CASE WHEN tipo_cambio = 'XYZ' THEN 1 END) as cambios_xyz,
                MAX(fecha_cambio) as ultima_alerta
            FROM alertas_cambio_clasificacion
            WHERE fecha_cambio >= CURRENT_TIMESTAMP - INTERVAL '{dias} days'
            GROUP BY ubicacion_id
            ORDER BY pendientes_revision DESC, alertas_criticas DESC
        """

        result = conn.execute(query).fetchall()
        columns = [desc[0] for desc in conn.description]

        resumen = [dict(zip(columns, row)) for row in result]

        conn.close()

        return {
            "success": True,
            "resumen": resumen,
            "total_tiendas": len(resumen)
        }

    except Exception as e:
        logger.error(f"Error obteniendo resumen por tiendas: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/alertas/{alerta_id}/revisar", tags=["Alertas"])
async def marcar_alerta_revisada(
    alerta_id: str,
    notas: Optional[str] = None,
    current_user: Usuario = Depends(verify_token)
):
    """
    Marca una alerta como revisada.

    Requiere autenticación.
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Verificar que existe la alerta
        existe = conn.execute(
            "SELECT COUNT(*) FROM alertas_cambio_clasificacion WHERE id = ?",
            [alerta_id]
        ).fetchone()[0]

        if existe == 0:
            raise HTTPException(status_code=404, detail="Alerta no encontrada")

        # Actualizar
        conn.execute("""
            UPDATE alertas_cambio_clasificacion
            SET
                revisado = true,
                revisado_por = ?,
                revisado_fecha = CURRENT_TIMESTAMP,
                notas = COALESCE(?, notas)
            WHERE id = ?
        """, [current_user.email, notas, alerta_id])

        conn.close()

        return {
            "success": True,
            "message": "Alerta marcada como revisada",
            "alerta_id": alerta_id,
            "revisado_por": current_user.email
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marcando alerta como revisada: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/productos/{codigo}/historico-abc-xyz", tags=["Productos"])
async def get_historico_abc_xyz_completo(
    codigo: str,
    ubicacion_id: Optional[str] = None,
    limit: int = 50
):
    """
    Obtiene el histórico completo de clasificaciones ABC y XYZ de un producto.

    Args:
        codigo: Código del producto
        ubicacion_id: Filtrar por tienda (opcional)
        limit: Número máximo de registros históricos
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Construir condiciones
        conditions = ["codigo_producto = ?"]
        params = [codigo]

        if ubicacion_id:
            conditions.append("ubicacion_id = ?")
            params.append(ubicacion_id)

        where_clause = " AND ".join(conditions)

        # Obtener histórico
        query = f"""
            SELECT
                fecha_calculo,
                ubicacion_id,
                periodo_analisis,
                fecha_inicio,
                fecha_fin,
                clasificacion_abc_valor,
                valor_consumo_total,
                ranking_valor,
                porcentaje_valor,
                porcentaje_acumulado
            FROM productos_abc_v2_historico
            WHERE {where_clause}
            ORDER BY fecha_calculo DESC
            LIMIT {limit}
        """

        result = conn.execute(query, params).fetchall()
        columns = [desc[0] for desc in conn.description]

        historico = [dict(zip(columns, row)) for row in result]

        # Obtener clasificación actual
        query_actual = f"""
            SELECT
                fecha_calculo,
                ubicacion_id,
                clasificacion_abc_valor,
                clasificacion_xyz,
                matriz_abc_xyz,
                valor_consumo_total,
                ranking_valor,
                coeficiente_variacion,
                demanda_promedio_semanal
            FROM productos_abc_v2
            WHERE {where_clause}
        """

        actual_result = conn.execute(query_actual, params).fetchall()
        actual_columns = [desc[0] for desc in conn.description]

        clasificacion_actual = [dict(zip(actual_columns, row)) for row in actual_result]

        conn.close()

        return {
            "success": True,
            "codigo_producto": codigo,
            "clasificacion_actual": clasificacion_actual,
            "historico": historico,
            "total_registros": len(historico)
        }

    except Exception as e:
        logger.error(f"Error obteniendo histórico ABC-XYZ: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)