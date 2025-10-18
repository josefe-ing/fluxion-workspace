#!/usr/bin/env python3
"""
Test Simple de Conectividad (sin dependencias SQL)
Para probar la verificación de IP y puertos
"""

import socket
import sys
import time
from datetime import datetime
from typing import Dict, List, Tuple

# Agregar el directorio actual al path
sys.path.append('.')
from tiendas_config import TIENDAS_CONFIG

def test_ip_port(ip: str, port: int, timeout: float = 0.5) -> Tuple[bool, bool, float]:
    """
    Prueba IP y puerto
    Returns: (ip_reachable, port_open, response_time)
    """
    start_time = time.time()

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((ip, port))
        sock.close()

        response_time = (time.time() - start_time) * 1000  # ms

        # result == 0 significa conexión exitosa
        return True, result == 0, response_time

    except (socket.gaierror, socket.timeout, OSError):
        response_time = (time.time() - start_time) * 1000
        return False, False, response_time

def main():
    print(f"🔍 TEST SIMPLE DE CONECTIVIDAD - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    print(f"{'Tienda':<12} {'Nombre':<15} {'IP':<15} {'Puerto':<6} {'Estado':<12} {'Tiempo':<8}")
    print("-"*80)

    conectadas = 0
    total = 0

    for tienda_id, config in TIENDAS_CONFIG.items():
        if not config.activo:
            continue

        total += 1
        ip_ok, puerto_ok, tiempo = test_ip_port(config.server_ip, config.port)

        if puerto_ok:
            estado = "✅ OK"
            conectadas += 1
        elif ip_ok:
            estado = "🟡 IP OK"
        else:
            estado = "❌ NO REACH"

        print(f"{tienda_id:<12} {config.ubicacion_nombre:<15} {config.server_ip:<15} {config.port:<6} {estado:<12} {tiempo:.0f}ms")

    print("-"*80)
    print(f"📊 Resumen: {conectadas}/{total} tiendas con puertos abiertos ({conectadas/total*100:.1f}%)")

    if conectadas > 0:
        print(f"\\n🚀 Tiendas listas para ETL: {conectadas}")
    else:
        print(f"\\n⚠️  Ninguna tienda disponible para ETL")

if __name__ == "__main__":
    main()