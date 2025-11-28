# DuckDB Legacy - ABC-XYZ Calculations

**Estado:** ❌ DEPRECADO
**Fecha deprecación:** 2025-01-27
**Razón:** Sistema migrado a PostgreSQL v2.0 con cálculo on-demand

---

## ⚠️ Estos archivos NO se usan en producción

Todos los scripts y schemas en este directorio son **legacy de DuckDB** y fueron reemplazados por:
- Cálculo ABC-XYZ on-demand en PostgreSQL (ver `backend/main.py`)
- Sin tablas pre-calculadas (MVP usa queries en tiempo real)

---

## Archivos Legacy (NO USAR)

### Scripts de Cálculo DuckDB
- `calcular_abc_v2.py` - Cálculo ABC v2 (DuckDB)
- `calcular_xyz.py` - Cálculo XYZ (DuckDB)
- `calcular_abc_v2_por_tienda.py` - ABC por tienda (DuckDB)
- `calcular_xyz_por_tienda.py` - XYZ por tienda (DuckDB)
- `calcular_abc_v2_adaptado.py` - Versión adaptada ABC (DuckDB)

### Schemas DuckDB
- `schema_abc_v2.sql` - Schema tabla productos_abc_v2 (DuckDB)
- `schema_abc_xyz.sql` - Extensión XYZ (DuckDB)

### Queries de Análisis DuckDB
- `queries_analisis_abc_v2.sql` - Queries analíticos (DuckDB)
- `dashboard_abc_v2.sql` - Dashboard queries (DuckDB)
- `calculo_abc_v2.sql` - Cálculo SQL puro (DuckDB)
- `calculo_indice_gini.sql` - Índice Gini (DuckDB)

### Scripts de Migración DuckDB
- `migrate_abc_v2_schema.sql` - Migración schema (DuckDB)
- `apply_abc_xyz_migration.sh` - Script aplicar migración (DuckDB)

### Scripts de Consulta DuckDB
- `consultar_abc_v2.py` - Consultar clasificación ABC (DuckDB)
- `consultar_xyz.py` - Consultar clasificación XYZ (DuckDB)
- `verificar_resultados_tienda.py` - Verificar resultados (DuckDB)

### Inicializadores DuckDB
- `init_conjuntos_sustituibles.py` - Init conjuntos (DuckDB)

### Documentación Legacy
- `README_ABC_V2.md` - Documentación ABC v2 (DuckDB)
- `README_ABC_V2_FINAL.md` - Documentación final (DuckDB)
- `README_NIVEL_OBJETIVO.md` - Nivel objetivo (DuckDB)

---

## ¿Por qué se deprecaron?

**Approach original (DuckDB):**
- ✅ Queries ultra-rápidas (< 500ms)
- ✅ Histórico de clasificaciones
- ❌ Complejidad alta (ETL, schedulers, tablas)
- ❌ Desarrollo lento (20-30 hrs)
- ❌ Mantenimiento costoso

**Approach MVP (PostgreSQL on-demand):**
- ✅ Desarrollo rápido (6-8 hrs)
- ✅ Código simple (sin ETL)
- ✅ Datos siempre frescos (real-time)
- ⚠️ Queries más lentos (2-3s, aceptable para MVP)
- ⚠️ Sin histórico (se puede agregar después)

**Decisión:** Para MVP, velocidad de desarrollo > velocidad de queries

---

## Si necesitas referencia

Estos archivos se mantienen para:
1. **Referencia técnica** - Ver cómo se calculaba ABC-XYZ en DuckDB
2. **Migración futura** - Si necesitas tabla pre-calculada en v2
3. **Comparación** - Validar que cálculo PostgreSQL es equivalente

**NO ejecutar** estos scripts en producción (usan DuckDB, no PostgreSQL)

---

## Migración actual (PostgreSQL v2.0)

Ver plan activo: [PLAN_MIGRACION_PRODUCTOS_MVP.md](../../../PLAN_MIGRACION_PRODUCTOS_MVP.md)

Endpoints migrados en: `backend/main.py`
- Cálculo ABC-XYZ con CTEs
- Sin tablas pre-calculadas
- Performance < 3s (aceptable)
