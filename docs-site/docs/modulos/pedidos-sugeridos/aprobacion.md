---
sidebar_position: 4
title: Aprobación
---

# Aprobación de Pedidos

Flujo de revisión y aprobación de pedidos sugeridos antes de su envío.

## Estados del Pedido

| Estado | Descripción |
|--------|-------------|
| **Borrador** | En creación, no guardado |
| **Pendiente** | Creado, esperando aprobación |
| **Aprobado** | Listo para enviar al proveedor |
| **Rechazado** | No aprobado, requiere revisión |
| **Enviado** | Transmitido al proveedor |
| **Recibido** | Mercancía llegó al destino |

## Vista de Aprobación

Al abrir un pedido pendiente verás:

### Encabezado
- Número de pedido
- Fecha de creación
- Origen y destino
- Estado actual

### Detalle de Productos

Tabla con todos los productos:
- Código y nombre
- Cantidad solicitada
- Precio unitario
- Subtotal
- Posibilidad de ajustar

### Resumen

- Total de líneas
- Total de unidades
- Valor total del pedido

### Comparativo

Información adicional para decisión:
- Stock actual vs pedido
- Venta reciente
- Clasificación ABC

## Acciones de Aprobación

### Aprobar

Si el pedido está correcto:
1. Revisa las cantidades
2. Ajusta si es necesario
3. Click en **Aprobar**
4. Opcionalmente agrega comentarios

### Rechazar

Si el pedido requiere cambios mayores:
1. Click en **Rechazar**
2. Indica el motivo
3. El pedido vuelve a estado editable

### Ajustar y Aprobar

Puedes modificar cantidades antes de aprobar:
1. Edita las cantidades necesarias
2. Click en **Guardar Cambios**
3. Luego **Aprobar**

## Notificaciones

El sistema puede notificar:
- Nuevo pedido pendiente de aprobación
- Pedido aprobado listo para enviar
- Pedido rechazado requiere atención

## Permisos

| Rol | Crear | Aprobar | Enviar |
|-----|-------|---------|--------|
| **Operador** | ✓ | - | - |
| **Supervisor** | ✓ | ✓ | - |
| **Gerente** | ✓ | ✓ | ✓ |

## Historial

Cada pedido mantiene un historial de:
- Quién lo creó
- Quién lo aprobó/rechazó
- Modificaciones realizadas
- Timestamps de cada acción

## Próximos Pasos

- [Configuración de Parámetros](/modulos/administrador/parametros-abc)
- [Módulo Administrador](/modulos/administrador)
