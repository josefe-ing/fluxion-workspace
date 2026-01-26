#!/bin/bash

# Pre-Deploy Validation Script
# Ejecutar ANTES de hacer git push para asegurar que todo está listo

set -e  # Exit on error

echo "🔍 PRE-DEPLOY VALIDATION - Sistema KLK v2.0"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Function to print success
success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error
error() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

# Function to print warning
warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

echo "1️⃣  Validando Backend..."
echo "------------------------"

# Check if backend requirements.txt has sentry
if grep -q "sentry-sdk\[fastapi\]" backend/requirements.txt; then
    success "sentry-sdk presente en requirements.txt"
else
    error "sentry-sdk NO encontrado en requirements.txt"
fi

# Check if backend main.py imports etl_tracking_router
if grep -q "etl_tracking_router" backend/main.py; then
    success "etl_tracking_router importado en main.py"
else
    error "etl_tracking_router NO importado en main.py"
fi

# Check if backend Dockerfile exists
if [ -f "backend/Dockerfile" ]; then
    success "Backend Dockerfile existe"
else
    error "Backend Dockerfile NO existe"
fi

echo ""
echo "2️⃣  Validando ETL..."
echo "------------------------"

# Check if ETL files exist
if [ -f "etl/core/etl_tracker.py" ]; then
    success "etl_tracker.py existe"
else
    error "etl_tracker.py NO existe"
fi

if [ -f "etl/core/etl_ventas_klk.py" ]; then
    success "etl_ventas_klk.py existe"
else
    error "etl_ventas_klk.py NO existe"
fi

if [ -f "etl/core/sentry_etl.py" ]; then
    success "sentry_etl.py existe"
else
    error "sentry_etl.py NO existe"
fi

# Check if ETL Dockerfile exists
if [ -f "etl/Dockerfile" ]; then
    success "ETL Dockerfile existe"
else
    error "ETL Dockerfile NO existe"
fi

echo ""
echo "3️⃣  Validando Frontend..."
echo "------------------------"

cd frontend

# Check if node_modules exists
if [ -d "node_modules" ]; then
    success "node_modules presente"
else
    warning "node_modules NO presente - ejecutar npm install"
fi

# Run type check
echo "   Ejecutando type-check..."
if npm run type-check > /dev/null 2>&1; then
    success "Type-check passed"
else
    error "Type-check FAILED"
fi

# Run lint
echo "   Ejecutando lint..."
LINT_OUTPUT=$(npx eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 150 2>&1 || true)
WARNING_COUNT=$(echo "$LINT_OUTPUT" | grep -o "[0-9]* warning" | grep -o "[0-9]*" || echo "0")
if [ "$WARNING_COUNT" -le 150 ]; then
    success "ESLint passed ($WARNING_COUNT warnings)"
else
    error "ESLint FAILED ($WARNING_COUNT warnings > 150)"
fi

# Try to build
echo "   Ejecutando build de prueba..."
if VITE_API_URL=https://d1tgnaj74tv17v.cloudfront.net npm run build > /dev/null 2>&1; then
    success "Frontend build successful"
else
    error "Frontend build FAILED"
fi

cd ..

echo ""
echo "4️⃣  Validando Base de Datos..."
echo "------------------------"

# Check if schema file exists
if [ -f "database/schema_etl_tracking.sql" ]; then
    success "schema_etl_tracking.sql existe"
else
    error "schema_etl_tracking.sql NO existe"
fi

# Check if local DB has the table (if DB exists)
if [ -f "data/fluxion_production.db" ]; then
    TABLE_EXISTS=$(duckdb data/fluxion_production.db "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'etl_ejecuciones'" 2>/dev/null || echo "0")
    if [ "$TABLE_EXISTS" -gt 0 ]; then
        success "Tabla etl_ejecuciones existe en DB local"
    else
        warning "Tabla etl_ejecuciones NO existe en DB local (puede ser normal si DB es nueva)"
    fi
else
    warning "DB local no encontrada en data/fluxion_production.db"
fi

echo ""
echo "5️⃣  Validando Git..."
echo "------------------------"

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "main" ]; then
    success "En branch 'main'"
else
    warning "NO estás en branch 'main' (estás en '$CURRENT_BRANCH')"
fi

# Check if there are uncommitted changes
UNCOMMITTED=$(git status --porcelain | wc -l)
if [ "$UNCOMMITTED" -eq 0 ]; then
    success "No hay cambios sin commitear"
else
    warning "$UNCOMMITTED archivos con cambios sin commitear"
fi

# Check if remote is reachable
if git ls-remote origin main > /dev/null 2>&1; then
    success "Remote 'origin' accesible"
else
    error "NO se puede acceder a remote 'origin'"
fi

echo ""
echo "6️⃣  Validando AWS CLI..."
echo "------------------------"

# Check AWS CLI
if command -v aws &> /dev/null; then
    success "AWS CLI instalado"

    # Check AWS credentials
    if aws sts get-caller-identity > /dev/null 2>&1; then
        ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
        success "AWS credentials válidas (Account: $ACCOUNT_ID)"
    else
        error "AWS credentials NO válidas"
    fi
else
    error "AWS CLI NO instalado"
fi

# Check if FluxionStackV2 exists
if aws cloudformation describe-stacks --stack-name FluxionStackV2 > /dev/null 2>&1; then
    STACK_STATUS=$(aws cloudformation describe-stacks --stack-name FluxionStackV2 --query 'Stacks[0].StackStatus' --output text)
    success "Stack FluxionStackV2 existe (Status: $STACK_STATUS)"
else
    error "Stack FluxionStackV2 NO encontrado en AWS"
fi

echo ""
echo "7️⃣  Validando Documentación..."
echo "------------------------"

if [ -f "docs/PRE_DEPLOY_CHECKLIST.md" ]; then
    success "PRE_DEPLOY_CHECKLIST.md existe"
else
    warning "PRE_DEPLOY_CHECKLIST.md NO existe"
fi

if [ -f "docs/SENTRY_KLK_INTEGRATION.md" ]; then
    success "SENTRY_KLK_INTEGRATION.md existe"
else
    warning "SENTRY_KLK_INTEGRATION.md NO existe"
fi

echo ""
echo "=========================================="
echo "📊 RESUMEN DE VALIDACIÓN"
echo "=========================================="

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ VALIDACIÓN EXITOSA${NC}"
    echo "  Errores: $ERRORS"
    echo "  Warnings: $WARNINGS"
    echo ""
    echo "✅ El código está listo para deploy"
    echo ""
    echo "Próximos pasos:"
    echo "1. Revisar PRE_DEPLOY_CHECKLIST.md"
    echo "2. Configurar SENTRY_DSN en GitHub Secrets"
    echo "3. Hacer commit y push:"
    echo "   git add ."
    echo "   git commit -m 'feat: sistema tracking ETL KLK v2.0 con Sentry'"
    echo "   git push origin main"
    echo ""
    exit 0
else
    echo -e "${RED}✗ VALIDACIÓN FALLIDA${NC}"
    echo "  Errores: $ERRORS"
    echo "  Warnings: $WARNINGS"
    echo ""
    echo "❌ Corrige los errores antes de hacer deploy"
    echo ""
    exit 1
fi
