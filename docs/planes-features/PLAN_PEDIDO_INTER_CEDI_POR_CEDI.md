# Plan: Pedidos Inter-CEDI Separados por CEDI Origen

**Fecha:** 2026-02-17
**Estado:** Pendiente de implementación

---

## Contexto y Decisión

El pedido inter-CEDI actualmente crea **1 solo pedido** que mezcla productos de los 3 CEDIs origen (Seco, Frío, Verde). La decisión es separarlo en **pedidos independientes por CEDI origen**, ya que los camiones salen de CEDIs distintos:

- **Pedido CEDI Seco** → Productos secos, víveres, limpieza, etc.
- **Pedido CEDI Frío** → Carnes, charcutería, lácteos, congelados (eventualmente)
- **Pedido CEDI Verde** → FRUVER (frutas y verduras) — a futuro

Cada CEDI puede tener su propia frecuencia de viajes y parámetros logísticos.

---

## TODO Pendiente: Definición de "Producto Congelado"

Antes de implementar el pedido CEDI Frío, se necesita definir claramente qué productos aplican días de cobertura especiales para congelados vs. refrigerados normales.

**Hallazgo actual:** Hay productos inconsistentes:
- Helados Crema Helados, Yogures Migurt → `cedi_origen_id = cedi_seco` pero categoría `REFRIGERADOS Y CONGELADOS`
- Mayonesa, Salsas, Bases de Pizza → `cedi_origen_id = cedi_frio` pero son víveres no perecederos

**Decisión pendiente:**
- [ ] ¿Usar solo `cedi_origen_id = 'cedi_frio'` para aplicar días congelados? (ignora categoría)
- [ ] ¿O combinar cedi_frio + categorías específicas?
- [ ] ¿Los víveres del CEDI Frío (mayonesa, salsas) deben usar días ABC normales?

---

## Arquitectura Actual vs. Propuesta

### Actual
```
1 cálculo → 1 pedido con productos de los 3 CEDIs mezclados
Filtro por CEDI = solo UI, no afecta el pedido guardado
```

### Propuesta
```
3 cálculos separados (uno por CEDI) → 3 pedidos independientes
Cada pedido tiene su propia configuración de días y logística
```

---

## Cambios Requeridos

### 1. Backend — Sin cambio en DB

La DB ya soporta múltiples pedidos separados. No se necesita migración.

#### `backend/models/pedidos_inter_cedi.py`
- Agregar campo opcional `cedi_origen_id: Optional[str] = None` a `CalcularPedidoInterCediRequest`
- Cuando se pasa, filtrar productos solo de ese CEDI origen

#### `backend/routers/pedidos_inter_cedi.py` (línea ~301)
- En la query SQL de cálculo, agregar filtro opcional:
  ```sql
  AND (%(cedi_origen_id)s IS NULL OR p.cedi_origen_id = %(cedi_origen_id)s)
  ```
- Devolver en la respuesta qué `cedi_origen_id` se calculó (para trazabilidad)

---

### 2. Frontend — Wizard

#### `PasoCediDestinoConfiguracion.tsx`
- **El primer campo del wizard es el CEDI Origen** (no el destino, que siempre es Caracas):
  - Selector: `CEDI Seco` / `CEDI Frío` / `CEDI Verde`
  - Un pedido = un CEDI origen. Para pedir Seco y Frío en el mismo día, se crean dos pedidos separados.
- Los parámetros de configuración (días ABC, congelados, frecuencia, lead time) aplican al CEDI seleccionado

#### `PedidoInterCediWizard.tsx`
- En lugar de 1 llamada a `calcularPedidoInterCedi`, hacer N llamadas (una por CEDI seleccionado) en paralelo
- Guardar como N pedidos separados (uno por CEDI)
- El paso 2 (Selección) muestra los CEDIs como **tabs separados**

#### `PasoSeleccionProductosInterCedi.tsx`
- Convertir en tabs: `[CEDI Seco] [CEDI Frío] [CEDI Verde]`
- Cada tab es independiente con sus propios productos, totales y Excel

#### `PasoConfirmacionInterCedi.tsx`
- Mostrar resumen de los N pedidos que se van a crear
- Botón "Confirmar" crea todos los pedidos

---

### 3. Frontend — Lista de Pedidos (`SuggestedOrder.tsx`)
- Los pedidos inter-CEDI ya aparecen individualmente en la lista
- Agregar badge/label que indique el CEDI origen: "Inter-CEDI Seco", "Inter-CEDI Frío"

---

## Scope de Implementación

### Fase 1: CEDI Seco + CEDI Frío (inmediato)
- Separar el wizard en 2 pedidos: Seco y Frío
- El CEDI Verde/FRUVER se mantiene como está (o se excluye temporalmente)

### Fase 2: CEDI Verde / FRUVER (futuro)
- Agregar soporte para el tercer pedido cuando se active la ruta Verde → Caracas

---

## Notas Técnicas

- **Sin cambio de DB**: La tabla `pedidos_inter_cedi` ya tiene `cedi_origen_id` en el detalle. Solo se necesitan múltiples headers.
- **Cálculo paralelo**: Las 3 llamadas pueden hacerse en `Promise.all()` para no perder performance
- **Configuración independiente**: Cada CEDI puede tener distinta frecuencia de viajes y lead time
- **Excel por CEDI**: Ya existe el botón de exportar por CEDI en `PasoConfirmacionInterCedi`
