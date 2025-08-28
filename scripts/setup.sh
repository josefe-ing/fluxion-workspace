#!/bin/bash

# Fluxion AI - Initial Setup Script
# ==================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            FLUXION AI - Initial Setup                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Create necessary directories
echo -e "${GREEN}📁 Creating directories...${NC}"
mkdir -p .fluxion/{config,logs,pids}
mkdir -p backups
mkdir -p demos/templates/dashboard-standalone
mkdir -p demos/clients/la-granja/assets

# Create .env if not exists
if [ ! -f .env ]; then
    echo -e "${GREEN}📝 Creating .env file...${NC}"
    cat > .env << 'EOF'
# Fluxion AI - Environment Variables
NODE_ENV=development
PORT_BACKEND=3000
PORT_FRONTEND=3001
PORT_AI_ENGINE=8000

# Database
DATABASE_URL=postgresql://fluxion:fluxion123@localhost:5432/fluxion
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=fluxion-dev-secret-change-in-production
CORS_ORIGIN=http://localhost:3001

# Demo Mode
DEMO_MODE=false
DEFAULT_CLIENT=la-granja
EOF
    echo -e "${GREEN}✅ .env created${NC}"
fi

# Initialize git submodules if needed
if [ -f .gitmodules ]; then
    echo -e "${GREEN}📦 Initializing git submodules...${NC}"
    git submodule update --init --recursive
fi

# Check Docker
if command -v docker &> /dev/null; then
    echo -e "${GREEN}🐳 Docker found${NC}"
    
    # Pull required images
    echo -e "${YELLOW}Pulling Docker images...${NC}"
    docker pull postgres:15-alpine
    docker pull redis:7-alpine
    docker pull node:18-alpine
    docker pull nginx:alpine
else
    echo -e "${YELLOW}⚠️  Docker not found - install Docker Desktop for full features${NC}"
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✅ Node.js $NODE_VERSION found${NC}"
else
    echo -e "${YELLOW}⚠️  Node.js not found - please install Node.js 18+${NC}"
fi

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✅ $PYTHON_VERSION found${NC}"
else
    echo -e "${YELLOW}⚠️  Python 3 not found - needed for AI engine${NC}"
fi

# Create initial demo data if not exists
if [ ! -f demos/clients/la-granja/data.json ]; then
    echo -e "${GREEN}📊 Creating demo data...${NC}"
    cat > demos/clients/la-granja/data.json << 'EOF'
{
  "products": [
    {
      "sku": "HAR-PAN-001",
      "name": "Harina PAN 1kg",
      "category": "Alimentos Básicos",
      "currentStock": 450,
      "minStock": 200,
      "supplier": "Empresas Polar"
    },
    {
      "sku": "SAV-TAN-130",
      "name": "Savoy Tango 130g",
      "category": "Chocolates",
      "currentStock": 2,
      "minStock": 100,
      "supplier": "Nestlé Venezuela"
    }
  ],
  "alerts": []
}
EOF
fi

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Run ${YELLOW}make dev${NC} to start development"
echo -e "  2. Run ${YELLOW}make demo${NC} to start a client demo"
echo -e "  3. Run ${YELLOW}make help${NC} to see all commands"
echo ""
echo -e "${BLUE}Happy coding! 🚀${NC}"