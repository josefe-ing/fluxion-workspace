-- =====================================================================================
-- ESQUEMA DE AUTENTICACIÓN - FLUXION AI
-- Tabla simple de usuarios con contraseñas hasheadas
-- =====================================================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id VARCHAR PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- bcrypt hash
    nombre_completo VARCHAR(100),
    email VARCHAR(100),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_login TIMESTAMP
);

-- Índice para búsqueda rápida por username
CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios(activo);
