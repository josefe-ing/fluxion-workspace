---
sidebar_position: 3
title: Alertas
---

# Alertas de Inventario

Sistema de alertas proactivas para mantener niveles óptimos de inventario.

## Tipos de Alertas

### Stock Crítico

Se genera cuando un producto está en o por debajo del punto de reorden.

**Acción recomendada:** Generar pedido de reposición inmediatamente.

### Quiebre de Stock

Se genera cuando un producto tiene stock cero.

**Acción recomendada:** Pedido urgente o transferencia desde otra ubicación.

### Sobre-Stock

Se genera cuando el inventario supera significativamente el nivel óptimo.

**Acción recomendada:** Revisar pronóstico, considerar promociones o transferencias.

### Baja Rotación

Se genera cuando un producto no ha tenido movimiento en un período prolongado.

**Acción recomendada:** Evaluar descontinuar o liquidar.

## Panel de Alertas

El panel muestra:

- **Contador** - Número de alertas por tipo
- **Listado** - Alertas ordenadas por prioridad
- **Acciones** - Botones de acción rápida

## Priorización

Las alertas se priorizan considerando:

1. **Clasificación ABC** - Productos A tienen mayor prioridad
2. **Severidad** - Quiebre > Crítico > Bajo
3. **Impacto económico** - Valor del producto

## Configuración

Puedes configurar los umbrales de alerta en **Administrador > Parámetros ABC**:

- Días de cobertura mínima
- Porcentaje de sobre-stock
- Días sin movimiento para baja rotación

## Próximos Pasos

- [Pedidos Sugeridos](/modulos/pedidos-sugeridos)
- [Configuración de Parámetros](/modulos/administrador/parametros-abc)
