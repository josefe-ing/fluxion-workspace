#!/bin/bash
################################################################################
# Script wrapper para ejecutar ETL en modo dual-database
# Este script setea DB_MODE ANTES de ejecutar Python para evitar el problema
# de import-time vs runtime
################################################################################

# Setear DB_MODE antes de ejecutar Python
export DB_MODE="dual"

echo "🔄 Modo Dual-Database activado: DB_MODE=$DB_MODE"
echo ""

# Ejecutar el ETL con los argumentos que se pasen al script
python3 "$@"
