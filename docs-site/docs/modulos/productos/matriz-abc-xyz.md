---
sidebar_position: 4
title: Matriz ABC-XYZ
---

# Matriz ABC-XYZ

Análisis combinado que cruza valor económico (ABC) con variabilidad de demanda (XYZ).

## ¿Por qué combinar ABC y XYZ?

- **ABC** te dice qué tan **importante** es un producto (valor)
- **XYZ** te dice qué tan **predecible** es su demanda (variabilidad)

Juntos, permiten estrategias de inventario más precisas.

## La Matriz

|   | X (Estable) | Y (Variable) | Z (Muy Variable) |
|---|-------------|--------------|------------------|
| **A** | AX | AY | AZ |
| **B** | BX | BY | BZ |
| **C** | CX | CY | CZ |

### Cuadrante AX - "Estrella"
- **Alta importancia, alta predictibilidad**
- Fácil de gestionar, máximo impacto
- Estrategia: Automatizar reposición, stock óptimo

### Cuadrante AY - "Retador"
- **Alta importancia, variabilidad moderada**
- Requiere atención y análisis
- Estrategia: Stock de seguridad elevado, monitoreo frecuente

### Cuadrante AZ - "Problemático"
- **Alta importancia, muy impredecible**
- Crítico pero difícil de gestionar
- Estrategia: Stock alto, análisis de causas de variabilidad

### Cuadrante BX, BY, BZ
- Importancia media
- Gestión proporcional a su variabilidad

### Cuadrante CX, CY
- Baja importancia pero predecibles
- Gestión simplificada

### Cuadrante CZ - "Candidato a eliminación"
- Bajo valor Y alta variabilidad
- Evaluar si vale la pena mantener

## Vista en Fluxion AI

### Mapa de Calor

Visualización de la matriz con:
- Color por densidad de productos
- Tamaño por valor total
- Click para ver productos del cuadrante

### Distribución por Cuadrante

Tabla resumen mostrando:
- Cantidad de SKUs por cuadrante
- Valor de ventas por cuadrante
- Porcentaje del total

### Detalle por Producto

Lista de productos con su posición en la matriz.

## Estrategias Recomendadas

| Cuadrante | Stock Seguridad | Frecuencia Revisión | Método Pronóstico |
|-----------|-----------------|---------------------|-------------------|
| AX | Bajo | Alta | Automático |
| AY | Medio | Alta | Con análisis |
| AZ | Alto | Muy alta | Manual + buffer |
| BX | Bajo | Media | Automático |
| BY | Medio | Media | Estándar |
| BZ | Medio-Alto | Media | Con buffer |
| CX | Mínimo | Baja | Simple |
| CY | Bajo | Baja | Simple |
| CZ | Evaluar | Revisar | Considerar eliminar |

## Aprende Más

- [Análisis XYZ](/conceptos/analisis-xyz)
- [Stock de Seguridad](/conceptos/stock-seguridad)
