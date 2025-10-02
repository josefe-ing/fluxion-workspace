# 🚀 Guía de Producción - ETL La Granja Mercado

Esta guía te llevará paso a paso para poner en producción el sistema ETL con **datos reales de El Bosque**.

## ✅ **Estado Actual del Proyecto**

### **Completado**
- ✅ Sistema ETL completo desarrollado
- ✅ Query real de inventario integrado
- ✅ Configuración específica para El Bosque
- ✅ Lógica de transformación y carga validada
- ✅ Conexión a DuckDB funcional
- ✅ API backend funcionando en puerto 8001

### **Pendiente**
- 🔧 Finalizar instalación driver ODBC SQL Server
- 🧪 Prueba de conexión real a El Bosque
- ⚡ Ejecución ETL con datos en vivo

---

## 🔧 **Paso 1: Completar Instalación Driver ODBC**

### **macOS (Tu sistema actual)**

```bash
# 1. Verificar que unixODBC esté instalado
brew list | grep unixodbc

# 2. Instalar Microsoft ODBC Driver 17
brew install microsoft/mssql-release/msodbcsql17

# 3. Verificar instalación
odbcinst -j
cat /opt/homebrew/etc/odbcinst.ini
```

Si el paso 2 falla, alternativamente:

```bash
# Instalación manual del driver
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Microsoft/homebrew-mssql-release/master/Formula/msodbcsql17.rb)"
```

### **Linux (Para servidores de producción)**

```bash
# Ubuntu/Debian
curl https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add -
curl https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/prod.list | sudo tee /etc/apt/sources.list.d/msprod.list
sudo apt-get update
sudo ACCEPT_EULA=Y apt-get install -y msodbcsql17

# CentOS/RHEL
sudo curl https://packages.microsoft.com/config/rhel/8/prod.repo > /etc/yum.repos.d/msprod.repo
sudo ACCEPT_EULA=Y yum install -y msodbcsql17
```

---

## 🧪 **Paso 2: Probar Conexión Real**

Una vez instalado el driver ODBC:

```bash
cd etl/

# Probar conexión básica
python3 test_connection_generic.py

# Si la conexión funciona, probar extracción
python3 el_bosque_config.py
```

**Resultado esperado:**
```
✅ Conexión exitosa a El Bosque
✅ Query exitoso: XXX productos encontrados
📋 Muestra de productos:
   • HAR001: Harina de Maíz Precocida (Stock: 150)
   • ARR002: Arroz Blanco Grano Largo (Stock: 80)
   ...
```

---

## ⚡ **Paso 3: Ejecutar ETL Completo**

### **ETL de Prueba (Solo El Bosque)**

```bash
# ETL completo de El Bosque
python3 etl_orchestrator.py --action etl --ubicaciones tienda_01

# Ver logs en tiempo real
tail -f logs/orchestrator_$(date +%Y%m%d).log
```

### **Programación Automática**

```bash
# Editar crontab
crontab -e

# Agregar trabajos programados:
# El Bosque cada 2 horas
0 */2 * * * cd /ruta/completa/etl && python3 etl_orchestrator.py --action etl --ubicaciones tienda_01

# Todos los CEDIs cada 30 minutos (cuando agregues más)
*/30 * * * * cd /ruta/completa/etl && python3 etl_orchestrator.py --action etl-priority --max-priority 1

# Backup diario de logs
0 6 * * * cd /ruta/completa/etl && tar -czf logs/backup_$(date +%Y%m%d).tar.gz logs/*.log
```

---

## 📊 **Paso 4: Verificar Datos en DuckDB**

### **Consultas de Verificación**

```sql
-- Conectar a DuckDB
cd ../data
duckdb fluxion_production.db

-- Verificar datos cargados
SELECT COUNT(*) FROM inventario_raw WHERE ubicacion_id = 'tienda_01';

-- Ver últimos datos de El Bosque
SELECT codigo_producto, descripcion_producto, categoria, cantidad_actual, estado_stock
FROM inventario_raw
WHERE ubicacion_id = 'tienda_01'
ORDER BY fecha_extraccion DESC
LIMIT 10;

-- Verificar stock_actual actualizado
SELECT COUNT(*) FROM stock_actual WHERE ubicacion_id = 'tienda_01';

-- Estados de stock
SELECT estado_stock, COUNT(*) as cantidad
FROM inventario_raw
WHERE ubicacion_id = 'tienda_01'
GROUP BY estado_stock;
```

---

## 🔍 **Paso 5: Integrar con API Frontend**

### **Verificar API Backend**

```bash
# El backend debe estar corriendo en puerto 8001
curl http://localhost:8001/api/ubicaciones | jq

# Verificar que El Bosque esté listado
curl http://localhost:8001/api/ubicaciones | jq '.[] | select(.id=="tienda_01")'
```

### **Actualizar Frontend**

El frontend ya está configurado para mostrar las ubicaciones reales desde la API. Una vez que el ETL cargue datos de El Bosque, automáticamente aparecerán en el selector.

---

## 📈 **Paso 6: Escalamiento a Múltiples Ubicaciones**

### **Agregar Nuevas Ubicaciones**

1. **Editar `config.py`** y agregar configuraciones:

```python
# Ejemplo para CEDI Valencia
"cedi_01": DatabaseConfig(
    ubicacion_id="cedi_01",
    ubicacion_nombre="CEDI Inventario Mayor",
    tipo="cedi",
    server_ip="192.168.1.10",  # IP real
    database_name="CEDI_VALENCIA",  # Nombre real
    username="beliveryApp",
    password="AxPG_25!",
    port=14348,
    prioridad=1
)
```

2. **Probar nueva ubicación:**

```bash
python3 etl_orchestrator.py --action test-connections
python3 etl_orchestrator.py --action etl --ubicaciones cedi_01
```

### **ETL Escalonado por Prioridades**

```bash
# Solo ubicaciones críticas (prioridad 1)
python3 etl_orchestrator.py --action etl-priority --max-priority 1

# Ubicaciones principales (prioridad 1-2)
python3 etl_orchestrator.py --action etl-priority --max-priority 2

# Todas las ubicaciones
python3 etl_orchestrator.py --action etl
```

---

## 🚨 **Monitoreo y Alertas**

### **Logs del Sistema**

```bash
# Ver logs del día actual
tail -f logs/orchestrator_$(date +%Y%m%d).log
tail -f logs/extractor_$(date +%Y%m%d).log
tail -f logs/loader_$(date +%Y%m%d).log

# Buscar errores
grep -i error logs/orchestrator_$(date +%Y%m%d).log
```

### **Consultas de Monitoreo**

```sql
-- Última ejecución exitosa por ubicación
SELECT
    ubicacion_id,
    MAX(fecha_inicio) as ultima_ejecucion,
    estado
FROM etl_logs
WHERE proceso = 'carga_inventario'
GROUP BY ubicacion_id, estado
ORDER BY ultima_ejecucion DESC;

-- Productos críticos por ubicación
SELECT
    ubicacion_id,
    COUNT(*) as productos_criticos
FROM inventario_raw
WHERE estado_stock = 'CRITICO'
  AND fecha_extraccion >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY ubicacion_id;

-- Performance del ETL
SELECT
    DATE(fecha_inicio) as fecha,
    COUNT(*) as ejecuciones,
    AVG(tiempo_ejecucion_segundos) as tiempo_promedio,
    AVG(registros_procesados) as registros_promedio
FROM etl_logs
WHERE fecha_inicio >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(fecha_inicio)
ORDER BY fecha DESC;
```

---

## 🔧 **Troubleshooting**

### **Error: Driver ODBC no encontrado**
```bash
# Verificar drivers disponibles
python3 -c "import pyodbc; print(pyodbc.drivers())"

# Reinstalar driver
brew uninstall msodbcsql17
brew install microsoft/mssql-release/msodbcsql17
```

### **Error: Timeout de conexión**
- Verificar conexión VPN
- Verificar firewall en SQL Server
- Aumentar timeout en configuración

### **Error: Query SQL**
- Verificar nombres de tablas en tu esquema
- Adaptar query en `el_bosque_config.py`
- Probar query directamente en SSMS

### **Error: Permisos DuckDB**
```bash
# Verificar permisos
ls -la ../data/fluxion_production.db
chmod 664 ../data/fluxion_production.db
```

---

## 🎯 **Checklist de Producción**

### **Pre-Producción**
- [ ] Driver ODBC instalado correctamente
- [ ] Conexión VPN estable
- [ ] Credenciales SQL Server válidas
- [ ] DuckDB funcionando
- [ ] Query de inventario probado en SSMS

### **Puesta en Producción**
- [ ] ETL de prueba ejecutado exitosamente
- [ ] Datos cargados y verificados en DuckDB
- [ ] API backend sirviendo datos reales
- [ ] Frontend mostrando ubicaciones reales
- [ ] Logs funcionando correctamente

### **Post-Producción**
- [ ] Crontabs configurados
- [ ] Monitoreo de logs implementado
- [ ] Plan de backup de datos
- [ ] Documentación actualizada
- [ ] Capacitación del equipo

---

## 📞 **Soporte**

### **Archivos Clave**
- `etl_orchestrator.py` - Orquestador principal
- `el_bosque_config.py` - Configuración El Bosque
- `config.py` - Configuraciones generales
- `logs/` - Directorio de logs

### **Comandos de Diagnóstico**
```bash
# Estado general
python3 setup_etl.py --test-basic

# Test de conexiones
python3 etl_orchestrator.py --action test-connections

# Estadísticas ETL
python3 -c "
from loader import DuckDBLoader
loader = DuckDBLoader()
stats = loader.get_etl_statistics(7)
print(stats)
"
```

---

**🎉 Una vez completado, tendrás un sistema ETL robusto sincronizando inventarios en tiempo real desde El Bosque hacia tu dashboard ejecutivo.**

**📧 Para soporte específico, conserva los logs y las configuraciones utilizadas.**