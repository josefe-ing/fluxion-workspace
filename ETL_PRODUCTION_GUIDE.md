# Guía de ETL en Producción

## Estado Actual de Jobs Programados

### ✅ ETL Ventas (Funcionando)
Ejecuta **2 veces al día** para todas las tiendas:
- 🌅 **3:00 AM** (7:00 UTC) - `fluxion-ventas-etl-schedule-morning`
- 🌆 **2:00 PM** (18:00 UTC) - `fluxion-ventas-etl-schedule-afternoon`

### ⚠️ ETL Inventario (Solo Bosque)
Ejecuta **2 veces al día** solo para **Bosque (tienda_08)**:
- 🌅 **3:00 AM** (7:00 UTC) - `fluxion-etl-schedule-morning`
- 🌆 **2:00 PM** (18:00 UTC) - `fluxion-etl-schedule-afternoon`

**Nota:** El ETL de inventario NO está configurado para todas las tiendas automáticamente.

---

## Ejecutar ETL Manual en Producción

### Comando Rápido

```bash
# ETL de inventario para UNA tienda específica
./scripts/run_etl_production.sh tienda_08

# ETL de inventario para TODAS las tiendas
./scripts/run_etl_production.sh --todas
```

### Ejemplos de Uso

```bash
# Bosque (ya funciona automáticamente)
./scripts/run_etl_production.sh tienda_08

# Periférico
./scripts/run_etl_production.sh tienda_01

# Todas las tiendas activas (16 tiendas + 3 CEDIs)
./scripts/run_etl_production.sh --todas
```

### Ver Logs en Tiempo Real

Después de ejecutar el ETL, puedes ver los logs:

```bash
# Logs del ETL (últimos 10 minutos)
aws logs tail /aws/ecs/fluxion-etl --follow --since 10m

# Filtrar solo errores
aws logs tail /aws/ecs/fluxion-etl --follow --filter-pattern "ERROR"

# Ver logs de una tarea específica
aws logs tail /aws/ecs/fluxion-etl --follow --format short
```

### Verificar Estado de la Tarea

```bash
# Listar tareas corriendo
aws ecs list-tasks --cluster fluxion-cluster --family FluxionStackV2FluxionETLTask073145C9

# Ver detalles de una tarea específica
aws ecs describe-tasks --cluster fluxion-cluster --tasks <TASK_ID>
```

---

## Configuración Multi-Entorno

El sistema detecta automáticamente si está corriendo en local o producción:

### Local (Tu Mac)
```bash
# etl/.env
ETL_ENVIRONMENT=local
```
- Usa IPs directas: `192.168.x.x`
- Bosque: `192.168.150.10`

### Producción (AWS)
```bash
# etl/.env en ECS
ETL_ENVIRONMENT=production
```
- Usa WireGuard bridge: `10.0.2.244` para Bosque
- Otras tiendas: IPs según configuración de VPC

---

## Tiendas Configuradas

| ID | Nombre | IP Local | IP Producción | Estado |
|----|--------|----------|---------------|--------|
| tienda_01 | PERIFERICO | 192.168.20.12 | (mismo) | ✅ Activa |
| tienda_02 | AV. BOLIVAR | 192.168.30.52 | (mismo) | ✅ Activa |
| tienda_03 | MAÑONGO | 192.168.50.20 | (mismo) | ✅ Activa |
| tienda_04 | SAN DIEGO | 192.168.140.10 | (mismo) | ✅ Activa |
| tienda_05 | VIVIENDA | 192.168.80.10 | (mismo) | ✅ Activa |
| tienda_06 | NAGUANAGUA | 192.168.40.53 | (mismo) | ✅ Activa |
| tienda_07 | CENTRO | 192.168.130.10 | (mismo) | ✅ Activa |
| tienda_08 | BOSQUE | 192.168.150.10 | **10.0.2.244** | ✅ Activa |
| tienda_09 | GUACARA | 192.168.120.10 | (mismo) | ✅ Activa |
| tienda_10 | FERIAS | 192.168.70.10 | (mismo) | ✅ Activa |
| tienda_11 | FLOR AMARILLO | 192.168.160.10 | (mismo) | ✅ Activa |
| tienda_12 | PARAPARAL | 192.168.170.10 | (mismo) | ✅ Activa |
| tienda_13 | NAGUANAGUA III | 192.168.190.10 | (mismo) | ✅ Activa |
| tienda_15 | ISABELICA | 192.168.180.10 | (mismo) | ✅ Activa |
| tienda_16 | TOCUYITO | 192.168.110.10 | (mismo) | ✅ Activa |
| tienda_19 | GUIGUE | 192.168.210.10 | (mismo) | ✅ Activa |
| tienda_20 | TAZAJAL | 192.168.220.10 | (mismo) | ❌ Inactiva |
| cedi_seco | CEDI Seco | 192.168.90.20 | (mismo) | ✅ Activa |
| cedi_frio | CEDI Frio | 192.168.170.20 | (mismo) | ✅ Activa |
| cedi_verde | CEDI Verde | 192.168.200.10 | (mismo) | ✅ Activa |

---

## Troubleshooting

### Error: Task failed to start
```bash
# Verificar logs de CloudWatch
aws logs tail /aws/ecs/fluxion-etl --since 30m

# Verificar security group permite salida
aws ec2 describe-security-groups --group-ids <SG_ID>
```

### Error: No se puede conectar a tiendas
```bash
# Verificar que WireGuard está corriendo
aws ec2 describe-instances --instance-ids i-03d5aab7603955561 --query 'Reservations[0].Instances[0].State.Name'

# Debe retornar: "running"
```

### ETL se queda en PENDING
```bash
# Verificar capacidad del cluster
aws ecs describe-clusters --clusters fluxion-cluster

# Verificar subnet tiene IPs disponibles
aws ec2 describe-subnets --subnet-ids <SUBNET_ID>
```

---

## Próximos Pasos

### Opción A: Configurar ETL de Inventario Automático para Todas las Tiendas

Modificar en CDK para que corra `--todas` en vez de solo `tienda_08`:

```typescript
// infrastructure/lib/infrastructure-stack-encrypted.ts
environment: [
  { name: 'ETL_MODE', value: 'etl_inventario.py' },
  { name: 'ETL_ARGS', value: '--todas' },  // Cambiar de '--tienda tienda_08'
  { name: 'ETL_ENVIRONMENT', value: 'production' }
]
```

### Opción B: Crear Jobs Separados por Tienda

Crear múltiples EventBridge rules, uno por tienda, para mejor control.

### Opción C: Mantener Manual

Dejar Bosque automático (ya funciona) y ejecutar manualmente las demás cuando sea necesario.

---

## Credenciales

Las credenciales están en AWS Secrets Manager:
- Secret Name: `fluxion/etl/sql-credentials`
- Variables: `SQL_USER`, `SQL_PASS`, `SQL_ODBC_DRIVER`

Para actualizar:
```bash
aws secretsmanager update-secret \
  --secret-id fluxion/etl/sql-credentials \
  --secret-string '{"SQL_USER":"beliveryApp","SQL_PASS":"<nueva-password>"}'
```

---

## Contacto

Para problemas o preguntas sobre el ETL:
- Logs: `/aws/ecs/fluxion-etl`
- Task Definition: `FluxionStackV2FluxionETLTask073145C9:7`
- Cluster: `fluxion-cluster`
