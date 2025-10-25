# Sentry - Configuración Completa para Fluxion AI

## ✅ Implementación Completada

Sentry ha sido completamente integrado en todo el sistema Fluxion AI para monitoreo de errores y performance en tiempo real.

## 📊 Cobertura de Monitoreo

### 1. Backend (FastAPI) ✅
- **Archivo**: `backend/main.py` + `backend/sentry_config.py`
- **Inicialización**: Automática en startup
- **Cobertura**: Todos los endpoints REST API
- **Endpoint de prueba**: `/test-sentry`

### 2. Frontend (React) ✅
- **Archivo**: `frontend/src/main.tsx` + `frontend/src/sentry.config.ts`
- **Inicialización**: Antes de renderizar la app
- **Cobertura**: Errores de React, navegación, network requests
- **Features**: Session Replay, Performance Monitoring

### 3. ETL Scheduler ✅
- **Archivo**: `backend/etl_scheduler.py`
- **Cobertura**: Ejecuciones diarias automáticas
- **Métricas**:
  - `total_tiendas` - Número de tiendas a procesar
  - `tiendas_exitosas` - Tiendas procesadas correctamente
  - `tiendas_fallidas` - Tiendas con errores
  - `duration_seconds` - Tiempo total de ejecución

### 4. ETL Histórico ✅
- **Archivo**: `etl/core/etl_ventas_historico.py`
- **Cobertura**: Cargas masivas de datos históricos
- **Métricas**:
  - `registros_cargados` - Registros procesados
  - `tiempo_proceso` - Duración del proceso
  - Por tienda y período

### 5. Módulo ETL Sentry ✅
- **Archivo**: `etl/core/sentry_etl.py`
- **Componentes**:
  - `SentryETLMonitor` - Context manager para monitoreo
  - `capture_etl_error()` - Captura de errores con contexto
  - `capture_etl_success()` - Reporte de ejecuciones exitosas
  - `track_etl_retry()` - Tracking de reintentos

## 🔑 Configuración Actual

### DSNs Configurados

**Backend/ETL:**
```bash
SENTRY_DSN=https://3c6d41d5d95beceff8239cc7978c5db6@o4510234583760896.ingest.us.sentry.io/4510235066105856
```

**Frontend:**
```bash
VITE_SENTRY_DSN=https://1d960250ae32276f88537d5d532a571f@o4510234583760896.ingest.us.sentry.io/4510235070693376
```

### Archivos de Configuración

```
backend/
├── .env.development         # Backend dev config (DSN incluido)
├── .env.production          # Backend prod config (template)
├── sentry_config.py         # Módulo de Sentry para backend
└── etl_scheduler.py         # Con integración de Sentry

frontend/
├── .env.development         # Frontend dev config (DSN incluido)
├── .env.production          # Frontend prod config (template)
└── src/sentry.config.ts     # Módulo de Sentry para frontend

etl/
├── SENTRY_ETL_INTEGRATION.md   # Guía completa de integración
└── core/
    ├── sentry_etl.py            # Módulo de monitoreo para ETLs
    └── etl_ventas_historico.py  # Con integración de Sentry
```

## 📈 Métricas Disponibles en Sentry

### Backend API
- Request duration
- Status codes (2xx, 4xx, 5xx)
- Endpoints más lentos
- Errores por endpoint

### Frontend
- Page load performance
- Navigation timing
- JavaScript errors
- Network request failures
- Session replays (con errores)

### ETL Scheduler
- `total_tiendas` - Tiendas en cola
- `tiendas_exitosas` - Procesadas OK
- `tiendas_fallidas` - Con errores
- `duration_seconds` - Tiempo total

### ETL Histórico
- `registros_extraidos` - Del SQL Server
- `registros_transformados` - Post-transformación
- `registros_cargados` - En DuckDB
- `registros_duplicados` - Omitidos
- `tiempo_proceso` - Duración
- Por tienda, fecha, y thread

## 🧪 Testing

### Backend
```bash
# Método 1: Endpoint de prueba
curl http://localhost:8001/test-sentry

# Método 2: Python script
cd backend
python3 -c "
import os
os.environ['SENTRY_DSN'] = 'your-dsn'
from sentry_config import init_sentry
init_sentry()
import sentry_sdk
sentry_sdk.capture_message('Test from backend')
"
```

### Frontend
```javascript
// Abrir consola del navegador (F12)
throw new Error("Test error from frontend");

// O capturar manualmente:
import * as Sentry from '@sentry/react';
Sentry.captureMessage("Test from frontend");
```

### ETL
```bash
cd etl/core

# Con variables de entorno
export SENTRY_DSN="your-dsn"
export SENTRY_ENVIRONMENT="development"

# Ejecutar ETL de prueba
python3 etl_ventas_historico.py --modo-test
```

## 🚨 Alertas Recomendadas

### Backend
1. **Error Rate > 5%**: Alerta si más del 5% de requests fallan
2. **Response Time > 2s**: Alerta si endpoints tardan más de 2 segundos
3. **New Issue**: Notificar cuando aparece un nuevo tipo de error

### Frontend
1. **JS Error Rate > 1%**: Alerta si más del 1% de sesiones tienen errores
2. **Page Load > 3s**: Alerta si la carga inicial tarda más de 3 segundos

### ETL
1. **ETL Failed**: Alerta cuando cualquier ETL falla completamente
2. **tiendas_fallidas > 3**: Alerta si más de 3 tiendas fallan
3. **duration_seconds > 1800**: Alerta si un ETL tarda más de 30 minutos
4. **registros_cargados = 0**: Alerta si un ETL no carga ningún registro

## 📱 Integraciones Recomendadas

### Slack
1. Ve a Sentry > Settings > Integrations > Slack
2. Conecta tu workspace
3. Configura canal para alertas (ej: `#fluxion-alerts`)

### Email
1. Ve a Sentry > Settings > Alerts
2. Configura email notifications
3. Establece frecuencia (inmediato, diario, semanal)

### GitHub (opcional)
1. Conectar con repositorio
2. Crear issues automáticamente para nuevos errores
3. Link commits con releases

## 🔍 Dashboard en Sentry

### Issues (Errores)
- Filtrar por: `app:fluxion-backend` o `app:fluxion-frontend` o `app:fluxion-etl`
- Ver frecuencia, usuarios afectados, stack traces

### Performance
- Ver transacciones más lentas
- Identificar cuellos de botella
- Comparar entre environments (dev vs prod)

### Releases
- Crear releases para trackear versiones
- Correlacionar errores con deployments
- Ver si un release introdujo nuevos errores

## 📖 Documentación Adicional

- **Setup General**: [docs/SENTRY_SETUP.md](docs/SENTRY_SETUP.md)
- **ETL Integration**: [etl/SENTRY_ETL_INTEGRATION.md](etl/SENTRY_ETL_INTEGRATION.md)
- **Config Summary**: [SENTRY_CONFIG_SUMMARY.md](SENTRY_CONFIG_SUMMARY.md)

## 🎯 Próximos Pasos

### Corto Plazo (Esta Semana)
- [x] Integración completa de Sentry
- [ ] Configurar alertas en Sentry dashboard
- [ ] Integrar con Slack para notificaciones
- [ ] Probar con ETL real en producción

### Mediano Plazo (Este Mes)
- [ ] Configurar Source Maps para frontend (mejores stack traces)
- [ ] Implementar release tracking
- [ ] Crear dashboard custom para métricas de ETL
- [ ] Establecer SLOs (Service Level Objectives)

### Largo Plazo (Próximos 3 Meses)
- [ ] Análisis de tendencias de errores
- [ ] Optimizaciones basadas en performance data
- [ ] Alertas predictivas basadas en ML
- [ ] Integración con sistema de on-call

## 💡 Tips de Uso

### Para Desarrollo
- Sample rate: 100% (captura todo)
- Revisar Sentry dashboard diariamente
- Usar breadcrumbs para debugging

### Para Producción
- Sample rate: 10% (reduce volumen)
- Alertas configuradas en Slack
- Review semanal de issues recurrentes

### Para ETLs
- Siempre usar `SentryETLMonitor` context manager
- Agregar métricas de negocio importantes
- Capturar contexto: tienda, fechas, volumen de datos

## 🛠️ Troubleshooting

### Backend no reporta eventos
```bash
# Verificar DSN
echo $SENTRY_DSN

# Ver logs de inicialización
tail -f backend.log | grep Sentry
```

### Frontend no reporta eventos
```javascript
// Abrir DevTools > Console
// Buscar: "Sentry inicializado" o warnings
```

### ETL no reporta eventos
```bash
# Verificar que el módulo está disponible
cd etl/core
python3 -c "from sentry_etl import init_sentry_for_etl; print('OK')"

# Verificar variables de entorno
env | grep SENTRY
```

## 📊 Ejemplo de Dashboard en Sentry

Después de algunos días de uso, verás:

**Issues Dashboard:**
- Top 10 errores más frecuentes
- Nuevos errores en las últimas 24h
- Errores por environment (dev/prod)

**Performance Dashboard:**
- P50, P75, P95, P99 de response times
- Transacciones más lentas
- Comparación entre versiones

**ETL Dashboard (Custom):**
- Tasa de éxito de ETLs (últimos 7 días)
- Tiempo promedio por tienda
- Volumen de registros procesados
- Tendencia de fallos

## ✨ Resultado Final

Todo el sistema Fluxion AI ahora tiene monitoreo completo:
- ✅ Backend API - Errores y performance
- ✅ Frontend React - Errores, performance, session replay
- ✅ ETL Scheduler - Ejecuciones automáticas
- ✅ ETL Histórico - Cargas masivas
- ✅ Módulo reutilizable para futuros ETLs

---

**Sentry está listo para usar en desarrollo y producción.**

Para cualquier duda, consulta la documentación en `docs/SENTRY_SETUP.md` o `etl/SENTRY_ETL_INTEGRATION.md`.
