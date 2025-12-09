---
sidebar_position: 2
title: Crear Pedido
---

# Crear un Pedido Sugerido

Guía paso a paso para crear un pedido optimizado usando el wizard inteligente.

## Acceso

1. Ve a **Pedidos Sugeridos** en el menú
2. Click en **Nuevo Pedido**

## Paso 1: Origen y Destino

Selecciona las ubicaciones:

### Origen (CEDI)
De dónde vendrá la mercancía:
- **CEDI Caracas** - Para tiendas de Caracas (Artigas, Paraíso)
- **CEDI Seco** - Para tiendas de Valencia

### Destino (Tienda)
La tienda que recibirá el pedido.

## Paso 2: Selección de Productos

El sistema calcula automáticamente qué productos necesitas y cuánto pedir.

### ¿Cómo se calcula la cantidad sugerida?

```
Cantidad Sugerida = Stock Máximo - Stock Actual
```

Donde **Stock Máximo** se calcula según la clase ABC:

| Clase | Fórmula MAX | Días Cobertura |
|-------|-------------|----------------|
| **A** | ROP + (P75 × 5 días) | 5 días |
| **B** | ROP + (P75 × 7 días) | 7 días |
| **C** | ROP + (P75 × 30 días) | 30 días |

### Ejemplo Real: Harina PAN 1kg (Clase A)

**Datos de producción** (tienda_17 Artigas):
| Campo | Valor |
|-------|-------|
| P75 | 630 unid/día |
| Stock Actual | -1,071 unid (deuda) |
| Stock CEDI | 5,736 unid |
| Unid/Bulto | 20 |

**Cálculo:**
```
ROP = 1,454 unidades
MAX = 1,454 + (630 × 7) = 5,864 unidades

Déficit = MAX - Stock Actual
Déficit = 5,864 - (-1,071) = 6,935 unidades

Bultos = ceil(6,935 / 20) = 347 bultos
```

**Resultado:** El sistema sugiere **347 bultos** (6,940 unidades)

---

### Ejemplo Real: Azúcar Doce Día 1kg (Clase A)

| Campo | Valor |
|-------|-------|
| P75 | 386 unid/día |
| Stock Actual | 10 unid |
| Stock CEDI | 6,933 unid |
| Unid/Bulto | 30 |

**Cálculo:**
```
MAX = 3,483 unidades
Déficit = 3,483 - 10 = 3,473 unidades
Bultos = ceil(3,473 / 30) = 116 bultos
```

**Resultado:** Sugiere **116 bultos**

---

### Ejemplo Real: Afeitadora Dorco (Clase C)

| Campo | Valor |
|-------|-------|
| P75 | 22 unid/día |
| Stock Actual | 0 unid |
| Unid/Bulto | 2,000 |

**Cálculo (Clase C usa 30 días cobertura):**
```
MAX = 712.50 unidades
Déficit = 712.50 - 0 = 712.50 unidades
Bultos = ceil(712.50 / 2000) = 1 bulto
```

**Resultado:** Sugiere **1 bulto** (2,000 unidades)

> **Nota:** Clase C pide paquetes completos aunque parezca mucho. Esto es intencional para reducir frecuencia de pedidos.

### Tabla de Productos

| Columna | Descripción |
|---------|-------------|
| **Código** | Código del producto |
| **Descripción** | Nombre del producto |
| **U/B** | Unidades por bulto |
| **P75** | Percentil 75 de ventas diarias |
| **STK** | Stock actual en tienda |
| **CEDI** | Stock disponible en CEDI |
| **ABC** | Clasificación del producto |
| **SS** | Stock de seguridad |
| **ROP** | Punto de reorden |
| **MAX** | Stock máximo |
| **SUG** | Cantidad sugerida (bultos) |
| **PEDIR** | Cantidad a pedir (editable) |

### Ajustar Cantidades

Puedes modificar las cantidades sugeridas:
- Click en el campo **PEDIR**
- Ingresa la cantidad deseada
- El sistema recalculará totales

### Filtros Disponibles

- **Por CEDI**: Ver solo productos de un CEDI específico
- **Por Prioridad**: Alta (crítico), Media (urgente), Baja (óptimo)
- **Por ABC**: Filtrar por clasificación A, B, C
- **Buscar**: Por código o nombre (soporta múltiples separados por coma)

### Casos Especiales

#### Envío de Prueba vs Referencia Regional

Cuando un producto tiene pocas o ninguna venta local, el sistema usa datos de tiendas de referencia (ej: Artigas) para sugerir cantidades. Hay **dos casos diferentes**:

##### 1. Envío de Prueba (P75 local = 0)

Producto que **nunca se ha vendido** en tu tienda pero **sí se vende en otras tiendas similares**.

| Característica | Valor |
|----------------|-------|
| **Condición** | P75 local = 0 y P75 referencia > 0 |
| **Sugerencia** | **Mínimo 1 bulto** (independiente del cálculo) |
| **Método** | `envio_prueba` |
| **Nota** | "Envío prueba (ref: ARTIGAS)" |

**Lógica:** Como no hay historial de ventas, el sistema sugiere enviar al menos 1 bulto para "probar" si el producto tiene demanda en esa tienda.

##### 2. Referencia Regional (P75 local muy bajo)

Producto con **muy pocas ventas locales** pero con **demanda significativa** en tiendas de referencia.

| Característica | Valor |
|----------------|-------|
| **Condición** | P75 local > 0 pero < 1 unid/día, y P75 referencia > 3× P75 local |
| **Sugerencia** | Calculada con fórmula ABC normal usando P75 de referencia |
| **Método** | `referencia_regional` |
| **Nota** | "P75 ref: ARTIGAS" |

**Lógica:** El producto tiene algo de movimiento local pero está subabastecido. Se usa el P75 de la tienda de referencia para calcular un nivel de stock más adecuado.

##### Ejemplo Comparativo

| Producto | P75 Local | P75 Ref | Caso | Sugerencia |
|----------|-----------|---------|------|------------|
| Galleta A | 0 | 18 u/día | Envío Prueba | **1 bulto** (mínimo) |
| Crema B | 0.5 | 12 u/día | Referencia Regional | Calculado (~3 bultos) |
| Jabón C | 8 | 10 u/día | Normal | Calculado con P75 local |

#### Generadores de Tráfico

Productos con alto GAP (diferencia entre ranking de ventas y penetración en facturas):
- Se tratan como Clase A aunque sean B o C
- Nunca deben faltar
- Aparecen con badge morado "Generador Tráfico"

## Paso 3: Confirmación

Revisa el resumen del pedido:

### Resumen
- Total de productos seleccionados
- Total de bultos
- Peso total estimado

### Validaciones
El sistema verifica:
- Cantidades mínimas de pedido (1 bulto mínimo)
- Disponibilidad en CEDI

### Confirmar
Click en **Crear Pedido** para finalizar.

## Después de Crear

El pedido queda en estado **Pendiente de Aprobación** y aparecerá en la lista principal.

## Estadísticas de Referencia

Datos típicos de una tienda madura (tienda_17 Artigas):

| Métrica | Valor |
|---------|-------|
| Total productos analizados | 1,703 |
| Productos Clase A | 292 (17%) |
| Productos Clase B | 539 (32%) |
| Productos Clase C | 735 (43%) |
| Con sugerencia > 0 | 1,298 (76%) |

## Próximos Pasos

- [Punto de Reorden](/modulos/pedidos-sugeridos/punto-reorden)
- [Aprobación de Pedidos](/modulos/pedidos-sugeridos/aprobacion)
