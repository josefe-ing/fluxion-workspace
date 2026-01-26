# Plan de Implementación: Sistema de Roles y Permisos (RBAC)

**Proyecto:** Fluxion AI
**Fecha:** 26 de Enero 2026
**Prioridad:** ALTA - Implementación esta semana
**Estimación:** 12-16 horas de desarrollo

---

## Resumen Ejecutivo

Este documento detalla la implementación de un sistema de Control de Acceso Basado en Roles (RBAC) para Fluxion AI. El objetivo principal es **proteger las secciones de BI y Administrador**, limitando el acceso solo a usuarios autorizados.

### Objetivo Principal
Implementar control de acceso granular para:
- ✅ **Proteger BI y Administrador** (solo Super Admin)
- ✅ Definir roles operativos claros
- ✅ Permitir filtrado por tienda para Gerentes de Tienda
- ✅ Establecer rol principal de operación: Gestor de Abastecimiento

---

## Sistema de Roles Definidos

### 1. Super Admin (super_admin) - Nivel 5
**Usuarios objetivo:** Administradores del sistema, equipo técnico

**Permisos:**
- ✅ Acceso completo al sistema
- ✅ Gestión de usuarios (crear, editar, eliminar, asignar roles)
- ✅ Acceso a todas las tiendas
- ✅ Acceso a **BI** (Business Intelligence)
- ✅ Acceso a **Administrador** (configuración del sistema)
- ✅ Crear y gestionar pedidos

**Secciones accesibles:** TODAS

---

### 2. Gerente General (gerente_general) - Nivel 4
**Usuarios objetivo:** Gerencia corporativa, dirección general

**Permisos:**
- ✅ Visualización de todas las tiendas
- ✅ Crear y gestionar pedidos para todas las tiendas
- ✅ Ver inventarios, ventas y productos
- ❌ NO puede acceder a BI
- ❌ NO puede gestionar usuarios
- ❌ NO puede acceder a configuración del sistema

**Secciones accesibles:** Pedidos, Inventarios, Ventas, Productos

---

### 3. Gestor de Abastecimiento (gestor_abastecimiento) - Nivel 3 ⭐
**ROL PRINCIPAL PARA OPERACIONES**

**Usuarios objetivo:** Personal operativo que crea pedidos diariamente

**Permisos:**
- ✅ **Acceso a todas las tiendas** (sin restricciones)
- ✅ **Crear y gestionar pedidos** (sugeridos y multitienda)
- ✅ Ver inventarios, ventas y análisis de productos (ABC/XYZ)
- ❌ NO puede acceder a BI
- ❌ NO puede gestionar usuarios
- ❌ NO puede acceder a configuración del sistema

**Secciones accesibles:** Pedidos, Inventarios, Ventas, Productos

**Nota:** Este es el rol que usarán la mayoría de usuarios que crean pedidos.

---

### 4. Gerente de Tienda (gerente_tienda) - Nivel 2
**Usuarios objetivo:** Gerentes de tiendas específicas

**Permisos:**
- ✅ Solo ve las tiendas asignadas (filtrado automático)
- ✅ Puede crear pedidos de sus tiendas
- ✅ Ver inventarios, ventas y productos de sus tiendas
- ❌ NO puede acceder a BI
- ❌ NO puede gestionar usuarios
- ❌ NO puede ver tiendas no asignadas

**Secciones accesibles:** Pedidos, Inventarios, Ventas, Productos (filtrado por tienda)

**Configuración especial:** Requiere asignación manual de tiendas en tabla `usuarios_tiendas`

---

### 5. Visualizador (visualizador) - Nivel 1
**Usuarios objetivo:** Personal de consulta, analistas externos

**Permisos:**
- ✅ Solo lectura de dashboards y reportes
- ✅ Ver inventarios, ventas y productos de todas las tiendas
- ❌ NO puede crear pedidos
- ❌ NO puede acceder a BI
- ❌ NO puede gestionar usuarios

**Secciones accesibles:** Inventarios, Ventas, Productos (solo lectura)

---

## Matriz de Verificación de Acceso

| Sección | Super Admin | Gerente General | Gestor Abastecimiento ⭐ | Gerente Tienda | Visualizador |
|---------|:-----------:|:---------------:|:-----------------------:|:--------------:|:------------:|
| **BI** ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Administrador** ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Pedidos** | ✅ Todas | ✅ Todas | ✅ Todas | ✅ Asignadas | ❌ |
| **Inventarios** | ✅ Todas | ✅ Todas | ✅ Todas | ✅ Asignadas | ✅ Todas |
| **Ventas** | ✅ Todas | ✅ Todas | ✅ Todas | ✅ Asignadas | ✅ Todas |
| **Productos** | ✅ Todas | ✅ Todas | ✅ Todas | ✅ Asignadas | ✅ Todas |

---

## Arquitectura Técnica

### Base de Datos (PostgreSQL)

#### Nueva tabla: `roles`
```sql
CREATE TABLE roles (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    nivel_acceso INTEGER NOT NULL,  -- 1=Visualizador, 5=Super Admin
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (id, nombre, descripcion, nivel_acceso) VALUES
    ('visualizador', 'Visualizador', 'Acceso de solo lectura a dashboards y reportes', 1),
    ('gerente_tienda', 'Gerente de Tienda', 'Gestión de tiendas asignadas', 2),
    ('gestor_abastecimiento', 'Gestor de Abastecimiento', 'Creación de pedidos para todas las tiendas', 3),
    ('gerente_general', 'Gerente General', 'Visualización de todas las tiendas y creación de pedidos', 4),
    ('super_admin', 'Super Admin', 'Acceso completo al sistema', 5);
```

#### Nueva tabla: `usuarios_tiendas`
```sql
CREATE TABLE usuarios_tiendas (
    id SERIAL PRIMARY KEY,
    usuario_id VARCHAR(50) NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    ubicacion_id VARCHAR(50) NOT NULL,  -- ID de tienda
    asignado_por VARCHAR(50),  -- Usuario que hizo la asignación
    asignado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT TRUE,
    UNIQUE(usuario_id, ubicacion_id)
);

CREATE INDEX idx_usuarios_tiendas_usuario ON usuarios_tiendas(usuario_id);
CREATE INDEX idx_usuarios_tiendas_ubicacion ON usuarios_tiendas(ubicacion_id);
CREATE INDEX idx_usuarios_tiendas_activo ON usuarios_tiendas(activo) WHERE activo = TRUE;
```

#### Modificación tabla: `usuarios`
```sql
ALTER TABLE usuarios ADD COLUMN rol_id VARCHAR(50) REFERENCES roles(id) DEFAULT 'visualizador';
CREATE INDEX idx_usuarios_rol ON usuarios(rol_id);

-- Migración segura: usuarios existentes → super_admin
UPDATE usuarios SET rol_id = 'super_admin' WHERE rol_id IS NULL;
```

### Backend (FastAPI)

#### Archivo: `backend/auth.py`

**Nuevos modelos:**
```python
class UsuarioConRol(BaseModel):
    id: str
    username: str
    nombre_completo: Optional[str] = None
    email: Optional[str] = None
    activo: bool
    rol_id: Optional[str] = "visualizador"
    rol_nombre: Optional[str] = None
    rol_nivel_acceso: Optional[int] = 1
    tiendas_asignadas: Optional[List[str]] = []  # Para gerente_tienda
```

**Nuevas dependencias de autorización:**
```python
def require_super_admin(current_user: UsuarioConRol = Depends(verify_token)):
    """Solo Super Admin"""
    if current_user.rol_id != 'super_admin':
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return current_user

def require_gerente_general_or_above(current_user: UsuarioConRol = Depends(verify_token)):
    """Gerente General o Superior"""
    if current_user.rol_id not in ['gerente_general', 'super_admin']:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return current_user

def require_gerente_or_above(current_user: UsuarioConRol = Depends(verify_token)):
    """Gerente de Tienda, Gestor Abastecimiento, Gerente General o Super Admin"""
    if current_user.rol_id not in ['gerente_tienda', 'gestor_abastecimiento', 'gerente_general', 'super_admin']:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return current_user

def get_ubicaciones_filter_clause(current_user: UsuarioConRol) -> tuple[str, tuple]:
    """Retorna filtro SQL para ubicaciones según rol"""
    if current_user.rol_id == 'gerente_tienda':
        if not current_user.tiendas_asignadas:
            return " AND 1=0", ()  # Sin tiendas asignadas
        placeholders = ','.join(['%s'] * len(current_user.tiendas_asignadas))
        return f" AND ubicacion_id IN ({placeholders})", tuple(current_user.tiendas_asignadas)
    return "", ()  # Sin filtro para otros roles
```

#### Protección de endpoints

**BI (business_intelligence.py):**
```python
@router.get("/impact/summary")
async def get_impact_summary(
    current_user: UsuarioConRol = Depends(require_super_admin),  # CRÍTICO
    conn: Any = Depends(get_db)
):
    # Solo super_admin puede acceder
```

**Administración de usuarios (main.py):**
```python
@app.get("/api/auth/users")
async def get_all_users(
    current_user: UsuarioConRol = Depends(require_super_admin)  # CRÍTICO
):
    # Solo super_admin puede gestionar usuarios
```

**Creación de pedidos (pedidos_sugeridos.py):**
```python
@router.post("/calcular")
async def calcular_pedido_sugerido(
    request: CalcularPedidoRequest,
    current_user: UsuarioConRol = Depends(require_gerente_or_above),
    conn: Any = Depends(get_db)
):
    # Validar acceso por tienda para gerente_tienda
    if current_user.rol_id == 'gerente_tienda':
        if request.ubicacion_id not in current_user.tiendas_asignadas:
            raise HTTPException(status_code=403, detail="Sin acceso a esta tienda")

    # Gestor de Abastecimiento puede acceder a todas las tiendas
```

### Frontend (React + TypeScript)

#### Archivo: `frontend/src/contexts/AuthContext.tsx`

**Estado extendido:**
```typescript
interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  username: string | null;
  nombreCompleto: string | null;
  rolId: string | null;  // NUEVO
  tiendasAsignadas: string[];  // NUEVO
  login: (token, username, nombreCompleto?, rolId?, tiendasAsignadas?) => void;
  logout: () => void;
  hasRole: (roles: string[]) => boolean;  // NUEVO
  canAccessStore: (storeId: string) => boolean;  // NUEVO
}
```

**Helper methods:**
```typescript
const hasRole = (roles: string[]): boolean => {
  return rolId ? roles.includes(rolId) : false;
};

const canAccessStore = (storeId: string): boolean => {
  if (rolId === 'gerente_tienda') {
    return tiendasAsignadas.includes(storeId);
  }
  return true;  // Otros roles: acceso a todas
};
```

#### Archivo: `frontend/src/App.tsx`

**Componente de protección:**
```typescript
function RoleProtectedRoute({
  children,
  allowedRoles
}: {
  children: React.ReactNode;
  allowedRoles: string[]
}) {
  const { hasRole } = useAuth();

  if (!hasRole(allowedRoles)) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">
          Acceso Denegado
        </h2>
        <p className="text-gray-600">
          No tienes permisos para acceder a esta sección.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
```

**Rutas protegidas:**
```typescript
// BI - Solo super_admin ⚠️ CRÍTICO
<Route
  path="bi"
  element={
    <RoleProtectedRoute allowedRoles={['super_admin']}>
      <BusinessIntelligence />
    </RoleProtectedRoute>
  }
/>

// Administrador - Solo super_admin ⚠️ CRÍTICO
<Route
  path="administrador"
  element={
    <RoleProtectedRoute allowedRoles={['super_admin']}>
      <ETLControlCenter />
    </RoleProtectedRoute>
  }
/>

// Pedidos - Gerentes y Gestor Abastecimiento
<Route
  path="pedidos-sugeridos"
  element={
    <RoleProtectedRoute allowedRoles={['gerente_tienda', 'gestor_abastecimiento', 'gerente_general', 'super_admin']}>
      <SuggestedOrder />
    </RoleProtectedRoute>
  }
/>
```

#### Archivo: `frontend/src/components/layout/Header.tsx`

**Navegación filtrada:**
```typescript
const navItems = [
  { path: '/pedidos-sugeridos', label: 'Pedidos',
    roles: ['gerente_tienda', 'gestor_abastecimiento', 'gerente_general', 'super_admin'] },
  { path: '/inventarios', label: 'Inventarios',
    roles: ['visualizador', 'gerente_tienda', 'gestor_abastecimiento', 'gerente_general', 'super_admin'] },
  { path: '/ventas', label: 'Ventas',
    roles: ['visualizador', 'gerente_tienda', 'gestor_abastecimiento', 'gerente_general', 'super_admin'] },
  { path: '/productos', label: 'Productos',
    roles: ['visualizador', 'gerente_tienda', 'gestor_abastecimiento', 'gerente_general', 'super_admin'] },
  { path: '/bi', label: 'BI',
    roles: ['super_admin'] },  // ⚠️ CRÍTICO
];

// Renderizar solo items con rol permitido
{navItems.filter(item => hasRole(item.roles)).map(item => (...))}
```

---

## Actividades de Desarrollo

### Fase 1: Base de Datos (1-2 horas)

#### Actividad 1.1: Crear archivos de migración
**Archivos:**
- `database/migrations/030_add_rbac_system_UP.sql`
- `database/migrations/030_add_rbac_system_DOWN.sql`

**Tareas:**
- [ ] Crear tabla `roles` con 5 roles definidos
- [ ] Crear tabla `usuarios_tiendas` para asignaciones
- [ ] Agregar columna `rol_id` a tabla `usuarios`
- [ ] Crear índices para performance
- [ ] Migrar usuarios existentes a `super_admin` (seguro por defecto)
- [ ] Agregar comentarios a tablas y columnas

**Verificación:**
```bash
cd database
python3 run_migrations.py
psql postgresql://fluxion:RGTrbM6R4W@localhost:5432/fluxion_production -c "SELECT * FROM roles"
```

---

### Fase 2: Backend Core (2-3 horas)

#### Actividad 2.1: Actualizar modelos en `backend/auth.py`
**Tareas:**
- [ ] Crear modelo `UsuarioConRol` extendiendo `Usuario`
- [ ] Agregar campos `rol_id`, `rol_nombre`, `rol_nivel_acceso`, `tiendas_asignadas`
- [ ] Actualizar `TokenResponse` para incluir `rol_id` y `tiendas_asignadas`

#### Actividad 2.2: Modificar funciones de autenticación
**Tareas:**
- [ ] Modificar `authenticate_user()`:
  - JOIN con tabla `roles` para obtener rol
  - SELECT de `usuarios_tiendas` si rol es gerente_tienda
  - Retornar `UsuarioConRol` con todos los datos
- [ ] Modificar `verify_token()`:
  - Mismo comportamiento que authenticate_user
  - Cargar rol y tiendas asignadas en cada request

#### Actividad 2.3: Crear dependencias de autorización
**Tareas:**
- [ ] Implementar `require_super_admin()`
- [ ] Implementar `require_gerente_general_or_above()`
- [ ] Implementar `require_gerente_or_above()`
- [ ] Implementar `get_ubicaciones_filter_clause()`
- [ ] Implementar `filter_ubicaciones_by_role()`

**Verificación:**
```bash
cd backend
python3 -c "from auth import require_super_admin; print('OK')"
```

---

### Fase 3: Proteger BI y Administrador (1 hora) ⚠️ PRIORIDAD MÁXIMA

#### Actividad 3.1: Proteger endpoints de BI
**Archivo:** `backend/routers/business_intelligence.py`

**Tareas:**
- [ ] Agregar import: `from auth import require_super_admin, UsuarioConRol`
- [ ] Agregar `current_user: UsuarioConRol = Depends(require_super_admin)` a TODOS los endpoints:
  - `/impact/summary`
  - `/impact/stores`
  - `/impact/export`
  - `/analysis/store`
  - Cualquier otro endpoint en este router

#### Actividad 3.2: Proteger endpoints de Administrador
**Archivo:** `backend/main.py`

**Tareas:**
- [ ] Proteger `GET /api/auth/users` con `require_super_admin`
- [ ] Proteger `PUT /api/auth/users/{user_id}` con `require_super_admin`
- [ ] Proteger `DELETE /api/auth/users/{user_id}` con `require_super_admin`
- [ ] Proteger `POST /api/auth/register` con `require_super_admin`

**Verificación:**
```bash
# Test con Postman/curl
curl -X GET http://localhost:8001/bi/impact/summary -H "Authorization: Bearer <token_no_admin>"
# Debe retornar 403 Forbidden
```

---

### Fase 4: Actualizar Login (1 hora)

#### Actividad 4.1: Modificar endpoint de login
**Archivo:** `backend/main.py`

**Tareas:**
- [ ] Actualizar endpoint `POST /api/auth/login`
- [ ] Retornar `rol_id` y `tiendas_asignadas` en `TokenResponse`
- [ ] Verificar que se envían correctamente al frontend

**Verificación:**
```bash
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# Response debe incluir: rol_id, tiendas_asignadas
```

---

### Fase 5: Frontend - Estado de Autenticación (2-3 horas)

#### Actividad 5.1: Actualizar AuthContext
**Archivo:** `frontend/src/contexts/AuthContext.tsx`

**Tareas:**
- [ ] Agregar estados: `rolId`, `tiendasAsignadas`
- [ ] Actualizar `login()` con nuevos parámetros
- [ ] Actualizar `logout()` para limpiar rol y tiendas
- [ ] Persistir en localStorage: `rol_id`, `tiendas_asignadas`
- [ ] Implementar `hasRole(roles: string[])`
- [ ] Implementar `canAccessStore(storeId: string)`
- [ ] Restaurar desde localStorage en mount

#### Actividad 5.2: Actualizar LoginPage
**Archivo:** `frontend/src/components/LoginPage.tsx`

**Tareas:**
- [ ] Extraer `rol_id` y `tiendas_asignadas` del response
- [ ] Guardar en localStorage
- [ ] Pasar a método `onLoginSuccess()`

**Verificación:**
```bash
cd frontend
npm run dev
# Login y verificar localStorage en DevTools
```

---

### Fase 6: Frontend - Protección de Rutas (1-2 horas) ⚠️ PRIORIDAD MÁXIMA

#### Actividad 6.1: Crear componente de protección
**Archivo:** `frontend/src/App.tsx`

**Tareas:**
- [ ] Crear componente `RoleProtectedRoute`
- [ ] Mostrar mensaje "Acceso Denegado" si no tiene rol
- [ ] Aplicar a rutas protegidas

#### Actividad 6.2: Proteger rutas críticas
**Tareas:**
- [ ] Proteger `/bi` con `allowedRoles={['super_admin']}` ⚠️
- [ ] Proteger `/administrador` con `allowedRoles={['super_admin']}` ⚠️
- [ ] Proteger `/administrador/usuarios` con `allowedRoles={['super_admin']}` ⚠️
- [ ] Proteger `/pedidos-sugeridos` con roles de gerente
- [ ] Proteger `/pedidos-sugeridos/nuevo` con roles de gerente

**Verificación:**
```bash
# Login como usuario no-admin
# Intentar navegar a /bi → debe mostrar "Acceso Denegado"
# Intentar navegar a /administrador → debe mostrar "Acceso Denegado"
```

---

### Fase 7: Frontend - Navegación (1-2 horas)

#### Actividad 7.1: Filtrar menú Header
**Archivo:** `frontend/src/components/layout/Header.tsx`

**Tareas:**
- [ ] Definir `navItems` con array de roles permitidos
- [ ] Filtrar items usando `hasRole(item.roles)`
- [ ] Configuración:
  - BI: Solo `super_admin` ⚠️
  - Administrador: Solo `super_admin` ⚠️
  - Pedidos: gerente_tienda, gestor_abastecimiento, gerente_general, super_admin
  - Inventarios/Ventas/Productos: Todos los roles

**Verificación:**
```bash
# Login como gestor_abastecimiento
# Verificar que NO aparece "BI" en menú
# Verificar que NO aparece "Administrador" en menú
# Verificar que SÍ aparece "Pedidos"
```

---

### Fase 8: Proteger Endpoints de Pedidos (2-3 horas)

#### Actividad 8.1: Proteger pedidos sugeridos
**Archivo:** `backend/routers/pedidos_sugeridos.py`

**Tareas:**
- [ ] Agregar import: `from auth import require_gerente_or_above, UsuarioConRol`
- [ ] Proteger `POST /calcular` con `require_gerente_or_above`
- [ ] Proteger `POST /guardar` con `require_gerente_or_above`
- [ ] Validar acceso por tienda para `gerente_tienda`:
  ```python
  if current_user.rol_id == 'gerente_tienda':
      if request.ubicacion_id not in current_user.tiendas_asignadas:
          raise HTTPException(status_code=403)
  ```
- [ ] Permitir acceso completo para `gestor_abastecimiento`, `gerente_general`, `super_admin`

#### Actividad 8.2: Proteger pedidos multitienda
**Archivo:** `backend/routers/pedidos_multitienda.py`

**Tareas:**
- [ ] Proteger con `require_gerente_general_or_above`
- [ ] Solo gerente_general y super_admin pueden crear pedidos multitienda

#### Actividad 8.3: Filtrar datos por tienda
**Archivos:** Varios routers (ventas, inventarios, emergencias)

**Tareas:**
- [ ] Agregar `current_user: UsuarioConRol = Depends(get_current_user)` a endpoints de lectura
- [ ] Usar `get_ubicaciones_filter_clause()` en queries SQL
- [ ] Filtrar resultados según tiendas asignadas para gerente_tienda

---

### Fase 9: UI de Administración (2-3 horas)

#### Actividad 9.1: Actualizar UsuariosAdmin
**Archivo:** `frontend/src/components/admin/UsuariosAdmin.tsx`

**Tareas:**
- [ ] Agregar columna "Rol" en tabla de usuarios
- [ ] Agregar dropdown de rol en formulario de creación:
  - Opciones: Super Admin, Gerente General, Gestor Abastecimiento, Gerente de Tienda, Visualizador
- [ ] Agregar dropdown de rol en formulario de edición
- [ ] Agregar selector de tiendas (multi-select):
  - Solo visible cuando `rol === 'gerente_tienda'`
  - Cargar lista de tiendas desde `/api/ubicaciones`
  - Guardar asignaciones en `usuarios_tiendas`
- [ ] Mostrar tiendas asignadas en lista de usuarios

#### Actividad 9.2: Endpoints de gestión de roles (backend)
**Archivo:** `backend/main.py`

**Tareas:**
- [ ] Actualizar `POST /api/auth/register` para aceptar `rol_id`
- [ ] Actualizar `PUT /api/auth/users/{user_id}` para permitir cambio de rol
- [ ] Crear endpoint `POST /api/auth/users/{user_id}/stores` para asignar tiendas
- [ ] Crear endpoint `DELETE /api/auth/users/{user_id}/stores/{store_id}` para remover tienda

---

### Fase 10: Testing Final (1-2 horas)

#### Actividad 10.1: Crear usuarios de prueba
**Tareas:**
- [ ] Crear usuario `admin_test` - rol: super_admin
- [ ] Crear usuario `gerente_general_test` - rol: gerente_general
- [ ] Crear usuario `gestor_abast_test` - rol: gestor_abastecimiento
- [ ] Crear usuario `gerente_tienda_test` - rol: gerente_tienda (asignar tienda_06, tienda_08)
- [ ] Crear usuario `visualizador_test` - rol: visualizador

#### Actividad 10.2: Ejecutar tests de verificación

**Test 1: Super Admin puede acceder a BI** ✅
- [ ] Login como `admin_test`
- [ ] Navegar a `/bi` → debe cargar correctamente
- [ ] Verificar que ítem "BI" aparece en menú
- [ ] Verificar que ítem "Administrador" aparece en menú

**Test 2: Usuario no-admin NO puede acceder a BI** ❌
- [ ] Login como `gestor_abast_test`
- [ ] Verificar que "BI" NO aparece en menú
- [ ] Intentar navegar a `/bi` → debe mostrar "Acceso Denegado"
- [ ] Intentar API call directo a `/bi/impact/summary` → debe retornar 403

**Test 3: Super Admin puede gestionar usuarios** ✅
- [ ] Login como `admin_test`
- [ ] Navegar a `/administrador/usuarios`
- [ ] Verificar lista de usuarios
- [ ] Crear nuevo usuario con rol específico
- [ ] Editar rol de usuario existente

**Test 4: Usuario no-admin NO puede gestionar usuarios** ❌
- [ ] Login como `gerente_general_test`
- [ ] Verificar que "Administrador" NO aparece en menú
- [ ] Intentar navegar a `/administrador/usuarios` → debe mostrar "Acceso Denegado"
- [ ] Intentar API call a `/api/auth/users` → debe retornar 403

**Test 5: Gestor de Abastecimiento puede crear pedidos** ✅
- [ ] Login como `gestor_abast_test`
- [ ] Verificar menú: Pedidos, Inventarios, Ventas, Productos (SÍ)
- [ ] Verificar menú: BI, Administrador (NO)
- [ ] Navegar a `/pedidos-sugeridos/nuevo`
- [ ] Crear pedido para tienda_01 → debe funcionar
- [ ] Crear pedido para tienda_06 → debe funcionar
- [ ] Intentar navegar a `/bi` → debe mostrar "Acceso Denegado"

**Test 6: Gerente de Tienda solo ve sus tiendas** ✅
- [ ] Login como `gerente_tienda_test` (asignado a tienda_06, tienda_08)
- [ ] Verificar que inventarios solo muestra tienda_06 y tienda_08
- [ ] Intentar crear pedido de tienda_01 → debe retornar 403
- [ ] Crear pedido de tienda_06 → debe funcionar

**Test 7: Visualizador solo lectura** ✅
- [ ] Login como `visualizador_test`
- [ ] Verificar que "Pedidos" NO aparece en menú
- [ ] Ver inventarios → debe funcionar
- [ ] Ver ventas → debe funcionar
- [ ] Intentar navegar a `/pedidos-sugeridos` → debe mostrar "Acceso Denegado"

---

## Archivos a Modificar (Resumen)

### Backend (7 archivos)
1. ✅ `backend/auth.py` - Core RBAC + dependencias
2. ✅ `backend/main.py` - Login + protección admin
3. ✅ `backend/routers/business_intelligence.py` - **CRÍTICO: Proteger BI**
4. ✅ `backend/routers/pedidos_sugeridos.py` - Proteger pedidos
5. ✅ `backend/routers/pedidos_multitienda.py` - Proteger pedidos multitienda
6. ✅ `backend/routers/emergencias.py` - Filtrar por tienda
7. ✅ `backend/routers/config_inventario.py` - Proteger configuración

### Base de Datos (2 archivos)
1. ✅ `database/migrations/030_add_rbac_system_UP.sql` - Crear tablas
2. ✅ `database/migrations/030_add_rbac_system_DOWN.sql` - Rollback

### Frontend (5 archivos)
1. ✅ `frontend/src/contexts/AuthContext.tsx` - Estado de rol
2. ✅ `frontend/src/components/LoginPage.tsx` - Guardar rol
3. ✅ `frontend/src/components/layout/Header.tsx` - **CRÍTICO: Ocultar BI/Admin**
4. ✅ `frontend/src/App.tsx` - **CRÍTICO: Proteger rutas BI/Admin**
5. ✅ `frontend/src/components/admin/UsuariosAdmin.tsx` - Gestión de roles

---

## Migración de Usuarios Existentes

**Estrategia segura:**
1. Todos los usuarios existentes → `super_admin` (automático en migración SQL)
2. No se elimina acceso a nadie
3. Permite seguir trabajando inmediatamente después de migración
4. Ajustar roles manualmente después desde `/administrador/usuarios`

**Post-migración:**
1. Revisar lista de usuarios
2. Cambiar rol según corresponda:
   - Operadores → `gestor_abastecimiento`
   - Gerentes corporativos → `gerente_general`
   - Gerentes locales → `gerente_tienda` + asignar tiendas
   - Consultores → `visualizador`

---

## Rollback de Emergencia

Si algo falla durante la implementación:

```bash
cd database
psql postgresql://fluxion:RGTrbM6R4W@localhost:5432/fluxion_production < migrations/030_add_rbac_system_DOWN.sql
```

Esto revierte:
- Elimina tabla `usuarios_tiendas`
- Elimina columna `rol_id` de `usuarios`
- Elimina tabla `roles`
- Sistema vuelve a estado anterior (todos los usuarios = acceso completo)

---

## Notas de Seguridad

### 1. JWT no cambia
- Token JWT sigue siendo el mismo (solo contiene username)
- Rol se consulta en cada request via `verify_token()`
- Cambios de rol toman efecto inmediato (sin necesidad de re-login)

### 2. Doble protección
Cada endpoint crítico está protegido en:
- **Backend** (dependencias FastAPI) → Seguridad real
- **Frontend** (RoleProtectedRoute) → UX/UI

### 3. Secret Key
- Actualmente hardcoded: `"fluxion-ai-secret-key-change-in-production-2024"`
- **Recomendación:** Mover a variable de entorno antes de producción
- Usar AWS Secrets Manager o similar

### 4. Audit Logging (Futuro)
Para producción, considerar agregar:
```sql
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    usuario_id VARCHAR(50),
    accion VARCHAR(100),
    recurso_tipo VARCHAR(50),
    recurso_id VARCHAR(100),
    detalles JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Cronograma Estimado

| Fase | Duración | Prioridad | Dependencias |
|------|----------|-----------|--------------|
| **Fase 1: Base de Datos** | 1-2 horas | Alta | Ninguna |
| **Fase 2: Backend Core** | 2-3 horas | Alta | Fase 1 |
| **Fase 3: Proteger BI/Admin** | 1 hora | **CRÍTICA** | Fase 2 |
| **Fase 4: Actualizar Login** | 1 hora | Alta | Fase 2 |
| **Fase 5: Frontend Estado** | 2-3 horas | Alta | Fase 4 |
| **Fase 6: Proteger Rutas Frontend** | 1-2 horas | **CRÍTICA** | Fase 5 |
| **Fase 7: Navegación** | 1-2 horas | Media | Fase 5 |
| **Fase 8: Proteger Pedidos** | 2-3 horas | Media | Fase 2 |
| **Fase 9: UI Admin** | 2-3 horas | Media | Fase 6 |
| **Fase 10: Testing** | 1-2 horas | Alta | Todas |

**Total estimado:** 12-16 horas de desarrollo
**Objetivo:** Completar esta semana

---

## Siguientes Pasos

1. ✅ **Revisar y aprobar este plan**
2. ⏭️ **Iniciar Fase 1:** Crear migraciones de base de datos
3. ⏭️ **Ejecutar implementación** siguiendo el orden de fases
4. ⏭️ **Testing exhaustivo** con usuarios de prueba
5. ⏭️ **Deploy a producción** después de verificación local

---

**Documento creado:** 26 de Enero 2026
**Autor:** Plan generado por Claude Code
**Versión:** 1.0
