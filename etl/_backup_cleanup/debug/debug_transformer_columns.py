#!/usr/bin/env python3
import sys
sys.path.append('/Users/jose/Developer/fluxion-workspace/etl')
from extractor import SQLServerExtractor
from transformer import InventoryTransformer
from tiendas_config import get_tienda_config
from config import DatabaseConfig

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

with open('query_inventario_generic.sql', 'r') as f:
    query_content = f.read()

print('🔍 Debug - Columnas antes y después del transformer...')

extractor = SQLServerExtractor()
raw_data = extractor.extract_inventory_data(db_config, query=query_content)

if raw_data is not None:
    print('\n=== COLUMNAS DESPUÉS DE EXTRACCIÓN ===')
    print(f'Total registros extraídos: {len(raw_data)}')
    print('Columnas extraídas:')
    for i, col in enumerate(raw_data.columns):
        print(f'  {i+1}. {col}')

    # Probar la transformación paso a paso
    transformer = InventoryTransformer()

    # Simular el mapeo que se haría en transform_inventory_data
    print('\n=== PROBANDO MAPEO DE COLUMNAS ===')

    # tienda_01 usa map_el_bosque_columns, pero las otras deberían usar map_generic_tienda_columns
    # Pero tienda_01 está siendo tratada como El Bosque incorrectamente
    print('tienda_01 será mapeada como generic (no como El Bosque)')

    mapped_df = transformer.map_generic_tienda_columns(raw_data)

    print(f'\nTotal registros después del mapeo: {len(mapped_df)}')
    print('Columnas después del mapeo:')
    for i, col in enumerate(mapped_df.columns):
        print(f'  {i+1}. {col}')

    # Verificar campos requeridos específicos
    required_fields = ['ubicacion_id', 'codigo_producto', 'descripcion_producto', 'cantidad_actual', 'fecha_extraccion']
    print(f'\n=== VERIFICACIÓN CAMPOS REQUERIDOS ===')
    for field in required_fields:
        if field in mapped_df.columns:
            null_count = mapped_df[field].isnull().sum()
            print(f'✅ {field}: OK ({null_count} nulls de {len(mapped_df)})')
        else:
            print(f'❌ {field}: FALTA')

    # Mostrar una muestra de datos para codigo_producto
    if 'codigo_producto' in mapped_df.columns:
        print(f'\n=== MUESTRA codigo_producto ===')
        print(f'Primeros 5 valores:')
        print(mapped_df['codigo_producto'].head().tolist())
        print(f'Total nulls: {mapped_df["codigo_producto"].isnull().sum()}')

else:
    print('❌ No se pudo extraer data')