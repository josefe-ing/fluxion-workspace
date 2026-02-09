# Evaluacion: Migracion de Fluxion AI de AWS a Google Cloud

> **Fecha:** 2026-02-09
> **Estado:** Evaluacion completada
> **Recomendacion:** NO MIGRAR

## Contexto

Fluxion AI corre 100% en AWS (us-east-1) sirviendo 16+ tiendas de La Granja Mercado en Venezuela. La infraestructura actual esta definida en AWS CDK (~1,432 lineas) e incluye ECS Fargate, RDS PostgreSQL con read replica, 3 distribuciones CloudFront, un VPN bridge con WireGuard a las tiendas, y 5 reglas EventBridge para ETL automatizado. El objetivo es evaluar si migrar a GCP tiene sentido en costo, complejidad y riesgo.

---

## 1. Mapeo de Servicios AWS → GCP

| AWS Actual | Config | GCP Equivalente | Notas |
|---|---|---|---|
| ECS Fargate (Backend) | 2 tasks, 1vCPU/2GB, 24/7 | **Cloud Run** (min-instances=2) o **GKE Autopilot** | Cloud Run always-on es ~2.3x mas caro que Fargate |
| ECS Fargate (ETL) | On-demand, 1vCPU/2GB | **Cloud Run Jobs** | Equivalente directo |
| EC2 t3.micro (WireGuard) | VPN bridge siempre encendido | **Compute Engine e2-micro** | Requiere `can_ip_forward=true` |
| RDS PostgreSQL 16.3 | t3.medium primary + replica | **Cloud SQL Enterprise** (db-custom-2-4096) | 20-30% mas caro que RDS |
| S3 (3 buckets) | Frontend, backups, docs | **Cloud Storage** | Equivalente directo |
| CloudFront (3 distros) | Frontend, API, docs | **Cloud CDN + External HTTPS LB** | Requiere load balancer (mas caro) |
| ALB | Backend HTTP | **External Application LB** | ~5x mas caro en GCP |
| EventBridge (5 reglas) | Cron → ECS tasks | **Cloud Scheduler** → Cloud Run Jobs | Trigger por HTTP en vez de directo |
| Secrets Manager (4) | DB creds, SQL, SendGrid, WireGuard | **Secret Manager** | Equivalente directo, API diferente |
| ECR (2 repos) | Backend, ETL images | **Artifact Registry** | Equivalente directo |
| VPC + NAT Gateway | 2 AZs, 1 NAT | **VPC + Cloud NAT** | VPC global en GCP, modelo diferente |
| CloudWatch Logs | Container logs, 1 semana | **Cloud Logging** | Equivalente directo |
| ACM (SSL wildcard) | *.fluxionia.co | **Certificate Manager** | Auto-renewal con DNS validation |
| AWS CDK (TypeScript) | 1,432 lineas IaC | **Terraform** o **Pulumi** | Reescritura completa, sin herramienta de conversion |

---

## 2. Comparacion de Costos Mensuales

### AWS Actual: ~$258/mes

| Servicio | Costo |
|---|---|
| ECS Fargate Backend (2 tasks 24/7) | $65.60 |
| ECS Fargate ETL (on-demand) | $1.85 |
| EC2 t3.micro WireGuard | $7.59 |
| RDS Primary t3.medium + 100GB | $64.06 |
| RDS Read Replica t3.medium | $52.56 |
| NAT Gateway + data | $34.20 |
| ALB | $18.43 |
| S3 + CloudFront + ECR + Secrets + Logs | $13.72 |

### GCP Equivalente: ~$394-474/mes

| Servicio | Costo |
|---|---|
| Cloud Run Backend (min-instances=2) | $152 (o GKE Autopilot ~$72) |
| Cloud Run Jobs ETL | $4.52 |
| Compute Engine e2-micro | $6.13 |
| Cloud SQL Primary + 100GB SSD | $97.74 |
| Cloud SQL Read Replica | $80.74 |
| Cloud NAT | $33.47 |
| **External Application LB** | **$91.65** (vs $18 en AWS) |
| Storage + CDN + Registry + Secrets + Logs | $7.43 |

### Resumen de Costos

| Escenario | Mensual | vs AWS |
|---|---|---|
| AWS actual | ~$258 | -- |
| GCP con Cloud Run | ~$474 | **+84% (+$216/mes)** |
| GCP con GKE Autopilot | ~$394 | **+53% (+$136/mes)** |
| GCP optimizado (CUD + ajustes) | ~$280-320 | **+8-24% (+$22-62/mes)** |

**GCP es mas caro** para este workload, principalmente por:
1. Cloud Run always-on cuesta ~2.3x mas que Fargate para cargas persistentes
2. Load Balancer externo de GCP es ~5x mas caro que ALB
3. Cloud SQL es ~20-30% mas caro que RDS

---

## 3. Complejidad de Migracion

### Archivos que requieren cambios

| Archivo | Cambio | Esfuerzo |
|---|---|---|
| `infrastructure/lib/infrastructure-stack.ts` | Reescritura completa a Terraform/Pulumi (1,432 lineas) | **10-15 dias** |
| `backend/main.py` | Reemplazar 13 llamadas boto3 (ECS run_task, describe_tasks, CloudWatch logs) con google-cloud-run y google-cloud-logging | **5-7 dias** |
| `backend/secrets_manager.py` | Reescribir clase completa para GCP Secret Manager API | **1-2 dias** |
| `backend/store_secret.py` | Reescribir CLI helper | **1 dia** |
| `backend/requirements.txt` | Reemplazar boto3 con google-cloud-* | **0.5 dia** |
| `backend/Dockerfile` | Remover AWS CLI | **0.5 dia** |
| `etl/Dockerfile` | Remover AWS CLI y boto3 | **0.5 dia** |
| `.github/workflows/deploy.yml` | Reescribir 8-job pipeline para GCP | **3-5 dias** |
| `.github/workflows/run-postgres-migrations.yml` | Adaptar para GCP | **1 dia** |

### Archivos que NO cambian

Todo el codigo ETL (0 dependencias AWS), `db_config.py`, `db_manager.py`, `email_notifier.py`, `sentry_config.py`, todo el frontend, todos los routers y services del backend.

### Esfuerzo total: 41-60 dias-persona (8-12 semanas para 1 desarrollador)

---

## 4. Riesgos

### CRITICO: WireGuard VPN Bridge

- Conecta a SQL Server on-premise en tiendas de Venezuela via 192.168.0.0/16
- Si falla el VPN, **todas las 16+ tiendas pierden sincronizacion ETL**
- Requiere coordinacion con IT de La Granja en Venezuela
- Diferentes modelos de firewall (GCP usa reglas a nivel VPC vs security groups por instancia)
- **Es el gate go/no-go de toda la migracion**

### ALTO: Migracion de datos (10M+ registros)

- pg_dump/pg_restore toma 1-4 horas para ventas (10M+ rows)
- Requiere ventana de mantenimiento coordinada
- 36+ migraciones SQL deben verificarse en Cloud SQL
- Parametros PostgreSQL custom pueden no estar disponibles como Cloud SQL database flags

### MEDIO: Arquitectura de scheduling ETL

- EventBridge dispara ECS tasks directamente con command overrides
- Cloud Scheduler dispara Cloud Run Jobs via HTTP (mecanismo diferente)
- 5 reglas con comandos diferentes necesitan mapeo cuidadoso

### BAJO: Frontend y CI/CD

- Frontend tiene 0 codigo cloud-specific
- GitHub Actions funciona igual con GCP

---

## 5. Recomendacion: NO MIGRAR

### Razones

1. **GCP es mas caro**, no mas barato. Minimo +8% y potencialmente +84% mas mensual
2. **Esfuerzo desproporcionado**: 8-12 semanas de trabajo para un sistema que funciona bien
3. **Riesgo VPN critico**: cualquier fallo deja las tiendas sin sincronizacion
4. **No hay deuda tecnica que justifique**: la capa de aplicacion (FastAPI, PostgreSQL, React) es cloud-agnostic. Solo la orquestacion (CDK, boto3 para ECS) es AWS-specific
5. **Riesgo a continuidad del negocio**: sistema en produccion sirviendo operaciones diarias

### Alternativa: Optimizar en AWS (ahorro ~$80/mes sin riesgo)

| Optimizacion | Ahorro mensual |
|---|---|
| Fargate Spot para ETL tasks | ~$1 |
| Graviton (ARM) para Fargate backend | ~$13 |
| Reserved Instance 1-ano para RDS | ~$41 |
| Right-size RDS replica a t3.small (si viable) | ~$26 |
| **Total** | **~$80/mes** |

### Cuando SI tendria sentido migrar

- Si GCP ofrece creditos significativos (startups/partnerships)
- Si el equipo quiere consolidar en GCP por otra razon (BigQuery, Vertex AI, etc.)
- Si se planea un overhaul arquitectonico mayor (ej: mover a Kubernetes)
- Si hay un requisito de negocio para estar en GCP
