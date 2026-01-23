# Guía de Implementación: Campo Cuadrante en Pedidos Sugeridos

## ✅ Completado

### 1. Base de Datos
- ✅ Migración 028: Agregada columna `productos.cuadrante`
- ✅ Migración 029: Agregada columna `ventas.cuadrante_producto`
- ✅ Índices creados para performance

### 2. Backend API
- ✅ Single-tienda: Parámetro `cuadrantes` en `/api/pedidos-sugeridos/calcular`
- ✅ Multi-tienda: Parámetro `cuadrantes` en `/api/pedidos-multitienda/calcular`
- ✅ Endpoints de exportación Excel con columna Cuadrante
- ✅ Modelo `ProductoPedidoSimplificado` actualizado

### 3. ETL
- ✅ Query extrae `p.Text2 AS cuadrante_producto` desde KLK
- ✅ Loader actualizado para guardar cuadrante en tabla `ventas`

---

## 🔄 Próximos Pasos

### Paso 1: Testing con Datos de Prueba (OPCIONAL)

Si quieres probar el sistema antes de ejecutar el ETL completo:

```bash
# Agregar datos de prueba
cd /Users/jose/Developer/fluxion-workspace
psql -h localhost -U fluxion -d fluxion_production -f database/scripts/test_cuadrante_setup.sql

# Popular cuadrantes en tabla productos
cd database/scripts
python3 populate_cuadrantes_from_ventas.py

# Verificar distribución
psql -h localhost -U fluxion -d fluxion_production -c "
SELECT cuadrante, COUNT(*) FROM productos
WHERE cuadrante != 'NO ESPECIFICADO'
GROUP BY cuadrante ORDER BY COUNT(*) DESC;
"
```

### Paso 2: Ejecutar ETL Completo (RECOMENDADO)

El ETL ya está configurado para extraer cuadrantes desde KLK:

```bash
cd /Users/jose/Developer/fluxion-workspace/etl

# Ejecutar ETL de ventas (extraerá cuadrantes automáticamente)
python3 etl_ventas_postgres.py

# O para tiendas específicas:
python3 etl_ventas_postgres.py --tiendas tienda_01 tienda_08

# Verificar que se guardaron cuadrantes
psql -h localhost -U fluxion -d fluxion_production -c "
SELECT cuadrante_producto, COUNT(*)
FROM ventas
WHERE cuadrante_producto IS NOT NULL
GROUP BY cuadrante_producto
ORDER BY COUNT(*) DESC
LIMIT 10;
"
```

### Paso 3: Popular Tabla Productos

Una vez que el ETL haya extraído datos de cuadrante en `ventas`:

```bash
cd /Users/jose/Developer/fluxion-workspace/database/scripts
python3 populate_cuadrantes_from_ventas.py

# Esperado: Verás cuántos productos fueron actualizados
# Ejemplo: "Productos actualizados: 2845"
```

### Paso 4: Testing de Endpoints API

#### 4.1 Single-Tienda SIN Filtro
```bash
curl -X POST http://localhost:8001/api/pedidos-sugeridos/calcular \
  -H "Content-Type: application/json" \
  -d '{
    "cedi_origen": "cedi_seco",
    "tienda_destino": "tienda_01",
    "dias_cobertura": 3
  }'
```

**Verificar:** Respuesta debe incluir campo `cuadrante_producto` en cada producto.

#### 4.2 Single-Tienda CON Filtro
```bash
curl -X POST "http://localhost:8001/api/pedidos-sugeridos/calcular?cuadrantes=CUADRANTE%20I&cuadrantes=CUADRANTE%20II" \
  -H "Content-Type: application/json" \
  -d '{
    "cedi_origen": "cedi_seco",
    "tienda_destino": "tienda_01",
    "dias_cobertura": 3
  }'
```

**Verificar:** Solo debe devolver productos de CUADRANTE I o II.

#### 4.3 Multi-Tienda CON Filtro
```bash
curl -X POST "http://localhost:8001/api/pedidos-multitienda/calcular?cuadrantes=CUADRANTE%20I" \
  -H "Content-Type: application/json" \
  -d '{
    "cedi_origen": "cedi_seco",
    "tiendas_destino": [
      {"tienda_id": "tienda_01", "tienda_nombre": "Naguanagua"},
      {"tienda_id": "tienda_08", "tienda_nombre": "Valencia"}
    ],
    "dias_cobertura": 3
  }'
```

#### 4.4 Exportar a Excel
```bash
# Primero crear un pedido (guardar el pedido_id de la respuesta)
# Luego exportar:

curl -X GET "http://localhost:8001/api/pedidos-sugeridos/{pedido_id}/exportar-excel" \
  --output pedido_test.xlsx

# Abrir Excel y verificar columna Cuadrante
open pedido_test.xlsx  # macOS
```

---

## 📊 Verificaciones

### Ver Distribución de Cuadrantes
```sql
-- En tabla productos
SELECT cuadrante, COUNT(*) as total
FROM productos
GROUP BY cuadrante
ORDER BY cuadrante;

-- En tabla ventas (últimos 30 días)
SELECT cuadrante_producto,
       COUNT(DISTINCT producto_id) as productos,
       COUNT(*) as transacciones
FROM ventas
WHERE fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
  AND cuadrante_producto IS NOT NULL
GROUP BY cuadrante_producto
ORDER BY COUNT(*) DESC;

-- Productos con cuadrante asignado
SELECT
    COUNT(*) FILTER (WHERE cuadrante != 'NO ESPECIFICADO') as con_cuadrante,
    COUNT(*) FILTER (WHERE cuadrante = 'NO ESPECIFICADO') as sin_cuadrante,
    COUNT(*) as total
FROM productos;
```

### Verificar Excel Descargado
1. Abrir archivo `.xlsx` descargado
2. Verificar que existe columna **Cuadrante** (columna E)
3. Verificar que tiene valores como "CUADRANTE I", "CUADRANTE II", etc.
4. Verificar colores por clasificación ABC (A=verde, B=amarillo, C=naranja, D=gris)

---

## 🎯 Valores Esperados de Cuadrante

Según el sistema KLK (campo `Text2`):
- CUADRANTE I
- CUADRANTE II
- CUADRANTE III
- CUADRANTE IV
- CUADRANTE V
- CUADRANTE VI
- CUADRANTE VII
- CUADRANTE VIII
- CUADRANTE IX
- CUADRANTE X
- CUADRANTE XI
- CUADRANTE XII
- NO ESPECIFICADO (valor por defecto)

---

## 🔧 Troubleshooting

### Problema: ETL no extrae cuadrantes
```bash
# Verificar que el query incluye Text2
grep -n "Text2" /Users/jose/Developer/fluxion-workspace/etl/core/query_ventas_generic.sql
# Debe mostrar: 27:    p.Text2 AS cuadrante_producto,
```

### Problema: Productos no se actualizan
```bash
# Verificar que hay datos en ventas
psql -h localhost -U fluxion -d fluxion_production -c "
SELECT COUNT(*) FROM ventas WHERE cuadrante_producto IS NOT NULL;
"

# Si hay 0 registros, ejecutar ETL primero
```

### Problema: Excel no muestra cuadrante
```bash
# Verificar que el pedido tiene cuadrantes guardados
psql -h localhost -U fluxion -d fluxion_production -c "
SELECT cuadrante_producto, COUNT(*)
FROM pedidos_sugeridos_detalle
WHERE pedido_id = 'TU_PEDIDO_ID'
GROUP BY cuadrante_producto;
"
```

---

## 📝 Archivos Modificados

### Base de Datos
- `database/migrations/028_add_cuadrante_to_productos_UP.sql` ⭐ NUEVO
- `database/migrations/028_add_cuadrante_to_productos_DOWN.sql` ⭐ NUEVO
- `database/migrations/029_add_cuadrante_to_ventas_UP.sql` ⭐ NUEVO
- `database/migrations/029_add_cuadrante_to_ventas_DOWN.sql` ⭐ NUEVO
- `database/scripts/populate_cuadrantes_from_ventas.py` ⭐ NUEVO/MODIFICADO

### Backend
- `backend/requirements.txt` (agregado openpyxl)
- `backend/models/pedidos_multitienda.py` (línea 125)
- `backend/routers/pedidos_sugeridos.py` (líneas 1031, 1336, 1380-1390, 1937, 2490+)
- `backend/routers/pedidos_multitienda.py` (líneas 96, 185, 210-217, 323, 357, 497, 646, 731+)

### ETL
- `etl/core/loader_ventas_postgres.py` (líneas 100, 106, 116, 193)
- `etl/core/query_ventas_generic.sql` (línea 27 - ya existía)

---

## ✨ Features Implementados

### Filtros
- ✅ Filtrar productos por uno o múltiples cuadrantes
- ✅ Compatible con filtros existentes (categoría, ABC, etc.)
- ✅ Filtro aplicado en backend (performance optimizada)

### Exportación Excel
- ✅ Columna Cuadrante en posición 5 (después de ABC)
- ✅ Colores por clasificación ABC
- ✅ Observación de ajustes DPD+U en multi-tienda
- ✅ Formatos numéricos alineados a la derecha
- ✅ Anchos de columna optimizados

### Performance
- ✅ Índices en `productos.cuadrante` y `ventas.cuadrante_producto`
- ✅ Índice compuesto `productos(categoria, cuadrante)`
- ✅ Queries optimizados con CTEs

---

## 🎉 ¡Listo!

El sistema está completamente configurado. Solo falta:
1. Ejecutar el ETL para extraer datos de KLK
2. Popular la tabla productos con el script
3. Probar los endpoints

¿Necesitas ayuda con algún paso específico?
