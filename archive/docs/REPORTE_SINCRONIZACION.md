# Reporte de Sincronización - Fluxion AI

## 📊 Descripción

El reporte de sincronización (`generar_reporte_sync.py`) muestra el estado actual de los datos en la base de datos, indicando:

- **Datos disponibles** por tienda
- **Gaps** (períodos sin datos recientes)
- **Históricos completos** vs incompletos
- **Recomendaciones** de acciones a tomar

## 🚀 Uso

```bash
python3 generar_reporte_sync.py
```

## 📋 Interpretación del Reporte

### Estados de Sincronización

| Icono | Estado | Significado |
|-------|--------|-------------|
| ✓ | `[COMPLETO]` | Tiene TODO el histórico disponible + datos actualizados |
| ● | `[ACTUALIZADO]` | Datos del día de hoy disponibles |
| ◐ | `[GAP: Xd]` | Le faltan X días de datos recientes |
| ○ | `[GAP: Xd]` | Gap significativo (>3 días) |
| ✗ | Sin datos | No hay ningún dato para esta ubicación |

### Indicadores de Histórico

- 📚 **Histórico desde YYYY-MM-DD**: Tiene datos desde la fecha más antigua disponible
- ⚠️ **Falta histórico**: No tiene todos los datos históricos disponibles en el sistema origen

## 📁 Configuración de Históricos

El archivo `config_historico_tiendas.json` define la **fecha más antigua** disponible en el sistema origen para cada tienda.

### Estructura del archivo:

```json
{
  "tiendas": {
    "tienda_01": {
      "nombre": "PERIFERICO",
      "fecha_inicio_historico": "2024-07-03",
      "notas": "Tiene datos desde julio 2024",
      "verificado": true
    }
  }
}
```

### Campos:

- **`fecha_inicio_historico`**: Primera fecha con datos disponibles en el sistema origen
- **`nombre`**: Nombre de la tienda para referencia
- **`notas`**: Observaciones sobre la disponibilidad de datos
- **`verificado`**: Si se ha confirmado que no hay datos más antiguos (boolean)
- **`historico_completo`** (opcional): Si se ha verificado que NO hay más datos históricos

## 🔄 Cómo Actualizar Configuración

### Cuando descubres que hay más datos históricos:

1. Edita `config_historico_tiendas.json`
2. Actualiza la `fecha_inicio_historico` a la fecha más antigua encontrada
3. Agrega notas explicando el descubrimiento
4. Marca `verificado: false` si no estás seguro

**Ejemplo:**

```json
"tienda_08": {
  "nombre": "BOSQUE",
  "fecha_inicio_historico": "2025-06-01",  // <- Cambiado de 2025-07-01
  "notas": "Descubrimos datos desde junio 2025 - actualizado 2025-10-10",
  "verificado": true
}
```

### Cuando confirmas que NO hay más datos históricos:

```json
"tienda_19": {
  "nombre": "GUIGUE",
  "fecha_inicio_historico": "2025-07-30",
  "notas": "HISTÓRICO COMPLETO - Verificado 2025-10-10: no hay datos antes de esta fecha",
  "verificado": true,
  "historico_completo": true  // <- Marca como completo
}
```

## 📊 Ejemplo de Reporte

```
📅 LÍNEA DE TIEMPO (ordenado por número de registros)

✓ tienda_19    GUIGUE               [COMPLETO]
  ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  📅 2025-07-30 → 2025-10-09  |  📊 72 días  |  📈 1,019,487 registros
  📚 Histórico desde 2025-07-30

◐ tienda_11    FLOR AMARILLO        [GAP: 1d]
  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  📅 2025-09-01 → 2025-10-09  |  📊 39 días  |  📈 770,136 registros
  ⚠️ Falta histórico (disponible desde 2025-08-01)
```

### Interpretación:

- **tienda_19**: ✓ **COMPLETO** - Tiene todos los datos históricos disponibles (desde 2025-07-30) y está actualizado
- **tienda_11**: ◐ **GAP 1d** - Falta cargar datos desde 2025-08-01 hasta 2025-09-01

## 🛠️ Acciones Recomendadas

El reporte genera comandos específicos para resolver problemas:

### 1. Cargar Históricos Faltantes

```
📚 Cargar datos históricos faltantes:
  • tienda_11: faltan desde 2025-08-01 hasta 2025-09-01
    Comando: python3 etl/core/etl_ventas_historico.py --tiendas tienda_11 --fecha-inicio 2025-08-01 --fecha-fin 2025-09-01
```

### 2. Sincronizar Datos Recientes

```
📌 Sincronizar datos recientes:
  • tienda_08: 1 días de retraso
```

**Ejecutar:**
```bash
python3 etl/core/etl_ventas.py --tienda tienda_08 --fecha 2025-10-10
```

## 🎯 Estado de Históricos

Al final del reporte verás un resumen:

```
📊 Estado de históricos:
  ✓ Completos: 16/16 tiendas
  ⚠️ Incompletos: 0/16 tiendas
  🎉 ¡Todas las tiendas activas tienen histórico completo!
```

### Estados posibles:

- **Completos**: Tiendas que tienen datos desde la `fecha_inicio_historico` definida
- **Incompletos**: Tiendas con datos históricos faltantes

## 🔍 Troubleshooting

### Problema: "Tienda marcada como incompleto pero no hay más datos"

**Solución**: Actualiza `config_historico_tiendas.json` con la fecha real de inicio:

```json
"tienda_XX": {
  "fecha_inicio_historico": "2025-MM-DD",  // <- Ajusta a la fecha real
  "notas": "Verificado: no hay datos antes de esta fecha",
  "verificado": true,
  "historico_completo": true
}
```

### Problema: "¿Cómo sé si realmente tengo TODO el histórico?"

**Pasos**:

1. Intenta cargar datos más antiguos con el ETL:
   ```bash
   python3 etl/core/etl_ventas_historico.py --tiendas tienda_XX --fecha-inicio 2025-01-01 --fecha-fin 2025-06-30
   ```

2. Si el ETL dice "Sin datos de ventas extraídos", entonces has llegado al límite

3. Actualiza `config_historico_tiendas.json` con la fecha más antigua que SÍ tiene datos

### Problema: "El reporte dice COMPLETO pero sé que faltan datos"

Esto puede pasar si:

1. La `fecha_inicio_historico` en el config está incorrecta (muy reciente)
2. Hay un gap en medio (datos viejos + datos recientes, pero falta el medio)

**Solución**: Verifica con queries directos a la BD:

```python
import duckdb
conn = duckdb.connect('data/fluxion_production.db')

# Ver rango de fechas disponibles
conn.execute("""
    SELECT
        MIN(fecha) as primera_fecha,
        MAX(fecha) as ultima_fecha,
        COUNT(DISTINCT fecha) as dias_unicos
    FROM ventas_raw
    WHERE ubicacion_id = 'tienda_XX'
""").fetchdf()

# Detectar gaps
conn.execute("""
    WITH fechas_esperadas AS (
        SELECT generate_series(
            (SELECT MIN(fecha::DATE) FROM ventas_raw WHERE ubicacion_id = 'tienda_XX'),
            (SELECT MAX(fecha::DATE) FROM ventas_raw WHERE ubicacion_id = 'tienda_XX'),
            INTERVAL '1 day'
        )::DATE as fecha
    )
    SELECT f.fecha
    FROM fechas_esperadas f
    LEFT JOIN (
        SELECT DISTINCT fecha::DATE as fecha
        FROM ventas_raw
        WHERE ubicacion_id = 'tienda_XX'
    ) v ON f.fecha = v.fecha
    WHERE v.fecha IS NULL
    ORDER BY f.fecha
    LIMIT 20
""").fetchdf()
```

## 📝 Mantenimiento

### Cuándo actualizar el config:

- ✅ Cuando agregues una tienda nueva al sistema
- ✅ Después de cargar históricos y confirmar que no hay más datos
- ✅ Si descubres que hay datos más antiguos disponibles
- ✅ Al menos una vez al mes, revisar y validar las fechas

### Buenas prácticas:

1. **Documenta en `notas`**: Explica por qué esa es la fecha de inicio
2. **Marca `verificado: true`**: Solo cuando hayas confirmado la fecha
3. **Usa `historico_completo: true`**: Solo cuando estés 100% seguro
4. **Comitea los cambios**: Para tener historial de actualizaciones

## 🔗 Archivos Relacionados

- **Script principal**: `generar_reporte_sync.py`
- **Configuración**: `config_historico_tiendas.json`
- **ETL histórico**: `etl/core/etl_ventas_historico.py`
- **ETL diario**: `etl/core/etl_ventas.py`

## 💡 Tips

- Ejecuta el reporte **cada mañana** para ver el estado de sincronización
- Usa los comandos sugeridos del reporte para corregir problemas
- Mantén actualizado `config_historico_tiendas.json` para tener reportes precisos
