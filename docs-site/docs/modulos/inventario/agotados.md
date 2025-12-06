---
sidebar_position: 4
title: Agotados y Quiebres
---

# Agotados y Quiebres de Stock

Monitoreo y gestión de productos sin existencia disponible para la venta.

## Definiciones

### Agotado
Producto con **stock cero** en una ubicación específica. No hay unidades disponibles para vender.

### Quiebre de Stock
Situación donde la demanda supera el inventario disponible, resultando en:
- Ventas perdidas
- Clientes insatisfechos
- Pérdida de oportunidades

### Stock Negativo
Anomalía en el sistema donde el stock registrado es menor a cero. Físicamente imposible, indica problemas de datos.

## Identificación de Agotados

### En el Dashboard de Inventario

Los productos agotados se muestran con:
- **Indicador rojo** en la columna de stock
- **Badge "Agotado"** visible
- **Prioridad alta** en ordenamiento

### Filtros Rápidos

Usa el filtro de estado para ver solo:
- Productos agotados
- Productos críticos (próximos a agotarse)
- Productos con stock negativo (anomalías)

## Métricas de Agotados

### KPIs Principales

| Métrica | Descripción |
|---------|-------------|
| **Total Agotados** | Cantidad de SKUs sin stock |
| **% del Catálogo** | Porcentaje de productos agotados |
| **Agotados Clase A** | Productos importantes sin stock |
| **Días Promedio Agotado** | Tiempo promedio sin stock |

### Tendencia

El sistema rastrea:
- Evolución de agotados en el tiempo
- Productos recurrentemente agotados
- Mejora o deterioro del indicador

## Impacto de los Agotados

### Por Clasificación ABC

| Clase | Impacto de Agotado |
|-------|-------------------|
| **A** | Crítico - Afecta ~80% del valor |
| **B** | Alto - Afecta ~15% del valor |
| **C** | Moderado - Afecta ~5% del valor |

### Cálculo de Pérdida

```
Pérdida Diaria = Venta Promedio Diaria × Precio × Margen
```

Ver [Ventas Perdidas](/modulos/ventas/ventas-perdidas) para análisis detallado.

## Causas Comunes

### Operativas
- Punto de reorden mal configurado
- Lead time subestimado
- Stock de seguridad insuficiente

### Demanda
- Pico de demanda inesperado
- Promoción no planificada
- Estacionalidad

### Proveedor
- Retraso en entrega
- Producto descontinuado
- Problemas de calidad

### Datos
- Error en registro de inventario
- Transferencias no registradas
- Robos o mermas

## Acciones Correctivas

### Inmediatas (Hoy)

1. **Identificar** productos agotados clase A
2. **Verificar** si hay stock en otras ubicaciones
3. **Solicitar** transferencia urgente si es posible
4. **Generar** pedido express al proveedor

### Corto Plazo (Esta semana)

1. **Revisar** punto de reorden de productos afectados
2. **Ajustar** stock de seguridad
3. **Analizar** causa raíz del agotado
4. **Documentar** para evitar recurrencia

### Mediano Plazo (Este mes)

1. **Evaluar** parámetros generales de inventario
2. **Negociar** con proveedores tiempos de entrega
3. **Implementar** alertas tempranas
4. **Capacitar** al equipo en gestión de stock

## Prevención

### Alertas Proactivas

Configura alertas para:
- Stock llegando a punto de reorden
- Cobertura menor a X días
- Tendencia de consumo acelerada

### Revisión de Parámetros

Revisa periódicamente:
- Puntos de reorden por producto
- Stock de seguridad por clasificación
- Lead times actualizados

### Pronósticos

Mejora pronósticos considerando:
- Estacionalidad
- Tendencias
- Promociones planificadas

## Reportes

### Reporte de Agotados

Incluye:
- Lista de productos agotados
- Días sin stock
- Venta perdida estimada
- Acción sugerida

### Reporte de Quiebres Histórico

Muestra:
- Frecuencia de quiebres por producto
- Productos problemáticos recurrentes
- Tendencia mensual

## Integración con Otros Módulos

| Módulo | Relación |
|--------|----------|
| **Pedidos Sugeridos** | Prioriza productos agotados |
| **Centro de Comando** | Corrige stocks negativos |
| **Ventas Perdidas** | Cuantifica impacto económico |
| **Alertas** | Notifica cuando hay agotados críticos |

## Próximos Pasos

- [Ventas Perdidas](/modulos/ventas/ventas-perdidas) - Cuantifica el impacto
- [Centro de Comando](/modulos/ventas/centro-comando) - Corrige anomalías
- [Pedidos Sugeridos](/modulos/pedidos-sugeridos) - Repone faltantes
- [Punto de Reorden](/conceptos/punto-reorden) - Previene quiebres
