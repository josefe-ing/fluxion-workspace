#!/bin/bash
set -e

# Database path
DB_PATH="/data/fluxion_production.db"
S3_SOURCE="s3://fluxion-backups-611395766952/transfer/fluxion_production.db"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "📦 Database not found at $DB_PATH"
    echo "⬇️  Downloading from S3: $S3_SOURCE"

    # Download from S3
    aws s3 cp "$S3_SOURCE" "$DB_PATH" --no-progress

    # Verify download
    if [ -f "$DB_PATH" ]; then
        DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
        echo "✅ Database downloaded successfully: $DB_SIZE"
    else
        echo "❌ Error: Database download failed"
        exit 1
    fi
else
    DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
    echo "✅ Database already exists: $DB_SIZE"
fi

# Start the application
echo "🚀 Starting Uvicorn server..."
# Use single worker to avoid DuckDB file locking issues
exec uvicorn main:app --host 0.0.0.0 --port 8001 --workers 1
