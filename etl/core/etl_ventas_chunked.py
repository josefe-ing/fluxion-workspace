#!/usr/bin/env python3
"""
ETL de Ventas con División Automática en Chunks
Para evitar timeouts TCP, divide rangos grandes en chunks más pequeños
"""

import argparse
import subprocess
import sys
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import List, Tuple

def dividir_rango_fechas(fecha_inicio: date, fecha_fin: date, dias_por_chunk: int = 7) -> List[Tuple[date, date]]:
    """
    Divide un rango de fechas en chunks más pequeños

    Args:
        fecha_inicio: Fecha inicial
        fecha_fin: Fecha final
        dias_por_chunk: Días por chunk (default: 7)

    Returns:
        Lista de tuplas (fecha_inicio_chunk, fecha_fin_chunk)
    """
    chunks = []
    fecha_actual = fecha_inicio

    while fecha_actual <= fecha_fin:
        # Calcular fin del chunk
        fecha_fin_chunk = min(fecha_actual + timedelta(days=dias_por_chunk - 1), fecha_fin)
        chunks.append((fecha_actual, fecha_fin_chunk))

        # Avanzar al siguiente chunk
        fecha_actual = fecha_fin_chunk + timedelta(days=1)

    return chunks


def ejecutar_etl_chunk(tienda_id: str, fecha_inicio: date, fecha_fin: date) -> bool:
    """
    Ejecuta el ETL para un chunk específico

    Returns:
        True si exitoso, False si falló
    """
    print(f"\n{'='*80}")
    print(f"📦 CHUNK: {fecha_inicio} a {fecha_fin}")
    print(f"{'='*80}\n")

    # Construir comando
    cmd = [
        "python3",
        "etl_ventas.py",
        "--tienda", tienda_id,
        "--fecha-inicio", fecha_inicio.strftime("%Y-%m-%d"),
        "--fecha-fin", fecha_fin.strftime("%Y-%m-%d")
    ]

    try:
        # Ejecutar ETL
        result = subprocess.run(cmd, check=False, capture_output=False)

        if result.returncode == 0:
            print(f"\n✅ Chunk completado exitosamente")
            return True
        else:
            print(f"\n⚠️ Chunk completó con errores (código {result.returncode})")
            return False

    except KeyboardInterrupt:
        print(f"\n🛑 Interrupción del usuario")
        raise
    except Exception as e:
        print(f"\n❌ Error ejecutando chunk: {e}")
        return False


def main():
    """Función principal"""

    parser = argparse.ArgumentParser(
        description="ETL de Ventas con división automática en chunks",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:

  # Extraer octubre 1-22 en chunks de 7 días (default)
  python3 etl_ventas_chunked.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-22

  # Extraer en chunks de 3 días (más seguro para conexiones inestables)
  python3 etl_ventas_chunked.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-22 --dias-por-chunk 3

  # Extraer un mes completo en chunks de 5 días
  python3 etl_ventas_chunked.py --tienda tienda_01 --fecha-inicio 2025-09-01 --fecha-fin 2025-09-30 --dias-por-chunk 5
        """
    )

    parser.add_argument("--tienda", required=True, help="ID de la tienda (ej: tienda_01)")
    parser.add_argument("--fecha-inicio", required=True, help="Fecha inicial (YYYY-MM-DD)")
    parser.add_argument("--fecha-fin", required=True, help="Fecha final (YYYY-MM-DD)")
    parser.add_argument("--dias-por-chunk", type=int, default=7,
                       help="Días por chunk (default: 7)")
    parser.add_argument("--continuar-si-error", action="store_true",
                       help="Continuar con siguiente chunk si uno falla (default: detener)")

    args = parser.parse_args()

    # Validar y parsear fechas
    try:
        fecha_inicio = datetime.strptime(args.fecha_inicio, "%Y-%m-%d").date()
        fecha_fin = datetime.strptime(args.fecha_fin, "%Y-%m-%d").date()
    except ValueError as e:
        print(f"❌ Error: Formato de fecha inválido. Use YYYY-MM-DD")
        sys.exit(1)

    if fecha_inicio > fecha_fin:
        print(f"❌ Error: Fecha inicial no puede ser mayor que fecha final")
        sys.exit(1)

    # Calcular chunks
    chunks = dividir_rango_fechas(fecha_inicio, fecha_fin, args.dias_por_chunk)
    total_chunks = len(chunks)
    dias_totales = (fecha_fin - fecha_inicio).days + 1

    print(f"\n{'='*80}")
    print(f"🚀 ETL DE VENTAS - MODO CHUNKED")
    print(f"{'='*80}")
    print(f"🏪 Tienda: {args.tienda}")
    print(f"📅 Período: {fecha_inicio} a {fecha_fin} ({dias_totales} días)")
    print(f"📦 Chunks: {total_chunks} chunks de {args.dias_por_chunk} días c/u")
    print(f"⚙️  Estrategia: {'Continuar si error' if args.continuar_si_error else 'Detener si error'}")
    print(f"{'='*80}\n")

    # Confirmar
    respuesta = input("¿Desea continuar? (y/N): ").strip().lower()
    if respuesta != 'y':
        print("❌ Operación cancelada")
        sys.exit(0)

    # Ejecutar chunks
    chunks_exitosos = 0
    chunks_fallidos = 0
    chunks_fallidos_list = []

    tiempo_inicio = datetime.now()

    try:
        for i, (chunk_inicio, chunk_fin) in enumerate(chunks, 1):
            print(f"\n{'='*80}")
            print(f"📍 PROGRESO: Chunk {i}/{total_chunks}")
            print(f"{'='*80}")

            exito = ejecutar_etl_chunk(args.tienda, chunk_inicio, chunk_fin)

            if exito:
                chunks_exitosos += 1
            else:
                chunks_fallidos += 1
                chunks_fallidos_list.append((chunk_inicio, chunk_fin))

                if not args.continuar_si_error:
                    print(f"\n⚠️ Chunk falló. Deteniendo (use --continuar-si-error para continuar)")
                    break

    except KeyboardInterrupt:
        print(f"\n\n🛑 Operación interrumpida por el usuario")

    # Resumen final
    tiempo_fin = datetime.now()
    duracion = tiempo_fin - tiempo_inicio

    print(f"\n{'='*80}")
    print(f"📊 RESUMEN FINAL")
    print(f"{'='*80}")
    print(f"✅ Chunks exitosos: {chunks_exitosos}/{total_chunks}")
    print(f"❌ Chunks fallidos: {chunks_fallidos}/{total_chunks}")
    print(f"⏱️  Duración total: {duracion}")
    print(f"{'='*80}\n")

    if chunks_fallidos > 0:
        print(f"⚠️  CHUNKS FALLIDOS:")
        for chunk_inicio, chunk_fin in chunks_fallidos_list:
            print(f"   • {chunk_inicio} a {chunk_fin}")
        print()
        print(f"💡 Puede re-ejecutar solo los chunks fallidos:")
        for chunk_inicio, chunk_fin in chunks_fallidos_list:
            print(f"   python3 etl_ventas_chunked.py --tienda {args.tienda} "
                  f"--fecha-inicio {chunk_inicio} --fecha-fin {chunk_fin} --dias-por-chunk 3")
        print()

    # Código de salida
    if chunks_fallidos == 0:
        print("✅ Todos los chunks completados exitosamente")
        sys.exit(0)
    else:
        print(f"⚠️ {chunks_fallidos} chunk(s) fallaron")
        sys.exit(1)


if __name__ == "__main__":
    main()
