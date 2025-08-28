#!/bin/bash

# Fluxion AI - Demo Launcher
# ===========================

set -e

CLIENT=${1:-la-granja}
TYPE=${2:-executive}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Demo directory
DEMO_DIR="demos/clients/$CLIENT"

# Check if client exists
if [ ! -d "$DEMO_DIR" ]; then
    echo -e "${RED}❌ Cliente '$CLIENT' no encontrado${NC}"
    echo -e "${YELLOW}Clientes disponibles:${NC}"
    ls -1 demos/clients/ | grep -v _template | sed 's/^/  • /'
    exit 1
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               FLUXION AI - Demo System                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Cliente:${NC} $CLIENT"
echo -e "${GREEN}Tipo:${NC} $TYPE"
echo -e "${GREEN}Configuración:${NC} $DEMO_DIR/config.json"
echo ""

case $TYPE in
    quick)
        echo -e "${YELLOW}⚡ Iniciando Demo Rápida (5 minutos)${NC}"
        echo -e "  • Dashboard standalone"
        echo -e "  • Sin backend requerido"
        echo -e "  • Datos mockeados"
        echo ""
        
        # Check if demo dashboard exists
        if [ ! -f "demos/templates/dashboard-standalone/index.html" ]; then
            echo -e "${YELLOW}Generando dashboard...${NC}"
            cp fluxionai-dashboard-client/demo/index.html demos/templates/dashboard-standalone/
        fi
        
        # Start simple HTTP server
        cd demos/templates/dashboard-standalone
        echo -e "${GREEN}✅ Demo lista en: ${PURPLE}http://localhost:8080${NC}"
        python3 -m http.server 8080
        ;;
        
    executive)
        echo -e "${YELLOW}💼 Iniciando Demo Ejecutiva (20 minutos)${NC}"
        echo -e "  • Dashboard interactivo"
        echo -e "  • Backend con insights en tiempo real"
        echo -e "  • WhatsApp bot simulado"
        echo ""
        
        # Kill any existing demo processes
        pkill -f "demo-api-server" 2>/dev/null || true
        pkill -f "port 8080" 2>/dev/null || true
        
        # Start demo backend
        echo -e "${GREEN}Iniciando backend de demo...${NC}"
        cd services/backend
        DEMO_CLIENT=$CLIENT node src/demo-api-server.cjs > ../../.fluxion/demo-backend.log 2>&1 &
        BACKEND_PID=$!
        cd ../..
        
        # Wait for backend
        sleep 2
        
        # Start dashboard
        echo -e "${GREEN}Iniciando dashboard...${NC}"
        if [ -f "demos/templates/dashboard-standalone/index.html" ]; then
            cd demos/templates/dashboard-standalone
            python3 -m http.server 8080 > ../../.fluxion/demo-frontend.log 2>&1 &
            FRONTEND_PID=$!
            cd ../..
        else
            echo -e "${RED}Dashboard no encontrado${NC}"
            kill $BACKEND_PID
            exit 1
        fi
        
        echo -e "\n${GREEN}✅ Demo Ejecutiva lista!${NC}"
        echo -e "🎯 Dashboard: ${PURPLE}http://localhost:8080${NC}"
        echo -e "📡 API: ${PURPLE}http://localhost:3001${NC}"
        echo -e "📱 WhatsApp: ${PURPLE}+58 424-DEMO001${NC}"
        echo ""
        echo -e "${YELLOW}Escenarios disponibles:${NC}"
        echo -e "  1. Click 'Demo: Sync Inventario' para crisis de stockout"
        echo -e "  2. Click 'Demo: Pico Ventas' para oportunidad temporal"
        echo -e "  3. Observa las notificaciones en tiempo real"
        echo ""
        echo -e "${YELLOW}Presiona Ctrl+C para detener${NC}"
        
        # Wait for user to stop
        trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo -e '\n${GREEN}Demo detenida${NC}'" EXIT
        wait
        ;;
        
    full)
        echo -e "${YELLOW}🔧 Iniciando Demo Completa (30-45 minutos)${NC}"
        echo -e "  • Sistema completo con Docker"
        echo -e "  • Todas las integraciones"
        echo -e "  • Base de datos real"
        echo ""
        
        # Start full system with Docker
        docker-compose -f docker-compose.demo.yml up -d
        
        echo -e "\n${GREEN}✅ Sistema completo iniciado!${NC}"
        echo -e "📊 Backend: ${PURPLE}http://localhost:3000${NC}"
        echo -e "🎨 Frontend: ${PURPLE}http://localhost:3001${NC}"
        echo -e "🤖 AI Engine: ${PURPLE}http://localhost:8000${NC}"
        echo -e "📚 API Docs: ${PURPLE}http://localhost:3000/api-docs${NC}"
        echo -e "📱 WhatsApp: ${PURPLE}+58 424-DEMO001${NC}"
        echo ""
        echo -e "${YELLOW}Para ver logs: docker-compose -f docker-compose.demo.yml logs -f${NC}"
        echo -e "${YELLOW}Para detener: docker-compose -f docker-compose.demo.yml down${NC}"
        ;;
        
    *)
        echo -e "${RED}Tipo de demo no válido: $TYPE${NC}"
        echo -e "Opciones: quick, executive, full"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}💡 Tips para la demo:${NC}"
echo -e "  • Empieza con el problema actual del cliente"
echo -e "  • Muestra el ROI en términos locales (Bs)"
echo -e "  • Enfócate en los pain points identificados"
echo -e "  • Ten el modo offline listo por si falla internet"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"