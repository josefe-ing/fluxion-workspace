#!/usr/bin/env python3
"""
Script para resetear la contraseña del admin
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import duckdb
from passlib.context import CryptContext

DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def main():
    """Reset admin password"""
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=False)

        # Generate new hash for admin123
        new_password_hash = pwd_context.hash("admin123")

        # Update admin password
        conn.execute("""
            UPDATE usuarios
            SET password_hash = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE username = 'admin'
        """, (new_password_hash,))

        # Verify update
        result = conn.execute("""
            SELECT username, nombre_completo, email
            FROM usuarios
            WHERE username = 'admin'
        """).fetchone()

        if result:
            print(f"✅ Contraseña del admin reseteada exitosamente")
            print(f"   Username: {result[0]}")
            print(f"   Nombre: {result[1]}")
            print(f"   Email: {result[2]}")
            print(f"   Nueva contraseña: admin123")
        else:
            print("❌ Usuario admin no encontrado")

        conn.close()

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
