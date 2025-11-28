# 📊 Resumen Ejecutivo: Migración Productos ABC-XYZ a PostgreSQL v2.0

**Fecha:** 2025-01-27
**Decisión:** Approach MVP con cálculo on-demand (sin tablas pre-calculadas)
**Tiempo estimado:** 6-8 horas de desarrollo

---

## 🎯 Decisión Tomada

### ❌ Rechazado: Tablas Pre-calculadas
- Requiere crear `productos_abc_v2` + `productos_abc_v2_historico`
- Requiere ETL schedulers y jobs nocturnos
- Desarrollo: 20-30 horas
- Complejidad: ALTA

### ✅ Aprobado: Cálculo On-Demand (MVP)
- Calcula ABC-XYZ cuando usuario lo solicita
- Sin tablas adicionales en PostgreSQL
- Desarrollo: 6-8 horas
- Complejidad: BAJA

**Justificación:**
- Frontend ya está 100% funcional
- Pedidos Sugeridos está deshabilitado (no urge ABC-XYZ)
- Performance 2-3s es aceptable para MVP
- Validar valor antes de optimizar

---

## 📋 Documentación Creada

### 1. **Plan Principal (MVP)**
📄 [PLAN_MIGRACION_PRODUCTOS_MVP.md](PLAN_MIGRACION_PRODUCTOS_MVP.md)

**Contenido:**
- 3 fases de desarrollo (6-8 hrs total)
- Query examples para ABC-XYZ on-demand
- Testing checklist completo
- Plan de optimización futura

### 2. **Plan Original (Deprecado)**
📄 [PLAN_MIGRACION_PRODUCTOS.md](PLAN_MIGRACION_PRODUCTOS.md)

**Estado:** ❌ DEPRECADO
**Contenido:** Approach con tablas pre-calculadas (archivado para referencia)

### 3. **Lista de Archivos Legacy**
📄 [ARCHIVOS_A_MOVER_LEGACY.md](ARCHIVOS_A_MOVER_LEGACY.md)

**Contenido:**
- Lista de 17 archivos DuckDB a mover
- Script bash para ejecutar movimientos
- Verificación post-movimiento

### 4. **README Legacy**
📄 [archive/duckdb-legacy/abc-xyz-calculations/README.md](archive/duckdb-legacy/abc-xyz-calculations/README.md)

**Contenido:**
- Explicación de por qué se deprecaron
- Qué archivos contiene el directorio legacy
- Cuándo consultar estos archivos

---

## 🚀 Plan de Implementación (3 Fases)

### **Fase 1: Preparación - Índices** (30 min)
```bash
# Verificar índices en tabla ventas
psql $DATABASE_URL -f database/verify_abc_indexes.sql
```

**Índices críticos:**
- `idx_ventas_producto_fecha` (producto_id, fecha_venta DESC)
- `idx_ventas_ubicacion_fecha` (ubicacion_id, fecha_venta DESC)
- `idx_ventas_costo` (costo_unitario)

---

### **Fase 2: Migración Endpoints** (4-6 hrs)

**Archivos a modificar:**
- `backend/main.py` (líneas ~987-2100)

**Endpoints a migrar:**
1. ✅ GET `/api/productos/matriz-abc-xyz` - Matriz 3×3 (PRIORIDAD ALTA)
2. ✅ GET `/api/productos/lista-por-matriz` - Filtrar por matriz (PRIORIDAD ALTA)
3. ✅ GET `/api/productos/{codigo}/detalle-completo` - Detalle producto (PRIORIDAD ALTA)
4. ✅ GET `/api/productos/{codigo}/ventas-semanales` - Gráfico ventas (PRIORIDAD ALTA)
5. ✅ GET `/api/productos/{codigo}/ventas-por-tienda` - Por ubicación (PRIORIDAD MEDIA)
6. ⚠️ GET `/api/productos/{codigo}/historico-clasificacion` - Stub MVP (sin histórico)
7. ✅ GET `/api/productos/{codigo}/historico-inventario` - Usar `inventario_historico`
8. ✅ GET `/api/productos/{codigo}/reconciliacion-inventario` - Correlacionar inv+ventas
9. ❌ GET `/api/productos/{codigo}/historico-abc-xyz` - Deprecar (duplicado)

**Helpers a crear:**
- `calcular_abc_xyz_producto()` - Calcula ABC-XYZ para producto específico
- `calculate_metricas()` - Calcula métricas agregadas
- `format_matriz_response()` - Formatea respuesta para frontend

---

### **Fase 3: Testing** (1-2 hrs)

**Testing manual:**
```bash
# 1. Backend
cd backend && python3 start.py

# 2. Frontend
cd frontend && npm run dev

# 3. Navegar
open http://localhost:3001/productos
```

**Checklist:**
- [ ] Matriz ABC-XYZ carga (9 celdas)
- [ ] Filtro por tienda funciona
- [ ] Click celda → productos
- [ ] Click producto → modal detalle
- [ ] Gráfico ventas renderiza
- [ ] Performance < 3s

**Testing performance:**
```sql
EXPLAIN ANALYZE
-- Query completo ABC-XYZ
WITH ventas_6m AS (...)
SELECT * FROM ventas_6m LIMIT 100;

-- Target: < 3000ms
```

---

## 🗑️ Limpieza de Archivos Legacy

### Archivos a Mover (17 total)

**Scripts Python (5):**
- calcular_abc_v2.py
- calcular_xyz.py
- calcular_abc_v2_por_tienda.py
- calcular_xyz_por_tienda.py
- calcular_abc_v2_adaptado.py

**Schemas SQL (2):**
- schema_abc_v2.sql
- schema_abc_xyz.sql

**Queries SQL (4):**
- queries_analisis_abc_v2.sql
- dashboard_abc_v2.sql
- calculo_abc_v2.sql
- calculo_indice_gini.sql

**Migraciones (2):**
- migrate_abc_v2_schema.sql
- apply_abc_xyz_migration.sh

**Consultas Python (3):**
- consultar_abc_v2.py
- consultar_xyz.py
- verificar_resultados_tienda.py

**Documentación (3):**
- README_ABC_V2.md
- README_ABC_V2_FINAL.md
- README_NIVEL_OBJETIVO.md

**Otros (1):**
- init_conjuntos_sustituibles.py

### Ejecutar Movimiento

**Opción 1: Script automático**
```bash
# Extraer y ejecutar script desde ARCHIVOS_A_MOVER_LEGACY.md
bash move_legacy_abc_files.sh
```

**Opción 2: Manual**
```bash
# Seguir lista en ARCHIVOS_A_MOVER_LEGACY.md
mv database/calcular_abc_v2.py archive/duckdb-legacy/abc-xyz-calculations/
# ... etc
```

---

## 📊 Resultado Final Esperado

**Al completar el plan:**

✅ Sección `/productos` **100% funcional** en PostgreSQL v2.0
✅ Cálculo ABC-XYZ **en tiempo real** (fresh data)
✅ Frontend **sin cambios** (ya funciona)
✅ Performance **< 3 segundos** (aceptable MVP)
✅ Código **3x más simple** (vs tablas)
✅ Desarrollo **6-8 hrs** (vs 20-30 hrs)

**Limitaciones aceptables:**
- ⚠️ Sin histórico evolución ABC (v2 feature)
- ⚠️ Queries 2-3s (optimizable después)

---

## 🔄 Plan de Optimización Futura (Post-MVP)

**Si sección muy usada (>100 consultas/día):**

### Opción 1: Vista Materializada (Recomendado)
```sql
CREATE MATERIALIZED VIEW mv_productos_abc_xyz AS
-- Query completo ABC-XYZ
WITH REFRESH ON SCHEDULE DAILY AT 03:00;
```
- Performance: < 500ms
- Complejidad: Baja
- Desarrollo: 2-4 hrs

### Opción 2: Tabla Pre-calculada
- Solo si necesitas histórico de alertas
- Solo si necesitas análisis temporal
- Usar plan original deprecado como referencia

---

## 🎬 Próximos Pasos

**Orden recomendado:**

1. **Revisar plan MVP** → [PLAN_MIGRACION_PRODUCTOS_MVP.md](PLAN_MIGRACION_PRODUCTOS_MVP.md)
2. **Mover archivos legacy** → Ejecutar script de [ARCHIVOS_A_MOVER_LEGACY.md](ARCHIVOS_A_MOVER_LEGACY.md)
3. **Commit limpieza** → Git commit archivos movidos
4. **Fase 1: Índices** → Verificar índices PostgreSQL
5. **Fase 2: Endpoints** → Migrar 9 endpoints a PostgreSQL
6. **Fase 3: Testing** → Validar end-to-end

---

## 📞 Preguntas Frecuentes

### ¿Por qué no tablas pre-calculadas?
**R:** Para MVP, desarrollo rápido > queries rápidas. Validamos valor primero.

### ¿Y si performance es mala?
**R:** Agregar vista materializada (4 hrs desarrollo, < 500ms queries).

### ¿Se pierde el histórico ABC?
**R:** En MVP sí. Si es importante, se implementa en v2 con tabla.

### ¿Frontend requiere cambios?
**R:** NO. Frontend ya funciona, solo esperamos endpoints.

### ¿Cuánto tarda implementar?
**R:** 6-8 horas (vs 20-30 hrs con tablas).

---

**¿Listo para comenzar?** 🚀

Siguiente paso: **Fase 1 - Verificar índices** (30 min)
