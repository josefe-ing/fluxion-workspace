#!/usr/bin/env python3
"""
Script para migrar datos desde tiendas_config.py a la tabla ubicaciones
Aplica la migración 003 y popula los nuevos campos con datos de configuración
"""

import sys
from pathlib import Path
import duckdb

# Add parent directory to path to import tiendas_config
sys.path.insert(0, str(Path(__file__).parent.parent / 'etl' / 'core'))

from tiendas_config import TIENDAS_CONFIG

# Database path
DB_PATH = Path(__file__).parent.parent / 'data' / 'fluxion_production.db'

def aplicar_migracion():
    """Aplica la migración SQL y migra datos desde Python config"""

    print("🔄 Aplicando migración 003_extend_ubicaciones_admin.sql...")

    conn = duckdb.connect(str(DB_PATH))

    try:
        # 0. Disable foreign key checks temporarily to allow updates
        # DuckDB has issues with FK checks during bulk updates
        # Note: DuckDB uses 'disabled_optimizers' approach or pragma foreign_keys
        try:
            conn.execute("PRAGMA disable_fkeys;")
            print("⚙️  Restricciones de claves foráneas temporalmente desactivadas")
        except:
            # If pragma doesn't work, continue anyway - we'll handle errors
            print("⚠️  No se pudieron desactivar las FK checks (continuando...)")

        # 1. Aplicar migración SQL
        migration_path = Path(__file__).parent / 'migrations' / '003_extend_ubicaciones_admin.sql'
        with open(migration_path, 'r') as f:
            migration_sql = f.read()

        conn.execute(migration_sql)
        print("✅ Migración SQL aplicada correctamente")

        # 2. Migrar datos desde TIENDAS_CONFIG
        print("\n📦 Migrando datos desde tiendas_config.py...")

        migrated_count = 0

        for ubicacion_id, config in TIENDAS_CONFIG.items():
            # Check if ubicacion exists
            result = conn.execute(
                "SELECT id FROM ubicaciones WHERE id = ?",
                [ubicacion_id]
            ).fetchone()

            if result:
                # UPDATE existing record - only update new SQL Server connection fields
                # Don't update nombre, tipo, or activo to avoid FK conflicts
                conn.execute("""
                    UPDATE ubicaciones
                    SET
                        server_ip = ?,
                        server_port = ?,
                        database_name = ?,
                        codigo_deposito = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, [
                    config.server_ip,
                    config.port,
                    config.database_name,
                    config.codigo_deposito,
                    ubicacion_id
                ])
                print(f"   ✏️  Actualizado: {ubicacion_id} - {config.ubicacion_nombre}")
            else:
                # INSERT new record
                conn.execute("""
                    INSERT INTO ubicaciones (
                        id, codigo, nombre, tipo,
                        server_ip, server_port, database_name, codigo_deposito,
                        activo, visible_pedidos, visible_reportes, visible_dashboards
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    ubicacion_id,
                    config.codigo_deposito[:3] if config.codigo_deposito else ubicacion_id[:3],
                    config.ubicacion_nombre,
                    config.tipo,
                    config.server_ip,
                    config.port,
                    config.database_name,
                    config.codigo_deposito,
                    config.activo,
                    False,  # visible_pedidos - set manually below
                    True,   # visible_reportes
                    True    # visible_dashboards
                ])
                print(f"   ➕ Creado: {ubicacion_id} - {config.ubicacion_nombre}")

            migrated_count += 1

        print(f"\n✅ Migrados {migrated_count} ubicaciones")

        # 3. Configurar visible_pedidos para las ubicaciones solicitadas
        print("\n🎯 Configurando visibilidad en pedidos sugeridos...")
        print("   ⚠️  NOTA: DuckDB 1.4.1 tiene un bug con UPDATE en tablas con FK")
        print("   ⚠️  La configuración de visible_pedidos se hará manualmente vía SQL o API")
        print("   ⚠️  Por ahora, todas las ubicaciones tienen visible_pedidos=false (default)")
        print()
        print("   Para activar manualmente, ejecuta:")
        print("   ")
        print("   python3 -c \"import duckdb; conn = duckdb.connect('data/fluxion_production.db', config={'threads': 1}); \"\\")
        print("   conn.execute('ALTER TABLE ubicaciones DROP CONSTRAINT ubicaciones_ubicacion_id_fkey'); \"\\")
        print("   conn.execute('UPDATE ubicaciones SET visible_pedidos = true WHERE id IN (\\\"cedi_seco\\\", \\\"tienda_01\\\", \\\"tienda_08\\\", \\\"tienda_03\\\")'); \"\\")
        print("   conn.close()\"")
        print()
        print("   O simplemente usa el panel de administración una vez implementado.")

        # 5. Mostrar resumen
        print("\n📊 Resumen de ubicaciones:")

        result = conn.execute("""
            SELECT
                tipo,
                COUNT(*) as total,
                SUM(CASE WHEN activo THEN 1 ELSE 0 END) as activos,
                SUM(CASE WHEN visible_pedidos THEN 1 ELSE 0 END) as visibles_pedidos
            FROM ubicaciones
            GROUP BY tipo
            ORDER BY tipo
        """).fetchall()

        print("\n┌─────────────┬───────┬─────────┬──────────────────┐")
        print("│ Tipo        │ Total │ Activos │ Visible Pedidos  │")
        print("├─────────────┼───────┼─────────┼──────────────────┤")

        for row in result:
            tipo, total, activos, visibles = row
            print(f"│ {tipo:11s} │ {total:5d} │ {activos:7d} │ {visibles:16d} │")

        print("└─────────────┴───────┴─────────┴──────────────────┘")

        # 5. Listar ubicaciones visibles en pedidos
        print("\n🏪 Ubicaciones visibles en Pedidos Sugeridos:")

        result = conn.execute("""
            SELECT id, nombre, tipo
            FROM ubicaciones
            WHERE visible_pedidos = true
            ORDER BY tipo, nombre
        """).fetchall()

        for ubicacion_id, nombre, tipo in result:
            print(f"   • {nombre} ({tipo})")

        conn.close()

        print("\n✅ Migración completada exitosamente!")

    except Exception as e:
        print(f"\n❌ Error durante la migración: {e}")
        conn.close()
        raise

if __name__ == "__main__":
    print("=" * 60)
    print("  MIGRACIÓN DE UBICACIONES - FASE 1")
    print("=" * 60)
    print()

    if not DB_PATH.exists():
        print(f"❌ Error: Base de datos no encontrada en {DB_PATH}")
        print("   Por favor, ejecuta init_db.py primero")
        sys.exit(1)

    aplicar_migracion()
