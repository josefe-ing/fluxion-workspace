#!/usr/bin/env python3
"""
Script para crear usuario jfernandez en producción vía AWS ECS
Se ejecuta directamente en el contenedor del backend
"""
import sys
import os

# Asegurar que estamos en el directorio correcto
os.chdir('/app/backend')
sys.path.insert(0, '/app/backend')

from auth import create_user

try:
    print("🔐 Creando usuario jfernandez en PRODUCCIÓN...")

    usuario = create_user(
        username="jfernandez",
        password="Granja2024!",
        nombre_completo="José Fernández",
        email="jfernandez@lagranja.com"
    )

    print(f"✅ Usuario creado exitosamente en PRODUCCIÓN!")
    print(f"   Username: {usuario.username}")
    print(f"   Nombre: {usuario.nombre_completo}")
    print(f"   Email: {usuario.email}")
    print(f"   Activo: {usuario.activo}")

except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
