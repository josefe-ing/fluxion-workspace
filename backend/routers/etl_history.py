"""
Router para Historial de Ejecuciones ETL

Endpoints para consultar y analizar el historial de ejecuciones de ETL
con detalle por fase, categoría de error, y métricas por tienda.
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
from pydantic import BaseModel, Field
import logging

from db_manager import get_db_connection
from auth import require_super_admin, UsuarioConRol

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/etl", tags=["ETL History"])


# =============================================================================
# MODELOS PYDANTIC
# =============================================================================

class ETLExecutionSummary(BaseModel):
    """Resumen de una ejecución ETL para la tabla de historial"""
    id: int
    etl_name: str
    etl_type: str
    started_at: datetime
    finished_at: Optional[datetime]
    duration_seconds: Optional[float]
    status: str
    records_extracted: int = 0
    records_loaded: int = 0
    duplicates_skipped: int = 0
    tiendas_count: int = 0
    tiendas_exitosas: int = 0
    tiendas_fallidas: int = 0
    error_phase: Optional[str] = None
    error_category: Optional[str] = None
    triggered_by: str

    class Config:
        from_attributes = True


class TiendaDetail(BaseModel):
    """Detalle de una tienda en una ejecución"""
    tienda_id: str
    tienda_nombre: str
    source_system: str
    status: str
    duration_seconds: Optional[float] = None
    records_extracted: int = 0
    records_loaded: int = 0
    duplicates_skipped: int = 0
    error_phase: Optional[str] = None
    error_category: Optional[str] = None
    error_message: Optional[str] = None


class ETLExecutionDetail(BaseModel):
    """Detalle completo de una ejecución ETL"""
    id: int
    etl_name: str
    etl_type: str
    started_at: datetime
    finished_at: Optional[datetime]
    duration_seconds: Optional[float]
    fecha_desde: datetime
    fecha_hasta: datetime
    status: str

    # Métricas
    records_extracted: int = 0
    records_loaded: int = 0
    duplicates_skipped: int = 0
    gaps_recovered: int = 0

    # Métricas por fase
    extract_duration_seconds: Optional[float] = None
    transform_duration_seconds: Optional[float] = None
    load_duration_seconds: Optional[float] = None

    # Error info
    error_phase: Optional[str] = None
    error_category: Optional[str] = None
    error_source: Optional[str] = None
    error_message: Optional[str] = None
    error_detail: Optional[str] = None

    # Metadata
    triggered_by: str
    source_system: Optional[str] = None
    is_recovery: bool = False

    # Detalle por tienda
    tiendas_detail: List[Dict[str, Any]] = []

    class Config:
        from_attributes = True


class ETLStats(BaseModel):
    """Estadísticas agregadas de ejecuciones ETL"""
    total_executions: int = 0
    successful: int = 0
    partial: int = 0
    failed: int = 0
    success_rate: float = 0
    avg_duration_seconds: float = 0
    total_records_loaded: int = 0
    total_duplicates: int = 0

    # Por fase de error
    errors_by_phase: Dict[str, int] = {}
    errors_by_category: Dict[str, int] = {}

    # Tiendas problemáticas
    tiendas_con_mas_fallos: List[Dict[str, Any]] = []


# =============================================================================
# ENDPOINTS DE HISTORIAL
# =============================================================================

@router.get("/history", response_model=List[ETLExecutionSummary])
async def get_etl_history(
    etl_name: Optional[str] = Query(None, description="Filtrar por 'ventas' o 'inventario'"),
    status: Optional[str] = Query(None, description="Filtrar por status: success, partial, failed, running"),
    fecha_desde: Optional[date] = Query(None, description="Fecha inicio del rango"),
    fecha_hasta: Optional[date] = Query(None, description="Fecha fin del rango"),
    triggered_by: Optional[str] = Query(None, description="Filtrar por origen: eventbridge, fluxion_admin, cli"),
    limit: int = Query(default=50, le=200, description="Máximo de resultados"),
    offset: int = Query(default=0, ge=0, description="Offset para paginación"),
    current_user: UsuarioConRol = Depends(require_super_admin)
):
    """
    Lista historial de ejecuciones ETL con filtros.

    Requiere permisos de super_admin.

    Filtros disponibles:
    - etl_name: Tipo de ETL ('ventas', 'inventario')
    - status: Estado de la ejecución
    - fecha_desde/hasta: Rango de fechas
    - triggered_by: Origen de ejecución
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            query = """
                SELECT
                    e.id,
                    e.etl_name,
                    e.etl_type,
                    e.started_at,
                    e.finished_at,
                    e.duration_seconds,
                    e.status,
                    e.records_extracted,
                    e.records_loaded,
                    e.duplicates_skipped,
                    COALESCE(array_length(e.tiendas_procesadas, 1), 0) as tiendas_count,
                    (SELECT COUNT(*) FROM etl_execution_details d
                     WHERE d.execution_id = e.id AND d.status = 'success') as tiendas_exitosas,
                    (SELECT COUNT(*) FROM etl_execution_details d
                     WHERE d.execution_id = e.id AND d.status = 'failed') as tiendas_fallidas,
                    e.error_phase,
                    e.error_category,
                    e.triggered_by
                FROM etl_executions e
                WHERE 1=1
            """
            params = []

            if etl_name:
                query += " AND e.etl_name = %s"
                params.append(etl_name)

            if status:
                query += " AND e.status = %s"
                params.append(status)

            if fecha_desde:
                query += " AND e.started_at >= %s"
                params.append(fecha_desde)

            if fecha_hasta:
                query += " AND e.started_at < %s"
                params.append(fecha_hasta + timedelta(days=1))

            if triggered_by:
                query += " AND e.triggered_by = %s"
                params.append(triggered_by)

            query += " ORDER BY e.started_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])

            cursor.execute(query, params)
            rows = cursor.fetchall()
            cursor.close()

            return [
                ETLExecutionSummary(
                    id=row[0],
                    etl_name=row[1],
                    etl_type=row[2],
                    started_at=row[3],
                    finished_at=row[4],
                    duration_seconds=float(row[5]) if row[5] else None,
                    status=row[6],
                    records_extracted=row[7] or 0,
                    records_loaded=row[8] or 0,
                    duplicates_skipped=row[9] or 0,
                    tiendas_count=row[10] or 0,
                    tiendas_exitosas=row[11] or 0,
                    tiendas_fallidas=row[12] or 0,
                    error_phase=row[13],
                    error_category=row[14],
                    triggered_by=row[15] or 'unknown'
                )
                for row in rows
            ]

    except Exception as e:
        logger.error(f"Error getting ETL history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{execution_id}", response_model=ETLExecutionDetail)
async def get_etl_execution_detail(
    execution_id: int,
    current_user: UsuarioConRol = Depends(require_super_admin)
):
    """
    Obtiene detalle completo de una ejecución ETL específica,
    incluyendo resultados por tienda y métricas por fase.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Obtener ejecución principal
            cursor.execute("""
                SELECT
                    id, etl_name, etl_type, started_at, finished_at,
                    duration_seconds, fecha_desde, fecha_hasta, status,
                    records_extracted, records_loaded, duplicates_skipped,
                    gaps_recovered, extract_duration_seconds, transform_duration_seconds,
                    load_duration_seconds, error_phase, error_category, error_source,
                    error_message, error_detail, triggered_by, source_system, is_recovery,
                    tiendas_detail
                FROM etl_executions
                WHERE id = %s
            """, (execution_id,))

            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Execution not found")

            # Obtener detalle por tienda de la tabla auxiliar
            cursor.execute("""
                SELECT
                    tienda_id, tienda_nombre, source_system, status,
                    duration_seconds, records_extracted, records_loaded,
                    duplicates_skipped, error_phase, error_category, error_message
                FROM etl_execution_details
                WHERE execution_id = %s
                ORDER BY tienda_id
            """, (execution_id,))

            tiendas = [
                {
                    'tienda_id': t[0],
                    'tienda_nombre': t[1],
                    'source_system': t[2],
                    'status': t[3],
                    'duration_seconds': float(t[4]) if t[4] else None,
                    'records_extracted': t[5] or 0,
                    'records_loaded': t[6] or 0,
                    'duplicates_skipped': t[7] or 0,
                    'error_phase': t[8],
                    'error_category': t[9],
                    'error_message': t[10]
                }
                for t in cursor.fetchall()
            ]

            # Si no hay detalles en tabla auxiliar, usar JSON de tiendas_detail
            if not tiendas and row[24]:
                import json
                tiendas = row[24] if isinstance(row[24], list) else json.loads(row[24]) if row[24] else []

            cursor.close()

            return ETLExecutionDetail(
                id=row[0],
                etl_name=row[1],
                etl_type=row[2],
                started_at=row[3],
                finished_at=row[4],
                duration_seconds=float(row[5]) if row[5] else None,
                fecha_desde=row[6],
                fecha_hasta=row[7],
                status=row[8],
                records_extracted=row[9] or 0,
                records_loaded=row[10] or 0,
                duplicates_skipped=row[11] or 0,
                gaps_recovered=row[12] or 0,
                extract_duration_seconds=float(row[13]) if row[13] else None,
                transform_duration_seconds=float(row[14]) if row[14] else None,
                load_duration_seconds=float(row[15]) if row[15] else None,
                error_phase=row[16],
                error_category=row[17],
                error_source=row[18],
                error_message=row[19],
                error_detail=row[20],
                triggered_by=row[21] or 'unknown',
                source_system=row[22],
                is_recovery=row[23] or False,
                tiendas_detail=tiendas
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting execution detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=ETLStats)
async def get_etl_stats(
    etl_name: Optional[str] = Query(None, description="Filtrar por tipo de ETL"),
    dias: int = Query(default=7, le=90, description="Días hacia atrás para analizar"),
    current_user: UsuarioConRol = Depends(require_super_admin)
):
    """
    Estadísticas agregadas de ejecuciones ETL.

    Incluye:
    - Tasa de éxito
    - Duración promedio
    - Errores por fase y categoría
    - Tiendas problemáticas
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            fecha_desde = datetime.now() - timedelta(days=dias)

            # Métricas generales
            query_base = """
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'success') as successful,
                    COUNT(*) FILTER (WHERE status = 'partial') as partial,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed,
                    ROUND(AVG(duration_seconds)::numeric, 2) as avg_duration,
                    SUM(records_loaded) as total_loaded,
                    SUM(duplicates_skipped) as total_duplicates
                FROM etl_executions
                WHERE started_at >= %s
            """
            params = [fecha_desde]

            if etl_name:
                query_base += " AND etl_name = %s"
                params.append(etl_name)

            cursor.execute(query_base, params)
            general = cursor.fetchone()

            # Errores por fase
            cursor.execute("""
                SELECT error_phase, COUNT(*)
                FROM etl_executions
                WHERE started_at >= %s AND error_phase IS NOT NULL
                GROUP BY error_phase
            """, [fecha_desde])
            errors_by_phase = {row[0]: row[1] for row in cursor.fetchall()}

            # Errores por categoría
            cursor.execute("""
                SELECT error_category, COUNT(*)
                FROM etl_executions
                WHERE started_at >= %s AND error_category IS NOT NULL
                GROUP BY error_category
                ORDER BY COUNT(*) DESC
                LIMIT 10
            """, [fecha_desde])
            errors_by_category = {row[0]: row[1] for row in cursor.fetchall()}

            # Tiendas con más fallos
            cursor.execute("""
                SELECT
                    tienda_id,
                    tienda_nombre,
                    COUNT(*) as total_ejecuciones,
                    COUNT(*) FILTER (WHERE status = 'failed') as fallos,
                    mode() WITHIN GROUP (ORDER BY error_category) as error_mas_comun
                FROM etl_execution_details
                WHERE execution_id IN (
                    SELECT id FROM etl_executions WHERE started_at >= %s
                )
                GROUP BY tienda_id, tienda_nombre
                HAVING COUNT(*) FILTER (WHERE status = 'failed') > 0
                ORDER BY fallos DESC
                LIMIT 5
            """, [fecha_desde])

            tiendas_problematicas = [
                {
                    'tienda_id': row[0],
                    'tienda_nombre': row[1],
                    'total_ejecuciones': row[2],
                    'fallos': row[3],
                    'error_mas_comun': row[4]
                }
                for row in cursor.fetchall()
            ]

            cursor.close()

            total = general[0] or 1  # Evitar división por cero

            return ETLStats(
                total_executions=general[0] or 0,
                successful=general[1] or 0,
                partial=general[2] or 0,
                failed=general[3] or 0,
                success_rate=round((general[1] or 0) / total * 100, 2),
                avg_duration_seconds=float(general[4]) if general[4] else 0,
                total_records_loaded=general[5] or 0,
                total_duplicates=general[6] or 0,
                errors_by_phase=errors_by_phase,
                errors_by_category=errors_by_category,
                tiendas_con_mas_fallos=tiendas_problematicas
            )

    except Exception as e:
        logger.error(f"Error getting ETL stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# ENDPOINTS AUXILIARES
# =============================================================================

@router.get("/error-categories")
async def get_error_categories(
    current_user: UsuarioConRol = Depends(require_super_admin)
):
    """
    Retorna la taxonomía completa de categorías de error por fase.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                SELECT error_phase, error_category, description
                FROM v_etl_error_categories
                ORDER BY error_phase, error_category
            """)

            categories = {}
            for row in cursor.fetchall():
                phase = row[0]
                if phase not in categories:
                    categories[phase] = []
                categories[phase].append({
                    'category': row[1],
                    'description': row[2]
                })

            cursor.close()
            return categories

    except Exception as e:
        logger.error(f"Error getting error categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))
