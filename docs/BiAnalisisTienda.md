# Prompt para Claude Code: Rediseño Módulo BI por Tienda - FluxionIA

## Contexto del Proyecto

FluxionIA es un sistema de gestión de inventario inteligente para **La Granja**, una cadena de supermercados venezolana con:
- 18 tiendas en Valencia
- 2 tiendas en Caracas (Paraíso y Artigas)
- 2 tiendas adicionales en Caracas planeadas para marzo

El sistema procesa aproximadamente **500,000 transacciones mensuales**.

## Objetivo

Rediseñar completamente el módulo de **Business Intelligence por Tienda** (`/bi?tab=stores`). El módulo actual muestra un ranking básico con GMROI y Fill Rate, pero necesitamos un dashboard mucho más completo y accionable.

## Stack Tecnológico

- **Framework**: React/Next.js (mantener consistencia con el proyecto existente)
- **Gráficos**: Usar Recharts (ya está en el proyecto) o Chart.js
- **Estilos**: Tailwind CSS
- **Ubicación**: El módulo está en `localhost:3000/bi?tab=stores`

---

## Estructura de Datos Disponible

Los datos de ventas vienen en este formato JSON (un registro por línea de factura):

```json
{
  "meta": {
    "sucursal_codigo": "SUC003",
    "fecha_desde": "2026-01-19",
    "fecha_hasta": "2026-01-19",
    "total_registros": 19193
  },
  "ventas": [
    {
      "numero_factura": "C001-01-00017426",
      "fecha": "2026-01-19",
      "hora": "22:14:34.2608027",
      "fecha_hora_completa": "2026-01-19T22:14:34",
      "linea": 1,
      "producto": [{
        "codigo_producto": "004801",
        "descripcion_producto": "GRANJA CARNE MOLIDA PREMIUM BANDEJA 500 GR",
        "marca_producto": "GRANJA",
        "categoria_producto": "DE RES",
        "grupo_articulo": "CARNICERIA",
        "subgrupo_producto": "PRIMERA",
        "codigo_barras": "100929000058"
      }],
      "cantidad": [{
        "codigo_almacen": "TANT",
        "nombre_almacen": "PISO DE VENTA",
        "cantidad_vendida": 2,
        "unidad_medida_venta": "UNIDAD",
        "factor_unidad_medida": 1
      }],
      "financiero": [{
        "costo_unitario_bs": 247.41,
        "costo_unitario_usd": 1,
        "precio_unitario_bs": 2101.511,
        "precio_unitario_usd": 6.1,
        "impuesto_porcentaje": 0,
        "impuesto_monto": 0,
        "porcentaje_descuento": 0,
        "monto_descuento": 0,
        "porcentaje_descuento_fidelizacion": 0,
        "monto_descuento_fidelizacion": 0,
        "porcentaje_descuento_forma_pago": 0,
        "monto_descuento_forma_pago": 0,
        "venta_total_bs": 4203.02,
        "venta_total_usd": 12.2,
        "costo_total_bs": 494.82,
        "costo_total_usd": 2,
        "utilidad_bruta_bs": 3708.2,
        "utilidad_bruta_usd": 10.2
      }],
      "total_factura": 5711.99,
      "tasa_usd": 344.51,
      "es_no_fiscal": false,
      "tiene_promocion": "",
      "codigo_promocion": ""
    }
  ]
}
```

### Campos Clave para Cálculos

| Campo | Ubicación | Uso |
|-------|-----------|-----|
| `numero_factura` | raíz | Identificar tickets únicos |
| `fecha_hora_completa` | raíz | Análisis por hora/día |
| `grupo_articulo` | producto[0] | Categoría principal (CARNICERIA, VIVERES, etc.) |
| `subgrupo_producto` | producto[0] | Subcategoría |
| `marca_producto` | producto[0] | Marca |
| `cantidad_vendida` | cantidad[0] | Unidades vendidas |
| `venta_total_usd` | financiero[0] | Venta en USD (usar este) |
| `costo_total_usd` | financiero[0] | Costo en USD |
| `utilidad_bruta_usd` | financiero[0] | Margen bruto USD |
| `monto_descuento` | financiero[0] | Descuentos aplicados |
| `tiene_promocion` | raíz | Si tiene promoción activa |

---

## Diseño del Módulo

### Arquitectura de Tabs

```
[Tab 1: Dashboard de Red] [Tab 2: Detalle de Tienda] [Tab 3: Comparador]
```

---

### Tab 1: Dashboard de Red (Vista Principal)

#### Filtros Globales (sticky en la parte superior)
- **Período**: Hoy | Últimos 7 días | Últimos 30 días | Mes actual | Custom (date picker)
- **Región**: Todas | Valencia | Caracas
- **Comparar vs**: Período anterior | Mismo período año anterior

#### KPIs de Red (4 cards grandes)
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Ventas Total │ │ # Tickets    │ │ Ticket Prom  │ │ Margen %     │
│ $1,234,567   │ │ 45,230       │ │ $27.30       │ │ 24.3%        │
│ +8.2% ▲      │ │ +5.1% ▲      │ │ +2.9% ▲      │ │ -0.5% ▼      │
│ vs anterior  │ │ vs anterior  │ │ vs anterior  │ │ vs anterior  │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**Cálculos:**
- Ventas Total: `SUM(venta_total_usd)`
- # Tickets: `COUNT(DISTINCT numero_factura)`
- Ticket Promedio: `Ventas Total / # Tickets`
- Margen %: `SUM(utilidad_bruta_usd) / SUM(venta_total_usd) * 100`

#### Gráfico Principal: Ventas por Tienda
- **Tipo**: Barras horizontales ordenables
- **Mostrar**: Nombre tienda, venta en USD, variación % vs período comparado
- **Línea de referencia**: Promedio de la red (línea punteada vertical)
- **Colores**: Verde si está sobre promedio, rojo si está debajo
- **Ordenar por** (botones): Ventas | Ticket Promedio | Margen % | # Tickets

#### Tabla Ranking Detallado
Columnas:
| # | Tienda | Región | Ventas | vs Ant % | # Tickets | Ticket Prom | Items/Ticket | Margen % |
|---|--------|--------|--------|----------|-----------|-------------|--------------|----------|

- Click en cualquier fila → Navegar a Tab 2 con esa tienda seleccionada
- Highlight en hover
- Icono de flecha para indicar que es clickeable

---

### Tab 2: Detalle de Tienda

#### Header
- Nombre de tienda grande + Región
- Botón "← Volver a Red"
- Dropdown para comparar con otras tiendas (multi-select, máx 3)

#### KPIs de Tienda (4 cards)
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Ventas       │ │ # Tickets    │ │ Ticket Prom  │ │ Items/Ticket │
│ $145,230     │ │ 5,420        │ │ $26.75       │ │ 8.3          │
│ vs Red: +48% │ │ vs Red: +20% │ │ vs Red: +7%  │ │ vs Red: +12% │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**Nota**: "vs Red" compara contra el promedio de todas las tiendas.

#### Gráfico de Evolución (línea)
- Eje X: Días del período seleccionado
- Eje Y: Ventas en USD
- Líneas:
  - Tienda seleccionada (línea sólida, color primario)
  - Promedio de red (línea punteada gris)
  - Tiendas comparadas (líneas de otros colores, si hay seleccionadas)

#### Grid de 2x2 con gráficos secundarios

**Cuadrante 1: Ventas por Hora (heatmap o barras)**
- Eje X: Horas del día (7am - 10pm)
- Eje Y: Días de la semana (Lun-Dom)
- Color: Intensidad según volumen de ventas
- Objetivo: Identificar horas pico

**Cuadrante 2: Top 10 Categorías**
- Barras horizontales
- Mostrar: grupo_articulo, venta USD, % del total
- Ordenar por venta descendente

**Cuadrante 3: Distribución de Tickets**
- Histograma
- Rangos: <$5 | $5-15 | $15-30 | $30-50 | $50-100 | >$100
- Mostrar % de tickets en cada rango

**Cuadrante 4: Margen por Categoría**
- Barras horizontales
- Mostrar: grupo_articulo, margen %, utilidad USD
- Ordenar por margen % descendente
- Color: Verde >25%, amarillo 15-25%, rojo <15%

---

### Tab 3: Comparador Multi-Tienda

#### Selector de Tiendas
- Checkboxes para seleccionar múltiples tiendas (mínimo 2, máximo 5)
- Botón "Seleccionar todas Valencia" | "Seleccionar todas Caracas"

#### Gráfico Radar (Spider Chart)
Métricas en cada eje:
- Ventas (normalizado 0-100)
- Ticket Promedio
- # Tickets
- Items/Ticket
- Margen %

Cada tienda seleccionada = una línea de diferente color

#### Tabla Comparativa
| Métrica | Tienda 1 | Tienda 2 | Tienda 3 | Promedio Red |
|---------|----------|----------|----------|--------------|
| Ventas período | $145K | $132K | $128K | $98K |
| Ticket promedio | $26.75 | $27.00 | $24.50 | $25.00 |
| # Tickets/día | 774 | 699 | 745 | 640 |
| Items/ticket | 8.3 | 7.9 | 8.1 | 7.5 |
| Margen % | 25.1% | 24.8% | 23.9% | 24.0% |
| Categoría top | Carnicería | Charcutería | Viveres | - |
| Hora pico | 11am | 10am | 12pm | 11am |

- Highlight en verde el mejor valor de cada fila
- Highlight en rojo el peor valor de cada fila

---

## Especificaciones Técnicas

### Componentes a Crear

```
/components/bi/
├── StoresDashboard.tsx          # Tab 1 - Dashboard de Red
├── StoreDetail.tsx              # Tab 2 - Detalle de Tienda
├── StoreComparator.tsx          # Tab 3 - Comparador
├── components/
│   ├── KPICard.tsx              # Card reutilizable para KPIs
│   ├── StoreRankingTable.tsx    # Tabla con ranking
│   ├── SalesBarChart.tsx        # Gráfico de barras horizontal
│   ├── SalesLineChart.tsx       # Gráfico de evolución
│   ├── HourlyHeatmap.tsx        # Heatmap de ventas por hora
│   ├── CategoryChart.tsx        # Top categorías
│   ├── TicketDistribution.tsx   # Histograma de tickets
│   ├── MarginByCategory.tsx     # Margen por categoría
│   ├── RadarComparison.tsx      # Spider chart comparativo
│   └── ComparisonTable.tsx      # Tabla comparativa
├── hooks/
│   ├── useSalesData.ts          # Hook para fetch y transformar datos
│   ├── useStoreMetrics.ts       # Hook para calcular métricas por tienda
│   └── useFilters.ts            # Hook para manejar filtros globales
└── utils/
    ├── calculations.ts          # Funciones de cálculo de métricas
    └── formatters.ts            # Formateo de números, fechas, etc.
```

### Funciones de Cálculo (utils/calculations.ts)

```typescript
interface SalesLine {
  numero_factura: string;
  fecha_hora_completa: string;
  producto: { grupo_articulo: string; }[];
  cantidad: { cantidad_vendida: number; }[];
  financiero: {
    venta_total_usd: number;
    costo_total_usd: number;
    utilidad_bruta_usd: number;
  }[];
}

// Calcular métricas de tienda
function calculateStoreMetrics(sales: SalesLine[]) {
  const totalSales = sales.reduce((sum, s) => sum + s.financiero[0].venta_total_usd, 0);
  const totalCost = sales.reduce((sum, s) => sum + s.financiero[0].costo_total_usd, 0);
  const totalMargin = sales.reduce((sum, s) => sum + s.financiero[0].utilidad_bruta_usd, 0);
  const uniqueTickets = new Set(sales.map(s => s.numero_factura)).size;
  const totalItems = sales.reduce((sum, s) => sum + s.cantidad[0].cantidad_vendida, 0);
  
  return {
    totalSales,
    ticketCount: uniqueTickets,
    avgTicket: totalSales / uniqueTickets,
    itemsPerTicket: totalItems / uniqueTickets,
    marginPercent: (totalMargin / totalSales) * 100,
    totalMargin
  };
}

// Ventas por hora
function salesByHour(sales: SalesLine[]) {
  const byHour: Record<number, number> = {};
  sales.forEach(s => {
    const hour = new Date(s.fecha_hora_completa).getHours();
    byHour[hour] = (byHour[hour] || 0) + s.financiero[0].venta_total_usd;
  });
  return byHour;
}

// Ventas por categoría
function salesByCategory(sales: SalesLine[]) {
  const byCategory: Record<string, { sales: number; margin: number }> = {};
  sales.forEach(s => {
    const cat = s.producto[0].grupo_articulo || 'SIN CATEGORÍA';
    if (!byCategory[cat]) byCategory[cat] = { sales: 0, margin: 0 };
    byCategory[cat].sales += s.financiero[0].venta_total_usd;
    byCategory[cat].margin += s.financiero[0].utilidad_bruta_usd;
  });
  return byCategory;
}

// Distribución de tickets
function ticketDistribution(sales: SalesLine[]) {
  const ticketTotals: Record<string, number> = {};
  sales.forEach(s => {
    if (!ticketTotals[s.numero_factura]) ticketTotals[s.numero_factura] = 0;
    ticketTotals[s.numero_factura] += s.financiero[0].venta_total_usd;
  });
  
  const ranges = { '<$5': 0, '$5-15': 0, '$15-30': 0, '$30-50': 0, '$50-100': 0, '>$100': 0 };
  Object.values(ticketTotals).forEach(total => {
    if (total < 5) ranges['<$5']++;
    else if (total < 15) ranges['$5-15']++;
    else if (total < 30) ranges['$15-30']++;
    else if (total < 50) ranges['$30-50']++;
    else if (total < 100) ranges['$50-100']++;
    else ranges['>$100']++;
  });
  return ranges;
}
```

### Formatters (utils/formatters.ts)

```typescript
// Formatear como moneda USD
export const formatUSD = (value: number) => 
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

// Formatear con K/M para valores grandes
export const formatCompact = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return formatUSD(value);
};

// Formatear porcentaje con color
export const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

// Formatear número con separadores
export const formatNumber = (value: number) => 
  new Intl.NumberFormat('en-US').format(Math.round(value));
```

---

## Consideraciones de UX

1. **Loading states**: Mostrar skeletons mientras cargan los datos
2. **Empty states**: Mensaje claro si no hay datos para el período seleccionado
3. **Responsive**: El dashboard debe funcionar en tablets (1024px mínimo)
4. **Tooltips**: En gráficos mostrar valores exactos al hover
5. **Colores consistentes**: Usar paleta de colores de FluxionIA existente
6. **Animaciones**: Transiciones suaves al cambiar filtros o datos

---

## Lista de Tiendas

```typescript
const STORES = [
  // Valencia
  { code: 'SUC001', name: 'GUACARA', region: 'VALENCIA' },
  { code: 'SUC002', name: 'VIVIENDA', region: 'VALENCIA' },
  { code: 'SUC003', name: 'NAGUANAGUA III', region: 'VALENCIA' },
  { code: 'SUC004', name: 'PARAPARAL', region: 'VALENCIA' },
  { code: 'SUC005', name: 'ISABELICA', region: 'VALENCIA' },
  { code: 'SUC006', name: 'GUIGUE', region: 'VALENCIA' },
  { code: 'SUC007', name: 'SAN DIEGO', region: 'VALENCIA' },
  { code: 'SUC008', name: 'MAÑONGO', region: 'VALENCIA' },
  { code: 'SUC009', name: 'CENTRO', region: 'VALENCIA' },
  { code: 'SUC010', name: 'TAZAJAL', region: 'VALENCIA' },
  { code: 'SUC011', name: 'BOSQUE', region: 'VALENCIA' },
  { code: 'SUC012', name: 'TRIGAL', region: 'VALENCIA' },
  { code: 'SUC013', name: 'PREBO', region: 'VALENCIA' },
  { code: 'SUC014', name: 'MONTALBAN', region: 'VALENCIA' },
  { code: 'SUC015', name: 'GUATAPARO', region: 'VALENCIA' },
  { code: 'SUC016', name: 'LA ENTRADA', region: 'VALENCIA' },
  { code: 'SUC017', name: 'FLOR AMARILLO', region: 'VALENCIA' },
  { code: 'SUC018', name: 'TOCUYITO', region: 'VALENCIA' },
  // Caracas
  { code: 'SUC019', name: 'PARAISO', region: 'CARACAS' },
  { code: 'SUC020', name: 'ARTIGAS', region: 'CARACAS' },
];
```

---

## Entregables

1. Todos los componentes listados en la estructura
2. Hooks para manejo de datos y estado
3. Utilidades de cálculo y formateo
4. Integración con la API existente de FluxionIA
5. Estilos con Tailwind CSS
6. Estados de loading y empty

---

## Notas Adicionales

- **NO hardcodear datos**: Todo debe venir de la API
- **Performance**: Considerar memoización para cálculos pesados
- **Accesibilidad**: Asegurar que los gráficos tengan labels apropiados
- **Internacionalización**: Por ahora todo en español, pero estructurar para futura i18n