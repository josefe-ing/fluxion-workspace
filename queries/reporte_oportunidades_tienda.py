#!/usr/bin/env python3
"""
Reporte de Oportunidades de Productos por Tienda
=================================================

Este script identifica productos que se venden en otras tiendas pero NO en la tienda
especificada, con información de stock disponible en CEDIs.

Uso:
    python3 reporte_oportunidades_tienda.py --tienda tienda_08
    python3 reporte_oportunidades_tienda.py --tienda tienda_08 --dias 60
    python3 reporte_oportunidades_tienda.py --tienda tienda_08 --min-tiendas 5 --export csv
"""

import argparse
import duckdb
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Ruta a la base de datos
DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"


def generar_reporte(tienda_id: str, dias: int = 90, min_tiendas: int = 3, limit: int = 100, export_format: str = None):
    """
    Genera reporte de oportunidades de productos para una tienda.

    Args:
        tienda_id: ID de la tienda a analizar (ej: 'tienda_08')
        dias: Número de días hacia atrás para analizar (default: 90)
        min_tiendas: Mínimo de tiendas donde debe venderse el producto (default: 3)
        limit: Máximo número de productos a mostrar (default: 100)
        export_format: Formato de exportación ('csv', 'json', 'excel', None)
    """

    if not DB_PATH.exists():
        print(f"❌ Error: Base de datos no encontrada en {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    conn = duckdb.connect(str(DB_PATH), read_only=True)
    fecha_inicio = (datetime.now() - timedelta(days=dias)).strftime('%Y-%m-%d')

    # Verificar que la tienda existe
    tiendas = conn.execute("""
        SELECT DISTINCT ubicacion_id, ubicacion_nombre
        FROM ventas_raw
        WHERE ubicacion_id LIKE 'tienda_%'
        ORDER BY ubicacion_id
    """).fetchall()

    tienda_ids = [t[0] for t in tiendas]

    if tienda_id not in tienda_ids:
        print(f"❌ Error: Tienda '{tienda_id}' no encontrada.", file=sys.stderr)
        print(f"\nTiendas disponibles:")
        for tid, tnombre in tiendas:
            print(f"  • {tid}: {tnombre}")
        sys.exit(1)

    # Obtener nombre de la tienda
    tienda_nombre = next((t[1] for t in tiendas if t[0] == tienda_id), tienda_id)

    query = f"""
    WITH ventas_otras_tiendas AS (
        SELECT
            codigo_producto,
            descripcion_producto,
            categoria_producto,
            grupo_producto,
            marca_producto,
            COUNT(DISTINCT ubicacion_id) as num_tiendas_venta,
            COUNT(DISTINCT numero_factura) as num_transacciones,
            SUM(CAST(cantidad_vendida AS DOUBLE)) as cantidad_total_vendida,
            AVG(CAST(cantidad_vendida AS DOUBLE)) as promedio_unidades_transaccion,
            SUM(CAST(venta_total AS DOUBLE)) as venta_total_bs,
            AVG(CAST(precio_unitario AS DOUBLE)) as precio_promedio
        FROM ventas_raw
        WHERE ubicacion_id != '{tienda_id}'
            AND fecha >= '{fecha_inicio}'
        GROUP BY
            codigo_producto,
            descripcion_producto,
            categoria_producto,
            grupo_producto,
            marca_producto
    ),
    productos_tienda_objetivo AS (
        SELECT DISTINCT codigo_producto
        FROM ventas_raw
        WHERE ubicacion_id = '{tienda_id}'
            AND fecha >= '{fecha_inicio}'
    ),
    productos_oportunidad AS (
        SELECT v.*
        FROM ventas_otras_tiendas v
        LEFT JOIN productos_tienda_objetivo t ON v.codigo_producto = t.codigo_producto
        WHERE t.codigo_producto IS NULL
            AND v.num_tiendas_venta >= {min_tiendas}
    ),
    stock_info AS (
        SELECT
            producto_id,
            SUM(CASE WHEN ubicacion_id LIKE 'cedi%' THEN cantidad ELSE 0 END) as stock_cedis,
            MAX(CASE WHEN ubicacion_id LIKE 'cedi%' THEN ubicacion_id ELSE NULL END) as cedi_disponible
        FROM stock_actual
        WHERE cantidad > 0
        GROUP BY producto_id
    )
    SELECT
        p.codigo_producto,
        p.descripcion_producto,
        p.categoria_producto,
        p.grupo_producto,
        p.marca_producto,
        p.num_tiendas_venta,
        CAST(p.cantidad_total_vendida AS INTEGER) as total_unidades_vendidas,
        CAST(p.num_transacciones AS INTEGER) as num_transacciones,
        CAST(p.promedio_unidades_transaccion AS DECIMAL(10,2)) as prom_unid_transaccion,
        CAST(p.venta_total_bs AS INTEGER) as venta_total_bs,
        CAST(p.precio_promedio AS DECIMAL(10,2)) as precio_promedio,
        COALESCE(CAST(s.stock_cedis AS INTEGER), 0) as stock_cedi,
        CASE
            WHEN s.stock_cedis > 0 THEN 'HAY STOCK'
            ELSE 'SIN STOCK'
        END as disponibilidad_cedi
    FROM productos_oportunidad p
    LEFT JOIN stock_info s ON p.codigo_producto = s.producto_id
    ORDER BY
        CASE WHEN s.stock_cedis > 0 THEN 0 ELSE 1 END,
        p.num_tiendas_venta DESC,
        p.venta_total_bs DESC
    LIMIT {limit};
    """

    try:
        result = conn.execute(query).fetchdf()

        if len(result) == 0:
            print(f"\n✅ ¡Excelente! La tienda {tienda_id} ({tienda_nombre}) ya vende todos los")
            print(f"   productos populares de la red o no hay oportunidades evidentes.")
            print(f"\n   Período analizado: {dias} días")
            print(f"   Criterio: Productos vendidos en al menos {min_tiendas} tiendas")
            conn.close()
            return

        # Imprimir reporte en consola
        print('\n' + '='*140)
        print(f'ANÁLISIS DE OPORTUNIDADES PARA {tienda_id.upper()} ({tienda_nombre.upper()})')
        print(f'Productos que se venden bien en otras tiendas pero NO se venden aquí')
        print('='*140 + '\n')

        # Formatear para mejor visualización
        pd_options = {
            'display.max_rows': None,
            'display.max_columns': None,
            'display.width': 140,
            'display.max_colwidth': 40
        }

        import pandas as pd
        for key, value in pd_options.items():
            pd.set_option(key, value)

        print(result.to_string(index=False))

        # Resumen
        productos_con_stock = len(result[result['stock_cedi'] > 0])
        productos_sin_stock = len(result[result['stock_cedi'] == 0])
        venta_total = result['venta_total_bs'].sum()

        print('\n' + '='*140)
        print(f'\n📊 RESUMEN:')
        print(f'  • Total de productos oportunidad: {len(result)}')
        print(f'  • Productos con stock en CEDI: {productos_con_stock} (✓ Envío inmediato)')
        print(f'  • Productos sin stock en CEDI: {productos_sin_stock} (⚠️ Requiere reposición)')
        print(f'  • Venta total potencial: {venta_total:,.0f} Bs')
        print(f'  • Período analizado: Últimos {dias} días (desde {fecha_inicio})')
        print(f'  • Criterio: Vendido en al menos {min_tiendas} tiendas')

        print(f'\n💡 RECOMENDACIÓN:')
        print(f'  1. Productos con stock: Crear pedido de transferencia desde CEDI')
        print(f'  2. Productos sin stock: Evaluar orden de compra a proveedores')
        print(f'  3. Priorizar por num_tiendas_venta (mayor presencia = menor riesgo)')

        print('\n' + '='*140 + '\n')

        # Exportar si se especificó formato
        if export_format:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"oportunidades_{tienda_id}_{timestamp}"

            if export_format == 'csv':
                filepath = Path(f"{filename}.csv")
                result.to_csv(filepath, index=False)
                print(f"✅ Reporte exportado a: {filepath.absolute()}")

            elif export_format == 'json':
                filepath = Path(f"{filename}.json")
                result.to_json(filepath, orient='records', indent=2)
                print(f"✅ Reporte exportado a: {filepath.absolute()}")

            elif export_format == 'excel':
                filepath = Path(f"{filename}.xlsx")
                result.to_excel(filepath, index=False, sheet_name='Oportunidades')
                print(f"✅ Reporte exportado a: {filepath.absolute()}")

    except Exception as e:
        print(f"❌ Error ejecutando query: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(
        description='Genera reporte de oportunidades de productos para una tienda',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  # Reporte básico para tienda_08
  python3 reporte_oportunidades_tienda.py --tienda tienda_08

  # Análisis de últimos 60 días con mínimo 5 tiendas
  python3 reporte_oportunidades_tienda.py --tienda tienda_08 --dias 60 --min-tiendas 5

  # Exportar a CSV
  python3 reporte_oportunidades_tienda.py --tienda tienda_08 --export csv

  # Análisis completo (200 productos)
  python3 reporte_oportunidades_tienda.py --tienda tienda_08 --limit 200
        """
    )

    parser.add_argument(
        '--tienda',
        type=str,
        required=True,
        help='ID de la tienda a analizar (ej: tienda_08)'
    )

    parser.add_argument(
        '--dias',
        type=int,
        default=90,
        help='Número de días hacia atrás para analizar (default: 90)'
    )

    parser.add_argument(
        '--min-tiendas',
        type=int,
        default=3,
        help='Mínimo de tiendas donde debe venderse el producto (default: 3)'
    )

    parser.add_argument(
        '--limit',
        type=int,
        default=100,
        help='Máximo número de productos a mostrar (default: 100)'
    )

    parser.add_argument(
        '--export',
        type=str,
        choices=['csv', 'json', 'excel'],
        help='Exportar reporte a archivo (csv, json, excel)'
    )

    args = parser.parse_args()

    generar_reporte(
        tienda_id=args.tienda,
        dias=args.dias,
        min_tiendas=args.min_tiendas,
        limit=args.limit,
        export_format=args.export
    )


if __name__ == '__main__':
    main()
