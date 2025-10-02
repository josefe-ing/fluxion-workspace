# ETL de Ventas - Fluxion AI

## 📋 Resumen Ejecutivo

Sistema ETL para migración de datos históricos de ventas de 17 tiendas hacia DuckDB.

**Estado Actual**: 82.3M registros migrados (Sep 2024 - Sep 2025)

## 🎯 Objetivos

- Migrar datos históricos de ventas de todas las tiendas
- Centralizar en DuckDB para análisis de BI
- Mantener datos actualizados mediante proceso incremental
- Monitorear cobertura y calidad de datos

## 🏗️ Arquitectura

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Fuentes de Datos│    │   ETL Process    │    │   Destino       │
│                 │    │                  │    │                 │
│ • 17 Tiendas    │───▶│ • Extracción     │───▶│ • DuckDB        │
│ • Sistemas POS  │    │ • Transformación │    │ • ventas_raw    │
│ • APIs/DBs      │    │ • Carga          │    │ • 82.3M records │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📁 Estructura de Archivos

### Scripts Principales
```
etl_ventas_historico.py   # Script principal para carga histórica masiva
ver_estado_ventas.py      # Verificación de estado y cobertura
tiendas_config.py         # Configuración de todas las tiendas
config.py                 # Configuración general del sistema
```

### Archivos de Soporte
```
query_ventas_generic.sql  # Query base para extracción
requirements.txt          # Dependencias Python
.env                      # Variables de entorno (credenciales)
```

## 🚀 Uso Rápido

### 1. Verificar Conectividad (EJECUTAR SIEMPRE PRIMERO)
```bash
# Test rápido de IP y puertos
python3 core/test_conectividad_simple.py

# Verificación completa con BD (requiere dependencias SQL)
python3 core/verificar_conectividad.py
```

### 2. Verificar Estado de Datos
```bash
python3 core/ver_estado_ventas.py
```

### 3. Cargar Mes Específico
```bash
python3 core/etl_ventas_historico.py \
  --fecha-inicio 2024-08-01 \
  --fecha-fin 2024-08-31 \
  --tiendas tienda_01 tienda_02 tienda_03 \
  --secuencial
```

### 4. Carga Masiva (Múltiples Meses)
```bash
python3 core/etl_ventas_historico.py \
  --fecha-inicio 2024-01-01 \
  --fecha-fin 2024-12-31 \
  --tiendas tienda_01 tienda_02 \
  --secuencial
```

## 📊 Estado Actual de Datos

### Cobertura por Tienda (Top 10)
| Tienda | Nombre | Registros | Cobertura | Estado |
|--------|--------|-----------|-----------|--------|
| tienda_01 | PERIFERICO | 9.7M | 100% | ✅ |
| tienda_11 | FLOR AMARILLO | 8.1M | 92% | ✅ |
| tienda_12 | PARAPARAL | 6.8M | 92% | ✅ |
| tienda_04 | SAN DIEGO | 6.5M | 100% | ✅ |
| tienda_09 | GUACARA | 5.9M | 92% | ✅ |
| tienda_07 | CENTRO | 5.6M | 100% | ✅ |
| tienda_05 | VIVIENDA | 5.5M | 100% | ✅ |
| tienda_08 | BOSQUE | 5.5M | 85% | 🟡 |
| tienda_02 | AV. BOLIVAR | 5.4M | 100% | ✅ |
| tienda_06 | NAGUANAGUA | 5.3M | 100% | ✅ |

### Resumen Global
- **Total Registros**: 81,815,010 (actualizado sin mayorista_01)
- **Período**: Septiembre 2024 - Septiembre 2025 (13 meses)
- **Tiendas Activas**: 16 de 20 configuradas
- **Promedio/Mes**: 6.3M registros

## 🏪 Configuración de Tiendas

### Tiendas con Cobertura Completa (100%)
```
tienda_01 (PERIFERICO), tienda_02 (AV. BOLIVAR), tienda_03 (MAÑONGO)
tienda_04 (SAN DIEGO), tienda_05 (VIVIENDA), tienda_06 (NAGUANAGUA)
tienda_07 (CENTRO)
```

### Tiendas con Cobertura Parcial
```
tienda_08 (BOSQUE) - 85% - Faltan: Sep 2024, Mar 2025
tienda_13 (NAGUANAGUA III) - 85% - Faltan: Sep 2024, Jul 2025
tienda_15 (ISABELICA) - 85% - Faltan: Sep 2024, Oct 2024
```

### Tiendas de Apertura Reciente
```
tienda_16 (TOCUYITO) - Desde Mar 2025
tienda_19 (EXTRA) - Desde Jul 2025
```

## ⚙️ Configuración Técnica

### Base de Datos
- **Motor**: DuckDB
- **Archivo**: `/Users/jose/Developer/fluxion-workspace/data/fluxion_production.db`
- **Tabla Principal**: `ventas_raw`

### Esquema de Datos
```sql
CREATE TABLE ventas_raw (
    fecha DATE,
    ubicacion_id VARCHAR,
    producto_id VARCHAR,
    cantidad DECIMAL,
    precio_unitario DECIMAL,
    total DECIMAL,
    -- ... otros campos
);
```

### Parámetros de Rendimiento
- **Chunk Size**: 50,000 registros por lote
- **Max Workers**: 3 hilos paralelos
- **Timeout**: 2 minutos por chunk

## 🌐 Verificación de Conectividad

### Scripts de Conectividad
```
core/verificar_conectividad.py     # Verificación completa (IP + Puerto + BD)
core/test_conectividad_simple.py   # Test rápido (solo IP + Puerto)
```

### Antes de Ejecutar ETL - SIEMPRE verificar:

#### 1. Test Rápido de Red
```bash
python3 core/test_conectividad_simple.py
```
**Salida esperada**:
```
🔍 TEST SIMPLE DE CONECTIVIDAD - 2025-09-30 15:54
================================================================================
Tienda       Nombre          IP              Puerto Estado       Tiempo
--------------------------------------------------------------------------------
tienda_01    PERIFERICO      192.168.20.12   14348  ✅ OK         150ms
tienda_02    AV. BOLIVAR     192.168.30.52   14348  🟡 IP OK      3001ms
...
📊 Resumen: 10/19 tiendas con puertos abiertos (52.6%)
```

#### 2. Verificación Completa (con BD)
```bash
python3 core/verificar_conectividad.py --timeout 10
```

### Estados de Conectividad
- **✅ CONECTADA**: IP + Puerto + BD funcionando
- **🟡 PUERTO OK**: Puerto abierto pero BD falla
- **🟠 PING OK**: IP alcanzable pero puerto cerrado
- **❌ NO ALCANZABLE**: IP no responde
- **⚪ INACTIVA**: Configurada como inactiva

### Opciones de Verificación
```bash
# Verificación rápida
python3 core/test_conectividad_simple.py

# Verificación completa con timeout personalizado
python3 core/verificar_conectividad.py --timeout 5 --workers 5

# Verificación secuencial (más lenta pero estable)
python3 core/verificar_conectividad.py --secuencial

# Solo tiendas activas
python3 core/verificar_conectividad.py --solo-activas
```

### Interpretación de Resultados

#### ✅ Todo OK - Listo para ETL
```bash
📊 Resumen: 15/16 tiendas con puertos abiertos (93.8%)
🚀 COMANDO ETL SUGERIDO:
python3 core/etl_ventas_historico.py --fecha-inicio YYYY-MM-DD --fecha-fin YYYY-MM-DD --tiendas tienda_01 tienda_02 ... --secuencial
```

#### ⚠️ Problemas de Conectividad
```bash
📊 Resumen: 8/16 tiendas con puertos abiertos (50.0%)
💡 RECOMENDACIONES:
   ⚠️  Revisar conectividad antes de ETL:
      - tienda_08: Puerto cerrado
      - tienda_12: Error de BD
```

### Troubleshooting Conectividad

#### Problemas Comunes
1. **🟡 IP OK pero Puerto Cerrado**
   - Verificar que el servicio SQL Server esté corriendo
   - Revisar firewall en la tienda

2. **🟠 Puerto Abierto pero BD Falla**
   - Verificar credenciales en `.env`
   - Comprobar permisos de usuario BD
   - Revisar nombre de base de datos

3. **❌ IP No Alcanzable**
   - Verificar conectividad de red
   - Confirmar IP correcta en configuración
   - Revisar VPN si es necesario

## 🔄 Proceso de Migración

### Fases Completadas
1. **Sep 2024**: 2.9M registros (7 tiendas - inicio gradual)
2. **Oct-Dic 2024**: 15.5M registros (12-13 tiendas)
3. **Ene-Sep 2025**: 63.9M registros (13-16 tiendas)

### Próximos Pasos
1. **Carga Histórica**: Continuar con meses anteriores a Sep 2024
2. **Proceso Incremental**: Configurar actualizaciones diarias
3. **Monitoreo**: Alertas para nuevas tiendas y gaps de datos

## 🔧 Mantenimiento

### Comandos de Limpieza
```bash
# Limpiar reportes antiguos
rm reporte_ventas_historico_*.json

# Verificar integridad
python3 -c "import duckdb; print(duckdb.connect('data.db').execute('SELECT COUNT(*) FROM ventas_raw').fetchone())"
```

### Logs y Monitoreo
- **Directorio de Logs**: `./logs/`
- **Reportes**: Se generan automáticamente en JSON
- **Verificación**: Usar `ver_estado_ventas.py` regularmente

## 🚨 Troubleshooting

### Problemas Comunes
1. **"Sin datos extraídos"**: Tienda no operativa en esa fecha
2. **Timeout**: Reducir chunk_size o max_workers
3. **Memoria**: Procesar menos tiendas simultáneamente

### Contactos de Soporte
- **Desarrollo**: [Tu equipo]
- **Ops**: [Tu equipo de operaciones]
- **Data**: [Tu equipo de datos]

---
**Última Actualización**: 2025-09-30
**Versión**: 1.0
**Mantenido por**: Equipo Fluxion AI