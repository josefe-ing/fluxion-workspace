# Parámetros ABC-XYZ - Guía de Configuración

## Visión General

Este documento explica **en detalle** cada uno de los 9 cuadrantes de la matriz ABC-XYZ y cómo configurar los parámetros de reposición para cada tipo de producto.

---

## La Matriz ABC-XYZ

### Clasificación ABC (Valor Económico)

La clasificación ABC se basa en el **valor total de ventas** de cada producto (Cantidad × Precio):

| Clase | % Productos | % Valor de Ventas | Descripción |
|-------|-------------|-------------------|-------------|
| **A** | 20% | 80% | Productos de alto valor - Máxima prioridad |
| **B** | 30% | 15% | Productos de valor medio - Prioridad media |
| **C** | 50% | 5% | Productos de bajo valor - Prioridad baja |

**Ejemplo:**
- **Clase A:** Aceite, harina PAN, arroz, azúcar, pasta
- **Clase B:** Enlatados, condimentos, productos de limpieza
- **Clase C:** Artículos de baja rotación, productos estacionales

### Clasificación XYZ (Variabilidad de Demanda)

La clasificación XYZ se basa en el **coeficiente de variación** (CV):

```
CV = Desviación Estándar / Promedio
```

| Clase | Coeficiente de Variación | Descripción |
|-------|-------------------------|-------------|
| **X** | CV < 0.50 | Demanda estable y predecible |
| **Y** | 0.50 ≤ CV ≤ 1.00 | Demanda con variabilidad media |
| **Z** | CV > 1.00 | Demanda errática e impredecible |

**Ejemplo:**
- **Clase X:** Productos básicos de consumo diario (pan, leche, huevos)
- **Clase Y:** Productos con demanda estacional moderada
- **Clase Z:** Productos con picos de demanda impredecibles

### Combinación ABC × XYZ = 9 Cuadrantes

```
                VARIABILIDAD DE DEMANDA
                X (Estable)  Y (Media)   Z (Errática)
              ┌─────────────┬──────────┬──────────────┐
              │     AX      │    AY    │      AZ      │
       A      │ Prioridad 1 │ Prior. 2 │  Prior. 3    │
    (Alto     │ Z=1.96      │ Z=1.96   │  Z=1.96      │
     Valor)   │ SS ×1.00    │ SS ×1.25 │  SS ×1.50    │
              ├─────────────┼──────────┼──────────────┤
              │     BX      │    BY    │      BZ      │
       B      │ Prioridad 4 │ Prior. 5 │  Prior. 6    │
    (Medio    │ Z=1.65      │ Z=1.65   │  Z=1.65      │
     Valor)   │ SS ×1.00    │ SS ×1.10 │  SS ×1.25    │
              ├─────────────┼──────────┼──────────────┤
              │     CX      │    CY    │      CZ      │
       C      │ Prioridad 7 │ Prior. 8 │  Prior. 9    │
    (Bajo     │ Z=1.28      │ Z=1.28   │  Z=0.00      │
     Valor)   │ SS ×1.00    │ SS ×0.50 │  SIN SS      │
              └─────────────┴──────────┴──────────────┘
```

---

## Parámetros de Configuración

### Tabla Completa de Parámetros por Defecto

| Matriz | Prioridad | Z-Score | Nivel Servicio | Mult. Demanda | Mult. SS | Inc. SS | Descripción |
|--------|-----------|---------|----------------|---------------|----------|---------|-------------|
| **AX** | 1 | 1.96 | 97.5% | 1.00 | 1.00 | Sí | Alto valor, estable - Máxima protección |
| **AY** | 2 | 1.96 | 97.5% | 1.05 | 1.25 | Sí | Alto valor, variable - SS aumentado |
| **AZ** | 3 | 1.96 | 97.5% | 1.10 | 1.50 | Sí | Alto valor, errático - Máximo SS |
| **BX** | 4 | 1.65 | 95.0% | 1.00 | 1.00 | Sí | Medio valor, estable - Protección media |
| **BY** | 5 | 1.65 | 95.0% | 1.00 | 1.10 | Sí | Medio valor, variable - SS moderado |
| **BZ** | 6 | 1.65 | 95.0% | 1.05 | 1.25 | Sí | Medio valor, errático - SS elevado |
| **CX** | 7 | 1.28 | 90.0% | 1.00 | 1.00 | Sí | Bajo valor, estable - Protección básica |
| **CY** | 8 | 1.28 | 90.0% | 1.00 | 0.50 | Sí | Bajo valor, variable - SS reducido |
| **CZ** | 9 | 0.00 | ~50% | 0.75 | 0.00 | **No** | Bajo valor, errático - **SIN SS** |

---

## Descripción Detallada por Cuadrante

### 1. AX - Alto Valor, Demanda Estable

**Características:**
- Productos de alto valor económico
- Demanda predecible y constante
- Coeficiente de variación < 0.50
- Ejemplos: Aceite premium, arroz de alta rotación

**Parámetros:**
- **Z-Score:** 1.96 (97.5% nivel de servicio)
- **Multiplicador Demanda:** 1.00 (sin ajuste)
- **Multiplicador SS:** 1.00 (stock de seguridad estándar)
- **Incluir SS:** Sí

**Estrategia:**
- Máxima prioridad de reposición
- Nunca permitir quiebres de stock
- Mantener inventario suficiente pero no excesivo
- 97.5% de probabilidad de tener stock disponible

**Ejemplo con Datos Reales:**
```
Producto: 004962 (Arroz 1kg)
Demanda diaria: 1,802 unidades
Desv. std diaria: 273 unidades
CV = 273 / 1,802 = 0.15 (Estable ✓)

→ Demanda ciclo: 1,802 × 2.5 × 1.00 = 4,505 unidades
→ SS: 1.96 × 273 × 1.581 × 1.00 = 846 unidades
→ Nivel objetivo: 5,351 unidades
```

---

### 2. AY - Alto Valor, Demanda Variable

**Características:**
- Productos de alto valor económico
- Demanda con variabilidad media
- Coeficiente de variación entre 0.50 - 1.00
- Ejemplos: Productos con demanda estacional moderada

**Parámetros:**
- **Z-Score:** 1.96 (97.5% nivel de servicio)
- **Multiplicador Demanda:** 1.05 (aumenta 5% la demanda proyectada)
- **Multiplicador SS:** 1.25 (aumenta 25% el stock de seguridad)
- **Incluir SS:** Sí

**Estrategia:**
- Alta prioridad de reposición
- Aumentar demanda proyectada para cubrir variabilidad
- Stock de seguridad incrementado 25%
- Protege contra picos de demanda inesperados

**¿Por qué aumentar demanda y SS?**
- La demanda es menos predecible
- Los picos pueden ser significativos
- El costo de quiebre es muy alto (producto A)
- Vale la pena invertir más en inventario de seguridad

---

### 3. AZ - Alto Valor, Demanda Errática

**Características:**
- Productos de alto valor económico
- Demanda muy variable e impredecible
- Coeficiente de variación > 1.00
- Ejemplos: Productos con picos estacionales fuertes

**Parámetros:**
- **Z-Score:** 1.96 (97.5% nivel de servicio)
- **Multiplicador Demanda:** 1.10 (aumenta 10% la demanda)
- **Multiplicador SS:** 1.50 (aumenta 50% el stock de seguridad)
- **Incluir SS:** Sí

**Estrategia:**
- Prioridad alta (aunque menor que AX y AY)
- Máxima protección de stock de seguridad (+50%)
- Demanda proyectada aumentada 10%
- Acepta mayor inventario para evitar quiebres

**Consideraciones:**
- Requiere monitoreo frecuente
- Puede generar excesos temporales
- El costo de quiebre justifica el exceso
- Revisar patrones estacionales

---

### 4. BX - Medio Valor, Demanda Estable

**Características:**
- Productos de valor medio
- Demanda predecible
- CV < 0.50
- Ejemplos: Enlatados populares, productos de limpieza básicos

**Parámetros:**
- **Z-Score:** 1.65 (95% nivel de servicio)
- **Multiplicador Demanda:** 1.00
- **Multiplicador SS:** 1.00
- **Incluir SS:** Sí

**Estrategia:**
- Nivel de servicio alto pero no máximo
- 5% de probabilidad de quiebre es aceptable
- Balance entre disponibilidad y costo de inventario
- Reposición regular y predecible

---

### 5. BY - Medio Valor, Demanda Variable

**Características:**
- Productos de valor medio
- Demanda con variabilidad media
- 0.50 ≤ CV ≤ 1.00
- Ejemplos: Condimentos, salsas, productos estacionales moderados

**Parámetros:**
- **Z-Score:** 1.65 (95% nivel de servicio)
- **Multiplicador Demanda:** 1.00
- **Multiplicador SS:** 1.10 (aumenta 10% el SS)
- **Incluir SS:** Sí

**Estrategia:**
- Balance entre disponibilidad y costo
- Stock de seguridad ligeramente aumentado
- Acepta 5% de probabilidad de quiebre
- Monitoreo mensual de parámetros

**Ejemplo con Datos Reales:**
```
Producto: 000096 (Aceite 900ml)
Demanda diaria: 9,028 unidades
Desv. std diaria: 2,876 unidades
CV = 2,876 / 9,028 = 0.32 (Estable, pero podría ser Y)

→ Demanda ciclo: 9,028 × 2.5 × 1.00 = 22,570 unidades
→ SS: 1.65 × 2,876 × 1.581 × 1.10 = 8,210 unidades
→ Nivel objetivo: 30,780 unidades
```

---

### 6. BZ - Medio Valor, Demanda Errática

**Características:**
- Productos de valor medio
- Demanda muy variable
- CV > 1.00
- Ejemplos: Productos con demanda impredecible

**Parámetros:**
- **Z-Score:** 1.65 (95% nivel de servicio)
- **Multiplicador Demanda:** 1.05
- **Multiplicador SS:** 1.25 (aumenta 25% el SS)
- **Incluir SS:** Sí

**Estrategia:**
- Protección moderada contra variabilidad
- Stock de seguridad aumentado 25%
- Acepta mayor riesgo que productos A
- Requiere revisión frecuente

---

### 7. CX - Bajo Valor, Demanda Estable

**Características:**
- Productos de bajo valor
- Demanda predecible
- CV < 0.50
- Ejemplos: Artículos de baja rotación pero constante

**Parámetros:**
- **Z-Score:** 1.28 (90% nivel de servicio)
- **Multiplicador Demanda:** 1.00
- **Multiplicador SS:** 1.00
- **Incluir SS:** Sí

**Estrategia:**
- Nivel de servicio básico (90%)
- 10% de probabilidad de quiebre es aceptable
- Minimiza inventario inmovilizado
- Reposición económica

---

### 8. CY - Bajo Valor, Demanda Variable

**Características:**
- Productos de bajo valor
- Demanda con variabilidad media
- 0.50 ≤ CV ≤ 1.00
- Ejemplos: Productos estacionales de bajo valor

**Parámetros:**
- **Z-Score:** 1.28 (90% nivel de servicio)
- **Multiplicador Demanda:** 1.00
- **Multiplicador SS:** 0.50 (reduce 50% el SS)
- **Incluir SS:** Sí

**Estrategia:**
- Stock de seguridad reducido a la mitad
- Acepta mayor probabilidad de quiebre
- Minimiza capital inmovilizado
- Reposición frecuente pero en cantidades pequeñas

**¿Por qué reducir SS?**
- El costo de quiebre es bajo (producto C)
- El costo de mantener inventario puede ser mayor que el costo de faltante
- Mejor reordenar más frecuente con menos inventario

---

### 9. CZ - Bajo Valor, Demanda Errática

**Características:**
- Productos de bajo valor
- Demanda muy variable e impredecible
- CV > 1.00
- Ejemplos: Productos de muy baja rotación, artículos esporádicos

**Parámetros:**
- **Z-Score:** 0.00 (sin nivel de servicio garantizado)
- **Multiplicador Demanda:** 0.75 (reduce 25% la demanda)
- **Multiplicador SS:** 0.00 (sin stock de seguridad)
- **Incluir SS:** **NO**

**Estrategia:**
- **SIN stock de seguridad** (solo demanda durante ciclo)
- Demanda reducida al 75% del histórico
- Se acepta alta probabilidad de quiebre (~50%)
- Minimiza inventario obsoleto
- Reposición bajo demanda

**Ejemplo con Datos Reales:**
```
Producto: 004871 (Producto de baja rotación)
Demanda diaria: 5,602 unidades
Desv. std diaria: Alta (producto errático)

→ Demanda ciclo: 5,602 × 2.5 × 0.75 = 10,504 unidades
→ SS: 0 unidades (sin stock de seguridad)
→ Nivel objetivo: 10,504 unidades
```

**¿Por qué sin SS?**
- El costo de mantener inventario > costo de quiebre
- Riesgo de obsolescencia alto
- Mejor operar con pedidos bajo demanda
- Libera capital para productos A y B

---

## Ajustes por Tienda

### Personalización de Parámetros

Cada tienda puede tener configuraciones diferentes según:

1. **Tamaño de la tienda**
   - Tiendas grandes: Pueden mantener más SS
   - Tiendas pequeñas: Reducir SS para productos C

2. **Perfil de clientes**
   - Clientes premium: Aumentar Z-scores
   - Clientes sensibles a precio: Reducir SS en productos C

3. **Capacidad de almacenamiento**
   - Tiendas con espacio limitado: Reducir multiplicadores
   - Tiendas con bodegas amplias: Pueden aumentar SS

4. **Distancia al CEDI**
   - Tiendas lejanas: Aumentar multiplicadores (entregas menos frecuentes)
   - Tiendas cercanas: Reducir SS (reposición más ágil)

### Ejemplo: Configuración Diferenciada

**Tienda PERIFERICO (Alto tráfico, amplia bodega):**
```
AX: Z=1.96, Mult_SS=1.00  (Estándar)
BY: Z=1.65, Mult_SS=1.25  (Aumentado)
CZ: Z=0.00, Mult_D=0.75   (Estándar)
```

**Tienda BELLA VISTA (Espacio limitado):**
```
AX: Z=1.96, Mult_SS=0.90  (Reducido 10%)
BY: Z=1.65, Mult_SS=1.00  (Reducido 10%)
CZ: Z=0.00, Mult_D=0.50   (Reducido 50%)
```

---

## Cuándo Ajustar Parámetros

### Indicadores de que necesitas ajustar

#### Aumentar Z-score o Multiplicadores SS

**Síntomas:**
- Quiebres de stock frecuentes (> objetivo)
- Ventas perdidas detectadas
- Quejas de clientes por faltantes
- Productos con alta rotación

**Acción:**
```sql
UPDATE parametros_reposicion_tienda
SET nivel_servicio_z = 1.96,      -- Aumentar de 1.65 a 1.96
    multiplicador_ss = 1.25       -- Aumentar SS 25%
WHERE tienda_id = 'tienda_01'
  AND matriz_abc_xyz = 'BY';
```

#### Reducir Z-score o Multiplicadores SS

**Síntomas:**
- Exceso de inventario crónico
- Productos vencidos o obsoletos
- Capital inmovilizado alto
- Espacio de bodega saturado

**Acción:**
```sql
UPDATE parametros_reposicion_tienda
SET multiplicador_ss = 0.75,      -- Reducir SS 25%
    multiplicador_demanda = 0.90   -- Reducir demanda 10%
WHERE tienda_id = 'tienda_01'
  AND matriz_abc_xyz = 'CY';
```

#### Cambiar Clasificación ABC-XYZ

**Síntomas:**
- Producto cambió de rotación (ahora es A en lugar de B)
- Demanda se volvió más estable (Y → X)
- Producto se volvió errático (X → Z)

**Acción:**
Ejecutar el proceso de reclasificación ABC-XYZ mensualmente usando datos actualizados de ventas.

---

## Mejores Prácticas

### 1. Revisión Periódica

- **Mensual:** Revisar parámetros de productos A
- **Trimestral:** Revisar parámetros de productos B
- **Semestral:** Revisar parámetros de productos C

### 2. Análisis de Quiebres

Monitorear tasa real de quiebres vs. objetivo:

| Matriz | Nivel Servicio Objetivo | Quiebres Esperados | Acción si > Esperado |
|--------|-------------------------|-------------------|---------------------|
| AX, AY, AZ | 97.5% | 2.5% | Aumentar Z-score o Mult SS |
| BX, BY, BZ | 95.0% | 5.0% | Revisar parámetros |
| CX, CY | 90.0% | 10.0% | Aceptable |
| CZ | ~50% | ~50% | Esperado |

### 3. Análisis de Excesos

Monitorear productos con exceso crónico (Stock > Nivel Objetivo por > 4 semanas):

```sql
SELECT
    producto_id,
    matriz_abc_xyz,
    AVG(stock_actual - nivel_objetivo) as exceso_promedio,
    COUNT(*) as semanas_con_exceso
FROM pedidos_sugeridos_detalle
WHERE stock_actual > nivel_objetivo
GROUP BY producto_id, matriz_abc_xyz
HAVING COUNT(*) > 4
ORDER BY exceso_promedio DESC;
```

**Acción:** Reducir multiplicadores para productos con exceso crónico.

### 4. Auditoría de Cambios

Todos los ajustes manuales deben registrarse:

```sql
INSERT INTO pedidos_sugeridos_auditoria
(pedido_id, producto_id, campo_modificado, valor_anterior, valor_nuevo,
 tipo_cambio, razon_cambio, usuario)
VALUES
('ped_001', 'prod_123', 'nivel_servicio_z', '1.65', '1.96',
 'ajuste_parametro', 'Aumentar nivel de servicio por quiebres frecuentes', 'jose@fluxion.ai');
```

### 5. Validación de Cambios

Antes de aplicar cambios masivos:
1. Probar en 1-2 tiendas piloto
2. Monitorear resultados por 2-4 semanas
3. Comparar métricas antes/después
4. Aplicar a todas las tiendas si funciona

---

## Preguntas Frecuentes

### ¿Puedo tener parámetros diferentes por tienda?

**Sí.** Cada tienda tiene su propia tabla `parametros_reposicion_tienda` con 9 registros (uno por matriz ABC-XYZ).

### ¿Qué pasa si cambio el Z-score?

**Impacto directo en stock de seguridad:**
- Aumentar Z de 1.65 a 1.96: +18% de SS
- Reducir Z de 1.96 a 1.65: -16% de SS
- Cambiar Z a 0.00: Elimina completamente el SS

### ¿Cómo afecta el Multiplicador de Demanda?

**Impacto directo en demanda durante ciclo:**
- Mult = 1.10: Aumenta demanda proyectada 10%
- Mult = 0.75: Reduce demanda proyectada 25%
- No afecta el stock de seguridad

### ¿Puedo desactivar parámetros?

**Sí.** Cambiar `activo = false` en `parametros_reposicion_tienda`:

```sql
UPDATE parametros_reposicion_tienda
SET activo = false
WHERE tienda_id = 'tienda_01' AND matriz_abc_xyz = 'CZ';
```

Pero **debe haber al menos un conjunto activo** para cada matriz en uso.

### ¿Con qué frecuencia se recalculan los niveles objetivo?

**Diariamente.** Cada vez que se genera un pedido sugerido, el sistema:
1. Lee la demanda más reciente (últimas 8 semanas)
2. Lee los parámetros actuales
3. Calcula nivel objetivo con datos frescos

---

**Anterior:** [Lógica de Nivel Objetivo](02-LOGICA_NIVEL_OBJETIVO.md)
**Siguiente:** [Guía de Configuración](04-CONFIGURACION.md)
