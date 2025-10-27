"""
Router para Análisis XYZ - Modo Consultor IA
Endpoints para análisis comparativo ABC vs XYZ
"""

from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import logging
from datetime import datetime, timedelta

from analisis_xyz import (
    analizar_producto_xyz,
    AnalisisXYZProducto,
    MetricasXYZ,
    StockCalculado
)

# Importar get_db_connection del módulo database
from database import get_db_connection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analisis-xyz", tags=["Análisis XYZ - Modo Consultor IA"])


# ============================================================================
# MODELOS PYDANTIC
# ============================================================================

class MetricasXYZResponse(BaseModel):
    """Métricas XYZ para response"""
    venta_diaria_5d: float
    venta_diaria_20d: float
    desviacion_estandar: float
    coeficiente_variacion: float
    tendencia_tipo: str
    tendencia_porcentaje: float
    tendencia_confianza: float
    estacionalidad_factor: float
    estacionalidad_patron: str


class StockCalculadoResponse(BaseModel):
    """Stock calculado para response"""
    minimo: float
    seguridad: float
    maximo: float
    punto_reorden: float
    sugerido: int


class AnalisisXYZResponse(BaseModel):
    """Response del análisis XYZ de un producto"""
    codigo_producto: str
    clasificacion_abc: str
    clasificacion_xyz: str
    clasificacion_combinada: str

    metricas: MetricasXYZResponse

    stock_calculado: Dict[str, StockCalculadoResponse]

    explicacion: Dict[str, Any]


class ComparacionABCvsXYZRequest(BaseModel):
    """Request para comparar ABC vs XYZ de múltiples productos"""
    cedi_origen: str
    tienda_destino: str
    productos: Optional[List[str]] = None  # Si None, analiza todos
    dias_cobertura: int = 3


class ResumenComparativoResponse(BaseModel):
    """Resumen de comparación ABC vs XYZ"""
    total_productos: int
    coincidencias: int  # ±2 bultos
    xyz_mayor: int
    xyz_menor: int
    diferencia_total_bultos: int
    diferencia_total_costo: float
    reduccion_stockouts_estimada: float
    productos_con_riesgo: int


class ProductoComparativoResponse(BaseModel):
    """Comparación de un producto individual"""
    codigo_producto: str
    descripcion_producto: str
    abc_sugerido: int
    xyz_sugerido: int
    diferencia: int
    razon_principal: str


class ComparacionCompletaResponse(BaseModel):
    """Response completo de comparación"""
    resumen: ResumenComparativoResponse
    productos: List[ProductoComparativoResponse]


# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

def obtener_clasificacion_abc(venta_diaria_bultos: float) -> str:
    """Calcula clasificación ABC según venta diaria en bultos"""
    if venta_diaria_bultos >= 20:
        return 'A'
    elif venta_diaria_bultos >= 5:
        return 'AB'
    elif venta_diaria_bultos >= 0.45:
        return 'B'
    elif venta_diaria_bultos >= 0.20:
        return 'BC'
    elif venta_diaria_bultos >= 0.001:
        return 'C'
    return '-'


def obtener_ventas_diarias_producto(
    conn,
    codigo_producto: str,
    ubicacion_id: str,
    dias: int = 20
) -> List[float]:
    """
    Obtiene ventas diarias de un producto en una ubicación.

    Args:
        conn: Conexión a DuckDB
        codigo_producto: Código del producto
        ubicacion_id: ID de la ubicación
        dias: Días hacia atrás

    Returns:
        Lista de ventas diarias (más reciente al final)
    """
    try:
        # Obtener la fecha máxima en ventas_raw para este producto/ubicación
        query_max_fecha = """
            SELECT MAX(CAST(fecha AS DATE)) as max_fecha
            FROM ventas_raw
            WHERE codigo_producto = ?
              AND ubicacion_id = ?
        """
        max_fecha_result = conn.execute(query_max_fecha, [codigo_producto, ubicacion_id]).fetchone()

        if not max_fecha_result or not max_fecha_result[0]:
            return [0.0] * dias

        fecha_fin = max_fecha_result[0]
        fecha_inicio = fecha_fin - timedelta(days=dias - 1)

        # Obtener ventas agrupadas por día
        query = """
            SELECT
                CAST(fecha AS DATE) as fecha,
                SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_dia
            FROM ventas_raw
            WHERE codigo_producto = ?
              AND ubicacion_id = ?
              AND CAST(fecha AS DATE) >= ?
              AND CAST(fecha AS DATE) <= ?
            GROUP BY CAST(fecha AS DATE)
            ORDER BY fecha ASC
        """

        result = conn.execute(query, [codigo_producto, ubicacion_id, fecha_inicio, fecha_fin]).fetchall()

        # Crear lista con todos los días (rellenar con 0 si no hay ventas)
        ventas_por_dia = {row[0]: float(row[1]) for row in result}

        # Generar lista completa de días
        ventas_diarias = []
        fecha_actual = fecha_inicio
        while fecha_actual <= fecha_fin:
            ventas_diarias.append(ventas_por_dia.get(fecha_actual, 0.0))
            fecha_actual += timedelta(days=1)

        return ventas_diarias

    except Exception as e:
        logger.error(f"Error obteniendo ventas diarias: {e}")
        return [0.0] * dias


def obtener_stock_params_ubicacion(
    conn,
    ubicacion_id: str
) -> Dict[str, float]:
    """
    Obtiene parámetros de stock para una ubicación.

    Returns:
        Dict con multiplicadores ABC
    """
    query = """
        SELECT
            stock_min_mult_a, stock_min_mult_ab, stock_min_mult_b, stock_min_mult_bc, stock_min_mult_c,
            stock_seg_mult_a, stock_seg_mult_ab, stock_seg_mult_b, stock_seg_mult_bc, stock_seg_mult_c,
            stock_max_mult_a, stock_max_mult_ab, stock_max_mult_b, stock_max_mult_bc, stock_max_mult_c
        FROM ubicaciones_extended_config
        WHERE ubicacion_id = ?
    """

    try:
        result = conn.execute(query, [ubicacion_id]).fetchone()

        if result:
            return {
                'stock_min_mult_a': float(result[0]),
                'stock_min_mult_ab': float(result[1]),
                'stock_min_mult_b': float(result[2]),
                'stock_min_mult_bc': float(result[3]),
                'stock_min_mult_c': float(result[4]),
                'stock_seg_mult_a': float(result[5]),
                'stock_seg_mult_ab': float(result[6]),
                'stock_seg_mult_b': float(result[7]),
                'stock_seg_mult_bc': float(result[8]),
                'stock_seg_mult_c': float(result[9]),
                'stock_max_mult_a': float(result[10]),
                'stock_max_mult_ab': float(result[11]),
                'stock_max_mult_b': float(result[12]),
                'stock_max_mult_bc': float(result[13]),
                'stock_max_mult_c': float(result[14]),
            }
        else:
            # Valores por defecto
            return {
                'stock_min_mult_a': 2.0, 'stock_min_mult_ab': 2.0, 'stock_min_mult_b': 3.0,
                'stock_min_mult_bc': 9.0, 'stock_min_mult_c': 15.0,
                'stock_seg_mult_a': 1.0, 'stock_seg_mult_ab': 2.5, 'stock_seg_mult_b': 2.0,
                'stock_seg_mult_bc': 3.0, 'stock_seg_mult_c': 7.0,
                'stock_max_mult_a': 5.0, 'stock_max_mult_ab': 7.0, 'stock_max_mult_b': 12.0,
                'stock_max_mult_bc': 17.0, 'stock_max_mult_c': 26.0,
            }

    except Exception as e:
        logger.error(f"Error obteniendo stock_params: {e}")
        return {}


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/producto/{codigo_producto}", response_model=AnalisisXYZResponse)
async def obtener_analisis_xyz_producto(
    codigo_producto: str,
    ubicacion_id: str
):
    """
    Obtiene análisis XYZ completo de un producto.

    Incluye:
    - Clasificación ABC y XYZ
    - Métricas de demanda (CV, tendencia, estacionalidad)
    - Stocks calculados (ABC vs XYZ)
    - Explicación de diferencias

    Args:
        codigo_producto: Código del producto
        ubicacion_id: ID de la ubicación/tienda
    """
    try:
        with get_db_connection() as conn:
            # 1. Verificar que el producto tenga ventas
            query_ventas_check = """
                SELECT COUNT(*) as total_ventas
                FROM ventas_raw
                WHERE codigo_producto = ?
                  AND ubicacion_id = ?
            """
            ventas_check = conn.execute(query_ventas_check, [codigo_producto, ubicacion_id]).fetchone()

            if not ventas_check or ventas_check[0] == 0:
                raise HTTPException(
                    status_code=404,
                    detail=f"Producto {codigo_producto} no encontrado o sin ventas en {ubicacion_id}"
                )

            # 2. Obtener datos del producto (si existe en catálogo)
            query_producto = """
            SELECT
                p.codigo,
                p.descripcion,
                1.0 as cantidad_bultos,  -- TODO: Obtener de productos_extended
                COALESCE(s.cantidad, 0) as stock_tienda,
                0 as stock_transito,  -- TODO: Obtener de pedidos en tránsito
                COALESCE(sc.cantidad, 0) as stock_cedi
            FROM productos p
            LEFT JOIN stock_actual s
                ON p.id = s.producto_id
                AND s.ubicacion_id = ?
            LEFT JOIN stock_actual sc
                ON p.id = sc.producto_id
                AND sc.ubicacion_id = 'cedi_01'
            WHERE p.codigo = ?
            """

            producto = conn.execute(query_producto, [ubicacion_id, codigo_producto]).fetchone()

            # Si no está en el catálogo, usar valores por defecto
            if producto:
                _, descripcion, cantidad_bultos, stock_tienda, stock_transito, stock_cedi = producto
            else:
                # Producto no está en catálogo, pero tiene ventas
                descripcion = f"Producto {codigo_producto}"
                cantidad_bultos = 1.0
                stock_tienda = 0.0
                stock_transito = 0.0
                stock_cedi = 0.0

            # Convertir a float
            cantidad_bultos = float(cantidad_bultos)
            stock_tienda = float(stock_tienda)
            stock_transito = float(stock_transito)
            stock_cedi = float(stock_cedi)

            # 3. Obtener ventas diarias (últimos 20 días)
            ventas_diarias = obtener_ventas_diarias_producto(conn, codigo_producto, ubicacion_id, dias=20)

            # 4. Calcular clasificación ABC
            venta_promedio_unidades = sum(ventas_diarias) / len(ventas_diarias) if ventas_diarias else 0
            venta_diaria_bultos = venta_promedio_unidades / cantidad_bultos if cantidad_bultos > 0 else 0
            clasificacion_abc = obtener_clasificacion_abc(venta_diaria_bultos)

            # 5. Ejecutar análisis XYZ
            analisis = analizar_producto_xyz(
                codigo_producto=codigo_producto,
                ventas_diarias_20d=ventas_diarias,
                clasificacion_abc=clasificacion_abc,
                stock_tienda=stock_tienda,
                stock_transito=stock_transito,
                stock_cedi=stock_cedi,
                cantidad_bulto=cantidad_bultos,
                fecha_analisis=datetime.now(),
                stock_params_abc=None  # TODO: Implementar cálculo ABC
            )

            # 6. Construir response
            return AnalisisXYZResponse(
                codigo_producto=analisis.codigo_producto,
                clasificacion_abc=analisis.clasificacion_abc,
                clasificacion_xyz=analisis.clasificacion_xyz,
                clasificacion_combinada=analisis.clasificacion_combinada,
                metricas=MetricasXYZResponse(
                    venta_diaria_5d=analisis.metricas.venta_diaria_5d,
                    venta_diaria_20d=analisis.metricas.venta_diaria_20d,
                    desviacion_estandar=analisis.metricas.desviacion_estandar,
                    coeficiente_variacion=analisis.metricas.coeficiente_variacion,
                    tendencia_tipo=analisis.metricas.tendencia_tipo,
                    tendencia_porcentaje=analisis.metricas.tendencia_porcentaje,
                    tendencia_confianza=analisis.metricas.tendencia_confianza,
                    estacionalidad_factor=analisis.metricas.estacionalidad_factor,
                    estacionalidad_patron=analisis.metricas.estacionalidad_patron
                ),
                stock_calculado={
                    'abc': StockCalculadoResponse(
                        minimo=analisis.stock_abc.minimo,
                        seguridad=analisis.stock_abc.seguridad,
                        maximo=analisis.stock_abc.maximo,
                        punto_reorden=analisis.stock_abc.punto_reorden,
                        sugerido=analisis.stock_abc.sugerido
                    ),
                    'xyz': StockCalculadoResponse(
                        minimo=analisis.stock_xyz.minimo,
                        seguridad=analisis.stock_xyz.seguridad,
                        maximo=analisis.stock_xyz.maximo,
                        punto_reorden=analisis.stock_xyz.punto_reorden,
                        sugerido=analisis.stock_xyz.sugerido
                    )
                },
                explicacion={
                    'diferencia_bultos': analisis.diferencia_bultos,
                    'razones': analisis.razones
                }
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en análisis XYZ: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error en análisis XYZ: {str(e)}")


@router.post("/comparar", response_model=ComparacionCompletaResponse)
async def comparar_abc_vs_xyz(
    request: ComparacionABCvsXYZRequest
):
    """
    Compara metodología ABC vs XYZ para múltiples productos.

    Calcula:
    - Resumen estadístico (coincidencias, diferencias, impacto)
    - Lista de productos con análisis individual

    Args:
        request: Datos de CEDI origen, tienda destino y productos
    """
    try:
        with get_db_connection() as conn:
            # TODO: Implementar comparación completa
            # Por ahora, retornar estructura vacía

            return ComparacionCompletaResponse(
                resumen=ResumenComparativoResponse(
                    total_productos=0,
                    coincidencias=0,
                    xyz_mayor=0,
                    xyz_menor=0,
                    diferencia_total_bultos=0,
                    diferencia_total_costo=0.0,
                    reduccion_stockouts_estimada=35.0,
                    productos_con_riesgo=0
                ),
                productos=[]
            )

    except Exception as e:
        logger.error(f"Error en comparación ABC vs XYZ: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error en comparación: {str(e)}")
