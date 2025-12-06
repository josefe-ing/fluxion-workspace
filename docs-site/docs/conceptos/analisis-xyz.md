---
sidebar_position: 2
title: Análisis XYZ
---

# Análisis XYZ

El análisis XYZ clasifica productos según la **variabilidad de su demanda**, complementando la clasificación ABC.

## ¿Por qué importa la variabilidad?

Dos productos pueden tener el mismo valor de ventas (misma clase ABC) pero comportarse muy diferente:

- **Producto estable**: Vende ~100 unidades cada semana, predecible
- **Producto variable**: Vende 20 una semana, 200 la siguiente, impredecible

La gestión de inventario debe ser diferente para cada uno.

## Las Tres Clases

### Clase X - Demanda Estable

- **Coeficiente de Variación**: < 50%
- **Características**:
  - Demanda consistente y predecible
  - Fácil de pronosticar
  - Bajo riesgo de quiebre o sobre-stock

**Ejemplos típicos:**
- Productos de consumo básico
- Artículos de uso diario
- Productos con demanda constante

### Clase Y - Demanda Variable

- **Coeficiente de Variación**: 50% - 100%
- **Características**:
  - Demanda con fluctuaciones moderadas
  - Requiere análisis para pronosticar
  - Riesgo moderado

**Ejemplos típicos:**
- Productos con cierta estacionalidad
- Artículos promocionales ocasionales
- Productos en crecimiento o declive

### Clase Z - Demanda Muy Variable

- **Coeficiente de Variación**: > 100%
- **Características**:
  - Demanda altamente impredecible
  - Difícil de pronosticar
  - Alto riesgo de quiebre o sobre-stock

**Ejemplos típicos:**
- Productos nuevos sin historial
- Artículos de temporada extrema
- Productos bajo promociones frecuentes

## Coeficiente de Variación (CV)

El CV mide qué tan dispersos están los datos respecto al promedio:

```
CV = (Desviación Estándar / Promedio) × 100
```

### Interpretación

| CV | Interpretación |
|----|----------------|
| < 20% | Muy estable |
| 20-50% | Estable (X) |
| 50-100% | Variable (Y) |
| > 100% | Muy variable (Z) |

### Ejemplo de Cálculo

**Producto A** (ventas semanales): 100, 95, 105, 98, 102
- Promedio: 100
- Desviación estándar: 3.7
- **CV = 3.7%** → Clase X

**Producto B** (ventas semanales): 50, 120, 30, 180, 70
- Promedio: 90
- Desviación estándar: 57.4
- **CV = 63.8%** → Clase Y

**Producto C** (ventas semanales): 10, 200, 5, 150, 0
- Promedio: 73
- Desviación estándar: 89.4
- **CV = 122.4%** → Clase Z

## Estrategias por Clase

### Productos X (Estables)

- ✅ Automatizar reposición
- ✅ Usar pronósticos simples (promedio móvil)
- ✅ Stock de seguridad bajo
- ✅ Pedidos frecuentes, cantidades consistentes

### Productos Y (Variables)

- ⚠️ Analizar causas de variación
- ⚠️ Pronósticos con más factores
- ⚠️ Stock de seguridad moderado
- ⚠️ Revisar regularmente

### Productos Z (Muy Variables)

- 🔴 Evitar automatización ciega
- 🔴 Análisis caso por caso
- 🔴 Stock de seguridad alto
- 🔴 Considerar:
  - Hacer a pedido (make-to-order)
  - Mantener stock mínimo
  - Identificar y eliminar causas de variabilidad

## Causas de Alta Variabilidad

### Internas
- Promociones inconsistentes
- Problemas de abastecimiento
- Cambios en exhibición

### Externas
- Estacionalidad
- Competencia
- Cambios económicos
- Clima

### Datos
- Historial corto
- Datos de mala calidad
- Producto nuevo

## Combinación con ABC

La verdadera utilidad del XYZ viene al combinarlo con ABC:

| Combinación | Característica | Estrategia |
|-------------|----------------|------------|
| AX | Alto valor, estable | Automatizar, máxima eficiencia |
| AY | Alto valor, variable | Atención especial, análisis |
| AZ | Alto valor, impredecible | Crítico, gestión manual |
| CZ | Bajo valor, impredecible | Candidato a eliminar |

Ver [Matriz ABC-XYZ](/modulos/productos/matriz-abc-xyz) para el análisis completo.

## En Fluxion AI

- Clasificación automática basada en ventas históricas
- Configurable en [Parámetros ABC](/modulos/administrador/parametros-abc)
- Visualización en [Matriz ABC-XYZ](/modulos/productos/matriz-abc-xyz)

## Aprende Más

- [Clasificación ABC](/conceptos/clasificacion-abc)
- [Stock de Seguridad](/conceptos/stock-seguridad) - Cómo XYZ afecta el cálculo
