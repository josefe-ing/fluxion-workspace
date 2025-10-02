-- =====================================================================================
-- DATOS INICIALES PARA FLUXION AI - LA GRANJA MERCADO
-- =====================================================================================

-- =====================================================================================
-- INSERTAR TIENDAS REALES
-- =====================================================================================

INSERT INTO ubicaciones (id, codigo, nombre, tipo, region, ciudad, superficie_m2, activo) VALUES
-- Región Norte
('tienda_01', 'T01', 'El Bosque', 'tienda', 'Norte', 'Valencia', 250.0, true),
('tienda_02', 'T02', 'San Diego', 'tienda', 'Norte', 'San Diego', 180.0, true),
('tienda_03', 'T03', 'Aranzazu', 'tienda', 'Norte', 'Valencia', 220.0, true),
('tienda_04', 'T04', 'Aranzazu Mayorista', 'tienda', 'Norte', 'Valencia', 400.0, true),
('tienda_05', 'T05', 'Av. Bolivar Norte', 'tienda', 'Norte', 'Valencia', 190.0, true),
('tienda_06', 'T06', 'Naguanagua', 'tienda', 'Norte', 'Naguanagua', 210.0, true),

-- Región Centro
('tienda_07', 'T07', 'Vivienda Barbula', 'tienda', 'Centro', 'Naguanagua', 160.0, true),
('tienda_08', 'T08', 'Av. Las Ferias', 'tienda', 'Centro', 'Valencia', 280.0, true),
('tienda_09', 'T09', 'Mañongo', 'tienda', 'Centro', 'Naguanagua', 200.0, true),
('tienda_10', 'T10', 'La Isabelica', 'tienda', 'Centro', 'Valencia', 170.0, true),
('tienda_11', 'T11', 'Los Guayos', 'tienda', 'Centro', 'Los Guayos', 150.0, true),
('tienda_12', 'T12', 'Centro Valencia', 'tienda', 'Centro', 'Valencia', 320.0, true),

-- Región Sur
('tienda_13', 'T13', 'Flor Amarillo', 'tienda', 'Sur', 'Valencia', 140.0, true),
('tienda_14', 'T14', 'Paramacay', 'tienda', 'Sur', 'Naguanagua', 180.0, true),
('tienda_15', 'T15', 'Tocuyito', 'tienda', 'Sur', 'Tocuyito', 130.0, true),
('tienda_16', 'T16', 'Guigue', 'tienda', 'Sur', 'Guigue', 120.0, true),
('tienda_17', 'T17', 'Ciudad Alianza', 'tienda', 'Sur', 'Guacara', 200.0, true);

-- =====================================================================================
-- INSERTAR CEDIS (CENTROS DE DISTRIBUCIÓN)
-- =====================================================================================

INSERT INTO ubicaciones (id, codigo, nombre, tipo, region, ciudad, superficie_m2, capacidad_actual, capacidad_maxima, activo) VALUES
('cedi_01', 'C01', 'CEDI Inventario Mayor', 'cedi', 'Centro', 'Valencia', 2500.0, 82.5, 100.0, true),
('cedi_02', 'C02', 'CEDI Norte', 'cedi', 'Norte', 'Naguanagua', 1800.0, 75.2, 100.0, true),
('cedi_03', 'C03', 'CEDI Sur', 'cedi', 'Sur', 'San Diego', 1200.0, 68.9, 100.0, true);

-- =====================================================================================
-- PRODUCTOS DE EJEMPLO (CATEGORÍAS PRINCIPALES)
-- =====================================================================================

-- Productos de Alimentos Básicos
INSERT INTO productos (id, codigo, codigo_barras, descripcion, categoria, grupo, marca, presentacion, costo_promedio, precio_venta, stock_minimo, stock_maximo, activo) VALUES
('prod_001', 'HAR001', '7591234567890', 'Harina de Maíz Precocida', 'Alimentos', 'Harinas', 'PAN', '1kg', 2.50, 3.20, 50, 500, true),
('prod_002', 'ARR001', '7591234567891', 'Arroz Blanco Grano Largo', 'Alimentos', 'Cereales', 'Primor', '1kg', 3.80, 4.50, 30, 300, true),
('prod_003', 'ACE001', '7591234567892', 'Aceite de Girasol', 'Alimentos', 'Aceites', 'Mazeite', '1L', 4.20, 5.10, 25, 200, true),
('prod_004', 'AZU001', '7591234567893', 'Azúcar Blanca Refinada', 'Alimentos', 'Endulzantes', 'Central Río Turbio', '1kg', 1.80, 2.30, 40, 400, true),
('prod_005', 'SAL001', '7591234567894', 'Sal Refinada', 'Alimentos', 'Condimentos', 'Diana', '1kg', 0.80, 1.10, 60, 500, true),

-- Productos de Limpieza
('prod_006', 'DET001', '7591234567895', 'Detergente en Polvo', 'Limpieza', 'Detergentes', 'Ariel', '1kg', 5.50, 7.20, 20, 150, true),
('prod_007', 'JAB001', '7591234567896', 'Jabón de Baño', 'Limpieza', 'Aseo Personal', 'Protex', '110g', 1.20, 1.80, 100, 800, true),
('prod_008', 'DES001', '7591234567897', 'Desinfectante Multiusos', 'Limpieza', 'Desinfectantes', 'Fabuloso', '1L', 3.40, 4.60, 30, 200, true),

-- Bebidas
('prod_009', 'REF001', '7591234567898', 'Refresco Cola', 'Bebidas', 'Gaseosas', 'Pepsi', '2L', 2.20, 3.50, 50, 400, true),
('prod_010', 'AGU001', '7591234567899', 'Agua Mineral', 'Bebidas', 'Aguas', 'Minalba', '1.5L', 1.10, 1.70, 80, 600, true),

-- Cuidado Personal
('prod_011', 'PAP001', '7591234567900', 'Papel Higiénico', 'Cuidado Personal', 'Papel', 'Elite', '4 rollos', 3.80, 5.20, 40, 300, true),
('prod_012', 'SHA001', '7591234567901', 'Shampoo', 'Cuidado Personal', 'Cabello', 'Pantene', '400ml', 6.20, 8.50, 25, 150, true),

-- Lácteos y Refrigerados
('prod_013', 'LEC001', '7591234567902', 'Leche Entera UHT', 'Lácteos', 'Leches', 'Parmalat', '1L', 2.80, 3.80, 30, 200, true),
('prod_014', 'QUE001', '7591234567903', 'Queso Blanco Fresco', 'Lácteos', 'Quesos', 'Los Andes', '500g', 4.50, 6.20, 20, 100, true),

-- Carnes y Embutidos
('prod_015', 'JAM001', '7591234567904', 'Jamón de Pierna', 'Carnes', 'Embutidos', 'Plumrose', '200g', 3.20, 4.80, 15, 80, true);

-- =====================================================================================
-- DATOS DE STOCK INICIAL PARA ALGUNAS UBICACIONES
-- =====================================================================================

-- Stock inicial para Tienda El Bosque
INSERT INTO stock_actual (ubicacion_id, producto_id, cantidad, valor_inventario, costo_promedio, stock_minimo, stock_maximo, ultima_actualizacion) VALUES
('tienda_01', 'prod_001', 150, 375.00, 2.50, 50, 500, CURRENT_TIMESTAMP),
('tienda_01', 'prod_002', 80, 304.00, 3.80, 30, 300, CURRENT_TIMESTAMP),
('tienda_01', 'prod_003', 45, 189.00, 4.20, 25, 200, CURRENT_TIMESTAMP),
('tienda_01', 'prod_004', 120, 216.00, 1.80, 40, 400, CURRENT_TIMESTAMP),
('tienda_01', 'prod_005', 200, 160.00, 0.80, 60, 500, CURRENT_TIMESTAMP),
('tienda_01', 'prod_006', 35, 192.50, 5.50, 20, 150, CURRENT_TIMESTAMP),
('tienda_01', 'prod_007', 250, 300.00, 1.20, 100, 800, CURRENT_TIMESTAMP),
('tienda_01', 'prod_008', 40, 136.00, 3.40, 30, 200, CURRENT_TIMESTAMP),
('tienda_01', 'prod_009', 120, 264.00, 2.20, 50, 400, CURRENT_TIMESTAMP),
('tienda_01', 'prod_010', 180, 198.00, 1.10, 80, 600, CURRENT_TIMESTAMP);

-- Stock inicial para CEDI Inventario Mayor
INSERT INTO stock_actual (ubicacion_id, producto_id, cantidad, valor_inventario, costo_promedio, stock_minimo, stock_maximo, ultima_actualizacion) VALUES
('cedi_01', 'prod_001', 2500, 6250.00, 2.50, 500, 5000, CURRENT_TIMESTAMP),
('cedi_01', 'prod_002', 1200, 4560.00, 3.80, 300, 3000, CURRENT_TIMESTAMP),
('cedi_01', 'prod_003', 800, 3360.00, 4.20, 200, 2000, CURRENT_TIMESTAMP),
('cedi_01', 'prod_004', 2000, 3600.00, 1.80, 400, 4000, CURRENT_TIMESTAMP),
('cedi_01', 'prod_005', 3000, 2400.00, 0.80, 500, 5000, CURRENT_TIMESTAMP),
('cedi_01', 'prod_006', 500, 2750.00, 5.50, 150, 1500, CURRENT_TIMESTAMP),
('cedi_01', 'prod_007', 2000, 2400.00, 1.20, 800, 8000, CURRENT_TIMESTAMP),
('cedi_01', 'prod_008', 600, 2040.00, 3.40, 200, 2000, CURRENT_TIMESTAMP),
('cedi_01', 'prod_009', 1000, 2200.00, 2.20, 400, 4000, CURRENT_TIMESTAMP),
('cedi_01', 'prod_010', 1500, 1650.00, 1.10, 600, 6000, CURRENT_TIMESTAMP);

-- =====================================================================================
-- CREAR ALGUNOS MOVIMIENTOS DE INVENTARIO DE EJEMPLO
-- =====================================================================================

-- Entrada de mercancía a CEDI
INSERT INTO movimientos_inventario (id, fecha_hora, fecha, ubicacion_id, producto_id, tipo_movimiento, origen, cantidad, stock_anterior, stock_nuevo, costo_unitario, valor_total, usuario) VALUES
('mov_001', CURRENT_TIMESTAMP, CURRENT_DATE, 'cedi_01', 'prod_001', 'entrada', 'Proveedor PAN', 500, 2000, 2500, 2.50, 1250.00, 'sistema_etl'),
('mov_002', CURRENT_TIMESTAMP, CURRENT_DATE, 'cedi_01', 'prod_002', 'entrada', 'Proveedor Primor', 200, 1000, 1200, 3.80, 760.00, 'sistema_etl'),
('mov_003', CURRENT_TIMESTAMP, CURRENT_DATE, 'cedi_01', 'prod_003', 'entrada', 'Proveedor Mazeite', 300, 500, 800, 4.20, 1260.00, 'sistema_etl');

-- Transferencia de CEDI a tienda
INSERT INTO movimientos_inventario (id, fecha_hora, fecha, ubicacion_id, producto_id, tipo_movimiento, origen, destino, referencia, cantidad, stock_anterior, stock_nuevo, costo_unitario, valor_total, usuario) VALUES
('mov_004', CURRENT_TIMESTAMP, CURRENT_DATE, 'cedi_01', 'prod_001', 'salida', 'CEDI Inventario Mayor', 'El Bosque', 'TRANS_001', -100, 2500, 2400, 2.50, 250.00, 'sistema_etl'),
('mov_005', CURRENT_TIMESTAMP, CURRENT_DATE, 'tienda_01', 'prod_001', 'entrada', 'CEDI Inventario Mayor', 'El Bosque', 'TRANS_001', 100, 50, 150, 2.50, 250.00, 'sistema_etl');

-- =====================================================================================
-- VERIFICAR DATOS INSERTADOS
-- =====================================================================================

-- Contar registros insertados
SELECT 'Ubicaciones' as tabla, COUNT(*) as registros FROM ubicaciones
UNION ALL
SELECT 'Productos' as tabla, COUNT(*) as registros FROM productos
UNION ALL
SELECT 'Stock Actual' as tabla, COUNT(*) as registros FROM stock_actual
UNION ALL
SELECT 'Movimientos' as tabla, COUNT(*) as registros FROM movimientos_inventario;