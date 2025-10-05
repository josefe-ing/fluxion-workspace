#!/bin/bash
#
# Backup inmediato de la base de datos DuckDB
# Uso: ./scripts/backup_now.sh
#

set -e

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛡️  FLUXION AI - Backup Inmediato${NC}"
echo "=================================="
echo ""

# Configuración
BACKUP_DIR="$HOME/fluxion-backups"
DATE=$(date +%Y%m%d_%H%M%S)
DATE_SIMPLE=$(date +%Y%m%d)

# Crear directorio si no existe
mkdir -p "$BACKUP_DIR"

echo "📁 Directorio de backup: $BACKUP_DIR"
echo "📅 Timestamp: $DATE"
echo ""

# Verificar que existen las bases de datos
if [ ! -f "data/fluxion_production.db" ]; then
    echo "❌ Error: No se encuentra data/fluxion_production.db"
    exit 1
fi

# Backup base principal
echo "📦 Copiando fluxion_production.db..."
cp data/fluxion_production.db "$BACKUP_DIR/fluxion_production_$DATE.db"
echo -e "${GREEN}✅ Backup principal completado${NC}"

# Backup base analytics (si existe)
if [ -f "data/granja_analytics.db" ]; then
    echo "📦 Copiando granja_analytics.db..."
    cp data/granja_analytics.db "$BACKUP_DIR/granja_analytics_$DATE.db"
    echo -e "${GREEN}✅ Backup analytics completado${NC}"
fi

# Crear symlink al backup más reciente
ln -sf "$BACKUP_DIR/fluxion_production_$DATE.db" "$BACKUP_DIR/latest_production.db"
if [ -f "data/granja_analytics.db" ]; then
    ln -sf "$BACKUP_DIR/granja_analytics_$DATE.db" "$BACKUP_DIR/latest_analytics.db"
fi

echo ""
echo "=================================="
echo -e "${GREEN}✅ BACKUP COMPLETADO${NC}"
echo "=================================="
echo ""
echo "📊 Archivos creados:"
ls -lh "$BACKUP_DIR" | grep "$DATE_SIMPLE"
echo ""
echo "💡 Backups disponibles en: $BACKUP_DIR"
echo "🔗 Último backup: $BACKUP_DIR/latest_production.db"
echo ""
