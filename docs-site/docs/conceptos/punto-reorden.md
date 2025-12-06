---
sidebar_position: 3
title: Punto de Reorden
---

# Punto de Reorden

El punto de reorden (ROP - Reorder Point) es el nivel de inventario que indica cuándo hacer un nuevo pedido.

## Concepto Básico

Imagina un tanque de agua:
- Se vacía gradualmente (demanda)
- Tarda tiempo en llenarse (lead time)
- Debes pedir antes de que se vacíe

El **punto de reorden** es el nivel en el que debes "abrir la llave" para que llegue más agua antes de quedarte sin ella.

## Fórmula Básica

```
Punto de Reorden = Demanda durante Lead Time + Stock de Seguridad
```

O expresado como:

```
ROP = (Demanda Diaria × Lead Time) + Stock de Seguridad
```

## Componentes

### 1. Demanda Diaria

Cantidad promedio que vendes por día.

**Cálculo en Fluxion AI:**
- Promedio de los últimos 20 días de venta
- Excluye días atípicos (opcional)
- Se actualiza automáticamente

### 2. Lead Time

Tiempo desde que haces el pedido hasta que llega la mercancía.

**Incluye:**
- Tiempo de procesamiento del pedido
- Tiempo de preparación del proveedor
- Tiempo de transporte
- Tiempo de recepción y disponibilidad

**En Fluxion AI:**
- Configurable por proveedor
- Valor por defecto global
- Se puede ajustar por producto

### 3. Stock de Seguridad

Inventario adicional para proteger contra incertidumbre.

Ver [Stock de Seguridad](/conceptos/stock-seguridad) para detalles.

## Ejemplo Completo

### Datos
- Demanda diaria: 10 unidades
- Lead time: 5 días
- Stock de seguridad: 20 unidades

### Cálculo

```
ROP = (10 × 5) + 20
ROP = 50 + 20
ROP = 70 unidades
```

### Interpretación

Cuando el stock llegue a **70 unidades**, debes hacer un pedido.

¿Por qué?
- Durante los 5 días de espera, venderás ~50 unidades
- Quedarán ~20 unidades de seguridad
- El pedido llegará justo a tiempo

## Visualización

```
Stock
  │
150│ ═══╗
  │    ║ Llegada del pedido
100│    ╚════════╗
  │              ║
 70│──────────────╬─── Punto de Reorden (ROP)
  │              ║
 50│              ╚════════╗
  │                        ║
 20│────────────────────────╬─── Stock de Seguridad
  │                        ║
  0│________________________╬___
   └────────────────────────────► Tiempo
     ←─── Lead Time ───→
```

## Factores que Afectan el ROP

### Aumentan el ROP

- Mayor demanda
- Lead time más largo
- Mayor variabilidad (más stock de seguridad)
- Menor tolerancia a quiebres

### Disminuyen el ROP

- Menor demanda
- Lead time más corto
- Demanda estable
- Proveedor confiable

## ROP Dinámico

En la práctica, el ROP no es estático:

### Cambios en Demanda
- Estacionalidad
- Tendencias
- Promociones

### Cambios en Lead Time
- Variabilidad del proveedor
- Temporadas altas
- Problemas logísticos

**Fluxion AI** recalcula el ROP regularmente considerando estos factores.

## ROP por Clasificación ABC

| Clase | Enfoque ROP |
|-------|-------------|
| **A** | Preciso, revisión frecuente, stock de seguridad adecuado |
| **B** | Estándar, revisión periódica |
| **C** | Simple, puede ser menos preciso |

## Errores Comunes

### ROP muy bajo
- **Consecuencia**: Quiebres de stock frecuentes
- **Causa**: Subestimar demanda o lead time

### ROP muy alto
- **Consecuencia**: Sobre-inventario, capital inmovilizado
- **Causa**: Exceso de stock de seguridad

## En Fluxion AI

- Cálculo automático basado en historial
- Visible en [Stock Actual](/modulos/inventario/stock-actual)
- Afecta [Pedidos Sugeridos](/modulos/pedidos-sugeridos)
- Configurable en [Parámetros](/modulos/administrador/parametros-abc)

## Aprende Más

- [Stock de Seguridad](/conceptos/stock-seguridad)
- [Pedidos Sugeridos](/modulos/pedidos-sugeridos)
