# Propuesta: Sistema de Distribución Inteligente Multi-Tienda

**Fecha:** Enero 2026
**Versión:** 1.0
**Estado:** Propuesta para aprobación

---

## Resumen Ejecutivo

Actualmente, cuando hacemos pedidos desde un CEDI hacia múltiples tiendas, **la tienda que pide primero se lleva la mercancía disponible**, dejando a las demás desabastecidas cuando hay escasez.

Esta propuesta presenta un **sistema de distribución justa** que:
- Calcula los pedidos de TODAS las tiendas simultáneamente
- Detecta productos con stock insuficiente
- Distribuye la mercancía de forma inteligente según demanda y urgencia
- Permite ajuste manual antes de confirmar

**Beneficio principal:** Ninguna tienda queda sistemáticamente desabastecida.

---

## El Problema Actual

### Escenario Real (Región Caracas)

| Tienda | Ventas Mensuales | % del Total |
|--------|------------------|-------------|
| ARTIGAS | Bs 672,000 | 73% |
| PARAÍSO | Bs 251,000 | 27% |

**Cuando ambas tiendas necesitan el mismo producto:**

```
CEDI Caracas tiene: 70 bultos de Harina PAN
├── ARTIGAS necesita: 80 bultos
└── PARAÍSO necesita: 30 bultos

Total necesidad: 110 bultos
Déficit: 40 bultos
```

### ¿Qué pasa hoy?

Si ARTIGAS hace el pedido primero:
- ARTIGAS recibe **70 bultos** (todo lo disponible)
- PARAÍSO recibe **0 bultos**

Si PARAÍSO hace el pedido primero:
- PARAÍSO recibe **30 bultos** (todo lo que necesita)
- ARTIGAS recibe **40 bultos** (parcial)

**Resultado:** El orden de los pedidos determina quién se abastece, no la necesidad real.

---

## La Solución: Distribución Proporcional por Demanda + Urgencia (DPD+U)

### Principio Fundamental

> Cuando no hay suficiente mercancía para todas las tiendas, distribuir según:
> - **60%** basado en la demanda histórica (quién vende más)
> - **40%** basado en la urgencia actual (quién tiene menos stock)

### ¿Por qué este balance?

| Factor | Peso | Justificación |
|--------|------|---------------|
| **Demanda (60%)** | Quién más vende | La tienda que más vende genera más ingresos. Darle más mercancía maximiza ventas totales. |
| **Urgencia (40%)** | Quién más necesita | Si una tienda está a punto de quedarse sin stock, priorizarla evita pérdida de ventas y clientes. |

---

## Ejemplo Práctico

### Producto: Harina PAN 1kg

**Situación:**
- Stock en CEDI: **70 bultos**
- Necesidad total: **110 bultos** (hay escasez)

| Tienda | Stock Actual | Días de Stock | Demanda/día | Necesita |
|--------|--------------|---------------|-------------|----------|
| ARTIGAS | 200 unidades | **4 días** | 50 u/día | 80 bultos |
| PARAÍSO | 15 unidades | **0.5 días** | 30 u/día | 30 bultos |

### Paso 1: Calcular Factor de Demanda

```
Demanda total = 50 + 30 = 80 unidades/día

ARTIGAS: 50/80 = 62.5%
PARAÍSO: 30/80 = 37.5%
```

### Paso 2: Calcular Factor de Urgencia

```
Urgencia = 1 / días de stock (más urgente = menos días)

ARTIGAS: 1/4.0 = 0.25
PARAÍSO: 1/0.5 = 2.00

Total urgencia = 0.25 + 2.00 = 2.25

ARTIGAS: 0.25/2.25 = 11%
PARAÍSO: 2.00/2.25 = 89%
```

### Paso 3: Combinar (60% demanda + 40% urgencia)

```
ARTIGAS: (62.5% × 0.6) + (11% × 0.4) = 37.5% + 4.4% = 42%
PARAÍSO: (37.5% × 0.6) + (89% × 0.4) = 22.5% + 35.6% = 58%
```

### Paso 4: Distribuir los 70 bultos disponibles

```
ARTIGAS recibe: 70 × 42% = 29 bultos
PARAÍSO recibe: 70 × 58% = 41 bultos
```

### Comparación de Resultados

| Método | ARTIGAS | PARAÍSO | Justicia |
|--------|---------|---------|----------|
| Primero que pide gana | 70 ó 40 | 0 ó 30 | Injusto |
| Solo por demanda | 44 | 26 | Ignora urgencia |
| **DPD + Urgencia** | **29** | **41** | Balanceado |

**Resultado:** PARAÍSO recibe más porque está en riesgo de quiebre (0.5 días), pero ARTIGAS sigue recibiendo una porción significativa.

---

## Escalabilidad: 14 Tiendas por Región

El algoritmo funciona igual con cualquier número de tiendas:

### Ejemplo Región Valencia (6 tiendas)

**Producto: Aceite Mazeite 1L**
**Stock CEDI Seco: 200 bultos**

| Tienda | Demanda/día | Días Stock | % Demanda | % Urgencia | % Final | Recibe |
|--------|-------------|------------|-----------|------------|---------|--------|
| BOSQUE | 40 | 1.0 | 33% | 25% | 30% | 60 |
| PERIFÉRICO | 25 | 0.5 | 21% | 50% | 32% | 64 |
| AV. BOLÍVAR | 20 | 3.0 | 17% | 8% | 13% | 26 |
| MAÑONGO | 15 | 2.0 | 13% | 13% | 13% | 26 |
| ISABELICA | 12 | 4.0 | 10% | 6% | 8% | 16 |
| TAZAJAL | 8 | 5.0 | 7% | 5% | 6% | 12 |
| **Total** | **120** | - | **100%** | **100%** | **100%** | **204** |

*Nota: Los totales se redondean, puede haber ±1 bulto de ajuste.*

---

## Flujo Propuesto en Fluxion

### Vista General (4 Pasos)

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Paso 1  │────▶│   Paso 2    │────▶│   Paso 3    │────▶│   Paso 4    │
│ Origen  │     │ Resolución  │     │  Revisar    │     │ Confirmar   │
│    y    │     │     de      │     │  Pedidos    │     │   Pedidos   │
│Destinos │     │ Conflictos  │     │  (por tab)  │     │             │
└─────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

### Paso 1: Seleccionar Origen y Destinos

El usuario selecciona:
- **CEDI origen** (ej: CEDI Caracas)
- **Tiendas destino** (múltiple selección, todas marcadas por defecto)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  CEDI Origen                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ CEDI Caracas                                    ▼   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Tiendas Destino                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☑ ARTIGAS                                           │   │
│  │ ☑ PARAÍSO                                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                              [Siguiente →]                  │
└─────────────────────────────────────────────────────────────┘
```

---

### Paso 2: Resolución de Conflictos

**Solo aparece si hay productos con stock insuficiente.**

El sistema:
1. Calcula el pedido sugerido para CADA tienda
2. Identifica productos donde `stock CEDI < suma de necesidades`
3. Aplica el algoritmo DPD+U
4. Muestra los conflictos para revisión/ajuste

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ⚠️ 23 productos requieren distribución entre tiendas                   │
│                                                                         │
│  Criterio: DPD + Urgencia (60/40)                                       │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ Producto         │ CEDI │ ARTIGAS        │ PARAÍSO        │       │ │
│  │                  │      │ Días │ Asigna │ Días │ Asigna  │       │ │
│  ├──────────────────┼──────┼──────┼────────┼──────┼─────────┼───────┤ │
│  │ Harina PAN 1kg   │  70  │ 4.0d │   29   │ 0.5d │   41    │[Edit] │ │
│  │ Arroz Mary 900g  │  50  │ 5.8d │   18   │ 0.3d │   32    │[Edit] │ │
│  │ Aceite 1L        │  45  │ 2.1d │   25   │ 1.8d │   20    │[Edit] │ │
│  │ ...              │      │      │        │      │         │       │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ✅ 847 productos sin conflicto (stock suficiente)                      │
│                                                                         │
│  [← Atrás]                                      [Siguiente →]           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Al hacer clic en [Edit]:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Harina PAN 1kg                                                         │
│  Stock CEDI: 70 bultos | Necesidad total: 110 bultos                    │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ Tienda   │ Stock │ Días │ Demanda │ Sugerido │     Asignado      │ │
│  ├──────────┼───────┼──────┼─────────┼──────────┼───────────────────┤ │
│  │ ARTIGAS  │  200  │ 4.0d │ 50/día  │    29    │ [   29   ] [-][+] │ │
│  │ PARAÍSO  │   15  │ 0.5d │ 30/día  │    41    │ [   41   ] [-][+] │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Total asignado: 70 / 70 disponibles                                    │
│                                                                         │
│  💡 PARAÍSO priorizado: solo tiene 0.5 días de stock                    │
│                                                                         │
│                                    [Cancelar]  [Aplicar Cambios]        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Paso 3: Revisar Pedidos (Vista con Tabs)

Cada tienda tiene su pestaña con el pedido completo:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌────────────────┬────────────────┐                                    │
│  │    ARTIGAS     │    PARAÍSO     │                                    │
│  │   (450 prod)   │   (380 prod)   │                                    │
│  └────────────────┴────────────────┘                                    │
│                                                                         │
│  Pedido ARTIGAS                                          Total: 8,500   │
│  ──────────────────────────────────────────────────────────────────     │
│                                                                         │
│  [Buscar producto...]                    Filtrar: [Todos ▼]             │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ ☑ │ Producto           │ ABC │ Stock │ Sugerido │ Pedido │       │ │
│  ├───┼────────────────────┼─────┼───────┼──────────┼────────┼───────┤ │
│  │ ☑ │ Harina PAN 1kg     │  A  │  200  │    29    │ [ 29 ] │ [...] │ │
│  │ ☑ │ Arroz Mary 900g    │  A  │  485  │    18    │ [ 18 ] │ [...] │ │
│  │ ☑ │ Leche Upaca 900g   │  B  │   29  │    45    │ [ 45 ] │ [...] │ │
│  │ ☐ │ Galletas Club...   │  C  │  120  │    12    │ [  0 ] │ [...] │ │
│  │ ...                                                               │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  [← Atrás]                                      [Siguiente →]           │
└─────────────────────────────────────────────────────────────────────────┘
```

**El usuario puede:**
- Alternar entre tiendas (tabs)
- Incluir/excluir productos
- Ajustar cantidades individuales
- Ver detalles de cada producto

---

### Paso 4: Confirmación Consolidada

Resumen de todos los pedidos antes de crear:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                    Resumen de Pedidos a Crear                           │
│                                                                         │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐      │
│  │      Pedido ARTIGAS         │  │      Pedido PARAÍSO         │      │
│  │                             │  │                             │      │
│  │  Productos:     450         │  │  Productos:     380         │      │
│  │  Total bultos:  8,500       │  │  Total bultos:  2,100       │      │
│  │  Peso aprox:    12,400 kg   │  │  Peso aprox:    3,200 kg    │      │
│  │                             │  │                             │      │
│  │  ⚠️ 18 productos ajustados  │  │  ⚠️ 18 productos ajustados  │      │
│  │     por escasez de stock    │  │     por escasez de stock    │      │
│  └─────────────────────────────┘  └─────────────────────────────┘      │
│                                                                         │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                      Totales Consolidados                         │ │
│  │                                                                   │ │
│  │  Pedidos a crear:    2                                            │ │
│  │  Productos únicos:   623                                          │ │
│  │  Total bultos:       10,600                                       │ │
│  │  Peso total:         15,600 kg                                    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  [← Atrás]                              [Crear Pedidos]                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Beneficios de la Solución

### Para las Tiendas

| Beneficio | Descripción |
|-----------|-------------|
| **Sin favoritismos** | El orden de pedidos no determina quién recibe mercancía |
| **Transparencia** | Cada tienda sabe exactamente por qué recibe X cantidad |
| **Protección contra quiebres** | Tiendas con poco stock son priorizadas |

### Para Operaciones

| Beneficio | Descripción |
|-----------|-------------|
| **Eficiencia** | Un solo proceso para múltiples tiendas |
| **Visibilidad** | Ver escasez antes de que cause problemas |
| **Control** | Ajuste manual cuando sea necesario |

### Para la Empresa

| Beneficio | Descripción |
|-----------|-------------|
| **Maximiza ventas** | Mercancía va donde más se vende |
| **Minimiza pérdidas** | Evita quiebres de stock |
| **Escalable** | Funciona igual con 2 o 14 tiendas |

---

## Parámetros Configurables

El sistema permite ajustar:

| Parámetro | Default | Descripción |
|-----------|---------|-------------|
| **Peso Demanda** | 60% | Qué tanto pesa la demanda histórica |
| **Peso Urgencia** | 40% | Qué tanto pesa la urgencia (días de stock) |
| **Días mínimo** | 0.5 días | Umbral para considerar "urgente" |

Estos valores pueden ajustarse por región o temporada según necesidad.

---

## Preguntas Frecuentes

### ¿Qué pasa si solo quiero hacer pedido a una tienda?

El flujo se simplifica automáticamente:
- Paso 2 (conflictos) se omite
- Se mantiene el flujo actual de 3 pasos

### ¿Y si no estoy de acuerdo con la distribución sugerida?

En el Paso 2, cada producto puede editarse manualmente. El sistema muestra la sugerencia, pero el usuario decide.

### ¿Esto retrasa el proceso de hacer pedidos?

No significativamente. El Paso 2 solo muestra ~20-50 productos con conflicto (no los 800+ del catálogo). La revisión toma ~5 minutos adicionales.

### ¿Qué pasa cuando tengamos 14 tiendas?

El algoritmo escala automáticamente. La fórmula funciona igual:
- Suma las demandas de las 14 tiendas
- Calcula urgencia de cada una
- Distribuye proporcionalmente

### ¿Se puede desactivar el sistema y volver al método anterior?

Sí. En el Paso 1, si selecciona solo UNA tienda, el flujo funciona exactamente como antes.

---

## Próximos Pasos

1. **Aprobación** de esta propuesta por la directiva
2. **Desarrollo** del nuevo flujo (estimado: 2 semanas)
3. **Prueba piloto** con Región Caracas (ARTIGAS + PARAÍSO)
4. **Ajustes** basados en feedback
5. **Despliegue** a todas las regiones

---

## Conclusión

El sistema de **Distribución Proporcional por Demanda + Urgencia (DPD+U)** resuelve el problema de distribución injusta cuando hay escasez de productos, manteniendo:

- **Simplicidad**: Fácil de entender y usar
- **Justicia**: Ninguna tienda queda sistemáticamente desabastecida
- **Flexibilidad**: Permite ajustes manuales
- **Escalabilidad**: Funciona con cualquier número de tiendas

**Recomendación:** Aprobar la implementación y comenzar prueba piloto con Región Caracas.

---

*Documento preparado por el equipo de Fluxion IA*
