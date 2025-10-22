# Arquitectura Multi-Tenant - Fluxion AI

## Diagrama Completo de Flujo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
│                                                                              │
│  👤 Usuario 1: https://granja.fluxionia.co                                  │
│  👤 Usuario 2: https://cliente2.fluxionia.co                                │
│  👤 Admin:     https://admin.fluxionia.co                                   │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │
                             │ DNS Query
                             ▼
        ┌────────────────────────────────────────────────┐
        │         CLOUDFLARE (Registrar)                 │
        │         Domain: fluxionia.co                   │
        │         Nameservers → AWS Route 53             │
        └────────────────────┬───────────────────────────┘
                             │
                             │ DNS Resolution
                             ▼
        ┌────────────────────────────────────────────────┐
        │         AWS ROUTE 53 (DNS Manager)             │
        │         Hosted Zone: fluxionia.co              │
        │                                                 │
        │  Records:                                       │
        │  ├─ fluxionia.co → CloudFront                  │
        │  ├─ granja.fluxionia.co → CloudFront           │
        │  ├─ cliente2.fluxionia.co → CloudFront         │
        │  ├─ admin.fluxionia.co → CloudFront            │
        │  └─ api.fluxionia.co → ALB                     │
        │                                                 │
        │  SSL Cert: *.fluxionia.co (wildcard)           │
        └────────────┬───────────────────┬────────────────┘
                     │                   │
         Frontend ◄──┘                   └──► Backend
                     │                        │
                     ▼                        ▼
    ┌────────────────────────────┐   ┌───────────────────────────┐
    │   CLOUDFRONT CDN            │   │  APPLICATION LOAD BALANCER│
    │   Distribution ID: E123...  │   │  DNS: fluxion-alb-*.com   │
    │                             │   │                           │
    │  CNAMEs:                    │   │  Listener: HTTPS:443      │
    │  ├─ fluxionia.co            │   │  Certificate: *.fluxionia │
    │  ├─ granja.fluxionia.co     │   │  Target Group: ECS Tasks  │
    │  ├─ cliente2.fluxionia.co   │   └───────────┬───────────────┘
    │  └─ admin.fluxionia.co      │               │
    │                             │               │
    │  SSL: *.fluxionia.co        │               │ Forward to
    │  Cache: By hostname         │               │
    │  Origin: S3                 │               ▼
    └──────────┬──────────────────┘   ┌───────────────────────────┐
               │                      │     ECS FARGATE           │
               │                      │     Backend Tasks         │
               ▼                      │                           │
    ┌──────────────────────┐         │  ┌─────────────────────┐  │
    │   S3 BUCKET           │         │  │  FastAPI App        │  │
    │   fluxion-frontend    │         │  │  (Python)           │  │
    │                       │         │  │                     │  │
    │  /index.html          │         │  │  Middleware:        │  │
    │  /assets/             │         │  │  ├─ Extract tenant  │  │
    │  /logos/              │         │  │  │  from hostname   │  │
    │    ├─ granja.png      │         │  │  │                  │  │
    │    └─ cliente2.png    │         │  │  ├─ Validate tenant│  │
    │  /static/             │         │  │  │                  │  │
    │                       │         │  │  └─ Set tenant_id  │  │
    │  React SPA (built)    │         │  │     in request     │  │
    │  Multi-tenant aware   │         │  │                     │  │
    └───────────────────────┘         │  │  Endpoints:         │  │
                                      │  │  /api/v1/inventory  │  │
                                      │  │  /api/v1/stats      │  │
                                      │  │  /api/v1/orders     │  │
                                      │  │                     │  │
                                      │  └──────────┬──────────┘  │
                                      └─────────────┼──────────────┘
                                                    │
                                                    │ Query with tenant filter
                                                    ▼
                                      ┌─────────────────────────────┐
                                      │     EFS / DuckDB            │
                                      │     Database Files          │
                                      │                             │
                                      │  fluxion_production.db      │
                                      │                             │
                                      │  Tables:                    │
                                      │  ├─ inventory               │
                                      │  │  ├─ tenant_id: 'granja'  │
                                      │  │  ├─ tenant_id: 'cliente2'│
                                      │  │  └─ ...                  │
                                      │  │                          │
                                      │  ├─ ventas                  │
                                      │  │  ├─ tenant_id: 'granja'  │
                                      │  │  └─ tenant_id: 'cliente2'│
                                      │  │                          │
                                      │  └─ productos               │
                                      │     ├─ tenant_id: 'granja'  │
                                      │     └─ tenant_id: 'cliente2'│
                                      │                             │
                                      │  Indexes:                   │
                                      │  ├─ idx_inventory_tenant    │
                                      │  ├─ idx_ventas_tenant       │
                                      │  └─ idx_productos_tenant    │
                                      └─────────────────────────────┘
```

## Flujo de Request por Tenant

### Ejemplo 1: Usuario de La Granja accede al dashboard

```
1. Usuario → https://granja.fluxionia.co
   ↓
2. DNS (Route 53) → Resuelve a CloudFront IP
   ↓
3. CloudFront → Verifica hostname: "granja.fluxionia.co"
   ↓
4. CloudFront → Busca en cache (key: hostname + path)
   ↓
5. S3 → Devuelve index.html (React SPA)
   ↓
6. Browser → Ejecuta JavaScript
   ↓
7. Frontend → getTenantId() extrae "granja" del hostname
   ↓
8. Frontend → Carga config: { name: "La Granja", logo: "/logos/granja.png" }
   ↓
9. Frontend → Renderiza UI con branding de La Granja
   ↓
10. Usuario hace click en "Ver Inventario"
    ↓
11. Frontend → API call:
    GET https://api.fluxionia.co/api/v1/inventory
    Headers: { "X-Tenant-ID": "granja" }
    ↓
12. ALB → Recibe request y forwarding a ECS
    ↓
13. Backend Middleware → Extrae tenant_id = "granja"
    ↓
14. Backend Endpoint → Query DB:
    SELECT * FROM inventory WHERE tenant_id = 'granja'
    ↓
15. DuckDB → Devuelve solo datos de La Granja
    ↓
16. Backend → Response JSON con datos
    ↓
17. Frontend → Renderiza tabla con inventario de La Granja
```

### Ejemplo 2: Cliente2 accede simultáneamente

```
1. Usuario → https://cliente2.fluxionia.co
   ↓
2-5. [Mismo flujo DNS/CloudFront]
   ↓
6. Frontend → getTenantId() extrae "cliente2"
   ↓
7. Frontend → Carga config: { name: "Cliente 2 S.A.", logo: "/logos/cliente2.png" }
   ↓
[...mismo flujo...]
   ↓
14. Backend → Query DB:
    SELECT * FROM inventory WHERE tenant_id = 'cliente2'
    ↓
15. DuckDB → Devuelve SOLO datos de Cliente2 (aislamiento total)
```

## Componentes Clave

### 1. CloudFront Distribution (ÚNICO para todos)

```javascript
{
  "DistributionId": "E1234567890ABC",
  "DomainName": "d1234567890.cloudfront.net",
  "Aliases": [
    "fluxionia.co",
    "www.fluxionia.co",
    "granja.fluxionia.co",
    "cliente2.fluxionia.co",
    "admin.fluxionia.co"
  ],
  "ViewerCertificate": {
    "ACMCertificateArn": "arn:aws:acm:us-east-1:...:certificate/...",
    "Certificate": "*.fluxionia.co",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "CachePolicy": {
    "Name": "TenantCachePolicy",
    "HeadersConfig": {
      "HeaderBehavior": "whitelist",
      "Headers": ["Host"]  // Cache separado por hostname
    }
  },
  "Origins": [{
    "Id": "S3-fluxion-frontend",
    "DomainName": "fluxion-frontend.s3.amazonaws.com",
    "S3OriginConfig": {
      "OriginAccessIdentity": "origin-access-identity/cloudfront/..."
    }
  }]
}
```

### 2. Backend Multi-Tenant Middleware

```python
# backend/middleware/tenant.py

import re
from fastapi import Request, HTTPException
from typing import Optional

class TenantMiddleware:
    """
    Middleware que extrae el tenant_id de cada request
    """

    ALLOWED_TENANTS = ["granja", "cliente2", "admin"]
    SPECIAL_SUBDOMAINS = ["api", "www", "etl"]

    @staticmethod
    def extract_tenant_from_host(host: str) -> Optional[str]:
        """
        Extrae tenant del hostname

        Ejemplos:
        - granja.fluxionia.co → "granja"
        - api.fluxionia.co → None (es la API)
        - fluxionia.co → None (landing)
        """
        match = re.match(r"^([a-z0-9-]+)\.fluxionia\.co", host)

        if not match:
            return None

        subdomain = match.group(1)

        if subdomain in TenantMiddleware.SPECIAL_SUBDOMAINS:
            return None

        return subdomain

    @staticmethod
    def extract_tenant_from_header(request: Request) -> Optional[str]:
        """
        Extrae tenant del header X-Tenant-ID
        """
        return request.headers.get("X-Tenant-ID")

    @classmethod
    async def __call__(cls, request: Request, call_next):
        """
        Middleware principal
        """
        # Opción 1: Desde hostname
        host = request.headers.get("host", "")
        tenant_id = cls.extract_tenant_from_host(host)

        # Opción 2: Desde header (si no se encontró en host)
        if not tenant_id:
            tenant_id = cls.extract_tenant_from_header(request)

        # Validar tenant
        if tenant_id and tenant_id not in cls.ALLOWED_TENANTS:
            raise HTTPException(
                status_code=404,
                detail=f"Tenant '{tenant_id}' not found"
            )

        # Guardar en request state
        request.state.tenant_id = tenant_id

        # Continuar con el request
        response = await call_next(request)

        # Agregar header de respuesta (útil para debugging)
        if tenant_id:
            response.headers["X-Tenant-ID"] = tenant_id

        return response


# backend/main.py

from fastapi import FastAPI, Request, Depends
from middleware.tenant import TenantMiddleware

app = FastAPI()

# Agregar middleware
app.middleware("http")(TenantMiddleware())

# Dependency para requerir tenant
def require_tenant(request: Request) -> str:
    """Dependency que asegura que el request tenga tenant"""
    tenant_id = request.state.tenant_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant required")
    return tenant_id

# Usar en endpoints
@app.get("/api/v1/inventory")
async def get_inventory(
    request: Request,
    tenant_id: str = Depends(require_tenant)
):
    """
    Obtiene inventario del tenant
    tenant_id se inyecta automáticamente
    """
    query = f"""
        SELECT *
        FROM inventory
        WHERE tenant_id = '{tenant_id}'
        ORDER BY created_at DESC
    """
    # ... ejecutar query
    return {"tenant_id": tenant_id, "items": [...]}
```

### 3. Frontend Multi-Tenant Detection

```typescript
// frontend/src/utils/tenant.ts

export interface TenantConfig {
  id: string;
  name: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  features: string[];
  customSettings?: Record<string, any>;
}

const TENANT_CONFIGS: Record<string, TenantConfig> = {
  granja: {
    id: 'granja',
    name: 'La Granja Mercado',
    logo: '/logos/granja.png',
    primaryColor: '#10b981',
    secondaryColor: '#059669',
    features: ['inventory', 'sales', 'ai-insights', 'forecasting'],
    customSettings: {
      showVenezuelanTaxes: true,
      currency: 'VES',
      timezone: 'America/Caracas',
    },
  },
  cliente2: {
    id: 'cliente2',
    name: 'Cliente 2 S.A.',
    logo: '/logos/cliente2.png',
    primaryColor: '#3b82f6',
    secondaryColor: '#2563eb',
    features: ['inventory', 'sales'],
    customSettings: {
      currency: 'USD',
    },
  },
};

export function getTenantId(): string | null {
  const hostname = window.location.hostname;

  // Desarrollo local: usar query param
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const params = new URLSearchParams(window.location.search);
    const tenantParam = params.get('tenant');
    if (tenantParam) return tenantParam;

    // Default para desarrollo
    return 'granja';
  }

  // Producción: extraer de subdomain
  const match = hostname.match(/^([a-z0-9-]+)\.fluxionia\.co$/);
  if (match) {
    const subdomain = match[1];

    // Ignorar subdominios especiales
    if (['www', 'api', 'admin'].includes(subdomain)) {
      return null;
    }

    return subdomain;
  }

  // Dominio principal (landing page)
  return null;
}

export function getTenantConfig(tenantId: string): TenantConfig | null {
  return TENANT_CONFIGS[tenantId] || null;
}

export function validateTenant(tenantId: string): boolean {
  return tenantId in TENANT_CONFIGS;
}

// Hook de React para usar en componentes
export function useTenant(): TenantConfig {
  const tenantId = getTenantId();

  if (!tenantId) {
    throw new Error('No tenant found in hostname');
  }

  const config = getTenantConfig(tenantId);

  if (!config) {
    throw new Error(`Tenant '${tenantId}' not configured`);
  }

  return config;
}
```

### 4. Database Schema Multi-Tenant

```sql
-- Tabla de tenants (maestro)
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, suspended
    plan VARCHAR(50) DEFAULT 'standard', -- free, standard, premium
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    settings JSON -- Configuraciones específicas del tenant
);

-- Índice para búsquedas
CREATE INDEX idx_tenants_status ON tenants(status);

-- Ejemplo de inserción
INSERT INTO tenants (tenant_id, name, settings) VALUES
('granja', 'La Granja Mercado', '{"currency": "VES", "timezone": "America/Caracas"}'),
('cliente2', 'Cliente 2 S.A.', '{"currency": "USD", "timezone": "UTC"}');

-- Tabla de inventario multi-tenant
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    store_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    min_stock INTEGER DEFAULT 0,
    max_stock INTEGER DEFAULT 999999,
    unit_cost DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraint único por tenant
    CONSTRAINT unique_tenant_store_product UNIQUE (tenant_id, store_id, product_id)
);

-- Índices para performance multi-tenant
CREATE INDEX idx_inventory_tenant ON inventory(tenant_id);
CREATE INDEX idx_inventory_tenant_store ON inventory(tenant_id, store_id);
CREATE INDEX idx_inventory_tenant_product ON inventory(tenant_id, product_id);

-- RLS (Row Level Security) simulado con views
CREATE VIEW inventory_granja AS
SELECT * FROM inventory WHERE tenant_id = 'granja';

CREATE VIEW inventory_cliente2 AS
SELECT * FROM inventory WHERE tenant_id = 'cliente2';
```

## Seguridad Multi-Tenant

### Principios de Aislamiento

1. **Request Level**: Cada request tiene su tenant_id
2. **Database Level**: Todas las queries filtran por tenant_id
3. **Cache Level**: Cache keys incluyen tenant_id
4. **File Level**: Archivos organizados por tenant (e.g., logos)

### Validaciones Críticas

```python
# ❌ NUNCA hacer esto (SQL injection + sin filtro tenant)
query = f"SELECT * FROM inventory WHERE product_id = '{product_id}'"

# ✅ SIEMPRE hacer esto
query = """
    SELECT * FROM inventory
    WHERE tenant_id = ?
      AND product_id = ?
"""
result = db.execute(query, [tenant_id, product_id])
```

### Logs de Auditoría

```python
# Loggear todas las acciones con tenant
logger.info(f"[{tenant_id}] User {user_id} accessed inventory")
logger.warning(f"[{tenant_id}] Failed login attempt for user {username}")
```

## Performance Considerations

### Caching Strategy

```
CloudFront Cache Key = hostname + path + query
Ejemplo:
- granja.fluxionia.co/dashboard → Cache entry 1
- cliente2.fluxionia.co/dashboard → Cache entry 2 (diferente!)
```

### Database Indexing

```sql
-- MUY IMPORTANTE: Índices compuestos con tenant_id primero
CREATE INDEX idx_inventory_tenant_date ON inventory(tenant_id, created_at DESC);
CREATE INDEX idx_ventas_tenant_date ON ventas(tenant_id, fecha_venta DESC);

-- Esto permite queries eficientes:
SELECT * FROM inventory
WHERE tenant_id = 'granja'
ORDER BY created_at DESC
LIMIT 100;
-- ^ Usa índice idx_inventory_tenant_date perfectamente
```

## Monitoreo

### Métricas por Tenant

```python
# CloudWatch custom metrics
cloudwatch.put_metric_data(
    Namespace='Fluxion/Tenants',
    MetricData=[{
        'MetricName': 'APIRequests',
        'Value': 1,
        'Unit': 'Count',
        'Dimensions': [
            {'Name': 'TenantId', 'Value': tenant_id},
            {'Name': 'Endpoint', 'Value': '/api/v1/inventory'}
        ]
    }]
)
```

### Dashboard de Tenants

```
┌─────────────────────────────────────────┐
│  Fluxion AI - Multi-Tenant Dashboard   │
├─────────────────────────────────────────┤
│  Active Tenants: 2                      │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ granja         ● Active          │   │
│  │ Requests/min:  142               │   │
│  │ Storage:       2.4 GB            │   │
│  │ Users:         15                │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ cliente2       ● Active          │   │
│  │ Requests/min:  67                │   │
│  │ Storage:       0.8 GB            │   │
│  │ Users:         5                 │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## Resumen

✅ **1 dominio** para todos los clientes (fluxionia.co)
✅ **Subdominios ilimitados** con wildcard SSL
✅ **Aislamiento total** de datos por tenant_id
✅ **Caching eficiente** por hostname
✅ **Onboarding rápido** (~25 min por cliente)
✅ **Escalable** a 100+ clientes sin cambios arquitectónicos
✅ **Económico** (~$1-5 por cliente/mes)

---

**Documentación completa**: [cloudflare-aws-domain-setup.md](./cloudflare-aws-domain-setup.md)
