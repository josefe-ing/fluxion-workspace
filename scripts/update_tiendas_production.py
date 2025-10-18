#!/usr/bin/env python3
"""
Script para actualizar tiendas_config.py con IPs y puertos de producción
"""

# Mapeo de tiendas a puertos de producción en WireGuard
PORT_MAPPING = {
    "tienda_01": 14301,  # PERIFERICO
    "tienda_02": 14302,  # AV. BOLIVAR
    "tienda_03": 14303,  # MAÑONGO
    "tienda_04": 14304,  # SAN DIEGO
    "tienda_05": 14305,  # VIVIENDA
    "tienda_06": 14306,  # NAGUANAGUA
    "tienda_07": 14307,  # CENTRO
    "tienda_08": 14348,  # BOSQUE (mantener igual)
    "tienda_09": 14309,  # GUACARA
    "tienda_10": 14310,  # FERIAS
    "tienda_11": 14311,  # FLOR AMARILLO
    "tienda_12": 14312,  # PARAPARAL
    "tienda_13": 14313,  # NAGUANAGUA III
    "tienda_15": 14315,  # ISABELICA
    "tienda_16": 14316,  # TOCUYITO
    "tienda_19": 14319,  # GUIGUE
    "tienda_20": 14320,  # TAZAJAL
    "cedi_seco": 14401,  # CEDI Seco
    "cedi_frio": 14402,  # CEDI Frio
    "cedi_verde": 14403,  # CEDI Verde
}

# Generar código para cada tienda
for tienda_id, prod_port in PORT_MAPPING.items():
    print(f"""
    # {tienda_id}
    "server_ip": get_server_ip(
        local_ip="<IP_LOCAL>",
        prod_ip=WIREGUARD_BRIDGE_IP
    ),
    "port": get_server_port(
        local_port=<PUERTO_LOCAL>,
        prod_port={prod_port}
    ),""")
