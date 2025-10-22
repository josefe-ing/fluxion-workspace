# Testing ETL de Ventas - Automático y Manual

Este documento describe cómo probar el nuevo sistema de ETL de Ventas implementado.

## Estado Actual del Sistema

### Servicios Corriendo
- ✅ **Backend:** http://localhost:8001
- ✅ **Frontend:** http://localhost:3000
- ✅ **Scheduler:** Activo (próxima ejecución: 2025-10-23 05:00 AM)

### Estado de las Tiendas (Oct 22, 2025)
```
tienda_01 (PERIFERICO):    5 días atrasados (última: 2025-10-17)
tienda_02-16:              13 días atrasados (última: 2025-10-09)
```

---

## 1. PROBAR ETL AUTOMÁTICO

### A. Verificar Estado del Scheduler

```bash
# Ver estado completo del scheduler
curl http://localhost:8001/api/etl/scheduler/status | python3 -m json.tool

# Deberías ver:
# - enabled: true
# - next_execution: "2025-10-23T05:00:00"
# - pending_retries: []
```

### B. Ejecutar ETL Automático Manualmente (TODAS las tiendas)

**ADVERTENCIA:** Esto procesará TODAS las 16 tiendas del día anterior. Puede tomar ~30-40 minutos.

```bash
# Trigger manual del ETL automático
curl -X POST http://localhost:8001/api/etl/scheduler/trigger

# Monitorear progreso en logs del backend
tail -f /tmp/fluxion_backend.log | grep -E "(ETL|Scheduler|tienda)"
```

### C. Deshabilitar/Habilitar Scheduler

```bash
# Deshabilitar (no ejecutará a las 5 AM)
curl -X POST http://localhost:8001/api/etl/scheduler/disable

# Habilitar nuevamente
curl -X POST http://localhost:8001/api/etl/scheduler/enable
```

### D. Cambiar Configuración del Scheduler

```bash
# Cambiar horario a 6:30 AM y reintentos cada 15 minutos
curl -X PUT http://localhost:8001/api/etl/scheduler/config \
  -H "Content-Type: application/json" \
  -d '{
    "execution_hour": 6,
    "execution_minute": 30,
    "retry_interval_minutes": 15,
    "max_retries": 5
  }'
```

---

## 2. PROBAR ETL MANUAL (Recomendado para testing)

### A. ETL de 1 Día para 1 Tienda (Rápido - ~2-3 min)

```bash
# Sincronizar tienda_01 del día 2025-10-18
curl -X POST http://localhost:8001/api/etl/sync/ventas \
  -H "Content-Type: application/json" \
  -d '{
    "ubicacion_id": "tienda_01",
    "fecha_inicio": "2025-10-18",
    "fecha_fin": "2025-10-18"
  }'

# Monitorear logs
curl http://localhost:8001/api/etl/ventas/logs | python3 -m json.tool

# Verificar status
curl http://localhost:8001/api/etl/ventas/status | python3 -m json.tool
```

### B. ETL de Rango de Fechas (5 días)

```bash
# Sincronizar tienda_01 del 18 al 22 de octubre
curl -X POST http://localhost:8001/api/etl/sync/ventas \
  -H "Content-Type: application/json" \
  -d '{
    "ubicacion_id": "tienda_01",
    "fecha_inicio": "2025-10-18",
    "fecha_fin": "2025-10-22"
  }'
```

### C. Verificar Gaps Después de Ejecutar

```bash
# Ver gaps actualizados
curl http://localhost:8001/api/ventas/gaps | python3 -m json.tool | grep -A 10 "tienda_01"

# Deberías ver dias_atrasados reducido
```

---

## 3. PROBAR DESDE EL FRONTEND

### A. Navegar al Panel de ETL

1. Abrir: http://localhost:3000
2. Ir a **Settings** o **ETL Control Center**
3. Click en el tab **"ETL Ventas"**

### B. Sección ETL Automático (Panel Azul Superior)

**Ver Estado:**
- ✅ Botón verde "✓ Habilitado" → Scheduler activo
- 📅 Próxima Ejecución: "oct 23, 05:00"
- 📊 Última Ejecución: "Nunca" (primera vez)
- 🔄 Reintentos Pendientes: "0 tiendas"
- ⚪ Estado: "○ Inactivo"

**Acciones:**
- Click "✓ Habilitado" → Deshabilita el scheduler
- Click "Ejecutar Ahora" → Ejecuta ETL de TODAS las tiendas inmediatamente

### C. Sección ETL Manual (Panel Blanco Inferior)

**Ver Gaps de Tiendas:**
- Tabla con 16 tiendas
- Columnas: Tienda, Registros, Fecha Antigua, Última Fecha, Días Atrás, Completitud, Acciones

**Identificar Tiendas Desactualizadas:**
- 🔴 Rojo: > 7 días atrasados
- 🟡 Amarillo: 3-7 días
- 🟠 Naranja: 1-3 días
- 🟢 Verde: Al día

**Usar Botones de Acción:**

1. **Para tienda con 5 días de atraso (ej: tienda_01):**
   - Click botón **"Actualizar"**
   - Se llenan automáticamente:
     - Tienda: `tienda_01`
     - Fecha Inicio: `2025-10-17` (última fecha)
     - Fecha Fin: `2025-10-22` (hoy)
   - Click **"Ejecutar ETL"**
   - Ver logs en tiempo real en terminal negro

2. **Para tienda con gaps históricos:**
   - Click botón **"Recuperar"**
   - Se llenan:
     - Tienda: `tienda_XX`
     - Fecha Inicio: `2024-09-01`
     - Fecha Fin: `[última fecha de la tienda]`
   - Click **"Ejecutar ETL"**

**Monitorear Ejecución:**
- Logs aparecen en el terminal negro
- 🟢 Verde pulsante: "Running"
- ⚪ Gris: "Idle"
- Logs con colores:
  - 🔵 Azul: Info
  - 🟢 Verde: Success
  - 🔴 Rojo: Error

---

## 4. ESCENARIOS DE PRUEBA

### Escenario 1: Actualizar Tienda Atrasada (RECOMENDADO PARA PRIMERA PRUEBA)

**Objetivo:** Sincronizar 1 día de 1 tienda (rápido, ~2 min)

```bash
# Desde el frontend:
1. Ir a tab "ETL Ventas"
2. Buscar "PERIFERICO" (tienda_01) en la tabla
3. Ver badge "🟠 5 días"
4. Click botón "Actualizar"
5. Verificar que campos se llenaron:
   - Tienda: tienda_01
   - Inicio: 2025-10-17
   - Fin: 2025-10-22
6. CAMBIAR Fecha Fin a: 2025-10-18 (solo 1 día para prueba rápida)
7. Click "Ejecutar ETL"
8. Ver logs en tiempo real
9. Esperar ~2 minutos
10. Verificar que badge cambia a "🟠 4 días"

# Desde curl:
curl -X POST http://localhost:8001/api/etl/sync/ventas \
  -H "Content-Type: application/json" \
  -d '{
    "ubicacion_id": "tienda_01",
    "fecha_inicio": "2025-10-18",
    "fecha_fin": "2025-10-18"
  }'
```

### Escenario 2: Probar Scheduler Automático con Trigger Manual

**Objetivo:** Ejecutar el ETL automático de todas las tiendas del día anterior

```bash
# OPCIÓN A: Desde el frontend
1. Ir a tab "ETL Ventas"
2. Panel azul superior "ETL Automático"
3. Verificar que está "✓ Habilitado"
4. Click botón "Ejecutar Ahora"
5. Alert: "ETL automático iniciado manualmente..."
6. Revisar logs del servidor:
   tail -f /tmp/fluxion_backend.log

# OPCIÓN B: Desde curl
curl -X POST http://localhost:8001/api/etl/scheduler/trigger

# Monitorear progreso
watch -n 5 'curl -s http://localhost:8001/api/etl/scheduler/status | python3 -m json.tool | grep -E "(is_running|exitosas|fallidas)"'
```

**Duración estimada:** 30-40 minutos para 16 tiendas

### Escenario 3: Probar Política de Reintentos

**Objetivo:** Simular fallo de tienda y ver reintentos automáticos

```bash
# 1. Trigger ETL automático
curl -X POST http://localhost:8001/api/etl/scheduler/trigger

# 2. Simular fallo (desconectar VPN o cerrar conexión a SQL Server temporalmente)

# 3. Esperar 20 minutos

# 4. Ver reintentos pendientes
curl http://localhost:8001/api/etl/scheduler/status | python3 -m json.tool | grep -A 5 "retry_config"

# Deberías ver:
# "pending_retries": ["tienda_XX", "tienda_YY"],
# "failed_stores": {"tienda_XX": 1, "tienda_YY": 1}

# 5. Reconectar VPN

# 6. Esperar otros 20 minutos para el retry automático

# 7. Verificar que pending_retries se vacíe
```

### Escenario 4: Recuperar Histórico de Tienda

**Objetivo:** Llenar gaps históricos de una tienda (ej: tienda_01 tiene 11 días faltantes)

```bash
# Desde el frontend:
1. Buscar tienda_01 en la tabla
2. Ver "11 días faltantes" debajo de la barra de completitud
3. Click botón "Recuperar"
4. Se llenan fechas:
   - Inicio: 2024-09-01
   - Fin: 2025-10-17
5. CAMBIAR Inicio a: 2025-10-01 (solo 1 mes para prueba más rápida)
6. Click "Ejecutar ETL"
7. Esperar ~15-20 minutos
8. Verificar que "días faltantes" disminuye
```

---

## 5. VERIFICACIÓN DE RESULTADOS

### A. Verificar Datos en DuckDB

```bash
# Contar registros de tienda_01 por fecha
duckdb data/fluxion_production.db <<EOF
SELECT
    fecha,
    COUNT(*) as registros
FROM ventas_raw
WHERE ubicacion_id = 'tienda_01'
  AND fecha >= '2025-10-18'
GROUP BY fecha
ORDER BY fecha DESC;
EOF
```

### B. Verificar Gaps Actualizados

```bash
# Ver gaps después de ETL
curl http://localhost:8001/api/ventas/gaps | python3 -m json.tool > gaps_after.json

# Comparar con estado anterior
diff gaps_before.json gaps_after.json
```

### C. Ver Logs del Scheduler

```bash
# Logs del backend
tail -100 /tmp/fluxion_backend.log | grep -E "(Scheduler|ETL|exitoso|falló)"

# Logs en tiempo real
tail -f /tmp/fluxion_backend.log | grep --color=always -E "(tienda_[0-9]+|exitoso|falló|ERROR)"
```

---

## 6. TROUBLESHOOTING

### Problema: Scheduler no inicia

```bash
# Verificar que el backend esté corriendo
curl http://localhost:8001/

# Ver logs de inicio
tail -50 /tmp/fluxion_backend.log | grep Scheduler

# Reiniciar backend
./stop_dev.sh
./start_dev.sh
```

### Problema: ETL manual no ejecuta

```bash
# Verificar que no haya otro ETL corriendo
curl http://localhost:8001/api/etl/ventas/status

# Si está stuck en "running", reiniciar backend
kill $(cat /tmp/fluxion_backend.pid)
cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8001 > /tmp/fluxion_backend.log 2>&1 &
```

### Problema: Logs no aparecen en frontend

```bash
# Verificar endpoint de logs
curl http://localhost:8001/api/etl/ventas/logs | python3 -m json.tool

# Verificar CORS
# Abrir DevTools del navegador > Console > Ver errores CORS
```

### Problema: Frontend no carga scheduler status

```bash
# Verificar endpoint
curl http://localhost:8001/api/etl/scheduler/status

# Verificar consola del navegador para errores
# F12 > Console
```

---

## 7. LIMPIEZA DESPUÉS DE PRUEBAS

```bash
# 1. Detener servicios
./stop_dev.sh

# 2. Limpiar logs (opcional)
rm /tmp/fluxion_*.log

# 3. Reiniciar para siguiente sesión
./start_dev.sh
```

---

## 8. CHECKLIST DE VALIDACIÓN

Usar este checklist para validar que todo funciona correctamente:

### Backend
- [ ] Backend responde en http://localhost:8001
- [ ] Scheduler inicializado (ver logs)
- [ ] Endpoint `/api/etl/scheduler/status` retorna JSON válido
- [ ] Endpoint `/api/ventas/gaps` retorna lista de tiendas

### Frontend
- [ ] Frontend carga en http://localhost:3000
- [ ] Tab "ETL Ventas" visible y clickeable
- [ ] Panel azul "ETL Automático" muestra estado del scheduler
- [ ] Panel blanco "ETL Manual" muestra tabla de gaps
- [ ] Botones "Actualizar" y "Recuperar" funcionan

### Scheduler Automático
- [ ] Estado: "Habilitado"
- [ ] Próxima ejecución programada (mañana 5 AM)
- [ ] Botón "Ejecutar Ahora" trigger ETL completo
- [ ] Logs del servidor muestran progreso

### ETL Manual
- [ ] Puede seleccionar tienda del dropdown
- [ ] Date pickers permiten seleccionar fechas
- [ ] Botón "Ejecutar ETL" inicia proceso
- [ ] Logs aparecen en terminal negro en tiempo real
- [ ] Gaps se actualizan después de completar

### Política de Reintentos
- [ ] Tiendas fallidas se agregan a pending_retries
- [ ] Scheduler reintenta cada 20 minutos
- [ ] Máximo 3 reintentos por tienda
- [ ] Reintentos exitosos se remueven de la cola

---

## 9. PRÓXIMOS PASOS RECOMENDADOS

1. **Ejecutar Escenario 1** (actualizar 1 día de tienda_01) para validación rápida
2. **Revisar logs** y verificar que no hay errores
3. **Verificar en DuckDB** que los datos se insertaron correctamente
4. **Probar botones de UI** (Actualizar/Recuperar) para UX
5. Si todo funciona, **esperar a las 5:00 AM de mañana** para ver el ETL automático en acción
6. O **ejecutar manualmente** el scheduler con "Ejecutar Ahora"

---

## 10. CONTACTO Y SOPORTE

Si encuentras problemas:
1. Revisar logs: `tail -f /tmp/fluxion_backend.log`
2. Verificar endpoints con curl
3. Revisar console del navegador (F12)
4. Verificar que ETL scripts existen en `etl/core/`
5. Verificar conexión a SQL Server desde scripts ETL

---

**Última actualización:** 2025-10-22
**Versión:** 1.0.0
**Estado:** ✅ Sistema listo para pruebas
