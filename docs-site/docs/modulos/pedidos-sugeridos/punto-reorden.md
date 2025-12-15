---
sidebar_position: 3
title: Punto de Reorden
---

# Punto de Reorden (ROP)

El punto de reorden es el nivel de inventario que dispara la necesidad de generar un nuevo pedido.

## ¿Qué es el Punto de Reorden?

Es la cantidad mínima de stock que debes tener antes de hacer un nuevo pedido. Cuando el inventario llega a este nivel, es momento de ordenar.

## Fórmulas según Clase ABC

### Clase A y B (Método Estadístico)

```
ROP = (P75 × Lead Time) + Stock de Seguridad
```

Donde:
- **P75** = Percentil 75 de ventas diarias (no promedio simple)
- **Lead Time** = 1.5 días por defecto
- **Stock de Seguridad** = Z × σ × √L

### Clase C (Metodo Estadistico)

```
ROP = (P75 × Lead Time) + Stock de Seguridad
```

Donde Z = 1.28 (90% nivel servicio).

### Clase D (Metodo Padre Prudente)

```
ROP = (Demanda Maxima × Lead Time) + Stock de Seguridad
SS = 0.30 × P75 × Lead Time
```

Usa un enfoque conservador para productos de baja rotacion.

## ¿Por qué usamos P75 en lugar de Promedio?

El promedio simple tiene un problema:

```
Ventas diarias: [2, 3, 2, 15, 3, 2, 3]
Promedio = 4.29 unidades/día
```

Si planificamos con 4.29, el día que vendemos 15 **nos quedamos sin stock**.

El P75 significa: "El 75% de los días, la venta fue igual o menor a este valor". Esto nos protege mejor contra picos de demanda sin ser tan extremo como usar el máximo.

## Ejemplos Reales de Producción

### Ejemplo 1: Producto Clase A (Harina PAN 1kg)

**Datos reales** (tienda_17 Artigas, 2025-12-07):
| Campo | Valor |
|-------|-------|
| Código | 004962 |
| P75 | 630 unid/día |
| σ (desv. estándar) | ~166 unid |
| Lead Time | 1.5 días |
| Z (Clase A, 99%) | 2.33 |

**Cálculo:**
```
1. Stock de Seguridad
   SS = Z × σ × √L
   SS = 2.33 × 166 × √1.5
   SS = 2.33 × 166 × 1.22
   SS = 509.41 unidades

2. Punto de Reorden
   ROP = (P75 × L) + SS
   ROP = (630 × 1.5) + 509.41
   ROP = 945 + 509.41
   ROP = 1,454.41 unidades
```

**Resultado:** Cuando el stock llegue a **1,454 unidades**, pedir más.

---

### Ejemplo 2: Producto Clase B (Salsa de Ajo Granja)

**Datos reales:**
| Campo | Valor |
|-------|-------|
| Codigo | 002237 |
| P75 | 21.50 unid/dia |
| σ | ~8.8 unid |
| Lead Time | 1.5 dias |
| Z (Clase B, 97%) | 1.88 |

**Calculo:**
```
1. Stock de Seguridad
   SS = 1.88 × 8.8 × √1.5
   SS = 1.88 × 8.8 × 1.22
   SS = 20.18 unidades

2. Punto de Reorden
   ROP = (21.50 × 1.5) + 20.18
   ROP = 32.25 + 20.18
   ROP = 52.43 unidades
```

**Resultado:** Pedir cuando stock llegue a **52 unidades**.

---

### Ejemplo 3: Producto Clase C (Afeitadora Dorco)

**Datos reales:**
| Campo | Valor |
|-------|-------|
| Código | 004924 |
| P75 | 22 unid/día |
| Demanda Máxima | ~35 unid/día |
| Lead Time | 1.5 días |

**Cálculo (Método Padre Prudente):**
```
1. Stock de Seguridad (simplificado)
   SS = 0.20 × P75 × L
   SS = 0.20 × 22 × 1.5
   SS = 6.6 unidades

2. Punto de Reorden
   ROP = (D_max × L) + SS
   ROP = (35 × 1.5) + 6.6
   ROP = 52.5 + 6.6
   ROP = ~52.50 unidades
```

**Resultado:** Pedir cuando stock llegue a **52 unidades**.

## Stock de Seguridad por Clasificacion

| Clase | Ranking | Factor Z | Nivel Servicio | Dias Cobertura |
|-------|---------|----------|----------------|----------------|
| **A** | Top 50 | 2.33 | 99% | 7 dias |
| **B** | 51-200 | 1.88 | 97% | 14 dias |
| **C** | 201-800 | 1.28 | 90% | 21 dias |
| **D** | 801+ | Padre Prudente | ~85% | 30 dias |

## Visualización en la UI

En el módulo de Pedidos Sugeridos puedes ver:

| Columna | Descripción |
|---------|-------------|
| **STK** | Stock actual en tienda |
| **ROP** | Punto de reorden calculado |
| **SS** | Stock de seguridad |
| **MAX** | Stock máximo objetivo |
| **ABC** | Clasificación del producto |

### Estados de Criticidad

| Color | Condición | Acción |
|-------|-----------|--------|
| 🔴 Rojo | Stock ≤ SS | **Crítico** - Pedir urgente |
| 🟠 Naranja | SS < Stock ≤ ROP | **Urgente** - Preparar pedido |
| 🟢 Verde | ROP < Stock ≤ MAX | **Óptimo** - No requiere pedido |
| 🟣 Morado | Stock > MAX | **Exceso** - Posible sobrestock |

## Configuracion

Ajusta los parametros en **Administrador > Parametros ABC**:

- Lead time por defecto (1.5 dias)
- Umbrales de ranking (50, 200, 800)
- Z-scores por clase (2.33, 1.88, 1.28)
- Dias de cobertura por clase A, B, C, D
- Niveles de servicio objetivo

## Aprende Más

- [Stock de Seguridad](/conceptos/stock-seguridad)
- [Clasificación ABC](/conceptos/clasificacion-abc)
