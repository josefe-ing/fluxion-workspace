# Plan de Migración: DuckDB → PostgreSQL RDS

## 📋 Resumen Ejecutivo

**Objetivo**: Migrar Fluxion AI de DuckDB embebido (16GB) a PostgreSQL RDS managed.

**Motivación**: DuckDB requiere memory-mapping del archivo completo, causando OOM en contenedores Fargate. Incluso con 8GB RAM el backend crashea (exit code 137).

**Estrategia**: Schema-first migration - empezar con estructura vacía, poblar vía ETL.

---

## 🎯 Alcance de la Migración

### Datos Actuales
- **DuckDB file size**: 16GB (`fluxion_production.db`)
- **Records**: 81M+ ventas, 16 ubicaciones, catálogo completo de productos
- **Estructura**: 12 tablas + 2 vistas

### Arquitectura Objetivo
```
┌─────────────────────────────────────────────────────────────┐
│                    AWS Architecture                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐         ┌─────────────────────┐          │
│  │ ECS Fargate  │────────▶│  PostgreSQL RDS     │          │
│  │ Backend API  │         │  (db.t3.medium)     │          │
│  │ 2GB RAM      │         │  100GB storage      │          │
│  └──────────────┘         └─────────────────────┘          │
│                                                              │
│  ┌──────────────┐         ┌─────────────────────┐          │
│  │ ECS Task     │────────▶│  PostgreSQL RDS     │          │
│  │ ETL Processes│         │  (same instance)    │          │
│  │ 4GB RAM      │         └─────────────────────┘          │
│  └──────────────┘                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Análisis de Schema

### Tablas a Migrar (12 tablas)

#### 1. Tablas Maestras (Prioridad Alta)
```sql
ubicaciones              -- 16 rows (tiendas/CEDIs)
productos                -- ~50K productos
categorias_config        -- ~200 categorías
proveedores              -- ~100 proveedores
```

#### 2. Tablas de Configuración (Prioridad Alta)
```sql
producto_ubicacion_config  -- ~800K combinaciones (50K × 16)
producto_proveedor_config  -- ~150K relaciones
```

#### 3. Tablas Transaccionales (Prioridad Media - ETL)
```sql
facturas                 -- ~20M facturas
items_facturas           -- ~81M líneas
movimientos_inventario   -- ~100M movimientos
stock_actual             -- ~800K combinaciones
```

#### 4. Tablas de Soporte (Prioridad Baja)
```sql
conjuntos_sustituibles       -- ~500 conjuntos
productos_abc_v2_historico   -- ~1M registros históricos
```

#### 5. Vistas (Recrear en PostgreSQL)
```sql
productos_ubicacion_completa  -- Vista denormalizada
alertas_inventario            -- Vista de alertas
```

---

## 🔧 Diferencias DuckDB vs PostgreSQL

### Tipos de Datos a Convertir

| DuckDB | PostgreSQL | Notas |
|--------|-----------|-------|
| `VARCHAR` (sin límite) | `VARCHAR(n)` o `TEXT` | Definir límites apropiados |
| `DECIMAL(18,2)` | `NUMERIC(18,2)` | Compatible directo |
| `TIMESTAMP` | `TIMESTAMP` | Compatible directo |
| `DATE` | `DATE` | Compatible directo |
| `TIME` | `TIME` | Compatible directo |
| `BOOLEAN` | `BOOLEAN` | Compatible directo |
| `INTEGER` | `INTEGER` | Compatible directo |

### Sintaxis a Ajustar

**DEFAULT CURRENT_TIMESTAMP**
```sql
-- DuckDB
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

-- PostgreSQL
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```
✅ Compatible directo

**CHECK Constraints**
```sql
-- DuckDB
CHECK (calificacion_calidad BETWEEN 1 AND 5)

-- PostgreSQL
CHECK (calificacion_calidad BETWEEN 1 AND 5)
```
✅ Compatible directo

**FOREIGN KEYS**
```sql
-- DuckDB
FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id)

-- PostgreSQL
FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id)
```
✅ Compatible directo

**Índices Condicionales**
```sql
-- DuckDB
CREATE INDEX idx_stock_reposicion ON stock_actual(requiere_reposicion)
WHERE requiere_reposicion = true;

-- PostgreSQL
CREATE INDEX idx_stock_reposicion ON stock_actual(requiere_reposicion)
WHERE requiere_reposicion = true;
```
✅ Compatible directo

**Vistas con INTERVAL**
```sql
-- DuckDB
WHERE fecha_proximo_vencimiento <= CURRENT_DATE + INTERVAL 30 DAY

-- PostgreSQL
WHERE fecha_proximo_vencimiento <= CURRENT_DATE + INTERVAL '30 days'
```
⚠️ Requiere ajuste de sintaxis

---

## 🏗️ Arquitectura PostgreSQL RDS

### Especificaciones Recomendadas

**Instancia RDS**
- **Engine**: PostgreSQL 16.x (latest)
- **Instance Class**: `db.t3.medium` (2 vCPU, 4GB RAM)
  - Start small, scale up if needed
  - Burst capability con T3
- **Storage**: 100GB gp3 (scalable to 500GB)
  - 3000 IOPS baseline
  - Auto-scaling habilitado
- **Multi-AZ**: No (para staging), Yes (para production)
- **Backup Retention**: 7 days
- **Encryption**: KMS enabled (match con EFS actual)

**Network Configuration**
- **VPC**: Misma VPC que ECS cluster actual
- **Subnets**: Private subnets (2 AZs)
- **Security Group**:
  - Inbound: Port 5432 desde ECS tasks security group
  - Outbound: All traffic

**Connection Pooling**
- **RDS Proxy**: Opcional (evaluar después de migration)
  - Reduce connection overhead
  - Mejor para serverless/lambda
  - Costo adicional: ~$0.015/hr

### Costos Estimados (us-east-1)

```
db.t3.medium:        ~$61/month  (2 vCPU, 4GB RAM)
Storage 100GB gp3:   ~$11/month  (sin IOPS adicionales)
Backup 100GB:        ~$10/month  (7 days retention)
KMS encryption:      ~$1/month   (key + requests)
─────────────────────────────────
TOTAL:               ~$83/month

Comparación con DuckDB en EFS:
- EFS storage 16GB:  ~$5/month
- Pero requiere 8GB+ RAM en Fargate = $45/month adicional
- PostgreSQL es ~$33/month más caro pero más escalable
```

---

## 📝 Schema PostgreSQL (DDL)

### Conversiones Específicas

**VARCHAR sin límite → VARCHAR(n)**
```sql
-- DuckDB
descripcion VARCHAR(200)
codigo VARCHAR(50)
id VARCHAR PRIMARY KEY

-- PostgreSQL (recomendado)
descripcion VARCHAR(200)     -- mantener límites explícitos
codigo VARCHAR(50)           -- mantener límites
id VARCHAR(50) PRIMARY KEY   -- agregar límite razonable
```

**TEXT para campos largos**
```sql
-- Campos sin límite claro → TEXT
descripcion_extendida TEXT
observaciones TEXT
direccion TEXT
```

**SERIAL para IDs numéricos (opcional)**
```sql
-- Si decides migrar de VARCHAR a SERIAL
id SERIAL PRIMARY KEY        -- auto-increment
-- Pero mantener VARCHAR es más simple para migración
```

### Índices a Crear

Mantener todos los índices actuales del schema DuckDB:

```sql
-- Índices principales (performance crítico)
CREATE INDEX idx_facturas_fecha_ubicacion
  ON facturas(fecha, ubicacion_id);

CREATE INDEX idx_items_fecha_producto
  ON items_facturas(fecha, producto_id);

CREATE INDEX idx_movimientos_fecha_ubicacion_producto
  ON movimientos_inventario(fecha, ubicacion_id, producto_id);

-- Índices de configuración
CREATE INDEX idx_producto_ubicacion_activo
  ON producto_ubicacion_config(ubicacion_id, activo);

CREATE INDEX idx_productos_categoria
  ON productos(categoria, activo);

CREATE INDEX idx_productos_abc
  ON productos(abc_classification, activo);

-- Índices de stock
CREATE INDEX idx_stock_ubicacion
  ON stock_actual(ubicacion_id);

CREATE INDEX idx_stock_reposicion
  ON stock_actual(requiere_reposicion)
  WHERE requiere_reposicion = true;  -- partial index

-- Índices de conjuntos
CREATE INDEX idx_conjuntos_nombre
  ON conjuntos_sustituibles(nombre);

CREATE INDEX idx_conjuntos_categoria
  ON conjuntos_sustituibles(categoria);

-- Índices de histórico ABC-XYZ
CREATE INDEX idx_historico_codigo
  ON productos_abc_v2_historico(codigo_producto);

CREATE INDEX idx_historico_ubicacion
  ON productos_abc_v2_historico(ubicacion_id);

CREATE INDEX idx_historico_fecha
  ON productos_abc_v2_historico(fecha_calculo);
```

---

## 🔌 Backend Changes (SQLAlchemy)

### 1. Dependencias a Agregar

**`backend/requirements.txt`**
```txt
# PostgreSQL
psycopg2-binary==2.9.9      # PostgreSQL adapter
SQLAlchemy==2.0.25          # ORM
alembic==1.13.1             # Migrations tool
asyncpg==0.29.0             # Async PostgreSQL (opcional, FastAPI async)

# Existing dependencies...
fastapi==0.119.0
uvicorn==0.32.0
# ...
```

### 2. Connection Management

**`backend/database.py` (reescribir completo)**
```python
"""
Database connection utilities for Fluxion AI
PostgreSQL with SQLAlchemy
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool
from contextlib import contextmanager
from fastapi import HTTPException

# Database URL from environment
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    'postgresql://fluxion_user:password@localhost:5432/fluxion_production'
)

# SQLAlchemy engine with connection pooling
engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=5,          # Número de conexiones permanentes
    max_overflow=10,      # Conexiones adicionales si se necesita
    pool_pre_ping=True,   # Verificar conexión antes de usar
    echo=False,           # SQL logging (True para debug)
)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Base class for ORM models
Base = declarative_base()


@contextmanager
def get_db_session():
    """
    Context manager para sesiones SQLAlchemy
    Para queries de lectura y escritura
    """
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        session.close()


def get_db():
    """
    Dependency injection para FastAPI
    Usage: def endpoint(db: Session = Depends(get_db))
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### 3. Environment Variables

**`.env` (desarrollo local)**
```bash
DATABASE_URL=postgresql://fluxion_user:password@localhost:5432/fluxion_production
ENVIRONMENT=development
SENTRY_DSN=...
```

**ECS Task Definition (producción)**
```typescript
environment: {
  DATABASE_URL: rdsInstance.secret.secretValueFromJson('DATABASE_URL').toString(),
  ENVIRONMENT: 'production',
  SENTRY_DSN: process.env.SENTRY_DSN || '',
}
```

### 4. Query Migration Examples

**Antes (DuckDB)**
```python
from database import get_db_connection

with get_db_connection() as conn:
    result = conn.execute("""
        SELECT * FROM ventas
        WHERE fecha >= ? AND ubicacion_id = ?
    """, [fecha_inicio, ubicacion_id]).fetchall()
```

**Después (SQLAlchemy)**
```python
from database import get_db_session
from models import Venta  # ORM model

with get_db_session() as session:
    result = session.query(Venta).filter(
        Venta.fecha >= fecha_inicio,
        Venta.ubicacion_id == ubicacion_id
    ).all()
```

**O con SQL raw (si prefieres)**
```python
from database import get_db_session
from sqlalchemy import text

with get_db_session() as session:
    result = session.execute(
        text("""
            SELECT * FROM ventas
            WHERE fecha >= :fecha_inicio
            AND ubicacion_id = :ubicacion_id
        """),
        {"fecha_inicio": fecha_inicio, "ubicacion_id": ubicacion_id}
    ).fetchall()
```

---

## 🚀 Fases de Migración

### Fase 1: Infrastructure Setup (CDK)
**Duración estimada**: 2-3 horas

✅ **Tasks**:
1. Crear RDS PostgreSQL instance en CDK
2. Configurar Security Groups
3. Crear RDS Secret en Secrets Manager
4. Configurar backup y encryption
5. Deploy infrastructure
6. Verificar conectividad desde ECS

**Entregable**: RDS instance running, accessible desde VPC

---

### Fase 2: Schema Migration
**Duración estimada**: 3-4 horas

✅ **Tasks**:
1. Crear schema PostgreSQL completo (DDL)
2. Ajustar sintaxis DuckDB → PostgreSQL
3. Ejecutar DDL en RDS
4. Crear índices
5. Crear vistas
6. Verificar schema con psql

**Entregable**: Base de datos vacía con schema completo

---

### Fase 3: Backend Adaptation
**Duración estimada**: 4-6 horas

✅ **Tasks**:
1. Actualizar `requirements.txt` con SQLAlchemy
2. Reescribir `database.py` para PostgreSQL
3. Crear modelos SQLAlchemy (opcional, o usar SQL raw)
4. Actualizar todos los endpoints para usar nuevo connection manager
5. Actualizar `auth.py` para PostgreSQL
6. Testing local con PostgreSQL Docker

**Entregable**: Backend funcionando con PostgreSQL local

---

### Fase 4: ETL Migration
**Duración estimada**: 6-8 horas

✅ **Tasks**:
1. Actualizar `etl/core/config.py` para PostgreSQL
2. Modificar `etl_ventas_historico.py` para escribir a PostgreSQL
3. Crear scripts de carga inicial:
   - `load_ubicaciones.py` (16 rows)
   - `load_productos.py` (~50K productos)
   - `load_categorias.py` (~200 categorías)
   - `load_proveedores.py` (~100 proveedores)
   - `load_configuracion.py` (producto_ubicacion_config, etc.)
4. Crear script de migración de data transaccional:
   - `migrate_facturas.py` (20M facturas)
   - `migrate_items.py` (81M items)
   - `migrate_stock.py` (800K stocks)
5. Testing de carga con subset pequeño

**Entregable**: ETL processes writing to PostgreSQL

---

### Fase 5: Data Population (Staging)
**Duración estimada**: 4-6 horas (+ tiempo de ejecución ETL)

✅ **Tasks**:
1. Cargar data maestra (ubicaciones, productos, categorías)
2. Cargar configuraciones (producto_ubicacion_config)
3. Ejecutar ETL histórico (puede tomar horas para 81M records)
4. Verificar data integrity
5. Comparar counts DuckDB vs PostgreSQL
6. Testing de queries de performance

**Entregable**: Base de datos poblada en staging

---

### Fase 6: Testing & Validation
**Duración estimada**: 4-6 horas

✅ **Tasks**:
1. Testing de API endpoints con PostgreSQL
2. Testing de performance (queries lentos?)
3. Testing de dashboards (frontend)
4. Verificar que todas las features funcionan
5. Load testing (simular tráfico real)
6. Monitorear RDS metrics (CPU, memory, IOPS)

**Entregable**: Sistema validado funcionando con PostgreSQL

---

### Fase 7: Production Deployment
**Duración estimada**: 2-3 horas

✅ **Tasks**:
1. Create RDS snapshot (backup point)
2. Deploy infrastructure changes a producción
3. Deploy backend con PostgreSQL
4. Ejecutar carga inicial de data
5. Monitorear logs y metrics
6. Smoke testing de producción
7. Rollback plan ready

**Entregable**: Sistema en producción con PostgreSQL

---

## 🔍 Validation Checklist

### Data Integrity
```sql
-- Counts comparison
SELECT 'ubicaciones' as tabla, COUNT(*) as duckdb_count FROM ubicaciones;
SELECT 'productos' as tabla, COUNT(*) as duckdb_count FROM productos;
SELECT 'facturas' as tabla, COUNT(*) as duckdb_count FROM facturas;
SELECT 'items_facturas' as tabla, COUNT(*) as duckdb_count FROM items_facturas;
-- Compare con PostgreSQL
```

### Performance Benchmarks
```sql
-- Query crítico 1: Ventas por ubicación
EXPLAIN ANALYZE
SELECT ubicacion_id, SUM(total_usd) as total_ventas
FROM facturas
WHERE fecha >= '2024-01-01'
GROUP BY ubicacion_id;

-- Query crítico 2: Stock actual
EXPLAIN ANALYZE
SELECT * FROM stock_actual
WHERE ubicacion_id = 'TIENDA_01'
AND cantidad <= 10;

-- Query crítico 3: Items por producto
EXPLAIN ANALYZE
SELECT producto_id, SUM(cantidad) as total_vendido
FROM items_facturas
WHERE fecha BETWEEN '2024-01-01' AND '2024-12-31'
GROUP BY producto_id
ORDER BY total_vendido DESC
LIMIT 100;
```

### API Endpoints Testing
```bash
# Health check
curl http://localhost:8001/

# Ventas endpoint
curl http://localhost:8001/ventas?fecha_inicio=2024-01-01

# Estadísticas
curl http://localhost:8001/estadisticas

# Productos
curl http://localhost:8001/productos

# Ubicaciones
curl http://localhost:8001/ubicaciones
```

---

## 📊 Rollback Plan

**Si algo falla durante la migración:**

1. **Infrastructure rollback**:
   ```bash
   cd infrastructure
   git revert HEAD
   npx cdk deploy
   ```

2. **Backend rollback**:
   ```bash
   git revert HEAD
   git push origin main
   # GitHub Actions auto-deploys
   ```

3. **Data recovery**:
   - RDS snapshot restore (if data was loaded)
   - Re-run ETL from DuckDB source

4. **Emergency fallback**:
   - Keep DuckDB in S3 backup bucket
   - Deploy anterior version con DuckDB
   - Increase Fargate memory to 16GB (temporary, expensive)

---

## 🎯 Success Metrics

✅ **Backend estable sin OOM crashes**
✅ **API response time < 500ms para queries típicos**
✅ **Data integrity: 100% match entre DuckDB y PostgreSQL**
✅ **RDS CPU usage < 50% en operación normal**
✅ **RDS storage usage monitoreado con auto-scaling**
✅ **Backup automático funcionando (7 days retention)**
✅ **Costo mensual dentro de presupuesto (~$83/month)**

---

## 📚 Referencias

- [PostgreSQL 16 Documentation](https://www.postgresql.org/docs/16/)
- [SQLAlchemy 2.0 Documentation](https://docs.sqlalchemy.org/en/20/)
- [AWS RDS PostgreSQL Best Practices](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html)
- [FastAPI with SQLAlchemy](https://fastapi.tiangolo.com/tutorial/sql-databases/)
- [Alembic Migrations](https://alembic.sqlalchemy.org/en/latest/)

---

## 🚨 Riesgos y Mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| Data loss durante migración | Baja | Alto | Snapshots antes de cada paso |
| Performance degradation | Media | Medio | Benchmarking antes/después, índices optimizados |
| ETL falla con data grande | Media | Medio | Batch processing, retry logic |
| RDS costo excede presupuesto | Baja | Bajo | Start con t3.medium, monitor costs |
| Connection pool exhaustion | Baja | Medio | Configure pool size apropiado |
| Schema incompatibilities | Baja | Bajo | Testing exhaustivo en staging |

---

## ⏭️ Next Steps

1. **Aprobar plan con usuario** ✅
2. **Comenzar Fase 1: Infrastructure Setup**
3. **Crear branch `feature/postgresql-migration`**
4. **Daily standups para tracking progress**
5. **Document learnings en este archivo**

---

**Última actualización**: 2025-01-24
**Autor**: Claude Code
**Status**: DRAFT - Pendiente aprobación
