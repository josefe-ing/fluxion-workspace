# Migration & Analysis Scripts

Scripts one-time usados durante migración y análisis de datos de calidad.

## Contenido

### Scripts de Análisis
- `analyze_data_consistency.py` - Analiza consistencia de datos de ventas
- `analyze_data_gaps.py` - Identifica gaps en datos históricos
- `analyze_db.py` - Análisis general de base de datos
- `analyze_duplicates_deep.py` - Detección profunda de duplicados
- `show_duplicate_examples.py` - Muestra ejemplos de registros duplicados
- `test_performance.py` - Testing de performance de queries
- `validate_data_logic.py` - Validación de lógica de negocio

### Scripts de Fix
- `apply_data_model_fix.py` - Aplica correcciones al schema
- `apply_indexes.py` - Crea índices en DuckDB
- `check_duplicates.py` - Verificación de duplicados

### SQL
- `create_indexes.sql` - Definiciones de índices
- `fix_data_model.sql` - Correcciones de schema SQL
- `query_examples.sql` - Queries de ejemplo para análisis

## Database

Todos los scripts conectan a DuckDB: `data/fluxion_production.db`

## Status

**Archivados para referencia.** No son parte del sistema activo.

Estos scripts fueron utilizados durante:
- Migración de sistema legacy
- Limpieza de datos históricos
- Análisis de calidad de datos
- Optimización de performance

## Uso

Si necesitas ejecutar alguno:

```bash
cd archive/migration-scripts
python3 analyze_data_gaps.py
```

**Nota:** Asegúrate de que `data/fluxion_production.db` existe antes de ejecutar.
