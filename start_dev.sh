#!/bin/bash

# Script para iniciar el entorno de desarrollo completo
# La Granja Mercado - Sistema de Inventarios

echo "=================================================="
echo "  🚀 FLUXION AI - LA GRANJA MERCADO"
echo "  Sistema de Inventarios en Tiempo Real"
echo "=================================================="
echo

# Función para verificar si un puerto está en uso
check_port() {
    if lsof -i :$1 > /dev/null 2>&1; then
        echo "⚠️  Puerto $1 está en uso"
        return 1
    else
        echo "✅ Puerto $1 disponible"
        return 0
    fi
}

# Función para iniciar el backend
start_backend() {
    echo "🔧 Iniciando Backend API..."

    # Verificar si la base de datos existe
    if [ ! -f "data/fluxion_production.db" ]; then
        echo "❌ Base de datos no encontrada. Ejecuta:"
        echo "   cd database && python3 init_db.py"
        echo "   cd database && python3 setup_extended_config.py"
        exit 1
    fi

    # Verificar puerto
    if ! check_port 8001; then
        echo "❌ Puerto 8001 ocupado. Libera el puerto e intenta nuevamente"
        exit 1
    fi

    # Iniciar backend en background
    cd backend
    echo "📡 Iniciando API en http://localhost:8001"
    python3 simple_api.py &
    BACKEND_PID=$!
    cd ..

    echo "✅ Backend iniciado (PID: $BACKEND_PID)"
    sleep 2
}

# Función para iniciar el frontend
start_frontend() {
    echo "🎨 Iniciando Frontend..."

    # Verificar puerto
    if ! check_port 3001; then
        echo "❌ Puerto 3001 ocupado. Libera el puerto e intenta nuevamente"
        exit 1
    fi

    # Ir al directorio del frontend
    cd services/frontend

    # Instalar dependencias si es necesario
    if [ ! -d "node_modules" ]; then
        echo "📦 Instalando dependencias..."
        npm install
    fi

    echo "🌐 Iniciando frontend en http://localhost:3001"
    npm run dev &
    FRONTEND_PID=$!
    cd ../..

    echo "✅ Frontend iniciado (PID: $FRONTEND_PID)"
    sleep 2
}

# Función para mostrar el estado
show_status() {
    echo
    echo "📊 ESTADO DEL SISTEMA:"
    echo "================================"
    echo "🔗 API Backend:    http://localhost:8001"
    echo "🔗 Documentación:  http://localhost:8001/docs"
    echo "🔗 Frontend:       http://localhost:3001"
    echo
    echo "📁 Base de datos:  data/fluxion_production.db"
    echo "📋 Ubicaciones:    20 (17 tiendas + 3 CEDIs)"
    echo "🏷️  Productos:      15 productos"
    echo "⚙️  Configuración:  300 configs producto-ubicación"
    echo
    echo "🛑 Para detener: Ctrl+C"
    echo "================================"
}

# Función para limpiar al salir
cleanup() {
    echo
    echo "🛑 Deteniendo servicios..."

    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        echo "✅ Backend detenido"
    fi

    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        echo "✅ Frontend detenido"
    fi

    echo "👋 ¡Hasta luego!"
    exit 0
}

# Trap para limpiar al salir
trap cleanup SIGINT SIGTERM

# Verificar directorio
if [ ! -f "database/init_db.py" ]; then
    echo "❌ Ejecuta este script desde el directorio raíz del proyecto"
    exit 1
fi

# Iniciar servicios
start_backend
start_frontend

# Mostrar estado
show_status

# Mantener el script corriendo
echo "⏳ Manteniendo servicios activos... (Ctrl+C para salir)"
wait