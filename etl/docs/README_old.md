# Sistema ETL - La Granja Mercado

Sistema de extracción, transformación y carga (ETL) para sincronizar inventarios desde múltiples servidores SQL Server hacia DuckDB.

## 🏗️ Arquitectura

```
📊 SQL Server (Múltiples IPs)     🔄 ETL Process      🦆 DuckDB Local
├── CEDI Valencia (192.168.1.10)  ├── Extractor  ──►  ├── inventario_raw
├── CEDI Norte (192.168.2.10)     ├── Transformer     ├── stock_actual
├── CEDI Sur (192.168.3.10)       ├── Loader          └── etl_logs
├── Tienda Bosque (192.168.10.11) └── Orchestrator
├── Tienda Aranzazu (...)
└── ... (17 tiendas + 3 CEDIs)
```

## 🚀 Instalación y Configuración

### 1. Instalar Dependencias

```bash
cd etl/
pip install -r requirements.txt
```

### 2. Configuración Inicial

```bash
# Configurar credenciales y estructura
python3 setup_etl.py

# Probar configuración básica
python3 setup_etl.py --test-basic
```

### 3. Completar Configuración Manual

1. **Editar `database_config.json`** con las IPs reales de tus servidores
2. **Personalizar `inventory_query.sql`** según tu esquema de base de datos
3. **Configurar `.env`** con credenciales reales

## 📋 Estructura de Archivos

```
etl/
├── config.py              # Configuración de conexiones y parámetros
├── extractor.py           # Extracción de datos desde SQL Server
├── transformer.py         # Transformación y limpieza de datos
├── loader.py              # Carga de datos a DuckDB
├── etl_orchestrator.py    # Orquestador principal
├── setup_etl.py           # Script de configuración inicial
├── requirements.txt       # Dependencias Python
├── .env                   # Credenciales (generado por setup)
├── database_config.json   # Configuración de ubicaciones (generado)
├── inventory_query.sql    # Query personalizable (generado)
├── logs/                  # Directorio de logs
└── README.md              # Esta documentación
```

## 🔧 Configuración Detallada

### Archivo `.env`
```bash
# Credenciales SQL Server
SQL_USER=tu_usuario
SQL_PASS=tu_password

# Configuración VPN
VPN_CONNECTED=true

# Configuración de logging
LOG_LEVEL=INFO
MAX_RETRY_ATTEMPTS=3
```

### Configuración de Ubicaciones (`database_config.json`)

```json
{
  "cedis": [
    {
      "ubicacion_id": "cedi_01",
      "ubicacion_nombre": "CEDI Inventario Mayor",
      "tipo": "cedi",
      "server_ip": "192.168.1.10",
      "database_name": "CEDI_VALENCIA",
      "prioridad": 1,
      "timeout_seconds": 60,
      "activo": true
    }
  ],
  "tiendas_principales": [...]
}
```

## 🚀 Uso del Sistema

### Comandos Principales

```bash
# Probar todas las conexiones
python3 etl_orchestrator.py --action test-connections

# ETL completo de todas las ubicaciones
python3 etl_orchestrator.py --action etl

# ETL solo ubicaciones prioritarias (CEDIs + tiendas principales)
python3 etl_orchestrator.py --action etl-priority

# ETL de ubicaciones específicas
python3 etl_orchestrator.py --action etl --ubicaciones cedi_01 tienda_01

# Usar query personalizado
python3 etl_orchestrator.py --action etl --query-file mi_query.sql

# No actualizar stock_actual (solo cargar datos raw)
python3 etl_orchestrator.py --action etl --no-update-stock
```

### Programación Automática

```bash
# Crontab para ejecución automática
crontab -e

# CEDIs cada 30 minutos
*/30 * * * * cd /ruta/etl && python3 etl_orchestrator.py --action etl-priority --max-priority 1

# Tiendas principales cada 2 horas
0 */2 * * * cd /ruta/etl && python3 etl_orchestrator.py --action etl-priority --max-priority 2

# Todas las ubicaciones una vez al día
0 6 * * * cd /ruta/etl && python3 etl_orchestrator.py --action etl
```

## 📊 Tablas de Datos

### `inventario_raw`
Datos de inventario en crudo extraídos de SQL Server:

```sql
├── ubicacion_id VARCHAR
├── codigo_producto VARCHAR
├── descripcion_producto VARCHAR
├── categoria VARCHAR
├── cantidad_actual DECIMAL(12,4)
├── precio_venta_actual DECIMAL(12,4)
├── valor_inventario_actual DECIMAL(18,2)
├── estado_stock VARCHAR(20)
├── fecha_extraccion TIMESTAMP
└── batch_id VARCHAR
```

### `stock_actual`
Datos actualizados para uso de la API:

```sql
├── ubicacion_id VARCHAR
├── producto_id VARCHAR
├── cantidad DECIMAL(12,4)
├── valor_inventario DECIMAL(18,2)
├── stock_minimo DECIMAL(12,4)
├── stock_maximo DECIMAL(12,4)
└── ultima_actualizacion TIMESTAMP
```

### `etl_logs`
Registro de ejecuciones del ETL:

```sql
├── proceso VARCHAR(50)
├── ubicacion_id VARCHAR
├── fecha_inicio TIMESTAMP
├── estado VARCHAR(20)  -- 'EXITOSO', 'FALLIDO', 'PARCIAL'
├── registros_procesados INTEGER
├── tiempo_ejecucion_segundos DECIMAL
└── detalles JSON
```

## 🔍 Monitoreo y Logs

### Logs del Sistema
```bash
# Ver logs del día actual
tail -f logs/orchestrator_$(date +%Y%m%d).log

# Ver logs de extracción
tail -f logs/extractor_$(date +%Y%m%d).log

# Ver logs de carga
tail -f logs/loader_$(date +%Y%m%d).log
```

### Consultas de Monitoreo

```sql
-- Estado de últimas ejecuciones
SELECT proceso, estado, fecha_inicio, registros_procesados, tiempo_ejecucion_segundos
FROM etl_logs
WHERE fecha_inicio >= CURRENT_DATE - INTERVAL '1 day'
ORDER BY fecha_inicio DESC;

-- Resumen por ubicación
SELECT
    ubicacion_id,
    COUNT(*) as total_extracciones,
    MAX(fecha_extraccion) as ultima_extraccion,
    COUNT(DISTINCT codigo_producto) as productos_unicos
FROM inventario_raw
WHERE fecha_extraccion >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY ubicacion_id;

-- Estados de stock crítico
SELECT ubicacion_id, COUNT(*) as productos_criticos
FROM inventario_raw
WHERE estado_stock = 'CRITICO'
  AND fecha_extraccion >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY ubicacion_id
ORDER BY productos_criticos DESC;
```

## 🛠️ Personalización

### Query de Inventario Personalizado

Edita `inventory_query.sql` según tu esquema:

```sql
-- Ejemplo personalizado para tu estructura
SELECT
    p.cod_producto as codigo_producto,
    p.descripcion_item as descripcion_producto,
    p.familia as categoria,
    s.stock_actual as cantidad_actual,
    p.precio_venta_1 as precio_venta_actual,
    p.costo_promedio as costo_unitario_actual,
    -- ... más campos según tu esquema
FROM items p
INNER JOIN stock s ON p.codigo = s.codigo_item
WHERE p.activo = 'S'
```

### Configuración Específica por Ubicación

```python
# En config.py, personalizar configuraciones
DatabaseConfig(
    ubicacion_id="tienda_especial",
    server_ip="192.168.15.100",
    database_name="MI_TIENDA_ESPECIAL",
    timeout_seconds=45,  # Mayor timeout
    max_reintentos=5,    # Más reintentos
    prioridad=1          # Alta prioridad
)
```

## ⚡ Optimización de Performance

### Configuraciones Recomendadas

```python
# Para CEDIs (volumen alto)
timeout_seconds=60
max_reintentos=3
prioridad=1

# Para Tiendas (volumen medio)
timeout_seconds=30
max_reintentos=2
prioridad=2

# Para Tiendas pequeñas
timeout_seconds=15
max_reintentos=1
prioridad=3
```

### Estrategias de Ejecución

1. **Horarios Escalonados**: CEDIs en horarios pico, tiendas en horarios valle
2. **Priorización**: Ubicaciones críticas primero
3. **Paralelización**: Múltiples ubicaciones simultáneas (próxima versión)
4. **Incremental**: Solo cambios desde última ejecución (próxima versión)

## 🚨 Troubleshooting

### Errores Comunes

**Error de conexión SQL Server:**
```bash
# Verificar conectividad
ping 192.168.1.10
telnet 192.168.1.10 1433

# Verificar VPN
python3 etl_orchestrator.py --action test-connections
```

**Error de permisos DuckDB:**
```bash
# Verificar permisos de archivo
ls -la ../data/fluxion_production.db
chmod 664 ../data/fluxion_production.db
```

**Query personalizado falla:**
```bash
# Probar query directamente en SQL Server
sqlcmd -S 192.168.1.10 -U usuario -P password -d database -Q "SELECT TOP 5 * FROM productos"
```

### Logs de Debug

```bash
# Activar logs detallados
export LOG_LEVEL=DEBUG
python3 etl_orchestrator.py --action test-connections
```

## 📈 Roadmap Futuro

- [ ] **Paralelización**: Múltiples ubicaciones simultáneas
- [ ] **ETL Incremental**: Solo cambios desde última ejecución
- [ ] **Notificaciones**: Slack/Email en errores críticos
- [ ] **Dashboard ETL**: UI web para monitoreo
- [ ] **ETL de Ventas**: Extracción de transacciones
- [ ] **ETL de Clientes**: Sincronización de maestro de clientes
- [ ] **API ETL**: Endpoints REST para control externo

## 🤝 Soporte

Para problemas específicos:

1. Revisar logs en `etl/logs/`
2. Ejecutar `python3 setup_etl.py --test-basic`
3. Probar conexiones individuales
4. Validar query personalizado en SQL Server

---

**La Granja Mercado - Sistema ETL v1.0**
*Diseñado para sincronización eficiente de inventarios multi-ubicación*