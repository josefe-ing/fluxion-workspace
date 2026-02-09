# Plan de Implementación: Prophet para Tiendas Nuevas
## FluxionIA - La Granja Caracas

**Objetivo:** Modelo de forecasting para predecir demanda en tiendas nuevas de Caracas  
**Fecha límite:** 14 de marzo 2026 (apertura tienda #3)  
**Responsable:** Jose Felipe Lopez (CTO)

---

## Resumen del Problema

Las tiendas nuevas de Caracas (Artigas, Paraiso) no tienen histórico suficiente. El período de "maduración" (~2 meses) contamina los patrones de demanda.

**Solución:** Transferir patrones de Valencia + modelar curva de adopción de Caracas.

---

## Arquitectura del Modelo

### Decisión clave: No asumir agrupaciones

En lugar de agrupar tiendas por zona o tamaño, vamos a:
1. Entrenar modelos individuales por tienda
2. Comparar patrones estadísticamente
3. Descubrir qué tiendas realmente se parecen (data-driven)

### Estructura híbrida (a validar con datos)

```
GLOBALES (probablemente iguales en todas las tiendas):
├── Efecto quincena (~51%, 4-5 días)
├── Estacionalidad anual (Dic alto, Ene bajo)
└── Efecto holidays (Semana Santa, Carnaval, etc.)

POR TIENDA o GRUPO (probablemente varían):
├── Estacionalidad semanal (sábado vs domingo)
├── Nivel base de ventas
└── Tendencia de crecimiento
```

---

## Cronograma: 6 Semanas

### SEMANA 1: 3-7 Feb — Extracción de datos Valencia

| Tarea | Entregable |
|-------|------------|
| Seleccionar 5 tiendas maduras representativas | Lista de tiendas |
| Exportar ventas diarias (2 años) por tienda | 5 archivos Excel |
| Documentar eventos especiales (holidays) | Lista de eventos |
| Validar calidad de datos | Reporte de calidad |

**Criterios para las 5 tiendas:**
- Mínimo 2 años de operación
- Sin cierres largos ni remodelaciones
- Mezcla de alto y medio volumen
- Datos limpios

**Formato de archivos:** Igual que Artigas (hoja "Ventas Diarias")

---

### SEMANA 2: 10-14 Feb — Análisis de patrones Valencia

| Tarea | Entregable |
|-------|------------|
| Entrenar modelo Prophet individual por tienda (5 modelos) | 5 modelos entrenados |
| Extraer componentes de cada modelo (semanal, quincenal, anual) | Tabla de factores por tienda |
| Calcular similitud estadística entre tiendas | Matriz de correlación |
| Identificar grupos naturales (clustering) | Mapa de agrupación |
| Definir patrones globales vs patrones por grupo | Arquitectura final |

**Enfoque híbrido:**
```
Patrones GLOBALES (todas las tiendas):
├── Efecto quincena
├── Estacionalidad anual
└── Efecto holidays

Patrones POR TIENDA o GRUPO:
├── Estacionalidad semanal (sáb vs dom varía)
├── Nivel base de ventas
└── Tendencia
```

**Preguntas a responder:**
- ¿Qué tiendas tienen patrones similares? (descubrir con datos, no asumir)
- ¿Emergen grupos naturales por comportamiento?
- ¿El efecto quincena es realmente igual en todas?
- ¿Qué patrones son globales vs cuáles varían?

---

### SEMANA 3: 17-21 Feb — Modelar curva de adopción

| Tarea | Entregable |
|-------|------------|
| Normalizar ventas de Artigas (quitar estacionalidad) | Serie limpia |
| Normalizar ventas de Paraiso | Serie limpia |
| Ajustar curva de crecimiento | Parámetros |
| Estimar semanas hasta estabilización | Curva final |

**Preguntas a responder:**
- ¿Cuántas semanas hasta el 90% del potencial?
- ¿Artigas y Paraiso tuvieron curvas similares?

---

### SEMANA 4: 24-28 Feb — Construir modelo combinado

| Tarea | Entregable |
|-------|------------|
| Configurar Prophet con patrones Valencia | Modelo base |
| Agregar regresor de adopción | Modelo con adopción |
| Agregar holidays | Modelo completo |
| Validar con Artigas y Paraiso | Métricas de error |

**Meta de métricas:**

| Período | MAPE Target | MAPE Aceptable |
|---------|-------------|----------------|
| Semanas 1-4 | < 35% | < 45% |
| Semanas 5-8 | < 25% | < 35% |
| Semana 9+ | < 20% | < 25% |

---

### SEMANA 5: 3-7 Mar — Validación y ajustes

| Tarea | Entregable |
|-------|------------|
| Backtesting desde apertura | Gráfico de validación |
| Analizar errores por tipo | Diagnóstico |
| Ajustar hiperparámetros | Modelo ajustado |
| Documentar limitaciones | Documento técnico |

---

### SEMANA 6: 10-14 Mar — Preparación para lanzamiento

| Tarea | Entregable |
|-------|------------|
| Generar forecast tienda #3 (8 semanas) | Forecast inicial |
| Integrar en FluxionIA | Código en producción |
| Crear proceso de actualización | Script automático |
| Preparar vista para abastecimiento | Dashboard |
| Documentación final | Manual de uso |

---

## Datos Requeridos

### Archivos de Valencia (5 tiendas)
```
ventas_[TIENDA]_2024-02_2026-01.xlsx
├── Hoja 1: Resumen Ventas
└── Hoja 2: Ventas Diarias (columnas = fechas)
```

### Calendario de holidays
```csv
fecha,nombre,tipo
2024-02-12,Carnaval,feriado
2024-02-13,Carnaval,feriado
2024-03-28,Jueves Santo,feriado
2024-03-29,Viernes Santo,feriado
2024-12-24,Nochebuena,feriado
2024-12-25,Navidad,feriado
2024-12-31,Fin de año,feriado
2025-02-03,Carnaval,feriado
2025-02-04,Carnaval,feriado
...
```

---

## Conceptos Clave Aprendidos

### MAPE (Mean Absolute Percentage Error)
```
MAPE = Promedio( |Real - Predicho| / Real ) × 100

< 10%  → Excelente
10-20% → Bueno
20-30% → Aceptable
> 50%  → Problemático
```

### Modelo multiplicativo vs aditivo
- **Aditivo:** Efectos se suman
- **Multiplicativo:** Efectos se multiplican ✓ (La Granja)
- La quincena amplifica el sábado, no se suma

### Curva de efecto quincena (descubierta en análisis)
```
Día 0 (quincena): 1.0x  ← empieza
Día +1:           1.3x  ↗ sube
Día +2:           2.6x  🔥 pico si es sábado
Día +3:           1.4x  ↘ baja
Día +4:           1.1x  ↘ casi normal
Día +5:           0.5x  → termina
```

**Hallazgo clave:** El pico NO es el día de quincena. Es el sábado posterior.

### Transfer Learning
Usar patrones de tiendas maduras (Valencia) para predecir tiendas nuevas (Caracas).

---

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Datos de Valencia con gaps | Validar en Semana 1 |
| Caracas muy diferente a Valencia | Monitorear y ajustar rápido |
| Eventos externos (político, económico) | Marcar outliers, re-entrenar frecuente |

---

## Próximos Pasos Inmediatos

1. ✅ Revisar este plan
2. 📋 Identificar las 5 tiendas de Valencia
3. 📊 Exportar datos la próxima semana
4. 📅 Próxima sesión: Cuando tengas los datos

---

*Documento creado: 1 de Febrero 2026*  
*Sesión de trabajo: Claude + Jose Felipe*
