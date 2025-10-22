#!/bin/bash
#
# Script para ejecutar ETL de Ventas con control de parámetros y logs en tiempo real
#
# Uso:
#   ./ejecutar_etl_ventas.sh [opciones]
#
# Opciones:
#   -t, --tienda TIENDA_ID      ID de tienda específica (ej: tienda_01)
#   -a, --todas                 Ejecutar para TODAS las tiendas
#   -i, --inicio FECHA          Fecha de inicio (formato: YYYY-MM-DD)
#   -f, --fin FECHA             Fecha de fin (formato: YYYY-MM-DD)
#   -e, --env ENV               Entorno: local|prod (default: prod)
#   -l, --logs                  Mostrar logs de CloudWatch en tiempo real
#   -d, --delay SECONDS         Delay entre ETLs (default: 15 segundos)
#   -h, --help                  Mostrar esta ayuda
#
# Ejemplos:
#   # Actualizar una tienda específica (últimos 7 días)
#   ./ejecutar_etl_ventas.sh -t tienda_01 -i 2025-10-10 -f 2025-10-17
#
#   # Actualizar todas las tiendas con logs
#   ./ejecutar_etl_ventas.sh --todas -i 2025-10-10 -f 2025-10-17 --logs
#
#   # Ejecutar en local
#   ./ejecutar_etl_ventas.sh -t tienda_01 -i 2025-10-10 -f 2025-10-17 -e local
#

set -e  # Exit on error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Valores por defecto
TIENDA=""
TODAS=false
FECHA_INICIO=""
FECHA_FIN=""
ENTORNO="prod"
MOSTRAR_LOGS=false
DELAY=15
API_URL_PROD="https://d1tgnaj74tv17v.cloudfront.net/api/etl/sync/ventas"
API_URL_LOCAL="http://localhost:8001/api/etl/sync/ventas"
API_LOGS_PROD="https://d1tgnaj74tv17v.cloudfront.net/api/etl/ventas/logs"
API_LOGS_LOCAL="http://localhost:8001/api/etl/ventas/logs"
CLUSTER_NAME="fluxion-cluster"
LOG_GROUP="FluxionStackV2-FluxionVentasETLTaskventasetlLogGroup4B91E149-KmcKpIB1HGkP"
REGION="us-east-1"

# Array de todas las tiendas
TODAS_LAS_TIENDAS=(
    "tienda_01:PERIFERICO"
    "tienda_02:AV. BOLIVAR"
    "tienda_03:MAÑONGO"
    "tienda_04:SAN DIEGO"
    "tienda_05:VIVIENDA"
    "tienda_06:NAGUANAGUA"
    "tienda_07:GUACARA"
    "tienda_08:BOSQUE"
    "tienda_09:CENTRO"
    "tienda_10:SAN BLAS"
    "tienda_11:LA GRANJA"
    "tienda_12:PARQUE VALENCIA"
    "tienda_13:TRIGAL NORTE"
    "tienda_14:PREBO"
    "tienda_15:LOS GUAYOS"
    "tienda_16:ISABELICA"
)

# Función para mostrar ayuda
show_help() {
    sed -n '2,28p' "$0" | sed 's/^# //' | sed 's/^#//'
    exit 0
}

# Función para logging con color
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

log_step() {
    echo -e "${CYAN}🚀${NC} $1"
}

# Parsear argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--tienda)
            TIENDA="$2"
            shift 2
            ;;
        -a|--todas)
            TODAS=true
            shift
            ;;
        -i|--inicio)
            FECHA_INICIO="$2"
            shift 2
            ;;
        -f|--fin)
            FECHA_FIN="$2"
            shift 2
            ;;
        -e|--env)
            ENTORNO="$2"
            shift 2
            ;;
        -l|--logs)
            MOSTRAR_LOGS=true
            shift
            ;;
        -d|--delay)
            DELAY="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            ;;
        *)
            log_error "Opción desconocida: $1"
            echo "Usa --help para ver opciones disponibles"
            exit 1
            ;;
    esac
done

# Validaciones
if [ "$TODAS" = false ] && [ -z "$TIENDA" ]; then
    log_error "Debes especificar una tienda (-t) o usar --todas"
    exit 1
fi

if [ -z "$FECHA_INICIO" ] || [ -z "$FECHA_FIN" ]; then
    log_error "Debes especificar fecha de inicio (-i) y fin (-f)"
    exit 1
fi

# Configurar URLs según entorno
if [ "$ENTORNO" = "local" ]; then
    API_URL=$API_URL_LOCAL
    API_LOGS_URL=$API_LOGS_LOCAL
    log_info "Modo: LOCAL (http://localhost:8001)"
else
    API_URL=$API_URL_PROD
    API_LOGS_URL=$API_LOGS_PROD
    log_info "Modo: PRODUCCIÓN (AWS)"
fi

# Función para ejecutar ETL de una tienda
ejecutar_etl() {
    local tienda_id=$1
    local tienda_nombre=$2

    log_step "Ejecutando ETL para $tienda_nombre ($tienda_id)"
    log_info "Fechas: $FECHA_INICIO → $FECHA_FIN"

    # Lanzar ETL
    RESPONSE=$(curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"ubicacion_id\": \"$tienda_id\",
            \"fecha_inicio\": \"$FECHA_INICIO\",
            \"fecha_fin\": \"$FECHA_FIN\"
        }")

    # Verificar respuesta
    if echo "$RESPONSE" | grep -q "message"; then
        MESSAGE=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('message', 'ETL iniciado'))" 2>/dev/null || echo "ETL iniciado")
        log_success "$MESSAGE"

        # Extraer task ID si está disponible
        TASK_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('task_id', ''))" 2>/dev/null || echo "")

        # Mostrar logs si se solicitó
        if [ "$MOSTRAR_LOGS" = true ]; then
            log_info "Esperando 10 segundos para que la tarea inicie..."
            sleep 10

            if [ "$ENTORNO" = "prod" ] && [ -n "$TASK_ID" ]; then
                log_info "Mostrando logs de CloudWatch (presiona Ctrl+C para detener)..."
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

                # Seguir logs desde CloudWatch
                aws logs tail "$LOG_GROUP" \
                    --follow \
                    --since 1m \
                    --region "$REGION" \
                    --filter-pattern "$tienda_id" 2>/dev/null || {
                    log_warning "No se pudieron obtener logs de CloudWatch"
                    log_info "Puedes consultar logs manualmente:"
                    log_info "aws logs tail $LOG_GROUP --follow --region $REGION"
                }

                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            else
                # Polling del endpoint de logs
                log_info "Polling logs desde API..."
                for i in {1..30}; do
                    LOGS=$(curl -s "$API_LOGS_URL")
                    STATUS=$(echo "$LOGS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', 'running'))" 2>/dev/null || echo "running")

                    # Mostrar últimas 5 líneas de logs
                    echo "$LOGS" | python3 -c "import sys, json; logs = json.load(sys.stdin).get('logs', []); [print(f\"{l.get('timestamp', '')[:19]} - {l.get('message', '')}\") for l in logs[-5:]]" 2>/dev/null

                    if [ "$STATUS" = "completed" ]; then
                        log_success "ETL completado para $tienda_nombre"
                        break
                    fi

                    sleep 5
                done
            fi
        fi

        return 0
    else
        log_error "Error ejecutando ETL: $RESPONSE"
        return 1
    fi
}

# Banner inicial
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}         ETL DE VENTAS - FLUXION AI          ${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Ejecutar ETL
TOTAL_SUCCESS=0
TOTAL_ERRORS=0

if [ "$TODAS" = true ]; then
    log_info "Ejecutando ETL para TODAS las tiendas (${#TODAS_LAS_TIENDAS[@]} tiendas)"
    echo ""

    for TIENDA_INFO in "${TODAS_LAS_TIENDAS[@]}"; do
        IFS=':' read -r TIENDA_ID TIENDA_NOMBRE <<< "$TIENDA_INFO"

        if ejecutar_etl "$TIENDA_ID" "$TIENDA_NOMBRE"; then
            ((TOTAL_SUCCESS++))
        else
            ((TOTAL_ERRORS++))
        fi

        # Delay entre tiendas (excepto la última)
        if [ "$TIENDA_INFO" != "${TODAS_LAS_TIENDAS[-1]}" ]; then
            log_info "Esperando $DELAY segundos antes de la siguiente tienda..."
            sleep "$DELAY"
            echo ""
        fi
    done
else
    # Ejecutar para una sola tienda
    # Buscar nombre de la tienda
    TIENDA_NOMBRE="$TIENDA"
    for TIENDA_INFO in "${TODAS_LAS_TIENDAS[@]}"; do
        IFS=':' read -r TID TNOMBRE <<< "$TIENDA_INFO"
        if [ "$TID" = "$TIENDA" ]; then
            TIENDA_NOMBRE="$TNOMBRE"
            break
        fi
    done

    if ejecutar_etl "$TIENDA" "$TIENDA_NOMBRE"; then
        ((TOTAL_SUCCESS++))
    else
        ((TOTAL_ERRORS++))
    fi
fi

# Resumen final
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}                  RESUMEN FINAL                  ${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_success "ETLs exitosos: $TOTAL_SUCCESS"
if [ $TOTAL_ERRORS -gt 0 ]; then
    log_error "ETLs fallidos: $TOTAL_ERRORS"
fi
echo ""
log_info "Puedes ver los logs completos en AWS CloudWatch:"
log_info "aws logs tail $LOG_GROUP --follow --region $REGION"
echo ""
log_info "O en el panel web: https://d20a0g9yxinot2.cloudfront.net/settings/etl"
echo ""

exit 0
