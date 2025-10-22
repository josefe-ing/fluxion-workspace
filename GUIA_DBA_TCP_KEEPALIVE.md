# Guía para el DBA: Configuración TCP Keepalive en SQL Server

## 🎯 Problema Identificado

Estamos experimentando **timeouts de conexión TCP** después de ~90 segundos durante la transferencia de datos desde SQL Server vía ODBC.

**Error específico:**
```
TCP Provider: Error code 0x274C (10060) - Connection timeout
TCP Provider: Error code 0x36 (54) - Connection reset
```

**Causa raíz:** La configuración por defecto de Windows cierra conexiones TCP "inactivas" después de 2 horas sin actividad, pero algunos firewalls/routers intermedios pueden cerrar conexiones antes si no detectan tráfico keepalive.

---

## 🔍 1. Verificar Configuración Actual

### A. Verificar TCP KeepAlive en Windows Server

**Abrir PowerShell como Administrador y ejecutar:**

```powershell
# Ver configuración actual de TCP KeepAlive
Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" |
    Select-Object KeepAliveTime, KeepAliveInterval, TcpMaxDataRetransmissions

# Si los valores están vacíos, significa que usa los defaults de Windows
```

**Valores por defecto de Windows:**
- `KeepAliveTime`: 7,200,000 ms (2 horas)
- `KeepAliveInterval`: 1,000 ms (1 segundo)
- `TcpMaxDataRetransmissions`: 5 reintentos

### B. Verificar Configuración en SQL Server

**Conectarse a SQL Server Management Studio (SSMS) y ejecutar:**

```sql
-- Habilitar opciones avanzadas
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;

-- Ver configuración de timeouts
SELECT
    name,
    value,
    value_in_use,
    description
FROM sys.configurations
WHERE name LIKE '%timeout%'
ORDER BY name;

-- Ver específicamente remote query timeout
EXEC sp_configure 'remote query timeout';
```

---

## ⚙️ 2. Aplicar Configuración Recomendada

### A. Ajustar TCP KeepAlive en Windows Server

**Ejecutar en PowerShell como Administrador:**

```powershell
# 1. Reducir tiempo antes del primer keepalive (de 2 horas a 30 segundos)
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" `
    -Name "KeepAliveTime" `
    -Value 30000 `
    -PropertyType DWord `
    -Force

# 2. Intervalo entre keepalives (mantener en 1 segundo)
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" `
    -Name "KeepAliveInterval" `
    -Value 1000 `
    -PropertyType DWord `
    -Force

# 3. Aumentar reintentos antes de cerrar conexión (de 5 a 10)
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" `
    -Name "TcpMaxDataRetransmissions" `
    -Value 10 `
    -PropertyType DWord `
    -Force

# 4. Verificar que los valores se aplicaron correctamente
Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" |
    Select-Object KeepAliveTime, KeepAliveInterval, TcpMaxDataRetransmissions
```

**⚠️ IMPORTANTE:** Estos cambios requieren **reiniciar el servidor Windows** para que tomen efecto.

```powershell
# Programar reinicio en 5 minutos (da tiempo para avisar a usuarios)
shutdown /r /t 300 /c "Reinicio programado para aplicar configuración TCP KeepAlive"

# Cancelar reinicio si es necesario
shutdown /a
```

### B. Ajustar Timeouts en SQL Server

**Ejecutar en SSMS como sysadmin:**

```sql
-- Aumentar remote query timeout a 10 minutos (600 segundos)
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;

EXEC sp_configure 'remote query timeout', 600;
RECONFIGURE;

-- Verificar que el cambio se aplicó
EXEC sp_configure 'remote query timeout';
```

**Nota:** Este cambio NO requiere reiniciar SQL Server, es inmediato.

### C. Configurar TCP/IP en SQL Server Configuration Manager

**Pasos manuales:**

1. Abrir **SQL Server Configuration Manager**
2. Navegar a: `SQL Server Network Configuration` → `Protocols for [NOMBRE_INSTANCIA]`
3. Click derecho en **TCP/IP** → **Properties**
4. En la pestaña **"IP Addresses"**, verificar que el puerto 14348 esté configurado
5. Click en **OK**
6. **Reiniciar el servicio de SQL Server** desde Configuration Manager

---

## 📊 3. Diagnóstico de Problemas de Red

### A. Revisar Conexiones TCP Activas

```powershell
# Ver conexiones en el puerto de SQL Server
netstat -ano | findstr "14348"

# Ver estadísticas de TCP (buscar retransmisiones y timeouts)
netstat -s -p tcp
```

**Interpretar resultados:**
- **Segments Retransmitted** alto → Problemas de red
- **Connection Failures** alto → Problemas de timeout
- **Connections Reset** alto → Conexiones cerradas prematuramente

### B. Revisar Event Viewer

```powershell
# Buscar errores TCP en Event Viewer
Get-EventLog -LogName System -Source "Tcpip" -Newest 100 |
    Where-Object {$_.EntryType -eq "Error" -or $_.EntryType -eq "Warning"} |
    Select-Object TimeGenerated, EntryType, Message |
    Format-Table -AutoSize
```

### C. Verificar Firewall/Antivirus

**Revisar si hay reglas que puedan estar cerrando conexiones:**

```powershell
# Ver reglas de firewall relacionadas con SQL Server
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*SQL*"} |
    Select-Object DisplayName, Enabled, Direction, Action
```

---

## 🎯 4. Valores Recomendados - Resumen

| Parámetro | Ubicación | Valor Default | Valor Recomendado | Requiere Reinicio |
|-----------|-----------|---------------|-------------------|-------------------|
| `KeepAliveTime` | Registry (Windows) | 7,200,000 ms | **30,000 ms** | ✅ Sí (Windows Server) |
| `KeepAliveInterval` | Registry (Windows) | 1,000 ms | **1,000 ms** | ✅ Sí (Windows Server) |
| `TcpMaxDataRetransmissions` | Registry (Windows) | 5 | **10** | ✅ Sí (Windows Server) |
| `remote query timeout` | SQL Server | 600 seg | **600 seg** | ❌ No |

---

## 🧪 5. Pruebas Post-Implementación

### A. Desde el Servidor SQL

```powershell
# Verificar que los valores se aplicaron después del reinicio
Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" |
    Select-Object KeepAliveTime, KeepAliveInterval, TcpMaxDataRetransmissions
```

### B. Desde el Cliente (Máquina que ejecuta el ETL)

```bash
# En macOS/Linux - Probar conectividad TCP
nc -zv 192.168.20.12 14348

# Ver ruta de red (identificar saltos lentos)
traceroute 192.168.20.12

# Probar conexión de larga duración (5 minutos)
timeout 300 nc 192.168.20.12 14348
```

### C. Ejecutar ETL de Prueba

**Desde el sistema ETL, ejecutar una extracción de prueba:**

```bash
# Ejecutar ETL para 7-10 días (debería completarse en ~7 minutos)
python3 etl_ventas_multi_tienda.py --tienda tienda_01 --fecha-inicio 2025-10-14 --fecha-fin 2025-10-22
```

**Resultado esperado:**
- ✅ No debe haber timeouts TCP
- ✅ Cada chunk de 50K registros debería completarse
- ✅ Tiempo total: 5-7 minutos para ~180K registros

---

## 📋 6. Checklist de Implementación

```
□ Paso 1: Verificar configuración actual de KeepAliveTime en Registry
□ Paso 2: Verificar remote query timeout en SQL Server
□ Paso 3: Revisar Event Viewer buscando errores TCP
□ Paso 4: Revisar estadísticas de netstat (retransmisiones, timeouts)
□ Paso 5: Coordinar ventana de mantenimiento para reinicio del servidor
□ Paso 6: Aplicar configuración de Registry (KeepAliveTime, etc.)
□ Paso 7: Aplicar configuración de SQL Server (remote query timeout)
□ Paso 8: Reiniciar Windows Server
□ Paso 9: Verificar que SQL Server inició correctamente
□ Paso 10: Verificar valores aplicados post-reinicio
□ Paso 11: Ejecutar prueba de ETL desde cliente
□ Paso 12: Monitorear logs por 24-48 horas
```

---

## 🔧 7. Rollback (Si es Necesario)

**Si los cambios causan problemas, revertir a valores por defecto:**

```powershell
# Eliminar valores personalizados (vuelve a defaults de Windows)
Remove-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" `
    -Name "KeepAliveTime" -ErrorAction SilentlyContinue

Remove-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" `
    -Name "KeepAliveInterval" -ErrorAction SilentlyContinue

Remove-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" `
    -Name "TcpMaxDataRetransmissions" -ErrorAction SilentlyContinue

# Reiniciar servidor
Restart-Computer -Force
```

---

## 📞 8. Contacto y Soporte

**En caso de dudas o problemas durante la implementación:**

- **Documentación oficial de Microsoft:**
  - [TCP/IP Settings](https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/tcpip-and-nbt-configuration-parameters)
  - [SQL Server Network Configuration](https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/configure-the-remote-query-timeout-server-configuration-option)

- **Equipo de desarrollo ETL:**
  - Contactar para validar que las pruebas post-implementación funcionan correctamente

---

## 📝 9. Notas Adicionales

### Impacto en Otros Sistemas

Los cambios en TCP KeepAlive afectan **todas las conexiones TCP del servidor**, no solo SQL Server. Sin embargo:

- ✅ **Beneficio general**: Mejora la detección de conexiones muertas
- ✅ **Sin impacto negativo**: 30 segundos es un valor conservador y seguro
- ✅ **Reduce recursos**: Libera conexiones muertas más rápido

### Alternativas si No se Puede Reiniciar el Servidor

Si no es posible reiniciar el servidor inmediatamente:

1. Aplicar cambios en SQL Server (no requiere reinicio)
2. Programar reinicio del servidor en próxima ventana de mantenimiento
3. Mientras tanto, ejecutar ETL en **rangos más cortos** (5-7 días máximo)

---

## ✅ Resultado Esperado

Después de aplicar esta configuración:

- ✅ Conexiones ODBC mantendrán actividad cada 30 segundos
- ✅ No más timeouts TCP después de 90 segundos
- ✅ ETL podrá extraer rangos de hasta 21 días sin interrupciones
- ✅ Tiempo estimado para 21 días: 15-20 minutos (vs timeout actual)

---

**Fecha de creación:** 2025-10-22
**Última actualización:** 2025-10-22
**Versión:** 1.0
