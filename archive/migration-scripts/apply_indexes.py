#!/usr/bin/env python3
"""
Script para aplicar índices a la base de datos Fluxion con progress tracking
"""
import duckdb
import time
import sys

def format_time(seconds):
    """Formatea segundos a formato legible"""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        mins = seconds / 60
        return f"{mins:.1f}m"
    else:
        hours = seconds / 3600
        return f"{hours:.1f}h"

def main():
    db_path = 'data/fluxion_production.db'

    print("=" * 80)
    print("APLICACIÓN DE ÍNDICES PARA OPTIMIZACIÓN DE PERFORMANCE")
    print("=" * 80)
    print(f"\nBase de datos: {db_path}")
    print(f"Inicio: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")

    try:
        # Conectar en modo read-write
        conn = duckdb.connect(db_path, read_only=False)

        # Definir índices a crear (agrupados por prioridad)
        indexes = [
            # PRIORIDAD MÁXIMA: ventas_raw (81M registros)
            {
                'name': 'idx_ventas_raw_fecha',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_raw_fecha ON ventas_raw(fecha);',
                'description': 'Índice por fecha en ventas_raw',
                'priority': 'CRÍTICO'
            },
            {
                'name': 'idx_ventas_raw_ubicacion',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_raw_ubicacion ON ventas_raw(ubicacion_id);',
                'description': 'Índice por ubicación en ventas_raw',
                'priority': 'CRÍTICO'
            },
            {
                'name': 'idx_ventas_raw_producto',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_raw_producto ON ventas_raw(codigo_producto);',
                'description': 'Índice por producto en ventas_raw',
                'priority': 'CRÍTICO'
            },
            {
                'name': 'idx_ventas_raw_fecha_ubicacion',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_raw_fecha_ubicacion ON ventas_raw(fecha, ubicacion_id);',
                'description': 'Índice compuesto fecha+ubicación en ventas_raw',
                'priority': 'CRÍTICO'
            },
            {
                'name': 'idx_ventas_raw_fecha_producto',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_raw_fecha_producto ON ventas_raw(fecha, codigo_producto);',
                'description': 'Índice compuesto fecha+producto en ventas_raw',
                'priority': 'CRÍTICO'
            },
            {
                'name': 'idx_ventas_raw_categoria',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_raw_categoria ON ventas_raw(categoria_producto);',
                'description': 'Índice por categoría en ventas_raw',
                'priority': 'CRÍTICO'
            },
            {
                'name': 'idx_ventas_raw_turno',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_raw_turno ON ventas_raw(turno);',
                'description': 'Índice por turno en ventas_raw',
                'priority': 'CRÍTICO'
            },
            {
                'name': 'idx_ventas_raw_ejecutivo',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_raw_ejecutivo ON ventas_raw(fecha, ubicacion_id, categoria_producto);',
                'description': 'Índice compuesto ejecutivo en ventas_raw',
                'priority': 'CRÍTICO'
            },

            # PRIORIDAD ALTA: productos
            {
                'name': 'idx_productos_codigo',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo);',
                'description': 'Índice por código en productos',
                'priority': 'ALTA'
            },
            {
                'name': 'idx_productos_codigo_barras',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_productos_codigo_barras ON productos(codigo_barras);',
                'description': 'Índice por código de barras en productos',
                'priority': 'ALTA'
            },
            {
                'name': 'idx_productos_categoria',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria);',
                'description': 'Índice por categoría en productos',
                'priority': 'ALTA'
            },
            {
                'name': 'idx_productos_marca',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_productos_marca ON productos(marca);',
                'description': 'Índice por marca en productos',
                'priority': 'ALTA'
            },
            {
                'name': 'idx_productos_cat_marca',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_productos_cat_marca ON productos(categoria, marca);',
                'description': 'Índice compuesto categoría+marca en productos',
                'priority': 'ALTA'
            },

            # PRIORIDAD ALTA: ubicaciones
            {
                'name': 'idx_ubicaciones_codigo',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ubicaciones_codigo ON ubicaciones(codigo);',
                'description': 'Índice por código en ubicaciones',
                'priority': 'ALTA'
            },
            {
                'name': 'idx_ubicaciones_tipo',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ubicaciones_tipo ON ubicaciones(tipo);',
                'description': 'Índice por tipo en ubicaciones',
                'priority': 'ALTA'
            },
            {
                'name': 'idx_ubicaciones_region',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ubicaciones_region ON ubicaciones(region);',
                'description': 'Índice por región en ubicaciones',
                'priority': 'ALTA'
            },
            {
                'name': 'idx_ubicaciones_activo',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ubicaciones_activo ON ubicaciones(activo);',
                'description': 'Índice por estado activo en ubicaciones',
                'priority': 'ALTA'
            },

            # PRIORIDAD MEDIA: producto_ubicacion_config
            {
                'name': 'idx_prod_ubic_config_producto',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_prod_ubic_config_producto ON producto_ubicacion_config(producto_id);',
                'description': 'Índice por producto en producto_ubicacion_config',
                'priority': 'MEDIA'
            },
            {
                'name': 'idx_prod_ubic_config_ubicacion',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_prod_ubic_config_ubicacion ON producto_ubicacion_config(ubicacion_id);',
                'description': 'Índice por ubicación en producto_ubicacion_config',
                'priority': 'MEDIA'
            },
            {
                'name': 'idx_prod_ubic_config_prod_ubic',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_prod_ubic_config_prod_ubic ON producto_ubicacion_config(producto_id, ubicacion_id);',
                'description': 'Índice compuesto producto+ubicación en producto_ubicacion_config',
                'priority': 'MEDIA'
            },

            # PRIORIDAD MEDIA: productos_ubicacion_completa
            {
                'name': 'idx_prod_ubic_completa_producto',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_prod_ubic_completa_producto ON productos_ubicacion_completa(producto_id);',
                'description': 'Índice por producto en productos_ubicacion_completa',
                'priority': 'MEDIA'
            },
            {
                'name': 'idx_prod_ubic_completa_ubicacion',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_prod_ubic_completa_ubicacion ON productos_ubicacion_completa(ubicacion_id);',
                'description': 'Índice por ubicación en productos_ubicacion_completa',
                'priority': 'MEDIA'
            },
            {
                'name': 'idx_prod_ubic_completa_estado',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_prod_ubic_completa_estado ON productos_ubicacion_completa(estado_stock);',
                'description': 'Índice por estado en productos_ubicacion_completa',
                'priority': 'MEDIA'
            },
            {
                'name': 'idx_prod_ubic_completa_ubic_estado',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_prod_ubic_completa_ubic_estado ON productos_ubicacion_completa(ubicacion_id, estado_stock);',
                'description': 'Índice compuesto ubicación+estado en productos_ubicacion_completa',
                'priority': 'MEDIA'
            },

            # PRIORIDAD BAJA: categorias_config
            {
                'name': 'idx_categorias_config_categoria',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_categorias_config_categoria ON categorias_config(categoria);',
                'description': 'Índice por categoría en categorias_config',
                'priority': 'BAJA'
            },
            {
                'name': 'idx_categorias_config_activo',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_categorias_config_activo ON categorias_config(activo);',
                'description': 'Índice por estado activo en categorias_config',
                'priority': 'BAJA'
            },

            # Para ventas_diarias (cuando tenga datos)
            {
                'name': 'idx_ventas_diarias_fecha',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_diarias_fecha ON ventas_diarias(fecha);',
                'description': 'Índice por fecha en ventas_diarias',
                'priority': 'ALTA'
            },
            {
                'name': 'idx_ventas_diarias_ubicacion',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_diarias_ubicacion ON ventas_diarias(ubicacion_id);',
                'description': 'Índice por ubicación en ventas_diarias',
                'priority': 'ALTA'
            },
            {
                'name': 'idx_ventas_diarias_fecha_ubicacion',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_diarias_fecha_ubicacion ON ventas_diarias(fecha, ubicacion_id);',
                'description': 'Índice compuesto fecha+ubicación en ventas_diarias',
                'priority': 'ALTA'
            },

            # Dashboard test
            {
                'name': 'idx_dashboard_test_tipo',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_dashboard_test_tipo ON dashboard_test(tipo);',
                'description': 'Índice por tipo en dashboard_test',
                'priority': 'BAJA'
            },
        ]

        total_indexes = len(indexes)
        created = 0
        failed = 0
        skipped = 0

        print(f"Total de índices a crear: {total_indexes}\n")
        print("=" * 80)

        start_time = time.time()

        for i, idx in enumerate(indexes, 1):
            idx_start = time.time()

            print(f"\n[{i}/{total_indexes}] {idx['priority']} | {idx['description']}")
            print(f"SQL: {idx['sql'][:80]}...")
            print(f"Creando...", end=" ", flush=True)

            try:
                conn.execute(idx['sql'])
                idx_time = time.time() - idx_start
                print(f"✓ Creado en {format_time(idx_time)}")
                created += 1
            except Exception as e:
                idx_time = time.time() - idx_start
                error_msg = str(e)
                if 'already exists' in error_msg.lower():
                    print(f"⊘ Ya existe ({format_time(idx_time)})")
                    skipped += 1
                else:
                    print(f"✗ Error: {error_msg} ({format_time(idx_time)})")
                    failed += 1

        total_time = time.time() - start_time

        print("\n" + "=" * 80)
        print("RESUMEN FINAL")
        print("=" * 80)
        print(f"Índices creados exitosamente: {created}")
        print(f"Índices que ya existían:      {skipped}")
        print(f"Índices con errores:          {failed}")
        print(f"Total procesados:             {total_indexes}")
        print(f"\nTiempo total: {format_time(total_time)}")
        print(f"Fin: {time.strftime('%Y-%m-%d %H:%M:%S')}")

        conn.close()

        if failed > 0:
            print("\n⚠️  Algunos índices no pudieron crearse. Revisa los errores arriba.")
            sys.exit(1)
        else:
            print("\n✅ Todos los índices fueron procesados correctamente!")
            sys.exit(0)

    except Exception as e:
        print(f"\n❌ Error fatal: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
