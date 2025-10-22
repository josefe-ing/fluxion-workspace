# 📋 Instrucciones para Validación de Datos ETL

## Contexto

Después de las optimizaciones del ETL (remoción de límites, cambio a SQLAlchemy, eliminación de OFFSET/FETCH), necesitamos validar que los datos sincronizados sean correctos y completos.

Existen **2 scripts de validación** disponibles:

---

## 1️⃣ Validación Local (Sin VPN)

**Script:** `etl/core/validar_datos_local.py`

**Propósito:** Analiza únicamente los datos ya sincronizados en DuckDB para detectar:
- Días sin datos (gaps)
- Anomalías estadísticas (días con muy pocos o muchos registros comparados con el promedio)
- Resumen de ventas por día

**Ventajas:**
- ✅ NO requiere conexión a SQL Server
- ✅ NO requiere VPN
- ✅ Rápido (solo consulta DuckDB local)

**Desventajas:**
- ⚠️ No compara contra la fuente de verdad (SQL Server)
- ⚠️ Solo detecta patrones sospechosos, no errores confirmados

### Uso:

```bash
cd /Users/jose/Developer/fluxion-workspace/etl/core

# Validar tienda 01 para octubre 1-22, 2025
python3 validar_datos_local.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-10-01 \
  --fecha-fin 2025-10-22

# Con exportación a CSV
python3 validar_datos_local.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-10-01 \
  --fecha-fin 2025-10-22 \
  --export-csv /tmp/validacion_tienda01_local.csv
```

### Salida:

```
================================================================================
🔍 VALIDACIÓN LOCAL DE DATOS: PERIFERICO
================================================================================
📅 Período: 2025-10-01 a 2025-10-22
💾 DuckDB: /Users/jose/Developer/fluxion-workspace/data/fluxion_production.db
================================================================================

📊 Consultando datos sincronizados...
   ✅ Encontrados datos para 21 días

====================================================================================================
📊 REPORTE DE VALIDACIÓN LOCAL - PERIFERICO
====================================================================================================

📈 RESUMEN GENERAL:
   Total días analizados: 22
   ✅ Días con datos: 21 (95.5%)
   ❌ Días sin datos: 1
   ⚠️  Días con anomalías: 2
   ✅ Días normales: 19

   📊 Total registros: 567,234
   🧾 Total facturas: 12,456
   💰 Venta total: $234,567.89

   📊 Promedio diario: 27,011 registros
   📊 Mediana diaria: 26,543 registros
   📊 Desviación estándar: 3,421 registros

====================================================================================================
📅 DETALLE POR DÍA:
====================================================================================================
Fecha        Registros    Facturas     Venta Total    Venta Prom     Estado          Observaciones
----------------------------------------------------------------------------------------------------------------------------
2025-10-01      28,123      1,234       $12,345.67     $10.02         ✅ NORMAL       Dentro del rango esperado
2025-10-02      26,543      1,187       $11,234.56     $9.88          ✅ NORMAL       Dentro del rango esperado
2025-10-03           0          0            $0.00     $0.00          ❌ SIN DATOS    No hay registros para este día
...
```

---

## 2️⃣ Validación Completa con SQL Server (Con VPN)

**Script:** `etl/core/validar_calidad_datos.py`

**Propósito:** Compara día por día los conteos entre:
- **SQL Server** (fuente de verdad)
- **DuckDB** (datos sincronizados)

**Ventajas:**
- ✅ Validación exacta contra la fuente de verdad
- ✅ Detecta discrepancias precisas (faltantes o excesos)
- ✅ Genera recomendaciones de re-sincronización específicas

**Desventajas:**
- ⚠️ Requiere conexión VPN a SQL Server
- ⚠️ Más lento (consulta ambas bases de datos)

### Uso:

```bash
# IMPORTANTE: Conectarse a la VPN PRIMERO
cd /Users/jose/Developer/fluxion-workspace/etl/core

# Validar tienda 01 para octubre 1-22, 2025
python3 validar_calidad_datos.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-10-01 \
  --fecha-fin 2025-10-22

# Con exportación a CSV
python3 validar_calidad_datos.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-10-01 \
  --fecha-fin 2025-10-22 \
  --export-csv /tmp/validacion_tienda01_completa.csv
```

### Salida:

```
================================================================================
🔍 VALIDANDO CALIDAD DE DATOS: PERIFERICO
================================================================================
📅 Período: 2025-10-01 a 2025-10-22
📡 SQL Server: 192.168.20.12:14348
💾 DuckDB: /Users/jose/Developer/fluxion-workspace/data/fluxion_production.db
================================================================================

📊 Consultando SQL Server (fuente de verdad)...
   ✅ SQL Server: 21 días con datos
💾 Consultando DuckDB (datos sincronizados)...
   ✅ DuckDB: 19 días con datos

🔍 Comparando datos día por día...

====================================================================================================
📊 REPORTE DE VALIDACIÓN DE CALIDAD - PERIFERICO
====================================================================================================

📈 RESUMEN GENERAL:
   Total días analizados: 22
   ✅ Días con match perfecto: 19 (86.4%)
   ⚠️  Días sin datos (ambas fuentes): 0
   ❌ Días con registros faltantes: 2
   ⚠️  Días con registros de más: 0

   📊 Total registros en SQL Server: 567,890
   💾 Total registros en DuckDB: 510,234
   📉 Diferencia: -57,656
   📊 Porcentaje de completitud: 89.85%

====================================================================================================
📅 DETALLE POR DÍA:
====================================================================================================
Fecha        SQL Server      DuckDB    Diferencia    Match %     Estado
----------------------------------------------------------------------------------------------------
2025-10-01       28,123      28,123            +0     100.0%     ✅ PERFECTO
2025-10-02       26,543      26,543            +0     100.0%     ✅ PERFECTO
2025-10-03       27,456           0       -27,456       0.0%     ❌ FALTANTE
2025-10-04       29,834      29,834            +0     100.0%     ✅ PERFECTO
...

====================================================================================================
⚠️  DÍAS CON DISCREPANCIAS:
====================================================================================================
   ❌ FALTANTE 2025-10-03: SQL=27,456, DuckDB=0, Dif=-27,456
   ❌ FALTANTE 2025-10-15: SQL=30,200, DuckDB=0, Dif=-30,200

====================================================================================================

💡 RECOMENDACIONES:
   • Re-ejecutar ETL para el período: 2025-10-03 a 2025-10-15
   • Comando sugerido:
     python3 etl_ventas.py --tienda tienda_01 --fecha-inicio 2025-10-03 --fecha-fin 2025-10-15
```

---

## 🎯 Flujo de Trabajo Recomendado

### Paso 1: Validación Rápida (Sin VPN)
```bash
# Ejecutar validación local para detectar patrones sospechosos
python3 validar_datos_local.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-10-01 \
  --fecha-fin 2025-10-22
```

Si detectas días sin datos o anomalías, procede al Paso 2.

### Paso 2: Validación Completa (Con VPN)
```bash
# Conectar VPN primero
# Luego ejecutar validación completa contra SQL Server
python3 validar_calidad_datos.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-10-01 \
  --fecha-fin 2025-10-22 \
  --export-csv /tmp/validacion_completa.csv
```

### Paso 3: Re-sincronización de Gaps (Con VPN)
```bash
# Si la validación detectó gaps, re-ejecutar ETL para esos días
cd /Users/jose/Developer/fluxion-workspace/etl/core

python3 etl_ventas.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-10-03 \
  --fecha-fin 2025-10-03  # Día específico
```

### Paso 4: Re-validación
```bash
# Volver a ejecutar validación completa para confirmar
python3 validar_calidad_datos.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-10-01 \
  --fecha-fin 2025-10-22
```

---

## 📝 Notas Importantes

### Sobre los Scripts

1. **Ambos scripts** usan el mismo SQL query que el ETL para contar registros en SQL Server, garantizando consistencia.

2. **ubicacion_id vs tienda_id**: Los scripts usan `ubicacion_id` internamente (de la configuración) pero el parámetro CLI es `--tienda tienda_01` por claridad.

3. **Códigos de salida**:
   - `0` = Validación exitosa, sin problemas
   - `1` = Se encontraron discrepancias o errores

### Tiendas Disponibles

Para ver todas las tiendas configuradas:
```bash
cd /Users/jose/Developer/fluxion-workspace/etl/core
python3 etl_ventas.py --mostrar-tiendas
```

Ejemplo de salida:
```
🏪 TIENDAS DISPONIBLES:
==================================================
   tienda_01: PERIFERICO
   tienda_08: PRINCIPAL
   tienda_10: CATIA
   ...
==================================================
```

### Validar Múltiples Tiendas

Para validar todas las tiendas activas, puedes crear un simple loop:

```bash
# Validación local (sin VPN)
for tienda in tienda_01 tienda_08 tienda_10; do
  echo "Validando $tienda..."
  python3 validar_datos_local.py \
    --tienda $tienda \
    --fecha-inicio 2025-10-01 \
    --fecha-fin 2025-10-22
done

# Validación completa (con VPN)
for tienda in tienda_01 tienda_08 tienda_10; do
  echo "Validando $tienda contra SQL Server..."
  python3 validar_calidad_datos.py \
    --tienda $tienda \
    --fecha-inicio 2025-10-01 \
    --fecha-fin 2025-10-22 \
    --export-csv /tmp/validacion_${tienda}.csv
done
```

---

## 🔧 Troubleshooting

### Error: "Login timeout expired"
- **Causa**: No estás conectado a la VPN
- **Solución**: Conectar VPN y reintentar
- **Script afectado**: Solo `validar_calidad_datos.py` (el que consulta SQL Server)

### Error: "ubicacion_id = ?" returned no results
- **Causa**: La tienda no tiene datos para ese rango de fechas
- **Solución**: Verificar que el rango de fechas sea correcto y que la tienda tenga ventas en ese período

### Error: "No function matches 'sum(VARCHAR)'"
- **Causa**: La tabla `ventas_raw` almacena números como texto
- **Solución**: ✅ Ya corregido en ambos scripts usando `TRY_CAST()`

### Performance lento en validación completa
- **Causa**: Consultar SQL Server para muchos días puede ser lento
- **Solución**: Validar en rangos más pequeños (7-14 días a la vez)

---

## 📊 Próximos Pasos

Después de validar los datos sincronizados:

1. ✅ Ejecutar validación local para identificar gaps rápidamente
2. ✅ Ejecutar validación completa (con VPN) para confirmar discrepancias exactas
3. ✅ Re-sincronizar días faltantes específicos
4. ✅ Compartir `GUIA_DBA_TCP_KEEPALIVE.md` con DBA para mejorar estabilidad de conexiones
5. ✅ Configurar ETL programado en AWS con los scripts optimizados

---

**Última actualización:** 2025-10-22
**Scripts creados por:** Claude Code Optimization Session
