#!/usr/bin/env python3
"""
Script de pruebas de performance para Fluxion DB
Mide tiempos de ejecución de queries comunes después de aplicar índices
"""
import duckdb
import time
import sys
from datetime import datetime

def format_time(seconds):
    """Formatea segundos a formato legible"""
    if seconds < 0.001:
        return f"{seconds * 1000000:.0f}µs"
    elif seconds < 1:
        return f"{seconds * 1000:.1f}ms"
    elif seconds < 60:
        return f"{seconds:.2f}s"
    else:
        mins = seconds / 60
        return f"{mins:.1f}m"

def run_query(conn, name, query, description):
    """Ejecuta una query y mide su tiempo"""
    print(f"\n📊 {name}")
    print(f"   Descripción: {description}")
    print(f"   Query: {query[:100]}...")

    try:
        start = time.time()
        result = conn.execute(query).fetchall()
        elapsed = time.time() - start

        row_count = len(result)
        rows_per_sec = row_count / elapsed if elapsed > 0 else 0

        print(f"   ✓ Tiempo: {format_time(elapsed)}")
        print(f"   ✓ Registros: {row_count:,}")
        if row_count > 0 and elapsed > 0:
            print(f"   ✓ Throughput: {rows_per_sec:,.0f} registros/segundo")

        # Mostrar algunos resultados de ejemplo
        if row_count > 0 and row_count <= 10:
            print(f"   ✓ Resultados:")
            for row in result[:5]:
                print(f"      {row}")

        return {
            'name': name,
            'description': description,
            'time_seconds': elapsed,
            'row_count': row_count,
            'success': True
        }
    except Exception as e:
        elapsed = time.time() - start
        print(f"   ✗ Error: {e}")
        print(f"   ✗ Tiempo hasta error: {format_time(elapsed)}")
        return {
            'name': name,
            'description': description,
            'time_seconds': elapsed,
            'row_count': 0,
            'success': False,
            'error': str(e)
        }

def main():
    db_path = 'data/fluxion_production.db'

    print("=" * 80)
    print("PRUEBAS DE PERFORMANCE - FLUXION DB")
    print("=" * 80)
    print(f"Base de datos: {db_path}")
    print(f"Inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    try:
        conn = duckdb.connect(db_path, read_only=True)

        results = []

        print("\n" + "=" * 80)
        print("🔥 PRUEBAS CRÍTICAS: VENTAS_RAW (81M registros)")
        print("=" * 80)

        # Test 1: Count total
        results.append(run_query(
            conn,
            "Test 1: COUNT total",
            "SELECT COUNT(*) FROM ventas_raw",
            "Conteo total de registros"
        ))

        # Test 2: Filtro por fecha específica
        results.append(run_query(
            conn,
            "Test 2: Filtro por fecha",
            "SELECT COUNT(*) FROM ventas_raw WHERE fecha = '2024-01-15'",
            "Ventas en una fecha específica (índice: idx_ventas_raw_fecha)"
        ))

        # Test 3: Rango de fechas
        results.append(run_query(
            conn,
            "Test 3: Rango de fechas",
            "SELECT COUNT(*), SUM(CAST(venta_total AS DECIMAL)) FROM ventas_raw WHERE fecha BETWEEN '2024-01-01' AND '2024-01-31'",
            "Ventas en enero 2024 (índice: idx_ventas_raw_fecha)"
        ))

        # Test 4: Filtro por ubicación
        results.append(run_query(
            conn,
            "Test 4: Filtro por ubicación",
            "SELECT COUNT(*) FROM ventas_raw WHERE ubicacion_id = 'UB001' LIMIT 1000",
            "Ventas de una ubicación específica (índice: idx_ventas_raw_ubicacion)"
        ))

        # Test 5: Filtro por producto
        results.append(run_query(
            conn,
            "Test 5: Filtro por producto",
            "SELECT COUNT(*), SUM(CAST(cantidad_vendida AS DECIMAL)) FROM ventas_raw WHERE codigo_producto = 'PROD001'",
            "Ventas de un producto específico (índice: idx_ventas_raw_producto)"
        ))

        # Test 6: Índice compuesto fecha+ubicación
        results.append(run_query(
            conn,
            "Test 6: Fecha + Ubicación",
            "SELECT COUNT(*), SUM(CAST(venta_total AS DECIMAL)) FROM ventas_raw WHERE fecha = '2024-01-15' AND ubicacion_id = 'UB001'",
            "Ventas por fecha y ubicación (índice: idx_ventas_raw_fecha_ubicacion)"
        ))

        # Test 7: Agregación por categoría
        results.append(run_query(
            conn,
            "Test 7: Top 10 categorías",
            "SELECT categoria_producto, COUNT(*) as ventas FROM ventas_raw WHERE categoria_producto IS NOT NULL GROUP BY categoria_producto ORDER BY ventas DESC LIMIT 10",
            "Top 10 categorías más vendidas (índice: idx_ventas_raw_categoria)"
        ))

        # Test 8: Análisis por turno
        results.append(run_query(
            conn,
            "Test 8: Ventas por turno",
            "SELECT turno, COUNT(*) as transacciones FROM ventas_raw WHERE turno IS NOT NULL GROUP BY turno ORDER BY turno",
            "Distribución de ventas por turno (índice: idx_ventas_raw_turno)"
        ))

        # Test 9: Dashboard ejecutivo (índice compuesto)
        results.append(run_query(
            conn,
            "Test 9: Dashboard ejecutivo",
            """SELECT
                fecha,
                ubicacion_id,
                categoria_producto,
                COUNT(*) as transacciones,
                SUM(CAST(venta_total AS DECIMAL)) as venta_total
            FROM ventas_raw
            WHERE fecha BETWEEN '2024-01-01' AND '2024-01-07'
                AND ubicacion_id IN ('UB001', 'UB002')
            GROUP BY fecha, ubicacion_id, categoria_producto
            ORDER BY fecha, venta_total DESC
            LIMIT 20""",
            "Query típica de dashboard ejecutivo (índice: idx_ventas_raw_ejecutivo)"
        ))

        # Test 10: Productos más vendidos
        results.append(run_query(
            conn,
            "Test 10: Top 20 productos",
            """SELECT
                codigo_producto,
                descripcion_producto,
                COUNT(*) as num_transacciones,
                SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_total
            FROM ventas_raw
            WHERE fecha BETWEEN '2024-01-01' AND '2024-01-31'
            GROUP BY codigo_producto, descripcion_producto
            ORDER BY cantidad_total DESC
            LIMIT 20""",
            "Top 20 productos más vendidos en enero (índice: idx_ventas_raw_fecha_producto)"
        ))

        print("\n" + "=" * 80)
        print("📦 PRUEBAS: PRODUCTOS (15 registros)")
        print("=" * 80)

        # Test 11: Búsqueda por código
        results.append(run_query(
            conn,
            "Test 11: Búsqueda por código",
            "SELECT * FROM productos WHERE codigo = 'PROD001'",
            "Búsqueda de producto por código (índice: idx_productos_codigo)"
        ))

        # Test 12: Filtro por categoría
        results.append(run_query(
            conn,
            "Test 12: Productos por categoría",
            "SELECT * FROM productos WHERE categoria = 'Alimentos'",
            "Productos de una categoría (índice: idx_productos_categoria)"
        ))

        # Test 13: Filtro por marca
        results.append(run_query(
            conn,
            "Test 13: Productos por marca",
            "SELECT * FROM productos WHERE marca = 'Polar'",
            "Productos de una marca (índice: idx_productos_marca)"
        ))

        print("\n" + "=" * 80)
        print("📍 PRUEBAS: UBICACIONES (20 registros)")
        print("=" * 80)

        # Test 14: Búsqueda por código
        results.append(run_query(
            conn,
            "Test 14: Búsqueda ubicación",
            "SELECT * FROM ubicaciones WHERE codigo = 'UB001'",
            "Búsqueda de ubicación por código (índice: idx_ubicaciones_codigo)"
        ))

        # Test 15: Filtro por tipo
        results.append(run_query(
            conn,
            "Test 15: Ubicaciones por tipo",
            "SELECT * FROM ubicaciones WHERE tipo = 'tienda'",
            "Ubicaciones de un tipo (índice: idx_ubicaciones_tipo)"
        ))

        print("\n" + "=" * 80)
        print("⚙️  PRUEBAS: INVENTARIO_RAW (49,891 registros)")
        print("=" * 80)

        # Test 16: Productos con stock bajo
        results.append(run_query(
            conn,
            "Test 16: Stock bajo",
            "SELECT COUNT(*) FROM inventario_raw WHERE estado_stock = 'bajo'",
            "Productos con stock bajo"
        ))

        # Test 17: Inventario por ubicación
        results.append(run_query(
            conn,
            "Test 17: Inventario por ubicación",
            "SELECT ubicacion_id, COUNT(*) as productos FROM inventario_raw GROUP BY ubicacion_id",
            "Conteo de productos por ubicación (índice: idx_inventario_raw_ubicacion)"
        ))

        # Test 18: Valor total de inventario
        results.append(run_query(
            conn,
            "Test 18: Valor inventario",
            "SELECT SUM(valor_inventario_actual) as valor_total FROM inventario_raw",
            "Valor total del inventario"
        ))

        print("\n" + "=" * 80)
        print("📈 ANÁLISIS AVANZADO")
        print("=" * 80)

        # Test 19: JOIN productos + inventario
        results.append(run_query(
            conn,
            "Test 19: JOIN productos-inventario",
            """SELECT
                p.codigo,
                p.descripcion,
                COUNT(DISTINCT i.ubicacion_id) as ubicaciones,
                SUM(i.cantidad_actual) as stock_total
            FROM productos p
            LEFT JOIN inventario_raw i ON p.codigo = i.codigo_producto
            GROUP BY p.codigo, p.descripcion
            LIMIT 10""",
            "Stock total por producto en todas las ubicaciones"
        ))

        # Test 20: Análisis de ventas por producto y ubicación
        results.append(run_query(
            conn,
            "Test 20: Ventas detalladas",
            """SELECT
                ubicacion_id,
                codigo_producto,
                COUNT(*) as transacciones,
                SUM(CAST(venta_total AS DECIMAL)) as venta_total
            FROM ventas_raw
            WHERE fecha BETWEEN '2024-01-01' AND '2024-01-31'
            GROUP BY ubicacion_id, codigo_producto
            ORDER BY venta_total DESC
            LIMIT 30""",
            "Análisis de ventas por producto y ubicación (usa múltiples índices)"
        ))

        conn.close()

        # RESUMEN FINAL
        print("\n" + "=" * 80)
        print("📊 RESUMEN DE PERFORMANCE")
        print("=" * 80)

        successful = [r for r in results if r['success']]
        failed = [r for r in results if not r['success']]

        print(f"\nTotal de pruebas: {len(results)}")
        print(f"Exitosas: {len(successful)}")
        print(f"Fallidas: {len(failed)}")

        if successful:
            total_time = sum(r['time_seconds'] for r in successful)
            avg_time = total_time / len(successful)
            fastest = min(successful, key=lambda x: x['time_seconds'])
            slowest = max(successful, key=lambda x: x['time_seconds'])

            print(f"\nTiempo total: {format_time(total_time)}")
            print(f"Tiempo promedio: {format_time(avg_time)}")
            print(f"\nMás rápida: {fastest['name']} - {format_time(fastest['time_seconds'])}")
            print(f"Más lenta: {slowest['name']} - {format_time(slowest['time_seconds'])}")

            # Top 5 más lentas
            print("\n🐌 Top 5 queries más lentas:")
            sorted_results = sorted(successful, key=lambda x: x['time_seconds'], reverse=True)[:5]
            for i, r in enumerate(sorted_results, 1):
                print(f"{i}. {r['name']}: {format_time(r['time_seconds'])} - {r['description']}")

            # Top 5 más rápidas
            print("\n⚡ Top 5 queries más rápidas:")
            sorted_results = sorted(successful, key=lambda x: x['time_seconds'])[:5]
            for i, r in enumerate(sorted_results, 1):
                print(f"{i}. {r['name']}: {format_time(r['time_seconds'])} - {r['description']}")

        if failed:
            print("\n❌ Queries fallidas:")
            for r in failed:
                print(f"  - {r['name']}: {r.get('error', 'Unknown error')}")

        print("\n" + "=" * 80)
        print(f"Fin: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)

        if failed:
            sys.exit(1)
        else:
            print("\n✅ Todas las pruebas completadas exitosamente!")
            sys.exit(0)

    except Exception as e:
        print(f"\n❌ Error fatal: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
