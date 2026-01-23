BEGIN;

-- Agregar columna cuadrante_producto a ventas
ALTER TABLE ventas
ADD COLUMN IF NOT EXISTS cuadrante_producto VARCHAR(20);

-- Comentario descriptivo
COMMENT ON COLUMN ventas.cuadrante_producto IS
'Cuadrante del producto (CUADRANTE I-XII). Extraído de KLK campo Text2.';

-- Índice para análisis por cuadrante
CREATE INDEX IF NOT EXISTS idx_ventas_cuadrante
ON ventas(cuadrante_producto)
WHERE cuadrante_producto IS NOT NULL AND cuadrante_producto != '';

-- Registrar migración
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('029', 'add_cuadrante_to_ventas', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;

COMMIT;
