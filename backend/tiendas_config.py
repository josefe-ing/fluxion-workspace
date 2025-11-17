#!/usr/bin/env python3
"""
Configuración de conexiones para todas las tiendas de La Granja Mercado
Actualizado: 2024-09-25
"""

from typing import Dict, Any
import os
from dataclasses import dataclass
from pathlib import Path

# Cargar variables de entorno desde .env
try:
    from dotenv import load_dotenv
    # Buscar .env en el directorio etl (parent del core)
    env_path = Path(__file__).parent.parent / '.env'
    # override=False: NO sobrescribir variables de entorno existentes (de ECS)
    # Esto permite que ETL_ENVIRONMENT de la task definition prevalezca sobre .env local
    load_dotenv(dotenv_path=env_path, override=False)
except ImportError:
    print("⚠️  python-dotenv no instalado, usando variables de sistema")

# Helper functions para obtener credenciales
def get_sql_user():
    """Obtiene el usuario SQL de variables de entorno"""
    return os.getenv("SQL_USER", "beliveryApp")

def get_sql_pass():
    """Obtiene el password SQL de variables de entorno"""
    return os.getenv("SQL_PASS", "AxPG_25!")

def get_environment():
    """Detecta si estamos en local o producción AWS"""
    return os.getenv("ETL_ENVIRONMENT", "local").lower()

def get_server_ip(local_ip: str, prod_ip: str = None):
    """
    Retorna la IP correcta según el entorno

    Args:
        local_ip: IP para entorno local (directo a la tienda)
        prod_ip: IP para producción AWS (via WireGuard/NAT). Si es None, usa local_ip

    Returns:
        IP correcta según ETL_ENVIRONMENT
    """
    env = get_environment()

    if env == "production" or env == "prod":
        return prod_ip if prod_ip else local_ip

    # Por defecto, usar local
    return local_ip

def get_server_port(local_port: int, prod_port: int = None):
    """
    Retorna el puerto correcto según el entorno

    Args:
        local_port: Puerto para entorno local (directo a la tienda)
        prod_port: Puerto para producción AWS (via WireGuard port forwarding). Si es None, usa local_port

    Returns:
        Puerto correcto según ETL_ENVIRONMENT
    """
    env = get_environment()

    if env == "production" or env == "prod":
        return prod_port if prod_port else local_port

    # Por defecto, usar local
    return local_port

# NOTA: En producción, las ECS tasks se conectan directamente a las IPs 192.168.x.x
# El routing del VPC automáticamente envía ese tráfico a través del WireGuard bridge (10.0.2.43)
# NO se necesita usar la IP del bridge explícitamente - el VPC route table lo maneja transparentemente
# Ver: docs/infrastructure/vpn-setup-complete.md y ETL_VPN_DIAGNOSIS_COMPLETE.md

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
    # Sistema POS utilizado - NUEVO CAMPO
    sistema_pos: str = "stellar"  # "stellar" | "klk" - Sistema POS de la tienda
    codigo_almacen_klk: str = None  # Código de almacén en KLK (si aplica)
    # Flags de visibilidad en módulos
    visible_pedidos: bool = False  # Mostrar en módulo de Pedidos Sugeridos
    visible_reportes: bool = True  # Mostrar en Reportes
    visible_dashboards: bool = True  # Mostrar en Dashboards
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
        server_ip="192.168.20.12",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=14348,
        activo=True,
        codigo_deposito="0102",
        visible_pedidos=True,  # ✅ Visible en Pedidos Sugeridos
        sistema_pos="klk",  # 🆕 Migrado a KLK
        codigo_almacen_klk="APP-TPF"  # Código de almacén en KLK
    ),

    "tienda_02": TiendaConfig(
        ubicacion_id="tienda_02",
        ubicacion_nombre="AV. BOLIVAR",
        server_ip="192.168.30.52",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=14348,
        activo=True,
        codigo_deposito="0202"
    ),

    "tienda_03": TiendaConfig(
        ubicacion_id="tienda_03",
        ubicacion_nombre="MAÑONGO",
        server_ip="192.168.50.20",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=14348,
        activo=True,
        codigo_deposito="0302",
        visible_pedidos=True  # ✅ Visible en Pedidos Sugeridos
    ),

    "tienda_04": TiendaConfig(
        ubicacion_id="tienda_04",
        ubicacion_nombre="SAN DIEGO",
        server_ip="192.168.140.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=14348,
        activo=True,
        codigo_deposito="0402"
    ),

    "tienda_05": TiendaConfig(
        ubicacion_id="tienda_05",
        ubicacion_nombre="VIVIENDA",
        server_ip="192.168.80.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=14348,
        activo=True,
        codigo_deposito="0502"
    ),

    "tienda_06": TiendaConfig(
        ubicacion_id="tienda_06",
        ubicacion_nombre="NAGUANAGUA",
        server_ip="192.168.40.53",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=14348,
        activo=True,
        codigo_deposito="0602"
    ),

    "tienda_07": TiendaConfig(
        ubicacion_id="tienda_07",
        ubicacion_nombre="CENTRO",
        server_ip="192.168.130.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=14348,
        activo=True,
        codigo_deposito="0702"
    ),

    "tienda_08": TiendaConfig(
        ubicacion_id="tienda_08",
        ubicacion_nombre="BOSQUE",
        server_ip="192.168.150.10",  # Acceso directo via VPN (local y producción)
        database_name="VAD20",  # BOSQUE usa VAD20, no VAD10
        username=get_sql_user(),
        password=get_sql_pass(),
        port=14348,
        activo=True,
        codigo_deposito="0802",
        visible_pedidos=True,  # ✅ Visible en Pedidos Sugeridos
        sistema_pos="klk",  # 🆕 Migrado a KLK
        codigo_almacen_klk="APP-TBQ"  # Código de almacén en KLK: EL BOSQUE PV
    ),

    "tienda_09": TiendaConfig(
        ubicacion_id="tienda_09",
        ubicacion_nombre="GUACARA",
        server_ip="192.168.120.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=14348,
        activo=True,
        codigo_deposito="0902"
    ),

    "tienda_10": TiendaConfig(
        ubicacion_id="tienda_10",
        ubicacion_nombre="FERIAS",
        server_ip="192.168.70.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=14348,
        activo=True,
        codigo_deposito="1002"
    ),

    "tienda_11": TiendaConfig(
        ubicacion_id="tienda_11",
        ubicacion_nombre="FLOR AMARILLO",
        server_ip="192.168.160.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=14348,
        activo=True,
        codigo_deposito="1102"
    ),

    "tienda_12": TiendaConfig(
        ubicacion_id="tienda_12",
        ubicacion_nombre="PARAPARAL",
        server_ip="192.168.170.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=1433,
        activo=True,
        codigo_deposito="1202"
    ),

    "tienda_13": TiendaConfig(
        ubicacion_id="tienda_13",
        ubicacion_nombre="NAGUANAGUA III",
        server_ip="192.168.190.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=14348,
        activo=True,
        codigo_deposito="1302"
    ),

    "tienda_15": TiendaConfig(
        ubicacion_id="tienda_15",
        ubicacion_nombre="ISABELICA",
        server_ip="192.168.180.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=1433,
        activo=True,
        codigo_deposito="1502"
    ),

    "tienda_16": TiendaConfig(
        ubicacion_id="tienda_16",
        ubicacion_nombre="TOCUYITO",
        server_ip="192.168.110.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=1433,
        activo=True,
        codigo_deposito="1602"
    ),

    "tienda_19": TiendaConfig(
        ubicacion_id="tienda_19",
        ubicacion_nombre="GUIGUE",
        server_ip="192.168.210.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=1433,
        activo=True,
        codigo_deposito="1902"
    ),

    "tienda_20": TiendaConfig(
        ubicacion_id="tienda_20",
        ubicacion_nombre="TAZAJAL",
        server_ip="192.168.220.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=1433,
        activo=True,
        codigo_deposito="2001"
        # NOTA: TAZAJAL tiene código KLK "TTZ" pero aún no migrado
    ),

    # CEDIs - Configurados con datos reales
    "cedi_seco": TiendaConfig(
        ubicacion_id="cedi_seco",
        ubicacion_nombre="CEDI Seco",
        server_ip="192.168.90.20",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=1433,
        codigo_deposito="0001",
        activo=True,
        tipo="cedi",
        visible_pedidos=True  # ✅ Visible en Pedidos Sugeridos
    ),

    "cedi_frio": TiendaConfig(
        ubicacion_id="cedi_frio",
        ubicacion_nombre="CEDI Frio",
        server_ip="192.168.170.20",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
        port=1433,
        codigo_deposito="1710",
        activo=True,
        tipo="cedi"
    ),

    "cedi_verde": TiendaConfig(
        ubicacion_id="cedi_verde",
        ubicacion_nombre="CEDI Verde",
        server_ip="192.168.200.10",  # VPC routing handles WireGuard automatically
        database_name="VAD10",
        username=get_sql_user(),
        password=get_sql_pass(),
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
        username=get_sql_user(),
        password=get_sql_pass(),
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

def get_tiendas_con_ventas() -> Dict[str, TiendaConfig]:
    """
    Retorna solo las tiendas activas que tienen ventas (excluye CEDIs)
    Los CEDIs son centros de distribución sin ventas
    """
    return {
        k: v for k, v in TIENDAS_CONFIG.items()
        if v.activo and v.tipo != "cedi"
    }

def get_ubicaciones_visibles_pedidos() -> Dict[str, TiendaConfig]:
    """
    Retorna solo las ubicaciones (tiendas y CEDIs) visibles en módulo de Pedidos Sugeridos
    """
    return {
        k: v for k, v in TIENDAS_CONFIG.items()
        if v.activo and v.visible_pedidos
    }

def get_tiendas_por_sistema_pos(sistema: str) -> Dict[str, TiendaConfig]:
    """
    Retorna solo las tiendas que usan un sistema POS específico

    Args:
        sistema: 'stellar' | 'klk'

    Returns:
        Dict de tiendas filtradas por sistema POS
    """
    return {
        k: v for k, v in TIENDAS_CONFIG.items()
        if v.activo and v.sistema_pos == sistema.lower()
    }

def get_tiendas_klk() -> Dict[str, TiendaConfig]:
    """
    Retorna solo las tiendas que usan KLK POS
    """
    return get_tiendas_por_sistema_pos("klk")

def get_tiendas_stellar() -> Dict[str, TiendaConfig]:
    """
    Retorna solo las tiendas que usan Stellar POS
    """
    return get_tiendas_por_sistema_pos("stellar")

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