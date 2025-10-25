# 📝 Registros DNS para Agregar en Cloudflare

## Certificado SSL - ARN
```
arn:aws:acm:us-east-1:611395766952:certificate/88d81742-53fc-49f5-9c72-3506dd712109
```
**Status**: PENDING_VALIDATION (esperando... verificar cada 5-10 min)

---

## Infraestructura AWS Actual

### CloudFront Distributions:
1. **Frontend**: `d20a0g9yxinot2.cloudfront.net` (ID: E4DJERG2Y5AX8)
2. **Backend API**: `d1tgnaj74tv17v.cloudfront.net` (ID: E1HBMY1Q13OWU0)

### Application Load Balancer:
- **DNS**: `fluxion-alb-433331665.us-east-1.elb.amazonaws.com`

---

## 🎯 Registros DNS a Agregar en Cloudflare

Una vez que el certificado SSL esté VALIDADO (Status: ISSUED), agregar estos registros:

### 1. Validación SSL (YA AGREGADO ✅)
```
Tipo:   CNAME
Nombre: _db756b49bf47c2f3b004235f1f4df22a
Valor:  _30a8baa89fbf6f1068536aa30b5f5042.xlfgrmvvlj.acm-validations.aws.
Proxy:  OFF (gris)
```

### 2. Dominio Principal (Landing Page)
```
Tipo:   CNAME
Nombre: @ (o fluxionia.co)
Valor:  d20a0g9yxinot2.cloudfront.net
Proxy:  OFF (gris)
TTL:    Auto
```

### 3. WWW
```
Tipo:   CNAME
Nombre: www
Valor:  d20a0g9yxinot2.cloudfront.net
Proxy:  OFF (gris)
TTL:    Auto
```

### 4. API Backend
```
Tipo:   CNAME
Nombre: api
Valor:  d1tgnaj74tv17v.cloudfront.net
Proxy:  OFF (gris)
TTL:    Auto
```

### 5. Granja (Cliente Multi-Tenant)
```
Tipo:   CNAME
Nombre: granja
Valor:  d20a0g9yxinot2.cloudfront.net
Proxy:  OFF (gris)
TTL:    Auto
```

### 6. Admin Panel
```
Tipo:   CNAME
Nombre: admin
Valor:  d20a0g9yxinot2.cloudfront.net
Proxy:  OFF (gris)
TTL:    Auto
```

---

## ⚠️ IMPORTANTE

**Proxy Status debe estar OFF (gris)** para todos los registros porque:
1. AWS necesita ver el tráfico directo para SSL
2. CloudFront ya es un CDN (no necesitamos el de Cloudflare)
3. El certificado SSL de AWS solo funciona con proxy OFF

---

## 🔄 Próximos Pasos

1. **ESPERAR** que el certificado SSL sea validado (5-30 min)
   - Verificar con: `aws acm describe-certificate --certificate-arn <arn> --region us-east-1`
   - Status debe cambiar de `PENDING_VALIDATION` → `ISSUED`

2. **ACTUALIZAR CloudFront** distributions para agregar los CNAMEs custom:
   - Distribution Frontend: Agregar `fluxionia.co`, `www.fluxionia.co`, `granja.fluxionia.co`, `admin.fluxionia.co`
   - Distribution Backend: Agregar `api.fluxionia.co`
   - Asociar certificado SSL a ambas distributions

3. **AGREGAR registros DNS** en Cloudflare (pasos 2-6 arriba)

4. **VERIFICAR** que todo funcione:
   ```bash
   curl -I https://fluxionia.co
   curl -I https://api.fluxionia.co
   curl -I https://granja.fluxionia.co
   ```

---

**Fecha**: 2025-10-22
**Certificado ARN**: `arn:aws:acm:us-east-1:611395766952:certificate/88d81742-53fc-49f5-9c72-3506dd712109`
