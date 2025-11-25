-- =========================================================================
-- Migration 004 UP: Add usuarios table
-- Description: Creates authentication table for system users
-- Date: 2025-11-25
-- Author: System
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Create usuarios table
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usuarios (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(100),
    email VARCHAR(100),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_login TIMESTAMP
);

-- -------------------------------------------------------------------------
-- 2. Create indexes
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios(activo) WHERE activo = TRUE;

-- -------------------------------------------------------------------------
-- 3. Add table and column comments
-- -------------------------------------------------------------------------

COMMENT ON TABLE usuarios IS
    'Usuarios del sistema con autenticación basada en bcrypt';

COMMENT ON COLUMN usuarios.username IS
    'Nombre de usuario único para login';

COMMENT ON COLUMN usuarios.password_hash IS
    'Hash bcrypt de la contraseña (nunca almacenar passwords en texto plano)';

COMMENT ON COLUMN usuarios.activo IS
    'Flag de usuario activo (false = deshabilitado, no puede hacer login)';

COMMENT ON COLUMN usuarios.ultimo_login IS
    'Timestamp del último login exitoso';

-- -------------------------------------------------------------------------
-- 4. Record this migration in schema_migrations
-- -------------------------------------------------------------------------

INSERT INTO schema_migrations (version, name)
VALUES ('004', 'add_usuarios')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 004 UP
-- =========================================================================
