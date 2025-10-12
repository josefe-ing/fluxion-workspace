#!/bin/bash
set -e

STACK_NAME="FluxionStack"
REGION="us-east-1"

echo "=== Esperando eliminación completa de $STACK_NAME ==="
echo ""

# Wait for stack deletion
while true; do
  STATUS=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "DELETE_COMPLETE")

  echo "[$(date +%H:%M:%S)] Stack status: $STATUS"

  case $STATUS in
    DELETE_COMPLETE)
      echo "✅ Stack eliminado exitosamente"
      break
      ;;
    DELETE_FAILED)
      echo "❌ Eliminación falló: $STATUS"
      echo "Revisar en consola AWS"
      exit 1
      ;;
    *IN_PROGRESS*)
      echo "⏳ Eliminando recursos... (revisando en 30 segundos)"
      sleep 30
      ;;
    *)
      echo "⚠️  Estado inesperado: $STATUS"
      sleep 30
      ;;
  esac
done

echo ""
echo "=== Iniciando deployment de FluxionStackV2 ==="
cd "$(dirname "$0")/.."

# Trigger GitHub Actions deployment
echo "Haciendo commit dummy para trigger GitHub Actions..."
git commit --allow-empty -m "chore: trigger deployment after FluxionStack cleanup

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push

echo ""
echo "✅ Push exitoso - GitHub Actions iniciará deployment"
echo "Monitorea en: https://github.com/josefe-ing/fluxion-workspace/actions"
