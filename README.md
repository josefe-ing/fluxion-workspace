# 🚀 Fluxion AI - Workspace Principal

> **Sistema de Gestión de Inventario con IA Proactiva para Distribuidores Mayoristas**

## 📋 Quick Start

```bash
# 1. Desarrollo rápido (nativo)
make dev

# 2. Demo para cliente
make demo CLIENT=la-granja TYPE=executive

# 3. Sistema completo (Docker)
make dev-docker
```

## 🏗️ Estructura del Proyecto

```
fluxion-workspace/
├── services/               # 🎯 Microservicios (git submodules)
│   ├── backend/           # API Node.js + Express
│   ├── frontend/          # Dashboard React
│   ├── ai-engine/         # Motor IA Python
│   └── infrastructure/    # IaC y configuración
├── demos/                 # 🎪 Sistema de demos
│   └── clients/          # Configuraciones por cliente
├── docs/                  # 📚 Documentación completa
├── scripts/              # 🔧 Automatización
└── docker-compose.yml    # 🐳 Orquestación
```

## 🎯 Comandos Principales

| Comando | Descripción |
|---------|-------------|
| `make help` | Muestra todos los comandos disponibles |
| `make dev` | Inicia entorno de desarrollo |
| `make demo` | Lanza demo para cliente |
| `make stop` | Detiene todos los servicios |
| `make sync` | Sincroniza con GitHub |
| `make new-demo CLIENT=nombre` | Crea nueva demo |

## 🎪 Sistema de Demos

### Tipos de Demo

1. **Quick (5 min)** - Dashboard standalone, sin backend
2. **Executive (20 min)** - Dashboard + insights en tiempo real
3. **Full (45 min)** - Sistema completo con todas las features

### Crear Nueva Demo

```bash
# 1. Crear configuración para nuevo cliente
make new-demo CLIENT=farmacia-central

# 2. Editar configuración
vim demos/clients/farmacia-central/config.json

# 3. Lanzar demo
make demo CLIENT=farmacia-central TYPE=executive
```

## 🔄 Workflow de Desarrollo

### Desarrollo Diario

```bash
# Mañana - Iniciar entorno
make dev

# Durante el día - Desarrollar
# Los cambios se reflejan automáticamente

# Fin del día - Sincronizar
make sync
```

### Preparar Demo

```bash
# 1. Actualizar datos del cliente
vim demos/clients/la-granja/config.json

# 2. Probar demo
make demo CLIENT=la-granja TYPE=executive

# 3. Guardar estado
make demo-save CLIENT=la-granja
```

## 📊 URLs y Endpoints

### Desarrollo
- **Backend API**: http://localhost:3000
- **Frontend**: http://localhost:3001
- **AI Engine**: http://localhost:8000
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### Demo
- **Dashboard**: http://localhost:8080
- **API Mock**: http://localhost:3001
- **WhatsApp Sim**: +58 424-DEMO001

## 🐳 Docker

### Desarrollo con Docker

```bash
# Iniciar todo
make dev-docker

# Ver logs
make logs

# Detener
make stop

# Limpiar todo
make clean
```

### Construir Imágenes

```bash
make docker-build
make docker-push
```

## 🔧 Configuración

### Variables de Entorno

```bash
# Copiar template
cp .env.example .env

# Editar configuración
vim .env
```

### Base de Datos

```bash
# Acceder a PostgreSQL
psql -h localhost -U fluxion -d fluxion

# Backup
pg_dump -h localhost -U fluxion fluxion > backup.sql
```

## 📱 WhatsApp Bot

### Comandos de Demo

- `inventario [producto]` - Consulta stock
- `alertas` - Ver alertas activas
- `prediccion [mes]` - Forecast
- `ordenar [producto] [cantidad]` - Simular orden

## 🚀 Deployment

### Local (desarrollo)
```bash
make dev
```

### Staging
```bash
make deploy ENV=staging
```

### Producción
```bash
make deploy ENV=production
```

## 📈 Monitoreo

- **Logs**: `.fluxion/*.log`
- **Métricas**: http://localhost:3000/metrics
- **Health**: http://localhost:3000/health

## 🤝 Contribución

### Git Flow

```bash
# Feature nueva
git checkout -b feature/nombre

# Commit y push
git add .
git commit -m "feat: descripción"
git push origin feature/nombre

# Sincronizar todos los repos
make sync
```

## 📝 Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Plan de Desarrollo](docs/DEVELOPMENT-PLAN.md)
- [Estrategia de Demos](demos/DEMO-STRATEGY.md)
- [API Docs](http://localhost:3000/api-docs)

## 🆘 Troubleshooting

### Puertos en uso
```bash
make kill-ports
```

### Limpiar todo
```bash
make clean
docker system prune -a
```

### Resetear demo
```bash
make demo-reset CLIENT=la-granja
```

## 📞 Contacto y Soporte

- **Email**: soporte@fluxion.ai
- **WhatsApp**: +58 424-FLUXION
- **Docs**: https://docs.fluxion.ai

## 📄 Licencia

Proprietary - Fluxion AI © 2024