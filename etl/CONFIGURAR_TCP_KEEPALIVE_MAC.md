# 🍎 Configurar TCP Keepalive en macOS (Cliente)

## Contexto

El error `TCP Provider: Error code 0x36` ocurre porque la conexión TCP se cierra durante transferencias largas (>90 segundos). Esto sucede típicamente por:
- Firewall corporativo
- VPN que cierra conexiones "inactivas"
- Switch de red con timeout agresivo

Mientras el DBA configura keepalive en el servidor SQL Server, puedes configurarlo también en tu Mac para reducir estos errores.

---

## ⚙️ Configuración de TCP Keepalive en macOS

### 1. Ver Configuración Actual

```bash
# Ver todos los parámetros TCP
sysctl net.inet.tcp | grep keepalive
```

Valores típicos por defecto en macOS:
- `net.inet.tcp.keepidle` = 7200000 ms (2 horas)
- `net.inet.tcp.keepintvl` = 75000 ms (75 segundos)
- `net.inet.tcp.keepinit` = 75000 ms (75 segundos)

### 2. Configuración Temporal (Hasta el próximo reinicio)

```bash
# Reducir tiempo antes del primer keepalive (de 2 horas a 30 segundos)
sudo sysctl -w net.inet.tcp.keepidle=30000

# Reducir intervalo entre keepalives (de 75s a 10s)
sudo sysctl -w net.inet.tcp.keepintvl=10000

# Reducir timeout de inicialización de conexión
sudo sysctl -w net.inet.tcp.keepinit=30000
```

### 3. Configuración Permanente

Crea o edita el archivo `/etc/sysctl.conf`:

```bash
# Crear el archivo (requiere sudo)
sudo nano /etc/sysctl.conf
```

Agrega estas líneas:

```conf
# TCP Keepalive Configuration for SQL Server ETL
# Reduce keepalive idle time from 2 hours to 30 seconds
net.inet.tcp.keepidle=30000

# Reduce keepalive interval from 75s to 10s
net.inet.tcp.keepintvl=10000

# Reduce connection init timeout
net.inet.tcp.keepinit=30000
```

Guarda y cierra (`Ctrl+X`, luego `Y`, luego `Enter`).

### 4. Aplicar la Configuración

```bash
# Cargar el archivo de configuración
sudo sysctl -p /etc/sysctl.conf
```

### 5. Verificar Cambios

```bash
# Verificar que los cambios se aplicaron
sysctl net.inet.tcp.keepidle
sysctl net.inet.tcp.keepintvl
sysctl net.inet.tcp.keepinit
```

Deberías ver:
```
net.inet.tcp.keepidle: 30000
net.inet.tcp.keepintvl: 10000
net.inet.tcp.keepinit: 30000
```

---

## 🔧 Configuración Adicional en SQLAlchemy

También podemos forzar keepalive a nivel de socket en Python. Déjame actualizar el extractor para incluir esto.

---

## ⚠️ Notas Importantes

1. **Cambios temporales** (con `sysctl -w`) se pierden al reiniciar el Mac
2. **Cambios permanentes** (en `/etc/sysctl.conf`) persisten tras reinicios
3. **Requiere sudo** para modificar configuración del sistema
4. **Afecta a todas las conexiones TCP** en tu Mac, no solo SQL Server
5. Estos valores son seguros y no deberían causar problemas en otras aplicaciones

---

## 🧪 Testing

Después de aplicar estos cambios:

```bash
# 1. Prueba con un rango pequeño (debería funcionar)
cd /Users/jose/Developer/fluxion-workspace/etl/core
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-03

# 2. Prueba con rango más grande (antes fallaba)
python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-01 --fecha-fin 2025-10-14

# 3. Monitorea los logs para ver si reduce los timeouts
tail -f ../logs/ventas_*.log
```

---

## 🔄 Rollback (Volver a Default)

Si necesitas revertir los cambios:

```bash
# Valores por defecto de macOS
sudo sysctl -w net.inet.tcp.keepidle=7200000
sudo sysctl -w net.inet.tcp.keepintvl=75000
sudo sysctl -w net.inet.tcp.keepinit=75000

# Y eliminar /etc/sysctl.conf
sudo rm /etc/sysctl.conf
```

---

## 📊 Comparación: Antes vs Después

### Antes (Configuración Default)
- Primer keepalive enviado después de: **2 horas**
- Conexión percibida como "inactiva" por firewall/VPN: **✅ Sí**
- Firewall cierra conexión después de: **90-120 segundos**
- Resultado: **❌ Error 0x36 en extracciones >90s**

### Después (Configuración Optimizada)
- Primer keepalive enviado después de: **30 segundos**
- Conexión percibida como "inactiva" por firewall/VPN: **❌ No (envía paquetes cada 30s)**
- Firewall cierra conexión: **❌ No (keepalive mantiene conexión activa)**
- Resultado: **✅ Extracciones largas exitosas**

---

## 🤝 Coordinación con DBA

**Lo ideal es configurar keepalive en AMBOS lados:**
- **Servidor SQL Server** (usando `GUIA_DBA_TCP_KEEPALIVE.md`)
- **Tu Mac** (usando esta guía)

Esto proporciona redundancia y máxima confiabilidad.

---

**Última actualización:** 2025-10-22
