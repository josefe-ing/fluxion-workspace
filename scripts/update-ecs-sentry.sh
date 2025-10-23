#!/bin/bash
# Script para agregar SENTRY_DSN a las task definitions de ECS
# Uso: ./update-ecs-sentry.sh

set -e

SENTRY_DSN="https://3c6d41d5d95beceff8239cc7978c5db6@o4510234583760896.ingest.us.sentry.io/4510235066105856"
CLUSTER_NAME="fluxion-cluster"

echo "🔧 Actualizando Task Definitions con SENTRY_DSN..."
echo ""

# Función para actualizar task definition
update_task_def() {
    local TASK_NAME=$1
    local SERVICE_NAME=$2

    echo "📝 Procesando: $TASK_NAME"

    # Obtener la task definition actual
    TASK_DEF=$(aws ecs describe-task-definition --task-definition "$TASK_NAME" --query 'taskDefinition')

    # Extraer info necesaria
    FAMILY=$(echo "$TASK_DEF" | jq -r '.family')

    # Crear nueva task definition con SENTRY_DSN
    NEW_TASK_DEF=$(echo "$TASK_DEF" | jq \
        --arg sentry_dsn "$SENTRY_DSN" \
        'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy) |
        .containerDefinitions[0].environment += [
            {"name": "SENTRY_DSN", "value": $sentry_dsn},
            {"name": "SENTRY_ENVIRONMENT", "value": "production"},
            {"name": "SENTRY_TRACES_SAMPLE_RATE", "value": "0.1"}
        ]')

    # Registrar nueva task definition
    echo "$NEW_TASK_DEF" > /tmp/new-task-def.json
    NEW_REVISION=$(aws ecs register-task-definition --cli-input-json file:///tmp/new-task-def.json --query 'taskDefinition.revision')

    echo "   ✅ Nueva revisión creada: $FAMILY:$NEW_REVISION"

    # Actualizar servicio si existe
    if [ -n "$SERVICE_NAME" ]; then
        echo "   🔄 Actualizando servicio: $SERVICE_NAME"
        aws ecs update-service \
            --cluster "$CLUSTER_NAME" \
            --service "$SERVICE_NAME" \
            --task-definition "$FAMILY:$NEW_REVISION" \
            --force-new-deployment \
            --query 'service.serviceName' \
            --output text > /dev/null
        echo "   ✅ Servicio actualizado"
    fi

    echo ""
}

# Actualizar Backend
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Backend API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
update_task_def "FluxionStackV2FluxionBackendTask94E5B2B4" "FluxionStackV2-FluxionBackendServiceE051E4B7-3D0YfNUbXnmp"

# Actualizar ETL Inventario
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ETL Inventario"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
update_task_def "FluxionStackV2FluxionETLTask073145C9" ""

# Actualizar ETL Ventas
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ETL Ventas"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
update_task_def "FluxionStackV2FluxionVentasETLTaskB0C9498F" ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ COMPLETADO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎯 Próximos pasos:"
echo "   1. El backend se reiniciará automáticamente"
echo "   2. Los ETLs usarán la nueva configuración en su próxima ejecución"
echo "   3. Verifica los logs para confirmar: 'Sentry inicializado'"
echo "   4. Los errores aparecerán en: https://sentry.io"
echo ""

# Limpiar
rm -f /tmp/new-task-def.json
