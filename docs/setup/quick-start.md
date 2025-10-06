# ⚡ Quick Start - AWS Deployment

Guía rápida para deployar Fluxion AI en AWS con CDK.

## 🎯 Arquitectura Final

```
Internet → CloudFront (Frontend) → ALB → ECS Fargate (Backend)
                                         ├─ EFS (DuckDB)
                                         ├─ EventBridge (ETL Jobs)
                                         ├─ VPN (SQL Server access)
                                         └─ Sentry (Monitoring)
```

## 🚀 Deployment en 5 Pasos

### 1️⃣ Setup Inicial (10 min)

```bash
# Ejecutar script de inicialización
./scripts/init_cdk.sh

# Esto configura:
# ✓ AWS CLI
# ✓ CDK instalado y bootstrapped
# ✓ Estructura de proyecto
# ✓ Dependencias
```

### 2️⃣ Configurar VPN Site-to-Site (15-20 min)

**⚠️ IMPORTANTE**: Este paso es crítico para que ETL pueda acceder a SQL Servers en red `192.168.x.x`

```bash
# 1. Obtener IP pública de La Granja
# Desde servidor WireGuard o contactar ISP
curl ifconfig.me

# 2. Configurar variable de entorno
export LA_GRANJA_PUBLIC_IP="203.0.113.45"  # Reemplazar con IP real

# 3. Guardar en infrastructure/.env
echo "LA_GRANJA_PUBLIC_IP=203.0.113.45" > infrastructure/.env
```

**📖 Guía completa VPN**: Ver [SITE_TO_SITE_VPN_SETUP.md](SITE_TO_SITE_VPN_SETUP.md)

### 3️⃣ Configurar Secrets (5 min)

```bash
# SQL Server credentials (para ETL)
aws secretsmanager create-secret \
  --name fluxion/sql-credentials \
  --secret-string '{
    "user": "beliveryApp",
    "password": "AxPG_25!"
  }' \
  --tags Key=Project,Value=fluxion-ai

# Opcional: Sentry DSN
aws secretsmanager create-secret \
  --name fluxion/sentry-dsn \
  --secret-string "https://xxxxx@sentry.io/yyyyy" \
  --tags Key=Project,Value=fluxion-ai
```

### 4️⃣ Deploy Infraestructura (20-30 min)

```bash
cd infrastructure

# Preview de cambios
cdk diff

# Deploy
cdk deploy FluxionStack

# Outputs importantes:
# - FrontendURL: URL de CloudFront
# - BackendURL: URL del Load Balancer
# - BackupBucket: Nombre del bucket de backups
```

### 5️⃣ Configurar VPN en La Granja (30 min)

Después del deploy CDK, configurar el lado de La Granja:

```bash
# 1. Descargar config VPN de AWS
VPN_CONN_ID=$(aws cloudformation describe-stacks \
  --stack-name InfrastructureStack \
  --query 'Stacks[0].Outputs[?OutputKey==`VPNConnectionId`].OutputValue' \
  --output text)

aws ec2 describe-vpn-connections \
  --vpn-connection-ids $VPN_CONN_ID \
  --query 'VpnConnections[0].CustomerGatewayConfiguration' \
  --output text > aws-vpn-config.xml

# 2. Ver instrucciones detalladas
cat SITE_TO_SITE_VPN_SETUP.md
```

**Opciones de configuración**:
- **strongSwan** (Linux) - Recomendado
- **pfSense/OPNsense** - Si tienes router dedicado

### 6️⃣ Deploy Frontend (5 min)

```bash
cd frontend

# Build
npm run build

# Deploy a S3
aws s3 sync dist/ s3://fluxion-frontend-prod/ --delete

# Invalidar cache CloudFront
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='Fluxion Frontend'].Id" \
  --output text)

aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

### 5️⃣ Verificar (5 min)

```bash
# Check backend health
BACKEND_URL=$(aws cloudformation describe-stacks \
  --stack-name FluxionStack \
  --query "Stacks[0].Outputs[?OutputKey=='BackendURL'].OutputValue" \
  --output text)

curl http://$BACKEND_URL/health

# Check frontend
FRONTEND_URL=$(aws cloudformation describe-stacks \
  --stack-name FluxionStack \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendURL'].OutputValue" \
  --output text)

echo "Frontend: https://$FRONTEND_URL"

# Ver logs backend
aws logs tail /ecs/fluxion-backend --follow
```

---

## 🏷️ Tags y Multi-Proyecto

Todos los recursos se crean con estos tags:

```typescript
{
  Project: "fluxion-ai",
  Environment: "production",
  ManagedBy: "cdk",
  CostCenter: "la-granja-mercado"
}
```

**Ver costos por proyecto:**
```bash
aws ce get-cost-and-usage \
  --time-period Start=2025-10-01,End=2025-10-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=TAG,Key=Project
```

---

## 🔄 ETL Jobs

### Configurados automáticamente:

- **ETL Inventario**: Diario a las 2am UTC
- **Backups**: Diario a las 3am UTC

### Ejecutar ETL manualmente:

```bash
# Obtener task definition ARN
TASK_DEF=$(aws ecs list-task-definitions \
  --family-prefix fluxion-etl \
  --query 'taskDefinitionArns[0]' \
  --output text)

# Ejecutar task
aws ecs run-task \
  --cluster fluxion-cluster \
  --task-definition $TASK_DEF \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[subnet-xxx],
    securityGroups=[sg-xxx],
    assignPublicIp=DISABLED
  }"

# Ver logs
aws logs tail /ecs/fluxion-etl --follow
```

### Modificar schedule:

Edita `infrastructure/lib/fluxion-stack.ts`:

```typescript
// Cambiar de diario a cada 6 horas
const etlRule = new events.Rule(this, 'FluxionETLSchedule', {
  schedule: events.Schedule.rate(cdk.Duration.hours(6)),
});
```

Redeploy:
```bash
cdk deploy
```

---

## 🔐 VPN Setup

### Opción A: Client VPN (usuarios individuales)

```bash
# AWS Console > VPC > Client VPN Endpoints
# 1. Create Client VPN Endpoint
# 2. Associate with VPC
# 3. Add authorization rules
# 4. Download client configuration
```

### Opción B: Site-to-Site VPN (red completa)

**Necesitas:**
- IP pública estática de La Granja
- Router compatible con VPN (Customer Gateway)

```bash
# 1. Crear Customer Gateway
aws ec2 create-customer-gateway \
  --type ipsec.1 \
  --public-ip TU_IP_PUBLICA \
  --bgp-asn 65000

# 2. Crear VPN Connection (se hace en CDK stack)
# Ver DEPLOYMENT_CDK.md línea 350

# 3. Descargar configuración para tu router
aws ec2 describe-vpn-connections \
  --vpn-connection-ids vpn-xxx
```

---

## 📊 Monitoring con Sentry

### 1. Setup Sentry.io

```bash
# 1. Crear cuenta: https://sentry.io/signup/
# 2. Crear proyecto "fluxion-ai"
# 3. Copiar DSN

# 4. Agregar a .env
echo "SENTRY_DSN=https://xxx@sentry.io/xxx" >> backend/.env
```

### 2. Ver errores en Sentry

- Dashboard: https://sentry.io/organizations/tu-org/projects/fluxion-ai/
- Issues: Errores en tiempo real
- Performance: Traces de requests
- Releases: Tracking de deploys

### 3. Alertas

**Sentry > Settings > Alerts:**
- Email cuando error rate > 5%
- Slack cuando error nuevo aparece
- PagerDuty para errores críticos

---

## 💰 Costos y Optimización

### Ver costos actuales:

```bash
# Costo del mes actual
aws ce get-cost-and-usage \
  --time-period Start=$(date -u +%Y-%m-01),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter '{"Tags":{"Key":"Project","Values":["fluxion-ai"]}}'
```

### Optimizaciones:

**1. Fargate Spot (50% más barato):**
```typescript
// En infrastructure/lib/fluxion-stack.ts
const backendService = new ecs.FargateService(this, '...', {
  capacityProviderStrategies: [
    {
      capacityProvider: 'FARGATE_SPOT',
      weight: 1,
    },
  ],
});
```

**2. EFS Lifecycle (reducir costos storage):**
```typescript
fileSystem.addLifecyclePolicy(efs.LifecyclePolicy.AFTER_30_DAYS);
```

**3. S3 Intelligent Tiering:**
```typescript
backupBucket.addLifecycleRule({
  transitions: [
    {
      storageClass: s3.StorageClass.INTELLIGENT_TIERING,
      transitionAfter: cdk.Duration.days(0),
    },
  ],
});
```

---

## 🔧 Comandos Útiles

### Infraestructura

```bash
# Ver todos los stacks
cdk list

# Ver cambios sin deployar
cdk diff

# Deploy específico
cdk deploy FluxionStack

# Destroy (CUIDADO - elimina todo)
cdk destroy FluxionStack
```

### Backend

```bash
# Ver logs en tiempo real
aws logs tail /ecs/fluxion-backend --follow

# Ver servicios ECS
aws ecs list-services --cluster fluxion-cluster

# Ver tasks activas
aws ecs list-tasks --cluster fluxion-cluster

# Restart service (forzar redeploy)
aws ecs update-service \
  --cluster fluxion-cluster \
  --service fluxion-backend-service \
  --force-new-deployment
```

### Database

```bash
# Conectar a ECS task para acceder DuckDB
aws ecs execute-command \
  --cluster fluxion-cluster \
  --task TASK_ID \
  --container backend \
  --interactive \
  --command "/bin/bash"

# Una vez dentro:
duckdb /data/fluxion_production.db
```

### Backups

```bash
# Listar backups
aws s3 ls s3://fluxion-backups-prod/db/

# Descargar backup específico
aws s3 cp s3://fluxion-backups-prod/db/fluxion_production_20251005.db.gz .

# Restaurar
gunzip fluxion_production_20251005.db.gz
# Copiar a EFS...
```

---

## 🆘 Troubleshooting

### Backend no responde

```bash
# 1. Ver logs
aws logs tail /ecs/fluxion-backend --follow

# 2. Ver health checks
aws elbv2 describe-target-health \
  --target-group-arn TG_ARN

# 3. Restart service
aws ecs update-service \
  --cluster fluxion-cluster \
  --service fluxion-backend-service \
  --force-new-deployment
```

### ETL falla

```bash
# 1. Ver logs
aws logs tail /ecs/fluxion-etl --since 1h

# 2. Verificar secrets
aws secretsmanager get-secret-value \
  --secret-id fluxion/sql-server

# 3. Verificar VPN
aws ec2 describe-vpn-connections
```

### Frontend no carga

```bash
# 1. Verificar S3
aws s3 ls s3://fluxion-frontend-prod/

# 2. Invalidar CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id DIST_ID \
  --paths "/*"

# 3. Ver errores CloudFront
aws cloudfront get-distribution \
  --id DIST_ID
```

---

## 📚 Documentación Completa

- **CDK Stack completo**: [DEPLOYMENT_CDK.md](DEPLOYMENT_CDK.md)
- **Deployment tradicional**: [DEPLOYMENT_AWS.md](DEPLOYMENT_AWS.md)
- **README principal**: [README.md](README.md)

---

## ✅ Checklist Post-Deployment

- [ ] Backend responde en ALB URL
- [ ] Frontend carga en CloudFront URL
- [ ] ETL job ejecuta correctamente (manual test)
- [ ] Sentry recibe eventos
- [ ] CloudWatch muestra métricas
- [ ] Backups se crean en S3
- [ ] VPN conecta a SQL Server (si aplica)
- [ ] Tags visibles en Cost Explorer

---

**Deployment time total: ~1 hora** ⚡

Para soporte: ver [DEPLOYMENT_CDK.md](DEPLOYMENT_CDK.md) o contactar al equipo.
