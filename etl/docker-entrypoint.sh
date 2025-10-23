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
# Soporta ambos formatos: SQL_USER/SQL_PASS y SQL_USERNAME/SQL_PASSWORD
if [ -n "$SQL_USER" ] && [ -n "$SQL_PASS" ]; then
    echo "✅ Credenciales SQL configuradas (SQL_USER/SQL_PASS)"
elif [ -n "$SQL_USERNAME" ] && [ -n "$SQL_PASSWORD" ]; then
    echo "✅ Credenciales SQL configuradas (SQL_USERNAME/SQL_PASSWORD)"
else
    echo "⚠️  Credenciales SQL no encontradas"
    echo "   Esperadas: SQL_USER+SQL_PASS o SQL_USERNAME+SQL_PASSWORD"
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

# Cargar SendGrid credentials desde AWS Secrets Manager (solo en producción)
if [ "$ENVIRONMENT" = "production" ] && [ -n "$AWS_REGION" ]; then
    echo "📧 Cargando credenciales de SendGrid desde AWS Secrets Manager..."

    SENDGRID_SECRET=$(aws secretsmanager get-secret-value \
        --secret-id fluxion/production \
        --region "$AWS_REGION" \
        --query SecretString \
        --output text 2>&1)

    if [ $? -eq 0 ]; then
        # Use Python to parse JSON (more reliable than grep for complex strings)
        export SENDGRID_API_KEY=$(echo "$SENDGRID_SECRET" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('SENDGRID_API_KEY', ''))")
        export SENDGRID_FROM_EMAIL=$(echo "$SENDGRID_SECRET" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('SENDGRID_FROM_EMAIL', ''))")
        export NOTIFICATION_EMAILS=$(echo "$SENDGRID_SECRET" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('NOTIFICATION_EMAILS', ''))")

        if [ -n "$SENDGRID_API_KEY" ]; then
            echo "✅ SendGrid API key cargado exitosamente"
            [ -n "$SENDGRID_FROM_EMAIL" ] && echo "   From: $SENDGRID_FROM_EMAIL"
            [ -n "$NOTIFICATION_EMAILS" ] && echo "   To: $NOTIFICATION_EMAILS"
        else
            echo "⚠️  SendGrid API key no encontrado en secrets"
        fi
    else
        echo "⚠️  No se pudo cargar SendGrid secrets"
    fi
    echo ""
fi

echo "================================================"
echo "🎯 Ejecutando comando: $@"
echo "================================================"
echo ""

# Ejecutar el comando pasado al container
exec "$@"
