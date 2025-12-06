---
sidebar_position: 3
title: Navegación
---

# Navegación del Sistema

Aprende a moverte eficientemente por Fluxion AI.

## Estructura General

La interfaz de Fluxion AI está organizada en:

```
┌────────────────────────────────────────────────────────┐
│  Header (Logo, Navegación Principal, Usuario)          │
├──────────────┬─────────────────────────────────────────┤
│              │                                         │
│   Sidebar    │          Contenido Principal            │
│   (Menú)     │                                         │
│              │                                         │
│              │                                         │
└──────────────┴─────────────────────────────────────────┘
```

## Menú Principal

El sidebar izquierdo contiene los módulos principales:

### Ventas
Accede al análisis de ventas por tienda. Incluye:
- Resumen general de todas las tiendas
- Dashboard detallado por tienda
- Histórico de transacciones

### Inventario
Monitorea el stock actual. Incluye:
- Vista general de inventario
- Alertas de stock crítico
- Historial de movimientos

### Productos
Analiza tu catálogo de productos. Incluye:
- Análisis Maestro
- Clasificación ABC
- Matriz ABC-XYZ

### Pedidos Sugeridos
Genera órdenes de compra inteligentes. Incluye:
- Listado de pedidos
- Wizard de creación
- Aprobación de pedidos

### Administrador
Configura el sistema. Incluye:
- Centro de control ETL
- Parámetros ABC
- Generadores de tráfico

## Navegación por Drill-Down

Fluxion AI usa un patrón de navegación por **drill-down** (profundización):

1. **Nivel 1: Resumen** - Vista general de todas las tiendas
2. **Nivel 2: Tienda** - Detalle de una tienda específica
3. **Nivel 3: Producto** - Información detallada de un producto

### Ejemplo en Ventas

```
Ventas (Resumen) → Click en tienda → Dashboard Tienda → Click en producto → Modal Detalle
```

## Filtros y Controles Comunes

### Selector de Fechas
Presente en la mayoría de vistas, permite filtrar por:
- Hoy
- Últimos 7 días
- Últimos 30 días
- Rango personalizado

### Selector de Tienda
Dropdown para cambiar entre ubicaciones rápidamente.

### Búsqueda
Campo de búsqueda para encontrar productos por nombre o código.

### Exportación
Botones para exportar datos a Excel o PDF cuando están disponibles.

## Atajos de Teclado

| Atajo | Acción |
|-------|--------|
| `/` | Abrir búsqueda |
| `Esc` | Cerrar modal |

## Breadcrumbs

En la parte superior del contenido verás **breadcrumbs** (migas de pan) que muestran tu ubicación actual:

```
Inicio > Ventas > Tienda Central > Producto XYZ
```

Puedes hacer click en cualquier nivel para regresar.

## Próximos Pasos

Ahora que conoces la navegación, explora los módulos:

- [Módulo de Ventas](/modulos/ventas)
- [Módulo de Inventario](/modulos/inventario)
- [Módulo de Productos](/modulos/productos)
