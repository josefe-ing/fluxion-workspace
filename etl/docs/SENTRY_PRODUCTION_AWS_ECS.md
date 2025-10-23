# Sentry Cron Monitors - Configuración Producción AWS ECS

## Tu Arquitectura Actual

```
EventBridge (Cron) → ECS Fargate Task → ETL Container → SQL Server (VPN)
```

**Schedule actual:**
- Morning: 3:00 AM Venezuela (7:00 AM UTC)
- Afternoon: 2:00 PM Venezuela (6:00 PM UTC)

**Importante:** Cada ejecución del ETL es una **task nueva**, no un proceso persistente.

## Cambios Necesarios para Producción

### 1. Agregar Variables de Entorno a Task Definition

El DSN de Sentry debe estar en las variables de entorno de la ECS Task.

#### Opción A: AWS Systems Manager Parameter Store (Recomendado) ⭐

**Crear el parámetro:**

```bash
aws ssm put-parameter \
  --name "/fluxion/etl/sentry-dsn" \
  --type "SecureString" \
  --value "https://c7a7c4d06c7d58ec02f551034e35eb1d@o4510234583760896.ingest.us.sentry.io/4510239662276608" \
  --region us-east-1
```

**Actualizar CDK** ([infrastructure/lib/infrastructure-stack.ts](../../infrastructure/lib/infrastructure-stack.ts)):

```typescript
// Después de la línea ~567 donde defines etlTask

// Import del secret de Sentry
const sentryDsn = ecs.Secret.fromSsmParameter(
  ssm.StringParameter.fromSecureStringParameterAttributes(
    this,
    'SentryDsnParameter',
    {
      parameterName: '/fluxion/etl/sentry-dsn',
    }
  )
);

// Agregar a las secrets del container (línea ~594)
const etlContainer = etlTask.addContainer('etl', {
  image: ecs.ContainerImage.fromEcrRepository(etlRepo, 'latest'),
  logging: ecs.LogDriver.awsLogs({
    streamPrefix: 'fluxion-etl',
  }),
  memoryLimitMiB: 2048,
  cpu: 1024,

  // Variables de entorno existentes
  environment: {
    ETL_MODE: 'etl_inventario.py',
    ETL_ARGS: '--todas',
    ETL_ENVIRONMENT: 'production',

    // ✅ NUEVO: Sentry config
    SENTRY_ENVIRONMENT: 'production',
    SENTRY_TRACES_SAMPLE_RATE: '0.1',
  },

  // Secrets existentes
  secrets: {
    SQL_USER: ecs.Secret.fromSecretsManager(sqlCredentials, 'username'),
    SQL_PASS: ecs.Secret.fromSecretsManager(sqlCredentials, 'password'),

    // ✅ NUEVO: Sentry DSN
    SENTRY_DSN: sentryDsn,
  },
});
```

**Dar permisos al Task Role:**

```typescript
// Después de línea ~585 donde haces los grants

// ✅ NUEVO: Grant permission to read Sentry DSN from SSM
etlTask.taskRole.addToPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['ssm:GetParameter'],
    resources: [
      `arn:aws:ssm:${this.region}:${this.account}:parameter/fluxion/etl/sentry-dsn`,
    ],
  })
);
```

#### Opción B: Hardcoded en CDK (Menos seguro, más rápido)

```typescript
// En environment del container
environment: {
  ETL_MODE: 'etl_inventario.py',
  ETL_ARGS: '--todas',
  ETL_ENVIRONMENT: 'production',

  // Sentry config
  SENTRY_DSN: 'https://c7a7c4d06c7d58ec02f551034e35eb1d@o4510234583760896.ingest.us.sentry.io/4510239662276608',
  SENTRY_ENVIRONMENT: 'production',
  SENTRY_TRACES_SAMPLE_RATE: '0.1',
},
```

**⚠️ Menos seguro:** El DSN queda en plaintext en la Task Definition.

### 2. Actualizar Dockerfile para instalar Sentry SDK

Verifica que `etl/requirements.txt` incluya `sentry-sdk`:

```bash
# Verificar
grep sentry-sdk etl/requirements.txt

# Si no está, agregarlo
echo "sentry-sdk>=2.0.0" >> etl/requirements.txt
```

El Dockerfile ya debería instalar esto automáticamente:

```dockerfile
# En etl/Dockerfile (verificar que esto exista)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
```

### 3. Actualizar tu Script ETL Principal

Tu script principal probablemente es `etl_inventario.py` o similar. Agrégale el monitoreo:

```python
#!/usr/bin/env python3
"""
etl_inventario.py - ETL de inventario multi-tienda
Versión con Sentry Cron Monitors
"""

import sys
import os
from pathlib import Path

# Agregar core al path
sys.path.append(str(Path(__file__).parent / 'core'))

# ✅ NUEVO: Imports de Sentry
from sentry_etl import init_sentry_for_etl
from sentry_cron_monitors import cron_monitor

# Tus imports existentes
from tiendas_config import get_tiendas_activas
# ... otros imports


def main():
    """
    Entry point del ETL
    """
    # ✅ NUEVO: Inicializar Sentry
    # Esto lee SENTRY_DSN del environment automáticamente
    init_sentry_for_etl()

    # ✅ NUEVO: Wrapper con cron monitor
    # Detecta automáticamente morning vs afternoon por hora
    hora_actual = datetime.now().hour
    monitor_name = "etl_inventario_morning" if hora_actual < 12 else "etl_inventario_afternoon"

    with cron_monitor(monitor_name):
        # Tu código ETL existente SIN CAMBIOS
        ejecutar_etl_completo()


def ejecutar_etl_completo():
    """
    Tu lógica ETL existente (sin modificar)
    """
    tiendas = get_tiendas_activas()

    for tienda_id, config in tiendas.items():
        procesar_tienda(tienda_id, config)


if __name__ == "__main__":
    main()
```

### 4. Configurar Schedules en sentry_cron_monitors.py

Actualiza `etl/core/sentry_cron_monitors.py` para que coincidan con tu EventBridge:

```python
CRON_MONITORS_CONFIG = {
    # Morning ETL - 3:00 AM Venezuela (7:00 AM UTC)
    "etl_inventario_morning": {
        "schedule": {
            "type": "crontab",
            "value": "0 7 * * *"  # 7:00 AM UTC = 3:00 AM Venezuela
        },
        "checkin_margin": 30,  # 30 min de margen
        "max_runtime": 180,    # 3 horas max
        "timezone": "UTC"  # EventBridge usa UTC
    },

    # Afternoon ETL - 2:00 PM Venezuela (6:00 PM UTC)
    "etl_inventario_afternoon": {
        "schedule": {
            "type": "crontab",
            "value": "0 18 * * *"  # 6:00 PM UTC = 2:00 PM Venezuela
        },
        "checkin_margin": 30,
        "max_runtime": 180,
        "timezone": "UTC"
    },
}
```

**Importante:**
- EventBridge usa **UTC**
- Sentry debe usar el **mismo timezone**
- Venezuela es UTC-4

### 5. Deploy del Stack Actualizado

```bash
cd infrastructure

# Instalar dependencias si aún no
npm install

# Verificar cambios
npx cdk diff

# Deploy
npx cdk deploy
```

### 6. Rebuild y Push de la Imagen Docker

```bash
cd etl

# Build de la imagen
docker build -t fluxion-etl:latest .

# Tag para ECR
docker tag fluxion-etl:latest \
  <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/fluxion-etl:latest

# Login a ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Push
docker push <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/fluxion-etl:latest
```

### 7. Verificar en Sentry

Después del próximo run (3:00 AM o 2:00 PM), verifica:

1. Ve a https://sentry.io/crons/
2. Selecciona proyecto `etl-process`
3. Deberías ver:
   - `etl-inventario-morning`
   - `etl-inventario-afternoon`
4. Con check-ins OK ✅

### 8. Troubleshooting en Producción

#### Ver logs de la task:

```bash
# Listar ejecuciones recientes
aws ecs list-tasks \
  --cluster fluxion-cluster \
  --family FluxionETLTask \
  --desired-status STOPPED \
  --max-results 5

# Ver logs de una task específica
aws logs tail /aws/ecs/fluxion-etl \
  --follow \
  --since 10m
```

#### Buscar mensajes de Sentry en logs:

```bash
aws logs filter-log-events \
  --log-group-name /aws/ecs/fluxion-etl \
  --filter-pattern "Sentry" \
  --start-time $(date -u -d '1 hour ago' +%s)000
```

Deberías ver:
```
✅ Sentry inicializado para ETL
📊 Iniciando cron monitor: etl-inventario-morning
✅ Cron monitor completado: etl-inventario-morning (2345.6s)
```

#### Si no ves check-ins en Sentry:

1. **Verificar que SENTRY_DSN esté configurado:**
   ```bash
   # Describe la task definition
   aws ecs describe-task-definition \
     --task-definition FluxionETLTask \
     --query 'taskDefinition.containerDefinitions[0].environment'
   ```

2. **Verificar logs:**
   ```bash
   aws logs tail /aws/ecs/fluxion-etl --since 1h | grep -i sentry
   ```

3. **Test manual:**
   ```bash
   # Lanzar task manualmente
   aws ecs run-task \
     --cluster fluxion-cluster \
     --task-definition FluxionETLTask \
     --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx]}"
   ```

## Diferencias Local vs Producción

| Aspecto | Local | Producción |
|---------|-------|------------|
| **Environment** | `.env` file | ECS Task Definition |
| **DSN Source** | etl/.env | AWS SSM / Task env vars |
| **SENTRY_ENVIRONMENT** | `development` | `production` |
| **Schedule** | Manual | EventBridge (2x/día) |
| **Logs** | Terminal | CloudWatch Logs |
| **Check-ins** | Cada test run | Solo 2x/día |

## Monitores Multi-Store (Opcional)

Si quieres un monitor **por tienda** (más granular):

```python
# En tu ETL principal
def ejecutar_etl_completo():
    tiendas = get_tiendas_activas()

    for tienda_id, config in tiendas.items():
        # Cada tienda tiene su propio check-in
        with cron_monitor("etl_inventario_tienda", tienda_id=tienda_id):
            procesar_tienda(tienda_id, config)
```

Esto crea monitores como:
- `etl-inventario-tienda-tienda01`
- `etl-inventario-tienda-tienda02`
- etc.

**Ventaja:** Sabes exactamente qué tienda falló.

**Desventaja:** Más monitores = más ruido.

## Configuración de Alertas

### En Sentry UI:

1. Ve a https://sentry.io/crons/
2. Click en `etl-inventario-morning`
3. Settings → Alerts
4. Configurar:

**Missed Check-In:**
- ✅ Enabled
- Margin: 30 minutes (ya configurado en código)
- Action: Email a data-team@tuempresa.com

**Timeout:**
- ✅ Enabled
- Max Runtime: 3 hours (ya configurado)
- Action: Email + Slack #alerts

**Failure:**
- ✅ Enabled
- Action: Email + Slack #alerts (urgente)

**Recovery:**
- ✅ Enabled
- Action: Email (informativo)

### Ejemplo de Alerta Slack:

```
🚨 Fluxion ETL Alert

Monitor: etl-inventario-morning
Status: MISSED CHECK-IN ❌

Expected: Daily at 7:00 AM UTC (3:00 AM Venezuela)
Last check-in: 25 hours ago

Possible issues:
- EventBridge rule disabled
- Task failed to start
- Container crashed early

View in Sentry: https://sentry.io/crons/etl-inventario-morning
View CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/...
```

## Checklist de Deployment

Antes de deployar a producción:

- [ ] DSN configurado en SSM Parameter Store
- [ ] Variables de entorno agregadas a Task Definition (CDK)
- [ ] Permisos SSM agregados al Task Role (CDK)
- [ ] `sentry-sdk>=2.0.0` en requirements.txt
- [ ] Script ETL actualizado con `cron_monitor()` wrapper
- [ ] Schedules configurados en `sentry_cron_monitors.py` (UTC)
- [ ] CDK deploy exitoso
- [ ] Docker imagen rebuildeada y pusheada a ECR
- [ ] Test manual de la task
- [ ] Verificar check-in en Sentry después de test
- [ ] Configurar alertas en Sentry UI
- [ ] Documentar para el equipo

## Resumen

**Lo que pasa en producción:**

1. EventBridge dispara ECS Task a las 3 AM y 2 PM
2. Task arranca container con ETL
3. Container lee `SENTRY_DSN` del environment
4. ETL llama `init_sentry_for_etl()` → Conecta a Sentry
5. `with cron_monitor()` → Envía check-in IN_PROGRESS
6. ETL procesa todas las tiendas
7. Al terminar → check-in OK (o ERROR si falla)
8. Sentry compara con schedule esperado
9. Si hay problema → Alerta por email/Slack
10. Container termina y se destruye

**Todo automático, sin intervención manual.**

## Próximos Pasos

1. Implementar cambios en CDK
2. Deploy del stack actualizado
3. Rebuild de imagen Docker
4. Esperar próxima ejecución (3 AM o 2 PM)
5. Verificar en Sentry
6. Configurar alertas
