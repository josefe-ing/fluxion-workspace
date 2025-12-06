---
sidebar_position: 2
title: Stock Actual
---

# Stock Actual

Visualiza y analiza el inventario disponible en cada ubicación.

## Vista Principal

La tabla de stock actual muestra:

| Columna | Descripción |
|---------|-------------|
| **Código** | Código SKU del producto |
| **Producto** | Nombre del producto |
| **Stock** | Cantidad disponible |
| **Cobertura** | Días de venta que cubre el stock |
| **ABC** | Clasificación ABC del producto |
| **Estado** | Normal, Bajo, Crítico, Quiebre |

## Estados del Stock

### Normal
Stock suficiente para cubrir la demanda esperada.

### Bajo
Stock por debajo del nivel óptimo pero arriba del punto de reorden.

### Crítico
Stock en o por debajo del punto de reorden. Requiere acción inmediata.

### Quiebre
Sin stock disponible. Pérdida de ventas potencial.

## Cobertura de Stock

La cobertura indica cuántos días de venta puedes cubrir:

```
Cobertura = Stock Actual ÷ Venta Promedio Diaria
```

**Interpretación:**
- **< 7 días** - Crítico, pedir urgente
- **7-14 días** - Bajo, considerar pedido
- **14-30 días** - Normal
- **> 30 días** - Revisar si hay sobre-stock

## Filtros

- **Estado** - Filtra por estado del stock
- **Clasificación ABC** - Solo productos A, B o C
- **Búsqueda** - Por nombre o código

## Acciones

### Ver Historial de Producto

Click en un producto para ver:
- Movimientos recientes
- Tendencia de stock
- Ventas históricas

### Generar Pedido

Desde productos con stock crítico puedes iniciar un pedido sugerido directamente.

## Próximos Pasos

- [Alertas de Inventario](/modulos/inventario/alertas)
- [Pedidos Sugeridos](/modulos/pedidos-sugeridos)
