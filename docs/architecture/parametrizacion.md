# Arquitectura de Parametrización de Productos por Tienda

## 🎯 Objetivo

Crear un sistema donde cada producto tenga parámetros de inventario **específicos por tienda**, calculados automáticamente basándose en:
1. **Ventas históricas** de esa tienda
2. **Clasificación por rotación** (A, AB, B, BC, C)
3. **Variabilidad de demanda**

---

## 🏗️ Arquitectura del Modelo de Datos

### Vista General

```
┌─────────────────────────────────────────────────────────────────┐
│                    MODELO DE 3 CAPAS                            │
└─────────────────────────────────────────────────────────────────┘

CAPA 1: CATÁLOGO MAESTRO (Producto genérico)
   ↓
CAPA 2: PARAMETRIZACIÓN POR TIENDA (Producto × Tienda)
   ↓
CAPA 3: DATOS OPERATIVOS (Inventario actual, Ventas)
```

---

## 📊 CAPA 1: CATÁLOGO MAESTRO

### Tabla: `productos_maestro`

**Propósito:** Un único registro por cada producto del sistema

```sql
CREATE TABLE productos_maestro (
    -- Identificación
    codigo VARCHAR PRIMARY KEY,              -- "004962"
    codigo_barras VARCHAR,

    -- Descripción
    descripcion VARCHAR(200),
    descripcion_corta VARCHAR(50),

    -- Clasificación jerárquica
    categoria VARCHAR(50),                   -- "Alimentos"
    subcategoria VARCHAR(50),                -- "Lácteos"
    grupo VARCHAR(50),                       -- "Quesos"
    subgrupo VARCHAR(50),                    -- "Quesos Duros"

    -- Características físicas
    marca VARCHAR(100),
    presentacion VARCHAR(50),                -- "1 KG"
    peso_unidad DECIMAL(10,4),               -- en gramos
    volumen_unidad DECIMAL(10,4),            -- en ml
    cantidad_bultos DECIMAL(10,4),           -- 12 unidades por bulto
    unidad_medida VARCHAR(10),               -- 'UND', 'KG', 'L'

    -- ¿Cómo se vende?
    venta_por_bulto BOOLEAN,                 -- true = se vende en bultos
    venta_por_unidad BOOLEAN,                -- true = se vende suelto
    venta_por_peso BOOLEAN,                  -- true = se vende al peso (KG)

    -- Costos y precios (globales - mismos para todas las tiendas)
    costo_promedio DECIMAL(12,4),
    precio_sugerido DECIMAL(12,4),

    -- Características operativas
    es_perecedero BOOLEAN,
    dias_vencimiento INTEGER,
    requiere_refrigeracion BOOLEAN,

    -- Control
    activo BOOLEAN DEFAULT true,
    discontinuado BOOLEAN DEFAULT false,
    fecha_discontinuacion DATE,

    -- Metadatos
    fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Índices
    INDEX idx_categoria (categoria),
    INDEX idx_marca (marca),
    INDEX idx_activo (activo)
);
```

**Fuente de datos:** Consolidado de `inventario_raw`

**Cantidad esperada:** ~4,159 productos

---

## 📊 CAPA 2: PARAMETRIZACIÓN POR TIENDA

### Tabla 2.1: `clasificacion_producto_tienda`

**Propósito:** Clasificación A/AB/B/BC/C específica por tienda

```sql
CREATE TABLE clasificacion_producto_tienda (
    id VARCHAR PRIMARY KEY,
    ubicacion_id VARCHAR NOT NULL,
    codigo_producto VARCHAR NOT NULL,

    -- Métricas de venta (últimos 90 días)
    venta_diaria_promedio DECIMAL(12,4),    -- Promedio de ventas/día
    venta_diaria_bultos DECIMAL(12,4),      -- Ventas/día ÷ cantidad_bultos
    dias_con_venta INTEGER,                  -- Días que tuvo ventas en el período
    dias_sin_venta INTEGER,                  -- Días que NO tuvo ventas

    -- Clasificación por rotación (TUS FÓRMULAS)
    clasificacion VARCHAR(2),                -- 'A', 'AB', 'B', 'BC', 'C'

    -- Variabilidad de demanda
    coeficiente_variacion DECIMAL(8,2),     -- CV% = (σ/μ) × 100
    desviacion_estandar DECIMAL(12,4),
    demanda_minima DECIMAL(12,4),
    demanda_maxima DECIMAL(12,4),

    -- Clasificación XYZ (basada en CV)
    clasificacion_xyz VARCHAR(1),            -- 'X', 'Y', 'Z'

    -- Importancia para la tienda
    ranking_tienda INTEGER,                  -- Posición en ranking
    porcentaje_ventas_tienda DECIMAL(5,2),  -- % del total de ventas de la tienda

    -- Período de análisis
    fecha_inicio_analisis DATE,
    fecha_fin_analisis DATE,
    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (codigo_producto) REFERENCES productos_maestro(codigo),
    UNIQUE(ubicacion_id, codigo_producto),

    -- Índices
    INDEX idx_ubicacion (ubicacion_id),
    INDEX idx_clasificacion (clasificacion),
    INDEX idx_ubicacion_clasificacion (ubicacion_id, clasificacion)
);
```

**Lógica de clasificación (TUS FÓRMULAS):**

```sql
clasificacion = CASE
    WHEN venta_diaria_bultos >= 20                    THEN 'A'
    WHEN venta_diaria_bultos >= 5.0   AND < 20        THEN 'AB'
    WHEN venta_diaria_bultos >= 0.45  AND < 5.0       THEN 'B'
    WHEN venta_diaria_bultos >= 0.20  AND < 0.45      THEN 'BC'
    WHEN venta_diaria_bultos >= 0.001 AND < 0.20      THEN 'C'
    ELSE 'C'  -- Productos casi sin ventas
END
```

**Cantidad esperada:** ~75,000 registros (4,159 productos × 18 tiendas)

---

### Tabla 2.2: `parametros_clasificacion`

**Propósito:** Reglas de negocio por clasificación (tabla de configuración)

```sql
CREATE TABLE parametros_clasificacion (
    id VARCHAR PRIMARY KEY,
    clasificacion VARCHAR(2),                -- 'A', 'AB', 'B', 'BC', 'C'
    clasificacion_xyz VARCHAR(1),            -- 'X', 'Y', 'Z' (opcional)

    -- Fórmulas de stock
    factor_seguridad DECIMAL(4,2),           -- Multiplicador para stock seguridad
    dias_cobertura_min INTEGER,              -- Días mínimos de cobertura
    dias_cobertura_objetivo INTEGER,         -- Días objetivo
    dias_cobertura_max INTEGER,              -- Días máximos

    -- Frecuencia de revisión
    frecuencia_revision_dias INTEGER,        -- Cada cuántos días revisar stock

    -- Nivel de servicio
    nivel_servicio_objetivo DECIMAL(5,2),    -- % disponibilidad (95.0 = 95%)

    -- Lotes de pedido
    lote_minimo_sugerido INTEGER,
    multiple_pedido_sugerido INTEGER,

    -- Alertas
    generar_alerta_stock_bajo BOOLEAN,
    generar_alerta_sobrestock BOOLEAN,
    prioridad_reposicion INTEGER,            -- 1=urgente, 5=baja

    -- Descripción
    descripcion TEXT,

    activo BOOLEAN DEFAULT true,

    UNIQUE(clasificacion, clasificacion_xyz)
);
```

**Datos ejemplo:**

```sql
INSERT INTO parametros_clasificacion VALUES
-- Clase A: Productos de alta rotación (≥20 bultos/día)
('A-X', 'A', 'X', 1.2, 7, 10, 15, 1, 98.0, 1, 1, true, true, 1, 'Alta rotación, demanda estable'),
('A-Y', 'A', 'Y', 1.5, 7, 12, 18, 1, 98.0, 1, 1, true, true, 1, 'Alta rotación, demanda variable'),
('A-Z', 'A', 'Z', 2.0, 10, 15, 21, 1, 95.0, 1, 1, true, true, 2, 'Alta rotación, demanda errática'),

-- Clase AB: Rotación media-alta (5-20 bultos/día)
('AB-X', 'AB', 'X', 1.2, 10, 14, 21, 2, 95.0, 1, 1, true, true, 2, 'Rotación media-alta, estable'),
('AB-Y', 'AB', 'Y', 1.4, 10, 16, 25, 2, 95.0, 1, 1, true, true, 2, 'Rotación media-alta, variable'),
('AB-Z', 'AB', 'Z', 1.8, 14, 20, 30, 2, 93.0, 1, 1, true, true, 3, 'Rotación media-alta, errática'),

-- Clase B: Rotación media (0.45-5 bultos/día)
('B-X', 'B', 'X', 1.1, 14, 21, 30, 7, 93.0, 1, 1, true, true, 3, 'Rotación media, estable'),
('B-Y', 'B', 'Y', 1.3, 14, 25, 35, 7, 90.0, 1, 1, true, true, 3, 'Rotación media, variable'),
('B-Z', 'B', 'Z', 1.7, 21, 30, 45, 7, 88.0, 1, 1, true, false, 4, 'Rotación media, errática'),

-- Clase BC: Rotación baja-media (0.20-0.45 bultos/día)
('BC-X', 'BC', 'X', 1.0, 21, 30, 45, 14, 90.0, 1, 1, true, false, 4, 'Rotación baja-media, estable'),
('BC-Y', 'BC', 'Y', 1.2, 21, 35, 50, 14, 88.0, 1, 1, true, false, 4, 'Rotación baja-media, variable'),
('BC-Z', 'BC', 'Z', 1.5, 30, 45, 60, 14, 85.0, 1, 1, true, false, 5, 'Rotación baja-media, errática'),

-- Clase C: Rotación baja (<0.20 bultos/día)
('C-X', 'C', 'X', 1.0, 30, 45, 60, 30, 85.0, 1, 1, false, false, 5, 'Rotación baja, estable'),
('C-Y', 'C', 'Y', 1.2, 30, 50, 70, 30, 80.0, 1, 1, false, false, 5, 'Rotación baja, variable'),
('C-Z', 'C', 'Z', 1.5, 45, 60, 90, 30, 75.0, 1, 1, false, false, 5, 'Rotación baja, errática');
```

**Cantidad:** 15 registros (5 clases × 3 variabilidades)

---

### Tabla 2.3: `producto_ubicacion_config` (YA EXISTE)

**Propósito:** Parámetros calculados finales por producto × tienda

```sql
-- Esta tabla YA EXISTE en tu BD
-- Solo la vamos a LLENAR con datos calculados

-- Campos relevantes:
    ubicacion_id VARCHAR,
    producto_id VARCHAR,

    -- Parámetros calculados (resultado de las fórmulas)
    stock_minimo DECIMAL(12,4),
    punto_reorden DECIMAL(12,4),
    stock_maximo DECIMAL(12,4),

    -- Componentes del cálculo
    demanda_diaria_promedio DECIMAL(12,4),
    demanda_diaria_maxima DECIMAL(12,4),
    variabilidad_demanda DECIMAL(5,2),

    -- Tiempos y configuración
    lead_time_dias INTEGER,
    dias_cobertura_objetivo INTEGER,
    dias_seguridad INTEGER,

    -- Clasificación (nueva columna o usar observaciones)
    -- clasificacion VARCHAR(2),           -- Si agregas esta columna

    lote_minimo_compra DECIMAL(12,4),
    lote_multiple DECIMAL(12,4),

    precio_venta DECIMAL(12,4),
    margen_actual DECIMAL(5,2),

    es_producto_estrella BOOLEAN,
    generar_alerta_stock_bajo BOOLEAN,

    activo BOOLEAN
```

**Cálculo de parámetros:**

```sql
-- Stock Mínimo
stock_minimo = demanda_diaria_promedio × lead_time_dias × factor_seguridad

-- Punto de Reorden
punto_reorden = stock_minimo × 1.2

-- Stock de Seguridad
stock_seguridad = demanda_diaria_promedio × dias_seguridad × (coef_variacion / 100)

-- Stock Máximo
stock_maximo = (demanda_diaria_promedio × dias_cobertura_objetivo) + stock_seguridad
```

**Cantidad esperada:** ~75,000 registros

---

## 📊 CAPA 3: DATOS OPERATIVOS (RAW)

Estas tablas **YA EXISTEN** y son tu fuente de datos:

### `inventario_raw`
- Stock actual por tienda
- 46,981 registros

### `ventas_raw`
- Transacciones históricas
- 83M registros

### `stock_actual`
- Snapshot actual
- 20 registros

---

## 🔄 Flujo de Datos

```
┌──────────────────────────────────────────────────────┐
│ 1. CONSOLIDACIÓN                                     │
└──────────────────────────────────────────────────────┘
   inventario_raw + ventas_raw
          ↓
   productos_maestro (4,159 productos)


┌──────────────────────────────────────────────────────┐
│ 2. ANÁLISIS DE VENTAS                                │
└──────────────────────────────────────────────────────┘
   ventas_raw (últimos 90 días)
          ↓
   Por cada producto × tienda:
     • Calcular venta_diaria_promedio
     • Calcular venta_diaria_bultos
     • Calcular coeficiente_variacion
          ↓
   clasificacion_producto_tienda (~75K registros)
     • Clasificación: A, AB, B, BC, C
     • Clasificación XYZ: X, Y, Z


┌──────────────────────────────────────────────────────┐
│ 3. APLICACIÓN DE REGLAS                              │
└──────────────────────────────────────────────────────┘
   clasificacion_producto_tienda
          +
   parametros_clasificacion (reglas)
          ↓
   Calcular:
     • stock_minimo
     • punto_reorden
     • stock_maximo
          ↓
   producto_ubicacion_config (~75K registros)


┌──────────────────────────────────────────────────────┐
│ 4. USO OPERATIVO                                     │
└──────────────────────────────────────────────────────┘
   Dashboard / API
          ↓
   Consulta producto_ubicacion_config
          +
   inventario_raw (stock actual)
          ↓
   Muestra alertas:
     • Stock actual < punto_reorden → COMPRAR
     • Stock actual < stock_minimo → URGENTE
     • Stock actual > stock_maximo → SOBRESTOCK
```

---

## 📐 Fórmulas Específicas

### 1. Clasificación por Rotación (Tus Fórmulas)

```sql
-- Paso 1: Calcular venta diaria en bultos
venta_diaria_bultos = venta_diaria_promedio / cantidad_bultos

-- Paso 2: Asignar clasificación
clasificacion = CASE
    WHEN venta_diaria_bultos >= 20.0              THEN 'A'
    WHEN venta_diaria_bultos >= 5.0               THEN 'AB'
    WHEN venta_diaria_bultos >= 0.45              THEN 'B'
    WHEN venta_diaria_bultos >= 0.20              THEN 'BC'
    WHEN venta_diaria_bultos >= 0.001             THEN 'C'
    ELSE 'C'
END
```

**Ejemplo:**
```
Producto: Queso Blanco
Tienda: BOSQUE
venta_diaria_promedio = 240 unidades
cantidad_bultos = 12 unidades/bulto

venta_diaria_bultos = 240 / 12 = 20 bultos/día
clasificacion = 'A'
```

### 2. Clasificación XYZ (Variabilidad)

```sql
-- Coeficiente de Variación
CV = (desviacion_estandar / promedio) × 100

-- Clasificación
clasificacion_xyz = CASE
    WHEN CV < 20  THEN 'X'  -- Demanda estable
    WHEN CV < 50  THEN 'Y'  -- Demanda variable
    ELSE 'Z'                 -- Demanda errática
END
```

### 3. Stock Mínimo

```sql
stock_minimo = venta_diaria_promedio × lead_time_dias × factor_seguridad
```

**Ejemplo:**
```
Queso Blanco - BOSQUE
Clasificación: A-X
venta_diaria_promedio = 240 unidades
lead_time_dias = 3
factor_seguridad = 1.2 (de parametros_clasificacion)

stock_minimo = 240 × 3 × 1.2 = 864 unidades = 72 bultos
```

### 4. Punto de Reorden

```sql
punto_reorden = stock_minimo × 1.2
```

**Ejemplo:**
```
punto_reorden = 864 × 1.2 = 1,037 unidades = 86 bultos
```

Cuando el stock llegue a 1,037 unidades → generar orden de compra

### 5. Stock Máximo

```sql
-- Primero calcular stock de seguridad
stock_seguridad = venta_diaria_promedio × dias_seguridad × (CV / 100)

-- Luego stock máximo
stock_maximo = (venta_diaria_promedio × dias_cobertura_objetivo) + stock_seguridad
```

**Ejemplo:**
```
dias_cobertura_objetivo = 10 (de parametros_clasificacion para A-X)
dias_seguridad = 3
CV = 15%

stock_seguridad = 240 × 3 × 0.15 = 108 unidades
stock_maximo = (240 × 10) + 108 = 2,508 unidades = 209 bultos
```

---

## 🎯 Casos Especiales

### Productos que se venden por Unidad (no bulto)

**Ejemplo: Caraotas**
- `venta_por_unidad = true`
- `cantidad_bultos = 1`
- La clasificación se hace directamente sobre unidades

```sql
-- Para estos productos:
venta_diaria_bultos = venta_diaria_promedio / 1 = venta_diaria_promedio

-- Si venta_diaria_promedio = 25 unidades/día
clasificacion = 'A' (porque 25 >= 20)
```

### Productos sin Ventas Recientes

```sql
-- Si un producto no tiene ventas en los últimos 90 días
clasificacion = 'C'
venta_diaria_promedio = 0
stock_minimo = lote_minimo_compra (1 bulto mínimo)
punto_reorden = lote_minimo_compra
generar_alerta_stock_bajo = false
```

---

## 🔄 Proceso de Actualización

### Frecuencia de Recálculo

```
┌────────────────────┬──────────────────┬─────────────────┐
│ Clasificación      │ Frecuencia       │ Trigger         │
├────────────────────┼──────────────────┼─────────────────┤
│ A, AB              │ Semanal          │ Lunes 2am       │
│ B, BC              │ Quincenal        │ 1ro y 15        │
│ C                  │ Mensual          │ 1ro del mes     │
└────────────────────┴──────────────────┴─────────────────┘
```

### Script de Recálculo

```python
# etl/scripts/recalcular_parametros.py

def recalcular_parametros(clasificacion=None):
    """
    Recalcula parámetros para productos de cierta clasificación

    Args:
        clasificacion: 'A', 'AB', 'B', 'BC', 'C' o None (todos)
    """

    # 1. Recalcular métricas de venta (últimos 90 días)
    actualizar_metricas_venta(clasificacion)

    # 2. Reclasificar productos según nuevas ventas
    reclasificar_productos(clasificacion)

    # 3. Recalcular parámetros de stock
    recalcular_stock(clasificacion)

    # 4. Auditar cambios significativos
    auditar_cambios()

    # 5. Generar reporte
    generar_reporte()
```

---

## 📊 Resultado Esperado

### Tamaño de Datos

```
productos_maestro:                    4,159 registros
clasificacion_producto_tienda:       75,000 registros
parametros_clasificacion:                15 registros
producto_ubicacion_config:           75,000 registros
```

### Ejemplo Real: Queso Blanco (003119)

| Tienda      | Venta/Día | Bultos/Día | Clase | XYZ | Stock Min | Reorden | Stock Max |
|-------------|-----------|------------|-------|-----|-----------|---------|-----------|
| BOSQUE      | 240 und   | 20.0       | A     | X   | 864       | 1,037   | 2,508     |
| CENTRO      | 216 und   | 18.0       | AB    | Y   | 907       | 1,088   | 2,700     |
| GUIGUE      | 48 und    | 4.0        | B     | X   | 159       | 191     | 1,056     |
| TOCUYITO    | 3.6 und   | 0.3        | BC    | Y   | 11        | 13      | 150       |

---

## ✅ Ventajas de Esta Arquitectura

1. **Separación de Responsabilidades**
   - Catálogo maestro: info genérica
   - Clasificación: análisis por tienda
   - Parámetros: reglas de negocio
   - Config final: resultado calculado

2. **Mantenible**
   - Cambiar una fórmula = actualizar `parametros_clasificacion`
   - No tocar código, solo datos

3. **Auditable**
   - Cada cambio de clasificación se registra
   - Se puede ver histórico

4. **Escalable**
   - Agregar tienda = multiplicar registros automáticamente
   - Agregar producto = se calcula todo

5. **Flexible**
   - Reglas diferentes por clasificación
   - Ajuste fino por tienda si se necesita

---

## ❓ Preguntas para Validar

1. **¿La clasificación A/AB/B/BC/C es correcta así?**
   - ¿O necesitas ajustar los rangos?

2. **¿Cómo manejas productos que se venden por peso (KG)?**
   - ¿También usas bultos o es diferente?

3. **¿Lead time es igual para todas las tiendas?**
   - ¿O varía por tienda o por proveedor?

4. **¿Los días de cobertura que propongo están bien?**
   - A: 10 días, B: 21 días, C: 45 días

5. **¿Necesitas clasificación XYZ o solo con A/AB/B/BC/C está bien?**

---

**¿Este modelo de datos y arquitectura te hace sentido?**
