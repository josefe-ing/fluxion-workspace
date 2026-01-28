#!/bin/bash
# Backfill dia por dia para evitar problemas de memoria
# Cada ejecucion procesa UN dia para UNA tienda

set -e
cd /Users/jose/Developer/fluxion-workspace/etl

# Fechas a procesar (Ene 10-25)
DATES=(
    "2026-01-10"
    "2026-01-11"
    "2026-01-12"
    "2026-01-13"
    "2026-01-14"
    "2026-01-15"
    "2026-01-16"
    "2026-01-17"
    "2026-01-18"
    "2026-01-19"
    "2026-01-20"
    "2026-01-21"
    "2026-01-22"
    "2026-01-23"
    "2026-01-24"
    "2026-01-25"
)

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

TOTAL_DAYS=${#DATES[@]}
TOTAL_TIENDAS=${#TIENDAS[@]}
TOTAL_OPS=$((TOTAL_DAYS * TOTAL_TIENDAS))

echo "=========================================="
echo "BACKFILL DIA POR DIA"
echo "Dias: $TOTAL_DAYS | Tiendas: $TOTAL_TIENDAS | Total ops: $TOTAL_OPS"
echo "=========================================="

COUNT=0
FAILED=0

for DATE in "${DATES[@]}"; do
    echo ""
    echo "=== DIA: $DATE ==="

    for TIENDA in "${TIENDAS[@]}"; do
        COUNT=$((COUNT + 1))

        echo -n "[$COUNT/$TOTAL_OPS] $TIENDA $DATE... "

        # Ejecutar ETL para este dia/tienda
        RESULT=$(PYTHONUNBUFFERED=1 python3 etl_ventas_postgres.py \
            --fecha-desde "$DATE 00:00" \
            --fecha-hasta "$DATE 23:59" \
            --tiendas "$TIENDA" \
            2>&1)

        # Extraer resumen
        CARGADAS=$(echo "$RESULT" | grep -oP 'Total ventas cargadas: \K[\d,]+' | tr -d ',' || echo "0")

        if echo "$RESULT" | grep -q "ERROR"; then
            echo "ERROR"
            FAILED=$((FAILED + 1))
        else
            echo "$CARGADAS registros"
        fi
    done
done

echo ""
echo "=========================================="
echo "BACKFILL COMPLETO"
echo "Total operaciones: $COUNT"
echo "Fallidas: $FAILED"
echo "=========================================="
