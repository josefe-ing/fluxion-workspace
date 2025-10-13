# 🚀 Configuración ETL en ECS - Plan de Implementación

**Fecha**: 2025-10-12
**Estado**: 📋 Planificación - Pendiente de Revisión
**Autor**: Claude Code + josefe-ing

---

## 📊 Resumen Ejecutivo

Este documento describe la configuración completa que se agregará al stack de CDK para habilitar el ETL de inventario ejecutándose periódicamente en AWS ECS.

### Objetivos
1. ✅ ETL corriendo en ECS Fargate (serverless)
2. ✅ Acceso a SQL Servers vía VPN WireGuard existente
3. ✅ Escritura a DuckDB en EFS compartido
4. ✅ Ejecución programada cada 6 horas
5. ✅ Logs centralizados en CloudWatch
6. ✅ Alarmas para fallos

---

## 🏗️ Componentes a Agregar

### **1. ECR Repository para ETL**
```typescript
// Repository para almacenar la imagen Docker del ETL
const etlRepo = new ecr.Repository(this, 'FluxionETLRepo', {
  repositoryName: 'fluxion-etl',
  imageScanOnPush: true, // Escaneo de seguridad automático
  lifecycleRules: [
    {
      description: 'Keep last 10 images',
      maxImageCount: 10,
    },
  ],
  removalPolicy: cdk.RemovalPolicy.RETAIN, // No borrar repo al destruir stack
});
```

**¿Por qué?**
Necesitamos un lugar para almacenar la imagen Docker del ETL en AWS. ECR (Elastic Container Registry) es el registry nativo de AWS.

---

### **2. Secret para Credenciales SQL**
```typescript
// Credenciales SQL Server para ETL
const sqlCredentials = new secretsmanager.Secret(this, 'SQLServerCredentials', {
  secretName: 'fluxion/sql-credentials',
  description: 'SQL Server credentials for La Granja ETL',
  secretStringValue: cdk.SecretValue.unsafePlainText(
    JSON.stringify({
      username: 'beliveryApp',
      password: 'AxPG_25!',
    })
  ),
});
```

**¿Por qué?**
Las credenciales no deben estar hardcodeadas en el código. Se almacenan de forma segura en Secrets Manager y el ETL las lee al iniciar.

---

### **3. Task Definition para ETL**
```typescript
// Task Definition - Define el container ETL
const etlTask = new ecs.FargateTaskDefinition(this, 'FluxionETLTask', {
  memoryLimitMiB: 4096,  // 4GB RAM (ETL procesa muchos datos)
  cpu: 2048,              // 2 vCPU
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

// Grant permissions
fileSystem.grantRootAccess(etlTask.taskRole);
sqlCredentials.grantRead(etlTask.taskRole);
wireguardConfig.grantRead(etlTask.taskRole);

// Container configuration
const etlContainer = etlTask.addContainer('etl', {
  image: ecs.ContainerImage.fromEcrRepository(etlRepo, 'latest'),
  logging: ecs.LogDrivers.awsLogs({
    streamPrefix: 'fluxion-etl',
    logRetention: logs.RetentionDays.ONE_WEEK,
  }),
  environment: {
    ENVIRONMENT: 'production',
    AWS_REGION: this.region,
    DATABASE_PATH: '/data/fluxion_production.db',
    ETL_MODE: 'etl_inventario.py',
    RUN_MODE: 'scheduled',
    SENTRY_DSN: process.env.SENTRY_DSN || '',
  },
  // Stop container after ETL completes (not a long-running service)
  stopTimeout: cdk.Duration.minutes(2),
});

// Mount EFS
etlContainer.addMountPoints({
  containerPath: '/data',
  sourceVolume: 'fluxion-data',
  readOnly: false, // ETL needs to write to DuckDB
});
```

**Configuración clave:**
- **4GB RAM / 2 vCPU**: El ETL procesa millones de registros, necesita recursos
- **EFS montado en /data**: Acceso al mismo DuckDB que usa el backend
- **Stop timeout**: El container se detiene después de ejecutar el ETL
- **Logs a CloudWatch**: Todos los logs centralizados

---

### **4. Security Group para ETL**
```typescript
// Security Group - permite acceso desde ETL a VPN bridge
const etlSecurityGroup = new ec2.SecurityGroup(this, 'ETLSecurityGroup', {
  vpc,
  description: 'Security group for ETL tasks',
  allowAllOutbound: true, // Necesario para acceder SQL via VPN
});

// Allow ETL to access WireGuard bridge
etlSecurityGroup.addEgressRule(
  ec2.Peer.ipv4('192.168.0.0/16'),
  ec2.Port.allTraffic(),
  'Allow ETL to access La Granja network via VPN'
);
```

**¿Por qué?**
El ETL necesita permisos de red para:
- Comunicarse con el EC2 WireGuard bridge
- Acceder a los SQL Servers de La Granja (192.168.0.0/16)

---

### **5. EventBridge Rule - Scheduler**
```typescript
// EventBridge Rule - Ejecuta ETL cada 6 horas
const etlScheduleRule = new events.Rule(this, 'ETLScheduleRule', {
  ruleName: 'fluxion-etl-schedule',
  description: 'Run Fluxion ETL every 6 hours',
  schedule: events.Schedule.rate(cdk.Duration.hours(6)),
  enabled: true, // ⚠️ CAMBIAR A false SI QUIERES PROBAR MANUALMENTE PRIMERO
});

// Target - ECS RunTask
etlScheduleRule.addTarget(
  new targets.EcsTask({
    cluster,
    taskDefinition: etlTask,
    subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    securityGroups: [etlSecurityGroup],
    platformVersion: ecs.FargatePlatformVersion.LATEST,
    taskCount: 1, // Solo 1 instancia a la vez
    propagateTags: ecs.PropagatedTagSource.TASK_DEFINITION,
  })
);
```

**Schedule propuesto:**
- **Cada 6 horas**: 00:00, 06:00, 12:00, 18:00 UTC
- **Alternativa**: `events.Schedule.cron({ hour: '0,6,12,18', minute: '0' })`

**⚠️ NOTA IMPORTANTE:**
Por defecto el scheduler estará **ENABLED**. Si prefieres hacer pruebas manuales primero, cambia `enabled: true` a `enabled: false`.

---

### **6. CloudWatch Alarms - Monitoreo**
```typescript
// Alarm - ETL Task Failed
const etlFailedAlarm = new cloudwatch.Alarm(this, 'ETLTaskFailedAlarm', {
  alarmName: 'fluxion-etl-task-failed',
  alarmDescription: 'Alert when ETL task fails',
  metric: new cloudwatch.Metric({
    namespace: 'AWS/ECS',
    metricName: 'TaskStoppedReason',
    dimensionsMap: {
      ClusterName: cluster.clusterName,
      ServiceName: 'etl', // O el nombre que le demos
    },
    statistic: 'Sum',
    period: cdk.Duration.minutes(5),
  }),
  threshold: 1,
  evaluationPeriods: 1,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});

// TODO: Agregar SNS topic para notificaciones
// const etlAlertTopic = new sns.Topic(this, 'ETLAlertTopic', {
//   displayName: 'Fluxion ETL Alerts',
// });
// etlFailedAlarm.addAlarmAction(new actions.SnsAction(etlAlertTopic));
```

**Alarmas propuestas:**
1. ✅ ETL task failed (código de salida != 0)
2. ✅ ETL task duration > 30 minutos (timeout)
3. ⏳ SNS notifications (requiere configurar email/Slack)

---

### **7. Outputs - Información útil**
```typescript
// Stack Outputs
new cdk.CfnOutput(this, 'ETLRepositoryURI', {
  description: 'ECR Repository URI for ETL',
  value: etlRepo.repositoryUri,
  exportName: 'FluxionETLRepoURI',
});

new cdk.CfnOutput(this, 'ETLTaskDefinitionArn', {
  description: 'ETL Task Definition ARN',
  value: etlTask.taskDefinitionArn,
  exportName: 'FluxionETLTaskArn',
});

new cdk.CfnOutput(this, 'ETLLogGroup', {
  description: 'CloudWatch Log Group for ETL',
  value: `/aws/ecs/fluxion-etl`,
  exportName: 'FluxionETLLogGroup',
});
```

**¿Por qué?**
Estos outputs nos dan información importante después del deploy:
- **URI del repo**: Para hacer `docker push`
- **Task ARN**: Para ejecutar manualmente con AWS CLI
- **Log Group**: Para ver logs en CloudWatch

---

## 🔒 Permisos IAM - Resumen

El **ETL Task Role** tendrá estos permisos:

| Permiso | Recurso | ¿Por qué? |
|---------|---------|-----------|
| `secretsmanager:GetSecretValue` | `fluxion/sql-credentials` | Leer credenciales SQL |
| `secretsmanager:GetSecretValue` | `fluxion/wireguard-config` | Info VPN (opcional) |
| `elasticfilesystem:ClientMount` | EFS FileSystem | Montar EFS |
| `elasticfilesystem:ClientWrite` | EFS FileSystem | Escribir a DuckDB |
| `logs:CreateLogStream` | CloudWatch Logs | Crear stream de logs |
| `logs:PutLogEvents` | CloudWatch Logs | Escribir logs |

---

## 🚦 Flujo de Ejecución

### Ciclo de vida del ETL:

```
1. EventBridge dispara (cada 6 horas)
        ↓
2. ECS lanza Fargate task en subnet privada
        ↓
3. Container inicia → startup-etl.sh
        ↓
4. Lee credenciales SQL de Secrets Manager
        ↓
5. Verifica conectividad VPN (ping a 192.168.150.10)
        ↓
6. Monta EFS en /data (DuckDB disponible)
        ↓
7. Ejecuta etl_inventario.py
        ↓
        ├─→ Conecta a SQL Servers via VPN bridge
        ├─→ Extrae inventario de tiendas activas
        ├─→ Transforma datos
        └─→ Carga a DuckDB en EFS
        ↓
8. ETL completa → marca success flag
        ↓
9. Container termina (exit code 0 = success)
        ↓
10. CloudWatch registra métricas y logs
```

**Duración estimada**: 5-15 minutos por ejecución (dependiendo de cuántas tiendas)

---

## 💰 Estimación de Costos

### Costos adicionales por ETL:

| Recurso | Especificación | Costo Estimado |
|---------|----------------|----------------|
| **ECR Storage** | ~1.5 GB imagen | ~$0.15/mes |
| **Fargate vCPU** | 2 vCPU × 15 min × 4 veces/día | ~$3.60/mes |
| **Fargate Memory** | 4GB × 15 min × 4 veces/día | ~$1.60/mes |
| **CloudWatch Logs** | ~50 MB/día | ~$0.30/mes |
| **EventBridge** | 4 invocaciones/día | Gratis |
| **Secrets Manager** | 1 secret adicional | $0.40/mes |
| **TOTAL ADICIONAL** | | **~$6/mes** |

**Total infraestructura con ETL**: ~$13/mes
- VPN WireGuard: $7/mes
- ETL: $6/mes

---

## ⚙️ Configuración Opcional

### Frecuencias alternativas:

```typescript
// Cada 4 horas
schedule: events.Schedule.rate(cdk.Duration.hours(4))

// Cada hora (útil para testing)
schedule: events.Schedule.rate(cdk.Duration.hours(1))

// Solo durante horario laboral (9am-6pm UTC, lun-vie)
schedule: events.Schedule.cron({
  hour: '9-18',
  minute: '0',
  weekDay: 'MON-FRI'
})

// Personalizado: cada 6 horas empezando a las 3am
schedule: events.Schedule.cron({
  hour: '3,9,15,21',
  minute: '0'
})
```

### Variables de entorno adicionales:

```typescript
environment: {
  // ... existing vars ...

  // ETL specific
  ETL_TIMEOUT_SECONDS: '1800',              // 30 min timeout
  ETL_MAX_RETRIES: '3',                      // Reintentos en error
  ETL_BATCH_SIZE: '50000',                   // Registros por batch
  ETL_TIENDAS: 'tienda_01,tienda_04,...',   // Tiendas específicas

  // Logging
  LOG_LEVEL: 'INFO',                         // DEBUG para troubleshooting
  SENTRY_ENVIRONMENT: 'production',          // Para error tracking
}
```

---

## 🧪 Plan de Testing

### Fase 1: Build y Push Local
```bash
# 1. Build para AMD64 (arquitectura AWS)
cd etl
docker buildx build --platform linux/amd64 -t fluxion-etl:latest .

# 2. Tag para ECR
docker tag fluxion-etl:latest \
  <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/fluxion-etl:latest

# 3. Login a ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# 4. Push
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/fluxion-etl:latest
```

### Fase 2: Deploy CDK
```bash
cd infrastructure
cdk diff    # Ver cambios antes de aplicar
cdk deploy  # Aplicar cambios
```

### Fase 3: Test Manual (antes de habilitar scheduler)
```bash
# Ejecutar task manualmente
aws ecs run-task \
  --cluster fluxion-cluster \
  --task-definition fluxion-etl-task \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[subnet-xxx],
    securityGroups=[sg-xxx],
    assignPublicIp=DISABLED
  }"

# Ver logs en tiempo real
aws logs tail /aws/ecs/fluxion-etl --follow
```

### Fase 4: Verificación
```bash
# 1. Verificar que el ETL completó
aws ecs describe-tasks --cluster fluxion-cluster --tasks <task-id>

# 2. Verificar logs
aws logs filter-log-events \
  --log-group-name /aws/ecs/fluxion-etl \
  --filter-pattern "ETL completed successfully"

# 3. Verificar datos en DuckDB (via backend API)
curl http://<ALB_DNS>/api/ubicaciones
curl http:///<ALB_DNS>/api/estadisticas
```

### Fase 5: Habilitar Scheduler
```typescript
// En CDK, cambiar:
enabled: false  →  enabled: true

// Redeploy
cdk deploy
```

---

## 🚨 Troubleshooting

### Problema: Task falla con error de permisos EFS
**Solución**: Verificar que el task role tiene `elasticfilesystem:ClientMount`

### Problema: No puede conectar a SQL Server
**Solución**:
1. Verificar que el security group permite tráfico a 192.168.0.0/16
2. Verificar que la VPN WireGuard está UP: `aws ssm start-session --target i-0831b29e47bdadd07`
3. Dentro del EC2, verificar: `sudo wg show`

### Problema: ETL timeout después de 30 minutos
**Solución**:
1. Aumentar `memoryLimitMiB` y `cpu` en task definition
2. Procesar menos tiendas por ejecución
3. Aumentar `stopTimeout`

### Problema: Logs no aparecen en CloudWatch
**Solución**: Verificar IAM role tiene permisos `logs:CreateLogStream` y `logs:PutLogEvents`

---

## ✅ Checklist de Implementación

### Pre-requisitos
- [ ] VPN WireGuard funcionando ✅ (YA EXISTE)
- [ ] EFS montado y accesible ✅ (YA EXISTE)
- [ ] Backend service corriendo ✅ (YA EXISTE)
- [ ] Secrets Manager con credenciales SQL configurado
- [ ] Dockerfile ETL listo ✅ (COMPLETADO HOY)

### Implementación
- [ ] Revisar este documento con el equipo
- [ ] Decidir frecuencia del scheduler (6 horas recomendado)
- [ ] Agregar código CDK al stack
- [ ] Build imagen ETL para AMD64
- [ ] Push imagen a ECR
- [ ] Deploy CDK stack
- [ ] Test manual primera ejecución
- [ ] Verificar datos en DuckDB
- [ ] Habilitar scheduler
- [ ] Configurar alarmas CloudWatch
- [ ] Documentar procedimientos de operación

### Post-implementación
- [ ] Monitorear primera semana de ejecuciones
- [ ] Ajustar recursos si es necesario
- [ ] Configurar SNS para alertas
- [ ] Crear runbook de troubleshooting
- [ ] Training al equipo

---

## 📚 Referencias

- [docs/infrastructure/vpn-setup-complete.md](../infrastructure/vpn-setup-complete.md) - Setup VPN
- [etl/README.md](../../etl/README.md) - Documentación ETL
- [etl/Dockerfile](../../etl/Dockerfile) - Imagen Docker ETL
- [etl/startup-etl.sh](../../etl/startup-etl.sh) - Script de entrada
- AWS ECS Fargate: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html
- AWS EventBridge: https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-run-lambda-schedule.html

---

**Próximo paso**: Revisar este documento y decidir si proceder con la implementación.

**Preguntas para discutir**:
1. ¿6 horas de frecuencia es apropiado o prefieres otra?
2. ¿Habilitamos el scheduler desde el primer deploy o probamos manualmente primero?
3. ¿4GB RAM / 2 vCPU son suficientes o necesitamos más?
4. ¿Algún ajuste a los tiempos o configuración?
