# 🚀 ETL Deployment - Pasos de Implementación

**Fecha**: 2025-10-12
**Estado**: ✅ Configuración CDK Completada - Listo para Deploy

---

## ✅ COMPLETADO

### 1. Dockerfile ETL (Production-Ready)
- ✅ Soporte multi-arquitectura (ARM64 local + AMD64 AWS)
- ✅ Driver SQL Server oficial + FreeTDS fallback
- ✅ AWS CLI instalado
- ✅ Usuario no-root (UID 1000) para EFS
- ✅ Script de entrada con Secrets Manager integration
- ✅ Health checks implementados
- **Ubicación**: `/etl/Dockerfile`

### 2. Startup Script
- ✅ Lee credenciales SQL desde Secrets Manager
- ✅ Verifica conectividad VPN
- ✅ Manejo de errores robusto
- **Ubicación**: `/etl/startup-etl.sh`

### 3. Configuración CDK
- ✅ ECR Repository creado
- ✅ Secret de SQL Server configurado
- ✅ Task Definition (4GB RAM / 2 vCPU)
- ✅ Security Group con acceso a red 192.168.0.0/16
- ✅ EventBridge scheduler (DESHABILITADO - testing primero)
- ✅ Outputs para ECR URI y Task ARN
- **Ubicación**: `/infrastructure/lib/infrastructure-stack.ts`

### 4. Testing Local
- ✅ Build exitoso para ARM64
- ✅ Health check passed
- ✅ Todas las dependencias funcionando

---

## 📋 CONFIGURACIÓN FINAL

```yaml
Frecuencia: Cada 4 horas (6 veces/día)
Tiendas: Solo tienda_08 (BOSQUE) para testing inicial
Recursos: 4GB RAM, 2 vCPU
Scheduler: DESHABILITADO (habilitaremos después de test manual)
```

---

## 🎯 PRÓXIMOS PASOS

### PASO 1: Build Imagen para AMD64

```bash
cd /Users/jose/Developer/fluxion-workspace/etl

# Build para arquitectura AWS (amd64)
docker buildx build --platform linux/amd64 -t fluxion-etl:prod-amd64 .
```

**Tiempo estimado**: 5-10 minutos
**Tamaño esperado**: ~1.4 GB

---

### PASO 2: Obtener URI del ECR Repository

Necesitamos hacer deploy del CDK primero para obtener la URI del ECR:

```bash
cd /Users/jose/Developer/fluxion-workspace/infrastructure

# Ver cambios antes de aplicar
cdk diff

# Deploy (crear ECR repository)
cdk deploy
```

**Durante el deploy verás**:
- ✅ Se crea el ECR repository
- ✅ Se crea el Secret de SQL
- ✅ Se crea la Task Definition
- ✅ Se crea el Security Group
- ⚠️ NO se ejecutará el ETL (scheduler deshabilitado)

**Outputs esperados**:
```
Outputs:
InfrastructureStack.ETLRepositoryURI = 611395766952.dkr.ecr.us-east-1.amazonaws.com/fluxion-etl
InfrastructureStack.ETLTaskDefinitionArn = arn:aws:ecs:...
InfrastructureStack.ETLLogGroup = /aws/ecs/fluxion-etl
```

---

### PASO 3: Login a ECR y Push Imagen

```bash
# 1. Obtener el URI del output (reemplaza con tu valor real)
ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name InfrastructureStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ETLRepositoryURI`].OutputValue' \
  --output text)

echo "ECR URI: $ECR_URI"

# 2. Login a ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_URI

# 3. Tag la imagen
docker tag fluxion-etl:prod-amd64 $ECR_URI:latest

# 4. Push a ECR
docker push $ECR_URI:latest
```

**Tiempo estimado**: 3-5 minutos (upload de 1.4GB)

---

### PASO 4: Test Manual del ETL

Ahora que la imagen está en ECR, vamos a ejecutar el ETL manualmente:

```bash
# 1. Obtener información del cluster
CLUSTER_NAME=$(aws cloudformation describe-stacks \
  --stack-name InfrastructureStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ClusterName`].OutputValue' \
  --output text)

TASK_DEF_ARN=$(aws cloudformation describe-stacks \
  --stack-name InfrastructureStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ETLTaskDefinitionArn`].OutputValue' \
  --output text)

# 2. Obtener subnet y security group IDs
SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=tag:Name,Values=*Private*" \
  --query 'Subnets[0].SubnetId' \
  --output text)

SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=*ETLSecurityGroup*" \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

# 3. Ejecutar task manualmente
aws ecs run-task \
  --cluster $CLUSTER_NAME \
  --task-definition $TASK_DEF_ARN \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[$SUBNET_ID],
    securityGroups=[$SG_ID],
    assignPublicIp=DISABLED
  }"

# Guardar el TASK_ID del output
```

**Tiempo estimado**: 5-15 minutos para completar

---

### PASO 5: Monitorear Ejecución

#### Ver logs en tiempo real:

```bash
# Ver logs del ETL (reemplaza el timestamp con el actual)
aws logs tail /aws/ecs/fluxion-etl --follow --since 10m
```

#### Verificar estado del task:

```bash
# Listar tasks en ejecución
aws ecs list-tasks --cluster $CLUSTER_NAME

# Describir un task específico (reemplaza TASK_ID)
aws ecs describe-tasks \
  --cluster $CLUSTER_NAME \
  --tasks <TASK_ID>
```

**Logs esperados**:
```
🚀 Fluxion ETL - Starting
🔐 Loading SQL credentials from AWS Secrets Manager...
✅ SQL credentials loaded successfully
✅ DuckDB found: 16G
✅ Write permissions verified for /data
🌐 Testing VPN connectivity to La Granja...
✅ VPN connectivity OK (reached 192.168.150.10:14348)
▶️  Executing: python3 etl_inventario.py --tiendas tienda_08
...
🏪 Procesando: BOSQUE
📥 Extrayendo datos...
🔄 Transformando datos...
💾 Cargando a DuckDB...
✅ ETL completed successfully
```

---

### PASO 6: Verificar Datos en DuckDB

Una vez completado el ETL, verificar que los datos se cargaron:

```bash
# 1. Obtener URL del backend
BACKEND_URL=$(aws cloudformation describe-stacks \
  --stack-name InfrastructureStack \
  --query 'Stacks[0].Outputs[?OutputKey==`BackendURL`].OutputValue' \
  --output text)

# 2. Verificar ubicaciones
curl $BACKEND_URL/api/ubicaciones | jq

# 3. Verificar estadísticas (debe mostrar datos de tienda_08)
curl $BACKEND_URL/api/estadisticas | jq

# 4. Verificar inventario específico
curl "$BACKEND_URL/api/inventario?ubicacion_id=tienda_08" | jq | head -50
```

**Esperado**:
- Ver tienda_08 (BOSQUE) en la lista de ubicaciones
- Ver productos con stock actual
- Ver timestamp reciente de última actualización

---

### PASO 7: Habilitar Scheduler (Si todo funciona)

Si el test manual fue exitoso, habilitar el scheduler automático:

```typescript
// En infrastructure/lib/infrastructure-stack.ts, línea ~634
// Cambiar:
enabled: false,

// Por:
enabled: true,
```

Luego redeploy:

```bash
cd infrastructure
cdk deploy
```

**Ahora el ETL correrá automáticamente cada 4 horas** ✅

---

## 🚨 TROUBLESHOOTING

### Error: "Task failed to start"

**Posibles causas**:
1. Imagen no existe en ECR
2. Permisos IAM insuficientes
3. Subnet/Security Group incorrectos

**Solución**:
```bash
# Verificar que la imagen existe
aws ecr describe-images --repository-name fluxion-etl

# Verificar logs de CloudWatch
aws logs filter-log-events \
  --log-group-name /aws/ecs/fluxion-etl \
  --start-time $(date -u -d '10 minutes ago' +%s)000
```

---

### Error: "Cannot connect to SQL Server"

**Posibles causas**:
1. VPN WireGuard está down
2. Security Group no permite tráfico
3. Credenciales incorrectas

**Solución**:
```bash
# 1. Verificar VPN
aws ssm start-session --target i-0831b29e47bdadd07
# Dentro del EC2:
sudo wg show

# 2. Test conectividad desde el ETL task
# Usar ECS Exec para conectar al container:
aws ecs execute-command \
  --cluster $CLUSTER_NAME \
  --task <TASK_ID> \
  --container etl \
  --interactive \
  --command "/bin/bash"

# Dentro del container:
nc -zv 192.168.150.10 14348
```

---

### Error: "No space left on device"

**Causa**: DuckDB muy grande en EFS

**Solución**:
```bash
# Verificar tamaño del EFS
aws efs describe-file-systems \
  --file-system-id <FS_ID> \
  --query 'FileSystems[0].SizeInBytes'

# Limpiar datos antiguos si es necesario
```

---

## 📊 MONITOREO POST-DEPLOYMENT

### Métricas a Vigilar

1. **Task Success Rate**
   ```bash
   # Ver tasks fallidos en las últimas 24h
   aws ecs describe-tasks \
     --cluster $CLUSTER_NAME \
     --tasks $(aws ecs list-tasks --cluster $CLUSTER_NAME --query 'taskArns[]' --output text) \
     --query 'tasks[?lastStatus==`STOPPED` && stopCode!=`EssentialContainerExited`]'
   ```

2. **ETL Duration**
   ```bash
   # Ver duración de última ejecución en logs
   aws logs filter-log-events \
     --log-group-name /aws/ecs/fluxion-etl \
     --filter-pattern "Duration" \
     --limit 10
   ```

3. **Data Freshness**
   ```bash
   # Verificar timestamp de última actualización
   curl "$BACKEND_URL/api/ubicaciones" | \
     jq '.[] | select(.id=="tienda_08") | .ultima_actualizacion'
   ```

---

## 📋 CHECKLIST PRE-DEPLOYMENT

- [ ] VPN WireGuard funcionando ✅
- [ ] EFS montado y accesible ✅
- [ ] Backend service corriendo ✅
- [ ] Dockerfile ETL listo ✅
- [ ] Startup script configurado ✅
- [ ] CDK code agregado ✅
- [ ] Build local exitoso ✅
- [ ] Build para AMD64 pendiente ⏳
- [ ] ECR login configurado ⏳
- [ ] Imagen pushed a ECR ⏳

---

## 📋 CHECKLIST POST-DEPLOYMENT

- [ ] CDK deploy exitoso
- [ ] ECR repository creado
- [ ] Secret SQL creado
- [ ] Task definition registrada
- [ ] Test manual ETL exitoso
- [ ] Logs visibles en CloudWatch
- [ ] Datos cargados en DuckDB
- [ ] Backend API muestra datos actualizados
- [ ] Scheduler habilitado
- [ ] Primera ejecución automática exitosa

---

## 🎉 SUCCESS CRITERIA

El deployment es exitoso cuando:

1. ✅ ETL task completa sin errores (exit code 0)
2. ✅ Logs muestran "ETL completed successfully"
3. ✅ DuckDB tiene datos de tienda_08
4. ✅ Backend API retorna inventario actualizado
5. ✅ Duración < 15 minutos
6. ✅ No hay errores en CloudWatch

---

## 📞 SOPORTE

**Documentación relacionada**:
- [docs/ETL_ECS_CONFIGURATION.md](./ETL_ECS_CONFIGURATION.md) - Arquitectura completa
- [docs/infrastructure/vpn-setup-complete.md](./infrastructure/vpn-setup-complete.md) - Setup VPN
- [etl/README.md](../etl/README.md) - ETL documentation

**Archivos clave**:
- [etl/Dockerfile](../etl/Dockerfile)
- [etl/startup-etl.sh](../etl/startup-etl.sh)
- [infrastructure/lib/infrastructure-stack.ts](../infrastructure/lib/infrastructure-stack.ts)

---

**Próximo comando a ejecutar**:
```bash
cd /Users/jose/Developer/fluxion-workspace/etl
docker buildx build --platform linux/amd64 -t fluxion-etl:prod-amd64 .
```
