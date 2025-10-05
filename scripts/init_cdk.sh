#!/bin/bash

# ========================================
# Script de Inicialización CDK
# Fluxion AI - AWS Deployment
# ========================================

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          Inicializando AWS CDK para Fluxion AI               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "README.md" ]; then
    echo "❌ Error: Ejecuta este script desde el directorio raíz de fluxion-workspace"
    exit 1
fi

echo "📋 Paso 1: Verificando dependencias..."

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    echo "   Instala Node.js 18+: https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js $(node --version)"

# Verificar npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm no está instalado"
    exit 1
fi
echo "✅ npm $(npm --version)"

# Verificar AWS CLI
if ! command -v aws &> /dev/null; then
    echo "⚠️  AWS CLI no está instalado"
    echo "   Instalando..."
    brew install awscli || {
        echo "❌ Error instalando AWS CLI. Instala manualmente:"
        echo "   https://aws.amazon.com/cli/"
        exit 1
    }
fi
echo "✅ AWS CLI $(aws --version | cut -d' ' -f1)"

# Verificar CDK
if ! command -v cdk &> /dev/null; then
    echo "📦 Instalando AWS CDK..."
    npm install -g aws-cdk
fi
echo "✅ CDK $(cdk --version)"

echo ""
echo "📋 Paso 2: Configurando AWS credentials..."

# Verificar que AWS está configurado
if ! aws sts get-caller-identity &> /dev/null; then
    echo "⚠️  AWS no está configurado"
    echo ""
    echo "Necesitas configurar tus credenciales AWS:"
    echo "1. Ve a AWS Console > IAM > Users > Tu usuario > Security credentials"
    echo "2. Create access key"
    echo "3. Descarga las credenciales"
    echo ""
    echo "Luego ejecuta:"
    echo "  aws configure"
    echo ""
    read -p "¿Ya configuraste AWS? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Configura AWS y vuelve a ejecutar este script."
        exit 1
    fi
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo "us-east-1")

echo "✅ AWS Account: $ACCOUNT_ID"
echo "✅ AWS Region: $REGION"

echo ""
echo "📋 Paso 3: Creando estructura CDK..."

# Crear directorio infrastructure si no existe
if [ ! -d "infrastructure" ]; then
    mkdir infrastructure
    echo "✅ Directorio infrastructure/ creado"
else
    echo "✅ Directorio infrastructure/ ya existe"
fi

cd infrastructure

# Inicializar CDK app si no existe
if [ ! -f "cdk.json" ]; then
    echo "📦 Inicializando CDK app..."
    cdk init app --language typescript
    echo "✅ CDK app inicializado"
else
    echo "✅ CDK app ya existe"
fi

# Instalar dependencias adicionales
echo "📦 Instalando dependencias CDK..."
npm install --save \
    @aws-cdk/aws-ec2 \
    @aws-cdk/aws-ecs \
    @aws-cdk/aws-ecs-patterns \
    @aws-cdk/aws-s3 \
    @aws-cdk/aws-cloudfront \
    @aws-cdk/aws-events \
    @aws-cdk/aws-events-targets \
    @aws-cdk/aws-efs \
    @aws-cdk/aws-secretsmanager \
    @aws-cdk/aws-elasticloadbalancingv2

echo "✅ Dependencias instaladas"

echo ""
echo "📋 Paso 4: Bootstrap CDK en AWS..."

# Bootstrap CDK (solo si no está bootstrap)
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region $REGION &> /dev/null; then
    echo "🚀 Bootstrapping CDK en región $REGION..."
    cdk bootstrap aws://$ACCOUNT_ID/$REGION
    echo "✅ CDK bootstrapped"
else
    echo "✅ CDK ya está bootstrapped"
fi

cd ..

echo ""
echo "📋 Paso 5: Configurando Sentry (opcional)..."

if [ -z "$SENTRY_DSN" ]; then
    echo "⚠️  Variable SENTRY_DSN no configurada"
    echo ""
    echo "Para habilitar monitoreo con Sentry:"
    echo "1. Crea cuenta en https://sentry.io/signup/"
    echo "2. Crea proyecto 'fluxion-ai'"
    echo "3. Copia el DSN"
    echo "4. Agrega a .env: SENTRY_DSN=https://xxx@sentry.io/xxx"
    echo ""
    read -p "¿Quieres configurar Sentry ahora? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Pega tu SENTRY_DSN: " SENTRY_DSN
        echo "SENTRY_DSN=$SENTRY_DSN" >> backend/.env
        echo "✅ Sentry configurado en backend/.env"
    else
        echo "⏭️  Saltando configuración Sentry (puedes hacerlo después)"
    fi
else
    echo "✅ SENTRY_DSN ya configurado"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   ✅ CDK INICIALIZADO                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "🎯 PRÓXIMOS PASOS:"
echo ""
echo "1. Revisa la guía completa:"
echo "   cat DEPLOYMENT_CDK.md"
echo ""
echo "2. Configura VPN (si necesitas acceso a SQL Server on-premise)"
echo ""
echo "3. Crea secrets en AWS Secrets Manager:"
echo "   aws secretsmanager create-secret \\"
echo "     --name fluxion/sql-server \\"
echo "     --secret-string '{\"host\":\"...\",\"user\":\"...\",\"password\":\"...\"}'"
echo ""
echo "4. Deploy la infraestructura:"
echo "   cd infrastructure"
echo "   cdk deploy FluxionStack"
echo ""
echo "5. Build y deploy frontend:"
echo "   cd frontend"
echo "   npm run build"
echo "   aws s3 sync dist/ s3://fluxion-frontend-prod/"
echo ""
echo "📚 Documentación completa: DEPLOYMENT_CDK.md"
echo ""

# Mostrar resumen de costos
echo "💰 COSTOS ESTIMADOS:"
echo "   • Primeros 12 meses (Free Tier): ~\$10/mes"
echo "   • Producción completa: ~\$85/mes"
echo "   • Con VPN Gateway: ~\$85/mes base"
echo ""
echo "✅ Todo listo para deployment con CDK"
