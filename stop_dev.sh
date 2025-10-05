#!/bin/bash
# Script para detener el entorno de desarrollo de Fluxion

echo "🛑 Deteniendo Fluxion Development Environment"
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Detener backend
if [ -f /tmp/fluxion_backend.pid ]; then
    BACKEND_PID=$(cat /tmp/fluxion_backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Deteniendo Backend (PID: $BACKEND_PID)"
        kill $BACKEND_PID 2>/dev/null || kill -9 $BACKEND_PID 2>/dev/null
    fi
    rm /tmp/fluxion_backend.pid
fi

# Detener frontend
if [ -f /tmp/fluxion_frontend.pid ]; then
    FRONTEND_PID=$(cat /tmp/fluxion_frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Deteniendo Frontend (PID: $FRONTEND_PID)"
        kill $FRONTEND_PID 2>/dev/null || kill -9 $FRONTEND_PID 2>/dev/null
    fi
    rm /tmp/fluxion_frontend.pid
fi

# Matar cualquier proceso residual en los puertos
echo ""
echo "🧹 Limpiando puertos..."
lsof -ti :8001 | xargs kill -9 2>/dev/null && echo -e "  ${GREEN}✓${NC} Puerto 8001 liberado" || echo "  • Puerto 8001 ya libre"
lsof -ti :3000 | xargs kill -9 2>/dev/null && echo -e "  ${GREEN}✓${NC} Puerto 3000 liberado" || echo "  • Puerto 3000 ya libre"

echo ""
echo -e "${GREEN}✅ Todos los servicios detenidos${NC}"
echo ""
