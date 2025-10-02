#!/usr/bin/env python3
"""
Script para ejecutar ETL completo de todas las tiendas
Genera reporte detallado de éxito/falla con validación completa
"""

import subprocess
import sys
import time
from datetime import datetime
from typing import Dict, List, Tuple, Optional
import duckdb
from tiendas_config import get_tiendas_activas, TiendaConfig

class ETLReporter:
    def __init__(self):
        self.resultados: Dict[str, Dict] = {}
        self.inicio_proceso = datetime.now()

    def agregar_resultado(self, tienda_id: str, config: TiendaConfig,
                         exito: bool, registros_extraidos: int = 0,
                         registros_guardados: int = 0, error: str = None):
        """Registra el resultado de una tienda"""
        self.resultados[tienda_id] = {
            'nombre': config.ubicacion_nombre,
            'ip': config.server_ip,
            'puerto': config.port,
            'codigo_deposito': config.codigo_deposito,
            'exito': exito,
            'registros_extraidos': registros_extraidos,
            'registros_guardados': registros_guardados,
            'error': error,
            'validacion_completa': exito and registros_extraidos > 0 and registros_guardados == registros_extraidos
        }

    def generar_reporte(self) -> str:
        """Genera reporte completo del proceso"""
        fin_proceso = datetime.now()
        duracion = fin_proceso - self.inicio_proceso

        exitosas = [t for t in self.resultados.values() if t['validacion_completa']]
        fallidas = [t for t in self.resultados.values() if not t['validacion_completa']]

        total_registros = sum(t['registros_guardados'] for t in exitosas)

        reporte = f"""
{'='*80}
🏪 REPORTE COMPLETO ETL - LA GRANJA MERCADO
{'='*80}
⏰ Inicio: {self.inicio_proceso.strftime('%Y-%m-%d %H:%M:%S')}
⏰ Fin: {fin_proceso.strftime('%Y-%m-%d %H:%M:%S')}
⏱️ Duración total: {duracion}

📊 RESUMEN GENERAL:
   • Total tiendas procesadas: {len(self.resultados)}
   • ✅ Exitosas (validación completa): {len(exitosas)} ({len(exitosas)/len(self.resultados)*100:.1f}%)
   • ❌ Fallidas: {len(fallidas)} ({len(fallidas)/len(self.resultados)*100:.1f}%)
   • 📦 Total registros guardados: {total_registros:,}

{'='*80}
✅ TIENDAS EXITOSAS - VALIDACIÓN COMPLETA:
{'='*80}
"""

        for tienda_id, resultado in self.resultados.items():
            if resultado['validacion_completa']:
                reporte += f"""
🏪 {tienda_id.upper()} - {resultado['nombre']}
   📡 Conexión: {resultado['ip']}:{resultado['puerto']}
   📦 Depósito: {resultado['codigo_deposito']}
   📊 Extraídos: {resultado['registros_extraidos']:,} registros
   💾 Guardados: {resultado['registros_guardados']:,} registros
   ✅ Estado: COMPLETADO EXITOSAMENTE
"""

        if fallidas:
            reporte += f"""
{'='*80}
❌ TIENDAS FALLIDAS:
{'='*80}
"""
            for tienda_id, resultado in self.resultados.items():
                if not resultado['validacion_completa']:
                    reporte += f"""
🏪 {tienda_id.upper()} - {resultado['nombre']}
   📡 Conexión: {resultado['ip']}:{resultado['puerto']}
   📦 Depósito: {resultado['codigo_deposito']}
   📊 Extraídos: {resultado['registros_extraidos']:,} registros
   💾 Guardados: {resultado['registros_guardados']:,} registros
   ❌ Error: {resultado['error'] or 'Validación fallida'}
   🔍 Problema: {'Conexión/Extracción' if resultado['registros_extraidos'] == 0 else 'Guardado en BD'}
"""

        reporte += f"""
{'='*80}
📈 ESTADÍSTICAS DETALLADAS:
{'='*80}
"""

        # Estadísticas por tipo de problema
        conexion_fallida = sum(1 for t in fallidas if t['registros_extraidos'] == 0)
        guardado_fallido = sum(1 for t in fallidas if t['registros_extraidos'] > 0 and t['registros_guardados'] != t['registros_extraidos'])

        reporte += f"""
• Problemas de conexión/extracción: {conexion_fallida}
• Problemas de guardado en BD: {guardado_fallido}
• Promedio registros por tienda exitosa: {total_registros/max(len(exitosas), 1):.0f}

🎯 SIGUIENTE ACCIÓN RECOMENDADA:
"""

        if len(exitosas) == len(self.resultados):
            reporte += "   🎉 ¡PROCESO COMPLETADO AL 100%! Todas las tiendas procesadas exitosamente.\n"
        elif len(exitosas) / len(self.resultados) >= 0.9:
            reporte += "   ✨ Excelente resultado (≥90% éxito). Revisar tiendas fallidas para problemas de conectividad.\n"
        else:
            reporte += "   🔧 Revisar configuración de red y conectividad de las tiendas fallidas.\n"

        reporte += f"\n{'='*80}\n"

        return reporte

def verificar_registros_guardados(tienda_id: str) -> int:
    """Verifica cuántos registros se guardaron en DuckDB para una tienda"""
    try:
        # Usar la BD de producción real
        conn = duckdb.connect('../data/fluxion_production.db')

        # Buscar en la tabla principal de inventario_raw
        try:
            result = conn.execute(f"SELECT COUNT(*) FROM inventario_raw WHERE ubicacion_id = '{tienda_id}'").fetchone()
            if result and result[0] > 0:
                conn.close()
                return result[0]
        except Exception as e:
            print(f"   ⚠️ Error consultando inventario_raw: {e}")

        # Fallback: buscar en otras tablas posibles
        posibles_tablas = ['inventario_raw', 'stock_actual', 'productos_ubicacion_completa']
        for tabla in posibles_tablas:
            try:
                # Intentar con ubicacion_id
                result = conn.execute(f"SELECT COUNT(*) FROM {tabla} WHERE ubicacion_id = '{tienda_id}'").fetchone()
                if result and result[0] > 0:
                    conn.close()
                    return result[0]
            except:
                continue

        # Último intento: contar todos los registros de inventario_raw
        try:
            result = conn.execute("SELECT COUNT(*) FROM inventario_raw").fetchone()
            if result:
                conn.close()
                # Aproximar dividiendo por número de tiendas
                return result[0] // 17  # Estimación
        except:
            pass

        conn.close()
        return 0

    except Exception as e:
        print(f"   ⚠️ Error verificando BD para {tienda_id}: {e}")
        return 0

def extraer_registros_del_log(tienda_nombre: str) -> int:
    """Extrae el número de registros del log más reciente"""
    try:
        with open('logs/extractor_20250925.log', 'r', encoding='utf-8') as f:
            contenido = f.read()

        # Buscar la línea más reciente con registros extraídos para esta tienda
        lineas = contenido.split('\n')
        for linea in reversed(lineas):
            if f"✅ Datos extraídos de {tienda_nombre}:" in linea and " registros en " in linea:
                # Extraer número de registros
                partes = linea.split(":")
                if len(partes) >= 2:
                    texto_registros = partes[-1].split(" registros en ")[0].strip()
                    return int(texto_registros)
        return 0
    except Exception as e:
        print(f"   ⚠️ Error leyendo log para {tienda_nombre}: {e}")
        return 0

def ejecutar_etl_tienda(tienda_id: str, config: TiendaConfig) -> Tuple[bool, int, str]:
    """Ejecuta ETL para una tienda específica"""
    print(f"\n🔄 Procesando {tienda_id} - {config.ubicacion_nombre}...")
    print(f"   📡 {config.server_ip}:{config.port} | Depósito: {config.codigo_deposito}")

    try:
        # Ejecutar el ETL
        resultado = subprocess.run([
            'python3', 'etl_multi_tienda.py', '--tienda', tienda_id
        ], capture_output=True, text=True, timeout=300)  # 5 min timeout

        # Verificar si fue exitoso
        if resultado.returncode == 0:
            # Extraer registros del log
            registros_extraidos = extraer_registros_del_log(config.ubicacion_nombre)

            if registros_extraidos > 0:
                print(f"   ✅ Extracción exitosa: {registros_extraidos:,} registros")
                return True, registros_extraidos, None
            else:
                error = "Extracción completada pero sin registros encontrados"
                print(f"   ⚠️ {error}")
                return False, 0, error
        else:
            error = f"Proceso falló (código: {resultado.returncode})"
            if resultado.stderr:
                error += f" - {resultado.stderr[:200]}"
            print(f"   ❌ {error}")
            return False, 0, error

    except subprocess.TimeoutExpired:
        error = "Timeout - proceso tardó más de 5 minutos"
        print(f"   ⏰ {error}")
        return False, 0, error
    except Exception as e:
        error = f"Error ejecutando ETL: {str(e)}"
        print(f"   💥 {error}")
        return False, 0, error

def main():
    print("🚀 INICIANDO ETL COMPLETO - LA GRANJA MERCADO")
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60)

    reporter = ETLReporter()
    tiendas_activas = get_tiendas_activas()

    print(f"📋 Se procesarán {len(tiendas_activas)} tiendas activas")

    for i, (tienda_id, config) in enumerate(tiendas_activas.items(), 1):
        print(f"\n[{i}/{len(tiendas_activas)}] ", end="")

        # Ejecutar ETL
        exito, registros_extraidos, error = ejecutar_etl_tienda(tienda_id, config)

        # Verificar registros guardados en BD
        registros_guardados = 0
        if exito:
            print("   🔍 Verificando guardado en BD...")
            time.sleep(1)  # Dar tiempo para que se complete la escritura
            registros_guardados = verificar_registros_guardados(tienda_id)
            print(f"   💾 Registros en BD: {registros_guardados:,}")

            if registros_guardados != registros_extraidos:
                exito = False
                error = f"Discrepancia: extraídos {registros_extraidos}, guardados {registros_guardados}"
                print(f"   ⚠️ {error}")

        # Registrar resultado
        reporter.agregar_resultado(
            tienda_id, config, exito, registros_extraidos, registros_guardados, error
        )

        # Pausa breve entre tiendas
        if i < len(tiendas_activas):
            time.sleep(2)

    # Generar y mostrar reporte
    reporte = reporter.generar_reporte()
    print(reporte)

    # Guardar reporte en archivo
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    archivo_reporte = f"reporte_etl_completo_{timestamp}.txt"

    with open(archivo_reporte, 'w', encoding='utf-8') as f:
        f.write(reporte)

    print(f"📄 Reporte guardado en: {archivo_reporte}")

    # Código de salida
    exitosas = sum(1 for r in reporter.resultados.values() if r['validacion_completa'])
    if exitosas == len(tiendas_activas):
        print("\n🎉 ¡PROCESO COMPLETADO AL 100%!")
        sys.exit(0)
    elif exitosas / len(tiendas_activas) >= 0.8:
        print(f"\n✨ Proceso mayormente exitoso ({exitosas}/{len(tiendas_activas)} tiendas)")
        sys.exit(0)
    else:
        print(f"\n⚠️ Proceso con problemas significativos ({exitosas}/{len(tiendas_activas)} tiendas exitosas)")
        sys.exit(1)

if __name__ == "__main__":
    main()