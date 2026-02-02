"""
Router para endpoints de Ubicaciones
"""

from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
import logging
import sys
from pathlib import Path

from db_manager import get_db_connection, execute_query_dict
from schemas.ubicaciones import (
    UbicacionResponse,
    UbicacionSummaryResponse,
    UbicacionRegionalDetail,
    RegionSummary,
    AlmacenKLKResponse,
    AlmacenesUbicacionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Ubicaciones"])


@router.get("/ubicaciones", response_model=List[UbicacionResponse])
async def get_ubicaciones(
    tipo: Optional[str] = None,
    visible_pedidos: Optional[bool] = None
):
    """
    Obtiene todas las ubicaciones (tiendas y CEDIs) desde la base de datos

    Query params:
    - tipo: Filtrar por tipo ('tienda' | 'cedi')
    - visible_pedidos: Filtrar por visibilidad en pedidos sugeridos
    """
    try:
        # PostgreSQL v2.0: Simplified flat table with minimal schema
        query = "SELECT id, nombre, codigo_klk, ciudad, activo FROM ubicaciones WHERE activo = true"

        # Execute query using db_manager
        ubicaciones_data = execute_query_dict(query)

        ubicaciones = []
        for row in ubicaciones_data:
            ubicaciones.append(UbicacionResponse(
                id=row['id'],
                codigo=row.get('codigo_klk') or row['id'],
                nombre=row['nombre'],
                tipo='tienda',  # Default to 'tienda' (all locations are stores in v2.0)
                region=None,
                ciudad=row.get('ciudad'),
                superficie_m2=None,
                activo=row['activo'],
                visible_pedidos=True,
                sistema_pos='stellar'
            ))

        # Sort by nombre
        ubicaciones.sort(key=lambda u: u.nombre)

        return ubicaciones

    except Exception as e:
        logger.error(f"Error obteniendo ubicaciones: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@router.get("/ubicaciones/summary", response_model=List[UbicacionSummaryResponse])
async def get_ubicaciones_summary():
    """
    Obtiene un resumen de inventario por ubicación (Stellar + KLK)
    """
    try:
        with get_db_connection() as conn:
            # Importar tiendas_config para saber qué tiendas usan KLK
            etl_core_path = Path(__file__).parent.parent.parent / 'etl' / 'core'
            if str(etl_core_path) not in sys.path:
                sys.path.insert(0, str(etl_core_path))

            from tiendas_config import get_tiendas_klk, ALMACENES_KLK
            tiendas_klk_ids = list(get_tiendas_klk().keys())

            # Construir mapeo de código de almacén -> nombre
            almacen_nombres = {}
            for tienda_id, almacenes in ALMACENES_KLK.items():
                for alm in almacenes:
                    almacen_nombres[alm.codigo] = alm.nombre

            # Mapeo simple ubicacion_id -> nombre para tiendas KLK
            ubicacion_nombres_klk = {}
            for tienda_id in tiendas_klk_ids:
                if tienda_id.startswith('tienda_'):
                    num = int(tienda_id.replace('tienda_', ''))
                    ubicacion_nombres_klk[tienda_id] = f"Tienda {num:02d}"
                elif tienda_id.startswith('cedi_'):
                    tipo = tienda_id.replace('cedi_', '').title()
                    ubicacion_nombres_klk[tienda_id] = f"CEDI {tipo}"
                else:
                    ubicacion_nombres_klk[tienda_id] = tienda_id

            # Query: Resumen de inventario por ubicación y almacén
            query = """
                SELECT
                    ia.ubicacion_id,
                    u.nombre as ubicacion_nombre,
                    'tienda' as tipo_ubicacion,
                    COUNT(DISTINCT ia.producto_id) as total_productos,
                    SUM(CASE WHEN ia.cantidad = 0 THEN 1 ELSE 0 END) as stock_cero,
                    SUM(CASE WHEN ia.cantidad < 0 THEN 1 ELSE 0 END) as stock_negativo,
                    TO_CHAR(MAX(ia.fecha_actualizacion), 'YYYY-MM-DD HH24:MI:SS') as ultima_actualizacion,
                    ia.almacen_codigo
                FROM inventario_actual ia
                LEFT JOIN ubicaciones u ON ia.ubicacion_id = u.id
                GROUP BY ia.ubicacion_id, u.nombre, ia.almacen_codigo
                ORDER BY ia.ubicacion_id, ia.almacen_codigo
            """

            cursor = conn.cursor()
            cursor.execute(query)
            result = cursor.fetchall()
            cursor.close()

            summary = []
            for row in result:
                ubicacion_id = row[0]
                ubicacion_nombre = row[1]
                almacen_codigo = row[7]
                almacen_nombre = almacen_nombres.get(almacen_codigo) if almacen_codigo else None

                # Para tiendas KLK, reemplazar ubicacion_id con nombre legible
                if ubicacion_id in ubicacion_nombres_klk:
                    ubicacion_nombre = ubicacion_nombres_klk[ubicacion_id]

                summary.append(UbicacionSummaryResponse(
                    ubicacion_id=ubicacion_id,
                    ubicacion_nombre=ubicacion_nombre,
                    tipo_ubicacion=row[2],
                    total_productos=row[3],
                    stock_cero=row[4],
                    stock_negativo=row[5],
                    ultima_actualizacion=row[6],
                    almacen_codigo=almacen_codigo,
                    almacen_nombre=almacen_nombre
                ))

            return summary

    except Exception as e:
        logger.error(f"Error obteniendo resumen de ubicaciones: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@router.get("/ubicaciones/summary-regional", response_model=List[RegionSummary])
async def get_ubicaciones_summary_regional():
    """
    Obtiene resumen de inventario agrupado por región (CARACAS / VALENCIA).
    """
    try:
        with get_db_connection() as conn:
            # Importar configuración de almacenes KLK
            etl_core_path = Path(__file__).parent.parent.parent / 'etl' / 'core'
            if str(etl_core_path) not in sys.path:
                sys.path.insert(0, str(etl_core_path))

            from tiendas_config import ALMACENES_KLK

            # Construir mapeo de código de almacén -> nombre
            almacen_nombres = {}
            for tienda_id, almacenes in ALMACENES_KLK.items():
                for alm in almacenes:
                    almacen_nombres[alm.codigo] = alm.nombre

            cursor = conn.cursor()

            # Query principal con métricas por ubicación y almacén
            query = """
                WITH ubicacion_data AS (
                    SELECT
                        u.id as ubicacion_id,
                        u.nombre as ubicacion_nombre,
                        u.tipo,
                        COALESCE(u.region, 'VALENCIA') as region,
                        ia.almacen_codigo,
                        COUNT(DISTINCT ia.producto_id) as total_skus,
                        SUM(CASE WHEN ia.cantidad > 0 THEN 1 ELSE 0 END) as skus_con_stock,
                        SUM(CASE WHEN ia.cantidad = 0 THEN 1 ELSE 0 END) as stock_cero,
                        SUM(CASE WHEN ia.cantidad < 0 THEN 1 ELSE 0 END) as stock_negativo,
                        TO_CHAR(MAX(ia.fecha_actualizacion), 'YYYY-MM-DD HH24:MI:SS') as ultima_actualizacion
                    FROM inventario_actual ia
                    JOIN ubicaciones u ON ia.ubicacion_id = u.id
                    GROUP BY u.id, u.nombre, u.tipo, u.region, ia.almacen_codigo
                ),
                ventas_20d AS (
                    SELECT
                        ubicacion_id,
                        producto_id,
                        DATE(fecha_venta) as fecha,
                        SUM(cantidad_vendida) as total_dia
                    FROM ventas
                    WHERE fecha_venta >= CURRENT_DATE - INTERVAL '20 days'
                      AND fecha_venta < CURRENT_DATE
                      AND NOT (ubicacion_id = 'tienda_18' AND DATE(fecha_venta) = '2025-12-06')
                    GROUP BY ubicacion_id, producto_id, DATE(fecha_venta)
                ),
                demanda_p75 AS (
                    SELECT
                        ubicacion_id,
                        producto_id,
                        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_dia) as p75
                    FROM ventas_20d
                    GROUP BY ubicacion_id, producto_id
                ),
                stock_con_demanda AS (
                    SELECT
                        ia.ubicacion_id,
                        ia.almacen_codigo,
                        ia.producto_id,
                        ia.cantidad as stock_actual,
                        COALESCE(dp.p75, 0) as demanda_p75,
                        COALESCE(abc.clase_abc, 'SIN_VENTAS') as clase_abc,
                        CASE WHEN COALESCE(dp.p75, 0) > 0 THEN
                            ia.cantidad / dp.p75
                        ELSE NULL END as dias_cobertura
                    FROM inventario_actual ia
                    LEFT JOIN demanda_p75 dp ON dp.ubicacion_id = ia.ubicacion_id
                        AND dp.producto_id = ia.producto_id
                    LEFT JOIN productos_abc_tienda abc ON abc.ubicacion_id = ia.ubicacion_id
                        AND abc.producto_id = ia.producto_id
                ),
                abc_metrics AS (
                    SELECT
                        ubicacion_id,
                        almacen_codigo,
                        AVG(CASE WHEN clase_abc = 'A' AND dias_cobertura IS NOT NULL AND dias_cobertura BETWEEN 0 AND 365 THEN dias_cobertura END) as dias_cobertura_a,
                        AVG(CASE WHEN clase_abc = 'B' AND dias_cobertura IS NOT NULL AND dias_cobertura BETWEEN 0 AND 365 THEN dias_cobertura END) as dias_cobertura_b,
                        AVG(CASE WHEN clase_abc = 'C' AND dias_cobertura IS NOT NULL AND dias_cobertura BETWEEN 0 AND 365 THEN dias_cobertura END) as dias_cobertura_c,
                        SUM(CASE
                            WHEN stock_actual > 0
                            AND demanda_p75 > 0
                            AND dias_cobertura < 1
                            AND clase_abc IN ('A', 'B', 'C')
                            THEN 1 ELSE 0
                        END) as riesgo_quiebre,
                        COUNT(CASE WHEN stock_actual > 0 THEN 1 END)::float /
                            NULLIF(COUNT(CASE WHEN demanda_p75 > 0 OR stock_actual > 0 THEN 1 END), 0) * 100 as fill_rate
                    FROM stock_con_demanda
                    GROUP BY ubicacion_id, almacen_codigo
                )
                SELECT
                    ud.region,
                    ud.ubicacion_id,
                    ud.ubicacion_nombre,
                    ud.tipo,
                    ud.almacen_codigo,
                    ud.total_skus,
                    ud.skus_con_stock,
                    ud.stock_cero,
                    ud.stock_negativo,
                    ud.ultima_actualizacion,
                    COALESCE(am.fill_rate, 0) as fill_rate,
                    am.dias_cobertura_a,
                    am.dias_cobertura_b,
                    am.dias_cobertura_c,
                    COALESCE(am.riesgo_quiebre, 0) as riesgo_quiebre
                FROM ubicacion_data ud
                LEFT JOIN abc_metrics am ON ud.ubicacion_id = am.ubicacion_id
                    AND COALESCE(ud.almacen_codigo, '') = COALESCE(am.almacen_codigo, '')
                ORDER BY ud.region, ud.tipo DESC, ud.ubicacion_nombre, ud.almacen_codigo
            """

            cursor.execute(query)
            rows = cursor.fetchall()
            cursor.close()

            # Agrupar por región
            regions_data: Dict[str, List[UbicacionRegionalDetail]] = {}

            for row in rows:
                region = row[0]
                ubicacion_id = row[1]
                almacen_codigo = row[4]

                if region not in regions_data:
                    regions_data[region] = []

                detail = UbicacionRegionalDetail(
                    ubicacion_id=ubicacion_id,
                    ubicacion_nombre=row[2],
                    tipo=row[3],
                    almacen_codigo=almacen_codigo,
                    almacen_nombre=almacen_nombres.get(almacen_codigo) if almacen_codigo else None,
                    total_skus=row[5] or 0,
                    skus_con_stock=row[6] or 0,
                    stock_cero=row[7] or 0,
                    stock_negativo=row[8] or 0,
                    ultima_actualizacion=row[9],
                    fill_rate=round(row[10] or 0, 1),
                    dias_cobertura_a=round(row[11], 1) if row[11] else None,
                    dias_cobertura_b=round(row[12], 1) if row[12] else None,
                    dias_cobertura_c=round(row[13], 1) if row[13] else None,
                    riesgo_quiebre=row[14] or 0
                )
                regions_data[region].append(detail)

            # Construir respuesta con agregados por región
            result = []
            for region, ubicaciones in regions_data.items():
                total_stock_cero = sum(u.stock_cero for u in ubicaciones)
                total_stock_negativo = sum(u.stock_negativo for u in ubicaciones)
                total_riesgo_quiebre = sum(u.riesgo_quiebre for u in ubicaciones)

                total_skus_con_stock = sum(u.skus_con_stock for u in ubicaciones)
                total_skus = sum(u.total_skus for u in ubicaciones)
                fill_rate_promedio = (total_skus_con_stock / total_skus * 100) if total_skus > 0 else 0

                dias_a = [u.dias_cobertura_a for u in ubicaciones if u.dias_cobertura_a is not None]
                dias_b = [u.dias_cobertura_b for u in ubicaciones if u.dias_cobertura_b is not None]
                dias_c = [u.dias_cobertura_c for u in ubicaciones if u.dias_cobertura_c is not None]

                region_summary = RegionSummary(
                    region=region,
                    total_ubicaciones=len(set(u.ubicacion_id for u in ubicaciones)),
                    total_skus_unicos=total_skus,
                    fill_rate_promedio=round(fill_rate_promedio, 1),
                    dias_cobertura_a=round(sum(dias_a) / len(dias_a), 1) if dias_a else None,
                    dias_cobertura_b=round(sum(dias_b) / len(dias_b), 1) if dias_b else None,
                    dias_cobertura_c=round(sum(dias_c) / len(dias_c), 1) if dias_c else None,
                    total_stock_cero=total_stock_cero,
                    total_stock_negativo=total_stock_negativo,
                    total_riesgo_quiebre=total_riesgo_quiebre,
                    ubicaciones=ubicaciones
                )
                result.append(region_summary)

            result.sort(key=lambda r: (0 if r.region == 'VALENCIA' else 1, r.region))

            return result

    except Exception as e:
        logger.error(f"Error obteniendo resumen regional: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@router.get("/ubicaciones/{ubicacion_id}/stock-params")
async def get_stock_params(ubicacion_id: str):
    """
    Obtiene los parámetros de stock para una tienda en DÍAS.
    Usa la configuración real de config_parametros_abc_tienda si existe,
    sino usa valores por defecto.

    Fórmulas simplificadas (mismas que main.py inventarios):
      SS  = lead_time
      ROP = lead_time + dias_cobertura / 2
      MAX = lead_time + dias_cobertura
    """
    # Defaults globales (lead_time=1.5)
    DEFAULT_LT = 1.5
    DEFAULT_COB = {'a': 7, 'b': 14, 'c': 21, 'd': 30}

    lt = DEFAULT_LT
    cob = dict(DEFAULT_COB)

    # Intentar cargar config real de la tienda
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT lead_time_override, dias_cobertura_a, dias_cobertura_b,
                   dias_cobertura_c, clase_d_dias_cobertura
            FROM config_parametros_abc_tienda
            WHERE tienda_id = %s AND activo = true
        """, [ubicacion_id])
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if row:
            lt = float(row[0]) if row[0] is not None else DEFAULT_LT
            cob['a'] = int(row[1]) if row[1] is not None else DEFAULT_COB['a']
            cob['b'] = int(row[2]) if row[2] is not None else DEFAULT_COB['b']
            cob['c'] = int(row[3]) if row[3] is not None else DEFAULT_COB['c']
            cob['d'] = int(row[4]) if row[4] is not None else DEFAULT_COB['d']
            logger.info(f"📋 stock-params {ubicacion_id}: LT={lt}, A={cob['a']}d, B={cob['b']}d, C={cob['c']}d, D={cob['d']}d")
    except Exception as e:
        logger.warning(f"No se pudo cargar config tienda para stock-params: {e}. Usando defaults.")

    def calc_params(dias_cob: int) -> dict:
        return {
            'seg': round(lt, 1),
            'min': round(lt + dias_cob / 2.0, 1),
            'max': round(lt + dias_cob, 1),
        }

    params_a = calc_params(cob['a'])
    params_b = calc_params(cob['b'])
    params_c = calc_params(cob['c'])
    # AB = promedio entre A y B, BC = promedio entre B y C
    cob_ab = (cob['a'] + cob['b']) / 2.0
    cob_bc = (cob['b'] + cob['c']) / 2.0
    params_ab = calc_params(cob_ab)
    params_bc = calc_params(cob_bc)

    params_map = {
        'a': params_a,
        'ab': params_ab,
        'b': params_b,
        'bc': params_bc,
        'c': params_c,
    }

    result = {"ubicacion_id": ubicacion_id}
    for abc, vals in params_map.items():
        result[f"stock_min_mult_{abc}"] = vals['min']
        result[f"stock_seg_mult_{abc}"] = vals['seg']
        result[f"stock_max_mult_{abc}"] = vals['max']

    return result


@router.get("/ubicaciones/{ubicacion_id}/almacenes", response_model=AlmacenesUbicacionResponse)
async def get_almacenes_ubicacion(ubicacion_id: str):
    """
    Obtiene los almacenes KLK disponibles para una ubicación.
    """
    try:
        from tiendas_config import TIENDAS_CONFIG, get_almacenes_tienda

        if ubicacion_id not in TIENDAS_CONFIG:
            raise HTTPException(status_code=404, detail=f"Ubicación {ubicacion_id} no encontrada")

        config = TIENDAS_CONFIG[ubicacion_id]

        almacenes = []
        if config.sistema_pos == "klk":
            almacenes_klk = get_almacenes_tienda(ubicacion_id)
            almacenes = [
                AlmacenKLKResponse(
                    codigo=a.codigo,
                    nombre=a.nombre,
                    tipo=a.tipo,
                    incluir_en_deficit=a.incluir_en_deficit,
                    activo=a.activo
                )
                for a in almacenes_klk
            ]

        return AlmacenesUbicacionResponse(
            ubicacion_id=config.ubicacion_id,
            ubicacion_nombre=config.ubicacion_nombre,
            sistema_pos=config.sistema_pos,
            almacenes=almacenes
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo almacenes de ubicación: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@router.get("/almacenes/klk")
async def get_all_almacenes_klk():
    """
    Obtiene todos los almacenes KLK de todas las tiendas.
    """
    try:
        from tiendas_config import get_tiendas_klk, get_almacenes_tienda

        result = []
        tiendas_klk = get_tiendas_klk()

        for tienda_id, config in tiendas_klk.items():
            almacenes = get_almacenes_tienda(tienda_id)
            for almacen in almacenes:
                result.append({
                    "ubicacion_id": tienda_id,
                    "ubicacion_nombre": config.ubicacion_nombre,
                    "almacen_codigo": almacen.codigo,
                    "almacen_nombre": almacen.nombre,
                    "almacen_tipo": almacen.tipo,
                    "incluir_en_deficit": almacen.incluir_en_deficit,
                    "activo": almacen.activo
                })

        return {
            "total": len(result),
            "almacenes": result
        }

    except Exception as e:
        logger.error(f"Error obteniendo almacenes KLK: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@router.get("/ubicaciones/tiendas-por-cedi/{cedi_id}")
async def get_tiendas_por_cedi(cedi_id: str):
    """
    Obtiene las tiendas que son servidas por un CEDI específico.
    Las tiendas se asignan según la región del CEDI.

    - cedi_caracas -> tiendas de región CARACAS
    - cedi_seco/cedi_frio/cedi_verde -> tiendas de región VALENCIA
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Primero obtener la región del CEDI
            cursor.execute(
                "SELECT region FROM ubicaciones WHERE id = %s AND tipo = 'cedi'",
                (cedi_id,)
            )
            cedi_row = cursor.fetchone()

            if not cedi_row:
                raise HTTPException(
                    status_code=404,
                    detail=f"CEDI '{cedi_id}' no encontrado"
                )

            region_cedi = cedi_row[0]

            # Obtener tiendas de la misma región
            cursor.execute(
                """
                SELECT id, nombre, codigo_klk, ciudad, activo
                FROM ubicaciones
                WHERE tipo = 'tienda'
                  AND region = %s
                  AND activo = true
                ORDER BY nombre
                """,
                (region_cedi,)
            )
            tiendas = cursor.fetchall()
            cursor.close()

            return {
                "cedi_id": cedi_id,
                "region": region_cedi,
                "total_tiendas": len(tiendas),
                "tiendas": [
                    {
                        "id": row[0],
                        "nombre": row[1],
                        "codigo_klk": row[2],
                        "ciudad": row[3],
                        "activo": row[4]
                    }
                    for row in tiendas
                ]
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo tiendas por CEDI: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@router.get("/ubicaciones/cedis")
async def get_cedis():
    """
    Obtiene todos los CEDIs disponibles.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, nombre, region, ciudad, activo
                FROM ubicaciones
                WHERE tipo = 'cedi'
                  AND activo = true
                ORDER BY region, nombre
                """
            )
            cedis = cursor.fetchall()
            cursor.close()

            return {
                "total": len(cedis),
                "cedis": [
                    {
                        "id": row[0],
                        "nombre": row[1],
                        "region": row[2],
                        "ciudad": row[3],
                        "activo": row[4]
                    }
                    for row in cedis
                ]
            }

    except Exception as e:
        logger.error(f"Error obteniendo CEDIs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
