# ABC v2 - Clasificación Basada en Valor Económico

Sistema de clasificación ABC implementando el Principio de Pareto (80/20) basado en valor de consumo.

## 🚀 Inicio Rápido

### 1. Instalación (Primera vez)

```bash
cd database
python3 calcular_abc_v2.py --crear-tablas --verbose
```

### 2. Ejecutar Cálculo ABC v2

```bash
# Cálculo trimestral (últimos 3 meses) - Recomendado
python3 calcular_abc_v2.py

# Con análisis comparativo velocidad vs valor
python3 calcular_abc_v2.py --comparativo

# Análisis semestral
python3 calcular_abc_v2.py --periodo SEMESTRAL --meses 6
```

### 3. Ver Resultados

```bash
# Desde Python/DuckDB
python3 << EOF
import duckdb
conn = duckdb.connect('../data/fluxion_production.db')

# KPIs principales
print(conn.execute('SELECT * FROM v_dashboard_abc_kpis').fetchdf())

# TOP 20 productos
print(conn.execute('SELECT * FROM v_dashboard_top20_productos').fetchdf())

# Alertas
print(conn.execute('SELECT * FROM v_dashboard_alertas_abc LIMIT 10').fetchdf())

conn.close()
EOF
```

## 📁 Archivos del Sistema

| Archivo | Propósito |
|---------|-----------|
| `schema_abc_v2.sql` | Definición de tablas y vistas |
| `calculo_abc_v2.sql` | Lógica de cálculo SQL completo |
| `calcular_abc_v2.py` | Script Python automatizado ⭐ |
| `queries_analisis_abc_v2.sql` | 12 queries de análisis |
| `calculo_indice_gini.sql` | Métricas de concentración |
| `dashboard_abc_v2.sql` | 8 vistas para dashboards |

## 🎯 Clasificación ABC

### Principio de Pareto (80/20)

| Clase | Productos | Valor | Estrategia |
|-------|-----------|-------|------------|
| **A** | ~20% | 80% | ⭐⭐⭐ Prioridad máxima - Stock alto, revisión diaria |
| **B** | ~30% | 15% | ⭐⭐ Prioridad media - Stock moderado, revisión semanal |
| **C** | ~50% | 5% | ⭐ Prioridad baja - Stock mínimo, revisión mensual |

### Fórmula

```
Valor de Consumo = Σ(Unidades Vendidas × Costo Promedio Ponderado)
```

## 📊 Vistas de Dashboard

```sql
-- 1. KPIs Principales
SELECT * FROM v_dashboard_abc_kpis;

-- 2. TOP 20 Productos
SELECT * FROM v_dashboard_top20_productos;

-- 3. Por Categoría
SELECT * FROM v_dashboard_abc_por_categoria;

-- 4. Alertas y Oportunidades
SELECT * FROM v_dashboard_alertas_abc;

-- 5. Discrepancias (Velocidad vs Valor)
SELECT * FROM v_dashboard_discrepancias;

-- 6. Productos Trending
SELECT * FROM v_dashboard_trending;

-- 7. Curva de Pareto
SELECT * FROM v_dashboard_curva_pareto;

-- 8. Métricas de Concentración (Gini, HHI)
SELECT * FROM v_dashboard_metricas_concentracion;
```

## 🔧 Opciones del Script Python

```bash
# Ver ayuda
python3 calcular_abc_v2.py --help

# Opciones principales
--periodo {TRIMESTRAL,SEMESTRAL,ANUAL}  # Tipo de periodo
--meses N                                # Número de meses (default: 3)
--dry-run                                # Sin guardar cambios
--verbose                                # Información detallada
--crear-tablas                           # Crear/verificar tablas
--comparativo                            # Reporte velocidad vs valor
```

## 📈 Casos de Uso Comunes

### Caso 1: Productos A con Stock Bajo

```sql
SELECT
    p.codigo,
    p.descripcion,
    abc.valor_consumo_total,
    s.cantidad as stock_actual,
    pc.stock_minimo
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
JOIN stock_actual s ON p.id = s.producto_id
JOIN producto_ubicacion_config pc ON p.id = pc.producto_id
WHERE abc.clasificacion_abc_valor = 'A'
    AND s.cantidad <= pc.punto_reorden
ORDER BY abc.ranking_valor
LIMIT 20;
```

### Caso 2: Productos C con Exceso de Inventario

```sql
SELECT
    p.codigo,
    p.descripcion,
    abc.clasificacion_abc_valor,
    s.cantidad as stock_actual,
    pc.stock_maximo,
    (s.cantidad - pc.stock_maximo) as exceso
FROM productos_abc_v2 abc
JOIN productos p ON abc.producto_id = p.id
JOIN stock_actual s ON p.id = s.producto_id
JOIN producto_ubicacion_config pc ON p.id = pc.producto_id
WHERE abc.clasificacion_abc_valor = 'C'
    AND s.cantidad > pc.stock_maximo
ORDER BY exceso DESC
LIMIT 20;
```

### Caso 3: Productos con Crecimiento Rápido

```sql
SELECT * FROM v_dashboard_trending
WHERE indicador LIKE '%Crecimiento%'
ORDER BY cambio_porcentual DESC
LIMIT 20;
```

## 🔍 Métricas de Concentración

### Índice de Gini

```sql
-- Ver todas las métricas de concentración
.read calculo_indice_gini.sql

-- O consultar vista consolidada
SELECT * FROM v_metricas_concentracion;
```

**Interpretación:**
- **0.0 - 0.3**: Distribución equitativa
- **0.3 - 0.5**: Concentración moderada
- **0.5 - 0.7**: Concentración alta ⚠️
- **0.7 - 1.0**: Concentración muy alta 🔴

## ⏰ Automatización

### Cron Job (Ejecución Semanal)

```bash
# Editar crontab
crontab -e

# Ejecutar cada domingo a las 2 AM
0 2 * * 0 cd /path/to/fluxion-workspace/database && python3 calcular_abc_v2.py >> /var/log/abc_v2.log 2>&1
```

### Script Bash

```bash
#!/bin/bash
# ejecutar_abc_v2.sh

cd "$(dirname "$0")"

echo "=== Cálculo ABC v2 $(date) ==="

python3 calcular_abc_v2.py \
    --periodo TRIMESTRAL \
    --meses 3 \
    --verbose

echo "✓ Completado"
```

## 📖 Documentación Completa

Ver: [`docs/ABC_V2_DOCUMENTACION.md`](../docs/ABC_V2_DOCUMENTACION.md)

Incluye:
- ✅ Conceptos fundamentales del modelo ABC
- ✅ Arquitectura detallada del sistema
- ✅ Guía de instalación paso a paso
- ✅ Casos de uso con queries SQL
- ✅ Consideraciones para Venezuela (inflación, multi-moneda)
- ✅ Troubleshooting y solución de problemas
- ✅ Referencias y recursos adicionales

## 🆘 Troubleshooting Rápido

### Error: Tablas no existen

```bash
python3 calcular_abc_v2.py --crear-tablas
```

### Verificar última ejecución

```sql
SELECT MAX(fecha_calculo) as ultimo_calculo
FROM productos_abc_v2;
```

### Ver logs detallados

```bash
python3 calcular_abc_v2.py --verbose --dry-run
```

## 📊 Diferencia ABC v1 vs ABC v2

| Aspecto | ABC v1 (Velocidad) | ABC v2 (Valor) |
|---------|-------------------|----------------|
| Métrica | Bultos/día | Valor de consumo ($ × unidades) |
| Clasificación | Basada en rotación | Basada en Pareto 80/20 |
| Problema | 1000 bultos de sal = 10 de whisky | ✓ Considera valor económico |
| Uso | Control de rotación | ✓ Priorización estratégica |

**Resultado**: ABC v2 identifica correctamente los productos que realmente generan valor para el negocio.

---

**Versión**: 2.0
**Fecha**: 2025-01-10
**Sistema**: Fluxion AI - La Granja Mercado
