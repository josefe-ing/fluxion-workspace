#!/bin/bash
#
# Script rápido para crear usuarios en Fluxion AI
# Uso: ./create_user.sh <nuevo_usuario> <contraseña> [nombre_completo] [email]
#

set -e

API_URL="http://fluxion-alb-1002393067.us-east-1.elb.amazonaws.com"

# Verificar argumentos
if [ $# -lt 2 ]; then
    echo "❌ Uso: $0 <nuevo_usuario> <contraseña> [nombre_completo] [email]"
    echo ""
    echo "Ejemplos:"
    echo "  $0 juan juan123"
    echo "  $0 maria maria456 \"Maria Garcia\""
    echo "  $0 pedro pedro789 \"Pedro Lopez\" pedro@example.com"
    exit 1
fi

NEW_USERNAME="$1"
NEW_PASSWORD="$2"
NOMBRE_COMPLETO="${3:-}"
EMAIL="${4:-}"

# Login como admin
echo "🔐 Iniciando sesión como admin..."
read -p "Usuario admin [admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

read -sp "Contraseña admin: " ADMIN_PASS
echo ""

# Obtener token
echo "⏳ Obteniendo token..."
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" | jq -r '.access_token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
    echo "❌ Error: No se pudo autenticar. Verifica tus credenciales."
    exit 1
fi

echo "✅ Autenticado exitosamente"

# Construir JSON para nuevo usuario
JSON_DATA="{\"username\":\"$NEW_USERNAME\",\"password\":\"$NEW_PASSWORD\""
if [ -n "$NOMBRE_COMPLETO" ]; then
    JSON_DATA="$JSON_DATA,\"nombre_completo\":\"$NOMBRE_COMPLETO\""
fi
if [ -n "$EMAIL" ]; then
    JSON_DATA="$JSON_DATA,\"email\":\"$EMAIL\""
fi
JSON_DATA="$JSON_DATA}"

# Crear usuario
echo "⏳ Creando usuario '$NEW_USERNAME'..."
RESULT=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$JSON_DATA")

# Verificar resultado
if echo "$RESULT" | jq -e '.id' > /dev/null 2>&1; then
    echo ""
    echo "✅ Usuario creado exitosamente!"
    echo ""
    echo "$RESULT" | jq '{
        id: .id,
        username: .username,
        nombre_completo: .nombre_completo,
        email: .email,
        activo: .activo
    }'
    echo ""
    echo "🎉 El usuario '$NEW_USERNAME' ya puede iniciar sesión"
else
    echo ""
    echo "❌ Error al crear usuario:"
    echo "$RESULT" | jq '.'
    exit 1
fi
