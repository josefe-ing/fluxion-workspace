---
sidebar_position: 2
title: Impacto Fluxion
---

# Impacto Fluxion

La pestaña de Impacto mide el retorno de inversion del sistema Fluxion, mostrando cuanto capital se ha liberado y como ha evolucionado el inventario desde la activacion.

## Vista General

Al acceder a la pestaña "Impacto", se muestran cuatro KPIs principales:

| KPI | Descripcion | Calculo |
|-----|-------------|---------|
| **Capital Liberado** | Reduccion absoluta en USD | Baseline - Stock Actual |
| **Reduccion %** | Porcentaje de reduccion | (Capital Liberado / Baseline) × 100 |
| **Fill Rate** | Nivel de servicio | (SKUs con stock / SKUs totales) × 100 |
| **Tiendas Activas** | Tiendas con Fluxion | Conteo de tiendas activadas |

## Concepto de Baseline

El **baseline** es el punto de referencia contra el cual se mide el impacto:

- Se calcula **por tienda** en la fecha de activacion
- Representa el stock valorizado antes de Fluxion
- Permite medir el impacto real de cada tienda individualmente

### Ejemplo

| Tienda | Fecha Activacion | Stock Baseline | Stock Actual | Capital Liberado |
|--------|------------------|----------------|--------------|------------------|
| tienda_18 | 2024-12-15 | $85,000 | $62,000 | $23,000 |
| tienda_17 | 2024-12-18 | $72,000 | $68,000 | $4,000 |

Nota: tienda_18 lleva mas dias activa, por eso muestra mayor reduccion.

## Desglose por Region

La seccion de regiones muestra el impacto agregado:

```
┌─────────────────────────────────────────────────────────────┐
│ Region      │ Capital Liberado │ Reduccion │ Tiendas Activas│
├─────────────────────────────────────────────────────────────┤
│ CARACAS     │ $27,000          │ 17.2%     │ 2              │
│ VALENCIA    │ $0               │ 0%        │ 0              │
│ TOTAL       │ $27,000          │ 17.2%     │ 2              │
└─────────────────────────────────────────────────────────────┘
```

## Ranking de Tiendas

La tabla de tiendas muestra el detalle individual:

| Columna | Descripcion |
|---------|-------------|
| **Tienda** | Nombre de la ubicacion |
| **Dias Activo** | Tiempo desde activacion |
| **Baseline** | Stock inicial de referencia |
| **Stock Actual** | Stock valorizado hoy |
| **Capital Liberado** | Diferencia en USD |
| **Reduccion %** | Porcentaje de reduccion |
| **Fill Rate** | Nivel de servicio actual |

### Ordenamiento

Por defecto, las tiendas se ordenan por capital liberado (mayor a menor). Esto destaca las tiendas con mejor desempeno.

## Interpretacion de Resultados

### Reduccion Esperada

El objetivo de Fluxion es reducir el inventario en **35% sin afectar stockouts**:

| Reduccion | Estado | Interpretacion |
|-----------|--------|----------------|
| Mayor a 35% | Excelente | Objetivo superado |
| 25% - 35% | Bueno | En camino |
| 15% - 25% | Aceptable | Progreso inicial |
| Menor a 15% | Revisar | Puede requerir ajustes |

### Fill Rate

El fill rate debe mantenerse alto mientras se reduce el stock:

| Fill Rate | Estado |
|-----------|--------|
| Mayor a 95% | Excelente |
| 90% - 95% | Bueno |
| 85% - 90% | Aceptable |
| Menor a 85% | Problema |

Una reduccion de stock con caida de fill rate indica problemas. El objetivo es reducir **sin afectar disponibilidad**.

## Tiendas Piloto

Actualmente solo tienda_18 (Paraiso) y tienda_17 (Artigas) estan activas con Fluxion. A medida que se activen mas tiendas:

1. Cada tienda obtiene su propio baseline
2. El impacto total suma todas las tiendas
3. Las regiones agregaran mas tiendas

## Acciones Sugeridas

Basado en los datos de impacto:

| Situacion | Accion Sugerida |
|-----------|-----------------|
| Alto capital liberado, fill rate estable | Expandir a mas tiendas |
| Baja reduccion despues de 30+ dias | Revisar parametros ABC |
| Fill rate cayendo | Revisar configuracion de stock seguridad |
| Tienda nueva sin reduccion | Normal, esperar 2-3 semanas |

## Proxima Seccion

- [Analisis de Tiendas](/modulos/business-intelligence/tiendas) - Comparativo detallado entre tiendas
