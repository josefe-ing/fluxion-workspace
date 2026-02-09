# Plan: Vista Materializada para Summary-Regional

## 📋 Contexto

**Problema:** El endpoint `/api/ubicaciones/summary-regional` tarda 25 segundos, causando timeouts en el navegador.

**Solución:** Crear vista materializada PostgreSQL que pre-calcula el resultado y se refresca cada 10 minutos.

**Impacto Esperado:**
- Tiempo de respuesta: 25s → <1s (25x más rápido)
- Sin cambios de infraestructura (solo PostgreSQL + EventBridge)
- Costo: $0 (usa recursos existentes)

---

## 🎯 Componentes a Crear

### 1. Vista Materializada PostgreSQL
**Archivo:** `database/migrations/037_mv_summary_regional_UP.sql`

**Contenido de la Vista:**
- **Nombre:** `mv_ubicaciones_summary_regional`
- **Datos:** Resumen de inventario por región/ubicación/almacén
- **Columnas (15):**
  - region, ubicacion_id, ubicacion_nombre, tipo, almacen_codigo
  - total_skus, skus_con_stock, stock_cero, stock_negativo
  - ultima_actualizacion, fill_rate
  - dias_cobertura_a/b/c, riesgo_quiebre

**SQL Base:** Copia exacta del query actual con 5 CTEs:
```sql
CREATE MATERIALIZED VIEW mv_ubicaciones_summary_regional AS
WITH ubicacion_data AS (...),
     ventas_30d AS (...),
     demanda_p75 AS (...),
     stock_con_demanda AS (...),
     abc_metrics AS (...)
SELECT ... FROM ubicacion_data ud
LEFT JOIN abc_metrics am ...
ORDER BY ud.region, ud.tipo DESC, ud.ubicacion_nombre, ud.almacen_codigo;
```

**Índices Requeridos:**
```sql
-- Necesario para REFRESH CONCURRENTLY (no bloquea lecturas)
CREATE UNIQUE INDEX idx_mv_summary_regional_pk
ON mv_ubicaciones_summary_regional(ubicacion_id, almacen_codigo);

-- Performance indexes
CREATE INDEX idx_mv_summary_regional_region
ON mv_ubicaciones_summary_regional(region);
```

---

### 2. Función de Refresh en PostgreSQL
**Archivo:** Mismo `037_mv_summary_regional_UP.sql`

**Agregar a función existente `refresh_bi_views()`:**

Actualizar la función para incluir la nueva vista:

```sql
-- Modificar función existente (creada en migration 020)
CREATE OR REPLACE FUNCTION refresh_bi_views()
RETURNS TABLE(vista_nombre TEXT, tiempo_ms BIGINT, status TEXT) AS $$
DECLARE
    start_time BIGINT;
    elapsed_time BIGINT;
BEGIN
    -- Existing views (5 actuales)
    ...existing code...

    -- NEW: Refresh summary-regional view
    start_time := EXTRACT(EPOCH FROM clock_timestamp()) * 1000;
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ubicaciones_summary_regional;
        elapsed_time := EXTRACT(EPOCH FROM clock_timestamp()) * 1000 - start_time;
        RETURN QUERY SELECT 'mv_ubicaciones_summary_regional'::TEXT, elapsed_time, 'SUCCESS'::TEXT;
    EXCEPTION WHEN OTHERS THEN
        elapsed_time := EXTRACT(EPOCH FROM clock_timestamp()) * 1000 - start_time;
        RETURN QUERY SELECT 'mv_ubicaciones_summary_regional'::TEXT, elapsed_time, ('ERROR: ' || SQLERRM)::TEXT;
    END;

    RETURN;
END;
$$ LANGUAGE plpgsql;
```

---

### 3. Script Python de Refresh
**Archivo:** `etl/refresh_bi_views.py` (usar el existente o verificar)

**Opciones:**
- **A. Usar existente:** Ya existe `/backend/routers/business_intelligence.py` con endpoint `/bi/refresh-bi-views`
- **B. Crear ETL dedicado:** `etl/refresh_bi_views.py` para EventBridge

**Contenido (Opción B - ETL script):**
```python
#!/usr/bin/env python3
"""
Refresh BI Materialized Views
Ejecutado por EventBridge cada 10 minutos
"""
import logging
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from db_manager import get_postgres_connection

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

def refresh_bi_views():
    """Execute PostgreSQL function refresh_bi_views()"""
    try:
        with get_postgres_connection() as conn:
            cursor = conn.cursor()

            logger.info("🔄 Starting BI views refresh...")
            cursor.execute("SELECT * FROM refresh_bi_views()")
            results = cursor.fetchall()
            cursor.close()
            conn.commit()

            # Log results
            total_time = 0
            for row in results:
                vista, tiempo_ms, status = row
                total_time += tiempo_ms

                if status == 'SUCCESS':
                    logger.info(f"✅ {vista}: {tiempo_ms}ms")
                else:
                    logger.error(f"❌ {vista}: {tiempo_ms}ms - {status}")

            logger.info(f"✅ All BI views refreshed in {total_time}ms total")
            return True

    except Exception as e:
        logger.error(f"❌ Error refreshing BI views: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    success = refresh_bi_views()
    sys.exit(0 if success else 1)
```

---

### 4. EventBridge Rule (AWS CDK)
**Archivo:** `infrastructure/lib/infrastructure-stack.ts`

**Agregar después de línea 1246:**

```typescript
// ========================================
// BI Views Refresh (Every 10 minutes)
// ========================================
const biViewsRefreshRule = new events.Rule(this, 'BIViewsRefresh10Min', {
  ruleName: 'fluxion-bi-views-refresh-10min',
  description: 'Refresh BI materialized views every 10 minutes for fast dashboard loading',
  schedule: events.Schedule.cron({
    minute: '0,10,20,30,40,50',  // Every 10 minutes at :00, :10, :20, :30, :40, :50
    hour: '*',                     // All hours
    day: '*',
    month: '*',
    year: '*',
  }),
  enabled: true,
});

biViewsRefreshRule.addTarget(
  new targets.EcsTask({
    cluster,
    taskDefinition: etlTask,  // Existing ETL task definition
    subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    securityGroups: [etlSecurityGroup],
    platformVersion: ecs.FargatePlatformVersion.LATEST,
    taskCount: 1,
    propagateTags: ecs.PropagatedTagSource.TASK_DEFINITION,
    containerOverrides: [{
      containerName: 'etl',
      command: [
        'python3',
        'etl/refresh_bi_views.py'  // New script
      ]
    }],
    maxEventAge: cdk.Duration.minutes(8),  // Discard stale events
    retryAttempts: 0,  // No retries (will run again in 10 min anyway)
  })
);

// Add CloudWatch log group for monitoring
const biRefreshLogGroup = new logs.LogGroup(this, 'BIViewsRefreshLogGroup', {
  logGroupName: '/aws/ecs/fluxion-bi-refresh',
  retention: logs.RetentionDays.ONE_WEEK,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

---

### 5. Backend Endpoint Modification
**Archivo:** `backend/routers/ubicaciones.py`

**Modificar `get_ubicaciones_summary_regional()`:**

**Antes (líneas 166-379):**
```python
@router.get("/ubicaciones/summary-regional", response_model=List[RegionSummary])
async def get_ubicaciones_summary_regional():
    # ... 200 líneas de código complejo con 5 CTEs ...
    cursor.execute(query)  # Takes 25 seconds
    rows = cursor.fetchall()
    # ... process results ...
```

**Después (simplificado):**
```python
@router.get("/ubicaciones/summary-regional", response_model=List[RegionSummary])
async def get_ubicaciones_summary_regional():
    """
    Obtiene resumen de inventario agrupado por región (CARACAS / VALENCIA).

    PERFORMANCE: Uses materialized view mv_ubicaciones_summary_regional
    Refreshed every 10 minutes by EventBridge job.
    Response time: <1s (previously 25s)
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Simple query to materialized view (sub-second response)
            query = """
                SELECT
                    region,
                    ubicacion_id,
                    ubicacion_nombre,
                    tipo,
                    almacen_codigo,
                    total_skus,
                    skus_con_stock,
                    stock_cero,
                    stock_negativo,
                    ultima_actualizacion,
                    fill_rate,
                    dias_cobertura_a,
                    dias_cobertura_b,
                    dias_cobertura_c,
                    riesgo_quiebre
                FROM mv_ubicaciones_summary_regional
                ORDER BY region, tipo DESC, ubicacion_nombre, almacen_codigo
            """

            cursor.execute(query)
            rows = cursor.fetchall()
            cursor.close()

            # Process results (same grouping logic as before)
            # ... rest of code unchanged ...
```

**Opcional - Mantener fallback:**
```python
# Try materialized view first, fallback to direct query if view doesn't exist
try:
    cursor.execute("SELECT * FROM mv_ubicaciones_summary_regional ...")
except Exception as e:
    logger.warning(f"Materialized view not available, using direct query: {e}")
    # Fall back to original complex query
    cursor.execute(original_complex_query)
```

**Eliminar cache en memoria:**
- Remover variables globales: `_summary_regional_cache`, `_summary_regional_cache_time`
- La vista materializada reemplaza el cache

---

## 📦 Archivos a Crear/Modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `database/migrations/037_mv_summary_regional_UP.sql` | ✨ CREAR | Vista materializada + índices + función refresh |
| `etl/refresh_bi_views.py` | ✨ CREAR | Script Python para refresh periódico |
| `infrastructure/lib/infrastructure-stack.ts` | ✏️ MODIFICAR | Agregar EventBridge rule (línea ~1247) |
| `backend/routers/ubicaciones.py` | ✏️ MODIFICAR | Simplificar endpoint para usar vista |

---

## 🔄 Flujo de Ejecución

### Setup Inicial
1. **Ejecutar migración 037** → Crea vista materializada + índices
2. **Deploy CDK** → Activa EventBridge rule
3. **Primera carga manual** → `REFRESH MATERIALIZED VIEW mv_ubicaciones_summary_regional;`
4. **Deploy backend** → Endpoint usa la vista

### Operación Normal
```
┌─────────────────┐
│  EventBridge    │  Cada 10 minutos (:00, :10, :20, :30, :40, :50)
│  Cron Rule      │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  ECS Task       │  python3 etl/refresh_bi_views.py
│  (ETL Container)│
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  PostgreSQL     │  REFRESH MATERIALIZED VIEW CONCURRENTLY
│  refresh_bi_    │  mv_ubicaciones_summary_regional
│  views()        │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Vista Updated  │  Data fresh for next 10 minutes
│  25s compute    │
│  → stored       │
└─────────────────┘

┌─────────────────┐
│  API Request    │  GET /api/ubicaciones/summary-regional
│  (User)         │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Backend        │  SELECT * FROM mv_ubicaciones_summary_regional
│  (FastAPI)      │  Response: <1 second ⚡
└─────────────────┘
```

---

## ✅ Ventajas de esta Solución

1. **Performance:** 25s → <1s (25x más rápido)
2. **Sin cambio de arquitectura:** Solo PostgreSQL + EventBridge existente
3. **Costo:** $0 adicional (usa recursos actuales)
4. **Escalable:** Funciona con múltiples instancias de backend
5. **Persistente:** Vista sobrevive reinicios de backend
6. **No-blocking:** `REFRESH CONCURRENTLY` no bloquea lecturas
7. **Monitoreable:** CloudWatch Logs automáticos
8. **Reusable:** Patrón aplicable a otros endpoints lentos

---

## ⚠️ Consideraciones

### Freshness de Datos
- **Refresco:** Cada 10 minutos
- **Latencia máxima:** Datos pueden tener hasta 10 minutos de antigüedad
- **Aceptable para:** Dashboard de resumen (no requiere datos en tiempo real)

### Impacto en Base de Datos
- **Refresh time:** ~25 segundos cada 10 minutos
- **Concurrent refresh:** No bloquea queries de lectura
- **Storage:** ~1-5 MB adicional para la vista

### Mantenimiento
- **Migración reversible:** Crear `037_mv_summary_regional_DOWN.sql` si es necesario
- **Si cambia el query:** Re-run migración UP para recrear vista
- **Monitoreo:** CloudWatch Logs en `/aws/ecs/fluxion-bi-refresh`

---

## 🧪 Plan de Verificación

### 1. Migración Database
```bash
cd database
python3 run_migrations.py --up
# Verificar que migration 037 se aplicó
python3 run_migrations.py --list
```

**Validar vista creada:**
```sql
-- Verificar vista existe
SELECT * FROM pg_matviews WHERE matviewname = 'mv_ubicaciones_summary_regional';

-- Verificar índices
SELECT indexname FROM pg_indexes
WHERE tablename = 'mv_ubicaciones_summary_regional';

-- Verificar datos
SELECT COUNT(*) FROM mv_ubicaciones_summary_regional;
-- Debe retornar ~30-40 filas (todas las ubicaciones x almacenes)
```

### 2. Función Refresh
```sql
-- Ejecutar refresh manual
SELECT * FROM refresh_bi_views();

-- Debe retornar:
-- mv_ubicaciones_summary_regional | ~25000 | SUCCESS
-- (junto con las otras 5 vistas existentes)
```

### 3. Backend Endpoint
```bash
# Test local
curl http://localhost:8001/api/ubicaciones/summary-regional

# Test producción
curl https://api.fluxionia.co/api/ubicaciones/summary-regional

# Verificar respuesta < 1 segundo
time curl -s https://api.fluxionia.co/api/ubicaciones/summary-regional > /dev/null
```

### 4. EventBridge Rule
```bash
# Deploy CDK
cd infrastructure
npx cdk deploy

# Verificar en AWS Console:
# - EventBridge → Rules → fluxion-bi-views-refresh-10min
# - CloudWatch Logs → /aws/ecs/fluxion-bi-refresh
# - ECS → Tasks → Verificar ejecuciones cada 10 min
```

### 5. End-to-End Test
1. Abrir navegador: https://app.fluxionia.co/inventarios
2. Verificar carga en <2 segundos (incluyendo frontend)
3. Monitorear CloudWatch Logs para ver refreshes cada 10 min

---

## 📊 Métricas de Éxito

| Métrica | Antes | Después | Meta |
|---------|-------|---------|------|
| Tiempo de respuesta API | 25s | <1s | ✅ <2s |
| Timeout en navegador | Sí | No | ✅ 0% |
| Freshness de datos | Real-time | 10 min | ✅ <15 min |
| Costo mensual adicional | - | $0 | ✅ <$10 |
| Carga DB por request | Alta | Mínima | ✅ <100ms query |

---

## 🚀 Orden de Implementación

1. **Crear migración 037** (30 min)
2. **Crear script ETL refresh** (15 min)
3. **Modificar backend endpoint** (20 min)
4. **Agregar EventBridge rule** (15 min)
5. **Testing y deploy** (30 min)

**Total estimado:** 1.5-2 horas

---

## 📝 Notas Adicionales

- **Patrón reusable:** Otros endpoints lentos pueden usar mismo approach
- **Migración a Redis:** Si escalaras a 10+ instancias, considera Redis en lugar de vistas materializadas
- **Monitoreo:** Sentry Cron Monitors puede agregarse al EventBridge job (como otros ETLs)
- **Rollback:** Si algo falla, simplemente revertir backend a query original y desactivar EventBridge rule
