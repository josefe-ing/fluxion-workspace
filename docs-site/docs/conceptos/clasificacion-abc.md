---
sidebar_position: 1
title: Clasificacion ABC
---

# Clasificacion ABC

La Clasificacion ABC es un metodo de categorizacion de productos basado en su **volumen de ventas** (cantidad de unidades vendidas), que permite priorizar la gestion de inventario segun la importancia de cada producto.

## Metodo de Clasificacion: Ranking por Cantidad

En Fluxion AI, la clasificacion ABC se basa en el **ranking de unidades vendidas** en la region, no en el valor monetario. Esto permite identificar los productos de mayor rotacion independientemente de su precio.

### Las 4 Clases

| Clase | Ranking | Descripcion | Caracteristicas |
|-------|---------|-------------|-----------------|
| **A** | Top 50 | Productos estrella | Maxima rotacion, nunca deben faltar |
| **B** | 51-200 | Productos importantes | Alta rotacion, atencion frecuente |
| **C** | 201-800 | Productos regulares | Rotacion media, gestion estandar |
| **D** | 801+ | Productos de baja rotacion | Baja rotacion, revision periodica |

### Visualizacion

```
Ranking de Productos por Cantidad Vendida
─────────────────────────────────────────

    │ Clase A │   Clase B   │      Clase C       │    Clase D
    │ Top 50  │   51-200    │      201-800       │     801+
────┼─────────┼─────────────┼────────────────────┼──────────────
    │ ████████│ ████████    │ ████████           │ ████████
    │ ████████│ ████████    │ ████████           │ ████████
    │ ████████│ ████████    │ ████████           │
    │         │             │                    │
────┴─────────┴─────────────┴────────────────────┴──────────────
        Alta         Media          Moderada          Baja
       Rotacion     Rotacion        Rotacion        Rotacion
```

## Por que Ranking por Cantidad (no por Valor)

El metodo tradicional de Pareto (80/20 por valor) tiene limitaciones para la operacion de inventario:

| Aspecto | Pareto por Valor | Ranking por Cantidad |
|---------|------------------|---------------------|
| **Enfoque** | Productos caros | Productos de alta rotacion |
| **Problema** | Un producto caro con pocas ventas puede ser "A" | Prioriza lo que realmente se mueve |
| **Resultado** | Puede ignorar productos de alto volumen/bajo precio | Asegura disponibilidad de productos populares |

### Ejemplo Practico

| Producto | Precio | Ventas/mes | Valor | Clase Pareto | Clase Ranking |
|----------|--------|------------|-------|--------------|---------------|
| Harina PAN 1kg | $2 | 10,000 u | $20,000 | B | **A** (Top 10) |
| Whisky Premium | $50 | 100 u | $5,000 | A | **D** (bajo volumen) |

Con el metodo de ranking, la Harina PAN (alta rotacion, producto basico) tiene prioridad sobre el Whisky Premium (bajo volumen, producto de nicho).

## Parametros de Clasificacion

### Umbrales de Ranking

Los umbrales son configurables en el sistema:

| Parametro | Valor Default | Descripcion |
|-----------|---------------|-------------|
| `umbral_a` | 50 | Top N productos para Clase A |
| `umbral_b` | 200 | Top N productos para Clase B |
| `umbral_c` | 800 | Top N productos para Clase C |

Productos con ranking mayor a `umbral_c` se clasifican como **Clase D**.

### Niveles de Servicio por Clase

Cada clase tiene un nivel de servicio objetivo diferente:

| Clase | Z-Score | Nivel Servicio | Significado |
|-------|---------|----------------|-------------|
| **A** | 2.33 | 99% | 1 quiebre cada 100 ciclos |
| **B** | 1.88 | 97% | 3 quiebres cada 100 ciclos |
| **C** | 1.28 | 90% | 10 quiebres cada 100 ciclos |
| **D** | N/A | ~85% | Metodo Padre Prudente |

### Dias de Cobertura por Clase

| Clase | Dias Cobertura | Razon |
|-------|----------------|-------|
| **A** | 7 dias | Alta rotacion, pedidos frecuentes |
| **B** | 14 dias | Rotacion media |
| **C** | 21 dias | Baja rotacion, menos pedidos |
| **D** | 30 dias | Muy baja rotacion |

## Estrategias de Gestion por Clase

### Clase A - Los Vitales (Top 50)

- **Monitoreo**: Diario
- **Stock de seguridad**: Alto (Z=2.33)
- **Accion ante quiebre**: Pedido urgente inmediato
- **Pronostico**: Detallado, P75

### Clase B - Los Importantes (51-200)

- **Monitoreo**: Cada 2-3 dias
- **Stock de seguridad**: Medio (Z=1.88)
- **Accion ante quiebre**: Incluir en proximo pedido
- **Pronostico**: Estandar

### Clase C - Los Regulares (201-800)

- **Monitoreo**: Semanal
- **Stock de seguridad**: Bajo (Z=1.28)
- **Accion ante quiebre**: Planificar para la semana
- **Pronostico**: Simplificado

### Clase D - Los de Baja Rotacion (801+)

- **Monitoreo**: Mensual
- **Stock de seguridad**: Metodo Padre Prudente
- **Accion ante quiebre**: Evaluar si justifica pedido
- **Pronostico**: Minimo

## Clasificacion por Tienda vs Global

Fluxion AI soporta dos niveles de clasificacion:

### ABC Global (productos_abc_cache)

- Ranking basado en ventas **totales de todas las tiendas**
- Usado para decisiones a nivel empresa
- Actualizado periodicamente

### ABC por Tienda (productos_abc_tienda)

- Ranking basado en ventas **de cada tienda individual**
- Un producto puede ser A en una tienda y C en otra
- Usado para pedidos CEDI → Tienda

### Ejemplo

| Producto | ABC Global | ABC Artigas | ABC Paraiso |
|----------|------------|-------------|-------------|
| Harina PAN | A | A | A |
| Queso Regional | B | A | C |
| Producto Local | D | D | A |

## Metodo Padre Prudente (Clase D)

Para productos Clase D, en lugar del metodo estadistico tradicional, se usa el **Metodo Padre Prudente**:

```
Stock_Seguridad_D = 0.30 × Demanda_Diaria × Lead_Time
```

Este metodo:
- Es mas conservador que el estadistico
- Garantiza un minimo de 30% de demanda como colchon
- Evita calculos complejos para productos de bajo impacto

## Impacto en el Sistema

La clasificacion ABC afecta multiples modulos:

| Modulo | Uso de ABC |
|--------|------------|
| **Pedidos Sugeridos** | Prioriza productos A, ajusta stock de seguridad |
| **Pedidos Inter-CEDI** | Calcula dias de cobertura por clase |
| **Alertas** | Prioriza alertas de productos A |
| **Emergencias** | Recomendaciones diferenciadas por clase |
| **Stock de Seguridad** | Z-score y dias cobertura por clase |

## Recalculo de Clasificacion

La clasificacion ABC se recalcula:

- **Automaticamente**: Cada semana (configurable)
- **Manualmente**: Desde Administrador > Parametros ABC

### Proceso de Recalculo

1. Extrae ventas de los ultimos 90 dias por tienda/region
2. Suma cantidad vendida por producto
3. Ordena de mayor a menor (ranking)
4. Asigna clase segun umbrales configurados
5. Actualiza tablas de cache

## Configuracion

Los parametros ABC se configuran en:

- **Administrador > Parametros ABC** (UI)
- **Tabla `config_inventario_global`** (DB)

Ver [Parametros ABC](/modulos/administrador/parametros-abc) para detalles de configuracion.

## Aprende Mas

- [Analisis XYZ](/conceptos/analisis-xyz) - Clasificacion por variabilidad
- [Matriz ABC-XYZ](/modulos/productos/matriz-abc-xyz) - Combinacion de ambas
- [Stock de Seguridad](/conceptos/stock-seguridad) - Calculo por clase
- [Punto de Reorden](/conceptos/punto-reorden) - Formulas por clase
