---
sidebar_position: 1
title: Clasificación ABC
---

# Clasificación ABC

La clasificación ABC es un método de categorización de inventario basado en el principio de Pareto.

## El Principio de Pareto (80/20)

El economista Vilfredo Pareto observó que el 80% de la riqueza estaba en manos del 20% de la población. Este principio se aplica en muchos contextos:

- **80%** de las ventas vienen del **20%** de los productos
- **80%** de los problemas vienen del **20%** de las causas
- **80%** del valor del inventario está en el **20%** de los SKUs

## Aplicación en Inventario

La clasificación ABC divide los productos en tres categorías según su contribución al valor total:

### Clase A - Los Vitales

- **Proporción**: ~10-20% de los productos
- **Contribución**: ~80% del valor
- **Características**:
  - Productos de alto valor o alta rotación
  - Críticos para el negocio
  - Pequeños errores tienen gran impacto

**Estrategia de gestión:**
- Monitoreo frecuente (diario)
- Pronósticos detallados
- Stock de seguridad adecuado
- Negociación activa con proveedores
- Control estricto de inventario

### Clase B - Los Intermedios

- **Proporción**: ~20-30% de los productos
- **Contribución**: ~15% del valor
- **Características**:
  - Valor medio
  - Importancia moderada
  - Balance entre atención y eficiencia

**Estrategia de gestión:**
- Monitoreo semanal
- Pronósticos estándar
- Stock de seguridad moderado
- Revisión periódica de parámetros

### Clase C - Los Triviales

- **Proporción**: ~50-70% de los productos
- **Contribución**: ~5% del valor
- **Características**:
  - Bajo valor individual
  - Gran cantidad de SKUs
  - Bajo impacto de errores individuales

**Estrategia de gestión:**
- Monitoreo mensual o por excepción
- Reglas simples de reorden
- Stock mínimo necesario
- Considerar consolidación o eliminación

## Cálculo de la Clasificación

### Paso 1: Calcular valor de cada producto

```
Valor = Cantidad Vendida × Precio Unitario
```

### Paso 2: Ordenar de mayor a menor

Ordenar todos los productos por su valor, de mayor a menor.

### Paso 3: Calcular porcentaje acumulado

Para cada producto, calcular el porcentaje que representa del total acumulado.

### Paso 4: Asignar clase

- **A**: Productos hasta el umbral A (ej: 80%)
- **B**: Productos entre umbral A y B (ej: 80%-95%)
- **C**: Productos restantes (ej: 95%-100%)

## Ejemplo Práctico

| Producto | Ventas ($) | % del Total | % Acumulado | Clase |
|----------|-----------|-------------|-------------|-------|
| Prod 1 | 50,000 | 50% | 50% | A |
| Prod 2 | 20,000 | 20% | 70% | A |
| Prod 3 | 10,000 | 10% | 80% | A |
| Prod 4 | 7,000 | 7% | 87% | B |
| Prod 5 | 5,000 | 5% | 92% | B |
| Prod 6 | 3,000 | 3% | 95% | B |
| Prod 7 | 2,000 | 2% | 97% | C |
| Prod 8 | 1,500 | 1.5% | 98.5% | C |
| Prod 9 | 1,000 | 1% | 99.5% | C |
| Prod 10 | 500 | 0.5% | 100% | C |

En este ejemplo:
- **3 productos (30%)** son clase A y suman **80%** del valor
- **3 productos (30%)** son clase B y suman **15%** del valor
- **4 productos (40%)** son clase C y suman **5%** del valor

## Beneficios

1. **Priorización de esfuerzos** - Enfócate en lo que importa
2. **Optimización de inventario** - Stock adecuado según importancia
3. **Reducción de costos** - Menos inversión en productos C
4. **Mejor servicio** - Nunca falta un producto A

## Consideraciones

### Limitaciones

- No considera variabilidad de demanda (usa ABC-XYZ para esto)
- Puede cambiar con el tiempo
- No aplica igual a todos los productos (ej: generadores de tráfico)

### Frecuencia de Recálculo

Se recomienda recalcular:
- **Mensualmente** para operación normal
- **Trimestralmente** para decisiones estratégicas
- **Después de cambios significativos** (nuevos productos, temporadas)

## En Fluxion AI

Fluxion AI calcula y actualiza automáticamente la clasificación ABC:

- Configura umbrales en [Parámetros ABC](/modulos/administrador/parametros-abc)
- Visualiza en [Módulo de Productos](/modulos/productos/clasificacion-abc)
- Afecta cálculos de [Pedidos Sugeridos](/modulos/pedidos-sugeridos)

## Aprende Más

- [Análisis XYZ](/conceptos/analisis-xyz) - Complemento por variabilidad
- [Matriz ABC-XYZ](/modulos/productos/matriz-abc-xyz) - Análisis combinado
