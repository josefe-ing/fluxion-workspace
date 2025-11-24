# Mapeo de Tiendas KLK

**Fecha:** 2025-11-24
**Sistema:** KLK POS API
**Base URL:** `http://190.6.32.3:7002`

---

## Cambio Conceptual Importante

**Antes (Stellar):** 1 tienda = 1 inventario
**Ahora (KLK):** 1 sucursal = múltiples almacenes

Cada sucursal tiene varios tipos de almacén:

| Tipo | Prefijo | Descripción | Relevante para Fluxion |
|------|---------|-------------|------------------------|
| **PISO DE VENTA** | T | Stock visible para clientes | ✅ **SÍ - Principal** |
| PRINCIPAL | P | Almacén/bodega | ⚠️ Posible |
| PROCURA | PC | Compras pendientes | ❌ No |
| PRODUCCIÓN | PD | Productos en elaboración | ❌ No |
| DEVOLUCIONES | D | Productos devueltos | ❌ No |
| MERMA | M | Pérdidas/bajas | ❌ No |

---

## Tiendas Migradas a KLK

| # | CodigoSucursal | Nombre | Almacén Piso Venta | Almacén Principal | Tienda Fluxion | Estado |
|---|----------------|--------|-------------------|-------------------|----------------|--------|
| 1 | `SUC001` | PERIFERICO | `APP-TPF` | `APP-PPF` | `tienda_01` | ✅ Activo |
| 2 | `SUC002` | EL BOSQUE | `APP-TBQ` | `APP-PBQ` | `tienda_08` | ✅ Activo |
| 3 | `SUC003` | ARTIGAS | `TANT` | `PANT` | `tienda_17` | ✅ Activo |
| 4 | `SUC004` | PARAISO | `APP-TPAR` | `APP-PPAR` | `tienda_18` | ✅ Activo |
| 5 | `SUC005` | TAZAJAL | `TTZ` | `PTZ` | `tienda_20` | ✅ Activo (1,687 con stock) |

---

## Estructura Completa de Almacenes por Sucursal

### SUC001 - PERIFERICO
| Código | Nombre | Uso |
|--------|--------|-----|
| APP-TPF | PISO DE VENTA | Stock para clientes |
| APP-PPF | PRINCIPAL | Bodega |
| APP-PCPF | PROCURA | Compras |
| APP-PDPF | PRODUCCION | Elaboración |
| APP-DPF | DEVOLUCIONES | Devueltos |
| APP-MPF | MERMA | Bajas |

### SUC003 - ARTIGAS
| Código | Nombre | Uso |
|--------|--------|-----|
| TANT | PISO DE VENTA | Stock para clientes |
| PANT | PRINCIPAL | Bodega |
| PCANT | PROCURA | Compras |
| PDANT | PRODUCCION | Elaboración |
| DANT | DEVOLUCIONES | Devueltos |
| MANT | MERMA | Bajas |

### SUC004 - PARAISO
| Código | Nombre | Uso |
|--------|--------|-----|
| APP-TPAR | PISO DE VENTA | Stock para clientes |
| APP-PPAR | PRINCIPAL | Bodega |
| APP-PRPAR | PROCURA | Compras |
| APP-PDPAR | PRODUCCION | Elaboración |
| APP-DPAR | DEVOLUCIONES | Devueltos |
| APP-MPAR | MERMA | Bajas |

### SUC005 - TAZAJAL
| Código | Nombre | Uso |
|--------|--------|-----|
| TTZ | PISO DE VENTA | Stock para clientes |
| PTZ | PRINCIPAL | Bodega |
| PCTZ | PROCURA | Compras |
| PDTZ | PRODUCCION | Elaboración |
| DTZ | DEVOLUCIONES | Devueltos |
| MTZ | MERMA | Bajas |

---

## Consolidado KLK

| Sucursal | Nombre | Código Almacén | Propósito |
|----------|--------|----------------|-----------|
| `CONS` | CONSOLIDADO | `CONS` | Vista consolidada de todas las tiendas |

---

## Inventario Actual

### PERIFERICO (`APP-TPF`)
- **Total productos:** 3,858
- **Stock positivo:** 825 (21.4%)
- **Stock en cero:** 2,060 (53.4%)
- **Stock negativo:** 973 (25.2%)
- **Tiempo extracción:** ~1.6s

### BOSQUE (`APP-TBQ`)
- **Total productos:** 3,858
- **Stock positivo:** 1,460 (37.8%)
- **Stock en cero:** 2,133 (55.3%)
- **Stock negativo:** 134 (3.5%)
- **Tiempo extracción:** ~1.7s

### TAZAJAL (`TTZ`)
- **Estado:** Configurado, pendiente de prueba

---

## Próximos Pasos

### 1. Ejecutar ETL para Tiendas Confirmadas

```bash
# Procesar todas las tiendas KLK confirmadas (5 tiendas)
cd etl/core
python3 etl_inventario_klk.py
```

Esto procesará:
- ✅ PERIFERICO (tienda_01)
- ✅ BOSQUE (tienda_08)
- ✅ ARTIGAS (tienda_17)
- ✅ PARAISO (tienda_18)
- ✅ TAZAJAL (tienda_20)

### 2. Actualizar Base de Datos

Agregar las nuevas tiendas a la tabla `ubicaciones`:

```bash
cd database
# Ejecutar script de migración (pendiente de crear)
```

---

## Consultas Útiles

### Listar todas las tiendas KLK

```python
from tiendas_config import get_tiendas_klk

for tid, cfg in get_tiendas_klk().items():
    print(f"{cfg.ubicacion_nombre} → {cfg.codigo_almacen_klk}")
```

### Probar extracción de una tienda

```bash
python3 etl_inventario_klk.py --tiendas tienda_01 --dry-run
```

### Ver logs de extracción

```bash
tail -f etl/logs/etl_inventario_klk_*.log
```

---

## Endpoints API KLK

### Almacenes

```bash
# Todos los almacenes de reposición
GET /maestra/almacenes/Reposicion

# Almacenes de una sucursal específica
GET /maestra/almacenes/Reposicion?sucursal=SUC001

# Almacenes de piso de venta (los principales para inventario)
GET /maestra/almacenes/pisoventa
```

### Artículos

```bash
# Artículos de un almacén específico
POST /maestra/articulos/almacen
Body: {"Codigoalmacen": "APP-TPF"}

# Artículos de múltiples almacenes
POST /maestra/articulos/almacen
Body: {"Codigoalmacen": ["APP-TPF", "APP-PPF"]}

# Artículos de reposición por sucursal
POST /maestra/articulos/reposicion
Body: {"CodigoSucursal": "SUC001"}

# Artículos de múltiples sucursales
POST /maestra/articulos/reposicion
Body: {"CodigoSucursal": ["SUC001", "SUC003"]}
```

### Ventas

```bash
# Ventas básicas por fecha
POST /ventas
Body: {
  "sucursal": "SUC001",
  "fecha_desde": "2025-11-23",
  "fecha_hasta": "2025-11-24"
}

# Ventas con filtro de hora
POST /ventas
Body: {
  "sucursal": "SUC001",
  "fecha_desde": "2025-11-23",
  "fecha_hasta": "2025-11-24",
  "hora_desde": "12:00",
  "hora_hasta": "18:00"
}

# Ventas con todos los filtros
POST /ventas
Body: {
  "sucursal": "SUC001",
  "fecha_desde": "2025-11-23",
  "fecha_hasta": "2025-11-24",
  "hora_desde": "12:00:00",
  "hora_hasta": "18:00:00",
  "almacen": "APP-TPF",
  "CodArticulo": "001853"
}
```

---

## Estructura de Respuestas

### Artículo (de /maestra/articulos/almacen)
```json
{
  "NombreProducto": "JAMON ESPALDA AHUM. SHOULDER DRAGOS KG",
  "Codigo": "000001",
  "Barra": "001",
  "Categoria": "05",
  "Descripcion": "CHARCUTERIA",
  "Subcategoria": "1",
  "Descripcion_categoria": "DE CERDO",
  "Marca": "DRAGOS",
  "Precio": 4.982759,
  "Iva": 16,
  "stock": 5.5
}
```

### Venta (de /ventas)
```json
{
  "numero_factura": "C9-01-00006123",
  "fecha": "2025-11-24",
  "hora": "11:40:53",
  "fecha_hora_completa": "2025-11-24T11:40:53",
  "linea": 1,
  "producto": [{
    "codigo_producto": "002263",
    "descripcion_producto": "MAYONESA GRANJA 465 GR",
    "marca_producto": "GRANJA",
    "categoria_producto": "ADEREZOS Y PREPARADOS",
    "grupo_articulo": "VIVERES",
    "codigo_barras": "7599676000023"
  }],
  "cantidad": [{
    "codigo_almacen": "APP-TPF",
    "nombre_almacen": "PISO DE VENTA",
    "cantidad_vendida": 1,
    "unidad_medida_venta": "UNIDAD"
  }],
  "financiero": [{
    "precio_unitario_usd": 2.17,
    "venta_total_usd": 2.17,
    "costo_total_usd": 1.00
  }],
  "total_factura": 4205.09,
  "tasa_usd": 243.11
}
```

---

**Última actualización:** 2025-11-24
**Tiendas KLK activas:** 5 sucursales
**Estado:** API funcional, estructura multi-almacén documentada
