---
sidebar_position: 1
title: Pedidos Inter-CEDI
---

# Pedidos Inter-CEDI

El módulo de Pedidos Inter-CEDI gestiona la reposición del **CEDI Caracas** desde los CEDIs de Valencia (Seco, Frío, Verde). A diferencia de los pedidos CEDI→Tienda que abastecen una sola tienda, este módulo maneja la **demanda regional agregada** de todas las tiendas de una región.

## Diferencias vs Pedidos CEDI→Tienda

| Aspecto | CEDI→Tienda | Inter-CEDI |
|---------|-------------|------------|
| **Demanda base** | 1 tienda | N tiendas (región) |
| **Origen** | 1 CEDI | 3 CEDIs (Seco/Frío/Verde) |
| **Lead time** | 1.5 días | 2 días |
| **Stock seguridad** | Bajo (tienda) | Alto (absorber variabilidad regional) |
| **Frecuencia** | Diaria | 3x/semana |
| **Cobertura** | 5-30 días | 7-45 días |

## ¿Cómo Calcula el Sistema?

### 1. Demanda Regional Agregada

La demanda del CEDI Caracas es la **suma de los P75 de todas las tiendas** de la región:

```
Demanda_Regional = P75(Artigas) + P75(Paraíso) + ...
```

Ejemplo para Harina PAN:
| Tienda | P75 (unid/día) |
|--------|----------------|
| Artigas | 630 |
| Paraíso | 280 |
| **Total Regional** | **910** |

### 2. Stock de Seguridad en CEDI

Se calcula con mayor margen que para tiendas, porque el CEDI debe absorber la variabilidad de múltiples tiendas:

```
SS_CEDI = Z × σ_regional × √Lead_Time
```

Donde:
- **Z**: Factor de servicio por clase ABC
- **σ_regional**: Desviación estándar regional = √(σ₁² + σ₂² + ...)
- **Lead Time**: 2 días (Valencia → Caracas)

### 3. Fórmulas por Clase ABC

| Clase | Z-Score | Nivel Servicio | Días Cobertura |
|-------|---------|----------------|----------------|
| **A** | 2.33 | 99% | 7 días |
| **B** | 1.88 | 97% | 14 días |
| **C** | 1.28 | 90% | 30 días |
| **D** | 0.0* | N/A | 45 días |

*Clase D usa el método "Padre Prudente" con 30% de demanda durante el ciclo.

### 4. Niveles de Inventario en CEDI

```
Stock_Min = (Demanda_Regional × Lead_Time) + SS_CEDI
Stock_Max = Stock_Min + (Demanda_Regional × Días_Cobertura)
Cantidad_Sugerida = max(0, Stock_Max - Stock_Actual)
```

## Clasificación ABC por Cantidad

A diferencia del módulo CEDI→Tienda que usa valor de ventas, Inter-CEDI clasifica por **cantidad vendida** en la región:

| Clase | Ranking | Descripción |
|-------|---------|-------------|
| **A** | Top 50 | Productos más vendidos por unidades |
| **B** | 51-200 | Volumen medio |
| **C** | 201-800 | Bajo volumen |
| **D** | +800 | Muy bajo volumen |

## CEDIs Origen

Los productos se agrupan por su CEDI de origen:

| CEDI | Color | Tipo de Productos |
|------|-------|-------------------|
| **Seco** | Amarillo | Abarrotes, limpieza, licores |
| **Frío** | Azul | Carnes, lácteos, charcutería |
| **Verde** | Verde | Fruver, verduras |

Cada producto tiene asignado un único CEDI origen basado en dónde existe inventario.

## Matriz de Prioridad

El sistema calcula una prioridad de reposición combinando la clase ABC y los días de stock:

|  | ≤3 días | 4-7 días | 8-14 días | >14 días |
|---|---------|----------|-----------|----------|
| **A** | 1 (Crítico) | 2 | 4 | 7 |
| **B** | 3 | 5 | 6 | 8 |
| **C** | 5 | 7 | 8 | 9 |
| **D** | 6 | 8 | 9 | 10 |

**Leyenda:**
- 🔴 1-2: Crítico - Pedir urgente
- 🟠 3-4: Alto - Prioridad alta
- 🟡 5-6: Medio - Normal
- 🔵 7-8: Bajo - Puede esperar
- ⚪ 9-10: Mínimo - Sin urgencia

## Flujo de Estados

```
┌──────────┐     ┌────────────┐     ┌────────────┐     ┌──────────┐
│ BORRADOR │ ──► │ CONFIRMADO │ ──► │ DESPACHADO │ ──► │ RECIBIDO │
└──────────┘     └────────────┘     └────────────┘     └──────────┘
     │
     ▼
┌────────────┐
│ CANCELADO  │
└────────────┘
```

| Estado | Descripción | Editable |
|--------|-------------|----------|
| **Borrador** | Pedido creado, en revisión | ✅ |
| **Confirmado** | Listo para logística | ❌ |
| **Despachado** | Camión salió de Valencia | ❌ |
| **Recibido** | CEDI Caracas confirmó recepción | ❌ |
| **Cancelado** | Pedido anulado | ❌ |

## Exportación Excel

Cada pedido puede exportarse a Excel:
- **Completo**: Todos los productos del pedido
- **Por CEDI**: Archivo separado por CEDI origen

Esto permite a logística imprimir listas separadas para cada bodega de Valencia.

## Próximas Secciones

- [Crear Pedido Inter-CEDI](/modulos/pedidos-inter-cedi/crear-pedido) - Wizard paso a paso con ejemplos
- [Fórmulas Detalladas](/modulos/pedidos-inter-cedi/formulas) - Cálculos con ejemplos numéricos
- [Columnas de la Tabla](/modulos/pedidos-inter-cedi/columnas) - Descripción de cada columna
