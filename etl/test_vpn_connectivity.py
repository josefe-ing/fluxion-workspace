#!/usr/bin/env python3
"""
Test VPN connectivity from AWS ECS to La Granja stores
"""
import socket
import sys
import json
from datetime import datetime

# Tiendas activas según tiendas_config.py
TIENDAS = {
    "tienda_04": ("192.168.140.10", 14348, "SAN DIEGO"),
    "tienda_07": ("192.168.130.10", 14348, "CENTRO"),
    "tienda_08": ("192.168.150.10", 14348, "BOSQUE"),
    "tienda_09": ("192.168.120.10", 14348, "GUACARA"),
    "tienda_11": ("192.168.160.10", 1433, "FLOR AMARILLO"),
    "tienda_12": ("192.168.170.10", 1433, "PARAPARAL"),
    "tienda_13": ("192.168.190.10", 14348, "NAGUANAGUA III"),
    "tienda_15": ("192.168.180.10", 1433, "ISABELICA"),
    "tienda_16": ("192.168.110.10", 1433, "TOCUYITO"),
    "tienda_19": ("192.168.210.10", 1433, "GUIGUE"),
}

CEDIS = {
    "cedi_seco": ("192.168.90.20", 1433, "CEDI SECO"),
    "cedi_frio": ("192.168.170.20", 1433, "CEDI FRIO"),
    "cedi_verde": ("192.168.200.10", 1433, "CEDI VERDE"),
}

def test_port(host, port, timeout=5):
    """Test if a port is open"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception as e:
        return False

def main():
    print("=" * 70)
    print("🧪 VPN CONNECTIVITY TEST - AWS ECS → La Granja")
    print(f"⏰ Timestamp: {datetime.now().isoformat()}")
    print("=" * 70)

    results = {
        "timestamp": datetime.now().isoformat(),
        "tiendas": {},
        "cedis": {},
        "summary": {}
    }

    # Test tiendas
    print("\n📍 TESTING TIENDAS:")
    print("-" * 70)
    tiendas_ok = 0
    for tid, (host, port, nombre) in TIENDAS.items():
        status = test_port(host, port, timeout=3)
        icon = "✅" if status else "❌"
        print(f"{icon} {tid:12} {nombre:20} {host:18}:{port:5} {'OK' if status else 'FAIL'}")
        results["tiendas"][tid] = {
            "nombre": nombre,
            "host": host,
            "port": port,
            "status": "OK" if status else "FAIL"
        }
        if status:
            tiendas_ok += 1

    # Test CEDIs
    print("\n🏭 TESTING CEDIS:")
    print("-" * 70)
    cedis_ok = 0
    for cid, (host, port, nombre) in CEDIS.items():
        status = test_port(host, port, timeout=3)
        icon = "✅" if status else "❌"
        print(f"{icon} {cid:12} {nombre:20} {host:18}:{port:5} {'OK' if status else 'FAIL'}")
        results["cedis"][cid] = {
            "nombre": nombre,
            "host": host,
            "port": port,
            "status": "OK" if status else "FAIL"
        }
        if status:
            cedis_ok += 1

    # Summary
    total_tiendas = len(TIENDAS)
    total_cedis = len(CEDIS)
    total_locations = total_tiendas + total_cedis
    total_ok = tiendas_ok + cedis_ok

    print("\n" + "=" * 70)
    print("📊 SUMMARY:")
    print(f"   Tiendas:   {tiendas_ok}/{total_tiendas} OK ({tiendas_ok/total_tiendas*100:.1f}%)")
    print(f"   CEDIs:     {cedis_ok}/{total_cedis} OK ({cedis_ok/total_cedis*100:.1f}%)")
    print(f"   TOTAL:     {total_ok}/{total_locations} OK ({total_ok/total_locations*100:.1f}%)")
    print("=" * 70)

    results["summary"] = {
        "tiendas_ok": tiendas_ok,
        "tiendas_total": total_tiendas,
        "cedis_ok": cedis_ok,
        "cedis_total": total_cedis,
        "total_ok": total_ok,
        "total_locations": total_locations,
        "success_rate": f"{total_ok/total_locations*100:.1f}%"
    }

    # Write JSON results
    with open("/tmp/vpn_test_results.json", "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n💾 Results saved to: /tmp/vpn_test_results.json")

    # Exit with error if less than 50% success
    if total_ok < total_locations * 0.5:
        print("\n❌ FAIL: Less than 50% locations reachable")
        sys.exit(1)
    else:
        print("\n✅ SUCCESS: VPN connectivity verified")
        sys.exit(0)

if __name__ == "__main__":
    main()
