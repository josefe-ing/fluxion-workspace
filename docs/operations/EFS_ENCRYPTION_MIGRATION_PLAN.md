# Plan de Migración a EFS Cifrado
**Estado:** PENDIENTE APROBACIÓN
**Prioridad:** CRÍTICA (Seguridad de datos)
**Downtime Estimado:** 30-45 minutos
**Fecha Propuesta:** TBD

---

## Resumen

Migrar de EFS sin cifrado a EFS con cifrado KMS para proteger 16GB de datos de producción.

**Razón:** El EFS actual almacena la base de datos de producción (81M+ registros) SIN CIFRADO. Esto es un riesgo de seguridad crítico.

---

## Opción A - Migración Completa (RECOMENDADO)

### Pros
✅ Cifrado completo con KMS
✅ Rotación automática de keys
✅ Cumple con mejores prácticas de seguridad
✅ CloudFront OAI (bonus: mejor seguridad en S3)

### Contras
❌ Requiere downtime de 30-45 minutos
❌ Proceso no reversible fácilmente
❌ Requiere coordinación de deploy

---

## Pre-requisitos

### 1. Backup Completo
```bash
# Crear backup ANTES de migración
aws s3 cp /mnt/efs/fluxion-data/fluxion_production.db \
  s3://fluxion-backups-611395766952/pre-migration-backup/$(date +%Y%m%d_%H%M%S)_fluxion_production.db

# Verificar backup
aws s3 ls s3://fluxion-backups-611395766952/pre-migration-backup/ --human-readable
```

### 2. Instancia EC2 Temporal
Necesitamos una instancia EC2 en la misma VPC para montar ambos EFS y copiar datos.

```bash
# Crear instancia temporal (t3.medium para copia rápida)
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.medium \
  --subnet-id <PRIVATE_SUBNET_ID> \
  --security-group-ids <EFS_SECURITY_GROUP> \
  --iam-instance-profile Name=FluxionMigrationRole \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=fluxion-migration-temp}]'
```

### 3. Rol IAM para Migración
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "elasticfilesystem:DescribeFileSystems",
        "elasticfilesystem:DescribeMountTargets",
        "efs:ClientMount",
        "efs:ClientWrite"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:Encrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:us-east-1:ACCOUNT_ID:key/*"
    }
  ]
}
```

---

## Pasos Detallados

### Fase 1: Preparación (Sin Downtime)

#### 1.1 Deploy del Nuevo EFS Cifrado
```bash
cd infrastructure

# Build
npm run build

# Preview cambios (SIN aplicar)
cdk diff

# Si todo se ve bien, deploy SOLO el nuevo EFS
# Esto NO afecta el servicio actual
cdk deploy --require-approval never
```

**Outputs esperados:**
- `EFSFileSystemId`: fs-NUEVO123
- `EFSEncryptionKeyArn`: arn:aws:kms:us-east-1:ACCOUNT:key/NUEVO

#### 1.2 Crear Instancia de Migración
```bash
# SSH a instancia
ssh ec2-user@<INSTANCE_IP>

# Instalar herramientas
sudo yum install -y amazon-efs-utils rsync
```

### Fase 2: Migración (CON Downtime - 30-45 min)

⚠️ **IMPORTANTE:** A partir de aquí el servicio estará OFFLINE

#### 2.1 Detener Servicio Backend (T+0 min)
```bash
# Escalar a 0 tasks
aws ecs update-service \
  --cluster fluxion-cluster \
  --service FluxionBackendService \
  --desired-count 0

# Esperar confirmación
aws ecs wait services-stable \
  --cluster fluxion-cluster \
  --services FluxionBackendService
```

#### 2.2 Montar Ambos EFS (T+2 min)
```bash
# En instancia de migración
sudo mkdir -p /mnt/efs-old /mnt/efs-new

# Montar EFS antiguo
sudo mount -t efs -o tls fs-VIEJO123:/ /mnt/efs-old

# Montar EFS nuevo
sudo mount -t efs -o tls fs-NUEVO123:/ /mnt/efs-new

# Verificar montajes
df -h | grep efs
```

#### 2.3 Copiar Datos (T+5 min → T+25 min)
```bash
# Copiar con rsync (muestra progreso)
sudo rsync -avz --progress \
  /mnt/efs-old/fluxion-data/ \
  /mnt/efs-new/fluxion-data/

# Output esperado:
# fluxion_production.db
#   16,123,456,789 100%  678.90MB/s  0:00:23 (xfr#1, to-chk=0/1)
```

#### 2.4 Verificar Integridad (T+25 min → T+28 min)
```bash
# Checksum OLD
OLD_MD5=$(sudo md5sum /mnt/efs-old/fluxion-data/fluxion_production.db | cut -d' ' -f1)

# Checksum NEW
NEW_MD5=$(sudo md5sum /mnt/efs-new/fluxion-data/fluxion_production.db | cut -d' ' -f1)

# Comparar
if [ "$OLD_MD5" == "$NEW_MD5" ]; then
  echo "✅ Checksums COINCIDEN: $OLD_MD5"
else
  echo "❌ ERROR: Checksums NO coinciden!"
  echo "OLD: $OLD_MD5"
  echo "NEW: $NEW_MD5"
  exit 1
fi
```

#### 2.5 Desmontar (T+28 min → T+30 min)
```bash
sudo umount /mnt/efs-old
sudo umount /mnt/efs-new
```

#### 2.6 Actualizar Stack CDK (T+30 min → T+35 min)
```bash
cd infrastructure

# Editar bin/infrastructure.ts
# Cambiar:
#   new InfrastructureStack(app, 'InfrastructureStack', { ... });
# Por:
#   new InfrastructureStackEncrypted(app, 'InfrastructureStack', { ... });

npm run build
cdk diff  # Verificar cambios
cdk deploy --require-approval never
```

**Cambios que aplicará CDK:**
- Actualizar Task Definition para usar nuevo EFS ID
- Agregar permisos KMS al Task Role
- Actualizar CloudFront con OAI
- Cambiar S3 bucket policy

#### 2.7 Forzar Nuevo Deployment (T+35 min → T+40 min)
```bash
# Forzar recreación de tasks con nuevo EFS
aws ecs update-service \
  --cluster fluxion-cluster \
  --service FluxionBackendService \
  --desired-count 1 \
  --force-new-deployment

# Esperar a que esté stable
aws ecs wait services-stable \
  --cluster fluxion-cluster \
  --services FluxionBackendService
```

### Fase 3: Verificación (T+40 min → T+45 min)

#### 3.1 Health Check
```bash
# Obtener ALB DNS
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names fluxion-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

# Test health endpoint
curl "http://${ALB_DNS}/"

# Output esperado:
# {"status":"OK","service":"Fluxion AI - La Granja Mercado API",
#  "timestamp":"...","database":"DuckDB Connected"}
```

#### 3.2 Validar Datos
```bash
# Test query de productos
curl "http://${ALB_DNS}/api/productos?limit=5"

# Debe retornar 5 productos
```

#### 3.3 Verificar Cifrado
```bash
# Confirmar que EFS nuevo tiene cifrado
aws efs describe-file-systems \
  --file-system-id fs-NUEVO123 \
  --query 'FileSystems[0].Encrypted'

# Output: true
```

### Fase 4: Cleanup

#### 4.1 Eliminar Instancia Temporal
```bash
aws ec2 terminate-instances --instance-ids i-MIGRATION123
```

#### 4.2 Eliminar EFS Antiguo (Opcional - después de 7 días)
```bash
# Eliminar mount targets primero
aws efs describe-mount-targets \
  --file-system-id fs-VIEJO123 \
  --query 'MountTargets[*].MountTargetId' \
  --output text | \
  xargs -n 1 aws efs delete-mount-target --mount-target-id

# Esperar 30 segundos
sleep 30

# Eliminar EFS
aws efs delete-file-system --file-system-id fs-VIEJO123
```

---

## Plan de Rollback

Si algo sale mal durante la migración:

### Escenario 1: Falla durante la copia
```bash
# 1. Desmontar EFS
sudo umount /mnt/efs-new

# 2. Reiniciar servicio con EFS antiguo
aws ecs update-service \
  --cluster fluxion-cluster \
  --service FluxionBackendService \
  --desired-count 1

# 3. NO hacer deploy de CDK
```

### Escenario 2: Falla después del deploy CDK
```bash
# 1. Hacer rollback del stack
cdk deploy InfrastructureStack --rollback

# 2. O revertir manualmente el commit
git revert HEAD
git push
# GitHub Actions hará el deploy automático
```

### Escenario 3: Servicio no arranca con nuevo EFS
```bash
# 1. Verificar logs
aws logs tail /aws/ecs/fluxion-backend --follow

# 2. Si es problema de permisos KMS
aws iam attach-role-policy \
  --role-name FluxionBackendTask-TaskRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonElasticFileSystemClientFullAccess

# 3. Forzar nuevo deployment
aws ecs update-service \
  --cluster fluxion-cluster \
  --service FluxionBackendService \
  --force-new-deployment
```

---

## Checklist Pre-Migración

- [ ] Backup completo en S3
- [ ] Verificar que backup es válido (descargar y abrir con DuckDB)
- [ ] Notificar a equipo (si aplica) sobre downtime
- [ ] Crear instancia EC2 de migración
- [ ] Deploy de nuevo EFS (Fase 1)
- [ ] Verificar que nuevo EFS está montado correctamente
- [ ] Tener plan de rollback listo
- [ ] Definir ventana de mantenimiento (ej: domingo 2am)

## Checklist Post-Migración

- [ ] Servicio backend respondiendo
- [ ] Health check passing
- [ ] API devolviendo datos correctos
- [ ] Verificar cifrado habilitado en EFS nuevo
- [ ] Verificar CloudFront con HTTPS
- [ ] Monitorear logs por 24 horas
- [ ] Después de 7 días sin issues, eliminar EFS antiguo

---

## Costos

**Nuevos recursos:**
- KMS Key: $1/mes + $0.03 por 10k requests
- EFS cifrado: Mismo costo que actual (~$50/mes por 16GB)
- Instancia EC2 temporal: ~$0.042/hora × 1 hora = $0.042

**Total adicional:** ~$1.50/mes

---

## Recomendación Final

✅ **PROCEDER CON MIGRACIÓN**

**Razones:**
1. Datos sensibles sin protección es riesgo crítico
2. Downtime planificado es aceptable (30-45 min)
3. Plan de rollback claro
4. Backup completo antes de empezar
5. Proceso bien documentado

**Ventana sugerida:**
Domingo 3:00 AM - 4:00 AM (UTC-4)

---

## Contacto de Soporte

Si algo sale mal durante la migración:
- AWS Support: +1-866-800-3980
- Documentación EFS: https://docs.aws.amazon.com/efs/
- Stack Overflow tag: [amazon-efs]

---

**Aprobación requerida antes de proceder**
