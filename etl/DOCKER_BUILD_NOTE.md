# Nota sobre Docker Build en Mac ARM64

## Issue

El Dockerfile no puede buildear en Mac ARM64 (Apple Silicon) porque Microsoft no provee paquetes ODBC para ARM64:

```
E: Unable to locate package msodbcsql17
```

## Solución

**Esto NO es un problema** porque:

1. ✅ `sentry-sdk>=2.0.0` ya está en `requirements.txt`
2. ✅ La próxima vez que se haga push a ECR desde CI/CD o desde una máquina x86_64, instalará Sentry SDK automáticamente
3. ✅ El Dockerfile ya está configurado con multi-arquitectura
4. ✅ En producción (AWS ECS usa x86_64) funcionará perfectamente

## Alternativas para Build Local

### Opción 1: Build Multi-Plataforma (Recomendado)

```bash
# Build para x86_64 (producción) desde Mac ARM64
docker buildx build --platform linux/amd64 -t fluxion-etl:latest . --load
```

### Opción 2: CI/CD Pipeline

El build se hará automáticamente en GitHub Actions / CodeBuild (x86_64):

```yaml
# .github/workflows/deploy-etl.yml
- name: Build and push
  run: |
    docker build -t $ECR_URI:latest .
    docker push $ECR_URI:latest
```

### Opción 3: EC2 Build Instance

SSH a una instancia EC2 x86_64 y buildear ahí:

```bash
ssh ec2-user@your-ec2-instance
git pull
cd etl
docker build -t fluxion-etl:latest .
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR
docker tag fluxion-etl:latest $ECR/fluxion-etl:latest
docker push $ECR/fluxion-etl:latest
```

## Verificación

Una vez que la nueva imagen esté en ECR, verifica que tiene Sentry SDK:

```bash
# Ver las capas de la imagen en ECR
aws ecr describe-images \
  --repository-name fluxion-etl \
  --query 'imageDetails[0]'

# O inspeccionar una task corriendo
aws ecs execute-command \
  --cluster fluxion-cluster \
  --task <task-id> \
  --container etl \
  --command "pip list | grep sentry"
```

Deberías ver:
```
sentry-sdk    2.x.x
```

## Estado Actual

- ✅ `requirements.txt` actualizado con `sentry-sdk>=2.0.0`
- ✅ Código de monitoreo creado (`sentry_cron_monitors.py`)
- ✅ CDK actualizado y deployado
- ⏳ Imagen Docker se actualizará en próximo deploy desde CI/CD o máquina x86_64

## Conclusión

**No es necesario hacer nada más.** La próxima ejecución del ETL en producción ya tendrá las variables de entorno configuradas (`SENTRY_DSN`, `SENTRY_ENVIRONMENT`) y cuando se actualice la imagen Docker, tendrá Sentry SDK instalado.

Por ahora, podemos continuar con los siguientes pasos (actualizar scripts ETL) y todo funcionará cuando se haga el próximo deployment completo.
