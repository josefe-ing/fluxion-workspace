# Complemento Tecnico: Plan Pedido de Emergencia v2

**Fecha:** Diciembre 2025
**Basado en:** Evaluacion del codigo actual de Fluxion AI

---

## 1. Alineacion con Arquitectura Existente

### 1.1 Stack Tecnico Real

El plan propone Python + FastAPI, lo cual esta **alineado** con la arquitectura actual:

| Componente | Plan v2 | Realidad Actual | Estado |
|------------|---------|-----------------|--------|
| Backend | FastAPI | FastAPI 0.119+ | ✅ Alineado |
| Base de datos | PostgreSQL (asumido) | PostgreSQL (replica/primary) | ✅ Alineado |
| Email | SendGrid | SendGrid (`email_notifier.py`) | ✅ Alineado |
| Scheduler | asyncio loop | `etl_scheduler.py` con threads | ⚠️ Adaptar patron |
| Autenticacion | No especificado | JWT 8h (`auth.py`) | 📝 Agregar |

### 1.2 Configuracion de Base de Datos

El sistema usa arquitectura **Read Replica** (ver `db_config.py`):

```python
# Para lecturas (consultas):
from db_manager import get_db_connection  # Usa replica

# Para escrituras (INSERT/UPDATE/DELETE):
from db_manager import get_db_connection_write  # Usa primary

# Conexiones string:
POSTGRES_HOST = os.getenv('POSTGRES_HOST')  # Replica (default)
POSTGRES_HOST_PRIMARY = os.getenv('POSTGRES_HOST_PRIMARY')  # Primary para writes
```

**Impacto en el plan:**
- Scans de deteccion → Usar `get_db_connection()` (replica)
- Guardar emergencias/alertas → Usar `get_db_connection_write()` (primary)
- Tracking de confirmacion → Usar write connection

---

## 2. Configuracion por Tienda (Feature Toggle)

### 2.1 Requerimiento

El sistema debe permitir **habilitar/deshabilitar** el feature de emergencias **por tienda individual**, no solo globalmente.

### 2.2 Tabla de Configuracion

```sql
-- Configuracion de emergencias por tienda
CREATE TABLE emergencias_config_tienda (
    id SERIAL PRIMARY KEY,
    tienda_id VARCHAR(50) NOT NULL UNIQUE,
    tienda_nombre VARCHAR(200),

    -- Feature toggle principal
    emergencias_habilitado BOOLEAN DEFAULT FALSE,

    -- Configuracion de notificaciones
    emails_notificacion TEXT[],              -- Array de emails para esta tienda
    emails_criticos TEXT[],                  -- Emails para STOCKOUT clase A
    notificaciones_habilitadas BOOLEAN DEFAULT TRUE,

    -- Configuracion de horarios (override global)
    hora_inicio INTEGER DEFAULT 7,           -- Hora inicio scan (0-23)
    hora_fin INTEGER DEFAULT 21,             -- Hora fin scan (0-23)
    hora_corte_entrega INTEGER DEFAULT 16,   -- Hora limite para entrega mismo dia

    -- Configuracion de umbrales (override global)
    umbral_critico NUMERIC(3,2) DEFAULT 0.5,
    umbral_inminente NUMERIC(3,2) DEFAULT 1.0,
    umbral_alerta NUMERIC(3,2) DEFAULT 1.3,
    factor_dia_fuerte NUMERIC(3,2) DEFAULT 1.3,

    -- Configuracion de blindajes (override global)
    scans_confirmacion INTEGER DEFAULT 2,
    cooldown_horas INTEGER DEFAULT 4,

    -- CEDI que abastece esta tienda
    cedi_origen_id VARCHAR(50),

    -- Metadata
    habilitado_por VARCHAR(100),
    habilitado_at TIMESTAMP WITH TIME ZONE,
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    FOREIGN KEY (tienda_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (cedi_origen_id) REFERENCES ubicaciones(id)
);

CREATE INDEX idx_emerg_config_habilitado ON emergencias_config_tienda(emergencias_habilitado);
```

### 2.3 Endpoints de Configuracion

```python
# GET /api/emergencias/config/tiendas
# Lista todas las tiendas con su estado de configuracion
@router.get("/config/tiendas", response_model=List[ConfigTiendaResumen])
async def listar_config_tiendas(conn: Any = Depends(get_db)):
    """
    Lista todas las tiendas mostrando:
    - Si tienen emergencias habilitadas o no
    - Configuracion actual (umbrales, horarios)
    - CEDI asignado
    """
    pass

# GET /api/emergencias/config/tiendas/{tienda_id}
# Detalle de configuracion de una tienda
@router.get("/config/tiendas/{tienda_id}", response_model=ConfigTiendaCompleta)
async def get_config_tienda(tienda_id: str, conn: Any = Depends(get_db)):
    pass

# PUT /api/emergencias/config/tiendas/{tienda_id}
# Actualizar configuracion de una tienda
@router.put("/config/tiendas/{tienda_id}", response_model=ConfigTiendaCompleta)
async def actualizar_config_tienda(
    tienda_id: str,
    request: ActualizarConfigTiendaRequest,
    conn: Any = Depends(get_db_write)
):
    pass

# POST /api/emergencias/config/tiendas/{tienda_id}/habilitar
# Habilitar emergencias para una tienda
@router.post("/config/tiendas/{tienda_id}/habilitar")
async def habilitar_emergencias_tienda(
    tienda_id: str,
    request: HabilitarTiendaRequest,
    conn: Any = Depends(get_db_write)
):
    """
    Habilita el feature de emergencias para una tienda.
    Requiere especificar:
    - cedi_origen_id: CEDI que abastece la tienda
    - emails_notificacion: Lista de emails para alertas
    """
    pass

# POST /api/emergencias/config/tiendas/{tienda_id}/deshabilitar
# Deshabilitar emergencias para una tienda
@router.post("/config/tiendas/{tienda_id}/deshabilitar")
async def deshabilitar_emergencias_tienda(
    tienda_id: str,
    conn: Any = Depends(get_db_write)
):
    pass
```

### 2.4 Modelos Pydantic

```python
# backend/models/emergencias.py

class ConfigTiendaResumen(BaseModel):
    tienda_id: str
    tienda_nombre: str
    emergencias_habilitado: bool
    cedi_origen_id: Optional[str]
    cedi_origen_nombre: Optional[str]
    ultima_actualizacion: Optional[datetime]

class ConfigTiendaCompleta(ConfigTiendaResumen):
    # Notificaciones
    emails_notificacion: List[str] = []
    emails_criticos: List[str] = []
    notificaciones_habilitadas: bool = True

    # Horarios
    hora_inicio: int = 7
    hora_fin: int = 21
    hora_corte_entrega: int = 16

    # Umbrales
    umbral_critico: float = 0.5
    umbral_inminente: float = 1.0
    umbral_alerta: float = 1.3
    factor_dia_fuerte: float = 1.3

    # Blindajes
    scans_confirmacion: int = 2
    cooldown_horas: int = 4

    # Metadata
    habilitado_por: Optional[str]
    habilitado_at: Optional[datetime]
    notas: Optional[str]

class HabilitarTiendaRequest(BaseModel):
    cedi_origen_id: str
    emails_notificacion: List[str]
    emails_criticos: Optional[List[str]] = []
    notas: Optional[str] = None

class ActualizarConfigTiendaRequest(BaseModel):
    emails_notificacion: Optional[List[str]] = None
    emails_criticos: Optional[List[str]] = None
    notificaciones_habilitadas: Optional[bool] = None
    hora_inicio: Optional[int] = None
    hora_fin: Optional[int] = None
    umbral_critico: Optional[float] = None
    umbral_inminente: Optional[float] = None
    umbral_alerta: Optional[float] = None
    cedi_origen_id: Optional[str] = None
    notas: Optional[str] = None
```

### 2.5 Logica de Deteccion Modificada

```python
# backend/services/detector_emergencias.py

async def detectar_emergencias() -> DeteccionResult:
    """
    Detecta emergencias SOLO en tiendas habilitadas.
    """
    # 1. Obtener tiendas habilitadas
    tiendas_config = await get_tiendas_habilitadas()

    if not tiendas_config:
        logger.info("No hay tiendas con emergencias habilitadas")
        return DeteccionResult(emergencias=[], anomalias=[])

    resultados = []

    for config in tiendas_config:
        # 2. Verificar horario de operacion de ESTA tienda
        now = datetime.now(ZoneInfo("America/Caracas"))
        if not (config.hora_inicio <= now.hour < config.hora_fin):
            continue

        # 3. Detectar emergencias con umbrales de ESTA tienda
        emergencias_tienda = await detectar_emergencias_tienda(
            tienda_id=config.tienda_id,
            cedi_id=config.cedi_origen_id,
            umbral_critico=config.umbral_critico,
            umbral_inminente=config.umbral_inminente,
            umbral_alerta=config.umbral_alerta,
            factor_dia_fuerte=config.factor_dia_fuerte
        )

        resultados.extend(emergencias_tienda)

    return DeteccionResult(emergencias=resultados)


async def get_tiendas_habilitadas() -> List[ConfigTiendaCompleta]:
    """Obtiene configuracion de tiendas con emergencias habilitadas"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                ect.tienda_id,
                u.nombre as tienda_nombre,
                ect.cedi_origen_id,
                uc.nombre as cedi_origen_nombre,
                ect.emails_notificacion,
                ect.emails_criticos,
                ect.hora_inicio,
                ect.hora_fin,
                ect.umbral_critico,
                ect.umbral_inminente,
                ect.umbral_alerta,
                ect.factor_dia_fuerte,
                ect.scans_confirmacion,
                ect.cooldown_horas
            FROM emergencias_config_tienda ect
            JOIN ubicaciones u ON ect.tienda_id = u.id
            LEFT JOIN ubicaciones uc ON ect.cedi_origen_id = uc.id
            WHERE ect.emergencias_habilitado = TRUE
        """)
        # ... procesar resultados
```

### 2.6 UI: Panel de Configuracion

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CONFIGURACION DE EMERGENCIAS POR TIENDA                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┬───────────┬─────────────┬────────────┬─────────┐ │
│  │ Tienda           │ Estado    │ CEDI Origen │ Emails     │ Acciones│ │
│  ├──────────────────┼───────────┼─────────────┼────────────┼─────────┤ │
│  │ ARTIGAS          │ ✅ Activo │ CEDI Ccs    │ 2 emails   │ [⚙️][❌]│ │
│  │ PARAISO          │ ✅ Activo │ CEDI Ccs    │ 2 emails   │ [⚙️][❌]│ │
│  │ MAÑONGO          │ ⬚ Inactivo│ -           │ -          │ [➕]    │ │
│  │ AV. BOLIVAR      │ ⬚ Inactivo│ -           │ -          │ [➕]    │ │
│  │ LOS GUAYOS       │ ⬚ Inactivo│ -           │ -          │ [➕]    │ │
│  └──────────────────┴───────────┴─────────────┴────────────┴─────────┘ │
│                                                                         │
│  [➕] = Habilitar    [⚙️] = Configurar    [❌] = Deshabilitar           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Modal de Habilitacion:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  HABILITAR EMERGENCIAS - MAÑONGO                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  CEDI Origen: [CEDI Valencia Seco ▼]                                   │
│                                                                         │
│  Emails para alertas normales:                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ operaciones@lagranja.com                              [🗑️]      │   │
│  │ [+ Agregar email]                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Emails para alertas CRITICAS (STOCKOUT clase A):                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ gerente@lagranja.com                                  [🗑️]      │   │
│  │ operaciones@lagranja.com                              [🗑️]      │   │
│  │ [+ Agregar email]                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Notas (opcional):                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Piloto inicial region Carabobo                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│                                    [Cancelar]  [Habilitar Emergencias] │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.7 Variables de Entorno (Defaults Globales)

Las variables de entorno ahora son **defaults** que se usan cuando una tienda no tiene configuracion especifica:

```bash
# Defaults globales (usados si tienda no tiene override)
EMERGENCY_DEFAULT_HORA_INICIO=7
EMERGENCY_DEFAULT_HORA_FIN=21
EMERGENCY_DEFAULT_UMBRAL_CRITICO=0.5
EMERGENCY_DEFAULT_UMBRAL_INMINENTE=1.0
EMERGENCY_DEFAULT_UMBRAL_ALERTA=1.3

# Feature toggle global (kill switch)
EMERGENCY_FEATURE_ENABLED=true  # false = deshabilita TODO el sistema
```

---

## 3. Correccion de Queries SQL

### 3.1 Tabla de Ventas Real

El plan asume campos que **no existen** en el schema real. Correccion necesaria:

**Schema real de `ventas`** (de `schema_postgresql_v2.sql`):
```sql
CREATE TABLE ventas (
    id BIGSERIAL PRIMARY KEY,
    numero_factura VARCHAR(50) NOT NULL,
    fecha_venta TIMESTAMP NOT NULL,      -- NO es 'fecha_hora'
    ubicacion_id VARCHAR(50) NOT NULL,   -- OK
    almacen_codigo VARCHAR(50),
    producto_id VARCHAR(50) NOT NULL,
    cantidad_vendida NUMERIC(12,4) NOT NULL,  -- OK
    precio_unitario NUMERIC(12,4),
    venta_total NUMERIC(18,2),
    -- ... otros campos financieros
);
```

**Query corregido para ventas de hoy:**
```sql
-- INCORRECTO (del plan):
WHERE fecha_venta >= CURRENT_DATE
  AND EXTRACT(HOUR FROM fecha_hora) >= 7

-- CORRECTO:
WHERE fecha_venta >= CURRENT_DATE
  AND fecha_venta::DATE = CURRENT_DATE
  AND EXTRACT(HOUR FROM fecha_venta) >= 7
  AND ubicacion_id = ANY($1)
```

### 3.2 Tabla de Stock Real

El plan asume `stock_actual`, pero la tabla real es `inventario_actual`:

**Schema real:**
```sql
CREATE TABLE inventario_actual (
    ubicacion_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,
    almacen_codigo VARCHAR(50) NOT NULL,  -- IMPORTANTE: incluye almacen
    cantidad NUMERIC(12,4) NOT NULL,       -- NO es 'stock'
    PRIMARY KEY (ubicacion_id, producto_id, almacen_codigo)
);
```

**Query corregido para stock:**
```sql
-- Stock consolidado por tienda (suma todos los almacenes)
SELECT
    ubicacion_id,
    producto_id,
    SUM(cantidad) as stock_actual
FROM inventario_actual
WHERE ubicacion_id = ANY($1)
GROUP BY ubicacion_id, producto_id
```

### 3.3 Tabla ABC por Tienda

El plan asume `productos_abc_tienda`. Esta tabla **no existe directamente**.

**Opcion A:** Usar tabla de configuracion existente
```sql
-- La configuracion ABC esta en producto_ubicacion_config
SELECT
    producto_id,
    ubicacion_id,
    demanda_diaria_promedio,  -- Usar como P75 aproximado
    stock_minimo,
    stock_maximo
FROM producto_ubicacion_config
WHERE ubicacion_id = ANY($1)
```

**Opcion B:** Crear vista o tabla de cache para ABC

Ver seccion 6 para propuesta de nuevas tablas.

---

## 3. Patrones de Codigo a Seguir

### 3.1 Estructura de Router

Seguir patron de `pedidos_sugeridos.py`:

```python
# backend/routers/emergencias.py
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Any
import uuid
from datetime import datetime
import logging

from models.emergencias import (
    EmergenciaDetectada,
    ScanRequest,
    ScanResponse,
    # ... otros modelos
)
from db_manager import get_db_connection, get_db_connection_write

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/emergencias", tags=["Emergencias"])

def get_db():
    """Get database connection (read-only)"""
    with get_db_connection() as conn:
        yield conn

def get_db_write():
    """Get database connection (read-write)"""
    with get_db_connection_write() as conn:
        yield conn
```

### 3.2 Patron de Modelos Pydantic

Seguir patron de `pedidos_sugeridos.py` con clases separadas:

```python
# backend/models/emergencias.py
from enum import Enum
from typing import List, Dict, Optional
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field

class TipoEmergencia(str, Enum):
    STOCKOUT = "stockout"
    CRITICO = "critico"
    INMINENTE = "inminente"
    ALERTA = "alerta"

class TipoAnomalia(str, Enum):
    STOCK_NEGATIVO = "stock_negativo"
    VENTA_RECIENTE_SIN_STOCK = "venta_reciente_sin_stock"
    VENTAS_IMPOSIBLES = "ventas_imposibles"

# Response liviano para listados
class EmergenciaResumen(BaseModel):
    id: str
    tienda_id: str
    tienda_nombre: str
    producto_id: str
    producto_nombre: str
    clasificacion_abc: str
    tipo_emergencia: TipoEmergencia
    stock_actual: Decimal
    cobertura: Decimal
    es_resoluble: bool
    detectado_at: datetime

# Response completo para detalle
class EmergenciaCompleta(EmergenciaResumen):
    prioridad: int
    stock_seguridad: Decimal
    ventas_hoy: Decimal
    demanda_restante: Decimal
    factor_intensidad: Decimal
    stock_cedi: Decimal
    cantidad_sugerida: Decimal
    confirmado: bool
    scans_consecutivos: int

    class Config:
        from_attributes = True
```

### 3.3 Patron de Email Notifier

Extender `EmailNotifier` existente (no crear nuevo):

```python
# En email_notifier.py, agregar metodo:

def send_emergency_alert(
    self,
    tienda_nombre: str,
    emergencias: List[Dict],
    factor_intensidad: float,
    es_inmediato: bool = False
) -> bool:
    """
    Envia alerta de emergencias de inventario

    Args:
        tienda_nombre: Nombre de la tienda
        emergencias: Lista de emergencias detectadas
        factor_intensidad: Factor del dia (1.0 = normal)
        es_inmediato: True para STOCKOUT clase A (email individual)
    """
    if not self.enabled:
        return False

    # Determinar destinatarios segun severidad
    if es_inmediato:
        to_emails = os.getenv("EMERGENCY_CRITICAL_EMAILS", "").split(",")
        subject_prefix = "STOCKOUT CRITICO"
        status_icon = "🚨"
    else:
        to_emails = os.getenv("EMERGENCY_NOTIFICATION_EMAILS", "").split(",")
        subject_prefix = "Alerta Inventario"
        status_icon = "⚠️"

    # Usar template HTML existente como base
    # ...
```

---

## 4. Formulas de Calculo Reales

### 4.1 P75 y Stock de Seguridad

El sistema actual ya calcula estos valores en `calculo_inventario_abc.py`:

```python
# Constantes operativas La Granja
LEAD_TIME_DEFAULT = 1.5  # dias (fijo, CEDI cercano)

# Z-scores por clase ABC (nivel de servicio):
PARAMS_ABC = {
    'A': ParametrosABC(nivel_servicio_z=2.33, dias_cobertura=7),   # 99%
    'B': ParametrosABC(nivel_servicio_z=1.88, dias_cobertura=14),  # 97%
    'C': ParametrosABC(nivel_servicio_z=1.28, dias_cobertura=21),  # 90%
    'D': ParametrosABC(nivel_servicio_z=0.0, dias_cobertura=30),   # Sin SS estadistico
}

# Formula Stock de Seguridad:
# SS = Z * sigmaD * sqrt(L)
# Donde:
#   Z = nivel servicio segun clase ABC
#   sigmaD = desviacion estandar demanda diaria (ultimos 30 dias)
#   L = lead time (1.5 dias)

# Si sigmaD = 0 (tienda nueva):
# SS = 0.30 * D * L  (30% conservador)
```

**Impacto en deteccion de emergencias:**
- Usar `demanda_p75` de la tabla de configuracion o calcular on-the-fly
- Usar `stock_seguridad` calculado con formula existente
- Usar `clasificacion_abc` de configuracion existente

### 4.2 Cobertura Ajustada

El plan propone:
```
cobertura = stock_actual / demanda_restante_esperada
demanda_restante = P75 * pct_restante * factor_intensidad
```

Esto es **correcto**, pero falta el calculo de `pct_restante` del perfil horario.

---

## 5. Integracion con Scheduler Existente

### 5.1 Patron de VentasETLScheduler

El sistema usa threads separados para jobs periodicos:

```python
# Patron actual en etl_scheduler.py:
class VentasETLScheduler:
    def __init__(self, execution_hour: int = 5, execution_minute: int = 0):
        self.execution_time = time(hour=execution_hour, minute=execution_minute)
        self._scheduler_thread = None
        self._retry_thread = None

    def start(self):
        self._scheduler_thread = threading.Thread(target=self._run_scheduler, daemon=True)
        self._scheduler_thread.start()
```

### 5.2 Propuesta: EmergencyScanScheduler

```python
# backend/jobs/scan_emergencias.py
import threading
import asyncio
from datetime import datetime, time
from zoneinfo import ZoneInfo

class EmergencyScanScheduler:
    """
    Scheduler para scan de emergencias cada 30 minutos
    Horario: 7am - 9pm (hora Venezuela)
    """

    def __init__(self):
        self.scan_interval_minutes = 30
        self.hora_inicio = 7
        self.hora_fin = 21
        self.timezone = ZoneInfo("America/Caracas")
        self._scheduler_thread = None
        self.enabled = True

    def start(self):
        """Inicia scheduler en thread separado (daemon)"""
        if self._scheduler_thread and self._scheduler_thread.is_alive():
            logger.warning("Emergency scan scheduler ya esta corriendo")
            return

        self._scheduler_thread = threading.Thread(
            target=self._run_scheduler,
            daemon=True,
            name="emergency-scan-scheduler"
        )
        self._scheduler_thread.start()
        logger.info("🚨 Emergency scan scheduler iniciado")

    def _run_scheduler(self):
        """Loop principal"""
        while self.enabled:
            now = datetime.now(self.timezone)

            # Solo en horario de operacion
            if self.hora_inicio <= now.hour < self.hora_fin:
                try:
                    asyncio.run(self._ejecutar_scan())
                except Exception as e:
                    logger.error(f"Error en scan: {e}")

            # Esperar 30 minutos
            time.sleep(self.scan_interval_minutes * 60)
```

---

## 6. Schema de Base de Datos Propuesto

### 6.1 Nuevas Tablas

```sql
-- ============================================================================
-- TABLAS PARA SISTEMA DE EMERGENCIAS
-- ============================================================================

-- Tabla principal: Cache de ABC por tienda (actualizar semanalmente)
CREATE TABLE productos_abc_tienda (
    id SERIAL PRIMARY KEY,
    ubicacion_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,

    -- Metricas de demanda
    demanda_p75 NUMERIC(12,4) NOT NULL,           -- P75 ultimos 30 dias
    demanda_promedio NUMERIC(12,4),
    demanda_sigma NUMERIC(12,4),                  -- Desviacion estandar
    demanda_max NUMERIC(12,4),

    -- Clasificacion
    clasificacion_abc VARCHAR(1) NOT NULL,        -- A, B, C, D
    rank_cantidad INTEGER,                        -- Ranking por cantidad

    -- Parametros de inventario calculados
    stock_seguridad NUMERIC(12,4),
    punto_reorden NUMERIC(12,4),
    stock_minimo NUMERIC(12,4),
    stock_maximo NUMERIC(12,4),

    -- Metadata
    calculado_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dias_muestra INTEGER DEFAULT 30,

    -- Constraints
    UNIQUE(ubicacion_id, producto_id),
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

CREATE INDEX idx_abc_tienda_ubicacion ON productos_abc_tienda(ubicacion_id);
CREATE INDEX idx_abc_tienda_clase ON productos_abc_tienda(clasificacion_abc);


-- Tracking de emergencias (para confirmacion 2 scans)
CREATE TABLE emergencias_tracking (
    id SERIAL PRIMARY KEY,
    tienda_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,
    tipo_emergencia VARCHAR(20) NOT NULL,
    primera_deteccion TIMESTAMP WITH TIME ZONE NOT NULL,
    scans_consecutivos INTEGER DEFAULT 1,
    alertado BOOLEAN DEFAULT FALSE,
    alertado_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tienda_id, producto_id)
);

CREATE INDEX idx_tracking_updated ON emergencias_tracking(updated_at);


-- Cooldown de alertas enviadas
CREATE TABLE emergencias_alertas_enviadas (
    id SERIAL PRIMARY KEY,
    tienda_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,
    tipo_emergencia VARCHAR(20) NOT NULL,
    enviado_at TIMESTAMP WITH TIME ZONE NOT NULL,
    canal VARCHAR(20) DEFAULT 'email'
);

CREATE INDEX idx_alertas_tienda_producto ON emergencias_alertas_enviadas(tienda_id, producto_id);
CREATE INDEX idx_alertas_enviado_at ON emergencias_alertas_enviadas(enviado_at);


-- Lista de exclusion
CREATE TABLE emergencias_exclusiones (
    id SERIAL PRIMARY KEY,
    producto_id VARCHAR(50) NOT NULL,
    producto_nombre VARCHAR(200),
    tienda_id VARCHAR(50),              -- NULL = todas las tiendas
    razon VARCHAR(100) NOT NULL,
    excluido_por VARCHAR(100) NOT NULL,
    hasta TIMESTAMP WITH TIME ZONE,     -- NULL = permanente
    notas TEXT,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activo BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_exclusiones_producto ON emergencias_exclusiones(producto_id);
CREATE INDEX idx_exclusiones_activo ON emergencias_exclusiones(activo);


-- Perfil horario pre-calculado
CREATE TABLE perfil_horario (
    id SERIAL PRIMARY KEY,
    tienda_id VARCHAR(50) NOT NULL,
    dia_semana INTEGER NOT NULL,        -- 0=Lunes, 6=Domingo
    hora INTEGER NOT NULL,              -- 0-23
    pct_ventas NUMERIC(5,4) NOT NULL,   -- Ej: 0.0823 = 8.23%
    pct_restante NUMERIC(5,4) NOT NULL, -- Ej: 0.4500 = 45%
    calculado_at TIMESTAMP WITH TIME ZONE NOT NULL,
    dias_muestra INTEGER NOT NULL,

    UNIQUE(tienda_id, dia_semana, hora)
);


-- Anomalias detectadas (separadas de emergencias)
CREATE TABLE emergencias_anomalias (
    id SERIAL PRIMARY KEY,
    tienda_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,
    producto_nombre VARCHAR(200),
    tipo_anomalia VARCHAR(50) NOT NULL,
    stock_sistema NUMERIC(10,2),
    ventas_hoy NUMERIC(10,2),
    detectado_at TIMESTAMP WITH TIME ZONE NOT NULL,
    resuelto BOOLEAN DEFAULT FALSE,
    resuelto_at TIMESTAMP WITH TIME ZONE,
    resuelto_por VARCHAR(100),
    notas TEXT
);

CREATE INDEX idx_anomalias_tienda ON emergencias_anomalias(tienda_id);
CREATE INDEX idx_anomalias_resuelto ON emergencias_anomalias(resuelto);
```

### 6.2 Migracion de Datos Existentes

Si la tabla `producto_ubicacion_config` tiene datos:

```sql
-- Poblar productos_abc_tienda desde config existente
INSERT INTO productos_abc_tienda (
    ubicacion_id, producto_id, demanda_p75, clasificacion_abc,
    stock_seguridad, punto_reorden, stock_minimo, stock_maximo
)
SELECT
    puc.ubicacion_id,
    puc.producto_id,
    COALESCE(puc.demanda_diaria_promedio * 1.35, 0) as demanda_p75, -- Aprox P75
    COALESCE(p.abc_classification, 'C') as clasificacion_abc,
    puc.stock_minimo - COALESCE(puc.lead_time_dias * puc.demanda_diaria_promedio, 0) as stock_seguridad,
    puc.punto_reorden,
    puc.stock_minimo,
    puc.stock_maximo
FROM producto_ubicacion_config puc
JOIN productos p ON p.id = puc.producto_id
WHERE puc.activo = true
ON CONFLICT (ubicacion_id, producto_id) DO UPDATE SET
    demanda_p75 = EXCLUDED.demanda_p75,
    clasificacion_abc = EXCLUDED.clasificacion_abc;
```

---

## 7. Query Principal Corregido

```sql
-- Query optimizado para deteccion de emergencias
-- Usa tablas reales del sistema

WITH
-- Ventas de hoy por producto/tienda (desde 7am)
ventas_hoy AS (
    SELECT
        ubicacion_id,
        producto_id,
        SUM(cantidad_vendida) as vendido_hoy,
        MAX(fecha_venta) as ultima_venta
    FROM ventas
    WHERE fecha_venta >= CURRENT_DATE
      AND EXTRACT(HOUR FROM fecha_venta) >= 7
      AND ubicacion_id = ANY($1)  -- Lista de tiendas
    GROUP BY ubicacion_id, producto_id
),

-- Ventas totales de la tienda hoy (para factor de intensidad)
ventas_tienda_hoy AS (
    SELECT
        ubicacion_id,
        SUM(cantidad_vendida) as total_vendido
    FROM ventas
    WHERE fecha_venta >= CURRENT_DATE
      AND EXTRACT(HOUR FROM fecha_venta) >= 7
      AND ubicacion_id = ANY($1)
    GROUP BY ubicacion_id
),

-- Ventas esperadas a esta hora (promedio ultimos 14 dias mismo dia semana)
ventas_esperadas AS (
    SELECT
        ubicacion_id,
        AVG(total_hasta_hora) as esperado
    FROM (
        SELECT
            ubicacion_id,
            fecha_venta::DATE as fecha,
            SUM(cantidad_vendida) as total_hasta_hora
        FROM ventas
        WHERE fecha_venta >= CURRENT_DATE - INTERVAL '14 days'
          AND fecha_venta < CURRENT_DATE
          AND EXTRACT(HOUR FROM fecha_venta) <= $2  -- hora_actual
          AND EXTRACT(DOW FROM fecha_venta) = EXTRACT(DOW FROM CURRENT_DATE)
        GROUP BY ubicacion_id, fecha_venta::DATE
    ) sub
    GROUP BY ubicacion_id
),

-- Stock actual en tiendas (consolidado por almacenes)
stock_tiendas AS (
    SELECT
        ubicacion_id,
        producto_id,
        SUM(cantidad) as stock
    FROM inventario_actual
    WHERE ubicacion_id = ANY($1)
    GROUP BY ubicacion_id, producto_id
),

-- Stock en CEDI
stock_cedi AS (
    SELECT
        producto_id,
        SUM(cantidad) as stock_cedi
    FROM inventario_actual
    WHERE ubicacion_id = $3  -- cedi_id
    GROUP BY producto_id
),

-- Perfil horario (% restante del dia)
perfil AS (
    SELECT tienda_id, pct_restante
    FROM perfil_horario
    WHERE hora = $2  -- hora_actual
      AND dia_semana = EXTRACT(DOW FROM CURRENT_DATE)
)

SELECT
    st.ubicacion_id as tienda_id,
    u.nombre as tienda_nombre,
    st.producto_id,
    p.nombre as producto_nombre,
    COALESCE(pat.clasificacion_abc, 'C') as clasificacion_abc,
    st.stock as stock_actual,
    COALESCE(pat.stock_seguridad, 0) as stock_seguridad,
    COALESCE(vh.vendido_hoy, 0) as ventas_hoy,
    vh.ultima_venta,
    COALESCE(pat.demanda_p75, 0) as p75,
    COALESCE(sc.stock_cedi, 0) as stock_cedi,
    COALESCE(per.pct_restante, 0.5) as pct_restante,
    -- Factor de intensidad de la tienda
    CASE
        WHEN COALESCE(ve.esperado, 0) > 0
        THEN COALESCE(vth.total_vendido, 0) / ve.esperado
        ELSE 1.0
    END as factor_intensidad
FROM stock_tiendas st
JOIN ubicaciones u ON st.ubicacion_id = u.id
JOIN productos p ON st.producto_id = p.id
LEFT JOIN productos_abc_tienda pat ON st.producto_id = pat.producto_id
    AND st.ubicacion_id = pat.ubicacion_id
LEFT JOIN ventas_hoy vh ON st.ubicacion_id = vh.ubicacion_id
    AND st.producto_id = vh.producto_id
LEFT JOIN ventas_tienda_hoy vth ON st.ubicacion_id = vth.ubicacion_id
LEFT JOIN ventas_esperadas ve ON st.ubicacion_id = ve.ubicacion_id
LEFT JOIN stock_cedi sc ON st.producto_id = sc.producto_id
LEFT JOIN perfil per ON st.ubicacion_id = per.tienda_id
WHERE COALESCE(pat.clasificacion_abc, 'C') IN ('A', 'B')
ORDER BY st.ubicacion_id, COALESCE(pat.clasificacion_abc, 'C'), p.nombre;
```

---

## 8. Endpoints API Propuestos

### 8.1 Registrar en main.py

```python
# En main.py, agregar:
from routers.emergencias import router as emergencias_router

app.include_router(emergencias_router)
```

### 8.2 Estructura de Endpoints

```python
# GET /api/emergencias/
# Lista emergencias activas con filtros
@router.get("/", response_model=List[EmergenciaResumen])
async def listar_emergencias(
    tienda_id: Optional[str] = None,
    tipo: Optional[TipoEmergencia] = None,
    solo_resolubles: bool = False,
    conn: Any = Depends(get_db)
):
    pass

# POST /api/emergencias/scan
# Ejecutar scan manual
@router.post("/scan", response_model=ScanResponse)
async def ejecutar_scan(
    request: ScanRequest,
    conn: Any = Depends(get_db_write)  # Write porque actualiza tracking
):
    pass

# GET /api/emergencias/anomalias
# Lista anomalias de inventario
@router.get("/anomalias", response_model=List[Anomalia])
async def listar_anomalias(
    tienda_id: Optional[str] = None,
    solo_pendientes: bool = True,
    conn: Any = Depends(get_db)
):
    pass

# GET /api/emergencias/factor-intensidad
# Factor de intensidad actual por tienda
@router.get("/factor-intensidad", response_model=Dict[str, float])
async def get_factor_intensidad(
    conn: Any = Depends(get_db)
):
    pass

# GET /api/emergencias/perfil-horario/{tienda_id}
# Perfil horario de una tienda
@router.get("/perfil-horario/{tienda_id}", response_model=List[PerfilHorario])
async def get_perfil_horario(
    tienda_id: str,
    conn: Any = Depends(get_db)
):
    pass

# POST /api/emergencias/exclusiones
# Agregar producto a lista de exclusion
@router.post("/exclusiones", response_model=ProductoExcluido)
async def agregar_exclusion(
    request: CrearExclusionRequest,
    conn: Any = Depends(get_db_write)
):
    pass

# DELETE /api/emergencias/exclusiones/{id}
# Remover de lista de exclusion
@router.delete("/exclusiones/{id}")
async def remover_exclusion(
    id: int,
    conn: Any = Depends(get_db_write)
):
    pass
```

---

## 9. Variables de Entorno

Agregar a `.env`:

```bash
# ============================================================================
# DETECCION DE EMERGENCIAS
# ============================================================================

# Feature flag
EMERGENCY_SCAN_ENABLED=true
EMERGENCY_SCAN_INTERVAL_MINUTES=30

# Ubicaciones
EMERGENCY_TIENDAS=tienda_17,tienda_18
EMERGENCY_CEDI=cedi_caracas

# Horarios (formato HH:MM)
EMERGENCY_STORE_OPEN=07:00
EMERGENCY_STORE_CLOSE=21:00
EMERGENCY_DELIVERY_CUTOFF=16:00
EMERGENCY_EMAIL_START=07:00
EMERGENCY_EMAIL_END=19:00

# Umbrales
EMERGENCY_UMBRAL_CRITICO=0.5
EMERGENCY_UMBRAL_INMINENTE=1.0
EMERGENCY_UMBRAL_ALERTA=1.3
EMERGENCY_FACTOR_DIA_FUERTE=1.3

# Blindajes
EMERGENCY_SCANS_CONFIRMACION=2
EMERGENCY_COOLDOWN_HORAS=4
EMERGENCY_MINIMO_VENTAS=3
EMERGENCY_MINIMO_HORAS=3
EMERGENCY_P75_ALTO_VOLUMEN=10

# Notificaciones
EMERGENCY_NOTIFICATION_EMAILS=operaciones@lagranja.com
EMERGENCY_CRITICAL_EMAILS=gerente@lagranja.com,operaciones@lagranja.com
EMERGENCY_EMAIL_BATCH_INTERVAL=2
EMERGENCY_MAX_PRODUCTOS_EMAIL=10

# Calculos
EMERGENCY_FACTOR_SEGURIDAD=1.2
EMERGENCY_DIAS_PERFIL_HORARIO=21
EMERGENCY_DIAS_VENTAS_ESPERADAS=14
```

---

## 10. Archivos a Crear

### 10.1 Backend

```
backend/
├── config/
│   └── emergencias_config.py      # NUEVO: Configuracion centralizada
├── models/
│   └── emergencias.py             # NUEVO: Modelos Pydantic
├── routers/
│   └── emergencias.py             # NUEVO: Endpoints API
├── services/
│   ├── detector_emergencias.py    # NUEVO: Logica de deteccion
│   ├── blindajes_emergencias.py   # NUEVO: Confirmacion, cooldown
│   ├── perfil_horario.py          # NUEVO: Calculo de perfil
│   └── notificador_emergencias.py # NUEVO: Gestion de emails
├── jobs/
│   └── scan_emergencias.py        # NUEVO: Scheduler
└── email_notifier.py              # MODIFICAR: Agregar send_emergency_alert
```

### 10.2 Frontend

```
frontend/src/
├── components/
│   └── emergencies/
│       ├── EmergencyDashboard.tsx      # NUEVO
│       ├── EmergencyTable.tsx          # NUEVO
│       ├── AnomalyTable.tsx            # NUEVO
│       ├── EmergencyScanButton.tsx     # NUEVO
│       ├── EmergencyOrderWizard.tsx    # NUEVO
│       ├── ExclusionManager.tsx        # NUEVO
│       └── IntensityIndicator.tsx      # NUEVO
├── services/
│   └── emergenciasService.ts           # NUEVO
├── hooks/
│   └── useEmergencias.ts               # NUEVO
└── types/
    └── emergencias.ts                  # NUEVO
```

### 10.3 Database

```
database/
└── schema_emergencias.sql              # NUEVO: Tablas del sistema
```

---

## 11. Orden de Implementacion Sugerido

1. **Schema DB** → Crear tablas primero
2. **Config** → `emergencias_config.py`
3. **Models** → `emergencias.py`
4. **Services** → `detector_emergencias.py`, `blindajes_emergencias.py`
5. **Router** → `emergencias.py` con endpoints basicos
6. **Email** → Extender `email_notifier.py`
7. **Scheduler** → `scan_emergencias.py`
8. **Frontend** → Dashboard y componentes

---

## 12. Diferencias Clave vs Plan Original

| Aspecto | Plan Original | Realidad/Correccion |
|---------|---------------|---------------------|
| Tabla ventas | `fecha_hora`, `stock_actual` | `fecha_venta`, `inventario_actual` |
| Conexion DB | Una sola | Replica (read) + Primary (write) |
| ABC por tienda | `productos_abc_tienda` | Crear nueva o usar `producto_ubicacion_config` |
| Scheduler | asyncio puro | Thread daemon como `VentasETLScheduler` |
| Stock | Tabla `stock_actual` | Tabla `inventario_actual` con almacenes |
| P75 | Columna directa | Calcular o cachear semanalmente |
| Perfil horario | Por hora | Por hora + dia de semana |

---

*Documento generado: Diciembre 2025*
*Basado en evaluacion de codigo Fluxion AI*
