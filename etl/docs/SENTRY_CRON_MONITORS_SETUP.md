# Sentry Cron Monitors - Guía de Configuración

## Descripción

Los **Cron Monitors** de Sentry detectan automáticamente:
- ❌ **Ejecuciones faltantes**: El job no se ejecutó cuando debía
- ⏱️ **Timeouts**: El job tardó más del tiempo esperado
- 💥 **Fallos**: El job terminó con error
- 📊 **Historial**: Timeline completo de todas las ejecuciones

![Sentry Cron Monitors Dashboard](https://docs.sentry.io/assets/crons-monitor-page.png)

## Paso 1: Crear Proyecto en Sentry (Recomendado)

Te recomiendo crear un proyecto separado para ETL:

### Opción A: Proyecto Separado (Recomendado) ⭐

```
Proyectos en Sentry:
├── fluxion-backend      # API FastAPI
└── fluxion-etl          # Procesos ETL (NUEVO)
```

**Ventajas:**
- Organización clara
- Alertas específicas para ETL
- No mezclar quotas/eventos
- Dashboard de cron jobs dedicado

**Pasos:**
1. Ve a https://sentry.io/organizations/[tu-org]/projects/
2. Click "Create Project"
3. Selecciona plataforma: **Python**
4. Nombre: `fluxion-etl`
5. Team: (tu team)
6. Copia el DSN que te da

### Opción B: Mismo Proyecto Backend

Si prefieres usar el mismo proyecto `fluxion-backend`:
- Usa tags para diferenciar: `component=etl`
- Los cron monitors aparecerán en el mismo dashboard

## Paso 2: Variables de Entorno

Agrega estas variables de entorno en tu servidor donde corren los ETLs:

### Para producción (AWS ECS, EC2, etc.)

```bash
# .env o AWS Systems Manager Parameter Store
SENTRY_DSN="https://[tu-dsn]@o[org-id].ingest.us.sentry.io/[project-id]"
SENTRY_ENVIRONMENT="production"
SENTRY_TRACES_SAMPLE_RATE="0.1"  # 10% de tracing
```

### Para desarrollo local

```bash
# etl/.env
SENTRY_DSN="https://[tu-dsn]@o[org-id].ingest.us.sentry.io/[project-id]"
SENTRY_ENVIRONMENT="development"
SENTRY_TRACES_SAMPLE_RATE="0.1"
```

### Para staging

```bash
SENTRY_DSN="https://[tu-dsn]@o[org-id].ingest.us.sentry.io/[project-id]"
SENTRY_ENVIRONMENT="staging"
SENTRY_TRACES_SAMPLE_RATE="0.5"  # Más tracing en staging
```

## Paso 3: Instalar Dependencias

```bash
cd etl
pip install -r requirements.txt
```

Esto instalará `sentry-sdk>=2.0.0` que incluye soporte para Cron Monitors.

## Paso 4: Usar Cron Monitors en tus ETLs

### Método 1: Context Manager (Recomendado)

```python
from sentry_cron_monitors import cron_monitor
from sentry_etl import init_sentry_for_etl

# Inicializar Sentry al inicio del script
init_sentry_for_etl()

def etl_ventas_historico():
    # Wrapper con cron monitor
    with cron_monitor("etl_ventas_historico"):
        # Tu código ETL normal
        extraer_datos()
        transformar_datos()
        cargar_datos()
```

### Método 2: Decorador

```python
from sentry_cron_monitors import cron_monitor_decorator
from sentry_etl import init_sentry_for_etl

init_sentry_for_etl()

@cron_monitor_decorator("etl_ventas_diario")
def procesar_ventas_diarias():
    # Tu código ETL
    pass
```

### Método 3: Multi-Store (cada tienda = un monitor)

```python
from sentry_cron_monitors import cron_monitor

def procesar_tienda(tienda_id: str, fecha: date):
    # Cada tienda tiene su propio monitor:
    # - etl-ventas-tienda-tienda01
    # - etl-ventas-tienda-tienda02
    # etc.
    with cron_monitor("etl_ventas_tienda", tienda_id=tienda_id):
        extraer_ventas(tienda_id, fecha)
```

## Paso 5: Configurar Schedules

Los schedules están definidos en `sentry_cron_monitors.py`:

```python
CRON_MONITORS_CONFIG = {
    "etl_ventas_historico": {
        "schedule": {
            "type": "crontab",
            "value": "0 2 * * *"  # Diario a las 2 AM
        },
        "checkin_margin": 30,  # minutos de margen
        "max_runtime": 180,    # timeout en minutos
        "timezone": "America/Caracas"
    },
    "etl_ventas_diario": {
        "schedule": {
            "type": "crontab",
            "value": "0 */6 * * *"  # Cada 6 horas
        },
        "checkin_margin": 15,
        "max_runtime": 60,
        "timezone": "America/Caracas"
    }
}
```

### Ajustar Schedules a tu Realidad

Edita `etl/core/sentry_cron_monitors.py` según tus cron jobs reales:

```python
# Ejemplo: ETL que corre cada 4 horas
"etl_stock_actual": {
    "schedule": {
        "type": "crontab",
        "value": "0 */4 * * *"  # Cada 4 horas
    },
    "checkin_margin": 10,   # Si no se ejecuta en 10 min → alerta
    "max_runtime": 30,      # Si tarda más de 30 min → alerta
    "timezone": "America/Caracas"
}
```

### Tipos de Schedule

**Crontab:**
```python
"schedule": {
    "type": "crontab",
    "value": "0 2 * * *"  # Sintaxis cron
}
```

**Interval:**
```python
"schedule": {
    "type": "interval",
    "value": 6,
    "unit": "hour"  # hour, day, week, month
}
```

## Paso 6: Integrar en ETL Existente

### Opción A: Envolver el main() completo

```python
#!/usr/bin/env python3
"""etl_ventas_historico.py"""

from sentry_etl import init_sentry_for_etl
from sentry_cron_monitors import cron_monitor

def main():
    # Inicializar Sentry
    init_sentry_for_etl()

    # Envolver toda la ejecución
    with cron_monitor("etl_ventas_historico"):
        # Tu código ETL existente
        historico = VentasETLHistorico()
        historico.ejecutar_carga_completa()

if __name__ == "__main__":
    main()
```

### Opción B: Envolver por tienda (granular)

```python
def procesar_tienda(self, tienda_id: str, fecha_inicio: date, fecha_fin: date):
    # Cada tienda reporta independientemente
    with cron_monitor("etl_ventas_tienda", tienda_id=tienda_id):
        # Procesar esta tienda
        self._extraer_tienda(tienda_id, fecha_inicio, fecha_fin)
```

## Paso 7: Ver en Sentry Dashboard

1. Ve a https://sentry.io/crons/
2. Selecciona tu proyecto (`fluxion-etl` o `fluxion-backend`)
3. Verás lista de monitores:
   - `etl-ventas-historico`
   - `etl-ventas-diario`
   - `etl-ventas-tienda-tienda01`
   - etc.

4. Click en un monitor para ver:
   - Timeline de ejecuciones
   - Duración de cada ejecución
   - Success rate
   - Errores capturados

## Paso 8: Configurar Alertas

### En Sentry UI:

1. Ve al monitor específico
2. Click "Settings"
3. Configura:
   - **Missed Check-In**: Alerta si no se ejecuta
   - **Timeout**: Alerta si tarda demasiado
   - **Failure**: Alerta si falla
   - **Recovery**: Alerta cuando se recupera

4. Routing:
   - Email
   - Slack
   - PagerDuty
   - Discord
   - etc.

### Alertas por Email

```
To: data-team@tuempresa.com
Subject: [Sentry] etl-ventas-historico missed check-in

The monitor "etl-ventas-historico" has missed its expected check-in.

Expected: Daily at 2:00 AM (America/Caracas)
Last Check-In: 24 hours ago

View Monitor: https://sentry.io/crons/[monitor-slug]
```

### Alertas por Slack

Conecta Sentry con Slack para notificaciones en tiempo real:

```
🚨 Fluxion ETL - Alert
Monitor: etl-ventas-historico
Status: MISSED CHECK-IN ❌
Expected: Daily at 2:00 AM
Last seen: 24 hours ago

[View in Sentry]
```

## Paso 9: Testing

### Test Local

```bash
cd etl/examples
python3 etl_with_cron_monitor.py
```

Este script de ejemplo:
- Envía check-ins a Sentry
- Demuestra diferentes escenarios
- Puedes ver los resultados en Sentry inmediatamente

### Verificar en Sentry

1. Ejecuta el script de ejemplo
2. Ve a Sentry → Crons
3. Deberías ver los monitores con check-ins recientes

## Ejemplo Completo: Integrar en tu ETL

```python
#!/usr/bin/env python3
"""
etl_ventas_historico.py - Con Sentry Cron Monitors
"""

import sys
from pathlib import Path
from datetime import date
import logging

# Imports de Sentry
from sentry_etl import init_sentry_for_etl, SentryETLMonitor
from sentry_cron_monitors import cron_monitor

# Tu código ETL existente
from tiendas_config import get_tiendas_activas
from etl_ventas import VentasETL

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class VentasETLHistorico:
    """Tu clase ETL existente"""

    def ejecutar_carga_completa(self, fecha_inicio: date, fecha_fin: date):
        """
        Ejecuta carga completa de todas las tiendas
        """
        tiendas = get_tiendas_activas()

        for tienda_id, config in tiendas.items():
            try:
                self.procesar_tienda(tienda_id, fecha_inicio, fecha_fin)
            except Exception as e:
                logger.error(f"Error procesando {tienda_id}: {e}")
                # Continuar con otras tiendas

    def procesar_tienda(self, tienda_id: str, fecha_inicio: date, fecha_fin: date):
        """
        Procesa una tienda específica CON cron monitoring
        """
        # Cada tienda tiene su propio check-in
        with cron_monitor("etl_ventas_tienda", tienda_id=tienda_id):
            # También puedes combinar con métricas custom
            with SentryETLMonitor(
                etl_name="ventas_historico",
                tienda_id=tienda_id,
                fecha_inicio=str(fecha_inicio),
                fecha_fin=str(fecha_fin)
            ) as monitor:

                logger.info(f"Procesando {tienda_id}...")

                # Tu código ETL normal
                etl = VentasETL(tienda_id, config)
                registros = etl.extraer(fecha_inicio, fecha_fin)

                monitor.add_breadcrumb(f"Extraídos {len(registros)} registros")

                transformados = etl.transformar(registros)
                cargados = etl.cargar(transformados)

                # Reportar métricas
                monitor.add_metric("registros_procesados", len(cargados))
                monitor.set_success(registros_procesados=len(cargados))

                logger.info(f"✅ {tienda_id}: {len(cargados):,} registros")


def main():
    """
    Entry point del ETL
    """
    # 1. Inicializar Sentry
    logger.info("Inicializando Sentry...")
    init_sentry_for_etl()

    # 2. Ejecutar ETL con cron monitoring
    fecha_inicio = date(2024, 9, 1)
    fecha_fin = date(2025, 9, 30)

    logger.info(f"Ejecutando ETL: {fecha_inicio} → {fecha_fin}")

    # Monitor general para la ejecución completa
    with cron_monitor("etl_ventas_historico"):
        historico = VentasETLHistorico()
        historico.ejecutar_carga_completa(fecha_inicio, fecha_fin)

    logger.info("✅ ETL completado")


if __name__ == "__main__":
    main()
```

## Configuración AWS ECS (Producción)

Si corres tus ETLs en AWS ECS:

### Task Definition

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
      },
      {
        "name": "SENTRY_TRACES_SAMPLE_RATE",
        "value": "0.1"
      }
    ]
  }]
}
```

### EventBridge (Cron Job)

```json
{
  "scheduleExpression": "cron(0 2 * * ? *)",
  "target": {
    "arn": "arn:aws:ecs:[region]:[account]:cluster/fluxion-cluster",
    "roleArn": "arn:aws:iam::[account]:role/ecsEventsRole",
    "ecsParameters": {
      "taskDefinitionArn": "arn:aws:ecs:[region]:[account]:task-definition/fluxion-etl:latest",
      "launchType": "FARGATE"
    }
  }
}
```

**IMPORTANTE:** El schedule en EventBridge debe coincidir con el schedule en `CRON_MONITORS_CONFIG`.

## Troubleshooting

### No veo los monitores en Sentry

1. Verifica que `SENTRY_DSN` esté configurado
2. Ejecuta el script de ejemplo: `python3 examples/etl_with_cron_monitor.py`
3. Revisa logs: debe decir "✅ Sentry inicializado para ETL"
4. Verifica que tengas `sentry-sdk>=2.0.0` instalado

### Los check-ins no aparecen

1. Verifica que estés usando el DSN correcto
2. Verifica conectividad: `curl https://sentry.io/api/`
3. Revisa logs de Sentry SDK (nivel DEBUG)
4. Verifica que el schedule esté en `CRON_MONITORS_CONFIG`

### Alertas no se envían

1. Ve a Monitor → Settings en Sentry UI
2. Verifica que las alertas estén configuradas
3. Verifica el routing (email, Slack, etc.)
4. Prueba con un check-in manual faltante

## Mejores Prácticas

### 1. Un Monitor por ETL Job

```python
# ✅ BIEN: Un monitor por job lógico
with cron_monitor("etl_ventas_diario"):
    procesar_ventas_todas_tiendas()

# ❌ MAL: Re-usar el mismo monitor para cosas diferentes
with cron_monitor("etl_generico"):
    procesar_ventas()
    procesar_productos()
    procesar_stock()
```

### 2. Granularidad Multi-Store

```python
# ✅ BIEN: Un monitor por tienda (visibilidad granular)
for tienda_id in tiendas:
    with cron_monitor("etl_ventas_tienda", tienda_id=tienda_id):
        procesar_tienda(tienda_id)

# ⚠️  ALTERNATIVA: Un monitor para todas las tiendas (menos granular)
with cron_monitor("etl_ventas_todas_tiendas"):
    for tienda_id in tiendas:
        procesar_tienda(tienda_id)
```

### 3. Combinar con Métricas Custom

```python
# ✅ BIEN: Combinar cron monitoring + métricas
with cron_monitor("etl_ventas_historico"):
    with SentryETLMonitor("ventas_historico") as monitor:
        registros = procesar()
        monitor.add_metric("registros", len(registros))
        monitor.set_success()
```

### 4. Timeouts Realistas

```python
# Ajusta max_runtime según duración real
"etl_ventas_historico": {
    "max_runtime": 180,  # 3 horas si tu ETL tarda ~2 horas
    "checkin_margin": 30 # 30 min si tu cron tiene margen
}
```

### 5. Manejo de Errores

```python
# ✅ BIEN: Dejar que el error se propague
with cron_monitor("etl_ventas"):
    procesar()  # Si falla, check-in será ERROR

# ❌ MAL: Silenciar errores
with cron_monitor("etl_ventas"):
    try:
        procesar()
    except:
        pass  # Check-in será OK, pero falló silenciosamente!
```

## Recursos

- [Documentación oficial Sentry Crons](https://docs.sentry.io/product/crons/)
- [API Reference](https://docs.sentry.io/platforms/python/crons/)
- [Ejemplos en este repo](./examples/etl_with_cron_monitor.py)

## Soporte

Si tienes problemas:
1. Revisa logs del ETL
2. Revisa la sección Troubleshooting arriba
3. Consulta docs de Sentry
4. Abre un issue en el repo
