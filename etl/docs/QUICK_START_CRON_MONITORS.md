# Quick Start: Sentry Cron Monitors

Guía rápida para empezar a monitorear tus ETLs en 5 minutos.

## 1. Crear Proyecto en Sentry (2 min)

1. Ve a https://sentry.io
2. Click "Create Project"
3. Plataforma: **Python**
4. Nombre: `fluxion-etl`
5. Copia el DSN

## 2. Configurar Variables de Entorno (1 min)

```bash
# En tu servidor/ECS Task Definition
export SENTRY_DSN="https://[tu-dsn]@o[org-id].ingest.us.sentry.io/[project-id]"
export SENTRY_ENVIRONMENT="production"
```

O crea un archivo `.env`:

```bash
# etl/.env
SENTRY_DSN="https://[tu-dsn]@o[org-id].ingest.us.sentry.io/[project-id]"
SENTRY_ENVIRONMENT="production"
```

## 3. Instalar Dependencias (30 seg)

```bash
cd etl
pip install -r requirements.txt
```

## 4. Agregar 3 Líneas a tu ETL (1 min)

```python
#!/usr/bin/env python3
"""tu_etl_existente.py"""

# 1. Agregar imports
from sentry_etl import init_sentry_for_etl
from sentry_cron_monitors import cron_monitor

def main():
    # 2. Inicializar Sentry
    init_sentry_for_etl()

    # 3. Envolver tu código
    with cron_monitor("etl_ventas_historico"):
        # Tu código ETL existente sin cambios
        tu_codigo_etl_existente()

if __name__ == "__main__":
    main()
```

## 5. Ejecutar y Ver en Sentry (30 seg)

```bash
python3 tu_etl_existente.py
```

Luego ve a:
- https://sentry.io/crons/
- Selecciona proyecto `fluxion-etl`
- Verás tu primer check-in ✅

## 6. Configurar Alertas (30 seg)

En Sentry UI:
1. Click en tu monitor
2. Click "Settings"
3. Habilitar:
   - ✅ Missed Check-In
   - ✅ Timeout
   - ✅ Failure
4. Agregar email/Slack

## Listo! 🎉

Ahora Sentry te alertará si:
- ❌ Tu ETL no se ejecuta cuando debe
- ⏱️ Tu ETL tarda demasiado
- 💥 Tu ETL falla con error

## Próximos Pasos

- Configura schedules en [sentry_cron_monitors.py](../core/sentry_cron_monitors.py)
- Lee la [documentación completa](./SENTRY_CRON_MONITORS_SETUP.md)
- Ejecuta [ejemplos](../examples/etl_with_cron_monitor.py)
- Configura alertas por Slack

## Ejemplo Multi-Store

Si quieres monitorear cada tienda por separado:

```python
from sentry_cron_monitors import cron_monitor

# Cada tienda = un monitor independiente
for tienda_id in ["tienda01", "tienda02", "tienda03"]:
    with cron_monitor("etl_ventas_tienda", tienda_id=tienda_id):
        procesar_tienda(tienda_id)
```

En Sentry verás:
- `etl-ventas-tienda-tienda01`
- `etl-ventas-tienda-tienda02`
- `etl-ventas-tienda-tienda03`

Cada uno con su propio historial y alertas.
