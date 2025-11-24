# Pre-Deploy Checklist - Sistema KLK v2.0

**Fecha**: 2025-11-24
**Deploy Target**: AWS ECS Production (FluxionStackV2)
**Critical Changes**: ETL Tracking System + Sentry Integration

---

## 📋 1. Infraestructura AWS - Estado Actual

### ✅ Stack CloudFormation
- **Stack Name**: `FluxionStackV2`
- **Status**: `UPDATE_COMPLETE` (última actualización: 2025-11-11)
- **Region**: `us-east-1`
- **Account ID**: `611395766952`

### ✅ Servicios Activos
- **ECS Cluster**: `fluxion-cluster` - ACTIVE
- **Backend Service**: `FluxionStackV2-FluxionBackendServiceE051E4B7-3D0YfNUbXnmp`
  - Status: ACTIVE
  - Desired Count: 1
  - Running Count: 1
  - Task Definition: v23
  - Rollout State: COMPLETED

### ✅ Repositorios ECR
- `fluxion-backend`: 611395766952.dkr.ecr.us-east-1.amazonaws.com/fluxion-backend
  - Última imagen: 2025-11-18 10:08:30 (tag: latest)
- `fluxion-etl`: 611395766952.dkr.ecr.us-east-1.amazonaws.com/fluxion-etl

### ✅ URLs de Producción
- **Frontend**: https://d20a0g9yxinot2.cloudfront.net
- **Backend (HTTPS)**: https://d1tgnaj74tv17v.cloudfront.net
- **Backend (HTTP)**: http://fluxion-alb-433331665.us-east-1.elb.amazonaws.com
- **CloudFront ID (Frontend)**: E4DJERG2Y5AX8
- **CloudFront ID (Backend)**: E1HBMY1Q13OWU0

### ✅ Recursos Críticos
- **VPC**: vpc-0612cd85dfc5a044f
- **WireGuard VPN**: i-07cc62e4314a4a67a (10.0.2.90)
- **Frontend S3**: fluxion-frontend-v4-611395766952
- **Backup S3**: fluxion-backups-v4-611395766952
- **ETL Log Group**: /aws/ecs/fluxion-etl

---

## 📦 2. Cambios en el Código

### Archivos Nuevos (Untracked)
```
✅ backend/routers/etl_tracking_router.py          # NEW: API endpoints para tracking
✅ database/schema_etl_tracking.sql                # NEW: Schema ETL tracking
✅ etl/core/etl_tracker.py                         # NEW: Tracking framework
✅ etl/core/etl_ventas_klk.py                      # NEW: ETL ventas KLK
✅ etl/core/extractor_ventas_klk.py                # NEW: Extractor ventas
✅ etl/core/transformer_ventas_klk.py              # NEW: Transformer ventas
✅ etl/cron_klk_realtime.sh                        # NEW: Cron script
✅ frontend/src/services/etlTrackingService.ts     # NEW: Frontend service
✅ frontend/src/components/settings/KLKRealTimeExecutions.tsx    # NEW: UI tracking
✅ frontend/src/components/settings/KLKGapRecoveryPanel.tsx      # NEW: UI gaps
✅ docs/SENTRY_KLK_INTEGRATION.md                  # NEW: Sentry docs
✅ docs/ESTADO_SISTEMA_V2.md                       # NEW: System state
```

### Archivos Modificados
```
✅ backend/main.py                                 # MOD: +etl_tracking_router, +Sentry
✅ backend/routers/nivel_objetivo_router.py        # MOD: +ventas por tienda
✅ etl/core/etl_inventario_klk.py                  # MOD: +tracking, +Sentry
✅ etl/core/extractor_inventario_klk.py            # MOD: +conjuntos sustituibles
✅ etl/core/loader.py                              # MOD: +columnas opcionales
✅ frontend/src/components/dashboard/InventorySummary.tsx         # MOD: +KLK
✅ frontend/src/components/settings/InventarioETLPanel.tsx        # MOD: +tracking
✅ frontend/src/components/settings/VentasETLPanel.tsx            # MOD: +tracking
```

### Archivos Eliminados
```
⚠️  14 reportes temporales en archive/temp-reports-2025-10/
⚠️  backend/backend/* (duplicados)
⚠️  etl/_backup_cleanup/* (obsoletos de testing)
```

### Git Status
- **Branch**: main
- **Estado**: up to date with origin/main
- **Commits pendientes**: 0
- **Archivos staged**: 0
- **Cambios sin commitear**: 58 archivos (+1,377, -4,380 líneas)

---

## 🔐 3. Variables de Entorno - Requeridas

### Backend (.env)
```bash
# Base
ENVIRONMENT=production
DATABASE_PATH=/mnt/efs/data/fluxion_production.db

# Sentry (CRÍTICO - NUEVO)
SENTRY_DSN=https://YOUR_DSN@sentry.io/YOUR_PROJECT_ID
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# Seguridad
JWT_SECRET_KEY=[VALIDAR EN SECRETS MANAGER]
```

### ETL (.env)
```bash
# Sentry (CRÍTICO - NUEVO)
SENTRY_DSN=https://YOUR_DSN@sentry.io/YOUR_PROJECT_ID
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# Database
DUCKDB_PATH=/mnt/efs/data/fluxion_production.db

# ETL Version
VERSION_ETL=2.0
```

### Frontend (Build-time)
```bash
VITE_API_URL=https://d1tgnaj74tv17v.cloudfront.net
VITE_SENTRY_DSN=https://YOUR_DSN@sentry.io/YOUR_PROJECT_ID
```

---

## ⚠️ 4. Pre-Deploy Validations

### Base de Datos
- [ ] Verificar que tabla `etl_ejecuciones` existe en producción
- [ ] Verificar que secuencia `etl_ejecuciones_id_seq` existe
- [ ] Verificar que vista `v_gaps_por_recuperar` existe
- [ ] Verificar que vista `v_metricas_confiabilidad` existe
- [ ] Backup manual de DB antes del deploy

### Código
- [ ] Todos los tests del backend pasan
- [ ] Frontend build sin errores (npm run build)
- [ ] ESLint sin errores críticos (<50 warnings)
- [ ] Type-check sin errores (npm run type-check)

### Sentry
- [ ] DSN configurado en GitHub Secrets
- [ ] Proyecto Sentry creado y activo
- [ ] Release tracking configurado (opcional)
- [ ] Alertas configuradas (opcional - post-deploy)

### Docker
- [ ] Dockerfile backend actualizado con nuevas dependencias
- [ ] Dockerfile ETL actualizado
- [ ] requirements.txt incluye `sentry-sdk[fastapi]>=2.0.0`

---

## 🚀 5. Estrategia de Deploy

### Orden de Ejecución
1. **Commit & Push código**
   ```bash
   git add .
   git commit -m "feat: sistema tracking ETL KLK v2.0 con Sentry"
   git push origin main
   ```

2. **GitHub Actions Auto-Deploy** (workflow: `.github/workflows/deploy.yml`)
   - Job 1: Backend Build & Test
   - Job 2: Frontend Build & Test
   - Job 3: Build & Push Docker Images (Backend + ETL)
   - Job 4: Deploy Infrastructure (CDK)
   - Job 5: Deploy Frontend (S3 + CloudFront)
   - Job 6: Health Check

3. **Monitoreo Post-Deploy**
   - Backend health check: `curl https://d1tgnaj74tv17v.cloudfront.net`
   - Frontend disponible: https://d20a0g9yxinot2.cloudfront.net
   - Logs ECS: `aws logs tail /ecs/fluxion-backend --follow`
   - Sentry dashboard: verificar eventos llegando

---

## 🔙 6. Estrategia de Rollback

### Rollback Rápido (< 5 minutos)
Si el deploy falla durante la ejecución:

```bash
# 1. Rollback del servicio ECS a task definition anterior (v23)
aws ecs update-service \
  --cluster fluxion-cluster \
  --service FluxionStackV2-FluxionBackendServiceE051E4B7-3D0YfNUbXnmp \
  --task-definition FluxionStackV2FluxionBackendTask94E5B2B4:23 \
  --force-new-deployment

# 2. Esperar estabilización
aws ecs wait services-stable \
  --cluster fluxion-cluster \
  --services FluxionStackV2-FluxionBackendServiceE051E4B7-3D0YfNUbXnmp

# 3. Invalidar CloudFront (si frontend falló)
aws cloudfront create-invalidation \
  --distribution-id E4DJERG2Y5AX8 \
  --paths "/*"
```

### Rollback de Base de Datos
Si las tablas nuevas causan problemas:

```sql
-- NO eliminar tablas, solo deshabilitar endpoints
-- Backend antiguo NO usa etl_ejecuciones, así que es seguro
-- El rollback del servicio ECS restaurará código antiguo
```

### Rollback de Frontend
```bash
# Revertir S3 a versión anterior
aws s3 sync s3://fluxion-frontend-v4-611395766952-backup/ \
  s3://fluxion-frontend-v4-611395766952/ --delete

# Invalidar CloudFront
aws cloudfront create-invalidation \
  --distribution-id E4DJERG2Y5AX8 \
  --paths "/*"
```

---

## 📊 7. Métricas de Éxito

### Backend
- [ ] Health check responde 200 OK
- [ ] Endpoint `/api/etl/tracking/ejecuciones` responde sin errores
- [ ] Logs no muestran errores críticos (primeros 10 minutos)
- [ ] Sentry recibe eventos del backend

### Frontend
- [ ] Página carga sin errores 404/500
- [ ] Panel de Tracking KLK muestra datos
- [ ] No hay errores en consola del navegador
- [ ] CloudFront caché invalidado correctamente

### ETL
- [ ] Cron ejecuta cada 30 minutos sin errores
- [ ] Datos se guardan en `etl_ejecuciones`
- [ ] Sentry recibe métricas de ETL (registros, duración, etc.)

### Performance
- [ ] Tiempo de respuesta API < 500ms (p95)
- [ ] Tiempo de carga frontend < 3s
- [ ] ETL completo < 2 minutos

---

## 🛑 8. Criterios de Abort

Detener deploy y hacer rollback si:

1. **Backend health check falla** después de 5 reintentos
2. **Logs muestran errores SQL** relacionados con nuevas tablas
3. **Sentry no recibe eventos** después de 10 minutos
4. **Frontend no carga** después de invalidación CloudFront
5. **ETL falla** en primera ejecución post-deploy

---

## 📞 9. Contactos y Referencias

### AWS Resources
- **Console**: https://console.aws.amazon.com/
- **Stack**: FluxionStackV2 (us-east-1)
- **Logs**: CloudWatch `/ecs/fluxion-backend`

### Sentry
- **Dashboard**: https://sentry.io/organizations/YOUR_ORG/projects/fluxion/
- **Docs**: [SENTRY_KLK_INTEGRATION.md](./SENTRY_KLK_INTEGRATION.md)

### GitHub
- **Repo**: https://github.com/josefe-ing/fluxion-workspace
- **Actions**: https://github.com/josefe-ing/fluxion-workspace/actions
- **Workflow**: `.github/workflows/deploy.yml`

---

## ✅ 10. Sign-Off

- [ ] Código revisado y testeado localmente
- [ ] Base de datos respaldada
- [ ] Variables de entorno validadas
- [ ] Plan de rollback entendido
- [ ] Monitoreo listo (Sentry configurado)
- [ ] Equipo notificado del deploy

**Aprobado por**: _________________
**Fecha**: _________________
**Hora estimada de deploy**: _________________

---

**IMPORTANTE**: Este es un deploy de features críticas. El sistema KLK tracking es nuevo pero NO ROMPE funcionalidad existente. El backend antiguo seguirá funcionando si algo falla.
