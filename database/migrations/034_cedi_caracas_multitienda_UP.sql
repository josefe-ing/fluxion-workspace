-- Migración: CEDI Caracas como destino en Multi-Tienda
-- Agrega configuración ABC para cedi_caracas en la misma tabla que las tiendas

INSERT INTO config_parametros_abc_tienda (
    tienda_id,
    lead_time_override,
    dias_cobertura_a,
    dias_cobertura_b,
    clase_c_dias_cobertura,
    clase_d_dias_cobertura,
    activo
) VALUES (
    'cedi_caracas',
    2.0,    -- Lead time Valencia → Caracas: 2 días
    10,     -- Cobertura clase A: 10 días
    10,     -- Cobertura clase B: 10 días
    10,     -- Cobertura clase C: 10 días
    10,     -- Cobertura clase D: 10 días
    true
) ON CONFLICT (tienda_id) DO NOTHING;
