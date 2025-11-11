#!/usr/bin/env python3
"""
Script para calcular la clasificación XYZ basada en variabilidad de demanda.
Complementa la clasificación ABC v2 (valor económico).

Clasificación XYZ:
- X: CV < 0.5   → Demanda estable y predecible
- Y: 0.5 ≤ CV < 1.0 → Demanda variable con tendencia
- Z: CV ≥ 1.0   → Demanda errática e impredecible

CV (Coeficiente de Variación) = Desviación Estándar / Media
"""

import duckdb
import argparse
import sys
from pathlib import Path
from datetime import datetime, timedelta

# Configuración de rutas
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "fluxion_production.db"


class CalculadorXYZ:
    """Calculador de clasificación XYZ por variabilidad de demanda."""

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

    def aplicar_schema_xyz(self):
        """Aplicar schema XYZ si no existe."""
        print("\n🔧 Verificando schema XYZ...")

        try:
            # Verificar si las columnas ya existen
            result = self.conn.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'productos_abc_v2'
                AND column_name IN ('clasificacion_xyz', 'coeficiente_variacion')
            """).fetchall()

            if len(result) == 0:
                print("   Aplicando schema XYZ...")
                with open(BASE_DIR / "database" / "schema_abc_xyz.sql", 'r') as f:
                    schema_sql = f.read()
                self.conn.execute(schema_sql)
                print("   ✓ Schema XYZ aplicado")
            else:
                print("   ✓ Schema XYZ ya existe")

        except Exception as e:
            print(f"   ⚠ No se pudo verificar/aplicar schema: {e}")
            print("   Continuando de todas formas...")

    def calcular_xyz(self, semanas: int = 12, dry_run: bool = False):
        """
        Calcular clasificación XYZ basada en variabilidad de demanda.

        Args:
            semanas: Número de semanas a analizar (default: 12 = 3 meses)
            dry_run: Si True, no guarda cambios
        """
        print(f"\n{'=' * 70}")
        print(f"CÁLCULO XYZ - VARIABILIDAD DE DEMANDA ({semanas} semanas)")
        print(f"{'=' * 70}\n")

        fecha_fin = datetime.now().date()
        fecha_inicio = fecha_fin - timedelta(weeks=semanas)

        print(f"📅 Periodo: {fecha_inicio} a {fecha_fin}\n")

        # PASO 1: Calcular ventas semanales por producto
        print("⏳ Paso 1/5: Calculando ventas semanales por producto...")

        try:
            self.conn.execute(f"""
                CREATE OR REPLACE TEMP TABLE ventas_semanales AS
                SELECT
                    codigo_producto,
                    DATE_TRUNC('week', TRY_CAST(fecha AS DATE)) as semana,
                    SUM(TRY_CAST(cantidad_vendida AS DECIMAL(18,4))) as unidades_vendidas
                FROM ventas_raw
                WHERE TRY_CAST(fecha AS DATE) BETWEEN DATE '{fecha_inicio}' AND DATE '{fecha_fin}'
                    AND codigo_producto IS NOT NULL
                    AND codigo_producto != ''
                    AND TRY_CAST(cantidad_vendida AS DECIMAL) > 0
                GROUP BY codigo_producto, DATE_TRUNC('week', TRY_CAST(fecha AS DATE))
            """)

            count = self.conn.execute("SELECT COUNT(DISTINCT codigo_producto) FROM ventas_semanales").fetchone()[0]
            total_weeks = self.conn.execute("SELECT COUNT(DISTINCT semana) FROM ventas_semanales").fetchone()[0]
            print(f"   ✓ {count:,} productos analizados en {total_weeks} semanas\n")

        except Exception as e:
            print(f"   ✗ Error: {e}")
            sys.exit(1)

        # PASO 2: Calcular estadísticas semanales (promedio, stddev, CV)
        print("⏳ Paso 2/5: Calculando estadísticas de variabilidad...")

        try:
            self.conn.execute(f"""
                CREATE OR REPLACE TEMP TABLE estadisticas_xyz AS
                SELECT
                    vs.codigo_producto,

                    -- Estadísticas básicas
                    COUNT(DISTINCT vs.semana) as semanas_con_venta,
                    {semanas} as semanas_analizadas,
                    AVG(vs.unidades_vendidas) as demanda_promedio_semanal,
                    STDDEV(vs.unidades_vendidas) as desviacion_estandar_semanal,

                    -- Coeficiente de Variación (CV)
                    CASE
                        WHEN AVG(vs.unidades_vendidas) > 0 THEN
                            STDDEV(vs.unidades_vendidas) / AVG(vs.unidades_vendidas)
                        ELSE NULL
                    END as coeficiente_variacion,

                    -- Flags de calidad
                    CASE
                        WHEN COUNT(DISTINCT vs.semana) >= 8 THEN 'ALTA'
                        WHEN COUNT(DISTINCT vs.semana) >= 4 THEN 'MEDIA'
                        ELSE 'BAJA'
                    END as confiabilidad_calculo

                FROM ventas_semanales vs
                GROUP BY vs.codigo_producto
                HAVING COUNT(DISTINCT vs.semana) >= 2  -- Mínimo 2 semanas para calcular stddev
            """)

            stats = self.conn.execute("""
                SELECT
                    COUNT(*) as total,
                    COUNT(CASE WHEN confiabilidad_calculo = 'ALTA' THEN 1 END) as alta,
                    COUNT(CASE WHEN confiabilidad_calculo = 'MEDIA' THEN 1 END) as media,
                    COUNT(CASE WHEN confiabilidad_calculo = 'BAJA' THEN 1 END) as baja
                FROM estadisticas_xyz
            """).fetchone()

            print(f"   ✓ {stats[0]:,} productos con estadísticas calculadas")
            print(f"      - Alta confiabilidad (≥8 semanas): {stats[1]:,}")
            print(f"      - Media confiabilidad (4-7 semanas): {stats[2]:,}")
            print(f"      - Baja confiabilidad (2-3 semanas): {stats[3]:,}\n")

        except Exception as e:
            print(f"   ✗ Error: {e}")
            sys.exit(1)

        # PASO 3: Asignar clasificación XYZ
        print("⏳ Paso 3/5: Asignando clasificación XYZ...")

        try:
            self.conn.execute("""
                CREATE OR REPLACE TEMP TABLE clasificacion_xyz AS
                SELECT
                    e.*,

                    -- Clasificación XYZ basada en CV
                    CASE
                        WHEN e.coeficiente_variacion IS NULL THEN 'Z'  -- Sin datos suficientes
                        WHEN e.demanda_promedio_semanal = 0 THEN 'Z'   -- Sin ventas
                        WHEN e.coeficiente_variacion < 0.5 THEN 'X'    -- Demanda estable
                        WHEN e.coeficiente_variacion < 1.0 THEN 'Y'    -- Demanda variable
                        ELSE 'Z'                                        -- Demanda errática
                    END as clasificacion_xyz,

                    -- Flags adicionales
                    CASE
                        WHEN e.coeficiente_variacion IS NOT NULL AND e.coeficiente_variacion > 2.0 THEN true
                        ELSE false
                    END as es_extremadamente_volatil,

                    -- Detección básica de estacionalidad (simplificada)
                    false as es_estacional  -- TODO: Implementar análisis de estacionalidad

                FROM estadisticas_xyz e
            """)

            distribucion = self.conn.execute("""
                SELECT
                    clasificacion_xyz,
                    COUNT(*) as num_productos,
                    ROUND(AVG(coeficiente_variacion), 4) as cv_promedio
                FROM clasificacion_xyz
                GROUP BY clasificacion_xyz
                ORDER BY clasificacion_xyz
            """).fetchall()

            print("   Distribución XYZ:")
            for row in distribucion:
                print(f"   - Clase {row[0]}: {row[1]:,} productos (CV promedio: {row[2]:.4f})")
            print()

        except Exception as e:
            print(f"   ✗ Error: {e}")
            sys.exit(1)

        # PASO 4: Combinar con ABC v2 para crear matriz
        print("⏳ Paso 4/5: Generando matriz ABC-XYZ...")

        try:
            self.conn.execute("""
                CREATE OR REPLACE TEMP TABLE matriz_abc_xyz AS
                SELECT
                    abc.codigo_producto,
                    xyz.clasificacion_xyz,
                    xyz.coeficiente_variacion,
                    xyz.demanda_promedio_semanal,
                    xyz.desviacion_estandar_semanal,
                    xyz.semanas_con_venta,
                    xyz.semanas_analizadas,
                    xyz.confiabilidad_calculo,
                    xyz.es_extremadamente_volatil,
                    xyz.es_estacional,

                    -- Matriz combinada
                    abc.clasificacion_abc_valor || COALESCE(xyz.clasificacion_xyz, 'Z') as matriz_abc_xyz

                FROM productos_abc_v2 abc
                LEFT JOIN clasificacion_xyz xyz ON abc.codigo_producto = xyz.codigo_producto
                WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
            """)

            # Distribuir matriz
            matriz_dist = self.conn.execute("""
                SELECT
                    matriz_abc_xyz,
                    COUNT(*) as num_productos
                FROM matriz_abc_xyz
                GROUP BY matriz_abc_xyz
                ORDER BY matriz_abc_xyz
            """).fetchall()

            print("   Distribución de la Matriz ABC-XYZ:")
            for row in matriz_dist:
                print(f"   - {row[0]}: {row[1]:,} productos")
            print()

        except Exception as e:
            print(f"   ✗ Error: {e}")
            sys.exit(1)

        # PASO 5: Actualizar tabla productos_abc_v2
        if not dry_run:
            print("⏳ Paso 5/5: Actualizando productos_abc_v2...")

            try:
                # Actualizar registros
                self.conn.execute("""
                    UPDATE productos_abc_v2 abc
                    SET
                        clasificacion_xyz = m.clasificacion_xyz,
                        coeficiente_variacion = m.coeficiente_variacion,
                        demanda_promedio_semanal = m.demanda_promedio_semanal,
                        desviacion_estandar_semanal = m.desviacion_estandar_semanal,
                        semanas_con_venta = m.semanas_con_venta,
                        semanas_analizadas = m.semanas_analizadas,
                        matriz_abc_xyz = m.matriz_abc_xyz,
                        confiabilidad_calculo = m.confiabilidad_calculo,
                        es_extremadamente_volatil = m.es_extremadamente_volatil,
                        es_estacional = m.es_estacional
                    FROM matriz_abc_xyz m
                    WHERE abc.codigo_producto = m.codigo_producto
                """)

                actualizados = self.conn.execute("""
                    SELECT COUNT(*)
                    FROM productos_abc_v2
                    WHERE clasificacion_xyz IS NOT NULL
                """).fetchone()[0]

                print(f"   ✓ {actualizados:,} productos actualizados con clasificación XYZ\n")

            except Exception as e:
                print(f"   ✗ Error al actualizar: {e}")
                sys.exit(1)
        else:
            print("⏳ Paso 5/5: DRY-RUN - No se guardan cambios\n")

        # Mostrar resumen
        self._mostrar_resumen()

        return True

    def _mostrar_resumen(self):
        """Mostrar resumen de resultados."""
        print(f"\n{'=' * 70}")
        print("RESUMEN DE CLASIFICACIÓN XYZ")
        print(f"{'=' * 70}\n")

        try:
            # Resumen por clasificación XYZ
            resultado_xyz = self.conn.execute("""
                SELECT
                    clasificacion_xyz,
                    COUNT(*) as num_productos,
                    ROUND(AVG(coeficiente_variacion), 4) as cv_promedio,
                    ROUND(AVG(demanda_promedio_semanal), 2) as demanda_promedio,
                    COUNT(CASE WHEN confiabilidad_calculo = 'ALTA' THEN 1 END) as alta_confiabilidad
                FROM matriz_abc_xyz
                GROUP BY clasificacion_xyz
                ORDER BY clasificacion_xyz
            """).fetchall()

            print(f"{'Clase XYZ':<12} {'Productos':<12} {'CV Prom':<12} {'Demanda':<15} {'Alta Conf.':<12}")
            print("-" * 70)

            for row in resultado_xyz:
                print(f"{row[0]:<12} {row[1]:<12,} {row[2]:<12.4f} {row[3]:<15.2f} {row[4]:<12,}")

            print()

            # Resumen de matriz ABC-XYZ (top combinaciones)
            resultado_matriz = self.conn.execute("""
                SELECT
                    matriz_abc_xyz,
                    COUNT(*) as num_productos
                FROM matriz_abc_xyz
                GROUP BY matriz_abc_xyz
                ORDER BY
                    CASE SUBSTRING(matriz_abc_xyz, 1, 1)
                        WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4
                    END,
                    CASE SUBSTRING(matriz_abc_xyz, 2, 1)
                        WHEN 'X' THEN 1 WHEN 'Y' THEN 2 WHEN 'Z' THEN 3 ELSE 4
                    END
            """).fetchall()

            print(f"\n{'=' * 70}")
            print("MATRIZ ABC-XYZ")
            print(f"{'=' * 70}\n")

            print(f"{'Matriz':<10} {'Productos':<12} {'Estrategia'}")
            print("-" * 70)

            estrategias = {
                'AX': 'CRÍTICO + ESTABLE → Stock alto, reposición automática',
                'AY': 'CRÍTICO + VARIABLE → Stock medio-alto, monitoreo frecuente',
                'AZ': 'CRÍTICO + ERRÁTICO → ⚠️ ATENCIÓN ESPECIAL - Prever quiebres',
                'BX': 'IMPORTANTE + ESTABLE → Stock medio, reposición programada',
                'BY': 'IMPORTANTE + VARIABLE → Stock medio, revisar tendencias',
                'BZ': 'IMPORTANTE + ERRÁTICO → Stock bajo, ajustar según demanda',
                'CX': 'BAJO + ESTABLE → Stock mínimo predecible',
                'CY': 'BAJO + VARIABLE → Stock mínimo con revisión',
                'CZ': 'BAJO + ERRÁTICO → Candidato a descontinuación o bajo demanda'
            }

            for row in resultado_matriz:
                matriz = row[0]
                estrategia = estrategias.get(matriz, 'Revisar estrategia')
                print(f"{matriz:<10} {row[1]:<12,} {estrategia}")

            print()

            # Productos críticos (AZ)
            productos_az = self.conn.execute("""
                SELECT COUNT(*)
                FROM matriz_abc_xyz
                WHERE matriz_abc_xyz = 'AZ'
            """).fetchone()[0]

            if productos_az > 0:
                print(f"\n⚠️  ALERTA: {productos_az:,} productos AZ (alto valor + errático)")
                print("    → Requieren atención especial para evitar quiebres de stock\n")

        except Exception as e:
            print(f"⚠ Error al generar resumen: {e}")


def main():
    """Función principal."""
    parser = argparse.ArgumentParser(
        description='Calcular clasificación XYZ por variabilidad de demanda'
    )
    parser.add_argument('--semanas', type=int, default=12,
                        help='Número de semanas a analizar (default: 12 = 3 meses)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Ejecutar sin guardar cambios')
    parser.add_argument('--verbose', action='store_true',
                        help='Mostrar información detallada')
    parser.add_argument('--aplicar-schema', action='store_true',
                        help='Aplicar schema XYZ antes de calcular')

    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"✗ No se encuentra la BD: {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    calculador = CalculadorXYZ(str(DB_PATH), verbose=args.verbose)

    try:
        calculador.conectar()

        if args.aplicar_schema:
            calculador.aplicar_schema_xyz()

        exito = calculador.calcular_xyz(
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
