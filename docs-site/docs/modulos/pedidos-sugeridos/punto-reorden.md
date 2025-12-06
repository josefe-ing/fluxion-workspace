---
sidebar_position: 3
title: Punto de Reorden
---

# Punto de Reorden

El punto de reorden es el nivel de inventario que dispara la necesidad de generar un nuevo pedido.

## ¿Qué es el Punto de Reorden?

Es la cantidad mínima de stock que debes tener antes de hacer un nuevo pedido. Cuando el inventario llega a este nivel, es momento de ordenar.

## Fórmula

```
Punto de Reorden = (Demanda Diaria × Lead Time) + Stock de Seguridad
```

### Componentes

| Componente | Descripción |
|------------|-------------|
| **Demanda Diaria** | Venta promedio por día |
| **Lead Time** | Días que tarda en llegar el pedido |
| **Stock de Seguridad** | Colchón para imprevistos |

### Ejemplo

```
Demanda diaria: 10 unidades/día
Lead time: 5 días
Stock de seguridad: 20 unidades

Punto de Reorden = (10 × 5) + 20 = 70 unidades
```

Cuando el stock llegue a 70 unidades, debes hacer un pedido.

## Cálculo en Fluxion AI

El sistema calcula el punto de reorden automáticamente considerando:

1. **Venta promedio de 20 días** - Demanda reciente
2. **Lead time configurado** - Por proveedor o global
3. **Stock de seguridad** - Según clasificación ABC

### Stock de Seguridad por Clasificación

| Clase | Stock de Seguridad | Justificación |
|-------|-------------------|---------------|
| **A** | Mayor (ej: 14 días) | Alto impacto de quiebre |
| **B** | Medio (ej: 10 días) | Impacto moderado |
| **C** | Menor (ej: 7 días) | Bajo impacto |

## Visualización

En el módulo de Pedidos Sugeridos puedes ver:

- **Punto de reorden** de cada producto
- **Stock actual** vs punto de reorden
- **Estado**: Normal / Bajo / Crítico

## Configuración

Ajusta los parámetros en **Administrador > Parámetros ABC**:

- Lead time por defecto
- Días de stock de seguridad por clase ABC
- Factores de ajuste

## Cuándo Actuar

| Situación | Acción |
|-----------|--------|
| Stock > Punto de Reorden | No se requiere pedido |
| Stock ≈ Punto de Reorden | Preparar pedido |
| Stock < Punto de Reorden | Pedir urgente |
| Stock = 0 | Quiebre, acción inmediata |

## Aprende Más

- [Stock de Seguridad](/conceptos/stock-seguridad)
- [Concepto de Punto de Reorden](/conceptos/punto-reorden)
