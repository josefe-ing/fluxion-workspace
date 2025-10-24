# Sistema de Ventana de Mantenimiento Nocturna

## Resumen

Para resolver los problemas de concurrencia de DuckDB (solo permite 1 escritor a la vez), implementamos una **ventana de mantenimiento nocturna** donde:

- **Ventana**: 1:00 AM - 6:00 AM (hora de Venezuela, UTC-4)
- **Durante la ventana**: Backend detenido, ETL ejecutando
- **Fuera de la ventana**: Sistema operativo normal

## Arquitectura

```
1:00 AM
   │
   ├─> Backend Service: desired-count = 0 (detener)
   │
   ├─> Esperar que Backend termine (running-count = 0)
   │
   ├─> ETL Ventas: Ejecutar todas las tiendas
   │   └─> Extrae datos del día anterior
   │   └─> ~2-4 horas de ejecución
   │
   ├─> ETL Completa
   │
   └─> Backend Service: desired-count = 1 (reiniciar)

6:00 AM - Sistema operativo
```

## Componentes Implementados

### 1. Frontend: Página de Mantenimiento

**Archivo**: `frontend/src/components/MaintenancePage.tsx`

Componente React que muestra mensaje elegante:
- "Estamos recolectando la data"
- "Sistema disponible después de las 6:00 AM"
- Barra de progreso animada
- Tiempo restante estimado

**Integración**: `frontend/src/App.tsx`

```typescript
// Verifica estado cada 2 minutos
useEffect(() => {
  const checkMaintenance = async () => {
    const status = await checkMaintenanceStatus();
    setIsMaintenanceMode(status.is_maintenance);
  };

  checkMaintenance();
  const interval = setInterval(checkMaintenance, 2 * 60 * 1000);

  return () => clearInterval(interval);
}, []);

// Muestra MaintenancePage si is_maintenance = true
if (isMaintenanceMode) {
  return <MaintenancePage estimatedEndTime="6:00 AM" />;
}
```

### 2. Backend: Endpoint de Verificación

**Archivo**: `backend/main.py`

**Endpoint**: `GET /maintenance-status`

```python
@app.get("/maintenance-status")
async def get_maintenance_status():
    """
    Verifica si el sistema está en ventana de mantenimiento
    Ventana: 1:00 AM - 6:00 AM (Venezuela Time UTC-4)
    """
    venezuela_tz = ZoneInfo("America/Caracas")
    now_venezuela = datetime.now(venezuela_tz)

    is_maintenance = (
        now_venezuela.hour >= 1 and
        now_venezuela.hour < 6
    )

    return {
        "is_maintenance": is_maintenance,
        "current_time": now_venezuela.strftime("%H:%M:%S"),
        "maintenance_window": "1:00 AM - 6:00 AM",
        "estimated_end_time": "6:00 AM",
        "minutes_remaining": ...,
        "message": "Estamos recolectando la data..." if is_maintenance else "Sistema operativo"
    }
```

**Response Example**:
```json
{
  "is_maintenance": true,
  "current_time": "03:45:12",
  "maintenance_window": "1:00 AM - 6:00 AM",
  "timezone": "America/Caracas (UTC-4)",
  "estimated_end_time": "6:00 AM",
  "minutes_remaining": 135,
  "message": "Estamos recolectando la data. Sistema disponible después de las 6:00 AM"
}
```

### 3. Orchestrator Script

**Archivo**: `scripts/orchestrate_nightly_etl.sh`

Script Bash que coordina el proceso completo:

**Paso 1: Detener Backend**
```bash
aws ecs update-service \
  --cluster FluxionStackV2-FluxionCluster \
  --service FluxionStackV2-FluxionBackendService \
  --desired-count 0

# Esperar hasta running-count = 0 (máx 3 min)
```

**Paso 2: Ejecutar ETL**
```bash
aws ecs run-task \
  --task-definition FluxionStackV2-FluxionVentasETLTask \
  --overrides '{"containerOverrides": [{
    "name": "ventas-etl",
    "command": [
      "python3",
      "core/orquestador.py",
      "--todas-las-tiendas",
      "--fecha",
      "2025-10-23"
    ]
  }]}'

# Esperar hasta task STOPPED con exitCode=0 (máx 4 horas)
```

**Paso 3: Reiniciar Backend**
```bash
aws ecs update-service \
  --cluster FluxionStackV2-FluxionCluster \
  --service FluxionStackV2-FluxionBackendService \
  --desired-count 1

# Esperar hasta running-count = 1 (máx 5 min)
```

**Logging**: El script genera logs detallados con timestamps y colores.

### 4. EventBridge Scheduler (Pendiente)

Para programar la ejecución diaria a 1:00 AM, necesitas configurar:

#### Opción A: AWS EventBridge Rule (Manual via Console)

1. **Ir a AWS EventBridge Console**
2. **Crear Rule**:
   - Name: `fluxion-nightly-etl-orchestrator`
   - Schedule: `cron(0 5 * * ? *)`
     - Nota: EventBridge usa UTC, 5:00 UTC = 1:00 AM Venezuela (UTC-4)
   - Target: ECS Task
     - Task Definition: `FluxionStackV2-FluxionVentasETLTask`
     - Cluster: `FluxionStackV2-FluxionCluster`
     - Command override:
       ```json
       [
         "/bin/bash",
         "-c",
         "curl -o /tmp/orchestrate.sh https://raw.githubusercontent.com/tu-repo/main/scripts/orchestrate_nightly_etl.sh && chmod +x /tmp/orchestrate.sh && /tmp/orchestrate.sh"
       ]
       ```

#### Opción B: Lambda Function (Recomendado)

**Ventajas**:
- Más fácil de gestionar
- Mejor logging en CloudWatch
- Puede enviar notificaciones (SNS/Slack) en caso de error

**Archivo**: `aws/lambda/nightly_etl_orchestrator.py` (crear)

```python
import boto3
import os
from datetime import datetime, timedelta

ecs = boto3.client('ecs')
CLUSTER = os.environ['CLUSTER_NAME']
BACKEND_SERVICE = os.environ['BACKEND_SERVICE']
ETL_TASK_DEF = os.environ['ETL_TASK_DEFINITION']

def lambda_handler(event, context):
    print(f"🌙 Starting nightly ETL orchestration at {datetime.now()}")

    # 1. Stop backend
    print("🛑 Stopping backend service...")
    ecs.update_service(
        cluster=CLUSTER,
        service=BACKEND_SERVICE,
        desiredCount=0
    )

    # 2. Wait for backend to stop
    waiter = ecs.get_waiter('services_stable')
    waiter.wait(cluster=CLUSTER, services=[BACKEND_SERVICE])

    # 3. Run ETL
    print("🔄 Starting ETL task...")
    fecha_ayer = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')

    response = ecs.run_task(
        cluster=CLUSTER,
        taskDefinition=ETL_TASK_DEF,
        launchType='FARGATE',
        overrides={
            'containerOverrides': [{
                'name': 'ventas-etl',
                'command': [
                    'python3',
                    'core/orquestador.py',
                    '--todas-las-tiendas',
                    '--fecha',
                    fecha_ayer
                ]
            }]
        }
    )

    task_arn = response['tasks'][0]['taskArn']
    print(f"✅ ETL task started: {task_arn}")

    # 4. Wait for ETL to complete (async - Lambda no espera)
    # Nota: Para esperar completamente, necesitarías Step Functions

    # 5. Restart backend (se ejecuta inmediatamente - NO IDEAL)
    # TODO: Usar Step Functions para esperar ETL antes de reiniciar

    return {
        'statusCode': 200,
        'body': f'ETL orchestration started: {task_arn}'
    }
```

**EventBridge Rule para Lambda**:
```
Schedule: cron(0 5 * * ? *)  # 1:00 AM Venezuela = 5:00 AM UTC
Target: Lambda function nightly_etl_orchestrator
```

#### Opción C: AWS Step Functions (Más Robusto)

Step Functions permite orquestar todo el flujo con esperas, reintentos, y notificaciones.

**State Machine** (JSON):
```json
{
  "Comment": "Nightly ETL Orchestrator",
  "StartAt": "StopBackend",
  "States": {
    "StopBackend": {
      "Type": "Task",
      "Resource": "arn:aws:states:::ecs:updateService",
      "Parameters": {
        "Cluster": "FluxionStackV2-FluxionCluster",
        "Service": "FluxionStackV2-FluxionBackendService",
        "DesiredCount": 0
      },
      "Next": "WaitBackendStop"
    },
    "WaitBackendStop": {
      "Type": "Wait",
      "Seconds": 60,
      "Next": "RunETL"
    },
    "RunETL": {
      "Type": "Task",
      "Resource": "arn:aws:states:::ecs:runTask.sync",
      "Parameters": {
        "Cluster": "FluxionStackV2-FluxionCluster",
        "TaskDefinition": "FluxionStackV2-FluxionVentasETLTask",
        "LaunchType": "FARGATE",
        "Overrides": {
          "ContainerOverrides": [{
            "Name": "ventas-etl",
            "Command.$": "States.Array('python3', 'core/orquestador.py', '--todas-las-tiendas', '--fecha', $.fecha)"
          }]
        }
      },
      "Next": "StartBackend",
      "Catch": [{
        "ErrorEquals": ["States.ALL"],
        "Next": "StartBackend"
      }]
    },
    "StartBackend": {
      "Type": "Task",
      "Resource": "arn:aws:states:::ecs:updateService",
      "Parameters": {
        "Cluster": "FluxionStackV2-FluxionCluster",
        "Service": "FluxionStackV2-FluxionBackendService",
        "DesiredCount": 1
      },
      "End": true
    }
  }
}
```

**EventBridge Rule**:
```
Schedule: cron(0 5 * * ? *)
Target: Step Functions state machine
Input: {"fecha": "2025-10-23"}  # Calcular dinámicamente
```

## Deployment

### Hacer Efectivos los Cambios

1. **Commit y Push**:
```bash
cd /Users/jose/Developer/fluxion-workspace

git add frontend/src/components/MaintenancePage.tsx
git add frontend/src/services/maintenanceService.ts
git add frontend/src/App.tsx
git add backend/main.py
git add scripts/orchestrate_nightly_etl.sh
git add docs/VENTANA_MANTENIMIENTO.md

git commit -m "feat: implement nightly maintenance window to resolve DuckDB concurrency

- Add MaintenancePage component with elegant maintenance UI
- Add /maintenance-status endpoint to check maintenance window (1-6 AM)
- Integrate maintenance check in App.tsx (polls every 2 minutes)
- Create orchestrate_nightly_etl.sh to coordinate: stop backend → ETL → start backend
- Window: 1:00 AM - 6:00 AM Venezuela Time (UTC-4)
- Resolves DuckDB single-writer limitation without migration

🤖 Generated with Claude Code"

git push origin main
```

2. **Deploy via GitHub Actions**:
   - GitHub Actions auto-detecta push a `main`
   - Despliega backend con nuevo endpoint
   - Despliega frontend con MaintenancePage

3. **Configurar Scheduler** (elegir una opción):

   **Opción Simple - EventBridge con Script**:
   ```bash
   # Manual via AWS Console (15 minutos)
   # 1. EventBridge → Create Rule
   # 2. Schedule: cron(0 5 * * ? *)
   # 3. Target: Lambda que ejecuta orchestrate_nightly_etl.sh
   ```

   **Opción Recomendada - Step Functions**:
   ```bash
   # Más robusto pero requiere más setup (1-2 horas)
   # 1. Crear State Machine en Step Functions
   # 2. EventBridge → Create Rule → Target: State Machine
   # 3. Monitorear ejecuciones en Step Functions console
   ```

## Testing

### Test Manual del Flujo Completo

**1. Test de Endpoint de Mantenimiento**:
```bash
# Verificar que devuelve is_maintenance = false (fuera de ventana)
curl https://api.fluxionia.co/maintenance-status | jq

# Debería devolver:
{
  "is_maintenance": false,
  "current_time": "14:30:15",
  "message": "Sistema operativo"
}
```

**2. Test de Frontend**:
```bash
# Abrir navegador en https://granja.fluxionia.co
# Debería mostrar dashboard normal (fuera de ventana)

# Para simular mantenimiento, editar temporalmente backend/main.py:
# MAINTENANCE_START_HOUR = 0  # En lugar de 1
# MAINTENANCE_END_HOUR = 23   # En lugar de 6

# Rebuild y redeploy
# Frontend debería mostrar MaintenancePage
```

**3. Test de Orchestrator Script** (DRY RUN):
```bash
# Ejecutar localmente (sin afectar producción)
cd scripts
chmod +x orchestrate_nightly_etl.sh

# Comentar comandos aws ecs en el script para dry-run
# O ejecutar en staging environment

./orchestrate_nightly_etl.sh

# Verificar logs:
# ✅ Backend detenido
# ✅ ETL iniciado
# ✅ Backend reiniciado
```

**4. Test de Producción** (Primera Vez):
```bash
# Ejecutar manualmente a las 1:00 AM (o cualquier hora off-peak)
# Monitorear en tiempo real:

# Terminal 1: Logs de Backend
aws logs tail FluxionStackV2-FluxionBackendService --follow

# Terminal 2: Logs de ETL
aws logs tail FluxionStackV2-FluxionVentasETLTask --follow

# Terminal 3: Ejecutar orchestrator
./scripts/orchestrate_nightly_etl.sh

# Verificar:
# 1. Backend se detiene (desired count = 0)
# 2. ETL ejecuta sin errores de lock
# 3. ETL completa todas las tiendas
# 4. Backend reinicia (desired count = 1)
# 5. Frontend muestra MaintenancePage durante ventana
```

## Monitoreo Post-Deployment

### Métricas Clave

1. **Duración de ETL**:
   - Objetivo: < 4 horas (1:00 AM - 5:00 AM)
   - Actual: ~2-3 horas para 16 tiendas
   - Alarma si > 5 horas

2. **Tasa de Éxito de ETL**:
   - Objetivo: 100% de tiendas procesadas
   - Alarma si falla alguna tienda

3. **Downtime de Backend**:
   - Objetivo: 1:00 AM - 6:00 AM (5 horas)
   - Verificar que reinicia automáticamente

4. **Errores de Lock**:
   - Objetivo: 0 errores de "Conflicting lock is held"
   - Ahora que backend está detenido, NO debería haber conflictos

### CloudWatch Alarms (Recomendado)

```bash
# Crear alarmas para:
# 1. ETL duration > 5 horas
# 2. Backend no reinicia después de 6:00 AM
# 3. Errores en logs de orchestrator
```

## Rollback Plan

Si el sistema de ventana de mantenimiento causa problemas:

### Rollback Rápido (10 minutos):

```bash
# 1. Revertir cambios en backend
git revert HEAD
git push origin main

# 2. GitHub Actions auto-redeploy

# 3. Deshabilitar EventBridge Rule
aws events disable-rule --name fluxion-nightly-etl-orchestrator

# 4. Reiniciar backend manualmente si está detenido
aws ecs update-service \
  --cluster FluxionStackV2-FluxionCluster \
  --service FluxionStackV2-FluxionBackendService \
  --desired-count 1
```

## Próximos Pasos (Mejoras Futuras)

1. **Notificaciones**:
   - Slack/Email cuando ETL completa
   - Alertas si ETL falla

2. **Dashboard de Monitoreo**:
   - Panel en frontend para ver estado de ETL
   - Histórico de ejecuciones

3. **Optimización de Ventana**:
   - Si ETL termina en 2 horas, reiniciar backend a las 3:00 AM
   - Reducir downtime window

4. **Migración a MotherDuck** (mediano plazo):
   - Eliminar necesidad de ventana de mantenimiento
   - Ver [docs/DATABASE_EVALUATION_2025.md](./DATABASE_EVALUATION_2025.md)

## FAQ

**Q: ¿Por qué no usar PostgreSQL directamente?**
A: PostgreSQL resolvería concurrencia pero:
- 3x más lento para queries analíticos
- 15-20 días de migración
- $141/mes vs ventana de mantenimiento gratis
- Ver evaluación completa en `DATABASE_EVALUATION_2025.md`

**Q: ¿Qué pasa si un usuario intenta acceder a las 3:00 AM?**
A: Frontend muestra MaintenancePage con mensaje:
"Estamos recolectando la data. Sistema disponible después de las 6:00 AM"

**Q: ¿El sistema está 100% down durante la ventana?**
A: Sí. Backend detenido = no hay API. Pero:
- Ventana es 1:00 AM - 6:00 AM (bajo tráfico)
- Usuarios ven página elegante, no error 500
- 5 horas de downtime programado vs errores aleatorios 24/7

**Q: ¿Podemos acortar la ventana?**
A: Sí. Si ETL termina en 2 horas:
- Modificar orchestrator para reiniciar backend inmediatamente
- Ventana efectiva: 1:00 AM - 3:00 AM (2 horas)

**Q: ¿Qué pasa si ETL falla?**
A: Orchestrator SIEMPRE reinicia backend (incluso si ETL falla)
- Backend vuelve a las 6:00 AM máximo
- Logs indican qué tienda falló
- ETL se puede re-ejecutar manualmente

---

**Fecha de Implementación**: Octubre 24, 2025
**Autor**: jose-ing
**Estado**: Implementado (pendiente configurar EventBridge scheduler)
