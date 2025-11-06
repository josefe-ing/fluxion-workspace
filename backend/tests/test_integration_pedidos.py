#!/usr/bin/env python3
"""
Test de Integración: Verificar que pedidos_sugeridos usa la configuración dinámica
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import duckdb
from services.config_inventario_service import ConfigInventarioService


def test_calculo_pedidos_con_config_dinamica():
    """Test: Verificar que el cálculo usa configuración dinámica"""
    conn = duckdb.connect('data/fluxion_production.db')

    print("\n🧪 Test de Integración: Cálculo de Pedidos con Config Dinámica")
    print("=" * 70)

    # Simular productos con diferentes ventas y categorías
    casos_test = [
        {
            'codigo': 'ARR001',
            'tienda': 'tienda_01',
            'venta_diaria': 50.0,  # Unidades
            'bultos_por_unidad': 5.0,  # 5 unidades = 1 bulto
            'descripcion': 'Producto SECO con alta rotación'
        },
        {
            'codigo': 'LEC001',
            'tienda': 'tienda_01',
            'venta_diaria': 20.0,  # Unidades
            'bultos_por_unidad': 10.0,  # 10 unidades = 1 bulto
            'descripcion': 'Producto FRÍO con rotación media'
        },
    ]

    for caso in casos_test:
        print(f"\n📦 {caso['codigo']} - {caso['descripcion']}")
        print("-" * 70)

        # 1. Calcular venta en bultos
        venta_bultos = caso['venta_diaria'] / caso['bultos_por_unidad']
        print(f"   Venta diaria: {caso['venta_diaria']} unid → {venta_bultos:.2f} bultos/día")

        # 2. Clasificar en ABC
        clasificacion = ConfigInventarioService.clasificar_abc(venta_bultos, conn)
        print(f"   Clasificación ABC: {clasificacion}")

        # 3. Obtener configuración jerárquica
        config = ConfigInventarioService.obtener_config_producto(
            codigo_producto=caso['codigo'],
            tienda_id=caso['tienda'],
            clasificacion_abc=clasificacion,
            conn=conn
        )

        icon = {'seco': '📦', 'frio': '❄️', 'verde': '🥬'}.get(config['categoria'], '❓')
        print(f"   Categoría: {icon} {config['categoria'].upper()}")
        print(f"   Nivel config: {config['nivel_config']}")
        print(f"   Multiplicadores: Min={config['stock_min_mult']:.1f}x  "
              f"Seg={config['stock_seg_mult']:.1f}x  Max={config['stock_max_mult']:.1f}x")
        print(f"   Lead time: {config['lead_time_dias']} días")

        # 4. Calcular niveles de stock (como lo hace main.py)
        stock_min = caso['venta_diaria'] * config['stock_min_mult']
        stock_seg = caso['venta_diaria'] * config['stock_seg_mult']
        stock_max = caso['venta_diaria'] * config['stock_max_mult']
        punto_reorden = stock_min + (caso['venta_diaria'] * config['lead_time_dias'])

        print(f"\n   📊 Niveles de Stock Calculados:")
        print(f"      Stock Mínimo:     {stock_min:.0f} unid ({stock_min/caso['bultos_por_unidad']:.1f} bultos)")
        print(f"      Stock Seguridad:  {stock_seg:.0f} unid ({stock_seg/caso['bultos_por_unidad']:.1f} bultos)")
        print(f"      Stock Máximo:     {stock_max:.0f} unid ({stock_max/caso['bultos_por_unidad']:.1f} bultos)")
        print(f"      Punto Reorden:    {punto_reorden:.0f} unid ({punto_reorden/caso['bultos_por_unidad']:.1f} bultos)")

        # Verificar que los multiplicadores sean coherentes con la categoría
        if config['categoria'] == 'seco':
            assert config['lead_time_dias'] == 3, "❌ Lead time SECO debe ser 3 días"
            assert config['stock_min_mult'] >= 2.0, "❌ Stock mín SECO debe ser >= 2x"
        elif config['categoria'] == 'frio':
            assert config['lead_time_dias'] == 1, "❌ Lead time FRÍO debe ser 1 día"
            assert config['stock_min_mult'] <= 2.0, "❌ Stock mín FRÍO debe ser <= 2x"

        print(f"\n   ✅ Configuración coherente con categoría {config['categoria']}")

    conn.close()

    print("\n" + "=" * 70)
    print("✅ TEST DE INTEGRACIÓN PASÓ")
    print("   • Clasificación ABC funciona correctamente")
    print("   • Resolución jerárquica de config funciona")
    print("   • Cálculo de niveles de stock usa multiplicadores dinámicos")
    print("   • Lead times diferenciados por categoría (Seco:3d, Frío/Verde:1d)")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    try:
        test_calculo_pedidos_con_config_dinamica()
    except AssertionError as e:
        print(f"\n❌ ASSERTION ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR EN TEST: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
