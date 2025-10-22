#!/bin/bash
# Check DNS propagation for fluxionia.co

echo "🔍 Checking DNS propagation for fluxionia.co..."
echo ""

echo "Current nameservers:"
dig NS fluxionia.co +short

echo ""
echo "Expected AWS nameservers:"
echo "  ns-1051.awsdns-03.org"
echo "  ns-583.awsdns-08.net"
echo "  ns-484.awsdns-60.com"
echo "  ns-1563.awsdns-03.co.uk"

echo ""
echo "Online check: https://www.whatsmydns.net/#NS/fluxionia.co"
