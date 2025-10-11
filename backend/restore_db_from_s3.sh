#!/bin/bash
# Script para restaurar la base de datos desde S3 a EFS
# Ejecutar en el contenedor ECS del backend

set -e

echo "=== Restaurando BD desde S3 a EFS ==="

S3_BUCKET="fluxion-backups-v2-611395766952"
S3_FILE="production_db_backup_20251011.db.gz"
DB_PATH="${DATABASE_PATH:-/data/fluxion_production.db}"
BACKUP_PATH="/data/fluxion_production.db.backup_$(date +%Y%m%d_%H%M%S)"

echo "1. Creando backup de BD actual..."
if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$BACKUP_PATH"
    echo "   Backup creado en: $BACKUP_PATH"
else
    echo "   No hay BD existente, saltando backup"
fi

echo "2. Descargando BD desde S3..."
aws s3 cp "s3://${S3_BUCKET}/${S3_FILE}" /tmp/db_restore.db.gz

echo "3. Descomprimiendo..."
gunzip -c /tmp/db_restore.db.gz > "$DB_PATH"

echo "4. Verificando integridad..."
if [ -f "$DB_PATH" ]; then
    echo "   BD restaurada exitosamente"
    echo "   Tamaño: $(du -h $DB_PATH | cut -f1)"
    rm /tmp/db_restore.db.gz
else
    echo "   ERROR: No se pudo restaurar la BD"
    if [ -f "$BACKUP_PATH" ]; then
        echo "   Restaurando desde backup..."
        cp "$BACKUP_PATH" "$DB_PATH"
    fi
    exit 1
fi

echo "5. Aplicando índices de optimización..."
python3 << 'PYTHON_SCRIPT'
import duckdb
import os

db_path = os.getenv('DATABASE_PATH', '/data/fluxion_production.db')
conn = duckdb.connect(db_path)

# Leer y ejecutar el script de índices
with open('/app/database/indexes_ventas_optimization.sql', 'r') as f:
    sql = f.read()

conn.execute(sql)
conn.close()

print("   ✓ Índices aplicados exitosamente")
PYTHON_SCRIPT

echo ""
echo "=== Restauración completada ==="
echo "BD actualizada en: $DB_PATH"
echo "Backup anterior en: $BACKUP_PATH"
echo ""
echo "IMPORTANTE: Reiniciar el servicio backend para que tome la nueva BD"
