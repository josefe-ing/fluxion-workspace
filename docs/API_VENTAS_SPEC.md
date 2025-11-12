# API de Ventas - Especificación para Nuevo Proveedor POS

**Versión**: 1.0
**Fecha**: 2025-11-12
**Cliente**: La Granja Mercado
**Sistema**: Fluxion AI - Inventory Management

---

## Resumen Ejecutivo

Este documento especifica el endpoint REST que el nuevo proveedor de POS debe implementar para reemplazar el actual proceso ETL de extracción de ventas desde SQL Server.

**Objetivo**: Proveer un endpoint HTTP GET que retorne todas las ventas de una tienda para un rango de fechas específico, en formato JSON.

---

## 1. Endpoint Principal

### GET `/api/ventas`

Extrae todas las transacciones de venta para una tienda en un rango de fechas.

#### Parámetros de Query

| Parámetro | Tipo | Requerido | Descripción | Ejemplo |
|-----------|------|-----------|-------------|---------|
| `tienda_codigo` | string | ✅ Sí | Código único de la tienda | `"08"` |
| `fecha_desde` | date | ✅ Sí | Fecha inicial del rango (inclusive) | `"2025-01-01"` |
| `fecha_hasta` | date | ✅ Sí | Fecha final del rango (inclusive) | `"2025-01-31"` |


#### URL Ejemplo

```
GET https://pos-api.ejemplo.com/api/ventas?tienda_codigo=08&fecha_desde=2025-01-01&fecha_hasta=2025-01-31
```

---

## 2. Estructura de Respuesta

### Formato de Respuesta

```json
{
  "meta": {
    "tienda_codigo": "08",
    "tienda_nombre": "BOSQUE",
    "fecha_desde": "2025-01-01",
    "fecha_hasta": "2025-01-31",
    "total_registros": 45823,
    "fecha_generacion": "2025-01-31T23:59:59Z",
    "version_api": "1.0"
  },
  "ventas": [
    {
      "numero_factura": "001044414",
      "fecha": "2025-10-09",
      "hora": "07:18:52",
      "linea": 1,

      "producto": {
        "codigo": "000128",
        "descripcion": "MANDARINA KG",
        "marca": "FRUVERVARIOS",
        "modelo": "KG",
        "presentacion": "KG",
        "categoria": "FRUVER",
        "grupo": "FRUTA",
        "subgrupo": "ENTERO",
        "cuadrante": "CUADRANTE IX"
      },

      "cantidad": {
        "vendida": 0.22,
        "bultos": 1.0,
        "peso_unitario": 1.0,
        "peso_total": 0.22,
        "volumen_unitario": 0.001,
        "tipo_peso": 2
      },

      "financiero": {
        "costo_unitario": 2.16,
        "precio_unitario": 2.66,
        "costo_total": 0.48,
        "venta_total": 0.59,
        "impuesto_porcentaje": 0.0,
        "impuesto_total": 0.0,
        "utilidad_bruta": 0.11
      }
    },
    {
      "numero_factura": "001044420",
      "fecha": "2025-10-09",
      "hora": "07:43:07",
      "linea": 7,

      "producto": {
        "codigo": "000099",
        "descripcion": "TOMATE KG",
        "marca": "FRUVERVARIOS",
        "modelo": "30 KG",
        "presentacion": "KG",
        "categoria": "FRUVER",
        "grupo": "LEGUMBRE",
        "subgrupo": "ENTERO",
        "cuadrante": "CUADRANTE IX"
      },

      "cantidad": {
        "vendida": 0.305,
        "bultos": 1.0,
        "peso_unitario": 1.0,
        "peso_total": 0.305,
        "volumen_unitario": 0.0,
        "tipo_peso": 2
      },

      "financiero": {
        "costo_unitario": 0.87,
        "precio_unitario": 0.88,
        "costo_total": 0.27,
        "venta_total": 0.27,
        "impuesto_porcentaje": 0.0,
        "impuesto_total": 0.0,
        "utilidad_bruta": 0.0
      }
    },
    {
      "numero_factura": "001044421",
      "fecha": "2025-10-09",
      "hora": "07:50:04",
      "linea": 5,

      "producto": {
        "codigo": "003119",
        "descripcion": "QUESO BLANCO LLANERO KG",
        "marca": "GRANJA",
        "modelo": "KG",
        "presentacion": "KG",
        "categoria": "CHARCUTERIA",
        "grupo": "QUESO",
        "subgrupo": "OTROS",
        "cuadrante": "CUADRANTE VI"
      },

      "cantidad": {
        "vendida": 0.445,
        "bultos": 1.0,
        "peso_unitario": 1.0,
        "peso_total": 0.445,
        "volumen_unitario": 0.001,
        "tipo_peso": 2
      },

      "financiero": {
        "costo_unitario": 6.20,
        "precio_unitario": 6.74,
        "costo_total": 2.76,
        "venta_total": 3.00,
        "impuesto_porcentaje": 0.0,
        "impuesto_total": 0.0,
        "utilidad_bruta": 0.24
      }
    },
    {
      "numero_factura": "001044422",
      "fecha": "2025-10-09",
      "hora": "07:53:41",
      "linea": 6,

      "producto": {
        "codigo": "000128",
        "descripcion": "MANDARINA KG",
        "marca": "FRUVERVARIOS",
        "modelo": "KG",
        "presentacion": "KG",
        "categoria": "FRUVER",
        "grupo": "FRUTA",
        "subgrupo": "ENTERO",
        "cuadrante": "CUADRANTE IX"
      },

      "cantidad": {
        "vendida": 1.115,
        "bultos": 1.0,
        "peso_unitario": 1.0,
        "peso_total": 1.115,
        "volumen_unitario": 0.001,
        "tipo_peso": 2
      },

      "financiero": {
        "costo_unitario": 2.16,
        "precio_unitario": 2.66,
        "costo_total": 2.41,
        "venta_total": 2.97,
        "impuesto_porcentaje": 0.0,
        "impuesto_total": 0.0,
        "utilidad_bruta": 0.56
      }
    },
    {
      "numero_factura": "001044422",
      "fecha": "2025-10-09",
      "hora": "07:53:41",
      "linea": 7,

      "producto": {
        "codigo": "000099",
        "descripcion": "TOMATE KG",
        "marca": "FRUVERVARIOS",
        "modelo": "30 KG",
        "presentacion": "KG",
        "categoria": "FRUVER",
        "grupo": "LEGUMBRE",
        "subgrupo": "ENTERO",
        "cuadrante": "CUADRANTE IX"
      },

      "cantidad": {
        "vendida": 0.54,
        "bultos": 1.0,
        "peso_unitario": 1.0,
        "peso_total": 0.54,
        "volumen_unitario": 0.0,
        "tipo_peso": 2
      },

      "financiero": {
        "costo_unitario": 0.87,
        "precio_unitario": 0.88,
        "costo_total": 0.47,
        "venta_total": 0.48,
        "impuesto_porcentaje": 0.0,
        "impuesto_total": 0.0,
        "utilidad_bruta": 0.01
      }
    },
    {
      "numero_factura": "002056888",
      "fecha": "2025-10-09",
      "hora": "08:24:57",
      "linea": 18,

      "producto": {
        "codigo": "003628",
        "descripcion": "MORTADELA TURZA 900 GR",
        "marca": "TURZA",
        "modelo": "BTO 12 UND",
        "presentacion": "UNI",
        "categoria": "CHARCUTERIA",
        "grupo": "EMBUTIDOS",
        "subgrupo": "MORTADELA",
        "cuadrante": "CUADRANTE VI"
      },

      "cantidad": {
        "vendida": 1.0,
        "bultos": 12.0,
        "peso_unitario": 0.9,
        "peso_total": 1.0,
        "volumen_unitario": 0.0,
        "tipo_peso": 0
      },

      "financiero": {
        "costo_unitario": 1.95,
        "precio_unitario": 2.24,
        "costo_total": 1.95,
        "venta_total": 2.24,
        "impuesto_porcentaje": 0.0,
        "impuesto_total": 0.0,
        "utilidad_bruta": 0.29
      }
    }
  ]
}
```

### Descripción de Campos

#### Objeto `meta`
Información sobre la consulta y el contexto de los datos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `tienda_codigo` | string | Código de la tienda consultada |
| `tienda_nombre` | string | Nombre de la tienda |
| `fecha_desde` | date | Fecha inicial del rango |
| `fecha_hasta` | date | Fecha final del rango |
| `total_registros` | integer | Número total de registros en el array `ventas` |
| `fecha_generacion` | datetime | Timestamp de cuando se generó la respuesta (ISO8601) |
| `version_api` | string | Versión de la API |

#### Array `ventas[]`
Lista de todas las líneas de venta (items de facturas).

**Información de Transacción**

| Campo | Tipo | Requerido | Descripción | Ejemplo |
|-------|------|-----------|-------------|---------|
| `numero_factura` | string | ✅ | Número único de factura | `"0001-00012345"` |
| `fecha` | date | ✅ | Fecha de la venta (YYYY-MM-DD) | `"2025-01-15"` |
| `hora` | time | ✅ | Hora de la venta (HH:MM:SS) | `"14:35:22"` |
| `linea` | integer | ✅ | Número de línea en la factura | `1` |
| `codigo_transaccion` | string | ❌ | Código interno de transacción del POS | `"TXN-12345"` |

**Objeto `producto`**

| Campo | Tipo | Requerido | Descripción | Ejemplo |
|-------|------|-----------|-------------|---------|
| `codigo` | string | ✅ | Código único del producto (SKU) | `"PROD-001234"` |
| `descripcion` | string | ✅ | Descripción completa del producto | `"HARINA PAN 1KG BLANCA"` |
| `marca` | string | ❌ | Marca del producto | `"POLAR"` |
| `modelo` | string | ❌ | Modelo del producto | `"HP1000"` |
| `presentacion` | string | ❌ | Presentación/tamaño | `"1KG"` |
| `categoria` | string | ❌ | Categoría principal | `"ABARROTES"` |
| `grupo` | string | ❌ | Grupo de productos | `"HARINAS"` |
| `subgrupo` | string | ❌ | Subgrupo específico | `"HARINA PRECOCIDA"` |
| `cuadrante` | string | ❌ | Ubicación física en tienda | `"A-12"` |

**Objeto `cantidad`**

| Campo | Tipo | Requerido | Descripción | Ejemplo |
|-------|------|-----------|-------------|---------|
| `vendida` | decimal | ✅ | Cantidad vendida | `2.0` |
| `bultos` | decimal | ❌ | Cantidad de bultos/cajas | `1.0` |
| `peso_unitario` | decimal | ❌ | Peso unitario en gramos | `1000.0` |
| `peso_total` | decimal | ❌ | Peso total vendido (gramos) | `2000.0` |
| `volumen_unitario` | decimal | ❌ | Volumen unitario en ml | `null` |
| `tipo_peso` | integer | ❌ | Tipo de peso (1=fijo, 2=variable) | `1` |

**Objeto `financiero`**

| Campo | Tipo | Requerido | Descripción | Ejemplo |
|-------|------|-----------|-------------|---------|
| `costo_unitario` | decimal | ✅ | Costo unitario del producto | `1.25` |
| `precio_unitario` | decimal | ✅ | Precio unitario de venta | `2.50` |
| `costo_total` | decimal | ✅ | Costo total (cantidad × costo_unitario) | `2.50` |
| `venta_total` | decimal | ✅ | Venta total (cantidad × precio_unitario) | `5.00` |
| `impuesto_porcentaje` | decimal | ❌ | Porcentaje de impuesto aplicado | `16.0` |
| `impuesto_total` | decimal | ❌ | Impuesto total calculado | `0.80` |
| `utilidad_bruta` | decimal | ❌ | Utilidad bruta (venta_total - costo_total) | `2.50` |

---

## 3. Códigos de Tienda

Mapeo de códigos de tiendas de La Granja Mercado:

| Código | Nombre | Activo |
|--------|--------|--------|
| `01` | PERIFERICO | ✅ |
| `02` | AV. BOLIVAR | ✅ |
| `03` | MAÑONGO | ✅ |
| `04` | SAN DIEGO | ✅ |
| `05` | VIVIENDA | ✅ |
| `06` | NAGUANAGUA | ✅ |
| `07` | CENTRO | ✅ |
| `08` | BOSQUE | ✅ |
| `09` | GUACARA | ✅ |
| `10` | FERIAS | ✅ |
| `11` | FLOR AMARILLO | ✅ |
| `12` | PARAPARAL | ✅ |
| `13` | NAGUANAGUA III | ✅ |
| `15` | ISABELICA | ✅ |
| `16` | TOCUYITO | ✅ |
| `19` | GUIGUE | ✅ |
| `20` | TAZAJAL | ✅ |

**Nota**: Los CEDIs (centros de distribución) NO tienen ventas y no deben incluirse en este endpoint.

---

## 4. Manejo de Errores

### Códigos HTTP

| Código | Significado | Ejemplo de Uso |
|--------|-------------|----------------|
| `200` | OK | Datos retornados exitosamente |
| `400` | Bad Request | Parámetros inválidos o faltantes |
| `401` | Unauthorized | Autenticación requerida o inválida |
| `404` | Not Found | Tienda no encontrada |
| `422` | Unprocessable Entity | Rango de fechas inválido |
| `500` | Internal Server Error | Error del servidor |
| `503` | Service Unavailable | Servicio temporalmente no disponible |

### Formato de Error

```json
{
  "error": {
    "codigo": "INVALID_DATE_RANGE",
    "mensaje": "La fecha inicial no puede ser mayor que la fecha final",
    "detalles": {
      "fecha_desde": "2025-02-01",
      "fecha_hasta": "2025-01-01"
    },
    "timestamp": "2025-01-31T23:59:59Z"
  }
}
```

### Códigos de Error Específicos

| Código | Descripción |
|--------|-------------|
| `INVALID_DATE_RANGE` | Rango de fechas inválido |
| `TIENDA_NOT_FOUND` | Código de tienda no existe |
| `MISSING_PARAMETER` | Parámetro requerido faltante |
| `INVALID_FORMAT` | Formato de parámetro inválido |
| `DATE_RANGE_TOO_LARGE` | Rango de fechas excede el máximo permitido |

---

## 5. Consideraciones de Performance

### Límites y Paginación

**Recomendación**: No implementar paginación inicialmente. El sistema cliente está diseñado para manejar respuestas grandes (hasta 1M+ registros por mes por tienda).

**Límite máximo de rango**: Se recomienda limitar consultas a máximo 31 días para evitar timeouts.

### Timeouts

- **Timeout de lectura**: El cliente esperará hasta 10 minutos (600 segundos)
- **Timeout de conexión**: 30 segundos

### Volumen Esperado

| Tienda | Registros/día (promedio) | Registros/mes (estimado) |
|--------|--------------------------|--------------------------|
| BOSQUE | ~1,500 | ~45,000 |
| PERIFERICO | ~2,000 | ~60,000 |
| Otras | ~800-1,500 | ~24,000-45,000 |

**Total sistema**: ~600K-800K registros/mes para todas las tiendas.

---

## 6. Seguridad

### Autenticación

**Método recomendado**: API Key en header

```http
GET /api/ventas?tienda_codigo=08&fecha_desde=2025-01-01&fecha_hasta=2025-01-31
Host: pos-api.ejemplo.com
Authorization: Bearer {API_KEY}
```

O alternativamente, Basic Auth o OAuth2.

### Consideraciones

- ✅ Usar HTTPS (TLS 1.2+)
- ✅ Validar todos los parámetros de entrada
- ✅ Rate limiting (sugerido: 60 requests/hora por IP)
- ✅ Logs de auditoría para todas las consultas

---

## 7. Formato de Datos

### Tipos de Datos

| Campo | Tipo SQL | Tipo JSON | Formato | Ejemplo |
|-------|----------|-----------|---------|---------|
| Fecha | DATE | string | `YYYY-MM-DD` | `"2025-01-15"` |
| Hora | TIME | string | `HH:MM:SS` | `"14:35:22"` |
| Timestamp | DATETIME | string | ISO8601 | `"2025-01-15T14:35:22Z"` |
| Decimal (precio) | DECIMAL(12,4) | number | 4 decimales | `2.5000` |
| Decimal (cantidad) | DECIMAL(12,3) | number | 3 decimales | `2.000` |
| String | VARCHAR | string | UTF-8 | `"PRODUCTO"` |

### Manejo de Nulos

- Campos opcionales pueden ser `null` o omitirse
- Campos numéricos nulos deben ser `null`, NO `0`
- Strings nulos deben ser `null`, NO `""`

---

## 8. Ejemplo de Integración

### cURL

```bash
curl -X GET "https://pos-api.ejemplo.com/api/ventas?tienda_codigo=08&fecha_desde=2025-01-01&fecha_hasta=2025-01-31" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json"
```

### Python

```python
import requests

url = "https://pos-api.ejemplo.com/api/ventas"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Accept": "application/json"
}
params = {
    "tienda_codigo": "08",
    "fecha_desde": "2025-01-01",
    "fecha_hasta": "2025-01-31"
}

response = requests.get(url, headers=headers, params=params, timeout=600)
data = response.json()

print(f"Total ventas: {data['meta']['total_registros']}")
for venta in data['ventas']:
    print(f"Factura {venta['numero_factura']}: ${venta['financiero']['venta_total']}")
```

---

## 9. Testing y Validación

### Casos de Prueba Mínimos

1. **Happy Path**: Consulta de 1 mes completo para tienda activa
2. **Sin Datos**: Consulta de rango sin ventas (debe retornar array vacío)
3. **Tienda Inválida**: Código de tienda que no existe (404)
4. **Rango Inválido**: fecha_desde > fecha_hasta (400)
5. **Autenticación**: Request sin API key (401)
6. **Volumen Alto**: Consulta de mes con 100K+ registros

### Datos de Prueba

Proveer endpoint de testing con datos sintéticos:

```
GET /api/ventas/test?tienda_codigo=08&fecha_desde=2025-01-01&fecha_hasta=2025-01-31
```

---

## 10. Migración y Transición

### Plan de Implementación

1. **Fase 1 - Desarrollo** (2 semanas)
   - Implementar endpoint según especificación
   - Testing interno del proveedor

2. **Fase 2 - Testing Conjunto** (1 semana)
   - La Granja valida endpoint con tienda piloto (BOSQUE)
   - Ajustes según feedback

3. **Fase 3 - Rollout Gradual** (2 semanas)
   - Migrar 3 tiendas por semana
   - Monitoreo de performance y errores

4. **Fase 4 - Producción Completa**
   - Todas las tiendas migradas
   - Desactivar ETL antiguo

### Compatibilidad

El endpoint debe ser **backward compatible** por al menos 6 meses después del lanzamiento inicial.

---

## 11. Monitoreo y SLA

### SLA Propuesto

| Métrica | Objetivo |
|---------|----------|
| Uptime | 99.5% |
| Response time (p95) | < 60 segundos |
| Response time (p99) | < 120 segundos |
| Error rate | < 0.5% |

### Métricas a Reportar

- Requests por día
- Tiempo promedio de respuesta
- Tasa de errores (por código)
- Uptime del servicio

---

## 12. Soporte y Contacto

### Durante Implementación

- **Email técnico**: dev@lagranja.com.ve
- **Slack/Teams**: Canal #api-ventas-integration
- **Horario soporte**: Lunes a Viernes, 9am-6pm VET

### En Producción

- **Incidentes críticos**: +58 XXX-XXXXXXX (24/7)
- **Email soporte**: support@lagranja.com.ve
- **Tiempo de respuesta**: < 2 horas para críticos

---

## Anexo A: Mapeo de Campos ETL Actual → API

| Campo ETL Actual | Campo API | Notas |
|------------------|-----------|-------|
| `numero_factura` | `numero_factura` | Idéntico |
| `fecha` | `fecha` | Formato YYYY-MM-DD |
| `hora` | `hora` | Formato HH:MM:SS |
| `linea` | `linea` | Número de línea |
| `codigo_producto` | `producto.codigo` | Código SKU |
| `descripcion_producto` | `producto.descripcion` | Descripción |
| `marca_producto` | `producto.marca` | Marca |
| `modelo_producto` | `producto.modelo` | Modelo |
| `presentacion_producto` | `producto.presentacion` | Presentación |
| `categoria_producto` | `producto.categoria` | Categoría |
| `grupo_producto` | `producto.grupo` | Grupo |
| `subgrupo_producto` | `producto.subgrupo` | Subgrupo |
| `cantidad_vendida` | `cantidad.vendida` | Cantidad |
| `cantidad_bultos` | `cantidad.bultos` | Bultos |
| `peso_unitario` | `cantidad.peso_unitario` | Peso en gramos |
| `peso_calculado` | `cantidad.peso_total` | Peso total |
| `costo_unitario` | `financiero.costo_unitario` | Costo |
| `precio_unitario` | `financiero.precio_unitario` | Precio |
| `impuesto_porcentaje` | `financiero.impuesto_porcentaje` | % Impuesto |
| `costo_total` | `financiero.costo_total` | Costo total |
| `venta_total` | `financiero.venta_total` | Venta total |
| `utilidad_bruta` | `financiero.utilidad_bruta` | Utilidad |

---

## Anexo B: Ejemplo Completo de Respuesta

Ver archivo adjunto: `ejemplo_respuesta_completa.json`

---

**Documento preparado por**: Fluxion AI Team
**Última actualización**: 2025-11-12
**Versión**: 1.0
