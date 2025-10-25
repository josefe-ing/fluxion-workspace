# 🔴 ETL VPN Connectivity Issue

**Fecha:** 2025-10-22
**Estado:** En investigación

---

## 🚨 Problema Actual

El ETL de inventario no puede conectar a SQL Server en producción:

```
⚠️  VPN no responde (192.168.20.1)
❌ Error conectando a BOSQUE: Login timeout expired
   Intentando conectar a: 10.0.2.244:14348
```

**Funciona en local:** ✅
**Falla en ECS:** ❌

---

## 🔍 Diagnóstico

### 1. Network Configuration Visible

```
📡 Configuración de Red:
   127.0.0.1/8         (localhost)
   169.254.172.2/22    (AWS metadata)
   10.0.3.138/24       (VPC subnet)
```

### 2. VPN Gateway No Responde

```bash
ping -c 2 192.168.20.1  # ⚠️ VPN no responde
```

**Problema:** El container ETL en ECS no puede alcanzar el WireGuard VPN bridge EC2.

---

## 🏗️ Arquitectura Actual

```
┌─────────────────────────────────────────────────────┐
│ AWS VPC (10.0.0.0/16)                               │
│                                                      │
│  ┌──────────────────┐        ┌──────────────────┐ │
│  │ ECS Task (ETL)   │        │ EC2 WireGuard    │ │
│  │ Subnet: 10.0.3.x │───X───▶│ Subnet: 10.0.1.x │ │
│  │ (Private)        │        │ (Private)        │ │
│  └──────────────────┘        └──────────────────┘ │
│                                       │            │
│                                       │ WireGuard  │
│                                       ▼            │
│                               192.168.0.0/16       │
│                               (La Granja VPN)      │
└─────────────────────────────────────────────────────┘
```

**Problema identificado:**
- ECS Task y WireGuard EC2 están en **subnets diferentes**
- No hay routing configurado para que el tráfico del ETL pase por WireGuard
- Security Groups pueden estar bloqueando tráfico

---

## 🔧 Posibles Soluciones

### Opción 1: Routing Table (Recomendado)

Configurar la Route Table de la subnet privada donde corre ETL para enviar tráfico `192.168.0.0/16` al ENI del WireGuard EC2.

**En CDK:**
```typescript
// infrastructure/lib/infrastructure-stack.ts

// Obtener el ENI del WireGuard instance
const wireguardEni = wireguardInstance.instance.instanceNetworkInterfaces[0];

// Obtener la route table de private subnets
const privateSubnets = vpc.privateSubnets;

privateSubnets.forEach((subnet) => {
  new ec2.CfnRoute(this, `RouteToWireGuard-${subnet.node.id}`, {
    routeTableId: subnet.routeTable.routeTableId,
    destinationCidrBlock: '192.168.0.0/16',  // La Granja network
    networkInterfaceId: wireguardEni,
  });
});
```

---

### Opción 2: Misma Subnet

Mover el WireGuard EC2 y los ECS Tasks a la misma subnet.

**Cambio en CDK:**
```typescript
const wireguardInstance = new ec2.Instance(this, 'WireGuardBridge', {
  vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },  // Ya está
  // ...
});

// Asegurar que ETL tasks usen la misma subnet
const etlService = new ecs.FargateService(this, 'FluxionETLService', {
  // ...
  vpcSubnets: {
    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,  // Match con WireGuard
  },
});
```

---

### Opción 3: Security Group Rules

Asegurar que el Security Group del WireGuard permita tráfico desde ETL.

**En CDK:**
```typescript
// Permitir tráfico desde ETL Security Group al WireGuard
wireguardSG.addIngressRule(
  etlSecurityGroup,
  ec2.Port.allTraffic(),
  'Allow ETL tasks to route through WireGuard'
);
```

---

## 🧪 Testing de Conectividad

### Desde el Container ETL

```bash
# 1. Ejecutar shell en container ETL
aws ecs execute-command \
    --cluster fluxion-cluster \
    --task <TASK_ARN> \
    --container etl \
    --interactive \
    --command "/bin/bash"

# 2. Test ping al WireGuard gateway
ping -c 3 192.168.20.1

# 3. Test conectividad SQL Server via VPN
nc -zv 10.0.2.244 14348

# 4. Ver routing table
ip route show

# 5. Ver DNS resolution
nslookup f0270ee31a20.sn.mynetname.net
```

---

### Desde WireGuard EC2

```bash
# Conectar via SSM
aws ssm start-session --target <INSTANCE_ID>

# Ver estado de WireGuard
sudo wg show

# Ver interfaz wg0
ip addr show wg0

# Ver routing
ip route show

# Test ping al SQL Server via VPN
ping -c 3 10.0.2.244
```

---

## 📝 Estado Actual de Configuración

### VPC CIDR
- **VPC:** 10.0.0.0/16

### Subnets
- **Public:** 10.0.0.0/24, 10.0.1.0/24
- **Private:** 10.0.2.0/24, 10.0.3.0/24

### WireGuard Configuration
```
[Interface]
PrivateKey = oBXfWH5DbhcU9N57/iqFYarozxc/mUiVSH2h5nc8+1w=
Address = 10.32.0.24/32

[Peer]
PublicKey = j6ioRetJeMVbO4oipmcTiEGT4mUCXLlS0iIpQ8d8F0Y=
AllowedIPs = 192.168.0.0/16  ← La Granja network
Endpoint = f0270ee31a20.sn.mynetname.net:51820
PersistentKeepalive = 25
```

### Network Routes Needed
```
Destination         Gateway             Interface
192.168.0.0/16  →  WireGuard ENI   →  wg0
```

---

## ✅ Solución Recomendada

1. **Agregar routes en CDK** para enviar tráfico 192.168.0.0/16 al WireGuard EC2
2. **Verificar Security Groups** permiten tráfico ETL → WireGuard
3. **Test conectividad** desde container ETL
4. **Documentar** configuración para referencia futura

---

## 🚀 Implementación

### Step 1: Actualizar CDK Stack

```bash
cd infrastructure
# Editar lib/infrastructure-stack.ts
# Agregar routing configuration
```

### Step 2: Deploy

```bash
npx cdk diff   # Ver cambios
npx cdk deploy # Aplicar
```

### Step 3: Test

```bash
# Ejecutar ETL inventario manual
# Verificar logs muestran: ✅ VPN accesible
```

---

## 📚 Referencias

- [AWS VPC Routing](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html)
- [WireGuard Configuration](https://www.wireguard.com/quickstart/)
- [ECS Task Networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-networking.html)

---

**Última actualización:** 2025-10-22 13:30 PM
**Próximos pasos:** Implementar routing en CDK
