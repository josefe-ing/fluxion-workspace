# Plan MVP: Sección Productos (ABC-XYZ) - Cálculo On-Demand

**Fecha:** 2025-01-27
**Objetivo:** Rescatar la sección Productos con cálculo en tiempo real (sin tablas ABC-XYZ pre-calculadas)
**Tiempo estimado:** 6-8 horas de desarrollo

---

## 🎯 Filosofía del MVP

> **"Calcula ABC-XYZ on-demand cuando el usuario lo necesita, no antes"**

**Ventajas:**
- ✅ Desarrollo 3x más rápido (6-8 hrs vs 20-30 hrs)
- ✅ Datos siempre actualizados (real-time)
- ✅ Menos código que mantener
- ✅ Sin ETL schedulers ni jobs nocturnos
- ✅ Validar valor antes de optimizar

**Trade-offs aceptables para MVP:**
- ⚠️ Queries 2-3 segundos (vs < 500ms con tabla pre-calculada)
- ⚠️ Sin histórico de evolución ABC (se puede agregar después)

---

## 📊 Estado Actual

### ✅ Frontend - COMPLETO (No requiere cambios)
- [ABCXYZAnalysis.tsx](frontend/src/components/productos/ABCXYZAnalysis.tsx)
- [ProductoDetalleModal.tsx](frontend/src/components/productos/ProductoDetalleModal.tsx)
- [productosService.ts](frontend/src/services/productosService.ts)
- Ruta: `/productos`

### ⚠️ Backend - 11 Endpoints en DuckDB (Requieren migración)
```
GET /api/productos/matriz-abc-xyz
GET /api/productos/lista-por-matriz
GET /api/productos/{codigo}/detalle-completo
GET /api/productos/{codigo}/ventas-semanales
GET /api/productos/{codigo}/ventas-por-tienda
GET /api/productos/{codigo}/historico-clasificacion
GET /api/productos/{codigo}/historico-inventario
GET /api/productos/{codigo}/reconciliacion-inventario
GET /api/productos/{codigo}/historico-abc-xyz
GET /api/productos (✅ ya migrado)
GET /api/categorias (✅ ya migrado)
```

### ✅ PostgreSQL v2.0 - Tablas Core Disponibles
```
productos              # Catálogo maestro
ubicaciones            # Tiendas
ventas                 # Transacciones (con costo_unitario)
inventario_actual      # Stock actual por almacén
inventario_historico   # Time series cada 30 min
```

---

## 🚀 Plan de Desarrollo (3 Fases)

### Fase 1: Preparación - Índices de Performance (30 min)

**Objetivo:** Asegurar que queries de ABC-XYZ sean rápidos

**Verificar índices existentes:**
```sql
-- Ya existen en schema_postgresql_v2.sql, solo verificar:
\d ventas

-- Índices críticos para ABC-XYZ:
idx_ventas_fecha                    # fecha_venta DESC
idx_ventas_ubicacion_fecha          # ubicacion_id, fecha_venta DESC
idx_ventas_producto_fecha           # producto_id, fecha_venta DESC
idx_ventas_almacen                  # almacen_codigo
```

**Si faltan, crear:**
```sql
-- Script: database/verify_abc_indexes.sql
CREATE INDEX IF NOT EXISTS idx_ventas_producto_ubicacion_fecha
  ON ventas(producto_id, ubicacion_id, fecha_venta DESC);

CREATE INDEX IF NOT EXISTS idx_ventas_costo
  ON ventas(costo_unitario) WHERE costo_unitario IS NOT NULL;
```

**Archivo a crear:**
- `database/verify_abc_indexes.sql` (verificación + creación si faltan)

---

### Fase 2: Migración de Endpoints Backend (4-6 hrs)

**Objetivo:** Migrar los 9 endpoints de productos para calcular ABC-XYZ on-demand

#### 2.1 Endpoints PRIORITARIOS (MVP Core)

**1. `/api/productos/matriz-abc-xyz` - Matriz 3×3**

Calcula ABC-XYZ en tiempo real usando CTEs:

```python
@app.get("/api/productos/matriz-abc-xyz", tags=["Productos"])
async def get_matriz_abc_xyz(ubicacion_id: Optional[str] = None):
    """
    Calcula matriz ABC-XYZ on-demand (sin tabla pre-calculada)

    ABC: Basado en valor de consumo (cantidad × costo)
        - A: 80% del valor acumulado
        - B: 80-95% del valor
        - C: 95-100% del valor

    XYZ: Basado en CV de ventas semanales (últimas 12 semanas)
        - X: CV < 0.5 (estable)
        - Y: 0.5 ≤ CV < 1.0 (variable)
        - Z: CV ≥ 1.0 (errática)
    """
    query = """
    WITH ventas_6m AS (
        -- Ventas últimos 6 meses
        SELECT
            v.producto_id,
            v.ubicacion_id,
            p.nombre as descripcion,
            SUM(v.cantidad_vendida * COALESCE(v.costo_unitario, 0)) as valor_consumo
        FROM ventas v
        JOIN productos p ON v.producto_id = p.id
        WHERE v.fecha_venta >= CURRENT_DATE - INTERVAL '6 months'
            {ubicacion_filter}
        GROUP BY v.producto_id, v.ubicacion_id, p.nombre
    ),
    abc_classification AS (
        -- Clasificación ABC con Pareto
        SELECT *,
            SUM(valor_consumo) OVER (ORDER BY valor_consumo DESC) /
                NULLIF(SUM(valor_consumo) OVER (), 0) * 100 as pct_acumulado,
            CASE
                WHEN SUM(valor_consumo) OVER (ORDER BY valor_consumo DESC) /
                     NULLIF(SUM(valor_consumo) OVER (), 0) * 100 <= 80 THEN 'A'
                WHEN SUM(valor_consumo) OVER (ORDER BY valor_consumo DESC) /
                     NULLIF(SUM(valor_consumo) OVER (), 0) * 100 <= 95 THEN 'B'
                ELSE 'C'
            END as clasificacion_abc
        FROM ventas_6m
        WHERE valor_consumo > 0
    ),
    ventas_semanales AS (
        -- Ventas por semana (últimas 12 semanas) para CV
        SELECT
            producto_id,
            ubicacion_id,
            DATE_TRUNC('week', fecha_venta) as semana,
            SUM(cantidad_vendida) as unidades
        FROM ventas
        WHERE fecha_venta >= CURRENT_DATE - INTERVAL '12 weeks'
            {ubicacion_filter}
        GROUP BY producto_id, ubicacion_id, DATE_TRUNC('week', fecha_venta)
    ),
    xyz_classification AS (
        -- Clasificación XYZ con Coeficiente de Variación
        SELECT
            producto_id,
            ubicacion_id,
            AVG(unidades) as promedio,
            STDDEV(unidades) as desviacion,
            CASE
                WHEN AVG(unidades) > 0 THEN STDDEV(unidades) / AVG(unidades)
                ELSE NULL
            END as cv,
            COUNT(*) as semanas_con_venta
        FROM ventas_semanales
        GROUP BY producto_id, ubicacion_id
    ),
    matriz AS (
        -- Combinar ABC + XYZ
        SELECT
            abc.clasificacion_abc,
            CASE
                WHEN xyz.cv < 0.5 THEN 'X'
                WHEN xyz.cv < 1.0 THEN 'Y'
                ELSE 'Z'
            END as clasificacion_xyz,
            COUNT(*) as count,
            SUM(abc.valor_consumo) as total_valor
        FROM abc_classification abc
        LEFT JOIN xyz_classification xyz
            ON abc.producto_id = xyz.producto_id
            AND abc.ubicacion_id = xyz.ubicacion_id
        WHERE xyz.semanas_con_venta >= 4  -- Mínimo confiabilidad
        GROUP BY abc.clasificacion_abc, clasificacion_xyz
    )
    SELECT
        clasificacion_abc || clasificacion_xyz as matriz,
        count,
        total_valor,
        count * 100.0 / SUM(count) OVER () as porcentaje_productos,
        total_valor * 100.0 / SUM(total_valor) OVER () as porcentaje_valor
    FROM matriz
    ORDER BY clasificacion_abc, clasificacion_xyz;
    """

    ubicacion_filter = ""
    if ubicacion_id:
        ubicacion_filter = f"AND v.ubicacion_id = '{ubicacion_id}'"

    query = query.format(ubicacion_filter=ubicacion_filter)

    results = execute_query_dict(query)

    # Formatear respuesta como frontend espera
    return format_matriz_response(results)
```

**2. `/api/productos/lista-por-matriz` - Lista filtrada por matriz**

Similar estructura, filtra por matriz específica (ej: "AX", "BZ")

**3. `/api/productos/{codigo}/detalle-completo` - Detalle individual**

Calcula ABC-XYZ solo para ese producto específico (más rápido)

**4. `/api/productos/{codigo}/ventas-semanales` - Gráfico de ventas**

```python
@app.get("/api/productos/{codigo}/ventas-semanales", tags=["Productos"])
async def get_ventas_semanales(codigo: str, ubicacion_id: Optional[str] = None):
    """
    Ventas semanales últimas 52 semanas (para gráfico)
    """
    query = """
    WITH semanas AS (
        SELECT
            DATE_TRUNC('week', fecha_venta) as semana,
            SUM(cantidad_vendida) as unidades,
            SUM(venta_total) as valor,
            COUNT(DISTINCT DATE(fecha_venta)) as dias_con_venta
        FROM ventas
        WHERE producto_id = %s
            AND fecha_venta >= CURRENT_DATE - INTERVAL '52 weeks'
            {ubicacion_filter}
        GROUP BY DATE_TRUNC('week', fecha_venta)
        ORDER BY semana
    )
    SELECT
        TO_CHAR(semana, 'YYYY-WW') as semana,
        unidades,
        valor,
        unidades / NULLIF(dias_con_venta, 0) as promedio_diario,
        semana as fecha_inicio
    FROM semanas
    """

    ubicacion_filter = ""
    params = [codigo]
    if ubicacion_id:
        ubicacion_filter = "AND ubicacion_id = %s"
        params.append(ubicacion_id)

    query = query.format(ubicacion_filter=ubicacion_filter)
    results = execute_query_dict(query, tuple(params))

    return {
        "codigo_producto": codigo,
        "ubicacion_id": ubicacion_id,
        "semanas": results,
        "metricas": calculate_metricas(results)
    }
```

**5. `/api/productos/{codigo}/ventas-por-tienda` - Ventas por ubicación**

Query directo a tabla `ventas` agrupado por ubicación.

#### 2.2 Endpoints SECUNDARIOS (Pueden esperar v2)

**6. `/api/productos/{codigo}/historico-clasificacion`**

Para MVP: Retornar mensaje indicando "Histórico no disponible en MVP"
```python
@app.get("/api/productos/{codigo}/historico-clasificacion", tags=["Productos"])
async def get_historico_clasificacion(codigo: str, ubicacion_id: Optional[str] = None):
    """
    MVP: Histórico de clasificación no disponible
    TODO: Implementar en v2 con tabla productos_abc_v2_historico
    """
    # Calcular clasificación ACTUAL on-demand
    clasificacion_actual = calcular_abc_xyz_producto(codigo, ubicacion_id)

    return {
        "codigo_producto": codigo,
        "ubicacion_id": ubicacion_id,
        "clasificacion_actual": clasificacion_actual,
        "historico": [],  # Vacío en MVP
        "nota": "Histórico de clasificación estará disponible en próxima versión"
    }
```

**7. `/api/productos/{codigo}/historico-inventario`**

Usar tabla `inventario_historico` (ya existe en PostgreSQL v2.0)

**8. `/api/productos/{codigo}/reconciliacion-inventario`**

Correlacionar `inventario_historico` con `ventas` (ya existe data)

**9. `/api/productos/{codigo}/historico-abc-xyz`** (legacy)

Deprecar o redirigir a `/historico-clasificacion`

---

#### 2.3 Helpers y Utilidades

**Crear funciones helper en `backend/main.py`:**

```python
# ============================================================================
# HELPERS PARA CÁLCULO ABC-XYZ ON-DEMAND
# ============================================================================

def calcular_abc_xyz_producto(producto_id: str, ubicacion_id: Optional[str] = None) -> Dict:
    """
    Calcula clasificación ABC-XYZ para un producto específico
    Más rápido que calcular toda la matriz
    """
    query = """
    WITH producto_ventas AS (
        SELECT
            SUM(cantidad_vendida * COALESCE(costo_unitario, 0)) as valor_consumo
        FROM ventas
        WHERE producto_id = %s
            AND fecha_venta >= CURRENT_DATE - INTERVAL '6 months'
            {ubicacion_filter}
    ),
    total_ventas AS (
        SELECT SUM(cantidad_vendida * COALESCE(costo_unitario, 0)) as total
        FROM ventas
        WHERE fecha_venta >= CURRENT_DATE - INTERVAL '6 months'
            {ubicacion_filter}
    ),
    ventas_semanales AS (
        SELECT
            DATE_TRUNC('week', fecha_venta) as semana,
            SUM(cantidad_vendida) as unidades
        FROM ventas
        WHERE producto_id = %s
            AND fecha_venta >= CURRENT_DATE - INTERVAL '12 weeks'
            {ubicacion_filter}
        GROUP BY DATE_TRUNC('week', fecha_venta)
    )
    SELECT
        pv.valor_consumo,
        tv.total as total_mercado,
        pv.valor_consumo * 100.0 / NULLIF(tv.total, 0) as porcentaje_valor,
        AVG(vs.unidades) as promedio_semanal,
        STDDEV(vs.unidades) as desviacion_semanal,
        STDDEV(vs.unidades) / NULLIF(AVG(vs.unidades), 0) as cv,
        COUNT(vs.semana) as semanas_con_venta
    FROM producto_ventas pv, total_ventas tv
    LEFT JOIN ventas_semanales vs ON true
    GROUP BY pv.valor_consumo, tv.total
    """
    # ... implementación completa

def calculate_metricas(ventas_semanales: List[Dict]) -> Dict:
    """Calcula métricas agregadas de ventas semanales"""
    if not ventas_semanales:
        return {
            "semanas_con_ventas": 0,
            "total_unidades": 0,
            "total_valor": 0,
            "promedio_semanal": 0,
            "coeficiente_variacion": None
        }

    unidades = [v['unidades'] for v in ventas_semanales]
    total_unidades = sum(unidades)
    promedio = total_unidades / len(unidades)

    # CV = desviación estándar / media
    varianza = sum((x - promedio) ** 2 for x in unidades) / len(unidades)
    desviacion = varianza ** 0.5
    cv = desviacion / promedio if promedio > 0 else None

    return {
        "semanas_con_ventas": len([u for u in unidades if u > 0]),
        "total_unidades": total_unidades,
        "total_valor": sum(v['valor'] for v in ventas_semanales),
        "promedio_semanal": promedio,
        "coeficiente_variacion": cv
    }

def format_matriz_response(results: List[Dict]) -> Dict:
    """
    Formatea resultados de query ABC-XYZ como frontend espera

    Frontend espera:
    {
        "total_productos": 3133,
        "total_valor": 1234567.89,
        "matriz": {
            "AX": { "count": 150, "porcentaje_productos": 4.8, ... },
            "AY": { ... },
            ...
        },
        "resumen_abc": { "A": {...}, "B": {...}, "C": {...} },
        "resumen_xyz": { "X": {...}, "Y": {...}, "Z": {...} }
    }
    """
    matriz = {}
    resumen_abc = {}
    resumen_xyz = {}

    total_productos = sum(r['count'] for r in results)
    total_valor = sum(r['total_valor'] for r in results)

    for row in results:
        matriz_key = row['matriz']  # "AX", "BY", etc
        abc = matriz_key[0]  # "A"
        xyz = matriz_key[1]  # "X"

        matriz[matriz_key] = {
            "count": row['count'],
            "porcentaje_productos": row['porcentaje_productos'],
            "porcentaje_valor": row['porcentaje_valor']
        }

        # Acumular resumen ABC
        if abc not in resumen_abc:
            resumen_abc[abc] = {"count": 0, "porcentaje_productos": 0, "porcentaje_valor": 0}
        resumen_abc[abc]["count"] += row['count']
        resumen_abc[abc]["porcentaje_productos"] += row['porcentaje_productos']
        resumen_abc[abc]["porcentaje_valor"] += row['porcentaje_valor']

        # Acumular resumen XYZ
        if xyz not in resumen_xyz:
            resumen_xyz[xyz] = {"count": 0, "porcentaje_productos": 0, "porcentaje_valor": 0}
        resumen_xyz[xyz]["count"] += row['count']
        resumen_xyz[xyz]["porcentaje_productos"] += row['porcentaje_productos']
        resumen_xyz[xyz]["porcentaje_valor"] += row['porcentaje_valor']

    return {
        "total_productos": total_productos,
        "total_valor": total_valor,
        "matriz": matriz,
        "resumen_abc": resumen_abc,
        "resumen_xyz": resumen_xyz
    }
```

---

### Fase 3: Testing End-to-End (1-2 hrs)

**3.1 Testing Manual**
```bash
# 1. Iniciar backend
cd backend
python3 start.py

# 2. Iniciar frontend
cd frontend
npm run dev

# 3. Navegar a http://localhost:3001/productos
```

**Checklist de validación:**
- [ ] Matriz ABC-XYZ carga correctamente (9 celdas)
- [ ] Filtro por tienda funciona
- [ ] Vista global (todas las tiendas) funciona
- [ ] Click en celda matriz → muestra productos
- [ ] Click en producto → modal detalle se abre
- [ ] Gráfico ventas semanales renderiza
- [ ] Tabla por tienda muestra stock
- [ ] Performance aceptable (< 3 segundos)

**3.2 Testing de Performance**
```sql
-- Medir tiempo de query ABC-XYZ completo
EXPLAIN ANALYZE
WITH ventas_6m AS (
    SELECT producto_id, ubicacion_id,
           SUM(cantidad_vendida * COALESCE(costo_unitario, 0)) as valor_consumo
    FROM ventas
    WHERE fecha_venta >= CURRENT_DATE - INTERVAL '6 months'
    GROUP BY producto_id, ubicacion_id
)
SELECT * FROM ventas_6m ORDER BY valor_consumo DESC LIMIT 100;

-- Target: < 3000ms
```

**Si performance es mala:**
- Verificar índices existen
- Verificar estadísticas están actualizadas: `ANALYZE ventas;`
- Considerar `VACUUM ANALYZE` si no se ha hecho

**3.3 Testing con datos reales**
- Tienda real (tienda_01, tienda_15, cedi_caracas)
- Productos con diferentes volúmenes
- Verificar números tienen sentido (comparar con DuckDB)

---

## 📋 Archivos a Crear/Modificar

### ✅ CREAR (Nuevos)

1. **`database/verify_abc_indexes.sql`**
   - Verificar índices necesarios para ABC-XYZ
   - Crear si faltan

2. **`PLAN_MIGRACION_PRODUCTOS_MVP.md`** (este archivo)
   - Plan completo MVP

### ✏️ MODIFICAR (Existentes)

1. **`backend/main.py`**
   - Migrar 9 endpoints de productos (líneas ~987-2100)
   - Agregar helpers de cálculo ABC-XYZ
   - Adaptar queries DuckDB → PostgreSQL

### 🗑️ DEPRECAR (Marcar para eliminación futura)

**Archivos DuckDB que YA NO SE USAN:**

1. **Scripts de cálculo ABC-XYZ (DuckDB):**
   - `database/calcular_abc_v2.py`
   - `database/calcular_xyz.py`
   - `database/calcular_abc_v2_por_tienda.py`
   - `database/calcular_xyz_por_tienda.py`
   - `database/calcular_abc_v2_adaptado.py`

2. **Schemas ABC-XYZ (DuckDB):**
   - `database/schema_abc_v2.sql`
   - `database/schema_abc_xyz.sql`

3. **Queries de análisis (DuckDB):**
   - `database/queries_analisis_abc_v2.sql`
   - `database/dashboard_abc_v2.sql`
   - `database/calculo_abc_v2.sql`
   - `database/calculo_indice_gini.sql`

4. **Scripts de migración ABC (DuckDB):**
   - `database/migrate_abc_v2_schema.sql`
   - `database/apply_abc_xyz_migration.sh`

5. **Scripts de consulta (DuckDB):**
   - `database/consultar_abc_v2.py`
   - `database/consultar_xyz.py`
   - `database/verificar_resultados_tienda.py`

6. **Inicializadores (DuckDB):**
   - `database/init_conjuntos_sustituibles.py`

7. **Documentación DuckDB:**
   - `database/README_ABC_V2.md`
   - `database/README_ABC_V2_FINAL.md`
   - `database/README_NIVEL_OBJETIVO.md`

**Acción recomendada:**
- Mover a `archive/duckdb-legacy/abc-xyz/`
- Agregar README indicando que son legacy (DuckDB)
- NO eliminar aún (pueden servir de referencia)

---

## 🚀 Orden de Ejecución

```
1. ✅ Fase 1: Índices (30 min)
   └─ database/verify_abc_indexes.sql

2. ⚙️ Fase 2: Endpoints (4-6 hrs)
   └─ backend/main.py
       ├─ Helpers: calcular_abc_xyz_producto(), format_matriz_response()
       ├─ GET /api/productos/matriz-abc-xyz
       ├─ GET /api/productos/lista-por-matriz
       ├─ GET /api/productos/{codigo}/detalle-completo
       ├─ GET /api/productos/{codigo}/ventas-semanales
       ├─ GET /api/productos/{codigo}/ventas-por-tienda
       └─ GET /api/productos/{codigo}/historico-clasificacion (stub)

3. ✅ Fase 3: Testing (1-2 hrs)
   └─ Validación manual + performance
```

**Total estimado: 6-8 horas**

---

## 🎯 Resultado Final

**Al completar este plan:**

✅ Sección `/productos` **100% funcional** en PostgreSQL v2.0
✅ Cálculo ABC-XYZ **en tiempo real** (sin ETL)
✅ Frontend sin cambios (ya funciona)
✅ Performance **< 3 segundos** (aceptable para MVP)
✅ Código **3x más simple** (sin tablas, ETL, schedulers)
✅ **6-8 hrs desarrollo** vs 20-30 hrs con tablas

**Limitaciones aceptables para MVP:**
- ⚠️ Sin histórico de evolución ABC (se puede agregar en v2)
- ⚠️ Queries 2-3s (vs < 500ms con pre-cálculo)

---

## 📈 Plan de Optimización Futura (Post-MVP)

**Si la sección es muy usada (>100 consultas/día), considerar:**

1. **Vista Materializada** (PostgreSQL)
   ```sql
   CREATE MATERIALIZED VIEW mv_productos_abc_xyz AS
   -- Query completo ABC-XYZ
   WITH REFRESH ON SCHEDULE DAILY AT 03:00;
   ```
   - Performance: < 500ms (vs 2-3s)
   - Refresco: 1x por día (suficiente)
   - Complejidad: Baja (solo vista, no ETL)

2. **Tabla pre-calculada** (approach original)
   - Solo si necesitas histórico de alertas
   - Solo si necesitas análisis de evolución temporal

---

**¿Listo para comenzar con Fase 1?** 🚀
