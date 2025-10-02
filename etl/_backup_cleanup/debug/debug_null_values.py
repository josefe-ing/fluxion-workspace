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

with open('query_inventario_generic.sql', 'r') as f:
    query_content = f.read()

print('🔍 Analizando valores de codigo_producto...')

extractor = SQLServerExtractor()
data = extractor.extract_inventory_data(db_config, query=query_content)

if data is not None:
    print(f'Total registros: {len(data)}')

    # Examinar valores de codigo_producto
    print('\n=== ANALISIS DE codigo_producto ===')
    codigo_col = data['codigo_producto']

    print(f'Tipo de datos: {codigo_col.dtype}')
    print(f'Total valores NULL: {codigo_col.isnull().sum()}')
    print(f'Total valores no-NULL: {codigo_col.notnull().sum()}')

    # Primeros 10 valores no-NULL
    print('\nPrimeros 10 valores no-NULL:')
    non_null_values = codigo_col.dropna()
    if len(non_null_values) > 0:
        print(non_null_values.head(10).tolist())
    else:
        print('¡NO HAY VALORES NO-NULL!')

    # Primeros 10 valores NULL si los hay
    null_count = codigo_col.isnull().sum()
    if null_count > 0:
        print(f'\n⚠️  ENCONTRADOS {null_count} valores NULL')
        # Mostrar primeros registros con valores NULL
        null_rows = data[data['codigo_producto'].isnull()].head(5)
        print('Primeros 5 registros con codigo_producto NULL:')
        for idx, row in null_rows.iterrows():
            print(f"  - descripcion: {row['descripcion_producto']}")
            print(f"    cantidad: {row['cantidad_actual']}")
            print(f"    codigo_producto: {row['codigo_producto']}")
            print()

    # Verificar si hay valores vacíos o espacios
    print('\n=== ANALISIS DE VALORES VACIOS ===')
    empty_strings = (codigo_col == '').sum()
    whitespace_only = codigo_col.str.strip().eq('').sum() if codigo_col.dtype == 'object' else 0

    print(f'Valores string vacíos (""): {empty_strings}')
    print(f'Valores solo espacios: {whitespace_only}')

    # Estadísticas generales
    print('\n=== ESTADISTICAS GENERALES ===')
    if codigo_col.dtype == 'object':
        print(f'Longitud promedio: {codigo_col.str.len().mean():.2f}')
        print(f'Longitud mínima: {codigo_col.str.len().min()}')
        print(f'Longitud máxima: {codigo_col.str.len().max()}')

    print(f'Valores únicos: {codigo_col.nunique()}')

else:
    print('❌ No se pudo extraer data')