# Prompt para Claude Code: Implementación Prophet en FluxionIA

## Contexto del Proyecto

Soy Jose Felipe Lopez, CTO de La Granja (cadena de supermercados en Venezuela) y fundador de FluxionIA (sistema de gestión de inventarios). Necesito implementar forecasting con Prophet para predecir demanda.

### La empresa
- **La Granja**: 18 tiendas en Valencia + 2 en Caracas (abriendo la 3ra el 14 de marzo 2026)
- **FluxionIA**: Sistema que procesa 500,000 transacciones mensuales, hace clasificación ABC-XYZ, sugerencias de pedidos, fair share allocation
- Las tiendas venden en dólares a tasa oficial
- El spread cambiario (paralelo - oficial) afecta la demanda

### El problema
Las tiendas nuevas de Caracas no tienen histórico suficiente para entrenar modelos. Necesito:
1. Aprender patrones de tiendas maduras de Valencia (2+ años de data)
2. Transferir esos patrones a tiendas nuevas de Caracas
3. Modelar la curva de adopción de tiendas nuevas (~2 meses hasta estabilizar)

---

## Decisiones Técnicas Ya Tomadas

### 1. Modelo multiplicativo (no aditivo)
```python
model = Prophet(seasonality_mode='multiplicative')
```
**Razón**: En La Granja, la quincena *amplifica* el efecto del sábado. No se suman, se multiplican.

### 2. Efecto quincena como REGRESOR (no como estacionalidad)
```python
model.add_regressor('efecto_quincena', mode='multiplicative')
```
**Razón**: La quincena en Venezuela cae día 15 y último del mes. El período no es fijo (14-16 días), por lo que no funciona como estacionalidad de Fourier.

### 3. Curva del efecto quincena (descubierta con datos reales)
```
Día 0 (quincena):  1.0x  ← empieza
Día +1:            1.3x  ↗ sube
Día +2:            2.6x  🔥 PICO (si es sábado: 1.5 × 1.7)
Día +3:            1.4x  ↘ baja
Día +4:            1.1x  ↘ casi normal
Día +5:            0.5x  → termina
```
**Hallazgo clave**: El pico NO es el día de pago. Es el SÁBADO posterior.

### 4. Tendencia logística para nivel producto×tienda
```python
model = Prophet(growth='logistic')
df['cap'] = percentil_95_historico
```
**Razón**: Hay techos operativos (espacio en anaquel, capacidad de cajas).

### 5. Arquitectura bottom-up
```
Nivel base: Producto × Tienda (granular)
         ↓ sumar
Nivel CD: Producto × Región
         ↓ sumar  
Nivel Compras: Producto × Total red
```

### 6. Enfoque data-driven para agrupar tiendas
No asumir agrupaciones por zona o tamaño. Entrenar modelos individuales y descubrir estadísticamente qué tiendas se parecen.

---

## Patrones Conocidos de La Granja

### Estacionalidad semanal (de análisis con tiendas Caracas)
- Sábado: +55%
- Domingo: +21%
- Miércoles: -39% (día más bajo)

### Efecto quincena
- Magnitud: ~51% sobre días normales
- Duración: 4-5 días
- El pico es el sábado post-quincena, no el día de pago

### Variaciones entre tiendas
- Algunas tiendas tienen pico el domingo en vez del sábado
- Productos varían por región y segmento (premium vs estándar)
- Nivel de ventas base varía por zona socioeconómica

---

## Datos Disponibles

### Base de datos local (Docker)
- ~2 años de historia de ventas de tiendas de Valencia
- Estructura por confirmar (necesito explorar la BD)

### Archivos ya analizados
- Tienda Artigas (Caracas): 22-Nov-2025 a 28-Ene-2026 (~66 días)
- Tienda Paraiso (Caracas): 6-Dic-2025 a 1-Feb-2026 (~53 días)

### Eventos especiales a considerar
- Crisis política 3-Ene-2026 (compras de pánico)
- Datos incompletos: 23-Ene y 28-Ene (excluir del entrenamiento)
- Período de adopción de tiendas nuevas (~primeras 4-8 semanas)

---

## Métricas Objetivo

| Período | MAPE Target | MAPE Aceptable |
|---------|-------------|----------------|
| Tienda madura | < 15% | < 25% |
| Tienda nueva (semanas 1-4) | < 35% | < 45% |
| Tienda nueva (semanas 5+) | < 25% | < 35% |

**MAPE** = Mean Absolute Percentage Error = Promedio(|Real - Predicho| / Real) × 100

---

## Plan de Trabajo (6 semanas hasta 14-Mar)

### Semana 1 (3-7 Feb): Extracción de datos
- Conectar a BD local
- Extraer ventas diarias de 5 tiendas maduras (2 años)
- Documentar holidays/eventos

### Semana 2 (10-14 Feb): Análisis de patrones
- Entrenar modelo Prophet individual por tienda
- Extraer componentes (semanal, quincenal, anual)
- Calcular similitud entre tiendas (clustering)
- Definir patrones globales vs por grupo

### Semana 3 (17-21 Feb): Curva de adopción
- Normalizar ventas de Artigas y Paraiso
- Ajustar curva de crecimiento
- Estimar semanas hasta estabilización

### Semana 4 (24-28 Feb): Modelo combinado
- Prophet con patrones de Valencia
- Agregar regresor de adopción
- Validar con datos de Caracas

### Semana 5 (3-7 Mar): Validación
- Backtesting
- Ajustar hiperparámetros
- Documentar limitaciones

### Semana 6 (10-14 Mar): Producción
- Forecast para tienda #3
- Integrar en FluxionIA
- Documentación

---

## Lo Que Necesito Hacer Ahora

1. **Explorar la BD local** para entender estructura de tablas de ventas
2. **Extraer datos** de 5 tiendas maduras de Valencia (2 años)
3. **Entrenar Prophet** con data real madura
4. **Evaluar métricas** para ver si el approach tiene sentido
5. **Comparar patrones** entre tiendas

---

## Código Base para Prophet

```python
from prophet import Prophet
import pandas as pd
import numpy as np

# Función para crear efecto quincena
def crear_efecto_quincena(df):
    """
    Calcula el efecto quincena basado en fechas exactas.
    Quincenas: día 15 y último día del mes.
    """
    quincenas = pd.date_range(start=df['ds'].min() - pd.Timedelta(days=30),
                               end=df['ds'].max() + pd.Timedelta(days=30),
                               freq='SM')  # Semi-monthly
    
    efectos = []
    for fecha in df['ds']:
        # Encontrar quincena más reciente
        quincenas_pasadas = quincenas[quincenas <= fecha]
        if len(quincenas_pasadas) == 0:
            efectos.append(0.0)
            continue
        
        ultima_quincena = quincenas_pasadas[-1]
        dias_desde = (fecha - ultima_quincena).days
        
        if dias_desde > 5:
            efectos.append(0.0)
            continue
        
        # Curva de efecto descubierta
        curva = {0: 1.0, 1: 1.3, 2: 1.5, 3: 1.4, 4: 1.1, 5: 0.5}
        efecto = curva.get(dias_desde, 0)
        
        # Amplificar si es sábado
        if fecha.weekday() == 5:
            efecto *= 1.7
        
        efectos.append(efecto)
    
    return efectos

# Holidays de Venezuela (plantilla)
holidays_venezuela = pd.DataFrame({
    'holiday': ['carnaval', 'carnaval', 'jueves_santo', 'viernes_santo', 
                'nochebuena', 'navidad', 'nochevieja', 'año_nuevo'],
    'ds': pd.to_datetime(['2025-03-03', '2025-03-04', '2025-04-17', '2025-04-18',
                          '2025-12-24', '2025-12-25', '2025-12-31', '2026-01-01']),
    'lower_window': [0, 0, 0, 0, 0, 0, 0, 0],
    'upper_window': [0, 0, 0, 0, 0, 0, 0, 0],
})

# Modelo base
def crear_modelo_tienda(df, incluir_anual=True):
    """
    Crea modelo Prophet para una tienda.
    df debe tener columnas: ds (fecha), y (ventas)
    """
    model = Prophet(
        seasonality_mode='multiplicative',
        yearly_seasonality=incluir_anual,  # Solo si hay 2+ años
        weekly_seasonality=True,
        daily_seasonality=False,
        holidays=holidays_venezuela,
        changepoint_prior_scale=0.1,
    )
    
    # Agregar efecto quincena
    df['efecto_quincena'] = crear_efecto_quincena(df)
    model.add_regressor('efecto_quincena', mode='multiplicative')
    
    return model, df

# Evaluar modelo
def evaluar_modelo(df_real, forecast):
    """Calcula MAPE y otras métricas"""
    merged = df_real.merge(forecast[['ds', 'yhat']], on='ds')
    merged['error_pct'] = np.abs((merged['y'] - merged['yhat']) / merged['y']) * 100
    
    mape = merged['error_pct'].mean()
    mae = np.abs(merged['y'] - merged['yhat']).mean()
    
    return {
        'mape': mape,
        'mae': mae,
        'n_dias': len(merged)
    }
```

---

## Preguntas Pendientes por Resolver

1. ¿Cuántos productos clase A hay? (para decidir si forecast individual o por categoría)
2. ¿Qué estructura tiene la BD de ventas? (tablas, campos)
3. ¿Hay datos de recepciones/inventario para detectar demanda censurada?
4. ¿Los holidays de Venezuela están correctos en la BD?

---

## Contexto Adicional

### Por qué NO usar IA Generativa para el forecast
- Prophet es determinístico (mismo input = mismo output)
- Mucho más barato para 40,000+ predicciones
- Explicable: "subió porque es quincena + sábado"
- IA Generativa sí sirve para: interpretar resultados, asistente para usuarios, detectar contexto externo

### Sobre agentes autónomos (futuro)
- Hoy el 80% de pedidos sugeridos se aprueban sin cambios
- El 20% se cambia por: inventario incorrecto o evento desconocido
- Cuando los datos de inventario sean confiables, se podría automatizar más
- Por ahora el humano sigue siendo necesario como capa de validación

---

## Cómo Continuar

1. Muéstrame la estructura de tu BD de ventas
2. Hagamos un query para extraer 2 años de una tienda madura
3. Entrenamos Prophet y evaluamos
4. Iteramos según los resultados

¿Cuál es la conexión a tu BD Docker? ¿PostgreSQL, MySQL, otro?
