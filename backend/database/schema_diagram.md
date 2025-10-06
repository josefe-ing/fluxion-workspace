# Fluxion AI - Estructura de Base de Datos DuckDB

## 📊 Diagrama de Relaciones

```
┌─────────────────────┐         ┌─────────────────────┐
│    ubicaciones      │         │     productos       │
├─────────────────────┤         ├─────────────────────┤
│ id (PK)             │         │ id (PK)             │
│ codigo              │         │ codigo              │
│ nombre              │         │ descripcion         │
│ tipo                │         │ categoria           │
│ region              │         │ marca               │
│ ciudad              │         │ presentacion        │
│ superficie_m2       │         │ costo_promedio      │
│ activo              │         │ precio_venta        │
└─────────────────────┘         │ stock_minimo        │
           │                    │ stock_maximo        │
           │                    │ activo              │
           │                    └─────────────────────┘
           │                               │
           │                               │
           │    ┌─────────────────────────────────────┐
           │    │  producto_ubicacion_config          │
           │    ├─────────────────────────────────────┤
           └────┤ ubicacion_id (FK)                   │
                │ producto_id (FK)                    │
                │ stock_minimo                        │
                │ stock_maximo                        │
                │ punto_reorden                       │
                │ precio_venta                        │
                │ demanda_diaria_promedio             │
                │ lead_time_dias                      │
                │ es_producto_estrella                │
                │ activo                              │
                └─────────────────────────────────────┘
                           │
                           │
        ┌─────────────────────┐         ┌─────────────────────┐
        │   stock_actual      │         │ categorias_config   │
        ├─────────────────────┤         ├─────────────────────┤
        │ ubicacion_id (PK)   │         │ id (PK)             │
        │ producto_id (PK)    │         │ categoria           │
        │ cantidad            │         │ rotacion_objetivo   │
        │ valor_inventario    │         │ dias_cobertura_min  │
        │ costo_promedio      │         │ dias_cobertura_max  │
        │ stock_minimo        │         │ factor_seguridad    │
        │ stock_maximo        │         │ margen_minimo       │
        └─────────────────────┘         │ margen_objetivo     │
                                        │ margen_maximo       │
                                        └─────────────────────┘
```

## 🏗️ Arquitectura por Capas

### **Capa 1: Datos Maestros**
- **`ubicaciones`**: Tiendas (17) y CEDIs (3)
- **`productos`**: Catálogo de productos (15 productos base)
- **`categorias_config`**: Configuración por categoría (6 categorías)

### **Capa 2: Configuración Granular**
- **`producto_ubicacion_config`**: 300 configuraciones específicas
  - Cada producto tiene configuración única en cada ubicación
  - Stock mínimo/máximo personalizado
  - Precios específicos por ubicación
  - Parámetros de reposición

### **Capa 3: Estado Actual**
- **`stock_actual`**: Inventario en tiempo real
- **`movimientos_inventario`**: Historial de transacciones

## 📋 Detalle de Tablas Principales

### ubicaciones (20 registros)
```sql
17 Tiendas:
├── Norte: El Bosque, San Diego, Aranzazu, etc.
├── Centro: Vivienda Barbula, Las Ferias, Mañongo, etc.
└── Sur: Flor Amarillo, Paramacay, Tocuyito, etc.

3 CEDIs:
├── CEDI Inventario Mayor (Valencia)
├── CEDI Norte (Naguanagua)
└── CEDI Sur (San Diego)
```

### productos (15 productos)
```sql
Categorías:
├── Alimentos: Harina PAN, Arroz, Aceite, Azúcar, Sal
├── Limpieza: Detergente, Jabón, Desinfectante
├── Bebidas: Refresco Cola, Agua Mineral
├── Cuidado Personal: Papel Higiénico, Shampoo
├── Lácteos: Leche UHT, Queso Fresco
└── Carnes: Jamón de Pierna
```

### producto_ubicacion_config (300 configuraciones)
```sql
Para cada combinación Producto × Ubicación:
├── stock_minimo: Variable por tipo (CEDI: 500-2000, Tienda: 10-100)
├── stock_maximo: 3-8x el mínimo
├── punto_reorden: 1.5x el mínimo
├── precio_venta: Varía por producto y ubicación
├── margen_actual: 15-45% según categoría
└── es_producto_estrella: 20% probabilidad
```

## 🔍 Consultas Principales

### Vista: productos_ubicacion_completa
```sql
-- Une toda la configuración con stock actual
SELECT producto_id, ubicacion_id, stock_actual,
       estado_stock, dias_cobertura_actual
FROM productos_ubicacion_completa
```

### Estados de Stock
```sql
├── SIN_STOCK: cantidad IS NULL
├── CRITICO: cantidad <= stock_minimo
├── BAJO: cantidad <= punto_reorden
├── EXCESO: cantidad >= stock_maximo
└── NORMAL: estado óptimo
```

## 📊 Volumen de Datos Actual

```
📦 Ubicaciones:        20 (17 tiendas + 3 CEDIs)
🏷️  Productos:         15 (6 categorías)
⚙️  Configuraciones:   300 (15 × 20)
📋 Categorías Config:   6
📈 Stock Actual:       Variable (datos ETL)
```

## 🚀 Optimización

### Índices Principales
- `idx_stock_ubicacion` en stock_actual
- `idx_stock_producto` en stock_actual
- `producto_ubicacion_config` tiene PK compuesta

### Performance
- **Consultas por ubicación**: Índice directo
- **Consultas por categoría**: JOIN optimizado
- **Dashboard métricas**: Vistas precalculadas
- **ETL updates**: 50 escrituras/día máximo