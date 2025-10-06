# CI/CD Setup Guide - Fluxion AI

## Overview

Configuración de CI/CD con GitHub Actions para deploys automáticos a AWS en cada push a `main`.

## Pipeline Flow

```
Push to main → Build & Test → Deploy Infrastructure → Deploy Frontend → Health Check
```

### Jobs:

1. **backend-build**: Valida y testea el backend Python
2. **frontend-build**: Lint, type-check y build del frontend React
3. **deploy-infrastructure**: Deploya stack de CDK (VPC, ECS, ALB, EFS, etc.)
4. **deploy-frontend**: Sube build a S3 e invalida CloudFront
5. **health-check**: Verifica que los servicios estén corriendo

## Configuración Requerida

### 1. GitHub Secrets

Debes configurar estos secrets en tu repositorio de GitHub:

**Settings → Secrets and variables → Actions → New repository secret**

Agrega los siguientes secrets:

| Secret Name | Value | Descripción |
|-------------|-------|-------------|
| `AWS_ACCESS_KEY_ID` | `AKIA...` | AWS Access Key ID |
| `AWS_SECRET_ACCESS_KEY` | `...` | AWS Secret Access Key |
| `AWS_ACCOUNT_ID` | `611395766952` | Tu AWS Account ID |

### 2. Crear AWS IAM User para CI/CD

```bash
# Opción A: Usar credenciales existentes (rápido)
aws iam create-access-key --user-name tu-usuario-actual

# Opción B: Crear usuario dedicado para CI/CD (recomendado)
aws iam create-user --user-name github-actions-fluxion

# Adjuntar política con permisos necesarios
aws iam attach-user-policy \
  --user-name github-actions-fluxion \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# Crear access keys
aws iam create-access-key --user-name github-actions-fluxion
```

**IMPORTANTE**: Guarda el `AccessKeyId` y `SecretAccessKey` que se muestran - solo se muestran una vez.

### 3. Configurar Secrets en GitHub

#### Vía Web UI:
1. Ve a tu repositorio en GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Agrega cada uno de los secrets:

```
Name: AWS_ACCESS_KEY_ID
Value: AKIA... (el AccessKeyId del paso anterior)
```

```
Name: AWS_SECRET_ACCESS_KEY
Value: ... (el SecretAccessKey del paso anterior)
```

```
Name: AWS_ACCOUNT_ID
Value: 611395766952
```

#### Vía GitHub CLI (gh):
```bash
# Instalar gh si no lo tienes
brew install gh

# Autenticar
gh auth login

# Configurar secrets
gh secret set AWS_ACCESS_KEY_ID --body "AKIA..."
gh secret set AWS_SECRET_ACCESS_KEY --body "..."
gh secret set AWS_ACCOUNT_ID --body "611395766952"
```

## Archivos del Pipeline

### 1. `.github/workflows/deploy.yml`

Workflow principal que ejecuta todos los jobs en secuencia.

**Triggers:**
- Push a branch `main`
- Ejecución manual desde GitHub UI (workflow_dispatch)

**Environment variables:**
- `AWS_REGION`: us-east-1
- `NODE_VERSION`: 20
- `PYTHON_VERSION`: 3.11

### 2. Stack Outputs Necesarios

El workflow espera estos outputs del stack de CDK:

- `BackendURL`: URL del ALB (backend API)
- `FrontendBucketName`: Nombre del bucket S3 del frontend
- `CloudFrontDistributionId`: ID de CloudFront para invalidación

✅ Ya configurados en `infrastructure/lib/infrastructure-stack.ts`

## Cómo Usar

### Deploy Automático

Simplemente haz push a `main`:

```bash
git add .
git commit -m "feat: new feature"
git push origin main
```

GitHub Actions detectará el push y ejecutará el pipeline automáticamente.

### Deploy Manual

1. Ve a GitHub → **Actions** tab
2. Selecciona **Deploy to AWS** workflow
3. Click **Run workflow** → **Run workflow**

### Monitorear Deploy

1. Ve a **Actions** tab en GitHub
2. Click en el workflow en ejecución
3. Verás el progreso de cada job en tiempo real
4. Los logs están disponibles para debugging

## Flujo Detallado

### 1. Backend Build (1-2 min)
- Checkout código
- Setup Python 3.11
- Install dependencies (cached)
- Lint con flake8
- Run tests (si existen)

### 2. Frontend Build (2-3 min)
- Checkout código
- Setup Node.js 20
- Install dependencies (cached)
- ESLint check
- TypeScript type-check
- Vite build
- Upload build artifacts

### 3. Deploy Infrastructure (5-10 min)
- Checkout código
- Setup Node.js
- Configure AWS credentials
- CDK bootstrap (si es necesario)
- CDK synth
- CDK deploy (actualiza ECS, ALB, etc.)
- Extrae stack outputs

### 4. Deploy Frontend (1-2 min)
- Download build artifacts
- Configure AWS credentials
- Sync a S3 bucket
- Invalidate CloudFront cache

### 5. Health Check (15 sec)
- Wait 10 seconds
- Test backend health endpoint
- Notify success/failure

**Tiempo total estimado: ~10-15 minutos**

## Optimizaciones Incluidas

✅ **Caching de dependencias**: npm y pip usan cache para builds más rápidos
✅ **Jobs paralelos**: Backend y frontend se buildean en paralelo
✅ **Artifacts**: Frontend build se comparte entre jobs
✅ **Fail fast**: Si build falla, no se despliega nada
✅ **Health checks**: Verifica que el deploy fue exitoso

## Troubleshooting

### Error: "Resource handler returned message: Invalid request"

**Causa**: CDK intentando actualizar un stack que está en uso.

**Solución**:
```bash
# Eliminar stacks en mal estado
aws cloudformation delete-stack --stack-name FluxionStack

# Esperar que termine
aws cloudformation wait stack-delete-complete --stack-name FluxionStack
```

### Error: "No such distribution: d21ssh2ccl7jy6"

**Causa**: CloudFront distribution ID incorrecto.

**Solución**: El workflow obtiene el ID automáticamente del stack output.

### Error: "The security token included in the request is invalid"

**Causa**: Credenciales AWS incorrectas en GitHub Secrets.

**Solución**:
```bash
# Generar nuevas credenciales
aws iam create-access-key --user-name github-actions-fluxion

# Actualizar secrets en GitHub
gh secret set AWS_ACCESS_KEY_ID --body "NUEVA_KEY"
gh secret set AWS_SECRET_ACCESS_KEY --body "NUEVO_SECRET"
```

### Frontend no se actualiza después de deploy

**Causa**: CloudFront cache no invalidado.

**Solución**: El workflow invalida automáticamente con `--paths "/*"`

Si persiste:
```bash
# Invalidar manualmente
aws cloudfront create-invalidation \
  --distribution-id E30PQWSJLQFATZ \
  --paths "/*"
```

### Build tarda mucho

**Optimizaciones**:
1. Verificar que cache esté funcionando (revisa logs de Actions)
2. Considerar usar self-hosted runners si builds son muy frecuentes
3. Reducir dependencias innecesarias

## Mejoras Futuras

### 1. Deploy Staging + Production

```yaml
on:
  push:
    branches:
      - main         # Production
      - develop      # Staging
```

### 2. Rollback Automático

Agregar job que revierte si health check falla:

```yaml
- name: Rollback on failure
  if: failure()
  run: |
    aws ecs update-service \
      --cluster fluxion-cluster \
      --service fluxion-backend \
      --force-new-deployment
```

### 3. Notificaciones Slack/Discord

```yaml
- name: Notify Slack
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "✅ Fluxion deployed to production!"
      }
```

### 4. Database Migrations

Agregar step para ejecutar migraciones antes del deploy:

```yaml
- name: Run migrations
  run: |
    # Ejecutar migration script vía ECS Exec
    aws ecs execute-command ...
```

## Security Best Practices

✅ **IAM User dedicado**: Usuario específico para GitHub Actions
✅ **Least Privilege**: Solo permisos necesarios (ajustar cuando sea posible)
✅ **Secrets**: Credenciales nunca en código, solo en GitHub Secrets
✅ **Environment Protection**: Usar GitHub Environments para aprovals manuales
⚠️ **TODO**: Reducir permisos de AdministratorAccess a políticas específicas

## Comandos Útiles

```bash
# Ver último deploy
gh run list --workflow=deploy.yml --limit 1

# Ver logs del último deploy
gh run view --log

# Ver todos los secrets configurados
gh secret list

# Cancelar workflow en ejecución
gh run cancel <RUN_ID>

# Re-ejecutar workflow fallido
gh run rerun <RUN_ID>
```

## Next Steps

1. ✅ Crear workflow file (`.github/workflows/deploy.yml`)
2. ⏳ Configurar GitHub Secrets
3. ⏳ Hacer primer push a `main` para probar pipeline
4. ⏳ Verificar que deploy automático funciona
5. 🔮 Configurar notificaciones (opcional)
6. 🔮 Agregar staging environment (opcional)

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [AWS CDK GitHub Actions](https://github.com/aws-actions/configure-aws-credentials)
- [AWS CloudFormation Stack Outputs](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html)
