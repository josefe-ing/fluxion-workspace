"""
Router para clasificación ABC v2 basada en valor económico.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
import duckdb
from pathlib import Path
from pydantic import BaseModel

router = APIRouter(prefix="/api/abc-v2", tags=["ABC v2"])

# Path a la base de datos
DB_PATH = Path(__file__).parent.parent.parent / "data" / "fluxion_production.db"


class ClasificacionABCv2(BaseModel):
    """Modelo de clasificación ABC v2 de un producto."""
    codigo_producto: str
    clasificacion_abc_valor: str
    ranking_valor: int
    valor_consumo_total: float
    porcentaje_valor: float
    porcentaje_acumulado: float
    unidades_vendidas_total: float
    numero_ubicaciones: int
    # Comparación con ABC velocidad
    clasificacion_velocidad: Optional[str] = None
    tiene_discrepancia: bool = False
    tipo_discrepancia: Optional[str] = None
    # Campos XYZ (variabilidad de demanda)
    clasificacion_xyz: Optional[str] = None
    matriz_abc_xyz: Optional[str] = None
    coeficiente_variacion: Optional[float] = None
    demanda_promedio_semanal: Optional[float] = None
    desviacion_estandar_semanal: Optional[float] = None
    semanas_con_venta: Optional[int] = None
    confiabilidad_calculo: Optional[str] = None
    es_extremadamente_volatil: Optional[bool] = None


class ResumenABCv2(BaseModel):
    """Resumen de la clasificación ABC v2."""
    total_productos: int
    productos_a: int
    productos_b: int
    productos_c: int
    valor_total: float
    porcentaje_valor_a: float
    cumple_pareto: bool
    fecha_calculo: str


@router.get("/resumen", response_model=ResumenABCv2)
async def get_resumen_abc_v2(ubicacion_id: Optional[str] = None):
    """
    Obtener resumen general de la clasificación ABC v2.
    Opcionalmente filtrar por tienda.
    """
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        # Verificar que existan datos
        count_query = "SELECT COUNT(*) FROM productos_abc_v2"
        if ubicacion_id:
            count_query += f" WHERE ubicacion_id = '{ubicacion_id}'"

        count = conn.execute(count_query).fetchone()[0]
        if count == 0:
            raise HTTPException(
                status_code=404,
                detail="No hay datos ABC v2. Ejecutar cálculo primero."
            )

        # Obtener resumen
        where_clause = ""
        if ubicacion_id:
            where_clause = f"AND ubicacion_id = '{ubicacion_id}'"

        query = f"""
        SELECT
            COUNT(*) as total_productos,
            COUNT(CASE WHEN clasificacion_abc_valor = 'A' THEN 1 END) as productos_a,
            COUNT(CASE WHEN clasificacion_abc_valor = 'B' THEN 1 END) as productos_b,
            COUNT(CASE WHEN clasificacion_abc_valor = 'C' THEN 1 END) as productos_c,
            SUM(valor_consumo_total) as valor_total,
            SUM(CASE WHEN clasificacion_abc_valor = 'A' THEN porcentaje_valor ELSE 0 END) as porcentaje_valor_a,
            MAX(fecha_calculo) as fecha_calculo
        FROM productos_abc_v2
        WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
        {where_clause}
        """

        result = conn.execute(query).fetchone()
        conn.close()

        cumple_pareto = result[5] >= 75  # Si clase A tiene >=75% del valor

        return ResumenABCv2(
            total_productos=result[0],
            productos_a=result[1],
            productos_b=result[2],
            productos_c=result[3],
            valor_total=round(result[4], 2),
            porcentaje_valor_a=round(result[5], 2),
            cumple_pareto=cumple_pareto,
            fecha_calculo=str(result[6])
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo resumen: {str(e)}")


@router.get("/producto/{codigo_producto}", response_model=ClasificacionABCv2)
async def get_clasificacion_producto(codigo_producto: str, ubicacion_id: Optional[str] = None):
    """
    Obtener clasificación ABC v2 de un producto específico.
    Si ubicacion_id no se especifica, devuelve datos agregados o primera coincidencia.
    """
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        where_clause = "WHERE codigo_producto = ?"
        params = [codigo_producto]

        if ubicacion_id:
            where_clause += " AND ubicacion_id = ?"
            params.append(ubicacion_id)

        query = f"""
        SELECT
            codigo_producto,
            clasificacion_abc_valor,
            ranking_valor,
            valor_consumo_total,
            porcentaje_valor,
            porcentaje_acumulado,
            unidades_vendidas_total,
            numero_ubicaciones,
            clasificacion_velocidad,
            clasificacion_xyz,
            matriz_abc_xyz,
            coeficiente_variacion,
            demanda_promedio_semanal,
            desviacion_estandar_semanal,
            semanas_con_venta,
            confiabilidad_calculo,
            es_extremadamente_volatil
        FROM productos_abc_v2
        {where_clause}
        LIMIT 1
        """

        result = conn.execute(query, params).fetchone()
        conn.close()

        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Producto {codigo_producto} no encontrado en ABC v2"
            )

        # Determinar discrepancia
        clasificacion_valor = result[1]
        clasificacion_velocidad = result[8]

        tiene_discrepancia = False
        tipo_discrepancia = None

        if clasificacion_velocidad and clasificacion_valor in ['A', 'B', 'C']:
            if clasificacion_velocidad in ['A', 'AB'] and clasificacion_valor == 'C':
                tiene_discrepancia = True
                tipo_discrepancia = "Alta velocidad, bajo valor"
            elif clasificacion_velocidad in ['C', 'BC'] and clasificacion_valor == 'A':
                tiene_discrepancia = True
                tipo_discrepancia = "Baja velocidad, alto valor"
            elif abs(ord(clasificacion_velocidad[0]) - ord(clasificacion_valor)) > 1:
                tiene_discrepancia = True
                tipo_discrepancia = "Discrepancia moderada"

        return ClasificacionABCv2(
            codigo_producto=result[0],
            clasificacion_abc_valor=result[1],
            ranking_valor=result[2],
            valor_consumo_total=round(result[3], 2),
            porcentaje_valor=round(result[4], 4),
            porcentaje_acumulado=round(result[5], 2),
            unidades_vendidas_total=round(result[6], 2),
            numero_ubicaciones=result[7],
            clasificacion_velocidad=clasificacion_velocidad,
            tiene_discrepancia=tiene_discrepancia,
            tipo_discrepancia=tipo_discrepancia,
            # Campos XYZ
            clasificacion_xyz=result[9],
            matriz_abc_xyz=result[10],
            coeficiente_variacion=round(result[11], 4) if result[11] is not None else None,
            demanda_promedio_semanal=round(result[12], 2) if result[12] is not None else None,
            desviacion_estandar_semanal=round(result[13], 2) if result[13] is not None else None,
            semanas_con_venta=result[14],
            confiabilidad_calculo=result[15],
            es_extremadamente_volatil=result[16]
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/productos", response_model=List[ClasificacionABCv2])
async def get_clasificaciones_productos(
    codigos: Optional[str] = None,
    clasificacion: Optional[str] = None,
    ubicacion_id: Optional[str] = None,
    limit: int = 100
):
    """
    Obtener clasificaciones ABC v2 de múltiples productos.

    - codigos: Lista de códigos separados por coma (ej: "001,002,003")
    - clasificacion: Filtrar por clasificación ('A', 'B', 'C')
    - ubicacion_id: Filtrar por tienda
    - limit: Límite de resultados (default: 100)
    """
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        # Construir query
        where_clauses = []
        params = []

        if codigos:
            codigo_list = [c.strip() for c in codigos.split(',')]
            placeholders = ','.join(['?' for _ in codigo_list])
            where_clauses.append(f"codigo_producto IN ({placeholders})")
            params.extend(codigo_list)

        if clasificacion:
            where_clauses.append("clasificacion_abc_valor = ?")
            params.append(clasificacion)

        if ubicacion_id:
            where_clauses.append("ubicacion_id = ?")
            params.append(ubicacion_id)

        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

        query = f"""
        SELECT
            codigo_producto,
            clasificacion_abc_valor,
            ranking_valor,
            valor_consumo_total,
            porcentaje_valor,
            porcentaje_acumulado,
            unidades_vendidas_total,
            numero_ubicaciones,
            clasificacion_velocidad,
            clasificacion_xyz,
            matriz_abc_xyz,
            coeficiente_variacion,
            demanda_promedio_semanal,
            desviacion_estandar_semanal,
            semanas_con_venta,
            confiabilidad_calculo,
            es_extremadamente_volatil
        FROM productos_abc_v2
        WHERE {where_sql}
        ORDER BY ranking_valor
        LIMIT ?
        """

        params.append(limit)

        results = conn.execute(query, params).fetchall()
        conn.close()

        # Convertir a modelos
        clasificaciones = []
        for row in results:
            # Determinar discrepancia
            clasificacion_valor = row[1]
            clasificacion_velocidad = row[8]

            tiene_discrepancia = False
            tipo_discrepancia = None

            if clasificacion_velocidad and clasificacion_valor in ['A', 'B', 'C']:
                if clasificacion_velocidad in ['A', 'AB'] and clasificacion_valor == 'C':
                    tiene_discrepancia = True
                    tipo_discrepancia = "Alta velocidad, bajo valor"
                elif clasificacion_velocidad in ['C', 'BC'] and clasificacion_valor == 'A':
                    tiene_discrepancia = True
                    tipo_discrepancia = "Baja velocidad, alto valor"

            clasificaciones.append(ClasificacionABCv2(
                codigo_producto=row[0],
                clasificacion_abc_valor=row[1],
                ranking_valor=row[2],
                valor_consumo_total=round(row[3], 2),
                porcentaje_valor=round(row[4], 4),
                porcentaje_acumulado=round(row[5], 2),
                unidades_vendidas_total=round(row[6], 2),
                numero_ubicaciones=row[7],
                clasificacion_velocidad=clasificacion_velocidad,
                tiene_discrepancia=tiene_discrepancia,
                tipo_discrepancia=tipo_discrepancia,
                # Campos XYZ
                clasificacion_xyz=row[9],
                matriz_abc_xyz=row[10],
                coeficiente_variacion=round(row[11], 4) if row[11] is not None else None,
                demanda_promedio_semanal=round(row[12], 2) if row[12] is not None else None,
                desviacion_estandar_semanal=round(row[13], 2) if row[13] is not None else None,
                semanas_con_venta=row[14],
                confiabilidad_calculo=row[15],
                es_extremadamente_volatil=row[16]
            ))

        return clasificaciones

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/top/{n}", response_model=List[ClasificacionABCv2])
async def get_top_productos(n: int = 20):
    """
    Obtener los TOP N productos por valor de consumo.
    """
    if n > 100:
        n = 100  # Limitar a 100

    return await get_clasificaciones_productos(limit=n)
