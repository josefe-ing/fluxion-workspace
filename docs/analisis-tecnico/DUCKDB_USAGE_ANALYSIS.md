# DuckDB Usage Analysis & PostgreSQL Migration Guide
## Fluxion AI - La Granja Mercado Inventory System

**Analysis Date:** 2025-11-12  
**Codebase:** ~16,171 backend LOC + ~16,573 ETL LOC (excluding venv)  
**Database:** DuckDB file-based OLAP (data/fluxion_production.db - 16GB+)

---

## 1. DATABASE CONNECTION PATTERNS

### 1.1 Connection Architecture

**File:** `/Users/jose/Developer/fluxion-workspace/backend/database.py`

```python
# Read-only connections (multiple simultaneous)
@contextmanager
def get_db_connection():
    conn = duckdb.connect(str(DB_PATH), read_only=True)
    yield conn

# Write connections (single per operation)
@contextmanager
def get_db_connection_write():
    conn = duckdb.connect(str(DB_PATH), read_only=False)
    yield conn
```

**Key Pattern:** Separated read/write connections to allow ETL processing without blocking API queries.

### 1.2 Connection Locations

**Backend API Files:**
- `/backend/main.py` - FastAPI app (lines 1-150+ of main.py uses connections)
- `/backend/simple_api.py` - Alternative inventory API
- `/backend/auth.py` - Authentication system
- `/backend/routers/abc_v2_router.py` - ABC classification endpoint
- `/backend/routers/analisis_xyz_router.py` - XYZ analysis
- `/backend/routers/pedidos_sugeridos.py` - Purchase order suggestions
- `/backend/routers/config_inventario_router.py` - Inventory config
- `/backend/etl_scheduler.py` - Automated ETL scheduling

**ETL Files:**
- `/etl/core/loader.py` - Base loader class
- `/etl/core/loader_ventas.py` - Sales data loader
- `/etl/core/etl_ventas_historico.py` - Historical ETL (lines 50-100)

### 1.3 Connection Method

All connections use:
```python
import duckdb
conn = duckdb.connect(str(DB_PATH), read_only=True/False)
```

No connection pooling - new connection per request (FastAPI dependency injection pattern).

---

## 2. DUCKDB-SPECIFIC SQL FEATURES

### 2.1 Supported/Used Features

#### Window Functions (HEAVILY USED)
- `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)`
- `SUM() OVER (ORDER BY ... ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`
- `LAG() OVER (ORDER BY ...)`
- `COUNT() OVER ()`

**Examples:**
- `/database/calculo_abc_v2.sql` (lines 71, 96, 102-103)
- `/database/calculo_indice_gini.sql` (LAG functions for Gini coefficient)

#### String & Type Functions
- `gen_random_uuid()` - UUID generation (used as default in table definitions)
- `::VARCHAR` - PostgreSQL-style type casting (heavily used in ABC calculations)
- `STRING_AGG()` - String aggregation for GROUP_CONCAT equivalent
- `SUBSTRING()` - String functions

#### Date/Time Functions
- `CURRENT_DATE` - Current date
- `CURRENT_TIMESTAMP` - Current timestamp
- `DATE_DIFF('day', date1, date2)` - DuckDB-specific date difference
- `INTERVAL '3 months'` - Interval arithmetic

**Example from `/database/calculo_abc_v2.sql`:**
```sql
CURRENT_DATE - INTERVAL '3 months' as fecha_inicio,
DATE_DIFF('day', r.fecha_primera_venta, p.fecha_fin) < p.dias_minimos_nuevo
```

#### CTE & Temporary Tables
- `CREATE OR REPLACE TEMPORARY TABLE` - Used for multi-step calculations
- Common Table Expressions (WITH clauses)
- Complex nested CTEs for ABC/XYZ classification

**Example:** `/database/calculo_abc_v2.sql` has 4 CTEs for Pareto classification

#### Data Types
- Standard: `VARCHAR`, `INTEGER`, `DECIMAL(12,4)`, `BOOLEAN`, `TIMESTAMP`, `DATE`
- Precision: `DECIMAL(18,2)` for monetary values
- Generated: `DEFAULT gen_random_uuid()`, `DEFAULT CURRENT_TIMESTAMP`

### 2.2 DuckDB-Specific Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `gen_random_uuid()` | Schema definitions | Default UUID generation |
| `DATE_DIFF('unit', d1, d2)` | ABC calculations | Days between dates |
| `INTERVAL` literals | Date arithmetic | Date calculations |
| `STDDEV()` | ABC value calculation | Statistical deviation |
| `STRING_AGG(col, sep)` | Aggregations | Group concatenation |

### 2.3 Advanced Features Used

#### 1. Multi-Step Window Function Calculations
**File:** `/database/calculo_abc_v2.sql` (lines 88-118)
```sql
CREATE OR REPLACE TEMPORARY TABLE productos_con_ranking AS
SELECT
    ROW_NUMBER() OVER (ORDER BY v.valor_consumo_total DESC) as ranking_valor,
    (v.valor_consumo_total * 100.0) / SUM(v.valor_consumo_total) OVER () as porcentaje_valor,
    (SUM(v.valor_consumo_total) OVER (ORDER BY v.valor_consumo_total DESC 
     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) * 100.0) /
    SUM(v.valor_consumo_total) OVER () as porcentaje_acumulado
FROM valor_consumo_productos v
```

#### 2. Gini Coefficient Calculation
**File:** `/database/calculo_indice_gini.sql`
- Uses `LAG()` window function
- Multiple aggregation levels
- Complex statistical calculation

#### 3. Substitutable Products (Hierarchical Forecasting)
**File:** `/database/schema_conjuntos_sustituibles.sql`
- View-based hierarchy: `conjuntos` -> `conjunto_productos` -> `items_facturas`
- Window functions for share distribution
- PARTITION BY for group-level calculations

#### 4. Hierarchy & Constraints
Used in multiple schemas:
```sql
FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id)
UNIQUE(conjunto_id, codigo_producto)
CONSTRAINT uk_inventario_raw UNIQUE (ubicacion_id, codigo_producto, fecha_extraccion)
```

---

## 3. SCHEMA OVERVIEW

### 3.1 Database Files (4,520 lines of SQL)

**Core Schemas:**
1. `/database/schema.sql` - Base tables (ubicaciones, productos, facturas, items_facturas)
2. `/database/schema_extended.sql` - Extended config (producto_ubicacion_config, categorias_config)
3. `/database/auth_schema.sql` - User authentication (usuarios table)
4. `/database/schema_abc_xyz.sql` - ABC/XYZ classification extensions
5. `/database/schema_conjuntos_sustituibles.sql` - Substitutable product sets
6. `/database/schema_forecast.sql` - Forecast tables
7. `/database/schema_alertas_clasificacion.sql` - Classification alerts

**Calculation Scripts:**
- `calculo_abc_v2.sql` - ABC classification by value
- `calculo_indice_gini.sql` - Inequality/concentration metrics
- `calculo_xyz.py` - XYZ classification (variability)

**Migrations:**
- `/database/migrations/001_create_config_inventario_tables.sql`
- `/database/migrations/001_create_conjuntos_sustituibles.sql`

### 3.2 Main Tables

| Table | Rows* | Columns | Purpose |
|-------|-------|---------|---------|
| `ventas_raw` | 81.8M | 50+ | Raw sales transactions |
| `items_facturas` | 80M+ | 25+ | Invoice line items |
| `facturas` | 5M | 30+ | Invoice headers |
| `productos_abc_v2` | 15K-20K | 30+ | ABC classification |
| `productos` | 30K | 25+ | Product catalog |
| `ubicaciones` | 16 | 20+ | Store locations |
| `usuarios` | ~5 | 8 | Auth users |
| `inventario_raw` | varies | 45+ | Raw inventory snapshots |
| `conjuntos` | 100+ | 8 | Product groups |

*: Estimated from typical warehouse inventory operations

---

## 4. ETL SYSTEM ARCHITECTURE

### 4.1 ETL Connection Pattern

**Main ETL Class:** `VentasLoader` in `/etl/core/loader_ventas.py`

```python
def get_connection(self) -> duckdb.DuckDBPyConnection:
    """Obtiene conexión a DuckDB"""
    conn = duckdb.connect(str(self.db_path))
    return conn
```

**ETL Data Flow:**
```
Source Systems → Extractor → Transformer → VentasLoader → DuckDB
                                                              ↓
                                           Fast OLAP Queries ← API Endpoints
```

### 4.2 ETL Scripts Using DuckDB

1. **`etl_ventas_historico.py`** (Historical sales - 81.8M records)
   - Chunked processing (1M records per chunk)
   - Multi-threaded loading (max 3 workers)
   - Monthly period processing

2. **`loader_ventas.py`** (Sales data loader)
   - Creates `ventas_raw` table (line 60)
   - Handles CSV-to-DuckDB conversion
   - Parameterized queries with `?` placeholders

3. **ETL Scheduler** in `backend/etl_scheduler.py`
   - Daily execution at 5:00 AM
   - Retry policy for failed stores
   - DuckDB queries to get active stores

### 4.3 Table Creation in ETL

**Pattern Example:** `/etl/core/loader.py` (lines 53-119)
```python
conn.execute("""
    CREATE TABLE IF NOT EXISTS inventario_raw (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        ubicacion_id VARCHAR NOT NULL,
        ...
        CONSTRAINT uk_inventario_raw UNIQUE (...)
    )
""")
```

---

## 5. API USAGE PATTERNS

### 5.1 Query Patterns

**1. Parameterized Queries (SQL Injection Prevention)**
```python
# From abc_v2_router.py
conn.execute("""
    SELECT ... FROM productos_abc_v2
    WHERE codigo_producto = ?
    AND ubicacion_id = ?
""", (codigo_producto, ubicacion_id)).fetchone()
```

**2. Fetching Data**
- `.fetchone()` - Single row
- `.fetchall()` - All rows
- Direct tuple indexing: `row[0]`, `row[1]`, etc.

**3. Multiple Queries**
- Auth: separate read + write operations
- No transactions used currently

### 5.2 Response Patterns

**Direct Pydantic Models:**
```python
class ClasificacionABCv2(BaseModel):
    codigo_producto: str
    clasificacion_abc_valor: str
    valor_consumo_total: float
    # ... 20+ fields
```

**Tuple to Model Conversion:**
```python
result = conn.execute(query).fetchone()
return ClasificacionABCv2(
    codigo_producto=result[0],
    clasificacion_abc_valor=result[1],
    # ... positional indexing
)
```

### 5.3 Backend Routes Using DuckDB

**Files:** `/backend/routers/*.py`

| Route | Method | Purpose | Connection Type |
|-------|--------|---------|-----------------|
| `/api/abc-v2/resumen` | GET | ABC summary | read_only |
| `/api/abc-v2/producto/{id}` | GET | Product classification | read_only |
| `/api/xyz/*` | GET | XYZ analysis | read_only |
| `/api/inventario/*` | GET/PUT | Inventory management | read + write |
| `/api/pedidos-sugeridos/*` | POST | Order calculations | read + write |
| `/api/config-inventario/*` | PUT | Configuration updates | write |

---

## 6. CRITICAL MIGRATION CONSIDERATIONS

### 6.1 Features Requiring Adaptation

#### 1. UUID Generation
**Current DuckDB:**
```sql
DEFAULT gen_random_uuid()
```

**PostgreSQL alternatives:**
```sql
-- Option 1: uuid extension (recommended)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DEFAULT uuid_generate_v4()

-- Option 2: Python-side generation
import uuid
DEFAULT uuid.uuid4()
```

**Impact:** HIGH - Used in all INSERT operations

---

#### 2. Date Difference Calculation
**Current DuckDB:**
```sql
DATE_DIFF('day', date1, date2)
```

**PostgreSQL:**
```sql
(date2 - date1)::INTEGER  -- Or AGE() function
```

**Impact:** MEDIUM - Used in ABC/XYZ calculations (10+ places)

---

#### 3. Type Casting
**Current DuckDB:**
```sql
gen_random_uuid()::VARCHAR
value::VARCHAR
COUNT(*)::VARCHAR
```

**PostgreSQL:**
```sql
CAST(gen_random_uuid() AS VARCHAR)
CAST(value AS VARCHAR)
CAST(COUNT(*) AS VARCHAR)
```

**Impact:** LOW - Simple find-and-replace

---

#### 4. Interval Literals
**Current DuckDB:**
```sql
CURRENT_DATE - INTERVAL '3 months'
v.fecha >= CURRENT_DATE - INTERVAL '12 weeks'
```

**PostgreSQL:**
```sql
CURRENT_DATE - INTERVAL '3 months'
v.fecha >= CURRENT_DATE - INTERVAL '12 weeks'
```

**Impact:** NONE - PostgreSQL identical syntax

---

#### 5. String Aggregation
**Current DuckDB:**
```sql
STRING_AGG(nombre, ', ') as nombres
```

**PostgreSQL:**
```sql
STRING_AGG(nombre, ', ') as nombres  -- PostgreSQL 9.0+
-- Or: array_to_string(array_agg(nombre), ', ')
```

**Impact:** MINIMAL - Same syntax in modern PostgreSQL

---

#### 6. Read-Only Connections
**Current Pattern:**
```python
conn = duckdb.connect(str(DB_PATH), read_only=True)
```

**PostgreSQL:**
```python
# No read_only parameter in psycopg2
# Instead:
conn.autocommit = False  # Begin transaction automatically
cursor.execute("BEGIN TRANSACTION ISOLATION LEVEL READ ONLY;")
```

**Impact:** MEDIUM - Requires session configuration changes

---

#### 7. Connection String Changes
**Current DuckDB:**
```python
duckdb.connect(str(DB_PATH))  # File path
```

**PostgreSQL:**
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

**Impact:** HIGH - All connection code must change

---

### 6.2 Feature Compatibility Matrix

| Feature | DuckDB | PostgreSQL | Effort |
|---------|--------|-----------|--------|
| Window Functions | ✓ Full | ✓ Full | None |
| CTEs (WITH) | ✓ | ✓ | None |
| Foreign Keys | ✓ | ✓ | None |
| Unique Constraints | ✓ | ✓ | None |
| Indexes | ✓ | ✓ | None |
| DECIMAL precision | ✓ | ✓ | None |
| TIMESTAMP | ✓ | ✓ | None |
| BOOLEAN | ✓ | ✓ | None |
| gen_random_uuid | ✓ | ✗ (use uuid_generate_v4) | Low |
| DATE_DIFF | ✓ DuckDB syntax | ✗ (use - operator) | Low |
| ::TYPE casting | ✓ | ✗ (use CAST()) | Low |
| read_only param | ✓ | ✗ (use SET TRANSACTION) | Medium |
| File-based storage | ✓ Embedded | ✗ (client-server) | High |

---

## 7. MIGRATION STRATEGY

### 7.1 Phase 1: Preparation (1-2 weeks)

1. **Extract DDL**
   - Export all schemas from DuckDB
   - Convert DDL to PostgreSQL syntax
   - Test schema creation in PostgreSQL

2. **Identify All SQL**
   - audit_sql_files.py script to find all `.execute()` calls
   - Document parameter styles (? vs %s vs :name)
   - Flag DuckDB-specific functions

3. **Create Adapter Layer**
   - New `database_pg.py` for PostgreSQL connections
   - Wrapper functions for DuckDB-specific syntax
   - Transaction management utilities

### 7.2 Phase 2: Code Conversion (2-3 weeks)

1. **Update Connection Code**
   - Replace `duckdb.connect()` with `psycopg2.connect()`
   - Implement connection pooling (pgbouncer or sqlalchemy)
   - Update read-only session handling

2. **Update Parameter Placeholders**
   - Find: `?` placeholders
   - Replace: `%s` for psycopg2 or `%(name)s` for named params
   - Example: `.execute(sql, (param1, param2))`

3. **Update Function Calls**
   - `DATE_DIFF()` → subtraction or `EXTRACT()`
   - `::TYPE` → `CAST()`
   - `gen_random_uuid()` → `uuid_generate_v4()`

4. **Test All Routes**
   - Run FastAPI endpoints
   - Verify ABC/XYZ calculations
   - Test authentication

### 7.3 Phase 3: Data Migration (1-2 days)

1. **Dump DuckDB**
   ```bash
   duckdb data/fluxion_production.db ".dump" > dump.sql
   ```

2. **Convert Dump**
   - Update DDL syntax
   - Convert function calls
   - Test on staging PostgreSQL

3. **Load Data**
   - COPY FROM for bulk load (fast)
   - Verify row counts
   - Rebuild indexes

4. **Switch Cutover**
   - Point frontend to PostgreSQL
   - Keep DuckDB as backup
   - Monitor for issues

### 7.4 Phase 4: Optimization (1-2 weeks)

1. **Add PostgreSQL-Specific Indexes**
   - Partial indexes for active=true filters
   - B-Tree indexes for lookups
   - GiST indexes for full-text search (if needed)

2. **Connection Pooling**
   - Implement PgBouncer
   - Configure connection limits
   - Monitor pool usage

3. **Monitoring**
   - pg_stat_statements for slow queries
   - Query plan analysis
   - Performance comparison with DuckDB

---

## 8. SQL FILE INVENTORY

**Total: 4,520 SQL lines across 18 files**

### Core Schemas
- `schema.sql` - Main tables (facturas, items_facturas, productos, ubicaciones)
- `schema_extended.sql` - Configuration tables
- `auth_schema.sql` - Users (8 lines)

### ABC/XYZ Analysis
- `calculo_abc_v2.sql` - Complex multi-CTE Pareto calculation
- `schema_abc_xyz.sql` - Extensions for XYZ classification
- `calculo_indice_gini.sql` - Inequality metrics (using LAG)

### Substitutable Products
- `schema_conjuntos_sustituibles.sql` - Product grouping for forecasting

### Other
- `schema_forecast.sql` - Forecast tables
- `schema_alertas_clasificacion.sql` - Classification alerts
- Migrations + supporting scripts

---

## 9. KEY CODE LOCATIONS FOR MIGRATION

### Backend Files Requiring Updates

| File | Lines | Changes Needed |
|------|-------|-----------------|
| `database.py` | 52 | Replace duckdb.connect() |
| `auth.py` | ~150 | Connection + parameter styles |
| `main.py` | ~1000 | All duckdb calls + scheduler |
| `etl_scheduler.py` | ~150 | DuckDB queries |
| `routers/abc_v2_router.py` | ~250 | Queries + parameter styles |
| `routers/pedidos_sugeridos.py` | ~400 | Complex queries |
| `simple_api.py` | ~380 | Inventory queries |
| `forecast_pmp.py` | varies | Time series calculations |

### ETL Files Requiring Updates

| File | Lines | Changes Needed |
|------|-------|-----------------|
| `core/loader.py` | ~300 | Table creation, connections |
| `core/loader_ventas.py` | ~400 | Ventas table, bulk loading |
| `core/etl_ventas_historico.py` | ~300 | ETL execution |

---

## 10. MIGRATION CHECKLIST

- [ ] Audit all duckdb.connect() calls (grep search)
- [ ] Create PostgreSQL database
- [ ] Convert schema DDL (all .sql files)
- [ ] Create adapter layer in Python
- [ ] Update all connection code
- [ ] Convert parameter placeholders (? → %s)
- [ ] Replace DATE_DIFF() calls
- [ ] Replace ::TYPE casting
- [ ] Replace gen_random_uuid()
- [ ] Implement read-only transactions
- [ ] Migrate 81.8M sales records
- [ ] Test all API endpoints
- [ ] Test ABC/XYZ calculations
- [ ] Test authentication
- [ ] Test ETL scheduler
- [ ] Implement connection pooling
- [ ] Performance tuning (indexes, query plans)
- [ ] Load testing with 16GB+ data
- [ ] Backup/cutover procedure
- [ ] Rollback plan

---

## 11. ESTIMATED EFFORT

**Total Migration: 4-6 weeks**

| Phase | Effort | Days |
|-------|--------|------|
| Preparation | Low | 7-10 |
| Code Conversion | Medium | 10-15 |
| Data Migration | Low | 1-2 |
| Testing & Optimization | Medium | 7-10 |
| **Total** | | **28-37 days** |

---

## 12. RISK ASSESSMENT

### High Risk
- 81.8M row data migration (must verify all records)
- Complex ABC/XYZ window function calculations
- ETL scheduler timing dependency
- Connection pooling configuration

### Medium Risk
- Parameter placeholder conversion (scope: 16K backend lines)
- DATE_DIFF function mapping
- Read-only transaction handling

### Low Risk
- Schema DDL conversion
- Authentication logic
- Type casting changes

---

## Summary

Fluxion AI uses DuckDB for:
- Fast OLAP queries on 80M+ sales records
- Complex analytical calculations (ABC/XYZ/Gini)
- Embedded file-based storage (16GB+)
- Substitutable product forecasting
- Real-time inventory visibility

**Main migration challenges:**
1. Parameter placeholder conversion (16K+ lines)
2. DuckDB-specific functions (gen_random_uuid, DATE_DIFF)
3. 81.8M record data migration and validation
4. Connection management pattern changes
5. Read-only transaction implementation

**Estimated effort: 4-6 weeks with proper planning**

