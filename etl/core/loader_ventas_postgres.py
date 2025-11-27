#!/usr/bin/env python3
"""
PostgreSQL Loader - Ventas
Carga datos de ventas del API KLK a PostgreSQL

Schema PostgreSQL existente (tabla ventas):
- id: bigint (SERIAL)
- numero_factura: varchar
- fecha_venta: timestamp
- ubicacion_id: varchar
- almacen_codigo: varchar
- almacen_nombre: varchar
- producto_id: varchar
- cantidad_vendida: numeric
- peso_unitario: numeric
- peso_calculado: numeric
- total_cantidad_por_unidad_medida: numeric
- unidad_medida_venta: varchar
- factor_unidad_medida: numeric
- precio_unitario: numeric
- costo_unitario: numeric
- venta_total: numeric
- costo_total: numeric
- utilidad_bruta: numeric
- margen_bruto_pct: numeric
- fecha_creacion: timestamp
"""

import psycopg2
import psycopg2.extras
import pandas as pd
import json
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging
from pathlib import Path

# Importar configuracion PostgreSQL desde backend
import sys
sys.path.append(str(Path(__file__).parent.parent.parent / 'backend'))
from db_config import POSTGRES_DSN

logger = logging.getLogger('etl_ventas_postgres')


class PostgreSQLVentasLoader:
    """Cargador de ventas a PostgreSQL"""

    def __init__(self):
        self.dsn = POSTGRES_DSN
        self.logger = logger
        self._setup_logger()

    def _setup_logger(self):
        """Configura el logger si no tiene handlers"""
        if not self.logger.handlers:
            self.logger.setLevel(logging.INFO)
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)

    def _get_connection(self):
        """Obtiene conexion a PostgreSQL"""
        return psycopg2.connect(self.dsn)

    def load_ventas_raw(self, ventas_data: List[Dict], tienda_codigo: str) -> Dict[str, Any]:
        """
        Carga ventas crudas directamente desde el response del API KLK.

        Este metodo procesa el response crudo del API (sin pasar por transformer)
        para insercion directa en PostgreSQL usando el schema existente.

        Args:
            ventas_data: Lista de ventas del response['ventas'] del API KLK
            tienda_codigo: Codigo de tienda (ej: SUC001)

        Returns:
            Dict con success, records_loaded, duplicates_skipped
        """
        if not ventas_data:
            self.logger.warning("Lista de ventas vacia")
            return {
                "success": False,
                "message": "Lista de ventas vacia",
                "records_loaded": 0,
                "duplicates_skipped": 0
            }

        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # UPSERT: INSERT ... ON CONFLICT DO UPDATE
            # Esto garantiza que si ejecutas 2 veces el mismo dia, se reemplazan los datos
            # El constraint UNIQUE es en numero_factura (que incluye _L{linea})
            upsert_query = """
                INSERT INTO ventas (
                    numero_factura, fecha_venta, ubicacion_id, almacen_codigo, almacen_nombre,
                    producto_id, cantidad_vendida, peso_unitario, peso_calculado,
                    total_cantidad_por_unidad_medida, unidad_medida_venta, factor_unidad_medida,
                    precio_unitario, costo_unitario, venta_total, costo_total,
                    utilidad_bruta, margen_bruto_pct, fecha_creacion
                )
                VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s
                )
                ON CONFLICT (numero_factura) DO UPDATE SET
                    fecha_venta = EXCLUDED.fecha_venta,
                    ubicacion_id = EXCLUDED.ubicacion_id,
                    almacen_codigo = EXCLUDED.almacen_codigo,
                    almacen_nombre = EXCLUDED.almacen_nombre,
                    producto_id = EXCLUDED.producto_id,
                    cantidad_vendida = EXCLUDED.cantidad_vendida,
                    peso_unitario = EXCLUDED.peso_unitario,
                    peso_calculado = EXCLUDED.peso_calculado,
                    total_cantidad_por_unidad_medida = EXCLUDED.total_cantidad_por_unidad_medida,
                    unidad_medida_venta = EXCLUDED.unidad_medida_venta,
                    factor_unidad_medida = EXCLUDED.factor_unidad_medida,
                    precio_unitario = EXCLUDED.precio_unitario,
                    costo_unitario = EXCLUDED.costo_unitario,
                    venta_total = EXCLUDED.venta_total,
                    costo_total = EXCLUDED.costo_total,
                    utilidad_bruta = EXCLUDED.utilidad_bruta,
                    margen_bruto_pct = EXCLUDED.margen_bruto_pct,
                    fecha_creacion = EXCLUDED.fecha_creacion
            """

            records_loaded = 0
            duplicates_skipped = 0
            batch_data = []

            for venta in ventas_data:
                # Extraer datos anidados
                producto = venta.get('producto', [{}])[0] if venta.get('producto') else {}
                cantidad_info = venta.get('cantidad', [{}])[0] if venta.get('cantidad') else {}
                financiero = venta.get('financiero', [{}])[0] if venta.get('financiero') else {}

                numero_factura = venta.get('numero_factura', '')
                linea = venta.get('linea', 0)
                codigo_producto = producto.get('codigo_producto', 'UNKNOWN')

                # Construir numero_factura unico incluyendo linea
                numero_factura_unico = f"{numero_factura}_L{linea}"

                # Parsear fecha y hora para crear timestamp
                fecha_str = venta.get('fecha', '')
                hora_str = venta.get('hora', '00:00:00')
                # Hora viene como "11:30:17.7514927", necesitamos solo HH:MM:SS
                hora_clean = hora_str.split('.')[0] if '.' in hora_str else hora_str

                try:
                    fecha_venta = datetime.strptime(f"{fecha_str} {hora_clean}", '%Y-%m-%d %H:%M:%S')
                except ValueError:
                    fecha_venta = datetime.now()

                # Extraer valores financieros (en USD)
                cantidad_vendida = float(cantidad_info.get('cantidad_vendida', 0) or 0)
                peso_unitario = float(cantidad_info.get('peso_unitario', 0) or 0)
                factor_unidad = float(cantidad_info.get('factor_unidad_medida', 1) or 1)

                precio_unitario = float(financiero.get('precio_unitario_usd', 0) or 0)
                costo_unitario = float(financiero.get('costo_unitario_usd', 0) or 0)
                venta_total = float(financiero.get('venta_total_usd', 0) or 0)
                costo_total = float(financiero.get('costo_total_usd', 0) or 0)
                utilidad_bruta = float(financiero.get('utilidad_bruta_usd', 0) or 0)

                # Calcular margen
                margen_pct = (utilidad_bruta / venta_total * 100) if venta_total > 0 else 0

                # Mapear ubicacion_id de tienda_codigo (SUC001 -> tienda_01)
                ubicacion_map = {
                    'SUC001': 'tienda_01',
                    'SUC002': 'tienda_08',
                    'SUC003': 'tienda_17',
                    'SUC004': 'tienda_18',
                    'SUC005': 'tienda_20',
                    'SUC006': 'tienda_15',
                }
                ubicacion_id = ubicacion_map.get(tienda_codigo, tienda_codigo)

                batch_data.append((
                    numero_factura_unico,
                    fecha_venta,
                    ubicacion_id,
                    cantidad_info.get('codigo_almacen'),
                    cantidad_info.get('nombre_almacen'),
                    codigo_producto,
                    cantidad_vendida,
                    peso_unitario,
                    peso_unitario * cantidad_vendida if peso_unitario else 0,  # peso_calculado
                    cantidad_vendida * factor_unidad,  # total_cantidad_por_unidad_medida
                    cantidad_info.get('unidad_medida_venta', 'UNIDAD'),
                    factor_unidad,
                    precio_unitario,
                    costo_unitario,
                    venta_total,
                    costo_total,
                    utilidad_bruta,
                    round(margen_pct, 2),
                    datetime.now()
                ))

            # Ejecutar batch upsert
            for record in batch_data:
                try:
                    cursor.execute(upsert_query, record)
                    records_loaded += 1
                except Exception as e:
                    self.logger.warning(f"Error insertando registro: {e}")
                    conn.rollback()
                    duplicates_skipped += 1

            conn.commit()
            cursor.close()
            conn.close()

            self.logger.info(f"✅ Ventas cargadas: {records_loaded} nuevas, {duplicates_skipped} duplicados/errores omitidos")

            return {
                "success": True,
                "message": f"{records_loaded} ventas cargadas",
                "records_loaded": records_loaded,
                "duplicates_skipped": duplicates_skipped
            }

        except Exception as e:
            self.logger.error(f"❌ Error cargando ventas: {e}")
            import traceback
            self.logger.error(traceback.format_exc())
            return {
                "success": False,
                "message": str(e),
                "records_loaded": 0,
                "duplicates_skipped": 0
            }

    def get_ultima_venta_tienda(self, ubicacion_id: str) -> Optional[datetime]:
        """
        Obtiene la fecha/hora de la ultima venta registrada para una tienda.
        Util para saber desde donde continuar la extraccion incremental.

        Args:
            ubicacion_id: ID de ubicacion (ej: tienda_01)

        Returns:
            datetime de la ultima venta o None si no hay registros
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            cursor.execute("""
                SELECT MAX(fecha_creacion) as ultima_venta
                FROM ventas
                WHERE ubicacion_id = %s
            """, (ubicacion_id,))

            result = cursor.fetchone()
            cursor.close()
            conn.close()

            return result[0] if result and result[0] else None

        except Exception as e:
            self.logger.error(f"Error obteniendo ultima venta: {e}")
            return None

    def get_stats_tienda(self, ubicacion_id: str, fecha: Optional[str] = None) -> Dict[str, Any]:
        """
        Obtiene estadisticas de ventas para una tienda.

        Args:
            ubicacion_id: ID de ubicacion (ej: tienda_01)
            fecha: Fecha opcional (YYYY-MM-DD), si no se especifica usa hoy

        Returns:
            Dict con estadisticas
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            if not fecha:
                fecha = datetime.now().strftime('%Y-%m-%d')

            cursor.execute("""
                SELECT
                    COUNT(*) as total_registros,
                    COUNT(DISTINCT producto_id) as productos_unicos,
                    SUM(cantidad_vendida) as cantidad_total,
                    SUM(venta_total) as venta_total_usd,
                    MIN(fecha_creacion) as primera_venta,
                    MAX(fecha_creacion) as ultima_venta
                FROM ventas
                WHERE ubicacion_id = %s AND fecha_venta::date = %s
            """, (ubicacion_id, fecha))

            row = cursor.fetchone()
            cursor.close()
            conn.close()

            if row:
                return {
                    "ubicacion_id": ubicacion_id,
                    "fecha": fecha,
                    "total_registros": row[0] or 0,
                    "productos_unicos": row[1] or 0,
                    "cantidad_total": float(row[2] or 0),
                    "venta_total_usd": float(row[3] or 0),
                    "primera_venta": str(row[4]) if row[4] else None,
                    "ultima_venta": str(row[5]) if row[5] else None
                }
            return {"ubicacion_id": ubicacion_id, "fecha": fecha, "total_registros": 0}

        except Exception as e:
            self.logger.error(f"Error obteniendo stats: {e}")
            return {"error": str(e)}

    def get_count_today(self) -> Dict[str, int]:
        """
        Obtiene el conteo de ventas de hoy por ubicacion.

        Returns:
            Dict con ubicacion_id -> count
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            cursor.execute("""
                SELECT ubicacion_id, COUNT(*) as count
                FROM ventas
                WHERE fecha_venta::date = CURRENT_DATE
                GROUP BY ubicacion_id
                ORDER BY count DESC
            """)

            result = {row[0]: row[1] for row in cursor.fetchall()}
            cursor.close()
            conn.close()

            return result

        except Exception as e:
            self.logger.error(f"Error obteniendo count: {e}")
            return {}


def test_loader():
    """Test basico del loader"""
    print("\n" + "="*80)
    print("TEST: PostgreSQL Ventas Loader")
    print("="*80 + "\n")

    loader = PostgreSQLVentasLoader()

    # Test con datos simulados (estructura del API KLK)
    test_ventas = [
        {
            "numero_factura": "TEST-001",
            "fecha": "2025-11-26",
            "hora": "10:30:00.000",
            "linea": 1,
            "producto": [{
                "codigo_producto": "000001",
                "descripcion_producto": "PRODUCTO TEST",
                "categoria_producto": "CATEGORIA TEST"
            }],
            "cantidad": [{
                "codigo_almacen": "APP-TPF",
                "nombre_almacen": "PISO VENTA",
                "cantidad_vendida": 2.5,
                "peso_unitario": 0,
                "unidad_medida_venta": "KG",
                "factor_unidad_medida": 1
            }],
            "financiero": [{
                "precio_unitario_usd": 5.00,
                "costo_unitario_usd": 3.00,
                "venta_total_usd": 12.50,
                "costo_total_usd": 7.50,
                "utilidad_bruta_usd": 5.00
            }],
            "total_factura": 1000.00,
            "tasa_usd": 80.00
        }
    ]

    print("Cargando ventas de prueba...")
    result = loader.load_ventas_raw(test_ventas, "SUC001")
    print(f"Resultado: {result}")

    print("\nObteniendo stats...")
    stats = loader.get_stats_tienda("tienda_01", "2025-11-26")
    print(f"Stats: {stats}")

    print("\n" + "="*80)
    print("✅ Test completado")
    print("="*80 + "\n")


if __name__ == "__main__":
    test_loader()
