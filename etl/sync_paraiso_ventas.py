#!/usr/bin/env python3
"""
Script para sincronizar ventas de Paraiso (tienda_18) a PostgreSQL local
"""

import sys
from pathlib import Path
from datetime import date, datetime

# Agregar paths
sys.path.insert(0, str(Path(__file__).parent / 'core'))
sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))

from core.extractor_ventas_klk import VentasKLKExtractor
from core.loader_ventas_postgres import PostgreSQLVentasLoader

def main():
    print("\n" + "="*80)
    print("🔄 SINCRONIZANDO VENTAS PARAISO (tienda_18) A POSTGRESQL LOCAL")
    print("="*80 + "\n")
    
    # Inicializar componentes
    extractor = VentasKLKExtractor()
    loader = PostgreSQLVentasLoader()
    
    # Parametros
    sucursal_klk = "SUC004"  # Paraiso en KLK
    tienda_id = "tienda_18"
    fecha_hoy = str(date.today())  # "YYYY-MM-DD"
    
    print(f"📅 Fecha: {fecha_hoy}")
    print(f"🏪 Tienda: PARAISO ({tienda_id})")
    print(f"📋 Sucursal KLK: {sucursal_klk}")
    
    # Extraer datos RAW de KLK API
    print(f"\n📡 Extrayendo ventas RAW desde KLK API...")
    
    try:
        # Usar extract_ventas_raw para obtener el dict completo
        response = extractor.extract_ventas_raw(
            sucursal=sucursal_klk,
            fecha_desde=fecha_hoy,
            fecha_hasta=fecha_hoy
        )
        
        if not response or 'ventas' not in response:
            print(f"⚠️  No se encontraron ventas para hoy")
            return
        
        ventas_raw = response.get('ventas', [])
        print(f"✅ Extraídas {len(ventas_raw)} líneas de venta")
        
        # Cargar a PostgreSQL
        print(f"\n💾 Cargando a PostgreSQL local...")
        result = loader.load_ventas_raw(ventas_raw, sucursal_klk)
        
        print(f"\n📊 Resultado:")
        print(f"   - Records cargados: {result.get('records_loaded', 0)}")
        print(f"   - Duplicados/errores: {result.get('duplicates_skipped', 0)}")
        print(f"   - Status: {'✅ Exitoso' if result.get('success') else '❌ Error'}")
        
        # Verificar
        print(f"\n📋 Verificando datos cargados...")
        stats = loader.get_stats_tienda(tienda_id, fecha_hoy)
        print(f"   - Total registros: {stats.get('total_registros', 0)}")
        print(f"   - Productos únicos: {stats.get('productos_unicos', 0)}")
        print(f"   - Venta total USD: ${stats.get('venta_total_usd', 0):,.2f}")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        extractor.close()
    
    print("\n" + "="*80)
    print("✅ Sincronización completada")
    print("="*80 + "\n")

if __name__ == "__main__":
    main()
