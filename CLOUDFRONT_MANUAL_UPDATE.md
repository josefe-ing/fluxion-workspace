# 🔧 Actualización Manual de CloudFront Distributions

Como la actualización via CLI es compleja, vamos a hacerlo via AWS Console (es más seguro y visual).

## PASO 1: Actualizar CloudFront FRONTEND (E4DJERG2Y5AX8)

### URL:
https://console.aws.amazon.com/cloudfront/v3/home?region=us-east-1#/distributions/E4DJERG2Y5AX8

### Pasos:
1. Click en el botón **"Edit"** (arriba a la derecha)
2. Scroll hasta encontrar **"Alternate domain names (CNAMEs)"**
3. Click en **"Add item"** y agregar UNO POR UNO:
   - `fluxionia.co`
   - `www.fluxionia.co`
   - `granja.fluxionia.co`
   - `admin.fluxionia.co`

4. Scroll hasta **"Custom SSL certificate"**
5. Click en el dropdown y seleccionar:
   ```
   fluxionia.co (88d81742-53fc-49f5-9c72-3506dd712109)
   ```

6. En **"Security policy"**, seleccionar:
   ```
   TLSv1.2_2021 (recommended)
   ```

7. Click en **"Save changes"** (abajo)

⏳ **Tiempo de deploy**: 10-15 minutos

---

## PASO 2: Actualizar CloudFront BACKEND API (E1HBMY1Q13OWU0)

### URL:
https://console.aws.amazon.com/cloudfront/v3/home?region=us-east-1#/distributions/E1HBMY1Q13OWU0

### Pasos:
1. Click en el botón **"Edit"**
2. Scroll hasta **"Alternate domain names (CNAMEs)"**
3. Click en **"Add item"** y agregar:
   - `api.fluxionia.co`

4. Scroll hasta **"Custom SSL certificate"**
5. Seleccionar el mismo certificado:
   ```
   fluxionia.co (88d81742-53fc-49f5-9c72-3506dd712109)
   ```

6. En **"Security policy"**:
   ```
   TLSv1.2_2021 (recommended)
   ```

7. Click en **"Save changes"**

⏳ **Tiempo de deploy**: 10-15 minutos

---

## PASO 3: Esperar Deployment

Mientras CloudFront actualiza (10-15 min), podemos hacer otras cosas:
- Integrar el middleware multi-tenant en el backend
- Actualizar el frontend con tenant detection
- Preparar la base de datos

---

## PASO 4: Agregar Registros DNS en Cloudflare

**SOLO DESPUÉS** de que CloudFront termine de deployar, agregar en Cloudflare:

### IR A: 
https://dash.cloudflare.com/62357378b36bc55148f1d671d93f5c6f/fluxionia.co/dns/records

### Agregar estos 5 registros (uno por uno):

#### 1. Dominio Principal
```
Type: CNAME
Name: @ (o dejar en blanco si no acepta @, poner "fluxionia.co")
Target: d20a0g9yxinot2.cloudfront.net
Proxy status: OFF (gris, desactivado)
TTL: Auto
```

#### 2. WWW
```
Type: CNAME
Name: www
Target: d20a0g9yxinot2.cloudfront.net
Proxy status: OFF (gris)
TTL: Auto
```

#### 3. API
```
Type: CNAME
Name: api
Target: d1tgnaj74tv17v.cloudfront.net
Proxy status: OFF (gris)
TTL: Auto
```

#### 4. Granja
```
Type: CNAME
Name: granja
Target: d20a0g9yxinot2.cloudfront.net
Proxy status: OFF (gris)
TTL: Auto
```

#### 5. Admin
```
Type: CNAME
Name: admin
Target: d20a0g9yxinot2.cloudfront.net
Proxy status: OFF (gris)
TTL: Auto
```

**⚠️ CRÍTICO**: Proxy status debe estar **OFF** (gris) para TODOS!

---

## Verificación Final

Una vez todo deployado y DNS agregados (esperar 5-10 min más), verificar:

```bash
curl -I https://fluxionia.co
curl -I https://www.fluxionia.co
curl -I https://api.fluxionia.co
curl -I https://granja.fluxionia.co
curl -I https://admin.fluxionia.co
```

Todos deberían devolver `HTTP/2 200` o similar (no errores de SSL).

---

**Certificado SSL ARN**: `arn:aws:acm:us-east-1:611395766952:certificate/88d81742-53fc-49f5-9c72-3506dd712109`
**CloudFront Frontend**: E4DJERG2Y5AX8 → d20a0g9yxinot2.cloudfront.net
**CloudFront Backend**: E1HBMY1Q13OWU0 → d1tgnaj74tv17v.cloudfront.net
