#!/bin/bash
set -e

STACK_NAME="FluxionStack"
REGION="us-east-1"

echo "=== Esperando a que el stack termine el rollback ==="
echo ""

# Wait for stack to be stable
while true; do
  STATUS=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "STACK_NOT_FOUND")

  echo "[$(date +%H:%M:%S)] Stack status: $STATUS"

  case $STATUS in
    UPDATE_ROLLBACK_COMPLETE|CREATE_COMPLETE|UPDATE_COMPLETE)
      echo "✅ Stack está estable"
      break
      ;;
    *FAILED*)
      echo "❌ Stack falló: $STATUS"
      echo "Necesitarás intervención manual"
      exit 1
      ;;
    *IN_PROGRESS*)
      echo "⏳ Esperando... (revisando en 30 segundos)"
      sleep 30
      ;;
    STACK_NOT_FOUND)
      echo "✅ Stack no existe, podemos hacer deploy desde cero"
      break
      ;;
    *)
      echo "⚠️  Estado desconocido: $STATUS"
      sleep 30
      ;;
  esac
done

echo ""
echo "=== Iniciando deployment limpio ==="
cd "$(dirname "$0")/.."
npx cdk deploy --require-approval never

echo ""
echo "✅ Deployment completado!"
