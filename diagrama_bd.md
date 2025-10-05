# Diagrama de Base de Datos - Fluxion Production

## Estructura Actual: `data/fluxion_production.db`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUXION PRODUCTION DATABASE                          │
│                              DuckDB - 16GB                                   │
└─────────────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TABLAS MAESTRAS (Master Data)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌────────────────────────────┐
│      UBICACIONES (20)      │
├────────────────────────────┤
│ PK: id                     │
│    codigo (UNIQUE)         │
│    nombre                  │
│    tipo (tienda/cedi)      │
│    region, ciudad          │
│    latitud, longitud       │
│    superficie_m2           │
│    capacidad_actual        │
│    capacidad_maxima        │
│    horario_apertura/cierre │
│    activo                  │
└────────────────────────────┘
         ┃
         ┃ FK ubicacion_id
         ┃
         ▼
┌──────────────────────────────────────────────────────────────┐
│              PRODUCTO_UBICACION_CONFIG (300)                 │
├──────────────────────────────────────────────────────────────┤
│ PK: id                                                       │
│ FK: ubicacion_id ──────────────────┐                       │
│ FK: producto_id ─────┐              │                       │
│                      │              │                       │
│ • stock_minimo       │              │                       │
│ • stock_maximo       │              │                       │
│ • punto_reorden      │              │                       │
│ • demanda_diaria_promedio           │                       │
│ • lead_time_dias                    │                       │
│ • precio_venta                      │                       │
│ • ubicacion_fisica                  │                       │
│ • generar_alerta_stock_bajo         │                       │
└──────────────────────────────────────────────────────────────┘
           │                           │
           │                           │
           ▼                           │
┌────────────────────────────┐         │
│      PRODUCTOS (15)        │         │
├────────────────────────────┤         │
│ PK: id                     │         │
│    codigo (UNIQUE)         │         │
│    codigo_barras           │         │
│    descripcion             │         │
│    categoria               │         │
│    grupo, subgrupo         │         │
│    marca, modelo           │         │
│    presentacion            │         │
│    costo_promedio          │         │
│    precio_venta            │         │
│    stock_minimo/maximo     │         │
│    es_perecedero           │         │
│    activo                  │         │
└────────────────────────────┘         │
           ┃                           │
           ┃ FK producto_id            │
           ┃                           │
           ▼                           │
┌────────────────────────────┐         │
│  CATEGORIAS_CONFIG (6)     │         │
├────────────────────────────┤         │
│ PK: id                     │         │
│    categoria               │         │
│    subcategoria            │         │
│    rotacion_objetivo       │         │
│    dias_cobertura_min/max  │         │
│    factor_seguridad        │         │
│    margen_minimo/objetivo  │         │
└────────────────────────────┘         │
                                       │
                                       │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
 TABLAS TRANSACCIONALES (RAW - OLAP)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌──────────────────────────────────────┐
│        VENTAS_RAW (83.8M)            │  ← VENTAS HISTÓRICAS
├──────────────────────────────────────┤
│ Clave de negocio:                    │
│   ubicacion_id +                     │
│   numero_factura +                   │
│   linea                              │
│                                      │
│ • fecha, fecha_hora_completa         │
│ • codigo_producto                    │
│ • descripcion_producto               │
│ • categoria_producto                 │
│ • cantidad_vendida                   │
│ • precio_unitario                    │
│ • venta_total                        │
│ • costo_total                        │
│ • margen_bruto                       │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│      INVENTARIO_RAW (46.9K)          │  ← INVENTARIO ACTUAL
├──────────────────────────────────────┤
│ • ubicacion_id                       │
│ • codigo_producto                    │
│ • descripcion_producto               │
│ • categoria                          │
│ • cantidad_actual                    │
│ • cantidad_bultos                    │
│ • precio_venta_actual                │
│ • stock_minimo/maximo                │
│ • punto_reorden                      │
│ • estado_stock                       │
│ • dias_sin_movimiento                │
│ • fecha_extraccion                   │
└──────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 INVENTARIO Y MOVIMIENTOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌────────────────────────────────────────────────────────┐
│              STOCK_ACTUAL (20)                         │  ← Snapshot actual
├────────────────────────────────────────────────────────┤
│ PK: ubicacion_id + producto_id                         │
│ FK: ubicacion_id                                       │
│ FK: producto_id                                        │
│                                                        │
│ • cantidad                                             │
│ • valor_inventario                                     │
│ • costo_promedio                                       │
│ • ultima_entrada                                       │
│ • ultima_salida                                        │
│ • ultima_actualizacion                                 │
│ • stock_minimo/maximo                                  │
│ • dias_sin_movimiento                                  │
└────────────────────────────────────────────────────────┘
           ▲
           │ (Actualizado por)
           │
┌────────────────────────────────────────────────────────┐
│        MOVIMIENTOS_INVENTARIO (5)                      │  ← Historial
├────────────────────────────────────────────────────────┤
│ PK: id                                                 │
│ FK: ubicacion_id                                       │
│ FK: producto_id                                        │
│    fecha_hora, fecha                                   │
│    tipo_movimiento (entrada/salida/ajuste/transfer)    │
│    origen, destino                                     │
│    referencia                                          │
│    cantidad                                            │
│    stock_anterior, stock_nuevo                         │
│    costo_unitario, valor_total                         │
│    usuario, observaciones                              │
└────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 VISTAS ANALÍTICAS (Para Dashboards)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────┐
│   inventario_resumen (2)        │  ← Estado inventario
├─────────────────────────────────┤
│ • ubicacion_id                  │
│ • skus_unicos                   │
│ • unidades_totales              │
│ • valor_total_inventario        │
│ • productos_stock_bajo          │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│   productos_ubicacion_completa  │  ← Productos con config
│   (300)                         │
├─────────────────────────────────┤
│ • producto_id, ubicacion_id     │
│ • stock_actual, disponible      │
│ • stock_minimo/maximo           │
│ • estado_stock (CRITICO/BAJO/   │
│   EXCESO/NORMAL)                │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│   ventas_por_ubicacion          │  ← Ventas por tienda
│   (83.8M)                       │
├─────────────────────────────────┤
│ • ubicacion_id, ubicacion_nombre│
│ • campos clave de ventas_raw    │
└─────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TABLAS DE CONTROL Y METADATOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────┐
│   etl_logs (500)                │  ← Logs de procesos ETL
├─────────────────────────────────┤
│ • timestamp, proceso            │
│ • estado, mensaje               │
│ • registros_procesados          │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│   analisis_numeracion_facturas  │  ← Análisis duplicados
│   (1M)                          │
├─────────────────────────────────┤
│ • numero_factura                │
│ • ubicaciones_que_usan_numero   │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│   verificacion_duplicados_reales│  ← Control calidad
│   (12.8M)                       │
├─────────────────────────────────┤
│ • ubicacion_id + numero_factura │
│ • duplicados                    │
└─────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ESTADÍSTICAS ACTUALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 DATOS MAESTROS:
   • Ubicaciones (tiendas/CEDIs): 20 registros
   • Productos (catálogo):        15 registros
   • Configuración producto-ubicación: 300 registros
   • Categorías configuradas:     6 registros

📊 TRANSACCIONES:
   • Ventas raw:                  83,877,554 registros ⭐
   • Inventario raw:              46,981 registros ⭐

📊 INVENTARIO:
   • Stock actual:                20 registros
   • Movimientos inventario:      5 registros

📊 VISTAS:
   • Inventario resumen:          2 registros
   • Productos ubicación:         300 registros
   • Ventas por ubicación:        83.8M registros

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 CLAVE DE NEGOCIO IMPORTANTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  VENTAS_RAW - Clave única:

    ubicacion_id + numero_factura + linea

    ❌ INCORRECTO: numero_factura + linea
       (Los números de factura NO son únicos globalmente)

    ✅ CORRECTO: ubicacion_id + numero_factura + linea
       (Cada tienda tiene su propia secuencia de facturas)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 RELACIONES PRINCIPALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. UBICACIONES → PRODUCTO_UBICACION_CONFIG (1:N)
   • Cada ubicación tiene configuración específica para múltiples productos

2. PRODUCTOS → PRODUCTO_UBICACION_CONFIG (1:N)
   • Cada producto tiene configuración diferente por ubicación

3. UBICACIONES + PRODUCTOS → STOCK_ACTUAL (1:1)
   • Snapshot de inventario actual por ubicación-producto

4. VENTAS_RAW → Datos desnormalizados
   • Tabla principal con 83.8M registros de ventas históricas
   • Contiene toda la información de ventas de 20 tiendas
   • Optimizada para consultas OLAP

5. INVENTARIO_RAW → Datos desnormalizados
   • Tabla con 46.9K registros de inventario actual
   • Sincronizada mediante ETL desde sistema origen
   • Fuente de datos para API y dashboards

6. CATEGORIAS_CONFIG → PRODUCTOS (1:N)
   • Configuración por categoría que se aplica a productos

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Notas Importantes

### Estado Actual (2025-10-03):

1. **VENTAS_RAW es la tabla principal** con 83.8M registros
   - Contiene todos los datos de ventas históricas
   - Datos desnormalizados para consultas rápidas OLAP
   - No se requiere normalización adicional

2. **INVENTARIO_RAW con datos reales** con 46.9K registros
   - Datos de inventario actual de todas las tiendas
   - Sincronización mediante ETL desde sistema origen
   - Backend usa esta tabla para consultas en tiempo real

3. **Configuración granular implementada**
   - `producto_ubicacion_config`: 300 registros activos
   - Permite stock mínimo/máximo diferente por tienda
   - Configuración de alertas y reposición por ubicación

4. **Inventario operativo**
   - 20 registros en `stock_actual` (snapshot)
   - 5 movimientos registrados
   - Sistema activo con datos reales

5. **Catálogos maestros activos**
   - 20 ubicaciones (tiendas/CEDIs)
   - 15 productos en catálogo
   - 6 categorías configuradas

### Arquitectura de Datos:

- **Tablas RAW** (`ventas_raw`, `inventario_raw`): Datos fuente desnormalizados optimizados para OLAP
- **Tablas maestras**: Catálogos y configuración
- **Tablas snapshot**: Estado actual (`stock_actual`)
- **Vistas**: Agregaciones pre-calculadas para dashboards

### Tablas Eliminadas (2025-10-03):

Las siguientes tablas fueron eliminadas por no estar en uso:
- ❌ `facturas` (0 registros) - No se usaba
- ❌ `items_facturas` (0 registros) - No se usaba
- ❌ Vista `ventas_diarias` - Dependía de facturas
- ❌ Vista `productos_top_ventas` - Dependía de facturas
- ❌ Vista `facturas_resumen` - Dependía de facturas

**Razón:** El sistema usa arquitectura RAW (desnormalizada) para OLAP. Las tablas normalizadas no agregan valor y las vistas que dependían de ellas estaban vacías.
