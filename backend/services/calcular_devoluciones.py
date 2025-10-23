"""
Servicio para calcular devoluciones sugeridas
Identifica productos con exceso de stock que deberían devolverse al CEDI
"""

import duckdb
from decimal import Decimal
from typing import List, Dict, Optional
from datetime import datetime, date, timedelta
import logging

logger = logging.getLogger(__name__)


def calcular_devoluciones_sugeridas(
    conn: duckdb.DuckDBPyConnection,
    tienda_id: str,
    cedi_origen_id: str,
    umbral_minimo_bultos: float = 1.0
) -> List[Dict]:
    """
    Calcula devoluciones sugeridas para una tienda

    Args:
        conn: Conexión a DuckDB
        tienda_id: ID de la tienda
        cedi_origen_id: ID del CEDI origen
        umbral_minimo_bultos: Mínimo de bultos para considerar devolución

    Returns:
        Lista de productos sugeridos para devolución
    """

    query = """
    WITH stock_actual AS (
        -- Obtener stock actual de la tienda
        SELECT
            producto_id,
            codigo_stellar,
            SUM(cantidad) as stock_actual
        FROM stock_actual
        WHERE tienda_id = ?
        GROUP BY producto_id, codigo_stellar
    ),
    ventas_recientes AS (
        -- Calcular ventas de los últimos 30 días
        SELECT
            producto_id,
            SUM(cantidad) as ventas_30dias,
            COUNT(DISTINCT DATE(fecha_venta)) as dias_con_venta,
            MAX(DATE(fecha_venta)) as ultima_venta
        FROM ventas
        WHERE tienda_id = ?
            AND fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY producto_id
    ),
    parametros_inventario AS (
        -- Obtener parámetros de inventario (stock_min, stock_max)
        -- Por ahora usamos valores por defecto ya que no tenemos esta tabla aún
        SELECT
            p.producto_id,
            p.codigo_stellar,
            p.nombre as descripcion_producto,
            p.categoria,
            p.grupo,
            p.subgrupo,
            p.marca,
            CAST(COALESCE(m.cantidad_bulto, 12) AS DECIMAL(12,4)) as cantidad_bultos,
            CAST(COALESCE(m.peso, 0) AS DECIMAL(12,4)) as peso_unitario_kg,
            CAST(COALESCE(m.peso_bulto, m.peso * m.cantidad_bulto, 0) AS DECIMAL(12,4)) as peso_bulto_kg,
            -- Stock máximo estimado: 30 días de cobertura basado en ventas promedio
            -- Si no hay ventas, usamos 2 bultos como máximo
            CASE
                WHEN vr.ventas_30dias > 0 THEN vr.ventas_30dias
                ELSE COALESCE(m.cantidad_bulto, 12) * 2
            END as stock_maximo_estimado,
            -- Stock óptimo: 15 días de cobertura
            CASE
                WHEN vr.ventas_30dias > 0 THEN vr.ventas_30dias * 0.5
                ELSE COALESCE(m.cantidad_bulto, 12)
            END as stock_optimo_estimado
        FROM productos p
        LEFT JOIN maestro_productos m ON p.codigo_stellar = m.codigo_stellar
        LEFT JOIN ventas_recientes vr ON p.producto_id = vr.producto_id
    )
    SELECT
        pi.producto_id,
        pi.codigo_stellar as codigo_producto,
        pi.descripcion_producto,
        pi.categoria,
        pi.grupo,
        pi.subgrupo,
        pi.marca,
        pi.cantidad_bultos,
        pi.peso_unitario_kg,
        pi.peso_bulto_kg,

        -- Stock actual
        CAST(COALESCE(sa.stock_actual, 0) AS DECIMAL(12,2)) as stock_actual_tienda,

        -- Límites
        CAST(pi.stock_maximo_estimado AS DECIMAL(12,2)) as stock_maximo,
        CAST(pi.stock_optimo_estimado AS DECIMAL(12,2)) as stock_optimo,

        -- Exceso
        CAST(GREATEST(sa.stock_actual - pi.stock_maximo_estimado, 0) AS DECIMAL(12,2)) as exceso_unidades,
        CAST(GREATEST(sa.stock_actual - pi.stock_maximo_estimado, 0) / pi.cantidad_bultos AS DECIMAL(12,2)) as exceso_bultos,

        -- Ventas recientes
        CAST(COALESCE(vr.ventas_30dias, 0) AS DECIMAL(12,2)) as ventas_30dias,
        CAST(COALESCE(vr.ventas_30dias / 30.0, 0) AS DECIMAL(12,2)) as prom_ventas_30dias,

        -- Días sin venta
        CAST(COALESCE(DATEDIFF('day', vr.ultima_venta, CURRENT_DATE), 999) AS INTEGER) as dias_sin_venta,

        -- Días de cobertura actual
        CASE
            WHEN COALESCE(vr.ventas_30dias, 0) > 0 THEN
                CAST(sa.stock_actual / (vr.ventas_30dias / 30.0) AS DECIMAL(8,2))
            ELSE
                CAST(999 AS DECIMAL(8,2))
        END as dias_cobertura_actual

    FROM parametros_inventario pi
    INNER JOIN stock_actual sa ON pi.producto_id = sa.producto_id
    LEFT JOIN ventas_recientes vr ON pi.producto_id = vr.producto_id
    WHERE sa.stock_actual > pi.stock_maximo_estimado
        AND (sa.stock_actual - pi.stock_maximo_estimado) / pi.cantidad_bultos >= ?
    ORDER BY exceso_bultos DESC, dias_sin_venta DESC
    LIMIT 200
    """

    try:
        result = conn.execute(query, [tienda_id, tienda_id, umbral_minimo_bultos]).fetchall()

        devoluciones = []
        for row in result:
            (
                producto_id, codigo_producto, descripcion_producto,
                categoria, grupo, subgrupo, marca,
                cantidad_bultos, peso_unitario_kg, peso_bulto_kg,
                stock_actual, stock_maximo, stock_optimo,
                exceso_unidades, exceso_bultos,
                ventas_30dias, prom_ventas_30dias,
                dias_sin_venta, dias_cobertura_actual
            ) = row

            # Calcular cantidad sugerida de devolución
            # Queremos devolver hasta el stock óptimo (no el máximo)
            devolver_unidades = stock_actual - stock_optimo
            devolver_bultos = int(devolver_unidades / cantidad_bultos)

            # No devolver si es menos de 1 bulto
            if devolver_bultos < 1:
                continue

            # Ajustar a bultos completos
            devolver_unidades_ajustado = devolver_bultos * cantidad_bultos

            # Determinar prioridad
            prioridad = determinar_prioridad_devolucion(
                exceso_bultos=float(exceso_bultos),
                dias_sin_venta=dias_sin_venta,
                dias_cobertura=float(dias_cobertura_actual) if dias_cobertura_actual != 999 else None
            )

            # Determinar razón
            razon = generar_razon_devolucion(
                exceso_unidades=float(exceso_unidades),
                exceso_bultos=float(exceso_bultos),
                dias_sin_venta=dias_sin_venta,
                dias_cobertura=float(dias_cobertura_actual) if dias_cobertura_actual != 999 else None,
                prom_ventas=float(prom_ventas_30dias)
            )

            devolucion = {
                "codigo_producto": codigo_producto,
                "descripcion_producto": descripcion_producto,
                "categoria": categoria,
                "grupo": grupo,
                "subgrupo": subgrupo,
                "marca": marca,
                "cantidad_bultos": float(cantidad_bultos),
                "peso_unitario_kg": float(peso_unitario_kg) if peso_unitario_kg else None,
                "peso_bulto_kg": float(peso_bulto_kg) if peso_bulto_kg else None,

                # Stock
                "stock_actual_tienda": float(stock_actual),
                "stock_maximo": float(stock_maximo),
                "stock_optimo": float(stock_optimo),
                "exceso_unidades": float(exceso_unidades),
                "exceso_bultos": float(exceso_bultos),

                # Devolución sugerida
                "devolucion_sugerida_unidades": float(devolver_unidades_ajustado),
                "devolucion_sugerida_bultos": float(devolver_bultos),
                "devolucion_sugerida_kg": float(devolver_bultos * peso_bulto_kg) if peso_bulto_kg else None,

                # Razón y prioridad
                "razon_devolucion": razon,
                "prioridad_devolucion": prioridad,

                # Análisis de rotación
                "dias_sin_venta": dias_sin_venta if dias_sin_venta != 999 else None,
                "prom_ventas_30dias": float(prom_ventas_30dias),
                "dias_cobertura_actual": float(dias_cobertura_actual) if dias_cobertura_actual != 999 else None,
            }

            devoluciones.append(devolucion)

        logger.info(f"Calculadas {len(devoluciones)} devoluciones sugeridas para tienda {tienda_id}")
        return devoluciones

    except Exception as e:
        logger.error(f"Error calculando devoluciones: {str(e)}")
        raise


def determinar_prioridad_devolucion(
    exceso_bultos: float,
    dias_sin_venta: Optional[int],
    dias_cobertura: Optional[float]
) -> str:
    """
    Determina la prioridad de una devolución

    Criterios:
    - URGENTE: Más de 10 bultos de exceso O más de 60 días sin venta
    - ALTA: Más de 5 bultos de exceso O más de 30 días sin venta
    - MEDIA: Más de 2 bultos de exceso O más de 15 días sin venta
    - BAJA: Resto
    """

    # Urgente
    if exceso_bultos >= 10:
        return "urgente"
    if dias_sin_venta and dias_sin_venta >= 60:
        return "urgente"
    if dias_cobertura and dias_cobertura >= 90:
        return "urgente"

    # Alta
    if exceso_bultos >= 5:
        return "alta"
    if dias_sin_venta and dias_sin_venta >= 30:
        return "alta"
    if dias_cobertura and dias_cobertura >= 60:
        return "alta"

    # Media
    if exceso_bultos >= 2:
        return "media"
    if dias_sin_venta and dias_sin_venta >= 15:
        return "media"
    if dias_cobertura and dias_cobertura >= 45:
        return "media"

    # Baja
    return "baja"


def generar_razon_devolucion(
    exceso_unidades: float,
    exceso_bultos: float,
    dias_sin_venta: Optional[int],
    dias_cobertura: Optional[float],
    prom_ventas: float
) -> str:
    """
    Genera una razón descriptiva para la devolución
    """
    razones = []

    # Razón principal: exceso
    razones.append(f"Stock excede máximo por {exceso_unidades:.0f} unidades ({exceso_bultos:.1f} bultos)")

    # Razón secundaria: sin ventas
    if dias_sin_venta and dias_sin_venta >= 30:
        if dias_sin_venta >= 60:
            razones.append(f"Sin ventas hace {dias_sin_venta} días")
        else:
            razones.append(f"{dias_sin_venta} días sin venta")

    # Razón secundaria: baja rotación
    if prom_ventas > 0 and prom_ventas < 1:
        razones.append(f"Rotación muy baja ({prom_ventas:.2f} unid/día)")

    # Razón secundaria: sobrestock
    if dias_cobertura and dias_cobertura >= 60:
        razones.append(f"Cobertura excesiva ({dias_cobertura:.0f} días)")

    return ". ".join(razones)


def aplicar_reglas_exclusion(
    devoluciones: List[Dict],
    productos_excluir: Optional[List[str]] = None,
    categorias_excluir: Optional[List[str]] = None
) -> List[Dict]:
    """
    Aplica reglas de exclusión a las devoluciones sugeridas

    Args:
        devoluciones: Lista de devoluciones calculadas
        productos_excluir: Códigos de productos a excluir
        categorias_excluir: Categorías a excluir

    Returns:
        Lista filtrada de devoluciones
    """
    if not productos_excluir:
        productos_excluir = []
    if not categorias_excluir:
        categorias_excluir = []

    devoluciones_filtradas = []

    for dev in devoluciones:
        # Excluir por código de producto
        if dev["codigo_producto"] in productos_excluir:
            dev["incluido"] = False
            dev["motivo_exclusion"] = "Producto en lista de exclusión"
            devoluciones_filtradas.append(dev)
            continue

        # Excluir por categoría
        if dev.get("categoria") in categorias_excluir:
            dev["incluido"] = False
            dev["motivo_exclusion"] = f"Categoría '{dev.get('categoria')}' excluida"
            devoluciones_filtradas.append(dev)
            continue

        # Incluir
        dev["incluido"] = True
        devoluciones_filtradas.append(dev)

    return devoluciones_filtradas
