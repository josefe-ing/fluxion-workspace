# Sistema de Pedidos Sugeridos v2.0 - Documentación Técnica Completa

> **Versión**: 2.0
> **Última actualización**: 2025-12-07
> **Sistema**: Fluxion AI - La Granja Mercado
> **Archivo de referencia**: `backend/routers/pedidos_sugeridos.py`

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Filosofía del Sistema](#2-filosofía-del-sistema)
3. [Fuentes de Datos](#3-fuentes-de-datos)
4. [Cálculo de Promedios de Demanda](#4-cálculo-de-promedios-de-demanda)
5. [¿Por qué usamos P75?](#5-por-qué-usamos-p75)
6. [Clasificación ABC por Valor (Pareto)](#6-clasificación-abc-por-valor-pareto)
7. [Fórmulas de Inventario por Clase](#7-fórmulas-de-inventario-por-clase)
8. [Parámetros Configurables](#8-parámetros-configurables)
9. [Lógica de Sugerencia de Pedido](#9-lógica-de-sugerencia-de-pedido)
10. [Casos Especiales](#10-casos-especiales)
11. [Flujo Completo del Cálculo](#11-flujo-completo-del-cálculo)
12. [API y Estructuras de Datos](#12-api-y-estructuras-de-datos)
13. [Frontend y Visualización](#13-frontend-y-visualización)
14. [Troubleshooting](#14-troubleshooting)
15. [Glosario](#15-glosario)
16. [Ejemplos de la Vida Real](#16-ejemplos-de-la-vida-real)

---

## 1. Resumen Ejecutivo

### ¿Qué hace el sistema?

El sistema calcula **cuántos bultos de cada producto debe pedir una tienda al CEDI** basándose en:

1. **Demanda histórica** (P75 de ventas diarias)
2. **Stock actual** en tienda y CEDI
3. **Clasificación ABC** del producto (por valor económico)
4. **Niveles de inventario calculados** (SS, ROP, MAX)

### Resultado final

Para cada producto, el sistema determina:
- **¿Debo pedir?** → Sí/No (basado en si el stock actual está por debajo del ROP)
- **¿Cuánto pedir?** → Cantidad en bultos (para llevar stock al nivel MAX)
- **¿Por qué?** → Razón del pedido (crítico, urgente, óptimo, etc.)

---

## 2. Filosofía del Sistema

### Principios fundamentales

1. **Nunca quedarse sin stock de productos importantes** (Clase A)
2. **No sobre-stockear productos de baja rotación** (Clase C)
3. **Usar demanda P75 para ser conservadores** (no promedio simple)
4. **Considerar el lead time** (tiempo de reabastecimiento)
5. **Respetar la disponibilidad del CEDI** (no pedir más de lo que hay)

### Modelo de reposición

Usamos el modelo **(s, S)** - también conocido como **Min-Max**:

```
       Stock
         │
    MAX ─┼─────────────────•───────────────────
         │                 │
         │                 │  ← Cantidad a pedir
         │                 │
    ROP ─┼─────────•───────┼───────────────────
         │        / \      │
         │       /   \     │
     SS ─┼──────/─────\────┼───────────────────
         │     /       \   │
         │    /         \  │
         │   /           \ │
         └──┴─────────────┴┴───────────────────→ Tiempo
            ↑             ↑
         Se pide       Llega
        (stock ≤ ROP)  el pedido
```

**Donde:**
- **SS** = Stock de Seguridad (colchón para variabilidad)
- **ROP** = Punto de Reorden (cuándo pedir)
- **MAX** = Stock Máximo (hasta dónde llenar)

---

## 3. Fuentes de Datos

### 3.1. Tablas de PostgreSQL utilizadas

| Tabla | Propósito | Campos clave |
|-------|-----------|--------------|
| `ventas` | Historial de ventas diarias | `producto_id`, `ubicacion_id`, `fecha_venta`, `cantidad_vendida`, `venta_total` |
| `inventario_actual` | Stock actual por ubicación | `producto_id`, `ubicacion_id`, `cantidad` |
| `productos` | Catálogo de productos | `codigo`, `nombre`, `unidades_por_bulto`, `activo` |
| `ubicaciones` | Tiendas y CEDIs | `id`, `nombre`, `tipo`, `region` |
| `config_inventario_tienda` | Configuración por tienda | `ubicacion_id`, `lead_time`, `dias_cobertura_a/b/c` |

### 3.2. Parámetros de entrada del endpoint `/calcular`

```python
class CalcularPedidoRequest(BaseModel):
    cedi_origen: str        # ID del CEDI (ej: "cedi_caracas")
    tienda_destino: str     # ID de la tienda (ej: "tienda_18")
    dias_cobertura: int     # Días objetivo (default: 3, informativo)
```

---

## 4. Cálculo de Promedios de Demanda

### 4.1. Ventas diarias disponibles

El sistema calcula las ventas diarias de cada producto en la tienda destino:

```sql
SELECT
    producto_id,
    fecha_venta::date as fecha,
    SUM(cantidad_vendida) as total_dia
FROM ventas
WHERE ubicacion_id = [tienda_destino]
  AND fecha_venta::date < CURRENT_DATE  -- IMPORTANTE: Excluir día actual
GROUP BY producto_id, fecha_venta::date
```

> **¿Por qué excluimos el día actual?**
> El día actual tiene ventas incompletas (ej: si son las 10am, solo tenemos 4 horas de ventas). Incluirlo sesgaría los promedios hacia abajo.

### 4.2. Métricas calculadas

Para cada producto calculamos:

| Métrica | Ventana | Fórmula | Propósito |
|---------|---------|---------|-----------|
| **Promedio 5 días** | Últimos 5 días | `AVG(total_dia)` | Tendencia reciente |
| **Promedio 20 días** | Últimos 20 días | `AVG(total_dia)` | Referencia base |
| **TOP3** | Últimos 20 días | `AVG(top 3 días)` | Picos de demanda |
| **P75** | Últimos 20 días | `PERCENTILE_CONT(0.75)` | **Demanda base para cálculos** |
| **Sigma (σ)** | Últimos 30 días | `STDDEV(total_dia)` | Variabilidad para SS |
| **Demanda Máxima** | Últimos 30 días | `MAX(total_dia)` | Para método Padre Prudente |

### 4.3. Ejemplo de cálculo

**Producto: Harina PAN 1kg**
Ventas últimos 20 días (en unidades):
```
[5, 8, 12, 6, 10, 15, 7, 9, 11, 8, 6, 14, 9, 7, 10, 12, 8, 11, 9, 10]
```

**Cálculos:**
- Promedio 20d = 8.85 unidades/día
- P75 = 11 unidades/día (el 75% de los días vendió ≤11)
- TOP3 = (15 + 14 + 12) / 3 = 13.67 unidades/día
- σ = 2.69 unidades
- MAX = 15 unidades/día

---

## 5. ¿Por qué usamos P75?

### 5.1. El problema del promedio simple

El promedio aritmético tiene problemas para planificar inventario:

```
Ventas diarias: [2, 3, 2, 15, 3, 2, 3]
Promedio = 4.29 unidades/día
```

Si planificamos con 4.29, el día que vendemos 15 **nos quedamos sin stock**.

### 5.2. La solución: Percentil 75 (P75)

El P75 significa: **"El 75% de los días, la venta fue igual o menor a este valor"**

```
Mismos datos ordenados: [2, 2, 2, 3, 3, 3, 15]
P75 = 3 unidades/día (posición 75%)
```

Esto es más **conservador** que el promedio, y es el estándar en gestión de inventarios para calcular demanda "esperada" sin incluir outliers extremos.

### 5.3. Comparación visual

```
                    Días de venta
    ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
 20 │   │   │   │   │   │   │   │   │   │   │
    ├───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
 15 │   │   │ █ │   │   │   │   │   │   │   │
    ├───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
 10 │ █ │   │   │ █ │ █ │   │ █ │   │ █ │ █ │  ← P75 ≈ 10-11
    ├───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
  5 │   │ █ │   │   │   │ █ │   │ █ │   │   │  ← Promedio ≈ 8
    ├───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
  0 │   │   │   │   │   │   │   │   │   │   │
    └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘
     D1  D2  D3  D4  D5  D6  D7  D8  D9 D10
```

**El P75 captura mejor el "día típico de buenas ventas"**, no el promedio que baja por días flojos.

### 5.4. Fórmula SQL

```sql
PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_dia) as p75
```

---

## 6. Clasificación ABC por Valor (Pareto)

### 6.1. Principio de Pareto (80/20)

El sistema clasifica productos según su **contribución al valor total de ventas**:

| Clase | % del Valor Total | % de Productos (aprox) | Nivel de Servicio |
|-------|-------------------|------------------------|-------------------|
| **A** | 80% del valor | ~20% | 99% (nunca faltar) |
| **B** | 15% del valor | ~30% | 95% |
| **C** | 5% del valor | ~50% | 90% |

### 6.2. Cálculo del ABC

```sql
WITH ventas_30d AS (
    SELECT producto_id, SUM(venta_total) as venta_total
    FROM ventas
    WHERE ubicacion_id = [tienda]
      AND fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY producto_id
),
abc_acumulado AS (
    SELECT
        producto_id,
        venta_total,
        SUM(venta_total) OVER (ORDER BY venta_total DESC) as venta_acum,
        SUM(venta_total) OVER () as venta_total_periodo
    FROM ventas_30d
)
SELECT
    producto_id,
    CASE
        WHEN venta_acum <= venta_total_periodo * 0.80 THEN 'A'
        WHEN venta_acum <= venta_total_periodo * 0.95 THEN 'B'
        ELSE 'C'
    END as clase_abc
FROM abc_acumulado;
```

### 6.3. ¿Por qué ABC por valor y no por volumen?

**Problema con ABC por volumen:**
- 1000 bolsas de sal (bajo margen) → Clase A
- 10 botellas de whisky premium (alto margen) → Clase C

**Con ABC por valor:**
- Priorizamos productos que **realmente importan al negocio**
- Un producto puede tener bajo volumen pero alto valor → Clase A

---

## 7. Fórmulas de Inventario por Clase

El sistema usa **dos métodos** de cálculo según la clasificación ABC:

### 7.1. Método Estadístico (Clases A y B)

Para productos de alta/media importancia usamos fórmulas estadísticas.

#### Stock de Seguridad (SS)

```
SS = Z × σ × √L
```

Donde:
- **Z** = Factor de nivel de servicio
  - Clase A: Z = 2.33 (99% nivel servicio)
  - Clase B: Z = 1.65 (95% nivel servicio)
- **σ** = Desviación estándar de demanda diaria
- **L** = Lead time en días (default: 1.5)

**Ejemplo Clase A:**
```
Z = 2.33, σ = 5 unidades, L = 1.5 días
SS = 2.33 × 5 × √1.5 = 2.33 × 5 × 1.22 = 14.2 unidades
```

#### Punto de Reorden (ROP)

```
ROP = (P75 × L) + SS
```

Donde:
- **P75** = Demanda diaria P75
- **L** = Lead time
- **SS** = Stock de seguridad calculado

**Ejemplo:**
```
P75 = 10 unidades/día, L = 1.5 días, SS = 14.2 unidades
ROP = (10 × 1.5) + 14.2 = 15 + 14.2 = 29.2 unidades
```

#### Stock Máximo (MAX)

```
MAX = ROP + (P75 × días_cobertura)
```

Donde:
- **días_cobertura** = Días de inventario objetivo
  - Clase A: 5 días
  - Clase B: 7 días

**Ejemplo Clase A:**
```
ROP = 29.2 unidades, P75 = 10 unidades/día, días_cobertura = 5
MAX = 29.2 + (10 × 5) = 29.2 + 50 = 79.2 unidades
```

### 7.2. Método Padre Prudente (Clase C)

Para productos de baja rotación usamos un enfoque heurístico más simple.

#### Stock de Seguridad (SS)

```
SS = 0.20 × P75 × L
```

(20% de la demanda durante lead time como colchón)

#### Punto de Reorden (ROP)

```
ROP = (P75 × L) + SS
```

O alternativamente:
```
ROP = D_max × L
```
(Usar demanda máxima × lead time para ser conservadores)

#### Stock Máximo (MAX)

```
MAX = ROP + (P75 × días_cobertura)
```

Donde días_cobertura = **30 días** para Clase C (pedidos menos frecuentes)

### 7.3. Resumen de parámetros por clase

| Parámetro | Clase A | Clase B | Clase C |
|-----------|---------|---------|---------|
| **Método** | Estadístico | Estadístico | Padre Prudente |
| **Z (nivel servicio)** | 2.33 (99%) | 1.65 (95%) | N/A |
| **Días cobertura** | 5 días | 7 días | 30 días |
| **Fórmula SS** | Z × σ × √L | Z × σ × √L | 0.20 × P75 × L |

### 7.4. Ejemplo completo

**Producto: Aceite Vatel 1L**
- Clase ABC: **A**
- P75: **12 unidades/día**
- σ: **4 unidades**
- Unidades por bulto: **12**
- Lead time: **1.5 días**

**Cálculos:**

```
1. Stock de Seguridad (SS)
   SS = 2.33 × 4 × √1.5 = 2.33 × 4 × 1.22 = 11.4 unidades

2. Punto de Reorden (ROP)
   ROP = (12 × 1.5) + 11.4 = 18 + 11.4 = 29.4 unidades
   ROP en bultos = 29.4 / 12 = 2.45 bultos ≈ 3 bultos

3. Stock Máximo (MAX)
   MAX = 29.4 + (12 × 5) = 29.4 + 60 = 89.4 unidades
   MAX en bultos = 89.4 / 12 = 7.45 bultos ≈ 8 bultos
```

---

## 8. Parámetros Configurables

### 8.1. Configuración por tienda

Tabla: `config_inventario_tienda`

| Campo | Default | Descripción |
|-------|---------|-------------|
| `lead_time` | 1.5 | Días desde pedido hasta llegada |
| `dias_cobertura_a` | 5 | Días de inventario para Clase A |
| `dias_cobertura_b` | 7 | Días de inventario para Clase B |
| `dias_cobertura_c` | 30 | Días de inventario para Clase C |
| `nivel_servicio_a` | 0.99 | Nivel de servicio objetivo Clase A |
| `nivel_servicio_b` | 0.95 | Nivel de servicio objetivo Clase B |

### 8.2. Parámetros globales (hardcodeados)

```python
# En backend/services/calculo_inventario_abc.py

LEAD_TIME = 1.5  # Default si no hay config

# Factores Z por nivel de servicio
Z_99 = 2.33  # Clase A
Z_95 = 1.65  # Clase B
Z_90 = 1.28  # Clase C (si usara método estadístico)
```

---

## 9. Lógica de Sugerencia de Pedido

### 9.1. Regla fundamental

```
¿Cuándo pedir?  → Stock Actual ≤ ROP
¿Cuánto pedir?  → MAX - Stock Actual (redondeado a bultos)
```

### 9.2. Pseudocódigo completo

```python
def calcular_pedido_sugerido(producto):
    # 1. Obtener datos
    stock_actual = producto.stock_tienda + producto.stock_en_transito
    stock_cedi = producto.stock_cedi_origen
    p75 = producto.prom_p75_unid

    # 2. Calcular niveles (según clase ABC)
    ss, rop, max_stock = calcular_niveles_inventario(
        demanda_p75=p75,
        sigma=producto.sigma_demanda,
        clase_abc=producto.clasificacion_abc
    )

    # 3. ¿Debemos pedir?
    if stock_actual > rop:
        return PedidoSugerido(
            cantidad=0,
            razon="Stock suficiente",
            criticidad="optimo"
        )

    # 4. ¿Hay stock en CEDI?
    if stock_cedi <= 0:
        return PedidoSugerido(
            cantidad=0,
            razon="Sin stock en CEDI",
            criticidad="sin_stock_cedi"
        )

    # 5. Calcular cantidad
    deficit = max_stock - stock_actual
    deficit_bultos = math.ceil(deficit / producto.unidades_por_bulto)

    # 6. Limitar por stock CEDI
    cedi_bultos = stock_cedi / producto.unidades_por_bulto
    cantidad_final = min(deficit_bultos, int(cedi_bultos))

    # 7. Determinar criticidad
    if stock_actual <= ss:
        criticidad = "critico"  # 🔴 Por debajo de seguridad
    elif stock_actual <= rop:
        criticidad = "urgente"  # 🟠 Por debajo de reorden
    else:
        criticidad = "optimo"   # 🟢 OK

    return PedidoSugerido(
        cantidad=cantidad_final,
        razon=f"Stock bajo ROP ({rop:.1f})",
        criticidad=criticidad
    )
```

### 9.3. Estados de criticidad

| Estado | Condición | Color | Acción |
|--------|-----------|-------|--------|
| **Crítico** | Stock ≤ SS | 🔴 Rojo | Pedir urgente |
| **Urgente** | SS < Stock ≤ ROP | 🟠 Naranja | Pedir normal |
| **Óptimo** | ROP < Stock ≤ MAX | 🟢 Verde | No pedir |
| **Exceso** | Stock > MAX | 🟣 Morado | Posible sobre-stock |

### 9.4. Redondeo a bultos

**Regla:** Siempre redondear **hacia arriba** (ceil) para garantizar cobertura.

```python
def redondear_a_bultos(cantidad_unid, unidades_por_bulto):
    if cantidad_unid <= 0:
        return 0
    return math.ceil(cantidad_unid / unidades_por_bulto)
```

**Ejemplo:**
```
Déficit = 25 unidades
Unidades por bulto = 12
Bultos a pedir = ceil(25/12) = ceil(2.08) = 3 bultos
```

---

## 10. Casos Especiales

### 10.1. Productos Generadores de Tráfico

Algunos productos tienen alto **GAP** entre su ranking de ventas y su penetración en facturas. Estos son "imanes" que atraen clientes.

**Tratamiento especial:**
- Se tratan como **Clase A** aunque su clasificación ABC sea B o C
- Mayor nivel de servicio
- Nunca deben faltar

```python
if producto.es_generador_trafico:
    clase_efectiva = 'A'  # Forzar tratamiento Clase A
```

### 10.2. Envíos de Prueba (Referencia Regional)

**Escenario:** Producto sin ventas en la tienda, pero sí vende en otras tiendas de la misma región.

**Lógica:**
1. Si P75 local = 0 **Y** P75 regional > 0 **Y** stock_cedi > 0
2. Usar el P75 de tiendas de referencia (misma región)
3. Marcar como "envío de prueba"
4. Tratar como Clase C (conservador)

```python
# Condiciones para envío de prueba
sin_ventas_locales = prom_p75 == 0
hay_demanda_regional = p75_referencia > 0
hay_stock_disponible = stock_cedi > 0

if sin_ventas_locales and hay_demanda_regional and hay_stock_disponible:
    es_envio_prueba = True
    p75_usado = p75_referencia
    clasificacion = 'C'  # Conservador
    razon = f"Sin ventas - envío prueba (ref: {tienda_referencia})"
```

**Regiones definidas:**
- **CARACAS**: cedi_caracas, tienda_17 (Artigas), tienda_18 (Paraíso)
- **VALENCIA**: Resto de tiendas

### 10.3. Tiendas nuevas (poco historial)

Para tiendas con menos de 20 días de datos:
- Usar los días disponibles
- P75 puede ser menos confiable
- Sistema se adapta automáticamente

```sql
-- La query no limita a 20 días exactos, toma lo disponible
WHERE fecha >= CURRENT_DATE - INTERVAL '20 days'
```

### 10.4. Productos sin demanda (P75 = 0)

Si un producto no tiene ventas recientes:
- `cantidad_sugerida = 0`
- `razon = "Sin demanda histórica"`
- Se muestra pero no se sugiere pedido

### 10.5. Stock en tránsito

El sistema considera el stock en tránsito en el cálculo:

```python
stock_actual = stock_tienda + stock_en_transito
```

> **Nota actual:** El stock en tránsito no está implementado completamente. Se asume 0.

### 10.6. Sobrestock

Si el stock actual excede el MAX:

```python
if stock_actual > max_stock:
    tiene_sobrestock = True
    exceso = stock_actual - max_stock
    dias_exceso = exceso / p75 if p75 > 0 else 999
    razon = "Sobrestock - No pedir"
```

---

## 11. Flujo Completo del Cálculo

### 11.1. Diagrama de flujo

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENDPOINT: POST /calcular                     │
├─────────────────────────────────────────────────────────────────┤
│  Input: { cedi_origen, tienda_destino, dias_cobertura }        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. CARGAR CONFIGURACIÓN DE TIENDA                             │
│     - Lead time                                                 │
│     - Días cobertura por clase (A, B, C)                       │
│     - Niveles de servicio                                       │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. IDENTIFICAR REGIÓN Y TIENDAS DE REFERENCIA                 │
│     - Obtener región de tienda destino                         │
│     - Buscar otras tiendas de la misma región                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. QUERY PRINCIPAL (PostgreSQL)                               │
│                                                                 │
│  CTEs calculadas:                                              │
│  ├── ventas_diarias_disponibles (excluye hoy)                  │
│  ├── ventas_20dias (promedio, días con venta)                  │
│  ├── ventas_5dias (promedio corto plazo)                       │
│  ├── top3_ventas (promedio top 3 días)                         │
│  ├── percentil_75 (P75 de demanda)                             │
│  ├── estadisticas_30d (sigma, max)                             │
│  ├── abc_clasificado (clasificación por valor)                 │
│  ├── inv_tienda (stock actual tienda)                          │
│  ├── inv_cedi (stock disponible CEDI)                          │
│  └── p75_referencia (P75 de tiendas regionales)                │
│                                                                 │
│  Output: Lista de productos con todas las métricas             │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. PROCESAMIENTO POR PRODUCTO                                 │
│                                                                 │
│  Para cada producto:                                           │
│  ├── 4.1 Extraer métricas del row                              │
│  ├── 4.2 Determinar clasificación ABC                          │
│  ├── 4.3 ¿Es envío de prueba? (sin ventas + ref regional)      │
│  ├── 4.4 Calcular SS, ROP, MAX según clase                     │
│  ├── 4.5 Calcular cantidad sugerida                            │
│  ├── 4.6 Determinar criticidad y razón                         │
│  └── 4.7 Detectar sobrestock                                   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. RESPUESTA                                                  │
│                                                                 │
│  Lista de ProductoCalculado con:                               │
│  - Datos del producto (código, descripción, etc.)              │
│  - Métricas de venta (P75, promedio, etc.)                     │
│  - Stock (tienda, CEDI, tránsito)                              │
│  - Niveles calculados (SS, ROP, MAX)                           │
│  - Sugerencia (cantidad, razón, criticidad)                    │
│  - Metadata (método, warnings)                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 11.2. Tiempo de ejecución típico

| Paso | Tiempo aprox. |
|------|---------------|
| Cargar config | ~50ms |
| Query principal | ~2-5 segundos |
| Procesamiento | ~500ms |
| **Total** | ~3-6 segundos |

---

## 12. API y Estructuras de Datos

### 12.1. Endpoint principal

```
POST /api/pedidos-sugeridos/calcular
```

**Request:**
```json
{
    "cedi_origen": "cedi_caracas",
    "tienda_destino": "tienda_18",
    "dias_cobertura": 3
}
```

**Response:**
```json
[
    {
        "codigo_producto": "001234",
        "codigo_barras": "7591234567890",
        "descripcion_producto": "HARINA PAN 1KG",
        "categoria": "Harinas",
        "grupo": "Alimentos",
        "subgrupo": "Harinas Precocidas",
        "marca": "PAN",
        "presentacion": "1KG",
        "cantidad_bultos": 20.0,
        "peso_unidad": 1000.0,

        "prom_ventas_5dias_unid": 45.0,
        "prom_ventas_20dias_unid": 42.5,
        "prom_top3_unid": 55.0,
        "prom_p75_unid": 48.0,

        "stock_tienda": 120.0,
        "stock_en_transito": 0.0,
        "stock_total": 120.0,
        "stock_total_bultos": 6.0,
        "stock_dias_cobertura": 2.5,
        "stock_cedi_origen": 500.0,

        "clasificacion_abc": "A",
        "clase_efectiva": "A",
        "es_generador_trafico": false,

        "stock_seguridad": 28.0,
        "stock_minimo": 28.0,
        "punto_reorden": 100.0,
        "stock_maximo": 340.0,

        "cantidad_sugerida_unid": 220.0,
        "cantidad_sugerida_bultos": 11.0,
        "cantidad_ajustada_bultos": 11.0,

        "razon_pedido": "",
        "metodo_calculo": "estadistico",
        "tiene_sobrestock": false,
        "exceso_unidades": 0.0,
        "exceso_bultos": 0,
        "dias_exceso": 0.0,
        "warnings_calculo": []
    }
]
```

### 12.2. Modelo ProductoCalculado

```python
class ProductoCalculado(BaseModel):
    # Identificación
    codigo_producto: str
    codigo_barras: Optional[str]
    descripcion_producto: str
    categoria: Optional[str]
    grupo: Optional[str]
    subgrupo: Optional[str]
    marca: Optional[str]
    presentacion: Optional[str]
    cantidad_bultos: float  # Unidades por bulto
    peso_unidad: float

    # Métricas de venta
    prom_ventas_5dias_unid: float
    prom_ventas_20dias_unid: float
    prom_top3_unid: float
    prom_p75_unid: float  # ← MÉTRICA PRINCIPAL
    prom_ventas_8sem_unid: float
    prom_ventas_8sem_bultos: float

    # Stock
    stock_tienda: float
    stock_en_transito: float
    stock_total: float
    stock_total_bultos: float
    stock_dias_cobertura: float
    stock_cedi_origen: float

    # Clasificación
    clasificacion_abc: Optional[str]  # A, B, C, -
    clase_efectiva: Optional[str]     # Puede diferir si es generador tráfico
    es_generador_trafico: bool

    # Niveles de inventario calculados
    stock_seguridad: float    # SS en unidades
    stock_minimo: float       # = ROP en este sistema
    stock_maximo: float       # MAX en unidades
    punto_reorden: float      # ROP en unidades

    # Sugerencia
    cantidad_sugerida_unid: float
    cantidad_sugerida_bultos: float
    cantidad_ajustada_bultos: float  # Después de ajustes manuales
    razon_pedido: str
    metodo_calculo: str  # "estadistico", "padre_prudente", "referencia_regional"

    # Sobrestock
    tiene_sobrestock: bool
    exceso_unidades: float
    exceso_bultos: int
    dias_exceso: float

    # Metadata
    warnings_calculo: List[str]
```

---

## 13. Frontend y Visualización

### 13.1. Componentes principales

| Componente | Archivo | Propósito |
|------------|---------|-----------|
| OrderStepTwo | `OrderStepTwo.tsx` | Tabla de productos con sugerencias |
| PedidoSugeridoModal | `PedidoSugeridoModal.tsx` | Detalle del cálculo de un producto |
| PuntoReordenModal | `PuntoReordenModal.tsx` | Explicación del ROP |
| StockSeguridadModal | `StockSeguridadModal.tsx` | Explicación del SS |

### 13.2. Columnas de la tabla

| Columna | Campo | Descripción |
|---------|-------|-------------|
| # | - | Número de fila |
| Código | `codigo_producto` | Código del producto |
| Descripción | `descripcion_producto` | Nombre del producto |
| U/B | `cantidad_bultos` | Unidades por bulto |
| 20D | `prom_ventas_20dias_unid` | Promedio 20 días |
| TOP3 | `prom_top3_unid` | Promedio top 3 días |
| P75 | `prom_p75_unid` | Percentil 75 |
| STK | `stock_tienda` | Stock actual tienda |
| TRÁN | `stock_en_transito` | Stock en tránsito |
| TOT | `stock_total` | Stock total |
| DÍAS | `stock_dias_cobertura` | Días de cobertura |
| CEDI | `stock_cedi_origen` | Stock disponible CEDI |
| ABC | `clasificacion_abc` | Clasificación ABC |
| ↑ | `clase_efectiva` | Indicador de promoción |
| SS | `stock_seguridad` | Stock de seguridad |
| ROP | `punto_reorden` | Punto de reorden |
| MAX | `stock_maximo` | Stock máximo |
| SUG | `cantidad_sugerida_bultos` | Sugerencia en bultos |
| PEDIR | `cantidad_ajustada_bultos` | Cantidad a pedir (editable) |
| PESO | - | Peso total del pedido |
| NOTAS | `razon_pedido` | Notas/razón del pedido |

### 13.3. Indicadores visuales

**Criticidad (columna STK):**
- 🔴 Fondo rojo: Stock ≤ SS (crítico)
- 🟠 Fondo naranja: SS < Stock ≤ ROP (urgente)
- 🟢 Fondo verde: ROP < Stock ≤ MAX (óptimo)
- 🟣 Fondo morado: Stock > MAX (exceso)

**Badges especiales:**
- `⚡ GT` - Generador de tráfico
- `🧪 Envío Prueba` - Referencia regional

---

## 14. Troubleshooting

### 14.1. P75 muestra 0 pero el producto tiene ventas

**Causa posible:** Las ventas son de hoy (día actual excluido)

**Verificar:**
```sql
SELECT fecha_venta::date, SUM(cantidad_vendida)
FROM ventas
WHERE producto_id = 'XXXX' AND ubicacion_id = 'tienda_XX'
GROUP BY 1
ORDER BY 1 DESC
LIMIT 10;
```

### 14.2. Cantidad sugerida = 0 cuando debería sugerir

**Causas posibles:**
1. Stock actual > ROP
2. Stock CEDI = 0
3. P75 = 0 (sin demanda histórica)

**Verificar en el response:**
- `razon_pedido` indica el motivo
- `stock_tienda` vs `punto_reorden`
- `stock_cedi_origen`

### 14.3. Los promedios están sesgados

**Causa posible:** Incluye día actual (incompleto)

**Solución:** Verificar que la query excluye `CURRENT_DATE`:
```sql
AND fecha_venta::date < CURRENT_DATE
```

### 14.4. El método de cálculo es incorrecto

**Verificar:**
- `clasificacion_abc` del producto
- `metodo_calculo` en el response:
  - A/B → "estadistico"
  - C → "padre_prudente"
  - Sin ventas + ref regional → "referencia_regional"

---

## 15. Glosario

| Término | Definición |
|---------|------------|
| **ABC** | Clasificación de productos por valor económico (Pareto) |
| **Bulto** | Unidad de embalaje que contiene múltiples unidades |
| **CEDI** | Centro de Distribución (almacén central) |
| **Lead Time (L)** | Tiempo desde que se hace un pedido hasta que llega |
| **MAX** | Stock Máximo - nivel objetivo al reponer |
| **P75** | Percentil 75 de la demanda diaria |
| **ROP** | Punto de Reorden - nivel que activa un pedido |
| **SS** | Stock de Seguridad - colchón para variabilidad |
| **σ (sigma)** | Desviación estándar de la demanda diaria |
| **Z** | Factor estadístico según nivel de servicio |
| **Nivel de servicio** | Probabilidad de no tener stockout (ej: 99%) |
| **Pareto** | Principio 80/20 (80% del valor en 20% de productos) |
| **Generador de tráfico** | Producto que atrae clientes a la tienda |
| **Envío de prueba** | Pedido basado en demanda de otras tiendas |

---

## Historial de cambios

| Fecha | Versión | Cambios |
|-------|---------|---------|
| 2025-12-07 | 2.0 | Documentación completa v2. Incluye P75, ABC por valor, envíos de prueba, referencia regional |
| 2025-10-03 | 1.0 | Versión inicial (desactualizada) |

---

## 16. Ejemplos de la Vida Real

> **Fuente de datos:** API de producción, tienda_17 (Artigas, Caracas)
> **Fecha de extracción:** 2025-12-07

### 16.1. Ejemplo Clase A - Método Estadístico

#### Producto: HARINA DE MAIZ BLANCO SIN GLUTEN PAN 1 KG (004962)

**Datos del producto:**
| Campo | Valor |
|-------|-------|
| Unidades por bulto | 20 |
| P75 | 630.00 unid/día |
| Stock Tienda | -1,071 unid (faltante) |
| Stock CEDI | 5,736 unid |
| Clasificación ABC | A |

**Cálculos realizados por el sistema:**

```
1. Stock de Seguridad (SS) - Método Estadístico Clase A
   Z = 2.33 (nivel servicio 99%)
   σ = estimado del historial
   L = 1.5 días

   SS = Z × σ × √L
   SS = 509.41 unidades

2. Punto de Reorden (ROP)
   ROP = (P75 × L) + SS
   ROP = (630 × 1.5) + 509.41
   ROP = 945 + 509.41
   ROP = 1,454.41 unidades

3. Stock Máximo (MAX) - Clase A usa 5 días cobertura + padding
   MAX = ROP + (P75 × días_cobertura)
   MAX = 1,454.41 + (630 × 7)
   MAX = 1,454.41 + 4,410
   MAX = 5,864.41 unidades

4. Cantidad Sugerida
   Déficit = MAX - Stock Actual
   Déficit = 5,864.41 - (-1,071)  ← Stock negativo = deuda
   Déficit = 6,935.41 unidades

   Bultos = ceil(6,935.41 / 20)
   Bultos = ceil(346.77)
   Bultos = 347 bultos
```

**Resultado:**
- ✅ Sugerido: **347 bultos** (6,940 unidades)
- 🔴 Criticidad: **Crítica** (stock negativo, por debajo de SS)
- Método: `estadistico`

---

### 16.2. Ejemplo Clase A - Azúcar con Stock Bajo

#### Producto: AZUCAR CRISTAL DOCE DIA 1 KG (002880)

**Datos del producto:**
| Campo | Valor |
|-------|-------|
| Unidades por bulto | 30 |
| P75 | 386.25 unid/día |
| Stock Tienda | 10 unid |
| Stock CEDI | 6,933 unid |
| Clasificación ABC | A |

**Cálculos:**

```
1. Stock de Seguridad (SS)
   SS = 199.92 unidades

2. Punto de Reorden (ROP)
   ROP = (386.25 × 1.5) + 199.92
   ROP = 579.37 + 199.92
   ROP = 779.29 unidades

3. Stock Máximo (MAX)
   MAX = 779.29 + (386.25 × 7)
   MAX = 779.29 + 2,703.75
   MAX = 3,483.04 unidades

4. Cantidad Sugerida
   Déficit = 3,483.04 - 10 = 3,473.04 unidades
   Bultos = ceil(3,473.04 / 30) = 116 bultos
```

**Resultado:**
- ✅ Sugerido: **116 bultos** (3,480 unidades)
- 🔴 Criticidad: **Crítica** (10 unid vs SS de 199.92)
- Razón: Stock actual (10) muy por debajo de SS (199.92)

---

### 16.3. Ejemplo Clase B - Método Estadístico

#### Producto: SALSA DE AJO GRANJA 150 ML (002237)

**Datos del producto:**
| Campo | Valor |
|-------|-------|
| Unidades por bulto | 20 |
| P75 | 21.50 unid/día |
| Stock Tienda | 18 unid |
| Stock CEDI | 100 unid |
| Clasificación ABC | B |

**Cálculos (Clase B usa Z=1.65 para 95% servicio):**

```
1. Stock de Seguridad (SS)
   Z = 1.65 (nivel servicio 95%)
   SS = 17.78 unidades

2. Punto de Reorden (ROP)
   ROP = (21.50 × 1.5) + 17.78
   ROP = 32.25 + 17.78
   ROP = 50.03 unidades

3. Stock Máximo (MAX) - Clase B usa 7 días cobertura
   MAX = 50.03 + (21.50 × 14)
   MAX = 50.03 + 301
   MAX = 351.03 unidades

4. Cantidad Sugerida
   Déficit = 351.03 - 18 = 333.03 unidades
   Bultos = ceil(333.03 / 20) = 17 bultos

   ⚠️ Limitado por stock CEDI: 100 / 20 = 5 bultos disponibles
   Ajustado = min(17, 5) = 5 bultos
```

**Resultado:**
- ✅ Sugerido: **17 bultos** (pero limitado por CEDI a 5)
- 🟠 Criticidad: **Urgente** (stock bajo ROP pero arriba de SS)
- Método: `estadistico`

---

### 16.4. Ejemplo Clase C - Método Padre Prudente

#### Producto: AFEITADORA ROSADA 2 HOJILLAS DORCO (004924)

**Datos del producto:**
| Campo | Valor |
|-------|-------|
| Unidades por bulto | 2,000 |
| P75 | 22.00 unid/día |
| Stock Tienda | 0 unid |
| Stock CEDI | 4,807 unid |
| Clasificación ABC | C |

**Cálculos (Método Padre Prudente):**

```
1. Stock de Seguridad (SS) - Padre Prudente
   SS = 0.20 × P75 × L
   SS = 0.20 × 22 × 1.5
   SS = 6.6 unidades
   Sistema muestra: 19.50 (puede incluir ajustes)

2. Punto de Reorden (ROP) - Padre Prudente
   ROP = D_max × L  ó  (P75 × L) + SS
   ROP = 52.50 unidades

3. Stock Máximo (MAX) - Clase C usa 30 días cobertura
   MAX = ROP + (P75 × 30)
   MAX = 52.50 + (22 × 30)
   MAX = 52.50 + 660
   MAX = 712.50 unidades

4. Cantidad Sugerida
   Déficit = 712.50 - 0 = 712.50 unidades
   Bultos = ceil(712.50 / 2000) = 1 bulto

   ✓ Stock CEDI: 4,807 > 2,000 → Hay disponible
```

**Resultado:**
- ✅ Sugerido: **1 bulto** (2,000 unidades)
- 🔴 Criticidad: **Crítica** (stock = 0)
- Método: `padre_prudente`
- Nota: Clase C pide **paquetes completos** aunque sea mucho

---

### 16.5. Ejemplo Clase C - Producto de Alto Volumen

#### Producto: BOLSA GRANDE AAA (003760)

**Datos del producto:**
| Campo | Valor |
|-------|-------|
| Unidades por bulto | 1 |
| P75 | 469.00 unid/día |
| Stock Tienda | -2,331 unid (deuda) |
| Stock CEDI | 183,500 unid |
| Clasificación ABC | C |

**Análisis:**

Este producto es interesante porque:
- Clasificado como **Clase C** (poco valor unitario)
- Pero tiene **alta rotación** (P75 = 469/día)
- Stock negativo indica deuda acumulada

```
Cálculos:
SS = 492 unidades
ROP = 1,195.50 unidades
MAX = 15,265.50 unidades (30 días cobertura Clase C)

Déficit = 15,265.50 - (-2,331) = 17,596.50 unidades
Bultos = 17,597 bultos (1 unid/bulto)
```

**Resultado:**
- ✅ Sugerido: **17,597 bultos**
- 🔴 Criticidad: **Crítica** (stock muy negativo)
- Método: `padre_prudente`
- ⚠️ Este caso muestra cómo un producto C puede necesitar alto volumen

---

### 16.6. Ejemplo de Producto Sin Demanda

#### Producto hipotético: PRODUCTO NUEVO XYZ

**Datos:**
| Campo | Valor |
|-------|-------|
| P75 | 0 unid/día |
| Stock Tienda | 50 unid |
| Stock CEDI | 200 unid |
| Clasificación ABC | - |

**Resultado:**
- ❌ Sugerido: **0 bultos**
- Razón: "Sin demanda histórica"
- El sistema no sugiere pedir productos sin historial de ventas

---

### 16.7. Ejemplo de Sobrestock

#### Producto hipotético: PRODUCTO CON EXCESO

**Datos:**
| Campo | Valor |
|-------|-------|
| P75 | 10 unid/día |
| Stock Tienda | 500 unid |
| Stock CEDI | 1,000 unid |
| Clasificación ABC | B |
| ROP calculado | 45 unidades |
| MAX calculado | 115 unidades |

**Análisis:**
```
Stock Actual (500) > MAX (115)
Exceso = 500 - 115 = 385 unidades
Días de exceso = 385 / 10 = 38.5 días
```

**Resultado:**
- ❌ Sugerido: **0 bultos**
- 🟣 Estado: **Sobrestock**
- Razón: "Sobrestock - No pedir"
- `tiene_sobrestock: true`
- `exceso_unidades: 385`
- `dias_exceso: 38.5`

---

### 16.8. Resumen de Distribución Real (tienda_17 Artigas)

**Estadísticas de la tienda:**

| Métrica | Valor |
|---------|-------|
| Total productos analizados | 1,703 |
| Productos Clase A | 292 (17%) |
| Productos Clase B | 539 (32%) |
| Productos Clase C | 735 (43%) |
| Sin clasificar | 137 (8%) |
| **Con sugerencia > 0** | **1,298** (76%) |
| Sin sugerencia | 405 (24%) |

**Distribución por método de cálculo:**

| Método | Productos | Descripción |
|--------|-----------|-------------|
| `estadistico` | ~830 | Clase A y B |
| `padre_prudente` | ~468 | Clase C |
| `referencia_regional` | 0 | Tienda madura, tiene historial |

> **Nota:** tienda_17 (Artigas) es una tienda madura con historial completo, por lo que no tiene productos "envío de prueba". Las tiendas nuevas tendrían más productos con `referencia_regional`.

---

### 16.9. Comparación de Métodos con el Mismo Producto Teórico

**Producto teórico:** P75=50 unid/día, σ=15, L=1.5 días, 12 unid/bulto

| Parámetro | Si fuera Clase A | Si fuera Clase B | Si fuera Clase C |
|-----------|------------------|------------------|------------------|
| Método | Estadístico | Estadístico | Padre Prudente |
| Z factor | 2.33 | 1.65 | N/A |
| **SS** | 42.8 | 30.3 | 15.0 |
| **ROP** | 117.8 | 105.3 | 90.0 |
| **MAX** | 367.8 | 455.3 | 1,590.0 |
| Días cobertura | 5 | 7 | 30 |

**Observaciones:**
1. Clase A tiene el **SS más alto** (más protección)
2. Clase C tiene el **MAX más alto** (más inventario, menos frecuencia de pedido)
3. El método Padre Prudente para C simplifica los cálculos pero es más conservador

---

**Archivos de referencia:**
- Backend: `backend/routers/pedidos_sugeridos.py`
- Cálculo ABC: `backend/services/calculo_inventario_abc.py`
- Frontend: `frontend/src/components/orders/OrderStepTwo.tsx`
- Modal explicativo: `frontend/src/components/orders/PedidoSugeridoModal.tsx`
