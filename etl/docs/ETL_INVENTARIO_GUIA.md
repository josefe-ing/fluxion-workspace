# Guía ETL Inventario - La Granja Mercado

## Descripción
Esta guía explica cómo usar el sistema ETL para extraer datos de inventario de las diferentes ubicaciones (tiendas y CEDIs) de La Granja Mercado.

## Script Principal
**Archivo**: `etl_multi_tienda.py`

## Sintaxis Básica
```bash
python3 etl_multi_tienda.py [opciones]
```

## Opciones Disponibles

### Ver Ayuda
```bash
python3 etl_multi_tienda.py --help
python3 etl_multi_tienda.py -h
```

### Listar Tiendas Configuradas
```bash
python3 etl_multi_tienda.py --listar
```
**Resultado**: Lista todas las ubicaciones configuradas con su estado (activa/inactiva).

### Procesar UNA Tienda Específica
```bash
python3 etl_multi_tienda.py --tienda [ID_TIENDA]
```

**Ejemplos**:
```bash
# Tiendas principales
python3 etl_multi_tienda.py --tienda tienda_01  # PERIFERICO
python3 etl_multi_tienda.py --tienda tienda_02  # AV. BOLIVAR
python3 etl_multi_tienda.py --tienda tienda_03  # MAÑONGO
python3 etl_multi_tienda.py --tienda tienda_08  # BOSQUE
python3 etl_multi_tienda.py --tienda tienda_16  # TOCUYITO

# CEDIs (Centros de Distribución)
python3 etl_multi_tienda.py --tienda cedi_seco   # CEDI Seco
python3 etl_multi_tienda.py --tienda cedi_frio   # CEDI Frio
python3 etl_multi_tienda.py --tienda cedi_verde  # CEDI Verde

# Mayorista
python3 etl_multi_tienda.py --tienda mayorista_01  # PERIFERICO Mayorista
```

### Procesar VARIAS Tiendas Específicas
Para procesar múltiples tiendas en secuencia:

```bash
# Procesar 3 tiendas específicas
python3 etl_multi_tienda.py --tienda tienda_01 && \
python3 etl_multi_tienda.py --tienda tienda_02 && \
python3 etl_multi_tienda.py --tienda tienda_03
```

```bash
# Procesar todos los CEDIs
python3 etl_multi_tienda.py --tienda cedi_seco && \
python3 etl_multi_tienda.py --tienda cedi_frio && \
python3 etl_multi_tienda.py --tienda cedi_verde
```

### Procesar TODAS las Tiendas Activas
```bash
python3 etl_multi_tienda.py --todas
```
**Resultado**: Procesa automáticamente todas las ubicaciones que tienen `activo: True` en la configuración.

### Procesamiento en Paralelo (Experimental)
```bash
python3 etl_multi_tienda.py --todas --paralelo
```
**⚠️ Advertencia**: Esta opción es experimental y puede causar problemas de concurrencia en la base de datos.

## Ubicaciones Disponibles

### Tiendas Principales (16 ubicaciones)
| ID | Nombre | IP | Puerto | Depósito |
|---|---|---|---|---|
| tienda_01 | PERIFERICO | 192.168.20.12 | 14348 | 0102 |
| tienda_02 | AV. BOLIVAR | 192.168.30.52 | 14348 | 0202 |
| tienda_03 | MAÑONGO | 192.168.50.20 | 14348 | 0302 |
| tienda_04 | SAN DIEGO | 192.168.140.10 | 14348 | 0402 |
| tienda_05 | VIVIENDA | 192.168.80.10 | 14348 | 0502 |
| tienda_06 | NAGUANAGUA | 192.168.40.53 | 14348 | 0602 |
| tienda_07 | CENTRO | 192.168.130.10 | 14348 | 0702 |
| tienda_08 | BOSQUE | 192.168.150.10 | 14348 | 0802 |
| tienda_09 | GUACARA | 192.168.120.10 | 14348 | 0902 |
| tienda_10 | FERIAS | 192.168.70.10 | 14348 | 1002 |
| tienda_11 | FLOR AMARILLO | 192.168.160.10 | 1433 | 1102 |
| tienda_12 | PARAPARAL | 192.168.170.10 | 1433 | 1202 |
| tienda_13 | NAGUANAGUA III | 192.168.190.10 | 14348 | 1302 |
| tienda_15 | ISABELICA | 192.168.180.10 | 1433 | 1502 |
| tienda_16 | TOCUYITO | 192.168.110.10 | 1433 | 1602 |
| tienda_19 | GUIGUE | 192.168.210.10 | 1433 | 1902 |

### CEDIs (Centros de Distribución)
| ID | Nombre | IP | Puerto | Depósito |
|---|---|---|---|---|
| cedi_seco | CEDI Seco | 192.168.90.20 | 1433 | 0001 |
| cedi_frio | CEDI Frio | 192.168.170.20 | 1433 | 1710 |
| cedi_verde | CEDI Verde | 192.168.200.10 | 1433 | 1801 |

### Mayorista
| ID | Nombre | IP | Puerto | Depósito |
|---|---|---|---|---|
| mayorista_01 | PERIFERICO Mayorista | 192.168.20.12 | 14348 | - |

## Flujo del Proceso ETL

1. **Extracción**: Conecta al servidor SQL Server de la tienda
2. **Transformación**: Procesa y limpia los datos
3. **Carga**: Guarda los datos en DuckDB (`/data/fluxion_production.db`)

## Salidas del Proceso

### Logs
Los logs se guardan en la carpeta `/logs/`:
- `etl_multi_tienda_YYYYMMDD_HHMMSS.log`

### Base de Datos
Los datos se almacenan en:
- **DuckDB**: `/Users/jose/Developer/fluxion-workspace/data/fluxion_production.db`
- **Tabla**: `inventario_raw`

## Ejemplos de Uso Común

### Caso 1: Procesar una tienda específica
```bash
# Verificar configuración
python3 etl_multi_tienda.py --listar

# Procesar BOSQUE (tienda_08)
python3 etl_multi_tienda.py --tienda tienda_08
```

### Caso 2: Procesar todos los CEDIs
```bash
python3 etl_multi_tienda.py --tienda cedi_seco && \
python3 etl_multi_tienda.py --tienda cedi_frio && \
python3 etl_multi_tienda.py --tienda cedi_verde
```

### Caso 3: Procesamiento completo (todas las ubicaciones)
```bash
# Procesar todas las tiendas activas
python3 etl_multi_tienda.py --todas
```

### Caso 4: Solo tiendas principales (sin CEDIs)
```bash
for tienda in tienda_01 tienda_02 tienda_03 tienda_04 tienda_05 tienda_06 tienda_07 tienda_08 tienda_09 tienda_10 tienda_11 tienda_12 tienda_13 tienda_15 tienda_16 tienda_19; do
    echo "Procesando $tienda..."
    python3 etl_multi_tienda.py --tienda $tienda
done
```

## Solución de Problemas

### Error: "Login timeout expired"
**Causa**: Problemas de conectividad de red o configuración de puerto incorrecta.
**Solución**: Verificar que el puerto sea el correcto (1433 para SQL Server estándar, 14348 para puertos personalizados).

### Error: "unrecognized arguments"
**Causa**: Sintaxis incorrecta del comando.
**Solución**: Usar `--tienda` en lugar de pasarlo directamente.

### Error: Concurrencia en DuckDB
**Causa**: Múltiples procesos intentando escribir simultáneamente.
**Solución**: Evitar `--paralelo`, procesar secuencialmente.

## Monitoreo

### Ver progreso en tiempo real
```bash
# En otra terminal, monitorear logs
tail -f logs/etl_multi_tienda_$(date +%Y%m%d)*.log
```

### Verificar datos cargados
```bash
# Conectar a DuckDB para verificar
python3 -c "
import duckdb
conn = duckdb.connect('/Users/jose/Developer/fluxion-workspace/data/fluxion_production.db')
result = conn.execute('SELECT ubicacion_id, COUNT(*) as productos FROM inventario_raw GROUP BY ubicacion_id ORDER BY productos DESC').fetchall()
for row in result:
    print(f'{row[0]}: {row[1]} productos')
"
```

## Configuración

### Archivo de configuración
**Archivo**: `tiendas_config.py`

### Variables de entorno requeridas
```bash
export SQL_USER="beliveryApp"
export SQL_PASS="AxPG_25!"
```

## Mantenimiento

### Limpieza de logs antiguos
```bash
find logs/ -name "*.log" -mtime +7 -delete  # Eliminar logs > 7 días
```

### Backup de datos
```bash
cp /Users/jose/Developer/fluxion-workspace/data/fluxion_production.db \
   /path/to/backup/fluxion_production_$(date +%Y%m%d).db
```