#!/usr/bin/env python3
"""
Script para crear usuarios en Fluxion AI
Requiere que estés autenticado como admin
"""
import requests
import sys
import json
from getpass import getpass

# URL del backend
API_BASE_URL = "http://fluxion-alb-1002393067.us-east-1.elb.amazonaws.com"

def login(username: str, password: str) -> str:
    """Login y obtener token JWT"""
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/auth/login",
            json={"username": username, "password": password}
        )
        response.raise_for_status()
        return response.json()["access_token"]
    except requests.exceptions.RequestException as e:
        print(f"❌ Error al hacer login: {e}")
        sys.exit(1)

def create_user(token: str, username: str, password: str, nombre_completo: str = None, email: str = None):
    """Crear un nuevo usuario"""
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/auth/register",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "username": username,
                "password": password,
                "nombre_completo": nombre_completo,
                "email": email
            }
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"❌ Error al crear usuario: {e}")
        if hasattr(e.response, 'text'):
            print(f"   Detalle: {e.response.text}")
        sys.exit(1)

def main():
    print("=" * 60)
    print("  CREAR USUARIO - FLUXION AI")
    print("=" * 60)
    print()

    # Login como admin
    print("🔐 Primero, inicia sesión con tu usuario admin:")
    admin_username = input("   Usuario admin: ").strip()
    admin_password = getpass("   Contraseña admin: ")

    print("\n⏳ Autenticando...")
    token = login(admin_username, admin_password)
    print("✅ Autenticación exitosa\n")

    # Datos del nuevo usuario
    print("📝 Datos del nuevo usuario:")
    new_username = input("   Username: ").strip()
    new_password = getpass("   Password: ")
    new_password_confirm = getpass("   Confirmar password: ")

    if new_password != new_password_confirm:
        print("\n❌ Las contraseñas no coinciden")
        sys.exit(1)

    new_nombre = input("   Nombre completo (opcional): ").strip() or None
    new_email = input("   Email (opcional): ").strip() or None

    # Crear usuario
    print(f"\n⏳ Creando usuario '{new_username}'...")
    user = create_user(token, new_username, new_password, new_nombre, new_email)

    # Mostrar resultado
    print("\n✅ Usuario creado exitosamente!")
    print(f"\n   ID: {user['id']}")
    print(f"   Username: {user['username']}")
    if user.get('nombre_completo'):
        print(f"   Nombre: {user['nombre_completo']}")
    if user.get('email'):
        print(f"   Email: {user['email']}")
    print(f"   Activo: {'Sí' if user['activo'] else 'No'}")
    print()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Operación cancelada")
        sys.exit(0)
