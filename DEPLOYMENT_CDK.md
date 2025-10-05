# 🚀 Deployment con AWS CDK - Fluxion AI

Guía simplificada para desplegar Fluxion AI usando **Infrastructure as Code** con AWS CDK.

## 🎯 Arquitectura Simplificada con CDK

```
┌─────────────────────────────────────────────────────────────┐
│                     INTERNET                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   CloudFront + S3    │
              │   (Frontend)         │
              │   Tags: fluxion-ai   │
              └──────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Application LB     │
              │   (Backend API)      │
              └────────┬─────────────┘
                       │
         ┌─────────────┴──────────────┐
         │                            │
         ▼                            ▼
   ┌──────────┐              ┌──────────────┐
   │   ECS    │              │  EventBridge │
   │ Fargate  │              │   (Cron)     │
   │ Backend  │              └──────┬───────┘
   └────┬─────┘                     │
        │                           ▼
        │                    ┌──────────────┐
        │                    │  ECS Tasks   │
        │                    │  ETL Jobs    │
        │                    │  + VPN       │
        │                    └──────────────┘
        │
        ▼
   ┌──────────────────┐
   │   RDS for DuckDB │  ← Alternativa: EFS mounted
   │   or EFS Volume  │
   │   20GB Encrypted │
   └──────────────────┘
        │
        ▼
   ┌──────────────────┐
   │   S3 Backups     │
   │   Daily Snapshots│
   └──────────────────┘
        │
        ▼
   ┌──────────────────┐
   │   CloudWatch     │
   │   + Sentry.io    │
   │   Monitoring     │
   └──────────────────┘
```

## 📋 Stack Components

### 1. **Multi-Project Support con Tags**

```typescript
// Todos los recursos tendrán estos tags
const projectTags = {
  Project: "fluxion-ai",
  Environment: "production",
  ManagedBy: "cdk",
  CostCenter: "la-granja-mercado",
  Owner: "josefe-ing"
};
```

### 2. **VPN para ETL**

- **AWS Client VPN** o **Site-to-Site VPN**
- ETL tasks corren en subnet privada con acceso VPN
- Security Groups restringidos

### 3. **Jobs Programados**

- **EventBridge Rules** (cron expressions)
- **ECS Scheduled Tasks** para ETL
- **Lambda** para jobs ligeros

### 4. **Monitoring**

- **Sentry.io** para error tracking
- **CloudWatch** para logs y métricas
- **CloudWatch Alarms** para alertas

---

## 🛠️ Setup CDK

### Paso 1: Instalar CDK

```bash
# Instalar AWS CDK
npm install -g aws-cdk

# Verificar instalación
cdk --version

# Crear directorio para infraestructura
cd /Users/jose/Developer/fluxion-workspace
mkdir infrastructure
cd infrastructure

# Inicializar CDK app
cdk init app --language typescript

# Instalar dependencias adicionales
npm install @aws-cdk/aws-ec2 @aws-cdk/aws-ecs @aws-cdk/aws-ecs-patterns \
  @aws-cdk/aws-s3 @aws-cdk/aws-cloudfront @aws-cdk/aws-events \
  @aws-cdk/aws-events-targets @aws-cdk/aws-efs
```

### Paso 2: Configurar AWS Account

```bash
# Bootstrap CDK (solo primera vez)
cdk bootstrap aws://ACCOUNT-ID/us-east-1

# Ejemplo:
cdk bootstrap aws://123456789012/us-east-1
```

---

## 📦 CDK Stack - Fluxion AI

### Stack Principal: `lib/fluxion-stack.ts`

```typescript
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class FluxionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Tags comunes para todos los recursos
    const projectTags = {
      Project: 'fluxion-ai',
      Environment: 'production',
      ManagedBy: 'cdk',
      CostCenter: 'la-granja-mercado',
    };

    // Aplicar tags al stack
    Object.entries(projectTags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    // ========================================
    // 1. VPC con VPN Gateway
    // ========================================
    const vpc = new ec2.Vpc(this, 'FluxionVPC', {
      maxAzs: 2,
      natGateways: 1, // Para subnet privada
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
      vpnGateway: true, // Para VPN Site-to-Site
    });

    // ========================================
    // 2. EFS para DuckDB (persistencia)
    // ========================================
    const fileSystem = new efs.FileSystem(this, 'FluxionEFS', {
      vpc,
      encrypted: true,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // No borrar en destroy
    });

    const accessPoint = fileSystem.addAccessPoint('FluxionDataAccessPoint', {
      path: '/fluxion-data',
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '755',
      },
      posixUser: {
        gid: '1000',
        uid: '1000',
      },
    });

    // ========================================
    // 3. S3 para Frontend + Backups
    // ========================================
    const frontendBucket = new s3.Bucket(this, 'FluxionFrontend', {
      bucketName: 'fluxion-frontend-prod',
      publicReadAccess: true,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const backupBucket = new s3.Bucket(this, 'FluxionBackups', {
      bucketName: 'fluxion-backups-prod',
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(90), // Retener 90 días
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    });

    // CloudFront distribution
    const distribution = new cloudfront.CloudFrontWebDistribution(
      this,
      'FluxionCDN',
      {
        originConfigs: [
          {
            s3OriginSource: {
              s3BucketSource: frontendBucket,
            },
            behaviors: [{ isDefaultBehavior: true }],
          },
        ],
      }
    );

    // ========================================
    // 4. ECS Cluster (Backend + ETL)
    // ========================================
    const cluster = new ecs.Cluster(this, 'FluxionCluster', {
      vpc,
      clusterName: 'fluxion-cluster',
      containerInsights: true, // Habilitar monitoring
    });

    // Task Definition - Backend
    const backendTask = new ecs.FargateTaskDefinition(
      this,
      'FluxionBackendTask',
      {
        memoryLimitMiB: 2048,
        cpu: 1024,
        volumes: [
          {
            name: 'fluxion-data',
            efsVolumeConfiguration: {
              fileSystemId: fileSystem.fileSystemId,
              transitEncryption: 'ENABLED',
              authorizationConfig: {
                accessPointId: accessPoint.accessPointId,
                iam: 'ENABLED',
              },
            },
          },
        ],
      }
    );

    // Container - Backend
    const backendContainer = backendTask.addContainer('backend', {
      image: ecs.ContainerImage.fromAsset('../backend'), // Dockerfile en /backend
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'fluxion-backend' }),
      environment: {
        ENVIRONMENT: 'production',
        DATABASE_PATH: '/data/fluxion_production.db',
        SENTRY_DSN: process.env.SENTRY_DSN || '',
      },
      secrets: {
        SQL_SERVER_PASSWORD: ecs.Secret.fromSecretsManager(
          /* Secret ARN */
        ),
      },
    });

    backendContainer.addPortMappings({ containerPort: 8001 });

    backendContainer.addMountPoints({
      containerPath: '/data',
      sourceVolume: 'fluxion-data',
      readOnly: false,
    });

    // Fargate Service - Backend con Load Balancer
    const backendService = new ecs.FargateService(this, 'FluxionBackendService', {
      cluster,
      taskDefinition: backendTask,
      desiredCount: 2, // 2 instancias para HA
      assignPublicIp: false, // En subnet privada
    });

    // Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'FluxionALB', {
      vpc,
      internetFacing: true,
    });

    const listener = alb.addListener('HttpListener', { port: 80 });

    listener.addTargets('BackendTarget', {
      port: 8001,
      targets: [backendService],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
      },
    });

    // ========================================
    // 5. ETL Scheduled Tasks
    // ========================================

    // Task Definition - ETL
    const etlTask = new ecs.FargateTaskDefinition(this, 'FluxionETLTask', {
      memoryLimitMiB: 4096, // Más memoria para ETL
      cpu: 2048,
      volumes: [
        {
          name: 'fluxion-data',
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              accessPointId: accessPoint.accessPointId,
              iam: 'ENABLED',
            },
          },
        },
      ],
    });

    const etlContainer = etlTask.addContainer('etl', {
      image: ecs.ContainerImage.fromAsset('../etl'), // Dockerfile en /etl
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'fluxion-etl' }),
      command: ['python3', 'etl_inventario.py'], // Comando a ejecutar
      environment: {
        DATABASE_PATH: '/data/fluxion_production.db',
        SENTRY_DSN: process.env.SENTRY_DSN || '',
      },
    });

    etlContainer.addMountPoints({
      containerPath: '/data',
      sourceVolume: 'fluxion-data',
      readOnly: false,
    });

    // EventBridge Rule - ETL diario a las 2am
    const etlRule = new events.Rule(this, 'FluxionETLSchedule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '2',
        weekDay: '*',
      }),
      description: 'Run ETL daily at 2am UTC',
    });

    etlRule.addTarget(
      new targets.EcsTask({
        cluster,
        taskDefinition: etlTask,
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        taskCount: 1,
      })
    );

    // ========================================
    // 6. Backup Automation
    // ========================================

    const backupTask = new ecs.FargateTaskDefinition(
      this,
      'FluxionBackupTask',
      {
        memoryLimitMiB: 1024,
        cpu: 512,
      }
    );

    const backupContainer = backupTask.addContainer('backup', {
      image: ecs.ContainerImage.fromAsset('../scripts/backup-container'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'fluxion-backup' }),
      environment: {
        BACKUP_BUCKET: backupBucket.bucketName,
      },
    });

    // Backup diario a las 3am
    const backupRule = new events.Rule(this, 'FluxionBackupSchedule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '3',
        weekDay: '*',
      }),
    });

    backupRule.addTarget(
      new targets.EcsTask({
        cluster,
        taskDefinition: backupTask,
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      })
    );

    // ========================================
    // 7. CloudWatch Alarms
    // ========================================

    const cpuAlarm = backendService.metricCpuUtilization().createAlarm(
      this,
      'HighCPU',
      {
        threshold: 80,
        evaluationPeriods: 2,
        alarmDescription: 'Backend CPU > 80%',
      }
    );

    // ========================================
    // Outputs
    // ========================================

    new cdk.CfnOutput(this, 'FrontendURL', {
      value: distribution.distributionDomainName,
      description: 'CloudFront URL for frontend',
    });

    new cdk.CfnOutput(this, 'BackendURL', {
      value: alb.loadBalancerDnsName,
      description: 'ALB DNS for backend API',
    });

    new cdk.CfnOutput(this, 'BackupBucket', {
      value: backupBucket.bucketName,
      description: 'S3 bucket for backups',
    });
  }
}
```

---

## 🔧 Configuración Adicional

### 1. Sentry.io Setup

```bash
# Crear cuenta en Sentry.io
# https://sentry.io/signup/

# Obtener DSN del proyecto
# Projects > fluxion-ai > Settings > Client Keys (DSN)

# Agregar a .env
echo "SENTRY_DSN=https://xxx@sentry.io/xxx" >> .env
```

**Backend integration (`backend/main.py`):**

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
import os

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment="production",
    traces_sample_rate=1.0,
    profiles_sample_rate=1.0,
)

app = FastAPI()
```

### 2. VPN Configuration

**Opción A: Client VPN (para usuarios)**
```bash
# AWS Console > VPC > Client VPN Endpoints
# Create Client VPN Endpoint
# Download client configuration
```

**Opción B: Site-to-Site VPN (para ETL)**
```typescript
// En el stack CDK:
const vpnConnection = new ec2.VpnConnection(this, 'FluxionVPN', {
  vpc,
  ip: 'YOUR_ON_PREMISE_IP', // IP de La Granja
  staticRoutes: ['192.168.1.0/24'], // Red interna
});
```

### 3. Secrets Manager

```bash
# Crear secret para credenciales SQL Server
aws secretsmanager create-secret \
  --name fluxion/sql-server \
  --secret-string '{
    "host":"sql-server.lagranja.local",
    "user":"etl_user",
    "password":"SECRET_PASSWORD"
  }' \
  --tags Key=Project,Value=fluxion-ai
```

---

## 🚀 Deployment

### Deploy Stack

```bash
cd infrastructure

# Compilar TypeScript
npm run build

# Preview cambios
cdk diff

# Deploy
cdk deploy FluxionStack

# Deploy específico (si tienes múltiples stacks)
cdk deploy FluxionStack --tags Project=fluxion-ai
```

### Deploy Frontend

```bash
# Build frontend
cd ../frontend
npm run build

# Deploy a S3 (automático con CDK)
aws s3 sync dist/ s3://fluxion-frontend-prod/ --delete

# Invalidar cache CloudFront
aws cloudfront create-invalidation \
  --distribution-id XXXXX \
  --paths "/*"
```

---

## 📊 Monitoreo

### CloudWatch Dashboard

```typescript
// Agregar al stack
const dashboard = new cloudwatch.Dashboard(this, 'FluxionDashboard', {
  dashboardName: 'fluxion-ai-metrics',
});

dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'Backend CPU',
    left: [backendService.metricCpuUtilization()],
  }),
  new cloudwatch.GraphWidget({
    title: 'Backend Memory',
    left: [backendService.metricMemoryUtilization()],
  })
);
```

### Sentry Monitoring

- **Errors**: Automático con SDK
- **Performance**: Traces de requests
- **Alerts**: Email/Slack cuando hay errores

---

## 💰 Costos Estimados (Free Tier + Producción)

| Servicio | Free Tier (12 meses) | Producción (después) |
|----------|----------------------|----------------------|
| ECS Fargate | 50GB-hrs gratis | ~$30/mes (backend) |
| EFS | 5GB gratis | ~$1.50/mes (20GB) |
| S3 | 5GB gratis | ~$1/mes |
| CloudFront | 50GB transfer | ~$5/mes |
| VPN Gateway | N/A | ~$36/mes |
| Data Transfer | 15GB gratis | ~$10/mes |
| **TOTAL** | **~$10/mes** | **~$85/mes** |

---

## 📝 Checklist

- [ ] Cuenta AWS creada (Free Tier)
- [ ] AWS CLI configurado
- [ ] CDK instalado y bootstrapped
- [ ] Sentry.io cuenta creada
- [ ] VPN configurada (Site-to-Site)
- [ ] Secrets Manager con credenciales SQL
- [ ] Stack deployado: `cdk deploy`
- [ ] Frontend subido a S3
- [ ] ETL jobs programados
- [ ] Backups automáticos configurados
- [ ] CloudWatch alarms activas
- [ ] Sentry monitoring activo

---

## 🔄 Updates y Mantenimiento

```bash
# Actualizar código backend (auto-deploy con ECS)
git push origin main

# Actualizar infraestructura
cd infrastructure
cdk deploy

# Ver logs en tiempo real
aws logs tail /ecs/fluxion-backend --follow

# Ver métricas ETL
aws logs tail /ecs/fluxion-etl --since 1h

# Ejecutar ETL manualmente
aws ecs run-task \
  --cluster fluxion-cluster \
  --task-definition fluxion-etl \
  --launch-type FARGATE
```

---

## 🎯 Ventajas de esta Arquitectura

✅ **Multi-Project**: Tags permiten separar costos por proyecto
✅ **Serverless**: ECS Fargate escala automáticamente
✅ **VPN**: Acceso seguro a SQL Server on-premise
✅ **Scheduled Jobs**: ETL automático con EventBridge
✅ **Monitoring**: Sentry + CloudWatch para visibilidad completa
✅ **Infrastructure as Code**: Todo versionado en Git
✅ **Backups**: Automáticos a S3 con retención configurable

---

**¿Listo para deployar?** 🚀

Siguiente paso: Crear los Dockerfiles para backend y ETL.
