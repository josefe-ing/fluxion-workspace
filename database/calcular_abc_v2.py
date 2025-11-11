#!/usr/bin/env python3
"""
Script para calcular la clasificación ABC v2 basada en valor económico (Pareto).

Este script ejecuta el cálculo de clasificación ABC basándose en el valor de consumo
de productos, implementando el Principio de Pareto (80/20).

Uso:
    python3 calcular_abc_v2.py [--periodo PERIODO] [--meses MESES]

Opciones:
    --periodo   Tipo de periodo: TRIMESTRAL (default), SEMESTRAL, ANUAL
    --meses     Número de meses hacia atrás (default: 3)
    --dry-run   Ejecutar sin guardar cambios (solo mostrar resultados)
    --verbose   Mostrar información detallada del proceso
"""

import duckdb
import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Optional

# Configuración de rutas
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "fluxion_production.db"
SCHEMA_FILE = BASE_DIR / "database" / "schema_abc_v2.sql"
CALCULO_FILE = BASE_DIR / "database" / "calculo_abc_v2.sql"


class CalculadorABCv2:
    """Calculador de clasificación ABC v2 basado en valor económico."""

    def __init__(self, db_path: str, verbose: bool = False):
        """
        Inicializar calculador.

        Args:
            db_path: Ruta a la base de datos DuckDB
            verbose: Si es True, mostrar información detallada
        """
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
        """Cerrar conexión a la base de datos."""
        if self.conn:
            self.conn.close()
            if self.verbose:
                print("✓ Conexión cerrada")

    def verificar_tablas(self) -> bool:
        """
        Verificar que las tablas necesarias existan.

        Returns:
            True si todas las tablas existen, False en caso contrario
        """
        tablas_requeridas = [
            'productos',
            'items_facturas',
            'facturas',
            'productos_abc_v2',
            'productos_abc_v2_historico',
            'productos_abc_v2_evolucion'
        ]

        for tabla in tablas_requeridas:
            try:
                result = self.conn.execute(
                    f"SELECT COUNT(*) FROM {tabla}"
                ).fetchone()
                if self.verbose:
                    print(f"✓ Tabla '{tabla}' existe ({result[0]} registros)")
            except Exception:
                print(f"✗ Tabla '{tabla}' no existe. Ejecutar schema_abc_v2.sql primero.", file=sys.stderr)
                return False

        return True

    def crear_tablas(self):
        """Crear tablas ABC v2 si no existen."""
        if not SCHEMA_FILE.exists():
            print(f"✗ No se encuentra el archivo de schema: {SCHEMA_FILE}", file=sys.stderr)
            sys.exit(1)

        try:
            with open(SCHEMA_FILE, 'r', encoding='utf-8') as f:
                schema_sql = f.read()

            # Ejecutar el schema
            self.conn.execute(schema_sql)
            print("✓ Tablas ABC v2 creadas/verificadas correctamente")

        except Exception as e:
            print(f"✗ Error al crear tablas: {e}", file=sys.stderr)
            sys.exit(1)

    def configurar_parametros(
        self,
        periodo: str = 'TRIMESTRAL',
        meses: int = 3,
        umbral_a: float = 80.0,
        umbral_b: float = 95.0,
        dias_nuevo: int = 30
    ) -> Dict:
        """
        Configurar parámetros de cálculo.

        Args:
            periodo: Tipo de periodo (TRIMESTRAL, SEMESTRAL, ANUAL)
            meses: Número de meses hacia atrás
            umbral_a: Umbral para clase A (% acumulado)
            umbral_b: Umbral para clase B (% acumulado)
            dias_nuevo: Días mínimos para considerar producto nuevo

        Returns:
            Dict con los parámetros configurados
        """
        fecha_fin = datetime.now().date()
        fecha_inicio = fecha_fin - timedelta(days=meses * 30)

        parametros = {
            'fecha_inicio': fecha_inicio,
            'fecha_fin': fecha_fin,
            'periodo_analisis': periodo,
            'umbral_clase_a': umbral_a,
            'umbral_clase_b': umbral_b,
            'dias_minimos_nuevo': dias_nuevo
        }

        if self.verbose:
            print("\n=== PARÁMETROS DE CÁLCULO ===")
            for key, value in parametros.items():
                print(f"  {key}: {value}")
            print()

        return parametros

    def calcular_abc_v2(
        self,
        periodo: str = 'TRIMESTRAL',
        meses: int = 3,
        dry_run: bool = False
    ) -> bool:
        """
        Ejecutar cálculo de clasificación ABC v2.

        Args:
            periodo: Tipo de periodo (TRIMESTRAL, SEMESTRAL, ANUAL)
            meses: Número de meses hacia atrás
            dry_run: Si es True, no guardar cambios

        Returns:
            True si el cálculo fue exitoso, False en caso contrario
        """
        print(f"\n{'=' * 70}")
        print(f"CÁLCULO ABC V2 - {periodo} ({meses} meses)")
        print(f"{'=' * 70}\n")

        # Configurar parámetros
        parametros = self.configurar_parametros(periodo, meses)

        # Modificar el SQL para usar los parámetros
        fecha_inicio_str = parametros['fecha_inicio'].strftime('%Y-%m-%d')
        fecha_fin_str = parametros['fecha_fin'].strftime('%Y-%m-%d')

        # Leer y modificar el script SQL
        if not CALCULO_FILE.exists():
            print(f"✗ No se encuentra el script de cálculo: {CALCULO_FILE}", file=sys.stderr)
            return False

        try:
            with open(CALCULO_FILE, 'r', encoding='utf-8') as f:
                calculo_sql = f.read()

            # Reemplazar parámetros en el SQL
            calculo_sql_modificado = calculo_sql.replace(
                "CURRENT_DATE - INTERVAL '3 months'",
                f"DATE '{fecha_inicio_str}'"
            ).replace(
                "CURRENT_DATE as fecha_fin",
                f"DATE '{fecha_fin_str}' as fecha_fin"
            ).replace(
                "'TRIMESTRAL' as periodo_analisis",
                f"'{periodo}' as periodo_analisis"
            )

            # Si es dry-run, comentar las operaciones de escritura
            if dry_run:
                print("⚠ Modo DRY-RUN: No se guardarán cambios\n")
                # Comentar INSERT y UPDATE
                calculo_sql_modificado = calculo_sql_modificado.replace(
                    "INSERT INTO productos_abc_v2_historico",
                    "-- DRY-RUN: INSERT INTO productos_abc_v2_historico"
                ).replace(
                    "DELETE FROM productos_abc_v2",
                    "-- DRY-RUN: DELETE FROM productos_abc_v2"
                ).replace(
                    "INSERT INTO productos_abc_v2\nSELECT * FROM productos_abc_final",
                    "-- DRY-RUN: INSERT INTO productos_abc_v2\n-- SELECT * FROM productos_abc_final"
                ).replace(
                    "INSERT INTO productos_abc_v2_evolucion",
                    "-- DRY-RUN: INSERT INTO productos_abc_v2_evolucion"
                ).replace(
                    "UPDATE productos p",
                    "-- DRY-RUN: UPDATE productos p"
                )

            # Ejecutar el cálculo
            if self.verbose:
                print("⏳ Ejecutando cálculo ABC v2...\n")

            self.conn.execute(calculo_sql_modificado)

            print("✓ Cálculo ABC v2 completado exitosamente\n")

            # Mostrar resumen
            self._mostrar_resumen()

            return True

        except Exception as e:
            print(f"\n✗ Error durante el cálculo: {e}", file=sys.stderr)
            if self.verbose:
                import traceback
                traceback.print_exc()
            return False

    def _mostrar_resumen(self):
        """Mostrar resumen de la clasificación calculada."""
        print(f"\n{'=' * 70}")
        print("RESUMEN DE CLASIFICACIÓN ABC V2")
        print(f"{'=' * 70}\n")

        # Resumen por clasificación
        query_resumen = """
        SELECT
            clasificacion_abc_valor,
            COUNT(*) as num_productos,
            ROUND(SUM(valor_consumo_total), 2) as valor_total,
            ROUND(SUM(porcentaje_valor), 2) as porcentaje_valor_total,
            ROUND(AVG(valor_consumo_total), 2) as valor_promedio
        FROM productos_abc_final
        GROUP BY clasificacion_abc_valor
        ORDER BY
            CASE clasificacion_abc_valor
                WHEN 'A' THEN 1
                WHEN 'B' THEN 2
                WHEN 'C' THEN 3
                WHEN 'NUEVO' THEN 4
                WHEN 'SIN_MOVIMIENTO' THEN 5
                WHEN 'ERROR_COSTO' THEN 6
            END
        """

        try:
            resultado = self.conn.execute(query_resumen).fetchall()

            print(f"{'Clasificación':<20} {'Productos':<15} {'Valor Total':<20} {'% Valor':<15} {'Valor Promedio':<20}")
            print("-" * 90)

            for row in resultado:
                clasificacion, num_productos, valor_total, porcentaje, valor_promedio = row
                print(f"{clasificacion:<20} {num_productos:<15} {valor_total:<20,.2f} {porcentaje:<15.2f}% {valor_promedio:<20,.2f}")

            print()

            # Verificar Pareto (80/20)
            self._verificar_pareto()

            # TOP 10 productos por valor
            self._mostrar_top_productos(10)

        except Exception as e:
            print(f"⚠ No se pudo generar el resumen: {e}")

    def _verificar_pareto(self):
        """Verificar si se cumple el principio de Pareto (80/20)."""
        query_pareto = """
        SELECT
            clasificacion_abc_valor,
            COUNT(*) as num_productos,
            SUM(porcentaje_valor) as porcentaje_valor_acum
        FROM productos_abc_final
        WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
        GROUP BY clasificacion_abc_valor
        """

        try:
            resultado = self.conn.execute(query_pareto).fetchall()

            total_productos = sum(row[1] for row in resultado)
            productos_a = next((row[1] for row in resultado if row[0] == 'A'), 0)

            porcentaje_productos_a = (productos_a / total_productos * 100) if total_productos > 0 else 0
            porcentaje_valor_a = next((row[2] for row in resultado if row[0] == 'A'), 0)

            print(f"\n{'=' * 70}")
            print("VERIFICACIÓN PRINCIPIO DE PARETO")
            print(f"{'=' * 70}")
            print(f"  Productos clase A: {productos_a} de {total_productos} ({porcentaje_productos_a:.1f}%)")
            print(f"  Valor generado por A: {porcentaje_valor_a:.1f}%")
            print(f"  Cumple Pareto (80/20): {'✓ SÍ' if porcentaje_valor_a >= 75 else '✗ NO'}")
            print()

        except Exception as e:
            print(f"⚠ No se pudo verificar Pareto: {e}")

    def _mostrar_top_productos(self, limite: int = 10):
        """Mostrar TOP productos por valor."""
        query_top = f"""
        SELECT
            pf.ranking_valor,
            p.codigo,
            SUBSTRING(p.descripcion, 1, 40) as descripcion,
            pf.clasificacion_abc_valor,
            ROUND(pf.valor_consumo_total, 2) as valor,
            ROUND(pf.porcentaje_acumulado, 2) as porcentaje_acum
        FROM productos_abc_final pf
        JOIN productos p ON pf.producto_id = p.id
        WHERE pf.clasificacion_abc_valor IN ('A', 'B', 'C')
        ORDER BY pf.ranking_valor
        LIMIT {limite}
        """

        try:
            resultado = self.conn.execute(query_top).fetchall()

            print(f"\n{'=' * 70}")
            print(f"TOP {limite} PRODUCTOS POR VALOR")
            print(f"{'=' * 70}\n")

            print(f"{'#':<5} {'Código':<15} {'Descripción':<42} {'ABC':<5} {'Valor':<15} {'% Acum':<10}")
            print("-" * 95)

            for row in resultado:
                ranking, codigo, descripcion, abc, valor, porcentaje_acum = row
                print(f"{ranking:<5} {codigo:<15} {descripcion:<42} {abc:<5} {valor:>14,.2f} {porcentaje_acum:>9.2f}%")

            print()

        except Exception as e:
            print(f"⚠ No se pudo mostrar TOP productos: {e}")

    def generar_reporte_comparativo(self):
        """Generar reporte comparando clasificación velocidad vs valor."""
        print(f"\n{'=' * 70}")
        print("ANÁLISIS COMPARATIVO: VELOCIDAD VS VALOR")
        print(f"{'=' * 70}\n")

        query_comparacion = """
        SELECT
            p.abc_classification as clasificacion_velocidad,
            abc.clasificacion_abc_valor,
            COUNT(*) as num_productos,
            ROUND(SUM(abc.valor_consumo_total), 2) as valor_total
        FROM productos_abc_v2 abc
        JOIN productos p ON abc.producto_id = p.id
        WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
            AND p.abc_classification IS NOT NULL
        GROUP BY p.abc_classification, abc.clasificacion_abc_valor
        ORDER BY
            CASE p.abc_classification WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END,
            CASE abc.clasificacion_abc_valor WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 END
        """

        try:
            resultado = self.conn.execute(query_comparacion).fetchall()

            print(f"{'Velocidad':<15} {'Valor':<15} {'Productos':<15} {'Valor Total':<20}")
            print("-" * 65)

            for row in resultado:
                vel, val, num, total = row
                print(f"{vel or 'NULL':<15} {val:<15} {num:<15} {total:>19,.2f}")

            print()

            # Identificar discrepancias significativas
            query_discrepancias = """
            SELECT
                p.codigo,
                SUBSTRING(p.descripcion, 1, 35) as descripcion,
                p.abc_classification as velocidad,
                abc.clasificacion_abc_valor as valor,
                ROUND(abc.valor_consumo_total, 2) as valor_consumo
            FROM productos_abc_v2 abc
            JOIN productos p ON abc.producto_id = p.id
            WHERE (
                (p.abc_classification = 'A' AND abc.clasificacion_abc_valor = 'C')
                OR (p.abc_classification = 'C' AND abc.clasificacion_abc_valor = 'A')
            )
            AND p.abc_classification IS NOT NULL
            ORDER BY abc.valor_consumo_total DESC
            LIMIT 20
            """

            resultado_disc = self.conn.execute(query_discrepancias).fetchall()

            if resultado_disc:
                print(f"\n{'=' * 70}")
                print("DISCREPANCIAS SIGNIFICATIVAS (Alta velocidad/Bajo valor o viceversa)")
                print(f"{'=' * 70}\n")

                print(f"{'Código':<15} {'Descripción':<37} {'Vel':<5} {'Val':<5} {'Valor Consumo':<18}")
                print("-" * 80)

                for row in resultado_disc:
                    codigo, desc, vel, val, valor = row
                    print(f"{codigo:<15} {desc:<37} {vel:<5} {val:<5} {valor:>17,.2f}")

                print()

        except Exception as e:
            print(f"⚠ No se pudo generar reporte comparativo: {e}")


def main():
    """Función principal."""
    parser = argparse.ArgumentParser(
        description='Calcular clasificación ABC v2 basada en valor económico (Pareto)'
    )
    parser.add_argument(
        '--periodo',
        choices=['TRIMESTRAL', 'SEMESTRAL', 'ANUAL'],
        default='TRIMESTRAL',
        help='Tipo de periodo de análisis (default: TRIMESTRAL)'
    )
    parser.add_argument(
        '--meses',
        type=int,
        default=3,
        help='Número de meses hacia atrás (default: 3)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Ejecutar sin guardar cambios (solo mostrar resultados)'
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Mostrar información detallada del proceso'
    )
    parser.add_argument(
        '--crear-tablas',
        action='store_true',
        help='Crear/verificar tablas ABC v2 antes del cálculo'
    )
    parser.add_argument(
        '--comparativo',
        action='store_true',
        help='Generar reporte comparativo velocidad vs valor'
    )

    args = parser.parse_args()

    # Verificar que existe la BD
    if not DB_PATH.exists():
        print(f"✗ No se encuentra la base de datos: {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    # Crear calculador
    calculador = CalculadorABCv2(str(DB_PATH), verbose=args.verbose)

    try:
        # Conectar
        calculador.conectar()

        # Crear tablas si se solicita
        if args.crear_tablas:
            calculador.crear_tablas()

        # Verificar tablas
        if not calculador.verificar_tablas():
            print("\n⚠ Ejecutar con --crear-tablas para crear las tablas necesarias")
            sys.exit(1)

        # Ejecutar cálculo
        exito = calculador.calcular_abc_v2(
            periodo=args.periodo,
            meses=args.meses,
            dry_run=args.dry_run
        )

        if not exito:
            sys.exit(1)

        # Generar reporte comparativo si se solicita
        if args.comparativo:
            calculador.generar_reporte_comparativo()

        print("✓ Proceso completado exitosamente\n")

    except KeyboardInterrupt:
        print("\n\n⚠ Proceso interrumpido por el usuario")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Error inesperado: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)
    finally:
        calculador.cerrar()


if __name__ == '__main__':
    main()
