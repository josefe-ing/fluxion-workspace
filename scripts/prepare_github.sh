#!/bin/bash

# ========================================
# Script para preparar y subir a GitHub
# ========================================

set -e  # Exit on error

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          Preparando Fluxion AI para GitHub                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "README.md" ]; then
    echo "❌ Error: No estás en el directorio raíz de fluxion-workspace"
    exit 1
fi

echo "📋 Paso 1: Verificando git..."
if ! command -v git &> /dev/null; then
    echo "❌ Git no está instalado. Instálalo primero."
    exit 1
fi
echo "✅ Git instalado"

# Verificar si ya es un repositorio git
if [ ! -d ".git" ]; then
    echo ""
    echo "📋 Paso 2: Inicializando repositorio git..."
    git init
    echo "✅ Repositorio git inicializado"
else
    echo "✅ Ya es un repositorio git"
fi

echo ""
echo "📋 Paso 3: Verificando archivos a excluir..."

# Mostrar archivos que se van a ignorar
echo ""
echo "📁 Archivos/carpetas ignorados (según .gitignore):"
echo "   • data/ (bases de datos - 16GB+)"
echo "   • node_modules/ (dependencias npm)"
echo "   • venv/ (entornos virtuales Python)"
echo "   • __pycache__/ (cache Python)"
echo "   • dist/ build/ (builds compilados)"
echo "   • .env* (variables de entorno)"
echo "   • logs/ (archivos de log)"
echo ""

# Verificar que data/ no se vaya a commitear
if git check-ignore data/ > /dev/null 2>&1; then
    echo "✅ data/ correctamente ignorado"
else
    echo "⚠️  ADVERTENCIA: data/ podría ser comiteado (16GB+)"
    echo "   Verifica .gitignore antes de continuar"
    read -p "¿Deseas continuar? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "📋 Paso 4: Estado del repositorio..."
echo ""

# Mostrar archivos modificados
git status --short | head -20
total_files=$(git ls-files -o --exclude-standard | wc -l | tr -d ' ')
echo ""
echo "Total archivos sin trackear: $total_files"

echo ""
echo "📋 Paso 5: Agregando archivos al staging..."

# Agregar todos los archivos (respetando .gitignore)
git add .

# Verificar que data/ no está staged
if git diff --cached --name-only | grep -q "^data/"; then
    echo "❌ ERROR: Archivos de data/ están siendo agregados"
    echo "   Esto subiría 16GB+ a GitHub (no permitido)"
    exit 1
fi

echo "✅ Archivos agregados correctamente"

echo ""
echo "📋 Paso 6: Creando commit inicial..."
echo ""

# Crear commit
git commit -m "feat: initial commit - Fluxion AI Sistema de Gestión de Inventarios

- Backend: FastAPI + DuckDB con 81M+ registros
- Frontend: React + TypeScript + Vite
- Forecast: Modelo PMP con predicción día por día
- ETL: Sincronización 16 tiendas
- Pedidos: Sistema de sugerencias automáticas
- Dashboard: Análisis ventas e inventario en tiempo real

🤖 Generated with Claude Code
" || echo "⚠️  Ya existe un commit (saltando)"

echo "✅ Commit creado"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    ¡Listo para GitHub!                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "🚀 PRÓXIMOS PASOS:"
echo ""
echo "1. Crear repositorio en GitHub:"
echo "   https://github.com/new"
echo ""
echo "2. Nombre sugerido: fluxion-ai"
echo "   Descripción: Sistema de Gestión de Inventarios B2B con IA Predictiva"
echo "   Visibilidad: Private (recomendado)"
echo ""
echo "3. Una vez creado el repo, ejecuta:"
echo ""
echo "   git remote add origin https://github.com/TU_USUARIO/fluxion-ai.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "📝 IMPORTANTE:"
echo "   • NO subir archivos .env con credenciales"
echo "   • NO subir data/ (bases de datos)"
echo "   • Verificar .gitignore antes del push"
echo ""

# Mostrar estadísticas
echo "📊 ESTADÍSTICAS DEL REPOSITORIO:"
echo ""
echo "Archivos trackeados:"
git ls-files | wc -l | xargs echo "   •"
echo ""
echo "Tamaño estimado del repositorio:"
git count-objects -vH | grep "size-pack" || du -sh .git 2>/dev/null | awk '{print "   • " $1}'
echo ""

echo "✅ Script completado exitosamente"
