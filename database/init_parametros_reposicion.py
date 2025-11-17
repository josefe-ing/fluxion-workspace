#!/usr/bin/env python3
"""
Script de Inicialización de Parámetros de Reposición

Descripción:
    Inicializa la tabla parametros_reposicion_tienda con valores por defecto
    para todas las tiendas activas del sistema. Cada tienda recibe configuración
    para los 9 cuadrantes de la matriz ABC-XYZ (AX, AY, AZ, BX, BY, BZ, CX, CY, CZ).

Parámetros por defecto basados en:
    - Nivel de servicio deseado (Z-score)
    - Variabilidad de demanda (XYZ)
    - Importancia económica (ABC)

Uso:
    python3 init_parametros_reposicion.py

Autor: Sistema FluxionIA
Fecha: 2025-01-12
Versión: 1.0
"""

import duckdb
import uuid
from datetime import datetime
from pathlib import Path

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

# Ruta a la base de datos DuckDB
DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"

# Valores por defecto para cada cuadrante ABC-XYZ
# Estructura: (matriz, Z-score, mult_demanda, mult_ss, incluir_ss, prioridad)
PARAMETROS_DEFAULT = [
    # Clase A (Alto valor económico) - Mayor nivel de servicio
    ('AX', 1.96, 1.00, 1.00, True, 1),   # Alta prioridad, estable: servicio 97.5%
    ('AY', 1.96, 1.05, 1.25, True, 2),   # Alta prioridad, media variabilidad: + inventario
    ('AZ', 1.96, 1.10, 1.50, True, 3),   # Alta prioridad, muy variable: máxima protección

    # Clase B (Valor medio) - Nivel de servicio moderado
    ('BX', 1.65, 1.00, 1.00, True, 4),   # Media prioridad, estable: servicio 95%
    ('BY', 1.65, 1.00, 1.10, True, 5),   # Media prioridad, media variabilidad: ajuste moderado
    ('BZ', 1.65, 1.05, 1.25, True, 6),   # Media prioridad, muy variable: más protección

    # Clase C (Bajo valor económico) - Nivel de servicio básico
    ('CX', 1.28, 1.00, 1.00, True, 7),   # Baja prioridad, estable: servicio 90%
    ('CY', 1.28, 1.00, 0.50, True, 8),   # Baja prioridad, media variabilidad: SS reducido
    ('CZ', 0.00, 0.75, 0.00, False, 9),  # Baja prioridad, muy variable: sin SS, demanda reducida
]


# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

def generar_uuid() -> str:
    """Genera un UUID v4 como string"""
    return str(uuid.uuid4())


def conectar_db() -> duckdb.DuckDBPyConnection:
    """Conecta a la base de datos DuckDB"""
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Base de datos no encontrada: {DB_PATH}")

    print(f"✓ Conectando a: {DB_PATH}")
    return duckdb.connect(str(DB_PATH))


def obtener_tiendas_activas(conn: duckdb.DuckDBPyConnection) -> list:
    """
    Obtiene lista de tiendas activas del sistema

    Returns:
        Lista de tuplas (id, nombre) de tiendas activas
    """
    query = """
    SELECT id, nombre
    FROM ubicaciones
    WHERE tipo = 'tienda'
      AND activo = true
    ORDER BY nombre
    """

    result = conn.execute(query).fetchall()
    print(f"✓ Tiendas activas encontradas: {len(result)}")

    for tienda_id, nombre in result:
        print(f"  - {tienda_id}: {nombre}")

    return result


def verificar_parametros_existentes(conn: duckdb.DuckDBPyConnection, tienda_id: str) -> int:
    """
    Verifica cuántos parámetros ya existen para una tienda

    Returns:
        Cantidad de registros existentes para la tienda
    """
    query = """
    SELECT COUNT(*) as total
    FROM parametros_reposicion_tienda
    WHERE tienda_id = ?
    """

    result = conn.execute(query, [tienda_id]).fetchone()
    return result[0] if result else 0


def insertar_parametros_tienda(
    conn: duckdb.DuckDBPyConnection,
    tienda_id: str,
    tienda_nombre: str,
    sobrescribir: bool = False
) -> int:
    """
    Inserta parámetros de reposición para una tienda

    Args:
        conn: Conexión a DuckDB
        tienda_id: ID de la tienda
        tienda_nombre: Nombre de la tienda
        sobrescribir: Si True, elimina parámetros existentes antes de insertar

    Returns:
        Cantidad de registros insertados
    """

    # Verificar si ya existen parámetros
    existentes = verificar_parametros_existentes(conn, tienda_id)

    if existentes > 0 and not sobrescribir:
        print(f"  ⚠ Tienda '{tienda_nombre}' ya tiene {existentes} parámetros configurados (saltando)")
        return 0

    if existentes > 0 and sobrescribir:
        print(f"  ⚠ Eliminando {existentes} parámetros existentes...")
        conn.execute("DELETE FROM parametros_reposicion_tienda WHERE tienda_id = ?", [tienda_id])

    # Preparar datos para inserción
    registros_insertados = 0
    fecha_actual = datetime.now().isoformat()

    insert_query = """
    INSERT INTO parametros_reposicion_tienda (
        id,
        tienda_id,
        matriz_abc_xyz,
        nivel_servicio_z,
        multiplicador_demanda,
        multiplicador_ss,
        incluir_stock_seguridad,
        prioridad_reposicion,
        activo,
        fecha_creacion,
        fecha_modificacion,
        modificado_por
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """

    # Insertar cada cuadrante ABC-XYZ
    for matriz, z_score, mult_demanda, mult_ss, incluir_ss, prioridad in PARAMETROS_DEFAULT:
        registro_id = generar_uuid()

        conn.execute(insert_query, [
            registro_id,
            tienda_id,
            matriz,
            z_score,
            mult_demanda,
            mult_ss,
            incluir_ss,
            prioridad,
            True,  # activo
            fecha_actual,
            fecha_actual,
            'sistema'
        ])

        registros_insertados += 1

    print(f"  ✓ Insertados {registros_insertados} parámetros para '{tienda_nombre}'")
    return registros_insertados


def mostrar_resumen_parametros(conn: duckdb.DuckDBPyConnection):
    """Muestra resumen de parámetros configurados"""

    query = """
    SELECT
        COUNT(DISTINCT tienda_id) as total_tiendas,
        COUNT(*) as total_parametros,
        SUM(CASE WHEN activo = true THEN 1 ELSE 0 END) as parametros_activos
    FROM parametros_reposicion_tienda
    """

    result = conn.execute(query).fetchone()

    if result:
        total_tiendas, total_parametros, parametros_activos = result
        print("\n" + "="*70)
        print("RESUMEN DE CONFIGURACIÓN")
        print("="*70)
        print(f"Total de tiendas configuradas:  {total_tiendas}")
        print(f"Total de parámetros:            {total_parametros}")
        print(f"Parámetros activos:             {parametros_activos}")
        print(f"Promedio por tienda:            {total_parametros / max(total_tiendas, 1):.1f}")
        print("="*70)


def mostrar_ejemplo_configuracion(conn: duckdb.DuckDBPyConnection):
    """Muestra un ejemplo de configuración para una tienda"""

    query = """
    SELECT
        u.nombre as tienda,
        p.matriz_abc_xyz,
        p.nivel_servicio_z,
        p.multiplicador_demanda,
        p.multiplicador_ss,
        p.incluir_stock_seguridad,
        p.prioridad_reposicion
    FROM parametros_reposicion_tienda p
    JOIN ubicaciones u ON p.tienda_id = u.id
    WHERE p.activo = true
    LIMIT 9
    """

    result = conn.execute(query).fetchall()

    if result:
        print("\n" + "="*70)
        print(f"EJEMPLO DE CONFIGURACIÓN: {result[0][0]}")
        print("="*70)
        print(f"{'Matriz':<8} {'Z-Score':<10} {'Mult.Dem':<12} {'Mult.SS':<10} {'Inc.SS':<8} {'Prior.'}")
        print("-"*70)

        for row in result:
            tienda, matriz, z, mult_d, mult_ss, inc_ss, prior = row
            inc_ss_str = "Sí" if inc_ss else "No"
            print(f"{matriz:<8} {z:<10.2f} {mult_d:<12.2f} {mult_ss:<10.2f} {inc_ss_str:<8} {prior}")

        print("="*70)


# ============================================================================
# FUNCIÓN PRINCIPAL
# ============================================================================

def main(sobrescribir: bool = False):
    """
    Función principal de inicialización

    Args:
        sobrescribir: Si True, sobrescribe parámetros existentes
    """

    print("\n" + "="*70)
    print("INICIALIZACIÓN DE PARÁMETROS DE REPOSICIÓN")
    print("="*70)
    print(f"Base de datos: {DB_PATH}")
    print(f"Modo sobrescribir: {'Sí' if sobrescribir else 'No'}")
    print("="*70 + "\n")

    try:
        # Conectar a la base de datos
        conn = conectar_db()

        # Obtener tiendas activas
        tiendas = obtener_tiendas_activas(conn)

        if not tiendas:
            print("⚠ No se encontraron tiendas activas en el sistema")
            return

        print(f"\n{'='*70}")
        print("INSERTANDO PARÁMETROS")
        print('='*70 + "\n")

        # Insertar parámetros para cada tienda
        total_insertados = 0
        for tienda_id, tienda_nombre in tiendas:
            insertados = insertar_parametros_tienda(conn, tienda_id, tienda_nombre, sobrescribir)
            total_insertados += insertados

        # Commit de cambios
        conn.commit()

        print(f"\n✓ Total de parámetros insertados: {total_insertados}")

        # Mostrar resumen
        mostrar_resumen_parametros(conn)

        # Mostrar ejemplo de configuración
        mostrar_ejemplo_configuracion(conn)

        # Cerrar conexión
        conn.close()

        print("\n✓ Inicialización completada exitosamente\n")

    except Exception as e:
        print(f"\n✗ Error durante la inicialización: {e}")
        raise


# ============================================================================
# PUNTO DE ENTRADA
# ============================================================================

if __name__ == "__main__":
    import sys

    # Verificar si se pasó flag de sobrescribir
    sobrescribir = '--sobrescribir' in sys.argv or '--force' in sys.argv

    if sobrescribir:
        print("\n⚠ ADVERTENCIA: Modo sobrescribir activado")
        print("Esto eliminará todos los parámetros existentes y los reemplazará por los valores por defecto.\n")

        respuesta = input("¿Estás seguro de continuar? (s/N): ")
        if respuesta.lower() != 's':
            print("Operación cancelada")
            sys.exit(0)

    main(sobrescribir=sobrescribir)
