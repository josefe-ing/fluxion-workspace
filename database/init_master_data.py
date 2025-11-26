#!/usr/bin/env python3
"""
Script de inicialización de datos maestros para PostgreSQL
Carga las 24 ubicaciones (20 tiendas + 4 CEDIs) desde tiendas_config.py

Uso:
    python3 init_master_data.py [--host localhost] [--port 5432] [--db fluxion_production]
"""

import sys
import os
from pathlib import Path
import argparse
import psycopg2
from psycopg2.extras import execute_values

# Agregar el directorio etl/core al path para importar tiendas_config
etl_core_path = Path(__file__).parent.parent / "etl" / "core"
sys.path.insert(0, str(etl_core_path))

try:
    from tiendas_config import TIENDAS_CONFIG
except ImportError as e:
    print(f"❌ Error importando tiendas_config: {e}")
    print(f"   Path buscado: {etl_core_path}")
    sys.exit(1)


def connect_postgres(host: str, port: int, database: str, user: str, password: str):
    """Conecta a PostgreSQL"""
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password
        )
        return conn
    except Exception as e:
        print(f"❌ Error conectando a PostgreSQL: {e}")
        sys.exit(1)


def init_ubicaciones(conn):
    """Inicializa la tabla ubicaciones con las 24 ubicaciones"""
    cursor = conn.cursor()

    # Preparar datos desde TIENDAS_CONFIG
    ubicaciones_data = []

    for tienda_id, config in TIENDAS_CONFIG.items():
        ubicaciones_data.append((
            tienda_id,                    # codigo
            config.ubicacion_nombre,      # nombre
            config.tipo,                  # tipo: 'tienda' | 'cedi'
            None,                         # direccion (NULL por ahora)
            None,                         # ciudad (NULL por ahora)
            None,                         # estado (NULL por ahora - asumir Carabobo)
            "Venezuela",                  # pais
            None,                         # zona (NULL por ahora)
            config.activo,                # activo
            {                             # metadata_jsonb
                "server_ip": config.server_ip,
                "database_name": config.database_name,
                "port": config.port,
                "codigo_deposito": config.codigo_deposito,
                "sistema_pos": config.sistema_pos,
                "visible_pedidos": config.visible_pedidos,
                "visible_reportes": config.visible_reportes,
                "visible_dashboards": config.visible_dashboards,
                "stock_min_mult_a": config.stock_min_mult_a,
                "stock_min_mult_ab": config.stock_min_mult_ab,
                "stock_min_mult_b": config.stock_min_mult_b,
                "stock_min_mult_bc": config.stock_min_mult_bc,
                "stock_min_mult_c": config.stock_min_mult_c,
                "stock_seg_mult_a": config.stock_seg_mult_a,
                "stock_seg_mult_ab": config.stock_seg_mult_ab,
                "stock_seg_mult_b": config.stock_seg_mult_b,
                "stock_seg_mult_bc": config.stock_seg_mult_bc,
                "stock_seg_mult_c": config.stock_seg_mult_c
            }
        ))

    # Usar INSERT ... ON CONFLICT DO UPDATE para idempotencia
    insert_sql = """
        INSERT INTO ubicaciones (
            codigo, nombre, tipo, direccion, ciudad, estado, pais, zona, activo, metadata_jsonb
        ) VALUES %s
        ON CONFLICT (codigo)
        DO UPDATE SET
            nombre = EXCLUDED.nombre,
            tipo = EXCLUDED.tipo,
            activo = EXCLUDED.activo,
            metadata_jsonb = EXCLUDED.metadata_jsonb,
            updated_at = CURRENT_TIMESTAMP
    """

    try:
        execute_values(
            cursor,
            insert_sql,
            ubicaciones_data,
            template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)"
        )
        conn.commit()
        print(f"✅ {len(ubicaciones_data)} ubicaciones cargadas/actualizadas")

        # Mostrar resumen
        cursor.execute("""
            SELECT tipo, COUNT(*)
            FROM ubicaciones
            WHERE activo = true
            GROUP BY tipo
        """)
        for tipo, count in cursor.fetchall():
            print(f"   - {tipo}: {count} activas")

    except Exception as e:
        conn.rollback()
        print(f"❌ Error insertando ubicaciones: {e}")
        raise
    finally:
        cursor.close()


def verify_data(conn):
    """Verifica que los datos se hayan cargado correctamente"""
    cursor = conn.cursor()

    print("\n📊 Verificación de datos:")
    print("=" * 60)

    # Total de ubicaciones
    cursor.execute("SELECT COUNT(*) FROM ubicaciones")
    total = cursor.fetchone()[0]
    print(f"Total ubicaciones: {total}")

    # Ubicaciones por tipo
    cursor.execute("""
        SELECT tipo, activo, COUNT(*)
        FROM ubicaciones
        GROUP BY tipo, activo
        ORDER BY tipo, activo DESC
    """)
    print("\nPor tipo y estado:")
    for tipo, activo, count in cursor.fetchall():
        estado = "✅ activas" if activo else "❌ inactivas"
        print(f"  {tipo}: {count} {estado}")

    # Muestra de tiendas
    cursor.execute("""
        SELECT codigo, nombre, tipo, activo
        FROM ubicaciones
        WHERE tipo = 'tienda' AND activo = true
        ORDER BY codigo
        LIMIT 5
    """)
    print("\nMuestra de tiendas activas:")
    for codigo, nombre, tipo, activo in cursor.fetchall():
        print(f"  {codigo}: {nombre}")

    # CEDIs
    cursor.execute("""
        SELECT codigo, nombre, activo
        FROM ubicaciones
        WHERE tipo = 'cedi'
        ORDER BY codigo
    """)
    print("\nCEDIs configurados:")
    for codigo, nombre, activo in cursor.fetchall():
        estado = "✅" if activo else "❌"
        print(f"  {estado} {codigo}: {nombre}")

    cursor.close()
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Inicializa datos maestros en PostgreSQL")
    parser.add_argument("--host", default="localhost", help="PostgreSQL host (default: localhost)")
    parser.add_argument("--port", type=int, default=5432, help="PostgreSQL port (default: 5432)")
    parser.add_argument("--db", default="fluxion_production", help="Database name (default: fluxion_production)")
    parser.add_argument("--user", default="fluxion", help="PostgreSQL user (default: fluxion)")
    parser.add_argument("--password", default="fluxion_dev_2025", help="PostgreSQL password")

    args = parser.parse_args()

    print("🚀 Inicializando datos maestros en PostgreSQL")
    print("=" * 60)
    print(f"Host: {args.host}:{args.port}")
    print(f"Database: {args.db}")
    print(f"User: {args.user}")
    print("=" * 60)
    print()

    # Conectar
    conn = connect_postgres(args.host, args.port, args.db, args.user, args.password)

    try:
        # Inicializar ubicaciones
        print("📍 Cargando ubicaciones (20 tiendas + 4 CEDIs)...")
        init_ubicaciones(conn)

        # Verificar
        verify_data(conn)

        print("\n✅ Inicialización completada exitosamente!")

    except Exception as e:
        print(f"\n❌ Error durante la inicialización: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
