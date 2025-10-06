# Plan de Parametrización de Productos por Tienda

## 📊 Situación Actual

### Datos Disponibles
```
📦 PRODUCTOS ACTIVOS:
   • productos (tabla): 15 registros ❌ (muy pequeño)
   • inventario_raw: 4,159 productos únicos ✅
   • ventas_raw: 3,237 productos con ventas ✅

🏪 UBICACIONES:
   • 18 ubicaciones (15 tiendas + 3 CEDIs)

📈 DATOS HISTÓRICOS:
   • 83M registros de ventas
   • Período: 2024-09 a 2025-10 (13 meses)
```

### Problema a Resolver

**Necesitas parametrizar por TIENDA:**
1. ✅ Stock Mínimo
2. ✅ Punto de Reorden
3. ✅ Stock de Seguridad
4. ✅ Stock Máximo
5. ✅ Clasificación ABC (según ventas de ESA tienda)
6. ✅ Clasificación XYZ (según variabilidad en ESA tienda)

**¿Por qué diferente por tienda?**
- El producto `003119` (Queso Blanco) puede ser clase A en "BOSQUE" pero clase B en "GUIGUE"
- La variabilidad de demanda cambia por tienda
- Los tiempos de reposición (lead time) pueden variar

---

## 🎯 Arquitectura Propuesta

### Modelo de 3 Capas

```
┌─────────────────────────────────────────────────────────┐
│         CAPA 1: CATÁLOGO MAESTRO                        │
│  (Información genérica del producto - NO varía)         │
└─────────────────────────────────────────────────────────┘
                            │
                            │ Un producto, muchas tiendas
                            ▼
┌─────────────────────────────────────────────────────────┐
│    CAPA 2: PARÁMETROS POR TIENDA                        │
│  (Configuración específica producto × tienda)           │
└─────────────────────────────────────────────────────────┘
                            │
                            │ Cálculos en tiempo real
                            ▼
┌─────────────────────────────────────────────────────────┐
│    CAPA 3: DATOS OPERATIVOS (RAW)                       │
│  (Inventario actual, ventas históricas)                 │
└─────────────────────────────────────────────────────────┘
```

---

## 📐 Diseño de Tablas

### 1. PRODUCTOS_MAESTRO (Catálogo Completo)

**Objetivo:** Un registro por cada producto único en el sistema

```sql
CREATE TABLE productos_maestro (
    codigo VARCHAR PRIMARY KEY,              -- Ej: "004962"
    codigo_barras VARCHAR,
    descripcion VARCHAR(200),
    descripcion_corta VARCHAR(50),

    -- Clasificación
    categoria VARCHAR(50),
    subcategoria VARCHAR(50),
    grupo VARCHAR(50),
    subgrupo VARCHAR(50),

    -- Características
    marca VARCHAR(100),
    presentacion VARCHAR(50),
    peso_unidad DECIMAL(10,4),
    volumen_unidad DECIMAL(10,4),
    cantidad_bultos DECIMAL(10,4),

    -- Costos/Precios (globales)
    costo_promedio DECIMAL(12,4),
    precio_sugerido DECIMAL(12,4),

    -- Características operativas
    es_perecedero BOOLEAN,
    dias_vencimiento INTEGER,
    requiere_refrigeracion BOOLEAN,

    -- Clasificación GLOBAL (promedio de todas las tiendas)
    abc_global VARCHAR(1),                    -- A, B, C (basado en ventas totales)
    xyz_global VARCHAR(1),                    -- X, Y, Z (basado en variabilidad promedio)

    -- Metadatos
    activo BOOLEAN DEFAULT true,
    fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Población:** Consolidar desde `inventario_raw` y `ventas_raw`

---

### 2. PARAMETROS_CLASIFICACION (Reglas de Negocio)

**Objetivo:** Define las fórmulas según clasificación ABC-XYZ

```sql
CREATE TABLE parametros_clasificacion (
    id VARCHAR PRIMARY KEY,
    abc_class VARCHAR(1),                     -- A, B, C
    xyz_class VARCHAR(1),                     -- X, Y, Z

    -- Fórmulas de stock
    factor_seguridad DECIMAL(4,2),            -- Multiplicador para stock de seguridad
    dias_cobertura_objetivo INTEGER,          -- Días de cobertura deseados
    dias_cobertura_minimo INTEGER,            -- Días mínimos
    dias_cobertura_maximo INTEGER,            -- Días máximos

    -- Frecuencia de revisión
    frecuencia_revision_dias INTEGER,         -- Cada cuántos días revisar

    -- Nivel de servicio
    nivel_servicio_objetivo DECIMAL(5,2),     -- % de disponibilidad deseado (ej: 95.0)

    -- Lotes de compra
    lote_minimo_sugerido INTEGER,
    multiple_pedido_sugerido INTEGER,

    -- Alertas
    generar_alerta_stock_bajo BOOLEAN,
    generar_alerta_sobrestock BOOLEAN,

    -- Descripción
    descripcion TEXT,

    activo BOOLEAN DEFAULT true
);
```

**Ejemplo de reglas:**

| ABC | XYZ | Factor Seg | Días Cobertura | Frecuencia Rev | Nivel Servicio |
|-----|-----|------------|----------------|----------------|----------------|
| A   | X   | 1.2        | 15 días        | Diario         | 98%            |
| A   | Y   | 1.5        | 18 días        | Diario         | 96%            |
| A   | Z   | 2.0        | 21 días        | Diario         | 95%            |
| B   | X   | 1.1        | 21 días        | Semanal        | 95%            |
| B   | Y   | 1.3        | 25 días        | Semanal        | 93%            |
| B   | Z   | 1.7        | 30 días        | Semanal        | 90%            |
| C   | X   | 1.0        | 30 días        | Quincenal      | 90%            |
| C   | Y   | 1.2        | 40 días        | Quincenal      | 85%            |
| C   | Z   | 1.5        | 60 días        | Mensual        | 80%            |

---

### 3. CLASIFICACION_ABC_TIENDA (ABC/XYZ Específico)

**Objetivo:** Cada producto tiene clasificación diferente por tienda

```sql
CREATE TABLE clasificacion_abc_tienda (
    id VARCHAR PRIMARY KEY,
    ubicacion_id VARCHAR NOT NULL,
    codigo_producto VARCHAR NOT NULL,

    -- Clasificación específica de esta tienda
    abc_tienda VARCHAR(1),                    -- A, B, C para ESTA tienda
    xyz_tienda VARCHAR(1),                    -- X, Y, Z para ESTA tienda

    -- Métricas que generaron la clasificación
    venta_mensual_promedio DECIMAL(18,2),
    porcentaje_ventas_tienda DECIMAL(5,2),   -- % del total de la tienda
    ranking_tienda INTEGER,                   -- Posición en ranking de la tienda

    coeficiente_variacion DECIMAL(8,2),      -- CV% de demanda
    desviacion_estandar DECIMAL(12,4),

    -- Período de análisis
    fecha_inicio_analisis DATE,
    fecha_fin_analisis DATE,
    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (codigo_producto) REFERENCES productos_maestro(codigo),
    UNIQUE(ubicacion_id, codigo_producto)
);
```

**Cálculo ABC:**
```
1. Ordenar productos de la tienda por ventas (desc)
2. Calcular % acumulado
3. Asignar:
   - A: productos hasta 80% de ventas acumuladas
   - B: productos hasta 95% de ventas acumuladas
   - C: resto (últimos 5%)
```

**Cálculo XYZ:**
```
Coeficiente de Variación = (Desviación Estándar / Promedio) × 100

- X: CV < 20%  (demanda predecible)
- Y: CV 20-50% (demanda variable)
- Z: CV > 50%  (demanda errática)
```

---

### 4. PRODUCTO_UBICACION_CONFIG (Parámetros Calculados)

**Ya existe, solo se va a poblar con los cálculos:**

```sql
-- Esta tabla YA EXISTE en tu BD
-- Solo vamos a LLENARLA con datos calculados

INSERT INTO producto_ubicacion_config (
    id, ubicacion_id, producto_id,

    -- Parámetros calculados
    stock_minimo,
    punto_reorden,
    stock_maximo,

    -- Demanda
    demanda_diaria_promedio,
    demanda_diaria_maxima,
    variabilidad_demanda,

    -- Tiempos
    lead_time_dias,
    dias_cobertura_objetivo,
    dias_seguridad,

    -- Clasificación
    -- (Se guardará en una nueva columna o en observaciones)

    activo
) VALUES (...);
```

---

## 🧮 Fórmulas de Cálculo

### Stock Mínimo
```
Stock_Mínimo = Demanda_Diaria_Promedio × Lead_Time × Factor_Seguridad
```

**Ejemplo:**
- Producto: 004962 (Queso Blanco)
- Tienda: BOSQUE
- Demanda diaria promedio: 50 unidades
- Lead time: 3 días
- Clasificación: AX (alto volumen, baja variabilidad)
- Factor seguridad: 1.2

```
Stock_Mínimo = 50 × 3 × 1.2 = 180 unidades
```

### Punto de Reorden
```
Punto_Reorden = Stock_Mínimo × 1.2
```

**Ejemplo:**
```
Punto_Reorden = 180 × 1.2 = 216 unidades
```

Cuando el stock llegue a 216, se genera orden de compra.

### Stock de Seguridad
```
Stock_Seguridad = Demanda_Diaria_Promedio × Días_Seguridad × (Variabilidad / 100)
```

**Ejemplo:**
- Días seguridad: 3
- Variabilidad (CV): 15%

```
Stock_Seguridad = 50 × 3 × 0.15 = 22.5 ≈ 23 unidades
```

### Stock Máximo
```
Stock_Máximo = (Demanda_Diaria_Promedio × Días_Cobertura) + Stock_Seguridad
```

**Ejemplo:**
- Días cobertura objetivo: 15 (AX)

```
Stock_Máximo = (50 × 15) + 23 = 773 unidades
```

---

## 🔄 Proceso de Implementación

### FASE 1: Construcción del Catálogo Maestro

```sql
-- Script: database/01_create_productos_maestro.sql

-- Consolidar productos únicos
INSERT INTO productos_maestro (codigo, descripcion, categoria, ...)
SELECT DISTINCT
    codigo_producto,
    descripcion_producto,
    categoria,
    ...
FROM inventario_raw
WHERE activo = true;

-- Enriquecer con datos de ventas
UPDATE productos_maestro pm
SET
    abc_global = (SELECT abc FROM calcular_abc_global WHERE codigo = pm.codigo),
    xyz_global = (SELECT xyz FROM calcular_xyz_global WHERE codigo = pm.codigo);
```

### FASE 2: Configurar Reglas de Negocio

```sql
-- Script: database/02_populate_parametros_clasificacion.sql

INSERT INTO parametros_clasificacion VALUES
('A-X', 'A', 'X', 1.2, 15, 10, 20, 1, 98.0, 1, 1, true, true, 'Alto volumen, baja variabilidad'),
('A-Y', 'A', 'Y', 1.5, 18, 12, 25, 1, 96.0, 1, 1, true, true, 'Alto volumen, variabilidad media'),
-- ... (9 combinaciones ABC × XYZ)
```

### FASE 3: Calcular ABC/XYZ por Tienda

```sql
-- Script: database/03_calculate_abc_xyz_tienda.sql

WITH ventas_tienda AS (
    SELECT
        ubicacion_id,
        codigo_producto,
        SUM(venta_total) as venta_total,
        AVG(cantidad_vendida) as promedio,
        STDDEV(cantidad_vendida) as desviacion
    FROM ventas_raw
    WHERE fecha >= DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY)
    GROUP BY ubicacion_id, codigo_producto
),
abc_ranking AS (
    SELECT *,
        SUM(venta_total) OVER (
            PARTITION BY ubicacion_id
            ORDER BY venta_total DESC
        ) / SUM(venta_total) OVER (PARTITION BY ubicacion_id) * 100 as pct_acumulado
    FROM ventas_tienda
)
INSERT INTO clasificacion_abc_tienda (...)
SELECT
    ubicacion_id,
    codigo_producto,
    CASE
        WHEN pct_acumulado <= 80 THEN 'A'
        WHEN pct_acumulado <= 95 THEN 'B'
        ELSE 'C'
    END as abc_tienda,
    CASE
        WHEN (desviacion / NULLIF(promedio, 0) * 100) < 20 THEN 'X'
        WHEN (desviacion / NULLIF(promedio, 0) * 100) < 50 THEN 'Y'
        ELSE 'Z'
    END as xyz_tienda,
    ...
FROM abc_ranking;
```

### FASE 4: Calcular Parámetros y Poblar Config

```sql
-- Script: database/04_populate_producto_ubicacion_config.sql

INSERT INTO producto_ubicacion_config (
    ubicacion_id, producto_id,
    stock_minimo, punto_reorden, stock_maximo,
    demanda_diaria_promedio, variabilidad_demanda,
    lead_time_dias, dias_cobertura_objetivo, dias_seguridad
)
SELECT
    cat.ubicacion_id,
    cat.codigo_producto,

    -- Stock mínimo = Demanda × Lead Time × Factor Seguridad
    ROUND(demanda.promedio_diario *
          COALESCE(u.dias_reposicion_promedio, 7) *
          par.factor_seguridad),

    -- Punto reorden = Stock mínimo × 1.2
    ROUND(demanda.promedio_diario *
          COALESCE(u.dias_reposicion_promedio, 7) *
          par.factor_seguridad * 1.2),

    -- Stock máximo = (Demanda × Días cobertura) + Stock seguridad
    ROUND((demanda.promedio_diario * par.dias_cobertura_objetivo) +
          (demanda.promedio_diario * 3 * cat.coeficiente_variacion / 100)),

    -- Demanda y variabilidad
    demanda.promedio_diario,
    cat.coeficiente_variacion,

    -- Tiempos
    COALESCE(u.dias_reposicion_promedio, 7),
    par.dias_cobertura_objetivo,
    3

FROM clasificacion_abc_tienda cat
JOIN parametros_clasificacion par
    ON cat.abc_tienda = par.abc_class
    AND cat.xyz_tienda = par.xyz_class
JOIN ubicaciones u
    ON cat.ubicacion_id = u.id
JOIN (
    SELECT
        ubicacion_id,
        codigo_producto,
        AVG(cantidad_vendida) as promedio_diario
    FROM ventas_raw
    WHERE fecha >= DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY)
    GROUP BY ubicacion_id, codigo_producto
) demanda
    ON cat.ubicacion_id = demanda.ubicacion_id
    AND cat.codigo_producto = demanda.codigo_producto
WHERE par.activo = true;
```

---

## 📊 Resultado Esperado

### Números Finales

```
📦 PRODUCTOS_MAESTRO:          4,159 productos
🏪 CLASIFICACION_ABC_TIENDA:  ~75,000 registros (4,159 × 18)
⚙️  PRODUCTO_UBICACION_CONFIG: ~75,000 registros (llenos)
📋 PARAMETROS_CLASIFICACION:        9 reglas (3×3 matriz)
```

### Ejemplo Real de Parametrización

**Producto: 003119 (Queso Blanco Llanero KG)**

| Tienda | ABC | XYZ | Demanda/Día | Stock Mín | Reorden | Stock Máx | Lead Time |
|--------|-----|-----|-------------|-----------|---------|-----------|-----------|
| BOSQUE | A   | X   | 50.0        | 180       | 216     | 773       | 3 días    |
| CENTRO | A   | Y   | 45.0        | 203       | 243     | 858       | 3 días    |
| GUIGUE | B   | X   | 12.0        | 40        | 48      | 292       | 3 días    |

**¿Por qué diferentes?**
- BOSQUE: Vende más (A) y de forma estable (X) → Stock alto, revisión diaria
- CENTRO: Vende mucho (A) pero irregular (Y) → Más stock de seguridad
- GUIGUE: Vende menos (B) pero estable (X) → Menos stock, revisión semanal

---

## 🔄 Mantenimiento

### Script de Recálculo (Mensual)

```python
# etl/scripts/recalcular_parametros_tienda.py

def recalcular_parametros():
    """
    Recalcula ABC, XYZ y parámetros de stock
    Se ejecuta el primer día de cada mes
    """

    # 1. Recalcular clasificación ABC/XYZ con últimos 90 días
    ejecutar_sql('03_calculate_abc_xyz_tienda.sql')

    # 2. Actualizar parámetros en producto_ubicacion_config
    ejecutar_sql('04_populate_producto_ubicacion_config.sql')

    # 3. Generar reporte de cambios
    generar_reporte_cambios()
```

### Auditoría de Cambios

```sql
-- Crear tabla de historial
CREATE TABLE historial_parametros (
    id SERIAL PRIMARY KEY,
    ubicacion_id VARCHAR,
    codigo_producto VARCHAR,
    campo_modificado VARCHAR,
    valor_anterior VARCHAR,
    valor_nuevo VARCHAR,
    motivo VARCHAR,
    usuario VARCHAR,
    fecha_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## ✅ Checklist de Implementación

### Fase 1: Setup (1 hora)
- [ ] Crear tabla `productos_maestro`
- [ ] Crear tabla `parametros_clasificacion`
- [ ] Crear tabla `clasificacion_abc_tienda`
- [ ] Crear tabla `historial_parametros`

### Fase 2: Carga Inicial (2 horas)
- [ ] Consolidar productos_maestro desde inventario_raw
- [ ] Cargar 9 reglas en parametros_clasificacion
- [ ] Calcular ABC/XYZ por tienda
- [ ] Poblar producto_ubicacion_config

### Fase 3: Validación (1 hora)
- [ ] Verificar ~75K registros en producto_ubicacion_config
- [ ] Revisar 10 productos muestra manualmente
- [ ] Validar fórmulas con equipo de negocio

### Fase 4: Automatización (2 horas)
- [ ] Script Python de recálculo mensual
- [ ] Documentación completa
- [ ] Agregar a crontab

---

## 🎯 Próximos Pasos

1. **Revisar este plan contigo** ✅ (estamos aquí)
2. **Ajustar fórmulas** si es necesario
3. **Implementar scripts SQL**
4. **Ejecutar carga inicial**
5. **Validar resultados**
6. **Poner en producción**

---

## ❓ Preguntas para Ti

1. **¿Las fórmulas te parecen correctas?**
   - Stock_Mínimo = Demanda × Lead_Time × Factor_Seguridad
   - ¿O prefieres otra fórmula?

2. **¿La clasificación ABC (80-15-5) está bien?**
   - O prefieres 70-20-10?

3. **¿Los parámetros por clasificación son correctos?**
   - ¿AX necesita 15 días de cobertura?
   - ¿CZ con 60 días está bien?

4. **¿Lead time es igual para todas las tiendas?**
   - O cada tienda tiene diferente tiempo de reposición?

5. **¿Quieres mantener clasificación global (ABC_global)?**
   - O solo te interesa por tienda?

---

**¿Procedemos con la implementación o ajustamos algo primero?**
