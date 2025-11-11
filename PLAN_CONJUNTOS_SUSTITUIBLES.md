# Plan: Conjuntos Sustituibles (Pronóstico Jerárquico)

**Fecha**: 2025-11-11
**Estado**: Planificación
**Prioridad**: Alta

---

## 🎯 Problema a Resolver

### El Problema del Azúcar (Caso Real)

**Situación actual**:
- Vendemos 3 marcas de azúcar blanca 1kg
- Total: 60 bultos diarios (Marca A=30, Marca B=20, Marca C=10)
- Cuando falta una marca, el cliente toma otra
- **El cliente vino a comprar "azúcar blanca", no una marca específica**

**Problema con pronóstico individual**:
```
❌ Si falta Marca A en CD:
   - Sistema pronostica 0 unidades de Marca A
   - Resultado: Perdemos 30 bultos de ventas diarias
   - Cliente se va sin comprar o compra en competencia
```

**Solución con Conjuntos Sustituibles**:
```
✅ Si falta Marca A en CD:
   - Sistema pronostica 60 bultos para el "Conjunto Azúcar Blanca"
   - Redistribuye automáticamente:
     * Marca B: 36 bultos (60% del share restante)
     * Marca C: 24 bultos (40% del share restante)
   - Resultado: Seguimos vendiendo 60 bultos totales
```

---

## 📊 Concepto: Pronóstico Jerárquico

### Niveles de Agregación

```
Nivel 1: Conjunto (Categoría Funcional)
   ↓
Nivel 2: SKUs Individuales (Marcas/Presentaciones)
```

### Pasos del Pronóstico

1. **Pronosticar Demanda Total del Conjunto** (más estable)
   - Ejemplo: "Azúcar Blanca Total" = 60 bultos/día

2. **Calcular Share de Ventas** (participación histórica)
   - Marca A: 50% (30/60)
   - Marca B: 33% (20/60)
   - Marca C: 17% (10/60)

3. **Verificar Disponibilidad en CD** (Centro de Distribución)
   - Marca A: ❌ Sin stock
   - Marca B: ✅ Disponible
   - Marca C: ✅ Disponible

4. **Redistribuir Demanda Automáticamente**
   - Si falta Marca A, su demanda (50%) se redistribuye:
     * Marca B: de 33% → 60% (33 / (33+17))
     * Marca C: de 17% → 40% (17 / (33+17))

---

## 🏗️ Arquitectura del Sistema

### 1. Modelo de Datos

#### Tabla: `conjuntos`
```sql
CREATE TABLE conjuntos (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR NOT NULL,              -- "Azúcar Blanca 1kg"
    descripcion VARCHAR,                   -- "Todas las marcas de azúcar blanca en presentación 1kg"
    categoria VARCHAR,                     -- "Alimentos > Granos"
    activo BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Tabla: `conjunto_productos`
```sql
CREATE TABLE conjunto_productos (
    id VARCHAR PRIMARY KEY,
    conjunto_id VARCHAR NOT NULL,
    codigo_producto VARCHAR NOT NULL,
    share_manual DECIMAL(5,2),            -- Share definido manualmente (opcional)
    activo BOOLEAN DEFAULT true,
    fecha_agregado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (conjunto_id) REFERENCES conjuntos(id),
    UNIQUE(conjunto_id, codigo_producto)
);
```

#### Vista: `conjunto_shares` (calculado dinámicamente)
```sql
CREATE VIEW conjunto_shares AS
SELECT
    cp.conjunto_id,
    cp.codigo_producto,
    p.descripcion,
    -- Cálculo de share basado en últimas 12 semanas
    COALESCE(cp.share_manual,
        SUM(v.cantidad) * 100.0 / SUM(SUM(v.cantidad)) OVER (PARTITION BY cp.conjunto_id)
    ) as share_porcentaje,
    SUM(v.cantidad) as unidades_vendidas_12s,
    AVG(v.cantidad) as promedio_diario
FROM conjunto_productos cp
JOIN productos p ON cp.codigo_producto = p.codigo
LEFT JOIN ventas v ON v.codigo_producto = cp.codigo_producto
    AND v.fecha >= CURRENT_DATE - INTERVAL '12 weeks'
WHERE cp.activo = true
GROUP BY cp.conjunto_id, cp.codigo_producto, p.descripcion, cp.share_manual;
```

---

## 🔧 Backend API Endpoints

### Gestión de Conjuntos (Admin)

#### `GET /api/conjuntos`
Lista todos los conjuntos

**Response**:
```json
{
  "conjuntos": [
    {
      "id": "conjunto-001",
      "nombre": "Azúcar Blanca 1kg",
      "descripcion": "Todas las marcas de azúcar blanca 1kg",
      "categoria": "Alimentos > Granos",
      "total_productos": 3,
      "demanda_diaria_total": 60.0,
      "activo": true
    }
  ]
}
```

#### `POST /api/conjuntos`
Crear nuevo conjunto

**Request**:
```json
{
  "nombre": "Azúcar Blanca 1kg",
  "descripcion": "Todas las marcas de azúcar blanca en presentación 1kg",
  "categoria": "Alimentos > Granos"
}
```

#### `PUT /api/conjuntos/{id}`
Actualizar conjunto

#### `DELETE /api/conjuntos/{id}`
Desactivar conjunto

---

### Gestión de Productos en Conjunto

#### `GET /api/conjuntos/{id}/productos`
Lista productos del conjunto con shares calculados

**Response**:
```json
{
  "conjunto_id": "conjunto-001",
  "nombre": "Azúcar Blanca 1kg",
  "demanda_total_diaria": 60.0,
  "productos": [
    {
      "codigo_producto": "AZ-001",
      "descripcion": "Azúcar Blanca Marca A 1kg",
      "share_porcentaje": 50.0,
      "demanda_diaria": 30.0,
      "stock_actual": 120,
      "dias_inventario": 4.0,
      "activo": true
    },
    {
      "codigo_producto": "AZ-002",
      "descripcion": "Azúcar Blanca Marca B 1kg",
      "share_porcentaje": 33.3,
      "demanda_diaria": 20.0,
      "stock_actual": 0,
      "dias_inventario": 0.0,
      "activo": true
    },
    {
      "codigo_producto": "AZ-003",
      "descripcion": "Azúcar Blanca Marca C 1kg",
      "share_porcentaje": 16.7,
      "demanda_diaria": 10.0,
      "stock_actual": 80,
      "dias_inventario": 8.0,
      "activo": true
    }
  ]
}
```

#### `POST /api/conjuntos/{id}/productos`
Agregar producto al conjunto

**Request**:
```json
{
  "codigo_producto": "AZ-004",
  "share_manual": null  // null = calcular automáticamente basado en histórico
}
```

#### `PUT /api/conjuntos/{id}/productos/{codigo}`
Actualizar share manual de un producto

#### `DELETE /api/conjuntos/{id}/productos/{codigo}`
Remover producto del conjunto

---

### Pronóstico Jerárquico (Core Logic)

#### `GET /api/conjuntos/{id}/pronostico`
Genera pronóstico con lógica de redistribución

**Query params**:
- `ubicacion_id`: Tienda específica (opcional)
- `dias`: Días a pronosticar (default: 7)

**Response**:
```json
{
  "conjunto_id": "conjunto-001",
  "nombre": "Azúcar Blanca 1kg",
  "ubicacion_id": "T001",
  "dias_pronostico": 7,
  "demanda_total_conjunto": 420.0,

  "distribucion_normal": [
    {
      "codigo_producto": "AZ-001",
      "descripcion": "Azúcar Blanca Marca A 1kg",
      "share_porcentaje": 50.0,
      "demanda_pronosticada": 210.0,
      "stock_actual": 120,
      "deficit": 90.0
    },
    {
      "codigo_producto": "AZ-002",
      "descripcion": "Azúcar Blanca Marca B 1kg",
      "share_porcentaje": 33.3,
      "demanda_pronosticada": 140.0,
      "stock_actual": 0,
      "deficit": 140.0
    },
    {
      "codigo_producto": "AZ-003",
      "descripcion": "Azúcar Blanca Marca C 1kg",
      "share_porcentaje": 16.7,
      "demanda_pronosticada": 70.0,
      "stock_actual": 80,
      "deficit": 0.0
    }
  ],

  "distribucion_con_redistribucion": [
    {
      "codigo_producto": "AZ-001",
      "share_original": 50.0,
      "share_ajustado": 60.0,
      "demanda_ajustada": 252.0,
      "motivo": "Recibe parte de AZ-002 (sin stock en CD)"
    },
    {
      "codigo_producto": "AZ-002",
      "share_original": 33.3,
      "share_ajustado": 0.0,
      "demanda_ajustada": 0.0,
      "motivo": "Sin stock en Centro de Distribución"
    },
    {
      "codigo_producto": "AZ-003",
      "share_original": 16.7,
      "share_ajustado": 40.0,
      "demanda_ajustada": 168.0,
      "motivo": "Recibe parte de AZ-002 (sin stock en CD)"
    }
  ],

  "alertas": [
    {
      "tipo": "redistribucion",
      "mensaje": "AZ-002 sin stock en CD - demanda redistribuida entre AZ-001 (60%) y AZ-003 (40%)",
      "severidad": "warning"
    }
  ]
}
```

---

## 🎨 Frontend - Vista de Administración

### Nuevo Componente: `ConjuntosAdmin.tsx`

**Ubicación en App**: `/administrador/conjuntos`

**Secciones**:

### 1. Lista de Conjuntos
- Tabla con nombre, categoría, # productos, demanda total
- Botones: Crear Nuevo, Editar, Desactivar
- Search bar y filtros por categoría
- Sort por demanda total, # productos, nombre

### 2. Modal: Crear/Editar Conjunto
```tsx
<Modal title="Crear Conjunto Sustituible">
  <Form>
    <Input label="Nombre" placeholder="Ej: Azúcar Blanca 1kg" />
    <TextArea label="Descripción" />
    <Select label="Categoría" options={categorias} />

    <ProductSelector
      label="Productos del Conjunto"
      multiSelect={true}
      searchable={true}
    />

    <SharePreview productos={selectedProducts} />
  </Form>
</Modal>
```

### 3. Vista Detallada del Conjunto

**Layout**:
```
┌─────────────────────────────────────────────────┐
│  Azúcar Blanca 1kg                              │
│  Alimentos > Granos                             │
│  Demanda Total: 60 bultos/día                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Gráfico de Distribución (Pie Chart)            │
│  - Marca A: 50%                                 │
│  - Marca B: 33%                                 │
│  - Marca C: 17%                                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Productos del Conjunto                         │
│                                                 │
│  ┌────────────────────────────────┐            │
│  │ Marca A (50%)                  │            │
│  │ Demanda: 30 bultos/día         │            │
│  │ Stock: 120  (4 días)           │            │
│  │ [Editar Share] [Remover]       │            │
│  └────────────────────────────────┘            │
│                                                 │
│  [+ Agregar Producto]                          │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Simulador de Redistribución                    │
│  ¿Qué pasa si falta una marca?                 │
│                                                 │
│  Simular stockout de: [Marca A ▼]              │
│                                                 │
│  Resultado:                                     │
│  - Marca B: 33% → 60% (+18 bultos)            │
│  - Marca C: 17% → 40% (+12 bultos)            │
└─────────────────────────────────────────────────┘
```

### 4. Simulador de Redistribución
- Toggle para activar/desactivar productos
- Visualización "Antes vs Después"
- Gráfico comparativo de shares
- Alertas visuales cuando hay redistribución

---

## 🔗 Integración con Pedido Sugerido

### Lógica Actual vs Nueva

**ACTUAL (❌ Incorrecto)**:
```python
def calcular_pedido_sugerido(codigo_producto, ubicacion_id, dias_cobertura):
    # Pronóstico individual por SKU
    demanda_diaria = get_demanda_promedio(codigo_producto, ubicacion_id)
    demanda_periodo = demanda_diaria * dias_cobertura
    stock_actual = get_stock_actual(codigo_producto, ubicacion_id)

    pedido = max(0, demanda_periodo - stock_actual)
    return pedido
```

**NUEVO (✅ Correcto con Conjuntos)**:
```python
def calcular_pedido_sugerido(codigo_producto, ubicacion_id, dias_cobertura):
    # 1. Verificar si pertenece a un conjunto
    conjunto = get_conjunto_by_producto(codigo_producto)

    if conjunto is None:
        # Lógica normal para productos sin conjunto
        demanda_diaria = get_demanda_promedio(codigo_producto, ubicacion_id)
        demanda_periodo = demanda_diaria * dias_cobertura
        stock_actual = get_stock_actual(codigo_producto, ubicacion_id)
        return max(0, demanda_periodo - stock_actual)

    # 2. Calcular demanda total del conjunto
    demanda_conjunto_diaria = get_demanda_conjunto(conjunto.id, ubicacion_id)
    demanda_conjunto_periodo = demanda_conjunto_diaria * dias_cobertura

    # 3. Obtener shares de cada SKU en el conjunto
    shares = get_shares_conjunto(conjunto.id, ubicacion_id)

    # 4. Verificar stock disponible en CD para cada SKU
    stock_cd = get_stock_centro_distribucion(conjunto.productos)

    # 5. Identificar productos sin stock en CD
    productos_disponibles = [p for p in conjunto.productos if stock_cd[p] > 0]

    # 6. Redistribuir demanda si hay stockouts
    if len(productos_disponibles) < len(conjunto.productos):
        # Hay productos sin stock - redistribuir
        total_share_disponible = sum(shares[p] for p in productos_disponibles)

        shares_ajustados = {}
        for producto in productos_disponibles:
            # Proporcional al share original
            shares_ajustados[producto] = (shares[producto] / total_share_disponible) * 100
    else:
        # Todos disponibles - usar shares normales
        shares_ajustados = shares

    # 7. Calcular demanda para este SKU específico
    share_producto = shares_ajustados.get(codigo_producto, 0)
    demanda_producto = (demanda_conjunto_periodo * share_producto) / 100

    # 8. Calcular pedido considerando stock actual en tienda
    stock_actual_tienda = get_stock_actual(codigo_producto, ubicacion_id)
    pedido = max(0, demanda_producto - stock_actual_tienda)

    return pedido
```

---

## 📊 Integración en Vista de Producto

### En `ProductoDetalleModal.tsx`

Nueva sección condicional (solo si producto pertenece a un conjunto):

```tsx
{detalle.conjunto && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
    <div className="flex items-start justify-between mb-3">
      <div>
        <h4 className="font-semibold text-blue-900 flex items-center gap-2">
          🔄 Conjunto Sustituible: {detalle.conjunto.nombre}
        </h4>
        <p className="text-sm text-blue-700 mt-1">
          Este producto es intercambiable con {detalle.conjunto.total_productos - 1} otros productos
        </p>
      </div>
      <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded">
        Share: {detalle.share_porcentaje}%
      </span>
    </div>

    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-600 uppercase">
        Productos del Conjunto
      </p>

      {detalle.conjunto.productos.map(prod => (
        <div
          key={prod.codigo}
          className={`flex items-center justify-between bg-white rounded p-3 border ${
            prod.codigo === detalle.producto.codigo
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200'
          }`}
        >
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">
              {prod.descripcion}
              {prod.codigo === detalle.producto.codigo && (
                <span className="ml-2 text-xs text-blue-600">(Este producto)</span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Código: {prod.codigo}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-500">Share</p>
              <p className="text-sm font-semibold text-gray-900">
                {prod.share_porcentaje.toFixed(1)}%
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs text-gray-500">Demanda/día</p>
              <p className="text-sm font-semibold text-gray-900">
                {prod.demanda_diaria.toFixed(0)}
              </p>
            </div>

            <span className={`text-xs px-2 py-1 rounded font-medium ${
              prod.stock_actual > 0
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              Stock: {prod.stock_actual}
            </span>
          </div>
        </div>
      ))}
    </div>

    {detalle.conjunto.alertas && detalle.conjunto.alertas.length > 0 && (
      <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
        <p className="text-xs font-medium text-yellow-800">
          ⚠️ {detalle.conjunto.alertas[0].mensaje}
        </p>
      </div>
    )}
  </div>
)}
```

---

## 🚀 Fases de Implementación

### Fase 1: Database & Backend Core (1.5 horas)
**Tareas**:
1. Crear migración SQL con tablas `conjuntos` y `conjunto_productos`
2. Crear vista `conjunto_shares`
3. Implementar endpoints CRUD para conjuntos
4. Implementar endpoint de pronóstico jerárquico
5. Testing con datos de prueba

**Archivos**:
- `database/schema_conjuntos.sql`
- `backend/main.py` (nuevos endpoints)
- `backend/models/conjuntos.py` (modelos Pydantic)

### Fase 2: Admin UI (2 horas)
**Tareas**:
1. Componente `ConjuntosAdmin.tsx` con lista
2. Modal crear/editar conjunto
3. Vista detallada con gestión de productos
4. Simulador de redistribución
5. Integración en router de admin

**Archivos**:
- `frontend/src/components/admin/ConjuntosAdmin.tsx`
- `frontend/src/components/admin/ConjuntoDetalleModal.tsx`
- `frontend/src/components/admin/SimuladorRedistribucion.tsx`
- `frontend/src/services/conjuntosService.ts`
- `frontend/src/App.tsx` (nueva ruta)

### Fase 3: Integración con Pedido Sugerido (1.5 horas)
**Tareas**:
1. Modificar lógica de cálculo de demanda en backend
2. Implementar redistribución automática
3. Actualizar endpoint `/api/pedidos/sugerir`
4. Actualizar UI de pedido sugerido para mostrar conjuntos
5. Testing end-to-end con escenarios reales

**Archivos**:
- `backend/main.py` (endpoint pedidos sugeridos)
- `frontend/src/components/orders/OrderWizard.tsx`
- `frontend/src/components/orders/OrderStepTwo.tsx`

### Fase 4: Vista en Detalle de Producto (0.5 horas)
**Tareas**:
1. Agregar sección de conjunto en `ProductoDetalleModal`
2. Fetch de información del conjunto
3. Mostrar productos relacionados con shares
4. Indicadores de stock y alertas

**Archivos**:
- `frontend/src/components/productos/ProductoDetalleModal.tsx`
- `frontend/src/services/productosService.ts`

---

## 📈 Métricas de Éxito

### KPIs a Monitorear

1. **Reducción de Stockouts**:
   - Antes: X% de pedidos con productos faltantes
   - Después: Y% de pedidos con productos faltantes
   - Meta: Reducir 30%

2. **Mejora en Fill Rate** (tasa de cumplimiento):
   - Antes: 85% de la demanda satisfecha
   - Después: 95% de la demanda satisfecha
   - Meta: +10 puntos porcentuales

3. **Optimización de Inventario**:
   - Reducir inventario total en 15% manteniendo disponibilidad
   - Días de inventario promedio: de 12 días → 10 días

4. **Precisión del Pronóstico**:
   - Error MAPE (Mean Absolute Percentage Error)
   - Antes: 25% de error
   - Después: 15% de error (a nivel de conjunto)

---

## 🎯 Beneficios Esperados

### Operacionales
1. **Mayor Disponibilidad**: Si falta una marca, automáticamente se sugiere más de las otras
2. **Menos Quiebres de Stock**: El sistema compensa proactivamente
3. **Pronóstico más Estable**: Demanda a nivel de categoría tiene menos volatilidad

### Estratégicos
4. **Flexibilidad de Marca**: No dependes de un solo proveedor
5. **Negociación con Proveedores**: Puedes rotar marcas según precio/disponibilidad
6. **Mejor Experiencia del Cliente**: Siempre hay producto disponible

### Financieros
7. **Reducción de Inventario**: Menos SKUs en stock manteniendo disponibilidad
8. **Aumento de Ventas**: Menos ventas perdidas por stockouts
9. **Optimización de Capital de Trabajo**: Mejor rotación de inventario

---

## 🔒 Consideraciones Importantes

### Casos Edge a Manejar

1. **Conjunto con un solo producto activo**:
   - Si todos los demás tienen stock 0, el único disponible toma 100% del share

2. **Nuevos productos en conjunto**:
   - Sin histórico de ventas, usar share_manual inicial
   - Después de 4 semanas, calcular share automático

3. **Productos estacionales**:
   - Share puede variar por temporada
   - Considerar últimas 12 semanas para cálculo

4. **Cambios de precio significativos**:
   - Alerta si un producto del conjunto cambia precio >20%
   - Puede afectar share temporalmente

5. **Descontinuación de producto**:
   - Marcar como inactivo en conjunto
   - Su share se redistribuye automáticamente

### Validaciones Necesarias

1. Un producto solo puede estar en UN conjunto a la vez
2. Un conjunto debe tener mínimo 2 productos activos
3. La suma de shares manuales (si se usan) debe ser 100%
4. Alertar si share de un producto cambia >30% en una semana

---

## 📝 Documentación para Usuario Final

### Guía Rápida: Cómo Crear un Conjunto

1. Ir a **Administrador → Conjuntos**
2. Click en **"Crear Nuevo Conjunto"**
3. Llenar información:
   - Nombre descriptivo (ej: "Azúcar Blanca 1kg")
   - Descripción (opcional)
   - Categoría
4. Seleccionar productos sustituibles
5. Revisar shares calculados automáticamente
6. Guardar

### Cuándo Usar Conjuntos

✅ **USAR cuando**:
- Los clientes compran por categoría, no por marca
- Los productos son funcionalmente idénticos
- Hay múltiples proveedores/marcas del mismo item
- Quieres optimizar inventario sin perder ventas

❌ **NO USAR cuando**:
- El cliente tiene preferencia fuerte por marca específica
- Los productos tienen diferencias funcionales importantes
- Son productos complementarios (no sustituibles)
- El precio varía significativamente entre opciones

---

## 🛠️ Tareas de Mantenimiento

### Mensual
- Revisar shares de conjuntos (verificar si siguen vigentes)
- Identificar nuevos conjuntos potenciales
- Ajustar shares manuales si hay cambios de mercado

### Trimestral
- Analizar efectividad de conjuntos (KPIs)
- Revisar productos descontinuados
- Optimizar conjuntos existentes

### Anual
- Auditoría completa de conjuntos
- Recalcular todos los shares con data del año
- Actualizar estrategia de conjuntos

---

## 📚 Referencias

### Teoría
- **Pronóstico Jerárquico**: Hyndman & Athanasopoulos, "Forecasting: Principles and Practice" (2021)
- **Sustitución de Productos**: Fisher & Raman, "The New Science of Retailing" (2010)
- **Análisis ABC-XYZ**: Inventory Management Best Practices

### Implementación
- Documentación DuckDB: Window Functions
- FastAPI: Background Tasks para recalcular shares
- React: Optimistic UI Updates

---

**Próximos Pasos**:
1. ✅ Crear este documento
2. ⏳ Deploy de features actuales (ABC-XYZ)
3. ⏳ Implementar Fase 1 (Database & Backend)
4. ⏳ Implementar Fase 2 (Admin UI)
5. ⏳ Implementar Fase 3 (Integración Pedido Sugerido)
6. ⏳ Testing y validación con datos reales
