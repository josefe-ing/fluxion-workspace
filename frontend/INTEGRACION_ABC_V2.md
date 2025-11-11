# Integración ABC v2 en Pedidos Sugeridos

## 📋 Resumen

Agregar columna "ABC v2 (Valor)" en la tabla de pedidos sugeridos para mostrar clasificación basada en valor económico, complementando la clasificación ABC v1 (velocidad).

---

## 🎯 Resultado Final

La tabla tendrá:
- **Columna ABC v1** (velocidad): Mantiene la clasificación actual
- **Columna ABC v2** (valor): Nueva columna con clasificación económica
- **Indicador**: ⚠️/🔥/✓ para discrepancias
- **Modal mejorado**: Comparación lado a lado de ambas clasificaciones

---

## 🔧 Paso 1: Modificar OrderStepTwo.tsx

### 1.1 Importar servicio y modal

Agregar en la parte superior del archivo (después de los imports existentes):

```typescript
// Agregar estos imports
import {
  getClasificacionesPorCodigos,
  ClasificacionABCv2,
  getIconoDiscrepancia
} from '../../services/abcV2Service';
import ABCComparisonModal from './ABCComparisonModal';
```

### 1.2 Agregar estado para clasificaciones ABC v2

Dentro del componente, agregar nuevo estado:

```typescript
// Agregar después de los otros estados
const [clasificacionesV2, setClasificacionesV2] = useState<Map<string, ClasificacionABCv2>>(new Map());
```

### 1.3 Cargar clasificaciones ABC v2

Agregar función para cargar las clasificaciones:

```typescript
// Agregar esta función dentro del componente
const cargarClasificacionesABCv2 = async (codigosProductos: string[]) => {
  try {
    const clasificaciones = await getClasificacionesPorCodigos(codigosProductos);
    setClasificacionesV2(clasificaciones);
  } catch (error) {
    console.warn('ABC v2 no disponible:', error);
    // No es crítico, continuar sin ABC v2
  }
};
```

### 1.4 Llamar la función al cargar productos

Modificar `useEffect` que carga productos:

```typescript
// Modificar el useEffect existente que carga productos
useEffect(() => {
  if (orderData.cedi_origen && orderData.tienda_destino) {
    cargarStockParams();
    cargarProductosSugeridos();

    // AGREGAR ESTA LÍNEA:
    // Cargar clasificaciones ABC v2 después de tener los productos
    if (productos.length > 0) {
      const codigos = productos.map(p => p.codigo_producto);
      cargarClasificacionesABCv2(codigos);
    }
  }
}, [orderData.cedi_origen, orderData.tienda_destino, productos.length]);
```

### 1.5 Agregar columna en el header de la tabla

En la sección del `<thead>`, después de la columna ABC existente (línea ~843), agregar:

```typescript
{/* Columna ABC v1 existente */}
<SortableHeader field="abc" label="ABC" bgColor="bg-orange-100" width="40px" />

{/* NUEVA: Columna ABC v2 (Valor) */}
<th className="bg-emerald-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '45px' }}>
  <div className="flex flex-col items-center gap-0.5">
    <span>ABC</span>
    <span className="text-[8px] text-emerald-700">v2 💰</span>
  </div>
</th>
```

### 1.6 Agregar celda en el body de la tabla

En la sección del `<tbody>`, después de la celda ABC existente (línea ~963), agregar:

```typescript
{/* Celda ABC v1 existente */}
<td
  onClick={() => handleABCClick(producto)}
  className="bg-orange-50 px-2 py-1 text-center cursor-pointer hover:bg-orange-100 transition-colors"
  style={{ width: '40px' }}
  title="Ver clasificación ABC"
>
  {/* ... código existente ... */}
</td>

{/* NUEVA: Celda ABC v2 (Valor) */}
<td
  onClick={() => handleABCClick(producto)}
  className="bg-emerald-50 px-2 py-1 text-center cursor-pointer hover:bg-emerald-100 transition-colors"
  style={{ width: '45px' }}
  title="ABC v2 basado en valor económico"
>
  {(() => {
    const claseV2 = clasificacionesV2.get(producto.codigo_producto);
    if (!claseV2) {
      return <span className="text-gray-400 text-[10px]">-</span>;
    }

    const icono = getIconoDiscrepancia(claseV2);
    let colorClase = '';

    if (claseV2.clasificacion_abc_valor === 'A') {
      colorClase = 'text-red-700 font-bold';
    } else if (claseV2.clasificacion_abc_valor === 'B') {
      colorClase = 'text-yellow-700 font-semibold';
    } else if (claseV2.clasificacion_abc_valor === 'C') {
      colorClase = 'text-gray-600 font-medium';
    }

    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className={`text-[11px] ${colorClase}`}>
          {claseV2.clasificacion_abc_valor}
        </span>
        {claseV2.tiene_discrepancia && (
          <span className="text-[10px]" title={claseV2.tipo_discrepancia}>
            {icono}
          </span>
        )}
      </div>
    );
  })()}
</td>
```

### 1.7 Cambiar el modal ABC por el nuevo comparativo

Buscar donde se renderiza `<ABCClassificationModal>` y reemplazarlo:

```typescript
{/* REEMPLAZAR ESTO: */}
<ABCClassificationModal
  isOpen={selectedProductoABC !== null}
  onClose={() => setSelectedProductoABC(null)}
  producto={selectedProductoABC || { /* ... */ }}
/>

{/* POR ESTO: */}
<ABCComparisonModal
  isOpen={selectedProductoABC !== null}
  onClose={() => setSelectedProductoABC(null)}
  producto={selectedProductoABC || { /* ... */ }}
/>
```

---

## 🚀 Paso 2: Iniciar el Backend con el Nuevo Endpoint

```bash
# En backend/
cd backend
python3 start.py

# O si ya está corriendo, reiniciar
pkill -f "python.*start.py" && python3 start.py
```

El endpoint estará disponible en:
- `GET /api/abc-v2/resumen`
- `GET /api/abc-v2/producto/{codigo}`
- `GET /api/abc-v2/productos`

---

## 📊 Paso 3: Verificar que Funciona

### 3.1 Verificar endpoint

```bash
# Probar endpoint
curl http://localhost:8001/api/abc-v2/resumen

# Debe devolver algo como:
# {
#   "total_productos": 3134,
#   "productos_a": 176,
#   "productos_b": 602,
#   "productos_c": 2340,
#   "valor_total": 23624064.85,
#   "porcentaje_valor_a": 79.98,
#   "cumple_pareto": true,
#   "fecha_calculo": "2025-11-10 ..."
# }
```

### 3.2 Verificar en el frontend

1. Ir a `/pedidos-sugeridos/nuevo`
2. Seleccionar CEDI y Tienda
3. Avanzar a Paso 2
4. Ver que aparece la nueva columna "ABC v2 💰"
5. Los productos con discrepancia mostrarán ⚠️ o 🔥
6. Hacer clic en cualquier celda ABC para ver el modal comparativo

---

## 🎨 Interpretación de Iconos

| Icono | Significado | Acción |
|-------|-------------|--------|
| ✓ | Coherente (velocidad ≈ valor) | Normal |
| ⚠️ | Alta velocidad, bajo valor | Revisar márgenes |
| 🔥 | Baja velocidad, alto valor | **¡CRÍTICO! Priorizar** |
| ~ | Discrepancia moderada | Monitorear |

---

## 🔍 Casos de Uso Específicos

### Caso 1: Producto con 🔥 (Baja velocidad, alto valor)

**Ejemplo**: Whisky Premium
- ABC v1 (velocidad): C (1 bulto/semana)
- ABC v2 (valor): A ($50,000/mes)
- **Acción**: Aunque venda poco, genera mucho valor. **Nunca debe faltar.**

### Caso 2: Producto con ⚠️ (Alta velocidad, bajo valor)

**Ejemplo**: Sal de mesa
- ABC v1 (velocidad): A (100 bultos/día)
- ABC v2 (valor): C ($500/mes)
- **Acción**: Alto volumen pero poco valor. No sobre-invertir en stock.

### Caso 3: Producto con ✓ (Coherente)

**Ejemplo**: Arroz
- ABC v1 (velocidad): A (50 bultos/día)
- ABC v2 (valor): A ($20,000/mes)
- **Acción**: Alta prioridad en ambos. Mantener disponibilidad máxima.

---

## 🐛 Troubleshooting

### Error: "ABC v2 no disponible"

**Causa**: No se ha ejecutado el cálculo ABC v2.

**Solución**:
```bash
cd database
python3 calcular_abc_v2_adaptado.py --crear-tablas --verbose
```

### Columna aparece vacía (guiones -)

**Causa**: Los productos no están en la tabla `productos_abc_v2`.

**Verificar**:
```bash
python3 -c "
import duckdb
conn = duckdb.connect('data/fluxion_production.db')
count = conn.execute('SELECT COUNT(*) FROM productos_abc_v2').fetchone()[0]
print(f'Productos en ABC v2: {count}')
conn.close()
"
```

### Modal no muestra ABC v2

**Causa**: Error en la API o falta ejecutar cálculo.

**Verificar**:
1. Abrir DevTools (F12)
2. Ver Console para errores
3. Ver Network tab para verificar llamadas a `/api/abc-v2/*`

---

## 📝 Notas Adicionales

- **Performance**: La carga de clasificaciones ABC v2 es asíncrona y no bloquea la UI
- **Cache**: Los datos se cachean en el estado del componente
- **Fallback**: Si ABC v2 no está disponible, muestra "-" sin romper la funcionalidad
- **Compatibilidad**: El ABC v1 (velocidad) se mantiene intacto

---

## ✅ Checklist de Implementación

- [ ] Agregar imports en OrderStepTwo.tsx
- [ ] Agregar estado `clasificacionesV2`
- [ ] Agregar función `cargarClasificacionesABCv2`
- [ ] Modificar useEffect para cargar clasificaciones
- [ ] Agregar columna en header de tabla
- [ ] Agregar celda en body de tabla
- [ ] Reemplazar modal ABC por ABCComparisonModal
- [ ] Reiniciar backend
- [ ] Verificar que el endpoint funciona
- [ ] Probar en el frontend
- [ ] Verificar que los iconos se muestran correctamente
- [ ] Probar modal comparativo

---

**¿Necesitas ayuda con algún paso?** Puedo ayudarte a implementar cualquier parte específica.
