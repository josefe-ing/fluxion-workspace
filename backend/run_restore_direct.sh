#!/bin/bash
# Script wrapper para ejecutar la restauración directa de la BD

set -e

echo "=========================================="
echo "FLUXION DB RESTORATION (DIRECT METHOD)"
echo "=========================================="
echo ""
echo "Este script descarga la BD descomprimida (15GB)"
echo "desde S3 y la restaura en EFS, evitando problemas"
echo "de memoria/timeout de la descompresión."
echo ""

# Run the restore script
bash /app/restore_db_direct.sh

echo ""
echo "=========================================="
echo "¡Restauración completada exitosamente!"
echo "=========================================="
echo ""
echo "PRÓXIMOS PASOS:"
echo "1. Reiniciar el servicio backend"
echo "2. Verificar performance de producción"
echo ""
