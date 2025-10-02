#!/usr/bin/env python3
import sys
sys.path.append('/Users/jose/Developer/fluxion-workspace/etl')
from extractor import SQLServerExtractor
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

# Leer la query directamente desde el archivo
with open('query_inventario_generic.sql', 'r') as f:
    query_content = f.read()

print('Query contenido (primeros 100 chars):', query_content[:100])

extractor = SQLServerExtractor()
data = extractor.extract_inventory_data(db_config, query=query_content)

print('=== COLUMNAS DE PERIFERICO ===')
if data is not None:
    print('Columnas:', list(data.columns))
    print(f'Total registros: {len(data)}')

    required_cols = ['codigo_producto', 'descripcion_producto', 'cantidad_actual']
    for col in required_cols:
        if col in data.columns:
            print(f'✅ {col}: OK')
        else:
            print(f'❌ {col}: FALTA')

    print('\nTodas las columnas:')
    for i, col in enumerate(data.columns):
        print(f'{i+1}. {col}')