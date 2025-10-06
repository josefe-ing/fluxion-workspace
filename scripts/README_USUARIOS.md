# Gestión de Usuarios - Fluxion AI

Scripts para crear y gestionar usuarios en el sistema Fluxion AI.

## 📋 Métodos para crear usuarios

### 1. Script Bash (Más rápido)

```bash
cd scripts
./create_user.sh <usuario> <contraseña> [nombre_completo] [email]
```

**Ejemplos:**

```bash
# Usuario básico
./create_user.sh juan juan123

# Usuario con nombre completo
./create_user.sh maria maria456 "Maria Garcia"

# Usuario completo con email
./create_user.sh pedro pedro789 "Pedro Lopez" pedro@example.com
```

### 2. Script Python (Interactivo)

```bash
cd scripts
python3 create_user.py
```

Este script te guiará paso a paso:
1. Login como admin
2. Datos del nuevo usuario
3. Confirmación de contraseña
4. Creación del usuario

### 3. API Directa (con curl)

```bash
# 1. Obtener token de admin
TOKEN=$(curl -s -X POST "http://fluxion-alb-1002393067.us-east-1.elb.amazonaws.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.access_token')

# 2. Crear usuario
curl -X POST "http://fluxion-alb-1002393067.us-east-1.elb.amazonaws.com/api/auth/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "username": "nuevo_usuario",
    "password": "password123",
    "nombre_completo": "Nombre Apellido",
    "email": "email@example.com"
  }'
```

## 🔐 Requisitos

- Debes estar autenticado como usuario existente (normalmente `admin`)
- Solo usuarios autenticados pueden crear nuevos usuarios
- El username debe ser único

## 📝 Campos de Usuario

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| `username` | ✅ Sí | Nombre de usuario único para login |
| `password` | ✅ Sí | Contraseña (será hasheada con bcrypt) |
| `nombre_completo` | ❌ No | Nombre completo del usuario |
| `email` | ❌ No | Email del usuario |

## 🔑 Credenciales por Defecto

El sistema viene con un usuario administrador pre-creado:

- **Username:** `admin`
- **Password:** `admin123`

⚠️ **IMPORTANTE:** Cambiar esta contraseña en producción.

## 🌐 API Endpoints

### Login
```
POST /api/auth/login
Body: {"username": "string", "password": "string"}
Response: {"access_token": "jwt_token", "token_type": "bearer", ...}
```

### Crear Usuario (requiere autenticación)
```
POST /api/auth/register
Headers: Authorization: Bearer <token>
Body: {
  "username": "string",
  "password": "string",
  "nombre_completo": "string",  // opcional
  "email": "string"              // opcional
}
Response: {
  "id": "uuid",
  "username": "string",
  "nombre_completo": "string",
  "email": "string",
  "activo": true
}
```

### Ver Usuario Actual
```
GET /api/auth/me
Headers: Authorization: Bearer <token>
Response: Usuario actual
```

## 📚 Ejemplos de Uso

### Crear usuario para operador de tienda

```bash
./create_user.sh operator_t1 op123 "Operador Tienda 1" operador1@lagranja.com
```

### Crear usuario para gerente

```bash
./create_user.sh gerente_ventas gv456 "Maria Garcia" maria.garcia@lagranja.com
```

### Crear usuario para desarrollador

```bash
./create_user.sh dev_jose dev789 "Jose Fernandez" jose@fluxion.ai
```

## 🛠️ Troubleshooting

### Error: "El usuario ya existe"
El username ya está registrado. Usar otro username.

### Error: "Usuario o contraseña incorrectos" (al hacer login como admin)
Verificar las credenciales del admin.

### Error: "No se pudo autenticar"
Verificar que el backend esté corriendo y accesible.

### Error: "jq: command not found"
Instalar jq: `brew install jq` (macOS) o `apt install jq` (Linux)

## 📊 Ver usuarios existentes

Para ver los usuarios en la base de datos:

```bash
duckdb data/fluxion_production.db "SELECT username, nombre_completo, email, activo FROM usuarios"
```

## 🔒 Seguridad

- Las contraseñas se hashean con bcrypt antes de almacenarse
- Los tokens JWT expiran después de 8 horas
- Solo usuarios autenticados pueden crear nuevos usuarios
- Los tokens se incluyen en el header `Authorization: Bearer <token>`
