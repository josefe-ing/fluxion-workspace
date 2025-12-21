#!/usr/bin/env python3
"""
Script de prueba para comparar rendimiento ANTES vs DESPUÉS de optimización COPY
"""

import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

# Añadir directorio core al path
sys.path.insert(0, str(Path(__file__).parent / 'core'))

from etl_ventas import VentasETL
from config import ETLConfig

def main():
    """Ejecuta ETL de ventas optimizado y mide tiempos"""

    print("=" * 80)
    print("🧪 TEST: Optimización COPY con Parquet para ETL de Ventas")
    print("=" * 80)
    print()

    # Configuración de prueba
    tienda_id = 'tienda_01'  # PERIFERICO
    fecha_fin = datetime.now().date()
    fecha_inicio = fecha_fin - timedelta(days=1)  # Solo 1 día para prueba rápida

    print(f"📅 Período de prueba: {fecha_inicio} a {fecha_fin}")
    print(f"🏪 Tienda: {tienda_id}")
    print(f"💾 Base de datos: {ETLConfig.DUCKDB_PATH}")
    print()

    # Ejecutar ETL
    print("🚀 Iniciando ETL optimizado...")
    print("-" * 80)

    inicio_total = time.time()

    etl = VentasETL()
    resultado = etl.ejecutar_etl_ventas(
        tienda_id=tienda_id,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        limite_registros=100000
    )

    tiempo_total = time.time() - inicio_total

    print()
    print("=" * 80)
    print("📊 RESULTADOS DEL TEST")
    print("=" * 80)

    # Mostrar resultado completo para debug
    print(f"📋 Resultado completo:")
    import json
    print(json.dumps(resultado, indent=2, default=str))
    print()

    if resultado.get('estado') == 'exitoso':
        print("✅ ETL completado exitosamente")
        print()

        # Intentar obtener estadísticas de diferentes lugares
        stats = resultado.get('resultado', {}) or resultado.get('estadisticas', {})

        registros_cargados = (
            stats.get('registros_insertados', 0) or
            stats.get('registros_cargados', 0) or
            stats.get('procesados', 0)
        )

        print(f"📦 Registros procesados: {registros_cargados:,}")
        print(f"⏱️  Tiempo TOTAL: {tiempo_total:.2f}s")
        print()

        # Calcular velocidad
        registros = registros_cargados
        if tiempo_total > 0 and registros > 0:
            velocidad = registros / tiempo_total
            print(f"⚡ Velocidad: {velocidad:.0f} registros/segundo")
            print()

        # Estimación para 16 tiendas
        print("-" * 80)
        print("📈 ESTIMACIÓN PARA 16 TIENDAS (1 día por tienda)")
        print("-" * 80)

        # Estimar registros por día (ya es 1 día, usar directamente)
        dias = 1
        registros_por_dia = registros
        tiempo_por_dia = tiempo_total

        print(f"📊 Registros/día estimados: {registros_por_dia:,.0f}")
        print(f"⏱️  Tiempo/día estimado: {tiempo_por_dia:.2f}s ({tiempo_por_dia/60:.2f} min)")
        print()

        tiempo_16_tiendas = tiempo_por_dia * 16
        print(f"🏪 16 tiendas × {tiempo_por_dia:.2f}s = {tiempo_16_tiendas:.2f}s")
        print(f"⏱️  Tiempo total 16 tiendas: {tiempo_16_tiendas/60:.2f} minutos")
        print()

        # Comparación con método anterior
        print("-" * 80)
        print("📊 COMPARACIÓN CON MÉTODO ANTERIOR")
        print("-" * 80)

        tiempo_anterior_estimado = 20 * 60  # 20 minutos por tienda con método anterior
        mejora_factor = tiempo_anterior_estimado / tiempo_por_dia if tiempo_por_dia > 0 else 0

        print(f"⏱️  Método ANTERIOR: ~20 min/tienda = 5.3 horas para 16 tiendas")
        print(f"⏱️  Método OPTIMIZADO: ~{tiempo_por_dia/60:.2f} min/tienda = {tiempo_16_tiendas/60:.2f} min para 16 tiendas")
        print(f"🚀 Mejora: {mejora_factor:.1f}x más rápido")
        print()

    else:
        print("❌ ETL falló")
        print(f"   Error: {resultado.get('mensaje', 'Error desconocido')}")

    print("=" * 80)

if __name__ == "__main__":
    main()
