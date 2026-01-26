#!/bin/bash
set -e

echo "🔍 STARTUP BEGIN - $(date)"
echo "📊 Container memory limit: 2GB (2048 MiB)"
echo "🖥️  Container CPU: 1 vCPU"
echo ""

# PostgreSQL-only architecture (DuckDB removed Dec 2025)
# Database connection is handled by db_config.py using environment variables

echo "📝 MIGRATIONS CHECK"
# Run database migrations
# TEMPORARILY DISABLED: Migrations should be run as one-off ECS tasks or via admin endpoints.
echo "⏭️  Skipping migrations (run manually via admin endpoints)"
# python3 /app/run_migrations.py

echo ""
echo "🚀 STARTING UVICORN"
echo "✅ auto_bootstrap_admin() ENABLED - authentication tables will be initialized"
echo "📊 Expected RAM usage: ~1-2GB (FastAPI + PostgreSQL connection)"
echo ""

# Workers configured via CDK (UVICORN_WORKERS env var), fallback to 2 if not set
WORKERS=${UVICORN_WORKERS:-2}

# Start the application
echo "▶️  Starting Uvicorn server on port 8001 with $WORKERS workers..."
exec uvicorn main:app --host 0.0.0.0 --port 8001 --workers $WORKERS
