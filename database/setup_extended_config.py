#!/usr/bin/env python3
"""
Script para agregar configuración extendida al esquema base
Agrega las tablas de configuración granular por producto-ubicación
"""

import duckdb
from pathlib import Path
import random

def setup_extended_config():
    """Agrega configuración extendida a la base de datos existente"""

    base_dir = Path(__file__).parent
    db_path = base_dir.parent / "data" / "fluxion_production.db"
    schema_extended_path = base_dir / "schema_extended.sql"

    if not db_path.exists():
        print("❌ Base de datos no existe. Ejecuta init_db.py primero.")
        return False

    try:
        conn = duckdb.connect(str(db_path))
        print("🔧 Agregando configuración extendida...")

        # 1. Crear tabla de configuración de categorías
        print("📋 Creando configuración de categorías...")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS categorias_config (
                id VARCHAR PRIMARY KEY,
                categoria VARCHAR(50) NOT NULL,
                subcategoria VARCHAR(50),

                -- Configuración de inventario por categoría
                rotacion_objetivo INTEGER,
                dias_cobertura_min INTEGER DEFAULT 7,
                dias_cobertura_max INTEGER DEFAULT 30,
                factor_seguridad DECIMAL(4,2) DEFAULT 1.2,

                -- Configuración de alertas
                alerta_stock_bajo_porcentaje DECIMAL(5,2) DEFAULT 20.0,
                alerta_vencimiento_dias INTEGER DEFAULT 30,
                alerta_sin_movimiento_dias INTEGER DEFAULT 60,

                -- Configuración de reposición
                frecuencia_revision_dias INTEGER DEFAULT 7,
                lote_minimo_pedido INTEGER DEFAULT 1,
                multiple_pedido INTEGER DEFAULT 1,

                -- Configuración de precios
                margen_minimo DECIMAL(5,2),
                margen_objetivo DECIMAL(5,2),
                margen_maximo DECIMAL(5,2),

                activo BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                UNIQUE(categoria, subcategoria)
            )
        """)

        # 2. Crear tabla de configuración producto-ubicación
        print("🎯 Creando configuración producto-ubicación...")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS producto_ubicacion_config (
                id VARCHAR PRIMARY KEY,
                ubicacion_id VARCHAR NOT NULL,
                producto_id VARCHAR NOT NULL,

                -- Stock mínimo y máximo específicos
                stock_minimo DECIMAL(12,4) NOT NULL,
                stock_maximo DECIMAL(12,4) NOT NULL,
                punto_reorden DECIMAL(12,4),

                -- Configuración de demanda específica
                demanda_diaria_promedio DECIMAL(12,4),
                demanda_diaria_maxima DECIMAL(12,4),
                variabilidad_demanda DECIMAL(5,2),

                -- Tiempos específicos
                lead_time_dias INTEGER DEFAULT 7,
                dias_cobertura_objetivo INTEGER,
                dias_seguridad INTEGER DEFAULT 3,

                -- Configuración de pedidos
                lote_minimo_compra DECIMAL(12,4) DEFAULT 1,
                lote_multiple DECIMAL(12,4) DEFAULT 1,
                cantidad_maxima_pedido DECIMAL(12,4),

                -- Precios para esta ubicación
                precio_venta DECIMAL(12,4),
                margen_actual DECIMAL(5,2),
                precio_promocional DECIMAL(12,4),
                fecha_precio_promo_inicio DATE,
                fecha_precio_promo_fin DATE,

                -- Configuración de alertas específicas
                generar_alerta_stock_bajo BOOLEAN DEFAULT true,
                generar_alerta_vencimiento BOOLEAN DEFAULT true,
                generar_alerta_sobrestock BOOLEAN DEFAULT true,

                -- Restricciones específicas
                permitir_venta BOOLEAN DEFAULT true,
                permitir_transferencia BOOLEAN DEFAULT true,
                es_producto_estrella BOOLEAN DEFAULT false,

                -- Ubicación física
                ubicacion_fisica VARCHAR(100),
                orden_exhibicion INTEGER,
                espacio_exhibicion_m2 DECIMAL(6,2),

                activo BOOLEAN DEFAULT true,
                fecha_ultima_revision DATE,
                usuario_ultima_modificacion VARCHAR(100),
                observaciones TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
                FOREIGN KEY (producto_id) REFERENCES productos(id),
                UNIQUE(ubicacion_id, producto_id),

                CHECK (stock_minimo >= 0),
                CHECK (stock_maximo > stock_minimo),
                CHECK (lead_time_dias > 0),
                CHECK (dias_seguridad >= 0)
            )
        """)

        # 3. Insertar configuraciones de categorías
        print("📦 Insertando configuraciones de categorías...")
        categorias_configs = [
            ('cat_alimentos', 'Alimentos', None, 12, 7, 21, 1.3, 15.0, 30, 45, 7, 1, 1, 15.0, 25.0, 35.0),
            ('cat_bebidas', 'Bebidas', None, 15, 5, 15, 1.2, 20.0, 45, 60, 7, 6, 6, 20.0, 30.0, 40.0),
            ('cat_limpieza', 'Limpieza', None, 8, 14, 45, 1.5, 25.0, 60, 90, 14, 1, 1, 25.0, 40.0, 55.0),
            ('cat_cuidado', 'Cuidado Personal', None, 10, 10, 30, 1.4, 20.0, 90, 120, 14, 1, 1, 30.0, 45.0, 60.0),
            ('cat_lacteos', 'Lácteos', None, 20, 3, 7, 1.1, 10.0, 7, 21, 3, 1, 1, 20.0, 35.0, 50.0),
            ('cat_carnes', 'Carnes', None, 25, 2, 5, 1.1, 5.0, 3, 14, 2, 1, 1, 25.0, 40.0, 55.0),
        ]

        for config in categorias_configs:
            # Usar INSERT simple, sin REPLACE
            try:
                conn.execute("""
                    INSERT INTO categorias_config
                    (id, categoria, subcategoria, rotacion_objetivo, dias_cobertura_min,
                     dias_cobertura_max, factor_seguridad, alerta_stock_bajo_porcentaje,
                     alerta_vencimiento_dias, alerta_sin_movimiento_dias, frecuencia_revision_dias,
                     lote_minimo_pedido, multiple_pedido, margen_minimo, margen_objetivo, margen_maximo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, config)
            except Exception as e:
                if "UNIQUE constraint" in str(e):
                    print(f"     ⚠️  Categoría {config[1]} ya existe, saltando...")
                else:
                    print(f"     ❌ Error insertando {config[1]}: {e}")

        # 4. Generar configuraciones producto-ubicación para todos los pares
        print("🔗 Generando configuraciones producto-ubicación...")

        # Obtener todos los productos y ubicaciones
        productos = conn.execute("SELECT id, categoria, descripcion FROM productos WHERE activo = true").fetchall()
        ubicaciones = conn.execute("SELECT id, tipo, nombre FROM ubicaciones WHERE activo = true").fetchall()

        configs_generadas = 0
        for producto in productos:
            producto_id, categoria, descripcion = producto

            for ubicacion in ubicaciones:
                ubicacion_id, tipo_ubicacion, nombre_ubicacion = ubicacion

                # Configuración base según tipo de ubicación
                if tipo_ubicacion == 'cedi':
                    # CEDIs tienen stocks más altos
                    base_min = random.randint(500, 2000)
                    base_max = base_min * random.uniform(3, 8)
                    demanda_base = random.uniform(50, 200)
                else:
                    # Tiendas tienen stocks más bajos
                    base_min = random.randint(10, 100)
                    base_max = base_min * random.uniform(2, 5)
                    demanda_base = random.uniform(5, 50)

                # Ajustar según categoría
                if categoria == 'Alimentos':
                    factor_categoria = 1.5  # Más rotación
                    lead_time = 5
                elif categoria == 'Lácteos':
                    factor_categoria = 2.0  # Alta rotación
                    lead_time = 2
                elif categoria == 'Limpieza':
                    factor_categoria = 0.7  # Menos rotación
                    lead_time = 10
                else:
                    factor_categoria = 1.0
                    lead_time = 7

                stock_min = int(base_min * factor_categoria)
                stock_max = int(base_max * factor_categoria)
                punto_reorden = int(stock_min * 1.5)
                demanda_promedio = demanda_base * factor_categoria

                # Precio de venta con margen
                if producto_id in ['prod_001', 'prod_002', 'prod_003']:  # Productos básicos
                    precio_base = random.uniform(3.0, 6.0)
                    margen = random.uniform(15.0, 25.0)
                elif producto_id in ['prod_006', 'prod_012']:  # Productos de marca
                    precio_base = random.uniform(6.0, 12.0)
                    margen = random.uniform(30.0, 45.0)
                else:
                    precio_base = random.uniform(2.0, 8.0)
                    margen = random.uniform(20.0, 35.0)

                # Productos estrella (aleatorio, 20% de probabilidad)
                es_estrella = random.random() < 0.2

                config_id = f"config_{producto_id}_{ubicacion_id}"

                try:
                    conn.execute("""
                        INSERT INTO producto_ubicacion_config
                    (id, ubicacion_id, producto_id, stock_minimo, stock_maximo, punto_reorden,
                     demanda_diaria_promedio, demanda_diaria_maxima, variabilidad_demanda,
                     lead_time_dias, dias_cobertura_objetivo, dias_seguridad,
                     lote_minimo_compra, lote_multiple, precio_venta, margen_actual,
                     generar_alerta_stock_bajo, generar_alerta_vencimiento, generar_alerta_sobrestock,
                     permitir_venta, permitir_transferencia, es_producto_estrella,
                     fecha_ultima_revision, usuario_ultima_modificacion)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    config_id, ubicacion_id, producto_id, stock_min, stock_max, punto_reorden,
                    round(demanda_promedio, 2), round(demanda_promedio * 1.5, 2), round(random.uniform(15, 35), 2),
                    lead_time, random.randint(7, 21), random.randint(1, 5),
                    1, 1, round(precio_base, 2), round(margen, 2),
                    True, categoria in ['Lácteos', 'Carnes'], True,
                    True, True, es_estrella,
                    '2025-09-23', 'sistema_auto'
                    ))
                    configs_generadas += 1
                except Exception as e:
                    if "UNIQUE constraint" in str(e):
                        print(f"     ⚠️  Config {config_id} ya existe, saltando...")
                    else:
                        print(f"     ❌ Error con config {config_id}: {e}")

        print(f"   ✓ {configs_generadas} configuraciones generadas")

        # 5. Crear vista de productos con configuración completa
        print("👁️ Creando vistas de configuración...")
        conn.execute("""
            CREATE OR REPLACE VIEW productos_ubicacion_completa AS
            SELECT
                p.id as producto_id,
                p.codigo,
                p.descripcion,
                p.categoria,
                p.marca,
                u.id as ubicacion_id,
                u.nombre as ubicacion_nombre,
                u.tipo as ubicacion_tipo,
                pc.stock_minimo,
                pc.stock_maximo,
                pc.punto_reorden,
                pc.precio_venta,
                pc.margen_actual,
                pc.demanda_diaria_promedio,
                pc.lead_time_dias,
                pc.es_producto_estrella,
                s.cantidad as stock_actual,
                CASE
                    WHEN s.cantidad IS NULL THEN 'SIN_STOCK'
                    WHEN s.cantidad <= pc.stock_minimo THEN 'CRITICO'
                    WHEN s.cantidad <= pc.punto_reorden THEN 'BAJO'
                    WHEN s.cantidad >= pc.stock_maximo THEN 'EXCESO'
                    ELSE 'NORMAL'
                END as estado_stock,
                CASE
                    WHEN s.cantidad IS NULL THEN 0
                    WHEN pc.demanda_diaria_promedio > 0 THEN ROUND(s.cantidad / pc.demanda_diaria_promedio, 1)
                    ELSE 999
                END as dias_cobertura_actual
            FROM productos p
            JOIN producto_ubicacion_config pc ON p.id = pc.producto_id
            JOIN ubicaciones u ON pc.ubicacion_id = u.id
            LEFT JOIN stock_actual s ON pc.ubicacion_id = s.ubicacion_id AND pc.producto_id = s.producto_id
            WHERE p.activo = true AND pc.activo = true
        """)

        # 6. Verificar configuración
        print("\n📊 Verificando configuración extendida...")

        # Contar configuraciones por categoría
        result = conn.execute("""
            SELECT categoria, COUNT(*) as configs
            FROM categorias_config
            GROUP BY categoria
        """).fetchall()

        print("   Configuraciones de categoría:")
        for row in result:
            categoria, count = row
            print(f"     {categoria}: {count} config")

        # Contar configuraciones producto-ubicación
        result = conn.execute("""
            SELECT
                COUNT(*) as total_configs,
                COUNT(CASE WHEN es_producto_estrella THEN 1 END) as productos_estrella,
                AVG(stock_minimo) as stock_min_promedio,
                AVG(precio_venta) as precio_promedio
            FROM producto_ubicacion_config
        """).fetchone()

        total, estrellas, stock_prom, precio_prom = result
        print(f"\n   Configuraciones producto-ubicación: {total:,}")
        print(f"   Productos estrella: {estrellas}")
        print(f"   Stock mínimo promedio: {stock_prom:.0f}")
        print(f"   Precio promedio: Bs {precio_prom:.2f}")

        # Mostrar algunos ejemplos
        print("\n🎯 Ejemplos de configuración por tipo de ubicación:")
        result = conn.execute("""
            SELECT
                u.tipo,
                AVG(pc.stock_minimo) as stock_min_avg,
                AVG(pc.stock_maximo) as stock_max_avg,
                AVG(pc.precio_venta) as precio_avg,
                COUNT(*) as total_configs
            FROM producto_ubicacion_config pc
            JOIN ubicaciones u ON pc.ubicacion_id = u.id
            GROUP BY u.tipo
        """).fetchall()

        for row in result:
            tipo, stock_min, stock_max, precio, count = row
            print(f"   {tipo.upper()}:")
            print(f"     Stock mín: {stock_min:.0f}, máx: {stock_max:.0f}")
            print(f"     Precio promedio: Bs {precio:.2f}")
            print(f"     Configuraciones: {count}")

        conn.close()

        print(f"\n🎉 ¡Configuración extendida completada exitosamente!")
        print(f"📊 {configs_generadas} configuraciones producto-ubicación generadas")

        return True

    except Exception as e:
        print(f"❌ Error configurando extensión: {str(e)}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("  FLUXION AI - CONFIGURACIÓN EXTENDIDA")
    print("=" * 60)

    success = setup_extended_config()

    if not success:
        print("\n❌ La configuración extendida falló. Revisa los errores arriba.")

    print("=" * 60)