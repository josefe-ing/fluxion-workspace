# WireGuard Port Mapping para Producción AWS

## Estrategia de Port Forwarding

El EC2 WireGuard (`i-03d5aab7603955561`, IP: `10.0.2.244`) actúa como bridge/proxy para todas las tiendas.

Cada tienda tiene asignado un puerto único en el WireGuard que redirige al puerto real de la tienda.

## Mapeo de Puertos

| Tienda ID | Nombre | IP Local | Puerto Local | Puerto WireGuard | Estado |
|-----------|--------|----------|--------------|------------------|--------|
| tienda_01 | PERIFERICO | 192.168.20.12 | 14348 | 14301 | 🔧 A configurar |
| tienda_02 | AV. BOLIVAR | 192.168.30.52 | 14348 | 14302 | 🔧 A configurar |
| tienda_03 | MAÑONGO | 192.168.50.20 | 14348 | 14303 | 🔧 A configurar |
| tienda_04 | SAN DIEGO | 192.168.140.10 | 14348 | 14304 | 🔧 A configurar |
| tienda_05 | VIVIENDA | 192.168.80.10 | 14348 | 14305 | 🔧 A configurar |
| tienda_06 | NAGUANAGUA | 192.168.40.53 | 14348 | 14306 | 🔧 A configurar |
| tienda_07 | CENTRO | 192.168.130.10 | 14348 | 14307 | 🔧 A configurar |
| tienda_08 | BOSQUE | 192.168.150.10 | 14348 | **14348** | ✅ Ya funciona |
| tienda_09 | GUACARA | 192.168.120.10 | 14348 | 14309 | 🔧 A configurar |
| tienda_10 | FERIAS | 192.168.70.10 | 14348 | 14310 | 🔧 A configurar |
| tienda_11 | FLOR AMARILLO | 192.168.160.10 | 14348 | 14311 | 🔧 A configurar |
| tienda_12 | PARAPARAL | 192.168.170.10 | 1433 | 14312 | 🔧 A configurar |
| tienda_13 | NAGUANAGUA III | 192.168.190.10 | 14348 | 14313 | 🔧 A configurar |
| tienda_15 | ISABELICA | 192.168.180.10 | 1433 | 14315 | 🔧 A configurar |
| tienda_16 | TOCUYITO | 192.168.110.10 | 1433 | 14316 | 🔧 A configurar |
| tienda_19 | GUIGUE | 192.168.210.10 | 1433 | 14319 | 🔧 A configurar |
| tienda_20 | TAZAJAL | 192.168.220.10 | 1433 | 14320 | ❌ Inactiva |
| cedi_seco | CEDI Seco | 192.168.90.20 | 1433 | 14401 | 🔧 A configurar |
| cedi_frio | CEDI Frio | 192.168.170.20 | 1433 | 14402 | 🔧 A configurar |
| cedi_verde | CEDI Verde | 192.168.200.10 | 1433 | 14403 | 🔧 A configurar |

## Configuración en WireGuard EC2

Conectarse al EC2 WireGuard:
```bash
aws ssm start-session --target i-03d5aab7603955561
```

### Opción A: Configurar iptables (Recomendado)

```bash
# Habilitar IP forwarding
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf

# Port forwarding para cada tienda
# Formato: sudo iptables -t nat -A PREROUTING -p tcp --dport [PUERTO_WG] -j DNAT --to-destination [IP_TIENDA]:[PUERTO_TIENDA]

# tienda_01 - PERIFERICO
sudo iptables -t nat -A PREROUTING -p tcp --dport 14301 -j DNAT --to-destination 192.168.20.12:14348
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.20.12 --dport 14348 -j MASQUERADE

# tienda_02 - AV. BOLIVAR
sudo iptables -t nat -A PREROUTING -p tcp --dport 14302 -j DNAT --to-destination 192.168.30.52:14348
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.30.52 --dport 14348 -j MASQUERADE

# tienda_03 - MAÑONGO
sudo iptables -t nat -A PREROUTING -p tcp --dport 14303 -j DNAT --to-destination 192.168.50.20:14348
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.50.20 --dport 14348 -j MASQUERADE

# tienda_04 - SAN DIEGO
sudo iptables -t nat -A PREROUTING -p tcp --dport 14304 -j DNAT --to-destination 192.168.140.10:14348
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.140.10 --dport 14348 -j MASQUERADE

# tienda_05 - VIVIENDA
sudo iptables -t nat -A PREROUTING -p tcp --dport 14305 -j DNAT --to-destination 192.168.80.10:14348
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.80.10 --dport 14348 -j MASQUERADE

# tienda_06 - NAGUANAGUA
sudo iptables -t nat -A PREROUTING -p tcp --dport 14306 -j DNAT --to-destination 192.168.40.53:14348
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.40.53 --dport 14348 -j MASQUERADE

# tienda_07 - CENTRO
sudo iptables -t nat -A PREROUTING -p tcp --dport 14307 -j DNAT --to-destination 192.168.130.10:14348
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.130.10 --dport 14348 -j MASQUERADE

# tienda_08 - BOSQUE (ya existe)
# sudo iptables -t nat -A PREROUTING -p tcp --dport 14348 -j DNAT --to-destination 192.168.150.10:14348

# tienda_09 - GUACARA
sudo iptables -t nat -A PREROUTING -p tcp --dport 14309 -j DNAT --to-destination 192.168.120.10:14348
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.120.10 --dport 14348 -j MASQUERADE

# tienda_10 - FERIAS
sudo iptables -t nat -A PREROUTING -p tcp --dport 14310 -j DNAT --to-destination 192.168.70.10:14348
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.70.10 --dport 14348 -j MASQUERADE

# tienda_11 - FLOR AMARILLO
sudo iptables -t nat -A PREROUTING -p tcp --dport 14311 -j DNAT --to-destination 192.168.160.10:14348
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.160.10 --dport 14348 -j MASQUERADE

# tienda_12 - PARAPARAL (puerto 1433)
sudo iptables -t nat -A PREROUTING -p tcp --dport 14312 -j DNAT --to-destination 192.168.170.10:1433
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.170.10 --dport 1433 -j MASQUERADE

# tienda_13 - NAGUANAGUA III
sudo iptables -t nat -A PREROUTING -p tcp --dport 14313 -j DNAT --to-destination 192.168.190.10:14348
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.190.10 --dport 14348 -j MASQUERADE

# tienda_15 - ISABELICA (puerto 1433)
sudo iptables -t nat -A PREROUTING -p tcp --dport 14315 -j DNAT --to-destination 192.168.180.10:1433
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.180.10 --dport 1433 -j MASQUERADE

# tienda_16 - TOCUYITO (puerto 1433)
sudo iptables -t nat -A PREROUTING -p tcp --dport 14316 -j DNAT --to-destination 192.168.110.10:1433
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.110.10 --dport 1433 -j MASQUERADE

# tienda_19 - GUIGUE (puerto 1433)
sudo iptables -t nat -A PREROUTING -p tcp --dport 14319 -j DNAT --to-destination 192.168.210.10:1433
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.210.10 --dport 1433 -j MASQUERADE

# cedi_seco
sudo iptables -t nat -A PREROUTING -p tcp --dport 14401 -j DNAT --to-destination 192.168.90.20:1433
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.90.20 --dport 1433 -j MASQUERADE

# cedi_frio
sudo iptables -t nat -A PREROUTING -p tcp --dport 14402 -j DNAT --to-destination 192.168.170.20:1433
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.170.20 --dport 1433 -j MASQUERADE

# cedi_verde
sudo iptables -t nat -A PREROUTING -p tcp --dport 14403 -j DNAT --to-destination 192.168.200.10:1433
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.200.10 --dport 1433 -j MASQUERADE

# Guardar las reglas para que persistan después de reboot
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

### Opción B: Script Automatizado

Crear archivo `/home/ubuntu/setup-port-forwarding.sh`:
```bash
#!/bin/bash
# Ver contenido completo en scripts/setup-wireguard-forwarding.sh
```

## Verificar Configuración

```bash
# Ver todas las reglas de NAT
sudo iptables -t nat -L -n -v

# Test de conectividad desde AWS
telnet 10.0.2.244 14301  # Debe conectar a PERIFERICO
```

## Actualizar Security Group

El Security Group del WireGuard debe permitir los puertos:
- 14301-14320 (tiendas)
- 14401-14403 (CEDIs)

```bash
aws ec2 authorize-security-group-ingress \
  --group-id <WIREGUARD_SG_ID> \
  --ip-permissions IpProtocol=tcp,FromPort=14301,ToPort=14320,IpRanges='[{CidrIp=10.0.0.0/16,Description="Tiendas forwarding"}]'

aws ec2 authorize-security-group-ingress \
  --group-id <WIREGUARD_SG_ID> \
  --ip-permissions IpProtocol=tcp,FromPort=14401,ToPort=14403,IpRanges='[{CidrIp=10.0.0.0/16,Description="CEDIs forwarding"}]'
```

## Notas

- **Bosque (14348)** ya funciona, no tocar
- Los puertos en el rango 14301-14320 están libres en el WireGuard
- Usar `iptables-persistent` para que las reglas sobrevivan reinicios
- El Security Group debe permitir los nuevos puertos desde el VPC (10.0.0.0/16)
