#!/usr/bin/env python3
"""
Script principal para ejecutar ETL de ventas
Procesa ventas de una tienda específica para un rango de fechas
Soporta sistemas Stellar (SQL Server) y KLK (REST API)
"""

import argparse
import sys
from pathlib import Path
from typing import Dict, Any
from datetime import datetime, date, timedelta
import logging

# Agregar el directorio actual al path
sys.path.append(str(Path(__file__).parent))

from tiendas_config import TIENDAS_CONFIG, get_tiendas_activas
from config import ETLConfig, DatabaseConfig

# Stellar (SQL Server) components
from extractor_ventas import VentasExtractor
from transformer_ventas import VentasTransformer

# KLK (REST API) components
try:
    from extractor_ventas_klk import VentasKLKExtractor
    from transformer_ventas_klk import VentasKLKTransformer
    KLK_AVAILABLE = True
except ImportError:
    KLK_AVAILABLE = False

# Shared loader
from loader_ventas import VentasLoader

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('etl_ventas')


class VentasETL:
    """Orquestador principal del ETL de ventas (Stellar y KLK)"""

    def __init__(self):
        # Stellar POS components (SQL Server)
        self.stellar_extractor = VentasExtractor()
        self.stellar_transformer = VentasTransformer()

        # KLK POS components (REST API)
        if KLK_AVAILABLE:
            self.klk_extractor = VentasKLKExtractor()
            self.klk_transformer = VentasKLKTransformer()
        else:
            logger.warning("⚠️ KLK ETL components not available")
            self.klk_extractor = None
            self.klk_transformer = None

        # Shared loader
        self.loader = VentasLoader()
        self.results = []

    def ejecutar_etl_ventas(self,
                           tienda_id: str,
                           fecha_inicio: date,
                           fecha_fin: date,
                           limite_registros: int = None) -> Dict[str, Any]:
        """
        Ejecuta el ETL de ventas para una tienda y rango de fechas específicos
        Detecta automáticamente el sistema POS (Stellar o KLK) y usa el método apropiado

        Args:
            tienda_id: ID de la tienda (ej: 'tienda_08')
            fecha_inicio: Fecha inicial del rango
            fecha_fin: Fecha final del rango
            limite_registros: Límite máximo de registros a procesar (None = sin límite)

        Returns:
            Dict con el resultado del proceso
        """

        try:
            # Validar configuración de tienda
            if tienda_id not in TIENDAS_CONFIG:
                raise ValueError(f"Tienda {tienda_id} no configurada")

            config = TIENDAS_CONFIG[tienda_id]

            if not config.activo:
                logger.warning(f"⏭️  {config.ubicacion_nombre} está INACTIVA - Saltando")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": "Tienda inactiva",
                    "registros": 0
                }

            # Detectar sistema POS
            sistema_pos = getattr(config, 'sistema_pos', 'stellar')

            start_time = datetime.now()

            # Rutear según el sistema POS
            if sistema_pos == 'klk':
                logger.info(f"🏪 Procesando: {config.ubicacion_nombre} (KLK POS)")
                return self._ejecutar_etl_ventas_klk(
                    tienda_id=tienda_id,
                    config=config,
                    fecha_inicio=fecha_inicio,
                    fecha_fin=fecha_fin,
                    limite_registros=limite_registros,
                    start_time=start_time
                )
            else:
                logger.info(f"🏪 Procesando: {config.ubicacion_nombre} (Stellar POS)")
                return self._ejecutar_etl_ventas_stellar(
                    tienda_id=tienda_id,
                    config=config,
                    fecha_inicio=fecha_inicio,
                    fecha_fin=fecha_fin,
                    limite_registros=limite_registros,
                    start_time=start_time
                )

        except Exception as e:
            logger.error(f"❌ Error procesando ventas de {tienda_id}: {str(e)}")
            return {
                "tienda_id": tienda_id,
                "nombre": TIENDAS_CONFIG[tienda_id].ubicacion_nombre if tienda_id in TIENDAS_CONFIG else tienda_id,
                "success": False,
                "message": f"Error crítico: {str(e)}",
                "registros": 0
            }

    def _ejecutar_etl_ventas_stellar(self,
                                     tienda_id: str,
                                     config,
                                     fecha_inicio: date,
                                     fecha_fin: date,
                                     limite_registros: int,
                                     start_time: datetime) -> Dict[str, Any]:
        """
        Ejecuta ETL de ventas para tiendas con Stellar POS (SQL Server)
        """
        try:
            logger.info(f"   📡 Conectando a {config.server_ip}:{config.port}")
            logger.info(f"   📅 Período: {fecha_inicio} a {fecha_fin}")
            if limite_registros:
                logger.info(f"   🔢 Límite: {limite_registros:,} registros")
            else:
                logger.info(f"   🔢 Sin límite - extrayendo TODOS los registros del período")

            # Configurar conexión de base de datos
            db_config = DatabaseConfig(
                ubicacion_id=config.ubicacion_id,
                ubicacion_nombre=config.ubicacion_nombre,
                tipo=config.tipo,
                server_ip=config.server_ip,
                database_name=config.database_name,
                username=config.username,
                password=config.password,
                port=config.port
            )

            # 1. EXTRACCIÓN
            logger.info(f"   📥 Extrayendo datos de ventas desde SQL Server...")

            raw_data = self.stellar_extractor.extract_ventas_data(
                config=db_config,
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
                limite_registros=limite_registros
            )

            if raw_data is None or raw_data.empty:
                logger.warning(f"   ⚠️ Sin datos de ventas para {config.ubicacion_nombre} en el período {fecha_inicio} - {fecha_fin}")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": "Sin datos de ventas extraídos",
                    "registros": 0,
                    "periodo": f"{fecha_inicio} - {fecha_fin}"
                }

            registros_extraidos = len(raw_data)
            logger.info(f"   ✅ Extraídos: {registros_extraidos:,} registros de ventas")

            # Validar datos extraídos
            validacion = self.stellar_extractor.validar_datos_ventas(raw_data)
            if not validacion["valido"]:
                logger.error(f"   ❌ Datos inválidos: {validacion['errores']}")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": f"Datos inválidos: {validacion['errores']}",
                    "registros": 0
                }

            if validacion["advertencias"]:
                for advertencia in validacion["advertencias"]:
                    logger.warning(f"   ⚠️ {advertencia}")

            # 2. TRANSFORMACIÓN
            logger.info(f"   🔄 Transformando datos de ventas...")

            transformed_data = self.stellar_transformer.transform_ventas_data(raw_data)

            if transformed_data.empty:
                logger.warning(f"   ⚠️ Sin datos transformados para {config.ubicacion_nombre}")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": "Error en transformación de ventas",
                    "registros": 0
                }

            registros_transformados = len(transformed_data)
            logger.info(f"   ✅ Transformados: {registros_transformados:,} registros")

            # Generar estadísticas de transformación
            stats_transformacion = self.stellar_transformer.generar_estadisticas_transformacion(
                raw_data, transformed_data
            )

            logger.info(f"   📊 Tasa supervivencia: {stats_transformacion['tasa_supervivencia']:.1f}%")
            logger.info(f"   💰 Venta total: ${stats_transformacion['metricas_negocio']['venta_total']:,.2f}")
            logger.info(f"   🧾 Facturas: {stats_transformacion['metricas_negocio']['total_facturas']:,}")

            # 3. CARGA
            logger.info(f"   💾 Cargando a base de datos...")

            result = self.loader.load_ventas_data(transformed_data)

            if result["success"]:
                logger.info(f"   ✅ Cargados: {result['stats']['insertados']:,} registros")

                # Obtener resumen final
                resumen = self.loader.get_ventas_summary(
                    ubicacion_id=config.ubicacion_id,
                    fecha_desde=str(fecha_inicio),
                    fecha_hasta=str(fecha_fin)
                )

                end_time = datetime.now()
                duracion = (end_time - start_time).total_seconds()

                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": True,
                    "message": "ETL de ventas Stellar completado exitosamente",
                    "registros_extraidos": registros_extraidos,
                    "registros_transformados": registros_transformados,
                    "registros_cargados": result['stats']['insertados'],
                    "tiempo_ejecucion": duracion,
                    "periodo": f"{fecha_inicio} - {fecha_fin}",
                    "validacion": validacion,
                    "estadisticas": stats_transformacion,
                    "resumen_bd": resumen
                }
            else:
                logger.error(f"   ❌ Error en carga: {result.get('message')}")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": result.get('message'),
                    "registros": 0
                }

        except Exception as e:
            logger.error(f"   ❌ Error en ETL Stellar: {str(e)}")
            return {
                "tienda_id": tienda_id,
                "nombre": config.ubicacion_nombre,
                "success": False,
                "message": f"Error en ETL Stellar: {str(e)}",
                "registros": 0
            }

    def _ejecutar_etl_ventas_klk(self,
                                 tienda_id: str,
                                 config,
                                 fecha_inicio: date,
                                 fecha_fin: date,
                                 limite_registros: int,
                                 start_time: datetime) -> Dict[str, Any]:
        """
        Ejecuta ETL de ventas para tiendas con KLK POS (REST API)
        """
        if not KLK_AVAILABLE or not self.klk_extractor:
            logger.error("   ❌ KLK ETL components not available")
            return {
                "tienda_id": tienda_id,
                "nombre": config.ubicacion_nombre,
                "success": False,
                "message": "KLK ETL components not available",
                "registros": 0
            }

        try:
            logger.info(f"   📡 API: {self.klk_extractor.api_config.base_url}")
            logger.info(f"   📅 Período: {fecha_inicio} a {fecha_fin}")
            if limite_registros:
                logger.info(f"   🔢 Límite: {limite_registros:,} registros")
            else:
                logger.info(f"   🔢 Sin límite - extrayendo TODOS los registros del período")

            # 1. EXTRACCIÓN desde REST API
            logger.info(f"   📥 Extrayendo datos de ventas desde API KLK...")

            raw_data = self.klk_extractor.extract_ventas(
                ubicacion_id=config.ubicacion_id,
                ubicacion_nombre=config.ubicacion_nombre,
                fecha_desde=fecha_inicio,
                fecha_hasta=fecha_fin
            )

            if raw_data is None or raw_data.empty:
                logger.warning(f"   ⚠️ Sin datos de ventas para {config.ubicacion_nombre} en el período {fecha_inicio} - {fecha_fin}")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": "Sin datos de ventas extraídos de API KLK",
                    "registros": 0,
                    "periodo": f"{fecha_inicio} - {fecha_fin}"
                }

            registros_extraidos = len(raw_data)
            logger.info(f"   ✅ Extraídos: {registros_extraidos:,} registros de ventas desde API KLK")

            # Aplicar límite si se especificó
            if limite_registros and registros_extraidos > limite_registros:
                logger.info(f"   ✂️ Aplicando límite de {limite_registros:,} registros")
                raw_data = raw_data.head(limite_registros)
                registros_extraidos = len(raw_data)

            # 2. TRANSFORMACIÓN
            logger.info(f"   🔄 Transformando datos de ventas KLK...")

            transformed_data = self.klk_transformer.transform(raw_data)

            if transformed_data.empty:
                logger.warning(f"   ⚠️ Sin datos transformados para {config.ubicacion_nombre}")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": "Error en transformación de ventas KLK",
                    "registros": 0
                }

            registros_transformados = len(transformed_data)
            logger.info(f"   ✅ Transformados: {registros_transformados:,} registros")

            # Calcular métricas básicas
            venta_total = float(transformed_data['venta_total'].sum()) if 'venta_total' in transformed_data.columns else 0.0
            facturas_unicas = transformed_data['numero_factura'].nunique() if 'numero_factura' in transformed_data.columns else 0

            logger.info(f"   📊 Tasa supervivencia: {(registros_transformados/registros_extraidos*100):.1f}%")
            logger.info(f"   💰 Venta total: ${venta_total:,.2f}")
            logger.info(f"   🧾 Facturas: {facturas_unicas:,}")

            # 3. CARGA
            logger.info(f"   💾 Cargando a base de datos...")

            result = self.loader.load_ventas_data(transformed_data)

            if result["success"]:
                logger.info(f"   ✅ Cargados: {result['stats']['insertados']:,} registros")

                # Obtener resumen final
                resumen = self.loader.get_ventas_summary(
                    ubicacion_id=config.ubicacion_id,
                    fecha_desde=str(fecha_inicio),
                    fecha_hasta=str(fecha_fin)
                )

                end_time = datetime.now()
                duracion = (end_time - start_time).total_seconds()

                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": True,
                    "message": "ETL de ventas KLK completado exitosamente",
                    "registros_extraidos": registros_extraidos,
                    "registros_transformados": registros_transformados,
                    "registros_cargados": result['stats']['insertados'],
                    "tiempo_ejecucion": duracion,
                    "periodo": f"{fecha_inicio} - {fecha_fin}",
                    "estadisticas": {
                        "tasa_supervivencia": (registros_transformados/registros_extraidos*100) if registros_extraidos > 0 else 0,
                        "metricas_negocio": {
                            "venta_total": venta_total,
                            "total_facturas": facturas_unicas,
                            "total_productos": transformed_data['codigo_producto'].nunique() if 'codigo_producto' in transformed_data.columns else 0,
                            "ticket_promedio": venta_total / facturas_unicas if facturas_unicas > 0 else 0
                        }
                    },
                    "resumen_bd": resumen
                }
            else:
                logger.error(f"   ❌ Error en carga: {result.get('message')}")
                return {
                    "tienda_id": tienda_id,
                    "nombre": config.ubicacion_nombre,
                    "success": False,
                    "message": result.get('message'),
                    "registros": 0
                }

        except Exception as e:
            logger.error(f"   ❌ Error en ETL KLK: {str(e)}")
            return {
                "tienda_id": tienda_id,
                "nombre": config.ubicacion_nombre,
                "success": False,
                "message": f"Error en ETL KLK: {str(e)}",
                "registros": 0
            }

    def generar_reporte(self, resultado: Dict[str, Any]) -> str:
        """Genera un reporte legible del resultado del ETL"""

        reporte = f"""
🏪 REPORTE ETL VENTAS - {resultado['nombre'].upper()}
{'='*60}
📅 Período: {resultado.get('periodo', 'No especificado')}
⚡ Estado: {'✅ EXITOSO' if resultado['success'] else '❌ FALLIDO'}

"""

        if resultado['success']:
            reporte += f"""📊 ESTADÍSTICAS DEL PROCESO:
   📥 Registros extraídos: {resultado.get('registros_extraidos', 0):,}
   🔄 Registros transformados: {resultado.get('registros_transformados', 0):,}
   💾 Registros cargados: {resultado.get('registros_cargados', 0):,}
   ⏱️  Tiempo total: {resultado.get('tiempo_ejecucion', 0):.2f} segundos

💰 MÉTRICAS DE NEGOCIO:
   🧾 Total facturas: {resultado.get('estadisticas', {}).get('metricas_negocio', {}).get('total_facturas', 0):,}
   🛍️  Total productos: {resultado.get('estadisticas', {}).get('metricas_negocio', {}).get('total_productos', 0):,}
   💵 Venta total: ${resultado.get('estadisticas', {}).get('metricas_negocio', {}).get('venta_total', 0):,.2f}
   🎯 Ticket promedio: ${resultado.get('estadisticas', {}).get('metricas_negocio', {}).get('ticket_promedio', 0):,.2f}

"""

            # Agregar advertencias si las hay
            validacion = resultado.get('validacion', {})
            if validacion.get('advertencias'):
                reporte += "⚠️  ADVERTENCIAS:\n"
                for advertencia in validacion['advertencias']:
                    reporte += f"   • {advertencia}\n"
                reporte += "\n"

        else:
            reporte += f"❌ ERROR: {resultado.get('message', 'Error desconocido')}\n"

        reporte += "="*60

        return reporte


def main():
    """Función principal del script"""

    parser = argparse.ArgumentParser(description="ETL de Ventas - La Granja Mercado (Stellar y KLK)")
    parser.add_argument("--tienda", help="ID de la tienda (ej: tienda_08)")
    parser.add_argument("--fecha-inicio", help="Fecha inicial (YYYY-MM-DD)")
    parser.add_argument("--fecha-fin", help="Fecha final (YYYY-MM-DD). Por defecto: hoy")
    parser.add_argument("--limite", type=int, default=None, help="Límite de registros (default: None - sin límite, extrae todo)")
    parser.add_argument("--mostrar-tiendas", action="store_true", help="Mostrar tiendas disponibles")

    args = parser.parse_args()

    if args.mostrar_tiendas:
        print("\n🏪 TIENDAS DISPONIBLES:")
        print("="*50)
        tiendas_activas = get_tiendas_activas()
        for tienda_id, config in tiendas_activas.items():
            sistema = getattr(config, 'sistema_pos', 'stellar')
            print(f"   {tienda_id}: {config.ubicacion_nombre} ({sistema.upper()})")
        print("="*50)
        return

    # Validar que si NO se solicita --mostrar-tiendas, entonces tienda y fecha-inicio son requeridos
    if not args.tienda or not args.fecha_inicio:
        parser.error("--tienda y --fecha-inicio son requeridos (a menos que uses --mostrar-tiendas)")

    # Validar y convertir fechas
    try:
        fecha_inicio = datetime.strptime(args.fecha_inicio, "%Y-%m-%d").date()
        if args.fecha_fin:
            fecha_fin = datetime.strptime(args.fecha_fin, "%Y-%m-%d").date()
        else:
            fecha_fin = date.today()

        if fecha_inicio > fecha_fin:
            print("❌ Error: La fecha de inicio no puede ser mayor que la fecha final")
            sys.exit(1)

        # Validar rango no muy amplio para evitar sobrecargar
        dias_diferencia = (fecha_fin - fecha_inicio).days
        if dias_diferencia > 30:
            print(f"⚠️ Advertencia: Rango de fechas muy amplio ({dias_diferencia} días)")
            print(f"⚠️ Esto puede tomar mucho tiempo y consumir muchos recursos")

    except ValueError:
        print("❌ Error: Formato de fecha inválido. Use YYYY-MM-DD")
        sys.exit(1)

    # Ejecutar ETL
    etl = VentasETL()

    print(f"🚀 Iniciando ETL de Ventas")
    print(f"   🏪 Tienda: {args.tienda}")
    print(f"   📅 Período: {fecha_inicio} a {fecha_fin}")
    if args.limite:
        print(f"   🔢 Límite: {args.limite:,} registros")
    else:
        print(f"   🔢 Sin límite - extrayendo TODOS los registros")
    print("="*60)

    resultado = etl.ejecutar_etl_ventas(
        tienda_id=args.tienda,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        limite_registros=args.limite
    )

    # Mostrar reporte
    reporte = etl.generar_reporte(resultado)
    print(reporte)

    # Guardar reporte en archivo
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    archivo_reporte = f"reporte_ventas_{args.tienda}_{timestamp}.txt"

    with open(archivo_reporte, 'w', encoding='utf-8') as f:
        f.write(reporte)

    print(f"\n📄 Reporte guardado en: {archivo_reporte}")

    # Código de salida
    sys.exit(0 if resultado['success'] else 1)


if __name__ == "__main__":
    main()
