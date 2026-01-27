#!/usr/bin/env python3
"""
Sincroniza peso/volumen de productos desde Stellar (CEDIs) a PostgreSQL.
Extrae de cedi_seco, cedi_frio y cedi_verde.

Uso:
    python sync_peso_volumen.py --test      # Solo muestra, no actualiza
    python sync_peso_volumen.py             # Actualiza PostgreSQL
"""

import os
import sys
import argparse
from pathlib import Path
from datetime import datetime

# Agregar paths
sys.path.insert(0, str(Path(__file__).parent.parent / 'core'))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'backend'))

import pyodbc
import psycopg2
from psycopg2.extras import execute_values

from tiendas_config import TIENDAS_CONFIG, get_tienda_config

# CEDIs a consultar (todos usan Stellar/SQL Server)
CEDIS = ['cedi_seco', 'cedi_frio', 'cedi_verde']

# Query para extraer peso/volumen de Stellar
QUERY_PESO_VOLUMEN = """
SELECT DISTINCT
    p.c_Codigo as codigo,
    p.c_Descri as descripcion,
    p.n_Peso as peso,
    p.n_Volumen as volumen,
    p.n_CantiBul as unidades_bulto
FROM {database}.dbo.MA_PRODUCTOS p
WHERE p.n_Activo = 1
  AND p.c_Codigo IS NOT NULL
"""


def get_sql_connection(cedi_id: str):
    """Crea conexión a SQL Server para un CEDI"""
    config = get_tienda_config(cedi_id)
    odbc_driver = os.environ.get('SQL_ODBC_DRIVER', 'ODBC Driver 17 for SQL Server')
    conn_str = (
        f"DRIVER={{{odbc_driver}}};"
        f"SERVER={config.server_ip},{config.port};"
        f"DATABASE={config.database_name};"
        f"UID={config.username};"
        f"PWD={config.password};"
        f"TrustServerCertificate=yes;"
        f"Connection Timeout=60;"
    )
    return pyodbc.connect(conn_str, timeout=60), config


def extract_from_cedi(cedi_id: str) -> dict:
    """Extrae peso/volumen de un CEDI. Retorna dict {codigo: (peso, volumen, bultos)}"""
    try:
        conn, config = get_sql_connection(cedi_id)
        cursor = conn.cursor()

        query = QUERY_PESO_VOLUMEN.format(database=config.database_name)
        cursor.execute(query)

        productos = {}
        for row in cursor.fetchall():
            codigo = str(row.codigo).strip()
            peso = float(row.peso or 0)
            volumen = float(row.volumen or 0)
            bultos = int(row.unidades_bulto or 1)

            # Solo guardar si tiene peso o volumen válido
            if peso > 0 or volumen > 0:
                productos[codigo] = (peso, volumen, bultos)

        conn.close()
        print(f"  ✅ {cedi_id}: {len(productos)} productos con peso/volumen")
        return productos

    except Exception as e:
        print(f"  ❌ {cedi_id}: Error - {e}")
        return {}


def extract_all_cedis() -> dict:
    """Extrae de todos los CEDIs y combina resultados"""
    print("\n📦 Extrayendo peso/volumen de CEDIs Stellar...")

    all_productos = {}
    for cedi_id in CEDIS:
        productos = extract_from_cedi(cedi_id)
        # Merge: preferir valores con peso > 0
        for codigo, (peso, volumen, bultos) in productos.items():
            if codigo not in all_productos or peso > all_productos[codigo][0]:
                all_productos[codigo] = (peso, volumen, bultos)

    print(f"\n📊 Total productos únicos con peso/volumen: {len(all_productos)}")
    return all_productos


def update_postgres(productos: dict, postgres_dsn: str, test_mode: bool = False):
    """Actualiza PostgreSQL con los datos extraídos"""
    if not productos:
        print("⚠️  No hay productos para actualizar")
        return

    print(f"\n{'🔍 TEST MODE - ' if test_mode else ''}📤 Actualizando PostgreSQL...")

    conn = psycopg2.connect(postgres_dsn)
    cursor = conn.cursor()

    # Verificar cuántos productos existen en PostgreSQL que podemos actualizar
    codigos = list(productos.keys())
    cursor.execute("""
        SELECT codigo, peso_unitario, volumen_unitario
        FROM productos
        WHERE codigo = ANY(%s)
    """, (codigos,))

    existentes = {row[0]: (row[1], row[2]) for row in cursor.fetchall()}
    print(f"   Productos en PostgreSQL que podemos actualizar: {len(existentes)}")

    # Filtrar: solo actualizar si el producto existe y le falta peso/volumen
    updates = []
    for codigo, (peso, volumen, bultos) in productos.items():
        if codigo in existentes:
            peso_actual, vol_actual = existentes[codigo]
            # Actualizar si no tiene peso o si el nuevo es mejor
            if not peso_actual or peso_actual == 0:
                updates.append((peso, volumen, bultos, codigo))

    print(f"   Productos a actualizar (sin peso actual): {len(updates)}")

    if test_mode:
        print("\n   Preview de primeros 10 updates:")
        for peso, volumen, bultos, codigo in updates[:10]:
            print(f"      {codigo}: peso={peso}, volumen={volumen}, bultos={bultos}")
        conn.close()
        return

    if not updates:
        print("   ✅ No hay productos que necesiten actualización")
        conn.close()
        return

    # Ejecutar updates en batch
    update_query = """
        UPDATE productos
        SET peso_unitario = data.peso,
            volumen_unitario = data.volumen,
            unidades_por_bulto = data.bultos,
            fecha_actualizacion = NOW()
        FROM (VALUES %s) AS data(peso, volumen, bultos, codigo)
        WHERE productos.codigo = data.codigo
    """

    execute_values(cursor, update_query, updates,
                   template="(%s::numeric, %s::numeric, %s::integer, %s)")

    updated = cursor.rowcount
    conn.commit()
    cursor.close()
    conn.close()

    print(f"   ✅ {updated} productos actualizados")


def main():
    parser = argparse.ArgumentParser(description='Sincroniza peso/volumen desde Stellar')
    parser.add_argument('--test', action='store_true', help='Solo mostrar, no actualizar')
    parser.add_argument('--postgres-dsn', default=None, help='DSN de PostgreSQL')
    args = parser.parse_args()

    # Obtener DSN de PostgreSQL
    if args.postgres_dsn:
        postgres_dsn = args.postgres_dsn
    else:
        # Intentar desde variables de entorno o config
        try:
            from db_config import POSTGRES_DSN
            postgres_dsn = POSTGRES_DSN
        except:
            # Fallback a producción via túnel
            postgres_dsn = "postgresql://postgres:RNIT_tl5.WRmlWzL5yyDptYQ-xJE=6@localhost:5433/fluxion_production"

    print(f"=" * 60)
    print(f"SINCRONIZACIÓN PESO/VOLUMEN - Stellar → PostgreSQL")
    print(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Modo: {'TEST (sin cambios)' if args.test else 'PRODUCCIÓN'}")
    print(f"=" * 60)

    # 1. Extraer de CEDIs
    productos = extract_all_cedis()

    # 2. Actualizar PostgreSQL
    update_postgres(productos, postgres_dsn, test_mode=args.test)

    print(f"\n{'=' * 60}")
    print("✅ Proceso completado")


if __name__ == "__main__":
    main()
