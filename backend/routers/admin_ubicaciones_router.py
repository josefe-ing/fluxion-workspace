"""
Router para administración de ubicaciones (tiendas y CEDIs)
Permite gestionar la configuración de ubicaciones desde el panel de administración
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional, List
from pathlib import Path
from decimal import Decimal
import duckdb
from datetime import datetime, time

# Database path
DB_PATH = Path(__file__).parent.parent.parent / "data" / "fluxion_production.db"

# Create router
router = APIRouter(prefix="/api/admin/ubicaciones", tags=["Admin - Ubicaciones"])


# ==================== MODELS ====================

class UbicacionAdmin(BaseModel):
    """Modelo completo de ubicación para administración"""
    id: str
    codigo: str
    nombre: str
    tipo: str  # 'tienda' | 'cedi'

    # Datos geográficos
    region: Optional[str] = None
    ciudad: Optional[str] = None
    direccion: Optional[str] = None
    latitud: Optional[Decimal] = None
    longitud: Optional[Decimal] = None

    # Datos operativos
    superficie_m2: Optional[Decimal] = None
    capacidad_actual: Optional[Decimal] = None
    capacidad_maxima: Optional[Decimal] = None
    horario_apertura: Optional[str] = None  # TIME as string "HH:MM:SS"
    horario_cierre: Optional[str] = None

    # Conexión SQL Server
    server_ip: Optional[str] = None
    server_port: Optional[int] = 1433
    database_name: Optional[str] = "VAD10"
    codigo_deposito: Optional[str] = None

    # Flags de visibilidad
    activo: bool = True
    visible_pedidos: bool = False
    visible_reportes: bool = True
    visible_dashboards: bool = True

    # Metadata
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UbicacionCreateRequest(BaseModel):
    """Modelo para crear una nueva ubicación"""
    id: str = Field(..., description="ID único (ej: tienda_21, cedi_nuevo)")
    codigo: str = Field(..., description="Código corto (ej: T21, C04)")
    nombre: str = Field(..., description="Nombre descriptivo")
    tipo: str = Field(..., description="Tipo: 'tienda' o 'cedi'")

    # Opcionales
    region: Optional[str] = None
    ciudad: Optional[str] = None
    direccion: Optional[str] = None
    server_ip: Optional[str] = None
    server_port: int = 1433
    database_name: str = "VAD10"
    codigo_deposito: Optional[str] = None
    activo: bool = True
    visible_pedidos: bool = False


class UbicacionUpdateRequest(BaseModel):
    """Modelo para actualizar una ubicación existente"""
    nombre: Optional[str] = None
    codigo: Optional[str] = None
    region: Optional[str] = None
    ciudad: Optional[str] = None
    direccion: Optional[str] = None

    # SQL Server
    server_ip: Optional[str] = None
    server_port: Optional[int] = None
    database_name: Optional[str] = None
    codigo_deposito: Optional[str] = None

    # Flags
    activo: Optional[bool] = None
    visible_pedidos: Optional[bool] = None
    visible_reportes: Optional[bool] = None
    visible_dashboards: Optional[bool] = None


class ToggleResponse(BaseModel):
    """Respuesta al cambiar un flag booleano"""
    success: bool
    ubicacion_id: str
    field: str
    new_value: bool


# ==================== ENDPOINTS ====================

@router.get("", response_model=List[UbicacionAdmin])
async def get_all_ubicaciones(
    tipo: Optional[str] = None,
    activo: Optional[bool] = None,
    visible_pedidos: Optional[bool] = None
):
    """
    Obtener todas las ubicaciones (incluye inactivas)

    Query params:
    - tipo: Filtrar por tipo ('tienda' | 'cedi')
    - activo: Filtrar por estado activo
    - visible_pedidos: Filtrar por visibilidad en pedidos
    """
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        query = "SELECT * FROM ubicaciones WHERE 1=1"
        params = []

        if tipo:
            query += " AND tipo = ?"
            params.append(tipo)

        if activo is not None:
            query += " AND activo = ?"
            params.append(activo)

        if visible_pedidos is not None:
            query += " AND visible_pedidos = ?"
            params.append(visible_pedidos)

        query += " ORDER BY tipo, nombre"

        result = conn.execute(query, params).fetchall()
        columns = [desc[0] for desc in conn.execute(query, params).description]

        ubicaciones = []
        for row in result:
            data = dict(zip(columns, row))
            # Convert time objects to strings
            if data.get('horario_apertura'):
                data['horario_apertura'] = str(data['horario_apertura'])
            if data.get('horario_cierre'):
                data['horario_cierre'] = str(data['horario_cierre'])
            ubicaciones.append(UbicacionAdmin(**data))

        conn.close()
        return ubicaciones

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al obtener ubicaciones: {str(e)}"
        )


@router.get("/{ubicacion_id}", response_model=UbicacionAdmin)
async def get_ubicacion(ubicacion_id: str):
    """Obtener una ubicación específica por ID"""
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        result = conn.execute(
            "SELECT * FROM ubicaciones WHERE id = ?",
            [ubicacion_id]
        ).fetchone()

        if not result:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ubicación {ubicacion_id} no encontrada"
            )

        columns = [desc[0] for desc in conn.execute("SELECT * FROM ubicaciones LIMIT 0").description]
        data = dict(zip(columns, result))

        # Convert time objects
        if data.get('horario_apertura'):
            data['horario_apertura'] = str(data['horario_apertura'])
        if data.get('horario_cierre'):
            data['horario_cierre'] = str(data['horario_cierre'])

        conn.close()
        return UbicacionAdmin(**data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al obtener ubicación: {str(e)}"
        )


@router.post("", response_model=UbicacionAdmin, status_code=status.HTTP_201_CREATED)
async def create_ubicacion(ubicacion: UbicacionCreateRequest):
    """Crear una nueva ubicación"""
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Check if ID already exists
        existing = conn.execute(
            "SELECT id FROM ubicaciones WHERE id = ?",
            [ubicacion.id]
        ).fetchone()

        if existing:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ubicación con ID {ubicacion.id} ya existe"
            )

        # Insert new ubicacion
        conn.execute("""
            INSERT INTO ubicaciones (
                id, codigo, nombre, tipo, region, ciudad, direccion,
                server_ip, server_port, database_name, codigo_deposito,
                activo, visible_pedidos, visible_reportes, visible_dashboards,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """, [
            ubicacion.id,
            ubicacion.codigo,
            ubicacion.nombre,
            ubicacion.tipo,
            ubicacion.region,
            ubicacion.ciudad,
            ubicacion.direccion,
            ubicacion.server_ip,
            ubicacion.server_port,
            ubicacion.database_name,
            ubicacion.codigo_deposito,
            ubicacion.activo,
            ubicacion.visible_pedidos,
            True,  # visible_reportes default
            True   # visible_dashboards default
        ])

        conn.close()

        # Return the created ubicacion
        return await get_ubicacion(ubicacion.id)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al crear ubicación: {str(e)}"
        )


@router.put("/{ubicacion_id}", response_model=UbicacionAdmin)
async def update_ubicacion(ubicacion_id: str, updates: UbicacionUpdateRequest):
    """
    Actualizar una ubicación existente
    Solo se actualizan los campos proporcionados (partial update)
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Check if exists
        existing = conn.execute(
            "SELECT id FROM ubicaciones WHERE id = ?",
            [ubicacion_id]
        ).fetchone()

        if not existing:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ubicación {ubicacion_id} no encontrada"
            )

        # Build UPDATE query dynamically
        update_fields = []
        params = []

        for field, value in updates.dict(exclude_unset=True).items():
            if value is not None:
                update_fields.append(f"{field} = ?")
                params.append(value)

        if not update_fields:
            conn.close()
            # No updates, just return current state
            return await get_ubicacion(ubicacion_id)

        # Add updated_at
        update_fields.append("updated_at = CURRENT_TIMESTAMP")

        # Execute update
        query = f"UPDATE ubicaciones SET {', '.join(update_fields)} WHERE id = ?"
        params.append(ubicacion_id)

        conn.execute(query, params)
        conn.close()

        # Return updated ubicacion
        return await get_ubicacion(ubicacion_id)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al actualizar ubicación: {str(e)}"
        )


@router.delete("/{ubicacion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ubicacion(ubicacion_id: str):
    """
    Eliminar una ubicación (soft delete - marca como inactiva)
    No elimina físicamente para preservar integridad referencial
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Check if exists
        existing = conn.execute(
            "SELECT id FROM ubicaciones WHERE id = ?",
            [ubicacion_id]
        ).fetchone()

        if not existing:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ubicación {ubicacion_id} no encontrada"
            )

        # Soft delete - just mark as inactive
        conn.execute("""
            UPDATE ubicaciones
            SET activo = false,
                visible_pedidos = false,
                visible_reportes = false,
                visible_dashboards = false,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, [ubicacion_id])

        conn.close()
        return None

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al eliminar ubicación: {str(e)}"
        )


@router.patch("/{ubicacion_id}/toggle-activo", response_model=ToggleResponse)
async def toggle_activo(ubicacion_id: str):
    """Toggle el flag 'activo' de una ubicación"""
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Get current value
        result = conn.execute(
            "SELECT activo FROM ubicaciones WHERE id = ?",
            [ubicacion_id]
        ).fetchone()

        if not result:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ubicación {ubicacion_id} no encontrada"
            )

        current_value = result[0]
        new_value = not current_value

        # Update
        conn.execute("""
            UPDATE ubicaciones
            SET activo = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, [new_value, ubicacion_id])

        conn.close()

        return ToggleResponse(
            success=True,
            ubicacion_id=ubicacion_id,
            field="activo",
            new_value=new_value
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al cambiar estado activo: {str(e)}"
        )


@router.patch("/{ubicacion_id}/toggle-visible-pedidos", response_model=ToggleResponse)
async def toggle_visible_pedidos(ubicacion_id: str):
    """
    Toggle el flag 'visible_pedidos' de una ubicación

    NOTA: DuckDB 1.4.1 tiene un bug con UPDATE en tablas con FKs.
    Si falla, use el endpoint PUT /api/admin/ubicaciones/{id} en su lugar.
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Get current value
        result = conn.execute(
            "SELECT visible_pedidos FROM ubicaciones WHERE id = ?",
            [ubicacion_id]
        ).fetchone()

        if not result:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ubicación {ubicacion_id} no encontrada"
            )

        current_value = result[0]
        new_value = not current_value

        try:
            # Try UPDATE - may fail due to DuckDB FK bug
            conn.execute("""
                UPDATE ubicaciones
                SET visible_pedidos = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, [new_value, ubicacion_id])
        except Exception as update_error:
            conn.close()
            # If UPDATE fails, suggest alternative
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"DuckDB FK bug: {str(update_error)}. Use PUT /api/admin/ubicaciones/{ubicacion_id} instead with {{'visible_pedidos': {new_value}}}"
            )

        conn.close()

        return ToggleResponse(
            success=True,
            ubicacion_id=ubicacion_id,
            field="visible_pedidos",
            new_value=new_value
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al cambiar visibilidad en pedidos: {str(e)}"
        )


@router.get("/stats/summary")
async def get_stats_summary():
    """Obtener estadísticas resumidas de ubicaciones"""
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        stats = conn.execute("""
            SELECT
                tipo,
                COUNT(*) as total,
                SUM(CASE WHEN activo THEN 1 ELSE 0 END) as activos,
                SUM(CASE WHEN visible_pedidos THEN 1 ELSE 0 END) as visibles_pedidos,
                SUM(CASE WHEN visible_reportes THEN 1 ELSE 0 END) as visibles_reportes
            FROM ubicaciones
            GROUP BY tipo
            ORDER BY tipo
        """).fetchall()

        result = []
        for row in stats:
            result.append({
                "tipo": row[0],
                "total": row[1],
                "activos": row[2],
                "visibles_pedidos": row[3],
                "visibles_reportes": row[4]
            })

        conn.close()
        return result

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al obtener estadísticas: {str(e)}"
        )
