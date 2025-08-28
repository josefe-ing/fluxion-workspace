#!/bin/bash

# Fluxion AI - Development Environment Starter
# =============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          FLUXION AI - Development Environment          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we should use Docker
if [ "$1" = "docker" ]; then
    echo -e "${GREEN}🐳 Starting with Docker...${NC}"
    docker-compose up -d
    
    echo -e "${GREEN}✅ Services running in Docker${NC}"
    echo -e "📊 Backend: http://localhost:3000"
    echo -e "🎨 Frontend: http://localhost:3001"
    echo -e "🤖 AI Engine: http://localhost:8000"
    echo -e "🗄️  Database: postgresql://localhost:5432"
    echo -e "📦 Redis: redis://localhost:6379"
    
    echo -e "\n${YELLOW}View logs: make logs${NC}"
    echo -e "${YELLOW}Stop: make stop${NC}"
else
    echo -e "${GREEN}🚀 Starting services natively...${NC}"
    
    # Create PID directory
    mkdir -p .fluxion
    
    # Kill any existing processes
    if [ -f .fluxion/backend.pid ]; then
        kill $(cat .fluxion/backend.pid) 2>/dev/null || true
        rm .fluxion/backend.pid
    fi
    if [ -f .fluxion/frontend.pid ]; then
        kill $(cat .fluxion/frontend.pid) 2>/dev/null || true
        rm .fluxion/frontend.pid
    fi
    
    # Check if PostgreSQL is running (via Docker)
    if ! docker ps | grep -q postgres; then
        echo -e "${YELLOW}Starting PostgreSQL...${NC}"
        docker run -d \
            --name fluxion-postgres \
            -e POSTGRES_DB=fluxion \
            -e POSTGRES_USER=fluxion \
            -e POSTGRES_PASSWORD=fluxion123 \
            -p 5432:5432 \
            postgres:15-alpine
    fi
    
    # Check if Redis is running (via Docker)
    if ! docker ps | grep -q redis; then
        echo -e "${YELLOW}Starting Redis...${NC}"
        docker run -d \
            --name fluxion-redis \
            -p 6379:6379 \
            redis:7-alpine
    fi
    
    # Start Backend
    echo -e "${GREEN}Starting Backend...${NC}"
    cd services/backend
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing backend dependencies...${NC}"
        npm install
    fi
    npm run dev > ../../.fluxion/backend.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > ../../.fluxion/backend.pid
    cd ../..
    
    # Start Frontend
    echo -e "${GREEN}Starting Frontend...${NC}"
    cd services/frontend
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing frontend dependencies...${NC}"
        npm install
    fi
    npm run dev > ../../.fluxion/frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > ../../.fluxion/frontend.pid
    cd ../..
    
    # Wait a bit for services to start
    sleep 3
    
    echo -e "\n${GREEN}✅ Development environment ready!${NC}"
    echo -e "📊 Backend: http://localhost:3000 (PID: $BACKEND_PID)"
    echo -e "🎨 Frontend: http://localhost:3001 (PID: $FRONTEND_PID)"
    echo -e "🗄️  PostgreSQL: postgresql://localhost:5432/fluxion"
    echo -e "📦 Redis: redis://localhost:6379"
    echo -e "\n${YELLOW}Logs:${NC}"
    echo -e "  Backend: tail -f .fluxion/backend.log"
    echo -e "  Frontend: tail -f .fluxion/frontend.log"
    echo -e "\n${YELLOW}Stop: make stop${NC}"
fi

echo -e "\n${BLUE}Happy coding! 🚀${NC}"