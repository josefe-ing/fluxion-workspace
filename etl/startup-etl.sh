#!/bin/bash
# ========================================
# Startup Script - Fluxion ETL (Production)
# ========================================
set -e

echo "========================================"
echo "🚀 Fluxion ETL - Starting"
echo "========================================"
echo "📅 Date: $(date)"
echo "🌍 Region: ${AWS_REGION:-us-east-1}"
echo "📦 Environment: ${ENVIRONMENT:-production}"
echo ""

# ========================================
# 1. Load SQL Credentials from Secrets Manager
# ========================================
echo "🔐 Loading SQL credentials from AWS Secrets Manager..."

if [ -n "$AWS_REGION" ]; then
    SECRET_JSON=$(aws secretsmanager get-secret-value \
        --secret-id fluxion/sql-credentials \
        --region "$AWS_REGION" \
        --query SecretString \
        --output text 2>&1)

    if [ $? -eq 0 ]; then
        export SQL_USER=$(echo "$SECRET_JSON" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
        export SQL_PASS=$(echo "$SECRET_JSON" | grep -o '"password":"[^"]*"' | cut -d'"' -f4)

        if [ -n "$SQL_USER" ] && [ -n "$SQL_PASS" ]; then
            echo "✅ SQL credentials loaded successfully"
            echo "   Username: $SQL_USER"
        else
            echo "⚠️  Warning: Could not parse SQL credentials from secret"
            echo "   Using fallback credentials from environment"
        fi
    else
        echo "⚠️  Warning: Could not fetch secret from Secrets Manager"
        echo "   Error: $SECRET_JSON"
        echo "   Using fallback credentials from environment"
    fi
else
    echo "⚠️  AWS_REGION not set, skipping Secrets Manager"
    echo "   Using credentials from environment variables"
fi

# Load SendGrid API key and notification settings from Secrets Manager
echo ""
echo "📧 Loading SendGrid credentials from AWS Secrets Manager..."

if [ -n "$AWS_REGION" ]; then
    SENDGRID_SECRET=$(aws secretsmanager get-secret-value \
        --secret-id fluxion/production \
        --region "$AWS_REGION" \
        --query SecretString \
        --output text 2>&1)

    if [ $? -eq 0 ]; then
        export SENDGRID_API_KEY=$(echo "$SENDGRID_SECRET" | grep -o '"SENDGRID_API_KEY":"[^"]*"' | cut -d'"' -f4)
        export SENDGRID_FROM_EMAIL=$(echo "$SENDGRID_SECRET" | grep -o '"SENDGRID_FROM_EMAIL":"[^"]*"' | cut -d'"' -f4)
        export NOTIFICATION_EMAILS=$(echo "$SENDGRID_SECRET" | grep -o '"NOTIFICATION_EMAILS":"[^"]*"' | cut -d'"' -f4)

        if [ -n "$SENDGRID_API_KEY" ]; then
            echo "✅ SendGrid API key loaded successfully"
            [ -n "$SENDGRID_FROM_EMAIL" ] && echo "   From: $SENDGRID_FROM_EMAIL"
            [ -n "$NOTIFICATION_EMAILS" ] && echo "   To: $NOTIFICATION_EMAILS"
        else
            echo "⚠️  Warning: SendGrid API key not found in secrets"
            echo "   Email notifications will be disabled"
        fi
    else
        echo "⚠️  Warning: Could not fetch SendGrid secrets"
        echo "   Email notifications will be disabled"
    fi
else
    echo "⚠️  AWS_REGION not set, skipping SendGrid secrets"
fi

# ========================================
# 2. Verify Database Connection
# ========================================
echo ""
echo "🔍 Verifying DuckDB access..."

# Use DATABASE_PATH from environment or default to /data
DB_PATH="${DATABASE_PATH:-/data/fluxion_production.db}"
DB_DIR=$(dirname "$DB_PATH")

echo "   Database path: $DB_PATH"
echo "   Database directory: $DB_DIR"

if [ -f "$DB_PATH" ]; then
    DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
    echo "✅ DuckDB found: $DB_SIZE"
else
    echo "⚠️  Warning: DuckDB file not found at $DB_PATH"
    echo "   ETL will attempt to create it if it doesn't exist"
fi

# Ensure directory exists
if [ ! -d "$DB_DIR" ]; then
    echo "📁 Creating database directory: $DB_DIR"
    mkdir -p "$DB_DIR" || {
        echo "❌ ERROR: Could not create directory $DB_DIR"
        exit 1
    }
fi

# Check write permissions
if touch "$DB_DIR/.write_test" 2>/dev/null; then
    rm -f "$DB_DIR/.write_test"
    echo "✅ Write permissions verified for $DB_DIR"
else
    echo "❌ ERROR: No write permissions to $DB_DIR directory"
    echo "   This will cause ETL to fail!"
    exit 1
fi

# ========================================
# 3. Test VPN Connectivity (Quick Check)
# ========================================
echo ""
echo "🌐 Testing VPN connectivity to La Granja..."

# Test connectivity to one known SQL Server (BOSQUE - tienda_08)
TEST_IP="192.168.150.10"
TEST_PORT="14348"

if timeout 5 bash -c "cat < /dev/null > /dev/tcp/$TEST_IP/$TEST_PORT" 2>/dev/null; then
    echo "✅ VPN connectivity OK (reached $TEST_IP:$TEST_PORT)"
else
    echo "⚠️  Warning: Could not reach $TEST_IP:$TEST_PORT"
    echo "   VPN might be down or SQL Server unreachable"
    echo "   ETL will continue but may fail on extraction"
fi

# ========================================
# 4. Determine which ETL to run
# ========================================
echo ""
echo "📊 ETL Mode: ${ETL_MODE:-inventario}"

ETL_SCRIPT="${ETL_MODE:-etl_inventario.py}"

# Validate script exists
if [ ! -f "/app/$ETL_SCRIPT" ]; then
    echo "❌ ERROR: ETL script not found: $ETL_SCRIPT"
    echo "   Available scripts:"
    ls -la /app/*.py | grep etl
    exit 1
fi

# ========================================
# 5. Run ETL with arguments
# ========================================
echo ""

# Para ETL de ventas programado, calcular fecha de ayer automáticamente
# si no se proporcionaron fechas específicas en ETL_ARGS
if [[ "$ETL_SCRIPT" == "etl_ventas_multi_tienda.py" ]] && [[ ! "$ETL_ARGS" =~ "--fecha-inicio" ]]; then
    AYER=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date -v -1d +%Y-%m-%d 2>/dev/null)
    ETL_ARGS="--todas --fecha-inicio $AYER --fecha-fin $AYER"
    echo "📅 ETL de ventas programado - calculando fecha automáticamente"
    echo "   Fecha calculada: $AYER (ayer)"
fi

echo "▶️  Executing: python3 $ETL_SCRIPT $ETL_ARGS"
echo "========================================"
echo ""

# Remove old success flag
rm -f /app/logs/etl_last_success.flag

# Execute ETL and capture exit code
START_TIME=$(date +%s)

if python3 "/app/$ETL_SCRIPT" $ETL_ARGS; then
    EXIT_CODE=0
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    echo ""
    echo "========================================"
    echo "✅ ETL completed successfully"
    echo "⏱️  Duration: ${DURATION}s"
    echo "📅 Completed at: $(date)"
    echo "========================================"

    # Create success flag for health check
    date > /app/logs/etl_last_success.flag
else
    EXIT_CODE=$?
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    echo ""
    echo "========================================"
    echo "❌ ETL failed with exit code: $EXIT_CODE"
    echo "⏱️  Duration: ${DURATION}s"
    echo "📅 Failed at: $(date)"
    echo "========================================"
fi

# ========================================
# 6. Cleanup and Exit
# ========================================
echo ""
echo "🧹 Cleanup completed"

# For scheduled tasks, we want to exit with the ETL's exit code
# For long-running containers, we might want to sleep and retry
if [ "$RUN_MODE" = "scheduled" ]; then
    echo "🏁 Exiting with code: $EXIT_CODE"
    exit $EXIT_CODE
else
    # If running as a service, keep container alive
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ ETL successful - Container will exit"
        exit 0
    else
        echo "❌ ETL failed - Container will exit with error"
        exit $EXIT_CODE
    fi
fi
