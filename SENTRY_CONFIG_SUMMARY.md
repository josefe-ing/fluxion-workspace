# Resumen de Configuración de Sentry - Fluxion AI

## ✅ Configuración Completada

Sentry ha sido configurado exitosamente para monitoreo de errores en tiempo real.

### Archivos Creados/Modificados

#### Backend
- ✅ `backend/sentry_config.py` - Módulo de configuración de Sentry
- ✅ `backend/main.py` - Integración de Sentry en startup
- ✅ `backend/requirements.txt` - Agregado `sentry-sdk[fastapi]`
- ✅ `backend/.env.development` - Configuración de desarrollo
- ✅ `backend/.env.production` - Configuración de producción
- ✅ `backend/.env.example` - Template actualizado

#### Frontend
- ✅ `frontend/src/sentry.config.ts` - Módulo de configuración de Sentry
- ✅ `frontend/src/main.tsx` - Integración de Sentry
- ✅ `frontend/package.json` - Agregado `@sentry/react`
- ✅ `frontend/.env.example` - Template actualizado con Sentry

#### Documentación
- ✅ `docs/SENTRY_SETUP.md` - Guía completa de configuración

## 🔑 DSNs Configurados

Tus proyectos de Sentry ya tienen los DSN configurados:

### Backend
```bash
SENTRY_DSN=https://3c6d41d5d95beceff8239cc7978c5db6@o4510234583760896.ingest.us.sentry.io/4510235066105856
```

### Frontend
```bash
VITE_SENTRY_DSN=https://1d960250ae32276f88537d5d532a571f@o4510234583760896.ingest.us.sentry.io/4510235070693376
```

## 📁 Estructura de Archivos .env

### Backend (Python/FastAPI)

```
backend/
├── .env.development    → Desarrollo local (git-tracked)
├── .env.production     → Producción AWS (git-tracked, sin secretos)
├── .env.example        → Template (git-tracked)
└── .env                → Override local (gitignored)
```

**Recomendación**: Usa `.env` para tus configuraciones locales personales (gitignored).

### Frontend (React/Vite)

```
frontend/
├── .env.development    → npm run dev
├── .env.production     → npm run build
└── .env.example        → Template
```

Vite selecciona automáticamente el archivo según el comando.

## 🚀 Cómo Usar

### Desarrollo Local

**Backend:**
```bash
cd backend
# Edita .env.development con tu configuración
python3 start.py
```

**Frontend:**
```bash
cd frontend
# Edita .env.development con tu configuración
npm run dev
```

### Producción

**Backend (AWS ECS):**
- Las variables se cargan desde `.env.production`
- Actualiza el task definition con las variables de entorno

**Frontend:**
```bash
cd frontend
npm run build  # Usa .env.production automáticamente
# Deploy a S3/CloudFront
```

## 🧪 Probar que Funciona

### Backend

Agrega temporalmente en `backend/main.py`:

```python
@app.get("/test-sentry")
async def test_sentry():
    1 / 0  # Error intencional
```

Prueba:
```bash
curl http://localhost:8001/test-sentry
```

### Frontend

Abre la consola del navegador y ejecuta:

```javascript
throw new Error("Test error from frontend");
```

Verifica en tu dashboard de Sentry que aparezcan los errores.

## 📊 Configuración de Sample Rates

### Desarrollo
- Backend: `1.0` (100%) - Captura todos los errores
- Frontend: `1.0` (100%) - Captura todos los errores

### Producción
- Backend: `0.1` (10%) - Reduce volumen de datos
- Frontend: `0.1` (10%) - Reduce volumen de datos

## 🔒 Seguridad

- ✅ **PII Filtering**: Configurado para NO enviar información personal
- ✅ **Health Check Filtering**: Los endpoints `/health` no generan eventos
- ✅ **Browser Extension Filtering**: Se ignoran errores de extensiones
- ✅ **Context Tags**: Todos los eventos tienen tags identificadores

## 🎯 Funcionalidades Disponibles

### Backend (`sentry_config.py`)

```python
# Capturar excepción con contexto
from sentry_config import capture_exception_with_context

capture_exception_with_context(error, {
    "user_id": user_id,
    "tienda_id": tienda_id
})

# Agregar contexto de usuario
from sentry_config import set_user_context

set_user_context(
    user_id=str(user.id),
    username=user.username,
    email=user.email
)
```

### Frontend (`sentry.config.ts`)

```typescript
// Capturar excepción con contexto
import { captureExceptionWithContext } from './sentry.config';

captureExceptionWithContext(error, {
    component: 'Dashboard',
    action: 'fetchData'
});

// Agregar contexto de usuario
import { setUserContext } from './sentry.config';

setUserContext(userId.toString(), user.username, user.email);

// Limpiar contexto (logout)
import { clearUserContext } from './sentry.config';

clearUserContext();

// Agregar breadcrumb
import { addBreadcrumb } from './sentry.config';

addBreadcrumb(
    'Usuario accedió a reportes',
    'navigation',
    'info',
    { timestamp: new Date().toISOString() }
);
```

## 📈 Monitoreo en Producción

### Alertas Recomendadas

1. **Error Rate**: Alerta si hay > 10 errores/min
2. **New Issues**: Notificar cuando aparece un nuevo tipo de error
3. **Performance**: Alerta si el tiempo de respuesta > 2s

### Integraciones Útiles

- **Slack**: Notificaciones en tiempo real
- **Email**: Resumen diario de errores
- **GitHub**: Crear issues automáticamente

## 🔧 Troubleshooting

### Backend no reporta errores
1. Verifica que `SENTRY_DSN` esté en `.env.development`
2. Revisa los logs de inicio: `🚀 Starting Fluxion AI Backend...`
3. Deberías ver: `✅ Sentry inicializado - Entorno: development`

### Frontend no reporta errores
1. Abre DevTools > Console
2. Busca: `✅ Sentry inicializado` o `⚠️ VITE_SENTRY_DSN no configurado`
3. Verifica que el DSN esté en `.env.development`

### Demasiados eventos
1. Reduce `SENTRY_TRACES_SAMPLE_RATE` a `0.01` (1%)
2. Agrega más filtros en `before_send_handler`

## 📚 Recursos

- [Documentación Completa](docs/SENTRY_SETUP.md)
- [Sentry Dashboard](https://sentry.io)
- [Sentry Python SDK](https://docs.sentry.io/platforms/python/)
- [Sentry React SDK](https://docs.sentry.io/platforms/javascript/guides/react/)

## ✨ Próximos Pasos

1. [ ] Configurar alertas en Sentry dashboard
2. [ ] Integrar con Slack para notificaciones
3. [ ] Configurar Source Maps para el frontend (mejor stack traces)
4. [ ] Establecer release tracking para correlacionar errores con deployments
5. [ ] Configurar performance monitoring más detallado

---

**Nota**: Los DSN ya están configurados en los archivos `.env`. El sistema está listo para usar en desarrollo. Para producción, actualiza `.env.production` según sea necesario.
