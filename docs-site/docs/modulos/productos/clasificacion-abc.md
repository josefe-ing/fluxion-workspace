---
sidebar_position: 3
title: Clasificación ABC
---

# Clasificación ABC

Análisis de productos basado en su contribución al valor total de ventas.

## ¿Qué es la Clasificación ABC?

La clasificación ABC es un método de categorización basado en el **Principio de Pareto** (80/20):

- **~20% de productos** generan **~80% del valor**
- Permite priorizar esfuerzos de gestión

## Las Tres Clases

### Clase A - Alto Valor
- **Proporción típica:** 10-20% de SKUs
- **Contribución:** ~80% del valor de ventas
- **Gestión:** Máxima atención, control estricto de stock

### Clase B - Valor Medio
- **Proporción típica:** 20-30% de SKUs
- **Contribución:** ~15% del valor de ventas
- **Gestión:** Atención moderada, revisión periódica

### Clase C - Bajo Valor
- **Proporción típica:** 50-70% de SKUs
- **Contribución:** ~5% del valor de ventas
- **Gestión:** Simplificada, menor frecuencia de revisión

## Vista en Fluxion AI

### Gráfico de Distribución

Visualiza la distribución de productos por clase:
- Gráfico de barras por cantidad de SKUs
- Gráfico de pie por valor de ventas

### Tabla de Productos

Lista de productos con su clasificación, ordenable por:
- Valor de ventas
- Cantidad vendida
- Clasificación

### Análisis de Pareto

Gráfico de Pareto mostrando:
- Eje X: Productos ordenados por valor
- Eje Y izquierdo: Valor individual
- Eje Y derecho: Porcentaje acumulado

## Configuración

Los umbrales de clasificación se configuran en **Administrador > Parámetros ABC**:

| Parámetro | Default | Descripción |
|-----------|---------|-------------|
| **Umbral A** | 80% | Productos que acumulan hasta este % son A |
| **Umbral B** | 95% | Productos entre A y este % son B |
| **Clase C** | Resto | Productos restantes |

## Estrategias por Clase

### Productos A
- Monitoreo diario de stock
- Stock de seguridad alto
- Pronósticos detallados
- Negociación activa con proveedores

### Productos B
- Monitoreo semanal
- Stock de seguridad moderado
- Pronósticos estándar

### Productos C
- Monitoreo mensual
- Stock mínimo
- Considerar eliminación de SKUs de muy bajo movimiento

## Aprende Más

- [Concepto de Clasificación ABC](/conceptos/clasificacion-abc)
- [Matriz ABC-XYZ](/modulos/productos/matriz-abc-xyz)
