---
sidebar_position: 1
title: Administrador
---

# Módulo Administrador

El módulo Administrador te permite configurar el sistema, monitorear procesos ETL y ajustar parámetros de clasificación.

## Vista General

Este módulo es para usuarios con permisos administrativos y proporciona:

- Control de procesos ETL (sincronización de datos)
- Configuración de parámetros ABC/XYZ
- Gestión de generadores de tráfico
- Monitoreo del sistema

## Secciones

### Centro de Control ETL

Monitorea y controla la sincronización de datos:
- Estado de conexiones a sistemas fuente
- Ejecuciones de ETL (ventas, inventario)
- Logs y errores
- Ejecución manual de sincronización

### Parámetros ABC

Configura los umbrales y parámetros de clasificación:
- Umbrales ABC (80%, 95%, etc.)
- Umbrales XYZ (coeficiente de variación)
- Stock de seguridad por clase
- Período de cálculo

### Generadores de Tráfico

Gestión de productos considerados generadores de tráfico:
- Productos que atraen clientes
- Configuración especial de stock
- Excepciones a reglas ABC

## Navegación

```
Administrador
├── Centro de Control ETL
├── Parámetros ABC
└── Generadores de Tráfico
```

## Acceso

Solo usuarios con rol de **Administrador** o **Gerente** tienen acceso a este módulo.

## Próximas Secciones

- [Centro de Control ETL](/modulos/administrador/etl-control)
- [Parámetros ABC](/modulos/administrador/parametros-abc)
