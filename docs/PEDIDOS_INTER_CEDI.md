# Sistema de Pedidos Inter-CEDI (Valencia → Caracas)

## Resumen Ejecutivo

Módulo para gestionar la reposición del **CEDI Caracas** desde los **CEDIs de Valencia** (Seco, Frio, Verde), basado en la demanda agregada de las tiendas de la región Caracas (Artigas + Paraíso).

### Contexto del Negocio

- **CEDI Valencia (Seco/Frio/Verde)** → surte a → **CEDI Caracas**
- **CEDI Caracas** → surte a → **Tienda Artigas + Tienda Paraíso**
- **Frecuencia de viajes**: Martes, Jueves, Sábado (configurable)
- **Lead time**: ~2 días Valencia → Caracas

### Diferencias vs Pedidos CEDI→Tienda

| Aspecto | CEDI→Tienda | Inter-CEDI |
|---------|-------------|------------|
| Demanda base | 1 tienda | N tiendas (región completa) |
| Frecuencia | Diaria | 3x/semana configurable |
| Lead time | 1.5 días | 2 días |
| Stock seguridad | Bajo | Alto (absorber picos regionales) |
| Orígenes | 1 CEDI | 3 CEDIs consolidados |
| Pedido | Simple | Consolidado con export por CEDI |

---

## Fórmula de Cálculo

```
Demanda_Regional = Σ(P75 de cada tienda de la región)
                 = P75_Artigas + P75_Paraiso

SS_CEDI = Z × σ_regional × √Lead_Time
        donde Z = {A: 2.33, B: 1.88, C: 1.28, D: 0}

Stock_Min = Demanda_Regional × Lead_Time + SS_CEDI

Stock_Max = Stock_Min + (Demanda_Regional × Dias_Cobertura_ABC)

Cantidad_Sugerida = max(0, Stock_Max - Stock_Actual_CEDI_Caracas)
```

### Parámetros Configurables (por pedido)

| Parámetro | Default | Descripción |
|-----------|---------|-------------|
| Días cobertura Clase A | 7 | Productos alta rotación |
| Días cobertura Clase B | 14 | Productos media rotación |
| Días cobertura Clase C | 21 | Productos baja rotación |
| Días cobertura Clase D | 30 | Productos muy baja rotación |
| Frecuencia viajes | Mar,Jue,Sáb | Días que salen camiones |
| Lead time | 2 días | Tiempo Valencia → Caracas |

### Ejemplo de Cálculo

**Producto: Arroz Mary 1kg (Clase A)**
- P75 Artigas: 80 unid/día
- P75 Paraíso: 45 unid/día
- **Demanda Regional**: 125 unid/día
- σ regional (estimado 30%): 37.5
- Lead time: 2 días
- Z (Clase A): 2.33

```
SS = 2.33 × 37.5 × √2 = 123 unidades
Stock_Min = (125 × 2) + 123 = 373 unidades
Stock_Max = 373 + (125 × 7) = 1,248 unidades

Si Stock_Actual_CEDI_Caracas = 200 unidades:
Cantidad_Sugerida = 1,248 - 200 = 1,048 unidades
```

---

## Flujo de Estados

```
┌──────────┐     ┌────────────┐     ┌────────────┐     ┌──────────┐
│ BORRADOR │ ──► │ CONFIRMADO │ ──► │ DESPACHADO │ ──► │ RECIBIDO │
└──────────┘     └────────────┘     └────────────┘     └──────────┘
     │
     ▼
┌────────────┐
│ CANCELADO  │
└────────────┘
```

| Estado | Descripción | Editable | Acciones disponibles |
|--------|-------------|----------|---------------------|
| `borrador` | Pedido creado, en edición | ✅ Sí | Editar, Confirmar, Cancelar |
| `confirmado` | Listo para despacho | ❌ No | Marcar despachado |
| `despachado` | Camión en ruta | ❌ No | Marcar recibido |
| `recibido` | Entregado en CEDI Caracas | ❌ No | - |
| `cancelado` | Pedido anulado | ❌ No | - |

---

## Arquitectura Técnica

### Base de Datos

#### Tablas Nuevas

**1. `pedidos_inter_cedi`** (encabezado)
```sql
- id (PK)
- numero_pedido (ej: IC-00001)
- cedi_destino_id (cedi_caracas)
- estado (borrador, confirmado, despachado, recibido, cancelado)
- dias_cobertura_a, dias_cobertura_b, dias_cobertura_c, dias_cobertura_d
- frecuencia_viajes_dias
- lead_time_dias
- total_productos, total_bultos, total_unidades
- fecha_pedido, fecha_creacion, fecha_confirmacion, fecha_despacho, fecha_recepcion
- usuario_creador
```

**2. `pedidos_inter_cedi_detalle`** (productos)
```sql
- id (PK)
- pedido_id (FK)
- cedi_origen_id (cedi_seco, cedi_frio, cedi_verde)
- codigo_producto
- descripcion_producto
- clasificacion_abc
- demanda_regional_p75
- num_tiendas_region
- stock_actual_cedi_destino
- stock_cedi_origen
- cantidad_sugerida_bultos
- cantidad_pedida_bultos (editable por usuario)
- dias_cobertura_objetivo
```

**3. `config_rutas_inter_cedi`** (configuración)
```sql
- cedi_origen_id
- cedi_destino_id
- lead_time_dias
- frecuencia_viajes_dias
- activo
```

**4. `pedidos_inter_cedi_historial`** (auditoría)
```sql
- pedido_id
- estado_anterior
- estado_nuevo
- usuario
- fecha_cambio
```

#### Modificación a tabla existente

**`productos`** - Agregar campo:
```sql
ALTER TABLE productos ADD COLUMN cedi_origen_id VARCHAR(50);
-- Valores: 'cedi_seco', 'cedi_frio', 'cedi_verde'
-- Poblado desde inventarios existentes de cada CEDI
```

### API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/pedidos-inter-cedi/calcular` | Calcula demanda regional y sugiere cantidades |
| `POST` | `/api/pedidos-inter-cedi/` | Guarda pedido en borrador |
| `GET` | `/api/pedidos-inter-cedi/` | Lista pedidos (filtros: estado, fecha) |
| `GET` | `/api/pedidos-inter-cedi/{id}` | Detalle completo con productos |
| `PUT` | `/api/pedidos-inter-cedi/{id}` | Actualiza pedido en borrador |
| `DELETE` | `/api/pedidos-inter-cedi/{id}` | Elimina pedido en borrador |
| `POST` | `/api/pedidos-inter-cedi/{id}/confirmar` | Cambia estado a confirmado |
| `POST` | `/api/pedidos-inter-cedi/{id}/despachar` | Cambia estado a despachado |
| `POST` | `/api/pedidos-inter-cedi/{id}/recibir` | Cambia estado a recibido |
| `GET` | `/api/pedidos-inter-cedi/{id}/exportar` | Exporta Excel (query: ?cedi_origen=) |
| `GET` | `/api/pedidos-inter-cedi/config/rutas` | Obtiene configuración de rutas |

### Frontend

#### Wizard de 3 Pasos

**Paso 1: Configuración**
- Seleccionar CEDI destino (cedi_caracas)
- Configurar días de cobertura por clase ABC (inputs numéricos)
- Configurar frecuencia de viajes
- Ver info: tiendas de la región, último pedido

**Paso 2: Selección de Productos**
- Tabla con todos los productos sugeridos
- Filtro por CEDI origen (Seco/Frio/Verde/Todos)
- Filtro por clasificación ABC
- Columnas: Producto, ABC, Demanda Regional, Stock CEDI, Sugerido, Pedido (editable)
- Colores por CEDI origen (amarillo=Seco, azul=Frio, verde=Verde)
- Totales por CEDI y general

**Paso 3: Confirmación**
- Resumen por CEDI origen
- Totales: productos, bultos, unidades
- Observaciones (textarea)
- Botones: Volver, Guardar Borrador, Confirmar Pedido
- Botones de descarga Excel (completo y por CEDI)

#### Archivos a Crear

```
frontend/src/
├── components/orders/
│   ├── PedidoInterCediWizard.tsx
│   └── wizard-intercedi/
│       ├── PasoCediDestinoConfiguracion.tsx
│       ├── PasoSeleccionProductosInterCedi.tsx
│       └── PasoConfirmacionInterCedi.tsx
└── services/
    └── pedidosInterCediService.ts
```

---

## Exportación Excel

### Excel Completo
Todos los productos del pedido, ordenados por CEDI origen.

### Excel por CEDI
3 archivos separados, uno por cada CEDI origen:
- `IC-00001_CEDI_SECO.xlsx`
- `IC-00001_CEDI_FRIO.xlsx`
- `IC-00001_CEDI_VERDE.xlsx`

### Columnas del Excel

| Columna | Descripción |
|---------|-------------|
| Código | Código del producto |
| Descripción | Nombre del producto |
| Categoría | Categoría del producto |
| ABC | Clasificación A/B/C/D |
| Demanda Regional | P75 agregado (unid/día) |
| Stock CEDI Caracas | Stock actual en destino |
| Stock CEDI Origen | Stock disponible en origen |
| Sugerido | Cantidad sugerida (bultos) |
| Pedido | Cantidad confirmada (bultos) |
| Unidades | Total unidades |

---

## Configuración Inicial

### Rutas Inter-CEDI

```sql
INSERT INTO config_rutas_inter_cedi VALUES
('cedi_seco', 'cedi_caracas', 2.0, 'Mar,Jue,Sab', true),
('cedi_frio', 'cedi_caracas', 2.0, 'Mar,Jue,Sab', true),
('cedi_verde', 'cedi_caracas', 2.0, 'Mar,Jue,Sab', true);
```

### Asignación de Productos a CEDIs

Poblar `productos.cedi_origen_id` desde inventarios existentes:

```sql
UPDATE productos p
SET cedi_origen_id = (
    SELECT ia.ubicacion_id
    FROM inventario_actual ia
    WHERE ia.producto_codigo = p.codigo
      AND ia.ubicacion_id IN ('cedi_seco', 'cedi_frio', 'cedi_verde')
    ORDER BY ia.cantidad_disponible DESC
    LIMIT 1
);

-- Default para productos sin inventario en CEDIs
UPDATE productos
SET cedi_origen_id = 'cedi_seco'
WHERE cedi_origen_id IS NULL;
```

---

## Fases de Implementación

### Fase 0: Preparación (0.5 días)
1. Migración: agregar `cedi_origen_id` a tabla `productos`
2. Poblar campo desde inventarios existentes
3. Validar asignación con queries

### Fase 1: Base de Datos (0.5 días)
4. Crear migración con tablas inter-CEDI
5. Insertar datos iniciales de rutas

### Fase 2: Backend (2-3 días)
6. Modelos Pydantic
7. Endpoint `/calcular` con lógica de demanda regional
8. Endpoints CRUD
9. Endpoint exportación Excel
10. Registrar router

### Fase 3: Frontend (2-3 días)
11. Servicio API
12. Paso 1: Configuración
13. Paso 2: Selección productos
14. Paso 3: Confirmación
15. Botones Excel
16. Integración wizard

### Fase 4: Testing (1-2 días)
17. Probar flujo completo
18. Validar cálculos
19. Probar exportación
20. Agregar a navegación

**Total estimado: 6-8 días**

---

## Notas de Diseño

1. **Módulo separado**: No mezclar con pedidos CEDI→Tienda
2. **Cobertura configurable**: Usuario define días por clase ABC en cada pedido
3. **Stock seguridad alto**: CEDI regional absorbe variabilidad de múltiples tiendas
4. **Agrupación visual**: Colores distintivos por CEDI origen
5. **Pedido consolidado**: Un pedido = productos de 3 CEDIs
6. **Export granular**: Excel completo o por CEDI origen
7. **Flujo simple**: Sin aprobaciones intermedias (borrador → confirmado → despachado → recibido)
8. **Sin restricciones de camión**: Sistema calcula qué enviar, logística decide cómo

---

## Preguntas Frecuentes

**¿Por qué demanda agregada y no promedio?**
Porque el CEDI Caracas debe tener stock para surtir a TODAS las tiendas de la región, no solo a una "tienda promedio".

**¿Por qué stock de seguridad más alto?**
El CEDI regional debe absorber variabilidad de múltiples tiendas y la incertidumbre del transporte inter-regional.

**¿Por qué días de cobertura configurables por pedido?**
Permite ajustar según temporada, promociones, o situaciones especiales sin cambiar configuración global.

**¿Por qué un pedido consolidado en vez de 3 separados?**
Representa mejor la realidad operativa (un viaje lleva todo) y simplifica gestión.
