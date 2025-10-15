# EC2 Manual Setup Guide - DuckDB con EBS

Guía paso a paso para lanzar y configurar instancia EC2 manualmente con EBS para DuckDB.

**Objetivo:** Probar EC2 + EBS setup manualmente antes de automatizar con CDK.

**Performance esperada:** Queries de 5s → 200-500ms

---

## 1. Información de Red (Obtenida del Stack Actual)

```bash
VPC ID: vpc-XXXXXXXX (FluxionStackV2)
Subnet Privada 1: subnet-037e5f4a634d0f285 (us-east-1a, 10.0.2.0/24)
Subnet Privada 2: subnet-0802865ce46028087 (us-east-1b, 10.0.3.0/24)
Security Group: sg-011b2226dc2236c06 (FluxionASG InstanceSecurityGroup)
```

---

## 2. Lanzar Instancia EC2 (AWS Console o CLI)

### Opción A: AWS Console

1. Ir a EC2 → Launch Instance
2. **Name:** `fluxion-backend-manual-test`
3. **AMI:** Amazon Linux 2 AMI (HVM) - Kernel 5.10
4. **Instance Type:** `t3.small` (2 vCPU, 2GB RAM)
5. **Key Pair:** Selecciona tu key pair existente
6. **Network:**
   - VPC: Selecciona VPC de FluxionStackV2
   - Subnet: `subnet-037e5f4a634d0f285` (PrivateSubnet1)
   - Auto-assign Public IP: **Disable**
7. **Security Group:** `sg-011b2226dc2236c06`
8. **Storage:**
   - Root volume: 30 GB gp3
   - **Add Volume:** 25 GB gp3, Device: `/dev/sdf`
9. **Advanced → IAM Instance Profile:** Crear uno nuevo con:
   - `AmazonSSMManagedInstanceCore` (para SSM)
   - `AmazonS3ReadOnlyAccess` (para descargar BD)

### Opción B: AWS CLI

```bash
# Obtener VPC ID
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=*FluxionStackV2*" --query 'Vpcs[0].VpcId' --output text)

# Lanzar instancia
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.small \
  --key-name YOUR_KEY_PAIR \
  --subnet-id subnet-037e5f4a634d0f285 \
  --security-group-ids sg-011b2226dc2236c06 \
  --iam-instance-profile Name=EC2-SSM-S3-ReadOnly \
  --block-device-mappings \
    DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3,DeleteOnTermination=true} \
    DeviceName=/dev/sdf,Ebs={VolumeSize=25,VolumeType=gp3,Iops=3000,Throughput=125,DeleteOnTermination=false} \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=fluxion-backend-manual-test},{Key=Purpose,Value=manual-ecs-test}]'
```

---

## 3. Conectarse a la Instancia

```bash
# Via SSM (recomendado - no requiere SSH público)
INSTANCE_ID="i-XXXXXXXXX"
aws ssm start-session --target $INSTANCE_ID

# O via SSH (si configuraste key pair)
ssh -i ~/.ssh/your-key.pem ec2-user@PRIVATE_IP
```

---

## 4. Configurar EBS Volume

```bash
# Verificar que el volumen esté attached
lsblk

# Debería mostrar:
# xvdf    202:80   0   25G  0 disk

# Formatear como ext4 (solo primera vez)
sudo mkfs -t ext4 /dev/xvdf

# Crear directorio de montaje
sudo mkdir -p /mnt/data

# Montar el volumen
sudo mount /dev/xvdf /mnt/data

# Agregar a /etc/fstab para auto-mount
echo "/dev/xvdf /mnt/data ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab

# Verificar montaje
df -h /mnt/data

# Configurar permisos
sudo chmod 755 /mnt/data
sudo chown ec2-user:ec2-user /mnt/data
```

---

## 5. Instalar Docker

```bash
# Actualizar sistema
sudo yum update -y

# Instalar Docker
sudo yum install -y docker

# Iniciar Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Agregar usuario al grupo docker
sudo usermod -aG docker ec2-user

# IMPORTANTE: Logout y login de nuevo para que el cambio tome efecto
exit
# Reconectarse

# Verificar Docker
docker --version
docker ps
```

---

## 6. Descargar Base de Datos de S3

```bash
# Verificar conectividad a S3
aws s3 ls s3://fluxion-backups-v3-611395766952/

# Descargar BD (15GB - tomará 5-10 minutos)
cd /mnt/data
aws s3 cp s3://fluxion-backups-v3-611395766952/production_db_uncompressed_20251011.db \
  ./fluxion_production.db \
  --region us-east-1

# Verificar descarga
ls -lh /mnt/data/fluxion_production.db

# Configurar permisos
chmod 644 /mnt/data/fluxion_production.db
```

---

## 7. Probar DuckDB Directamente (Sin Docker Primero)

```bash
# Instalar DuckDB CLI
cd ~
wget https://github.com/duckdb/duckdb/releases/download/v0.9.2/duckdb_cli-linux-amd64.zip
unzip duckdb_cli-linux-amd64.zip
sudo mv duckdb /usr/local/bin/

# Probar queries
duckdb /mnt/data/fluxion_production.db <<EOF
.timer on
SELECT COUNT(*) FROM ventas;
SELECT tienda_id, SUM(monto_total) FROM ventas WHERE fecha_venta >= '2024-09-01' GROUP BY tienda_id LIMIT 10;
EOF

# 🎯 OBJETIVO: Queries deben tomar < 500ms
```

---

## 8. Ejecutar Backend con Docker

```bash
# Crear directorio para backend
mkdir -p ~/fluxion-backend
cd ~/fluxion-backend

# Obtener imagen del backend (desde ECR)
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Pull imagen
docker pull $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/fluxion-backend:latest

# Ejecutar container montando el EBS volume
docker run -d \
  --name fluxion-backend \
  -p 8001:8001 \
  -v /mnt/data:/mnt/data:rw \
  -e DATABASE_PATH=/mnt/data/fluxion_production.db \
  $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/fluxion-backend:latest

# Verificar logs
docker logs -f fluxion-backend

# Probar endpoint
curl http://localhost:8001/
curl http://localhost:8001/estadisticas
```

---

## 9. Medir Performance

```bash
# Query pesado de ejemplo
time curl -s "http://localhost:8001/ventas?limit=1000&tienda_id=1" | jq '.' > /dev/null

# 🎯 OBJETIVO: < 500ms

# Si funciona bien, tenemos la configuración correcta!
```

---

## 10. Registrar en ECS Cluster (Si Todo Funciona)

```bash
# Instalar ECS agent
sudo yum install -y ecs-init

# Configurar cluster name
sudo bash -c 'echo "ECS_CLUSTER=fluxion-cluster" >> /etc/ecs/ecs.config'
sudo bash -c 'echo "ECS_ENABLE_TASK_IAM_ROLE=true" >> /etc/ecs/ecs.config'

# Iniciar ECS agent
sudo systemctl start ecs
sudo systemctl enable ecs

# Verificar registro
curl -s http://localhost:51678/v1/metadata | jq '.'

# Verificar en AWS Console que la instancia aparezca en ECS Cluster
```

---

## 11. Documentar Resultados

Una vez que todo funcione, documentar:

1. ✅ Performance de queries (tiempo en ms)
2. ✅ Pasos que funcionaron
3. ✅ Configuración exacta de IAM, storage, network
4. ✅ Commands exactos que usamos

**Después:** Codificar todo esto en CDK para automatizar.

---

## Troubleshooting

### EBS no se monta
```bash
# Verificar que está attached
lsblk

# Si no aparece, verificar en AWS Console que el volumen esté attached
```

### Docker no inicia
```bash
sudo systemctl status docker
sudo journalctl -u docker
```

### No puede descargar de S3
```bash
# Verificar IAM role
aws sts get-caller-identity
aws s3 ls  # Debe funcionar

# Si falla, agregar IAM policy S3ReadOnlyAccess al instance profile
```

### ECS agent no se registra
```bash
# Verificar logs
sudo cat /var/log/ecs/ecs-agent.log

# Verificar IAM permissions
# Necesita: AmazonEC2ContainerServiceforEC2Role
```

---

**Next Steps:** Una vez funcionando, automatizar en CDK usando esta configuración probada.
