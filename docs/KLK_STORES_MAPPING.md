# Mapeo de Tiendas KLK

**Fecha:** 2025-11-17
**Sistema:** KLK POS API
**Endpoint:** `http://190.6.32.3:7002/maestra/articulos`

---

## Tiendas Migradas a KLK (Confirmadas)

| # | Sucursal KLK | Nombre KLK | Código Almacén | Tienda ID Fluxion | Estado |
|---|--------------|------------|----------------|-------------------|--------|
| 1 | `SUC001` | PERIFERICO | `APP-TPF` | `tienda_01` | ✅ Configurado y probado |
| 2 | `SUC002` | EL BOSQUE | `APP-TBQ` | `tienda_08` | ✅ Configurado y probado |
| 5 | `SUC005` | TAZAJAL | `TTZ` | `tienda_20` | ✅ Configurado |

---

## Tiendas KLK Pendientes de Mapear

Estas tiendas existen en KLK pero **no se han mapeado** a tiendas en Fluxion:

| # | Sucursal KLK | Nombre KLK | Código Almacén | Tienda ID Fluxion | Acción Requerida |
|---|--------------|------------|----------------|-------------------|------------------|
| 3 | `SUC003` | ARTIGAS | `TANT` | ❓ **DESCONOCIDO** | Identificar tienda en sistema |
| 4 | `SUC004` | PARAISO | `PALT` | ❓ **DESCONOCIDO** | Identificar tienda en sistema |

### Posibles Candidatos

Revisar estas tiendas del sistema Fluxion para identificar ARTIGAS y PARAISO:

```
tienda_02: AV. BOLIVAR
tienda_03: MAÑONGO
tienda_04: SAN DIEGO
tienda_05: VIVIENDA
tienda_06: NAGUANAGUA
tienda_07: CENTRO
tienda_09: GUACARA
tienda_10: FERIAS
tienda_11: FLOR AMARILLO
tienda_12: PARAPARAL
tienda_13: NAGUANAGUA III
tienda_15: ISABELICA
tienda_16: TOCUYITO
tienda_19: GUIGUE
```

---

## Consolidado KLK

También existe un almacén consolidado:

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

### 1. Identificar Tiendas Faltantes

Confirmar con el cliente qué tiendas de Fluxion corresponden a:
- ❓ **ARTIGAS** (`TANT`)
- ❓ **PARAISO** (`PALT`)

### 2. Ejecutar ETL para Tiendas Confirmadas

```bash
# Procesar las 3 tiendas KLK confirmadas
cd etl/core
python3 etl_inventario_klk.py
```

Esto procesará:
- ✅ PERIFERICO (tienda_01)
- ✅ BOSQUE (tienda_08)
- ✅ TAZAJAL (tienda_20)

### 3. Configurar Tiendas Adicionales

Una vez identificadas ARTIGAS y PARAISO, agregar a [tiendas_config.py](../etl/core/tiendas_config.py):

```python
# Ejemplo para cuando se identifiquen
"tienda_XX": TiendaConfig(
    ubicacion_id="tienda_XX",
    ubicacion_nombre="ARTIGAS",  # o PARAISO
    # ... otras configuraciones ...
    sistema_pos="klk",
    codigo_almacen_klk="TANT"  # o "PALT"
),
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

**Última actualización:** 2025-11-17
**Tiendas KLK activas:** 3/5
**Tiendas pendientes:** 2 (ARTIGAS, PARAISO)
