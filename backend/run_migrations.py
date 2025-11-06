#!/usr/bin/env python3
"""
Script para ejecutar migraciones de base de datos automáticamente.
Se ejecuta al iniciar el backend en producción.
"""
import os
import sys
from pathlib import Path
import duckdb
import logging

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Ruta de la base de datos
DB_PATH = Path(os.getenv('DATABASE_PATH', '/data/fluxion_production.db'))
# Ruta de migraciones: /app/database/migrations
MIGRATIONS_DIR = Path(__file__).parent / "database" / "migrations"


def get_applied_migrations(conn):
    """Obtiene lista de migraciones ya aplicadas"""
    try:
        result = conn.execute("""
            SELECT migration_name FROM schema_migrations
            ORDER BY applied_at
        """).fetchall()
        return [row[0] for row in result]
    except Exception:
        # Tabla no existe, primera vez
        return []


def create_migrations_table(conn):
    """Crea tabla de control de migraciones"""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY,
            migration_name VARCHAR NOT NULL UNIQUE,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    logger.info("✅ Tabla schema_migrations creada/verificada")


def apply_migration(conn, migration_file: Path):
    """Aplica una migración SQL"""
    migration_name = migration_file.name

    logger.info(f"📝 Aplicando migración: {migration_name}")

    # Leer SQL
    sql = migration_file.read_text()

    # Dividir en statements de forma más inteligente
    # Remover comentarios inline y líneas vacías
    lines = []
    for line in sql.split('\n'):
        # Remover comentarios inline (después de --)
        if '--' in line:
            line = line[:line.index('--')]
        line = line.strip()
        # Skip líneas vacías
        if not line:
            continue
        lines.append(line)

    # Unir y dividir por punto y coma
    cleaned_sql = ' '.join(lines)
    statements = [s.strip() for s in cleaned_sql.split(';') if s.strip()]

    # Ejecutar cada statement
    for i, statement in enumerate(statements, 1):
        if statement:
            try:
                logger.debug(f"  Ejecutando statement {i}/{len(statements)}")
                conn.execute(statement)
            except Exception as e:
                logger.error(f"❌ Error en statement {i}: {str(e)}")
                logger.error(f"Statement: {statement[:500]}...")
                raise

    # Registrar migración aplicada
    conn.execute("""
        INSERT INTO schema_migrations (migration_name)
        VALUES (?)
    """, [migration_name])

    conn.commit()
    logger.info(f"✅ Migración aplicada: {migration_name}")


def run_data_migration(conn):
    """Ejecuta script de migración de datos en Python"""
    migration_name = "migrate_tiendas_config_to_db.py"

    logger.info(f"🔄 Ejecutando migración de datos: {migration_name}")

    try:
        # Verificar si ya fue aplicada
        result = conn.execute("""
            SELECT COUNT(*) FROM schema_migrations
            WHERE migration_name = ?
        """, [migration_name]).fetchone()

        if result[0] > 0:
            logger.info(f"⏭️  Migración de datos ya aplicada: {migration_name}")
            return

        # Importar y ejecutar desde el mismo directorio
        from migrate_tiendas_config_to_db import main as migrate_main
        migrate_main()

        # Registrar como aplicada
        conn.execute("""
            INSERT INTO schema_migrations (migration_name)
            VALUES (?)
        """, [migration_name])
        conn.commit()

        logger.info(f"✅ Migración de datos aplicada: {migration_name}")

    except Exception as e:
        logger.error(f"❌ Error en migración de datos: {str(e)}")
        raise


def run_migrations():
    """Ejecuta todas las migraciones pendientes"""
    logger.info("🚀 Iniciando proceso de migraciones...")
    logger.info(f"📂 Base de datos: {DB_PATH}")

    if not DB_PATH.exists():
        logger.error(f"❌ Base de datos no encontrada: {DB_PATH}")
        sys.exit(1)

    # Conectar a la BD
    conn = duckdb.connect(str(DB_PATH))

    try:
        # Crear tabla de control de migraciones
        create_migrations_table(conn)

        # Obtener migraciones aplicadas
        applied = get_applied_migrations(conn)
        logger.info(f"📋 Migraciones aplicadas: {len(applied)}")

        # Buscar archivos de migración SQL
        sql_migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))

        for migration_file in sql_migrations:
            migration_name = migration_file.name

            if migration_name in applied:
                logger.info(f"⏭️  Migración ya aplicada: {migration_name}")
                continue

            apply_migration(conn, migration_file)

        # Ejecutar migración de datos de tiendas_config.py
        run_data_migration(conn)

        logger.info("✅ Todas las migraciones completadas exitosamente")

    except Exception as e:
        logger.error(f"❌ Error durante migraciones: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    run_migrations()
