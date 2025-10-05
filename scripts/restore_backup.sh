#!/bin/bash
#
# Restaurar base de datos desde backup
# Uso: ./scripts/restore_backup.sh [archivo_backup]
# Ejemplo: ./scripts/restore_backup.sh ~/fluxion-backups/fluxion_production_20251002_120000.db
#

set -e

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🔄 FLUXION AI - Restaurar Backup${NC}"
echo "=================================="
echo ""

# Verificar argumento
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Debe especificar el archivo de backup${NC}"
    echo ""
    echo "Uso: $0 [archivo_backup]"
    echo ""
    echo "Backups disponibles:"
    ls -lht ~/fluxion-backups/*.db 2>/dev/null | head -10 || echo "  (ninguno)"
    echo ""
    exit 1
fi

BACKUP_FILE="$1"

# Verificar que existe el backup
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Error: Archivo no encontrado: $BACKUP_FILE${NC}"
    exit 1
fi

# Obtener info del backup
BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
BACKUP_DATE=$(ls -l "$BACKUP_FILE" | awk '{print $6, $7, $8}')

echo "📄 Archivo de backup:"
echo "   Ruta: $BACKUP_FILE"
echo "   Tamaño: $BACKUP_SIZE"
echo "   Fecha: $BACKUP_DATE"
echo ""

# Confirmar
echo -e "${YELLOW}⚠️  ADVERTENCIA: Esto sobrescribirá la base de datos actual${NC}"
echo ""
read -p "¿Continuar con la restauración? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Restauración cancelada"
    exit 0
fi

# Hacer backup de la DB actual antes de sobrescribir
if [ -f "data/fluxion_production.db" ]; then
    echo ""
    echo "📦 Creando backup de seguridad de la DB actual..."
    SAFETY_BACKUP="data/fluxion_production_before_restore_$(date +%Y%m%d_%H%M%S).db"
    cp data/fluxion_production.db "$SAFETY_BACKUP"
    echo -e "${GREEN}✅ Backup de seguridad creado: $SAFETY_BACKUP${NC}"
fi

echo ""
echo "🔄 Restaurando base de datos..."

# Restaurar
cp "$BACKUP_FILE" data/fluxion_production.db

echo -e "${GREEN}✅ Restauración completada${NC}"
echo ""

# Verificar
echo "🔍 Verificando base de datos restaurada..."
if command -v duckdb &> /dev/null; then
    RECORD_COUNT=$(duckdb data/fluxion_production.db "SELECT COUNT(*) FROM ventas" 2>/dev/null || echo "N/A")
    echo "   Registros en tabla ventas: $RECORD_COUNT"
else
    echo "   (duckdb no instalado, verificación manual requerida)"
fi

echo ""
echo "=================================="
echo -e "${GREEN}✅ RESTORE COMPLETADO${NC}"
echo "=================================="
echo ""
echo "💡 Base de datos restaurada desde: $BACKUP_FILE"
if [ -f "$SAFETY_BACKUP" ]; then
    echo "🛡️  Backup de seguridad guardado en: $SAFETY_BACKUP"
fi
echo ""
