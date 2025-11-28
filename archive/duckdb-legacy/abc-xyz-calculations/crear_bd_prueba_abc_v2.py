#!/usr/bin/env python3
"""
Crear base de datos de prueba con datos sintéticos para testear ABC v2.
"""

import duckdb
import sys
from pathlib import Path
from datetime import datetime, timedelta
import random

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "fluxion_test_abc.db"


def crear_bd_prueba():
    """Crear BD de prueba con datos sintéticos."""
    print("=" * 70)
    print("CREANDO BASE DE DATOS DE PRUEBA PARA ABC V2")
    print("=" * 70)

    if DB_PATH.exists():
        respuesta = input(f"\n⚠ {DB_PATH} ya existe. ¿Sobrescribir? (s/n): ").lower()
        if respuesta != 's':
            print("Operación cancelada")
            return

        DB_PATH.unlink()
        print(f"✓ Archivo anterior eliminado")

    print(f"\n📁 Creando: {DB_PATH}")
    conn = duckdb.connect(str(DB_PATH))

    # 1. Crear tabla productos
    print("\n1️⃣ Creando tabla productos...")
    conn.execute("""
        CREATE TABLE productos (
            id VARCHAR PRIMARY KEY,
            codigo VARCHAR(50) UNIQUE NOT NULL,
            codigo_barras VARCHAR(50),
            descripcion VARCHAR(200) NOT NULL,
            categoria VARCHAR(50),
            grupo VARCHAR(50),
            subgrupo VARCHAR(50),
            marca VARCHAR(100),
            modelo VARCHAR(100),
            presentacion VARCHAR(50),
            costo_promedio DECIMAL(12,4),
            precio_venta DECIMAL(12,4),
            stock_minimo INTEGER DEFAULT 0,
            stock_maximo INTEGER DEFAULT 0,
            activo BOOLEAN DEFAULT true,
            es_perecedero BOOLEAN DEFAULT false,
            dias_vencimiento INTEGER,
            abc_classification VARCHAR(1),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Insertar 1000 productos de prueba con distribución realista
    print("   Insertando 1000 productos...")

    categorias = ['Abarrotes', 'Bebidas', 'Lácteos', 'Carnes', 'Panadería', 'Frutas', 'Verduras', 'Limpieza']
    marcas = ['Premium', 'Económica', 'Estándar', 'Importada', 'Nacional']

    productos = []
    for i in range(1, 1001):
        # Distribución de costos siguiendo Pareto: pocos productos caros, muchos baratos
        if i <= 50:  # 5% productos premium (alto costo)
            costo = random.uniform(50, 200)
        elif i <= 200:  # 15% productos caros
            costo = random.uniform(20, 50)
        elif i <= 500:  # 30% productos precio medio
            costo = random.uniform(5, 20)
        else:  # 50% productos económicos
            costo = random.uniform(0.5, 5)

        productos.append((
            f'prod_{i:04d}',
            f'PRD{i:05d}',
            f'78{i:011d}',
            f'Producto {i} - {random.choice(categorias)}',
            random.choice(categorias),
            f'Grupo {random.randint(1, 10)}',
            f'Subgrupo {random.randint(1, 5)}',
            random.choice(marcas),
            f'Modelo {random.randint(1, 20)}',
            random.choice(['Caja', 'Unidad', 'Paquete', 'Botella']),
            round(costo, 2),
            round(costo * random.uniform(1.2, 1.8), 2),
            random.randint(10, 100),
            random.randint(200, 500),
            True,
            random.choice([True, False]),
            random.randint(30, 365) if random.random() < 0.3 else None,
            None  # Se calculará con ABC v2
        ))

    conn.executemany("""
        INSERT INTO productos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    """, productos)

    print(f"   ✓ {len(productos)} productos creados")

    # 2. Crear tabla ubicaciones
    print("\n2️⃣ Creando tabla ubicaciones...")
    conn.execute("""
        CREATE TABLE ubicaciones (
            id VARCHAR PRIMARY KEY,
            codigo VARCHAR(10) UNIQUE NOT NULL,
            nombre VARCHAR(100) NOT NULL,
            tipo VARCHAR(20) NOT NULL,
            region VARCHAR(50),
            ciudad VARCHAR(50),
            activo BOOLEAN DEFAULT true
        )
    """)

    ubicaciones = [
        ('ub_01', 'T01', 'Tienda Centro', 'tienda', 'Capital', 'Caracas'),
        ('ub_02', 'T02', 'Tienda Este', 'tienda', 'Capital', 'Caracas'),
        ('ub_03', 'T03', 'Tienda Oeste', 'tienda', 'Capital', 'Caracas'),
        ('ub_04', 'T04', 'Tienda Valencia', 'tienda', 'Centro', 'Valencia'),
        ('ub_05', 'T05', 'Tienda Maracay', 'tienda', 'Centro', 'Maracay'),
    ]

    conn.executemany("INSERT INTO ubicaciones VALUES (?, ?, ?, ?, ?, ?, true)", ubicaciones)
    print(f"   ✓ {len(ubicaciones)} ubicaciones creadas")

    # 3. Crear tabla facturas e items_facturas con datos sintéticos
    print("\n3️⃣ Creando tablas transaccionales...")

    conn.execute("""
        CREATE TABLE facturas (
            id VARCHAR PRIMARY KEY,
            numero_factura VARCHAR(50) NOT NULL,
            ubicacion_id VARCHAR NOT NULL,
            fecha_hora TIMESTAMP NOT NULL,
            fecha DATE NOT NULL,
            total_bs DECIMAL(18,2),
            total_usd DECIMAL(18,2),
            cantidad_items INTEGER
        )
    """)

    conn.execute("""
        CREATE TABLE items_facturas (
            id VARCHAR PRIMARY KEY,
            factura_id VARCHAR NOT NULL,
            numero_factura VARCHAR(50) NOT NULL,
            producto_id VARCHAR,
            fecha_hora TIMESTAMP NOT NULL,
            fecha DATE NOT NULL,
            codigo_producto VARCHAR(50),
            descripcion_producto VARCHAR(200),
            categoria_producto VARCHAR(50),
            marca_producto VARCHAR(100),
            cantidad DECIMAL(12,4) NOT NULL,
            precio_unitario DECIMAL(12,4),
            precio_total DECIMAL(18,2),
            costo_unitario DECIMAL(12,4),
            costo_total DECIMAL(18,2),
            margen DECIMAL(18,2)
        )
    """)

    # Generar ventas de los últimos 3 meses (distribución Pareto)
    print("   Generando ventas (últimos 3 meses)...")

    fecha_fin = datetime.now()
    fecha_inicio = fecha_fin - timedelta(days=90)

    num_facturas = 50000
    items_generados = 0

    for i in range(1, num_facturas + 1):
        if i % 10000 == 0:
            print(f"   ... {i:,} facturas procesadas")

        # Fecha aleatoria en el rango
        dias_aleatorios = random.randint(0, 90)
        fecha = fecha_inicio + timedelta(days=dias_aleatorios)

        factura_id = f'fac_{i:08d}'
        ubicacion = random.choice(ubicaciones)

        # Insertar factura
        conn.execute("""
            INSERT INTO facturas VALUES (?, ?, ?, ?, ?, 0, 0, 0)
        """, (factura_id, f'F{i:08d}', ubicacion[0], fecha, fecha.date()))

        # Items de la factura (1-5 items por factura)
        num_items = random.randint(1, 5)

        for j in range(num_items):
            items_generados += 1
            item_id = f'item_{items_generados:010d}'

            # Seleccionar producto (con distribución Pareto: algunos productos se venden mucho más)
            if random.random() < 0.7:  # 70% de las ventas en top 20% productos
                producto_idx = random.randint(1, 200)
            else:
                producto_idx = random.randint(201, 1000)

            producto_id = f'prod_{producto_idx:04d}'

            # Obtener datos del producto
            producto = conn.execute(f"""
                SELECT codigo, descripcion, categoria, marca, costo_promedio, precio_venta
                FROM productos WHERE id = '{producto_id}'
            """).fetchone()

            if producto:
                cantidad = random.randint(1, 20)
                costo = producto[4] if producto[4] else 1.0
                precio = producto[5] if producto[5] else costo * 1.5

                # Aplicar variación de costo por inflación (+/- 10%)
                costo_variado = costo * random.uniform(0.9, 1.1)

                precio_total = cantidad * precio
                costo_total = cantidad * costo_variado
                margen = precio_total - costo_total

                conn.execute("""
                    INSERT INTO items_facturas VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    item_id, factura_id, f'F{i:08d}', producto_id,
                    fecha, fecha.date(),
                    producto[0], producto[1], producto[2], producto[3],
                    cantidad, precio, precio_total,
                    costo_variado, costo_total, margen
                ))

    print(f"   ✓ {num_facturas:,} facturas creadas")
    print(f"   ✓ {items_generados:,} items de venta generados")

    # 4. Crear índices
    print("\n4️⃣ Creando índices...")
    conn.execute("CREATE INDEX idx_items_fecha ON items_facturas(fecha)")
    conn.execute("CREATE INDEX idx_items_producto ON items_facturas(producto_id)")
    print("   ✓ Índices creados")

    # 5. Verificar datos
    print("\n5️⃣ Verificando datos...")
    total_items = conn.execute("SELECT COUNT(*) FROM items_facturas").fetchone()[0]
    total_valor = conn.execute("SELECT SUM(costo_total) FROM items_facturas").fetchone()[0]
    print(f"   ✓ Total items: {total_items:,}")
    print(f"   ✓ Valor total: ${total_valor:,.2f}")

    conn.close()

    print("\n" + "=" * 70)
    print("✅ BASE DE DATOS DE PRUEBA CREADA EXITOSAMENTE")
    print("=" * 70)
    print(f"\n📁 Ubicación: {DB_PATH}")
    print(f"📊 Productos: 1,000")
    print(f"📊 Ubicaciones: {len(ubicaciones)}")
    print(f"📊 Facturas: {num_facturas:,}")
    print(f"📊 Items: {items_generados:,}")

    print("\n🚀 Siguiente paso:")
    print(f"   python3 calcular_abc_v2.py --crear-tablas --verbose")
    print(f"\nNOTA: Usa esta BD de prueba editando DB_PATH en calcular_abc_v2.py")
    print(f"      o ejecuta directamente con la BD real cuando esté disponible.\n")


if __name__ == '__main__':
    try:
        crear_bd_prueba()
    except KeyboardInterrupt:
        print("\n\n⚠ Proceso interrumpido")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
