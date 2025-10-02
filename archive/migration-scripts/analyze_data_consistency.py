#!/usr/bin/env python3
"""
Análisis de consistencia de datos de ventas por tienda y por día
Verifica gaps, anomalías, volúmenes inusuales y calidad de datos
"""
import duckdb
import sys
from datetime import datetime

def format_number(num):
    """Formatea números con separadores"""
    return f"{num:,}"

def main():
    db_path = 'data/fluxion_production.db'

    print("=" * 80)
    print("ANÁLISIS DE CONSISTENCIA DE DATOS - VENTAS POR TIENDA Y DÍA")
    print("=" * 80)
    print(f"Base de datos: {db_path}")
    print(f"Inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    try:
        conn = duckdb.connect(db_path, read_only=True)

        # ========================================================================
        # 1. OVERVIEW GENERAL
        # ========================================================================
        print("=" * 80)
        print("1. RESUMEN GENERAL DE DATOS")
        print("=" * 80)

        query = """
            SELECT
                COUNT(*) as total_registros,
                COUNT(DISTINCT ubicacion_id) as total_ubicaciones,
                COUNT(DISTINCT fecha) as total_dias,
                MIN(fecha) as fecha_minima,
                MAX(fecha) as fecha_maxima,
                COUNT(DISTINCT numero_factura || ubicacion_id) as facturas_unicas
            FROM ventas_raw
        """

        overview = conn.execute(query).fetchone()
        print(f"\n📊 Datos Generales:")
        print(f"   Total de registros: {format_number(overview[0])}")
        print(f"   Ubicaciones: {overview[1]}")
        print(f"   Días con datos: {overview[2]}")
        print(f"   Rango de fechas: {overview[3]} → {overview[4]}")
        print(f"   Facturas únicas: {format_number(overview[5])}")

        # ========================================================================
        # 2. COBERTURA POR TIENDA (días con datos)
        # ========================================================================
        print("\n" + "=" * 80)
        print("2. COBERTURA DE DATOS POR TIENDA")
        print("=" * 80)

        query = """
            SELECT
                ubicacion_id,
                ubicacion_nombre,
                COUNT(DISTINCT fecha) as dias_con_datos,
                MIN(fecha) as primera_fecha,
                MAX(fecha) as ultima_fecha,
                COUNT(*) as total_registros,
                COUNT(DISTINCT numero_factura) as total_facturas,
                ROUND(COUNT(*) * 1.0 / COUNT(DISTINCT fecha), 0) as registros_promedio_dia
            FROM ventas_raw
            GROUP BY ubicacion_id, ubicacion_nombre
            ORDER BY ubicacion_id
        """

        cobertura = conn.execute(query).fetchall()
        print(f"\n📅 Cobertura por Tienda:")
        print(f"\n{'Ubicación':<15} {'Nombre':<25} {'Días':>6} {'Registros':>12} {'Facturas':>10} {'Prom/Día':>10}")
        print("-" * 80)

        for row in cobertura:
            print(f"{row[0]:<15} {row[1]:<25} {row[2]:>6} {format_number(row[5]):>12} {format_number(row[6]):>10} {format_number(int(row[7])):>10}")

        # Detectar tiendas con poca cobertura
        dias_esperados = overview[2]
        print(f"\n⚠️  Tiendas con cobertura incompleta (< 90% de {dias_esperados} días):")
        for row in cobertura:
            cobertura_pct = (row[2] / dias_esperados) * 100
            if cobertura_pct < 90:
                print(f"   {row[0]} ({row[1]}): {row[2]} días ({cobertura_pct:.1f}% cobertura)")

        # ========================================================================
        # 3. ANÁLISIS DE GAPS (días sin datos)
        # ========================================================================
        print("\n" + "=" * 80)
        print("3. ANÁLISIS DE GAPS - DÍAS SIN DATOS")
        print("=" * 80)

        # Crear calendario completo y detectar gaps
        query = """
            WITH fecha_rango AS (
                SELECT MIN(fecha) as min_fecha, MAX(fecha) as max_fecha
                FROM ventas_raw
            ),
            calendario AS (
                SELECT DATE '2024-01-01' + INTERVAL (d) DAY as fecha
                FROM generate_series(0, 365) as t(d)
            ),
            ventas_por_dia AS (
                SELECT
                    ubicacion_id,
                    ubicacion_nombre,
                    fecha,
                    COUNT(*) as registros,
                    COUNT(DISTINCT numero_factura) as facturas
                FROM ventas_raw
                GROUP BY ubicacion_id, ubicacion_nombre, fecha
            )
            SELECT
                u.ubicacion_id,
                u.ubicacion_nombre,
                c.fecha
            FROM (SELECT DISTINCT ubicacion_id, ubicacion_nombre FROM ventas_raw) u
            CROSS JOIN calendario c
            LEFT JOIN ventas_por_dia v
                ON u.ubicacion_id = v.ubicacion_id
                AND c.fecha = v.fecha
            WHERE c.fecha BETWEEN (SELECT min_fecha FROM fecha_rango)
                AND (SELECT max_fecha FROM fecha_rango)
                AND v.fecha IS NULL
            ORDER BY u.ubicacion_id, c.fecha
        """

        gaps_por_tienda = {}
        try:
            gaps = conn.execute(query).fetchall()

            # Agrupar gaps por tienda
            for gap in gaps:
                ubicacion = gap[0]
                if ubicacion not in gaps_por_tienda:
                    gaps_por_tienda[ubicacion] = []
                gaps_por_tienda[ubicacion].append(gap[2])

            if gaps_por_tienda:
                print(f"\n⚠️  Se encontraron {len(gaps)} días sin datos:")
                for ubicacion, fechas in sorted(gaps_por_tienda.items())[:10]:
                    print(f"\n   {ubicacion}: {len(fechas)} días sin datos")
                    # Mostrar primeros 5 gaps
                    for fecha in fechas[:5]:
                        print(f"      - {fecha}")
                    if len(fechas) > 5:
                        print(f"      ... y {len(fechas) - 5} días más")
            else:
                print("\n✓ No se encontraron gaps - todas las tiendas tienen datos todos los días")
        except Exception as e:
            print(f"\n⚠️  No se pudo analizar gaps: {e}")

        # ========================================================================
        # 4. CONSISTENCIA DIARIA - VARIACIONES ANORMALES
        # ========================================================================
        print("\n" + "=" * 80)
        print("4. DETECCIÓN DE ANOMALÍAS EN VOLUMEN DIARIO")
        print("=" * 80)

        query = """
            WITH ventas_diarias AS (
                SELECT
                    ubicacion_id,
                    ubicacion_nombre,
                    fecha,
                    COUNT(*) as registros,
                    COUNT(DISTINCT numero_factura) as facturas,
                    SUM(CAST(venta_total AS DECIMAL)) as venta_total
                FROM ventas_raw
                GROUP BY ubicacion_id, ubicacion_nombre, fecha
            ),
            estadisticas_tienda AS (
                SELECT
                    ubicacion_id,
                    AVG(registros) as avg_registros,
                    STDDEV(registros) as stddev_registros,
                    AVG(facturas) as avg_facturas,
                    STDDEV(facturas) as stddev_facturas,
                    AVG(venta_total) as avg_venta,
                    STDDEV(venta_total) as stddev_venta
                FROM ventas_diarias
                GROUP BY ubicacion_id
            )
            SELECT
                v.ubicacion_id,
                v.ubicacion_nombre,
                v.fecha,
                v.registros,
                v.facturas,
                v.venta_total,
                s.avg_registros,
                s.avg_facturas,
                s.avg_venta,
                ROUND((v.registros - s.avg_registros) / NULLIF(s.stddev_registros, 0), 2) as z_score_registros,
                ROUND((v.facturas - s.avg_facturas) / NULLIF(s.stddev_facturas, 0), 2) as z_score_facturas,
                ROUND((v.venta_total - s.avg_venta) / NULLIF(s.stddev_venta, 0), 2) as z_score_venta
            FROM ventas_diarias v
            INNER JOIN estadisticas_tienda s ON v.ubicacion_id = s.ubicacion_id
            WHERE ABS((v.registros - s.avg_registros) / NULLIF(s.stddev_registros, 0)) > 3
               OR ABS((v.facturas - s.avg_facturas) / NULLIF(s.stddev_facturas, 0)) > 3
            ORDER BY ABS((v.registros - s.avg_registros) / NULLIF(s.stddev_registros, 0)) DESC
            LIMIT 20
        """

        anomalias = conn.execute(query).fetchall()

        if anomalias:
            print(f"\n⚠️  Días con volumen anormal (Z-score > 3):")
            print(f"\n{'Ubicación':<15} {'Fecha':<12} {'Registros':>10} {'Promedio':>10} {'Z-Score':>8}")
            print("-" * 80)

            for row in anomalias[:15]:
                print(f"{row[0]:<15} {row[2]} {format_number(row[3]):>10} {format_number(int(row[6])):>10} {row[9]:>8.2f}")
        else:
            print("\n✓ No se detectaron anomalías significativas en volumen diario")

        # ========================================================================
        # 5. CALIDAD DE DATOS - VALORES NULL Y VACÍOS
        # ========================================================================
        print("\n" + "=" * 80)
        print("5. ANÁLISIS DE CALIDAD DE DATOS")
        print("=" * 80)

        campos_criticos = [
            'ubicacion_id', 'numero_factura', 'linea', 'fecha',
            'codigo_producto', 'descripcion_producto', 'cantidad_vendida',
            'precio_unitario', 'venta_total'
        ]

        print(f"\n📋 Campos críticos con valores NULL:")
        tiene_nulls = False

        for campo in campos_criticos:
            query = f"""
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN {campo} IS NULL THEN 1 ELSE 0 END) as nulls,
                    ROUND(SUM(CASE WHEN {campo} IS NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as pct_nulls
                FROM ventas_raw
            """

            result = conn.execute(query).fetchone()
            if result[1] > 0:
                tiene_nulls = True
                print(f"   {campo:25s}: {format_number(result[1]):>10} nulls ({result[2]:>5.2f}%)")

        if not tiene_nulls:
            print("   ✓ No se encontraron valores NULL en campos críticos")

        # Detectar valores inválidos
        print(f"\n⚠️  Valores potencialmente inválidos:")

        # Cantidades negativas o cero
        query = """
            SELECT COUNT(*)
            FROM ventas_raw
            WHERE CAST(cantidad_vendida AS DECIMAL) <= 0
        """
        neg_cant = conn.execute(query).fetchone()[0]
        if neg_cant > 0:
            print(f"   Cantidad vendida <= 0: {format_number(neg_cant)} registros")

        # Precios negativos o cero
        query = """
            SELECT COUNT(*)
            FROM ventas_raw
            WHERE CAST(precio_unitario AS DECIMAL) <= 0
        """
        neg_precio = conn.execute(query).fetchone()[0]
        if neg_precio > 0:
            print(f"   Precio unitario <= 0: {format_number(neg_precio)} registros")

        # Ventas negativas
        query = """
            SELECT COUNT(*)
            FROM ventas_raw
            WHERE CAST(venta_total AS DECIMAL) < 0
        """
        neg_venta = conn.execute(query).fetchone()[0]
        if neg_venta > 0:
            print(f"   Venta total < 0: {format_number(neg_venta)} registros")

        # ========================================================================
        # 6. RESUMEN POR TIENDA Y SEMANA
        # ========================================================================
        print("\n" + "=" * 80)
        print("6. RESUMEN SEMANAL POR TIENDA")
        print("=" * 80)

        query = """
            SELECT
                ubicacion_id,
                ubicacion_nombre,
                STRFTIME(CAST(fecha AS DATE), '%Y-W%W') as semana,
                COUNT(DISTINCT fecha) as dias_operados,
                COUNT(*) as total_registros,
                COUNT(DISTINCT numero_factura) as total_facturas,
                ROUND(SUM(CAST(venta_total AS DECIMAL)), 2) as venta_total_semana,
                ROUND(AVG(CAST(venta_total AS DECIMAL)), 2) as ticket_promedio
            FROM ventas_raw
            GROUP BY ubicacion_id, ubicacion_nombre, semana
            ORDER BY ubicacion_id, semana DESC
        """

        semanal = conn.execute(query).fetchall()

        # Mostrar últimas 4 semanas de cada tienda
        print(f"\n📅 Últimas semanas por tienda:")

        ubicaciones_mostradas = set()
        for row in semanal:
            ubicacion = row[0]
            if ubicacion not in ubicaciones_mostradas:
                print(f"\n{row[0]} - {row[1]}:")
                ubicaciones_mostradas.add(ubicacion)

            # Mostrar solo últimas 4 semanas de cada tienda
            count = sum(1 for r in semanal if r[0] == ubicacion and semanal.index(r) <= semanal.index(row))
            if count <= 4:
                print(f"   {row[2]}: {row[3]} días, {format_number(row[4])} registros, "
                      f"{format_number(row[5])} facturas, ${row[6]:,.2f} ventas")

        # ========================================================================
        # 7. COMPARACIÓN ENTRE TIENDAS (mismo período)
        # ========================================================================
        print("\n" + "=" * 80)
        print("7. COMPARACIÓN ENTRE TIENDAS (últimos 30 días)")
        print("=" * 80)

        query = """
            WITH ultimos_30_dias AS (
                SELECT CAST(MAX(CAST(fecha AS DATE)) AS DATE) - INTERVAL '30 days' as fecha_inicio,
                       CAST(MAX(CAST(fecha AS DATE)) AS DATE) as fecha_fin
                FROM ventas_raw
            )
            SELECT
                ubicacion_id,
                ubicacion_nombre,
                COUNT(DISTINCT fecha) as dias_con_datos,
                COUNT(*) as total_registros,
                COUNT(DISTINCT numero_factura) as total_facturas,
                ROUND(SUM(CAST(venta_total AS DECIMAL)), 2) as venta_total,
                ROUND(AVG(CAST(venta_total AS DECIMAL)), 2) as ticket_promedio,
                ROUND(COUNT(*) * 1.0 / COUNT(DISTINCT fecha), 0) as registros_por_dia
            FROM ventas_raw, ultimos_30_dias
            WHERE CAST(fecha AS DATE) >= ultimos_30_dias.fecha_inicio
              AND CAST(fecha AS DATE) <= ultimos_30_dias.fecha_fin
            GROUP BY ubicacion_id, ubicacion_nombre
            ORDER BY venta_total DESC
        """

        comparacion = conn.execute(query).fetchall()

        print(f"\n🏆 Ranking por ventas (últimos 30 días):")
        print(f"\n{'#':<3} {'Ubicación':<15} {'Nombre':<25} {'Días':>5} {'Ventas':>12} {'Facturas':>10}")
        print("-" * 80)

        for idx, row in enumerate(comparacion, 1):
            print(f"{idx:<3} {row[0]:<15} {row[1]:<25} {row[2]:>5} ${row[5]:>11,.2f} {format_number(row[4]):>10}")

        # ========================================================================
        # 8. CONSISTENCIA DE TIMESTAMPS
        # ========================================================================
        print("\n" + "=" * 80)
        print("8. CONSISTENCIA DE TIMESTAMPS")
        print("=" * 80)

        query = """
            SELECT
                ubicacion_id,
                COUNT(*) as total_registros,
                COUNT(CASE WHEN fecha_carga IS NULL THEN 1 END) as sin_fecha_carga,
                COUNT(CASE WHEN fecha_extraccion IS NULL THEN 1 END) as sin_fecha_extraccion,
                MIN(fecha_carga) as primera_carga,
                MAX(fecha_carga) as ultima_carga,
                COUNT(DISTINCT DATE(fecha_carga)) as dias_distintos_carga
            FROM ventas_raw
            GROUP BY ubicacion_id
            ORDER BY ubicacion_id
        """

        timestamps = conn.execute(query).fetchall()

        print(f"\n📅 Fechas de carga ETL por tienda:")
        print(f"\n{'Ubicación':<15} {'Registros':>12} {'Primera Carga':<20} {'Última Carga':<20} {'Días Carga':>11}")
        print("-" * 80)

        for row in timestamps:
            print(f"{row[0]:<15} {format_number(row[1]):>12} {str(row[4]):<20} {str(row[5]):<20} {row[6]:>11}")

        # ========================================================================
        # RESUMEN FINAL
        # ========================================================================
        print("\n" + "=" * 80)
        print("📊 RESUMEN DE CONSISTENCIA")
        print("=" * 80)

        total_ubicaciones = len(cobertura)
        ubicaciones_completas = sum(1 for r in cobertura if (r[2] / dias_esperados) >= 0.9)

        print(f"\n✓ Tiendas con buena cobertura (≥90%): {ubicaciones_completas}/{total_ubicaciones}")

        if not gaps_por_tienda:
            print(f"✓ Sin gaps detectados en el rango de fechas")
        else:
            print(f"⚠️  Gaps detectados: {len(gaps)} días sin datos")

        if not anomalias:
            print(f"✓ Sin anomalías significativas en volumen")
        else:
            print(f"⚠️  {len(anomalias)} días con volumen anormal")

        if not tiene_nulls:
            print(f"✓ Sin valores NULL en campos críticos")

        print("\n" + "=" * 80)
        print(f"Fin: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)

        conn.close()

    except Exception as e:
        print(f"\n❌ Error fatal: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
