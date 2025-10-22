#!/bin/bash
# Script para monitorear el deployment de GitHub Actions y ECS

set -e

echo "🚀 Monitoring Fluxion Deployment to AWS"
echo "=========================================="
echo ""

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. Verificar GitHub Actions status
echo -e "${BLUE}📦 GitHub Actions Status:${NC}"
echo "   URL: https://github.com/josefe-ing/fluxion-workspace/actions"
echo ""

# 2. Obtener última ejecución de GitHub Actions (si gh CLI está instalado)
if command -v gh &> /dev/null; then
    echo -e "${BLUE}🔍 Última ejecución de GitHub Actions:${NC}"
    gh run list --limit 1 --workflow "Deploy to AWS" 2>/dev/null || echo "   (usa 'gh auth login' para ver detalles)"
    echo ""
fi

# 3. Monitorear ECS Task Definition updates
echo -e "${BLUE}📋 ECS Task Definitions:${NC}"
echo ""

echo "Backend Task:"
aws ecs describe-task-definition \
    --task-definition fluxion-backend-task \
    --query 'taskDefinition.{Revision:revision,Status:status,CPU:cpu,Memory:memory}' \
    --output table 2>/dev/null || echo "   ❌ No disponible"

echo ""
echo "ETL Task:"
aws ecs describe-task-definition \
    --task-definition FluxionStackV2-FluxionETLTask* \
    --query 'taskDefinition.{Revision:revision,Status:status,CPU:cpu,Memory:memory}' \
    --output table 2>/dev/null || echo "   ℹ️  Buscando nombre exacto..."

# Buscar el nombre exacto de la Task Definition
ETL_TASK_NAME=$(aws ecs list-task-definitions \
    --family-prefix FluxionStackV2-FluxionETLTask \
    --query 'taskDefinitionArns[-1]' \
    --output text 2>/dev/null | awk -F'/' '{print $NF}')

if [ -n "$ETL_TASK_NAME" ]; then
    echo "   Encontrada: $ETL_TASK_NAME"
    aws ecs describe-task-definition \
        --task-definition "$ETL_TASK_NAME" \
        --query 'taskDefinition.{Revision:revision,Status:status,CPU:cpu,Memory:memory,Image:containerDefinitions[0].image}' \
        --output table
else
    echo "   ⚠️  No se pudo encontrar ETL Task Definition"
fi

echo ""

# 4. Verificar imágenes Docker en ECR
echo -e "${BLUE}🐳 ECR Docker Images:${NC}"
echo ""

echo "Backend Image:"
aws ecr describe-images \
    --repository-name fluxion-backend \
    --query 'sort_by(imageDetails,& imagePushedAt)[-1].{Pushed:imagePushedAt,Size:imageSizeInBytes,Tags:imageTags[0]}' \
    --output table 2>/dev/null || echo "   ❌ No disponible"

echo ""
echo "ETL Image:"
aws ecr describe-images \
    --repository-name fluxion-etl \
    --query 'sort_by(imageDetails,& imagePushedAt)[-1].{Pushed:imagePushedAt,Size:imageSizeInBytes,Tags:imageTags[0]}' \
    --output table 2>/dev/null || echo "   ❌ No disponible"

echo ""

# 5. Verificar servicios ECS corriendo
echo -e "${BLUE}🔄 ECS Services Status:${NC}"
echo ""

CLUSTER_NAME="FluxionStackV2-FluxionCluster*"
CLUSTER_ARN=$(aws ecs list-clusters \
    --query "clusterArns[?contains(@, 'FluxionCluster')]|[0]" \
    --output text 2>/dev/null)

if [ -n "$CLUSTER_ARN" ] && [ "$CLUSTER_ARN" != "None" ]; then
    echo "Cluster: $CLUSTER_ARN"
    echo ""

    # Backend Service
    echo "Backend Service:"
    aws ecs describe-services \
        --cluster "$CLUSTER_ARN" \
        --services FluxionStackV2-FluxionBackendService* \
        --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Pending:pendingCount}' \
        --output table 2>/dev/null || echo "   ℹ️  Backend service no encontrado"

    echo ""

    # ETL Tasks (scheduled, no service permanente)
    echo "ETL Tasks (últimas 5 ejecuciones):"
    aws ecs list-tasks \
        --cluster "$CLUSTER_ARN" \
        --family FluxionStackV2-FluxionETLTask* \
        --max-results 5 \
        --query 'taskArns' \
        --output text 2>/dev/null || echo "   ℹ️  No hay tareas ETL corriendo actualmente"
else
    echo "   ⚠️  Cluster no encontrado o no accesible"
fi

echo ""
echo ""

# 6. CloudWatch Logs - últimas líneas
echo -e "${BLUE}📝 CloudWatch Logs (últimas 10 líneas):${NC}"
echo ""

echo "Backend Logs:"
aws logs tail /ecs/fluxion-backend --since 10m --format short 2>/dev/null | tail -10 || echo "   ❌ No disponible"

echo ""
echo "ETL Logs:"
aws logs tail /ecs/fluxion-etl --since 10m --format short 2>/dev/null | tail -10 || echo "   ℹ️  Sin ejecuciones recientes (ETL corre en schedule)"

echo ""
echo ""

# 7. Resumen de deployment
echo -e "${GREEN}✅ Deployment Monitoring Complete${NC}"
echo ""
echo "📍 Próximos pasos:"
echo "   1. Revisar GitHub Actions: https://github.com/josefe-ing/fluxion-workspace/actions"
echo "   2. Verificar Backend Health: \$(aws cloudformation describe-stacks --stack-name FluxionStackV2 --query 'Stacks[0].Outputs[?OutputKey==\`BackendURL\`].OutputValue' --output text)"
echo "   3. Monitorear logs ETL: aws logs tail /ecs/fluxion-etl --follow"
echo "   4. Ejecutar ETL manual: Ver scripts/run-etl-manual.sh"
echo ""
