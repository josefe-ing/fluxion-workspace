# DuckDB Code Locations - Exact File References

## All DuckDB Connection Points

### 1. Backend Database Module
**File:** `/Users/jose/Developer/fluxion-workspace/backend/database.py` (52 lines)

```python
# Lines 16-32: Read-only connections (for API queries)
@contextmanager
def get_db_connection():
    conn = duckdb.connect(str(DB_PATH), read_only=True)
    yield conn

# Lines 35-51: Write connections (for INSERT/UPDATE/DELETE)
@contextmanager
def get_db_connection_write():
    conn = duckdb.connect(str(DB_PATH), read_only=False)
    yield conn
```

**Migration Impact:** HIGH - Core connection management

---

### 2. Authentication System
**File:** `/Users/jose/Developer/fluxion-workspace/backend/auth.py` (~450 lines)

**Read Connections (Lines 61-80):**
```python
@contextmanager
def get_auth_db_connection():
    conn = duckdb.connect(str(DB_PATH), read_only=True)
    yield conn

# Usage in authenticate_user() - Line 115-120
with get_auth_db_connection() as conn:
    result = conn.execute("""
        SELECT id, username, password_hash, nombre_completo, email, activo
        FROM usuarios
        WHERE username = ? AND activo = true
    """, (username,)).fetchone()
```

**Write Connections (Lines 82-101):**
```python
# Lines 133-138: Update ultimo_login
with get_auth_db_connection_write() as conn_write:
    conn_write.execute("""
        UPDATE usuarios
        SET ultimo_login = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (user_id,))
```

**Migration Impact:** MEDIUM - Parameter placeholders (?) + connection type

---

### 3. Main FastAPI Application
**File:** `/Users/jose/Developer/fluxion-workspace/backend/main.py` (~1700 lines)

**Key Sections:**

**ETL Scheduler Initialization (Lines 88-104):**
```python
db_path = Path(__file__).parent.parent / "data" / "fluxion_production.db"
ventas_scheduler = VentasETLScheduler(
    db_path=str(db_path),
    execution_hour=5,
    execution_minute=0
)
```

**Routers with DuckDB:**
- Line 132: `app.include_router(pedidos_sugeridos_router)`
- Line 133: `app.include_router(analisis_xyz_router)`
- Line 134: `app.include_router(config_inventario_router)`
- Line 135: `app.include_router(abc_v2_router)`

**Migration Impact:** HIGH - Scheduler + multiple routers

---

### 4. ABC v2 Classification Router
**File:** `/Users/jose/Developer/fluxion-workspace/backend/routers/abc_v2_router.py` (~250 lines)

**Read-Only Connections (Lines 60-95):**
```python
# Line 61
conn = duckdb.connect(str(DB_PATH), read_only=True)

# Lines 80-92: Parameterized query with WHERE clause
query = f"""
SELECT ...
FROM productos_abc_v2
WHERE clasificacion_abc_valor IN ('A', 'B', 'C')
{where_clause}
"""
result = conn.execute(query).fetchone()

# Lines 125-130: Using parameter placeholders
where_clause = "WHERE codigo_producto = ?"
params = [codigo_producto]
if ubicacion_id:
    where_clause += " AND ubicacion_id = ?"
    params.append(ubicacion_id)
```

**Migration Impact:** HIGH - Parameter placeholders throughout

---

### 5. XYZ Analysis Router
**File:** `/Users/jose/Developer/fluxion-workspace/backend/routers/analisis_xyz_router.py` (~200 lines)

Similar pattern to abc_v2_router:
- Read-only connections
- Parameter placeholders
- Window function queries (CV calculations)

**Migration Impact:** MEDIUM - Parameter conversion

---

### 6. Purchase Orders Router
**File:** `/Users/jose/Developer/fluxion-workspace/backend/routers/pedidos_sugeridos.py` (~400 lines)

**Dependency Injection (Lines 48-57):**
```python
def get_db():
    with get_db_connection() as conn:
        yield conn

def get_db_write():
    with get_db_connection_write() as conn:
        yield conn
```

**Usage Throughout:**
- Multiple complex queries
- Parameter placeholders
- Window functions for calculations

**Migration Impact:** MEDIUM - Complex query patterns

---

### 7. Inventory Configuration Router
**File:** `/Users/jose/Developer/fluxion-workspace/backend/routers/config_inventario_router.py` (~300 lines)

**Pattern:** Similar to other routers
- Read/write connections
- Parameter placeholders
- UPDATE/INSERT operations

**Migration Impact:** MEDIUM

---

### 8. Simple Inventory API
**File:** `/Users/jose/Developer/fluxion-workspace/backend/simple_api.py` (~382 lines)

**Connection Management (Lines 70-74):**
```python
def get_db():
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Base de datos no encontrada")
    return duckdb.connect(str(DB_PATH))
```

**Query Examples (Lines 87-98, 138-161):**
```python
# Non-parameterized query (potential SQL injection risk)
result = conn.execute("""
    SELECT DISTINCT ...
    FROM inventario_raw
    WHERE ubicacion_id = ?
""", (ubicacion_id,)).fetchall()
```

**Migration Impact:** MEDIUM - Inconsistent connection pattern

---

### 9. ETL Scheduler
**File:** `/Users/jose/Developer/fluxion-workspace/backend/etl_scheduler.py` (~300 lines)

**Connection in Scheduler (Lines 120-130):**
```python
def _get_all_tiendas(self) -> List[str]:
    try:
        conn = duckdb.connect(str(self.db_path), read_only=True)
        query = """
            SELECT DISTINCT ubicacion_id
            FROM ventas_raw
            ORDER BY ubicacion_id
        """
        result = conn.execute(query).fetchall()
        conn.close()
```

**Migration Impact:** MEDIUM - Scheduling logic depends on DuckDB

---

### 10. Forecast PMP Module
**File:** `/Users/jose/Developer/fluxion-workspace/backend/forecast_pmp.py` (~200 lines)

**DuckDB Integration:**
- Time series calculations
- Rolling average queries
- Weekly/monthly aggregations

**Migration Impact:** LOW-MEDIUM - May need optimization for PostgreSQL

---

## ETL System Connections

### 11. Base Loader Class
**File:** `/Users/jose/Developer/fluxion-workspace/etl/core/loader.py` (~300 lines)

**Connection Method (Lines 37-44):**
```python
def get_connection(self) -> duckdb.DuckDBPyConnection:
    try:
        conn = duckdb.connect(str(self.db_path))
        return conn
    except Exception as e:
        self.logger.error(f"Error conectando a DuckDB: {str(e)}")
        raise
```

**Table Creation (Lines 53-119):**
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

**Migration Impact:** HIGH - UUID defaults + constraint patterns

---

### 12. Sales Data Loader
**File:** `/Users/jose/Developer/fluxion-workspace/etl/core/loader_ventas.py` (~400 lines)

**Connection (Lines 39-46):**
```python
def get_connection(self) -> duckdb.DuckDBPyConnection:
    try:
        conn = duckdb.connect(str(self.db_path))
        return conn
    except Exception as e:
        self.logger.error(f"Error conectando a DuckDB: {str(e)}")
        raise
```

**Table Creation (Lines 59-145):**
```python
# Ventas table with 50+ columns
conn.execute("""
    CREATE TABLE IF NOT EXISTS ventas_raw (
        numero_factura VARCHAR,
        ubicacion_id VARCHAR,
        ubicacion_nombre VARCHAR,
        ...
    )
""")
```

**Migration Impact:** HIGH - 81.8M record table

---

### 13. Historical ETL
**File:** `/Users/jose/Developer/fluxion-workspace/etl/core/etl_ventas_historico.py` (~300 lines)

**Initialization (Lines 50-66):**
```python
class VentasETLHistorico:
    def __init__(self, chunk_size: int = 1000000, max_workers: int = 3):
        self.chunk_size = chunk_size
        self.max_workers = max_workers
        self.resultados = []
        self.stats_globales = {...}
```

**ETL Orchestration:**
- Monthly period processing
- Multi-threaded loading
- DuckDB connections per thread

**Migration Impact:** MEDIUM - Threading model may need adjustment

---

## Database Schema Files

### 14. Core Schema
**File:** `/Users/jose/Developer/fluxion-workspace/database/schema.sql`

**Key Features:**
- Foreign keys (REFERENCES)
- Constraints (UNIQUE, PRIMARY KEY)
- Timestamp defaults

**Migration Impact:** LOW - Standard SQL

---

### 15. ABC v2 Calculation
**File:** `/Users/jose/Developer/fluxion-workspace/database/calculo_abc_v2.sql` (~250 lines)

**Critical Patterns (Lines 88-118):**
- Window functions: ROW_NUMBER(), SUM() OVER
- CTEs: CREATE OR REPLACE TEMPORARY TABLE
- Date calculations: DATE_DIFF('day', date1, date2)
- Type casting: gen_random_uuid()::VARCHAR

**Migration Impact:** MEDIUM - DATE_DIFF + casting changes needed

---

### 16. XYZ Classification
**File:** `/Users/jose/Developer/fluxion-workspace/database/schema_abc_xyz.sql`

**Features:**
- Window functions for XYZ classification
- LAG() for variability calculation
- Multiple ranking views

**Migration Impact:** MEDIUM - Window functions (compatible)

---

### 17. Gini Coefficient
**File:** `/Users/jose/Developer/fluxion-workspace/database/calculo_indice_gini.sql`

**Advanced Features (Heavy Use of Window Functions):**
- LAG() OVER (ORDER BY ranking)
- Multiple aggregation levels
- Complex statistical formulas

**Migration Impact:** LOW - Window functions work in PostgreSQL

---

### 18. Substitutable Products
**File:** `/Users/jose/Developer/fluxion-workspace/database/schema_conjuntos_sustituibles.sql`

**Hierarchy:**
- conjuntos table
- conjunto_productos table
- Views with PARTITION BY calculations

**Migration Impact:** LOW-MEDIUM - Relationship intact

---

## Summary by Migration Effort

### HIGHEST PRIORITY (Must change)
1. `/backend/database.py` - Connection management
2. `/etl/core/loader.py` - UUID generation
3. `/etl/core/loader_ventas.py` - UUID + table creation
4. All parameter placeholders (? → %s) - 100+ locations

### HIGH PRIORITY (Important changes)
5. `/backend/auth.py` - Connection + parameters
6. `/backend/routers/abc_v2_router.py` - Parameters
7. `/database/calculo_abc_v2.sql` - DATE_DIFF + casting
8. `/backend/main.py` - Scheduler dependencies

### MEDIUM PRIORITY (Standard updates)
9. `/backend/routers/pedidos_sugeridos.py` - Parameters
10. `/backend/routers/analisis_xyz_router.py` - Parameters
11. `/backend/simple_api.py` - Inconsistent patterns
12. `/backend/etl_scheduler.py` - Connection pattern

### LOW PRIORITY (Minor updates)
13. Other routers and utilities
14. Schema files (mostly standard SQL)
15. Calculation scripts (window functions work as-is)

---

## Total Code to Update

- **Backend Python:** 16,171 lines (parameter placeholders primarily)
- **ETL Python:** 16,573 lines (connections + table creation)
- **SQL Files:** 4,520 lines (UUID + date functions)
- **Total:** 37,264 lines affected

**Estimated Regex Find & Replace Operations:**
1. `gen_random_uuid()` → ~30 occurrences
2. `DATE_DIFF('day',...` → ~15 occurrences
3. `::VARCHAR` → ~50 occurrences
4. `?` parameter style → ~200 occurrences in Python
5. `duckdb.connect` → ~25 occurrences

