#!/usr/bin/env python3
"""
Análisis de huecos (gaps) en los datos de ventas
Genera visualizaciones de cobertura temporal por tienda
"""
import duckdb
import sys
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np

def format_number(num):
    """Formatea números con separadores"""
    return f"{num:,}"

def main():
    db_path = 'data/fluxion_production.db'

    print("=" * 80)
    print("ANÁLISIS DE HUECOS (GAPS) EN DATOS DE VENTAS")
    print("=" * 80)
    print(f"Base de datos: {db_path}")
    print(f"Inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    try:
        conn = duckdb.connect(db_path, read_only=True)

        # ====================================================================
        # 1. OBTENER RANGO COMPLETO DE FECHAS
        # ====================================================================
        query = """
            SELECT
                MIN(CAST(fecha AS DATE)) as fecha_min,
                MAX(CAST(fecha AS DATE)) as fecha_max,
                COUNT(DISTINCT fecha) as dias_con_datos
            FROM ventas_raw
        """

        resultado = conn.execute(query).fetchone()
        fecha_min = resultado[0]
        fecha_max = resultado[1]
        dias_con_datos = resultado[2]

        # Calcular días esperados
        dias_esperados = (fecha_max - fecha_min).days + 1

        print(f"📅 Rango de datos:")
        print(f"   Fecha mínima: {fecha_min}")
        print(f"   Fecha máxima: {fecha_max}")
        print(f"   Días esperados: {dias_esperados}")
        print(f"   Días con datos: {dias_con_datos}")
        print(f"   Gaps totales: {dias_esperados - dias_con_datos}")

        # ====================================================================
        # 2. ANÁLISIS DE GAPS POR TIENDA
        # ====================================================================
        print("\n" + "=" * 80)
        print("ANÁLISIS DE GAPS POR TIENDA")
        print("=" * 80)

        # Obtener todas las ubicaciones
        query = """
            SELECT DISTINCT ubicacion_id, ubicacion_nombre
            FROM ventas_raw
            ORDER BY ubicacion_id
        """

        ubicaciones = conn.execute(query).fetchall()

        # Crear matriz de cobertura
        gaps_data = {}

        for ubicacion_id, ubicacion_nombre in ubicaciones:
            print(f"\n🏪 {ubicacion_id} - {ubicacion_nombre}")

            # Obtener fechas con datos para esta ubicación
            query = f"""
                SELECT DISTINCT CAST(fecha AS DATE) as fecha
                FROM ventas_raw
                WHERE ubicacion_id = '{ubicacion_id}'
                ORDER BY fecha
            """

            fechas_con_datos = [row[0] for row in conn.execute(query).fetchall()]

            # Encontrar gaps
            gaps = []
            fecha_anterior = None

            for fecha in fechas_con_datos:
                if fecha_anterior is not None:
                    dias_diferencia = (fecha - fecha_anterior).days
                    if dias_diferencia > 1:
                        # Hay un gap
                        gap_inicio = fecha_anterior + timedelta(days=1)
                        gap_fin = fecha - timedelta(days=1)
                        gap_dias = dias_diferencia - 1
                        gaps.append({
                            'inicio': gap_inicio,
                            'fin': gap_fin,
                            'dias': gap_dias
                        })
                        print(f"   ⚠️  Gap de {gap_dias} días: {gap_inicio} → {gap_fin}")

                fecha_anterior = fecha

            # Estadísticas
            total_dias_con_datos = len(fechas_con_datos)
            total_gaps = sum(g['dias'] for g in gaps)
            cobertura_pct = (total_dias_con_datos / dias_esperados) * 100

            print(f"   Días con datos: {total_dias_con_datos}/{dias_esperados} ({cobertura_pct:.1f}%)")
            print(f"   Gaps encontrados: {len(gaps)} periodos, {total_gaps} días totales")

            gaps_data[ubicacion_id] = {
                'nombre': ubicacion_nombre,
                'fechas_con_datos': fechas_con_datos,
                'gaps': gaps,
                'total_dias': total_dias_con_datos,
                'total_gaps': total_gaps,
                'cobertura_pct': cobertura_pct
            }

        # ====================================================================
        # 3. ANÁLISIS DE VOLUMEN DIARIO POR TIENDA
        # ====================================================================
        print("\n" + "=" * 80)
        print("OBTENIENDO DATOS PARA VISUALIZACIÓN")
        print("=" * 80)

        volumen_data = {}

        for ubicacion_id, ubicacion_nombre in ubicaciones:
            query = f"""
                SELECT
                    CAST(fecha AS DATE) as fecha,
                    COUNT(*) as num_registros,
                    COUNT(DISTINCT numero_factura) as num_facturas,
                    ROUND(SUM(CAST(venta_total AS DECIMAL)), 2) as venta_total
                FROM ventas_raw
                WHERE ubicacion_id = '{ubicacion_id}'
                GROUP BY fecha
                ORDER BY fecha
            """

            datos = conn.execute(query).fetchall()
            volumen_data[ubicacion_id] = {
                'nombre': ubicacion_nombre,
                'datos': datos
            }

        # ====================================================================
        # 4. GENERAR GRÁFICOS
        # ====================================================================
        print("\n" + "=" * 80)
        print("GENERANDO GRÁFICOS")
        print("=" * 80)

        # Gráfico 1: Mapa de calor de cobertura
        print("\n📊 Generando gráfico 1: Mapa de cobertura temporal...")

        fig, ax = plt.subplots(figsize=(20, 10))

        # Crear lista de todas las fechas
        fecha_actual = fecha_min
        todas_fechas = []
        while fecha_actual <= fecha_max:
            todas_fechas.append(fecha_actual)
            fecha_actual += timedelta(days=1)

        # Crear matriz de cobertura
        ubicaciones_ordenadas = sorted(ubicaciones, key=lambda x: x[0])
        matriz_cobertura = []
        etiquetas_y = []

        for ubicacion_id, ubicacion_nombre in ubicaciones_ordenadas:
            fechas_con_datos = set(gaps_data[ubicacion_id]['fechas_con_datos'])
            fila = [1 if fecha in fechas_con_datos else 0 for fecha in todas_fechas]
            matriz_cobertura.append(fila)
            etiquetas_y.append(f"{ubicacion_id}\n{ubicacion_nombre}")

        # Plotear mapa de calor
        im = ax.imshow(matriz_cobertura, aspect='auto', cmap='RdYlGn', interpolation='nearest')

        # Configurar ejes
        ax.set_yticks(range(len(etiquetas_y)))
        ax.set_yticklabels(etiquetas_y, fontsize=8)

        # Configurar eje X con fechas
        num_fechas = len(todas_fechas)
        step = max(num_fechas // 20, 1)  # Mostrar ~20 etiquetas
        xticks_pos = range(0, num_fechas, step)
        xticks_labels = [todas_fechas[i].strftime('%Y-%m-%d') for i in xticks_pos]
        ax.set_xticks(xticks_pos)
        ax.set_xticklabels(xticks_labels, rotation=45, ha='right', fontsize=8)

        # Título y etiquetas
        ax.set_title('Mapa de Cobertura de Datos por Tienda y Fecha\n(Verde = Datos disponibles, Rojo = Sin datos)',
                     fontsize=14, fontweight='bold', pad=20)
        ax.set_xlabel('Fecha', fontsize=10)
        ax.set_ylabel('Tienda', fontsize=10)

        # Agregar colorbar
        cbar = plt.colorbar(im, ax=ax)
        cbar.set_label('Disponibilidad', rotation=270, labelpad=15)

        plt.tight_layout()
        plt.savefig('grafico_cobertura_temporal.png', dpi=150, bbox_inches='tight')
        print("   ✓ Guardado: grafico_cobertura_temporal.png")
        plt.close()

        # Gráfico 2: Volumen diario de transacciones por tienda (selección)
        print("\n📊 Generando gráfico 2: Volumen diario de transacciones...")

        # Seleccionar top 6 tiendas por volumen
        tiendas_top = sorted(
            [(uid, gaps_data[uid]['total_dias']) for uid, _ in ubicaciones],
            key=lambda x: x[1],
            reverse=True
        )[:6]

        fig, axes = plt.subplots(3, 2, figsize=(16, 12))
        axes = axes.flatten()

        for idx, (ubicacion_id, _) in enumerate(tiendas_top):
            ax = axes[idx]
            datos = volumen_data[ubicacion_id]['datos']
            nombre = volumen_data[ubicacion_id]['nombre']

            fechas = [d[0] for d in datos]
            num_registros = [d[1] for d in datos]

            ax.plot(fechas, num_registros, linewidth=1, color='#2E86AB')
            ax.fill_between(fechas, num_registros, alpha=0.3, color='#2E86AB')

            ax.set_title(f'{ubicacion_id} - {nombre}', fontsize=10, fontweight='bold')
            ax.set_xlabel('Fecha', fontsize=8)
            ax.set_ylabel('Registros diarios', fontsize=8)
            ax.grid(True, alpha=0.3)
            ax.tick_params(axis='both', labelsize=7)

            # Rotar etiquetas de fecha
            for label in ax.get_xticklabels():
                label.set_rotation(45)
                label.set_ha('right')

        plt.suptitle('Volumen Diario de Transacciones por Tienda (Top 6)',
                     fontsize=14, fontweight='bold', y=0.995)
        plt.tight_layout()
        plt.savefig('grafico_volumen_diario.png', dpi=150, bbox_inches='tight')
        print("   ✓ Guardado: grafico_volumen_diario.png")
        plt.close()

        # Gráfico 3: Porcentaje de cobertura por tienda
        print("\n📊 Generando gráfico 3: Cobertura por tienda...")

        fig, ax = plt.subplots(figsize=(14, 8))

        # Ordenar por cobertura
        tiendas_ordenadas = sorted(
            [(uid, gaps_data[uid]['cobertura_pct'], gaps_data[uid]['nombre'])
             for uid, _ in ubicaciones],
            key=lambda x: x[1],
            reverse=True
        )

        ubicaciones_labels = [f"{t[0]}\n{t[2]}" for t in tiendas_ordenadas]
        coberturas = [t[1] for t in tiendas_ordenadas]

        # Colores según cobertura
        colores = ['#2ECC71' if c >= 90 else '#F39C12' if c >= 70 else '#E74C3C' for c in coberturas]

        bars = ax.barh(ubicaciones_labels, coberturas, color=colores, edgecolor='black', linewidth=0.5)

        # Agregar valores en las barras
        for i, (bar, valor) in enumerate(zip(bars, coberturas)):
            width = bar.get_width()
            ax.text(width + 1, bar.get_y() + bar.get_height()/2,
                   f'{valor:.1f}%',
                   ha='left', va='center', fontsize=9, fontweight='bold')

        # Líneas de referencia
        ax.axvline(x=90, color='green', linestyle='--', linewidth=1, alpha=0.5, label='90% (Óptimo)')
        ax.axvline(x=70, color='orange', linestyle='--', linewidth=1, alpha=0.5, label='70% (Aceptable)')

        ax.set_xlabel('Porcentaje de Cobertura (%)', fontsize=11, fontweight='bold')
        ax.set_ylabel('Tienda', fontsize=11, fontweight='bold')
        ax.set_title('Cobertura de Datos por Tienda\n(% de días con datos sobre el total del período)',
                     fontsize=13, fontweight='bold', pad=15)
        ax.set_xlim(0, 105)
        ax.grid(axis='x', alpha=0.3)
        ax.legend(loc='lower right')

        plt.tight_layout()
        plt.savefig('grafico_cobertura_por_tienda.png', dpi=150, bbox_inches='tight')
        print("   ✓ Guardado: grafico_cobertura_por_tienda.png")
        plt.close()

        # Gráfico 4: Timeline de gaps por tienda
        print("\n📊 Generando gráfico 4: Timeline de gaps...")

        fig, ax = plt.subplots(figsize=(18, 10))

        y_pos = 0
        y_labels = []
        y_positions = []

        for ubicacion_id, ubicacion_nombre in sorted(ubicaciones, key=lambda x: x[0]):
            gaps = gaps_data[ubicacion_id]['gaps']

            # Dibujar línea de tiempo completa (fondo)
            ax.plot([fecha_min, fecha_max], [y_pos, y_pos],
                   color='lightgreen', linewidth=8, alpha=0.3, solid_capstyle='round')

            # Dibujar gaps en rojo
            for gap in gaps:
                ax.plot([gap['inicio'], gap['fin']], [y_pos, y_pos],
                       color='red', linewidth=8, solid_capstyle='round')

                # Agregar etiqueta para gaps grandes
                if gap['dias'] > 10:
                    mid_date = gap['inicio'] + (gap['fin'] - gap['inicio']) / 2
                    ax.text(mid_date, y_pos + 0.3, f"{gap['dias']}d",
                           ha='center', va='bottom', fontsize=7,
                           bbox=dict(boxstyle='round,pad=0.3', facecolor='yellow', alpha=0.7))

            y_labels.append(f"{ubicacion_id} - {ubicacion_nombre}")
            y_positions.append(y_pos)
            y_pos += 1

        ax.set_yticks(y_positions)
        ax.set_yticklabels(y_labels, fontsize=8)
        ax.set_xlabel('Fecha', fontsize=11, fontweight='bold')
        ax.set_title('Timeline de Gaps (Huecos) en Datos por Tienda\n(Verde = Datos disponibles, Rojo = Gaps)',
                     fontsize=13, fontweight='bold', pad=15)

        # Formatear eje X
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
        ax.xaxis.set_major_locator(mdates.MonthLocator())
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=45, ha='right', fontsize=8)

        ax.grid(axis='x', alpha=0.3)
        ax.set_ylim(-0.5, y_pos - 0.5)

        plt.tight_layout()
        plt.savefig('grafico_timeline_gaps.png', dpi=150, bbox_inches='tight')
        print("   ✓ Guardado: grafico_timeline_gaps.png")
        plt.close()

        # ====================================================================
        # RESUMEN FINAL
        # ====================================================================
        print("\n" + "=" * 80)
        print("📊 RESUMEN DE ANÁLISIS DE GAPS")
        print("=" * 80)

        total_gaps_todos = sum(gaps_data[uid]['total_gaps'] for uid, _ in ubicaciones)
        tiendas_sin_gaps = sum(1 for uid, _ in ubicaciones if len(gaps_data[uid]['gaps']) == 0)

        print(f"\n📈 Estadísticas generales:")
        print(f"   Total de tiendas: {len(ubicaciones)}")
        print(f"   Tiendas sin gaps: {tiendas_sin_gaps}")
        print(f"   Tiendas con gaps: {len(ubicaciones) - tiendas_sin_gaps}")
        print(f"   Total de días con gaps (todas las tiendas): {total_gaps_todos}")

        # Tiendas con más gaps
        print(f"\n⚠️  Top 5 tiendas con más gaps:")
        top_gaps = sorted(
            [(uid, gaps_data[uid]['nombre'], gaps_data[uid]['total_gaps'], gaps_data[uid]['cobertura_pct'])
             for uid, _ in ubicaciones],
            key=lambda x: x[2],
            reverse=True
        )[:5]

        for uid, nombre, total, cobertura in top_gaps:
            print(f"   {uid:15s} ({nombre:30s}): {total:3d} días faltantes ({cobertura:.1f}% cobertura)")

        print(f"\n✅ Gráficos generados:")
        print(f"   1. grafico_cobertura_temporal.png - Mapa de calor de disponibilidad")
        print(f"   2. grafico_volumen_diario.png - Tendencias de volumen diario")
        print(f"   3. grafico_cobertura_por_tienda.png - Ranking de cobertura")
        print(f"   4. grafico_timeline_gaps.png - Visualización temporal de gaps")

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
