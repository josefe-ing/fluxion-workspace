# Configurar Sentry en AWS ECS

## Problema Detectado

Los ETLs en ECS no están reportando a Sentry porque falta la variable de entorno `SENTRY_DSN`.

Log del error:
```
⚠️  SENTRY_DSN no configurado - monitoreo deshabilitado
```

## Solución: Agregar SENTRY_DSN a Task Definitions

### Opción 1: Vía AWS Console (Rápido)

1. **Backend Task Definition**:
   ```
   AWS Console > ECS > Task Definitions > fluxion-backend-task
   ```
   - Click "Create new revision"
   - En "Environment variables" agregar:
     ```
     Name: SENTRY_DSN
     Value: https://3c6d41d5d95beceff8239cc7978c5db6@o4510234583760896.ingest.us.sentry.io/4510235066105856
     ```
   - Click "Create"
   - Actualizar el servicio para usar la nueva revisión

2. **ETL Task Definition**:
   ```
   AWS Console > ECS > Task Definitions > fluxion-etl-task
   ```
   - Click "Create new revision"
   - En "Environment variables" agregar:
     ```
     Name: SENTRY_DSN
     Value: https://3c6d41d5d95beceff8239cc7978c5db6@o4510234583760896.ingest.us.sentry.io/4510235066105856
     ```
   - Click "Create"

3. **ETL Histórico Task Definition**:
   ```
   AWS Console > ECS > Task Definitions > fluxion-etl-historico-task
   ```
   - Repetir el mismo proceso

### Opción 2: Vía CDK Deploy (Producción)

1. **Set environment variable antes del deploy**:
   ```bash
   export SENTRY_DSN="https://3c6d41d5d95beceff8239cc7978c5db6@o4510234583760896.ingest.us.sentry.io/4510235066105856"

   cd infrastructure
   npx cdk deploy --all
   ```

2. **O agregar al .env de infrastructure**:
   ```bash
   cd infrastructure
   echo 'SENTRY_DSN=https://3c6d41d5d95beceff8239cc7978c5db6@o4510234583760896.ingest.us.sentry.io/4510235066105856' >> .env
   npx cdk deploy --all
   ```

### Opción 3: Vía AWS Secrets Manager (Recomendado para Producción)

Ya tenemos el secret configurado en AWS Secrets Manager. Actualizar la task definition para leer desde ahí:

```typescript
// En infrastructure-stack.ts, cambiar de:
environment: {
  SENTRY_DSN: process.env.SENTRY_DSN || '',
}

// A usar secrets:
secrets: {
  SENTRY_DSN: ecs.Secret.fromSecretsManager(fluxionSecret, 'SENTRY_DSN'),
}
```

Luego hacer deploy:
```bash
cd infrastructure
npx cdk deploy --all
```

## Verificar que Funcionó

Después de actualizar, ejecuta un ETL y deberías ver en los logs:

```
✅ Sentry ETL monitoring available
✅ Sentry ETL monitoring inicializado
📊 Sentry monitoring iniciado: inventario_tienda
```

Y los errores aparecerán en: https://sentry.io

## Variables de Entorno Necesarias en ECS

### Backend Task (`fluxion-backend-task`)
```bash
SENTRY_DSN=https://3c6d41d5d95beceff8239cc7978c5db6@o4510234583760896.ingest.us.sentry.io/4510235066105856
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

### ETL Tasks (`fluxion-etl-task`, `fluxion-etl-historico-task`)
```bash
SENTRY_DSN=https://3c6d41d5d95beceff8239cc7978c5db6@o4510234583760896.ingest.us.sentry.io/4510235066105856
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

## Comandos Útiles

### Ver task definition actual:
```bash
aws ecs describe-task-definition --task-definition fluxion-etl-task --query 'taskDefinition.containerDefinitions[0].environment'
```

### Actualizar servicio para usar nueva revisión:
```bash
aws ecs update-service \
  --cluster fluxion-cluster \
  --service fluxion-backend-service \
  --task-definition fluxion-backend-task:NEW_REVISION \
  --force-new-deployment
```

## Troubleshooting

### Sentry sigue sin funcionar después de agregar SENTRY_DSN

1. Verifica que el contenedor se reinició:
   ```bash
   aws ecs list-tasks --cluster fluxion-cluster --service-name fluxion-backend-service
   ```

2. Revisa los logs para ver la variable:
   ```bash
   aws logs tail /ecs/fluxion-backend --follow
   ```

3. Asegúrate de que la task definition tiene la última revisión:
   ```bash
   aws ecs describe-services --cluster fluxion-cluster --services fluxion-backend-service | grep taskDefinition
   ```

## Próximos Pasos

Después de configurar Sentry DSN:

1. ✅ Los errores de ETL aparecerán automáticamente en Sentry
2. ✅ Configurar alertas en Sentry para notificaciones
3. ✅ Integrar con Slack para recibir alertas en tiempo real
4. ✅ Revisar el dashboard de Sentry diariamente

---

**Nota**: El DSN mostrado aquí es el de desarrollo/backend. Para frontend usa el DSN específico del proyecto frontend en Sentry.
