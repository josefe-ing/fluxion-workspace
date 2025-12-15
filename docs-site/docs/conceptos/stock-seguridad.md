---
sidebar_position: 4
title: Stock de Seguridad
---

# Stock de Seguridad

El stock de seguridad es el inventario adicional que mantienes para protegerte contra la incertidumbre.

## ¿Por qué es necesario?

La realidad nunca es perfectamente predecible:

- La demanda **varía** día a día
- Los proveedores **se retrasan** a veces
- Los pronósticos **tienen errores**
- Ocurren **imprevistos**

El stock de seguridad es tu "colchón" contra estos factores.

## Sin Stock de Seguridad vs Con Stock de Seguridad

### Sin Stock de Seguridad

```
Stock
  │
 50│ ╔═══╗
  │ ║   ╚═══╗
 30│ ║       ╚═══╗  ← Demanda normal
  │ ║           ║
  0│─╩───────────╬── ¡QUIEBRE! Demanda mayor a esperada
   └──────────────► Tiempo
```

### Con Stock de Seguridad

```
Stock
  │
 70│ ╔═══╗
  │ ║   ╚═══╗
 50│ ║       ╚═══╗
  │ ║           ╚═══╗  ← Demanda mayor a esperada
 20│─║───────────────╬── Stock de Seguridad
  │ ║               ║
  0│─╩───────────────╩──
   └──────────────────► Tiempo
        No hay quiebre ✓
```

## Factores que determinan el Stock de Seguridad

### 1. Variabilidad de la Demanda

A mayor variabilidad, más stock de seguridad necesitas.

| Clase XYZ | Variabilidad | Stock de Seguridad |
|-----------|--------------|-------------------|
| X | Baja | Bajo |
| Y | Media | Medio |
| Z | Alta | Alto |

### 2. Variabilidad del Lead Time

Si el proveedor es inconsistente, necesitas más colchón.

### 3. Nivel de Servicio Deseado

¿Qué porcentaje de demanda quieres satisfacer?

| Nivel de Servicio | Factor Z | Significado |
|-------------------|----------|-------------|
| 90% | 1.28 | Quiebre en 1 de cada 10 ciclos |
| 95% | 1.65 | Quiebre en 1 de cada 20 ciclos |
| 99% | 2.33 | Quiebre en 1 de cada 100 ciclos |

### 4. Importancia del Producto (ABC)

| Clase ABC | Ranking | Z-Score | Nivel de Servicio |
|-----------|---------|---------|-------------------|
| A | Top 50 | 2.33 | 99% (nunca puede faltar) |
| B | 51-200 | 1.88 | 97% |
| C | 201-800 | 1.28 | 90% |
| D | 801+ | Padre Prudente | ~85% |

## Métodos de Cálculo

### Método Simple (Días de Cobertura)

```
Stock de Seguridad = Demanda Diaria × Días de Cobertura
```

**Ejemplo:**
- Demanda: 10 unidades/día
- Cobertura deseada: 7 días
- **Stock de Seguridad = 10 × 7 = 70 unidades**

Este es el método usado en Fluxion AI por su simplicidad y efectividad.

### Método Estadístico

```
SS = Z × σd × √LT
```

Donde:
- Z = Factor de nivel de servicio
- σd = Desviación estándar de demanda diaria
- LT = Lead time en días

**Ejemplo:**
- Nivel de servicio 95% → Z = 1.65
- σd = 5 unidades
- LT = 9 días
- **SS = 1.65 × 5 × √9 = 1.65 × 5 × 3 = 24.75 ≈ 25 unidades**

## Configuracion en Fluxion AI

### Por Clase ABC

| Clase | Ranking | Z-Score | Dias de Cobertura |
|-------|---------|---------|-------------------|
| A | Top 50 | 2.33 | 7 dias |
| B | 51-200 | 1.88 | 14 dias |
| C | 201-800 | 1.28 | 21 dias |
| D | 801+ | Padre Prudente | 30 dias |

### Metodo Padre Prudente (Clase D)

Para productos de baja rotacion (ranking 801+):

```
SS = 0.30 × Demanda_Diaria × Lead_Time
```

Este metodo conservador garantiza un 30% de la demanda durante el ciclo como colchon.

### Multiplicador por XYZ

| Clase XYZ | Multiplicador |
|-----------|---------------|
| X | 1.0x |
| Y | 1.3x |
| Z | 1.5x |

### Ejemplo Combinado

Producto clasificado como **AY** (Clase A, variabilidad Y):
- P75: 630 unidades/dia
- σ: 166 unidades
- Lead Time: 1.5 dias
- Z (Clase A): 2.33
- Multiplicador (Y): 1.3x

```
Stock de Seguridad Base = Z × σ × √L
                       = 2.33 × 166 × √1.5
                       = 2.33 × 166 × 1.22
                       = 472 unidades

Con multiplicador Y (1.3x):
Stock de Seguridad Final = 472 × 1.3 = 614 unidades
```

## Costo del Stock de Seguridad

### Costo de Mantener Stock
- Capital inmovilizado
- Espacio de almacenamiento
- Riesgo de obsolescencia
- Costo de manejo

### Costo de No Tener Stock
- Ventas perdidas
- Clientes insatisfechos
- Pérdida de market share
- Pedidos urgentes (más caros)

**El balance óptimo** minimiza el costo total.

## Errores Comunes

### Stock de Seguridad Excesivo
- "Por si acaso" para todo
- Capital desperdiciado
- Productos que expiran
- Oculta problemas de pronóstico

### Stock de Seguridad Insuficiente
- Quiebres frecuentes
- Clientes molestos
- Compras de emergencia
- Pérdida de ventas

## Revisión y Ajuste

El stock de seguridad no es estático. Revísalo cuando:

- Cambia la variabilidad de demanda
- Cambia el lead time
- Cambian las prioridades del negocio
- Hay cambios estacionales

## En Fluxion AI

- Configuración en [Parámetros ABC](/modulos/administrador/parametros-abc)
- Afecta [Punto de Reorden](/conceptos/punto-reorden)
- Visible en [Pedidos Sugeridos](/modulos/pedidos-sugeridos)

## Aprende Más

- [Punto de Reorden](/conceptos/punto-reorden)
- [Análisis XYZ](/conceptos/analisis-xyz)
- [Matriz ABC-XYZ](/modulos/productos/matriz-abc-xyz)
