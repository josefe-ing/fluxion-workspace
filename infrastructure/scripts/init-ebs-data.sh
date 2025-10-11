#!/bin/bash
# Script to initialize EBS volume with database from S3
# This runs on EC2 instance startup via user data

set -e

DATA_DIR="/mnt/data"
DB_FILE="$DATA_DIR/fluxion_production.db"
S3_SOURCE="s3://fluxion-backups-v2-611395766952/production_db_uncompressed_20251011.db"

echo "=== Fluxion EBS Data Initialization ==="
echo "Checking if database exists at $DB_FILE"

if [ -f "$DB_FILE" ]; then
    echo "✅ Database already exists ($(du -h $DB_FILE | cut -f1))"
    echo "Skipping download from S3"
else
    echo "📦 Database not found, downloading from S3..."
    echo "Source: $S3_SOURCE"
    echo "This will take 3-5 minutes for 15GB download"

    # Download database from S3
    aws s3 cp "$S3_SOURCE" "$DB_FILE" --region us-east-1

    if [ -f "$DB_FILE" ]; then
        echo "✅ Database downloaded successfully"
        echo "Size: $(du -h $DB_FILE | cut -f1)"

        # Set correct permissions
        chown 1000:1000 "$DB_FILE"
        chmod 644 "$DB_FILE"
    else
        echo "❌ Failed to download database"
        exit 1
    fi
fi

echo "=== Initialization complete ==="
