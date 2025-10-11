# Queries y Reportes de Análisis

Este directorio contiene queries SQL y scripts de análisis para extraer insights de la base de datos de Fluxion AI.

## 📊 Reportes Disponibles

### 1. Oportunidades de Productos por Tienda

Identifica productos que se venden bien en otras tiendas pero NO se venden en la tienda especificada.

#### Uso del Script Python:

```bash
# Reporte básico para tienda_08 (El Bosque)
python3 queries/reporte_oportunidades_tienda.py --tienda tienda_08

# Análisis de últimos 60 días, productos en mínimo 5 tiendas
python3 queries/reporte_oportunidades_tienda.py --tienda tienda_08 --dias 60 --min-tiendas 5

# Exportar a CSV
python3 queries/reporte_oportunidades_tienda.py --tienda tienda_08 --export csv

# Análisis completo (200 productos)
python3 queries/reporte_oportunidades_tienda.py --tienda tienda_08 --limit 200
```

#### Parámetros:

- `--tienda`: ID de la tienda (requerido) - ej: `tienda_08`
- `--dias`: Período de análisis en días (default: 90)
- `--min-tiendas`: Mínimo de tiendas donde debe venderse el producto (default: 3)
- `--limit`: Máximo de productos a mostrar (default: 100)
- `--export`: Formato de exportación (`csv`, `json`, `excel`)

#### Uso del Query SQL:

Si prefieres ejecutar el query directamente en DuckDB:

```bash
python3 -c "
import duckdb
conn = duckdb.connect('data/fluxion_production.db', read_only=True)
with open('queries/oportunidades_tienda_08.sql', 'r') as f:
    query = f.read()
result = conn.execute(query).fetchdf()
print(result)
conn.close()
"
```

O desde Python:

```python
import duckdb
conn = duckdb.connect('data/fluxion_production.db', read_only=True)

# Leer y ejecutar el query
with open('queries/oportunidades_tienda_08.sql', 'r') as f:
    query = f.read()

result = conn.execute(query).fetchdf()
print(result)
conn.close()
```

## 📈 Interpretación de Resultados

### Columnas del Reporte de Oportunidades

| Columna | Descripción | Interpretación |
|---------|-------------|----------------|
| `codigo_producto` | Código interno del producto | Identificador único |
| `descripcion_producto` | Nombre del producto | Descripción comercial |
| `categoria_producto` | Categoría | Clasificación de alto nivel |
| `grupo_producto` | Grupo | Sub-clasificación |
| `num_tiendas_venta` | Número de tiendas donde se vende | **Mayor = Menor riesgo de introducción** |
| `total_unidades_vendidas` | Suma de unidades vendidas en el período | Volumen total de demanda |
| `num_transacciones` | Número de transacciones | Frecuencia de compra |
| `venta_total_bs` | Ingreso total generado (Bs) | **Potencial de ingresos** |
| `precio_promedio` | Precio promedio de venta (Bs) | Punto de referencia para pricing |
| `stock_cedi` | Unidades disponibles en CEDI | **0 = Requiere compra, >0 = Envío inmediato** |
| `disponibilidad_cedi` | Estado de disponibilidad | "HAY STOCK" o "SIN STOCK" |

### Niveles de Prioridad

#### 🔴 PRIORIDAD ALTA
- `num_tiendas_venta >= 10`
- `disponibilidad_cedi = "HAY STOCK"`
- **Acción**: Envío inmediato a la tienda

#### 🟡 PRIORIDAD MEDIA
- `num_tiendas_venta 5-9`
- **Acción**: Evaluar perfil de tienda y clientes antes de introducir

#### 🟢 PRIORIDAD BAJA
- `num_tiendas_venta 3-4`
- **Acción**: Análisis detallado de viabilidad requerido

## 🎯 Casos de Uso

### 1. Expansión de Catálogo
```bash
# Identificar top 50 productos para agregar a una tienda
python3 queries/reporte_oportunidades_tienda.py --tienda tienda_08 --limit 50
```

### 2. Aprovechamiento de Stock
```bash
# Productos con stock disponible en últimos 30 días
python3 queries/reporte_oportunidades_tienda.py --tienda tienda_08 --dias 30
```

### 3. Análisis de Productos Premium
```bash
# Productos en al menos 8 tiendas (alta adopción)
python3 queries/reporte_oportunidades_tienda.py --tienda tienda_08 --min-tiendas 8
```

### 4. Exportar para Presentación
```bash
# Exportar top 200 productos a Excel para análisis
python3 queries/reporte_oportunidades_tienda.py --tienda tienda_08 --limit 200 --export excel
```

## 🔍 Ejemplo de Resultado

```
ANÁLISIS DE OPORTUNIDADES PARA TIENDA_08 (EL BOSQUE)
Productos que se venden bien en otras tiendas pero NO se venden aquí
================================================================================

codigo_producto  descripcion_producto              num_tiendas  venta_total  stock_cedi  disponibilidad
001951          GELATINA FRESA FRUXI 40 GR              15        4502          0       ⚠️ SIN STOCK
000280          CHUPETAS SABORES VARIOS UND             15         881          0       ⚠️ SIN STOCK
003435          PASTA PREMIUM SPAGUETTINI 1 KG          11        2991          0       ⚠️ SIN STOCK

📊 RESUMEN:
  • Total productos oportunidad: 50
  • Productos con stock en CEDI: 0
  • Productos sin stock en CEDI: 50
  • Venta total potencial: 39,543 Bs
  • Período analizado: Últimos 90 días

💡 RECOMENDACIÓN:
  1. Productos con stock: Crear pedido de transferencia desde CEDI
  2. Productos sin stock: Evaluar orden de compra a proveedores
  3. Priorizar por num_tiendas_venta (mayor presencia = menor riesgo)
```

## 📝 Notas Técnicas

### Requisitos
- Python 3.x
- DuckDB
- pandas (para exportación)
- openpyxl (para exportación a Excel)

### Instalación de dependencias
```bash
pip install duckdb pandas openpyxl
```

### Ubicación de la Base de Datos
El script busca la base de datos en:
```
/Users/jose/Developer/fluxion-workspace/data/fluxion_production.db
```

### Período de Análisis
Por defecto, el análisis considera los últimos 90 días de ventas. Esto puede ajustarse con el parámetro `--dias`.

### Criterio de "Oportunidad"
Un producto se considera "oportunidad" si:
1. Se vende en otras tiendas (NO en la tienda objetivo)
2. Se vende en al menos `min_tiendas` tiendas (default: 3)
3. Tiene ventas registradas en el período analizado

## 🚀 Próximos Reportes Planeados

- [ ] Análisis de productos de baja rotación (candidatos a descontinuar)
- [ ] Comparación de ventas entre tiendas similares
- [ ] Productos con mayor crecimiento de demanda
- [ ] Análisis de estacionalidad por categoría
- [ ] Optimización de stock por producto y tienda

## 🤝 Contribuir

Para agregar nuevos queries o reportes:

1. Crear archivo SQL en este directorio: `queries/nombre_query.sql`
2. Documentar el query con comentarios
3. (Opcional) Crear script Python para automatización
4. Actualizar este README con instrucciones de uso

## 📞 Soporte

Para preguntas o problemas:
- Revisar logs de ejecución
- Verificar que la base de datos esté actualizada
- Confirmar que los IDs de tienda sean correctos
