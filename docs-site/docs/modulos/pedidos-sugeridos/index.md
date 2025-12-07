---
sidebar_position: 1
title: Pedidos Sugeridos
---

# Módulo de Pedidos Sugeridos

El módulo de Pedidos Sugeridos utiliza algoritmos estadísticos para generar órdenes de compra optimizadas basadas en datos históricos y parámetros configurables.

## Vista General

Este módulo te permite:

- Ver pedidos sugeridos pendientes de revisión
- Crear nuevos pedidos con el wizard inteligente
- Revisar y aprobar pedidos antes de enviar
- Consultar historial de pedidos

## ¿Cómo Calcula el Sistema?

### Métricas de Demanda

El sistema usa **P75** (Percentil 75) en lugar de promedio simple:

| Métrica | Descripción | Uso |
|---------|-------------|-----|
| **P75** | 75% de los días vendió ≤ este valor | Cálculo principal |
| **Promedio 20d** | Venta promedio últimos 20 días | Referencia |
| **TOP3** | Promedio de los 3 mejores días | Picos de demanda |

### Clasificación ABC (Pareto)

Los productos se clasifican por su contribución al valor de ventas:

| Clase | % del Valor | Método de Cálculo | Nivel Servicio |
|-------|-------------|-------------------|----------------|
| **A** | 80% | Estadístico | 99% |
| **B** | 15% | Estadístico | 95% |
| **C** | 5% | Padre Prudente | 90% |

### Niveles de Inventario

Para cada producto se calculan:

| Nivel | Fórmula | Descripción |
|-------|---------|-------------|
| **SS** | Z × σ × √L | Stock de Seguridad |
| **ROP** | (P75 × L) + SS | Punto de Reorden (cuándo pedir) |
| **MAX** | ROP + (P75 × días) | Stock Máximo (hasta dónde llenar) |

### Regla de Pedido

```
¿Cuándo pedir?  → Stock Actual ≤ ROP
¿Cuánto pedir?  → MAX - Stock Actual (en bultos)
```

## Wizard de Creación

Proceso guiado en 3 pasos:

1. **Seleccionar origen y destino** - CEDI y tienda
2. **Revisar productos** - Ajustar cantidades sugeridas
3. **Confirmar pedido** - Validar y crear

## Estados de Criticidad

El sistema colorea los productos según su urgencia:

| Estado | Condición | Color | Acción |
|--------|-----------|-------|--------|
| **Crítico** | Stock ≤ SS | 🔴 Rojo | Pedir urgente |
| **Urgente** | SS < Stock ≤ ROP | 🟠 Naranja | Pedir normal |
| **Óptimo** | ROP < Stock ≤ MAX | 🟢 Verde | No pedir |
| **Exceso** | Stock > MAX | 🟣 Morado | Sobrestock |

## Casos Especiales

### Envío de Prueba
Productos sin ventas locales pero con demanda en tiendas de la misma región. El sistema usa el P75 regional como referencia.

### Generadores de Tráfico
Productos que atraen clientes (alto GAP entre ventas y penetración). Se tratan como Clase A aunque su clasificación sea menor.

## Navegación

```
Pedidos Sugeridos
├── Lista de pedidos
├── Nuevo pedido (Wizard)
└── Detalle/Aprobación de pedido
```

## Próximas Secciones

- [Crear un Pedido](/modulos/pedidos-sugeridos/crear-pedido) - Guía paso a paso con ejemplos reales
- [Punto de Reorden](/modulos/pedidos-sugeridos/punto-reorden) - Fórmulas y cálculos detallados
- [Aprobación de Pedidos](/modulos/pedidos-sugeridos/aprobacion) - Flujo de aprobación
