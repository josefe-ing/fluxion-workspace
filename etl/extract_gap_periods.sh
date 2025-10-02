#!/bin/bash
################################################################################
# ETL Script para Extraer Datos de Períodos con Gaps
################################################################################
# Extrae datos de los períodos identificados con gaps en el análisis
# Ejecutar desde: /Users/jose/Developer/fluxion-workspace/etl/
################################################################################

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${SCRIPT_DIR}/../data/fluxion_production.db"
LOG_FILE="${SCRIPT_DIR}/gap_extraction_$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✓ $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ✗ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠ $1${NC}" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] ℹ $1${NC}" | tee -a "$LOG_FILE"
}

################################################################################
# PERÍODOS CON GAPS IDENTIFICADOS
################################################################################

declare -A GAP_PERIODS=(
    # tienda_08 - BOSQUE: Todo marzo 2025
    ["tienda_08_marzo"]="tienda_08|2025-03-01|2025-03-31|BOSQUE"

    # tienda_13 - NAGUANAGUA III: Todo julio 2025
    ["tienda_13_julio"]="tienda_13|2025-07-01|2025-07-31|NAGUANAGUA III"

    # tienda_16 - TOCUYITO: Junio-Julio 2025
    ["tienda_16_jun_jul"]="tienda_16|2025-06-01|2025-07-31|TOCUYITO"

    # tienda_01 - PERIFERICO: Feb 9-10, 2025
    ["tienda_01_feb"]="tienda_01|2025-02-09|2025-02-10|PERIFERICO"
)

################################################################################
# FUNCIÓN: Extraer datos de un período específico
################################################################################
extract_gap_period() {
    local tienda_id=$1
    local fecha_inicio=$2
    local fecha_fin=$3
    local nombre_tienda=$4

    log_info "================================================"
    log_info "Extrayendo: $tienda_id ($nombre_tienda)"
    log_info "Período: $fecha_inicio → $fecha_fin"
    log_info "================================================"

    # En un entorno real, aquí irían los comandos para:
    # 1. Conectar al sistema origen (base de datos transaccional, API, archivos, etc.)
    # 2. Extraer los datos del período específico
    # 3. Transformar los datos al formato de ventas_raw
    # 4. Cargar a la base de datos

    # EJEMPLO DE SCRIPT (adaptar según tu fuente de datos):

    # Opción 1: Si los datos vienen de archivos CSV
    # -----------------------------------------------
    # SOURCE_DIR="/path/to/raw/data/${tienda_id}"
    # for fecha in $(seq -f "%Y-%m-%d" $fecha_inicio $fecha_fin); do
    #     CSV_FILE="${SOURCE_DIR}/ventas_${fecha}.csv"
    #     if [ -f "$CSV_FILE" ]; then
    #         log_info "Procesando archivo: $CSV_FILE"
    #         python3 process_csv_to_db.py --file "$CSV_FILE" --ubicacion "$tienda_id"
    #     else
    #         log_warning "Archivo no encontrado: $CSV_FILE"
    #     fi
    # done

    # Opción 2: Si los datos vienen de una API
    # -----------------------------------------
    # python3 extract_from_api.py \
    #     --ubicacion "$tienda_id" \
    #     --fecha-inicio "$fecha_inicio" \
    #     --fecha-fin "$fecha_fin" \
    #     --output "$DB_PATH"

    # Opción 3: Si los datos vienen de otra base de datos
    # ----------------------------------------------------
    # psql -h source_host -U user -d source_db <<EOF
    # COPY (
    #     SELECT * FROM ventas
    #     WHERE ubicacion_id = '$tienda_id'
    #       AND fecha BETWEEN '$fecha_inicio' AND '$fecha_fin'
    # ) TO STDOUT WITH CSV HEADER;
    # EOF | python3 load_to_duckdb.py --db "$DB_PATH"

    # SIMULACIÓN para este script:
    log_warning "MODO SIMULACIÓN: No hay fuente de datos configurada"
    log_info "Para ejecutar extracción real, debes:"
    log_info "  1. Identificar la fuente de datos (archivos, API, BD origen)"
    log_info "  2. Adaptar este script con los comandos correctos"
    log_info "  3. Ejecutar con permisos de acceso a la fuente"

    # Verificar si ya existen datos en el período
    local count=$(python3 -c "
import duckdb
conn = duckdb.connect('$DB_PATH', read_only=True)
result = conn.execute('''
    SELECT COUNT(*)
    FROM ventas_raw
    WHERE ubicacion_id = '$tienda_id'
      AND CAST(fecha AS DATE) BETWEEN '$fecha_inicio' AND '$fecha_fin'
''').fetchone()[0]
conn.close()
print(result)
")

    if [ "$count" -gt 0 ]; then
        log_success "Ya existen $count registros en la base de datos para este período"
    else
        log_error "No se encontraron datos en la base de datos para este período"
    fi

    echo ""
}

################################################################################
# MAIN
################################################################################

log "================================================================================"
log "EXTRACCIÓN DE DATOS PARA PERÍODOS CON GAPS"
log "================================================================================"
log "Base de datos: $DB_PATH"
log "Log file: $LOG_FILE"
log ""

# Verificar que existe la base de datos
if [ ! -f "$DB_PATH" ]; then
    log_error "Base de datos no encontrada: $DB_PATH"
    exit 1
fi

log_success "Base de datos encontrada"
log ""

# Contar gaps a procesar
log_info "Períodos identificados con gaps: ${#GAP_PERIODS[@]}"
log ""

# Extraer cada período
for key in "${!GAP_PERIODS[@]}"; do
    IFS='|' read -r tienda_id fecha_inicio fecha_fin nombre_tienda <<< "${GAP_PERIODS[$key]}"
    extract_gap_period "$tienda_id" "$fecha_inicio" "$fecha_fin" "$nombre_tienda"
done

log "================================================================================"
log "RESUMEN DE EXTRACCIÓN"
log "================================================================================"
log_info "Períodos procesados: ${#GAP_PERIODS[@]}"
log_warning "NOTA: Este script está en MODO SIMULACIÓN"
log_warning "Para extracción real, configura la fuente de datos en el script"
log ""
log_info "Próximos pasos:"
log_info "  1. Identifica dónde están los datos originales (archivos, API, BD)"
log_info "  2. Adapta la función extract_gap_period() con los comandos reales"
log_info "  3. Ejecuta: bash extract_gap_periods.sh"
log_info "  4. Verifica con: python3 ../analyze_data_gaps.py"
log ""
log_success "Script completado. Ver log: $LOG_FILE"

exit 0
