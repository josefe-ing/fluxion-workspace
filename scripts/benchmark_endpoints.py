#!/usr/bin/env python3
"""
Benchmark de endpoints de Fluxion en producción.
Mide tiempos de respuesta reales para identificar cuellos de botella.
"""

import requests
import time
import json
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import sys

# Configuración
API_BASE_URL = "https://api.fluxionia.co"
TIMEOUT = 120  # 2 minutos timeout
NUM_ITERATIONS = 1  # Número de veces que se prueba cada endpoint

# Endpoints a probar (organizados por módulo)
ENDPOINTS = {
    "Health & Auth": [
        {"method": "GET", "url": "/", "name": "Health Check"},
    ],

    "Inventarios": [
        {"method": "GET", "url": "/api/ubicaciones/summary-regional", "name": "Summary Regional"},
        {"method": "GET", "url": "/api/stock?page=1&page_size=50", "name": "Stock List (paginated)"},
        {"method": "GET", "url": "/api/inventario/oportunidades-cedi", "name": "Oportunidades CEDI"},
        {"method": "GET", "url": "/api/inventario/expansion-catalogo", "name": "Expansión Catálogo"},
    ],

    "Ventas": [
        {"method": "GET", "url": "/api/ventas/summary", "name": "Ventas Summary"},
        {"method": "GET", "url": "/api/ventas/summary-regional?dias=30", "name": "Ventas Summary Regional"},
        {"method": "GET", "url": "/api/ventas/detail?ubicacion_id=tienda_08&page=1&page_size=50", "name": "Ventas Detail - Bosque"},
        {"method": "GET", "url": "/api/ventas/categorias", "name": "Categorías"},
    ],

    "Productos": [
        {"method": "GET", "url": "/api/productos?page=1&limit=50", "name": "Productos List"},
        {"method": "GET", "url": "/api/categorias", "name": "Categorías List"},
        {"method": "GET", "url": "/api/productos/analisis-maestro/resumen", "name": "Análisis Maestro Resumen"},
    ],

    "Centro Comando Ventas (Bosque)": [
        {"method": "GET", "url": "/api/ventas/agotados-visuales/tienda_08", "name": "Agotados Visuales - Bosque"},
        {"method": "GET", "url": "/api/ventas/agotados-visuales/tienda_08/count", "name": "Agotados Count - Bosque"},
        {"method": "GET", "url": "/api/ventas/ventas-perdidas-v3/tienda_08", "name": "Ventas Perdidas V3 - Bosque"},
    ],

    "Análisis Producto (ejemplo con producto top)": [
        {"method": "GET", "url": "/api/ventas/producto/003760/ultimos-20-dias?ubicacion_id=tienda_08", "name": "Últimos 20 días"},
        {"method": "GET", "url": "/api/ventas/producto/003760/historico-dia?ubicacion_id=tienda_08&dia_semana=1", "name": "Histórico Día (Lunes)"},
        {"method": "GET", "url": "/api/ventas/producto/diario?codigo_producto=003760", "name": "Ventas Diario"},
    ],

    "Dashboard": [
        {"method": "GET", "url": "/api/dashboard/metrics", "name": "Dashboard Metrics"},
        {"method": "GET", "url": "/api/dashboard/categories", "name": "Dashboard Categories"},
    ],
}

class Colors:
    """ANSI color codes"""
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def benchmark_endpoint(method: str, url: str, name: str) -> Tuple[float, int, str]:
    """
    Ejecuta benchmark de un endpoint.

    Returns:
        (tiempo_ms, status_code, error_msg)
    """
    full_url = f"{API_BASE_URL}{url}"

    try:
        start = time.time()

        if method == "GET":
            response = requests.get(full_url, timeout=TIMEOUT)
        elif method == "POST":
            response = requests.post(full_url, json={}, timeout=TIMEOUT)
        else:
            return (-1, 0, f"Método {method} no soportado")

        elapsed_ms = (time.time() - start) * 1000

        if response.status_code >= 400:
            error_msg = f"HTTP {response.status_code}"
            try:
                error_detail = response.json()
                if 'detail' in error_detail:
                    error_msg += f": {error_detail['detail']}"
            except:
                pass
            return (elapsed_ms, response.status_code, error_msg)

        return (elapsed_ms, response.status_code, "")

    except requests.Timeout:
        return (TIMEOUT * 1000, 0, f"TIMEOUT (>{TIMEOUT}s)")
    except requests.ConnectionError as e:
        return (-1, 0, f"CONNECTION ERROR: {str(e)[:100]}")
    except Exception as e:
        return (-1, 0, f"ERROR: {str(e)[:100]}")

def format_time(ms: float) -> str:
    """Formatea el tiempo con colores según performance"""
    if ms < 0:
        return f"{Colors.FAIL}ERROR{Colors.ENDC}"
    elif ms < 100:
        return f"{Colors.OKGREEN}{ms:7.0f}ms{Colors.ENDC}"
    elif ms < 500:
        return f"{Colors.OKCYAN}{ms:7.0f}ms{Colors.ENDC}"
    elif ms < 2000:
        return f"{Colors.WARNING}{ms:7.0f}ms{Colors.ENDC}"
    else:
        return f"{Colors.FAIL}{ms:7.0f}ms{Colors.ENDC}"

def main():
    print(f"\n{Colors.HEADER}{'=' * 80}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}🔍 BENCHMARK DE ENDPOINTS - FLUXION PRODUCCIÓN{Colors.ENDC}")
    print(f"{Colors.HEADER}{'=' * 80}{Colors.ENDC}\n")
    print(f"API Base: {API_BASE_URL}")
    print(f"Timeout: {TIMEOUT}s")
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    all_results = []

    for module_name, endpoints in ENDPOINTS.items():
        print(f"\n{Colors.BOLD}{Colors.OKBLUE}📦 {module_name}{Colors.ENDC}")
        print(f"{'-' * 80}")

        for endpoint in endpoints:
            method = endpoint["method"]
            url = endpoint["url"]
            name = endpoint["name"]

            # Progress indicator
            sys.stdout.write(f"  Testing: {name:40} ... ")
            sys.stdout.flush()

            # Benchmark
            elapsed_ms, status_code, error = benchmark_endpoint(method, url, name)

            # Store result
            all_results.append({
                "module": module_name,
                "name": name,
                "url": url,
                "method": method,
                "time_ms": elapsed_ms,
                "status": status_code,
                "error": error
            })

            # Print result
            if error:
                print(f"{format_time(elapsed_ms)} {Colors.FAIL}✗ {error}{Colors.ENDC}")
            else:
                print(f"{format_time(elapsed_ms)} {Colors.OKGREEN}✓{Colors.ENDC}")

    # Resumen
    print(f"\n{Colors.HEADER}{'=' * 80}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}📊 RESUMEN DE RESULTADOS{Colors.ENDC}")
    print(f"{Colors.HEADER}{'=' * 80}{Colors.ENDC}\n")

    # Filtrar exitosos
    successful = [r for r in all_results if r["time_ms"] > 0 and not r["error"]]
    errors = [r for r in all_results if r["error"]]

    if successful:
        # Ordenar por tiempo (más lento primero)
        successful_sorted = sorted(successful, key=lambda x: x["time_ms"], reverse=True)

        print(f"{Colors.BOLD}🐌 TOP 10 ENDPOINTS MÁS LENTOS:{Colors.ENDC}\n")
        print(f"{'Rank':>4} {'Tiempo':>10} {'Módulo':30} {'Endpoint':40}")
        print(f"{'-' * 90}")

        for i, result in enumerate(successful_sorted[:10], 1):
            time_str = format_time(result["time_ms"])
            module = result["module"][:28]
            name = result["name"][:38]
            print(f"{i:>4} {time_str} {module:30} {name:40}")

        # Estadísticas
        times = [r["time_ms"] for r in successful]
        avg_time = sum(times) / len(times)
        median_time = sorted(times)[len(times) // 2]

        print(f"\n{Colors.BOLD}📈 ESTADÍSTICAS:{Colors.ENDC}")
        print(f"  Total endpoints probados: {len(all_results)}")
        print(f"  Exitosos: {Colors.OKGREEN}{len(successful)}{Colors.ENDC}")
        print(f"  Con errores: {Colors.FAIL}{len(errors)}{Colors.ENDC}")
        print(f"  Tiempo promedio: {format_time(avg_time)}")
        print(f"  Tiempo mediano: {format_time(median_time)}")
        print(f"  Más rápido: {format_time(min(times))}")
        print(f"  Más lento: {format_time(max(times))}")

    if errors:
        print(f"\n{Colors.BOLD}{Colors.FAIL}❌ ENDPOINTS CON ERRORES:{Colors.ENDC}\n")
        for result in errors:
            print(f"  • {result['name']:40} - {result['error']}")

    # Guardar resultados
    output_file = f"benchmark_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w') as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "api_base_url": API_BASE_URL,
            "results": all_results
        }, f, indent=2)

    print(f"\n{Colors.OKGREEN}✓ Resultados guardados en: {output_file}{Colors.ENDC}\n")

if __name__ == "__main__":
    main()
