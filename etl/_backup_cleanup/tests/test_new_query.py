#!/usr/bin/env python3
"""
Script para probar el nuevo query con parámetros dinámicos
Testea con PERIFERICO (tienda_01) usando código de depósito 0102
"""

import sys
sys.path.append('/Users/jose/Developer/fluxion-workspace/etl')

from extractor import SQLServerExtractor
from transformer import InventoryTransformer
from tiendas_config import get_tienda_config
from config import DatabaseConfig

def test_new_query():
    print('🧪 PROBANDO NUEVO QUERY PARAMETRIZADO')
    print('=' * 60)

    # Configuración para PERIFERICO
    config_tienda = get_tienda_config('tienda_01')
    db_config = DatabaseConfig(
        ubicacion_id=config_tienda.ubicacion_id,
        ubicacion_nombre=config_tienda.ubicacion_nombre,
        tipo=config_tienda.tipo,
        server_ip=config_tienda.server_ip,
        database_name=config_tienda.database_name,
        username=config_tienda.username,
        password=config_tienda.password,
        port=config_tienda.port
    )

    print(f'🏪 Tienda: {config_tienda.ubicacion_nombre}')
    print(f'📍 Código depósito: {config_tienda.codigo_deposito}')
    print()

    # Probar extracción con nuevo query
    extractor = SQLServerExtractor()

    try:
        # Usar el nuevo query con parámetros
        query_params = {'codigo_deposito': config_tienda.codigo_deposito}
        data = extractor.extract_inventory_data(
            config=db_config,
            query_file='query_inventario_new.sql',
            query_params=query_params
        )

        if data is not None:
            print(f'✅ Extracción exitosa: {len(data):,} registros')
            print()

            print('📋 Columnas extraídas:')
            for i, col in enumerate(data.columns, 1):
                print(f'  {i:2d}. {col}')
            print()

            # Mostrar muestra de datos
            print('🔍 Muestra de los primeros 3 registros:')
            print(data.head(3)[['codigo_producto', 'descripcion_producto', 'categoria_producto', 'stock']].to_string())
            print()

            # Probar transformación
            print('🔄 Probando transformación...')
            transformer = InventoryTransformer()

            # Simular el formato que espera el transformer
            raw_data = {config_tienda.ubicacion_id: data}
            transformed_data = transformer.transform_inventory_data(raw_data)

            if not transformed_data.empty:
                print(f'✅ Transformación exitosa: {len(transformed_data):,} registros')
                print()

                print('📋 Columnas transformadas:')
                for i, col in enumerate(transformed_data.columns, 1):
                    print(f'  {i:2d}. {col}')
                print()

                # Verificar campos críticos
                critical_fields = ['codigo_producto', 'descripcion_producto', 'categoria', 'cantidad_actual']
                print('🔍 Verificación de campos críticos:')
                for field in critical_fields:
                    if field in transformed_data.columns:
                        null_count = transformed_data[field].isnull().sum()
                        print(f'  ✅ {field}: {null_count} nulls de {len(transformed_data)}')
                    else:
                        print(f'  ❌ {field}: FALTA')

                print()
                print('🎉 Nuevo query funcionando correctamente!')
                print('📊 Resumen:')
                print(f'   📦 Registros: {len(transformed_data):,}')
                print(f'   🏷️  Categorías: {transformed_data["categoria"].nunique()}')
                print(f'   💰 Stock total: {transformed_data["cantidad_actual"].sum():,.0f}')

            else:
                print('❌ Error en la transformación')

        else:
            print('❌ Error en la extracción')

    except Exception as e:
        print(f'❌ Error durante la prueba: {str(e)}')
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_new_query()