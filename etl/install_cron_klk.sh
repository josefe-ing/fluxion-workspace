#!/bin/bash
################################################################################
# Instalador de Cron Jobs para ETL KLK en Tiempo Real
#
# Este script configura los cron jobs automáticamente para:
#   - Inventario KLK: Cada 30 minutos (00, 30)
#   - Ventas KLK: Cada 30 minutos con offset de 5 min (05, 35)
#
# Uso:
#   ./install_cron_klk.sh [install|uninstall|status]
################################################################################

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Rutas
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRON_SCRIPT="${SCRIPT_DIR}/cron_klk_realtime.sh"

# Cron entries
CRON_INVENTARIO="0,30 * * * * ${CRON_SCRIPT} inventario"
CRON_VENTAS="5,35 * * * * ${CRON_SCRIPT} ventas"

# Funciones
print_header() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║     Instalador de Cron Jobs ETL KLK - Tiempo Real         ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
}

check_prerequisites() {
    echo -e "${YELLOW}📋 Verificando prerequisitos...${NC}"

    if [ ! -f "${CRON_SCRIPT}" ]; then
        echo -e "${RED}❌ Error: ${CRON_SCRIPT} no encontrado${NC}"
        exit 1
    fi

    if [ ! -x "${CRON_SCRIPT}" ]; then
        echo -e "${YELLOW}⚠️  ${CRON_SCRIPT} no es ejecutable, aplicando permisos...${NC}"
        chmod +x "${CRON_SCRIPT}"
    fi

    echo -e "${GREEN}✅ Prerequisitos OK${NC}"
}

install_cron() {
    echo ""
    echo -e "${YELLOW}📦 Instalando cron jobs KLK...${NC}"

    # Backup del crontab actual
    crontab -l > /tmp/crontab_backup_$(date +%Y%m%d_%H%M%S).txt 2>/dev/null || true

    # Verificar si ya existen las entradas
    if crontab -l 2>/dev/null | grep -q "cron_klk_realtime.sh"; then
        echo -e "${YELLOW}⚠️  Cron jobs KLK ya están instalados${NC}"
        echo ""
        echo "Para reinstalar, primero ejecuta: $0 uninstall"
        exit 1
    fi

    # Agregar nuevas entradas
    (crontab -l 2>/dev/null || echo "") | {
        cat
        echo ""
        echo "# =========================================="
        echo "# ETL KLK - Actualizaciones en Tiempo Real"
        echo "# =========================================="
        echo ""
        echo "# Inventario cada 30 minutos (00, 30)"
        echo "${CRON_INVENTARIO}"
        echo ""
        echo "# Ventas cada 30 minutos con offset 5 min (05, 35)"
        echo "${CRON_VENTAS}"
        echo ""
    } | crontab -

    echo -e "${GREEN}✅ Cron jobs instalados exitosamente${NC}"
    show_schedule
}

uninstall_cron() {
    echo ""
    echo -e "${YELLOW}🗑️  Desinstalando cron jobs KLK...${NC}"

    # Backup del crontab actual
    crontab -l > /tmp/crontab_backup_$(date +%Y%m%d_%H%M%S).txt 2>/dev/null || true

    # Remover entradas de KLK
    crontab -l 2>/dev/null | grep -v "cron_klk_realtime.sh" | grep -v "ETL KLK" | grep -v "Inventario cada 30" | grep -v "Ventas cada 30" | crontab - || true

    echo -e "${GREEN}✅ Cron jobs desinstalados${NC}"
}

show_status() {
    echo ""
    echo -e "${YELLOW}📊 Estado de Cron Jobs KLK:${NC}"
    echo ""

    if crontab -l 2>/dev/null | grep -q "cron_klk_realtime.sh"; then
        echo -e "${GREEN}✅ INSTALADO${NC}"
        echo ""
        echo "Cron jobs activos:"
        echo "──────────────────────────────────────────────────────────"
        crontab -l 2>/dev/null | grep "cron_klk_realtime.sh" || true
        echo "──────────────────────────────────────────────────────────"
        echo ""
        show_schedule
        show_logs
    else
        echo -e "${RED}❌ NO INSTALADO${NC}"
        echo ""
        echo "Para instalar, ejecuta: $0 install"
    fi
}

show_schedule() {
    echo ""
    echo -e "${YELLOW}📅 Horario de Ejecución:${NC}"
    echo ""
    echo "  🗄️  INVENTARIO: Cada 30 minutos"
    echo "      00:00, 00:30, 01:00, 01:30, 02:00, 02:30, ..."
    echo ""
    echo "  💰 VENTAS: Cada 30 minutos (5 min después)"
    echo "      00:05, 00:35, 01:05, 01:35, 02:05, 02:35, ..."
    echo ""
    echo "  ⏱️  Total: 48 ejecuciones de inventario + 48 de ventas por día"
    echo ""
}

show_logs() {
    echo -e "${YELLOW}📝 Logs:${NC}"
    echo "  ${SCRIPT_DIR}/logs/cron_klk_inventario_$(date +%Y%m%d).log"
    echo "  ${SCRIPT_DIR}/logs/cron_klk_ventas_$(date +%Y%m%d).log"
    echo ""
    echo "  Para monitorear en tiempo real:"
    echo "  tail -f ${SCRIPT_DIR}/logs/cron_klk_*.log"
    echo ""
}

test_execution() {
    echo ""
    echo -e "${YELLOW}🧪 Ejecutando prueba de ETL...${NC}"
    echo ""

    echo "1️⃣  Probando ETL de Inventario (dry-run)..."
    cd "${SCRIPT_DIR}"
    source venv/bin/activate && python3 core/etl_inventario_klk.py --dry-run --tiendas tienda_01

    echo ""
    echo "2️⃣  Probando ETL de Ventas (dry-run)..."
    source venv/bin/activate && python3 core/etl_ventas_klk.py --dry-run --tiendas tienda_01

    echo ""
    echo -e "${GREEN}✅ Pruebas completadas${NC}"
}

# Main
print_header
check_prerequisites

case "${1:-}" in
    install)
        install_cron
        ;;
    uninstall)
        uninstall_cron
        ;;
    status)
        show_status
        ;;
    test)
        test_execution
        ;;
    *)
        echo "Uso: $0 {install|uninstall|status|test}"
        echo ""
        echo "Comandos:"
        echo "  install    - Instala los cron jobs de ETL KLK"
        echo "  uninstall  - Remueve los cron jobs de ETL KLK"
        echo "  status     - Muestra el estado actual de los cron jobs"
        echo "  test       - Ejecuta una prueba de los ETLs"
        echo ""
        exit 1
        ;;
esac

echo ""
