"""
Router para el Sistema de Nivel Objetivo v2.0 (ABC-XYZ)
Endpoints para calcular niveles objetivo y cantidades sugeridas basadas en clasificación ABC-XYZ
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from decimal import Decimal
from datetime import datetime, date
import duckdb
import logging
import math

from database import get_db_connection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/niveles-inventario", tags=["Nivel Objetivo v2.0"])


# ============================================================================
# MODELS
# ============================================================================

class DatosCalculo(BaseModel):
    """Datos completos del cálculo para transparencia"""
    demanda_promedio_diaria: float
    desviacion_estandar_diaria: float
    periodo_reposicion_dias: float
    nivel_servicio_z: float
    multiplicador_demanda: float
    multiplicador_ss: float
    timestamp: str


class NivelObjetivoData(BaseModel):
    """Datos del nivel objetivo calculado"""
    producto_id: str
    tienda_id: str
    matriz_abc_xyz: str
    demanda_promedio_diaria: float
    desviacion_estandar_diaria: float
    demanda_ciclo: float
    stock_seguridad: float
    nivel_objetivo: float
    inventario_en_transito: float
    metodo_calculo: str = "NIVEL_OBJETIVO_V2"
    datos_calculo: DatosCalculo


class CantidadSugeridaData(NivelObjetivoData):
    """Nivel objetivo + cantidad sugerida"""
    stock_actual: float
    cantidad_sugerida: float


class ProductoNivelObjetivo(BaseModel):
    """Producto con nivel objetivo para listados - Modelo extendido v2.0"""
    # Identificación
    producto_id: str
    nombre_producto: str
    matriz_abc_xyz: str
    cuadrante: str = "NO ESPECIFICADO"  # Cuadrante numérico (I, II, III, etc.)

    # Promedios de demanda (en unidades base)
    demanda_promedio_diaria: float
    demanda_5_dias: float = 0.0
    demanda_20_dias: float = 0.0
    demanda_mismo_dia: float = 0.0  # Proyección para hoy
    demanda_proyeccion: float = 0.0  # Proyección próximo período

    # Stock detallado
    stock_actual: float
    stock_cedi: float = 0.0  # Stock disponible en CEDI origen
    inventario_en_transito: float
    stock_total: float = 0.0  # stock_actual + transito
    dias_stock_actual: float

    # Parámetros de reorden (calculados)
    stock_minimo: float = 0.0
    stock_seguridad: float
    punto_reorden: float = 0.0
    stock_maximo: float = 0.0

    # Nivel objetivo y sugerencia
    demanda_ciclo: float
    nivel_objetivo: float
    cantidad_sugerida: float

    # Metadata
    prioridad: int
    peso_kg: float = 0.0  # Peso unitario en kilogramos
    unidad_medida: str = "UN"  # UN, KG, LT, etc.


class NivelesInventarioTiendaResponse(BaseModel):
    """Respuesta con todos los productos de una tienda"""
    success: bool = True
    tienda_id: str
    tienda_nombre: str
    total_productos: int
    productos_calculados: int
    productos_con_deficit: int
    timestamp: str
    productos: List[ProductoNivelObjetivo]


class CalcularNivelObjetivoRequest(BaseModel):
    """Request para calcular nivel objetivo de un producto"""
    producto_id: str
    tienda_id: str


class CalcularCantidadSugeridaRequest(BaseModel):
    """Request para calcular cantidad sugerida"""
    producto_id: str
    tienda_id: str
    stock_actual: Optional[float] = None


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_db():
    """Get database connection"""
    with get_db_connection() as conn:
        yield conn


def obtener_parametros_matriz(conn: duckdb.DuckDBPyConnection, tienda_id: str, matriz: str) -> Dict[str, Any]:
    """Obtiene parámetros de reposición para una matriz ABC-XYZ"""
    try:
        result = conn.execute("""
            SELECT
                nivel_servicio_z,
                multiplicador_demanda,
                multiplicador_ss,
                incluir_stock_seguridad,
                prioridad_reposicion
            FROM parametros_reposicion_tienda
            WHERE tienda_id = ?
              AND matriz_abc_xyz = ?
              AND activo = true
        """, [tienda_id, matriz]).fetchone()

        if not result:
            # Defaults si no hay configuración
            logger.warning(f"No se encontraron parámetros para {tienda_id}/{matriz}, usando defaults")
            return {
                'nivel_servicio_z': 1.65,  # 95%
                'multiplicador_demanda': 1.0,
                'multiplicador_ss': 1.0,
                'incluir_stock_seguridad': True,
                'prioridad_reposicion': 5
            }

        return {
            'nivel_servicio_z': float(result[0]),
            'multiplicador_demanda': float(result[1]),
            'multiplicador_ss': float(result[2]),
            'incluir_stock_seguridad': bool(result[3]),
            'prioridad_reposicion': int(result[4])
        }
    except Exception as e:
        logger.error(f"Error obteniendo parámetros: {e}")
        raise


def calcular_nivel_objetivo_producto(
    conn: duckdb.DuckDBPyConnection,
    producto_id: str,  # Ahora es codigo_producto
    tienda_id: str,
    stock_actual: Optional[float] = None
) -> Dict[str, Any]:
    """
    Calcula nivel objetivo para un producto usando método ABC-XYZ v2.0

    Fórmula:
    Nivel Objetivo = Demanda Ciclo + Stock de Seguridad

    Donde:
    - Demanda Ciclo = demanda_promedio_diaria * periodo_reposicion * multiplicador_demanda
    - Stock Seguridad = Z × σ_diaria × √T × multiplicador_ss
    """
    try:
        # 1. Obtener datos del producto desde productos_abc_v2 y ventas_raw (sin duplicados)
        query = """
            SELECT
                p.codigo_producto,
                p.matriz_abc_xyz,
                MAX(p.demanda_promedio_semanal) as demanda_promedio_semanal,
                MAX(p.desviacion_estandar_semanal) as desviacion_estandar_semanal,
                MAX(v.descripcion_producto) as descripcion_producto,
                -- STOCK ESTIMADO: Si no hay stock real, usar 10 días de demanda promedio
                COALESCE(
                    TRY_CAST(MAX(s.cantidad) AS DOUBLE),
                    (MAX(p.demanda_promedio_semanal) / 7.0) * 10.0
                ) as stock_actual,
                0.0 as inventario_en_transito
            FROM productos_abc_v2 p
            LEFT JOIN ventas_raw v ON p.codigo_producto = v.codigo_producto AND p.ubicacion_id = v.ubicacion_id
            LEFT JOIN stock_actual s ON s.producto_id = p.codigo_producto AND s.ubicacion_id = p.ubicacion_id
            WHERE p.codigo_producto = ?
              AND p.ubicacion_id = ?
            GROUP BY p.codigo_producto, p.matriz_abc_xyz
            LIMIT 1
        """

        result = conn.execute(query, [producto_id, tienda_id]).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail=f"Producto {producto_id} no encontrado en {tienda_id}")

        codigo_producto, matriz, demanda_semanal, desv_std_semanal, nombre, stock_db, inventario_transito = result

        # Si no tiene matriz, no podemos calcular
        if not matriz or matriz == 'None':
            raise HTTPException(
                status_code=400,
                detail=f"Producto {codigo_producto} no tiene clasificación ABC-XYZ válida"
            )

        # 2. Obtener parámetros de la matriz
        params = obtener_parametros_matriz(conn, tienda_id, matriz)

        # 3. Convertir demanda semanal a diaria
        demanda_promedio_diaria = float(demanda_semanal or 0) / 7.0
        desviacion_estandar_diaria = float(desv_std_semanal or 0) / math.sqrt(7.0)

        # 4. Periodo de reposición (2.5 días por defecto - configurable)
        periodo_reposicion_dias = 2.5

        # 5. Calcular Demanda Ciclo
        demanda_ciclo = (
            demanda_promedio_diaria *
            periodo_reposicion_dias *
            params['multiplicador_demanda']
        )

        # 6. Calcular Stock de Seguridad
        if params['incluir_stock_seguridad']:
            stock_seguridad = (
                params['nivel_servicio_z'] *
                desviacion_estandar_diaria *
                math.sqrt(periodo_reposicion_dias) *
                params['multiplicador_ss']
            )
        else:
            stock_seguridad = 0.0

        # 7. Nivel Objetivo = Demanda Ciclo + Stock Seguridad
        nivel_objetivo = demanda_ciclo + stock_seguridad

        # 8. Usar stock_actual del parámetro si se proporciona, sino del DB
        stock_usado = stock_actual if stock_actual is not None else float(stock_db)

        # 9. Calcular cantidad sugerida
        stock_disponible = stock_usado + float(inventario_transito)
        cantidad_sugerida = max(0, nivel_objetivo - stock_disponible)

        # 10. Calcular días de stock actual
        if demanda_promedio_diaria > 0:
            dias_stock_actual = stock_disponible / demanda_promedio_diaria
        else:
            dias_stock_actual = float('inf')

        # 11. Armar respuesta
        datos_calculo = DatosCalculo(
            demanda_promedio_diaria=demanda_promedio_diaria,
            desviacion_estandar_diaria=desviacion_estandar_diaria,
            periodo_reposicion_dias=periodo_reposicion_dias,
            nivel_servicio_z=params['nivel_servicio_z'],
            multiplicador_demanda=params['multiplicador_demanda'],
            multiplicador_ss=params['multiplicador_ss'],
            timestamp=datetime.now().isoformat()
        )

        return {
            'producto_id': producto_id,
            'nombre_producto': nombre,
            'tienda_id': tienda_id,
            'matriz_abc_xyz': matriz,
            'demanda_promedio_diaria': demanda_promedio_diaria,
            'desviacion_estandar_diaria': desviacion_estandar_diaria,
            'demanda_ciclo': demanda_ciclo,
            'stock_seguridad': stock_seguridad,
            'nivel_objetivo': nivel_objetivo,
            'stock_actual': stock_usado,
            'inventario_en_transito': float(inventario_transito),
            'cantidad_sugerida': cantidad_sugerida,
            'prioridad': params['prioridad_reposicion'],
            'dias_stock_actual': dias_stock_actual,
            'datos_calculo': datos_calculo
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculando nivel objetivo: {e}")
        raise HTTPException(status_code=500, detail=f"Error en cálculo: {str(e)}")


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/calcular")
async def calcular_nivel_objetivo(
    request: CalcularNivelObjetivoRequest,
    conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    """
    Calcula el nivel objetivo para un producto específico en una tienda
    """
    try:
        resultado = calcular_nivel_objetivo_producto(
            conn=conn,
            producto_id=request.producto_id,
            tienda_id=request.tienda_id
        )

        return {
            'success': True,
            'data': NivelObjetivoData(
                producto_id=resultado['producto_id'],
                tienda_id=resultado['tienda_id'],
                matriz_abc_xyz=resultado['matriz_abc_xyz'],
                demanda_promedio_diaria=resultado['demanda_promedio_diaria'],
                desviacion_estandar_diaria=resultado['desviacion_estandar_diaria'],
                demanda_ciclo=resultado['demanda_ciclo'],
                stock_seguridad=resultado['stock_seguridad'],
                nivel_objetivo=resultado['nivel_objetivo'],
                inventario_en_transito=resultado['inventario_en_transito'],
                datos_calculo=resultado['datos_calculo']
            )
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en endpoint calcular: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cantidad-sugerida")
async def calcular_cantidad_sugerida(
    request: CalcularCantidadSugeridaRequest,
    conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    """
    Calcula la cantidad sugerida para un producto
    """
    try:
        resultado = calcular_nivel_objetivo_producto(
            conn=conn,
            producto_id=request.producto_id,
            tienda_id=request.tienda_id,
            stock_actual=request.stock_actual
        )

        return {
            'success': True,
            'data': CantidadSugeridaData(
                producto_id=resultado['producto_id'],
                tienda_id=resultado['tienda_id'],
                matriz_abc_xyz=resultado['matriz_abc_xyz'],
                demanda_promedio_diaria=resultado['demanda_promedio_diaria'],
                desviacion_estandar_diaria=resultado['desviacion_estandar_diaria'],
                demanda_ciclo=resultado['demanda_ciclo'],
                stock_seguridad=resultado['stock_seguridad'],
                nivel_objetivo=resultado['nivel_objetivo'],
                inventario_en_transito=resultado['inventario_en_transito'],
                stock_actual=resultado['stock_actual'],
                cantidad_sugerida=resultado['cantidad_sugerida'],
                datos_calculo=resultado['datos_calculo']
            )
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en endpoint cantidad-sugerida: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tienda/{tienda_id}")
async def obtener_niveles_tienda(
    tienda_id: str,
    limite: Optional[int] = None,
    solo_con_deficit: bool = False,
    conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    """
    Obtiene los niveles objetivo para todos los productos de una tienda
    """
    try:
        # 1. Obtener nombre de la tienda
        tienda_result = conn.execute("""
            SELECT nombre FROM ubicaciones WHERE id = ? LIMIT 1
        """, [tienda_id]).fetchone()

        if not tienda_result:
            raise HTTPException(status_code=404, detail=f"Tienda {tienda_id} no encontrada")

        tienda_nombre = tienda_result[0]

        # 2. Obtener todos los productos con clasificación ABC-XYZ para esta tienda (sin duplicados)
        # Incluye datos extendidos: peso, unidad medida, stock CEDI, parámetros de reorden
        query = """
            SELECT DISTINCT
                p.codigo_producto,
                MAX(v.descripcion_producto) as nombre_producto,
                p.matriz_abc_xyz,
                COALESCE(MAX(v.cuadrante_producto), 'NO ESPECIFICADO') as cuadrante,
                MAX(p.demanda_promedio_semanal) as demanda_promedio_semanal,
                MAX(p.desviacion_estandar_semanal) as desviacion_estandar_semanal,
                -- STOCK ESTIMADO: Si no hay stock real, usar 10 días de demanda promedio como stock inicial
                COALESCE(
                    TRY_CAST(MAX(s.cantidad) AS DOUBLE),
                    (MAX(p.demanda_promedio_semanal) / 7.0) * 10.0
                ) as stock_actual,
                0.0 as inventario_en_transito,
                COALESCE(TRY_CAST(MAX(v.peso_calculado) AS DOUBLE), 0.0) as peso_kg,
                'UN' as unidad_medida,
                COALESCE(TRY_CAST(MAX(s.stock_minimo) AS DOUBLE), 0.0) as stock_minimo_db,
                COALESCE(TRY_CAST(MAX(s.stock_maximo) AS DOUBLE), 0.0) as stock_maximo_db
            FROM productos_abc_v2 p
            LEFT JOIN ventas_raw v ON p.codigo_producto = v.codigo_producto AND p.ubicacion_id = v.ubicacion_id
            LEFT JOIN stock_actual s ON s.producto_id = p.codigo_producto AND s.ubicacion_id = p.ubicacion_id
            WHERE p.ubicacion_id = ?
              AND p.matriz_abc_xyz IS NOT NULL
              AND p.matriz_abc_xyz != 'None'
            GROUP BY p.codigo_producto, p.matriz_abc_xyz
            ORDER BY p.matriz_abc_xyz ASC, p.codigo_producto ASC
        """

        if limite:
            query += f" LIMIT {limite}"

        results = conn.execute(query, [tienda_id]).fetchall()

        # 3. Calcular nivel objetivo para cada producto
        productos = []
        productos_calculados = 0
        productos_con_deficit = 0

        for row in results:
            try:
                producto_id = row[0]
                nombre = row[1]
                matriz = row[2]
                cuadrante = row[3]  # Cuadrante numérico (I, II, III, etc.)
                stock_actual = float(row[6])
                inventario_transito = float(row[7])
                peso_kg = float(row[8])
                unidad_medida = row[9]
                stock_minimo_db = float(row[10])
                stock_maximo_db = float(row[11])

                # Calcular nivel objetivo
                calc = calcular_nivel_objetivo_producto(
                    conn=conn,
                    producto_id=producto_id,
                    tienda_id=tienda_id,
                    stock_actual=stock_actual
                )

                productos_calculados += 1

                if calc['cantidad_sugerida'] > 0:
                    productos_con_deficit += 1

                # Si solo queremos productos con déficit, filtrar
                if solo_con_deficit and calc['cantidad_sugerida'] <= 0:
                    continue

                # Calcular promedios de demanda en diferentes períodos
                demanda_diaria = calc['demanda_promedio_diaria']
                demanda_5_dias = demanda_diaria * 5
                demanda_20_dias = demanda_diaria * 20
                demanda_mismo_dia = demanda_diaria  # Proyección para hoy
                demanda_proyeccion = demanda_diaria * 7  # Proyección semanal

                # Calcular stock total
                stock_total = stock_actual + inventario_transito

                # TODO: Obtener stock CEDI cuando tengamos el CEDI origen
                stock_cedi = 0.0

                # Calcular parámetros de reorden
                stock_minimo = stock_minimo_db if stock_minimo_db > 0 else calc['stock_seguridad'] * 0.5
                punto_reorden = calc['stock_seguridad'] + (demanda_diaria * 2.5)  # SS + demanda ciclo
                stock_maximo = stock_maximo_db if stock_maximo_db > 0 else calc['nivel_objetivo'] * 1.5

                productos.append(ProductoNivelObjetivo(
                    # Identificación
                    producto_id=producto_id,
                    nombre_producto=nombre,
                    matriz_abc_xyz=matriz,
                    cuadrante=cuadrante,

                    # Promedios de demanda
                    demanda_promedio_diaria=demanda_diaria,
                    demanda_5_dias=demanda_5_dias,
                    demanda_20_dias=demanda_20_dias,
                    demanda_mismo_dia=demanda_mismo_dia,
                    demanda_proyeccion=demanda_proyeccion,

                    # Stock detallado
                    stock_actual=stock_actual,
                    stock_cedi=stock_cedi,
                    inventario_en_transito=inventario_transito,
                    stock_total=stock_total,
                    dias_stock_actual=calc['dias_stock_actual'],

                    # Parámetros de reorden
                    stock_minimo=stock_minimo,
                    stock_seguridad=calc['stock_seguridad'],
                    punto_reorden=punto_reorden,
                    stock_maximo=stock_maximo,

                    # Nivel objetivo y sugerencia
                    demanda_ciclo=calc['demanda_ciclo'],
                    nivel_objetivo=calc['nivel_objetivo'],
                    cantidad_sugerida=calc['cantidad_sugerida'],

                    # Metadata
                    prioridad=calc['prioridad'],
                    peso_kg=peso_kg,
                    unidad_medida=unidad_medida
                ))

            except Exception as e:
                logger.warning(f"Error calculando producto {producto_id}: {e}")
                continue

        return NivelesInventarioTiendaResponse(
            tienda_id=tienda_id,
            tienda_nombre=tienda_nombre,
            total_productos=len(results),
            productos_calculados=productos_calculados,
            productos_con_deficit=productos_con_deficit,
            timestamp=datetime.now().isoformat(),
            productos=productos
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo niveles de tienda: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINT: Obtener Datos de Clasificación ABC-XYZ de un Producto
# ============================================================================

class ClasificacionABCXYZData(BaseModel):
    """Datos de clasificación ABC-XYZ de un producto"""
    # Clasificación ABC
    valor_ventas_total: float
    percentil_abc: float
    umbral_a: float = 80.0
    umbral_b: float = 50.0

    # Clasificación XYZ
    demanda_promedio: float
    desviacion_estandar: float
    coeficiente_variacion: float

    # Parámetros aplicados
    nivel_servicio_z: float
    multiplicador_demanda: float
    multiplicador_ss: float
    incluye_ss: bool
    prioridad: int


class ClasificacionABCXYZResponse(BaseModel):
    """Respuesta con datos de clasificación"""
    success: bool = True
    producto_id: str
    tienda_id: str
    matriz_abc_xyz: str
    clasificacion_data: ClasificacionABCXYZData


@router.get("/clasificacion/{tienda_id}/{producto_id}", response_model=ClasificacionABCXYZResponse)
def obtener_clasificacion_producto(
    tienda_id: str,
    producto_id: str
) -> ClasificacionABCXYZResponse:
    """
    Obtiene los datos de clasificación ABC-XYZ de un producto en una tienda específica.

    Incluye:
    - Matemática de clasificación ABC (valor de ventas, percentil)
    - Matemática de clasificación XYZ (promedio, desviación, CV)
    - Parámetros de reposición aplicados

    Args:
        tienda_id: ID de la tienda
        producto_id: ID del producto

    Returns:
        ClasificacionABCXYZResponse con datos completos de clasificación
    """
    try:
        with get_db_connection() as conn:
            # 1. Obtener datos ABC-XYZ del producto
            query_producto = """
                SELECT
                    p.codigo_producto,
                    p.matriz_abc_xyz,
                    p.demanda_promedio_semanal,
                    p.desviacion_estandar_semanal,
                    p.valor_consumo_total,
                    p.porcentaje_acumulado,
                    p.coeficiente_variacion
                FROM productos_abc_v2 p
                WHERE p.codigo_producto = ?
                  AND p.ubicacion_id = ?
                  AND p.matriz_abc_xyz IS NOT NULL
                  AND p.clasificacion_abc_valor IN ('A', 'B', 'C')
                LIMIT 1
            """

            result = conn.execute(query_producto, [producto_id, tienda_id]).fetchone()

            if not result:
                raise HTTPException(
                    status_code=404,
                    detail=f"Producto {producto_id} no encontrado en tienda {tienda_id} o sin clasificación ABC-XYZ"
                )

            matriz_abc_xyz = result[1]
            demanda_promedio_semanal = float(result[2]) if result[2] is not None else 0.0
            desviacion_estandar_semanal = float(result[3]) if result[3] is not None else 0.0
            valor_ventas_total = float(result[4]) if result[4] is not None else 0.0
            percentil_abc = float(result[5]) if result[5] is not None else 0.0
            coeficiente_variacion_db = float(result[6]) if result[6] is not None else 0.0

            # Convertir demanda a diaria
            demanda_promedio_diaria = demanda_promedio_semanal / 7.0
            desviacion_estandar_diaria = desviacion_estandar_semanal / math.sqrt(7.0)

            # Usar el CV ya calculado en la BD, o calcularlo si no existe
            cv = coeficiente_variacion_db if coeficiente_variacion_db > 0 else (
                desviacion_estandar_diaria / demanda_promedio_diaria if demanda_promedio_diaria > 0 else 0.0
            )

            # 2. Obtener parámetros de reposición para esta matriz
            params = obtener_parametros_matriz(conn, tienda_id, matriz_abc_xyz)

            # 3. Determinar prioridad
            prioridades = {
                'AX': 1, 'AY': 2, 'AZ': 3,
                'BX': 4, 'BY': 5, 'BZ': 6,
                'CX': 7, 'CY': 8, 'CZ': 9
            }
            prioridad = prioridades.get(matriz_abc_xyz, 99)

            clasificacion_data = ClasificacionABCXYZData(
                # ABC
                valor_ventas_total=valor_ventas_total,
                percentil_abc=percentil_abc,
                umbral_a=80.0,
                umbral_b=50.0,

                # XYZ
                demanda_promedio=demanda_promedio_diaria,
                desviacion_estandar=desviacion_estandar_diaria,
                coeficiente_variacion=cv,

                # Parámetros
                nivel_servicio_z=params['nivel_servicio_z'],
                multiplicador_demanda=params['multiplicador_demanda'],
                multiplicador_ss=params['multiplicador_ss'],
                incluye_ss=params['incluir_stock_seguridad'],
                prioridad=prioridad
            )

            return ClasificacionABCXYZResponse(
                success=True,
                producto_id=producto_id,
                tienda_id=tienda_id,
                matriz_abc_xyz=matriz_abc_xyz,
                clasificacion_data=clasificacion_data
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo clasificación ABC-XYZ: {e}")
        raise HTTPException(status_code=500, detail=str(e))
