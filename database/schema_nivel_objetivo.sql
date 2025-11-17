-- ============================================================================
-- SCHEMA: SISTEMA DE NIVEL OBJETIVO Y PEDIDO SUGERIDO
-- ============================================================================
-- Descripción: Tablas para calcular niveles objetivo de inventario basados
--              en clasificación ABC-XYZ y generar pedidos sugeridos automáticos
--
-- Autor: Sistema FluxionIA
-- Fecha: 2025-01-12
-- Versión: 1.0
-- ============================================================================

-- ============================================================================
-- TABLA: parametros_reposicion_tienda
-- ============================================================================
-- Propósito: Almacenar parámetros de reposición específicos por tienda y
--            matriz ABC-XYZ. Cada combinación de tienda + matriz tiene
--            configuración personalizada para calcular nivel objetivo.
--
-- Parámetros clave:
-- - nivel_servicio_z: Z-score estadístico (1.96 = 97.5%, 1.65 = 95%, etc.)
-- - multiplicador_demanda: Factor para ajustar demanda esperada en ciclo
-- - multiplicador_ss: Factor para ajustar stock de seguridad
-- - incluir_stock_seguridad: Si false, SS = 0 (productos muy estables o baja prioridad)
-- ============================================================================

CREATE TABLE IF NOT EXISTS parametros_reposicion_tienda (
    id VARCHAR PRIMARY KEY,
    tienda_id VARCHAR NOT NULL,
    matriz_abc_xyz VARCHAR(2) NOT NULL,  -- 'AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'

    -- Parámetros de nivel de servicio
    nivel_servicio_z DECIMAL(3,2) NOT NULL,      -- Z-score: 1.96 (97.5%), 1.65 (95%), 1.28 (90%), 0.00 (sin SS)

    -- Multiplicadores para ajustar cálculos
    multiplicador_demanda DECIMAL(3,2) NOT NULL,  -- Factor demanda ciclo (típico: 0.75 - 1.10)
    multiplicador_ss DECIMAL(3,2) NOT NULL,       -- Factor stock seguridad (típico: 0.00 - 1.50)

    -- Control de stock de seguridad
    incluir_stock_seguridad BOOLEAN NOT NULL,     -- Si false, SS = 0 independiente de Z
    prioridad_reposicion INTEGER NOT NULL,        -- 1=más prioritario (AX), 9=menos (CZ)

    -- Auditoría
    activo BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modificado_por VARCHAR DEFAULT 'sistema',

    -- Constraints
    UNIQUE(tienda_id, matriz_abc_xyz),
    FOREIGN KEY (tienda_id) REFERENCES ubicaciones(id),

    CHECK (matriz_abc_xyz IN ('AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ')),
    CHECK (nivel_servicio_z >= 0.00 AND nivel_servicio_z <= 3.00),
    CHECK (multiplicador_demanda >= 0.00 AND multiplicador_demanda <= 5.00),
    CHECK (multiplicador_ss >= 0.00 AND multiplicador_ss <= 5.00),
    CHECK (prioridad_reposicion >= 1 AND prioridad_reposicion <= 9)
);

-- Índices para optimización de consultas
CREATE INDEX IF NOT EXISTS idx_param_reposicion_tienda
    ON parametros_reposicion_tienda(tienda_id);

CREATE INDEX IF NOT EXISTS idx_param_reposicion_matriz
    ON parametros_reposicion_tienda(matriz_abc_xyz);

-- Nota: DuckDB no soporta índices parciales (WHERE clause)
-- CREATE INDEX IF NOT EXISTS idx_param_reposicion_activo
--     ON parametros_reposicion_tienda(activo)
--     WHERE activo = true;


-- ============================================================================
-- TABLA: pedidos_sugeridos_auditoria
-- ============================================================================
-- Propósito: Registrar TODOS los cambios manuales realizados sobre pedidos
--            sugeridos para auditoría y análisis posterior.
--
-- Tipos de cambios rastreados:
-- - override_manual: Usuario modifica cantidad sugerida manualmente
-- - ajuste_sistema: Sistema ajusta por restricciones (stock máximo, disponibilidad)
-- - fair_share: Sistema aplica algoritmo de distribución equitativa (futuro)
-- - exclusion_producto: Usuario excluye producto del pedido
-- - inclusion_forzada: Usuario fuerza inclusión de producto no sugerido
-- ============================================================================

CREATE TABLE IF NOT EXISTS pedidos_sugeridos_auditoria (
    id VARCHAR PRIMARY KEY,
    pedido_id VARCHAR NOT NULL,
    producto_id VARCHAR NOT NULL,

    -- Campos de cambio
    campo_modificado VARCHAR(100) NOT NULL,     -- 'cantidad_sugerida', 'incluido', 'nivel_objetivo', etc.
    valor_anterior VARCHAR(500),                -- Valor antes del cambio
    valor_nuevo VARCHAR(500),                   -- Valor después del cambio

    -- Contexto del cambio
    tipo_cambio VARCHAR(50) NOT NULL,           -- 'override_manual', 'ajuste_sistema', 'fair_share', etc.
    razon_cambio TEXT,                          -- Explicación del cambio

    -- Metadata de auditoría
    usuario VARCHAR(100),                       -- Usuario que realizó el cambio
    rol_usuario VARCHAR(50),                    -- Rol del usuario (gerente, comprador, admin)
    ip_address VARCHAR(45),                     -- IP desde donde se hizo el cambio
    user_agent TEXT,                            -- Navegador/cliente usado

    -- Timestamps
    fecha_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    FOREIGN KEY (pedido_id) REFERENCES pedidos_sugeridos(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id),

    CHECK (tipo_cambio IN ('override_manual', 'ajuste_sistema', 'fair_share', 'exclusion_producto', 'inclusion_forzada', 'cambio_estado'))
);

-- Índices para consultas de auditoría
CREATE INDEX IF NOT EXISTS idx_auditoria_pedido
    ON pedidos_sugeridos_auditoria(pedido_id);

CREATE INDEX IF NOT EXISTS idx_auditoria_producto
    ON pedidos_sugeridos_auditoria(producto_id);

CREATE INDEX IF NOT EXISTS idx_auditoria_usuario
    ON pedidos_sugeridos_auditoria(usuario);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha
    ON pedidos_sugeridos_auditoria(fecha_cambio DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_tipo
    ON pedidos_sugeridos_auditoria(tipo_cambio);


-- ============================================================================
-- COMENTARIOS EN TABLAS Y COLUMNAS
-- ============================================================================

COMMENT ON TABLE parametros_reposicion_tienda IS
'Configuración de parámetros de reposición por tienda y matriz ABC-XYZ.
Define cómo calcular nivel objetivo para cada cuadrante de la matriz.';

COMMENT ON COLUMN parametros_reposicion_tienda.nivel_servicio_z IS
'Z-score estadístico para nivel de servicio: 1.96 (97.5%), 1.65 (95%), 1.28 (90%), 0.00 (sin stock seguridad)';

COMMENT ON COLUMN parametros_reposicion_tienda.multiplicador_demanda IS
'Factor para ajustar demanda esperada durante ciclo de reposición.
Valores > 1.0 aumentan inventario, < 1.0 reducen (ej: productos lentos).';

COMMENT ON COLUMN parametros_reposicion_tienda.multiplicador_ss IS
'Factor para ajustar stock de seguridad. Valores altos = más protección contra variabilidad.';

COMMENT ON COLUMN parametros_reposicion_tienda.incluir_stock_seguridad IS
'Si false, stock_seguridad = 0 sin importar Z-score. Usado para productos muy estables o baja prioridad (ej: CZ).';

COMMENT ON TABLE pedidos_sugeridos_auditoria IS
'Registro de auditoría de todos los cambios realizados sobre pedidos sugeridos.
Permite rastrear modificaciones manuales y ajustes automáticos del sistema.';

COMMENT ON COLUMN pedidos_sugeridos_auditoria.tipo_cambio IS
'Tipo de cambio: override_manual (usuario), ajuste_sistema (automático), fair_share (distribución equitativa)';
