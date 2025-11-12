-- =====================================================================================
-- TABLA: ALERTAS DE CAMBIOS DE CLASIFICACIÓN ABC-XYZ
-- =====================================================================================
-- Sistema para registrar y dar seguimiento a cambios en clasificaciones de productos
-- Permite detectar productos que requieren atención inmediata
-- =====================================================================================

CREATE TABLE IF NOT EXISTS alertas_cambio_clasificacion (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    codigo_producto VARCHAR NOT NULL,
    ubicacion_id VARCHAR NOT NULL,

    -- Cambio detectado
    clasificacion_anterior VARCHAR(20) NOT NULL,
    clasificacion_nueva VARCHAR(20) NOT NULL,
    fecha_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Tipo de cambio
    tipo_cambio VARCHAR(50) NOT NULL, -- 'ABC', 'XYZ', 'MATRIZ'
    cambio_clasificacion VARCHAR(50) NOT NULL, -- 'C_a_A', 'A_a_B', 'X_a_Z', etc.

    -- Nivel de criticidad
    es_critico BOOLEAN DEFAULT false,
    nivel_prioridad VARCHAR(20) DEFAULT 'MEDIA', -- 'ALTA', 'MEDIA', 'BAJA'
    requiere_accion BOOLEAN DEFAULT true,

    -- Contexto del cambio (ABC)
    valor_anterior DECIMAL(18,2),
    valor_nuevo DECIMAL(18,2),
    cambio_porcentual DECIMAL(8,2),
    ranking_anterior INTEGER,
    ranking_nuevo INTEGER,
    cambio_ranking INTEGER,

    -- Contexto del cambio (XYZ)
    cv_anterior DECIMAL(8,4),
    cv_nuevo DECIMAL(8,4),
    matriz_anterior VARCHAR(10),
    matriz_nueva VARCHAR(10),

    -- Acciones y seguimiento
    accion_recomendada TEXT,
    revisado BOOLEAN DEFAULT false,
    revisado_por VARCHAR,
    revisado_fecha TIMESTAMP,
    notas TEXT,

    -- Metadata
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CHECK (tipo_cambio IN ('ABC', 'XYZ', 'MATRIZ')),
    CHECK (nivel_prioridad IN ('ALTA', 'MEDIA', 'BAJA'))
);

-- =====================================================================================
-- ÍNDICES
-- =====================================================================================

CREATE INDEX IF NOT EXISTS idx_alertas_producto_ubicacion
    ON alertas_cambio_clasificacion(codigo_producto, ubicacion_id);

CREATE INDEX IF NOT EXISTS idx_alertas_fecha_cambio
    ON alertas_cambio_clasificacion(fecha_cambio DESC);

CREATE INDEX IF NOT EXISTS idx_alertas_no_revisadas
    ON alertas_cambio_clasificacion(revisado, es_critico, fecha_cambio DESC);

CREATE INDEX IF NOT EXISTS idx_alertas_tipo_cambio
    ON alertas_cambio_clasificacion(tipo_cambio, cambio_clasificacion);

CREATE INDEX IF NOT EXISTS idx_alertas_prioridad
    ON alertas_cambio_clasificacion(nivel_prioridad, fecha_cambio DESC);

-- =====================================================================================
-- VISTAS ÚTILES
-- =====================================================================================

-- Vista: Alertas pendientes de revisión
CREATE OR REPLACE VIEW v_alertas_pendientes AS
SELECT
    a.id,
    a.codigo_producto,
    p.descripcion as producto_descripcion,
    p.categoria,
    a.ubicacion_id,
    a.tipo_cambio,
    a.cambio_clasificacion,
    a.clasificacion_anterior,
    a.clasificacion_nueva,
    a.es_critico,
    a.nivel_prioridad,
    a.fecha_cambio,
    a.accion_recomendada,
    a.cambio_porcentual,
    a.matriz_anterior,
    a.matriz_nueva
FROM alertas_cambio_clasificacion a
LEFT JOIN productos p ON a.codigo_producto = p.codigo
WHERE a.revisado = false
ORDER BY
    CASE a.nivel_prioridad
        WHEN 'ALTA' THEN 1
        WHEN 'MEDIA' THEN 2
        WHEN 'BAJA' THEN 3
    END,
    a.fecha_cambio DESC;

-- Vista: Alertas críticas últimos 7 días
CREATE OR REPLACE VIEW v_alertas_criticas_recientes AS
SELECT
    a.id,
    a.codigo_producto,
    p.descripcion as producto_descripcion,
    p.categoria,
    p.marca,
    a.ubicacion_id,
    a.tipo_cambio,
    a.cambio_clasificacion,
    a.clasificacion_anterior,
    a.clasificacion_nueva,
    a.fecha_cambio,
    a.valor_anterior,
    a.valor_nuevo,
    a.cambio_porcentual,
    a.matriz_anterior,
    a.matriz_nueva,
    a.revisado,
    a.accion_recomendada
FROM alertas_cambio_clasificacion a
LEFT JOIN productos p ON a.codigo_producto = p.codigo
WHERE a.es_critico = true
    AND a.fecha_cambio >= CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY a.fecha_cambio DESC;

-- Vista: Resumen de alertas por tienda
CREATE OR REPLACE VIEW v_alertas_resumen_tienda AS
SELECT
    ubicacion_id,
    COUNT(*) as total_alertas,
    COUNT(CASE WHEN es_critico THEN 1 END) as alertas_criticas,
    COUNT(CASE WHEN nivel_prioridad = 'ALTA' THEN 1 END) as prioridad_alta,
    COUNT(CASE WHEN nivel_prioridad = 'MEDIA' THEN 1 END) as prioridad_media,
    COUNT(CASE WHEN nivel_prioridad = 'BAJA' THEN 1 END) as prioridad_baja,
    COUNT(CASE WHEN revisado = false THEN 1 END) as pendientes_revision,
    COUNT(CASE WHEN tipo_cambio = 'ABC' THEN 1 END) as cambios_abc,
    COUNT(CASE WHEN tipo_cambio = 'XYZ' THEN 1 END) as cambios_xyz,
    MAX(fecha_cambio) as ultima_alerta
FROM alertas_cambio_clasificacion
WHERE fecha_cambio >= CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY ubicacion_id
ORDER BY ubicacion_id;

-- Vista: Productos con múltiples cambios (volatilidad)
CREATE OR REPLACE VIEW v_productos_volatiles AS
SELECT
    a.codigo_producto,
    p.descripcion as producto_descripcion,
    p.categoria,
    a.ubicacion_id,
    COUNT(*) as num_cambios,
    COUNT(CASE WHEN a.es_critico THEN 1 END) as cambios_criticos,
    MIN(a.fecha_cambio) as primer_cambio,
    MAX(a.fecha_cambio) as ultimo_cambio,
    STRING_AGG(a.cambio_clasificacion, ' → ' ORDER BY a.fecha_cambio) as secuencia_cambios
FROM alertas_cambio_clasificacion a
LEFT JOIN productos p ON a.codigo_producto = p.codigo
WHERE a.fecha_cambio >= CURRENT_TIMESTAMP - INTERVAL '90 days'
GROUP BY a.codigo_producto, p.descripcion, p.categoria, a.ubicacion_id
HAVING COUNT(*) >= 3
ORDER BY num_cambios DESC, cambios_criticos DESC;

-- =====================================================================================
-- COMENTARIOS
-- =====================================================================================

COMMENT ON TABLE alertas_cambio_clasificacion IS
'Registro de cambios en clasificaciones ABC-XYZ de productos.
Permite dar seguimiento a productos que cambian de categoría y requieren atención.
Las alertas críticas incluyen cambios drásticos como A→C o X→Z que pueden indicar
problemas operativos o cambios en patrones de demanda.';

COMMENT ON COLUMN alertas_cambio_clasificacion.es_critico IS
'Cambios críticos incluyen:
- ABC: A↔C (alto valor a bajo o viceversa)
- XYZ: X↔Z (estable a errático o viceversa)
- Cambios que requieren acción inmediata en gestión de inventario';

COMMENT ON COLUMN alertas_cambio_clasificacion.nivel_prioridad IS
'ALTA: Productos clase A con cambios críticos o cambios drásticos de valor/volatilidad
MEDIA: Productos clase B con cambios o clase A con cambios menores
BAJA: Productos clase C con cambios menores';

COMMENT ON VIEW v_alertas_pendientes IS
'Alertas que aún no han sido revisadas, ordenadas por prioridad y fecha.
Usar esta vista para el dashboard de gestión diaria.';

COMMENT ON VIEW v_productos_volatiles IS
'Productos con múltiples cambios de clasificación en los últimos 90 días.
Indica productos con patrones inestables que requieren análisis especial.';
