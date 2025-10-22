# Configuración de Dominios: Cloudflare + AWS Route 53

## Estrategia de Dominios para Fluxion AI

### Arquitectura Propuesta (Multi-Tenant)

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE (Registrar)                       │
│                   Compra del dominio principal                   │
│                       fluxionia.co                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Nameservers delegados a AWS
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AWS ROUTE 53 (DNS Manager)                    │
│              Gestión completa de DNS y subdominios               │
│                                                                   │
│  Hosted Zone: fluxionia.co                                      │
│                                                                   │
│  ├── A      fluxionia.co → CloudFront (Landing page producto)   │
│  ├── CNAME www.fluxionia.co → fluxionia.co                      │
│  ├── A     api.fluxionia.co → ALB (Backend FastAPI)             │
│  │                                                                │
│  ├── 🏢 SUBDOMINIOS POR CLIENTE (Multi-Tenant):                 │
│  │                                                                │
│  ├── A     granja.fluxionia.co → CloudFront (La Granja App)     │
│  ├── A     cliente2.fluxionia.co → CloudFront (Cliente 2 App)   │
│  ├── A     cliente3.fluxionia.co → CloudFront (Cliente 3 App)   │
│  │                                                                │
│  ├── 🔧 SUBDOMINIOS INTERNOS/ADMIN:                             │
│  │                                                                │
│  ├── A     admin.fluxionia.co → CloudFront (Panel Admin)        │
│  ├── CNAME etl.fluxionia.co → VPN/ECS (ETL interno)             │
│  └── TXT   _acme-challenge → Certificados SSL                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
┌──────────────────┐          ┌──────────────────┐
│  CloudFront CDN  │          │  Application LB  │
│  (Frontend SPA)  │          │  (Backend API)   │
│                  │          │                  │
│  *.fluxionia.co  │          │  api.fluxionia.co│
│  SSL Wildcard    │          │  SSL/TLS Auto    │
└────────┬─────────┘          └────────┬─────────┘
         │                             │
         ▼                             ▼
    ┌─────────┐                 ┌──────────────┐
    │ S3 Bucket│                 │  ECS Fargate │
    │ Frontend │                 │   Backend    │
    │          │                 │ (Multi-Tenant)│
    │ Routing: │                 │              │
    │ granja/* │                 │ Tenant ID    │
    │ cliente2*│                 │ via Header   │
    └──────────┘                 └──────────────┘
```

## PASO 1: Comprar Dominio en Cloudflare

### 1.1 Crear Cuenta en Cloudflare

1. Ve a https://dash.cloudflare.com/sign-up
2. Completa registro:
   - Email
   - Contraseña segura
   - Verificación de email

### 1.2 Comprar Dominio

```bash
# Dominio seleccionado:
# fluxionia.co
```

**Proceso:**
1. Dashboard Cloudflare > "Domain Registration" > "Register Domains"
2. Buscar: `fluxionia.co`
3. Agregar al carrito
4. Configurar:
   - ✅ **WHOIS Privacy Protection** (Gratis con Cloudflare)
   - ✅ **Auto-renew** (recomendado)
   - ⚠️ **NO activar** servicios adicionales aún (DNS lo manejará Route 53)
5. Completar pago

**Precio aproximado (2025):**
- `.co`: $20-30 USD/año (mucho más económico que .ai!)

### 1.3 Verificar Compra

Espera 15-30 minutos para que el dominio se active.

```bash
# Verificar desde terminal:
whois fluxion.ai

# Deberías ver:
# Registrar: Cloudflare
# Status: clientTransferProhibited
```

---

## PASO 2: Configurar AWS Route 53

### 2.1 Crear Hosted Zone en Route 53

```bash
# Opción A: Vía AWS CLI
aws route53 create-hosted-zone \
  --name fluxionia.co \
  --caller-reference "$(date +%Y%m%d-%H%M%S)" \
  --hosted-zone-config Comment="Fluxion AI Multi-Tenant DNS"

# Opción B: Vía AWS Console
```

**Proceso en Console:**
1. AWS Console > Route 53 > "Hosted zones"
2. Click "Create hosted zone"
3. Configurar:
   - **Domain name**: `fluxionia.co`
   - **Type**: `Public hosted zone`
   - **Tags**:
     - `Project: fluxion-ai`
     - `Environment: production`
     - `ManagedBy: cdk`
4. Create hosted zone

### 2.2 Obtener Nameservers de AWS

Después de crear la Hosted Zone, AWS te dará 4 nameservers:

```
ns-1234.awsdns-12.org
ns-5678.awsdns-56.co.uk
ns-9012.awsdns-90.com
ns-3456.awsdns-34.net
```

**Guardar estos valores** - los necesitarás en el siguiente paso.

```bash
# Ver nameservers vía CLI:
aws route53 get-hosted-zone --id /hostedzone/Z1234567890ABC \
  --query 'DelegationSet.NameServers'
```

---

## PASO 3: Delegar DNS a Route 53

### 3.1 Actualizar Nameservers en Cloudflare

1. Cloudflare Dashboard > "Domain Registration" > "Manage Domains"
2. Click en tu dominio (**fluxionia.co**)
3. Click "Configuration" > "Nameservers"
4. Cambiar de "Cloudflare Nameservers" a "Custom Nameservers"
5. Agregar los 4 nameservers de AWS Route 53 (del paso anterior):
   ```
   ns-1234.awsdns-12.org
   ns-5678.awsdns-56.co.uk
   ns-9012.awsdns-90.com
   ns-3456.awsdns-34.net
   ```
6. Save

⚠️ **IMPORTANTE**: Esta propagación puede tardar 24-48 horas, aunque normalmente es más rápido (1-2 horas).

### 3.2 Verificar Propagación de DNS

```bash
# Verificar que los nameservers se hayan actualizado
dig NS fluxionia.co +short

# Deberías ver los nameservers de AWS:
# ns-1234.awsdns-12.org.
# ns-5678.awsdns-56.co.uk.
# ...

# Verificar desde múltiples ubicaciones:
# https://www.whatsmydns.net/#NS/fluxionia.co
```

---

## PASO 4: Configurar Registros DNS en Route 53 (Multi-Tenant)

### 4.1 Configurar Dominio Principal (Landing Page del Producto)

```bash
# fluxionia.co → CloudFront (Landing page del producto/empresa)
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "fluxionia.co",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "d1234567890.cloudfront.net",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }'
```

### 4.2 Configurar WWW

```bash
# www.fluxionia.co → Redirect a fluxionia.co
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "www.fluxionia.co",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "fluxionia.co"}]
      }
    }]
  }'
```

### 4.3 Configurar API (Backend Multi-Tenant)

```bash
# api.fluxionia.co → ALB (Backend FastAPI con tenant routing)
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.fluxionia.co",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z35SXDOTRQ7X7K",
          "DNSName": "fluxion-alb-1234567890.us-east-1.elb.amazonaws.com",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'
```

### 4.4 Configurar Subdominios por Cliente (Multi-Tenant) 🏢

#### Cliente 1: La Granja Mercado

```bash
# granja.fluxionia.co → CloudFront (App de La Granja)
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "granja.fluxionia.co",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "d1234567890.cloudfront.net",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }'
```

#### Plantilla para Nuevos Clientes

```bash
# {cliente}.fluxionia.co → CloudFront (mismo CDN, diferente tenant_id)
# Ejemplo: cliente2.fluxionia.co

aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "cliente2.fluxionia.co",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "d1234567890.cloudfront.net",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }'
```

**Nota**: Todos los subdominios de clientes apuntan al **mismo CloudFront Distribution**. El tenant se identifica mediante:
- **Hostname** (granja.fluxionia.co vs cliente2.fluxionia.co)
- **CloudFront/Backend** lee el hostname y extrae el tenant_id
- **Frontend** renderiza la app correspondiente según tenant

### 4.5 Subdominios Administrativos (Opcional)

#### Panel de Administración

```bash
# admin.fluxionia.co → CloudFront (Panel super-admin multi-tenant)
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "admin.fluxionia.co",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "d1234567890.cloudfront.net",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }'
```

### 4.6 Verificar Registros DNS

```bash
# Verificar cada registro:
dig fluxionia.co +short
dig www.fluxionia.co +short
dig api.fluxionia.co +short
dig granja.fluxionia.co +short
dig admin.fluxionia.co +short

# Verificar todos los registros de la zona:
aws route53 list-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --output table
```

---

## PASO 5: Configurar SSL/TLS con AWS Certificate Manager (ACM)

### 5.1 Solicitar Certificado Wildcard

```bash
# Solicitar certificado WILDCARD para *.fluxionia.co y fluxionia.co
# Esto cubrirá TODOS los subdominios de clientes automáticamente
aws acm request-certificate \
  --domain-name fluxionia.co \
  --subject-alternative-names "*.fluxionia.co" \
  --validation-method DNS \
  --region us-east-1 \
  --tags Key=Project,Value=fluxion-ai Key=Environment,Value=production

# El wildcard *.fluxionia.co cubrirá:
# - granja.fluxionia.co
# - cliente2.fluxionia.co
# - cliente3.fluxionia.co
# - admin.fluxionia.co
# - api.fluxionia.co
# - cualquier futuro subdominio
```

### 5.2 Validar Certificado con DNS

AWS ACM te dará registros CNAME para validación:

```bash
# Ver detalles del certificado:
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:123456789012:certificate/abc-123 \
  --region us-east-1
```

**Agregar registros de validación a Route 53:**

```bash
# Ejemplo (AWS normalmente automatiza esto vía CDK):
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "_abc123.fluxionia.co",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "_xyz456.acm-validations.aws."}]
      }
    }]
  }'
```

⏱️ La validación tarda 5-30 minutos.

### 5.3 Verificar Certificado Emitido

```bash
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:123456789012:certificate/abc-123 \
  --region us-east-1 \
  --query 'Certificate.Status'

# Debe devolver: "ISSUED"
```

---

## PASO 6: Integrar Certificados con Servicios AWS

### 6.1 Agregar Certificado a CloudFront

**Vía AWS Console:**
1. CloudFront > Distributions > Seleccionar distribución
2. Edit > "Alternate domain names (CNAMEs)"
3. Agregar TODOS los subdominios:
   - `fluxionia.co`
   - `www.fluxionia.co`
   - `granja.fluxionia.co`
   - `cliente2.fluxionia.co`
   - `admin.fluxionia.co`
   - *(Agregar nuevos clientes aquí cuando onboardees)*
4. "Custom SSL certificate" > Seleccionar certificado wildcard de ACM
5. "Security policy": `TLSv1.2_2021` (recomendado)
6. Save

**IMPORTANTE para Multi-Tenant**: Cada vez que agregues un nuevo cliente, debes:
1. Crear el registro DNS en Route 53
2. Agregar el CNAME al CloudFront Distribution

**Vía AWS CLI:**
```bash
aws cloudfront update-distribution \
  --id E1234567890ABC \
  --distribution-config file://cloudfront-config.json
```

### 6.2 Agregar Certificado a Application Load Balancer

```bash
# Agregar listener HTTPS al ALB
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/fluxion-alb/abc123 \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:us-east-1:123456789012:certificate/abc-123 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/fluxion-backend/xyz456
```

---

## PASO 7: Configurar Infraestructura con CDK

### 7.1 Actualizar Stack de CDK

Agregar al archivo `infrastructure/lib/infrastructure-stack.ts`:

```typescript
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

// Importar Hosted Zone existente
const hostedZone = route53.HostedZone.fromLookup(this, 'FluxionZone', {
  domainName: 'fluxionia.co',
});

// Crear certificado WILDCARD (validación automática con Route 53)
const certificate = new acm.Certificate(this, 'FluxionCertificate', {
  domainName: 'fluxionia.co',
  subjectAlternativeNames: ['*.fluxionia.co'], // Cubre todos los subdominios
  validation: acm.CertificateValidation.fromDns(hostedZone),
});

// Lista de clientes/tenants (puedes moverlo a un archivo de config)
const tenants = [
  'granja',      // La Granja Mercado
  'cliente2',    // Futuro cliente 2
  'admin',       // Panel administrativo
];

// Crear CloudFront distribution con MÚLTIPLES dominios custom
const distribution = new cloudfront.Distribution(this, 'FluxionCDN', {
  defaultBehavior: {
    origin: new origins.S3Origin(frontendBucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
  },
  // IMPORTANTE: Agregar TODOS los dominios aquí
  domainNames: [
    'fluxionia.co',
    'www.fluxionia.co',
    ...tenants.map(tenant => `${tenant}.fluxionia.co`), // Genera todos los subdominios
  ],
  certificate: certificate,
  minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
  defaultRootObject: 'index.html',
  errorResponses: [
    {
      httpStatus: 404,
      responseHttpStatus: 200,
      responsePagePath: '/index.html', // Para SPA routing
      ttl: cdk.Duration.minutes(5),
    },
  ],
});

// Crear registro DNS para dominio principal (landing page)
new route53.ARecord(this, 'FluxionRootRecord', {
  zone: hostedZone,
  recordName: 'fluxionia.co',
  target: route53.RecordTarget.fromAlias(
    new targets.CloudFrontTarget(distribution)
  ),
});

// WWW redirect
new route53.CnameRecord(this, 'FluxionWwwRecord', {
  zone: hostedZone,
  recordName: 'www',
  domainName: 'fluxionia.co',
});

// Crear registros DNS para cada tenant automáticamente
tenants.forEach(tenant => {
  new route53.ARecord(this, `Fluxion${tenant.charAt(0).toUpperCase() + tenant.slice(1)}Record`, {
    zone: hostedZone,
    recordName: `${tenant}.fluxionia.co`,
    target: route53.RecordTarget.fromAlias(
      new targets.CloudFrontTarget(distribution)
    ),
  });
});

// API subdomain apuntando al ALB
new route53.ARecord(this, 'FluxionApiRecord', {
  zone: hostedZone,
  recordName: 'api.fluxionia.co',
  target: route53.RecordTarget.fromAlias(
    new targets.LoadBalancerTarget(alb)
  ),
});
```

### 7.2 Deploy con CDK

```bash
cd infrastructure

# Preview cambios
npx cdk diff

# Deploy
npx cdk deploy

# Verificar outputs
npx cdk deploy --outputs-file outputs.json
cat outputs.json
```

---

## PASO 8: Configurar Variables de Entorno

### 8.1 Backend

```bash
# backend/.env.production
API_URL=https://api.fluxionia.co
DOMAIN=fluxionia.co
ENVIRONMENT=production

# CORS: Permitir TODOS los subdominios de clientes
CORS_ORIGINS=https://fluxionia.co,https://www.fluxionia.co,https://granja.fluxionia.co,https://*.fluxionia.co

# O mejor aún, usar regex en el código:
CORS_ALLOW_PATTERN=^https:\/\/([a-z0-9-]+\.)?fluxionia\.co$
```

### 8.2 Frontend

```bash
# frontend/.env.production
VITE_API_URL=https://api.fluxionia.co
VITE_DOMAIN=fluxionia.co

# El tenant_id se extraerá dinámicamente del hostname
# granja.fluxionia.co → tenant_id: "granja"
# cliente2.fluxionia.co → tenant_id: "cliente2"
```

---

## PASO 8.5: Implementación Multi-Tenant en el Código 🔧

Esta sección es **CRUCIAL** para que tu aplicación funcione correctamente con subdominios por cliente.

### 8.5.1 Backend: Extraer Tenant ID del Hostname

**`backend/main.py`** - Middleware para detectar tenant:

```python
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import re

app = FastAPI()

# Configurar CORS para permitir todos los subdominios
DOMAIN = "fluxionia.co"
CORS_PATTERN = re.compile(r"^https:\/\/([a-z0-9-]+\.)?fluxionia\.co$")

# Lista de subdominios permitidos
ALLOWED_TENANTS = ["granja", "cliente2", "admin"]

@app.middleware("http")
async def extract_tenant_middleware(request: Request, call_next):
    """
    Middleware que extrae el tenant_id del hostname
    Ejemplos:
    - granja.fluxionia.co → tenant_id: "granja"
    - api.fluxionia.co → tenant_id: None (es la API)
    - fluxionia.co → tenant_id: None (landing page)
    """
    host = request.headers.get("host", "")

    # Extraer subdomain
    # Patrón: {tenant}.fluxionia.co
    match = re.match(r"^([a-z0-9-]+)\.fluxionia\.co", host)

    if match:
        tenant_id = match.group(1)

        # Ignorar subdominios especiales (no son tenants)
        if tenant_id in ["api", "www", "admin", "etl"]:
            request.state.tenant_id = None
        elif tenant_id in ALLOWED_TENANTS:
            request.state.tenant_id = tenant_id
        else:
            # Tenant no reconocido
            raise HTTPException(status_code=404, detail="Tenant not found")
    else:
        # Dominio principal (landing page)
        request.state.tenant_id = None

    response = await call_next(request)
    return response


# CORS dinámico para todos los subdominios
def is_allowed_origin(origin: str) -> bool:
    """Verifica si el origin está permitido"""
    return bool(CORS_PATTERN.match(origin))

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https:\/\/([a-z0-9-]+\.)?fluxionia\.co$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Usar tenant_id en endpoints
@app.get("/api/v1/inventory")
async def get_inventory(request: Request):
    tenant_id = request.state.tenant_id

    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant required")

    # Query con filtro por tenant
    query = f"""
        SELECT * FROM inventory
        WHERE tenant_id = '{tenant_id}'
        ORDER BY created_at DESC
    """

    # ... ejecutar query

    return {"tenant_id": tenant_id, "data": []}


@app.get("/api/v1/stats")
async def get_stats(request: Request):
    tenant_id = request.state.tenant_id

    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant required")

    # Stats específicos del tenant
    # ...

    return {"tenant_id": tenant_id, "stats": {}}
```

### 8.5.2 Frontend: Detectar Tenant y Configurar

**`frontend/src/utils/tenant.ts`** - Utilidad para detectar tenant:

```typescript
/**
 * Extrae el tenant_id del hostname actual
 * @returns tenant_id o null si no hay tenant
 */
export function getTenantId(): string | null {
  const hostname = window.location.hostname;

  // Desarrollo local
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Puedes usar query param para testing: ?tenant=granja
    const params = new URLSearchParams(window.location.search);
    return params.get('tenant') || 'granja'; // Default para dev
  }

  // Producción: extraer de subdomain
  // Patrón: {tenant}.fluxionia.co
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

/**
 * Obtiene la configuración del tenant
 */
export interface TenantConfig {
  id: string;
  name: string;
  logo?: string;
  primaryColor?: string;
  features: string[];
}

const TENANT_CONFIGS: Record<string, TenantConfig> = {
  granja: {
    id: 'granja',
    name: 'La Granja Mercado',
    logo: '/logos/granja.png',
    primaryColor: '#10b981', // verde
    features: ['inventory', 'sales', 'ai-insights'],
  },
  cliente2: {
    id: 'cliente2',
    name: 'Cliente 2 S.A.',
    logo: '/logos/cliente2.png',
    primaryColor: '#3b82f6', // azul
    features: ['inventory', 'sales'],
  },
};

export function getTenantConfig(tenantId: string): TenantConfig | null {
  return TENANT_CONFIGS[tenantId] || null;
}
```

**`frontend/src/main.tsx`** - Inicializar app con tenant:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { getTenantId, getTenantConfig } from './utils/tenant';
import './index.css';

// Detectar tenant al cargar la app
const tenantId = getTenantId();

if (!tenantId) {
  // Redirigir a landing page o mostrar error
  window.location.href = 'https://fluxionia.co';
} else {
  const tenantConfig = getTenantConfig(tenantId);

  if (!tenantConfig) {
    // Tenant no encontrado
    console.error(`Tenant '${tenantId}' not found`);
    // Mostrar página de error
  } else {
    // Guardar en contexto global
    (window as any).__TENANT_ID__ = tenantId;
    (window as any).__TENANT_CONFIG__ = tenantConfig;

    // Aplicar branding del tenant
    document.title = `${tenantConfig.name} - Fluxion AI`;

    // Renderizar app
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App tenantId={tenantId} tenantConfig={tenantConfig} />
      </React.StrictMode>
    );
  }
}
```

**`frontend/src/App.tsx`** - Usar tenant en la app:

```typescript
import React, { createContext, useContext } from 'react';
import { TenantConfig } from './utils/tenant';

interface AppProps {
  tenantId: string;
  tenantConfig: TenantConfig;
}

const TenantContext = createContext<TenantConfig | null>(null);

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantContext');
  }
  return context;
}

function App({ tenantId, tenantConfig }: AppProps) {
  return (
    <TenantContext.Provider value={tenantConfig}>
      <div className="app" style={{ '--primary-color': tenantConfig.primaryColor } as any}>
        <header>
          {tenantConfig.logo && <img src={tenantConfig.logo} alt={tenantConfig.name} />}
          <h1>{tenantConfig.name}</h1>
        </header>

        <main>
          {/* Tu app aquí */}
        </main>
      </div>
    </TenantContext.Provider>
  );
}

export default App;
```

**`frontend/src/services/api.ts`** - Cliente API con tenant:

```typescript
import axios from 'axios';
import { getTenantId } from '../utils/tenant';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.fluxionia.co';

// Cliente axios con tenant header
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar tenant en cada request
apiClient.interceptors.request.use((config) => {
  const tenantId = getTenantId();

  if (tenantId) {
    // Opción 1: Vía header (recomendado)
    config.headers['X-Tenant-ID'] = tenantId;

    // Opción 2: Vía query param
    // config.params = { ...config.params, tenant: tenantId };
  }

  return config;
});

// Funciones de API
export async function getInventory() {
  const response = await apiClient.get('/api/v1/inventory');
  return response.data;
}

export async function getStats() {
  const response = await apiClient.get('/api/v1/stats');
  return response.data;
}
```

### 8.5.3 CloudFront: Forwarding Headers

**IMPORTANTE**: CloudFront debe forwarding el header `Host` al origin para que el backend pueda extraer el tenant.

En el CDK stack:

```typescript
const distribution = new cloudfront.Distribution(this, 'FluxionCDN', {
  defaultBehavior: {
    origin: new origins.S3Origin(frontendBucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,

    // Cachear según el hostname para tener cache separado por tenant
    cachePolicy: new cloudfront.CachePolicy(this, 'TenantCachePolicy', {
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Host'),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      defaultTtl: cdk.Duration.hours(24),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.seconds(0),
    }),
  },
  // ...resto de config
});
```

### 8.5.4 DuckDB: Schema Multi-Tenant

Asegúrate de que todas las tablas tengan `tenant_id`:

```sql
-- Ejemplo: Tabla de inventario multi-tenant
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(50) NOT NULL,  -- 'granja', 'cliente2', etc.
    store_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Índice compuesto para queries eficientes por tenant
    CONSTRAINT unique_tenant_store_product UNIQUE (tenant_id, store_id, product_id)
);

CREATE INDEX idx_inventory_tenant ON inventory(tenant_id);
CREATE INDEX idx_inventory_tenant_store ON inventory(tenant_id, store_id);
```

---

## PASO 9: Verificación Final

### 9.1 Checklist de Verificación

```bash
# ✅ 1. Dominio registrado en Cloudflare
whois fluxionia.co | grep "Registrar:"

# ✅ 2. Nameservers apuntando a AWS
dig NS fluxionia.co +short

# ✅ 3. Hosted Zone creada en Route 53
aws route53 list-hosted-zones --query "HostedZones[?Name=='fluxionia.co.']"

# ✅ 4. Certificado SSL WILDCARD emitido
aws acm list-certificates --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='fluxionia.co']"

# ✅ 5. DNS resolviendo correctamente
dig fluxionia.co +short
dig www.fluxionia.co +short
dig api.fluxionia.co +short
dig granja.fluxionia.co +short
dig admin.fluxionia.co +short

# ✅ 6. HTTPS funcionando en todos los subdominios
curl -I https://fluxionia.co
curl -I https://api.fluxionia.co
curl -I https://granja.fluxionia.co

# ✅ 7. Certificado wildcard válido
openssl s_client -connect granja.fluxionia.co:443 -servername granja.fluxionia.co \
  2>/dev/null | openssl x509 -noout -dates

# ✅ 8. Multi-tenancy funcionando (backend)
curl https://api.fluxionia.co/api/v1/stats \
  -H "Host: granja.fluxionia.co" \
  -H "X-Tenant-ID: granja"

# ✅ 9. Frontend cargando para cada tenant
curl https://granja.fluxionia.co | grep "La Granja"
```

### 9.2 Tests de Performance

```bash
# Test de carga DNS
time dig fluxion.ai

# Test de latencia HTTPS
curl -w "@curl-format.txt" -o /dev/null -s https://app.fluxion.ai

# Verificar CDN headers
curl -I https://app.fluxion.ai | grep -i "x-cache"
```

---

## PASO 10: Configuración de Email (Opcional)

### 10.1 Configurar MX Records para Email

```bash
# Ejemplo con Google Workspace
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "fluxion.ai",
        "Type": "MX",
        "TTL": 3600,
        "ResourceRecords": [
          {"Value": "1 ASPMX.L.GOOGLE.COM"},
          {"Value": "5 ALT1.ASPMX.L.GOOGLE.COM"},
          {"Value": "5 ALT2.ASPMX.L.GOOGLE.COM"}
        ]
      }
    }]
  }'
```

### 10.2 Configurar SPF, DKIM, DMARC

```bash
# SPF Record
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "fluxion.ai",
        "Type": "TXT",
        "TTL": 3600,
        "ResourceRecords": [
          {"Value": "\"v=spf1 include:_spf.google.com ~all\""}
        ]
      }
    }]
  }'
```

---

## Resumen de Arquitectura Final Multi-Tenant

```
CLOUDFLARE (Registrar)
    ↓ Nameservers
AWS ROUTE 53 (DNS Manager)
    ├── fluxionia.co → CloudFront (Landing Page)
    ├── www.fluxionia.co → fluxionia.co (Redirect)
    ├── api.fluxionia.co → ALB (Backend API Multi-Tenant)
    │
    ├── 🏢 CLIENTES (Multi-Tenant):
    ├── granja.fluxionia.co → CloudFront (La Granja App)
    ├── cliente2.fluxionia.co → CloudFront (Cliente 2 App)
    ├── cliente3.fluxionia.co → CloudFront (Cliente 3 App)
    │
    ├── 🔧 ADMIN:
    ├── admin.fluxionia.co → CloudFront (Super Admin Panel)
    │
    └── MX Records → Google Workspace (Email - opcional)

CloudFront Distribution (ÚNICO para todos los tenants)
    ├── SSL/TLS Certificate Wildcard (*.fluxionia.co)
    ├── CNAMEs: fluxionia.co, granja.fluxionia.co, cliente2.fluxionia.co, admin.fluxionia.co
    ├── Cache Policy: Separado por hostname
    └── Origin: S3 Bucket (Frontend Build - SPA)

Application Load Balancer (Multi-Tenant Backend)
    ├── SSL/TLS Certificate (*.fluxionia.co)
    ├── CNAME: api.fluxionia.co
    ├── Middleware: Extrae tenant_id del hostname/header
    └── Targets: ECS Fargate (Backend FastAPI)
        └── DuckDB con tenant_id en todas las tablas
```

---

## Costos Estimados (Multi-Tenant)

| Servicio | Costo Mensual (USD) | Notas |
|----------|---------------------|-------|
| Cloudflare Domain (.co) | ~$2-3/mes (amortizado) | $20-30/año |
| Route 53 Hosted Zone | $0.50/zona | 1 zona para todos los tenants |
| Route 53 Queries | $0.40/millón | ~$1-2/mes estimado |
| ACM Certificates (Wildcard) | **GRATIS** | *.fluxionia.co incluye todo |
| CloudFront | $0.085/GB + $0.01/10k requests | Compartido entre tenants |
| **TOTAL DNS/CDN** | **~$4-6/mes** | **¡Muy económico!** |

### Ventajas del Modelo Multi-Tenant

✅ **Un solo certificado wildcard** cubre todos los subdominios de clientes
✅ **Una sola Hosted Zone** en Route 53 para todos
✅ **Un solo CloudFront Distribution** sirve a todos los tenants
✅ **Agregar nuevos clientes es casi GRATIS** (solo costo de compute/storage)

**Costos NO incluidos aquí:**
- Backend (ECS Fargate): ~$30-50/mes (compartido)
- Database (EFS/RDS): ~$10-20/mes (compartido)
- Data Transfer: Variable según uso

**Total estimado con infraestructura completa:** ~$50-80/mes para TODOS los clientes

**Nota importante:** El dominio .co es mucho más económico que .ai (~$100/año vs ~$30/año)

---

## Troubleshooting

### DNS no resuelve después de 48 horas

```bash
# Verificar NS records en Cloudflare:
dig NS fluxion.ai @1.1.1.1

# Forzar flush de DNS local:
sudo dscacheutil -flushcache  # macOS
ipconfig /flushdns  # Windows
```

### Certificado SSL no valida

```bash
# Verificar registros CNAME de validación:
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:123456789012:certificate/abc-123 \
  --query 'Certificate.DomainValidationOptions'

# Agregar manualmente si es necesario
```

### CloudFront devuelve error 403

- Verificar que el S3 bucket tenga política pública
- Verificar que CloudFront tenga OAI (Origin Access Identity) configurado
- Verificar que el certificado incluya el dominio en CNAMEs

---

## BONUS: Cómo Agregar un Nuevo Cliente 🎯

Este proceso debe ser rápido y automatizado. Aquí está el flujo completo:

### Paso 1: Crear Registro DNS (1 minuto)

```bash
# Opción A: AWS CLI
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "nuevocliente.fluxionia.co",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "d1234567890.cloudfront.net",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }'

# Opción B: Actualizar CDK stack y deploy
# Agregar 'nuevocliente' al array de tenants en infrastructure/lib/infrastructure-stack.ts
```

### Paso 2: Actualizar CloudFront CNAMEs (2 minutos)

```bash
# AWS Console > CloudFront > Distribution > Edit
# Agregar: nuevocliente.fluxionia.co a "Alternate domain names"
# Save
```

**Nota**: El certificado wildcard ya cubre este subdominio, no necesitas crear uno nuevo!

### Paso 3: Agregar Configuración del Tenant (5 minutos)

**`frontend/src/utils/tenant.ts`**:

```typescript
const TENANT_CONFIGS: Record<string, TenantConfig> = {
  granja: { ... },
  cliente2: { ... },

  // ⬇️ NUEVO CLIENTE
  nuevocliente: {
    id: 'nuevocliente',
    name: 'Nuevo Cliente S.A.',
    logo: '/logos/nuevocliente.png',
    primaryColor: '#f59e0b', // naranja
    features: ['inventory', 'sales', 'ai-insights'],
  },
};
```

**`backend/main.py`**:

```python
# Agregar a la lista de tenants permitidos
ALLOWED_TENANTS = ["granja", "cliente2", "nuevocliente"]  # ⬅️ Agregar aquí
```

### Paso 4: Crear Datos del Tenant en DB (10 minutos)

```sql
-- Script de onboarding
INSERT INTO tenants (tenant_id, name, status, created_at)
VALUES ('nuevocliente', 'Nuevo Cliente S.A.', 'active', NOW());

-- Crear registros iniciales si es necesario
INSERT INTO stores (tenant_id, store_id, name, city)
VALUES
  ('nuevocliente', 'store_1', 'Sucursal Principal', 'Caracas'),
  ('nuevocliente', 'store_2', 'Sucursal Centro', 'Valencia');

-- Verificar
SELECT * FROM tenants WHERE tenant_id = 'nuevocliente';
```

### Paso 5: Deploy y Verificar (5 minutos)

```bash
# 1. Commit cambios
git add .
git commit -m "feat: onboard nuevo cliente - nuevocliente"
git push

# 2. Deploy frontend
cd frontend
npm run build
aws s3 sync dist/ s3://fluxion-frontend/ --delete

# 3. Invalidar cache CloudFront
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"

# 4. Deploy backend (si cambió)
# ECS se actualiza automáticamente con CI/CD

# 5. Verificar
curl -I https://nuevocliente.fluxionia.co
# Debería devolver 200 OK

# 6. Test en browser
open https://nuevocliente.fluxionia.co
```

### Paso 6: Configurar Branding (Opcional)

1. Subir logo del cliente a `/public/logos/nuevocliente.png`
2. Configurar colores en `tenant.ts`
3. Agregar features específicas del cliente

### Checklist de Onboarding

- [ ] Crear DNS record en Route 53
- [ ] Agregar CNAME a CloudFront
- [ ] Agregar tenant config en frontend (`tenant.ts`)
- [ ] Agregar tenant a `ALLOWED_TENANTS` en backend
- [ ] Crear registro en tabla `tenants` en DB
- [ ] Subir logo del cliente (opcional)
- [ ] Deploy frontend y backend
- [ ] Invalidar cache CloudFront
- [ ] Verificar acceso: `https://nuevocliente.fluxionia.co`
- [ ] Test de funcionalidad (login, inventory, etc.)
- [ ] Notificar al cliente con credenciales

**Tiempo total estimado**: ~25 minutos

### Automatización Futura

Puedes crear un script para automatizar todo esto:

```bash
#!/bin/bash
# scripts/onboard-tenant.sh

TENANT_ID=$1
TENANT_NAME=$2

if [ -z "$TENANT_ID" ] || [ -z "$TENANT_NAME" ]; then
  echo "Usage: ./onboard-tenant.sh <tenant_id> <tenant_name>"
  exit 1
fi

echo "Onboarding tenant: $TENANT_ID ($TENANT_NAME)"

# 1. Crear DNS record
echo "Creating DNS record..."
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{...}'

# 2. Agregar a tenant config (requiere edición manual)
echo "⚠️  Manual step: Add to frontend/src/utils/tenant.ts"

# 3. Crear en DB
echo "Creating tenant in database..."
duckdb $DB_PATH << EOF
INSERT INTO tenants (tenant_id, name, status, created_at)
VALUES ('$TENANT_ID', '$TENANT_NAME', 'active', NOW());
EOF

# 4. Deploy
echo "Deploying changes..."
cd frontend && npm run build
aws s3 sync dist/ s3://fluxion-frontend/ --delete

echo "✅ Tenant $TENANT_ID onboarded successfully!"
echo "🌐 URL: https://$TENANT_ID.fluxionia.co"
```

---

## Próximos Pasos

1. **Implementar Landing Page**: Crear página en `fluxionia.co` para marketing
2. **Configurar CDN Caching**: Optimizar headers y TTL por tenant
3. **Implementar WAF**: Web Application Firewall para seguridad
4. **Configurar Monitoring**: CloudWatch + Route 53 health checks por tenant
5. **Setup de Email**: Google Workspace o AWS SES
6. **Automatizar Onboarding**: Script completo para nuevos clientes
7. **Crear Panel Admin**: `admin.fluxionia.co` para gestionar tenants

---

## Referencias

### Documentación Oficial
- [AWS Route 53 Documentation](https://docs.aws.amazon.com/route53/)
- [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)
- [AWS Certificate Manager (ACM)](https://docs.aws.amazon.com/acm/)
- [AWS CDK Route 53 Constructs](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_route53-readme.html)
- [CloudFront Custom Domains](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html)

### Multi-Tenancy Resources
- [Multi-Tenant SaaS Best Practices](https://aws.amazon.com/solutions/saas/)
- [Subdomain-based Tenant Isolation](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/subdomain-based-isolation.html)
- [FastAPI Middleware Guide](https://fastapi.tiangolo.com/tutorial/middleware/)

### Tools
- [DNS Propagation Checker](https://www.whatsmydns.net/)
- [SSL Certificate Checker](https://www.sslshopper.com/ssl-checker.html)
- [CloudFront Distribution ID Finder](https://console.aws.amazon.com/cloudfront/)

---

## Conclusión

Has configurado exitosamente una arquitectura **multi-tenant completa** con:

✅ **Dominio**: `fluxionia.co` registrado en Cloudflare ($20-30/año)
✅ **DNS**: Gestionado por AWS Route 53 (escalable y confiable)
✅ **SSL**: Certificado wildcard GRATIS cubriendo todos los subdominios
✅ **Subdominios por cliente**: `granja.fluxionia.co`, `cliente2.fluxionia.co`, etc.
✅ **Infraestructura compartida**: CloudFront + ALB + ECS (económico)
✅ **Código multi-tenant**: Backend y frontend preparados
✅ **Onboarding rápido**: ~25 minutos por nuevo cliente

### Beneficios Clave

1. **Económico**: ~$50-80/mes para TODOS los clientes (vs $50/mes por cliente)
2. **Escalable**: Agregar clientes es casi instantáneo
3. **Profesional**: Cada cliente tiene su propio dominio branded
4. **Seguro**: Aislamiento de datos por tenant_id
5. **Flexible**: Fácil personalizar por cliente (logos, colores, features)

### Próximo Paso INMEDIATO

**¡Comprar el dominio `fluxionia.co` en Cloudflare AHORA!**

```bash
# 1. Ir a Cloudflare
https://dash.cloudflare.com/

# 2. Buscar y comprar "fluxionia.co"

# 3. Seguir esta guía paso a paso
```

¿Preguntas? Consulta la sección de Troubleshooting o las referencias arriba.

**¡Buena suerte con Fluxion AI!** 🚀
