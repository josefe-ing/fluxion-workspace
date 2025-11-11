# Integración XYZ en Frontend

## Resumen

Sistema ABC-XYZ completamente integrado en el frontend con clasificación por tienda.

## Cambios Implementados

### 1. Backend API (`backend/routers/abc_v2_router.py`)

**Modelo actualizado**:
```python
class ClasificacionABCv2(BaseModel):
    # ... campos ABC v2 existentes ...

    # Campos XYZ (variabilidad de demanda)
    clasificacion_xyz: Optional[str] = None              # X, Y, Z
    matriz_abc_xyz: Optional[str] = None                 # AX, AY, AZ, BX, etc.
    coeficiente_variacion: Optional[float] = None        # CV = StdDev / Mean
    demanda_promedio_semanal: Optional[float] = None     # Promedio semanal
    desviacion_estandar_semanal: Optional[float] = None  # Desviación estándar
    semanas_con_venta: Optional[int] = None              # Semanas con ventas
    confiabilidad_calculo: Optional[str] = None          # ALTA, MEDIA, BAJA
    es_extremadamente_volatil: Optional[bool] = None     # CV > 2.0
```

**Endpoints actualizados**:
- `GET /api/abc-v2/producto/{codigo}?ubicacion_id=tienda_01` - Con campos XYZ
- `GET /api/abc-v2/productos?ubicacion_id=tienda_01&codigos=...` - Batch con XYZ

### 2. Servicio Frontend (`frontend/src/services/abcV2Service.ts`)

**Interfaz extendida**:
```typescript
export interface ClasificacionABCv2 {
  // ... campos existentes ...

  // Campos XYZ
  clasificacion_xyz?: string;
  matriz_abc_xyz?: string;
  coeficiente_variacion?: number;
  demanda_promedio_semanal?: number;
  desviacion_estandar_semanal?: number;
  semanas_con_venta?: number;
  confiabilidad_calculo?: string;
  es_extremadamente_volatil?: boolean;
}
```

**Funciones de utilidad agregadas**:
- `getColorClasificacionXYZ(clasificacion)` - Colores para X/Y/Z
- `getColorMatrizABCXYZ(matriz)` - Colores para AX, AZ, etc.
- `getDescripcionXYZ(clasificacion)` - Descripciones textuales
- `getEstrategiaMatriz(matriz)` - Estrategias recomendadas

**Soporte de ubicación**:
```typescript
// Todas las funciones ahora aceptan ubicacionId opcional
getClasificacionProducto(codigo, ubicacionId?)
getClasificacionesPorCodigos(codigos, ubicacionId?)
getClasificacionesProductos(codigos?, clasificacion?, ubicacionId?, limit?)
```

### 3. Tabla de Productos (`OrderStepTwo.tsx`)

**Nueva columna XYZ agregada**:

| Columna | Muestra | Descripción |
|---------|---------|-------------|
| ABC v2 💰 | A, B, C | Clasificación por valor económico |
| XYZ 📊 | AX, AZ, BY | Matriz combinada ABC-XYZ |

**Características de la columna XYZ**:
- Muestra la **matriz combinada** (ej: AX, BZ) en vez de solo X/Y/Z
- Colores según clasificación:
  - **Verde** (X): Demanda estable
  - **Amarillo** (Y): Demanda variable
  - **Rojo** (Z): Demanda errática
- Indicador ⚡ para productos extremadamente volátiles (CV > 2.0)
- Tooltip con descripción detallada y coeficiente de variación

**Ejemplo visual**:
```
ABC v2 | XYZ
-------+-----
  A    | AX ✓  (Alto valor, estable - IDEAL)
  A    | AZ ⚡  (Alto valor, errático - CRÍTICO)
  B    | BY     (Medio valor, variable)
  C    | CX     (Bajo valor, estable)
```

**Carga de datos por tienda**:
```typescript
const cargarClasificacionesABCv2 = async (codigosProductos: string[]) => {
  const clasificaciones = await getClasificacionesPorCodigos(
    codigosProductos,
    orderData.tienda_destino  // 👈 Clasificación LOCAL de la tienda
  );
};
```

### 4. Modal de Comparación ABC (`ABCComparisonModal.tsx`)

**Nueva sección XYZ agregada**:

Después de las secciones "ABC v1 (Velocidad)" y "ABC v2 (Valor)", ahora aparece:

#### **XYZ - Variabilidad 📊**

Muestra:

**Grid superior (2 columnas)**:
1. **Clasificación XYZ**
   - Letra grande: X, Y o Z
   - Descripción: "Demanda estable y predecible (CV < 0.5)"
   - Icono ⚡ si es extremadamente volátil

2. **Matriz ABC-XYZ**
   - Combinación: AX, AZ, BY, etc.
   - Estrategia recomendada: "Stock alto, reposición automática"

**Métricas de variabilidad (3 columnas)**:
- Coeficiente de Variación (CV)
- Demanda Promedio/Semana
- Confiabilidad del cálculo

**Interpretaciones contextuales**:

Para productos **AZ** (críticos):
```
🔥 PRODUCTO CRÍTICO - ALTO VALOR + DEMANDA ERRÁTICA
• Genera mucho valor pero su demanda es impredecible
• Requiere monitoreo constante para evitar quiebres
• Considerar aumentar stock de seguridad
• Revisar factores que afectan la variabilidad
```

Para productos **AX** (ideales):
```
✓ PRODUCTO IDEAL - ALTO VALOR + DEMANDA ESTABLE
• Fácil de planificar gracias a su demanda predecible
• Candidato para reposición automática
• Mantener stock alto para aprovechar su rotación
• Bajo riesgo de obsolescencia
```

## Casos de Uso

### Caso 1: Producto Ideal (AX)

**Producto**: 003289 (HUEVOS) en tienda_01

```json
{
  "codigo_producto": "003289",
  "clasificacion_abc_valor": "A",
  "clasificacion_xyz": "X",
  "matriz_abc_xyz": "AX",
  "coeficiente_variacion": 0.2475,
  "demanda_promedio_semanal": 6537.6,
  "confiabilidad_calculo": "ALTA"
}
```

**Interpretación**:
- ✅ Alto valor económico (A)
- ✅ Demanda estable y predecible (X)
- **Estrategia**: Stock alto, reposición automática

### Caso 2: Producto Crítico (AZ)

**Producto**: 003164 en tienda_13

```json
{
  "codigo_producto": "003164",
  "clasificacion_abc_valor": "A",
  "clasificacion_xyz": "Z",
  "matriz_abc_xyz": "AZ",
  "coeficiente_variacion": 1.5179,
  "demanda_promedio_semanal": 2628.33,
  "confiabilidad_calculo": "ALTA",
  "es_extremadamente_volatil": false
}
```

**Interpretación**:
- ⚠️ Alto valor económico (A)
- 🔥 Demanda errática e impredecible (Z)
- **Estrategia**: Atención especial, monitoreo constante, stock de seguridad alto

### Caso 3: Mismo Producto, Diferentes Tiendas

**Producto 003164 en diferentes ubicaciones**:

| Tienda    | ABC | XYZ | Matriz | CV     | Estrategia |
|-----------|-----|-----|--------|--------|------------|
| tienda_13 | A   | Z   | **AZ** | 1.5179 | 🔥 Crítico |
| tienda_09 | B   | X   | **BX** | 0.3165 | ✓ Normal   |
| tienda_05 | C   | X   | **CX** | 0.3731 | Stock min  |

**Conclusión**: Mismo producto requiere estrategias completamente diferentes según la tienda.

## Matriz ABC-XYZ: Estrategias

| Matriz | Descripción | Estrategia Recomendada |
|--------|-------------|------------------------|
| **AX** | Alto valor + Estable | Stock alto, reposición automática |
| **AY** | Alto valor + Variable | Monitoreo semanal, stock medio |
| **AZ** | Alto valor + Errático | 🔥 CRÍTICO - Atención especial |
| **BX** | Medio valor + Estable | Stock medio, reposición programada |
| **BY** | Medio valor + Variable | Monitoreo quincenal |
| **BZ** | Medio valor + Errático | Stock bajo, revisar demanda |
| **CX** | Bajo valor + Estable | Stock mínimo |
| **CY** | Bajo valor + Variable | Stock bajo o descontinuar |
| **CZ** | Bajo valor + Errático | Candidato a descontinuación |

## Indicadores Visuales

### En la Tabla

**Columna XYZ**:
- Fondo azul claro (`bg-blue-50`)
- Texto coloreado según XYZ:
  - **Verde** (X): `text-green-700 font-semibold`
  - **Amarillo** (Y): `text-yellow-700 font-semibold`
  - **Rojo** (Z): `text-red-700 font-bold`
- Icono ⚡ para productos extremadamente volátiles

### En el Modal

**Sección XYZ**:
- Fondo: `bg-blue-50 border-2 border-blue-300`
- Clasificación XYZ con colores según letra
- Matriz ABC-XYZ con colores especiales:
  - **AZ**: `text-red-900 bg-red-100 border-red-400 font-bold`
  - **AX**: `text-green-800 bg-green-100 border-green-400 font-semibold`

**Alertas contextuales**:
- Productos AZ: Banner rojo con 🔥
- Productos AX: Banner verde con ✓

## Flujo de Datos

```
1. Usuario abre orden para tienda_01
2. OrderStepTwo carga productos
3. cargarClasificacionesABCv2(productos, 'tienda_01')
4. API: GET /api/abc-v2/productos?ubicacion_id=tienda_01&codigos=...
5. Backend consulta productos_abc_v2 WHERE ubicacion_id = 'tienda_01'
6. Frontend recibe datos con campos ABC v2 + XYZ
7. Tabla muestra columnas ABC v2 y XYZ
8. Usuario hace clic en producto → ABCComparisonModal
9. Modal carga clasificación con ubicacionId
10. Muestra secciones ABC v1, ABC v2 y XYZ con interpretaciones
```

## Verificación

### Tests de API

```bash
# Producto ideal (AX)
curl "http://localhost:8001/api/abc-v2/producto/003289?ubicacion_id=tienda_01"

# Producto crítico (AZ)
curl "http://localhost:8001/api/abc-v2/producto/003164?ubicacion_id=tienda_13"

# Productos múltiples
curl "http://localhost:8001/api/abc-v2/productos?ubicacion_id=tienda_01&codigos=003289,003164&limit=10"
```

### Verificación Visual

1. Abrir frontend: http://localhost:3001
2. Crear nueva orden para tienda_01
3. Verificar columna XYZ visible en tabla
4. Buscar producto 003289 (HUEVOS)
5. Verificar muestra "AX" en verde
6. Hacer clic en celda ABC v2
7. Verificar modal muestra sección XYZ
8. Verificar mensaje "PRODUCTO IDEAL"

## Métricas del Sistema

**Datos en DB**:
- Total registros: 31,773 (productos × tiendas)
- Con XYZ: 28,968 (91.2%)
- Productos críticos (AZ): 171
- Productos ideales (AX): 1,843

**Cobertura**:
- 16 tiendas procesadas
- 1,576 - 2,366 productos por tienda
- Análisis: últimos 3 meses (ABC) + últimas 12 semanas (XYZ)

## Próximos Pasos

### Implementado ✅
- [x] Backend devuelve campos XYZ
- [x] Servicio frontend con soporte de ubicación
- [x] Columna XYZ en tabla de productos
- [x] Sección XYZ en modal de comparación
- [x] Interpretaciones contextuales (AZ, AX)
- [x] Indicadores visuales (colores, iconos)

### Pendiente ⏳
- [ ] Dashboard de productos críticos (AZ) por tienda
- [ ] Filtros por matriz ABC-XYZ
- [ ] Alertas automáticas para productos AZ
- [ ] Gráfico de dispersión valor vs variabilidad
- [ ] Exportar reporte de matriz completa
- [ ] Comparativa multi-tienda para mismo producto
- [ ] Evolución temporal de CV por producto

## Documentación Técnica

- **Backend**: [backend/routers/abc_v2_router.py](backend/routers/abc_v2_router.py)
- **Servicio**: [frontend/src/services/abcV2Service.ts](frontend/src/services/abcV2Service.ts)
- **Tabla**: [frontend/src/components/orders/OrderStepTwo.tsx](frontend/src/components/orders/OrderStepTwo.tsx)
- **Modal**: [frontend/src/components/orders/ABCComparisonModal.tsx](frontend/src/components/orders/ABCComparisonModal.tsx)
- **Cálculos**: [database/calcular_abc_v2_por_tienda.py](database/calcular_abc_v2_por_tienda.py), [database/calcular_xyz_por_tienda.py](database/calcular_xyz_por_tienda.py)

---

**Fecha**: 2025-11-10
**Versión**: 1.0 - Integración XYZ Frontend
**Estado**: ✅ Completado y funcionando
