# Clasificación ABC v2 - Basada en Valor Económico (Principio de Pareto)

## 📋 Índice

- [Resumen Ejecutivo](#resumen-ejecutivo)
- [Modelo ABC v2: Conceptos Fundamentales](#modelo-abc-v2-conceptos-fundamentales)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Instalación y Configuración](#instalación-y-configuración)
- [Uso del Sistema](#uso-del-sistema)
- [Análisis y Reportes](#análisis-y-reportes)
- [Casos de Uso](#casos-de-uso)
- [Consideraciones para Venezuela](#consideraciones-para-venezuela)
- [Troubleshooting](#troubleshooting)
- [Referencias](#referencias)

---

## Resumen Ejecutivo

### ¿Qué es ABC v2?

El sistema **ABC v2** es una implementación del análisis ABC clásico basado en el **Principio de Pareto (80/20)**, donde los productos se clasifican según su **valor de consumo económico** en lugar de su velocidad de rotación.

### Problema que Resuelve

La clasificación anterior basada en velocidad (bultos/día) ignora el valor económico:
- 1000 bultos de sal (bajo costo) pueden valer menos que 10 bultos de whisky premium
- Productos de alto margen y bajo volumen quedaban subvalorados
- Decisiones de inventario sub-óptimas

### Beneficios Clave

✅ **Priorización correcta**: Enfoque en productos que realmente impactan el valor del negocio
✅ **Optimización de capital**: Invertir recursos en lo que genera 80% del valor
✅ **Reducción de quiebres**: Proteger productos clase A (alto valor)
✅ **Análisis comparativo**: Identificar discrepancias entre velocidad y valor
✅ **Tendencias temporales**: Detectar productos emergentes o en declive

---

## Modelo ABC v2: Conceptos Fundamentales

### Principio de Pareto (80/20)

El análisis ABC tradicional se basa en el principio de que:
- **20% de los productos** generan **80% del valor**
- **30% adicional** genera **15% del valor**
- **50% restante** genera solo **5% del valor**

### Clasificación ABC v2

| Clase | % Productos (aprox) | % Valor Acumulado | Prioridad | Estrategia |
|-------|---------------------|-------------------|-----------|------------|
| **A** | ~20% | 0% - 80% | ⭐⭐⭐ MUY ALTA | Disponibilidad 99%, stock de seguridad alto, revisión diaria |
| **B** | ~30% | 80% - 95% | ⭐⭐ MEDIA | Disponibilidad 95%, stock moderado, revisión semanal |
| **C** | ~50% | 95% - 100% | ⭐ BAJA | Disponibilidad 90%, stock mínimo, revisión mensual |

### Fórmula de Valor de Consumo

```
Valor de Consumo = Σ (Unidades Vendidas × Costo Promedio Ponderado)
```

**Componentes:**
- **Unidades Vendidas**: Cantidad total vendida en el periodo
- **Costo Promedio Ponderado**: Promedio de costos considerando variaciones por inflación
- **Periodo**: Últimos 3 meses por defecto (ajustable)

### Clasificaciones Especiales

Además de A, B, C, el sistema maneja casos especiales:

| Estado | Descripción | Acción |
|--------|-------------|--------|
| **NUEVO** | Producto con <30 días en el periodo | Monitorear evolución |
| **SIN_MOVIMIENTO** | Sin ventas en el periodo | Evaluar descontinuación |
| **ERROR_COSTO** | Costos inconsistentes/faltantes | Corregir datos maestros |

---

## Arquitectura del Sistema

### Componentes

```
database/
├── schema_abc_v2.sql              # Schema de tablas
├── calculo_abc_v2.sql             # Script de cálculo automático
├── calcular_abc_v2.py             # Automatización Python
├── queries_analisis_abc_v2.sql    # 12 queries de análisis
├── calculo_indice_gini.sql        # Métricas de concentración
└── dashboard_abc_v2.sql           # Vistas para dashboards
```

### Tablas Principales

#### `productos_abc_v2`
Tabla principal con clasificación actual de cada producto.

**Campos clave:**
- `clasificacion_abc_valor`: A, B, C, NUEVO, SIN_MOVIMIENTO, ERROR_COSTO
- `valor_consumo_total`: Métrica principal para clasificación
- `porcentaje_acumulado`: % acumulado usado para Pareto
- `ranking_valor`: Posición en el ranking

#### `productos_abc_v2_historico`
Histórico de clasificaciones para análisis temporal.

#### `productos_abc_v2_evolucion`
Cambios entre periodos (ascendente, descendente, estable).

### Vistas de Dashboard

| Vista | Propósito |
|-------|-----------|
| `v_dashboard_abc_kpis` | KPIs ejecutivos principales |
| `v_dashboard_top20_productos` | TOP 20 productos por valor |
| `v_dashboard_abc_por_categoria` | Distribución ABC por categoría |
| `v_dashboard_alertas_abc` | Alertas y oportunidades accionables |
| `v_dashboard_discrepancias` | Velocidad vs Valor |
| `v_dashboard_trending` | Productos con tendencias significativas |
| `v_dashboard_curva_pareto` | Datos para gráfico de Pareto |
| `v_dashboard_metricas_concentracion` | Índice de Gini y HHI |

---

## Instalación y Configuración

### 1. Crear Tablas

```bash
# Conectar a la base de datos y ejecutar schema
cd database
python3 -c "
import duckdb
conn = duckdb.connect('../data/fluxion_production.db')
with open('schema_abc_v2.sql', 'r') as f:
    conn.execute(f.read())
conn.close()
"
```

**O alternativamente con el script Python:**

```bash
python3 calcular_abc_v2.py --crear-tablas
```

### 2. Verificar Instalación

```sql
-- Verificar que las tablas existen
SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE '%abc_v2%';

-- Resultado esperado:
-- productos_abc_v2
-- productos_abc_v2_historico
-- productos_abc_v2_evolucion
```

---

## Uso del Sistema

### Método 1: Script Python Automatizado (Recomendado)

#### Cálculo Básico (últimos 3 meses)

```bash
cd database
python3 calcular_abc_v2.py
```

#### Opciones Avanzadas

```bash
# Análisis semestral (6 meses)
python3 calcular_abc_v2.py --periodo SEMESTRAL --meses 6

# Análisis anual
python3 calcular_abc_v2.py --periodo ANUAL --meses 12

# Dry-run (sin guardar cambios)
python3 calcular_abc_v2.py --dry-run --verbose

# Con reporte comparativo velocidad vs valor
python3 calcular_abc_v2.py --comparativo

# Crear tablas + calcular
python3 calcular_abc_v2.py --crear-tablas --verbose
```

#### Parámetros del Script

| Parámetro | Valores | Default | Descripción |
|-----------|---------|---------|-------------|
| `--periodo` | TRIMESTRAL, SEMESTRAL, ANUAL | TRIMESTRAL | Tipo de periodo |
| `--meses` | 1-12 | 3 | Meses hacia atrás |
| `--dry-run` | flag | False | Ejecutar sin guardar |
| `--verbose` | flag | False | Información detallada |
| `--crear-tablas` | flag | False | Crear/verificar tablas |
| `--comparativo` | flag | False | Reporte velocidad vs valor |

### Método 2: SQL Directo

```sql
-- Ejecutar el script completo
.read calculo_abc_v2.sql

-- O paso por paso:

-- 1. Ajustar parámetros (editar en el script)
-- 2. Ejecutar cálculo
-- 3. Ver resultados
SELECT * FROM v_dashboard_abc_kpis;
```

### Método 3: Programación de Cálculo Automático

#### Cron Job (Linux/Mac)

```bash
# Editar crontab
crontab -e

# Ejecutar cada domingo a las 2 AM
0 2 * * 0 cd /path/to/fluxion-workspace/database && python3 calcular_abc_v2.py --periodo TRIMESTRAL >> /var/log/abc_v2.log 2>&1
```

#### Script de Automatización

```bash
#!/bin/bash
# automatizar_abc_v2.sh

cd /path/to/fluxion-workspace/database

echo "=== Iniciando cálculo ABC v2 $(date) ==="

python3 calcular_abc_v2.py \
    --periodo TRIMESTRAL \
    --meses 3 \
    --verbose \
    --comparativo

if [ $? -eq 0 ]; then
    echo "✓ Cálculo completado exitosamente"
else
    echo "✗ Error en el cálculo" >&2
    exit 1
fi
```

---

## Análisis y Reportes

### Reportes Principales

#### 1. Reporte Ejecutivo

```sql
SELECT * FROM v_reporte_ejecutivo_abc_v2;
```

**Muestra:**
- KPIs principales (total productos, valor)
- Distribución por clase A/B/C
- Cumplimiento del Pareto
- Índice de Gini
- Periodo de análisis

#### 2. TOP 20 Productos

```sql
SELECT * FROM v_dashboard_top20_productos;
```

**Incluye:**
- Ranking, código, descripción
- Clase ABC
- Valor de consumo y margen
- Tendencia de ranking
- Distribución geográfica

#### 3. Análisis Comparativo (Velocidad vs Valor)

```sql
-- Resumen por clasificación
SELECT
    clasificacion_velocidad,
    clasificacion_abc_valor,
    COUNT(*) as productos,
    SUM(valor_consumo_total) as valor_total
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B', 'C')
GROUP BY 1, 2
ORDER BY 1, 2;

-- O usar la vista de discrepancias
SELECT * FROM v_dashboard_discrepancias
LIMIT 20;
```

#### 4. Alertas y Oportunidades

```sql
SELECT * FROM v_dashboard_alertas_abc
ORDER BY prioridad DESC, valor_consumo DESC;
```

**Tipos de alertas:**
- 🔴 **ALTA**: Productos A con bajo margen, caídas rápidas
- 🟡 **MEDIA**: Alta concentración geográfica, oportunidades de crecimiento

#### 5. Productos Trending

```sql
SELECT * FROM v_dashboard_trending
WHERE nivel_atencion = 'CRÍTICO'
LIMIT 20;
```

#### 6. Análisis por Categoría

```sql
SELECT * FROM v_dashboard_abc_por_categoria
ORDER BY valor_total DESC;
```

### Queries de Análisis Avanzado

Disponibles en `queries_analisis_abc_v2.sql`:

1. **Distribución básica**: Resumen por clasificación
2. **Verificación Pareto**: ¿Se cumple la regla 80/20?
3. **Comparación velocidad/valor**: Matriz de confusión
4. **Discrepancias**: Alta velocidad/bajo valor y viceversa
5. **TOP productos**: Por valor absoluto y por categoría
6. **Análisis categórico**: Distribución ABC por categoría
7. **Evolución temporal**: Productos que cambiaron de clase
8. **Concentración geográfica**: Productos vendidos en pocas tiendas
9. **Alertas**: ERROR_COSTO, productos nuevos
10. **Análisis de margen**: Productos A más/menos rentables
11. **Curva de Pareto**: Datos para visualización
12. **Export completo**: Vista para CSV/Excel

### Métricas de Concentración

#### Índice de Gini

```sql
-- Ver cálculo completo
.read calculo_indice_gini.sql

-- O consultar vista consolidada
SELECT * FROM v_metricas_concentracion;
```

**Interpretación:**
- **0.0 - 0.3**: Distribución equitativa
- **0.3 - 0.5**: Concentración moderada
- **0.5 - 0.7**: Concentración alta
- **0.7 - 1.0**: Concentración muy alta/extrema

#### Índice HHI (Herfindahl-Hirschman)

**Interpretación:**
- **< 1500**: Mercado poco concentrado
- **1500 - 2500**: Mercado moderadamente concentrado
- **> 2500**: Mercado altamente concentrado

---

## Casos de Uso

### Caso 1: Planificación de Compras

**Objetivo**: Priorizar órdenes de compra según valor.

```sql
-- Productos clase A con stock bajo que requieren reposición
SELECT
    p.codigo,
    p.descripcion,
    abc.clasificacion_abc_valor,
    abc.valor_consumo_total,
    s.cantidad as stock_actual,
    pc.stock_minimo,
    pc.punto_reorden
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
JOIN stock_actual s ON p.id = s.producto_id
JOIN producto_ubicacion_config pc ON p.id = pc.producto_id
WHERE abc.clasificacion_abc_valor = 'A'
    AND s.cantidad <= pc.punto_reorden
ORDER BY abc.ranking_valor
LIMIT 50;
```

**Acción**: Generar órdenes de compra prioritarias para productos A.

### Caso 2: Optimización de Inventario

**Objetivo**: Reducir capital inmovilizado en productos C.

```sql
-- Productos clase C con exceso de stock
SELECT
    p.codigo,
    p.descripcion,
    abc.clasificacion_abc_valor,
    abc.valor_consumo_total,
    s.cantidad as stock_actual,
    pc.stock_maximo,
    (s.cantidad - pc.stock_maximo) as exceso,
    s.cantidad * p.costo_promedio as valor_inmovilizado
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
JOIN stock_actual s ON p.id = s.producto_id
JOIN producto_ubicacion_config pc ON p.id = pc.producto_id
WHERE abc.clasificacion_abc_valor = 'C'
    AND s.cantidad > pc.stock_maximo
ORDER BY valor_inmovilizado DESC
LIMIT 50;
```

**Acción**: Liquidar exceso de productos C, liberar capital.

### Caso 3: Estrategia de Precios

**Objetivo**: Revisar precios de productos A con bajo margen.

```sql
SELECT * FROM v_dashboard_alertas_abc
WHERE tipo_alerta = 'ALERTA_MARGEN_BAJO'
ORDER BY valor_consumo DESC;
```

**Acción**: Ajustar precios o negociar con proveedores.

### Caso 4: Expansión a Nuevas Tiendas

**Objetivo**: Identificar productos esenciales para surtir nueva tienda.

```sql
-- TOP 100 productos por valor (núcleo del negocio)
SELECT
    p.codigo,
    p.descripcion,
    p.categoria,
    abc.valor_consumo_total,
    abc.unidades_vendidas_total,
    abc.numero_ubicaciones as tiendas_actuales
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor IN ('A', 'B')
ORDER BY abc.ranking_valor
LIMIT 100;
```

**Acción**: Inventario inicial de nueva tienda basado en top productos.

### Caso 5: Detección de Tendencias

**Objetivo**: Identificar productos emergentes para invertir.

```sql
-- Productos con crecimiento rápido
SELECT * FROM v_dashboard_trending
WHERE indicador LIKE '%Crecimiento%'
    AND nivel_atencion IN ('CRÍTICO', 'IMPORTANTE')
ORDER BY cambio_porcentual DESC
LIMIT 20;
```

**Acción**: Asegurar disponibilidad y considerar promociones.

### Caso 6: Auditoría de Datos

**Objetivo**: Identificar productos con problemas de costos.

```sql
-- Productos sin costo válido
SELECT
    p.codigo,
    p.descripcion,
    abc.unidades_vendidas_total,
    abc.numero_transacciones,
    abc.observaciones
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
WHERE abc.clasificacion_abc_valor = 'ERROR_COSTO'
ORDER BY abc.unidades_vendidas_total DESC;
```

**Acción**: Corregir datos maestros de costos.

---

## Consideraciones para Venezuela

### 1. Manejo de Inflación

El sistema usa **costo promedio ponderado** del periodo para manejar la volatilidad de precios:

```sql
-- El cálculo considera costos variables en el tiempo
AVG(COALESCE(i.costo_unitario, 0)) as costo_promedio_ponderado,
STDDEV(COALESCE(i.costo_unitario, 0)) as desviacion_std_costo
```

**Recomendación**: Usar periodos más cortos (3 meses) en contextos inflacionarios.

### 2. Multi-Moneda (Bs / USD)

Aunque el sistema trabaja con costos en moneda local, es importante:

- Mantener costos actualizados
- Considerar tasa de cambio en análisis
- Productos importados pueden tener mayor volatilidad

### 3. Productos con Control de Precios

Algunos productos tienen márgenes regulados pero alto volumen:

```sql
-- Identificar productos de alto volumen pero bajo margen
SELECT * FROM v_dashboard_discrepancias
WHERE tipo_discrepancia = 'Alta velocidad / Bajo valor'
ORDER BY unidades DESC
LIMIT 20;
```

**Estrategia**: Aunque sean C por valor, mantener disponibilidad por demanda.

### 4. Frecuencia de Cálculo Recomendada

| Contexto | Frecuencia |
|----------|------------|
| Inflación alta (>50% anual) | Semanal o quincenal |
| Inflación moderada (10-50%) | Mensual |
| Inflación baja (<10%) | Trimestral |

---

## Troubleshooting

### Problema 1: Error de Deserialización DuckDB

```
SerializationException: Failed to deserialize
```

**Causa**: Incompatibilidad de versiones de DuckDB.

**Solución**:
```bash
# Actualizar DuckDB
pip install --upgrade duckdb

# O recrear la base de datos con versión actual
```

### Problema 2: Productos sin Clasificación

```sql
-- Verificar productos sin clasificación
SELECT COUNT(*)
FROM productos p
LEFT JOIN productos_abc_v2 abc ON p.id = abc.producto_id
WHERE abc.producto_id IS NULL
    AND p.activo = true;
```

**Causa**: Productos sin ventas en el periodo o no incluidos en el cálculo.

**Solución**: Verificar que el producto tenga ventas en `items_facturas`.

### Problema 3: Clasificación No Actualizada

```sql
-- Ver fecha del último cálculo
SELECT MAX(fecha_calculo) as ultimo_calculo
FROM productos_abc_v2;
```

**Solución**: Ejecutar `calcular_abc_v2.py` nuevamente.

### Problema 4: Resultados Inesperados en Pareto

```sql
-- Verificar distribución
SELECT * FROM v_dashboard_abc_kpis;
```

**Si no cumple Pareto**:
- ✓ Normal si el negocio tiene distribución más equitativa
- ⚠ Revisar si hay productos con costos erróneos que distorsionan

### Problema 5: Performance Lento

**Optimizaciones**:

```sql
-- Verificar índices
SELECT * FROM information_schema.indexes
WHERE table_name LIKE '%abc_v2%';

-- Recrear índices si es necesario
DROP INDEX IF EXISTS idx_abc_v2_producto_periodo;
CREATE INDEX idx_abc_v2_producto_periodo
    ON productos_abc_v2(producto_id, periodo_analisis, fecha_inicio);
```

---

## Referencias

### Documentación Técnica

- **Schema**: [`schema_abc_v2.sql`](../database/schema_abc_v2.sql)
- **Cálculo**: [`calculo_abc_v2.sql`](../database/calculo_abc_v2.sql)
- **Python**: [`calcular_abc_v2.py`](../database/calcular_abc_v2.py)
- **Queries**: [`queries_analisis_abc_v2.sql`](../database/queries_analisis_abc_v2.sql)
- **Gini**: [`calculo_indice_gini.sql`](../database/calculo_indice_gini.sql)
- **Dashboard**: [`dashboard_abc_v2.sql`](../database/dashboard_abc_v2.sql)

### Conceptos

- **Principio de Pareto**: [Wikipedia](https://es.wikipedia.org/wiki/Principio_de_Pareto)
- **Análisis ABC**: [Supply Chain Management](https://www.investopedia.com/terms/a/abc-inventory-control.asp)
- **Índice de Gini**: [Wikipedia](https://es.wikipedia.org/wiki/%C3%8Dndice_de_Gini)
- **Índice HHI**: [Wikipedia](https://es.wikipedia.org/wiki/%C3%8Dndice_Herfindahl-Hirschman)

### Contacto y Soporte

Para consultas sobre el sistema ABC v2:
- Revisar logs en `/var/log/abc_v2.log`
- Ejecutar con `--verbose` para diagnóstico
- Documentar error con contexto y datos de prueba

---

## Changelog

### v2.0 (2025-01-10)
- ✨ Implementación inicial ABC basado en valor económico
- ✨ Cálculo automático con Python
- ✨ 12 queries de análisis predefinidos
- ✨ Índice de Gini y HHI
- ✨ 8 vistas de dashboard
- ✨ Histórico y evolución temporal
- ✨ Manejo de inflación con costo promedio ponderado
- 📚 Documentación completa

---

**Última actualización**: 2025-01-10
**Versión**: 2.0
**Autor**: Claude Code (claude.ai/code)
**Sistema**: Fluxion AI - La Granja Mercado
