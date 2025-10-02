#!/usr/bin/env python3
"""
Script de inicialización de base de datos DuckDB para Fluxion AI
Crea el esquema y carga datos iniciales
"""

import duckdb
import os
from pathlib import Path
from datetime import datetime

def init_database():
    """Inicializa la base de datos DuckDB con esquema y datos"""

    # Rutas de archivos
    base_dir = Path(__file__).parent
    db_path = base_dir.parent / "data" / "fluxion_production.db"
    schema_path = base_dir / "schema.sql"
    init_data_path = base_dir / "init_data.sql"

    # Crear directorio data si no existe
    db_path.parent.mkdir(exist_ok=True)

    print("🚀 Inicializando base de datos Fluxion AI...")
    print(f"📁 Base de datos: {db_path}")

    try:
        # Conectar a DuckDB (se crea si no existe)
        conn = duckdb.connect(str(db_path))

        print("✅ Conexión establecida")

        # Leer y ejecutar esquema
        if schema_path.exists():
            print("📋 Creando esquema de base de datos...")
            with open(schema_path, 'r', encoding='utf-8') as f:
                schema_sql = f.read()

            # Ejecutar por bloques separados por comentarios
            schema_blocks = schema_sql.split('-- =====================================================================================')
            for i, block in enumerate(schema_blocks):
                if block.strip():
                    try:
                        conn.execute(block)
                        print(f"   ✓ Bloque {i+1} ejecutado")
                    except Exception as e:
                        print(f"   ⚠️  Error en bloque {i+1}: {str(e)}")

        print("✅ Esquema creado exitosamente")

        # Leer y ejecutar datos iniciales
        if init_data_path.exists():
            print("💾 Insertando datos iniciales...")
            with open(init_data_path, 'r', encoding='utf-8') as f:
                init_sql = f.read()

            # Ejecutar por bloques
            init_blocks = init_sql.split('-- =====================================================================================')
            for i, block in enumerate(init_blocks):
                if block.strip():
                    try:
                        conn.execute(block)
                        print(f"   ✓ Datos bloque {i+1} insertados")
                    except Exception as e:
                        print(f"   ⚠️  Error en datos bloque {i+1}: {str(e)}")

        print("✅ Datos iniciales insertados")

        # Verificar instalación
        print("\n📊 Verificando instalación...")

        # Contar registros en tablas principales
        tables = ['ubicaciones', 'productos', 'stock_actual', 'movimientos_inventario']
        for table in tables:
            try:
                result = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
                count = result[0] if result else 0
                print(f"   📋 {table}: {count:,} registros")
            except Exception as e:
                print(f"   ❌ Error en tabla {table}: {str(e)}")

        # Mostrar resumen de ubicaciones
        print("\n🏪 Ubicaciones registradas:")
        try:
            result = conn.execute("""
                SELECT tipo, COUNT(*) as cantidad,
                       STRING_AGG(nombre, ', ') as nombres
                FROM ubicaciones
                GROUP BY tipo
                ORDER BY tipo
            """).fetchall()

            for row in result:
                tipo, cantidad, nombres = row
                print(f"   {tipo.upper()}: {cantidad} ubicaciones")
                # Mostrar solo los primeros nombres si hay muchos
                nombres_lista = nombres.split(', ')
                if len(nombres_lista) <= 3:
                    print(f"      ({nombres})")
                else:
                    print(f"      ({', '.join(nombres_lista[:3])}, ...)")
        except Exception as e:
            print(f"   ❌ Error obteniendo resumen: {str(e)}")

        # Mostrar productos por categoría
        print("\n📦 Productos por categoría:")
        try:
            result = conn.execute("""
                SELECT categoria, COUNT(*) as cantidad
                FROM productos
                WHERE activo = true
                GROUP BY categoria
                ORDER BY cantidad DESC
            """).fetchall()

            for row in result:
                categoria, cantidad = row
                print(f"   {categoria}: {cantidad} productos")
        except Exception as e:
            print(f"   ❌ Error obteniendo productos: {str(e)}")

        # Crear vista de prueba para dashboard
        print("\n🎯 Creando vistas de prueba...")
        try:
            conn.execute("""
                CREATE OR REPLACE VIEW dashboard_test AS
                SELECT
                    u.tipo,
                    u.nombre,
                    COUNT(s.producto_id) as productos_con_stock,
                    SUM(s.cantidad) as unidades_total,
                    ROUND(SUM(s.valor_inventario), 2) as valor_inventario
                FROM ubicaciones u
                LEFT JOIN stock_actual s ON u.id = s.ubicacion_id
                GROUP BY u.tipo, u.nombre
                ORDER BY valor_inventario DESC NULLS LAST
            """)

            result = conn.execute("SELECT * FROM dashboard_test LIMIT 5").fetchall()
            print("   ✓ Vista dashboard_test creada")
            print("   📊 Top 5 ubicaciones por valor de inventario:")
            for row in result:
                tipo, nombre, productos, unidades, valor = row
                valor_str = f"Bs {valor:,.2f}" if valor else "Sin stock"
                print(f"      {nombre} ({tipo}): {valor_str}")

        except Exception as e:
            print(f"   ❌ Error creando vista de prueba: {str(e)}")

        # Cerrar conexión
        conn.close()

        print(f"\n🎉 ¡Base de datos inicializada exitosamente!")
        print(f"📍 Ubicación: {db_path}")
        print(f"📊 Tamaño: {get_file_size(db_path)}")

        return True

    except Exception as e:
        print(f"❌ Error inicializando base de datos: {str(e)}")
        return False

def get_file_size(file_path):
    """Obtiene el tamaño del archivo en formato legible"""
    try:
        size = os.path.getsize(file_path)
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.2f} {unit}"
            size /= 1024.0
        return f"{size:.2f} TB"
    except:
        return "Desconocido"

def test_connection():
    """Prueba la conexión a la base de datos"""
    base_dir = Path(__file__).parent
    db_path = base_dir.parent / "data" / "fluxion_production.db"

    if not db_path.exists():
        print("❌ Base de datos no existe. Ejecuta init_database() primero.")
        return False

    try:
        conn = duckdb.connect(str(db_path))

        # Prueba simple
        result = conn.execute("SELECT 'Conexión exitosa' as status, CURRENT_TIMESTAMP as timestamp").fetchone()
        print(f"✅ {result[0]} - {result[1]}")

        # Estadísticas rápidas
        tables = ['ubicaciones', 'productos', 'facturas', 'items_facturas', 'stock_actual']
        print("\n📊 Estado actual de las tablas:")
        for table in tables:
            try:
                count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                print(f"   {table}: {count:,} registros")
            except:
                print(f"   {table}: No existe o error")

        conn.close()
        return True

    except Exception as e:
        print(f"❌ Error de conexión: {str(e)}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("  FLUXION AI - INICIALIZACIÓN DE BASE DE DATOS")
    print("=" * 60)

    # Inicializar base de datos
    success = init_database()

    if success:
        print("\n" + "=" * 60)
        print("Ejecutando test de conexión...")
        test_connection()
    else:
        print("\n❌ La inicialización falló. Revisa los errores arriba.")

    print("=" * 60)