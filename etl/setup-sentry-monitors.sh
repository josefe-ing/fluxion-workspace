#!/bin/bash
# ========================================
# Setup Sentry Cron Monitors
# ========================================
# Este script crea los monitores de cron en Sentry para las tareas de ETL
# Requiere: sentry-cli instalado y configurado

set -e

echo "========================================"
echo "🔧 Configurando Sentry Cron Monitors"
echo "========================================"
echo ""

# Verificar que sentry-cli está instalado
if ! command -v sentry-cli &> /dev/null; then
    echo "❌ ERROR: sentry-cli no está instalado"
    echo "   Instálalo con: npm install -g @sentry/cli"
    exit 1
fi

# Verificar que estamos autenticados
if ! sentry-cli info &> /dev/null; then
    echo "❌ ERROR: sentry-cli no está autenticado"
    echo "   Auténtica con: sentry-cli login"
    exit 1
fi

SENTRY_ORG="jose-felipe-lopez"
SENTRY_PROJECT="fluxion"

echo "📊 Organización: $SENTRY_ORG"
echo "📦 Proyecto: $SENTRY_PROJECT"
echo ""

# ========================================
# Monitor 1: Ventas ETL (Daily at 1:00 AM)
# ========================================
echo "1️⃣  Creando monitor: Fluxion Ventas ETL"
sentry-cli monitors run \
    --org "$SENTRY_ORG" \
    --project "$SENTRY_PROJECT" \
    fluxion-ventas-etl \
    --schedule "0 5 * * *" \
    --checkin-margin 10 \
    --max-runtime 120 \
    --timezone UTC \
    -- echo "Monitor configured"

echo "   ✅ Monitor creado: fluxion-ventas-etl"
echo "   📅 Schedule: 0 5 * * * UTC (1:00 AM Venezuela)"
echo ""

# ========================================
# Monitor 2: Inventario ETL Morning (5:00 AM)
# ========================================
echo "2️⃣  Creando monitor: Fluxion Inventario ETL (Morning)"
sentry-cli monitors run \
    --org "$SENTRY_ORG" \
    --project "$SENTRY_PROJECT" \
    fluxion-inventario-etl-morning \
    --schedule "0 9 * * *" \
    --checkin-margin 10 \
    --max-runtime 120 \
    --timezone UTC \
    -- echo "Monitor configured"

echo "   ✅ Monitor creado: fluxion-inventario-etl-morning"
echo "   📅 Schedule: 0 9 * * * UTC (5:00 AM Venezuela)"
echo ""

# ========================================
# Monitor 3: Inventario ETL Afternoon (3:00 PM)
# ========================================
echo "3️⃣  Creando monitor: Fluxion Inventario ETL (Afternoon)"
sentry-cli monitors run \
    --org "$SENTRY_ORG" \
    --project "$SENTRY_PROJECT" \
    fluxion-inventario-etl-afternoon \
    --schedule "0 19 * * *" \
    --checkin-margin 10 \
    --max-runtime 120 \
    --timezone UTC \
    -- echo "Monitor configured"

echo "   ✅ Monitor creado: fluxion-inventario-etl-afternoon"
echo "   📅 Schedule: 0 19 * * * UTC (3:00 PM Venezuela)"
echo ""

echo "========================================"
echo "✅ Todos los monitores configurados"
echo "========================================"
echo ""
echo "🔗 Ver en Sentry:"
echo "   https://jose-felipe-lopez.sentry.io/crons/"
echo ""
echo "📝 Configuración:"
echo "   - checkin_margin: 10 minutos"
echo "   - max_runtime: 120 minutos (2 horas)"
echo "   - timezone: UTC"
echo ""
