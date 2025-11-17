# Implementación ABC-XYZ por Tienda

## Resumen

Sistema completo de clasificación ABC v2 (valor económico) + XYZ (variabilidad de demanda) implementado **POR TIENDA**.

Cada una de las 16 tiendas tiene su propia matriz ABC-XYZ basada en:
- **ABC v2**: Ranking local de valor de consumo (Pareto 80/20)
- **XYZ**: Coeficiente de variación calculado con datos locales de demanda

## Resultados del Cálculo

### ABC v2 por Tienda (Últimos 3 meses)

| Tienda       | Productos | A   | B   | C    | Valor Total       |
|--------------|-----------|-----|-----|------|-------------------|
| tienda_01    | 2,019     | 116 | 431 | 1472 | $2,700,881.77     |
| tienda_02    | 2,070     | 225 | 586 | 1259 | $1,095,541.19     |
| tienda_03    | 2,254     | 295 | 667 | 1292 | $1,224,608.47     |
| tienda_04    | 2,064     | 220 | 578 | 1266 | $1,495,599.19     |
| tienda_05    | 1,931     | 146 | 447 | 1338 | $1,149,717.12     |
| tienda_06    | 1,867     | 142 | 436 | 1289 | $1,183,974.11     |
| tienda_07    | 1,951     | 153 | 496 | 1302 | $1,145,015.72     |
| tienda_08    | 2,366     | 311 | 678 | 1377 | $1,717,261.16     |
| tienda_09    | 2,040     | 137 | 481 | 1422 | $1,683,213.18     |
| tienda_10    | 1,801     | 93  | 339 | 1369 | $2,198,027.06     |
| tienda_11    | 1,864     | 99  | 354 | 1411 | $1,449,597.61     |
| tienda_12    | 1,836     | 146 | 466 | 1224 | $2,056,373.41     |
| tienda_13    | 2,107     | 293 | 649 | 1165 | $1,026,325.00     |
| tienda_15    | 1,940     | 153 | 469 | 1318 | $1,746,254.53     |
| tienda_16    | 1,576     | 131 | 437 | 1008 | $310,103.07       |
| tienda_19    | 1,992     | 154 | 505 | 1333 | $1,431,360.39     |
| **TOTAL**    | **31,773**| -   | -   | -    | **$22,613,852.98**|

### XYZ por Tienda (Últimas 12 semanas)

| Tienda       | Productos | X    | Y   | Z   | CV Promedio |
|--------------|-----------|------|-----|-----|-------------|
| tienda_01    | 1,868     | 793  | 881 | 194 | 0.6200      |
| tienda_02    | 1,909     | 831  | 924 | 154 | 0.6024      |
| tienda_03    | 2,097     | 1000 | 949 | 148 | 0.5672      |
| tienda_04    | 1,894     | 963  | 797 | 134 | 0.5618      |
| tienda_05    | 1,711     | 786  | 767 | 158 | 0.5859      |
| tienda_06    | 1,701     | 783  | 782 | 136 | 0.5792      |
| tienda_07    | 1,786     | 855  | 777 | 154 | 0.5848      |
| tienda_08    | 2,207     | 1119 | 956 | 132 | 0.5520      |
| tienda_09    | 1,864     | 944  | 791 | 129 | 0.5584      |
| tienda_10    | 1,631     | 724  | 749 | 158 | 0.6084      |
| tienda_11    | 1,721     | 886  | 693 | 142 | 0.5622      |
| tienda_12    | 1,710     | 889  | 715 | 106 | 0.5469      |
| tienda_13    | 1,976     | 1027 | 799 | 150 | 0.5627      |
| tienda_15    | 1,770     | 819  | 801 | 150 | 0.5891      |
| tienda_16    | 1,260     | 774  | 389 | 97  | 0.4799      |
| tienda_19    | 1,863     | 987  | 741 | 135 | 0.5522      |
| **TOTAL**    | **28,968**| -    | -   | -   | **0.5776**  |

### Productos Críticos (AZ) por Tienda

Productos de alto valor pero con demanda errática que requieren atención especial:

| Tienda    | Productos AZ | % de Productos A |
|-----------|--------------|------------------|
| tienda_13 | 27           | 9.22%            |
| tienda_02 | 22           | 9.78%            |
| tienda_04 | 17           | 7.73%            |
| tienda_08 | 14           | 4.50%            |
| tienda_05 | 14           | 9.59%            |
| tienda_03 | 12           | 4.07%            |
| tienda_09 | 12           | 8.76%            |

## Casos de Uso Verificados

### Ejemplo 1: Producto con Clasificación Uniforme
**Producto 003289 (HUEVOS)**

Todas las tiendas: **AX** (Alto valor + Demanda estable)

| Tienda    | ABC | XYZ | Ranking | Valor Total  | CV     | Dem/Semana |
|-----------|-----|-----|---------|--------------|--------|------------|
| tienda_01 | A   | X   | 1       | $187,344.31  | 0.2475 | 6,537.60   |
| tienda_02 | A   | X   | 1       | $74,517.51   | 0.3827 | 2,829.89   |
| tienda_03 | A   | X   | 1       | $84,332.10   | 0.2564 | 3,586.38   |
| tienda_04 | A   | X   | 1       | $109,886.70  | 0.3163 | 5,256.25   |

**Interpretación**: Producto crítico en todas las tiendas con demanda predecible. Candidato ideal para stock alto y reposición automática.

### Ejemplo 2: Producto con Clasificación Variable
**Producto 003164**

| Tienda    | ABC | XYZ | Matriz | Ranking | CV     | Interpretación                         |
|-----------|-----|-----|--------|---------|--------|----------------------------------------|
| tienda_13 | A   | Z   | **AZ** | 273     | 1.5179 | 🔥 CRÍTICO - Alto valor + Errático    |
| tienda_02 | B   | Z   | BZ     | 457     | 2.2505 | Alto riesgo - Monitorear              |
| tienda_09 | B   | X   | **BX** | 519     | 0.3165 | ✓ IDEAL - Medio valor + Estable      |
| tienda_05 | C   | X   | CX     | 999     | 0.3731 | Bajo valor pero predecible            |
| tienda_16 | C   | X   | CX     | 957     | 0.1496 | Candidato a stock mínimo              |

**Interpretación**: Mismo producto tiene estrategias completamente diferentes según la tienda:
- **tienda_13**: Requiere atención especial (AZ)
- **tienda_09**: Gestión estándar (BX)
- **tienda_16**: Stock mínimo (CX)

## Arquitectura Técnica

### Base de Datos

**Tabla principal**: `productos_abc_v2`

Campos clave para per-tienda:
```sql
- ubicacion_id VARCHAR              -- Identificador de tienda
- codigo_producto VARCHAR            -- Código del producto
- clasificacion_abc_valor VARCHAR(1) -- A, B, C (ranking local)
- clasificacion_xyz VARCHAR(1)       -- X, Y, Z (CV local)
- matriz_abc_xyz VARCHAR(2)          -- Combinación (ej: AX, BZ)
- ranking_valor INTEGER              -- Posición en la tienda
- coeficiente_variacion DECIMAL      -- CV calculado local
- valor_consumo_total DECIMAL        -- Valor total en tienda
- porcentaje_valor DECIMAL           -- % del valor de la tienda
```

**Índices**:
```sql
- idx_abc_v2_ubicacion_codigo (ubicacion_id, codigo_producto)
- idx_abc_v2_clasificacion_xyz
- idx_abc_v2_matriz_abc_xyz
```

### Scripts de Cálculo

#### 1. calcular_abc_v2_por_tienda.py

Calcula clasificación ABC v2 por tienda:

```bash
python3 calcular_abc_v2_por_tienda.py --periodo TRIMESTRAL --meses 3 --verbose
```

**Lógica**:
1. Obtiene lista de 16 tiendas desde `ventas_raw`
2. Por cada tienda:
   - Calcula valor de consumo por producto (últimos 3 meses)
   - Rankea productos por valor dentro de la tienda
   - Aplica Pareto 80/20 local
   - Clasifica: A (≤80%), B (80-95%), C (>95%)
3. Inserta resultados en `productos_abc_v2` con `ubicacion_id`

#### 2. calcular_xyz_por_tienda.py

Calcula variabilidad XYZ por tienda:

```bash
python3 calcular_xyz_por_tienda.py --semanas 12 --verbose
```

**Lógica**:
1. Por cada tienda con ABC v2:
   - Agrega ventas semanales (últimas 12 semanas)
   - Calcula promedio y desviación estándar por producto
   - Calcula CV = StdDev / Mean
   - Clasifica: X (CV<0.5), Y (0.5≤CV<1.0), Z (CV≥1.0)
2. Actualiza `productos_abc_v2` agregando campos XYZ

#### 3. verificar_resultados_tienda.py

Script de verificación y análisis:

```bash
python3 verificar_resultados_tienda.py
```

Muestra:
- Clasificaciones por tienda de producto específico
- Conteo de productos AZ críticos
- Variabilidad entre tiendas

### Backend API

**Endpoint actualizado**: `/api/abc-v2/producto/{codigo_producto}`

**Parámetros**:
```
?ubicacion_id=tienda_01  (REQUERIDO para obtener datos locales)
```

**Ejemplo**:
```bash
# Producto en tienda específica
curl "http://localhost:8001/api/abc-v2/producto/003289?ubicacion_id=tienda_01"

# Respuesta
{
  "codigo_producto": "003289",
  "clasificacion_abc_valor": "A",
  "ranking_valor": 1,
  "valor_consumo_total": 187344.31,
  "porcentaje_valor": 6.912,
  "porcentaje_acumulado": 6.91
}
```

**Otros endpoints con soporte de ubicacion_id**:
- `GET /api/abc-v2/resumen?ubicacion_id=tienda_01`
- `GET /api/abc-v2/productos?ubicacion_id=tienda_01&clasificacion=A`

## Matriz ABC-XYZ: Estrategias Recomendadas

| Matriz | Descripción                    | Estrategia                                    |
|--------|--------------------------------|-----------------------------------------------|
| **AX** | Alto valor + Estable           | Stock alto, reposición automática             |
| **AY** | Alto valor + Variable          | Monitoreo semanal, stock medio                |
| **AZ** | Alto valor + Errático          | 🔥 CRÍTICO - Atención especial, alertas       |
| **BX** | Medio valor + Estable          | Stock medio, reposición programada            |
| **BY** | Medio valor + Variable         | Monitoreo quincenal                           |
| **BZ** | Medio valor + Errático         | Stock bajo, revisar demanda                   |
| **CX** | Bajo valor + Estable           | Stock mínimo                                  |
| **CY** | Bajo valor + Variable          | Stock bajo o descontinuar                     |
| **CZ** | Bajo valor + Errático          | Candidato a descontinuación                   |

## Métricas Clave

- **Total de registros**: 31,773 (productos × tiendas)
- **Con clasificación XYZ**: 28,968 (91.2%)
- **Productos críticos (AZ)**: 171 registros en total
- **Productos ideales (AX)**: 1,843 registros en total

## Variabilidad entre Tiendas

**Análisis de 5 productos con mayor variabilidad**:

| Código | Variaciones ABC | Variaciones XYZ | Matrices Únicas |
|--------|-----------------|-----------------|-----------------|
| 003164 | 3 (A, B, C)     | 3 (X, Y, Z)     | 7               |
| 000159 | 3 (A, B, C)     | 3 (X, Y, Z)     | 7               |
| 000387 | 3 (A, B, C)     | 3 (X, Y, Z)     | 7               |
| 001089 | 3 (A, B, C)     | 3 (X, Y, Z)     | 6               |
| 001594 | 3 (A, B, C)     | 3 (X, Y, Z)     | 6               |

**Conclusión**: Un mismo producto puede ser clase A en una tienda y clase C en otra, confirmando la necesidad de cálculos locales.

## Próximos Pasos

### Backend
- ✅ API actualizada con parámetro `ubicacion_id`
- ✅ Cálculos por tienda completados
- ⏳ Pendiente: Endpoints de agregación multi-tienda

### Frontend
- ⏳ Agregar selector de tienda en interfaz
- ⏳ Mostrar clasificación XYZ en tablas
- ⏳ Visualizar matriz ABC-XYZ
- ⏳ Alertas para productos AZ (críticos)

### Análisis
- ⏳ Dashboard de productos críticos (AZ) por tienda
- ⏳ Comparativa de clasificaciones entre tiendas
- ⏳ Evolución temporal de CV por producto

## Comandos Útiles

### Recalcular ABC v2 + XYZ

```bash
# Paso 1: ABC v2 (valor económico)
cd /Users/jose/Developer/fluxion-workspace/database
python3 calcular_abc_v2_por_tienda.py --periodo TRIMESTRAL --meses 3 --verbose

# Paso 2: XYZ (variabilidad)
python3 calcular_xyz_por_tienda.py --semanas 12 --verbose

# Paso 3: Verificar resultados
python3 verificar_resultados_tienda.py
```

### Consultas SQL Útiles

```sql
-- Resumen por tienda
SELECT ubicacion_id,
       COUNT(*) as productos,
       COUNT(CASE WHEN clasificacion_abc_valor = 'A' THEN 1 END) as clase_a,
       SUM(valor_consumo_total) as valor_total
FROM productos_abc_v2
GROUP BY ubicacion_id
ORDER BY ubicacion_id;

-- Productos críticos (AZ)
SELECT ubicacion_id, codigo_producto, valor_consumo_total, coeficiente_variacion
FROM productos_abc_v2
WHERE matriz_abc_xyz = 'AZ'
ORDER BY ubicacion_id, valor_consumo_total DESC;

-- Comparar producto entre tiendas
SELECT ubicacion_id, clasificacion_abc_valor, clasificacion_xyz,
       matriz_abc_xyz, ranking_valor, coeficiente_variacion
FROM productos_abc_v2
WHERE codigo_producto = '003289'
ORDER BY ubicacion_id;
```

## Referencias

- **Schema**: [database/schema_abc_xyz.sql](database/schema_abc_xyz.sql)
- **Cálculo ABC v2**: [database/calcular_abc_v2_por_tienda.py](database/calcular_abc_v2_por_tienda.py)
- **Cálculo XYZ**: [database/calcular_xyz_por_tienda.py](database/calcular_xyz_por_tienda.py)
- **Consultas**: [database/consultar_xyz.py](database/consultar_xyz.py)
- **Backend API**: [backend/routers/abc_v2_router.py](backend/routers/abc_v2_router.py)

---

**Fecha de implementación**: 2025-11-10
**Base de datos**: fluxion_production.db
**Versión**: 2.0 (Per-Store)
