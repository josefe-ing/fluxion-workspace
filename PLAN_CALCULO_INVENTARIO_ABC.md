# Plan de Implementación: Nueva Metodología de Cálculo de Inventario ABC

## Resumen Ejecutivo

Implementar la metodología de cálculo de **Mínimos, Punto de Reorden, Stock de Seguridad y Máximos** diferenciada por clase ABC. El sistema debe:
1. Usar fórmulas estadísticas para Clase A/B y heurística "Padre Prudente" para Clase C
2. **Tratar Generadores de Tráfico como Clase A** (independiente de su clasificación ABC real)
3. **Redondear siempre al bulto completo** (restricción operativa crítica)
4. Incluir sanity checks para validar resultados
5. Usar P75 como base de demanda (ya calculado)

---

## Contexto Operativo La Granja

| Parámetro | Valor |
|-----------|-------|
| **Lead Time** | 1.5 días (fijo, CEDI cercano) |
| **Frecuencia de Pedidos** | Diaria (todos los días se hace pedido) |
| **Unidad de Despacho** | Bultos completos (NO se pueden enviar unidades sueltas) |
| **Ventana de Análisis σD** | 30 días máximo |
| **Base de Demanda** | P75 (ya calculado en sistema actual) |

---

## Generadores de Tráfico: Tratamiento Especial

### ¿Qué son?

Productos que venden poco en $ pero aparecen en muchos tickets. Son críticos para la experiencia del cliente porque:
- Si faltan, **el cliente puede abandonar toda la compra**
- Aunque son clase C por valor, tienen alta frecuencia de compra

### Identificación (Sistema Existente)

El sistema ya identifica estos productos mediante el **GAP Score**:

```
GAP = rank_venta - rank_penetracion
```

- **rank_venta**: Posición ordenada por monto de ventas
- **rank_penetracion**: Posición ordenada por cantidad de tickets

**Ejemplo:** Producto en puesto #1500 por ventas pero #700 por tickets = GAP +800

Un GAP > 400 indica que el producto es buscado activamente por clientes.

### Fuente de Datos

```sql
-- Campo en tabla productos
productos.es_generador_trafico = TRUE

-- O desde cache ABC
productos_abc_cache.gap >= 400
```

### Regla de Cálculo

**Los Generadores de Tráfico SIEMPRE se calculan como Clase A**, sin importar su clasificación ABC real:

```python
# Determinar clase efectiva para cálculo
if es_generador_trafico:
    clase_efectiva = 'A'  # Forzar tratamiento clase A
else:
    clase_efectiva = clase_abc  # Usar clasificación normal
```

Esto garantiza:
- Nivel de servicio 98-99%
- Stock de seguridad estadístico completo
- Alta rotación (7 días cobertura máxima)

---

## 1. Estado Actual vs Propuesto

### 1.1 Sistema Actual (Multiplicadores Fijos)

**Archivo:** [pedidos_sugeridos.py:1054-1072](backend/routers/pedidos_sugeridos.py#L1054-L1072)

```python
# Problema: multiplicadores arbitrarios sin base estadística
if clasificacion == 'A':
    mult_min, mult_seg, mult_max = 2.0, 1.0, 5.0
elif clasificacion == 'B':
    mult_min, mult_seg, mult_max = 3.0, 2.0, 12.0
elif clasificacion == 'C':
    mult_min, mult_seg, mult_max = 5.0, 3.0, 15.0
```

### 1.2 Sistema Propuesto

| Clase | Fórmula Stock Seguridad | Fórmula Mínimo (ROP) | Días Cobertura Max |
|-------|-------------------------|----------------------|---------------------|
| **A** | $SS_A = Z \times \sigma_D \times \sqrt{L}$ | $Min_A = (D_{P75} \times L) + SS_A$ | **7 días** (1 semana) |
| **B** | $SS_B = Z \times \sigma_D \times \sqrt{L}$ | $Min_B = (D_{P75} \times L) + SS_B$ | **14 días** (2 semanas) |
| **C** | N/A (Heurístico) | $Min_C = D_{max} \times L$ | **30+ días** (1 mes) |

**Nota:** Para A y B usamos fórmula simplificada (sin σL) porque el lead time es **fijo en 1.5 días**.

---

## 2. Restricción Crítica: Redondeo a Bultos

### El Problema

```
Ejemplo: Harina de Maíz Blanca (004962)
- Unidades por bulto: 20
- Cálculo da: 12 unidades sugeridas
- NO SE PUEDE enviar 12 unidades sueltas
- Mínimo a enviar: 20 unidades (1 bulto) o 0
```

### La Solución: Siempre Redondear Hacia Arriba

```python
def redondear_a_bultos(cantidad_unidades: float, unidades_por_bulto: int) -> int:
    """
    Redondea la cantidad sugerida al bulto completo hacia arriba.

    Si hay que pedir, siempre se redondea hacia arriba (ceil).
    No hay excepciones.
    """
    if cantidad_unidades <= 0:
        return 0

    return math.ceil(cantidad_unidades / unidades_por_bulto)
```

### Impacto en Fórmulas

Todos los parámetros deben calcularse y **luego** redondearse:

```python
# Cálculo en unidades (preciso)
stock_minimo_unid = demanda_ciclo + stock_seguridad
stock_maximo_unid = stock_minimo_unid + (demanda_diaria * dias_cobertura)

# Conversión a bultos (redondeado)
stock_minimo_bultos = math.ceil(stock_minimo_unid / unidades_por_bulto)
stock_maximo_bultos = math.ceil(stock_maximo_unid / unidades_por_bulto)

# Cantidad a pedir (en bultos completos)
deficit_unidades = max(0, stock_maximo_unid - stock_actual_unid)
cantidad_pedir_bultos = math.ceil(deficit_unidades / unidades_por_bulto)
```

---

## 3. Parámetros de Configuración Ajustados

```python
# Constantes fijas para La Granja
LEAD_TIME = 1.5  # días (fijo, CEDI cercano)
VENTANA_SIGMA_D = 30  # días para calcular desviación estándar

PARAMETROS_ABC = {
    'A': {
        'nivel_servicio_z': 2.33,      # 99% nivel de servicio (rango 98-99%)
        'dias_cobertura': 7,            # 1 semana de inventario máximo
        'metodo': 'estadistico',
        'descripcion': 'Alto valor - rotación rápida, máxima disponibilidad'
    },
    'B': {
        'nivel_servicio_z': 1.88,      # 97% nivel de servicio (rango 94-97%)
        'dias_cobertura': 14,           # 2 semanas de inventario máximo
        'metodo': 'estadistico',
        'descripcion': 'Valor medio - balance entre rotación y cobertura'
    },
    'C': {
        'nivel_servicio_z': 0.0,       # No aplica (heurístico)
        'dias_cobertura': 30,           # 1 mes de inventario máximo
        'metodo': 'padre_prudente',     # D_max × L
        'descripcion': 'Bajo valor - cobertura amplia, minimizar gestión'
    }
}

# Tabla de referencia Z-score
# 94% → Z = 1.55
# 95% → Z = 1.65
# 96% → Z = 1.75
# 97% → Z = 1.88
# 98% → Z = 2.05
# 99% → Z = 2.33
```

---

## 4. Sanity Checks (Validaciones de Cordura)

### 4.1 Validaciones Pre-Cálculo

```python
def validar_inputs(demanda_p75: float, sigma_d: float, d_max: float,
                   unidades_por_bulto: int) -> List[str]:
    """Valida que los inputs tengan sentido antes de calcular."""
    errores = []

    # σD no puede ser mayor que el promedio (CV > 1 es muy raro)
    if sigma_d > demanda_p75 * 2:
        errores.append(f"σD={sigma_d:.1f} parece excesivo vs P75={demanda_p75:.1f}")

    # D_max no puede ser absurdamente mayor que P75
    if d_max > demanda_p75 * 10:
        errores.append(f"D_max={d_max:.1f} es >10x P75={demanda_p75:.1f}, verificar outliers")

    # Unidades por bulto debe ser razonable
    if unidades_por_bulto <= 0 or unidades_por_bulto > 1000:
        errores.append(f"unidades_por_bulto={unidades_por_bulto} fuera de rango")

    return errores
```

### 4.2 Validaciones Post-Cálculo

```python
def sanity_check_resultado(resultado: ResultadoCalculo, demanda_p75: float,
                           clase_abc: str, unidades_por_bulto: int) -> List[str]:
    """Valida que el resultado calculado tenga sentido operativo."""
    warnings = []

    # Stock mínimo no puede ser menor a 1 día de venta
    if resultado.stock_minimo < demanda_p75 * 1.0:
        warnings.append(f"Stock mínimo ({resultado.stock_minimo:.0f}) < 1 día de venta")

    # Stock máximo no debería ser > 60 días para clase A
    dias_cobertura_max = resultado.stock_maximo / demanda_p75 if demanda_p75 > 0 else 0
    if clase_abc == 'A' and dias_cobertura_max > 15:
        warnings.append(f"Clase A con {dias_cobertura_max:.0f} días cobertura (debería ser ~7)")

    # Stock de seguridad no puede ser negativo
    if resultado.stock_seguridad < 0:
        warnings.append("Stock de seguridad negativo - ajustando a 0")

    # El máximo debe ser mayor que el mínimo
    if resultado.stock_maximo <= resultado.stock_minimo:
        warnings.append("Stock máximo <= mínimo - revisar parámetros")

    # Cantidad sugerida debe ser múltiplo del bulto
    if resultado.cantidad_sugerida_unid % unidades_por_bulto != 0:
        warnings.append(f"Cantidad {resultado.cantidad_sugerida_unid} no es múltiplo de bulto ({unidades_por_bulto})")

    return warnings
```

### 4.3 Validación de Razonabilidad por Clase

```python
RANGOS_ESPERADOS = {
    'A': {
        'dias_cobertura_min': (2, 10),      # Entre 2 y 10 días
        'dias_cobertura_max': (5, 15),      # Entre 5 y 15 días
        'ss_como_pct_demanda': (0.2, 1.5),  # SS entre 20% y 150% de demanda diaria
    },
    'B': {
        'dias_cobertura_min': (3, 15),
        'dias_cobertura_max': (10, 30),
        'ss_como_pct_demanda': (0.3, 2.0),
    },
    'C': {
        'dias_cobertura_min': (5, 20),
        'dias_cobertura_max': (20, 60),
        'ss_como_pct_demanda': (0.5, 5.0),  # Más holgado por ser heurístico
    }
}

def validar_rangos_esperados(resultado: ResultadoCalculo, demanda_p75: float,
                              clase_abc: str) -> List[str]:
    """Valida que los resultados estén en rangos esperados por clase."""
    warnings = []
    rangos = RANGOS_ESPERADOS.get(clase_abc, RANGOS_ESPERADOS['B'])

    if demanda_p75 > 0:
        dias_min = resultado.stock_minimo / demanda_p75
        dias_max = resultado.stock_maximo / demanda_p75
        ss_pct = resultado.stock_seguridad / demanda_p75

        rango_min = rangos['dias_cobertura_min']
        if not (rango_min[0] <= dias_min <= rango_min[1]):
            warnings.append(f"Días cobertura mínimo ({dias_min:.1f}) fuera de rango esperado {rango_min}")

        rango_max = rangos['dias_cobertura_max']
        if not (rango_max[0] <= dias_max <= rango_max[1]):
            warnings.append(f"Días cobertura máximo ({dias_max:.1f}) fuera de rango esperado {rango_max}")

    return warnings
```

---

## 5. Implementación Detallada

### 5.1 Módulo de Cálculo

**Nuevo archivo:** `backend/services/calculo_inventario_abc.py`

```python
"""
Módulo de cálculo de parámetros de inventario por clasificación ABC.
Versión ajustada para La Granja Mercado.

Características:
- Lead time fijo: 1.5 días
- Pedidos diarios
- Despacho solo en bultos completos
- Usa P75 como base de demanda
- Incluye sanity checks
"""
import math
from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum

# Constantes operativas La Granja
LEAD_TIME = 1.5  # días (fijo)
VENTANA_SIGMA_D = 30  # días

class MetodoCalculo(Enum):
    ESTADISTICO = "estadistico"
    PADRE_PRUDENTE = "padre_prudente"

@dataclass
class ParametrosABC:
    nivel_servicio_z: float
    dias_cobertura: int
    metodo: MetodoCalculo

@dataclass
class InputCalculo:
    demanda_p75: float          # P75 de ventas diarias (unidades)
    sigma_demanda: float        # σD sobre últimos 30 días
    demanda_maxima: float       # D_max en un día
    unidades_por_bulto: int     # Unidades por bulto del producto
    stock_actual: float         # Stock actual en tienda (unidades)
    stock_cedi: float           # Stock disponible en CEDI (unidades)
    clase_abc: str              # A, B, o C
    es_generador_trafico: bool  # Si es generador de tráfico → tratar como A

@dataclass
class ResultadoCalculo:
    # Valores en UNIDADES (para cálculos)
    stock_minimo_unid: float
    stock_seguridad_unid: float
    stock_maximo_unid: float
    punto_reorden_unid: float
    cantidad_sugerida_unid: float

    # Valores en BULTOS (para operación)
    stock_minimo_bultos: int
    stock_seguridad_bultos: int
    stock_maximo_bultos: int
    punto_reorden_bultos: int
    cantidad_sugerida_bultos: int

    # Metadata
    metodo_usado: str
    demanda_ciclo: float
    dias_cobertura_actual: float
    warnings: List[str] = field(default_factory=list)

# Parámetros por clase (niveles de servicio ajustados)
PARAMS_ABC = {
    'A': ParametrosABC(nivel_servicio_z=2.33, dias_cobertura=7, metodo=MetodoCalculo.ESTADISTICO),   # 99%
    'B': ParametrosABC(nivel_servicio_z=1.88, dias_cobertura=14, metodo=MetodoCalculo.ESTADISTICO),  # 97%
    'C': ParametrosABC(nivel_servicio_z=0.0, dias_cobertura=30, metodo=MetodoCalculo.PADRE_PRUDENTE),
}

def calcular_estadistico(input: InputCalculo, params: ParametrosABC) -> ResultadoCalculo:
    """
    Clase A y B: Fórmula estadística simplificada (sin σL porque L es fijo).

    SS = Z × σD × √L
    ROP = (D_P75 × L) + SS
    Max = ROP + (D_P75 × días_cobertura)
    """
    Z = params.nivel_servicio_z
    D = input.demanda_p75
    L = LEAD_TIME
    sigma_D = input.sigma_demanda
    unidades_bulto = input.unidades_por_bulto

    # Stock de seguridad
    stock_seguridad = Z * sigma_D * math.sqrt(L)

    # Demanda durante lead time
    demanda_ciclo = D * L

    # Punto de reorden (Mínimo)
    punto_reorden = demanda_ciclo + stock_seguridad

    # Máximo
    stock_maximo = punto_reorden + (D * params.dias_cobertura)

    # Cantidad a pedir
    deficit = max(0, stock_maximo - input.stock_actual)
    # Limitar al stock disponible en CEDI
    cantidad_sugerida = min(deficit, input.stock_cedi)

    # Convertir a bultos (redondeando hacia arriba)
    return _crear_resultado(
        stock_minimo_unid=punto_reorden,
        stock_seguridad_unid=stock_seguridad,
        stock_maximo_unid=stock_maximo,
        punto_reorden_unid=punto_reorden,
        cantidad_sugerida_unid=cantidad_sugerida,
        unidades_bulto=unidades_bulto,
        metodo="estadistico",
        demanda_ciclo=demanda_ciclo,
        demanda_p75=D,
        input=input
    )

def calcular_padre_prudente(input: InputCalculo, params: ParametrosABC) -> ResultadoCalculo:
    """
    Clase C: Método heurístico "Padre Prudente".

    Min = D_max × L (peor escenario)
    Max = Min + (D_P75 × días_cobertura)
    """
    D = input.demanda_p75
    D_max = input.demanda_maxima
    L = LEAD_TIME
    unidades_bulto = input.unidades_por_bulto

    # Punto de reorden usando máximo (conservador)
    punto_reorden = D_max * L

    # Demanda durante lead time (para referencia)
    demanda_ciclo = D * L

    # Stock de seguridad implícito
    stock_seguridad = max(0, punto_reorden - demanda_ciclo)

    # Máximo
    stock_maximo = punto_reorden + (D * params.dias_cobertura)

    # Cantidad a pedir
    deficit = max(0, stock_maximo - input.stock_actual)
    cantidad_sugerida = min(deficit, input.stock_cedi)

    return _crear_resultado(
        stock_minimo_unid=punto_reorden,
        stock_seguridad_unid=stock_seguridad,
        stock_maximo_unid=stock_maximo,
        punto_reorden_unid=punto_reorden,
        cantidad_sugerida_unid=cantidad_sugerida,
        unidades_bulto=unidades_bulto,
        metodo="padre_prudente",
        demanda_ciclo=demanda_ciclo,
        demanda_p75=D,
        input=input
    )

def _crear_resultado(stock_minimo_unid: float, stock_seguridad_unid: float,
                     stock_maximo_unid: float, punto_reorden_unid: float,
                     cantidad_sugerida_unid: float, unidades_bulto: int,
                     metodo: str, demanda_ciclo: float, demanda_p75: float,
                     input: InputCalculo) -> ResultadoCalculo:
    """Crea resultado con conversión a bultos y sanity checks."""

    # Redondear a bultos (ceil para garantizar cobertura)
    stock_minimo_bultos = math.ceil(stock_minimo_unid / unidades_bulto)
    stock_seguridad_bultos = math.ceil(stock_seguridad_unid / unidades_bulto)
    stock_maximo_bultos = math.ceil(stock_maximo_unid / unidades_bulto)
    punto_reorden_bultos = math.ceil(punto_reorden_unid / unidades_bulto)

    # Cantidad sugerida: siempre redondear hacia arriba
    cantidad_bultos = _redondear_a_bultos(cantidad_sugerida_unid, unidades_bulto)
    cantidad_unid_final = cantidad_bultos * unidades_bulto

    # Días de cobertura actual
    dias_cobertura = (input.stock_actual + cantidad_unid_final) / demanda_p75 if demanda_p75 > 0 else 999

    resultado = ResultadoCalculo(
        stock_minimo_unid=stock_minimo_unid,
        stock_seguridad_unid=stock_seguridad_unid,
        stock_maximo_unid=stock_maximo_unid,
        punto_reorden_unid=punto_reorden_unid,
        cantidad_sugerida_unid=cantidad_unid_final,
        stock_minimo_bultos=stock_minimo_bultos,
        stock_seguridad_bultos=stock_seguridad_bultos,
        stock_maximo_bultos=stock_maximo_bultos,
        punto_reorden_bultos=punto_reorden_bultos,
        cantidad_sugerida_bultos=cantidad_bultos,
        metodo_usado=metodo,
        demanda_ciclo=demanda_ciclo,
        dias_cobertura_actual=dias_cobertura,
        warnings=[]
    )

    # Ejecutar sanity checks
    resultado.warnings = _ejecutar_sanity_checks(resultado, input, demanda_p75)

    return resultado

def _redondear_a_bultos(cantidad_unid: float, unidades_bulto: int) -> int:
    """
    Redondea cantidad sugerida a bultos completos hacia arriba.

    Si hay que pedir, siempre ceil. Sin excepciones.
    """
    if cantidad_unid <= 0:
        return 0

    return math.ceil(cantidad_unid / unidades_bulto)

def _ejecutar_sanity_checks(resultado: ResultadoCalculo, input: InputCalculo,
                             demanda_p75: float) -> List[str]:
    """Ejecuta todas las validaciones de cordura."""
    warnings = []

    # 1. Stock mínimo no puede ser menor a 1 día de venta
    if demanda_p75 > 0 and resultado.stock_minimo_unid < demanda_p75:
        warnings.append(f"WARN: Stock mínimo ({resultado.stock_minimo_unid:.0f}) < 1 día de venta")

    # 2. Stock máximo debe ser mayor que mínimo
    if resultado.stock_maximo_unid <= resultado.stock_minimo_unid:
        warnings.append("ERROR: Stock máximo <= mínimo")

    # 3. Stock de seguridad no negativo
    if resultado.stock_seguridad_unid < 0:
        warnings.append("WARN: Stock seguridad negativo")

    # 4. Cantidad sugerida no puede exceder stock CEDI
    if resultado.cantidad_sugerida_unid > input.stock_cedi:
        warnings.append(f"WARN: Sugerido ({resultado.cantidad_sugerida_unid:.0f}) > stock CEDI ({input.stock_cedi:.0f})")

    # 5. Validar rangos por clase
    if demanda_p75 > 0:
        dias_max = resultado.stock_maximo_unid / demanda_p75
        limites = {'A': 15, 'B': 30, 'C': 60}
        limite = limites.get(input.clase_abc, 30)
        if dias_max > limite:
            warnings.append(f"WARN: Clase {input.clase_abc} con {dias_max:.0f} días cobertura (límite: {limite})")

    # 6. σD no debería ser > 2x la demanda (CV muy alto)
    if input.sigma_demanda > input.demanda_p75 * 2 and input.demanda_p75 > 0:
        warnings.append(f"WARN: σD muy alta ({input.sigma_demanda:.1f}) vs P75 ({input.demanda_p75:.1f})")

    return warnings

def calcular_inventario(input: InputCalculo) -> ResultadoCalculo:
    """
    Función principal: calcula parámetros de inventario según clase ABC.

    IMPORTANTE: Los Generadores de Tráfico siempre se tratan como Clase A,
    independientemente de su clasificación ABC real.
    """
    # Determinar clase efectiva
    if input.es_generador_trafico:
        clase_efectiva = 'A'  # Forzar tratamiento clase A para generadores
    else:
        clase_efectiva = input.clase_abc

    params = PARAMS_ABC.get(clase_efectiva, PARAMS_ABC['B'])

    if params.metodo == MetodoCalculo.PADRE_PRUDENTE:
        return calcular_padre_prudente(input, params)
    else:
        return calcular_estadistico(input, params)
```

### 5.2 Modificación del Query SQL

Agregar al query existente (usando la CTE de 20 días que ya existe):

```sql
-- Reutilizar ventas_diarias_20d existente y extender a 30 días para σD
ventas_diarias_30d AS (
    SELECT
        producto_id,
        fecha_venta::date as fecha,
        SUM(cantidad_vendida) as total_dia
    FROM ventas
    WHERE ubicacion_id = %s
        AND fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY producto_id, fecha_venta::date
),
estadisticas_30d AS (
    SELECT
        producto_id,
        STDDEV(total_dia) as sigma_demanda,    -- σD
        MAX(total_dia) as demanda_maxima       -- D_max
    FROM ventas_diarias_30d
    GROUP BY producto_id
)
-- Agregar al SELECT principal:
-- COALESCE(est.sigma_demanda, 0) as sigma_demanda,
-- COALESCE(est.demanda_maxima, 0) as demanda_maxima
```

---

## 6. Matriz de Configuración Final (Ajustada)

| Parámetro | Clase A | Clase B | Clase C | Generador Tráfico |
|-----------|---------|---------|---------|-------------------|
| **Contribución al Valor** | ~80% | ~15% | ~5% | Variable (usualmente C) |
| **% de SKUs** | ~20% | ~30% | ~50% | ~5-10% de clase C |
| **Frecuencia de Revisión** | **Diaria** | **Diaria** | **Diaria** | **Diaria** |
| **Nivel de Servicio (Z)** | **99% (Z=2.33)** | **97% (Z=1.88)** | N/A (heurístico) | **99% (Z=2.33)** |
| **Fórmula SS** | $Z \times \sigma_D \times \sqrt{L}$ | $Z \times \sigma_D \times \sqrt{L}$ | Implícito en $D_{max} \times L$ | Igual que Clase A |
| **Fórmula ROP (Min)** | $(D_{P75} \times L) + SS$ | $(D_{P75} \times L) + SS$ | $D_{max} \times L$ | Igual que Clase A |
| **Días Cobertura Max** | **7 días** | **14 días** | **30 días** | **7 días** |
| **Lead Time** | 1.5 días (fijo) | 1.5 días (fijo) | 1.5 días (fijo) | 1.5 días (fijo) |

**Nota:** Los Generadores de Tráfico (productos con GAP > 400 y `es_generador_trafico = TRUE`) siempre se calculan como Clase A, independientemente de su clasificación ABC por valor.

---

## 7. Detección de Sobrestock (Complemento al Sistema de Criticidad)

### Contexto

El sistema ya tiene un **sistema de Criticidad/Prioridad de 5 niveles** que determina urgencia de pedido. Este funciona bien para detectar cuándo pedir.

Sin embargo, el **Nivel 5 (ÓPTIMO/EXCESO)** agrupa dos estados diferentes:
- Stock óptimo (dentro del rango)
- Stock en exceso (por encima del máximo)

### Lo que Agregamos

Solo campos adicionales para **visibilizar el exceso** cuando `stock_actual > stock_maximo`:

```python
# Nuevos campos en el response (complementan la criticidad existente)
tiene_sobrestock: bool          # True si stock > máximo
exceso_unidades: float          # stock_actual - stock_maximo
exceso_bultos: int              # ceil(exceso_unidades / unidades_por_bulto)
dias_exceso: float              # exceso_unidades / demanda_p75
```

### Cálculo Simple

```python
def calcular_sobrestock(stock_actual: float, stock_maximo: float,
                        demanda_p75: float, unidades_por_bulto: int) -> dict:
    """
    Calcula indicadores de sobrestock (complementa criticidad existente).
    """
    exceso = stock_actual - stock_maximo

    if exceso <= 0:
        return {
            'tiene_sobrestock': False,
            'exceso_unidades': 0,
            'exceso_bultos': 0,
            'dias_exceso': 0
        }

    return {
        'tiene_sobrestock': True,
        'exceso_unidades': exceso,
        'exceso_bultos': math.ceil(exceso / unidades_por_bulto),
        'dias_exceso': exceso / demanda_p75 if demanda_p75 > 0 else 999
    }
```

### Visualización en UI

En la tabla de pedidos, para productos con `tiene_sobrestock = True`:
- Mostrar badge o icono indicando exceso
- Tooltip: "Exceso de X bultos (Y días de inventario extra)"
- Cantidad sugerida = 0 (no pedir más)

---

## 8. Ejemplo Práctico con Redondeo

### Producto: Harina de Maíz Blanca (004962) - Clase B

```
DATOS DE ENTRADA:
├─ P75 ventas diarias: 45 unidades/día
├─ σD (30 días): 12 unidades
├─ D_max: 80 unidades
├─ Unidades por bulto: 20
├─ Stock en tienda: 35 unidades
├─ Stock en CEDI: 500 unidades
├─ Clase ABC: B

CÁLCULO (Método Estadístico):
1. Lead Time = 1.5 días (fijo)
2. Z = 1.65 (95% nivel servicio para clase B)

3. Stock de Seguridad:
   SS = 1.65 × 12 × √1.5 = 1.65 × 12 × 1.22 = 24.2 unidades

4. Demanda durante Lead Time:
   Demanda_ciclo = 45 × 1.5 = 67.5 unidades

5. Punto de Reorden (Mínimo):
   ROP = 67.5 + 24.2 = 91.7 unidades
   → Redondeado: 92 unidades = 5 bultos (100 unidades)

6. Stock Máximo (14 días cobertura):
   Max = 91.7 + (45 × 14) = 91.7 + 630 = 721.7 unidades
   → Redondeado: 722 unidades = 37 bultos (740 unidades)

7. ¿Pedir?
   Stock actual (35) < Punto reorden (92) → SÍ, PEDIR

8. Cantidad Sugerida:
   Déficit = 722 - 35 = 687 unidades
   En bultos = 687 / 20 = 34.35 bultos
   → Redondeado: 35 bultos = 700 unidades

SANITY CHECKS:
✓ Stock mínimo (92) > 1 día venta (45)
✓ Stock máximo (722) > mínimo (92)
✓ Días cobertura máx (722/45=16) ≈ 14 días esperados
✓ Cantidad en bultos completos (700 = 35 × 20)

RESULTADO FINAL:
├─ Stock Mínimo: 5 bultos (100 unidades)
├─ Stock Seguridad: 2 bultos (40 unidades)
├─ Stock Máximo: 37 bultos (740 unidades)
├─ Punto Reorden: 5 bultos (100 unidades)
├─ Cantidad Sugerida: 35 bultos (700 unidades)
└─ Razón: "Stock bajo punto de reorden"
```

---

## 9. Tareas de Implementación

### Fase 1: Backend - Preparación SQL
- [ ] **1.1** Agregar CTE `ventas_diarias_30d` al query existente
- [ ] **1.2** Agregar CTE `estadisticas_30d` para σD y D_max
- [ ] **1.3** Agregar JOIN con `productos` para obtener `es_generador_trafico`
- [ ] **1.4** Incluir nuevos campos en el SELECT

### Fase 2: Backend - Módulo de Cálculo
- [ ] **2.1** Crear `backend/services/calculo_inventario_abc.py`
- [ ] **2.2** Implementar `calcular_estadistico()` con Z=2.33 (A) y Z=1.88 (B)
- [ ] **2.3** Implementar `calcular_padre_prudente()` para clase C
- [ ] **2.4** Implementar lógica: Generador Tráfico → tratar como Clase A
- [ ] **2.5** Implementar `_redondear_a_bultos()` (siempre ceil)
- [ ] **2.6** Implementar `calcular_sobrestock()` (campos adicionales)
- [ ] **2.7** Implementar sanity checks

### Fase 3: Backend - Integración
- [ ] **3.1** Modificar endpoint `/calcular` para usar nuevo módulo
- [ ] **3.2** Eliminar código de multiplicadores fijos
- [ ] **3.3** Agregar `es_generador_trafico` y `clase_efectiva` al response
- [ ] **3.4** Agregar campos de sobrestock: `tiene_sobrestock`, `exceso_bultos`, `dias_exceso`
- [ ] **3.5** Agregar warnings de sanity checks al response

### Fase 4: Frontend - Visualización Sobrestock
- [ ] **4.1** Mostrar badge/icono cuando `tiene_sobrestock = True`
- [ ] **4.2** Tooltip con detalles: "Exceso de X bultos (Y días extra)"
- [ ] **4.3** Asegurar cantidad sugerida = 0 para productos con sobrestock

### Fase 5: Testing
- [ ] **5.1** Tests unitarios para cada fórmula (A, B, C)
- [ ] **5.2** Tests de redondeo a bultos (ceil)
- [ ] **5.3** Tests de detección de sobrestock
- [ ] **5.4** Tests de sanity checks
- [ ] **5.5** Test: Generador Tráfico clase C → debe calcular como A
- [ ] **5.6** Comparación con datos reales (antes/después)

---

## 10. Archivos a Crear/Modificar

### Nuevos Archivos
- [ ] `backend/services/calculo_inventario_abc.py`
- [ ] `backend/tests/test_calculo_inventario_abc.py`

### Archivos a Modificar
- [ ] [pedidos_sugeridos.py](backend/routers/pedidos_sugeridos.py) - Query SQL y lógica de cálculo
- [ ] [OrderStepTwo.tsx](frontend/src/components/orders/OrderStepTwo.tsx) - Agregar indicadores de estado

---

## 11. Preguntas Resueltas

| Pregunta | Respuesta |
|----------|-----------|
| Lead Time | **1.5 días fijo** |
| Días cobertura Clase A | **7 días** |
| Días cobertura Clase B | **14 días** |
| Días cobertura Clase C | **30 días** |
| Ventana para σD | **30 días** |
| Frecuencia de revisión | **Diaria (todas las clases)** |
| Base de demanda | **P75 (ya calculado)** |
| Redondeo | **Siempre hacia arriba (ceil) a bultos completos** |
| Nivel servicio Clase A | **99% (Z=2.33)** |
| Nivel servicio Clase B | **97% (Z=1.88)** |
| Generadores de Tráfico | **Tratar siempre como Clase A** |
| Detección Sobrestock | **Sí, cuando stock > stock_máximo** |

---

*Plan actualizado: 2025-12-04*
*Versión: 3.0 - Con sobrestock y generadores de tráfico*
*Para: La Granja Mercado - Sistema Fluxion AI*
