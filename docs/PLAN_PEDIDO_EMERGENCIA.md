# Plan: Pedido de Emergencia

## Resumen Ejecutivo

Feature para detectar productos con inventario crítico durante el día y permitir solicitar reabastecimiento urgente al CEDI. Incluye detección automática, dashboard de emergencias, notificaciones por email, y wizard simplificado para crear pedidos de emergencia.

**Scope inicial:** Región Caracas (tienda_17 ARTIGAS, tienda_18 PARAISO, cedi_caracas)

---

## 1. Tipos de Emergencia

| Tipo | Condición | Prioridad | Color |
|------|-----------|-----------|-------|
| **STOCKOUT** | `stock_actual = 0` AND clase ABC in (A, B) | CRÍTICA | Rojo |
| **INMINENTE** | `horas_hasta_stockout < horas_restantes_dia` AND `< 4 horas` | ALTA | Naranja |
| **DEPLECIÓN_CRÍTICA** | `stock < SS * 0.5` AND `velocidad_hoy > P75 * 1.5` | MEDIA | Amarillo |

### Algoritmo de Detección

```
# Calcular velocidad de venta intraday
ventas_hoy = SUM(cantidad) WHERE fecha >= HOY 7:00am
horas_operando = hora_actual - 7:00
velocidad_hora = ventas_hoy / horas_operando

# Estimar horas hasta stockout
horas_hasta_stockout = stock_actual / velocidad_hora

# Horas restantes del día
horas_restantes = 21:00 - hora_actual

# Determinar si hay emergencia
IF stock_actual = 0 → STOCKOUT
ELIF horas_hasta_stockout < horas_restantes AND horas_hasta_stockout < 4 → INMINENTE
ELIF stock_actual < SS * 0.5 AND velocidad_hora > P75 * 1.5 → DEPLECIÓN_CRÍTICA
```

**Casos especiales:**
- Sin ventas hoy → usar P75 histórico como velocidad de referencia
- Antes de 10am → mínimo 2 horas de datos, sino usar P75 * 1.2
- CEDI sin stock → marcar como "NO_RESOLUBLE" (requiere compra a proveedor)

---

## 2. Arquitectura Backend

### 2.1 Nuevos Archivos

```
backend/
├── routers/
│   └── emergencias.py              # Router API (NUEVO)
├── services/
│   └── detector_emergencias.py     # Lógica de detección (NUEVO)
├── models/
│   └── emergencias.py              # Modelos Pydantic (NUEVO)
```

### 2.2 Modelos (`backend/models/emergencias.py`)

```python
class TipoEmergencia(str, Enum):
    STOCKOUT = "stockout"
    INMINENTE = "inminente"
    DEPLECION_CRITICA = "deplecion_critica"

class EmergenciaDetectada(BaseModel):
    id: str
    tienda_id: str
    tienda_nombre: str
    producto_id: str
    producto_nombre: str
    clasificacion_abc: str
    tipo_emergencia: TipoEmergencia
    prioridad: int  # 1=crítica, 2=alta, 3=media
    stock_actual: float
    stock_seguridad: float
    ventas_hoy: float
    velocidad_hora: float
    horas_hasta_stockout: Optional[float]
    hora_stockout_estimada: Optional[str]
    stock_cedi: float
    cantidad_sugerida: float
    es_resoluble: bool  # False si CEDI también está en 0
    detectado_at: datetime

class ScanEmergenciasRequest(BaseModel):
    tiendas: List[str] = ["tienda_17", "tienda_18"]
    solo_clase_ab: bool = True

class ScanEmergenciasResponse(BaseModel):
    timestamp: datetime
    tiendas_escaneadas: List[str]
    total_emergencias: int
    por_tipo: Dict[str, int]
    emergencias: List[EmergenciaDetectada]
```

### 2.3 Endpoints (`backend/routers/emergencias.py`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/emergencias/scan` | POST | Escaneo manual de emergencias |
| `/api/emergencias/` | GET | Listar emergencias activas (con filtros) |
| `/api/emergencias/stats` | GET | Estadísticas (por día, tienda, tipo) |
| `/api/emergencias/config` | GET | Configuración actual de detección |

### 2.4 Servicio de Detección (`backend/services/detector_emergencias.py`)

```python
async def detectar_emergencias(
    conn,
    tiendas: List[str] = ["tienda_17", "tienda_18"],
    cedi_id: str = "cedi_caracas",
    solo_clase_ab: bool = True,
    hora_apertura: time = time(7, 0),
    hora_cierre: time = time(21, 0)
) -> List[EmergenciaDetectada]:
    """
    Query principal que:
    1. Obtiene stock actual por producto/tienda
    2. Obtiene ventas de hoy por producto/tienda
    3. Calcula velocidad y proyección de stockout
    4. Filtra por umbrales de emergencia
    5. Verifica stock en CEDI
    """

async def calcular_velocidad_intraday(
    ventas_hoy: float,
    hora_actual: time,
    hora_apertura: time,
    p75_historico: float
) -> float:
    """Calcula velocidad horaria, con fallback a P75"""

async def clasificar_emergencia(
    stock_actual: float,
    horas_hasta_stockout: float,
    horas_restantes: float,
    stock_seguridad: float,
    velocidad_hora: float,
    p75: float,
    clase_abc: str
) -> Optional[TipoEmergencia]:
    """Determina tipo de emergencia según umbrales"""
```

### 2.5 Scheduler Automático (en `backend/main.py`)

```python
# Agregar al startup_event
async def _emergency_scan_scheduler():
    """Escaneo automático cada 30 minutos durante horario de tienda"""
    while True:
        now = datetime.now(ZoneInfo("America/Caracas"))
        if 7 <= now.hour < 21:  # Solo horario de operación
            try:
                emergencias = await detectar_emergencias(...)
                if emergencias:
                    await enviar_alerta_emergencias(emergencias)
            except Exception as e:
                logger.error(f"Error en scan de emergencias: {e}")
        await asyncio.sleep(30 * 60)  # 30 minutos
```

### 2.6 Notificaciones Email

Extender `backend/email_notifier.py` con nuevo método:

```python
def send_emergency_alert(
    self,
    emergencias: List[EmergenciaDetectada],
    tienda_nombre: str
) -> bool:
    """
    Envía alerta de emergencias detectadas.
    - Asunto: "🚨 ALERTA EMERGENCIA - {tienda} - {n} productos críticos"
    - Tabla HTML con productos, stock, velocidad, stockout estimado
    - Link al dashboard de emergencias
    """
```

**Configuración de destinatarios:**
```
EMERGENCY_NOTIFICATION_EMAILS=gerente@lagranja.com,operaciones@lagranja.com
```

---

## 3. Arquitectura Frontend

### 3.1 Nuevos Archivos

```
frontend/src/
├── components/
│   └── emergencies/
│       ├── EmergencyDashboard.tsx      # Dashboard principal
│       ├── EmergencyTable.tsx          # Tabla de emergencias
│       ├── EmergencyScanButton.tsx     # Botón escaneo manual
│       └── EmergencyOrderWizard.tsx    # Wizard simplificado (2 pasos)
├── services/
│   └── emergenciasService.ts           # API client
```

### 3.2 Dashboard de Emergencias (`EmergencyDashboard.tsx`)

**Ubicación:** Nueva pestaña "Emergencias" en la página de Pedidos Sugeridos

**Contenido:**
- Header con última hora de escaneo + botón "Escanear Ahora"
- Cards de resumen: Total emergencias, Por tipo (STOCKOUT/INMINENTE/DEPLECIÓN)
- Filtros: Por tienda, por tipo, por clase ABC
- Tabla de emergencias con acciones

**Auto-refresh:** Polling cada 60 segundos cuando el dashboard está visible

### 3.3 Tabla de Emergencias (`EmergencyTable.tsx`)

| Columna | Descripción |
|---------|-------------|
| Prioridad | Badge rojo/naranja/amarillo |
| Producto | Código + nombre |
| ABC | Clasificación |
| Stock Actual | Con indicador visual |
| Ventas Hoy | Cantidad vendida |
| Vel/Hora | Velocidad de venta |
| Stockout Est. | Hora estimada de agotamiento |
| Stock CEDI | Disponibilidad en CEDI |
| Acción | Checkbox para seleccionar |

**Acciones:**
- Seleccionar múltiples productos
- Botón "Crear Pedido de Emergencia" (abre wizard)

### 3.4 Wizard de Pedido de Emergencia (`EmergencyOrderWizard.tsx`)

**Flujo simplificado en 2 pasos** (basado en OrderWizard.tsx existente):

**Paso 1 - Confirmar Productos:**
- Lista pre-cargada con productos en emergencia seleccionados
- Mostrar: código, nombre, stock actual, stock CEDI, cantidad sugerida
- Permitir ajustar cantidad (input editable)
- Eliminar productos si no se quieren pedir

**Paso 2 - Confirmar y Enviar:**
- Resumen: total productos, total bultos, peso estimado
- Nota/comentario opcional
- Botón "Crear Pedido de Emergencia"

**Al guardar:**
- Crea pedido con `tipo_pedido = 'emergencia'`
- Estado inicial: `borrador` o directo a `pendiente_aprobacion_gerente`
- Redirige a vista de pedido creado

### 3.5 Servicio API (`emergenciasService.ts`)

```typescript
const API_BASE = '/api/emergencias';

export interface Emergencia {
  id: string;
  tienda_id: string;
  tienda_nombre: string;
  producto_id: string;
  producto_nombre: string;
  clasificacion_abc: string;
  tipo_emergencia: 'stockout' | 'inminente' | 'deplecion_critica';
  prioridad: number;
  stock_actual: number;
  ventas_hoy: number;
  velocidad_hora: number;
  horas_hasta_stockout: number | null;
  hora_stockout_estimada: string | null;
  stock_cedi: number;
  cantidad_sugerida: number;
  es_resoluble: boolean;
}

export async function scanEmergencias(tiendas?: string[]): Promise<Emergencia[]>;
export async function listarEmergencias(filtros?: FiltrosEmergencia): Promise<Emergencia[]>;
export async function getEmergenciaStats(): Promise<EmergenciaStats>;
```

---

## 4. Base de Datos

**No se requieren nuevas tablas.** La detección usa queries sobre tablas existentes:

- `stock_actual` - Stock actual por producto/ubicación
- `ventas` - Ventas del día para calcular velocidad
- `productos` - Catálogo con clasificación ABC
- `productos_abc_tienda` - ABC por tienda
- `pedidos_sugeridos` - Para crear pedidos (ya soporta `tipo_pedido = 'emergencia'`)

### Query Principal de Detección

```sql
WITH ventas_hoy AS (
    SELECT
        ubicacion_id,
        producto_id,
        SUM(cantidad_vendida) as vendido_hoy,
        COUNT(*) as transacciones
    FROM ventas
    WHERE fecha_venta >= CURRENT_DATE + TIME '07:00:00'
      AND ubicacion_id IN ('tienda_17', 'tienda_18')
    GROUP BY ubicacion_id, producto_id
),
stock_tiendas AS (
    SELECT ubicacion_id, producto_id, cantidad as stock
    FROM stock_actual
    WHERE ubicacion_id IN ('tienda_17', 'tienda_18')
),
stock_cedi AS (
    SELECT producto_id, cantidad as stock_cedi
    FROM stock_actual
    WHERE ubicacion_id = 'cedi_caracas'
),
params AS (
    SELECT
        producto_id,
        ubicacion_id,
        stock_seguridad,
        demanda_p75
    FROM productos_abc_tienda
    WHERE ubicacion_id IN ('tienda_17', 'tienda_18')
)
SELECT
    st.ubicacion_id,
    st.producto_id,
    p.nombre as producto_nombre,
    pat.clasificacion_abc,
    st.stock as stock_actual,
    COALESCE(vh.vendido_hoy, 0) as ventas_hoy,
    -- Velocidad horaria
    CASE
        WHEN EXTRACT(HOUR FROM CURRENT_TIME) > 7
        THEN COALESCE(vh.vendido_hoy, 0) / GREATEST(1, EXTRACT(HOUR FROM CURRENT_TIME) - 7)
        ELSE params.demanda_p75 / 14  -- P75 diario / 14 horas
    END as velocidad_hora,
    sc.stock_cedi,
    params.stock_seguridad,
    params.demanda_p75
FROM stock_tiendas st
JOIN productos p ON st.producto_id = p.producto_id
JOIN productos_abc_tienda pat ON st.producto_id = pat.producto_id
    AND st.ubicacion_id = pat.ubicacion_id
LEFT JOIN ventas_hoy vh ON st.ubicacion_id = vh.ubicacion_id
    AND st.producto_id = vh.producto_id
LEFT JOIN stock_cedi sc ON st.producto_id = sc.producto_id
LEFT JOIN params ON st.producto_id = params.producto_id
    AND st.ubicacion_id = params.ubicacion_id
WHERE pat.clasificacion_abc IN ('A', 'B')
  AND (
    st.stock = 0  -- STOCKOUT
    OR st.stock < params.stock_seguridad * 0.5  -- Posible depleción crítica
    OR vh.vendido_hoy > 0  -- Tiene ventas hoy (calcular proyección)
  );
```

---

## 5. Configuración

Variables de entorno a agregar:

```bash
# Detección de emergencias
EMERGENCY_SCAN_ENABLED=true
EMERGENCY_SCAN_INTERVAL_MINUTES=30
EMERGENCY_NOTIFICATION_EMAILS=gerente@lagranja.com

# Tiendas habilitadas (Caracas inicial)
EMERGENCY_TIENDAS=tienda_17,tienda_18
EMERGENCY_CEDI=cedi_caracas

# Horarios
EMERGENCY_STORE_OPEN=07:00
EMERGENCY_STORE_CLOSE=21:00
EMERGENCY_DELIVERY_CUTOFF=16:00  # Después de esta hora, entrega es mañana

# Umbrales
EMERGENCY_INMINENTE_HORAS=4      # Stockout en menos de 4 horas
EMERGENCY_DEPLECION_FACTOR=0.5  # Stock < SS * 0.5
EMERGENCY_VELOCIDAD_ALTA=1.5    # Velocidad > P75 * 1.5
```

---

## 6. Reglas de Negocio

### 6.1 Horario de Corte

- **Antes de 4:00 PM:** Pedido puede llegar mismo día
- **Después de 4:00 PM:** Mostrar aviso "Entrega mañana"
- **Sábado después de 2:00 PM:** Entrega lunes

### 6.2 CEDI Sin Stock

Si el CEDI también tiene stock = 0:
- Marcar emergencia como `es_resoluble = false`
- Mostrar en UI con icono diferente (gris)
- Email incluye nota "Requiere compra urgente a proveedor"

### 6.3 Productos Sin Historial

Para productos nuevos sin ventas históricas:
- Usar P75 regional de tiendas similares (patrón existente de "envío prueba")
- Si no hay referencia, excluir de detección automática

---

## 7. Fases de Implementación

### Fase 1: Backend Core
**Archivos a crear/modificar:**
- `backend/models/emergencias.py` (nuevo)
- `backend/services/detector_emergencias.py` (nuevo)
- `backend/routers/emergencias.py` (nuevo)
- `backend/main.py` (agregar router + scheduler)

**Entregable:** Endpoints funcionales, detección de emergencias via API

### Fase 2: Notificaciones Email
**Archivos a modificar:**
- `backend/email_notifier.py` (agregar método)

**Entregable:** Emails de alerta cuando se detectan emergencias

### Fase 3: Frontend Dashboard
**Archivos a crear:**
- `frontend/src/components/emergencies/EmergencyDashboard.tsx`
- `frontend/src/components/emergencies/EmergencyTable.tsx`
- `frontend/src/components/emergencies/EmergencyScanButton.tsx`
- `frontend/src/services/emergenciasService.ts`

**Archivos a modificar:**
- `frontend/src/components/orders/SuggestedOrder.tsx` (agregar tab)
- `frontend/src/App.tsx` (si se necesita nueva ruta)

**Entregable:** Dashboard visible con lista de emergencias

### Fase 4: Wizard de Pedido
**Archivos a crear:**
- `frontend/src/components/emergencies/EmergencyOrderWizard.tsx`

**Entregable:** Flujo completo desde detección hasta creación de pedido

### Fase 5: Testing e Integración
- Probar detección con datos reales de Caracas
- Verificar emails
- Ajustar umbrales según feedback

---

## 8. Archivos Clave de Referencia

| Archivo | Usar como referencia para |
|---------|---------------------------|
| `backend/routers/pedidos_sugeridos.py` | Estructura de router, queries PostgreSQL |
| `backend/services/calculo_inventario_abc.py` | Cálculos de SS, ROP, P75 |
| `backend/email_notifier.py` | Patrón de envío de emails |
| `backend/models/pedidos_sugeridos.py` | Estructura de modelos Pydantic |
| `frontend/src/components/orders/OrderWizard.tsx` | Base para wizard simplificado |
| `frontend/src/components/orders/OrderStepTwo.tsx` | Tabla de productos con edición |
| `frontend/src/components/orders/SuggestedOrder.tsx` | Integración de nueva tab |

---

## 9. Resumen de Entregables

1. **API de emergencias** - 4 endpoints para detección y consulta
2. **Scheduler automático** - Escaneo cada 30 min durante horario de tienda
3. **Notificaciones email** - Alertas inmediatas para emergencias críticas
4. **Dashboard frontend** - Visualización de emergencias con filtros
5. **Wizard simplificado** - 2 pasos para crear pedido de emergencia
6. **Configuración flexible** - Tiendas, horarios y umbrales configurables
