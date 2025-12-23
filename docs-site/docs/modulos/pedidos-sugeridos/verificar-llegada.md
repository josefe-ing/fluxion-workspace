---
sidebar_position: 4
title: Verificar Llegada
---

# Verificar Llegada

La funcionalidad de **Verificar Llegada** permite confirmar si los productos de un pedido llegaron a la tienda, detectando automáticamente incrementos de inventario desde la fecha del pedido.

## Flujo de Uso

1. El usuario recibe aviso de que llegó el pedido
2. Entra al detalle del pedido y hace click en **"Verificar Llegada"**
3. El sistema detecta incrementos de inventario desde la fecha del pedido
4. Se muestran los resultados con estados y colores
5. El usuario revisa y hace click en **"Guardar Llegada"**
6. Los datos se guardan en el campo `cantidad_recibida_bultos`
7. Si llega otra parte después, puede repetir el proceso (se acumula)

## Cómo Funciona

### Detección de Incrementos

El sistema analiza los snapshots de inventario (cada 30 minutos) buscando incrementos positivos desde la fecha del pedido:

```
Para cada producto:
1. Obtener snapshots desde fecha_pedido hasta ahora
2. Calcular incremento entre cada par consecutivo
3. Sumar solo incrementos positivos (llegadas)
4. Ignorar decrementos (ventas)
```

### Ejemplo Real

**Producto**: GRANJA PAN DE JAMON 003231
**Pedido**: 21 de diciembre

| Fecha/Hora | Snapshot | Incremento |
|------------|----------|------------|
| 22 dic 11:14am | -1 | - |
| 22 dic 11:43am | 194 | **+195** |

**Resultado**: 195 unidades detectadas como llegada.

### Llegadas en Partes

Si la mercancía llega en múltiples envíos:

| Hora | Incremento Detectado |
|------|---------------------|
| 10:00am | +100 unidades |
| 2:00pm | +50 unidades |
| **Total** | **150 unidades** |

## Estados de Llegada

Cada producto recibe un estado basado en su porcentaje de cumplimiento:

| Estado | Condición | Color |
|--------|-----------|-------|
| **Completo** | >= 97% llegó | 🟢 Verde |
| **Parcial** | 1-96% llegó | 🟡 Amarillo |
| **No llegó** | 0% o sin incremento | 🔴 Rojo |

> **Nota**: Si un producto no tiene histórico de inventario, se asume que su inventario inicial era cero. Por lo tanto, si no se detectan incrementos, se considera como "No llegó".

## Panel de Verificación

Al hacer click en "Verificar Llegada" se muestra:

### Resumen Global
- **Cumplimiento global**: Porcentaje total de productos recibidos
- **Completos**: Cantidad de productos con llegada >= 95%
- **Parciales**: Productos con llegada entre 1-94%
- **No llegaron**: Productos sin incremento detectado

### Columnas en la Tabla
- **Llegada**: Incremento detectado (en verde si > 0)
- **Estado**: Badge con color según estado

### Botón "Guardar Llegada"
- Solo aparece si hay nuevos incrementos por guardar
- Guarda los incrementos en `cantidad_recibida_bultos`
- Permite verificaciones posteriores (acumulativas)

## Casos Especiales

### Pedido en Estado Borrador
La verificación funciona en **cualquier estado** del pedido (Borrador, Aprobado, Finalizado). La llegada física puede ocurrir independientemente del estado en sistema.

### Múltiples Verificaciones
Si se verificó y guardó antes, el sistema:
1. Muestra el total ya guardado
2. Detecta solo **nuevos** incrementos desde la última verificación
3. Permite guardar los nuevos incrementos (se acumulan)

### Productos Sin Histórico de Inventario
Si un producto no tiene registros históricos de inventario (snapshots), el sistema asume que su inventario inicial era cero. Si no se detectan incrementos desde la fecha del pedido, se considera como "No llegó".

### Tiendas con Múltiples Almacenes
El sistema suma la cantidad de todos los almacenes asociados a la tienda.

## FAQ

### ¿Por qué no detecta la llegada?
Posibles causas:
1. **No ha pasado suficiente tiempo**: El snapshot se genera cada 30 minutos
2. **El producto no está en el sistema**: Verificar código de producto
3. **Llegó a otra ubicación**: Verificar que la tienda destino sea correcta

### ¿Se puede verificar el mismo pedido varias veces?
Sí. Cada verificación detecta los incrementos desde la fecha del pedido y muestra cuánto ya fue guardado vs cuánto es nuevo.

### ¿Qué pasa si llegó más de lo pedido?
El porcentaje será > 100% y el estado será "Completo". El sistema registra lo que realmente llegó, no lo que se pidió.
