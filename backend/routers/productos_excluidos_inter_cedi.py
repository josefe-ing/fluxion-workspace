"""
Router para Productos Excluidos de Pedidos Inter-CEDI
Gestiona la lista de productos que no deben aparecer en pedidos inter-CEDI

Endpoints:
- GET  /api/productos-excluidos-inter-cedi/{cedi_destino_id}           - Listar excluidos por CEDI destino
- GET  /api/productos-excluidos-inter-cedi/codigos/{cedi_destino_id}   - Solo códigos (para filtrado rápido)
- POST /api/productos-excluidos-inter-cedi                              - Agregar exclusión individual
- POST /api/productos-excluidos-inter-cedi/bulk                         - Carga masiva de exclusiones
- DELETE /api/productos-excluidos-inter-cedi/{id}                       - Eliminar exclusión
- GET  /api/productos-excluidos-inter-cedi/buscar-productos             - Buscar productos para excluir
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import logging

from db_manager import get_db_connection, get_db_connection_write

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/productos-excluidos-inter-cedi", tags=["Exclusiones Inter-CEDI"])


# =====================================================================================
# CONSTANTES
# =====================================================================================

MOTIVOS_VALIDOS = ['MANUAL', 'SOLO_TIENDA', 'PROVEEDOR_LOCAL', 'DESCONTINUADO', 'OTRO']


# =====================================================================================
# MODELOS
# =====================================================================================

class ProductoExcluidoInterCedi(BaseModel):
    id: int
    cedi_destino_id: str
    cedi_destino_nombre: Optional[str] = None
    producto_id: Optional[str] = None
    codigo_producto: str
    descripcion_producto: Optional[str] = None
    categoria: Optional[str] = None
    cedi_origen_id: Optional[str] = None
    motivo: str
    observaciones: Optional[str] = None
    creado_por: str
    fecha_creacion: datetime
    activo: bool


class CrearExclusionInterCediRequest(BaseModel):
    cedi_destino_id: str
    codigo_producto: str
    motivo: str = "MANUAL"
    observaciones: Optional[str] = None


class CargaMasivaRequest(BaseModel):
    cedi_destino_id: str
    codigos_productos: List[str]
    motivo: str = "MANUAL"
    observaciones: Optional[str] = None


class CargaMasivaResponse(BaseModel):
    total_recibidos: int
    exitosos: int
    duplicados: int
    no_encontrados: int
    errores: List[str]


class ProductoBusqueda(BaseModel):
    codigo: str
    descripcion: str
    categoria: Optional[str] = None
    cedi_origen_id: Optional[str] = None


# =====================================================================================
# ENDPOINTS
# =====================================================================================

@router.get("/{cedi_destino_id}", response_model=List[ProductoExcluidoInterCedi])
async def listar_productos_excluidos_inter_cedi(
    cedi_destino_id: str,
    search: Optional[str] = Query(None, description="Buscar por código o descripción"),
    motivo: Optional[str] = Query(None, description="Filtrar por motivo"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """
    Lista todos los productos excluidos para un CEDI destino específico.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            query = """
                SELECT
                    pe.id,
                    pe.cedi_destino_id,
                    u.nombre as cedi_destino_nombre,
                    pe.producto_id,
                    pe.codigo_producto,
                    pe.descripcion_producto,
                    pe.categoria,
                    pe.cedi_origen_id,
                    pe.motivo,
                    pe.observaciones,
                    pe.creado_por,
                    pe.fecha_creacion,
                    pe.activo
                FROM productos_excluidos_inter_cedi pe
                LEFT JOIN ubicaciones u ON pe.cedi_destino_id = u.id
                WHERE pe.cedi_destino_id = %s AND pe.activo = TRUE
            """
            params = [cedi_destino_id]

            if search:
                query += " AND (pe.codigo_producto ILIKE %s OR pe.descripcion_producto ILIKE %s)"
                params.extend([f"%{search}%", f"%{search}%"])

            if motivo:
                query += " AND pe.motivo = %s"
                params.append(motivo)

            query += " ORDER BY pe.fecha_creacion DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])

            cursor.execute(query, params)
            rows = cursor.fetchall()

            columns = [desc[0] for desc in cursor.description]
            results = [dict(zip(columns, row)) for row in rows]

            return results

    except Exception as e:
        logger.error(f"Error listando productos excluidos inter-CEDI: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/codigos/{cedi_destino_id}")
async def obtener_codigos_excluidos_inter_cedi(cedi_destino_id: str):
    """
    Retorna solo los códigos de productos excluidos para un CEDI destino.
    Útil para el filtrado rápido en el cálculo de pedidos inter-CEDI.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                SELECT codigo_producto
                FROM productos_excluidos_inter_cedi
                WHERE cedi_destino_id = %s AND activo = TRUE
            """, [cedi_destino_id])

            rows = cursor.fetchall()

            return {
                "cedi_destino_id": cedi_destino_id,
                "codigos_excluidos": [row[0] for row in rows],
                "total": len(rows)
            }

    except Exception as e:
        logger.error(f"Error obteniendo códigos excluidos inter-CEDI: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=ProductoExcluidoInterCedi)
async def crear_exclusion_inter_cedi(request: CrearExclusionInterCediRequest):
    """
    Agrega un producto a la lista de excluidos para un CEDI destino.
    """
    try:
        # Validar motivo
        if request.motivo not in MOTIVOS_VALIDOS:
            raise HTTPException(
                status_code=400,
                detail=f"Motivo inválido. Valores permitidos: {MOTIVOS_VALIDOS}"
            )

        with get_db_connection_write() as conn:
            cursor = conn.cursor()

            # Verificar si ya existe
            cursor.execute("""
                SELECT id FROM productos_excluidos_inter_cedi
                WHERE cedi_destino_id = %s AND codigo_producto = %s AND activo = TRUE
            """, [request.cedi_destino_id, request.codigo_producto])

            if cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail=f"El producto {request.codigo_producto} ya está excluido para este CEDI"
                )

            # Buscar información del producto
            cursor.execute("""
                SELECT id, codigo, descripcion, categoria, cedi_origen_id
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

            producto_id, codigo, descripcion, categoria, cedi_origen_id = producto

            # Insertar exclusión
            cursor.execute("""
                INSERT INTO productos_excluidos_inter_cedi (
                    cedi_destino_id, producto_id, codigo_producto,
                    descripcion_producto, categoria, cedi_origen_id,
                    motivo, observaciones, creado_por
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, fecha_creacion
            """, [
                request.cedi_destino_id,
                producto_id,
                codigo,
                descripcion,
                categoria,
                cedi_origen_id,
                request.motivo,
                request.observaciones,
                'admin'
            ])

            result = cursor.fetchone()
            new_id, fecha_creacion = result

            conn.commit()

            # Obtener nombre de CEDI
            cursor.execute("SELECT nombre FROM ubicaciones WHERE id = %s", [request.cedi_destino_id])
            cedi_row = cursor.fetchone()
            cedi_nombre = cedi_row[0] if cedi_row else None

            return ProductoExcluidoInterCedi(
                id=new_id,
                cedi_destino_id=request.cedi_destino_id,
                cedi_destino_nombre=cedi_nombre,
                producto_id=producto_id,
                codigo_producto=codigo,
                descripcion_producto=descripcion,
                categoria=categoria,
                cedi_origen_id=cedi_origen_id,
                motivo=request.motivo,
                observaciones=request.observaciones,
                creado_por='admin',
                fecha_creacion=fecha_creacion,
                activo=True
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creando exclusión inter-CEDI: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk", response_model=CargaMasivaResponse)
async def carga_masiva_exclusiones(request: CargaMasivaRequest):
    """
    Carga masiva de productos excluidos.
    Acepta una lista de códigos de productos y los agrega todos.
    """
    try:
        # Validar motivo
        if request.motivo not in MOTIVOS_VALIDOS:
            raise HTTPException(
                status_code=400,
                detail=f"Motivo inválido. Valores permitidos: {MOTIVOS_VALIDOS}"
            )

        # Limpiar códigos (eliminar espacios y vacíos)
        codigos = [c.strip() for c in request.codigos_productos if c.strip()]

        if not codigos:
            raise HTTPException(status_code=400, detail="No se proporcionaron códigos válidos")

        exitosos = 0
        duplicados = 0
        no_encontrados = 0
        errores = []

        with get_db_connection_write() as conn:
            cursor = conn.cursor()

            for codigo in codigos:
                try:
                    # Verificar si ya existe
                    cursor.execute("""
                        SELECT id FROM productos_excluidos_inter_cedi
                        WHERE cedi_destino_id = %s AND codigo_producto = %s AND activo = TRUE
                    """, [request.cedi_destino_id, codigo])

                    if cursor.fetchone():
                        duplicados += 1
                        continue

                    # Buscar información del producto
                    cursor.execute("""
                        SELECT id, codigo, descripcion, categoria, cedi_origen_id
                        FROM productos
                        WHERE codigo = %s
                        LIMIT 1
                    """, [codigo])

                    producto = cursor.fetchone()
                    if not producto:
                        no_encontrados += 1
                        errores.append(f"Producto no encontrado: {codigo}")
                        continue

                    producto_id, codigo_prod, descripcion, categoria, cedi_origen_id = producto

                    # Insertar
                    cursor.execute("""
                        INSERT INTO productos_excluidos_inter_cedi (
                            cedi_destino_id, producto_id, codigo_producto,
                            descripcion_producto, categoria, cedi_origen_id,
                            motivo, observaciones, creado_por
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, [
                        request.cedi_destino_id,
                        producto_id,
                        codigo_prod,
                        descripcion,
                        categoria,
                        cedi_origen_id,
                        request.motivo,
                        request.observaciones,
                        'admin'
                    ])

                    exitosos += 1

                except Exception as e:
                    errores.append(f"Error con {codigo}: {str(e)}")

            conn.commit()

        logger.info(
            f"Carga masiva inter-CEDI: {exitosos} exitosos, "
            f"{duplicados} duplicados, {no_encontrados} no encontrados"
        )

        return CargaMasivaResponse(
            total_recibidos=len(codigos),
            exitosos=exitosos,
            duplicados=duplicados,
            no_encontrados=no_encontrados,
            errores=errores[:10]  # Limitar errores mostrados
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en carga masiva inter-CEDI: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{exclusion_id}")
async def eliminar_exclusion_inter_cedi(exclusion_id: int):
    """
    Elimina una exclusión por su ID (soft delete).
    """
    try:
        with get_db_connection_write() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                UPDATE productos_excluidos_inter_cedi
                SET activo = FALSE
                WHERE id = %s AND activo = TRUE
                RETURNING codigo_producto
            """, [exclusion_id])

            result = cursor.fetchone()
            if not result:
                raise HTTPException(
                    status_code=404,
                    detail=f"Exclusión con ID {exclusion_id} no encontrada"
                )

            codigo = result[0]
            conn.commit()

            return {
                "success": True,
                "message": f"Producto {codigo} eliminado de la lista de excluidos"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error eliminando exclusión inter-CEDI: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/buscar-productos/")
async def buscar_productos_para_excluir_inter_cedi(
    cedi_destino_id: str = Query(..., description="ID del CEDI destino"),
    search: str = Query(..., min_length=2, description="Término de búsqueda (mín 2 caracteres)")
) -> List[ProductoBusqueda]:
    """
    Busca productos para agregar a la lista de excluidos.
    Excluye productos que ya están en la lista de exclusiones del CEDI.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                SELECT p.codigo, p.descripcion, p.categoria, p.cedi_origen_id
                FROM productos p
                WHERE (p.codigo ILIKE %s OR p.descripcion ILIKE %s)
                  AND p.activo = TRUE
                  AND p.codigo NOT IN (
                      SELECT codigo_producto
                      FROM productos_excluidos_inter_cedi
                      WHERE cedi_destino_id = %s AND activo = TRUE
                  )
                ORDER BY p.codigo
                LIMIT 20
            """, [f"%{search}%", f"%{search}%", cedi_destino_id])

            rows = cursor.fetchall()

            return [
                ProductoBusqueda(
                    codigo=row[0],
                    descripcion=row[1],
                    categoria=row[2],
                    cedi_origen_id=row[3]
                )
                for row in rows
            ]

    except Exception as e:
        logger.error(f"Error buscando productos para excluir inter-CEDI: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/estadisticas/{cedi_destino_id}")
async def obtener_estadisticas_exclusiones(cedi_destino_id: str):
    """
    Retorna estadísticas de exclusiones para un CEDI destino.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Total por motivo
            cursor.execute("""
                SELECT motivo, COUNT(*) as total
                FROM productos_excluidos_inter_cedi
                WHERE cedi_destino_id = %s AND activo = TRUE
                GROUP BY motivo
                ORDER BY total DESC
            """, [cedi_destino_id])

            por_motivo = {row[0]: row[1] for row in cursor.fetchall()}

            # Total por CEDI origen
            cursor.execute("""
                SELECT COALESCE(cedi_origen_id, 'sin_asignar'), COUNT(*) as total
                FROM productos_excluidos_inter_cedi
                WHERE cedi_destino_id = %s AND activo = TRUE
                GROUP BY cedi_origen_id
                ORDER BY total DESC
            """, [cedi_destino_id])

            por_cedi_origen = {row[0]: row[1] for row in cursor.fetchall()}

            total = sum(por_motivo.values())

            return {
                "cedi_destino_id": cedi_destino_id,
                "total_excluidos": total,
                "por_motivo": por_motivo,
                "por_cedi_origen": por_cedi_origen
            }

    except Exception as e:
        logger.error(f"Error obteniendo estadísticas de exclusiones: {e}")
        raise HTTPException(status_code=500, detail=str(e))
