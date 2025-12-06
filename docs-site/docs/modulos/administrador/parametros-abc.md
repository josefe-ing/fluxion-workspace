---
sidebar_position: 3
title: Parámetros ABC
---

# Configuración de Parámetros ABC

Configura los umbrales y parámetros que controlan la clasificación ABC/XYZ y cálculos de inventario.

## Parámetros de Clasificación ABC

### Umbrales ABC

Define cómo se segmentan los productos por valor:

| Parámetro | Default | Descripción |
|-----------|---------|-------------|
| **Umbral A** | 80% | Productos que acumulan hasta este % del valor total |
| **Umbral B** | 95% | Productos entre umbral A y este % |
| **Clase C** | Resto | Productos restantes |

### Ejemplo

Con umbrales 80% / 95%:
- **Clase A**: Productos que suman el 80% del valor
- **Clase B**: Productos entre 80% y 95%
- **Clase C**: Productos del 95% al 100%

## Parámetros de Clasificación XYZ

### Umbrales de Variabilidad

Basados en el Coeficiente de Variación (CV):

| Parámetro | Default | Descripción |
|-----------|---------|-------------|
| **Umbral X** | 50% | CV menor a este valor = X |
| **Umbral Y** | 100% | CV entre X y este valor = Y |
| **Clase Z** | Resto | CV mayor = Z |

### Coeficiente de Variación

```
CV = (Desviación Estándar / Promedio) × 100
```

- **CV bajo** = demanda estable
- **CV alto** = demanda variable

## Parámetros de Stock de Seguridad

### Días de Cobertura por Clase

| Clase ABC | Días Default | Justificación |
|-----------|--------------|---------------|
| **A** | 14 días | Alto impacto, mayor protección |
| **B** | 10 días | Impacto medio |
| **C** | 7 días | Bajo impacto, menor inversión |

### Ajuste por Variabilidad XYZ

Multiplicadores adicionales por variabilidad:

| Clase XYZ | Multiplicador |
|-----------|---------------|
| **X** | 1.0x |
| **Y** | 1.3x |
| **Z** | 1.5x |

## Período de Cálculo

### Ventana de Análisis

| Parámetro | Default | Descripción |
|-----------|---------|-------------|
| **Días para promedio** | 20 | Días para calcular venta promedio |
| **Días para clasificación** | 90 | Período para clasificación ABC |
| **Días mínimos de data** | 30 | Mínimo de datos para clasificar |

## Cómo Modificar

1. Ve a **Administrador > Parámetros ABC**
2. Ajusta los valores deseados
3. Click en **Guardar**
4. Los cambios aplican en el siguiente recálculo

## Impacto de Cambios

### Cambiar Umbral ABC

- **Aumentar umbral A (ej: 80% → 85%)**: Menos productos serán A
- **Disminuir umbral A (ej: 80% → 75%)**: Más productos serán A

### Cambiar Stock de Seguridad

- **Aumentar días**: Mayor protección, mayor inversión en inventario
- **Disminuir días**: Menor inventario, mayor riesgo de quiebre

## Recálculo de Clasificaciones

Las clasificaciones se recalculan:
- **Automáticamente**: Diariamente (configurable)
- **Manualmente**: Desde este panel

### Forzar Recálculo

1. Click en **Recalcular Clasificaciones**
2. Espera a que termine el proceso
3. Las nuevas clasificaciones estarán disponibles

## Historial de Cambios

El sistema mantiene un log de:
- Quién cambió parámetros
- Cuándo se hizo el cambio
- Valores anteriores y nuevos

## Recomendaciones

- No cambies umbrales frecuentemente
- Evalúa el impacto antes de cambiar
- Comienza con valores conservadores
- Ajusta basándote en resultados reales

## Próximos Pasos

- [Clasificación ABC](/conceptos/clasificacion-abc)
- [Análisis XYZ](/conceptos/analisis-xyz)
- [Stock de Seguridad](/conceptos/stock-seguridad)
