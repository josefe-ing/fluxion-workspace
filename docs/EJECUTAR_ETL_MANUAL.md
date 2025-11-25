# Ejecutar ETL Manualmente en Producción

Guía para ejecutar los procesos ETL de inventario y ventas manualmente en producción.

## Endpoints Disponibles

### 1. ETL de Inventario (Stock Actual)

**Endpoint**: `POST https://d1tgnaj74tv17v.cloudfront.net/api/etl/sync`

**Descripción**: Ejecuta el ETL de inventario que actualiza el stock actual de todas las tiendas.

**Body (JSON)**:
```json
{
  "ubicacion_id": null
}
```

**Ejemplo con curl**:
```bash
curl -X POST https://d1tgnaj74tv17v.cloudfront.net/api/etl/sync \
  -H "Content-Type: application/json" \
  -d '{"ubicacion_id": null}' | jq
```

**Respuesta esperada**:
```json
{
  "success": true,
  "message": "ETL task being launched on ECS. Data will update when task completes.",
  "status": "running",
  "environment": "production",
  "ubicacion_id": null
}
```

---

### 2. ETL de Ventas Históricas

**Endpoint**: `POST https://d1tgnaj74tv17v.cloudfront.net/api/etl/ventas/sync`

**Descripción**: Ejecuta el ETL de ventas para un rango de fechas específico.

**Body (JSON)**:
```json
{
  "ubicacion_id": null,
  "fecha_inicio": "2025-11-23",
  "fecha_fin": "2025-11-24"
}
```

**Ejemplo con curl**:
```bash
# Ejecutar para ayer y hoy
curl -X POST https://d1tgnaj74tv17v.cloudfront.net/api/etl/ventas/sync \
  -H "Content-Type: application/json" \
  -d '{
    "ubicacion_id": null,
    "fecha_inicio": "2025-11-23",
    "fecha_fin": "2025-11-24"
  }' | jq
```

**Respuesta esperada**:
```json
{
  "success": true,
  "message": "ETL de ventas task being launched on ECS. Data will update when task completes.",
  "status": "running",
  "environment": "production",
  "fecha_inicio": "2025-11-23",
  "fecha_fin": "2025-11-24"
}
```

---

### 3. ETL Scheduler (Ejecución Programada)

**Endpoint**: `POST https://d1tgnaj74tv17v.cloudfront.net/api/etl/scheduler/trigger`

**Descripción**: Ejecuta el ETL programado manualmente (normalmente se ejecuta automáticamente a las 5:00 AM).

**Query Parameters**:
- `fecha_inicio` (opcional): Fecha inicial en formato YYYY-MM-DD (default: ayer)
- `fecha_fin` (opcional): Fecha final en formato YYYY-MM-DD (default: ayer)

**Ejemplo con curl**:
```bash
# Ejecutar con fechas por defecto (ayer)
curl -X POST https://d1tgnaj74tv17v.cloudfront.net/api/etl/scheduler/trigger | jq

# Ejecutar con rango de fechas específico
curl -X POST 'https://d1tgnaj74tv17v.cloudfront.net/api/etl/scheduler/trigger?fecha_inicio=2025-11-20&fecha_fin=2025-11-24' | jq
```

---

## Monitorear Ejecución

### 1. Estado del ETL de Inventario

```bash
curl https://d1tgnaj74tv17v.cloudfront.net/api/etl/status | jq
```

**Respuesta incluye**:
- `running`: Si está ejecutándose
- `progress`: Progreso 0-100%
- `message`: Mensaje de estado actual
- `logs`: Array de logs de la ejecución
- `result`: Resultado final cuando completa

---

### 2. Estado del ETL de Ventas

```bash
curl https://d1tgnaj74tv17v.cloudfront.net/api/etl/ventas/status | jq
```

**Respuesta incluye**:
- `running`: Si está ejecutándose
- `progress`: Progreso 0-100%
- `message`: Mensaje de estado actual
- `tiendas_status`: Estado por cada tienda
- `logs`: Array de logs de la ejecución
- `result`: Resultado final cuando completa

---

### 3. Estado del Scheduler

```bash
curl https://d1tgnaj74tv17v.cloudfront.net/api/etl/scheduler/status | jq
```

**Respuesta incluye**:
- `is_running`: Si el scheduler está activo
- `current_status`: Estado actual
- `next_scheduled_run`: Próxima ejecución programada
- `last_execution`: Información de última ejecución
- `config`: Configuración del scheduler

---

## Logs de ECS

### Ver logs en tiempo real

```bash
# 1. Obtener task ARN más reciente del ETL
TASK_ID=$(aws ecs list-tasks \
  --cluster fluxion-cluster \
  --family FluxionStackV2FluxionETLTask \
  --query 'taskArns[0]' \
  --output text | cut -d'/' -f3)

echo "Task ID: $TASK_ID"

# 2. Ver logs en CloudWatch
aws logs tail /ecs/fluxion-etl --follow --since 5m
```

### Ver logs de ventas

```bash
# Logs del ETL de ventas
aws logs tail /ecs/fluxion-etl-ventas --follow --since 5m
```

---

## Ejecuciones Programadas (Automáticas)

Los ETL se ejecutan automáticamente según este horario (hora de Venezuela UTC-4):

### ETL de Inventario
- **5:00 AM** - Ejecución diaria principal
- **3:00 PM** - Ejecución diaria secundaria

### ETL de Ventas
- **1:00 AM** - Ejecución diaria principal
- **2:00 PM** - Ejecución secundaria (DESHABILITADA)

Estos horarios están configurados en EventBridge Rules y no requieren intervención manual.

---

## Troubleshooting

### Error: "ETL ya está en ejecución"

Si recibes este error pero sospechas que el ETL está colgado:

```bash
# El sistema permite override automático después de 10 minutos de inactividad
# Para forzar reset manual, contactar al equipo de DevOps
```

### Verificar tasks ECS activas

```bash
# Ver tasks de inventario
aws ecs list-tasks \
  --cluster fluxion-cluster \
  --family FluxionStackV2FluxionETLTask

# Ver tasks de ventas
aws ecs list-tasks \
  --cluster fluxion-cluster \
  --family FluxionStackV2FluxionETLVentasTask

# Describir una task específica
aws ecs describe-tasks \
  --cluster fluxion-cluster \
  --tasks <TASK_ARN>
```

### Detener una task colgada

```bash
# Si una task está colgada, puedes detenerla manualmente
aws ecs stop-task \
  --cluster fluxion-cluster \
  --task <TASK_ARN> \
  --reason "Manual stop - task appeared hung"
```

---

## Casos de Uso Comunes

### 1. Actualizar inventario ahora (todas las tiendas)

```bash
curl -X POST https://d1tgnaj74tv17v.cloudfront.net/api/etl/trigger \
  -H "Content-Type: application/json" \
  -d '{"ubicacion_id": null}' | jq
```

### 2. Cargar ventas de los últimos 7 días

```bash
curl -X POST https://d1tgnaj74tv17v.cloudfront.net/api/etl/ventas/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "ubicacion_id": null,
    "fecha_inicio": "2025-11-17",
    "fecha_fin": "2025-11-24"
  }' | jq
```

### 3. Re-procesar ventas de un día específico

```bash
curl -X POST https://d1tgnaj74tv17v.cloudfront.net/api/etl/ventas/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "ubicacion_id": null,
    "fecha_inicio": "2025-11-20",
    "fecha_fin": "2025-11-20"
  }' | jq
```

### 4. Ejecutar ETL programado fuera de horario

```bash
curl -X POST https://d1tgnaj74tv17v.cloudfront.net/api/etl/scheduler/trigger | jq
```

---

## Notas Importantes

1. **Concurrencia**: Los ETL tienen protección contra ejecuciones concurrentes. Solo una instancia puede correr a la vez por tipo de ETL.

2. **Timeout**: Los ETL tienen un timeout de 2 horas (7200 segundos). Si no completan en ese tiempo, la task se detendrá automáticamente.

3. **Monitoreo**: Todas las ejecuciones son monitoreadas por Sentry. Los errores generan alertas automáticas.

4. **Base de Datos**: Los ETL escriben directamente a `/data/fluxion_production.db` en EFS, que es compartido por todos los containers.

5. **Logs**: Los logs de ejecución se mantienen en CloudWatch Logs por 30 días.

---

## URLs de Referencia

- **Frontend**: https://d20a0g9yxinot2.cloudfront.net
- **Backend API**: https://d1tgnaj74tv17v.cloudfront.net
- **API Docs**: https://d1tgnaj74tv17v.cloudfront.net/docs
- **GitHub Actions**: https://github.com/josefe-ing/fluxion-workspace/actions
- **CloudWatch Logs**: AWS Console → CloudWatch → Log Groups → /ecs/fluxion-etl*
