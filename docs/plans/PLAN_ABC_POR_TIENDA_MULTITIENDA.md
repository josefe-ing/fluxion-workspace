# Plan: ABC por Tienda en Pedidos Multi-Tienda

## 📋 Contexto

**Problema Actual:**
En pedidos multi-tienda (ej: CEDI Seco Valencia → Todas las tiendas de Valencia), la columna ABC muestra una sola letra sin especificar de qué tienda proviene, causando ambigüedad.

**Ejemplo del Problema:**
```
Producto: PASTA PEDAL (003831)
ABC mostrado: A

¿De cuál tienda?
- BOSQUE: ABC = A
- AV. BOLIVAR: ABC = B
- GUACARA: ABC = C
```

**Solución Propuesta:**
1. **Eliminar** columna general "ABC" (ambigua)
2. **Agregar** ABC específico en cada columna de tienda
3. **Para CEDIs**: Mostrar el ABC más crítico de las tiendas que sirve

---

## 🎯 Objetivos

1. **Claridad**: Cada tienda muestra su propio ABC
2. **CEDI Caracas**: Mostrar ABC más crítico (si alguna tienda es A → CEDI muestra A)
3. **CEDI Valencia**: Aplicar misma lógica con las ~14 tiendas de Valencia
4. **UX mejorada**: Usuario ve clasificación por ubicación en un vistazo

---

## 🧠 Lógica de Criticidad Máxima para CEDIs

### Regla:
```
Si el producto es A en ALGUNA tienda → CEDI muestra A
Si no hay A, pero es B en alguna → CEDI muestra B
Si no hay A ni B, pero es C → CEDI muestra C
Si todas son D → CEDI muestra D
```

### Ejemplos CEDI Caracas (sirve: Artigas + Paraíso):

| Producto | ABC Artigas | ABC Paraíso | **ABC CEDI** | Razón |
|----------|-------------|-------------|--------------|-------|
| Pan Árabe | **A** | C | **A** | Artigas lo necesita urgente |
| Huevos | B | **A** | **A** | Paraíso lo necesita urgente |
| Pan Blanco | C | C | **C** | Ambas tiendas igual |
| Desinfectante | D | D | **D** | Baja prioridad en ambas |

### Justificación Operacional:
- ✅ Si UNA tienda necesita urgente (A), CEDI debe priorizarlo
- ✅ No promedia criticidad, escala al caso más urgente
- ✅ Evita desabastecimientos en tiendas críticas
- ✅ Refleja necesidad operacional real

---

## 🔧 Componentes a Implementar

### 1. Función Helper: Obtener ABC Más Crítico
**Archivo:** `backend/services/calculo_abc_helper.py` (NUEVO)

```python
"""
Helper para cálculos de clasificación ABC
"""

from typing import List, Optional

def obtener_abc_mas_critico(abc_tiendas: List[Optional[str]]) -> str:
    """
    Retorna el ABC más crítico de una lista.

    Lógica: A > B > C > D (A es más crítico)

    Args:
        abc_tiendas: Lista de clasificaciones ABC ['A', 'B', 'C', 'D', None, 'SIN_VENTAS']

    Returns:
        str: ABC más crítico ('A', 'B', 'C', o 'D')

    Examples:
        >>> obtener_abc_mas_critico(['A', 'C'])
        'A'
        >>> obtener_abc_mas_critico(['B', 'D', None])
        'B'
        >>> obtener_abc_mas_critico(['C', 'C'])
        'C'
        >>> obtener_abc_mas_critico([None, 'SIN_VENTAS'])
        'D'
    """
    # Mapeo de ABC a prioridad (1 = más crítico)
    prioridad = {
        'A': 1,
        'B': 2,
        'C': 3,
        'D': 4,
        'SIN_VENTAS': 5,
        None: 6
    }

    # Filtrar valores válidos
    abc_validos = [abc for abc in abc_tiendas if abc in prioridad]

    if not abc_validos:
        return 'D'  # Default conservador

    # Retornar el de MENOR prioridad (más crítico)
    return min(abc_validos, key=lambda x: prioridad[x])


def obtener_abc_por_tienda_cedi(conn, producto_id: str, tiendas_servidas: List[str]) -> dict:
    """
    Obtiene el ABC de un producto en cada tienda que sirve un CEDI.
    Retorna también el ABC más crítico (para mostrar en CEDI).

    Args:
        conn: Conexión a DB
        producto_id: Código del producto
        tiendas_servidas: Lista de IDs de tiendas (ej: ['tienda_17', 'tienda_18'])

    Returns:
        {
            'abc_por_tienda': {'tienda_17': 'A', 'tienda_18': 'C'},
            'abc_mas_critico': 'A'
        }
    """
    cursor = conn.cursor()

    placeholders = ', '.join(['%s'] * len(tiendas_servidas))
    query = f"""
        SELECT ubicacion_id, clase_abc
        FROM productos_abc_tienda
        WHERE producto_id = %s
          AND ubicacion_id IN ({placeholders})
    """

    params = [producto_id] + tiendas_servidas
    cursor.execute(query, params)
    rows = cursor.fetchall()
    cursor.close()

    # Construir diccionario
    abc_por_tienda = {row[0]: row[1] for row in rows}

    # Obtener ABC más crítico
    abc_values = list(abc_por_tienda.values())
    abc_mas_critico = obtener_abc_mas_critico(abc_values) if abc_values else 'D'

    return {
        'abc_por_tienda': abc_por_tienda,
        'abc_mas_critico': abc_mas_critico
    }
```

---

### 2. Modificar Backend: CEDI Caracas
**Archivo:** `backend/routers/pedidos_multitienda.py`

**Función:** `obtener_productos_cedi_caracas()` (línea 657)

**Cambios:**

```python
# ANTES (línea 766):
abc_cache AS (
    SELECT producto_id, clase_abc
    FROM productos_abc_cache  # ABC global
)
...
COALESCE(abc.clase_abc, 'D') as clase_abc

# DESPUÉS:
abc_tiendas_ccs AS (
    -- ABC de cada tienda de Caracas (Artigas + Paraíso)
    SELECT
        producto_id,
        ubicacion_id,
        clase_abc
    FROM productos_abc_tienda
    WHERE ubicacion_id IN ('tienda_17', 'tienda_18')
),
abc_cedi_ccs AS (
    -- ABC más crítico para CEDI Caracas
    SELECT
        producto_id,
        -- Tomar el ABC con mayor criticidad (A=1, B=2, C=3, D=4)
        CASE
            WHEN MIN(
                CASE clase_abc
                    WHEN 'A' THEN 1
                    WHEN 'B' THEN 2
                    WHEN 'C' THEN 3
                    WHEN 'D' THEN 4
                    ELSE 5
                END
            ) = 1 THEN 'A'
            WHEN MIN(
                CASE clase_abc
                    WHEN 'A' THEN 1
                    WHEN 'B' THEN 2
                    WHEN 'C' THEN 3
                    WHEN 'D' THEN 4
                    ELSE 5
                END
            ) = 2 THEN 'B'
            WHEN MIN(
                CASE clase_abc
                    WHEN 'A' THEN 1
                    WHEN 'B' THEN 2
                    WHEN 'C' THEN 3
                    WHEN 'D' THEN 4
                    ELSE 5
                END
            ) = 3 THEN 'C'
            ELSE 'D'
        END as clase_abc_cedi
    FROM abc_tiendas_ccs
    GROUP BY producto_id
)
...
-- En SELECT principal:
COALESCE(abc_cedi.clase_abc_cedi, 'D') as clase_abc
```

---

### 3. Modificar Backend: Agregar ABC a Distribución
**Archivo:** `backend/routers/pedidos_multitienda.py`

**Función:** `calcular_pedidos_multitienda()` - Sección de conflictos (línea 1193)

**Cambios en modelo de respuesta:**

```python
# ANTES - AsignacionProductoResponse solo tiene:
{
    "tienda_id": "tienda_08",
    "tienda_nombre": "BOSQUE",
    "demanda_p75": 119.5,
    "stock_actual": 0,
    "cantidad_asignada_bultos": 346,
    ...
}

# DESPUÉS - Agregar campo ABC:
{
    "tienda_id": "tienda_08",
    "tienda_nombre": "BOSQUE",
    "abc": "A",  # ← NUEVO
    "demanda_p75": 119.5,
    "stock_actual": 0,
    "cantidad_asignada_bultos": 346,
    ...
}
```

**Implementación:**

```python
# En línea ~1180 donde se construye distribucion_con_transito:
distribucion_con_transito = []
for a in asignaciones:
    tienda_data = tiendas_data[a.tienda_id]

    # NUEVO: Obtener ABC de esta tienda para este producto
    abc_tienda = tienda_data.get('clasificacion_abc', 'D')

    distribucion_con_transito.append(AsignacionProductoResponse(
        tienda_id=a.tienda_id,
        tienda_nombre=a.tienda_nombre,
        abc=abc_tienda,  # ← NUEVO
        demanda_p75=a.demanda_p75,
        stock_actual=tienda_data['stock_tienda'],
        stock_transito=tienda_data.get('stock_transito', 0),
        ...
    ))
```

---

### 4. Modificar Schema de Respuesta
**Archivo:** `backend/schemas/pedidos.py`

**Modelo:** `AsignacionProductoResponse`

```python
# ANTES:
class AsignacionProductoResponse(BaseModel):
    tienda_id: str
    tienda_nombre: str
    demanda_p75: float
    stock_actual: float
    stock_transito: float = 0
    necesidad_bultos: int
    cantidad_asignada_bultos: int
    deficit_vs_necesidad: int
    cobertura_dias_resultante: float

# DESPUÉS:
class AsignacionProductoResponse(BaseModel):
    tienda_id: str
    tienda_nombre: str
    abc: str  # ← NUEVO: Clasificación ABC de esta tienda para este producto
    demanda_p75: float
    stock_actual: float
    stock_transito: float = 0
    necesidad_bultos: int
    cantidad_asignada_bultos: int
    deficit_vs_necesidad: int
    cobertura_dias_resultante: float
```

---

### 5. Frontend: Rediseñar Tabla de Conflictos
**Archivo:** `frontend/src/components/orders/ConflictResolutionStep.tsx`

**Cambios de UI:**

**ANTES:**
```tsx
<Table>
  <TableHeader>
    <TableColumn>ABC</TableColumn>  {/* ← ELIMINAR */}
    <TableColumn>AV. BOLIVAR</TableColumn>
    <TableColumn>BOSQUE</TableColumn>
  </TableHeader>
  <TableRow>
    <TableCell>A</TableCell>  {/* ← Ambiguo */}
    <TableCell>P75: 375 | Stk: 29</TableCell>
    <TableCell>P75: 119 | Stk: -82</TableCell>
  </TableRow>
</Table>
```

**DESPUÉS:**
```tsx
<Table>
  <TableHeader>
    {/* Columna ABC eliminada */}
    <TableColumn>
      <div className="flex flex-col">
        <span className="font-bold">AV. BOLIVAR</span>
        <span className="text-xs text-gray-500">ABC | P75 | Stock</span>
      </div>
    </TableColumn>
    <TableColumn>
      <div className="flex flex-col">
        <span className="font-bold">BOSQUE</span>
        <span className="text-xs text-gray-500">ABC | P75 | Stock</span>
      </div>
    </TableColumn>
  </TableHeader>
  <TableRow>
    <TableCell>
      <div className="flex items-center gap-2">
        <Badge color="success">B</Badge>  {/* ← ABC de Bolívar */}
        <span>P75: 375</span>
        <span>Stk: 29</span>
      </div>
    </TableCell>
    <TableCell>
      <div className="flex items-center gap-2">
        <Badge color="success">A</Badge>  {/* ← ABC de Bosque */}
        <span>P75: 119</span>
        <span>Stk: -82</span>
      </div>
    </TableCell>
  </TableRow>
</Table>
```

**Componente Badge ABC:**
```tsx
function ABCBadge({ abc }: { abc: string }) {
  const colors = {
    'A': 'success',  // Verde
    'B': 'warning',  // Amarillo
    'C': 'default',  // Naranja
    'D': 'danger',   // Gris
  };

  return (
    <Badge
      color={colors[abc] || 'default'}
      size="sm"
      variant="flat"
    >
      {abc}
    </Badge>
  );
}
```

---

### 6. Frontend: Tooltip para CEDI
**Archivo:** `frontend/src/components/orders/ConflictResolutionStep.tsx`

**Agregar tooltip explicativo para CEDI:**

```tsx
<TableCell>
  <div className="flex items-center gap-2">
    <ABCBadge abc="A" />
    <Tooltip content={
      <div className="p-2">
        <p className="font-semibold mb-1">ABC más crítico:</p>
        <ul className="text-xs space-y-1">
          <li>• Artigas: <Badge size="sm">A</Badge></li>
          <li>• Paraíso: <Badge size="sm">C</Badge></li>
        </ul>
        <p className="text-xs mt-2 text-gray-400">
          CEDI muestra A porque Artigas lo necesita urgente
        </p>
      </div>
    }>
      <InfoIcon className="w-4 h-4 text-gray-400 cursor-help" />
    </Tooltip>
    <span>P75: 500</span>
    <span>Stk: 194</span>
  </div>
</TableCell>
```

---

## 📦 Archivos a Crear/Modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `backend/services/calculo_abc_helper.py` | ✨ CREAR | Funciones helper para ABC crítico |
| `backend/routers/pedidos_multitienda.py` | ✏️ MODIFICAR | Agregar lógica ABC para CEDI y tiendas |
| `backend/schemas/pedidos.py` | ✏️ MODIFICAR | Agregar campo `abc` a `AsignacionProductoResponse` |
| `frontend/src/components/orders/ConflictResolutionStep.tsx` | ✏️ MODIFICAR | Rediseñar tabla con ABC por tienda |
| `frontend/src/components/orders/ABCBadge.tsx` | ✨ CREAR | Componente Badge para ABC |

---

## 🧪 Plan de Verificación

### 1. Backend: Función Helper
```python
# Test unitario
from backend.services.calculo_abc_helper import obtener_abc_mas_critico

assert obtener_abc_mas_critico(['A', 'C']) == 'A'
assert obtener_abc_mas_critico(['B', 'D']) == 'B'
assert obtener_abc_mas_critico(['C', 'C']) == 'C'
assert obtener_abc_mas_critico([None, 'D']) == 'D'
assert obtener_abc_mas_critico([]) == 'D'
```

### 2. Backend: CEDI Caracas
```sql
-- Verificar query SQL de ABC crítico
WITH abc_tiendas_ccs AS (
    SELECT producto_id, ubicacion_id, clase_abc
    FROM productos_abc_tienda
    WHERE ubicacion_id IN ('tienda_17', 'tienda_18')
      AND producto_id = '005089'
)
SELECT * FROM abc_tiendas_ccs;

-- Debe retornar:
-- 005089 | tienda_17 | A
-- 005089 | tienda_18 | C

-- Y el ABC de CEDI debe ser: A
```

### 3. Endpoint API
```bash
# Crear pedido multi-tienda CEDI Caracas → Artigas + Paraíso
curl -X POST https://api.fluxionia.co/api/pedidos-multitienda/calcular \
  -H "Content-Type: application/json" \
  -d '{
    "cedi_origen": "cedi_caracas",
    "tiendas_destino": [
      {"tienda_id": "tienda_17", "tienda_nombre": "ARTIGAS"},
      {"tienda_id": "tienda_18", "tienda_nombre": "PARAISO"}
    ]
  }'

# Verificar respuesta incluye ABC por tienda:
{
  "conflictos": [{
    "codigo_producto": "005089",
    "distribucion_dpdu": [
      {
        "tienda_id": "tienda_17",
        "tienda_nombre": "ARTIGAS",
        "abc": "A",  // ← DEBE ESTAR
        ...
      },
      {
        "tienda_id": "tienda_18",
        "tienda_nombre": "PARAISO",
        "abc": "C",  // ← DEBE ESTAR
        ...
      }
    ]
  }]
}
```

### 4. Frontend Visual
1. Abrir: https://app.fluxionia.co/pedidos/pedidos-sugeridos/nuevo-multi
2. Seleccionar: CEDI Seco → Todas las tiendas de Valencia
3. Verificar:
   - ✅ NO hay columna "ABC" general
   - ✅ Cada columna de tienda muestra su propio ABC badge
   - ✅ Badge tiene color correcto (A=verde, B=amarillo, C=naranja, D=gris)
   - ✅ Tooltip en CEDI muestra breakdown de ABCs
4. Para CEDI Caracas:
   - ✅ ABC mostrado es el más crítico de Artigas/Paraíso
   - ✅ Tooltip explica de dónde viene el ABC

---

## 📊 Casos de Prueba

### Caso 1: Producto con ABC diferente por tienda
```
Producto: PAN ÁRABE (005089)
- BOSQUE: ABC = A, P75 = 119
- AV. BOLIVAR: ABC = B, P75 = 375
- GUACARA: ABC = C, P75 = 80

Resultado esperado:
- Columna BOSQUE: Badge verde "A"
- Columna AV. BOLIVAR: Badge amarillo "B"
- Columna GUACARA: Badge naranja "C"
```

### Caso 2: CEDI Caracas - ABC Crítico
```
Producto: HUEVOS (003289)
- Artigas: ABC = A
- Paraíso: ABC = C

Resultado esperado:
- Columna CEDI CARACAS: Badge verde "A"
- Tooltip muestra: "Artigas: A, Paraíso: C"
- Explicación: "CEDI muestra A porque Artigas lo necesita urgente"
```

### Caso 3: CEDI Seco Valencia - Múltiples Tiendas
```
Producto: PASTA DEDAL (003831)
- 10 tiendas con ABC = B
- 2 tiendas con ABC = A
- 2 tiendas con ABC = C

Resultado esperado:
- Columna CEDI SECO: Badge verde "A"
- Tooltip muestra las 2 tiendas con A
- Cada columna de tienda muestra su ABC específico
```

### Caso 4: Producto sin ventas en tienda
```
Producto: DESINFECTANTE (005362)
- BOSQUE: ABC = D (sin ventas)
- AV. BOLIVAR: ABC = D (sin ventas)

Resultado esperado:
- Ambas columnas: Badge gris "D"
```

---

## 🎨 Diseño Visual

### Antes (Ambiguo):
```
┌────┬───────────┬─────┬─────────────┬─────────────┐
│ #  │ PRODUCTO  │ ABC │ AV. BOLIVAR │   BOSQUE    │
├────┼───────────┼─────┼─────────────┼─────────────┤
│ 1  │ PAN ÁRABE │  A  │ 375 | 29    │ 119 | -82   │
└────┴───────────┴─────┴─────────────┴─────────────┘
                   ↑ ¿De cuál tienda?
```

### Después (Claro):
```
┌────┬───────────┬──────────────────┬──────────────────┐
│ #  │ PRODUCTO  │  AV. BOLIVAR     │     BOSQUE       │
│    │           │ ABC │ P75 │ Stk  │ ABC │ P75 │ Stk  │
├────┼───────────┼──────────────────┼──────────────────┤
│ 1  │ PAN ÁRABE │ [B] │ 375 │ 29   │ [A] │ 119 │ -82  │
└────┴───────────┴──────────────────┴──────────────────┘
                    ↑               ↑
                  Badge             Badge
                  amarillo          verde
```

---

## ⏱️ Estimación de Tiempo

| Tarea | Tiempo | Descripción |
|-------|--------|-------------|
| **Backend Helper** | 30 min | Crear `calculo_abc_helper.py` + tests |
| **Backend CEDI** | 45 min | Modificar query de CEDI Caracas |
| **Backend Schema** | 15 min | Agregar campo ABC a respuesta |
| **Backend Multi-tienda** | 30 min | Agregar ABC a distribución |
| **Frontend Badge** | 20 min | Crear componente ABCBadge |
| **Frontend Tabla** | 45 min | Rediseñar tabla de conflictos |
| **Frontend Tooltip** | 20 min | Agregar tooltip para CEDI |
| **Testing** | 30 min | Verificar casos de prueba |
| **TOTAL** | **~4 horas** | |

---

## 🚀 Orden de Implementación

1. ✅ **Backend Helper** (30 min)
   - Crear `calculo_abc_helper.py`
   - Función `obtener_abc_mas_critico()`
   - Tests unitarios

2. ✅ **Backend CEDI** (45 min)
   - Modificar `obtener_productos_cedi_caracas()`
   - Agregar CTEs para ABC crítico
   - Aplicar misma lógica a CEDI Seco (si aplica)

3. ✅ **Backend Schema** (15 min)
   - Modificar `AsignacionProductoResponse`
   - Agregar campo `abc: str`

4. ✅ **Backend Multi-tienda** (30 min)
   - Modificar `calcular_pedidos_multitienda()`
   - Agregar ABC a cada asignación de tienda

5. ✅ **Frontend Badge** (20 min)
   - Crear componente `ABCBadge.tsx`
   - Colores por clasificación

6. ✅ **Frontend Tabla** (45 min)
   - Eliminar columna ABC general
   - Integrar ABC en cada columna de tienda
   - Layout responsivo

7. ✅ **Frontend Tooltip** (20 min)
   - Agregar tooltip para CEDI
   - Mostrar breakdown de ABCs

8. ✅ **Testing** (30 min)
   - Verificar todos los casos de prueba
   - Deploy y prueba en producción

---

## 💡 Mejoras Futuras (Opcional)

### Post-MVP:
1. **Filtro por ABC**: Permitir filtrar conflictos por clasificación (solo A, solo A+B, etc.)
2. **Ordenar por ABC**: Ordenar tabla por criticidad de ABC
3. **Color de fila**: Colorear fila completa según ABC más crítico
4. **Export Excel**: Incluir columna ABC por tienda en Excel generado
5. **Métricas**: Dashboard mostrando distribución de ABC por CEDI

---

## 📝 Notas Adicionales

- **Backward compatible**: No rompe pedidos existentes
- **Escalable**: Lógica aplicable a todos los CEDIs
- **Performance**: No impacta significativamente tiempo de respuesta
- **Mantenible**: Lógica centralizada en helper functions
- **Testeable**: Funciones puras fáciles de testear

---

## ✅ Criterios de Éxito

| Criterio | Verificación |
|----------|--------------|
| ABC por tienda visible | ✅ Cada columna muestra su ABC |
| CEDI muestra ABC crítico | ✅ Si alguna tienda es A → CEDI es A |
| Sin columna ABC general | ✅ Columna ambigua eliminada |
| Tooltip informativo | ✅ Muestra breakdown para CEDI |
| Performance mantenida | ✅ Tiempo de respuesta <5s |
| UI clara y usable | ✅ Usuario entiende ABC sin confusión |

---

**Última actualización:** 2026-02-06
**Autor:** Mejora UX - ABC por Tienda en Multi-Tienda
