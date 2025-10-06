# Configurar GitHub Secrets - Paso a Paso

Ya tienes el usuario IAM `github-actions-fluxion` creado en AWS. Ahora sigue estos pasos:

## Paso 1: Crear Access Keys en AWS

### Opción A: Via AWS Console (lo que estás viendo ahora)

1. Estás en la página correcta del usuario `github-actions-fluxion`
2. Click en la pestaña **"Security credentials"** (arriba, junto a Permissions)
3. Scroll down hasta la sección **"Access keys"**
4. Click **"Create access key"**
5. Selecciona **"Application running outside AWS"** como use case
6. Click **Next** → Agregar descripción: "GitHub Actions CI/CD" → **Create access key**
7. **¡IMPORTANTE!** Copia y guarda inmediatamente:
   - **Access key ID** (ejemplo: `AKIAY4WQHBKUHGDRKPI7`)
   - **Secret access key** (solo se muestra una vez, algo como: `abc123...xyz`)

### Opción B: Via Terminal (más rápido)

```bash
# Crear access key
aws iam create-access-key --user-name github-actions-fluxion

# Esto te dará output JSON con AccessKeyId y SecretAccessKey
# COPIA AMBOS VALORES INMEDIATAMENTE
```

## Paso 2: Configurar Secrets en GitHub

### Opción A: Via GitHub Web UI

1. Ve a tu repositorio: https://github.com/josefe-ing/fluxion-workspace
2. Click **Settings** (pestaña superior derecha)
3. En el menú izquierdo: **Secrets and variables** → **Actions**
4. Click **"New repository secret"** (botón verde)
5. Agrega los siguientes 3 secrets (uno por uno):

**Secret 1:**
```
Name: AWS_ACCESS_KEY_ID
Value: [Pega el Access Key ID que copiaste]
```

**Secret 2:**
```
Name: AWS_SECRET_ACCESS_KEY
Value: [Pega el Secret Access Key que copiaste]
```

**Secret 3:**
```
Name: AWS_ACCOUNT_ID
Value: 611395766952
```

### Opción B: Via GitHub CLI (más rápido)

```bash
# Primero, guarda tus credenciales en variables (reemplaza con tus valores reales)
export AWS_KEY_ID="AKIAY4WQ..."
export AWS_SECRET="abc123xyz..."

# Configura los secrets
gh secret set AWS_ACCESS_KEY_ID --body "$AWS_KEY_ID"
gh secret set AWS_SECRET_ACCESS_KEY --body "$AWS_SECRET"
gh secret set AWS_ACCOUNT_ID --body "611395766952"

# Verificar que se crearon
gh secret list
```

## Paso 3: Verificar Configuración

### Verificar secrets en GitHub:

```bash
gh secret list
```

Deberías ver:
```
AWS_ACCESS_KEY_ID       Updated 2025-10-05
AWS_ACCOUNT_ID          Updated 2025-10-05
AWS_SECRET_ACCESS_KEY   Updated 2025-10-05
```

## Paso 4: Re-ejecutar el Pipeline

Una vez configurados los secrets, puedes re-ejecutar el pipeline fallido:

### Opción A: Desde GitHub Web
1. Ve a: https://github.com/josefe-ing/fluxion-workspace/actions
2. Click en el workflow fallido: "fix: configure ESLint and update CI/CD workflow"
3. Click **"Re-run all jobs"** (botón arriba a la derecha)

### Opción B: Desde Terminal
```bash
# Ver último run
gh run list --limit 1

# Re-ejecutar el último run fallido
gh run rerun $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')

# O hacer un nuevo push (trigger automático)
git commit --allow-empty -m "chore: test CI/CD with configured secrets"
git push origin main
```

### Opción C: Push vacío para nuevo deploy
```bash
git commit --allow-empty -m "chore: trigger CI/CD with configured secrets"
git push origin main
```

## Paso 5: Monitorear el Deploy

```bash
# Ver en tiempo real
gh run watch

# O abrir en browser
gh run view --web
```

El pipeline debería tomar ~10-15 minutos y pasar por:
1. ✅ Backend Build & Test (~2 min)
2. ✅ Frontend Build & Test (~3 min)
3. ✅ Deploy Infrastructure & Backend (~8 min) ← Esto fallaba antes
4. ✅ Deploy Frontend (~2 min)
5. ✅ Health Check (~15 sec)

## Troubleshooting

### Si sigue fallando con error de credenciales:

```bash
# Verificar que el usuario tiene las políticas correctas
aws iam list-attached-user-policies --user-name github-actions-fluxion

# Deberías ver AdministratorAccess
```

### Si los secrets no aparecen:

```bash
# Re-configurar secrets
gh secret set AWS_ACCESS_KEY_ID --body "TU_ACCESS_KEY_AQUI"
gh secret set AWS_SECRET_ACCESS_KEY --body "TU_SECRET_KEY_AQUI"
gh secret set AWS_ACCOUNT_ID --body "611395766952"
```

### Verificar que las keys funcionan:

```bash
# Probar credenciales manualmente
export AWS_ACCESS_KEY_ID="AKIAY4WQ..."
export AWS_SECRET_ACCESS_KEY="abc123..."

aws sts get-caller-identity
# Debería mostrar el ARN del usuario github-actions-fluxion
```

## Resumen de lo que Necesitas

| Secret | Valor | Dónde obtenerlo |
|--------|-------|-----------------|
| `AWS_ACCESS_KEY_ID` | `AKIAY4WQ...` | AWS Console → IAM → github-actions-fluxion → Security credentials → Create access key |
| `AWS_SECRET_ACCESS_KEY` | `abc123xyz...` | Mismo lugar (solo se muestra una vez al crear) |
| `AWS_ACCOUNT_ID` | `611395766952` | Ya lo tienes (es tu account ID) |

## Next Steps Después de Configurar Secrets

1. ✅ Crear access keys en AWS
2. ✅ Configurar los 3 secrets en GitHub
3. ✅ Re-ejecutar el pipeline
4. ✅ Esperar ~10-15 min
5. 🎉 Ver tu aplicación desplegada automáticamente!

Después de esto, **cada push a main desplegará automáticamente** sin intervención manual.
