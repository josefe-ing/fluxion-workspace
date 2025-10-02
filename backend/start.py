#!/usr/bin/env python3
"""
Script de inicio para el backend FastAPI de Fluxion AI
"""

import os
import sys
from pathlib import Path
import subprocess

def check_database():
    """Verifica que la base de datos existe"""
    db_path = Path(__file__).parent.parent / "data" / "fluxion_production.db"

    if not db_path.exists():
        print("❌ Base de datos no encontrada en:", db_path)
        print("🔧 Ejecuta primero:")
        print("   cd database && python init_db.py")
        print("   cd database && python setup_extended_config.py")
        return False

    print(f"✅ Base de datos encontrada: {db_path}")

    # Verificar tamaño
    size = db_path.stat().st_size
    size_mb = size / (1024 * 1024)
    print(f"📊 Tamaño: {size_mb:.2f} MB")

    return True

def install_dependencies():
    """Instala las dependencias de Python"""
    requirements_path = Path(__file__).parent / "requirements.txt"

    if not requirements_path.exists():
        print("❌ Archivo requirements.txt no encontrado")
        return False

    print("📦 Instalando dependencias...")
    try:
        subprocess.run([
            sys.executable, "-m", "pip", "install", "-r", str(requirements_path)
        ], check=True, capture_output=True)
        print("✅ Dependencias instaladas")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Error instalando dependencias: {e}")
        return False

def start_server():
    """Inicia el servidor FastAPI"""
    print("🚀 Iniciando servidor FastAPI...")
    print("🌐 API estará disponible en: http://localhost:8000")
    print("📖 Documentación en: http://localhost:8000/docs")
    print("⚡ Modo desarrollo con auto-reload habilitado")
    print("\n" + "="*60)

    # Cambiar al directorio del backend
    os.chdir(Path(__file__).parent)

    # Iniciar uvicorn
    os.system("python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload")

if __name__ == "__main__":
    print("=" * 60)
    print("  FLUXION AI - BACKEND API")
    print("  La Granja Mercado")
    print("=" * 60)

    # Verificar base de datos
    if not check_database():
        sys.exit(1)

    # Instalar dependencias
    if not install_dependencies():
        sys.exit(1)

    print("\n" + "=" * 60)

    # Iniciar servidor
    start_server()