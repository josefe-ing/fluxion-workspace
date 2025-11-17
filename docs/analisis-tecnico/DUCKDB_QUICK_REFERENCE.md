# DuckDB Usage Quick Reference - Fluxion AI

## Critical Migration Points

### 1. DuckDB-Specific Syntax (Find & Replace)

```sql
-- UUIDs
gen_random_uuid()::VARCHAR  →  uuid_generate_v4()::VARCHAR

-- Date Differences
DATE_DIFF('day', date1, date2)  →  (date2 - date1)::INTEGER

-- Type Casting
value::VARCHAR  →  CAST(value AS VARCHAR)

-- Parameters
WHERE id = ?  →  WHERE id = %s
```

### 2. Connection Changes (Python)

**Before (DuckDB):**
```python
import duckdb
conn = duckdb.connect(str(DB_PATH), read_only=True)
```

**After (PostgreSQL):**
```python
import psycopg2
conn = psycopg2.connect(
    host="localhost",
    database="fluxion_production",
    user="fluxion_user",
    password="...",
    port=5432
)
```

### 3. Query Parameter Style

**Before:**
```python
conn.execute("SELECT * FROM products WHERE id = ?", (product_id,))
```

**After:**
```python
conn.execute("SELECT * FROM products WHERE id = %s", (product_id,))
```

### 4. Read-Only Sessions

**Before:**
```python
conn = duckdb.connect(path, read_only=True)
```

**After:**
```python
conn = psycopg2.connect(...)
conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
# Or for transactions:
conn.execute("BEGIN TRANSACTION ISOLATION LEVEL READ ONLY;")
```

## Files to Update (Priority Order)

### Highest Priority (Core)
1. `/backend/database.py` - Connection management
2. `/backend/auth.py` - Authentication
3. `/backend/main.py` - API endpoints
4. `/etl/core/loader.py` - ETL loading
5. `/etl/core/loader_ventas.py` - Sales loading

### High Priority (Routers)
6. `/backend/routers/abc_v2_router.py` - ABC analysis
7. `/backend/routers/pedidos_sugeridos.py` - Order calculations
8. `/backend/routers/config_inventario_router.py` - Config
9. `/backend/routers/analisis_xyz_router.py` - XYZ analysis

### Medium Priority (Utilities)
10. `/backend/simple_api.py` - Inventory API
11. `/backend/etl_scheduler.py` - Scheduler
12. `/backend/forecast_pmp.py` - Forecasting

### Database Schemas (Low Priority - Minor Changes)
- All `.sql` files: Update `gen_random_uuid()` → `uuid_generate_v4()`
- Update `::VARCHAR` → `CAST(...)`
- Update `DATE_DIFF()` → subtraction

## Data Migration Strategy

### Step 1: Export DuckDB
```bash
duckdb data/fluxion_production.db ".dump" > dump.sql
```

### Step 2: Convert Dump
- Replace function calls
- Update DDL syntax
- Test on staging

### Step 3: Load PostgreSQL
```bash
psql -U fluxion_user -d fluxion_production < dump.sql
```

### Step 4: Verify
```sql
SELECT COUNT(*) FROM ventas_raw;  -- Should be 81.8M
SELECT COUNT(*) FROM items_facturas;  -- Should be 80M+
```

## Test Checklist After Migration

- [ ] Authentication login works
- [ ] ABC-v2 classification endpoint responds
- [ ] XYZ analysis returns results
- [ ] Inventory queries return correct data
- [ ] ETL scheduler can connect
- [ ] Performance: ABC calculation < 5s
- [ ] Load test: 1000 concurrent queries
- [ ] ETL ingestion rate: > 100K rows/sec

## Common Errors During Migration

### Error 1: "Operator does not exist: date - integer"
**Cause:** DateDiff format
**Fix:** Use `(date2 - date1)::INTEGER` instead

### Error 2: "Unexpected parameter style"
**Cause:** Using `?` instead of `%s`
**Fix:** Replace all `?` with `%s`

### Error 3: "Function gen_random_uuid does not exist"
**Cause:** UUID extension not loaded
**Fix:** `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`

### Error 4: "Relation already exists"
**Cause:** Double-loading schema
**Fix:** `DROP TABLE IF EXISTS table_name;` in migration

## Performance Expectations

| Operation | DuckDB | PostgreSQL | Notes |
|-----------|--------|-----------|-------|
| ABC calc (30K products) | 2-3s | 5-8s | More indexing needed |
| Inventory query (16 stores) | <100ms | <500ms | Connection overhead |
| ETL (1M rows) | 2-5s | 10-20s | Network latency factor |
| Full scan (81.8M rows) | 30-60s | 120-180s | Parallel scan opportunity |

## Connection Pooling (Recommended)

```bash
# Install PgBouncer
brew install pgbouncer  # macOS

# Configure in pgbouncer.ini
[databases]
fluxion_production = host=localhost port=5432 dbname=fluxion_production

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
```

## Key Metrics to Monitor

1. **Query Performance**
   - ABC calculation: target < 5s
   - Inventory queries: target < 500ms
   - ETL load rate: target > 50K rows/sec

2. **Connection Pool**
   - Active connections: should stay < 50
   - Wait queue: should be 0

3. **Data Integrity**
   - Row counts match DuckDB
   - Indexes used in queries
   - No duplicate keys

## Rollback Plan

Keep DuckDB instance running parallel for 1 week:
1. Update API to support dual connections
2. Compare results periodically
3. After 1 week of stable operation, decommission DuckDB
4. Archive final DuckDB backup

## Resources

- PostgreSQL Window Functions: https://www.postgresql.org/docs/current/functions-window.html
- psycopg2 Documentation: https://www.psycopg.org/
- UUID Extension: https://www.postgresql.org/docs/current/uuid-ossp.html
- Query Optimization: https://www.postgresql.org/docs/current/using-explain.html
