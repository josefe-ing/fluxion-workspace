# Cambios CDK para Sentry Cron Monitors

Cambios a aplicar en `lib/infrastructure-stack.ts`

## 1. Imports Adicionales

Agregar al inicio del archivo (después de línea ~16):

```typescript
import * as ssm from 'aws-cdk-lib/aws-ssm';
```

## 2. Crear Parámetro SSM para Sentry DSN

Agregar después de línea ~243 (después de `productionSecrets`):

```typescript
// ========================================
// Sentry Configuration for ETL Monitoring
// ========================================

// Sentry DSN for ETL cron monitors
// Create this parameter manually first:
// aws ssm put-parameter \
//   --name "/fluxion/etl/sentry-dsn" \
//   --type "SecureString" \
//   --value "https://c7a7c4d06c7d58ec02f551034e35eb1d@o4510234583760896.ingest.us.sentry.io/4510239662276608" \
//   --region us-east-1

const sentryDsnParameter = ssm.StringParameter.fromSecureStringParameterAttributes(
  this,
  'SentryDsnParameter',
  {
    parameterName: '/fluxion/etl/sentry-dsn',
    version: 1,  // Use version 1 or latest
  }
);
```

## 3. Actualizar ETL Container Environment Variables

Buscar la línea ~594 donde defines `etlContainer`. Actualizar el `environment`:

```typescript
const etlContainer = etlTask.addContainer('etl', {
  image: ecs.ContainerImage.fromEcrRepository(etlRepo, 'latest'),
  logging: ecs.LogDriver.awsLogs({
    streamPrefix: 'fluxion-etl',
  }),
  memoryLimitMiB: 2048,
  cpu: 1024,

  // Environment variables
  environment: {
    ETL_MODE: 'etl_inventario.py',
    ETL_ARGS: '--todas',  // Todas las tiendas activas (20 ubicaciones)
    ETL_ENVIRONMENT: 'production',  // Usar IPs y puertos de producción via WireGuard

    // ✅ NUEVO: Sentry Monitoring
    SENTRY_ENVIRONMENT: 'production',
    SENTRY_TRACES_SAMPLE_RATE: '0.1',  // 10% de las transacciones
  },

  // Secrets - Agregar SENTRY_DSN
  secrets: {
    // Existing secrets
    SQL_USER: ecs.Secret.fromSecretsManager(sqlCredentials, 'username'),
    SQL_PASS: ecs.Secret.fromSecretsManager(sqlCredentials, 'password'),

    // ✅ NUEVO: Sentry DSN from SSM Parameter Store
    SENTRY_DSN: ecs.Secret.fromSsmParameter(sentryDsnParameter),
  },
});
```

## 4. Dar Permisos al Task Role para leer SSM

Agregar después de línea ~590 (después de los grants existentes):

```typescript
// Grant permissions to ETL task
fileSystem.grantRootAccess(etlTask.taskRole);
sqlCredentials.grantRead(etlTask.taskRole);
wireguardConfig.grantRead(etlTask.taskRole);
productionSecrets.grantRead(etlTask.taskRole);  // SendGrid credentials for email notifications

// ✅ NUEVO: Grant permission to read Sentry DSN from SSM Parameter Store
etlTask.taskRole.addToPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      'ssm:GetParameter',
      'ssm:GetParameters',
    ],
    resources: [
      `arn:aws:ssm:${this.region}:${this.account}:parameter/fluxion/etl/sentry-dsn`,
    ],
  })
);

// ✅ NUEVO: Grant permission to decrypt SSM SecureString (KMS)
etlTask.taskRole.addToPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      'kms:Decrypt',
    ],
    resources: ['*'],  // Or specific KMS key ARN if you have one
    conditions: {
      StringEquals: {
        'kms:ViaService': `ssm.${this.region}.amazonaws.com`,
      },
    },
  })
);
```

## 5. Resumen de Cambios

**Líneas a modificar:**
- ~16: Agregar `import * as ssm`
- ~243: Agregar definición de `sentryDsnParameter`
- ~594-620: Actualizar `environment` y `secrets` del container
- ~590: Agregar permisos SSM al task role

## 6. Deployment

```bash
cd infrastructure

# Ver cambios
npx cdk diff

# Deploy
npx cdk deploy

# Verificar que el stack se actualizó
aws ecs describe-task-definition \
  --task-definition FluxionETLTask \
  --query 'taskDefinition.containerDefinitions[0].environment' \
  --output table
```

## 7. Crear el Parámetro SSM (PRIMERO, antes de deploy)

```bash
# Crear el parámetro ANTES de hacer cdk deploy
aws ssm put-parameter \
  --name "/fluxion/etl/sentry-dsn" \
  --type "SecureString" \
  --value "https://c7a7c4d06c7d58ec02f551034e35eb1d@o4510234583760896.ingest.us.sentry.io/4510239662276608" \
  --description "Sentry DSN for ETL cron monitors" \
  --region us-east-1

# Verificar que se creó
aws ssm get-parameter \
  --name "/fluxion/etl/sentry-dsn" \
  --with-decryption \
  --region us-east-1
```

## Alternativa Rápida (sin SSM)

Si prefieres no usar SSM Parameter Store, puedes poner el DSN directamente en `environment`:

```typescript
environment: {
  ETL_MODE: 'etl_inventario.py',
  ETL_ARGS: '--todas',
  ETL_ENVIRONMENT: 'production',

  // Sentry config (directo, menos seguro)
  SENTRY_DSN: 'https://c7a7c4d06c7d58ec02f551034e35eb1d@o4510234583760896.ingest.us.sentry.io/4510239662276608',
  SENTRY_ENVIRONMENT: 'production',
  SENTRY_TRACES_SAMPLE_RATE: '0.1',
},
```

**Pros:** Más rápido, menos pasos
**Cons:** DSN visible en plaintext en Task Definition

## Verificación Post-Deploy

```bash
# 1. Verificar Task Definition actualizada
aws ecs describe-task-definition \
  --task-definition FluxionETLTask:latest \
  --query 'taskDefinition.containerDefinitions[0].environment'

# 2. Lanzar task manual para probar
aws ecs run-task \
  --cluster fluxion-cluster \
  --task-definition FluxionETLTask \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=DISABLED}"

# 3. Ver logs
aws logs tail /aws/ecs/fluxion-etl --follow

# 4. Buscar mensajes de Sentry en logs
aws logs filter-log-events \
  --log-group-name /aws/ecs/fluxion-etl \
  --filter-pattern "Sentry" \
  --start-time $(date -u -d '10 minutes ago' +%s)000
```

Deberías ver:
```
✅ Sentry inicializado para ETL
📊 Iniciando cron monitor: etl-inventario-morning
✅ Cron monitor completado: etl-inventario-morning
```
