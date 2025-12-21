---
sidebar_position: 6
title: Cobertura y Distribucion
---

# Cobertura y Distribucion

La pestaña de Cobertura analiza la presencia de productos en tiendas, identifica stock atrapado en CEDIs y detecta oportunidades de distribucion.

## Vista de Resumen

Al acceder, se muestran cuatro KPIs principales:

| KPI | Descripcion |
|-----|-------------|
| **Total SKUs** | Cantidad de productos en catalogo |
| **Cobertura Promedio** | % promedio de tiendas con cada producto |
| **SKUs Baja Cobertura** | Productos en menos del 50% de tiendas |
| **Oportunidad Estimada** | Venta potencial si se distribuye |

## Distribucion de Cobertura

El panel de resumen muestra la distribucion:

```
Cobertura Alta (>80%)    ████████████░░░░░░░░  320 SKUs
Cobertura Media (50-80%) ███████░░░░░░░░░░░░░  180 SKUs
Cobertura Baja (<50%)    █████░░░░░░░░░░░░░░░  124 SKUs
```

## Vista: Baja Cobertura

Muestra productos presentes en menos del 50% de las tiendas:

| Columna | Descripcion |
|---------|-------------|
| **Producto** | Nombre y categoria |
| **Cobertura** | Barra visual + porcentaje |
| **Tiendas** | X de Y tiendas con stock |
| **Venta Promedio** | Venta mensual por tienda que lo tiene |
| **Oportunidad** | Venta estimada si se distribuye |

### Calculo de Oportunidad

```
Oportunidad = Venta Promedio × Tiendas Sin Stock × Factor Conservador × Margen
```

Donde el factor conservador es 0.5 (50%) para no sobreestimar.

## Vista: Stock Atrapado

Productos con stock en CEDI pero sin presencia en tiendas de la region:

| Columna | Descripcion |
|---------|-------------|
| **Producto** | Nombre e ID |
| **CEDI** | Ubicacion del stock |
| **Stock CEDI** | Cantidad en unidades |
| **Valor $** | Stock valorizado |
| **Dias Stock** | Cobertura en dias |
| **Tiendas sin Stock** | Cuantas tiendas de la region no lo tienen |

### Concepto de "Stock Atrapado"

Un producto tiene stock atrapado cuando:

1. Hay stock disponible en el CEDI
2. Las tiendas **de la region del CEDI** tienen stock menor a 20 unidades

#### Mapeo Region-CEDI

| CEDI | Tiendas Asociadas |
|------|-------------------|
| cedi_caracas | tienda_17, tienda_18 |
| cedi_seco | tienda_01 a tienda_16, tienda_19, tienda_20 |
| cedi_frio | tienda_01 a tienda_16, tienda_19, tienda_20 |
| cedi_verde | tienda_01 a tienda_16, tienda_19, tienda_20 |

Esto evita falsos positivos: no se marca como "atrapado" si las tiendas de Valencia estan bien pero las de Caracas no.

### Semaforo de Dias Stock

| Dias | Color | Interpretacion |
|------|-------|----------------|
| Menor a 30 | Verde | Normal |
| 30-90 | Amarillo | Atencion |
| Mayor a 90 | Rojo | Critico |

## Vista: Oportunidades

Productos que venden bien en otras tiendas pero faltan en alguna:

| Columna | Descripcion |
|---------|-------------|
| **Tienda** | Tienda destino sin el producto |
| **Producto** | Nombre y categoria |
| **Venta Otras** | Venta mensual en otras tiendas |
| **Margen %** | Margen bruto del producto |
| **Oportunidad** | Venta estimada |
| **Prioridad** | ALTA/MEDIA/BAJA |

### Criterios de Prioridad

| Prioridad | Criterio |
|-----------|----------|
| ALTA | Producto Clase A con GMROI alto |
| MEDIA | Producto Clase B o margen medio |
| BAJA | Otros casos |

## Filtro por Region

El selector permite analizar una region especifica:

- **Todas**: Vision consolidada
- **CARACAS**: Solo tienda_17 y tienda_18
- **VALENCIA**: Tiendas 01-16, 19, 20

## Casos de Uso

### Caso 1: Reducir Stock Atrapado

1. Ir a vista "Stock Atrapado"
2. Ordenar por Valor $ descendente
3. Identificar productos con mas de 90 dias de stock
4. Generar lista de redistribucion al CEDI destino

### Caso 2: Expandir Distribucion

1. Ir a vista "Oportunidades"
2. Filtrar por prioridad ALTA
3. Revisar top 10 oportunidades
4. Crear pedidos para esas tiendas

### Caso 3: Analizar Cobertura Regional

1. Seleccionar region VALENCIA
2. Ir a "Baja Cobertura"
3. Identificar productos populares con poca presencia
4. Evaluar si es problema de distribucion o demanda local

## Acciones Sugeridas

| Situacion | Accion |
|-----------|--------|
| Stock atrapado mayor a $50k | Priorizar redistribucion |
| Cobertura menor a 40% | Evaluar si es producto regional |
| Oportunidad mayor a $5k | Incluir en proximo pedido |
| Dias stock mayor a 120 | Considerar promocion para liquidar |

## Metricas de Exito

| Metrica | Objetivo |
|---------|----------|
| Cobertura Promedio | Mayor a 70% |
| Stock Atrapado | Menor a 5% del inventario total |
| SKUs Baja Cobertura | Reduccion mes a mes |

## Proxima Seccion

- [GMROI Explicado](/conceptos/gmroi) - Concepto y calculo detallado
