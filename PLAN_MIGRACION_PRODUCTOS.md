# ⚠️ DEPRECADO - Plan de Migración con Tablas Pre-calculadas

**Fecha:** 2025-01-27
**Estado:** ❌ DEPRECADO - Usar [PLAN_MIGRACION_PRODUCTOS_MVP.md](PLAN_MIGRACION_PRODUCTOS_MVP.md)
**Razón:** Approach muy complejo para MVP. Preferimos cálculo on-demand (6-8 hrs vs 20-30 hrs)

---

# Plan de Migración: Sección Productos (ABC-XYZ) a PostgreSQL v2.0 [DEPRECADO]

**⚠️ ESTE PLAN YA NO SE USARÁ**

Decidimos NO crear tablas `productos_abc_v2` pre-calculadas para MVP.
En su lugar, calculamos ABC-XYZ on-demand cuando el usuario lo solicita.

Ver plan actualizado: [PLAN_MIGRACION_PRODUCTOS_MVP.md](PLAN_MIGRACION_PRODUCTOS_MVP.md)

---

## Plan Original (Archivado para referencia)

**Fecha:** 2025-01-27
**Objetivo:** Rescatar y migrar la sección de Productos (ABC-XYZ) que quedó sin funcionalidad tras la migración a PostgreSQL v2.0

---

## 📊 Estado Actual

### ✅ Frontend - COMPLETO (No requiere cambios)

La sección de productos en el frontend está **totalmente implementada y funcional**:

**Componentes principales:**
- [ABCXYZAnalysis.tsx](frontend/src/components/productos/ABCXYZAnalysis.tsx) - Vista principal con matriz ABC-XYZ
- [ProductosLayout.tsx](frontend/src/components/productos/ProductosLayout.tsx) - Layout con navegación
- [ProductoDetalleModal.tsx](frontend/src/components/productos/ProductoDetalleModal.tsx) - Modal detallado con insights, gráficos y métricas
- [MatrizABCXYZ.tsx](frontend/src/components/productos/MatrizABCXYZ.tsx) - Matriz visual 3×3
- [HistoricoClasificacionModal.tsx](frontend/src/components/productos/HistoricoClasificacionModal.tsx) - Histórico de clasificación

**Servicio API:**
- [productosService.ts](frontend/src/services/productosService.ts) - Cliente API completo con todos los endpoints

**Rutas configuradas:**
- `/productos` → ABCXYZAnalysis (única pestaña disponible)

### ⚠️ Backend - MIGRADO A DUCKDB (Requiere migración)

**Endpoints actuales (en DuckDB):**
```
GET  /api/productos                              # Lista básica de productos
GET  /api/productos/matriz-abc-xyz               # Matriz 3×3 ABC-XYZ
GET  /api/productos/lista-por-matriz             # Productos por matriz
GET  /api/productos/{codigo}/detalle-completo    # Detalle completo del producto
GET  /api/productos/{codigo}/ventas-semanales    # Ventas por semana (52 semanas)
GET  /api/productos/{codigo}/ventas-por-tienda   # Ventas por tienda
GET  /api/productos/{codigo}/historico-clasificacion        # Histórico ABC-XYZ
GET  /api/productos/{codigo}/historico-inventario           # Histórico de inventario
GET  /api/productos/{codigo}/reconciliacion-inventario      # Reconciliación inventario vs ventas
GET  /api/productos/{codigo}/historico-abc-xyz   # Histórico clasificación (legacy)
```

**Tablas DuckDB utilizadas:**
- `productos_abc_v2` - Clasificación ABC + XYZ por producto/tienda/periodo
- `productos_abc_v2_historico` - Histórico de clasificaciones
- `productos` - Catálogo maestro
- `ubicaciones` - Tiendas
- `ventas` - Transacciones
- `inventario_actual` - Stock actual

### 🔴 PostgreSQL v2.0 - INCOMPLETO

**Tablas disponibles:**
- ✅ `productos` - Catálogo maestro (migrado)
- ✅ `ubicaciones` - Tiendas (migrado)
- ✅ `ventas` - Transacciones (migrado)
- ✅ `inventario_actual` - Stock actual (migrado)
- ✅ `inventario_historico` - Time series de inventario (migrado)
- ❌ `productos_abc_v2` - **NO MIGRADO**
- ❌ `productos_abc_v2_historico` - **NO MIGRADO**

**Estado:**
- Las tablas core existen en PostgreSQL v2.0
- Falta migrar las tablas de clasificación ABC-XYZ
- Falta migrar los scripts de cálculo ABC-XYZ

---

## 🎯 Plan de Desarrollo

### Fase 1: Migración de Schema ABC-XYZ a PostgreSQL v2.0

**Objetivo:** Crear las tablas `productos_abc_v2` y `productos_abc_v2_historico` en PostgreSQL

**Tareas:**

1. **Crear schema PostgreSQL para ABC-XYZ**
   - Archivo: `database/postgresql_schema_abc_v2.sql`
   - Basado en: `database/schema_abc_v2.sql` + `database/schema_abc_xyz.sql`
   - Ajustes necesarios:
     - ✅ Cambiar tipos de datos DuckDB → PostgreSQL
     - ✅ Adaptar sintaxis de índices
     - ✅ Adaptar vistas (DuckDB → PostgreSQL)
     - ✅ Foreign keys a tabla `productos(id)`

2. **Tablas a crear:**
   ```sql
   CREATE TABLE productos_abc_v2 (
       id VARCHAR(100) PRIMARY KEY,
       codigo_producto VARCHAR(50) NOT NULL,
       ubicacion_id VARCHAR(50) NOT NULL,

       -- Periodo
       periodo_analisis VARCHAR(20) NOT NULL,
       fecha_inicio DATE NOT NULL,
       fecha_fin DATE NOT NULL,
       fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

       -- Métricas ABC
       valor_consumo_total NUMERIC(18,2) NOT NULL,
       clasificacion_abc_valor VARCHAR(20) NOT NULL,
       porcentaje_valor NUMERIC(8,4) NOT NULL,
       porcentaje_acumulado NUMERIC(8,4) NOT NULL,
       ranking_valor INTEGER NOT NULL,

       -- Métricas XYZ
       clasificacion_xyz VARCHAR(1),
       coeficiente_variacion NUMERIC(8,4),
       demanda_promedio_semanal NUMERIC(12,4),
       desviacion_estandar_semanal NUMERIC(12,4),
       semanas_con_venta INTEGER,
       semanas_analizadas INTEGER,
       matriz_abc_xyz VARCHAR(2),
       confiabilidad_calculo VARCHAR(10),

       -- Foreign keys
       FOREIGN KEY (codigo_producto) REFERENCES productos(id),
       FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id)
   );

   CREATE TABLE productos_abc_v2_historico (
       id VARCHAR(100) PRIMARY KEY,
       codigo_producto VARCHAR(50) NOT NULL,
       ubicacion_id VARCHAR(50) NOT NULL,
       periodo_analisis VARCHAR(20) NOT NULL,
       fecha_inicio DATE NOT NULL,
       fecha_fin DATE NOT NULL,
       fecha_calculo TIMESTAMP NOT NULL,
       clasificacion_abc_valor VARCHAR(20) NOT NULL,
       valor_consumo_total NUMERIC(18,2) NOT NULL,
       ranking_valor INTEGER NOT NULL,
       porcentaje_valor NUMERIC(8,4) NOT NULL,
       porcentaje_acumulado NUMERIC(8,4) NOT NULL
   );
   ```

3. **Índices para performance:**
   ```sql
   CREATE INDEX idx_abc_v2_producto_ubicacion ON productos_abc_v2(codigo_producto, ubicacion_id);
   CREATE INDEX idx_abc_v2_clasificacion ON productos_abc_v2(clasificacion_abc_valor, clasificacion_xyz);
   CREATE INDEX idx_abc_v2_matriz ON productos_abc_v2(matriz_abc_xyz);
   CREATE INDEX idx_abc_v2_ranking ON productos_abc_v2(ranking_valor);
   ```

**Archivos a crear:**
- `database/postgresql_schema_abc_v2.sql`
- `database/migrations/010_create_abc_v2_tables_UP.sql`

---

### Fase 2: Migración de Scripts de Cálculo ABC-XYZ

**Objetivo:** Adaptar scripts de cálculo para PostgreSQL v2.0

**Scripts existentes (DuckDB):**
- `database/calcular_abc_v2.py` - Cálculo ABC
- `database/calcular_xyz.py` - Cálculo XYZ
- `database/calcular_abc_v2_por_tienda.py` - ABC por tienda
- `database/calcular_xyz_por_tienda.py` - XYZ por tienda

**Tareas:**

1. **Crear script unificado de cálculo ABC-XYZ para PostgreSQL**
   - Archivo: `etl/core/calcular_abc_xyz_postgresql.py`
   - Funcionalidad:
     - ✅ Conectar a PostgreSQL (usar variables de entorno)
     - ✅ Leer ventas de últimos 6 meses
     - ✅ Calcular valor de consumo (cantidad × costo)
     - ✅ Clasificar ABC (80% = A, 15% = B, 5% = C)
     - ✅ Calcular CV semanal para XYZ (X < 0.5, Y < 1.0, Z ≥ 1.0)
     - ✅ Combinar matriz (AX, AY, AZ, BX, BY, BZ, CX, CY, CZ)
     - ✅ Insertar en `productos_abc_v2`
     - ✅ Archivar clasificación anterior en `productos_abc_v2_historico`

2. **Scheduler para cálculo automático**
   - Frecuencia: Semanal (lunes 3am)
   - Integrar con ETL existente
   - Notificaciones de cambios significativos

**Archivos a crear:**
- `etl/core/calcular_abc_xyz_postgresql.py`
- `etl/core/config_abc_xyz.py` (configuración)

---

### Fase 3: Migración de Endpoints Backend a PostgreSQL v2.0

**Objetivo:** Adaptar los 11 endpoints de productos para usar PostgreSQL

**Tareas:**

1. **Actualizar queries en `backend/main.py`:**

   **Cambios necesarios:**
   - ❌ Reemplazar sintaxis DuckDB → PostgreSQL
   - ❌ Cambiar `%s` placeholders por `$1, $2, ...` (psycopg2)
   - ❌ Adaptar funciones de fecha (`DATE_TRUNC`, `DATE_PART`)
   - ❌ Adaptar agregaciones y window functions
   - ❌ Actualizar `execute_query_dict()` para PostgreSQL

2. **Endpoints a migrar:**

   | Endpoint | Estado | Prioridad | Complejidad |
   |----------|--------|-----------|-------------|
   | `/api/productos/matriz-abc-xyz` | ⚠️ Migrar | 🔴 ALTA | Media |
   | `/api/productos/lista-por-matriz` | ⚠️ Migrar | 🔴 ALTA | Media |
   | `/api/productos/{codigo}/detalle-completo` | ⚠️ Migrar | 🔴 ALTA | Alta |
   | `/api/productos/{codigo}/ventas-semanales` | ⚠️ Migrar | 🔴 ALTA | Media |
   | `/api/productos/{codigo}/ventas-por-tienda` | ⚠️ Migrar | 🟡 MEDIA | Baja |
   | `/api/productos/{codigo}/historico-clasificacion` | ⚠️ Migrar | 🟡 MEDIA | Media |
   | `/api/productos/{codigo}/historico-inventario` | ⚠️ Migrar | 🟢 BAJA | Media |
   | `/api/productos/{codigo}/reconciliacion-inventario` | ⚠️ Migrar | 🟢 BAJA | Alta |
   | `/api/productos` | ✅ Migrado | - | - |
   | `/api/categorias` | ✅ Migrado | - | - |

3. **Testing:**
   - ✅ Verificar cada endpoint con datos reales
   - ✅ Comparar resultados DuckDB vs PostgreSQL
   - ✅ Verificar performance (índices correctos)

**Archivos a modificar:**
- `backend/main.py` (líneas 987-2100 aprox)

---

### Fase 4: Poblar Datos Iniciales (One-time Migration)

**Objetivo:** Migrar clasificaciones ABC-XYZ existentes de DuckDB a PostgreSQL

**Tareas:**

1. **Crear script de migración one-time**
   - Archivo: `archive/migration-scripts/migrate_abc_v2_to_postgresql.py`
   - Funcionalidad:
     - ✅ Leer `productos_abc_v2` de DuckDB
     - ✅ Transformar formato si necesario
     - ✅ Insertar en PostgreSQL
     - ✅ Validar counts y totales

2. **Validación post-migración:**
   ```sql
   -- Verificar counts
   SELECT clasificacion_abc_valor, clasificacion_xyz, COUNT(*)
   FROM productos_abc_v2
   GROUP BY clasificacion_abc_valor, clasificacion_xyz;

   -- Verificar valores
   SELECT SUM(valor_consumo_total) FROM productos_abc_v2;
   ```

**Archivos a crear:**
- `archive/migration-scripts/migrate_abc_v2_to_postgresql.py`

---

### Fase 5: Integración y Testing End-to-End

**Objetivo:** Verificar que frontend → backend → PostgreSQL funcione correctamente

**Tareas:**

1. **Testing manual:**
   - ✅ Navegar a `/productos`
   - ✅ Verificar matriz ABC-XYZ se carga correctamente
   - ✅ Filtrar por ubicación (tienda)
   - ✅ Click en celda de matriz → ver productos
   - ✅ Click en producto → modal con detalle completo
   - ✅ Verificar gráficos de ventas semanales
   - ✅ Verificar histórico de clasificación
   - ✅ Verificar tabla por tienda

2. **Testing de performance:**
   - ✅ Matriz ABC-XYZ < 1s
   - ✅ Lista de productos < 2s
   - ✅ Detalle de producto < 1.5s
   - ✅ Gráficos < 1s

3. **Testing con datos reales:**
   - ✅ Verificar con tienda real (tienda_01, tienda_15, etc)
   - ✅ Verificar con productos ABC (A, B, C)
   - ✅ Verificar con productos XYZ (X, Y, Z)

**Checklist de validación:**
- [ ] Matriz ABC-XYZ muestra 9 celdas con datos correctos
- [ ] Filtro por tienda funciona
- [ ] Vista global (todas las tiendas) funciona
- [ ] Modal de detalle muestra insights correctos
- [ ] Gráfico de ventas semanales renderiza correctamente
- [ ] Histórico de clasificación muestra evolución
- [ ] Tabla por tienda muestra stock e insights
- [ ] Performance es aceptable

---

## 📋 Resumen de Archivos a Crear/Modificar

### Archivos NUEVOS a crear:

1. **Database schemas:**
   - `database/postgresql_schema_abc_v2.sql`
   - `database/migrations/010_create_abc_v2_tables_UP.sql`

2. **ETL scripts:**
   - `etl/core/calcular_abc_xyz_postgresql.py`
   - `etl/core/config_abc_xyz.py`

3. **Migration scripts:**
   - `archive/migration-scripts/migrate_abc_v2_to_postgresql.py`

### Archivos EXISTENTES a modificar:

1. **Backend:**
   - `backend/main.py` (endpoints líneas 987-2100)

2. **Frontend:**
   - ✅ NINGUNO - Frontend está completo

---

## 🚀 Orden de Ejecución Recomendado

```
1. Fase 1: Schema → Crear tablas en PostgreSQL
   └─ Ejecutar: database/postgresql_schema_abc_v2.sql
   └─ Ejecutar: database/migrations/010_create_abc_v2_tables_UP.sql

2. Fase 2: ETL → Crear script de cálculo
   └─ Crear: etl/core/calcular_abc_xyz_postgresql.py
   └─ Probar: python3 etl/core/calcular_abc_xyz_postgresql.py

3. Fase 4: Data → Migrar datos existentes (one-time)
   └─ Ejecutar: archive/migration-scripts/migrate_abc_v2_to_postgresql.py

4. Fase 3: Backend → Migrar endpoints
   └─ Modificar: backend/main.py (11 endpoints)
   └─ Probar: curl http://localhost:8001/api/productos/matriz-abc-xyz

5. Fase 5: Testing → Validación end-to-end
   └─ Probar: http://localhost:3001/productos
   └─ Verificar: Todas las funcionalidades
```

---

## ⚠️ Consideraciones Importantes

1. **Foreign Keys:**
   - `productos_abc_v2.codigo_producto` → `productos.id`
   - Verificar que todos los productos en ABC existan en tabla productos

2. **Performance:**
   - Los índices son CRÍTICOS para queries rápidas
   - La matriz ABC-XYZ hace 9+ queries en paralelo
   - Considerar materializar vistas si es necesario

3. **Cálculo ABC-XYZ:**
   - Requiere 6 meses de datos de ventas mínimo
   - CV (XYZ) se calcula con 12 semanas de datos
   - Si < 4 semanas con ventas → confiabilidad BAJA

4. **Datos faltantes:**
   - Productos nuevos (< 1 mes) → clasificación "NUEVO"
   - Productos sin ventas → clasificación "SIN_MOVIMIENTO"
   - Productos sin costo → clasificación "ERROR_COSTO"

5. **Compatibilidad:**
   - Frontend NO requiere cambios (ya funciona)
   - Backend requiere adaptar queries DuckDB → PostgreSQL
   - ETL requiere script nuevo para PostgreSQL

---

## 🎯 Resultado Final Esperado

Al completar este plan:

✅ Sección `/productos` **100% funcional** en PostgreSQL v2.0
✅ Matriz ABC-XYZ actualizada semanalmente
✅ Detalle completo de productos con insights AI
✅ Histórico de clasificación funcional
✅ Performance óptima (< 2s por query)
✅ Frontend sin cambios (ya está completo)

---

**Siguiente paso:** Comenzar con Fase 1 - Migración de Schema ABC-XYZ
