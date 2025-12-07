---
sidebar_position: 3
title: Parámetros ABC
---

# Configuración de Parámetros del Modelo ABC

Esta página te permite configurar todos los parámetros que controlan cómo el sistema calcula Stock de Seguridad, Punto de Reorden y Stock Máximo.

## Acceso

**Administrador > Parámetros ABC**

La configuración está organizada en 3 pestañas:
1. **Parámetros Globales** - Lead Time y Ventana σD
2. **Niveles de Servicio** - Z-scores y días de cobertura por clase
3. **Por Tienda** - Configuraciones específicas por tienda

---

## 1. Parámetros Globales

### Lead Time (L)

**¿Qué es?** El tiempo en días desde que haces un pedido hasta que llega la mercancía.

| Parámetro | Default | Unidad |
|-----------|---------|--------|
| **Lead Time** | 1.5 | días |

**¿Cómo afecta los cálculos?**

El Lead Time aparece en dos fórmulas críticas:

```
Stock de Seguridad (SS) = Z × σD × √L
Punto de Reorden (ROP) = (P75 × L) + SS
```

### Ejemplo: Efecto de cambiar Lead Time

**Producto:** Harina PAN 1kg (Clase A)
- P75 = 630 unid/día
- σD = 166 unid
- Z = 2.33 (Clase A, 99%)

| Lead Time | SS Calculado | ROP Calculado | Impacto |
|-----------|--------------|---------------|---------|
| **L = 1.5** (default) | 2.33 × 166 × √1.5 = **474** | (630 × 1.5) + 474 = **1,419** | Base |
| **L = 2.0** | 2.33 × 166 × √2.0 = **548** | (630 × 2.0) + 548 = **1,808** | +27% ROP |
| **L = 3.0** | 2.33 × 166 × √3.0 = **670** | (630 × 3.0) + 670 = **2,560** | +80% ROP |
| **L = 1.0** | 2.33 × 166 × √1.0 = **387** | (630 × 1.0) + 387 = **1,017** | -28% ROP |

**¿Cuándo ajustar?**
- **Aumentar** si los pedidos tardan más en llegar (ej: proveedores lejanos, problemas logísticos)
- **Disminuir** si tienes entregas más rápidas (ej: CEDI cercano)

---

### Ventana σD (días)

**¿Qué es?** El número de días históricos que el sistema usa para calcular la desviación estándar (σD) de la demanda.

| Parámetro | Default | Unidad |
|-----------|---------|--------|
| **Ventana σD** | 30 | días |

**¿Cómo afecta los cálculos?**

La desviación estándar mide qué tan variable es la demanda diaria. Una ventana más larga considera más historia.

```
σD = Desviación estándar de ventas de los últimos N días
```

### Ejemplo: Efecto de cambiar Ventana σD

**Producto:** Azúcar Doce Día 1kg

Supongamos estas ventas diarias en distintos períodos:

| Ventana | Datos considerados | σD Resultante | SS (Z=2.33, L=1.5) |
|---------|-------------------|---------------|-------------------|
| **30 días** (default) | Incluye mes completo con promociones | σD = 95 | 2.33 × 95 × 1.22 = **270** |
| **15 días** | Solo semanas recientes (estables) | σD = 45 | 2.33 × 45 × 1.22 = **128** |
| **60 días** | 2 meses (más ruido, eventos pasados) | σD = 120 | 2.33 × 120 × 1.22 = **341** |

**¿Cuándo ajustar?**
- **Aumentar (45-60 días)**: Para capturar patrones estacionales o eventos mensuales
- **Disminuir (15-20 días)**: Para productos con demanda muy estable o cuando quieres reaccionar rápido a cambios

---

## 2. Niveles de Servicio

> **Niveles de Servicio:** Define qué porcentaje de demanda quieres poder satisfacer. Mayor nivel = más stock de seguridad = menos roturas de stock.

### Configuración por Clase ABC

Cada clase tiene su propio nivel de servicio:

| Clase | Nivel Servicio | Z-Score | Días Cobertura MAX | Método |
|-------|----------------|---------|-------------------|--------|
| **Clase A** | 99% - Muy alto - Productos críticos | 2.33 (calculado) | 7 | Estadístico |
| **Clase B** | 97% - Alto - Productos importantes | 1.65 (calculado) | 14 | Estadístico |
| **Clase C** | N/A | N/A | 30 | Padre Prudente |

> **Nota:** Clase C usa método "Padre Prudente" (heurístico), no requiere nivel de servicio estadístico.

### Z-Score (Factor de Seguridad)

**¿Qué es?** Un multiplicador estadístico que determina cuánta protección adicional queremos contra variabilidad.

```
Stock de Seguridad (SS) = Z × σD × √L
```

| Z-Score | Nivel Servicio | Significado |
|---------|----------------|-------------|
| 2.33 | 99% | 1 de cada 100 días podría haber quiebre |
| 1.88 | 97% | 3 de cada 100 días podría haber quiebre |
| 1.65 | 95% | 5 de cada 100 días podría haber quiebre |
| 1.28 | 90% | 10 de cada 100 días podría haber quiebre |

### Ejemplo: Efecto de cambiar Z-Score (Clase A)

**Producto:** Harina PAN 1kg
- σD = 166 unid
- L = 1.5 días

| Z-Score | Nivel Servicio | SS Calculado | Impacto en Inventario |
|---------|----------------|--------------|----------------------|
| 2.33 (Clase A) | 99% | 2.33 × 166 × 1.22 = **472** | Base |
| 2.58 | 99.5% | 2.58 × 166 × 1.22 = **523** | +11% más inventario |
| 1.65 (Clase B) | 97% | 1.65 × 166 × 1.22 = **335** | -29% menos inventario |
| 1.28 | 90% | 1.28 × 166 × 1.22 = **259** | -45% menos inventario |

**¿Cuándo ajustar?**
- **Aumentar Z**: Productos críticos donde NUNCA debe faltar (generadores de tráfico)
- **Disminuir Z**: Productos con menor impacto en ventas o cuando el capital es limitado

---

### Días de Cobertura MAX

**¿Qué es?** Cuántos días de demanda debe cubrir el Stock Máximo después de llegar al ROP.

```
Stock Máximo (MAX) = ROP + (P75 × Días Cobertura)
```

| Clase | Días Default | Razonamiento |
|-------|--------------|--------------|
| **A** | 7 días | Alta rotación, pedidos frecuentes |
| **B** | 14 días | Rotación media |
| **C** | 30 días | Baja rotación, pedir menos frecuente |

### Ejemplo: Efecto de cambiar Días de Cobertura (Clase A)

**Producto:** Harina PAN 1kg (P75 = 630 unid/día, ROP = 1,454)

| Días Cobertura | MAX Calculado | Cantidad a Pedir | Impacto |
|----------------|---------------|------------------|---------|
| **7 días** (default) | 1,454 + (630 × 7) = **5,864** | Hasta 5,864 unid | Base |
| **5 días** | 1,454 + (630 × 5) = **4,604** | Hasta 4,604 unid | -21% menos capital |
| **10 días** | 1,454 + (630 × 10) = **7,754** | Hasta 7,754 unid | +32% más capital |
| **3 días** | 1,454 + (630 × 3) = **3,344** | Hasta 3,344 unid | -43% menos capital |

**¿Cuándo ajustar?**
- **Aumentar días**: Si quieres hacer pedidos menos frecuentes (ahorra logística)
- **Disminuir días**: Si tienes poco espacio o capital limitado

---

### Método de Cálculo

| Método | Clases | Descripción |
|--------|--------|-------------|
| **Estadístico** | A, B | Usa Z-score y desviación estándar |
| **Padre Prudente** | C | Usa demanda máxima histórica en lugar de P75 |

**¿Por qué Padre Prudente para Clase C?**

Productos Clase C tienen pocas ventas y alta variabilidad. El método estadístico puede dar resultados inestables. "Padre Prudente" asume el peor escenario (demanda máxima) para evitar quiebres.

```
Clase C - ROP = (Demanda Máxima × L) + SS simplificado
```

---

## 3. Configuración Por Tienda

> **Configuración por Tienda:** Sobrescribe los valores globales para tiendas específicas. Deja en blanco para usar el valor global.

### Cómo Agregar Configuración

1. Selecciona la tienda en el dropdown "Agregar configuración para tienda"
2. Completa los campos que quieras sobrescribir
3. Deja en blanco los campos que deben usar el valor global
4. Click en **Guardar**

### Campos Disponibles

| Campo | Descripción | Si está en blanco |
|-------|-------------|-------------------|
| **Lead Time Override** | Lead Time específico para esta tienda | Usa el global (1.5) |
| **Días Cobertura A** | Días cobertura para Clase A | Usa el global (7) |
| **Días Cobertura B** | Días cobertura para Clase B | Usa el global (14) |
| **Días Cobertura C** | Días cobertura para Clase C | Usa el global (30) |
| **Activo** | Si esta configuración está habilitada | - |

### Ejemplo Real: Tienda PARAÍSO

Configuración actual en producción:

| Campo | Valor | vs Global |
|-------|-------|-----------|
| Lead Time Override | 1.5 | Igual al global |
| Días Cobertura A | **2** | Global = 7 → **-71%** |
| Días Cobertura B | **4** | Global = 14 → **-71%** |
| Días Cobertura C | **8** | Global = 30 → **-73%** |

**¿Por qué estos valores?** PARAÍSO es una tienda nueva con espacio limitado y cercanía al CEDI. Los días de cobertura reducidos significan:
- Pedidos más pequeños (menos capital invertido)
- Pedidos más frecuentes (mejor rotación)
- Menor riesgo de exceso de inventario

### Impacto en Cálculos: PARAÍSO vs Tienda Normal

**Producto:** Harina PAN 1kg (Clase A, P75 = 630 unid/día, ROP = 1,454)

| Configuración | Días Cob. A | MAX Calculado | Cantidad Máxima |
|---------------|-------------|---------------|-----------------|
| **Global** | 7 días | 1,454 + (630 × 7) = **5,864** | 5,864 unidades |
| **PARAÍSO** | 2 días | 1,454 + (630 × 2) = **2,714** | 2,714 unidades |

**Diferencia:** PARAÍSO pide **54% menos** cantidad máxima para el mismo producto.

### Ejemplo: Tienda Lejana (Valencia)

Si una tienda está más lejos del CEDI y los pedidos tardan 3 días en llegar:

| Parámetro | Global | Override Valencia |
|-----------|--------|-------------------|
| Lead Time Override | 1.5 días | **3.0 días** |
| Días Cobertura A | 7 días | (en blanco = usa 7) |
| Días Cobertura B | 14 días | (en blanco = usa 14) |
| Días Cobertura C | 30 días | (en blanco = usa 30) |

**Resultado:** Solo el Lead Time cambia → SS y ROP más altos para compensar el mayor tiempo de entrega.

---

## Impacto de Cambios: Resumen Visual

### Aumentar Lead Time

```
Lead Time ↑ → √L ↑ → SS ↑ → ROP ↑ → Más inventario de seguridad
                    → (P75 × L) ↑ → ROP ↑ → Pedidos disparan antes
```

### Aumentar Z-Score

```
Z-Score ↑ → SS ↑ → ROP ↑ → Más protección contra variabilidad
                        → Mayor inversión en inventario
```

### Aumentar Días de Cobertura

```
Días Cob. ↑ → MAX ↑ → Pedidos más grandes pero menos frecuentes
                    → Mayor inversión en inventario
```

---

## Ejemplo Completo: Comparación de Escenarios

**Producto:** Harina PAN 1kg
- P75 = 630 unid/día
- σD = 166 unid
- Stock Actual = -1,071 (deuda)

### Escenario 1: Configuración Default

| Parámetro | Valor |
|-----------|-------|
| Lead Time | 1.5 |
| Z-Score (A) | 2.33 |
| Días Cob. (A) | 7 |

```
SS = 2.33 × 166 × √1.5 = 472 unidades
ROP = (630 × 1.5) + 472 = 1,417 unidades
MAX = 1,417 + (630 × 7) = 5,827 unidades

Déficit = 5,827 - (-1,071) = 6,898 unidades
Bultos = ceil(6,898 / 20) = 345 bultos
```

### Escenario 2: Lead Time Mayor (Tienda lejana)

| Parámetro | Valor |
|-----------|-------|
| Lead Time | **3.0** |
| Z-Score (A) | 2.33 |
| Días Cob. (A) | 7 |

```
SS = 2.33 × 166 × √3.0 = 670 unidades (+42%)
ROP = (630 × 3.0) + 670 = 2,560 unidades (+81%)
MAX = 2,560 + (630 × 7) = 6,970 unidades (+20%)

Déficit = 6,970 - (-1,071) = 8,041 unidades
Bultos = ceil(8,041 / 20) = 403 bultos (+17%)
```

### Escenario 3: Menos Días de Cobertura (Capital limitado)

| Parámetro | Valor |
|-----------|-------|
| Lead Time | 1.5 |
| Z-Score (A) | 2.33 |
| Días Cob. (A) | **4** |

```
SS = 2.33 × 166 × √1.5 = 472 unidades (igual)
ROP = (630 × 1.5) + 472 = 1,417 unidades (igual)
MAX = 1,417 + (630 × 4) = 3,937 unidades (-32%)

Déficit = 3,937 - (-1,071) = 5,008 unidades
Bultos = ceil(5,008 / 20) = 251 bultos (-27%)
```

### Escenario 4: Si fuera Clase B en lugar de Clase A

| Parámetro | Valor |
|-----------|-------|
| Lead Time | 1.5 |
| Z-Score | **1.65** (Clase B, 97%) |
| Días Cob. | **14** (Clase B) |

```
SS = 1.65 × 166 × √1.5 = 335 unidades (-29% vs Clase A)
ROP = (630 × 1.5) + 335 = 1,280 unidades (-10%)
MAX = 1,280 + (630 × 14) = 10,100 unidades (+73%)

Déficit = 10,100 - (-1,071) = 11,171 unidades
Bultos = ceil(11,171 / 20) = 559 bultos (+62%)
```

> **Nota:** Clase B tiene menor SS pero mayor cobertura, lo que resulta en pedidos más grandes pero menos frecuentes.

### Escenario 5: Tienda PARAÍSO (Override de días cobertura)

| Parámetro | Valor |
|-----------|-------|
| Lead Time | 1.5 (igual al global) |
| Z-Score (A) | 2.33 |
| Días Cob. (A) | **2** (override PARAÍSO) |

```
SS = 2.33 × 166 × √1.5 = 472 unidades (igual)
ROP = (630 × 1.5) + 472 = 1,417 unidades (igual)
MAX = 1,417 + (630 × 2) = 2,677 unidades (-54% vs global)

Déficit = 2,677 - (-1,071) = 3,748 unidades
Bultos = ceil(3,748 / 20) = 188 bultos (-45% vs global)
```

> **Resultado:** PARAÍSO pide casi la mitad de bultos que una tienda con configuración global, manteniendo el mismo nivel de protección (SS igual).

---

## Recomendaciones

### ¿Con qué frecuencia cambiar parámetros?

| Frecuencia | Parámetro | Razón |
|------------|-----------|-------|
| Rara vez | Lead Time | Solo si cambia la logística |
| Trimestral | Niveles de Servicio | Evaluar balance servicio/costo |
| Según necesidad | Por Tienda | Cuando hay cambios operativos |

### Errores Comunes

| Error | Consecuencia | Solución |
|-------|--------------|----------|
| Lead Time muy bajo | Quiebres frecuentes | Medir tiempo real de entregas |
| Z-Score muy alto en todo | Sobreinventario | Reservar Z alto solo para Clase A |
| Días Cobertura iguales para todo | Capital desperdiciado | Usar valores diferenciados por ABC |

### Mejores Prácticas

1. **Medir antes de cambiar** - Conoce tu Lead Time real
2. **Cambios graduales** - Ajusta 10-20% y evalúa
3. **Evaluar impacto** - Revisa quiebres y excesos después de cambios
4. **Documentar razones** - El sistema guarda historial de cambios

---

## Historial de Cambios

El sistema registra automáticamente:
- Quién cambió cada parámetro
- Cuándo se hizo el cambio
- Valores anteriores y nuevos

---

## Aprende Más

- [Punto de Reorden](/modulos/pedidos-sugeridos/punto-reorden) - Fórmulas detalladas
- [Crear Pedido](/modulos/pedidos-sugeridos/crear-pedido) - Ejemplos con datos reales
- [Clasificación ABC](/modulos/productos/clasificacion-abc) - Cómo se clasifican los productos
