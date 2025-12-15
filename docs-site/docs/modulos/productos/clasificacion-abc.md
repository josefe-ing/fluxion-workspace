---
sidebar_position: 3
title: Clasificacion ABC
---

# Clasificacion ABC

Visualiza y analiza la clasificacion ABC de tu catalogo de productos.

## Que es la Clasificacion ABC?

La clasificacion ABC es un metodo de categorizacion basado en el **ranking de unidades vendidas**:

- Productos de **mayor rotacion** reciben mayor atencion
- Permite priorizar esfuerzos de gestion de inventario

## Las 4 Clases

| Clase | Ranking | Color | Descripcion |
|-------|---------|-------|-------------|
| **A** | Top 50 | Verde | Productos estrella, maxima rotacion |
| **B** | 51-200 | Azul | Productos importantes, alta rotacion |
| **C** | 201-800 | Amarillo | Productos regulares, rotacion media |
| **D** | 801+ | Gris | Productos de baja rotacion |

### Caracteristicas por Clase

| Clase | Gestion | Stock Seguridad | Monitoreo |
|-------|---------|-----------------|-----------|
| **A** | Maxima atencion | Alto (Z=2.33) | Diario |
| **B** | Atencion frecuente | Medio (Z=1.88) | 2-3 dias |
| **C** | Gestion estandar | Bajo (Z=1.28) | Semanal |
| **D** | Revision periodica | Padre Prudente | Mensual |

## Vista en Fluxion AI

### Resumen por Clase

Tarjetas mostrando:
- Cantidad de productos por clase
- Porcentaje del total de ventas (unidades)
- Tendencia vs periodo anterior

### Grafico de Distribucion

Visualiza la distribucion de productos por clase:
- Grafico de barras por cantidad de SKUs
- Grafico de pie por volumen de ventas

### Tabla de Productos

Lista de productos con su clasificacion:

| Columna | Descripcion |
|---------|-------------|
| **Ranking** | Posicion por ventas (1 = mas vendido) |
| **Codigo** | SKU del producto |
| **Producto** | Nombre/descripcion |
| **Clase** | Badge de color (A, B, C, D) |
| **Ventas 90d** | Unidades vendidas ultimos 90 dias |
| **Tendencia** | Cambio en ranking |

## Filtros

### Por Clase
- Todas
- Solo Clase A
- Solo Clase B
- Solo Clase C
- Solo Clase D

### Por Tienda
- **Global**: Ranking de todas las tiendas
- **Tienda especifica**: Ranking local

### Busqueda
Por nombre o codigo de producto.

## Detalle de Producto

Al hacer click en un producto:

### Informacion de Clasificacion

- Ranking actual (#3 de 1,500)
- Clase (A, B, C, D)
- Tendencia (subiendo/bajando)

### Parametros Asociados

| Parametro | Clase A | Clase B | Clase C | Clase D |
|-----------|---------|---------|---------|---------|
| **Z-Score** | 2.33 | 1.88 | 1.28 | N/A |
| **Dias Cobertura** | 7 | 14 | 21 | 30 |
| **Nivel Servicio** | 99% | 97% | 90% | ~85% |

### Historial

Evolucion del ranking en el tiempo.

## Configuracion

Los umbrales de clasificacion se configuran en **Administrador > Parametros ABC**:

| Parametro | Default | Descripcion |
|-----------|---------|-------------|
| **umbral_a** | 50 | Top N productos para Clase A |
| **umbral_b** | 200 | Top N productos para Clase B |
| **umbral_c** | 800 | Top N productos para Clase C |
| **Resto** | - | Productos con ranking > 800 son Clase D |

## Metodo Padre Prudente (Clase D)

Para productos Clase D, el stock de seguridad se calcula:

```
SS = 0.30 × Demanda_Diaria × Lead_Time
```

Esto garantiza un 30% de colchon durante el ciclo de reposicion.

## Estrategias por Clase

### Productos A (Top 50)
- Monitoreo diario de stock
- Stock de seguridad alto (Z=2.33)
- Nunca deben faltar
- Pronosticos detallados (P75)

### Productos B (51-200)
- Monitoreo cada 2-3 dias
- Stock de seguridad medio (Z=1.88)
- Atencion frecuente

### Productos C (201-800)
- Monitoreo semanal
- Stock de seguridad bajo (Z=1.28)
- Gestion estandar

### Productos D (801+)
- Monitoreo mensual
- Stock minimo (Padre Prudente)
- Evaluar si justifica mantener

## Casos de Uso

### Revisar Top 50
1. Filtrar por Clase A
2. Verificar disponibilidad de stock
3. Priorizar en pedidos

### Identificar Candidatos a Descontinuar
1. Filtrar por Clase D
2. Ordenar por ventas ascendente
3. Evaluar productos sin movimiento

## Exportacion

- **Excel**: Listado completo con metricas
- **PDF**: Reporte ejecutivo

## Aprende Mas

- [Concepto de Clasificacion ABC](/conceptos/clasificacion-abc)
- [Matriz ABC-XYZ](/modulos/productos/matriz-abc-xyz)
- [Parametros ABC](/modulos/administrador/parametros-abc)
