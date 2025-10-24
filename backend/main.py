#!/usr/bin/env python3
"""
FastAPI Backend para Fluxion AI - La Granja Mercado
Conecta con DuckDB para servir datos de inventario en tiempo real
"""

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import duckdb
from pathlib import Path
from datetime import datetime, date, timedelta
import logging
import subprocess
import asyncio
import os
from contextlib import contextmanager
from forecast_pmp import ForecastPMP

# Sentry para monitoreo de errores
from sentry_config import init_sentry

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

    try:
        auto_bootstrap_admin()
    except Exception as e:
        logger.error(f"⚠️  Auto-bootstrap failed: {e}")

    # Inicializar scheduler de ventas automáticas
    try:
        db_path = Path(__file__).parent.parent / "data" / "fluxion_production.db"
        ventas_scheduler = VentasETLScheduler(
            db_path=str(db_path),
            execution_hour=5,  # 5:00 AM
            execution_minute=0
        )

        # Registrar callback para ejecutar ETL
        ventas_scheduler.set_etl_callback(run_etl_ventas_for_scheduler)

        # Iniciar scheduler
        ventas_scheduler.start()

        logger.info("✅ Ventas ETL Scheduler iniciado - Ejecución diaria: 5:00 AM")
    except Exception as e:
        logger.error(f"⚠️  Error iniciando scheduler de ventas: {e}")

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

# Configuración de la base de datos
DB_PATH = Path(os.getenv('DATABASE_PATH', str(Path(__file__).parent.parent / "data" / "fluxion_production.db")))

@contextmanager
def get_db_connection():
    """
    Context manager para conexiones DuckDB READ-ONLY (para queries de lectura)
    Permite múltiples lectores simultáneos y no bloquea ETL
    """
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Base de datos no encontrada")

    conn = None
    try:
        # Conexión read-only: permite múltiples lectores y no bloquea ETL
        conn = duckdb.connect(str(DB_PATH), read_only=True)
        yield conn
    finally:
        if conn:
            conn.close()

@contextmanager
def get_db_connection_write():
    """
    Context manager para conexiones DuckDB READ-WRITE (para escrituras)
    Solo usar cuando realmente necesites INSERT/UPDATE/DELETE
    """
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Base de datos no encontrada")

    conn = None
    try:
        # Conexión read-write: solo para operaciones de escritura
        conn = duckdb.connect(str(DB_PATH), read_only=False)
        yield conn
    finally:
        if conn:
            conn.close()

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

@app.post("/api/auth/init-db", tags=["Autenticación"])
async def init_database():
    """
    Inicializa la tabla usuarios si no existe
    Endpoint temporal para setup inicial de BD
    """
    try:
        # Usar conexión de escritura para CREATE TABLE
        with get_db_connection_write() as conn:
            # Crear tabla usuarios
            conn.execute("""
                CREATE TABLE IF NOT EXISTS usuarios (
                    id VARCHAR PRIMARY KEY,
                    username VARCHAR UNIQUE NOT NULL,
                    password_hash VARCHAR NOT NULL,
                    nombre_completo VARCHAR,
                    email VARCHAR,
                    activo BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ultimo_login TIMESTAMP
                )
            """)

            logger.info("Tabla usuarios creada/verificada exitosamente")

            # Check if admin user already exists
            existing = conn.execute("SELECT COUNT(*) FROM usuarios WHERE username = 'admin'").fetchone()[0]

            if existing == 0:
                # Create admin user using the create_user function
                admin_user = create_user(
                    username="admin",
                    password="admin123",
                    nombre_completo="Administrador",
                    email="admin@fluxion.ai"
                )
                logger.info("Usuario admin creado exitosamente")
                return {"message": "Database initialized and admin user created successfully", "username": "admin"}
            else:
                logger.info("Usuario admin ya existe")
                return {"message": "Database initialized successfully (admin already exists)", "username": "admin"}

    except Exception as e:
        logger.error(f"Error en init-db: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error inicializando BD: {str(e)}"
        )

@app.post("/api/auth/bootstrap-admin", response_model=Usuario, tags=["Autenticación"])
async def bootstrap_admin():
    """
    Endpoint temporal para crear usuario admin inicial
    SOLO FUNCIONA SI NO HAY USUARIOS EN LA BD
    """
    try:
        # Verificar con read-only connection
        with get_db_connection() as conn:
            count = conn.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0]

        if count > 0:
            raise HTTPException(
                status_code=403,
                detail="Ya existen usuarios en el sistema. Use /api/auth/register para crear nuevos usuarios."
            )

        # Crear usuario admin (create_user ya usa write connection)
        admin_user = create_user(
            username="admin",
            password="admin123",
            nombre_completo="Administrador",
            email="admin@fluxion.ai"
        )

        logger.info("Usuario admin creado via bootstrap")
        return admin_user

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en bootstrap-admin: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error creando usuario admin: {str(e)}"
        )

# =====================================================================================
# ENDPOINTS DE DATOS (PROTEGIDOS)
# =====================================================================================

@app.get("/api/ubicaciones", response_model=List[UbicacionResponse], tags=["Ubicaciones"])
async def get_ubicaciones(tipo: Optional[str] = None):
    """Obtiene todas las ubicaciones (tiendas y CEDIs) desde inventario_raw (datos reales)"""
    try:
        with get_db_connection() as conn:
            # Query desde inventario_raw para obtener solo las ubicaciones con datos reales
            # Excluye mayorista según instrucciones
            query = """
                SELECT DISTINCT
                    ubicacion_id as id,
                    SUBSTRING(ubicacion_id, 1, 3) as codigo,
                    ubicacion_nombre as nombre,
                    tipo_ubicacion as tipo,
                    NULL as region,
                    NULL as ciudad,
                    NULL as superficie_m2,
                    true as activo
                FROM inventario_raw
                WHERE activo = true
                    AND tipo_ubicacion != 'mayorista'
            """

            if tipo:
                query += " AND tipo_ubicacion = ?"

            query += " ORDER BY tipo_ubicacion, ubicacion_nombre"

            result = conn.execute(query, [tipo] if tipo else []).fetchall()

            ubicaciones = []
            for row in result:
                ubicaciones.append(UbicacionResponse(
                    id=row[0],
                    codigo=row[1],
                    nombre=row[2],
                    tipo=row[3],
                    region=row[4],
                    ciudad=row[5],
                    superficie_m2=row[6],
                    activo=row[7]
                ))

            return ubicaciones

    except Exception as e:
        logger.error(f"Error obteniendo ubicaciones: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/ubicaciones/summary", response_model=List[UbicacionSummaryResponse], tags=["Ubicaciones"])
async def get_ubicaciones_summary():
    """Obtiene un resumen de inventario por ubicación"""
    try:
        with get_db_connection() as conn:
            query = """
                SELECT
                    inv.ubicacion_id,
                    inv.ubicacion_nombre,
                    inv.tipo_ubicacion,
                    COUNT(DISTINCT inv.codigo_producto) as total_productos,
                    SUM(CASE WHEN inv.cantidad_actual = 0 THEN 1 ELSE 0 END) as stock_cero,
                    SUM(CASE WHEN inv.cantidad_actual < 0 THEN 1 ELSE 0 END) as stock_negativo,
                    CAST(MAX(inv.fecha_extraccion) AS VARCHAR) as ultima_actualizacion
                FROM inventario_raw inv
                WHERE inv.activo = true
                    AND inv.tipo_ubicacion != 'mayorista'
                GROUP BY inv.ubicacion_id, inv.ubicacion_nombre, inv.tipo_ubicacion
                ORDER BY inv.tipo_ubicacion, inv.ubicacion_nombre
            """

            result = conn.execute(query).fetchall()

            summary = []
            for row in result:
                summary.append(UbicacionSummaryResponse(
                    ubicacion_id=row[0],
                    ubicacion_nombre=row[1],
                    tipo_ubicacion=row[2],
                    total_productos=row[3],
                    stock_cero=row[4],
                    stock_negativo=row[5],
                    ultima_actualizacion=row[6]
                ))

            return summary

    except Exception as e:
        logger.error(f"Error obteniendo resumen de ubicaciones: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/ubicaciones/{ubicacion_id}/stock-params", tags=["Ubicaciones"])
async def get_stock_params(ubicacion_id: str):
    """Obtiene los parámetros de stock para una tienda específica"""
    try:
        from tiendas_config import TIENDAS_CONFIG

        # Buscar configuración de la tienda
        tienda_config = TIENDAS_CONFIG.get(ubicacion_id)

        if not tienda_config:
            # Valores por defecto si no se encuentra la tienda
            return {
                "ubicacion_id": ubicacion_id,
                "stock_min_mult_a": 2.0,
                "stock_min_mult_ab": 2.0,
                "stock_min_mult_b": 3.0,
                "stock_min_mult_bc": 9.0,
                "stock_min_mult_c": 15.0,
                "stock_seg_mult_a": 1.0,
                "stock_seg_mult_ab": 2.5,
                "stock_seg_mult_b": 2.0,
                "stock_seg_mult_bc": 3.0,
                "stock_seg_mult_c": 7.0,
                "stock_max_mult_a": 5.0,
                "stock_max_mult_ab": 7.0,
                "stock_max_mult_b": 12.0,
                "stock_max_mult_bc": 17.0,
                "stock_max_mult_c": 26.0
            }

        return {
            "ubicacion_id": ubicacion_id,
            "stock_min_mult_a": tienda_config.stock_min_mult_a,
            "stock_min_mult_ab": tienda_config.stock_min_mult_ab,
            "stock_min_mult_b": tienda_config.stock_min_mult_b,
            "stock_min_mult_bc": tienda_config.stock_min_mult_bc,
            "stock_min_mult_c": tienda_config.stock_min_mult_c,
            "stock_seg_mult_a": tienda_config.stock_seg_mult_a,
            "stock_seg_mult_ab": tienda_config.stock_seg_mult_ab,
            "stock_seg_mult_b": tienda_config.stock_seg_mult_b,
            "stock_seg_mult_bc": tienda_config.stock_seg_mult_bc,
            "stock_seg_mult_c": tienda_config.stock_seg_mult_c,
            "stock_max_mult_a": tienda_config.stock_max_mult_a,
            "stock_max_mult_ab": tienda_config.stock_max_mult_ab,
            "stock_max_mult_b": tienda_config.stock_max_mult_b,
            "stock_max_mult_bc": tienda_config.stock_max_mult_bc,
            "stock_max_mult_c": tienda_config.stock_max_mult_c
        }

    except Exception as e:
        logger.error(f"Error obteniendo parámetros de stock: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/productos", response_model=List[ProductoResponse], tags=["Productos"])
async def get_productos(categoria: Optional[str] = None, activo: bool = True):
    """Obtiene todos los productos"""
    try:
        with get_db_connection() as conn:
            query = """
                SELECT p.id, p.codigo, p.descripcion, p.categoria, p.marca,
                       p.presentacion, p.precio_venta, p.costo_promedio, p.activo
                FROM productos p
                WHERE p.activo = ?
            """
            params = [activo]

            if categoria:
                query += " AND p.categoria = ?"
                params.append(categoria)

            query += " ORDER BY p.categoria, p.descripcion"

            result = conn.execute(query, params).fetchall()

            productos = []
            for row in result:
                productos.append(ProductoResponse(
                    id=row[0],
                    codigo=row[1],
                    descripcion=row[2],
                    categoria=row[3],
                    marca=row[4],
                    presentacion=row[5],
                    precio_venta=row[6],
                    costo_promedio=row[7],
                    activo=row[8]
                ))

            return productos

    except Exception as e:
        logger.error(f"Error obteniendo productos: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/categorias", tags=["Productos"])
async def get_categorias():
    """Obtiene todas las categorías de productos desde inventario_raw"""
    try:
        with get_db_connection() as conn:
            result = conn.execute("""
                SELECT DISTINCT categoria
                FROM inventario_raw
                WHERE activo = true
                    AND categoria IS NOT NULL
                    AND tipo_ubicacion != 'mayorista'
                ORDER BY categoria
            """).fetchall()

            return [row[0] for row in result]

    except Exception as e:
        logger.error(f"Error obteniendo categorías: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/stock", response_model=PaginatedStockResponse, tags=["Inventario"])
async def get_stock(
    ubicacion_id: Optional[str] = None,
    categoria: Optional[str] = None,
    estado: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = 'desc'
):
    """
    Obtiene el estado del stock desde inventario_raw con paginación server-side

    Args:
        ubicacion_id: Filtrar por ID de ubicación
        categoria: Filtrar por categoría
        estado: Filtrar por estado de stock
        page: Número de página (inicia en 1)
        page_size: Cantidad de items por página (máx 500)
        search: Buscar por código o descripción de producto
        sort_by: Campo por el cual ordenar (stock, categoria, estado)
        sort_order: Orden ascendente (asc) o descendente (desc)
    """
    try:
        # Validar parámetros de paginación
        if page < 1:
            raise HTTPException(status_code=400, detail="El número de página debe ser >= 1")
        if page_size < 1 or page_size > 500:
            raise HTTPException(status_code=400, detail="page_size debe estar entre 1 y 500")

        with get_db_connection() as conn:
            # Query base para contar total de registros
            count_query = """
                SELECT COUNT(*)
                FROM inventario_raw inv
                WHERE inv.activo = true
            """

            # Query principal
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

            params = []

            # Aplicar filtros
            if ubicacion_id:
                query += " AND inv.ubicacion_id = ?"
                count_query += " AND inv.ubicacion_id = ?"
                params.append(ubicacion_id)

            if categoria:
                query += " AND inv.categoria = ?"
                count_query += " AND inv.categoria = ?"
                params.append(categoria)

            if estado:
                query += " AND inv.estado_stock = ?"
                count_query += " AND inv.estado_stock = ?"
                params.append(estado)

            if search:
                search_term = f"%{search}%"
                query += " AND (inv.codigo_producto ILIKE ? OR inv.descripcion_producto ILIKE ?)"
                count_query += " AND (inv.codigo_producto ILIKE ? OR inv.descripcion_producto ILIKE ?)"
                params.append(search_term)
                params.append(search_term)

            # Obtener total de registros
            total_items = conn.execute(count_query, params).fetchone()[0]

            # Calcular estadísticas de stock (stock en cero y stock negativo)
            stats_query = """
                SELECT
                    SUM(CASE WHEN inv.cantidad_actual = 0 THEN 1 ELSE 0 END) as stock_cero,
                    SUM(CASE WHEN inv.cantidad_actual < 0 THEN 1 ELSE 0 END) as stock_negativo
                FROM inventario_raw inv
                WHERE inv.activo = true
            """

            # Aplicar los mismos filtros que en count_query
            stats_params = []
            if ubicacion_id:
                stats_query += " AND inv.ubicacion_id = ?"
                stats_params.append(ubicacion_id)
            if categoria:
                stats_query += " AND inv.categoria = ?"
                stats_params.append(categoria)
            if estado:
                stats_query += " AND inv.estado_stock = ?"
                stats_params.append(estado)
            if search:
                search_term = f"%{search}%"
                stats_query += " AND (inv.codigo_producto ILIKE ? OR inv.descripcion_producto ILIKE ?)"
                stats_params.append(search_term)
                stats_params.append(search_term)

            stats_result = conn.execute(stats_query, stats_params).fetchone()
            stock_cero = stats_result[0] if stats_result[0] is not None else 0
            stock_negativo = stats_result[1] if stats_result[1] is not None else 0

            # Calcular paginación
            total_pages = (total_items + page_size - 1) // page_size  # Ceiling division
            offset = (page - 1) * page_size

            # Agregar ORDER BY según sort_by
            if sort_by == 'stock':
                order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                # Ordenar por bultos (cantidad_actual / cantidad_bultos)
                # Si no tiene bultos, usar cantidad_actual directamente
                query += f" ORDER BY (CASE WHEN inv.cantidad_bultos > 0 THEN inv.cantidad_actual / inv.cantidad_bultos ELSE inv.cantidad_actual END) {order_direction}, inv.descripcion_producto"
            elif sort_by == 'peso':
                order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                # Ordenar por peso total en kg (cantidad_actual * peso_producto)
                query += f" ORDER BY (inv.cantidad_actual * inv.peso_producto) {order_direction} NULLS LAST, inv.descripcion_producto"
            elif sort_by == 'categoria':
                order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                query += f" ORDER BY inv.categoria {order_direction}, inv.descripcion_producto"
            elif sort_by == 'estado':
                order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                query += f" ORDER BY inv.estado_stock {order_direction}, inv.descripcion_producto"
            else:
                # Orden por defecto
                query += " ORDER BY inv.tipo_ubicacion, inv.ubicacion_nombre, inv.categoria, inv.descripcion_producto"

            query += f" LIMIT {page_size} OFFSET {offset}"

            result = conn.execute(query, params).fetchall()

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
    """Obtiene resumen de ventas por ubicación"""
    try:
        with get_db_connection() as conn:
            query = """
                SELECT
                    v.ubicacion_id,
                    v.ubicacion_nombre,
                    'tienda' as tipo_ubicacion,
                    COUNT(DISTINCT v.numero_factura) as total_transacciones,
                    COUNT(DISTINCT v.codigo_producto) as productos_unicos,
                    CAST(SUM(CAST(v.cantidad_vendida AS DECIMAL)) AS INTEGER) as unidades_vendidas,
                    MAX(v.fecha) as ultima_venta
                FROM ventas_raw v
                GROUP BY v.ubicacion_id, v.ubicacion_nombre
                ORDER BY v.ubicacion_nombre
            """

            result = conn.execute(query).fetchall()

            return [
                VentasSummaryResponse(
                    ubicacion_id=row[0],
                    ubicacion_nombre=row[1],
                    tipo_ubicacion=row[2],
                    total_transacciones=row[3],
                    productos_unicos=row[4],
                    unidades_vendidas=row[5],
                    ultima_venta=row[6]
                )
                for row in result
            ]

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

            productos = []
            for row in result:
                # Desempaquetar datos de los índices calculados (32-34 - ajustado por cuadrante)
                prom_diario = float(row[32]) if row[32] else 0
                cantidad_bultos = float(row[33]) if row[33] else 1
                stock_total = float(row[34]) if row[34] else 0
                stock_minimo = float(row[29]) if row[29] else 10
                stock_maximo = float(row[30]) if row[30] else 100
                punto_reorden = float(row[31]) if row[31] else 30
                pronostico_unid = float(row[18]) if row[18] else 0

                # Calcular cantidad sugerida
                stock_seguridad = stock_minimo * 1.5

                # Lógica de pedido
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

                # Clasificación ABC basada en promedio de ventas
                if prom_diario >= 10:
                    clasificacion = "A"
                elif prom_diario >= 3:
                    clasificacion = "B"
                else:
                    clasificacion = "C"

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
                    cuadrante_producto=row[9],
                    # Ventas - actualizados índices (+1 por cuadrante)
                    prom_ventas_5dias_unid=float(row[10]) if row[10] else 0,
                    prom_ventas_20dias_unid=float(row[11]) if row[11] else 0,
                    prom_mismo_dia_unid=float(row[12]) if row[12] else 0,
                    prom_ventas_8sem_unid=float(row[13]) if row[13] else 0,
                    prom_ventas_8sem_bultos=float(row[14]) if row[14] else 0,
                    prom_ventas_3dias_unid=float(row[15]) if row[15] else 0,
                    prom_ventas_3dias_bultos=float(row[16]) if row[16] else 0,
                    prom_mismo_dia_bultos=float(row[17]) if row[17] else 0,
                    pronostico_3dias_unid=float(row[18]) if row[18] else 0,
                    pronostico_3dias_bultos=float(row[19]) if row[19] else 0,
                    # Inventario
                    stock_tienda=float(row[20]) if row[20] else 0,
                    stock_en_transito=float(row[21]) if row[21] else 0,
                    stock_total=float(row[22]) if row[22] else 0,
                    stock_total_bultos=float(row[23]) if row[23] else 0,
                    stock_dias_cobertura=float(row[24]) if row[24] else 0,
                    stock_cedi_seco=float(row[25]) if row[25] else 0,
                    stock_cedi_frio=float(row[26]) if row[26] else 0,
                    stock_cedi_verde=float(row[27]) if row[27] else 0,
                    stock_cedi_origen=float(row[28]) if row[28] else 0,
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
                request.tienda_destino, request.tienda_destino_nombre, 'borrador',
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

            logger.info(f"✅ Pedido guardado: {numero_pedido} con {total_productos} productos, {total_bultos} bultos")

            return PedidoGuardadoResponse(
                id=pedido_id,
                numero_pedido=numero_pedido,
                estado='borrador',
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)