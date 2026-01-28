# 🗺️ Roadmap: Implementación Completa BI por Tienda

**Objetivo**: Implementar el diseño completo de BiAnalisisTienda.md
**Duración**: 10-12 días de desarrollo
**Fecha inicio**: 2026-01-25
**Entrega estimada**: 2026-02-07

---

## 📋 Adaptaciones por Limitaciones Conocidas

### ❌ NO Implementaremos
1. **Filtros de promociones** - No existe `tiene_promocion` en BD
2. **Análisis de descuentos** - No está `codigo_promocion` en BD

### ⚠️ Implementación Parcial
1. **Análisis por categoría** - Solo mostrará el 40% de productos que SÍ tienen categoría
2. **Top categorías** - Excluiremos "SIN CATEGORIA" de los gráficos principales

### ✅ Todo lo Demás es Factible

---

## 🎯 Estructura de Tabs Definitiva

```
┌─────────────────────────────────────────────────────────┐
│ Business Intelligence > Por Tienda                      │
├─────────────────────────────────────────────────────────┤
│ [Dashboard de Red] [Detalle de Tienda] [Comparador]   │
└─────────────────────────────────────────────────────────┘
```

---

## 📅 FASE 1: Backend - Endpoints Core (Días 1-3)

### DÍA 1: Endpoints de Análisis Temporal

**Archivo**: `backend/routers/bi_stores.py` (nuevo)

#### 1.1 Evolución Diaria de Ventas
```python
@router.get("/stores/{ubicacion_id}/evolution")
async def get_store_evolution(
    ubicacion_id: str,
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
    conn: Any = Depends(get_db)
):
    """
    Ventas diarias de una tienda en un período.

    Returns:
    {
        "tienda": {...},
        "evolution": [
            {
                "fecha": "2026-01-15",
                "ventas": 12543.50,
                "tickets": 450,
                "ticket_promedio": 27.87,
                "items_vendidos": 3821,
                "margen_pct": 24.3
            }
        ],
        "promedio_red": [
            {
                "fecha": "2026-01-15",
                "ventas_promedio": 9876.20
            }
        ]
    }
    """
    cursor = conn.cursor()

    # Evolución de la tienda
    cursor.execute("""
        SELECT
            fecha_venta::date as fecha,
            SUM(venta_total) as ventas,
            COUNT(DISTINCT numero_factura) as tickets,
            SUM(venta_total) / NULLIF(COUNT(DISTINCT numero_factura), 0) as ticket_promedio,
            SUM(cantidad_vendida) as items_vendidos,
            (SUM(utilidad_bruta) / NULLIF(SUM(venta_total), 0)) * 100 as margen_pct
        FROM ventas
        WHERE ubicacion_id = %s
          AND fecha_venta::date >= %s::date
          AND fecha_venta::date <= %s::date
        GROUP BY fecha_venta::date
        ORDER BY fecha
    """, (ubicacion_id, fecha_inicio, fecha_fin))

    evolution = [...]

    # Promedio de la red (todas las tiendas)
    cursor.execute("""
        SELECT
            fecha_venta::date as fecha,
            AVG(ventas_diarias) as ventas_promedio
        FROM (
            SELECT
                ubicacion_id,
                fecha_venta::date,
                SUM(venta_total) as ventas_diarias
            FROM ventas
            WHERE fecha_venta::date >= %s::date
              AND fecha_venta::date <= %s::date
            GROUP BY ubicacion_id, fecha_venta::date
        ) sub
        GROUP BY fecha_venta::date
        ORDER BY fecha
    """, (fecha_inicio, fecha_fin))

    promedio_red = [...]

    return {...}
```

#### 1.2 Comparación de Períodos
```python
@router.get("/stores/network/kpis")
async def get_network_kpis(
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
    comparar_con: str = Query("anterior", regex="^(anterior|ano_anterior)$"),
    region: Optional[str] = None,
    conn: Any = Depends(get_db)
):
    """
    KPIs de toda la red con comparación temporal.

    Returns:
    {
        "periodo_actual": {
            "ventas_total": 1234567.50,
            "tickets": 45230,
            "ticket_promedio": 27.30,
            "margen_pct": 24.3,
            "items_totales": 378450
        },
        "periodo_comparacion": {...},
        "variacion": {
            "ventas_pct": 8.2,
            "tickets_pct": 5.1,
            "ticket_promedio_pct": 2.9,
            "margen_pct": -0.5
        }
    }
    """
    # Calcular período de comparación
    if comparar_con == "anterior":
        # Mismo número de días hacia atrás
        cursor.execute("""
            SELECT
                (%s::date - %s::date) as dias_periodo
        """, (fecha_fin, fecha_inicio))
        dias = cursor.fetchone()[0]
        fecha_inicio_comp = fecha_inicio - timedelta(days=dias + 1)
        fecha_fin_comp = fecha_inicio - timedelta(days=1)
    else:  # ano_anterior
        fecha_inicio_comp = fecha_inicio - timedelta(days=365)
        fecha_fin_comp = fecha_fin - timedelta(days=365)

    # Query para período actual
    where_clauses = ["fecha_venta::date >= %s", "fecha_venta::date <= %s"]
    params_actual = [fecha_inicio, fecha_fin]

    if region:
        where_clauses.append("u.region = %s")
        params_actual.append(region)

    cursor.execute(f"""
        SELECT
            SUM(v.venta_total) as ventas_total,
            COUNT(DISTINCT v.numero_factura) as tickets,
            SUM(v.venta_total) / NULLIF(COUNT(DISTINCT v.numero_factura), 0) as ticket_promedio,
            (SUM(v.utilidad_bruta) / NULLIF(SUM(v.venta_total), 0)) * 100 as margen_pct,
            SUM(v.cantidad_vendida) as items_totales
        FROM ventas v
        JOIN ubicaciones u ON v.ubicacion_id = u.id
        WHERE {' AND '.join(where_clauses)}
    """, params_actual)

    periodo_actual = {...}

    # Mismo query para período de comparación
    params_comp = [fecha_inicio_comp, fecha_fin_comp]
    if region:
        params_comp.append(region)

    cursor.execute(...)  # Mismo query con fechas de comparación

    periodo_comparacion = {...}

    # Calcular variaciones
    variacion = {
        "ventas_pct": ((actual - comp) / comp) * 100,
        ...
    }

    return {...}
```

---

### DÍA 2: Endpoints de Análisis por Hora y Categorías

#### 2.1 Heatmap de Ventas por Hora
```python
@router.get("/stores/{ubicacion_id}/hourly-heatmap")
async def get_hourly_heatmap(
    ubicacion_id: str,
    dias: int = Query(30, ge=7, le=90),
    conn: Any = Depends(get_db)
):
    """
    Heatmap de ventas por hora del día y día de semana.

    Returns:
    {
        "heatmap": [
            {
                "dia_semana": 0,  // 0=Domingo, 6=Sábado
                "hora": 10,
                "ventas": 5678.90,
                "tickets": 234,
                "pct_del_total": 4.2
            }
        ],
        "hora_pico": {
            "hora": 11,
            "dia_semana": 5,  // Viernes
            "ventas": 12345.67
        }
    }
    """
    cursor = conn.cursor()

    cursor.execute("""
        WITH ventas_totales AS (
            SELECT SUM(venta_total) as total
            FROM ventas
            WHERE ubicacion_id = %s
              AND fecha_venta >= CURRENT_DATE - INTERVAL '%s days'
        )
        SELECT
            EXTRACT(DOW FROM fecha_venta)::int as dia_semana,
            EXTRACT(HOUR FROM fecha_venta)::int as hora,
            SUM(venta_total) as ventas,
            COUNT(DISTINCT numero_factura) as tickets,
            (SUM(venta_total) / vt.total * 100) as pct_del_total
        FROM ventas, ventas_totales vt
        WHERE ubicacion_id = %s
          AND fecha_venta >= CURRENT_DATE - INTERVAL '%s days'
        GROUP BY dia_semana, hora, vt.total
        ORDER BY dia_semana, hora
    """, (ubicacion_id, dias, ubicacion_id, dias))

    heatmap = [...]

    # Encontrar hora pico
    cursor.execute("""
        SELECT
            EXTRACT(DOW FROM fecha_venta)::int as dia_semana,
            EXTRACT(HOUR FROM fecha_venta)::int as hora,
            SUM(venta_total) as ventas
        FROM ventas
        WHERE ubicacion_id = %s
          AND fecha_venta >= CURRENT_DATE - INTERVAL '%s days'
        GROUP BY dia_semana, hora
        ORDER BY ventas DESC
        LIMIT 1
    """, (ubicacion_id, dias))

    hora_pico = {...}

    return {...}
```

#### 2.2 Top Categorías por Tienda
```python
@router.get("/stores/{ubicacion_id}/categories")
async def get_store_categories(
    ubicacion_id: str,
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
    limit: int = Query(10, ge=5, le=20),
    conn: Any = Depends(get_db)
):
    """
    Top categorías de una tienda con % del total.

    Returns:
    {
        "total_ventas": 145230.50,
        "categorias": [
            {
                "categoria": "Viveres",
                "ventas": 45678.90,
                "pct_total": 31.4,
                "margen_pct": 25.2,
                "tickets": 1234,
                "productos_vendidos": 3456
            }
        ]
    }
    """
    cursor = conn.cursor()

    # Total de ventas de la tienda
    cursor.execute("""
        SELECT SUM(venta_total)
        FROM ventas
        WHERE ubicacion_id = %s
          AND fecha_venta::date >= %s::date
          AND fecha_venta::date <= %s::date
    """, (ubicacion_id, fecha_inicio, fecha_fin))

    total_ventas = cursor.fetchone()[0] or 0

    # Top categorías (excluir SIN CATEGORIA)
    cursor.execute("""
        SELECT
            p.categoria,
            SUM(v.venta_total) as ventas,
            (SUM(v.venta_total) / %s * 100) as pct_total,
            (SUM(v.utilidad_bruta) / NULLIF(SUM(v.venta_total), 0)) * 100 as margen_pct,
            COUNT(DISTINCT v.numero_factura) as tickets,
            COUNT(DISTINCT v.producto_id) as productos_vendidos
        FROM ventas v
        JOIN productos p ON v.producto_id = p.id
        WHERE v.ubicacion_id = %s
          AND v.fecha_venta::date >= %s::date
          AND v.fecha_venta::date <= %s::date
          AND p.categoria IS NOT NULL
          AND p.categoria != 'SIN CATEGORIA'
        GROUP BY p.categoria
        ORDER BY ventas DESC
        LIMIT %s
    """, (total_ventas, ubicacion_id, fecha_inicio, fecha_fin, limit))

    categorias = [...]

    return {
        "total_ventas": total_ventas,
        "categorias": categorias
    }
```

---

### DÍA 3: Endpoints de Distribución y Comparación

#### 3.1 Distribución de Tickets
```python
@router.get("/stores/{ubicacion_id}/ticket-distribution")
async def get_ticket_distribution(
    ubicacion_id: str,
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
    conn: Any = Depends(get_db)
):
    """
    Distribución de tickets por rangos de valor.

    Returns:
    {
        "total_tickets": 5420,
        "rangos": [
            {
                "rango": "<$5",
                "cantidad": 234,
                "pct": 4.3,
                "ventas_total": 987.50
            },
            {
                "rango": "$5-15",
                "cantidad": 1234,
                "pct": 22.8,
                "ventas_total": 12345.67
            }
        ]
    }
    """
    cursor = conn.cursor()

    cursor.execute("""
        WITH tickets_totales AS (
            SELECT
                numero_factura,
                SUM(venta_total) as total_ticket
            FROM ventas
            WHERE ubicacion_id = %s
              AND fecha_venta::date >= %s::date
              AND fecha_venta::date <= %s::date
            GROUP BY numero_factura
        ),
        total_count AS (
            SELECT COUNT(*) as total FROM tickets_totales
        )
        SELECT
            CASE
                WHEN total_ticket < 5 THEN '<$5'
                WHEN total_ticket < 15 THEN '$5-15'
                WHEN total_ticket < 30 THEN '$15-30'
                WHEN total_ticket < 50 THEN '$30-50'
                WHEN total_ticket < 100 THEN '$50-100'
                ELSE '>$100'
            END as rango,
            COUNT(*) as cantidad,
            (COUNT(*) * 100.0 / tc.total) as pct,
            SUM(total_ticket) as ventas_total
        FROM tickets_totales, total_count tc
        GROUP BY rango, tc.total
        ORDER BY
            CASE rango
                WHEN '<$5' THEN 1
                WHEN '$5-15' THEN 2
                WHEN '$15-30' THEN 3
                WHEN '$30-50' THEN 4
                WHEN '$50-100' THEN 5
                WHEN '>$100' THEN 6
            END
    """, (ubicacion_id, fecha_inicio, fecha_fin))

    rangos = [...]

    return {...}
```

#### 3.2 Comparador Multi-Tienda
```python
@router.get("/stores/compare-multi")
async def compare_multiple_stores(
    store_ids: str = Query(..., description="Comma-separated store IDs"),
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
    conn: Any = Depends(get_db)
):
    """
    Compara múltiples tiendas (2-5) en el mismo período.

    Returns:
    {
        "periodo": {...},
        "stores": [
            {
                "ubicacion_id": "tienda_01",
                "nombre": "GUACARA",
                "region": "VALENCIA",
                "metrics": {
                    "ventas": 145230.50,
                    "tickets": 5420,
                    "ticket_promedio": 26.75,
                    "items_ticket": 8.3,
                    "margen_pct": 25.1,
                    "categoria_top": "Viveres",
                    "hora_pico": "11am"
                },
                "normalized": {
                    "ventas": 89.2,  // 0-100 scale
                    "tickets": 85.6,
                    "ticket_promedio": 92.3,
                    "items_ticket": 78.9,
                    "margen_pct": 95.4
                }
            }
        ],
        "promedio_red": {...}
    }
    """
    # Parse store IDs
    store_list = [s.strip() for s in store_ids.split(',')]

    if len(store_list) < 2 or len(store_list) > 5:
        raise HTTPException(400, "Debe seleccionar entre 2 y 5 tiendas")

    cursor = conn.cursor()
    results = []

    for store_id in store_list:
        # KPIs básicos
        cursor.execute("""
            SELECT
                u.nombre,
                u.region,
                SUM(v.venta_total) as ventas,
                COUNT(DISTINCT v.numero_factura) as tickets,
                SUM(v.venta_total) / NULLIF(COUNT(DISTINCT v.numero_factura), 0) as ticket_promedio,
                SUM(v.cantidad_vendida) / NULLIF(COUNT(DISTINCT v.numero_factura), 0) as items_ticket,
                (SUM(v.utilidad_bruta) / NULLIF(SUM(v.venta_total), 0)) * 100 as margen_pct
            FROM ventas v
            JOIN ubicaciones u ON v.ubicacion_id = u.id
            WHERE v.ubicacion_id = %s
              AND v.fecha_venta::date >= %s::date
              AND v.fecha_venta::date <= %s::date
            GROUP BY u.nombre, u.region
        """, (store_id, fecha_inicio, fecha_fin))

        row = cursor.fetchone()

        # Categoría top
        cursor.execute("""
            SELECT p.categoria, SUM(v.venta_total) as ventas
            FROM ventas v
            JOIN productos p ON v.producto_id = p.id
            WHERE v.ubicacion_id = %s
              AND v.fecha_venta::date >= %s::date
              AND v.fecha_venta::date <= %s::date
              AND p.categoria IS NOT NULL
              AND p.categoria != 'SIN CATEGORIA'
            GROUP BY p.categoria
            ORDER BY ventas DESC
            LIMIT 1
        """, (store_id, fecha_inicio, fecha_fin))

        categoria_top = cursor.fetchone()

        # Hora pico
        cursor.execute("""
            SELECT EXTRACT(HOUR FROM fecha_venta)::int as hora, SUM(venta_total) as ventas
            FROM ventas
            WHERE ubicacion_id = %s
              AND fecha_venta::date >= %s::date
              AND fecha_venta::date <= %s::date
            GROUP BY hora
            ORDER BY ventas DESC
            LIMIT 1
        """, (store_id, fecha_inicio, fecha_fin))

        hora_pico = cursor.fetchone()

        results.append({
            "ubicacion_id": store_id,
            "nombre": row[0],
            "region": row[1],
            "metrics": {
                "ventas": row[2],
                "tickets": row[3],
                "ticket_promedio": row[4],
                "items_ticket": row[5],
                "margen_pct": row[6],
                "categoria_top": categoria_top[0] if categoria_top else None,
                "hora_pico": f"{hora_pico[0]}:00" if hora_pico else None
            }
        })

    # Normalizar métricas (0-100 scale) para radar chart
    # Min-Max scaling
    metrics_keys = ['ventas', 'tickets', 'ticket_promedio', 'items_ticket', 'margen_pct']

    for metric in metrics_keys:
        values = [s['metrics'][metric] for s in results if s['metrics'][metric] is not None]
        if values:
            min_val = min(values)
            max_val = max(values)
            for store in results:
                val = store['metrics'][metric]
                if val is not None and max_val > min_val:
                    normalized = ((val - min_val) / (max_val - min_val)) * 100
                else:
                    normalized = 50  # Midpoint if all equal
                if 'normalized' not in store:
                    store['normalized'] = {}
                store['normalized'][metric] = round(normalized, 1)

    return {
        "periodo": {
            "fecha_inicio": fecha_inicio,
            "fecha_fin": fecha_fin
        },
        "stores": results
    }
```

---

## 📅 FASE 2: Frontend - Componentes Base (Días 4-6)

### DÍA 4: Componentes Reutilizables y Hooks

**Archivos**:
- `frontend/src/components/bi/stores/common/KPICard.tsx`
- `frontend/src/components/bi/stores/common/PeriodSelector.tsx`
- `frontend/src/hooks/useBIStores.ts`

#### 4.1 KPICard Reutilizable
```typescript
// KPICard.tsx
interface KPICardProps {
  title: string;
  value: number | string;
  format?: 'currency' | 'number' | 'percent';
  change?: number;  // Variación vs período anterior
  changeLabel?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}

export function KPICard({ title, value, format, change, changeLabel, icon, loading }: KPICardProps) {
  const formattedValue = useMemo(() => {
    if (typeof value === 'string') return value;

    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(value);
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'number':
      default:
        return new Intl.NumberFormat('en-US').format(Math.round(value));
    }
  }, [value, format]);

  if (loading) {
    return <KPICardSkeleton />;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-600">{title}</span>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>

      <div className="text-3xl font-bold text-gray-900 mb-2">
        {formattedValue}
      </div>

      {change !== undefined && (
        <div className="flex items-center gap-1">
          {change > 0 ? (
            <TrendingUp className="w-4 h-4 text-green-600" />
          ) : change < 0 ? (
            <TrendingDown className="w-4 h-4 text-red-600" />
          ) : null}
          <span className={`text-sm font-medium ${
            change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-600'
          }`}>
            {change > 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
          {changeLabel && (
            <span className="text-sm text-gray-500 ml-1">
              {changeLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

#### 4.2 Period Selector
```typescript
// PeriodSelector.tsx
type Period = 'today' | '7d' | '30d' | 'month' | 'custom';
type CompareWith = 'anterior' | 'ano_anterior';

interface PeriodSelectorProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
  compareWith: CompareWith;
  onCompareChange: (compare: CompareWith) => void;
  customDates?: { start: Date; end: Date };
  onCustomDatesChange?: (dates: { start: Date; end: Date }) => void;
}

export function PeriodSelector({
  period,
  onPeriodChange,
  compareWith,
  onCompareChange,
  customDates,
  onCustomDatesChange
}: PeriodSelectorProps) {
  const periods: { id: Period; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: '7d', label: 'Últimos 7 días' },
    { id: '30d', label: 'Últimos 30 días' },
    { id: 'month', label: 'Mes actual' },
    { id: 'custom', label: 'Personalizado' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-0 z-10">
      <div className="flex flex-wrap items-center gap-4">
        {/* Período */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Período:</span>
          <div className="flex gap-2">
            {periods.map(p => (
              <button
                key={p.id}
                onClick={() => onPeriodChange(p.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p.id
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Comparar con */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Comparar vs:</span>
          <select
            value={compareWith}
            onChange={(e) => onCompareChange(e.target.value as CompareWith)}
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="anterior">Período anterior</option>
            <option value="ano_anterior">Mismo período año anterior</option>
          </select>
        </div>

        {/* Date Picker para custom (si period === 'custom') */}
        {period === 'custom' && onCustomDatesChange && (
          <div className="flex items-center gap-2">
            {/* Implementar date picker */}
          </div>
        )}
      </div>
    </div>
  );
}
```

#### 4.3 Hook de Datos
```typescript
// useBIStores.ts
export function useBIStores() {
  const [period, setPeriod] = useState<Period>('30d');
  const [compareWith, setCompareWith] = useState<CompareWith>('anterior');
  const [region, setRegion] = useState<string | null>(null);

  // Calcular fechas basado en período
  const dates = useMemo(() => {
    const end = new Date();
    let start: Date;

    switch (period) {
      case 'today':
        start = new Date();
        break;
      case '7d':
        start = new Date();
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start = new Date();
        start.setDate(start.getDate() - 30);
        break;
      case 'month':
        start = new Date(end.getFullYear(), end.getMonth(), 1);
        break;
      default:
        start = new Date();
        start.setDate(start.getDate() - 30);
    }

    return {
      fecha_inicio: start.toISOString().split('T')[0],
      fecha_fin: end.toISOString().split('T')[0]
    };
  }, [period]);

  // Fetch network KPIs
  const { data: networkKPIs, isLoading: loadingKPIs } = useQuery({
    queryKey: ['bi-stores', 'network-kpis', dates, compareWith, region],
    queryFn: () => biStoresService.getNetworkKPIs(
      dates.fecha_inicio,
      dates.fecha_fin,
      compareWith,
      region || undefined
    )
  });

  return {
    period,
    setPeriod,
    compareWith,
    setCompareWith,
    region,
    setRegion,
    dates,
    networkKPIs,
    loadingKPIs
  };
}
```

---

### DÍA 5: Tab 1 - Dashboard de Red

**Archivo**: `frontend/src/components/bi/stores/StoresDashboard.tsx`

```typescript
export default function StoresDashboard() {
  const {
    period,
    setPeriod,
    compareWith,
    setCompareWith,
    region,
    setRegion,
    dates,
    networkKPIs,
    loadingKPIs
  } = useBIStores();

  const [sortBy, setSortBy] = useState<'ventas' | 'tickets' | 'margen' | 'ticket_promedio'>('ventas');

  // Fetch stores ranking
  const { data: storesRanking, isLoading: loadingRanking } = useQuery({
    queryKey: ['bi-stores', 'ranking', dates, sortBy, region],
    queryFn: () => biStoresService.getStoresRanking(dates, sortBy, region)
  });

  return (
    <div className="space-y-6">
      {/* Filtros Globales */}
      <PeriodSelector
        period={period}
        onPeriodChange={setPeriod}
        compareWith={compareWith}
        onCompareChange={setCompareWith}
      />

      {/* KPIs de Red */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Ventas Total"
          value={networkKPIs?.periodo_actual.ventas_total || 0}
          format="currency"
          change={networkKPIs?.variacion.ventas_pct}
          changeLabel="vs anterior"
          icon={<DollarSign className="w-5 h-5" />}
          loading={loadingKPIs}
        />
        <KPICard
          title="# Tickets"
          value={networkKPIs?.periodo_actual.tickets || 0}
          format="number"
          change={networkKPIs?.variacion.tickets_pct}
          changeLabel="vs anterior"
          icon={<Receipt className="w-5 h-5" />}
          loading={loadingKPIs}
        />
        <KPICard
          title="Ticket Promedio"
          value={networkKPIs?.periodo_actual.ticket_promedio || 0}
          format="currency"
          change={networkKPIs?.variacion.ticket_promedio_pct}
          changeLabel="vs anterior"
          icon={<ShoppingCart className="w-5 h-5" />}
          loading={loadingKPIs}
        />
        <KPICard
          title="Margen %"
          value={networkKPIs?.periodo_actual.margen_pct || 0}
          format="percent"
          change={networkKPIs?.variacion.margen_pct}
          changeLabel="vs anterior"
          icon={<TrendingUp className="w-5 h-5" />}
          loading={loadingKPIs}
        />
      </div>

      {/* Gráfico de Barras Horizontales */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Ventas por Tienda
          </h2>
          <div className="flex gap-2">
            <span className="text-sm text-gray-600">Ordenar por:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="ventas">Ventas</option>
              <option value="tickets"># Tickets</option>
              <option value="ticket_promedio">Ticket Promedio</option>
              <option value="margen">Margen %</option>
            </select>
          </div>
        </div>

        <StoresBarChart
          stores={storesRanking?.stores || []}
          metric={sortBy}
          promedio={storesRanking?.promedio}
          loading={loadingRanking}
        />
      </div>

      {/* Tabla de Ranking */}
      <StoresRankingTable
        stores={storesRanking?.stores || []}
        loading={loadingRanking}
      />
    </div>
  );
}
```

---

### DÍA 6: Gráficos - Barras y Tabla Ranking

#### 6.1 Gráfico de Barras Horizontales
```typescript
// StoresBarChart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';

interface StoresBarChartProps {
  stores: Array<{
    nombre: string;
    valor: number;
    vs_promedio_pct: number;
  }>;
  metric: string;
  promedio?: number;
  loading?: boolean;
}

export function StoresBarChart({ stores, metric, promedio, loading }: StoresBarChartProps) {
  if (loading) return <ChartSkeleton />;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart
        data={stores}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis dataKey="nombre" type="category" width={90} />
        <Tooltip
          formatter={(value: number) => {
            if (metric === 'ventas' || metric === 'ticket_promedio') {
              return `$${value.toLocaleString()}`;
            } else if (metric === 'margen') {
              return `${value.toFixed(1)}%`;
            }
            return value.toLocaleString();
          }}
        />
        <Legend />

        {/* Línea de promedio */}
        {promedio && (
          <ReferenceLine
            x={promedio}
            stroke="#6b7280"
            strokeDasharray="3 3"
            label={{ value: 'Promedio', position: 'top' }}
          />
        )}

        <Bar
          dataKey="valor"
          fill={(entry) => entry.vs_promedio_pct > 0 ? '#10b981' : '#ef4444'}
          name={metric}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

#### 6.2 Tabla de Ranking
```typescript
// StoresRankingTable.tsx
export function StoresRankingTable({ stores, loading }: Props) {
  const navigate = useNavigate();

  if (loading) return <TableSkeleton />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Ranking Detallado
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-center">#</th>
              <th className="px-4 py-3 text-left">Tienda</th>
              <th className="px-4 py-3 text-left">Región</th>
              <th className="px-4 py-3 text-right">Ventas</th>
              <th className="px-4 py-3 text-right">vs Ant %</th>
              <th className="px-4 py-3 text-right"># Tickets</th>
              <th className="px-4 py-3 text-right">Ticket Prom</th>
              <th className="px-4 py-3 text-right">Items/Ticket</th>
              <th className="px-4 py-3 text-right">Margen %</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {stores.map((store, index) => (
              <tr
                key={store.ubicacion_id}
                onClick={() => navigate(`/bi/stores/${store.ubicacion_id}`)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-700' :
                    index === 1 ? 'bg-gray-200 text-gray-700' :
                    index === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {index + 1}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {store.nombre}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {store.region}
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  ${store.ventas.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`inline-flex items-center gap-1 text-sm ${
                    store.variacion_pct > 0 ? 'text-green-600' :
                    store.variacion_pct < 0 ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {store.variacion_pct > 0 && <TrendingUp className="w-3 h-3" />}
                    {store.variacion_pct < 0 && <TrendingDown className="w-3 h-3" />}
                    {store.variacion_pct > 0 ? '+' : ''}{store.variacion_pct.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {store.tickets.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">
                  ${store.ticket_promedio.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right">
                  {store.items_ticket.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-medium ${
                    store.margen_pct > 25 ? 'text-green-600' :
                    store.margen_pct > 15 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {store.margen_pct.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## 📅 FASE 3: Frontend - Tab Detalle de Tienda (Días 7-9)

### DÍA 7: Detalle de Tienda - Layout y Evolución

**Archivo**: `frontend/src/components/bi/stores/StoreDetail.tsx`

```typescript
export default function StoreDetail() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const { period, setPeriod, compareWith, setCompareWith, dates } = useBIStores();

  // Fetch store data
  const { data: storeInfo, isLoading: loadingInfo } = useQuery({
    queryKey: ['bi-stores', 'detail', storeId],
    queryFn: () => biStoresService.getStoreInfo(storeId!)
  });

  const { data: evolution, isLoading: loadingEvolution } = useQuery({
    queryKey: ['bi-stores', 'evolution', storeId, dates],
    queryFn: () => biStoresService.getStoreEvolution(storeId!, dates.fecha_inicio, dates.fecha_fin)
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/bi?tab=stores')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Red
        </button>

        <div className="text-right">
          <h1 className="text-2xl font-bold text-gray-900">
            {storeInfo?.nombre}
          </h1>
          <p className="text-sm text-gray-500">{storeInfo?.region}</p>
        </div>
      </div>

      {/* Period Selector */}
      <PeriodSelector
        period={period}
        onPeriodChange={setPeriod}
        compareWith={compareWith}
        onCompareChange={setCompareWith}
      />

      {/* KPIs de Tienda */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Ventas"
          value={evolution?.totales.ventas || 0}
          format="currency"
          change={evolution?.variacion.ventas_pct}
          changeLabel="vs Red"
          loading={loadingEvolution}
        />
        {/* Otros 3 KPIs... */}
      </div>

      {/* Gráfico de Evolución */}
      <SalesEvolutionChart
        evolution={evolution?.evolution || []}
        promedioRed={evolution?.promedio_red || []}
        loading={loadingEvolution}
      />

      {/* Grid 2x2 de Gráficos Secundarios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HourlyHeatmap storeId={storeId!} />
        <TopCategoriesChart storeId={storeId!} dates={dates} />
        <TicketDistributionChart storeId={storeId!} dates={dates} />
        <MarginByCategoryChart storeId={storeId!} dates={dates} />
      </div>
    </div>
  );
}
```

#### 7.1 Gráfico de Evolución Temporal
```typescript
// SalesEvolutionChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function SalesEvolutionChart({ evolution, promedioRed, loading }: Props) {
  if (loading) return <ChartSkeleton />;

  // Merge evolution with promedio_red por fecha
  const data = evolution.map(e => {
    const redData = promedioRed.find(r => r.fecha === e.fecha);
    return {
      fecha: new Date(e.fecha).toLocaleDateString('es-VE', { month: 'short', day: 'numeric' }),
      ventas_tienda: e.ventas,
      ventas_red_promedio: redData?.ventas_promedio || 0
    };
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Evolución de Ventas
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="fecha" />
          <YAxis />
          <Tooltip
            formatter={(value: number) => `$${value.toLocaleString()}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="ventas_tienda"
            stroke="#6366f1"
            strokeWidth={2}
            name="Esta tienda"
            dot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="ventas_red_promedio"
            stroke="#9ca3af"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="Promedio de red"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

---

### DÍA 8: Heatmap y Categorías

#### 8.1 Heatmap de Ventas por Hora
```typescript
// HourlyHeatmap.tsx
export function HourlyHeatmap({ storeId }: { storeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['bi-stores', 'hourly-heatmap', storeId],
    queryFn: () => biStoresService.getHourlyHeatmap(storeId)
  });

  if (isLoading) return <ChartSkeleton />;

  // Transformar data para heatmap
  // Crear matriz 7x24 (días x horas)
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const heatmapData = [];

  for (let dia = 0; dia < 7; dia++) {
    for (let hora = 7; hora <= 22; hora++) {  // 7am a 10pm
      const cell = data?.heatmap.find(
        h => h.dia_semana === dia && h.hora === hora
      );

      heatmapData.push({
        dia: dias[dia],
        hora: `${hora}:00`,
        ventas: cell?.ventas || 0,
        pct: cell?.pct_del_total || 0
      });
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Ventas por Hora
        </h3>
        {data?.hora_pico && (
          <span className="text-sm text-gray-600">
            Hora pico: {dias[data.hora_pico.dia_semana]} {data.hora_pico.hora}:00
          </span>
        )}
      </div>

      {/* Heatmap usando divs con gradiente de colores */}
      <div className="space-y-1">
        {dias.map(dia => (
          <div key={dia} className="flex items-center gap-1">
            <span className="text-xs text-gray-600 w-8">{dia}</span>
            <div className="flex gap-0.5 flex-1">
              {Array.from({ length: 16 }, (_, i) => i + 7).map(hora => {
                const cell = heatmapData.find(
                  d => d.dia === dia && d.hora === `${hora}:00`
                );
                const pct = cell?.pct || 0;

                // Escala de colores basada en % del total
                const getColor = (pct: number) => {
                  if (pct > 2) return 'bg-indigo-600';
                  if (pct > 1.5) return 'bg-indigo-500';
                  if (pct > 1) return 'bg-indigo-400';
                  if (pct > 0.5) return 'bg-indigo-300';
                  if (pct > 0.2) return 'bg-indigo-200';
                  return 'bg-gray-100';
                };

                return (
                  <div
                    key={hora}
                    className={`h-6 flex-1 rounded ${getColor(pct)} group relative cursor-pointer`}
                    title={`${dia} ${hora}:00 - $${cell?.ventas.toLocaleString()} (${pct.toFixed(1)}%)`}
                  >
                    {/* Tooltip on hover */}
                    <div className="hidden group-hover:block absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10">
                      {hora}:00 - ${cell?.ventas.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Leyenda de horas */}
        <div className="flex items-center gap-1 mt-2">
          <span className="text-xs text-gray-600 w-8"></span>
          <div className="flex gap-0.5 flex-1 text-xs text-gray-500">
            {[7, 10, 13, 16, 19, 22].map(h => (
              <span key={h} className="flex-1 text-center">{h}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### 8.2 Top 10 Categorías
```typescript
// TopCategoriesChart.tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export function TopCategoriesChart({ storeId, dates }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['bi-stores', 'categories', storeId, dates],
    queryFn: () => biStoresService.getStoreCategories(storeId, dates)
  });

  if (isLoading) return <ChartSkeleton />;

  const colors = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#06b6d4', '#f97316', '#84cc16',
    '#a855f7', '#14b8a6'
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Top 10 Categorías
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data?.categorias || []} layout="vertical">
          <XAxis type="number" />
          <YAxis dataKey="categoria" type="category" width={100} />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === 'ventas') return `$${value.toLocaleString()}`;
              if (name === 'pct_total') return `${value.toFixed(1)}%`;
              return value;
            }}
          />
          <Bar dataKey="ventas" name="Ventas">
            {data?.categorias.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Tabla de detalles */}
      <div className="mt-4 space-y-2">
        {data?.categorias.slice(0, 5).map((cat, idx) => (
          <div key={cat.categoria} className="flex items-center justify-between text-sm">
            <span className="text-gray-700">{cat.categoria}</span>
            <div className="flex items-center gap-3">
              <span className="text-gray-600">
                ${cat.ventas.toLocaleString()}
              </span>
              <span className="font-medium text-indigo-600">
                {cat.pct_total.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### DÍA 9: Distribución de Tickets y Margen

#### 9.1 Histograma de Distribución de Tickets
```typescript
// TicketDistributionChart.tsx
export function TicketDistributionChart({ storeId, dates }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['bi-stores', 'ticket-distribution', storeId, dates],
    queryFn: () => biStoresService.getTicketDistribution(storeId, dates)
  });

  if (isLoading) return <ChartSkeleton />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Distribución de Tickets
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data?.rangos || []}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="rango" />
          <YAxis yAxisId="left" orientation="left" stroke="#6366f1" />
          <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === 'cantidad') return `${value.toLocaleString()} tickets`;
              if (name === 'pct') return `${value.toFixed(1)}%`;
              return value;
            }}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="cantidad" fill="#6366f1" name="Cantidad" />
          <Bar yAxisId="right" dataKey="pct" fill="#10b981" name="%" />
        </BarChart>
      </ResponsiveContainer>

      {/* Estadísticas clave */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-gray-600">Ticket más común</p>
          <p className="text-lg font-bold text-gray-900">
            {data?.rangos.reduce((max, r) => r.cantidad > max.cantidad ? r : max, data.rangos[0])?.rango}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Total tickets</p>
          <p className="text-lg font-bold text-gray-900">
            {data?.total_tickets.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Tickets >$50</p>
          <p className="text-lg font-bold text-gray-900">
            {((data?.rangos.find(r => r.rango === '$50-100')?.pct || 0) +
              (data?.rangos.find(r => r.rango === '>$100')?.pct || 0)).toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  );
}
```

#### 9.2 Margen por Categoría
```typescript
// MarginByCategoryChart.tsx
export function MarginByCategoryChart({ storeId, dates }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['bi-stores', 'margin-by-category', storeId, dates],
    queryFn: () => biStoresService.getStoreCategories(storeId, dates)  // Reusar endpoint
  });

  if (isLoading) return <ChartSkeleton />;

  // Ordenar por margen descendente
  const sortedData = [...(data?.categorias || [])].sort((a, b) => b.margen_pct - a.margen_pct);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Margen por Categoría
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={sortedData.slice(0, 10)} layout="vertical">
          <XAxis type="number" />
          <YAxis dataKey="categoria" type="category" width={100} />
          <Tooltip
            formatter={(value: number) => `${value.toFixed(1)}%`}
          />
          <Bar dataKey="margen_pct" name="Margen %">
            {sortedData.slice(0, 10).map((entry) => (
              <Cell
                key={entry.categoria}
                fill={
                  entry.margen_pct > 25 ? '#10b981' :
                  entry.margen_pct > 15 ? '#f59e0b' :
                  '#ef4444'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Leyenda de colores */}
      <div className="mt-4 flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span className="text-gray-600">Excelente (&gt;25%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-500 rounded"></div>
          <span className="text-gray-600">Bueno (15-25%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded"></div>
          <span className="text-gray-600">Bajo (&lt;15%)</span>
        </div>
      </div>
    </div>
  );
}
```

---

## 📅 FASE 4: Frontend - Comparador Multi-Tienda (Días 10-11)

### DÍA 10: Selector y Radar Chart

**Archivo**: `frontend/src/components/bi/stores/StoreComparator.tsx`

```typescript
export default function StoreComparator() {
  const { dates } = useBIStores();
  const [selectedStores, setSelectedStores] = useState<string[]>([]);

  // Fetch all stores
  const { data: allStores } = useQuery({
    queryKey: ['ubicaciones', 'tiendas'],
    queryFn: () => ubicacionesService.getTiendas()
  });

  // Fetch comparison data
  const { data: comparison, isLoading } = useQuery({
    queryKey: ['bi-stores', 'compare-multi', selectedStores, dates],
    queryFn: () => biStoresService.compareMultipleStores(selectedStores, dates),
    enabled: selectedStores.length >= 2
  });

  const handleStoreToggle = (storeId: string) => {
    setSelectedStores(prev => {
      if (prev.includes(storeId)) {
        return prev.filter(id => id !== storeId);
      } else if (prev.length < 5) {
        return [...prev, storeId];
      }
      return prev;
    });
  };

  const selectAllRegion = (region: string) => {
    const regionStores = allStores
      ?.filter(s => s.region === region)
      .map(s => s.id)
      .slice(0, 5) || [];
    setSelectedStores(regionStores);
  };

  return (
    <div className="space-y-6">
      {/* Selector de Tiendas */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Seleccionar Tiendas a Comparar
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => selectAllRegion('VALENCIA')}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              Todas Valencia
            </button>
            <button
              onClick={() => selectAllRegion('CARACAS')}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              Todas Caracas
            </button>
            <button
              onClick={() => setSelectedStores([])}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              Limpiar
            </button>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Selecciona entre 2 y 5 tiendas ({selectedStores.length}/5 seleccionadas)
        </p>

        {/* Grid de checkboxes */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {allStores?.map(store => (
            <label
              key={store.id}
              className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                selectedStores.includes(store.id)
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedStores.includes(store.id)}
                onChange={() => handleStoreToggle(store.id)}
                disabled={!selectedStores.includes(store.id) && selectedStores.length >= 5}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {store.nombre}
                </p>
                <p className="text-xs text-gray-500">{store.region}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Radar Chart */}
      {selectedStores.length >= 2 && (
        <RadarComparisonChart
          stores={comparison?.stores || []}
          loading={isLoading}
        />
      )}

      {/* Tabla Comparativa */}
      {selectedStores.length >= 2 && (
        <ComparisonTable
          stores={comparison?.stores || []}
          promedioRed={comparison?.promedio_red}
          loading={isLoading}
        />
      )}
    </div>
  );
}
```

#### 10.1 Radar Chart
```typescript
// RadarComparisonChart.tsx
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';

export function RadarComparisonChart({ stores, loading }: Props) {
  if (loading) return <ChartSkeleton />;

  // Transformar datos para radar chart
  const metrics = [
    { metric: 'Ventas', key: 'ventas' },
    { metric: 'Tickets', key: 'tickets' },
    { metric: 'Ticket Prom', key: 'ticket_promedio' },
    { metric: 'Items/Ticket', key: 'items_ticket' },
    { metric: 'Margen %', key: 'margen_pct' }
  ];

  const radarData = metrics.map(m => {
    const dataPoint: any = { metric: m.metric };
    stores.forEach((store, idx) => {
      dataPoint[store.nombre] = store.normalized[m.key] || 0;
    });
    return dataPoint;
  });

  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Comparación Visual (Radar)
      </h3>

      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={radarData}>
          <PolarGrid />
          <PolarAngleAxis dataKey="metric" />
          <PolarRadiusAxis angle={90} domain={[0, 100]} />
          <Tooltip />
          <Legend />

          {stores.map((store, idx) => (
            <Radar
              key={store.ubicacion_id}
              name={store.nombre}
              dataKey={store.nombre}
              stroke={colors[idx % colors.length]}
              fill={colors[idx % colors.length]}
              fillOpacity={0.3}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>

      <p className="text-xs text-gray-500 text-center mt-4">
        * Valores normalizados a escala 0-100 para comparación visual
      </p>
    </div>
  );
}
```

---

### DÍA 11: Tabla Comparativa y Polish

#### 11.1 Tabla Comparativa
```typescript
// ComparisonTable.tsx
export function ComparisonTable({ stores, promedioRed, loading }: Props) {
  if (loading) return <TableSkeleton />;

  const metrics = [
    { label: 'Ventas período', key: 'ventas', format: 'currency' },
    { label: 'Ticket promedio', key: 'ticket_promedio', format: 'currency' },
    { label: '# Tickets/día', key: 'tickets_dia', format: 'number' },
    { label: 'Items/ticket', key: 'items_ticket', format: 'decimal' },
    { label: 'Margen %', key: 'margen_pct', format: 'percent' },
    { label: 'Categoría top', key: 'categoria_top', format: 'text' },
    { label: 'Hora pico', key: 'hora_pico', format: 'text' }
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          Tabla Comparativa
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                Métrica
              </th>
              {stores.map(store => (
                <th key={store.ubicacion_id} className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                  {store.nombre}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                Promedio Red
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {metrics.map(metric => {
              const values = stores.map(s => s.metrics[metric.key]);
              const maxValue = Math.max(...values.filter(v => typeof v === 'number'));
              const minValue = Math.min(...values.filter(v => typeof v === 'number'));

              return (
                <tr key={metric.key}>
                  <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                    {metric.label}
                  </td>
                  {stores.map(store => {
                    const value = store.metrics[metric.key];
                    const isMax = value === maxValue && typeof value === 'number';
                    const isMin = value === minValue && typeof value === 'number';

                    return (
                      <td
                        key={store.ubicacion_id}
                        className={`px-4 py-3 text-right text-sm font-medium ${
                          isMax ? 'bg-green-50 text-green-700' :
                          isMin ? 'bg-red-50 text-red-700' :
                          'text-gray-900'
                        }`}
                      >
                        {formatValue(value, metric.format)}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right text-sm text-gray-600">
                    {formatValue(promedioRed?.[metric.key], metric.format)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Leyenda */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
            <span className="text-gray-600">Mejor valor</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-50 border border-red-200 rounded"></div>
            <span className="text-gray-600">Valor más bajo</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatValue(value: any, format: string): string {
  if (value === null || value === undefined) return '-';

  switch (format) {
    case 'currency':
      return `$${Number(value).toLocaleString()}`;
    case 'number':
      return Number(value).toLocaleString();
    case 'decimal':
      return Number(value).toFixed(1);
    case 'percent':
      return `${Number(value).toFixed(1)}%`;
    case 'text':
    default:
      return String(value);
  }
}
```

---

## 📅 FASE 5: Testing, Polish y Documentación (Día 12)

### DÍA 12: Testing End-to-End y Documentación

#### 12.1 Tests de Integración
```typescript
// __tests__/bi-stores.test.ts
describe('BI Stores Module', () => {
  it('should load network KPIs', async () => {
    // Test endpoint /bi/stores/network/kpis
  });

  it('should load store evolution', async () => {
    // Test endpoint /bi/stores/{id}/evolution
  });

  it('should load hourly heatmap', async () => {
    // Test endpoint /bi/stores/{id}/hourly-heatmap
  });

  it('should compare multiple stores', async () => {
    // Test endpoint /bi/stores/compare-multi
  });
});
```

#### 12.2 Documentación de Usuario
**Archivo**: `docs-site/docs/modulos/bi-tiendas.md`

```markdown
# Business Intelligence - Por Tienda

## Descripción

El módulo de BI por Tienda permite analizar el desempeño de cada tienda,
comparar entre tiendas y visualizar tendencias temporales.

## Características

### Dashboard de Red
- KPIs consolidados de toda la red
- Ranking de tiendas por ventas, tickets, margen
- Comparación temporal (período anterior o año anterior)
- Filtros por región

### Detalle de Tienda
- Evolución diaria de ventas
- Heatmap de ventas por hora y día de semana
- Top 10 categorías más vendidas
- Distribución de tickets por rangos de valor
- Margen por categoría

### Comparador Multi-Tienda
- Comparar hasta 5 tiendas simultáneamente
- Radar chart con 5 métricas normalizadas
- Tabla comparativa con highlight de mejor/peor

## Limitaciones

- 60% de productos no tienen categoría asignada (se excluyen de análisis)
- No hay datos de promociones ni descuentos
```

#### 12.3 Optimizaciones Finales
```typescript
// Implementar lazy loading de componentes
const StoresDashboard = lazy(() => import('./StoresDashboard'));
const StoreDetail = lazy(() => import('./StoreDetail'));
const StoreComparator = lazy(() => import('./StoreComparator'));

// Agregar error boundaries
export function BIStoresErrorBoundary({ children }: Props) {
  return (
    <ErrorBoundary
      fallback={<ErrorFallback />}
      onError={(error) => console.error('BI Stores Error:', error)}
    >
      {children}
    </ErrorBoundary>
  );
}

// Agregar analytics tracking
useEffect(() => {
  analytics.track('BI_Stores_View', {
    tab: activeTab,
    period: period,
    region: region
  });
}, [activeTab, period, region]);
```

---

## 📊 Resumen de Entregables

### Backend (6 endpoints nuevos)
1. ✅ `GET /bi/stores/network/kpis` - KPIs de red con comparación temporal
2. ✅ `GET /bi/stores/{id}/evolution` - Evolución diaria de ventas
3. ✅ `GET /bi/stores/{id}/hourly-heatmap` - Heatmap por hora
4. ✅ `GET /bi/stores/{id}/categories` - Top categorías
5. ✅ `GET /bi/stores/{id}/ticket-distribution` - Distribución de tickets
6. ✅ `GET /bi/stores/compare-multi` - Comparador multi-tienda

### Frontend (12 componentes nuevos)
1. ✅ KPICard (reutilizable)
2. ✅ PeriodSelector (filtros globales)
3. ✅ StoresDashboard (Tab 1)
4. ✅ StoresBarChart
5. ✅ StoresRankingTable
6. ✅ StoreDetail (Tab 2)
7. ✅ SalesEvolutionChart
8. ✅ HourlyHeatmap
9. ✅ TopCategoriesChart
10. ✅ TicketDistributionChart
11. ✅ MarginByCategoryChart
12. ✅ StoreComparator (Tab 3)
13. ✅ RadarComparisonChart
14. ✅ ComparisonTable

### Hooks y Utilidades
1. ✅ useBIStores
2. ✅ useStoreMetrics
3. ✅ storeCalculations.ts
4. ✅ formatters.ts (extendido)

### Documentación
1. ✅ Documentación de usuario
2. ✅ Tests de integración
3. ✅ Comentarios en código

---

## 🎯 Métricas de Éxito

Al finalizar la implementación, el módulo debe:
- ✅ Cargar KPIs de red en < 500ms
- ✅ Cargar detalle de tienda en < 1s
- ✅ Soportar comparación de hasta 5 tiendas
- ✅ Funcionar en tablets (1024px+)
- ✅ Tener skeletons para todos los estados de carga
- ✅ Manejar errores gracefully

---

## 📅 Cronograma Detallado

| Día | Fase | Horas | Entregables |
|-----|------|-------|-------------|
| 1 | Backend - Temporal | 8h | 2 endpoints (evolution, network KPIs) |
| 2 | Backend - Análisis | 8h | 2 endpoints (heatmap, categories) |
| 3 | Backend - Comparación | 8h | 2 endpoints (distribution, compare) |
| 4 | Frontend - Base | 8h | KPICard, PeriodSelector, Hooks |
| 5 | Frontend - Dashboard | 8h | Tab 1 completo |
| 6 | Frontend - Charts 1 | 8h | Barras, Tabla, Skeletons |
| 7 | Frontend - Detalle 1 | 8h | Layout, Evolución |
| 8 | Frontend - Detalle 2 | 8h | Heatmap, Categorías |
| 9 | Frontend - Detalle 3 | 8h | Distribución, Margen |
| 10 | Frontend - Comparador 1 | 8h | Selector, Radar |
| 11 | Frontend - Comparador 2 | 8h | Tabla, Polish |
| 12 | Testing y Docs | 8h | Tests, Docs, Optimización |
| **TOTAL** | **12 días** | **96h** | **Módulo completo** |

---

## ✅ Checklist de Implementación

### Backend
- [ ] Crear router `bi_stores.py`
- [ ] Implementar endpoint network KPIs
- [ ] Implementar endpoint evolution
- [ ] Implementar endpoint hourly-heatmap
- [ ] Implementar endpoint categories
- [ ] Implementar endpoint ticket-distribution
- [ ] Implementar endpoint compare-multi
- [ ] Agregar validaciones y error handling
- [ ] Documentar endpoints en Swagger

### Frontend
- [ ] Crear carpeta `components/bi/stores/`
- [ ] Implementar KPICard reutilizable
- [ ] Implementar PeriodSelector
- [ ] Crear hook useBIStores
- [ ] Implementar StoresDashboard
- [ ] Implementar StoresBarChart
- [ ] Implementar StoresRankingTable
- [ ] Implementar StoreDetail
- [ ] Implementar SalesEvolutionChart
- [ ] Implementar HourlyHeatmap
- [ ] Implementar TopCategoriesChart
- [ ] Implementar TicketDistributionChart
- [ ] Implementar MarginByCategoryChart
- [ ] Implementar StoreComparator
- [ ] Implementar RadarComparisonChart
- [ ] Implementar ComparisonTable
- [ ] Agregar skeletons/loading states
- [ ] Agregar error boundaries
- [ ] Optimizar renders

### Testing
- [ ] Tests unitarios backend
- [ ] Tests de integración endpoints
- [ ] Tests de componentes frontend
- [ ] Test end-to-end del flujo completo
- [ ] Performance testing

### Documentación
- [ ] Documentar API endpoints
- [ ] Documentar componentes frontend
- [ ] Crear guía de usuario
- [ ] Agregar screenshots/demos
- [ ] Documentar limitaciones conocidas

---

**Próximo paso**: ¿Empezamos con el Día 1 (endpoints de evolución y network KPIs)?
