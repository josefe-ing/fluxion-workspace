---
sidebar_position: 4
title: Matriz ABC-XYZ
---

# Matriz ABC-XYZ

Analisis combinado que cruza rotacion (ABC) con variabilidad de demanda (XYZ).

## Por que combinar ABC y XYZ?

- **ABC** te dice que tan **importante** es un producto (por volumen de ventas)
- **XYZ** te dice que tan **predecible** es su demanda (variabilidad)

Juntos, permiten estrategias de inventario mas precisas.

## La Matriz

|   | X (Estable) | Y (Variable) | Z (Muy Variable) |
|---|-------------|--------------|------------------|
| **A** (Top 50) | AX | AY | AZ |
| **B** (51-200) | BX | BY | BZ |
| **C** (201-800) | CX | CY | CZ |
| **D** (801+) | DX | DY | DZ |

## Descripcion de Cuadrantes

### Cuadrante AX - "Estrella"
- **Alta rotacion, alta predictibilidad**
- Facil de gestionar, maximo impacto
- Estrategia: Automatizar reposicion, stock optimo

### Cuadrante AY - "Retador"
- **Alta rotacion, variabilidad moderada**
- Requiere atencion y analisis
- Estrategia: Stock de seguridad elevado, monitoreo frecuente

### Cuadrante AZ - "Problematico"
- **Alta rotacion, muy impredecible**
- Critico pero dificil de gestionar
- Estrategia: Stock alto, analisis de causas de variabilidad

### Cuadrantes BX, BY, BZ
- Rotacion media (posiciones 51-200)
- Gestion proporcional a su variabilidad

### Cuadrantes CX, CY
- Rotacion moderada pero predecibles
- Gestion estandar

### Cuadrante CZ
- Rotacion moderada pero alta variabilidad
- Evaluar estrategia especifica

### Cuadrantes DX, DY, DZ - "Candidatos a revision"
- Baja rotacion (ranking 801+)
- Evaluar si vale la pena mantener stock
- DZ especialmente: considerar descontinuar

## Vista en Fluxion AI

### Mapa de Calor

Visualizacion de la matriz con:
- Color por densidad de productos
- Tamano por volumen de ventas
- Click para ver productos del cuadrante

### Distribucion por Cuadrante

Tabla resumen mostrando:
- Cantidad de SKUs por cuadrante
- Volumen de ventas por cuadrante
- Porcentaje del total

### Detalle por Producto

Lista de productos con su posicion en la matriz.

## Estrategias Recomendadas

| Cuadrante | Stock Seguridad | Frecuencia Revision | Metodo Pronostico |
|-----------|-----------------|---------------------|-------------------|
| AX | Bajo (Z=2.33) | Diaria | Automatico |
| AY | Medio (Z=2.33) | Diaria | Con analisis |
| AZ | Alto (Z=2.33) | Muy alta | Manual + buffer |
| BX | Bajo (Z=1.88) | 2-3 dias | Automatico |
| BY | Medio (Z=1.88) | 2-3 dias | Estandar |
| BZ | Medio-Alto (Z=1.88) | 2-3 dias | Con buffer |
| CX | Bajo (Z=1.28) | Semanal | Simple |
| CY | Bajo (Z=1.28) | Semanal | Simple |
| CZ | Medio (Z=1.28) | Semanal | Con buffer |
| DX | Minimo (P.Prudente) | Mensual | Simple |
| DY | Bajo (P.Prudente) | Mensual | Simple |
| DZ | Evaluar | Revisar | Considerar eliminar |

## Parametros por Clase ABC

| Clase | Ranking | Z-Score | Dias Cobertura | Nivel Servicio |
|-------|---------|---------|----------------|----------------|
| **A** | Top 50 | 2.33 | 7 dias | 99% |
| **B** | 51-200 | 1.88 | 14 dias | 97% |
| **C** | 201-800 | 1.28 | 21 dias | 90% |
| **D** | 801+ | Padre Prudente | 30 dias | ~85% |

## Multiplicador XYZ para Stock de Seguridad

La variabilidad XYZ puede ajustar el stock de seguridad:

| Clase XYZ | CV | Multiplicador |
|-----------|-----|---------------|
| X | < 50% | 1.0x |
| Y | 50-100% | 1.3x |
| Z | > 100% | 1.5x |

### Ejemplo: Producto AY

```
Stock Seguridad Base (A) = Z × σ × √L
Stock Seguridad Base = 2.33 × 166 × 1.22 = 472 unidades

Con multiplicador Y (1.3x):
Stock Seguridad Final = 472 × 1.3 = 614 unidades
```

## Casos de Uso

### Identificar Productos Problematicos

1. Filtrar por cuadrante AZ
2. Analizar causas de variabilidad:
   - Promociones no planificadas?
   - Estacionalidad?
   - Problemas de abastecimiento?
3. Definir acciones correctivas

### Optimizar Inventario

1. Reducir stock de productos DZ (bajo valor, alta variabilidad)
2. Asegurar stock de productos AX, AY (alto valor)
3. Revisar productos CZ para posible descontinuacion

### Planificar Recursos

1. Enfocar atencion en productos A (diario)
2. Revision periodica de productos B y C
3. Revision mensual de productos D

## Aprende Mas

- [Clasificacion ABC](/conceptos/clasificacion-abc) - Metodo de ranking
- [Analisis XYZ](/conceptos/analisis-xyz) - Variabilidad de demanda
- [Stock de Seguridad](/conceptos/stock-seguridad) - Calculo detallado
- [Parametros ABC](/modulos/administrador/parametros-abc) - Configuracion
