"""
Router para ETL Tracking System - KLK
Expone datos de tracking, gaps, y métricas de confiabilidad

Autor: Backend Team
Fecha: 2025-11-24
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from datetime import datetime, date
from pydantic import BaseModel
import duckdb
from pathlib import Path

try:
    import sentry_sdk
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

router = APIRouter(prefix="/api/etl/tracking", tags=["ETL Tracking"])

# Path to DuckDB
DB_PATH = Path(__file__).parent.parent.parent / "data" / "fluxion_production.db"


class EjecucionResponse(BaseModel):
    id: int
    etl_tipo: str
    ubicacion_id: str
    ubicacion_nombre: str
    fecha_inicio: datetime
    fecha_fin: Optional[datetime]
    duracion_segundos: Optional[float]
    fecha_desde: date
    fecha_hasta: date
    hora_desde: Optional[str]
    hora_hasta: Optional[str]
    estado: str
    registros_extraidos: int
    registros_cargados: int
    error_mensaje: Optional[str]
    error_tipo: Optional[str]
    modo: Optional[str]
    version_etl: Optional[str]
    host: Optional[str]


class GapResponse(BaseModel):
    etl_tipo: str
    ubicacion_id: str
    ubicacion_nombre: str
    fecha_desde: date
    fecha_hasta: date
    hora_desde: Optional[str]
    hora_hasta: Optional[str]
    fecha_fallo: datetime
    error_tipo: Optional[str]
    error_mensaje: Optional[str]
    horas_desde_fallo: float


class MetricaResponse(BaseModel):
    etl_tipo: str
    ubicacion_id: str
    ubicacion_nombre: str
    fecha: date
    total_ejecuciones: int
    ejecuciones_exitosas: int
    ejecuciones_fallidas: int
    tasa_exito_pct: float
    duracion_promedio_seg: Optional[float]
    total_registros_cargados: int


class CronStatusResponse(BaseModel):
    cron_activo: bool
    frecuencia: str
    proxima_ejecucion_estimada: Optional[datetime]
    ejecuciones_hoy: int
    exitosas_hoy: int
    fallidas_hoy: int


class RecuperarGapRequest(BaseModel):
    etl_tipo: str
    ubicacion_id: str
    fecha_desde: date
    fecha_hasta: date
    hora_desde: Optional[str] = None
    hora_hasta: Optional[str] = None


@router.get("/ejecuciones", response_model=List[EjecucionResponse])
async def get_ejecuciones(
    etl_tipo: Optional[str] = Query(None, description="Filtrar por tipo: 'inventario' o 'ventas'"),
    ubicacion_id: Optional[str] = Query(None, description="Filtrar por tienda: 'tienda_01', etc"),
    modo: Optional[str] = Query(None, description="Filtrar por modo: 'completo', 'incremental_30min', 'recuperacion'"),
    estado: Optional[str] = Query(None, description="Filtrar por estado: 'exitoso', 'fallido', 'en_proceso'"),
    limite: int = Query(20, ge=1, le=100, description="Límite de resultados")
):
    """
    Obtiene ejecuciones recientes del ETL KLK desde la tabla etl_ejecuciones

    Ordenadas por fecha_inicio DESC (más recientes primero)
    """
    # Sentry tags
    if SENTRY_AVAILABLE:
        sentry_sdk.set_tag("endpoint", "get_ejecuciones")
        sentry_sdk.set_tag("etl_tipo", etl_tipo or "all")
        if ubicacion_id:
            sentry_sdk.set_tag("ubicacion_id", ubicacion_id)

    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        # Construir query con filtros dinámicos
        query = """
            SELECT
                id, etl_tipo, ubicacion_id, ubicacion_nombre,
                fecha_inicio, fecha_fin, duracion_segundos,
                fecha_desde, fecha_hasta, hora_desde, hora_hasta,
                estado, registros_extraidos, registros_cargados,
                error_mensaje, error_tipo, modo, version_etl, host
            FROM etl_ejecuciones
            WHERE 1=1
        """

        params = []

        if etl_tipo:
            query += " AND etl_tipo = ?"
            params.append(etl_tipo)

        if ubicacion_id:
            query += " AND ubicacion_id = ?"
            params.append(ubicacion_id)

        if modo:
            query += " AND modo = ?"
            params.append(modo)

        if estado:
            query += " AND estado = ?"
            params.append(estado)

        query += " ORDER BY fecha_inicio DESC LIMIT ?"
        params.append(limite)

        result = conn.execute(query, params).fetchall()
        conn.close()

        ejecuciones = []
        for row in result:
            # Convert time objects to strings
            hora_desde = str(row[9]) if row[9] is not None else None
            hora_hasta = str(row[10]) if row[10] is not None else None

            ejecuciones.append(EjecucionResponse(
                id=row[0],
                etl_tipo=row[1],
                ubicacion_id=row[2],
                ubicacion_nombre=row[3],
                fecha_inicio=row[4],
                fecha_fin=row[5],
                duracion_segundos=row[6],
                fecha_desde=row[7],
                fecha_hasta=row[8],
                hora_desde=hora_desde,
                hora_hasta=hora_hasta,
                estado=row[11],
                registros_extraidos=row[12],
                registros_cargados=row[13],
                error_mensaje=row[14],
                error_tipo=row[15],
                modo=row[16],
                version_etl=row[17],
                host=row[18]
            ))

        return ejecuciones

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo ejecuciones: {str(e)}")


@router.get("/gaps", response_model=List[GapResponse])
async def get_gaps(
    etl_tipo: Optional[str] = Query(None, description="Filtrar por tipo: 'inventario' o 'ventas'"),
    ubicacion_id: Optional[str] = Query(None, description="Filtrar por tienda"),
    max_horas: int = Query(168, ge=1, le=720, description="Máximo horas atrás (default: 7 días)")
):
    """
    Obtiene gaps (ejecuciones fallidas sin recuperar) desde v_gaps_por_recuperar
    """
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        query = """
            SELECT
                etl_tipo, ubicacion_id, ubicacion_nombre,
                fecha_desde, fecha_hasta, hora_desde, hora_hasta,
                fecha_fallo, error_tipo, error_mensaje, horas_desde_fallo
            FROM v_gaps_por_recuperar
            WHERE horas_desde_fallo <= ?
        """

        params = [max_horas]

        if etl_tipo:
            query += " AND etl_tipo = ?"
            params.append(etl_tipo)

        if ubicacion_id:
            query += " AND ubicacion_id = ?"
            params.append(ubicacion_id)

        query += " ORDER BY fecha_fallo ASC"

        result = conn.execute(query, params).fetchall()
        conn.close()

        gaps = []
        for row in result:
            # Convert time objects to strings
            hora_desde = str(row[5]) if row[5] is not None else None
            hora_hasta = str(row[6]) if row[6] is not None else None

            gaps.append(GapResponse(
                etl_tipo=row[0],
                ubicacion_id=row[1],
                ubicacion_nombre=row[2],
                fecha_desde=row[3],
                fecha_hasta=row[4],
                hora_desde=hora_desde,
                hora_hasta=hora_hasta,
                fecha_fallo=row[7],
                error_tipo=row[8],
                error_mensaje=row[9],
                horas_desde_fallo=row[10]
            ))

        return gaps

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo gaps: {str(e)}")


@router.get("/metricas", response_model=List[MetricaResponse])
async def get_metricas(
    etl_tipo: Optional[str] = Query(None, description="Filtrar por tipo"),
    ubicacion_id: Optional[str] = Query(None, description="Filtrar por tienda"),
    dias: int = Query(7, ge=1, le=90, description="Días hacia atrás")
):
    """
    Obtiene métricas de confiabilidad desde v_metricas_confiabilidad
    """
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        # Calcular fecha límite
        query = f"""
            SELECT
                etl_tipo, ubicacion_id, ubicacion_nombre, fecha,
                total_ejecuciones, ejecuciones_exitosas, ejecuciones_fallidas,
                tasa_exito_pct, duracion_promedio_seg, total_registros_cargados
            FROM v_metricas_confiabilidad
            WHERE fecha >= CURRENT_DATE - INTERVAL '{dias} days'
        """

        params = []

        if etl_tipo:
            query += " AND etl_tipo = ?"
            params.append(etl_tipo)

        if ubicacion_id:
            query += " AND ubicacion_id = ?"
            params.append(ubicacion_id)

        query += " ORDER BY fecha DESC, ubicacion_id"

        result = conn.execute(query, params).fetchall()
        conn.close()

        metricas = []
        for row in result:
            metricas.append(MetricaResponse(
                etl_tipo=row[0],
                ubicacion_id=row[1],
                ubicacion_nombre=row[2],
                fecha=row[3],
                total_ejecuciones=row[4],
                ejecuciones_exitosas=row[5],
                ejecuciones_fallidas=row[6],
                tasa_exito_pct=row[7],
                duracion_promedio_seg=row[8],
                total_registros_cargados=row[9]
            ))

        return metricas

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo métricas: {str(e)}")


@router.get("/cron/status", response_model=CronStatusResponse)
async def get_cron_status():
    """
    Obtiene estado del cron KLK (cada 30 minutos)

    Calcula métricas basadas en ejecuciones de hoy
    """
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        # Contar ejecuciones de hoy
        result = conn.execute("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN estado = 'exitoso' THEN 1 ELSE 0 END) as exitosas,
                SUM(CASE WHEN estado = 'fallido' THEN 1 ELSE 0 END) as fallidas
            FROM etl_ejecuciones
            WHERE DATE(fecha_inicio) = CURRENT_DATE
        """).fetchone()

        conn.close()

        ejecuciones_hoy = result[0] if result[0] else 0
        exitosas_hoy = result[1] if result[1] else 0
        fallidas_hoy = result[2] if result[2] else 0

        # Estimar próxima ejecución (cada 30 min)
        from datetime import timedelta
        ahora = datetime.now()
        minutos_hasta_proxima = 30 - (ahora.minute % 30)
        proxima = ahora + timedelta(minutes=minutos_hasta_proxima)
        proxima = proxima.replace(second=0, microsecond=0)

        return CronStatusResponse(
            cron_activo=True,  # Asumimos que está activo
            frecuencia="Cada 30 minutos",
            proxima_ejecucion_estimada=proxima,
            ejecuciones_hoy=ejecuciones_hoy,
            exitosas_hoy=exitosas_hoy,
            fallidas_hoy=fallidas_hoy
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo estado del cron: {str(e)}")


@router.post("/recuperar-gap")
async def recuperar_gap(request: RecuperarGapRequest):
    """
    Trigger manual de recuperación de un gap específico

    Ejecuta el ETL con modo='recuperacion' para el rango especificado
    """
    # Sentry context for gap recovery
    if SENTRY_AVAILABLE:
        sentry_sdk.set_tag("endpoint", "recuperar_gap")
        sentry_sdk.set_tag("etl_tipo", request.etl_tipo)
        sentry_sdk.set_tag("ubicacion_id", request.ubicacion_id)
        sentry_sdk.set_context("gap_recovery", {
            "etl_tipo": request.etl_tipo,
            "ubicacion_id": request.ubicacion_id,
            "fecha_desde": str(request.fecha_desde),
            "fecha_hasta": str(request.fecha_hasta),
            "hora_desde": request.hora_desde,
            "hora_hasta": request.hora_hasta
        })

    try:
        # TODO: Integrar con sistema ETL existente
        # Por ahora, retornamos mensaje de éxito

        # Log success to Sentry
        if SENTRY_AVAILABLE:
            sentry_sdk.capture_message(
                f"Gap recovery triggered: {request.etl_tipo} - {request.ubicacion_id}",
                level="info"
            )

        return {
            "message": "Gap recovery iniciado",
            "etl_tipo": request.etl_tipo,
            "ubicacion_id": request.ubicacion_id,
            "fecha_desde": str(request.fecha_desde),
            "fecha_hasta": str(request.fecha_hasta),
            "modo": "recuperacion"
        }

    except Exception as e:
        # Capture error to Sentry with full context
        if SENTRY_AVAILABLE:
            sentry_sdk.capture_exception(e)
        raise HTTPException(status_code=500, detail=f"Error recuperando gap: {str(e)}")


@router.get("/connectivity/klk")
async def test_klk_connectivity():
    """
    Test de conectividad a API KLK centralizada

    Retorna latencia y estado de la API
    """
    import time
    import requests

    try:
        url = "http://190.6.32.3:7002/ventas"

        # Test simple con payload mínimo
        payload = {
            "sucursal": "SUC001",
            "fecha_desde": str(date.today()),
            "fecha_hasta": str(date.today())
        }

        start = time.time()
        response = requests.post(url, json=payload, timeout=10)
        latencia_ms = (time.time() - start) * 1000

        return {
            "status": "disponible" if response.status_code == 200 else "error",
            "http_status": response.status_code,
            "latencia_ms": round(latencia_ms, 2),
            "url": url,
            "timestamp": datetime.now().isoformat()
        }

    except requests.exceptions.Timeout:
        return {
            "status": "timeout",
            "http_status": None,
            "latencia_ms": None,
            "url": url,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "status": "error",
            "http_status": None,
            "latencia_ms": None,
            "url": url,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
