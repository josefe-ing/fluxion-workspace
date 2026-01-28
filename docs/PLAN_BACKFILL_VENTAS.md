# Plan de Backfill de Ventas - KLK

**Fecha**: 2026-01-26
**Estado**: Por ejecutar

## Resumen de Gaps Detectados

| Tienda | Dias Faltantes | Cobertura | Prioridad |
|--------|----------------|-----------|-----------|
| tienda_11 | 90 | 1% | ALTA - Nueva tienda |
| tienda_07 | 55 | 39% | ALTA |
| tienda_02 | 53 | 42% | ALTA |
| tienda_03 | 48 | 47% | ALTA |
| tienda_05 | 48 | 47% | ALTA |
| tienda_18 | 47 | 48% | MEDIA |
| tienda_16 | 40 | 56% | MEDIA |
| tienda_15 | 36 | 60% | MEDIA |
| tienda_13 | 33 | 64% | MEDIA |
| tienda_10 | 32 | 65% | MEDIA |
| tienda_06 | 31 | 66% | MEDIA |
| tienda_08 | 30 | 67% | MEDIA |
| tienda_17 | 29 | 68% | BAJA |
| tienda_12 | 29 | 68% | BAJA |
| tienda_20 | 28 | 69% | BAJA |
| tienda_19 | 26 | 71% | BAJA |
| tienda_04 | 23 | 75% | BAJA |
| tienda_09 | 21 | 77% | BAJA |
| tienda_01 | 18 | 80% | BAJA |

## Patron Detectado

1. **Gap reciente comun (2026-01-10 a 2026-01-25)**: 16 dias faltantes en casi todas las tiendas
2. **Dias festivos**: 25-Dic y 1-Ene (tiendas cerradas, OK no tener datos)
3. **tienda_11 (Flor Amarillo)**: Tienda recien agregada al sistema

---

## FASE 1: Gap Reciente (Ene 10-25) - TODAS LAS TIENDAS

Este gap afecta a casi todas las tiendas. Ejecutar primero.

```bash
cd /Users/jose/Developer/fluxion-workspace/etl

# Backfill 2026-01-10 a 2026-01-25 (todas las tiendas)
python3 etl_ventas_postgres.py \
    --fecha-desde "2026-01-10 00:00" \
    --fecha-hasta "2026-01-25 23:59" \
    --chunk-days 2 \
    --todas
```

**Tiempo estimado**: ~30-60 min (19 tiendas x 16 dias)

---

## FASE 2: Backfill por Tienda (Historico)

### 2.1 tienda_11 (Flor Amarillo) - PRIORIDAD MAXIMA
Nueva tienda, necesita todo el historico desde Oct 28.

```bash
# tienda_11: Oct 28 - Ene 25 (90 dias)
python3 etl_ventas_postgres.py \
    --tiendas tienda_11 \
    --fecha-desde "2025-10-28 00:00" \
    --fecha-hasta "2026-01-25 23:59" \
    --chunk-days 3
```

### 2.2 tienda_07 (Centro) - 55 dias faltantes
Gran gap en Diciembre-Enero.

```bash
# tienda_07: Dic 4 - Ene 9 (bloques de gaps)
python3 etl_ventas_postgres.py \
    --tiendas tienda_07 \
    --fecha-desde "2025-12-04 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 3
```

### 2.3 tienda_02 (Av. Bolivar) - 53 dias faltantes

```bash
# tienda_02: Dic 11 - Ene 9
python3 etl_ventas_postgres.py \
    --tiendas tienda_02 \
    --fecha-desde "2025-12-11 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 3

# tienda_02: Oct-Nov gaps dispersos
python3 etl_ventas_postgres.py \
    --tiendas tienda_02 \
    --fecha-desde "2025-10-28 00:00" \
    --fecha-hasta "2025-11-23 23:59" \
    --chunk-days 5
```

### 2.4 tienda_03 (Manongo) - 48 dias faltantes

```bash
# tienda_03: Dic 10 - Ene 9
python3 etl_ventas_postgres.py \
    --tiendas tienda_03 \
    --fecha-desde "2025-12-10 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 3
```

### 2.5 tienda_05 (Vivienda) - 48 dias faltantes

```bash
# tienda_05: Dic 16 - Ene 9
python3 etl_ventas_postgres.py \
    --tiendas tienda_05 \
    --fecha-desde "2025-12-16 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 3

# tienda_05: Nov gaps
python3 etl_ventas_postgres.py \
    --tiendas tienda_05 \
    --fecha-desde "2025-10-31 00:00" \
    --fecha-hasta "2025-11-23 23:59" \
    --chunk-days 5
```

### 2.6 tienda_18 (Paraiso) - 47 dias faltantes
Tienda nueva, sin data antes de Dic 6.

```bash
# tienda_18: Oct 28 - Dic 5 (todo el periodo inicial)
python3 etl_ventas_postgres.py \
    --tiendas tienda_18 \
    --fecha-desde "2025-10-28 00:00" \
    --fecha-hasta "2025-12-05 23:59" \
    --chunk-days 5
```

---

## FASE 3: Gaps Menores (Tiendas con >60% cobertura)

Estas tiendas tienen gaps dispersos. Ejecutar por lotes.

```bash
# Batch 1: tienda_16, tienda_15, tienda_13
python3 etl_ventas_postgres.py \
    --tiendas tienda_16 tienda_15 tienda_13 \
    --fecha-desde "2025-10-28 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 5

# Batch 2: tienda_10, tienda_06, tienda_08
python3 etl_ventas_postgres.py \
    --tiendas tienda_10 tienda_06 tienda_08 \
    --fecha-desde "2025-10-28 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 5

# Batch 3: tienda_17, tienda_12, tienda_20
python3 etl_ventas_postgres.py \
    --tiendas tienda_17 tienda_12 tienda_20 \
    --fecha-desde "2025-10-28 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 5

# Batch 4: tienda_19, tienda_04, tienda_09, tienda_01
python3 etl_ventas_postgres.py \
    --tiendas tienda_19 tienda_04 tienda_09 tienda_01 \
    --fecha-desde "2025-10-28 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 5
```

---

## Script Completo de Ejecucion

```bash
#!/bin/bash
# backfill_all.sh - Ejecutar desde /etl

set -e
cd /Users/jose/Developer/fluxion-workspace/etl

echo "=== FASE 1: Gap Reciente (Ene 10-25) ==="
python3 etl_ventas_postgres.py \
    --fecha-desde "2026-01-10 00:00" \
    --fecha-hasta "2026-01-25 23:59" \
    --chunk-days 2 \
    --todas

echo "=== FASE 2.1: tienda_11 (nueva) ==="
python3 etl_ventas_postgres.py \
    --tiendas tienda_11 \
    --fecha-desde "2025-10-28 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 3

echo "=== FASE 2.2: tienda_07 ==="
python3 etl_ventas_postgres.py \
    --tiendas tienda_07 \
    --fecha-desde "2025-12-04 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 3

echo "=== FASE 2.3: tienda_02 ==="
python3 etl_ventas_postgres.py \
    --tiendas tienda_02 \
    --fecha-desde "2025-10-28 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 3

echo "=== FASE 2.4: tienda_03 ==="
python3 etl_ventas_postgres.py \
    --tiendas tienda_03 \
    --fecha-desde "2025-12-10 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 3

echo "=== FASE 2.5: tienda_05 ==="
python3 etl_ventas_postgres.py \
    --tiendas tienda_05 \
    --fecha-desde "2025-10-31 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 3

echo "=== FASE 2.6: tienda_18 ==="
python3 etl_ventas_postgres.py \
    --tiendas tienda_18 \
    --fecha-desde "2025-10-28 00:00" \
    --fecha-hasta "2025-12-05 23:59" \
    --chunk-days 5

echo "=== FASE 3: Resto de tiendas ==="
python3 etl_ventas_postgres.py \
    --tiendas tienda_16 tienda_15 tienda_13 tienda_10 tienda_06 tienda_08 tienda_17 tienda_12 tienda_20 tienda_19 tienda_04 tienda_09 tienda_01 \
    --fecha-desde "2025-10-28 00:00" \
    --fecha-hasta "2026-01-09 23:59" \
    --chunk-days 5

echo "=== BACKFILL COMPLETO ==="
```

---

## Verificacion Post-Backfill

```sql
-- Verificar cobertura despues del backfill
SELECT
    ubicacion_id,
    MIN(fecha_venta)::date as primera_venta,
    MAX(fecha_venta)::date as ultima_venta,
    COUNT(DISTINCT DATE(fecha_venta)) as dias_con_datos,
    (MAX(fecha_venta)::date - MIN(fecha_venta)::date + 1) as dias_rango,
    ROUND(100.0 * COUNT(DISTINCT DATE(fecha_venta)) /
          (MAX(fecha_venta)::date - MIN(fecha_venta)::date + 1), 1) as pct_cobertura
FROM ventas
WHERE ubicacion_id LIKE 'tienda_%'
GROUP BY ubicacion_id
ORDER BY pct_cobertura ASC;
```

---

## Notas Importantes

1. **Dias festivos (25-Dic, 1-Ene)**: Es normal no tener ventas si las tiendas estaban cerradas
2. **Duplicados**: El ETL usa UPSERT, es seguro re-ejecutar el mismo rango
3. **Chunk size**: Usar chunks de 2-5 dias para evitar timeouts del endpoint KLK
4. **Monitoreo**: Revisar logs en `etl/logs/ventas_postgres_*.log`
5. **Ejecutar desde AWS**: Si hay timeouts desde local, ejecutar desde ECS exec

