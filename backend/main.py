#!/usr/bin/env python3
"""
FastAPI Backend para Fluxion AI - La Granja Mercado
Conecta con DuckDB para servir datos de inventario en tiempo real
"""

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import duckdb
from pathlib import Path
from datetime import datetime, date
import logging
import subprocess
import asyncio

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuración de la aplicación
app = FastAPI(
    title="Fluxion AI - La Granja Mercado API",
    description="API para gestión de inventarios en tiempo real",
    version="1.0.0"
)

# Configurar CORS para el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuración de la base de datos
import os
DB_PATH = Path(os.getenv('DATABASE_PATH', str(Path(__file__).parent.parent / "data" / "fluxion_production.db")))

def get_db_connection():
    """Obtiene una conexión a la base de datos DuckDB"""
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Base de datos no encontrada")
    return duckdb.connect(str(DB_PATH))

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

@app.get("/api/ubicaciones", response_model=List[UbicacionResponse], tags=["Ubicaciones"])
async def get_ubicaciones(tipo: Optional[str] = None):
    """Obtiene todas las ubicaciones (tiendas y CEDIs) desde inventario_raw (datos reales)"""
    try:
        conn = get_db_connection()

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
        conn.close()

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
        conn = get_db_connection()

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
        conn.close()

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
        import sys
        sys.path.append(str(Path(__file__).parent.parent / "etl" / "core"))
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
                "stock_seg_mult_c": 7.0
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
            "stock_seg_mult_c": tienda_config.stock_seg_mult_c
        }

    except Exception as e:
        logger.error(f"Error obteniendo parámetros de stock: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/productos", response_model=List[ProductoResponse], tags=["Productos"])
async def get_productos(categoria: Optional[str] = None, activo: bool = True):
    """Obtiene todos los productos"""
    try:
        conn = get_db_connection()

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
        conn.close()

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
        conn = get_db_connection()

        result = conn.execute("""
            SELECT DISTINCT categoria
            FROM inventario_raw
            WHERE activo = true
                AND categoria IS NOT NULL
                AND tipo_ubicacion != 'mayorista'
            ORDER BY categoria
        """).fetchall()

        conn.close()

        return [row[0] for row in result]

    except Exception as e:
        logger.error(f"Error obteniendo categorías: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/stock", response_model=List[StockResponse], tags=["Inventario"])
async def get_stock(
    ubicacion_id: Optional[str] = None,
    categoria: Optional[str] = None,
    estado: Optional[str] = None
):
    """Obtiene el estado del stock desde inventario_raw (datos reales)"""
    try:
        conn = get_db_connection()

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
                CAST(inv.fecha_extraccion AS VARCHAR) as fecha_extraccion
            FROM inventario_raw inv
            WHERE inv.activo = true
        """

        params = []

        if ubicacion_id:
            query += " AND inv.ubicacion_id = ?"
            params.append(ubicacion_id)

        if categoria:
            query += " AND inv.categoria = ?"
            params.append(categoria)

        if estado:
            query += " AND inv.estado_stock = ?"
            params.append(estado)

        query += " ORDER BY inv.tipo_ubicacion, inv.ubicacion_nombre, inv.categoria, inv.descripcion_producto"

        result = conn.execute(query, params).fetchall()
        conn.close()

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
                fecha_extraccion=row[17]
            ))

        return stock_data

    except Exception as e:
        logger.error(f"Error obteniendo stock: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/dashboard/metrics", response_model=DashboardMetrics, tags=["Dashboard"])
async def get_dashboard_metrics():
    """Obtiene métricas principales para el dashboard"""
    try:
        conn = get_db_connection()

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

        conn.close()

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
        conn = get_db_connection()

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

        conn.close()

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

# Variable global para tracking del estado del ETL
etl_status = {
    "running": False,
    "current_ubicacion": None,
    "progress": 0,
    "message": "",
    "result": None
}

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

        # Ejecutar ETL de forma asíncrona
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=600)

        end_time = datetime.now()
        tiempo_ejecucion = (end_time - start_time).total_seconds()

        # Parsear resultados
        exitoso = process.returncode == 0
        ubicaciones_procesadas = []
        errores = []

        if exitoso:
            # Contar registros actualizados CON DETALLE POR TIENDA
            conn = get_db_connection()
            total_registros = conn.execute("""
                SELECT COUNT(*) FROM inventario_raw
                WHERE DATE(fecha_extraccion) = CURRENT_DATE
            """).fetchone()[0]

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

            conn.close()
            ubicaciones_procesadas = [u["id"] for u in ubicaciones_detalle]

            message = f"✅ ETL completado: {len(ubicaciones_procesadas)} ubicaciones, {total_registros:,} registros"
        else:
            total_registros = 0
            ubicaciones_detalle = []
            errores.append(stderr.decode())
            message = f"❌ ETL falló: {stderr.decode()[:200]}"

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
    try:
        test_script = Path(__file__).parent.parent / "etl" / "core" / "test_conectividad_simple.py"
        etl_venv_python = Path(__file__).parent.parent / "etl" / "venv" / "bin" / "python3"
        python_cmd = str(etl_venv_python) if etl_venv_python.exists() else "python3"

        # Ejecutar el script de conectividad
        process = await asyncio.create_subprocess_exec(
            python_cmd, str(test_script),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(test_script.parent)  # Ejecutar en el directorio core
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)

        if process.returncode == 0:
            # Parsear la salida para extraer información
            output_lines = stdout.decode().split('\n')
            tiendas_status = []

            for line in output_lines:
                if line.strip() and not line.startswith('=') and not line.startswith('-') and not line.startswith('🔍') and not line.startswith('📊') and not line.startswith('🚀') and not line.startswith('⚠️'):
                    parts = line.split()
                    if len(parts) >= 5 and parts[0].startswith('tienda'):
                        tienda_id = parts[0]
                        nombre = ' '.join(parts[1:-4])  # Nombre puede tener espacios
                        ip = parts[-4]
                        puerto = parts[-3]
                        estado_icon = parts[-2]
                        tiempo = parts[-1].replace('ms', '')

                        tiendas_status.append({
                            "id": tienda_id,
                            "nombre": nombre,
                            "ip": ip,
                            "puerto": puerto,
                            "conectado": '✅' in estado_icon,
                            "ip_alcanzable": '✅' in estado_icon or '🟡' in estado_icon,
                            "tiempo_ms": float(tiempo) if tiempo.replace('.','').isdigit() else 0
                        })

            # Contar tiendas conectadas
            conectadas = sum(1 for t in tiendas_status if t['conectado'])
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
        else:
            return {
                "success": False,
                "error": stderr.decode(),
                "tiendas": [],
                "resumen": {"total": 0, "conectadas": 0, "porcentaje": 0}
            }

    except asyncio.TimeoutError:
        return {
            "success": False,
            "error": "Timeout verificando conectividad",
            "tiendas": [],
            "resumen": {"total": 0, "conectadas": 0, "porcentaje": 0}
        }
    except Exception as e:
        logger.error(f"Error verificando conectividad: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "tiendas": [],
            "resumen": {"total": 0, "conectadas": 0, "porcentaje": 0}
        }

@app.post("/api/etl/sync", tags=["ETL"])
async def trigger_etl_sync(request: ETLSyncRequest, background_tasks: BackgroundTasks):
    """Inicia el ETL de inventario en background y retorna inmediatamente"""

    if etl_status["running"]:
        raise HTTPException(status_code=409, detail="ETL ya está en ejecución")

    # Inicializar estado
    etl_status["running"] = True
    etl_status["progress"] = 0
    etl_status["message"] = "Iniciando ETL..."
    etl_status["result"] = None

    # Ejecutar en background
    background_tasks.add_task(run_etl_background, request.ubicacion_id)

    return {
        "success": True,
        "message": "ETL iniciado en background. Use /api/etl/status para monitorear el progreso.",
        "status": "running"
    }

# ============================================================================
# VENTAS ENDPOINTS
# ============================================================================

@app.get("/api/ventas/summary", response_model=List[VentasSummaryResponse], tags=["Ventas"])
async def get_ventas_summary():
    """Obtiene resumen de ventas por ubicación"""
    try:
        conn = get_db_connection()

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
        conn.close()

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

@app.get("/api/ventas/detail", response_model=List[VentasDetailResponse], tags=["Ventas"])
async def get_ventas_detail(
    ubicacion_id: Optional[str] = None,
    categoria: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None
):
    """Obtiene detalle de ventas por producto con promedios y comparaciones"""
    try:
        conn = get_db_connection()

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

        where_clause = " AND ".join(where_clauses)

        # Query principal con todos los cálculos
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
            ano_anterior AS (
                SELECT
                    v.codigo_producto,
                    v.fecha,
                    SUM(CAST(v.cantidad_vendida AS DECIMAL)) as cantidad_dia
                FROM ventas_raw v
                WHERE v.fecha >= CAST(CAST(? AS DATE) - INTERVAL 365 DAY AS VARCHAR)
                    AND v.fecha <= CAST(CAST(? AS DATE) - INTERVAL 335 DAY AS VARCHAR)
                    {"AND v.ubicacion_id = ?" if ubicacion_id else ""}
                    {"AND v.categoria_producto = ?" if categoria else ""}
                GROUP BY v.codigo_producto, v.fecha
            ),
            promedio_ano AS (
                SELECT
                    codigo_producto,
                    AVG(cantidad_dia) as promedio_diario_ano_anterior
                FROM ano_anterior
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
                pan.promedio_diario_ano_anterior,
                (pa.cantidad_total / NULLIF(t.gran_total, 0) * 100) as porcentaje_total,
                pa.cantidad_bultos_promedio as cantidad_bultos,
                pa.cantidad_total / NULLIF(pa.cantidad_bultos_promedio, 0) as total_bultos,
                (pa.cantidad_total / NULLIF(pa.dias_distintos, 0)) / NULLIF(pa.cantidad_bultos_promedio, 0) as promedio_bultos_diario
            FROM periodo_actual pa
            CROSS JOIN totales t
            LEFT JOIN promedio_dia_semana pds ON pa.codigo_producto = pds.codigo_producto
            LEFT JOIN promedio_ano pan ON pa.codigo_producto = pan.codigo_producto
            ORDER BY pa.cantidad_total DESC
        """

        # Construir lista de parámetros:
        # params para periodo_actual, params para por_dia_semana, luego año anterior
        all_params = params.copy()  # Para periodo_actual
        all_params.extend(params.copy())  # Para por_dia_semana (mismos parámetros)
        all_params.extend([fecha_inicio, fecha_fin])  # Para año anterior
        if ubicacion_id:
            all_params.append(ubicacion_id)
        if categoria:
            all_params.append(categoria)

        result = conn.execute(query, all_params).fetchall()
        conn.close()

        return [
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

    except Exception as e:
        logger.error(f"Error obteniendo detalle de ventas: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/api/ventas/categorias", tags=["Ventas"])
async def get_ventas_categorias():
    """Obtiene todas las categorías de productos vendidos"""
    try:
        conn = get_db_connection()

        result = conn.execute("""
            SELECT DISTINCT categoria_producto
            FROM ventas_raw
            WHERE categoria_producto IS NOT NULL
            ORDER BY categoria_producto
        """).fetchall()

        conn.close()

        return [{"value": row[0], "label": row[0]} for row in result]

    except Exception as e:
        logger.error(f"Error obteniendo categorías de ventas: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

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
        conn = get_db_connection()

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
        ORDER BY COALESCE(v8.prom_diario_8sem, 0) DESC
        """

        result = conn.execute(query).fetchall()
        conn.close()

        productos = []
        for row in result:
            # Desempaquetar datos de los índices calculados (31-33)
            prom_diario = float(row[31]) if row[31] else 0
            cantidad_bultos = float(row[32]) if row[32] else 1
            stock_total = float(row[33]) if row[33] else 0
            stock_minimo = float(row[28]) if row[28] else 10
            stock_maximo = float(row[29]) if row[29] else 100
            punto_reorden = float(row[30]) if row[30] else 30
            pronostico_unid = float(row[17]) if row[17] else 0

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
                    # Ventas - nuevos índices
                    prom_ventas_5dias_unid=float(row[9]) if row[9] else 0,
                    prom_ventas_20dias_unid=float(row[10]) if row[10] else 0,
                    prom_mismo_dia_unid=float(row[11]) if row[11] else 0,
                    prom_ventas_8sem_unid=float(row[12]) if row[12] else 0,
                    prom_ventas_8sem_bultos=float(row[13]) if row[13] else 0,
                    prom_ventas_3dias_unid=float(row[14]) if row[14] else 0,
                    prom_ventas_3dias_bultos=float(row[15]) if row[15] else 0,
                    prom_mismo_dia_bultos=float(row[16]) if row[16] else 0,
                    pronostico_3dias_unid=float(row[17]) if row[17] else 0,
                    pronostico_3dias_bultos=float(row[18]) if row[18] else 0,
                    # Inventario
                    stock_tienda=float(row[19]) if row[19] else 0,
                    stock_en_transito=float(row[20]) if row[20] else 0,
                    stock_total=float(row[21]) if row[21] else 0,
                    stock_total_bultos=float(row[22]) if row[22] else 0,
                    stock_dias_cobertura=float(row[23]) if row[23] else 0,
                    stock_cedi_seco=float(row[24]) if row[24] else 0,
                    stock_cedi_frio=float(row[25]) if row[25] else 0,
                    stock_cedi_verde=float(row[26]) if row[26] else 0,
                    stock_cedi_origen=float(row[27]) if row[27] else 0,
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
    cantidad_pedida_bultos: int
    cantidad_sugerida_bultos: int
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

        # Conectar a base de datos
        conn = duckdb.connect(str(db_path), read_only=False)

        # Generar IDs únicos
        import uuid
        from datetime import datetime

        pedido_id = str(uuid.uuid4())
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

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
                    clasificacion_abc, razon_pedido, incluido,
                    prom_ventas_8sem_unid, prom_ventas_8sem_bultos,
                    stock_tienda, stock_total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                detalle_id, pedido_id, idx + 1,
                producto.codigo_producto, producto.descripcion_producto,
                float(producto.cantidad_bultos),
                int(producto.cantidad_pedida_bultos),
                float(producto.cantidad_pedida_bultos * producto.cantidad_bultos),
                int(producto.cantidad_sugerida_bultos),
                float(producto.cantidad_sugerida_bultos * producto.cantidad_bultos),
                producto.clasificacion_abc, producto.razon_pedido, producto.incluido,
                float(producto.prom_ventas_8sem_unid), float(producto.prom_ventas_8sem_bultos),
                float(producto.stock_tienda), float(producto.stock_total)
            ])

        conn.close()

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
    dias_adelante: int = 7
):
    """
    Calcula forecast para productos de una ubicación

    Args:
        ubicacion_id: ID de la ubicación (e.g., 'tienda_01')
        productos: Códigos de productos separados por coma (opcional, default: top 100)
        dias_adelante: Días hacia el futuro para predecir (default: 7)

    Returns:
        Lista de forecasts por producto
    """
    try:
        from forecast_pmp import ForecastPMP

        productos_list = productos.split(",") if productos else None

        with ForecastPMP() as forecaster:
            forecasts = forecaster.calcular_forecast_tienda(
                ubicacion_id=ubicacion_id,
                productos=productos_list,
                dias_adelante=dias_adelante
            )

        return {
            "success": True,
            "ubicacion_id": ubicacion_id,
            "dias_adelante": dias_adelante,
            "total_productos": len(forecasts),
            "forecasts": forecasts
        }

    except Exception as e:
        logger.error(f"Error calculando forecast: {str(e)}")
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