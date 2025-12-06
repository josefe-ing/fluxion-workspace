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

### Origen (Proveedor/Almacén)
De dónde vendrá la mercancía:
- Centro de distribución
- Proveedor directo
- Otra tienda (transferencia)

### Destino (Tienda)
La tienda que recibirá el pedido.

## Paso 2: Selección de Productos

El sistema pre-selecciona productos que necesitan reposición basándose en:

### Criterios de Selección Automática

1. **Stock bajo punto de reorden**
2. **Cobertura menor a días configurados**
3. **Clasificación ABC** (prioriza A y B)

### Tabla de Productos

| Columna | Descripción |
|---------|-------------|
| **Producto** | Nombre y código |
| **Stock Actual** | Existencia en destino |
| **Venta Prom.** | Venta promedio diaria (20 días) |
| **Sugerido** | Cantidad calculada por el sistema |
| **Pedido** | Cantidad a pedir (editable) |
| **ABC** | Clasificación del producto |

### Ajustar Cantidades

Puedes modificar las cantidades sugeridas:
- Click en el campo **Pedido**
- Ingresa la cantidad deseada
- El sistema recalculará totales

### Agregar Productos

Si necesitas agregar un producto no sugerido:
1. Click en **Agregar Producto**
2. Busca por nombre o código
3. Ingresa la cantidad

### Quitar Productos

Para remover un producto:
- Click en el ícono de eliminar
- O pon cantidad en 0

## Paso 3: Confirmación

Revisa el resumen del pedido:

### Resumen
- Total de productos
- Total de unidades
- Valor estimado

### Validaciones
El sistema verifica:
- Cantidades mínimas de pedido
- Disponibilidad en origen (si aplica)
- Capacidad de almacenamiento

### Confirmar
Click en **Crear Pedido** para finalizar.

## Después de Crear

El pedido queda en estado **Pendiente de Aprobación** y aparecerá en la lista principal.

## Consejos

- Revisa las cantidades sugeridas, el sistema aprende de tus ajustes
- Prioriza productos clase A
- Considera el lead time del proveedor

## Próximos Pasos

- [Punto de Reorden](/modulos/pedidos-sugeridos/punto-reorden)
- [Aprobación de Pedidos](/modulos/pedidos-sugeridos/aprobacion)
