# KLK POS Connector - Documentación

## Resumen

Este módulo implementa un conector para extraer datos de inventario desde el sistema POS **KLK** a través de su API REST. Las tiendas Bosque y Periférico han migrado de Stellar a KLK, requiriendo un nuevo adaptador para la extracción de datos.

**Fecha de implementación:** 2025-01-17
**Autor:** ETL Team
**Sistema fuente:** KLK POS API
**Sistema destino:** DuckDB (fluxion_production.db)

---

## Tiendas que usan KLK

| Tienda ID | Nombre | Código Almacén KLK | Estado |
|-----------|--------|-------------------|--------|
| `tienda_01` | PERIFERICO | `APP-TPF` | ✅ Activo |
| `tienda_08` | BOSQUE | `APP-BOS` | ⚠️ Verificar código |

> **IMPORTANTE:** El código de almacén `APP-BOS` para BOSQUE debe ser confirmado con el cliente.

---

## Arquitectura del Conector

### Componentes Principales

```
etl/core/
├── extractor_inventario_klk.py      # Extractor API REST KLK
├── transformer_inventario_klk.py    # Transformador KLK → DuckDB
├── etl_inventario_klk.py            # Orquestador ETL principal
└── tiendas_config.py                # Configuración actualizada con campo sistema_pos
```

### Flujo de Datos

```
┌─────────────────┐
│   KLK POS API   │
│  (HTTP REST)    │
└────────┬────────┘
         │
         │ POST /maestra/articulos
         │ {"CodigoAlmacen": "APP-TPF"}
         │
         ▼
┌─────────────────────────┐
│  extractor_inventario   │
│  _klk.py                │
│  - Hace POST request    │
│  - Maneja reintentos    │
│  - Logging robusto      │
└────────┬────────────────┘
         │
         │ DataFrame raw (formato KLK)
         │
         ▼
┌─────────────────────────┐
│  transformer_inventario │
│  _klk.py                │
│  - Mapea campos         │
│  - Limpia datos         │
│  - Valida calidad       │
└────────┬────────────────┘
         │
         │ DataFrame productos + DataFrame stock_actual
         │
         ▼
┌─────────────────────────┐
│  loader.py              │
│  - UPSERT productos     │
│  - UPSERT stock_actual  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│   DuckDB                │
│   fluxion_production.db │
└─────────────────────────┘
```

---

## API KLK - Especificación

### Endpoint: Inventario

**URL:** `http://190.6.32.3:7002/maestra/articulos`
**Método:** `POST`
**Content-Type:** `application/json`

#### Request Body

```json
{
    "CodigoAlmacen": "APP-TPF"
}
```

#### Response Body (Ejemplo)

```json
[
    {
        "NombreProducto": "JAMON ESPALDA AHUM. SHOULDER DRAGOS KG PZA COMP",
        "Codigo": "000001",
        "Barra": "001",
        "Categoria": "N/A",
        "Descripcion": "N/A",
        "Subcategoria": "N/A",
        "Descripcion_categoria": "N/A",
        "Marca": "DRAGOS",
        "Precio": 4.939655,
        "Iva": 16,
        "stock": 0
    },
    {
        "NombreProducto": "ROMERO KG",
        "Codigo": "000006",
        "Barra": "01024",
        "Categoria": "08",
        "Descripcion": "FRUVER",
        "Subcategoria": "1",
        "Descripcion_categoria": "POR PESO",
        "Precio": 5.77,
        "Iva": 0,
        "stock": 10
    }
]
```

#### Campos del Response

| Campo KLK | Tipo | Descripción |
|-----------|------|-------------|
| `Codigo` | String | Código interno del producto |
| `Barra` | String | Código de barras (EAN/UPC) |
| `NombreProducto` | String | Descripción del producto |
| `Categoria` | String | ID de categoría |
| `Descripcion` | String | Nombre de categoría |
| `Subcategoria` | String | ID de subcategoría |
| `Descripcion_categoria` | String | Descripción de categoría/grupo |
| `Marca` | String | Marca del producto |
| `Precio` | Decimal | Precio de venta |
| `Iva` | Integer | Porcentaje de IVA (0, 16, etc.) |
| `stock` | Decimal | Cantidad en stock (puede ser negativa) |

---

## Mapeo de Campos

### KLK API → Tabla `productos`

| Campo KLK | Campo DuckDB | Transformación |
|-----------|--------------|----------------|
| `Codigo` | `codigo` | Directo (trim) |
| `Barra` | `codigo_barras` | Directo (trim) |
| `NombreProducto` | `descripcion` | Trim, max 200 chars |
| `NombreProducto` | `descripcion_corta` | Trim, max 50 chars |
| `Categoria` | `categoria_id` | Directo, default '99' |
| `Descripcion` | `categoria` | Replace 'N/A' → 'SIN CATEGORIA' |
| `Subcategoria` | `subcategoria` | Replace 'N/A' → NULL |
| `Descripcion_categoria` | `grupo` | Replace 'N/A' → NULL |
| `Marca` | `marca` | Replace 'N/A' → NULL |
| `Precio` | `precio_venta` | Numeric, default 0 |
| `Iva` | `impuesto_porcentaje` | Numeric, default 0 |
| - | `unidad_medida` | Default 'UND' |
| - | `activo` | Default TRUE |
| - | `fuente_sistema` | Default 'KLK' |

### KLK API → Tabla `stock_actual`

| Campo KLK | Campo DuckDB | Transformación |
|-----------|--------------|----------------|
| `Codigo` | `producto_id` | Directo (codigo producto) |
| - | `ubicacion_id` | From context (tienda_01, tienda_08) |
| `stock` | `cantidad` | Numeric, default 0 |
| `stock` | `cantidad_disponible` | Max(0, stock) - solo positivos |
| - | `cantidad_reservada` | Default 0 |
| `Precio` × `stock` | `valor_inventario` | Calculado |
| `Precio` | `costo_promedio` | Usar precio como proxy |
| - | `ultima_actualizacion` | Timestamp actual |
| - | `fuente_sistema` | Default 'KLK' |

---

## Configuración de Tiendas

### Antes (Solo Stellar)

```python
"tienda_01": TiendaConfig(
    ubicacion_id="tienda_01",
    ubicacion_nombre="PERIFERICO",
    server_ip="192.168.20.12",
    database_name="VAD10",
    # ... Stellar config
),
```

### Después (Soporte KLK)

```python
"tienda_01": TiendaConfig(
    ubicacion_id="tienda_01",
    ubicacion_nombre="PERIFERICO",
    server_ip="192.168.20.12",
    database_name="VAD10",
    # ... Stellar config (aún disponible como fallback)
    sistema_pos="klk",              # 🆕 Identificador de sistema
    codigo_almacen_klk="APP-TPF"    # 🆕 Código almacén en KLK
),
```

### Nuevas Funciones Helper

```python
from tiendas_config import get_tiendas_klk, get_tiendas_stellar

# Obtener solo tiendas KLK
tiendas_klk = get_tiendas_klk()
# {"tienda_01": TiendaConfig(...), "tienda_08": TiendaConfig(...)}

# Obtener solo tiendas Stellar
tiendas_stellar = get_tiendas_stellar()
# {"tienda_02": TiendaConfig(...), "tienda_03": TiendaConfig(...), ...}
```

---

## Uso del ETL

### Instalación de Dependencias

```bash
cd etl
pip install requests pandas python-dotenv
```

### Variables de Entorno

Crear/actualizar `etl/.env`:

```bash
# KLK API Configuration
KLK_API_BASE_URL=http://190.6.32.3:7002
KLK_API_TIMEOUT=60
KLK_API_MAX_RETRIES=3
KLK_API_RETRY_DELAY=5
```

### Ejecución

#### Procesar todas las tiendas KLK

```bash
cd etl/core
python etl_inventario_klk.py
```

#### Procesar solo PERIFERICO

```bash
python etl_inventario_klk.py --tiendas tienda_01
```

#### Procesar PERIFERICO y BOSQUE

```bash
python etl_inventario_klk.py --tiendas tienda_01 tienda_08
```

#### Modo Dry-Run (sin cargar a DB)

```bash
python etl_inventario_klk.py --dry-run
```

Útil para:
- Probar extracción sin modificar la base de datos
- Validar transformaciones
- Debug de nuevas tiendas

#### Modo Verbose

```bash
python etl_inventario_klk.py --verbose
```

### Salida Esperada

```
################################################################################
# ETL INVENTARIO KLK - INICIO
# Fecha: 2025-01-17 14:30:00
# Modo: PRODUCCIÓN
################################################################################

🎯 Tiendas KLK a procesar: 2
   - PERIFERICO (tienda_01) - Almacén: APP-TPF
   - BOSQUE (tienda_08) - Almacén: APP-BOS

================================================================================
🏪 PROCESANDO: PERIFERICO (tienda_01)
================================================================================

📡 PASO 1/3: Extrayendo inventario desde KLK API...
   🏪 Tienda: PERIFERICO (código: 01)
   🌐 Endpoint: POST http://190.6.32.3:7002/maestra/articulos
✅ Inventario extraído: 1,234 productos en 2.45s

🔄 PASO 2/3: Transformando datos al esquema DuckDB...
✅ Transformación exitosa:
   - Productos: 1,234
   - Stock: 1,234

💾 PASO 3/3: Cargando datos a DuckDB...
   ✅ Productos cargados: 1,234
   ✅ Stock cargado: 1,234

✅ PERIFERICO procesada exitosamente

[... repite para BOSQUE ...]

################################################################################
# ETL INVENTARIO KLK - RESUMEN
################################################################################

📊 ESTADÍSTICAS:
   Tiendas procesadas:     2
   Tiendas exitosas:       2 ✅
   Tiendas fallidas:       0 ❌
   Productos extraídos:    2,468
   Productos cargados:     2,468
   Stock cargado:          2,468

⏱️  TIEMPO:
   Inicio:   2025-01-17 14:30:00
   Fin:      2025-01-17 14:32:15
   Duración: 135.23 segundos

✅ ETL COMPLETADO EXITOSAMENTE
################################################################################
```

---

## Testing

### Test del Extractor

```bash
cd etl/core
python extractor_inventario_klk.py
```

Ejecuta:
- Test de conexión a KLK API
- Extracción de muestra de PERIFERICO
- Extracción de muestra de BOSQUE
- Validación de respuesta

### Test del Transformer

```bash
python transformer_inventario_klk.py
```

Ejecuta:
- Transformación de datos de ejemplo
- Validación de mapeo de campos
- Verificación de calidad de datos

### Test de Componentes Individuales

```python
# Test rápido en Python REPL
from extractor_inventario_klk import InventarioKLKExtractor
from tiendas_config import get_tienda_config

extractor = InventarioKLKExtractor()
config = get_tienda_config("tienda_01")

# Test de conexión
extractor.test_connection(config)

# Extracción completa
df = extractor.extract_inventario_data(config)
print(f"Productos extraídos: {len(df)}")
```

---

## Logging

### Ubicación de Logs

```
etl/logs/
├── etl_inventario_klk_20250117_143000.log
├── inventario_klk_extractor_20250117.log
└── inventario_klk_transformer_20250117.log
```

### Ejemplo de Log

```
2025-01-17 14:30:15 - etl_inventario_klk - INFO - 🎯 Tiendas KLK a procesar: 2
2025-01-17 14:30:15 - etl_inventario_klk_extractor - INFO - 📡 Extrayendo inventario desde KLK API
2025-01-17 14:30:15 - etl_inventario_klk_extractor - INFO -    🏪 Tienda: PERIFERICO (tienda_01)
2025-01-17 14:30:15 - etl_inventario_klk_extractor - INFO -    📦 Código Almacén KLK: APP-TPF
2025-01-17 14:30:17 - etl_inventario_klk_extractor - INFO - ✅ Inventario extraído: 1,234 productos en 2.45s
```

---

## Manejo de Errores

### Errores HTTP

El extractor maneja automáticamente:
- **Timeout:** Reintenta hasta 3 veces
- **Connection Error:** Reintenta con delay exponencial
- **HTTP 4xx/5xx:** Log detallado y reintento

### Validaciones

El transformer valida:
- ✅ Productos sin descripción → ERROR
- ⚠️ Productos sin categoría → WARNING
- ⚠️ Stock negativo → WARNING (permitido, se carga)
- ✅ Códigos duplicados → WARNING

### Estrategia de Recuperación

1. **Extracción falla:** Reintenta hasta 3 veces con delay de 5s
2. **Transformación falla:** Skip tienda, continúa con siguiente
3. **Carga falla:** Rollback de tienda, continúa con siguiente

---

## Integración con Sistema Existente

### Stellar vs KLK - Coexistencia

El sistema ahora soporta **ambos POS simultáneamente**:

```python
# ETL Stellar (tiendas antiguas)
python etl_ventas_historico.py --tiendas tienda_02 tienda_03 ...

# ETL KLK (tiendas migradas)
python etl_inventario_klk.py --tiendas tienda_01 tienda_08
```

### Identificación de Sistema POS

```python
from tiendas_config import get_tienda_config

config = get_tienda_config("tienda_01")

if config.sistema_pos == "klk":
    # Usar extractor KLK
    from extractor_inventario_klk import InventarioKLKExtractor
    extractor = InventarioKLKExtractor()
else:
    # Usar extractor Stellar
    from extractor import SQLServerExtractor
    extractor = SQLServerExtractor()
```

### Factory Pattern (Futuro)

Para simplificar, se puede implementar un factory:

```python
# extractor_factory.py (ejemplo futuro)
def get_extractor(config):
    if config.sistema_pos == "klk":
        return InventarioKLKExtractor()
    elif config.sistema_pos == "stellar":
        return SQLServerExtractor()
    else:
        raise ValueError(f"Sistema POS no soportado: {config.sistema_pos}")
```

---

## Próximos Pasos

### 1. Ventas desde KLK

El próximo paso es implementar extracción de **ventas** desde KLK:

```
TODO: Crear extractor_ventas_klk.py
- Endpoint: POST /ventas/transacciones
- Parámetros: CodigoAlmacen, FechaInicio, FechaFin
- Mapeo a tabla `ventas`
```

### 2. Confirmación de Códigos

Verificar con el cliente:
- ✅ `APP-TPF` para PERIFERICO
- ⚠️ `APP-BOS` para BOSQUE (a confirmar)

### 3. Automatización

Agregar a cron/scheduler:

```bash
# Crontab example - cada 2 horas
0 */2 * * * cd /path/to/etl/core && python etl_inventario_klk.py
```

### 4. Monitoreo

Integrar con sistema de alertas:
- Sentry para errores críticos
- Slack/Email para notificaciones
- Métricas de Datadog/CloudWatch

---

## Troubleshooting

### Error: "No hay tiendas configuradas con sistema KLK"

**Causa:** No hay tiendas con `sistema_pos="klk"` en `tiendas_config.py`

**Solución:**
```python
# Verificar configuración
from tiendas_config import get_tiendas_klk
print(get_tiendas_klk())
```

### Error: "Timeout (60s) en intento 1"

**Causa:** API KLK no responde o red lenta

**Solución:**
1. Verificar conectividad: `curl -X POST http://190.6.32.3:7002/maestra/articulos`
2. Aumentar timeout: `export KLK_API_TIMEOUT=120`

### Error: "HTTP 404: Endpoint no encontrado"

**Causa:** URL del endpoint incorrecta

**Solución:**
```bash
# Verificar endpoint manualmente
curl -X POST http://190.6.32.3:7002/maestra/articulos \
  -H "Content-Type: application/json" \
  -d '{"CodigoAlmacen":"APP-TPF"}'
```

### Warning: "Stock negativo detectado"

**Causa:** KLK permite stock negativo (ventas > inventario)

**Comportamiento:** Se carga normalmente, es dato válido del sistema

---

## Contacto y Soporte

Para preguntas o issues:
- **Equipo:** ETL Team
- **Documentación:** `/docs/KLK_CONNECTOR_README.md`
- **Logs:** `etl/logs/`
- **Código:** `etl/core/extractor_inventario_klk.py`

---

**Última actualización:** 2025-01-17
**Versión:** 1.0
