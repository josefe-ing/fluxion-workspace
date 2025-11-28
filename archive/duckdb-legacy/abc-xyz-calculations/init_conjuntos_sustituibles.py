"""
Script para inicializar tablas de conjuntos sustituibles e histórico ABC-XYZ
Ejecutar después de actualizar schema_extended.sql

Uso:
    python3 database/init_conjuntos_sustituibles.py
"""

import duckdb
import os
import sys

def init_conjuntos_sustituibles(db_path='data/fluxion_production.db'):
    """Inicializa estructura de conjuntos sustituibles e histórico ABC-XYZ"""

    if not os.path.exists(db_path):
        print(f"❌ Error: Base de datos no encontrada en {db_path}")
        print(f"   Asegúrate de que la ruta sea correcta")
        return False

    try:
        print(f"📦 Conectando a base de datos: {db_path}")
        conn = duckdb.connect(db_path)

        # Verificar si ya existen las tablas
        existing_tables = conn.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'main'
            AND table_name IN ('conjuntos_sustituibles', 'productos_abc_v2_historico')
        """).fetchall()

        existing_table_names = [t[0] for t in existing_tables]

        if 'conjuntos_sustituibles' in existing_table_names and 'productos_abc_v2_historico' in existing_table_names:
            print("ℹ️  Las tablas ya existen. Verificando estructura...")

        # Crear tabla de conjuntos sustituibles
        print("📝 Creando tabla conjuntos_sustituibles...")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS conjuntos_sustituibles (
                id VARCHAR PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL UNIQUE,
                descripcion VARCHAR(200),
                categoria VARCHAR(50),
                tipo_conjunto VARCHAR(50) DEFAULT 'sustituibles',
                activo BOOLEAN DEFAULT true,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Crear índices para conjuntos
        print("📝 Creando índices para conjuntos_sustituibles...")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_conjuntos_nombre ON conjuntos_sustituibles(nombre)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_conjuntos_categoria ON conjuntos_sustituibles(categoria)")

        # Crear tabla de histórico ABC-XYZ
        print("📝 Creando tabla productos_abc_v2_historico...")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS productos_abc_v2_historico (
                id VARCHAR PRIMARY KEY,
                codigo_producto VARCHAR(50) NOT NULL,
                ubicacion_id VARCHAR(20) NOT NULL,
                fecha_calculo DATE NOT NULL,
                clasificacion_abc_valor VARCHAR(20),
                clasificacion_xyz VARCHAR(1),
                matriz_abc_xyz VARCHAR(2),
                ranking_valor INTEGER,
                valor_consumo_total DECIMAL(18,2),
                porcentaje_valor DECIMAL(8,4),
                porcentaje_acumulado DECIMAL(8,4),
                coeficiente_variacion DECIMAL(8,4),
                demanda_promedio_semanal DECIMAL(12,4),
                UNIQUE(codigo_producto, ubicacion_id, fecha_calculo)
            )
        """)

        # Crear índices para histórico
        print("📝 Creando índices para productos_abc_v2_historico...")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_historico_codigo ON productos_abc_v2_historico(codigo_producto)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_historico_ubicacion ON productos_abc_v2_historico(ubicacion_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_historico_fecha ON productos_abc_v2_historico(fecha_calculo)")

        # Agregar campos de conjuntos a tabla productos si no existen
        print("📝 Verificando campos en tabla productos...")
        try:
            # Intentar agregar columnas (si ya existen, DuckDB lo ignorará con IF NOT EXISTS no disponible para ALTER)
            # Verificamos primero si existen
            columns = conn.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'productos'
                AND column_name IN ('conjunto_sustituible', 'es_lider_conjunto')
            """).fetchall()

            column_names = [c[0] for c in columns]

            if 'conjunto_sustituible' not in column_names:
                print("   Agregando campo conjunto_sustituible...")
                conn.execute("ALTER TABLE productos ADD COLUMN conjunto_sustituible VARCHAR(100)")
            else:
                print("   ✓ Campo conjunto_sustituible ya existe")

            if 'es_lider_conjunto' not in column_names:
                print("   Agregando campo es_lider_conjunto...")
                conn.execute("ALTER TABLE productos ADD COLUMN es_lider_conjunto BOOLEAN DEFAULT false")
            else:
                print("   ✓ Campo es_lider_conjunto ya existe")

        except Exception as e:
            print(f"   ⚠️  Advertencia al agregar campos: {e}")
            print("   (Esto es normal si los campos ya existen)")

        # Verificar que todo se creó correctamente
        print("\n📊 Verificando tablas creadas...")

        count_conjuntos = conn.execute("SELECT COUNT(*) FROM conjuntos_sustituibles").fetchone()[0]
        print(f"   ✓ conjuntos_sustituibles: {count_conjuntos} registros")

        count_historico = conn.execute("SELECT COUNT(*) FROM productos_abc_v2_historico").fetchone()[0]
        print(f"   ✓ productos_abc_v2_historico: {count_historico} registros")

        # Verificar tabla productos_abc_v2 existe (necesaria para los endpoints)
        try:
            count_abc_v2 = conn.execute("SELECT COUNT(*) FROM productos_abc_v2").fetchone()[0]
            print(f"   ✓ productos_abc_v2: {count_abc_v2} registros")
        except:
            print("   ⚠️  Tabla productos_abc_v2 no encontrada")
            print("   Ejecuta los scripts de cálculo ABC-XYZ primero:")
            print("   - python3 database/calcular_abc_v2_por_tienda.py")
            print("   - python3 database/calcular_xyz_por_tienda.py")

        conn.close()

        print("\n✅ Inicialización completada exitosamente")
        print("\n📌 Próximos pasos:")
        print("   1. Si no has calculado ABC-XYZ aún, ejecuta:")
        print("      python3 database/calcular_abc_v2_por_tienda.py")
        print("      python3 database/calcular_xyz_por_tienda.py")
        print("   2. Reinicia el backend: python3 backend/start.py")
        print("   3. Accede a /productos en el frontend")

        return True

    except Exception as e:
        print(f"\n❌ Error durante la inicialización: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    # Determinar path de la base de datos
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    else:
        db_path = 'data/fluxion_production.db'

    success = init_conjuntos_sustituibles(db_path)
    sys.exit(0 if success else 1)
