# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Fluxion AI** is an inventory management system with proactive AI intelligence for B2B wholesale distributors in Venezuela, specifically for **La Granja Mercado**.

## Architecture

### Current Stack

```
fluxion-workspace/
├── backend/                    # Python FastAPI + PostgreSQL
│   ├── main.py                # Main API server
│   ├── routers/               # API route modules
│   ├── services/              # Business logic
│   └── requirements.txt       # Python dependencies
│
├── frontend/                   # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── services/          # API services
│   │   └── App.tsx
│   └── package.json
│
├── database/                   # PostgreSQL migrations
│   ├── migrations/            # SQL migration files
│   ├── run_migrations.py      # Migration runner
│   └── postgresql_schema.sql  # Reference schema
│
├── etl/                        # Data extraction/migration
│   ├── core/                  # Main ETL scripts
│   ├── docs/                  # ETL documentation
│   └── etl_ventas_postgres.py # Main sales ETL
│
└── infrastructure/             # AWS CDK infrastructure
    └── lib/                   # CDK stack definitions
```

### Tech Stack

- **Backend:** Python 3.14.0 + FastAPI 0.119+ + PostgreSQL (AWS RDS)
- **Frontend:** React + TypeScript + Vite
- **Database:** PostgreSQL (AWS RDS with read replica)
- **ETL:** Python scripts for data extraction
- **Infrastructure:** AWS CDK (ECS Fargate, RDS, S3, CloudFront)

## Common Development Commands

### Quick Start
```bash
./start_dev.sh     # Start development environment
./stop.sh          # Stop all services
```

### Backend (Python + FastAPI)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 start.py   # Starts on port 8001
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev        # Port 3001
npm run build      # Production build to dist/
npm run lint       # ESLint check
npm run type-check # TypeScript validation
```

### Database (PostgreSQL)
```bash
# Run migrations
cd database
python3 run_migrations.py

# Check tables
python3 check_rds_tables.py

# Connect to local PostgreSQL
psql -h localhost -U fluxion -d fluxion_production
```

### ETL System
```bash
cd etl

# Run sales ETL (PostgreSQL)
python3 etl_ventas_postgres.py

# Run with specific stores
python3 etl_ventas_postgres.py --tiendas tienda_01 tienda_08

# Check logs
tail -f logs/ventas_postgres_*.log
```

## Architecture Patterns

### API Server
- **Backend API**: Port 8001 - FastAPI REST API
- **Frontend Dev**: Port 3001 - React dashboard with Vite HMR
- **Database**: PostgreSQL (AWS RDS in production, local in dev)

### Data Flow
```
Source Systems → ETL Scripts → PostgreSQL → Backend API → Frontend Dashboard
```

### Database Schema

PostgreSQL tables:
- **ventas**: Sales transactions
- **productos**: Product catalog
- **ubicaciones**: Store locations (16 stores)
- **inventario_actual**: Current inventory levels
- **pedidos_sugeridos**: Suggested orders

See `database/migrations/` for schema definitions.

## Important Notes

1. **PostgreSQL Architecture**: System uses PostgreSQL (AWS RDS) for all data
2. **Single Tenant**: Designed for La Granja Mercado (not multi-tenant)
3. **Venezuelan Context**: All data reflects real Venezuelan B2B wholesale distribution
4. **ETL Active**: Runs every 30 minutes via AWS EventBridge

## Development Workflow

### Daily Development
```bash
# Morning - Start environment
./start_dev.sh

# During day - Changes auto-reload
# - Backend: FastAPI auto-reload enabled
# - Frontend: Vite HMR (Hot Module Replacement)

# End of day - Stop services
./stop.sh
```

### Adding New Features

When adding features, update:
1. **Backend**: Add endpoints in `backend/routers/`
2. **Frontend**: Add components in `frontend/src/components/`
3. **Database**: Add migration in `database/migrations/`
4. **Documentation**: Update this file and README.md

## Service URLs

### Development
- **Backend API**: http://localhost:8001
- **Frontend**: http://localhost:3001
- **API Docs**: http://localhost:8001/docs (Swagger UI)

### Production
- **Frontend**: https://app.fluxionia.co
- **API**: https://api.fluxionia.co

## API Endpoints

Backend REST API (`backend/main.py`):

```
GET  /                      # Health check
GET  /ventas                # Sales data with filters
GET  /estadisticas          # Business statistics
GET  /productos             # Product catalog
GET  /ubicaciones           # Store locations
GET  /pedidos-sugeridos     # Suggested orders
POST /pedidos-sugeridos     # Create order
```

## Frontend Components

Key React components (`frontend/src/components/`):

- **AIAgentPanel.tsx**: Proactive alerts and insights
- **PurchaseIntelligence.tsx**: Container optimization recommendations
- **MainDashboard.tsx**: Executive KPI cards
- **OrderWizard**: Multi-step order creation wizard

## ETL System

ETL scripts (`etl/`):

- **etl_ventas_postgres.py**: Main sales ETL (PostgreSQL)
- **core/tiendas_config.py**: Store/location configuration
- **core/extractor_ventas_klk.py**: KLK API extractor
- **core/loader_ventas_postgres.py**: PostgreSQL loader

ETL extracts data from:
- 16 stores (tiendas)
- 2 distribution centers (CEDIs)
- Real-time sales every 30 minutes

## Troubleshooting

### Port in use
```bash
lsof -i :8001  # Backend
lsof -i :3001  # Frontend
kill -9 <PID>
```

### Database connection
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Test connection
psql -h localhost -U fluxion -d fluxion_production -c "SELECT 1"
```

### ETL errors
```bash
# Check logs
tail -100 etl/logs/ventas_postgres_*.log

# Check connectivity
cd etl
python3 core/verificar_conectividad.py
```

## Production Deployment

Deployed via AWS CDK:

1. **Frontend**: S3 + CloudFront (CDN)
2. **Backend**: ECS Fargate
3. **Database**: RDS PostgreSQL (with read replica)
4. **ETL**: ECS Tasks triggered by EventBridge

Deploy with:
```bash
cd infrastructure
npx cdk deploy
```

## Additional Resources

- **Infrastructure**: See `infrastructure/` directory
- **ETL Documentation**: See `etl/docs/`
- **API Documentation**: http://localhost:8001/docs (when backend running)
