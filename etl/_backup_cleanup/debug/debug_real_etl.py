#!/usr/bin/env python3
"""
Debug específico para el ETL real - interceptar datos del transformer
"""

import pandas as pd
from pathlib import Path
import sys
import logging
from datetime import datetime

# Agregar el directorio actual al path
sys.path.append(str(Path(__file__).parent))

from config import ETLConfig
from extractor import SQLServerExtractor
from transformer import InventoryTransformer

def debug_real_data():
    print("🔍 DEBUGGING ETL REAL - INTERCEPTANDO DATOS DEL TRANSFORMER")
    print("=" * 70)

    # Simular datos extraídos (ya que no tenemos conexión VPN aquí)
    print("⚠️  NOTA: Simulando datos extraídos desde el SQL Server...")
    print("    (En el ETL real estos vienen de la base de datos)")

    # Cargar los datos que el extractor obtuvo en la última ejecución exitosa
    # Vamos a usar datos representativos basados en lo que sabemos del ETL real

    raw_data_sample = []

    # Crear una muestra representativa de los datos reales de El Bosque
    productos_reales = [
        "PIMIENTA NEGRA MOLIDA IBERIA 3 GR",
        "ARROZ SUPERIOR TIPO I MARY 900 GR",
        "TOSTON CON AJO TOM 28 GR",
        "ARROZ TRADICIONAL MARY 900 GR",
        "ONOTO IBERIA 6 GR"
    ]

    codigos_reales = ["001512", "001615", "001782", "001616", "001513"]

    # Simular los 4517 registros como vienen del SQL Server
    base_time = datetime.now()
    for i in range(4517):
        producto_idx = i % len(productos_reales)
        raw_data_sample.append({
            'nombreProducto': productos_reales[producto_idx] + f" {i}",
            'Codigo': f"{codigos_reales[producto_idx]}{i:04d}",
            'c_Codigo': f"759122{i:06d}",
            'categoria': 'ALIMENTOS' if i % 3 == 0 else 'BEBIDAS' if i % 3 == 1 else 'LIMPIEZA',
            'descripcion': 'Condimentos' if i % 3 == 0 else 'Bebidas' if i % 3 == 1 else 'Limpieza',
            'subcategoria': f'Sub{i % 10}',
            'descripcion_subcategoria': f'Subcategoria {i % 10}',
            'marca': 'IBERIA' if i % 2 == 0 else 'MARY',
            'n_Peso': 1.0,
            'n_Volumen': 1.0,
            'precio': 10.50 + (i % 100),
            'n_Impuesto1': 16.0,
            'stock': 100.0 + (i % 1000),
            # CAMPOS OBLIGATORIOS que el extractor debería agregar
            'ubicacion_id': 'tienda_01',
            'ubicacion_nombre': 'El Bosque',
            'tipo_ubicacion': 'tienda',
            'fecha_extraccion': base_time.replace(microsecond=i),  # Timestamp único por registro
            'server_ip': '192.168.150.10'
        })

    df_raw = pd.DataFrame(raw_data_sample)
    print(f"✅ Datos simulados creados: {len(df_raw)} registros")
    print(f"📊 Columnas: {list(df_raw.columns)}")

    # Simular la configuración de El Bosque
    config = ETLConfig.get_database_config("tienda_01")
    print(f"📍 Configuración: {config.ubicacion_nombre}")

    # PASO CRÍTICO: Transformar los datos usando el transformer real
    print("\n🔄 PASO CRÍTICO: Ejecutando transformer real...")
    transformer = InventoryTransformer()

    try:
        # El transformer espera un diccionario con DataFrames por ubicación
        raw_data_dict = {'tienda_01': df_raw}
        transformed_data = transformer.transform_inventory_data(raw_data_dict)

        print(f"✅ Transformación completada")
        print(f"📊 Registros después del transformer: {len(transformed_data)}")
        print(f"📋 Columnas después del transformer: {list(transformed_data.columns)}")

        # Verificar si hay algún filtro implícito
        if len(transformed_data) != len(df_raw):
            print(f"⚠️  DIFERENCIA DETECTADA: {len(df_raw)} -> {len(transformed_data)}")
            print(f"   Registros perdidos: {len(df_raw) - len(transformed_data)}")

            # Analizar qué se perdió
            print("\\n🔍 ANALIZANDO PÉRDIDA DE DATOS...")

        # Verificar tipos de datos
        print(f"\\n📋 TIPOS DE DATOS EN TRANSFORMED:")
        for col in transformed_data.columns:
            dtype = transformed_data[col].dtype
            non_null = transformed_data[col].count()
            print(f"   {col}: {dtype} ({non_null}/{len(transformed_data)} no-null)")

        # Ver muestra de los datos transformados
        print(f"\\n📋 MUESTRA DE DATOS TRANSFORMADOS:")
        print(transformed_data.head(3).to_string())

        # Verificar si hay duplicados
        duplicates = transformed_data.duplicated().sum()
        print(f"\\n🔍 Duplicados encontrados: {duplicates}")

        # AHORA PROBAR CON EL LOADER REAL
        print(f"\\n💾 PROBANDO CON LOADER REAL...")
        from loader import DuckDBLoader

        loader = DuckDBLoader()
        result = loader.load_inventory_data(transformed_data)

        print(f"📊 Resultado del loader:")
        print(f"   Success: {result.get('success')}")
        print(f"   Message: {result.get('message')}")
        print(f"   Stats: {result.get('stats')}")

        # Verificar qué quedó realmente en la DB
        import duckdb
        DB_PATH = ETLConfig.DUCKDB_PATH
        conn = duckdb.connect(str(DB_PATH))

        final_count = conn.execute("SELECT COUNT(*) FROM inventario_raw WHERE ubicacion_id = 'tienda_01'").fetchone()[0]
        print(f"\\n📊 VERIFICACIÓN FINAL:")
        print(f"   Registros enviados al loader: {len(transformed_data)}")
        print(f"   Registros en DB: {final_count}")

        if final_count != len(transformed_data):
            print("❌ ¡DISCREPANCIA CONFIRMADA!")

            # Verificar logs del loader
            print("\\n🔍 ÚLTIMAS OPERACIONES EN DB:")
            recent = conn.execute("""
                SELECT COUNT(*), MIN(fecha_extraccion), MAX(fecha_extraccion)
                FROM inventario_raw
                WHERE ubicacion_id = 'tienda_01'
                AND fecha_extraccion >= now() - INTERVAL '1 hour'
            """).fetchone()
            print(f"   Registros recientes: {recent[0]} ({recent[1]} a {recent[2]})")

        conn.close()

    except Exception as e:
        print(f"❌ ERROR en transformer: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_real_data()