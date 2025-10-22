#!/bin/bash
# Script para monitorear deployment de GitHub Actions en tiempo real

set -e

echo "🔍 Monitoring GitHub Actions Deployment"
echo "========================================"
echo ""

# Obtener el run ID más reciente
RUN_ID=$(gh run list --workflow "Deploy to AWS" --limit 1 --json databaseId --jq '.[0].databaseId')

if [ -z "$RUN_ID" ]; then
    echo "❌ No se encontró deployment activo"
    exit 1
fi

echo "📦 Run ID: $RUN_ID"
echo "🔗 URL: https://github.com/josefe-ing/fluxion-workspace/actions/runs/$RUN_ID"
echo ""

# Loop de monitoreo
while true; do
    clear
    echo "🔍 Monitoring GitHub Actions Deployment"
    echo "========================================"
    echo "📦 Run ID: $RUN_ID"
    echo "🔗 URL: https://github.com/josefe-ing/fluxion-workspace/actions/runs/$RUN_ID"
    echo ""

    # Obtener status general
    STATUS=$(gh run view $RUN_ID --json status,conclusion --jq '{status: .status, conclusion: .conclusion}')
    echo "📊 Status: $STATUS"
    echo ""

    # Obtener jobs y su estado
    echo "📋 Jobs Status:"
    gh run view $RUN_ID --json jobs --jq '.jobs[] | "\(.name): \(.status) - \(.conclusion // "running")"' | \
        sed 's/^/   /' | \
        sed 's/completed - success/✅ completed - success/' | \
        sed 's/completed - failure/❌ completed - failure/' | \
        sed 's/in_progress/🔄 in_progress/' | \
        sed 's/queued/⏳ queued/'

    echo ""

    # Verificar si completó
    RUN_STATUS=$(echo $STATUS | jq -r '.status')
    if [ "$RUN_STATUS" = "completed" ]; then
        RUN_CONCLUSION=$(echo $STATUS | jq -r '.conclusion')
        echo ""
        if [ "$RUN_CONCLUSION" = "success" ]; then
            echo "✅ ¡Deployment Exitoso!"
        else
            echo "❌ Deployment Falló"
            echo ""
            echo "Ver logs completos:"
            echo "   gh run view $RUN_ID --log-failed"
        fi
        break
    fi

    echo "🔄 Actualizando en 10 segundos... (Ctrl+C para salir)"
    sleep 10
done
