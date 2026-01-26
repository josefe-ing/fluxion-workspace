"""
Router de Business Intelligence - Análisis por Tienda.

Endpoints para análisis detallado de tiendas individuales y comparativos.
Incluye evolución temporal, KPIs de red, heatmaps y comparaciones multi-tienda.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List, Any
from datetime import datetime, timedelta
import logging

from db_manager import get_db_connection
from auth import require_super_admin, UsuarioConRol

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bi/stores", tags=["BI - Stores"])


def get_db():
    """Dependency para obtener conexión a la base de datos."""
    with get_db_connection() as conn:
        yield conn


# =============================================================================
# NETWORK KPIs - Métricas Consolidadas de Red
# =============================================================================

@router.get("/network/kpis")
async def get_network_kpis(
    fecha_inicio: str = Query(..., description="Fecha inicio YYYY-MM-DD"),
    fecha_fin: str = Query(..., description="Fecha fin YYYY-MM-DD"),
    comparar_con: str = Query("anterior", regex="^(anterior|ano_anterior)$"),
    region: Optional[str] = None,
    current_user: UsuarioConRol = Depends(require_super_admin),
    conn: Any = Depends(get_db)
):
    """
    KPIs consolidados de toda la red de tiendas con comparación temporal.

    Retorna métricas del período seleccionado y su comparación con:
    - Período anterior (mismo número de días hacia atrás)
    - Mismo período del año anterior

    **Parámetros:**
    - fecha_inicio: Fecha de inicio del período (YYYY-MM-DD)
    - fecha_fin: Fecha de fin del período (YYYY-MM-DD)
    - comparar_con: 'anterior' o 'ano_anterior'
    - region: Filtrar por región (opcional): 'VALENCIA' o 'CARACAS'

    **Retorna:**
    ```json
    {
        "periodo_actual": {
            "ventas_total": 1234567.50,
            "tickets": 45230,
            "ticket_promedio": 27.30,
            "margen_pct": 24.3,
            "items_totales": 378450
        },
        "periodo_comparacion": {...},
        "variacion": {
            "ventas_pct": 8.2,
            "tickets_pct": 5.1,
            "ticket_promedio_pct": 2.9,
            "margen_pct": -0.5
        }
    }
    ```
    """
    try:
        cursor = conn.cursor()

        # Validar fechas
        try:
            inicio = datetime.strptime(fecha_inicio, "%Y-%m-%d")
            fin = datetime.strptime(fecha_fin, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "Formato de fecha inválido. Use YYYY-MM-DD")

        if inicio > fin:
            raise HTTPException(400, "fecha_inicio debe ser anterior a fecha_fin")

        # Calcular período de comparación
        dias_periodo = (fin - inicio).days + 1

        if comparar_con == "anterior":
            # Mismo número de días hacia atrás
            fecha_inicio_comp = inicio - timedelta(days=dias_periodo)
            fecha_fin_comp = inicio - timedelta(days=1)
        else:  # ano_anterior
            fecha_inicio_comp = inicio - timedelta(days=365)
            fecha_fin_comp = fin - timedelta(days=365)

        # Build WHERE clauses
        where_actual = ["v.fecha_venta::date >= %s", "v.fecha_venta::date <= %s"]
        params_actual = [fecha_inicio, fecha_fin]

        where_comp = ["v.fecha_venta::date >= %s", "v.fecha_venta::date <= %s"]
        params_comp = [fecha_inicio_comp.strftime("%Y-%m-%d"), fecha_fin_comp.strftime("%Y-%m-%d")]

        if region:
            where_actual.append("u.region = %s")
            params_actual.append(region.upper())
            where_comp.append("u.region = %s")
            params_comp.append(region.upper())

        # Query para período actual
        query_actual = f"""
            SELECT
                COALESCE(SUM(v.venta_total), 0) as ventas_total,
                COUNT(DISTINCT v.numero_factura) as tickets,
                COALESCE(SUM(v.venta_total) / NULLIF(COUNT(DISTINCT v.numero_factura), 0), 0) as ticket_promedio,
                COALESCE((SUM(v.utilidad_bruta) / NULLIF(SUM(v.venta_total), 0)) * 100, 0) as margen_pct,
                COALESCE(SUM(v.cantidad_vendida), 0) as items_totales
            FROM ventas v
            JOIN ubicaciones u ON v.ubicacion_id = u.id
            WHERE {' AND '.join(where_actual)}
              AND u.tipo = 'tienda'
        """

        cursor.execute(query_actual, params_actual)
        row_actual = cursor.fetchone()

        periodo_actual = {
            "ventas_total": round(float(row_actual[0]), 2),
            "tickets": int(row_actual[1]),
            "ticket_promedio": round(float(row_actual[2]), 2),
            "margen_pct": round(float(row_actual[3]), 2),
            "items_totales": int(row_actual[4])
        }

        # Query para período de comparación
        query_comp = f"""
            SELECT
                COALESCE(SUM(v.venta_total), 0) as ventas_total,
                COUNT(DISTINCT v.numero_factura) as tickets,
                COALESCE(SUM(v.venta_total) / NULLIF(COUNT(DISTINCT v.numero_factura), 0), 0) as ticket_promedio,
                COALESCE((SUM(v.utilidad_bruta) / NULLIF(SUM(v.venta_total), 0)) * 100, 0) as margen_pct,
                COALESCE(SUM(v.cantidad_vendida), 0) as items_totales
            FROM ventas v
            JOIN ubicaciones u ON v.ubicacion_id = u.id
            WHERE {' AND '.join(where_comp)}
              AND u.tipo = 'tienda'
        """

        cursor.execute(query_comp, params_comp)
        row_comp = cursor.fetchone()

        periodo_comparacion = {
            "ventas_total": round(float(row_comp[0]), 2),
            "tickets": int(row_comp[1]),
            "ticket_promedio": round(float(row_comp[2]), 2),
            "margen_pct": round(float(row_comp[3]), 2),
            "items_totales": int(row_comp[4])
        }

        # Calcular variaciones porcentuales
        def calc_variacion(actual: float, comparacion: float) -> float:
            if comparacion == 0:
                return 0.0
            return round(((actual - comparacion) / comparacion) * 100, 1)

        variacion = {
            "ventas_pct": calc_variacion(periodo_actual["ventas_total"], periodo_comparacion["ventas_total"]),
            "tickets_pct": calc_variacion(periodo_actual["tickets"], periodo_comparacion["tickets"]),
            "ticket_promedio_pct": calc_variacion(periodo_actual["ticket_promedio"], periodo_comparacion["ticket_promedio"]),
            "margen_pct": round(periodo_actual["margen_pct"] - periodo_comparacion["margen_pct"], 1),  # Diferencia absoluta
            "items_totales_pct": calc_variacion(periodo_actual["items_totales"], periodo_comparacion["items_totales"])
        }

        cursor.close()

        return {
            "periodo_actual": periodo_actual,
            "periodo_comparacion": periodo_comparacion,
            "variacion": variacion,
            "metadata": {
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin,
                "fecha_inicio_comp": fecha_inicio_comp.strftime("%Y-%m-%d"),
                "fecha_fin_comp": fecha_fin_comp.strftime("%Y-%m-%d"),
                "comparar_con": comparar_con,
                "region": region,
                "dias_periodo": dias_periodo
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en get_network_kpis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# STORE EVOLUTION - Evolución Temporal de Tienda
# =============================================================================

@router.get("/{ubicacion_id}/evolution")
async def get_store_evolution(
    ubicacion_id: str,
    fecha_inicio: str = Query(..., description="Fecha inicio YYYY-MM-DD"),
    fecha_fin: str = Query(..., description="Fecha fin YYYY-MM-DD"),
    current_user: UsuarioConRol = Depends(require_super_admin),
    conn: Any = Depends(get_db)
):
    """
    Evolución diaria de ventas de una tienda específica.

    Retorna serie temporal con métricas diarias y comparación con promedio de red.

    **Parámetros:**
    - ubicacion_id: ID de la tienda (ej: 'tienda_01')
    - fecha_inicio: Fecha de inicio (YYYY-MM-DD)
    - fecha_fin: Fecha de fin (YYYY-MM-DD)

    **Retorna:**
    ```json
    {
        "tienda": {
            "ubicacion_id": "tienda_01",
            "nombre": "GUACARA",
            "region": "VALENCIA"
        },
        "evolution": [
            {
                "fecha": "2026-01-15",
                "ventas": 12543.50,
                "tickets": 450,
                "ticket_promedio": 27.87,
                "items_vendidos": 3821,
                "margen_pct": 24.3
            }
        ],
        "promedio_red": [
            {
                "fecha": "2026-01-15",
                "ventas_promedio": 9876.20
            }
        ],
        "totales": {
            "ventas": 345678.90,
            "tickets": 12450,
            "ticket_promedio": 27.76
        }
    }
    ```
    """
    try:
        cursor = conn.cursor()

        # Validar fechas
        try:
            datetime.strptime(fecha_inicio, "%Y-%m-%d")
            datetime.strptime(fecha_fin, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "Formato de fecha inválido. Use YYYY-MM-DD")

        # Verificar que la tienda existe
        cursor.execute("""
            SELECT id, nombre, region
            FROM ubicaciones
            WHERE id = %s AND tipo = 'tienda'
        """, (ubicacion_id,))

        tienda_row = cursor.fetchone()
        if not tienda_row:
            raise HTTPException(404, f"Tienda {ubicacion_id} no encontrada")

        tienda_info = {
            "ubicacion_id": tienda_row[0],
            "nombre": tienda_row[1],
            "region": tienda_row[2]
        }

        # Evolución diaria de la tienda
        cursor.execute("""
            SELECT
                fecha_venta::date as fecha,
                SUM(venta_total) as ventas,
                COUNT(DISTINCT numero_factura) as tickets,
                SUM(venta_total) / NULLIF(COUNT(DISTINCT numero_factura), 0) as ticket_promedio,
                SUM(cantidad_vendida) as items_vendidos,
                (SUM(utilidad_bruta) / NULLIF(SUM(venta_total), 0)) * 100 as margen_pct
            FROM ventas
            WHERE ubicacion_id = %s
              AND fecha_venta::date >= %s::date
              AND fecha_venta::date <= %s::date
            GROUP BY fecha_venta::date
            ORDER BY fecha
        """, (ubicacion_id, fecha_inicio, fecha_fin))

        evolution = []
        for row in cursor.fetchall():
            evolution.append({
                "fecha": str(row[0]),
                "ventas": round(float(row[1]) if row[1] else 0, 2),
                "tickets": int(row[2]) if row[2] else 0,
                "ticket_promedio": round(float(row[3]) if row[3] else 0, 2),
                "items_vendidos": int(row[4]) if row[4] else 0,
                "margen_pct": round(float(row[5]) if row[5] else 0, 2)
            })

        # Promedio de la red (todas las tiendas) por día
        cursor.execute("""
            SELECT
                fecha_venta::date as fecha,
                AVG(ventas_diarias) as ventas_promedio
            FROM (
                SELECT
                    ubicacion_id,
                    fecha_venta::date,
                    SUM(venta_total) as ventas_diarias
                FROM ventas
                WHERE fecha_venta::date >= %s::date
                  AND fecha_venta::date <= %s::date
                  AND ubicacion_id IN (
                      SELECT id FROM ubicaciones WHERE tipo = 'tienda'
                  )
                GROUP BY ubicacion_id, fecha_venta::date
            ) sub
            GROUP BY fecha_venta::date
            ORDER BY fecha
        """, (fecha_inicio, fecha_fin))

        promedio_red = []
        for row in cursor.fetchall():
            promedio_red.append({
                "fecha": str(row[0]),
                "ventas_promedio": round(float(row[1]) if row[1] else 0, 2)
            })

        # Totales del período
        cursor.execute("""
            SELECT
                SUM(venta_total) as ventas,
                COUNT(DISTINCT numero_factura) as tickets,
                SUM(venta_total) / NULLIF(COUNT(DISTINCT numero_factura), 0) as ticket_promedio,
                (SUM(utilidad_bruta) / NULLIF(SUM(venta_total), 0)) * 100 as margen_pct
            FROM ventas
            WHERE ubicacion_id = %s
              AND fecha_venta::date >= %s::date
              AND fecha_venta::date <= %s::date
        """, (ubicacion_id, fecha_inicio, fecha_fin))

        totales_row = cursor.fetchone()
        totales = {
            "ventas": round(float(totales_row[0]) if totales_row[0] else 0, 2),
            "tickets": int(totales_row[1]) if totales_row[1] else 0,
            "ticket_promedio": round(float(totales_row[2]) if totales_row[2] else 0, 2),
            "margen_pct": round(float(totales_row[3]) if totales_row[3] else 0, 2)
        }

        cursor.close()

        return {
            "tienda": tienda_info,
            "evolution": evolution,
            "promedio_red": promedio_red,
            "totales": totales,
            "metadata": {
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin,
                "dias_totales": len(evolution)
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en get_store_evolution: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# HOURLY HEATMAP - Análisis de Ventas por Hora
# =============================================================================

@router.get("/{ubicacion_id}/hourly-heatmap")
async def get_hourly_heatmap(
    ubicacion_id: str,
    dias: int = Query(30, description="Días hacia atrás para análisis"),
    current_user: UsuarioConRol = Depends(require_super_admin),
    conn: Any = Depends(get_db)
):
    """
    Heatmap de ventas por hora del día y día de semana (7x24).

    Retorna matriz de ventas distribuidas por:
    - Día de semana (0=Domingo, 6=Sábado)
    - Hora del día (0-23)

    **Parámetros:**
    - ubicacion_id: ID de la tienda (ej: 'tienda_01')
    - dias: Días hacia atrás para análisis (default: 30)

    **Retorna:**
    ```json
    {
        "tienda": {
            "ubicacion_id": "tienda_01",
            "nombre": "GUACARA"
        },
        "heatmap": [
            {
                "dia_semana": 0,
                "dia_nombre": "Domingo",
                "hora": 8,
                "ventas": 12543.50,
                "tickets": 450,
                "pct_total": 2.3
            }
        ],
        "hora_pico": {
            "dia_semana": 5,
            "dia_nombre": "Viernes",
            "hora": 18,
            "ventas": 45678.90
        },
        "metadata": {
            "dias_analizados": 30,
            "total_ventas": 1234567.89
        }
    }
    ```
    """
    try:
        cursor = conn.cursor()

        # Validar que la tienda existe
        cursor.execute("""
            SELECT id, nombre
            FROM ubicaciones
            WHERE id = %s AND tipo = 'tienda'
        """, (ubicacion_id,))

        tienda_row = cursor.fetchone()
        if not tienda_row:
            raise HTTPException(404, f"Tienda {ubicacion_id} no encontrada")

        tienda_info = {
            "ubicacion_id": tienda_row[0],
            "nombre": tienda_row[1]
        }

        # Nombres de días de semana en español
        dias_semana = {
            0: "Domingo",
            1: "Lunes",
            2: "Martes",
            3: "Miércoles",
            4: "Jueves",
            5: "Viernes",
            6: "Sábado"
        }

        # Query para heatmap de ventas por día y hora
        cursor.execute("""
            WITH heatmap_data AS (
                SELECT
                    EXTRACT(DOW FROM fecha_venta)::int as dia_semana,
                    EXTRACT(HOUR FROM fecha_venta)::int as hora,
                    SUM(venta_total) as ventas,
                    COUNT(DISTINCT numero_factura) as tickets
                FROM ventas
                WHERE ubicacion_id = %s
                  AND fecha_venta >= CURRENT_DATE - INTERVAL '%s days'
                GROUP BY dia_semana, hora
            ),
            total_ventas AS (
                SELECT SUM(venta_total) as total
                FROM ventas
                WHERE ubicacion_id = %s
                  AND fecha_venta >= CURRENT_DATE - INTERVAL '%s days'
            )
            SELECT
                h.dia_semana,
                h.hora,
                h.ventas,
                h.tickets,
                ROUND((h.ventas / NULLIF(t.total, 0)) * 100, 2) as pct_total
            FROM heatmap_data h
            CROSS JOIN total_ventas t
            ORDER BY h.dia_semana, h.hora
        """, (ubicacion_id, dias, ubicacion_id, dias))

        heatmap = []
        for row in cursor.fetchall():
            heatmap.append({
                "dia_semana": int(row[0]),
                "dia_nombre": dias_semana.get(int(row[0]), "Desconocido"),
                "hora": int(row[1]),
                "ventas": round(float(row[2]) if row[2] else 0, 2),
                "tickets": int(row[3]) if row[3] else 0,
                "pct_total": round(float(row[4]) if row[4] else 0, 2)
            })

        # Identificar hora pico (día y hora con mayores ventas)
        cursor.execute("""
            SELECT
                EXTRACT(DOW FROM fecha_venta)::int as dia_semana,
                EXTRACT(HOUR FROM fecha_venta)::int as hora,
                SUM(venta_total) as ventas
            FROM ventas
            WHERE ubicacion_id = %s
              AND fecha_venta >= CURRENT_DATE - INTERVAL '%s days'
            GROUP BY dia_semana, hora
            ORDER BY ventas DESC
            LIMIT 1
        """, (ubicacion_id, dias))

        hora_pico_row = cursor.fetchone()
        hora_pico = None
        if hora_pico_row:
            hora_pico = {
                "dia_semana": int(hora_pico_row[0]),
                "dia_nombre": dias_semana.get(int(hora_pico_row[0]), "Desconocido"),
                "hora": int(hora_pico_row[1]),
                "ventas": round(float(hora_pico_row[2]) if hora_pico_row[2] else 0, 2)
            }

        # Total de ventas del período
        cursor.execute("""
            SELECT COALESCE(SUM(venta_total), 0) as total
            FROM ventas
            WHERE ubicacion_id = %s
              AND fecha_venta >= CURRENT_DATE - INTERVAL '%s days'
        """, (ubicacion_id, dias))

        total_ventas = round(float(cursor.fetchone()[0]), 2)

        cursor.close()

        return {
            "tienda": tienda_info,
            "heatmap": heatmap,
            "hora_pico": hora_pico,
            "metadata": {
                "dias_analizados": dias,
                "total_ventas": total_ventas
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en get_hourly_heatmap: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# CATEGORIES - Top Categorías de Tienda
# =============================================================================

@router.get("/{ubicacion_id}/categories")
async def get_store_categories(
    ubicacion_id: str,
    fecha_inicio: str = Query(..., description="Fecha inicio YYYY-MM-DD"),
    fecha_fin: str = Query(..., description="Fecha fin YYYY-MM-DD"),
    top: int = Query(10, description="Top N categorías"),
    current_user: UsuarioConRol = Depends(require_super_admin),
    conn: Any = Depends(get_db)
):
    """
    Top categorías de una tienda con métricas de ventas y margen.

    Excluye productos marcados como "SIN CATEGORIA".

    **Parámetros:**
    - ubicacion_id: ID de la tienda (ej: 'tienda_01')
    - fecha_inicio: Fecha de inicio (YYYY-MM-DD)
    - fecha_fin: Fecha de fin (YYYY-MM-DD)
    - top: Número de categorías a retornar (default: 10)

    **Retorna:**
    ```json
    {
        "tienda": {
            "ubicacion_id": "tienda_01",
            "nombre": "GUACARA"
        },
        "categorias": [
            {
                "categoria": "Viveres",
                "ventas_total": 123456.78,
                "pct_ventas": 23.4,
                "margen_pct": 24.5,
                "productos_vendidos": 127,
                "tickets": 8450
            }
        ],
        "totales": {
            "ventas_total": 528900.45,
            "categorias_activas": 10
        }
    }
    ```
    """
    try:
        cursor = conn.cursor()

        # Validar fechas
        try:
            datetime.strptime(fecha_inicio, "%Y-%m-%d")
            datetime.strptime(fecha_fin, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "Formato de fecha inválido. Use YYYY-MM-DD")

        # Validar que la tienda existe
        cursor.execute("""
            SELECT id, nombre
            FROM ubicaciones
            WHERE id = %s AND tipo = 'tienda'
        """, (ubicacion_id,))

        tienda_row = cursor.fetchone()
        if not tienda_row:
            raise HTTPException(404, f"Tienda {ubicacion_id} no encontrada")

        tienda_info = {
            "ubicacion_id": tienda_row[0],
            "nombre": tienda_row[1]
        }

        # Query para top categorías
        cursor.execute("""
            WITH categoria_stats AS (
                SELECT
                    p.categoria,
                    SUM(v.venta_total) as ventas_total,
                    SUM(v.utilidad_bruta) as utilidad_total,
                    COUNT(DISTINCT v.producto_id) as productos_vendidos,
                    COUNT(DISTINCT v.numero_factura) as tickets
                FROM ventas v
                JOIN productos p ON v.producto_id = p.id
                WHERE v.ubicacion_id = %s
                  AND v.fecha_venta::date >= %s::date
                  AND v.fecha_venta::date <= %s::date
                  AND p.categoria IS NOT NULL
                  AND p.categoria != 'SIN CATEGORIA'
                  AND TRIM(p.categoria) != ''
                GROUP BY p.categoria
            ),
            totales AS (
                SELECT SUM(ventas_total) as total_ventas
                FROM categoria_stats
            )
            SELECT
                cs.categoria,
                cs.ventas_total,
                ROUND((cs.ventas_total / NULLIF(t.total_ventas, 0)) * 100, 2) as pct_ventas,
                ROUND((cs.utilidad_total / NULLIF(cs.ventas_total, 0)) * 100, 2) as margen_pct,
                cs.productos_vendidos,
                cs.tickets
            FROM categoria_stats cs
            CROSS JOIN totales t
            ORDER BY cs.ventas_total DESC
            LIMIT %s
        """, (ubicacion_id, fecha_inicio, fecha_fin, top))

        categorias = []
        for row in cursor.fetchall():
            categorias.append({
                "categoria": row[0],
                "ventas_total": round(float(row[1]) if row[1] else 0, 2),
                "pct_ventas": round(float(row[2]) if row[2] else 0, 2),
                "margen_pct": round(float(row[3]) if row[3] else 0, 2),
                "productos_vendidos": int(row[4]) if row[4] else 0,
                "tickets": int(row[5]) if row[5] else 0
            })

        # Totales generales
        cursor.execute("""
            SELECT
                COALESCE(SUM(v.venta_total), 0) as ventas_total,
                COUNT(DISTINCT p.categoria) as categorias_activas
            FROM ventas v
            JOIN productos p ON v.producto_id = p.id
            WHERE v.ubicacion_id = %s
              AND v.fecha_venta::date >= %s::date
              AND v.fecha_venta::date <= %s::date
              AND p.categoria IS NOT NULL
              AND p.categoria != 'SIN CATEGORIA'
              AND TRIM(p.categoria) != ''
        """, (ubicacion_id, fecha_inicio, fecha_fin))

        totales_row = cursor.fetchone()
        totales = {
            "ventas_total": round(float(totales_row[0]), 2),
            "categorias_activas": int(totales_row[1]) if totales_row[1] else 0
        }

        cursor.close()

        return {
            "tienda": tienda_info,
            "categorias": categorias,
            "totales": totales,
            "metadata": {
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin,
                "top": top
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en get_store_categories: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# TICKET DISTRIBUTION - Distribución de Tickets por Rangos
# =============================================================================

@router.get("/{ubicacion_id}/ticket-distribution")
async def get_ticket_distribution(
    ubicacion_id: str,
    fecha_inicio: str = Query(..., description="Fecha inicio YYYY-MM-DD"),
    fecha_fin: str = Query(..., description="Fecha fin YYYY-MM-DD"),
    current_user: UsuarioConRol = Depends(require_super_admin),
    conn: Any = Depends(get_db)
):
    """
    Distribución de tickets por rangos de valor de compra.

    Agrupa tickets en rangos predefinidos ($0-5, $5-15, $15-30, $30-50, $50+)
    para análisis de comportamiento de compra.

    **Parámetros:**
    - ubicacion_id: ID de la tienda (ej: 'tienda_01')
    - fecha_inicio: Fecha de inicio (YYYY-MM-DD)
    - fecha_fin: Fecha de fin (YYYY-MM-DD)

    **Retorna:**
    ```json
    {
        "tienda": {
            "ubicacion_id": "tienda_01",
            "nombre": "GUACARA"
        },
        "distribucion": [
            {
                "rango": "$0-5",
                "rango_min": 0,
                "rango_max": 5,
                "cantidad_tickets": 12450,
                "pct_tickets": 45.2,
                "ventas_total": 48500.00,
                "pct_ventas": 8.5,
                "ticket_promedio": 3.89
            }
        ],
        "totales": {
            "total_tickets": 27550,
            "total_ventas": 568900.45,
            "ticket_promedio_general": 20.65
        }
    }
    ```
    """
    try:
        cursor = conn.cursor()

        # Validar fechas
        try:
            datetime.strptime(fecha_inicio, "%Y-%m-%d")
            datetime.strptime(fecha_fin, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "Formato de fecha inválido. Use YYYY-MM-DD")

        # Validar que la tienda existe
        cursor.execute("""
            SELECT id, nombre
            FROM ubicaciones
            WHERE id = %s AND tipo = 'tienda'
        """, (ubicacion_id,))

        tienda_row = cursor.fetchone()
        if not tienda_row:
            raise HTTPException(404, f"Tienda {ubicacion_id} no encontrada")

        tienda_info = {
            "ubicacion_id": tienda_row[0],
            "nombre": tienda_row[1]
        }

        # Query para distribución de tickets por rangos
        cursor.execute("""
            WITH ticket_totales AS (
                SELECT
                    numero_factura,
                    SUM(venta_total) as total_ticket
                FROM ventas
                WHERE ubicacion_id = %s
                  AND fecha_venta::date >= %s::date
                  AND fecha_venta::date <= %s::date
                GROUP BY numero_factura
            ),
            rangos AS (
                SELECT
                    CASE
                        WHEN total_ticket < 5 THEN '$0-5'
                        WHEN total_ticket >= 5 AND total_ticket < 15 THEN '$5-15'
                        WHEN total_ticket >= 15 AND total_ticket < 30 THEN '$15-30'
                        WHEN total_ticket >= 30 AND total_ticket < 50 THEN '$30-50'
                        ELSE '$50+'
                    END as rango,
                    CASE
                        WHEN total_ticket < 5 THEN 0
                        WHEN total_ticket >= 5 AND total_ticket < 15 THEN 5
                        WHEN total_ticket >= 15 AND total_ticket < 30 THEN 15
                        WHEN total_ticket >= 30 AND total_ticket < 50 THEN 30
                        ELSE 50
                    END as rango_min,
                    CASE
                        WHEN total_ticket < 5 THEN 5
                        WHEN total_ticket >= 5 AND total_ticket < 15 THEN 15
                        WHEN total_ticket >= 15 AND total_ticket < 30 THEN 30
                        WHEN total_ticket >= 30 AND total_ticket < 50 THEN 50
                        ELSE 999999
                    END as rango_max,
                    total_ticket
                FROM ticket_totales
            ),
            totales_globales AS (
                SELECT
                    COUNT(*) as total_tickets,
                    SUM(total_ticket) as total_ventas
                FROM ticket_totales
            )
            SELECT
                r.rango,
                r.rango_min,
                r.rango_max,
                COUNT(*) as cantidad_tickets,
                ROUND((COUNT(*)::decimal / NULLIF(t.total_tickets, 0)) * 100, 2) as pct_tickets,
                SUM(r.total_ticket) as ventas_total,
                ROUND((SUM(r.total_ticket) / NULLIF(t.total_ventas, 0)) * 100, 2) as pct_ventas,
                AVG(r.total_ticket) as ticket_promedio
            FROM rangos r
            CROSS JOIN totales_globales t
            GROUP BY r.rango, r.rango_min, r.rango_max, t.total_tickets, t.total_ventas
            ORDER BY r.rango_min
        """, (ubicacion_id, fecha_inicio, fecha_fin))

        distribucion = []
        for row in cursor.fetchall():
            distribucion.append({
                "rango": row[0],
                "rango_min": int(row[1]),
                "rango_max": int(row[2]) if row[2] != 999999 else None,
                "cantidad_tickets": int(row[3]),
                "pct_tickets": round(float(row[4]) if row[4] else 0, 2),
                "ventas_total": round(float(row[5]) if row[5] else 0, 2),
                "pct_ventas": round(float(row[6]) if row[6] else 0, 2),
                "ticket_promedio": round(float(row[7]) if row[7] else 0, 2)
            })

        # Totales generales
        cursor.execute("""
            SELECT
                COUNT(DISTINCT numero_factura) as total_tickets,
                COALESCE(SUM(venta_total), 0) as total_ventas,
                COALESCE(SUM(venta_total) / NULLIF(COUNT(DISTINCT numero_factura), 0), 0) as ticket_promedio
            FROM ventas
            WHERE ubicacion_id = %s
              AND fecha_venta::date >= %s::date
              AND fecha_venta::date <= %s::date
        """, (ubicacion_id, fecha_inicio, fecha_fin))

        totales_row = cursor.fetchone()
        totales = {
            "total_tickets": int(totales_row[0]),
            "total_ventas": round(float(totales_row[1]), 2),
            "ticket_promedio_general": round(float(totales_row[2]), 2)
        }

        cursor.close()

        return {
            "tienda": tienda_info,
            "distribucion": distribucion,
            "totales": totales,
            "metadata": {
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en get_ticket_distribution: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# COMPARE MULTI - Comparador Multi-Tienda
# =============================================================================

@router.get("/compare-multi")
async def compare_multi_stores(
    store_ids: str = Query(..., description="IDs de tiendas separados por coma (ej: tienda_01,tienda_08)"),
    fecha_inicio: str = Query(..., description="Fecha inicio YYYY-MM-DD"),
    fecha_fin: str = Query(..., description="Fecha fin YYYY-MM-DD"),
    current_user: UsuarioConRol = Depends(require_super_admin),
    conn: Any = Depends(get_db)
):
    """
    Compara múltiples tiendas (1-20) en el mismo período.

    Retorna métricas consolidadas para cada tienda seleccionada,
    permitiendo comparación side-by-side y ranking completo de red.

    **Parámetros:**
    - store_ids: IDs de tiendas separados por coma (ej: "tienda_01,tienda_08,tienda_12")
    - fecha_inicio: Fecha de inicio (YYYY-MM-DD)
    - fecha_fin: Fecha de fin (YYYY-MM-DD)

    **Retorna:**
    ```json
    {
        "stores": [
            {
                "ubicacion_id": "tienda_01",
                "nombre": "GUACARA",
                "region": "VALENCIA",
                "metrics": {
                    "ventas_total": 123456.78,
                    "tickets": 8450,
                    "ticket_promedio": 14.61,
                    "items_totales": 45320,
                    "items_por_ticket": 5.36,
                    "margen_pct": 24.5,
                    "top_categoria": {
                        "nombre": "Viveres",
                        "ventas": 45678.90
                    }
                }
            }
        ],
        "comparacion": {
            "mejor_ventas": "tienda_01",
            "mejor_margen": "tienda_08",
            "mejor_ticket_promedio": "tienda_12"
        }
    }
    ```
    """
    try:
        cursor = conn.cursor()

        # Validar fechas
        try:
            datetime.strptime(fecha_inicio, "%Y-%m-%d")
            datetime.strptime(fecha_fin, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "Formato de fecha inválido. Use YYYY-MM-DD")

        # Parsear IDs de tiendas
        store_ids_list = [sid.strip() for sid in store_ids.split(',') if sid.strip()]

        if len(store_ids_list) < 1:
            raise HTTPException(400, "Debe proporcionar al menos 1 tienda")

        if len(store_ids_list) > 20:
            raise HTTPException(400, "Máximo 20 tiendas para comparar")

        stores_data = []

        for store_id in store_ids_list:
            # Verificar que la tienda existe
            cursor.execute("""
                SELECT id, nombre, region
                FROM ubicaciones
                WHERE id = %s AND tipo = 'tienda'
            """, (store_id,))

            tienda_row = cursor.fetchone()
            if not tienda_row:
                continue  # Skip tiendas no encontradas

            # Métricas principales de la tienda
            cursor.execute("""
                SELECT
                    COALESCE(SUM(v.venta_total), 0) as ventas_total,
                    COUNT(DISTINCT v.numero_factura) as tickets,
                    COALESCE(SUM(v.venta_total) / NULLIF(COUNT(DISTINCT v.numero_factura), 0), 0) as ticket_promedio,
                    COALESCE(SUM(v.cantidad_vendida), 0) as items_totales,
                    COALESCE(SUM(v.cantidad_vendida) / NULLIF(COUNT(DISTINCT v.numero_factura), 0), 0) as items_por_ticket,
                    COALESCE((SUM(v.utilidad_bruta) / NULLIF(SUM(v.venta_total), 0)) * 100, 0) as margen_pct
                FROM ventas v
                WHERE v.ubicacion_id = %s
                  AND v.fecha_venta::date >= %s::date
                  AND v.fecha_venta::date <= %s::date
            """, (store_id, fecha_inicio, fecha_fin))

            metrics_row = cursor.fetchone()

            # Top categoría de la tienda
            cursor.execute("""
                SELECT
                    p.categoria,
                    SUM(v.venta_total) as ventas
                FROM ventas v
                JOIN productos p ON v.producto_id = p.id
                WHERE v.ubicacion_id = %s
                  AND v.fecha_venta::date >= %s::date
                  AND v.fecha_venta::date <= %s::date
                  AND p.categoria IS NOT NULL
                  AND p.categoria != 'SIN CATEGORIA'
                  AND TRIM(p.categoria) != ''
                GROUP BY p.categoria
                ORDER BY ventas DESC
                LIMIT 1
            """, (store_id, fecha_inicio, fecha_fin))

            top_cat_row = cursor.fetchone()
            top_categoria = None
            if top_cat_row:
                top_categoria = {
                    "nombre": top_cat_row[0],
                    "ventas": round(float(top_cat_row[1]), 2)
                }

            stores_data.append({
                "ubicacion_id": tienda_row[0],
                "nombre": tienda_row[1],
                "region": tienda_row[2],
                "metrics": {
                    "ventas_total": round(float(metrics_row[0]), 2),
                    "tickets": int(metrics_row[1]),
                    "ticket_promedio": round(float(metrics_row[2]), 2),
                    "items_totales": int(metrics_row[3]),
                    "items_por_ticket": round(float(metrics_row[4]), 2),
                    "margen_pct": round(float(metrics_row[5]), 2),
                    "top_categoria": top_categoria
                }
            })

        # Identificar mejores en cada métrica
        comparacion = {}

        if stores_data:
            mejor_ventas = max(stores_data, key=lambda x: x["metrics"]["ventas_total"])
            mejor_margen = max(stores_data, key=lambda x: x["metrics"]["margen_pct"])
            mejor_ticket = max(stores_data, key=lambda x: x["metrics"]["ticket_promedio"])

            comparacion = {
                "mejor_ventas": mejor_ventas["ubicacion_id"],
                "mejor_margen": mejor_margen["ubicacion_id"],
                "mejor_ticket_promedio": mejor_ticket["ubicacion_id"]
            }

        cursor.close()

        return {
            "stores": stores_data,
            "comparacion": comparacion,
            "metadata": {
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin,
                "tiendas_comparadas": len(stores_data)
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en compare_multi_stores: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
