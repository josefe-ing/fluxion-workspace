# Guía de Configuración - Sistema de Pedido Sugerido

## Introducción

Esta guía está diseñada para **compradores, gerentes de tienda y personal operativo** que necesitan ajustar el sistema de pedidos sugeridos según las necesidades específicas de cada tienda.

---

## Vista General del Sistema de Configuración

### ¿Qué se puede configurar?

Por cada tienda, puedes ajustar **9 conjuntos de parámetros** (uno por cada combinación ABC-XYZ):

1. **Nivel de Servicio (Z-score)**: Qué tan protegido quieres estar contra quiebres
2. **Multiplicador de Demanda**: Ajusta la demanda proyectada hacia arriba o abajo
3. **Multiplicador de Stock de Seguridad**: Ajusta el inventario de protección
4. **Incluir Stock de Seguridad**: Activar/desactivar SS para cada matriz
5. **Prioridad de Reposición**: Orden de prioridad (1 = máxima, 9 = mínima)

### ¿Quién puede configurar?

- **Gerente General**: Ajustes estratégicos globales
- **Gerente de Tienda**: Ajustes específicos de su tienda
- **Comprador**: Ajustes operativos y tácticos
- **Administrador del Sistema**: Cambios masivos o correcciones

---

## Consultar Configuración Actual

### Ver parámetros de una tienda específica

```sql
SELECT
    u.nombre as tienda,
    p.matriz_abc_xyz,
    p.nivel_servicio_z,
    p.multiplicador_demanda,
    p.multiplicador_ss,
    p.incluir_stock_seguridad,
    p.prioridad_reposicion,
    p.activo,
    p.fecha_actualizacion
FROM parametros_reposicion_tienda p
JOIN ubicaciones u ON p.tienda_id = u.id
WHERE p.tienda_id = 'tienda_01'
  AND p.activo = true
ORDER BY p.prioridad_reposicion;
```

### Resultado esperado:

| Tienda | Matriz | Z-Score | Mult. Dem | Mult. SS | Inc. SS | Prior. |
|--------|--------|---------|-----------|----------|---------|--------|
| PERIFERICO | AX | 1.96 | 1.00 | 1.00 | Sí | 1 |
| PERIFERICO | AY | 1.96 | 1.05 | 1.25 | Sí | 2 |
| PERIFERICO | AZ | 1.96 | 1.10 | 1.50 | Sí | 3 |
| PERIFERICO | BX | 1.65 | 1.00 | 1.00 | Sí | 4 |
| PERIFERICO | BY | 1.65 | 1.00 | 1.10 | Sí | 5 |
| PERIFERICO | BZ | 1.65 | 1.05 | 1.25 | Sí | 6 |
| PERIFERICO | CX | 1.28 | 1.00 | 1.00 | Sí | 7 |
| PERIFERICO | CY | 1.28 | 1.00 | 0.50 | Sí | 8 |
| PERIFERICO | CZ | 0.00 | 0.75 | 0.00 | No | 9 |

---

## Casos de Uso Comunes

### Caso 1: Tienda con Quiebres Frecuentes en Productos A

**Problema:**
- Productos clase A (alto valor) se están agotando frecuentemente
- Clientes se quejan de faltantes
- Ventas perdidas detectadas

**Diagnóstico:**
```sql
-- Verificar tasa real de quiebres en productos A
SELECT
    COUNT(*) as total_dias,
    SUM(CASE WHEN stock_actual = 0 THEN 1 ELSE 0 END) as dias_sin_stock,
    ROUND(100.0 * SUM(CASE WHEN stock_actual = 0 THEN 1 ELSE 0 END) / COUNT(*), 2) as tasa_quiebre
FROM stock_actual s
JOIN productos_abc_v2 abc ON s.producto_id = abc.codigo_producto
WHERE s.tienda_id = 'tienda_01'
  AND abc.matriz_abc_xyz IN ('AX', 'AY', 'AZ')
  AND s.fecha >= CURRENT_DATE - INTERVAL '30 days';
```

**Solución:**

Aumentar el nivel de servicio y stock de seguridad para productos AX:

```sql
UPDATE parametros_reposicion_tienda
SET
    nivel_servicio_z = 2.33,        -- Aumentar de 1.96 a 2.33 (99% servicio)
    multiplicador_ss = 1.25,         -- Aumentar SS en 25%
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE tienda_id = 'tienda_01'
  AND matriz_abc_xyz = 'AX';
```

**Impacto esperado:**
- Nivel de servicio: 97.5% → 99%
- Stock de seguridad: +25%
- Quiebres esperados: 2.5% → 1%

---

### Caso 2: Tienda con Exceso de Inventario en Productos C

**Problema:**
- Bodega saturada con productos clase C
- Capital inmovilizado en productos de baja rotación
- Productos vencidos o cerca de vencer

**Diagnóstico:**
```sql
-- Identificar productos C con exceso crónico
SELECT
    p.descripcion,
    abc.matriz_abc_xyz,
    s.cantidad as stock_actual,
    psd.nivel_objetivo,
    s.cantidad - psd.nivel_objetivo as exceso,
    p.dias_hasta_vencimiento
FROM stock_actual s
JOIN productos p ON s.producto_id = p.id
JOIN productos_abc_v2 abc ON p.codigo = abc.codigo_producto
LEFT JOIN pedidos_sugeridos_detalle psd ON s.producto_id = psd.producto_id
    AND s.tienda_id = psd.tienda_id
WHERE s.tienda_id = 'tienda_01'
  AND abc.matriz_abc_xyz IN ('CX', 'CY', 'CZ')
  AND s.cantidad > COALESCE(psd.nivel_objetivo, 0)
ORDER BY exceso DESC
LIMIT 20;
```

**Solución:**

Reducir multiplicadores para productos CY y CZ:

```sql
-- Reducir parámetros para CY
UPDATE parametros_reposicion_tienda
SET
    multiplicador_demanda = 0.80,    -- Reducir demanda proyectada 20%
    multiplicador_ss = 0.25,         -- Reducir SS a 25% del original
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE tienda_id = 'tienda_01'
  AND matriz_abc_xyz = 'CY';

-- Reducir aún más para CZ
UPDATE parametros_reposicion_tienda
SET
    multiplicador_demanda = 0.50,    -- Reducir demanda proyectada 50%
    incluir_stock_seguridad = false, -- Confirmar que no tiene SS
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE tienda_id = 'tienda_01'
  AND matriz_abc_xyz = 'CZ';
```

**Impacto esperado:**
- Nivel objetivo productos CY: -30% aprox.
- Nivel objetivo productos CZ: -50% aprox.
- Liberación de espacio y capital

---

### Caso 3: Tienda Pequeña con Espacio Limitado

**Problema:**
- Bodega pequeña (< 200 m²)
- No puede mantener tanto inventario como tiendas grandes
- Necesita optimizar espacio

**Solución:**

Reducir multiplicadores de SS en todas las categorías:

```sql
UPDATE parametros_reposicion_tienda
SET
    multiplicador_ss = multiplicador_ss * 0.80,  -- Reducir todos los SS en 20%
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE tienda_id = 'tienda_05';  -- ID de tienda pequeña
```

**Ajuste fino por categoría:**

```sql
-- Mantener protección para productos A
UPDATE parametros_reposicion_tienda
SET multiplicador_ss = 1.00
WHERE tienda_id = 'tienda_05'
  AND matriz_abc_xyz IN ('AX', 'AY');

-- Reducir más para productos B
UPDATE parametros_reposicion_tienda
SET multiplicador_ss = 0.80
WHERE tienda_id = 'tienda_05'
  AND matriz_abc_xyz IN ('BX', 'BY', 'BZ');

-- Minimizar para productos C
UPDATE parametros_reposicion_tienda
SET multiplicador_ss = 0.50
WHERE tienda_id = 'tienda_05'
  AND matriz_abc_xyz IN ('CX', 'CY');
```

---

### Caso 4: Ajuste Estacional (Temporada Alta)

**Problema:**
- Se aproxima temporada alta (ej: diciembre, Semana Santa)
- Demanda histórica no refleja picos estacionales
- Necesitas aumentar inventario preventivamente

**Solución:**

Aumentar multiplicadores de demanda temporalmente:

```sql
-- Aumentar demanda proyectada para productos A y B
UPDATE parametros_reposicion_tienda
SET
    multiplicador_demanda = 1.30,    -- Aumentar demanda 30%
    multiplicador_ss = 1.50,         -- Aumentar SS 50%
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE tienda_id = 'tienda_01'
  AND matriz_abc_xyz IN ('AX', 'AY', 'AZ', 'BX', 'BY');
```

**IMPORTANTE:** Después de la temporada, **regresar** a valores normales:

```sql
-- Restaurar parámetros post-temporada
UPDATE parametros_reposicion_tienda
SET
    multiplicador_demanda = 1.00,
    multiplicador_ss = CASE
        WHEN matriz_abc_xyz = 'AX' THEN 1.00
        WHEN matriz_abc_xyz = 'AY' THEN 1.25
        WHEN matriz_abc_xyz = 'AZ' THEN 1.50
        WHEN matriz_abc_xyz = 'BX' THEN 1.00
        WHEN matriz_abc_xyz = 'BY' THEN 1.10
        ELSE multiplicador_ss
    END,
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE tienda_id = 'tienda_01'
  AND matriz_abc_xyz IN ('AX', 'AY', 'AZ', 'BX', 'BY');
```

---

### Caso 5: Tienda Lejana al CEDI (Entregas Menos Frecuentes)

**Problema:**
- Tienda ubicada lejos del CEDI (> 4 horas)
- Entregas solo 2-3 veces por semana (no diarias)
- Lead time real: 3-4 días (no 1.5 días)

**Solución:**

Aumentar todos los multiplicadores para compensar mayor lead time:

```sql
-- Aumentar stock para cubrir 4 días (en vez de 2.5)
-- Factor de ajuste: 4.0 / 2.5 = 1.6

UPDATE parametros_reposicion_tienda
SET
    multiplicador_demanda = multiplicador_demanda * 1.6,
    multiplicador_ss = multiplicador_ss * 1.6,
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE tienda_id = 'tienda_12';  -- Tienda lejana
```

**Resultado:**
- Nivel objetivo aumenta ~60%
- Puede operar 4 días sin reposición
- Reduce riesgo de quiebres entre entregas

---

## Ajustes Avanzados

### Cambiar Nivel de Servicio (Z-score)

**Opciones disponibles:**

| Z-Score | Nivel de Servicio | Cuándo Usar |
|---------|-------------------|-------------|
| **2.33** | 99.0% | Productos críticos, clientes VIP |
| **1.96** | 97.5% | Productos A (estándar) |
| **1.65** | 95.0% | Productos B (estándar) |
| **1.28** | 90.0% | Productos C (estándar) |
| **0.84** | 80.0% | Productos de muy baja prioridad |
| **0.00** | ~50% | Sin stock de seguridad |

**Ejemplo: Aumentar servicio para productos A en tienda premium**

```sql
UPDATE parametros_reposicion_tienda
SET nivel_servicio_z = 2.33  -- 99% servicio
WHERE tienda_id = 'tienda_01'
  AND matriz_abc_xyz IN ('AX', 'AY', 'AZ');
```

### Desactivar Stock de Seguridad Completamente

**Cuándo hacerlo:**
- Productos con vida útil muy corta (< 7 días)
- Productos bajo pedido (made-to-order)
- Productos CZ con costo de inventario > costo de quiebre

```sql
UPDATE parametros_reposicion_tienda
SET
    incluir_stock_seguridad = false,
    multiplicador_ss = 0.00,
    nivel_servicio_z = 0.00
WHERE tienda_id = 'tienda_01'
  AND matriz_abc_xyz = 'CZ';
```

### Cambiar Prioridad de Reposición

**Escenario:** Quieres que productos BX tengan mayor prioridad que AZ:

```sql
-- Intercambiar prioridades
UPDATE parametros_reposicion_tienda
SET prioridad_reposicion = 3
WHERE tienda_id = 'tienda_01' AND matriz_abc_xyz = 'BX';

UPDATE parametros_reposicion_tienda
SET prioridad_reposicion = 4
WHERE tienda_id = 'tienda_01' AND matriz_abc_xyz = 'AZ';
```

---

## Monitoreo de Cambios

### Verificar impacto de ajustes

Después de cambiar parámetros, monitorea estas métricas:

#### 1. Comparar niveles objetivo antes/después

```sql
-- Guardar snapshot antes del cambio
CREATE TEMP TABLE niveles_antes AS
SELECT
    producto_id,
    tienda_id,
    nivel_objetivo,
    stock_seguridad,
    cantidad_sugerida
FROM pedidos_sugeridos_detalle
WHERE tienda_id = 'tienda_01'
  AND fecha = CURRENT_DATE;

-- Después del cambio, comparar
SELECT
    'Antes' as momento,
    AVG(nivel_objetivo) as nivel_promedio,
    SUM(cantidad_sugerida) as total_sugerido
FROM niveles_antes
UNION ALL
SELECT
    'Después' as momento,
    AVG(nivel_objetivo) as nivel_promedio,
    SUM(cantidad_sugerida) as total_sugerido
FROM pedidos_sugeridos_detalle
WHERE tienda_id = 'tienda_01'
  AND fecha = CURRENT_DATE;
```

#### 2. Monitorear tasa de quiebres (semanal)

```sql
SELECT
    DATE_TRUNC('week', s.fecha) as semana,
    abc.matriz_abc_xyz,
    COUNT(*) as total_dias_producto,
    SUM(CASE WHEN s.cantidad = 0 THEN 1 ELSE 0 END) as dias_sin_stock,
    ROUND(100.0 * SUM(CASE WHEN s.cantidad = 0 THEN 1 ELSE 0 END) / COUNT(*), 2) as tasa_quiebre
FROM stock_actual s
JOIN productos_abc_v2 abc ON s.producto_id = abc.codigo_producto
WHERE s.tienda_id = 'tienda_01'
  AND s.fecha >= CURRENT_DATE - INTERVAL '8 weeks'
GROUP BY DATE_TRUNC('week', s.fecha), abc.matriz_abc_xyz
ORDER BY semana DESC, abc.matriz_abc_xyz;
```

#### 3. Monitorear inventario promedio (mensual)

```sql
SELECT
    DATE_TRUNC('month', s.fecha) as mes,
    abc.matriz_abc_xyz,
    AVG(s.cantidad) as stock_promedio,
    AVG(psd.nivel_objetivo) as nivel_objetivo_promedio,
    AVG(s.cantidad - psd.nivel_objetivo) as diferencia_promedio
FROM stock_actual s
JOIN productos_abc_v2 abc ON s.producto_id = abc.codigo_producto
LEFT JOIN pedidos_sugeridos_detalle psd ON s.producto_id = psd.producto_id
    AND s.tienda_id = psd.tienda_id
    AND s.fecha = psd.fecha
WHERE s.tienda_id = 'tienda_01'
  AND s.fecha >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', s.fecha), abc.matriz_abc_xyz
ORDER BY mes DESC, abc.matriz_abc_xyz;
```

---

## Plantilla de Auditoría de Cambios

**Siempre registra por qué hiciste un cambio:**

```sql
-- Ejemplo de registro de auditoría
INSERT INTO parametros_reposicion_auditoria
(tienda_id, matriz_abc_xyz, campo_modificado, valor_anterior, valor_nuevo,
 razon, usuario, fecha)
VALUES
('tienda_01', 'AX', 'nivel_servicio_z', '1.96', '2.33',
 'Quiebres frecuentes detectados en productos AX durante últimas 4 semanas. Tasa real: 5.2% vs objetivo 2.5%',
 'jose.manager', CURRENT_TIMESTAMP);
```

---

## Mejores Prácticas

### ✅ Hacer

1. **Probar en una tienda piloto primero**
   - Aplicar cambios a 1-2 tiendas
   - Monitorear por 2-4 semanas
   - Extender a todas si funciona

2. **Cambiar parámetros gradualmente**
   - No hacer cambios masivos de > 30% de una vez
   - Ajustar 10-20% inicialmente
   - Monitorear y ajustar nuevamente

3. **Documentar todos los cambios**
   - Por qué se hizo el cambio
   - Qué métrica se buscaba mejorar
   - Resultado esperado vs. real

4. **Revisar parámetros periódicamente**
   - Mensual: Productos A
   - Trimestral: Productos B
   - Semestral: Productos C

5. **Alinear con calendario del negocio**
   - Aumentar antes de temporadas altas
   - Reducir después de temporadas
   - Ajustar para eventos especiales

### ❌ Evitar

1. **No desactivar SS para productos A**
   - Productos de alto valor siempre deben tener protección
   - Costo de quiebre >> costo de inventario

2. **No hacer cambios sin respaldo**
   - Siempre guardar snapshot de configuración anterior
   - Poder revertir si algo sale mal

3. **No ignorar alertas del sistema**
   - Si el sistema sugiere 0 unidades, investigar por qué
   - Puede indicar exceso crónico o error en datos

4. **No copiar parámetros entre tiendas diferentes**
   - Cada tienda tiene perfil único
   - Ajustar según tamaño, ubicación, clientes

5. **No ajustar durante análisis de datos**
   - Esperar a tener al menos 2 semanas de datos post-cambio
   - No hacer ajustes reactivos diarios

---

## Plantilla de Configuración por Tipo de Tienda

### Tienda Tipo A: Grande, Alto Tráfico, Amplia Bodega

```sql
-- Configuración recomendada: Parámetros estándar o aumentados
UPDATE parametros_reposicion_tienda
SET
    nivel_servicio_z = CASE matriz_abc_xyz
        WHEN 'AX' THEN 2.33  -- 99% servicio para AX
        WHEN 'AY' THEN 1.96
        WHEN 'AZ' THEN 1.96
        WHEN 'BX' THEN 1.65
        WHEN 'BY' THEN 1.65
        WHEN 'BZ' THEN 1.65
        WHEN 'CX' THEN 1.28
        WHEN 'CY' THEN 1.28
        ELSE 0.00
    END,
    multiplicador_ss = CASE matriz_abc_xyz
        WHEN 'AX' THEN 1.00
        WHEN 'AY' THEN 1.25
        WHEN 'AZ' THEN 1.50
        WHEN 'BX' THEN 1.00
        WHEN 'BY' THEN 1.10
        WHEN 'BZ' THEN 1.25
        WHEN 'CX' THEN 1.00
        WHEN 'CY' THEN 0.50
        ELSE 0.00
    END
WHERE tienda_id = 'tienda_grande';
```

### Tienda Tipo B: Mediana, Tráfico Medio

```sql
-- Configuración recomendada: Parámetros estándar
UPDATE parametros_reposicion_tienda
SET
    nivel_servicio_z = CASE matriz_abc_xyz
        WHEN 'AX' THEN 1.96
        WHEN 'AY' THEN 1.96
        WHEN 'AZ' THEN 1.96
        WHEN 'BX' THEN 1.65
        WHEN 'BY' THEN 1.65
        WHEN 'BZ' THEN 1.65
        WHEN 'CX' THEN 1.28
        WHEN 'CY' THEN 1.28
        ELSE 0.00
    END,
    multiplicador_ss = CASE matriz_abc_xyz
        WHEN 'AX' THEN 1.00
        WHEN 'AY' THEN 1.25
        WHEN 'AZ' THEN 1.50
        WHEN 'BX' THEN 1.00
        WHEN 'BY' THEN 1.10
        WHEN 'BZ' THEN 1.25
        WHEN 'CX' THEN 1.00
        WHEN 'CY' THEN 0.50
        ELSE 0.00
    END
WHERE tienda_id = 'tienda_mediana';
```

### Tienda Tipo C: Pequeña, Espacio Limitado

```sql
-- Configuración recomendada: Parámetros reducidos
UPDATE parametros_reposicion_tienda
SET
    nivel_servicio_z = CASE matriz_abc_xyz
        WHEN 'AX' THEN 1.96  -- Mantener protección para A
        WHEN 'AY' THEN 1.96
        WHEN 'AZ' THEN 1.65  -- Reducir AZ
        WHEN 'BX' THEN 1.65
        WHEN 'BY' THEN 1.28  -- Reducir BY
        WHEN 'BZ' THEN 1.28  -- Reducir BZ
        WHEN 'CX' THEN 0.84  -- Reducir CX
        WHEN 'CY' THEN 0.00  -- Eliminar SS para CY
        ELSE 0.00
    END,
    multiplicador_ss = CASE matriz_abc_xyz
        WHEN 'AX' THEN 0.90  -- Reducir 10%
        WHEN 'AY' THEN 1.00  -- Reducir 20%
        WHEN 'AZ' THEN 1.25  -- Reducir 17%
        WHEN 'BX' THEN 0.80  -- Reducir 20%
        WHEN 'BY' THEN 0.80  -- Reducir 27%
        WHEN 'BZ' THEN 1.00  -- Reducir 20%
        WHEN 'CX' THEN 0.75  -- Reducir 25%
        WHEN 'CY' THEN 0.00  -- Eliminar SS
        ELSE 0.00
    END
WHERE tienda_id = 'tienda_pequena';
```

---

## Contacto y Soporte

Si necesitas ayuda para configurar el sistema:

- **Gerente de Sistemas:** sistemas@fluxion.ai
- **Soporte Técnico:** soporte@fluxion.ai
- **Capacitación:** capacitacion@fluxion.ai

---

**Anterior:** [Parámetros ABC-XYZ](03-PARAMETROS_ABC_XYZ.md)
**Siguiente:** [Referencia de API](05-API_REFERENCE.md)
