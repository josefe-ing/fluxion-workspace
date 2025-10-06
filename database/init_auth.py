#!/usr/bin/env python3
"""
Inicializa la tabla de autenticación y crea un usuario admin por defecto
"""
import duckdb
from pathlib import Path
import bcrypt
import uuid

# Ruta a la base de datos
DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"

def hash_password(password: str) -> str:
    """Hashea una contraseña usando bcrypt"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def init_auth_schema():
    """Inicializa el esquema de autenticación"""
    if not DB_PATH.exists():
        print(f"❌ Error: Base de datos no encontrada en {DB_PATH}")
        return

    print(f"📊 Conectando a base de datos: {DB_PATH}")
    conn = duckdb.connect(str(DB_PATH))

    try:
        # Leer y ejecutar el schema de autenticación
        schema_path = Path(__file__).parent / "auth_schema.sql"
        print(f"📄 Ejecutando schema desde: {schema_path}")

        with open(schema_path, 'r') as f:
            schema_sql = f.read()

        conn.execute(schema_sql)
        print("✅ Tabla 'usuarios' creada exitosamente")

        # Verificar si ya existe el usuario admin
        result = conn.execute("SELECT COUNT(*) FROM usuarios WHERE username = 'admin'").fetchone()

        if result[0] == 0:
            # Crear usuario admin por defecto
            admin_id = str(uuid.uuid4())
            admin_password = "admin123"  # Cambiar esto en producción
            password_hash = hash_password(admin_password)

            conn.execute("""
                INSERT INTO usuarios (id, username, password_hash, nombre_completo, email, activo)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (admin_id, 'admin', password_hash, 'Administrador', 'admin@fluxion.ai', True))

            print("✅ Usuario admin creado exitosamente")
            print(f"   Username: admin")
            print(f"   Password: {admin_password}")
            print("   ⚠️  IMPORTANTE: Cambiar esta contraseña en producción")
        else:
            print("ℹ️  Usuario admin ya existe")

        # Mostrar usuarios actuales
        usuarios = conn.execute("SELECT username, nombre_completo, email, activo FROM usuarios").fetchall()
        print(f"\n📋 Usuarios en el sistema ({len(usuarios)}):")
        for user in usuarios:
            status = "✅" if user[3] else "❌"
            print(f"   {status} {user[0]} - {user[1]} ({user[2]})")

        conn.close()
        print("\n✅ Inicialización completada")

    except Exception as e:
        print(f"❌ Error al inicializar: {e}")
        conn.close()
        raise

if __name__ == "__main__":
    init_auth_schema()
