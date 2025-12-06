---
sidebar_position: 4
title: Centro de Comando de Corrección
---

# Centro de Comando de Corrección

El Centro de Comando de Corrección es una herramienta crítica para identificar y corregir anomalías de stock en tiempo real.

## ¿Qué problema resuelve?

En operaciones de retail, es común encontrar **stocks negativos** en el sistema, lo cual es físicamente imposible. Esto ocurre por:

- Ventas registradas sin entrada de mercancía
- Errores en conteos de inventario
- Transferencias no registradas
- Ajustes pendientes

El Centro de Comando te permite **detectar y corregir** estas anomalías de forma rápida y controlada.

## Acceso

1. Ve a **Inventario** → selecciona una tienda
2. Click en el botón **Centro de Comando de Corrección** (badge rojo indica cantidad de anomalías)

## Vista Principal

### Lista de Anomalías

El sistema muestra todos los productos con stock negativo, ordenados por prioridad:

| Columna | Descripción |
|---------|-------------|
| **Producto** | Código y nombre del producto |
| **Stock Actual** | Cantidad negativa detectada |
| **Categoría** | Categoría del producto |
| **Prioridad** | Basada en valor y movimiento |
| **Evidencia** | Ventas que causaron el negativo |

### Evidencia de Ventas

Para cada producto con anomalía, puedes ver la **evidencia**:

- Número de factura
- Fecha y hora de venta
- Cantidad vendida
- Stock al momento de la venta

Esto te ayuda a entender **por qué** el stock se volvió negativo.

## Proceso de Corrección

### Paso 1: Revisar Anomalías

1. Identifica los productos con stock negativo
2. Revisa la evidencia de ventas
3. Verifica físicamente el stock real

### Paso 2: Ingresar Conteo Físico

Para cada producto:
1. Ve al almacén/tienda física
2. Cuenta las unidades reales
3. Ingresa el **conteo físico** en el campo correspondiente

### Paso 3: Confirmar Ajustes

1. Revisa todos los ajustes ingresados
2. Click en **Confirmar Ajustes**
3. El sistema aplicará las correcciones

### Resultados

Después de confirmar, verás:
- Stock anterior
- Conteo físico ingresado
- Diferencia aplicada
- Confirmación de ajuste

## Historial del Día

El sistema también muestra información histórica del día:

- **Stock máximo hoy** - El nivel más alto registrado
- **Stock mínimo hoy** - El nivel más bajo registrado
- **Snapshots** - Cantidad de lecturas de stock del día

Esto ayuda a entender la dinámica del inventario durante el día.

## Mejores Prácticas

### Frecuencia de Revisión

- **Diaria**: Para productos clase A
- **Semanal**: Para productos clase B y C
- **Inmediata**: Cuando hay muchas anomalías

### Priorización

1. **Primero**: Productos con mayor valor (clase A)
2. **Segundo**: Productos con más ventas evidenciadas
3. **Tercero**: Resto de anomalías

### Documentación

- Siempre documenta la causa del ajuste
- Comunica al equipo de operaciones
- Investiga patrones recurrentes

## Integración con Otros Módulos

- **Inventario**: Actualiza stock en tiempo real
- **Ventas**: Corrige cálculos de ventas perdidas
- **Pedidos Sugeridos**: Mejora precisión de sugerencias

## Alertas Automáticas

El sistema genera alertas cuando:
- Hay más de 10 productos con stock negativo
- Un producto clase A tiene anomalía
- El mismo producto tiene anomalías recurrentes

## Próximos Pasos

- [Ventas Perdidas](/modulos/ventas/ventas-perdidas) - Analiza el impacto de los agotados
- [Alertas de Inventario](/modulos/inventario/alertas)
