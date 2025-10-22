# DNS Fix Required - Dominio Raíz

## Problema Detectado

El dominio **fluxionia.co** está resolviendo a IPs de Cloudflare en lugar de CloudFront:

```bash
$ nslookup fluxionia.co
Name:	fluxionia.co
Address: 172.67.138.62  ← IP de Cloudflare (proxy activado)
Address: 104.21.26.179  ← IP de Cloudflare (proxy activado)
```

Debería resolver a CloudFront como los subdominios:
```bash
$ nslookup granja.fluxionia.co
granja.fluxionia.co	canonical name = d20a0g9yxinot2.cloudfront.net.  ← CORRECTO
Address: 3.166.181.62  ← IP de CloudFront
```

## Causa

El registro CNAME para `fluxionia.co` (o `@`) tiene el **Proxy Status** en modo **Proxied** (nube naranja) en lugar de **DNS only** (nube gris).

## Solución

Ve a **Cloudflare Dashboard** → **DNS** → **Records** para `fluxionia.co`:

1. Encuentra el registro:
   - **Type**: CNAME
   - **Name**: `fluxionia.co` (o `@`)
   - **Content**: d20a0g9yxinot2.cloudfront.net
   - **Proxy status**: 🟠 Proxied (INCORRECTO)

2. Haz click en el registro para editarlo

3. Haz click en la **nube naranja** para cambiarla a **nube gris**:
   - ❌ 🟠 Proxied (naranja)
   - ✅ ⚪ DNS only (gris)

4. Guarda los cambios

## Verificación

Después del cambio, espera 1-2 minutos y verifica:

```bash
nslookup fluxionia.co
```

Debería mostrar:
```
fluxionia.co	canonical name = d20a0g9yxinot2.cloudfront.net.
Name:	d20a0g9yxinot2.cloudfront.net
Address: 3.166.x.x  ← IPs de CloudFront (3.x.x.x)
```

## ¿Por qué DNS only y no Proxied?

Cloudflare Proxy (naranja) es útil para protección DDoS y cache, pero:

1. **Conflicto con CloudFront SSL**: CloudFront maneja su propio SSL con el certificado `*.fluxionia.co`. Si Cloudflare intercepta el tráfico, hay un "doble SSL" que causa problemas.

2. **CloudFront ya hace CDN**: CloudFront es un CDN de AWS, no necesitamos otro CDN (Cloudflare) por delante.

3. **Certificado SSL**: El certificado `*.fluxionia.co` está en AWS ACM y CloudFront lo usa. Si Cloudflare intercepta, el certificado no coincide.

## Status de Otros Dominios

✅ **www.fluxionia.co** - Necesita verificarse (probablemente también proxied)
✅ **granja.fluxionia.co** - CORRECTO (DNS only, resuelve a CloudFront)
✅ **admin.fluxionia.co** - Necesita verificarse
✅ **api.fluxionia.co** - CORRECTO (DNS only, resuelve a CloudFront)

Verifica que **TODOS** los registros estén en **DNS only** (gris), no en Proxied (naranja).

---

**Acción requerida**: Cambiar `fluxionia.co` y `www.fluxionia.co` de Proxied a DNS only en Cloudflare.
