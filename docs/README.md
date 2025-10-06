# 🚀 Fluxion AI - Sistema de Gestión de Inventario con IA Proactiva

> **Sistema inteligente de inventario para retail multi-tienda con IA proactiva, alertas predictivas y optimización automática.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://python.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://docker.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue.svg)](https://typescriptlang.org/)

---

## 📋 Tabla de Contenidos

- [🎯 ¿Qué es Fluxion AI?](#-qué-es-fluxion-ai)
- [✨ Características Principales](#-características-principales)
- [🏗️ Arquitectura](#️-arquitectura)
- [🚀 Inicio Rápido](#-inicio-rápido)
- [📖 Documentación](#-documentación)
- [🛠️ Desarrollo](#️-desarrollo)
- [🧪 Testing](#-testing)
- [🚢 Deployment](#-deployment)
- [🤝 Contribuir](#-contribuir)

---

## 🎯 ¿Qué es Fluxion AI?

**Fluxion AI** es un sistema revolucionario de gestión de inventario que utiliza **Inteligencia Artificial proactiva** para:

- 🔮 **Predecir problemas** antes de que ocurran
- 🤖 **Optimizar inventario** automáticamente
- 💬 **Conversar** via WhatsApp en español
- 📊 **Integrar** con sistemas POS existentes
- 💰 **Medir ROI** generado en tiempo real

### 🎪 Para quién es este sistema:
- **Retail multi-tienda** (supermercados, farmacias, distribuidoras)
- **Mayoristas** con múltiples puntos de venta
- **Empresas** que manejan inventarios complejos
- **Distribuidores** con clientes B2B

---

## ✨ Características Principales

### 🤖 **Sistema Multi-Agente de IA**
```
🧠 Agent Orchestrator    → Coordinación inteligente
🚨 Alert Agent          → Detecta stockouts, anomalías
📈 Forecast Agent       → Predicciones con Prophet
⚡ Optimizer Agent      → Optimización automática
💬 Chat Agent           → Conversación natural
```

### 📱 **Interfaces Múltiples**
- **Dashboard Web** - React con analytics en tiempo real
- **WhatsApp Bot** - Consultas y acciones por WhatsApp
- **API REST** - Integración con sistemas existentes
- **WebHooks** - Notificaciones automáticas

### 🔗 **Integraciones Nativas**
- **Stellar POS** - Sincronización automática
- **Odoo ERP** - Conectores predefinidos
- **WhatsApp Business** - Bot conversacional
- **Google Cloud** - Infraestructura escalable

---

## 🏗️ Arquitectura

```
                FRONTEND              BACKEND             AI ENGINE     
                React + TS    ←→    Node.js + TS   ←→    Python + ML    
                Port: 3001           Port: 3000           Port: 8000    
                     ↓                     ↓                     ↓
                POSTGRESQL             REDIS              PUBSUB        
               + TimescaleDB          Cache +             Event Bus     
                Port: 5432           Sessions             Port: 8085    
                                     Port: 6379                         
```

### 🧩 **Servicios Principales**

| Servicio | Tecnología | Puerto | Responsabilidad |
|----------|------------|--------|----------------|
| **Frontend** | React + TypeScript | 3001 | Dashboard interactivo |
| **Backend** | Node.js + Express | 3000 | API REST, Business Logic |
| **AI Engine** | Python + FastAPI | 8000 | ML, Agentes, Predicciones |
| **Database** | PostgreSQL + TimescaleDB | 5432 | Datos + Series temporales |
| **Cache** | Redis | 6379 | Cache + Sessions + Pub/Sub |
| **Message Bus** | Google Pub/Sub | 8085 | Eventos asíncronos |

---

## 🚀 Inicio Rápido

### 📋 **Requisitos Previos**
```bash
# Verificar versiones instaladas
node --version  # v20+ requerido
python --version # 3.11+ requerido  
docker --version # Cualquier versión reciente
git --version   # Para clonar el repo
```

### ⚡ **Instalación en 3 Pasos**

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/fluxion-ai.git
cd fluxion-ai

# 2. Setup completo automático
make setup

# 3. Iniciar desarrollo
make dev
```

### 🎯 **Verificación de Instalación**

Después del setup, estos endpoints deben estar disponibles:

| Servicio | URL | Estado Esperado |
|----------|-----|----------------|
| Backend API | http://localhost:3000/health | ✅ `{"status": "ok"}` |
| AI Engine | http://localhost:8000/health | ✅ `{"status": "healthy"}` |
| Frontend | http://localhost:3001 | ✅ Página de login |
| PostgreSQL | localhost:5432 | ✅ Conexión exitosa |
| Redis | localhost:6379 | ✅ PONG response |

---

## 📖 Documentación

### 📚 **Setup y Configuración**
- [Quick Start](setup/quick-start.md) - Guía rápida de inicio en AWS
- [Configuración General](setup/configuracion.md) - Configuración del sistema
- [GitHub Secrets](setup/github-secrets.md) - Configuración de secrets para CI/CD
- [CI/CD Setup](setup/ci-cd-setup.md) - Pipeline de deployment automatizado

### 🚀 **Deployment**
- [AWS Deployment](deployment/aws-deployment.md) - Deployment en AWS con CDK
- [CDK Deployment](deployment/cdk-deployment.md) - Deployment usando AWS CDK
- [Database Transfer](deployment/db-transfer.md) - Transferencia de base de datos a AWS

### 🏗️ **Infraestructura**
- [Backup Strategy](infrastructure/backup-strategy.md) - Estrategia de backups
- [VPN WireGuard](infrastructure/vpn-wireguard.md) - Configuración VPN WireGuard
- [Site-to-Site VPN](infrastructure/vpn-site-to-site.md) - VPN site-to-site con AWS

### 🏛️ **Arquitectura y Diseño**
- [Architecture Overview](ARCHITECTURE.md) - Visión general de la arquitectura
- [Data Model](architecture/data-model.md) - Modelo de datos completo
- [Database Diagram](architecture/database-diagram.md) - Diagrama de base de datos
- [Parametrización](architecture/parametrizacion.md) - Arquitectura de parametrización
- [Design Patterns](DESIGN-PATTERNS.md) - Patrones de diseño utilizados
- [Coding Standards](CODING-STANDARDS.md) - Estándares de código

### 💼 **Business Logic**
- [Business Case](BUSINESS-CASE.md) - Caso de negocio y valor
- [Forecast de Ventas](business/forecast-ventas.md) - Lógica de pronóstico
- [Lógica de Pedidos](business/logica-pedidos.md) - Sugerencias de pedidos
- [Plan de Parametrización](business/plan-parametrizacion.md) - Parametrización de productos
- [POS Integration Strategy](POS_INTEGRATION_STRATEGY.md) - Integración con POS

### ⚙️ **Operaciones**
- [Auditoría](operations/auditoria.md) - Proyecto de auditoría del sistema
- [Limpieza de DB](operations/limpieza-db.md) - Mantenimiento de DuckDB

### 👨‍💻 **Desarrollo**
- [Development Plan](DEVELOPMENT-PLAN.md) - Plan de desarrollo
- [Development Roadmap](DEVELOPMENT-ROADMAP.md) - Roadmap del proyecto
- [Organization Plan](ORGANIZATION-PLAN.md) - Plan de organización
- [MVP Definition](MVPDefinition.md) - Definición del MVP
- [Product Design Document](PDD.md) - Documento de diseño

---

## 🛠️ Desarrollo

### 🎯 **Comandos Principales**

```bash
# Desarrollo
make dev              # Iniciar servicios base
make dev-backend      # Solo backend
make dev-ai           # Solo AI engine  
make dev-frontend     # Solo frontend
make dev-logs         # Ver logs en tiempo real

# Base de datos
make db-setup         # Setup inicial con migrations + seeds
make db-migrate       # Solo migraciones
make db-seed          # Solo datos de prueba
make db-reset         # Reset completo de DB

# Testing y calidad
make test             # Todos los tests
make lint             # Linting de código
make format           # Formatear código
make test-coverage    # Tests con coverage
```

### 🏗️ **Estructura del Proyecto**

```
fluxion-ai/
├── backend/                 # Node.js + TypeScript + Express
│   ├── src/modules/        # Módulos de dominio
│   ├── src/shared/         # Código compartido
│   └── tests/              # Tests unitarios
├── ai-engine/              # Python + FastAPI + ML
│   ├── src/agents/         # Agentes de IA
│   ├── src/models/         # Modelos de ML
│   └── tests/              # Tests de IA
├── frontend/               # React + TypeScript + Tailwind
│   ├── src/components/     # Componentes React
│   ├── src/services/       # API clients
│   └── src/types/          # TypeScript types
├── infrastructure/         # IaC y scripts
│   ├── gcp/               # Google Cloud configs
│   └── kubernetes/        # K8s manifests
└── docs/                  # Documentación completa
```

### 🎨 **Estándares de Código**

El proyecto sigue estándares estrictos definidos en [`CODING-STANDARDS.md`](docs/CODING-STANDARDS.md):

- **TypeScript**: Strict mode, explicit types, defensive programming
- **Python**: Black formatting, mypy type checking, pytest testing
- **React**: Functional components, custom hooks, proper TypeScript
- **Database**: Multi-tenant, migrations with Knex, TimescaleDB

### 🔄 **Workflow de Desarrollo**

```bash
# 1. Crear rama para feature
git checkout -b feature/nueva-funcionalidad

# 2. Desarrollar con TDD
make test-watch  # Tests en modo watch

# 3. Verificar calidad antes de commit
make lint        # Sin errores de linting
make test        # Tests deben pasar
make format      # Código formateado

# 4. Commit y push
git add .
git commit -m "feat(inventario): agregar alertas proactivas"
git push origin feature/nueva-funcionalidad

# 5. Crear Pull Request
# GitHub Actions ejecutará CI automáticamente
```

---

## 🧪 Testing

### 🎯 **Estrategia de Testing**

| Tipo | Herramienta | Coverage | Descripción |
|------|-------------|----------|-------------|
| **Unit** | Jest, Pytest | >80% | Lógica de negocio, funciones puras |
| **Integration** | Supertest, TestContainers | >70% | APIs, base de datos, servicios |
| **E2E** | Playwright | Críticos | Flujos completos de usuario |
| **Load** | k6 | - | Performance bajo carga |

### 🧪 **Ejecutar Tests**

```bash
# Tests completos
make test                    # Todos los servicios
make test-backend           # Solo backend
make test-ai                # Solo AI engine
make test-frontend          # Solo frontend

# Tests con coverage
make test-coverage          # Coverage de todos
make test-backend-coverage  # Coverage backend

# Tests específicos
cd backend && npm test -- --grep "inventory"
cd ai-engine && pytest tests/agents/test_alert_agent.py
cd frontend && npm test -- --testPathPattern=components
```

### 📊 **Coverage Objetivos**
- **Backend**: >80% line coverage
- **AI Engine**: >75% line coverage  
- **Frontend**: >70% line coverage
- **E2E**: Flujos críticos cubiertos

---

## 🚢 Deployment

### 🌍 **Ambientes**

| Ambiente | URL | Propósito | Deploy |
|----------|-----|-----------|--------|
| **Local** | localhost | Desarrollo | `make dev` |
| **Staging** | staging.fluxion.ai | Testing | `make deploy-staging` |
| **Production** | app.fluxion.ai | Producción | `make deploy-prod` |

### ☁️ **Google Cloud Platform**

El proyecto está optimizado para GCP usando:

- **Cloud Run** - Servicios containerizados serverless
- **Cloud SQL** - PostgreSQL managed con TimescaleDB
- **Cloud Storage** - Archivos estáticos y backups
- **Pub/Sub** - Mensajería asíncrona
- **Secret Manager** - Gestión segura de credenciales
- **Cloud Build** - CI/CD automatizado

```bash
# Setup inicial GCP
gcloud auth login
gcloud projects create fluxion-ai-prod --name="Fluxion AI"
gcloud config set project fluxion-ai-prod

# Deploy a staging
make deploy-staging

# Deploy a producción (requiere aprobación)
make deploy-prod
```

### 🐳 **Docker**

```bash
# Build local
make docker-build

# Deploy con Docker Compose
docker-compose up -d                    # Desarrollo
docker-compose -f docker-compose.prod.yml up -d  # Producción
```

### 🔄 **CI/CD Pipeline**

GitHub Actions ejecuta automáticamente:

1. **Pull Request**: Tests, linting, security scan
2. **Merge to develop**: Deploy a staging
3. **Release tag**: Deploy a producción (con aprobación manual)

---

## 🔧 Configuración

### 🌍 **Variables de Entorno**

Copia `.env.example` a `.env` y ajusta según tu entorno:

```bash
cp .env.example .env
```

**Variables críticas:**
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/fluxion_dev

# JWT Secrets (cambiar en producción)
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret

# Google Cloud
GOOGLE_CLOUD_PROJECT=fluxion-ai-dev
GOOGLE_APPLICATION_CREDENTIALS=./gcp-dev-key.json

# WhatsApp Business
WHATSAPP_TOKEN=your-whatsapp-business-token
```

### 🔒 **Seguridad**

- **Nunca** commitear archivos `.env`
- Usar **Secret Manager** para producción  
- **Rotar** JWT secrets regularmente
- **Habilitar** HTTPS en producción
- **Validar** todas las entradas de usuario

---

## 🤝 Contribuir

### 🎯 **Cómo Contribuir**

1. **Fork** el repositorio
2. **Crea** una rama: `git checkout -b feature/mi-feature`
3. **Desarrolla** siguiendo los estándares
4. **Tests** deben pasar: `make test`
5. **Commit**: Usa conventional commits
6. **Push**: `git push origin feature/mi-feature`
7. **Pull Request**: Describe los cambios

### 📝 **Conventional Commits**

```bash
feat(inventario): agregar alertas de stock bajo
fix(auth): corregir validación de JWT
docs(readme): actualizar instrucciones de setup
test(alerts): agregar tests para alert engine
refactor(database): optimizar queries de inventario
```

### 🐛 **Reportar Bugs**

Usa [GitHub Issues](https://github.com/tu-usuario/fluxion-ai/issues) con:
- **Descripción** clara del problema
- **Pasos** para reproducir
- **Comportamiento esperado** vs actual
- **Screenshots** si es UI
- **Logs** relevantes

---

## 📞 Soporte

### 💬 **Canales de Comunicación**

- 🐛 **Bugs & Features**: [GitHub Issues](https://github.com/tu-usuario/fluxion-ai/issues)
- 💬 **Discusiones**: [GitHub Discussions](https://github.com/tu-usuario/fluxion-ai/discussions)
- 📧 **Email**: dev@fluxion.ai
- 📱 **WhatsApp**: +58 XXX-XXXXXXX

### 📚 **Recursos Adicionales**

- [Documentación Técnica](docs/)
- [Video Tutoriales](https://youtube.com/fluxionai)
- [Blog de Desarrollo](https://blog.fluxion.ai)
- [Discord Community](https://discord.gg/fluxionai)

---

## 📄 Licencia

Este proyecto está licenciado bajo la **MIT License** - ver [LICENSE](LICENSE) para detalles.

---

## 🙏 Reconocimientos

### 💪 **Tecnologías Utilizadas**
- [Node.js](https://nodejs.org/) - Runtime JavaScript
- [TypeScript](https://typescriptlang.org/) - Type safety
- [React](https://reactjs.org/) - Frontend framework
- [FastAPI](https://fastapi.tiangolo.com/) - Python web framework
- [PostgreSQL](https://postgresql.org/) - Database
- [TimescaleDB](https://timescale.com/) - Time-series data
- [Redis](https://redis.io/) - Caching & sessions
- [Docker](https://docker.com/) - Containerization
- [Google Cloud](https://cloud.google.com/) - Cloud platform

### 🌟 **Contributors**

Un agradecimiento especial a todos los [contribuidores](https://github.com/tu-usuario/fluxion-ai/graphs/contributors) que han ayudado a hacer este proyecto posible.

---

<div align="center">

**[⬆ Volver al inicio](#-fluxion-ai---sistema-de-gestión-de-inventario-con-ia-proactiva)**

---

Hecho con ❤️ por el equipo de **Fluxion AI**

*Transformando inventarios tradicionales en sistemas inteligentes y proactivos*

</div>