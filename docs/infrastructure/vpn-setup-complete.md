
# ✅ VPN WireGuard Bridge - Setup Completo

**Fecha**: 2025-10-06
**Estado**: ✅ Operacional
**Tipo**: EC2 WireGuard Bridge

---

## 📊 Resumen Ejecutivo

Se configuró exitosamente un **VPN bridge usando WireGuard** entre AWS y La Granja Mercado, permitiendo que las ECS tasks en AWS accedan a los SQL Servers de las 17 tiendas y 3 CEDIs.

### Costos
- **EC2 t3.micro**: ~$7/mes
- **Alternativa descartada (Site-to-Site VPN)**: $36/mes
- **Ahorro**: $29/mes ($348/año)

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│ AWS VPC (10.0.0.0/16)                                          │
│                                                                 │
│  ┌──────────────┐         ┌─────────────────┐                 │
│  │ ECS Tasks    │────────▶│ EC2 WireGuard   │                 │
│  │ (Private)    │         │ Bridge          │                 │
│  │              │         │ 10.0.2.100      │                 │
│  └──────────────┘         └────────┬────────┘                 │
│                                    │                            │
│                         Route: 192.168.0.0/16 → wg0           │
└────────────────────────────────────┼───────────────────────────┘
                                     │
                                     │ WireGuard Tunnel
                                     │ (UDP 51820)
                                     │
┌────────────────────────────────────▼───────────────────────────┐
│ La Granja Network (192.168.0.0/16)                            │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ SQL Server   │  │ SQL Server   │  │ SQL Server   │        │
│  │ Tienda 08    │  │ Tienda 07    │  │ Tienda 11    │        │
│  │ :14348       │  │ :14348       │  │ :1433        │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                 │
│  ... 17 tiendas + 3 CEDIs accesibles                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Componentes Desplegados

### 1. EC2 WireGuard Bridge
- **Instance ID**: `i-0831b29e47bdadd07`
- **IP Privada**: `10.0.2.100`
- **AMI**: Amazon Linux 2023
- **Instance Type**: t3.micro
- **Subnet**: Private (sin IP pública)
- **Acceso**: AWS Systems Manager (SSM)

### 2. WireGuard Configuration
- **Interface**: wg0
- **IP Tunnel**: `10.32.0.24/32`
- **Endpoint**: `f0270ee31a20.sn.mynetname.net:51820` (190.6.32.3)
- **Allowed IPs**: `192.168.0.0/16`
- **Persistent Keepalive**: 25 seconds

### 3. Security
- **WireGuard Credentials**: Almacenadas en Secrets Manager (`fluxion/wireguard-config`)
- **SQL Credentials**: Almacenadas en Secrets Manager (`fluxion/sql-credentials`)
- **Security Group**: Permite tráfico desde VPC hacia EC2
- **IAM Role**: Acceso SSM + Secrets Manager

### 4. Routing
- **VPC Route Tables**: Todo tráfico `192.168.0.0/16` → EC2 bridge
- **EC2 NAT**: iptables MASQUERADE en interfaz wg0
- **IP Forwarding**: Habilitado

---

## ✅ Verificación de Conectividad

### Test realizado: 2025-10-06

**Desde EC2 WireGuard Bridge:**

| Ubicación | IP | Puerto | Estado |
|-----------|----|----|--------|
| ✅ BOSQUE (tienda_08) | 192.168.150.10 | 14348 | OK |
| ✅ CENTRO (tienda_07) | 192.168.130.10 | 14348 | OK |
| ✅ FLOR AMARILLO (tienda_11) | 192.168.160.10 | 1433 | OK |
| ✅ GUACARA (tienda_09) | 192.168.120.10 | 14348 | OK |
| ✅ TOCUYITO (tienda_16) | 192.168.110.10 | 1433 | OK |
| ✅ CEDI SECO | 192.168.90.20 | 1433 | OK |

**Resultado**: 100% conectividad verificada en test sample

---

## 📋 Ubicaciones Disponibles

### Tiendas Activas (10)
- **tienda_04**: SAN DIEGO (192.168.140.10:14348)
- **tienda_07**: CENTRO (192.168.130.10:14348) ✅ Verificada
- **tienda_08**: BOSQUE (192.168.150.10:14348) ✅ Verificada
- **tienda_09**: GUACARA (192.168.120.10:14348) ✅ Verificada
- **tienda_11**: FLOR AMARILLO (192.168.160.10:1433) ✅ Verificada
- **tienda_12**: PARAPARAL (192.168.170.10:1433)
- **tienda_13**: NAGUANAGUA III (192.168.190.10:14348)
- **tienda_15**: ISABELICA (192.168.180.10:1433)
- **tienda_16**: TOCUYITO (192.168.110.10:1433) ✅ Verificada
- **tienda_19**: GUIGUE (192.168.210.10:1433)

### CEDIs (3)
- **cedi_seco**: CEDI Seco (192.168.90.20:1433) ✅ Verificada
- **cedi_frio**: CEDI Frio (192.168.170.20:1433)
- **cedi_verde**: CEDI Verde (192.168.200.10:1433)

---

## 🔐 Credenciales

### SQL Server
```
Usuario: beliveryApp
Password: AxPG_25!
```

**Almacenado en**: `fluxion/sql-credentials` (Secrets Manager)

### WireGuard
**Almacenado en**: `fluxion/wireguard-config` (Secrets Manager)

---

## 🚀 Cómo Usar

### 1. Desde ECS Task (Python)
```python
import pyodbc
import json
import boto3

# Obtener credenciales
secretsmanager = boto3.client('secretsmanager')
secret = secretsmanager.get_secret_value(SecretId='fluxion/sql-credentials')
creds = json.loads(secret['SecretString'])

# Conectar a tienda
conn = pyodbc.connect(
    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
    f"SERVER=192.168.150.10,14348;"
    f"DATABASE=VAD10;"
    f"UID={creds['username']};"
    f"PWD={creds['password']};"
    f"TrustServerCertificate=yes;"
)
```

### 2. Verificar VPN Status
```bash
# Conectar a EC2 vía SSM
aws ssm start-session --target i-0831b29e47bdadd07

# Ver status WireGuard
sudo wg show

# Ver rutas
ip route show

# Test conectividad
ping 192.168.150.10
nc -zv 192.168.150.10 14348
```

### 3. Ejecutar ETL
El ETL de inventario puede ejecutarse ahora que la VPN está activa. Ver documentación en `etl/README.md`.

---

## 🔍 Monitoreo

### Verificar Handshake VPN
```bash
aws ssm send-command \
  --instance-ids i-0831b29e47bdadd07 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["sudo wg show"]'
```

**Esperado**: `latest handshake: X seconds ago` (debe ser < 60 segundos)

### Ver logs WireGuard
```bash
aws ssm send-command \
  --instance-ids i-0831b29e47bdadd07 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["sudo journalctl -u wg-quick@wg0 -n 50"]'
```

### Verificar rutas VPC
```bash
aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=vpc-0559fce1693b1fe10" \
  --query 'RouteTables[*].Routes[?DestinationCidrBlock==`192.168.0.0/16`]'
```

---

## ⚠️ Troubleshooting

### Síntoma: No hay conectividad a La Granja

1. **Verificar handshake WireGuard**:
   ```bash
   sudo wg show
   ```
   - Si no hay handshake reciente → Problema en La Granja
   - Si hay handshake pero no conectividad → Problema de rutas

2. **Verificar rutas en EC2**:
   ```bash
   ip route show | grep 192.168
   ```
   - Debe mostrar: `192.168.0.0/16 dev wg0 scope link`

3. **Verificar NAT**:
   ```bash
   sudo iptables -t nat -L -n -v
   ```
   - Debe tener regla MASQUERADE en wg0

4. **Reiniciar WireGuard**:
   ```bash
   sudo systemctl restart wg-quick@wg0
   sudo wg show
   ```

### Síntoma: EC2 no responde

1. **Verificar instance status**:
   ```bash
   aws ec2 describe-instance-status --instance-ids i-0831b29e47bdadd07
   ```

2. **Ver logs del UserData script**:
   ```bash
   aws ssm send-command \
     --instance-ids i-0831b29e47bdadd07 \
     --document-name "AWS-RunShellScript" \
     --parameters 'commands=["cat /var/log/cloud-init-output.log"]'
   ```

3. **Reiniciar instancia** (último recurso):
   ```bash
   aws ec2 reboot-instances --instance-ids i-0831b29e47bdadd07
   ```

### Síntoma: ISP de La Granja cambió

Si La Granja está usando la IP backup (190.120.249.111):

1. **Actualizar DNS resolución**:
   ```bash
   dig +short f0270ee31a20.sn.mynetname.net
   ```

2. **Reiniciar WireGuard** (debería reconectarse automáticamente):
   ```bash
   sudo systemctl restart wg-quick@wg0
   ```

---

## 📚 Referencias

- **CDK Stack**: `infrastructure/lib/infrastructure-stack.ts`
- **WireGuard Config**: `docs/infrastructure/DELIVERY_wg1.conf`
- **Tiendas Config**: `etl/core/tiendas_config.py`
- **Test Script**: `etl/test_vpn_connectivity.py`

---

## 📝 Changelog

### 2025-10-06 - Initial Setup
- ✅ Deployed EC2 WireGuard bridge (t3.micro)
- ✅ Configured WireGuard tunnel to La Granja (190.6.32.3)
- ✅ Set up VPC routing (192.168.0.0/16 → EC2)
- ✅ Stored credentials in Secrets Manager
- ✅ Verified connectivity to 6 locations (100% success)
- ✅ Documented setup and procedures

---

## 🎯 Próximos Pasos

1. ✅ **VPN Setup** - Completado
2. ⏳ **Habilitar ETL Task** - Descomentar en CDK
3. ⏳ **Schedule ETL** - Configurar cron para corridas diarias
4. ⏳ **Monitoreo** - Configurar alertas CloudWatch
5. ⏳ **Documentación ETL** - Guía de operación

---

**Contacto**: josefe-ing
**Project**: Fluxion AI - La Granja Mercado
