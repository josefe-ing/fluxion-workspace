#!/usr/bin/env python3
"""
Script de Verificación de Conectividad para Tiendas
Verifica IP, puerto y conexión a BD antes de ejecutar ETLs
"""

import socket
import sys
import time
import threading
from datetime import datetime
from typing import Dict, List, Tuple, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
import pyodbc

# Agregar el directorio actual al path
sys.path.append('.')
from tiendas_config import TIENDAS_CONFIG, TiendaConfig

class ConectividadChecker:
    """Verificador de conectividad para tiendas"""

    def __init__(self, timeout: int = 5, max_workers: int = 10):
        self.timeout = timeout
        self.max_workers = max_workers
        self.resultados = []

    def ping_ip(self, ip: str) -> Tuple[bool, float]:
        """
        Verifica si una IP responde (simulación de ping con socket)
        Returns: (is_reachable, response_time)
        """
        start_time = time.time()
        try:
            # Intentar conectar al puerto 80 para verificar que la IP existe
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            result = sock.connect_ex((ip, 80))
            sock.close()

            response_time = (time.time() - start_time) * 1000  # ms

            # Si conecta o falla por puerto cerrado (pero IP alcanzable)
            return result in [0, 111, 61], response_time

        except (socket.gaierror, socket.timeout, OSError):
            response_time = (time.time() - start_time) * 1000
            return False, response_time

    def test_port(self, ip: str, port: int) -> Tuple[bool, float]:
        """
        Verifica si un puerto específico está abierto
        Returns: (is_open, response_time)
        """
        start_time = time.time()
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            result = sock.connect_ex((ip, port))
            sock.close()

            response_time = (time.time() - start_time) * 1000  # ms
            return result == 0, response_time

        except (socket.gaierror, socket.timeout, OSError):
            response_time = (time.time() - start_time) * 1000
            return False, response_time

    def test_database_connection(self, config: TiendaConfig) -> Tuple[bool, str, float]:
        """
        Verifica conexión a base de datos SQL Server
        Returns: (success, message, response_time)
        """
        start_time = time.time()
        try:
            # Construir connection string
            conn_string = (
                f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                f"SERVER={config.server_ip},{config.port};"
                f"DATABASE={config.database_name};"
                f"UID={config.username};"
                f"PWD={config.password};"
                f"Timeout={self.timeout};"
            )

            # Intentar conexión
            conn = pyodbc.connect(conn_string)

            # Ejecutar query simple para verificar que funciona
            cursor = conn.cursor()
            cursor.execute("SELECT 1 as test")
            result = cursor.fetchone()

            cursor.close()
            conn.close()

            response_time = (time.time() - start_time) * 1000

            if result and result[0] == 1:
                return True, "Conexión exitosa", response_time
            else:
                return False, "Query falló", response_time

        except pyodbc.Error as e:
            response_time = (time.time() - start_time) * 1000
            error_msg = str(e).split(']')[-1].strip() if ']' in str(e) else str(e)
            return False, f"Error SQL: {error_msg[:50]}...", response_time

        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            return False, f"Error: {str(e)[:50]}...", response_time

    def verificar_tienda(self, tienda_id: str, config: TiendaConfig) -> Dict[str, Any]:
        """
        Verifica conectividad completa de una tienda
        """
        thread_name = threading.current_thread().name
        print(f"[{thread_name}] 🔍 Verificando {tienda_id} ({config.ubicacion_nombre})...")

        resultado = {
            'tienda_id': tienda_id,
            'nombre': config.ubicacion_nombre,
            'ip': config.server_ip,
            'puerto': config.port,
            'activo': config.activo,
            'thread': thread_name
        }

        # 1. Verificar si está configurado como activo
        if not config.activo:
            resultado.update({
                'ping_ok': False,
                'ping_time': 0,
                'puerto_ok': False,
                'puerto_time': 0,
                'bd_ok': False,
                'bd_time': 0,
                'bd_mensaje': 'Tienda inactiva',
                'estado_general': '⚪ INACTIVA',
                'observacion': 'Configurada como inactiva'
            })
            return resultado

        # 2. Verificar IP (ping)
        ping_ok, ping_time = self.ping_ip(config.server_ip)
        resultado.update({
            'ping_ok': ping_ok,
            'ping_time': ping_time
        })

        # 3. Verificar puerto
        puerto_ok, puerto_time = self.test_port(config.server_ip, config.port)
        resultado.update({
            'puerto_ok': puerto_ok,
            'puerto_time': puerto_time
        })

        # 4. Verificar conexión a BD (solo si puerto está abierto)
        if puerto_ok:
            bd_ok, bd_mensaje, bd_time = self.test_database_connection(config)
            resultado.update({
                'bd_ok': bd_ok,
                'bd_time': bd_time,
                'bd_mensaje': bd_mensaje
            })
        else:
            resultado.update({
                'bd_ok': False,
                'bd_time': 0,
                'bd_mensaje': 'Puerto cerrado'
            })

        # 5. Determinar estado general
        if resultado['bd_ok']:
            resultado['estado_general'] = '✅ CONECTADA'
            resultado['observacion'] = f"Todo OK ({resultado['bd_time']:.0f}ms)"
        elif resultado['puerto_ok']:
            resultado['estado_general'] = '🟡 PUERTO OK'
            resultado['observacion'] = f"Puerto abierto pero BD falla: {resultado['bd_mensaje']}"
        elif resultado['ping_ok']:
            resultado['estado_general'] = '🟠 PING OK'
            resultado['observacion'] = f"IP alcanzable pero puerto {config.port} cerrado"
        else:
            resultado['estado_general'] = '❌ NO ALCANZABLE'
            resultado['observacion'] = f"IP {config.server_ip} no responde"

        return resultado

    def verificar_todas_tiendas(self, paralelo: bool = True) -> List[Dict[str, Any]]:
        """
        Verifica conectividad de todas las tiendas configuradas
        """
        print(f"🔍 VERIFICACIÓN DE CONECTIVIDAD - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*100)
        print(f"Modo: {'Paralelo' if paralelo else 'Secuencial'} | Timeout: {self.timeout}s | Workers: {self.max_workers}")
        print()

        # Obtener tiendas a verificar
        tiendas = TIENDAS_CONFIG

        if paralelo and self.max_workers > 1:
            # Procesamiento paralelo
            with ThreadPoolExecutor(max_workers=self.max_workers, thread_name_prefix='Check') as executor:
                futures = {
                    executor.submit(self.verificar_tienda, tienda_id, config): (tienda_id, config)
                    for tienda_id, config in tiendas.items()
                }

                for future in as_completed(futures):
                    resultado = future.result()
                    self.resultados.append(resultado)
        else:
            # Procesamiento secuencial
            for tienda_id, config in tiendas.items():
                resultado = self.verificar_tienda(tienda_id, config)
                self.resultados.append(resultado)

        # Ordenar por estado (conectadas primero) y luego por nombre
        self.resultados.sort(key=lambda x: (
            0 if x['estado_general'].startswith('✅') else
            1 if x['estado_general'].startswith('🟡') else
            2 if x['estado_general'].startswith('🟠') else
            3 if x['estado_general'].startswith('❌') else 4,
            x['nombre']
        ))

        return self.resultados

    def imprimir_reporte(self):
        """Imprime reporte formateado de conectividad"""
        if not self.resultados:
            print("❌ No hay resultados para mostrar")
            return

        print("\n📊 REPORTE DE CONECTIVIDAD")
        print("="*100)
        print(f"{'Tienda':<12} {'Nombre':<15} {'IP':<15} {'Puerto':<6} {'Estado':<15} {'Observación':<25}")
        print("-"*100)

        # Contadores
        total = len(self.resultados)
        conectadas = 0
        parciales = 0
        no_conectadas = 0
        inactivas = 0

        for r in self.resultados:
            print(f"{r['tienda_id']:<12} {r['nombre']:<15} {r['ip']:<15} {r['puerto']:<6} {r['estado_general']:<15} {r['observacion']:<25}")

            # Contar estados
            if r['estado_general'].startswith('✅'):
                conectadas += 1
            elif r['estado_general'].startswith('🟡') or r['estado_general'].startswith('🟠'):
                parciales += 1
            elif r['estado_general'].startswith('⚪'):
                inactivas += 1
            else:
                no_conectadas += 1

        print("-"*100)
        print(f"📈 RESUMEN:")
        print(f"   ✅ Conectadas: {conectadas}/{total} ({conectadas/total*100:.1f}%)")
        print(f"   🟡 Parciales: {parciales}/{total} ({parciales/total*100:.1f}%)")
        print(f"   ❌ No conectadas: {no_conectadas}/{total} ({no_conectadas/total*100:.1f}%)")
        print(f"   ⚪ Inactivas: {inactivas}/{total} ({inactivas/total*100:.1f}%)")

        # Recomendaciones
        print(f"\n💡 RECOMENDACIONES:")
        if conectadas == total - inactivas:
            print(f"   🎉 ¡Todas las tiendas activas están conectadas! ETL listo para ejecutar.")
        else:
            tiendas_problema = [r for r in self.resultados if not r['bd_ok'] and r['activo']]
            if tiendas_problema:
                print(f"   ⚠️  Revisar conectividad antes de ETL:")
                for t in tiendas_problema[:5]:  # Mostrar solo primeras 5
                    print(f"      - {t['tienda_id']}: {t['observacion']}")

    def get_tiendas_conectadas(self) -> List[str]:
        """Retorna lista de IDs de tiendas que están completamente conectadas"""
        return [r['tienda_id'] for r in self.resultados if r['bd_ok']]

    def get_tiendas_con_problemas(self) -> List[Dict[str, Any]]:
        """Retorna tiendas activas con problemas de conectividad"""
        return [r for r in self.resultados if not r['bd_ok'] and r['activo']]


def main():
    """Función principal"""
    import argparse

    parser = argparse.ArgumentParser(description="Verificador de Conectividad de Tiendas")
    parser.add_argument("--timeout", type=int, default=5, help="Timeout en segundos (default: 5)")
    parser.add_argument("--workers", type=int, default=10, help="Número de workers paralelos (default: 10)")
    parser.add_argument("--secuencial", action="store_true", help="Procesar secuencialmente")
    parser.add_argument("--solo-activas", action="store_true", help="Solo verificar tiendas activas")

    args = parser.parse_args()

    # Crear verificador
    checker = ConectividadChecker(timeout=args.timeout, max_workers=args.workers)

    try:
        # Ejecutar verificación
        resultados = checker.verificar_todas_tiendas(paralelo=not args.secuencial)

        # Mostrar reporte
        checker.imprimir_reporte()

        # Mostrar comando sugerido
        tiendas_ok = checker.get_tiendas_conectadas()
        if tiendas_ok:
            print(f"\n🚀 COMANDO ETL SUGERIDO:")
            tiendas_str = " ".join(tiendas_ok[:10])  # Primeras 10 tiendas
            print(f"python3 core/etl_ventas_historico.py --fecha-inicio YYYY-MM-DD --fecha-fin YYYY-MM-DD --tiendas {tiendas_str} --secuencial")

    except KeyboardInterrupt:
        print("\n⚠️ Verificación interrumpida por el usuario")
    except Exception as e:
        print(f"\n❌ Error durante verificación: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()