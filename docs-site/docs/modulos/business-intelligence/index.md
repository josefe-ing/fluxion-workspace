---
sidebar_position: 1
title: Business Intelligence
---

# Modulo de Business Intelligence

El modulo de Business Intelligence proporciona analisis avanzados de rentabilidad, cobertura y desempeno del inventario a nivel de producto, tienda y categoria.

## Proposito

El modulo BI responde a tres necesidades fundamentales:

1. **Medir el impacto de Fluxion**: Cuantificar el capital liberado y la reduccion de stock desde la activacion
2. **Analizar rentabilidad**: Identificar productos estrella y candidatos a eliminar usando GMROI y rotacion
3. **Optimizar distribucion**: Detectar brechas de cobertura y stock atrapado en CEDIs

## Pilares del Modulo

### 1. Impacto Fluxion

Mide el retorno de inversion (ROI) del sistema por tienda y region:

| Metrica | Descripcion |
|---------|-------------|
| **Capital Liberado** | Stock baseline - Stock actual |
| **Reduccion %** | Porcentaje de reduccion vs baseline |
| **Fill Rate** | SKUs con stock / SKUs totales |
| **Dias Activo** | Tiempo desde activacion de Fluxion |

El **baseline** se calcula por tienda desde su fecha de activacion, permitiendo medir el impacto real del sistema incluso con rollouts escalonados.

### 2. Analisis de Rentabilidad

Clasifica productos usando la matriz GMROI × Rotacion:

| Cuadrante | GMROI | Rotacion | Accion |
|-----------|-------|----------|--------|
| **ESTRELLA** | Alto | Alta | Priorizar, aumentar stock |
| **VACA** | Bajo | Alta | Mantener volumen |
| **NICHO** | Alto | Baja | Evaluar viabilidad |
| **PERRO** | Bajo | Baja | Candidato a eliminar |

Los umbrales varian por categoria (Seco, Frio, Verde) para reflejar las diferentes dinamicas de cada tipo de producto.

### 3. Cobertura y Distribucion

Analiza la presencia de productos en tiendas:

- **Baja Cobertura**: Productos en menos del 50% de tiendas
- **Stock Atrapado**: Productos con stock en CEDI pero ausentes en tiendas de la region
- **Oportunidades**: Productos que venden bien en otras tiendas pero faltan en alguna

## Estructura de Regiones

El sistema considera la estructura geografica:

| Region | CEDIs | Tiendas |
|--------|-------|---------|
| **CARACAS** | cedi_caracas | tienda_17, tienda_18 |
| **VALENCIA** | cedi_seco, cedi_frio, cedi_verde | tienda_01-16, tienda_19-20 |

Esta estructura es clave para el calculo de "stock atrapado": solo se considera atrapado el stock en un CEDI si las tiendas **de su region** tienen bajo stock.

## Metricas Clave

### GMROI (Gross Margin Return on Investment)

```
GMROI = Utilidad Bruta / Inventario Promedio
```

| Valor | Interpretacion |
|-------|----------------|
| Mayor a 3.0 | Excelente |
| 2.0 - 3.0 | Bueno |
| 1.0 - 2.0 | Aceptable |
| Menor a 1.0 | Problematico |

### Rotacion de Inventario

```
Rotacion = (Costo Ventas / Inventario Promedio) × (365 / dias)
```

| Categoria | Rotacion Alta | Rotacion Baja |
|-----------|---------------|---------------|
| Seco | Mayor a 6x | Menor a 4x |
| Frio | Mayor a 12x | Menor a 8x |
| Verde | Mayor a 18x | Menor a 12x |

### Stock Atrapado

Se considera "stock bajo" cuando hay menos de **20 unidades** en una tienda. Un producto tiene stock atrapado cuando:

1. Tiene stock disponible en el CEDI
2. Las tiendas de la region del CEDI tienen stock menor a 20 unidades

## Navegacion

```
Business Intelligence
├── Impacto
│   ├── Resumen general
│   ├── Por region
│   └── Por tienda
├── Tiendas
│   ├── Ranking por metrica
│   └── Detalle de tienda
├── Productos
│   ├── Matriz cuadrantes
│   ├── Productos estrella
│   └── Candidatos eliminar
├── Rentabilidad
│   ├── Por categoria
│   └── Top productos
└── Cobertura
    ├── Resumen
    ├── Baja cobertura
    ├── Stock atrapado
    └── Oportunidades
```

## Casos de Uso

### Caso 1: Reporte Mensual de Impacto

El gerente necesita reportar a direccion el ROI de Fluxion. Accede a la pestaña "Impacto", filtra por region Valencia, y obtiene:
- Capital liberado: $125,000
- Reduccion de stock: 28%
- Fill rate mantenido: 94%

### Caso 2: Limpieza de Catalogo

El comprador quiere identificar productos a discontinuar. En la pestaña "Productos", filtra por cuadrante "PERRO" y categoria "Seco", obteniendo 45 SKUs con bajo GMROI y baja rotacion.

### Caso 3: Redistribucion de Stock

El jefe de logistica detecta $15,000 en stock atrapado en cedi_seco. Al revisar el detalle, encuentra 12 productos con mas de 90 dias de stock que podrian redistribuirse a tiendas con demanda activa.

## Proximas Secciones

- [Impacto Fluxion](/modulos/business-intelligence/impacto) - Medicion de ROI
- [Analisis de Tiendas](/modulos/business-intelligence/tiendas) - Comparativo entre tiendas
- [Matriz de Productos](/modulos/business-intelligence/productos) - Clasificacion por rentabilidad
- [Rentabilidad](/modulos/business-intelligence/rentabilidad) - Analisis por categoria
- [Cobertura](/modulos/business-intelligence/cobertura) - Distribucion y oportunidades
