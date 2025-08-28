# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Fluxion AI** is an inventory management system with proactive AI intelligence for B2B wholesale distributors in Venezuela. The workspace uses git submodules for microservices architecture.

## Architecture

The system consists of four main services managed as git submodules:

1. **Backend** (`services/backend/`) - Node.js + Express API with multi-tenant PostgreSQL
2. **Frontend** (`services/frontend/`) - React + TypeScript + Vite dashboard  
3. **AI Engine** (`services/ai-engine/`) - Python FastAPI ML service (planned)
4. **Infrastructure** (`services/infrastructure/`) - Docker + IaC configuration

## Common Development Commands

### Quick Start
```bash
make dev           # Start native development environment
make dev-docker    # Start with Docker containers
make stop          # Stop all services
make logs          # View service logs
```

### Demo System
```bash
make demo CLIENT=la-granja TYPE=executive  # Run client demo
make new-demo CLIENT=name                  # Create new demo
make demo-save CLIENT=name                 # Save demo state
make demo-reset CLIENT=name                # Reset to defaults
```

### Git Workflow
```bash
make sync          # Sync all submodules with GitHub
make status        # Check git status across all repos
make pull          # Pull latest from all repositories
```

### Testing & Quality
```bash
make test          # Run all tests
make test-api      # Test API endpoints
```

### Database Commands (Frontend)
```bash
cd services/frontend
npm run db:setup   # Initialize database
npm run db:reset   # Reset database
npm run db:stats   # Show database statistics
```

### Frontend-specific
```bash
cd services/frontend
npm run dev        # Start development server (port 3001)
npm run build      # Production build to dist/
npm run build-single # Single HTML file to demo/index.html
npm run preview    # Preview production build
npm run lint       # ESLint check
npm run type-check # TypeScript validation
```

### Backend-specific  
```bash
cd services/backend
npm run start      # Start server (default port 3000)
npm run dev        # Start with custom port/user (DB_USER=jose BACKEND_PORT=3004)
npm run setup-db   # Initialize database schema
npm run test       # Run tests (when implemented)
```

## Architecture Patterns

### Multi-Service Communication
- **Backend API**: Port 3000 - REST API, multi-tenant management
- **Frontend**: Port 3001 - React dashboard with Vite HMR
- **AI Engine**: Port 8000 - FastAPI Python service (planned)
- **PostgreSQL**: Port 5432 - Main database + TimescaleDB
- **Redis**: Port 6379 - Cache and pub/sub

### Event-Driven Architecture
Key events flow through the system:
- `inventory.stock.low` - Low stock detection
- `inventory.updated` - Inventory changes
- `sales.transaction` - New sales
- `forecast.generated` - AI predictions
- `alert.triggered` - Proactive alerts

### Multi-Tenancy Strategy
- Database schema separation per tenant (tenant-base-schema.sql)
- Tenant ID in all queries via middleware (tenantMiddleware.cjs)
- Per-tenant business rules and thresholds

### Backend Structure
```
services/backend/
├── server-multitenant.cjs  # Main entry point
├── routes/                 # API endpoints (*.cjs)
├── models/                 # Data models (*.cjs)
├── middleware/            # Express middleware
├── database/              # SQL schemas and migrations
└── services/              # Business logic (TenantService.cjs)
```

## AI Agent System (Planned)

The AI Engine will coordinate specialized agents:
- **Alert Agent**: Anomaly detection, stockout warnings
- **Forecast Agent**: Demand prediction using Prophet/ARIMA
- **Optimizer Agent**: Inventory optimization, transfer recommendations
- **Chat Agent**: Conversational interface with business context

## Demo System Structure

Demos simulate real Venezuelan wholesale distributors with:
- Client configurations in `demos/clients/{name}/config.json`
- Templates in `demos/templates/`
- Quick (5min), Executive (20min), and Full (45min) demo types
- Real Venezuelan products (Harina PAN, Savoy, etc.) and international brands

## Development Workflow

### Daily Development
```bash
make dev           # Start morning
# Code changes auto-reload
make sync          # End of day sync
```

### Preparing Client Demos
```bash
make new-demo CLIENT=farmacia-central
vim demos/clients/farmacia-central/config.json
make demo CLIENT=farmacia-central TYPE=executive
make demo-save CLIENT=farmacia-central
```

## Service URLs

### Development
- Backend API: http://localhost:3000
- Frontend: http://localhost:3001  
- PostgreSQL: postgresql://localhost:5432/fluxion
- Redis: redis://localhost:6379

### Demo Mode
- Dashboard: http://localhost:8080
- Mock API: http://localhost:3001

## Code Organization Patterns

### Frontend Components (`services/frontend/src/components/`)
- **AIAgentPanel.tsx**: Core proactive alerts panel
- **PurchaseIntelligence.tsx**: Container optimization recommendations
- **ClientIntelligence.tsx**: Customer behavior predictions
- **MainDashboard.tsx**: Executive KPI cards
- **ProactiveInsightsPanel.tsx**: AI-driven business insights
- **DailyActionCenter.tsx**: Priority actions for today

### API Routes (`services/backend/routes/`)
- `/api/tenants` - Multi-tenant management
- `/api/inventory` - Stock management
- `/api/products` - Product catalog
- `/api/sales` - Transaction data
- `/api/clients` - Customer management
- `/api/insights` - AI predictions and alerts
- `/api/dashboard` - Executive metrics

## Important Notes

1. **Git Submodules**: Each service is a separate repository. Always use `make sync` to coordinate changes
2. **Venezuelan Context**: All mock data and demos reflect real Venezuelan B2B wholesale distribution (Harina PAN, Savoy, etc.)
3. **Multi-Tenant**: System designed for multiple distributors from single deployment
4. **Proactive AI**: Focus on preventing problems, not just reacting to them
5. **CommonJS Modules**: Backend uses `.cjs` extension for explicit CommonJS
6. **Postman Collection**: Use `Fluxion_AI_Multi-Tenant_API.postman_collection.json` for API testing

## Testing & Quality

### Run tests
```bash
make test          # All tests across services
make test-api      # API endpoint testing
```

### Linting and type checking
```bash
cd services/frontend && npm run lint && npm run type-check
```

## Troubleshooting

```bash
make kill-ports    # Clear blocked ports (3000, 3001, 8080)
make clean         # Full cleanup (containers, volumes, node_modules)
make help          # Show all available commands
make ports         # Show which ports are in use
```

## Database Management

### PostgreSQL Access
```bash
psql -h localhost -U fluxion -d fluxion  # Default database
```

### Multi-tenant Schema
- Base schema: `database/tenant-base-schema.sql`
- Per-tenant schema: `database/tenant-schema.sql`
- Initialize: `cd services/backend && npm run setup-db`