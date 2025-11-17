# Plan de Implementación: Sección "Productos"

**Fecha de Creación:** 2025-11-11
**Versión:** 1.0
**Estimación Total:** 18-22 horas

---

## 📋 Tabla de Contenidos

1. [Objetivos](#objetivos)
2. [Arquitectura de la Sección](#arquitectura)
3. [Fase 1: Backend - Schema & Database](#fase-1)
4. [Fase 2: Backend - API Endpoints](#fase-2)
5. [Fase 3: Frontend Service Layer](#fase-3)
6. [Fase 4: Componentes UI Principales](#fase-4)
7. [Fase 5: Integración & Routing](#fase-5)
8. [Fase 6: Features Avanzados](#fase-6)
9. [Fase 7: Testing & Documentación](#fase-7)
10. [Resumen de Archivos](#resumen-archivos)
11. [Plan de Implementación por Sprints](#sprints)
12. [Checklist de Progreso](#checklist)

---

## 🎯 Objetivos Principales {#objetivos}

1. **Análisis ABC-XYZ**: Matriz 3×3 con filtros y drill-down por clasificación
2. **Análisis por Categoría/Subcategoría**: Distribución y performance de categorías
3. **Vista Detallada de Producto**: Inventario multi-tienda, clasificaciones, velocidad de venta
4. **Gráficos Visuales**: Charts para visualizar distribuciones (pie, bar, line)
5. **Comparación entre Tiendas**: Vista lado a lado de clasificaciones por tienda
6. **Histórico de Clasificación**: Evolución temporal de ABC-XYZ
7. **⭐ Conjuntos de Sustitutos**: Sistema de agrupación manual para productos intercambiables

---

## 🏗️ Arquitectura de la Sección {#arquitectura}

### Estructura de Rutas

```
/productos
├── /abc-xyz              # Análisis ABC-XYZ (matriz 3×3)
├── /categorias           # Análisis por Categoría
├── /subcategorias        # Análisis por Subcategoría
├── /conjuntos            # Gestión de Conjuntos Sustituibles ⭐
└── /comparacion          # Comparación entre Tiendas ⭐
```

### Stack Tecnológico

- **Backend**: FastAPI + DuckDB
- **Frontend**: React + TypeScript + Vite
- **Charts**: Recharts
- **Export**: react-csv (simple, sin complejidad por ahora)

---

## FASE 1: Backend - Schema & Database {#fase-1}

**Tiempo Estimado:** 2 horas

### 1.1 Actualizar Schema de Database

**Archivo:** `database/schema_extended.sql`

#### Agregar campos a tabla productos

```sql
-- Campos para conjuntos sustituibles
ALTER TABLE productos ADD COLUMN IF NOT EXISTS conjunto_sustituible VARCHAR(100);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_lider_conjunto BOOLEAN DEFAULT false;
```

#### Crear tabla de gestión de conjuntos

```sql
CREATE TABLE IF NOT EXISTS conjuntos_sustituibles (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,  -- ej: "azucar_blanca"
    descripcion VARCHAR(200),             -- ej: "Azúcar Blanca 1kg"
    categoria VARCHAR(50),
    tipo_conjunto VARCHAR(50),            -- 'sustituibles', 'complementarios'
    activo BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_conjuntos_nombre ON conjuntos_sustituibles(nombre);
CREATE INDEX IF NOT EXISTS idx_conjuntos_categoria ON conjuntos_sustituibles(categoria);
CREATE INDEX IF NOT EXISTS idx_productos_conjunto ON productos(conjunto_sustituible);
```

#### Crear tabla de histórico de clasificaciones ABC-XYZ

```sql
CREATE TABLE IF NOT EXISTS productos_abc_v2_historico (
    id VARCHAR PRIMARY KEY,
    codigo_producto VARCHAR(50) NOT NULL,
    ubicacion_id VARCHAR(20) NOT NULL,
    fecha_calculo DATE NOT NULL,
    clasificacion_abc_valor VARCHAR(20),
    clasificacion_xyz VARCHAR(1),
    matriz_abc_xyz VARCHAR(2),
    ranking_valor INTEGER,
    valor_consumo_total DECIMAL(18,2),
    porcentaje_valor DECIMAL(8,4),
    porcentaje_acumulado DECIMAL(8,4),
    coeficiente_variacion DECIMAL(8,4),
    demanda_promedio_semanal DECIMAL(12,4),
    UNIQUE(codigo_producto, ubicacion_id, fecha_calculo)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_historico_codigo ON productos_abc_v2_historico(codigo_producto);
CREATE INDEX IF NOT EXISTS idx_historico_ubicacion ON productos_abc_v2_historico(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_historico_fecha ON productos_abc_v2_historico(fecha_calculo);
```

### 1.2 Script de Migración

**Archivo Nuevo:** `database/init_conjuntos_sustituibles.py`

```python
"""
Script para inicializar tablas de conjuntos sustituibles
Ejecutar después de actualizar schema_extended.sql
"""

import duckdb

def init_conjuntos_sustituibles(db_path='data/fluxion_production.db'):
    """Inicializa estructura de conjuntos sustituibles"""
    conn = duckdb.connect(db_path)

    # Ejecutar SQL del schema
    with open('database/schema_extended.sql', 'r') as f:
        sql_commands = f.read()
        conn.execute(sql_commands)

    print("✅ Tablas de conjuntos sustituibles inicializadas")
    conn.close()

if __name__ == "__main__":
    init_conjuntos_sustituibles()
```

### 1.3 Script de Análisis de Conjuntos

**Archivo Nuevo:** `database/analizar_conjuntos_ax.py`

```python
"""
Script para ayudar a identificar productos candidatos a conjuntos sustituibles
Analiza productos AX y sugiere agrupaciones por:
- Categoría similar
- Descripción similar (fuzzy matching)
- Patrón de ventas correlacionado
"""

import duckdb
import pandas as pd
from difflib import SequenceMatcher

def analizar_candidatos_conjuntos(db_path='data/fluxion_production.db'):
    """
    Genera CSV con sugerencias de productos para agrupar en conjuntos
    Focus: Productos AX (alta rotación, demanda estable)
    """
    conn = duckdb.connect(db_path, read_only=True)

    # Query productos AX
    query = """
    SELECT
        p.codigo_producto,
        p.descripcion,
        p.categoria,
        p.subcategoria,
        abc.clasificacion_abc_valor,
        abc.clasificacion_xyz,
        abc.valor_consumo_total,
        abc.coeficiente_variacion
    FROM productos_abc_v2 abc
    JOIN productos p ON abc.codigo_producto = p.codigo
    WHERE abc.matriz_abc_xyz = 'AX'
    ORDER BY p.categoria, p.subcategoria, abc.valor_consumo_total DESC
    """

    df = pd.read_sql(query, conn)

    # Agrupar por categoría y buscar similitudes
    sugerencias = []

    for categoria in df['categoria'].unique():
        productos_cat = df[df['categoria'] == categoria]

        # Buscar descripciones similares
        for i, row1 in productos_cat.iterrows():
            for j, row2 in productos_cat.iterrows():
                if i >= j:
                    continue

                # Calcular similitud de descripción
                similitud = SequenceMatcher(None,
                    row1['descripcion'].lower(),
                    row2['descripcion'].lower()
                ).ratio()

                if similitud > 0.6:  # 60% similitud
                    sugerencias.append({
                        'conjunto_sugerido': f"{categoria.lower()}_{row1['subcategoria'].lower()}",
                        'producto_1': row1['codigo_producto'],
                        'descripcion_1': row1['descripcion'],
                        'producto_2': row2['codigo_producto'],
                        'descripcion_2': row2['descripcion'],
                        'similitud': round(similitud, 2),
                        'categoria': categoria
                    })

    # Exportar a CSV
    df_sugerencias = pd.DataFrame(sugerencias)
    df_sugerencias.to_csv('database/sugerencias_conjuntos_ax.csv', index=False)

    print(f"✅ Análisis completo. {len(sugerencias)} sugerencias generadas")
    print(f"📄 Ver: database/sugerencias_conjuntos_ax.csv")

    conn.close()

if __name__ == "__main__":
    analizar_candidatos_conjuntos()
```

### 1.4 Script de Snapshot Histórico

**Archivo Nuevo:** `database/snapshot_abc_xyz_historico.py`

```python
"""
Script para tomar snapshot mensual de clasificaciones ABC-XYZ
Ejecutar como cron job el día 1 de cada mes
"""

import duckdb
from datetime import datetime

def snapshot_clasificaciones(db_path='data/fluxion_production.db'):
    """Copia clasificaciones actuales a tabla histórica"""
    conn = duckdb.connect(db_path)

    fecha_snapshot = datetime.now().date()

    query = """
    INSERT INTO productos_abc_v2_historico
    SELECT
        codigo_producto || '_' || ubicacion_id || '_' || ? as id,
        codigo_producto,
        ubicacion_id,
        CAST(? AS DATE) as fecha_calculo,
        clasificacion_abc_valor,
        clasificacion_xyz,
        matriz_abc_xyz,
        ranking_valor,
        valor_consumo_total,
        porcentaje_valor,
        porcentaje_acumulado,
        coeficiente_variacion,
        demanda_promedio_semanal
    FROM productos_abc_v2
    WHERE NOT EXISTS (
        SELECT 1 FROM productos_abc_v2_historico h
        WHERE h.codigo_producto = productos_abc_v2.codigo_producto
        AND h.ubicacion_id = productos_abc_v2.ubicacion_id
        AND h.fecha_calculo = ?
    )
    """

    conn.execute(query, [fecha_snapshot, fecha_snapshot, fecha_snapshot])

    count = conn.execute("SELECT COUNT(*) FROM productos_abc_v2_historico WHERE fecha_calculo = ?",
                        [fecha_snapshot]).fetchone()[0]

    print(f"✅ Snapshot creado: {count} registros guardados para {fecha_snapshot}")

    conn.close()

if __name__ == "__main__":
    snapshot_clasificaciones()
```

---

## FASE 2: Backend - API Endpoints {#fase-2}

**Tiempo Estimado:** 3-4 horas

**Archivo a Modificar:** `backend/main.py`

### 2.1 Endpoints ABC-XYZ

#### GET /api/productos/matriz-abc-xyz

```python
@app.get("/api/productos/matriz-abc-xyz", tags=["Productos"])
async def get_matriz_abc_xyz(ubicacion_id: Optional[str] = None):
    """
    Retorna matriz 3×3 ABC-XYZ con conteos y porcentajes

    Response:
    {
        "total_productos": 3133,
        "matriz": {
            "AX": { "count": 45, "porcentaje_productos": 1.4, "porcentaje_valor": 35.2 },
            "AY": { "count": 78, "porcentaje_productos": 2.5, "porcentaje_valor": 28.1 },
            ...
        },
        "resumen_abc": {
            "A": { "count": 176, "porcentaje_productos": 5.6, "porcentaje_valor": 80.0 },
            ...
        },
        "resumen_xyz": {
            "X": { "count": 890, "porcentaje_productos": 28.4 },
            ...
        }
    }
    """
    pass
```

#### GET /api/productos/lista-por-matriz

```python
@app.get("/api/productos/lista-por-matriz", tags=["Productos"])
async def get_productos_por_matriz(
    matriz: str,
    ubicacion_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    """
    Retorna lista de productos de una clasificación específica

    Params:
        matriz: "AX", "AY", "AZ", "BX", "BY", "BZ", "CX", "CY", "CZ"
        ubicacion_id: Filtro por tienda (opcional)
        limit/offset: Paginación
    """
    pass
```

#### GET /api/productos/matriz-abc-xyz/comparacion

```python
@app.get("/api/productos/matriz-abc-xyz/comparacion", tags=["Productos"])
async def get_comparacion_matrices(ubicacion_ids: List[str] = Query(...)):
    """
    Retorna matrices ABC-XYZ para múltiples tiendas (comparación)

    Params:
        ubicacion_ids: Lista de IDs de tiendas a comparar (max 4)

    Response:
    {
        "tiendas": [
            {
                "ubicacion_id": "1",
                "nombre": "Tienda Centro",
                "matriz": { "AX": {...}, "AY": {...}, ... },
                "resumen_abc": {...}
            },
            ...
        ],
        "discrepancias": [
            {
                "codigo_producto": "001234",
                "descripcion": "...",
                "clasificaciones": { "1": "AX", "2": "BX", ... }
            }
        ]
    }
    """
    pass
```

### 2.2 Endpoints Categorías/Subcategorías

#### GET /api/productos/analisis-categorias

```python
@app.get("/api/productos/analisis-categorias", tags=["Productos"])
async def get_analisis_categorias(ubicacion_id: Optional[str] = None):
    """
    Análisis agregado por categoría

    Response: [
        {
            "categoria": "LACTEOS",
            "total_productos": 245,
            "porcentaje_productos": 7.8,
            "valor_total": 4500000,
            "porcentaje_valor": 18.9,
            "distribucion_abc": {
                "A": { "count": 12, "porcentaje": 4.9 },
                "B": { "count": 45, "porcentaje": 18.4 },
                "C": { "count": 188, "porcentaje": 76.7 }
            },
            "distribucion_xyz": {...},
            "top_5_productos": [...]
        },
        ...
    ]
    """
    pass
```

#### GET /api/productos/analisis-subcategorias

```python
@app.get("/api/productos/analisis-subcategorias", tags=["Productos"])
async def get_analisis_subcategorias(
    categoria: Optional[str] = None,
    ubicacion_id: Optional[str] = None
):
    """Similar a categorías pero por subcategoría"""
    pass
```

#### GET /api/productos/categoria/{nombre}/grafico

```python
@app.get("/api/productos/categoria/{nombre}/grafico", tags=["Productos"])
async def get_categoria_grafico(nombre: str, ubicacion_id: Optional[str] = None):
    """
    Data preparada para gráficos de una categoría específica

    Response:
    {
        "distribucion_abc": [
            { "name": "A", "value": 12, "porcentaje": 4.9 },
            { "name": "B", "value": 45, "porcentaje": 18.4 },
            { "name": "C", "value": 188, "porcentaje": 76.7 }
        ],
        "distribucion_xyz": [...],
        "top_productos_valor": [
            { "codigo": "001234", "descripcion": "...", "valor": 450000 },
            ...
        ]
    }
    """
    pass
```

### 2.3 Endpoints Producto Individual

#### GET /api/productos/{codigo}/detalle-completo

```python
@app.get("/api/productos/{codigo}/detalle-completo", tags=["Productos"])
async def get_producto_detalle_completo(codigo: str):
    """
    Vista 360° de un producto

    Response:
    {
        "producto": {
            "codigo": "001234",
            "descripcion": "LECHE ENTERA 1L",
            "categoria": "LACTEOS",
            "subcategoria": "LECHE FRESCA",
            "marca": "LA PRADERA",
            "conjunto_sustituible": "leche_entera_1l",  # si pertenece a uno
            "es_lider_conjunto": true
        },
        "clasificaciones": [
            {
                "ubicacion_id": "1",
                "ubicacion_nombre": "Tienda Centro",
                "clasificacion_abc": "A",
                "clasificacion_xyz": "X",
                "matriz": "AX",
                "ranking_valor": 12,
                "valor_consumo": 450000,
                "coeficiente_variacion": 0.35
            },
            ... # para cada tienda
        ],
        "inventarios": [
            {
                "ubicacion_id": "1",
                "ubicacion_nombre": "Tienda Centro",
                "tipo_ubicacion": "tienda",
                "cantidad_actual": 120,
                "stock_minimo": 50,
                "stock_maximo": 200,
                "dias_sin_movimiento": 2,
                "ultima_entrada": "2025-11-08"
            },
            ... # CEDI y otras tiendas
        ],
        "velocidades": [
            {
                "ubicacion_id": "1",
                "ubicacion_nombre": "Tienda Centro",
                "unidades_dia": 8.5,
                "unidades_semana": 59.5,
                "dias_inventario": 14.1,
                "tendencia": "stable"  # up, down, stable
            }
        ],
        "metricas_globales": {
            "total_inventario": 2450,
            "ubicaciones_con_stock": 14,
            "ubicaciones_sin_stock": 2,
            "valor_inventario_total": 123000,
            "promedio_ventas_diarias": 45.2
        }
    }
    """
    pass
```

#### GET /api/productos/{codigo}/historico-clasificacion

```python
@app.get("/api/productos/{codigo}/historico-clasificacion", tags=["Productos"])
async def get_producto_historico_clasificacion(
    codigo: str,
    ubicacion_id: Optional[str] = None,
    meses: int = 6
):
    """
    Serie temporal de clasificación ABC-XYZ

    Response: [
        {
            "fecha": "2025-06-01",
            "clasificacion_abc": "A",
            "clasificacion_xyz": "X",
            "matriz": "AX",
            "ranking_valor": 12,
            "valor_consumo": 450000
        },
        ... # últimos N meses
    ]
    """
    pass
```

### 2.4 Endpoints Conjuntos Sustituibles

#### GET /api/conjuntos-sustituibles

```python
@app.get("/api/conjuntos-sustituibles", tags=["Conjuntos"])
async def get_conjuntos_sustituibles(activo: bool = True):
    """
    Lista de todos los conjuntos configurados

    Response: [
        {
            "id": "uuid",
            "nombre": "azucar_blanca",
            "descripcion": "Azúcar Blanca 1kg",
            "categoria": "ABARROTES",
            "tipo_conjunto": "sustituibles",
            "num_productos": 5,
            "activo": true
        },
        ...
    ]
    """
    pass
```

#### GET /api/conjuntos-sustituibles/{id}

```python
@app.get("/api/conjuntos-sustituibles/{id}", tags=["Conjuntos"])
async def get_conjunto_detalle(id: str):
    """
    Detalle de conjunto con todos sus productos miembros

    Response:
    {
        "id": "uuid",
        "nombre": "azucar_blanca",
        "descripcion": "Azúcar Blanca 1kg",
        "categoria": "ABARROTES",
        "productos": [
            {
                "codigo_producto": "001234",
                "descripcion": "Azúcar Blanca Marca A 1kg",
                "es_lider": true,
                "clasificacion_abc": "A",
                "clasificacion_xyz": "X"
            },
            ...
        ]
    }
    """
    pass
```

#### POST /api/conjuntos-sustituibles

```python
@app.post("/api/conjuntos-sustituibles", tags=["Conjuntos"])
async def create_conjunto_sustituible(data: ConjuntoCreate):
    """
    Crea nuevo conjunto y asigna productos

    Body:
    {
        "nombre": "azucar_blanca",
        "descripcion": "Azúcar Blanca 1kg",
        "categoria": "ABARROTES",
        "tipo_conjunto": "sustituibles",
        "productos": ["001234", "001235", "001236"]
    }
    """
    pass
```

#### PUT /api/conjuntos-sustituibles/{id}/productos

```python
@app.put("/api/conjuntos-sustituibles/{id}/productos", tags=["Conjuntos"])
async def update_conjunto_productos(id: str, changes: ProductosChange):
    """
    Agrega o remueve productos de un conjunto

    Body:
    {
        "agregar": ["001237", "001238"],
        "remover": ["001236"]
    }
    """
    pass
```

#### GET /api/conjuntos-sustituibles/{id}/analisis

```python
@app.get("/api/conjuntos-sustituibles/{id}/analisis", tags=["Conjuntos"])
async def get_conjunto_analisis(
    id: str,
    ubicacion_id: Optional[str] = None,
    semanas: int = 12
):
    """
    Análisis detallado del conjunto

    Response:
    {
        "demanda_total_semanal": 1250,
        "valor_total": 2450000,
        "productos_share": [
            {
                "codigo_producto": "001234",
                "descripcion": "Azúcar Marca A",
                "unidades_vendidas": 625,
                "share_porcentaje": 50.0,
                "valor_consumo": 1225000
            },
            ...
        ],
        "estabilidad_shares": {
            "coeficiente_variacion": 0.15,
            "clasificacion": "ALTA",  # ALTA/MEDIA/BAJA
            "mensaje": "Los shares son muy estables en el tiempo"
        },
        "correlacion_ventas": [
            {
                "producto_1": "001234",
                "producto_2": "001235",
                "correlacion": 0.85,
                "interpretacion": "Altamente correlacionados"
            }
        ],
        "historico_shares": [
            {
                "semana": "2025-W01",
                "shares": {
                    "001234": 50.2,
                    "001235": 30.1,
                    "001236": 19.7
                }
            },
            ...
        ]
    }
    """
    pass
```

#### GET /api/productos/{codigo}/conjunto

```python
@app.get("/api/productos/{codigo}/conjunto", tags=["Conjuntos"])
async def get_producto_conjunto(codigo: str):
    """
    Info del conjunto al que pertenece un producto

    Response:
    {
        "pertenece_a_conjunto": true,
        "conjunto": {
            "id": "uuid",
            "nombre": "azucar_blanca",
            "descripcion": "Azúcar Blanca 1kg",
            "num_productos": 5,
            "es_lider": true
        },
        "otros_miembros": [
            { "codigo": "001235", "descripcion": "...", "share": 30.0 },
            ...
        ]
    }
    """
    pass
```

### 2.5 Endpoints para Gráficos

#### GET /api/productos/graficos/distribucion-abc-xyz

```python
@app.get("/api/productos/graficos/distribucion-abc-xyz", tags=["Productos"])
async def get_grafico_distribucion_abc_xyz(ubicacion_id: Optional[str] = None):
    """
    Data preparada para pie charts de distribución

    Response:
    {
        "abc": [
            { "name": "A", "value": 176, "porcentaje": 5.6, "color": "#ef4444" },
            { "name": "B", "value": 602, "porcentaje": 19.2, "color": "#f59e0b" },
            { "name": "C", "value": 2340, "porcentaje": 74.7, "color": "#6b7280" }
        ],
        "xyz": [
            { "name": "X", "value": 890, "porcentaje": 28.4, "color": "#10b981" },
            { "name": "Y", "value": 1456, "porcentaje": 46.5, "color": "#3b82f6" },
            { "name": "Z", "value": 787, "porcentaje": 25.1, "color": "#ef4444" }
        ]
    }
    """
    pass
```

#### GET /api/productos/graficos/top-categorias

```python
@app.get("/api/productos/graficos/top-categorias", tags=["Productos"])
async def get_grafico_top_categorias(
    ubicacion_id: Optional[str] = None,
    top_n: int = 10
):
    """
    Data para bar chart de top categorías por valor

    Response: [
        {
            "categoria": "LACTEOS",
            "valor_total": 4500000,
            "porcentaje_valor": 18.9,
            "num_productos": 245
        },
        ...
    ]
    """
    pass
```

---

## FASE 3: Frontend Service Layer {#fase-3}

**Tiempo Estimado:** 1.5 horas

**Archivo Nuevo:** `frontend/src/services/productosService.ts`

```typescript
import http from './http';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface MatrizCell {
  count: number;
  porcentaje_productos: number;
  porcentaje_valor: number;
}

export interface MatrizABCXYZ {
  total_productos: number;
  matriz: Record<string, MatrizCell>;
  resumen_abc: Record<string, MatrizCell>;
  resumen_xyz: Record<string, MatrizCell>;
}

export interface ProductoEnriquecido {
  codigo_producto: string;
  descripcion: string;
  categoria: string;
  subcategoria?: string;
  clasificacion_abc: string;
  clasificacion_xyz: string;
  matriz: string;
  valor_consumo_total: number;
  porcentaje_valor: number;
  ranking_valor: number;
  coeficiente_variacion: number;
  stock_actual?: number;
  conjunto_sustituible?: string;
}

export interface ClasificacionPorTienda {
  ubicacion_id: string;
  ubicacion_nombre: string;
  clasificacion_abc: string;
  clasificacion_xyz: string;
  matriz: string;
  ranking_valor: number;
  valor_consumo: number;
  coeficiente_variacion: number;
}

export interface InventarioPorUbicacion {
  ubicacion_id: string;
  ubicacion_nombre: string;
  tipo_ubicacion: string;
  cantidad_actual: number;
  stock_minimo?: number;
  stock_maximo?: number;
  dias_sin_movimiento?: number;
  ultima_entrada?: string;
}

export interface VelocidadPorUbicacion {
  ubicacion_id: string;
  ubicacion_nombre: string;
  unidades_dia: number;
  unidades_semana: number;
  dias_inventario: number;
  tendencia: 'up' | 'down' | 'stable';
}

export interface ProductoDetalleCompleto {
  producto: {
    codigo: string;
    descripcion: string;
    categoria: string;
    subcategoria?: string;
    marca?: string;
    conjunto_sustituible?: string;
    es_lider_conjunto?: boolean;
  };
  clasificaciones: ClasificacionPorTienda[];
  inventarios: InventarioPorUbicacion[];
  velocidades: VelocidadPorUbicacion[];
  metricas_globales: {
    total_inventario: number;
    ubicaciones_con_stock: number;
    ubicaciones_sin_stock: number;
    valor_inventario_total: number;
    promedio_ventas_diarias: number;
  };
}

export interface ClasificacionHistorico {
  fecha: string;
  clasificacion_abc: string;
  clasificacion_xyz: string;
  matriz: string;
  ranking_valor: number;
  valor_consumo: number;
}

export interface ConjuntoSustituible {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  tipo_conjunto: string;
  num_productos?: number;
  activo: boolean;
}

export interface ConjuntoDetalle extends ConjuntoSustituible {
  productos: {
    codigo_producto: string;
    descripcion: string;
    es_lider: boolean;
    clasificacion_abc?: string;
    clasificacion_xyz?: string;
  }[];
}

export interface ConjuntoAnalisis {
  demanda_total_semanal: number;
  valor_total: number;
  productos_share: {
    codigo_producto: string;
    descripcion: string;
    unidades_vendidas: number;
    share_porcentaje: number;
    valor_consumo: number;
  }[];
  estabilidad_shares: {
    coeficiente_variacion: number;
    clasificacion: 'ALTA' | 'MEDIA' | 'BAJA';
    mensaje: string;
  };
  historico_shares: any[];
}

export interface AnalisisCategoria {
  categoria: string;
  total_productos: number;
  porcentaje_productos: number;
  valor_total: number;
  porcentaje_valor: number;
  distribucion_abc: Record<string, { count: number; porcentaje: number }>;
  distribucion_xyz: Record<string, { count: number; porcentaje: number }>;
  top_5_productos: ProductoEnriquecido[];
}

// ============================================================================
// API FUNCTIONS - ABC-XYZ
// ============================================================================

export async function getMatrizABCXYZ(ubicacionId?: string): Promise<MatrizABCXYZ> {
  const params = ubicacionId ? { ubicacion_id: ubicacionId } : {};
  const response = await http.get('/api/productos/matriz-abc-xyz', { params });
  return response.data;
}

export async function getProductosPorMatriz(
  matriz: string,
  ubicacionId?: string,
  limit: number = 100,
  offset: number = 0
): Promise<ProductoEnriquecido[]> {
  const response = await http.get('/api/productos/lista-por-matriz', {
    params: { matriz, ubicacion_id: ubicacionId, limit, offset }
  });
  return response.data;
}

export async function getComparacionMatrices(
  ubicacionIds: string[]
): Promise<any> {
  const response = await http.get('/api/productos/matriz-abc-xyz/comparacion', {
    params: { ubicacion_ids: ubicacionIds }
  });
  return response.data;
}

// ============================================================================
// API FUNCTIONS - CATEGORÍAS
// ============================================================================

export async function getAnalisisCategorias(
  ubicacionId?: string
): Promise<AnalisisCategoria[]> {
  const params = ubicacionId ? { ubicacion_id: ubicacionId } : {};
  const response = await http.get('/api/productos/analisis-categorias', { params });
  return response.data;
}

export async function getAnalisisSubcategorias(
  categoria?: string,
  ubicacionId?: string
): Promise<any[]> {
  const params: any = {};
  if (categoria) params.categoria = categoria;
  if (ubicacionId) params.ubicacion_id = ubicacionId;

  const response = await http.get('/api/productos/analisis-subcategorias', { params });
  return response.data;
}

export async function getCategoriaGrafico(
  categoria: string,
  ubicacionId?: string
): Promise<any> {
  const params = ubicacionId ? { ubicacion_id: ubicacionId } : {};
  const response = await http.get(`/api/productos/categoria/${categoria}/grafico`, { params });
  return response.data;
}

// ============================================================================
// API FUNCTIONS - PRODUCTO INDIVIDUAL
// ============================================================================

export async function getProductoDetalleCompleto(
  codigo: string
): Promise<ProductoDetalleCompleto> {
  const response = await http.get(`/api/productos/${codigo}/detalle-completo`);
  return response.data;
}

export async function getProductoHistoricoClasificacion(
  codigo: string,
  ubicacionId?: string,
  meses: number = 6
): Promise<ClasificacionHistorico[]> {
  const params: any = { meses };
  if (ubicacionId) params.ubicacion_id = ubicacionId;

  const response = await http.get(`/api/productos/${codigo}/historico-clasificacion`, { params });
  return response.data;
}

export async function getProductoConjunto(codigo: string): Promise<any> {
  const response = await http.get(`/api/productos/${codigo}/conjunto`);
  return response.data;
}

// ============================================================================
// API FUNCTIONS - CONJUNTOS SUSTITUIBLES
// ============================================================================

export async function getConjuntosSustituibles(
  activo: boolean = true
): Promise<ConjuntoSustituible[]> {
  const response = await http.get('/api/conjuntos-sustituibles', {
    params: { activo }
  });
  return response.data;
}

export async function getConjuntoDetalle(id: string): Promise<ConjuntoDetalle> {
  const response = await http.get(`/api/conjuntos-sustituibles/${id}`);
  return response.data;
}

export async function createConjunto(data: {
  nombre: string;
  descripcion: string;
  categoria: string;
  tipo_conjunto: string;
  productos: string[];
}): Promise<ConjuntoSustituible> {
  const response = await http.post('/api/conjuntos-sustituibles', data);
  return response.data;
}

export async function updateConjuntoProductos(
  id: string,
  changes: { agregar?: string[]; remover?: string[] }
): Promise<void> {
  await http.put(`/api/conjuntos-sustituibles/${id}/productos`, changes);
}

export async function getConjuntoAnalisis(
  id: string,
  ubicacionId?: string,
  semanas: number = 12
): Promise<ConjuntoAnalisis> {
  const params: any = { semanas };
  if (ubicacionId) params.ubicacion_id = ubicacionId;

  const response = await http.get(`/api/conjuntos-sustituibles/${id}/analisis`, { params });
  return response.data;
}

// ============================================================================
// API FUNCTIONS - GRÁFICOS
// ============================================================================

export async function getGraficoDistribucionABCXYZ(ubicacionId?: string): Promise<any> {
  const params = ubicacionId ? { ubicacion_id: ubicacionId } : {};
  const response = await http.get('/api/productos/graficos/distribucion-abc-xyz', { params });
  return response.data;
}

export async function getGraficoTopCategorias(
  ubicacionId?: string,
  topN: number = 10
): Promise<any> {
  const params: any = { top_n: topN };
  if (ubicacionId) params.ubicacion_id = ubicacionId;

  const response = await http.get('/api/productos/graficos/top-categorias', { params });
  return response.data;
}

// ============================================================================
// HELPER FUNCTIONS (Reutilizar de abcV2Service)
// ============================================================================

export function getColorMatriz(matriz: string): string {
  const colors: Record<string, string> = {
    'AX': 'bg-green-100 text-green-800 border-green-300',
    'AY': 'bg-yellow-100 text-yellow-800 border-yellow-300',
    'AZ': 'bg-red-100 text-red-800 border-red-300',
    'BX': 'bg-blue-100 text-blue-800 border-blue-300',
    'BY': 'bg-gray-100 text-gray-800 border-gray-300',
    'BZ': 'bg-orange-100 text-orange-800 border-orange-300',
    'CX': 'bg-gray-50 text-gray-600 border-gray-200',
    'CY': 'bg-gray-50 text-gray-600 border-gray-200',
    'CZ': 'bg-gray-50 text-gray-600 border-gray-200',
  };
  return colors[matriz] || 'bg-gray-100 text-gray-800';
}

export function getDescripcionMatriz(matriz: string): string {
  const descripciones: Record<string, string> = {
    'AX': 'Alta rotación, demanda estable - IDEAL',
    'AY': 'Alta rotación, demanda variable - MONITOREAR',
    'AZ': 'Alta rotación, demanda errática - RIESGO CRÍTICO',
    'BX': 'Rotación media, demanda estable',
    'BY': 'Rotación media, demanda variable',
    'BZ': 'Rotación media, demanda errática',
    'CX': 'Baja rotación, demanda estable',
    'CY': 'Baja rotación, demanda variable',
    'CZ': 'Baja rotación, demanda errática - CANDIDATO A ELIMINAR',
  };
  return descripciones[matriz] || 'Clasificación desconocida';
}

export function getEstrategiaMatriz(matriz: string): string {
  const estrategias: Record<string, string> = {
    'AX': 'Mantener stock óptimo. Estos productos son predecibles y valiosos.',
    'AY': 'Incrementar frecuencia de revisión. Ajustar stock según temporalidad.',
    'AZ': 'Stock de seguridad alto. Revisar proveedores alternativos. Considerar conjuntos sustituibles.',
    'BX': 'Revisar periódicamente. Considerar optimización de costos.',
    'BY': 'Análisis de patrones estacionales. Ajustar según comportamiento.',
    'BZ': 'Evaluar necesidad. Posible candidato a descontinuar o reducir SKUs.',
    'CX': 'Evaluar si es necesario mantener. Considerar pedido por demanda.',
    'CY': 'Bajo valor estratégico. Revisar rentabilidad.',
    'CZ': 'Candidato a eliminación. Liberar espacio y capital.',
  };
  return estrategias[matriz] || 'Sin estrategia definida';
}

export function getIconoMatriz(matriz: string): string {
  const iconos: Record<string, string> = {
    'AX': '✅',
    'AY': '⚠️',
    'AZ': '🚨',
    'BX': '🔵',
    'BY': '⚪',
    'BZ': '🟠',
    'CX': '⚪',
    'CY': '⚪',
    'CZ': '⚡',
  };
  return iconos[matriz] || '•';
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-VE').format(num);
}

export function formatCurrency(num: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD'
  }).format(num);
}

export function formatPercentage(num: number, decimals: number = 1): string {
  return `${num.toFixed(decimals)}%`;
}
```

---

## FASE 4: Componentes UI Principales {#fase-4}

**Tiempo Estimado:** 6-8 horas

### 4.1 Layout Principal

**Archivo Nuevo:** `frontend/src/components/productos/ProductosLayout.tsx`

```tsx
import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';

const ProductosLayout: React.FC = () => {
  const location = useLocation();

  const tabs = [
    { path: '/productos/abc-xyz', label: 'ABC-XYZ', icon: '📊' },
    { path: '/productos/categorias', label: 'Categorías', icon: '📁' },
    { path: '/productos/subcategorias', label: 'Subcategorías', icon: '📂' },
    { path: '/productos/conjuntos', label: 'Conjuntos', icon: '🔗' },
    { path: '/productos/comparacion', label: 'Comparación', icon: '⚖️' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900">Productos</h1>
            <p className="mt-1 text-sm text-gray-500">
              Análisis integral de productos con clasificación ABC-XYZ
            </p>
          </div>

          {/* Tabs Navigation */}
          <nav className="flex space-x-8 -mb-px">
            {tabs.map((tab) => {
              const isActive = location.pathname.startsWith(tab.path);
              return (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  className={`
                    flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                    ${
                      isActive
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </div>
    </div>
  );
};

export default ProductosLayout;
```

### 4.2 Vista ABC-XYZ Principal

**Archivo Nuevo:** `frontend/src/components/productos/ABCXYZAnalysis.tsx`

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { getMatrizABCXYZ, getProductosPorMatriz, getGraficoDistribucionABCXYZ } from '../../services/productosService';
import MatrizABCXYZ from './MatrizABCXYZ';
import ABCDistributionChart from './charts/ABCDistributionChart';
import XYZDistributionChart from './charts/XYZDistributionChart';
import ProductoDetalleModal from './ProductoDetalleModal';

const ABCXYZAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [ubicacionId, setUbicacionId] = useState<string>('');
  const [matrizData, setMatrizData] = useState<any>(null);
  const [selectedMatriz, setSelectedMatriz] = useState<string>('');
  const [productos, setProductos] = useState<any[]>([]);
  const [selectedProducto, setSelectedProducto] = useState<any>(null);
  const [chartData, setChartData] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [matriz, grafico] = await Promise.all([
        getMatrizABCXYZ(ubicacionId || undefined),
        getGraficoDistribucionABCXYZ(ubicacionId || undefined)
      ]);
      setMatrizData(matriz);
      setChartData(grafico);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [ubicacionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleMatrizClick = async (matriz: string) => {
    setSelectedMatriz(matriz);
    try {
      const data = await getProductosPorMatriz(matriz, ubicacionId || undefined);
      setProductos(data);
    } catch (error) {
      console.error('Error loading productos:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtro Tienda */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">
            Filtrar por tienda:
          </label>
          <select
            value={ubicacionId}
            onChange={(e) => setUbicacionId(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="">Todas las tiendas</option>
            {/* TODO: Cargar ubicaciones dinámicamente */}
          </select>
          <button
            onClick={loadData}
            className="ml-auto text-sm text-blue-600 hover:text-blue-800 flex items-center gap-2"
          >
            🔄 Refrescar
          </button>
        </div>
      </div>

      {/* Resumen ABC (Tabla Pareto) */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Resumen ABC (Pareto)</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clase</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Productos</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">% Productos</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">% Valor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {matrizData && Object.entries(matrizData.resumen_abc).map(([clase, data]: [string, any]) => (
              <tr key={clase}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    clase === 'A' ? 'bg-red-100 text-red-800' :
                    clase === 'B' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {clase}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {data.count}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {data.porcentaje_productos.toFixed(1)}%
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ${(data.count * 100000).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {data.porcentaje_valor.toFixed(1)}%
                  {clase === 'A' && data.porcentaje_valor >= 80 && ' ✓'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {/* Icon or action */}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-6 py-4 bg-blue-50 border-t border-blue-100">
          <p className="text-sm text-blue-800 flex items-center gap-2">
            💡 Solo el {matrizData?.resumen_abc.A.porcentaje_productos.toFixed(1)}% de tus productos generan el {matrizData?.resumen_abc.A.porcentaje_valor.toFixed(1)}% del valor
          </p>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribución ABC</h3>
          {chartData && <ABCDistributionChart data={chartData.abc} />}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribución XYZ</h3>
          {chartData && <XYZDistributionChart data={chartData.xyz} />}
        </div>
      </div>

      {/* Matriz ABC-XYZ */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Matriz ABC × XYZ</h2>
        <MatrizABCXYZ
          data={matrizData?.matriz}
          onCellClick={handleMatrizClick}
          selectedCell={selectedMatriz}
        />
      </div>

      {/* Lista de Productos Filtrados */}
      {selectedMatriz && productos.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Productos en clasificación: {selectedMatriz}
            </h3>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ABC</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">XYZ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ranking</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {productos.map((producto) => (
                <tr
                  key={producto.codigo_producto}
                  onClick={() => setSelectedProducto(producto)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {producto.codigo_producto}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {producto.descripcion}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {producto.categoria}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      producto.clasificacion_abc === 'A' ? 'bg-red-100 text-red-800' :
                      producto.clasificacion_abc === 'B' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {producto.clasificacion_abc}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      producto.clasificacion_xyz === 'X' ? 'bg-green-100 text-green-800' :
                      producto.clasificacion_xyz === 'Y' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {producto.clasificacion_xyz}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    #{producto.ranking_valor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Producto Detalle */}
      {selectedProducto && (
        <ProductoDetalleModal
          isOpen={!!selectedProducto}
          onClose={() => setSelectedProducto(null)}
          codigo={selectedProducto.codigo_producto}
        />
      )}
    </div>
  );
};

export default ABCXYZAnalysis;
```

### 4.3 Componente Matriz ABC-XYZ

**Archivo Nuevo:** `frontend/src/components/productos/MatrizABCXYZ.tsx`

```tsx
import React from 'react';
import { getIconoMatriz, formatNumber, formatPercentage } from '../../services/productosService';

interface MatrizABCXYZProps {
  data: Record<string, any>;
  onCellClick: (matriz: string) => void;
  selectedCell?: string;
}

const MatrizABCXYZ: React.FC<MatrizABCXYZProps> = ({ data, onCellClick, selectedCell }) => {
  const abc = ['A', 'B', 'C'];
  const xyz = ['X', 'Y', 'Z'];

  const getCellColor = (matriz: string) => {
    const colors: Record<string, string> = {
      'AX': 'bg-green-50 hover:bg-green-100 border-green-200',
      'AY': 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
      'AZ': 'bg-red-50 hover:bg-red-100 border-red-200',
      'BX': 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      'BY': 'bg-gray-50 hover:bg-gray-100 border-gray-200',
      'BZ': 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      'CX': 'bg-gray-50 hover:bg-gray-100 border-gray-200',
      'CY': 'bg-gray-50 hover:bg-gray-100 border-gray-200',
      'CZ': 'bg-gray-50 hover:bg-gray-100 border-gray-200',
    };
    return colors[matriz] || 'bg-gray-50 hover:bg-gray-100 border-gray-200';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-300 bg-gray-100 p-4"></th>
            <th className="border border-gray-300 bg-green-100 p-4 text-center">
              <div className="font-bold text-gray-900">X (Estable)</div>
              <div className="text-xs text-gray-600 mt-1">CV &lt; 0.5</div>
            </th>
            <th className="border border-gray-300 bg-blue-100 p-4 text-center">
              <div className="font-bold text-gray-900">Y (Variable)</div>
              <div className="text-xs text-gray-600 mt-1">0.5 ≤ CV &lt; 1.0</div>
            </th>
            <th className="border border-gray-300 bg-red-100 p-4 text-center">
              <div className="font-bold text-gray-900">Z (Errático)</div>
              <div className="text-xs text-gray-600 mt-1">CV ≥ 1.0</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {abc.map((a) => (
            <tr key={a}>
              <td className="border border-gray-300 bg-gray-100 p-4 text-center font-bold">
                {a}
              </td>
              {xyz.map((x) => {
                const matriz = `${a}${x}`;
                const cellData = data?.[matriz] || { count: 0, porcentaje_productos: 0, porcentaje_valor: 0 };
                const isSelected = selectedCell === matriz;

                return (
                  <td
                    key={matriz}
                    onClick={() => onCellClick(matriz)}
                    className={`
                      border border-gray-300 p-4 cursor-pointer transition-all
                      ${getCellColor(matriz)}
                      ${isSelected ? 'ring-2 ring-blue-500 ring-inset' : ''}
                    `}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-1">{getIconoMatriz(matriz)}</div>
                      <div className="font-bold text-lg text-gray-900">
                        {matriz}: {formatNumber(cellData.count)}
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatPercentage(cellData.porcentaje_productos)} productos
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatPercentage(cellData.porcentaje_valor)} valor
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Leyenda */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✅</span>
          <span className="text-gray-700">IDEAL: Mantener stock óptimo</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚠️</span>
          <span className="text-gray-700">MONITOREAR: Revisar frecuentemente</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🚨</span>
          <span className="text-gray-700">CRÍTICO: Alto riesgo</span>
        </div>
      </div>
    </div>
  );
};

export default MatrizABCXYZ;
```

### 4.4 Modal Producto Detalle

**Archivo Nuevo:** `frontend/src/components/productos/ProductoDetalleModal.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { getProductoDetalleCompleto, getProductoHistoricoClasificacion } from '../../services/productosService';
import ClasificacionHistoricoChart from './charts/ClasificacionHistoricoChart';

interface ProductoDetalleModalProps {
  isOpen: boolean;
  onClose: () => void;
  codigo: string;
}

const ProductoDetalleModal: React.FC<ProductoDetalleModalProps> = ({ isOpen, onClose, codigo }) => {
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<any>(null);
  const [historico, setHistorico] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && codigo) {
      loadData();
    }
  }, [isOpen, codigo]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [detalleData, historicoData] = await Promise.all([
        getProductoDetalleCompleto(codigo),
        getProductoHistoricoClasificacion(codigo)
      ]);
      setDetalle(detalleData);
      setHistorico(historicoData);
    } catch (error) {
      console.error('Error loading producto detalle:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {detalle?.producto.codigo} - {detalle?.producto.descripcion}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {detalle?.producto.categoria} • {detalle?.producto.subcategoria}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Métricas Globales */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-blue-600 font-medium">Total Stock</div>
                <div className="text-2xl font-bold text-blue-900 mt-1">
                  {detalle?.metricas_globales.total_inventario}
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm text-green-600 font-medium">Con Stock</div>
                <div className="text-2xl font-bold text-green-900 mt-1">
                  {detalle?.metricas_globales.ubicaciones_con_stock}/16
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-sm text-red-600 font-medium">Sin Stock</div>
                <div className="text-2xl font-bold text-red-900 mt-1">
                  {detalle?.metricas_globales.ubicaciones_sin_stock}/16
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 font-medium">Valor Inventario</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  ${detalle?.metricas_globales.valor_inventario_total.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Histórico de Clasificación */}
            {historico.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Evolución de Clasificación (últimos 6 meses)
                </h3>
                <ClasificacionHistoricoChart data={historico} />
              </div>
            )}

            {/* Tabla por Tienda */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Inventario y Clasificación por Tienda
                </h3>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tienda</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ABC</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">XYZ</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vel/día</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ranking</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Días Inv</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {detalle?.inventarios.map((inv: any) => {
                    const clasif = detalle.clasificaciones.find((c: any) => c.ubicacion_id === inv.ubicacion_id);
                    const vel = detalle.velocidades.find((v: any) => v.ubicacion_id === inv.ubicacion_id);

                    return (
                      <tr key={inv.ubicacion_id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {inv.ubicacion_nombre}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {clasif && (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              clasif.clasificacion_abc === 'A' ? 'bg-red-100 text-red-800' :
                              clasif.clasificacion_abc === 'B' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {clasif.clasificacion_abc}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {clasif && (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              clasif.clasificacion_xyz === 'X' ? 'bg-green-100 text-green-800' :
                              clasif.clasificacion_xyz === 'Y' ? 'bg-blue-100 text-blue-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {clasif.clasificacion_xyz}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {inv.cantidad_actual}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {vel ? vel.unidades_dia.toFixed(1) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {clasif ? `#${clasif.ranking_valor}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {vel ? `${vel.dias_inventario.toFixed(0)}d` : '-'}
                          {vel && vel.dias_inventario > 30 && ' 🚨'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductoDetalleModal;
```

### 4.5-4.8 Otros Componentes

Por brevedad, aquí están los nombres y propósitos de los componentes restantes. El código sigue patrones similares:

**4.5 Vista Categorías**
- `frontend/src/components/productos/CategoriasAnalysis.tsx`

**4.6 Vista Subcategorías**
- `frontend/src/components/productos/SubcategoriasAnalysis.tsx`

**4.7 Vista Comparación Tiendas**
- `frontend/src/components/productos/ComparacionTiendasView.tsx`

**4.8 Gestión de Conjuntos**
- `frontend/src/components/productos/ConjuntosSustituiblesView.tsx`
- `frontend/src/components/productos/ConjuntoDetallePanel.tsx`
- `frontend/src/components/productos/CrearConjuntoModal.tsx`

**4.9 Componentes de Gráficos (usando Recharts)**
- `frontend/src/components/productos/charts/ABCDistributionChart.tsx`
- `frontend/src/components/productos/charts/XYZDistributionChart.tsx`
- `frontend/src/components/productos/charts/TopCategoriasChart.tsx`
- `frontend/src/components/productos/charts/ClasificacionHistoricoChart.tsx`
- `frontend/src/components/productos/charts/ConjuntoSharesChart.tsx`

---

## FASE 5: Integración & Routing {#fase-5}

**Tiempo Estimado:** 1 hora

### 5.1 Actualizar App.tsx

**Archivo a Modificar:** `frontend/src/App.tsx`

```tsx
// Agregar import
import ProductosLayout from './components/productos/ProductosLayout';
import ABCXYZAnalysis from './components/productos/ABCXYZAnalysis';
import CategoriasAnalysis from './components/productos/CategoriasAnalysis';
import SubcategoriasAnalysis from './components/productos/SubcategoriasAnalysis';
import ConjuntosSustituiblesView from './components/productos/ConjuntosSustituiblesView';
import ComparacionTiendasView from './components/productos/ComparacionTiendasView';

// Dentro de <Routes>
<Route path="productos" element={<ProductosLayout />}>
  <Route index element={<Navigate to="abc-xyz" replace />} />
  <Route path="abc-xyz" element={<ABCXYZAnalysis />} />
  <Route path="categorias" element={<CategoriasAnalysis />} />
  <Route path="subcategorias" element={<SubcategoriasAnalysis />} />
  <Route path="conjuntos" element={<ConjuntosSustituiblesView />} />
  <Route path="comparacion" element={<ComparacionTiendasView />} />
</Route>
```

### 5.2 Actualizar Header.tsx

**Archivo a Modificar:** `frontend/src/components/layout/Header.tsx`

```tsx
const navItems = [
  { path: '/pedidos-sugeridos', label: 'Pedidos' },
  { path: '/inventarios', label: 'Inventarios' },
  { path: '/ventas', label: 'Ventas' },
  { path: '/productos', label: 'Productos' },  // ⭐ AGREGAR ESTA LÍNEA
];
```

### 5.3 Instalar Dependencias

```bash
cd frontend
npm install recharts react-csv
```

---

## FASE 6: Features Avanzados {#fase-6}

**Tiempo Estimado:** 3-4 horas

### 6.1 Job de Snapshot Histórico

**Configurar cron job** (Linux/Mac) o **Task Scheduler** (Windows):

```bash
# Editar crontab
crontab -e

# Agregar línea (ejecutar el día 1 de cada mes a las 2 AM)
0 2 1 * * cd /path/to/fluxion-workspace && python3 database/snapshot_abc_xyz_historico.py
```

### 6.2 Script de Análisis de Conjuntos

Ya creado en Fase 1: `database/analizar_conjuntos_ax.py`

### 6.3 Validaciones Backend

Agregar validaciones en endpoints:
- Conjunto no puede tener más de 20 productos
- Todos los productos de un conjunto deben ser de la misma categoría
- Verificar que productos existan antes de agregar a conjunto
- No permitir duplicados en un conjunto

### 6.4 Exportación a CSV (Simple)

En cada vista, agregar botón que use `react-csv`:

```tsx
import { CSVLink } from 'react-csv';

<CSVLink data={productos} filename="productos_ax.csv">
  <button className="...">Exportar CSV</button>
</CSVLink>
```

---

## FASE 7: Testing & Documentación {#fase-7}

**Tiempo Estimado:** 2 horas

### 7.1 Testing Manual

**Checklist de pruebas:**

- [ ] Matriz ABC-XYZ se carga correctamente
- [ ] Click en celda filtra productos correctos
- [ ] Filtro por tienda funciona
- [ ] Modal de producto muestra datos correctos
- [ ] Gráficos se renderizan correctamente
- [ ] Crear conjunto funciona
- [ ] Agregar/remover productos de conjunto
- [ ] Análisis de conjunto muestra shares
- [ ] Comparación entre tiendas lado a lado
- [ ] Histórico de clasificación se visualiza
- [ ] Exportación CSV funciona
- [ ] Responsive en mobile/tablet

### 7.2 Documentación

**Crear:** `docs/PRODUCTOS_SECCION_MANUAL.md`

- Guía de usuario con screenshots
- Explicación de ABC-XYZ
- Cómo crear conjuntos sustituibles
- Interpretación de gráficos
- Estrategias por clasificación

**Actualizar:** `README.md`

Agregar sección sobre feature de Productos

---

## 📋 Resumen de Archivos {#resumen-archivos}

### Backend - Nuevos

- ✨ `database/schema_extended.sql` (UPDATE - agregar conjuntos)
- ✨ `database/init_conjuntos_sustituibles.py`
- ✨ `database/analizar_conjuntos_ax.py`
- ✨ `database/snapshot_abc_xyz_historico.py`

### Backend - Modificar

- ✏️ `backend/main.py` (~15 nuevos endpoints)

### Frontend - Services

- ✨ `frontend/src/services/productosService.ts`

### Frontend - Componentes Principales

- ✨ `frontend/src/components/productos/ProductosLayout.tsx`
- ✨ `frontend/src/components/productos/ABCXYZAnalysis.tsx`
- ✨ `frontend/src/components/productos/MatrizABCXYZ.tsx`
- ✨ `frontend/src/components/productos/CategoriasAnalysis.tsx`
- ✨ `frontend/src/components/productos/SubcategoriasAnalysis.tsx`
- ✨ `frontend/src/components/productos/ProductoDetalleModal.tsx`
- ✨ `frontend/src/components/productos/ComparacionTiendasView.tsx`
- ✨ `frontend/src/components/productos/ConjuntosSustituiblesView.tsx`
- ✨ `frontend/src/components/productos/ConjuntoDetallePanel.tsx`
- ✨ `frontend/src/components/productos/CrearConjuntoModal.tsx`

### Frontend - Componentes de Gráficos

- ✨ `frontend/src/components/productos/charts/ABCDistributionChart.tsx`
- ✨ `frontend/src/components/productos/charts/XYZDistributionChart.tsx`
- ✨ `frontend/src/components/productos/charts/TopCategoriasChart.tsx`
- ✨ `frontend/src/components/productos/charts/ClasificacionHistoricoChart.tsx`
- ✨ `frontend/src/components/productos/charts/ConjuntoSharesChart.tsx`

### Frontend - Routing

- ✏️ `frontend/src/App.tsx`
- ✏️ `frontend/src/components/layout/Header.tsx`

### Dependencias

- 📦 `recharts` (gráficos React)
- 📦 `react-csv` (exportación simple)

---

## 🚀 Plan de Implementación por Sprints {#sprints}

### Sprint 1: Core MVP (8-10 horas)

**Objetivo:** Funcionalidad básica ABC-XYZ operativa

1. **Database** (2h)
   - Actualizar schema con conjuntos
   - Crear tabla histórico
   - Scripts de inicialización

2. **Backend APIs Core** (2-3h)
   - Endpoint matriz ABC-XYZ
   - Endpoint lista por matriz
   - Endpoint producto detalle completo

3. **Frontend Services** (1h)
   - Crear productosService.ts con funciones base

4. **UI Core** (3-4h)
   - ProductosLayout con tabs
   - ABCXYZAnalysis (sin gráficos todavía)
   - MatrizABCXYZ clickeable
   - ProductoDetalleModal básico
   - Integración routing

**Entregables:**
- ✅ Navegación "Productos" en header
- ✅ Vista matriz 3×3 funcional
- ✅ Click en celda lista productos
- ✅ Modal muestra info de producto por tienda

---

### Sprint 2: Gráficos + Conjuntos (6-8 horas)

**Objetivo:** Visualización avanzada y gestión de conjuntos

1. **Backend APIs Conjuntos** (2h)
   - Endpoints CRUD conjuntos
   - Endpoint análisis conjunto
   - Validaciones

2. **Frontend Gráficos** (2-3h)
   - Instalar Recharts
   - Crear componentes de charts
   - Integrar en ABCXYZAnalysis
   - Histórico en ProductoDetalleModal

3. **UI Conjuntos** (2-3h)
   - ConjuntosSustituiblesView
   - CrearConjuntoModal
   - ConjuntoDetallePanel con análisis
   - Badges en productos que pertenecen a conjuntos

**Entregables:**
- ✅ Gráficos pie/bar en todas las vistas
- ✅ Crear y editar conjuntos sustituibles
- ✅ Ver análisis de shares de conjunto
- ✅ Identificar productos de conjunto en listas

---

### Sprint 3: Avanzado + Polish (4-6 horas)

**Objetivo:** Features avanzados y refinamiento

1. **Backend Categorías + Comparación** (1-2h)
   - Endpoints análisis categorías/subcategorías
   - Endpoint comparación matrices

2. **UI Avanzada** (2-3h)
   - CategoriasAnalysis
   - SubcategoriasAnalysis
   - ComparacionTiendasView
   - Gráficos adicionales

3. **Features Extras** (1h)
   - Exportación CSV con react-csv
   - Script analizar_conjuntos_ax.py
   - Cron job snapshot histórico

4. **Testing & Docs** (1h)
   - Pruebas manuales completas
   - Documentación de usuario
   - README actualizado

**Entregables:**
- ✅ Análisis por categoría/subcategoría
- ✅ Comparación lado a lado de tiendas
- ✅ Histórico de clasificaciones
- ✅ Exportación CSV
- ✅ Documentación completa

---

## ✅ Checklist de Progreso {#checklist}

### Fase 1: Database & Schema
- [ ] Actualizar schema_extended.sql
- [ ] Crear tabla conjuntos_sustituibles
- [ ] Crear tabla productos_abc_v2_historico
- [ ] Script init_conjuntos_sustituibles.py
- [ ] Script analizar_conjuntos_ax.py
- [ ] Script snapshot_abc_xyz_historico.py

### Fase 2: Backend APIs
- [ ] GET /api/productos/matriz-abc-xyz
- [ ] GET /api/productos/lista-por-matriz
- [ ] GET /api/productos/matriz-abc-xyz/comparacion
- [ ] GET /api/productos/analisis-categorias
- [ ] GET /api/productos/analisis-subcategorias
- [ ] GET /api/productos/categoria/:nombre/grafico
- [ ] GET /api/productos/:codigo/detalle-completo
- [ ] GET /api/productos/:codigo/historico-clasificacion
- [ ] GET /api/conjuntos-sustituibles
- [ ] GET /api/conjuntos-sustituibles/:id
- [ ] POST /api/conjuntos-sustituibles
- [ ] PUT /api/conjuntos-sustituibles/:id/productos
- [ ] GET /api/conjuntos-sustituibles/:id/analisis
- [ ] GET /api/productos/:codigo/conjunto
- [ ] GET /api/productos/graficos/distribucion-abc-xyz
- [ ] GET /api/productos/graficos/top-categorias

### Fase 3: Frontend Services
- [ ] Crear productosService.ts
- [ ] Implementar todas las funciones API
- [ ] Helper functions (colores, descripciones, etc.)

### Fase 4: Frontend UI
- [ ] ProductosLayout.tsx
- [ ] ABCXYZAnalysis.tsx
- [ ] MatrizABCXYZ.tsx
- [ ] ProductoDetalleModal.tsx
- [ ] CategoriasAnalysis.tsx
- [ ] SubcategoriasAnalysis.tsx
- [ ] ComparacionTiendasView.tsx
- [ ] ConjuntosSustituiblesView.tsx
- [ ] ConjuntoDetallePanel.tsx
- [ ] CrearConjuntoModal.tsx
- [ ] ABCDistributionChart.tsx
- [ ] XYZDistributionChart.tsx
- [ ] TopCategoriasChart.tsx
- [ ] ClasificacionHistoricoChart.tsx
- [ ] ConjuntoSharesChart.tsx

### Fase 5: Integración
- [ ] Actualizar App.tsx con rutas
- [ ] Actualizar Header.tsx con nav item
- [ ] Instalar dependencias (recharts, react-csv)

### Fase 6: Features Avanzados
- [ ] Configurar cron job snapshot
- [ ] Validaciones backend
- [ ] Exportación CSV

### Fase 7: Testing & Docs
- [ ] Testing manual completo
- [ ] Documentación de usuario
- [ ] Actualizar README.md

---

## 📝 Notas Importantes

### Decisiones de Diseño

1. **Conjuntos Sustituibles**
   - Solo para productos AX inicialmente (alta rotación, demanda estable)
   - Agrupación manual, no automática
   - Validar que todos sean de misma categoría

2. **Histórico de Clasificación**
   - Snapshot mensual (no diario para no inflar DB)
   - Permite ver evolución a 6-12 meses
   - Útil para detectar cambios de comportamiento

3. **Comparación entre Tiendas**
   - Máximo 4 tiendas en paralelo (UI constraint)
   - Highlight discrepancias (producto A en una tienda, C en otra)

4. **Gráficos**
   - Recharts para consistencia con posible stack futuro
   - Colores consistentes con clasificaciones
   - Tooltips informativos

### Consideraciones Técnicas

1. **Performance**
   - Paginación en listas largas
   - Lazy loading de gráficos
   - Cache de consultas frecuentes

2. **UX**
   - Loading states en todas las vistas
   - Error handling gracioso
   - Breadcrumbs para navegación
   - Tooltips para ayuda contextual

3. **Seguridad**
   - Validar inputs en backend
   - Sanitizar nombres de conjuntos
   - Limitar tamaño de listas

### Próximos Pasos Futuros (Post-MVP)

1. **Alertas Automáticas**
   - Notificar cuando producto AZ tiene bajo stock
   - Alertar cambios bruscos en clasificación
   - Detectar share inestable en conjuntos

2. **Predicción de Demanda**
   - Integrar con feature de pronóstico
   - Sugerir automáticamente productos para conjuntos
   - ML para detectar sustitutos

3. **Gestión de Sustitución Automática**
   - Cuando producto líder se agota, redistribuir demanda
   - Calcular pedidos considerando conjuntos
   - Optimización multi-SKU

---

## 🎯 Orden de Prioridad

### MUST HAVE (Sprint 1)
✅ Matriz ABC-XYZ clickeable
✅ Tabla resumen ABC (Pareto)
✅ Lista productos con filtros
✅ Modal producto detalle
✅ Schema conjuntos sustituibles

### SHOULD HAVE (Sprint 2)
✅ Gráficos (pie, bar charts)
✅ Vista gestión conjuntos
✅ Análisis categorías/subcategorías
✅ Histórico clasificación

### NICE TO HAVE (Sprint 3)
✅ Comparación tiendas
✅ Exportación CSV
✅ Script análisis automático
✅ Cron job snapshot

---

**FIN DEL PLAN**

Para continuar la implementación, empezar por **Sprint 1** y seguir el checklist en orden.
