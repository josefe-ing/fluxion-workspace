# 🔒 WireGuard VPN Configuration for AWS Deployment

## Current Local Setup

**WireGuard Client Configuration**: `DELIVERY_wg1.conf`

```ini
[Interface]
PrivateKey = oBXfWH5DbhcU9N57/iqFYarozxc/mUiVSH2h5nc8+1w=
Address = 10.32.0.24/32
MTU = 1420
DNS = 192.168.20.55,1.1.1.1,8.8.8.8

[Peer]
PublicKey = j6ioRetJeMVbO4oipmcTiEGT4mUCXLlS0iIpQ8d8F0Y=
AllowedIPs = 0.0.0.0/0
Endpoint = f0270ee31a20.sn.mynetname.net:51820
PersistentKeepalive = 21
```

**Network Details:**
- **Client VPN IP**: `10.32.0.24/32`
- **On-Premise Network**: `192.168.x.x` (La Granja internal network)
- **Internal DNS**: `192.168.20.55`
- **WireGuard Server**: `f0270ee31a20.sn.mynetname.net:51820`
- **Allowed IPs**: `0.0.0.0/0` (all traffic through VPN)

**SQL Server Access:**
- 16 Tiendas en red `192.168.x.x`
- Puerto: `14348`
- Base de datos: `VAD10`

---

## 🚀 AWS ECS with WireGuard VPN

Para que los containers ECS (ETL tasks) se conecten a la red de La Granja, hay **3 opciones**:

### **Opción 1: WireGuard Client en Container (RECOMENDADA)**

Ejecutar WireGuard dentro del container ETL.

#### **Ventajas:**
- ✅ Más simple de configurar
- ✅ No requiere cambios en AWS VPC
- ✅ Cada task tiene su propia conexión VPN
- ✅ Funciona con Fargate

#### **Implementación:**

**1. Actualizar Dockerfile ETL:**

```dockerfile
FROM python:3.11-slim

# Install WireGuard
RUN apt-get update && apt-get install -y \
    wireguard-tools \
    iproute2 \
    iptables \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy WireGuard config from AWS Secrets Manager
COPY scripts/setup-vpn.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/setup-vpn.sh

# ... rest of ETL Dockerfile ...

# Start VPN before ETL
CMD ["/usr/local/bin/setup-vpn.sh"]
```

**2. Script `setup-vpn.sh`:**

```bash
#!/bin/bash
# Obtener config de Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id fluxion/wireguard-config \
  --query SecretString \
  --output text > /etc/wireguard/wg0.conf

# Iniciar WireGuard
wg-quick up wg0

# Verificar conectividad
ping -c 3 192.168.20.55

# Ejecutar ETL
exec python3 etl_inventario.py
```

**3. Guardar config en AWS Secrets Manager:**

```bash
aws secretsmanager create-secret \
  --name fluxion/wireguard-config \
  --secret-string file://DELIVERY_wg1.conf
```

**4. Permisos IAM para ECS Task:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:fluxion/wireguard-config-*"
    }
  ]
}
```

**5. ECS Task Requiere Privileged Mode:**

⚠️ **Limitación**: Fargate **NO** soporta `privileged` mode necesario para WireGuard.

**Solución**: Usar **EC2 Launch Type** en lugar de Fargate para ETL tasks.

```typescript
// En CDK stack
const etlTask = new ecs.Ec2TaskDefinition(this, 'FluxionETLTask', {
  networkMode: ecs.NetworkMode.BRIDGE,
});

etlTask.addContainer('etl', {
  image: ecs.ContainerImage.fromAsset('../etl'),
  privileged: true, // Necesario para WireGuard
  environment: {
    WIREGUARD_ENABLED: 'true',
  },
});
```

---

### **Opción 2: AWS Client VPN Endpoint**

Crear un AWS Client VPN Endpoint que se conecte al WireGuard server.

#### **Ventajas:**
- ✅ Funciona con Fargate
- ✅ VPN gestionada por AWS
- ✅ No requiere privileged containers

#### **Desventajas:**
- ❌ Más costoso (~$72/mes solo VPN endpoint)
- ❌ Configuración más compleja

#### **Costo:**
- VPN Endpoint: $0.10/hora = $72/mes
- Conexiones: $0.05/hora por cliente = $36/mes (1 cliente)
- **Total: ~$108/mes**

---

### **Opción 3: Site-to-Site VPN con Router On-Premise**

Conectar VPC de AWS directamente al router de La Granja.

#### **Requisitos:**
- ✅ IP pública estática en La Granja
- ✅ Router compatible con IPsec (o usar WireGuard server como gateway)

#### **Ventajas:**
- ✅ Funciona con Fargate
- ✅ Más barato que Client VPN (~$36/mes)
- ✅ Toda la VPC tiene acceso

#### **Implementación:**

```typescript
// En CDK stack (ya incluido)
const vpc = new ec2.Vpc(this, 'FluxionVPC', {
  vpnGateway: true, // ✓ Ya configurado
});

// Crear Customer Gateway
const customerGateway = new ec2.CfnCustomerGateway(this, 'LaGranjaGateway', {
  bgpAsn: 65000,
  ipAddress: 'IP_PUBLICA_LA_GRANJA', // Obtener de ISP
  type: 'ipsec.1',
});

// Crear VPN Connection
const vpnConnection = new ec2.CfnVPNConnection(this, 'LaGranjaVPN', {
  type: 'ipsec.1',
  customerGatewayId: customerGateway.ref,
  vpnGatewayId: vpc.vpnGatewayId!,
  staticRoutesOnly: true,
});

// Agregar ruta a red interna
new ec2.CfnVPNConnectionRoute(this, 'LaGranjaRoute', {
  destinationCidrBlock: '192.168.0.0/16', // Red de La Granja
  vpnConnectionId: vpnConnection.ref,
});
```

**Configurar en Router On-Premise:**
- Usar WireGuard server (`f0270ee31a20.sn.mynetname.net`) como gateway
- Configurar IPsec tunnel a AWS VPN Gateway

---

## 🎯 Recomendación Final

### **Para Desarrollo/Testing:**
**Opción 1** - WireGuard en Container con **ECS EC2** (no Fargate)

**Costo**: ~$65/mes (t3.small EC2)

### **Para Producción:**
**Opción 3** - Site-to-Site VPN

**Costo**: ~$36/mes + requiere configurar router en La Granja

---

## 📋 Checklist de Deployment con VPN

### Opción 1 (WireGuard en Container):

- [ ] Actualizar `etl/Dockerfile` con WireGuard tools
- [ ] Crear script `setup-vpn.sh`
- [ ] Subir config a Secrets Manager: `fluxion/wireguard-config`
- [ ] Cambiar CDK de `FargateTaskDefinition` a `Ec2TaskDefinition`
- [ ] Agregar `privileged: true` al container
- [ ] Crear EC2 cluster en lugar de solo Fargate
- [ ] Deploy y probar conectividad

### Opción 3 (Site-to-Site VPN):

- [ ] Obtener IP pública estática de La Granja
- [ ] Configurar WireGuard server como IPsec gateway
- [ ] Actualizar CDK con Customer Gateway
- [ ] Deploy VPN Connection
- [ ] Descargar config VPN de AWS Console
- [ ] Configurar router on-premise con config
- [ ] Verificar conectividad: `ping 192.168.20.55` desde ECS task

---

## 🔐 Seguridad

**NO COMMITEAR:**
- ❌ `DELIVERY_wg1.conf` (contiene PrivateKey)
- ❌ `.env` con SQL credentials

**Almacenar en AWS Secrets Manager:**
- ✅ WireGuard PrivateKey
- ✅ SQL Server credentials
- ✅ Sentry DSN

```bash
# Guardar WireGuard config
aws secretsmanager create-secret \
  --name fluxion/wireguard-config \
  --secret-string file://DELIVERY_wg1.conf

# Guardar SQL credentials
aws secretsmanager create-secret \
  --name fluxion/sql-credentials \
  --secret-string '{"user":"beliveryApp","password":"AxPG_25!"}'
```

---

## 🧪 Testing Local

```bash
# Activar VPN
wg-quick up DELIVERY_wg1

# Verificar IP
ip addr show wg0
# Debe mostrar: 10.32.0.24/32

# Probar acceso a SQL Server
telnet 192.168.20.12 14348

# Desactivar VPN
wg-quick down DELIVERY_wg1
```

---

## 📚 Referencias

- WireGuard Official: https://www.wireguard.com/
- AWS Client VPN: https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/
- AWS Site-to-Site VPN: https://docs.aws.amazon.com/vpn/latest/s2svpn/
- ECS Privileged Containers: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html#container_definition_security
