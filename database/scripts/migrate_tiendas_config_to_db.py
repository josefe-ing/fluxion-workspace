#!/usr/bin/env python3
"""
Script de Migración: tiendas_config.py → Base de Datos

Migra los multiplicadores de stock desde tiendas_config.py
a la tabla config_inventario_tienda
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

import duckdb
from backend.tiendas_config import TIENDAS_CONFIG
import uuid

def migrar_config_tiendas():
    """Migra configuración de tiendas a base de datos"""

    conn = duckdb.connect('data/fluxion_production.db')

    print("🔄 Migrando configuración de tiendas a base de datos...\n")

    # Limpiar datos existentes
    conn.execute("DELETE FROM config_inventario_tienda")

    total_registros = 0

    # Para cada tienda
    for tienda_id, config in TIENDAS_CONFIG.items():
        # Solo procesar tiendas, no CEDIs
        if config.tipo != 'tienda':
            continue

        print(f"📍 {config.ubicacion_nombre} ({tienda_id})")

        # Migrar configuración para SECO (categoría por defecto)
        # Obtener multiplicadores de la tienda
        configs_seco = [
            # (id, tienda_id, categoria, abc, min, seg, max, lead_time)
            (str(uuid.uuid4()), tienda_id, 'seco', 'A',
             config.stock_min_mult_a, config.stock_seg_mult_a, config.stock_max_mult_a, 3),
            (str(uuid.uuid4()), tienda_id, 'seco', 'AB',
             config.stock_min_mult_ab, config.stock_seg_mult_ab, config.stock_max_mult_ab, 3),
            (str(uuid.uuid4()), tienda_id, 'seco', 'B',
             config.stock_min_mult_b, config.stock_seg_mult_b, config.stock_max_mult_b, 3),
            (str(uuid.uuid4()), tienda_id, 'seco', 'BC',
             config.stock_min_mult_bc, config.stock_seg_mult_bc, config.stock_max_mult_bc, 3),
            (str(uuid.uuid4()), tienda_id, 'seco', 'C',
             config.stock_min_mult_c, config.stock_seg_mult_c, config.stock_max_mult_c, 3),
        ]

        # Configuración base para FRÍO (lead time más corto, stocks más bajos)
        configs_frio = [
            (str(uuid.uuid4()), tienda_id, 'frio', 'A', 1.5, 0.5, 3.0, 1),
            (str(uuid.uuid4()), tienda_id, 'frio', 'AB', 1.5, 1.0, 4.0, 1),
            (str(uuid.uuid4()), tienda_id, 'frio', 'B', 2.0, 1.5, 5.0, 1),
            (str(uuid.uuid4()), tienda_id, 'frio', 'BC', 3.0, 2.0, 7.0, 1),
            (str(uuid.uuid4()), tienda_id, 'frio', 'C', 4.0, 2.5, 9.0, 1),
        ]

        # Configuración base para VERDE (stocks MUY bajos, reposición diaria)
        configs_verde = [
            (str(uuid.uuid4()), tienda_id, 'verde', 'A', 1.0, 0.3, 2.0, 1),
            (str(uuid.uuid4()), tienda_id, 'verde', 'AB', 1.0, 0.5, 2.5, 1),
            (str(uuid.uuid4()), tienda_id, 'verde', 'B', 1.5, 0.8, 3.0, 1),
            (str(uuid.uuid4()), tienda_id, 'verde', 'BC', 2.0, 1.0, 4.0, 1),
            (str(uuid.uuid4()), tienda_id, 'verde', 'C', 2.5, 1.2, 5.0, 1),
        ]

        # Insertar todas las configuraciones
        all_configs = configs_seco + configs_frio + configs_verde

        conn.executemany("""
            INSERT INTO config_inventario_tienda
            (id, tienda_id, categoria_producto, clasificacion_abc,
             stock_min_multiplicador, stock_seg_multiplicador, stock_max_multiplicador,
             lead_time_dias)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, all_configs)

        total_registros += len(all_configs)
        print(f"   ✅ {len(all_configs)} configuraciones creadas")

    conn.commit()

    # Resumen
    print("\n" + "=" * 70)
    print(f"✅ Migración completada: {total_registros} configuraciones creadas")

    # Estadísticas
    stats = conn.execute("""
        SELECT
            categoria_producto,
            COUNT(DISTINCT tienda_id) as tiendas,
            COUNT(*) as configs
        FROM config_inventario_tienda
        GROUP BY categoria_producto
        ORDER BY categoria_producto
    """).fetchall()

    print("\n📊 Resumen por categoría:")
    for row in stats:
        icon = {'seco': '📦', 'frio': '❄️', 'verde': '🥬'}.get(row[0], '❓')
        print(f"   {icon} {row[0].upper():<10}: {row[1]} tiendas × 5 ABC = {row[2]} configs")

    # Mostrar algunas configuraciones de ejemplo
    print("\n📋 Ejemplo de configuraciones (Tienda PERIFERICO):")
    ejemplos = conn.execute("""
        SELECT categoria_producto, clasificacion_abc,
               stock_min_multiplicador, stock_seg_multiplicador, stock_max_multiplicador,
               lead_time_dias
        FROM config_inventario_tienda
        WHERE tienda_id = 'tienda_01'
        ORDER BY
            CASE categoria_producto WHEN 'seco' THEN 1 WHEN 'frio' THEN 2 ELSE 3 END,
            clasificacion_abc
    """).fetchall()

    print(f"\n{'Categoría':<10} {'ABC':<5} {'Mín':<6} {'Seg':<6} {'Máx':<6} {'Lead':<5}")
    print("=" * 50)
    for row in ejemplos[:3]:  # Solo primeras 3
        print(f"{row[0]:<10} {row[1]:<5} {row[2]:<6.1f} {row[3]:<6.1f} {row[4]:<6.1f} {row[5]:<5}d")
    print("   ...")

    conn.close()
    print("\n🎉 ¡Migración exitosa!")

if __name__ == "__main__":
    try:
        migrar_config_tiendas()
    except Exception as e:
        print(f"\n❌ Error durante migración: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
