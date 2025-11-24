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
        # STEP 1: Verificar estado con conexión READ-ONLY (no bloquea)
        logger.info("🔍 Verificando estado de tablas en modo read-only...")
        conn_ro = duckdb.connect(db_path, read_only=True)

        # Verificar si la tabla productos_abc_v2 existe
        result = conn_ro.execute("""
            SELECT COUNT(*) as count
            FROM information_schema.tables
            WHERE table_name = 'productos_abc_v2'
        """).fetchone()

        tabla_existe = result[0] > 0

        # Verificar si las columnas XYZ existen
        if tabla_existe:
            columns_result = conn_ro.execute("""
                SELECT COUNT(*) as count
                FROM information_schema.columns
                WHERE table_name = 'productos_abc_v2'
                AND column_name = 'clasificacion_xyz'
            """).fetchone()
            columnas_xyz_existen = columns_result[0] > 0
        else:
            columnas_xyz_existen = False

        conn_ro.close()

        # Si todo ya existe, no necesitamos hacer nada
        if tabla_existe and columnas_xyz_existen:
            logger.info("✅ Tabla productos_abc_v2 y columnas XYZ ya existen - sin cambios necesarios")
            logger.info("⏭️  Saltando migraciones (todo actualizado)")
            return True

        # STEP 2: Solo si necesitamos migrar, intentar obtener lock de escritura
        logger.info("📝 Migraciones necesarias, intentando obtener lock de escritura...")
        try:
            # Intentar conectar con timeout corto
            conn = duckdb.connect(db_path)
        except Exception as lock_error:
            if "Conflicting lock" in str(lock_error):
                logger.warning("⚠️  Base de datos bloqueada por otro proceso (probablemente backend existente)")
                logger.info("⏭️  Saltando migraciones - se aplicarán en próximo deploy")
                return True  # No es un error crítico
            else:
                raise

        if tabla_existe:
            logger.info("✅ Tabla productos_abc_v2 ya existe, verificando columnas XYZ...")
            if columnas_xyz_existen:
                logger.info("✅ Columnas XYZ ya existen, recreando vistas...")
            else:
                logger.info("📝 Aplicando extensión XYZ...")
        else:
            logger.info("📝 Creando tabla productos_abc_v2...")

        # PASO 1: Siempre recrear tabla si existe para asegurar schema correcto
        # Los datos son calculados y pueden regenerarse, así evitamos problemas de constraints
        if tabla_existe:
            logger.warning("⚠️  Tabla productos_abc_v2 existe, recreando para asegurar schema correcto...")
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
