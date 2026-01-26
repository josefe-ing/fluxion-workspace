-- Migration 030 UP: Add RBAC (Role-Based Access Control) System
-- Fecha: 2026-01-26
-- Descripción: Implementa sistema de roles y permisos para control de acceso granular

BEGIN;

-- =====================================================================================
-- 1. CREAR TABLA DE ROLES
-- =====================================================================================
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    nivel_acceso INTEGER NOT NULL,  -- 1=Visualizador, 5=Super Admin
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar roles del sistema
INSERT INTO roles (id, nombre, descripcion, nivel_acceso) VALUES
    ('visualizador', 'Visualizador', 'Acceso de solo lectura a dashboards y reportes', 1),
    ('gerente_tienda', 'Gerente de Tienda', 'Gestión de tiendas asignadas', 2),
    ('gestor_abastecimiento', 'Gestor de Abastecimiento', 'Creación de pedidos para todas las tiendas', 3),
    ('gerente_general', 'Gerente General', 'Visualización de todas las tiendas y creación de pedidos', 4),
    ('super_admin', 'Super Admin', 'Acceso completo al sistema', 5)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================================
-- 2. AGREGAR COLUMNA ROL_ID A TABLA USUARIOS
-- =====================================================================================
-- Agregar columna rol_id con default 'visualizador'
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS rol_id VARCHAR(50) REFERENCES roles(id) DEFAULT 'visualizador';

-- Crear índice para consultas rápidas por rol
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol_id);

-- =====================================================================================
-- 3. MIGRAR USUARIOS EXISTENTES A SUPER_ADMIN
-- =====================================================================================
-- IMPORTANTE: Todos los usuarios existentes obtienen super_admin por defecto
-- Esto es seguro porque:
--   1. No elimina acceso a nadie
--   2. Permite seguir trabajando inmediatamente
--   3. Roles se ajustan manualmente después
UPDATE usuarios
SET rol_id = 'super_admin'
WHERE rol_id IS NULL OR rol_id = 'visualizador';

-- =====================================================================================
-- 4. CREAR TABLA DE ASIGNACIÓN DE TIENDAS A USUARIOS
-- =====================================================================================
-- Solo se usa para usuarios con rol 'gerente_tienda'
CREATE TABLE IF NOT EXISTS usuarios_tiendas (
    id SERIAL PRIMARY KEY,
    usuario_id VARCHAR(50) NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    ubicacion_id VARCHAR(50) NOT NULL,  -- ID de tienda (no FK para evitar deps circulares)
    asignado_por VARCHAR(50),  -- Usuario ID que hizo la asignación
    asignado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT TRUE,
    CONSTRAINT unique_usuario_tienda UNIQUE(usuario_id, ubicacion_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_usuarios_tiendas_usuario ON usuarios_tiendas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_tiendas_ubicacion ON usuarios_tiendas(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_tiendas_activo ON usuarios_tiendas(activo) WHERE activo = TRUE;

-- =====================================================================================
-- 5. AGREGAR COMENTARIOS PARA DOCUMENTACIÓN
-- =====================================================================================
COMMENT ON TABLE roles IS 'Catálogo de roles del sistema RBAC';
COMMENT ON COLUMN roles.id IS 'Identificador único del rol (slug)';
COMMENT ON COLUMN roles.nombre IS 'Nombre descriptivo del rol';
COMMENT ON COLUMN roles.descripcion IS 'Descripción de los permisos del rol';
COMMENT ON COLUMN roles.nivel_acceso IS 'Nivel jerárquico: 1=Menor acceso, 5=Mayor acceso';

COMMENT ON TABLE usuarios_tiendas IS 'Asignación de tiendas específicas a Gerentes de Tienda';
COMMENT ON COLUMN usuarios_tiendas.usuario_id IS 'Usuario con rol gerente_tienda';
COMMENT ON COLUMN usuarios_tiendas.ubicacion_id IS 'ID de tienda asignada';
COMMENT ON COLUMN usuarios_tiendas.asignado_por IS 'Usuario que realizó la asignación';
COMMENT ON COLUMN usuarios_tiendas.activo IS 'Flag para soft-delete de asignaciones';

COMMENT ON COLUMN usuarios.rol_id IS 'Rol del usuario (visualizador, gerente_tienda, gestor_abastecimiento, gerente_general, super_admin)';

-- =====================================================================================
-- 6. REGISTRAR MIGRACIÓN
-- =====================================================================================
INSERT INTO schema_migrations (version, name)
VALUES ('030', 'add_rbac_system')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =====================================================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- =====================================================================================
-- Para verificar la migración ejecuta:
--   SELECT * FROM roles;
--   SELECT username, rol_id FROM usuarios;
--   SELECT COUNT(*) FROM usuarios_tiendas;
