"""
Router para Administración de Productos
Gestiona la edición de características de productos (peso, volumen, cuadrante, etc.)

Endpoints:
- GET  /api/admin/productos                     - Listar productos con paginación y filtros
- GET  /api/admin/productos/{codigo}            - Obtener detalle de un producto
- PUT  /api/admin/productos/{codigo}            - Actualizar características de producto
- GET  /api/admin/productos/opciones/cuadrantes - Obtener lista de cuadrantes únicos
- GET  /api/admin/productos/opciones/marcas     - Obtener lista de marcas únicas
- GET  /api/admin/productos/opciones/categorias - Obtener lista de categorías únicas
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import logging

from db_manager import get_db_connection, get_db_connection_write

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/productos", tags=["Administración Productos"])


# =====================================================================================
# MODELOS
# =====================================================================================

class ProductoAdminResponse(BaseModel):
    """Producto con campos editables para el panel de administración"""
    codigo: str
    descripcion: str
    categoria: Optional[str] = None
    grupo: Optional[str] = None
    marca: Optional[str] = None
    presentacion: Optional[str] = None
    cuadrante: Optional[str] = None
    unidad_pedido: Optional[str] = 'Bulto'
    unidades_por_bulto: Optional[int] = 1
    peso_unitario: Optional[float] = None
    volumen_unitario: Optional[float] = None
    cedi_origen_id: Optional[str] = None
    activo: bool = True
    updated_at: Optional[datetime] = None


class ProductoUpdateRequest(BaseModel):
    """Campos editables de un producto"""
    unidades_por_bulto: Optional[int] = Field(None, ge=1, le=9999, description="Unidades por bulto")
    unidad_pedido: Optional[str] = Field(None, max_length=20, description="Unidad de pedido (Bulto, Unidad, KG)")
    cuadrante: Optional[str] = Field(None, max_length=20, description="Cuadrante de almacén")
    peso_unitario: Optional[float] = Field(None, ge=0, description="Peso unitario en kg")
    volumen_unitario: Optional[float] = Field(None, ge=0, description="Volumen unitario en m³")
    marca: Optional[str] = Field(None, max_length=100, description="Marca del producto")
    presentacion: Optional[str] = Field(None, max_length=50, description="Presentación")


class ProductoListResponse(BaseModel):
    """Respuesta paginada de lista de productos"""
    productos: List[ProductoAdminResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class OpcionResponse(BaseModel):
    """Opción para selectores"""
    valor: str
    cantidad: int


# =====================================================================================
# ENDPOINTS - OPCIONES (definidos primero para evitar conflictos de rutas)
# =====================================================================================

@router.get("/opciones/cuadrantes", response_model=List[OpcionResponse])
async def obtener_cuadrantes():
    """Obtiene lista de cuadrantes únicos para selector"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT cuadrante, COUNT(*) as cantidad
                FROM productos
                WHERE cuadrante IS NOT NULL
                  AND cuadrante != 'NO ESPECIFICADO'
                  AND activo = true
                GROUP BY cuadrante
                ORDER BY cuadrante
            """)
            rows = cursor.fetchall()
            cursor.close()

            return [OpcionResponse(valor=row[0], cantidad=row[1]) for row in rows]
    except Exception as e:
        logger.error(f"Error obteniendo cuadrantes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/opciones/marcas", response_model=List[OpcionResponse])
async def obtener_marcas():
    """Obtiene lista de marcas únicas para selector"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT marca, COUNT(*) as cantidad
                FROM productos
                WHERE marca IS NOT NULL
                  AND marca != ''
                  AND activo = true
                GROUP BY marca
                ORDER BY cantidad DESC
                LIMIT 100
            """)
            rows = cursor.fetchall()
            cursor.close()

            return [OpcionResponse(valor=row[0], cantidad=row[1]) for row in rows]
    except Exception as e:
        logger.error(f"Error obteniendo marcas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/opciones/categorias", response_model=List[OpcionResponse])
async def obtener_categorias():
    """Obtiene lista de categorías únicas para selector"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT categoria, COUNT(*) as cantidad
                FROM productos
                WHERE categoria IS NOT NULL
                  AND categoria != ''
                  AND activo = true
                GROUP BY categoria
                ORDER BY cantidad DESC
            """)
            rows = cursor.fetchall()
            cursor.close()

            return [OpcionResponse(valor=row[0], cantidad=row[1]) for row in rows]
    except Exception as e:
        logger.error(f"Error obteniendo categorías: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================================================
# ENDPOINTS - CRUD
# =====================================================================================

@router.get("", response_model=ProductoListResponse)
async def listar_productos(
    search: Optional[str] = Query(None, min_length=2, description="Buscar por código o descripción"),
    categoria: Optional[str] = Query(None, description="Filtrar por categoría"),
    cuadrante: Optional[str] = Query(None, description="Filtrar por cuadrante"),
    marca: Optional[str] = Query(None, description="Filtrar por marca"),
    solo_sin_peso: bool = Query(False, description="Solo productos sin peso definido"),
    solo_sin_cuadrante: bool = Query(False, description="Solo productos sin cuadrante"),
    page: int = Query(1, ge=1, description="Número de página"),
    page_size: int = Query(50, ge=10, le=200, description="Productos por página")
):
    """Lista productos con filtros y paginación"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Construir WHERE dinámico
            conditions = ["activo = true"]
            params = []

            if search:
                conditions.append("(codigo ILIKE %s OR descripcion ILIKE %s)")
                search_pattern = f"%{search}%"
                params.extend([search_pattern, search_pattern])

            if categoria:
                conditions.append("categoria = %s")
                params.append(categoria)

            if cuadrante:
                conditions.append("cuadrante = %s")
                params.append(cuadrante)

            if marca:
                conditions.append("marca = %s")
                params.append(marca)

            if solo_sin_peso:
                conditions.append("(peso_unitario IS NULL OR peso_unitario = 0)")

            if solo_sin_cuadrante:
                conditions.append("(cuadrante IS NULL OR cuadrante = 'NO ESPECIFICADO')")

            where_clause = " AND ".join(conditions)

            # Count total
            count_query = f"SELECT COUNT(*) FROM productos WHERE {where_clause}"
            cursor.execute(count_query, params)
            total = cursor.fetchone()[0]

            # Get page
            offset = (page - 1) * page_size
            query = f"""
                SELECT
                    codigo, descripcion, categoria, grupo, marca, presentacion,
                    cuadrante, unidad_pedido, unidades_por_bulto,
                    peso_unitario, volumen_unitario, cedi_origen_id, activo, updated_at
                FROM productos
                WHERE {where_clause}
                ORDER BY codigo
                LIMIT %s OFFSET %s
            """
            cursor.execute(query, params + [page_size, offset])
            rows = cursor.fetchall()
            cursor.close()

            productos = [
                ProductoAdminResponse(
                    codigo=row[0],
                    descripcion=row[1],
                    categoria=row[2],
                    grupo=row[3],
                    marca=row[4],
                    presentacion=row[5],
                    cuadrante=row[6],
                    unidad_pedido=row[7],
                    unidades_por_bulto=row[8],
                    peso_unitario=float(row[9]) if row[9] else None,
                    volumen_unitario=float(row[10]) if row[10] else None,
                    cedi_origen_id=row[11],
                    activo=row[12],
                    updated_at=row[13]
                )
                for row in rows
            ]

            total_pages = (total + page_size - 1) // page_size

            return ProductoListResponse(
                productos=productos,
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages
            )

    except Exception as e:
        logger.error(f"Error listando productos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{codigo}", response_model=ProductoAdminResponse)
async def obtener_producto(codigo: str):
    """Obtiene detalle de un producto por código"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT
                    codigo, descripcion, categoria, grupo, marca, presentacion,
                    cuadrante, unidad_pedido, unidades_por_bulto,
                    peso_unitario, volumen_unitario, cedi_origen_id, activo, updated_at
                FROM productos
                WHERE codigo = %s
            """, [codigo])
            row = cursor.fetchone()
            cursor.close()

            if not row:
                raise HTTPException(status_code=404, detail=f"Producto {codigo} no encontrado")

            return ProductoAdminResponse(
                codigo=row[0],
                descripcion=row[1],
                categoria=row[2],
                grupo=row[3],
                marca=row[4],
                presentacion=row[5],
                cuadrante=row[6],
                unidad_pedido=row[7],
                unidades_por_bulto=row[8],
                peso_unitario=float(row[9]) if row[9] else None,
                volumen_unitario=float(row[10]) if row[10] else None,
                cedi_origen_id=row[11],
                activo=row[12],
                updated_at=row[13]
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo producto {codigo}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{codigo}")
async def actualizar_producto(codigo: str, data: ProductoUpdateRequest):
    """Actualiza características editables de un producto"""
    try:
        # Construir SET dinámico solo con campos proporcionados
        updates = []
        params = []

        if data.unidades_por_bulto is not None:
            updates.append("unidades_por_bulto = %s")
            params.append(data.unidades_por_bulto)

        if data.unidad_pedido is not None:
            updates.append("unidad_pedido = %s")
            params.append(data.unidad_pedido)

        if data.cuadrante is not None:
            updates.append("cuadrante = %s")
            params.append(data.cuadrante)

        if data.peso_unitario is not None:
            updates.append("peso_unitario = %s")
            params.append(data.peso_unitario)

        if data.volumen_unitario is not None:
            updates.append("volumen_unitario = %s")
            params.append(data.volumen_unitario)

        if data.marca is not None:
            updates.append("marca = %s")
            params.append(data.marca)

        if data.presentacion is not None:
            updates.append("presentacion = %s")
            params.append(data.presentacion)

        if not updates:
            raise HTTPException(status_code=400, detail="No se proporcionaron campos para actualizar")

        # Siempre actualizar updated_at
        updates.append("updated_at = CURRENT_TIMESTAMP")

        with get_db_connection_write() as conn:
            cursor = conn.cursor()

            # Verificar que existe
            cursor.execute("SELECT codigo FROM productos WHERE codigo = %s", [codigo])
            if not cursor.fetchone():
                cursor.close()
                raise HTTPException(status_code=404, detail=f"Producto {codigo} no encontrado")

            # Ejecutar update
            set_clause = ", ".join(updates)
            query = f"UPDATE productos SET {set_clause} WHERE codigo = %s"
            params.append(codigo)

            cursor.execute(query, params)
            conn.commit()
            cursor.close()

            logger.info(f"Producto {codigo} actualizado: {data.model_dump(exclude_none=True)}")

            return {"success": True, "message": f"Producto {codigo} actualizado correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error actualizando producto {codigo}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
