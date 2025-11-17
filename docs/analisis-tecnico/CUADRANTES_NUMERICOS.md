# Actualización: Filtro de Cuadrantes Numéricos

**Fecha**: 2025-11-13
**Sistema**: Pedido Sugerido v2.0 (Nivel Objetivo)

## Cambio Realizado

Se corrigió el filtro de cuadrantes para usar **cuadrantes numéricos** (I, II, III, IV, V, VI, VII, VIII, IX, X, XI, XII) en lugar de los cuadrantes ABC-XYZ (AX, AY, AZ, etc.).

## Cuadrantes del Sistema

Los cuadrantes provienen del campo `cuadrante_producto` de la tabla `ventas_raw`:

```sql
SELECT DISTINCT cuadrante_producto, COUNT(*) as total
FROM ventas_raw
GROUP BY cuadrante_producto
ORDER BY cuadrante_producto;
```

**Resultado**:
- **CUADRANTE I**: 16.9M registros
- **CUADRANTE II**: 8.5M registros
- **CUADRANTE III**: 6.8M registros
- **CUADRANTE IV**: 4.5M registros
- **CUADRANTE V**: 1.1M registros
- **CUADRANTE VI**: 7.0M registros
- **CUADRANTE VII**: 3.6M registros
- **CUADRANTE VIII**: 2.4M registros
- **CUADRANTE IX**: 3.1M registros
- **CUADRANTE X**: 669K registros
- **CUADRANTE XI**: 833 registros
- **CUADRANTE XII**: 288K registros
- **NO ESPECIFICADO**: 143 registros

## Cambios Implementados

### Backend

**Archivo**: [`backend/routers/nivel_objetivo_router.py`](backend/routers/nivel_objetivo_router.py)

1. **Modelo ProductoNivelObjetivo** (línea 64):
```python
class ProductoNivelObjetivo(BaseModel):
    # Identificación
    producto_id: str
    nombre_producto: str
    matriz_abc_xyz: str
    cuadrante: str = "NO ESPECIFICADO"  # Cuadrante numérico (I, II, III, etc.)
    # ...
```

2. **Query de listado** (línea 414):
```sql
SELECT DISTINCT
    p.codigo_producto,
    MAX(v.descripcion_producto) as nombre_producto,
    p.matriz_abc_xyz,
    COALESCE(MAX(v.cuadrante_producto), 'NO ESPECIFICADO') as cuadrante,  -- ✅ Agregado
    MAX(p.demanda_promedio_semanal) as demanda_promedio_semanal,
    -- ...
FROM productos_abc_v2 p
LEFT JOIN ventas_raw v ON p.codigo_producto = v.codigo_producto
    AND p.ubicacion_id = v.ubicacion_id
-- ...
```

3. **Procesamiento de resultados** (líneas 449-452):
```python
producto_id = row[0]
nombre = row[1]
matriz = row[2]
cuadrante = row[3]  # Cuadrante numérico (I, II, III, etc.)
stock_actual = float(row[6])  # Índice actualizado
# ...
```

4. **Construcción del modelo** (línea 500):
```python
productos.append(ProductoNivelObjetivo(
    producto_id=producto_id,
    nombre_producto=nombre,
    matriz_abc_xyz=matriz,
    cuadrante=cuadrante,  # ✅ Agregado
    # ...
))
```

### Frontend

#### 1. Service Layer

**Archivo**: [`frontend/src/services/nivelObjetivoService.ts`](frontend/src/services/nivelObjetivoService.ts:46)

```typescript
export interface ProductoNivelObjetivo {
  // Identificación
  producto_id: string;
  nombre_producto: string;
  matriz_abc_xyz: string;
  cuadrante: string;  // ✅ Agregado
  // ...
}
```

#### 2. Wizard Interface

**Archivo**: [`frontend/src/components/orders/PedidoSugeridoV2Wizard.tsx`](frontend/src/components/orders/PedidoSugeridoV2Wizard.tsx:28)

```typescript
export interface ProductoSeleccionado {
  // Identificación
  producto_id: string;
  nombre_producto: string;
  matriz_abc_xyz: string;
  cuadrante: string;  // ✅ Agregado
  // ...
}
```

#### 3. Componente de Selección

**Archivo**: [`frontend/src/components/orders/wizard-v2/PasoSeleccionProductosV2Extended.tsx`](frontend/src/components/orders/wizard-v2/PasoSeleccionProductosV2Extended.tsx)

**a) Lógica de filtrado** (líneas 93-105):
```typescript
// Filtro por cuadrante numérico específico (I, II, III, etc.)
if (filtroCuadrante) {
  filtrados = filtrados.filter(p => p.cuadrante === filtroCuadrante);
}

// Filtros ABC y XYZ independientes (no se limpian cuando hay cuadrante)
if (filtroABC) {
  filtrados = filtrados.filter(p => p.matriz_abc_xyz.startsWith(filtroABC));
}

if (filtroXYZ) {
  filtrados = filtrados.filter(p => p.matriz_abc_xyz.endsWith(filtroXYZ));
}
```

**b) Mapeo de productos seleccionados** (línea 145):
```typescript
return {
  producto_id: producto.producto_id,
  nombre_producto: producto.nombre_producto,
  matriz_abc_xyz: producto.matriz_abc_xyz,
  cuadrante: producto.cuadrante,  // ✅ Agregado
  // ...
};
```

**c) Dropdown de filtro** (líneas 271-303):
```tsx
{/* Filtro por Cuadrante numérico */}
<div className="border-l-2 border-gray-300 pl-4">
  <select
    value={filtroCuadrante}
    onChange={(e) => setFiltroCuadrante(e.target.value)}
    className="px-3 py-1.5 border-2 border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-indigo-50"
  >
    <option value="">Todos ({productos.length})</option>
    {(() => {
      // Contar productos por cuadrante dinámicamente
      const cuadranteCounts = productos.reduce((acc, p) => {
        acc[p.cuadrante] = (acc[p.cuadrante] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Lista ordenada de cuadrantes
      const cuadrantes = [
        'CUADRANTE I', 'CUADRANTE II', 'CUADRANTE III', 'CUADRANTE IV',
        'CUADRANTE V', 'CUADRANTE VI', 'CUADRANTE VII', 'CUADRANTE VIII',
        'CUADRANTE IX', 'CUADRANTE X', 'CUADRANTE XI', 'CUADRANTE XII',
        'NO ESPECIFICADO'
      ];

      // Mostrar solo cuadrantes con productos
      return cuadrantes
        .filter(cuad => cuadranteCounts[cuad] > 0)
        .map(cuad => (
          <option key={cuad} value={cuad}>
            {cuad} ({cuadranteCounts[cuad]})
          </option>
        ));
    })()}
  </select>
</div>
```

## Características del Filtro

### 1. **Conteo Dinámico**
El dropdown muestra automáticamente cuántos productos hay en cada cuadrante:
```
CUADRANTE I (187)
CUADRANTE II (430)
CUADRANTE III (350)
...
```

### 2. **Solo Cuadrantes Activos**
Solo se muestran cuadrantes que tienen productos (filtrados con `filter(cuad => cuadranteCounts[cuad] > 0)`).

### 3. **Filtros Combinables**
Los filtros se pueden combinar:
- **Cuadrante + ABC**: Ej. CUADRANTE VI + Clase A → Productos AX, AY, AZ del Cuadrante VI
- **Cuadrante + XYZ**: Ej. CUADRANTE II + X → Productos AX, BX, CX del Cuadrante II
- **Cuadrante + ABC + XYZ**: Ej. CUADRANTE IV + A + X → Solo productos AX del Cuadrante IV

### 4. **Búsqueda y Déficit**
El filtro de cuadrante se combina con:
- ✅ Búsqueda por texto (código o nombre de producto)
- ✅ Filtro "Solo con Déficit"
- ✅ Filtros ABC y XYZ

## Distribución por Cuadrante (Ejemplo: tienda_01)

```
Total productos: 1,880

CUADRANTE I          :  187 productos (10.0%)
CUADRANTE II         :  430 productos (22.9%)
CUADRANTE III        :  350 productos (18.6%)
CUADRANTE IV         :  434 productos (23.1%)
CUADRANTE V          :  155 productos ( 8.2%)
CUADRANTE VI         :  137 productos ( 7.3%)
CUADRANTE VII        :   25 productos ( 1.3%)
CUADRANTE VIII       :    2 productos ( 0.1%)
CUADRANTE IX         :   89 productos ( 4.7%)
CUADRANTE X          :   67 productos ( 3.6%)
CUADRANTE XI         :    1 productos ( 0.1%)
CUADRANTE XII        :    2 productos ( 0.1%)
NO ESPECIFICADO      :    1 productos ( 0.1%)
```

## Testing

### Backend
```bash
# Verificar que devuelve campo cuadrante
curl -s "http://localhost:8001/api/niveles-inventario/tienda/tienda_01?limite=5" \
  | python3 -m json.tool \
  | grep -E "(producto_id|matriz_abc_xyz|cuadrante)"

# Resultado esperado:
# "producto_id": "000072"
# "matriz_abc_xyz": "AX"
# "cuadrante": "CUADRANTE VI"
```

### Frontend
1. Abrir wizard: Dashboard → "Crear Pedido v2.0"
2. Paso 1: Seleccionar CEDI y Tienda → Siguiente
3. Paso 2: Verificar filtros
   - **Dropdown visible** con lista de cuadrantes
   - **Contadores dinámicos** (ej: "CUADRANTE II (430)")
   - **Filtrado funcional**: Seleccionar cuadrante y verificar tabla

### Filtros Combinados
```
Escenario 1: Solo Cuadrante VI
- Seleccionar "CUADRANTE VI"
- Resultado: 137 productos del Cuadrante VI (todas las matrices)

Escenario 2: Cuadrante VI + Clase A
- Seleccionar "CUADRANTE VI"
- Seleccionar "Clase A"
- Resultado: Solo productos AX, AY, AZ del Cuadrante VI

Escenario 3: Cuadrante II + Clase A + X (Estable)
- Seleccionar "CUADRANTE II"
- Seleccionar "Clase A"
- Seleccionar "X (Estable)"
- Resultado: Solo productos AX del Cuadrante II
```

## Diferencia con Sistema Anterior

### ❌ Antes (Incorrecto)
- Filtro por **cuadrantes ABC-XYZ**: AX, AY, AZ, BX, BY, BZ, CX, CY, CZ
- Estos cuadrantes NO existen en la base de datos
- Era filtrado por matriz, no por cuadrante

### ✅ Ahora (Correcto)
- Filtro por **cuadrantes numéricos**: I, II, III, IV, V, VI, VII, VIII, IX, X, XI, XII
- Campo real: `ventas_raw.cuadrante_producto`
- Filtros separados e independientes:
  - **Cuadrante**: I-XII (categorización de negocio)
  - **Matriz ABC**: A, B, C (valor económico)
  - **Matriz XYZ**: X, Y, Z (variabilidad de demanda)

## Relación: Cuadrante vs Matriz

Ambos campos son **independientes**:

| Campo | Origen | Valores | Propósito |
|-------|--------|---------|-----------|
| `matriz_abc_xyz` | `productos_abc_v2` | AX, AY, AZ, BX, BY, BZ, CX, CY, CZ | Clasificación por **valor** y **variabilidad** |
| `cuadrante` | `ventas_raw` | I-XII, NO ESPECIFICADO | Clasificación de **negocio/categoría** |

**Ejemplo**:
- Producto: JAMON COCIDO DE PIERNA DRAGOS KG
- `matriz_abc_xyz`: **AX** (Alto valor, Estable)
- `cuadrante`: **CUADRANTE VI** (Categoría de negocio)

## Resultado Final

✅ **Filtro de cuadrantes funcional** con valores correctos (I-XII)
✅ **Contadores dinámicos** mostrando cantidad de productos
✅ **Filtros combinables** (cuadrante + ABC + XYZ)
✅ **Backend y frontend sincronizados** con mismo campo
✅ **Performance óptima** usando LEFT JOIN con ventas_raw

---

**Última actualización**: 2025-11-13
**Autor**: Claude Code
**Estado**: ✅ Implementado y funcional
