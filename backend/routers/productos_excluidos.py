"""
Router para Productos Excluidos por Tienda
Gestiona la lista de productos que no deben aparecer en pedidos sugeridos por tienda

Endpoints:
- GET  /api/productos-excluidos/{tienda_id}                    - Listar excluidos por tienda
- POST /api/productos-excluidos                                - Agregar exclusión
- DELETE /api/productos-excluidos/{tienda_id}/{codigo_producto} - Eliminar exclusión
- GET  /api/productos-excluidos/buscar-productos               - Buscar productos para excluir
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import logging

from db_manager import get_db_connection, get_db_connection_write

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/productos-excluidos", tags=["Productos Excluidos"])


# =====================================================================================
# MODELOS
# =====================================================================================

class ProductoExcluido(BaseModel):
    id: int
    tienda_id: str
    tienda_nombre: Optional[str] = None
    producto_id: Optional[str] = None
    codigo_producto: str
    descripcion_producto: Optional[str] = None
    categoria: Optional[str] = None
    motivo: str
    observaciones: Optional[str] = None
    creado_por: str
    fecha_creacion: datetime
    activo: bool


class CrearExclusionRequest(BaseModel):
    tienda_id: str
    codigo_producto: str
    motivo: str = "MANUAL"
    observaciones: Optional[str] = None


class ProductoBusqueda(BaseModel):
    codigo: str
    descripcion: str
    categoria: Optional[str] = None


# =====================================================================================
# ENDPOINTS
# =====================================================================================

@router.get("/{tienda_id}", response_model=List[ProductoExcluido])
async def listar_productos_excluidos(
    tienda_id: str,
    search: Optional[str] = Query(None, description="Buscar por código o descripción"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """
    Lista todos los productos excluidos para una tienda específica.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Query base
            query = """
                SELECT
                    pe.id,
                    pe.tienda_id,
                    u.nombre as tienda_nombre,
                    pe.producto_id,
                    pe.codigo_producto,
                    pe.descripcion_producto,
                    pe.categoria,
                    pe.motivo,
                    pe.observaciones,
                    pe.creado_por,
                    pe.fecha_creacion,
                    pe.activo
                FROM productos_excluidos_tienda pe
                LEFT JOIN ubicaciones u ON pe.tienda_id = u.id
                WHERE pe.tienda_id = %s AND pe.activo = TRUE
            """
            params = [tienda_id]

            # Filtro de búsqueda
            if search:
                query += " AND (pe.codigo_producto ILIKE %s OR pe.descripcion_producto ILIKE %s)"
                params.extend([f"%{search}%", f"%{search}%"])

            query += " ORDER BY pe.fecha_creacion DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])

            cursor.execute(query, params)
            rows = cursor.fetchall()

            columns = [desc[0] for desc in cursor.description]
            results = [dict(zip(columns, row)) for row in rows]

            return results

    except Exception as e:
        logger.error(f"Error listando productos excluidos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=ProductoExcluido)
async def crear_exclusion(request: CrearExclusionRequest):
    """
    Agrega un producto a la lista de excluidos para una tienda.
    Busca automáticamente la información del producto en la tabla productos.
    """
    try:
        with get_db_connection_write() as conn:
            cursor = conn.cursor()

            # Verificar si ya existe
            cursor.execute("""
                SELECT id FROM productos_excluidos_tienda
                WHERE tienda_id = %s AND codigo_producto = %s AND activo = TRUE
            """, [request.tienda_id, request.codigo_producto])

            if cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail=f"El producto {request.codigo_producto} ya está excluido para esta tienda"
                )

            # Buscar información del producto
            cursor.execute("""
                SELECT id, codigo, descripcion, categoria
                FROM productos
                WHERE codigo = %s
                LIMIT 1
            """, [request.codigo_producto])

            producto = cursor.fetchone()
            if not producto:
                raise HTTPException(
                    status_code=404,
                    detail=f"Producto {request.codigo_producto} no encontrado"
                )

            producto_id, codigo, descripcion, categoria = producto

            # Insertar exclusión
            cursor.execute("""
                INSERT INTO productos_excluidos_tienda (
                    tienda_id, producto_id, codigo_producto,
                    descripcion_producto, categoria,
                    motivo, observaciones, creado_por
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, fecha_creacion
            """, [
                request.tienda_id,
                producto_id,
                codigo,
                descripcion,
                categoria,
                request.motivo,
                request.observaciones,
                'admin'  # TODO: obtener usuario actual
            ])

            result = cursor.fetchone()
            new_id, fecha_creacion = result

            conn.commit()

            # Obtener nombre de tienda
            cursor.execute("SELECT nombre FROM ubicaciones WHERE id = %s", [request.tienda_id])
            tienda_row = cursor.fetchone()
            tienda_nombre = tienda_row[0] if tienda_row else None

            return ProductoExcluido(
                id=new_id,
                tienda_id=request.tienda_id,
                tienda_nombre=tienda_nombre,
                producto_id=producto_id,
                codigo_producto=codigo,
                descripcion_producto=descripcion,
                categoria=categoria,
                motivo=request.motivo,
                observaciones=request.observaciones,
                creado_por='admin',
                fecha_creacion=fecha_creacion,
                activo=True
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creando exclusión: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{tienda_id}/{codigo_producto}")
async def eliminar_exclusion(tienda_id: str, codigo_producto: str):
    """
    Elimina un producto de la lista de excluidos (soft delete).
    """
    try:
        with get_db_connection_write() as conn:
            cursor = conn.cursor()

            # Soft delete
            cursor.execute("""
                UPDATE productos_excluidos_tienda
                SET activo = FALSE
                WHERE tienda_id = %s AND codigo_producto = %s AND activo = TRUE
                RETURNING id
            """, [tienda_id, codigo_producto])

            result = cursor.fetchone()
            if not result:
                raise HTTPException(
                    status_code=404,
                    detail=f"Exclusión no encontrada para producto {codigo_producto} en tienda {tienda_id}"
                )

            conn.commit()

            return {
                "success": True,
                "message": f"Producto {codigo_producto} eliminado de la lista de excluidos"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error eliminando exclusión: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/buscar-productos/", response_model=List[ProductoBusqueda])
async def buscar_productos_para_excluir(
    tienda_id: str = Query(..., description="ID de la tienda"),
    search: str = Query(..., min_length=2, description="Término de búsqueda (mín 2 caracteres)")
):
    """
    Busca productos para agregar a la lista de excluidos.
    Excluye productos que ya están en la lista de exclusiones de la tienda.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                SELECT p.codigo, p.descripcion, p.categoria
                FROM productos p
                WHERE (p.codigo ILIKE %s OR p.descripcion ILIKE %s)
                  AND p.activo = TRUE
                  AND p.codigo NOT IN (
                      SELECT codigo_producto
                      FROM productos_excluidos_tienda
                      WHERE tienda_id = %s AND activo = TRUE
                  )
                ORDER BY p.codigo
                LIMIT 20
            """, [f"%{search}%", f"%{search}%", tienda_id])

            rows = cursor.fetchall()

            return [
                ProductoBusqueda(codigo=row[0], descripcion=row[1], categoria=row[2])
                for row in rows
            ]

    except Exception as e:
        logger.error(f"Error buscando productos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/codigos-excluidos/{tienda_id}")
async def obtener_codigos_excluidos(tienda_id: str):
    """
    Retorna solo los códigos de productos excluidos para una tienda.
    Útil para el filtrado rápido en el cálculo de pedidos sugeridos.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                SELECT codigo_producto
                FROM productos_excluidos_tienda
                WHERE tienda_id = %s AND activo = TRUE
            """, [tienda_id])

            rows = cursor.fetchall()

            return {
                "tienda_id": tienda_id,
                "codigos_excluidos": [row[0] for row in rows],
                "total": len(rows)
            }

    except Exception as e:
        logger.error(f"Error obteniendo códigos excluidos: {e}")
        raise HTTPException(status_code=500, detail=str(e))
