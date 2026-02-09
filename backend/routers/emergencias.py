"""
Router para Sistema de Detección de Emergencias de Inventario
Fluxion AI - Pedido de Emergencia v2

Endpoints:
- POST /api/emergencias/scan         - Ejecutar scan de emergencias
- GET  /api/emergencias/             - Listar última detección
- GET  /api/emergencias/anomalias    - Listar anomalías pendientes
- GET  /api/emergencias/factor-intensidad - Factor de intensidad del día
- GET  /api/emergencias/config/tiendas - Lista configuración de tiendas
- GET  /api/emergencias/config/tiendas/{ubicacion_id} - Config de una tienda
- POST /api/emergencias/config/tiendas/{ubicacion_id}/habilitar
- POST /api/emergencias/config/tiendas/{ubicacion_id}/deshabilitar
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from datetime import datetime, date
from decimal import Decimal
import logging

from models.emergencias import (
    # Request/Response models
    ScanRequest,
    ScanResponse,
    HabilitarTiendaRequest,
    ActualizarConfigRequest,
    # Entity models
    EmergenciaDetectada,
    EmergenciasResumen,
    AnomaliaDetectada,
    ConfigTiendaResumen,
    ConfigTiendaCompleta,
    FactorIntensidad,
    FactorIntensidadResponse,
    # Response models
    EmergenciasListResponse,
    AnomaliasListResponse,
    ConfigTiendasListResponse,
    OperacionExitosaResponse,
    # Enums
    TipoEmergencia,
    TipoAnomalia,
    TriggerTipo,
)
from services.detector_emergencias import (
    detectar_emergencias,
    get_tiendas_habilitadas,
    get_todas_tiendas_config,
    get_config_tienda,
    habilitar_tienda,
    deshabilitar_tienda,
    obtener_anomalias_pendientes,
    obtener_factor_intensidad_todas_tiendas,
    calcular_factor_intensidad,
    clasificar_intensidad,
    calcular_porcentaje_dia_transcurrido,
    obtener_detalle_producto_emergencia,
)
from db_manager import get_db_connection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/emergencias", tags=["Emergencias de Inventario"])


# Variable global para almacenar última respuesta de scan
_ultimo_scan: Optional[ScanResponse] = None


# =====================================================================================
# SCAN DE EMERGENCIAS
# =====================================================================================

@router.post("/scan", response_model=ScanResponse, summary="Ejecutar scan de emergencias")
async def ejecutar_scan(request: ScanRequest = None):
    """
    Ejecuta un scan de detección de emergencias de inventario.

    - **tiendas**: Lista de ubicacion_id a escanear (opcional, default: todas las habilitadas)
    - **incluir_anomalias**: Si detectar anomalías de inventario (default: true)
    - **usuario**: Usuario que ejecuta el scan (para auditoría)

    Retorna emergencias detectadas clasificadas por tipo:
    - STOCKOUT: Sin stock
    - CRITICO: Cobertura < 25%
    - INMINENTE: Cobertura < 50%
    - ALERTA: Cobertura < 75%
    """
    global _ultimo_scan

    if request is None:
        request = ScanRequest()

    try:
        resultado = detectar_emergencias(
            tiendas=request.tiendas,
            incluir_anomalias=request.incluir_anomalias,
            trigger_tipo=TriggerTipo.MANUAL,
            trigger_usuario=request.usuario
        )

        # Guardar último scan para consulta rápida
        _ultimo_scan = resultado

        return resultado

    except Exception as e:
        logger.error(f"Error ejecutando scan: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error ejecutando scan: {str(e)}")


# =====================================================================================
# CONSULTA DE EMERGENCIAS
# =====================================================================================

@router.get("/", response_model=EmergenciasListResponse, summary="Listar última detección")
async def listar_emergencias(
    tipo: Optional[TipoEmergencia] = Query(None, description="Filtrar por tipo de emergencia"),
    tienda: Optional[str] = Query(None, description="Filtrar por ubicacion_id"),
    clase_abc: Optional[str] = Query(None, description="Filtrar por clase ABC (A, B, C, D)")
):
    """
    Retorna las emergencias de la última detección ejecutada.

    Permite filtrar por:
    - **tipo**: STOCKOUT, CRITICO, INMINENTE, ALERTA
    - **tienda**: ubicacion_id específico
    - **clase_abc**: Clasificación ABC del producto

    Si no se ha ejecutado ningún scan, retorna lista vacía.
    """
    if _ultimo_scan is None:
        return EmergenciasListResponse(
            fecha_consulta=datetime.now(),
            total=0,
            emergencias=[],
            resumen_por_tienda=[]
        )

    emergencias = _ultimo_scan.emergencias
    resumenes = _ultimo_scan.resumen_por_tienda

    # Aplicar filtros
    if tipo:
        emergencias = [e for e in emergencias if e.tipo_emergencia == tipo]

    if tienda:
        emergencias = [e for e in emergencias if e.ubicacion_id == tienda]
        resumenes = [r for r in resumenes if r.ubicacion_id == tienda]

    if clase_abc:
        emergencias = [e for e in emergencias if e.clase_abc == clase_abc.upper()]

    return EmergenciasListResponse(
        fecha_consulta=datetime.now(),
        total=len(emergencias),
        emergencias=emergencias,
        resumen_por_tienda=resumenes
    )


# =====================================================================================
# ANOMALÍAS
# =====================================================================================

@router.get("/anomalias", response_model=AnomaliasListResponse, summary="Listar anomalías pendientes")
async def listar_anomalias(
    tienda: Optional[str] = Query(None, description="Filtrar por ubicacion_id"),
    tipo: Optional[TipoAnomalia] = Query(None, description="Filtrar por tipo de anomalía"),
    limit: int = Query(100, ge=1, le=500, description="Máximo de registros")
):
    """
    Retorna anomalías de inventario pendientes de revisión.

    Tipos de anomalías:
    - **STOCK_NEGATIVO**: Stock menor que cero
    - **VENTA_IMPOSIBLE**: Venta sin stock suficiente
    - **SPIKE_VENTAS**: Ventas muy por encima de lo esperado
    - **DISCREPANCIA**: Diferencia entre sistemas
    """
    try:
        anomalias = obtener_anomalias_pendientes(
            ubicacion_id=tienda,
            tipo=tipo,
            limit=limit
        )

        return AnomaliasListResponse(
            fecha_consulta=datetime.now(),
            total=len(anomalias),
            anomalias=anomalias
        )

    except Exception as e:
        logger.error(f"Error obteniendo anomalías: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error obteniendo anomalías: {str(e)}")


# =====================================================================================
# FACTOR DE INTENSIDAD
# =====================================================================================

@router.get("/factor-intensidad", response_model=FactorIntensidadResponse, summary="Factor de intensidad del día")
async def obtener_factor_intensidad(
    tienda: Optional[str] = Query(None, description="Filtrar por ubicacion_id específico")
):
    """
    Retorna el factor de intensidad del día actual para las tiendas habilitadas.

    El factor indica si el día está siendo más o menos intenso de lo normal:
    - **Factor > 1.0**: Día más intenso (más ventas de lo esperado)
    - **Factor < 1.0**: Día más tranquilo (menos ventas de lo esperado)

    Niveles de intensidad:
    - MUY_BAJO: < 0.5
    - BAJO: 0.5 - 0.8
    - NORMAL: 0.8 - 1.2
    - ALTO: 1.2 - 1.5
    - MUY_ALTO: > 1.5
    """
    try:
        if tienda:
            # Obtener para una tienda específica
            config = get_config_tienda(tienda)
            if not config:
                raise HTTPException(
                    status_code=404,
                    detail=f"Tienda {tienda} no encontrada o no configurada"
                )

            factor, ventas_reales, ventas_esperadas = calcular_factor_intensidad(tienda)
            hora_actual = datetime.now().hour
            pct_dia = calcular_porcentaje_dia_transcurrido(hora_actual)

            factores = [FactorIntensidad(
                ubicacion_id=tienda,
                nombre_tienda=config.nombre_tienda or tienda,
                fecha=date.today(),
                ventas_esperadas_hasta_ahora=round(ventas_esperadas, 2),
                ventas_reales_hasta_ahora=round(ventas_reales, 2),
                factor_intensidad=round(factor, 4),
                intensidad=clasificar_intensidad(factor),
                hora_actual=hora_actual,
                porcentaje_dia_transcurrido=round(pct_dia * 100, 2)
            )]
        else:
            # Obtener para todas las tiendas habilitadas
            factores = obtener_factor_intensidad_todas_tiendas()

        return FactorIntensidadResponse(
            fecha=date.today(),
            hora_actual=datetime.now().hour,
            factores=factores
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo factor de intensidad: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# =====================================================================================
# CONFIGURACIÓN DE TIENDAS
# =====================================================================================

@router.get("/config/tiendas", response_model=ConfigTiendasListResponse, summary="Lista configuración de tiendas")
async def listar_config_tiendas(
    solo_habilitadas: bool = Query(False, description="Solo mostrar tiendas habilitadas")
):
    """
    Lista todas las tiendas con su configuración de emergencias.

    - **solo_habilitadas=false** (default): Muestra todas las tiendas
    - **solo_habilitadas=true**: Solo tiendas con el feature activo
    """
    try:
        if solo_habilitadas:
            tiendas = get_tiendas_habilitadas()
        else:
            tiendas = get_todas_tiendas_config()

        habilitadas = sum(1 for t in tiendas if t.habilitado)

        return ConfigTiendasListResponse(
            total=len(tiendas),
            habilitadas=habilitadas,
            tiendas=tiendas
        )

    except Exception as e:
        logger.error(f"Error listando config tiendas: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/config/tiendas/{ubicacion_id}", response_model=ConfigTiendaCompleta, summary="Config de una tienda")
async def obtener_config_tienda(ubicacion_id: str):
    """
    Obtiene la configuración completa de una tienda específica.

    Incluye:
    - Estado de habilitación
    - Umbrales personalizados
    - Emails de notificación
    - Fechas de creación/actualización
    """
    try:
        config = get_config_tienda(ubicacion_id)

        if not config:
            # Verificar si la tienda existe
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT id, nombre FROM ubicaciones WHERE id = %s",
                    (ubicacion_id,)
                )
                tienda = cursor.fetchone()
                cursor.close()

            if not tienda:
                raise HTTPException(
                    status_code=404,
                    detail=f"Tienda {ubicacion_id} no existe"
                )

            # Retornar config por defecto
            return ConfigTiendaCompleta(
                ubicacion_id=ubicacion_id,
                nombre_tienda=tienda[1],
                habilitado=False,
                umbral_critico=Decimal("0.25"),
                umbral_inminente=Decimal("0.50"),
                umbral_alerta=Decimal("0.75"),
                emails_notificacion=[],
                notificaciones_activas=True
            )

        return config

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo config tienda: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.post(
    "/config/tiendas/{ubicacion_id}/habilitar",
    response_model=OperacionExitosaResponse,
    summary="Habilitar tienda"
)
async def habilitar_tienda_endpoint(
    ubicacion_id: str,
    request: HabilitarTiendaRequest = None
):
    """
    Habilita una tienda para detección de emergencias.

    Parámetros opcionales:
    - **emails_notificacion**: Lista de emails para alertas
    - **umbral_critico**: Umbral personalizado (default: 0.25)
    - **umbral_inminente**: Umbral personalizado (default: 0.50)
    - **umbral_alerta**: Umbral personalizado (default: 0.75)
    - **usuario**: Usuario que realiza la operación
    """
    if request is None:
        request = HabilitarTiendaRequest()

    try:
        # Verificar que la tienda existe
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id FROM ubicaciones WHERE id = %s",
                (ubicacion_id,)
            )
            if not cursor.fetchone():
                cursor.close()
                raise HTTPException(
                    status_code=404,
                    detail=f"Tienda {ubicacion_id} no existe"
                )
            cursor.close()

        # Habilitar
        habilitar_tienda(
            ubicacion_id=ubicacion_id,
            emails=request.emails_notificacion,
            umbral_critico=request.umbral_critico,
            umbral_inminente=request.umbral_inminente,
            umbral_alerta=request.umbral_alerta,
            usuario=request.usuario
        )

        return OperacionExitosaResponse(
            ok=True,
            mensaje=f"Tienda {ubicacion_id} habilitada para detección de emergencias",
            ubicacion_id=ubicacion_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error habilitando tienda: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.post(
    "/config/tiendas/{ubicacion_id}/deshabilitar",
    response_model=OperacionExitosaResponse,
    summary="Deshabilitar tienda"
)
async def deshabilitar_tienda_endpoint(ubicacion_id: str):
    """
    Deshabilita una tienda para detección de emergencias.

    La tienda ya no aparecerá en los scans automáticos.
    """
    try:
        deshabilitar_tienda(ubicacion_id)

        return OperacionExitosaResponse(
            ok=True,
            mensaje=f"Tienda {ubicacion_id} deshabilitada para detección de emergencias",
            ubicacion_id=ubicacion_id
        )

    except Exception as e:
        logger.error(f"Error deshabilitando tienda: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.put(
    "/config/tiendas/{ubicacion_id}",
    response_model=OperacionExitosaResponse,
    summary="Actualizar configuración"
)
async def actualizar_config_tienda(
    ubicacion_id: str,
    request: ActualizarConfigRequest
):
    """
    Actualiza la configuración de emergencias de una tienda.

    Permite modificar:
    - Umbrales de detección
    - Emails de notificación
    - Estado de notificaciones
    """
    try:
        # Verificar que existe config
        config = get_config_tienda(ubicacion_id)
        if not config:
            raise HTTPException(
                status_code=404,
                detail=f"Tienda {ubicacion_id} no tiene configuración. Habilítela primero."
            )

        # Construir query de actualización dinámicamente
        updates = []
        params = []

        if request.umbral_critico is not None:
            updates.append("umbral_critico = %s")
            params.append(request.umbral_critico)

        if request.umbral_inminente is not None:
            updates.append("umbral_inminente = %s")
            params.append(request.umbral_inminente)

        if request.umbral_alerta is not None:
            updates.append("umbral_alerta = %s")
            params.append(request.umbral_alerta)

        if request.emails_notificacion is not None:
            updates.append("emails_notificacion = %s")
            params.append(request.emails_notificacion)

        if request.notificaciones_activas is not None:
            updates.append("notificaciones_activas = %s")
            params.append(request.notificaciones_activas)

        if not updates:
            return OperacionExitosaResponse(
                ok=True,
                mensaje="Sin cambios",
                ubicacion_id=ubicacion_id
            )

        updates.append("fecha_actualizacion = %s")
        params.append(datetime.now())
        params.append(ubicacion_id)

        query = f"""
            UPDATE emergencias_config_tienda
            SET {', '.join(updates)}
            WHERE ubicacion_id = %s
        """

        from db_manager import get_db_connection_write
        with get_db_connection_write() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(params))
            conn.commit()
            cursor.close()

        return OperacionExitosaResponse(
            ok=True,
            mensaje=f"Configuración de {ubicacion_id} actualizada",
            ubicacion_id=ubicacion_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error actualizando config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# =====================================================================================
# DETALLE DE PRODUCTO PARA GRÁFICOS
# =====================================================================================

@router.get(
    "/detalle/{ubicacion_id}/{producto_id}",
    summary="Detalle de producto con comparativos de venta"
)
async def obtener_detalle_producto(ubicacion_id: str, producto_id: str):
    """
    Obtiene datos detallados de un producto en emergencia para mostrar gráficos.

    Incluye:
    - Ventas por hora de hoy (con proyección para horas futuras)
    - Ventas por hora de ayer
    - Ventas por hora del mismo día de la semana pasada
    - Promedio histórico por hora (últimos 30 días)
    - Proyección de venta total del día
    - Hora estimada de agotamiento (si aplica)
    """
    try:
        detalle = obtener_detalle_producto_emergencia(ubicacion_id, producto_id)

        if not detalle:
            raise HTTPException(
                status_code=404,
                detail=f"Producto {producto_id} no encontrado en tienda {ubicacion_id}"
            )

        return detalle

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo detalle producto: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
