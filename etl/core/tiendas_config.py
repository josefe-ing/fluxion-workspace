#!/usr/bin/env python3
"""
Configuración de conexiones para todas las tiendas de La Granja Mercado
Actualizado: 2024-09-25
"""

from typing import Dict, Any
import os
from dataclasses import dataclass

@dataclass
class TiendaConfig:
    """Configuración de una tienda"""
    ubicacion_id: str
    ubicacion_nombre: str
    server_ip: str
    database_name: str
    username: str
    password: str
    port: int = 1433
    query_file: str = "query_inventario_generic.sql"
    activo: bool = True
    tipo: str = "tienda"
    codigo_deposito: str = "0102"  # Código específico del depósito para esta tienda
    # Parámetros de stock mínimo por clasificación ABC
    stock_min_mult_a: float = 2.0
    stock_min_mult_ab: float = 2.0
    stock_min_mult_b: float = 3.0
    stock_min_mult_bc: float = 9.0
    stock_min_mult_c: float = 15.0
    # Parámetros de stock de seguridad por clasificación ABC
    stock_seg_mult_a: float = 1.0
    stock_seg_mult_ab: float = 2.5
    stock_seg_mult_b: float = 2.0
    stock_seg_mult_bc: float = 3.0
    stock_seg_mult_c: float = 7.0

# Configuración de tiendas disponibles
TIENDAS_CONFIG: Dict[str, TiendaConfig] = {

    # TIENDAS PRINCIPALES
    "tienda_01": TiendaConfig(
        ubicacion_id="tienda_01",
        ubicacion_nombre="PERIFERICO",
        server_ip="192.168.20.12",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=14348,
        activo=False,
        codigo_deposito="0102"
    ),

    "tienda_02": TiendaConfig(
        ubicacion_id="tienda_02",
        ubicacion_nombre="AV. BOLIVAR",
        server_ip="192.168.30.52",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=14348,
        activo=False,
        codigo_deposito="0202"
    ),

    "tienda_03": TiendaConfig(
        ubicacion_id="tienda_03",
        ubicacion_nombre="MAÑONGO",
        server_ip="192.168.50.20",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=14348,
        activo=False,
        codigo_deposito="0302"
    ),

    "tienda_04": TiendaConfig(
        ubicacion_id="tienda_04",
        ubicacion_nombre="SAN DIEGO",
        server_ip="192.168.140.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=14348,
        activo=True,
        codigo_deposito="0402"
    ),

    "tienda_05": TiendaConfig(
        ubicacion_id="tienda_05",
        ubicacion_nombre="VIVIENDA",
        server_ip="192.168.80.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=14348,
        activo=False,
        codigo_deposito="0502"
    ),

    "tienda_06": TiendaConfig(
        ubicacion_id="tienda_06",
        ubicacion_nombre="NAGUANAGUA",
        server_ip="192.168.40.53",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=14348,
        activo=False,
        codigo_deposito="0602"
    ),

    "tienda_07": TiendaConfig(
        ubicacion_id="tienda_07",
        ubicacion_nombre="CENTRO",
        server_ip="192.168.130.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=14348,
        activo=True,
        codigo_deposito="0702"
    ),

    "tienda_08": TiendaConfig(
        ubicacion_id="tienda_08",
        ubicacion_nombre="BOSQUE",
        server_ip="192.168.150.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=14348,
        activo=True,
        codigo_deposito="0802"
    ),

    "tienda_09": TiendaConfig(
        ubicacion_id="tienda_09",
        ubicacion_nombre="GUACARA",
        server_ip="192.168.120.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=14348,
        activo=True,
        codigo_deposito="0902"
    ),

    "tienda_10": TiendaConfig(
        ubicacion_id="tienda_10",
        ubicacion_nombre="FERIAS",
        server_ip="192.168.70.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=14348,
        activo=False,
        codigo_deposito="1002"
    ),

    "tienda_11": TiendaConfig(
        ubicacion_id="tienda_11",
        ubicacion_nombre="FLOR AMARILLO",
        server_ip="192.168.160.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=1433,
        activo=True,
        codigo_deposito="1102"
    ),

    "tienda_12": TiendaConfig(
        ubicacion_id="tienda_12",
        ubicacion_nombre="PARAPARAL",
        server_ip="192.168.170.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=1433,
        activo=True,
        codigo_deposito="1202"
    ),

    "tienda_13": TiendaConfig(
        ubicacion_id="tienda_13",
        ubicacion_nombre="NAGUANAGUA III",
        server_ip="192.168.190.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=14348,
        activo=True,
        codigo_deposito="1302"
    ),

    "tienda_15": TiendaConfig(
        ubicacion_id="tienda_15",
        ubicacion_nombre="ISABELICA",
        server_ip="192.168.180.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=1433,
        activo=True,
        codigo_deposito="1502"
    ),

    "tienda_16": TiendaConfig(
        ubicacion_id="tienda_16",
        ubicacion_nombre="TOCUYITO",
        server_ip="192.168.110.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=1433,
        activo=True,
        codigo_deposito="1602"
    ),

    "tienda_19": TiendaConfig(
        ubicacion_id="tienda_19",
        ubicacion_nombre="GUIGUE",
        server_ip="192.168.210.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=1433,
        activo=True,
        codigo_deposito="1902"
    ),

    # CEDIs - Configurados con datos reales
    "cedi_seco": TiendaConfig(
        ubicacion_id="cedi_seco",
        ubicacion_nombre="CEDI Seco",
        server_ip="192.168.90.20",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=1433,
        codigo_deposito="0001",
        activo=True,
        tipo="cedi"
    ),

    "cedi_frio": TiendaConfig(
        ubicacion_id="cedi_frio",
        ubicacion_nombre="CEDI Frio",
        server_ip="192.168.170.20",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=1433,
        codigo_deposito="1710",
        activo=True,
        tipo="cedi"
    ),

    "cedi_verde": TiendaConfig(
        ubicacion_id="cedi_verde",
        ubicacion_nombre="CEDI Verde",
        server_ip="192.168.200.10",
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=1433,
        codigo_deposito="1801",
        activo=True,
        tipo="cedi"
    ),

    "cedi_frutas": TiendaConfig(
        ubicacion_id="cedi_frutas",
        ubicacion_nombre="CEDI Frutas",
        server_ip="192.168.XXX.XX",  # TODO: Confirmar IP
        database_name="VAD10",
        username=os.getenv("SQL_USER", "beliveryApp"),
        password=os.getenv("SQL_PASS", "AxPG_25!"),
        port=14348,
        activo=False,  # Activar cuando tengamos la IP
        tipo="cedi"
    ),
}

def get_tienda_config(tienda_id: str) -> TiendaConfig:
    """Obtiene la configuración de una tienda específica"""
    if tienda_id not in TIENDAS_CONFIG:
        raise ValueError(f"Tienda {tienda_id} no configurada")
    return TIENDAS_CONFIG[tienda_id]

def get_tiendas_activas() -> Dict[str, TiendaConfig]:
    """Retorna solo las tiendas activas"""
    return {k: v for k, v in TIENDAS_CONFIG.items() if v.activo}

def listar_tiendas():
    """Lista todas las tiendas configuradas"""
    print("\n🏪 TIENDAS CONFIGURADAS:")
    print("=" * 60)
    for tienda_id, config in TIENDAS_CONFIG.items():
        estado = "✅ ACTIVA" if config.activo else "❌ INACTIVA"
        print(f"{tienda_id}: {config.ubicacion_nombre} - {estado}")
        if config.activo:
            print(f"   📡 IP: {config.server_ip}")
            print(f"   💾 BD: {config.database_name}")
            print(f"   🔌 Puerto: {config.port}")
    print("=" * 60)

if __name__ == "__main__":
    listar_tiendas()