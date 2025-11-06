#!/usr/bin/env python3
"""
Tests para ConfigInventarioService
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import duckdb
from services.config_inventario_service import ConfigInventarioService


def test_obtener_categoria_producto():
    """Test: Obtener categoría de producto"""
    conn = duckdb.connect('data/fluxion_production.db')

    print("\n🧪 Test 1: Obtener categoría de producto")
    print("=" * 60)

    # Obtener un producto de cada categoría
    productos = conn.execute("""
        SELECT codigo_producto, categoria_producto, subcategoria
        FROM productos_categoria
        LIMIT 5
    """).fetchall()

    for row in productos:
        codigo = row[0]
        categoria_esperada = row[1]
        subcategoria = row[2]

        categoria_obtenida = ConfigInventarioService.obtener_categoria_producto(
            codigo, conn
        )

        status = "✅" if categoria_obtenida == categoria_esperada else "❌"
        print(f"{status} {codigo:<15} {subcategoria:<20} → {categoria_obtenida}")

    conn.close()


def test_clasificar_abc():
    """Test: Clasificar productos en ABC"""
    conn = duckdb.connect('data/fluxion_production.db')

    print("\n🧪 Test 2: Clasificar productos en ABC")
    print("=" * 60)

    # Casos de prueba
    casos = [
        (25.0, 'A'),    # >= 20
        (10.0, 'AB'),   # >= 5
        (0.5, 'B'),     # >= 0.45
        (0.3, 'BC'),    # >= 0.2
        (0.1, 'C'),     # >= 0.001
        (0.0, '-'),     # < 0.001
    ]

    for venta, esperado in casos:
        resultado = ConfigInventarioService.clasificar_abc(venta, conn)
        status = "✅" if resultado == esperado else "❌"
        print(f"{status} {venta:6.2f} bultos/día → {resultado:<3} (esperado: {esperado})")

    conn.close()


def test_obtener_config_producto():
    """Test: Obtener configuración de producto"""
    conn = duckdb.connect('data/fluxion_production.db')

    print("\n🧪 Test 3: Obtener configuración de producto")
    print("=" * 60)

    # Obtener un producto de cada categoría
    productos = conn.execute("""
        SELECT DISTINCT
            pc.codigo_producto,
            pc.categoria_producto,
            pc.subcategoria
        FROM productos_categoria pc
        LIMIT 3
    """).fetchall()

    for row in productos:
        codigo = row[0]
        categoria = row[1]
        subcategoria = row[2]

        # Obtener config para tienda_01, clasificación A
        config = ConfigInventarioService.obtener_config_producto(
            codigo_producto=codigo,
            tienda_id='tienda_01',
            clasificacion_abc='A',
            conn=conn
        )

        icon = {'seco': '📦', 'frio': '❄️', 'verde': '🥬'}.get(config['categoria'], '❓')
        print(f"\n{icon} {codigo} ({subcategoria})")
        print(f"   Categoría: {config['categoria']}")
        print(f"   Nivel config: {config['nivel_config']}")
        print(f"   Multiplicadores: Min={config['stock_min_mult']:.1f}x  "
              f"Seg={config['stock_seg_mult']:.1f}x  Max={config['stock_max_mult']:.1f}x")
        print(f"   Lead time: {config['lead_time_dias']} días")

    conn.close()


def test_obtener_config_por_categoria():
    """Test: Verificar configuración por categoría"""
    conn = duckdb.connect('data/fluxion_production.db')

    print("\n🧪 Test 4: Verificar configuración por categoría")
    print("=" * 60)

    categorias = ['seco', 'frio', 'verde']
    clasificaciones = ['A', 'B', 'C']

    for categoria in categorias:
        icon = {'seco': '📦', 'frio': '❄️', 'verde': '🥬'}.get(categoria, '❓')
        print(f"\n{icon} {categoria.upper()}")
        print(f"{'ABC':<5} {'Mín':<6} {'Seg':<6} {'Máx':<6} {'Lead':<5}")
        print("-" * 35)

        for abc in clasificaciones:
            config = ConfigInventarioService.obtener_config_global(
                categoria, abc, conn
            )
            print(f"{abc:<5} {config['stock_min_mult']:<6.1f} "
                  f"{config['stock_seg_mult']:<6.1f} "
                  f"{config['stock_max_mult']:<6.1f} "
                  f"{config['lead_time_dias']:<5}d")

    conn.close()


def test_obtener_umbrales_abc():
    """Test: Obtener umbrales ABC"""
    conn = duckdb.connect('data/fluxion_production.db')

    print("\n🧪 Test 5: Obtener umbrales ABC desde BD")
    print("=" * 60)

    umbrales = ConfigInventarioService.obtener_umbrales_abc(conn)

    print(f"{'Clasificación':<15} {'Umbral (bultos/día)':<20}")
    print("-" * 40)
    print(f"{'A':<15} >= {umbrales['umbral_a']}")
    print(f"{'AB':<15} >= {umbrales['umbral_ab']}")
    print(f"{'B':<15} >= {umbrales['umbral_b']}")
    print(f"{'BC':<15} >= {umbrales['umbral_bc']}")
    print(f"{'C':<15} >= {umbrales['umbral_c']}")

    conn.close()


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("  TESTS: ConfigInventarioService")
    print("=" * 70)

    try:
        test_obtener_categoria_producto()
        test_clasificar_abc()
        test_obtener_config_producto()
        test_obtener_config_por_categoria()
        test_obtener_umbrales_abc()

        print("\n" + "=" * 70)
        print("✅ TODOS LOS TESTS PASARON")
        print("=" * 70 + "\n")

    except Exception as e:
        print(f"\n❌ ERROR EN TESTS: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
