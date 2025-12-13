---
sidebar_position: 4
title: Columnas de la Tabla
---

# Columnas de la Tabla de Productos

Descripción detallada de cada columna en la tabla de selección de productos Inter-CEDI.

## Grupos de Columnas

La tabla está organizada en 4 grupos visuales con colores distintivos:

| Grupo | Color | Columnas |
|-------|-------|----------|
| **Producto** | Gris | Checkbox, Origen, Código, Barras, Descripción, U/B, ABC |
| **Origen** | Amarillo | Stk Orig |
| **Stock Tiendas/CEDI** | Verde | Stk CCS, D.CCS, Stk Tda, D.Tda, P75 |
| **Pedido** | Violeta | Pri, Sugerido, A Pedir |

---

## Grupo: Producto (Gris)

### ☑️ Checkbox

Incluir/excluir producto del pedido.

- **Marcado**: Producto se incluirá en el pedido
- **Desmarcado**: Producto excluido (no se pedirá)

El checkbox principal en el header selecciona/deselecciona todos los productos de la página.

---

### Origen

CEDI de origen del producto.

| Badge | Significado |
|-------|-------------|
| 🟨 **Seco** | CEDI Valencia Seco |
| 🟦 **Frío** | CEDI Valencia Frío |
| 🟩 **Verde** | CEDI Valencia Verde |

**¿Cómo se asigna?**

Cada producto tiene un único CEDI origen basado en dónde existe inventario. Esto se determina automáticamente al analizar el inventario histórico de los CEDIs de Valencia.

---

### Código

Código interno del producto en el sistema.

Formato: 6 dígitos numéricos (ej: `004962`)

---

### Barras

Código de barras EAN-13 del producto.

Formato: 13 dígitos numéricos (ej: `7591234567890`)

Útil para escaneo rápido y verificación en bodega.

---

### Descripción

Nombre completo del producto.

Incluye:
- Nombre del producto
- Categoría (en segunda línea, texto pequeño)
- Marca (si existe)

**Ejemplo:**
```
HARINA PAN TRADICIONAL 1KG
Abarrotes · Marca PAN
```

---

### U/B (Unidades por Bulto)

Cantidad de unidades que contiene cada bulto.

**Importante:** Todas las cantidades sugeridas y pedidas se expresan en **bultos**, no en unidades.

| Ejemplo | Significado |
|---------|-------------|
| 20 | 1 bulto = 20 unidades |
| 24 | 1 bulto = 24 unidades |
| 1 | Se vende por unidad |

---

### ABC

Clasificación del producto por cantidad vendida en la región.

| Clase | Color | Ranking | Días Cobertura |
|-------|-------|---------|----------------|
| **A** | 🟢 Verde | Top 50 | 7 días |
| **B** | 🔵 Azul | 51-200 | 14 días |
| **C** | 🟡 Amarillo | 201-800 | 30 días |
| **D** | ⚪ Gris | +800 | 45 días |

**Click** en el badge para ver la matriz ABC completa.

---

## Grupo: Origen (Amarillo)

### Stk Orig (Stock CEDI Origen)

Stock disponible en el CEDI de Valencia que surtirá el producto.

**Formato:**
```
330 bultos
6,600u (unidades)
```

**Click** para abrir modal con:
- Historial de inventario
- Último movimiento
- Tendencia

**Interpretación:**
- Si es **bajo**, la cantidad sugerida puede estar **limitada**
- El sistema no sugiere más de lo disponible en origen

---

## Grupo: Stock Tiendas/CEDI Caracas (Verde)

### Stk CCS (Stock CEDI Caracas)

Stock actual en el CEDI destino (Caracas).

**Formato:**
```
125 bultos
2,500u (unidades)
```

Este es el stock que se compara contra Stock_Max para calcular la cantidad sugerida.

**Click** para ver:
- Historial de inventario del CEDI
- Gráfico de tendencia
- Stock mínimo y máximo

---

### D.CCS (Días de Stock CEDI Caracas)

Días de cobertura en el CEDI destino.

**Fórmula:**
```
D.CCS = Stock_CEDI_Caracas / P75_Regional
```

**Colores:**

| Días | Color | Estado |
|------|-------|--------|
| ≤ 3 | 🔴 Rojo | Crítico |
| 4-7 | 🟠 Naranja | Bajo |
| 8-14 | 🔵 Azul | Moderado |
| > 14 | 🟢 Verde | Suficiente |

**Click** para ver cálculo detallado.

---

### Stk Tda (Stock en Tiendas)

Stock total en todas las tiendas de la región.

**Formato:**
```
45 bultos
900u (unidades)
```

Es la **suma del stock** de todas las tiendas (Artigas + Paraíso + ...).

**Click** para ver desglose por tienda:

| Tienda | Stock |
|--------|-------|
| Artigas | 600 u |
| Paraíso | 300 u |
| **Total** | **900 u** |

---

### D.Tda (Días de Stock en Tiendas)

Días de cobertura del stock combinado de tiendas.

**Fórmula:**
```
D.Tda = Stock_Total_Tiendas / P75_Regional
```

**Interpretación:**

- Si **D.Tda es bajo** pero **D.CCS es alto**: Las tiendas están quedándose sin stock pero el CEDI tiene reservas. Verificar que los pedidos CEDI→Tienda estén funcionando.
- Si **ambos son bajos**: Urgente reponer desde Valencia.

**Colores:** Misma escala que D.CCS.

---

### P75 (Demanda Regional)

Percentil 75 de demanda diaria agregada de la región.

**Formato:**
```
45.50 bultos/día
910u (unidades/día)
```

**Click** para ver modal con:
- Historial de ventas últimos 30 días
- Gráfico por día
- Desglose por tienda
- P75 individual de cada tienda

**Ejemplo de desglose:**

| Tienda | P75 | % del Total |
|--------|-----|-------------|
| Artigas | 630 u/día | 69% |
| Paraíso | 280 u/día | 31% |
| **Regional** | **910 u/día** | 100% |

---

## Grupo: Pedido (Violeta)

### Pri (Prioridad)

Prioridad de reposición calculada (1-10).

**Formato:** Círculo con número

| Prioridad | Color | Significado |
|-----------|-------|-------------|
| 1-2 | 🔴 Rojo | Crítico |
| 3-4 | 🟠 Naranja | Alto |
| 5-6 | 🟡 Amarillo | Medio |
| 7-8 | 🔵 Azul | Bajo |
| 9-10 | ⚪ Gris | Mínimo |

**Click** para ver:
- Matriz completa de prioridades
- Cómo se calculó (ABC + Días Stock)
- Recomendación de acción

---

### Sugerido

Cantidad sugerida por el sistema en **bultos**.

**Fórmula simplificada:**
```
Sugerido = (Stock_Max - Stock_CEDI) / Unidades_Por_Bulto
```

**Click** para ver modal con:
- Fórmula completa paso a paso
- Stock de seguridad calculado
- Stock mínimo y máximo
- Si fue limitado por stock origen

**Indicadores:**

| Estado | Significado |
|--------|-------------|
| ✅ Stock suficiente | El CEDI origen tiene suficiente |
| ⚠️ Stock limitado | Se redujo la cantidad por falta de stock origen |

---

### A Pedir

Cantidad final a pedir en **bultos** (editable).

**Campo de entrada:** Número entero ≥ 0

- Por defecto tiene el valor de "Sugerido"
- El usuario puede modificarlo
- Valor 0 = No pedir este producto (equivale a desmarcar checkbox)

**Comportamiento:**
- Al cambiar, se recalculan los totales del pedido
- No hay límite superior (el usuario decide)
- Si se excede el stock origen, se muestra advertencia

---

## Ordenamiento

Todas las columnas con ícono ↕️ son ordenables:

| Columna | Ordenamiento Default |
|---------|---------------------|
| ABC | A → B → C → D |
| Stk Orig | Mayor → Menor |
| Stk CCS | Mayor → Menor |
| D.CCS | Menor → Mayor (críticos primero) |
| P75 | Mayor → Menor |
| Pri | Menor → Mayor (urgentes primero) |
| Sugerido | Mayor → Menor |

Click en el header para ordenar. Click de nuevo para invertir.

---

## Resumen de Clics

| Elemento | Acción al hacer click |
|----------|----------------------|
| Checkbox | Incluir/excluir producto |
| Origen badge | Ver detalle CEDI origen |
| Código | Copiar al portapapeles |
| Stk Orig | Modal stock CEDI origen |
| Stk CCS | Modal historial CEDI Caracas |
| D.CCS | Modal cálculo días stock |
| Stk Tda | Modal stock por tienda |
| D.Tda | Modal stock tiendas (mismo) |
| P75 | Modal historial ventas regional |
| Pri | Modal matriz de prioridad |
| Sugerido | Modal fórmula de cálculo |
| A Pedir | Editar cantidad |
