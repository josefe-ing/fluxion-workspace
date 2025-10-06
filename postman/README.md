# Colección Postman - Fluxion AI API

Colección completa de Postman con todos los endpoints de la API de Fluxion AI.

## 📦 Archivos

- **Fluxion_AI_API.postman_collection.json** - Colección completa con todos los endpoints
- **Fluxion_Production.postman_environment.json** - Environment para producción (AWS)
- **Fluxion_Local.postman_environment.json** - Environment para desarrollo local

## 🚀 Instalación

### 1. Importar en Postman

1. Abre Postman
2. Click en **Import** (botón superior izquierdo)
3. Arrastra los 3 archivos JSON a la ventana de import
4. Click en **Import**

### 2. Seleccionar Environment

En Postman, en la esquina superior derecha:
1. Click en el dropdown de environments
2. Selecciona **"Fluxion AI - Production"** o **"Fluxion AI - Local"**

## 🔐 Autenticación

### Primer Uso

1. Ve a la carpeta **"🔐 Autenticación"**
2. Ejecuta el request **"Login"** con las credenciales:
   ```json
   {
     "username": "admin",
     "password": "admin123"
   }
   ```
3. El token JWT se guardará automáticamente en `{{auth_token}}`
4. Todos los demás endpoints usarán este token automáticamente

### Token Automático

La colección incluye un script que:
- Guarda automáticamente el token JWT en la variable `auth_token`
- Inyecta el token en todos los requests que lo requieran
- Guarda el username en `current_user`

### Renovar Token

Los tokens expiran después de 8 horas. Para renovar:
1. Ejecuta nuevamente el request **"Login"**
2. El nuevo token se guardará automáticamente

## 📚 Estructura de la Colección

### 🔐 Autenticación (4 endpoints)
- **Login** - Autenticarse y obtener token JWT
- **Get Current User** - Ver usuario autenticado actual
- **Register New User** - Crear nuevo usuario (requiere auth)
- **Logout** - Cerrar sesión

### 📍 Ubicaciones (3 endpoints)
- **Get All Ubicaciones** - Listar todas las tiendas y CEDIs
- **Get Ubicaciones Summary** - Resumen de inventario por ubicación
- **Get Stock Parameters by Ubicacion** - Parámetros de stock por ubicación

### 📦 Productos (2 endpoints)
- **Get All Productos** - Catálogo completo de productos
- **Get Categorias** - Lista de categorías

### 📊 Inventario / Stock (1 endpoint)
- **Get Stock** - Inventario actual con múltiples filtros

### 📈 Dashboard (2 endpoints)
- **Get Dashboard Metrics** - KPIs principales
- **Get Category Metrics** - Métricas por categoría

### 💰 Ventas (3 endpoints)
- **Get Ventas Summary** - Resumen de ventas
- **Get Ventas Detail** - Detalle de ventas con filtros
- **Get Ventas by Categorias** - Ventas agrupadas por categoría

### 🛒 Pedidos Sugeridos (2 endpoints)
- **Calculate Pedido Sugerido** - Calcular pedido con IA
- **Save Pedido** - Guardar pedido (con ajustes)

### 🔮 Forecast (3 endpoints)
- **Get Productos Forecast** - Pronóstico de demanda
- **Get Producto Forecast Detail** - Forecast detallado por producto
- **Get Producto Forecast Diario** - Forecast diario

### 🔄 ETL (3 endpoints)
- **Get ETL Status** - Estado del proceso ETL
- **Check ETL Connectivity** - Verificar conectividad
- **Trigger ETL Sync** - Disparar sincronización manual

### ❤️ Health Check (1 endpoint)
- **Health Check** - Verificar que la API funciona

## 🎯 Ejemplos de Uso

### Ejemplo 1: Login y obtener ubicaciones

```
1. Ejecutar: 🔐 Autenticación → Login
2. Ejecutar: 📍 Ubicaciones → Get All Ubicaciones
```

### Ejemplo 2: Consultar stock bajo

```
1. Ir a: 📊 Inventario / Stock → Get Stock
2. Activar query param "bajo_stock=true"
3. Ejecutar request
```

### Ejemplo 3: Calcular pedido sugerido

```
1. Ir a: 🛒 Pedidos Sugeridos → Calculate Pedido Sugerido
2. Ajustar body:
   {
     "ubicacion_id": 1,
     "dias_horizonte": 7,
     "nivel_servicio": 0.95
   }
3. Ejecutar request
```

### Ejemplo 4: Crear nuevo usuario

```
1. Asegurarse de estar autenticado
2. Ir a: 🔐 Autenticación → Register New User
3. Ajustar body con datos del nuevo usuario
4. Ejecutar request
```

## 🔧 Variables de Environment

### Production
- **base_url**: `http://fluxion-alb-1002393067.us-east-1.elb.amazonaws.com`
- **auth_token**: (se llena automáticamente al hacer login)
- **current_user**: (se llena automáticamente al hacer login)
- **environment**: `production`

### Local
- **base_url**: `http://localhost:8001`
- **auth_token**: (se llena automáticamente al hacer login)
- **current_user**: (se llena automáticamente al hacer login)
- **environment**: `local`

## 📝 Query Parameters

Muchos endpoints soportan query parameters opcionales. En Postman:
1. Ve a la pestaña **Params** del request
2. Activa/desactiva los parámetros usando el checkbox
3. Modifica los valores según necesites

Ejemplos de parámetros comunes:
- `ubicacion_id` - Filtrar por ubicación
- `producto_id` - Filtrar por producto
- `categoria` - Filtrar por categoría
- `fecha_desde` / `fecha_hasta` - Rango de fechas
- `limit` - Límite de resultados
- `bajo_stock` - Solo productos con stock bajo

## 🐛 Troubleshooting

### Error 401 Unauthorized
- **Causa**: Token inválido o expirado
- **Solución**: Ejecutar nuevamente el Login

### Variables no se llenan automáticamente
- **Causa**: Scripts de test no se ejecutaron
- **Solución**: Verificar que los scripts están habilitados en Settings → General → "Automatically follow redirects"

### Request a localhost falla
- **Causa**: Backend local no está corriendo
- **Solución**:
  ```bash
  cd backend
  python3 start.py
  ```

### Request a producción muy lento
- **Causa**: Cold start de contenedor ECS
- **Solución**: Esperar ~10 segundos en el primer request

## 📊 Swagger/OpenAPI

También puedes ver la documentación interactiva en:

**Local:**
- http://localhost:8001/docs

**Producción:**
- http://fluxion-alb-1002393067.us-east-1.elb.amazonaws.com/docs

## 🔄 Actualizar Colección

Si se agregan nuevos endpoints al backend:
1. Actualizar el archivo JSON de la colección
2. Re-importar en Postman
3. Postman preguntará si deseas reemplazar - Click en **Replace**

## 💡 Tips

1. **Usar variables**: Los path variables (`:ubicacion_id`) se pueden editar en la pestaña **Params**
2. **Scripts**: La colección incluye scripts de test para guardar tokens automáticamente
3. **Consola**: Abre la consola de Postman (View → Show Postman Console) para ver logs
4. **Collections Runner**: Puedes ejecutar toda la colección automáticamente
5. **Environments**: Cambia fácilmente entre Local y Production con un click

## 📞 Soporte

Para problemas con la API:
1. Verificar logs del backend
2. Revisar consola de Postman
3. Verificar que el environment correcto está seleccionado
4. Confirmar que el token no expiró

## 🎉 Total de Endpoints

- **Autenticación**: 4 endpoints
- **Ubicaciones**: 3 endpoints
- **Productos**: 2 endpoints
- **Inventario**: 1 endpoint
- **Dashboard**: 2 endpoints
- **Ventas**: 3 endpoints
- **Pedidos Sugeridos**: 2 endpoints
- **Forecast**: 3 endpoints
- **ETL**: 3 endpoints
- **Health Check**: 1 endpoint

**TOTAL: 24 endpoints** ✅
