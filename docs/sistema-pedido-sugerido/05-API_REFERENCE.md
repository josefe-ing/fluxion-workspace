# Referencia de API - Sistema de Pedido Sugerido

## Introducción

Esta documentación técnica describe los **endpoints REST** disponibles para interactuar con el sistema de pedido sugerido de FluxionIA.

**Base URL:** `http://localhost:8001` (desarrollo) o `https://api.fluxion.ai` (producción)

**Autenticación:** Se requiere token JWT en header `Authorization: Bearer <token>`

---

## Endpoints Disponibles

### 1. Calcular Nivel Objetivo (Un Producto)

Calcula el nivel objetivo de inventario para un producto específico en una tienda.

**Endpoint:** `POST /api/niveles-inventario/calcular`

**Request Body:**
```json
{
  "producto_id": "004962",
  "tienda_id": "tienda_01"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "producto_id": "004962",
    "tienda_id": "tienda_01",
    "matriz_abc_xyz": "AX",
    "demanda_promedio_diaria": 1802.43,
    "desviacion_estandar_diaria": 273.01,
    "demanda_ciclo": 4505.0,
    "stock_seguridad": 846.0,
    "nivel_objetivo": 5351.0,
    "inventario_en_transito": 0.0,
    "metodo_calculo": "NORMAL",
    "datos_calculo": {
      "periodo_reposicion_dias": 2.5,
      "nivel_servicio_z": 1.96,
      "multiplicador_demanda": 1.0,
      "multiplicador_ss": 1.0,
      "timestamp": "2025-01-12T10:30:00Z"
    }
  }
}
```

**Errores Posibles:**

| Código | Descripción | Solución |
|--------|-------------|----------|
| 400 | `producto_id` o `tienda_id` faltante | Incluir ambos parámetros |
| 404 | Producto no encontrado | Verificar que el código sea correcto |
| 404 | No hay datos históricos (< 8 semanas) | Esperar más datos o usar override manual |
| 404 | Parámetros no configurados para matriz | Inicializar parámetros de tienda |
| 500 | Error interno del servidor | Contactar soporte |

**Ejemplo con cURL:**
```bash
curl -X POST http://localhost:8001/api/niveles-inventario/calcular \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "producto_id": "004962",
    "tienda_id": "tienda_01"
  }'
```

**Ejemplo con Python:**
```python
import requests

url = "http://localhost:8001/api/niveles-inventario/calcular"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer <token>"
}
payload = {
    "producto_id": "004962",
    "tienda_id": "tienda_01"
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()

if data["success"]:
    nivel = data["data"]["nivel_objetivo"]
    print(f"Nivel objetivo: {nivel} unidades")
```

---

### 2. Calcular Cantidad Sugerida (Un Producto)

Calcula cuántas unidades deben enviarse desde el CEDI a la tienda.

**Endpoint:** `POST /api/niveles-inventario/cantidad-sugerida`

**Request Body:**
```json
{
  "producto_id": "004962",
  "tienda_id": "tienda_01",
  "stock_actual": 3000.0
}
```

**Parámetros:**
- `producto_id` (requerido): Código del producto
- `tienda_id` (requerido): ID de la tienda
- `stock_actual` (opcional): Stock actual en tienda. Si no se proporciona, se consulta de `stock_actual` table

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "producto_id": "004962",
    "tienda_id": "tienda_01",
    "matriz_abc_xyz": "AX",
    "nivel_objetivo": 5351.0,
    "stock_actual": 3000.0,
    "inventario_en_transito": 0.0,
    "cantidad_sugerida": 2351.0,
    "stock_seguridad": 846.0,
    "demanda_ciclo": 4505.0,
    "metodo_calculo": "NORMAL",
    "datos_calculo": {
      "demanda_promedio_diaria": 1802.43,
      "desviacion_estandar_diaria": 273.01,
      "periodo_reposicion_dias": 2.5,
      "nivel_servicio_z": 1.96,
      "multiplicador_demanda": 1.0,
      "multiplicador_ss": 1.0,
      "timestamp": "2025-01-12T10:35:00Z"
    }
  }
}
```

**Lógica de Cálculo:**
```
cantidad_sugerida = MAX(0, nivel_objetivo - stock_actual - inventario_en_transito)
```

**Ejemplo con cURL:**
```bash
curl -X POST http://localhost:8001/api/niveles-inventario/cantidad-sugerida \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "producto_id": "004962",
    "tienda_id": "tienda_01",
    "stock_actual": 3000
  }'
```

**Ejemplo con JavaScript (fetch):**
```javascript
const response = await fetch('http://localhost:8001/api/niveles-inventario/cantidad-sugerida', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <token>'
  },
  body: JSON.stringify({
    producto_id: '004962',
    tienda_id: 'tienda_01',
    stock_actual: 3000
  })
});

const data = await response.json();
console.log(`Cantidad sugerida: ${data.data.cantidad_sugerida} unidades`);
```

---

### 3. Calcular Niveles para Múltiples Productos (Tienda Completa)

Calcula niveles y cantidades sugeridas para todos los productos de una tienda.

**Endpoint:** `GET /api/niveles-inventario/tienda/{tienda_id}`

**Parámetros de Query:**
- `limite` (opcional): Número máximo de productos a retornar. Default: 100
- `solo_con_deficit` (opcional): Si es `true`, solo retorna productos con cantidad_sugerida > 0. Default: false

**Ejemplo URL:**
```
GET /api/niveles-inventario/tienda/tienda_01?limite=50&solo_con_deficit=true
```

**Response (200 OK):**
```json
{
  "success": true,
  "tienda_id": "tienda_01",
  "tienda_nombre": "PERIFERICO",
  "total_productos": 3740,
  "productos_calculados": 50,
  "productos_con_deficit": 42,
  "timestamp": "2025-01-12T11:00:00Z",
  "productos": [
    {
      "producto_id": "004962",
      "nombre_producto": "Arroz 1kg Premium",
      "matriz_abc_xyz": "AX",
      "stock_actual": 3000.0,
      "inventario_en_transito": 0.0,
      "nivel_objetivo": 5351.0,
      "cantidad_sugerida": 2351.0,
      "stock_seguridad": 846.0,
      "demanda_ciclo": 4505.0,
      "prioridad": 1
    },
    {
      "producto_id": "000096",
      "nombre_producto": "Aceite 900ml",
      "matriz_abc_xyz": "BY",
      "stock_actual": 15000.0,
      "inventario_en_transito": 5000.0,
      "nivel_objetivo": 30780.0,
      "cantidad_sugerida": 10780.0,
      "stock_seguridad": 8210.0,
      "demanda_ciclo": 22570.0,
      "prioridad": 5
    }
  ]
}
```

**Ordenamiento:**
Los productos se retornan ordenados por:
1. `prioridad_reposicion` (ascendente): Productos A antes que B antes que C
2. `cantidad_sugerida` (descendente): Mayores déficits primero

**Ejemplo con cURL:**
```bash
curl -X GET "http://localhost:8001/api/niveles-inventario/tienda/tienda_01?limite=100&solo_con_deficit=true" \
  -H "Authorization: Bearer <token>"
```

**Ejemplo con Python (pandas):**
```python
import requests
import pandas as pd

url = "http://localhost:8001/api/niveles-inventario/tienda/tienda_01"
params = {
    "limite": 100,
    "solo_con_deficit": True
}
headers = {"Authorization": "Bearer <token>"}

response = requests.get(url, params=params, headers=headers)
data = response.json()

if data["success"]:
    df = pd.DataFrame(data["productos"])
    print(f"Total productos con déficit: {len(df)}")
    print(df[["producto_id", "nombre_producto", "cantidad_sugerida", "prioridad"]])
```

---

## Modelos de Datos

### CalcularNivelObjetivoRequest

```typescript
interface CalcularNivelObjetivoRequest {
  producto_id: string;  // Código del producto
  tienda_id: string;    // ID de la tienda
}
```

### CalcularCantidadSugeridaRequest

```typescript
interface CalcularCantidadSugeridaRequest {
  producto_id: string;       // Código del producto
  tienda_id: string;         // ID de la tienda
  stock_actual?: number;     // Opcional: stock actual en tienda
}
```

### NivelObjetivoResponse

```typescript
interface NivelObjetivoResponse {
  success: boolean;
  data: {
    producto_id: string;
    tienda_id: string;
    matriz_abc_xyz: string;              // 'AX', 'BY', 'CZ', etc.
    demanda_promedio_diaria: number;     // Unidades/día
    desviacion_estandar_diaria: number;  // Unidades/día
    demanda_ciclo: number;               // Unidades
    stock_seguridad: number;             // Unidades
    nivel_objetivo: number;              // Unidades
    inventario_en_transito: number;      // Unidades
    metodo_calculo: string;              // 'NORMAL', 'OVERRIDE', 'FALLBACK'
    datos_calculo: DatosCalculo;
  };
}
```

### CantidadSugeridaResponse

```typescript
interface CantidadSugeridaResponse {
  success: boolean;
  data: {
    producto_id: string;
    tienda_id: string;
    matriz_abc_xyz: string;
    nivel_objetivo: number;
    stock_actual: number;
    inventario_en_transito: number;
    cantidad_sugerida: number;           // Unidades a enviar
    stock_seguridad: number;
    demanda_ciclo: number;
    metodo_calculo: string;
    datos_calculo: DatosCalculo;
  };
}
```

### DatosCalculo

```typescript
interface DatosCalculo {
  demanda_promedio_diaria: number;
  desviacion_estandar_diaria: number;
  periodo_reposicion_dias: number;     // Siempre 2.5
  nivel_servicio_z: number;            // 0.00 a 2.33
  multiplicador_demanda: number;       // 0.50 a 1.50
  multiplicador_ss: number;            // 0.00 a 1.50
  timestamp: string;                   // ISO 8601 format
}
```

---

## Códigos de Estado HTTP

| Código | Significado | Cuándo Ocurre |
|--------|-------------|---------------|
| **200** | OK | Operación exitosa |
| **400** | Bad Request | Parámetros faltantes o inválidos |
| **401** | Unauthorized | Token de autenticación inválido o faltante |
| **404** | Not Found | Producto, tienda o parámetros no encontrados |
| **422** | Unprocessable Entity | Datos válidos pero no procesables (ej: sin historial) |
| **500** | Internal Server Error | Error interno del servidor |

---

## Manejo de Errores

### Estructura de Error

```json
{
  "success": false,
  "error": {
    "code": "PRODUCTO_NO_ENCONTRADO",
    "message": "No se encontró el producto con ID: 999999",
    "details": {
      "producto_id": "999999",
      "tienda_id": "tienda_01"
    }
  }
}
```

### Códigos de Error Comunes

| Código | Descripción | Solución |
|--------|-------------|----------|
| `PRODUCTO_NO_ENCONTRADO` | Producto no existe en la BD | Verificar código del producto |
| `TIENDA_NO_ENCONTRADA` | Tienda no existe | Verificar ID de tienda |
| `SIN_DATOS_HISTORICOS` | No hay 8 semanas de ventas | Esperar más datos o usar override |
| `PARAMETROS_NO_CONFIGURADOS` | Falta configuración de matriz | Ejecutar script de inicialización |
| `MATRIZ_NO_ASIGNADA` | Producto sin clasificación ABC-XYZ | Re-ejecutar clasificación ABC-XYZ |
| `STOCK_NO_DISPONIBLE` | No se encontró stock actual | Verificar tabla `stock_actual` |

---

## Límites y Restricciones

### Rate Limiting

- **Endpoints individuales** (`/calcular`, `/cantidad-sugerida`): 100 requests/minuto
- **Endpoint masivo** (`/tienda/{id}`): 10 requests/minuto

### Límites de Datos

- **Máximo de productos** en endpoint `/tienda/{id}`: 1000 productos por request
- **Timeout**: 30 segundos por request

---

## Integración con Frontend

### Ejemplo: Dashboard de Pedidos Sugeridos

```typescript
// React component example
import { useState, useEffect } from 'react';

interface ProductoSugerido {
  producto_id: string;
  nombre_producto: string;
  cantidad_sugerida: number;
  nivel_objetivo: number;
  stock_actual: number;
  matriz_abc_xyz: string;
  prioridad: number;
}

export function PedidosSugeridosPanel({ tiendaId }: { tiendaId: string }) {
  const [productos, setProductos] = useState<ProductoSugerido[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSugerencias = async () => {
      try {
        const response = await fetch(
          `http://localhost:8001/api/niveles-inventario/tienda/${tiendaId}?solo_con_deficit=true&limite=50`,
          {
            headers: {
              'Authorization': `Bearer ${getAuthToken()}`
            }
          }
        );

        const data = await response.json();

        if (data.success) {
          setProductos(data.productos);
        }
      } catch (error) {
        console.error('Error fetching sugerencias:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSugerencias();
  }, [tiendaId]);

  if (loading) return <div>Cargando...</div>;

  return (
    <div>
      <h2>Pedidos Sugeridos - {productos.length} productos</h2>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Matriz</th>
            <th>Stock Actual</th>
            <th>Nivel Objetivo</th>
            <th>Cantidad Sugerida</th>
            <th>Prioridad</th>
          </tr>
        </thead>
        <tbody>
          {productos.map(p => (
            <tr key={p.producto_id}>
              <td>{p.nombre_producto}</td>
              <td><span className={`badge badge-${p.matriz_abc_xyz[0]}`}>{p.matriz_abc_xyz}</span></td>
              <td>{p.stock_actual.toLocaleString()}</td>
              <td>{p.nivel_objetivo.toLocaleString()}</td>
              <td><strong>{p.cantidad_sugerida.toLocaleString()}</strong></td>
              <td>{p.prioridad}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Webhooks (Futuro)

En futuras versiones, el sistema permitirá configurar webhooks para eventos como:

- `nivel_objetivo.calculado` - Cuando se calcula un nuevo nivel objetivo
- `cantidad_sugerida.generada` - Cuando se genera una sugerencia de pedido
- `parametros.actualizados` - Cuando se modifican parámetros de configuración
- `pedido.aprobado` - Cuando un gerente aprueba un pedido sugerido

**Ejemplo de payload:**
```json
{
  "event": "cantidad_sugerida.generada",
  "timestamp": "2025-01-12T12:00:00Z",
  "data": {
    "tienda_id": "tienda_01",
    "producto_id": "004962",
    "cantidad_sugerida": 2351.0,
    "nivel_objetivo": 5351.0
  }
}
```

---

## Testing

### Endpoint de Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected",
  "timestamp": "2025-01-12T12:30:00Z"
}
```

### Datos de Prueba

Para testing, puedes usar estos productos de ejemplo:

| Producto | Tienda | Matriz | Comportamiento Esperado |
|----------|--------|--------|------------------------|
| 004962 | tienda_01 | AX | Alto nivel objetivo, SS significativo |
| 000096 | tienda_01 | BY | Nivel objetivo medio, SS moderado |
| 004871 | tienda_01 | CZ | Solo demanda ciclo, sin SS |

---

## Próximas Funciones

Funcionalidades planeadas para futuras versiones:

1. **Batch Processing**: Endpoint para calcular múltiples productos en paralelo
2. **Exportación**: Endpoints para exportar resultados a CSV/Excel
3. **Histórico**: Consultar niveles objetivo calculados en fechas pasadas
4. **Simulación**: Probar cambios de parámetros sin aplicarlos
5. **Alertas**: Configurar alertas automáticas de quiebres o excesos

---

## Soporte

Para problemas técnicos o preguntas sobre la API:

- **Email:** api-support@fluxion.ai
- **Documentación Interactiva:** http://localhost:8001/docs (Swagger UI)
- **Repositorio:** https://github.com/fluxion-ai/backend

---

**Anterior:** [Guía de Configuración](04-CONFIGURACION.md)
**Inicio:** [README](README.md)
