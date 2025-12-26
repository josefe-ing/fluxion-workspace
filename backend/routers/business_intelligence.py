"""
Router de Business Intelligence para Fluxion AI.

Endpoints para análisis de rentabilidad, cobertura, ROI y métricas de negocio.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List, Any
import logging

from db_manager import get_db_connection
from services.bi_calculations import (
    clasificar_producto_matriz,
    calcular_reduccion_stock,
    CuadranteProducto,
    UMBRAL_STOCK_BAJO,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/bi", tags=["Business Intelligence"])


def get_db():
    """Dependency para obtener conexión a la base de datos."""
    with get_db_connection() as conn:
        yield conn


# =============================================================================
# FLUXION IMPACT - ROI del Sistema
# =============================================================================

@router.get("/impact/summary")
async def get_impact_summary(conn: Any = Depends(get_db)):
    """
    Resumen ejecutivo del impacto de Fluxion.

    Retorna stock actual vs baseline, capital liberado, y fill rate.
    Solo incluye tiendas con fecha de activación registrada.
    """
    try:
        cursor = conn.cursor()

        # Obtener tiendas activas con Fluxion
        cursor.execute("""
            SELECT
                tfa.ubicacion_id,
                tfa.fecha_activacion,
                tfa.stock_baseline,
                u.region,
                u.nombre
            FROM tiendas_fluxion_activacion tfa
            JOIN ubicaciones u ON tfa.ubicacion_id = u.id
            WHERE tfa.activo = true
        """)
        tiendas_activas = cursor.fetchall()

        if not tiendas_activas:
            return {
                "stock_actual_total": 0,
                "stock_baseline_total": 0,
                "capital_liberado": 0,
                "reduccion_pct": 0,
                "fill_rate": 0,
                "tiendas_activas_fluxion": 0,
                "por_region": [],
                "mensaje": "No hay tiendas activas con Fluxion aún"
            }

        # Obtener stock actual de las tiendas activas
        tienda_ids = [t[0] for t in tiendas_activas]
        placeholders = ','.join(['%s'] * len(tienda_ids))

        cursor.execute(f"""
            SELECT
                ubicacion_id,
                stock_actual,
                fill_rate_pct,
                region
            FROM mv_bi_stock_por_ubicacion
            WHERE ubicacion_id IN ({placeholders})
        """, tienda_ids)
        stock_actual_data = {row[0]: row for row in cursor.fetchall()}

        # Calcular totales
        stock_actual_total = 0
        stock_baseline_total = 0
        fill_rates = []
        por_region = {}

        for tienda in tiendas_activas:
            ubicacion_id, fecha_act, baseline, region, nombre = tienda
            stock_data = stock_actual_data.get(ubicacion_id)

            if stock_data:
                stock_actual = stock_data[1] or 0
                fill_rate = stock_data[2] or 0
            else:
                stock_actual = 0
                fill_rate = 0

            # Si no hay baseline registrado, usar stock actual como baseline
            if baseline is None or baseline == 0:
                baseline = stock_actual

            stock_actual_total += stock_actual
            stock_baseline_total += baseline
            fill_rates.append(fill_rate)

            # Agrupar por región
            if region not in por_region:
                por_region[region] = {
                    "region": region,
                    "stock_actual": 0,
                    "stock_baseline": 0,
                    "tiendas": 0
                }
            por_region[region]["stock_actual"] += stock_actual
            por_region[region]["stock_baseline"] += baseline
            por_region[region]["tiendas"] += 1

        # Calcular reducción
        capital_liberado, reduccion_pct = calcular_reduccion_stock(
            stock_actual_total, stock_baseline_total
        )

        # Calcular reducción por región
        regiones_list = []
        for region, data in por_region.items():
            cap_lib, red_pct = calcular_reduccion_stock(
                data["stock_actual"], data["stock_baseline"]
            )
            regiones_list.append({
                "region": region,
                "stock_actual": round(data["stock_actual"], 2),
                "stock_baseline": round(data["stock_baseline"], 2),
                "capital_liberado": cap_lib,
                "reduccion_pct": red_pct,
                "tiendas": data["tiendas"]
            })

        cursor.close()

        return {
            "stock_actual_total": round(stock_actual_total, 2),
            "stock_baseline_total": round(stock_baseline_total, 2),
            "capital_liberado": capital_liberado,
            "reduccion_pct": reduccion_pct,
            "fill_rate": round(sum(fill_rates) / len(fill_rates), 2) if fill_rates else 0,
            "tiendas_activas_fluxion": len(tiendas_activas),
            "por_region": regiones_list
        }

    except Exception as e:
        logger.error(f"Error en get_impact_summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/impact/by-store")
async def get_impact_by_store(conn: Any = Depends(get_db)):
    """
    Ranking de tiendas por reducción de inventario.
    """
    try:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                tfa.ubicacion_id,
                u.nombre,
                u.region,
                tfa.stock_baseline,
                tfa.fecha_activacion,
                mv.stock_actual,
                mv.fill_rate_pct
            FROM tiendas_fluxion_activacion tfa
            JOIN ubicaciones u ON tfa.ubicacion_id = u.id
            LEFT JOIN mv_bi_stock_por_ubicacion mv ON tfa.ubicacion_id = mv.ubicacion_id
            WHERE tfa.activo = true
            ORDER BY tfa.fecha_activacion
        """)

        tiendas = []
        for row in cursor.fetchall():
            ubicacion_id, nombre, region, baseline, fecha_act, stock_actual, fill_rate = row

            stock_actual = stock_actual or 0
            baseline = baseline or stock_actual

            capital_lib, reduccion = calcular_reduccion_stock(stock_actual, baseline)

            tiendas.append({
                "ubicacion_id": ubicacion_id,
                "nombre": nombre,
                "region": region,
                "fecha_activacion": str(fecha_act) if fecha_act else None,
                "stock_actual": round(stock_actual, 2),
                "stock_baseline": round(baseline, 2),
                "capital_liberado": capital_lib,
                "reduccion_pct": reduccion,
                "fill_rate": fill_rate or 0
            })

        # Ordenar por reducción (mayor primero)
        tiendas.sort(key=lambda x: x["reduccion_pct"], reverse=True)

        # Agregar ranking
        for i, t in enumerate(tiendas):
            t["rank"] = i + 1

        cursor.close()
        return tiendas

    except Exception as e:
        logger.error(f"Error en get_impact_by_store: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# ANÁLISIS POR TIENDA
# =============================================================================

@router.get("/store/{ubicacion_id}/kpis")
async def get_store_kpis(
    ubicacion_id: str,
    conn: Any = Depends(get_db)
):
    """
    KPIs de una tienda específica.
    """
    try:
        cursor = conn.cursor()

        # Obtener datos de la tienda
        cursor.execute("""
            SELECT
                ubicacion_id,
                nombre,
                stock_actual,
                fill_rate_pct,
                skus_con_stock,
                skus_activos
            FROM mv_bi_stock_por_ubicacion
            WHERE ubicacion_id = %s
        """, (ubicacion_id,))

        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Tienda {ubicacion_id} no encontrada")

        _, nombre, stock_valorizado, fill_rate, skus_total, skus_activos = row

        # Obtener ventas y métricas de productos
        cursor.execute("""
            SELECT
                SUM(ventas_30d) as ventas_30d,
                SUM(utilidad_30d) as utilidad_30d,
                AVG(margen_promedio) as margen_promedio,
                AVG(gmroi) as gmroi_promedio,
                AVG(rotacion_anual) as rotacion_promedio,
                COUNT(DISTINCT producto_id) as productos_vendidos
            FROM mv_bi_producto_metricas
            WHERE ubicacion_id = %s
        """, (ubicacion_id,))

        metricas = cursor.fetchone()
        ventas_30d = metricas[0] or 0
        utilidad_30d = metricas[1] or 0
        margen_promedio = metricas[2] or 0
        gmroi = metricas[3] or 0
        rotacion = metricas[4] or 0
        productos_vendidos = metricas[5] or 0

        # Obtener promedios de la red para comparación
        cursor.execute("""
            SELECT
                AVG(stock_actual) as stock_promedio,
                AVG(fill_rate_pct) as fill_rate_promedio
            FROM mv_bi_stock_por_ubicacion
            WHERE tipo = 'tienda'
        """)
        promedios = cursor.fetchone()
        stock_promedio_red = promedios[0] or 0
        fill_rate_promedio_red = promedios[1] or 0

        cursor.execute("""
            SELECT
                AVG(ventas_30d) as ventas_promedio,
                AVG(gmroi) as gmroi_promedio
            FROM (
                SELECT
                    ubicacion_id,
                    SUM(ventas_30d) as ventas_30d,
                    AVG(gmroi) as gmroi
                FROM mv_bi_producto_metricas
                GROUP BY ubicacion_id
            ) sub
        """)
        promedios_ventas = cursor.fetchone()
        ventas_promedio_red = promedios_ventas[0] or 0
        gmroi_promedio_red = promedios_ventas[1] or 0

        # Calcular días de inventario promedio
        dias_inventario = 0
        if ventas_30d > 0:
            dias_inventario = round((stock_valorizado / ventas_30d) * 30, 1)

        cursor.close()

        # Calcular comparativa vs promedio
        vs_promedio = {
            "ventas_pct": round((ventas_30d / ventas_promedio_red - 1) * 100, 1) if ventas_promedio_red > 0 else 0,
            "stock_pct": round((stock_valorizado / stock_promedio_red - 1) * 100, 1) if stock_promedio_red > 0 else 0,
            "gmroi_pct": round((gmroi / gmroi_promedio_red - 1) * 100, 1) if gmroi_promedio_red > 0 else 0,
        }

        return {
            "ubicacion_id": ubicacion_id,
            "nombre": nombre,
            "ventas_30d": round(ventas_30d, 2),
            "utilidad_30d": round(utilidad_30d, 2),
            "stock_valorizado": round(stock_valorizado, 2),
            "gmroi": round(gmroi, 2),
            "rotacion_anual": round(rotacion, 2),
            "fill_rate": fill_rate or 0,
            "dias_inventario_promedio": dias_inventario,
            "margen_promedio": round(margen_promedio, 2),
            "productos_vendidos": productos_vendidos,
            "skus_con_stock": skus_activos or 0,
            "vs_promedio_red": vs_promedio
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en get_store_kpis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/store/{ubicacion_id}/top-bottom-products")
async def get_store_top_bottom_products(
    ubicacion_id: str,
    metric: str = Query("gmroi", regex="^(gmroi|ventas|rotacion)$"),
    limit: int = Query(10, ge=1, le=50),
    conn: Any = Depends(get_db)
):
    """
    Top y Bottom productos de una tienda por métrica.
    """
    try:
        cursor = conn.cursor()

        order_column = {
            "gmroi": "gmroi",
            "ventas": "ventas_30d",
            "rotacion": "rotacion_anual"
        }[metric]

        # Top productos
        cursor.execute(f"""
            SELECT
                producto_id,
                producto_nombre,
                categoria,
                ventas_30d,
                gmroi,
                rotacion_anual,
                margen_promedio,
                inventario_actual
            FROM mv_bi_producto_metricas
            WHERE ubicacion_id = %s AND {order_column} > 0
            ORDER BY {order_column} DESC
            LIMIT %s
        """, (ubicacion_id, limit))

        top = [
            {
                "producto_id": row[0],
                "nombre": row[1],
                "categoria": row[2],
                "ventas_30d": float(row[3]) if row[3] else 0,
                "gmroi": float(row[4]) if row[4] else 0,
                "rotacion_anual": float(row[5]) if row[5] else 0,
                "margen_promedio": float(row[6]) if row[6] else 0,
                "inventario_actual": float(row[7]) if row[7] else 0
            }
            for row in cursor.fetchall()
        ]

        # Bottom productos (con algo de actividad)
        cursor.execute(f"""
            SELECT
                producto_id,
                producto_nombre,
                categoria,
                ventas_30d,
                gmroi,
                rotacion_anual,
                margen_promedio,
                inventario_actual
            FROM mv_bi_producto_metricas
            WHERE ubicacion_id = %s AND ventas_30d > 0
            ORDER BY {order_column} ASC
            LIMIT %s
        """, (ubicacion_id, limit))

        bottom = [
            {
                "producto_id": row[0],
                "nombre": row[1],
                "categoria": row[2],
                "ventas_30d": float(row[3]) if row[3] else 0,
                "gmroi": float(row[4]) if row[4] else 0,
                "rotacion_anual": float(row[5]) if row[5] else 0,
                "margen_promedio": float(row[6]) if row[6] else 0,
                "inventario_actual": float(row[7]) if row[7] else 0
            }
            for row in cursor.fetchall()
        ]

        cursor.close()

        return {
            "ubicacion_id": ubicacion_id,
            "metric": metric,
            "top": top,
            "bottom": bottom
        }

    except Exception as e:
        logger.error(f"Error en get_store_top_bottom_products: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stores/ranking")
async def get_stores_ranking(
    metric: str = Query("gmroi", regex="^(gmroi|ventas|rotacion|stock)$"),
    conn: Any = Depends(get_db)
):
    """
    Ranking comparativo de todas las tiendas por métrica.
    """
    try:
        cursor = conn.cursor()

        if metric == "stock":
            cursor.execute("""
                SELECT
                    ubicacion_id,
                    nombre,
                    region,
                    stock_actual as valor,
                    fill_rate_pct
                FROM mv_bi_stock_por_ubicacion
                WHERE tipo = 'tienda'
                ORDER BY stock_actual DESC
            """)
        else:
            agg_column = {
                "gmroi": "AVG(gmroi)",
                "ventas": "SUM(ventas_30d)",
                "rotacion": "AVG(rotacion_anual)"
            }[metric]

            cursor.execute(f"""
                SELECT
                    m.ubicacion_id,
                    u.nombre,
                    u.region,
                    {agg_column} as valor,
                    s.fill_rate_pct
                FROM mv_bi_producto_metricas m
                JOIN ubicaciones u ON m.ubicacion_id = u.id
                LEFT JOIN mv_bi_stock_por_ubicacion s ON m.ubicacion_id = s.ubicacion_id
                WHERE u.tipo = 'tienda'
                GROUP BY m.ubicacion_id, u.nombre, u.region, s.fill_rate_pct
                ORDER BY valor DESC
            """)

        tiendas = []
        total_valor = 0
        rows = cursor.fetchall()

        for row in rows:
            valor = float(row[3]) if row[3] else 0
            total_valor += valor
            tiendas.append({
                "ubicacion_id": row[0],
                "nombre": row[1],
                "region": row[2],
                "valor": round(valor, 2),
                "fill_rate": float(row[4]) if row[4] else 0
            })

        promedio = total_valor / len(tiendas) if tiendas else 0

        # Agregar ranking y comparativa vs promedio
        for i, t in enumerate(tiendas):
            t["rank"] = i + 1
            t["vs_promedio"] = round((t["valor"] / promedio - 1) * 100, 1) if promedio > 0 else 0

        cursor.close()

        return {
            "metric": metric,
            "promedio": round(promedio, 2),
            "tiendas": tiendas
        }

    except Exception as e:
        logger.error(f"Error en get_stores_ranking: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# ANÁLISIS POR PRODUCTO
# =============================================================================

@router.get("/products/matrix")
async def get_products_matrix(
    ubicacion_id: Optional[str] = None,
    categoria: Optional[str] = None,
    limit: int = Query(500, ge=1, le=2000),
    conn: Any = Depends(get_db)
):
    """
    Matriz Rentabilidad vs Rotación para scatter plot.
    """
    try:
        cursor = conn.cursor()

        where_clauses = ["ventas_30d > 0"]
        params = []

        if ubicacion_id:
            where_clauses.append("ubicacion_id = %s")
            params.append(ubicacion_id)

        if categoria:
            where_clauses.append("categoria = %s")
            params.append(categoria)

        where_sql = " AND ".join(where_clauses)
        params.append(limit)

        cursor.execute(f"""
            SELECT
                producto_id,
                producto_nombre,
                categoria,
                gmroi,
                rotacion_anual,
                ventas_30d,
                margen_promedio,
                inventario_actual
            FROM mv_bi_producto_metricas
            WHERE {where_sql}
            ORDER BY ventas_30d DESC
            LIMIT %s
        """, params)

        productos = []
        for row in cursor.fetchall():
            gmroi = float(row[3]) if row[3] else 0
            rotacion = float(row[4]) if row[4] else 0
            categoria_prod = row[2]

            cuadrante = clasificar_producto_matriz(gmroi, rotacion, categoria_prod)

            productos.append({
                "producto_id": row[0],
                "nombre": row[1],
                "categoria": categoria_prod,
                "gmroi": gmroi,
                "rotacion": rotacion,
                "ventas_30d": float(row[5]) if row[5] else 0,
                "margen_promedio": float(row[6]) if row[6] else 0,
                "inventario_actual": float(row[7]) if row[7] else 0,
                "cuadrante": cuadrante.value
            })

        cursor.close()

        # Contar por cuadrante
        conteo_cuadrantes = {
            "ESTRELLA": sum(1 for p in productos if p["cuadrante"] == "ESTRELLA"),
            "VACA": sum(1 for p in productos if p["cuadrante"] == "VACA"),
            "NICHO": sum(1 for p in productos if p["cuadrante"] == "NICHO"),
            "PERRO": sum(1 for p in productos if p["cuadrante"] == "PERRO"),
        }

        return {
            "productos": productos,
            "total": len(productos),
            "conteo_cuadrantes": conteo_cuadrantes
        }

    except Exception as e:
        logger.error(f"Error en get_products_matrix: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products/stars")
async def get_products_stars(
    ubicacion_id: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    conn: Any = Depends(get_db)
):
    """
    Productos estrella (alto GMROI + alta rotación).
    """
    try:
        cursor = conn.cursor()

        where_clause = "ventas_30d > 0 AND gmroi > 2 AND rotacion_anual > 8"
        params = []

        if ubicacion_id:
            where_clause += " AND ubicacion_id = %s"
            params.append(ubicacion_id)

        params.append(limit)

        cursor.execute(f"""
            SELECT
                producto_id,
                producto_nombre,
                categoria,
                gmroi,
                rotacion_anual,
                ventas_30d,
                utilidad_30d,
                margen_promedio
            FROM mv_bi_producto_metricas
            WHERE {where_clause}
            ORDER BY (gmroi * rotacion_anual) DESC
            LIMIT %s
        """, params)

        productos = [
            {
                "producto_id": row[0],
                "nombre": row[1],
                "categoria": row[2],
                "gmroi": float(row[3]) if row[3] else 0,
                "rotacion_anual": float(row[4]) if row[4] else 0,
                "ventas_30d": float(row[5]) if row[5] else 0,
                "utilidad_30d": float(row[6]) if row[6] else 0,
                "margen_promedio": float(row[7]) if row[7] else 0
            }
            for row in cursor.fetchall()
        ]

        cursor.close()
        return productos

    except Exception as e:
        logger.error(f"Error en get_products_stars: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products/eliminate")
async def get_products_eliminate(
    ubicacion_id: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    conn: Any = Depends(get_db)
):
    """
    Candidatos a eliminar (bajo GMROI + baja rotación).
    """
    try:
        cursor = conn.cursor()

        where_clause = "inventario_actual > 0 AND gmroi < 1.5 AND rotacion_anual < 4"
        params = []

        if ubicacion_id:
            where_clause += " AND ubicacion_id = %s"
            params.append(ubicacion_id)

        params.append(limit)

        cursor.execute(f"""
            SELECT
                producto_id,
                producto_nombre,
                categoria,
                gmroi,
                rotacion_anual,
                ventas_30d,
                inventario_actual,
                margen_promedio
            FROM mv_bi_producto_metricas
            WHERE {where_clause}
            ORDER BY inventario_actual DESC
            LIMIT %s
        """, params)

        productos = [
            {
                "producto_id": row[0],
                "nombre": row[1],
                "categoria": row[2],
                "gmroi": float(row[3]) if row[3] else 0,
                "rotacion_anual": float(row[4]) if row[4] else 0,
                "ventas_30d": float(row[5]) if row[5] else 0,
                "stock_valorizado": float(row[6]) if row[6] else 0,
                "margen_promedio": float(row[7]) if row[7] else 0
            }
            for row in cursor.fetchall()
        ]

        cursor.close()
        return productos

    except Exception as e:
        logger.error(f"Error en get_products_eliminate: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# RENTABILIDAD
# =============================================================================

@router.get("/profitability/by-category")
async def get_profitability_by_category(conn: Any = Depends(get_db)):
    """
    Margen y GMROI por categoría (seco/frio/verde).
    """
    try:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                categoria,
                ventas_30d,
                utilidad_30d,
                margen_promedio,
                stock_valorizado,
                gmroi,
                rotacion_anual,
                productos_vendidos,
                skus_con_stock
            FROM mv_bi_rentabilidad_categoria
            ORDER BY ventas_30d DESC
        """)

        categorias = [
            {
                "categoria": row[0],
                "ventas_30d": float(row[1]) if row[1] else 0,
                "utilidad_30d": float(row[2]) if row[2] else 0,
                "margen_promedio": float(row[3]) if row[3] else 0,
                "stock_valorizado": float(row[4]) if row[4] else 0,
                "gmroi": float(row[5]) if row[5] else 0,
                "rotacion_anual": float(row[6]) if row[6] else 0,
                "productos_vendidos": row[7] or 0,
                "skus_con_stock": row[8] or 0
            }
            for row in cursor.fetchall()
        ]

        cursor.close()
        return categorias

    except Exception as e:
        logger.error(f"Error en get_profitability_by_category: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profitability/top-products")
async def get_profitability_top_products(
    metric: str = Query("utilidad_total", regex="^(utilidad_total|margen_pct|gmroi)$"),
    limit: int = Query(20, ge=1, le=100),
    conn: Any = Depends(get_db)
):
    """
    Top productos más rentables.
    """
    try:
        cursor = conn.cursor()

        order_column = {
            "utilidad_total": "SUM(utilidad_30d)",
            "margen_pct": "AVG(margen_promedio)",
            "gmroi": "AVG(gmroi)"
        }[metric]

        cursor.execute(f"""
            SELECT
                producto_id,
                producto_nombre,
                categoria,
                SUM(ventas_30d) as ventas_total,
                SUM(utilidad_30d) as utilidad_total,
                AVG(margen_promedio) as margen_promedio,
                AVG(gmroi) as gmroi_promedio
            FROM mv_bi_producto_metricas
            WHERE ventas_30d > 0
            GROUP BY producto_id, producto_nombre, categoria
            ORDER BY {order_column} DESC
            LIMIT %s
        """, (limit,))

        productos = [
            {
                "producto_id": row[0],
                "nombre": row[1],
                "categoria": row[2],
                "ventas_30d": float(row[3]) if row[3] else 0,
                "utilidad_30d": float(row[4]) if row[4] else 0,
                "margen_pct": float(row[5]) if row[5] else 0,
                "gmroi": float(row[6]) if row[6] else 0
            }
            for row in cursor.fetchall()
        ]

        cursor.close()
        return productos

    except Exception as e:
        logger.error(f"Error en get_profitability_top_products: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# COBERTURA Y DISTRIBUCIÓN
# =============================================================================

@router.get("/coverage/summary")
async def get_coverage_summary(conn: Any = Depends(get_db)):
    """
    Resumen de cobertura de productos.
    """
    try:
        cursor = conn.cursor()

        # Contar productos por nivel de cobertura
        cursor.execute("""
            SELECT
                COUNT(*) FILTER (WHERE cobertura_pct = 100) as cobertura_completa,
                COUNT(*) FILTER (WHERE cobertura_pct > 0 AND cobertura_pct < 100) as cobertura_parcial,
                COUNT(*) FILTER (WHERE cobertura_pct = 0) as sin_cobertura,
                COUNT(*) as total
            FROM mv_bi_cobertura_productos
        """)

        row = cursor.fetchone()
        cobertura_completa = row[0] or 0
        cobertura_parcial = row[1] or 0
        sin_cobertura = row[2] or 0
        total = row[3] or 0

        # Stock atrapado en CEDI
        cursor.execute("""
            SELECT
                SUM(valor_atrapado) as total_atrapado,
                COUNT(*) as productos_atrapados
            FROM mv_bi_stock_atrapado_cedi
        """)

        atrapado = cursor.fetchone()
        stock_atrapado = float(atrapado[0]) if atrapado[0] else 0
        productos_atrapados = atrapado[1] or 0

        cursor.close()

        return {
            "productos_total": total,
            "cobertura_completa": cobertura_completa,
            "cobertura_parcial": cobertura_parcial,
            "sin_cobertura": sin_cobertura,
            "stock_atrapado_cedi": round(stock_atrapado, 2),
            "productos_atrapados_cedi": productos_atrapados
        }

    except Exception as e:
        logger.error(f"Error en get_coverage_summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/coverage/low-coverage-products")
async def get_low_coverage_products(
    region: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    conn: Any = Depends(get_db)
):
    """
    Productos con baja cobertura (<50% tiendas).
    """
    try:
        cursor = conn.cursor()

        where_clause = "cobertura_pct < 50 AND cobertura_pct > 0"
        params = []

        if region:
            where_clause += " AND region = %s"
            params.append(region.upper())

        params.append(limit)

        cursor.execute(f"""
            SELECT
                producto_id,
                producto_nombre,
                categoria,
                region,
                tiendas_con_stock,
                total_tiendas,
                cobertura_pct,
                valor_total_tiendas
            FROM mv_bi_cobertura_productos
            WHERE {where_clause}
            ORDER BY cobertura_pct ASC
            LIMIT %s
        """, params)

        productos = [
            {
                "producto_id": row[0],
                "nombre": row[1],
                "categoria": row[2],
                "region": row[3],
                "tiendas_con_stock": row[4] or 0,
                "tiendas_total": row[5] or 0,
                "cobertura_pct": float(row[6]) if row[6] else 0,
                "valor_en_tiendas": float(row[7]) if row[7] else 0
            }
            for row in cursor.fetchall()
        ]

        cursor.close()
        return productos

    except Exception as e:
        logger.error(f"Error en get_low_coverage_products: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/coverage/trapped-in-cedi")
async def get_trapped_in_cedi(
    region: Optional[str] = None,
    umbral_bajo_stock: int = Query(UMBRAL_STOCK_BAJO, ge=0, le=100),
    limit: int = Query(50, ge=1, le=200),
    conn: Any = Depends(get_db)
):
    """
    Stock atrapado en CEDI (tiene en CEDI, <umbral unidades en tiendas).
    """
    try:
        cursor = conn.cursor()

        where_clause = "1=1"
        params = []

        if region:
            where_clause += " AND region = %s"
            params.append(region.upper())

        params.append(limit)

        cursor.execute(f"""
            SELECT
                producto_id,
                producto_nombre,
                categoria,
                cedi_id,
                region,
                stock_cedi,
                valor_atrapado,
                stock_en_tiendas,
                tiendas_con_stock,
                venta_30d,
                dias_stock_estimado
            FROM mv_bi_stock_atrapado_cedi
            WHERE {where_clause}
            ORDER BY valor_atrapado DESC
            LIMIT %s
        """, params)

        productos = [
            {
                "producto_id": row[0],
                "nombre": row[1],
                "categoria": row[2],
                "cedi_id": row[3],
                "region": row[4],
                "stock_cedi": float(row[5]) if row[5] else 0,
                "valor_atrapado": float(row[6]) if row[6] else 0,
                "stock_en_tiendas": float(row[7]) if row[7] else 0,
                "tiendas_con_stock": row[8] or 0,
                "venta_30d": float(row[9]) if row[9] else 0,
                "dias_stock_estimado": row[10] or 999
            }
            for row in cursor.fetchall()
        ]

        cursor.close()
        return productos

    except Exception as e:
        logger.error(f"Error en get_trapped_in_cedi: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/coverage/store-gaps")
async def get_store_gaps(conn: Any = Depends(get_db)):
    """
    Tiendas con huecos de catálogo vs promedio de la red.
    """
    try:
        cursor = conn.cursor()

        # SKUs promedio por tienda
        cursor.execute("""
            SELECT AVG(skus_activos) as promedio
            FROM mv_bi_stock_por_ubicacion
            WHERE tipo = 'tienda'
        """)
        promedio_skus = cursor.fetchone()[0] or 0

        # Tiendas con sus SKUs
        cursor.execute("""
            SELECT
                ubicacion_id,
                nombre,
                region,
                skus_activos,
                skus_con_stock,
                stock_actual,
                fill_rate_pct
            FROM mv_bi_stock_por_ubicacion
            WHERE tipo = 'tienda'
            ORDER BY skus_activos ASC
        """)

        tiendas = []
        for row in cursor.fetchall():
            skus_activos = row[3] or 0
            gap = promedio_skus - skus_activos
            gap_pct = (gap / promedio_skus * 100) if promedio_skus > 0 else 0

            tiendas.append({
                "ubicacion_id": row[0],
                "nombre": row[1],
                "region": row[2],
                "skus_activos": skus_activos,
                "skus_promedio_red": round(promedio_skus),
                "gap_skus": round(gap),
                "gap_pct": round(gap_pct, 1),
                "stock_valorizado": float(row[5]) if row[5] else 0,
                "fill_rate": float(row[6]) if row[6] else 0
            })

        cursor.close()
        return tiendas

    except Exception as e:
        logger.error(f"Error en get_store_gaps: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# COMPARACIÓN DE TIENDAS
# =============================================================================

@router.get("/stores/compare")
async def compare_stores(
    store_ids: str = Query(..., description="IDs de tiendas separados por coma (ej: tienda_17,tienda_18)"),
    conn: Any = Depends(get_db)
):
    """
    Compara ventas y productos entre 2 o más tiendas.

    Retorna:
    - Productos que solo venden en algunas tiendas
    - Productos comunes con diferencias significativas de ventas
    - Resumen de SKUs únicos vs compartidos
    """
    try:
        cursor = conn.cursor()

        # Parsear IDs de tiendas
        tienda_ids = [t.strip() for t in store_ids.split(',')]

        if len(tienda_ids) < 2:
            raise HTTPException(status_code=400, detail="Debes proporcionar al menos 2 tiendas para comparar")

        if len(tienda_ids) > 5:
            raise HTTPException(status_code=400, detail="Máximo 5 tiendas para comparar")

        # Verificar que las tiendas existen
        placeholders = ','.join(['%s'] * len(tienda_ids))
        cursor.execute(f"""
            SELECT id, nombre, region
            FROM ubicaciones
            WHERE id IN ({placeholders}) AND tipo = 'tienda'
        """, tienda_ids)

        tiendas_info = cursor.fetchall()
        if len(tiendas_info) != len(tienda_ids):
            raise HTTPException(status_code=404, detail="Una o más tiendas no encontradas")

        tiendas_map = {t[0]: {"nombre": t[1], "region": t[2]} for t in tiendas_info}

        # Obtener ventas de los últimos 30 días por tienda
        cursor.execute(f"""
            SELECT
                m.producto_id,
                m.producto_nombre,
                m.categoria,
                m.ubicacion_id,
                m.ventas_30d,
                m.utilidad_30d,
                m.margen_promedio,
                m.gmroi,
                m.rotacion_anual,
                m.stock_unidades
            FROM mv_bi_producto_metricas m
            WHERE m.ubicacion_id IN ({placeholders})
              AND m.ventas_30d > 0
            ORDER BY m.producto_id, m.ubicacion_id
        """, tienda_ids)

        productos_por_tienda = {}
        for row in cursor.fetchall():
            producto_id = row[0]
            ubicacion_id = row[3]

            if producto_id not in productos_por_tienda:
                productos_por_tienda[producto_id] = {
                    "producto_id": producto_id,
                    "nombre": row[1],
                    "categoria": row[2],
                    "ventas_por_tienda": {},
                    "tiendas_con_venta": []
                }

            productos_por_tienda[producto_id]["ventas_por_tienda"][ubicacion_id] = {
                "ventas_30d": float(row[4]) if row[4] else 0,
                "utilidad_30d": float(row[5]) if row[5] else 0,
                "margen_promedio": float(row[6]) if row[6] else 0,
                "gmroi": float(row[7]) if row[7] else 0,
                "rotacion_anual": float(row[8]) if row[8] else 0,
                "stock": float(row[9]) if row[9] else 0
            }
            productos_por_tienda[producto_id]["tiendas_con_venta"].append(ubicacion_id)

        # Clasificar productos
        productos_unicos = []  # Solo en una tienda
        productos_comunes = []  # En todas las tiendas
        productos_parciales = []  # En algunas tiendas

        for producto_id, data in productos_por_tienda.items():
            num_tiendas_con_venta = len(data["tiendas_con_venta"])

            if num_tiendas_con_venta == 1:
                # Producto solo en una tienda
                tienda_id = data["tiendas_con_venta"][0]
                ventas = data["ventas_por_tienda"][tienda_id]
                productos_unicos.append({
                    "producto_id": producto_id,
                    "nombre": data["nombre"],
                    "categoria": data["categoria"],
                    "tienda_id": tienda_id,
                    "tienda_nombre": tiendas_map[tienda_id]["nombre"],
                    "ventas_30d": ventas["ventas_30d"],
                    "utilidad_30d": ventas["utilidad_30d"],
                    "gmroi": ventas["gmroi"],
                    "stock": ventas["stock"]
                })
            elif num_tiendas_con_venta == len(tienda_ids):
                # Producto en todas las tiendas
                ventas_por_tienda_list = []
                max_venta = 0
                min_venta = float('inf')

                for tid in tienda_ids:
                    v = data["ventas_por_tienda"].get(tid, {"ventas_30d": 0})
                    venta = v["ventas_30d"]
                    max_venta = max(max_venta, venta)
                    min_venta = min(min_venta, venta)
                    ventas_por_tienda_list.append({
                        "tienda_id": tid,
                        "tienda_nombre": tiendas_map[tid]["nombre"],
                        **v
                    })

                # Calcular diferencia porcentual
                diferencia_pct = 0
                if min_venta > 0:
                    diferencia_pct = round(((max_venta - min_venta) / min_venta) * 100, 1)

                productos_comunes.append({
                    "producto_id": producto_id,
                    "nombre": data["nombre"],
                    "categoria": data["categoria"],
                    "ventas_por_tienda": ventas_por_tienda_list,
                    "venta_max": round(max_venta, 2),
                    "venta_min": round(min_venta, 2),
                    "diferencia_pct": diferencia_pct
                })
            else:
                # Producto en algunas tiendas
                tiendas_con = [tiendas_map[tid]["nombre"] for tid in data["tiendas_con_venta"]]
                tiendas_sin = [tiendas_map[tid]["nombre"] for tid in tienda_ids if tid not in data["tiendas_con_venta"]]

                # Calcular venta promedio donde existe
                venta_promedio = sum(v["ventas_30d"] for v in data["ventas_por_tienda"].values()) / num_tiendas_con_venta

                productos_parciales.append({
                    "producto_id": producto_id,
                    "nombre": data["nombre"],
                    "categoria": data["categoria"],
                    "tiendas_con_venta": tiendas_con,
                    "tiendas_sin_venta": tiendas_sin,
                    "num_tiendas_con": num_tiendas_con_venta,
                    "num_tiendas_sin": len(tienda_ids) - num_tiendas_con_venta,
                    "venta_promedio_donde_existe": round(venta_promedio, 2)
                })

        # Ordenar resultados
        productos_unicos.sort(key=lambda x: x["ventas_30d"], reverse=True)
        productos_comunes.sort(key=lambda x: x["diferencia_pct"], reverse=True)
        productos_parciales.sort(key=lambda x: x["venta_promedio_donde_existe"], reverse=True)

        cursor.close()

        return {
            "tiendas": [
                {
                    "id": tid,
                    "nombre": tiendas_map[tid]["nombre"],
                    "region": tiendas_map[tid]["region"]
                }
                for tid in tienda_ids
            ],
            "resumen": {
                "productos_unicos": len(productos_unicos),
                "productos_comunes": len(productos_comunes),
                "productos_parciales": len(productos_parciales),
                "total_productos_analizados": len(productos_por_tienda)
            },
            "productos_unicos": productos_unicos[:50],  # Top 50
            "productos_comunes": productos_comunes[:100],  # Top 100
            "productos_parciales": productos_parciales[:50]  # Top 50
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en compare_stores: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# ADMIN - Refrescar vistas
# =============================================================================

@router.post("/admin/refresh-views")
async def refresh_bi_views(conn: Any = Depends(get_db)):
    """
    Refresca todas las vistas materializadas de BI.
    """
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM refresh_bi_views()")
        results = cursor.fetchall()
        cursor.close()
        conn.commit()

        return {
            "status": "OK",
            "vistas_refrescadas": [
                {"vista": row[0], "tiempo_ms": row[1], "status": row[2]}
                for row in results
            ]
        }

    except Exception as e:
        logger.error(f"Error en refresh_bi_views: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
