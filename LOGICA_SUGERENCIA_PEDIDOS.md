# Lógica de Sugerencia de Pedidos - Fluxion AI

## Objetivo

Calcular automáticamente la **cantidad sugerida en bultos** para cada producto, basándose en niveles de stock, clasificación ABC, tendencias de venta y disponibilidad en CEDI.

---

## 1. Variables Disponibles

### Stock
- **Stock Tienda** - Inventario físico en la tienda
- **Stock en Tránsito** - Inventario en camino a la tienda
- **Stock Total** = Stock Tienda + Stock en Tránsito
- **Stock CEDI Origen** - Disponibilidad en el CEDI seleccionado

### Parámetros de Reorden (calculados)
- **Stock Mínimo** - Nivel crítico mínimo (en bultos)
- **Stock de Seguridad** - Colchón de seguridad adicional (en bultos)
- **Punto de Reorden** - Nivel que activa el pedido (en bultos)
- **Stock Máximo** - Capacidad máxima recomendada (en bultos)

### Ventas
- **Venta/Día 5d** - Promedio diario últimos 5 días (en bultos)
- **Venta/Día 20d** - Promedio diario últimos 20 días (en bultos)
- **Venta/Día Mismo Día** - Promedio para el día de la semana (en bultos)

### Clasificación
- **Clasificación ABC** - Basada en venta diaria en bultos:
  - **A**: ≥ 20 bultos/día
  - **AB**: 5 - 19.99 bultos/día
  - **B**: 0.45 - 4.99 bultos/día
  - **BC**: 0.20 - 0.449 bultos/día
  - **C**: 0.001 - 0.199 bultos/día

---

## 2. Reglas de Negocio

### 2.1. Cuándo NO PEDIR (Cantidad Sugerida = 0)

| Condición | Razón |
|-----------|-------|
| Stock Total ≥ Punto de Reorden | "Stock suficiente" |
| Stock CEDI Origen = 0 | "Sin stock en CEDI" |
| Venta Diaria 5d = 0 | "Sin movimiento reciente" |
| Clasificación C + Stock > Stock Seguridad | "Producto lento, stock OK" |
| Cantidad calculada < 0.5 bultos (excepto A) | "Cantidad mínima no alcanzada" |

### 2.2. Cuándo SÍ PEDIR - Niveles de Urgencia

#### 🔴 CRÍTICO (Prioridad Alta)
**Condición**: `Stock Total < Stock Mínimo`

**Cantidad Base**:
```
Stock Máximo - Stock Total + (Venta Diaria × Lead Time)
```

**Razón**: "URGENTE - Stock bajo mínimo"

**Justificación**: El stock está en nivel crítico, necesitamos reponer rápidamente y cubrir las ventas durante el tiempo de reabastecimiento.

---

#### 🟠 IMPORTANTE (Prioridad Media)
**Condición**: `Stock Mínimo ≤ Stock Total < Punto de Reorden`

**Cantidad Base**:
```
Stock Máximo - Stock Total
```

**Razón**: "Stock bajo punto de reorden"

**Justificación**: Hemos alcanzado el punto de reorden, necesitamos reponer antes de llegar al stock mínimo.

---

#### 🟡 PREVENTIVO (Prioridad Baja)
**Condición**: `Punto de Reorden ≤ Stock Total < Stock Seguridad`

**Aplicable solo a**: Productos **A** y **AB**

**Cantidad Base**:
```
(Stock Máximo × 0.7) - Stock Total
```

**Razón**: "Reabastecimiento preventivo (A/AB)"

**Justificación**: Para productos de alta rotación, hacemos pedidos preventivos para no quedarnos sin stock.

---

## 3. Ajustes Inteligentes

### 3.1. Por Clasificación ABC

Aplicar multiplicador según clasificación para no llenar completamente:

| Clasificación | % del Stock Máximo | Justificación |
|---------------|-------------------|---------------|
| A | 95% | Alta rotación, casi llenar |
| AB | 90% | Muy buena rotación |
| B | 80% | Rotación media |
| BC | 70% | Rotación media-baja |
| C | 60% | Baja rotación, no sobre-stockear |

**Fórmula**:
```
Cantidad Ajustada = Cantidad Base × Multiplicador ABC
```

---

### 3.2. Por Tendencia de Venta

Comparar venta reciente (5d) vs promedio (20d):

| Condición | Ajuste | Razón Adicional |
|-----------|--------|-----------------|
| Venta 5d > Venta 20d × 1.2 | × 1.2 | "+ Tendencia ↑" |
| Venta 5d < Venta 20d × 0.5 | × 0.8 | "+ Tendencia ↓" |
| Caso normal | × 1.0 | - |

**Fórmula**:
```
Tendencia = Venta 5d / Venta 20d

Si Tendencia > 1.2:
  Cantidad = Cantidad × 1.2
Si Tendencia < 0.5:
  Cantidad = Cantidad × 0.8
```

---

### 3.3. Por Disponibilidad en CEDI

Limitar la cantidad sugerida al stock disponible en el CEDI:

```
Si Cantidad Sugerida > Stock CEDI Disponible:
  Cantidad Final = Stock CEDI Disponible
  Razón = "Limitado por stock CEDI"
```

---

### 3.4. Por Capacidad de Bultos

Redondear a bultos completos:

```
Cantidad en Bultos = ROUND(Cantidad Calculada)

Casos especiales:
- Si < 1 bulto y Producto A y > 0.3:  → 1 bulto
- Si < 1 bulto y Producto ≠ A y < 0.5: → 0 bultos (no sugerir)
- Si < 1 bulto y Producto ≠ A y ≥ 0.5: → 1 bulto
```

---

### 3.5. Por Día de la Semana (Opcional)

Si el producto tiene un pico de venta en un día específico:

```
Si Venta Mismo Día > Venta 5d × 1.5:
  Considerar día pico
  Si próximo día es día pico: Cantidad × 1.2
```

---

## 4. Fórmula Completa - Pseudocódigo

```javascript
function calcularCantidadSugerida(producto, parametros) {
  const stockActual = producto.stock_tienda + producto.stock_en_transito;
  const ventaDiaria = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;
  const leadTime = parametros.lead_time_dias; // De configuración de tienda

  // ============================================
  // PASO 1: Verificar si NO debe pedir
  // ============================================

  if (stockActual >= producto.punto_reorden) {
    return {
      cantidad: 0,
      razon: "Stock suficiente",
      prioridad: null
    };
  }

  if (producto.stock_cedi_origen <= 0) {
    return {
      cantidad: 0,
      razon: "Sin stock en CEDI",
      prioridad: null
    };
  }

  if (ventaDiaria <= 0) {
    return {
      cantidad: 0,
      razon: "Sin movimiento reciente",
      prioridad: null
    };
  }

  if (producto.clasificacion_abc === 'C' && stockActual > producto.stock_seguridad) {
    return {
      cantidad: 0,
      razon: "Producto lento, stock OK",
      prioridad: null
    };
  }

  // ============================================
  // PASO 2: Calcular cantidad base según urgencia
  // ============================================

  let cantidadBase = 0;
  let razon = "";
  let prioridad = "";

  if (stockActual < producto.stock_minimo) {
    // 🔴 CRÍTICO
    cantidadBase = (producto.stock_maximo - stockActual) + (ventaDiaria * leadTime);
    razon = "URGENTE - Stock bajo mínimo";
    prioridad = "ALTA";
  }
  else if (stockActual < producto.punto_reorden) {
    // 🟠 IMPORTANTE
    cantidadBase = producto.stock_maximo - stockActual;
    razon = "Stock bajo punto de reorden";
    prioridad = "MEDIA";
  }
  else if (stockActual < producto.stock_seguridad &&
           ['A', 'AB'].includes(producto.clasificacion_abc)) {
    // 🟡 PREVENTIVO (solo A y AB)
    cantidadBase = (producto.stock_maximo * 0.7) - stockActual;
    razon = "Reabastecimiento preventivo (A/AB)";
    prioridad = "BAJA";
  }
  else {
    return {
      cantidad: 0,
      razon: "Stock OK",
      prioridad: null
    };
  }

  // ============================================
  // PASO 3: Ajuste por clasificación ABC
  // ============================================

  const multiplicadorABC = {
    'A': 0.95,
    'AB': 0.90,
    'B': 0.80,
    'BC': 0.70,
    'C': 0.60
  };

  cantidadBase *= (multiplicadorABC[producto.clasificacion_abc] || 0.80);

  // ============================================
  // PASO 4: Ajuste por tendencia de venta
  // ============================================

  if (producto.prom_ventas_20dias_unid > 0) {
    const tendencia = producto.prom_ventas_5dias_unid / producto.prom_ventas_20dias_unid;

    if (tendencia > 1.2) {
      cantidadBase *= 1.2; // Tendencia al alza
      razon += " + Tendencia ↑";
    } else if (tendencia < 0.5) {
      cantidadBase *= 0.8; // Tendencia a la baja
      razon += " + Tendencia ↓";
    }
  }

  // ============================================
  // PASO 5: Limitar por stock disponible en CEDI
  // ============================================

  const stockCediDisponible = producto.stock_cedi_origen / producto.cantidad_bultos;

  if (cantidadBase > stockCediDisponible) {
    cantidadBase = stockCediDisponible;
    razon = "Limitado por stock CEDI";
  }

  // ============================================
  // PASO 6: Redondear a bultos completos
  // ============================================

  let cantidadFinal = Math.round(cantidadBase);

  // Regla especial: Mínimo 1 bulto para productos A
  if (cantidadFinal < 1 && producto.clasificacion_abc === 'A' && cantidadBase > 0.3) {
    cantidadFinal = 1;
  }

  // No sugerir menos de medio bulto (excepto A)
  if (cantidadFinal < 1 && cantidadBase < 0.5 && producto.clasificacion_abc !== 'A') {
    return {
      cantidad: 0,
      razon: "Cantidad mínima no alcanzada",
      prioridad: null
    };
  }

  // ============================================
  // PASO 7: Retornar resultado
  // ============================================

  return {
    cantidad: cantidadFinal,
    razon: razon,
    prioridad: prioridad
  };
}
```

---

## 5. Parámetros Configurables por Tienda

Agregar a `etl/core/tiendas_config.py`:

```python
@dataclass
class TiendaConfig:
    # ... campos existentes ...

    # Parámetros de sugerencia de pedidos
    lead_time_dias: int = 2  # Días desde pedido hasta entrega
    permitir_pedido_preventivo: bool = True  # Permitir pedidos preventivos para A/AB
    stock_max_fill_rate_a: float = 0.95  # Llenar hasta 95% del máximo para A
    stock_max_fill_rate_ab: float = 0.90
    stock_max_fill_rate_b: float = 0.80
    stock_max_fill_rate_bc: float = 0.70
    stock_max_fill_rate_c: float = 0.60
    ajuste_tendencia_alza: float = 1.2  # Multiplicador si venta en alza
    ajuste_tendencia_baja: float = 0.8  # Multiplicador si venta en baja
    umbral_tendencia_alza: float = 1.2  # Venta 5d / Venta 20d
    umbral_tendencia_baja: float = 0.5
```

---

## 6. Indicadores Visuales en la Columna "Sugerido"

### Códigos de Color por Prioridad

| Prioridad | Color | Clase CSS | Cuándo |
|-----------|-------|-----------|--------|
| ALTA | 🔴 Rojo | `text-red-600 bg-red-50` | Stock < Stock Mínimo |
| MEDIA | 🟠 Naranja | `text-orange-600 bg-orange-50` | Stock < Punto Reorden |
| BAJA | 🟡 Amarillo | `text-yellow-600 bg-yellow-50` | Stock < Seguridad (A/AB) |
| - | ⚪ Gris | `text-gray-400` | No sugerido (0) |

### Badge de Prioridad

```jsx
{producto.prioridad === 'ALTA' && (
  <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
    URGENTE
  </span>
)}
```

---

## 7. Validaciones y Reglas de Consistencia

### Validación de Parámetros de Stock

Antes de calcular, verificar:

```
Stock Máximo > Punto de Reorden > Stock Seguridad > Stock Mínimo > 0
```

Si no se cumple, alertar y usar valores por defecto o pedir configuración.

### Alertas Especiales

| Condición | Alerta |
|-----------|--------|
| Stock Máximo < (Venta Diaria × 7) | "⚠️ Stock Máximo insuficiente para 1 semana" |
| Stock CEDI < 30% del promedio | "⚠️ Stock CEDI bajo" |
| Producto sin ventas > 30 días | "⚠️ Considerar descontinuar" |
| Stock Tienda > Stock Máximo × 1.5 | "⚠️ Sobre-stock crítico" |

---

## 8. Ejemplos Prácticos

### Ejemplo 1: Producto A - Urgente

**Datos**:
- Clasificación: A
- Stock Tienda: 50 unid (2.5 bultos)
- Stock en Tránsito: 0
- Venta Diaria 5d: 40 bultos
- Stock Mínimo: 80 bultos
- Punto Reorden: 120 bultos
- Stock Máximo: 200 bultos
- Stock CEDI: 500 bultos
- Lead Time: 2 días

**Cálculo**:
```
1. Stock Total = 2.5 bultos
2. Es < Stock Mínimo (80) → CRÍTICO
3. Cantidad Base = (200 - 2.5) + (40 × 2) = 277.5 bultos
4. Ajuste ABC (A = 95%) = 277.5 × 0.95 = 263.6 bultos
5. Tendencia = OK (no ajusta)
6. Stock CEDI OK (500 > 263.6)
7. Redondeo = 264 bultos
```

**Resultado**:
- Cantidad Sugerida: **264 bultos**
- Razón: "URGENTE - Stock bajo mínimo"
- Prioridad: ALTA 🔴

---

### Ejemplo 2: Producto B - Normal

**Datos**:
- Clasificación: B
- Stock Total: 15 bultos
- Venta Diaria 5d: 2 bultos
- Stock Mínimo: 6 bultos
- Punto Reorden: 12 bultos
- Stock Máximo: 30 bultos
- Stock CEDI: 100 bultos

**Cálculo**:
```
1. Stock Total = 15 bultos
2. Es > Punto Reorden (12) → No pedir
```

**Resultado**:
- Cantidad Sugerida: **0 bultos**
- Razón: "Stock suficiente"

---

### Ejemplo 3: Producto AB - Preventivo con Tendencia

**Datos**:
- Clasificación: AB
- Stock Total: 18 bultos
- Venta Diaria 5d: 8 bultos
- Venta Diaria 20d: 5 bultos
- Stock Mínimo: 10 bultos
- Punto Reorden: 16 bultos
- Stock Seguridad: 20 bultos
- Stock Máximo: 50 bultos
- Stock CEDI: 200 bultos

**Cálculo**:
```
1. Stock Total = 18 bultos
2. Es entre Punto Reorden (16) y Seguridad (20) → PREVENTIVO (AB)
3. Cantidad Base = (50 × 0.7) - 18 = 17 bultos
4. Ajuste ABC (AB = 90%) = 17 × 0.90 = 15.3 bultos
5. Tendencia = 8/5 = 1.6 > 1.2 → ALZA
6. Ajuste tendencia = 15.3 × 1.2 = 18.36 bultos
7. Stock CEDI OK
8. Redondeo = 18 bultos
```

**Resultado**:
- Cantidad Sugerida: **18 bultos**
- Razón: "Reabastecimiento preventivo (A/AB) + Tendencia ↑"
- Prioridad: BAJA 🟡

---

### Ejemplo 4: Producto C - Sin Stock CEDI

**Datos**:
- Clasificación: C
- Stock Total: 2 bultos
- Venta Diaria 5d: 0.3 bultos
- Stock Mínimo: 5 bultos
- Stock CEDI: 0 bultos

**Cálculo**:
```
1. Stock Total = 2 bultos
2. Es < Stock Mínimo → CRÍTICO
3. PERO Stock CEDI = 0 → No puede pedir
```

**Resultado**:
- Cantidad Sugerida: **0 bultos**
- Razón: "Sin stock en CEDI"
- Prioridad: null ⚠️

---

## 9. Preguntas para Discusión

### 9.1. Lead Time
- ¿Cuántos días tarda un pedido desde que se hace hasta que llega a la tienda?
- ¿Varía por CEDI o es igual para todos?
- ¿Consideramos días hábiles o corridos?

### 9.2. Pedidos Preventivos
- ¿Solo permitir para A y AB, o también para B?
- ¿Qué % del Stock Máximo usar? (propuesta: 70%)
- ¿Desactivar en ciertas épocas del año?

### 9.3. Ajustes por Tendencia
- ¿Son adecuados los umbrales de 1.2 y 0.5?
- ¿Deben ser configurables por tienda?
- ¿Considerar estacionalidad (ventas diciembre vs enero)?

### 9.4. Productos Sin Movimiento
- ¿Cuántos días sin venta para considerar "sin movimiento"?
- ¿Permitir pedidos manuales aunque el sistema no sugiera?
- ¿Alertar para descontinuar productos?

### 9.5. Límites de Pedido
- ¿Hay un límite máximo de bultos por pedido?
- ¿Hay un límite por capacidad de transporte?
- ¿Restricciones de espacio en tienda?

### 9.6. Productos Nuevos
- ¿Cómo manejar productos sin historial de ventas?
- ¿Usar promedio de la categoría?
- ¿Stock inicial recomendado?

### 9.7. Redondeo de Bultos
- ¿Siempre redondear hacia arriba o usar redondeo estándar?
- ¿Productos A siempre mínimo 1 bulto aunque sea poco?
- ¿Fracciones de bulto para productos especiales?

### 9.8. Stock Máximo Dinámico
- ¿El Stock Máximo es fijo o debe ajustarse según temporada?
- ¿Considerar capacidad física de la tienda?
- ¿Alertar si Stock Máximo es insuficiente?

### 9.9. Priorización de Productos
- ¿Si no hay suficiente stock en CEDI, priorizar productos A?
- ¿Cómo balancear entre múltiples productos urgentes?
- ¿Considerar margen de ganancia en la priorización?

### 9.10. Validaciones Adicionales
- ¿Qué hacer si Stock Tienda > Stock Máximo (sobre-stock)?
- ¿Permitir devoluciones al CEDI?
- ¿Transferencias entre tiendas?

---

## 10. Próximos Pasos

1. **Revisar y ajustar** las reglas propuestas según el negocio
2. **Definir parámetros** específicos por tienda (lead time, fill rates, etc.)
3. **Validar fórmulas** con casos reales de productos
4. **Implementar** en código frontend/backend
5. **Probar** con datos históricos
6. **Ajustar** basándose en feedback de usuarios
7. **Documentar** reglas finales aprobadas

---

## Notas Finales

- Este documento es un **punto de partida** para la discusión
- Las fórmulas y parámetros pueden ajustarse según necesidades del negocio
- Se recomienda **validar con casos reales** antes de implementar
- Los multiplicadores y umbrales son **configurables** por tienda
- La lógica debe ser **auditable** y generar un log de por qué se sugirió cada cantidad

---

**Versión**: 1.0
**Fecha**: 2025-10-03
**Autor**: Fluxion AI - Sistema de Sugerencia de Pedidos
