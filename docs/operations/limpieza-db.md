# 🔍 FLUXION AI - PLAN DE LIMPIEZA (Arquitectura DuckDB)

**Fecha:** 2 de Octubre 2025
**Arquitectura Real:** Python FastAPI + DuckDB + React

---

## ✅ ARQUITECTURA REAL CONFIRMADA

```
STACK ACTUAL:
├── Backend: Python + FastAPI + DuckDB (/backend/)
├── Frontend: React + TypeScript (services/frontend/)
├── Database: DuckDB 16GB (data/fluxion_production.db)
└── ETL: Sistema de migración Python (/etl/)
```

**IMPORTANTE:** Los git submodules en `services/` están VACÍOS o son legacy. La arquitectura real está en los directorios root.

---

## 🚨 PROBLEMAS IDENTIFICADOS

### 1. CLAUDE.md DESACTUALIZADO ⚠️

**Problema:** CLAUDE.md menciona:
- ❌ Node.js + Express backend
- ❌ PostgreSQL database
- ❌ Multi-tenant con schemas PostgreSQL
- ❌ Redis cache

**Realidad:**
- ✅ Python + FastAPI backend
- ✅ DuckDB database
- ✅ Single tenant (La Granja Mercado)
- ✅ No Redis

**Acción:** Actualizar CLAUDE.md con la arquitectura real

---

### 2. Git Submodules Confusos

**Problema:**
```bash
services/
├── backend/      # Menciona Node.js en CLAUDE.md pero está vacío
├── frontend/     # Código React real está aquí (SI usado)
├── ai-engine/    # Vacío/no usado
└── infrastructure/  # Vacío/no usado
```

**Preguntas:**
- ¿`services/frontend/` es el frontend real o hay otro?
- ¿Los submodules están abandonados?
- ¿El plan es migrar a submodules o mantener estructura root?

---

### 3. Datos sin .gitignore (16GB)

**Problema:**
```bash
data/
├── fluxion_production.db       # 16GB
├── fluxion_production.db.tmp/  # archivos temp
└── granja_analytics.db         # 1.1GB
```

**Acción:** Crear .gitignore robusto

---

### 4. Scripts One-Time en Root

**Problema:** 18 scripts de análisis/migración ensucian root

**Acción:** Archivar en `/archive/migration-scripts/`

---

### 5. Shell Scripts Duplicados

**Problema:**
- `dev.sh` vs `start_dev.sh` - ambos inician el sistema
- `start.sh` - comprehensive con Docker
- Confusión sobre cuál usar

**Acción:** Consolidar y documentar

---

## 📋 PLAN DE LIMPIEZA REVISADO

### FASE 0: Pre-Limpieza y Confirmación

```bash
# 1. Backup completo
tar -czf fluxion-backup-$(date +%Y%m%d).tar.gz \
  --exclude=data/ \
  --exclude=node_modules/ \
  --exclude=etl/logs/ \
  .

# 2. Commit estado actual
git add -A
git commit -m "chore: backup before cleanup"

# 3. CONFIRMAR arquitectura
echo "¿Qué frontend usas?"
ls -la services/frontend/src/  # ¿Está aquí el código React?
# O está en otro lugar?

echo "¿Usar git submodules o estructura root?"
# Opción A: Continuar con submodules (migrar /backend/ a services/backend/)
# Opción B: Abandonar submodules, mantener todo en root
```

---

### FASE 1: Crear .gitignore (CRÍTICO)

```bash
cat > .gitignore << 'EOF'
# ==========================================
# Fluxion AI - DuckDB Architecture
# ==========================================

# ============ DATABASES ============
# DuckDB files (16GB+)
data/
*.db
*.db-journal
*.db-wal
*.db.tmp/
*.duckdb

# ============ ETL ============
etl/logs/
etl/temp/
etl/reports/*.json

# ============ NODE.JS (Frontend) ============
node_modules/
npm-debug.log*
yarn-debug.log*
.npm
dist/
build/

# ============ PYTHON (Backend) ============
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
.venv/
env/
ENV/
*.egg-info/
.pytest_cache/

# ============ LOGS ============
*.log
logs/
*.pid
.fluxion/

# ============ BACKUPS ============
backups/
*.backup
*.tar.gz
*.zip

# ============ IDE ============
.vscode/
.idea/
*.swp
*.swo
*~

# ============ OS ============
.DS_Store
Thumbs.db
*.tmp

# ============ ENVIRONMENT ============
.env
.env.local
.env.*.local

# ============ TEMPORARY ============
temp/
tmp/
*.tmp/
EOF

# Aplicar .gitignore
git rm --cached -r data/ 2>/dev/null || true
git rm --cached -r etl/logs/ 2>/dev/null || true
git rm --cached -r .fluxion/ 2>/dev/null || true
git rm --cached .DS_Store 2>/dev/null || true
```

---

### FASE 2: Archivar Scripts One-Time

```bash
# Crear directorio de archivo
mkdir -p archive/migration-scripts

# Scripts de análisis
mv analyze_data_consistency.py archive/migration-scripts/
mv analyze_data_gaps.py archive/migration-scripts/
mv analyze_db.py archive/migration-scripts/
mv analyze_duplicates_deep.py archive/migration-scripts/
mv show_duplicate_examples.py archive/migration-scripts/
mv test_performance.py archive/migration-scripts/
mv validate_data_logic.py archive/migration-scripts/

# Scripts de fix
mv apply_data_model_fix.py archive/migration-scripts/
mv apply_indexes.py archive/migration-scripts/
mv check_duplicates.py archive/migration-scripts/

# SQL
mv create_indexes.sql archive/migration-scripts/
mv fix_data_model.sql archive/migration-scripts/
mv query_examples.sql archive/migration-scripts/

# Crear README
cat > archive/migration-scripts/README.md << 'EOF'
# Migration & Analysis Scripts

Scripts one-time usados durante migración y análisis de datos.

## Contenido
- `analyze_*.py` - Análisis de calidad de datos
- `apply_*.py` - Scripts para aplicar fixes
- `check_*.py` - Detección de duplicados
- `*.sql` - Queries SQL para fixes

## Database
Todos conectan a DuckDB: `data/fluxion_production.db`

## Status
Archivados para referencia. No parte del sistema activo.
EOF
```

---

### FASE 3: Consolidar Shell Scripts

```bash
# Evaluar scripts actuales
echo "Scripts actuales:"
ls -lh *.sh

# Opciones:
# A. Mantener start_dev.sh como principal (más simple)
# B. Mantener start.sh como principal (más robusto)
# C. Crear uno nuevo consolidado

# Recomendación:
# - Mantener start_dev.sh (uso diario)
# - Mantener stop.sh (stop completo)
# - Eliminar dev.sh (redundante con start_dev.sh)
# - Renombrar start.sh -> start-full.sh (modo comprehensive)

rm dev.sh
mv start.sh start-full.sh

# Mover ETL script
mv extraer_gaps.sh etl/extract_gaps.sh
```

---

### FASE 4: Limpiar Archivos Temporales

```bash
# Limpiar temps de DuckDB (NO eliminar la DB principal)
rm -rf data/fluxion_production.db.tmp/

# Limpiar logs ETL
rm -rf etl/logs/*.log 2>/dev/null || true

# Limpiar .DS_Store
find . -name ".DS_Store" -delete

# Limpiar __pycache__
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
```

---

### FASE 5: Reorganizar Documentación

```bash
# Archive session notes
mkdir -p archive/docs
mv RESUMEN-SESION.md archive/docs/ 2>/dev/null || true

# Move ETL docs
mv INSTRUCCIONES_EXTRACCION_GAPS.md etl/docs/ 2>/dev/null || true

# Keep DATA_MODEL_DOCUMENTATION.md (es relevante para DuckDB)
# Keep README.md
# Update CLAUDE.md (siguiente fase)
```

---

### FASE 6: Actualizar CLAUDE.md

```bash
# Actualizar con arquitectura real
cat > CLAUDE.md << 'EOF'
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Fluxion AI** is an inventory management system with proactive AI intelligence for B2B wholesale distributors in Venezuela, specifically for **La Granja Mercado**.

## Architecture

### Current Stack (DuckDB)

```
fluxion-workspace/
├── backend/                    # Python FastAPI + DuckDB
│   ├── main.py                # Main API server
│   ├── simple_api.py          # Simplified API version
│   ├── start.py               # Startup script
│   └── requirements.txt       # Python dependencies
│
├── services/frontend/         # React + TypeScript + Vite
│   ├── src/
│   └── package.json
│
├── database/                  # DuckDB schemas
│   ├── schema.sql
│   ├── schema_extended.sql
│   └── init_db.py
│
├── etl/                       # Data extraction/migration
│   ├── core/
│   ├── docs/
│   └── scripts/
│
├── data/                      # DuckDB databases (gitignored)
│   ├── fluxion_production.db  # Main DB (16GB)
│   └── granja_analytics.db    # Analytics DB (1GB)
│
└── archive/                   # Reference scripts
    └── migration-scripts/
```

### Services

1. **Backend** (`/backend/`) - Python + FastAPI + DuckDB
2. **Frontend** (`services/frontend/`) - React + TypeScript + Vite dashboard
3. **ETL** (`/etl/`) - Data extraction and migration tools
4. **Database** - DuckDB (embedded, file-based)

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
cd services/frontend
npm install
npm run dev        # Port 3001
npm run build      # Production build
```

### Database (DuckDB)
```bash
# Initialize database
cd database
python3 init_db.py

# Query database
duckdb data/fluxion_production.db
```

### ETL System
```bash
cd etl
./extract_gaps.sh  # Extract data gaps
python3 core/etl_ventas_historico.py
```

## Architecture Patterns

### API Server
- **Backend API**: Port 8001 - FastAPI REST API
- **Frontend**: Port 3001 - React dashboard with Vite HMR
- **Database**: DuckDB file-based (data/fluxion_production.db)

### Data Flow
- ETL extracts from source systems → DuckDB
- Backend API queries DuckDB → Serves JSON
- Frontend consumes API → Displays dashboards

### Database
- **Type**: DuckDB (embedded, OLAP-focused)
- **Size**: ~16GB production data
- **Schema**: See database/schema_extended.sql
- **Tables**: ventas, productos, ubicaciones, stock_actual

## Important Notes

1. **DuckDB Architecture**: System uses DuckDB (NOT PostgreSQL)
2. **Venezuelan Context**: Data and business logic for La Granja Mercado
3. **Single Tenant**: Designed for one distributor (not multi-tenant)
4. **Data Files**: DuckDB files in `/data/` are gitignored (16GB+)
5. **ETL System**: Active data migration from legacy systems

## Development Workflow

### Daily Development
```bash
# Start environment
./start_dev.sh

# Code changes auto-reload
# - Backend: FastAPI auto-reload
# - Frontend: Vite HMR

# Stop when done
./stop.sh
```

### Working with Data
```bash
# Check database
duckdb data/fluxion_production.db "SELECT COUNT(*) FROM ventas"

# Run ETL
cd etl
python3 core/etl_ventas_historico.py

# Check logs
tail -f etl/logs/ventas_historico_*.log
```

## Service URLs

### Development
- **Backend API**: http://localhost:8001
- **Frontend**: http://localhost:3001
- **DuckDB**: file://data/fluxion_production.db

## API Endpoints

### Backend (`/backend/main.py`)
- `GET /` - Health check
- `GET /ventas` - Sales data
- `GET /estadisticas` - Statistics
- `GET /tendencias` - Trends
- `GET /productos` - Products
- `GET /ubicaciones` - Locations

## Code Organization

### Backend (`/backend/`)
- **main.py**: Main FastAPI application
- **simple_api.py**: Simplified API version
- **start.py**: Startup script with checks

### Frontend (`services/frontend/src/components/`)
- **AIAgentPanel.tsx**: Proactive alerts panel
- **PurchaseIntelligence.tsx**: Container optimization
- **ClientIntelligence.tsx**: Customer behavior predictions
- **MainDashboard.tsx**: Executive KPI cards

### ETL (`/etl/core/`)
- **etl_ventas_historico.py**: Historical sales extraction
- **config.py**: ETL configuration
- **tiendas_config.py**: Store configuration

## Troubleshooting

### Port in use
```bash
lsof -i :8001  # Backend
lsof -i :3001  # Frontend
kill -9 <PID>
```

### Database locked
```bash
# DuckDB might be locked by another process
lsof | grep fluxion_production.db
```

### ETL errors
```bash
# Check logs
tail -f etl/logs/ventas_historico_*.log

# Check connectivity
cd etl
python3 core/verificar_conectividad.py
```

## Database Schema

### Main Tables
- **ventas**: Sales transactions (81M+ records)
- **productos**: Product catalog
- **ubicaciones**: Store locations
- **stock_actual**: Current inventory levels

### Schema Documentation
See: `DATA_MODEL_DOCUMENTATION.md`

## Archived Scripts

Scripts in `/archive/migration-scripts/` are one-time analysis and fix scripts used during data migration. They are kept for reference but not part of active development.
EOF
```

---

## 📁 ESTRUCTURA FINAL

```
fluxion-workspace/
│
├── .gitignore                 # ✅ Completo con DuckDB
├── CLAUDE.md                  # ✅ Actualizado arquitectura real
├── README.md                  # ✅ Main docs
├── DATA_MODEL_DOCUMENTATION.md # ✅ DuckDB schema docs
│
├── start_dev.sh               # ✅ Main dev start script
├── start-full.sh              # ✅ Renamed (comprehensive)
├── stop.sh                    # ✅ Stop all services
│
├── backend/                   # ✅ Python FastAPI + DuckDB
│   ├── main.py
│   ├── simple_api.py
│   ├── start.py
│   └── requirements.txt
│
├── database/                  # ✅ DuckDB schemas
│   ├── schema.sql
│   ├── schema_extended.sql
│   └── init_db.py
│
├── etl/                       # ✅ Data migration system
│   ├── core/
│   ├── docs/
│   ├── scripts/
│   ├── extract_gaps.sh        # Moved from root
│   └── [logs/ gitignored]
│
├── services/                  # Git submodules (evaluar uso)
│   ├── frontend/             # ✅ React dashboard (SI usado)
│   ├── backend/              # ⚠️ Vacío (Node.js legacy?)
│   ├── ai-engine/            # ⚠️ Vacío (futuro?)
│   └── infrastructure/       # ⚠️ Vacío (futuro?)
│
├── demos/                     # Demo configs
├── docs/                      # Project documentation
├── scripts/                   # Workspace scripts
│
├── archive/                   # 🆕 Reference materials
│   ├── migration-scripts/    # One-time scripts
│   │   ├── README.md
│   │   ├── analyze_*.py
│   │   ├── apply_*.py
│   │   └── *.sql
│   └── docs/                 # Legacy docs
│       └── RESUMEN-SESION.md
│
└── data/                      # ⚠️ GITIGNORED (16GB)
    ├── fluxion_production.db
    └── granja_analytics.db
```

---

## ❓ DECISIONES PENDIENTES

### 1. Git Submodules - ¿Qué hacer?

**Opción A: Abandonar Submodules**
- Eliminar `.gitmodules`
- Mantener solo `services/frontend/` como directorio normal
- Mover código si es necesario

**Opción B: Migrar a Submodules**
- Crear repo para `/backend/`
- Mover `/backend/` → `services/backend/`
- Mantener arquitectura de submodules

**Opción C: Híbrido**
- Frontend como submodule (ya está)
- Backend en root (desarrollo activo)
- ETL en root (herramienta interna)

**¿Cuál prefieres?**

---

### 2. Frontend - ¿Dónde está el código real?

¿El código React activo está en `services/frontend/`?
- Si SÍ → Mantener como está
- Si NO → ¿Dónde está?

---

### 3. Scripts Shell - ¿Cuál usar?

Después de consolidación:
- `start_dev.sh` - Desarrollo diario
- `start-full.sh` - Start completo con Docker
- `stop.sh` - Stop todo

¿Está bien esta organización?

---

### 4. Database - ¿Plan de migración?

¿El plan es:
- A) Mantener DuckDB siempre
- B) Migrar a PostgreSQL eventualmente
- C) Mantener DuckDB para analytics, PostgreSQL para transaccional

---

## ✅ CHECKLIST DE LIMPIEZA

### CRÍTICO (Hacer ahora)
- [ ] Crear .gitignore completo
- [ ] Actualizar CLAUDE.md con arquitectura real
- [ ] Archivar scripts one-time
- [ ] Limpiar archivos temporales

### IMPORTANTE (Esta semana)
- [ ] Decidir estrategia de git submodules
- [ ] Consolidar shell scripts
- [ ] Reorganizar documentación
- [ ] Crear README.md actualizado

### OPCIONAL (Cuando se pueda)
- [ ] Crear DEPLOYMENT.md
- [ ] Setup CI/CD
- [ ] Configurar backups automáticos de DuckDB
- [ ] Documentar API con OpenAPI/Swagger

---

## 🎯 SIGUIENTE PASO

**¿Qué quieres hacer primero?**

1. **FASE 1**: Crear .gitignore (crítico para proteger 16GB de datos)
2. **FASE 6**: Actualizar CLAUDE.md (corregir arquitectura documentada)
3. **FASE 2**: Archivar scripts one-time (limpiar root)
4. **Decidir**: Estrategia de git submodules

**O ejecutar TODO el plan automáticamente**

---

**Esperando tu confirmación para proceder...**
