#!/bin/bash

###############################################################################
# Script de Ejecución Diaria de Cálculos ABC-XYZ
#
# Este script:
# 1. Ejecuta cálculo ABC v2 por tienda
# 2. Ejecuta cálculo XYZ por tienda
# 3. Detecta cambios automáticamente
# 4. Guarda logs rotados por fecha
#
# Uso:
#   ./scripts/ejecutar_abc_xyz_diario.sh
#
# Cron (ejecutar diariamente a las 3 AM):
#   0 3 * * * /path/to/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh
###############################################################################

# Configuración
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/logs/abc-xyz"
DATABASE_DIR="$PROJECT_ROOT/database"
FECHA=$(date +"%Y-%m-%d")
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

# Crear directorio de logs si no existe
mkdir -p "$LOG_DIR"

# Archivo de log del día
LOG_FILE="$LOG_DIR/abc-xyz-$FECHA.log"

# Función para logging
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Función para manejo de errores
handle_error() {
    log "❌ ERROR: $1"
    log "==================================================="
    exit 1
}

# Inicio del proceso
log "==================================================="
log "🚀 INICIO - Cálculo ABC-XYZ Diario"
log "==================================================="
log "📂 Proyecto: $PROJECT_ROOT"
log "📁 Base de datos: $PROJECT_ROOT/data/fluxion_production.db"
log ""

# Verificar que exista la base de datos
if [ ! -f "$PROJECT_ROOT/data/fluxion_production.db" ]; then
    handle_error "Base de datos no encontrada en $PROJECT_ROOT/data/fluxion_production.db"
fi

# Verificar que existan los scripts
if [ ! -f "$DATABASE_DIR/calcular_abc_v2_por_tienda.py" ]; then
    handle_error "Script ABC no encontrado: $DATABASE_DIR/calcular_abc_v2_por_tienda.py"
fi

if [ ! -f "$DATABASE_DIR/calcular_xyz_por_tienda.py" ]; then
    handle_error "Script XYZ no encontrado: $DATABASE_DIR/calcular_xyz_por_tienda.py"
fi

# =============================================================================
# PASO 1: Calcular ABC v2
# =============================================================================

log "📊 PASO 1/2: Ejecutando cálculo ABC v2..."
log "---------------------------------------------------"

cd "$PROJECT_ROOT" || handle_error "No se pudo cambiar al directorio del proyecto"

if python3 "$DATABASE_DIR/calcular_abc_v2_por_tienda.py" --verbose >> "$LOG_FILE" 2>&1; then
    log "✅ Cálculo ABC v2 completado exitosamente"
else
    handle_error "Fallo en cálculo ABC v2 (código de salida: $?)"
fi

log ""

# =============================================================================
# PASO 2: Calcular XYZ
# =============================================================================

log "📈 PASO 2/2: Ejecutando cálculo XYZ..."
log "---------------------------------------------------"

if python3 "$DATABASE_DIR/calcular_xyz_por_tienda.py" --verbose >> "$LOG_FILE" 2>&1; then
    log "✅ Cálculo XYZ completado exitosamente"
else
    handle_error "Fallo en cálculo XYZ (código de salida: $?)"
fi

log ""

# =============================================================================
# Resumen Final
# =============================================================================

log "==================================================="
log "✅ PROCESO COMPLETADO EXITOSAMENTE"
log "==================================================="

# Estadísticas de la ejecución
log "📊 Estadísticas:"

# Contar registros
TOTAL_ABC=$(python3 -c "import duckdb; conn=duckdb.connect('$PROJECT_ROOT/data/fluxion_production.db'); print(conn.execute('SELECT COUNT(*) FROM productos_abc_v2').fetchone()[0])" 2>/dev/null)
TOTAL_ALERTAS=$(python3 -c "import duckdb; conn=duckdb.connect('$PROJECT_ROOT/data/fluxion_production.db'); print(conn.execute('SELECT COUNT(*) FROM alertas_cambio_clasificacion').fetchone()[0])" 2>/dev/null)

log "   • Clasificaciones ABC totales: $TOTAL_ABC"
log "   • Alertas registradas: $TOTAL_ALERTAS"
log "   • Log guardado en: $LOG_FILE"

# Limpiar logs antiguos (mantener últimos 30 días)
log ""
log "🧹 Limpiando logs antiguos (>30 días)..."
find "$LOG_DIR" -name "abc-xyz-*.log" -type f -mtime +30 -delete 2>/dev/null
log "✅ Limpieza completada"

log ""
log "🎉 Proceso finalizado en: $(date +'%Y-%m-%d %H:%M:%S')"
log "==================================================="

exit 0
