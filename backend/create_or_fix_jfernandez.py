#!/usr/bin/env python3
"""
Script para crear o resetear la contraseña de jfernandez
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import duckdb
import uuid
from passlib.context import CryptContext

DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def main():
    """Create or reset jfernandez password"""
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=False)

        # Check if user exists
        existing = conn.execute("""
            SELECT id, username FROM usuarios WHERE username = 'jfernandez'
        """).fetchone()

        # Generate password hash
        password_hash = pwd_context.hash("Granja2024!")

        if existing:
            # Update existing user
            conn.execute("""
                UPDATE usuarios
                SET password_hash = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE username = 'jfernandez'
            """, (password_hash,))
            print(f"✅ Contraseña de jfernandez reseteada exitosamente")
        else:
            # Create new user
            user_id = str(uuid.uuid4())
            conn.execute("""
                INSERT INTO usuarios (id, username, password_hash, nombre_completo, email, activo, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, (user_id, "jfernandez", password_hash, "José Fernández", "jfernandez@lagranja.com", True))
            print(f"✅ Usuario jfernandez creado exitosamente")

        # Verify
        result = conn.execute("""
            SELECT username, nombre_completo, email, activo
            FROM usuarios
            WHERE username = 'jfernandez'
        """).fetchone()

        if result:
            print(f"   Username: {result[0]}")
            print(f"   Nombre: {result[1]}")
            print(f"   Email: {result[2]}")
            print(f"   Activo: {result[3]}")
            print(f"   Contraseña: Granja2024!")

        conn.close()

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
