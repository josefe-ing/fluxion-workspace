#!/bin/bash
#
# Backup a Google Drive usando rclone
# Prerequisito: rclone configurado con Google Drive
# Setup: rclone config (crear remote llamado "gdrive")
# Uso: ./scripts/backup_cloud_gdrive.sh
#

set -e

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}☁️  FLUXION AI - Backup a Google Drive${NC}"
echo "========================================"
echo ""

# Verificar que rclone está instalado
if ! command -v rclone &> /dev/null; then
    echo -e "${RED}❌ Error: rclone no está instalado${NC}"
    echo "Instalar con: brew install rclone"
    echo "Configurar con: rclone config"
    exit 1
fi

# Verificar que gdrive está configurado
if ! rclone listremotes | grep -q "gdrive:"; then
    echo -e "${RED}❌ Error: Google Drive no configurado en rclone${NC}"
    echo "Configurar con: rclone config"
    echo "Nombre del remote: gdrive"
    exit 1
fi

DATE=$(date +%Y%m%d)
TEMP_FILE="/tmp/fluxion_backup_$DATE.tar.gz"

# Verificar que existen las bases de datos
if [ ! -f "data/fluxion_production.db" ]; then
    echo -e "${RED}❌ Error: No se encuentra data/fluxion_production.db${NC}"
    exit 1
fi

echo "📦 Comprimiendo base de datos..."
echo "   Origen: data/"
echo "   Destino: $TEMP_FILE"
echo ""

# Comprimir datos (esto puede tardar unos minutos)
tar -czf "$TEMP_FILE" data/ 2>&1 | while read line; do
    echo "   $line"
done

# Obtener tamaño del archivo
SIZE=$(ls -lh "$TEMP_FILE" | awk '{print $5}')
echo -e "${GREEN}✅ Compresión completada: $SIZE${NC}"
echo ""

echo "☁️  Subiendo a Google Drive..."
echo "   Remote: gdrive:fluxion-backups/"
echo "   Archivo: fluxion_backup_$DATE.tar.gz"
echo ""

# Subir a Google Drive
rclone copy "$TEMP_FILE" gdrive:fluxion-backups/ \
    --progress \
    --stats-one-line

echo ""
echo -e "${GREEN}✅ Backup subido a Google Drive${NC}"
echo ""

# Limpiar archivo temporal
echo "🧹 Limpiando archivo temporal..."
rm "$TEMP_FILE"
echo -e "${GREEN}✅ Limpieza completada${NC}"
echo ""

# Listar backups en Google Drive
echo "📊 Backups disponibles en Google Drive:"
rclone ls gdrive:fluxion-backups/ | tail -5

echo ""
echo "========================================"
echo -e "${GREEN}✅ BACKUP CLOUD COMPLETADO${NC}"
echo "========================================"
echo ""
echo "💡 Para listar todos los backups:"
echo "   rclone ls gdrive:fluxion-backups/"
echo ""
echo "💡 Para descargar un backup:"
echo "   rclone copy gdrive:fluxion-backups/fluxion_backup_$DATE.tar.gz /tmp/"
echo ""
