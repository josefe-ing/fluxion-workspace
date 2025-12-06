---
sidebar_position: 5
title: Ventas Perdidas
---

# Análisis de Ventas Perdidas

El módulo de Ventas Perdidas te permite cuantificar el impacto económico de los quiebres de stock y agotados.

## ¿Qué son las Ventas Perdidas?

Una **venta perdida** ocurre cuando:
- Un cliente quiere comprar un producto
- El producto no está disponible (agotado)
- La venta no se realiza

El sistema calcula cuánto **dejaste de vender** por no tener stock disponible.

## Metodología de Cálculo

### Comparación Histórica

El sistema compara:
- **Ventas del período** - Lo que realmente vendiste
- **Promedio histórico** - Lo que normalmente vendes

```
Venta Perdida = (Promedio Histórico - Venta Real) × Días × Precio
```

### Factores Considerados

| Factor | Descripción |
|--------|-------------|
| **Días con ventas** | Días donde hubo movimiento |
| **Días analizados** | Total de días del período |
| **Promedio diario período** | Venta promedio en el período |
| **Promedio histórico** | Venta promedio de 60 días |
| **Días con stock cero** | Días sin inventario |

## Acceso

1. Ve a **Ventas** → selecciona una tienda
2. Click en **Ventas Perdidas**

## Períodos de Análisis

Puedes analizar diferentes períodos:

| Período | Descripción |
|---------|-------------|
| **Últimos 7 días** | Semana actual |
| **Semana pasada** | Lunes a domingo anterior |
| **Últimos 14 días** | Dos semanas |
| **Último mes** | 30 días |
| **Personalizado** | Rango de fechas específico |

## Vista Principal

### Resumen Ejecutivo

Tarjetas con métricas clave:

- **Total Venta Perdida (USD)** - Monto total estimado
- **Total Incidentes** - Cantidad de productos afectados
- **Incidentes Críticos** - Productos con pérdida alta
- **Producto Mayor Pérdida** - El que más impacto tiene

### Niveles de Alerta

Cada producto tiene un nivel de alerta:

| Nivel | Criterio | Color |
|-------|----------|-------|
| **Crítico** | < 50% del histórico | Rojo |
| **Alto** | 50-70% del histórico | Naranja |
| **Medio** | 70-85% del histórico | Amarillo |

### Tabla de Detalle

Para cada producto afectado:

| Columna | Descripción |
|---------|-------------|
| **Producto** | Código y nombre |
| **Ventas Período** | Unidades vendidas |
| **Promedio Histórico** | Lo que debería vender |
| **% vs Histórico** | Porcentaje alcanzado |
| **Unidades Perdidas** | Diferencia en unidades |
| **Venta Perdida USD** | Impacto económico |
| **Stock Actual** | Existencia actual |
| **Días Stock Cero** | Días sin inventario |

## Gráficos

### Top Productos con Pérdida

Gráfico de barras mostrando los productos con mayor venta perdida en USD.

### Distribución por Nivel de Alerta

Gráfico de pie mostrando:
- Cantidad de productos críticos
- Cantidad de productos con alerta alta
- Cantidad de productos con alerta media

## Exportación

Exporta el análisis completo a CSV para:
- Reportes a gerencia
- Análisis adicional en Excel
- Documentación de pérdidas

## Interpretación de Resultados

### Venta Perdida Alta

**Causas comunes:**
- Quiebre de stock prolongado
- Error en punto de reorden
- Proveedor retrasado
- Demanda no anticipada

**Acciones:**
- Generar pedido urgente
- Revisar parámetros de reorden
- Negociar con proveedor

### Venta Perdida Media

**Causas comunes:**
- Stock insuficiente parcial
- Rotación mayor a esperada
- Promoción no planificada

**Acciones:**
- Ajustar stock de seguridad
- Revisar pronósticos

## Integración con Pedidos Sugeridos

Los productos con ventas perdidas altas son **priorizados automáticamente** en el módulo de Pedidos Sugeridos.

## Caso de Uso: Reunión Semanal

1. Accede a Ventas Perdidas con período "Semana pasada"
2. Revisa el total de pérdida en USD
3. Identifica los top 10 productos afectados
4. Exporta reporte para la reunión
5. Define acciones correctivas

## Próximos Pasos

- [Centro de Comando](/modulos/ventas/centro-comando) - Corrige anomalías de stock
- [Pedidos Sugeridos](/modulos/pedidos-sugeridos) - Repone productos faltantes
- [Stock de Seguridad](/conceptos/stock-seguridad) - Previene futuras pérdidas
