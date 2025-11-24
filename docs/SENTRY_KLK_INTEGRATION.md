# Integración de Sentry para Sistema KLK Tracking

## Resumen

Sentry está completamente integrado en el sistema de tracking KLK para monitorear errores, performance y métricas en tiempo real.

## ✅ Componentes Monitoreados

### 1. Backend API (FastAPI)

**Archivo**: `backend/routers/etl_tracking_router.py`

**Tags automáticos**:
- `endpoint`: Nombre del endpoint (`get_ejecuciones`, `recuperar_gap`, etc)
- `etl_tipo`: Tipo de ETL (`inventario` o `ventas`)
- `ubicacion_id`: ID de la tienda cuando aplica

**Endpoints críticos monitoreados**:
- `GET /api/etl/tracking/ejecuciones` - Con tags de filtros
- `POST /api/etl/tracking/recuperar-gap` - Con contexto completo de gap recovery

**Qué captura**:
- Errores HTTP 500
- Queries lentas a DuckDB
- Fallos en recuperación de gaps
- Performance de endpoints

### 2. ETL de Ventas KLK

**Archivo**: `etl/core/etl_ventas_klk.py`

**Monitoreo con SentryETLMonitor**:
```python
SentryETLMonitor(
    etl_name="ventas_klk_{modo}",
    tienda_id=tienda_id,
    fecha_inicio=fecha_desde,
    fecha_fin=fecha_hasta,
    extra_context={
        "modo": modo,
        "hora_desde": hora_desde,
        "hora_hasta": hora_hasta
    }
)
```

**Métricas capturadas**:
- `registros_extraidos`: Cantidad de ventas extraídas
- `registros_cargados`: Cantidad cargada a DuckDB
- `facturas`: Número de facturas únicas
- `venta_total_usd`: Monto total en USD
- `duration_seconds`: Duración de la ejecución

**Tags**:
- `etl_name`: `ventas_klk_completo`, `ventas_klk_incremental_30min`, `ventas_klk_recuperacion`
- `tienda`: ID de la tienda procesada

### 3. ETL de Inventario KLK

**Archivo**: `etl/core/etl_inventario_klk.py`

**Monitoreo con SentryETLMonitor**:
```python
SentryETLMonitor(
    etl_name="inventario_klk_completo",
    tienda_id=tienda_id,
    fecha_inicio=fecha_hoy,
    fecha_fin=fecha_hoy,
    extra_context={"modo": "completo"}
)
```

**Métricas capturadas**:
- `productos_extraidos`: Cantidad de productos extraídos
- `productos_cargados`: Cantidad cargada a DuckDB
- `duration_seconds`: Duración de la ejecución

**Tags**:
- `etl_name`: `inventario_klk_completo`
- `tienda`: ID de la tienda procesada

### 4. Frontend (React)

**Archivo**: `frontend/src/sentry.config.ts`

**Configuración actual**:
- Captura de errores React
- Performance monitoring (traces)
- Sample rate: 100% en dev, 10% en prod

**Próximo paso** (pendiente):
- Agregar ErrorBoundary a componentes de tracking KLK
- Capturar errores de API calls con contexto

## 📊 Datos Visibles en Sentry

### Issues (Errores)
- Stacktraces completos
- Tags de filtrado (etl_tipo, tienda, modo)
- Breadcrumbs de pasos del ETL
- Contexto de la ejecución fallida

### Performance (Transacciones)
- Duración de cada ejecución por tienda
- Métricas custom (registros, facturas, monto)
- Comparación entre tiendas
- Trends de performance

### Releases
- Identificación por `version_etl` (actualmente "2.0")
- Tracking de cambios entre versiones

## 🚀 Uso en Producción

### Configuración Requerida

**Variables de entorno**:
```bash
# Backend y ETL
SENTRY_DSN=https://your-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# Frontend
VITE_SENTRY_DSN=https://your-dsn@sentry.io/project-id
```

### Dashboards Recomendados en Sentry

1. **ETL Health Dashboard**:
   - Tasa de éxito por tienda
   - Duración promedio de ejecuciones
   - Errores más frecuentes
   - Métricas de datos (registros, facturas)

2. **Gap Recovery Dashboard**:
   - Gaps detectados vs recuperados
   - Tiempo promedio de recuperación
   - Tiendas con más gaps

3. **API Performance Dashboard**:
   - P50, P95, P99 de endpoints
   - Throughput
   - Error rate

## 🔍 Queries Útiles en Sentry

### Errores de ETL Ventas
```
etl_name:ventas_klk_* event.type:error
```

### Performance de Tienda Específica
```
tienda:tienda_01 transaction:/api/etl/tracking/*
```

### Gaps Recuperados
```
endpoint:recuperar_gap level:info
```

### Timeouts
```
error_tipo:timeout
```

## 🎯 Alertas Recomendadas

1. **ETL Failures**: > 3 fallos en 1 hora
2. **Gap Recovery Failures**: Cualquier fallo en recuperación
3. **Slow Queries**: P95 > 5 segundos en endpoints
4. **High Error Rate**: Error rate > 5% en cualquier endpoint

## 📝 Notas de Implementación

- ✅ Sentry NO captura PII por defecto (`send_default_pii=False`)
- ✅ Headers sensibles filtrados (authorization, cookie, x-api-key)
- ✅ Los ETLs continúan funcionando si Sentry falla (graceful degradation)
- ✅ Integración no invasiva usando context managers
- ✅ Métricas capturadas sin impacto en performance

## 🔄 Próximos Pasos

1. [ ] Agregar ErrorBoundary en componentes React de tracking
2. [ ] Configurar alertas en Sentry
3. [ ] Crear dashboards personalizados
4. [ ] Integrar con Cron Monitors para detectar ejecuciones faltantes
5. [ ] Configurar releases automáticos en CI/CD

## 📚 Referencias

- [Sentry Python SDK](https://docs.sentry.io/platforms/python/)
- [Sentry FastAPI Integration](https://docs.sentry.io/platforms/python/guides/fastapi/)
- [Sentry React SDK](https://docs.sentry.io/platforms/javascript/guides/react/)
- Documentación interna: `etl/core/sentry_etl.py`
