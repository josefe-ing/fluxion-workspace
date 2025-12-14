---
sidebar_position: 3
title: Configuracion de Tiendas
---

# Configuracion de Tiendas para Emergencias

El sistema de emergencias utiliza un **feature toggle por tienda**, permitiendo habilitar o deshabilitar el monitoreo de manera granular.

## Concepto de Feature Toggle

Cada tienda puede estar:

| Estado | Descripcion | En Scans |
|--------|-------------|----------|
| **Habilitada** | Monitoreo activo | Incluida |
| **Deshabilitada** | Monitoreo inactivo | Excluida |

Esto permite:
- Rollout gradual del sistema
- Exclusion temporal de tiendas con datos irregulares
- Control sobre carga de procesamiento

## Acceder a Configuracion

1. Ir al dashboard de **Emergencias**
2. Clic en boton **"Configurar Tiendas"**
3. Se abre el panel lateral de configuracion

## Panel de Configuracion

### Vista de Lista

El panel muestra todas las tiendas con:

| Columna | Descripcion |
|---------|-------------|
| **Tienda** | Nombre de la ubicacion |
| **Estado** | Badge (Habilitada/Deshabilitada) |
| **Umbrales** | Valores configurados |
| **Acciones** | Botones de toggle |

### Ejemplo de Vista

```
┌─────────────────────────────────────────────────┐
│ Configuracion de Tiendas                        │
├─────────────────────────────────────────────────┤
│                                                 │
│ ARTIGAS                                         │
│ ● Habilitada    Umbrales: 25% / 50% / 75%      │
│                              [Deshabilitar]     │
│                                                 │
│ PARAISO                                         │
│ ● Habilitada    Umbrales: 25% / 50% / 75%      │
│                              [Deshabilitar]     │
│                                                 │
│ MATURIN                                         │
│ ○ Deshabilitada                                 │
│                              [Habilitar]        │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Habilitar una Tienda

### Via Dashboard

1. Abrir panel de Configuracion
2. Localizar la tienda deseada
3. Clic en boton **"Habilitar"**
4. Confirmar accion

### Via API

```bash
POST /api/emergencias/config/tiendas/{ubicacion_id}/habilitar

# Body (opcional)
{
  "emails_notificacion": ["gerente@tienda.com"],
  "umbral_critico": 0.25,
  "umbral_inminente": 0.50,
  "umbral_alerta": 0.75,
  "usuario": "admin"
}
```

### Parametros Opcionales

| Parametro | Default | Descripcion |
|-----------|---------|-------------|
| `emails_notificacion` | [] | Emails para alertas (futuro) |
| `umbral_critico` | 0.25 | Cobertura menor a esto = CRITICO |
| `umbral_inminente` | 0.50 | Cobertura menor a esto = INMINENTE |
| `umbral_alerta` | 0.75 | Cobertura menor a esto = ALERTA |
| `usuario` | null | Usuario que habilita |

## Deshabilitar una Tienda

### Via Dashboard

1. Abrir panel de Configuracion
2. Localizar la tienda habilitada
3. Clic en boton **"Deshabilitar"**
4. Confirmar accion

### Via API

```bash
POST /api/emergencias/config/tiendas/{ubicacion_id}/deshabilitar
```

### Efecto de Deshabilitar

- La tienda se excluye de futuros scans
- Las emergencias existentes NO se eliminan
- El historico de scans se mantiene
- Se puede re-habilitar en cualquier momento

## Umbrales Configurables

Los umbrales determinan cuando un producto se clasifica en cada tipo de emergencia:

### Umbrales por Defecto

| Umbral | Valor | Clasificacion |
|--------|-------|---------------|
| **Critico** | 25% | Cobertura menor a 25% |
| **Inminente** | 50% | Cobertura menor a 50% |
| **Alerta** | 75% | Cobertura menor a 75% |

### Ajustar Umbrales

Los umbrales se pueden personalizar por tienda para adaptarse a:

- **Tiendas de alto trafico**: Umbrales mas conservadores (30%, 55%, 80%)
- **Tiendas de bajo trafico**: Umbrales mas flexibles (20%, 45%, 70%)
- **Tiendas con reabastecimiento frecuente**: Umbrales mas bajos
- **Tiendas remotas**: Umbrales mas altos

### Ejemplo de Personalizacion

```bash
POST /api/emergencias/config/tiendas/tienda_17/habilitar

{
  "umbral_critico": 0.30,
  "umbral_inminente": 0.55,
  "umbral_alerta": 0.80
}
```

Con estos umbrales:
- CRITICO: Cobertura menor a 30% (antes era 25%)
- INMINENTE: Cobertura menor a 55% (antes era 50%)
- ALERTA: Cobertura menor a 80% (antes era 75%)

## Estados de Tienda

### Resumen de Estados

| Estado | Scans | Alertas | Historico |
|--------|-------|---------|-----------|
| Habilitada | Si | Si | Se genera |
| Deshabilitada | No | No | Se mantiene |

### Verificar Estado via API

```bash
GET /api/emergencias/config/tiendas

# Respuesta
{
  "total": 16,
  "habilitadas": 2,
  "tiendas": [
    {
      "ubicacion_id": "tienda_17",
      "nombre_tienda": "ARTIGAS",
      "habilitado": true,
      "fecha_habilitacion": "2024-12-13T10:00:00",
      "umbral_critico": 0.25,
      "umbral_inminente": 0.50,
      "umbral_alerta": 0.75
    },
    ...
  ]
}
```

## Rollout Recomendado

### Fase 1: Piloto (1-2 tiendas)
1. Seleccionar tiendas con datos de calidad
2. Habilitar con umbrales por defecto
3. Monitorear durante 1 semana
4. Ajustar umbrales segun feedback

### Fase 2: Expansion (3-5 tiendas)
1. Agregar tiendas de diferentes perfiles
2. Comparar comportamiento entre tiendas
3. Identificar patrones comunes
4. Refinar algoritmos si es necesario

### Fase 3: Produccion (todas las tiendas)
1. Habilitar resto de tiendas
2. Mantener umbrales personalizados donde aplique
3. Activar notificaciones por email
4. Configurar scheduler automatico

## Buenas Practicas

### Antes de Habilitar
- Verificar que la tienda tiene datos de ventas recientes (ultimos 7 dias)
- Confirmar que el stock actual esta sincronizado
- Revisar que no haya anomalias de datos pendientes

### Despues de Habilitar
- Ejecutar un scan manual inmediato
- Revisar las emergencias detectadas
- Validar que los resultados tienen sentido
- Ajustar umbrales si hay muchos falsos positivos/negativos

### Cuando Deshabilitar
- Tienda cerrada temporalmente
- Migracion de sistema POS
- Inventario fisico en proceso
- Datos inconsistentes detectados

## Troubleshooting

### Tienda no aparece en lista
- Verificar que la tienda existe en la tabla `ubicaciones`
- Confirmar que tiene datos de ventas recientes
- Revisar logs del backend

### Muchas emergencias falsas
- Aumentar los umbrales (ej: 30%, 55%, 80%)
- Verificar precision de datos de stock
- Revisar si hay promociones activas no consideradas

### Pocas emergencias detectadas
- Disminuir los umbrales (ej: 20%, 45%, 70%)
- Verificar que el factor de intensidad se calcula correctamente
- Revisar perfil horario de la tienda

### Scan no incluye tienda habilitada
- Verificar estado en `/api/emergencias/config/tiendas/{id}`
- Revisar logs del scan para errores
- Confirmar conectividad con base de datos de la tienda
