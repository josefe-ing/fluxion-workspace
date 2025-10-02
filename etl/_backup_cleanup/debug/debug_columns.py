#!/usr/bin/env python3
"""
Script para debuggear exactamente qué columnas genera el transformer
"""

import pandas as pd
from transformer import InventoryTransformer
from extractor import SQLServerExtractor
from config import ETLConfig

def debug_columns():
    print("🐛 DEBUG: Columnas del transformer")
    print("=" * 50)

    # Simular datos como los que llegan del extractor
    mock_data = {
        'tienda_01': pd.DataFrame({
            'nombreProducto': ['Producto Test'],
            'Codigo': ['12345'],
            'c_Codigo': ['789123456789'],
            'categoria': ['ALIMENTOS'],
            'descripcion': ['Categoria Desc'],
            'subcategoria': ['SUB001'],
            'descripcion_subcategoria': ['Sub Desc'],
            'marca': ['MARCA_TEST'],
            'n_Peso': [1.5],
            'n_Volumen': [0.5],
            'precio': [10.50],
            'iva': [16.0],
            'stock': [25.0],
            'ubicacion_id': ['tienda_01'],
            'ubicacion_nombre': ['El Bosque'],
            'tipo_ubicacion': ['tienda'],
            'fecha_extraccion': [pd.Timestamp.now()],
            'server_ip': ['192.168.150.10']
        })
    }

    # Instanciar transformer
    transformer = InventoryTransformer()

    # Transformar datos
    result = transformer.transform_inventory_data(mock_data)

    print(f"📊 Columnas generadas: {len(result.columns)}")
    print(f"📋 Lista de columnas:")

    for i, col in enumerate(sorted(result.columns), 1):
        print(f"   {i:2d}. {col}")

    print(f"\n🎯 Necesitamos: 37 columnas")
    print(f"🔢 Tenemos: {len(result.columns)} columnas")
    print(f"📉 Diferencia: {37 - len(result.columns)} columnas")

    if len(result.columns) != 37:
        print(f"\n❌ ERROR: Número incorrecto de columnas")

        # Comparar con esquema esperado
        expected_cols = [
            'id', 'ubicacion_id', 'ubicacion_nombre', 'tipo_ubicacion', 'codigo_producto',
            'codigo_barras', 'descripcion_producto', 'categoria', 'subcategoria', 'marca',
            'presentacion', 'cantidad_actual', 'cantidad_disponible', 'cantidad_reservada',
            'cantidad_en_transito', 'costo_unitario_actual', 'precio_venta_actual',
            'valor_inventario_actual', 'margen_porcentaje', 'stock_minimo', 'stock_maximo',
            'punto_reorden', 'estado_stock', 'ubicacion_fisica', 'pasillo', 'estante',
            'fecha_ultima_entrada', 'fecha_ultima_salida', 'fecha_ultimo_conteo',
            'dias_sin_movimiento', 'activo', 'es_perecedero', 'dias_vencimiento',
            'fecha_extraccion', 'server_ip', 'batch_id', 'created_at'
        ]

        missing = set(expected_cols) - set(result.columns)
        extra = set(result.columns) - set(expected_cols)

        if missing:
            print(f"\n🚫 Columnas faltantes ({len(missing)}):")
            for col in sorted(missing):
                print(f"     - {col}")

        if extra:
            print(f"\n➕ Columnas extra ({len(extra)}):")
            for col in sorted(extra):
                print(f"     + {col}")
    else:
        print(f"\n✅ ¡Número correcto de columnas!")

if __name__ == "__main__":
    debug_columns()