#!/usr/bin/env python3
"""
FastAPI Backend para Fluxion AI - La Granja Mercado
Conecta con DuckDB para servir datos de inventario en tiempo real
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import duckdb
from pathlib import Path
from datetime import datetime, date
import logging

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
    allow_origins=["http://localhost:3001", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuración de la base de datos
DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"

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
    estado_stock: str
    dias_cobertura_actual: Optional[float]
    es_producto_estrella: bool

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
    """Obtiene todas las ubicaciones (tiendas y CEDIs)"""
    try:
        conn = get_db_connection()

        query = "SELECT id, codigo, nombre, tipo, region, ciudad, superficie_m2, activo FROM ubicaciones WHERE activo = true"
        params = []

        if tipo:
            query += " AND tipo = ?"
            params.append(tipo)

        query += " ORDER BY tipo, nombre"

        result = conn.execute(query, params).fetchall()
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
    """Obtiene todas las categorías de productos"""
    try:
        conn = get_db_connection()

        result = conn.execute("""
            SELECT DISTINCT categoria
            FROM productos
            WHERE activo = true AND categoria IS NOT NULL
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
    """Obtiene el estado del stock con configuración completa"""
    try:
        conn = get_db_connection()

        query = """
            SELECT
                puc.ubicacion_id,
                u.nombre as ubicacion_nombre,
                u.tipo as ubicacion_tipo,
                puc.producto_id,
                p.codigo as codigo_producto,
                p.descripcion as descripcion_producto,
                p.categoria,
                p.marca,
                s.cantidad as stock_actual,
                puc.stock_minimo,
                puc.stock_maximo,
                puc.punto_reorden,
                puc.precio_venta,
                CASE
                    WHEN s.cantidad IS NULL THEN 'SIN_STOCK'
                    WHEN s.cantidad <= puc.stock_minimo THEN 'CRITICO'
                    WHEN s.cantidad <= puc.punto_reorden THEN 'BAJO'
                    WHEN s.cantidad >= puc.stock_maximo THEN 'EXCESO'
                    ELSE 'NORMAL'
                END as estado_stock,
                CASE
                    WHEN s.cantidad IS NULL THEN 0
                    WHEN puc.demanda_diaria_promedio > 0 THEN ROUND(s.cantidad / puc.demanda_diaria_promedio, 1)
                    ELSE 999
                END as dias_cobertura_actual,
                puc.es_producto_estrella
            FROM producto_ubicacion_config puc
            JOIN ubicaciones u ON puc.ubicacion_id = u.id
            JOIN productos p ON puc.producto_id = p.id
            LEFT JOIN stock_actual s ON puc.ubicacion_id = s.ubicacion_id AND puc.producto_id = s.producto_id
            WHERE puc.activo = true AND u.activo = true AND p.activo = true
        """

        params = []

        if ubicacion_id:
            query += " AND puc.ubicacion_id = ?"
            params.append(ubicacion_id)

        if categoria:
            query += " AND p.categoria = ?"
            params.append(categoria)

        if estado:
            # Agregar filtro de estado después del CASE
            estado_filter = {
                'CRITICO': "s.cantidad <= puc.stock_minimo",
                'BAJO': "s.cantidad > puc.stock_minimo AND s.cantidad <= puc.punto_reorden",
                'NORMAL': "s.cantidad > puc.punto_reorden AND s.cantidad < puc.stock_maximo",
                'EXCESO': "s.cantidad >= puc.stock_maximo",
                'SIN_STOCK': "s.cantidad IS NULL"
            }
            if estado in estado_filter:
                query += f" AND {estado_filter[estado]}"

        query += " ORDER BY u.tipo, u.nombre, p.categoria, p.descripcion"

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
                estado_stock=row[13],
                dias_cobertura_actual=row[14],
                es_producto_estrella=row[15]
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)