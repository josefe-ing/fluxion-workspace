# Onboarding - Empieza Aqui

Bienvenido al equipo de Fluxion AI. Estos documentos te ayudaran a entender y contribuir al proyecto.

## Por donde empezar

### Si eres Desarrollador

1. **[Developer Guide](DEVELOPER_GUIDE.md)** - Setup local, arquitectura del codigo, endpoints, componentes, flujo de datos
2. **[ETL Pipeline](ETL_PIPELINE.md)** - Como se extraen y cargan los datos de los POS
3. **[CONTRIBUTING.md](../../CONTRIBUTING.md)** - Convenciones de codigo y workflow

### Si eres DevOps / Infraestructura

1. **[Architecture & DevOps Guide](ARCHITECTURE_DEVOPS.md)** - Diagramas AWS, CDK stack, CI/CD pipeline, runbooks operacionales
2. **[ETL Pipeline](ETL_PIPELINE.md)** - Pipeline de datos, scheduling, monitoreo Sentry
3. **[CONTRIBUTING.md](../../CONTRIBUTING.md)** - Workflow de deployment

## Mapa de documentacion completa

```
docs/
├── onboarding/                 ← EMPIEZA AQUI
│   ├── DEVELOPER_GUIDE.md      Guia completa del desarrollador
│   ├── ARCHITECTURE_DEVOPS.md  Arquitectura AWS y operaciones
│   └── ETL_PIPELINE.md         Pipeline de extraccion de datos
│
├── architecture/               Diseno y modelo de datos
├── setup/                      Configuracion inicial AWS
├── deployment/                 Guias de deployment
├── infrastructure/             Red, VPN, backups
├── business/                   Logica de negocio y pedidos
├── operations/                 Auditorias, seguridad, limpieza
├── planes-features/            Planes de features por implementar
├── analisis-tecnico/           Analisis tecnicos especificos
└── archive/                    Documentacion historica (gitignored)
```
