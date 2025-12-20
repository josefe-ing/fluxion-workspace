# Plan: Módulo de Business Intelligence - Fluxion AI

## Resumen Ejecutivo

Crear un nuevo módulo de **Business Intelligence** con 3 pilares principales:
1. **Fluxion Impact** - ROI del sistema (capital liberado, reducción de inventario)
2. **Inteligencia de Negocio** - Rentabilidad, GMROI, rotación por producto/tienda
3. **Cobertura y Distribución** - Visibilidad de productos en tiendas, stock atrapado en CEDI

---

## Contexto del Negocio

### Estructura Organizacional
```
CARACAS (3 ubicaciones)
├── CEDI Caracas (Global: Seco + Frío + Verde) → Abastece SOLO Paraíso y Artigas
├── Tienda 17 - Artigas (próximamente)
└── Tienda 18 - Paraíso ✅ (activa con Fluxion desde Dic 2025)

VALENCIA (20 ubicaciones)
├── CEDI Seco (grande) ┐
├── CEDI Frío          ├→ Abastecen las 17 tiendas de Valencia
├── CEDI Verde         ┘
└── 17 Tiendas activas (01-16, 19, 20) - próximamente con Fluxion
```

### Estado Actual de Fluxion
- **Paraíso (tienda_18)**: 4 días activa con Fluxion (piloto)
- **Resto de tiendas**: Por comenzar
- **Implicación**: El baseline de Fluxion Impact se calcula POR TIENDA desde su fecha de activación

### Propuesta de Valor
- Fluxion reduce inventario ~35% sin stockouts
- Stock $450K → $292K = $158K capital liberado
- Snapshots cada 30 min permiten análisis casi real-time

---

## Arquitectura Técnica

### Stack Existente
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + Recharts/Chart.js
- **Backend**: FastAPI + PostgreSQL (read replica support)
- **Patrones**: Routers modulares, servicios separados, cache TTL en memoria

### Archivos Clave a Modificar/Crear

#### Backend
```
backend/
├── routers/
│   └── business_intelligence.py    # NUEVO - Router principal BI
├── services/
│   └── bi_calculations.py          # NUEVO - Cálculos de métricas BI
└── main.py                         # Registrar nuevo router
```

#### Frontend
```
frontend/src/
├── components/
│   └── bi/                         # NUEVO - Módulo completo
│       ├── BusinessIntelligence.tsx    # Layout principal con tabs
│       ├── FluxionImpact.tsx           # Tab 1: ROI
│       ├── StoreAnalysis.tsx           # Tab 2: Por tienda
│       ├── ProductAnalysis.tsx         # Tab 3: Por producto
│       ├── Profitability.tsx           # Tab 4: Rentabilidad
│       ├── CoverageDistribution.tsx    # Tab 5: Cobertura
│       └── charts/
│           ├── CapitalTrendChart.tsx
│           ├── GMROIScatterPlot.tsx
│           └── CoverageHeatmap.tsx
├── services/
│   └── biService.ts                # NUEVO - Llamadas API de BI
└── App.tsx                         # Agregar ruta /bi
```

#### Base de Datos
```
database/migrations/
└── 020_bi_materialized_views_UP.sql  # NUEVO - Vistas materializadas para performance
```

---

## Fase 1: Backend - Endpoints de BI

### 1.1 Router: `/api/bi/`

```python
# backend/routers/business_intelligence.py

# === FLUXION IMPACT ===
GET /api/bi/impact/summary
    # Resumen ejecutivo: stock actual vs baseline, capital liberado
    # Baseline = stock del DÍA 1 de activación de cada tienda (de tiendas_fluxion_activacion)
    # Solo incluye tiendas que ya tienen fecha de activación
    Response: {
        stock_actual_total: float,
        stock_baseline_total: float,
        capital_liberado: float,
        reduccion_pct: float,
        fill_rate: float,
        tiendas_activas_fluxion: int,
        por_region: [{region, stock_actual, stock_baseline, reduccion_pct}]
    }

GET /api/bi/impact/trend
    # Tendencia semanal de stock total (últimas 12 semanas)
    Params: ?region=CARACAS|VALENCIA
    Response: [{semana, stock_total, variacion_pct}]

GET /api/bi/impact/by-store
    # Ranking de tiendas por mejora
    Response: [{ubicacion_id, nombre, stock_actual, stock_baseline, reduccion_pct, rank}]

# === ANÁLISIS POR TIENDA ===
GET /api/bi/store/{ubicacion_id}/kpis
    # KPIs de una tienda específica
    Response: {
        ventas_30d: float,
        stock_valorizado: float,
        gmroi: float,
        rotacion_anual: float,
        fill_rate: float,
        dias_inventario_promedio: float,
        vs_promedio_red: {ventas_pct, stock_pct, gmroi_pct}
    }

GET /api/bi/store/{ubicacion_id}/top-bottom-products
    # Top 10 y Bottom 10 productos de la tienda
    Params: ?metric=gmroi|ventas|rotacion
    Response: {top: [...], bottom: [...]}

GET /api/bi/stores/ranking
    # Ranking comparativo de todas las tiendas
    Params: ?metric=gmroi|ventas|rotacion|reduccion_stock
    Response: [{ubicacion_id, nombre, valor, rank, vs_promedio}]

# === ANÁLISIS POR PRODUCTO ===
GET /api/bi/product/{producto_id}/metrics
    # Métricas de un producto
    Response: {
        ventas_30d, margen_promedio, gmroi, rotacion,
        tiendas_con_stock, tiendas_total, cobertura_pct,
        tendencia_demanda: [{semana, cantidad}]
    }

GET /api/bi/products/matrix
    # Matriz Rentabilidad vs Rotación (para scatter plot)
    Params: ?ubicacion_id=opcional&categoria=seco|frio|verde
    Response: [{producto_id, nombre, gmroi, rotacion, clase_abc, cuadrante}]
    # cuadrante: ESTRELLA | VACA | NICHO | PERRO

GET /api/bi/products/stars
    # Productos estrella (alto GMROI + alta rotación)
    Params: ?limit=20&ubicacion_id=opcional
    Response: [{producto_id, nombre, gmroi, rotacion, ventas_30d}]

GET /api/bi/products/eliminate
    # Candidatos a eliminar (bajo GMROI + baja rotación)
    Params: ?limit=20&ubicacion_id=opcional
    Response: [{producto_id, nombre, gmroi, rotacion, stock_valorizado, dias_sin_venta}]

# === RENTABILIDAD ===
GET /api/bi/profitability/by-category
    # Margen y GMROI por categoría (seco/frio/verde)
    Response: [{categoria, ventas_30d, margen_bruto, gmroi, stock_valorizado}]

GET /api/bi/profitability/top-products
    # Top 20 productos más rentables
    Params: ?metric=utilidad_total|margen_pct|gmroi
    Response: [{producto_id, nombre, categoria, utilidad_30d, margen_pct, gmroi}]

# === COBERTURA Y DISTRIBUCIÓN ===
GET /api/bi/coverage/summary
    # Resumen de cobertura
    Response: {
        productos_total: int,
        cobertura_completa: int,      # En todas las tiendas
        cobertura_parcial: int,       # En algunas tiendas
        sin_cobertura: int,           # Solo en CEDI
        stock_atrapado_cedi: float    # $ en CEDI sin distribución
    }

GET /api/bi/coverage/low-coverage-products
    # Productos con baja cobertura (<50% tiendas)
    Params: ?region=CARACAS|VALENCIA&limit=50
    Response: [{
        producto_id, nombre, categoria,
        tiendas_con_stock, tiendas_total, cobertura_pct,
        venta_promedio_donde_existe, oportunidad_estimada
    }]

GET /api/bi/coverage/trapped-in-cedi
    # Stock atrapado en CEDI (tiene en CEDI, <20 unidades en tiendas de su región)
    # Lógica por región:
    #   - cedi_caracas → compara con tienda_17 y tienda_18
    #   - cedi_seco/frio/verde → compara con tiendas 01-16, 19, 20
    Params: ?region=CARACAS|VALENCIA&umbral_bajo_stock=20
    Response: [{
        producto_id, nombre, stock_cedi, valor_atrapado,
        stock_en_tiendas, dias_sin_movimiento, tiendas_que_lo_vendian
    }]

GET /api/bi/coverage/opportunities
    # Oportunidades de distribución
    # "Producto X vende bien en tienda A, no existe en tienda B"
    Params: ?limit=50
    Response: [{
        producto_id, nombre,
        tienda_origen, venta_mensual_origen,
        tienda_destino, stock_destino,
        oportunidad_estimada
    }]

GET /api/bi/coverage/matrix
    # Matriz completa: Productos × Tiendas
    Params: ?categoria=seco|frio|verde&page=1&page_size=100
    Response: {
        productos: [{producto_id, nombre}],
        tiendas: [{ubicacion_id, nombre}],
        matrix: [[{tiene_stock: bool, cantidad: float, venta_30d: float}]]
    }

GET /api/bi/coverage/store-gaps
    # Tiendas con huecos de catálogo
    Response: [{
        ubicacion_id, nombre,
        skus_activos, skus_promedio_red,
        gap_skus, gap_pct,
        categorias_faltantes: [{categoria, productos_faltantes}]
    }]
```

### 1.2 Servicio de Cálculos: `bi_calculations.py`

```python
# backend/services/bi_calculations.py

# Constantes
BASELINE_DATE = '2025-01-01'  # Fecha de inicio de Fluxion (configurable)
GMROI_HIGH_THRESHOLD = 2.0    # GMROI > 2 = Alta rentabilidad
ROTATION_HIGH_THRESHOLD = 6.0  # Rotación > 6 = Alta velocidad

def calcular_gmroi(utilidad_bruta: float, inventario_promedio: float) -> float:
    """GMROI = Utilidad Bruta / Inventario Promedio"""
    if inventario_promedio <= 0:
        return 0
    return utilidad_bruta / inventario_promedio

def calcular_rotacion_anual(costo_ventas: float, inventario_promedio: float) -> float:
    """Rotación = (Costo Ventas Período / Inventario Promedio) × (365/días)"""
    ...

def clasificar_producto_matriz(gmroi: float, rotacion: float) -> str:
    """
    ESTRELLA: Alto GMROI + Alta Rotación → Priorizar
    VACA: Bajo GMROI + Alta Rotación → Mantener volumen
    NICHO: Alto GMROI + Baja Rotación → Evaluar
    PERRO: Bajo GMROI + Baja Rotación → Eliminar
    """
    ...

def calcular_oportunidad_distribucion(
    venta_mensual_origen: float,
    margen_promedio: float
) -> float:
    """Estimación conservadora de venta potencial"""
    return venta_mensual_origen * 0.5 * margen_promedio
```

---

## Fase 2: Base de Datos - Vistas Materializadas

### 2.1 Migración: `020_bi_materialized_views_UP.sql`

```sql
-- Vista: Stock valorizado por ubicación con baseline
CREATE MATERIALIZED VIEW mv_bi_stock_por_ubicacion AS
SELECT
    u.id as ubicacion_id,
    u.nombre,
    u.tipo,
    u.region,
    COALESCE(SUM(i.valor_inventario), 0) as stock_actual,
    COUNT(DISTINCT i.producto_codigo) as skus_con_stock,
    COUNT(DISTINCT i.producto_codigo) FILTER (WHERE i.cantidad_disponible = 0) as skus_sin_stock
FROM ubicaciones u
LEFT JOIN inventario_actual i ON u.id = i.tienda_codigo
WHERE u.activo = true
GROUP BY u.id, u.nombre, u.tipo, u.region;

CREATE UNIQUE INDEX ON mv_bi_stock_por_ubicacion(ubicacion_id);

-- Vista: GMROI y rotación por producto-ubicación
CREATE MATERIALIZED VIEW mv_bi_producto_metricas AS
WITH ventas_30d AS (
    SELECT
        producto_id,
        ubicacion_id,
        SUM(venta_total) as venta_total,
        SUM(costo_total) as costo_total,
        SUM(utilidad_bruta) as utilidad_bruta,
        AVG(margen_bruto_pct) as margen_promedio
    FROM ventas
    WHERE fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY producto_id, ubicacion_id
),
stock_promedio AS (
    SELECT
        producto_codigo,
        tienda_codigo,
        AVG(valor_inventario) as inv_promedio
    FROM inventario_actual
    GROUP BY producto_codigo, tienda_codigo
)
SELECT
    v.producto_id,
    v.ubicacion_id,
    v.venta_total as ventas_30d,
    v.utilidad_bruta,
    v.margen_promedio,
    s.inv_promedio as inventario_promedio,
    CASE WHEN s.inv_promedio > 0
         THEN v.utilidad_bruta / s.inv_promedio
         ELSE 0 END as gmroi,
    CASE WHEN s.inv_promedio > 0
         THEN (v.costo_total / s.inv_promedio) * 12
         ELSE 0 END as rotacion_anual
FROM ventas_30d v
JOIN stock_promedio s ON v.producto_id = s.producto_codigo
                     AND v.ubicacion_id = s.tienda_codigo;

CREATE INDEX ON mv_bi_producto_metricas(producto_id);
CREATE INDEX ON mv_bi_producto_metricas(ubicacion_id);
CREATE INDEX ON mv_bi_producto_metricas(gmroi DESC);
CREATE INDEX ON mv_bi_producto_metricas(rotacion_anual DESC);

-- Vista: Cobertura de productos
CREATE MATERIALIZED VIEW mv_bi_cobertura_productos AS
WITH tiendas_activas AS (
    SELECT COUNT(*) as total FROM ubicaciones WHERE tipo = 'tienda' AND activo = true
),
cobertura AS (
    SELECT
        p.id as producto_id,
        p.nombre,
        p.cedi_origen_id as categoria,
        COUNT(DISTINCT i.tienda_codigo) FILTER (WHERE i.cantidad_disponible > 0) as tiendas_con_stock,
        (SELECT total FROM tiendas_activas) as tiendas_total
    FROM productos p
    LEFT JOIN inventario_actual i ON p.id = i.producto_codigo
    WHERE p.activo = true
    GROUP BY p.id, p.nombre, p.cedi_origen_id
)
SELECT
    *,
    ROUND(tiendas_con_stock::numeric / NULLIF(tiendas_total, 0) * 100, 1) as cobertura_pct
FROM cobertura;

CREATE INDEX ON mv_bi_cobertura_productos(producto_id);
CREATE INDEX ON mv_bi_cobertura_productos(cobertura_pct);

-- Función para refrescar vistas (llamar desde cron o ETL)
CREATE OR REPLACE FUNCTION refresh_bi_views() RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_stock_por_ubicacion;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_producto_metricas;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bi_cobertura_productos;
END;
$$ LANGUAGE plpgsql;
```

---

## Fase 3: Frontend - Componentes de BI

### 3.1 Layout Principal: `BusinessIntelligence.tsx`

```tsx
// Navegación por tabs
const tabs = [
    { id: 'impact', label: 'Fluxion Impact', icon: TrendingUp },
    { id: 'stores', label: 'Por Tienda', icon: Store },
    { id: 'products', label: 'Por Producto', icon: Package },
    { id: 'profitability', label: 'Rentabilidad', icon: DollarSign },
    { id: 'coverage', label: 'Cobertura', icon: Map },
];

// Renderizado condicional basado en tab activo
```

### 3.2 Componente: `FluxionImpact.tsx`

**Secciones:**
1. **Cards KPI** - Stock actual, baseline, capital liberado, fill rate
2. **Gráfico de tendencia** - Línea temporal de stock total (Recharts LineChart)
3. **Tabla por región** - Caracas vs Valencia con métricas
4. **Ranking de tiendas** - Top mejoras y oportunidades

### 3.3 Componente: `CoverageDistribution.tsx`

**Secciones:**
1. **Resumen** - Cards con totales de cobertura
2. **Productos con baja cobertura** - Tabla con filtros
3. **Stock atrapado en CEDI** - Lista con valores $
4. **Oportunidades** - "Producto X vende en A, falta en B"
5. **Matriz de cobertura** - Heatmap interactivo (productos × tiendas)

### 3.4 Servicio: `biService.ts`

```typescript
// frontend/src/services/biService.ts

export const biService = {
    // Fluxion Impact
    getImpactSummary: () => http.get('/api/bi/impact/summary'),
    getImpactTrend: (region?: string) => http.get('/api/bi/impact/trend', { params: { region } }),
    getImpactByStore: () => http.get('/api/bi/impact/by-store'),

    // Store Analysis
    getStoreKPIs: (ubicacionId: string) => http.get(`/api/bi/store/${ubicacionId}/kpis`),
    getStoreTopBottom: (ubicacionId: string, metric: string) =>
        http.get(`/api/bi/store/${ubicacionId}/top-bottom-products`, { params: { metric } }),
    getStoresRanking: (metric: string) =>
        http.get('/api/bi/stores/ranking', { params: { metric } }),

    // Product Analysis
    getProductMetrics: (productoId: string) => http.get(`/api/bi/product/${productoId}/metrics`),
    getProductsMatrix: (params: { ubicacion_id?: string, categoria?: string }) =>
        http.get('/api/bi/products/matrix', { params }),
    getProductsStars: (limit?: number) => http.get('/api/bi/products/stars', { params: { limit } }),
    getProductsEliminate: (limit?: number) => http.get('/api/bi/products/eliminate', { params: { limit } }),

    // Profitability
    getProfitabilityByCategory: () => http.get('/api/bi/profitability/by-category'),
    getTopProfitableProducts: (metric: string) =>
        http.get('/api/bi/profitability/top-products', { params: { metric } }),

    // Coverage
    getCoverageSummary: () => http.get('/api/bi/coverage/summary'),
    getLowCoverageProducts: (params: { region?: string, limit?: number }) =>
        http.get('/api/bi/coverage/low-coverage-products', { params }),
    getTrappedInCedi: (cedi?: string) =>
        http.get('/api/bi/coverage/trapped-in-cedi', { params: { cedi } }),
    getCoverageOpportunities: (limit?: number) =>
        http.get('/api/bi/coverage/opportunities', { params: { limit } }),
    getCoverageMatrix: (params: { categoria?: string, page?: number }) =>
        http.get('/api/bi/coverage/matrix', { params }),
    getStoreGaps: () => http.get('/api/bi/coverage/store-gaps'),
};
```

---

## Fase 4: Navegación y Routing

### 4.1 Agregar Ruta en `App.tsx`

```tsx
// Nueva ruta para BI
<Route path="/bi" element={<BusinessIntelligence />} />
<Route path="/bi/:tab" element={<BusinessIntelligence />} />
```

### 4.2 Agregar al Header

```tsx
// En Header.tsx, agregar a navItems
{ path: '/bi', label: 'Business Intelligence', icon: BarChart3 }
```

---

## Plan de Implementación por Fases

### Fase 1: Fundación (Backend Core)
1. Crear migración `020_bi_materialized_views_UP.sql`
2. Crear `backend/services/bi_calculations.py`
3. Crear `backend/routers/business_intelligence.py` con endpoints básicos
4. Registrar router en `main.py`
5. **Probar**: Verificar endpoints con Swagger UI

### Fase 2: Fluxion Impact
1. Implementar endpoints de `/api/bi/impact/*`
2. Crear componente `FluxionImpact.tsx`
3. Crear `CapitalTrendChart.tsx` (Recharts)
4. **Probar**: Verificar datos reales de stock

### Fase 3: Cobertura y Distribución
1. Implementar endpoints de `/api/bi/coverage/*`
2. Crear componente `CoverageDistribution.tsx`
3. Crear `CoverageHeatmap.tsx` para matriz visual
4. **Probar**: Verificar productos atrapados en CEDI

### Fase 4: Análisis por Tienda
1. Implementar endpoints de `/api/bi/store/*`
2. Crear componente `StoreAnalysis.tsx`
3. **Probar**: Comparar KPIs entre tiendas

### Fase 5: Análisis por Producto
1. Implementar endpoints de `/api/bi/product/*` y `/api/bi/products/*`
2. Crear componente `ProductAnalysis.tsx`
3. Crear `GMROIScatterPlot.tsx` (Chart.js scatter)
4. **Probar**: Verificar clasificación ESTRELLA/PERRO

### Fase 6: Rentabilidad
1. Implementar endpoints de `/api/bi/profitability/*`
2. Crear componente `Profitability.tsx`
3. **Probar**: Validar cálculos de margen y GMROI

### Fase 7: Integración Final
1. Crear layout `BusinessIntelligence.tsx` con tabs
2. Agregar `biService.ts`
3. Agregar ruta y navegación
4. **Probar**: Flujo completo de navegación

---

## Consideraciones de Performance

1. **Vistas Materializadas**: Refrescar cada 30 min (sincronizado con ETL de inventario)
2. **Paginación**: Matriz de cobertura puede tener miles de productos
3. **Cache TTL**: 5 min para endpoints de resumen, 1 min para detalles
4. **Índices**: Agregar índices en gmroi, rotacion, cobertura_pct

---

## Configuración Requerida

1. **Fecha Baseline POR TIENDA**: Tabla `tiendas_fluxion_activacion` con fecha de inicio de cada tienda
   ```sql
   CREATE TABLE tiendas_fluxion_activacion (
       ubicacion_id VARCHAR(50) PRIMARY KEY,
       fecha_activacion DATE NOT NULL,
       activo BOOLEAN DEFAULT true
   );
   -- Datos iniciales:
   INSERT INTO tiendas_fluxion_activacion VALUES ('tienda_18', '2025-12-15', true);
   ```
2. **Umbral de "bajo stock"**: 20 unidades (configurable) - para considerar como "casi sin stock"

3. **Umbrales GMROI/Rotación** (basados en benchmarks de la industria):

   ### Benchmarks de Referencia (Grocery/Supermarket Global)

   | Métrica | Benchmark Industria | Fuente |
   |---------|---------------------|--------|
   | **GMROI** | > 1.0 genera ganancia, ~2.0 promedio retail | [Shopify](https://www.shopify.com/retail/gmroi), [Retalon](https://retalon.com/blog/what-is-gmroi) |
   | **Rotación Grocery General** | 10-15 vueltas/año | [CSIMarket](https://csimarket.com/Industry/industry_Efficiency.php?ind=1305), [MarktPOS](https://www.marktpos.com/blog/what-is-a-good-inventory-turnover-rate-for-grocery-stores) |
   | **Rotación Perecederos** | 20-70 vueltas/año (frutas 29x, panadería 69x) | [Retalon](https://retalon.com/blog/inventory-turnover-ratio) |
   | **Rotación No Perecederos** | 4-8 vueltas/año | Industria general |
   | **Margen Neto Grocery** | 1.7% promedio 2024 | [FMI](https://www.fmi.org/our-research/food-industry-facts) |

   ### Umbrales Propuestos para La Granja

   | Categoría | GMROI Alto | GMROI Bajo | Rotación Alta | Rotación Baja |
   |-----------|------------|------------|---------------|---------------|
   | **Seco** | > 2.5 | < 1.5 | > 8/año | < 4/año |
   | **Frío** | > 2.0 | < 1.2 | > 15/año | < 8/año |
   | **Verde (Fruver)** | > 1.8 | < 1.0 | > 25/año | < 12/año |

   *Nota: Verde tiene menor GMROI esperado pero MUCHO mayor rotación por ser perecedero*

4. **Exclusiones**: Lista de productos a excluir de análisis (ej: 003760)
5. **Mapeo Región-CEDI**:
   - CARACAS: cedi_caracas → tienda_17, tienda_18
   - VALENCIA: cedi_seco, cedi_frio, cedi_verde → tiendas 01-16, 19, 20

---

## Archivos a Crear/Modificar

### Crear
- `backend/routers/business_intelligence.py`
- `backend/services/bi_calculations.py`
- `database/migrations/020_bi_materialized_views_UP.sql`
- `frontend/src/components/bi/BusinessIntelligence.tsx`
- `frontend/src/components/bi/FluxionImpact.tsx`
- `frontend/src/components/bi/StoreAnalysis.tsx`
- `frontend/src/components/bi/ProductAnalysis.tsx`
- `frontend/src/components/bi/Profitability.tsx`
- `frontend/src/components/bi/CoverageDistribution.tsx`
- `frontend/src/components/bi/charts/CapitalTrendChart.tsx`
- `frontend/src/components/bi/charts/GMROIScatterPlot.tsx`
- `frontend/src/components/bi/charts/CoverageHeatmap.tsx`
- `frontend/src/services/biService.ts`

### Modificar
- `backend/main.py` - Registrar router
- `frontend/src/App.tsx` - Agregar ruta
- `frontend/src/components/layout/Header.tsx` - Agregar navegación

---

## Fase 8: Documentación (docs-site)

### 8.1 Estructura de Archivos Docusaurus

```
docs-site/docs/
└── modulos/
    └── business-intelligence/          # NUEVO - Carpeta del módulo
        ├── index.md                    # Introducción al módulo BI
        ├── fluxion-impact.md           # Documentación de Fluxion Impact
        ├── analisis-tienda.md          # Análisis por Tienda
        ├── analisis-producto.md        # Análisis por Producto
        ├── rentabilidad.md             # Rentabilidad y GMROI
        ├── cobertura-distribucion.md   # Cobertura y Distribución
        └── metricas-kpis.md            # Glosario de métricas y KPIs
```

### 8.2 Contenido de Documentación

#### `index.md` - Introducción al Módulo
```markdown
---
sidebar_position: 1
title: Business Intelligence
description: Módulo de inteligencia de negocio para análisis de rentabilidad, cobertura y ROI
---

# Business Intelligence

El módulo de Business Intelligence proporciona análisis avanzado para la toma de decisiones estratégicas.

## Pilares del Módulo

1. **Fluxion Impact** - Mide el ROI del sistema
2. **Análisis por Tienda** - Compara rendimiento entre tiendas
3. **Análisis por Producto** - Identifica productos estrella y candidatos a eliminar
4. **Rentabilidad** - GMROI y márgenes por categoría
5. **Cobertura** - Distribución de productos en la red
```

#### `fluxion-impact.md` - Fluxion Impact
```markdown
---
sidebar_position: 2
title: Fluxion Impact
description: Mide el retorno de inversión del sistema Fluxion
---

# Fluxion Impact

## ¿Qué mide?

Fluxion Impact muestra el impacto financiero del sistema en tu inventario:

- **Capital Liberado**: Dinero que antes estaba "amarrado" en exceso de inventario
- **Reducción de Stock**: Porcentaje de reducción vs el baseline inicial
- **Fill Rate**: Nivel de servicio (productos disponibles cuando se necesitan)

## Cómo se calcula el Baseline

El baseline se calcula **por tienda** desde su fecha de activación con Fluxion.
Esto permite medir el impacto real incluso cuando las tiendas se activan en fechas diferentes.

## Interpretación

| Métrica | Bueno | Excelente |
|---------|-------|-----------|
| Reducción de Stock | > 20% | > 35% |
| Fill Rate | > 95% | > 98% |
| Capital Liberado | Positivo | > $100K |
```

#### `cobertura-distribucion.md` - Cobertura
```markdown
---
sidebar_position: 6
title: Cobertura y Distribución
description: Análisis de distribución de productos en la red de tiendas
---

# Cobertura y Distribución

## Problema que Resuelve

Detecta ineficiencias de distribución:
- Productos que solo venden en algunas tiendas
- Stock "atrapado" en CEDI sin despachar
- Oportunidades de venta perdidas por falta de distribución

## Métricas Clave

### Cobertura de Producto
Porcentaje de tiendas donde un producto tiene stock disponible.

### Stock Atrapado en CEDI
Productos con stock en el Centro de Distribución pero menos de 20 unidades en tiendas.
Indica que el producto no se está distribuyendo adecuadamente.

### Oportunidades de Distribución
Productos que venden bien en una tienda pero no existen en otras similares.

## Lógica por Región

- **CARACAS**: CEDI Caracas abastece solo a Paraíso y Artigas
- **VALENCIA**: CEDIs Seco/Frío/Verde abastecen a las 17 tiendas de Valencia
```

#### `metricas-kpis.md` - Glosario
```markdown
---
sidebar_position: 7
title: Métricas y KPIs
description: Glosario de métricas utilizadas en Business Intelligence
---

# Glosario de Métricas

## GMROI (Gross Margin Return on Investment)

**Fórmula**: `Utilidad Bruta / Inventario Promedio`

Mide cuántos dólares de utilidad generas por cada dólar invertido en inventario.

| Categoría | GMROI Alto | GMROI Bajo |
|-----------|------------|------------|
| Seco | > 2.5 | < 1.5 |
| Frío | > 2.0 | < 1.2 |
| Verde | > 1.8 | < 1.0 |

## Rotación de Inventario

**Fórmula**: `(Costo de Ventas / Inventario Promedio) × 12`

Cuántas veces al año "rota" tu inventario.

| Categoría | Alta | Baja |
|-----------|------|------|
| Seco | > 8/año | < 4/año |
| Frío | > 15/año | < 8/año |
| Verde | > 25/año | < 12/año |

## Matriz de Clasificación

| | Alta Rotación | Baja Rotación |
|---|---|---|
| **Alto GMROI** | ⭐ ESTRELLA | 🤔 NICHO |
| **Bajo GMROI** | 🐄 VACA | ❌ PERRO |

- **ESTRELLA**: Priorizar, mantener stock
- **VACA**: Mantener volumen, negociar precios
- **NICHO**: Evaluar, puede ser especializado
- **PERRO**: Candidato a eliminar
```

### 8.3 Actualizar Sidebar

Modificar `docs-site/sidebars.ts`:

```typescript
// Agregar después de 'Administrador' en el array de items de Módulos:
{
  type: 'category',
  label: 'Business Intelligence',
  items: [
    'modulos/business-intelligence/index',
    'modulos/business-intelligence/fluxion-impact',
    'modulos/business-intelligence/analisis-tienda',
    'modulos/business-intelligence/analisis-producto',
    'modulos/business-intelligence/rentabilidad',
    'modulos/business-intelligence/cobertura-distribucion',
    'modulos/business-intelligence/metricas-kpis',
  ],
},
```

### 8.4 Agregar a Conceptos

Crear `docs-site/docs/conceptos/gmroi.md`:

```markdown
---
sidebar_position: 5
title: GMROI
description: Retorno de la inversión en inventario
---

# GMROI - Gross Margin Return on Investment

El GMROI es una métrica financiera que mide la eficiencia con la que
tu inventario genera utilidades.

## Fórmula

```
GMROI = Utilidad Bruta / Costo Promedio de Inventario
```

## Interpretación

- **GMROI > 1**: El producto genera más utilidad que lo que cuesta mantenerlo
- **GMROI < 1**: El producto pierde dinero
- **GMROI = 2**: Por cada $1 invertido, generas $2 de utilidad

## Benchmarks de la Industria (Grocery)

- Promedio general: ~2.0
- Supermercados y grocery: 2.0 - 3.0
- Productos de alta rotación: 1.5 - 2.5
- Productos especializados: 3.0+
```

---

## Archivos de Documentación a Crear

### docs-site/docs/modulos/business-intelligence/
- `index.md` - Introducción al módulo
- `fluxion-impact.md` - Documentación de Fluxion Impact
- `analisis-tienda.md` - Análisis por Tienda
- `analisis-producto.md` - Análisis por Producto
- `rentabilidad.md` - Rentabilidad y GMROI
- `cobertura-distribucion.md` - Cobertura y Distribución
- `metricas-kpis.md` - Glosario de métricas

### docs-site/docs/conceptos/
- `gmroi.md` - Concepto de GMROI

### Modificar
- `docs-site/sidebars.ts` - Agregar categoría Business Intelligence
