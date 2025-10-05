#!/usr/bin/env python3
"""
Script para limpiar duplicados en inventario_raw
Mantiene solo el registro más reciente por ubicacion_id + codigo_producto
"""

import duckdb
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / 'data' / 'fluxion_production.db'

def limpiar_duplicados():
    """Elimina registros duplicados manteniendo solo el más reciente"""

    print("="*80)
    print("LIMPIEZA DE DUPLICADOS EN INVENTARIO_RAW")
    print("="*80)
    print(f"Base de datos: {DB_PATH}\n")

    try:
        conn = duckdb.connect(str(DB_PATH))

        # Contar duplicados antes
        result = conn.execute("""
            SELECT COUNT(*) as total_duplicados
            FROM (
                SELECT ubicacion_id, codigo_producto, COUNT(*) as cnt
                FROM inventario_raw
                GROUP BY ubicacion_id, codigo_producto
                HAVING cnt > 1
            )
        """).fetchone()

        duplicados_antes = result[0]
        print(f"📊 Productos duplicados detectados: {duplicados_antes:,}\n")

        if duplicados_antes == 0:
            print("✅ No hay duplicados para limpiar")
            return

        # Contar registros totales antes
        total_antes = conn.execute("SELECT COUNT(*) FROM inventario_raw").fetchone()[0]
        print(f"📦 Registros totales ANTES: {total_antes:,}")

        # Crear tabla temporal con los IDs a mantener (los más recientes)
        print("\n🔄 Identificando registros a mantener...")
        conn.execute("""
            CREATE TEMP TABLE ids_a_mantener AS
            SELECT id
            FROM (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY ubicacion_id, codigo_producto
                        ORDER BY fecha_extraccion DESC, created_at DESC
                    ) as rn
                FROM inventario_raw
            )
            WHERE rn = 1
        """)

        ids_mantener = conn.execute("SELECT COUNT(*) FROM ids_a_mantener").fetchone()[0]
        print(f"✅ Registros a mantener: {ids_mantener:,}")

        # Eliminar registros que NO están en la lista de mantener
        print("\n🗑️  Eliminando registros duplicados...")
        conn.execute("""
            DELETE FROM inventario_raw
            WHERE id NOT IN (SELECT id FROM ids_a_mantener)
        """)

        # Contar registros después
        total_despues = conn.execute("SELECT COUNT(*) FROM inventario_raw").fetchone()[0]
        eliminados = total_antes - total_despues

        print(f"\n📦 Registros totales DESPUÉS: {total_despues:,}")
        print(f"🗑️  Registros eliminados: {eliminados:,}")

        # Verificar que no quedan duplicados
        result = conn.execute("""
            SELECT COUNT(*) as total_duplicados
            FROM (
                SELECT ubicacion_id, codigo_producto, COUNT(*) as cnt
                FROM inventario_raw
                GROUP BY ubicacion_id, codigo_producto
                HAVING cnt > 1
            )
        """).fetchone()

        duplicados_despues = result[0]

        if duplicados_despues == 0:
            print("\n✅ ¡Limpieza completada exitosamente!")
            print("   No quedan duplicados en la base de datos")
        else:
            print(f"\n⚠️  Aún quedan {duplicados_despues:,} duplicados")
            print("   Puede ser necesario ejecutar el script nuevamente")

        conn.close()

        print("\n" + "="*80)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    respuesta = input("¿Deseas continuar con la limpieza de duplicados? (s/n): ")
    if respuesta.lower() == 's':
        limpiar_duplicados()
    else:
        print("Operación cancelada")
