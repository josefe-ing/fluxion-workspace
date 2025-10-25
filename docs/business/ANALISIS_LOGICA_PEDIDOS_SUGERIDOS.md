# 📊 Análisis Completo - Sistema de Pedidos Sugeridos Fluxion AI

**Fecha:** 25 de Octubre 2025
**Cliente:** La Granja Mercado
**Sistema:** Fluxion AI - Inventory Management con IA Proactiva
**Versión:** 2.0 (Corregida con lógica real)

---

## 📑 Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Datos Disponibles Actualmente](#datos-disponibles-actualmente)
3. [Lógica Actual de Clasificación ABC](#lógica-actual-de-clasificación-abc)
4. [Parámetros Actuales por Cuadrante](#parámetros-actuales-por-cuadrante)
5. [Algoritmo Actual de Cálculo de Pedidos](#algoritmo-actual-de-cálculo-de-pedidos)
6. [Análisis Crítico de la Lógica Actual](#análisis-crítico-de-la-lógica-actual)
7. [Lógica Recomendada - Clase Mundial](#lógica-recomendada---clase-mundial)
8. [Plan de Implementación](#plan-de-implementación)

---

## 🎯 Resumen Ejecutivo

### ✅ Lo que Tenemos HOY

| Componente | Estado | Detalle |
|-----------|--------|---------|
| **Datos de Ventas** | ✅ Excelente | 55.2M registros (13 meses históricos) |
| **Inventario Real-Time** | ✅ Excelente | 16 tiendas + 3 CEDIs actualizados |
| **Campo `cuadrante_producto`** | ✅ Disponible | 12 cuadrantes del ERP (CUADRANTE I-XII) |
| **Clasificación ABC dinámica** | ✅ Implementada | Calculada en frontend por venta/día |
| **Parámetros por Clasificación** | ✅ Funcionando | SÍ se aplican correctamente |
| **UI de Pedidos** | ✅ Completa | Wizard de 3 pasos + aprobación |

### ⚠️ Lo que Necesita Mejora

- ✅ **Clasificación ABC funciona**, pero umbral de productos A es muy alto (≥20 bultos/día)
- ❌ **No hay clasificación XYZ** (variabilidad de demanda)
- ❌ **Stock de seguridad fijo** (no considera desviación estándar)
- ❌ **No detecta tendencias** (creciente/decreciente)
- ❌ **No ajusta por estacionalidad** (fines de semana, quincenas)
- ❌ **Pronóstico no adaptativo** (mismo método para todos)

---

## 📊 Datos Disponibles Actualmente

### 1. **Ventas Históricas** (`ventas_raw`)

```sql
Total Registros: 55,223,575
Periodo: Sep 2024 - Sep 2025 (13 meses)
Ubicaciones: 16 tiendas activas
```

**Campos Clave:**
```python
{
    # Identificación
    'ubicacion_id': 'tie_001',
    'codigo_producto': 'PROD123',
    'cuadrante_producto': 'CUADRANTE I',  # ← Del ERP (12 cuadrantes)

    # Ventas
    'fecha': '2025-10-25',
    'dia_semana': 5,  # 1=Lun, 7=Dom
    'cantidad_vendida': 150.0,
    'cantidad_bultos': 12.0,
    'venta_total': 450.00,

    # Producto
    'descripcion_producto': 'Harina PAN 1kg',
    'categoria_producto': 'Alimentos',
    'marca_producto': 'PAN',
}
```

**Distribución de `cuadrante_producto` en datos:**

| Cuadrante | Registros | % del Total |
|-----------|-----------|-------------|
| CUADRANTE I | 17,043,516 | 30.9% |
| CUADRANTE II | 8,568,659 | 15.5% |
| CUADRANTE VI | 7,046,495 | 12.8% |
| CUADRANTE III | 6,817,413 | 12.3% |
| CUADRANTE IV | 4,488,166 | 8.1% |
| CUADRANTE VII | 3,593,638 | 6.5% |
| CUADRANTE IX | 3,168,954 | 5.7% |
| CUADRANTE VIII | 2,413,509 | 4.4% |
| CUADRANTE V | 1,114,403 | 2.0% |
| CUADRANTE X | 672,744 | 1.2% |
| Otros (XI, XII, NO ESPECIFICADO) | 532,078 | 1.0% |

**Origen del campo `cuadrante_producto`:**
- Viene del campo `p.Text2` en la base de datos SQL Server de cada tienda
- Es un campo gestionado en el ERP
- **Valores:** `CUADRANTE I` hasta `CUADRANTE XII` + `NO ESPECIFICADO`
- **Uso actual:** Solo para filtrado en UI, NO para cálculos

### 2. **Inventario Actual** (`inventario_raw`)

```python
{
    'ubicacion_id': 'tie_001',
    'codigo_producto': 'PROD123',
    'cantidad_actual': 150.0,
    'cantidad_disponible': 140.0,
    'cantidad_reservada': 10.0,
    'cantidad_en_transito': 50.0,
    'stock_minimo': 50.0,
    'stock_maximo': 500.0,
    'punto_reorden': 100.0,
}
```

### 3. **Configuración Producto-Ubicación** (`producto_ubicacion_config`)

```python
{
    'ubicacion_id': 'tie_001',
    'producto_id': 'prod_001',
    'stock_minimo': 50.0,
    'stock_maximo': 500.0,
    'punto_reorden': 100.0,
    'lead_time_dias': 7,
    'lote_minimo_compra': 12.0,
}
```

**Total registros:** 300 (configuración personalizada por tienda/producto)

---

## 🏷️ Lógica Actual de Clasificación ABC

### ⚠️ CORRECCIÓN IMPORTANTE

**La clasificación ABC NO viene del campo `cuadrante_producto`**. Se calcula dinámicamente en el frontend:

### Ubicación del Código

**Archivo:** [`frontend/src/components/orders/OrderStepTwo.tsx`](../../frontend/src/components/orders/OrderStepTwo.tsx#L640-L651)

**Líneas 640-651:** Renderizado de columna "CLASIFICACIÓN"

```typescript
<td className="bg-orange-50 px-4 py-3 text-sm text-orange-700 text-center">
  <span className="font-medium">
    {(() => {
      const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;
      if (ventaDiariaBultos >= 20) return 'A';
      if (ventaDiariaBultos >= 5) return 'AB';
      if (ventaDiariaBultos >= 0.45) return 'B';
      if (ventaDiariaBultos >= 0.20) return 'BC';
      if (ventaDiariaBultos >= 0.001) return 'C';
      return '-';
    })()}
  </span>
</td>
```

### Umbrales de Clasificación ABC

| Clasificación | Umbral (bultos/día) | Días de Stock | Ejemplo Producto |
|---------------|---------------------|---------------|------------------|
| **A** | ≥ 20 bultos/día | Min: 2, Max: 5 | Harina PAN (altísima rotación) |
| **AB** | ≥ 5 < 20 bultos/día | Min: 2, Max: 7 | Arroz, Azúcar |
| **B** | ≥ 0.45 < 5 bultos/día | Min: 3, Max: 12 | Aceite, Pasta |
| **C** | ≥ 0.20 < 0.45 bultos/día | Min: 9, Max: 17 | Productos media-baja rotación |
| **C** | ≥ 0.001 < 0.20 bultos/día | Min: 15, Max: 26 | Productos baja rotación |
| **-** | < 0.001 bultos/día | - | Sin ventas significativas |

### Métrica Base

```typescript
venta_diaria_bultos = prom_ventas_5dias_unid / cantidad_bultos
```

**Importante:**
- Usa promedio de **5 días** (no 8 semanas)
- Se calcula en **bultos/día** (no unidades)
- Es **dinámico** (se recalcula cada vez)

### Diferencia entre `cuadrante_producto` y Clasificación ABC

| Campo | Origen | Valores | Uso Actual |
|-------|--------|---------|------------|
| **`cuadrante_producto`** | ERP (SQL Server `p.Text2`) | CUADRANTE I-XII, NO ESPECIFICADO | Solo filtrado UI |
| **Clasificación ABC** | Calculada en frontend | A, AB, B, BC, C, - | Cálculo de stock (min, max, seg) |

**Conclusión:** El sistema **ignora completamente** el campo `cuadrante_producto` del ERP para cálculos de inventario.

---

## ⚙️ Parámetros Actuales por Cuadrante

### Configuración en `tiendas_config.py`

**Archivo:** [`backend/tiendas_config.py`](../../backend/tiendas_config.py#L25-L42)

```python
@dataclass
class TiendaConfig:
    # STOCK MÍNIMO (multiplicadores sobre venta diaria en bultos)
    stock_min_mult_a: float = 2.0    # A: 2 días
    stock_min_mult_ab: float = 2.0   # AB: 2 días
    stock_min_mult_b: float = 3.0    # B: 3 días
    stock_min_mult_bc: float = 9.0   # BC: 9 días
    stock_min_mult_c: float = 15.0   # C: 15 días

    # STOCK DE SEGURIDAD (multiplicadores adicionales)
    stock_seg_mult_a: float = 1.0    # A: 1 día
    stock_seg_mult_ab: float = 2.5   # AB: 2.5 días
    stock_seg_mult_b: float = 2.0    # B: 2 días
    stock_seg_mult_bc: float = 3.0   # BC: 3 días
    stock_seg_mult_c: float = 7.0    # C: 7 días

    # STOCK MÁXIMO (multiplicadores sobre venta diaria en bultos)
    stock_max_mult_a: float = 5.0    # A: 5 días
    stock_max_mult_ab: float = 7.0   # AB: 7 días
    stock_max_mult_b: float = 12.0   # B: 12 días
    stock_max_mult_bc: float = 17.0  # BC: 17 días
    stock_max_mult_c: float = 26.0   # C: 26 días
```

### ✅ Estos parámetros SÍ se usan en el frontend

**Archivo:** [`frontend/src/components/orders/OrderStepTwo.tsx`](../../frontend/src/components/orders/OrderStepTwo.tsx#L269-L325)

**Función:** `calcularStockMinimo()` (línea 269)

```typescript
const calcularStockMinimo = (producto: ProductoPedido): number => {
  if (!stockParams) return 0;

  const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;
  let multiplicador = 0;

  // Clasificación dinámica aplicando parámetros
  if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_min_mult_a;       // A
  else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_min_mult_ab;  // AB
  else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_min_mult_b;  // B
  else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_min_mult_bc; // BC
  else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_min_mult_c; // C
  else return 0;

  return ventaDiariaBultos * multiplicador;  // En bultos
};
```

### Interpretación de los Parámetros

**Ejemplo para Producto A (≥20 bultos/día):**

```python
# Si un producto vende 25 bultos/día (≥20 → clasificación A):

venta_diaria_bultos = 25.0
stock_minimo = 25.0 × 2.0 = 50 bultos    # 2 días de cobertura
stock_seguridad = 25.0 × 1.0 = 25 bultos  # 1 día adicional
stock_maximo = 25.0 × 5.0 = 125 bultos    # 5 días de cobertura
punto_reorden = stock_min + stock_seg + (1.25 × venta_diaria)
              = 50 + 25 + 31.25
              = 106.25 bultos
```

**Ejemplo para Producto B (≥0.45 < 5 bultos/día):**

```python
# Si un producto vende 2.5 bultos/día (→ clasificación B):

venta_diaria_bultos = 2.5
stock_minimo = 2.5 × 3.0 = 7.5 bultos    # 3 días
stock_seguridad = 2.5 × 2.0 = 5.0 bultos  # 2 días
stock_maximo = 2.5 × 12.0 = 30 bultos     # 12 días
punto_reorden = 7.5 + 5.0 + (1.25 × 2.5)
              = 15.625 bultos
```

### Variaciones por Tienda

Algunas tiendas tienen parámetros personalizados:

```python
# Tienda AV. BOLIVAR (tienda_02)
stock_max_mult_b = 9.0   # En lugar de 12.0
stock_max_mult_bc = 15.0  # En lugar de 17.0

# Tienda MAÑONGO (tienda_03)
stock_max_mult_ab = 6.0  # En lugar de 7.0
stock_max_mult_c = 18.0  # En lugar de 26.0
```

---

## 🧮 Algoritmo Actual de Cálculo de Pedidos

### Paso 1: Cargar Parámetros de Stock

**Frontend:** [`OrderStepTwo.tsx:115-140`](../../frontend/src/components/orders/OrderStepTwo.tsx#L115-L140)

```typescript
const cargarStockParams = async () => {
  const response = await http.get(`/api/ubicaciones/${orderData.tienda_destino}/stock-params`);
  setStockParams(response.data);
};
```

**Backend:** [`main.py:712-763`](../../backend/main.py#L712-L763)

```python
@app.get("/api/ubicaciones/{ubicacion_id}/stock-params")
async def get_stock_params(ubicacion_id: str):
    from tiendas_config import TIENDAS_CONFIG
    tienda_config = TIENDAS_CONFIG.get(ubicacion_id)

    return {
        "stock_min_mult_a": tienda_config.stock_min_mult_a,
        "stock_max_mult_a": tienda_config.stock_max_mult_a,
        # ... todos los parámetros
    }
```

### Paso 2: Calcular Clasificación Dinámica

```typescript
// En el frontend, al renderizar cada producto:
const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;

let clasificacion: string;
if (ventaDiariaBultos >= 20) clasificacion = 'A';
else if (ventaDiariaBultos >= 5) clasificacion = 'AB';
else if (ventaDiariaBultos >= 0.45) clasificacion = 'B';
else if (ventaDiariaBultos >= 0.20) clasificacion = 'BC';
else if (ventaDiariaBultos >= 0.001) clasificacion = 'C';
else clasificacion = '-';
```

### Paso 3: Calcular Stock Mínimo

**Frontend:** [`OrderStepTwo.tsx:269-283`](../../frontend/src/components/orders/OrderStepTwo.tsx#L269-L283)

```typescript
const calcularStockMinimo = (producto: ProductoPedido): number => {
  const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;

  let multiplicador = 0;
  if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_min_mult_a;
  else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_min_mult_ab;
  else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_min_mult_b;
  else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_min_mult_bc;
  else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_min_mult_c;

  return ventaDiariaBultos * multiplicador;  // Resultado en BULTOS
};
```

### Paso 4: Calcular Stock de Seguridad

**Frontend:** [`OrderStepTwo.tsx:285-299`](../../frontend/src/components/orders/OrderStepTwo.tsx#L285-L299)

```typescript
const calcularStockSeguridad = (producto: ProductoPedido): number => {
  const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;

  let multiplicador = 0;
  if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_seg_mult_a;
  else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_seg_mult_ab;
  else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_seg_mult_b;
  else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_seg_mult_bc;
  else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_seg_mult_c;

  return ventaDiariaBultos * multiplicador;  // Resultado en BULTOS
};
```

### Paso 5: Calcular Punto de Reorden

**Frontend:** [`OrderStepTwo.tsx:301-309`](../../frontend/src/components/orders/OrderStepTwo.tsx#L301-L309)

```typescript
const calcularPuntoReorden = (producto: ProductoPedido): number => {
  const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;
  const stockMin = calcularStockMinimo(producto);
  const stockSeg = calcularStockSeguridad(producto);

  // Fórmula: Stock Mín + Stock Seg + 1.25 días adicionales
  return stockMin + stockSeg + (1.25 * ventaDiariaBultos);
};
```

### Paso 6: Calcular Stock Máximo

**Frontend:** [`OrderStepTwo.tsx:311-325`](../../frontend/src/components/orders/OrderStepTwo.tsx#L311-L325)

```typescript
const calcularStockMaximo = (producto: ProductoPedido): number => {
  const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;

  let multiplicador = 0;
  if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_max_mult_a;
  else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_max_mult_ab;
  else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_max_mult_b;
  else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_max_mult_bc;
  else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_max_mult_c;

  return ventaDiariaBultos * multiplicador;  // Resultado en BULTOS
};
```

### Paso 7: Calcular Cantidad Sugerida a Pedir

**Frontend:** [`OrderStepTwo.tsx:327-355`](../../frontend/src/components/orders/OrderStepTwo.tsx#L327-L355)

```typescript
const calcularPedidoSugerido = (producto: ProductoPedido): number => {
  if (!stockParams || producto.prom_ventas_5dias_unid <= 0) return 0;

  const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;
  const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
  const stockTotalBultos = stockTotalUnidades / producto.cantidad_bultos;
  const stockTotalDias = stockTotalUnidades / producto.prom_ventas_5dias_unid;

  // Calcular punto de reorden en días
  const puntoReordenBultos = calcularPuntoReorden(producto);
  const puntoReordenDias = puntoReordenBultos / ventaDiariaBultos;

  // Calcular stock máximo en bultos
  const stockMaximoBultos = calcularStockMaximo(producto);

  // ✅ DECISIÓN: Si Stock Total (días) <= Punto de Reorden (días), pedir
  if (stockTotalDias <= puntoReordenDias) {
    // Sugerido = Stock Máximo - Stock Total (en bultos)
    const sugeridoSinLimite = stockMaximoBultos - stockTotalBultos;

    // Limitar al stock disponible en CEDI origen (en bultos)
    const stockCediBultos = producto.stock_cedi_origen / producto.cantidad_bultos;
    const sugerido = Math.min(sugeridoSinLimite, stockCediBultos);

    return Math.max(0, Math.round(sugerido)); // No sugerir valores negativos
  }

  return 0; // No pedir si stock >= punto reorden
};
```

### Resumen del Algoritmo

```
1. Cargar parámetros de stock para la tienda
2. Calcular venta_diaria_bultos = prom_5dias / cantidad_bultos
3. Clasificar producto (A, AB, B, BC, C) según umbral de venta
4. Calcular stock_minimo = venta_diaria × multiplicador_min[clasificación]
5. Calcular stock_seguridad = venta_diaria × multiplicador_seg[clasificación]
6. Calcular punto_reorden = stock_min + stock_seg + (1.25 × venta_diaria)
7. Calcular stock_maximo = venta_diaria × multiplicador_max[clasificación]
8. Calcular stock_total_dias = stock_total_unidades / prom_ventas_5dias
9. SI stock_total_dias <= punto_reorden_dias:
      cantidad_sugerida = stock_maximo - stock_total (en bultos)
      cantidad_sugerida = MIN(cantidad_sugerida, stock_cedi)
   SINO:
      cantidad_sugerida = 0
10. Retornar cantidad_sugerida (redondeada a entero)
```

---

## ⚠️ Análisis Crítico de la Lógica Actual

### ✅ Lo que Funciona Bien

1. **Clasificación Dinámica:**
   - Se recalcula en tiempo real con datos actuales
   - No depende de configuración manual desactualizada
   - Se adapta automáticamente a cambios en ventas

2. **Parámetros Diferenciados:**
   - Productos de alta rotación (A) tienen menor stock (2-5 días)
   - Productos de baja rotación (C) tienen mayor stock (15-26 días)
   - Hace sentido económico: menos capital inmovilizado en productos A

3. **Validación de Disponibilidad:**
   - Limita cantidad sugerida al stock disponible en CEDI
   - Previene pedidos imposibles de cumplir

4. **Punto de Reorden Inteligente:**
   - Combina stock mínimo + seguridad + buffer (1.25 días)
   - Proporcional a la velocidad de venta

### ❌ Problemas Identificados

#### 1. **Umbral de Producto A es Extremadamente Alto**

```typescript
if (ventaDiariaBultos >= 20) return 'A';  // ← 20 BULTOS/DÍA
```

**Problema:**
- Si un bulto = 12 unidades, entonces 20 bultos = **240 unidades/día**
- Si un bulto = 24 unidades, entonces 20 bultos = **480 unidades/día**
- Muy pocos productos califican como "A"
- La mayoría son clasificados como B o C

**Impacto:**
- Subutilización de parámetros optimizados para productos A
- Productos que deberían ser A se tratan como AB o B
- Mayor riesgo de stockout en productos críticos

**Solución Sugerida:**
```typescript
// Basado en unidades/día en lugar de bultos/día
const ventaDiariaUnidades = producto.prom_ventas_5dias_unid;

if (ventaDiariaUnidades >= 50) return 'A';      // 50 unidades/día
else if (ventaDiariaUnidades >= 20) return 'AB'; // 20-49 unidades/día
else if (ventaDiariaUnidades >= 5) return 'B';   // 5-19 unidades/día
else if (ventaDiariaUnidades >= 1) return 'BC';  // 1-4 unidades/día
else if (ventaDiariaUnidades >= 0.1) return 'C'; // 0.1-0.9 unidades/día
```

#### 2. **No Considera Variabilidad de Demanda (XYZ)**

**Problema:**
- Todos los productos se tratan igual, sin importar si:
  - **Producto X:** Vende 10 unidades todos los días (predecible)
  - **Producto Z:** Vende 0, 0, 50, 0, 30, 0, 20 (errático)

**Impacto:**
- Stock de seguridad inadecuado para productos erráticos
- Riesgo de stockout en productos variables
- Exceso de inventario en productos estables

**Solución:**
```typescript
// Calcular Coeficiente de Variación (CV)
const calcularVariabilidad = (producto: ProductoPedido): string => {
  // CV = desviación_estándar / media
  const cv = producto.std_ventas / producto.prom_ventas_5dias_unid;

  if (cv < 0.5) return 'X';  // Predecible
  if (cv <= 1.0) return 'Y'; // Variable
  return 'Z';                // Errático
};

// Ajustar stock de seguridad por variabilidad
const ajustarPorVariabilidad = (stockSeg: number, xyz: string): number => {
  if (xyz === 'X') return stockSeg * 0.8;  // Reducir 20%
  if (xyz === 'Z') return stockSeg * 1.5;  // Aumentar 50%
  return stockSeg;
};
```

#### 3. **Stock de Seguridad No Usa Desviación Estándar**

**Actual:**
```typescript
stock_seguridad = venta_diaria × multiplicador_fijo
```

**Debería ser (teoría científica):**
```typescript
stock_seguridad = z_score × desviacion_estandar × sqrt(lead_time_dias)
```

**Problema:**
- No refleja el riesgo real de cada producto
- No se ajusta por lead time real (asume implícito en multiplicador)
- No considera nivel de servicio deseado (99%, 95%, 90%)

#### 4. **Usa Promedio de Solo 5 Días**

```typescript
const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;
```

**Problema:**
- **Muy sensible a fluctuaciones de corto plazo**
- Un fin de semana largo puede distorsionar completamente la clasificación
- No captura tendencias de medio plazo (crecimiento/declive)

**Ejemplo:**
```
Semana 1-7: vende 10 unid/día
Últimos 5 días (fin de semana + feriado): vende 50 unid/día

Promedio 5 días: 50 unid/día → Clasificación A
Promedio real largo plazo: 10 unid/día → Debería ser B

Resultado: Sobre-pedido masivo
```

**Solución:**
```typescript
// Usar promedio de 20-30 días para clasificación estable
const ventaDiaria20d = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;

// Detectar tendencia
const tendencia = (prom_5d - prom_20d) / prom_20d;
if (tendencia > 0.2) {
  // Creciendo >20% → Ajustar al alza
  ventaDiaria = prom_5d;
} else if (tendencia < -0.2) {
  // Cayendo >20% → Ajustar a la baja
  ventaDiaria = prom_5d;
} else {
  // Estable → Usar promedio medio
  ventaDiaria = (prom_5d * 0.3) + (prom_20d * 0.7);
}
```

#### 5. **No Detecta Estacionalidad**

**Problema:**
- No ajusta por patrones semanales (fines de semana venden más)
- No ajusta por quincenas (pago de nómina)
- No ajusta por días festivos

**Impacto:**
- Stockouts recurrentes en fines de semana
- Exceso de inventario a mitad de mes

**Solución:**
```typescript
const calcularFactorEstacional = (fecha: Date): number => {
  const diaSemana = fecha.getDay();
  const diaDelMes = fecha.getDate();

  let factor = 1.0;

  // Fin de semana (Sábado-Domingo)
  if (diaSemana === 6 || diaSemana === 0) {
    factor *= 1.4;  // +40% ventas
  }

  // Quincena (días 1-7 y 15-22)
  if ((diaDelMes >= 1 && diaDelMes <= 7) ||
      (diaDelMes >= 15 && diaDelMes <= 22)) {
    factor *= 1.2;  // +20% ventas (pago de nómina)
  }

  return factor;
};
```

#### 6. **Punto de Reorden con Constante Mágica**

```typescript
return stockMin + stockSeg + (1.25 * ventaDiariaBultos);
                              ^^^^
```

**Pregunta:** ¿Por qué 1.25? ¿De dónde sale?

**Problema:**
- Constante arbitraria sin justificación
- No se ajusta por lead time real
- No se ajusta por clasificación ABC

**Solución:**
```typescript
const calcularPuntoReorden = (producto: ProductoPedido): number => {
  const ventaDiaria = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
  const leadTimeDias = obtenerLeadTime(producto);  // Del proveedor o config
  const stockSeguridad = calcularStockSeguridad(producto);

  // ROP = Demanda durante lead time + Stock de seguridad
  const demandaDuranteLeadTime = ventaDiaria * leadTimeDias;
  const rop = demandaDuranteLeadTime + stockSeguridad;

  return rop;
};
```

#### 7. **No Valida Lotes Mínimos del Proveedor**

**Problema:**
- Puede sugerir 3.7 bultos
- Proveedor requiere pedido mínimo de 5 bultos o múltiplos de 12

**Solución:**
```typescript
const ajustarPorLotes = (cantidad: number, loteMinimo: number, loteMultiplo: number): number => {
  // Si es menor al mínimo, pedir el mínimo
  if (cantidad < loteMinimo) return loteMinimo;

  // Redondear al múltiplo más cercano
  return Math.ceil(cantidad / loteMultiplo) * loteMultiplo;
};
```

---

## 🚀 Lógica Recomendada - Clase Mundial

### Fase 1: Clasificación ABC-XYZ Mejorada

#### Ajustar Umbrales ABC (Basado en Unidades, no Bultos)

```typescript
const clasificarProducto = (producto: ProductoPedido): string => {
  // Usar promedio 20 días (más estable que 5 días)
  const ventaDiariaUnidades = producto.prom_ventas_20dias_unid;

  // Umbrales ajustados a realidad de La Granja
  if (ventaDiariaUnidades >= 50) return 'A';      // Alta rotación
  if (ventaDiariaUnidades >= 20) return 'AB';     // Alta-Media
  if (ventaDiariaUnidades >= 5) return 'B';       // Media
  if (ventaDiariaUnidades >= 1) return 'BC';      // Media-Baja
  if (ventaDiariaUnidades >= 0.1) return 'C';     // Baja
  return '-';                                      // Insignificante
};
```

#### Agregar Dimensión XYZ (Variabilidad)

```typescript
const clasificarVariabilidad = (producto: ProductoPedido): string => {
  // Calcular Coeficiente de Variación (CV)
  // CV = std_dev / mean

  // Obtener ventas diarias de últimos 30 días
  const ventasDiarias = obtenerVentasDiarias(producto, 30);
  const mean = ventasDiarias.reduce((a, b) => a + b) / ventasDiarias.length;
  const variance = ventasDiarias.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / ventasDiarias.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  // Clasificar
  if (cv < 0.5) return 'X';   // Predecible (baja variabilidad)
  if (cv <= 1.0) return 'Y';  // Variable (media variabilidad)
  return 'Z';                 // Errático (alta variabilidad)
};
```

#### Cuadrantes ABC-XYZ (9 combinaciones)

| ABC-XYZ | Estrategia | Stock Seg | Revisión | Ejemplo |
|---------|-----------|-----------|----------|---------|
| **A-X** | Just-in-Time | 0.8× | Diaria | Harina PAN |
| **A-Y** | Stock Buffer | 1.0× | Diaria | Pan |
| **A-Z** | Monitoreo Continuo | 1.5× | Diaria | Helados |
| **B-X** | EOQ Clásico | 1.0× | Semanal | Aceite |
| **B-Y** | Stock Seguridad | 1.2× | Semanal | Arroz |
| **B-Z** | Pedidos Frecuentes | 1.5× | Semanal | Verduras |
| **C-X** | Pedido Mensual | 0.8× | Mensual | Especias |
| **C-Y** | Pedido Trimestral | 1.0× | Mensual | Utensilios |
| **C-Z** | Bajo Demanda | 1.3× | Mensual | Gourmet |

### Fase 2: Stock de Seguridad Científico

```typescript
const calcularStockSeguridadCientifico = (producto: ProductoPedido): number => {
  // Fórmula: SS = Z × σ × √(LT)

  // 1. Z-score según nivel de servicio deseado
  const zScores = {
    'A': 2.33,   // 99% nivel de servicio
    'AB': 2.05,  // 98%
    'B': 1.65,   // 95%
    'BC': 1.28,  // 90%
    'C': 0.84,   // 80%
  };
  const abc = clasificarProducto(producto);
  let z = zScores[abc] || 1.65;

  // 2. Ajustar Z por variabilidad XYZ
  const xyz = clasificarVariabilidad(producto);
  if (xyz === 'X') z *= 0.8;   // Reducir para predecibles
  if (xyz === 'Z') z *= 1.3;   // Aumentar para erráticos

  // 3. Desviación estándar de demanda diaria
  const stdDemanda = calcularDesviacionEstandar(producto, 30);

  // 4. Lead time (días entre pedido y recepción)
  const leadTimeDias = obtenerLeadTime(producto) || 7;

  // 5. Calcular stock de seguridad
  const ss = z * stdDemanda * Math.sqrt(leadTimeDias);

  return ss;
};
```

### Fase 3: Pronóstico Adaptativo

```typescript
const calcularPronosticoInteligente = (producto: ProductoPedido, dias: number): number => {
  const abc = clasificarProducto(producto);
  const xyz = clasificarVariabilidad(producto);

  // Detectar tendencia
  const tendencia = detectarTendencia(producto);  // 'creciente', 'estable', 'decreciente'

  // Factor estacional
  const factorEstacional = calcularFactorEstacional(new Date());

  let forecastBase: number;

  // Método según tipo de producto
  if (xyz === 'X') {
    // Predecible: Promedio móvil ponderado
    forecastBase = (
      producto.prom_ventas_5dias_unid * 0.5 +
      producto.prom_ventas_20dias_unid * 0.3 +
      producto.prom_ventas_8sem_unid * 0.2
    );
  } else if (xyz === 'Y') {
    // Variable: Suavizado exponencial
    const alpha = 0.3;
    forecastBase = alpha * producto.prom_ventas_5dias_unid +
                   (1 - alpha) * producto.prom_ventas_20dias_unid;
  } else {
    // Errático: Método conservador (máximo)
    forecastBase = Math.max(
      producto.prom_ventas_5dias_unid,
      producto.prom_ventas_20dias_unid,
      producto.prom_mismo_dia_unid
    );
    forecastBase *= 1.2;  // Buffer 20%
  }

  // Ajustar por tendencia
  if (tendencia === 'creciente') forecastBase *= 1.15;
  if (tendencia === 'decreciente') forecastBase *= 0.90;

  // Ajustar por estacionalidad
  const forecast = forecastBase * factorEstacional * dias;

  return forecast;
};
```

### Fase 4: Punto de Reorden Científico

```typescript
const calcularPuntoReordenCientifico = (producto: ProductoPedido): number => {
  // ROP = Demanda durante LT + Stock de Seguridad

  const ventaDiaria = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
  const leadTimeDias = obtenerLeadTime(producto) || 7;

  // Demanda esperada durante lead time
  const demandaLT = ventaDiaria * leadTimeDias;

  // Stock de seguridad científico
  const ss = calcularStockSeguridadCientifico(producto);
  const ssBultos = ss / producto.cantidad_bultos;

  // Punto de reorden
  const rop = demandaLT + ssBultos;

  return rop;
};
```

### Fase 5: Cantidad Óptima con Validaciones

```typescript
const calcularCantidadOptima = (producto: ProductoPedido): number => {
  const abc = clasificarProducto(producto);
  const stockTotal = (producto.stock_tienda + producto.stock_en_transito) / producto.cantidad_bultos;
  const rop = calcularPuntoReordenCientifico(producto);

  // ¿Necesitamos pedir?
  if (stockTotal >= rop) return 0;

  // Calcular stock máximo
  const stockMax = calcularStockMaximo(producto);

  // Cantidad base
  let cantidad = stockMax - stockTotal;

  // Ajustar por lotes del proveedor
  const loteMinimo = obtenerLoteMinimo(producto);
  const loteMultiplo = obtenerLoteMultiplo(producto);

  if (cantidad < loteMinimo) cantidad = loteMinimo;
  cantidad = Math.ceil(cantidad / loteMultiplo) * loteMultiplo;

  // Validar stock CEDI
  const stockCediBultos = producto.stock_cedi_origen / producto.cantidad_bultos;
  cantidad = Math.min(cantidad, stockCediBultos);

  return Math.max(0, Math.round(cantidad));
};
```

---

## 📐 Parámetros Recomendados Ajustados

### Umbrales de Clasificación (Unidades/Día)

```typescript
const UMBRALES_ABC = {
  A: 50,    // ≥ 50 unidades/día
  AB: 20,   // 20-49 unidades/día
  B: 5,     // 5-19 unidades/día
  BC: 1,    // 1-4 unidades/día
  C: 0.1,   // 0.1-0.9 unidades/día
};

const UMBRALES_XYZ = {
  X: 0.5,   // CV < 0.5 (predecible)
  Y: 1.0,   // CV 0.5-1.0 (variable)
  Z: 999,   // CV > 1.0 (errático)
};
```

### Parámetros por Clasificación ABC

```typescript
const PARAMS_ABC = {
  A: {
    dias_stock_min: 2,
    dias_stock_max: 5,
    nivel_servicio: 0.99,  // 99%
    z_score: 2.33,
  },
  AB: {
    dias_stock_min: 3,
    dias_stock_max: 7,
    nivel_servicio: 0.98,
    z_score: 2.05,
  },
  B: {
    dias_stock_min: 5,
    dias_stock_max: 12,
    nivel_servicio: 0.95,
    z_score: 1.65,
  },
  BC: {
    dias_stock_min: 10,
    dias_stock_max: 17,
    nivel_servicio: 0.90,
    z_score: 1.28,
  },
  C: {
    dias_stock_min: 15,
    dias_stock_max: 26,
    nivel_servicio: 0.85,
    z_score: 1.04,
  },
};
```

### Factores de Ajuste por Variabilidad

```typescript
const FACTORES_XYZ = {
  X: {
    ajuste_ss: 0.8,   // Reducir SS 20%
    frecuencia: 'semanal',
  },
  Y: {
    ajuste_ss: 1.0,   // SS normal
    frecuencia: 'cada_3_dias',
  },
  Z: {
    ajuste_ss: 1.5,   // Aumentar SS 50%
    frecuencia: 'diario',
  },
};
```

---

## 🛠️ Plan de Implementación

### Fase 1: Ajustar Umbrales ABC (1 semana)

**Objetivos:**
- Cambiar clasificación de bultos/día a unidades/día
- Usar promedio 20 días en lugar de 5 días
- Validar distribución de productos por clasificación

**Tareas:**
1. Modificar función de clasificación en frontend
2. Usar `prom_ventas_20dias_unid` en lugar de `prom_ventas_5dias_unid`
3. Ajustar umbrales: A≥50, AB≥20, B≥5, BC≥1, C≥0.1 unidades/día
4. Crear dashboard de validación (cuántos productos por clase)
5. Testing A/B con 2 tiendas

**Entregables:**
- Código actualizado en `OrderStepTwo.tsx`
- Reporte de distribución antes/después
- Comparación de sugerencias antes/después

### Fase 2: Implementar Clasificación XYZ (2 semanas)

**Objetivos:**
- Calcular variabilidad (Coeficiente de Variación)
- Clasificar productos en X, Y, Z
- Ajustar stock de seguridad por variabilidad

**Tareas:**
1. Crear endpoint `/api/productos/{id}/estadisticas` con:
   - Media de ventas diarias
   - Desviación estándar
   - Coeficiente de variación
2. Agregar campo `xyz_classification` a respuesta
3. Modificar `calcularStockSeguridad()` para ajustar por XYZ
4. Crear badge visual en UI para mostrar XYZ
5. Documentar 10 productos ejemplo por cuadrante

**Entregables:**
- Endpoint de estadísticas
- Campo XYZ en UI
- Dashboard ABC-XYZ (matriz 5×3)

### Fase 3: Stock de Seguridad Científico (2 semanas)

**Objetivos:**
- Implementar fórmula SS = Z × σ × √(LT)
- Usar desviación estándar real
- Ajustar Z-score por ABC

**Tareas:**
1. Calcular desviación estándar por producto-ubicación
2. Agregar campo `std_ventas_diarias` a respuesta
3. Implementar función `calcularStockSeguridadCientifico()`
4. Crear campo `lead_time_dias` en configuración
5. Comparar SS actual vs. SS científico (validación)

**Entregables:**
- Función de SS científico
- Campo `std_ventas_diarias` en backend
- Reporte de comparación

### Fase 4: Detección de Tendencias y Estacionalidad (2 semanas)

**Objetivos:**
- Detectar si producto está creciendo/decreciente
- Ajustar forecast por estacionalidad semanal
- Ajustar forecast por quincenas

**Tareas:**
1. Crear función `detectarTendencia()` (comparar 5d vs 20d)
2. Crear función `calcularFactorEstacional()` (día semana + día mes)
3. Integrar en pronóstico
4. Testing con productos estacionales conocidos (ej: cervezas fin de semana)

**Entregables:**
- Funciones de tendencia y estacionalidad
- Forecast ajustado
- Validación con histórico

### Fase 5: UI Mejorada con Indicadores (1 semana)

**Objetivos:**
- Mostrar clasificación ABC-XYZ visualmente
- Indicar tendencia (↑ ↓ →)
- Explicar por qué se sugiere cada cantidad

**Tareas:**
1. Badge de clasificación ABC con colores
2. Badge de variabilidad XYZ
3. Ícono de tendencia (flecha)
4. Tooltip "¿Por qué se sugiere X bultos?"
5. Vista de comparación (sugerencia actual vs. nueva lógica)

**Entregables:**
- UI actualizada con badges
- Tooltip explicativo
- Vista de comparación

---

## 💡 Recomendaciones Adicionales

### 1. Validar con Datos Reales

Antes de implementar en producción:

```python
# Script de validación
import pandas as pd

def validar_nueva_logica():
    # 1. Tomar últimos 30 días de pedidos reales
    pedidos_reales = cargar_pedidos_historicos(dias=30)

    # 2. Simular qué habría sugerido la nueva lógica
    pedidos_simulados = []
    for pedido in pedidos_reales:
        sugerencia_nueva = calcular_con_nueva_logica(pedido)
        pedidos_simulados.append(sugerencia_nueva)

    # 3. Comparar
    comparacion = pd.DataFrame({
        'producto': [p.codigo for p in pedidos_reales],
        'cantidad_real': [p.cantidad for p in pedidos_reales],
        'sugerida_actual': [p.sugerida_actual for p in pedidos_reales],
        'sugerida_nueva': [p.sugerida_nueva for p in pedidos_simulados],
        'stockout_evitados': [...],
        'exceso_reducido': [...],
    })

    return comparacion
```

### 2. Métricas de Éxito

**KPIs a medir post-implementación:**

| Métrica | Baseline | Meta 3 meses | Método |
|---------|----------|--------------|--------|
| **Stockouts** | 5-8% | <2% | Productos sin stock / total |
| **Exactitud Pronóstico** | ~60% | >75% | MAPE (Mean Absolute % Error) |
| **Días Inventario** | ~45 días | <35 días | Inv. promedio / Venta diaria |
| **Rotación Inventario** | ~8×/año | >10×/año | Ventas anuales / Inv. promedio |
| **Productos Clase A bien clasificados** | ~5% | >15% | Productos A / Total |

### 3. Testing A/B

**Propuesta:**
- Implementar nueva lógica en **2 tiendas piloto** (ej: tienda_02, tienda_08)
- Mantener lógica actual en otras 14 tiendas
- Comparar resultados durante 6 semanas
- Si mejora >20% en KPIs, rollout completo

### 4. Educación al Usuario

**Crear guía visual:**
- ¿Qué significa clasificación A, AB, B, BC, C?
- ¿Por qué mi producto favorito cambió de clase?
- ¿Cómo interpretar el badge XYZ?
- ¿Qué hacer si no estoy de acuerdo con la sugerencia?

---

## 📊 Resumen Ejecutivo Final

### Situación Actual

✅ **Lo que funciona:**
- Clasificación ABC dinámica (se recalcula en tiempo real)
- Parámetros diferenciados por clasificación (A tiene menos días que C)
- Validación de stock CEDI
- Punto de reorden calculado

❌ **Lo que necesita mejora:**
- **Umbral de A muy alto** (≥20 bultos/día → pocos productos califican)
- **Usa promedio 5 días** (muy volátil, sensible a picos)
- **No considera variabilidad** (XYZ)
- **Stock seguridad fijo** (no usa desviación estándar)
- **No detecta tendencias** (creciente/decreciente)
- **No ajusta por estacionalidad** (fines de semana, quincenas)

### Impacto Esperado de Mejoras

| Mejora | Impacto | Esfuerzo | Prioridad |
|--------|---------|----------|-----------|
| **Ajustar umbral ABC a unidades** | Alto | Bajo (1 día) | 🔴 Crítico |
| **Usar promedio 20 días** | Alto | Bajo (1 día) | 🔴 Crítico |
| **Implementar XYZ** | Medio-Alto | Medio (2 sem) | 🟡 Importante |
| **SS científico** | Medio | Medio (2 sem) | 🟡 Importante |
| **Detectar tendencias** | Medio | Bajo (1 sem) | 🟢 Deseable |
| **Ajuste estacionalidad** | Medio | Bajo (1 sem) | 🟢 Deseable |

### Recomendación

**Quick Wins (Implementar YA):**
1. Cambiar clasificación ABC a unidades/día (en lugar de bultos/día)
2. Usar `prom_ventas_20dias_unid` en lugar de `prom_ventas_5dias_unid`
3. Ajustar umbrales: A≥50, AB≥20, B≥5, BC≥1, C≥0.1

**Mejoras de Medio Plazo (1-2 meses):**
4. Implementar clasificación XYZ
5. Stock de seguridad científico
6. Detección de tendencias

**Optimizaciones Avanzadas (3-6 meses):**
7. Machine Learning para forecast
8. Optimización de transporte
9. Alertas proactivas

---

**Documento preparado por:** Claude (Anthropic)
**Fecha:** 25 de Octubre 2025
**Versión:** 2.0 (Corregida con lógica real del frontend)
**Próxima revisión:** Post Quick Wins (1 semana)
