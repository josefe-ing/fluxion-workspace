# Instrucciones para Configurar WireGuard y Producción

## Resumen

Para que TODAS las tiendas funcionen en producción AWS, necesitas:

1. Configurar port forwarding en el EC2 WireGuard
2. Actualizar Security Group del WireGuard
3. Actualizar `tiendas_config.py` con mapeo de puertos
4. Modificar task definition de ETL para usar `--todas`
5. Push a GitHub y deploy

---

## Paso 1: Configurar Port Forwarding en WireGuard

### 1.1 Conectarse al EC2

```bash
aws ssm start-session --target i-03d5aab7603955561
```

### 1.2 Copiar el script al EC2

```bash
# Desde tu Mac, copia el script
cat scripts/setup-wireguard-forwarding.sh | pbcopy

# En el EC2, crea el archivo
nano /home/ubuntu/setup-forwarding.sh
# Pega el contenido (Cmd+V)
# Guardar: Ctrl+O, Enter, Ctrl+X

# Dar permisos
chmod +x /home/ubuntu/setup-forwarding.sh
```

### 1.3 Ejecutar el script

```bash
sudo /home/ubuntu/setup-forwarding.sh
```

**Salida esperada:**
```
✅ Port forwarding configurado exitosamente
   • Reglas configuradas: 18
```

### 1.4 Verificar configuración

```bash
# Ver todas las reglas NAT
sudo iptables -t nat -L -n -v | grep DNAT

# Debe mostrar ~18 reglas (una por tienda/CEDI)
```

---

## Paso 2: Actualizar Security Group

El Security Group del WireGuard debe permitir los nuevos puertos:

```bash
# Obtener Security Group ID
WIREGUARD_SG=$(aws ec2 describe-instances \
  --instance-ids i-03d5aab7603955561 \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' \
  --output text)

echo "WireGuard SG: $WIREGUARD_SG"

# Agregar reglas para puertos de tiendas (14301-14320)
aws ec2 authorize-security-group-ingress \
  --group-id $WIREGUARD_SG \
  --ip-permissions IpProtocol=tcp,FromPort=14301,ToPort=14320,IpRanges='[{CidrIp=10.0.0.0/16,Description="Tiendas port forwarding"}]'

# Agregar reglas para puertos de CEDIs (14401-14403)
aws ec2 authorize-security-group-ingress \
  --group-id $WIREGUARD_SG \
  --ip-permissions IpProtocol=tcp,FromPort=14401,ToPort=14403,IpRanges='[{CidrIp=10.0.0.0/16,Description="CEDIs port forwarding"}]'
```

---

## Paso 3: Actualizar `tiendas_config.py`

El archivo ya tiene las funciones `get_server_ip()` y `get_server_port()` necesarias.

**Necesitas actualizar cada tienda para usar:**

```python
"tienda_XX": TiendaConfig(
    ubicacion_id="tienda_XX",
    ubicacion_nombre="NOMBRE",
    server_ip=get_server_ip(
        local_ip="192.168.X.X",
        prod_ip=WIREGUARD_BRIDGE_IP  # 10.0.2.179
    ),
    database_name="VAD10",
    username=get_sql_user(),
    password=get_sql_pass(),
    port=get_server_port(
        local_port=14348,  # o 1433
        prod_port=143XX    # Puerto WireGuard específico
    ),
    activo=True,
    codigo_deposito="XXXX"
),
```

### Mapeo de Puertos de Producción:

| Tienda | Local Port | Prod Port (WireGuard) |
|--------|------------|-----------------------|
| tienda_01 | 14348 | **14301** |
| tienda_02 | 14348 | **14302** |
| tienda_03 | 14348 | **14303** |
| tienda_04 | 14348 | **14304** |
| tienda_05 | 14348 | **14305** |
| tienda_06 | 14348 | **14306** |
| tienda_07 | 14348 | **14307** |
| **tienda_08** | 14348 | **14348** (sin cambio) |
| tienda_09 | 14348 | **14309** |
| tienda_10 | 14348 | **14310** |
| tienda_11 | 14348 | **14311** |
| tienda_12 | 1433 | **14312** |
| tienda_13 | 14348 | **14313** |
| tienda_15 | 1433 | **14315** |
| tienda_16 | 1433 | **14316** |
| tienda_19 | 1433 | **14319** |
| cedi_seco | 1433 | **14401** |
| cedi_frio | 1433 | **14402** |
| cedi_verde | 1433 | **14403** |

**Ejemplo completo para tienda_01:**

```python
"tienda_01": TiendaConfig(
    ubicacion_id="tienda_01",
    ubicacion_nombre="PERIFERICO",
    server_ip=get_server_ip(
        local_ip="192.168.20.12",
        prod_ip=WIREGUARD_BRIDGE_IP
    ),
    database_name="VAD10",
    username=get_sql_user(),
    password=get_sql_pass(),
    port=get_server_port(
        local_port=14348,
        prod_port=14301
    ),
    activo=True,
    codigo_deposito="0102"
),
```

---

## Paso 4: Modificar CDK para ETL `--todas`

En `infrastructure/lib/infrastructure-stack-encrypted.ts`, buscar el task de ETL y cambiar:

```typescript
// ANTES:
environment: [
  { name: 'ETL_ARGS', value: '--tienda tienda_08' },
]

// DESPUÉS:
environment: [
  { name: 'ETL_ARGS', value: '--todas' },
]
```

---

## Paso 5: Deploy

```bash
# 1. Commit cambios
git add etl/core/tiendas_config.py infrastructure/
git commit -m "feat: configure all stores for production via WireGuard port forwarding"
git push origin main

# 2. Deploy CDK (si cambiaste el task definition)
cd infrastructure
cdk deploy FluxionStackV2

# 3. Verificar en GitHub Actions que el deploy fue exitoso
gh run list --limit 1
```

---

## Verificación Final

### Test desde tu Mac (Local - debe seguir funcionando):

```bash
cd etl
python3 etl_inventario.py --tienda tienda_01
```

### Test en Producción AWS:

```bash
./scripts/run_etl_production.sh --todas
```

### Ver logs:

```bash
export ETL_LOG_GROUP="FluxionStackV2-FluxionETLTasketlLogGroupEB088C6B-xzaljvRuwjkm"
aws logs tail $ETL_LOG_GROUP --follow --since 5m
```

**Debe mostrar:**
```
✅ Exitosos: 19/19
📈 Total registros cargados: ~50,000
```

---

## Troubleshooting

### Error: Connection timeout en producción

```bash
# Verificar que WireGuard está corriendo
aws ec2 describe-instances --instance-ids i-03d5aab7603955561 --query 'Reservations[0].Instances[0].State.Name'
# Debe retornar: "running"

# Verificar reglas iptables en WireGuard
aws ssm start-session --target i-03d5aab7603955561
sudo iptables -t nat -L -n -v | grep DNAT | wc -l
# Debe retornar: 18 o más
```

### Error: Security group no permite puerto

```bash
# Verificar que los puertos están abiertos
aws ec2 describe-security-groups --group-ids <WIREGUARD_SG> \
  --query 'SecurityGroups[0].IpPermissions[?FromPort>=`14301` && ToPort<=`14403`]'
```

---

## Rollback (si algo sale mal)

```bash
# 1. Revertir el último commit
git revert HEAD
git push origin main

# 2. O cambiar ETL_ARGS de vuelta a solo Bosque
# En CDK: ETL_ARGS='--tienda tienda_08'

# 3. Deploy
cd infrastructure
cdk deploy FluxionStackV2
```

---

## Notas Importantes

- **NO borres las reglas iptables de Bosque (puerto 14348)** - ya funciona
- **Bosque NO necesita cambios** en tiendas_config.py
- Las reglas iptables persisten después de reboot gracias a `iptables-persistent`
- Si agregas una tienda nueva, debes:
  1. Agregar regla iptables en WireGuard
  2. Agregar puerto al Security Group
  3. Actualizar tiendas_config.py

---

¿Listo para empezar? Sigue los pasos en orden y avísame si hay algún problema.
