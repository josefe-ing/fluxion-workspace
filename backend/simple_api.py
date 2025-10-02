#!/usr/bin/env python3
"""
API simple para listar ubicaciones (tiendas + CEDIs)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import duckdb
from pathlib import Path
from datetime import datetime

app = FastAPI(title="La Granja Mercado API", version="1.0.0")

# CORS para desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuración DB
DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"

class Ubicacion(BaseModel):
    id: str
    codigo: str
    nombre: str
    tipo: str
    region: Optional[str]
    ciudad: Optional[str]
    activo: bool

class ProductoInventario(BaseModel):
    codigo_producto: str
    codigo_barras: Optional[str]
    descripcion_producto: str
    categoria: Optional[str]
    subcategoria: Optional[str]
    marca: Optional[str]
    presentacion: Optional[str]
    cantidad_actual: float
    precio_venta_actual: Optional[float]
    valor_inventario_actual: Optional[float]
    stock_minimo: Optional[float]
    stock_maximo: Optional[float]
    clasificacion_abc: Optional[str]  # 'A', 'B', o 'C'
    estado_stock: Optional[str]
    fecha_extraccion: datetime
    ubicacion_id: str
    ubicacion_nombre: str

class ConfiguracionProducto(BaseModel):
    ubicacion_id: str
    codigo_producto: str
    stock_minimo: float
    stock_maximo: float
    clasificacion_abc: str  # 'A', 'B', o 'C'

class InventarioResponse(BaseModel):
    ubicacion: Dict[str, Any]
    productos: List[ProductoInventario]
    total_productos: int
    fecha_actualizacion: datetime
    resumen: Dict[str, Any]

def get_db():
    """Conexión a DuckDB"""
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Base de datos no encontrada")
    return duckdb.connect(str(DB_PATH))

@app.get("/")
def health():
    return {"status": "OK", "service": "La Granja Mercado API"}

@app.get("/api/ubicaciones", response_model=List[Ubicacion])
def get_ubicaciones():
    """Lista todas las ubicaciones (tiendas + CEDIs)"""
    try:
        conn = get_db()

        # Buscar ubicaciones reales desde inventario_raw
        result = conn.execute("""
            SELECT DISTINCT
                ubicacion_id as id,
                ubicacion_id as codigo,
                ubicacion_nombre as nombre,
                tipo_ubicacion as tipo,
                'Valencia' as region,
                'Valencia' as ciudad,
                true as activo
            FROM inventario_raw
            ORDER BY ubicacion_nombre ASC
        """).fetchall()

        conn.close()

        ubicaciones = []
        for row in result:
            ubicaciones.append(Ubicacion(
                id=row[0],
                codigo=row[1],
                nombre=row[2],
                tipo=row[3],
                region=row[4],
                ciudad=row[5],
                activo=row[6]
            ))

        return ubicaciones

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.get("/api/inventario/{ubicacion_id}", response_model=InventarioResponse)
def get_inventario(ubicacion_id: str, limit: int = 10000, offset: int = 0):
    """Obtiene el inventario de una ubicación específica"""
    try:
        conn = get_db()

        # Obtener información de la ubicación
        ubicacion_result = conn.execute("""
            SELECT DISTINCT ubicacion_id, ubicacion_nombre, tipo_ubicacion,
                   MAX(fecha_extraccion) as ultima_actualizacion
            FROM inventario_raw
            WHERE ubicacion_id = ?
            GROUP BY ubicacion_id, ubicacion_nombre, tipo_ubicacion
        """, (ubicacion_id,)).fetchone()

        if not ubicacion_result:
            raise HTTPException(status_code=404, detail="Ubicación no encontrada")

        # Obtener productos ordenados por stock descendente
        productos_result = conn.execute("""
            SELECT
                codigo_producto,
                codigo_barras,
                descripcion_producto,
                categoria,
                subcategoria,
                marca,
                presentacion,
                cantidad_actual,
                precio_venta_actual,
                valor_inventario_actual,
                stock_minimo,
                stock_maximo,
                clasificacion_abc,
                estado_stock,
                fecha_extraccion,
                ubicacion_id,
                ubicacion_nombre
            FROM inventario_raw
            WHERE ubicacion_id = ?
            ORDER BY cantidad_actual DESC
            LIMIT ? OFFSET ?
        """, (ubicacion_id, limit, offset)).fetchall()

        # Obtener estadísticas
        stats_result = conn.execute("""
            SELECT
                COUNT(*) as total_productos,
                SUM(cantidad_actual) as total_stock,
                SUM(valor_inventario_actual) as valor_total,
                COUNT(CASE WHEN cantidad_actual > 0 THEN 1 END) as productos_con_stock,
                COUNT(CASE WHEN cantidad_actual = 0 THEN 1 END) as productos_sin_stock
            FROM inventario_raw
            WHERE ubicacion_id = ?
        """, (ubicacion_id,)).fetchone()

        conn.close()

        # Construir respuesta
        productos = []
        for row in productos_result:
            productos.append(ProductoInventario(
                codigo_producto=row[0],
                codigo_barras=row[1],
                descripcion_producto=row[2],
                categoria=row[3],
                subcategoria=row[4],
                marca=row[5],
                presentacion=row[6],
                cantidad_actual=float(row[7]),
                precio_venta_actual=float(row[8]) if row[8] else None,
                valor_inventario_actual=float(row[9]) if row[9] else None,
                stock_minimo=float(row[10]) if row[10] else None,
                stock_maximo=float(row[11]) if row[11] else None,
                clasificacion_abc=row[12],
                estado_stock=row[13],
                fecha_extraccion=row[14],
                ubicacion_id=row[15],
                ubicacion_nombre=row[16]
            ))

        return InventarioResponse(
            ubicacion={
                "id": ubicacion_result[0],
                "nombre": ubicacion_result[1],
                "tipo": ubicacion_result[2],
                "ultima_actualizacion": ubicacion_result[3]
            },
            productos=productos,
            total_productos=int(stats_result[0]),
            fecha_actualizacion=ubicacion_result[3],
            resumen={
                "total_stock": float(stats_result[1]) if stats_result[1] else 0,
                "valor_total": float(stats_result[2]) if stats_result[2] else 0,
                "productos_con_stock": int(stats_result[3]),
                "productos_sin_stock": int(stats_result[4])
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.put("/api/inventario/{ubicacion_id}/{codigo_producto}/configuracion")
def update_configuracion_producto(
    ubicacion_id: str,
    codigo_producto: str,
    config: ConfiguracionProducto
):
    """Actualiza la configuración de un producto específico"""
    try:
        conn = get_db()

        # Actualizar configuración
        result = conn.execute("""
            UPDATE inventario_raw
            SET stock_minimo = ?,
                stock_maximo = ?,
                clasificacion_abc = ?
            WHERE ubicacion_id = ?
            AND codigo_producto = ?
        """, (
            config.stock_minimo,
            config.stock_maximo,
            config.clasificacion_abc,
            ubicacion_id,
            codigo_producto
        ))

        conn.close()

        return {
            "success": True,
            "message": f"Configuración actualizada para producto {codigo_producto}",
            "ubicacion_id": ubicacion_id,
            "codigo_producto": codigo_producto
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/api/inventario/{ubicacion_id}/clasificacion-abc")
def calcular_clasificacion_abc(ubicacion_id: str):
    """Recalcula la clasificación ABC para todos los productos de una ubicación"""
    try:
        conn = get_db()

        # Calcular y actualizar clasificación ABC
        conn.execute("""
            WITH inventario_valorado AS (
                SELECT
                    codigo_producto,
                    cantidad_actual * COALESCE(precio_venta_actual, 0) AS valor_total,
                    SUM(cantidad_actual * COALESCE(precio_venta_actual, 0)) OVER () AS valor_total_inventario
                FROM inventario_raw
                WHERE ubicacion_id = ?
            ),
            inventario_ranking AS (
                SELECT
                    codigo_producto,
                    valor_total,
                    valor_total_inventario,
                    SUM(valor_total) OVER (ORDER BY valor_total DESC) AS valor_acumulado,
                    (SUM(valor_total) OVER (ORDER BY valor_total DESC) / valor_total_inventario) * 100 AS porcentaje_acumulado
                FROM inventario_valorado
                WHERE valor_total_inventario > 0
            )
            UPDATE inventario_raw
            SET clasificacion_abc = CASE
                WHEN ir.porcentaje_acumulado <= 80 THEN 'A'
                WHEN ir.porcentaje_acumulado <= 95 THEN 'B'
                ELSE 'C'
            END
            FROM inventario_ranking ir
            WHERE inventario_raw.codigo_producto = ir.codigo_producto
            AND inventario_raw.ubicacion_id = ?
        """, (ubicacion_id, ubicacion_id))

        # Obtener estadísticas
        stats = conn.execute("""
            SELECT
                clasificacion_abc,
                COUNT(*) as cantidad,
                ROUND(SUM(cantidad_actual * COALESCE(precio_venta_actual, 0)), 2) as valor_total
            FROM inventario_raw
            WHERE ubicacion_id = ?
            GROUP BY clasificacion_abc
        """, (ubicacion_id,)).fetchall()

        conn.close()

        return {
            "success": True,
            "message": "Clasificación ABC recalculada",
            "estadisticas": [
                {
                    "clase": row[0],
                    "cantidad_productos": row[1],
                    "valor_total": float(row[2]) if row[2] else 0
                }
                for row in stats
            ]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/api/etl/run/{ubicacion_id}")
def run_etl_for_ubicacion(ubicacion_id: str):
    """Ejecuta el proceso ETL para una ubicación específica"""
    import subprocess
    import sys
    import os
    from pathlib import Path

    try:
        # Obtener el path del directorio ETL
        etl_path = Path(__file__).parent.parent / "etl"

        # Ejecutar el ETL para la ubicación específica
        result = subprocess.run([
            sys.executable,
            str(etl_path / "orchestrator.py"),
            "--ubicacion", ubicacion_id
        ],
        capture_output=True,
        text=True,
        cwd=str(etl_path),
        timeout=300  # 5 minutos timeout
        )

        if result.returncode == 0:
            return {
                "success": True,
                "message": f"ETL ejecutado exitosamente para {ubicacion_id}",
                "output": result.stdout,
                "ubicacion_id": ubicacion_id
            }
        else:
            return {
                "success": False,
                "message": f"Error ejecutando ETL para {ubicacion_id}",
                "error": result.stderr,
                "output": result.stdout,
                "ubicacion_id": ubicacion_id
            }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "message": f"ETL timeout para {ubicacion_id}",
            "error": "El proceso ETL tardó más de 5 minutos",
            "ubicacion_id": ubicacion_id
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Error ejecutando ETL para {ubicacion_id}",
            "error": str(e),
            "ubicacion_id": ubicacion_id
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("simple_api:app", host="0.0.0.0", port=8001, reload=True)