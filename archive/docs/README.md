# 🚀 Fluxion AI - La Granja Mercado

> **Sistema de Gestión de Inventario con IA Proactiva para Distribuidores Mayoristas en Venezuela**

## 📋 Quick Start

```bash
# Desarrollo rápido
./start_dev.sh

# Detener servicios
./stop.sh
```

## 🏗️ Estructura del Proyecto

```
fluxion-workspace/
├── backend/                    # Python FastAPI + DuckDB
├── frontend/                   # React + TypeScript + Vite
├── database/                   # DuckDB schemas
├── etl/                        # Data extraction/migration
├── data/                       # DuckDB databases (gitignored, 16GB)
└── archive/                    # Reference scripts
```

## 🎯 Arquitectura

### Stack Tecnológico

- **Backend:** Python 3.x + FastAPI + DuckDB
- **Frontend:** React + TypeScript + Vite
- **Database:** DuckDB (embedded, OLAP-optimized)
- **ETL:** Python scripts for data extraction

### Puertos

- **Backend API:** http://localhost:8001
- **Frontend:** http://localhost:3001
- **API Docs:** http://localhost:8001/docs (Swagger UI)

## 🚀 Setup Inicial

### Prerequisitos

- Python 3.8+
- Node.js 18+
- DuckDB CLI (opcional para queries directas)

### Primera Instalación

```bash
# 1. Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Frontend
cd ../frontend
npm install

# 3. Database (si es necesario inicializar)
cd ../database
python3 init_db.py
```

### Desarrollo Diario

```bash
# Iniciar todo
./start_dev.sh

# Durante el día
# - Backend auto-reload habilitado
# - Frontend HMR (Hot Module Replacement)

# Al terminar
./stop.sh
```

## 📊 Base de Datos

### DuckDB

El sistema usa **DuckDB**, una base de datos OLAP embebida y ultrarrápida:

- **Archivo principal:** `data/fluxion_production.db` (16GB)
- **81.8M registros** de ventas
- **13 meses** de datos históricos (Sep 2024 - Sep 2025)
- **16 tiendas** (ubicaciones)

### Tablas Principales

- `ventas` - Transacciones de ventas
- `productos` - Catálogo de productos
- `ubicaciones` - Ubicaciones de tiendas
- `stock_actual` - Inventario actual

Ver documentación completa: [DATA_MODEL_DOCUMENTATION.md](DATA_MODEL_DOCUMENTATION.md)

### Queries Directas

```bash
# Conectar a la base de datos
duckdb data/fluxion_production.db

# Ejemplos de queries
SELECT COUNT(*) FROM ventas;
SELECT * FROM productos LIMIT 10;
SELECT tienda_id, COUNT(*) FROM ventas GROUP BY tienda_id;
```

## 🔧 Comandos Comunes

### Backend

```bash
cd backend

# Activar venv
source venv/bin/activate

# Iniciar servidor (puerto 8001)
python3 start.py

# O iniciar directamente
python3 main.py
```

### Frontend

```bash
cd frontend

# Desarrollo (puerto 3001)
npm run dev

# Build producción
npm run build

# Preview build
npm run preview

# Linting
npm run lint

# Type checking
npm run type-check
```

### ETL (Extracción de Datos)

```bash
cd etl

# Extraer gaps de datos
./extract_gaps.sh

# ETL de ventas históricas
python3 core/etl_ventas_historico.py

# Verificar conectividad
python3 core/verificar_conectividad.py

# Ver logs
tail -f logs/ventas_historico_*.log
```

## 📡 API Endpoints

### Backend REST API

```
GET  /                 # Health check
GET  /ventas           # Sales data (con filtros: fecha_inicio, fecha_fin, tienda_id)
GET  /estadisticas     # Business statistics
GET  /tendencias       # Sales trends
GET  /productos        # Product catalog
GET  /ubicaciones      # Store locations
POST /query            # Custom DuckDB query
```

**Documentación completa:** http://localhost:8001/docs (Swagger UI)

## 🎨 Frontend Components

Componentes React principales en `frontend/src/components/`:

- **AIAgentPanel.tsx** - Panel de alertas proactivas con IA
- **PurchaseIntelligence.tsx** - Recomendaciones de optimización de compras
- **ClientIntelligence.tsx** - Predicciones de comportamiento de clientes
- **MainDashboard.tsx** - Dashboard ejecutivo con KPIs
- **ProactiveInsightsPanel.tsx** - Insights de negocio impulsados por IA
- **DailyActionCenter.tsx** - Centro de acciones prioritarias

## 🔄 Sistema ETL

Scripts de extracción en `etl/core/`:

- **etl_ventas_historico.py** - ETL principal de ventas históricas
- **config.py** - Configuración del ETL
- **tiendas_config.py** - Configuración de tiendas
- **verificar_conectividad.py** - Verificación de conectividad

### Datos Extraídos

- **16 tiendas** (La Granja, San Felipe, Valencia, etc.)
- **13 meses** de histórico (Sep 2024 - Sep 2025)
- **81.8M transacciones** de ventas

## 🛠️ Troubleshooting

### Puertos en Uso

```bash
# Verificar qué usa cada puerto
lsof -i :8001  # Backend
lsof -i :3001  # Frontend

# Matar proceso
kill -9 <PID>
```

### Database Bloqueada

```bash
# DuckDB puede estar bloqueada por otro proceso
lsof | grep fluxion_production.db

# Matar proceso que bloquea
kill -9 <PID>
```

### Errores de ETL

```bash
# Ver logs
tail -100 etl/logs/ventas_historico_*.log

# Verificar conectividad
cd etl && python3 core/verificar_conectividad.py
```

### Dependencias Faltantes

```bash
# Backend
cd backend && pip install -r requirements.txt

# Frontend
cd frontend && npm install
```

## 📝 Documentación

- **[CLAUDE.md](CLAUDE.md)** - Guía para Claude Code (arquitectura, comandos, patrones)
- **[DATA_MODEL_DOCUMENTATION.md](DATA_MODEL_DOCUMENTATION.md)** - Esquema de base de datos
- **[etl/docs/](etl/docs/)** - Documentación del sistema ETL
- **API Docs** - http://localhost:8001/docs (Swagger UI cuando backend está corriendo)

## 🗂️ Archivos Archivados

El directorio `archive/` contiene scripts de referencia que **no son parte del sistema activo**:

- **archive/migration-scripts/** - Scripts one-time de migración y análisis de datos
  - Scripts de análisis (analyze_*.py)
  - Scripts de fixes (apply_*.py)
  - Queries SQL de optimización

Ver [archive/migration-scripts/README.md](archive/migration-scripts/README.md) para detalles.

## ⚡ Performance

### DuckDB es Rápido

- **OLAP optimizado:** Queries analíticos ultrarrápidos
- **80M+ rows:** Maneja grandes volúmenes sin problemas
- **Embedded:** Sin overhead de servidor de base de datos
- **Columnar storage:** Perfecto para analytics

### Tips de Performance

1. ETL mejor correr en horarios de baja actividad
2. Índices aplicados (ver `archive/migration-scripts/create_indexes.sql`)
3. Frontend cachea responses del API donde es apropiado

## 🚀 Deployment a Producción

### Build

```bash
# Frontend
cd frontend
npm run build
# Output en: dist/

# Backend (ya está listo)
cd backend
# No necesita build, Python directo
```

### Correr en Producción

```bash
# Backend
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8001 --workers 4

# Frontend
# Servir dist/ con nginx, Apache, o similar
```

### Checklist de Producción

- [ ] Backend corriendo con uvicorn + workers
- [ ] Frontend build servido por nginx/Apache
- [ ] DuckDB `data/` directory con backups automáticos
- [ ] ETL jobs programados (cron/scheduler)
- [ ] Logs siendo monitoreados
- [ ] Health checks configurados
- [ ] SSL/HTTPS configurado

## 🔐 Seguridad

### Datos Sensibles

- Base de datos en `data/` está en `.gitignore` (16GB, no se commitea)
- Variables de entorno en `.env` (también gitignored)
- Credenciales de API keys no hardcodeadas

### Backups

```bash
# Backup de DuckDB
cp data/fluxion_production.db backups/fluxion_$(date +%Y%m%d).db

# O usar DuckDB export
duckdb data/fluxion_production.db "EXPORT DATABASE 'backups/export_$(date +%Y%m%d)'"
```

## 📈 Contexto de Negocio

### La Granja Mercado

Sistema diseñado para **La Granja Mercado**, distribuidor mayorista B2B en Venezuela.

### Características Clave

- **IA Proactiva:** Alertas antes de que ocurran problemas
- **Predicciones:** Demanda, comportamiento de clientes, stockouts
- **Optimización:** Recomendaciones de compra, transferencias entre tiendas
- **Contexto Venezolano:** Productos reales (Harina PAN, Savoy, etc.)

### Datos

- 16 tiendas en diferentes ciudades de Venezuela
- Productos de consumo masivo y abarrotes
- Clientes mayoristas (restaurantes, bodegas, etc.)

## 🤝 Contribución

### Agregar Features

Al agregar nuevas funcionalidades:

1. **Backend:** Agregar endpoint en `backend/main.py`
2. **Frontend:** Crear componente en `frontend/src/components/`
3. **Database:** Actualizar schema en `database/schema_extended.sql` si es necesario
4. **Documentación:** Actualizar `CLAUDE.md` y este `README.md`

### Git Workflow

```bash
# Crear feature branch
git checkout -b feature/nombre-feature

# Hacer cambios
git add .
git commit -m "feat: descripción del feature"

# Push
git push origin feature/nombre-feature

# Crear PR en GitHub
```

## 📞 Soporte

Para preguntas o problemas:

1. Ver documentación en `CLAUDE.md`
2. Revisar logs en `etl/logs/`
3. Consultar API docs en http://localhost:8001/docs
4. Revisar scripts archivados en `archive/` si es relevante

## 📄 Licencia

Proprietary - Fluxion AI © 2024

---

**Última actualización:** Octubre 2025
**Versión:** 2.0 (arquitectura DuckDB consolidada)
