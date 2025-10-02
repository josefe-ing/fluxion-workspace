#!/usr/bin/env python3
import sys
sys.path.append('/Users/jose/Developer/fluxion-workspace/etl')
from extractor import SQLServerExtractor
from tiendas_config import get_tienda_config
from config import DatabaseConfig

print('🔍 Probando conexión VPN a PERIFERICO...')

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

extractor = SQLServerExtractor()
success = extractor.test_connection(db_config)

if success:
    print('✅ Conexión VPN está activa')
else:
    print('❌ Conexión VPN no está disponible')
    print('Por favor reconecta a la VPN antes de continuar')