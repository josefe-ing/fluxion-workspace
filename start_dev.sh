#!/bin/bash
# Script para iniciar el entorno de desarrollo de Fluxion

set -e
echo "🚀 Iniciando Fluxion Development Environment"
echo ""

# Verificar directorio
if [ ! -f "backend/main.py" ]; then
    echo "❌ Error: Ejecuta desde el directorio raíz"
    exit 1
fi

# Limpiar puertos
echo "🧹 Limpiando puertos..."
lsof -ti :8001 | xargs kill -9 2>/dev/null || true
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
sleep 1

# Verificar PostgreSQL
echo "🔍 Verificando PostgreSQL..."
if ! docker ps | grep -q fluxion-postgres; then
    echo "❌ PostgreSQL no está corriendo. Iniciando contenedor..."
    docker-compose up -d postgres
    echo "⏳ Esperando que PostgreSQL esté listo..."
    sleep 5
fi
echo "✓ PostgreSQL OK"

# Backend
echo ""
echo "🔧 Iniciando Backend..."
cd backend
[ ! -d "venv" ] && python3 -m venv venv
source venv/bin/activate
pip install -q -r requirements.txt
nohup uvicorn main:app --host 0.0.0.0 --port 8001 --reload > /tmp/fluxion_backend.log 2>&1 &
echo $! > /tmp/fluxion_backend.pid
sleep 3
echo "✓ Backend: http://localhost:8001 (PID: $(cat /tmp/fluxion_backend.pid))"
cd ..

# Frontend
echo ""
echo "⚛️  Iniciando Frontend..."
cd frontend
[ ! -d "node_modules" ] && npm install
nohup npm run dev > /tmp/fluxion_frontend.log 2>&1 &
echo $! > /tmp/fluxion_frontend.pid
sleep 5
echo "✓ Frontend: http://localhost:3000 (PID: $(cat /tmp/fluxion_frontend.pid))"
cd ..

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Fluxion listo!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Backend:  http://localhost:8001"
echo "⚛️  Frontend: http://localhost:3000"
echo ""
echo "📝 Logs:"
echo "  • Backend:  tail -f /tmp/fluxion_backend.log"
echo "  • Frontend: tail -f /tmp/fluxion_frontend.log"
echo ""
echo "🛑 Detener: ./stop_dev.sh"
echo ""
