---
sidebar_position: 1
title: Pedidos Sugeridos
---

# Módulo de Pedidos Sugeridos

El módulo de Pedidos Sugeridos utiliza inteligencia artificial para generar órdenes de compra optimizadas basadas en datos históricos y parámetros configurables.

## Vista General

Este módulo te permite:

- Ver pedidos sugeridos pendientes de revisión
- Crear nuevos pedidos con el wizard inteligente
- Revisar y aprobar pedidos antes de enviar
- Consultar historial de pedidos

## Características

### Generación Inteligente

El sistema calcula cantidades a pedir considerando:

- **Venta promedio** de los últimos 20 días
- **Stock actual** en la tienda destino
- **Punto de reorden** configurado
- **Stock de seguridad** según clasificación ABC
- **Lead time** del proveedor

### Wizard de Creación

Proceso guiado en 3 pasos:
1. Seleccionar origen y destino
2. Revisar y ajustar productos
3. Confirmar pedido

### Aprobación de Pedidos

Flujo de aprobación con:
- Vista previa del pedido completo
- Posibilidad de ajustar cantidades
- Comentarios y observaciones
- Aprobación o rechazo

## Navegación

```
Pedidos Sugeridos
├── Lista de pedidos
├── Nuevo pedido (Wizard)
└── Detalle/Aprobación de pedido
```

## Próximas Secciones

- [Crear un Pedido](/modulos/pedidos-sugeridos/crear-pedido)
- [Punto de Reorden](/modulos/pedidos-sugeridos/punto-reorden)
- [Aprobación de Pedidos](/modulos/pedidos-sugeridos/aprobacion)
