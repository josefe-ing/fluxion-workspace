# 📋 TODO: Completar Migración Productos ABC-XYZ

**Estado Actual:** 85% completado
**Tiempo Estimado Restante:** 1-2 horas
**Prioridad:** MEDIA (funcionalidad core ya migrada)

---

## ✅ Ya Completado

- [x] Documentación MVP completa
- [x] Limpieza archivos DuckDB legacy (19 archivos)
- [x] Índices de performance optimizados
- [x] Helpers de cálculo ABC-XYZ
- [x] Endpoint `/api/productos/matriz-abc-xyz`
- [x] Endpoint `/api/productos/lista-por-matriz`
- [x] Fix tipos Decimal→float

---

## ⏳ Pendiente

### 1. Migrar Endpoint: `/api/productos/{codigo}/ventas-semanales`

**Tiempo:** 30 minutos
**Prioridad:** ALTA
**Para:** Gráfico de ventas en modal detalle

**Query PostgreSQL:**
```sql
WITH semanas AS (
    SELECT
        DATE_TRUNC('week', fecha_venta) as semana,
        SUM(cantidad_vendida) as unidades,
        SUM(venta_total) as valor,
        COUNT(DISTINCT DATE(fecha_venta)) as dias_con_venta
    FROM ventas
    WHERE producto_id = %s
        AND fecha_venta >= CURRENT_DATE - INTERVAL '52 weeks'
        {AND ubicacion_id = %s si aplica}
    GROUP BY DATE_TRUNC('week', fecha_venta)
    ORDER BY semana
)
SELECT
    TO_CHAR(semana, 'YYYY-WW') as semana,
    unidades,
    valor,
    unidades / NULLIF(dias_con_venta, 0) as promedio_diario,
    semana as fecha_inicio
FROM semanas
```

**Retornar:**
```json
{
    "codigo_producto": "000123",
    "ubicacion_id": "tienda_01",
    "semanas": [...],
    "metricas": {
        "semanas_con_ventas": 45,
        "total_unidades": 1200,
        "total_valor": 34500.50,
        "promedio_semanal": 26.7,
        "coeficiente_variacion": 0.42
    }
}
```

**Helper a usar:** `calculate_ventas_semanales_metricas()`

---

### 2. Migrar Endpoint: `/api/productos/{codigo}/detalle-completo`

**Tiempo:** 45 minutos
**Prioridad:** ALTA
**Para:** Modal detalle 360°

**Queries necesarios:**

**2.1. Info básica del producto**
```sql
SELECT
    id as codigo,
    nombre as descripcion,
    categoria,
    marca
FROM productos
WHERE id = %s
```

**2.2. Clasificaciones por tienda**
```sql
-- Usar helper calcular_abc_xyz_on_demand() por cada ubicación
-- O calcular todas juntas con GROUP BY ubicacion_id
```

**2.3. Inventario por ubicación**
```sql
SELECT
    ia.ubicacion_id,
    u.nombre as ubicacion_nombre,
    'tienda' as tipo_ubicacion,
    SUM(ia.cantidad) as cantidad_actual,
    MAX(ia.fecha_actualizacion) as ultima_actualizacion
FROM inventario_actual ia
JOIN ubicaciones u ON ia.ubicacion_id = u.id
WHERE ia.producto_id = %s
GROUP BY ia.ubicacion_id, u.nombre
```

**Retornar:**
```json
{
    "producto": {
        "codigo": "000123",
        "descripcion": "Producto X",
        "categoria": "Alimentos",
        "marca": "Marca Y"
    },
    "clasificaciones": [
        {
            "ubicacion_id": "tienda_01",
            "ubicacion_nombre": "Tienda Principal",
            "clasificacion_abc": "A",
            "clasificacion_xyz": "X",
            "matriz": "AX",
            "ranking_valor": 15,
            "valor_consumo": 12500.50,
            "coeficiente_variacion": 0.35
        }
    ],
    "inventarios": [...],
    "metricas_globales": {
        "total_inventario": 450.5,
        "ubicaciones_con_stock": 12,
        "ubicaciones_sin_stock": 4,
        "total_ubicaciones": 16
    }
}
```

---

### 3. Migrar Endpoint: `/api/productos/{codigo}/ventas-por-tienda`

**Tiempo:** 20 minutos
**Prioridad:** MEDIA
**Para:** Tabla ventas por ubicación en modal

**Query PostgreSQL:**
```sql
SELECT
    v.ubicacion_id,
    u.nombre as ubicacion_nombre,
    SUM(v.cantidad_vendida) as total_unidades,
    COUNT(DISTINCT v.numero_factura) as total_transacciones,
    MAX(v.fecha_venta) as ultima_venta
FROM ventas v
JOIN ubicaciones u ON v.ubicacion_id = u.id
WHERE v.producto_id = %s
    AND v.fecha_venta >= CURRENT_DATE - INTERVAL %s
GROUP BY v.ubicacion_id, u.nombre
ORDER BY total_unidades DESC
```

**Retornar:**
```json
{
    "codigo_producto": "000123",
    "periodo": "2m",
    "dias": 60,
    "ventas": [
        {
            "ubicacion_id": "tienda_01",
            "ubicacion_nombre": "Tienda Principal",
            "total_unidades": 450,
            "total_transacciones": 89,
            "ultima_venta": "2025-01-26"
        }
    ],
    "totales": {
        "total_unidades": 1200,
        "total_transacciones": 234,
        "tiendas_con_ventas": 12
    }
}
```

---

### 4. Stub Endpoint: `/api/productos/{codigo}/historico-clasificacion`

**Tiempo:** 10 minutos
**Prioridad:** BAJA
**Para:** Histórico clasificación ABC-XYZ (MVP retorna vacío)

**Implementación MVP:**
```python
@app.get("/api/productos/{codigo}/historico-clasificacion", tags=["Productos"])
async def get_historico_clasificacion(
    codigo: str,
    ubicacion_id: Optional[str] = None
):
    """
    Histórico de clasificación ABC-XYZ (MVP: stub)

    TODO v2: Implementar con tabla productos_abc_v2_historico
    """
    # Calcular clasificación ACTUAL
    # (usar helper calcular_abc_xyz_on_demand filtrado por producto)

    return {
        "codigo_producto": codigo,
        "ubicacion_id": ubicacion_id,
        "clasificacion_actual": {
            "abc": "A",  # Calculado
            "xyz": "X",  # Calculado
            "matriz": "AX",
            "ranking": 25,
            "cv": 0.42
        },
        "historico": [],  # Vacío en MVP
        "nota": "Histórico de clasificación estará disponible en próxima versión"
    }
```

---

## 🧪 Testing Post-Migración

### Test Manual Backend
```bash
# 1. Iniciar backend
cd backend
python3 start.py

# 2. Test endpoints
curl http://localhost:8001/api/productos/matriz-abc-xyz
curl http://localhost:8001/api/productos/lista-por-matriz?matriz=AX
curl http://localhost:8001/api/productos/000123/ventas-semanales
curl http://localhost:8001/api/productos/000123/detalle-completo
```

### Test Manual Frontend
```bash
# 1. Iniciar frontend
cd frontend
npm run dev

# 2. Navegar
open http://localhost:3001/productos

# 3. Verificar:
- [ ] Matriz ABC-XYZ carga (9 celdas)
- [ ] Filtro por tienda funciona
- [ ] Click celda → muestra productos
- [ ] Click producto → modal detalle abre
- [ ] Gráfico ventas semanales renderiza
- [ ] Tabla por tienda funciona
- [ ] Performance < 3s
```

---

## 📊 Orden de Implementación Recomendado

```
1. ventas-semanales (30 min)
   ├─ Necesario para gráfico en modal
   └─ Usa helper calculate_ventas_semanales_metricas()

2. ventas-por-tienda (20 min)
   ├─ Necesario para tabla en modal
   └─ Query simple, sin helpers

3. detalle-completo (45 min)
   ├─ Combina todo lo anterior
   └─ Requiere múltiples sub-queries

4. historico-clasificacion (10 min)
   └─ Stub simple, retorna vacío

Total: 1h 45min
```

---

## 🔍 Verificación de Completitud

**Cuando hayas terminado, verifica:**

```bash
# Backend: 9 endpoints de productos
grep -n "@app.get.*productos" backend/main.py | wc -l
# Expected: 9

# Frontend: Sin cambios necesarios
git status frontend/src/components/productos/
# Expected: no changes

# Tests manuales: Todos los checkboxes ✅
```

---

## 📦 Commit Final

```bash
git add -A
git commit -m "feat(productos): completar migración ABC-XYZ a PostgreSQL v2.0

- ✅ Migrados 9/9 endpoints de productos
- ✅ Modal detalle 100% funcional
- ✅ Performance < 3s en todos los endpoints
- ✅ Testing manual completado

Sección /productos totalmente operativa en PostgreSQL v2.0

Ver: RESUMEN_TRABAJO_PRODUCTOS.md
"
```

---

## 💡 Tips de Implementación

1. **Reutilizar helpers:**
   - `calcular_abc_xyz_on_demand()` para clasificaciones
   - `calculate_ventas_semanales_metricas()` para métricas CV

2. **Conversión de tipos:**
   - Siempre convertir `Decimal` → `float` en respuestas
   - Usar `int()` para counts

3. **Manejo de períodos:**
   ```python
   periodos = {
       "1w": "1 week",
       "2w": "2 weeks",
       "1m": "1 month",
       "2m": "2 months",
       "3m": "3 months",
       "6m": "6 months"
   }
   interval = periodos.get(periodo, "1 month")
   ```

4. **Ubicación opcional:**
   ```python
   ubicacion_filter = ""
   params = []
   if ubicacion_id:
       ubicacion_filter = "AND v.ubicacion_id = %s"
       params.append(ubicacion_id)
   ```

---

## 🎯 Criterios de Éxito

- [x] Matriz ABC-XYZ muestra 9 celdas con datos
- [ ] Click en celda muestra lista de productos
- [ ] Click en producto abre modal detalle
- [ ] Gráfico de ventas semanales renderiza
- [ ] Tabla de ventas por tienda funciona
- [ ] Filtro por ubicación global funciona
- [ ] Performance < 3 segundos
- [ ] No hay errores en consola del navegador

---

**🚀 Una vez completado, la sección Productos estará 100% migrada a PostgreSQL v2.0!**
