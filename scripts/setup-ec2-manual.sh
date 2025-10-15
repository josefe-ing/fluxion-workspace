#!/bin/bash
# Setup script para EC2 manual con EBS y DuckDB
# Ejecutar este script DENTRO de la instancia EC2 via SSM

set -e  # Exit on error
set -x  # Show commands

echo "=========================================="
echo "=== Fluxion EC2 Manual Setup ==="
echo "=========================================="
echo "Timestamp: $(date)"
echo ""

# Step 1: Configurar EBS Volume
echo "=== STEP 1: Configurando EBS Volume ==="
echo "Verificando volumen /dev/xvdf..."
lsblk

if ! file -s /dev/xvdf | grep -q ext4; then
  echo "Formateando volumen como ext4..."
  sudo mkfs -t ext4 /dev/xvdf
else
  echo "✅ Volumen ya tiene filesystem ext4"
fi

echo "Creando punto de montaje..."
sudo mkdir -p /mnt/data

echo "Montando volumen..."
sudo mount /dev/xvdf /mnt/data

echo "Agregando a /etc/fstab..."
if ! grep -q "/dev/xvdf" /etc/fstab; then
  echo "/dev/xvdf /mnt/data ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
fi

echo "Configurando permisos..."
sudo chmod 755 /mnt/data
sudo chown ec2-user:ec2-user /mnt/data

echo "Verificando montaje..."
df -h /mnt/data

echo "✅ EBS Volume configurado"
echo ""

# Step 2: Actualizar sistema e instalar Docker
echo "=== STEP 2: Instalando Docker ==="
echo "Actualizando sistema..."
sudo yum update -y

echo "Instalando Docker..."
sudo yum install -y docker

echo "Iniciando Docker service..."
sudo systemctl start docker
sudo systemctl enable docker

echo "Agregando usuario al grupo docker..."
sudo usermod -aG docker ec2-user

echo "✅ Docker instalado (NOTA: Necesitas reconectarte para usar docker sin sudo)"
docker --version
echo ""

# Step 3: Descargar BD de S3
echo "=== STEP 3: Descargando Base de Datos de S3 ==="
cd /mnt/data

echo "Verificando que la BD NO exista ya..."
if [ -f /mnt/data/fluxion_production.db ]; then
  echo "⚠️  BD ya existe, saltando descarga"
  ls -lh /mnt/data/fluxion_production.db
else
  echo "Descargando BD desde S3 (15GB - tomará 5-10 minutos)..."
  echo "Bucket: s3://fluxion-backups-v3-611395766952/"

  aws s3 cp s3://fluxion-backups-v3-611395766952/production_db_uncompressed_20251011.db \
    /mnt/data/fluxion_production.db \
    --region us-east-1

  echo "✅ BD descargada!"
  ls -lh /mnt/data/fluxion_production.db

  echo "Configurando permisos..."
  chmod 644 /mnt/data/fluxion_production.db
fi
echo ""

# Step 4: Instalar DuckDB CLI para testing
echo "=== STEP 4: Instalando DuckDB CLI ==="
cd ~
if [ ! -f /usr/local/bin/duckdb ]; then
  echo "Descargando DuckDB..."
  wget -q https://github.com/duckdb/duckdb/releases/download/v0.9.2/duckdb_cli-linux-amd64.zip
  unzip -q duckdb_cli-linux-amd64.zip
  sudo mv duckdb /usr/local/bin/
  rm duckdb_cli-linux-amd64.zip
  echo "✅ DuckDB CLI instalado"
else
  echo "✅ DuckDB CLI ya instalado"
fi

duckdb --version
echo ""

# Step 5: Probar queries de performance
echo "=== STEP 5: Probando Performance con DuckDB ==="
echo "Ejecutando queries de prueba..."
echo ""

duckdb /mnt/data/fluxion_production.db <<EOF
.timer on
SELECT '=== Query 1: Count total de ventas ===' as test;
SELECT COUNT(*) as total_ventas FROM ventas;

SELECT '=== Query 2: Ventas por tienda (últimos 30 días) ===' as test;
SELECT
  tienda_id,
  COUNT(*) as num_ventas,
  SUM(monto_total) as total
FROM ventas
WHERE fecha_venta >= '2024-09-01'
GROUP BY tienda_id
LIMIT 10;

SELECT '=== Query 3: Top 10 productos más vendidos ===' as test;
SELECT
  producto_id,
  COUNT(*) as veces_vendido,
  SUM(cantidad) as cantidad_total
FROM ventas
WHERE fecha_venta >= '2024-09-01'
GROUP BY producto_id
ORDER BY cantidad_total DESC
LIMIT 10;
EOF

echo ""
echo "🎯 OBJETIVO: Queries deben completar en < 500ms"
echo ""

# Step 6: Información para siguiente paso
echo "=========================================="
echo "=== Setup Completado! ==="
echo "=========================================="
echo ""
echo "✅ EBS volume montado en /mnt/data"
echo "✅ Docker instalado"
echo "✅ BD descargada (15GB)"
echo "✅ DuckDB CLI instalado y probado"
echo ""
echo "SIGUIENTE PASO: Ejecutar backend con Docker"
echo ""
echo "Para ejecutar el backend:"
echo "1. Reconéctate a la instancia (para que docker funcione sin sudo)"
echo "2. Ejecuta: ~/run-backend.sh"
echo ""

# Create backend runner script
cat > ~/run-backend.sh <<'BACKEND_SCRIPT'
#!/bin/bash
set -e

echo "=== Ejecutando Backend Fluxion con Docker ==="

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account: $AWS_ACCOUNT_ID"

# Login to ECR
echo "Login a ECR..."
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com

# Pull latest image
echo "Pulling imagen del backend..."
docker pull ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/fluxion-backend:latest

# Stop and remove old container if exists
docker stop fluxion-backend 2>/dev/null || true
docker rm fluxion-backend 2>/dev/null || true

# Run backend container
echo "Iniciando container..."
docker run -d \
  --name fluxion-backend \
  -p 8001:8001 \
  -v /mnt/data:/mnt/data:rw \
  -e DATABASE_PATH=/mnt/data/fluxion_production.db \
  ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/fluxion-backend:latest

echo ""
echo "✅ Backend iniciado!"
echo ""
echo "Esperando 5 segundos..."
sleep 5

echo "Logs del container:"
docker logs fluxion-backend

echo ""
echo "Probando endpoint..."
curl -s http://localhost:8001/ | head -10

echo ""
echo "=========================================="
echo "Backend corriendo en http://localhost:8001"
echo "=========================================="
echo ""
echo "Comandos útiles:"
echo "  docker logs -f fluxion-backend  # Ver logs"
echo "  docker stop fluxion-backend     # Detener"
echo "  docker start fluxion-backend    # Iniciar"
echo ""
echo "Probar performance:"
echo "  time curl -s 'http://localhost:8001/ventas?limit=100' > /dev/null"
echo "  time curl -s 'http://localhost:8001/estadisticas' > /dev/null"
BACKEND_SCRIPT

chmod +x ~/run-backend.sh

echo "Script creado: ~/run-backend.sh"
echo ""
echo "=========================================="
echo "Setup script completado!"
echo "=========================================="
