#!/usr/bin/env python3
"""
Test rápido del loader con datos simulados
"""

import pandas as pd
from loader import DuckDBLoader

def test_loader():
    print("🧪 TEST: Loader con datos simulados")
    print("=" * 40)

    # Crear datos simulados con exactamente las 35 columnas que generamos
    test_data = pd.DataFrame({
        'ubicacion_id': ['tienda_01'],
        'ubicacion_nombre': ['El Bosque'],
        'tipo_ubicacion': ['tienda'],
        'codigo_producto': ['TEST001'],
        'codigo_barras': ['123456789012'],
        'descripcion_producto': ['Producto Test'],
        'categoria': ['ALIMENTOS'],
        'subcategoria': ['SUB001'],
        'marca': ['MARCA_TEST'],
        'presentacion': ['UNIDAD'],
        'cantidad_actual': [50.0],
        'cantidad_disponible': [50.0],
        'cantidad_reservada': [0.0],
        'cantidad_en_transito': [0.0],
        'costo_unitario_actual': [8.50],
        'precio_venta_actual': [10.00],
        'valor_inventario_actual': [500.00],
        'margen_porcentaje': [15.0],
        'stock_minimo': [10.0],
        'stock_maximo': [100.0],
        'punto_reorden': [20.0],
        'estado_stock': ['NORMAL'],
        'ubicacion_fisica': ['A1'],
        'pasillo': ['A'],
        'estante': ['1'],
        'fecha_ultima_entrada': [None],
        'fecha_ultima_salida': [None],
        'fecha_ultimo_conteo': [None],
        'dias_sin_movimiento': [0],
        'activo': [True],
        'es_perecedero': [False],
        'dias_vencimiento': [None],
        'fecha_extraccion': [pd.Timestamp.now()],
        'server_ip': ['192.168.150.10'],
        'batch_id': ['test_batch_001']
    })

    print(f"📊 Datos de prueba: {len(test_data)} registros con {len(test_data.columns)} columnas")
    print(f"📋 Columnas: {list(test_data.columns)}")

    # Probar loader
    loader = DuckDBLoader()

    try:
        result = loader.load_inventory_data(test_data)

        if result.get('success'):
            print("✅ ¡Loader funcionando correctamente!")
            print(f"📊 Registros insertados: {result.get('stats', {}).get('insertados', 0)}")
        else:
            print(f"❌ Error en loader: {result.get('message', 'Error desconocido')}")

    except Exception as e:
        print(f"💥 Excepción en loader: {str(e)}")

if __name__ == "__main__":
    test_loader()