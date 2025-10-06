# 🔐 Site-to-Site VPN Setup Guide - AWS ↔ La Granja

Guía paso a paso para configurar la VPN Site-to-Site entre AWS y La Granja Mercado usando el servidor WireGuard existente.

## 📋 Requisitos Previos

### De La Granja:
- ✅ **Servidor WireGuard**: `f0270ee31a20.sn.mynetname.net:51820`
- ❓ **IP Pública Estática**: Necesaria para Customer Gateway
- ✅ **Red Interna**: `192.168.0.0/16`
- ✅ **Acceso a Router/Firewall**: Para configurar IPsec

### De AWS:
- ✅ **VPN Gateway**: Ya configurado en CDK stack
- ✅ **Customer Gateway**: Se crea al hacer deploy
- ✅ **VPN Connection**: Se crea automáticamente

---

## 🚀 Paso 1: Obtener IP Pública de La Granja

Necesitas la IP pública estática del servidor WireGuard.

### Opción A: Desde La Granja (si tienes acceso SSH)
```bash
curl ifconfig.me
# O
curl https://api.ipify.org
```

### Opción B: Desde tu WireGuard local
```bash
# Activar VPN
wg-quick up DELIVERY_wg1

# Resolver el hostname
nslookup f0270ee31a20.sn.mynetname.net

# O con dig
dig +short f0270ee31a20.sn.mynetname.net
```

### Opción C: Contactar proveedor ISP de La Granja
Pedir la IP pública estática del servidor.

**⚠️ IMPORTANTE**: La IP debe ser **estática** (no dinámica). Si es dinámica, considera usar Dynamic DNS o solicitar IP estática al ISP.

---

## 🏗️ Paso 2: Configurar Variable de Entorno

Antes de hacer `cdk deploy`, configura la IP pública:

```bash
cd infrastructure

# Reemplazar con la IP real
export LA_GRANJA_PUBLIC_IP="203.0.113.45"  # Ejemplo

# Verificar
echo $LA_GRANJA_PUBLIC_IP
```

**Alternativa**: Agregar al archivo `.env` en infrastructure:

```bash
# infrastructure/.env
LA_GRANJA_PUBLIC_IP=203.0.113.45
```

---

## 📦 Paso 3: Deploy del Stack CDK

```bash
cd infrastructure

# Deploy con la variable de entorno
LA_GRANJA_PUBLIC_IP="203.0.113.45" cdk deploy InfrastructureStack
```

**Outputs esperados:**
```
Outputs:
InfrastructureStack.VPCId = vpc-0abc123def456789
InfrastructureStack.VPNGatewayId = vgw-0xyz789abc123def
InfrastructureStack.CustomerGatewayId = cgw-0qwe456rty789uio
InfrastructureStack.VPNConnectionId = vpn-0asd123fgh456jkl
InfrastructureStack.VPNConfigDownloadCommand = aws ec2 describe-vpn-connections...
```

**⏱️ Tiempo de deploy**: ~20-30 minutos

---

## 📥 Paso 4: Descargar Configuración VPN de AWS

Una vez completado el deploy, descarga la configuración IPsec:

```bash
# Obtener VPN Connection ID del output
VPN_CONN_ID=$(aws cloudformation describe-stacks \
  --stack-name InfrastructureStack \
  --query 'Stacks[0].Outputs[?OutputKey==`VPNConnectionId`].OutputValue' \
  --output text)

# Descargar configuración
aws ec2 describe-vpn-connections \
  --vpn-connection-ids $VPN_CONN_ID \
  --query 'VpnConnections[0].CustomerGatewayConfiguration' \
  --output text > aws-vpn-config.xml

# Ver el archivo
cat aws-vpn-config.xml
```

Este archivo contiene:
- **Pre-Shared Keys** (PSK) para los túneles
- **AWS VPN endpoints** (IPs públicas de AWS)
- **Parámetros IPsec** (algoritmos, lifetimes, etc.)

---

## 🔧 Paso 5: Configurar Router/Firewall en La Granja

Tienes **2 opciones** para configurar el lado de La Granja:

### **Opción A: strongSwan (Linux) - RECOMENDADA**

Si el servidor WireGuard corre en Linux, usar strongSwan para IPsec.

#### Instalación:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y strongswan

# CentOS/RHEL
sudo yum install -y strongswan
```

#### Configuración:

1. **Extraer información del archivo AWS**:
```bash
# Pre-Shared Keys (buscar en aws-vpn-config.xml)
PSK_TUNNEL_1="xxxxxxxxxxxxx"
PSK_TUNNEL_2="yyyyyyyyyyyyy"

# AWS VPN Endpoints
AWS_ENDPOINT_1="52.1.2.3"
AWS_ENDPOINT_2="34.5.6.7"
```

2. **Configurar `/etc/ipsec.conf`**:
```bash
sudo nano /etc/ipsec.conf
```

Agregar:
```ini
config setup
    charondebug="ike 2, knl 2, cfg 2, net 2, esp 2, dmn 2, mgr 2"

# Tunnel 1
conn aws-tunnel-1
    auto=start
    left=%defaultroute
    leftid=LA_GRANJA_PUBLIC_IP  # Tu IP pública
    leftsubnet=192.168.0.0/16   # Red de La Granja
    right=52.1.2.3               # AWS VPN Endpoint 1
    rightsubnet=10.0.0.0/16      # VPC CIDR (verificar en AWS)
    ike=aes128-sha1-modp1024!
    ikelifetime=8h
    esp=aes128-sha1-modp1024!
    lifetime=1h
    keyingtries=%forever
    type=tunnel
    dpddelay=10s
    dpdtimeout=30s
    dpdaction=restart
    authby=secret

# Tunnel 2 (redundancia)
conn aws-tunnel-2
    auto=start
    left=%defaultroute
    leftid=LA_GRANJA_PUBLIC_IP
    leftsubnet=192.168.0.0/16
    right=34.5.6.7               # AWS VPN Endpoint 2
    rightsubnet=10.0.0.0/16
    ike=aes128-sha1-modp1024!
    ikelifetime=8h
    esp=aes128-sha1-modp1024!
    lifetime=1h
    keyingtries=%forever
    type=tunnel
    dpddelay=10s
    dpdtimeout=30s
    dpdaction=restart
    authby=secret
```

3. **Configurar `/etc/ipsec.secrets`**:
```bash
sudo nano /etc/ipsec.secrets
```

Agregar:
```
LA_GRANJA_PUBLIC_IP 52.1.2.3 : PSK "xxxxxxxxxxxxx"
LA_GRANJA_PUBLIC_IP 34.5.6.7 : PSK "yyyyyyyyyyyyy"
```

4. **Iniciar IPsec**:
```bash
sudo systemctl enable strongswan
sudo systemctl start strongswan

# Verificar estado
sudo ipsec status
sudo ipsec statusall
```

---

### **Opción B: pfSense/OPNsense GUI**

Si tienes pfSense o OPNsense:

1. **VPN → IPsec → Tunnels → Add P1**
   - Remote Gateway: `52.1.2.3` (AWS Endpoint 1)
   - Authentication: Mutual PSK
   - Pre-Shared Key: (del archivo AWS)
   - Encryption Algorithm: AES 128
   - Hash Algorithm: SHA1
   - DH Group: 2 (1024 bit)

2. **Add P2 (Phase 2)**
   - Local Network: `192.168.0.0/16`
   - Remote Network: `10.0.0.0/16` (VPC CIDR)
   - Protocol: ESP
   - Encryption: AES 128
   - Hash: SHA1
   - PFS Group: 2

3. **Aplicar cambios y verificar en Status → IPsec**

---

## ✅ Paso 6: Verificar Conectividad

### Desde AWS (ECS Task):

```bash
# SSH a EC2 o usar ECS Exec
aws ecs execute-command \
  --cluster fluxion-cluster \
  --task <task-id> \
  --container backend \
  --command "/bin/bash" \
  --interactive

# Dentro del container
ping -c 3 192.168.20.55  # DNS de La Granja
ping -c 3 192.168.20.12  # SQL Server tienda_01

# Test SQL connectivity
telnet 192.168.20.12 14348
```

### Desde La Granja:

```bash
# Ping a ECS tasks (verificar IP privada en AWS Console)
ping -c 3 10.0.1.100  # Ejemplo: IP de ECS task

# Ver túneles IPsec
sudo ipsec status

# Ver tráfico
sudo tcpdump -i any host 52.1.2.3
```

---

## 📊 Monitoreo VPN

### AWS CloudWatch Metrics

```bash
# Ver estado de túneles
aws ec2 describe-vpn-connections \
  --vpn-connection-ids $VPN_CONN_ID \
  --query 'VpnConnections[0].VgwTelemetry'
```

Output esperado:
```json
[
  {
    "Status": "UP",
    "StatusMessage": "1 tunnel is up",
    "LastStatusChange": "2025-10-05T10:30:00Z",
    "OutsideIpAddress": "52.1.2.3"
  },
  {
    "Status": "UP",
    "StatusMessage": "1 tunnel is up",
    "LastStatusChange": "2025-10-05T10:30:00Z",
    "OutsideIpAddress": "34.5.6.7"
  }
]
```

### La Granja (strongSwan)

```bash
# Logs en tiempo real
sudo tail -f /var/log/syslog | grep charon

# Estado de túneles
sudo ipsec statusall
```

---

## 🔥 Troubleshooting

### Túnel no se levanta

**1. Verificar firewall en La Granja:**
```bash
# Permitir UDP 500 (IKE) y UDP 4500 (NAT-T)
sudo ufw allow 500/udp
sudo ufw allow 4500/udp

# O con iptables
sudo iptables -A INPUT -p udp --dport 500 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 4500 -j ACCEPT
```

**2. Verificar IP pública:**
```bash
# La IP configurada debe coincidir con la real
curl ifconfig.me
```

**3. Revisar PSK:**
```bash
# Asegurar que coincide con AWS
grep PSK /etc/ipsec.secrets
```

**4. Logs detallados:**
```bash
sudo ipsec stop
sudo ipsec start --nofork --debug-all
```

### Túnel UP pero no hay conectividad

**1. Verificar rutas:**
```bash
# Debe existir ruta a 10.0.0.0/16 via túnel
ip route show
```

**2. Verificar Security Groups en AWS:**
- ETL tasks deben tener Security Group que permite:
  - **Inbound**: Todo desde `192.168.0.0/16`
  - **Outbound**: Todo a `192.168.0.0/16`

**3. Test desde AWS:**
```bash
# Desde ECS task
traceroute 192.168.20.55
```

### Túnel intermitente

**1. Ajustar DPD (Dead Peer Detection):**
```bash
# En /etc/ipsec.conf
dpddelay=10s
dpdtimeout=30s
dpdaction=restart
```

**2. Verificar MTU:**
```bash
# En servidor La Granja
ip link set dev eth0 mtu 1400
```

---

## 💰 Costos Site-to-Site VPN

| Concepto | Precio | Cálculo | Total/mes |
|----------|--------|---------|-----------|
| **VPN Connection** | $0.05/hora | 720 hrs × $0.05 | $36 |
| **Data Transfer Out** | $0.09/GB | ~10GB × $0.09 | $0.90 |
| **Total Estimado** | | | **~$37/mes** |

**✅ Ventajas vs otras opciones:**
- Más barato que Client VPN ($108/mes)
- Toda la VPC tiene acceso (no solo ETL)
- Funciona con Fargate (no requiere EC2 privileged)

---

## 📋 Checklist de Implementación

- [ ] Obtener IP pública estática de La Granja
- [ ] Configurar `LA_GRANJA_PUBLIC_IP` env variable
- [ ] Deploy CDK stack: `cdk deploy`
- [ ] Descargar configuración VPN de AWS
- [ ] Extraer PSK y endpoints de config XML
- [ ] Instalar strongSwan en servidor La Granja
- [ ] Configurar `/etc/ipsec.conf`
- [ ] Configurar `/etc/ipsec.secrets`
- [ ] Abrir puertos firewall (500, 4500 UDP)
- [ ] Iniciar IPsec: `sudo systemctl start strongswan`
- [ ] Verificar túneles: `sudo ipsec status`
- [ ] Test conectividad desde AWS a `192.168.x.x`
- [ ] Test ETL job manual
- [ ] Configurar alarmas CloudWatch para túneles DOWN

---

## 🔄 Siguiente Paso

Una vez la VPN esté funcionando, los containers ECS podrán acceder directamente a:

- **SQL Servers**: `192.168.x.x:14348`
- **DNS Interno**: `192.168.20.55`
- **Toda la red**: `192.168.0.0/16`

Proceder con:
1. Guardar credenciales en Secrets Manager
2. Deploy completo: [QUICK_START_AWS.md](QUICK_START_AWS.md)
3. Test ETL job

---

## 📞 Soporte

- **AWS VPN Docs**: https://docs.aws.amazon.com/vpn/latest/s2svpn/
- **strongSwan Wiki**: https://wiki.strongswan.org/
- **pfSense IPsec**: https://docs.netgate.com/pfsense/en/latest/vpn/ipsec/
