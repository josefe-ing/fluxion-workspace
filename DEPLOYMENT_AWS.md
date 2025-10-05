# 🚀 Deployment en AWS - Fluxion AI

Guía completa para desplegar Fluxion AI en Amazon Web Services (AWS).

## 📋 Tabla de Contenidos

1. [Arquitectura Recomendada](#arquitectura-recomendada)
2. [Crear Cuenta AWS](#crear-cuenta-aws)
3. [Servicios AWS a Utilizar](#servicios-aws-a-utilizar)
4. [Deployment Paso a Paso](#deployment-paso-a-paso)
5. [Configuración de Producción](#configuración-de-producción)
6. [Costos Estimados](#costos-estimados)
7. [Monitoreo y Mantenimiento](#monitoreo-y-mantenimiento)

---

## 🏗️ Arquitectura Recomendada

```
┌─────────────────────────────────────────────────────────────┐
│                        INTERNET                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Route 53 (DNS)     │
              │  fluxion.lagranja.ve │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  CloudFront (CDN)    │
              │   + SSL Certificate  │
              └──────────┬───────────┘
                         │
         ┌───────────────┴──────────────┐
         │                              │
         ▼                              ▼
┌──────────────────┐          ┌──────────────────┐
│   S3 Bucket      │          │  Application     │
│   (Frontend)     │          │  Load Balancer   │
│   React Build    │          │  (ALB)           │
└──────────────────┘          └────────┬─────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                      │
                    ▼                                      ▼
           ┌──────────────────┐                  ┌──────────────────┐
           │   EC2 Instance   │                  │   EC2 Instance   │
           │   (Backend 1)    │                  │   (Backend 2)    │
           │   FastAPI        │                  │   FastAPI        │
           └────────┬─────────┘                  └────────┬─────────┘
                    │                                      │
                    └──────────────────┬───────────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │   EBS Volume     │
                              │   (DuckDB)       │
                              │   20GB SSD       │
                              └──────────────────┘
```

### Componentes:

1. **Route 53**: DNS management
2. **CloudFront**: CDN para frontend (opcional pero recomendado)
3. **S3**: Hosting frontend estático
4. **ALB**: Load balancer para backend
5. **EC2**: Servidores para FastAPI (2 instancias para HA)
6. **EBS**: Almacenamiento persistente para DuckDB
7. **CloudWatch**: Monitoreo y logs

---

## 🆕 Crear Cuenta AWS

### Paso 1: Registro

1. Ve a https://aws.amazon.com/
2. Click en "Create an AWS Account"
3. Completa:
   - Email
   - Contraseña
   - Nombre de cuenta AWS

### Paso 2: Información de Contacto

- Selecciona: **Business** (para facturación empresarial)
- Completa datos de la empresa

### Paso 3: Método de Pago

- Agrega tarjeta de crédito
- AWS validará con cargo de $1 (se reembolsa)

### Paso 4: Verificación de Identidad

- Verifica por teléfono (SMS o llamada)

### Paso 5: Seleccionar Plan

- **Free Tier** (primeros 12 meses gratis para ciertos servicios)
- No necesitas Support Plan inicialmente

### Paso 6: Activación

- Espera 15-30 minutos para activación completa
- Revisa email de confirmación

---

## 🛠️ Servicios AWS a Utilizar

### Capa Gratuita (Free Tier)

Servicios que tendrás GRATIS el primer año:

| Servicio | Free Tier |
|----------|-----------|
| EC2 | 750 horas/mes t2.micro |
| S3 | 5GB storage, 20K GET, 2K PUT |
| EBS | 30GB SSD |
| CloudFront | 50GB transfer, 2M requests |
| RDS | 750 horas db.t2.micro (no usado) |
| Lambda | 1M requests/mes (no usado) |

### Servicios a Configurar

1. **EC2** (Elastic Compute Cloud)
   - Servidor para backend FastAPI
   - Tipo: t3.small o t3.medium
   - OS: Ubuntu 22.04 LTS

2. **S3** (Simple Storage Service)
   - Hosting del frontend React
   - Static website hosting

3. **EBS** (Elastic Block Store)
   - Almacenamiento DuckDB (20GB)
   - Tipo: gp3 (mejor relación costo/rendimiento)

4. **ALB** (Application Load Balancer)
   - Distribuir tráfico backend
   - Health checks

5. **Route 53** (opcional)
   - DNS management
   - Solo si tienes dominio propio

6. **CloudWatch**
   - Logs y métricas
   - Alertas

---

## 📦 Deployment Paso a Paso

### FASE 1: Preparar Código Local

```bash
# 1. Crear rama de producción
git checkout -b production

# 2. Actualizar configuración producción
cd frontend
npm run build

# 3. Verificar backend
cd ../backend
python3 -m pytest  # Si tienes tests
```

### FASE 2: Configurar AWS CLI

```bash
# Instalar AWS CLI
brew install awscli  # macOS
# o
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configurar credenciales
aws configure
# AWS Access Key ID: <tu-key>
# AWS Secret Access Key: <tu-secret>
# Default region: us-east-1
# Default output format: json
```

### FASE 3: Deploy Frontend (S3 + CloudFront)

#### 3.1 Crear S3 Bucket

```bash
# Crear bucket
aws s3 mb s3://fluxion-frontend --region us-east-1

# Configurar como static website
aws s3 website s3://fluxion-frontend \
  --index-document index.html \
  --error-document index.html

# Configurar política pública (crear archivo policy.json)
cat > /tmp/policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::fluxion-frontend/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket fluxion-frontend \
  --policy file:///tmp/policy.json

# Subir frontend
cd frontend
aws s3 sync dist/ s3://fluxion-frontend/ \
  --delete \
  --cache-control max-age=31536000
```

#### 3.2 Crear CloudFront Distribution (Opcional)

```bash
# Crear distribución (via consola web es más fácil)
# AWS Console > CloudFront > Create Distribution
# Origin: fluxion-frontend.s3-website-us-east-1.amazonaws.com
# Viewer Protocol Policy: Redirect HTTP to HTTPS
```

### FASE 4: Deploy Backend (EC2)

#### 4.1 Crear EC2 Instance

**Via AWS Console:**

1. EC2 Dashboard > Launch Instance
2. **Name**: fluxion-backend
3. **AMI**: Ubuntu Server 22.04 LTS
4. **Instance type**: t3.small (2 vCPU, 2GB RAM)
5. **Key pair**: Crear nuevo o usar existente
6. **Network settings**:
   - Allow SSH (port 22) from My IP
   - Allow HTTP (port 80) from Anywhere
   - Allow HTTPS (port 443) from Anywhere
   - Allow Custom TCP (port 8001) from Anywhere
7. **Storage**: 20GB gp3
8. Launch Instance

#### 4.2 Conectar a EC2

```bash
# Descargar key pair (.pem)
chmod 400 fluxion-backend.pem

# Conectar via SSH
ssh -i fluxion-backend.pem ubuntu@<EC2_PUBLIC_IP>
```

#### 4.3 Setup en EC2

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Python 3.11
sudo apt install -y python3.11 python3.11-venv python3.11-dev

# Instalar dependencias del sistema
sudo apt install -y build-essential git nginx

# Instalar Node.js (para scripts si necesario)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Clonar repositorio (si es privado, configura SSH key)
cd /opt
sudo git clone https://github.com/tu-usuario/fluxion-workspace.git
sudo chown -R ubuntu:ubuntu fluxion-workspace
cd fluxion-workspace

# Setup backend
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Setup database
cd ../database
python3 init_db.py
python3 setup_extended_config.py

# Crear servicio systemd
sudo nano /etc/systemd/system/fluxion-backend.service
```

**Contenido de fluxion-backend.service:**

```ini
[Unit]
Description=Fluxion AI Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/fluxion-workspace/backend
Environment="PATH=/opt/fluxion-workspace/backend/venv/bin"
ExecStart=/opt/fluxion-workspace/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001 --workers 4
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Activar servicio
sudo systemctl daemon-reload
sudo systemctl enable fluxion-backend
sudo systemctl start fluxion-backend
sudo systemctl status fluxion-backend

# Ver logs
sudo journalctl -u fluxion-backend -f
```

#### 4.4 Configurar Nginx como Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/fluxion
```

**Contenido:**

```nginx
server {
    listen 80;
    server_name your-domain.com;  # O usa IP pública

    # API Backend
    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:8001/;
    }
}
```

```bash
# Activar sitio
sudo ln -s /etc/nginx/sites-available/fluxion /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### FASE 5: Configurar Variables de Entorno

```bash
# Crear archivo .env en producción
cd /opt/fluxion-workspace/backend
nano .env
```

**Contenido `.env`:**

```env
# Database
DATABASE_PATH=../data/fluxion_production.db

# Environment
ENVIRONMENT=production
DEBUG=False

# CORS (frontend URL)
FRONTEND_URL=https://d1234567890.cloudfront.net

# ETL Credentials (si aplica)
SQL_SERVER_HOST=tu-servidor-sql.com
SQL_SERVER_USER=usuario
SQL_SERVER_PASSWORD=contraseña-segura
```

```bash
# Reiniciar servicio
sudo systemctl restart fluxion-backend
```

### FASE 6: Configurar SSL (HTTPS)

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtener certificado (necesitas dominio)
sudo certbot --nginx -d tu-dominio.com

# Auto-renovación configurada automáticamente
sudo certbot renew --dry-run
```

---

## ⚙️ Configuración de Producción

### Optimizaciones Backend

**`backend/main.py`** - Agregar configuración producción:

```python
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
DEBUG = os.getenv("DEBUG", "True") == "True"

app = FastAPI(
    title="Fluxion AI API",
    debug=DEBUG,
    docs_url="/docs" if ENVIRONMENT != "production" else None,  # Ocultar docs en prod
    redoc_url="/redoc" if ENVIRONMENT != "production" else None
)

# CORS solo del frontend
origins = [
    os.getenv("FRONTEND_URL", "http://localhost:3001")
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Optimizaciones DuckDB

```python
# Configurar DuckDB para producción
conn = duckdb.connect(DB_PATH)
conn.execute("SET memory_limit='2GB'")
conn.execute("SET threads=4")
conn.execute("SET temp_directory='/tmp/duckdb'")
```

### Backups Automáticos

```bash
# Script de backup
sudo nano /opt/fluxion-workspace/scripts/backup_db.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups"
DB_PATH="/opt/fluxion-workspace/data/fluxion_production.db"

mkdir -p $BACKUP_DIR

# Backup DuckDB
cp $DB_PATH "$BACKUP_DIR/fluxion_production_$DATE.db"

# Comprimir
gzip "$BACKUP_DIR/fluxion_production_$DATE.db"

# Subir a S3
aws s3 cp "$BACKUP_DIR/fluxion_production_$DATE.db.gz" \
  s3://fluxion-backups/db/

# Limpiar backups locales > 7 días
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete

echo "Backup completado: $DATE"
```

```bash
# Dar permisos
chmod +x /opt/fluxion-workspace/scripts/backup_db.sh

# Programar con cron (diario a las 2am)
sudo crontab -e
```

Agregar:
```
0 2 * * * /opt/fluxion-workspace/scripts/backup_db.sh >> /var/log/fluxion_backup.log 2>&1
```

---

## 💰 Costos Estimados (Mensual)

### Opción 1: Configuración Mínima

| Servicio | Especificación | Costo/Mes |
|----------|----------------|-----------|
| EC2 t3.small | 2vCPU, 2GB RAM | ~$15 |
| EBS gp3 | 20GB SSD | ~$2 |
| S3 | 5GB frontend | ~$0.12 |
| Data Transfer | 100GB/mes | ~$9 |
| **TOTAL** | | **~$26/mes** |

### Opción 2: Alta Disponibilidad

| Servicio | Especificación | Costo/Mes |
|----------|----------------|-----------|
| EC2 t3.medium x2 | 2vCPU, 4GB RAM (2 instancias) | ~$60 |
| ALB | Application Load Balancer | ~$20 |
| EBS gp3 | 50GB SSD | ~$5 |
| S3 + CloudFront | Frontend CDN | ~$5 |
| Data Transfer | 200GB/mes | ~$18 |
| **TOTAL** | | **~$108/mes** |

**Nota**: Precios estimados para región us-east-1. Free tier reduce costos primeros 12 meses.

---

## 📊 Monitoreo y Mantenimiento

### CloudWatch Alarms

```bash
# Crear alarma CPU > 80%
aws cloudwatch put-metric-alarm \
  --alarm-name fluxion-backend-high-cpu \
  --alarm-description "Alert when CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

### Logs

```bash
# Ver logs backend
sudo journalctl -u fluxion-backend -f

# Ver logs nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Ver logs CloudWatch (vía AWS Console)
```

### Health Checks

```bash
# Crear script de health check
cat > /opt/fluxion-workspace/scripts/health_check.sh << 'EOF'
#!/bin/bash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/)
if [ $STATUS -eq 200 ]; then
  echo "✅ Backend OK"
  exit 0
else
  echo "❌ Backend DOWN (Status: $STATUS)"
  sudo systemctl restart fluxion-backend
  exit 1
fi
EOF

chmod +x /opt/fluxion-workspace/scripts/health_check.sh

# Ejecutar cada 5 minutos
crontab -e
```

Agregar:
```
*/5 * * * * /opt/fluxion-workspace/scripts/health_check.sh >> /var/log/fluxion_health.log 2>&1
```

---

## 🔄 CI/CD (Opcional)

### GitHub Actions

Crear `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main, production]

jobs:
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Build Frontend
        run: |
          cd frontend
          npm install
          npm run build

      - name: Deploy to S3
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          aws s3 sync frontend/dist/ s3://fluxion-frontend/ --delete

  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to EC2
        env:
          SSH_KEY: ${{ secrets.EC2_SSH_KEY }}
        run: |
          echo "$SSH_KEY" > key.pem
          chmod 400 key.pem
          ssh -i key.pem ubuntu@${{ secrets.EC2_IP }} << 'EOF'
            cd /opt/fluxion-workspace
            git pull origin production
            sudo systemctl restart fluxion-backend
          EOF
```

---

## 📝 Checklist de Deployment

- [ ] Cuenta AWS creada y configurada
- [ ] AWS CLI instalado y configurado
- [ ] S3 bucket creado para frontend
- [ ] Frontend buildeado y subido a S3
- [ ] CloudFront distribution creada (opcional)
- [ ] EC2 instance lanzada
- [ ] Backend clonado en EC2
- [ ] Dependencias instaladas en EC2
- [ ] Database inicializada
- [ ] Servicio systemd configurado
- [ ] Nginx configurado como reverse proxy
- [ ] SSL/HTTPS configurado (si tienes dominio)
- [ ] Variables de entorno configuradas
- [ ] Backups automáticos configurados
- [ ] CloudWatch alarms configuradas
- [ ] Health checks configurados
- [ ] DNS apuntando a CloudFront/ALB (si aplica)

---

## 🆘 Troubleshooting

### Backend no responde

```bash
# Ver status
sudo systemctl status fluxion-backend

# Ver logs
sudo journalctl -u fluxion-backend -n 100 --no-pager

# Reiniciar
sudo systemctl restart fluxion-backend
```

### Frontend no carga

```bash
# Verificar S3
aws s3 ls s3://fluxion-frontend/

# Verificar CloudFront cache
# AWS Console > CloudFront > Invalidations > Create Invalidation
# Paths: /*
```

### Base de datos corrupta

```bash
# Restaurar desde backup
cd /opt/fluxion-workspace/data
cp fluxion_production.db fluxion_production.db.backup
aws s3 cp s3://fluxion-backups/db/fluxion_production_YYYYMMDD.db.gz .
gunzip fluxion_production_YYYYMMDD.db.gz
mv fluxion_production_YYYYMMDD.db fluxion_production.db
sudo systemctl restart fluxion-backend
```

---

**¡Deployment completo!** 🎉

Para soporte adicional, consulta la documentación oficial de AWS: https://docs.aws.amazon.com/
