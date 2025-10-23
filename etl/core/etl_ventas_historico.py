#!/usr/bin/env python3
"""
ETL de Ventas - Carga Histórica Masiva
Optimizado para procesar grandes volúmenes de datos históricos
Estrategia: procesamiento mes a mes con chunks y paralelización
"""

import argparse
import sys
from pathlib import Path
from typing import Dict, List, Any, Tuple
from datetime import datetime, date, timedelta
import logging
import time
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# Agregar el directorio actual al path
sys.path.append(str(Path(__file__).parent))

# Agregar el directorio backend al path para imports
sys.path.append(str(Path(__file__).parent.parent.parent / 'backend'))

from tiendas_config import TIENDAS_CONFIG, get_tiendas_activas
from etl_ventas import VentasETL

# Import email notifier (only in production)
try:
    from etl_notifier import send_etl_notification
    NOTIFICATIONS_AVAILABLE = True
except ImportError:
    NOTIFICATIONS_AVAILABLE = False

# Configurar logging más detallado para proceso masivo
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(threadName)s] - %(message)s'
)
logger = logging.getLogger('etl_ventas_historico')

class VentasETLHistorico:
    """Orquestador para carga histórica masiva de ventas"""

    def __init__(self, chunk_size: int = 1000000, max_workers: int = 3):
        self.chunk_size = chunk_size  # Registros por chunk
        self.max_workers = max_workers  # Máximo hilos concurrentes
        self.resultados = []
        self.stats_globales = {
            'inicio': None,
            'fin': None,
            'tiendas_procesadas': 0,
            'meses_procesados': 0,
            'registros_totales': 0,
            'errores_totales': 0,
            'tiempo_total': 0
        }
        self.lock = threading.Lock()

    def generar_periodos_mensuales(self, fecha_inicio: date, fecha_fin: date) -> List[Tuple[date, date]]:
        """
        Genera lista de períodos mensuales para procesamiento

        Returns:
            Lista de tuplas (fecha_inicio_mes, fecha_fin_mes)
        """
        periodos = []

        # Comenzar desde el primer día del mes de fecha_inicio
        current_date = fecha_inicio.replace(day=1)

        while current_date <= fecha_fin:
            # Calcular último día del mes
            if current_date.month == 12:
                next_month = current_date.replace(year=current_date.year + 1, month=1)
            else:
                next_month = current_date.replace(month=current_date.month + 1)

            fin_mes = (next_month - timedelta(days=1))

            # Ajustar el último período si se extiende más allá de fecha_fin
            if fin_mes > fecha_fin:
                fin_mes = fecha_fin

            periodos.append((current_date, fin_mes))

            # Avanzar al siguiente mes
            current_date = next_month

            # Evitar loop infinito
            if current_date > fecha_fin:
                break

        return periodos

    def procesar_tienda_periodo(self,
                               tienda_id: str,
                               fecha_inicio: date,
                               fecha_fin: date,
                               chunk_size: int = None) -> Dict[str, Any]:
        """
        Procesa una tienda para un período específico con chunks

        Args:
            tienda_id: ID de la tienda
            fecha_inicio: Fecha inicial del período
            fecha_fin: Fecha final del período
            chunk_size: Tamaño del chunk (usa self.chunk_size si es None)
        """

        chunk_size = chunk_size or self.chunk_size

        thread_name = threading.current_thread().name
        logger.info(f"[{thread_name}] 🔄 Procesando {tienda_id} - {fecha_inicio} a {fecha_fin}")

        try:
            config = TIENDAS_CONFIG[tienda_id]
            etl = VentasETL()

            inicio_proceso = time.time()

            # Procesar en chunks para evitar memoria excesiva
            resultado = etl.ejecutar_etl_ventas(
                tienda_id=tienda_id,
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
                limite_registros=chunk_size
            )

            fin_proceso = time.time()
            resultado['tiempo_proceso'] = fin_proceso - inicio_proceso
            resultado['chunk_size'] = chunk_size
            resultado['thread'] = thread_name

            # Actualizar estadísticas globales thread-safe
            with self.lock:
                if resultado['success']:
                    self.stats_globales['registros_totales'] += resultado.get('registros_cargados', 0)
                else:
                    self.stats_globales['errores_totales'] += 1

                logger.info(f"[{thread_name}] ✅ {tienda_id} completado: {resultado.get('registros_cargados', 0):,} registros en {resultado['tiempo_proceso']:.1f}s")

            return resultado

        except Exception as e:
            logger.error(f"[{thread_name}] ❌ Error procesando {tienda_id}: {str(e)}")
            return {
                'tienda_id': tienda_id,
                'success': False,
                'message': f"Error crítico: {str(e)}",
                'periodo': f"{fecha_inicio} - {fecha_fin}",
                'thread': thread_name
            }

    def ejecutar_carga_historica_completa(self,
                                        tiendas: List[str] = None,
                                        fecha_inicio: date = None,
                                        fecha_fin: date = None,
                                        procesar_paralelo: bool = True) -> Dict[str, Any]:
        """
        Ejecuta carga histórica completa para múltiples tiendas

        Args:
            tiendas: Lista de IDs de tiendas (None para todas las activas)
            fecha_inicio: Fecha inicial (None para último año)
            fecha_fin: Fecha final (None para hoy)
            procesar_paralelo: Si procesar tiendas en paralelo
        """

        # Configurar fechas por defecto
        if fecha_fin is None:
            fecha_fin = date.today() - timedelta(days=1)  # Hasta ayer

        if fecha_inicio is None:
            fecha_inicio = fecha_fin - timedelta(days=365)  # Último año

        # Configurar tiendas
        tiendas_activas = get_tiendas_activas()
        if tiendas is None:
            tiendas = list(tiendas_activas.keys())

        # Validar tiendas
        tiendas_validas = [t for t in tiendas if t in tiendas_activas]
        if not tiendas_validas:
            raise ValueError("No hay tiendas válidas para procesar")

        # Generar períodos mensuales
        periodos = self.generar_periodos_mensuales(fecha_inicio, fecha_fin)

        self.stats_globales['inicio'] = datetime.now()

        logger.info(f"🚀 INICIANDO CARGA HISTÓRICA MASIVA")
        logger.info(f"   📅 Período: {fecha_inicio} a {fecha_fin}")
        logger.info(f"   🏪 Tiendas: {len(tiendas_validas)} ({', '.join(tiendas_validas)})")
        logger.info(f"   📆 Períodos mensuales: {len(periodos)}")
        logger.info(f"   🔧 Chunk size: {self.chunk_size:,} registros")
        logger.info(f"   ⚡ Modo: {'Paralelo' if procesar_paralelo else 'Secuencial'}")
        logger.info(f"   👥 Max workers: {self.max_workers}")
        logger.info("="*80)

        # Crear lista de tareas (tienda, período)
        tareas = []
        for tienda_id in tiendas_validas:
            for inicio_periodo, fin_periodo in periodos:
                tareas.append((tienda_id, inicio_periodo, fin_periodo))

        logger.info(f"📋 Total tareas generadas: {len(tareas)}")

        # Procesar tareas
        if procesar_paralelo and self.max_workers > 1:
            self._procesar_paralelo(tareas)
        else:
            self._procesar_secuencial(tareas)

        # Finalizar estadísticas
        self.stats_globales['fin'] = datetime.now()
        self.stats_globales['tiempo_total'] = (self.stats_globales['fin'] - self.stats_globales['inicio']).total_seconds()
        self.stats_globales['tiendas_procesadas'] = len(tiendas_validas)
        self.stats_globales['meses_procesados'] = len(periodos)

        return self._generar_reporte_final()

    def _procesar_paralelo(self, tareas: List[Tuple[str, date, date]]):
        """Procesa tareas en paralelo usando ThreadPoolExecutor"""

        logger.info(f"⚡ Iniciando procesamiento paralelo con {self.max_workers} workers")

        with ThreadPoolExecutor(max_workers=self.max_workers, thread_name_prefix='VentasETL') as executor:
            # Enviar todas las tareas
            futures = {
                executor.submit(
                    self.procesar_tienda_periodo,
                    tienda_id,
                    fecha_inicio,
                    fecha_fin
                ): (tienda_id, fecha_inicio, fecha_fin)
                for tienda_id, fecha_inicio, fecha_fin in tareas
            }

            # Procesar resultados conforme se completen
            completadas = 0
            for future in as_completed(futures):
                completadas += 1
                tienda_id, fecha_inicio, fecha_fin = futures[future]

                try:
                    resultado = future.result()
                    self.resultados.append(resultado)

                    progreso = (completadas / len(tareas)) * 100
                    logger.info(f"📊 Progreso: {completadas}/{len(tareas)} ({progreso:.1f}%) - {tienda_id} {fecha_inicio.strftime('%Y-%m')}")

                except Exception as e:
                    logger.error(f"❌ Error obteniendo resultado de {tienda_id}: {str(e)}")
                    self.resultados.append({
                        'tienda_id': tienda_id,
                        'success': False,
                        'message': f"Error en future: {str(e)}",
                        'periodo': f"{fecha_inicio} - {fecha_fin}"
                    })

    def _procesar_secuencial(self, tareas: List[Tuple[str, date, date]]):
        """Procesa tareas secuencialmente"""

        logger.info(f"🔄 Iniciando procesamiento secuencial")

        for i, (tienda_id, fecha_inicio, fecha_fin) in enumerate(tareas, 1):
            logger.info(f"📊 Progreso: {i}/{len(tareas)} ({i/len(tareas)*100:.1f}%)")

            resultado = self.procesar_tienda_periodo(tienda_id, fecha_inicio, fecha_fin)
            self.resultados.append(resultado)

            # Pequeña pausa para no sobrecargar la BD
            if i < len(tareas):
                time.sleep(1)

    def _generar_reporte_final(self) -> Dict[str, Any]:
        """Genera reporte final del proceso completo"""

        exitosos = [r for r in self.resultados if r['success']]
        fallidos = [r for r in self.resultados if not r['success']]

        # Calcular estadísticas
        total_registros = sum(r.get('registros_cargados', 0) for r in exitosos)
        tiempo_promedio = sum(r.get('tiempo_proceso', 0) for r in exitosos) / max(len(exitosos), 1)

        # Estadísticas por tienda
        stats_tiendas = {}
        for resultado in exitosos:
            tienda = resultado['tienda_id']
            if tienda not in stats_tiendas:
                stats_tiendas[tienda] = {
                    'periodos_exitosos': 0,
                    'registros_total': 0,
                    'tiempo_total': 0
                }

            stats_tiendas[tienda]['periodos_exitosos'] += 1
            stats_tiendas[tienda]['registros_total'] += resultado.get('registros_cargados', 0)
            stats_tiendas[tienda]['tiempo_total'] += resultado.get('tiempo_proceso', 0)

        # Agregar errores por tienda para el reporte
        errores_tiendas = {}
        for resultado in fallidos:
            tienda = resultado['tienda_id']
            if tienda not in errores_tiendas:
                errores_tiendas[tienda] = []
            errores_tiendas[tienda].append({
                'periodo': resultado.get('periodo', 'N/A'),
                'mensaje': resultado['message']
            })

        # Send email notification (only in production)
        if NOTIFICATIONS_AVAILABLE:
            try:
                # Convert stats_tiendas to the format expected by send_etl_notification
                tiendas_results = []

                # Get all unique tiendas from both successful and failed results
                all_tiendas = set(stats_tiendas.keys()) | set(errores_tiendas.keys())

                for tienda_id in all_tiendas:
                    config = TIENDAS_CONFIG.get(tienda_id)
                    nombre = config.ubicacion_nombre if config else tienda_id

                    # Check if this tienda has any failures
                    has_failures = tienda_id in errores_tiendas
                    stats = stats_tiendas.get(tienda_id, {})

                    result = {
                        'tienda_id': tienda_id,
                        'nombre': nombre,
                        'success': not has_failures and stats.get('periodos_exitosos', 0) > 0,
                        'registros': stats.get('registros_total', 0),
                        'tiempo_proceso': stats.get('tiempo_total', 0),
                    }

                    # Add error message if there are failures
                    if has_failures:
                        errores = errores_tiendas[tienda_id]
                        result['message'] = f"{len(errores)} período(s) fallido(s): " + "; ".join([e['periodo'] for e in errores[:3]])
                    else:
                        result['message'] = f"{stats.get('periodos_exitosos', 0)} período(s) procesado(s)"

                    tiendas_results.append(result)

                # Calculate global summary
                global_summary = {
                    'Ejecución': 'Paralela' if self.max_workers > 1 else 'Secuencial',
                    'Total registros': f"{total_registros:,}",
                    'Velocidad promedio': f"{total_registros / max(self.stats_globales['tiempo_total'], 1):.0f} reg/s",
                    'Tiendas procesadas': f"{len(stats_tiendas)}",
                    'Períodos totales': f"{len(exitosos)}"
                }

                send_etl_notification(
                    etl_name='ETL Ventas Históricas',
                    etl_type='ventas',
                    start_time=self.stats_globales['inicio'],
                    end_time=self.stats_globales['fin'],
                    tiendas_results=tiendas_results,
                    global_summary=global_summary
                )
                logger.info("📧 Email notification sent successfully")
            except Exception as e:
                logger.error(f"Error sending email notification: {e}")

        return {
            'success': len(fallidos) == 0,
            'estadisticas_globales': self.stats_globales,
            'resumen': {
                'total_tareas': len(self.resultados),
                'exitosas': len(exitosos),
                'fallidas': len(fallidos),
                'tasa_exito': len(exitosos) / max(len(self.resultados), 1) * 100,
                'registros_totales': total_registros,
                'tiempo_promedio_tarea': tiempo_promedio,
                'registros_por_segundo': total_registros / max(self.stats_globales['tiempo_total'], 1)
            },
            'estadisticas_tiendas': stats_tiendas,
            'errores': [{'tienda': r['tienda_id'], 'periodo': r.get('periodo'), 'mensaje': r['message']} for r in fallidos]
        }

    def imprimir_reporte_final(self, reporte: Dict[str, Any]):
        """Imprime reporte final formateado"""

        print(f"\n🎉 REPORTE FINAL - CARGA HISTÓRICA MASIVA")
        print("="*80)
        print(f"⏰ Inicio: {self.stats_globales['inicio'].strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"⏰ Fin: {self.stats_globales['fin'].strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"⏱️ Duración total: {self.stats_globales['tiempo_total']:.1f} segundos ({self.stats_globales['tiempo_total']/3600:.2f} horas)")
        print(f"")
        print(f"📊 RESUMEN GENERAL:")
        print(f"   🏪 Tiendas procesadas: {self.stats_globales['tiendas_procesadas']}")
        print(f"   📆 Meses procesados: {self.stats_globales['meses_procesados']}")
        print(f"   ✅ Tareas exitosas: {reporte['resumen']['exitosas']}/{reporte['resumen']['total_tareas']} ({reporte['resumen']['tasa_exito']:.1f}%)")
        print(f"   📦 Registros totales: {reporte['resumen']['registros_totales']:,}")
        print(f"   ⚡ Velocidad: {reporte['resumen']['registros_por_segundo']:.0f} registros/segundo")
        print(f"")

        if reporte['estadisticas_tiendas']:
            print(f"🏪 ESTADÍSTICAS POR TIENDA:")
            print("-"*80)
            for tienda, stats in reporte['estadisticas_tiendas'].items():
                config = TIENDAS_CONFIG.get(tienda, {})
                nombre = getattr(config, 'ubicacion_nombre', tienda)
                print(f"   {tienda} ({nombre}):")
                print(f"      📅 Períodos: {stats['periodos_exitosos']}")
                print(f"      📦 Registros: {stats['registros_total']:,}")
                print(f"      ⏱️ Tiempo: {stats['tiempo_total']:.1f}s")
                print(f"      ⚡ Velocidad: {stats['registros_total']/max(stats['tiempo_total'], 1):.0f} reg/s")
            print()

        if reporte['errores']:
            print(f"❌ ERRORES ({len(reporte['errores'])}):")
            print("-"*80)
            for error in reporte['errores']:
                print(f"   {error['tienda']} - {error['periodo']}: {error['mensaje']}")
            print()

        print("="*80)


def main():
    """Función principal del script"""

    parser = argparse.ArgumentParser(description="ETL de Ventas - Carga Histórica Masiva")
    parser.add_argument("--tiendas", nargs="+", help="IDs de tiendas específicas (ej: tienda_08 tienda_01)")
    parser.add_argument("--fecha-inicio", help="Fecha inicial (YYYY-MM-DD)")
    parser.add_argument("--fecha-fin", help="Fecha final (YYYY-MM-DD)")
    parser.add_argument("--chunk-size", type=int, default=1000000, help="Tamaño de chunk para extraer por período (default: 1000000)")
    parser.add_argument("--max-workers", type=int, default=3, help="Máximo hilos paralelos (default: 3)")
    parser.add_argument("--secuencial", action="store_true", help="Procesar secuencialmente (no paralelo)")
    parser.add_argument("--modo-test", action="store_true", help="Modo test: solo 1 mes de 1 tienda")
    parser.add_argument("--mostrar-tiendas", action="store_true", help="Mostrar tiendas disponibles")

    args = parser.parse_args()

    if args.mostrar_tiendas:
        print("\n🏪 TIENDAS DISPONIBLES:")
        print("="*50)
        tiendas_activas = get_tiendas_activas()
        for tienda_id, config in tiendas_activas.items():
            print(f"   {tienda_id}: {config.ubicacion_nombre}")
        print("="*50)
        return

    # Configurar fechas
    fecha_inicio = None
    fecha_fin = None

    if args.fecha_inicio:
        try:
            fecha_inicio = datetime.strptime(args.fecha_inicio, "%Y-%m-%d").date()
        except ValueError:
            print("❌ Error: Formato de fecha inicial inválido. Use YYYY-MM-DD")
            sys.exit(1)

    if args.fecha_fin:
        try:
            fecha_fin = datetime.strptime(args.fecha_fin, "%Y-%m-%d").date()
        except ValueError:
            print("❌ Error: Formato de fecha final inválido. Use YYYY-MM-DD")
            sys.exit(1)

    # Modo test
    if args.modo_test:
        print("🧪 MODO TEST ACTIVADO")
        if not fecha_inicio:
            fecha_inicio = date.today().replace(day=1) - timedelta(days=32)  # Mes pasado
        fecha_fin = fecha_inicio.replace(day=1) + timedelta(days=31)  # Solo ese mes
        if fecha_fin > date.today():
            fecha_fin = date.today() - timedelta(days=1)

        tiendas_test = args.tiendas[:1] if args.tiendas else ['tienda_08']  # Solo BOSQUE por defecto
        args.tiendas = tiendas_test
        args.chunk_size = min(args.chunk_size, 10000)  # Limitar chunk en test

        print(f"   🏪 Tienda: {args.tiendas[0]}")
        print(f"   📅 Período: {fecha_inicio} a {fecha_fin}")

    # Validaciones de seguridad
    if fecha_inicio and fecha_fin:
        if fecha_inicio > fecha_fin:
            print("❌ Error: La fecha de inicio no puede ser mayor que la fecha final")
            sys.exit(1)

        # Advertir sobre períodos muy largos
        dias_diferencia = (fecha_fin - fecha_inicio).days
        if dias_diferencia > 730 and not args.modo_test:  # 2 años
            print(f"⚠️ ADVERTENCIA: Período muy extenso ({dias_diferencia} días)")
            print("   Esto podría generar millones de registros y tomar horas/días")
            # No pedimos confirmación cuando se ejecuta desde el scheduler
            # La confirmación debe hacerse en el UI antes de ejecutar

    # Ejecutar ETL histórico
    etl_historico = VentasETLHistorico(
        chunk_size=args.chunk_size,
        max_workers=args.max_workers
    )

    try:
        reporte = etl_historico.ejecutar_carga_historica_completa(
            tiendas=args.tiendas,
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
            procesar_paralelo=not args.secuencial
        )

        # Mostrar reporte
        etl_historico.imprimir_reporte_final(reporte)

        # Guardar reporte detallado
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        archivo_reporte = f"reporte_ventas_historico_{timestamp}.json"

        with open(archivo_reporte, 'w', encoding='utf-8') as f:
            json.dump(reporte, f, indent=2, default=str, ensure_ascii=False)

        print(f"📄 Reporte detallado guardado en: {archivo_reporte}")

        # Código de salida
        sys.exit(0 if reporte['success'] else 1)

    except Exception as e:
        logger.error(f"❌ Error crítico: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()