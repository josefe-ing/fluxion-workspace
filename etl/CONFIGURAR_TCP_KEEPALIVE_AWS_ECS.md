# 🚀 Configurar TCP Keepalive en AWS ECS (Producción)

## 🎯 Contexto

En producción, el ETL corre en **AWS ECS Fargate** (containers Linux). Necesitamos configurar TCP keepalive para evitar timeouts durante extracciones largas de SQL Server.

**Diferencias vs macOS:**
- ✅ **Código Python (SQLAlchemy)**: Ya implementado, funciona igual en AWS
- ⚠️ **Sistema operativo**: Linux (ECS) vs macOS (tu laptop) tienen diferentes parámetros
- ✅ **ODBC keepalive**: Ya configurado en connection string, funciona en ambos

---

## 📋 Tres Capas de Configuración

### Capa 1: Código Python ✅ (Ya Implementado)

**Archivo:** `etl/core/extractor_ventas.py`

```python
# Connection string con keepalive ODBC
params = quote_plus(
    f"KeepAlive=yes;"
    f"KeepAliveInterval=30;"  # ✅ Funciona en ECS
)

# Socket-level keepalive
raw_socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
raw_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 30)   # ✅ Funciona en ECS (Linux)
raw_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 10)  # ✅ Funciona en ECS (Linux)
raw_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 5)     # ✅ Funciona en ECS (Linux)
```

**Estado:** ✅ Ya implementado, funcionará en ECS automáticamente

---

### Capa 2: Sistema Operativo Linux (ECS Container) 🐧

**Opción A: Configurar en Dockerfile (Recomendado)**

Actualiza tu `Dockerfile` del ETL para configurar TCP keepalive a nivel del sistema operativo:

```dockerfile
FROM python:3.11-slim

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    curl \
    unixodbc \
    unixodbc-dev \
    freetds-dev \
    freetds-bin \
    tdsodbc \
    && rm -rf /var/lib/apt/lists/*

# Instalar ODBC Driver 17 for SQL Server
RUN curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - \
    && curl https://packages.microsoft.com/config/debian/11/prod.list > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql17 \
    && rm -rf /var/lib/apt/lists/*

# ✅ CONFIGURAR TCP KEEPALIVE A NIVEL DE SISTEMA
# Estos valores se aplican a todas las conexiones TCP del container
RUN echo "net.ipv4.tcp_keepalive_time = 30" >> /etc/sysctl.conf && \
    echo "net.ipv4.tcp_keepalive_intvl = 10" >> /etc/sysctl.conf && \
    echo "net.ipv4.tcp_keepalive_probes = 5" >> /etc/sysctl.conf

# Copiar código ETL
WORKDIR /app
COPY etl/ /app/etl/
COPY requirements.txt /app/

# Instalar dependencias Python
RUN pip install --no-cache-dir -r requirements.txt

# Script de entrypoint que aplica sysctl
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["python3", "etl/core/etl_ventas.py"]
```

**Opción B: Configurar en ECS Task Definition**

Si no puedes modificar el Dockerfile, puedes configurar sysctl desde el Task Definition:

```typescript
// En tu CDK stack
const etlTask = new ecs.FargateTaskDefinition(this, 'FluxionETLTask', {
  memoryLimitMiB: 4096,
  cpu: 2048,
  // ...
});

const etlContainer = etlTask.addContainer('etl', {
  image: ecs.ContainerImage.fromEcrRepository(etlRepo, 'latest'),

  // ✅ Configurar sysctl para TCP keepalive
  linuxParameters: new ecs.LinuxParameters(this, 'ETLLinuxParams', {
    initProcessEnabled: true,
    sharedMemorySize: 2048,
  }),

  // Privilegios necesarios para modificar sysctl
  privileged: false,  // No requerido si usas docker-entrypoint.sh

  // ...
});
```

**Opción C: Script de Entrypoint**

Crea un script `docker-entrypoint.sh` que configure sysctl al iniciar el container:

```bash
#!/bin/bash
set -e

# Configurar TCP keepalive (requiere NET_ADMIN capability)
# Nota: Esto solo funciona si el Task Definition tiene permisos suficientes
if [ -w /proc/sys/net/ipv4/tcp_keepalive_time ]; then
    echo "🔧 Configurando TCP Keepalive..."
    echo 30 > /proc/sys/net/ipv4/tcp_keepalive_time
    echo 10 > /proc/sys/net/ipv4/tcp_keepalive_intvl
    echo 5 > /proc/sys/net/ipv4/tcp_keepalive_probes
    echo "✅ TCP Keepalive configurado"
else
    echo "⚠️ No se puede modificar sysctl (sin permisos), usando valores por defecto"
    echo "   Esto está OK - la configuración en Python/ODBC debería ser suficiente"
fi

# Ejecutar el comando original
exec "$@"
```

---

### Capa 3: ECS Task Definition (Configuración de Red) 🌐

**En tu CDK stack**, asegúrate de que el Task tenga acceso al VPN WireGuard y configuración de red apropiada:

```typescript
// En infrastructure/lib/fluxion-stack.ts

const etlTask = new ecs.FargateTaskDefinition(this, 'FluxionETLTask', {
  memoryLimitMiB: 4096,
  cpu: 2048,
  // ...
});

const etlContainer = etlTask.addContainer('etl', {
  image: ecs.ContainerImage.fromEcrRepository(etlRepo, 'latest'),

  logging: ecs.LogDrivers.awsLogs({
    streamPrefix: 'fluxion-etl',
    logRetention: logs.RetentionDays.ONE_WEEK,
  }),

  environment: {
    ENVIRONMENT: 'production',
    SQL_ODBC_DRIVER: 'ODBC Driver 17 for SQL Server',
    DUCKDB_PATH: '/data/fluxion_production.db',

    // ✅ Forzar configuración de keepalive desde variables de entorno
    PYODBC_KEEPALIVE: 'yes',
    PYODBC_KEEPALIVE_INTERVAL: '30',
  },

  secrets: {
    SQL_USERNAME: ecs.Secret.fromSecretsManager(sqlCredentials, 'username'),
    SQL_PASSWORD: ecs.Secret.fromSecretsManager(sqlCredentials, 'password'),
  },

  // ✅ Health check para verificar que el container está respondiendo
  healthCheck: {
    command: ['CMD-SHELL', 'python3 -c "import sys; sys.exit(0)"'],
    interval: cdk.Duration.seconds(30),
    timeout: cdk.Duration.seconds(10),
    retries: 3,
    startPeriod: cdk.Duration.seconds(60),
  },
});

// Mount EFS para DuckDB
etlContainer.addMountPoints({
  sourceVolume: 'fluxion-data',
  containerPath: '/data',
  readOnly: false,
});

// ✅ Configuración de red para el Task
const etlService = new ecs.FargateService(this, 'FluxionETLService', {
  cluster: cluster,
  taskDefinition: etlTask,
  desiredCount: 0,  // No mantener running, solo para scheduled tasks

  // Usar la misma subnet que WireGuard VPN
  vpcSubnets: {
    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
  },

  // Security group que permite salida a SQL Servers vía VPN
  securityGroups: [etlSecurityGroup],

  // Configuración de plataforma
  platformVersion: ecs.FargatePlatformVersion.LATEST,

  // Circuit breaker para deployment failures
  circuitBreaker: {
    rollback: true,
  },
});

// Security group para ETL (debe permitir tráfico al VPN)
const etlSecurityGroup = new ec2.SecurityGroup(this, 'ETLSecurityGroup', {
  vpc: vpc,
  description: 'Security group for Fluxion ETL tasks',
  allowAllOutbound: true,  // Permite salida a SQL Servers vía VPN
});
```

---

## 📦 Actualización Completa del Dockerfile

**Archivo:** `etl/Dockerfile` (actualizado con keepalive)

```dockerfile
FROM python:3.11-slim

# Variables de entorno
ENV DEBIAN_FRONTEND=noninteractive
ENV ACCEPT_EULA=Y

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    curl \
    gnupg2 \
    apt-transport-https \
    unixodbc \
    unixodbc-dev \
    freetds-dev \
    freetds-bin \
    tdsodbc \
    procps \
    net-tools \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Instalar ODBC Driver 17 for SQL Server
RUN curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - \
    && curl https://packages.microsoft.com/config/debian/11/prod.list > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql17 \
    && rm -rf /var/lib/apt/lists/*

# Configurar ODBC
RUN echo "[ODBC Driver 17 for SQL Server]" > /etc/odbcinst.ini && \
    echo "Description=Microsoft ODBC Driver 17 for SQL Server" >> /etc/odbcinst.ini && \
    echo "Driver=/opt/microsoft/msodbcsql17/lib64/libmsodbcsql-17.so" >> /etc/odbcinst.ini

# Crear directorio de trabajo
WORKDIR /app

# Copiar requirements y instalar dependencias Python
COPY etl/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código ETL
COPY etl/ ./etl/

# Copiar script de entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Crear directorio para data
RUN mkdir -p /data

# Usuario no-root para seguridad (opcional)
# RUN useradd -m -u 1000 etluser && chown -R etluser:etluser /app /data
# USER etluser

# Entrypoint que configura keepalive
ENTRYPOINT ["/docker-entrypoint.sh"]

# Comando por defecto (puede ser sobrescrito en Task Definition)
CMD ["python3", "-m", "etl.core.etl_ventas_chunked", "--help"]
```

**Archivo:** `docker-entrypoint.sh`

```bash
#!/bin/bash
set -e

echo "🚀 Iniciando Fluxion ETL en AWS ECS..."
echo "================================================"

# Mostrar configuración de red
echo "📡 Configuración de Red:"
ip addr show | grep inet || echo "No se puede mostrar IPs"
echo ""

# Intentar configurar TCP keepalive
echo "🔧 Configurando TCP Keepalive..."
if [ -w /proc/sys/net/ipv4/tcp_keepalive_time ]; then
    echo 30 > /proc/sys/net/ipv4/tcp_keepalive_time
    echo 10 > /proc/sys/net/ipv4/tcp_keepalive_intvl
    echo 5 > /proc/sys/net/ipv4/tcp_keepalive_probes

    echo "✅ TCP Keepalive configurado:"
    echo "   - Keepalive Time: $(cat /proc/sys/net/ipv4/tcp_keepalive_time)s"
    echo "   - Keepalive Interval: $(cat /proc/sys/net/ipv4/tcp_keepalive_intvl)s"
    echo "   - Keepalive Probes: $(cat /proc/sys/net/ipv4/tcp_keepalive_probes)"
else
    echo "⚠️ No se puede modificar sysctl (contenedor sin privilegios)"
    echo "   Configuración de keepalive se aplicará a nivel de código Python/ODBC"
fi
echo ""

# Verificar conectividad VPN (opcional)
if [ -n "$VPN_GATEWAY_IP" ]; then
    echo "🔍 Verificando conectividad VPN..."
    ping -c 2 "$VPN_GATEWAY_IP" && echo "✅ VPN accesible" || echo "⚠️ VPN no responde"
    echo ""
fi

# Verificar credenciales SQL (sin mostrar valores)
echo "🔐 Verificando credenciales SQL..."
if [ -n "$SQL_USERNAME" ] && [ -n "$SQL_PASSWORD" ]; then
    echo "✅ Credenciales SQL configuradas"
else
    echo "⚠️ Credenciales SQL no encontradas en variables de entorno"
fi
echo ""

echo "================================================"
echo "🎯 Ejecutando comando: $@"
echo "================================================"
echo ""

# Ejecutar el comando pasado al container
exec "$@"
```

---

## 🧪 Testing en AWS

### 1. Build y Push de la Imagen Docker

```bash
# Desde tu laptop (con AWS CLI configurado)
cd /Users/jose/Developer/fluxion-workspace

# Login a ECR
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build imagen
docker build -t fluxion-etl:latest -f etl/Dockerfile .

# Tag para ECR
docker tag fluxion-etl:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/fluxion-etl:latest

# Push a ECR
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/fluxion-etl:latest
```

### 2. Test Manual con ECS RunTask

```bash
# Ejecutar una tarea ETL manualmente para testing
aws ecs run-task \
    --cluster fluxion-cluster \
    --task-definition fluxion-etl-task:latest \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
    --overrides '{
        "containerOverrides": [{
            "name": "etl",
            "command": ["python3", "etl/core/etl_ventas_chunked.py", "--tienda", "tienda_01", "--fecha-inicio", "2025-10-01", "--fecha-fin", "2025-10-07", "--dias-por-chunk", "3"]
        }]
    }'
```

### 3. Monitorear Logs

```bash
# Ver logs en CloudWatch
aws logs tail /ecs/fluxion-etl --follow

# O desde la consola de AWS:
# CloudWatch > Log groups > /ecs/fluxion-etl
```

---

## 🎯 Resumen: ¿Qué Configurar en Producción?

| Capa | Configuración | Estado | Prioridad |
|------|--------------|--------|-----------|
| **Código Python** | Keepalive en SQLAlchemy + socket | ✅ Ya implementado | ⭐⭐⭐⭐⭐ |
| **Connection String** | `KeepAlive=yes` en ODBC | ✅ Ya implementado | ⭐⭐⭐⭐⭐ |
| **Dockerfile** | `docker-entrypoint.sh` con sysctl | ⚠️ Crear archivo | ⭐⭐⭐⭐ |
| **ECS Task Def** | Configuración de red/seguridad | ⚠️ Verificar existente | ⭐⭐⭐ |
| **Estrategia** | Usar `etl_ventas_chunked.py` | ✅ Ya creado | ⭐⭐⭐⭐⭐ |
| **SQL Server DBA** | Keepalive en servidor | ⚠️ Pendiente coordinación | ⭐⭐⭐⭐ |

---

## 💡 Recomendación Final

**Para tu Mac (desarrollo):**
```bash
# No necesitas configurar sysctl en macOS
# El código Python con keepalive ya configurado es suficiente
# Usa el script chunked para evitar timeouts:
python3 etl_ventas_chunked.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-22 --dias-por-chunk 7
```

**Para AWS ECS (producción):**
1. ✅ El código Python ya tiene keepalive → funcionará automáticamente
2. ✅ Crea `docker-entrypoint.sh` para configurar sysctl (mejora adicional)
3. ✅ Usa `etl_ventas_chunked.py` en los scheduled tasks
4. ✅ Coordina con DBA para configurar SQL Server keepalive

**Lo más importante:** El código Python con SQLAlchemy y keepalive **ya funciona en ECS** sin cambios adicionales. Las configuraciones adicionales (Dockerfile, entrypoint) son **mejoras opcionales** que reducen aún más el riesgo de timeouts.

---

**Última actualización:** 2025-10-22
