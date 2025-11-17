# Lógica de Nivel Objetivo - Matemáticas y Fórmulas

## Visión General

Este documento explica **paso a paso** cómo el sistema calcula el nivel objetivo de inventario para cada producto en cada tienda.

---

## Paso 1: Obtener Demanda Promedio Diaria

### Fuente de Datos

El sistema utiliza la vista `productos_abc_v2` que contiene:
- `demanda_promedio_semanal`: Promedio de ventas de las últimas **8 semanas**
- `desviacion_std_semanal`: Desviación estándar de las últimas **8 semanas**
- `matriz_abc_xyz`: Clasificación del producto (AX, BY, CZ, etc.)

### Conversión Semanal → Diaria

**Demanda Promedio Diaria:**
```
Demanda_Promedio_Diaria = Demanda_Promedio_Semanal / 7
```

**Desviación Estándar Diaria:**
```
Desv_Std_Diaria = Desv_Std_Semanal / √7
```

> **¿Por qué dividir por √7?** En estadística, cuando conviertes la desviación estándar de un periodo a otro, debes dividir por la raíz cuadrada del factor de tiempo (7 días).

### Ejemplo con Datos Reales

**Producto: 004962 (Arroz 1kg) - Clase AX**

Datos semanales:
- Demanda promedio semanal: 12,617 unidades
- Desviación estándar semanal: 722 unidades

Conversión a diario:
```
Demanda_Promedio_Diaria = 12,617 / 7 = 1,802 unidades/día
Desv_Std_Diaria = 722 / √7 = 722 / 2.646 = 273 unidades/día
```

---

## Paso 2: Calcular Inventario en Tránsito

### ¿Qué se considera "en tránsito"?

Todas las unidades ya solicitadas pero no recibidas, en los siguientes estados:

| Estado | Descripción |
|--------|-------------|
| `aprobado_gerente` | Pedido aprobado por el gerente de la tienda |
| `en_picking` | Siendo preparado en el Centro de Distribución |
| `en_transito` | En camino hacia la tienda |
| `despachado` | Enviado desde el CEDI, pendiente de recepción |

### Fórmula SQL

```sql
SELECT COALESCE(SUM(pd.cantidad), 0) as inventario_en_transito
FROM pedidos p
JOIN pedidos_detalle pd ON p.id = pd.pedido_id
WHERE p.tienda_destino_id = :tienda_id
  AND pd.producto_id = :producto_id
  AND p.estado IN ('aprobado_gerente', 'en_picking', 'en_transito', 'despachado')
```

### Ejemplo

Si una tienda tiene:
- 500 unidades en estado `aprobado_gerente`
- 300 unidades en estado `en_picking`
- 200 unidades en estado `en_transito`

**Total en tránsito = 500 + 300 + 200 = 1,000 unidades**

---

## Paso 3: Obtener Parámetros de Reposición

### Parámetros por Tienda y Matriz

Cada tienda tiene **9 conjuntos de parámetros** (uno por cada clasificación ABC-XYZ):

```sql
SELECT
    nivel_servicio_z,
    multiplicador_demanda,
    multiplicador_ss,
    incluir_stock_seguridad,
    prioridad_reposicion
FROM parametros_reposicion_tienda
WHERE tienda_id = :tienda_id
  AND matriz_abc_xyz = :matriz  -- Ej: 'AX'
  AND activo = true
```

### Parámetros por Defecto

| Matriz | Z-Score | Mult. Demanda | Mult. SS | Inc. SS | Prioridad |
|--------|---------|---------------|----------|---------|-----------|
| AX | 1.96 | 1.00 | 1.00 | Sí | 1 |
| AY | 1.96 | 1.05 | 1.25 | Sí | 2 |
| AZ | 1.96 | 1.10 | 1.50 | Sí | 3 |
| BX | 1.65 | 1.00 | 1.00 | Sí | 4 |
| BY | 1.65 | 1.00 | 1.10 | Sí | 5 |
| BZ | 1.65 | 1.05 | 1.25 | Sí | 6 |
| CX | 1.28 | 1.00 | 1.00 | Sí | 7 |
| CY | 1.28 | 1.00 | 0.50 | Sí | 8 |
| CZ | 0.00 | 0.75 | 0.00 | **No** | 9 |

> **Nota:** Estos valores pueden ser ajustados por tienda según sus necesidades específicas.

---

## Paso 4: Calcular Demanda Durante el Ciclo

### Fórmula

```
Demanda_Ciclo = Demanda_Promedio_Diaria × Periodo_Reposicion × Multiplicador_Demanda
```

**Donde:**
- **Demanda_Promedio_Diaria:** Calculada en el Paso 1
- **Periodo_Reposicion:** 2.5 días (1.5 días lead time + 1.0 día review cycle)
- **Multiplicador_Demanda:** Parámetro de ajuste (0.75 a 1.10)

### ¿Por qué Multiplicadores?

Los multiplicadores permiten ajustar la demanda según el comportamiento del producto:

- **Mult > 1.0:** Aumenta el nivel objetivo (productos con tendencia creciente o estacionalidad)
- **Mult = 1.0:** Usa la demanda histórica sin ajustes
- **Mult < 1.0:** Reduce el nivel objetivo (productos CZ de baja rotación)

### Ejemplo 1: Producto AX (Multiplicador 1.00)

```
Demanda_Ciclo = 1,802 unidades/día × 2.5 días × 1.00
Demanda_Ciclo = 4,505 unidades
```

### Ejemplo 2: Producto CZ (Multiplicador 0.75)

```
Demanda_Ciclo = 5,602 unidades/día × 2.5 días × 0.75
Demanda_Ciclo = 10,504 unidades
```

---

## Paso 5: Calcular Stock de Seguridad

### Fórmula Completa

```
Stock_Seguridad = Z × Desv_Std_Diaria × √(Periodo_Reposicion) × Multiplicador_SS
```

**Donde:**
- **Z:** Z-score del nivel de servicio deseado (0.00 a 1.96)
- **Desv_Std_Diaria:** Calculada en el Paso 1
- **√(Periodo_Reposicion):** √2.5 = 1.581
- **Multiplicador_SS:** Parámetro de ajuste (0.00 a 1.50)

### Niveles de Servicio (Z-scores)

| Z-score | Nivel de Servicio | Probabilidad de Quiebre | Uso Típico |
|---------|-------------------|-------------------------|------------|
| **1.96** | 97.5% | 2.5% | Productos A (alto valor) |
| **1.65** | 95.0% | 5.0% | Productos B (medio valor) |
| **1.28** | 90.0% | 10.0% | Productos C (bajo valor) |
| **0.00** | ~50% | ~50% | Productos CZ sin SS |

### ¿Por qué √(Periodo)?

En teoría de inventarios, la variabilidad de la demanda crece con la raíz cuadrada del tiempo:
- Para 1 día: √1 = 1.00
- Para 2.5 días: √2.5 = 1.58
- Para 7 días: √7 = 2.65

### Ejemplo 1: Producto AX (Alto Valor, Estable)

**Datos:**
- Desviación estándar diaria: 273 unidades
- Z-score: 1.96 (97.5% nivel de servicio)
- Multiplicador SS: 1.00

**Cálculo:**
```
SS = 1.96 × 273 × √2.5 × 1.00
SS = 1.96 × 273 × 1.581 × 1.00
SS = 846 unidades
```

**Interpretación:** El sistema mantendrá 846 unidades adicionales como colchón de seguridad, garantizando 97.5% de disponibilidad.

### Ejemplo 2: Producto BY (Medio Valor, Media Variabilidad)

**Datos:**
- Desviación estándar diaria: 2,876 unidades
- Z-score: 1.65 (95% nivel de servicio)
- Multiplicador SS: 1.10

**Cálculo:**
```
SS = 1.65 × 2,876 × √2.5 × 1.10
SS = 1.65 × 2,876 × 1.581 × 1.10
SS = 8,280 unidades
```

**Interpretación:** Por ser más variable (alta desviación), necesita más stock de seguridad.

### Ejemplo 3: Producto CZ (Bajo Valor, Errático)

**Datos:**
- Z-score: 0.00 (sin stock de seguridad)
- Multiplicador SS: 0.00
- `incluir_stock_seguridad = false`

**Cálculo:**
```
SS = 0 unidades
```

**Interpretación:** Productos de baja rotación y bajo valor no justifican mantener inventario de seguridad.

---

## Paso 6: Calcular Nivel Objetivo

### Fórmula Final

```
Nivel_Objetivo = Demanda_Ciclo + Stock_Seguridad
```

### Ejemplo 1: Producto AX (004962)

**Resumen de cálculos anteriores:**
- Demanda durante ciclo: 4,505 unidades
- Stock de seguridad: 846 unidades

**Nivel Objetivo:**
```
Nivel_Objetivo = 4,505 + 846 = 5,351 unidades
```

### Ejemplo 2: Producto BY (000096)

**Resumen de cálculos anteriores:**
- Demanda durante ciclo: 22,570 unidades (9,028 × 2.5 × 1.00)
- Stock de seguridad: 8,280 unidades

**Nivel Objetivo:**
```
Nivel_Objetivo = 22,570 + 8,280 = 30,850 unidades
```

### Ejemplo 3: Producto CZ (004871)

**Resumen de cálculos anteriores:**
- Demanda durante ciclo: 10,504 unidades (5,602 × 2.5 × 0.75)
- Stock de seguridad: 0 unidades

**Nivel Objetivo:**
```
Nivel_Objetivo = 10,504 + 0 = 10,504 unidades
```

---

## Paso 7: Calcular Cantidad Sugerida

### Fórmula

```
Cantidad_Sugerida = MAX(0, Nivel_Objetivo - Stock_Disponible - Inventario_En_Transito)
```

**Donde:**
- **Stock_Disponible:** Inventario actual en la tienda
- **Inventario_En_Transito:** Calculado en el Paso 2

### Lógica de Decisión

| Situación | Resultado | Acción |
|-----------|-----------|--------|
| Nivel_Objetivo > (Stock + En_Tránsito) | Cantidad > 0 | **Enviar pedido** |
| Nivel_Objetivo ≤ (Stock + En_Tránsito) | Cantidad = 0 | **No enviar** (hay suficiente) |

### Ejemplo 1: Hay Déficit

**Datos:**
- Nivel objetivo: 5,351 unidades
- Stock actual: 2,000 unidades
- En tránsito: 500 unidades

**Cálculo:**
```
Cantidad_Sugerida = 5,351 - 2,000 - 500 = 2,851 unidades
```

**Decisión:** Enviar 2,851 unidades desde el CEDI.

### Ejemplo 2: Hay Exceso

**Datos:**
- Nivel objetivo: 5,351 unidades
- Stock actual: 6,000 unidades
- En tránsito: 0 unidades

**Cálculo:**
```
Cantidad_Sugerida = MAX(0, 5,351 - 6,000 - 0)
Cantidad_Sugerida = MAX(0, -649)
Cantidad_Sugerida = 0 unidades
```

**Decisión:** No enviar nada, la tienda tiene más inventario del necesario.

### Ejemplo 3: Hay Pedido en Tránsito

**Datos:**
- Nivel objetivo: 5,351 unidades
- Stock actual: 2,000 unidades
- En tránsito: 4,000 unidades

**Cálculo:**
```
Cantidad_Sugerida = MAX(0, 5,351 - 2,000 - 4,000)
Cantidad_Sugerida = MAX(0, -649)
Cantidad_Sugerida = 0 unidades
```

**Decisión:** No enviar nada, ya hay suficiente pedido en camino.

---

## Diagrama de Flujo Completo

```
┌─────────────────────────────────────────────────────────────────────┐
│                  INICIO: Calcular Nivel Objetivo                    │
│                     (Producto X, Tienda Y)                          │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 1: Obtener Demanda Histórica (productos_abc_v2)               │
│  - Demanda promedio semanal → Convertir a diaria (/7)               │
│  - Desviación estándar semanal → Convertir a diaria (/√7)           │
│  - Matriz ABC-XYZ del producto                                      │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 2: Calcular Inventario en Tránsito                            │
│  - Sumar pedidos en estados: aprobado, picking, tránsito, despacho  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 3: Obtener Parámetros de Reposición                           │
│  - Buscar en parametros_reposicion_tienda                           │
│  - Filtrar por: tienda_id, matriz_abc_xyz, activo=true              │
│  - Obtener: Z, mult_demanda, mult_SS, incluir_SS                    │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 4: Calcular Demanda Durante Ciclo                             │
│  Demanda_Ciclo = Demanda_Diaria × 2.5 días × Mult_Demanda           │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 5: Calcular Stock de Seguridad                                │
│  SS = Z × Desv_Std_Diaria × √2.5 × Mult_SS                          │
│  (Si incluir_SS = false, entonces SS = 0)                           │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 6: Calcular Nivel Objetivo                                    │
│  Nivel_Objetivo = Demanda_Ciclo + Stock_Seguridad                   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 7: Calcular Cantidad Sugerida                                 │
│  Cantidad = MAX(0, Nivel - Stock_Actual - En_Tránsito)              │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    RESULTADO FINAL                                  │
│  - Nivel Objetivo                                                   │
│  - Stock de Seguridad                                               │
│  - Demanda Ciclo                                                    │
│  - Cantidad Sugerida                                                │
│  - Inventario en Tránsito                                           │
│  - Método de Cálculo: "NORMAL"                                      │
│  - Datos de Cálculo (JSON con todos los valores intermedios)        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Caso de Estudio Completo

### Producto: 004962 (Arroz 1kg) - Tienda: PERIFERICO

**PASO 1: Demanda Histórica**
```
Demanda semanal: 12,617 unidades
Desv. std semanal: 722 unidades
Matriz: AX

→ Demanda diaria = 12,617 / 7 = 1,802 unidades/día
→ Desv. std diaria = 722 / √7 = 273 unidades/día
```

**PASO 2: Inventario en Tránsito**
```
Pedidos en estados: aprobado, picking, tránsito, despachado
→ Total en tránsito = 0 unidades
```

**PASO 3: Parámetros de Reposición (AX)**
```
Z-score: 1.96 (97.5% nivel servicio)
Multiplicador demanda: 1.00
Multiplicador SS: 1.00
Incluir SS: Sí
Prioridad: 1
```

**PASO 4: Demanda Durante Ciclo**
```
Demanda_Ciclo = 1,802 × 2.5 × 1.00
Demanda_Ciclo = 4,505 unidades
```

**PASO 5: Stock de Seguridad**
```
SS = 1.96 × 273 × √2.5 × 1.00
SS = 1.96 × 273 × 1.581 × 1.00
SS = 846 unidades
```

**PASO 6: Nivel Objetivo**
```
Nivel_Objetivo = 4,505 + 846
Nivel_Objetivo = 5,351 unidades
```

**PASO 7: Cantidad Sugerida**
```
Stock actual: 3,000 unidades
En tránsito: 0 unidades

Cantidad_Sugerida = MAX(0, 5,351 - 3,000 - 0)
Cantidad_Sugerida = 2,351 unidades
```

### Resultado Final

| Métrica | Valor |
|---------|-------|
| Nivel Objetivo | 5,351 unidades |
| Stock de Seguridad | 846 unidades |
| Demanda Ciclo | 4,505 unidades |
| Stock Actual | 3,000 unidades |
| En Tránsito | 0 unidades |
| **Cantidad Sugerida** | **2,351 unidades** |

**Decisión:** Enviar 2,351 unidades desde el CEDI a la tienda PERIFERICO para alcanzar el nivel objetivo.

---

## Validaciones del Sistema

### 1. Validación de Datos Faltantes

Si no hay datos históricos:
```python
if demanda_promedio_semanal is None or desviacion_std_semanal is None:
    raise ValueError("No hay datos históricos suficientes (se requieren 8 semanas)")
```

### 2. Validación de Parámetros

Si no existen parámetros configurados:
```python
if parametros is None:
    raise ValueError(f"No hay parámetros configurados para tienda {tienda_id} matriz {matriz}")
```

### 3. Validación de Valores Negativos

Cantidad sugerida nunca puede ser negativa:
```python
cantidad_sugerida = max(0, nivel_objetivo - stock_actual - en_transito)
```

### 4. Validación de Z-scores

Z-score debe estar en rango válido:
```python
if not (0.0 <= nivel_servicio_z <= 3.0):
    raise ValueError("Z-score debe estar entre 0.0 y 3.0")
```

---

## Datos de Cálculo (JSON)

El sistema guarda todos los valores intermedios en formato JSON para auditoría:

```json
{
  "demanda_promedio_diaria": 1802.43,
  "desviacion_estandar_diaria": 273.01,
  "periodo_reposicion_dias": 2.5,
  "nivel_servicio_z": 1.96,
  "multiplicador_demanda": 1.0,
  "multiplicador_ss": 1.0,
  "demanda_ciclo": 4505.0,
  "stock_seguridad": 846.0,
  "nivel_objetivo": 5351.0,
  "stock_actual": 3000.0,
  "inventario_en_transito": 0.0,
  "cantidad_sugerida": 2351.0,
  "matriz_abc_xyz": "AX",
  "metodo_calculo": "NORMAL",
  "timestamp": "2025-01-12T10:30:00Z"
}
```

Esto permite:
- Auditar cualquier cálculo histórico
- Detectar cambios en parámetros
- Explicar por qué se sugirió cierta cantidad
- Depurar errores en los cálculos

---

**Anterior:** [Introducción](01-INTRODUCCION.md)
**Siguiente:** [Parámetros ABC-XYZ](03-PARAMETROS_ABC_XYZ.md)
