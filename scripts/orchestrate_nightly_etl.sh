#!/bin/bash
set -e

# ============================================================================
# Fluxion AI - Orchestrator Nocturno de ETL
# ============================================================================
# Este script coordina el proceso nocturno de extracción de datos:
# 1. Detiene el servicio Backend (libera conexión DuckDB)
# 2. Ejecuta ETL de ventas para todas las tiendas
# 3. Reinicia el servicio Backend
#
# Ventana de ejecución: 1:00 AM - 6:00 AM (Venezuela Time)
# ============================================================================

# Variables de AWS
AWS_REGION="${AWS_REGION:-us-east-1}"
CLUSTER_NAME="FluxionStackV2-FluxionCluster"
BACKEND_SERVICE="FluxionStackV2-FluxionBackendServiceBackendECSService"
VENTAS_ETL_TASK_FAMILY="FluxionStackV2-FluxionVentasETLTask"
SUBNET_1="subnet-09eb6d0dc98fb2c0e"
SUBNET_2="subnet-0fab1c6c0fdb9fc28"
SECURITY_GROUP="sg-06068d5c698d2e9bd"

# Colores para logging
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging con timestamp
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}"
}

# ============================================================================
# PASO 1: Detener Backend Service
# ============================================================================
stop_backend() {
    log "🛑 Deteniendo servicio Backend para liberar conexión DuckDB..."

    # Obtener el desired count actual (para restaurar después)
    ORIGINAL_DESIRED_COUNT=$(aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$BACKEND_SERVICE" \
        --region "$AWS_REGION" \
        --query 'services[0].desiredCount' \
        --output text 2>/dev/null || echo "1")

    log_info "Desired count original: $ORIGINAL_DESIRED_COUNT"

    # Reducir desired count a 0
    aws ecs update-service \
        --cluster "$CLUSTER_NAME" \
        --service "$BACKEND_SERVICE" \
        --desired-count 0 \
        --region "$AWS_REGION" \
        > /dev/null

    log "⏳ Esperando que el servicio Backend termine de detenerse..."

    # Esperar hasta que running count sea 0
    MAX_WAIT=180  # 3 minutos máximo
    WAIT_TIME=0
    while [ "$WAIT_TIME" -lt "$MAX_WAIT" ]; do
        RUNNING_COUNT=$(aws ecs describe-services \
            --cluster "$CLUSTER_NAME" \
            --services "$BACKEND_SERVICE" \
            --region "$AWS_REGION" \
            --query 'services[0].runningCount' \
            --output text)

        if [ "$RUNNING_COUNT" == "0" ]; then
            log "✅ Backend detenido completamente (running count = 0)"
            return 0
        fi

        log_info "Running count: $RUNNING_COUNT (esperando que sea 0...)"
        sleep 10
        WAIT_TIME=$((WAIT_TIME + 10))
    done

    log_error "Timeout esperando que Backend se detenga"
    return 1
}

# ============================================================================
# PASO 2: Ejecutar ETL de Ventas (Todas las Tiendas)
# ============================================================================
run_ventas_etl() {
    log "🔄 Ejecutando ETL de Ventas para todas las tiendas..."

    # Obtener fecha de ayer (formato YYYY-MM-DD)
    FECHA_EJECUCION=$(date -u -d "yesterday" '+%Y-%m-%d' 2>/dev/null || date -u -v-1d '+%Y-%m-%d')

    log_info "Fecha de extracción: $FECHA_EJECUCION"

    # Ejecutar tarea ECS para ETL de ventas
    TASK_ARN=$(aws ecs run-task \
        --cluster "$CLUSTER_NAME" \
        --task-definition "$VENTAS_ETL_TASK_FAMILY" \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1,$SUBNET_2],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
        --overrides "{
            \"containerOverrides\": [{
                \"name\": \"ventas-etl\",
                \"command\": [
                    \"python3\",
                    \"core/orquestador.py\",
                    \"--todas-las-tiendas\",
                    \"--fecha\",
                    \"$FECHA_EJECUCION\"
                ]
            }]
        }" \
        --region "$AWS_REGION" \
        --query 'tasks[0].taskArn' \
        --output text)

    if [ -z "$TASK_ARN" ] || [ "$TASK_ARN" == "None" ]; then
        log_error "No se pudo iniciar tarea ETL"
        return 1
    fi

    # Extraer task ID del ARN
    TASK_ID=$(echo "$TASK_ARN" | awk -F'/' '{print $NF}')
    log "✅ Tarea ETL iniciada: $TASK_ID"

    # Esperar que la tarea complete (máximo 4 horas = 14400 segundos)
    log "⏳ Esperando que ETL complete (máx 4 horas)..."

    MAX_WAIT=14400  # 4 horas
    WAIT_TIME=0
    SLEEP_INTERVAL=30

    while [ "$WAIT_TIME" -lt "$MAX_WAIT" ]; do
        # Verificar estado de la tarea
        TASK_STATUS=$(aws ecs describe-tasks \
            --cluster "$CLUSTER_NAME" \
            --tasks "$TASK_ARN" \
            --region "$AWS_REGION" \
            --query 'tasks[0].lastStatus' \
            --output text 2>/dev/null || echo "UNKNOWN")

        if [ "$TASK_STATUS" == "STOPPED" ]; then
            # Verificar si terminó exitosamente
            EXIT_CODE=$(aws ecs describe-tasks \
                --cluster "$CLUSTER_NAME" \
                --tasks "$TASK_ARN" \
                --region "$AWS_REGION" \
                --query 'tasks[0].containers[0].exitCode' \
                --output text 2>/dev/null || echo "1")

            if [ "$EXIT_CODE" == "0" ]; then
                log "✅ ETL completado exitosamente"
                return 0
            else
                log_error "ETL falló con exit code: $EXIT_CODE"
                return 1
            fi
        fi

        # Log progreso cada 5 minutos
        if [ $((WAIT_TIME % 300)) -eq 0 ]; then
            ELAPSED_MINUTES=$((WAIT_TIME / 60))
            log_info "ETL en progreso (${ELAPSED_MINUTES}m transcurridos, estado: $TASK_STATUS)..."
        fi

        sleep $SLEEP_INTERVAL
        WAIT_TIME=$((WAIT_TIME + SLEEP_INTERVAL))
    done

    log_error "Timeout esperando que ETL complete (4 horas)"
    return 1
}

# ============================================================================
# PASO 3: Reiniciar Backend Service
# ============================================================================
start_backend() {
    log "🚀 Reiniciando servicio Backend..."

    # Restaurar desired count original (típicamente 1)
    local desired_count="${1:-1}"

    aws ecs update-service \
        --cluster "$CLUSTER_NAME" \
        --service "$BACKEND_SERVICE" \
        --desired-count "$desired_count" \
        --region "$AWS_REGION" \
        > /dev/null

    log "⏳ Esperando que Backend inicie..."

    # Esperar hasta que running count sea igual a desired count
    MAX_WAIT=300  # 5 minutos máximo
    WAIT_TIME=0
    while [ "$WAIT_TIME" -lt "$MAX_WAIT" ]; do
        RUNNING_COUNT=$(aws ecs describe-services \
            --cluster "$CLUSTER_NAME" \
            --services "$BACKEND_SERVICE" \
            --region "$AWS_REGION" \
            --query 'services[0].runningCount' \
            --output text)

        if [ "$RUNNING_COUNT" == "$desired_count" ]; then
            log "✅ Backend iniciado completamente (running count = $desired_count)"

            # Esperar 30 segundos adicionales para health checks
            log_info "Esperando health checks..."
            sleep 30
            return 0
        fi

        log_info "Running count: $RUNNING_COUNT (esperando $desired_count...)"
        sleep 10
        WAIT_TIME=$((WAIT_TIME + 10))
    done

    log_warning "Timeout esperando que Backend inicie (pero continuando...)"
    return 0
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================
main() {
    log "============================================================================"
    log "🌙 Iniciando Orchestrator Nocturno de ETL"
    log "============================================================================"

    START_TIME=$(date +%s)

    # Paso 1: Detener Backend
    if ! stop_backend; then
        log_error "Fallo deteniendo Backend - abortando"
        exit 1
    fi

    # Paso 2: Ejecutar ETL
    ETL_SUCCESS=0
    if ! run_ventas_etl; then
        log_error "ETL falló - pero continuaremos para reiniciar Backend"
        ETL_SUCCESS=1
    fi

    # Paso 3: Reiniciar Backend (SIEMPRE, incluso si ETL falló)
    if ! start_backend "$ORIGINAL_DESIRED_COUNT"; then
        log_error "Fallo reiniciando Backend"
        exit 1
    fi

    # Resumen final
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    DURATION_MINUTES=$((DURATION / 60))

    log "============================================================================"
    if [ "$ETL_SUCCESS" -eq 0 ]; then
        log "✅ Orchestrator completado exitosamente"
    else
        log_error "⚠️  Orchestrator completado con errores en ETL"
    fi
    log "⏱️  Duración total: ${DURATION_MINUTES} minutos"
    log "============================================================================"

    exit $ETL_SUCCESS
}

# Ejecutar main
main "$@"
