---
sidebar_position: 4
title: Formulas de Calculo
---

# Formulas del Sistema de Emergencias

Este documento detalla todas las formulas y calculos utilizados en el sistema de deteccion de emergencias de inventario.

## 1. Perfil Horario de Ventas

El sistema utiliza un perfil que distribuye las ventas esperadas a lo largo del dia.

### Perfil por Defecto

| Hora | % del Dia | Acumulado |
|------|-----------|-----------|
| 9:00 | 5% | 5% |
| 10:00 | 8% | 13% |
| 11:00 | 10% | 23% |
| 12:00 | 12% | 35% |
| 13:00 | 10% | 45% |
| 14:00 | 8% | 53% |
| 15:00 | 10% | 63% |
| 16:00 | 12% | 75% |
| 17:00 | 10% | 85% |
| 18:00 | 10% | 95% |
| 19:00 | 5% | 100% |

### Interpretacion

A las 2pm (14:00), se espera haber vendido el **53%** de las ventas del dia.
Si la tienda vende 100 unidades de un producto por dia, a las 2pm deberia haber vendido ~53 unidades.

---

## 2. Ventas Esperadas Hasta la Hora Actual

```
Ventas_Esperadas = Promedio_Diario × Porcentaje_Acumulado_Hora
```

### Variables

| Variable | Descripcion | Fuente |
|----------|-------------|--------|
| `Promedio_Diario` | Promedio de ventas de los ultimos 30 dias | Historico |
| `Porcentaje_Acumulado` | Suma de porcentajes hasta la hora actual | Perfil horario |

### Ejemplo

```
Datos:
- Promedio_Diario = 100 unidades
- Hora actual = 14:00
- Porcentaje_Acumulado (14:00) = 53%

Calculo:
Ventas_Esperadas = 100 × 0.53 = 53 unidades
```

---

## 3. Factor de Intensidad

El factor de intensidad mide que tan activo esta siendo el dia comparado con lo esperado.

```
Factor_Intensidad = Ventas_Reales_Hasta_Ahora / Ventas_Esperadas_Hasta_Ahora
```

### Interpretacion

| Factor | Etiqueta | Significado |
|--------|----------|-------------|
| 1.5 o mas | MUY_ALTO | Dia excepcional (+50% sobre lo esperado) |
| 1.2 - 1.49 | ALTO | Dia por encima de lo normal (+20-50%) |
| 0.8 - 1.19 | NORMAL | Dia tipico (-20% a +20%) |
| 0.5 - 0.79 | BAJO | Dia por debajo de lo normal (-20% a -50%) |
| Menor a 0.5 | MUY_BAJO | Dia muy lento (mas de -50%) |

### Ejemplo

```
Datos:
- Hora actual = 14:00
- Ventas_Esperadas = 53 unidades
- Ventas_Reales = 70 unidades

Calculo:
Factor = 70 / 53 = 1.32 (ALTO)

Interpretacion: El dia esta 32% mas activo de lo esperado
```

---

## 4. Demanda Restante del Dia

La demanda restante estima cuanto se vendera de aqui al cierre, ajustado por la intensidad del dia.

```
Porcentaje_Restante = 1 - Porcentaje_Acumulado_Hora
Demanda_Restante = Promedio_Diario × Porcentaje_Restante × Factor_Intensidad
```

### Ejemplo

```
Datos:
- Promedio_Diario = 100 unidades
- Hora actual = 14:00
- Porcentaje_Acumulado = 53%
- Factor_Intensidad = 1.32

Calculo:
Porcentaje_Restante = 1 - 0.53 = 0.47 (47%)
Demanda_Restante = 100 × 0.47 × 1.32 = 62 unidades

Interpretacion: Se espera vender 62 unidades mas hasta el cierre
```

### Nota Importante

La demanda restante considera que el ritmo de ventas actual se mantendra. Si el dia es intenso (factor > 1), la demanda restante aumenta proporcionalmente.

---

## 5. Cobertura

La cobertura mide que porcentaje de la demanda restante puede cubrirse con el stock actual.

```
Cobertura = Stock_Actual / Demanda_Restante
```

### Casos Especiales

| Caso | Cobertura | Manejo |
|------|-----------|--------|
| Demanda_Restante = 0 | 100% | No hay demanda pendiente |
| Stock_Actual = 0 | 0% | STOCKOUT |
| Stock > Demanda | > 100% | No emergencia |

### Ejemplo

```
Datos:
- Stock_Actual = 25 unidades
- Demanda_Restante = 62 unidades

Calculo:
Cobertura = 25 / 62 = 0.40 (40%)

Interpretacion: Solo se puede cubrir el 40% de la demanda restante
```

---

## 6. Clasificacion de Emergencia

Basado en la cobertura, el producto se clasifica en un tipo de emergencia:

```python
def clasificar_emergencia(cobertura, umbrales):
    if stock_actual == 0:
        return "STOCKOUT"
    elif cobertura < umbrales.critico:      # default: 0.25
        return "CRITICO"
    elif cobertura < umbrales.inminente:    # default: 0.50
        return "INMINENTE"
    elif cobertura < umbrales.alerta:       # default: 0.75
        return "ALERTA"
    else:
        return None  # No es emergencia
```

### Ejemplo con Umbrales Default

| Cobertura | Clasificacion |
|-----------|---------------|
| 0% | STOCKOUT |
| 15% | CRITICO (menor a 25%) |
| 40% | INMINENTE (menor a 50%) |
| 60% | ALERTA (menor a 75%) |
| 80% | No emergencia |

---

## 7. Horas Restantes Estimadas

Estima en cuantas horas se agotara el stock si continua el ritmo actual.

```
Tasa_Venta_Hora = Ventas_Hoy / Horas_Transcurridas
Horas_Restantes = Stock_Actual / Tasa_Venta_Hora
```

### Ejemplo

```
Datos:
- Stock_Actual = 25 unidades
- Ventas_Hoy = 70 unidades
- Hora_Actual = 14:00 (5 horas desde las 9am)

Calculo:
Tasa_Venta_Hora = 70 / 5 = 14 unidades/hora
Horas_Restantes = 25 / 14 = 1.78 horas

Interpretacion: El stock se agotara en ~1 hora 47 minutos (aprox 3:45pm)
```

---

## 8. Proyeccion de Venta del Dia

Estima el total de ventas del dia completo basado en el ritmo actual.

```
Proyeccion = Ventas_Hoy + Demanda_Restante
```

O alternativamente:

```
Proyeccion = (Ventas_Hoy / Porcentaje_Acumulado) × Factor_Intensidad
```

### Ejemplo

```
Datos:
- Ventas_Hoy = 70 unidades (a las 2pm)
- Demanda_Restante = 62 unidades

Calculo:
Proyeccion = 70 + 62 = 132 unidades

Interpretacion: Se estima vender 132 unidades hoy (vs promedio de 100)
```

---

## 9. Filtro de Historial de Demanda

El sistema solo considera productos que tienen historial de ventas reciente.

```sql
-- Solo productos con al menos 1 venta en los ultimos 30 dias
SELECT producto_id
FROM ventas
WHERE fecha >= CURRENT_DATE - INTERVAL '30 days'
  AND ubicacion_id = :tienda
GROUP BY producto_id
HAVING SUM(cantidad) > 0
```

### Razon

- Evita alertas de productos descontinuados
- Excluye productos nuevos sin historial suficiente
- Reduce ruido de productos de muy baja rotacion

---

## 10. Filtro de Demanda Restante

Solo se generan emergencias si hay demanda real pendiente.

```python
if demanda_restante <= 0.1:
    return None  # No generar emergencia
```

### Razon

- Si queda poco del dia, la demanda restante es minima
- Evita falsas alarmas al final de la jornada
- Productos con demanda muy baja no justifican emergencia

---

## 11. Deteccion de Anomalias

El sistema detecta anomalias de inventario durante el scan.

### Anomalia: Stock Negativo

```python
if stock_actual < 0:
    anomalia = {
        "tipo": "STOCK_NEGATIVO",
        "valor_detectado": stock_actual,
        "severidad": "ALTA"
    }
```

### Anomalia: Venta Imposible

```python
if ventas_hoy > stock_inicio_dia:
    anomalia = {
        "tipo": "VENTA_IMPOSIBLE",
        "valor_detectado": ventas_hoy,
        "valor_esperado": stock_inicio_dia,
        "severidad": "CRITICA"
    }
```

### Anomalia: Spike de Ventas

```python
if ventas_hoy > promedio_30_dias * 3:
    anomalia = {
        "tipo": "SPIKE_VENTAS",
        "valor_detectado": ventas_hoy,
        "valor_esperado": promedio_30_dias,
        "desviacion": (ventas_hoy / promedio_30_dias - 1) * 100,
        "severidad": "MEDIA"
    }
```

---

## Resumen de Formulas

| Metrica | Formula |
|---------|---------|
| **Ventas Esperadas** | Promedio_Diario × %Acumulado_Hora |
| **Factor Intensidad** | Ventas_Reales / Ventas_Esperadas |
| **Demanda Restante** | Promedio × %Restante × Factor |
| **Cobertura** | Stock / Demanda_Restante |
| **Horas Restantes** | Stock / (Ventas_Hoy / Horas_Transcurridas) |
| **Proyeccion Dia** | Ventas_Hoy + Demanda_Restante |

---

## Constantes del Sistema

| Constante | Valor | Descripcion |
|-----------|-------|-------------|
| Umbral CRITICO (default) | 25% | Cobertura menor a 25% |
| Umbral INMINENTE (default) | 50% | Cobertura menor a 50% |
| Umbral ALERTA (default) | 75% | Cobertura menor a 75% |
| Dias historial demanda | 30 | Ventana para calcular promedio |
| Minimo demanda restante | 0.1 | Debajo de esto no hay emergencia |
| Spike threshold | 3x | Ventas mayor a 3x promedio = anomalia |

---

## Ejemplo Completo

### Escenario

- **Producto**: Harina PAN 1KG
- **Tienda**: ARTIGAS
- **Hora actual**: 2:00 PM
- **Promedio 30 dias**: 100 unidades/dia
- **Ventas hoy**: 70 unidades
- **Stock actual**: 25 unidades

### Calculos

```
1. Ventas Esperadas (hasta 2pm)
   = 100 × 0.53 = 53 unidades

2. Factor de Intensidad
   = 70 / 53 = 1.32 (ALTO)

3. Demanda Restante
   = 100 × 0.47 × 1.32 = 62 unidades

4. Cobertura
   = 25 / 62 = 0.40 (40%)

5. Clasificacion
   = INMINENTE (40% menor a 50%)

6. Horas Restantes
   = 25 / (70/5) = 1.78 horas (~3:45pm)

7. Proyeccion del Dia
   = 70 + 62 = 132 unidades
```

### Resultado

```json
{
  "producto_id": "harina_pan_1kg",
  "nombre_producto": "HARINA PAN 1KG",
  "tipo_emergencia": "INMINENTE",
  "stock_actual": 25,
  "ventas_hoy": 70,
  "demanda_restante": 62,
  "cobertura": 0.40,
  "factor_intensidad": 1.32,
  "horas_restantes": 1.78
}
```

### Interpretacion

> "El producto Harina PAN en tienda ARTIGAS esta en emergencia INMINENTE.
> Con 25 unidades en stock y una demanda restante de 62 unidades,
> solo se puede cubrir el 40% de la demanda del dia.
> Al ritmo actual, el stock se agotara aproximadamente a las 3:45pm.
> El dia esta siendo 32% mas intenso de lo esperado."
