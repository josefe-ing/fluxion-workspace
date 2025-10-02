#!/usr/bin/env python3

# Probar leer archivo directamente
with open('query_inventario_generic.sql', 'r') as f:
    content = f.read()

print("=== CONTENIDO DEL ARCHIVO ===")
print("Primeros 200 chars:")
print(content[:200])
print("\nÚltimos 100 chars:")
print(content[-100:])
print(f"\nTotal caracteres: {len(content)}")