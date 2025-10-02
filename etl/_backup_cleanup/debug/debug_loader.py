#!/usr/bin/env python3
"""
Script de debug para investigar el problema del loader
"""

import duckdb
import pandas as pd
from pathlib import Path
from datetime import datetime
import sys

# Agregar el directorio actual al path
sys.path.append(str(Path(__file__).parent))

from config import ETLConfig
from loader import DuckDBLoader
from transformer import InventoryTransformer
import logging

def debug_loader():
    print("🔍 DEBUGGING LOADER - INVESTIGANDO PÉRDIDA DE DATOS")
    print("=" * 60)

    # Configurar logging detallado
    logging.basicConfig(level=logging.DEBUG)

    # Crear datos de prueba que simulan lo que llega del transformer
    print("📊 Creando datos de prueba (simulando output del transformer)...")

    # Crear un DataFrame con exactamente la estructura que esperamos
    test_data = []

    # Crear 4517 registros de prueba
    for i in range(4517):
        test_data.append({
            'ubicacion_id': 'tienda_01',
            'ubicacion_nombre': 'El Bosque',
            'tipo_ubicacion': 'tienda',
            'codigo_producto': f'TEST{i:05d}',
            'codigo_barras': f'123456{i:06d}',
            'descripcion_producto': f'Producto Test {i}',
            'categoria': 'ALIMENTOS' if i % 3 == 0 else 'BEBIDAS' if i % 3 == 1 else 'LIMPIEZA',
            'subcategoria': f'Sub{i % 10}',
            'marca': 'MARCA_TEST',
            'presentacion': 'UNIDAD',
            'cantidad_actual': float(100 - (i % 100)),
            'cantidad_disponible': float(100 - (i % 100)),
            'cantidad_reservada': 0.0,
            'cantidad_en_transito': 0.0,
            'costo_unitario_actual': 8.50,
            'precio_venta_actual': 10.00,
            'valor_inventario_actual': 500.00,
            'margen_porcentaje': 15.0,
            'stock_minimo': 10.0,
            'stock_maximo': 100.0,
            'punto_reorden': 20.0,
            'estado_stock': 'NORMAL',
            'ubicacion_fisica': f'A{i % 10}',
            'pasillo': f'A{i % 5}',
            'estante': str(i % 10),
            'fecha_ultima_entrada': None,
            'fecha_ultima_salida': None,
            'fecha_ultimo_conteo': None,
            'dias_sin_movimiento': 0,
            'activo': True,
            'es_perecedero': False,
            'dias_vencimiento': None,
            'fecha_extraccion': datetime.now(),
            'server_ip': '192.168.150.10',
            'batch_id': 'debug_batch_001'
        })

    df_test = pd.DataFrame(test_data)
    print(f"✅ Datos de prueba creados: {len(df_test)} registros con {len(df_test.columns)} columnas")

    # Verificar estado inicial de la DB
    DB_PATH = ETLConfig.DUCKDB_PATH
    conn = duckdb.connect(str(DB_PATH))

    initial_count = conn.execute("SELECT COUNT(*) FROM inventario_raw WHERE ubicacion_id = 'tienda_01'").fetchone()[0]
    print(f"📊 Registros iniciales en DB: {initial_count}")

    # Monitorear cada paso del proceso
    print("\n🔄 PASO 1: Preparando loader...")
    loader = DuckDBLoader()

    print("🔄 PASO 2: Ejecutando load_inventory_data con datos de prueba...")

    # Interceptar el proceso batch por batch
    try:
        # Crear el monitoreo paso a paso
        batch_size = 1000
        total_batches = (len(df_test) - 1) // batch_size + 1

        print(f"📦 Procesará {total_batches} lotes de {batch_size} registros cada uno")

        for i in range(0, len(df_test), batch_size):
            batch_df = df_test.iloc[i:i + batch_size].copy()
            current_batch = (i // batch_size) + 1

            print(f"\n🔍 MONITOREANDO LOTE {current_batch}/{total_batches}")
            print(f"   📊 Tamaño del lote: {len(batch_df)}")

            # Contar antes del DELETE
            count_before_delete = conn.execute("SELECT COUNT(*) FROM inventario_raw WHERE ubicacion_id = 'tienda_01'").fetchone()[0]
            print(f"   📈 Registros antes del DELETE: {count_before_delete}")

            # Simular el DELETE que hace el loader
            if i == 0:  # Solo en el primer lote
                fecha_extraccion = batch_df['fecha_extraccion'].iloc[0]
                conn.execute("""
                    DELETE FROM inventario_raw
                    WHERE ubicacion_id = ?
                    AND DATE(fecha_extraccion) = DATE(?)
                """, ('tienda_01', fecha_extraccion))

                count_after_delete = conn.execute("SELECT COUNT(*) FROM inventario_raw WHERE ubicacion_id = 'tienda_01'").fetchone()[0]
                print(f"   🗑️  Registros después del DELETE: {count_after_delete}")

            # Registrar el lote y intentar INSERT
            conn.register('batch_data', batch_df)

            # Excluir columnas problemáticas
            excluded_columns = ['id', 'created_at', 'fecha_ultima_entrada', 'fecha_ultima_salida', 'fecha_ultimo_conteo', 'dias_vencimiento']
            columns = [col for col in batch_df.columns if col not in excluded_columns]
            columns_str = ', '.join(columns)

            print(f"   📝 Columnas a insertar: {len(columns)} ({', '.join(columns[:5])}...)")

            try:
                conn.execute(f"""
                    INSERT INTO inventario_raw ({columns_str})
                    SELECT {columns_str} FROM batch_data
                """)

                # Verificar inserción
                count_after_insert = conn.execute("SELECT COUNT(*) FROM inventario_raw WHERE ubicacion_id = 'tienda_01'").fetchone()[0]
                print(f"   ✅ Registros después del INSERT: {count_after_insert}")
                print(f"   📈 Incremento en este lote: {count_after_insert - (count_before_delete if i > 0 else 0)}")

            except Exception as e:
                print(f"   ❌ ERROR en INSERT: {str(e)}")
                break

    except Exception as e:
        print(f"💥 ERROR GENERAL: {str(e)}")

    # Verificar resultado final
    final_count = conn.execute("SELECT COUNT(*) FROM inventario_raw WHERE ubicacion_id = 'tienda_01'").fetchone()[0]
    print(f"\n📊 RESULTADO FINAL:")
    print(f"   📥 Registros enviados: {len(df_test)}")
    print(f"   📤 Registros en DB: {final_count}")
    print(f"   📈 Diferencia: {len(df_test) - final_count}")

    if final_count != len(df_test):
        print("❌ ¡PROBLEMA DETECTADO! No todos los registros fueron insertados")

        # Análisis adicional
        print("\n🔍 ANÁLISIS ADICIONAL:")

        # Ver si hay restricciones o constraints
        print("📋 Verificando constraints de la tabla...")
        try:
            table_info = conn.execute("PRAGMA table_info(inventario_raw)").fetchall()
            constraints = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='inventario_raw'").fetchall()
            print(f"   Constraints encontrados: {len(constraints)}")
        except Exception as e:
            print(f"   Error verificando constraints: {str(e)}")
    else:
        print("✅ ¡INSERCIÓN EXITOSA! Todos los registros fueron insertados correctamente")

    conn.close()

if __name__ == "__main__":
    debug_loader()