-- ============================================================================
-- SCHEMA: Sistema de Detección de Emergencias de Inventario
-- Fluxion AI - Pedido de Emergencia v2
-- Fecha: 2025-12-13
-- ============================================================================

-- ============================================================================
-- TABLA 1: Configuración por Tienda (MVP - Feature Toggle)
-- ============================================================================

CREATE TABLE IF NOT EXISTS emergencias_config_tienda (
    ubicacion_id VARCHAR(50) PRIMARY KEY,

    -- Feature Toggle
    habilitado BOOLEAN DEFAULT FALSE,
    fecha_habilitacion TIMESTAMP,

    -- Umbrales personalizables por tienda
    umbral_critico NUMERIC(5,2) DEFAULT 0.25,      -- Cobertura < 25% = CRITICO
    umbral_inminente NUMERIC(5,2) DEFAULT 0.50,    -- Cobertura < 50% = INMINENTE
    umbral_alerta NUMERIC(5,2) DEFAULT 0.75,       -- Cobertura < 75% = ALERTA

    -- Configuración de notificaciones
    emails_notificacion TEXT[],                     -- Lista de emails para alertas
    notificaciones_activas BOOLEAN DEFAULT TRUE,

    -- Metadata
    creado_por VARCHAR(100),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id)
);

COMMENT ON TABLE emergencias_config_tienda IS 'Configuración del sistema de emergencias por tienda';
COMMENT ON COLUMN emergencias_config_tienda.habilitado IS 'TRUE = tienda participa en detección de emergencias';
COMMENT ON COLUMN emergencias_config_tienda.umbral_critico IS 'Cobertura menor a este valor = emergencia CRITICA';


-- ============================================================================
-- TABLA 2: Anomalías de Inventario Detectadas (MVP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS emergencias_anomalias (
    id BIGSERIAL PRIMARY KEY,

    -- Identificación
    ubicacion_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,
    almacen_codigo VARCHAR(50),

    -- Tipo de anomalía
    tipo_anomalia VARCHAR(50) NOT NULL,  -- STOCK_NEGATIVO, VENTA_IMPOSIBLE, SPIKE_VENTAS, DISCREPANCIA

    -- Valores detectados
    valor_detectado NUMERIC(12,4),        -- El valor anómalo encontrado
    valor_esperado NUMERIC(12,4),         -- El valor que debería ser
    desviacion_porcentual NUMERIC(8,4),   -- % de desviación

    -- Descripción
    descripcion TEXT,
    severidad VARCHAR(20) DEFAULT 'MEDIA', -- BAJA, MEDIA, ALTA, CRITICA

    -- Estado
    estado VARCHAR(20) DEFAULT 'PENDIENTE', -- PENDIENTE, REVISADO, RESUELTO, IGNORADO
    resuelto_por VARCHAR(100),
    fecha_resolucion TIMESTAMP,
    notas_resolucion TEXT,

    -- Metadata
    fecha_deteccion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scan_id VARCHAR(50),                   -- ID del scan que detectó la anomalía

    -- Foreign keys
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

CREATE INDEX idx_anomalias_ubicacion ON emergencias_anomalias(ubicacion_id);
CREATE INDEX idx_anomalias_tipo ON emergencias_anomalias(tipo_anomalia);
CREATE INDEX idx_anomalias_estado ON emergencias_anomalias(estado);
CREATE INDEX idx_anomalias_fecha ON emergencias_anomalias(fecha_deteccion);
CREATE INDEX idx_anomalias_severidad ON emergencias_anomalias(severidad) WHERE estado = 'PENDIENTE';

COMMENT ON TABLE emergencias_anomalias IS 'Anomalías de inventario detectadas por el sistema';
COMMENT ON COLUMN emergencias_anomalias.tipo_anomalia IS 'STOCK_NEGATIVO | VENTA_IMPOSIBLE | SPIKE_VENTAS | DISCREPANCIA';


-- ============================================================================
-- TABLA 3: Tracking de Emergencias (Fase 2 - Confirmación 2 Scans)
-- ============================================================================

CREATE TABLE IF NOT EXISTS emergencias_tracking (
    id BIGSERIAL PRIMARY KEY,

    -- Identificación del producto/tienda
    ubicacion_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50) NOT NULL,

    -- Tipo de emergencia detectada
    tipo_emergencia VARCHAR(30) NOT NULL, -- STOCKOUT, CRITICO, INMINENTE, ALERTA

    -- Valores del scan
    stock_actual NUMERIC(12,4),
    demanda_restante NUMERIC(12,4),
    cobertura NUMERIC(8,4),
    factor_intensidad NUMERIC(8,4),

    -- Conteo de detecciones consecutivas
    detecciones_consecutivas INTEGER DEFAULT 1,
    primera_deteccion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultima_deteccion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Estado
    confirmado BOOLEAN DEFAULT FALSE,       -- TRUE después de 2 detecciones consecutivas
    fecha_confirmacion TIMESTAMP,

    -- Metadata
    scan_ids TEXT[],                        -- Array con IDs de los scans que detectaron

    -- Foreign keys
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id),

    -- Unique constraint para evitar duplicados
    UNIQUE(ubicacion_id, producto_id, tipo_emergencia)
);

CREATE INDEX idx_tracking_ubicacion ON emergencias_tracking(ubicacion_id);
CREATE INDEX idx_tracking_confirmado ON emergencias_tracking(confirmado) WHERE confirmado = FALSE;
CREATE INDEX idx_tracking_tipo ON emergencias_tracking(tipo_emergencia);

COMMENT ON TABLE emergencias_tracking IS 'Tracking para confirmación de emergencias (requiere 2 detecciones)';
COMMENT ON COLUMN emergencias_tracking.confirmado IS 'TRUE = emergencia confirmada con 2+ scans consecutivos';


-- ============================================================================
-- TABLA 4: Alertas Enviadas (Fase 2 - Cooldown)
-- ============================================================================

CREATE TABLE IF NOT EXISTS emergencias_alertas_enviadas (
    id BIGSERIAL PRIMARY KEY,

    -- Identificación
    ubicacion_id VARCHAR(50) NOT NULL,
    producto_id VARCHAR(50),               -- NULL si es alerta general de tienda

    -- Tipo de alerta
    tipo_alerta VARCHAR(30) NOT NULL,      -- STOCKOUT, CRITICO, INMINENTE, BATCH_RESUMEN
    canal VARCHAR(20) NOT NULL,            -- EMAIL, SMS, WEBHOOK

    -- Destinatario
    destinatario VARCHAR(200) NOT NULL,    -- Email o teléfono

    -- Contenido
    asunto VARCHAR(500),
    contenido_resumen TEXT,

    -- Estado de envío
    estado_envio VARCHAR(20) DEFAULT 'ENVIADO', -- ENVIADO, FALLIDO, REBOTADO
    error_mensaje TEXT,

    -- Timestamps para cooldown
    fecha_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cooldown_hasta TIMESTAMP,              -- No re-alertar hasta esta fecha

    -- Foreign keys
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

CREATE INDEX idx_alertas_ubicacion_producto ON emergencias_alertas_enviadas(ubicacion_id, producto_id);
CREATE INDEX idx_alertas_cooldown ON emergencias_alertas_enviadas(cooldown_hasta) WHERE cooldown_hasta > CURRENT_TIMESTAMP;
CREATE INDEX idx_alertas_fecha ON emergencias_alertas_enviadas(fecha_envio);

COMMENT ON TABLE emergencias_alertas_enviadas IS 'Historial de alertas enviadas con control de cooldown';
COMMENT ON COLUMN emergencias_alertas_enviadas.cooldown_hasta IS 'No enviar nueva alerta para este producto hasta esta fecha';


-- ============================================================================
-- TABLA 5: Lista de Exclusiones (Fase 2 - Blindaje)
-- ============================================================================

CREATE TABLE IF NOT EXISTS emergencias_exclusiones (
    id BIGSERIAL PRIMARY KEY,

    -- Scope de exclusión
    ubicacion_id VARCHAR(50),              -- NULL = aplica a todas las tiendas
    producto_id VARCHAR(50),               -- NULL = excluir toda la categoría
    categoria VARCHAR(200),                -- NULL = excluir solo producto específico

    -- Razón de exclusión
    motivo VARCHAR(50) NOT NULL,           -- DESCONTINUADO, ESTACIONAL, BAJA_ROTACION, MANUAL
    descripcion TEXT,

    -- Vigencia
    fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_fin DATE,                        -- NULL = exclusión permanente

    -- Metadata
    creado_por VARCHAR(100),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT TRUE,

    -- Foreign keys (opcionales según scope)
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

CREATE INDEX idx_exclusiones_ubicacion ON emergencias_exclusiones(ubicacion_id) WHERE activo = TRUE;
CREATE INDEX idx_exclusiones_producto ON emergencias_exclusiones(producto_id) WHERE activo = TRUE;
CREATE INDEX idx_exclusiones_categoria ON emergencias_exclusiones(categoria) WHERE activo = TRUE;
CREATE INDEX idx_exclusiones_vigente ON emergencias_exclusiones(fecha_inicio, fecha_fin) WHERE activo = TRUE;

COMMENT ON TABLE emergencias_exclusiones IS 'Productos/categorías excluidos del sistema de alertas';
COMMENT ON COLUMN emergencias_exclusiones.motivo IS 'DESCONTINUADO | ESTACIONAL | BAJA_ROTACION | MANUAL';


-- ============================================================================
-- TABLA 6: Perfil Horario de Ventas (Fase 2 - Factor Intensidad)
-- ============================================================================

CREATE TABLE IF NOT EXISTS emergencias_perfil_horario (
    id BIGSERIAL PRIMARY KEY,

    -- Dimensiones
    ubicacion_id VARCHAR(50) NOT NULL,
    dia_semana INTEGER NOT NULL,           -- 0=Lunes, 6=Domingo
    hora INTEGER NOT NULL,                 -- 0-23

    -- Perfil calculado
    porcentaje_ventas NUMERIC(8,6) NOT NULL, -- % de ventas diarias en esta hora
    ventas_promedio NUMERIC(12,2),           -- Ventas promedio en esta hora
    desviacion_estandar NUMERIC(12,2),       -- Para detectar anomalías

    -- Datos base
    semanas_calculadas INTEGER DEFAULT 0,    -- Cuántas semanas de datos
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key
    FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),

    -- Unique constraint
    UNIQUE(ubicacion_id, dia_semana, hora)
);

CREATE INDEX idx_perfil_ubicacion_dia ON emergencias_perfil_horario(ubicacion_id, dia_semana);

COMMENT ON TABLE emergencias_perfil_horario IS 'Perfil de distribución horaria de ventas por tienda y día';
COMMENT ON COLUMN emergencias_perfil_horario.porcentaje_ventas IS 'Ej: 0.08 = 8% de las ventas diarias ocurren en esta hora';


-- ============================================================================
-- TABLA 7: Historial de Scans (Para auditoría y debugging)
-- ============================================================================

CREATE TABLE IF NOT EXISTS emergencias_scans (
    id VARCHAR(50) PRIMARY KEY,            -- UUID del scan

    -- Metadata del scan
    fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_fin TIMESTAMP,
    duracion_ms INTEGER,

    -- Scope
    tiendas_escaneadas TEXT[],             -- Array de ubicacion_id

    -- Resultados
    total_productos_analizados INTEGER DEFAULT 0,
    emergencias_detectadas INTEGER DEFAULT 0,
    anomalias_detectadas INTEGER DEFAULT 0,

    -- Breakdown por tipo
    stockouts INTEGER DEFAULT 0,
    criticos INTEGER DEFAULT 0,
    inminentes INTEGER DEFAULT 0,
    alertas INTEGER DEFAULT 0,

    -- Estado
    estado VARCHAR(20) DEFAULT 'EN_PROGRESO', -- EN_PROGRESO, COMPLETADO, ERROR
    error_mensaje TEXT,

    -- Trigger
    trigger_tipo VARCHAR(20) NOT NULL,     -- MANUAL, SCHEDULER, API
    trigger_usuario VARCHAR(100)
);

CREATE INDEX idx_scans_fecha ON emergencias_scans(fecha_inicio);
CREATE INDEX idx_scans_estado ON emergencias_scans(estado);

COMMENT ON TABLE emergencias_scans IS 'Historial de ejecuciones del detector de emergencias';


-- ============================================================================
-- VISTA: Emergencias Activas (Para consulta rápida)
-- ============================================================================

CREATE OR REPLACE VIEW v_emergencias_activas AS
SELECT
    t.ubicacion_id,
    u.nombre AS tienda_nombre,
    t.producto_id,
    p.nombre AS producto_nombre,
    p.categoria,
    t.tipo_emergencia,
    t.stock_actual,
    t.demanda_restante,
    t.cobertura,
    t.factor_intensidad,
    t.detecciones_consecutivas,
    t.confirmado,
    t.primera_deteccion,
    t.ultima_deteccion
FROM emergencias_tracking t
JOIN ubicaciones u ON t.ubicacion_id = u.id
JOIN productos p ON t.producto_id = p.id
WHERE t.ultima_deteccion > CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY
    CASE t.tipo_emergencia
        WHEN 'STOCKOUT' THEN 1
        WHEN 'CRITICO' THEN 2
        WHEN 'INMINENTE' THEN 3
        ELSE 4
    END,
    t.cobertura ASC;

COMMENT ON VIEW v_emergencias_activas IS 'Vista de emergencias activas en las últimas 24 horas';


-- ============================================================================
-- FUNCIÓN: Limpiar tracking antiguo (Mantenimiento)
-- ============================================================================

CREATE OR REPLACE FUNCTION limpiar_tracking_antiguo()
RETURNS INTEGER AS $$
DECLARE
    filas_eliminadas INTEGER;
BEGIN
    -- Eliminar tracking de más de 7 días sin confirmación
    DELETE FROM emergencias_tracking
    WHERE ultima_deteccion < CURRENT_TIMESTAMP - INTERVAL '7 days'
    AND confirmado = FALSE;

    GET DIAGNOSTICS filas_eliminadas = ROW_COUNT;
    RETURN filas_eliminadas;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION limpiar_tracking_antiguo() IS 'Elimina registros de tracking no confirmados después de 7 días';


-- ============================================================================
-- DATOS INICIALES: Configuración por defecto para tiendas piloto
-- ============================================================================

-- Nota: Descomentar y ajustar según tiendas existentes
-- INSERT INTO emergencias_config_tienda (ubicacion_id, habilitado, creado_por)
-- VALUES
--     ('tienda_17', FALSE, 'setup_inicial'),  -- ARTIGAS
--     ('tienda_18', FALSE, 'setup_inicial')   -- PARAISO
-- ON CONFLICT (ubicacion_id) DO NOTHING;
