#!/bin/bash
# Helper script para copiar y ejecutar setup en EC2 via SSM

INSTANCE_ID="i-0f6c4e3a637684c02"

echo "=========================================="
echo "Copiando script de setup a EC2..."
echo "=========================================="
echo ""

# Copiar script via SSM
echo "Creando script en EC2..."
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=[\"$(cat scripts/setup-ec2-manual.sh | sed 's/"/\\"/g')\"]" \
  --output text \
  --query 'Command.CommandId'

echo ""
echo "✅ Script copiado!"
echo ""
echo "=========================================="
echo "Conectándote a la instancia EC2..."
echo "=========================================="
echo ""
echo "Una vez conectado, ejecuta:"
echo ""
echo "  bash setup-ec2-manual.sh"
echo ""
echo "O ejecuta paso a paso siguiendo docs/EC2_MANUAL_SETUP.md"
echo ""
echo "Conectando..."
aws ssm start-session --target "$INSTANCE_ID"
