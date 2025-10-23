# Sentry Cron Monitors - Sistema de Monitoreo ETL

Monitoreo automático de tus procesos ETL con Sentry Cron Monitors.

## ¿Qué hace esto?

Sentry Cron Monitors detecta automáticamente:

- ❌ **Ejecuciones faltantes**: El ETL no se ejecutó cuando debía
- ⏱️ **Timeouts**: El ETL tardó más del tiempo esperado
- 💥 **Fallos**: El ETL terminó con error
- 📊 **Historial**: Timeline completo de todas las ejecuciones
- 📈 **Métricas**: Duración, success rate, etc.

## Quick Start (5 minutos)

### 1. Crear proyecto en Sentry

Sigue la guía: [docs/CREAR_PROYECTO_SENTRY.md](./docs/CREAR_PROYECTO_SENTRY.md)

### 2. Configurar variables de entorno

```bash
export SENTRY_DSN="https://[tu-dsn]@o[org-id].ingest.us.sentry.io/[project-id]"
export SENTRY_ENVIRONMENT="production"
```

### 3. Instalar dependencias

```bash
cd etl
pip install -r requirements.txt
```

### 4. Agregar a tu ETL

```python
from sentry_etl import init_sentry_for_etl
from sentry_cron_monitors import cron_monitor

def main():
    init_sentry_for_etl()

    with cron_monitor("etl_ventas_historico"):
        # Tu código ETL sin cambios
        tu_etl_existente()

if __name__ == "__main__":
    main()
```

### 5. Ver en Sentry

- https://sentry.io/crons/
- Selecciona proyecto `fluxion-etl`
- Verás tus monitores con check-ins ✅

## Archivos Creados

```
etl/
├── core/
│   ├── sentry_cron_monitors.py      # ⭐ Módulo principal de Cron Monitors
│   └── sentry_etl.py                # Actualizado con imports
│
├── docs/
│   ├── CREAR_PROYECTO_SENTRY.md     # 📖 Guía paso a paso para crear proyecto
│   ├── SENTRY_CRON_MONITORS_SETUP.md # 📚 Documentación completa
│   └── QUICK_START_CRON_MONITORS.md  # ⚡ Quick start (5 min)
│
├── examples/
│   └── etl_with_cron_monitor.py     # 💡 Ejemplos de uso
│
├── scripts/
│   └── configure_cron_monitors.py   # 🛠️ Configurador interactivo
│
├── requirements.txt                  # Actualizado con sentry-sdk
└── SENTRY_CRON_MONITORS_README.md   # Este archivo
```

## Documentación

### Para Empezar

1. **[Quick Start](./docs/QUICK_START_CRON_MONITORS.md)** ⚡
   - Guía de 5 minutos para empezar
   - Lo mínimo necesario

2. **[Crear Proyecto Sentry](./docs/CREAR_PROYECTO_SENTRY.md)** 📖
   - Paso a paso con screenshots
   - Configuración de variables de entorno
   - Troubleshooting

### Para Implementar

3. **[Setup Completo](./docs/SENTRY_CRON_MONITORS_SETUP.md)** 📚
   - Documentación completa
   - Todos los métodos de uso
   - Mejores prácticas
   - Integración AWS ECS
   - Configuración de alertas

### Para Probar

4. **[Ejemplos](./examples/etl_with_cron_monitor.py)** 💡
   - 10 ejemplos de uso
   - Context manager, decoradores, multi-store
   - Métricas custom
   - Manejo de errores

### Para Configurar

5. **[Configurador](./scripts/configure_cron_monitors.py)** 🛠️
   - Tool interactivo para configurar monitores
   - Ver configuración actual
   - Generar templates AWS EventBridge

## Uso Básico

### Context Manager (Recomendado)

```python
from sentry_cron_monitors import cron_monitor

# ETL simple
with cron_monitor("etl_ventas_historico"):
    procesar_ventas()

# ETL multi-store
for tienda_id in tiendas:
    with cron_monitor("etl_ventas_tienda", tienda_id=tienda_id):
        procesar_tienda(tienda_id)
```

### Decorador

```python
from sentry_cron_monitors import cron_monitor_decorator

@cron_monitor_decorator("etl_productos")
def procesar_productos():
    # Tu código ETL
    pass
```

### Combinar con Métricas Custom

```python
from sentry_cron_monitors import cron_monitor
from sentry_etl import SentryETLMonitor

with cron_monitor("etl_ventas_historico"):
    with SentryETLMonitor("ventas_historico") as monitor:
        registros = procesar()
        monitor.add_metric("registros", len(registros))
        monitor.set_success()
```

## Monitores Configurados

Por defecto, estos monitores están pre-configurados:

| Monitor | Schedule | Max Runtime | Descripción |
|---------|----------|-------------|-------------|
| `etl_ventas_historico` | Diario 2 AM | 3 horas | Carga histórica masiva |
| `etl_ventas_diario` | Cada 6 horas | 1 hora | Carga incremental diaria |
| `etl_stock_actual` | Cada 4 horas | 30 min | Actualización de stock |
| `etl_productos` | Diario 3 AM | 45 min | Catálogo de productos |
| `etl_ventas_tienda` | Cada 6 horas | 30 min | Por tienda (multi-store) |

### Ajustar Configuración

Edita [core/sentry_cron_monitors.py](./core/sentry_cron_monitors.py):

```python
CRON_MONITORS_CONFIG = {
    "mi_etl": {
        "schedule": {
            "type": "crontab",
            "value": "0 2 * * *"  # Diario a las 2 AM
        },
        "checkin_margin": 30,   # Margen antes de alertar
        "max_runtime": 120,     # Timeout en minutos
        "timezone": "America/Caracas"
    }
}
```

O usa el configurador interactivo:

```bash
python3 scripts/configure_cron_monitors.py
```

## Arquitectura

### Flow de Check-Ins

```
1. ETL inicia
   ↓
2. Enviar check-in IN_PROGRESS a Sentry
   ↓
3. Ejecutar código ETL
   ↓
4a. Si termina OK → check-in OK
4b. Si hay error → check-in ERROR
   ↓
5. Sentry compara con schedule esperado
   ↓
6. Si hay problema → Enviar alerta
```

### Detección de Problemas

**Ejecución Faltante:**
```
Schedule: Diario a las 2 AM
Margin: 30 minutos
→ Si no hay check-in a las 2:30 AM → ALERTA
```

**Timeout:**
```
Max Runtime: 2 horas
Inicio: 2:00 AM
→ Si no termina a las 4:00 AM → ALERTA
```

**Fallo:**
```
ETL lanza excepción
→ Check-in ERROR → ALERTA inmediata
```

## Integración con AWS

### EventBridge (Cron Jobs)

```json
{
  "scheduleExpression": "cron(0 2 * * ? *)",
  "target": {
    "arn": "arn:aws:ecs:us-east-1:123456:cluster/fluxion",
    "ecsParameters": {
      "taskDefinitionArn": "arn:aws:ecs:us-east-1:123456:task-definition/fluxion-etl"
    }
  }
}
```

**Importante:** El schedule de EventBridge debe coincidir con `CRON_MONITORS_CONFIG`.

### ECS Task Definition

```json
{
  "containerDefinitions": [{
    "name": "fluxion-etl",
    "environment": [
      {"name": "SENTRY_DSN", "value": "https://..."},
      {"name": "SENTRY_ENVIRONMENT", "value": "production"}
    ]
  }]
}
```

## Alertas

### Configurar en Sentry UI

1. Ve a https://sentry.io/crons/
2. Click en tu monitor
3. Click "Settings"
4. Habilitar:
   - ✅ Missed Check-In
   - ✅ Timeout
   - ✅ Failure
   - ✅ Recovery

### Canales de Notificación

- Email
- Slack
- PagerDuty
- Discord
- Webhooks
- MS Teams
- Opsgenie

### Ejemplo de Alerta Slack

```
🚨 Fluxion ETL Alert

Monitor: etl-ventas-historico
Status: TIMEOUT ⏱️

Started: 2:00 AM
Max Runtime: 2 hours
Current: 4:15 AM (still running)

[View Monitor] [Mute Alerts]
```

## Testing

### Ejecutar Ejemplos

```bash
cd etl
python3 examples/etl_with_cron_monitor.py
```

Esto envía check-ins de prueba a Sentry.

### Verificar en Sentry

1. Ve a https://sentry.io/crons/
2. Selecciona proyecto `fluxion-etl`
3. Deberías ver monitores con check-ins recientes

### Test Manual

```python
from sentry_cron_monitors import send_manual_checkin

# Enviar check-in OK
send_manual_checkin("test-monitor", "ok", duration=60.5)

# Enviar check-in ERROR
send_manual_checkin("test-monitor", "error", duration=30.2)
```

## Mejores Prácticas

### 1. Un Monitor por Job Lógico

```python
# ✅ BIEN
with cron_monitor("etl_ventas_historico"):
    procesar_todas_las_tiendas()

# ❌ MAL
with cron_monitor("etl_generico"):
    procesar_ventas()
    procesar_productos()
```

### 2. Multi-Store: Monitor por Tienda

```python
# ✅ BIEN: Visibilidad granular
for tienda_id in tiendas:
    with cron_monitor("etl_ventas_tienda", tienda_id=tienda_id):
        procesar_tienda(tienda_id)
```

### 3. Timeouts Realistas

```python
# Ajusta max_runtime según duración real
# Si tu ETL tarda ~1 hora, pon 90 minutos (1.5x)
"max_runtime": 90
```

### 4. Dejar Errores Propagarse

```python
# ✅ BIEN
with cron_monitor("etl_ventas"):
    procesar()  # Si falla → check-in ERROR

# ❌ MAL
with cron_monitor("etl_ventas"):
    try:
        procesar()
    except:
        pass  # Error silenciado, check-in será OK!
```

## Troubleshooting

### No veo check-ins

1. Verificar `SENTRY_DSN`:
   ```bash
   echo $SENTRY_DSN
   ```

2. Verificar conectividad:
   ```bash
   curl https://sentry.io/api/
   ```

3. Verificar versión de sentry-sdk:
   ```bash
   pip show sentry-sdk  # >= 2.0.0
   ```

### Alertas no se envían

1. Ve a Monitor → Settings en Sentry
2. Verifica que alertas estén **Enabled**
3. Verifica routing (email, Slack, etc.)

### Schedule no coincide

El schedule en Sentry debe coincidir con tu cron real:

```python
# CRON_MONITORS_CONFIG
"schedule": {"value": "0 2 * * *"}

# Debe coincidir con EventBridge
"scheduleExpression": "cron(0 2 * * ? *)"
```

## Recursos

- [Documentación Sentry Crons](https://docs.sentry.io/product/crons/)
- [Python SDK](https://docs.sentry.io/platforms/python/)
- [Guía Completa](./docs/SENTRY_CRON_MONITORS_SETUP.md)
- [Quick Start](./docs/QUICK_START_CRON_MONITORS.md)

## Soporte

Si tienes problemas:
1. Revisa [Troubleshooting](#troubleshooting)
2. Consulta [documentación completa](./docs/SENTRY_CRON_MONITORS_SETUP.md)
3. Revisa logs del ETL
4. Abre un issue

## Changelog

### 2025-10-23 - Implementación Inicial

- ✅ Módulo `sentry_cron_monitors.py`
- ✅ Integración con `sentry_etl.py`
- ✅ Documentación completa
- ✅ Ejemplos de uso
- ✅ Configurador interactivo
- ✅ Soporte multi-store
- ✅ 5 monitores pre-configurados

## Licencia

Internal use - Fluxion AI
