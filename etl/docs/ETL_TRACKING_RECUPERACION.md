# Sistema de Tracking y Recuperación de ETL KLK

**Sistema:** KLK POS API
**Versión:** 2.0
**Fecha:** 2025-11-24

---

## Descripción

Sistema automatizado de tracking y recuperación de ejecuciones ETL que:

✅ **Registra todas las ejecuciones** - Tracking completo con timestamps, estado, y métricas
✅ **Detecta gaps automáticamente** - Identifica ejecuciones fallidas que requieren recuperación
✅ **Recupera datos perdidos** - Sistema automático de recuperación de gaps
✅ **Métricas de confiabilidad** - KPIs de tasa de éxito y performance por tienda
✅ **Clasificación de errores** - Timeout, conexión, API error, DB error

---

## Arquitectura

### Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                        ETL ORCHESTRATOR                         │
│                    (etl_ventas_klk.py)                          │
│                                                                  │
│  1. Verificar gaps por recuperar                                │
│  2. Recuperar hasta 5 gaps automáticamente                      │
│  3. Ejecutar ETL normal (incremental o completo)                │
│  4. Registrar resultado en tracking table                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ETL TRACKER                             │
│                      (etl_tracker.py)                           │
│                                                                  │
│  - iniciar_ejecucion()            → Estado: en_proceso          │
│  - finalizar_ejecucion_exitosa()  → Estado: exitoso             │
│  - finalizar_ejecucion_fallida()  → Estado: fallido             │
│  - obtener_gaps_por_recuperar()   → Query: v_gaps_por_recuperar│
│  - obtener_metricas_confiabilidad() → Query: v_metricas_*       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DUCKDB DATABASE                           │
│                 (fluxion_production.db)                         │
│                                                                  │
│  📋 etl_ejecuciones                                             │
│     - Registro histórico completo de ejecuciones                │
│                                                                  │
│  🔍 v_gaps_por_recuperar                                        │
│     - Vista de ejecuciones fallidas sin recuperar               │
│                                                                  │
│  📊 v_metricas_confiabilidad                                    │
│     - Vista de KPIs de confiabilidad por tienda/día             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tabla: `etl_ejecuciones`

### Schema

```sql
CREATE TABLE etl_ejecuciones (
    id INTEGER PRIMARY KEY,                  -- Auto-increment
    etl_tipo VARCHAR NOT NULL,               -- 'inventario' | 'ventas'
    ubicacion_id VARCHAR NOT NULL,           -- 'tienda_01', etc
    ubicacion_nombre VARCHAR NOT NULL,       -- 'PERIFERICO', etc

    -- Timestamps
    fecha_inicio TIMESTAMP NOT NULL,
    fecha_fin TIMESTAMP,
    duracion_segundos DOUBLE,

    -- Rango de datos procesados
    fecha_desde DATE NOT NULL,
    fecha_hasta DATE NOT NULL,
    hora_desde TIME,                         -- Para modo incremental
    hora_hasta TIME,                         -- Para modo incremental

    -- Resultado
    estado VARCHAR NOT NULL,                 -- 'en_proceso' | 'exitoso' | 'fallido' | 'parcial'
    registros_extraidos INTEGER DEFAULT 0,
    registros_cargados INTEGER DEFAULT 0,

    -- Errores
    error_mensaje TEXT,
    error_tipo VARCHAR,                      -- 'timeout' | 'conexion' | 'api_error' | 'db_error'

    -- Metadata
    modo VARCHAR,                            -- 'completo' | 'incremental_30min' | 'recuperacion'
    version_etl VARCHAR,
    host VARCHAR
);
```

### Estados

| Estado | Descripción |
|--------|-------------|
| `en_proceso` | Ejecución actualmente corriendo |
| `exitoso` | Completado sin errores |
| `fallido` | Error durante la ejecución |
| `parcial` | Completado con datos parciales |

### Tipos de Error

| Tipo | Descripción | Causa Común |
|------|-------------|-------------|
| `timeout` | Request HTTP timeout | API lenta o sobrecargada |
| `conexion` | Error de conexión | Red caída, server down |
| `api_error` | Error en respuesta de API | Datos inválidos, error 500 |
| `db_error` | Error de base de datos | Lock, constraint violation |

### Modos de Ejecución

| Modo | Descripción | Uso |
|------|-------------|-----|
| `completo` | ETL de día/rango completo | Carga histórica |
| `incremental_30min` | Solo últimos 30 minutos | Cron cada 30min |
| `recuperacion` | Re-procesar gap fallido | Recuperación automática |

---

## Vista: `v_gaps_por_recuperar`

Detecta ejecuciones fallidas que aún no han sido recuperadas exitosamente.

### Query Logic

```sql
-- 1. Ejecuciones fallidas (últimos 7 días)
-- 2. LEFT JOIN con ejecuciones exitosas
-- 3. WHERE NO existe ejecución exitosa para ese rango
```

### Campos

```sql
SELECT
    etl_tipo,
    ubicacion_id,
    ubicacion_nombre,
    fecha_desde,
    fecha_hasta,
    hora_desde,
    hora_hasta,
    fecha_fallo,
    error_tipo,
    error_mensaje,
    horas_desde_fallo          -- Tiempo transcurrido desde el fallo
FROM v_gaps_por_recuperar
ORDER BY fecha_fallo ASC;
```

### Ejemplo de Uso

```python
from etl_tracker import ETLTracker

tracker = ETLTracker()

# Obtener gaps de ventas para tienda_01 (últimos 7 días)
gaps = tracker.obtener_gaps_por_recuperar(
    etl_tipo='ventas',
    ubicacion_id='tienda_01',
    max_horas=168  # 7 días
)

for gap in gaps:
    print(f"Gap: {gap.ubicacion_nombre} - {gap.fecha_desde} {gap.hora_desde}")
    print(f"  Error: {gap.error_tipo} - {gap.error_mensaje}")
    print(f"  Tiempo desde fallo: {gap.horas_desde_fallo:.1f} horas")
```

---

## Vista: `v_metricas_confiabilidad`

Métricas de confiabilidad agrupadas por tienda/día (últimos 30 días).

### Campos

```sql
SELECT
    etl_tipo,
    ubicacion_id,
    ubicacion_nombre,
    fecha,                         -- Día agregado
    total_ejecuciones,
    ejecuciones_exitosas,
    ejecuciones_fallidas,
    tasa_exito_pct,               -- % de éxito
    duracion_promedio_seg,        -- Tiempo promedio
    total_registros_cargados
FROM v_metricas_confiabilidad
ORDER BY fecha DESC, ubicacion_id;
```

### Ejemplo de Uso

```python
tracker = ETLTracker()

# Obtener métricas de ventas (últimos 7 días)
metricas = tracker.obtener_metricas_confiabilidad(
    dias=7,
    etl_tipo='ventas'
)

for m in metricas:
    print(f"{m['fecha']} - {m['ubicacion_nombre']}")
    print(f"  Tasa de éxito: {m['tasa_exito_pct']:.1f}%")
    print(f"  Ejecuciones: {m['ejecuciones_exitosas']}/{m['total_ejecuciones']}")
    print(f"  Duración promedio: {m['duracion_promedio_seg']:.1f}s")
```

---

## Uso en ETL

### 1. Tracking Automático

El tracking se integra automáticamente en `etl_ventas_klk.py`:

```python
# Inicio de ejecución
ejecucion = ETLEjecucion(
    etl_tipo='ventas',
    ubicacion_id='tienda_01',
    ubicacion_nombre='PERIFERICO',
    fecha_desde=date(2025, 11, 24),
    fecha_hasta=date(2025, 11, 24),
    hora_desde=time(12, 00, 0),
    hora_hasta=time(12, 30, 0),
    modo='incremental_30min'
)

ejecucion_id = tracker.iniciar_ejecucion(ejecucion)

try:
    # ... extraer, transformar, cargar ...

    # Finalizar como exitoso
    tracker.finalizar_ejecucion_exitosa(
        ejecucion_id,
        registros_extraidos=455,
        registros_cargados=455
    )

except Exception as e:
    # Finalizar como fallido
    tracker.finalizar_ejecucion_fallida(
        ejecucion_id,
        error_mensaje=str(e),
        error_tipo='timeout'  # o 'conexion', 'api_error', 'db_error'
    )
```

### 2. Recuperación Automática

Al inicio de cada ejecución, el ETL verifica si hay gaps por recuperar:

```python
# En etl_ventas_klk.py - método ejecutar()

# 1. Buscar gaps (solo en modo completo, no en incremental)
if self.tracker and not incremental_minutos:
    gaps = self.tracker.obtener_gaps_por_recuperar(
        etl_tipo='ventas',
        max_horas=168  # 7 días
    )

    # 2. Recuperar hasta 5 gaps automáticamente
    for gap in gaps[:5]:
        self.procesar_tienda(
            gap_config,
            fecha_desde=gap.fecha_desde,
            fecha_hasta=gap.fecha_hasta,
            hora_desde=str(gap.hora_desde) if gap.hora_desde else None,
            hora_hasta=str(gap.hora_hasta) if gap.hora_hasta else None,
            modo='recuperacion'
        )
```

### 3. Cron Job con Tracking

El cron job automáticamente usa el tracker:

```bash
# Cada 30 minutos - ventas incremental
5,35 * * * * /path/to/cron_klk_realtime.sh ventas

# Script ejecuta:
python3 core/etl_ventas_klk.py --incremental 30

# Tracking registra:
# - Estado: en_proceso → exitoso/fallido
# - Modo: incremental_30min
# - Registros: extraidos/cargados
# - Duración: segundos
```

---

## Monitoreo

### 1. Ver Últimas Ejecuciones

```sql
-- Últimas 10 ejecuciones de ventas
SELECT
    fecha_inicio,
    ubicacion_nombre,
    estado,
    modo,
    registros_cargados,
    duracion_segundos,
    error_tipo
FROM etl_ejecuciones
WHERE etl_tipo = 'ventas'
ORDER BY fecha_inicio DESC
LIMIT 10;
```

### 2. Ver Gaps Actuales

```sql
-- Gaps que necesitan recuperación
SELECT
    ubicacion_nombre,
    fecha_desde,
    hora_desde,
    hora_hasta,
    error_tipo,
    horas_desde_fallo
FROM v_gaps_por_recuperar
ORDER BY fecha_fallo ASC;
```

### 3. Dashboard de Confiabilidad

```sql
-- Tasa de éxito por tienda (hoy)
SELECT
    ubicacion_nombre,
    total_ejecuciones,
    ejecuciones_exitosas,
    ejecuciones_fallidas,
    tasa_exito_pct,
    duracion_promedio_seg
FROM v_metricas_confiabilidad
WHERE fecha = CURRENT_DATE
    AND etl_tipo = 'ventas'
ORDER BY tasa_exito_pct ASC;
```

### 4. Script Python para Monitoreo

```python
#!/usr/bin/env python3
"""Monitoreo de ETL - Dashboard en Terminal"""

import duckdb
from datetime import date

conn = duckdb.connect('../data/fluxion_production.db')

print("\n" + "="*80)
print("📊 DASHBOARD ETL KLK - " + str(date.today()))
print("="*80 + "\n")

# Últimas ejecuciones
print("🕐 ÚLTIMAS EJECUCIONES (10):")
result = conn.execute("""
    SELECT
        fecha_inicio,
        etl_tipo,
        ubicacion_nombre,
        estado,
        registros_cargados,
        duracion_segundos
    FROM etl_ejecuciones
    ORDER BY fecha_inicio DESC
    LIMIT 10
""").fetchall()

for row in result:
    emoji = "✅" if row[3] == 'exitoso' else "❌"
    print(f"{emoji} {row[0]} | {row[1]:10} | {row[2]:15} | {row[4]:5,} recs | {row[5]:.1f}s")

# Gaps actuales
print("\n🔍 GAPS POR RECUPERAR:")
result = conn.execute("""
    SELECT
        ubicacion_nombre,
        fecha_desde,
        error_tipo,
        horas_desde_fallo
    FROM v_gaps_por_recuperar
    ORDER BY fecha_fallo ASC
""").fetchall()

if result:
    for row in result:
        print(f"⚠️  {row[0]:15} | {row[1]} | {row[2]:10} | {row[3]:.1f}h atrás")
else:
    print("✅ No hay gaps pendientes")

# Métricas de hoy
print("\n📈 MÉTRICAS DE HOY:")
result = conn.execute("""
    SELECT
        etl_tipo,
        ubicacion_nombre,
        tasa_exito_pct,
        total_ejecuciones,
        duracion_promedio_seg
    FROM v_metricas_confiabilidad
    WHERE fecha = CURRENT_DATE
    ORDER BY etl_tipo, ubicacion_nombre
""").fetchall()

for row in result:
    print(f"{row[0]:10} | {row[1]:15} | {row[2]:5.1f}% | {row[3]:2} ejecuciones | {row[4]:.1f}s avg")

conn.close()

print("\n" + "="*80 + "\n")
```

---

## Alertas y Notificaciones

### Integración con Email/Slack

```python
def enviar_alerta_gap(gap):
    """Envía alerta cuando se detecta un gap"""
    mensaje = f"""
    ⚠️ Gap detectado en ETL KLK

    Tienda: {gap.ubicacion_nombre}
    Fecha: {gap.fecha_desde}
    Horario: {gap.hora_desde} - {gap.hora_hasta}
    Error: {gap.error_tipo}
    Tiempo desde fallo: {gap.horas_desde_fallo:.1f} horas

    Acción: Recuperación automática se ejecutará en la próxima corrida.
    """

    # Enviar por email
    # send_email(to='admin@lagranja.com', subject='Gap ETL', body=mensaje)

    # O por Slack
    # slack_webhook(mensaje)
```

### Umbral de Alertas

```python
# Verificar métricas y alertar si tasa de éxito < 90%
metricas = tracker.obtener_metricas_confiabilidad(dias=1)

for m in metricas:
    if m['tasa_exito_pct'] < 90.0:
        enviar_alerta_baja_confiabilidad(m)
```

---

## Best Practices

### 1. Límite de Gaps por Ejecución

Recuperar máximo 5 gaps por ejecución para no sobrecargar el sistema:

```python
gaps = tracker.obtener_gaps_por_recuperar(max_horas=168)
for gap in gaps[:5]:  # ✅ Limitar a 5
    recuperar_gap(gap)
```

### 2. No Recuperar en Modo Incremental

Evitar recuperación durante ejecuciones incrementales (cada 30 min):

```python
if self.tracker and not incremental_minutos:  # ✅ Solo en modo completo
    gaps = tracker.obtener_gaps_por_recuperar()
    # ... recuperar ...
```

### 3. Clasificar Errores Correctamente

Usar tipos de error específicos para mejor análisis:

```python
error_tipo = 'unknown'
if 'timeout' in str(e).lower():
    error_tipo = 'timeout'
elif 'connection' in str(e).lower():
    error_tipo = 'conexion'
elif 'api' in str(e).lower():
    error_tipo = 'api_error'
elif 'database' in str(e).lower():
    error_tipo = 'db_error'
```

### 4. Limpiar Datos Antiguos

Mantener solo últimos 90 días de tracking:

```sql
-- Ejecutar mensualmente
DELETE FROM etl_ejecuciones
WHERE fecha_inicio < CURRENT_DATE - INTERVAL '90 days';
```

### 5. Monitoreo Regular

Verificar métricas diariamente:

```bash
# Agregar a cron diario
0 8 * * * python3 /path/to/monitoreo_etl.py | mail -s "ETL Dashboard" admin@lagranja.com
```

---

## Troubleshooting

### Problema: Gaps no se recuperan automáticamente

**Verificar:**
1. ¿Está habilitado el tracker? (`self.tracker` no es None)
2. ¿Es modo incremental? (no debe recuperar en incremental)
3. ¿Los gaps están en ventana de tiempo? (últimos 7 días por defecto)

```python
# Debug
gaps = tracker.obtener_gaps_por_recuperar(etl_tipo='ventas', max_horas=168)
print(f"Gaps encontrados: {len(gaps)}")
for gap in gaps:
    print(f"  {gap.ubicacion_nombre} - {gap.fecha_desde}")
```

### Problema: Ejecuciones quedan en estado "en_proceso"

**Causa:** ETL interrumpido sin finalizar tracking.

**Solución:** Marcar manualmente como fallido:

```sql
UPDATE etl_ejecuciones
SET estado = 'fallido',
    fecha_fin = CURRENT_TIMESTAMP,
    error_tipo = 'interrumpido',
    error_mensaje = 'Proceso interrumpido manualmente'
WHERE estado = 'en_proceso'
    AND fecha_inicio < CURRENT_TIMESTAMP - INTERVAL '1 hour';
```

### Problema: Métricas vacías

**Verificar tabla tiene datos:**

```sql
SELECT COUNT(*) as total_ejecuciones FROM etl_ejecuciones;
```

**Verificar rango de fechas:**

```sql
SELECT MIN(fecha_inicio), MAX(fecha_inicio) FROM etl_ejecuciones;
```

---

## Mejoras Futuras

1. **Dashboard Web** - Interfaz visual para monitoreo en tiempo real
2. **Alertas Proactivas** - Email/Slack automáticos cuando tasa éxito < 90%
3. **Retry Inteligente** - Backoff exponencial para timeouts
4. **Métricas Prometheus** - Exportar métricas a Prometheus/Grafana
5. **Health Endpoint** - API endpoint para verificar estado del sistema
6. **Predicción de Fallos** - ML para predecir cuándo fallará una ejecución

---

**Última actualización:** 2025-11-24
**Mantenido por:** ETL Team

