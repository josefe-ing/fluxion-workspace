# Sistema de Nivel Objetivo - Documentación de Implementación

## Resumen

Este documento describe la implementación del sistema de cálculo de nivel objetivo de inventario para FluxionIA, basado en clasificación ABC-XYZ y parámetros configurables por tienda.

---

## FASE 1: FUNDACIÓN ✅ COMPLETADA

**Fecha:** 2025-01-12

### Tablas Creadas

#### 1. `parametros_reposicion_tienda`

**Propósito:** Almacenar parámetros de reposición específicos por tienda y matriz ABC-XYZ.

**Estructura:**
```sql
CREATE TABLE parametros_reposicion_tienda (
    id VARCHAR PRIMARY KEY,
    tienda_id VARCHAR NOT NULL,
    matriz_abc_xyz VARCHAR(2) NOT NULL,  -- 'AX', 'AY', 'AZ', etc.
    nivel_servicio_z DECIMAL(3,2) NOT NULL,      -- Z-score estadístico
    multiplicador_demanda DECIMAL(3,2) NOT NULL,  -- Factor demanda ciclo
    multiplicador_ss DECIMAL(3,2) NOT NULL,       -- Factor stock seguridad
    incluir_stock_seguridad BOOLEAN NOT NULL,     -- Si false, SS = 0
    prioridad_reposicion INTEGER NOT NULL,        -- 1=más prioritario, 9=menos
    activo BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modificado_por VARCHAR DEFAULT 'sistema',

    UNIQUE(tienda_id, matriz_abc_xyz)
);
```

**Índices:**
- `idx_param_reposicion_tienda` - Por tienda_id
- `idx_param_reposicion_matriz` - Por matriz_abc_xyz

**Estado:** ✅ Creada e inicializada con 153 registros (17 tiendas × 9 matrices)

---

#### 2. `pedidos_sugeridos_auditoria`

**Propósito:** Registrar todos los cambios manuales realizados sobre pedidos sugeridos.

**Estructura:**
```sql
CREATE TABLE pedidos_sugeridos_auditoria (
    id VARCHAR PRIMARY KEY,
    pedido_id VARCHAR NOT NULL,
    producto_id VARCHAR NOT NULL,
    campo_modificado VARCHAR(100) NOT NULL,
    valor_anterior VARCHAR(500),
    valor_nuevo VARCHAR(500),
    tipo_cambio VARCHAR(50) NOT NULL,  -- 'override_manual', 'ajuste_sistema', etc.
    razon_cambio TEXT,
    usuario VARCHAR(100),
    rol_usuario VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    fecha_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (pedido_id) REFERENCES pedidos_sugeridos(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);
```

**Índices:**
- `idx_auditoria_pedido` - Por pedido_id
- `idx_auditoria_producto` - Por producto_id
- `idx_auditoria_usuario` - Por usuario
- `idx_auditoria_fecha` - Por fecha_cambio DESC
- `idx_auditoria_tipo` - Por tipo_cambio

**Estado:** ✅ Creada (vacía, se llenará cuando se realicen cambios manuales)

---

#### 3. Columnas Agregadas a `pedidos_sugeridos_detalle`

**Migración:** `002_add_nivel_objetivo_columns.sql`

**Columnas agregadas:**
- `matriz_abc_xyz VARCHAR(2)` - Clasificación del producto al momento del pedido
- `nivel_objetivo DECIMAL(12,4)` - Nivel objetivo calculado
- `stock_seguridad DECIMAL(12,4)` - Stock de seguridad calculado
- `demanda_ciclo DECIMAL(12,4)` - Demanda esperada durante el ciclo
- `inventario_en_transito DECIMAL(12,4)` - Cantidad en tránsito
- `metodo_calculo VARCHAR(50)` - Método usado ('NORMAL', 'FAIR_SHARE', 'OVERRIDE')
- `datos_calculo JSON` - Objeto JSON con todos los parámetros del cálculo

**Índices agregados:**
- `idx_pedido_detalle_matriz` - Por matriz_abc_xyz
- `idx_pedido_detalle_metodo` - Por metodo_calculo

**Estado:** ✅ Columnas agregadas exitosamente

---

## Parámetros por Defecto

### Configuración de la Matriz ABC-XYZ

Cada tienda tiene configuración para 9 cuadrantes:

| Matriz | Descripción | Z-Score | Mult. Demanda | Mult. SS | Inc. SS | Prioridad |
|--------|-------------|---------|---------------|----------|---------|-----------|
| **AX** | Alto valor, estable | 1.96 | 1.00 | 1.00 | ✓ | 1 |
| **AY** | Alto valor, media variabilidad | 1.96 | 1.05 | 1.25 | ✓ | 2 |
| **AZ** | Alto valor, muy variable | 1.96 | 1.10 | 1.50 | ✓ | 3 |
| **BX** | Medio valor, estable | 1.65 | 1.00 | 1.00 | ✓ | 4 |
| **BY** | Medio valor, media variabilidad | 1.65 | 1.00 | 1.10 | ✓ | 5 |
| **BZ** | Medio valor, muy variable | 1.65 | 1.05 | 1.25 | ✓ | 6 |
| **CX** | Bajo valor, estable | 1.28 | 1.00 | 1.00 | ✓ | 7 |
| **CY** | Bajo valor, media variabilidad | 1.28 | 1.00 | 0.50 | ✓ | 8 |
| **CZ** | Bajo valor, muy variable | 0.00 | 0.75 | 0.00 | ✗ | 9 |

### Interpretación de Parámetros

- **Z-Score:** Nivel de servicio estadístico
  - 1.96 = 97.5% de nivel de servicio (muy alto)
  - 1.65 = 95% de nivel de servicio (alto)
  - 1.28 = 90% de nivel de servicio (medio)
  - 0.00 = Sin stock de seguridad

- **Multiplicador Demanda:** Ajuste sobre demanda esperada
  - 1.00 = Sin ajuste
  - 1.05 = +5% de inventario
  - 1.10 = +10% de inventario
  - 0.75 = -25% de inventario (productos lentos)

- **Multiplicador SS:** Ajuste sobre stock de seguridad
  - 1.50 = +50% de protección (productos muy variables)
  - 1.00 = Sin ajuste
  - 0.50 = -50% de protección (menos inventario)

- **Incluir SS:** Si false, el stock de seguridad es 0 sin importar Z-score

---

## Scripts Disponibles

### 1. `aplicar_schema_nivel_objetivo.py`

**Uso:**
```bash
python3 aplicar_schema_nivel_objetivo.py
```

**Propósito:** Ejecuta el schema SQL y la migración de columnas.

**Salida esperada:**
- Crea tablas `parametros_reposicion_tienda` y `pedidos_sugeridos_auditoria`
- Agrega columnas a `pedidos_sugeridos_detalle`
- Muestra resumen de tablas y columnas creadas

---

### 2. `init_parametros_reposicion.py`

**Uso:**
```bash
python3 init_parametros_reposicion.py

# Para sobrescribir parámetros existentes:
python3 init_parametros_reposicion.py --sobrescribir
```

**Propósito:** Inicializa parámetros de reposición para todas las tiendas activas.

**Salida esperada:**
- Inserta 9 parámetros por cada tienda activa
- Muestra resumen de configuración
- Muestra ejemplo de configuración para una tienda

**Estado actual:** ✅ Ejecutado exitosamente
- 17 tiendas configuradas
- 153 parámetros insertados (17 × 9)

---

## Tiendas Configuradas

Las siguientes 17 tiendas tienen parámetros inicializados:

1. tienda_01: PERIFERICO
2. tienda_02: AV. BOLIVAR
3. tienda_03: MAÑONGO
4. tienda_04: SAN DIEGO
5. tienda_05: VIVIENDA
6. tienda_06: NAGUANAGUA
7. tienda_07: CENTRO
8. tienda_08: BOSQUE
9. tienda_09: GUACARA
10. tienda_10: FERIAS
11. tienda_11: FLOR AMARILLO
12. tienda_12: PARAPARAL
13. tienda_13: NAGUANAGUA III
14. tienda_14: Paramacay
15. tienda_15: ISABELICA
16. tienda_16: TOCUYITO
17. tienda_17: Ciudad Alianza

---

## Verificación

Para verificar que todo se creó correctamente:

```python
import duckdb

conn = duckdb.connect('data/fluxion_production.db')

# Verificar parámetros por tienda
result = conn.execute("""
    SELECT matriz_abc_xyz, nivel_servicio_z, multiplicador_demanda
    FROM parametros_reposicion_tienda
    WHERE tienda_id = 'tienda_01'
    ORDER BY prioridad_reposicion
""").fetchall()

# Verificar columnas nuevas
columns = conn.execute("""
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'pedidos_sugeridos_detalle'
      AND column_name IN ('matriz_abc_xyz', 'nivel_objetivo', 'stock_seguridad')
""").fetchall()

conn.close()
```

---

## Próximos Pasos (FASE 2)

1. Crear servicio Python `nivel_objetivo_service.py`:
   - `calcular_demanda_promedio_diaria()` - Desde `productos_abc_v2`
   - `calcular_inventario_en_transito()` - Desde `pedidos_sugeridos`
   - `calcular_nivel_objetivo()` - Fórmula completa

2. Crear endpoints API:
   - `POST /api/niveles-inventario/calcular` - Un producto
   - `POST /api/niveles-inventario/calcular-todos` - Toda una tienda

3. Tests unitarios con productos AX, BY, CZ

---

## Fórmulas a Implementar

### Nivel Objetivo

```
Demanda_Ciclo = Demanda_Promedio_Diaria × Periodo_Reposicion × Multiplicador_Demanda
Stock_Seguridad = Z × Desviación_Estándar_Diaria × √Periodo_Reposicion × Multiplicador_SS
Nivel_Objetivo = Demanda_Ciclo + Stock_Seguridad
```

Donde:
- **Periodo_Reposicion** = Lead_Time + Ciclo_Revisión = 1.5 + 1.0 = 2.5 días
- **Demanda_Promedio_Diaria** = `demanda_promedio_semanal / 7` desde `productos_abc_v2`
- **Desviación_Estándar_Diaria** = `desviacion_estandar_semanal / √7` desde `productos_abc_v2`
- **Z** = `nivel_servicio_z` desde `parametros_reposicion_tienda`

### Cantidad Sugerida

```
Cantidad_Sugerida = MAX(0, Nivel_Objetivo - (Stock_Actual + Inventario_En_Transito))
```

---

## Archivos Modificados/Creados

### Nuevos
- `database/schema_nivel_objetivo.sql` - Schema principal
- `database/migrations/002_add_nivel_objetivo_columns.sql` - Migración de columnas
- `database/aplicar_schema_nivel_objetivo.py` - Script de aplicación
- `database/init_parametros_reposicion.py` - Script de inicialización
- `database/README_NIVEL_OBJETIVO.md` - Este archivo

### Modificados
- Ninguno (todos los cambios son aditivos)

---

## Notas Técnicas

### DuckDB Limitaciones

- No soporta índices parciales (`CREATE INDEX ... WHERE ...`)
- Los índices con cláusula WHERE fueron comentados en el schema

### Decisiones de Diseño

1. **Parámetros por tienda:** Permite ajustar configuración según características específicas de cada ubicación
2. **Matriz ABC-XYZ separada:** Cada cuadrante tiene configuración independiente
3. **Columnas JSON:** `datos_calculo` almacena trazabilidad completa para debugging
4. **Auditoría detallada:** Incluye IP, user agent, y rol de usuario para compliance

---

## Contacto y Soporte

Para consultas sobre la implementación:
- Sistema: FluxionIA
- Fase: 1 - Fundación
- Estado: ✅ Completada
- Próxima Fase: 2 - Lógica Core de Cálculo
