# DuckDB to PostgreSQL Migration Documentation

## Overview

This directory contains comprehensive documentation for understanding how DuckDB is currently used in the Fluxion AI system and how to migrate to PostgreSQL.

## Documents Included

### 1. DUCKDB_USAGE_ANALYSIS.md (18 KB, 663 lines)
**Comprehensive technical analysis**

The main reference document covering:
- Complete database connection patterns (read/write separation)
- All DuckDB-specific SQL features used (window functions, CTEs, DATE_DIFF, gen_random_uuid)
- Full schema overview (18 SQL files, 4,520 lines)
- ETL architecture and 81.8M record data handling
- API usage patterns and all routes using DuckDB
- 7 critical migration considerations with specific examples
- Feature compatibility matrix (PostgreSQL support)
- 4-phase migration strategy (Preparation, Code, Data, Optimization)
- Complete migration checklist
- Estimated 4-6 weeks total effort

**Use this for:** Understanding the complete picture before starting migration

### 2. DUCKDB_QUICK_REFERENCE.md (5 KB, 200 lines)
**Quick find-and-replace guide**

Essential migration lookup including:
- Critical DuckDB-specific syntax (gen_random_uuid, DATE_DIFF, ::TYPE casting)
- Before/after code examples for all connection changes
- Priority-ordered list of files to update (12 files)
- Data migration step-by-step
- Test checklist after migration
- Common errors and solutions
- Performance expectations
- Connection pooling setup (PgBouncer)

**Use this for:** Day-to-day migration work and quick lookups

### 3. DUCKDB_CODE_LOCATIONS.md (11 KB, 407 lines)
**Exact file references with line numbers**

Detailed breakdown of every DuckDB connection point:
- 18 specific code locations with exact file paths and line numbers
- Code snippets showing exact patterns used
- Migration impact assessment for each file
- Summary of which files need highest priority attention
- Total code scope: 37,264 lines affected

**Use this for:** Planning conversion tasks and estimating effort per file

## Quick Start

### If you have 5 minutes:
Read: **DUCKDB_QUICK_REFERENCE.md** (DuckDB-specific syntax section)

### If you have 30 minutes:
Read: **DUCKDB_USAGE_ANALYSIS.md** (Sections 1-3: Connections, SQL Features, Schema Overview)

### If you have 2 hours:
Read: All three documents in order

### If you're starting migration:
1. Open **DUCKDB_CODE_LOCATIONS.md**
2. Use **DUCKDB_QUICK_REFERENCE.md** for syntax conversions
3. Reference **DUCKDB_USAGE_ANALYSIS.md** for complex patterns

## Key Findings Summary

### Database Statistics
- **Size:** 16GB+ file-based DuckDB
- **Records:** 81.8M sales records (ventas_raw)
- **Tables:** 18 main tables + views
- **Connection Model:** Separated read/write (read_only parameter)
- **Parameter Style:** DuckDB `?` placeholders (must change to PostgreSQL `%s`)

### DuckDB-Specific Features Used
1. **gen_random_uuid()** - UUID generation (30+ occurrences)
2. **DATE_DIFF('day', d1, d2)** - Date math (15+ occurrences)
3. **::VARCHAR** - Type casting (50+ occurrences)
4. **Window Functions** - ROW_NUMBER, SUM() OVER, LAG() (heavily used)
5. **CTEs** - CREATE OR REPLACE TEMPORARY TABLE (ABC/XYZ calculations)
6. **read_only=True** - Connection parameter (must use transactions instead)

### Critical Code Areas (Priority Order)
1. `/backend/database.py` - Connection management (52 lines) - **HIGH**
2. `/backend/auth.py` - Authentication (450 lines) - **HIGH**
3. `/backend/main.py` - FastAPI app (1700 lines) - **HIGH**
4. `/etl/core/loader.py` - ETL loading (300 lines) - **HIGH**
5. `/etl/core/loader_ventas.py` - Sales loader (400 lines) - **HIGH**
6. `/backend/routers/*.py` - API routers (1000+ lines) - **MEDIUM**
7. Database schemas (4,520 SQL lines) - **MEDIUM**

### Estimated Effort: 4-6 Weeks
- **Preparation:** 1-2 weeks (DDL conversion, adapter layer)
- **Code Conversion:** 2-3 weeks (16K+ backend lines)
- **Data Migration:** 1-2 days (81.8M rows)
- **Testing & Optimization:** 1-2 weeks (indexes, pooling, tuning)

### Migration Challenges
1. **High:** Parameter placeholder conversion (200+ locations)
2. **High:** 81.8M record verification
3. **Medium:** DATE_DIFF function replacement
4. **Medium:** Read-only transaction implementation
5. **Medium:** Connection pooling setup

## Migration Checklist Template

```
Phase 1: Preparation (Days 1-10)
[ ] Extract all DuckDB schema (`.dump` command)
[ ] Convert DDL to PostgreSQL syntax (find-replace utilities)
[ ] Create adapter layer (database_pg.py)
[ ] Test schema in PostgreSQL staging
[ ] Document all DuckDB-specific functions found

Phase 2: Code Conversion (Days 11-25)
[ ] Update database.py (connection management)
[ ] Update auth.py (authentication module)
[ ] Update main.py (FastAPI app)
[ ] Convert parameter placeholders (? → %s) in all files
[ ] Replace DATE_DIFF() calls
[ ] Replace ::VARCHAR casting
[ ] Replace gen_random_uuid()
[ ] Update ETL loaders
[ ] Test all API endpoints

Phase 3: Data Migration (Days 26-27)
[ ] Dump DuckDB data
[ ] Convert dump format
[ ] Load into PostgreSQL
[ ] Verify row counts match
[ ] Rebuild indexes

Phase 4: Testing & Optimization (Days 28-37)
[ ] Run full test suite
[ ] Performance testing
[ ] Load testing (1000 concurrent)
[ ] Implement connection pooling (PgBouncer)
[ ] Monitor slow queries
[ ] Clean up and optimize
```

## File Structure

```
fluxion-workspace/
├── DUCKDB_MIGRATION_README.md        (This file)
├── DUCKDB_USAGE_ANALYSIS.md          (Main reference - 663 lines)
├── DUCKDB_QUICK_REFERENCE.md         (Quick lookup - 200 lines)
├── DUCKDB_CODE_LOCATIONS.md          (Exact file refs - 407 lines)
├── backend/
│   ├── database.py                   (Connection management)
│   ├── auth.py                       (Authentication)
│   ├── main.py                       (FastAPI app)
│   ├── etl_scheduler.py              (Scheduler)
│   └── routers/                      (API routes)
├── etl/
│   └── core/
│       ├── loader.py                 (Base loader)
│       ├── loader_ventas.py          (Sales loader)
│       └── etl_ventas_historico.py   (Historical ETL)
└── database/
    ├── schema.sql                    (Base schema)
    ├── calculo_abc_v2.sql            (ABC calculation)
    ├── schema_abc_xyz.sql            (XYZ extension)
    └── ... (15+ more schema files)
```

## Key Statistics

| Metric | Value |
|--------|-------|
| Total Lines of Code | 37,264 |
| Backend Python LOC | 16,171 |
| ETL Python LOC | 16,573 |
| SQL LOC | 4,520 |
| Number of Python Files | 25+ |
| Number of SQL Files | 18 |
| DuckDB Connections | 25+ locations |
| Parameter Placeholders | 200+ |
| Window Functions | 50+ |
| Records in ventas_raw | 81.8M |
| Data Size | 16GB+ |
| Estimated Migration Effort | 28-37 days |

## Next Steps

### Immediate (Today)
1. Read this README
2. Skim DUCKDB_USAGE_ANALYSIS.md (sections 1-3)
3. Save DUCKDB_QUICK_REFERENCE.md for daily reference

### Short Term (This Week)
1. Extract DuckDB schema using `.dump`
2. Create PostgreSQL staging instance
3. Test DDL conversion script
4. Create database adapter layer

### Medium Term (Next 2 Weeks)
1. Update connection code (database.py, auth.py)
2. Convert all parameter placeholders
3. Update date/type functions
4. Test API endpoints incrementally

### Long Term (Weeks 3-4)
1. Perform data migration
2. Implement connection pooling
3. Performance testing and tuning
4. Cutover and monitoring

## Getting Help

### Syntax Questions
- Check **DUCKDB_QUICK_REFERENCE.md** section 1 (DuckDB-specific Syntax)
- PostgreSQL Docs: https://www.postgresql.org/docs/current/

### Code Location Questions
- See **DUCKDB_CODE_LOCATIONS.md** (exact file paths + line numbers)

### Architecture Questions
- See **DUCKDB_USAGE_ANALYSIS.md** (sections 1-5)

### Migration Strategy Questions
- See **DUCKDB_USAGE_ANALYSIS.md** (section 7)

## Success Criteria

After migration, verify:
- [ ] All 81.8M rows migrated correctly
- [ ] ABC calculation completes in < 5 seconds
- [ ] API response time < 500ms
- [ ] ETL load rate > 50K rows/sec
- [ ] Connection pool active < 50 connections
- [ ] No SQL injection vulnerabilities
- [ ] All tests pass

## Reference Links

- PostgreSQL Window Functions: https://www.postgresql.org/docs/current/functions-window.html
- psycopg2 Documentation: https://www.psycopg.org/
- UUID Extension: https://www.postgresql.org/docs/current/uuid-ossp.html
- Query Optimization: https://www.postgresql.org/docs/current/using-explain.html
- PgBouncer: https://www.pgbouncer.org/

---

**Generated:** 2025-11-12  
**Analysis Scope:** Backend (16.1K LOC) + ETL (16.5K LOC) + Database (4.5K SQL)  
**Estimated Migration Effort:** 4-6 weeks
