# 🚀 Setup con Cloudflare DNS - fluxionia.co

## Decisión: Usar Cloudflare DNS + AWS Services

**Arquitectura Actualizada:**
- **DNS**: Cloudflare (más simple, no hay propagación)
- **Certificado SSL**: AWS Certificate Manager (ACM)
- **CDN Frontend**: AWS CloudFront + S3
- **Backend**: AWS ALB + ECS Fargate

## ✅ Completado

- [x] Dominio `fluxionia.co` comprado en Cloudflare
- [x] Hosted Zone de Route 53 eliminada (no la necesitamos)
- [x] Código multi-tenant base creado
- [x] Variables de entorno configuradas

## 📋 Plan de Configuración

### PASO 1: Configurar DNS en Cloudflare

Vamos a crear los siguientes registros DNS directamente en Cloudflare:

```
Tipo    Nombre                  Apunta a                        Proxy
----    ------                  --------                        -----
A       fluxionia.co            [CloudFront IP]                 No ☁️
CNAME   www                     fluxionia.co                    No ☁️
CNAME   api                     [ALB DNS]                       No ☁️
CNAME   granja                  [CloudFront DNS]                No ☁️
CNAME   admin                   [CloudFront DNS]                No ☁️
```

**IMPORTANTE**: El Proxy de Cloudflare (☁️) debe estar **DESACTIVADO** (gris) para que AWS pueda emitir certificados SSL.

### PASO 2: Solicitar Certificado SSL en ACM

```bash
aws acm request-certificate \
  --domain-name fluxionia.co \
  --subject-alternative-names "*.fluxionia.co" \
  --validation-method DNS \
  --region us-east-1
```

ACM nos dará registros CNAME de validación que debemos agregar a Cloudflare.

### PASO 3: Crear Registros de Validación en Cloudflare

ACM te dará algo como:

```
Tipo    Nombre                              Valor
CNAME   _abc123.fluxionia.co               _xyz456.acm-validations.aws.
```

Lo agregamos en Cloudflare (Proxy OFF).

### PASO 4: Configurar CloudFront

Una vez validado el certificado:
1. Crear CloudFront distribution
2. Origin: S3 bucket del frontend
3. Alternate CNAMEs: fluxionia.co, granja.fluxionia.co, admin.fluxionia.co
4. SSL Certificate: El que acabamos de crear

### PASO 5: Configurar ALB para Backend

1. Listener HTTPS con el certificado de ACM
2. Target Group: ECS tasks del backend

### PASO 6: Actualizar DNS en Cloudflare

Con los valores reales de AWS:

```
CNAME   granja      d1234567890.cloudfront.net     (Proxy OFF)
CNAME   admin       d1234567890.cloudfront.net     (Proxy OFF)
CNAME   api         fluxion-alb-xxx.elb.amazonaws.com  (Proxy OFF)
```

## 🎯 Ventajas de Esta Arquitectura

✅ **No hay espera de propagación DNS** (inmediato)
✅ **Más simple** (menos servicios de AWS)
✅ **Cloudflare como backup** (si queremos usar su CDN después)
✅ **Certificados SSL gratis** de AWS
✅ **Same multi-tenant architecture**

## 📝 Próximos Pasos AHORA

1. Ir a Cloudflare DNS Records
2. Preparar para agregar registros cuando tengamos CloudFront/ALB

---
**Última actualización**: 2025-10-22
