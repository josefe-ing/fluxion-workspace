#!/bin/bash
# Script para restaurar la base de datos DESCOMPRIMIDA desde S3 a EFS
# Este enfoque evita problemas de timeout/memoria al descomprimir

set -e

echo "=========================================="
echo "FLUXION DB RESTORATION FROM S3 (DIRECT)"
echo "=========================================="
echo ""

S3_BUCKET="fluxion-backups-v2-611395766952"
S3_FILE="production_db_uncompressed_20251011.db"
DB_PATH="${DATABASE_PATH:-/data/fluxion_production.db}"
BACKUP_PATH="/data/fluxion_production.db.backup_$(date +%Y%m%d_%H%M%S)"

echo "1. Creando backup de BD actual..."
if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$BACKUP_PATH"
    echo "   ✓ Backup creado en: $BACKUP_PATH"
    echo "   Tamaño: $(du -h $BACKUP_PATH | cut -f1)"
else
    echo "   ⚠ No hay BD existente, saltando backup"
fi

echo ""
echo "2. Descargando BD descomprimida desde S3 (15GB)..."
echo "   Esto tomará ~3-5 minutos"
echo ""

# Download directly - no decompression needed
aws s3 cp "s3://${S3_BUCKET}/${S3_FILE}" "$DB_PATH" --no-progress

echo ""
echo "3. Verificando integridad..."
if [ -f "$DB_PATH" ]; then
    DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
    echo "   ✓ BD restaurada exitosamente"
    echo "   Tamaño: $DB_SIZE"
else
    echo "   ✗ ERROR: No se pudo restaurar la BD"
    if [ -f "$BACKUP_PATH" ]; then
        echo "   Restaurando desde backup..."
        cp "$BACKUP_PATH" "$DB_PATH"
    fi
    exit 1
fi

echo ""
echo "4. Aplicando índices de optimización..."
python3 << 'PYTHON_SCRIPT'
import duckdb
import os

db_path = os.getenv('DATABASE_PATH', '/data/fluxion_production.db')
print(f"   Conectando a: {db_path}")
conn = duckdb.connect(db_path)

# Leer y ejecutar el script de índices
index_script_path = '/app/database/indexes_ventas_optimization.sql'
print(f"   Leyendo: {index_script_path}")

with open(index_script_path, 'r') as f:
    sql = f.read()

print("   Ejecutando creación de índices...")
conn.execute(sql)
conn.close()

print("   ✓ Índices aplicados exitosamente")
PYTHON_SCRIPT

echo ""
echo "=========================================="
echo "RESTAURACIÓN COMPLETADA"
echo "=========================================="
echo ""
echo "BD actualizada en: $DB_PATH"
echo "Backup anterior en: $BACKUP_PATH"
echo ""
echo "NOTA: Reinicia el servicio backend para que use la nueva BD"
