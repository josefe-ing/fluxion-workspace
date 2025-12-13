---
sidebar_position: 2
title: Crear Pedido
---

# Crear un Pedido Inter-CEDI

Guía paso a paso para crear un pedido de reposición del CEDI Caracas desde los CEDIs de Valencia.

## Acceso

1. Ve a **Pedidos Inter-CEDI** en el menú
2. Click en **Nuevo Pedido**

## Paso 1: Configuración

Configura los parámetros del pedido:

### CEDI Destino

Selecciona el CEDI que recibirá la mercancía:
- **CEDI Caracas** - Abastece tiendas de la región Caracas (Artigas, Paraíso)

### Días de Cobertura por Clase ABC

| Clase | Default | Descripción |
|-------|---------|-------------|
| **A** | 7 días | Productos de mayor rotación |
| **B** | 14 días | Rotación media |
| **C** | 30 días | Baja rotación |
| **D** | 45 días | Muy baja rotación |

Puedes ajustar estos valores según la capacidad de almacenamiento del CEDI destino.

### Lead Time

Tiempo de entrega Valencia → Caracas: **2 días** por defecto.

## Paso 2: Selección de Productos

El sistema calcula automáticamente qué productos necesita el CEDI y cuánto pedir.

### ¿Cómo se calcula la cantidad sugerida?

```
Cantidad_Sugerida = Stock_Max - Stock_Actual_CEDI
```

Donde **Stock_Max** se calcula según:

```
Stock_Max = Stock_Min + (Demanda_Regional × Días_Cobertura)
Stock_Min = (Demanda_Regional × Lead_Time) + Stock_Seguridad
```

---

### Ejemplo Real: Harina PAN 1kg (Clase A)

**Datos de producción** (CEDI Caracas):

| Campo | Valor |
|-------|-------|
| P75 Artigas | 630 unid/día |
| P75 Paraíso | 280 unid/día |
| **P75 Regional** | **910 unid/día** |
| σ Regional | ~273 unid (30% variabilidad) |
| Stock CEDI Caracas | 2,500 unid |
| Stock CEDI Seco | 15,000 unid |
| Lead Time | 2 días |
| Días Cobertura | 7 días (Clase A) |
| Unid/Bulto | 20 |

**Cálculo:**

```
1. Stock de Seguridad
   SS = Z × σ × √L
   SS = 2.33 × 273 × √2
   SS = 2.33 × 273 × 1.414
   SS = 899 unidades

2. Stock Mínimo (Punto de Reorden)
   Stock_Min = (P75 × Lead_Time) + SS
   Stock_Min = (910 × 2) + 899
   Stock_Min = 1,820 + 899 = 2,719 unidades

3. Stock Máximo
   Stock_Max = Stock_Min + (P75 × Días_Cobertura)
   Stock_Max = 2,719 + (910 × 7)
   Stock_Max = 2,719 + 6,370 = 9,089 unidades

4. Cantidad Sugerida
   Sugerido = Stock_Max - Stock_Actual
   Sugerido = 9,089 - 2,500 = 6,589 unidades

5. Conversión a Bultos
   Bultos = ceil(6,589 / 20) = 330 bultos
```

**Resultado:** El sistema sugiere **330 bultos** (6,600 unidades)

---

### Ejemplo Real: Queso Guayanés 500g (Clase B)

| Campo | Valor |
|-------|-------|
| P75 Regional | 120 unid/día |
| σ Regional | ~36 unid |
| Stock CEDI Caracas | 150 unid |
| Stock CEDI Frío | 2,400 unid |
| Lead Time | 2 días |
| Días Cobertura | 14 días (Clase B) |
| Unid/Bulto | 24 |

**Cálculo:**

```
1. Stock de Seguridad
   SS = 1.88 × 36 × √2
   SS = 1.88 × 36 × 1.414 = 96 unidades

2. Stock Mínimo
   Stock_Min = (120 × 2) + 96 = 336 unidades

3. Stock Máximo
   Stock_Max = 336 + (120 × 14) = 336 + 1,680 = 2,016 unidades

4. Cantidad Sugerida
   Sugerido = 2,016 - 150 = 1,866 unidades
   Bultos = ceil(1,866 / 24) = 78 bultos
```

**Resultado:** Sugiere **78 bultos**

---

### Ejemplo Real: Lechuga Romana (Clase D)

| Campo | Valor |
|-------|-------|
| P75 Regional | 45 unid/día |
| Stock CEDI Caracas | 20 unid |
| Stock CEDI Verde | 500 unid |
| Lead Time | 2 días |
| Días Cobertura | 45 días (Clase D) |
| Unid/Bulto | 12 |

**Cálculo (Método Padre Prudente para Clase D):**

```
1. Stock de Seguridad (30% de demanda durante ciclo)
   SS = 0.30 × P75 × Lead_Time
   SS = 0.30 × 45 × 2 = 27 unidades

2. Stock Mínimo
   Stock_Min = (45 × 2) + 27 = 117 unidades

3. Stock Máximo
   Stock_Max = 117 + (45 × 45) = 117 + 2,025 = 2,142 unidades

4. Cantidad Sugerida
   Sugerido = 2,142 - 20 = 2,122 unidades

   ⚠️ LIMITADO por stock origen (500 unidades disponibles)
   Sugerido_Final = min(2,122, 500) = 500 unidades
   Bultos = ceil(500 / 12) = 42 bultos
```

**Resultado:** Sugiere **42 bultos** (limitado por stock en CEDI Verde)

---

### Tabla de Productos

| Columna | Descripción |
|---------|-------------|
| **Origen** | CEDI origen del producto (Seco/Frío/Verde) |
| **Código** | Código del producto |
| **Barras** | Código de barras |
| **Descripción** | Nombre del producto |
| **U/B** | Unidades por bulto |
| **ABC** | Clasificación del producto |
| **Stk Orig** | Stock disponible en CEDI origen |
| **Stk CCS** | Stock actual en CEDI Caracas |
| **D.CCS** | Días de stock en CEDI Caracas |
| **Stk Tda** | Stock total en tiendas de la región |
| **D.Tda** | Días de stock en tiendas |
| **P75** | Demanda regional P75 (bultos/día) |
| **Pri** | Prioridad de reposición (1-10) |
| **Sugerido** | Cantidad sugerida (bultos) |
| **A Pedir** | Cantidad a pedir (editable) |

### Colores por CEDI Origen

- 🟨 **Amarillo**: CEDI Seco (abarrotes, limpieza)
- 🟦 **Azul**: CEDI Frío (carnes, lácteos)
- 🟩 **Verde**: CEDI Verde (fruver)

### Filtros Disponibles

- **Por CEDI Origen**: Seco, Frío, Verde, o Todos
- **Por ABC**: Filtrar por clasificación A, B, C, D
- **Por Prioridad**: Solo productos con prioridad alta (1-4)
- **Buscar**: Por código, código de barras, o descripción

### Modales de Detalle

Click en cualquier valor numérico para ver el detalle del cálculo:

| Click en | Modal que abre |
|----------|----------------|
| **Stock Origen** | Detalle de stock en CEDI origen |
| **Stock CCS** | Historial de inventario CEDI Caracas |
| **Días Stock** | Cálculo de días de cobertura |
| **Stock Tiendas** | Desglose de stock por tienda de la región |
| **P75** | Historial de ventas regional con desglose por tienda |
| **Prioridad** | Matriz de prioridad y cómo se calculó |
| **Sugerido** | Fórmula completa del cálculo |

### Stock Limitado

Cuando el stock en el CEDI origen es menor a la cantidad ideal, el sistema muestra:

```
⚠️ Stock limitado
Ideal: 78 bultos → Posible: 42 bultos
Faltan: 36 bultos
```

Esto indica que el CEDI origen no tiene suficiente inventario para cubrir la demanda calculada.

## Paso 3: Confirmación

Revisa el resumen del pedido antes de guardar:

### Resumen por CEDI Origen

| CEDI | Productos | Bultos |
|------|-----------|--------|
| Seco | 245 | 1,230 |
| Frío | 89 | 456 |
| Verde | 34 | 178 |
| **Total** | **368** | **1,864** |

### Validaciones

El sistema verifica:
- ✅ Cantidad mínima de pedido (1 bulto)
- ✅ Disponibilidad en CEDI origen
- ✅ Al menos un producto seleccionado

### Confirmar

Click en **Guardar Pedido** para crear el pedido en estado **Borrador**.

## Después de Crear

El pedido queda en estado **Borrador** y aparece en la lista principal.

Desde ahí puedes:
- **Editar**: Modificar cantidades
- **Confirmar**: Pasar a logística
- **Exportar Excel**: Descargar por CEDI origen
- **Eliminar**: Solo en estado borrador

## Estadísticas de Referencia

Datos típicos de un pedido Inter-CEDI (región Caracas):

| Métrica | Valor |
|---------|-------|
| Total productos | ~400 |
| Productos Clase A | ~50 (12%) |
| Productos Clase B | ~150 (38%) |
| Productos Clase C | ~200 (50%) |
| Bultos CEDI Seco | ~60% del total |
| Bultos CEDI Frío | ~30% del total |
| Bultos CEDI Verde | ~10% del total |

## Próximos Pasos

- [Fórmulas Detalladas](/modulos/pedidos-inter-cedi/formulas)
- [Columnas de la Tabla](/modulos/pedidos-inter-cedi/columnas)
