# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

**Fluxion AI** - Inventory management system with proactive AI intelligence for B2B wholesale distributors in Venezuela (La Granja Mercado).

## Architecture

```
fluxion-workspace/
├── backend/                 # Python FastAPI + PostgreSQL
│   ├── main.py             # Main API server
│   ├── routers/            # API route modules
│   └── services/           # Business logic
│
├── frontend/                # React + TypeScript + Vite
│   └── src/components/     # React components
│
├── database/                # PostgreSQL migrations
│   └── migrations/         # SQL migration files
│
├── etl/                     # Data extraction (KLK → RDS)
│   ├── core/               # Main ETL scripts
│   ├── etl_ventas_postgres.py
│   └── archive/            # Historical scripts (gitignored)
│
├── infrastructure/          # AWS CDK
│   └── lib/                # Stack definitions
│
└── docs/                    # Essential documentation only
    └── archive/            # Old docs (gitignored)
```

## Tech Stack

- **Backend:** Python 3.11+ / FastAPI / PostgreSQL (AWS RDS)
- **Frontend:** React 18 / TypeScript / Vite / TailwindCSS
- **Database:** PostgreSQL on AWS RDS (+ read replica)
- **Infrastructure:** AWS CDK (ECS Fargate, RDS, S3, CloudFront)
- **ETL:** Python scripts, runs every 30 min via EventBridge

## Quick Commands

```bash
# Development
./start_dev.sh              # Start all services
./stop.sh                   # Stop all services

# Backend (port 8001)
cd backend && python3 start.py

# Frontend (port 3001)
cd frontend && npm run dev

# Database migrations
cd database && python3 run_migrations.py

# ETL manual run
cd etl && python3 etl_ventas_postgres.py
```

## URLs

| Environment | Frontend | API |
|-------------|----------|-----|
| Development | localhost:3001 | localhost:8001 |
| Production | app.fluxionia.co | api.fluxionia.co |

API docs: http://localhost:8001/docs

## Key API Endpoints

```
GET  /ubicaciones/summary-regional     # Regional dashboard
GET  /ventas/detail                    # Sales by store
POST /pedidos-sugeridos/calcular       # Calculate suggested orders
GET  /productos/{id}/historico-dia     # Product daily history
GET  /inventarios/agotados-visuales    # Visual stockouts
```

## Database Tables

- **ventas** - Sales transactions (~10M+ records)
- **productos** - Product catalog
- **ubicaciones** - 16 stores + 2 CEDIs
- **inventario_actual** - Current inventory
- **inventario_historico** - Historical snapshots

## Performance Notes

Heavy queries use 30-day time windows for optimization. Critical endpoints:
- `/pedidos-sugeridos/calcular` - Multi-CTE with P75 calculations
- `/ventas/detail` - PERCENTILE_CONT aggregations
- `/ubicaciones/summary-regional` - Cross-store aggregations

See `docs/DIAGNOSTICO_PERFORMANCE_ENDPOINTS.md` for details.

## Data Sources

- **KLK API** - POS system for 12 stores
- **Stellar** - Legacy system for 4 stores (Bosque, Guacara, Paramacay, Artigas)

ETL extracts sales every 30 minutes from both sources.

## Deployment

```bash
cd infrastructure && npx cdk deploy
```

Triggers GitHub Actions → ECS deployment.

## File Organization

- `archive/` folders are **gitignored** - use for temporary scripts
- Data files (*.csv, *.xlsx) are **gitignored** - use RDS/S3
- One-off scripts go in `etl/archive/` not root
