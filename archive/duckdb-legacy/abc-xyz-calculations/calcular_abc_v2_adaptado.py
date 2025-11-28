#!/usr/bin/env python3
"""
Script para calcular la clasificación ABC v2 - ADAPTADO PARA ESTRUCTURA REAL.

Adaptado para usar la tabla ventas_raw de la BD de producción real.
"""

import duckdb
import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Configuración de rutas
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "fluxion_production.db"
SCHEMA_FILE = BASE_DIR / "database" / "schema_abc_v2.sql"


class CalculadorABCv2Adaptado:
    """Calculador ABC v2 adaptado para estructura real."""

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

    def crear_tablas_abc_v2(self):
        """Crear tablas ABC v2."""
        print("\n🔧 Creando/verificando tablas ABC v2...")

        try:
            # Crear tabla productos_abc_v2
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS productos_abc_v2 (
                    id VARCHAR PRIMARY KEY,
                    codigo_producto VARCHAR NOT NULL,
                    periodo_analisis VARCHAR(20) NOT NULL,
                    fecha_inicio DATE NOT NULL,
                    fecha_fin DATE NOT NULL,
                    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    unidades_vendidas_total DECIMAL(18,4) DEFAULT 0,
                    numero_transacciones INTEGER DEFAULT 0,
                    numero_ubicaciones INTEGER DEFAULT 0,
                    costo_promedio_ponderado DECIMAL(12,4),
                    costo_minimo DECIMAL(12,4),
                    costo_maximo DECIMAL(12,4),
                    desviacion_std_costo DECIMAL(12,4),
                    valor_consumo_total DECIMAL(18,2) DEFAULT 0,
                    valor_venta_total DECIMAL(18,2) DEFAULT 0,
                    margen_total DECIMAL(18,2) DEFAULT 0,
                    clasificacion_abc_valor VARCHAR(20) NOT NULL,
                    porcentaje_valor DECIMAL(8,4) NOT NULL,
                    porcentaje_acumulado DECIMAL(8,4) NOT NULL,
                    ranking_valor INTEGER NOT NULL,
                    clasificacion_velocidad VARCHAR(10),
                    ranking_anterior INTEGER,
                    cambio_ranking INTEGER,
                    concentracion_geografica DECIMAL(5,2),
                    tiene_costo_valido BOOLEAN DEFAULT true,
                    tiene_ventas_consistentes BOOLEAN DEFAULT true,
                    es_producto_nuevo BOOLEAN DEFAULT false,
                    version_calculo VARCHAR(10) DEFAULT '2.0',
                    observaciones TEXT
                )
            """)

            # Crear índices
            self.conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_abc_v2_codigo_periodo
                ON productos_abc_v2(codigo_producto, periodo_analisis)
            """)

            self.conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_abc_v2_clasificacion
                ON productos_abc_v2(clasificacion_abc_valor, ranking_valor)
            """)

            print("✓ Tablas ABC v2 creadas/verificadas")

        except Exception as e:
            print(f"✗ Error al crear tablas: {e}", file=sys.stderr)
            sys.exit(1)

    def calcular_abc_v2(
        self,
        periodo: str = 'TRIMESTRAL',
        meses: int = 3,
        dry_run: bool = False
    ):
        """Ejecutar cálculo ABC v2."""
        print(f"\n{'=' * 70}")
        print(f"CÁLCULO ABC V2 - {periodo} ({meses} meses)")
        print(f"{'=' * 70}\n")

        # Fechas
        fecha_fin = datetime.now().date()
        fecha_inicio = fecha_fin - timedelta(days=meses * 30)

        print(f"📅 Periodo: {fecha_inicio} a {fecha_fin}\n")

        # PASO 1: Calcular valor de consumo por producto
        print("⏳ Paso 1/5: Calculando valor de consumo por producto...")

        try:
            self.conn.execute(f"""
                CREATE OR REPLACE TEMP TABLE valor_consumo_productos AS
                SELECT
                    codigo_producto,
                    COUNT(DISTINCT numero_factura) as numero_transacciones,
                    COUNT(DISTINCT ubicacion_id) as numero_ubicaciones,
                    MIN(CAST(fecha AS DATE)) as fecha_primera_venta,
                    MAX(CAST(fecha AS DATE)) as fecha_ultima_venta,

                    -- Cantidades (convertir de VARCHAR a DECIMAL)
                    SUM(TRY_CAST(cantidad_vendida AS DECIMAL(18,4))) as unidades_vendidas_total,

                    -- Costos
                    AVG(TRY_CAST(costo_unitario AS DECIMAL(12,4))) as costo_promedio_ponderado,
                    MIN(TRY_CAST(costo_unitario AS DECIMAL(12,4))) as costo_minimo,
                    MAX(TRY_CAST(costo_unitario AS DECIMAL(12,4))) as costo_maximo,
                    STDDEV(TRY_CAST(costo_unitario AS DECIMAL(12,4))) as desviacion_std_costo,

                    -- Valores
                    SUM(TRY_CAST(costo_total AS DECIMAL(18,2))) as valor_consumo_total,
                    SUM(TRY_CAST(venta_total AS DECIMAL(18,2))) as valor_venta_total,
                    SUM(TRY_CAST(utilidad_bruta AS DECIMAL(18,2))) as margen_total,

                    -- Flags
                    COUNT(CASE WHEN TRY_CAST(costo_unitario AS DECIMAL) IS NULL OR TRY_CAST(costo_unitario AS DECIMAL) = 0 THEN 1 END) as transacciones_sin_costo,
                    COUNT(*) as total_transacciones

                FROM ventas_raw
                WHERE CAST(fecha AS DATE) BETWEEN DATE '{fecha_inicio}' AND DATE '{fecha_fin}'
                    AND codigo_producto IS NOT NULL
                    AND codigo_producto != ''
                GROUP BY codigo_producto
                HAVING SUM(TRY_CAST(cantidad_vendida AS DECIMAL)) > 0
            """)

            count = self.conn.execute("SELECT COUNT(*) FROM valor_consumo_productos").fetchone()[0]
            print(f"   ✓ {count:,} productos con ventas en el periodo\n")

        except Exception as e:
            print(f"   ✗ Error: {e}")
            sys.exit(1)

        # PASO 2: Calcular ranking y porcentajes
        print("⏳ Paso 2/5: Calculando rankings y porcentajes acumulados...")

        try:
            self.conn.execute("""
                CREATE OR REPLACE TEMP TABLE productos_con_ranking AS
                SELECT
                    v.*,
                    ROW_NUMBER() OVER (ORDER BY v.valor_consumo_total DESC) as ranking_valor,
                    (v.valor_consumo_total * 100.0) / SUM(v.valor_consumo_total) OVER () as porcentaje_valor,
                    (SUM(v.valor_consumo_total) OVER (ORDER BY v.valor_consumo_total DESC
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) * 100.0) /
                    SUM(v.valor_consumo_total) OVER () as porcentaje_acumulado,
                    CASE
                        WHEN v.transacciones_sin_costo * 1.0 / v.total_transacciones > 0.5 THEN false
                        WHEN COALESCE(v.costo_promedio_ponderado, 0) = 0 THEN false
                        ELSE true
                    END as tiene_costo_valido,
                    CASE
                        WHEN v.numero_transacciones >= 3 THEN true
                        ELSE false
                    END as tiene_ventas_consistentes
                FROM valor_consumo_productos v
            """)

            print("   ✓ Rankings calculados\n")

        except Exception as e:
            print(f"   ✗ Error: {e}")
            sys.exit(1)

        # PASO 3: Asignar clasificación ABC
        print("⏳ Paso 3/5: Asignando clasificación ABC (Pareto 80/20)...")

        try:
            self.conn.execute(f"""
                CREATE OR REPLACE TEMP TABLE productos_con_clasificacion AS
                SELECT
                    r.*,
                    DATE '{fecha_inicio}' as fecha_inicio,
                    DATE '{fecha_fin}' as fecha_fin,
                    '{periodo}' as periodo_analisis,
                    CASE
                        WHEN DATE_DIFF('day', r.fecha_primera_venta, DATE '{fecha_fin}') < 30 THEN true
                        ELSE false
                    END as es_producto_nuevo,
                    CASE
                        WHEN NOT r.tiene_costo_valido THEN 'ERROR_COSTO'
                        WHEN COALESCE(r.valor_consumo_total, 0) = 0 THEN 'SIN_MOVIMIENTO'
                        WHEN DATE_DIFF('day', r.fecha_primera_venta, DATE '{fecha_fin}') < 30 THEN 'NUEVO'
                        WHEN r.porcentaje_acumulado <= 80.0 THEN 'A'
                        WHEN r.porcentaje_acumulado <= 95.0 THEN 'B'
                        ELSE 'C'
                    END as clasificacion_abc_valor
                FROM productos_con_ranking r
            """)

            stats = self.conn.execute("""
                SELECT
                    clasificacion_abc_valor,
                    COUNT(*) as num_productos
                FROM productos_con_clasificacion
                GROUP BY clasificacion_abc_valor
                ORDER BY
                    CASE clasificacion_abc_valor
                        WHEN 'A' THEN 1
                        WHEN 'B' THEN 2
                        WHEN 'C' THEN 3
                        ELSE 4
                    END
            """).fetchall()

            print("   Distribución:")
            for row in stats:
                print(f"   - Clase {row[0]}: {row[1]:,} productos")
            print()

        except Exception as e:
            print(f"   ✗ Error: {e}")
            sys.exit(1)

        # PASO 4: Preparar datos finales
        print("⏳ Paso 4/5: Preparando datos finales...")

        try:
            self.conn.execute("""
                CREATE OR REPLACE TEMP TABLE productos_abc_final AS
                SELECT
                    gen_random_uuid()::VARCHAR as id,
                    c.codigo_producto,
                    c.periodo_analisis,
                    c.fecha_inicio,
                    c.fecha_fin,
                    CURRENT_TIMESTAMP as fecha_calculo,
                    c.unidades_vendidas_total,
                    c.numero_transacciones,
                    c.numero_ubicaciones,
                    c.costo_promedio_ponderado,
                    c.costo_minimo,
                    c.costo_maximo,
                    c.desviacion_std_costo,
                    c.valor_consumo_total,
                    c.valor_venta_total,
                    c.margen_total,
                    c.clasificacion_abc_valor,
                    c.porcentaje_valor,
                    c.porcentaje_acumulado,
                    c.ranking_valor,
                    NULL as clasificacion_velocidad,
                    NULL as ranking_anterior,
                    NULL as cambio_ranking,
                    0.0 as concentracion_geografica,
                    c.tiene_costo_valido,
                    c.tiene_ventas_consistentes,
                    c.es_producto_nuevo,
                    '2.0' as version_calculo,
                    CASE
                        WHEN NOT c.tiene_costo_valido THEN 'Producto con costos inconsistentes'
                        WHEN c.es_producto_nuevo THEN 'Producto nuevo'
                        WHEN c.valor_consumo_total = 0 THEN 'Sin movimiento'
                        ELSE NULL
                    END as observaciones
                FROM productos_con_clasificacion c
            """)

            print("   ✓ Datos preparados\n")

        except Exception as e:
            print(f"   ✗ Error: {e}")
            sys.exit(1)

        # PASO 5: Guardar resultados
        if not dry_run:
            print("⏳ Paso 5/5: Guardando resultados...")

            try:
                # Eliminar cálculos anteriores del mismo periodo
                self.conn.execute(f"""
                    DELETE FROM productos_abc_v2
                    WHERE fecha_inicio = DATE '{fecha_inicio}'
                        AND fecha_fin = DATE '{fecha_fin}'
                """)

                # Insertar nuevos resultados
                self.conn.execute("""
                    INSERT INTO productos_abc_v2
                    SELECT * FROM productos_abc_final
                """)

                insertados = self.conn.execute("SELECT COUNT(*) FROM productos_abc_v2").fetchone()[0]
                print(f"   ✓ {insertados:,} productos guardados\n")

            except Exception as e:
                print(f"   ✗ Error al guardar: {e}")
                sys.exit(1)
        else:
            print("⏳ Paso 5/5: DRY-RUN - No se guardan cambios\n")

        # Mostrar resumen
        self._mostrar_resumen()

        return True

    def _mostrar_resumen(self):
        """Mostrar resumen de resultados."""
        print(f"\n{'=' * 70}")
        print("RESUMEN DE CLASIFICACIÓN ABC V2")
        print(f"{'=' * 70}\n")

        try:
            # Resumen por clasificación
            resultado = self.conn.execute("""
                SELECT
                    clasificacion_abc_valor,
                    COUNT(*) as num_productos,
                    ROUND(SUM(valor_consumo_total), 2) as valor_total,
                    ROUND(SUM(porcentaje_valor), 2) as porcentaje_total
                FROM productos_abc_final
                GROUP BY clasificacion_abc_valor
                ORDER BY
                    CASE clasificacion_abc_valor
                        WHEN 'A' THEN 1
                        WHEN 'B' THEN 2
                        WHEN 'C' THEN 3
                        ELSE 4
                    END
            """).fetchall()

            print(f"{'Clase':<15} {'Productos':<15} {'Valor Total':<20} {'% Valor':<15}")
            print("-" * 65)

            for row in resultado:
                print(f"{row[0]:<15} {row[1]:<15,} ${row[2]:<18,.2f} {row[3]:>6.2f}%")

            print()

            # TOP 10 productos
            top10 = self.conn.execute("""
                SELECT
                    ranking_valor,
                    codigo_producto,
                    clasificacion_abc_valor,
                    ROUND(valor_consumo_total, 2) as valor,
                    ROUND(porcentaje_acumulado, 2) as pct_acum
                FROM productos_abc_final
                WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
                ORDER BY ranking_valor
                LIMIT 10
            """).fetchall()

            print(f"\n{'=' * 70}")
            print("TOP 10 PRODUCTOS POR VALOR")
            print(f"{'=' * 70}\n")

            print(f"{'#':<5} {'Código':<20} {'Clase':<8} {'Valor':<18} {'% Acum':<10}")
            print("-" * 65)

            for row in top10:
                print(f"{row[0]:<5} {row[1]:<20} {row[2]:<8} ${row[3]:>15,.2f} {row[4]:>8.1f}%")

            print()

        except Exception as e:
            print(f"⚠ Error al generar resumen: {e}")


def main():
    """Función principal."""
    parser = argparse.ArgumentParser(
        description='Calcular ABC v2 - Adaptado para estructura real'
    )
    parser.add_argument('--periodo', choices=['TRIMESTRAL', 'SEMESTRAL', 'ANUAL'],
                        default='TRIMESTRAL')
    parser.add_argument('--meses', type=int, default=3)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--verbose', action='store_true')
    parser.add_argument('--crear-tablas', action='store_true')

    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"✗ No se encuentra la BD: {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    calculador = CalculadorABCv2Adaptado(str(DB_PATH), verbose=args.verbose)

    try:
        calculador.conectar()

        if args.crear_tablas:
            calculador.crear_tablas_abc_v2()

        exito = calculador.calcular_abc_v2(
            periodo=args.periodo,
            meses=args.meses,
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
