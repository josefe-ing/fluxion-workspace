#!/bin/bash
set -e

echo "🚀 Iniciando Fluxion ETL en AWS ECS..."
echo "================================================"

# Mostrar configuración de red
echo "📡 Configuración de Red:"
if command -v ip &> /dev/null; then
    ip addr show | grep -E 'inet ' | awk '{print "   " $2}' 2>/dev/null || echo "   No disponible"
else
    hostname -I 2>/dev/null | awk '{print "   " $1}' || echo "   No disponible"
fi
echo ""

# Configurar TCP keepalive automáticamente
echo "🔧 Configurando TCP Keepalive..."
if [ -w /proc/sys/net/ipv4/tcp_keepalive_time ]; then
    echo 30 > /proc/sys/net/ipv4/tcp_keepalive_time
    echo 10 > /proc/sys/net/ipv4/tcp_keepalive_intvl
    echo 5 > /proc/sys/net/ipv4/tcp_keepalive_probes

    echo "✅ TCP Keepalive configurado:"
    echo "   - Keepalive Time: $(cat /proc/sys/net/ipv4/tcp_keepalive_time)s"
    echo "   - Keepalive Interval: $(cat /proc/sys/net/ipv4/tcp_keepalive_intvl)s"
    echo "   - Keepalive Probes: $(cat /proc/sys/net/ipv4/tcp_keepalive_probes)"
else
    echo "ℹ️  No se puede modificar sysctl (contenedor sin privilegios)"
    echo "   Configuración de keepalive se aplicará vía Python/ODBC"
fi
echo ""

# Verificar conectividad VPN (si está configurada)
if [ -n "$VPN_GATEWAY_IP" ]; then
    echo "🔍 Verificando conectividad VPN..."
    timeout 3 ping -c 1 "$VPN_GATEWAY_IP" > /dev/null 2>&1 && \
        echo "✅ VPN accesible ($VPN_GATEWAY_IP)" || \
        echo "⚠️  VPN no responde ($VPN_GATEWAY_IP)"
    echo ""
fi

# Verificar credenciales SQL (sin mostrar valores)
echo "🔐 Verificando credenciales SQL..."
if [ -n "$SQL_USERNAME" ] && [ -n "$SQL_PASSWORD" ]; then
    echo "✅ Credenciales SQL configuradas"
else
    echo "⚠️  Credenciales SQL no encontradas"
fi
echo ""

# Verificar montaje de EFS para DuckDB
echo "💾 Verificando acceso a DuckDB..."
if [ -d "/data" ]; then
    echo "✅ Directorio /data montado"
    ls -lh /data/*.db 2>/dev/null | awk '{print "   " $9 " - " $5}' || echo "   (sin archivos .db aún)"
else
    echo "⚠️  Directorio /data no montado"
fi
echo ""

echo "================================================"
echo "🎯 Ejecutando comando: $@"
echo "================================================"
echo ""

# Ejecutar el comando pasado al container
exec "$@"
