#!/usr/bin/env python3
"""
Crear datos de prueba para la tabla de ventas en DuckDB
"""

import duckdb
from datetime import datetime, timedelta
import random

def crear_datos_prueba():
    conn = duckdb.connect('la_granja_etl.duckdb')

    print('🔧 Creando tabla de ventas con datos de prueba...')

    # Crear tabla de ventas
    conn.execute('''
        CREATE TABLE IF NOT EXISTS ventas (
            fecha DATE,
            codigo_producto VARCHAR,
            descripcion_producto VARCHAR,
            marca_producto VARCHAR,
            categoria_producto VARCHAR,
            cantidad_vendida DECIMAL(10,2),
            venta_total DECIMAL(12,2),
            numero_factura VARCHAR,
            ubicacion_id INTEGER
        )
    ''')

    # Datos de productos típicos venezolanos
    productos = [
        ('001', 'HARINA PAN BLANCA 1KG', 'HARINA PAN', 'HARINAS', 25.50),
        ('002', 'ACEITE MAVESA 1L', 'MAVESA', 'ACEITES', 12.80),
        ('003', 'ARROZ MARY 1KG', 'MARY', 'CEREALES', 15.20),
        ('004', 'LECHE COMPLETA PARMALAT 1L', 'PARMALAT', 'LACTEOS', 8.75),
        ('005', 'AZUCAR CENTRAL TACARIGUA 1KG', 'CENTRAL TACARIGUA', 'AZUCARES', 18.90),
        ('006', 'MARGARINA MAVESA 500G', 'MAVESA', 'LACTEOS', 22.15),
        ('007', 'PASTA ESPAGUETI LA FAVORITA', 'LA FAVORITA', 'PASTA', 9.80),
        ('008', 'SALSA TOMATE HEINZ 350G', 'HEINZ', 'SALSAS', 14.50)
    ]

    # Generar datos para los últimos 4 días
    base_date = datetime.now().date()
    print(f'📅 Generando datos desde {base_date - timedelta(days=3)} hasta {base_date}')

    records_inserted = 0
    for days_ago in range(4):  # 4 días de datos
        fecha = base_date - timedelta(days=days_ago)

        for codigo, descripcion, marca, categoria, precio in productos:
            # Generar 1-3 ventas por producto por día
            num_ventas = random.randint(1, 3)

            for venta in range(num_ventas):
                cantidad = random.randint(1, 5)
                total = cantidad * precio
                factura = f'F{fecha.strftime("%Y%m%d")}-{random.randint(1000, 9999)}'

                conn.execute('''
                    INSERT INTO ventas VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (fecha, codigo, descripcion, marca, categoria, cantidad, total, factura, 8))  # ubicacion_id = 8 (BOSQUE)

                records_inserted += 1

    print(f'✅ Insertados {records_inserted} registros de ventas')

    # Verificar los datos
    result = conn.execute('SELECT COUNT(*) FROM ventas').fetchone()
    print(f'📊 Total registros en tabla ventas: {result[0]}')

    # Mostrar muestra de datos
    sample = conn.execute('SELECT * FROM ventas LIMIT 3').fetchall()
    columns = [desc[0] for desc in conn.description]
    print('\n📋 Muestra de datos:')
    for row in sample:
        data = dict(zip(columns, row))
        print(f'  {data["fecha"]} | {data["codigo_producto"]} | {data["descripcion_producto"]} | ${data["venta_total"]}')

    conn.close()
    print('\n🎉 Datos de prueba creados exitosamente')

if __name__ == '__main__':
    crear_datos_prueba()