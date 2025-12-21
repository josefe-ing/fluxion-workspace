# Plan de Eliminación Completa de DuckDB

## ✅ COMPLETADO - Diciembre 2025

**El ETL YA escribe en PostgreSQL.** El script principal `etl/etl_ventas_postgres.py`:
- Tiendas KLK → `PostgreSQLVentasLoader` (PostgreSQL)
- Tiendas Stellar → `VentasLoader.load_ventas_postgresql()` (PostgreSQL)

---

## Estado de Ejecución

### FASE 1: Backup ✅
La base de datos `data/fluxion_production.db` está en `.gitignore` - se mantiene localmente.

### FASE 2: Eliminar Dependencia de Python ✅
```
etl/requirements.txt → duckdb==1.0.0 REMOVIDO
```

### FASE 3: Limpiar ETL Core ✅

| Archivo | Estado |
|---------|--------|
| `etl/core/db_config.py` | ✅ Simplificado a PostgreSQL only |
| `etl/core/db_manager.py` | ✅ Eliminado código DuckDB |
| `etl/core/loader_ventas.py` | ✅ Solo PostgreSQL |
| `etl/core/loader_inventario.py` | ✅ Wrapper que usa PostgreSQLInventarioLoader |
| `etl/core/etl_tracker.py` | ✅ Migrado a PostgreSQL |
| `etl/core/etl_inventario_klk.py` | ✅ Documentación actualizada |
| `etl/core/etl_ventas_klk.py` | ✅ Documentación actualizada |

### FASE 4: Eliminar Archivos database/ ✅
Archivos DuckDB-only eliminados. PostgreSQL migrations conservadas.

### FASE 5: Eliminar Directorio archive/ ✅
```bash
rm -rf archive/  # COMPLETADO
```

### FASE 6: Eliminar Scripts de Utilidad ✅
Scripts DuckDB-only eliminados.

### FASE 7: Limpiar Shell Scripts ✅
- `etl/scripts/install_dependencies.sh` - Actualizado para verificar psycopg2 en lugar de duckdb

### FASE 8: Limpiar Variables de Entorno ✅
Ya no había referencias a DATABASE_PATH en los archivos .env.

### FASE 9: Actualizar Documentación ✅
- `CLAUDE.md` - Actualizado a arquitectura PostgreSQL
- `.gitignore` - Limpiado

### FASE 10: Validaciones ✅

| Validación | Estado |
|------------|--------|
| Backend inicia sin errores | ✅ |
| Frontend compila sin errores | ✅ |
| No hay módulos duckdb cargados | ✅ |
| Conexión a PostgreSQL funciona | ✅ |
| No hay imports rotos de duckdb | ✅ |

---

## Resumen de Cambios Realizados

| Tipo | Cantidad |
|------|----------|
| Archivos ELIMINADOS | ~80+ |
| Archivos MODIFICADOS | ~15 |
| Directorios ELIMINADOS | 1 (`archive/`) |
| Dependencias removidas | 1 (`duckdb`) |

---

## Impacto en Costos AWS

### Recursos que PODRÍAN eliminarse (requiere cambios en infraestructura):

| Recurso | Uso Actual | Costo Estimado/Mes | Acción Posible |
|---------|------------|-------------------|----------------|
| **EFS (fluxion-data)** | Almacenar DuckDB (16GB) | ~$5-10/mes | ELIMINAR si no hay más uso |
| **EBS Volume (25-30GB)** | Backup de .db | ~$3/mes | ELIMINAR |
| **S3 Backups** | Backups de DuckDB | Variable | Limpiar archivos .db |

### FASE 11: Eliminar EFS del Infrastructure Stack ✅

**Completado el 21 de Diciembre de 2025**

Cambios realizados en `infrastructure/lib/infrastructure-stack.ts`:

1. **EFS FileSystem y AccessPoint eliminados** - Ya no se crea el recurso
2. **Volúmenes EFS removidos de todas las task definitions**:
   - Backend Task: Sin volumen EFS
   - ETL Task: Sin volumen EFS
   - Ventas ETL Task: Sin volumen EFS
3. **Mount points eliminados** de todos los containers
4. **Grants de EFS eliminados** de todos los task roles
5. **Security group connections a EFS eliminadas**

**Reducción de recursos:**
- Backend Task: 4GB → 2GB RAM, 2 vCPU → 1 vCPU
- ETL Task: 4GB → 2GB RAM, 2 vCPU → 1 vCPU
- Ventas ETL Task: 4GB → 2GB RAM, 2 vCPU → 1 vCPU

**Ahorro estimado:** ~$5-10/mes (EFS) + ~$20-30/mes (Fargate compute reducido)

**NOTA:** El EFS existente en AWS (fluxion-data) tiene `removalPolicy: RETAIN`, por lo que NO se eliminará automáticamente con el deploy. Debe eliminarse manualmente desde la consola AWS si se desea.

---

## Notas Técnicas

### Compatibilidad con código existente

La clase `DuckDBLoader` en `loader_inventario.py` se mantiene como **wrapper de compatibilidad** que internamente usa `PostgreSQLInventarioLoader`. Esto permite que el código existente que importa `DuckDBLoader` siga funcionando sin cambios, mientras internamente todo usa PostgreSQL.

```python
# loader_inventario.py
class DuckDBLoader:
    """
    Cargador de datos - PostgreSQL (wrapper de compatibilidad)
    NOTA: Esta clase mantiene el nombre DuckDBLoader por compatibilidad con
    código existente, pero internamente usa PostgreSQLInventarioLoader.
    """
    def __init__(self, db_path=None):
        # Ignorar db_path - ya no usamos DuckDB
        self._postgres_loader = PostgreSQLInventarioLoader()
```

### Archivos en etl/archive/

El directorio `etl/archive/` **NO fue eliminado** - contiene código activo que puede ser referenciado. Solo se eliminó el directorio `archive/` en la raíz del proyecto.

---

## Fecha de Completado

**21 de Diciembre de 2025**
