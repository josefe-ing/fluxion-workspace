#!/usr/bin/env python3
"""
Script de Migración: tiendas_config.py → Base de Datos

Migra los multiplicadores de stock desde tiendas_config.py
a la tabla config_inventario_tienda
"""

import os
import duckdb
import uuid
from pathlib import Path

# Importar configuración de tiendas
from tiendas_config import TIENDAS_CONFIG


def main():
    """Migra configuración de tiendas a base de datos"""

    # Usar variable de entorno para la ruta de la BD
    db_path = Path(os.getenv('DATABASE_PATH', '/data/fluxion_production.db'))

    if not db_path.exists():
        print(f"❌ Base de datos no encontrada: {db_path}")
        return

    conn = duckdb.connect(str(db_path))

    print("🔄 Migrando configuración de tiendas a base de datos...\n")

    # Verificar si ya hay datos
    count = conn.execute("SELECT COUNT(*) FROM config_inventario_tienda").fetchone()[0]
    if count > 0:
        print(f"⏭️  Tabla ya tiene {count} registros, saltando migración")
        conn.close()
        return

    total_registros = 0

    # Para cada tienda
    for tienda_id, config in TIENDAS_CONFIG.items():
        # Solo procesar tiendas, no CEDIs
        if config.tipo != 'tienda':
            continue

        print(f"📍 {config.ubicacion_nombre} ({tienda_id})")

        # Migrar configuración para SECO (categoría por defecto)
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

        # Configuración base para VERDE (similar a frío)
        configs_verde = [
            (str(uuid.uuid4()), tienda_id, 'verde', 'A', 1.5, 0.5, 3.0, 1),
            (str(uuid.uuid4()), tienda_id, 'verde', 'AB', 1.5, 1.0, 4.0, 1),
            (str(uuid.uuid4()), tienda_id, 'verde', 'B', 2.0, 1.5, 5.0, 1),
            (str(uuid.uuid4()), tienda_id, 'verde', 'BC', 3.0, 2.0, 7.0, 1),
            (str(uuid.uuid4()), tienda_id, 'verde', 'C', 4.0, 2.5, 9.0, 1),
        ]

        # Insertar todos los registros
        for registro in configs_seco + configs_frio + configs_verde:
            conn.execute("""
                INSERT INTO config_inventario_tienda (
                    id, tienda_id, categoria_producto, clasificacion_abc,
                    stock_min_multiplicador, stock_seg_multiplicador,
                    stock_max_multiplicador, lead_time_dias, activo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, true)
            """, registro)
            total_registros += 1

        print(f"   ✅ 15 configuraciones creadas (Seco: 5, Frío: 5, Verde: 5)")

    # Migrar configuración GLOBAL
    print("\n🌍 Migrando configuración global...")

    # Verificar si ya hay datos globales
    count_global = conn.execute("SELECT COUNT(*) FROM config_inventario_global").fetchone()[0]
    if count_global == 0:
        # Umbrales ABC (bultos/día)
        configs_global = [
            (str(uuid.uuid4()), 'abc_umbrales', 'umbral_a_alto', 10.0, None,
             'Venta ≥ 10 bultos/día → Clase A', 'bultos_dia'),
            (str(uuid.uuid4()), 'abc_umbrales', 'umbral_ab_alto', 5.0, None,
             '5 ≤ Venta < 10 bultos/día → Clase AB', 'bultos_dia'),
            (str(uuid.uuid4()), 'abc_umbrales', 'umbral_b_alto', 2.0, None,
             '2 ≤ Venta < 5 bultos/día → Clase B', 'bultos_dia'),
            (str(uuid.uuid4()), 'abc_umbrales', 'umbral_bc_alto', 0.5, None,
             '0.5 ≤ Venta < 2 bultos/día → Clase BC', 'bultos_dia'),
            (str(uuid.uuid4()), 'abc_umbrales', 'umbral_c_bajo', 0.5, None,
             'Venta < 0.5 bultos/día → Clase C', 'bultos_dia'),
        ]

        for registro in configs_global:
            conn.execute("""
                INSERT INTO config_inventario_global (
                    id, categoria, parametro, valor_numerico, valor_texto,
                    descripcion, unidad, activo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, true)
            """, registro)

        print("   ✅ 5 parámetros globales creados")

    conn.commit()
    conn.close()

    print(f"\n✅ Migración completada: {total_registros} registros insertados")


if __name__ == "__main__":
    main()
