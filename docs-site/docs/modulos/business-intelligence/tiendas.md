---
sidebar_position: 3
title: Analisis de Tiendas
---

# Analisis de Tiendas

La pestaña de Tiendas permite comparar el desempeno de todas las ubicaciones y analizar metricas detalladas por tienda.

## Vista de Ranking

Al acceder a esta pestaña, se muestra un ranking de tiendas ordenable por diferentes metricas:

### Selector de Metrica

| Metrica | Descripcion | Mejor Valor |
|---------|-------------|-------------|
| **GMROI** | Retorno sobre inversion en inventario | Mayor es mejor |
| **Ventas** | Ventas totales ultimos 30 dias | Mayor es mejor |
| **Rotacion** | Velocidad de rotacion de inventario | Mayor es mejor |
| **Stock** | Stock valorizado actual | Depende contexto |

### Tabla de Ranking

```
┌────────────────────────────────────────────────────────────────┐
│ # │ Tienda              │ Region   │ Valor    │ Tendencia    │
├────────────────────────────────────────────────────────────────┤
│ 1 │ Tienda Paraiso      │ CARACAS  │ 2.85     │ ↑            │
│ 2 │ Tienda Centro       │ VALENCIA │ 2.71     │ →            │
│ 3 │ Tienda Norte        │ VALENCIA │ 2.45     │ ↓            │
│...│ ...                 │ ...      │ ...      │ ...          │
└────────────────────────────────────────────────────────────────┘
```

## Filtro por Region

El selector de region permite ver solo tiendas de una zona:

- **Todas las regiones**: Vista completa
- **CARACAS**: tienda_17, tienda_18
- **VALENCIA**: tienda_01 a tienda_16, tienda_19, tienda_20

## Detalle de Tienda

Al hacer clic en una tienda, se abre un panel con metricas detalladas:

### KPIs Principales

| Metrica | Descripcion |
|---------|-------------|
| **GMROI** | Gross Margin Return on Investment |
| **Rotacion Anual** | Veces que rota el inventario por año |
| **Ventas 30d** | Ventas totales del periodo |
| **Margen Promedio** | Margen bruto porcentual |
| **Stock Valorizado** | Valor total del inventario |
| **Fill Rate** | Porcentaje de SKUs con stock |
| **SKUs Activos** | Cantidad de productos con movimiento |

### Productos Destacados

El detalle muestra los mejores y peores productos de la tienda:

#### Top 10 Productos (por GMROI)

Productos con mejor rentabilidad en esta tienda. Indica que productos priorizar.

#### Bottom 10 Productos (por GMROI)

Productos con peor rentabilidad. Candidatos a revisar o discontinuar en esta tienda.

## Interpretacion de Metricas

### GMROI por Tienda

| Rango | Interpretacion |
|-------|----------------|
| Mayor a 2.5 | Tienda muy rentable |
| 2.0 - 2.5 | Rentabilidad buena |
| 1.5 - 2.0 | Rentabilidad aceptable |
| Menor a 1.5 | Requiere atencion |

### Rotacion por Tienda

| Rango | Interpretacion |
|-------|----------------|
| Mayor a 12x | Excelente rotacion |
| 8x - 12x | Buena rotacion |
| 4x - 8x | Rotacion moderada |
| Menor a 4x | Rotacion lenta |

## Casos de Uso

### Caso 1: Identificar Tiendas Problema

1. Ordenar por GMROI descendente
2. Las tiendas al final del ranking requieren atencion
3. Revisar el detalle para identificar productos problematicos

### Caso 2: Benchmark entre Tiendas

1. Filtrar por region VALENCIA
2. Comparar metricas entre tiendas similares
3. Identificar best practices de tiendas top

### Caso 3: Analisis de SKU Mix

1. Seleccionar tienda con bajo GMROI
2. Revisar Bottom 10 productos
3. Evaluar si esos productos deberian retirarse de esa tienda

## Acciones Sugeridas

| Situacion | Accion |
|-----------|--------|
| Tienda con bajo GMROI pero alta rotacion | Revisar margenes de venta |
| Tienda con alto GMROI pero baja rotacion | Revisar niveles de stock |
| Bottom 10 con muchos "PERRO" | Considerar eliminar esos SKUs |
| Top 10 diferentes a otras tiendas | Analizar preferencias locales |

## Proxima Seccion

- [Matriz de Productos](/modulos/business-intelligence/productos) - Clasificacion de productos por rentabilidad
