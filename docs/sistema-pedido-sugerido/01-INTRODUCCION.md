# Introducción al Sistema de Pedido Sugerido

## ¿Qué es el Sistema de Pedido Sugerido?

El **Sistema de Pedido Sugerido** es el módulo inteligente de FluxionIA que calcula automáticamente **cuánto inventario debe enviarse desde el Centro de Distribución a cada tienda**, eliminando la necesidad de hacer cálculos manuales y reduciendo drásticamente los quiebres de stock y el exceso de inventario.

### Problema que Resuelve

#### Antes de FluxionIA

- ❌ **Quiebres frecuentes:** Productos que se agotan y se pierden ventas
- ❌ **Exceso de inventario:** Capital inmovilizado en productos de baja rotación
- ❌ **Decisiones subjetivas:** Basadas en intuición del comprador
- ❌ **Pérdidas por vencimiento:** Productos perecederos que expiran
- ❌ **Espacio desperdiciado:** Tiendas con inventario desbalanceado

#### Después de FluxionIA

- ✅ **Pedidos óptimos:** Basados en datos históricos de 8 semanas
- ✅ **Nivel de servicio garantizado:** 90-97.5% según prioridad del producto
- ✅ **Inventario balanceado:** Cada producto tiene la cantidad correcta
- ✅ **Decisiones basadas en datos:** Algoritmos matemáticos probados
- ✅ **Reducción de pérdidas:** Menos vencimiento, menos capital inmovilizado

---

## ¿Cómo Funciona?

### Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA DE PEDIDO SUGERIDO                   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
         ┌────────────────────────────────────────────┐
         │  1. CLASIFICAR PRODUCTOS (ABC-XYZ)         │
         │     - Por valor económico (A, B, C)        │
         │     - Por variabilidad (X, Y, Z)           │
         │     - Matriz 9x9 de combinaciones          │
         └────────────────────────────────────────────┘
                                 │
                                 ▼
         ┌────────────────────────────────────────────┐
         │  2. ANALIZAR DEMANDA HISTÓRICA             │
         │     - Últimas 8 semanas de ventas          │
         │     - Promedio diario                      │
         │     - Variabilidad (desviación estándar)   │
         └────────────────────────────────────────────┘
                                 │
                                 ▼
         ┌────────────────────────────────────────────┐
         │  3. CALCULAR NIVEL OBJETIVO                │
         │     - Demanda durante ciclo (2.5 días)     │
         │     - Stock de seguridad (según CV)        │
         │     - Nivel objetivo = Demanda + SS        │
         └────────────────────────────────────────────┘
                                 │
                                 ▼
         ┌────────────────────────────────────────────┐
         │  4. CALCULAR CANTIDAD SUGERIDA             │
         │     - Stock actual en tienda               │
         │     - Inventario en tránsito               │
         │     - Sugerencia = Objetivo - Disponible   │
         └────────────────────────────────────────────┘
                                 │
                                 ▼
         ┌────────────────────────────────────────────┐
         │  5. GENERAR PEDIDO                         │
         │     - Validar capacidad de tienda          │
         │     - Verificar disponibilidad en CEDI     │
         │     - Crear orden de transferencia         │
         └────────────────────────────────────────────┘
```

---

## Conceptos Clave

### 1. Nivel Objetivo

**Definición:** Es la cantidad ideal de unidades que una tienda debe mantener en inventario para un producto específico.

**Fórmula:**
```
Nivel Objetivo = Demanda durante Ciclo + Stock de Seguridad
```

**Ejemplo con datos reales:**
- Producto: Arroz 1kg (Clase AX - Alto valor, estable)
- Demanda diaria: 1,800 unidades/día
- Periodo de reposición: 2.5 días
- Demanda durante ciclo: 1,800 × 2.5 = 4,500 unidades
- Stock de seguridad: 7,296 unidades (para 97.5% de nivel de servicio)
- **Nivel objetivo: 11,796 unidades**

---

### 2. Stock de Seguridad

**Definición:** Es el inventario adicional que se mantiene para proteger contra la variabilidad de la demanda y evitar quiebres de stock.

**Fórmula:**
```
Stock de Seguridad = Z × Desviación Estándar × √(Periodo) × Multiplicador SS
```

**Componentes:**
- **Z-score:** Factor estadístico basado en el nivel de servicio deseado
  - Z = 1.96 → 97.5% de nivel de servicio (productos AX, AY, AZ)
  - Z = 1.65 → 95% de nivel de servicio (productos BX, BY, BZ)
  - Z = 1.28 → 90% de nivel de servicio (productos CX, CY)
  - Z = 0.00 → Sin stock de seguridad (productos CZ)

- **Desviación Estándar:** Mide qué tan variable es la demanda diaria
- **√(Periodo):** Raíz cuadrada de 2.5 días = 1.58
- **Multiplicador SS:** Ajuste fino por clasificación (1.0 a 1.5)

**Ejemplo con datos reales:**
- Producto: Aceite 900ml (Clase BY - Medio valor, media variabilidad)
- Desviación estándar diaria: 2,876 unidades
- Z-score: 1.65 (95% nivel de servicio)
- Periodo: 2.5 días (√2.5 = 1.58)
- Multiplicador SS: 1.10
- **SS = 1.65 × 2,876 × 1.58 × 1.10 = 8,210 unidades**

---

### 3. Inventario en Tránsito

**Definición:** Son las unidades que ya fueron solicitadas al CEDI pero aún no han sido recibidas en la tienda.

**Estados que se consideran "en tránsito":**
- `aprobado_gerente` - Pedido aprobado por el gerente
- `en_picking` - Siendo preparado en el CEDI
- `en_transito` - En camino a la tienda
- `despachado` - Enviado desde el CEDI

**Por qué es importante:**
Si la tienda ya pidió 500 unidades que están en camino, el sistema NO debe volver a sugerirlas. El cálculo las resta del pedido sugerido.

---

### 4. Cantidad Sugerida

**Definición:** Es la cantidad óptima que debe enviarse desde el CEDI a la tienda en el próximo pedido.

**Fórmula:**
```
Cantidad Sugerida = MAX(0, Nivel Objetivo - (Stock Actual + En Tránsito))
```

**Ejemplo con datos reales:**
- Producto: Harina PAN 1kg (Clase AX)
- Nivel objetivo: 11,797 unidades
- Stock actual en tienda: 3,500 unidades
- En tránsito: 1,200 unidades
- **Cantidad sugerida = 11,797 - (3,500 + 1,200) = 7,097 unidades**

**Lógica:**
- Si el resultado es **positivo** → Hay déficit, se sugiere pedido
- Si el resultado es **cero o negativo** → No se sugiere pedido (hay suficiente inventario)

---

## Clasificación ABC-XYZ

### Matriz de 9 Cuadrantes

| Clase | Valor Económico | Variabilidad | Prioridad | Z-Score | Nivel Servicio | Stock Seguridad |
|-------|----------------|--------------|-----------|---------|----------------|-----------------|
| **AX** | Alto | Estable | 1 (Máxima) | 1.96 | 97.5% | Sí (×1.00) |
| **AY** | Alto | Media | 2 | 1.96 | 97.5% | Sí (×1.25) |
| **AZ** | Alto | Errática | 3 | 1.96 | 97.5% | Sí (×1.50) |
| **BX** | Medio | Estable | 4 | 1.65 | 95.0% | Sí (×1.00) |
| **BY** | Medio | Media | 5 | 1.65 | 95.0% | Sí (×1.10) |
| **BZ** | Medio | Errática | 6 | 1.65 | 95.0% | Sí (×1.25) |
| **CX** | Bajo | Estable | 7 | 1.28 | 90.0% | Sí (×1.00) |
| **CY** | Bajo | Media | 8 | 1.28 | 90.0% | Sí (×0.50) |
| **CZ** | Bajo | Errática | 9 (Mínima) | 0.00 | Básico | **NO** |

### Criterios de Clasificación

**Clasificación A, B, C (Valor Económico):**
- **A:** Top 20% productos por valor de ventas → 80% del valor total
- **B:** Siguiente 30% productos → 15% del valor total
- **C:** Restante 50% productos → 5% del valor total

**Clasificación X, Y, Z (Variabilidad):**
- **X:** Coeficiente de Variación < 0.50 (Demanda estable)
- **Y:** Coeficiente de Variación 0.50 - 1.00 (Demanda media)
- **Z:** Coeficiente de Variación > 1.00 (Demanda errática)

```
Coeficiente de Variación (CV) = Desviación Estándar / Promedio
```

---

## Ejemplos Prácticos

### Ejemplo 1: Producto AX (Alta Prioridad)

**Datos:**
- Producto: 004962 - Arroz 1kg
- Clasificación: AX (Alto valor, estable)
- Demanda diaria: 1,800 unidades
- Desviación estándar: 273 unidades
- Stock actual: 5,000 unidades
- En tránsito: 0 unidades

**Cálculo:**
1. **Demanda durante ciclo** = 1,800 × 2.5 × 1.00 = **4,500 unidades**
2. **Stock de seguridad** = 1.96 × 273 × √2.5 × 1.00 = **846 unidades**
3. **Nivel objetivo** = 4,500 + 846 = **5,346 unidades**
4. **Cantidad sugerida** = 5,346 - (5,000 + 0) = **346 unidades**

**Decisión:** Enviar 346 unidades desde el CEDI.

---

### Ejemplo 2: Producto CZ (Baja Prioridad)

**Datos:**
- Producto: 004871 - Producto de baja rotación
- Clasificación: CZ (Bajo valor, errático)
- Demanda diaria: 5,602 unidades
- Stock actual: 8,000 unidades
- En tránsito: 500 unidades

**Cálculo:**
1. **Demanda durante ciclo** = 5,602 × 2.5 × 0.75 = **10,504 unidades**
2. **Stock de seguridad** = **0 unidades** (CZ no tiene SS)
3. **Nivel objetivo** = 10,504 + 0 = **10,504 unidades**
4. **Cantidad sugerida** = 10,504 - (8,000 + 500) = **2,004 unidades**

**Decisión:** Enviar 2,004 unidades (demanda reducida al 75% por ser clase C).

---

## Preguntas Frecuentes (FAQ)

### ¿Por qué 2.5 días?
El periodo de reposición de 2.5 días se calcula como:
- **Lead time (tiempo de entrega):** 1.5 días
- **Review cycle (ciclo de revisión):** 1.0 día (pedidos diarios)
- **Total:** 1.5 + 1.0 = 2.5 días

### ¿Se puede ajustar el nivel de servicio por tienda?
**Sí.** Cada tienda puede tener sus propios parámetros para las 9 clasificaciones ABC-XYZ. Por ejemplo:
- Tienda de alto tráfico puede usar Z=1.96 para más productos
- Tienda pequeña puede reducir stock de seguridad para productos C

### ¿Qué pasa si hay errores en la demanda histórica?
El sistema usa **8 semanas de historia** para calcular promedios. Si detecta datos anormales:
- Revisa las últimas 8 semanas de ventas
- Calcula desviación estándar para detectar outliers
- Los gerentes pueden ajustar manualmente usando la tabla de auditoría

### ¿Cómo se manejan productos nuevos sin historial?
Para productos sin 8 semanas de datos:
- Se puede usar demanda proyectada manualmente
- Se puede copiar el patrón de productos similares
- Se recomienda clasificar como "CY" inicialmente (baja prioridad, SS moderado)

### ¿El sistema genera el pedido automáticamente?
**No.** El sistema **sugiere** cantidades óptimas. El comprador o gerente:
1. Revisa las sugerencias
2. Puede ajustar manualmente si es necesario
3. Aprueba el pedido final
4. Todos los cambios manuales quedan registrados en auditoría

---

## Beneficios del Sistema

### Para el Negocio
- ✅ **Reducción de quiebres:** 97.5% disponibilidad en productos A
- ✅ **Optimización de capital:** Menos inventario inmovilizado en productos C
- ✅ **Decisiones objetivas:** Basadas en datos, no en intuición
- ✅ **Trazabilidad completa:** Auditoría de todos los cambios manuales

### Para los Compradores
- ✅ **Menos cálculos manuales:** El sistema calcula automáticamente
- ✅ **Priorización clara:** Saben qué productos son críticos
- ✅ **Alertas de déficit:** Notificaciones cuando hay faltantes
- ✅ **Flexibilidad:** Pueden ajustar sugerencias según contexto

### Para las Tiendas
- ✅ **Menos faltantes:** Productos disponibles cuando los clientes los buscan
- ✅ **Menos excesos:** No se acumula inventario de baja rotación
- ✅ **Espacio optimizado:** Inventario balanceado según ventas reales
- ✅ **Menos vencimientos:** Especialmente en productos perecederos

---

**Siguiente:** [Lógica de Nivel Objetivo](02-LOGICA_NIVEL_OBJETIVO.md) - Fórmulas detalladas y matemáticas del sistema.
