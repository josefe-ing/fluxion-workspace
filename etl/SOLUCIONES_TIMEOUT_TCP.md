# 🔧 Soluciones para Error TCP Timeout (0x36)

## 🚨 El Problema

Error recurrente durante ETL:
```
[08S01] [Microsoft][ODBC Driver 17 for SQL Server]TCP Provider: Error code 0x36 (54)
```

**Causa raíz:** La conexión TCP se cierra después de ~90-120 segundos cuando el firewall/VPN/switch considera la conexión "inactiva" durante transferencias de datos largas.

---

## ✅ Soluciones Implementadas (En Orden de Prioridad)

### 1️⃣ INMEDIATA: Extraer en Rangos Pequeños ⚡

**Estado:** ✅ Puedes hacer esto ahora mismo
**Requiere:** Nada, solo cambiar el comando
**Efectividad:** 95% (funciona casi siempre)

**Solución:**
```bash
# ❌ ANTES (falla con timeouts):
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-22

# ✅ AHORA (en chunks de 3-7 días):
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-07
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-08 --fecha-fin 2025-10-14
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-15 --fecha-fin 2025-10-22
```

**Por qué funciona:**
- Menos datos = menos tiempo de transferencia
- Transferencias <90 segundos evitan el timeout
- DuckDB acumula los datos automáticamente

**Cuándo usar:**
- **Ahora mismo** mientras se implementan las otras soluciones
- Para sincronizaciones urgentes
- Como fallback si las otras soluciones no funcionan

---

### 2️⃣ CÓDIGO: TCP Keepalive en Python 🐍

**Estado:** ✅ Ya implementado en el código
**Requiere:** Nada (actualización de código ya aplicada)
**Efectividad:** 60-70% (depende de red/firewall)

**Cambios aplicados en [`extractor_ventas.py`](etl/core/extractor_ventas.py):**

1. **Parámetros ODBC:**
   ```python
   KeepAlive=yes
   KeepAliveInterval=30  # Envía paquete cada 30 segundos
   ```

2. **Configuración de socket Python:**
   ```python
   TCP_KEEPIDLE = 30    # Primer keepalive después de 30s
   TCP_KEEPINTVL = 10   # Intervalo de 10s entre keepalives
   TCP_KEEPCNT = 5      # 5 reintentos antes de fallar
   ```

**Por qué funciona:**
- Envía paquetes TCP cada 30 segundos
- Firewall/VPN ve conexión como "activa"
- No cierra la conexión

**Limitaciones:**
- Puede no funcionar si el firewall/VPN ignora keepalive packets
- Depende de configuración de red intermedia

**Testing:**
```bash
# Prueba con rango más grande que antes
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-14

# Revisa los logs - deberías ver:
#   "🔧 TCP Keepalive configurado en socket"
```

---

### 3️⃣ SISTEMA: TCP Keepalive en macOS 🍎

**Estado:** ⚠️ Opcional - requiere cambios de sistema
**Requiere:** Configuración de sistema operativo (sudo)
**Efectividad:** 80-90% (más confiable que #2)

**Ver guía completa:** [CONFIGURAR_TCP_KEEPALIVE_MAC.md](CONFIGURAR_TCP_KEEPALIVE_MAC.md)

**Configuración temporal (hasta reiniciar):**
```bash
sudo sysctl -w net.inet.tcp.keepidle=30000
sudo sysctl -w net.inet.tcp.keepintvl=10000
sudo sysctl -w net.inet.tcp.keepinit=30000
```

**Configuración permanente:**
```bash
# Crear archivo de configuración
sudo nano /etc/sysctl.conf

# Agregar:
net.inet.tcp.keepidle=30000
net.inet.tcp.keepintvl=10000
net.inet.tcp.keepinit=30000

# Aplicar
sudo sysctl -p /etc/sysctl.conf
```

**Por qué funciona:**
- Configura TCP keepalive a nivel del sistema operativo
- Afecta a TODAS las conexiones TCP (no solo Python)
- Más bajo nivel = más confiable

**Cuándo usar:**
- Si la solución #2 (código Python) no es suficiente
- Si necesitas extraer rangos muy grandes (>14 días)
- Para configuración permanente

---

### 4️⃣ SERVIDOR: TCP Keepalive en SQL Server 🗄️

**Estado:** ⚠️ Requiere coordinación con DBA
**Requiere:** Administrador de SQL Server Windows
**Efectividad:** 95% (solución ideal)

**Ver guía completa:** [GUIA_DBA_TCP_KEEPALIVE.md](GUIA_DBA_TCP_KEEPALIVE.md)

**Cambios requeridos en servidor SQL Server:**
```powershell
# Configurar en registro de Windows
KeepAliveTime = 30000       # 30 segundos
KeepAliveInterval = 1000    # 1 segundo
TcpMaxDataRetransmissions = 10
```

**Por qué funciona:**
- Servidor envía keepalive packets
- Más confiable que keepalive desde cliente
- Beneficia a TODOS los clientes ETL

**Cuándo usar:**
- **Lo ideal:** Implementar esto + solución #2 o #3
- Para solución permanente y robusta
- Cuando múltiples usuarios/scripts tienen el mismo problema

---

## 📊 Comparación de Soluciones

| Solución | Efectividad | Facilidad | Permanente | Requiere Permisos |
|----------|-------------|-----------|------------|-------------------|
| **1. Chunks pequeños** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ Sí | ❌ No |
| **2. Keepalive Python** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ Sí | ❌ No |
| **3. Keepalive macOS** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ Sí | ⚠️ Sudo |
| **4. Keepalive SQL Server** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ✅ Sí | ⚠️ DBA |

---

## 🎯 Estrategia Recomendada

### Fase 1: Inmediato (Hoy) ✅
```bash
# Usar chunks pequeños (3-7 días)
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-07
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-08 --fecha-fin 2025-10-14
# etc...
```

**Resultado esperado:** ✅ Extracción exitosa

---

### Fase 2: Corto Plazo (Esta Semana)
1. ✅ **Keepalive Python ya implementado** (automático)
2. ⚠️ **Opcional:** Configurar keepalive en macOS (si fase 1 sigue fallando)
3. 📧 **Enviar guía al DBA** para configurar servidor SQL Server

---

### Fase 3: Mediano Plazo (Próxima Semana)
1. ✅ DBA configura TCP keepalive en SQL Server
2. ✅ Testing con rangos grandes (14-30 días)
3. ✅ Documentar configuración final
4. ✅ Actualizar scheduler en AWS con nueva configuración

---

## 🧪 Testing Progresivo

Después de cada solución implementada, prueba con rangos crecientes:

```bash
# Test 1: Rango pequeño (debería funcionar siempre)
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-03
# ✅ Esperado: Éxito (~30-60 segundos)

# Test 2: Rango mediano (con keepalive Python)
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-07
# ⚠️ Esperado: Éxito o timeout (~90-180 segundos)

# Test 3: Rango grande (con keepalive macOS o SQL Server)
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-14
# ⚠️ Esperado: Éxito después de configurar keepalive (~3-5 minutos)

# Test 4: Rango muy grande (con keepalive SQL Server)
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-22
# 🎯 Meta: Éxito consistente (~7-10 minutos)
```

---

## 📝 Notas Importantes

### ✅ Lo Que Ya Funciona
- ✅ Extracción con SQLAlchemy (mejor que pyodbc)
- ✅ Sin límites de registros (extrae todo)
- ✅ Sin OFFSET/FETCH (usa cursor, mucho más rápido)
- ✅ Keepalive configurado en código Python
- ✅ Retry automático (3 intentos)

### ⚠️ Limitaciones Actuales
- ⚠️ Firewall/VPN cierra conexiones "inactivas" >90s
- ⚠️ Keepalive Python puede no ser suficiente dependiendo de red
- ⚠️ Configuración de sistema/servidor requiere permisos

### 🎯 Estado Objetivo
- 🎯 Extraer rangos de 14-30 días sin timeouts
- 🎯 Configuración de keepalive en cliente Y servidor
- 🎯 ETL scheduled en AWS funcionando 24/7
- 🎯 Sincronización completa de todas las tiendas

---

## 🆘 Troubleshooting

### Error persiste después de implementar soluciones

**Diagnóstico:**
```bash
# Ver configuración TCP actual (macOS)
sysctl net.inet.tcp | grep keepalive

# Ver logs del ETL
tail -100 ../logs/ventas_*.log | grep -i "keepalive\|timeout\|error"
```

**Soluciones:**
1. **Reducir más el rango** (probar con 2-3 días)
2. **Verificar VPN estable** (ping al servidor durante extracción)
3. **Consultar con IT/Networking** sobre firewalls intermedios

### Extracción muy lenta (>5 minutos para 7 días)

**Posibles causas:**
- Red lenta o saturada
- SQL Server con alta carga
- Query ineficiente

**Diagnóstico:**
```bash
# Ejecutar el mismo query desde DataGrip y comparar tiempos
# Ver logs para identificar cuellos de botella
```

---

## 📚 Referencias

- [CONFIGURAR_TCP_KEEPALIVE_MAC.md](CONFIGURAR_TCP_KEEPALIVE_MAC.md) - Guía para configurar keepalive en macOS
- [GUIA_DBA_TCP_KEEPALIVE.md](GUIA_DBA_TCP_KEEPALIVE.md) - Guía para DBA Windows/SQL Server
- [INSTRUCCIONES_VALIDACION.md](INSTRUCCIONES_VALIDACION.md) - Cómo validar datos sincronizados
- [extractor_ventas.py](etl/core/extractor_ventas.py) - Código con keepalive implementado

---

**Última actualización:** 2025-10-22
**Próxima revisión:** Después de que DBA configure servidor
