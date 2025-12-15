---
sidebar_position: 2
title: Conceptos Clave
---

# Conceptos Clave

Antes de profundizar en Fluxion AI, es importante entender algunos conceptos fundamentales que usamos en todo el sistema.

## Ubicaciones y Tiendas

En Fluxion AI, una **ubicación** o **tienda** representa un punto físico donde se almacena y/o vende inventario. Puede ser:

- Una sucursal de venta
- Un centro de distribución
- Un almacén central

Cada ubicación tiene su propio inventario y métricas de ventas.

## Clasificacion ABC

La **Clasificacion ABC** es un metodo de categorizacion de productos basado en su **volumen de ventas** (cantidad vendida):

| Clase | Ranking | Descripcion |
|-------|---------|-------------|
| **A** | Top 50 | Productos estrella, maxima rotacion |
| **B** | 51-200 | Productos importantes, alta rotacion |
| **C** | 201-800 | Productos regulares, rotacion media |
| **D** | 801+ | Productos de baja rotacion |

Esta clasificacion te ayuda a priorizar que productos requieren mayor atencion.

[Aprende mas sobre Clasificacion ABC →](/conceptos/clasificacion-abc)

## Análisis XYZ

El **Análisis XYZ** clasifica productos según la **variabilidad de su demanda**:

| Clase | Descripción | Coeficiente de Variación |
|-------|-------------|-------------------------|
| **X** | Demanda estable, predecible | CV < 50% |
| **Y** | Demanda moderadamente variable | 50% ≤ CV < 100% |
| **Z** | Demanda altamente variable | CV ≥ 100% |

Combinado con ABC, forma la **Matriz ABC-XYZ** que es fundamental para estrategias de inventario.

[Aprende más sobre Análisis XYZ →](/conceptos/analisis-xyz)

## Punto de Reorden

El **Punto de Reorden** es el nivel de inventario en el cual debes generar una nueva orden de compra. Se calcula considerando:

- **Demanda promedio diaria**
- **Lead time** (tiempo de entrega del proveedor)
- **Stock de seguridad**

```
Punto de Reorden = (Demanda Diaria × Lead Time) + Stock de Seguridad
```

[Aprende más sobre Punto de Reorden →](/conceptos/punto-reorden)

## Stock de Seguridad

El **Stock de Seguridad** es el inventario adicional que mantienes para protegerte contra:

- Variabilidad en la demanda
- Retrasos en las entregas
- Errores en los pronósticos

Un stock de seguridad bien calculado reduce quiebres de stock sin generar sobre-inventario excesivo.

[Aprende más sobre Stock de Seguridad →](/conceptos/stock-seguridad)

## Cobertura de Stock

La **Cobertura de Stock** indica cuántos días de venta puedes cubrir con el inventario actual:

```
Cobertura = Stock Actual ÷ Venta Promedio Diaria
```

Por ejemplo, si tienes 100 unidades y vendes 10 por día, tienes cobertura de 10 días.

## ETL (Extracción, Transformación, Carga)

El proceso **ETL** es cómo Fluxion AI sincroniza datos desde tu sistema de origen (ERP):

1. **Extracción** - Obtiene datos del sistema fuente
2. **Transformación** - Limpia y normaliza los datos
3. **Carga** - Almacena en la base de datos de Fluxion

Este proceso se ejecuta periódicamente para mantener los datos actualizados.

## Próximos Pasos

- [Navegación del Sistema](/getting-started/navegacion)
- [Clasificación ABC en detalle](/conceptos/clasificacion-abc)
- [Módulo de Productos](/modulos/productos)
