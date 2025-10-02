#!/usr/bin/env python3
"""
Prueba simplificada de conexión a El Bosque
Sin dependencias de ODBC, solo para validar la lógica
"""

import pandas as pd
from datetime import datetime
import sys
from pathlib import Path

# Agregar el directorio padre al path para importar modules
sys.path.append(str(Path(__file__).parent))

def simulate_el_bosque_data():
    """Simula datos de El Bosque basados en la estructura real"""

    # Datos simulados basados en tu query real
    mock_data = {
        'codigo_producto': ['HAR001', 'ARR002', 'ACE003', 'AZU004', 'SAL005'],
        'codigo_barras': ['7591234567890', '7591234567891', '7591234567892', '7591234567893', '7591234567894'],
        'descripcion_producto': ['Harina de Maíz Precocida', 'Arroz Blanco Grano Largo', 'Aceite de Girasol', 'Azúcar Blanca Refinada', 'Sal Refinada'],
        'categoria_codigo': ['001', '002', '003', '001', '001'],
        'categoria': ['Alimentos Básicos', 'Cereales', 'Aceites', 'Alimentos Básicos', 'Alimentos Básicos'],
        'subcategoria_codigo': ['001A', '002A', '003A', '001B', '001C'],
        'subcategoria': ['Harinas', 'Arroz', 'Aceites Vegetales', 'Azúcares', 'Sal'],
        'marca': ['PAN', 'Primor', 'Mazeite', 'Central Río Turbio', 'Diana'],
        'peso': [1.0, 1.0, 1.0, 1.0, 1.0],
        'volumen': [0.0, 0.0, 1.0, 0.0, 0.0],
        'precio_venta_actual': [3.20, 4.50, 5.10, 2.30, 1.10],
        'iva_porcentaje': [16.0, 16.0, 16.0, 16.0, 16.0],
        'cantidad_actual': [150.0, 80.0, 45.0, 120.0, 200.0],
        'precio_sin_iva': [2.76, 3.88, 4.40, 1.98, 0.95],
        'valor_inventario_actual': [480.0, 360.0, 229.5, 276.0, 220.0],
        'activo_flag': [1, 1, 1, 1, 1],
        'tipo_peso': [0, 0, 0, 0, 0],
        'stock_minimo': [50, 30, 25, 40, 60],
        'stock_maximo': [500, 300, 200, 400, 500],
        'punto_reorden': [75, 45, 38, 60, 90],
        'fecha_sistema': [datetime.now()] * 5,
        'nombre_ubicacion': ['El Bosque'] * 5
    }

    return pd.DataFrame(mock_data)

def test_transformer():
    """Prueba el transformador con datos simulados de El Bosque"""

    print("🧪 PRUEBA DE TRANSFORMACIÓN - DATOS EL BOSQUE SIMULADOS")
    print("=" * 60)

    # Generar datos simulados
    print("📊 Generando datos simulados basados en estructura real...")
    raw_df = simulate_el_bosque_data()

    print(f"✅ {len(raw_df)} productos simulados generados")
    print(f"📋 Categorías: {raw_df['categoria'].unique()}")
    print(f"💰 Valor total inventario: Bs {raw_df['valor_inventario_actual'].sum():,.2f}")

    # Agregar metadatos ETL ANTES de crear raw_data
    raw_df['ubicacion_id'] = 'tienda_01'
    raw_df['fecha_extraccion'] = datetime.now()
    raw_df['server_ip'] = '192.168.150.10'

    # Simular estructura de múltiples ubicaciones para el transformer
    raw_data = {
        "tienda_01": raw_df.copy()
    }

    try:
        # Importar y usar transformer
        from transformer import InventoryTransformer

        transformer = InventoryTransformer()

        print("\n🔄 Aplicando transformaciones...")
        transformed_df = transformer.transform_inventory_data(raw_data)

        if not transformed_df.empty:
            print(f"✅ Transformación exitosa: {len(transformed_df)} registros")

            # Mostrar resultados
            print("\n📋 MUESTRA DE DATOS TRANSFORMADOS:")
            sample_columns = ['codigo_producto', 'descripcion_producto', 'categoria',
                            'cantidad_actual', 'precio_venta_actual', 'estado_stock']

            available_columns = [col for col in sample_columns if col in transformed_df.columns]
            print(transformed_df[available_columns].head())

            # Estadísticas
            if 'estado_stock' in transformed_df.columns:
                print(f"\n📊 ESTADOS DE STOCK:")
                stock_states = transformed_df['estado_stock'].value_counts()
                for state, count in stock_states.items():
                    print(f"   {state}: {count} productos")

            # Crear reporte
            summary = transformer.create_summary_report(transformed_df)
            print(f"\n📈 RESUMEN:")
            print(f"   📦 Total productos: {summary['productos']['total']}")
            print(f"   💰 Valor total: Bs {summary['stock']['valor_total']:,.2f}")
            print(f"   📍 Ubicaciones: {summary['ubicaciones']['total']}")

            return True

        else:
            print("❌ Transformación falló - sin datos resultantes")
            return False

    except Exception as e:
        print(f"❌ Error en transformación: {str(e)}")
        return False

def test_loader():
    """Prueba el cargador con datos transformados simulados"""

    print("\n🧪 PRUEBA DE CARGA - DUCKDB")
    print("=" * 40)

    try:
        # Generar datos para carga
        test_df = simulate_el_bosque_data()

        # Agregar campos requeridos para el loader
        test_df['ubicacion_id'] = 'tienda_01'
        test_df['fecha_extraccion'] = datetime.now()
        test_df['server_ip'] = '192.168.150.10'

        # Renombrar columnas para compatibilidad con loader
        test_df = test_df.rename(columns={
            'descripcion_producto': 'descripcion_producto',
            'cantidad_actual': 'cantidad_actual',
        })

        from loader import DuckDBLoader

        loader = DuckDBLoader()

        # Crear tablas ETL
        print("🏗️  Verificando tablas ETL...")
        if loader.create_etl_tables():
            print("✅ Tablas ETL verificadas")

            # Cargar datos
            print("📦 Cargando datos de prueba...")
            result = loader.load_inventory_data(test_df)

            if result['success']:
                print(f"✅ Carga exitosa:")
                print(f"   📊 Registros insertados: {result['stats']['insertados']}")
                print(f"   ⏱️  Tiempo: {result['stats']['tiempo_ejecucion']:.2f}s")
                print(f"   🏷️  Batch ID: {result['batch_id']}")

                # Actualizar stock_actual
                print("\n🔄 Actualizando stock_actual...")
                stock_result = loader.update_stock_actual_table(test_df)

                if stock_result['success']:
                    print(f"✅ stock_actual actualizado: {stock_result['records_updated']} registros")

                return True
            else:
                print(f"❌ Carga falló: {result.get('error', 'Error desconocido')}")
                return False
        else:
            print("❌ No se pudieron crear tablas ETL")
            return False

    except Exception as e:
        print(f"❌ Error en carga: {str(e)}")
        return False

def main():
    """Función principal de prueba"""

    print("🚀 SIMULACIÓN COMPLETA ETL - EL BOSQUE")
    print("=" * 60)
    print("🏪 Ubicación: El Bosque (simulado)")
    print("📊 Datos: Basados en estructura SQL Server real")
    print("🎯 Objetivo: Validar flujo ETL completo")
    print()

    success_count = 0
    total_tests = 2

    # Test 1: Transformación
    if test_transformer():
        success_count += 1

    # Test 2: Carga
    if test_loader():
        success_count += 1

    # Resumen final
    print(f"\n📊 RESULTADO FINAL")
    print("=" * 40)
    print(f"✅ Pruebas exitosas: {success_count}/{total_tests}")

    if success_count == total_tests:
        print("🎉 ¡Flujo ETL validado completamente!")
        print()
        print("🚀 PRÓXIMO PASO:")
        print("   Una vez que se instale el driver ODBC,")
        print("   podrás ejecutar el ETL real con:")
        print("   python3 etl_orchestrator.py --action etl --ubicaciones tienda_01")
    else:
        print("⚠️  Algunas pruebas fallaron. Revisar logs arriba.")

    print()
    print("💡 NOTA: Esta es una simulación con datos ficticios")
    print("    basados en la estructura real de tu base de datos.")

if __name__ == "__main__":
    main()