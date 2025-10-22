# Configuración de Sentry para Fluxion AI

Guía completa para configurar Sentry en backend (FastAPI) y frontend (React).

## Paso 1: Obtener tu DSN de Sentry

1. Ve a [https://sentry.io](https://sentry.io)
2. Crea dos proyectos:
   - **fluxion-backend** (Python)
   - **fluxion-frontend** (React)
3. Para cada proyecto:
   - **Settings** > **Projects** > selecciona proyecto
   - **Client Keys (DSN)**
   - Copia el DSN: `https://xxxxxx@o123456.ingest.sentry.io/123456`

## Paso 2: Configurar Backend

El backend usa archivos `.env` separados por entorno:
- `.env.development` - Desarrollo local
- `.env.production` - Producción en AWS

### Para Desarrollo Local

Edita `backend/.env.development` y agrega tu DSN:

```bash
SENTRY_DSN=https://3c6d41d5d95beceff8239cc7978c5db6@o4510234583760896.ingest.us.sentry.io/4510235066105856
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=1.0  # 100% para capturar todo en desarrollo
```

Luego inicia el backend:

```bash
cd backend
python3 start.py  # Usa .env.development por defecto
```

### Para Producción (AWS ECS)

Edita `backend/.env.production` y configura:

```bash
SENTRY_DSN=https://tu-backend-dsn@sentry.io/tu-project-id
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% en producción
```

Las variables se cargarán automáticamente en el contenedor ECS.

## Paso 3: Configurar Frontend

### Editar frontend/.env.development

```bash
VITE_API_URL=http://localhost:8001
VITE_SENTRY_DSN=https://tu-frontend-dsn@sentry.io/tu-project-id
VITE_SENTRY_ENVIRONMENT=development
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
```

### Editar frontend/.env.production

```bash
VITE_API_URL=https://api.fluxionia.co
VITE_SENTRY_DSN=https://tu-frontend-dsn@sentry.io/tu-project-id
VITE_SENTRY_ENVIRONMENT=production
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
```

### Reiniciar frontend

```bash
cd frontend
npm run dev
```

## Paso 4: Probar

### Backend - Crear error de prueba

Agrega en `backend/main.py`:

```python
@app.get("/test-sentry")
async def test_sentry():
    raise HTTPException(status_code=500, detail="Error de prueba")
```

Prueba:
```bash
curl http://localhost:8001/test-sentry
```

### Frontend - Probar desde consola

```javascript
throw new Error("Test error");
```

Verifica en [https://sentry.io](https://sentry.io) que aparezcan los errores.

## Configuración Avanzada

### Agregar contexto de usuario

**Backend:**
```python
from sentry_config import set_user_context

set_user_context(
    user_id=str(user.id),
    username=user.username,
    email=user.email
)
```

**Frontend:**
```typescript
import { setUserContext } from './sentry.config';

setUserContext(userId.toString(), user.username, user.email);
```

### Capturar excepciones con contexto

**Backend:**
```python
from sentry_config import capture_exception_with_context

capture_exception_with_context(e, {
    "data": {"user_id": user_id}
})
```

**Frontend:**
```typescript
import { captureExceptionWithContext } from './sentry.config';

captureExceptionWithContext(error as Error, {
    component: 'Dashboard'
});
```

## Despliegue

### Backend (AWS ECS)

Agrega variables de entorno en task definition:

```json
{
  "name": "SENTRY_DSN",
  "value": "https://tu-backend-dsn@sentry.io/tu-project-id"
},
{
  "name": "SENTRY_ENVIRONMENT",
  "value": "production"
}
```

### Frontend

```bash
cd frontend
npm run build  # Usa .env.production automáticamente
```

## Troubleshooting

- **Backend no reporta**: Verifica SENTRY_DSN en .env
- **Frontend no reporta**: Verifica VITE_SENTRY_DSN en .env.development/.env.production
- **Demasiados eventos**: Reduce TRACES_SAMPLE_RATE a 0.01

## Recursos

- [Sentry Python SDK](https://docs.sentry.io/platforms/python/)
- [Sentry React SDK](https://docs.sentry.io/platforms/javascript/guides/react/)
