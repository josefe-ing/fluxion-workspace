#!/bin/bash
# Script para extraer data de gaps identificados
# Configura el PYTHONPATH correctamente para que los imports funcionen

# Directorio base
BASE_DIR="/Users/jose/Developer/fluxion-workspace"
ETL_DIR="$BASE_DIR/etl"

# Configurar PYTHONPATH para incluir ambos directorios necesarios
export PYTHONPATH="$ETL_DIR/archive:$ETL_DIR/core:$PYTHONPATH"

# Cambiar al directorio de trabajo
cd "$ETL_DIR/archive"

echo "=================================="
echo "EXTRACCIÓN DE DATA PARA GAPS"
echo "=================================="
echo ""
echo "PYTHONPATH configurado:"
echo "  - $ETL_DIR/archive"
echo "  - $ETL_DIR/core"
echo ""

# Función para ejecutar ETL con manejo de errores
ejecutar_etl() {
    local tienda=$1
    local fecha_inicio=$2
    local fecha_fin=$3
    local limite=$4
    local nombre=$5

    echo "=== Extrayendo: $nombre ==="
    echo "    Tienda: $tienda"
    echo "    Período: $fecha_inicio a $fecha_fin"
    echo "    Límite: $limite registros"
    echo ""

    python3 etl_ventas_multi_tienda.py \
        --tienda "$tienda" \
        --fecha-inicio "$fecha_inicio" \
        --fecha-fin "$fecha_fin" \
        --limite "$limite"

    if [ $? -eq 0 ]; then
        echo "    ✅ Completado exitosamente"
    else
        echo "    ❌ Error en la extracción"
        return 1
    fi
    echo ""
}

# Menú de opciones
echo "Selecciona qué gaps extraer:"
echo "1. tienda_01 - Feb 9-10 2025 (2 días) - PRUEBA RÁPIDA"
echo "2. tienda_08 - Marzo 2025 (31 días)"
echo "3. tienda_13 - Julio 2025 (31 días)"
echo "4. tienda_16 - Junio-Julio 2025 (61 días)"
echo "5. TODOS los gaps en secuencia"
echo ""
read -p "Opción (1-5): " opcion

case $opcion in
    1)
        ejecutar_etl "tienda_01" "2025-02-09" "2025-02-10" 100000 "tienda_01 Feb 9-10"
        ;;
    2)
        ejecutar_etl "tienda_08" "2025-03-01" "2025-03-31" 1000000 "tienda_08 Marzo"
        ;;
    3)
        ejecutar_etl "tienda_13" "2025-07-01" "2025-07-31" 1000000 "tienda_13 Julio"
        ;;
    4)
        ejecutar_etl "tienda_16" "2025-06-01" "2025-07-31" 2000000 "tienda_16 Junio-Julio"
        ;;
    5)
        echo "=== MODO COMPLETO: Extrayendo todos los gaps ==="
        echo ""

        ejecutar_etl "tienda_01" "2025-02-09" "2025-02-10" 100000 "Gap 1/4: tienda_01 Feb 9-10"
        if [ $? -ne 0 ]; then
            echo "❌ Error en tienda_01. Abortando."
            exit 1
        fi

        ejecutar_etl "tienda_08" "2025-03-01" "2025-03-31" 1000000 "Gap 2/4: tienda_08 Marzo"
        if [ $? -ne 0 ]; then
            echo "❌ Error en tienda_08. Abortando."
            exit 1
        fi

        ejecutar_etl "tienda_13" "2025-07-01" "2025-07-31" 1000000 "Gap 3/4: tienda_13 Julio"
        if [ $? -ne 0 ]; then
            echo "❌ Error en tienda_13. Abortando."
            exit 1
        fi

        ejecutar_etl "tienda_16" "2025-06-01" "2025-07-31" 2000000 "Gap 4/4: tienda_16 Junio-Julio"
        if [ $? -ne 0 ]; then
            echo "❌ Error en tienda_16. Abortando."
            exit 1
        fi

        echo "=================================="
        echo "✅ TODOS LOS GAPS PROCESADOS"
        echo "=================================="
        ;;
    *)
        echo "❌ Opción inválida"
        exit 1
        ;;
esac

echo ""
echo "=================================="
echo "Para verificar resultados, ejecuta:"
echo "  cd $BASE_DIR"
echo "  python3 analyze_data_gaps.py"
echo "=================================="
