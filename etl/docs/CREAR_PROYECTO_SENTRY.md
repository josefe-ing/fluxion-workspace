# Cómo Crear el Proyecto en Sentry

## Opción Recomendada: Proyecto Separado para ETL

Te recomiendo crear un proyecto separado `fluxion-etl` por estas razones:

### Ventajas de Proyecto Separado

```
Proyectos en Sentry:
├── fluxion-backend      # API FastAPI (ya existe)
└── fluxion-etl          # Procesos ETL (NUEVO) ⭐
```

**Beneficios:**
1. **Dashboard dedicado de Cron Monitors** - Solo ves tus ETLs
2. **Alertas específicas** - Diferentes canales para backend vs ETL
3. **Team access** - Data team ve ETL, Backend team ve API
4. **Quotas separadas** - No contaminas cuota del backend con eventos ETL
5. **Organización clara** - Separa concerns de infraestructura

## Paso 1: Acceder a Sentry

1. Ve a https://sentry.io
2. Inicia sesión con tu cuenta
3. Selecciona tu organización (si tienes múltiples)

## Paso 2: Crear Nuevo Proyecto

### 2.1 Click en "Projects" en la barra lateral

![Projects Menu](https://docs.sentry.io/static/sidebar-projects.png)

### 2.2 Click en "Create Project"

Busca el botón azul en la esquina superior derecha.

### 2.3 Seleccionar Plataforma

1. En el campo de búsqueda, escribe: **"Python"**
2. Selecciona el ícono de **Python**

![Select Python Platform](https://docs.sentry.io/static/create-project-python.png)

### 2.4 Configurar Detalles del Proyecto

**Campos a llenar:**

1. **Project Name**: `fluxion-etl`
   - Este nombre aparecerá en el dashboard
   - Usa minúsculas y guiones

2. **Set your default alert settings**:
   - Selecciona: **"Alert me on every new issue"**
   - O: **"I'll create my own alerts later"** (recomendado)

3. **Assign a Team** (opcional):
   - Si tienes equipos configurados, asigna al team de Data/ETL
   - Si no, déjalo en el team por defecto

### 2.5 Click "Create Project"

El proyecto se creará en unos segundos.

## Paso 3: Copiar el DSN

Después de crear el proyecto, verás una pantalla de "Configure SDK":

### 3.1 Buscar el DSN

Verás algo como:

```python
import sentry_sdk

sentry_sdk.init(
    dsn="https://examplePublicKey@o0.ingest.sentry.io/0",  # ← Copia este valor
    # ...
)
```

### 3.2 Copiar SOLO el DSN

Copia el valor del `dsn`, que tiene este formato:

```
https://[public-key]@o[org-id].ingest.us.sentry.io/[project-id]
```

**Ejemplo real:**
```
https://abc123def456@o123456.ingest.us.sentry.io/789012
```

### 3.3 Guardar el DSN

Guarda este DSN de manera segura:
- En AWS Systems Manager Parameter Store
- En AWS Secrets Manager
- En tu archivo `.env` local (para testing)

**NUNCA** lo commits a git.

## Paso 4: Configurar Variables de Entorno

### Para Producción (AWS ECS)

#### Opción A: AWS Systems Manager Parameter Store (Recomendado)

```bash
# Crear parámetro seguro
aws ssm put-parameter \
  --name "/fluxion/etl/sentry-dsn" \
  --type "SecureString" \
  --value "https://[tu-dsn]@o[org-id].ingest.us.sentry.io/[project-id]"
```

Luego en tu ECS Task Definition:

```json
{
  "containerDefinitions": [{
    "name": "fluxion-etl",
    "secrets": [
      {
        "name": "SENTRY_DSN",
        "valueFrom": "/fluxion/etl/sentry-dsn"
      }
    ],
    "environment": [
      {
        "name": "SENTRY_ENVIRONMENT",
        "value": "production"
      },
      {
        "name": "SENTRY_TRACES_SAMPLE_RATE",
        "value": "0.1"
      }
    ]
  }]
}
```

#### Opción B: Directamente en Task Definition (menos seguro)

```json
{
  "containerDefinitions": [{
    "name": "fluxion-etl",
    "environment": [
      {
        "name": "SENTRY_DSN",
        "value": "https://[tu-dsn]@o[org-id].ingest.us.sentry.io/[project-id]"
      },
      {
        "name": "SENTRY_ENVIRONMENT",
        "value": "production"
      }
    ]
  }]
}
```

### Para Desarrollo Local

Crea un archivo `.env` en `etl/`:

```bash
cd etl
nano .env
```

Agrega:

```bash
# etl/.env
SENTRY_DSN="https://[tu-dsn]@o[org-id].ingest.us.sentry.io/[project-id]"
SENTRY_ENVIRONMENT="development"
SENTRY_TRACES_SAMPLE_RATE="0.1"
```

**Importante:** Asegúrate que `.env` esté en `.gitignore`:

```bash
# Verificar
grep -q "\.env" ../.gitignore && echo "✅ .env está en gitignore" || echo "❌ Agregar .env a gitignore"
```

Si no está, agrégalo:

```bash
echo ".env" >> ../.gitignore
```

## Paso 5: Verificar Instalación

### 5.1 Instalar dependencias

```bash
cd etl
pip install -r requirements.txt
```

### 5.2 Test rápido

Crea un archivo `test_sentry.py`:

```python
#!/usr/bin/env python3
"""Test de Sentry"""
import os
from dotenv import load_dotenv

# Cargar .env
load_dotenv()

# Import Sentry
import sentry_sdk
from sentry_sdk.crons import capture_checkin
from sentry_sdk.crons.consts import MonitorStatus

# Inicializar
sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment=os.getenv("SENTRY_ENVIRONMENT", "development"),
    traces_sample_rate=0.1
)

print("✅ Sentry inicializado")

# Enviar un check-in de prueba
check_in_id = capture_checkin(
    monitor_slug="test-monitor",
    status=MonitorStatus.OK,
    monitor_config={
        "schedule": {
            "type": "crontab",
            "value": "0 * * * *"
        },
        "checkin_margin": 5,
        "max_runtime": 10,
        "timezone": "America/Caracas"
    }
)

print(f"✅ Check-in enviado: {check_in_id}")
print("\n📊 Ve a https://sentry.io/crons/ para ver el monitor 'test-monitor'")
```

Ejecutar:

```bash
python3 test_sentry.py
```

Deberías ver:

```
✅ Sentry inicializado
✅ Check-in enviado: abc-123-def-456
📊 Ve a https://sentry.io/crons/ para ver el monitor 'test-monitor'
```

### 5.3 Verificar en Sentry UI

1. Ve a https://sentry.io/crons/
2. Selecciona el proyecto `fluxion-etl`
3. Deberías ver el monitor `test-monitor` con un check-in reciente ✅

## Paso 6: Configurar Alertas

### 6.1 Navegar a Cron Monitors

1. En Sentry, ve a **Crons** en la barra lateral
2. Selecciona proyecto `fluxion-etl`

### 6.2 Configurar Alertas Globales

1. Click en **Settings** (icono de engranaje)
2. Configura:

**Missed Check-In:**
- ✅ Enabled
- Notify: Email / Slack / PagerDuty

**Timeout:**
- ✅ Enabled
- Notify: Email / Slack

**Failure:**
- ✅ Enabled
- Notify: Email / Slack / PagerDuty

**Recovery:**
- ✅ Enabled (te avisa cuando se recupera)
- Notify: Email / Slack

### 6.3 Configurar Integración con Slack (Opcional)

1. Ve a **Settings** → **Integrations**
2. Busca "Slack"
3. Click "Install"
4. Autoriza el workspace
5. Selecciona canal (ej: `#fluxion-alerts` o `#data-alerts`)

Ahora recibirás alertas en Slack:

```
🚨 Fluxion ETL Alert

Monitor: etl-ventas-historico
Status: MISSED CHECK-IN ❌

Expected: Daily at 2:00 AM (America/Caracas)
Last check-in: 26 hours ago

This monitor has not checked in on schedule.

[View Monitor] [Mute Alerts]
```

## Paso 7: Configurar Schedules de tus ETLs

Edita `etl/core/sentry_cron_monitors.py`:

```python
CRON_MONITORS_CONFIG = {
    "etl_ventas_historico": {
        "schedule": {
            "type": "crontab",
            "value": "0 2 * * *"  # ← Ajusta al schedule real de tu cron
        },
        "checkin_margin": 30,
        "max_runtime": 180,
        "timezone": "America/Caracas"
    },
    # Agrega tus otros ETLs aquí
}
```

**Importante:** El schedule debe coincidir con tu EventBridge/cron real.

## Paso 8: Integrar en tus ETLs

### Método Simple: Context Manager

```python
#!/usr/bin/env python3
"""etl_ventas_historico.py"""

from sentry_etl import init_sentry_for_etl
from sentry_cron_monitors import cron_monitor

def main():
    # Inicializar Sentry (lee SENTRY_DSN del env)
    init_sentry_for_etl()

    # Monitorear ejecución
    with cron_monitor("etl_ventas_historico"):
        # Tu código ETL sin cambios
        procesar_ventas_historico()

if __name__ == "__main__":
    main()
```

## Resumen de URLs Importantes

Después de setup, guarda estos links:

- **Dashboard Crons**: https://sentry.io/crons/?project=[project-id]
- **Issues**: https://sentry.io/issues/?project=[project-id]
- **Settings**: https://sentry.io/settings/projects/fluxion-etl/
- **Alerts**: https://sentry.io/alerts/?project=[project-id]

## Troubleshooting

### No veo el check-in en Sentry

**Posibles causas:**

1. **DSN incorrecto**
   ```bash
   # Verificar que esté configurado
   echo $SENTRY_DSN
   ```

2. **Firewall/Security Group**
   - Asegúrate que tu servidor puede alcanzar `*.ingest.sentry.io`
   - Prueba: `curl https://sentry.io/api/`

3. **Versión de sentry-sdk**
   ```bash
   pip show sentry-sdk
   # Debe ser >= 2.0.0
   ```

4. **Variables de entorno no cargadas**
   ```python
   import os
   print(os.getenv("SENTRY_DSN"))  # Debe mostrar el DSN
   ```

### Los monitores no aparecen en el dashboard

- El primer check-in crea el monitor automáticamente
- Espera ~30 segundos después de ejecutar
- Refresca la página en Sentry

### Alertas no se envían

1. Ve a Cron Monitor → Settings
2. Verifica que las alertas estén **Enabled**
3. Verifica el **routing** (email, Slack, etc.)
4. Prueba manualmente: espera a que un check-in se pierda

## Siguiente Paso: Ejecutar Ejemplos

Ejecuta el script de ejemplos:

```bash
cd etl
python3 examples/etl_with_cron_monitor.py
```

Esto enviará múltiples check-ins de prueba a Sentry y podrás ver cómo funciona todo el sistema.

## Recursos

- [Documentación Sentry Crons](https://docs.sentry.io/product/crons/)
- [Python SDK Docs](https://docs.sentry.io/platforms/python/)
- [Guía Completa](./SENTRY_CRON_MONITORS_SETUP.md)
- [Quick Start](./QUICK_START_CRON_MONITORS.md)
