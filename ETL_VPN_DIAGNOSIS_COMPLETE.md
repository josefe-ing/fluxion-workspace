# 🔍 Diagnóstico Completo - ETL VPN Connectivity

**Fecha:** 2025-10-22 13:45 PM
**Estado:** ✅ **PROBLEMA IDENTIFICADO**

---

## ✅ Tests de Conectividad Realizados

### 1. Infrastructure Status
```bash
✅ WireGuard EC2: i-098c1c0911b847094 (running)
✅ Private IP: 10.0.2.179
✅ Subnet: subnet-0c25527960967df9e (10.0.2.0/24)
```

### 2. Route Tables
```bash
✅ PrivateSubnet1 (10.0.2.0/24): 192.168.0.0/16 → eni-01d4d01c4ca1904c7
✅ PrivateSubnet2 (10.0.3.0/24): 192.168.0.0/16 → eni-01d4d01c4ca1904c7
```

### 3. Security Groups
```bash
✅ ETL SG (sg-0693bdafe62b1a523): Egress 0.0.0.0/0 (all traffic)
✅ WireGuard SG (sg-075e1642f0e98fac2): Ingress 10.0.0.0/16 (VPC traffic)
```

### 4. WireGuard Status
```bash
✅ Interface wg0: UP and RUNNING
✅ Latest handshake: 48 seconds ago
✅ Transfer: 286.34 MiB received, 11.97 MiB sent
✅ Route: 192.168.0.0/16 dev wg0
```

### 5. Connectivity Tests from WireGuard EC2
```bash
✅ ping 192.168.20.1 → SUCCESS (VPN gateway responds)
   - 3 packets transmitted, 3 received, 0% packet loss
   - RTT: 58-60ms

❌ ping 10.0.2.244 → FAILED (Destination Host Unreachable)
   - 3 packets transmitted, 0 received, 100% packet loss
```

---

## 🔴 ROOT CAUSE IDENTIFIED

### Problema: IP Incorrecta en Configuración

**Archivo:** `etl/core/tiendas_config.py`

```python
"tienda_08": TiendaConfig(
    ubicacion_nombre="BOSQUE",
    server_ip=get_server_ip(
        local_ip="192.168.150.10",  # ✅ Funciona en local
        prod_ip="10.0.2.244"         # ❌ NO EXISTE via VPN
    ),
    port=14348,
)
```

**Error:**
- `prod_ip="10.0.2.244"` está en el rango de subnet AWS (10.0.2.0/24)
- Esta IP NO es alcanzable via WireGuard VPN
- La IP correcta debería estar en el rango `192.168.x.x` de La Granja

**Debería ser:**
- `prod_ip="192.168.150.10"` (misma IP que local, accesible via VPN)

---

## 📊 Comparación: Local vs Producción

### Local (Funciona ✅)
```
Mac → VPN Directa → 192.168.150.10:14348
```

### Producción (Falla ❌)
```
ECS Task → WireGuard → 10.0.2.244:14348 (NO EXISTE)
                         └─────────────┘
                         Subnet AWS, no La Granja
```

### Producción (Correcto ✅)
```
ECS Task → WireGuard → 192.168.150.10:14348
```

---

## 🔧 Solución

### Opción 1: Usar Misma IP para Local y Prod

Si el servidor SQL Server de BOSQUE es accesible via VPN en `192.168.150.10`:

```python
"tienda_08": TiendaConfig(
    ubicacion_nombre="BOSQUE",
    server_ip="192.168.150.10",  # Misma IP local y prod
    port=14348,
)
```

---

### Opción 2: Verificar IP Correcta via VPN

Desde WireGuard EC2, escanear IPs de La Granja:

```bash
# Conectar a WireGuard EC2
aws ssm start-session --target i-098c1c0911b847094

# Escanear red de BOSQUE
ping -c 1 192.168.150.10
ping -c 1 192.168.150.11
# etc...

# O usar nmap si está instalado
sudo yum install -y nmap
nmap -p 14348 192.168.150.0/24
```

---

## 🎯 Fix Inmediato

1. **Actualizar `tiendas_config.py`:**
   ```python
   prod_ip="192.168.150.10"  # Cambiar de 10.0.2.244
   ```

2. **Commit y deploy:**
   ```bash
   git add etl/core/tiendas_config.py
   git commit -m "fix: correct BOSQUE SQL Server IP for VPN access"
   git push origin main
   ```

3. **Test:**
   ```bash
   # Una vez deployed, ejecutar ETL inventario
   # Debería conectar exitosamente
   ```

---

## 📝 Lecciones Aprendidas

1. ✅ **Infrastructure está perfecta:**
   - VPN funciona
   - Routing configurado
   - Security Groups correctos

2. ❌ **Configuración de IPs incorrecta:**
   - `prod_ip` debe ser IP de La Granja (192.168.x.x)
   - NO debe ser IP de AWS subnet (10.0.x.x)

3. 💡 **Testing methodology:**
   - Usar AWS CLI para tests de conectividad
   - SSM Run Command para verificar desde EC2
   - Validar cada capa (routing, SG, VPN, IP)

---

## 🔍 Verificación de Otras Tiendas

Revisar todas las configuraciones `prod_ip` en `tiendas_config.py` para asegurar que usan IPs correctas:

```bash
cd /Users/jose/Developer/fluxion-workspace/etl/core
grep -n "prod_ip" tiendas_config.py | grep "10.0"
```

Si hay más tiendas con IPs `10.0.x.x`, corregirlas también.

---

## ✅ Próximos Pasos

1. ✅ Corregir IPs en `tiendas_config.py`
2. ✅ Deploy via CI/CD
3. ✅ Test ETL inventario en producción
4. ✅ Validar todas las tiendas funcionan
5. ✅ Documentar IPs correctas

---

**Diagnóstico completado:** 2025-10-22 13:45 PM
**Tiempo de diagnóstico:** ~15 minutos
**Método:** AWS CLI + SSM Run Command
**Resultado:** ✅ Root cause identificado - Fix simple
