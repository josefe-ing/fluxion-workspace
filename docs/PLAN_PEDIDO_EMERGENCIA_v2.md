# Plan: Pedido de Emergencia v2

## Changelog

| Versión | Fecha | Cambios |
|---------|-------|---------|
| v2.0 | 2024-12 | Algoritmo mejorado con factor de intensidad, blindajes anti-ruido, filtros de inventario dañado |
| v1.0 | 2024-12 | Versión inicial |

---

## Resumen Ejecutivo

Feature para detectar productos con inventario crítico durante el día y permitir solicitar reabastecimiento urgente al CEDI. 

**Diferenciadores clave de esta versión:**
- Detección inteligente que auto-ajusta por "tipo de día" (quincena, día fuerte, etc.)
- Múltiples blindajes contra falsos positivos y spam de alertas
- Separación entre emergencias reales y anomalías de inventario
- Documentación exhaustiva para mantenibilidad

**Scope inicial:** Región Caracas (tienda_17 ARTIGAS, tienda_18 PARAISO, cedi_caracas)

**Fuente de datos:** Sync de inventario y ventas cada 30 minutos

---

## Tabla de Contenidos

1. [Conceptos Clave](#1-conceptos-clave)
2. [Algoritmo de Detección](#2-algoritmo-de-detección)
3. [Blindajes Anti-Ruido](#3-blindajes-anti-ruido)
4. [Filtros de Inventario Dañado](#4-filtros-de-inventario-dañado)
5. [Tipos de Emergencia](#5-tipos-de-emergencia)
6. [Sistema de Notificaciones](#6-sistema-de-notificaciones)
7. [Arquitectura Backend](#7-arquitectura-backend)
8. [Arquitectura Frontend](#8-arquitectura-frontend)
9. [Base de Datos](#9-base-de-datos)
10. [Configuración](#10-configuración)
11. [Reglas de Negocio](#11-reglas-de-negocio)
12. [Fases de Implementación](#12-fases-de-implementación)
13. [Testing y Validación](#13-testing-y-validación)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Conceptos Clave

### 1.1 Factor de Intensidad

**Problema que resuelve:** Detectar automáticamente si hoy es un día de alta demanda (quincena, promoción, evento) sin necesidad de configuración manual.

**Definición:**
```
factor_intensidad = ventas_reales_hasta_ahora / ventas_esperadas_hasta_ahora
```

**Interpretación:**
| Factor | Significado | Ejemplo |
|--------|-------------|---------|
| 0.5 - 0.8 | Día flojo | Lunes post-feriado |
| 0.8 - 1.2 | Día normal | Típico |
| 1.2 - 1.5 | Día fuerte | Quincena, víspera de feriado |
| > 1.5 | Día excepcional | Promoción agresiva, evento especial |

**Ventaja:** El sistema se auto-calibra. No necesitas decirle "hoy es quincena", él lo detecta por el comportamiento de ventas.

### 1.2 Perfil Horario

**Problema que resuelve:** Saber qué porcentaje de la demanda diaria ocurre en cada hora, para proyectar cuánta demanda falta.

**Ejemplo de perfil (calculado sobre últimos 21 días):**
```
Hora  | % de ventas del día | % restante después de esta hora
------|---------------------|--------------------------------
07:00 | 3%                  | 100%
08:00 | 5%                  | 97%
09:00 | 7%                  | 92%
10:00 | 8%                  | 85%
11:00 | 9%                  | 77%
12:00 | 10%                 | 68%
13:00 | 9%                  | 58%
14:00 | 8%                  | 49%
15:00 | 8%                  | 41%
16:00 | 8%                  | 33%
17:00 | 7%                  | 25%
18:00 | 7%                  | 18%
19:00 | 6%                  | 11%
20:00 | 5%                  | 5%
21:00 | 0%                  | 0%
```

**Uso:** Si son las 2pm y el perfil dice que falta 49% del día, y el P75 del producto es 100 unidades, entonces `demanda_restante_base = 100 * 0.49 = 49 unidades`.

### 1.3 Cobertura

**Definición:**
```
cobertura = stock_actual / demanda_restante_esperada
```

**Interpretación:**
| Cobertura | Significado |
|-----------|-------------|
| 0 | STOCKOUT (ya no hay) |
| 0.01 - 0.5 | CRÍTICO (no llegas ni a la mitad del día) |
| 0.5 - 1.0 | INMINENTE (te vas a quedar sin stock hoy) |
| 1.0 - 1.3 | AJUSTADO (podrías quedarte corto si el día se pone fuerte) |
| > 1.3 | OK (tienes suficiente) |

---

## 2. Algoritmo de Detección

### 2.1 Flujo Principal

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCAN DE EMERGENCIAS                          │
│                  (cada 30 minutos, 7am-9pm)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 1: Obtener datos base                                      │
│ - Stock actual por producto/tienda                              │
│ - Ventas de hoy (desde 7am) por producto/tienda                 │
│ - Última venta por producto/tienda                              │
│ - P75 y clasificación ABC por producto/tienda                   │
│ - Stock en CEDI                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 2: Filtrar anomalías de inventario                         │
│ - Stock negativo → ANOMALÍA                                     │
│ - Stock 0 + venta < 1 hora → ANOMALÍA                           │
│ - Ventas hoy > stock reconstruido → ANOMALÍA                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 3: Calcular factor de intensidad (por tienda)              │
│ factor = ventas_tienda_hoy / ventas_esperadas_tienda_a_esta_hora│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 4: Para cada producto, calcular demanda restante           │
│ pct_restante = perfil_horario[hora_actual]                      │
│ demanda_restante = P75 * pct_restante * factor_intensidad       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 5: Evaluar cobertura y clasificar                          │
│ cobertura = stock_actual / demanda_restante                     │
│ → Asignar tipo de emergencia según umbrales                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 6: Aplicar blindajes                                       │
│ - Verificar evidencia mínima                                    │
│ - Verificar confirmación (2 scans)                              │
│ - Verificar cooldown                                            │
│ - Verificar lista de exclusión                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 7: Generar alertas                                         │
│ - Acumular en buffer                                            │
│ - Enviar si toca ventana de notificación                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Pseudocódigo Detallado

```python
async def detectar_emergencias(tiendas: List[str], cedi_id: str) -> DeteccionResult:
    """
    Función principal de detección de emergencias.
    Se ejecuta cada 30 minutos durante horario de operación.
    
    Returns:
        DeteccionResult con emergencias confirmadas, pendientes y anomalías
    """
    now = datetime.now(ZoneInfo("America/Caracas"))
    hora_actual = now.hour
    horas_transcurridas = max(1, hora_actual - 7)  # Mínimo 1 para evitar división por 0
    
    # Obtener perfil horario (pre-calculado, se actualiza semanalmente)
    perfil = await get_perfil_horario()
    pct_restante = perfil.get_pct_restante(hora_actual)
    
    emergencias = []
    anomalias = []
    
    for tienda_id in tiendas:
        # ═══════════════════════════════════════════════════════════════
        # PASO 1: Calcular factor de intensidad de la tienda
        # ═══════════════════════════════════════════════════════════════
        ventas_tienda_hoy = await get_ventas_tienda_hoy(tienda_id)
        ventas_esperadas = await get_ventas_esperadas_a_esta_hora(tienda_id, hora_actual)
        
        if ventas_esperadas > 0:
            factor_intensidad = ventas_tienda_hoy / ventas_esperadas
        else:
            factor_intensidad = 1.0  # Default si no hay histórico
        
        # Limitar factor a rango razonable [0.3, 3.0]
        factor_intensidad = max(0.3, min(3.0, factor_intensidad))
        
        # ═══════════════════════════════════════════════════════════════
        # PASO 2: Obtener productos a evaluar
        # ═══════════════════════════════════════════════════════════════
        productos = await get_productos_tienda(
            tienda_id=tienda_id,
            cedi_id=cedi_id,
            solo_clase_ab=True  # Solo A y B para emergencias
        )
        
        for p in productos:
            # ═══════════════════════════════════════════════════════════
            # PASO 3: Filtrar anomalías de inventario
            # ═══════════════════════════════════════════════════════════
            anomalia = detectar_anomalia_inventario(
                stock_actual=p.stock_actual,
                ventas_hoy=p.ventas_hoy,
                ultima_venta=p.ultima_venta,
                now=now
            )
            
            if anomalia:
                anomalias.append(Anomalia(
                    tienda_id=tienda_id,
                    producto_id=p.producto_id,
                    tipo=anomalia,
                    stock_sistema=p.stock_actual,
                    ventas_hoy=p.ventas_hoy
                ))
                continue  # No evaluar como emergencia
            
            # ═══════════════════════════════════════════════════════════
            # PASO 4: Verificar evidencia mínima
            # ═══════════════════════════════════════════════════════════
            if not tiene_suficiente_evidencia(p, horas_transcurridas):
                continue  # Muy poca data para decidir
            
            # ═══════════════════════════════════════════════════════════
            # PASO 5: Calcular demanda restante esperada
            # ═══════════════════════════════════════════════════════════
            demanda_restante = p.p75 * pct_restante * factor_intensidad
            
            # Evitar división por 0
            if demanda_restante <= 0:
                continue
            
            # ═══════════════════════════════════════════════════════════
            # PASO 6: Calcular cobertura y clasificar
            # ═══════════════════════════════════════════════════════════
            cobertura = p.stock_actual / demanda_restante
            
            tipo_emergencia = clasificar_emergencia(
                stock_actual=p.stock_actual,
                cobertura=cobertura,
                factor_intensidad=factor_intensidad,
                clase_abc=p.clasificacion_abc
            )
            
            if tipo_emergencia is None:
                continue  # No es emergencia
            
            # ═══════════════════════════════════════════════════════════
            # PASO 7: Verificar si es resoluble (CEDI tiene stock)
            # ═══════════════════════════════════════════════════════════
            es_resoluble = p.stock_cedi > 0
            
            # ═══════════════════════════════════════════════════════════
            # PASO 8: Calcular cantidad sugerida
            # ═══════════════════════════════════════════════════════════
            cantidad_sugerida = calcular_cantidad_sugerida(
                demanda_restante=demanda_restante,
                stock_actual=p.stock_actual,
                stock_cedi=p.stock_cedi,
                factor_seguridad=1.2  # 20% extra por seguridad
            )
            
            emergencias.append(EmergenciaDetectada(
                tienda_id=tienda_id,
                tienda_nombre=p.tienda_nombre,
                producto_id=p.producto_id,
                producto_nombre=p.producto_nombre,
                clasificacion_abc=p.clasificacion_abc,
                tipo_emergencia=tipo_emergencia,
                stock_actual=p.stock_actual,
                stock_seguridad=p.stock_seguridad,
                ventas_hoy=p.ventas_hoy,
                cobertura=cobertura,
                demanda_restante=demanda_restante,
                factor_intensidad=factor_intensidad,
                stock_cedi=p.stock_cedi,
                cantidad_sugerida=cantidad_sugerida,
                es_resoluble=es_resoluble,
                detectado_at=now
            ))
    
    # ═══════════════════════════════════════════════════════════════
    # PASO 9: Aplicar blindajes (confirmación, cooldown, etc.)
    # ═══════════════════════════════════════════════════════════════
    emergencias_filtradas = await aplicar_blindajes(emergencias)
    
    return DeteccionResult(
        timestamp=now,
        factor_intensidad_por_tienda={t: f for t, f in factores.items()},
        emergencias=emergencias_filtradas,
        anomalias=anomalias,
        total_productos_evaluados=len(productos)
    )
```

### 2.3 Funciones Auxiliares

```python
def detectar_anomalia_inventario(
    stock_actual: float,
    ventas_hoy: float,
    ultima_venta: Optional[datetime],
    now: datetime
) -> Optional[str]:
    """
    Detecta si hay una inconsistencia de inventario que invalida
    la evaluación de emergencia.
    
    Returns:
        Tipo de anomalía detectada o None si no hay anomalía
    """
    # ANOMALÍA 1: Stock negativo
    # Si el sistema dice -20, obviamente hay producto físico
    if stock_actual < 0:
        return "stock_negativo"
    
    # ANOMALÍA 2: Stock 0 pero vendió hace menos de 1 hora
    # Si acaba de vender, el producto existe físicamente
    if stock_actual == 0 and ultima_venta:
        tiempo_desde_venta = now - ultima_venta
        if tiempo_desde_venta < timedelta(hours=1):
            return "venta_reciente_sin_stock"
    
    # ANOMALÍA 3: Ventas imposibles
    # Si vendió más de lo que tenía al abrir, hay mercancía no registrada
    stock_reconstruido = stock_actual + ventas_hoy
    if stock_reconstruido < 0:
        return "ventas_imposibles"
    
    return None


def tiene_suficiente_evidencia(producto: ProductoData, horas_transcurridas: int) -> bool:
    """
    Verifica si hay suficiente data para hacer una proyección confiable.
    Evita falsos positivos por volatilidad estadística.
    
    Criterios (cualquiera):
    - Producto de alto volumen (P75 >= 10/día)
    - Al menos 3 unidades vendidas hoy
    - Al menos 3 horas desde apertura
    """
    # Productos de alto volumen: siempre evaluar
    if producto.p75 >= 10:
        return True
    
    # Suficientes transacciones hoy
    if producto.ventas_hoy >= 3:
        return True
    
    # Suficiente tiempo de observación
    if horas_transcurridas >= 3:
        return True
    
    return False


def clasificar_emergencia(
    stock_actual: float,
    cobertura: float,
    factor_intensidad: float,
    clase_abc: str
) -> Optional[TipoEmergencia]:
    """
    Clasifica el nivel de emergencia según la cobertura.
    
    Args:
        stock_actual: Unidades en inventario
        cobertura: stock_actual / demanda_restante_esperada
        factor_intensidad: Qué tan fuerte es el día (1.0 = normal)
        clase_abc: Clasificación ABC del producto
    
    Returns:
        TipoEmergencia o None si no califica
    """
    # STOCKOUT: Ya no hay stock
    if stock_actual == 0:
        if clase_abc in ('A', 'B'):
            return TipoEmergencia.STOCKOUT
        return None  # Clase C en stockout no es emergencia
    
    # CRÍTICO: No llegas ni a la mitad del día
    if cobertura < 0.5:
        return TipoEmergencia.CRITICO
    
    # INMINENTE: Te vas a quedar sin stock hoy
    if cobertura < 1.0:
        return TipoEmergencia.INMINENTE
    
    # ALERTA: Día anormalmente fuerte, podrías quedarte corto
    if cobertura < 1.3 and factor_intensidad > 1.3:
        return TipoEmergencia.ALERTA
    
    return None  # No es emergencia


def calcular_cantidad_sugerida(
    demanda_restante: float,
    stock_actual: float,
    stock_cedi: float,
    factor_seguridad: float = 1.2
) -> float:
    """
    Calcula cuánto pedir para cubrir el resto del día.
    
    Fórmula: (demanda_restante * factor_seguridad) - stock_actual
    Limitado por stock disponible en CEDI.
    """
    necesidad = (demanda_restante * factor_seguridad) - stock_actual
    necesidad = max(0, necesidad)  # No puede ser negativo
    
    # No pedir más de lo que tiene el CEDI
    cantidad = min(necesidad, stock_cedi)
    
    # Redondear a enteros
    return math.ceil(cantidad)
```

---

## 3. Blindajes Anti-Ruido

### 3.1 Confirmación en Múltiples Scans

**Objetivo:** Evitar que picos temporales de venta disparen falsas alarmas.

**Regla:** Un producto solo es emergencia **CONFIRMADA** si aparece en estado crítico en **2 scans consecutivos** (1 hora).

**Excepción:** STOCKOUT clase A es inmediato (no espera confirmación).

**Implementación:**

```python
# Estado persistente (Redis o tabla temporal)
class EmergenciaTracking(BaseModel):
    producto_tienda_key: str  # "tienda_17_producto_123"
    primera_deteccion: datetime
    scans_consecutivos: int
    tipo_emergencia: TipoEmergencia
    alertado: bool

async def aplicar_confirmacion(
    emergencias_detectadas: List[EmergenciaDetectada],
    tracking: Dict[str, EmergenciaTracking]
) -> List[EmergenciaDetectada]:
    """
    Filtra emergencias que no han sido confirmadas en múltiples scans.
    """
    confirmadas = []
    
    for e in emergencias_detectadas:
        key = f"{e.tienda_id}_{e.producto_id}"
        
        # EXCEPCIÓN: STOCKOUT clase A es inmediato
        if e.tipo_emergencia == TipoEmergencia.STOCKOUT and e.clasificacion_abc == 'A':
            confirmadas.append(e)
            continue
        
        # Actualizar tracking
        if key in tracking:
            tracking[key].scans_consecutivos += 1
        else:
            tracking[key] = EmergenciaTracking(
                producto_tienda_key=key,
                primera_deteccion=e.detectado_at,
                scans_consecutivos=1,
                tipo_emergencia=e.tipo_emergencia,
                alertado=False
            )
        
        # Confirmar si tiene 2+ scans consecutivos
        if tracking[key].scans_consecutivos >= 2:
            confirmadas.append(e)
    
    # Limpiar tracking de productos que ya no están en emergencia
    keys_actuales = {f"{e.tienda_id}_{e.producto_id}" for e in emergencias_detectadas}
    keys_a_eliminar = [k for k in tracking if k not in keys_actuales]
    for k in keys_a_eliminar:
        del tracking[k]
    
    return confirmadas
```

### 3.2 Umbral Mínimo de Evidencia

**Objetivo:** No confiar en proyecciones cuando hay poca data.

**Regla:** Solo proyectar si se cumple AL MENOS UNO:
- `ventas_hoy >= 3` unidades
- `horas_transcurridas >= 3` horas
- `P75 >= 10` unidades/día (producto de alto volumen)

**Implementación:** Ver función `tiene_suficiente_evidencia()` arriba.

### 3.3 Cooldown Post-Alerta

**Objetivo:** No enviar alertas repetidas sobre el mismo producto.

**Regla:** Una vez alertado, cooldown de **4 horas** antes de volver a alertar.

**Excepción:** Si el producto **escala de severidad** (ej: de INMINENTE a STOCKOUT), alertar de nuevo.

```python
async def verificar_cooldown(
    emergencia: EmergenciaDetectada,
    alertas_enviadas: Dict[str, AlertaEnviada]
) -> bool:
    """
    Verifica si se debe enviar alerta o está en cooldown.
    
    Returns:
        True si debe alertar, False si está en cooldown
    """
    key = f"{emergencia.tienda_id}_{emergencia.producto_id}"
    ultima_alerta = alertas_enviadas.get(key)
    
    if not ultima_alerta:
        return True  # Primera vez, alertar
    
    horas_desde_alerta = (datetime.now() - ultima_alerta.timestamp).total_seconds() / 3600
    
    # Cooldown activo
    if horas_desde_alerta < 4:
        # Excepción: escaló de severidad
        severidad_actual = get_severidad(emergencia.tipo_emergencia)
        severidad_anterior = get_severidad(ultima_alerta.tipo_emergencia)
        
        if severidad_actual > severidad_anterior:
            return True  # Escaló, alertar
        
        return False  # En cooldown
    
    return True  # Cooldown expirado


def get_severidad(tipo: TipoEmergencia) -> int:
    """Mayor número = más severo"""
    return {
        TipoEmergencia.ALERTA: 1,
        TipoEmergencia.INMINENTE: 2,
        TipoEmergencia.CRITICO: 3,
        TipoEmergencia.STOCKOUT: 4,
    }.get(tipo, 0)
```

### 3.4 Lista de Exclusión

**Objetivo:** Ignorar productos que sabemos que van a generar falsas alertas.

**Casos de uso:**
- Producto en promoción activa (se va a volar, es esperado)
- Producto descontinuado (no tiene sentido alertar)
- Producto con problema de proveedor (CEDI no puede resolver)

```python
class ProductoExcluido(BaseModel):
    producto_id: str
    tienda_id: Optional[str]  # None = todas las tiendas
    razon: str
    excluido_por: str  # Usuario que lo excluyó
    hasta: Optional[datetime]  # None = permanente
    notas: Optional[str]

async def esta_excluido(
    producto_id: str,
    tienda_id: str,
    exclusiones: List[ProductoExcluido]
) -> bool:
    """Verifica si un producto está en la lista de exclusión."""
    now = datetime.now()
    
    for exc in exclusiones:
        if exc.producto_id != producto_id:
            continue
        
        # Verificar si aplica a esta tienda
        if exc.tienda_id and exc.tienda_id != tienda_id:
            continue
        
        # Verificar si sigue vigente
        if exc.hasta and exc.hasta < now:
            continue
        
        return True
    
    return False
```

---

## 4. Filtros de Inventario Dañado

### 4.1 Tipos de Anomalías

| Código | Condición | Interpretación |
|--------|-----------|----------------|
| `stock_negativo` | `stock_actual < 0` | Hay mercancía no registrada como entrada |
| `venta_reciente_sin_stock` | `stock = 0` AND `última_venta < 1 hora` | Sistema dice 0 pero acaba de vender |
| `ventas_imposibles` | `stock_actual + ventas_hoy < 0` | Vendió más de lo que tenía al abrir |

### 4.2 Manejo de Anomalías

**Principio:** Las anomalías de inventario **NO** son emergencias de abastecimiento. Deben manejarse por separado.

```python
class Anomalia(BaseModel):
    id: str
    tienda_id: str
    tienda_nombre: str
    producto_id: str
    producto_nombre: str
    tipo_anomalia: str  # stock_negativo, venta_reciente_sin_stock, ventas_imposibles
    stock_sistema: float
    ventas_hoy: float
    detectado_at: datetime
    resuelto: bool = False
    resuelto_at: Optional[datetime] = None
    notas: Optional[str] = None
```

**Flujo:**
1. Anomalía detectada → Se guarda en lista separada
2. Se muestra en tab "Anomalías de Inventario" en dashboard
3. **NO** genera email automático (diferente de emergencias)
4. Acciones disponibles: "Solicitar conteo físico", "Marcar como resuelto"

---

## 5. Tipos de Emergencia

### 5.1 Definición Final

| Tipo | Condición | Prioridad | Acción |
|------|-----------|-----------|--------|
| **STOCKOUT** | `stock_actual = 0` AND clase A/B | 1 (Crítica) | Email inmediato si clase A |
| **CRITICO** | `cobertura < 0.5` | 2 (Alta) | Incluir en batch de email |
| **INMINENTE** | `cobertura < 1.0` | 3 (Media) | Incluir en batch de email |
| **ALERTA** | `cobertura < 1.3` AND `factor_intensidad > 1.3` | 4 (Baja) | Solo dashboard, sin email |

### 5.2 Modelo

```python
class TipoEmergencia(str, Enum):
    STOCKOUT = "stockout"
    CRITICO = "critico"
    INMINENTE = "inminente"
    ALERTA = "alerta"

class EmergenciaDetectada(BaseModel):
    id: str
    tienda_id: str
    tienda_nombre: str
    producto_id: str
    producto_nombre: str
    clasificacion_abc: str
    tipo_emergencia: TipoEmergencia
    prioridad: int  # 1=crítica, 2=alta, 3=media, 4=baja
    
    # Estado actual
    stock_actual: float
    stock_seguridad: float
    ventas_hoy: float
    
    # Métricas calculadas
    cobertura: float  # stock_actual / demanda_restante
    demanda_restante: float
    factor_intensidad: float
    
    # CEDI
    stock_cedi: float
    cantidad_sugerida: float
    es_resoluble: bool  # False si CEDI también está en 0
    
    # Tracking
    detectado_at: datetime
    confirmado: bool  # True si pasó el filtro de 2 scans
    scans_consecutivos: int
```

---

## 6. Sistema de Notificaciones

### 6.1 Reglas de Email

| Regla | Descripción |
|-------|-------------|
| **Batch cada 2 horas** | Acumular emergencias, enviar resumen consolidado |
| **Excepción inmediata** | STOCKOUT clase A → email inmediato |
| **Límite por email** | Máximo 10 productos, el resto "y N más..." con link |
| **Horario** | Solo entre 7am y 7pm (no molestar de noche) |
| **Cooldown por producto** | No repetir mismo producto en 4 horas |

### 6.2 Flujo de Notificaciones

```
Scan cada 30 minutos
        │
        ▼
┌───────────────────┐
│ ¿Hay STOCKOUT     │──── Sí ───▶ Email inmediato
│ clase A nuevo?    │            (solo ese producto)
└───────────────────┘
        │ No
        ▼
┌───────────────────┐
│ Agregar a buffer  │
│ de emergencias    │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ ¿Pasaron 2 horas  │──── Sí ───▶ Enviar email batch
│ desde último      │            (vaciar buffer)
│ email batch?      │
└───────────────────┘
        │ No
        ▼
    (esperar siguiente scan)
```

### 6.3 Formato de Email

**Asunto:** 
- Inmediato: `🚨 STOCKOUT CRÍTICO - {tienda} - {producto}`
- Batch: `⚠️ Alerta Inventario - {tienda} - {n} productos requieren atención`

**Contenido del batch:**

```html
<h2>Resumen de Emergencias - {tienda}</h2>
<p>Detectadas {n} situaciones que requieren atención:</p>

<h3>🔴 Stockouts (n)</h3>
<table>
  <tr>
    <th>Producto</th>
    <th>ABC</th>
    <th>Ventas Hoy</th>
    <th>Stock CEDI</th>
    <th>Sugerido</th>
  </tr>
  <!-- productos -->
</table>

<h3>🟠 Críticos (n)</h3>
<!-- similar -->

<h3>🟡 Inminentes (n)</h3>
<!-- similar -->

<p>
  <a href="{link_dashboard}">Ver dashboard completo →</a>
</p>

<hr>
<p style="color: gray; font-size: 12px;">
  Factor de intensidad del día: {factor}x (día {interpretacion})
  <br>
  Próximo scan: {hora_proximo_scan}
</p>
```

### 6.4 Destinatarios por Severidad

```python
NOTIFICATION_CONFIG = {
    "stockout_clase_a": {
        "emails": ["gerente@lagranja.com", "operaciones@lagranja.com"],
        "whatsapp": True,  # Futuro
        "inmediato": True
    },
    "batch_normal": {
        "emails": ["operaciones@lagranja.com"],
        "whatsapp": False,
        "inmediato": False
    },
    "solo_alerta": {
        "emails": [],  # Solo dashboard
        "whatsapp": False,
        "inmediato": False
    }
}
```

---

## 7. Arquitectura Backend

### 7.1 Estructura de Archivos

```
backend/
├── routers/
│   └── emergencias.py              # Endpoints API
├── services/
│   ├── detector_emergencias.py     # Lógica principal de detección
│   ├── blindajes_emergencias.py    # Confirmación, cooldown, exclusiones
│   ├── perfil_horario.py           # Cálculo y cache de perfil horario
│   └── notificador_emergencias.py  # Emails y gestión de buffer
├── models/
│   └── emergencias.py              # Modelos Pydantic
├── jobs/
│   └── scan_emergencias.py         # Scheduler del scan periódico
└── config/
    └── emergencias_config.py       # Configuración centralizada
```

### 7.2 Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/emergencias/scan` | POST | Ejecutar scan manual |
| `/api/emergencias/` | GET | Listar emergencias activas |
| `/api/emergencias/anomalias` | GET | Listar anomalías de inventario |
| `/api/emergencias/stats` | GET | Estadísticas (por día, tienda, tipo) |
| `/api/emergencias/config` | GET | Configuración actual |
| `/api/emergencias/exclusiones` | GET/POST/DELETE | Gestionar lista de exclusión |
| `/api/emergencias/perfil-horario` | GET | Ver perfil horario actual |
| `/api/emergencias/factor-intensidad` | GET | Factor de intensidad por tienda hoy |

### 7.3 Modelos Completos

```python
# backend/models/emergencias.py

from enum import Enum
from typing import List, Dict, Optional
from datetime import datetime
from pydantic import BaseModel

class TipoEmergencia(str, Enum):
    STOCKOUT = "stockout"
    CRITICO = "critico"
    INMINENTE = "inminente"
    ALERTA = "alerta"

class TipoAnomalia(str, Enum):
    STOCK_NEGATIVO = "stock_negativo"
    VENTA_RECIENTE_SIN_STOCK = "venta_reciente_sin_stock"
    VENTAS_IMPOSIBLES = "ventas_imposibles"

class EmergenciaDetectada(BaseModel):
    id: str
    tienda_id: str
    tienda_nombre: str
    producto_id: str
    producto_nombre: str
    clasificacion_abc: str
    tipo_emergencia: TipoEmergencia
    prioridad: int
    stock_actual: float
    stock_seguridad: float
    ventas_hoy: float
    cobertura: float
    demanda_restante: float
    factor_intensidad: float
    stock_cedi: float
    cantidad_sugerida: float
    es_resoluble: bool
    detectado_at: datetime
    confirmado: bool
    scans_consecutivos: int

class Anomalia(BaseModel):
    id: str
    tienda_id: str
    tienda_nombre: str
    producto_id: str
    producto_nombre: str
    tipo_anomalia: TipoAnomalia
    stock_sistema: float
    ventas_hoy: float
    detectado_at: datetime
    resuelto: bool = False

class ScanRequest(BaseModel):
    tiendas: List[str] = ["tienda_17", "tienda_18"]
    forzar_notificacion: bool = False  # Ignorar cooldown

class ScanResponse(BaseModel):
    timestamp: datetime
    tiendas_escaneadas: List[str]
    factor_intensidad_por_tienda: Dict[str, float]
    total_emergencias: int
    total_anomalias: int
    emergencias_por_tipo: Dict[str, int]
    emergencias: List[EmergenciaDetectada]
    anomalias: List[Anomalia]
    notificacion_enviada: bool
    proxima_notificacion: Optional[datetime]

class ProductoExcluido(BaseModel):
    id: str
    producto_id: str
    producto_nombre: str
    tienda_id: Optional[str]
    razon: str
    excluido_por: str
    hasta: Optional[datetime]
    creado_at: datetime
    notas: Optional[str]

class PerfilHorario(BaseModel):
    tienda_id: str
    hora: int
    pct_ventas: float  # % de ventas del día en esta hora
    pct_restante: float  # % de ventas que faltan después de esta hora
    calculado_at: datetime
    dias_muestra: int  # Cuántos días se usaron para calcular
```

### 7.4 Scheduler

```python
# backend/jobs/scan_emergencias.py

import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

from backend.services.detector_emergencias import detectar_emergencias
from backend.services.notificador_emergencias import procesar_notificaciones
from backend.config.emergencias_config import EmergenciasConfig

async def emergency_scan_scheduler():
    """
    Scheduler que ejecuta el scan de emergencias cada 30 minutos
    durante el horario de operación de las tiendas.
    
    Se inicia con el startup de la aplicación.
    """
    config = EmergenciasConfig()
    
    while True:
        try:
            now = datetime.now(ZoneInfo("America/Caracas"))
            
            # Solo ejecutar en horario de operación
            if config.hora_apertura <= now.hour < config.hora_cierre:
                logger.info(f"Iniciando scan de emergencias: {now}")
                
                # Ejecutar detección
                resultado = await detectar_emergencias(
                    tiendas=config.tiendas_habilitadas,
                    cedi_id=config.cedi_id
                )
                
                logger.info(
                    f"Scan completado: {resultado.total_emergencias} emergencias, "
                    f"{resultado.total_anomalias} anomalías"
                )
                
                # Procesar notificaciones (respeta reglas de batch/cooldown)
                await procesar_notificaciones(resultado)
                
            else:
                logger.debug(f"Fuera de horario de operación ({now.hour}h), skip scan")
                
        except Exception as e:
            logger.error(f"Error en scan de emergencias: {e}", exc_info=True)
        
        # Esperar 30 minutos
        await asyncio.sleep(config.scan_interval_minutes * 60)
```

---

## 8. Arquitectura Frontend

### 8.1 Estructura de Archivos

```
frontend/src/
├── components/
│   └── emergencies/
│       ├── EmergencyDashboard.tsx      # Dashboard principal
│       ├── EmergencyTable.tsx          # Tabla de emergencias
│       ├── AnomalyTable.tsx            # Tabla de anomalías
│       ├── EmergencyScanButton.tsx     # Botón escaneo manual
│       ├── EmergencyOrderWizard.tsx    # Wizard de pedido (2 pasos)
│       ├── ExclusionManager.tsx        # Gestión de exclusiones
│       └── IntensityIndicator.tsx      # Indicador de factor del día
├── services/
│   └── emergenciasService.ts           # API client
├── hooks/
│   └── useEmergencias.ts               # Hook con polling
└── types/
    └── emergencias.ts                  # TypeScript types
```

### 8.2 Dashboard Principal

```
┌─────────────────────────────────────────────────────────────────────────┐
│  EMERGENCIAS DE INVENTARIO                           [Escanear Ahora]  │
│  Último scan: 14:30 | Próximo: 15:00                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  STOCKOUT    │  │   CRÍTICO    │  │  INMINENTE   │  │  Factor Día │ │
│  │      3       │  │      5       │  │      8       │  │    1.35x    │ │
│  │   productos  │  │   productos  │  │   productos  │  │  Día fuerte │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  [Tab: Emergencias]  [Tab: Anomalías (4)]  [Tab: Exclusiones]          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Filtros: [Tienda ▼] [Tipo ▼] [Clase ABC ▼] [Solo resolubles ☑]       │
│                                                                         │
│  ┌─────┬──────────────────┬─────┬───────┬────────┬──────────┬────────┐ │
│  │ Sel │ Producto         │ ABC │ Stock │ Cobert │ CEDI     │ Suger. │ │
│  ├─────┼──────────────────┼─────┼───────┼────────┼──────────┼────────┤ │
│  │ ☑   │ 🔴 Leche Entera  │  A  │   0   │  0.0   │   45     │   12   │ │
│  │ ☑   │ 🔴 Pan Blanco    │  A  │   0   │  0.0   │   80     │   25   │ │
│  │ ☐   │ 🟠 Arroz 1kg     │  A  │   8   │  0.3   │   120    │   30   │ │
│  │ ☐   │ 🟡 Azúcar        │  B  │   15  │  0.8   │   60     │   10   │ │
│  └─────┴──────────────────┴─────┴───────┴────────┴──────────┴────────┘ │
│                                                                         │
│  [Crear Pedido de Emergencia (2 seleccionados)]                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Tab de Anomalías

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ANOMALÍAS DE INVENTARIO                                               │
│  Estos productos tienen inconsistencias que requieren revisión manual  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┬─────────┬────────────────────────┬─────────────┐ │
│  │ Producto         │ Stock   │ Tipo Anomalía          │ Acciones    │ │
│  ├──────────────────┼─────────┼────────────────────────┼─────────────┤ │
│  │ Jabón Líquido    │   -15   │ Stock negativo         │ [Resolver]  │ │
│  │ Detergente 2L    │    0    │ Venta reciente sin stk │ [Resolver]  │ │
│  │ Cloro 1L         │   -8    │ Ventas imposibles      │ [Resolver]  │ │
│  └──────────────────┴─────────┴────────────────────────┴─────────────┘ │
│                                                                         │
│  ⚠️ Las anomalías no generan pedidos de emergencia.                    │
│     Requieren ajuste de inventario o conteo físico.                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Wizard de Pedido de Emergencia

**Paso 1: Confirmar Productos**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  PEDIDO DE EMERGENCIA                                    Paso 1 de 2   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Productos seleccionados:                                              │
│                                                                         │
│  ┌──────────────────┬───────┬────────┬───────────┬──────────┐         │
│  │ Producto         │ Stock │ CEDI   │ Sugerido  │ Pedir    │         │
│  ├──────────────────┼───────┼────────┼───────────┼──────────┤         │
│  │ Leche Entera     │   0   │   45   │    12     │ [12  ]   │ [🗑️]   │
│  │ Pan Blanco       │   0   │   80   │    25     │ [25  ]   │ [🗑️]   │
│  └──────────────────┴───────┴────────┴───────────┴──────────┘         │
│                                                                         │
│                                           [Cancelar]  [Siguiente →]    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Paso 2: Confirmar y Enviar**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  PEDIDO DE EMERGENCIA                                    Paso 2 de 2   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Resumen del pedido:                                                   │
│                                                                         │
│  • Total productos: 2                                                  │
│  • Total unidades: 37                                                  │
│  • Tienda destino: ARTIGAS                                             │
│  • Tipo: EMERGENCIA                                                    │
│                                                                         │
│  ⚠️ Hora actual: 14:35                                                 │
│     Entrega estimada: Hoy antes de las 6pm                             │
│                                                                         │
│  Notas (opcional):                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Día de quincena, productos críticos agotados                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│                                      [← Atrás]  [Crear Pedido 🚀]      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Base de Datos

### 9.1 Tablas Existentes (sin cambios)

- `stock_actual` - Stock por producto/ubicación
- `ventas` - Transacciones de venta
- `productos` - Catálogo
- `productos_abc_tienda` - Clasificación ABC, P75, SS por tienda
- `pedidos_sugeridos` - Pedidos (ya soporta `tipo_pedido = 'emergencia'`)

### 9.2 Nuevas Tablas

```sql
-- Tabla para tracking de confirmación (2 scans)
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

-- Tabla para cooldown de alertas enviadas
CREATE TABLE emergencias_alertas_enviadas (
    id SERIAL PRIMARY KEY,
    tienda_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,
    tipo_emergencia VARCHAR(20) NOT NULL,
    enviado_at TIMESTAMP WITH TIME ZONE NOT NULL,
    canal VARCHAR(20) DEFAULT 'email',  -- email, whatsapp, etc.
    
    INDEX idx_alertas_tienda_producto (tienda_id, producto_id),
    INDEX idx_alertas_enviado_at (enviado_at)
);

-- Tabla para lista de exclusión
CREATE TABLE emergencias_exclusiones (
    id SERIAL PRIMARY KEY,
    producto_id VARCHAR(50) NOT NULL,
    producto_nombre VARCHAR(200),
    tienda_id VARCHAR(50),  -- NULL = todas las tiendas
    razon VARCHAR(100) NOT NULL,
    excluido_por VARCHAR(100) NOT NULL,
    hasta TIMESTAMP WITH TIME ZONE,  -- NULL = permanente
    notas TEXT,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activo BOOLEAN DEFAULT TRUE,
    
    INDEX idx_exclusiones_producto (producto_id),
    INDEX idx_exclusiones_activo (activo)
);

-- Tabla para perfil horario pre-calculado
CREATE TABLE perfil_horario (
    id SERIAL PRIMARY KEY,
    tienda_id VARCHAR(50) NOT NULL,
    hora INTEGER NOT NULL,  -- 0-23
    pct_ventas NUMERIC(5,4) NOT NULL,  -- Ej: 0.0823 = 8.23%
    pct_restante NUMERIC(5,4) NOT NULL,  -- Ej: 0.4500 = 45%
    calculado_at TIMESTAMP WITH TIME ZONE NOT NULL,
    dias_muestra INTEGER NOT NULL,
    
    UNIQUE(tienda_id, hora)
);

-- Tabla para anomalías detectadas
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
    notas TEXT,
    
    INDEX idx_anomalias_tienda (tienda_id),
    INDEX idx_anomalias_resuelto (resuelto)
);
```

### 9.3 Query Principal de Detección

```sql
-- Query optimizado para obtener todos los datos necesarios
WITH 
-- Ventas de hoy por producto/tienda
ventas_hoy AS (
    SELECT
        ubicacion_id,
        producto_id,
        SUM(cantidad_vendida) as vendido_hoy,
        MAX(fecha_hora) as ultima_venta
    FROM ventas
    WHERE fecha_venta >= CURRENT_DATE
      AND EXTRACT(HOUR FROM fecha_hora) >= 7
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
      AND EXTRACT(HOUR FROM fecha_hora) >= 7
      AND ubicacion_id = ANY($1)
    GROUP BY ubicacion_id
),

-- Ventas esperadas a esta hora (promedio últimos 14 días)
ventas_esperadas AS (
    SELECT
        ubicacion_id,
        AVG(total_hasta_hora) as esperado
    FROM (
        SELECT 
            ubicacion_id,
            fecha_venta,
            SUM(cantidad_vendida) as total_hasta_hora
        FROM ventas
        WHERE fecha_venta >= CURRENT_DATE - INTERVAL '14 days'
          AND fecha_venta < CURRENT_DATE
          AND EXTRACT(HOUR FROM fecha_hora) <= $2  -- hora_actual
        GROUP BY ubicacion_id, fecha_venta
    ) sub
    GROUP BY ubicacion_id
),

-- Stock actual en tiendas
stock_tiendas AS (
    SELECT ubicacion_id, producto_id, cantidad as stock
    FROM stock_actual
    WHERE ubicacion_id = ANY($1)
),

-- Stock en CEDI
stock_cedi AS (
    SELECT producto_id, cantidad as stock_cedi
    FROM stock_actual
    WHERE ubicacion_id = $3  -- cedi_id
),

-- Perfil horario (% restante del día)
perfil AS (
    SELECT tienda_id, pct_restante
    FROM perfil_horario
    WHERE hora = $2  -- hora_actual
)

SELECT
    st.ubicacion_id as tienda_id,
    t.nombre as tienda_nombre,
    st.producto_id,
    p.nombre as producto_nombre,
    pat.clasificacion_abc,
    st.stock as stock_actual,
    pat.stock_seguridad,
    COALESCE(vh.vendido_hoy, 0) as ventas_hoy,
    vh.ultima_venta,
    pat.demanda_p75 as p75,
    COALESCE(sc.stock_cedi, 0) as stock_cedi,
    COALESCE(per.pct_restante, 0.5) as pct_restante,
    -- Factor de intensidad de la tienda
    CASE 
        WHEN COALESCE(ve.esperado, 0) > 0 
        THEN COALESCE(vth.total_vendido, 0) / ve.esperado
        ELSE 1.0
    END as factor_intensidad
FROM stock_tiendas st
JOIN ubicaciones t ON st.ubicacion_id = t.ubicacion_id
JOIN productos p ON st.producto_id = p.producto_id
JOIN productos_abc_tienda pat ON st.producto_id = pat.producto_id 
    AND st.ubicacion_id = pat.ubicacion_id
LEFT JOIN ventas_hoy vh ON st.ubicacion_id = vh.ubicacion_id 
    AND st.producto_id = vh.producto_id
LEFT JOIN ventas_tienda_hoy vth ON st.ubicacion_id = vth.ubicacion_id
LEFT JOIN ventas_esperadas ve ON st.ubicacion_id = ve.ubicacion_id
LEFT JOIN stock_cedi sc ON st.producto_id = sc.producto_id
LEFT JOIN perfil per ON st.ubicacion_id = per.tienda_id
WHERE pat.clasificacion_abc IN ('A', 'B')
ORDER BY st.ubicacion_id, pat.clasificacion_abc, p.nombre;
```

### 9.4 Query para Calcular Perfil Horario

```sql
-- Ejecutar semanalmente (domingo noche o lunes madrugada)
INSERT INTO perfil_horario (tienda_id, hora, pct_ventas, pct_restante, calculado_at, dias_muestra)
SELECT
    ubicacion_id as tienda_id,
    hora,
    ventas_hora / total_tienda as pct_ventas,
    1 - SUM(ventas_hora / total_tienda) OVER (
        PARTITION BY ubicacion_id 
        ORDER BY hora 
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) as pct_restante,
    NOW() as calculado_at,
    21 as dias_muestra
FROM (
    SELECT
        ubicacion_id,
        EXTRACT(HOUR FROM fecha_hora)::int as hora,
        SUM(cantidad_vendida) as ventas_hora,
        SUM(SUM(cantidad_vendida)) OVER (PARTITION BY ubicacion_id) as total_tienda
    FROM ventas
    WHERE fecha_venta >= CURRENT_DATE - INTERVAL '21 days'
      AND EXTRACT(HOUR FROM fecha_hora) BETWEEN 7 AND 21
    GROUP BY ubicacion_id, EXTRACT(HOUR FROM fecha_hora)
) sub
ON CONFLICT (tienda_id, hora) 
DO UPDATE SET 
    pct_ventas = EXCLUDED.pct_ventas,
    pct_restante = EXCLUDED.pct_restante,
    calculado_at = EXCLUDED.calculado_at,
    dias_muestra = EXCLUDED.dias_muestra;
```

---

## 10. Configuración

### 10.1 Variables de Entorno

```bash
# ═══════════════════════════════════════════════════════════════
# DETECCIÓN DE EMERGENCIAS
# ═══════════════════════════════════════════════════════════════

# Habilitar/deshabilitar feature
EMERGENCY_SCAN_ENABLED=true

# Intervalo entre scans (minutos)
EMERGENCY_SCAN_INTERVAL_MINUTES=30

# ═══════════════════════════════════════════════════════════════
# TIENDAS Y UBICACIONES
# ═══════════════════════════════════════════════════════════════

# Tiendas habilitadas (separadas por coma)
EMERGENCY_TIENDAS=tienda_17,tienda_18

# CEDI que abastece estas tiendas
EMERGENCY_CEDI=cedi_caracas

# ═══════════════════════════════════════════════════════════════
# HORARIOS
# ═══════════════════════════════════════════════════════════════

# Horario de operación de tiendas (formato HH:MM)
EMERGENCY_STORE_OPEN=07:00
EMERGENCY_STORE_CLOSE=21:00

# Hora de corte para entrega mismo día
EMERGENCY_DELIVERY_CUTOFF=16:00

# Horario permitido para emails (no molestar fuera de este rango)
EMERGENCY_EMAIL_START=07:00
EMERGENCY_EMAIL_END=19:00

# ═══════════════════════════════════════════════════════════════
# UMBRALES DE DETECCIÓN
# ═══════════════════════════════════════════════════════════════

# Cobertura para clasificar como CRÍTICO (stock / demanda_restante)
EMERGENCY_UMBRAL_CRITICO=0.5

# Cobertura para clasificar como INMINENTE
EMERGENCY_UMBRAL_INMINENTE=1.0

# Cobertura para clasificar como ALERTA (si además hay factor alto)
EMERGENCY_UMBRAL_ALERTA=1.3

# Factor de intensidad para considerar "día fuerte"
EMERGENCY_FACTOR_DIA_FUERTE=1.3

# ═══════════════════════════════════════════════════════════════
# BLINDAJES
# ═══════════════════════════════════════════════════════════════

# Scans consecutivos para confirmar emergencia
EMERGENCY_SCANS_CONFIRMACION=2

# Horas de cooldown post-alerta
EMERGENCY_COOLDOWN_HORAS=4

# Mínimo de ventas para tener evidencia suficiente
EMERGENCY_MINIMO_VENTAS=3

# Mínimo de horas transcurridas para tener evidencia
EMERGENCY_MINIMO_HORAS=3

# P75 mínimo para considerar producto de alto volumen
EMERGENCY_P75_ALTO_VOLUMEN=10

# ═══════════════════════════════════════════════════════════════
# NOTIFICACIONES
# ═══════════════════════════════════════════════════════════════

# Emails para alertas normales (separados por coma)
EMERGENCY_NOTIFICATION_EMAILS=operaciones@lagranja.com

# Emails para alertas críticas (STOCKOUT clase A)
EMERGENCY_CRITICAL_EMAILS=gerente@lagranja.com,operaciones@lagranja.com

# Intervalo entre emails batch (horas)
EMERGENCY_EMAIL_BATCH_INTERVAL=2

# Máximo de productos por email
EMERGENCY_MAX_PRODUCTOS_EMAIL=10

# ═══════════════════════════════════════════════════════════════
# CÁLCULOS
# ═══════════════════════════════════════════════════════════════

# Factor de seguridad para cantidad sugerida (1.2 = 20% extra)
EMERGENCY_FACTOR_SEGURIDAD=1.2

# Días de historia para calcular perfil horario
EMERGENCY_DIAS_PERFIL_HORARIO=21

# Días de historia para calcular ventas esperadas
EMERGENCY_DIAS_VENTAS_ESPERADAS=14
```

### 10.2 Archivo de Configuración Centralizado

```python
# backend/config/emergencias_config.py

from pydantic_settings import BaseSettings
from typing import List
from datetime import time

class EmergenciasConfig(BaseSettings):
    """
    Configuración centralizada para el sistema de emergencias.
    Los valores se cargan de variables de entorno con prefijo EMERGENCY_
    """
    
    # Feature flag
    scan_enabled: bool = True
    scan_interval_minutes: int = 30
    
    # Ubicaciones
    tiendas_habilitadas: List[str] = ["tienda_17", "tienda_18"]
    cedi_id: str = "cedi_caracas"
    
    # Horarios
    hora_apertura: int = 7
    hora_cierre: int = 21
    hora_corte_entrega: int = 16
    hora_email_inicio: int = 7
    hora_email_fin: int = 19
    
    # Umbrales
    umbral_critico: float = 0.5
    umbral_inminente: float = 1.0
    umbral_alerta: float = 1.3
    factor_dia_fuerte: float = 1.3
    
    # Blindajes
    scans_confirmacion: int = 2
    cooldown_horas: int = 4
    minimo_ventas: int = 3
    minimo_horas: int = 3
    p75_alto_volumen: float = 10.0
    
    # Notificaciones
    notification_emails: List[str] = []
    critical_emails: List[str] = []
    email_batch_interval_horas: int = 2
    max_productos_email: int = 10
    
    # Cálculos
    factor_seguridad: float = 1.2
    dias_perfil_horario: int = 21
    dias_ventas_esperadas: int = 14
    
    class Config:
        env_prefix = "EMERGENCY_"
        env_file = ".env"
```

---

## 11. Reglas de Negocio

### 11.1 Horarios de Entrega

| Hora de creación | Día | Entrega esperada |
|------------------|-----|------------------|
| Antes de 4:00 PM | Lun-Vie | Mismo día |
| Después de 4:00 PM | Lun-Jue | Siguiente día hábil |
| Después de 4:00 PM | Viernes | Lunes |
| Sábado antes de 2:00 PM | Sábado | Mismo día |
| Sábado después de 2:00 PM | Sábado | Lunes |
| Domingo | Domingo | Lunes |

### 11.2 Priorización de Pedidos de Emergencia

Los pedidos de emergencia tienen prioridad sobre pedidos normales en el CEDI:

1. **STOCKOUT clase A** - Máxima prioridad
2. **STOCKOUT clase B** - Alta prioridad
3. **CRÍTICO** - Prioridad media-alta
4. **INMINENTE** - Prioridad media
5. **Pedidos normales** - Prioridad estándar

### 11.3 CEDI Sin Stock

Cuando el CEDI también tiene stock = 0:

- La emergencia se marca como `es_resoluble = false`
- Se muestra en el dashboard con indicador visual diferente (gris)
- El email incluye nota: "Requiere compra urgente a proveedor"
- **NO** se puede crear pedido de emergencia (no hay qué enviar)
- Opción: "Notificar a compras" para que hagan pedido a proveedor

### 11.4 Productos Nuevos

Para productos sin historial de ventas:

- Si no tienen P75 calculado, se excluyen de la detección automática
- Se pueden agregar manualmente a un pedido de emergencia
- Una vez tengan 7+ días de ventas, entran al sistema normal

---

## 12. Fases de Implementación

### Fase 1: Core Backend (3-4 días)

**Archivos:**
- `backend/config/emergencias_config.py`
- `backend/models/emergencias.py`
- `backend/services/detector_emergencias.py`
- `backend/services/blindajes_emergencias.py`
- `backend/routers/emergencias.py`

**Entregable:** Endpoints funcionales, detección via API manual

**Validación:**
- [ ] `POST /api/emergencias/scan` retorna emergencias
- [ ] Filtros de anomalía funcionan
- [ ] Cálculo de cobertura es correcto
- [ ] Factor de intensidad se calcula bien

### Fase 2: Perfil Horario (1-2 días)

**Archivos:**
- `backend/services/perfil_horario.py`
- Migration para tabla `perfil_horario`
- Script/job para recalcular semanalmente

**Entregable:** Perfil horario calculado y usado en detección

**Validación:**
- [ ] Query de perfil horario ejecuta correctamente
- [ ] Datos de perfil se usan en cálculo de demanda restante

### Fase 3: Blindajes y Persistencia (2-3 días)

**Archivos:**
- Migrations para tablas de tracking
- `backend/services/blindajes_emergencias.py` (completar)
- Integración con Redis o DB para estado

**Entregable:** Confirmación en 2 scans, cooldown, exclusiones

**Validación:**
- [ ] Emergencia no confirmada no aparece como tal
- [ ] Cooldown previene alertas repetidas
- [ ] Lista de exclusión funciona

### Fase 4: Scheduler y Notificaciones (2-3 días)

**Archivos:**
- `backend/jobs/scan_emergencias.py`
- `backend/services/notificador_emergencias.py`
- Extensión de `backend/email_notifier.py`

**Entregable:** Scans automáticos cada 30 min, emails funcionando

**Validación:**
- [ ] Scheduler ejecuta en horario correcto
- [ ] Emails batch se envían cada 2 horas
- [ ] STOCKOUT clase A genera email inmediato

### Fase 5: Frontend Dashboard (3-4 días)

**Archivos:**
- `frontend/src/components/emergencies/*`
- `frontend/src/services/emergenciasService.ts`
- Integración en página de pedidos

**Entregable:** Dashboard visible con emergencias y anomalías

**Validación:**
- [ ] Lista de emergencias se muestra correctamente
- [ ] Filtros funcionan
- [ ] Auto-refresh cada 60 segundos
- [ ] Tab de anomalías separado

### Fase 6: Wizard de Pedido (2-3 días)

**Archivos:**
- `frontend/src/components/emergencies/EmergencyOrderWizard.tsx`

**Entregable:** Flujo completo de crear pedido de emergencia

**Validación:**
- [ ] Selección múltiple de productos
- [ ] Edición de cantidades
- [ ] Pedido se crea con `tipo_pedido = 'emergencia'`

### Fase 7: Testing y Ajustes (2-3 días)

- Probar con datos reales de Caracas
- Ajustar umbrales según feedback
- Verificar que no haya spam de emails
- Documentar casos edge encontrados

---

## 13. Testing y Validación

### 13.1 Casos de Prueba Unitarios

```python
# tests/test_detector_emergencias.py

class TestDetectorEmergencias:
    
    def test_anomalia_stock_negativo(self):
        """Stock negativo debe marcar como anomalía, no emergencia"""
        resultado = detectar_anomalia_inventario(
            stock_actual=-20,
            ventas_hoy=15,
            ultima_venta=datetime.now(),
            now=datetime.now()
        )
        assert resultado == "stock_negativo"
    
    def test_anomalia_venta_reciente(self):
        """Stock 0 con venta hace 30 min = anomalía"""
        resultado = detectar_anomalia_inventario(
            stock_actual=0,
            ventas_hoy=5,
            ultima_venta=datetime.now() - timedelta(minutes=30),
            now=datetime.now()
        )
        assert resultado == "venta_reciente_sin_stock"
    
    def test_evidencia_insuficiente_producto_lento(self):
        """Producto con P75=2 y 1 venta en 1 hora no tiene evidencia"""
        producto = MockProducto(p75=2, ventas_hoy=1)
        assert not tiene_suficiente_evidencia(producto, horas_transcurridas=1)
    
    def test_evidencia_suficiente_alto_volumen(self):
        """Producto con P75=15 siempre tiene evidencia"""
        producto = MockProducto(p75=15, ventas_hoy=0)
        assert tiene_suficiente_evidencia(producto, horas_transcurridas=1)
    
    def test_clasificacion_stockout(self):
        """Stock 0 clase A = STOCKOUT"""
        tipo = clasificar_emergencia(
            stock_actual=0,
            cobertura=0,
            factor_intensidad=1.0,
            clase_abc='A'
        )
        assert tipo == TipoEmergencia.STOCKOUT
    
    def test_clasificacion_critico(self):
        """Cobertura 0.3 = CRÍTICO"""
        tipo = clasificar_emergencia(
            stock_actual=10,
            cobertura=0.3,
            factor_intensidad=1.0,
            clase_abc='A'
        )
        assert tipo == TipoEmergencia.CRITICO
    
    def test_clasificacion_alerta_dia_fuerte(self):
        """Cobertura 1.2 en día fuerte (factor 1.5) = ALERTA"""
        tipo = clasificar_emergencia(
            stock_actual=50,
            cobertura=1.2,
            factor_intensidad=1.5,
            clase_abc='A'
        )
        assert tipo == TipoEmergencia.ALERTA
    
    def test_clasificacion_ok_dia_normal(self):
        """Cobertura 1.2 en día normal = OK (no emergencia)"""
        tipo = clasificar_emergencia(
            stock_actual=50,
            cobertura=1.2,
            factor_intensidad=1.0,
            clase_abc='A'
        )
        assert tipo is None
```

### 13.2 Casos de Prueba de Integración

```python
# tests/test_integracion_emergencias.py

class TestIntegracionEmergencias:
    
    async def test_scan_completo(self, db_con_datos_prueba):
        """Scan completo detecta emergencias esperadas"""
        resultado = await detectar_emergencias(
            tiendas=["tienda_test"],
            cedi_id="cedi_test"
        )
        
        assert resultado.total_emergencias > 0
        assert all(e.confirmado == False for e in resultado.emergencias)  # Primer scan
    
    async def test_confirmacion_dos_scans(self, db_con_datos_prueba):
        """Emergencia se confirma después de 2 scans"""
        # Primer scan
        r1 = await detectar_emergencias(tiendas=["tienda_test"], cedi_id="cedi_test")
        emergencias_1 = [e for e in r1.emergencias if not e.confirmado]
        
        # Segundo scan
        r2 = await detectar_emergencias(tiendas=["tienda_test"], cedi_id="cedi_test")
        emergencias_confirmadas = [e for e in r2.emergencias if e.confirmado]
        
        # Las mismas emergencias ahora deberían estar confirmadas
        assert len(emergencias_confirmadas) > 0
    
    async def test_cooldown_funciona(self, db_con_datos_prueba):
        """Después de alertar, cooldown previene re-alerta"""
        # Simular alerta enviada
        await registrar_alerta_enviada(
            tienda_id="tienda_test",
            producto_id="producto_test",
            tipo_emergencia=TipoEmergencia.CRITICO
        )
        
        # Verificar cooldown
        debe = await verificar_cooldown(
            emergencia=MockEmergencia(
                tienda_id="tienda_test",
                producto_id="producto_test",
                tipo_emergencia=TipoEmergencia.CRITICO
            ),
            alertas_enviadas=await get_alertas_enviadas()
        )
        
        assert debe == False  # En cooldown
```

### 13.3 Escenarios de Validación Manual

| Escenario | Pasos | Resultado Esperado |
|-----------|-------|-------------------|
| Día normal, producto A se agota | 1. Stock llega a 0 2. Esperar scan | Email inmediato de STOCKOUT |
| Día de quincena | 1. Observar factor > 1.3 2. Ver alertas | Umbral de ALERTA se activa |
| Producto con stock negativo | 1. Crear stock = -10 2. Ejecutar scan | Aparece en anomalías, NO en emergencias |
| Falso positivo por pico | 1. Venta grande 2. Scan detecta 3. Siguiente scan sin venta | Emergencia no se confirma |
| Email batch | 1. Varias emergencias 2. Esperar 2 horas | Un solo email con todas |

---

## 14. Troubleshooting

### 14.1 Problemas Comunes

| Síntoma | Causa Probable | Solución |
|---------|----------------|----------|
| No detecta emergencias | Perfil horario no calculado | Ejecutar query de perfil |
| Muchos falsos positivos | Umbral muy sensible | Ajustar `EMERGENCY_UMBRAL_*` |
| Emails repetidos | Cooldown no funciona | Verificar tabla `emergencias_alertas_enviadas` |
| Factor intensidad siempre 1.0 | Sin datos de ventas esperadas | Verificar que hay 14+ días de historia |
| Anomalías no se detectan | Filtro no aplicado | Verificar orden de evaluación en código |

### 14.2 Queries de Diagnóstico

```sql
-- Ver estado actual de tracking
SELECT * FROM emergencias_tracking 
WHERE updated_at > NOW() - INTERVAL '1 hour'
ORDER BY scans_consecutivos DESC;

-- Ver alertas enviadas hoy
SELECT * FROM emergencias_alertas_enviadas
WHERE enviado_at > CURRENT_DATE
ORDER BY enviado_at DESC;

-- Ver factor de intensidad actual
WITH ventas_hoy AS (
    SELECT ubicacion_id, SUM(cantidad_vendida) as total
    FROM ventas
    WHERE fecha_venta = CURRENT_DATE
    GROUP BY ubicacion_id
),
ventas_esperadas AS (
    -- ... (query de promedio)
)
SELECT 
    vh.ubicacion_id,
    vh.total as ventas_hoy,
    ve.esperado,
    vh.total / NULLIF(ve.esperado, 0) as factor
FROM ventas_hoy vh
JOIN ventas_esperadas ve ON vh.ubicacion_id = ve.ubicacion_id;

-- Productos que deberían estar en emergencia pero no aparecen
SELECT 
    sa.ubicacion_id,
    sa.producto_id,
    sa.cantidad as stock,
    pat.demanda_p75,
    pat.clasificacion_abc
FROM stock_actual sa
JOIN productos_abc_tienda pat ON sa.producto_id = pat.producto_id 
    AND sa.ubicacion_id = pat.ubicacion_id
WHERE sa.cantidad = 0
  AND pat.clasificacion_abc IN ('A', 'B')
  AND sa.ubicacion_id IN ('tienda_17', 'tienda_18');
```

### 14.3 Logs Importantes

```python
# Asegurar estos logs en el código para debugging

logger.info(f"Scan iniciado: tiendas={tiendas}, hora={hora_actual}")
logger.info(f"Factor intensidad: {factor_por_tienda}")
logger.info(f"Emergencias detectadas: {len(emergencias)} (confirmadas: {confirmadas})")
logger.info(f"Anomalías detectadas: {len(anomalias)}")
logger.info(f"Notificación enviada: {enviada}, próxima: {proxima}")

# En caso de error
logger.error(f"Error en detección: {e}", exc_info=True)
logger.warning(f"Producto {producto_id} excluido: {razon}")
logger.warning(f"Cooldown activo para {tienda_id}/{producto_id}")
```

---

## Apéndice A: Glosario

| Término | Definición |
|---------|------------|
| **Cobertura** | Ratio de stock actual vs demanda restante esperada |
| **Factor de intensidad** | Multiplicador que indica qué tan fuerte es el día vs promedio |
| **P75** | Percentil 75 de demanda diaria (demanda en un día "fuerte" típico) |
| **Perfil horario** | Distribución de ventas por hora del día |
| **SS (Stock de Seguridad)** | Inventario mínimo para cubrir variabilidad |
| **Scan** | Ejecución del algoritmo de detección |
| **Cooldown** | Período de espera antes de re-alertar sobre mismo producto |
| **Anomalía** | Inconsistencia de inventario (no es problema de abastecimiento) |

---

## Apéndice B: Archivos de Referencia

| Archivo Existente | Usar como referencia para |
|-------------------|---------------------------|
| `backend/routers/pedidos_sugeridos.py` | Estructura de router, queries |
| `backend/services/calculo_inventario_abc.py` | Cálculos de SS, ROP, P75 |
| `backend/email_notifier.py` | Patrón de envío de emails |
| `backend/models/pedidos_sugeridos.py` | Estructura de modelos Pydantic |
| `frontend/src/components/orders/OrderWizard.tsx` | Base para wizard |
| `frontend/src/components/orders/SuggestedOrder.tsx` | Integración de tabs |

---

*Documento generado: Diciembre 2024*
*Versión: 2.0*
*Autor: FluxionIA Team*
