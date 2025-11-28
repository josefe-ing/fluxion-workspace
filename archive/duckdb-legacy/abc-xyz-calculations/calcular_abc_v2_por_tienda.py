#!/usr/bin/env python3
"""
Script para calcular la clasificación ABC v2 POR TIENDA.
Cada tienda tiene su propia matriz ABC basada en valor económico local.
"""

import duckdb
import argparse
import sys
import os
from pathlib import Path
from datetime import datetime, timedelta

# Usar DATABASE_PATH env var si está disponible, sino usar path por defecto
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.getenv('DATABASE_PATH', str(BASE_DIR / "data" / "fluxion_production.db")))


class CalculadorABCv2PorTienda:
    """Calculador ABC v2 por tienda."""

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
        """Obtener lista de tiendas."""
        result = self.conn.execute("""
            SELECT DISTINCT ubicacion_id, ubicacion_nombre
            FROM ventas_raw
            WHERE ubicacion_id IS NOT NULL
            ORDER BY ubicacion_id
        """).fetchall()
        return result

    def calcular_abc_v2_tienda(
        self,
        ubicacion_id: str,
        ubicacion_nombre: str,
        periodo: str = 'TRIMESTRAL',
        meses: int = 3
    ):
        """Calcular ABC v2 para una tienda específica."""

        if self.verbose:
            print(f"\n📍 Procesando: {ubicacion_nombre} ({ubicacion_id})")

        fecha_fin = datetime.now().date()
        fecha_inicio = fecha_fin - timedelta(days=meses * 30)

        # PASO 1: Calcular valor de consumo por producto EN ESTA TIENDA
        try:
            self.conn.execute(f"""
                CREATE OR REPLACE TEMP TABLE valor_consumo_productos_{ubicacion_id} AS
                SELECT
                    '{ubicacion_id}' as ubicacion_id,
                    codigo_producto,
                    COUNT(DISTINCT numero_factura) as numero_transacciones,
                    1 as numero_ubicaciones,  -- Solo esta tienda
                    MIN(CAST(fecha AS DATE)) as fecha_primera_venta,
                    MAX(CAST(fecha AS DATE)) as fecha_ultima_venta,

                    SUM(TRY_CAST(cantidad_vendida AS DECIMAL(18,4))) as unidades_vendidas_total,

                    AVG(TRY_CAST(costo_unitario AS DECIMAL(12,4))) as costo_promedio_ponderado,
                    MIN(TRY_CAST(costo_unitario AS DECIMAL(12,4))) as costo_minimo,
                    MAX(TRY_CAST(costo_unitario AS DECIMAL(12,4))) as costo_maximo,
                    STDDEV(TRY_CAST(costo_unitario AS DECIMAL(12,4))) as desviacion_std_costo,

                    SUM(TRY_CAST(costo_total AS DECIMAL(18,2))) as valor_consumo_total,
                    SUM(TRY_CAST(venta_total AS DECIMAL(18,2))) as valor_venta_total,
                    SUM(TRY_CAST(utilidad_bruta AS DECIMAL(18,2))) as margen_total,

                    COUNT(CASE WHEN TRY_CAST(costo_unitario AS DECIMAL) IS NULL OR TRY_CAST(costo_unitario AS DECIMAL) = 0 THEN 1 END) as transacciones_sin_costo,
                    COUNT(*) as total_transacciones

                FROM ventas_raw
                WHERE CAST(fecha AS DATE) BETWEEN DATE '{fecha_inicio}' AND DATE '{fecha_fin}'
                    AND ubicacion_id = '{ubicacion_id}'
                    AND codigo_producto IS NOT NULL
                    AND codigo_producto != ''
                GROUP BY codigo_producto
                HAVING SUM(TRY_CAST(cantidad_vendida AS DECIMAL)) > 0
            """)

            count = self.conn.execute(f"SELECT COUNT(*) FROM valor_consumo_productos_{ubicacion_id}").fetchone()[0]
            if self.verbose:
                print(f"   → {count:,} productos con ventas")

        except Exception as e:
            print(f"   ✗ Error en paso 1: {e}")
            return False

        # PASO 2: Calcular ranking y porcentajes (dentro de la tienda)
        try:
            self.conn.execute(f"""
                CREATE OR REPLACE TEMP TABLE productos_con_ranking_{ubicacion_id} AS
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
                FROM valor_consumo_productos_{ubicacion_id} v
            """)

        except Exception as e:
            print(f"   ✗ Error en paso 2: {e}")
            return False

        # PASO 3: Asignar clasificación ABC (Pareto 80/20)
        try:
            self.conn.execute(f"""
                CREATE OR REPLACE TEMP TABLE productos_con_clasificacion_{ubicacion_id} AS
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
                FROM productos_con_ranking_{ubicacion_id} r
            """)

        except Exception as e:
            print(f"   ✗ Error en paso 3: {e}")
            return False

        # PASO 4: Insertar en tabla principal
        try:
            self.conn.execute(f"""
                INSERT INTO productos_abc_v2 (
                    id, codigo_producto, ubicacion_id, periodo_analisis,
                    fecha_inicio, fecha_fin,
                    unidades_vendidas_total, numero_transacciones, numero_ubicaciones,
                    costo_promedio_ponderado, costo_minimo, costo_maximo, desviacion_std_costo,
                    valor_consumo_total, valor_venta_total, margen_total,
                    clasificacion_abc_valor, porcentaje_valor, porcentaje_acumulado, ranking_valor,
                    tiene_costo_valido, tiene_ventas_consistentes, es_producto_nuevo
                )
                SELECT
                    gen_random_uuid()::VARCHAR as id,
                    c.codigo_producto,
                    c.ubicacion_id,
                    c.periodo_analisis,
                    c.fecha_inicio,
                    c.fecha_fin,
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
                    c.tiene_costo_valido,
                    c.tiene_ventas_consistentes,
                    c.es_producto_nuevo
                FROM productos_con_clasificacion_{ubicacion_id} c
            """)

            if self.verbose:
                print(f"   ✓ Datos guardados")

        except Exception as e:
            print(f"   ✗ Error guardando: {e}")
            return False

        return True

    def _guardar_historico(self, fecha_inicio: str, fecha_fin: str):
        """Guardar histórico antes de borrar clasificaciones antiguas."""
        try:
            # Contar registros a archivar
            count = self.conn.execute(f"""
                SELECT COUNT(*) FROM productos_abc_v2
                WHERE fecha_inicio = DATE '{fecha_inicio}'
                    AND fecha_fin = DATE '{fecha_fin}'
            """).fetchone()[0]

            if count == 0:
                if self.verbose:
                    print("ℹ️  No hay registros antiguos para archivar")
                return 0

            # Guardar en histórico
            self.conn.execute(f"""
                INSERT INTO productos_abc_v2_historico (
                    id,
                    codigo_producto,
                    ubicacion_id,
                    periodo_analisis,
                    fecha_inicio,
                    fecha_fin,
                    fecha_calculo,
                    clasificacion_abc_valor,
                    valor_consumo_total,
                    ranking_valor,
                    porcentaje_valor,
                    porcentaje_acumulado
                )
                SELECT
                    gen_random_uuid()::VARCHAR as id,
                    codigo_producto,
                    ubicacion_id,
                    periodo_analisis,
                    fecha_inicio,
                    fecha_fin,
                    fecha_calculo,
                    clasificacion_abc_valor,
                    valor_consumo_total,
                    ranking_valor,
                    porcentaje_valor,
                    porcentaje_acumulado
                FROM productos_abc_v2
                WHERE fecha_inicio = DATE '{fecha_inicio}'
                    AND fecha_fin = DATE '{fecha_fin}'
                    AND clasificacion_abc_valor IN ('A', 'B', 'C')
            """)

            if self.verbose:
                print(f"📦 {count:,} registros archivados en histórico")

            return count

        except Exception as e:
            print(f"⚠️  Error guardando histórico: {e}")
            return 0

    def _detectar_cambios_clasificacion(self):
        """Detectar cambios en clasificaciones y registrarlos."""
        try:
            # Crear tabla temporal con clasificaciones anteriores
            self.conn.execute("""
                CREATE OR REPLACE TEMP TABLE clasificaciones_anteriores AS
                SELECT DISTINCT ON (codigo_producto, ubicacion_id)
                    codigo_producto,
                    ubicacion_id,
                    clasificacion_abc_valor,
                    valor_consumo_total,
                    ranking_valor,
                    fecha_calculo
                FROM productos_abc_v2_historico
                WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
                ORDER BY codigo_producto, ubicacion_id, fecha_calculo DESC
            """)

            # Detectar cambios comparando con la tabla actual
            cambios = self.conn.execute("""
                SELECT
                    actual.codigo_producto,
                    actual.ubicacion_id,
                    anterior.clasificacion_abc_valor as clasificacion_anterior,
                    actual.clasificacion_abc_valor as clasificacion_nueva,
                    anterior.valor_consumo_total as valor_anterior,
                    actual.valor_consumo_total as valor_nuevo,
                    anterior.ranking_valor as ranking_anterior,
                    actual.ranking_valor as ranking_nuevo,
                    CASE
                        WHEN anterior.valor_consumo_total > 0 THEN
                            ROUND(((actual.valor_consumo_total - anterior.valor_consumo_total) * 100.0 / anterior.valor_consumo_total)::DECIMAL, 2)
                        ELSE NULL
                    END as cambio_porcentual,
                    CASE
                        WHEN (anterior.clasificacion_abc_valor = 'A' AND actual.clasificacion_abc_valor = 'C')
                          OR (anterior.clasificacion_abc_valor = 'C' AND actual.clasificacion_abc_valor = 'A') THEN true
                        ELSE false
                    END as es_critico
                FROM productos_abc_v2 actual
                INNER JOIN clasificaciones_anteriores anterior
                    ON actual.codigo_producto = anterior.codigo_producto
                    AND actual.ubicacion_id = anterior.ubicacion_id
                WHERE actual.clasificacion_abc_valor IN ('A', 'B', 'C')
                    AND anterior.clasificacion_abc_valor != actual.clasificacion_abc_valor
            """).fetchall()

            if len(cambios) > 0:
                print(f"\n🔔 CAMBIOS DE CLASIFICACIÓN DETECTADOS: {len(cambios)}")
                print("=" * 70)

                criticos = sum(1 for c in cambios if c[9])  # es_critico
                if criticos > 0:
                    print(f"   🔴 Cambios críticos: {criticos}")

                # Mostrar algunos ejemplos
                for i, cambio in enumerate(cambios[:5]):
                    simbolo = "🔴" if cambio[9] else "🟡"
                    print(f"   {simbolo} {cambio[0][:20]:<20} [{cambio[1]}]: {cambio[2]} → {cambio[3]} ({cambio[8]:+.1f}%)")

                if len(cambios) > 5:
                    print(f"   ... y {len(cambios) - 5} cambios más")

                print()

            return len(cambios)

        except Exception as e:
            if self.verbose:
                print(f"⚠️  Error detectando cambios: {e}")
            return 0

    def calcular_todas_tiendas(self, periodo: str = 'TRIMESTRAL', meses: int = 3, dry_run: bool = False):
        """Calcular ABC v2 para todas las tiendas."""
        print(f"\n{'=' * 70}")
        print(f"CÁLCULO ABC V2 POR TIENDA - {periodo} ({meses} meses)")
        print(f"{'=' * 70}\n")

        # Obtener tiendas
        tiendas = self.obtener_tiendas()
        print(f"📍 Total tiendas a procesar: {len(tiendas)}\n")

        if dry_run:
            print("⚠️  DRY-RUN MODE - No se guardarán cambios\n")
            return True

        # Calcular fechas del periodo
        fecha_fin = datetime.now().date()
        fecha_inicio = fecha_fin - timedelta(days=meses * 30)

        # PASO NUEVO: Guardar histórico antes de borrar
        print("📦 Archivando clasificaciones antiguas...")
        self._guardar_historico(str(fecha_inicio), str(fecha_fin))

        # Limpiar datos anteriores del mismo periodo
        self.conn.execute(f"""
            DELETE FROM productos_abc_v2
            WHERE fecha_inicio = DATE '{fecha_inicio}'
                AND fecha_fin = DATE '{fecha_fin}'
        """)

        # Procesar cada tienda
        tiendas_exitosas = 0
        for ubicacion_id, ubicacion_nombre in tiendas:
            try:
                exito = self.calcular_abc_v2_tienda(
                    ubicacion_id,
                    ubicacion_nombre,
                    periodo,
                    meses
                )
                if exito:
                    tiendas_exitosas += 1
            except Exception as e:
                print(f"   ✗ Error procesando {ubicacion_nombre}: {e}")

        # PASO NUEVO: Detectar cambios en clasificaciones
        print("\n🔍 Detectando cambios de clasificación...")
        self._detectar_cambios_clasificacion()

        # Mostrar resumen
        self._mostrar_resumen(tiendas_exitosas, len(tiendas))

        return True

    def _mostrar_resumen(self, exitosas: int, total: int):
        """Mostrar resumen de resultados."""
        print(f"\n{'=' * 70}")
        print("RESUMEN GENERAL")
        print(f"{'=' * 70}\n")

        print(f"✓ Tiendas procesadas: {exitosas}/{total}\n")

        try:
            # Resumen por tienda
            resultado = self.conn.execute("""
                SELECT
                    p.ubicacion_id,
                    COUNT(*) as productos,
                    COUNT(CASE WHEN p.clasificacion_abc_valor = 'A' THEN 1 END) as clase_a,
                    COUNT(CASE WHEN p.clasificacion_abc_valor = 'B' THEN 1 END) as clase_b,
                    COUNT(CASE WHEN p.clasificacion_abc_valor = 'C' THEN 1 END) as clase_c,
                    ROUND(SUM(p.valor_consumo_total), 2) as valor_total
                FROM productos_abc_v2 p
                WHERE p.clasificacion_abc_valor IN ('A', 'B', 'C')
                GROUP BY p.ubicacion_id
                ORDER BY p.ubicacion_id
            """).fetchall()

            print(f"{'Tienda':<12} {'Productos':<10} {'A':<6} {'B':<6} {'C':<6} {'Valor Total'}")
            print("-" * 70)

            for row in resultado:
                print(f"{row[0]:<12} {row[1]:<10,} {row[2]:<6} {row[3]:<6} {row[4]:<6} ${row[5]:>15,.2f}")

            print()

        except Exception as e:
            print(f"⚠ Error al generar resumen: {e}")


def main():
    """Función principal."""
    parser = argparse.ArgumentParser(
        description='Calcular ABC v2 por tienda'
    )
    parser.add_argument('--periodo', choices=['TRIMESTRAL', 'SEMESTRAL', 'ANUAL'],
                        default='TRIMESTRAL')
    parser.add_argument('--meses', type=int, default=3)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--verbose', action='store_true')

    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"✗ No se encuentra la BD: {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    calculador = CalculadorABCv2PorTienda(str(DB_PATH), verbose=args.verbose)

    try:
        calculador.conectar()

        exito = calculador.calcular_todas_tiendas(
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
