---
sidebar_position: 2
title: Dashboard de Emergencias
---

# Dashboard de Emergencias

El dashboard de emergencias proporciona una vista en tiempo real de todos los productos en situacion critica de inventario.

## Acceso

Desde el menu principal: **Emergencias**

## Componentes del Dashboard

### 1. Barra de Acciones

#### Boton "Escanear Emergencias"
- Ejecuta un scan manual de todas las tiendas habilitadas
- Muestra progreso durante la ejecucion
- Al finalizar actualiza automaticamente la tabla

#### Boton "Configurar Tiendas"
- Abre el panel de configuracion
- Permite habilitar/deshabilitar tiendas
- Ver estado de cada tienda

### 2. Filtros

| Filtro | Opciones | Uso |
|--------|----------|-----|
| **Tienda** | Todas / Tienda especifica | Filtrar por ubicacion |
| **Tipo** | STOCKOUT, CRITICO, INMINENTE, ALERTA | Filtrar por severidad |

### 3. Leyenda de Tipos

La leyenda explica cada tipo de emergencia:

| Color | Tipo | Significado |
|-------|------|-------------|
| Rojo | STOCKOUT | Sin stock, perdiendo ventas ahora |
| Naranja | CRITICO | Cobertura menor a 25%, se agotara en horas |
| Amarillo | INMINENTE | Cobertura menor a 50%, riesgo alto |
| Azul | ALERTA | Cobertura menor a 75%, monitorear |

### 4. Tabla de Emergencias

La tabla muestra todos los productos detectados con las siguientes columnas:

| Columna | Descripcion |
|---------|-------------|
| **Tienda** | Nombre de la ubicacion |
| **Producto** | Nombre del producto |
| **Categoria** | Categoria del producto |
| **Clase** | Clasificacion ABC (A, B, C, D) |
| **Stock** | Stock actual disponible |
| **Ventas Hoy** | Unidades vendidas hoy |
| **Demanda Rest.** | Demanda restante estimada |
| **Cobertura** | Porcentaje de cobertura |
| **Tipo** | Tipo de emergencia (badge de color) |
| **Acciones** | Boton "Ver detalle" |

#### Ordenamiento
- Por defecto ordenado por severidad (STOCKOUT primero)
- Dentro de cada tipo, por cobertura ascendente

## Modal de Detalle de Producto

Al hacer clic en "Ver detalle" se abre un modal con informacion completa:

### Seccion 1: Informacion del Producto

```
┌─────────────────────────────────────────┐
│ HARINA PAN 1KG                          │
│ Categoria: HARINAS | Clase: A           │
│ Tienda: ARTIGAS                         │
└─────────────────────────────────────────┘
```

### Seccion 2: Metricas Principales

Tarjetas con las metricas clave:

| Metrica | Descripcion | Ejemplo |
|---------|-------------|---------|
| **Stock Actual** | Inventario disponible | 45 unidades |
| **Ventas Hoy** | Vendido hasta ahora | 120 unidades |
| **Demanda Restante** | Lo que falta por vender | 80 unidades |
| **Cobertura** | Stock / Demanda Rest. | 56% |
| **Factor Intensidad** | Ritmo del dia | 1.25 (intenso) |

### Seccion 3: Comparativos de Venta

Tarjetas comparando con periodos anteriores:

| Periodo | Dato | Uso |
|---------|------|-----|
| **Hoy** | Ventas acumuladas | Referencia actual |
| **Ayer** | Ventas del dia anterior | Comparacion inmediata |
| **Semana Pasada** | Mismo dia hace 7 dias | Patron semanal |
| **Promedio 30 dias** | Media del ultimo mes | Baseline |

### Seccion 4: Proyeccion del Dia

```
┌─────────────────────────────────────────┐
│ Proyeccion de Venta del Dia             │
│                                         │
│ Estimacion: 200 unidades                │
│ (basado en ventas actuales y perfil)    │
│                                         │
│ Hora de Agotamiento: ~4:30 PM           │
│ (si continua el ritmo actual)           │
└─────────────────────────────────────────┘
```

### Seccion 5: Graficos

#### Grafico de Ventas Acumuladas
- Tipo: Area chart
- Eje X: Hora del dia (9am - 7pm)
- Eje Y: Ventas acumuladas
- Series:
  - **Hoy** (linea solida verde)
  - **Ayer** (linea punteada gris)
  - **Semana Pasada** (linea punteada azul)
  - **Promedio** (linea punteada naranja)
- Linea vertical: Hora actual

#### Grafico Comparativo por Hora
- Tipo: Line chart
- Eje X: Hora del dia
- Eje Y: Ventas por hora (no acumuladas)
- Muestra el patron de ventas hora a hora

### Seccion 6: Recomendaciones

El sistema genera recomendaciones basadas en:

| Tipo | Clase | Recomendacion |
|------|-------|---------------|
| STOCKOUT | A | Transferencia urgente desde CEDI |
| STOCKOUT | B/C | Evaluar si justifica envio especial |
| CRITICO | A | Priorizar en proximo pedido |
| CRITICO | B | Incluir en pedido regular |
| INMINENTE | A/B | Monitorear, preparar stock |
| ALERTA | Cualquiera | Mantener vigilancia |

## Interpretacion de Datos

### Cobertura por Tipo

| Cobertura | Tipo | Que significa |
|-----------|------|---------------|
| 0% | STOCKOUT | No hay stock, cada venta perdida |
| 1-24% | CRITICO | Stock para menos del 25% de demanda restante |
| 25-49% | INMINENTE | Stock para menos del 50% de demanda restante |
| 50-74% | ALERTA | Stock para menos del 75% de demanda restante |
| >= 75% | No emergencia | Stock suficiente |

### Factor de Intensidad

| Factor | Etiqueta | Significado |
|--------|----------|-------------|
| 1.5 o mas | MUY_ALTO | Dia excepcional, mucha demanda |
| 1.2 - 1.5 | ALTO | Dia por encima de lo normal |
| 0.8 - 1.2 | NORMAL | Dia tipico |
| 0.5 - 0.8 | BAJO | Dia por debajo de lo normal |
| Menor a 0.5 | MUY_BAJO | Dia muy lento |

## Flujo de Uso Recomendado

### Monitoreo Rutinario (cada 2-3 horas)

1. Acceder al dashboard de Emergencias
2. Clic en "Escanear Emergencias"
3. Revisar filtro por tipo = STOCKOUT y CRITICO
4. Para cada emergencia:
   - Clic en "Ver detalle"
   - Revisar graficos y comparativos
   - Decidir accion

### Respuesta a Emergencia

1. Identificar productos en STOCKOUT de clase A
2. Verificar stock en CEDI via modulo Inventario
3. Si hay stock disponible:
   - Crear pedido de emergencia
   - Coordinar envio prioritario
4. Si no hay stock:
   - Notificar a tienda para manejo de clientes
   - Escalar a compras si es recurrente

### Analisis de Patrones

1. Filtrar por tienda especifica
2. Revisar productos recurrentes en emergencia
3. Usar graficos para identificar patrones:
   - Dias de semana con mayor demanda
   - Horas pico de venta
4. Ajustar parametros de reabastecimiento

## Tips y Mejores Practicas

### Cuando Escanear
- Al inicio del dia laboral (10am)
- Despues del pico de mediodia (2pm)
- Antes del cierre (5pm)
- Cuando se esperan eventos especiales

### Priorizar Acciones
1. STOCKOUT de Clase A - Accion inmediata
2. CRITICO de Clase A - Planificar para hoy
3. STOCKOUT de Clase B - Evaluar impacto
4. Resto - Monitorear tendencia

### Interpretar Graficos
- Si la linea de "Hoy" esta por encima de todas las demas: dia atipicamente fuerte
- Si la linea de "Hoy" sigue el patron de "Semana Pasada": comportamiento esperado
- Divergencias fuertes pueden indicar eventos no planificados

### Evitar Falsas Alarmas
- Productos nuevos pueden aparecer en emergencia por falta de historico
- Promociones activas pueden distorsionar demanda
- Fin de semana vs dias laborales tienen patrones diferentes
