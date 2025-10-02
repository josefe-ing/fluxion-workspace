# 🌐 Guía Rápida de Conectividad

## ⚡ Comandos Esenciales

### 1. Test Rápido (Recomendado para uso diario)
```bash
python3 core/test_conectividad_simple.py
```

### 2. Verificación Completa
```bash
python3 core/verificar_conectividad.py
```

### 3. Opciones Avanzadas
```bash
# Con timeout personalizado
python3 core/verificar_conectividad.py --timeout 10

# Procesamiento secuencial (más estable)
python3 core/verificar_conectividad.py --secuencial

# Solo tiendas activas
python3 core/verificar_conectividad.py --solo-activas
```

## 📊 Interpretación de Estados

| Estado | Descripción | Acción |
|--------|-------------|---------|
| ✅ CONECTADA | Todo funciona | Listo para ETL |
| 🟡 PUERTO OK | Puerto abierto, BD falla | Revisar credenciales |
| 🟠 PING OK | IP alcanzable, puerto cerrado | Revisar servicio SQL |
| ❌ NO ALCANZABLE | IP no responde | Verificar red/VPN |
| ⚪ INACTIVA | Configurada como inactiva | Normal, omitir |

## 🚨 Workflow Recomendado

### Antes de cada ETL:
```bash
# 1. Verificar conectividad
python3 core/test_conectividad_simple.py

# 2. Si hay problemas, verificación completa
python3 core/verificar_conectividad.py

# 3. Solo ejecutar ETL con tiendas conectadas
python3 core/etl_ventas_historico.py --tiendas [tiendas_ok] ...
```

## 🔧 Solución de Problemas

### Puerto Cerrado (🟡)
1. Verificar SQL Server corriendo en tienda
2. Revisar firewall
3. Confirmar puerto correcto (1433 vs 14348)

### Error de BD (🟠)
1. Verificar credenciales en `.env`
2. Comprobar permisos de usuario
3. Verificar nombre de BD

### IP No Alcanzable (❌)
1. Verificar conectividad de red
2. Confirmar IP en configuración
3. Revisar VPN/tunneling

---
**Última actualización**: 2025-09-30