#!/usr/bin/env python3
"""
Script para crear usuarios desde línea de comandos
Uso: python3 create_user_cli.py <username> <password> <nombre_completo> [email]
"""

import sys
from pathlib import Path

# Añadir directorio backend al path para importar módulos
sys.path.insert(0, str(Path(__file__).parent))

from auth import create_user

def main():
    """Crear usuario desde argumentos de línea de comandos"""

    if len(sys.argv) < 4:
        print("❌ Uso: python3 create_user_cli.py <username> <password> <nombre_completo> [email]")
        print("\nEjemplo:")
        print('  python3 create_user_cli.py jdoe "Password123!" "John Doe" "jdoe@example.com"')
        sys.exit(1)

    username = sys.argv[1]
    password = sys.argv[2]
    nombre_completo = sys.argv[3]
    email = sys.argv[4] if len(sys.argv) > 4 else None

    try:
        print(f"🔐 Creando usuario: {username}...")

        usuario = create_user(
            username=username,
            password=password,
            nombre_completo=nombre_completo,
            email=email
        )

        print(f"✅ Usuario creado exitosamente:")
        print(f"   👤 Username: {usuario.username}")
        print(f"   📝 Nombre: {usuario.nombre_completo}")
        print(f"   📧 Email: {usuario.email}")
        print(f"   🆔 ID: {usuario.id}")
        print(f"\n💡 El usuario puede iniciar sesión en: https://granja.fluxionia.co/login")

    except Exception as e:
        print(f"❌ Error creando usuario: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
