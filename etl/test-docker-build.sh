#!/bin/bash
# Script para probar el build del Dockerfile localmente

set -e

echo "🔨 Testing Fluxion ETL Dockerfile..."
echo "================================================"

# Change to etl directory
cd "$(dirname "$0")"

echo "📦 Building Docker image..."
docker build -t fluxion-etl:test .

echo ""
echo "✅ Build exitoso!"
echo ""
echo "🧪 Testing entrypoint script..."
docker run --rm fluxion-etl:test echo "Entrypoint test OK"

echo ""
echo "📋 Verificando configuración TCP keepalive..."
docker run --rm --privileged fluxion-etl:test /bin/bash -c "
    if [ -w /proc/sys/net/ipv4/tcp_keepalive_time ]; then
        echo '✅ Puede modificar sysctl (privileged mode)'
    else
        echo 'ℹ️  No puede modificar sysctl (modo normal - esperado en ECS Fargate)'
    fi
"

echo ""
echo "================================================"
echo "✅ Todas las pruebas pasaron"
echo ""
echo "Para probar localmente con VPN:"
echo "  docker run --rm -it \\"
echo "    -e SQL_USERNAME=beliveryApp \\"
echo "    -e SQL_PASSWORD='AxPG_25!' \\"
echo "    -v $(pwd)/data:/data \\"
echo "    fluxion-etl:test \\"
echo "    python3 core/etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-03"
echo ""
