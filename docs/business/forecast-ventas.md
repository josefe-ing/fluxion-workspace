# Forecast de Ventas - Predicción 2-3 Días

## Objetivo

Predecir las **ventas de los próximos 2-3 días** para cada producto en cada tienda, utilizando datos históricos disponibles. Esto permitirá:

- Calcular stock necesario con mayor precisión
- Validar si la cantidad sugerida de pedido es suficiente
- Generar alertas tempranas de posible stock-out
- Mejorar la toma de decisiones de reabastecimiento

---

## 1. Análisis de Datos Disponibles

### ✅ Datos que TENEMOS

| Categoría | Datos | Periodo |
|-----------|-------|---------|
| **Ventas Históricas** | 81M+ transacciones diarias por producto/tienda | ~13 meses (Sep 2024 - Oct 2025) |
| **Patrones Temporales** | • Promedio últimos 5 días<br>• Promedio últimos 20 días<br>• Promedio mismo día semana (56 días)<br>• Día de la semana | Actualizados diariamente |
| **Información Producto** | • Clasificación ABC<br>• Cantidad por bulto<br>• Categoría, marca, presentación | Catálogo completo |
| **Inventario Actual** | • Stock por tienda<br>• Stock en tránsito<br>• Stock en CEDIs | Tiempo real |

### ❌ Datos que NO TENEMOS

| Categoría | Impacto en Forecast |
|-----------|---------------------|
| **Factores Externos** | • Promociones/ofertas planificadas<br>• Días festivos/feriados<br>• Eventos especiales<br>• Clima<br>• Actividad de competencia | Podrían mejorar precisión 10-15% |
| **Factores Económicos** | • Inflación/devaluación<br>• Poder adquisitivo<br>• Variación de precios | Impacto medio en productos sensibles a precio |
| **Estacionalidad Anual** | Solo 13 meses de datos, no hay 2+ ciclos anuales completos | Limita modelos de estacionalidad larga |

**Conclusión**: Tenemos datos **suficientes** para crear un modelo de forecast funcional con precisión aceptable (70-85%).

---

## 2. Modelos de Forecasting Posibles

### Comparativa de Modelos

| Modelo | Complejidad | Precisión Estimada | Tiempo Implementación | Recomendado |
|--------|-------------|-------------------|----------------------|-------------|
| **Promedio Móvil Ponderado** | ⭐ Baja | 70-80% | 1-2 días | ✅ **SÍ - Fase 1** |
| **Suavizado Exponencial (ETS)** | ⭐⭐ Media | 75-85% | 3-5 días | ⏳ Fase 2 |
| **ARIMA** | ⭐⭐⭐ Alta | 80-90% | 1-2 semanas | ⏳ Fase 2 |
| **Prophet (Facebook)** | ⭐⭐ Media | 80-90% | 3-5 días | ⏳ Fase 2 |
| **Machine Learning** | ⭐⭐⭐⭐ Muy Alta | 85-95% | 2-4 semanas | ⏳ Fase 3 |

---

### Modelo 1: Promedio Móvil Ponderado ✅ RECOMENDADO

**Descripción**: Combina promedios de diferentes ventanas temporales con pesos específicos.

**Fórmula**:
```
Forecast día D =
  (0.50 × Promedio mismo día semana últimas 8 semanas) +
  (0.30 × Promedio últimos 5 días) +
  (0.20 × Promedio últimos 20 días)
```

**Pesos Explicados**:
- **50% Mismo día semana** → Captura patrón semanal (ej: lunes vende más que domingo)
- **30% Últimos 5 días** → Captura comportamiento reciente y tendencias
- **20% Últimos 20 días** → Estabiliza contra volatilidad excesiva

**Ventajas**:
- ✅ Muy fácil de implementar (solo SQL/DuckDB)
- ✅ Rápido de calcular (segundos para miles de productos)
- ✅ Resultados interpretables y auditables
- ✅ No requiere entrenamiento ni librerías externas
- ✅ Funciona bien con datos que tenemos

**Desventajas**:
- ❌ No captura tendencias complejas no lineales
- ❌ No considera eventos especiales (holidays, promociones)
- ❌ Menos preciso que modelos avanzados

**Precisión Estimada**:
- Productos A: 75-80%
- Productos AB: 70-78%
- Productos B: 68-75%
- Productos BC/C: 60-70%

**Casos de Uso**: Perfecto para comenzar. Funcional desde día 1.

---

### Modelo 2: Suavizado Exponencial (ETS)

**Descripción**: Modelo estadístico que suaviza la serie temporal y captura tendencia + estacionalidad.

**Componentes**:
```
Forecast(t+1) = α × Actual(t) + (1-α) × Forecast(t)

Donde:
- α (alpha) = factor de suavizado del nivel (0-1)
- β (beta) = factor de suavizado de la tendencia
- γ (gamma) = factor de suavizado estacional
```

**Ecuaciones**:
```
Level:    L(t) = α × Y(t) + (1-α) × (L(t-1) + T(t-1))
Trend:    T(t) = β × (L(t) - L(t-1)) + (1-β) × T(t-1)
Seasonal: S(t) = γ × (Y(t) - L(t)) + (1-γ) × S(t-m)

Forecast: F(t+h) = L(t) + h × T(t) + S(t+h-m)
```

**Ventajas**:
- ✅ Mejor que promedio simple
- ✅ Captura tendencias automáticamente
- ✅ Maneja estacionalidad semanal
- ✅ Auto-ajustable

**Desventajas**:
- ❌ Más complejo de implementar
- ❌ Requiere calcular parámetros óptimos α, β, γ
- ❌ Puede sobre-ajustar productos C (poca venta)

**Precisión Estimada**:
- Productos A/AB: 75-85%
- Productos B: 70-80%
- Productos BC/C: 65-75%

**Casos de Uso**: Fase 2, cuando queramos mejorar el modelo inicial.

---

### Modelo 3: ARIMA (AutoRegressive Integrated Moving Average)

**Descripción**: Modelo estadístico avanzado que identifica patrones autorregresivos.

**Componentes**:
- **AR(p)**: Auto-regresión - el valor depende de valores pasados
- **I(d)**: Integración - diferenciación para lograr estacionariedad
- **MA(q)**: Media móvil - incorpora errores pasados

**Ecuación General**:
```
Y(t) = c + φ₁Y(t-1) + ... + φₚY(t-p) + θ₁ε(t-1) + ... + θqε(t-q) + ε(t)
```

**Ventajas**:
- ✅ Muy preciso para series temporales estables
- ✅ Captura patrones complejos
- ✅ Standard académico e industrial
- ✅ Intervalos de confianza robustos

**Desventajas**:
- ❌ Requiere Python/R con librerías especializadas (`statsmodels`, `forecast`)
- ❌ Computacionalmente costoso para miles de productos
- ❌ Difícil de interpretar (coeficientes no intuitivos)
- ❌ Necesita datos estacionarios (puede requerir transformaciones)
- ❌ Requiere selección de parámetros (p, d, q) por producto

**Precisión Estimada**:
- 80-90% si está bien calibrado
- Menor para productos con alta volatilidad

**Casos de Uso**: Solo si necesitamos máxima precisión y tenemos recursos Python.

---

### Modelo 4: Prophet (Facebook)

**Descripción**: Modelo de forecasting de código abierto diseñado para series de negocio.

**Componentes**:
```
y(t) = g(t) + s(t) + h(t) + εₜ

Donde:
- g(t) = tendencia (growth)
- s(t) = estacionalidad (semanal, anual)
- h(t) = efectos de holidays
- εₜ = error
```

**Ventajas**:
- ✅ Fácil de usar (API simple)
- ✅ Maneja holidays automáticamente
- ✅ Robusto a datos faltantes
- ✅ Intervalos de confianza incluidos
- ✅ Funciona bien sin ajuste manual

**Desventajas**:
- ❌ Requiere Python (`fbprophet` / `prophet`)
- ❌ Necesitamos configurar calendario de holidays venezolanos
- ❌ Computacionalmente costoso para procesar miles de productos en tiempo real
- ❌ No ideal para productos con muy poca historia

**Precisión Estimada**:
- 80-90% para productos con buena historia
- 75-85% para productos con ventas irregulares

**Casos de Uso**: Fase 2-3, cuando tengamos infraestructura Python y queramos escalar.

---

### Modelo 5: Machine Learning (Random Forest, XGBoost, LightGBM)

**Descripción**: Modelos de aprendizaje supervisado que aprenden patrones de features.

**Features de Entrada**:
```python
features = {
    # Temporales
    'day_of_week': 0-6,
    'day_of_month': 1-31,
    'month': 1-12,
    'week_of_year': 1-52,
    'is_weekend': 0/1,
    'is_month_end': 0/1,

    # Lags (ventas pasadas)
    'lag_1': venta_ayer,
    'lag_7': venta_mismo_dia_semana_pasada,
    'lag_14': venta_hace_2_semanas,

    # Rolling averages
    'rolling_mean_7': promedio_7_dias,
    'rolling_mean_30': promedio_30_dias,
    'rolling_std_7': desviacion_7_dias,

    # Producto
    'clasificacion_abc': A/AB/B/BC/C,
    'categoria': categoria_producto,
    'precio_unitario': precio,

    # Stock (puede influir en venta)
    'stock_disponible': stock_tienda,
    'dias_sin_stock_ultimos_30': dias
}
```

**Algoritmos Posibles**:
- **Random Forest**: Ensemble de árboles de decisión
- **XGBoost**: Gradient boosting optimizado
- **LightGBM**: Más rápido que XGBoost
- **Neural Networks**: Para patrones muy complejos

**Ventajas**:
- ✅ Máxima precisión posible
- ✅ Captura relaciones no lineales
- ✅ Feature engineering flexible
- ✅ Puede aprender patrones complejos

**Desventajas**:
- ❌ Requiere infraestructura ML completa (Python, MLflow, etc.)
- ❌ Necesita re-entrenamiento periódico
- ❌ Difícil de explicar (black box)
- ❌ Riesgo de overfitting
- ❌ Mucho trabajo de feature engineering
- ❌ No justificado para problema actual

**Precisión Estimada**:
- 85-95% con buen feature engineering
- Requiere validación exhaustiva

**Casos de Uso**: Solo si venta forecast es crítico para el negocio y hay recursos.

---

## 3. Recomendación: Enfoque Híbrido en 2 Fases

### **FASE 1: Implementar AHORA** ✅

**Modelo**: Promedio Móvil Ponderado con Ajuste por Tendencia

**Razones**:
- ✅ Simple y rápido de implementar (1-2 días)
- ✅ No requiere infraestructura adicional (solo DuckDB/SQL)
- ✅ Suficientemente preciso para tomar decisiones (70-80%)
- ✅ Auditable y explicable
- ✅ Funciona con datos actuales

**Implementación SQL Completa**:

```sql
-- ============================================
-- FORECAST DE VENTAS PRÓXIMOS 3 DÍAS
-- ============================================

WITH fecha_actual AS (
  SELECT CURRENT_DATE as fecha_hoy
),

-- Calcular día de la semana para los próximos 3 días
dias_forecast AS (
  SELECT
    fecha_hoy + INTERVAL 1 DAY as fecha_dia_1,
    fecha_hoy + INTERVAL 2 DAY as fecha_dia_2,
    fecha_hoy + INTERVAL 3 DAY as fecha_dia_3,
    EXTRACT(DOW FROM fecha_hoy + INTERVAL 1 DAY) as dow_dia_1,
    EXTRACT(DOW FROM fecha_hoy + INTERVAL 2 DAY) as dow_dia_2,
    EXTRACT(DOW FROM fecha_hoy + INTERVAL 3 DAY) as dow_dia_3
  FROM fecha_actual
),

-- Promedio mismo día de la semana (últimas 8 semanas = 56 días)
prom_mismo_dia AS (
  SELECT
    v.codigo_producto,
    v.ubicacion_id,
    v.dia_semana,
    AVG(CAST(v.cantidad_vendida AS DECIMAL)) as promedio_mismo_dia
  FROM ventas_raw v
  CROSS JOIN fecha_actual f
  WHERE v.fecha >= f.fecha_hoy - INTERVAL 56 DAY
    AND v.fecha < f.fecha_hoy
  GROUP BY v.codigo_producto, v.ubicacion_id, v.dia_semana
),

-- Promedio últimos 5 días
prom_5_dias AS (
  SELECT
    v.codigo_producto,
    v.ubicacion_id,
    AVG(CAST(v.cantidad_vendida AS DECIMAL)) as promedio_5d
  FROM ventas_raw v
  CROSS JOIN fecha_actual f
  WHERE v.fecha >= f.fecha_hoy - INTERVAL 5 DAY
    AND v.fecha < f.fecha_hoy
  GROUP BY v.codigo_producto, v.ubicacion_id
),

-- Promedio últimos 20 días
prom_20_dias AS (
  SELECT
    v.codigo_producto,
    v.ubicacion_id,
    AVG(CAST(v.cantidad_vendida AS DECIMAL)) as promedio_20d
  FROM ventas_raw v
  CROSS JOIN fecha_actual f
  WHERE v.fecha >= f.fecha_hoy - INTERVAL 20 DAY
    AND v.fecha < f.fecha_hoy
  GROUP BY v.codigo_producto, v.ubicacion_id
),

-- Calcular tendencia (comparar 5d vs 20d)
tendencia AS (
  SELECT
    p5.codigo_producto,
    p5.ubicacion_id,
    CASE
      WHEN p20.promedio_20d > 0 THEN p5.promedio_5d / p20.promedio_20d
      ELSE 1.0
    END as factor_tendencia
  FROM prom_5_dias p5
  LEFT JOIN prom_20_dias p20
    ON p5.codigo_producto = p20.codigo_producto
    AND p5.ubicacion_id = p20.ubicacion_id
),

-- Calcular forecast para cada día
forecast_calculado AS (
  SELECT
    p20.codigo_producto,
    p20.ubicacion_id,

    -- DÍA 1 (mañana)
    df.fecha_dia_1,
    (
      COALESCE(pmd1.promedio_mismo_dia, p20.promedio_20d) * 0.50 +
      COALESCE(p5.promedio_5d, p20.promedio_20d) * 0.30 +
      p20.promedio_20d * 0.20
    ) * LEAST(GREATEST(t.factor_tendencia, 0.5), 1.5) as forecast_dia_1_unidades,

    -- DÍA 2
    df.fecha_dia_2,
    (
      COALESCE(pmd2.promedio_mismo_dia, p20.promedio_20d) * 0.50 +
      COALESCE(p5.promedio_5d, p20.promedio_20d) * 0.30 +
      p20.promedio_20d * 0.20
    ) * LEAST(GREATEST(t.factor_tendencia, 0.5), 1.5) as forecast_dia_2_unidades,

    -- DÍA 3
    df.fecha_dia_3,
    (
      COALESCE(pmd3.promedio_mismo_dia, p20.promedio_20d) * 0.50 +
      COALESCE(p5.promedio_5d, p20.promedio_20d) * 0.30 +
      p20.promedio_20d * 0.20
    ) * LEAST(GREATEST(t.factor_tendencia, 0.5), 1.5) as forecast_dia_3_unidades,

    -- Factor de tendencia para debug
    t.factor_tendencia

  FROM prom_20_dias p20
  CROSS JOIN dias_forecast df
  LEFT JOIN prom_5_dias p5
    ON p20.codigo_producto = p5.codigo_producto
    AND p20.ubicacion_id = p5.ubicacion_id
  LEFT JOIN tendencia t
    ON p20.codigo_producto = t.codigo_producto
    AND p20.ubicacion_id = t.ubicacion_id
  -- JOIN promedio mismo día para cada día de forecast
  LEFT JOIN prom_mismo_dia pmd1
    ON p20.codigo_producto = pmd1.codigo_producto
    AND p20.ubicacion_id = pmd1.ubicacion_id
    AND pmd1.dia_semana = df.dow_dia_1
  LEFT JOIN prom_mismo_dia pmd2
    ON p20.codigo_producto = pmd2.codigo_producto
    AND p20.ubicacion_id = pmd2.ubicacion_id
    AND pmd2.dia_semana = df.dow_dia_2
  LEFT JOIN prom_mismo_dia pmd3
    ON p20.codigo_producto = pmd3.codigo_producto
    AND p20.ubicacion_id = pmd3.ubicacion_id
    AND pmd3.dia_semana = df.dow_dia_3
)

-- Resultado final con conversión a bultos
SELECT
  fc.codigo_producto,
  fc.ubicacion_id,

  -- Forecast Día 1
  fc.fecha_dia_1,
  ROUND(fc.forecast_dia_1_unidades, 1) as forecast_dia_1_unidades,
  ROUND(fc.forecast_dia_1_unidades / NULLIF(i.cantidad_bultos, 0), 1) as forecast_dia_1_bultos,

  -- Forecast Día 2
  fc.fecha_dia_2,
  ROUND(fc.forecast_dia_2_unidades, 1) as forecast_dia_2_unidades,
  ROUND(fc.forecast_dia_2_unidades / NULLIF(i.cantidad_bultos, 0), 1) as forecast_dia_2_bultos,

  -- Forecast Día 3
  fc.fecha_dia_3,
  ROUND(fc.forecast_dia_3_unidades, 1) as forecast_dia_3_unidades,
  ROUND(fc.forecast_dia_3_unidades / NULLIF(i.cantidad_bultos, 0), 1) as forecast_dia_3_bultos,

  -- Total 3 días
  ROUND(
    fc.forecast_dia_1_unidades +
    fc.forecast_dia_2_unidades +
    fc.forecast_dia_3_unidades,
    1
  ) as forecast_total_3dias_unidades,

  ROUND(
    (fc.forecast_dia_1_unidades + fc.forecast_dia_2_unidades + fc.forecast_dia_3_unidades) /
    NULLIF(i.cantidad_bultos, 0),
    1
  ) as forecast_total_3dias_bultos,

  -- Metadata
  fc.factor_tendencia,
  i.cantidad_bultos,

  -- Método usado
  'weighted_moving_average_v1' as metodo

FROM forecast_calculado fc
LEFT JOIN inventario_raw i
  ON fc.codigo_producto = i.codigo_producto
  AND fc.ubicacion_id = i.ubicacion_id
WHERE fc.forecast_dia_1_unidades > 0
ORDER BY fc.ubicacion_id, fc.codigo_producto;
```

**Explicación del Ajuste por Tendencia**:
```sql
LEAST(GREATEST(factor_tendencia, 0.5), 1.5)

Esto limita el factor de tendencia entre 0.5 y 1.5:
- Si venta está subiendo (factor > 1): multiplicar hasta 1.5x máximo
- Si venta está bajando (factor < 1): reducir hasta 0.5x mínimo
- Evita sobre-reaccionar a cambios extremos
```

---

### **FASE 2: Mejorar DESPUÉS** ⏳

**Cuándo**: Después de 2-3 meses usando Fase 1

**Condiciones para avanzar**:
1. ✅ Tengamos ≥ 2 años de datos (para estacionalidad anual)
2. ✅ Hayamos identificado holidays/eventos importantes de Venezuela
3. ✅ Tengamos capacidad de cómputo para procesar offline (Python/R)
4. ✅ El forecast sea crítico y necesitemos mayor precisión

**Opciones**:
- **Suavizado Exponencial (ETS)** - Si queremos mejorar 5-10% precisión
- **Prophet** - Si queremos manejar holidays automáticamente
- **ARIMA** - Si tenemos recursos y queremos lo más preciso

---

## 4. Validación del Modelo

### 4.1. Métricas de Precisión

Calcular las siguientes métricas comparando forecast vs venta real:

#### MAPE (Mean Absolute Percentage Error)
```
MAPE = (1/n) × Σ |Actual - Forecast| / |Actual| × 100%

Interpretación:
- MAPE < 10%: Excelente
- MAPE 10-20%: Bueno
- MAPE 20-30%: Aceptable
- MAPE > 30%: Mejorar modelo
```

#### MAE (Mean Absolute Error)
```
MAE = (1/n) × Σ |Actual - Forecast|

Interpretación:
- Promedio de unidades de error
- Ejemplo: MAE = 15 → nos equivocamos en promedio por 15 unidades
```

#### RMSE (Root Mean Squared Error)
```
RMSE = √[(1/n) × Σ (Actual - Forecast)²]

Interpretación:
- Penaliza errores grandes más que MAE
- Si RMSE >> MAE: hay outliers o errores grandes
```

#### Bias
```
Bias = (1/n) × Σ (Forecast - Actual)

Interpretación:
- Bias > 0: Sobre-predicción sistemática
- Bias < 0: Sub-predicción sistemática
- Bias ≈ 0: Predicción balanceada (ideal)
```

### 4.2. Targets de Precisión por Clasificación

| Clasificación | MAPE Target | Justificación |
|---------------|-------------|---------------|
| **A** | < 20% | Alta rotación, patrón estable |
| **AB** | < 25% | Muy buena rotación |
| **B** | < 30% | Rotación media, más variabilidad |
| **BC** | < 35% | Media-baja rotación |
| **C** | < 40% | Baja rotación, alta volatilidad |

### 4.3. Backtesting (Validación Histórica)

Probar el modelo con datos pasados para estimar precisión:

```sql
-- Ejemplo: Simular forecast para semana pasada
-- Usar datos hasta 2025-09-25
-- Predecir 2025-09-26, 27, 28
-- Comparar con ventas reales de esos días

WITH forecast_pasado AS (
  -- [Ejecutar query de forecast con fecha_hoy = '2025-09-25']
  ...
),
ventas_reales AS (
  SELECT
    codigo_producto,
    ubicacion_id,
    fecha,
    SUM(cantidad_vendida) as venta_real
  FROM ventas_raw
  WHERE fecha IN ('2025-09-26', '2025-09-27', '2025-09-28')
  GROUP BY codigo_producto, ubicacion_id, fecha
)

SELECT
  vr.codigo_producto,
  vr.ubicacion_id,
  vr.fecha,
  vr.venta_real,
  fp.forecast_unidades,

  -- Métricas
  ABS(vr.venta_real - fp.forecast_unidades) as error_absoluto,
  ABS(vr.venta_real - fp.forecast_unidades) / NULLIF(vr.venta_real, 0) * 100 as error_porcentual,
  (fp.forecast_unidades - vr.venta_real) as bias

FROM ventas_reales vr
JOIN forecast_pasado fp
  ON vr.codigo_producto = fp.codigo_producto
  AND vr.ubicacion_id = fp.ubicacion_id
  AND vr.fecha = fp.fecha_forecast
ORDER BY error_porcentual DESC;
```

**Plan de Backtesting**:
1. Ejecutar forecast para últimas 4 semanas (28 días)
2. Comparar con ventas reales
3. Calcular MAPE, MAE, RMSE, Bias
4. Analizar por clasificación ABC
5. Identificar productos con peor desempeño
6. Ajustar pesos si es necesario

---

## 5. Casos Especiales

### 5.1. Productos Nuevos (Sin Historial)

**Problema**: Producto tiene < 7 días de ventas

**Solución**:
```sql
CASE
  WHEN dias_con_ventas < 7 THEN
    -- Usar promedio de la categoría
    (SELECT AVG(venta_diaria)
     FROM productos_categoria
     WHERE categoria = producto.categoria) * 0.5
  ELSE
    -- Usar modelo normal
    forecast_normal
END
```

**Ajuste**: Multiplicar por 0.5 porque productos nuevos suelen vender menos al inicio.

---

### 5.2. Productos con Poca Venta (Clasificación C)

**Problema**: Alta variabilidad, difícil predecir

**Solución**:
```sql
CASE
  WHEN clasificacion_abc = 'C' THEN
    -- Usar máximo entre forecast y un mínimo
    GREATEST(forecast_calculado, 0.1)
  ELSE
    forecast_calculado
END
```

**Nota**: Para productos C, no confiar completamente en el forecast. Considerar rango amplio de confianza.

---

### 5.3. Productos Descontinuados

**Problema**: Producto marcado como descontinuado o sin ventas en 60+ días

**Solución**:
```sql
CASE
  WHEN dias_sin_venta >= 60 OR producto.activo = false THEN
    0  -- Forecast = 0
  ELSE
    forecast_calculado
END
```

---

### 5.4. Outliers (Días Anormales)

**Problema**: Día con venta anormalmente alta/baja (ej: promoción especial)

**Solución**:
```sql
-- Detectar outliers usando desviación estándar
WITH stats AS (
  SELECT
    codigo_producto,
    AVG(cantidad_vendida) as media,
    STDDEV(cantidad_vendida) as desv_std
  FROM ventas_raw
  WHERE fecha >= CURRENT_DATE - INTERVAL 30 DAY
  GROUP BY codigo_producto
)

-- Excluir ventas > 3 desviaciones estándar del promedio
SELECT ...
FROM ventas_raw v
JOIN stats s ON v.codigo_producto = s.codigo_producto
WHERE v.cantidad_vendida BETWEEN
  s.media - (3 * s.desv_std) AND
  s.media + (3 * s.desv_std)
```

**Límite de Forecast**:
```sql
-- Forecast no debe ser > 3 × desviación estándar
LEAST(forecast_calculado, promedio + 3 * desviacion_estandar)
```

---

### 5.5. Stock-Out (Producto Agotado Recientemente)

**Problema**: Ayer producto estuvo agotado → venta artificial = 0

**Solución**:
```sql
CASE
  WHEN stock_ayer = 0 AND venta_ayer = 0 THEN
    -- Ajustar forecast al alza (demanda reprimida)
    forecast_calculado * 1.3
  ELSE
    forecast_calculado
END
```

**Justificación**: Si producto estuvo agotado, hay demanda no satisfecha que se liberará cuando vuelva a haber stock.

---

## 6. Intervalos de Confianza

Además del forecast puntual, calcular rango para manejar incertidumbre:

```sql
SELECT
  codigo_producto,
  ubicacion_id,

  -- Forecast puntual
  forecast_unidades,

  -- Intervalo de confianza (±30%)
  ROUND(forecast_unidades * 0.7, 1) as forecast_bajo,
  ROUND(forecast_unidades * 1.3, 1) as forecast_alto,

  -- Mostrar como rango
  CONCAT(
    ROUND(forecast_unidades, 0),
    ' ± ',
    ROUND(forecast_unidades * 0.3, 0)
  ) as forecast_con_intervalo

FROM forecast_calculado;
```

**Ejemplo de Salida**:
```
Forecast: 120 ± 36 unidades (rango: 84 - 156)
```

**Uso del Intervalo**:
- **Escenario optimista**: Pedir para forecast alto (156)
- **Escenario conservador**: Pedir para forecast bajo (84)
- **Escenario balanceado**: Pedir para forecast puntual (120)

**Ancho del Intervalo por Clasificación**:
```sql
CASE
  WHEN clasificacion_abc = 'A'  THEN forecast * 0.2  -- ±20%
  WHEN clasificacion_abc = 'AB' THEN forecast * 0.25 -- ±25%
  WHEN clasificacion_abc = 'B'  THEN forecast * 0.30 -- ±30%
  WHEN clasificacion_abc = 'BC' THEN forecast * 0.35 -- ±35%
  WHEN clasificacion_abc = 'C'  THEN forecast * 0.50 -- ±50%
END
```

---

## 7. Implementación Práctica

### 7.1. Frontend - Nuevas Columnas en OrderStepTwo

Agregar columnas al final de la tabla de productos:

```typescript
<th>Forecast Día 1</th>
<th>Forecast Día 2</th>
<th>Forecast Día 3</th>
<th>Forecast Total 3d</th>
```

**Celdas**:
```tsx
<td className="bg-yellow-50 px-4 py-3 text-sm text-yellow-700 text-center">
  <div className="flex flex-col">
    <span className="font-medium">
      {producto.forecast_dia_1_bultos?.toFixed(1) || '-'}
    </span>
    <span className="text-xs text-yellow-500">
      ({producto.forecast_dia_1_unidades?.toFixed(0) || '-'} unid)
    </span>
  </div>
</td>
```

**Colores sugeridos**:
- Fondo: `bg-yellow-50` (amarillo muy claro)
- Texto: `text-yellow-700` (amarillo oscuro)
- Subtexto: `text-yellow-500`

---

### 7.2. Backend - Endpoint o Integración

#### Opción A: Endpoint Separado

```python
@app.get("/api/forecast/{ubicacion_id}", tags=["Forecast"])
async def get_forecast(ubicacion_id: str, dias: int = 3):
    """
    Retorna forecast de ventas para todos los productos de una ubicación
    """
    try:
        conn = get_db_connection()

        # Ejecutar query SQL de forecast
        query = """
        [... query completo de forecast ...]
        WHERE fc.ubicacion_id = ?
        """

        result = conn.execute(query, [ubicacion_id]).fetchall()
        conn.close()

        forecasts = []
        for row in result:
            forecasts.append({
                "codigo_producto": row[0],
                "forecast_dia_1_unidades": float(row[3]),
                "forecast_dia_1_bultos": float(row[4]),
                "forecast_dia_2_unidades": float(row[6]),
                "forecast_dia_2_bultos": float(row[7]),
                "forecast_dia_3_unidades": float(row[9]),
                "forecast_dia_3_bultos": float(row[10]),
                "forecast_total_3dias_unidades": float(row[11]),
                "forecast_total_3dias_bultos": float(row[12]),
                "factor_tendencia": float(row[13]),
                "metodo": row[15]
            })

        return {
            "ubicacion_id": ubicacion_id,
            "fecha_calculo": datetime.now().isoformat(),
            "forecasts": forecasts,
            "total_productos": len(forecasts)
        }

    except Exception as e:
        logger.error(f"Error calculando forecast: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
```

#### Opción B: Integrar en Endpoint Existente

Agregar campos de forecast al endpoint `/api/pedidos-sugeridos/calcular`:

```python
# En el query principal, hacer LEFT JOIN con forecast
LEFT JOIN (
  [... subquery de forecast ...]
) fc ON producto.codigo_producto = fc.codigo_producto
```

**Ventaja**: No hacer llamada adicional

**Desventaja**: Query más complejo

---

### 7.3. Modelo de Datos Frontend

```typescript
interface ProductoPedido {
  // ... campos existentes ...

  // Nuevos campos de forecast
  forecast_dia_1_unidades?: number;
  forecast_dia_1_bultos?: number;
  forecast_dia_2_unidades?: number;
  forecast_dia_2_bultos?: number;
  forecast_dia_3_unidades?: number;
  forecast_dia_3_bultos?: number;
  forecast_total_3dias_unidades?: number;
  forecast_total_3dias_bultos?: number;
  forecast_metodo?: string;
}
```

---

### 7.4. Actualización de Forecast

**Frecuencia**: Calcular una vez al día

**Cuándo**: Madrugada (3:00 AM)

**Cómo**:
```python
# Script cron job o scheduled task
# etl/jobs/calcular_forecast_diario.py

import duckdb
from datetime import datetime

def calcular_forecast_diario():
    """
    Ejecuta cálculo de forecast para todas las tiendas
    Guarda resultados en tabla forecast_ventas
    """
    conn = duckdb.connect('data/fluxion_production.db')

    # Crear tabla si no existe
    conn.execute("""
        CREATE TABLE IF NOT EXISTS forecast_ventas (
            codigo_producto VARCHAR,
            ubicacion_id VARCHAR,
            fecha_calculo DATE,
            fecha_forecast DATE,
            forecast_unidades DECIMAL(10,2),
            forecast_bultos DECIMAL(10,2),
            metodo VARCHAR,
            PRIMARY KEY (codigo_producto, ubicacion_id, fecha_forecast)
        )
    """)

    # Ejecutar forecast
    conn.execute("""
        INSERT OR REPLACE INTO forecast_ventas
        [... query de forecast ...]
    """)

    conn.close()
    print(f"Forecast calculado: {datetime.now()}")

if __name__ == "__main__":
    calcular_forecast_diario()
```

**Cron job** (Linux/Mac):
```bash
# crontab -e
0 3 * * * cd /path/to/fluxion && python3 etl/jobs/calcular_forecast_diario.py
```

---

## 8. Preguntas para Discusión

### 8.1. Horizonte de Forecast
- ¿Forecast para 2 o 3 días?
- ¿O hacer ambos configurables?
- ¿Extender a 7 días en el futuro?

**Recomendación**: Empezar con 3 días (cubre ciclo de reabastecimiento típico).

---

### 8.2. Granularidad
- ¿Forecast por día individual o solo total 2-3 días?
- ¿Mostrar los 3 días en columnas separadas o solo total?

**Recomendación**: Mostrar día por día + total (permite ver patrón semanal).

---

### 8.3. Intervalos de Confianza
- ¿Mostrar rango (ej: "120 ± 36") o solo punto estimado?
- ¿Tres escenarios (bajo/medio/alto)?

**Recomendación**: Empezar solo con punto estimado, agregar intervalo después si es útil.

---

### 8.4. Uso del Forecast
- ¿Para qué usaremos principalmente el forecast?
  - Calcular stock necesario
  - Validar si cantidad sugerida de pedido es suficiente
  - Alertas de stock-out próximo
  - Ajustar precios dinámicamente

**Recomendación**: Primero para validar pedidos, luego agregar alertas.

---

### 8.5. Actualización
- ¿Recalcular forecast diariamente? ¿Cada 6h? ¿On-demand?
- ¿Mantener histórico de forecasts para análisis?

**Recomendación**: Una vez al día (madrugada), guardar histórico para backtesting.

---

### 8.6. Backtesting
- ¿Validar modelo antes de producción o iterar en vivo?
- ¿Qué hacer si MAPE > 40% para muchos productos?

**Recomendación**: Hacer backtesting de 1 semana antes de lanzar, ajustar pesos si necesario.

---

### 8.7. Casos Especiales
- ¿Cómo manejar productos en promoción? (sabemos que venderán más)
- ¿Desactivar forecast para productos con < X días de historia?

**Recomendación**: Empezar sin promociones, agregar manualmente después.

---

### 8.8. Presentación Visual
- ¿Colores para indicar confianza del forecast?
- ¿Iconos para método usado?
- ¿Tooltip con detalles?

**Recomendación**: Fondo amarillo claro, tooltip con factor tendencia.

---

### 8.9. Alertas Basadas en Forecast
- ¿Alertar si: Stock Total < Forecast 3 días?
- ¿Alertar si: Pedido Sugerido < Forecast?

**Recomendación**: Sí, agregar badge "⚠️ Insuficiente para forecast" si pedido < forecast.

---

### 8.10. Feedback Loop
- ¿Permitir a usuarios ajustar forecast manualmente?
- ¿Aprender de ajustes manuales para mejorar modelo?

**Recomendación**: Fase 2, primero enfocarse en modelo base.

---

## 9. Recomendación Final

### ✅ SÍ, podemos crear un forecast funcional

**Plan de Acción**:

#### **Semana 1-2: Implementación**
1. ✅ Implementar query SQL de Promedio Móvil Ponderado
2. ✅ Crear endpoint backend `/api/forecast/{ubicacion_id}`
3. ✅ Integrar 4 nuevas columnas en frontend OrderStepTwo
4. ✅ Agregar campos forecast al modelo ProductoPedido

#### **Semana 3: Validación**
1. ✅ Ejecutar backtesting con 2 semanas de datos históricos
2. ✅ Calcular MAPE, MAE, RMSE por clasificación ABC
3. ✅ Ajustar pesos (50/30/20) si es necesario
4. ✅ Validar casos especiales (productos nuevos, C, outliers)

#### **Semana 4: Producción**
1. ✅ Configurar cron job para cálculo diario (3 AM)
2. ✅ Crear tabla `forecast_ventas` para guardar resultados
3. ✅ Documentar fórmulas y parámetros
4. ✅ Monitorear precisión primeras 2 semanas

#### **Mes 2-3: Iteración**
1. ⏳ Analizar errores y ajustar modelo
2. ⏳ Considerar agregar intervalos de confianza
3. ⏳ Implementar alertas basadas en forecast
4. ⏳ Evaluar si vale la pena avanzar a Fase 2 (ETS/Prophet)

---

## 10. Métricas de Éxito

### KPIs para medir si el forecast funciona:

| Métrica | Target | Cómo Medir |
|---------|--------|------------|
| **MAPE Productos A** | < 20% | Comparar forecast vs real semanalmente |
| **MAPE General** | < 30% | Promedio de todos los productos |
| **Cobertura** | > 90% | % de productos con forecast disponible |
| **Uso en Decisiones** | > 70% | % de pedidos que consideran forecast |
| **Reducción Stock-Out** | -20% | Antes vs después de usar forecast |

### Señales de Alerta:
- ❌ MAPE > 40% para productos A
- ❌ Bias sistemático > 10% (sobre/sub predicción)
- ❌ Forecast = 0 para > 30% de productos
- ❌ Usuarios ignoran forecast y piden manualmente

---

## Anexo A: Glosario de Términos

| Término | Definición |
|---------|------------|
| **Forecast** | Predicción de ventas futuras basada en datos históricos |
| **MAPE** | Mean Absolute Percentage Error - error promedio en % |
| **MAE** | Mean Absolute Error - error promedio en unidades |
| **RMSE** | Root Mean Squared Error - penaliza errores grandes |
| **Bias** | Tendencia sistemática a sobre o sub predecir |
| **Backtesting** | Validar modelo con datos pasados |
| **Promedio Móvil** | Promedio de ventana temporal que se va desplazando |
| **Lag** | Valor pasado (ej: lag_7 = venta hace 7 días) |
| **Suavizado Exponencial** | Método que da más peso a datos recientes |
| **Estacionalidad** | Patrón que se repite (ej: todos los lunes) |
| **Tendencia** | Dirección general de la serie (subiendo/bajando) |

---

## Anexo B: Referencias

- **Forecasting: Principles and Practice** (Hyndman & Athanasopoulos)
- **Facebook Prophet**: https://facebook.github.io/prophet/
- **DuckDB Time Series Functions**: https://duckdb.org/docs/sql/functions/datepart

---

**Versión**: 1.0
**Fecha**: 2025-10-03
**Autor**: Fluxion AI - Sistema de Forecast de Ventas
**Próxima Revisión**: Después de implementar y validar Fase 1
