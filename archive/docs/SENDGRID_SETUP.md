# SendGrid Email Notifications Setup

## Paso 1: Obtener API Key de SendGrid ✅

1. Ve a https://app.sendgrid.com/settings/api_keys
2. Click en **"Create API Key"**
3. Nombre: `Fluxion AI Notifications`
4. Permisos: **"Full Access"** (o al menos "Mail Send")
5. Click **"Create & View"**
6. **COPIA LA API KEY** (solo se muestra una vez)

## Paso 2: Configurar Variables de Entorno

Edita el archivo `backend/.env.development` y reemplaza:

```bash
SENDGRID_API_KEY=REPLACE_WITH_YOUR_API_KEY
```

Con tu API Key real:

```bash
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Las otras variables ya están configuradas:
- ✅ `SENDGRID_FROM_EMAIL=notificaciones@fluxionia.co`
- ✅ `NOTIFICATION_EMAILS=jose@josefelipelopez.com`

## Paso 3: Instalar Dependencias

```bash
cd backend
pip install -r requirements.txt
```

Esto instalará:
- `sendgrid>=6.11.0` - Cliente de SendGrid
- `python-dotenv>=1.0.0` - Para cargar variables de entorno

## Paso 4: Probar Configuración

Ejecuta el script de prueba:

```bash
cd backend
python3 test_email.py
```

El script:
1. Verificará que las variables de entorno estén configuradas
2. Te pedirá confirmación para enviar un email de prueba
3. Enviará un email de ejemplo a `jose@josefelipelopez.com`

### Salida esperada:

```
🧪 SendGrid Email Notification Test
============================================================

📧 Testing SendGrid Configuration
============================================================

✓ SENDGRID_API_KEY: Set
✓ SENDGRID_FROM_EMAIL: notificaciones@fluxionia.co
✓ NOTIFICATION_EMAILS: jose@josefelipelopez.com
✓ Email notifier enabled: True

✅ Configuration looks good!

============================================================
Send test email? (y/n): y

📨 Sending Test Email
============================================================

✅ Test email sent successfully!
📬 Check your inbox: jose@josefelipelopez.com

Note: It may take 1-2 minutes to arrive

============================================================
✅ All tests passed!
============================================================
```

## Paso 5: Verificar Email Recibido

Revisa tu bandeja de entrada en `jose@josefelipelopez.com`. Deberías recibir un email con:

- **Subject**: ✅ Fluxion AI - ETL Test - Email Notifications SUCCESS
- **From**: notificaciones@fluxionia.co
- **Contenido**: Email HTML profesional con:
  - Header morado con logo de Fluxion AI
  - Estado del ETL (SUCCESS)
  - Detalles de ejecución
  - Resumen de datos procesados
  - Footer con link al dashboard

## Formato del Email

El email incluye:

### Header
- Logo/Nombre de Fluxion AI
- Título "ETL Execution Report"

### Badge de Estado
- ✅ SUCCESS (verde) o ❌ FAILED (rojo)

### Detalles
- Start Time
- End Time
- Duration
- Records Processed

### Summary (opcional)
- Datos personalizados del ETL
- Tiendas procesadas
- Errores encontrados
- Etc.

### Errors (si aplica)
- Lista de errores (máximo 10)
- Contador si hay más errores

### Footer
- Link al dashboard: https://granja.fluxionia.co

## Integración con ETL

El módulo `email_notifier.py` ya está listo para integrarse con el ETL scheduler.

### Uso básico:

```python
from email_notifier import send_etl_notification
from datetime import datetime

# Al finalizar un ETL
send_etl_notification(
    etl_name="Ventas Diarias",
    status="SUCCESS",  # o "FAILED"
    start_time=start_time,
    end_time=datetime.now(),
    records_processed=total_records,
    summary={
        "Tiendas procesadas": "16",
        "Registros nuevos": "45,234",
        "Errores": "0"
    },
    errors=[]  # Lista de errores si los hay
)
```

## Próximos Pasos

Una vez verificado que el email funciona:

1. ✅ Integrar notificaciones en `etl_scheduler.py`
2. ✅ Agregar notificaciones en ETL manual (cuando se ejecuta desde el dashboard)
3. ✅ Configurar para producción en `.env.production`
4. ✅ Agregar más emails a `NOTIFICATION_EMAILS` si es necesario (separados por comas)

## Troubleshooting

### Error: "Email notifications disabled"

Verifica que:
- `SENDGRID_API_KEY` esté configurado y no sea `REPLACE_WITH_YOUR_API_KEY`
- `NOTIFICATION_EMAILS` no esté vacío
- Las variables estén en `.env.development`

### Error: "Unauthorized"

Tu API Key no es válida:
- Verifica que la copiaste completa
- Verifica que no haya espacios antes/después
- Crea una nueva API Key si es necesario

### Email no llega

- Verifica la carpeta de spam
- Espera 2-5 minutos
- Verifica que `jose@josefelipelopez.com` sea correcto
- Revisa los logs de SendGrid: https://app.sendgrid.com/email_activity

### Error de DNS

Si el email rebota, verifica que los registros DNS en Cloudflare estén correctos:
- `em1870.fluxionia.co` → `u56898409.wl160.sendgrid.net`
- `s1._domainkey.fluxionia.co` → `s1.domainkey.u56898409.wl160.sendgrid.net`
- `s2._domainkey.fluxionia.co` → `s2.domainkey.u56898409.wl160.sendgrid.net`
- `_dmarc.fluxionia.co` → `v=DMARC1; p=none;`

## Configuración para Producción

Edita `backend/.env.production` y agrega:

```bash
# SendGrid Email Notifications
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=notificaciones@fluxionia.co
NOTIFICATION_EMAILS=jose@josefelipelopez.com,otro-email@ejemplo.com
```

Luego rebuild y deploy del backend.

---

**Estado**: Configuración completada, listo para testing
**Última actualización**: 2025-10-22
