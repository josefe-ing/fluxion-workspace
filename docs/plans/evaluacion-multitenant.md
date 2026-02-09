# Evaluacion Multi-Tenant: Fluxion AI

**Fecha:** 2026-02-09
**Contexto:** Demo con potencial 2do cliente la proxima semana
**Estado actual:** Single-tenant (La Granja Mercado solamente)

---

## Resumen Ejecutivo

Fluxion tiene **scaffolding multi-tenant** (middleware, tenant.ts, subdominios) pero **cero aislamiento real de datos**. El middleware extrae el tenant del request y lo descarta -- ningun router, servicio o query lo usa.

**Resultado: 4 bloqueantes criticos impiden multi-tenancy.**

| # | Bloqueante | Donde |
|---|-----------|-------|
| 1 | BD sin `tenant_id` en ninguna tabla | `database/migrations/` |
| 2 | 13 routers no filtran por tenant | `backend/routers/*.py` (~80 endpoints) |
| 3 | tiendas_config.py hardcoded para La Granja | `backend/tiendas_config.py` (538 lineas) |
| 4 | ETL no tiene parametro de tenant | `etl/*.py` |

---

## Que SI existe (la fachada)

Estas piezas ya funcionan y son reutilizables:

### Backend: Middleware de Tenant (70% listo)
**Archivo:** `backend/middleware/tenant.py`
- Extrae tenant del subdomain: `granja.fluxionia.co` -> `"granja"`
- Extrae del header `X-Tenant-ID` como fallback
- Valida contra `ALLOWED_TENANTS` (env var)
- Guarda en `request.state.tenant_id`
- Tiene `require_tenant()` y `get_tenant()` como dependencies de FastAPI
- **Problema:** Ningun router importa ni usa estas dependencies

### Frontend: Sistema de Tenant (75% listo)
**Archivo:** `frontend/src/utils/tenant.ts`
- Detecta tenant por subdomain y query param (dev)
- Define `TenantConfig` con colores, logo, features, moneda, timezone
- Ya tiene configs para `granja`, `cliente2`, `admin`
- `getTenantId()`, `getTenantConfig()`, `useTenantConfig()` disponibles
- **Problema:** El frontend no envia `X-Tenant-ID` en las llamadas API

### CORS y Dominios (90% listo)
- CORS ya permite `*.fluxionia.co` subdomains
- `ALLOWED_TENANTS` es env var configurable
- `DOMAIN` es env var configurable

---

## Analisis por Capa

### 1. BASE DE DATOS - Sin aislamiento

**Estado:** Ninguna tabla tiene columna `tenant_id`

| Tabla | Registros | Constraint UNIQUE actual | Problema Multi-tenant |
|-------|-----------|-------------------------|----------------------|
| `ventas` | ~11M | `numero_factura` global | 2 clientes con factura "INV-001" = colision |
| `productos` | ~100K | `codigo` global | SKU repetidos entre clientes colisionan |
| `ubicaciones` | 23 | `codigo` global | `tienda_01` de cliente2 choca con `tienda_01` de granja |
| `inventario_actual` | ~2.3M | `(ubicacion_id, producto_id)` | Sin tenant, mezcla inventarios |
| `inventario_historico` | ~50M | por fecha+ubicacion | Sin tenant, mezcla historicos |
| `usuarios` | ~20 | `username` global | No puede existir "admin" en 2 tenants |
| `pedidos_sugeridos` | ~500 | por numero | Pedidos mezclados entre clientes |

**Migracion requerida:**
```sql
-- Para CADA tabla (20+ tablas):
ALTER TABLE ventas ADD COLUMN tenant_id VARCHAR(50) NOT NULL DEFAULT 'granja';
CREATE INDEX CONCURRENTLY idx_ventas_tenant ON ventas(tenant_id, fecha);

-- Cambiar constraints UNIQUE a compound:
ALTER TABLE ventas DROP CONSTRAINT uq_numero_factura;
ALTER TABLE ventas ADD CONSTRAINT uq_ventas_tenant UNIQUE (tenant_id, numero_factura);

-- Opcional: Row-Level Security
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ventas
    USING (tenant_id = current_setting('app.current_tenant'));
```

**Riesgo critico:** La tabla `ventas` tiene 11M+ filas. ALTER TABLE con DEFAULT es rapido en PostgreSQL 11+ (solo metadata), pero los indices nuevos requieren `CREATE INDEX CONCURRENTLY` para no bloquear.

**Esfuerzo:** 3-5 dias

---

### 2. BACKEND - Routers sin filtrado

**Estado:** 13 routers, ~80 endpoints, ~150 queries SQL -- ninguno filtra por tenant.

**Patron actual (TODOS los routers):**
```python
# backend/routers/ubicaciones.py
@router.get("/ubicaciones")
async def get_ubicaciones(tipo: Optional[str] = None):
    query = "SELECT * FROM ubicaciones WHERE activo = true"
    # NO hay WHERE tenant_id = ...
    # Retorna TODAS las tiendas de TODOS los tenants
```

**Patron requerido:**
```python
from middleware.tenant import require_tenant

@router.get("/ubicaciones")
async def get_ubicaciones(
    tenant_id: str = Depends(require_tenant),  # NUEVO
    tipo: Optional[str] = None
):
    query = "SELECT * FROM ubicaciones WHERE tenant_id = %s AND activo = true"
    # Filtra por tenant
```

**Routers a modificar:**

| Router | Endpoints | Queries SQL | Complejidad |
|--------|-----------|-------------|-------------|
| `pedidos_sugeridos.py` | ~15 | ~25 | Alta (CTE complejos) |
| `pedidos_multitienda.py` | ~8 | ~15 | Alta |
| `ubicaciones.py` | ~5 | ~8 | Media |
| `business_intelligence.py` | ~6 | ~10 | Alta |
| `bi_stores.py` | ~4 | ~8 | Media |
| `emergencias.py` | ~5 | ~8 | Media |
| `productos_excluidos.py` | ~4 | ~6 | Baja |
| `productos_excluidos_inter_cedi.py` | ~4 | ~6 | Baja |
| `config_inventario.py` | ~4 | ~6 | Baja |
| `pedidos_inter_cedi.py` | ~6 | ~10 | Media |
| `generadores_trafico_router.py` | ~4 | ~6 | Baja |
| `productos_admin.py` | ~4 | ~6 | Baja |
| `etl_history.py` | ~3 | ~4 | Baja |

**Esfuerzo:** 5-7 dias

---

### 3. AUTH - Usuarios sin tenant

**Archivo:** `backend/auth.py`

**Problemas:**
- Tabla `usuarios` no tiene `tenant_id` -- username "admin" es global
- JWT no incluye `tenant_id` en el payload
- `authenticate_user(username, password)` no recibe tenant
- Login no valida que el usuario pertenezca al tenant del request
- `usuarios_tiendas` (asignacion de tiendas) no tiene `tenant_id`

**Cambios requeridos:**
```python
# auth.py - Antes:
def authenticate_user(username: str, password: str):
    cursor.execute("SELECT * FROM usuarios WHERE username = %s", (username,))

# auth.py - Despues:
def authenticate_user(username: str, password: str, tenant_id: str):
    cursor.execute("SELECT * FROM usuarios WHERE username = %s AND tenant_id = %s",
                   (username, tenant_id))

# JWT payload - agregar tenant_id:
payload = {"sub": username, "tenant_id": tenant_id, "rol_id": rol_id, ...}
```

**Esfuerzo:** 2-3 dias

---

### 4. SERVICIOS - Config hardcoded a La Granja

**Archivos:** `backend/services/*.py` + `backend/tiendas_config.py`

`tiendas_config.py` es el **bloqueante mas critico**. Es un dict de 538 lineas con las 24 ubicaciones de La Granja hardcoded: IPs, puertos SQL Server, credenciales, parametros de inventario.

```python
# backend/tiendas_config.py (estado actual)
TIENDAS_CONFIG = {
    "tienda_01": TiendaConfig(
        server_ip="192.168.20.12",        # IP de La Granja
        database_name="VAD10",             # BD de La Granja
        username=get_sql_user(),           # Credenciales La Granja
        stock_min_mult_a=2.0,             # Parametros La Granja
        ...
    ),
    # 23 mas, todas de La Granja
}
```

**Servicios que dependen de tiendas_config:**
- `calculo_inventario_abc.py` -- ABC classification (parametros hardcoded La Granja)
- `algoritmo_dpdu.py` -- DPD+U demand distribution
- `bi_calculations.py` -- Business intelligence
- `detector_emergencias.py` -- Emergency stock detection

**Solucion:** Mover config de tiendas a BD:
```sql
CREATE TABLE ubicaciones_config (
    tenant_id VARCHAR(50) NOT NULL,
    ubicacion_id VARCHAR(50) NOT NULL,
    server_ip VARCHAR(50),
    database_name VARCHAR(50),
    sistema_pos VARCHAR(50),          -- 'klk' | 'stellar'
    stock_min_mult_a DECIMAL(5,2),
    stock_min_mult_b DECIMAL(5,2),
    -- ... parametros de inventario
    PRIMARY KEY (tenant_id, ubicacion_id)
);
```

**Esfuerzo:** 4-5 dias (migracion de datos + refactor de todos los callers)

---

### 5. ETL - Single-tenant hardcoded

**Archivos principales:**
- `etl/etl_ventas_postgres.py` -- Sales ETL
- `etl/etl_inventario.py` -- Inventory ETL
- `etl/etl_ventas_multi_tienda.py` -- Multi-store orchestrator
- `etl/core/tiendas_config.py` -- Store configs (copia de backend)

**Problemas:**
- ETL no tiene parametro `--tenant`
- Todas las tiendas son de La Granja (mismo dict hardcoded)
- KLK API endpoint hardcoded: `http://190.6.32.3:7002`
- SQL Server credentials unicas (La Granja)
- INSERT a PostgreSQL sin `tenant_id`
- EventBridge rules en timezone Venezuela (America/Caracas)

**Solucion requerida:**
```python
# Antes:
python3 etl_ventas_postgres.py

# Despues:
python3 etl_ventas_postgres.py --tenant granja
python3 etl_ventas_postgres.py --tenant cliente2
```

Cada tenant necesita:
- Sus propias credenciales SQL Server / API en Secrets Manager
- Su propio schedule en EventBridge
- INSERT con `tenant_id` en cada registro

**Esfuerzo:** 3-5 dias

---

### 6. FRONTEND - Casi listo, falta conectar

**Estado:** 75% listo. Las piezas existen pero no estan conectadas.

| Componente | Estado | Falta |
|-----------|--------|-------|
| Deteccion de tenant (`tenant.ts`) | Funciona | Nada |
| Config por tenant (colores, nombre) | Funciona | Cargar de backend en vez de hardcode |
| `X-Tenant-ID` en API calls | **NO EXISTE** | Agregar a `services/http.ts` |
| Branding dinamico | Parcial | CSS variables comentadas en main.tsx |
| Landing page | Hardcoded "La Granja" | Dinamizar |
| Logos | Referenciados pero no existen | Crear `/public/logos/` |
| Auth context | Sin tenant_id | Agregar campo |

**Fix critico (30 minutos):**
```typescript
// frontend/src/services/http.ts
import { getTenantId } from '../utils/tenant';

const getAuthHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const tenantId = getTenantId();          // NUEVO
    if (tenantId) headers['X-Tenant-ID'] = tenantId;  // NUEVO

    return headers;
};
```

**Esfuerzo total frontend:** 2-3 dias

---

### 7. INFRAESTRUCTURA - Single-tenant por diseno

**Archivo:** `infrastructure/lib/infrastructure-stack.ts`

| Recurso | Estado | Problema |
|---------|--------|----------|
| VPC | 1 sola, rutas a 192.168.0.0/16 | Hardcoded a red de La Granja |
| WireGuard | 1 tunnel, 1 peer | Solo conecta a La Granja on-prem |
| RDS | 1 instancia, BD `fluxion_production` | Compartida (OK con tenant_id) |
| ECS | 1 cluster, 1 backend service | Compartido (OK) |
| EventBridge | 3 reglas, timezone Venezuela | Necesita reglas por tenant |
| CloudFront | 1 distribucion, `admin.fluxionia.co` | Necesita alias por tenant |
| ECR | 3 repos (backend, frontend, etl) | Compartidos (OK) |

**Problemas criticos para 2do cliente:**
- WireGuard solo tiene 1 tunnel -- si el nuevo cliente tiene SQL Server on-prem, necesita otro tunnel
- Si el rango IP del nuevo cliente es tambien 192.168.x.x, hay colision de rutas
- EventBridge rules estan en timezone Venezuela

**Esfuerzo:** 5-7 dias (depende de la infra del nuevo cliente)

---

## Estrategias de Multi-Tenancy

### Opcion A: BD Compartida + tenant_id en filas (RECOMENDADA)

```
                    ┌──────────────────┐
                    │  CloudFront      │
                    │  *.fluxionia.co  │
                    └────────┬─────────┘
                             │
                    ┌────────┴─────────┐
                    │  ALB / Backend   │
                    │  (1 instancia)   │
                    │  Middleware:      │
                    │  X-Tenant-ID     │
                    └────────┬─────────┘
                             │
                    ┌────────┴─────────┐
                    │   PostgreSQL     │
                    │   (1 instancia)  │
                    │   WHERE          │
                    │   tenant_id = ?  │
                    └──────────────────┘
```

**Pros:**
- Menor esfuerzo de implementacion
- Menor costo operacional ($0 extra en infra)
- Backups y migraciones unificados
- Metricas cross-tenant faciles
- Mismo pipeline CI/CD

**Contras:**
- Riesgo de data leak si falta un WHERE
- Performance degrada con muchos tenants
- No hay aislamiento de fallas entre tenants

**Esfuerzo total: 4-5 semanas**
**Costo adicional: ~$0-200/mes**

### Opcion B: BD Separada por tenant

```
                    ┌──────────────────┐
                    │  CloudFront      │
                    └────────┬─────────┘
                             │
                    ┌────────┴─────────┐
                    │  Backend (1)     │
                    │  Tenant Router   │
                    └──┬──────────┬────┘
                       │          │
              ┌────────┴──┐  ┌───┴────────┐
              │ fluxion_  │  │ fluxion_   │
              │ granja    │  │ cliente2   │
              └───────────┘  └────────────┘
```

**Pros:**
- Aislamiento total de datos
- Backup/restore independiente por cliente
- Sin riesgo de data leak
- Performance independiente

**Contras:**
- Requiere multi-DB routing en backend
- Migraciones se ejecutan N veces
- Mas costoso en RDS ($200-500/mes por DB adicional)
- Mas complejo operacionalmente

**Esfuerzo total: 3-4 semanas (mas rapido en backend, mas lento en ops)**
**Costo adicional: ~$300-500/mes por tenant**

### Opcion C: Instancia Separada por tenant

```
              ┌──────────────┐    ┌──────────────┐
              │ granja       │    │ cliente2     │
              │ .fluxionia   │    │ .fluxionia   │
              │  ┌────────┐  │    │  ┌────────┐  │
              │  │Backend │  │    │  │Backend │  │
              │  │ETL     │  │    │  │ETL     │  │
              │  │RDS     │  │    │  │RDS     │  │
              │  └────────┘  │    │  └────────┘  │
              └──────────────┘    └──────────────┘
```

**Pros:**
- Aislamiento completo (red, compute, storage)
- Escalado independiente
- Cero riesgo de interferencia

**Contras:**
- Maximo esfuerzo operacional
- Maximo costo ($1000-2000/mes por tenant)
- Deployments multiplicados
- Sin metricas cross-tenant nativas

**Esfuerzo total: 2-3 semanas (minimo cambio de codigo, maximo de infra)**
**Costo adicional: ~$1000-2000/mes por tenant**

---

## Recomendacion: Opcion A para la demo, migrar a B si es necesario

### Para la demo de la proxima semana

**Realista en ~5 dias de trabajo intenso:**

1. **Dia 1-2: Base de datos**
   - ADD COLUMN tenant_id a las 5 tablas principales (ventas, productos, ubicaciones, inventario_actual, usuarios)
   - DEFAULT 'granja' para datos existentes
   - Indices compuestos

2. **Dia 2-3: Backend core**
   - Activar `require_tenant` en los routers principales (ubicaciones, productos, ventas)
   - No hace falta migrar TODOS los 80 endpoints -- solo los que se demuestran
   - Agregar tenant_id al JWT y login

3. **Dia 3-4: Frontend**
   - Agregar `X-Tenant-ID` a http.ts (30 min)
   - Activar CSS variables por tenant en main.tsx
   - Crear usuario demo para cliente2

4. **Dia 4-5: Demo data**
   - Crear ubicaciones de prueba para cliente2
   - Seed data minimo (productos, inventario)
   - Probar flujo completo: login -> dashboard -> pedidos

**Esto NO incluye:**
- ETL funcional para cliente2 (se puede hacer con data seeded)
- VPN al nuevo cliente
- Todos los endpoints migrados
- Emails personalizados

### Post-demo (si firma el cliente)

**Semanas 2-4:**
- Migrar los 80 endpoints restantes
- ETL con `--tenant` parameter
- VPN al nuevo cliente (si tiene SQL Server on-prem)
- EventBridge rules por tenant
- Email templates por tenant
- Testing completo de aislamiento

**Semanas 5-6:**
- RLS en PostgreSQL como safety net
- Monitoring por tenant
- Admin panel para crear tenants
- Documentacion

---

## Inventario de Archivos a Modificar

### Criticos (demo)

| Archivo | Cambio | Lineas aprox |
|---------|--------|-------------|
| `database/migrations/XXX_add_tenant_id.sql` | NUEVO - tenant_id en tablas | ~60 |
| `backend/auth.py` | tenant_id en login, JWT, create_user | ~40 |
| `backend/middleware/tenant.py` | Sin cambios (ya funciona) | 0 |
| `backend/routers/ubicaciones.py` | Depends(require_tenant) + WHERE | ~20 |
| `backend/main.py` | Verificar middleware activo, CORS | ~10 |
| `frontend/src/services/http.ts` | X-Tenant-ID header | ~5 |
| `frontend/src/contexts/AuthContext.tsx` | Guardar tenantId | ~10 |

### Completos (post-demo)

| Categoria | Archivos | Esfuerzo |
|-----------|----------|----------|
| Routers (13) | `backend/routers/*.py` | 5-7 dias |
| Servicios (6) | `backend/services/*.py` | 3-4 dias |
| ETL (15+) | `etl/*.py`, `etl/core/*.py` | 3-5 dias |
| Config | `backend/tiendas_config.py` -> DB | 4-5 dias |
| Infra | `infrastructure/lib/infrastructure-stack.ts` | 3-5 dias |
| Frontend cosmetic | Landing, emails, logos | 2 dias |
| Tests | Aislamiento, integracion | 3-4 dias |
| **TOTAL** | **~60 archivos** | **~5-7 semanas** |

---

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|-------------|---------|-----------|
| Data leak entre tenants (falta un WHERE) | Alta | Critico | RLS como safety net, tests automaticos |
| Colision de datos (UNIQUE sin tenant) | Alta | Critico | Compound constraints ANTES de insertar data |
| Performance degradada (indices nuevos) | Media | Alto | CREATE INDEX CONCURRENTLY, test con data real |
| WireGuard routing colision (IPs overlap) | Media | Alto | Verificar rango IP del nuevo cliente ANTES |
| ETL mezcla datos entre tenants | Media | Critico | Validar tenant_id en cada INSERT |
| Demo incompleta (no todos los flujos) | Alta | Medio | Priorizar flujo: login -> dashboard -> pedido |

---

## Decision Necesaria

Antes de empezar necesito saber:

1. **El nuevo cliente tiene SQL Server on-prem?** (determina si necesitamos otro tunnel WireGuard)
2. **Que flujos se van a demostrar?** (para priorizar que endpoints migrar)
3. **El nuevo cliente usaria el mismo dominio fluxionia.co?** (ej: `cliente2.fluxionia.co`)
4. **Hay datos reales del nuevo cliente o hacemos demo con data sintetica?**
