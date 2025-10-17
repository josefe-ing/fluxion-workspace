#!/bin/bash
# Script para ejecutar ETL de inventario en producción (AWS ECS)
# Uso: ./scripts/run_etl_production.sh [tienda_id | --todas]

set -e

CLUSTER="fluxion-cluster"
TASK_DEFINITION="FluxionStackV2FluxionETLTask073145C9:7"
SUBNET=$(aws ec2 describe-subnets --filters "Name=tag:aws:cloudformation:logical-id,Values=FluxionVPCPrivateSubnet1Subnet*" --query 'Subnets[0].SubnetId' --output text)
SECURITY_GROUP=$(aws ec2 describe-security-groups --filters "Name=tag:aws:cloudformation:logical-id,Values=*ETLSecurityGroup*" --query 'SecurityGroups[0].GroupId' --output text)

echo "=================================================="
echo "  ETL Manual de Inventario - Producción AWS"
echo "=================================================="
echo ""

# Parsear argumentos
if [ $# -eq 0 ]; then
    echo "❌ Error: Debes especificar una tienda o --todas"
    echo ""
    echo "Uso:"
    echo "  ./scripts/run_etl_production.sh tienda_08        # Una tienda específica"
    echo "  ./scripts/run_etl_production.sh --todas          # Todas las tiendas"
    echo ""
    exit 1
fi

ARG=$1

# Construir ETL_ARGS
if [ "$ARG" == "--todas" ]; then
    ETL_ARGS="--todas"
    DESCRIPTION="ETL Inventario - Todas las tiendas"
else
    ETL_ARGS="--tienda $ARG"
    DESCRIPTION="ETL Inventario - $ARG"
fi

echo "📋 Configuración:"
echo "   • Cluster: $CLUSTER"
echo "   • Task Definition: $TASK_DEFINITION"
echo "   • Subnet: $SUBNET"
echo "   • Security Group: $SECURITY_GROUP"
echo "   • ETL Args: $ETL_ARGS"
echo ""

echo "🚀 Lanzando tarea ECS..."
TASK_ARN=$(aws ecs run-task \
    --cluster $CLUSTER \
    --task-definition $TASK_DEFINITION \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SECURITY_GROUP],assignPublicIp=DISABLED}" \
    --overrides "{
        \"containerOverrides\": [{
            \"name\": \"etl\",
            \"environment\": [
                {\"name\": \"ETL_MODE\", \"value\": \"etl_inventario.py\"},
                {\"name\": \"ETL_ARGS\", \"value\": \"$ETL_ARGS\"},
                {\"name\": \"RUN_MODE\", \"value\": \"manual\"},
                {\"name\": \"ETL_ENVIRONMENT\", \"value\": \"production\"}
            ]
        }]
    }" \
    --query 'tasks[0].taskArn' \
    --output text)

if [ -z "$TASK_ARN" ]; then
    echo "❌ Error al lanzar la tarea"
    exit 1
fi

TASK_ID=$(basename $TASK_ARN)

echo "✅ Tarea lanzada exitosamente!"
echo ""
echo "📊 Detalles:"
echo "   • Task ARN: $TASK_ARN"
echo "   • Task ID: $TASK_ID"
echo ""
echo "🔍 Para ver los logs en tiempo real:"
echo "   aws logs tail /aws/ecs/fluxion-etl --follow --since 1m"
echo ""
echo "📈 Para ver el estado de la tarea:"
echo "   aws ecs describe-tasks --cluster $CLUSTER --tasks $TASK_ID --query 'tasks[0].{Status:lastStatus, StartedAt:startedAt, StoppedAt:stoppedAt}'"
echo ""
echo "⏳ Esperando que la tarea inicie..."
sleep 5

# Mostrar estado inicial
aws ecs describe-tasks --cluster $CLUSTER --tasks $TASK_ID --query 'tasks[0].{Status:lastStatus, Health:healthStatus, CPU:cpu, Memory:memory}' --output table

echo ""
echo "=================================================="
echo "✅ ETL ejecutándose en background"
echo "=================================================="
