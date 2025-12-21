---
sidebar_position: 5
title: Rentabilidad
---

# Rentabilidad

La pestaña de Rentabilidad analiza el desempeno financiero por categoria y producto, mostrando ventas, margenes y retorno sobre inventario.

## Vista de Resumen

Al acceder, se muestran cuatro KPIs consolidados:

| KPI | Descripcion |
|-----|-------------|
| **Ventas 30d** | Total de ventas del periodo |
| **Margen Bruto** | Utilidad bruta en USD y % |
| **GMROI Total** | Retorno agregado sobre inventario |
| **Stock Valorizado** | Inversion total en inventario |

## Vista por Categoria

La primera vista muestra rentabilidad agregada por categoria:

```
┌────────────────────────────────────────────────────────────────────┐
│ Categoria │ Ventas 30d │ Margen $ │ Margen % │ GMROI │ Rotacion │
├────────────────────────────────────────────────────────────────────┤
│ Seco      │ $450,000   │ $112,500 │ 25.0%    │ 2.25  │ 7.2x     │
│ Frio      │ $320,000   │ $64,000  │ 20.0%    │ 1.85  │ 11.5x    │
│ Verde     │ $180,000   │ $27,000  │ 15.0%    │ 1.42  │ 22.3x    │
└────────────────────────────────────────────────────────────────────┘
```

### Columnas

| Columna | Descripcion |
|---------|-------------|
| **Ventas 30d** | Ventas totales del periodo |
| **Margen Bruto** | Utilidad bruta en USD |
| **Margen %** | Porcentaje de margen |
| **GMROI** | Retorno sobre inventario |
| **Rotacion** | Veces que rota al año |
| **Stock $** | Inventario valorizado |

### Interpretacion por Categoria

| Categoria | Margen Tipico | Rotacion Tipica | Caracteristica |
|-----------|---------------|-----------------|----------------|
| Seco | 20-30% | 6-10x | Alto margen, rotacion media |
| Frio | 15-25% | 10-18x | Margen medio, alta rotacion |
| Verde | 10-20% | 18-30x | Bajo margen, muy alta rotacion |

## Vista Top Productos

La segunda vista muestra los 20 productos mas rentables:

| Columna | Descripcion |
|---------|-------------|
| **#** | Posicion en ranking |
| **Producto** | Nombre e ID |
| **Categoria** | Tipo de almacenamiento |
| **Margen Bruto** | Utilidad generada en 30d |
| **GMROI** | Retorno sobre inventario |
| **Ventas 30d** | Volumen de ventas |
| **Margen %** | Porcentaje de margen |

### Ordenamiento

Los productos se ordenan por **Margen Bruto** descendente, mostrando los que generan mas utilidad absoluta (no solo porcentaje).

## Filtro por Region

El selector de region permite analizar:

- **Todas las regiones**: Vision consolidada
- **CARACAS**: Solo tiendas de Caracas
- **VALENCIA**: Solo tiendas de Valencia

## Analisis de Rentabilidad

### GMROI por Categoria

El GMROI esperado varia por tipo de producto:

| Categoria | GMROI Objetivo | GMROI Minimo |
|-----------|----------------|--------------|
| Seco | 2.5+ | 1.5 |
| Frio | 2.0+ | 1.2 |
| Verde | 1.8+ | 1.0 |

Los perecederos tienen objetivos mas bajos porque rotan mas rapido.

### Margen vs Volumen

Un producto puede ser rentable de dos formas:

1. **Alto margen, bajo volumen**: Pocos se venden pero ganan mucho
2. **Bajo margen, alto volumen**: Muchos se venden ganando poco

El Top 20 captura ambos perfiles al ordenar por margen **absoluto**.

## Casos de Uso

### Caso 1: Revision de Categoria

1. Comparar GMROI entre categorias
2. Si Frio esta por debajo de 1.5, revisar:
   - Precios de venta
   - Costos de compra
   - Niveles de merma

### Caso 2: Negociacion con Proveedores

1. Ver Top 20 productos por margen
2. Identificar proveedores de productos estrella
3. Usar como leverage para negociar otros productos

### Caso 3: Identificar Productos Sub-rentables

1. Filtrar por region especifica
2. Buscar productos con margen menor a 10%
3. Evaluar si justifican espacio en anaquel

## Comparativo de Metricas

| Metrica | Uso Principal | Mejor Para |
|---------|---------------|------------|
| **Margen %** | Eficiencia de cada venta | Pricing decisions |
| **Margen $** | Utilidad absoluta | Impacto en P&L |
| **GMROI** | Retorno sobre capital | Decisiones de inventario |
| **Rotacion** | Velocidad de venta | Planificacion de compras |

## Benchmarks de la Industria

Segun investigacion de mercado (Shopify, Retalon, NACS):

| Metrica | Grocery General | Supermercado | Mayorista |
|---------|-----------------|--------------|-----------|
| Margen Bruto | 22-28% | 20-25% | 12-18% |
| GMROI | 2.0-3.0 | 1.8-2.5 | 1.5-2.0 |
| Rotacion | 10-15x | 12-18x | 8-12x |

## Proxima Seccion

- [Cobertura](/modulos/business-intelligence/cobertura) - Analisis de distribucion y oportunidades
