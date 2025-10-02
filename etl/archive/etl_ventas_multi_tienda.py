#!/usr/bin/env python3
"""
Script para ejecutar ETL de ventas de múltiples tiendas
Procesa ventas de todas las tiendas activas para un rango de fechas
Fecha: 2025-09-25
"""

import argparse
import sys
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime, date, timedelta
import logging

# Agregar el directorio actual al path
sys.path.append(str(Path(__file__).parent))

from tiendas_config import TIENDAS_CONFIG, get_tiendas_activas
from etl_ventas import VentasETL

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('etl_ventas_multi_tienda')


class VentasMultiTiendaETL:
    """Orquestador de ETL de ventas para múltiples tiendas"""

    def __init__(self):
        self.etl_ventas = VentasETL()
        self.results = []

    def ejecutar_etl_tienda_ventas(self,
                                   tienda_id: str,
                                   fecha_inicio: date,
                                   fecha_fin: date,
                                   limite_registros: int = 10000) -> Dict[str, Any]:
        """Ejecuta el ETL de ventas para una tienda específica"""
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
                    "registros_extraidos": 0,
                    "registros_cargados": 0,
                    "periodo": f"{fecha_inicio} - {fecha_fin}"
                }

            logger.info(f"🏪 Procesando ventas: {config.ubicacion_nombre}")
            logger.info(f"   📡 Conectando a {config.server_ip}:{config.port}")
            logger.info(f"   📅 Período: {fecha_inicio} a {fecha_fin}")
            logger.info(f"   🔢 Límite: {limite_registros:,} registros")

            # Ejecutar el ETL usando la clase ya existente
            resultado = self.etl_ventas.ejecutar_etl_ventas(
                tienda_id=tienda_id,
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
                limite_registros=limite_registros
            )

            if resultado["success"]:
                logger.info(f"   ✅ ETL completado para {config.ubicacion_nombre}")
                logger.info(f"   📥 Extraídos: {resultado.get('registros_extraidos', 0):,}")
                logger.info(f"   🔄 Transformados: {resultado.get('registros_transformados', 0):,}")
                logger.info(f"   💾 Cargados: {resultado.get('registros_cargados', 0):,}")
                logger.info(f"   ⏱️  Tiempo: {resultado.get('tiempo_ejecucion', 0):.2f}s")
            else:
                logger.error(f"   ❌ Error en {config.ubicacion_nombre}: {resultado.get('message')}")

            return resultado

        except Exception as e:
            logger.error(f"❌ Error crítico procesando ventas de {tienda_id}: {str(e)}")
            return {
                "tienda_id": tienda_id,
                "nombre": TIENDAS_CONFIG[tienda_id].ubicacion_nombre if tienda_id in TIENDAS_CONFIG else tienda_id,
                "success": False,
                "message": f"Error crítico: {str(e)}",
                "registros_extraidos": 0,
                "registros_cargados": 0,
                "periodo": f"{fecha_inicio} - {fecha_fin}"
            }

    def ejecutar_todas_las_tiendas_ventas(self,
                                          fecha_inicio: date,
                                          fecha_fin: date,
                                          limite_registros: int = 10000,
                                          solo_activas: bool = True) -> List[Dict[str, Any]]:
        """Ejecuta el ETL de ventas para todas las tiendas"""

        if solo_activas:
            tiendas = get_tiendas_activas()
            tipo_tiendas = "activas"
        else:
            tiendas = TIENDAS_CONFIG
            tipo_tiendas = "configuradas"

        logger.info(f"\n🚀 INICIANDO ETL VENTAS MULTI-TIENDA")
        logger.info(f"   📅 Período: {fecha_inicio} a {fecha_fin}")
        logger.info(f"   🏪 Tiendas {tipo_tiendas}: {len(tiendas)}")
        logger.info(f"   🔢 Límite por tienda: {limite_registros:,} registros")
        logger.info("=" * 70)

        resultados = []
        inicio_total = datetime.now()

        # Ejecución secuencial (por ahora)
        for i, tienda_id in enumerate(tiendas, 1):
            logger.info(f"\n[{i}/{len(tiendas)}] Procesando tienda: {tienda_id}")
            logger.info("-" * 50)

            resultado = self.ejecutar_etl_tienda_ventas(
                tienda_id=tienda_id,
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
                limite_registros=limite_registros
            )
            resultados.append(resultado)

            # Pausa breve entre tiendas para no saturar las conexiones
            import time
            time.sleep(1)

        fin_total = datetime.now()
        duracion_total = (fin_total - inicio_total).total_seconds()

        logger.info(f"\n⏱️ Tiempo total de ejecución: {duracion_total:.2f} segundos")
        return resultados

    def generar_resumen_ventas(self, resultados: List[Dict[str, Any]]):
        """Genera un resumen completo de la ejecución del ETL de ventas"""
        logger.info("\n" + "=" * 70)
        logger.info("📊 RESUMEN DE EJECUCIÓN ETL VENTAS MULTI-TIENDA")
        logger.info("=" * 70)

        exitosos = [r for r in resultados if r["success"]]
        fallidos = [r for r in resultados if not r["success"]]

        # Resumen general
        logger.info(f"\n✅ Tiendas exitosas: {len(exitosos)}/{len(resultados)}")
        logger.info(f"❌ Tiendas fallidas: {len(fallidos)}/{len(resultados)}")

        if exitosos:
            logger.info(f"\n🎯 TIENDAS EXITOSAS:")
            total_extraidos = 0
            total_cargados = 0
            tiempo_total = 0

            for r in exitosos:
                extraidos = r.get('registros_extraidos', 0)
                cargados = r.get('registros_cargados', 0)
                tiempo = r.get('tiempo_ejecucion', 0)

                total_extraidos += extraidos
                total_cargados += cargados
                tiempo_total += tiempo

                logger.info(f"   • {r['nombre']:20} | 📥 {extraidos:>6,} | 💾 {cargados:>6,} | ⏱️ {tiempo:>5.1f}s")

            logger.info("-" * 70)
            logger.info(f"   📊 TOTALES:           | 📥 {total_extraidos:>6,} | 💾 {total_cargados:>6,} | ⏱️ {tiempo_total:>5.1f}s")

            # Calcular métricas adicionales si están disponibles
            ventas_total = sum(r.get('estadisticas', {}).get('metricas_negocio', {}).get('venta_total', 0) for r in exitosos)
            facturas_total = sum(r.get('estadisticas', {}).get('metricas_negocio', {}).get('total_facturas', 0) for r in exitosos)

            if ventas_total > 0:
                logger.info(f"\n💰 MÉTRICAS DE NEGOCIO CONSOLIDADAS:")
                logger.info(f"   💵 Venta total: ${ventas_total:,.2f}")
                logger.info(f"   🧾 Facturas procesadas: {facturas_total:,}")
                if facturas_total > 0:
                    ticket_promedio = ventas_total / facturas_total
                    logger.info(f"   🎯 Ticket promedio general: ${ticket_promedio:.2f}")

        if fallidos:
            logger.info(f"\n❌ TIENDAS CON ERRORES:")
            for r in fallidos:
                logger.info(f"   • {r['nombre']:20} | ❌ {r['message']}")

        logger.info("\n" + "=" * 70)

    def guardar_reporte_consolidado(self, resultados: List[Dict[str, Any]], fecha_inicio: date, fecha_fin: date):
        """Guarda un reporte consolidado en archivo"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        archivo_reporte = f"reporte_ventas_multi_tienda_{fecha_inicio}_{fecha_fin}_{timestamp}.txt"

        with open(archivo_reporte, 'w', encoding='utf-8') as f:
            f.write("🏪 REPORTE ETL VENTAS MULTI-TIENDA\n")
            f.write("=" * 70 + "\n")
            f.write(f"📅 Período: {fecha_inicio} a {fecha_fin}\n")
            f.write(f"🕒 Generado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

            exitosos = [r for r in resultados if r["success"]]
            fallidos = [r for r in resultados if not r["success"]]

            f.write(f"📊 RESUMEN GENERAL:\n")
            f.write(f"   ✅ Tiendas exitosas: {len(exitosos)}/{len(resultados)}\n")
            f.write(f"   ❌ Tiendas fallidas: {len(fallidos)}/{len(resultados)}\n\n")

            if exitosos:
                f.write("🎯 DETALLE TIENDAS EXITOSAS:\n")
                f.write("-" * 70 + "\n")

                total_extraidos = 0
                total_cargados = 0

                for r in exitosos:
                    extraidos = r.get('registros_extraidos', 0)
                    cargados = r.get('registros_cargados', 0)
                    tiempo = r.get('tiempo_ejecucion', 0)

                    total_extraidos += extraidos
                    total_cargados += cargados

                    f.write(f"• {r['nombre']:25} | 📥 {extraidos:>7,} | 💾 {cargados:>7,} | ⏱️ {tiempo:>6.1f}s\n")

                f.write("-" * 70 + "\n")
                f.write(f"  TOTALES:{'':<18} | 📥 {total_extraidos:>7,} | 💾 {total_cargados:>7,}\n\n")

            if fallidos:
                f.write("❌ TIENDAS CON ERRORES:\n")
                f.write("-" * 70 + "\n")
                for r in fallidos:
                    f.write(f"• {r['nombre']:25} | ❌ {r['message']}\n")

        logger.info(f"📄 Reporte consolidado guardado en: {archivo_reporte}")


def main():
    """Función principal del script"""
    parser = argparse.ArgumentParser(description="ETL de Ventas Multi-Tienda - La Granja Mercado")
    parser.add_argument("--tienda", type=str, help="ID de tienda específica (ej: tienda_08)")
    parser.add_argument("--todas", action="store_true", help="Ejecutar para todas las tiendas activas")
    parser.add_argument("--fecha-inicio", help="Fecha inicial (YYYY-MM-DD)")
    parser.add_argument("--fecha-fin", help="Fecha final (YYYY-MM-DD). Por defecto: hoy")
    parser.add_argument("--limite", type=int, default=10000, help="Límite de registros por tienda (default: 10000)")
    parser.add_argument("--incluir-inactivas", action="store_true", help="Incluir tiendas inactivas")
    parser.add_argument("--mostrar-tiendas", action="store_true", help="Mostrar tiendas disponibles")

    args = parser.parse_args()

    if args.mostrar_tiendas:
        print("\n🏪 TIENDAS DISPONIBLES:")
        print("=" * 60)
        tiendas_activas = get_tiendas_activas()
        tiendas_inactivas = {k: v for k, v in TIENDAS_CONFIG.items() if k not in tiendas_activas}

        print(f"\n✅ ACTIVAS ({len(tiendas_activas)}):")
        for tienda_id, config in tiendas_activas.items():
            print(f"   {tienda_id}: {config.ubicacion_nombre}")

        if tiendas_inactivas:
            print(f"\n❌ INACTIVAS ({len(tiendas_inactivas)}):")
            for tienda_id, config in tiendas_inactivas.items():
                print(f"   {tienda_id}: {config.ubicacion_nombre}")

        print("=" * 60)
        return

    # Validar que se especifique fecha-inicio cuando no es --mostrar-tiendas
    if not args.fecha_inicio:
        print("❌ Error: --fecha-inicio es requerido")
        print("   Ejemplo: python3 etl_ventas_multi_tienda.py --todas --fecha-inicio 2025-01-02")
        sys.exit(1)

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

        # Validar rango no muy amplio
        dias_diferencia = (fecha_fin - fecha_inicio).days
        if dias_diferencia > 7:  # Máximo una semana para pruebas
            print(f"⚠️ Advertencia: Rango de fechas amplio ({dias_diferencia} días)")
            respuesta = input("¿Desea continuar? (y/N): ")
            if respuesta.lower() not in ['y', 'yes', 'si', 's']:
                print("❌ Proceso cancelado")
                sys.exit(0)

    except ValueError:
        print("❌ Error: Formato de fecha inválido. Use YYYY-MM-DD")
        sys.exit(1)

    # Ejecutar ETL
    etl_multi = VentasMultiTiendaETL()

    if args.tienda:
        # Ejecutar una tienda específica
        print(f"🚀 Iniciando ETL de Ventas para tienda específica")
        print(f"   🏪 Tienda: {args.tienda}")
        print(f"   📅 Período: {fecha_inicio} a {fecha_fin}")
        print("=" * 60)

        resultado = etl_multi.ejecutar_etl_tienda_ventas(
            tienda_id=args.tienda,
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
            limite_registros=args.limite
        )
        etl_multi.generar_resumen_ventas([resultado])

    elif args.todas:
        # Ejecutar todas las tiendas
        resultados = etl_multi.ejecutar_todas_las_tiendas_ventas(
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
            limite_registros=args.limite,
            solo_activas=not args.incluir_inactivas
        )
        etl_multi.generar_resumen_ventas(resultados)
        etl_multi.guardar_reporte_consolidado(resultados, fecha_inicio, fecha_fin)

    else:
        print("❌ Debe especificar --tienda ID o --todas")
        print("   Ejemplo: python3 etl_ventas_multi_tienda.py --todas --fecha-inicio 2025-01-02 --fecha-fin 2025-01-03")
        print("   Ejemplo: python3 etl_ventas_multi_tienda.py --tienda tienda_08 --fecha-inicio 2025-01-02")
        print("   Use --mostrar-tiendas para ver las tiendas disponibles")
        sys.exit(1)


if __name__ == "__main__":
    main()