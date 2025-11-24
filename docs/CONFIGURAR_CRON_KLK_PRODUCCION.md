# Configurar Cron Jobs KLK en Producción

**Objetivo**: Ejecutar ETL de inventario y ventas KLK cada 30 minutos automáticamente en AWS
**Fecha**: 2025-11-24

---

## 📋 Resumen

Configurar EventBridge Rules para ejecutar ETL de inventario y ventas KLK con la siguiente frecuencia:

- **Inventario KLK**: Cada 30 minutos (00, 30)
- **Ventas KLK**: Cada 30 minutos con offset de 5 min (05, 35)

**Total**: 48 ejecuciones por día de cada ETL (96 ejecuciones totales)

---

## 🎯 Solución Recomendada: EventBridge → Backend API → ECS Task

### Arquitectura

```
EventBridge Rule (cron: */30 * * * *)
    ↓
Lambda Function
    ↓
Backend API Endpoint (POST /api/etl/sync)
    ↓
ECS Task (ETL Inventario KLK)
```

### Ventajas

- ✅ Usa la infraestructura existente (endpoints API ya implementados)
- ✅ No requiere nuevos ECS Task Definitions
- ✅ Logs centralizados en CloudWatch
- ✅ Monitoreo con el sistema de tracking existente
- ✅ Fácil de des

habilitar/habilitar desde CDK

---

## 🛠️ Implementación

### Paso 1: Crear Lambda Functions para Invocar Backend

Necesitamos 2 Lambdas (una para inventario, otra para ventas):

**Lambda 1: `fluxion-etl-klk-inventario-trigger`**
```typescript
// lambda/etl-klk-inventario-trigger/index.ts
import * as https from 'https';

export const handler = async (event: any) => {
  console.log('⏰ EventBridge triggered KLK inventario ETL');

  const payload = JSON.stringify({
    ubicacion_id: null  // Todas las tiendas KLK
  });

  const options = {
    hostname: 'd1tgnaj74tv17v.cloudfront.net',
    port: 443,
    path: '/api/etl/sync',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('✅ ETL inventario KLK triggered', data);
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', (error) => {
      console.error('❌ Error triggering ETL:', error);
      reject(error);
    });

    req.write(payload);
    req.end();
  });
};
```

**Lambda 2: `fluxion-etl-klk-ventas-trigger`**
```typescript
// lambda/etl-klk-ventas-trigger/index.ts
import * as https from 'https';

export const handler = async (event: any) => {
  console.log('⏰ EventBridge triggered KLK ventas ETL');

  // Calcular fecha_inicio (ayer) y fecha_fin (hoy)
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);

  const payload = JSON.stringify({
    ubicacion_id: null,  // Todas las tiendas KLK
    fecha_inicio: ayer.toISOString().split('T')[0],
    fecha_fin: hoy.toISOString().split('T')[0]
  });

  const options = {
    hostname: 'd1tgnaj74tv17v.cloudfront.net',
    port: 443,
    path: '/api/etl/sync/ventas',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('✅ ETL ventas KLK triggered', data);
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', (error) => {
      console.error('❌ Error triggering ETL:', error);
      reject(error);
    });

    req.write(payload);
    req.end();
  });
};
```

---

### Paso 2: Agregar al CDK Stack

Modificar `infrastructure/lib/infrastructure-stack.ts`:

```typescript
// Después de la línea 947 (después de ventasEtlRuleAfternoon)

// ========================================
// 12. KLK ETL Scheduled Rules (Every 30 minutes)
// ========================================

// Lambda para disparar inventario KLK
const klkInventarioTriggerLambda = new lambda.Function(this, 'KLKInventarioTriggerLambda', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromInline(`
    const https = require('https');
    exports.handler = async (event) => {
      console.log('⏰ EventBridge triggered KLK inventario ETL');
      const payload = JSON.stringify({ ubicacion_id: null });
      const options = {
        hostname: 'd1tgnaj74tv17v.cloudfront.net',
        port: 443,
        path: '/api/etl/sync',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        }
      };
      return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            console.log('✅ ETL inventario KLK triggered', data);
            resolve({ statusCode: res.statusCode, body: data });
          });
        });
        req.on('error', (error) => {
          console.error('❌ Error triggering ETL:', error);
          reject(error);
        });
        req.write(payload);
        req.end();
      });
    };
  `),
  timeout: cdk.Duration.seconds(30),
  description: 'Trigger KLK inventario ETL via backend API',
});

// Lambda para disparar ventas KLK
const klkVentasTriggerLambda = new lambda.Function(this, 'KLKVentasTriggerLambda', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromInline(`
    const https = require('https');
    exports.handler = async (event) => {
      console.log('⏰ EventBridge triggered KLK ventas ETL');
      const hoy = new Date();
      const ayer = new Date(hoy);
      ayer.setDate(hoy.getDate() - 1);
      const payload = JSON.stringify({
        ubicacion_id: null,
        fecha_inicio: ayer.toISOString().split('T')[0],
        fecha_fin: hoy.toISOString().split('T')[0]
      });
      const options = {
        hostname: 'd1tgnaj74tv17v.cloudfront.net',
        port: 443,
        path: '/api/etl/sync/ventas',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        }
      };
      return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            console.log('✅ ETL ventas KLK triggered', data);
            resolve({ statusCode: res.statusCode, body: data });
          });
        });
        req.on('error', (error) => {
          console.error('❌ Error triggering ETL:', error);
          reject(error);
        });
        req.write(payload);
        req.end();
      });
    };
  `),
  timeout: cdk.Duration.seconds(30),
  description: 'Trigger KLK ventas ETL via backend API',
});

// EventBridge Rule: Inventario KLK cada 30 minutos (00, 30)
const klkInventarioRule = new events.Rule(this, 'KLKInventarioSchedule', {
  schedule: events.Schedule.cron({
    minute: '0,30',  // 00 y 30 de cada hora
    hour: '*',       // Todas las horas
    weekDay: '*',    // Todos los días
  }),
  description: 'Run KLK inventario ETL every 30 minutes (00, 30)',
  ruleName: 'fluxion-klk-inventario-every-30min',
  enabled: true,
});

klkInventarioRule.addTarget(new targets.LambdaFunction(klkInventarioTriggerLambda, {
  maxEventAge: cdk.Duration.hours(1),
  retryAttempts: 2,
}));

// EventBridge Rule: Ventas KLK cada 30 minutos (05, 35)
const klkVentasRule = new events.Rule(this, 'KLKVentasSchedule', {
  schedule: events.Schedule.cron({
    minute: '5,35',  // 05 y 35 de cada hora (5 minutos después de inventario)
    hour: '*',       // Todas las horas
    weekDay: '*',    // Todos los días
  }),
  description: 'Run KLK ventas ETL every 30 minutes (05, 35)',
  ruleName: 'fluxion-klk-ventas-every-30min',
  enabled: true,
});

klkVentasRule.addTarget(new targets.LambdaFunction(klkVentasTriggerLambda, {
  maxEventAge: cdk.Duration.hours(1),
  retryAttempts: 2,
}));
```

---

### Paso 3: Deploy

```bash
cd infrastructure
npm run build
cdk diff
cdk deploy

# O via GitHub Actions (push to main)
git add infrastructure/lib/infrastructure-stack.ts
git commit -m "feat: agregar cron jobs KLK cada 30 minutos (inventario y ventas)"
git push origin main
```

---

## 📅 Horario Configurado

### Inventario KLK
- **Cron**: `0,30 * * * *` (UTC)
- **Venezuela (UTC-4)**:
  - 00:00, 00:30, 01:00, 01:30, ..., 23:00, 23:30
- **Ejecuciones/día**: 48

### Ventas KLK
- **Cron**: `5,35 * * * *` (UTC)
- **Venezuela (UTC-4)**:
  - 00:05, 00:35, 01:05, 01:35, ..., 23:05, 23:35
- **Ejecuciones/día**: 48

### Offset de 5 minutos

El inventario se ejecuta **5 minutos antes** que las ventas:
1. ✅ 00:00 → Inventario actualiza stock
2. ⏳ 00:05 → Ventas usa stock fresco
3. ✅ Evita conflictos de escritura en DB

---

## 📊 Monitoreo

### CloudWatch Logs

**Lambda Inventario**:
```bash
aws logs tail /aws/lambda/FluxionStackV2-KLKInventarioTriggerLambda --follow
```

**Lambda Ventas**:
```bash
aws logs tail /aws/lambda/FluxionStackV2-KLKVentasTriggerLambda --follow
```

**ECS Tasks ETL**:
```bash
# Inventario
aws logs tail /ecs/fluxion-etl --follow --filter-pattern "KLK"

# Ventas
aws logs tail /ecs/fluxion-etl-ventas --follow --filter-pattern "KLK"
```

### EventBridge Metrics

```bash
# Ver ejecuciones de las reglas
aws events list-rule-targets-by-rule --rule fluxion-klk-inventario-every-30min
aws events list-rule-targets-by-rule --rule fluxion-klk-ventas-every-30min

# Ver métricas de invocaciones
aws cloudwatch get-metric-statistics \
  --namespace AWS/Events \
  --metric-name Invocations \
  --dimensions Name=RuleName,Value=fluxion-klk-inventario-every-30min \
  --start-time 2025-11-24T00:00:00Z \
  --end-time 2025-11-24T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

---

## 🧪 Testing

### Test Manual de Lambda

```bash
# Inventario
aws lambda invoke \
  --function-name FluxionStackV2-KLKInventarioTriggerLambda \
  --payload '{}' \
  response.json && cat response.json

# Ventas
aws lambda invoke \
  --function-name FluxionStackV2-KLKVentasTriggerLambda \
  --payload '{}' \
  response.json && cat response.json
```

### Verificar Próxima Ejecución

```bash
# Listar reglas
aws events list-rules --name-prefix fluxion-klk

# Ver detalles de una regla
aws events describe-rule --name fluxion-klk-inventario-every-30min
```

---

## ⚙️ Configuración Adicional

### Deshabilitar Temporalmente

```typescript
// En infrastructure-stack.ts, cambiar:
enabled: false,  // Era: enabled: true
```

### Cambiar Frecuencia

```typescript
// Cada hora (en lugar de cada 30 min)
schedule: events.Schedule.cron({
  minute: '0',
  hour: '*',
  weekDay: '*',
}),

// Cada 15 minutos
schedule: events.Schedule.cron({
  minute: '0,15,30,45',
  hour: '*',
  weekDay: '*',
}),
```

### Horario Específico (Solo Horario Comercial)

```typescript
// Solo de 8 AM a 8 PM Venezuela (12:00 - 00:00 UTC)
schedule: events.Schedule.cron({
  minute: '0,30',
  hour: '12-23',  // 8 AM - 8 PM Venezuela
  weekDay: '*',
}),
```

---

## 🔍 Troubleshooting

### Lambda no se ejecuta

1. **Verificar regla habilitada**:
   ```bash
   aws events describe-rule --name fluxion-klk-inventario-every-30min
   ```

2. **Ver logs de Lambda**:
   ```bash
   aws logs tail /aws/lambda/FluxionStackV2-KLKInventarioTriggerLambda --since 30m
   ```

3. **Verificar permisos**:
   - Lambda debe tener permiso para invocar HTTPS
   - EventBridge debe poder invocar Lambda

### ETL no se ejecuta después de Lambda

1. **Verificar endpoint del backend**:
   ```bash
   curl -X POST https://d1tgnaj74tv17v.cloudfront.net/api/etl/sync \
     -H "Content-Type: application/json" \
     -d '{"ubicacion_id": null}'
   ```

2. **Ver logs de backend**:
   ```bash
   aws logs tail /ecs/fluxion-backend --follow --filter-pattern "ETL"
   ```

3. **Verificar ECS tasks**:
   ```bash
   aws ecs list-tasks --cluster fluxion-cluster
   ```

---

## 📈 Estimación de Costos

### Lambda
- **Invocaciones**: 96/día × 30 días = 2,880/mes
- **Duración**: ~1 segundo por invocación
- **Costo**: ~$0.00 (dentro del free tier: 1M invocaciones gratis)

### ECS Tasks
- **Ejecuciones**: 96/día × 30 días = 2,880/mes
- **Duración promedio**: ~30 segundos por ETL KLK
- **vCPU**: 0.25 vCPU por task
- **Memoria**: 512 MB por task
- **Costo estimado**: ~$3-5/mes

**Total adicional**: ~$3-5/mes

---

## ✅ Checklist de Implementación

- [ ] Agregar Lambdas al CDK stack
- [ ] Agregar EventBridge Rules al CDK stack
- [ ] Hacer deploy vía CDK o GitHub Actions
- [ ] Verificar que las reglas estén habilitadas
- [ ] Test manual de Lambdas
- [ ] Monitorear primera ejecución automática
- [ ] Verificar logs de ECS tasks
- [ ] Confirmar datos en DB (inventario y ventas)
- [ ] Documentar en confluence/wiki interno

---

## 🔗 Referencias

- [ETL Manual Execution Guide](EJECUTAR_ETL_MANUAL.md)
- [KLK Cron Jobs (Local)](../etl/docs/CRON_KLK_REALTIME.md)
- [EventBridge Cron Expressions](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-rule-schedule.html)
- [Lambda Inline Code](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.Code.html#static-fromwbrinlinecode)
