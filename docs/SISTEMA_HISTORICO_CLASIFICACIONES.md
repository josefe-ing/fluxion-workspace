# Sistema de Histórico y Alertas de Clasificación ABC-XYZ

## 📋 Resumen

Se ha implementado un **sistema completo de tracking de cambios** en las clasificaciones ABC-XYZ que permite:

1. ✅ Guardar histórico de clasificaciones antes de recalcular
2. ✅ Detectar automáticamente cambios en clasificaciones
3. ✅ Generar alertas para cambios críticos
4. ✅ API completa para consultar cambios y histórico
5. ⏳ Dashboard React para visualización (pendiente)

---

## 🗄️ Estructura de Base de Datos

### Tablas Creadas

#### 1. `productos_abc_v2_historico`
**Propósito**: Archivo histórico de todas las clasificaciones ABC anteriores

```sql
- id: UUID único
- codigo_producto: Código del producto
- ubicacion_id: ID de la tienda
- fecha_calculo: Cuándo se calculó esta clasificación
- clasificacion_abc_valor: A, B, C
- valor_consumo_total: Valor económico
- ranking_valor: Posición en el ranking
- porcentaje_valor: % del valor total
- porcentaje_acumulado: % acumulado (Pareto)
```

**Uso**: Cada vez que se ejecuta `calcular_abc_v2_por_tienda.py`, los datos antiguos se guardan aquí antes de borrar.

#### 2. `alertas_cambio_clasificacion` (Nueva)
**Propósito**: Registro de cambios detectados que requieren atención

```sql
- id: UUID único
- codigo_producto: Código del producto
- ubicacion_id: ID de la tienda
- tipo_cambio: 'ABC', 'XYZ', 'MATRIZ'
- clasificacion_anterior: Clasificación previa
- clasificacion_nueva: Nueva clasificación
- fecha_cambio: Timestamp del cambio
- es_critico: Boolean (A↔C o X↔Z)
- nivel_prioridad: 'ALTA', 'MEDIA', 'BAJA'
- valor_anterior, valor_nuevo: Para cambios ABC
- cv_anterior, cv_nuevo: Para cambios XYZ
- matriz_anterior, matriz_nueva: Para cambios de matriz
- revisado: Boolean
- revisado_por: Email del usuario
- accion_recomendada: Texto sugerido
```

### Vistas Creadas

1. **`v_alertas_pendientes`**: Alertas no revisadas ordenadas por prioridad
2. **`v_alertas_criticas_recientes`**: Cambios críticos últimos 7 días
3. **`v_alertas_resumen_tienda`**: Resumen de alertas agrupadas por tienda

---

## 🔧 Scripts Modificados

### 1. `database/calcular_abc_v2_por_tienda.py`

**Cambios implementados**:

#### Método: `_guardar_historico(fecha_inicio, fecha_fin)`
- Se ejecuta ANTES de borrar los datos antiguos
- Copia todos los registros a `productos_abc_v2_historico`
- Solo guarda clasificaciones A, B, C (no errores)

#### Método: `_detectar_cambios_clasificacion()`
- Se ejecuta DESPUÉS de calcular nuevas clasificaciones
- Compara clasificación actual vs última en histórico
- Identifica cambios críticos (A↔C)
- Imprime resumen en consola con emojis:
  - 🔴 Cambios críticos
  - 🟡 Cambios importantes

**Salida en consola**:
```
📦 Archivando clasificaciones antiguas...
📦 31,773 registros archivados en histórico

[... proceso de cálculo ...]

🔍 Detectando cambios de clasificación...

🔔 CAMBIOS DE CLASIFICACIÓN DETECTADOS: 45
======================================================================
   🔴 Cambios críticos: 3
   🔴 PROD-12345        [tienda_01]: A → C (-45.2%)
   🟡 PROD-67890        [tienda_02]: B → A (+28.5%)
   ... y 42 cambios más
```

### 2. `database/calcular_xyz_por_tienda.py`

**Cambios implementados**:

#### Método: `_guardar_snapshot_xyz_anterior()`
- Guarda snapshot temporal de clasificaciones XYZ antes de actualizar
- Tabla temporal: `xyz_anterior`

#### Método: `_detectar_cambios_xyz()`
- Detecta cambios en clasificación XYZ (X, Y, Z)
- Detecta cambios en matriz ABC-XYZ (AX, BY, CZ, etc.)
- Identifica cambios críticos de volatilidad (X↔Z)
- Filtra productos clase A con cambios XYZ

**Salida en consola**:
```
📸 Guardando snapshot de clasificaciones XYZ anteriores...
📸 Snapshot de 28,450 clasificaciones XYZ guardado

[... proceso de cálculo ...]

🔍 Detectando cambios de clasificación XYZ...

🔔 CAMBIOS DE CLASIFICACIÓN XYZ DETECTADOS: 67
======================================================================
   🔴 Cambios críticos de volatilidad: 5
   ⚠️  Productos clase A con cambio XYZ: 12
   🔴 PROD-11111        [tienda_05]: X → Z (CV: 0.35→1.45)
   🟡 PROD-22222        [tienda_03]: Y → X (CV: 0.78→0.42)
```

---

## 🌐 API Endpoints

### 1. GET `/api/alertas/cambios-clasificacion`

Obtiene lista de alertas de cambios de clasificación.

**Parámetros**:
- `ubicacion_id` (opcional): Filtrar por tienda
- `solo_pendientes` (default: true): Solo no revisadas
- `solo_criticas` (default: false): Solo críticas
- `dias` (default: 30): Ventana de tiempo
- `limit` (default: 100): Máximo de resultados

**Respuesta**:
```json
{
  "success": true,
  "alertas": [
    {
      "id": "uuid",
      "codigo_producto": "PROD-123",
      "producto_descripcion": "Arroz Diana 1kg",
      "categoria": "Granos",
      "ubicacion_id": "tienda_01",
      "tipo_cambio": "ABC",
      "cambio_clasificacion": "A_a_C",
      "clasificacion_anterior": "A",
      "clasificacion_nueva": "C",
      "fecha_cambio": "2025-11-12T10:30:00",
      "es_critico": true,
      "nivel_prioridad": "ALTA",
      "valor_anterior": 125000.50,
      "valor_nuevo": 45000.00,
      "cambio_porcentual": -64.00,
      "matriz_anterior": "AX",
      "matriz_nueva": "CZ",
      "accion_recomendada": "Revisar inventario y demanda",
      "revisado": false
    }
  ],
  "total": 45,
  "estadisticas": {
    "total_en_periodo": 45,
    "criticas": 8,
    "alta_prioridad": 15,
    "pendientes": 38,
    "cambios_abc": 28,
    "cambios_xyz": 17
  }
}
```

### 2. GET `/api/alertas/resumen-tiendas`

Resumen de alertas agrupadas por tienda.

**Parámetros**:
- `dias` (default: 30): Ventana de tiempo

**Respuesta**:
```json
{
  "success": true,
  "resumen": [
    {
      "ubicacion_id": "tienda_01",
      "total_alertas": 15,
      "alertas_criticas": 3,
      "prioridad_alta": 8,
      "prioridad_media": 5,
      "prioridad_baja": 2,
      "pendientes_revision": 12,
      "cambios_abc": 9,
      "cambios_xyz": 6,
      "ultima_alerta": "2025-11-12T14:30:00"
    }
  ],
  "total_tiendas": 16
}
```

### 3. POST `/api/alertas/{alerta_id}/revisar`

Marca una alerta como revisada. **Requiere autenticación**.

**Body**:
```json
{
  "notas": "Se ajustó el stock de seguridad según nueva demanda"
}
```

**Respuesta**:
```json
{
  "success": true,
  "message": "Alerta marcada como revisada",
  "alerta_id": "uuid",
  "revisado_por": "admin@lagranja.com"
}
```

### 4. GET `/api/productos/{codigo}/historico-abc-xyz`

Obtiene histórico completo de clasificaciones de un producto.

**Parámetros**:
- `codigo`: Código del producto (requerido)
- `ubicacion_id` (opcional): Filtrar por tienda
- `limit` (default: 50): Número de registros

**Respuesta**:
```json
{
  "success": true,
  "codigo_producto": "PROD-123",
  "clasificacion_actual": [
    {
      "ubicacion_id": "tienda_01",
      "clasificacion_abc_valor": "C",
      "clasificacion_xyz": "Z",
      "matriz_abc_xyz": "CZ",
      "valor_consumo_total": 45000.00,
      "ranking_valor": 1250,
      "coeficiente_variacion": 1.85,
      "fecha_calculo": "2025-11-12T10:00:00"
    }
  ],
  "historico": [
    {
      "fecha_calculo": "2025-10-12T10:00:00",
      "ubicacion_id": "tienda_01",
      "clasificacion_abc_valor": "A",
      "valor_consumo_total": 125000.50,
      "ranking_valor": 45
    }
  ],
  "total_registros": 12
}
```

---

## 🎯 Flujo de Trabajo

### Ejecución Diaria Automática

```bash
# 1. El cron job ejecuta el cálculo diario (3 AM)
0 3 * * * /path/to/ejecutar_abc_xyz.sh

# 2. Proceso:
# - Guarda histórico antiguo
# - Calcula nuevas clasificaciones ABC
# - Calcula nuevas clasificaciones XYZ
# - Detecta cambios
# - Imprime resumen en logs
```

### Consulta Manual

```bash
# Ejecutar cálculo manualmente con verbose
python3 database/calcular_abc_v2_por_tienda.py --verbose
python3 database/calcular_xyz_por_tienda.py --verbose
```

### Dashboard Web (TODO)

Los usuarios podrán:
1. Ver alertas pendientes de revisión
2. Filtrar por tienda, prioridad, tipo
3. Ver histórico de un producto específico
4. Marcar alertas como revisadas con notas
5. Exportar reportes

---

## 🚨 Tipos de Alertas

### Nivel: ALTA (Requiere acción inmediata)

- **A → C**: Producto de alto valor cayó drásticamente
- **C → A**: Producto de bajo valor ahora es crítico
- **X → Z** (en productos A): Demanda estable se volvió errática
- Cambios >50% en valor de consumo

### Nivel: MEDIA (Revisar pronto)

- **A → B** o **B → A**: Cambios entre clases adyacentes en productos críticos
- **Y → X** o **Y → Z**: Cambios de volatilidad moderados
- Cambios 20-50% en valor

### Nivel: BAJA (Informativo)

- **B → C** o **C → B**: Cambios en productos no críticos
- Cambios <20% en valor
- Productos clase C con cambios XYZ

---

## 📊 Métricas y KPIs

El sistema permite rastrear:

1. **Estabilidad del catálogo**: ¿Cuántos productos cambian de clasificación?
2. **Productos volátiles**: Productos con múltiples cambios en 90 días
3. **Tendencias por tienda**: ¿Qué tiendas tienen más cambios críticos?
4. **Tiempo de respuesta**: ¿Cuánto tardan en revisar alertas críticas?

---

## 🔜 Próximos Pasos

1. **Crear componente React** para visualizar alertas (TODO actual)
2. **Implementar notificaciones**: Email o Slack para alertas críticas
3. **Machine Learning**: Predecir próximos cambios de clasificación
4. **Acciones automatizadas**: Ajustar stock de seguridad automáticamente
5. **Reportes semanales**: Resumen de cambios por email

---

## 🧪 Testing

### Verificar histórico guardado

```bash
python3 -c "
import duckdb
conn = duckdb.connect('data/fluxion_production.db')
count = conn.execute('SELECT COUNT(*) FROM productos_abc_v2_historico').fetchone()[0]
print(f'Registros históricos: {count:,}')
"
```

### Verificar tabla de alertas

```bash
python3 -c "
import duckdb
conn = duckdb.connect('data/fluxion_production.db')
count = conn.execute('SELECT COUNT(*) FROM alertas_cambio_clasificacion').fetchone()[0]
print(f'Alertas registradas: {count:,}')
"
```

### Probar endpoints

```bash
# Obtener alertas pendientes
curl http://localhost:8001/api/alertas/cambios-clasificacion?solo_pendientes=true

# Obtener resumen por tiendas
curl http://localhost:8001/api/alertas/resumen-tiendas

# Histórico de un producto
curl http://localhost:8001/api/productos/PROD-123/historico-abc-xyz
```

---

## 📝 Notas de Implementación

- Los scripts están listos para ejecutarse en producción
- El histórico se guarda **antes** de borrar, garantizando no perder datos
- Los cambios se detectan automáticamente comparando con el último registro histórico
- Las alertas críticas se identifican inmediatamente
- El sistema es retrocompatible: funciona aunque no haya histórico previo

---

## 🐛 Troubleshooting

### No se guardan registros en histórico

**Problema**: La tabla `productos_abc_v2_historico` está vacía después de ejecutar.

**Solución**:
- Verificar que existe data anterior con las mismas fechas inicio/fin
- Revisar logs del script con `--verbose`
- Primera ejecución no tendrá histórico (es esperado)

### No se detectan cambios

**Problema**: El script no muestra alertas de cambios.

**Solución**:
- Es normal en la primera ejecución (no hay histórico previo)
- Ejecutar dos veces para ver cambios entre ejecuciones
- Verificar que hay registros en `productos_abc_v2_historico`

---

**Última actualización**: 2025-11-12
**Versión**: 1.0
**Autor**: Sistema Fluxion AI
