#!/bin/bash
# Script para configurar port forwarding en WireGuard EC2
# Ejecutar EN el EC2 WireGuard (via SSM)

set -e

echo "=================================================="
echo "  WireGuard Port Forwarding Setup"
echo "  Fluxion AI - La Granja Mercado"
echo "=================================================="
echo ""

# Instalar iptables si no está instalado
echo "0️⃣  Verificando e instalando iptables..."
if ! command -v iptables &> /dev/null; then
    echo "   Instalando iptables..."
    sudo yum install -y iptables iptables-services
else
    echo "   ✅ iptables ya está instalado"
fi
echo ""

# Habilitar IP forwarding
echo "1️⃣  Habilitando IP forwarding..."
sudo sysctl -w net.ipv4.ip_forward=1
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
    echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
fi
echo "✅ IP forwarding habilitado"
echo ""

# Función para agregar port forwarding
add_port_forward() {
    local puerto_wg=$1
    local ip_destino=$2
    local puerto_destino=$3
    local nombre=$4

    echo "   • $nombre: $puerto_wg → $ip_destino:$puerto_destino"

    # Agregar regla PREROUTING
    sudo iptables -t nat -A PREROUTING -p tcp --dport $puerto_wg -j DNAT --to-destination $ip_destino:$puerto_destino

    # Agregar regla POSTROUTING (MASQUERADE)
    sudo iptables -t nat -A POSTROUTING -p tcp -d $ip_destino --dport $puerto_destino -j MASQUERADE
}

echo "2️⃣  Configurando port forwarding para tiendas..."
echo ""

# Tiendas (puertos 14301-14320)
add_port_forward 14301 192.168.20.12 14348 "tienda_01 PERIFERICO"
add_port_forward 14302 192.168.30.52 14348 "tienda_02 AV. BOLIVAR"
add_port_forward 14303 192.168.50.20 14348 "tienda_03 MAÑONGO"
add_port_forward 14304 192.168.140.10 14348 "tienda_04 SAN DIEGO"
add_port_forward 14305 192.168.80.10 14348 "tienda_05 VIVIENDA"
add_port_forward 14306 192.168.40.53 14348 "tienda_06 NAGUANAGUA"
add_port_forward 14307 192.168.130.10 14348 "tienda_07 CENTRO"

# tienda_08 BOSQUE - acceso directo sin port forwarding (solo MASQUERADE)
echo "   • tienda_08 BOSQUE: direct access to 192.168.150.10:14348"
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.150.10 --dport 14348 -j MASQUERADE

add_port_forward 14309 192.168.120.10 14348 "tienda_09 GUACARA"
add_port_forward 14310 192.168.70.10 14348 "tienda_10 FERIAS"
add_port_forward 14311 192.168.160.10 14348 "tienda_11 FLOR AMARILLO"
add_port_forward 14312 192.168.170.10 1433 "tienda_12 PARAPARAL"
add_port_forward 14313 192.168.190.10 14348 "tienda_13 NAGUANAGUA III"
add_port_forward 14315 192.168.180.10 1433 "tienda_15 ISABELICA"
add_port_forward 14316 192.168.110.10 1433 "tienda_16 TOCUYITO"
add_port_forward 14319 192.168.210.10 1433 "tienda_19 GUIGUE"
add_port_forward 14320 192.168.220.10 1433 "tienda_20 TAZAJAL"

echo ""
echo "3️⃣  Configurando port forwarding para CEDIs..."
echo ""

# CEDIs (puertos 14401-14403)
add_port_forward 14401 192.168.90.20 1433 "cedi_seco CEDI Seco"
add_port_forward 14402 192.168.170.20 1433 "cedi_frio CEDI Frio"
add_port_forward 14403 192.168.200.10 1433 "cedi_verde CEDI Verde"

echo ""
echo "4️⃣  Guardando reglas para que persistan después de reiniciar..."
sudo service iptables save
sudo systemctl enable iptables

echo ""
echo "=================================================="
echo "✅ Port forwarding configurado exitosamente"
echo "=================================================="
echo ""
echo "📊 Resumen:"
sudo iptables -t nat -L PREROUTING -n -v | grep DNAT | wc -l | xargs echo "   • Reglas configuradas:"
echo ""
echo "🔍 Ver todas las reglas:"
echo "   sudo iptables -t nat -L -n -v"
echo ""
echo "🧪 Test de conectividad:"
echo "   telnet 10.0.2.244 14301  # PERIFERICO"
echo "   telnet 10.0.2.244 14302  # AV. BOLIVAR"
echo ""
echo "⚠️  IMPORTANTE: Actualizar Security Group para permitir puertos 14301-14320 y 14401-14403"
echo ""
