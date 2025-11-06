"""
Router para gestionar configuración de inventario
"""

from fastapi import APIRouter, HTTPException
from typing import List, Optional
import duckdb
from pydantic import BaseModel
from database import get_db_connection, get_db_connection_write
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config-inventario", tags=["Configuración Inventario"])


# ===== MODELS =====

class ConfigGlobalItem(BaseModel):
    id: str
    categoria: str
    parametro: str
    valor_numerico: Optional[float]
    valor_texto: Optional[str]
    descripcion: str
    unidad: str
    activo: bool


class ConfigGlobalUpdate(BaseModel):
    valor_numerico: Optional[float]
    valor_texto: Optional[str]


class ConfigTienda(BaseModel):
    id: str
    tienda_id: str
    tienda_nombre: Optional[str]
    categoria_producto: str
    clasificacion_abc: str
    stock_min_multiplicador: float
    stock_seg_multiplicador: float
    stock_max_multiplicador: float
    lead_time_dias: int
    activo: bool


class ConfigTiendaUpdate(BaseModel):
    stock_min_multiplicador: Optional[float]
    stock_seg_multiplicador: Optional[float]
    stock_max_multiplicador: Optional[float]
    lead_time_dias: Optional[int]


class ConfigProducto(BaseModel):
    id: str
    codigo_producto: str
    descripcion_producto: Optional[str]
    tienda_id: str
    tienda_nombre: Optional[str]
    categoria_producto: str
    stock_min_multiplicador: float
    stock_seg_multiplicador: float
    stock_max_multiplicador: float
    lead_time_dias: int
    dias_vida_util: Optional[int]
    umbral_merma_pct: Optional[float]
    activo: bool


# ===== ENDPOINTS =====

@router.get("/global", response_model=List[ConfigGlobalItem])
async def get_config_global():
    """Obtiene toda la configuración global"""
    try:
        with get_db_connection() as conn:
            query = """
                SELECT
                    id, categoria, parametro, valor_numerico, valor_texto,
                    descripcion, unidad, activo
                FROM config_inventario_global
                WHERE activo = true
                ORDER BY categoria, parametro
            """
            result = conn.execute(query).fetchall()

            items = []
            for row in result:
                items.append(ConfigGlobalItem(
                    id=row[0],
                    categoria=row[1],
                    parametro=row[2],
                    valor_numerico=float(row[3]) if row[3] is not None else None,
                    valor_texto=row[4],
                    descripcion=row[5],
                    unidad=row[6],
                    activo=row[7]
                ))

            return items
    except Exception as e:
        logger.error(f"Error obteniendo config global: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/global/{config_id}")
async def update_config_global(config_id: str, update: ConfigGlobalUpdate):
    """Actualiza un parámetro de configuración global"""
    try:
        with get_db_connection_write() as conn:
            conn.execute("""
                UPDATE config_inventario_global
                SET valor_numerico = ?,
                    valor_texto = ?,
                    fecha_modificacion = CURRENT_TIMESTAMP
                WHERE id = ?
            """, [update.valor_numerico, update.valor_texto, config_id])
            conn.commit()

            return {"success": True, "message": "Configuración actualizada"}
    except Exception as e:
        logger.error(f"Error actualizando config global: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tienda", response_model=List[ConfigTienda])
async def get_config_tienda(
    tienda_id: str,
    categoria: Optional[str] = None
):
    """Obtiene configuración por tienda y categoría"""
    try:
        with get_db_connection() as conn:
            # Base query
            query = """
                SELECT
                    ct.id, ct.tienda_id,
                    COALESCE(u.ubicacion_nombre, ct.tienda_id) as tienda_nombre,
                    ct.categoria_producto, ct.clasificacion_abc,
                    ct.stock_min_multiplicador, ct.stock_seg_multiplicador,
                    ct.stock_max_multiplicador, ct.lead_time_dias, ct.activo
                FROM config_inventario_tienda ct
                LEFT JOIN (
                    SELECT DISTINCT ubicacion_id, ubicacion_nombre
                    FROM inventario_raw
                ) u ON ct.tienda_id = u.ubicacion_id
                WHERE ct.tienda_id = ? AND ct.activo = true
            """

            params = [tienda_id]

            if categoria:
                query += " AND ct.categoria_producto = ?"
                params.append(categoria)

            query += " ORDER BY ct.categoria_producto, ct.clasificacion_abc"

            result = conn.execute(query, params).fetchall()

            configs = []
            for row in result:
                configs.append(ConfigTienda(
                    id=row[0],
                    tienda_id=row[1],
                    tienda_nombre=row[2],
                    categoria_producto=row[3],
                    clasificacion_abc=row[4],
                    stock_min_multiplicador=float(row[5]),
                    stock_seg_multiplicador=float(row[6]),
                    stock_max_multiplicador=float(row[7]),
                    lead_time_dias=int(row[8]),
                    activo=row[9]
                ))

            return configs
    except Exception as e:
        logger.error(f"Error obteniendo config tienda: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/tienda/{config_id}")
async def update_config_tienda(config_id: str, update: ConfigTiendaUpdate):
    """Actualiza configuración de una tienda"""
    try:
        with get_db_connection_write() as conn:
            # Build update query dynamically
            updates = []
            params = []

            if update.stock_min_multiplicador is not None:
                updates.append("stock_min_multiplicador = ?")
                params.append(update.stock_min_multiplicador)
            if update.stock_seg_multiplicador is not None:
                updates.append("stock_seg_multiplicador = ?")
                params.append(update.stock_seg_multiplicador)
            if update.stock_max_multiplicador is not None:
                updates.append("stock_max_multiplicador = ?")
                params.append(update.stock_max_multiplicador)
            if update.lead_time_dias is not None:
                updates.append("lead_time_dias = ?")
                params.append(update.lead_time_dias)

            if not updates:
                raise HTTPException(status_code=400, detail="No fields to update")

            updates.append("fecha_modificacion = CURRENT_TIMESTAMP")
            params.append(config_id)

            query = f"""
                UPDATE config_inventario_tienda
                SET {', '.join(updates)}
                WHERE id = ?
            """

            conn.execute(query, params)
            conn.commit()

            return {"success": True, "message": "Configuración actualizada"}
    except Exception as e:
        logger.error(f"Error actualizando config tienda: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/productos", response_model=List[ConfigProducto])
async def get_config_productos(
    tienda_id: str,
    categoria: Optional[str] = None
):
    """Obtiene configuración individual de productos"""
    try:
        with get_db_connection() as conn:
            query = """
                SELECT
                    cp.id, cp.codigo_producto,
                    COALESCE(p.descripcion, cp.codigo_producto) as descripcion_producto,
                    cp.tienda_id,
                    COALESCE(u.ubicacion_nombre, cp.tienda_id) as tienda_nombre,
                    cp.categoria_producto,
                    cp.stock_min_multiplicador, cp.stock_seg_multiplicador,
                    cp.stock_max_multiplicador, cp.lead_time_dias,
                    cp.dias_vida_util, cp.umbral_merma_pct, cp.activo
                FROM config_inventario_producto cp
                LEFT JOIN (
                    SELECT DISTINCT codigo, descripcion
                    FROM productos_ubicacion_completa
                ) p ON cp.codigo_producto = p.codigo
                LEFT JOIN (
                    SELECT DISTINCT ubicacion_id, ubicacion_nombre
                    FROM inventario_raw
                ) u ON cp.tienda_id = u.ubicacion_id
                WHERE cp.tienda_id = ? AND cp.activo = true
            """

            params = [tienda_id]

            if categoria:
                query += " AND cp.categoria_producto = ?"
                params.append(categoria)

            query += " ORDER BY cp.codigo_producto"

            result = conn.execute(query, params).fetchall()

            configs = []
            for row in result:
                configs.append(ConfigProducto(
                    id=row[0],
                    codigo_producto=row[1],
                    descripcion_producto=row[2],
                    tienda_id=row[3],
                    tienda_nombre=row[4],
                    categoria_producto=row[5],
                    stock_min_multiplicador=float(row[6]),
                    stock_seg_multiplicador=float(row[7]),
                    stock_max_multiplicador=float(row[8]),
                    lead_time_dias=int(row[9]),
                    dias_vida_util=int(row[10]) if row[10] else None,
                    umbral_merma_pct=float(row[11]) if row[11] else None,
                    activo=row[12]
                ))

            return configs
    except Exception as e:
        logger.error(f"Error obteniendo config productos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/productos/{config_id}")
async def delete_config_producto(config_id: str):
    """Elimina (desactiva) configuración de un producto"""
    try:
        with get_db_connection_write() as conn:
            conn.execute("""
                UPDATE config_inventario_producto
                SET activo = false,
                    fecha_modificacion = CURRENT_TIMESTAMP
                WHERE id = ?
            """, [config_id])
            conn.commit()

            return {"success": True, "message": "Configuración eliminada"}
    except Exception as e:
        logger.error(f"Error eliminando config producto: {e}")
        raise HTTPException(status_code=500, detail=str(e))
