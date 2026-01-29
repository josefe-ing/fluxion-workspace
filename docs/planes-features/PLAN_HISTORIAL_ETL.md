# Plan: Sistema de Historial de Ejecuciones ETL

**Fecha:** 2026-01-28
**Autor:** Fluxion AI Development Team
**Estado:** Aprobado para Implementación

---

## Resumen Ejecutivo

Implementar un sistema completo para registrar, visualizar y analizar el historial de ejecuciones ETL (ventas e inventario) con capacidad de identificar la fase específica donde ocurrió un error y el origen de cada ejecución.

### Objetivos

1. **Historial persistente** de todas las ejecuciones ETL en base de datos
2. **Diagnóstico granular** de errores: fase (extract/transform/load) y categoría específica
3. **Trazabilidad** del origen de ejecución (automática, manual admin, CLI)
4. **Visualización** desde panel de administrador con filtros y estadísticas
5. **Métricas por tienda** para identificar ubicaciones problemáticas

---

## 1. Arquitectura de Base de Datos

### 1.1 Extensión de tabla `etl_executions`

**Migración:** `database/migrations/033_etl_executions_enhanced_UP.sql`

#### Nuevas columnas:

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `error_phase` | VARCHAR(20) | Fase donde ocurrió el error: 'extract', 'transform', 'load' |
| `error_category` | VARCHAR(50) | Categoría específica del error |
| `error_source` | VARCHAR(100) | Fuente del error: 'klk_api', 'stellar_db', 'postgresql' |
| `extract_duration_seconds` | DECIMAL(10,2) | Tiempo en fase de extracción |
| `transform_duration_seconds` | DECIMAL(10,2) | Tiempo en fase de transformación |
| `load_duration_seconds` | DECIMAL(10,2) | Tiempo en fase de carga |
| `source_system` | VARCHAR(20) | Sistema origen: 'klk', 'stellar', 'mixed' |
| `api_requests_count` | INTEGER | Número de requests al API/BD |
| `api_errors_count` | INTEGER | Número de errores en API/BD |
| `records_upserted` | INTEGER | Registros insertados/actualizados |
| `records_failed` | INTEGER | Registros que fallaron |
| `network_diagnostics` | JSONB | Diagnóstico de red: IP, puerto, latencia |
| `is_recovery` | BOOLEAN | Si es ejecución de recuperación de gap |
| `recovered_gap_id` | INTEGER | ID del gap que recuperó |

**SQL:**
```sql
ALTER TABLE etl_executions
ADD COLUMN IF NOT EXISTS error_phase VARCHAR(20),
ADD COLUMN IF NOT EXISTS error_category VARCHAR(50),
ADD COLUMN IF NOT EXISTS error_source VARCHAR(100),
ADD COLUMN IF NOT EXISTS extract_duration_seconds DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS transform_duration_seconds DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS load_duration_seconds DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS source_system VARCHAR(20),
ADD COLUMN IF NOT EXISTS api_requests_count INTEGER,
ADD COLUMN IF NOT EXISTS api_errors_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS records_upserted INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS records_failed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS network_diagnostics JSONB,
ADD COLUMN IF NOT EXISTS is_recovery BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recovered_gap_id INTEGER REFERENCES etl_executions(id);

ALTER TABLE etl_executions
ADD CONSTRAINT chk_error_phase CHECK (
    error_phase IS NULL OR error_phase IN ('extract', 'transform', 'load')
);

CREATE INDEX IF NOT EXISTS idx_etl_executions_error_phase ON etl_executions(error_phase) WHERE error_phase IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_etl_executions_source ON etl_executions(source_system);
CREATE INDEX IF NOT EXISTS idx_etl_executions_recovery ON etl_executions(is_recovery) WHERE is_recovery = TRUE;
```

### 1.2 Nueva tabla `etl_execution_details`

Detalle granular por tienda en cada ejecución multi-tienda.

```sql
CREATE TABLE IF NOT EXISTS etl_execution_details (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER NOT NULL REFERENCES etl_executions(id) ON DELETE CASCADE,

    -- Identificación de tienda
    tienda_id VARCHAR(50) NOT NULL,
    tienda_nombre VARCHAR(100),
    source_system VARCHAR(20),              -- 'klk' o 'stellar'

    -- Resultado individual
    status VARCHAR(20) NOT NULL,            -- 'success', 'failed', 'skipped'
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    duration_seconds DECIMAL(10,2),

    -- Métricas
    records_extracted INTEGER DEFAULT 0,
    records_loaded INTEGER DEFAULT 0,
    duplicates_skipped INTEGER DEFAULT 0,

    -- Error si falló
    error_phase VARCHAR(20),                -- 'extract', 'transform', 'load'
    error_category VARCHAR(50),
    error_message TEXT,

    -- Diagnóstico de red
    server_ip VARCHAR(45),
    server_port INTEGER,
    connection_latency_ms DECIMAL(10,2),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_etl_details_execution ON etl_execution_details(execution_id);
CREATE INDEX idx_etl_details_tienda ON etl_execution_details(tienda_id);
CREATE INDEX idx_etl_details_status ON etl_execution_details(status);
```

### 1.3 Taxonomía de Errores

#### Fase: EXTRACT

| Categoría | Descripción | Caso de Uso |
|-----------|-------------|-------------|
| `vpn_timeout` | VPN no responde o timeout de conexión | Timeout conectando a IP de tienda |
| `vpn_unreachable` | VPN no alcanzable - IP no responde | IP no responde a ping/TCP |
| `api_timeout` | API KLK timeout en request | Request HTTP excede timeout |
| `api_error` | API KLK retornó error (4xx, 5xx) | API retorna status error |
| `api_auth` | Error de autenticación con API KLK | Credenciales inválidas |
| `db_connection` | No se puede conectar a Stellar SQL Server | pyodbc connection error |
| `db_timeout` | Query a Stellar timeout | Query excede timeout |
| `db_error` | Error SQL en Stellar | Error ejecutando query |
| `network_error` | Error de red genérico | Otros errores de red |

#### Fase: TRANSFORM

| Categoría | Descripción | Caso de Uso |
|-----------|-------------|-------------|
| `data_validation` | Datos no pasan validación | Valores fuera de rango |
| `data_format` | Formato de datos inesperado | JSON malformado, tipos incorrectos |
| `missing_fields` | Campos requeridos faltantes | Campos obligatorios null |
| `encoding_error` | Error de codificación de caracteres | UTF-8 decode error |

#### Fase: LOAD

| Categoría | Descripción | Caso de Uso |
|-----------|-------------|-------------|
| `pg_connection` | No se puede conectar a PostgreSQL | psycopg2 connection error |
| `pg_timeout` | Timeout escribiendo a PostgreSQL | INSERT/UPDATE timeout |
| `constraint_violation` | Violación de constraint (FK, unique) | Foreign key violation |
| `disk_full` | Disco lleno en RDS | Insufficient storage |
| `deadlock` | Deadlock detectado | PostgreSQL deadlock |

### 1.4 Valores de `triggered_by`

| Valor | Descripción | Detección |
|-------|-------------|-----------|
| `eventbridge` | AWS EventBridge (scheduled) | `AWS_EXECUTION_ENV` env var presente |
| `fluxion_admin` | Panel administrador Fluxion | `FLUXION_ADMIN=true` env var |
| `cli` | Comando local (desarrollo) | Ninguna env var especial |
| `recovery` | Recuperación automática de gaps | Flag `--recovery-mode` |

---

## 2. Módulo ETL - Execution Tracker

### 2.1 Nuevo archivo: `etl/core/execution_tracker.py`

Módulo centralizado para tracking de ejecuciones con detalle por fase.

#### Clases principales:

```python
class ETLPhase(Enum):
    EXTRACT = 'extract'
    TRANSFORM = 'transform'
    LOAD = 'load'

class ErrorCategory(Enum):
    # Extract
    VPN_TIMEOUT = 'vpn_timeout'
    API_TIMEOUT = 'api_timeout'
    DB_CONNECTION = 'db_connection'
    # ... (ver taxonomía completa arriba)

@dataclass
class PhaseMetrics:
    phase: ETLPhase
    started_at: datetime
    finished_at: datetime
    duration_seconds: float
    records_processed: int
    errors_count: int

@dataclass
class TiendaResult:
    tienda_id: str
    tienda_nombre: str
    source_system: str
    status: str
    records_extracted: int
    records_loaded: int
    error_phase: Optional[ETLPhase]
    error_category: Optional[ErrorCategory]
    error_message: Optional[str]

class ExecutionTracker:
    """
    Tracker para ejecuciones ETL con detalle por fase y tienda.
    """

    def start_execution(...) -> ETLExecution
    def start_tienda(...) -> TiendaResult
    def start_phase(phase: ETLPhase)
    def finish_phase(phase: ETLPhase, records: int)
    def finish_tienda_success(extracted, loaded, duplicates)
    def finish_tienda_error(phase, category, message)
    def record_error(phase, category, message, source, detail)
    def finish_execution(status) -> ETLExecution

    @staticmethod
    def classify_error(exception: Exception, phase: ETLPhase) -> ErrorCategory
```

#### Uso típico:

```python
from core.execution_tracker import ExecutionTracker, ETLPhase, ErrorCategory

tracker = ExecutionTracker()

# Iniciar ejecución
execution = tracker.start_execution(
    etl_name='ventas',
    etl_type='scheduled',
    fecha_desde=fecha_desde,
    fecha_hasta=fecha_hasta,
    tiendas=['tienda_01', 'tienda_02'],
    triggered_by='eventbridge'
)

# Por cada tienda
for tienda in tiendas:
    tracker.start_tienda(tienda_id, tienda_nombre, 'klk')

    try:
        # Fase Extract
        tracker.start_phase(ETLPhase.EXTRACT)
        datos = extraer_ventas_klk(tienda)
        tracker.finish_phase(ETLPhase.EXTRACT, records=len(datos))

        # Fase Transform (si aplica)
        tracker.start_phase(ETLPhase.TRANSFORM)
        datos_transformados = transformar(datos)
        tracker.finish_phase(ETLPhase.TRANSFORM, records=len(datos_transformados))

        # Fase Load
        tracker.start_phase(ETLPhase.LOAD)
        result = cargar_a_postgres(datos_transformados)
        tracker.finish_phase(ETLPhase.LOAD, records=result['loaded'])

        # Éxito
        tracker.finish_tienda_success(
            records_extracted=len(datos),
            records_loaded=result['loaded'],
            duplicates_skipped=result['duplicates']
        )

    except Exception as e:
        # Clasificar error automáticamente
        category = ExecutionTracker.classify_error(e, ETLPhase.EXTRACT)

        tracker.finish_tienda_error(
            phase=ETLPhase.EXTRACT,
            category=category,
            message=str(e)
        )

# Finalizar ejecución
tracker.finish_execution()
```

### 2.2 Modificaciones a ETLs existentes

#### Archivos a modificar:

1. **`etl/etl_ventas_postgres.py`**
   - Importar `ExecutionTracker`
   - Inicializar tracker en `__init__`
   - Instrumentar `ejecutar()` con `start_execution`
   - Instrumentar `_procesar_tienda_klk()` y `_procesar_tienda_stellar()` con tracking por fase
   - Usar `classify_error()` para categorizar excepciones

2. **`etl/etl_inventario_klk_postgres.py`**
   - Misma instrumentación que ventas
   - Tracking por tienda en loop principal

#### Detección automática de origen:

```python
import os

def detect_triggered_by() -> str:
    """Detecta origen de ejecución"""
    if os.environ.get('AWS_EXECUTION_ENV'):
        return 'eventbridge'
    elif os.environ.get('FLUXION_ADMIN') == 'true':
        return 'fluxion_admin'
    else:
        return 'cli'
```

---

## 3. Backend API

### 3.1 Nuevo Router: `backend/routers/etl_history.py`

Router para gestión y consulta de historial ETL.

#### Endpoints:

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| GET | `/api/etl/history` | Lista ejecuciones con filtros | super_admin |
| GET | `/api/etl/history/{id}` | Detalle de una ejecución | super_admin |
| GET | `/api/etl/stats` | Estadísticas agregadas | super_admin |
| POST | `/api/etl/run` | Ejecutar ETL manualmente | super_admin |

#### GET `/api/etl/history`

**Query Parameters:**
- `etl_name`: string - Filtrar por 'ventas' o 'inventario'
- `status`: string - Filtrar por 'success', 'partial', 'failed', 'running'
- `fecha_desde`: date - Fecha inicio del rango
- `fecha_hasta`: date - Fecha fin del rango
- `triggered_by`: string - Filtrar por origen: 'eventbridge', 'fluxion_admin', 'cli'
- `limit`: int - Máximo resultados (default 50, max 200)
- `offset`: int - Offset para paginación

**Response:**
```json
[
  {
    "id": 123,
    "etl_name": "ventas",
    "etl_type": "scheduled",
    "started_at": "2026-01-26T10:00:00Z",
    "finished_at": "2026-01-26T10:00:45Z",
    "duration_seconds": 45.2,
    "status": "partial",
    "records_extracted": 12500,
    "records_loaded": 12480,
    "duplicates_skipped": 20,
    "tiendas_count": 19,
    "tiendas_exitosas": 18,
    "tiendas_fallidas": 1,
    "error_phase": "extract",
    "error_category": "vpn_timeout",
    "triggered_by": "eventbridge"
  }
]
```

#### GET `/api/etl/history/{id}`

**Response:**
```json
{
  "id": 123,
  "etl_name": "ventas",
  "etl_type": "scheduled",
  "started_at": "2026-01-26T10:00:00Z",
  "finished_at": "2026-01-26T10:00:45Z",
  "duration_seconds": 45.2,
  "fecha_desde": "2026-01-26T00:00:00Z",
  "fecha_hasta": "2026-01-26T23:59:59Z",
  "status": "partial",
  "records_extracted": 12500,
  "records_loaded": 12480,
  "duplicates_skipped": 20,
  "gaps_recovered": 0,
  "extract_duration_seconds": 30.5,
  "transform_duration_seconds": 5.2,
  "load_duration_seconds": 9.5,
  "error_phase": "extract",
  "error_category": "vpn_timeout",
  "error_source": "klk_api",
  "error_message": "Connection timeout after 90s to 10.8.0.15:80",
  "error_detail": "Full traceback...",
  "triggered_by": "eventbridge",
  "source_system": "klk",
  "is_recovery": false,
  "tiendas_detail": [
    {
      "tienda_id": "tienda_01",
      "tienda_nombre": "PERIFERICO",
      "source_system": "klk",
      "status": "success",
      "duration_seconds": 2.3,
      "records_extracted": 1250,
      "records_loaded": 1248,
      "duplicates_skipped": 2,
      "error_phase": null,
      "error_category": null,
      "error_message": null
    },
    {
      "tienda_id": "tienda_08",
      "tienda_nombre": "VALLE FRIO",
      "source_system": "klk",
      "status": "failed",
      "duration_seconds": 90.0,
      "records_extracted": 0,
      "records_loaded": 0,
      "duplicates_skipped": 0,
      "error_phase": "extract",
      "error_category": "vpn_timeout",
      "error_message": "Connection timeout after 90s"
    }
  ]
}
```

#### GET `/api/etl/stats`

**Query Parameters:**
- `etl_name`: string - Filtrar por tipo ETL
- `dias`: int - Días hacia atrás (default 7, max 90)

**Response:**
```json
{
  "total_executions": 168,
  "successful": 145,
  "partial": 15,
  "failed": 8,
  "success_rate": 86.31,
  "avg_duration_seconds": 42.5,
  "total_records_loaded": 2150000,
  "total_duplicates": 1250,
  "errors_by_phase": {
    "extract": 18,
    "transform": 2,
    "load": 3
  },
  "errors_by_category": {
    "vpn_timeout": 12,
    "api_timeout": 4,
    "db_connection": 2,
    "pg_timeout": 1
  },
  "tiendas_con_mas_fallos": [
    {
      "tienda_id": "tienda_08",
      "tienda_nombre": "VALLE FRIO",
      "total_ejecuciones": 48,
      "fallos": 8,
      "error_mas_comun": "vpn_timeout"
    }
  ]
}
```

#### POST `/api/etl/run`

**Request Body:**
```json
{
  "etl_name": "ventas",
  "tienda_ids": ["tienda_01", "tienda_08"],
  "fecha_inicio": "2026-01-25 00:00:00",
  "fecha_fin": "2026-01-25 23:59:59"
}
```

**Response:**
```json
{
  "message": "ETL execution started",
  "execution_id": 124,
  "etl_name": "ventas",
  "tienda_ids": ["tienda_01", "tienda_08"],
  "triggered_by": "fluxion_admin",
  "started_at": "2026-01-28T14:30:00Z"
}
```

### 3.2 Modificar `backend/main.py`

1. Registrar nuevo router:
```python
from routers.etl_history import router as etl_history_router
app.include_router(etl_history_router)
```

2. Modificar endpoint existente `/api/etl/sync/ventas` para pasar `triggered_by`:
```python
os.environ['FLUXION_ADMIN'] = 'true'  # Antes de llamar script ETL
```

---

## 4. Frontend

### 4.1 Nuevo Componente: `ETLHistoryTable.tsx`

**Ubicación:** `frontend/src/components/settings/ETLHistoryTable.tsx`

#### Funcionalidad:
- Tabla de ejecuciones ETL con datos de `/api/etl/history`
- Filtros: tipo ETL, estado, rango de fechas, origen
- Polling automático cada 30s para ejecuciones en progreso
- Click en fila abre modal de detalle

#### Columnas:
| Columna | Contenido |
|---------|-----------|
| Fecha/Hora | started_at formateado |
| Tipo | ventas/inventario con badge de color |
| Estado | Badge: success (verde), partial (amarillo), failed (rojo), running (azul pulsante) |
| Duración | Formato humano: "2m 30s" o "45.2s" |
| Tiendas | `18 ✓ / 1 ✗ / 19 total` |
| Registros | records_loaded formateado + duplicates en texto pequeño |
| Error | Si error_phase: icono fase + categoría |
| Origen | Badge: AWS/Admin/CLI |
| Acciones | Botón "Ver detalle" |

#### Íconos por fase:
- Extract: 📥
- Transform: 🔄
- Load: 📤

### 4.2 Nuevo Componente: `ETLExecutionDetailModal.tsx`

**Ubicación:** `frontend/src/components/settings/ETLExecutionDetailModal.tsx`

#### Props:
```typescript
interface Props {
  executionId: number;
  onClose: () => void;
}
```

#### Secciones:

1. **Header**
   - Título: "Ejecución #123 - Ventas"
   - Botón cerrar

2. **Resumen de Métricas** (cards)
   - Duración Total
   - Registros Cargados
   - Duplicados Omitidos
   - Sistema Origen

3. **Tiempo por Fase** (cards horizontales)
   - Extracción: 30.5s
   - Transformación: 5.2s
   - Carga: 9.5s

4. **Error** (si existe, panel rojo)
   - Icono de fase + nombre fase
   - Categoría de error
   - Fuente del error
   - Mensaje completo en `<pre>`

5. **Detalle por Tienda** (tabla)
   - Columnas: Tienda, Sistema, Estado, Tiempo, Registros, Error
   - Resaltar filas con error (bg-red-50)

### 4.3 Nuevo Componente: `ETLStatsCard.tsx` (opcional)

Dashboard de estadísticas:
- Tasa de éxito últimos 7 días
- Duración promedio
- Gráfico de errores por fase (pie chart)
- Top 5 tiendas problemáticas

### 4.4 Integrar en `ETLControlCenter.tsx`

**Ubicación:** `frontend/src/components/settings/ETLControlCenter.tsx`

Agregar tercera tab "Historial":

```tsx
type TabType = 'inventario' | 'ventas' | 'history';

// En tabs
<button onClick={() => setActiveTab('history')}>
  Historial
</button>

// En contenido
{activeTab === 'history' && <ETLHistoryTable />}
```

---

## 5. Implementación - Orden de Archivos

### Fase 1: Base de Datos (Día 1)

| Archivo | Acción |
|---------|--------|
| `database/migrations/033_etl_executions_enhanced_UP.sql` | Crear migración |
| `database/migrations/033_etl_executions_enhanced_DOWN.sql` | Crear rollback |
| (ejecutar) | `python3 database/run_migrations.py` |

### Fase 2: Backend Core ETL (Días 2-3)

| Archivo | Acción |
|---------|--------|
| `etl/core/execution_tracker.py` | Crear módulo nuevo |
| `etl/etl_ventas_postgres.py` | Modificar para usar tracker |
| `etl/etl_inventario_klk_postgres.py` | Modificar para usar tracker |
| (test) | Ejecutar manualmente con `python3 etl_ventas_postgres.py` |

### Fase 3: Backend API (Día 4)

| Archivo | Acción |
|---------|--------|
| `backend/routers/etl_history.py` | Crear router nuevo |
| `backend/main.py` | Registrar router + modificar `/api/etl/sync/ventas` |
| (test) | Probar endpoints con curl/Postman |

### Fase 4: Frontend (Días 5-6)

| Archivo | Acción |
|---------|--------|
| `frontend/src/components/settings/ETLHistoryTable.tsx` | Crear componente |
| `frontend/src/components/settings/ETLExecutionDetailModal.tsx` | Crear componente |
| `frontend/src/components/settings/ETLControlCenter.tsx` | Modificar para agregar tab |
| (test) | Probar UI en desarrollo |

### Fase 5: Testing y Despliegue (Día 7)

- Testing end-to-end local
- Despliegue a staging
- Monitorear ejecuciones reales
- Ajustes finales

---

## 6. Testing y Validación

### 6.1 Tests Manuales

| # | Test | Validación |
|---|------|-----------|
| 1 | Ejecutar ETL ventas desde CLI | `triggered_by = 'cli'` en BD |
| 2 | Ejecutar desde panel admin | `triggered_by = 'fluxion_admin'` en BD |
| 3 | Esperar ejecución scheduled | `triggered_by = 'eventbridge'` en BD |
| 4 | Forzar timeout VPN (firewall) | `error_phase = 'extract'`, `error_category = 'vpn_timeout'` |
| 5 | Forzar error API KLK (credenciales malas) | `error_category = 'api_auth'` |
| 6 | Verificar detalle por tienda | Registro en `etl_execution_details` |
| 7 | Filtrar historial en UI | Filtros funcionan correctamente |
| 8 | Abrir modal detalle | Muestra toda la info de ejecución |
| 9 | Verificar polling de ejecuciones running | Badge "Ejecutando" pulsa, se actualiza al terminar |
| 10 | Verificar estadísticas | Tasa éxito, errores por fase, tiendas problemáticas |

### 6.2 Queries de Verificación SQL

```sql
-- Últimas 10 ejecuciones
SELECT
    id, etl_name, status, duration_seconds,
    records_loaded, error_phase, error_category, triggered_by
FROM etl_executions
ORDER BY started_at DESC
LIMIT 10;

-- Errores por fase últimos 7 días
SELECT
    error_phase,
    error_category,
    COUNT(*) as cantidad
FROM etl_executions
WHERE started_at >= NOW() - INTERVAL '7 days'
  AND error_phase IS NOT NULL
GROUP BY error_phase, error_category
ORDER BY cantidad DESC;

-- Distribución por origen
SELECT
    triggered_by,
    COUNT(*) as total_ejecuciones,
    COUNT(*) FILTER (WHERE status = 'success') as exitosas,
    COUNT(*) FILTER (WHERE status = 'failed') as fallidas,
    ROUND(AVG(duration_seconds)::numeric, 2) as duracion_promedio
FROM etl_executions
WHERE started_at >= NOW() - INTERVAL '30 days'
GROUP BY triggered_by;

-- Tiendas con más fallos
SELECT
    tienda_id,
    tienda_nombre,
    COUNT(*) as total_intentos,
    COUNT(*) FILTER (WHERE status = 'failed') as fallos,
    mode() WITHIN GROUP (ORDER BY error_category) as error_mas_comun
FROM etl_execution_details
WHERE execution_id IN (
    SELECT id FROM etl_executions
    WHERE started_at >= NOW() - INTERVAL '7 days'
)
GROUP BY tienda_id, tienda_nombre
HAVING COUNT(*) FILTER (WHERE status = 'failed') > 0
ORDER BY fallos DESC
LIMIT 10;

-- Tiempo promedio por fase
SELECT
    etl_name,
    ROUND(AVG(extract_duration_seconds)::numeric, 2) as avg_extract,
    ROUND(AVG(transform_duration_seconds)::numeric, 2) as avg_transform,
    ROUND(AVG(load_duration_seconds)::numeric, 2) as avg_load
FROM etl_executions
WHERE started_at >= NOW() - INTERVAL '7 days'
  AND status = 'success'
GROUP BY etl_name;
```

---

## 7. Resumen de Datos Capturados

### Por Ejecución (tabla `etl_executions`):

| Dato | Campo | Ejemplo |
|------|-------|---------|
| Éxito/Fallo | `status` | 'success', 'partial', 'failed' |
| Duración total | `duration_seconds` | 45.2 |
| Registros sincronizados | `records_loaded` | 12480 |
| Duplicados omitidos | `duplicates_skipped` | 20 |
| **Fase del error** | `error_phase` | 'extract', 'transform', 'load' |
| **Tipo de error** | `error_category` | 'vpn_timeout', 'api_error' |
| **Fuente del error** | `error_source` | 'klk_api', 'stellar_db' |
| **Origen de ejecución** | `triggered_by` | 'eventbridge', 'fluxion_admin', 'cli' |
| Tiempo extracción | `extract_duration_seconds` | 30.5 |
| Tiempo transformación | `transform_duration_seconds` | 5.2 |
| Tiempo carga | `load_duration_seconds` | 9.5 |
| Sistema origen | `source_system` | 'klk', 'stellar', 'mixed' |
| Diagnóstico red | `network_diagnostics` | `{"ip": "10.8.0.15", "port": 80}` |

### Por Tienda (tabla `etl_execution_details`):

| Dato | Campo | Ejemplo |
|------|-------|---------|
| Tienda | `tienda_id`, `tienda_nombre` | 'tienda_08', 'VALLE FRIO' |
| Sistema | `source_system` | 'klk', 'stellar' |
| Estado | `status` | 'success', 'failed' |
| Duración | `duration_seconds` | 2.3 |
| Registros | `records_extracted`, `records_loaded` | 1250, 1248 |
| Error fase | `error_phase` | 'extract' |
| Error tipo | `error_category` | 'vpn_timeout' |
| Mensaje | `error_message` | 'Connection timeout after 90s' |
| IP/Puerto | `server_ip`, `server_port` | '10.8.0.15', 1433 |

---

## 8. Notas de Implementación

### 8.1 Consideraciones de Performance

- Índices en `error_phase`, `source_system`, `triggered_by` para queries rápidas
- Tabla `etl_execution_details` puede crecer rápidamente (19 tiendas × 48 ejecuciones/día = 912 rows/día)
- Considerar particionamiento por fecha después de 6 meses
- Limitar `network_diagnostics` JSONB a <1KB

### 8.2 Seguridad

- Todos los endpoints requieren rol `super_admin`
- No exponer credenciales en `error_detail` o `network_diagnostics`
- Sanitizar stack traces antes de guardar

### 8.3 Monitoreo

- Alertar si tasa de éxito < 80% en últimas 24h
- Alertar si una tienda falla > 5 veces consecutivas
- Dashboard Sentry para errores de tracker mismo

### 8.4 Rollback

Si hay problemas, migración DOWN elimina columnas y tabla:
```bash
psql -h <rds-host> -U fluxion -d fluxion_production \
  -f database/migrations/033_etl_executions_enhanced_DOWN.sql
```

---

## 9. Cronograma

| Fase | Días | Responsable | Entregable |
|------|------|-------------|-----------|
| **1. Base de Datos** | 0.5 | Backend Dev | Migraciones ejecutadas |
| **2. Backend Core ETL** | 2 | ETL Dev | Tracker funcionando |
| **3. Backend API** | 1 | Backend Dev | Endpoints probados |
| **4. Frontend** | 2 | Frontend Dev | UI completa |
| **5. Testing** | 1 | QA + Devs | Tests pasando |
| **6. Despliegue** | 0.5 | DevOps | Producción live |
| **Total** | **7 días** | | Sistema completo |

---

## 10. Criterios de Éxito

- ✅ Todas las ejecuciones ETL registradas en BD con detalle por fase
- ✅ Errores clasificados correctamente en fase + categoría
- ✅ Origen de ejecución (`triggered_by`) capturado correctamente
- ✅ Panel de administrador muestra historial con filtros funcionales
- ✅ Modal de detalle muestra información completa de cada ejecución
- ✅ Tiendas problemáticas identificables vía estadísticas
- ✅ Queries de diagnóstico funcionan en <1s
- ✅ 0 regresiones en funcionalidad ETL existente

---

## Apéndice A: Estructura de Archivos

```
fluxion-workspace/
├── database/
│   └── migrations/
│       ├── 033_etl_executions_enhanced_UP.sql     [CREAR]
│       └── 033_etl_executions_enhanced_DOWN.sql   [CREAR]
│
├── etl/
│   ├── core/
│   │   └── execution_tracker.py                   [CREAR]
│   ├── etl_ventas_postgres.py                     [MODIFICAR]
│   └── etl_inventario_klk_postgres.py             [MODIFICAR]
│
├── backend/
│   ├── routers/
│   │   └── etl_history.py                         [CREAR]
│   └── main.py                                    [MODIFICAR]
│
└── frontend/
    └── src/
        └── components/
            └── settings/
                ├── ETLHistoryTable.tsx            [CREAR]
                ├── ETLExecutionDetailModal.tsx    [CREAR]
                └── ETLControlCenter.tsx           [MODIFICAR]
```

---

## Apéndice B: Referencias

- Migration 021: `database/migrations/021_etl_executions_UP.sql` - Schema base
- ETL Tracker legacy: `etl/core/etl_tracker.py` - Referencia para nuevo tracker
- Panel Admin: `frontend/src/components/settings/ETLControlCenter.tsx`
- Endpoints ETL existentes: `backend/main.py` líneas 180-220

---

**Fin del documento**
