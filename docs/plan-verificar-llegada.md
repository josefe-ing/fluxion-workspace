# Plan: Order Fulfillment Tracking (Verificar Llegada)

## Objetivo
Agregar funcionalidad para verificar si los productos de un pedido llegaron a la tienda, detectando incrementos de inventario y **guardando el resultado** en el pedido.

---

## Flujo de Uso

1. Usuario recibe aviso: "llegó el pedido"
2. Entra al detalle del pedido → click **"Verificar Llegada"**
3. Sistema detecta incrementos de inventario **desde la fecha del pedido**
4. **Muestra** los incrementos detectados (no guarda aún)
5. Usuario revisa y da click en **"Guardar Llegada"**
6. Se guarda en el pedido (campo `cantidad_recibida_bultos`)
7. Si llega otra parte después → repite el proceso → **acumula** lo nuevo

---

## Algoritmo de Cálculo

Para cada producto del pedido:
1. Obtener **todos los snapshots** desde `fecha_pedido` hasta ahora
2. Calcular incrementos entre snapshots consecutivos (usando LAG)
3. Sumar **todos los incrementos positivos** = `total_llegadas_detectadas`
4. Restar lo ya guardado: `nuevo_a_guardar` = total_llegadas - cantidad_ya_guardada
5. `porcentaje` = total_llegadas / cantidad_pedida * 100

**Ejemplo real** (GRANJA PAN DE JAMON 003231):
- Pedido: 21 dic
- Snapshot 22 dic 11:14am: -1
- Snapshot 22 dic 11:43am: 194
- Incremento detectado = 194 - (-1) = **+195 unidades**
- Verificación a las 3pm: detecta el incremento de las 11:43am

**Si llega en partes** (múltiples incrementos):
- 10:00am: +100 unidades
- 2:00pm: +50 unidades
- Verificación a las 4pm: detecta ambos → total = 150

---

## Implementación

### 1. Backend: Nuevo Endpoint

**Archivo**: [pedidos_sugeridos.py](../backend/routers/pedidos_sugeridos.py)

```
GET /api/pedidos-sugeridos/{pedido_id}/verificar-llegada
```

**Agregar modelos en** [models/pedidos_sugeridos.py](../backend/models/pedidos_sugeridos.py):
- `ProductoLlegadaVerificacion`: resultado por producto
- `VerificarLlegadaResponse`: respuesta completa con resumen

**Query SQL - Detectar todos los incrementos desde fecha_pedido**:
```sql
WITH snapshots AS (
  SELECT
    fecha_snapshot,
    cantidad,
    cantidad - LAG(cantidad) OVER (ORDER BY fecha_snapshot) as incremento
  FROM inventario_historico
  WHERE producto_id = ?
    AND ubicacion_id = ?
    AND fecha_snapshot >= ?  -- fecha_pedido
  ORDER BY fecha_snapshot
)
SELECT
  COALESCE(SUM(CASE WHEN incremento > 0 THEN incremento ELSE 0 END), 0) as total_llegadas
FROM snapshots;
```

**Lógica**:
1. Obtiene todos los snapshots desde fecha_pedido
2. Calcula incremento entre cada par consecutivo
3. Suma solo los incrementos positivos (llegadas)
4. Ignora decrementos (ventas)

### 1b. Persistencia: Guardar resultado

**Ya existe el campo** en `pedidos_sugeridos_detalle`:
- `cantidad_recibida_bultos` - Usaremos este campo para guardar la llegada detectada
- `cantidad_recibida_unidades` - Para unidades

**Nuevo endpoint POST** para guardar:
```
POST /api/pedidos-sugeridos/{pedido_id}/registrar-llegada
Body: { productos: [{ codigo_producto, cantidad_llegada }] }
```

Actualiza `cantidad_recibida_bultos` sumando el nuevo incremento.

### 2. Frontend: Service

**Archivo**: [pedidosService.ts](../frontend/src/services/pedidosService.ts)

Agregar:
- Interface `VerificacionLlegadaResponse`
- Función `verificarLlegada(pedidoId)`
- Función `registrarLlegada(pedidoId, productos)`

### 3. Frontend: UI

**Archivo**: [PedidoApprovalView.tsx](../frontend/src/components/orders/PedidoApprovalView.tsx)

Cambios:
1. **Botón "Verificar Llegada"** en el header → llama GET para detectar incrementos
2. **Nuevas columnas** en la tabla (visibles después de verificar):
   - "Incremento Detectado": cantidad que acaba de llegar (resaltado si > 0)
   - "Total Recibido": acumulado guardado + nuevo detectado
   - "Estado": badge con color
3. **Botón "Guardar Llegada"** (aparece si hay incrementos) → llama POST para persistir
4. Columna "Total Recibido" siempre visible si ya hay datos guardados

**Colores de estado**:
| Estado | Condición | Color |
|--------|-----------|-------|
| Completo | >= 95% | Verde |
| Parcial | 1-94% | Amarillo |
| No llegó | 0% o sin incremento detectado | Rojo |
| Sin datos | no hay snapshots en el período | Gris |

---

## Casos Edge

1. **Pedido en estado Borrador**: Permitir verificación (el pedido puede estar en borrador mientras la mercancía ya llegó)
2. **Pedido sin fecha_recepcion**: Permitir verificación sin advertencia
3. **Sin datos de inventario**: Mostrar "Sin datos" en gris
4. **Tiendas KLK (múltiples almacenes)**: Sumar cantidad de todos los almacenes
5. **Stock negativo**: Permitir en cálculos, mostrar advertencia si llegada < 0

**Nota**: La funcionalidad de "Verificar Llegada" está disponible en **cualquier estado** del pedido (Borrador, Aprobado, Finalizado, etc.) ya que la llegada física puede ocurrir independientemente del estado del pedido en sistema.

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `backend/routers/pedidos_sugeridos.py` | GET `verificar-llegada` + POST `registrar-llegada` |
| `backend/models/pedidos_sugeridos.py` | Modelos de request/response |
| `frontend/src/services/pedidosService.ts` | `verificarLlegada()` + `registrarLlegada()` |
| `frontend/src/components/orders/PedidoApprovalView.tsx` | Botones + columnas + badges |
| `docs-site/docs/modulos/pedidos-sugeridos/verificar-llegada.md` | **Nueva documentación** |
| `docs-site/docs/modulos/pedidos-sugeridos/index.md` | Agregar link a nueva sección |

---

## Secuencia de Implementación

1. Backend: Modelos de respuesta
2. Backend: GET endpoint (detectar incrementos)
3. Backend: POST endpoint (guardar en `cantidad_recibida_bultos`)
4. Frontend: Service functions
5. Frontend: UI (botón verificar → columnas → botón guardar → badges)
6. Documentación: Crear `verificar-llegada.md` en docs-site
7. Testing con pedidos reales

---

## Documentación (docs-site)

### Nuevo archivo: `docs-site/docs/modulos/pedidos-sugeridos/verificar-llegada.md`

Contendrá:
- Explicación del flujo de verificación
- Cómo funciona la detección de incrementos
- Significado de cada estado (Completo, Parcial, No llegó)
- Ejemplos con capturas de pantalla
- FAQ: qué hacer si no detecta la llegada

### Actualizar: `docs-site/docs/modulos/pedidos-sugeridos/index.md`

Agregar en "Próximas Secciones":
```md
- [Verificar Llegada](/modulos/pedidos-sugeridos/verificar-llegada) - Seguimiento de recepción de pedidos
```
