# Ejemplos cURL - Fluxion AI API

Comandos curl para testing rápido de la API.

## 🌍 Variables de Environment

```bash
# Producción
export API_URL="http://fluxion-alb-1002393067.us-east-1.elb.amazonaws.com"

# Local
export API_URL="http://localhost:8001"
```

## 🔐 Autenticación

### Login
```bash
curl -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }' | jq
```

### Guardar token en variable
```bash
export TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.access_token')

echo "Token: $TOKEN"
```

### Get Current User
```bash
curl -X GET "$API_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Register New User
```bash
curl -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "username": "nuevo_usuario",
    "password": "password123",
    "nombre_completo": "Nombre Completo",
    "email": "email@example.com"
  }' | jq
```

## 📍 Ubicaciones

### Get All Ubicaciones
```bash
curl -X GET "$API_URL/api/ubicaciones" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Ubicaciones Summary
```bash
curl -X GET "$API_URL/api/ubicaciones/summary" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Stock Parameters by Ubicacion
```bash
curl -X GET "$API_URL/api/ubicaciones/1/stock-params" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 📦 Productos

### Get All Productos
```bash
curl -X GET "$API_URL/api/productos" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Productos (con filtros)
```bash
curl -X GET "$API_URL/api/productos?categoria=LACTEOS&limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Categorias
```bash
curl -X GET "$API_URL/api/categorias" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 📊 Inventario / Stock

### Get Stock
```bash
curl -X GET "$API_URL/api/stock" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Stock con filtros
```bash
# Por ubicación
curl -X GET "$API_URL/api/stock?ubicacion_id=1" \
  -H "Authorization: Bearer $TOKEN" | jq

# Bajo stock
curl -X GET "$API_URL/api/stock?bajo_stock=true&limit=20" \
  -H "Authorization: Bearer $TOKEN" | jq

# Por categoría
curl -X GET "$API_URL/api/stock?categoria=LACTEOS" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 📈 Dashboard

### Get Dashboard Metrics
```bash
curl -X GET "$API_URL/api/dashboard/metrics" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Dashboard Metrics (por ubicación)
```bash
curl -X GET "$API_URL/api/dashboard/metrics?ubicacion_id=1" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Category Metrics
```bash
curl -X GET "$API_URL/api/dashboard/categories" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 💰 Ventas

### Get Ventas Summary
```bash
curl -X GET "$API_URL/api/ventas/summary" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Ventas Summary (con filtros)
```bash
curl -X GET "$API_URL/api/ventas/summary?ubicacion_id=1&fecha_desde=2024-01-01&fecha_hasta=2024-12-31" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Ventas Detail
```bash
curl -X GET "$API_URL/api/ventas/detail?limit=100" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Ventas by Categorias
```bash
curl -X GET "$API_URL/api/ventas/categorias" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 🛒 Pedidos Sugeridos

### Calculate Pedido Sugerido
```bash
curl -X POST "$API_URL/api/pedidos-sugeridos/calcular" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "ubicacion_id": 1,
    "dias_horizonte": 7,
    "nivel_servicio": 0.95
  }' | jq
```

### Save Pedido
```bash
curl -X POST "$API_URL/api/pedidos-sugeridos" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "ubicacion_id": 1,
    "productos": [
      {
        "codigo_producto": "P001",
        "cantidad_sugerida": 100,
        "cantidad_ajustada": 120
      }
    ],
    "notas": "Pedido ajustado manualmente"
  }' | jq
```

## 🔮 Forecast

### Get Productos Forecast
```bash
curl -X GET "$API_URL/api/forecast/productos" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Producto Forecast Detail
```bash
curl -X GET "$API_URL/api/forecast/producto/P001" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Producto Forecast Diario
```bash
curl -X GET "$API_URL/api/forecast/producto/P001/diario?dias=30" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 🔄 ETL

### Get ETL Status
```bash
curl -X GET "$API_URL/api/etl/status" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Check ETL Connectivity
```bash
curl -X GET "$API_URL/api/etl/check-connectivity" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Trigger ETL Sync
```bash
curl -X POST "$API_URL/api/etl/sync" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## ❤️ Health Check

### Health Check
```bash
curl -X GET "$API_URL/" | jq
```

## 🔧 Utilidades

### Pretty print JSON con jq
```bash
# Si no tienes jq instalado:
# macOS: brew install jq
# Linux: apt install jq

# Uso básico
curl -X GET "$API_URL/api/ubicaciones" -H "Authorization: Bearer $TOKEN" | jq

# Filtrar solo nombres
curl -X GET "$API_URL/api/ubicaciones" -H "Authorization: Bearer $TOKEN" | jq '.[].nombre'

# Contar resultados
curl -X GET "$API_URL/api/productos" -H "Authorization: Bearer $TOKEN" | jq '. | length'
```

### Ver headers de respuesta
```bash
curl -i -X GET "$API_URL/" | head -20
```

### Medir tiempo de respuesta
```bash
time curl -X GET "$API_URL/api/ubicaciones" \
  -H "Authorization: Bearer $TOKEN" \
  -o /dev/null -s
```

### Debug verbose
```bash
curl -v -X GET "$API_URL/api/ubicaciones" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 📝 Script de Testing Completo

```bash
#!/bin/bash
# test_api.sh - Script completo de testing

set -e

# Variables
API_URL="${API_URL:-http://localhost:8001}"
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-admin123}"

echo "🧪 Testing Fluxion AI API"
echo "URL: $API_URL"
echo ""

# 1. Health Check
echo "1️⃣  Health Check..."
curl -s "$API_URL/" | jq -r '.status'

# 2. Login
echo "2️⃣  Login..."
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" | jq -r '.access_token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
    echo "❌ Login failed"
    exit 1
fi
echo "✅ Token obtenido: ${TOKEN:0:20}..."

# 3. Get Current User
echo "3️⃣  Get Current User..."
curl -s "$API_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.username'

# 4. Get Ubicaciones
echo "4️⃣  Get Ubicaciones..."
UBICACIONES=$(curl -s "$API_URL/api/ubicaciones" \
  -H "Authorization: Bearer $TOKEN" | jq '. | length')
echo "✅ $UBICACIONES ubicaciones encontradas"

# 5. Get Productos
echo "5️⃣  Get Productos..."
PRODUCTOS=$(curl -s "$API_URL/api/productos?limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq '. | length')
echo "✅ $PRODUCTOS productos encontrados (límite 10)"

# 6. Get Dashboard Metrics
echo "6️⃣  Get Dashboard Metrics..."
curl -s "$API_URL/api/dashboard/metrics" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    total_productos: .total_productos,
    total_stock: .total_stock,
    productos_bajo_stock: .productos_bajo_stock
  }'

echo ""
echo "✅ Todos los tests pasaron exitosamente!"
```

Guardar como `test_api.sh` y ejecutar:
```bash
chmod +x test_api.sh
./test_api.sh
```

## 🎯 Quick Reference

```bash
# Setup rápido
export API_URL="http://fluxion-alb-1002393067.us-east-1.elb.amazonaws.com"
export TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | jq -r '.access_token')

# Endpoints más usados
curl "$API_URL/api/ubicaciones" -H "Authorization: Bearer $TOKEN" | jq
curl "$API_URL/api/productos?limit=10" -H "Authorization: Bearer $TOKEN" | jq
curl "$API_URL/api/stock?bajo_stock=true" -H "Authorization: Bearer $TOKEN" | jq
curl "$API_URL/api/dashboard/metrics" -H "Authorization: Bearer $TOKEN" | jq
```
