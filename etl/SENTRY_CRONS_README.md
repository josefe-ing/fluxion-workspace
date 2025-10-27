# Sentry Crons - Monitoreo de ETL Jobs

Este documento explica cómo está configurado el monitoreo de los jobs de ETL usando Sentry Crons.

## 📊 Monitores Configurados

### 1. Ventas ETL
- **Slug**: `fluxion-ventas-etl`
- **Schedule**: Diario a la 1:00 AM Venezuela (5:00 AM UTC)
- **Cron**: `0 5 * * *`
- **Max Runtime**: 2 horas
- **Script**: `etl_ventas_multi_tienda.py`

### 2. Inventario ETL - Morning
- **Slug**: `fluxion-inventario-etl-morning`
- **Schedule**: Diario a las 5:00 AM Venezuela (9:00 AM UTC)
- **Cron**: `0 9 * * *`
- **Max Runtime**: 2 horas
- **Script**: `etl_inventario.py`

### 3. Inventario ETL - Afternoon
- **Slug**: `fluxion-inventario-etl-afternoon`
- **Schedule**: Diario a las 3:00 PM Venezuela (7:00 PM UTC)
- **Cron**: `0 19 * * *`
- **Max Runtime**: 2 horas
- **Script**: `etl_inventario.py`

## 🚀 Setup Inicial

### 1. Instalar Sentry CLI

```bash
npm install -g @sentry/cli
```

### 2. Autenticar con Sentry

```bash
sentry-cli login
```

### 3. Crear los Monitores

```bash
cd etl
./setup-sentry-monitors.sh
```

## 🔍 Cómo Funciona

### Check-ins Automáticos

El script `startup-etl.sh` envía automáticamente check-ins a Sentry en 3 momentos:

1. **Al inicio** (`in_progress`): Cuando el ETL comienza
2. **Al finalizar con éxito** (`ok`): Cuando el ETL termina correctamente
3. **Al fallar** (`error`): Cuando el ETL falla o hace timeout

### Variables de Entorno

El ETL necesita estas variables para reportar a Sentry:

- `SENTRY_DSN`: DSN de Sentry (ya configurado en AWS Secrets Manager)
- `ETL_SCHEDULE_TYPE`: `morning` o `afternoon` (configurado automáticamente por EventBridge)

### Flujo de Check-ins

```bash
# 1. Inicio del ETL
curl -X POST https://sentry.io/api/.../checkins/
  -d '{"status": "in_progress", "check_in_id": "uuid"}'

# 2. ETL ejecutándose...

# 3. Finalización
curl -X PUT https://sentry.io/api/.../checkins/{check_in_id}/
  -d '{"status": "ok", "duration": 1234}'
```

## 📈 Monitoreo en Sentry

### Ver Monitors

https://jose-felipe-lopez.sentry.io/crons/

### Alertas Configuradas

- **Missing Check-in**: Si el job no se ejecuta cuando debería
- **Timeout**: Si el job tarda más de 2 horas
- **Error**: Si el job falla
- **Recovery**: Cuando el job vuelve a funcionar después de fallar

### Configuración de Alertas

- **checkin_margin**: 10 minutos (tolerancia para inicio)
- **max_runtime**: 120 minutos (timeout máximo)
- **failure_issue_threshold**: 1 (crea issue al primer fallo)
- **recovery_threshold**: 1 (resuelve issue al primer éxito)

## 🧪 Testing

### Probar Check-in Manual

```bash
# Simular check-in de inicio
curl -X POST \
  "https://sentry.io/api/0/organization/jose-felipe-lopez/monitors/fluxion-ventas-etl/checkins/" \
  -H "Authorization: DSN $SENTRY_DSN" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "check_in_id": "test-123"}'

# Simular check-in de finalización
curl -X PUT \
  "https://sentry.io/api/0/organization/jose-felipe-lopez/monitors/fluxion-ventas-etl/checkins/test-123/" \
  -H "Authorization: DSN $SENTRY_DSN" \
  -H "Content-Type: application/json" \
  -d '{"status": "ok", "duration": 60}'
```

### Ejecutar ETL Manualmente con Sentry

```bash
# El ETL automáticamente enviará check-ins si SENTRY_DSN está configurado
cd etl
export SENTRY_DSN="your-dsn-here"
python3 etl_ventas_multi_tienda.py --todas
```

## 🔧 Troubleshooting

### Check-ins no aparecen en Sentry

1. Verificar que `SENTRY_DSN` esté configurado
2. Revisar logs del ETL para errores de curl
3. Verificar que el monitor exista en Sentry

### Monitor muestra "missed check-in"

- El ETL no se ejecutó a la hora esperada
- Revisar EventBridge rules en AWS
- Verificar que las tasks de ECS se estén lanzando

### Monitor muestra "timeout"

- El ETL tardó más de 2 horas
- Revisar logs de CloudWatch para ver dónde se atascó
- El script `startup-etl.sh` debería detener el proceso automáticamente

## 📝 Actualizar Schedules

Si cambias los schedules de los ETL en AWS:

1. Actualizar el archivo `.sentry/monitors.json`
2. Re-ejecutar `./setup-sentry-monitors.sh`
3. O actualizar manualmente en la UI de Sentry

## 🔗 Referencias

- [Sentry Crons Docs](https://docs.sentry.io/product/crons/)
- [Sentry CLI Docs](https://docs.sentry.io/cli/)
- [Check-in API](https://docs.sentry.io/api/crons/create-a-check-in/)
