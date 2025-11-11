#!/usr/bin/env python3
"""
Script para calcular la clasificación XYZ POR TIENDA.
Complementa ABC v2 calculando variabilidad de demanda local.
"""

import duckdb
import argparse
import sys
from pathlib import Path
from datetime import datetime, timedelta

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "fluxion_production.db"


class CalculadorXYZPorTienda:
    """Calculador XYZ por tienda."""

    def __init__(self, db_path: str, verbose: bool = False):
        self.db_path = db_path
        self.verbose = verbose
        self.conn = None

    def conectar(self):
        """Conectar a la base de datos."""
        try:
            self.conn = duckdb.connect(str(self.db_path))
            if self.verbose:
                print(f"✓ Conectado a: {self.db_path}")
        except Exception as e:
            print(f"✗ Error al conectar a la BD: {e}", file=sys.stderr)
            sys.exit(1)

    def cerrar(self):
        """Cerrar conexión."""
        if self.conn:
            self.conn.close()
            if self.verbose:
                print("✓ Conexión cerrada")

    def obtener_tiendas(self):
        """Obtener lista de tiendas con ABC v2 calculado."""
        result = self.conn.execute("""
            SELECT DISTINCT ubicacion_id
            FROM productos_abc_v2
            WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
            ORDER BY ubicacion_id
        """).fetchall()
        return [row[0] for row in result]

    def calcular_xyz_tienda(self, ubicacion_id: str, semanas: int = 12):
        """Calcular XYZ para una tienda específica."""

        if self.verbose:
            print(f"\n📍 Procesando XYZ: {ubicacion_id}")

        fecha_fin = datetime.now().date()
        fecha_inicio = fecha_fin - timedelta(weeks=semanas)

        # PASO 1: Calcular ventas semanales por producto EN ESTA TIENDA
        try:
            self.conn.execute(f"""
                CREATE OR REPLACE TEMP TABLE ventas_semanales_{ubicacion_id} AS
                SELECT
                    codigo_producto,
                    DATE_TRUNC('week', TRY_CAST(fecha AS DATE)) as semana,
                    SUM(TRY_CAST(cantidad_vendida AS DECIMAL(18,4))) as unidades_vendidas
                FROM ventas_raw
                WHERE TRY_CAST(fecha AS DATE) BETWEEN DATE '{fecha_inicio}' AND DATE '{fecha_fin}'
                    AND ubicacion_id = '{ubicacion_id}'
                    AND codigo_producto IS NOT NULL
                    AND codigo_producto != ''
                    AND TRY_CAST(cantidad_vendida AS DECIMAL) > 0
                GROUP BY codigo_producto, DATE_TRUNC('week', TRY_CAST(fecha AS DATE))
            """)

            count = self.conn.execute(f"SELECT COUNT(DISTINCT codigo_producto) FROM ventas_semanales_{ubicacion_id}").fetchone()[0]
            if self.verbose:
                print(f"   → {count:,} productos analizados")

        except Exception as e:
            print(f"   ✗ Error en paso 1: {e}")
            return False

        # PASO 2: Calcular estadísticas (CV)
        try:
            self.conn.execute(f"""
                CREATE OR REPLACE TEMP TABLE estadisticas_xyz_{ubicacion_id} AS
                SELECT
                    vs.codigo_producto,
                    COUNT(DISTINCT vs.semana) as semanas_con_venta,
                    {semanas} as semanas_analizadas,
                    AVG(vs.unidades_vendidas) as demanda_promedio_semanal,
                    STDDEV(vs.unidades_vendidas) as desviacion_estandar_semanal,
                    CASE
                        WHEN AVG(vs.unidades_vendidas) > 0 THEN
                            STDDEV(vs.unidades_vendidas) / AVG(vs.unidades_vendidas)
                        ELSE NULL
                    END as coeficiente_variacion,
                    CASE
                        WHEN COUNT(DISTINCT vs.semana) >= 8 THEN 'ALTA'
                        WHEN COUNT(DISTINCT vs.semana) >= 4 THEN 'MEDIA'
                        ELSE 'BAJA'
                    END as confiabilidad_calculo
                FROM ventas_semanales_{ubicacion_id} vs
                GROUP BY vs.codigo_producto
                HAVING COUNT(DISTINCT vs.semana) >= 2
            """)

        except Exception as e:
            print(f"   ✗ Error en paso 2: {e}")
            return False

        # PASO 3: Asignar clasificación XYZ
        try:
            self.conn.execute(f"""
                CREATE OR REPLACE TEMP TABLE clasificacion_xyz_{ubicacion_id} AS
                SELECT
                    e.*,
                    CASE
                        WHEN e.coeficiente_variacion IS NULL THEN 'Z'
                        WHEN e.demanda_promedio_semanal = 0 THEN 'Z'
                        WHEN e.coeficiente_variacion < 0.5 THEN 'X'
                        WHEN e.coeficiente_variacion < 1.0 THEN 'Y'
                        ELSE 'Z'
                    END as clasificacion_xyz,
                    CASE
                        WHEN e.coeficiente_variacion IS NOT NULL AND e.coeficiente_variacion > 2.0 THEN true
                        ELSE false
                    END as es_extremadamente_volatil,
                    false as es_estacional
                FROM estadisticas_xyz_{ubicacion_id} e
            """)

        except Exception as e:
            print(f"   ✗ Error en paso 3: {e}")
            return False

        # PASO 4: Actualizar productos_abc_v2 con XYZ
        try:
            self.conn.execute(f"""
                UPDATE productos_abc_v2 abc
                SET
                    clasificacion_xyz = xyz.clasificacion_xyz,
                    coeficiente_variacion = xyz.coeficiente_variacion,
                    demanda_promedio_semanal = xyz.demanda_promedio_semanal,
                    desviacion_estandar_semanal = xyz.desviacion_estandar_semanal,
                    semanas_con_venta = xyz.semanas_con_venta,
                    semanas_analizadas = xyz.semanas_analizadas,
                    matriz_abc_xyz = abc.clasificacion_abc_valor || xyz.clasificacion_xyz,
                    confiabilidad_calculo = xyz.confiabilidad_calculo,
                    es_extremadamente_volatil = xyz.es_extremadamente_volatil,
                    es_estacional = xyz.es_estacional
                FROM clasificacion_xyz_{ubicacion_id} xyz
                WHERE abc.ubicacion_id = '{ubicacion_id}'
                    AND abc.codigo_producto = xyz.codigo_producto
                    AND abc.clasificacion_abc_valor IN ('A', 'B', 'C')
            """)

            if self.verbose:
                actualizados = self.conn.execute(f"""
                    SELECT COUNT(*)
                    FROM productos_abc_v2
                    WHERE ubicacion_id = '{ubicacion_id}'
                        AND clasificacion_xyz IS NOT NULL
                """).fetchone()[0]
                print(f"   ✓ {actualizados:,} productos actualizados con XYZ")

        except Exception as e:
            print(f"   ✗ Error actualizando: {e}")
            return False

        return True

    def calcular_todas_tiendas(self, semanas: int = 12, dry_run: bool = False):
        """Calcular XYZ para todas las tiendas."""
        print(f"\n{'=' * 70}")
        print(f"CÁLCULO XYZ POR TIENDA ({semanas} semanas)")
        print(f"{'=' * 70}\n")

        # Obtener tiendas
        tiendas = self.obtener_tiendas()
        print(f"📍 Total tiendas a procesar: {len(tiendas)}\n")

        if dry_run:
            print("⚠️  DRY-RUN MODE - No se guardarán cambios\n")
            return True

        # Procesar cada tienda
        tiendas_exitosas = 0
        for ubicacion_id in tiendas:
            try:
                exito = self.calcular_xyz_tienda(ubicacion_id, semanas)
                if exito:
                    tiendas_exitosas += 1
            except Exception as e:
                print(f"   ✗ Error procesando {ubicacion_id}: {e}")

        # Mostrar resumen
        self._mostrar_resumen(tiendas_exitosas, len(tiendas))

        return True

    def _mostrar_resumen(self, exitosas: int, total: int):
        """Mostrar resumen de resultados."""
        print(f"\n{'=' * 70}")
        print("RESUMEN XYZ POR TIENDA")
        print(f"{'=' * 70}\n")

        print(f"✓ Tiendas procesadas: {exitosas}/{total}\n")

        try:
            # Resumen por tienda
            resultado = self.conn.execute("""
                SELECT
                    ubicacion_id,
                    COUNT(*) as productos,
                    COUNT(CASE WHEN clasificacion_xyz = 'X' THEN 1 END) as clase_x,
                    COUNT(CASE WHEN clasificacion_xyz = 'Y' THEN 1 END) as clase_y,
                    COUNT(CASE WHEN clasificacion_xyz = 'Z' THEN 1 END) as clase_z,
                    ROUND(AVG(coeficiente_variacion), 4) as cv_promedio
                FROM productos_abc_v2
                WHERE clasificacion_xyz IS NOT NULL
                GROUP BY ubicacion_id
                ORDER BY ubicacion_id
            """).fetchall()

            print(f"{'Tienda':<12} {'Productos':<10} {'X':<6} {'Y':<6} {'Z':<6} {'CV Prom'}")
            print("-" * 60)

            for row in resultado:
                print(f"{row[0]:<12} {row[1]:<10,} {row[2]:<6} {row[3]:<6} {row[4]:<6} {row[5]:.4f}")

            print()

            # Resumen de matriz ABC-XYZ
            print(f"{'=' * 70}")
            print("DISTRIBUCIÓN MATRIZ ABC-XYZ POR TIENDA (Top combinaciones)")
            print(f"{'=' * 70}\n")

            resultado_matriz = self.conn.execute("""
                SELECT
                    ubicacion_id,
                    matriz_abc_xyz,
                    COUNT(*) as num_productos
                FROM productos_abc_v2
                WHERE matriz_abc_xyz IS NOT NULL
                GROUP BY ubicacion_id, matriz_abc_xyz
                HAVING matriz_abc_xyz IN ('AX', 'AY', 'AZ', 'BX')
                ORDER BY ubicacion_id, matriz_abc_xyz
            """).fetchall()

            current_tienda = None
            for row in resultado_matriz:
                if current_tienda != row[0]:
                    print(f"\n{row[0]}:")
                    current_tienda = row[0]
                print(f"  {row[1]}: {row[2]:,} productos")

        except Exception as e:
            print(f"⚠ Error al generar resumen: {e}")


def main():
    """Función principal."""
    parser = argparse.ArgumentParser(
        description='Calcular XYZ por tienda'
    )
    parser.add_argument('--semanas', type=int, default=12)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--verbose', action='store_true')

    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"✗ No se encuentra la BD: {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    calculador = CalculadorXYZPorTienda(str(DB_PATH), verbose=args.verbose)

    try:
        calculador.conectar()

        exito = calculador.calcular_todas_tiendas(
            semanas=args.semanas,
            dry_run=args.dry_run
        )

        if exito:
            print("✅ Proceso completado exitosamente\n")
        else:
            sys.exit(1)

    except KeyboardInterrupt:
        print("\n\n⚠ Proceso interrumpido")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)
    finally:
        calculador.cerrar()


if __name__ == '__main__':
    main()
