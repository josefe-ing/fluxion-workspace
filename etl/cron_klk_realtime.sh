#!/bin/bash
################################################################################
# Cron Jobs para ETL KLK - Actualizaciones en Tiempo Real
#
# Frecuencia:
#   - Inventario: Cada 30 minutos (00:00, 00:30, 01:00, 01:30, ...)
#   - Ventas: Cada 30 minutos con 5 min de offset (00:05, 00:35, 01:05, 01:35, ...)
#
# Instalación:
#   crontab -e
#   Agregar las siguientes líneas:
#
#   # ETL KLK - Inventario cada 30 minutos
#   0,30 * * * * /Users/jose/Developer/fluxion-workspace/etl/cron_klk_realtime.sh inventario
#
#   # ETL KLK - Ventas cada 30 minutos (5 min después de inventario)
#   5,35 * * * * /Users/jose/Developer/fluxion-workspace/etl/cron_klk_realtime.sh ventas
#
# Logs: etl/logs/cron_klk_*.log
################################################################################

set -e  # Exit on error

# Directorios
ETL_DIR="/Users/jose/Developer/fluxion-workspace/etl"
LOG_DIR="${ETL_DIR}/logs"
VENV_DIR="${ETL_DIR}/venv"

# Crear directorio de logs si no existe
mkdir -p "${LOG_DIR}"

# Timestamp para logs
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
DATE_STR=$(date +"%Y%m%d")

# Función para logging
log() {
    echo "[${TIMESTAMP}] $1"
}

# Función para ejecutar ETL con logging
run_etl() {
    local etl_type=$1
    local log_file="${LOG_DIR}/cron_klk_${etl_type}_${DATE_STR}.log"

    log "🚀 Iniciando ETL ${etl_type} KLK" | tee -a "${log_file}"

    cd "${ETL_DIR}"

    # Activar virtualenv y ejecutar ETL
    if [ "${etl_type}" = "inventario" ]; then
        source "${VENV_DIR}/bin/activate" && \
        python3 core/etl_inventario_klk.py 2>&1 | tee -a "${log_file}"
        exit_code=${PIPESTATUS[0]}
    elif [ "${etl_type}" = "ventas" ]; then
        # Ventas en modo incremental: últimos 30 minutos
        source "${VENV_DIR}/bin/activate" && \
        python3 core/etl_ventas_klk.py --incremental 30 2>&1 | tee -a "${log_file}"
        exit_code=${PIPESTATUS[0]}
    else
        log "❌ Tipo de ETL inválido: ${etl_type}" | tee -a "${log_file}"
        exit 1
    fi

    if [ ${exit_code} -eq 0 ]; then
        log "✅ ETL ${etl_type} completado exitosamente" | tee -a "${log_file}"
    else
        log "❌ ETL ${etl_type} falló con código ${exit_code}" | tee -a "${log_file}"

        # Notificación de error (opcional - puedes agregar email/slack)
        # echo "ETL ${etl_type} falló - Ver ${log_file}" | mail -s "Error ETL KLK" admin@lagranja.com
    fi

    return ${exit_code}
}

# Main
case "$1" in
    inventario)
        run_etl "inventario"
        ;;
    ventas)
        run_etl "ventas"
        ;;
    *)
        echo "Uso: $0 {inventario|ventas}"
        echo ""
        echo "Ejemplos:"
        echo "  $0 inventario  # Ejecuta ETL de inventario"
        echo "  $0 ventas      # Ejecuta ETL de ventas"
        exit 1
        ;;
esac
