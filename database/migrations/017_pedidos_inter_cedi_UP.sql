-- =========================================================================
-- Migration 017 UP: Sistema de Pedidos Inter-CEDI
-- Description: Creates tables for Inter-CEDI ordering system
--              (Valencia CEDIs -> Caracas CEDI)
-- Date: 2025-12-13
-- Author: System
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. MAIN TABLE: pedidos_inter_cedi (Order Header)
-- =========================================================================

CREATE TABLE IF NOT EXISTS pedidos_inter_cedi (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    numero_pedido VARCHAR(20) UNIQUE NOT NULL,  -- Format: IC-00001

    -- CEDI Destination (who requests/receives)
    cedi_destino_id VARCHAR(50) NOT NULL,
    cedi_destino_nombre VARCHAR(100),
    cedi_destino_region VARCHAR(50),  -- 'CARACAS', 'VALENCIA', etc.

    -- Dates
    fecha_pedido DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_confirmacion TIMESTAMP,
    fecha_despacho TIMESTAMP,
    fecha_recepcion TIMESTAMP,

    -- State and control
    estado VARCHAR(50) NOT NULL DEFAULT 'borrador',
    -- States: borrador, confirmado, despachado, recibido, cancelado

    -- Order configuration
    tipo_pedido VARCHAR(50) DEFAULT 'inter_cedi',
    prioridad VARCHAR(20) DEFAULT 'normal',
    metodo_calculo VARCHAR(50) DEFAULT 'DEMANDA_REGIONAL_ABC',

    -- ABC coverage days configuration (per order)
    dias_cobertura_a INTEGER DEFAULT 7,
    dias_cobertura_b INTEGER DEFAULT 14,
    dias_cobertura_c INTEGER DEFAULT 21,
    dias_cobertura_d INTEGER DEFAULT 30,

    -- Transport configuration
    frecuencia_viajes_dias VARCHAR(100) DEFAULT 'Mar,Jue,Sab',
    lead_time_dias DECIMAL(4,2) DEFAULT 2.0,

    -- Consolidated totals (sum of all origin CEDIs)
    total_cedis_origen INTEGER DEFAULT 0,
    total_productos INTEGER DEFAULT 0,
    total_lineas INTEGER DEFAULT 0,
    total_bultos DECIMAL(12,4) DEFAULT 0,
    total_unidades DECIMAL(12,4) DEFAULT 0,
    total_peso_kg DECIMAL(12,4),

    -- Notes
    observaciones TEXT,
    notas_logistica TEXT,
    notas_recepcion TEXT,

    -- Users
    usuario_creador VARCHAR(100) DEFAULT 'sistema',
    usuario_confirmador VARCHAR(100),
    usuario_despachador VARCHAR(100),
    usuario_receptor VARCHAR(100),

    -- Version control
    version INTEGER DEFAULT 1,

    -- Constraints
    CONSTRAINT chk_pedidos_intercedi_estado CHECK (estado IN (
        'borrador', 'confirmado', 'despachado', 'recibido', 'cancelado'
    )),
    CONSTRAINT chk_pedidos_intercedi_prioridad CHECK (prioridad IN ('baja', 'normal', 'alta', 'urgente'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_intercedi_numero ON pedidos_inter_cedi(numero_pedido);
CREATE INDEX IF NOT EXISTS idx_intercedi_estado ON pedidos_inter_cedi(estado);
CREATE INDEX IF NOT EXISTS idx_intercedi_destino ON pedidos_inter_cedi(cedi_destino_id);
CREATE INDEX IF NOT EXISTS idx_intercedi_fecha_creacion ON pedidos_inter_cedi(fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_intercedi_fecha_pedido ON pedidos_inter_cedi(fecha_pedido DESC);

COMMENT ON TABLE pedidos_inter_cedi IS 'Inter-CEDI orders (Valencia -> Caracas). Main header table.';

-- =========================================================================
-- 2. DETAIL TABLE: pedidos_inter_cedi_detalle (Products)
-- =========================================================================

CREATE TABLE IF NOT EXISTS pedidos_inter_cedi_detalle (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    pedido_id VARCHAR(50) NOT NULL REFERENCES pedidos_inter_cedi(id) ON DELETE CASCADE,
    linea_numero INTEGER NOT NULL,

    -- Origin CEDI (who supplies)
    cedi_origen_id VARCHAR(50) NOT NULL,  -- cedi_seco, cedi_frio, cedi_verde
    cedi_origen_nombre VARCHAR(100),

    -- Product identification
    codigo_producto VARCHAR(50) NOT NULL,
    codigo_barras VARCHAR(50),
    descripcion_producto VARCHAR(200),

    -- Classification
    categoria VARCHAR(100),
    grupo VARCHAR(100),
    marca VARCHAR(100),
    presentacion VARCHAR(100),
    clasificacion_abc VARCHAR(5),  -- A, B, C, D

    -- Physical product quantities
    unidades_por_bulto DECIMAL(12,4) DEFAULT 1,
    peso_unitario_kg DECIMAL(12,4),

    -- Aggregated regional demand (sum from all stores in region)
    demanda_regional_p75 DECIMAL(12,4) DEFAULT 0,
    demanda_regional_promedio DECIMAL(12,4) DEFAULT 0,
    num_tiendas_region INTEGER DEFAULT 0,

    -- Stock in destination CEDI
    stock_actual_cedi DECIMAL(12,4) DEFAULT 0,
    stock_en_transito DECIMAL(12,4) DEFAULT 0,

    -- Calculated inventory parameters for CEDI
    stock_minimo_cedi DECIMAL(12,4) DEFAULT 0,
    stock_seguridad_cedi DECIMAL(12,4) DEFAULT 0,
    stock_maximo_cedi DECIMAL(12,4) DEFAULT 0,
    punto_reorden_cedi DECIMAL(12,4) DEFAULT 0,

    -- Availability in origin CEDI
    stock_cedi_origen DECIMAL(12,4) DEFAULT 0,

    -- Suggested quantities (calculated by system)
    cantidad_sugerida_unidades DECIMAL(12,4) DEFAULT 0,
    cantidad_sugerida_bultos DECIMAL(12,4) DEFAULT 0,

    -- Ordered quantities (adjusted by user)
    cantidad_pedida_unidades DECIMAL(12,4) DEFAULT 0,
    cantidad_pedida_bultos DECIMAL(12,4) DEFAULT 0,
    total_unidades DECIMAL(12,4) DEFAULT 0,

    -- Control
    razon_pedido VARCHAR(500),
    dias_cobertura_objetivo INTEGER,
    incluido BOOLEAN DEFAULT true,
    observaciones TEXT,

    -- Actual quantities (reception)
    cantidad_recibida_bultos DECIMAL(12,4),
    cantidad_recibida_unidades DECIMAL(12,4),

    -- Audit
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_intercedi_detalle_pedido ON pedidos_inter_cedi_detalle(pedido_id);
CREATE INDEX IF NOT EXISTS idx_intercedi_detalle_producto ON pedidos_inter_cedi_detalle(codigo_producto);
CREATE INDEX IF NOT EXISTS idx_intercedi_detalle_cedi_origen ON pedidos_inter_cedi_detalle(cedi_origen_id);
CREATE INDEX IF NOT EXISTS idx_intercedi_detalle_pedido_linea ON pedidos_inter_cedi_detalle(pedido_id, linea_numero);
CREATE INDEX IF NOT EXISTS idx_intercedi_detalle_abc ON pedidos_inter_cedi_detalle(clasificacion_abc);

COMMENT ON TABLE pedidos_inter_cedi_detalle IS 'Products detail for Inter-CEDI orders, grouped by origin CEDI';

-- =========================================================================
-- 3. CONFIGURATION TABLE: config_rutas_inter_cedi
-- =========================================================================

CREATE TABLE IF NOT EXISTS config_rutas_inter_cedi (
    id SERIAL PRIMARY KEY,

    -- Route
    cedi_origen_id VARCHAR(50) NOT NULL,
    cedi_origen_nombre VARCHAR(100),
    cedi_destino_id VARCHAR(50) NOT NULL,
    cedi_destino_nombre VARCHAR(100),

    -- Transport parameters
    lead_time_dias DECIMAL(4,2) DEFAULT 2.0,
    frecuencia_viajes_dias VARCHAR(100) DEFAULT 'Mar,Jue,Sab',
    capacidad_camion_kg DECIMAL(12,2),
    capacidad_camion_m3 DECIMAL(12,2),

    -- Costs (optional)
    costo_flete_estimado DECIMAL(12,2),

    -- Control
    activo BOOLEAN DEFAULT true,
    observaciones TEXT,

    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(cedi_origen_id, cedi_destino_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rutas_intercedi_origen ON config_rutas_inter_cedi(cedi_origen_id);
CREATE INDEX IF NOT EXISTS idx_rutas_intercedi_destino ON config_rutas_inter_cedi(cedi_destino_id);
CREATE INDEX IF NOT EXISTS idx_rutas_intercedi_activo ON config_rutas_inter_cedi(activo) WHERE activo = true;

COMMENT ON TABLE config_rutas_inter_cedi IS 'Transport routes configuration between CEDIs (frequency, lead time)';

-- =========================================================================
-- 4. HISTORY TABLE: pedidos_inter_cedi_historial
-- =========================================================================

CREATE TABLE IF NOT EXISTS pedidos_inter_cedi_historial (
    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    pedido_id VARCHAR(50) NOT NULL REFERENCES pedidos_inter_cedi(id) ON DELETE CASCADE,
    estado_anterior VARCHAR(50),
    estado_nuevo VARCHAR(50) NOT NULL,
    motivo_cambio TEXT,
    usuario VARCHAR(100) DEFAULT 'sistema',
    fecha_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_intercedi_historial_pedido ON pedidos_inter_cedi_historial(pedido_id);
CREATE INDEX IF NOT EXISTS idx_intercedi_historial_fecha ON pedidos_inter_cedi_historial(fecha_cambio DESC);

COMMENT ON TABLE pedidos_inter_cedi_historial IS 'State change history for Inter-CEDI orders';

-- =========================================================================
-- 5. SEQUENCE FOR ORDER NUMBERS
-- =========================================================================

CREATE SEQUENCE IF NOT EXISTS seq_pedido_inter_cedi_numero START WITH 1;

-- =========================================================================
-- 6. FUNCTION: Generate order number
-- =========================================================================

CREATE OR REPLACE FUNCTION generate_numero_pedido_inter_cedi()
RETURNS VARCHAR AS $$
DECLARE
    v_numero INTEGER;
    v_numero_pedido VARCHAR;
BEGIN
    SELECT nextval('seq_pedido_inter_cedi_numero') INTO v_numero;
    v_numero_pedido := 'IC-' || LPAD(v_numero::TEXT, 5, '0');
    RETURN v_numero_pedido;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_numero_pedido_inter_cedi() IS 'Generates sequential order number for Inter-CEDI orders (IC-00001)';

-- =========================================================================
-- 7. TRIGGER: Auto-populate cedi_destino_nombre
-- =========================================================================

CREATE OR REPLACE FUNCTION trg_pedido_inter_cedi_before_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate order number if not provided
    IF NEW.numero_pedido IS NULL OR NEW.numero_pedido = '' THEN
        NEW.numero_pedido := generate_numero_pedido_inter_cedi();
    END IF;

    -- Populate destination CEDI name from ubicaciones
    IF NEW.cedi_destino_nombre IS NULL THEN
        SELECT nombre, region INTO NEW.cedi_destino_nombre, NEW.cedi_destino_region
        FROM ubicaciones
        WHERE id = NEW.cedi_destino_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedido_inter_cedi_insert ON pedidos_inter_cedi;
CREATE TRIGGER trg_pedido_inter_cedi_insert
    BEFORE INSERT ON pedidos_inter_cedi
    FOR EACH ROW
    EXECUTE FUNCTION trg_pedido_inter_cedi_before_insert();

-- =========================================================================
-- 8. TRIGGER: Record state changes in history
-- =========================================================================

CREATE OR REPLACE FUNCTION trg_pedido_inter_cedi_estado_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
        INSERT INTO pedidos_inter_cedi_historial (
            pedido_id, estado_anterior, estado_nuevo, usuario, fecha_cambio
        ) VALUES (
            NEW.id, OLD.estado, NEW.estado, NEW.usuario_creador, CURRENT_TIMESTAMP
        );
    END IF;

    -- Update modification timestamp
    NEW.fecha_modificacion := CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedido_inter_cedi_update ON pedidos_inter_cedi;
CREATE TRIGGER trg_pedido_inter_cedi_update
    BEFORE UPDATE ON pedidos_inter_cedi
    FOR EACH ROW
    EXECUTE FUNCTION trg_pedido_inter_cedi_estado_change();

-- =========================================================================
-- 9. INITIAL DATA: Routes Valencia -> Caracas
-- =========================================================================

INSERT INTO config_rutas_inter_cedi (
    cedi_origen_id, cedi_origen_nombre,
    cedi_destino_id, cedi_destino_nombre,
    lead_time_dias, frecuencia_viajes_dias, activo
) VALUES
    ('cedi_seco', 'CEDI Seco', 'cedi_caracas', 'CEDI Caracas', 2.0, 'Mar,Jue,Sab', true),
    ('cedi_frio', 'CEDI Frio', 'cedi_caracas', 'CEDI Caracas', 2.0, 'Mar,Jue,Sab', true),
    ('cedi_verde', 'CEDI Verde', 'cedi_caracas', 'CEDI Caracas', 2.0, 'Mar,Jue,Sab', true)
ON CONFLICT (cedi_origen_id, cedi_destino_id) DO UPDATE SET
    lead_time_dias = EXCLUDED.lead_time_dias,
    frecuencia_viajes_dias = EXCLUDED.frecuencia_viajes_dias,
    fecha_modificacion = CURRENT_TIMESTAMP;

-- =========================================================================
-- 10. VIEW: v_pedidos_inter_cedi_resumen
-- =========================================================================

CREATE OR REPLACE VIEW v_pedidos_inter_cedi_resumen AS
SELECT
    p.id,
    p.numero_pedido,
    p.fecha_pedido,
    p.fecha_creacion,
    p.cedi_destino_id,
    p.cedi_destino_nombre,
    p.cedi_destino_region,
    p.estado,
    p.prioridad,
    p.total_cedis_origen,
    p.total_productos,
    p.total_bultos,
    p.total_unidades,
    p.usuario_creador,
    p.dias_cobertura_a,
    p.dias_cobertura_b,
    p.dias_cobertura_c,
    p.dias_cobertura_d,
    EXTRACT(DAY FROM (CURRENT_TIMESTAMP - p.fecha_creacion))::INTEGER as dias_desde_creacion,
    -- Counts by origin CEDI
    (SELECT COUNT(DISTINCT d.cedi_origen_id) FROM pedidos_inter_cedi_detalle d WHERE d.pedido_id = p.id) as num_cedis_origen,
    (SELECT COUNT(*) FROM pedidos_inter_cedi_detalle d WHERE d.pedido_id = p.id AND d.cedi_origen_id = 'cedi_seco') as productos_cedi_seco,
    (SELECT COUNT(*) FROM pedidos_inter_cedi_detalle d WHERE d.pedido_id = p.id AND d.cedi_origen_id = 'cedi_frio') as productos_cedi_frio,
    (SELECT COUNT(*) FROM pedidos_inter_cedi_detalle d WHERE d.pedido_id = p.id AND d.cedi_origen_id = 'cedi_verde') as productos_cedi_verde
FROM pedidos_inter_cedi p
ORDER BY p.fecha_creacion DESC;

COMMENT ON VIEW v_pedidos_inter_cedi_resumen IS 'Summary view of Inter-CEDI orders with CEDI breakdown';

-- =========================================================================
-- 11. Record this migration
-- =========================================================================

INSERT INTO schema_migrations (version, name)
VALUES ('017', 'pedidos_inter_cedi')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =========================================================================
-- End of Migration 017 UP
-- =========================================================================
