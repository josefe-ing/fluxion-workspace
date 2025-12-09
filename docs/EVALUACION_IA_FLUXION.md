# Evaluación de Oportunidades de IA en Fluxion

**Fecha:** Diciembre 2025
**Objetivo:** Identificar dónde la Inteligencia Artificial agregaría valor REAL al sistema

---

## Resumen Ejecutivo

**Fluxion es actualmente un sistema de optimización de inventario basado en REGLAS SOFISTICADAS, NO en Machine Learning.** El branding "AI" refleja capacidades aspiracionales, no implementación actual.

Sin embargo, el sistema está **excepcionalmente bien posicionado para integrar ML** debido a:
- ✓ Datos transaccionales ricos (81M+ registros)
- ✓ Múltiples ubicaciones para aprendizaje colaborativo
- ✓ Problema de negocio real con ROI medible
- ✓ Infraestructura lista (PostgreSQL, Python, APIs)

---

## 1. Estado Actual: ¿Qué "IA" Existe?

### 1.1 Capacidades Reales (Basadas en Reglas, NO en ML)

| Feature | Ubicación | Método | ¿Es ML? |
|---------|-----------|--------|---------|
| **Clasificación ABC** | `backend/services/calculo_inventario_abc.py` | Análisis Pareto 80/15/5 sobre ventas 30 días | ❌ NO |
| **Clasificación XYZ** | `backend/analisis_xyz.py` | Coeficiente de Variación (CV) | ❌ NO |
| **Niveles de Stock** | `calculo_inventario_abc.py` | Fórmulas estadísticas clásicas | ❌ NO |
| **Forecast** | Deprecated (PMP) | Promedio Móvil Ponderado 8 semanas | ❌ NO |
| **Pedidos Sugeridos** | `routers/pedidos_sugeridos.py` | Reglas complejas + P75 | ❌ NO |
| **Generadores de Tráfico** | Clasificación productos | Diferencial de ranking (GAP score) | ❌ NO |

### 1.2 Lo Que NO Está Implementado (Solo Aspiracional)

```
❌ AIAgentPanel.tsx - NO EXISTE
❌ ProactiveInsightsPanel.tsx - NO EXISTE
❌ ClientIntelligence.tsx - NO EXISTE
❌ PurchaseIntelligence.tsx - NO EXISTE
```

**Estos componentes mencionados en CLAUDE.md son aspiracionales, no existen en el código.**

---

## 2. Datos Disponibles (Activo Rico para ML)

### 2.1 Tablas Principales

| Tabla | Volumen | Uso |
|-------|---------|-----|
| **ventas** | 81M+ registros | Transacciones Sep 2024 - Sep 2025 |
| **productos** | ~8,000 SKUs | Catálogo con categorías, pesos, UOM |
| **inventario_actual** | Dinámico | Stock actual por ubicación |
| **inventario_historico** | Histórico | Niveles de stock en el tiempo |
| **ubicaciones** | 16 tiendas + 2 CEDIs | Ubicaciones con regiones |

### 2.2 Calidad de Datos

| Aspecto | Estado | Score |
|---------|--------|-------|
| Completitud transacciones | ✓ Excelente | 9/10 |
| Granularidad temporal | ✓ Horaria | 9/10 |
| Cobertura temporal | ✓ 13 meses | 8/10 |
| Datos de precio | ⚠️ Parcial | 6/10 |
| Datos de costo | ❌ Ausente | 2/10 |
| Tracking promociones | ❌ Ausente | 1/10 |
| Eventos externos | ❌ No mapeados | 2/10 |

**Readiness para ML: 7/10**

---

## 3. Oportunidades de ML con ALTO VALOR

### OPORTUNIDAD 1: Forecasting con ML (MÁXIMA PRIORIDAD)

**Estado Actual:**
- PMP (Promedio Móvil Ponderado) - DEPRECADO, no funciona
- Ventana de 8 semanas con pesos fijos (40%, 30%, 20%, 10%)

**Qué Puede Hacer ML:**

| Modelo | Accuracy Esperada (MAPE) | Complejidad |
|--------|--------------------------|-------------|
| **Prophet** | 15-25% | Baja |
| **ARIMA/SARIMA** | 18-28% | Media |
| **XGBoost/LightGBM** | 10-18% | Media |
| **LSTM/GRU** | 12-20% | Alta |
| **Ensemble** | 8-15% | Alta |

**Por Qué Importa:**
- Demanda varía drásticamente por día de semana
- Productos tienen patrones estacionales (navidad, regreso a clases)
- Actual asume lead time fijo de 1.5 días

**Impacto Estimado:**
- 10-20% reducción en quiebres de stock
- 5-15% menos sobreinventario
- ROI: 3-6 meses

**Implementación Recomendada:**
```python
# Fase 1: Prophet básico
from prophet import Prophet
model = Prophet(
    seasonality_mode='multiplicative',
    weekly_seasonality=True,
    yearly_seasonality=True
)
model.add_country_holidays(country_name='VE')

# Fase 2: Agregar variables exógenas
model.add_regressor('dia_quincena')  # Efecto quincena
model.add_regressor('es_inicio_mes')
```

---

### OPORTUNIDAD 2: Niveles de Stock Óptimos (Reemplazo de Heurísticas)

**Estado Actual:**
```python
# Reglas fijas actuales
if clase == 'A': dias_cobertura = 7
if clase == 'B': dias_cobertura = 14
if clase == 'C': dias_cobertura = 30
```

**Problema:** Parámetros fijos no reflejan rotación específica por producto.

**Solución ML: Optimización o Reinforcement Learning**
```python
# Nuevo enfoque
cobertura_optima[producto][ubicacion] = f(
    tasa_rotacion,
    volatilidad_demanda,
    variabilidad_lead_time,
    costo_quiebre,
    costo_holding,
    frecuencia_picos_demanda
)
```

**Impacto Estimado:**
- 10-25% reducción en capital atado (menos sobreinventario)
- 5-15% reducción en quiebres de stock
- Adaptación automática a cambios de patrón

**Modelos Candidatos:**
1. **Regresión** para predecir cobertura óptima
2. **Reinforcement Learning** (Q-Learning) para optimización dinámica
3. **Bayesian Optimization** para tuning de parámetros

---

### OPORTUNIDAD 3: Detección de Anomalías en Demanda

**Estado Actual:** Sin detección de anomalías

**Problema:** Los cálculos de stock fallan cuando la demanda cambia bruscamente

**Solución ML:**
```python
from sklearn.ensemble import IsolationForest

# Detectar:
# - Picos súbitos de demanda
# - Caídas inexplicables
# - Patrones inusuales (black swans)

detector = IsolationForest(contamination=0.05)
anomalias = detector.fit_predict(residuos_forecast)
```

**Uso:**
- Flaggear productos que requieren revisión manual
- Activar alertas para merchandising
- Ajustar parámetros de stock dinámicamente

**Impacto:** Reducción de riesgo, mejora en service level 3-5%

---

### OPORTUNIDAD 4: Segmentación por Ubicación

**Estado Actual:**
- Catálogo global tratado uniformemente
- Propagación regional básica (P75 de tiendas similares)

**Oportunidad ML:**
```python
from sklearn.cluster import KMeans

# Clusterizar tiendas por patrón de demanda
# Valencia behaves differently than interior towns
clusters = KMeans(n_clusters=4).fit(demand_patterns)
```

**Beneficios:**
- +15-25% accuracy en forecast por tienda
- Reducir safety stock en tiendas de bajo volumen
- Aumentar service level en tiendas de alto volumen
- Optimizar surtido por cluster de tienda

---

### OPORTUNIDAD 5: Motor de Recomendaciones de Productos

**Estado Actual:** No existe

**Oportunidad:**
```python
# Association Rules
from mlxtend.frequent_patterns import apriori, association_rules

# Collaborative Filtering
from surprise import SVD

# Casos de uso:
# 1. "Si piden X, también stockear Y"
# 2. "Cuando X agotado, substitute Y"
# 3. "Estos 3 items se venden juntos"
```

**Datos Disponibles:**
- 81M transacciones = señales de co-compra ricas
- 16 ubicaciones = collaborative filtering entre tiendas

**Impacto:**
- Aumentar ticket promedio
- Reducir ventas perdidas (sustituciones proactivas)
- Mejorar predicción regional

---

### OPORTUNIDAD 6: Elasticidad de Precios

**Estado Actual:** No existe modelado de elasticidad

**Qué Puede Hacer ML:**
- **Elasticidad-Precio:** ¿Cómo afectan los cambios de precio a la cantidad vendida?
- **Elasticidad Cruzada:** Si producto A agotado, ¿qué sustituto compran?
- **Elasticidad Promocional:** ¿Cuánto levantan realmente las promociones?

**Limitación:** Requiere datos de precio/costo que pueden estar incompletos.

**Si Hay Datos:**
```python
import statsmodels.api as sm

# Log-log regression para elasticidad
# ln(Q) = β₀ + β₁·ln(P) + controles + ε
# donde β₁ = elasticidad precio de la demanda
```

---

### OPORTUNIDAD 7: Predicción de Productos en Riesgo (Churn)

**Estado Actual:** Sin early warning de depreciación

**Problema:** Productos silenciosamente se vuelven no rentables

**Solución ML:**
```python
from sklearn.ensemble import RandomForestClassifier

# Predecir qué productos:
# - Tendrán 0 ventas en 30 días (eliminar del surtido?)
# - Tendrán >50% compresión de margen
# - Se volverán slow-movers
```

---

## 4. Reglas Sofisticadas Actuales (Efectivas, Mantener)

| Feature | Efectividad | Mantener |
|---------|-------------|----------|
| **Propagación Regional de Demanda** | ⭐⭐⭐⭐ | ✓ Excelente para productos nuevos |
| **Override Generadores de Tráfico** | ⭐⭐⭐⭐⭐ | ✓ Previene quiebres en productos clave |
| **Validaciones de Sanidad de Stock** | ⭐⭐⭐⭐ | ✓ Buenos safeguards |
| **Uso de P75 vs Media** | ⭐⭐⭐⭐ | ✓ Más robusto a outliers |
| **Cache ABC con Refresh** | ⭐⭐⭐ | ✓ Clasificación en tiempo real |

**Recomendación:** Estas reglas funcionan bien. ML debe COMPLEMENTARLAS, no reemplazarlas.

---

## 5. Brechas Críticas que ML Puede Llenar

| Brecha | Comportamiento Actual | Solución ML | Impacto Est. |
|--------|----------------------|-------------|--------------|
| **Forecast Accuracy** | PMP deprecado o manual | Prophet/LSTM ensemble | +20-30% accuracy |
| **Niveles de Stock Dinámicos** | Fijos por clase (7d, 14d, 30d) | RL u optimización | 10-25% reducción capital |
| **Manejo de Volatilidad** | Asume distribución normal | Detectar y forecastear picos | +5-10% service level |
| **Tuning por Ubicación** | Defaults globales | Modelos por ubicación | +15-25% forecast |
| **Detección Slow-Movers** | Revisión manual | Clasificación de churn | 5-10% mejora rotación |

---

## 6. Roadmap de Implementación Recomendado

### Fase 1: Quick Wins (Semanas 1-4)

| Tarea | Esfuerzo | Impacto | Prioridad |
|-------|----------|---------|-----------|
| Reemplazar PMP con Prophet | 1-2 semanas | Alto | P0 |
| Detección de anomalías (Isolation Forest) | 2-3 semanas | Medio | P1 |
| Alertas de demanda inusual | 1 semana | Medio | P1 |

### Fase 2: Optimización Core (Semanas 5-12)

| Tarea | Esfuerzo | Impacto | Prioridad |
|-------|----------|---------|-----------|
| Niveles de stock dinámicos | 4-6 semanas | Muy Alto | P0 |
| Clustering de ubicaciones | 2-3 semanas | Alto | P1 |
| Forecast multi-variable (XGBoost) | 3-4 semanas | Alto | P1 |

### Fase 3: Avanzado (Semanas 13-24)

| Tarea | Esfuerzo | Impacto | Prioridad |
|-------|----------|---------|-----------|
| Motor de recomendaciones | 4-6 semanas | Medio-Alto | P2 |
| Modelado de elasticidad | 3-4 semanas | Medio | P2 |
| Predicción de churn de productos | 2-3 semanas | Medio | P2 |
| RL para inventory optimization | 6-8 semanas | Muy Alto | P2 |

---

## 7. Requerimientos Técnicos

### Stack ML Recomendado

```python
# Core
python >= 3.10
scikit-learn >= 1.3
pandas >= 2.0
numpy >= 1.24

# Time Series
prophet >= 1.1
statsmodels >= 0.14

# Gradient Boosting
xgboost >= 2.0
lightgbm >= 4.0

# Deep Learning (opcional)
pytorch >= 2.0
# o tensorflow >= 2.13

# MLOps
mlflow >= 2.8  # Tracking de experimentos
optuna >= 3.4  # Hyperparameter tuning
```

### Infraestructura

1. **Entrenamiento:** Puede correr en el mismo servidor (los datos no son masivos)
2. **Serving:**
   - Batch: Cron jobs diarios para re-forecast
   - Real-time: Endpoint FastAPI para scoring
3. **Almacenamiento Modelos:** MLflow o directorio local
4. **Monitoreo:** Tracking de MAPE, drift detection

---

## 8. Métricas de Éxito

### KPIs a Medir

| Métrica | Actual (Est.) | Target con ML | Cómo Medir |
|---------|---------------|---------------|------------|
| **MAPE Forecast** | ~30% | <18% | Error vs ventas reales |
| **Quiebres de Stock** | X% | X - 15% | % productos con stock 0 |
| **Días de Inventario** | Y días | Y - 20% | Inventario / Venta diaria |
| **Capital en Inventario** | $Z | $Z - 15% | Valor total inventario |
| **Service Level** | W% | W + 5% | % pedidos satisfechos |

### A/B Testing Recomendado

1. Seleccionar 4 tiendas piloto (2 alta velocidad, 2 baja velocidad)
2. Implementar ML solo en pilotos
3. Medir durante 8 semanas
4. Comparar KPIs vs grupo control
5. Rollout si resultados positivos

---

## 9. Riesgos y Mitigación

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Datos de precio incompletos | Alta | Empezar con forecast de cantidad, no revenue |
| Overfitting en productos de baja rotación | Media | Usar regularización, modelos simples para Class C |
| Resistance to change del equipo | Media | Mostrar resultados en pilotos, involucrar temprano |
| Falta de ground truth para anomalías | Alta | Usar unsupervised methods, validar con expertos |
| Complejidad de maintenance | Media | MLOps desde día 1, documentación, monitoring |

---

## 10. Conclusión

### Resumen

| Aspecto | Estado Actual | Score |
|---------|---------------|-------|
| Sofisticación de Reglas | ✓ Excelente | 9/10 |
| Madurez ML | ✗ Ninguna | 0/10 |
| Calidad de Datos | ⚠️ Buena (con gaps) | 7/10 |
| Impacto Operacional (actual) | ✓ Alto | 8/10 |
| Oportunidad ML | ✓ Masiva | 9/10 |
| Readiness Implementación | ⚠️ Parcial | 6/10 |

### Recomendación Final

**Fluxion tiene una base sólida de reglas que funciona.** La oportunidad está en COMPLEMENTAR con ML, no reemplazar.

**Prioridad absoluta:** Implementar Prophet para forecasting (1-2 semanas, alto impacto).

**Segundo paso:** Niveles de stock dinámicos basados en datos reales de rotación.

**Outcome esperado:** 15-30% mejora en eficiencia de inventario (balance rotación/quiebres) con integración de ML.

---

## Apéndice: Componentes Frontend a Crear

Si se implementa ML, estos componentes cobran sentido:

| Componente | Propósito | Requiere |
|------------|-----------|----------|
| **AIAgentPanel** | Insights proactivos diarios | Forecast + Anomaly Detection |
| **ProactiveInsightsPanel** | Alertas de riesgo de stock | Predicción de demanda |
| **DemandForecastChart** | Visualización de forecast | Prophet implementado |
| **AnomalyAlerts** | Productos con comportamiento inusual | Isolation Forest |
| **OptimalStockRecommendations** | Sugerencias de ajuste de niveles | Modelo de optimización |

---

*Documento generado por evaluación técnica del codebase.*
