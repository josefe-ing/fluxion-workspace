-- Rollback: Remover configuración de pesos DPD+U

-- Remover columnas de config_inventario_global
ALTER TABLE config_inventario_global
DROP COLUMN IF EXISTS dpdu_peso_demanda,
DROP COLUMN IF EXISTS dpdu_peso_urgencia,
DROP COLUMN IF EXISTS dpdu_dias_minimo_urgencia;

-- Remover tabla de log
DROP TABLE IF EXISTS distribucion_dpdu_log;

-- Remover columnas de pedidos_sugeridos
ALTER TABLE pedidos_sugeridos
DROP COLUMN IF EXISTS grupo_pedido_id,
DROP COLUMN IF EXISTS orden_en_grupo;
