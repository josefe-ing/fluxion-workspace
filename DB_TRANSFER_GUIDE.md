# Guía: Transferir BD DuckDB a EFS

## Estado Actual

✅ **Paso 1 COMPLETADO**: Subida a S3 en progreso
- Archivo: `fluxion_production.db` (15GB)
- Destino: `s3://fluxion-backups-611395766952/transfer/`
- Progreso: Monitoreado en `/tmp/s3-upload.log`

## Opción Recomendada: Usar ECS Exec

Ya que tienes el backend corriendo en ECS con EFS montado, la manera más simple es usar **ECS Exec** para conectarte al container del backend y descargar desde S3.

### Pasos:

#### 1. Habilitar ECS Exec (ya configurado en el task definition)

El task definition ya tiene `enableExecuteCommand: true`

#### 2. Conectarse al container del backend

```bash
# Obtener el task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster fluxion-cluster \
  --service-name $(aws ecs list-services --cluster fluxion-cluster --query 'serviceArns[0]' --output text | xargs basename) \
  --query 'taskArns[0]' \
  --output text)

# Conectarse al container
aws ecs execute-command \
  --cluster fluxion-cluster \
  --task $TASK_ARN \
  --container backend \
  --interactive \
  --command "/bin/bash"
```

#### 3. Dentro del container, descargar la BD

```bash
# Verificar que EFS está montado
ls -lh /data

# Descargar de S3 (dentro del container)
aws s3 cp s3://fluxion-backups-611395766952/transfer/fluxion_production.db /data/fluxion_production.db

# Verificar
ls -lh /data/fluxion_production.db
```

#### 4. Reiniciar el servicio ECS para que use la nueva BD

```bash
# Salir del container (Ctrl+D)

# Forzar nuevo deployment del servicio
aws ecs update-service \
  --cluster fluxion-cluster \
  --service $(aws ecs list-services --cluster fluxion-cluster --query 'serviceArns[0]' --output text | xargs basename) \
  --force-new-deployment
```

## Alternativa: Lanzar EC2 Temporal

Si prefieres usar EC2:

### 1. Crear EC2 instance con EFS montado

```bash
cd infrastructure

# Descomentar líneas de EC2 transfer instance en infrastructure-stack.ts
# (si las agregamos)

cdk deploy FluxionStack
```

### 2. Conectarse via Systems Manager

```bash
# Obtener instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=fluxion-transfer" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

# Conectarse
aws ssm start-session --target $INSTANCE_ID
```

### 3. Ejecutar script de transferencia

```bash
# Dentro de la instancia
bash /tmp/transfer_db_s3_to_efs.sh
```

## Verificación Final

```bash
# Probar el API
curl http://fluxion-alb-1881437163.us-east-1.elb.amazonaws.com/ | jq '.'

# Debe mostrar: "database": "Connected" en lugar de "Database Missing"
```

## Monitoreo de la Subida a S3

```bash
# En tu Mac, monitorear progreso
tail -f /tmp/s3-upload.log

# O verificar en S3
aws s3 ls s3://fluxion-backups-611395766952/transfer/ --human-readable
```

## Tiempo Estimado

- **Subida a S3**: ~1.5 horas (3 MiB/s desde tu Mac)
- **S3 → EFS**: ~5-10 minutos (red interna AWS, muy rápido)
- **Total**: ~1.5-2 horas

## Costos

- **S3 Storage**: $0.35/mes (15GB * $0.023/GB)
- **Transfer S3→EFS**: Gratis (mismo region)
- **EC2 t3.micro** (si usas): $0.01/hora (puedes terminarla después)
