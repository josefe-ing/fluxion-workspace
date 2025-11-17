#!/usr/bin/env python3
"""
Tests Unitarios - Sistema de Nivel Objetivo

Descripción:
    Tests para validar el cálculo de niveles objetivo con productos reales
    de diferentes matrices ABC-XYZ.

Productos de prueba:
    - Producto AX: Alto valor, estable
    - Producto BY: Medio valor, media variabilidad
    - Producto CZ: Bajo valor, muy variable

Autor: Sistema FluxionIA
Fecha: 2025-01-12
Versión: 1.0
"""

import sys
from pathlib import Path

# Agregar directorio padre al path para importar servicios
sys.path.insert(0, str(Path(__file__).parent))

from services.nivel_objetivo_service import NivelObjetivoService
import duckdb
from typing import Dict, List


# ============================================================================
# CONFIGURACIÓN
# ============================================================================

# Ruta correcta a la BD (desde backend/)
DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"

# Si no existe, intentar ruta alternativa
if not DB_PATH.exists():
    DB_PATH = Path(__file__).parent /  "../data/fluxion_production.db"

TIENDA_TEST = "tienda_01"  # PERIFERICO


# ============================================================================
# UTILIDADES
# ============================================================================

def print_section(title: str):
    """Imprime encabezado de sección"""
    print("\n" + "="*70)
    print(title)
    print("="*70)


def print_success(message: str):
    """Imprime mensaje de éxito"""
    print(f"✓ {message}")


def print_error(message: str):
    """Imprime mensaje de error"""
    print(f"✗ {message}")


def print_info(message: str):
    """Imprime mensaje informativo"""
    print(f"  {message}")


def obtener_producto_por_matriz(matriz: str) -> Dict:
    """
    Obtiene un producto de ejemplo para una matriz ABC-XYZ específica

    Args:
        matriz: Código de matriz (ej: 'AX', 'BY', 'CZ')

    Returns:
        Dict con código_producto, nombre, y métricas
    """
    conn = duckdb.connect(str(DB_PATH))

    query = """
    SELECT
        abc.codigo_producto,
        abc.matriz_abc_xyz,
        abc.clasificacion_abc_valor,
        abc.clasificacion_xyz,
        abc.demanda_promedio_semanal,
        abc.desviacion_estandar_semanal,
        abc.coeficiente_variacion
    FROM productos_abc_v2 abc
    WHERE abc.ubicacion_id = ?
      AND abc.matriz_abc_xyz = ?
      AND abc.demanda_promedio_semanal > 0
    ORDER BY abc.demanda_promedio_semanal DESC
    LIMIT 1
    """

    result = conn.execute(query, [TIENDA_TEST, matriz]).fetchone()
    conn.close()

    if not result:
        return None

    return {
        'codigo_producto': result[0],
        'nombre_producto': f"Producto {result[0]} ({matriz})",  # Nombre genérico
        'matriz_abc_xyz': result[1],
        'clasificacion_abc': result[2],
        'clasificacion_xyz': result[3],
        'demanda_promedio_semanal': float(result[4]) if result[4] else 0,
        'desviacion_estandar_semanal': float(result[5]) if result[5] else 0,
        'coeficiente_variacion': float(result[6]) if result[6] else 0
    }


# ============================================================================
# TESTS
# ============================================================================

def test_1_conexion_servicio():
    """Test 1: Verificar que el servicio se conecta correctamente"""
    print_section("TEST 1: CONEXIÓN AL SERVICIO")

    try:
        with NivelObjetivoService(str(DB_PATH)) as service:
            print_success("Servicio inicializado correctamente")
            print_info(f"Base de datos: {service.db_path}")
            print_info(f"Lead time: {service.LEAD_TIME_DIAS} días")
            print_info(f"Ciclo revisión: {service.CICLO_REVISION_DIAS} días")
            print_info(f"Periodo reposición: {service.PERIODO_REPOSICION_DIAS} días")
            return True
    except Exception as e:
        print_error(f"Error al conectar servicio: {e}")
        return False


def test_2_obtener_demanda_promedio():
    """Test 2: Obtener demanda promedio para un producto"""
    print_section("TEST 2: OBTENER DEMANDA PROMEDIO")

    # Obtener un producto AX (alta prioridad, estable)
    producto = obtener_producto_por_matriz('AX')

    if not producto:
        print_error("No se encontró producto de prueba con matriz AX")
        return False

    print_info(f"Producto de prueba: {producto['codigo_producto']}")
    print_info(f"  Nombre: {producto['nombre_producto']}")
    print_info(f"  Matriz: {producto['matriz_abc_xyz']}")
    print_info(f"  Demanda semanal: {producto['demanda_promedio_semanal']:.2f}")

    try:
        with NivelObjetivoService(str(DB_PATH)) as service:
            resultado = service.obtener_demanda_promedio_diaria(
                producto['codigo_producto'],
                TIENDA_TEST
            )

        print_success("Demanda obtenida correctamente")
        print_info(f"  Demanda promedio diaria: {resultado['demanda_promedio_diaria']:.2f} unidades/día")
        print_info(f"  Desviación estándar diaria: {resultado['desviacion_estandar_diaria']:.2f}")
        print_info(f"  Coeficiente de variación: {resultado['coeficiente_variacion']:.3f}")
        print_info(f"  Confiabilidad: {resultado['confiabilidad_calculo']}")

        return True

    except Exception as e:
        print_error(f"Error al obtener demanda: {e}")
        return False


def test_3_calcular_nivel_objetivo_ax():
    """Test 3: Calcular nivel objetivo para producto AX (alta prioridad, estable)"""
    print_section("TEST 3: NIVEL OBJETIVO - PRODUCTO AX")

    producto = obtener_producto_por_matriz('AX')

    if not producto:
        print_error("No se encontró producto AX de prueba")
        return False

    print_info(f"Producto: {producto['codigo_producto']} - {producto['nombre_producto']}")
    print_info(f"Clasificación: {producto['clasificacion_abc']} (ABC) / {producto['clasificacion_xyz']} (XYZ)")

    try:
        with NivelObjetivoService(str(DB_PATH)) as service:
            resultado = service.calcular_nivel_objetivo(
                producto['codigo_producto'],
                TIENDA_TEST
            )

        print_success("Nivel objetivo calculado correctamente")
        print_info("\nResultado del cálculo:")
        print_info(f"  Nivel objetivo: {resultado['nivel_objetivo']} unidades")
        print_info(f"  Stock seguridad: {resultado['stock_seguridad']} unidades")
        print_info(f"  Demanda ciclo: {resultado['demanda_ciclo']:.2f} unidades")
        print_info(f"  Matriz ABC-XYZ: {resultado['matriz_abc_xyz']}")

        print_info("\nParámetros usados:")
        params = resultado['parametros_usados']
        print_info(f"  Z-score: {params['nivel_servicio_z']}")
        print_info(f"  Multiplicador demanda: {params['multiplicador_demanda']}")
        print_info(f"  Multiplicador SS: {params['multiplicador_ss']}")
        print_info(f"  Incluir SS: {params['incluir_stock_seguridad']}")

        if resultado['alertas']:
            print_info("\nAlertas:")
            for alerta in resultado['alertas']:
                print_info(f"  - {alerta}")

        # Validaciones
        assert resultado['nivel_objetivo'] > 0, "Nivel objetivo debe ser mayor a 0"
        assert resultado['stock_seguridad'] > 0, "Producto AX debe tener stock de seguridad"
        assert resultado['matriz_abc_xyz'] == 'AX', "Matriz debe ser AX"

        return True

    except AssertionError as e:
        print_error(f"Validación fallida: {e}")
        return False
    except Exception as e:
        print_error(f"Error al calcular nivel objetivo: {e}")
        return False


def test_4_calcular_nivel_objetivo_by():
    """Test 4: Calcular nivel objetivo para producto BY (media prioridad, media variabilidad)"""
    print_section("TEST 4: NIVEL OBJETIVO - PRODUCTO BY")

    producto = obtener_producto_por_matriz('BY')

    if not producto:
        print_error("No se encontró producto BY de prueba")
        return False

    print_info(f"Producto: {producto['codigo_producto']} - {producto['nombre_producto']}")
    print_info(f"CV: {producto['coeficiente_variacion']:.3f} (media variabilidad)")

    try:
        with NivelObjetivoService(str(DB_PATH)) as service:
            resultado = service.calcular_nivel_objetivo(
                producto['codigo_producto'],
                TIENDA_TEST
            )

        print_success("Nivel objetivo calculado correctamente")
        print_info(f"  Nivel objetivo: {resultado['nivel_objetivo']} unidades")
        print_info(f"  Stock seguridad: {resultado['stock_seguridad']} unidades")
        print_info(f"  Matriz: {resultado['matriz_abc_xyz']}")

        # Validaciones para BY
        assert resultado['matriz_abc_xyz'] == 'BY', "Matriz debe ser BY"
        assert resultado['stock_seguridad'] > 0, "Producto BY debe tener stock de seguridad"

        return True

    except AssertionError as e:
        print_error(f"Validación fallida: {e}")
        return False
    except Exception as e:
        print_error(f"Error al calcular nivel objetivo: {e}")
        return False


def test_5_calcular_nivel_objetivo_cz():
    """Test 5: Calcular nivel objetivo para producto CZ (baja prioridad, muy variable)"""
    print_section("TEST 5: NIVEL OBJETIVO - PRODUCTO CZ")

    producto = obtener_producto_por_matriz('CZ')

    if not producto:
        print_error("No se encontró producto CZ de prueba")
        return False

    print_info(f"Producto: {producto['codigo_producto']} - {producto['nombre_producto']}")
    print_info(f"CV: {producto['coeficiente_variacion']:.3f} (muy variable)")

    try:
        with NivelObjetivoService(str(DB_PATH)) as service:
            resultado = service.calcular_nivel_objetivo(
                producto['codigo_producto'],
                TIENDA_TEST
            )

        print_success("Nivel objetivo calculado correctamente")
        print_info(f"  Nivel objetivo: {resultado['nivel_objetivo']} unidades")
        print_info(f"  Stock seguridad: {resultado['stock_seguridad']} unidades")
        print_info(f"  Demanda ciclo: {resultado['demanda_ciclo']:.2f} unidades")
        print_info(f"  Matriz: {resultado['matriz_abc_xyz']}")

        # Validaciones para CZ (sin stock de seguridad, demanda reducida)
        assert resultado['matriz_abc_xyz'] == 'CZ', "Matriz debe ser CZ"
        assert resultado['stock_seguridad'] == 0, "Producto CZ NO debe tener stock de seguridad"
        assert resultado['parametros_usados']['multiplicador_demanda'] == 0.75, "CZ debe tener demanda reducida (0.75x)"

        return True

    except AssertionError as e:
        print_error(f"Validación fallida: {e}")
        return False
    except Exception as e:
        print_error(f"Error al calcular nivel objetivo: {e}")
        return False


def test_6_calcular_cantidad_sugerida():
    """Test 6: Calcular cantidad sugerida considerando stock e inventario en tránsito"""
    print_section("TEST 6: CANTIDAD SUGERIDA")

    producto = obtener_producto_por_matriz('AX')

    if not producto:
        print_error("No se encontró producto AX de prueba")
        return False

    print_info(f"Producto: {producto['codigo_producto']} - {producto['nombre_producto']}")

    try:
        with NivelObjetivoService(str(DB_PATH)) as service:
            resultado = service.calcular_cantidad_sugerida(
                producto['codigo_producto'],
                TIENDA_TEST
            )

        print_success("Cantidad sugerida calculada correctamente")
        print_info(f"\n  Nivel objetivo: {resultado['nivel_objetivo']} unidades")
        print_info(f"  Stock actual: {resultado['stock_actual']} unidades")
        print_info(f"  En tránsito: {resultado['inventario_en_transito']} unidades")
        print_info(f"  Disponible total: {resultado['disponible_total']} unidades")
        print_info(f"  Déficit: {resultado['deficit']:.2f} unidades")
        print_info(f"  → Cantidad sugerida: {resultado['cantidad_sugerida']} unidades")
        print_info(f"  Requiere reposición: {'Sí' if resultado['requiere_reposicion'] else 'No'}")

        # Validaciones
        assert resultado['disponible_total'] == resultado['stock_actual'] + resultado['inventario_en_transito']
        assert resultado['deficit'] == resultado['nivel_objetivo'] - resultado['disponible_total']

        if resultado['cantidad_sugerida'] > 0:
            assert resultado['requiere_reposicion'] == True
        else:
            assert resultado['requiere_reposicion'] == False

        return True

    except AssertionError as e:
        print_error(f"Validación fallida: {e}")
        return False
    except Exception as e:
        print_error(f"Error al calcular cantidad sugerida: {e}")
        return False


def test_7_comparacion_matrices():
    """Test 7: Comparar niveles objetivo entre diferentes matrices"""
    print_section("TEST 7: COMPARACIÓN ENTRE MATRICES")

    matrices_test = ['AX', 'BY', 'CZ']
    resultados_comparacion = []

    with NivelObjetivoService(str(DB_PATH)) as service:
        for matriz in matrices_test:
            producto = obtener_producto_por_matriz(matriz)

            if not producto:
                print_info(f"No se encontró producto {matriz}, saltando...")
                continue

            try:
                resultado = service.calcular_nivel_objetivo(
                    producto['codigo_producto'],
                    TIENDA_TEST
                )

                resultados_comparacion.append({
                    'matriz': matriz,
                    'producto': producto['codigo_producto'][:20],
                    'demanda_diaria': resultado['metricas_base']['demanda_promedio_diaria'],
                    'cv': resultado['metricas_base']['coeficiente_variacion'],
                    'nivel_objetivo': resultado['nivel_objetivo'],
                    'stock_seguridad': resultado['stock_seguridad'],
                    'z_score': resultado['parametros_usados']['nivel_servicio_z']
                })

            except Exception as e:
                print_info(f"Error en {matriz}: {e}")
                continue

    if len(resultados_comparacion) > 0:
        print_success(f"Comparación completada para {len(resultados_comparacion)} matrices")
        print_info("\nComparación de niveles objetivo:")
        print_info(f"{'Matriz':<8} {'Demanda/día':<13} {'CV':<8} {'Z-score':<10} {'SS':<8} {'Nivel Obj'}")
        print_info("-" * 70)

        for r in resultados_comparacion:
            print_info(
                f"{r['matriz']:<8} "
                f"{r['demanda_diaria']:<13.2f} "
                f"{r['cv']:<8.3f} "
                f"{r['z_score']:<10.2f} "
                f"{r['stock_seguridad']:<8} "
                f"{r['nivel_objetivo']}"
            )

        return True
    else:
        print_error("No se pudieron obtener resultados de comparación")
        return False


# ============================================================================
# FUNCIÓN PRINCIPAL
# ============================================================================

def run_all_tests():
    """Ejecuta todos los tests"""

    print("\n" + "="*70)
    print("TESTS UNITARIOS - SISTEMA DE NIVEL OBJETIVO")
    print("="*70)
    print(f"Base de datos: {DB_PATH}")
    print(f"Tienda de prueba: {TIENDA_TEST} (PERIFERICO)")
    print("="*70)

    resultados = {}

    # Ejecutar tests
    resultados['test_1'] = test_1_conexion_servicio()
    resultados['test_2'] = test_2_obtener_demanda_promedio()
    resultados['test_3'] = test_3_calcular_nivel_objetivo_ax()
    resultados['test_4'] = test_4_calcular_nivel_objetivo_by()
    resultados['test_5'] = test_5_calcular_nivel_objetivo_cz()
    resultados['test_6'] = test_6_calcular_cantidad_sugerida()
    resultados['test_7'] = test_7_comparacion_matrices()

    # Resumen final
    print_section("RESUMEN DE TESTS")

    tests_pasados = sum(1 for v in resultados.values() if v)
    tests_totales = len(resultados)
    porcentaje = (tests_pasados / tests_totales * 100) if tests_totales > 0 else 0

    print_info(f"Tests ejecutados: {tests_totales}")
    print_info(f"Tests exitosos:   {tests_pasados}")
    print_info(f"Tests fallidos:   {tests_totales - tests_pasados}")
    print_info(f"Porcentaje éxito: {porcentaje:.1f}%")

    print("\n" + "="*70)
    if tests_pasados == tests_totales:
        print("✓ TODOS LOS TESTS PASARON - FASE 2 COMPLETADA EXITOSAMENTE")
    else:
        print("⚠ ALGUNOS TESTS FALLARON - REVISAR DETALLES ARRIBA")
    print("="*70 + "\n")

    return tests_pasados == tests_totales


# ============================================================================
# PUNTO DE ENTRADA
# ============================================================================

if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
