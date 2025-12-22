"""
Router para Generadores de Tráfico - FluxionIA
Productos que venden poco en $ pero aparecen en muchos tickets.
Son críticos para la experiencia del cliente.

Diciembre 2025
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import List, Optional, Any
from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal
import logging

from db_manager import get_db_connection, get_db_connection_write

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/generadores-trafico", tags=["Generadores de Tráfico"])


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class GeneradorTraficoItem(BaseModel):
    """Producto con métricas de generador de tráfico"""
    producto_id: str
    codigo: str
    descripcion: str
    categoria: Optional[str] = None

    # Métricas de ventas
    venta_30d: float
    tickets_30d: int
    penetracion_pct: float

    # Rankings
    rank_venta: int
    rank_penetracion: int
    gap: int
    clase_abc: str

    # Estado de generador de tráfico
    es_generador_trafico: bool
    generador_trafico_sugerido: bool
    generador_trafico_ignorado: bool
    fecha_marcado: Optional[datetime] = None
    fecha_sugerido: Optional[datetime] = None

    # Estado calculado para UI
    estado: str  # 'activo', 'sugerido', 'ignorado', 'ninguno'


class ResumenGeneradoresTrafico(BaseModel):
    """Resumen estadístico de generadores de tráfico"""
    total_activos: int
    total_sugeridos: int  # Pendientes de revisión
    total_ignorados: int
    productos_clase_c: int
    gap_promedio_activos: float  # Promedio de sugeridos
    gap_minimo_config: int
    ultima_actualizacion: Optional[datetime] = None


class MarcarGeneradorRequest(BaseModel):
    """Request para marcar/desmarcar un producto como generador de tráfico"""
    producto_id: str
    accion: str  # 'aprobar', 'rechazar', 'remover'
    comentario: Optional[str] = None


class ConfigGeneradorTrafico(BaseModel):
    """Configuración del módulo de generadores de tráfico"""
    gap_minimo: int
    clase_abc_requerida: str
    stock_seguridad_extra_pct: int
    producto_excluido_bolsas: str
    dias_analisis: int
    frecuencia_calculo: str


class CalculoSugerenciasResult(BaseModel):
    """Resultado del cálculo de sugerencias"""
    productos_analizados: int
    nuevas_sugerencias: int
    sugerencias_removidas: int
    tiempo_ejecucion_ms: int


class RecalcularABCResult(BaseModel):
    """Resultado del recálculo de cache ABC"""
    productos_procesados: int
    tiempo_ejecucion_ms: int
    productos_a: int
    productos_b: int
    productos_c: int
    productos_d: int = 0
    fecha_calculo: str
    # ABC por tienda (si se recalculó)
    tiendas_procesadas: int = 0
    productos_por_tienda: int = 0
    tiempo_por_tienda_ms: int = 0


# ============================================================================
# DEPENDENCY INJECTION
# ============================================================================

def get_db():
    """Get database connection (read-only)"""
    with get_db_connection() as conn:
        yield conn


def get_db_write():
    """Get database connection (read-write)"""
    with get_db_connection_write() as conn:
        yield conn


# ============================================================================
# ENDPOINTS: LISTADOS
# ============================================================================

@router.get("/resumen", response_model=ResumenGeneradoresTrafico)
async def get_resumen(conn: Any = Depends(get_db)):
    """
    Obtener resumen estadístico de generadores de tráfico
    """
    try:
        cursor = conn.cursor()

        # Contar activos, sugeridos, ignorados
        cursor.execute("""
            SELECT
                COUNT(*) FILTER (WHERE es_generador_trafico = TRUE) as activos,
                COUNT(*) FILTER (WHERE generador_trafico_sugerido = TRUE
                                 AND es_generador_trafico = FALSE
                                 AND COALESCE(generador_trafico_ignorado, FALSE) = FALSE) as sugeridos,
                COUNT(*) FILTER (WHERE COALESCE(generador_trafico_ignorado, FALSE) = TRUE) as ignorados,
                AVG(generador_trafico_gap) FILTER (WHERE generador_trafico_sugerido = TRUE) as gap_promedio,
                MAX(generador_trafico_fecha_sugerido) as fecha_ultimo_calculo
            FROM productos
        """)
        row = cursor.fetchone()

        # Contar productos con GAP > 200 (candidatos potenciales)
        cursor.execute("""
            SELECT COUNT(*)
            FROM productos_abc_cache
            WHERE gap > 200
        """)
        total_candidatos_gap = cursor.fetchone()[0] or 0

        cursor.close()

        # Obtener gap_minimo de configuración
        cursor = conn.cursor()
        cursor.execute("""
            SELECT valor FROM config_generadores_trafico
            WHERE parametro = 'gap_minimo'
        """)
        gap_config_row = cursor.fetchone()
        gap_minimo_config = int(gap_config_row[0]) if gap_config_row else 400
        cursor.close()

        return ResumenGeneradoresTrafico(
            total_activos=row[0] or 0,
            total_sugeridos=row[1] or 0,
            total_ignorados=row[2] or 0,
            productos_clase_c=total_candidatos_gap,  # Ahora es "productos con GAP alto"
            gap_promedio_activos=float(row[3]) if row[3] else 0.0,
            gap_minimo_config=gap_minimo_config,
            ultima_actualizacion=row[4]
        )

    except Exception as e:
        logger.error(f"Error obteniendo resumen: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/productos")
async def listar_productos(
    tab: Optional[str] = None,  # 'activos', 'sugeridos', 'ignorados', 'todos_c'
    filtro: Optional[str] = None,  # alias para compatibilidad
    limit: int = 100,
    offset: int = 0,
    conn: Any = Depends(get_db)
):
    """
    Listar productos con métricas de generador de tráfico.
    Usa tabla cache pre-calculada para rendimiento óptimo.

    Filtros:
    - activos: Solo productos marcados como generador de tráfico
    - sugeridos: Solo sugerencias pendientes de revisar
    - ignorados: Sugerencias que fueron rechazadas
    - todos_c: Todos los productos clase C con GAP > 200
    """
    try:
        cursor = conn.cursor()

        # Query optimizada usando tabla cache pre-calculada
        base_query = """
            SELECT
                p.id as producto_id,
                p.codigo,
                p.descripcion,
                p.categoria,
                COALESCE(c.venta_30d, 0) as venta_30d,
                COALESCE(c.tickets_30d, 0) as tickets_30d,
                COALESCE(c.penetracion_pct, 0) as penetracion_pct,
                COALESCE(c.rank_cantidad, 9999) as rank_venta,
                COALESCE(c.rank_penetracion, 9999) as rank_penetracion,
                COALESCE(c.gap, 0) as gap,
                COALESCE(c.clase_abc, 'C') as clase_abc,
                COALESCE(p.es_generador_trafico, FALSE) as es_generador_trafico,
                COALESCE(p.generador_trafico_sugerido, FALSE) as generador_trafico_sugerido,
                COALESCE(p.generador_trafico_ignorado, FALSE) as generador_trafico_ignorado,
                p.generador_trafico_fecha_marcado as fecha_marcado,
                p.generador_trafico_fecha_sugerido as fecha_sugerido
            FROM productos p
            LEFT JOIN productos_abc_cache c ON c.producto_id = p.id
            WHERE 1=1
        """

        params = []

        # Usar tab si está definido, sino filtro
        filtro_activo = tab or filtro

        # Aplicar filtro
        if filtro_activo == 'activos':
            base_query += " AND p.es_generador_trafico = TRUE"
        elif filtro_activo == 'sugeridos':
            base_query += """ AND p.generador_trafico_sugerido = TRUE
                             AND COALESCE(p.es_generador_trafico, FALSE) = FALSE
                             AND COALESCE(p.generador_trafico_ignorado, FALSE) = FALSE"""
        elif filtro_activo == 'ignorados':
            base_query += " AND COALESCE(p.generador_trafico_ignorado, FALSE) = TRUE"
        elif filtro_activo == 'todos_c' or filtro_activo == 'todos':
            # Solo filtramos por GAP, no por Clase ABC
            base_query += " AND c.gap > 200"
        else:
            # Default: sugeridos si no se especifica ningún filtro válido
            base_query += """ AND p.generador_trafico_sugerido = TRUE
                             AND COALESCE(p.es_generador_trafico, FALSE) = FALSE
                             AND COALESCE(p.generador_trafico_ignorado, FALSE) = FALSE"""

        base_query += " ORDER BY c.gap DESC NULLS LAST LIMIT %s OFFSET %s"
        params.extend([limit, offset])

        cursor.execute(base_query, params)
        rows = cursor.fetchall()
        cursor.close()

        productos = []
        for row in rows:
            # Row indices:
            # 0: producto_id, 1: codigo, 2: descripcion, 3: categoria
            # 4: venta_30d, 5: tickets_30d, 6: penetracion_pct
            # 7: rank_venta, 8: rank_penetracion, 9: gap, 10: clase_abc
            # 11: es_generador_trafico, 12: generador_trafico_sugerido
            # 13: generador_trafico_ignorado, 14: fecha_marcado, 15: fecha_sugerido

            es_generador = row[11] or False
            es_sugerido = row[12] or False
            es_ignorado = row[13] or False

            # Determinar estado para UI
            if es_generador:
                estado = 'activo'
            elif es_ignorado:
                estado = 'ignorado'
            elif es_sugerido:
                estado = 'sugerido'
            else:
                estado = 'ninguno'

            productos.append(GeneradorTraficoItem(
                producto_id=row[0],
                codigo=row[1] or row[0],
                descripcion=row[2] or 'Sin descripción',
                categoria=row[3],
                venta_30d=float(row[4]) if row[4] else 0.0,
                tickets_30d=row[5] or 0,
                penetracion_pct=float(row[6]) if row[6] else 0.0,
                rank_venta=row[7] or 9999,
                rank_penetracion=row[8] or 9999,
                gap=row[9] or 0,
                clase_abc=row[10] or 'C',
                es_generador_trafico=es_generador,
                generador_trafico_sugerido=es_sugerido,
                generador_trafico_ignorado=es_ignorado,
                fecha_marcado=row[14],
                fecha_sugerido=row[15],
                estado=estado
            ))

        return {"productos": productos, "total": len(productos)}

    except Exception as e:
        logger.error(f"Error listando productos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS: ACCIONES
# ============================================================================

@router.post("/marcar")
async def marcar_generador_trafico(
    request: MarcarGeneradorRequest,
    conn: Any = Depends(get_db_write)
):
    """
    Marcar, aprobar o rechazar un producto como generador de tráfico.

    Acciones:
    - aprobar: Marca el producto como generador de tráfico activo
    - rechazar: Ignora la sugerencia (no volver a sugerir)
    - remover: Quita el status de generador de tráfico
    """
    try:
        cursor = conn.cursor()

        # Obtener métricas actuales del producto
        cursor.execute("""
            SELECT
                p.generador_trafico_gap,
                COALESCE(SUM(v.venta_total), 0) as venta_30d,
                COUNT(DISTINCT regexp_replace(v.numero_factura, '_L[0-9]+$', '')) as tickets_30d
            FROM productos p
            LEFT JOIN ventas v ON v.producto_id = p.id
                AND v.fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
            WHERE p.id = %s
            GROUP BY p.id, p.generador_trafico_gap
        """, (request.producto_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Producto no encontrado")

        gap_score = row[0]
        venta_30d = float(row[1]) if row[1] else 0.0
        tickets_30d = row[2] or 0

        # Ejecutar acción
        if request.accion == 'aprobar':
            cursor.execute("""
                UPDATE productos
                SET es_generador_trafico = TRUE,
                    generador_trafico_fecha_marcado = NOW(),
                    generador_trafico_ignorado = FALSE
                WHERE id = %s
            """, (request.producto_id,))
            accion_historial = 'aprobado'

        elif request.accion == 'rechazar':
            cursor.execute("""
                UPDATE productos
                SET generador_trafico_ignorado = TRUE,
                    generador_trafico_sugerido = FALSE
                WHERE id = %s
            """, (request.producto_id,))
            accion_historial = 'rechazado'

        elif request.accion == 'remover':
            cursor.execute("""
                UPDATE productos
                SET es_generador_trafico = FALSE,
                    generador_trafico_fecha_marcado = NULL
                WHERE id = %s
            """, (request.producto_id,))
            accion_historial = 'removido'

        else:
            raise HTTPException(status_code=400, detail=f"Acción no válida: {request.accion}")

        # Registrar en historial
        cursor.execute("""
            INSERT INTO generadores_trafico_historial
            (producto_id, accion, gap_score, venta_30d, tickets_30d, comentario)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (request.producto_id, accion_historial, gap_score, venta_30d, tickets_30d, request.comentario))

        conn.commit()
        cursor.close()

        return {"success": True, "mensaje": f"Producto {request.accion} correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error marcando generador: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS: CÁLCULO DE SUGERENCIAS
# ============================================================================

@router.post("/calcular-sugerencias", response_model=CalculoSugerenciasResult)
async def calcular_sugerencias(
    background_tasks: BackgroundTasks,
    conn: Any = Depends(get_db_write)
):
    """
    Calcular y actualizar sugerencias de generadores de tráfico.
    Usa la tabla cache pre-calculada para rendimiento óptimo.
    """
    import time
    start_time = time.time()

    try:
        cursor = conn.cursor()

        # Obtener configuración
        cursor.execute("""
            SELECT parametro, valor FROM config_generadores_trafico
            WHERE parametro IN ('gap_minimo', 'producto_excluido_bolsas')
        """)
        config = {row[0]: row[1] for row in cursor.fetchall()}
        gap_minimo = int(config.get('gap_minimo', 400))

        # Usar tabla cache para obtener candidatos (mucho más rápido)
        # El GAP es el único criterio - no restringimos por Clase ABC
        cursor.execute("""
            SELECT producto_id, gap, clase_abc, venta_30d, tickets_30d
            FROM productos_abc_cache
            WHERE gap >= %s
        """, (gap_minimo,))

        candidatos = cursor.fetchall()

        # Actualizar sugerencias
        nuevas_sugerencias = 0
        for producto_id, gap, clase_abc, venta_30d, tickets_30d in candidatos:
            cursor.execute("""
                UPDATE productos
                SET generador_trafico_sugerido = CASE
                        WHEN COALESCE(es_generador_trafico, FALSE) = FALSE
                         AND COALESCE(generador_trafico_ignorado, FALSE) = FALSE
                        THEN TRUE
                        ELSE generador_trafico_sugerido
                    END,
                    generador_trafico_gap = %s,
                    generador_trafico_fecha_sugerido = NOW()
                WHERE id = %s
                  AND COALESCE(es_generador_trafico, FALSE) = FALSE
                  AND COALESCE(generador_trafico_ignorado, FALSE) = FALSE
                  AND COALESCE(generador_trafico_sugerido, FALSE) = FALSE
                RETURNING id
            """, (gap, producto_id))
            if cursor.fetchone():
                nuevas_sugerencias += 1
                # Registrar en historial
                cursor.execute("""
                    INSERT INTO generadores_trafico_historial
                    (producto_id, accion, gap_score, venta_30d, tickets_30d, clase_abc)
                    VALUES (%s, 'sugerido', %s, %s, %s, %s)
                """, (producto_id, gap, float(venta_30d) if venta_30d else 0, tickets_30d, clase_abc))

        # Remover sugerencias de productos que ya no califican (usando cache)
        # Solo verificamos GAP, no Clase ABC
        cursor.execute("""
            UPDATE productos
            SET generador_trafico_sugerido = FALSE
            WHERE generador_trafico_sugerido = TRUE
              AND id NOT IN (
                  SELECT producto_id
                  FROM productos_abc_cache
                  WHERE gap >= %s
              )
            RETURNING id
        """, (gap_minimo,))
        sugerencias_removidas = cursor.rowcount

        conn.commit()
        cursor.close()

        elapsed_ms = int((time.time() - start_time) * 1000)

        return CalculoSugerenciasResult(
            productos_analizados=len(candidatos),
            nuevas_sugerencias=nuevas_sugerencias,
            sugerencias_removidas=sugerencias_removidas,
            tiempo_ejecucion_ms=elapsed_ms
        )

    except Exception as e:
        conn.rollback()
        logger.error(f"Error calculando sugerencias: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS: CONFIGURACIÓN
# ============================================================================

@router.get("/config", response_model=ConfigGeneradorTrafico)
async def get_config(conn: Any = Depends(get_db)):
    """Obtener configuración actual del módulo"""
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT parametro, valor FROM config_generadores_trafico")
        config = {row[0]: row[1] for row in cursor.fetchall()}
        cursor.close()

        return ConfigGeneradorTrafico(
            gap_minimo=int(config.get('gap_minimo', 400)),
            clase_abc_requerida=config.get('clase_abc_requerida', 'C'),
            stock_seguridad_extra_pct=int(config.get('stock_seguridad_extra_pct', 50)),
            producto_excluido_bolsas=config.get('producto_excluido_bolsas', '003760'),
            dias_analisis=int(config.get('dias_analisis', 30)),
            frecuencia_calculo=config.get('frecuencia_calculo', 'diario')
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config")
async def update_config(
    parametro: str,
    valor: str,
    conn: Any = Depends(get_db_write)
):
    """Actualizar un parámetro de configuración"""
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE config_generadores_trafico
            SET valor = %s, updated_at = NOW()
            WHERE parametro = %s
            RETURNING parametro
        """, (valor, parametro))

        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail=f"Parámetro {parametro} no encontrado")

        conn.commit()
        cursor.close()

        return {"success": True, "mensaje": f"Parámetro {parametro} actualizado a {valor}"}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS: HISTORIAL
# ============================================================================

@router.get("/historial/{producto_id}")
async def get_historial_producto(
    producto_id: str,
    limit: int = 20,
    conn: Any = Depends(get_db)
):
    """Obtener historial de cambios de un producto"""
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                id, producto_id, accion, gap_score,
                venta_30d, tickets_30d, penetracion_pct,
                clase_abc, usuario, comentario, fecha
            FROM generadores_trafico_historial
            WHERE producto_id = %s
            ORDER BY fecha DESC
            LIMIT %s
        """, (producto_id, limit))

        rows = cursor.fetchall()
        cursor.close()

        return [
            {
                "id": row[0],
                "producto_id": row[1],
                "accion": row[2],
                "gap_score": row[3],
                "venta_30d": float(row[4]) if row[4] else None,
                "tickets_30d": row[5],
                "penetracion_pct": float(row[6]) if row[6] else None,
                "clase_abc": row[7],
                "usuario": row[8],
                "comentario": row[9],
                "fecha": row[10].isoformat() if row[10] else None
            }
            for row in rows
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS: CACHE ABC
# ============================================================================

@router.post("/recalcular-abc", response_model=RecalcularABCResult)
async def recalcular_abc_cache_endpoint(
    dias: int = 30,
    incluir_por_tienda: bool = True,
    conn: Any = Depends(get_db_write)
):
    """
    Recalcular las tablas cache de clasificación ABC.

    Este proceso recalcula:
    1. productos_abc_cache - ABC global (ranking por cantidad vendida)
    2. productos_abc_tienda - ABC por cada tienda (si incluir_por_tienda=True)

    Parámetros:
    - dias: Período de análisis (default: 30 días)
    - incluir_por_tienda: Si True, también recalcula ABC por tienda (default: True)

    Tiempo estimado: ~30-60 segundos para global, +30-60 segundos para por tienda
    """
    try:
        cursor = conn.cursor()

        # Obtener producto excluido de configuración
        cursor.execute("""
            SELECT valor FROM config_generadores_trafico
            WHERE parametro = 'producto_excluido_bolsas'
        """)
        row = cursor.fetchone()
        producto_excluido = row[0] if row else '003760'

        # Obtener umbrales ABC de configuración
        cursor.execute("""
            SELECT parametro, valor_numerico
            FROM config_inventario_global
            WHERE categoria = 'abc_umbrales_ranking'
        """)
        umbrales = {row[0]: int(row[1]) for row in cursor.fetchall()}
        umbral_a = umbrales.get('umbral_a', 50)
        umbral_b = umbrales.get('umbral_b', 200)
        umbral_c = umbrales.get('umbral_c', 800)

        logger.info(f"Recalculando ABC cache: dias={dias}, umbrales=A:{umbral_a}, B:{umbral_b}, C:{umbral_c}")

        # 1. Ejecutar función de recálculo GLOBAL
        cursor.execute(
            "SELECT * FROM recalcular_abc_cache(%s, %s, %s, %s, %s)",
            (dias, producto_excluido, umbral_a, umbral_b, umbral_c)
        )
        result_global = cursor.fetchone()

        # 2. Ejecutar función de recálculo POR TIENDA (si se solicita)
        tiendas_procesadas = 0
        productos_por_tienda = 0
        tiempo_por_tienda_ms = 0

        if incluir_por_tienda:
            logger.info("Recalculando ABC por tienda...")
            cursor.execute(
                "SELECT * FROM recalcular_abc_por_tienda(%s, %s, %s, %s, %s)",
                (dias, producto_excluido, umbral_a, umbral_b, umbral_c)
            )
            result_tienda = cursor.fetchone()
            tiendas_procesadas = result_tienda[0] if result_tienda else 0
            productos_por_tienda = result_tienda[1] if result_tienda else 0
            tiempo_por_tienda_ms = result_tienda[2] if result_tienda else 0

        conn.commit()
        cursor.close()

        logger.info(
            f"ABC cache recalculado: {result_global[0]} productos globales, "
            f"{productos_por_tienda} productos por tienda en {tiendas_procesadas} tiendas"
        )

        return RecalcularABCResult(
            productos_procesados=result_global[0],
            tiempo_ejecucion_ms=result_global[1],
            productos_a=result_global[2],
            productos_b=result_global[3],
            productos_c=result_global[4],
            productos_d=result_global[5] if len(result_global) > 5 else 0,
            fecha_calculo=datetime.now().isoformat(),
            tiendas_procesadas=tiendas_procesadas,
            productos_por_tienda=productos_por_tienda,
            tiempo_por_tienda_ms=tiempo_por_tienda_ms
        )

    except Exception as e:
        conn.rollback()
        logger.error(f"Error recalculando ABC cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/abc-cache-status")
async def get_abc_cache_status(conn: Any = Depends(get_db)):
    """
    Obtener estado actual de la cache ABC.
    """
    try:
        cursor = conn.cursor()

        # Estado de la cache
        cursor.execute("""
            SELECT
                COUNT(*) as total_productos,
                COUNT(*) FILTER (WHERE clase_abc = 'A') as productos_a,
                COUNT(*) FILTER (WHERE clase_abc = 'B') as productos_b,
                COUNT(*) FILTER (WHERE clase_abc = 'C') as productos_c,
                MIN(fecha_calculo) as fecha_calculo,
                MIN(periodo_inicio) as periodo_inicio,
                MAX(periodo_fin) as periodo_fin
            FROM productos_abc_cache
        """)
        cache_row = cursor.fetchone()

        # Último recálculo
        cursor.execute("""
            SELECT fecha_inicio, fecha_fin, estado, productos_procesados, tiempo_ejecucion_ms
            FROM abc_cache_control
            WHERE estado = 'completado'
            ORDER BY fecha_fin DESC
            LIMIT 1
        """)
        control_row = cursor.fetchone()

        cursor.close()

        return {
            "cache": {
                "total_productos": cache_row[0] if cache_row else 0,
                "productos_a": cache_row[1] if cache_row else 0,
                "productos_b": cache_row[2] if cache_row else 0,
                "productos_c": cache_row[3] if cache_row else 0,
                "fecha_calculo": cache_row[4].isoformat() if cache_row and cache_row[4] else None,
                "periodo_inicio": str(cache_row[5]) if cache_row and cache_row[5] else None,
                "periodo_fin": str(cache_row[6]) if cache_row and cache_row[6] else None,
            },
            "ultimo_recalculo": {
                "fecha_inicio": control_row[0].isoformat() if control_row and control_row[0] else None,
                "fecha_fin": control_row[1].isoformat() if control_row and control_row[1] else None,
                "estado": control_row[2] if control_row else None,
                "productos_procesados": control_row[3] if control_row else None,
                "tiempo_ms": control_row[4] if control_row else None,
            } if control_row else None
        }

    except Exception as e:
        logger.error(f"Error obteniendo estado cache ABC: {e}")
        raise HTTPException(status_code=500, detail=str(e))
