BEGIN;

-- Agregar columna cuadrante a productos
ALTER TABLE productos
ADD COLUMN IF NOT EXISTS cuadrante VARCHAR(20) DEFAULT 'NO ESPECIFICADO';

-- Comentario descriptivo
COMMENT ON COLUMN productos.cuadrante IS
'Clasificación por cuadrante del producto (CUADRANTE I-XII). Fuente: KLK Text2 extraído por ETL.';

-- Índice para filtrado eficiente
CREATE INDEX IF NOT EXISTS idx_productos_cuadrante
ON productos(cuadrante)
WHERE cuadrante IS NOT NULL AND cuadrante != 'NO ESPECIFICADO';

-- Índice compuesto para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_productos_categoria_cuadrante
ON productos(categoria, cuadrante);

-- Registrar migración
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('028', 'add_cuadrante_to_productos', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;

COMMIT;
