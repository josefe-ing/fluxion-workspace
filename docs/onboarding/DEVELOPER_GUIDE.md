# Guia del Desarrollador - Fluxion AI

> Sistema de gestion de inventarios con inteligencia artificial para distribuidores mayoristas B2B en Venezuela.
> Cliente actual: **La Granja Mercado** (16 tiendas + 2 CEDIs).

---

## Tabla de Contenidos

1. [Vision General del Proyecto](#vision-general-del-proyecto)
2. [Setup del Entorno Local](#setup-del-entorno-local)
3. [Arquitectura del Codigo](#arquitectura-del-codigo)
4. [Backend (FastAPI)](#backend-fastapi)
5. [Frontend (React + TypeScript)](#frontend-react--typescript)
6. [Base de Datos](#base-de-datos)
7. [ETL (Extraccion de Datos)](#etl-extraccion-de-datos)
8. [Flujo de Datos End-to-End](#flujo-de-datos-end-to-end)
9. [Guia de Desarrollo](#guia-de-desarrollo)
10. [Troubleshooting](#troubleshooting)

---

## Vision General del Proyecto

Fluxion AI es un sistema que:

1. **Extrae datos** de los POS (punto de venta) de La Granja cada 30 minutos via ETL
2. **Calcula** inventarios optimos, clasificaciones ABC/XYZ, y pedidos sugeridos
3. **Presenta** dashboards en tiempo real para gerentes de tienda y operaciones

### Fuentes de Datos

| Fuente | Tipo | Tiendas | Protocolo |
|--------|------|---------|-----------|
| **KLK** | API REST | 12 tiendas | HTTPS directo |
| **Stellar** | SQL Server | 4 tiendas (Bosque, Guacara, Paramacay, Artigas) | VPN WireGuard → SQL Server |

### URLs del Sistema

| Entorno | Frontend | API | Docs API |
|---------|----------|-----|----------|
| **Desarrollo** | `localhost:3000` | `localhost:8001` | `localhost:8001/docs` |
| **Produccion** | `admin.fluxionia.co` | `api.fluxionia.co` | `api.fluxionia.co/docs` |

---

## Setup del Entorno Local

### Prerequisitos

- Python 3.11+
- Node.js 20+
- Docker y Docker Compose
- Git

### Paso 1: Clonar y configurar

```bash
git clone git@github.com:josefe-ing/fluxion-workspace.git
cd fluxion-workspace
```

### Paso 2: Levantar PostgreSQL local

```bash
docker-compose up -d postgres
# PostgreSQL estara en localhost:5433 (NO 5432 para evitar conflictos)
# DB: fluxion_production | User: fluxion | Pass: fluxion_dev_2025
```

pgAdmin opcional:
```bash
docker-compose --profile tools up -d pgadmin
# http://localhost:5050 (admin@fluxion.ai / admin123)
```

### Paso 3: Levantar Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

API docs: http://localhost:8001/docs

### Paso 4: Levantar Frontend

```bash
cd frontend
npm install
npm run dev
# http://localhost:3000
```

### Script rapido (todo junto)

```bash
./start_dev.sh   # Levanta PostgreSQL + Backend + Frontend
./stop_dev.sh    # Detiene todo
```

### Variables de Entorno

El backend usa variables de entorno para conectar a PostgreSQL. En desarrollo local, el backend lee directamente del `docker-compose.yml`. En produccion, se inyectan via AWS Secrets Manager y ECS task definitions.

Variables clave:
```
POSTGRES_HOST      # Host de PostgreSQL
POSTGRES_PORT      # Puerto (5432 en prod, 5433 en local)
POSTGRES_DB        # fluxion_production
POSTGRES_USER      # Usuario
POSTGRES_PASSWORD  # Contraseña
ENVIRONMENT        # development | production
```

---

## Arquitectura del Codigo

```
fluxion-workspace/
├── backend/                    # API REST (Python/FastAPI)
│   ├── main.py                # Punto de entrada, registro de routers, middlewares
│   ├── auth.py                # Autenticacion JWT, RBAC (roles)
│   ├── database.py            # Conexion PostgreSQL (pool de conexiones)
│   ├── routers/               # 13 routers organizados por dominio
│   ├── services/              # Logica de negocio pesada
│   ├── middleware/             # Tenant middleware (multi-tenant)
│   ├── Dockerfile             # Imagen Docker para produccion
│   ├── startup.sh             # Script de arranque en ECS
│   └── requirements.txt       # Dependencias Python
│
├── frontend/                   # SPA (React/TypeScript/Vite)
│   ├── src/
│   │   ├── App.tsx            # Punto de entrada, rutas
│   │   ├── components/        # ~90 componentes organizados por dominio
│   │   ├── services/          # Clientes HTTP para cada API
│   │   ├── contexts/          # AuthContext (estado global)
│   │   └── hooks/             # Custom hooks
│   ├── Dockerfile             # Multi-stage build (Vite → Nginx)
│   └── package.json           # Dependencias
│
├── etl/                        # Pipeline de extraccion de datos
│   ├── etl_inventario.py      # ETL principal de inventarios
│   ├── etl_ventas_postgres.py # ETL de ventas
│   ├── core/                  # Modulos compartidos
│   │   ├── tiendas_config.py  # Config de las 20 tiendas/CEDIs
│   │   ├── extractor_inventario.py
│   │   ├── extractor_ventas.py
│   │   └── query_inventario_generic.sql
│   ├── Dockerfile             # Imagen con SQL Server drivers
│   └── requirements.txt
│
├── database/                   # Migraciones SQL
│   ├── migrations/            # ~36 migraciones (UP/DOWN)
│   └── run_migrations.py      # Script de migraciones
│
├── infrastructure/             # AWS CDK (TypeScript)
│   └── lib/
│       └── infrastructure-stack.ts  # Stack principal (VPC, ECS, RDS, etc.)
│
├── .github/workflows/          # CI/CD
│   └── deploy.yml             # Pipeline completo (8 jobs)
│
├── docker-compose.yml          # PostgreSQL local para desarrollo
├── start_dev.sh               # Script para levantar todo
└── CLAUDE.md                  # Instrucciones para Claude Code
```

---

## Backend (FastAPI)

### Punto de Entrada: `backend/main.py`

El archivo `main.py` es grande (~460KB, monolitico) e incluye:
- Registro de 13 routers
- Middlewares (CORS, tenant, error handling)
- Cache en memoria para endpoints pesados
- Endpoints directos de inventarios y ventas (no separados en routers aun)

### Routers (API por Dominio)

| Router | Prefijo | Descripcion |
|--------|---------|-------------|
| `pedidos_sugeridos` | `/pedidos-sugeridos` | Calculo de pedidos optimos por tienda |
| `pedidos_multitienda` | `/pedidos-multitienda` | Pedidos comparando multiples tiendas |
| `pedidos_inter_cedi` | `/pedidos-inter-cedi` | Transferencias entre centros de distribucion |
| `ubicaciones` | `/ubicaciones` | Dashboard regional, resumen de tiendas |
| `business_intelligence` | `/bi` | Analisis de negocio y KPIs |
| `bi_stores` | `/bi/stores` | Analisis por tienda individual |
| `productos_admin` | `/productos` | Administracion de catalogo |
| `config_inventario` | `/config-inventario` | Parametros de inventario por tienda |
| `emergencias` | `/emergencias` | Deteccion de agotamientos criticos |
| `generadores_trafico` | `/generadores-trafico` | Productos que generan trafico |
| `productos_excluidos` | `/productos-excluidos` | Exclusiones de pedidos |
| `productos_excluidos_inter_cedi` | `/productos-excluidos-inter-cedi` | Exclusiones inter-CEDI |
| `etl_history` | `/etl` | Historial de ejecuciones ETL |

### Endpoints Criticos (en main.py)

Estos endpoints estan definidos directamente en `main.py` y son los mas consultados:

```
GET  /                                    # Health check
GET  /inventarios                        # Inventario actual por tienda
GET  /inventarios/agotados-visuales      # Stockouts visuales
GET  /ventas/detail                      # Detalle de ventas con P75
GET  /ventas/summary-regional            # Resumen ventas regional
GET  /productos/{id}/historico-dia       # Historial diario de producto
POST /auth/login                         # Login JWT
```

### Servicios (Logica de Negocio)

| Servicio | Archivo | Funcion |
|----------|---------|---------|
| **Detector Emergencias** | `services/detector_emergencias.py` | Detecta agotamientos criticos en tiempo real |
| **Calculo ABC** | `services/calculo_inventario_abc.py` | Clasificacion ABC Pareto (80/15/5) |
| **ABC Helper** | `services/calculo_abc_helper.py` | Funciones auxiliares de clasificacion |
| **Algoritmo DPDU** | `services/algoritmo_dpdu.py` | Calculo de demanda probabilistica |
| **BI Calculations** | `services/bi_calculations.py` | Calculos para Business Intelligence |

### Autenticacion

- **JWT tokens** con roles (RBAC)
- Roles: `super_admin`, `gerente_general`, `gerente`, `usuario`
- Auto-bootstrap del admin al iniciar
- Middleware de tenant para multi-tenancy (extrae `X-Tenant-ID` del header o hostname)

### Base de Datos (Conexion)

El backend usa `psycopg2` con pool de conexiones. Patron de uso:

```python
from database import get_connection

conn = get_connection()  # Lee de Read Replica en produccion
try:
    with conn.cursor() as cur:
        cur.execute("SELECT ...")
        results = cur.fetchall()
finally:
    conn.close()
```

**Importante:** En produccion, el backend lee del **Read Replica** (separacion read/write). Los ETLs escriben al **Primary**.

### Performance

- Cache en memoria con TTL de 5 min para `ventas_summary`
- Cache de 10 min para `summary-regional`
- Queries pesados usan ventanas de 30 dias
- `PERCENTILE_CONT` y CTEs multi-nivel para pedidos sugeridos

---

## Frontend (React + TypeScript)

### Stack

- **React 18** con TypeScript
- **Vite** como bundler (port 3000 en dev)
- **TailwindCSS** para estilos
- **Chart.js** + **Recharts** para graficos
- **Lucide React** para iconos
- **Axios** para HTTP
- **React Router DOM v7** para rutas

### Estructura de Componentes

Los componentes estan organizados por dominio:

```
src/components/
├── layout/            # Layout principal, Header, navegacion
├── dashboard/         # Dashboard regional (pantalla principal)
│   ├── InventorySummary.tsx      # Resumen de inventarios
│   ├── InventoryHealthChart.tsx  # Grafico de salud
│   ├── SyncButton.tsx            # Boton de sync manual
│   └── ProductHistoryModal.tsx   # Modal de historial
├── orders/            # Pedidos sugeridos (funcionalidad core)
│   ├── OrderWizard.tsx           # Wizard principal de pedidos
│   ├── PedidoSugeridoV2Wizard.tsx # Wizard V2
│   ├── wizard-v2/                # Componentes del wizard V2
│   ├── wizard-intercedi/         # Wizard de transferencias inter-CEDI
│   └── [modales de analisis]     # ABC, XYZ, Stock, etc.
├── productos/         # Catalogo y analisis de productos
│   ├── ProductosLayout.tsx       # Layout de productos
│   ├── ABCXYZAnalysis.tsx        # Analisis ABC/XYZ
│   └── charts/                   # Graficos especializados
├── bi/                # Business Intelligence
│   ├── BusinessIntelligence.tsx  # Dashboard BI principal
│   ├── stores/                   # Analisis por tienda
│   └── [componentes de analisis]
├── sales/             # Analisis de ventas
├── admin/             # Configuracion y administracion
├── settings/          # Panel de configuracion del sistema
├── emergencias/       # Dashboard de emergencias
├── shared/            # Componentes compartidos
├── LoginPage.tsx      # Pagina de login
└── LandingPage.tsx    # Landing page
```

### Patron de Comunicacion con API

```
Componente → services/apiService.ts → Axios → Backend FastAPI
```

Los servicios HTTP estan en `src/services/` y siguen este patron:

```typescript
// services/pedidosService.ts
import api from './apiService';

export const calcularPedido = async (tiendaId: string) => {
  const { data } = await api.post('/pedidos-sugeridos/calcular', { tienda_id: tiendaId });
  return data;
};
```

### Estado Global

- **AuthContext**: Maneja autenticacion, token JWT, roles del usuario
- Sin Redux - el estado se maneja con Context API y estado local de componentes
- Los datos se fetchean directamente en cada componente que los necesita

### Build de Produccion

```bash
cd frontend
VITE_API_URL=https://api.fluxionia.co npm run build
# Genera dist/ que se sube a S3 + CloudFront
```

---

## Base de Datos

### Motor

- **PostgreSQL 16.3** en AWS RDS
- **Primary** (t3.medium): Escrituras del ETL
- **Read Replica** (t3.medium): Lecturas del Backend/API

### Tablas Principales

| Tabla | Filas Aprox. | Descripcion |
|-------|-------------|-------------|
| `ventas` | ~10M+ | Transacciones de venta (dato mas critico) |
| `productos` | ~15K | Catalogo de productos con clasificaciones |
| `ubicaciones` | 18 | 16 tiendas + 2 CEDIs |
| `inventario_actual` | ~300K | Snapshot actual de inventarios |
| `inventario_historico` | ~50M+ | Snapshots historicos cada 30 min |
| `usuarios` | ~20 | Usuarios del sistema con roles |
| `configuraciones` | ~50 | Parametros del sistema |
| `productos_abc_cache` | ~15K | Cache de clasificacion ABC |
| `pedidos_sugeridos` | Variable | Pedidos calculados |
| `etl_executions` | ~5K | Log de ejecuciones ETL |

### Migraciones

Las migraciones estan en `database/migrations/` con formato `NNN_nombre_UP.sql` / `NNN_nombre_DOWN.sql`.

```bash
cd database
python3 run_migrations.py          # Ejecutar migraciones pendientes
```

Las migraciones se ejecutan automaticamente al desplegar via `backend/startup.sh`.

### Indices Criticos

La tabla `ventas` tiene indices optimizados para:
- `(ubicacion_id, fecha)` - Filtro por tienda y rango de fechas
- `(producto_id, fecha)` - Historial de producto
- `(fecha)` - Queries de rango temporal

---

## ETL (Extraccion de Datos)

> Documentacion detallada en [ETL_PIPELINE.md](./ETL_PIPELINE.md)

### Resumen

El ETL extrae datos de los sistemas POS (KLK y Stellar) cada 30 minutos y los carga en PostgreSQL RDS.

| Script | Fuente | Frecuencia | Que extrae |
|--------|--------|------------|------------|
| `etl_inventario.py` | KLK + Stellar | Cada 30 min | Inventario actual de todas las tiendas |
| `etl_ventas_postgres.py` | KLK | Cada 30 min | Ventas del dia (incremental) |

### Tiendas Configuradas

La configuracion de las 20 ubicaciones esta en `etl/core/tiendas_config.py`. Cada tienda tiene:
- Nombre, ID interno, tipo (KLK o Stellar)
- IP/Host del servidor POS
- Credenciales de conexion
- Deposito/almacen mapeado

---

## Flujo de Datos End-to-End

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────┐
│ POS Tiendas │───▶│ ETL Pipeline │───▶│ PostgreSQL RDS│───▶│ FastAPI      │
│ (KLK/Stellar)│   │ (cada 30min) │    │ (Primary)     │    │ (Backend)    │
└─────────────┘    └──────────────┘    └───────┬───────┘    └──────┬───────┘
                                               │                    │
                                    replicacion │                    │ JSON API
                                               ▼                    ▼
                                       ┌───────────────┐    ┌──────────────┐
                                       │ Read Replica  │    │ React        │
                                       │ (lecturas API)│    │ (Frontend)   │
                                       └───────────────┘    └──────────────┘
```

1. Los POS de las tiendas registran ventas e inventario en tiempo real
2. Cada 30 minutos, el ETL extrae datos via API (KLK) o SQL Server (Stellar via VPN)
3. Los datos se cargan al PostgreSQL Primary
4. El Primary replica automaticamente al Read Replica (<5 seg de lag)
5. El Backend FastAPI lee del Read Replica para servir la API
6. El Frontend React consume la API y presenta dashboards

---

## Guia de Desarrollo

### Convenciones de Codigo

**Backend (Python):**
- Usar type hints en funciones publicas
- Docstrings en funciones complejas
- Logging con `logger.info/warning/error` (no print)
- SQL parametrizado siempre (nunca f-strings en queries)

**Frontend (TypeScript):**
- Componentes funcionales con hooks
- TailwindCSS para estilos (no CSS modules)
- Interfaces para props y respuestas de API
- `async/await` para llamadas HTTP

### Convenciones de Git

Usamos **Conventional Commits**:

```
feat: descripcion corta        # Nueva funcionalidad
fix: descripcion corta         # Correccion de bug
perf: descripcion corta        # Mejora de performance
refactor: descripcion corta    # Refactoring sin cambio funcional
docs: descripcion corta        # Solo documentacion
chore: descripcion corta       # Tareas de mantenimiento
```

### Workflow de Desarrollo

1. Trabaja directo en `main` (equipo pequeño, sin feature branches por ahora)
2. Commit con mensaje descriptivo siguiendo Conventional Commits
3. Push a `main` dispara el pipeline de CI/CD automaticamente
4. El pipeline construye, testea, y despliega a produccion

### Agregar un Nuevo Endpoint

1. Crear/editar un router en `backend/routers/`
2. Registrar el router en `backend/main.py`
3. Crear el servicio de frontend en `frontend/src/services/`
4. Crear/editar el componente React

### Agregar una Migracion de DB

1. Crear archivo `database/migrations/NNN_nombre_UP.sql`
2. Opcionalmente crear `NNN_nombre_DOWN.sql` para rollback
3. Probar localmente: `cd database && python3 run_migrations.py`
4. Las migraciones se ejecutan en deploy via `startup.sh`

---

## Troubleshooting

### El backend no conecta a PostgreSQL local

```bash
# Verificar que el contenedor esta corriendo
docker ps | grep fluxion-postgres

# Si no esta corriendo:
docker-compose up -d postgres

# Verificar conectividad
psql -h localhost -p 5433 -U fluxion -d fluxion_production
```

### El frontend no puede llamar al backend

1. Verificar que el backend esta en `localhost:8001`
2. Verificar CORS en `main.py` (debe incluir `localhost:3000`)
3. Verificar `VITE_API_URL` en el frontend

### Las migraciones fallan

```bash
# Ver estado de migraciones
cd database
python3 run_migrations.py --status

# Si hay errores de tabla existente, verificar schema_migrations
psql -h localhost -p 5433 -U fluxion -d fluxion_production -c "SELECT * FROM schema_migrations ORDER BY id DESC LIMIT 10;"
```

### Logs en produccion

```bash
# Backend (ECS)
aws logs tail /ecs/fluxion-backend --follow

# ETL
aws logs tail /ecs/fluxion-etl --follow

# Sentry (errores)
# https://sentry.io → proyecto fluxion
```
