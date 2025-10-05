# Configuración de Desarrollo - Fluxion

Este documento asegura que el entorno se levante correctamente cada vez.

## 🚀 Inicio Rápido

```bash
./start_dev.sh
```

Esto iniciará automáticamente:
- ✅ Backend en **http://localhost:8001**
- ✅ Frontend en **http://localhost:3000**

## 🛑 Detener Servicios

```bash
./stop_dev.sh
```

## 📋 Configuración Crítica

### 1. Puertos

**Backend:** `8001`
**Frontend:** `3000`

⚠️ **IMPORTANTE:** Si cambias el puerto del frontend, debes actualizar:

```python
# backend/main.py - línea 32
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", ...],  # ← Agregar nuevo puerto aquí
)
```

```typescript
// frontend/src/services/http.ts - línea 1
const API_BASE_URL = 'http://localhost:8001';  // ← Puerto del backend
```

### 2. CORS (Cross-Origin Resource Sharing)

El backend **DEBE** permitir peticiones desde el puerto del frontend.

**Configuración actual en `backend/main.py`:**
```python
allow_origins=[
    "http://localhost:3000",  # Frontend en desarrollo (Vite default)
    "http://localhost:3001",  # Frontend alternativo
    "http://localhost:5173"   # Vite alternativo
]
```

### 3. Base de Datos

**Ubicación:** `data/fluxion_production.db`

El script `start_dev.sh` verifica que la BD exista antes de iniciar.

## 🔧 Troubleshooting

### Problema: "Failed to fetch" o CORS errors

**Causa:** Puerto incorrecto o CORS no configurado

**Solución:**
1. Verifica que el frontend esté en el puerto **3000**:
   ```bash
   lsof -i :3000
   ```

2. Verifica que ese puerto esté en CORS del backend:
   ```bash
   grep "allow_origins" backend/main.py
   ```

3. Si el puerto es diferente, agrégalo a la lista de `allow_origins`

### Problema: "Address already in use"

**Solución:**
```bash
# Detener todo
./stop_dev.sh

# Limpiar puertos manualmente
lsof -ti :8001 | xargs kill -9
lsof -ti :3000 | xargs kill -9

# Reiniciar
./start_dev.sh
```

### Problema: Backend no inicia

**Verificar logs:**
```bash
tail -f /tmp/fluxion_backend.log
```

**Causas comunes:**
- Base de datos no existe
- Dependencias no instaladas
- Puerto 8001 ocupado

### Problema: Frontend no inicia

**Verificar logs:**
```bash
tail -f /tmp/fluxion_frontend.log
```

**Causas comunes:**
- `node_modules` no instalados
- Puerto 3000 ocupado
- Versión de Node incompatible

## 📝 Checklist de Configuración

Al hacer cambios, verifica:

- [ ] `backend/main.py` tiene el puerto del frontend en CORS
- [ ] `frontend/src/services/http.ts` apunta al puerto correcto del backend
- [ ] `frontend/vite.config.ts` tiene el puerto correcto (3000)
- [ ] Los scripts `start_dev.sh` y `stop_dev.sh` usan los puertos correctos

## 🔄 Flujo de Desarrollo

1. **Inicio del día:**
   ```bash
   ./start_dev.sh
   ```

2. **Durante desarrollo:**
   - Backend: Auto-reload activado (detecta cambios en Python)
   - Frontend: HMR activado (recarga instantánea)

3. **Fin del día:**
   ```bash
   ./stop_dev.sh
   ```

## 🐛 Debugging

### Ver requests del backend en tiempo real:

```bash
tail -f /tmp/fluxion_backend.log | grep "GET\|POST"
```

### Ver errores del frontend:

```bash
tail -f /tmp/fluxion_frontend.log | grep -i error
```

### Verificar conectividad:

```bash
# Backend health check
curl http://localhost:8001/

# Frontend health check
curl http://localhost:3000/
```

## 📚 Referencias

- **Backend:** FastAPI en puerto 8001
- **Frontend:** Vite + React en puerto 3000
- **Logs:** `/tmp/fluxion_backend.log` y `/tmp/fluxion_frontend.log`
- **PIDs:** `/tmp/fluxion_backend.pid` y `/tmp/fluxion_frontend.pid`

---

**Última actualización:** 2025-10-03
**Mantenedor:** Equipo Fluxion
