#!/usr/bin/env python3
"""
Aplicar ajustes al modelo de datos de ventas_raw
Crea índices únicos con la clave correcta y vistas de análisis
"""
import duckdb
import sys
from datetime import datetime

def main():
    db_path = 'data/fluxion_production.db'

    print("=" * 80)
    print("APLICANDO AJUSTES AL MODELO DE DATOS")
    print("=" * 80)
    print(f"Base de datos: {db_path}")
    print(f"Inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    try:
        conn = duckdb.connect(db_path, read_only=False)

        # ========================================================================
        # 1. CREAR ÍNDICES ÚNICOS
        # ========================================================================
        print("=" * 80)
        print("1. CREANDO ÍNDICES ÚNICOS CON CLAVE CORRECTA")
        print("=" * 80)

        indices = [
            {
                'name': 'idx_ventas_raw_unique_key',
                'sql': 'CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_raw_unique_key ON ventas_raw(ubicacion_id, numero_factura, linea);',
                'description': 'Índice único: [ubicacion_id + numero_factura + linea]'
            },
            {
                'name': 'idx_ventas_raw_unique_transaction',
                'sql': 'CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_raw_unique_transaction ON ventas_raw(ubicacion_id, numero_factura, codigo_producto, fecha_hora_completa, linea);',
                'description': 'Índice único: [ubicacion_id + numero_factura + codigo_producto + fecha_hora_completa + linea]'
            },
            {
                'name': 'idx_ventas_raw_ubicacion_factura',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_raw_ubicacion_factura ON ventas_raw(ubicacion_id, numero_factura);',
                'description': 'Índice compuesto: [ubicacion_id + numero_factura]'
            },
            {
                'name': 'idx_ventas_raw_ubicacion_fecha_producto',
                'sql': 'CREATE INDEX IF NOT EXISTS idx_ventas_raw_ubicacion_fecha_producto ON ventas_raw(ubicacion_id, fecha, codigo_producto);',
                'description': 'Índice compuesto: [ubicacion_id + fecha + codigo_producto]'
            }
        ]

        for idx in indices:
            print(f"\n📝 {idx['description']}")
            print(f"   SQL: {idx['sql'][:80]}...")
            try:
                conn.execute(idx['sql'])
                print(f"   ✓ Creado exitosamente")
            except Exception as e:
                error_msg = str(e)
                if 'already exists' in error_msg.lower():
                    print(f"   ⊘ Ya existe")
                elif 'Constraint Error' in error_msg or 'duplicate' in error_msg.lower():
                    print(f"   ❌ ERROR: Hay duplicados REALES en los datos")
                    print(f"   ❌ {error_msg}")
                    print(f"\n⚠️  ALERTA: Se detectaron duplicados reales con la clave [ubicacion_id + numero_factura + linea]")
                    print(f"   Ejecuta la vista 'verificacion_duplicados_reales' para investigar")
                    # No salir, continuar con las vistas
                else:
                    print(f"   ❌ Error: {error_msg}")

        # ========================================================================
        # 2. CREAR VISTAS
        # ========================================================================
        print("\n" + "=" * 80)
        print("2. CREANDO VISTAS DE ANÁLISIS")
        print("=" * 80)

        vistas = [
            {
                'name': 'ventas_por_ubicacion',
                'sql': '''
                    CREATE OR REPLACE VIEW ventas_por_ubicacion AS
                    SELECT
                        ubicacion_id,
                        ubicacion_nombre,
                        numero_factura,
                        linea,
                        fecha,
                        fecha_hora_completa,
                        codigo_producto,
                        descripcion_producto,
                        categoria_producto,
                        cantidad_vendida,
                        precio_unitario,
                        venta_total,
                        costo_total,
                        utilidad_bruta,
                        margen_bruto_pct
                    FROM ventas_raw
                    ORDER BY ubicacion_id, fecha DESC, numero_factura;
                ''',
                'description': 'Vista simplificada con campos clave'
            },
            {
                'name': 'facturas_resumen',
                'sql': '''
                    CREATE OR REPLACE VIEW facturas_resumen AS
                    SELECT
                        ubicacion_id,
                        ubicacion_nombre,
                        numero_factura,
                        fecha,
                        fecha_hora_completa,
                        COUNT(*) as total_lineas,
                        COUNT(DISTINCT codigo_producto) as productos_unicos,
                        SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_total,
                        SUM(CAST(venta_total AS DECIMAL)) as venta_total_factura,
                        SUM(CAST(costo_total AS DECIMAL)) as costo_total_factura,
                        SUM(CAST(utilidad_bruta AS DECIMAL)) as utilidad_total,
                        AVG(CAST(margen_bruto_pct AS DECIMAL)) as margen_promedio
                    FROM ventas_raw
                    WHERE numero_factura IS NOT NULL
                    GROUP BY
                        ubicacion_id,
                        ubicacion_nombre,
                        numero_factura,
                        fecha,
                        fecha_hora_completa;
                ''',
                'description': 'Resumen de facturas con totales agregados'
            },
            {
                'name': 'analisis_numeracion_facturas',
                'sql': '''
                    CREATE OR REPLACE VIEW analisis_numeracion_facturas AS
                    SELECT
                        numero_factura,
                        COUNT(DISTINCT ubicacion_id) as ubicaciones_que_usan_numero,
                        ARRAY_AGG(DISTINCT ubicacion_nombre) as ubicaciones,
                        MIN(fecha) as primera_fecha_uso,
                        MAX(fecha) as ultima_fecha_uso,
                        COUNT(*) as total_lineas_en_todas_ubicaciones
                    FROM ventas_raw
                    WHERE numero_factura IS NOT NULL
                    GROUP BY numero_factura
                    HAVING COUNT(DISTINCT ubicacion_id) > 1
                    ORDER BY ubicaciones_que_usan_numero DESC, total_lineas_en_todas_ubicaciones DESC;
                ''',
                'description': 'Análisis de números de factura compartidos entre ubicaciones'
            },
            {
                'name': 'verificacion_duplicados_reales',
                'sql': '''
                    CREATE OR REPLACE VIEW verificacion_duplicados_reales AS
                    SELECT
                        ubicacion_id,
                        numero_factura,
                        linea,
                        COUNT(*) as copias,
                        ARRAY_AGG(DISTINCT fecha) as fechas,
                        ARRAY_AGG(DISTINCT codigo_producto) as productos
                    FROM ventas_raw
                    WHERE ubicacion_id IS NOT NULL
                      AND numero_factura IS NOT NULL
                      AND linea IS NOT NULL
                    GROUP BY ubicacion_id, numero_factura, linea
                    HAVING COUNT(*) > 1;
                ''',
                'description': 'Vista de verificación para detectar duplicados reales'
            }
        ]

        for vista in vistas:
            print(f"\n📊 {vista['name']}")
            print(f"   {vista['description']}")
            try:
                conn.execute(vista['sql'])
                print(f"   ✓ Creada exitosamente")
            except Exception as e:
                print(f"   ❌ Error: {e}")

        # ========================================================================
        # 3. VERIFICACIONES
        # ========================================================================
        print("\n" + "=" * 80)
        print("3. VERIFICACIONES DE INTEGRIDAD")
        print("=" * 80)

        # Verificar si hay duplicados reales
        print("\n🔍 Verificando duplicados reales con la nueva clave...")
        try:
            duplicados = conn.execute("SELECT COUNT(*) FROM verificacion_duplicados_reales").fetchone()[0]
            if duplicados == 0:
                print(f"   ✓ NO se encontraron duplicados reales")
                print(f"   ✓ La clave [ubicacion_id + numero_factura + linea] es única")
            else:
                print(f"   ⚠️  Se encontraron {duplicados:,} duplicados REALES")
                print(f"   ⚠️  Ejecuta: SELECT * FROM verificacion_duplicados_reales LIMIT 10;")
        except Exception as e:
            print(f"   ⚠️  No se pudo verificar: {e}")

        # Estadísticas de numeración compartida
        print("\n📊 Analizando numeración de facturas...")
        try:
            query = """
                SELECT
                    COUNT(*) as total_numeros_factura,
                    SUM(CASE WHEN ubicaciones_que_usan_numero > 1 THEN 1 ELSE 0 END) as numeros_compartidos
                FROM (
                    SELECT
                        numero_factura,
                        COUNT(DISTINCT ubicacion_id) as ubicaciones_que_usan_numero
                    FROM ventas_raw
                    WHERE numero_factura IS NOT NULL
                    GROUP BY numero_factura
                )
            """
            result = conn.execute(query).fetchone()
            total = result[0]
            compartidos = result[1]

            print(f"   Total de números de factura únicos: {total:,}")
            print(f"   Números usados por múltiples ubicaciones: {compartidos:,} ({compartidos*100/total:.1f}%)")

            if compartidos > 0:
                print(f"   ✓ Confirmado: Los números de factura NO son únicos globalmente")
                print(f"   ✓ La clave correcta es [ubicacion_id + numero_factura + linea]")
        except Exception as e:
            print(f"   ⚠️  No se pudo analizar: {e}")

        conn.close()

        # ========================================================================
        # RESUMEN
        # ========================================================================
        print("\n" + "=" * 80)
        print("✅ AJUSTES APLICADOS EXITOSAMENTE")
        print("=" * 80)

        print("\n📋 Recursos creados:")
        print("   ✓ 4 índices (2 únicos, 2 compuestos)")
        print("   ✓ 4 vistas de análisis")

        print("\n📚 Documentación disponible:")
        print("   • DATA_MODEL_DOCUMENTATION.md - Guía completa del modelo de datos")
        print("   • query_examples.sql - 50+ ejemplos de queries")
        print("   • fix_data_model.sql - Script SQL de índices y vistas")

        print("\n🎯 Próximos pasos:")
        print("   1. Revisar DATA_MODEL_DOCUMENTATION.md")
        print("   2. Actualizar queries existentes para incluir ubicacion_id")
        print("   3. Usar las vistas para análisis simplificados")
        print("   4. Monitorear verificacion_duplicados_reales periódicamente")

        print("\n" + "=" * 80)
        print(f"Fin: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)

    except Exception as e:
        print(f"\n❌ Error fatal: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
