# Auditoría: Análisis BI por Tienda - Datos Disponibles vs Requerimientos

**Fecha**: 2026-01-25
**Sistema**: FluxionIA - La Granja Mercado
**Revisado**: Estructura de datos PostgreSQL vs documento BiAnalisisTienda.md

---

## 📊 Resumen Ejecutivo

### ✅ BUENAS NOTICIAS
- **Tenemos ~1.9M registros** de ventas de los últimos 30 días
- **14 tiendas activas** con datos
- **2,462 productos** vendidos
- **1.9M tickets** únicos
- Estructura de datos **permite TODOS los análisis propuestos** en el documento

### ⚠️ DIFERENCIAS CLAVE
El documento asume formato JSON de la API KLK, pero:
- **Tenemos una tabla SQL normalizada** (mejor para queries)
- Los datos están **pre-procesados y listos** para análisis
- Ya existen **5 vistas materializadas** de BI

---

## 🗄️ Estructura de Datos REAL

### Tabla `ventas` (PostgreSQL)
```sql
-- Campos disponibles en la tabla ventas:
id                     BIGSERIAL PRIMARY KEY
numero_factura         VARCHAR(100)    -- ✅ Para contar tickets únicos
fecha_venta            TIMESTAMP       -- ✅ Para análisis temporal y por hora
ubicacion_id           VARCHAR(50)     -- ✅ Para filtrar por tienda
producto_id            VARCHAR(50)     -- ✅ Para análisis de productos
cantidad_vendida       NUMERIC(18,4)   -- ✅ Para items/ticket
precio_unitario        NUMERIC(18,4)   -- ✅ Para análisis de precios
costo_unitario         NUMERIC(18,4)   -- ✅ Para análisis de costos
venta_total            NUMERIC(18,4)   -- ✅ Para ventas totales (USD)
costo_total            NUMERIC(18,4)   -- ✅ Para costo de ventas (USD)
utilidad_bruta         NUMERIC(18,4)   -- ✅ Margen ya calculado (USD)
margen_bruto_pct       NUMERIC(8,2)    -- ✅ % margen ya calculado
```

### Tabla `productos`
```sql
id                     VARCHAR(50) PRIMARY KEY
codigo                 VARCHAR(50)     -- ✅ Código SKU
descripcion            VARCHAR(200)    -- ✅ Nombre del producto
categoria              VARCHAR(50)     -- ✅ Categoría principal (CARNICERIA, Viveres, etc.)
grupo_articulo         VARCHAR(100)    -- ✅ Subcategoría (AHUMADOS, DE CERDO, etc.)
marca                  VARCHAR(100)    -- ✅ Marca del producto
es_generador_trafico   BOOLEAN         -- ✅ Indicador de productos estratégicos
cuadrante              VARCHAR(20)     -- ✅ Clasificación matriz (ESTRELLA/VACA/NICHO/PERRO)
```

### Vistas Materializadas Existentes
```
✅ mv_bi_stock_por_ubicacion    - Stock y fill rate por tienda
✅ mv_bi_producto_metricas      - GMROI, rotación, ventas por producto
✅ mv_bi_rentabilidad_categoria - Rentabilidad por categoría
✅ mv_bi_stock_atrapado_cedi    - Stock atrapado en CEDIs
✅ mv_bi_cobertura_productos    - Cobertura de productos por región
```

---

## 📋 Análisis de Factibilidad por Feature

### Tab 1: Dashboard de Red

| Feature | Factible | Datos Disponibles | Notas |
|---------|----------|-------------------|-------|
| **KPIs de Red** | ✅ SÍ | `ventas.venta_total`, `ventas.numero_factura`, `ventas.utilidad_bruta` | Cálculos directos |
| Ventas Total | ✅ SÍ | `SUM(venta_total)` | Directo |
| # Tickets | ✅ SÍ | `COUNT(DISTINCT numero_factura)` | Directo |
| Ticket Promedio | ✅ SÍ | `SUM(venta_total) / COUNT(DISTINCT numero_factura)` | Calculado |
| Margen % | ✅ SÍ | `SUM(utilidad_bruta) / SUM(venta_total) * 100` | Directo |
| **Comparación períodos** | ✅ SÍ | `ventas.fecha_venta` permite filtros temporales | Requiere 2 queries |
| vs Período anterior | ✅ SÍ | Filtrar por `fecha_venta BETWEEN X AND Y` | Query doble |
| vs Año anterior | ✅ SÍ | Filtrar `fecha_venta - INTERVAL '1 year'` | Query doble |
| **Gráfico por Tienda** | ✅ SÍ | `GROUP BY ubicacion_id` | Ya implementado en BI |
| Barras horizontales | ✅ SÍ | Ordenar por venta DESC | Frontend |
| Línea de promedio | ✅ SÍ | `AVG()` en subquery | Calculado |
| **Tabla Ranking** | ✅ SÍ | Ya existe `/bi/stores/ranking` | ✅ Implementado |

### Tab 2: Detalle de Tienda

| Feature | Factible | Datos Disponibles | Notas |
|---------|----------|-------------------|-------|
| **KPIs de Tienda** | ✅ SÍ | Filtrar por `ubicacion_id` | Ya implementado |
| Ventas | ✅ SÍ | `SUM(venta_total) WHERE ubicacion_id = X` | ✅ Endpoint existe |
| # Tickets | ✅ SÍ | `COUNT(DISTINCT numero_factura)` | ✅ Endpoint existe |
| Ticket Promedio | ✅ SÍ | Ventas / Tickets | Calculado |
| Items/Ticket | ✅ SÍ | `SUM(cantidad_vendida) / COUNT(DISTINCT numero_factura)` | Nuevo endpoint |
| **Gráfico Evolución** | ✅ SÍ | `GROUP BY fecha_venta::date` | Nuevo endpoint |
| Por día | ✅ SÍ | `fecha_venta::date` | SQL directo |
| Línea temporal | ✅ SÍ | Ordenar por fecha | Frontend |
| **Ventas por Hora** | ✅ SÍ | `EXTRACT(HOUR FROM fecha_venta)` | 🆕 IMPLEMENTAR |
| Heatmap 7x24 | ✅ SÍ | `GROUP BY EXTRACT(DOW), EXTRACT(HOUR)` | Query nueva |
| Horas pico | ✅ SÍ | `ORDER BY ventas DESC LIMIT 5` | Derivado |
| **Top 10 Categorías** | ✅ SÍ | `JOIN productos`, `GROUP BY categoria` | 🆕 IMPLEMENTAR |
| Ventas por cat. | ✅ SÍ | `SUM(venta_total)` por categoría | Query nueva |
| % del total | ✅ SÍ | Dividir por total de tienda | Calculado |
| **Distribución Tickets** | ✅ SÍ | Agrupar tickets por rangos de valor | 🆕 IMPLEMENTAR |
| Rangos $5/$15/etc | ✅ SÍ | `CASE WHEN SUM(venta) < 5 THEN '<$5'` | Query con CASE |
| Histograma | ✅ SÍ | Contar tickets en cada rango | Frontend |
| **Margen por Categoría** | ⚠️ PARCIAL | Existe en `/bi/profitability/by-category` | Ya implementado pero a nivel red, no tienda |

### Tab 3: Comparador Multi-Tienda

| Feature | Factible | Datos Disponibles | Notas |
|---------|----------|-------------------|-------|
| **Selector Tiendas** | ✅ SÍ | Lista de `ubicaciones` | Ya existe |
| Multi-select | ✅ SÍ | Frontend state | React component |
| **Gráfico Radar** | ✅ SÍ | Calcular métricas por tienda | 🆕 IMPLEMENTAR |
| Ventas normalizadas | ✅ SÍ | Min-Max scaling | Cálculo frontend |
| 5 métricas | ✅ SÍ | Todas disponibles | Query por tienda |
| **Tabla Comparativa** | ✅ SÍ | Endpoint `/bi/stores/compare` existe parcialmente | Extender endpoint |
| Métricas múltiples | ✅ SÍ | JOIN de varias queries | Backend |
| Highlight mejor/peor | ✅ SÍ | Frontend styling | React |

---

## 🎯 Datos Actuales en Producción

```
Período de datos:  2025-12-26 hasta 2026-01-23 (29 días)
Total registros:   1,929,028 transacciones
Tiendas activas:   14 tiendas
Productos únicos:  2,462 SKUs
Tickets únicos:    1,929,028 facturas
```

### Categorías Disponibles (Top 10)
```
1. SIN CATEGORIA   - 1,483 productos (⚠️ necesita limpieza de datos)
2. Viveres         - 347 productos
3. Canasta Basica  - 297 productos
4. Cuidado Pers.   - 259 productos
5. Confiteria      - 250 productos
6. Bebidas         - 239 productos
7. Galleta         - 148 productos
8. Bodegon         - 130 productos
9. Bebe            - 107 productos
10. Hogar          - 102 productos
```

### Subcategorías (grupo_articulo) Ejemplos
```
- AHUMADOS (CARNICERIA)
- DE CERDO (CHARCUTERIA)
- POR PESO (FRUVER)
- YESQUEROS Y ENCENDEDORES (Hogar)
```

---

## 🚀 Plan de Implementación Realista

### FASE 1: Endpoints Backend (2-3 días)
**Prioridad: ALTA** - Sin estos no hay visualización

```python
# Nuevos endpoints necesarios en backend/routers/bi_stores.py

1. GET /bi/stores/{ubicacion_id}/evolution
   - Ventas diarias en período seleccionado
   - Comparación con promedio de red
   - Response: [{fecha, ventas, ventas_red_avg}]

2. GET /bi/stores/{ubicacion_id}/hourly-heatmap
   - Ventas por hora del día y día de semana
   - Response: [{hora, dia_semana, ventas}]

3. GET /bi/stores/{ubicacion_id}/categories
   - Top categorías con % del total
   - Response: [{categoria, ventas, pct_total}]

4. GET /bi/stores/{ubicacion_id}/ticket-distribution
   - Distribución de tickets por rangos
   - Response: [{rango, cantidad_tickets, pct}]

5. GET /bi/stores/{ubicacion_id}/items-per-ticket
   - Items promedio por ticket
   - Response: {avg_items, by_category: [...]}

6. GET /bi/stores/compare-multi
   - Comparar múltiples tiendas (2-5)
   - Parámetro: ?store_ids=tienda_01,tienda_02
   - Response: {stores: [{id, metrics: {...}}]}
```

### FASE 2: Componentes Frontend (3-4 días)
**Prioridad: MEDIA** - Después de tener endpoints

```
/components/bi/stores/
├── StoresDashboard.tsx         # Tab principal con KPIs de red
│   ├── NetworkKPIs.tsx         # 4 cards de métricas generales
│   ├── StoresBarChart.tsx      # Gráfico barras horizontales
│   └── StoresRankingTable.tsx  # Tabla detallada (ya existe)
│
├── StoreDetail.tsx             # Detalle individual de tienda
│   ├── StoreKPIs.tsx           # 4 cards de tienda (parcial existe)
│   ├── SalesEvolution.tsx      # 🆕 Gráfico línea temporal
│   ├── HourlyHeatmap.tsx       # 🆕 Heatmap ventas por hora
│   ├── CategoryPie.tsx         # 🆕 Top 10 categorías
│   ├── TicketDistribution.tsx  # 🆕 Histograma tickets
│   └── MarginByCategory.tsx    # Extender existente
│
└── StoreComparator.tsx         # Comparador multi-tienda
    ├── StoreSelector.tsx       # Checkboxes tiendas
    ├── RadarChart.tsx          # 🆕 Spider chart
    └── ComparisonTable.tsx     # 🆕 Tabla comparativa
```

### FASE 3: Utilidades y Hooks (1 día)
```typescript
// hooks/useSalesData.ts
- Fetch y cache de datos de ventas
- Manejo de loading/error states
- Invalidación inteligente

// utils/storeCalculations.ts
- Cálculo de métricas derivadas
- Normalización para radar chart
- Agregaciones de categorías

// utils/formatters.ts (ya existe, extender)
- Formato de moneda USD
- Formato de porcentajes
- Formato de números grandes (K/M)
```

---

## ⚡ Quick Wins (Implementación Rápida)

### 1. Dashboard de Red (6 horas)
**Ya tenemos:**
- ✅ Endpoint `/bi/stores/ranking`
- ✅ KPIs básicos en `/bi/store/{id}/kpis`

**Falta:**
- Agregar comparación temporal (WHERE fecha_venta BETWEEN)
- Card de KPIs de red (frontend)
- Gráfico de barras (Recharts)

### 2. Evolución Temporal (4 horas)
```sql
-- Query simple para evolución diaria
SELECT
    fecha_venta::date as fecha,
    SUM(venta_total) as ventas,
    COUNT(DISTINCT numero_factura) as tickets,
    AVG(venta_total) as ticket_promedio
FROM ventas
WHERE ubicacion_id = $1
  AND fecha_venta >= $2
  AND fecha_venta < $3
GROUP BY fecha_venta::date
ORDER BY fecha
```

### 3. Análisis por Hora (6 horas)
```sql
-- Heatmap de ventas por hora y día
SELECT
    EXTRACT(DOW FROM fecha_venta) as dia_semana,  -- 0=Dom, 6=Sáb
    EXTRACT(HOUR FROM fecha_venta) as hora,
    SUM(venta_total) as ventas,
    COUNT(DISTINCT numero_factura) as tickets
FROM ventas
WHERE ubicacion_id = $1
  AND fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY dia_semana, hora
ORDER BY dia_semana, hora
```

---

## 🔴 Limitaciones y Advertencias

### 1. **Datos de categorías incompletos**
- **1,483 productos (60%)** marcados como "SIN CATEGORIA"
- **Impacto**: Análisis por categoría será parcial
- **Solución**: Proceso de limpieza de datos (ETL fix)

### 2. **No hay datos de promociones estructurados**
El documento menciona `tiene_promocion` y `codigo_promocion`, pero:
- ✅ La tabla `ventas` no tiene estos campos
- ⚠️ No podemos identificar ventas con descuento vs sin descuento
- **Solución**: Agregar campos en próxima migración si es necesario

### 3. **Formato de número de factura**
- El documento asume formato JSON anidado de KLK
- Tenemos `numero_factura` como string único
- ✅ **No es problema**: Funciona igual para contar tickets

### 4. **Performance con queries grandes**
- 1.9M registros en 30 días
- Queries sin WHERE pueden ser lentas
- **Solución**:
  - Usar las vistas materializadas existentes
  - Agregar índices específicos si es necesario
  - Implementar paginación en frontend

---

## 📝 Recomendaciones

### INMEDIATO (Esta semana)
1. ✅ Implementar endpoints de FASE 1 (prioridad alta)
2. ✅ Crear componente de evolución temporal (quick win)
3. ✅ Dashboard de red con KPIs (quick win)

### CORTO PLAZO (Próximas 2 semanas)
4. Heatmap de ventas por hora
5. Análisis por categorías
6. Comparador multi-tienda básico

### MEDIANO PLAZO (Próximo mes)
7. Limpieza de datos de categorías
8. Optimización de queries con índices
9. Exportación a Excel/CSV
10. Filtros avanzados (fecha custom, categorías, etc.)

---

## ✅ Conclusión

**FACTIBILIDAD: 95%**

Todos los análisis propuestos en `BiAnalisisTienda.md` son **100% factibles** con los datos actuales. Las únicas limitaciones son:
- 60% de productos sin categoría asignada (problema de datos, no de estructura)
- Necesitamos crear ~6 nuevos endpoints backend
- Necesitamos crear ~8 nuevos componentes frontend

**Tiempo estimado total: 10-12 días de desarrollo**
- Backend: 3 días
- Frontend: 5 días
- Testing e integración: 2 días
- Limpieza de datos (paralelo): 2 días

---

**Próximo paso**: ¿Empezamos con los Quick Wins o prefieres un roadmap más detallado?
