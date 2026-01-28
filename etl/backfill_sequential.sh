#!/bin/bash
# Backfill secuencial por tienda para evitar problemas de memoria
# Uso: ./backfill_sequential.sh

set -e
cd /Users/jose/Developer/fluxion-workspace/etl

FECHA_DESDE="2026-01-10 00:00"
FECHA_HASTA="2026-01-25 23:59"

TIENDAS=(
    "tienda_01"
    "tienda_02"
    "tienda_03"
    "tienda_04"
    "tienda_05"
    "tienda_06"
    "tienda_07"
    "tienda_08"
    "tienda_09"
    "tienda_10"
    "tienda_11"
    "tienda_12"
    "tienda_13"
    "tienda_15"
    "tienda_16"
    "tienda_17"
    "tienda_18"
    "tienda_19"
    "tienda_20"
)

echo "=========================================="
echo "BACKFILL SECUENCIAL: $FECHA_DESDE -> $FECHA_HASTA"
echo "Total tiendas: ${#TIENDAS[@]}"
echo "=========================================="

TOTAL=${#TIENDAS[@]}
COUNT=0

for TIENDA in "${TIENDAS[@]}"; do
    COUNT=$((COUNT + 1))
    echo ""
    echo "[$COUNT/$TOTAL] Procesando $TIENDA..."
    echo "----------------------------------------"

    PYTHONUNBUFFERED=1 python3 etl_ventas_postgres.py \
        --fecha-desde "$FECHA_DESDE" \
        --fecha-hasta "$FECHA_HASTA" \
        --tiendas "$TIENDA" \
        --chunk-days 2 \
        2>&1 | grep -E "(Duracion|cargadas|extraidas|ERROR|WARNING.*failed)" || true

    echo "[$COUNT/$TOTAL] $TIENDA completado"
done

echo ""
echo "=========================================="
echo "BACKFILL COMPLETO"
echo "=========================================="
