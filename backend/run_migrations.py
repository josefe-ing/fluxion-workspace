#!/usr/bin/env python3
"""
Script para aplicar migraciones ABC-XYZ a producción
Este script se ejecuta como un comando de inicio en el contenedor
"""
import os
import sys
import duckdb
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def apply_migrations():
    """Aplica las migraciones de base de datos si no existen las tablas"""
    db_path = os.getenv('DATABASE_PATH', '/data/fluxion_production.db')

    if not os.path.exists(db_path):
        logger.error(f"Base de datos no encontrada en {db_path}")
        return False

    try:
        conn = duckdb.connect(db_path)

        # Verificar si la tabla productos_abc_v2 existe
        result = conn.execute("""
            SELECT COUNT(*) as count
            FROM information_schema.tables
            WHERE table_name = 'productos_abc_v2'
        """).fetchone()

        if result[0] > 0:
            logger.info("✅ Tabla productos_abc_v2 ya existe, verificando columnas XYZ...")

            # Verificar si las columnas XYZ existen
            columns_result = conn.execute("""
                SELECT COUNT(*) as count
                FROM information_schema.columns
                WHERE table_name = 'productos_abc_v2'
                AND column_name = 'clasificacion_xyz'
            """).fetchone()

            if columns_result[0] > 0:
                logger.info("✅ Columnas XYZ ya existen, recreando vistas...")
            else:
                logger.info("📝 Aplicando extensión XYZ...")
        else:
            logger.info("📝 Creando tabla productos_abc_v2...")

        # PASO 1: Ejecutar migración destructiva si la tabla existe con schema antiguo
        if result[0] > 0:
            # Verificar si tiene el schema antiguo (producto_id en vez de codigo_producto)
            old_schema_check = conn.execute("""
                SELECT COUNT(*) as count
                FROM information_schema.columns
                WHERE table_name = 'productos_abc_v2'
                AND column_name = 'producto_id'
            """).fetchone()

            if old_schema_check[0] > 0:
                logger.warning("⚠️  Detectado schema antiguo (producto_id), recreando tabla...")
                migrate_script = Path('/app/database/migrate_abc_v2_schema.sql')
                if migrate_script.exists():
                    logger.info("Ejecutando migración destructiva...")
                    with open(migrate_script, 'r') as f:
                        sql_content = f.read()
                        statements = [s.strip() for s in sql_content.split(';') if s.strip()]
                        for stmt in statements:
                            if stmt and not stmt.startswith('--'):
                                try:
                                    conn.execute(stmt)
                                    logger.info(f"✅ Ejecutado: {stmt[:50]}...")
                                except Exception as e:
                                    logger.warning(f"⚠️  Error en migración (ignorado): {e}")

        # Aplicar schema_abc_v2.sql
        schema_abc_v2_path = Path('/app/database/schema_abc_v2.sql')
        if schema_abc_v2_path.exists():
            logger.info(f"Aplicando {schema_abc_v2_path}...")
            with open(schema_abc_v2_path, 'r') as f:
                sql_content = f.read()
                # Ejecutar cada statement por separado
                statements = [s.strip() for s in sql_content.split(';') if s.strip()]
                for stmt in statements:
                    if stmt:
                        try:
                            conn.execute(stmt)
                            logger.info(f"✅ Ejecutado: {stmt[:50]}...")
                        except Exception as e:
                            # Ignorar errores de "ya existe"
                            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                                logger.info(f"⚠️  Ya existe: {stmt[:50]}...")
                            else:
                                raise

        # Aplicar schema_abc_xyz.sql
        schema_xyz_path = Path('/app/database/schema_abc_xyz.sql')
        if schema_xyz_path.exists():
            logger.info(f"Aplicando {schema_xyz_path}...")
            with open(schema_xyz_path, 'r') as f:
                sql_content = f.read()
                statements = [s.strip() for s in sql_content.split(';') if s.strip()]
                for stmt in statements:
                    if stmt:
                        try:
                            conn.execute(stmt)
                            logger.info(f"✅ Ejecutado: {stmt[:50]}...")
                        except Exception as e:
                            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                                logger.info(f"⚠️  Ya existe: {stmt[:50]}...")
                            else:
                                raise

        conn.close()
        logger.info("✅ Migraciones aplicadas exitosamente")
        return True

    except Exception as e:
        logger.error(f"❌ Error aplicando migraciones: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    success = apply_migrations()
    sys.exit(0 if success else 1)
