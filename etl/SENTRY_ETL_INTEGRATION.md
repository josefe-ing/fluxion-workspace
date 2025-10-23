# Integración de Sentry en ETLs - Guía de Implementación

## ¿Por qué monitorear ETLs con Sentry?

Los ETLs son procesos críticos que corren en background y pueden fallar silenciosamente. Sentry te permite:

1. **Detectar fallos en tiempo real** - Alertas inmediatas cuando un ETL falla
2. **Performance tracking** - Saber cuánto tarda cada ETL
3. **Métricas de negocio** - Registros procesados, tiendas afectadas, etc.
4. **Historial completo** - Ver tendencias de éxito/fallo
5. **Debugging efectivo** - Stack traces completos con contexto

## Módulo Creado: `sentry_etl.py`

He creado un módulo completo para instrumentar tus ETLs: `etl/core/sentry_etl.py`

### Componentes Principales

1. **`init_sentry_for_etl()`** - Inicializa Sentry para procesos ETL
2. **`SentryETLMonitor`** - Context manager para monitorear ETLs completos
3. **`capture_etl_error()`** - Captura errores con contexto
4. **`capture_etl_success()`** - Reporta éxitos con métricas
5. **`track_etl_retry()`** - Trackea reintentos

## Ejemplo 1: ETL Histórico con Monitoreo Completo

```python
#!/usr/bin/env python3
"""
ETL de Ventas Histórico con Sentry Integration
"""
from sentry_etl import (
    init_sentry_for_etl,
    SentryETLMonitor,
    capture_etl_error,
    capture_etl_success,
    track_etl_retry
)

# Inicializar Sentry al inicio
init_sentry_for_etl()

def procesar_tienda_con_sentry(tienda_id: str, fecha_inicio: date, fecha_fin: date):
    """Procesa una tienda con monitoreo completo de Sentry"""

    # Context manager monitorea toda la ejecución
    with SentryETLMonitor(
        etl_name="ventas_historico",
        tienda_id=tienda_id,
        fecha_inicio=str(fecha_inicio),
        fecha_fin=str(fecha_fin),
        extra_context={"chunk_size": 1000000}
    ) as monitor:

        try:
            # 1. Extracción
            monitor.add_breadcrumb("Iniciando extracción de datos", level="info")
            datos = extraer_datos(tienda_id, fecha_inicio, fecha_fin)
            monitor.add_metric("registros_extraidos", len(datos))

            # 2. Transformación
            monitor.add_breadcrumb(f"Datos extraídos: {len(datos)} registros")
            transformados = transformar_datos(datos)
            monitor.add_metric("registros_transformados", len(transformados))

            # 3. Carga
            monitor.add_breadcrumb("Iniciando carga a DuckDB")
            cargados = cargar_datos(transformados)
            monitor.add_metric("registros_cargados", cargados)

            # Marcar como exitoso con métricas finales
            monitor.set_success(
                registros_procesados=len(datos),
                registros_cargados=cargados,
                registros_duplicados=len(datos) - cargados
            )

            return {"success": True, "registros": cargados}

        except Exception as e:
            # El context manager captura automáticamente la excepción
            # pero puedes agregar contexto adicional
            monitor.add_breadcrumb(f"Error: {str(e)}", level="error")
            raise
```

## Ejemplo 2: ETL con Reintentos

```python
def ejecutar_etl_con_reintentos(tienda_id: str, max_retries: int = 3):
    """ETL con política de reintentos monitoreada"""

    for retry_count in range(max_retries):
        try:
            with SentryETLMonitor(
                etl_name="ventas_diarias",
                tienda_id=tienda_id,
                extra_context={"retry_count": retry_count}
            ) as monitor:

                resultado = procesar_tienda(tienda_id)

                monitor.set_success(
                    registros_procesados=resultado['total']
                )

                return resultado

        except Exception as e:
            # Trackear el reintento en Sentry
            track_etl_retry(
                etl_name="ventas_diarias",
                tienda_id=tienda_id,
                retry_count=retry_count + 1,
                error=str(e)
            )

            if retry_count < max_retries - 1:
                logger.warning(f"Reintento {retry_count + 1}/{max_retries}")
                time.sleep(20 * 60)  # Esperar 20 minutos
            else:
                # Último intento falló, capturar error final
                capture_etl_error(
                    error=e,
                    etl_name="ventas_diarias",
                    tienda_id=tienda_id,
                    context={
                        "max_retries": max_retries,
                        "failed_after": retry_count + 1
                    }
                )
                raise
```

## Ejemplo 3: Monitoreo del Scheduler

```python
# En etl_scheduler.py
from sentry_etl import init_sentry_for_etl, capture_etl_success, capture_etl_error

class VentasETLScheduler:
    def __init__(self, ...):
        # Inicializar Sentry
        init_sentry_for_etl()
        ...

    async def _ejecutar_etl_diario(self):
        """Ejecuta ETL diario con monitoreo"""

        fecha_proceso = date.today() - timedelta(days=1)

        with SentryETLMonitor(
            etl_name="ventas_scheduler_daily",
            fecha_inicio=str(fecha_proceso),
            fecha_fin=str(fecha_proceso)
        ) as monitor:

            tiendas = self._get_all_tiendas()
            monitor.add_metric("total_tiendas", len(tiendas))

            resultados = []
            for tienda_id in tiendas:
                try:
                    resultado = await self._procesar_tienda(tienda_id, fecha_proceso)
                    resultados.append(resultado)

                    monitor.add_breadcrumb(
                        f"Tienda {tienda_id} procesada",
                        level="info",
                        registros=resultado['total']
                    )

                except Exception as e:
                    monitor.add_breadcrumb(
                        f"Error en tienda {tienda_id}: {str(e)}",
                        level="error"
                    )

            # Métricas finales
            exitosos = [r for r in resultados if r['success']]
            fallidos = [r for r in resultados if not r['success']]

            monitor.add_metric("tiendas_exitosas", len(exitosos))
            monitor.add_metric("tiendas_fallidas", len(fallidos))
            monitor.add_metric("total_registros", sum(r['total'] for r in exitosos))

            monitor.set_success(
                tiendas_procesadas=len(exitosos),
                tiendas_fallidas=len(fallidos)
            )
```

## Ejemplo 4: Captura Simple de Errores

```python
# Para casos simples sin context manager
try:
    resultado = procesar_datos(tienda_id)

    # Reportar éxito con métricas
    capture_etl_success(
        etl_name="ventas_diarias",
        tienda_id=tienda_id,
        metrics={
            "registros_procesados": resultado['total'],
            "duration_seconds": resultado['duration'],
            "registros_duplicados": resultado['duplicados']
        }
    )

except Exception as e:
    # Capturar error con contexto
    capture_etl_error(
        error=e,
        etl_name="ventas_diarias",
        tienda_id=tienda_id,
        context={
            "fecha_proceso": fecha_proceso,
            "intento": retry_count
        }
    )
    raise
```

## Configuración de Variables de Entorno

Para que funcione, necesitas tener estas variables en tu entorno:

```bash
# Backend o script ETL
export SENTRY_DSN="https://3c6d41d5d95beceff8239cc7978c5db6@o4510234583760896.ingest.us.sentry.io/4510235066105856"
export SENTRY_ENVIRONMENT="production"
export SENTRY_TRACES_SAMPLE_RATE="0.1"
```

O carga desde `.env`:

```python
from dotenv import load_dotenv
load_dotenv()  # Carga variables desde .env
```

## Integración Recomendada

### Para ETL Histórico (`etl_ventas_historico.py`)

Modifica la función `procesar_tienda_periodo`:

```python
def procesar_tienda_periodo(self, tienda_id: str, fecha_inicio: date, fecha_fin: date):
    """Procesa ventas de una tienda en un período específico"""

    # Agregar monitoreo de Sentry
    with SentryETLMonitor(
        etl_name="ventas_historico_periodo",
        tienda_id=tienda_id,
        fecha_inicio=str(fecha_inicio),
        fecha_fin=str(fecha_fin)
    ) as monitor:

        try:
            config = TIENDAS_CONFIG[tienda_id]
            etl = VentasETL()

            inicio_proceso = time.time()

            resultado = etl.ejecutar_etl_ventas(
                tienda_id=tienda_id,
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
                limite_registros=self.chunk_size
            )

            fin_proceso = time.time()
            tiempo_proceso = fin_proceso - inicio_proceso

            # Agregar métricas a Sentry
            monitor.add_metric("registros_cargados", resultado.get('registros_cargados', 0))
            monitor.add_metric("tiempo_proceso", tiempo_proceso)

            if resultado['success']:
                monitor.set_success(
                    registros_cargados=resultado.get('registros_cargados', 0),
                    tiempo_proceso=tiempo_proceso
                )

            return resultado

        except Exception as e:
            logger.error(f"Error procesando {tienda_id}: {str(e)}")
            # El context manager captura la excepción automáticamente
            raise
```

### Para Scheduler (`etl_scheduler.py`)

Modifica el método de ejecución principal:

```python
async def _ejecutar_etl_ventas(self, fecha: date):
    """Ejecuta ETL con monitoreo de Sentry"""

    with SentryETLMonitor(
        etl_name="ventas_scheduler",
        fecha_inicio=str(fecha),
        fecha_fin=str(fecha)
    ) as monitor:

        tiendas = self._get_all_tiendas()
        monitor.add_metric("total_tiendas", len(tiendas))

        # ... resto del código ...

        monitor.set_success(
            tiendas_procesadas=len(exitosos),
            tiendas_fallidas=len(fallidos),
            total_registros=sum(...)
        )
```

## Métricas que Deberías Trackear

### Por ETL Individual
- `registros_extraidos` - Cantidad de registros extraídos
- `registros_transformados` - Cantidad después de transformación
- `registros_cargados` - Cantidad cargada en DuckDB
- `registros_duplicados` - Registros omitidos por duplicados
- `duration_seconds` - Tiempo total de ejecución
- `tiempo_extraccion` - Tiempo de extracción de SQL Server
- `tiempo_transformacion` - Tiempo de transformación
- `tiempo_carga` - Tiempo de carga a DuckDB

### Por Ejecución del Scheduler
- `total_tiendas` - Total de tiendas a procesar
- `tiendas_exitosas` - Tiendas procesadas exitosamente
- `tiendas_fallidas` - Tiendas que fallaron
- `total_registros` - Suma de todos los registros procesados
- `duration_seconds` - Tiempo total de la ejecución

## Alertas Recomendadas en Sentry

1. **ETL Falló**: Alerta cuando `status != "ok"`
2. **ETL Lento**: Alerta si `duration_seconds > 600` (10 min)
3. **Sin Registros**: Alerta si `registros_cargados = 0`
4. **Muchas Tiendas Fallidas**: Alerta si `tiendas_fallidas > 3`

## Visualización en Sentry Dashboard

Después de implementar, verás:

1. **Performance**: Gráficos de duración de cada ETL
2. **Issues**: Errores agrupados por tipo
3. **Releases**: Correlacionar errores con versiones
4. **Trends**: Ver si los ETLs están mejorando o empeorando

## Próximos Pasos

1. ✅ Integrar en `etl_ventas_historico.py`
2. ✅ Integrar en `etl_scheduler.py`
3. ⬜ Configurar alertas en Sentry dashboard
4. ⬜ Crear dashboard custom para métricas de ETL
5. ⬜ Integrar con Slack para notificaciones

## Testing

Para probar que funciona:

```bash
cd etl/core

# Probar módulo de Sentry
python3 -c "from sentry_etl import init_sentry_for_etl; init_sentry_for_etl()"

# Ejecutar ETL con monitoreo
python3 etl_ventas_historico.py --tienda tienda_01 --fecha-inicio 2024-01-01 --fecha-fin 2024-01-31
```

Luego verifica en tu dashboard de Sentry que aparezcan los eventos.

## Troubleshooting

**Sentry no captura eventos:**
1. Verifica que `SENTRY_DSN` esté configurado
2. Verifica que `sentry-sdk` esté instalado
3. Agrega `logger.info()` para ver si se inicializa

**Demasiados eventos:**
1. Reduce `SENTRY_TRACES_SAMPLE_RATE` a `0.01` (1%)
2. No uses `capture_etl_success()` para cada registro, solo al final

**Eventos sin contexto:**
1. Asegúrate de usar el context manager `SentryETLMonitor`
2. Agrega breadcrumbs en puntos clave del proceso

---

¿Necesitas ayuda implementando esto en algún ETL específico?
