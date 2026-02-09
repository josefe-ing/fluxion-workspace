# Fluxion AI

**Sistema de gestion de inventarios con inteligencia artificial para distribuidores mayoristas B2B.**

Cliente actual: [La Granja Mercado](https://fluxionia.co) - 16 tiendas + 2 CEDIs en Venezuela.

---

## Que hace Fluxion

- Extrae inventarios y ventas de los POS (KLK + Stellar) cada 30 minutos
- Calcula pedidos sugeridos con clasificacion ABC/XYZ y demanda probabilistica
- Dashboard en tiempo real para gerentes de tienda y operaciones
- Deteccion de agotamientos criticos y emergencias de inventario
- Business Intelligence: analisis por tienda, producto, y categoria

## Stack Tecnologico

| Capa | Tecnologia |
|------|-----------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS |
| **Backend** | Python 3.11, FastAPI, PostgreSQL |
| **Base de Datos** | PostgreSQL 16.3 (AWS RDS + Read Replica) |
| **ETL** | Python, SQL Server ODBC, KLK REST API |
| **Infraestructura** | AWS CDK, ECS Fargate, CloudFront, S3 |
| **CI/CD** | GitHub Actions (8-job pipeline) |
| **Monitoreo** | Sentry, CloudWatch, Container Insights |

## Quick Start

```bash
# 1. Clonar
git clone git@github.com:josefe-ing/fluxion-workspace.git
cd fluxion-workspace

# 2. PostgreSQL local
docker-compose up -d postgres

# 3. Backend (localhost:8001)
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# 4. Frontend (localhost:3000)
cd frontend && npm install && npm run dev

# O todo junto:
./start_dev.sh
```

## Estructura del Proyecto

```
fluxion-workspace/
├── backend/           Python FastAPI API server
├── frontend/          React SPA dashboard
├── etl/               Data extraction pipeline (KLK + Stellar → PostgreSQL)
├── database/          SQL migrations
├── infrastructure/    AWS CDK stack (TypeScript)
├── docs/              Documentation
│   └── onboarding/    Start here for new contributors
└── .github/workflows/ CI/CD pipeline
```

## Documentacion

### Para nuevos colaboradores

| Documento | Audiencia | Contenido |
|-----------|-----------|-----------|
| [Developer Guide](docs/onboarding/DEVELOPER_GUIDE.md) | Desarrolladores | Setup local, arquitectura del codigo, endpoints, componentes |
| [Architecture & DevOps Guide](docs/onboarding/ARCHITECTURE_DEVOPS.md) | DevOps | Diagramas AWS, CDK stack, CI/CD, runbooks |
| [ETL Pipeline](docs/onboarding/ETL_PIPELINE.md) | Todos | Pipeline de datos, fuentes, configuracion de tiendas |
| [Contributing](CONTRIBUTING.md) | Todos | Workflow de desarrollo, convenciones, como contribuir |

### Documentacion tecnica

| Documento | Contenido |
|-----------|-----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitectura del sistema |
| [docs/CODING-STANDARDS.md](docs/CODING-STANDARDS.md) | Estandares de codigo |
| [docs/DIAGNOSTICO_PERFORMANCE_ENDPOINTS.md](docs/DIAGNOSTICO_PERFORMANCE_ENDPOINTS.md) | Performance de endpoints |
| [docs/DATABASE_DIAGRAM.md](docs/DATABASE_DIAGRAM.md) | Diagrama de base de datos |

## URLs

| Entorno | Frontend | API | Docs API |
|---------|----------|-----|----------|
| Desarrollo | localhost:3000 | localhost:8001 | localhost:8001/docs |
| Produccion | admin.fluxionia.co | api.fluxionia.co | api.fluxionia.co/docs |

## Deployment

Push a `main` dispara automaticamente el pipeline CI/CD que construye, testea, y despliega a produccion.

```bash
# Deploy manual de infraestructura
cd infrastructure && npx cdk deploy
```

Ver [Architecture & DevOps Guide](docs/onboarding/ARCHITECTURE_DEVOPS.md) para mas detalles.
