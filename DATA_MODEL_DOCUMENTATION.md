# Documentación del Modelo de Datos - Fluxion

## 🎯 Resumen Ejecutivo

Este documento explica la estructura de claves de negocio en la base de datos Fluxion, especialmente para la tabla `ventas_raw`.

---

## 📊 Tabla: ventas_raw (81.8M registros)

### ⚠️ **IMPORTANTE: Claves de Negocio**

#### ❌ **Clave INCORRECTA** (no usar):
```sql
[numero_factura + linea]
```
**Problema:** Los números de factura NO son únicos globalmente. Cada ubicación (tienda) genera su propia secuencia de números.

#### ✅ **Clave CORRECTA** (usar siempre):
```sql
[ubicacion_id + numero_factura + linea]
```
**Por qué:** Esta combinación identifica ÚNICAMENTE una línea de venta en todo el sistema.

---

## 🔑 Estructura de Claves

### Clave Primaria de Negocio

```sql
ubicacion_id + numero_factura + linea
```

**Explicación:**
- **ubicacion_id**: Identifica la tienda/punto de venta (ej: `tienda_01`, `tienda_02`)
- **numero_factura**: Número de factura (único por ubicación, NO globalmente)
- **linea**: Número de línea dentro de la factura (cada producto vendido)

### Ejemplos

**✅ CORRECTO - Estos son registros DIFERENTES:**
```
tienda_01 + 001086268 + 15 → Lentejas, 2025-09-03
tienda_02 + 001086268 + 15 → Harina de Trigo, 2025-06-02
tienda_06 + 001086268 + 15 → Harina de Maíz, 2025-05-04
```

**❌ INCORRECTO - Asumir que son duplicados:**
```
001086268 + 15 → ¿Cuál? Hay múltiples registros válidos
```

---

## 📝 Mejores Prácticas para Queries

### ✅ **Queries Correctas**

#### 1. Buscar una factura específica
```sql
-- CORRECTO: Incluir ubicacion_id
SELECT *
FROM ventas_raw
WHERE ubicacion_id = 'tienda_01'
  AND numero_factura = '001086268';
```

```sql
-- INCORRECTO: Sin ubicacion_id (puede retornar múltiples facturas)
SELECT *
FROM ventas_raw
WHERE numero_factura = '001086268';  -- ❌ Ambiguo
```

#### 2. Análisis de ventas por ubicación
```sql
-- CORRECTO: Agrupar con ubicacion_id
SELECT
    ubicacion_id,
    ubicacion_nombre,
    COUNT(DISTINCT numero_factura) as total_facturas,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total
FROM ventas_raw
WHERE fecha BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY ubicacion_id, ubicacion_nombre;
```

#### 3. Obtener detalles de una línea específica
```sql
-- CORRECTO: Clave completa
SELECT *
FROM ventas_raw
WHERE ubicacion_id = 'tienda_01'
  AND numero_factura = '001086268'
  AND linea = '15';
```

#### 4. Análisis de productos por ubicación
```sql
-- CORRECTO: Siempre incluir ubicacion_id
SELECT
    ubicacion_id,
    codigo_producto,
    descripcion_producto,
    COUNT(*) as num_ventas,
    SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_total
FROM ventas_raw
WHERE fecha BETWEEN '2025-01-01' AND '2025-01-31'
GROUP BY ubicacion_id, codigo_producto, descripcion_producto
ORDER BY ubicacion_id, cantidad_total DESC;
```

### ❌ **Queries Incorrectas (Evitar)**

```sql
-- INCORRECTO: Agregar sin ubicacion_id causa conteos inflados
SELECT
    numero_factura,
    COUNT(*) as lineas
FROM ventas_raw
GROUP BY numero_factura;  -- ❌ Suma líneas de TODAS las ubicaciones

-- INCORRECTO: Buscar sin contexto de ubicación
SELECT * FROM ventas_raw WHERE numero_factura = '12345';  -- ❌ Ambiguo
```

---

## 🔍 Vistas Disponibles

### 1. `ventas_por_ubicacion`
Vista simplificada con campos clave para análisis por ubicación.

```sql
SELECT * FROM ventas_por_ubicacion
WHERE ubicacion_id = 'tienda_01'
  AND fecha = '2025-09-01'
LIMIT 100;
```

### 2. `facturas_resumen`
Resumen de cada factura con totales agregados (ya agrupado correctamente).

```sql
SELECT * FROM facturas_resumen
WHERE ubicacion_id = 'tienda_01'
  AND fecha BETWEEN '2025-01-01' AND '2025-01-31'
ORDER BY venta_total_factura DESC;
```

### 3. `analisis_numeracion_facturas`
Identifica números de factura usados por múltiples ubicaciones.

```sql
SELECT * FROM analisis_numeracion_facturas
WHERE ubicaciones_que_usan_numero > 5
LIMIT 50;
```

### 4. `verificacion_duplicados_reales`
Vista de monitoreo para detectar duplicados REALES (debería estar vacía).

```sql
SELECT * FROM verificacion_duplicados_reales;
-- Si retorna registros, hay un problema de integridad
```

---

## 🏗️ Índices Implementados

### Índices Únicos
```sql
-- Clave primaria de negocio
idx_ventas_raw_unique_key (ubicacion_id, numero_factura, linea)

-- Transacción completa única
idx_ventas_raw_unique_transaction (ubicacion_id, numero_factura, codigo_producto, fecha_hora_completa, linea)
```

### Índices de Performance
```sql
-- Para búsquedas por ubicación
idx_ventas_raw_ubicacion_factura (ubicacion_id, numero_factura)

-- Para análisis temporal
idx_ventas_raw_fecha (fecha)
idx_ventas_raw_ubicacion_fecha_producto (ubicacion_id, fecha, codigo_producto)

-- Para filtros comunes
idx_ventas_raw_producto (codigo_producto)
idx_ventas_raw_categoria (categoria_producto)
```

---

## 📊 Estadísticas de Datos

- **Total de registros:** 81,815,010
- **Ubicaciones únicas:** 20 tiendas
- **Números de factura únicos (por ubicación):** ~2-3 millones por tienda
- **Números de factura globalmente:** ~40-50 millones (con repetición entre tiendas)
- **Rango de fechas:** 2025-01-01 a 2025-09-30

---

## 🚨 Validaciones Importantes

### Verificar integridad de clave única
```sql
-- Esta query NO debería retornar registros
SELECT
    ubicacion_id,
    numero_factura,
    linea,
    COUNT(*) as duplicados
FROM ventas_raw
GROUP BY ubicacion_id, numero_factura, linea
HAVING COUNT(*) > 1;
```

### Verificar rango de numeración por ubicación
```sql
SELECT
    ubicacion_id,
    ubicacion_nombre,
    MIN(numero_factura) as min_factura,
    MAX(numero_factura) as max_factura,
    COUNT(DISTINCT numero_factura) as facturas_unicas
FROM ventas_raw
GROUP BY ubicacion_id, ubicacion_nombre
ORDER BY ubicacion_id;
```

---

## 💡 Casos de Uso Comunes

### Caso 1: Reporte de Ventas Diarias por Tienda
```sql
SELECT
    ubicacion_id,
    ubicacion_nombre,
    fecha,
    COUNT(DISTINCT numero_factura) as num_facturas,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total_dia
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
GROUP BY ubicacion_id, ubicacion_nombre, fecha
ORDER BY ubicacion_id, fecha;
```

### Caso 2: Top Productos por Tienda
```sql
SELECT
    ubicacion_id,
    codigo_producto,
    descripcion_producto,
    SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_total,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
GROUP BY ubicacion_id, codigo_producto, descripcion_producto
ORDER BY ubicacion_id, venta_total DESC;
```

### Caso 3: Análisis de Factura Específica
```sql
-- Obtener todos los items de una factura
SELECT
    linea,
    codigo_producto,
    descripcion_producto,
    cantidad_vendida,
    precio_unitario,
    venta_total,
    margen_bruto_pct
FROM ventas_raw
WHERE ubicacion_id = 'tienda_01'
  AND numero_factura = '001086268'
ORDER BY CAST(linea AS INTEGER);
```

### Caso 4: Comparación entre Tiendas
```sql
SELECT
    ubicacion_id,
    ubicacion_nombre,
    COUNT(*) as total_transacciones,
    COUNT(DISTINCT numero_factura) as num_facturas,
    SUM(CAST(venta_total AS DECIMAL)) as venta_total,
    AVG(CAST(venta_total AS DECIMAL)) as ticket_promedio
FROM ventas_raw
WHERE fecha BETWEEN '2025-09-01' AND '2025-09-30'
GROUP BY ubicacion_id, ubicacion_nombre
ORDER BY venta_total DESC;
```

---

## 🔄 Migración de Código Existente

Si tienes queries existentes que NO incluyen `ubicacion_id`, actualízalas:

### Antes (Incorrecto)
```sql
SELECT * FROM ventas_raw WHERE numero_factura = '12345';
```

### Después (Correcto)
```sql
-- Opción 1: Si sabes la ubicación
SELECT * FROM ventas_raw
WHERE ubicacion_id = 'tienda_01'
  AND numero_factura = '12345';

-- Opción 2: Si quieres ver todas las ubicaciones con ese número
SELECT
    ubicacion_id,
    ubicacion_nombre,
    numero_factura,
    COUNT(*) as lineas
FROM ventas_raw
WHERE numero_factura = '12345'
GROUP BY ubicacion_id, ubicacion_nombre, numero_factura;
```

---

## 📞 Contacto y Soporte

Si encuentras:
- ❌ Duplicados en la vista `verificacion_duplicados_reales`
- ❌ Queries que fallan por claves duplicadas
- ❌ Resultados inesperados en análisis

Contacta al equipo de datos para investigación.

---

## 🗓️ Historial de Cambios

- **2025-09-30**: Documentación inicial del modelo de datos
- **2025-09-30**: Creación de índices únicos con clave correcta
- **2025-09-30**: Creación de vistas de análisis

---

## 📚 Referencias

- Script de índices: `fix_data_model.sql`
- Análisis de duplicados: `analyze_duplicates_deep.py`
- Verificación de duplicados: `check_duplicates.py`
