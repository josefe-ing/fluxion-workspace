#!/usr/bin/env python3
"""
Script para crear usuario jfernandez en producción
"""
import sys
from pathlib import Path

# Añadir directorio backend al path para importar módulos
sys.path.insert(0, str(Path(__file__).parent))

from auth import create_user

def main():
    """Crear usuario jfernandez"""
    try:
        print("🔐 Creando usuario para José Fernández...")

        usuario = create_user(
            username="jfernandez",
            password="Granja2024!",  # Contraseña temporal - cambiar después del primer login
            nombre_completo="José Fernández",
            email="jfernandez@lagranja.com"
        )

        print(f"✅ Usuario creado exitosamente!")
        print(f"   - ID: {usuario.id}")
        print(f"   - Username: {usuario.username}")
        print(f"   - Nombre: {usuario.nombre_completo}")
        print(f"   - Email: {usuario.email}")
        print(f"   - Activo: {usuario.activo}")
        print()
        print("📝 CREDENCIALES DE ACCESO:")
        print(f"   Username: jfernandez")
        print(f"   Password: Granja2024!")
        print()
        print("⚠️  IMPORTANTE: Cambiar la contraseña después del primer login")

    except Exception as e:
        print(f"❌ Error creando usuario: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
