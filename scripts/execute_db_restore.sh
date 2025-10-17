#!/bin/bash
# Script to execute database restoration in production ECS
# This will run a one-time ECS task that restores the DB from S3 and applies indexes

set -e

echo "=========================================="
echo "FLUXION PRODUCTION DB RESTORE"
echo "=========================================="
echo ""

# Configuration
CLUSTER="fluxion-cluster"
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Get task definition ARN
TASK_DEF_ARN=$(aws ecs list-task-definitions \
  --family-prefix FluxionStack-FluxionBackendTask \
  --region $REGION \
  --query 'taskDefinitionArns[0]' \
  --output text)

if [ -z "$TASK_DEF_ARN" ]; then
  echo "❌ Error: Could not find backend task definition"
  exit 1
fi

echo "✅ Found task definition: $TASK_DEF_ARN"
echo ""

# Get VPC and subnet information
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=tag:Application,Values=fluxion" \
  --region $REGION \
  --query 'Vpcs[0].VpcId' \
  --output text)

SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=*Private*" \
  --region $REGION \
  --query 'Subnets[0].SubnetId' \
  --output text)

SECURITY_GROUP=$(aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=*Backend*" \
  --region $REGION \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null || echo "")

echo "VPC: $VPC_ID"
echo "Subnet: $SUBNET_ID"
echo "Security Group: $SECURITY_GROUP"
echo ""

# Build network configuration
if [ -n "$SECURITY_GROUP" ]; then
  NETWORK_CONFIG="awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SECURITY_GROUP],assignPublicIp=DISABLED}"
else
  NETWORK_CONFIG="awsvpcConfiguration={subnets=[$SUBNET_ID],assignPublicIp=DISABLED}"
fi

echo "=========================================="
echo "STARTING DATABASE RESTORE TASK"
echo "=========================================="
echo ""
echo "⚠️  WARNING: This will replace the production database!"
echo "⚠️  A backup will be created automatically before restoration."
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Restore cancelled."
  exit 0
fi

echo ""
echo "🚀 Starting restore task..."
echo ""

# Run the task with override command
TASK_ARN=$(aws ecs run-task \
  --cluster $CLUSTER \
  --task-definition $TASK_DEF_ARN \
  --launch-type FARGATE \
  --network-configuration "$NETWORK_CONFIG" \
  --overrides '{
    "containerOverrides": [{
      "name": "backend",
      "command": ["/bin/bash", "/app/run_restore.sh"]
    }]
  }' \
  --region $REGION \
  --query 'tasks[0].taskArn' \
  --output text)

if [ -z "$TASK_ARN" ]; then
  echo "❌ Error: Could not start restore task"
  exit 1
fi

echo "✅ Task started: $TASK_ARN"
echo ""
echo "📊 Monitoring task progress..."
echo "   (This will take 3-5 minutes to download and restore 2GB from S3)"
echo ""

# Wait for task to complete
while true; do
  TASK_STATUS=$(aws ecs describe-tasks \
    --cluster $CLUSTER \
    --tasks $TASK_ARN \
    --region $REGION \
    --query 'tasks[0].lastStatus' \
    --output text)

  echo "   Status: $TASK_STATUS"

  if [ "$TASK_STATUS" == "STOPPED" ]; then
    break
  fi

  sleep 10
done

# Check exit code
EXIT_CODE=$(aws ecs describe-tasks \
  --cluster $CLUSTER \
  --tasks $TASK_ARN \
  --region $REGION \
  --query 'tasks[0].containers[0].exitCode' \
  --output text)

echo ""
if [ "$EXIT_CODE" == "0" ]; then
  echo "✅ Database restore completed successfully!"
  echo ""
  echo "=========================================="
  echo "NEXT STEPS:"
  echo "=========================================="
  echo "1. View task logs to verify:"
  echo "   aws logs tail /ecs/fluxion-backend --follow --region $REGION"
  echo ""
  echo "2. Restart the backend service:"
  echo "   aws ecs update-service --cluster $CLUSTER --service <backend-service-name> --force-new-deployment --region $REGION"
  echo ""
  echo "3. Test the production API performance:"
  echo "   curl -w \"@-\" -s https://<backend-url>/api/ventas/detail?page=1&page_size=50"
  echo ""
else
  echo "❌ Database restore failed with exit code: $EXIT_CODE"
  echo ""
  echo "View logs:"
  echo "aws logs tail /ecs/fluxion-backend --follow --region $REGION"
  exit 1
fi
