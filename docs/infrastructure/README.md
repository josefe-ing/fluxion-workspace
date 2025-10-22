# Infraestructura - Fluxion AI

Documentación completa de la arquitectura de infraestructura multi-tenant de Fluxion AI.

## 📚 Documentos Disponibles

### 1. [Guía Completa: Cloudflare + AWS Domain Setup](./cloudflare-aws-domain-setup.md)
**Guía paso a paso completa** con todos los comandos y configuraciones necesarias.

**Incluye:**
- Compra de dominio en Cloudflare
- Configuración de Route 53
- Certificados SSL wildcard
- Implementación multi-tenant en código (Backend + Frontend)
- Scripts de automatización
- Troubleshooting

📖 **Lee esto primero** si vas a configurar los dominios desde cero.

---

### 2. [Resumen Ejecutivo: Estrategia de Dominios](./domain-strategy-summary.md)
**Resumen de 1 página** con la decisión de arquitectura y justificación.

**Incluye:**
- Estructura de subdominios
- Comparación de alternativas
- Costos proyectados
- Flujo de onboarding

💡 **Lee esto** para entender la decisión de arquitectura rápidamente.

---

### 3. [Arquitectura Multi-Tenant Detallada](./multi-tenant-architecture.md)
**Diagrama técnico completo** con implementación a nivel de código.

**Incluye:**
- Diagrama ASCII detallado del flujo completo
- Ejemplos de código (Backend, Frontend, DB)
- Estrategias de seguridad
- Performance considerations

🔧 **Lee esto** para implementar el multi-tenancy en el código.

---

## 🎯 Quick Start

### Estructura de Dominios Final

```
fluxionia.co                    → Landing page (producto/empresa)
www.fluxionia.co                → Redirect a fluxionia.co
api.fluxionia.co                → Backend API (FastAPI)

🏢 CLIENTES:
granja.fluxionia.co             → La Granja Mercado
cliente2.fluxionia.co           → Cliente 2
cliente3.fluxionia.co           → Cliente 3

🔧 ADMIN:
admin.fluxionia.co              → Panel super-admin
```

### Decisión Clave

**Modelo**: Subdominios por cliente (multi-tenant)
**Dominio**: `fluxionia.co` (registrado en Cloudflare)
**DNS**: Gestionado por AWS Route 53
**SSL**: Certificado wildcard `*.fluxionia.co` (GRATIS vía ACM)

### Ventajas

- ✅ **Económico**: $50-80/mes para TODOS los clientes
- ✅ **Escalable**: Agregar cliente en ~25 minutos
- ✅ **Profesional**: Cada cliente tiene su URL única
- ✅ **Seguro**: Aislamiento total de datos por tenant

---

## 🚀 Pasos para Implementar

### Fase 1: Setup de Dominio (1 día)

1. Comprar `fluxionia.co` en Cloudflare (~$30/año)
2. Crear Hosted Zone en Route 53
3. Delegar nameservers a AWS
4. Solicitar certificado wildcard en ACM
5. Configurar CloudFront con CNAMEs
6. Crear registros DNS para subdominios

📖 **Guía**: [cloudflare-aws-domain-setup.md](./cloudflare-aws-domain-setup.md) - Sección 1-6

### Fase 2: Implementación Multi-Tenant (2 días)

1. **Backend**: Implementar middleware de tenant detection
2. **Frontend**: Implementar detección de tenant desde hostname
3. **Database**: Agregar `tenant_id` a todas las tablas
4. **Testing**: Probar con múltiples subdominios localmente

📖 **Guía**: [multi-tenant-architecture.md](./multi-tenant-architecture.md)

### Fase 3: Deploy y Migración (1 día)

1. Deploy de infraestructura con CDK
2. Migrar La Granja a `granja.fluxionia.co`
3. Crear landing page en `fluxionia.co`
4. Configurar monitoreo por tenant

📖 **Guía**: [cloudflare-aws-domain-setup.md](./cloudflare-aws-domain-setup.md) - Sección 7-10

---

## 📊 Costos Estimados

### Con 1 cliente (actual)
- Dominio: $2.50/mes
- Route 53: $0.50/mes
- CloudFront: $3-5/mes
- Backend/DB: $30-40/mes
- **Total**: ~$40-50/mes

### Con 10 clientes
- Infraestructura compartida: ~$55-75/mes
- **Costo por cliente**: ~$5.50-7.50/mes

### Con 100 clientes
- Infraestructura compartida: ~$100-150/mes
- **Costo por cliente**: ~$1-1.50/mes

---

## 🎓 Flujo de Onboarding de Nuevo Cliente

```bash
# 1. Crear DNS record (1 min)
aws route53 change-resource-record-sets ...

# 2. Actualizar CloudFront (2 min)
# Agregar CNAME en console

# 3. Agregar config de tenant (5 min)
# frontend/src/utils/tenant.ts
# backend/main.py

# 4. Crear datos en DB (10 min)
INSERT INTO tenants (tenant_id, name) VALUES ('nuevocliente', 'Nuevo Cliente');

# 5. Deploy (5 min)
npm run build
aws s3 sync dist/ s3://fluxion-frontend/
aws cloudfront create-invalidation ...

# ✅ Cliente activo en https://nuevocliente.fluxionia.co
```

**Tiempo total**: ~25 minutos

📖 **Guía completa**: [cloudflare-aws-domain-setup.md](./cloudflare-aws-domain-setup.md) - Sección "BONUS"

---

## 🛠️ Stack Tecnológico

### DNS & CDN
- **Registrar**: Cloudflare
- **DNS Manager**: AWS Route 53
- **CDN**: AWS CloudFront
- **SSL**: AWS Certificate Manager (ACM)

### Backend
- **Runtime**: Python 3.11 + FastAPI
- **Container**: Docker + ECS Fargate
- **Load Balancer**: Application Load Balancer
- **Database**: DuckDB en EFS

### Frontend
- **Framework**: React + TypeScript + Vite
- **Hosting**: S3 + CloudFront
- **Routing**: React Router (client-side)

### Multi-Tenancy
- **Detection**: Hostname parsing (subdomain)
- **Isolation**: tenant_id column en todas las tablas
- **Caching**: CloudFront cache keys por hostname

---

## 📁 Otros Documentos de Infraestructura

- [VPN Setup (WireGuard)](./vpn-setup-complete.md)
- [VPN Site-to-Site](./vpn-site-to-site.md)
- [Backup Strategy](./backup-strategy.md)
- [EFS Encryption Migration](../operations/EFS_ENCRYPTION_MIGRATION_PLAN.md)
- [Security Audit](../operations/SECURITY_AUDIT_2025-10.md)

---

## 🔗 Links Útiles

### AWS Resources
- [Route 53 Console](https://console.aws.amazon.com/route53/)
- [CloudFront Console](https://console.aws.amazon.com/cloudfront/)
- [ACM Console](https://console.aws.amazon.com/acm/)
- [ECS Console](https://console.aws.amazon.com/ecs/)

### Cloudflare
- [Cloudflare Dashboard](https://dash.cloudflare.com/)
- [Domain Registration](https://dash.cloudflare.com/domains)

### Tools
- [DNS Propagation Checker](https://www.whatsmydns.net/)
- [SSL Certificate Checker](https://www.sslshopper.com/ssl-checker.html)

---

## 🆘 Soporte

### Problemas Comunes

**DNS no resuelve:**
```bash
# Verificar nameservers
dig NS fluxionia.co +short

# Verificar propagación
# https://www.whatsmydns.net/#NS/fluxionia.co
```

**Certificado SSL no válido:**
```bash
# Verificar estado en ACM
aws acm describe-certificate --certificate-arn <arn>

# Verificar CNAMEs en CloudFront
aws cloudfront get-distribution --id <distribution-id>
```

**Tenant no detectado:**
```bash
# Backend: verificar logs
docker logs <container-id> | grep "tenant_id"

# Frontend: abrir DevTools Console
getTenantId() // debería devolver el tenant_id
```

📖 **Troubleshooting completo**: [cloudflare-aws-domain-setup.md](./cloudflare-aws-domain-setup.md) - Sección "Troubleshooting"

---

## 📝 Changelog

### 2025-10-22
- ✅ Documentación completa de multi-tenancy
- ✅ Guía de setup Cloudflare + AWS
- ✅ Diagramas de arquitectura
- ✅ Scripts de onboarding

---

**Maintainer**: Jose (josefe-ing)
**Last Updated**: Octubre 2025
