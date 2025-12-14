---
sidebar_position: 1
title: Emergencias de Inventario
---

# Modulo de Emergencias de Inventario

El modulo de Emergencias detecta automaticamente situaciones criticas de inventario en tiempo real, permitiendo una respuesta rapida antes de que se produzcan quiebres de stock.

## Proposito

A diferencia del sistema de **Pedidos Sugeridos** (que planifica reabastecimiento regular), el modulo de **Emergencias** se enfoca en:

- Detectar productos que se estan agotando **hoy**
- Considerar la **intensidad de ventas del dia** actual
- Alertar sobre situaciones **criticas inmediatas**
- Permitir accion **correctiva en tiempo real**

## Diferencia con Pedidos Sugeridos

| Aspecto | Pedidos Sugeridos | Emergencias |
|---------|------------------|-------------|
| **Horizonte** | Dias/semanas | Horas |
| **Trigger** | Stock ≤ ROP | Cobertura &#60; 75% del dia |
| **Metrica** | P75 historico | Demanda restante del dia |
| **Factor** | Estadistico | Intensidad del dia actual |
| **Accion** | Pedido programado | Alerta inmediata |

## Concepto Clave: Factor de Intensidad

El sistema aprende el **perfil de ventas por hora** de cada tienda y calcula cuanto se ha vendido vs. cuanto se esperaba hasta la hora actual:

```
Factor Intensidad = Ventas Reales Hasta Ahora / Ventas Esperadas Hasta Ahora
```

| Factor | Interpretacion | Impacto |
|--------|----------------|---------|
| Mayor a 1.3 | Dia muy intenso | Mayor demanda restante |
| 1.0 - 1.3 | Dia normal | Demanda esperada |
| 0.7 - 1.0 | Dia tranquilo | Menor demanda restante |
| Menor a 0.7 | Dia muy lento | Demanda reducida |

### Ejemplo Practico

Si son las 2pm y esperabamos vender 100 unidades pero vendimos 130:
- Factor = 130/100 = **1.30** (dia 30% mas intenso)
- La demanda restante se ajusta al alza
- Un producto que parecia "bien" puede entrar en emergencia

## Tipos de Emergencia

El sistema clasifica cada producto segun su **cobertura** (stock disponible vs. demanda restante del dia):

| Tipo | Condicion | Descripcion | Urgencia |
|------|-----------|-------------|----------|
| **STOCKOUT** | Cobertura = 0% | Sin stock disponible | Critica |
| **CRITICO** | Cobertura menor a 25% | Stock muy bajo | Alta |
| **INMINENTE** | Cobertura menor a 50% | Stock insuficiente | Media |
| **ALERTA** | Cobertura menor a 75% | Stock limitado | Baja |

### Calculo de Cobertura

```
Cobertura = Stock Actual / Demanda Restante del Dia
```

Donde:
- **Stock Actual**: Inventario disponible ahora
- **Demanda Restante**: Lo que se espera vender de aqui al cierre, ajustado por intensidad

## Flujo de Trabajo

```
1. CONFIGURAR tiendas habilitadas
   └── Habilitar tiendas piloto

2. EJECUTAR scan de emergencias
   └── Manual o automatico cada 30 min

3. ANALIZAR resultados
   ├── Ver emergencias por tipo
   ├── Filtrar por tienda
   └── Ver detalle con graficos

4. ACTUAR sobre alertas
   ├── Reasignar stock
   ├── Ajustar pedidos
   └── Informar a tiendas
```

## Funcionalidades

### Dashboard Principal
- Boton para ejecutar scan manual
- Filtros por tienda y tipo de emergencia
- Tabla de productos en emergencia
- Indicadores de severidad por colores

### Detalle de Producto
- Metricas: stock, ventas, demanda, cobertura
- Comparativos: hoy vs ayer vs semana pasada vs promedio
- Graficos de ventas acumuladas por hora
- Proyeccion de venta del dia
- Hora estimada de agotamiento

### Configuracion de Tiendas
- Habilitar/deshabilitar tiendas individualmente
- Ajustar umbrales por tienda
- Feature toggle granular

## Navegacion

```
Emergencias
├── Dashboard principal
│   ├── Ejecutar Scan
│   ├── Filtros (tienda, tipo)
│   └── Tabla de emergencias
├── Detalle de producto (modal)
│   ├── Metricas principales
│   ├── Comparativos historicos
│   └── Graficos de venta
└── Panel de configuracion
    └── Toggle de tiendas
```

## Casos de Uso

### Caso 1: Dia de Alta Demanda
Un sabado el factor de intensidad de tienda_17 es 1.45. El sistema detecta que varios productos Clase A entraran en STOCKOUT antes de las 6pm y genera alertas para reasignar stock desde el CEDI.

### Caso 2: Promocion No Planificada
Una promocion relampago genera ventas atipicas. El sistema detecta el spike y clasifica productos como CRITICO aunque el stock "normal" seria suficiente.

### Caso 3: Monitoreo de Rutina
El encargado ejecuta un scan a las 11am y ve que 3 productos estan en ALERTA. Revisa el detalle, confirma que la tendencia es real, y solicita transferencia del CEDI para la tarde.

## Metricas del Sistema

### Por Producto
- Stock actual
- Ventas del dia
- Demanda restante
- Cobertura (%)
- Horas restantes estimadas

### Por Tienda
- Total de emergencias
- Desglose por tipo (STOCKOUT, CRITICO, etc.)
- Factor de intensidad promedio

### Por Scan
- Productos analizados
- Emergencias detectadas
- Anomalias encontradas
- Duracion del scan

## Proximas Secciones

- [Dashboard de Emergencias](/modulos/emergencias/dashboard) - Guia de uso del dashboard
- [Configuracion de Tiendas](/modulos/emergencias/configuracion) - Como habilitar y ajustar tiendas
- [Formulas de Calculo](/modulos/emergencias/formulas) - Detalle de todas las formulas
