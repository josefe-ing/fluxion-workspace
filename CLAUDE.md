# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Fluxion AI** is an inventory management system with proactive AI intelligence for B2B wholesale distributors in Venezuela, specifically for **La Granja Mercado**.

## Architecture

### Current Stack

```
fluxion-workspace/
├── backend/                    # Python FastAPI + DuckDB
│   ├── main.py                # Main API server
│   ├── simple_api.py          # Simplified API version
│   ├── start.py               # Startup script
│   └── requirements.txt       # Python dependencies
│
├── frontend/                   # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── services/          # API services
│   │   └── App.tsx
│   └── package.json
│
├── database/                   # DuckDB schemas
│   ├── schema.sql             # Base schema
│   ├── schema_extended.sql    # Extended schema
│   ├── init_db.py             # Database initialization
│   └── setup_extended_config.py
│
├── etl/                        # Data extraction/migration
│   ├── core/                  # Main ETL scripts
│   ├── docs/                  # ETL documentation
│   ├── scripts/               # Support scripts
│   └── extract_gaps.sh        # Gap extraction wrapper
│
├── data/                       # DuckDB databases (GITIGNORED)
│   ├── fluxion_production.db  # Main DB (16GB)
│   └── granja_analytics.db    # Analytics DB (1GB)
│
└── archive/                    # Reference materials
    ├── migration-scripts/     # One-time analysis/fix scripts
    └── docs/                  # Legacy documentation
```

### Tech Stack

- **Backend:** Python 3.14.0 + FastAPI 0.119+ + DuckDB 1.4+
- **Frontend:** React + TypeScript + Vite
- **Database:** DuckDB (embedded, file-based OLAP database)
- **ETL:** Python scripts for data extraction
- **Security:** All dependencies updated as of Oct 2025 (see PYTHON_UPGRADE_REPORT.md)

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
npm run preview    # Preview production build
npm run lint       # ESLint check
npm run type-check # TypeScript validation
```

### Database (DuckDB)
```bash
# Initialize database
cd database
python3 init_db.py

# Setup extended configuration
python3 setup_extended_config.py

# Query database directly
duckdb data/fluxion_production.db
```

### ETL System
```bash
cd etl

# Extract data gaps
./extract_gaps.sh

# Run ETL for historical sales
python3 core/etl_ventas_historico.py

# Check connectivity
python3 core/verificar_conectividad.py

# View logs
tail -f logs/ventas_historico_*.log
```

## Architecture Patterns

### API Server
- **Backend API**: Port 8001 - FastAPI REST API
- **Frontend Dev**: Port 3001 - React dashboard with Vite HMR
- **Database**: DuckDB file-based (`data/fluxion_production.db`)

### Data Flow
```
Source Systems → ETL Scripts → DuckDB → Backend API → Frontend Dashboard
```

### Database Schema

DuckDB tables:
- **ventas**: Sales transactions (81M+ records)
- **productos**: Product catalog
- **ubicaciones**: Store locations (16 stores)
- **stock_actual**: Current inventory levels

See `DATA_MODEL_DOCUMENTATION.md` for detailed schema.

## Important Notes

1. **DuckDB Architecture**: System uses DuckDB for fast OLAP queries (NOT PostgreSQL)
2. **Single Tenant**: Designed for La Granja Mercado (not multi-tenant)
3. **Venezuelan Context**: All data reflects real Venezuelan B2B wholesale distribution
4. **Data Files Gitignored**: DuckDB files in `/data/` are 16GB+ and excluded from git
5. **ETL Active**: Ongoing data migration from legacy systems
6. **Archive Directory**: Scripts in `/archive/` are one-time migration tools for reference only

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

### Working with Data
```bash
# Check database stats
duckdb data/fluxion_production.db "SELECT COUNT(*) as total_ventas FROM ventas"

# Check data for specific store
duckdb data/fluxion_production.db "SELECT * FROM ventas WHERE tienda_id = 1 LIMIT 10"

# Run ETL for missing data
cd etl
python3 core/etl_ventas_historico.py

# Monitor ETL logs
tail -f etl/logs/ventas_historico_*.log
```

### Adding New Features

When adding features, update:
1. **Backend**: Add endpoints in `backend/main.py`
2. **Frontend**: Add components in `frontend/src/components/`
3. **Database**: Update schema in `database/schema_extended.sql`
4. **Documentation**: Update this file and README.md

## Service URLs

### Development
- **Backend API**: http://localhost:8001
- **Frontend**: http://localhost:3001
- **API Docs**: http://localhost:8001/docs (Swagger UI)
- **DuckDB**: `file://data/fluxion_production.db`

## API Endpoints

Backend REST API (`backend/main.py`):

```
GET  /                 # Health check
GET  /ventas           # Sales data with filters
GET  /estadisticas     # Business statistics
GET  /tendencias       # Sales trends
GET  /productos        # Product catalog
GET  /ubicaciones      # Store locations
POST /query            # Custom DuckDB query
```

## Frontend Components

Key React components (`frontend/src/components/`):

- **AIAgentPanel.tsx**: Proactive alerts and insights
- **PurchaseIntelligence.tsx**: Container optimization recommendations
- **ClientIntelligence.tsx**: Customer behavior predictions
- **MainDashboard.tsx**: Executive KPI cards
- **ProactiveInsightsPanel.tsx**: AI-driven business insights
- **DailyActionCenter.tsx**: Priority actions for today

## ETL System

ETL scripts (`etl/core/`):

- **etl_ventas_historico.py**: Historical sales data extraction (main ETL)
- **config.py**: ETL configuration
- **tiendas_config.py**: Store/location configuration
- **verificar_conectividad.py**: Connectivity checks

ETL extracts data from:
- 16 stores (tiendas)
- 13 months of historical data (Sep 2024 - Sep 2025)
- 81.8M sales records total

## Troubleshooting

### Port in use
```bash
# Check what's using the port
lsof -i :8001  # Backend
lsof -i :3001  # Frontend

# Kill process
kill -9 <PID>
```

### Database locked
```bash
# DuckDB might be locked by another process
lsof | grep fluxion_production.db

# Kill the locking process
kill -9 <PID>
```

### ETL errors
```bash
# Check logs
tail -100 etl/logs/ventas_historico_*.log

# Check connectivity to source
cd etl
python3 core/verificar_conectividad.py

# Check ETL configuration
cat etl/core/config.py
```

### Missing dependencies
```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

## Performance Considerations

1. **DuckDB is fast**: Optimized for OLAP queries, can handle 80M+ rows easily
2. **ETL runs**: Best run during off-hours for large data loads
3. **Frontend caching**: API responses cached where appropriate
4. **Database indexes**: See `archive/migration-scripts/create_indexes.sql`

## Data Model

### Main Tables

**ventas** (Sales transactions):
- fecha_venta: Transaction date
- tienda_id: Store identifier
- producto_id: Product identifier
- cantidad: Quantity sold
- precio_unitario: Unit price
- monto_total: Total amount

**productos** (Product catalog):
- producto_id: Unique identifier
- nombre: Product name
- categoria: Category
- unidad: Unit of measure

**ubicaciones** (Store locations):
- tienda_id: Unique identifier
- nombre: Store name
- ciudad: City
- estado: State

See `DATA_MODEL_DOCUMENTATION.md` for full schema documentation.

## Archived Scripts

Scripts in `/archive/migration-scripts/` are one-time tools used during:
- Data migration from legacy systems
- Data quality analysis
- Duplicate detection
- Schema fixes
- Performance optimization

These are kept for reference but not part of active development. See `/archive/migration-scripts/README.md` for details.

## Testing & Quality

### Run tests
```bash
# Backend tests
cd backend
python3 -m pytest

# Frontend tests
cd frontend
npm run test
```

### Linting
```bash
# Frontend
cd frontend
npm run lint
npm run type-check
```

## Production Deployment

For production deployment:

1. Build frontend: `cd frontend && npm run build`
2. Backend runs with: `cd backend && uvicorn main:app --host 0.0.0.0 --port 8001`
3. Serve frontend `dist/` with nginx or similar
4. Ensure `data/` directory is backed up regularly
5. Monitor ETL jobs and logs

## Additional Resources

- **Architecture**: See `docs/` directory
- **ETL Documentation**: See `etl/docs/`
- **Data Model**: See `DATA_MODEL_DOCUMENTATION.md`
- **API Documentation**: http://localhost:8001/docs (when backend running)
