# ✅ Checklist: Configuración de Dominios Multi-Tenant

**Proyecto**: Fluxion AI
**Dominio**: fluxionia.co
**Arquitectura**: Multi-Tenant con subdominios por cliente

---

## 📋 FASE 1: Compra de Dominio (30 min)

- [ ] **Crear cuenta en Cloudflare**
  - URL: https://dash.cloudflare.com/sign-up
  - Email: _________________
  - Password: _________________

- [ ] **Comprar dominio fluxionia.co**
  - Precio estimado: $20-30/año
  - Habilitar WHOIS Privacy Protection ✓
  - Habilitar Auto-renew ✓

- [ ] **Verificar compra**
  ```bash
  whois fluxionia.co | grep "Registrar:"
  # Debe decir: Cloudflare
  ```

---

## 📋 FASE 2: Configuración AWS Route 53 (1 hora)

- [ ] **Crear Hosted Zone en Route 53**
  ```bash
  aws route53 create-hosted-zone \
    --name fluxionia.co \
    --caller-reference "$(date +%Y%m%d-%H%M%S)"
  ```
  - Hosted Zone ID: _________________

- [ ] **Guardar nameservers de AWS**
  ```bash
  aws route53 get-hosted-zone --id /hostedzone/_______________
  ```
  - NS 1: _________________
  - NS 2: _________________
  - NS 3: _________________
  - NS 4: _________________

- [ ] **Delegar DNS a Route 53 en Cloudflare**
  - Cloudflare Dashboard > Domain > Configuration > Nameservers
  - Cambiar a "Custom Nameservers"
  - Pegar los 4 nameservers de AWS
  - Guardar cambios

- [ ] **Verificar propagación DNS (esperar 1-24 horas)**
  ```bash
  dig NS fluxionia.co +short
  # Debe mostrar los nameservers de AWS
  ```
  - Propagación URL: https://www.whatsmydns.net/#NS/fluxionia.co

---

## 📋 FASE 3: Certificados SSL (30 min)

- [ ] **Solicitar certificado wildcard en ACM**
  ```bash
  aws acm request-certificate \
    --domain-name fluxionia.co \
    --subject-alternative-names "*.fluxionia.co" \
    --validation-method DNS \
    --region us-east-1
  ```
  - Certificate ARN: _________________

- [ ] **Agregar registros CNAME de validación a Route 53**
  - ACM te dará un registro CNAME
  - Copiarlo a Route 53 (automático con CDK)

- [ ] **Verificar certificado emitido (5-30 min)**
  ```bash
  aws acm describe-certificate --certificate-arn <arn> \
    --query 'Certificate.Status'
  # Debe decir: "ISSUED"
  ```

---

## 📋 FASE 4: Configurar Registros DNS (30 min)

- [ ] **Dominio principal (landing page)**
  ```bash
  # fluxionia.co → CloudFront
  aws route53 change-resource-record-sets ...
  ```

- [ ] **WWW redirect**
  ```bash
  # www.fluxionia.co → fluxionia.co
  aws route53 change-resource-record-sets ...
  ```

- [ ] **API subdomain**
  ```bash
  # api.fluxionia.co → ALB
  aws route53 change-resource-record-sets ...
  ```

- [ ] **Cliente: La Granja**
  ```bash
  # granja.fluxionia.co → CloudFront
  aws route53 change-resource-record-sets ...
  ```

- [ ] **Admin panel**
  ```bash
  # admin.fluxionia.co → CloudFront
  aws route53 change-resource-record-sets ...
  ```

- [ ] **Verificar DNS**
  ```bash
  dig fluxionia.co +short
  dig www.fluxionia.co +short
  dig api.fluxionia.co +short
  dig granja.fluxionia.co +short
  dig admin.fluxionia.co +short
  ```

---

## 📋 FASE 5: Implementar Multi-Tenancy en Código (1 día)

### Backend (FastAPI)

- [ ] **Crear middleware de tenant detection**
  - Archivo: `backend/middleware/tenant.py`
  - Función: Extraer tenant_id del hostname o header
  - Validar tenant contra lista permitida

- [ ] **Actualizar CORS para permitir subdominios**
  ```python
  allow_origin_regex=r"^https:\/\/([a-z0-9-]+\.)?fluxionia\.co$"
  ```

- [ ] **Agregar dependency `require_tenant` a endpoints**
  ```python
  @app.get("/api/v1/inventory")
  async def get_inventory(tenant_id: str = Depends(require_tenant)):
      # ...
  ```

- [ ] **Actualizar queries para filtrar por tenant_id**
  ```python
  SELECT * FROM inventory WHERE tenant_id = '{tenant_id}'
  ```

### Frontend (React + TypeScript)

- [ ] **Crear utilidad de detección de tenant**
  - Archivo: `frontend/src/utils/tenant.ts`
  - Función: `getTenantId()` extrae subdomain
  - Interface: `TenantConfig`
  - Config: `TENANT_CONFIGS` object

- [ ] **Actualizar `main.tsx` para detectar tenant al inicio**
  ```typescript
  const tenantId = getTenantId();
  const config = getTenantConfig(tenantId);
  ```

- [ ] **Crear contexto de tenant en App.tsx**
  ```typescript
  const TenantContext = createContext<TenantConfig | null>(null);
  ```

- [ ] **Actualizar API client para incluir tenant**
  ```typescript
  config.headers['X-Tenant-ID'] = tenantId;
  ```

### Database (DuckDB)

- [ ] **Agregar columna `tenant_id` a todas las tablas**
  ```sql
  ALTER TABLE inventory ADD COLUMN tenant_id VARCHAR(50) NOT NULL;
  ALTER TABLE ventas ADD COLUMN tenant_id VARCHAR(50) NOT NULL;
  ALTER TABLE productos ADD COLUMN tenant_id VARCHAR(50) NOT NULL;
  ```

- [ ] **Crear índices con tenant_id**
  ```sql
  CREATE INDEX idx_inventory_tenant ON inventory(tenant_id);
  CREATE INDEX idx_ventas_tenant ON ventas(tenant_id);
  ```

- [ ] **Crear tabla de tenants**
  ```sql
  CREATE TABLE tenants (
    tenant_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```

- [ ] **Migrar datos existentes a tenant 'granja'**
  ```sql
  UPDATE inventory SET tenant_id = 'granja' WHERE tenant_id IS NULL;
  UPDATE ventas SET tenant_id = 'granja' WHERE tenant_id IS NULL;
  ```

---

## 📋 FASE 6: Configurar CloudFront (1 hora)

- [ ] **Actualizar CloudFront distribution**
  - Agregar CNAMEs:
    - `fluxionia.co`
    - `www.fluxionia.co`
    - `granja.fluxionia.co`
    - `admin.fluxionia.co`

- [ ] **Asociar certificado SSL wildcard**
  - Custom SSL certificate: Seleccionar cert de ACM
  - Security policy: TLSv1.2_2021

- [ ] **Configurar cache policy**
  - Header behavior: Whitelist "Host"
  - Query string behavior: All
  - Cookie behavior: None

- [ ] **Configurar error responses para SPA**
  - 404 → 200, /index.html

---

## 📋 FASE 7: Configurar ALB (30 min)

- [ ] **Crear listener HTTPS en ALB**
  ```bash
  aws elbv2 create-listener \
    --load-balancer-arn <arn> \
    --protocol HTTPS \
    --port 443 \
    --certificates CertificateArn=<cert-arn>
  ```

- [ ] **Verificar target group apunta a ECS tasks**

- [ ] **Verificar health checks configurados**

---

## 📋 FASE 8: Deploy con CDK (2 horas)

- [ ] **Actualizar CDK stack**
  - Archivo: `infrastructure/lib/infrastructure-stack.ts`
  - Importar Hosted Zone
  - Crear certificado
  - Configurar CloudFront con CNAMEs
  - Crear registros DNS automáticamente

- [ ] **Review cambios**
  ```bash
  cd infrastructure
  npx cdk diff
  ```

- [ ] **Deploy stack**
  ```bash
  npx cdk deploy
  ```

- [ ] **Verificar outputs**
  - CloudFront URL: _________________
  - ALB DNS: _________________

---

## 📋 FASE 9: Build y Deploy Apps (1 hora)

### Frontend

- [ ] **Build producción**
  ```bash
  cd frontend
  npm run build
  ```

- [ ] **Deploy a S3**
  ```bash
  aws s3 sync dist/ s3://fluxion-frontend/ --delete
  ```

- [ ] **Invalidar cache CloudFront**
  ```bash
  aws cloudfront create-invalidation \
    --distribution-id <id> \
    --paths "/*"
  ```

### Backend

- [ ] **Build Docker image**
  ```bash
  cd backend
  docker build -t fluxion-backend .
  ```

- [ ] **Push a ECR**
  ```bash
  docker tag fluxion-backend:latest <ecr-url>/fluxion-backend:latest
  docker push <ecr-url>/fluxion-backend:latest
  ```

- [ ] **Update ECS service**
  ```bash
  aws ecs update-service \
    --cluster fluxion-cluster \
    --service fluxion-backend \
    --force-new-deployment
  ```

---

## 📋 FASE 10: Testing y Verificación (1 hora)

- [ ] **Verificar HTTPS en todos los dominios**
  ```bash
  curl -I https://fluxionia.co
  curl -I https://www.fluxionia.co
  curl -I https://api.fluxionia.co
  curl -I https://granja.fluxionia.co
  curl -I https://admin.fluxionia.co
  ```

- [ ] **Verificar certificado SSL válido**
  ```bash
  openssl s_client -connect granja.fluxionia.co:443 \
    -servername granja.fluxionia.co 2>/dev/null | \
    openssl x509 -noout -dates
  ```

- [ ] **Test multi-tenancy en frontend**
  - Abrir `https://granja.fluxionia.co`
  - Verificar logo de La Granja
  - Verificar colores personalizados
  - DevTools Console: `getTenantId()` → "granja"

- [ ] **Test multi-tenancy en backend**
  ```bash
  curl https://api.fluxionia.co/api/v1/inventory \
    -H "X-Tenant-ID: granja" | jq
  # Debe devolver solo datos de 'granja'
  ```

- [ ] **Test aislamiento de datos**
  ```bash
  curl https://api.fluxionia.co/api/v1/inventory \
    -H "X-Tenant-ID: cliente2" | jq
  # Debe devolver vacío o error (tenant no existe aún)
  ```

- [ ] **Verificar logs**
  ```bash
  # Backend logs
  aws logs tail /ecs/fluxion-backend --follow

  # CloudFront logs (si habilitado)
  aws s3 ls s3://fluxion-cloudfront-logs/
  ```

---

## 📋 FASE 11: Crear Landing Page (Opcional - 1 semana)

- [ ] **Diseñar landing page para fluxionia.co**
  - Hero section
  - Features
  - Pricing
  - Contact form

- [ ] **Implementar en React**
  - Componentes en `frontend/src/pages/Landing.tsx`

- [ ] **Deploy**
  - Mismo proceso que frontend app

---

## 📋 FASE 12: Documentación (Completado ✅)

- [x] **Guía completa de setup**
  - `docs/infrastructure/cloudflare-aws-domain-setup.md`

- [x] **Resumen ejecutivo**
  - `docs/infrastructure/domain-strategy-summary.md`

- [x] **Arquitectura detallada**
  - `docs/infrastructure/multi-tenant-architecture.md`

- [x] **README de infraestructura**
  - `docs/infrastructure/README.md`

- [x] **Checklist de setup** (este archivo)
  - `DOMAIN_SETUP_CHECKLIST.md`

---

## 📊 Resumen de Progreso

```
Total de Fases: 12
Completadas: [ ] / 12

Tiempo Estimado Total: 5-7 días
Tiempo Invertido: ___ días
```

---

## 🎯 Próximos Pasos Inmediatos

1. **HOY**: Comprar dominio `fluxionia.co` en Cloudflare
2. **Mañana**: Configurar Route 53 y certificados SSL
3. **Esta semana**: Implementar multi-tenancy en código
4. **Próxima semana**: Deploy completo y testing

---

## 📞 Soporte

Si encuentras problemas, consulta:
- **Troubleshooting**: `docs/infrastructure/cloudflare-aws-domain-setup.md` (sección final)
- **AWS Support**: https://console.aws.amazon.com/support/
- **Cloudflare Support**: https://support.cloudflare.com/

---

## 📝 Notas

```
Fecha de inicio: _______________
Fecha de completación: _______________
Dominio comprado: [ ] Sí  [ ] No
DNS propagado: [ ] Sí  [ ] No
SSL emitido: [ ] Sí  [ ] No
Multi-tenant funcionando: [ ] Sí  [ ] No

Problemas encontrados:
_______________________________________________________
_______________________________________________________
_______________________________________________________

Soluciones aplicadas:
_______________________________________________________
_______________________________________________________
_______________________________________________________
```

---

**¡Buena suerte!** 🚀

Una vez completado, tendrás una arquitectura multi-tenant profesional, escalable y económica.
