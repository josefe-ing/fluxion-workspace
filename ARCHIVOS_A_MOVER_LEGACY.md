# Archivos DuckDB a Mover a Legacy

**Fecha:** 2025-01-27
**Destino:** `archive/duckdb-legacy/abc-xyz-calculations/`

---

## ⚠️ IMPORTANTE: NO ELIMINAR, SOLO MOVER

Estos archivos NO se eliminan, se **mueven a archive/** para:
1. Referencia futura
2. Comparación de cálculos
3. Posible migración a tablas pre-calculadas en v2

---

## Lista de Archivos a Mover

### 📁 database/ → archive/duckdb-legacy/abc-xyz-calculations/

**Scripts de cálculo Python:**
```bash
mv database/calcular_abc_v2.py archive/duckdb-legacy/abc-xyz-calculations/
mv database/calcular_xyz.py archive/duckdb-legacy/abc-xyz-calculations/
mv database/calcular_abc_v2_por_tienda.py archive/duckdb-legacy/abc-xyz-calculations/
mv database/calcular_xyz_por_tienda.py archive/duckdb-legacy/abc-xyz-calculations/
mv database/calcular_abc_v2_adaptado.py archive/duckdb-legacy/abc-xyz-calculations/
```

**Schemas SQL (DuckDB):**
```bash
mv database/schema_abc_v2.sql archive/duckdb-legacy/abc-xyz-calculations/
mv database/schema_abc_xyz.sql archive/duckdb-legacy/abc-xyz-calculations/
```

**Queries de análisis SQL:**
```bash
mv database/queries_analisis_abc_v2.sql archive/duckdb-legacy/abc-xyz-calculations/
mv database/dashboard_abc_v2.sql archive/duckdb-legacy/abc-xyz-calculations/
mv database/calculo_abc_v2.sql archive/duckdb-legacy/abc-xyz-calculations/
mv database/calculo_indice_gini.sql archive/duckdb-legacy/abc-xyz-calculations/
```

**Scripts de migración (DuckDB):**
```bash
mv database/migrate_abc_v2_schema.sql archive/duckdb-legacy/abc-xyz-calculations/
mv database/apply_abc_xyz_migration.sh archive/duckdb-legacy/abc-xyz-calculations/
```

**Scripts de consulta Python:**
```bash
mv database/consultar_abc_v2.py archive/duckdb-legacy/abc-xyz-calculations/
mv database/consultar_xyz.py archive/duckdb-legacy/abc-xyz-calculations/
mv database/verificar_resultados_tienda.py archive/duckdb-legacy/abc-xyz-calculations/
```

**Inicializadores (DuckDB):**
```bash
mv database/init_conjuntos_sustituibles.py archive/duckdb-legacy/abc-xyz-calculations/
```

**Documentación legacy:**
```bash
mv database/README_ABC_V2.md archive/duckdb-legacy/abc-xyz-calculations/
mv database/README_ABC_V2_FINAL.md archive/duckdb-legacy/abc-xyz-calculations/
mv database/README_NIVEL_OBJETIVO.md archive/duckdb-legacy/abc-xyz-calculations/
```

---

## Script para ejecutar todos los movimientos

```bash
#!/bin/bash
# Script: move_legacy_abc_files.sh
# Mueve archivos DuckDB ABC-XYZ a legacy

DEST="archive/duckdb-legacy/abc-xyz-calculations/"

echo "🗂️  Moviendo archivos DuckDB ABC-XYZ a legacy..."

# Scripts Python
mv database/calcular_abc_v2.py "$DEST" 2>/dev/null && echo "✅ calcular_abc_v2.py"
mv database/calcular_xyz.py "$DEST" 2>/dev/null && echo "✅ calcular_xyz.py"
mv database/calcular_abc_v2_por_tienda.py "$DEST" 2>/dev/null && echo "✅ calcular_abc_v2_por_tienda.py"
mv database/calcular_xyz_por_tienda.py "$DEST" 2>/dev/null && echo "✅ calcular_xyz_por_tienda.py"
mv database/calcular_abc_v2_adaptado.py "$DEST" 2>/dev/null && echo "✅ calcular_abc_v2_adaptado.py"

# Schemas SQL
mv database/schema_abc_v2.sql "$DEST" 2>/dev/null && echo "✅ schema_abc_v2.sql"
mv database/schema_abc_xyz.sql "$DEST" 2>/dev/null && echo "✅ schema_abc_xyz.sql"

# Queries análisis
mv database/queries_analisis_abc_v2.sql "$DEST" 2>/dev/null && echo "✅ queries_analisis_abc_v2.sql"
mv database/dashboard_abc_v2.sql "$DEST" 2>/dev/null && echo "✅ dashboard_abc_v2.sql"
mv database/calculo_abc_v2.sql "$DEST" 2>/dev/null && echo "✅ calculo_abc_v2.sql"
mv database/calculo_indice_gini.sql "$DEST" 2>/dev/null && echo "✅ calculo_indice_gini.sql"

# Migraciones
mv database/migrate_abc_v2_schema.sql "$DEST" 2>/dev/null && echo "✅ migrate_abc_v2_schema.sql"
mv database/apply_abc_xyz_migration.sh "$DEST" 2>/dev/null && echo "✅ apply_abc_xyz_migration.sh"

# Scripts consulta
mv database/consultar_abc_v2.py "$DEST" 2>/dev/null && echo "✅ consultar_abc_v2.py"
mv database/consultar_xyz.py "$DEST" 2>/dev/null && echo "✅ consultar_xyz.py"
mv database/verificar_resultados_tienda.py "$DEST" 2>/dev/null && echo "✅ verificar_resultados_tienda.py"

# Inicializadores
mv database/init_conjuntos_sustituibles.py "$DEST" 2>/dev/null && echo "✅ init_conjuntos_sustituibles.py"

# Documentación
mv database/README_ABC_V2.md "$DEST" 2>/dev/null && echo "✅ README_ABC_V2.md"
mv database/README_ABC_V2_FINAL.md "$DEST" 2>/dev/null && echo "✅ README_ABC_V2_FINAL.md"
mv database/README_NIVEL_OBJETIVO.md "$DEST" 2>/dev/null && echo "✅ README_NIVEL_OBJETIVO.md"

echo ""
echo "✅ Archivos movidos a: $DEST"
echo "📋 Ver README: $DEST/README.md"
```

---

## Verificación Post-Movimiento

**Archivos que DEBEN permanecer en `database/`:**
- ✅ `schema_postgresql_v2.sql` - Schema PostgreSQL (en uso)
- ✅ `postgresql_schema.sql` - Schema PostgreSQL legacy
- ✅ `postgresql_schema_simplified.sql` - Schema simplificado
- ✅ `create_inventario_historico.sql` - Inventario histórico (en uso)
- ✅ `migrations/*.sql` - Migraciones PostgreSQL
- ✅ `init_db.py` - Inicializador DB
- ✅ Cualquier archivo que NO sea específico de ABC-XYZ DuckDB

**Archivos que DEBEN estar en `archive/duckdb-legacy/abc-xyz-calculations/`:**
- ✅ Todos los archivos listados arriba (17 archivos)
- ✅ README.md explicando que son legacy

---

## ⚠️ NO Mover

**Archivos que parecen ABC pero NO son DuckDB legacy:**
- `database/schema_conjuntos_sustituibles.sql` - Usado en PostgreSQL
- `database/schema_alertas_clasificacion.sql` - Usado en PostgreSQL
- `database/schema_nivel_objetivo.sql` - Usado en PostgreSQL

---

## Próximos Pasos

Después de mover archivos:

1. ✅ Verificar que `database/` solo tiene archivos PostgreSQL
2. ✅ Verificar que nada roto en repo
3. ✅ Commit cambios:
   ```bash
   git add -A
   git commit -m "chore: mover archivos DuckDB ABC-XYZ a legacy

   - Movidos 17 archivos de database/ a archive/duckdb-legacy/
   - Archivos deprecados tras migración a PostgreSQL v2.0
   - MVP usa cálculo ABC-XYZ on-demand (sin tablas pre-calculadas)
   - Ver PLAN_MIGRACION_PRODUCTOS_MVP.md"
   ```

---

## Resumen

**Archivos a mover:** 17
**Destino:** `archive/duckdb-legacy/abc-xyz-calculations/`
**Razón:** DuckDB legacy, reemplazado por PostgreSQL on-demand
**Acción:** Mover (NO eliminar)
