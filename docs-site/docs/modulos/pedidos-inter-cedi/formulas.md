---
sidebar_position: 3
title: Fórmulas Detalladas
---

# Fórmulas de Cálculo Inter-CEDI

Este documento detalla todas las fórmulas utilizadas en el sistema de Pedidos Inter-CEDI.

## 1. Demanda Regional P75

La demanda regional es la **suma de los P75 individuales** de cada tienda de la región:

```
P75_Regional = Σ P75(tienda_i) para todas las tiendas de la región
```

### ¿Por qué suma y no promedio?

El CEDI debe abastecer a **todas** las tiendas simultáneamente, no a una "tienda promedio". Si Artigas vende 630 unidades/día y Paraíso vende 280 unidades/día, el CEDI debe tener capacidad para 910 unidades/día, no 455.

### Cálculo del P75 por Tienda

Para cada tienda, el P75 se calcula sobre los últimos 30 días:

```sql
P75_Tienda = PERCENTILE_CONT(0.75) de ventas_diarias_tienda
```

El percentil 75 significa: "el 75% de los días, la venta fue igual o menor a este valor".

### Ejemplo

| Tienda | Ventas últimos 30 días | P75 |
|--------|------------------------|-----|
| Artigas | [500, 520, 630, 700, 450, ...] | 630 |
| Paraíso | [200, 280, 310, 250, ...] | 280 |
| **Regional** | - | **910** |

---

## 2. Variabilidad Regional (σ)

La variabilidad regional se calcula como la **raíz de la suma de varianzas**:

```
σ_regional = √(σ₁² + σ₂² + ... + σₙ²)
```

Donde σᵢ es la desviación estándar de las ventas diarias de cada tienda.

### Aproximación Simplificada

Cuando no hay suficientes datos históricos, el sistema usa:

```
σ_regional ≈ P75_Regional × 0.30
```

Esta aproximación asume un 30% de variabilidad, que es conservadora para distribución minorista.

---

## 3. Stock de Seguridad en CEDI

El stock de seguridad protege contra variaciones de demanda durante el tiempo de entrega:

```
SS_CEDI = Z × σ_regional × √Lead_Time
```

### Z-Scores por Clase ABC

| Clase | Z | Nivel Servicio | Probabilidad de No-Quiebre |
|-------|---|----------------|---------------------------|
| **A** | 2.33 | 99% | 99 de cada 100 ciclos sin faltante |
| **B** | 1.88 | 97% | 97 de cada 100 ciclos sin faltante |
| **C** | 1.28 | 90% | 90 de cada 100 ciclos sin faltante |
| **D** | 0 | ~85% | Método Padre Prudente |

### Ejemplo Clase A

```
Datos:
- σ_regional = 273 unidades
- Lead_Time = 2 días
- Z (Clase A) = 2.33

Cálculo:
SS = 2.33 × 273 × √2
SS = 2.33 × 273 × 1.414
SS = 899 unidades
```

### Método Padre Prudente (Clase D)

Para productos Clase D, en lugar del método estadístico, usamos:

```
SS_D = max(0.30 × P75_Regional × Lead_Time, SS_estadístico)
```

Esto garantiza un mínimo de 30% de la demanda durante el ciclo como colchón.

---

## 4. Punto de Reorden (Stock Mínimo)

El punto de reorden indica cuándo se debe hacer un pedido:

```
Stock_Min = Demanda_Ciclo + Stock_Seguridad
Stock_Min = (P75_Regional × Lead_Time) + SS_CEDI
```

### Ejemplo

```
P75_Regional = 910 unid/día
Lead_Time = 2 días
SS = 899 unidades

Stock_Min = (910 × 2) + 899
Stock_Min = 1,820 + 899
Stock_Min = 2,719 unidades
```

**Interpretación:** Cuando el stock del CEDI Caracas llegue a 2,719 unidades, se debe generar un pedido.

---

## 5. Stock Máximo

El stock máximo es el nivel objetivo después de recibir un pedido:

```
Stock_Max = Stock_Min + Demanda_Cobertura
Stock_Max = Stock_Min + (P75_Regional × Días_Cobertura)
```

### Días de Cobertura por Clase ABC

| Clase | Días | Razón |
|-------|------|-------|
| **A** | 7 | Alta rotación, pedidos frecuentes |
| **B** | 14 | Rotación media |
| **C** | 30 | Baja rotación, menos pedidos |
| **D** | 45 | Muy baja rotación |

### Ejemplo Clase A

```
Stock_Min = 2,719 unidades
P75_Regional = 910 unid/día
Días_Cobertura = 7 días

Stock_Max = 2,719 + (910 × 7)
Stock_Max = 2,719 + 6,370
Stock_Max = 9,089 unidades
```

---

## 6. Cantidad Sugerida

La cantidad a pedir se calcula como:

```
Cantidad_Ideal = max(0, Stock_Max - Stock_Actual_CEDI)
```

### Limitación por Stock Origen

Si el CEDI origen no tiene suficiente inventario:

```
Cantidad_Sugerida = min(Cantidad_Ideal, Stock_CEDI_Origen)
```

### Conversión a Bultos

```
Bultos = ceil(Cantidad_Sugerida / Unidades_Por_Bulto)
```

Se redondea **hacia arriba** porque siempre se piden bultos completos.

### Ejemplo Completo

```
Stock_Max = 9,089 unidades
Stock_Actual_CEDI = 2,500 unidades
Stock_CEDI_Origen = 15,000 unidades
Unidades_Por_Bulto = 20

1. Cantidad Ideal
   Ideal = 9,089 - 2,500 = 6,589 unidades

2. Verificar stock origen
   6,589 < 15,000 ✓ (hay suficiente)
   Sugerido = 6,589 unidades

3. Convertir a bultos
   Bultos = ceil(6,589 / 20) = ceil(329.45) = 330 bultos
```

---

## 7. Días de Stock

Para calcular cuántos días de inventario quedan:

```
Días_Stock = Stock_Actual / Demanda_Diaria
Días_Stock = Stock_Actual / P75_Regional
```

### Estados por Días de Stock

| Días | Estado | Color |
|------|--------|-------|
| ≤ 3 | Crítico | 🔴 Rojo |
| 4-7 | Bajo | 🟠 Naranja |
| 8-14 | Moderado | 🟡 Amarillo |
| > 14 | Suficiente | 🟢 Verde |

---

## 8. Matriz de Prioridad

La prioridad combina **Clase ABC** (importancia del producto) con **Días de Stock** (urgencia):

### Matriz de Valores

```
         Días Stock
         ≤3   4-7  8-14  >14
ABC  A   1    2    4     7
     B   3    5    6     8
     C   5    7    8     9
     D   6    8    9     10
```

### Cálculo

```python
abcIndex = {'A': 0, 'B': 1, 'C': 2, 'D': 3}[clase]
diasIndex = 0 si dias <= 3
            1 si dias <= 7
            2 si dias <= 14
            3 si dias > 14

prioridad = MATRIZ[abcIndex][diasIndex]
```

### Interpretación

| Prioridad | Urgencia | Acción |
|-----------|----------|--------|
| 1-2 | Crítica | Pedir inmediatamente |
| 3-4 | Alta | Incluir en próximo pedido |
| 5-6 | Media | Planificar para la semana |
| 7-8 | Baja | Puede esperar |
| 9-10 | Mínima | No urgente |

### Ejemplo

```
Producto: Harina PAN
Clase: A (índice 0)
Días Stock: 5 días (índice 1: entre 4-7)

Prioridad = MATRIZ[0][1] = 2 (Crítica)
```

---

## 9. Regla de Pedido

La lógica completa de decisión es:

```
SI Stock_Actual ≤ Stock_Min:
    Pedir = Stock_Max - Stock_Actual
    Pedir_Final = min(Pedir, Stock_Origen)
    Bultos = ceil(Pedir_Final / Unidades_Por_Bulto)
SINO:
    No pedir (stock suficiente)
```

---

## Resumen de Fórmulas

| Variable | Fórmula |
|----------|---------|
| **P75 Regional** | Σ P75(tienda) |
| **σ Regional** | √(Σ σ²) o P75 × 0.30 |
| **Stock Seguridad** | Z × σ × √Lead_Time |
| **Stock Mínimo** | (P75 × Lead_Time) + SS |
| **Stock Máximo** | Stock_Min + (P75 × Días_Cobertura) |
| **Cantidad Sugerida** | max(0, Stock_Max - Stock_Actual) |
| **Días Stock** | Stock_Actual / P75 |
| **Prioridad** | MATRIZ[ABC][Días] |

---

## Constantes del Sistema

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| Lead Time Valencia→Caracas | 2 días | Tiempo de entrega |
| Variabilidad default | 30% | CV estimado de demanda |
| Z Clase A | 2.33 | Nivel servicio 99% |
| Z Clase B | 1.88 | Nivel servicio 97% |
| Z Clase C | 1.28 | Nivel servicio 90% |
| Días Cobertura A | 7 días | Configurable |
| Días Cobertura B | 14 días | Configurable |
| Días Cobertura C | 30 días | Configurable |
| Días Cobertura D | 45 días | Configurable |
