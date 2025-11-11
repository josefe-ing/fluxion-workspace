#!/bin/bash
set -e

echo "🚀 Aplicando migración ABC-XYZ a producción..."

# Verificar que la BD existe
if [ ! -f "/data/fluxion_production.db" ]; then
    echo "❌ Error: Base de datos no encontrada en /data/fluxion_production.db"
    exit 1
fi

# Backup de la BD
echo "📦 Creando backup de la base de datos..."
BACKUP_FILE="/data/fluxion_production_backup_$(date +%Y%m%d_%H%M%S).db"
cp /data/fluxion_production.db "$BACKUP_FILE"
echo "✅ Backup creado: $BACKUP_FILE"

# Verificar que el archivo de migración existe
if [ ! -f "/app/database/schema_abc_v2.sql" ]; then
    echo "❌ Error: Archivo de migración schema_abc_v2.sql no encontrado"
    exit 1
fi

if [ ! -f "/app/database/schema_abc_xyz.sql" ]; then
    echo "❌ Error: Archivo de migración schema_abc_xyz.sql no encontrado"
    exit 1
fi

# Aplicar schema ABC v2 (tabla base)
echo "📝 Aplicando schema_abc_v2.sql..."
duckdb /data/fluxion_production.db < /app/database/schema_abc_v2.sql
echo "✅ Schema ABC v2 aplicado"

# Aplicar schema XYZ (extensión)
echo "📝 Aplicando schema_abc_xyz.sql..."
duckdb /data/fluxion_production.db < /app/database/schema_abc_xyz.sql
echo "✅ Schema XYZ aplicado"

# Verificar que las tablas existen
echo "🔍 Verificando tablas creadas..."
duckdb /data/fluxion_production.db "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = 'productos_abc_v2';"

echo "✅ Migración completada exitosamente!"
echo "📊 Ahora ejecuta el cálculo inicial:"
echo "   python3 /app/database/calcular_abc_v2_por_tienda.py"
echo "   python3 /app/database/calcular_xyz_por_tienda.py"
