# Documentacion de Fluxion AI

Indice de toda la documentacion del proyecto.

## Empezar aqui (Onboarding)

| Documento | Audiencia | Descripcion |
|-----------|-----------|-------------|
| [Developer Guide](onboarding/DEVELOPER_GUIDE.md) | Desarrolladores | Setup local, arquitectura del codigo, endpoints, componentes, DB |
| [Architecture & DevOps Guide](onboarding/ARCHITECTURE_DEVOPS.md) | DevOps | Diagramas AWS, CDK stack, CI/CD pipeline, runbooks |
| [ETL Pipeline](onboarding/ETL_PIPELINE.md) | Todos | Pipeline de datos, fuentes, scheduling, monitoreo |
| [Contributing](../CONTRIBUTING.md) | Todos | Workflow, convenciones de codigo, como contribuir |

## Referencia Tecnica

| Documento | Descripcion |
|-----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Arquitectura general del sistema |
| [CODING-STANDARDS.md](CODING-STANDARDS.md) | Estandares de codigo Python y TypeScript |
| [DATABASE_DIAGRAM.md](DATABASE_DIAGRAM.md) | Diagrama de la base de datos |
| [DESIGN-PATTERNS.md](DESIGN-PATTERNS.md) | Patrones de diseno usados |
| [DIAGNOSTICO_PERFORMANCE_ENDPOINTS.md](DIAGNOSTICO_PERFORMANCE_ENDPOINTS.md) | Performance de endpoints criticos |

## Por Area

### Arquitectura y Datos
- [architecture/data-model.md](architecture/data-model.md) - Modelo de datos completo
- [architecture/database-diagram.md](architecture/database-diagram.md) - Diagrama detallado de DB

### Setup y Configuracion
- [setup/quick-start.md](setup/quick-start.md) - Quick start AWS
- [setup/github-secrets.md](setup/github-secrets.md) - GitHub Secrets para CI/CD
- [setup/ci-cd-setup.md](setup/ci-cd-setup.md) - Configuracion CI/CD

### Deployment
- [deployment/aws-deployment.md](deployment/aws-deployment.md) - Deploy a AWS
- [deployment/cdk-deployment.md](deployment/cdk-deployment.md) - Deploy via CDK

### Infraestructura
- [infrastructure/](infrastructure/) - VPN, backups, dominios, multi-tenant

### Operaciones
- [operations/](operations/) - Auditorias, seguridad, limpieza de DB

### Logica de Negocio
- [business/](business/) - Pedidos sugeridos, forecasting, clasificaciones
- [sistema-pedido-sugerido/](sistema-pedido-sugerido/) - Sistema de pedidos sugeridos

### Features en Desarrollo
- [planes-features/](planes-features/) - Planes de features por implementar
- [plans/](plans/) - Planes activos

### Analisis Tecnico
- [analisis-tecnico/](analisis-tecnico/) - Refactorings, fixes, analisis

### Propuesta Comercial
- [propuesta-comercial/](propuesta-comercial/) - Materiales comerciales y ROI
