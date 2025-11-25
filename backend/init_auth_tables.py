"""
Script ligero para inicializar solo las tablas de autenticación
Se ejecuta ANTES de iniciar FastAPI para evitar OOM
Solo crea las tablas mínimas necesarias sin cargar toda la base en memoria
"""
import os
import sys
import duckdb
from pathlib import Path

def init_auth_tables():
    """
    Crea las tablas de autenticación si no existen
    Usa una conexión ligera que NO carga toda la base de datos en memoria
    """
    db_path = os.getenv('DATABASE_PATH', '/data/fluxion_production.db')

    if not os.path.exists(db_path):
        print(f"❌ Base de datos no encontrada en {db_path}")
        return False

    try:
        print("🔐 Inicializando tablas de autenticación...")

        # Conexión ligera: solo para verificar/crear tablas
        conn = duckdb.connect(db_path, read_only=False)

        # Verificar si la tabla usuarios ya existe
        result = conn.execute("""
            SELECT COUNT(*) as count
            FROM information_schema.tables
            WHERE table_name = 'usuarios'
        """).fetchone()

        if result[0] > 0:
            print("✅ Tabla 'usuarios' ya existe")
            conn.close()
            return True

        print("📝 Creando tabla 'usuarios'...")

        # Crear tabla usuarios
        conn.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id VARCHAR PRIMARY KEY,
                username VARCHAR UNIQUE NOT NULL,
                password_hash VARCHAR NOT NULL,
                nombre_completo VARCHAR,
                email VARCHAR,
                activo BOOLEAN DEFAULT true,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ultimo_login TIMESTAMP
            )
        """)

        # Crear usuario admin por defecto
        print("👤 Creando usuario admin por defecto...")
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        admin_password_hash = pwd_context.hash("admin123")  # Cambiar en producción

        conn.execute("""
            INSERT INTO usuarios (id, username, password_hash, nombre_completo, email, activo)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            'admin-001',
            'admin',
            admin_password_hash,
            'Administrador',
            'admin@fluxion.ai',
            True
        ))

        conn.close()

        print("✅ Tablas de autenticación inicializadas correctamente")
        print("   Usuario: admin")
        print("   Password: admin123")
        return True

    except Exception as e:
        print(f"❌ Error inicializando tablas de autenticación: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = init_auth_tables()
    sys.exit(0 if success else 1)
