#!/usr/bin/env python3
"""
Servicio de Configuración de Inventario

Maneja la resolución jerárquica de configuración de parámetros de inventario:
1. Producto Individual (solo Frío/Verde)
2. Tienda + Categoría
3. Global (fallback)
"""

from typing import Dict, Optional
import duckdb
import logging

logger = logging.getLogger(__name__)


class ConfigInventarioService:
    """
    Servicio centralizado para obtener configuración de inventario
    con resolución jerárquica
    """

    @staticmethod
    def obtener_categoria_producto(
        codigo_producto: str,
        conn: duckdb.DuckDBPyConnection
    ) -> str:
        """
        Obtiene la categoría del producto: seco/frio/verde

        Args:
            codigo_producto: Código del producto
            conn: Conexión a DuckDB

        Returns:
            'seco', 'frio', o 'verde'
        """
        try:
            result = conn.execute("""
                SELECT categoria_producto
                FROM productos_categoria
                WHERE codigo_producto = ?
            """, [codigo_producto]).fetchone()

            if result:
                return result[0]

            # Fallback: inferir por categoría del producto
            result = conn.execute("""
                SELECT
                    CASE
                        WHEN categoria IN ('Carnes', 'Lácteos', 'Charcutería', 'Charcuteria',
                                          'Congelados', 'Refrigerados', 'Refrigerado',
                                          'Lacteos', 'Embutidos', 'Pollo', 'Res', 'Cerdo')
                            THEN 'frio'
                        WHEN categoria IN ('Fruver', 'Frutas', 'Verduras', 'Hortalizas', 'Víveres', 'Viveres')
                            THEN 'verde'
                        ELSE 'seco'
                    END as categoria
                FROM productos_ubicacion_completa
                WHERE codigo = ?
                LIMIT 1
            """, [codigo_producto]).fetchone()

            if result:
                categoria = result[0]
                # Guardar en caché para próximas consultas
                try:
                    conn.execute("""
                        INSERT INTO productos_categoria (codigo_producto, categoria_producto, subcategoria)
                        SELECT ?, ?, categoria
                        FROM productos_ubicacion_completa
                        WHERE codigo = ?
                        LIMIT 1
                    """, [codigo_producto, categoria, codigo_producto])
                    conn.commit()
                except:
                    pass  # Ya existe, ignorar

                return categoria

            # Si no se encuentra, asumir seco
            return 'seco'

        except Exception as e:
            logger.warning(f"Error obteniendo categoría para {codigo_producto}: {e}")
            return 'seco'

    @staticmethod
    def obtener_config_producto(
        codigo_producto: str,
        tienda_id: str,
        clasificacion_abc: str,
        conn: duckdb.DuckDBPyConnection
    ) -> Dict:
        """
        Resuelve configuración con jerarquía:
        1. Producto Individual (solo Frío/Verde)
        2. Tienda + Categoría
        3. Global (fallback)

        Args:
            codigo_producto: Código del producto
            tienda_id: ID de la tienda
            clasificacion_abc: Clasificación ABC del producto
            conn: Conexión a DuckDB

        Returns:
            Dict con configuración: {
                'categoria': str,
                'nivel_config': str,
                'stock_min_mult': float,
                'stock_seg_mult': float,
                'stock_max_mult': float,
                'lead_time_dias': int,
                'dias_vida_util': Optional[int],
                'umbral_merma_pct': Optional[float]
            }
        """
        try:
            # 1. Obtener categoría del producto
            categoria = ConfigInventarioService.obtener_categoria_producto(
                codigo_producto, conn
            )

            # 2. Si es Frío/Verde, buscar config específica de producto
            if categoria in ['frio', 'verde']:
                config = conn.execute("""
                    SELECT
                        stock_min_multiplicador,
                        stock_seg_multiplicador,
                        stock_max_multiplicador,
                        lead_time_dias,
                        dias_vida_util,
                        umbral_merma_pct
                    FROM config_inventario_producto
                    WHERE codigo_producto = ?
                      AND tienda_id = ?
                      AND activo = true
                """, [codigo_producto, tienda_id]).fetchone()

                if config:
                    logger.debug(f"✅ Config producto encontrada: {codigo_producto} @ {tienda_id}")
                    return {
                        'categoria': categoria,
                        'nivel_config': 'producto',
                        'stock_min_mult': float(config[0]),
                        'stock_seg_mult': float(config[1]),
                        'stock_max_mult': float(config[2]),
                        'lead_time_dias': int(config[3]),
                        'dias_vida_util': int(config[4]) if config[4] else None,
                        'umbral_merma_pct': float(config[5]) if config[5] else None
                    }

            # 3. Buscar config de Tienda + Categoría
            config = conn.execute("""
                SELECT
                    stock_min_multiplicador,
                    stock_seg_multiplicador,
                    stock_max_multiplicador,
                    lead_time_dias
                FROM config_inventario_tienda
                WHERE tienda_id = ?
                  AND categoria_producto = ?
                  AND clasificacion_abc = ?
                  AND activo = true
            """, [tienda_id, categoria, clasificacion_abc]).fetchone()

            if config:
                logger.debug(f"✅ Config tienda encontrada: {tienda_id} / {categoria} / {clasificacion_abc}")
                return {
                    'categoria': categoria,
                    'nivel_config': 'tienda',
                    'stock_min_mult': float(config[0]),
                    'stock_seg_mult': float(config[1]),
                    'stock_max_mult': float(config[2]),
                    'lead_time_dias': int(config[3]),
                    'dias_vida_util': None,
                    'umbral_merma_pct': None
                }

            # 4. Fallback a configuración global
            logger.debug(f"⚠️  Usando config global para: {codigo_producto} / {tienda_id}")
            return ConfigInventarioService.obtener_config_global(
                categoria, clasificacion_abc, conn
            )

        except Exception as e:
            logger.error(f"❌ Error obteniendo config para {codigo_producto}: {e}")
            # En caso de error, retornar configuración global conservadora
            return ConfigInventarioService.obtener_config_global('seco', 'B', conn)

    @staticmethod
    def obtener_config_global(
        categoria: str,
        clasificacion_abc: str,
        conn: duckdb.DuckDBPyConnection
    ) -> Dict:
        """
        Retorna configuración global por defecto

        Args:
            categoria: 'seco', 'frio', o 'verde'
            clasificacion_abc: 'A', 'AB', 'B', 'BC', o 'C'
            conn: Conexión a DuckDB

        Returns:
            Dict con configuración por defecto
        """
        # Valores por defecto según categoría y ABC
        defaults = {
            'seco': {
                'A': {'min': 2.0, 'seg': 1.0, 'max': 5.0, 'lead': 3},
                'AB': {'min': 2.0, 'seg': 2.5, 'max': 7.0, 'lead': 3},
                'B': {'min': 3.0, 'seg': 2.0, 'max': 12.0, 'lead': 3},
                'BC': {'min': 9.0, 'seg': 3.0, 'max': 17.0, 'lead': 3},
                'C': {'min': 15.0, 'seg': 7.0, 'max': 26.0, 'lead': 3},
            },
            'frio': {
                'A': {'min': 1.5, 'seg': 0.5, 'max': 3.0, 'lead': 1},
                'AB': {'min': 1.5, 'seg': 1.0, 'max': 4.0, 'lead': 1},
                'B': {'min': 2.0, 'seg': 1.5, 'max': 5.0, 'lead': 1},
                'BC': {'min': 3.0, 'seg': 2.0, 'max': 7.0, 'lead': 1},
                'C': {'min': 4.0, 'seg': 2.5, 'max': 9.0, 'lead': 1},
            },
            'verde': {
                'A': {'min': 1.0, 'seg': 0.3, 'max': 2.0, 'lead': 1},
                'AB': {'min': 1.0, 'seg': 0.5, 'max': 2.5, 'lead': 1},
                'B': {'min': 1.5, 'seg': 0.8, 'max': 3.0, 'lead': 1},
                'BC': {'min': 2.0, 'seg': 1.0, 'max': 4.0, 'lead': 1},
                'C': {'min': 2.5, 'seg': 1.2, 'max': 5.0, 'lead': 1},
            }
        }

        config = defaults.get(categoria, defaults['seco']).get(
            clasificacion_abc, defaults['seco']['B']
        )

        return {
            'categoria': categoria,
            'nivel_config': 'global',
            'stock_min_mult': config['min'],
            'stock_seg_mult': config['seg'],
            'stock_max_mult': config['max'],
            'lead_time_dias': config['lead'],
            'dias_vida_util': None,
            'umbral_merma_pct': None
        }

    @staticmethod
    def obtener_umbrales_abc(conn: duckdb.DuckDBPyConnection) -> Dict[str, float]:
        """
        Obtiene umbrales de clasificación ABC desde configuración global

        Args:
            conn: Conexión a DuckDB

        Returns:
            Dict con umbrales: {'umbral_a': 20.0, 'umbral_ab': 5.0, ...}
        """
        try:
            result = conn.execute("""
                SELECT parametro, valor_numerico
                FROM config_inventario_global
                WHERE categoria = 'abc_umbrales'
                  AND activo = true
            """).fetchall()

            if result:
                return {row[0]: float(row[1]) for row in result}

        except Exception as e:
            logger.warning(f"Error obteniendo umbrales ABC: {e}")

        # Valores por defecto
        return {
            'umbral_a': 20.0,
            'umbral_ab': 5.0,
            'umbral_b': 0.45,
            'umbral_bc': 0.2,
            'umbral_c': 0.001
        }

    @staticmethod
    def clasificar_abc(
        venta_diaria_bultos: float,
        conn: duckdb.DuckDBPyConnection
    ) -> str:
        """
        Clasifica producto en ABC según venta diaria en bultos

        Args:
            venta_diaria_bultos: Venta promedio diaria en bultos
            conn: Conexión a DuckDB

        Returns:
            Clasificación ABC: 'A', 'AB', 'B', 'BC', 'C', o '-'
        """
        umbrales = ConfigInventarioService.obtener_umbrales_abc(conn)

        if venta_diaria_bultos >= umbrales['umbral_a']:
            return 'A'
        elif venta_diaria_bultos >= umbrales['umbral_ab']:
            return 'AB'
        elif venta_diaria_bultos >= umbrales['umbral_b']:
            return 'B'
        elif venta_diaria_bultos >= umbrales['umbral_bc']:
            return 'BC'
        elif venta_diaria_bultos >= umbrales['umbral_c']:
            return 'C'
        return '-'

    @staticmethod
    def obtener_parametros_xyz(conn: duckdb.DuckDBPyConnection) -> Dict:
        """
        Obtiene parámetros de análisis XYZ desde configuración global

        Args:
            conn: Conexión a DuckDB

        Returns:
            Dict con parámetros XYZ
        """
        try:
            # Umbrales XYZ
            umbrales_xyz = conn.execute("""
                SELECT parametro, valor_numerico
                FROM config_inventario_global
                WHERE categoria = 'xyz_umbrales'
                  AND activo = true
            """).fetchall()

            # Z-scores
            zscores = conn.execute("""
                SELECT parametro, valor_numerico
                FROM config_inventario_global
                WHERE categoria = 'niveles_servicio'
                  AND activo = true
            """).fetchall()

            # Ajustes XYZ
            ajustes = conn.execute("""
                SELECT parametro, valor_numerico
                FROM config_inventario_global
                WHERE categoria = 'ajustes_xyz'
                  AND activo = true
            """).fetchall()

            return {
                'umbrales': {row[0]: float(row[1]) for row in umbrales_xyz},
                'zscores': {row[0]: float(row[1]) for row in zscores},
                'ajustes': {row[0]: float(row[1]) for row in ajustes}
            }

        except Exception as e:
            logger.warning(f"Error obteniendo parámetros XYZ: {e}")
            return {
                'umbrales': {'umbral_x': 0.5, 'umbral_y': 1.0},
                'zscores': {
                    'zscore_a': 2.33, 'zscore_ab': 2.05,
                    'zscore_b': 1.65, 'zscore_bc': 1.28, 'zscore_c': 0.84
                },
                'ajustes': {'ajuste_x': 0.8, 'ajuste_y': 1.0, 'ajuste_z': 1.3}
            }
