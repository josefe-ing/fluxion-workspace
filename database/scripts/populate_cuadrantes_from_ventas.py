"""
Popular campo productos.cuadrante desde datos históricos de ventas.
Usa el cuadrante más frecuente (moda) de las ventas de cada producto.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'backend'))

from db_manager import get_db_connection_write

def populate_cuadrantes():
    """Popular cuadrantes desde tabla ventas."""

    with get_db_connection_write() as conn:
        cursor = conn.cursor()

        print("Analizando cuadrantes desde tabla ventas...")

        # Obtener cuadrante más frecuente por producto desde tabla ventas
        cursor.execute("""
            WITH cuadrante_moda AS (
                SELECT
                    producto_id,
                    cuadrante_producto,
                    COUNT(*) as frecuencia,
                    ROW_NUMBER() OVER (
                        PARTITION BY producto_id
                        ORDER BY COUNT(*) DESC
                    ) as rn
                FROM ventas
                WHERE cuadrante_producto IS NOT NULL
                  AND cuadrante_producto != ''
                  AND cuadrante_producto != 'NO ESPECIFICADO'
                GROUP BY producto_id, cuadrante_producto
            )
            UPDATE productos p
            SET cuadrante = cm.cuadrante_producto,
                updated_at = CURRENT_TIMESTAMP
            FROM cuadrante_moda cm
            WHERE p.codigo = cm.producto_id
              AND cm.rn = 1
        """)

        updated = cursor.rowcount
        conn.commit()

        # Estadísticas
        cursor.execute("""
            SELECT cuadrante, COUNT(*) as total
            FROM productos
            GROUP BY cuadrante
            ORDER BY cuadrante
        """)

        print(f"\n{'='*60}")
        print(f"Población de Cuadrantes Completada")
        print(f"{'='*60}")
        print(f"Productos actualizados: {updated}")
        print(f"\nDistribución de Cuadrantes:")
        for row in cursor.fetchall():
            print(f"  {row[0]}: {row[1]} productos")

        cursor.close()

if __name__ == "__main__":
    populate_cuadrantes()
