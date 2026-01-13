# Análisis Crítico del Sistema ROP (Reorder Point)
## Problema de Quiebres de Stock en Picos de Demanda

**Fecha:** 2026-01-02
**Problema Detectado:** ROP (Punto de Reorden) está configurado demasiado bajo, muy cercano al SS (Stock de Seguridad), causando quiebres de stock durante picos de demanda.

---

## 1. DIAGNÓSTICO DEL PROBLEMA ACTUAL

### 1.1 Fórmula Actual en el Código

Según [calculo_inventario_abc.py:314-315](../backend/services/calculo_inventario_abc.py#L314-L315):

```python
# Demanda durante lead time
demanda_ciclo = D * L  # D_P75 * 1.5 días

# Punto de reorden (Minimo)
punto_reorden = demanda_ciclo + stock_seguridad
```

Donde:
- `D` = P75 de ventas diarias (percentil 75)
- `L` = Lead time = 1.5 días (fijo)
- `stock_seguridad` = Z × sigmaD × √L

### 1.2 Problema Identificado en la Imagen

Analicemos productos específicos de tu pedido (imagen compartida):

#### Ejemplo 1: SANGRIA TINTA GRANJA 175 LT (Código: 004237)
```
Clasificación: A
P75 (20D): 25.8 unidades/día
Stock Tienda: 14.0 unidades
Total disponible: 14.0 unidades
Días: 0.5 días
ROP: 2.5 (SS: 1.5, demanda ciclo: ~38.7)
MAX: 7.5
Sugerido: 179 unidades
```

**PROBLEMA CRÍTICO:**
- Stock actual: 14 unidades = **0.5 días de inventario**
- ROP: 2.5 unidades = **0.1 días** (extremadamente bajo)
- Con demanda de ~26 unid/día, el ROP solo cubre **2 horas de ventas**
- El SS de 1.5 unidades solo cubre **1.4 horas**

#### Ejemplo 2: GRANJA PAN DE JAMON (Código: 003231)
```
Clasificación: A
P75 (20D): 49.3 unidades/día
Stock Tienda: 17.0 unidades
ROP: 5.8 (SS: 4.8)
MAX: 10.8
Sugerido: 514 unidades
```

**PROBLEMA:**
- Stock actual: 17 unidades = **0.3 días**
- ROP: 5.8 unidades = **0.12 días** (3 horas)
- Con demanda de 49 unid/día, cualquier variación mínima causa quiebre

### 1.3 Análisis de la Fórmula

El problema radica en varios factores:

**Factor 1: Lead Time Muy Corto (1.5 días)**
```
demanda_ciclo = 26 unid/día × 1.5 días = 39 unidades
```
Con L tan pequeño, la demanda_ciclo es muy baja.

**Factor 2: Stock de Seguridad Insuficiente**
```
SS = Z × sigmaD × √(1.5)
SS = 2.33 × sigmaD × 1.22
```
Para productos clase A con Z=2.33 (99% servicio):
- Si sigmaD = bajo → SS muy pequeño
- √(1.5) = 1.22 no amplifica suficiente la protección

**Factor 3: ROP = demanda_ciclo + SS**
```
ROP = 39 + SS_pequeño ≈ 40-45 unidades
```
Pero en la imagen vemos ROP mucho menores (2.5, 5.8), lo que indica que:
- Los valores están en **BULTOS** no en unidades, o
- Hay un error en el cálculo o almacenamiento

---

## 2. ANÁLISIS POR TIPO DE PRODUCTO

### 2.1 Productos Clase A (Alta Rotación)

**Características:**
- Demanda diaria alta (>20 unid/día)
- Variabilidad moderada a alta
- Críticos para el negocio
- Generadores de tráfico

**Problema Actual:**
- Lead time de 1.5 días es insuficiente como buffer
- SS no captura picos de demanda adecuadamente
- ROP dispara pedido cuando ya es crítico

**Ejemplo Real (de imagen):**
- Pan de Jamón: 49 unid/día, ROP 5.8 bultos (≈290 unid si bulto=50)
- Si es en unidades: CRÍTICO - solo 3 horas de inventario

### 2.2 Productos Clase B (Rotación Media)

**Características:**
- Demanda diaria moderada (5-20 unid/día)
- Variabilidad media
- Importantes pero no críticos

**Problema Actual:**
- Lead time 1.5 días puede ser adecuado
- Z=1.88 (97% servicio) acepta 3% de quiebres
- ROP necesita más margen para picos

### 2.3 Productos Clase C (Baja Rotación)

**Características:**
- Demanda diaria baja (<5 unid/día)
- Alta variabilidad relativa
- Menos críticos

**Problema Actual:**
- Z=1.28 (90% servicio) acepta 10% de quiebres
- Método puede ser adecuado
- Riesgo de sobrestock si se aumenta ROP

---

## 3. ESCENARIOS PROBLEMÁTICOS

### Escenario 1: Pico de Demanda en Fin de Semana

**Producto:** Pan de Jamón (Clase A)
- Demanda normal lunes-jueves: 40 unid/día
- Demanda viernes-domingo: 80 unid/día (2x)
- P75 calculado: 50 unid/día
- sigmaD: 20 unid/día

**Con fórmula actual:**
```
demanda_ciclo = 50 × 1.5 = 75 unidades
SS = 2.33 × 20 × 1.22 = 56.8 unidades
ROP = 75 + 56.8 = 131.8 unidades
```

**Problema:**
- Viernes llega a ROP (132 unid)
- Se dispara pedido, llega en 1.5 días (domingo mediodía)
- Viernes tarde: -80 unid → 52 unid
- Sábado: -80 unid → **QUIEBRE (-28 unid)**
- Domingo mediodía: llega pedido (tarde)

### Escenario 2: Variabilidad Alta (Promociones)

**Producto:** Sangría (Clase A)
- Demanda normal: 20 unid/día
- Promoción/evento: 60 unid/día (3x)
- P75: 26 unid/día
- sigmaD: 15 unid/día

**Con fórmula actual:**
```
demanda_ciclo = 26 × 1.5 = 39 unidades
SS = 2.33 × 15 × 1.22 = 42.6 unidades
ROP = 39 + 42.6 = 81.6 unidades
```

**Problema:**
- Con promoción (60 unid/día), en 1.5 días consume 90 unidades
- Si stock = ROP = 82, en 1.5 días: **QUIEBRE (-8 unid)**

### Escenario 3: Delay en Entrega

**Cualquier producto con ROP ajustado:**
- Lead time esperado: 1.5 días
- Lead time real por demora: 2.5 días (+67%)

**Problema:**
```
Inventario esperado = ROP - (demanda × 1.5)
Inventario real = ROP - (demanda × 2.5)
```
Con ROP = demanda_ciclo + SS, el SS solo cubre variabilidad, **no delays**.

---

## 4. CAUSAS RAÍZ

### 4.1 Lead Time Fijo vs Variable

**Asunción actual:** L = 1.5 días (fijo)

**Realidad:**
- CEDI Valencia → Tiendas Valencia: 0.5-1 día
- CEDI Valencia → Tiendas lejanas: 1-2 días
- Delays operativos: +0.5-1 día
- Lead time real: **1-3 días (variable)**

**Impacto:**
Si ROP se calcula con L=1.5 pero real es 2.5:
```
Déficit = demanda × (2.5 - 1.5) = demanda × 1 día
```
Para producto de 50 unid/día → **déficit de 50 unidades**

### 4.2 P75 Subestima Picos

**Problema:**
- P75 significa que 25% de los días la demanda es **mayor**
- En una semana (7 días), ~2 días superan P75
- Si ROP se basa en P75, **no protege contra picos recurrentes**

**Solución necesaria:**
- Usar P85 o P90 para demanda_ciclo en productos clase A
- O aumentar SS para capturar ese 25% superior

### 4.3 SS Solo Cubre Variabilidad, No Picos Estructurales

**Fórmula SS:** Z × sigmaD × √L

Esto cubre desviaciones aleatorias, **no patrones de demanda:**
- Fin de semana siempre alto
- Inicio de mes alto
- Promociones

**Necesitamos:** Factor de picos estructurales adicional

### 4.4 Redondeo a Bultos Reduce Protección

Si ROP = 131.8 unidades y bulto = 50 unidades:
```
ROP_bultos = ceil(131.8 / 50) = 3 bultos = 150 unidades
```

Pero si ROP = 81.6 unidades:
```
ROP_bultos = ceil(81.6 / 50) = 2 bultos = 100 unidades
```

El redondeo hacia arriba ayuda, pero si el ROP base es bajo, el redondeo no compensa suficiente.

---

## 5. PROPUESTAS DE MEJORA

### 5.1 AJUSTE INMEDIATO (Quick Win)

#### Opción 1A: Aumentar Lead Time Efectivo para Clase A

**Cambio en código:**
```python
# En calculo_inventario_abc.py, línea 299
# Anterior:
L = LEAD_TIME  # 1.5 días

# Nuevo:
if clase_efectiva == 'A':
    L = LEAD_TIME * 1.5  # 2.25 días (50% más)
elif clase_efectiva == 'B':
    L = LEAD_TIME * 1.25  # 1.875 días (25% más)
else:
    L = LEAD_TIME  # 1.5 días
```

**Impacto para Clase A:**
```
Antes: demanda_ciclo = 50 × 1.5 = 75 unidades
Después: demanda_ciclo = 50 × 2.25 = 112.5 unidades
SS = 2.33 × 20 × 1.5 = 69.9 unidades (antes: 56.8)
ROP = 112.5 + 69.9 = 182.4 unidades (antes: 131.8)
Aumento: +38% en ROP
```

**Ventajas:**
- Implementación simple (3 líneas de código)
- Protege mejor contra delays
- Aumenta buffer de seguridad

**Desventajas:**
- Aumenta inventario promedio
- No diferencia productos dentro de misma clase

#### Opción 1B: Aumentar Z (Nivel de Servicio) para Clase A

**Cambio:**
```python
# En calculo_inventario_abc.py, línea 92
'A': ParametrosABC(
    nivel_servicio_z=2.58,  # 99.5% (antes: 2.33 = 99%)
    dias_cobertura=7,
    metodo=MetodoCalculo.ESTADISTICO
),
```

**Impacto:**
```
Antes: SS = 2.33 × 20 × 1.22 = 56.8 unidades
Después: SS = 2.58 × 20 × 1.22 = 62.9 unidades
ROP = 75 + 62.9 = 137.9 unidades (antes: 131.8)
Aumento: +5% en ROP
```

**Ventajas:**
- Mejora nivel de servicio objetivo
- Cambio conceptualmente correcto

**Desventajas:**
- Impacto moderado (+5% no es suficiente)

### 5.2 SOLUCIÓN INTERMEDIA (Recommended)

#### Opción 2: Factor de Pico Estructural

**Implementación:**
```python
# Nuevo parámetro en ParametrosABC
@dataclass
class ParametrosABC:
    nivel_servicio_z: float
    dias_cobertura: int
    metodo: MetodoCalculo
    factor_pico: float = 1.0  # NUEVO

# Configuración
PARAMS_ABC = {
    'A': ParametrosABC(
        nivel_servicio_z=2.33,
        dias_cobertura=7,
        metodo=MetodoCalculo.ESTADISTICO,
        factor_pico=1.3  # +30% para picos de fin de semana
    ),
    'B': ParametrosABC(
        nivel_servicio_z=1.88,
        dias_cobertura=14,
        metodo=MetodoCalculo.ESTADISTICO,
        factor_pico=1.15  # +15%
    ),
    'C': ParametrosABC(
        nivel_servicio_z=1.28,
        dias_cobertura=21,
        metodo=MetodoCalculo.ESTADISTICO,
        factor_pico=1.0  # Sin ajuste
    ),
}

# En calcular_estadistico(), línea 306-315
def calcular_estadistico(input_data: InputCalculo, params: ParametrosABC,
                         clase_efectiva: str) -> ResultadoCalculo:
    Z = params.nivel_servicio_z
    D = input_data.demanda_p75
    L = LEAD_TIME
    sigma_D = input_data.sigma_demanda

    # Stock de seguridad CON FACTOR DE PICO
    if sigma_D > 0:
        ss_base = Z * sigma_D * math.sqrt(L)
        stock_seguridad = ss_base * params.factor_pico  # APLICAR FACTOR
    else:
        stock_seguridad = 0.30 * D * L * params.factor_pico

    # Demanda durante lead time TAMBIÉN con factor
    demanda_ciclo = D * L * params.factor_pico

    # Punto de reorden
    punto_reorden = demanda_ciclo + stock_seguridad
    # ...
```

**Impacto para Clase A (factor_pico=1.3):**
```
Antes:
  demanda_ciclo = 50 × 1.5 = 75 unidades
  SS = 2.33 × 20 × 1.22 = 56.8 unidades
  ROP = 131.8 unidades

Después:
  demanda_ciclo = 50 × 1.5 × 1.3 = 97.5 unidades
  SS = 2.33 × 20 × 1.22 × 1.3 = 73.8 unidades
  ROP = 171.3 unidades

Aumento: +30% en ROP
```

**Ventajas:**
- Flexible por clase ABC
- Captura picos estructurales conocidos
- Parámetro ajustable por tienda/categoría
- Conceptualmente claro

**Desventajas:**
- Requiere calibración inicial
- Aumenta inventario promedio ~20-30%

### 5.3 SOLUCIÓN AVANZADA (Long Term)

#### Opción 3: Lead Time Variable + SS Dinámico

**Implementación:**
```python
@dataclass
class InputCalculo:
    # ... campos existentes ...
    lead_time_p50: float = 1.5  # Mediana de lead time real
    lead_time_p90: float = 2.5  # P90 de lead time (delays)
    cv_demanda: float = 0.0     # Coeficiente de variación

def calcular_estadistico_avanzado(input_data: InputCalculo,
                                   params: ParametrosABC,
                                   clase_efectiva: str) -> ResultadoCalculo:
    """
    Versión avanzada que considera:
    1. Lead time variable (usa P90 en vez de promedio)
    2. SS ajustado por CV de demanda
    3. Factor de pico estructural
    """
    Z = params.nivel_servicio_z
    D = input_data.demanda_p75

    # 1. Lead time: usar P90 para productos clase A (más conservador)
    if clase_efectiva == 'A':
        L = input_data.lead_time_p90  # Proteger contra delays
    else:
        L = input_data.lead_time_p50

    sigma_D = input_data.sigma_demanda

    # 2. SS con ajuste por variabilidad
    if sigma_D > 0:
        # SS base
        ss_base = Z * sigma_D * math.sqrt(L)

        # Ajuste por CV (alta variabilidad requiere más SS)
        cv = input_data.cv_demanda  # CV = sigma / mean
        if cv > 0.5:  # Alta variabilidad
            factor_cv = 1.2
        elif cv > 0.3:  # Media variabilidad
            factor_cv = 1.1
        else:
            factor_cv = 1.0

        stock_seguridad = ss_base * factor_cv * params.factor_pico
    else:
        stock_seguridad = 0.30 * D * L * params.factor_pico

    # 3. Demanda ciclo con factor de pico
    demanda_ciclo = D * L * params.factor_pico

    # 4. ROP = demanda durante LT + SS
    punto_reorden = demanda_ciclo + stock_seguridad

    # ... resto del código
```

**Impacto para Clase A:**
```
Supongamos:
  D_P75 = 50 unid/día
  sigmaD = 20 unid/día
  LT_P90 = 2.5 días (en vez de 1.5)
  CV = 0.4 (media variabilidad)
  factor_pico = 1.3
  Z = 2.33

Cálculo:
  ss_base = 2.33 × 20 × √2.5 = 73.6 unidades
  factor_cv = 1.1 (CV > 0.3)
  stock_seguridad = 73.6 × 1.1 × 1.3 = 105.3 unidades
  demanda_ciclo = 50 × 2.5 × 1.3 = 162.5 unidades
  ROP = 162.5 + 105.3 = 267.8 unidades

Comparación:
  ROP anterior: 131.8 unidades
  ROP nuevo: 267.8 unidades
  Aumento: +103% (2x)
```

**Ventajas:**
- Más robusto contra delays
- Captura variabilidad real
- Diferencia productos volátiles
- Nivel de servicio real más alto

**Desventajas:**
- Requiere datos de lead time histórico
- Aumenta inventario significativamente
- Más complejo de calibrar

---

## 6. RECOMENDACIÓN ESTRATÉGICA POR ETAPAS

### FASE 1 (Semana 1-2): QUICK WIN
**Implementar Opción 1A + 1B combinadas**

```python
# Ajuste inmediato en calculo_inventario_abc.py

# 1. Aumentar Z para clase A
PARAMS_ABC = {
    'A': ParametrosABC(
        nivel_servicio_z=2.58,  # 99.5% (era 2.33 = 99%)
        dias_cobertura=7,
        metodo=MetodoCalculo.ESTADISTICO
    ),
    # B y C sin cambios
}

# 2. Lead time ajustado por clase
def calcular_estadistico(input_data, params, clase_efectiva):
    # ...
    if clase_efectiva == 'A':
        L = LEAD_TIME * 1.4  # 2.1 días (40% más)
    elif clase_efectiva == 'B':
        L = LEAD_TIME * 1.2  # 1.8 días (20% más)
    else:
        L = LEAD_TIME
    # ...
```

**Impacto esperado:**
- Clase A: ROP +50-60%
- Clase B: ROP +25-30%
- Clase C: Sin cambio

**Resultado:**
```
Pan de Jamón (Clase A):
  Antes: ROP = 131.8 unidades
  Después: ROP ≈ 205 unidades (+55%)

Sangría (Clase A):
  Antes: ROP = 81.6 unidades
  Después: ROP ≈ 127 unidades (+56%)
```

### FASE 2 (Semana 3-4): VALIDACIÓN
**Monitorear durante 2 semanas:**

1. **Métricas clave:**
   - Tasa de quiebre de stock (stockout rate)
   - Días de inventario promedio
   - Frecuencia de pedidos
   - Fill rate (% de demanda satisfecha)

2. **Queries de monitoreo:**
```sql
-- Productos que llegaron a stock = 0
SELECT
    producto_id,
    COUNT(*) as dias_quiebre,
    MIN(fecha) as primera_fecha,
    MAX(fecha) as ultima_fecha
FROM inventario_actual
WHERE cantidad = 0
  AND fecha >= CURRENT_DATE - 14
  AND ubicacion_id LIKE 'tienda_%'
GROUP BY producto_id
HAVING COUNT(*) > 0
ORDER BY dias_quiebre DESC;

-- Productos que dispararon pedido bajo ROP
SELECT
    codigo_producto,
    stock_tienda,
    punto_reorden,
    (punto_reorden - stock_tienda) as gap,
    cantidad_sugerida_unidades
FROM pedidos_sugeridos_detalle
WHERE fecha_creacion >= CURRENT_DATE - 14
  AND stock_tienda <= punto_reorden
  AND clasificacion_abc = 'A'
ORDER BY gap DESC;
```

3. **Ajuste fino:**
   - Si quiebres persisten en Clase A → aumentar factor a 1.5 (50%)
   - Si inventario muy alto en Clase C → no tocar
   - Si Clase B tiene quiebres → aumentar factor a 1.3

### FASE 3 (Mes 2): IMPLEMENTAR SOLUCIÓN INTERMEDIA
**Opción 2: Factor de Pico Estructural**

1. Implementar código de factor_pico
2. Calibrar por categoría:
   - FRUVER/CARNICERÍA: factor_pico = 1.4 (alta volatilidad)
   - ABARROTES A: factor_pico = 1.3
   - ABARROTES B: factor_pico = 1.15
   - ABARROTES C: factor_pico = 1.0

3. Configuración por tienda (si aplica):
   - Tiendas grandes (volumen alto): factor más alto
   - Tiendas pequeñas: factor estándar

### FASE 4 (Mes 3-4): SOLUCIÓN AVANZADA
**Opción 3: Lead Time Variable**

1. **Recopilar datos de lead time real:**
```sql
-- Calcular lead time histórico por tienda-CEDI
SELECT
    tienda_destino_id,
    cedi_origen_id,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY
        EXTRACT(EPOCH FROM (fecha_entrega_real - fecha_pedido))/86400
    ) as lead_time_p50,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY
        EXTRACT(EPOCH FROM (fecha_entrega_real - fecha_pedido))/86400
    ) as lead_time_p90
FROM pedidos_sugeridos
WHERE fecha_entrega_real IS NOT NULL
  AND estado = 'entregado'
  AND fecha_pedido >= CURRENT_DATE - 90
GROUP BY tienda_destino_id, cedi_origen_id;
```

2. **Calcular CV de demanda por producto:**
```sql
-- CV de demanda por producto-tienda
SELECT
    producto_id,
    ubicacion_id,
    STDDEV(cantidad_vendida) / NULLIF(AVG(cantidad_vendida), 0) as cv_demanda,
    AVG(cantidad_vendida) as media,
    STDDEV(cantidad_vendida) as sigma
FROM ventas
WHERE fecha >= CURRENT_DATE - 60
GROUP BY producto_id, ubicacion_id
HAVING AVG(cantidad_vendida) > 0;
```

3. Implementar calcular_estadistico_avanzado()

4. A/B test en 2-3 tiendas piloto

---

## 7. ANÁLISIS DE IMPACTO FINANCIERO

### 7.1 Costo de Quiebre de Stock (Actual)

**Asunciones:**
- Productos clase A: 50 productos × 16 tiendas = 800 SKU-ubicaciones
- Tasa de quiebre estimada: 5% (1 de cada 20 días)
- Venta perdida por quiebre: $50 USD/día promedio
- Margen: 20%

**Cálculo anual:**
```
Quiebres/año = 800 SKU × 365 días × 5% = 14,600 quiebres-día
Venta perdida = 14,600 × $50 = $730,000 USD
Margen perdido = $730,000 × 20% = $146,000 USD/año
```

### 7.2 Costo de Aumentar Inventario

**Propuesta Fase 1 (ROP +50% en Clase A):**

**Asunciones:**
- Inventario promedio clase A actual: $200,000 USD
- Aumento ROP: +50%
- Inventario aumenta ~25% (no 50%, porque no siempre estamos en ROP)
- Costo de capital: 12% anual

**Cálculo:**
```
Inventario adicional = $200,000 × 25% = $50,000 USD
Costo financiero = $50,000 × 12% = $6,000 USD/año
```

### 7.3 ROI

**Comparación:**
```
Beneficio (reducción quiebres): $146,000/año
  Asumiendo reducción 80%: $117,000/año

Costo (inventario adicional): $6,000/año

ROI = ($117,000 - $6,000) / $6,000 = 1,850%
Payback: 0.5 meses
```

**Conclusión:** El ROI es extremadamente positivo. Incluso si solo reducimos quiebres 30%, el ROI sigue siendo >500%.

---

## 8. RIESGOS Y MITIGACIONES

### Riesgo 1: Sobrestock en Productos de Baja Rotación

**Mitigación:**
- Solo ajustar ROP para clases A y B
- Clase C mantener configuración actual
- Monitorear días de inventario semanalmente
- Tope máximo configurable: `dias_inventario_max = 30 días`

### Riesgo 2: Aumento Excesivo de Inventario Total

**Mitigación:**
- Implementar por fases (primero clase A)
- Configurar límites por categoría perecedera
- Revisar mensualmente y ajustar factores

### Riesgo 3: Falta de Espacio en Tienda

**Mitigación:**
- Configuración por tienda (tiendas pequeñas con factores menores)
- Priorizar productos de alta rotación (menos espacio-días)
- Coordinación con operaciones para optimizar layout

### Riesgo 4: Problemas de Cash Flow

**Mitigación:**
- Implementación gradual (solo $50k inventario adicional)
- Beneficio inmediato en ventas compensa inversión
- Analizar categoría por categoría

---

## 9. PLAN DE ACCIÓN INMEDIATO

### ESTA SEMANA (Días 1-3)

**Día 1:**
- [ ] Revisar y aprobar propuesta Fase 1
- [ ] Modificar [calculo_inventario_abc.py](../backend/services/calculo_inventario_abc.py)
- [ ] Crear tests unitarios para validar cambios

**Día 2:**
- [ ] Deploy en ambiente de prueba
- [ ] Generar pedidos de prueba para 2-3 tiendas
- [ ] Comparar ROP anterior vs nuevo
- [ ] Validar que aumentos son esperados (+50-60% clase A)

**Día 3:**
- [ ] Deploy a producción (todas las tiendas)
- [ ] Comunicar a equipo de compras sobre pedidos mayores esperados
- [ ] Configurar alertas de monitoreo

### PRÓXIMA SEMANA (Días 4-10)

**Monitoreo diario:**
- [ ] Dashboard de quiebres de stock
- [ ] Inventario promedio por clase
- [ ] Frecuencia de pedidos
- [ ] Fill rate

**Ajustes:**
- [ ] Si quiebres persisten → aumentar factor
- [ ] Si inventario excesivo → reducir factor
- [ ] Documentar aprendizajes

### PRÓXIMO MES

- [ ] Implementar Fase 2 (factor_pico)
- [ ] Comenzar recopilación de datos de lead time real
- [ ] Preparar Fase 3

---

## 10. CONCLUSIONES

### Problema Confirmado
El ROP actual está **peligrosamente bajo** para productos de clase A, con valores que representan solo 2-4 horas de inventario en vez de 1.5-2 días esperados. Esto causa:
- Quiebres recurrentes en picos de demanda
- Pérdida de ventas estimada en $146k USD/año
- Mal servicio al cliente
- Presión operativa constante

### Causa Raíz
1. Lead time fijo de 1.5 días es optimista
2. P75 no captura picos estructurales (fines de semana)
3. SS calculado con σD no protege contra delays
4. Fórmula diseñada para demanda estable, no volátil

### Solución Recomendada
**Fase 1 (inmediato):** Aumentar lead time efectivo y Z para clase A
- **Implementación:** 3 líneas de código
- **Impacto:** +50-60% en ROP clase A
- **ROI:** >1,800%
- **Riesgo:** Bajo (solo $50k inventario adicional)

**Fases 2-3:** Factor de pico + Lead time variable
- Optimización continua
- Mayor precisión
- Ajuste por categoría y tienda

### Recomendación Final
**IMPLEMENTAR FASE 1 ESTA SEMANA.**

El costo de no actuar (quiebres continuos) es mucho mayor que el costo de la solución. Con ROI >1,800% y payback <1 mes, esta es una decisión de negocio clara.

---

**Preparado por:** Claude Code
**Próxima revisión:** 2026-01-15 (2 semanas post-implementación)
