"""
Helper para cálculos de clasificación ABC
"""

from typing import List, Optional


def obtener_abc_mas_critico(abc_tiendas: List[Optional[str]]) -> str:
    """
    Retorna el ABC más crítico de una lista.

    Lógica: A > B > C > D (A es más crítico)

    Args:
        abc_tiendas: Lista de clasificaciones ABC ['A', 'B', 'C', 'D', None, 'SIN_VENTAS']

    Returns:
        str: ABC más crítico ('A', 'B', 'C', o 'D')

    Examples:
        >>> obtener_abc_mas_critico(['A', 'C'])
        'A'
        >>> obtener_abc_mas_critico(['B', 'D', None])
        'B'
        >>> obtener_abc_mas_critico(['C', 'C'])
        'C'
        >>> obtener_abc_mas_critico([None, 'SIN_VENTAS'])
        'D'
    """
    # Mapeo de ABC a prioridad (1 = más crítico)
    prioridad = {
        'A': 1,
        'B': 2,
        'C': 3,
        'D': 4,
        'SIN_VENTAS': 5,
        None: 6
    }

    # Filtrar valores válidos
    abc_validos = [abc for abc in abc_tiendas if abc in prioridad]

    if not abc_validos:
        return 'D'  # Default conservador

    # Retornar el de MENOR prioridad (más crítico)
    return min(abc_validos, key=lambda x: prioridad[x])


def obtener_abc_por_tienda_cedi(conn, producto_id: str, tiendas_servidas: List[str]) -> dict:
    """
    Obtiene el ABC de un producto en cada tienda que sirve un CEDI.
    Retorna también el ABC más crítico (para mostrar en CEDI).

    Args:
        conn: Conexión a DB
        producto_id: Código del producto
        tiendas_servidas: Lista de IDs de tiendas (ej: ['tienda_17', 'tienda_18'])

    Returns:
        {
            'abc_por_tienda': {'tienda_17': 'A', 'tienda_18': 'C'},
            'abc_mas_critico': 'A'
        }
    """
    cursor = conn.cursor()

    placeholders = ', '.join(['%s'] * len(tiendas_servidas))
    query = f"""
        SELECT ubicacion_id, clase_abc
        FROM productos_abc_tienda
        WHERE producto_id = %s
          AND ubicacion_id IN ({placeholders})
    """

    params = [producto_id] + tiendas_servidas
    cursor.execute(query, params)
    rows = cursor.fetchall()
    cursor.close()

    # Construir diccionario
    abc_por_tienda = {row[0]: row[1] for row in rows}

    # Obtener ABC más crítico
    abc_values = list(abc_por_tienda.values())
    abc_mas_critico = obtener_abc_mas_critico(abc_values) if abc_values else 'D'

    return {
        'abc_por_tienda': abc_por_tienda,
        'abc_mas_critico': abc_mas_critico
    }
