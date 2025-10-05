#!/bin/bash
# Transfer DuckDB from S3 to EFS
# Este script se ejecuta dentro de una EC2 instance

set -e

echo "=== Fluxion DB Transfer: S3 → EFS ==="
echo "$(date '+%Y-%m-%d %H:%M:%S') - Iniciando transferencia..."

# Variables
S3_BUCKET="fluxion-backups-611395766952"
S3_KEY="transfer/fluxion_production.db"
EFS_MOUNT="/mnt/efs"
DB_PATH="$EFS_MOUNT/fluxion_production.db"

# Verificar que EFS está montado
if ! mountpoint -q "$EFS_MOUNT"; then
    echo "ERROR: EFS no está montado en $EFS_MOUNT"
    exit 1
fi

echo "✓ EFS montado correctamente"

# Descargar de S3
echo "Descargando desde s3://$S3_BUCKET/$S3_KEY ..."
aws s3 cp "s3://$S3_BUCKET/$S3_KEY" "$DB_PATH" --no-progress

# Verificar tamaño
DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
echo "✓ Base de datos descargada: $DB_SIZE"

# Verificar integridad (DuckDB checksum)
echo "Verificando integridad con DuckDB..."
if command -v duckdb &> /dev/null; then
    duckdb "$DB_PATH" "SELECT COUNT(*) as tables FROM information_schema.tables;" || echo "WARN: No se pudo verificar con DuckDB"
else
    echo "WARN: DuckDB no instalado, saltando verificación"
fi

# Permisos
chmod 644 "$DB_PATH"
echo "✓ Permisos configurados"

echo "$(date '+%Y-%m-%d %H:%M:%S') - ✅ Transferencia completada exitosamente"
echo ""
echo "Base de datos disponible en: $DB_PATH"
echo "Tamaño: $DB_SIZE"
