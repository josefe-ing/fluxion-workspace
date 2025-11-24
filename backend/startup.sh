#!/bin/bash
set -e

# Database path
DB_PATH="/data/fluxion_production.db"
S3_SOURCE="s3://fluxion-backups-611395766952/transfer/fluxion_production.db"

# Check if database already exists in EFS
if [ -f "$DB_PATH" ]; then
    DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
    echo "✅ Database already exists in EFS: $DB_SIZE"
    # Skip chmod - EFS permissions are managed at mount level
    # chmod 666 "$DB_PATH" 2>/dev/null || echo "✅ Database file already has correct permissions"
else
    echo "📦 Database not found in EFS, downloading from S3..."
    echo "⬇️  Source: $S3_SOURCE"
    echo "⏱️  Expected time: 3-5 minutes for 16GB database..."

    # Download from S3 in background and monitor progress
    aws s3 cp "$S3_SOURCE" "$DB_PATH" &
    DOWNLOAD_PID=$!

    # Monitor download progress
    echo "Download started (PID: $DOWNLOAD_PID)"
    while kill -0 $DOWNLOAD_PID 2>/dev/null; do
        if [ -f "$DB_PATH" ]; then
            CURRENT_SIZE=$(du -h "$DB_PATH" 2>/dev/null | cut -f1 || echo "0")
            echo "  Progress: $CURRENT_SIZE downloaded..."
        fi
        sleep 10
    done

    # Wait for download to complete
    wait $DOWNLOAD_PID
    DOWNLOAD_EXIT=$?

    # Verify download
    if [ $DOWNLOAD_EXIT -eq 0 ] && [ -f "$DB_PATH" ]; then
        DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
        echo "✅ Database downloaded successfully: $DB_SIZE"

        # Skip chmod - EFS permissions are managed at mount level
        # chmod 666 "$DB_PATH" 2>/dev/null || echo "✅ Database file already has correct permissions"
    else
        echo "❌ Error: Database download failed (exit code: $DOWNLOAD_EXIT)"
        echo "Checking S3 file existence..."
        aws s3 ls "$S3_SOURCE" || echo "S3 file not found!"
        exit 1
    fi
fi

# Note: Authentication schema will be initialized automatically by FastAPI startup event
# via auto_bootstrap_admin() function in auth.py

# Run database migrations
# TEMPORARILY DISABLED: Migrations cause lock conflicts during rolling deploys
# since DuckDB doesn't support multiple connections during startup.
# Migrations should be run as one-off ECS tasks or via admin endpoints.
echo "⏭️  Skipping migrations (disabled to avoid lock conflicts during deploy)"
# python3 /app/run_migrations.py
# if [ $? -eq 0 ]; then
#     echo "✅ Migrations completed successfully"
# else
#     echo "❌ Migration failed"
#     exit 1
# fi

# Start the application
echo "🚀 Starting Uvicorn server..."
# Use single worker to avoid DuckDB file locking issues
exec uvicorn main:app --host 0.0.0.0 --port 8001 --workers 1
