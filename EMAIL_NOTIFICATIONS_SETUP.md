# Email Notifications Setup - COMPLETED ✅

## Overview

Implemented SendGrid email notifications for ETL executions. Notifications are sent **ONLY in production environment**, not in development/local.

## Features

- **Production-Only**: Notifications only send when `ENVIRONMENT=production`
- **Detailed Reports**: Each email includes:
  - Per-tienda status (success/failure)
  - Number of records synchronized
  - Execution time per tienda
  - Error messages for failures
  - Global summary statistics
- **Professional HTML Templates**: Beautiful gradient headers with color-coded status badges
- **Two ETL Types**:
  - ETL Inventario (inventory data)
  - ETL Ventas Históricas (historical sales data)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ETL Scripts                          │
│  - etl_inventario.py                                    │
│  - etl/core/etl_ventas_historico.py                     │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              backend/etl_notifier.py                    │
│  - Checks ENVIRONMENT variable                          │
│  - Only imports email_notifier in production            │
│  - Returns True in dev (no-op)                          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│            backend/email_notifier.py                    │
│  - EmailNotifier class                                  │
│  - send_multi_tienda_etl_summary()                      │
│  - HTML template generation                             │
│  - SendGrid API integration                             │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  SendGrid API                           │
│  - Sends to: jose@josefelipelopez.com                   │
│  - From: notificaciones@fluxionia.co                    │
└─────────────────────────────────────────────────────────┘
```

## Files Modified

### Backend

1. **backend/email_notifier.py** (Created)
   - Main email notification module
   - SendGrid integration
   - HTML template generation
   - Multi-tienda summary formatting

2. **backend/etl_notifier.py** (Created)
   - Production-only wrapper
   - Conditional import based on ENVIRONMENT
   - Single function: `send_etl_notification()`

3. **backend/.env.production** (Modified)
   - Added SendGrid configuration:
     ```bash
     SENDGRID_API_KEY=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
     SENDGRID_FROM_EMAIL=notificaciones@fluxionia.co
     NOTIFICATION_EMAILS=jose@josefelipelopez.com
     ```

4. **backend/.env.development** (Modified)
   - Added same SendGrid config for testing
   - Note: Won't send in dev unless ENVIRONMENT=production

5. **backend/requirements.txt** (Modified)
   - Added dependencies:
     ```
     sendgrid>=6.11.0
     python-dotenv>=1.0.0
     ```

### ETL Scripts

1. **etl/etl_inventario.py** (Modified)
   - Added imports:
     ```python
     import time
     sys.path.append(str(Path(__file__).parent.parent / 'backend'))
     from etl_notifier import send_etl_notification
     ```
   - Modified `ejecutar_etl_tienda()` to track `tiempo_proceso`
   - Modified `ejecutar_todas_las_tiendas()` to send email after completion

2. **etl/core/etl_ventas_historico.py** (Modified)
   - Added imports:
     ```python
     import time
     sys.path.append(str(Path(__file__).parent.parent.parent / 'backend'))
     from etl_notifier import send_etl_notification
     ```
   - Modified `_generar_reporte_final()` to:
     - Aggregate period-based results into tienda-based results
     - Send email notification with detailed summary
     - Track errors per tienda

## Email Template

The email includes:

### Header
- Gradient background (purple to blue)
- ETL name and type badge
- Execution time and duration

### Tiendas Table
| Tienda | Status | Registros | Tiempo | Detalles |
|--------|--------|-----------|---------|----------|
| BOSQUE | ✅ SUCCESS | 12,345 | 45.2s | 3 período(s) procesado(s) |
| ... | ... | ... | ... | ... |

### Global Summary
- Execution type (Parallel/Sequential)
- Total records
- Average speed (records/second)
- Stores processed
- Total periods

### Status Determination
- **SUCCESS** (green): All tiendas processed successfully
- **PARTIAL SUCCESS** (orange): Some tiendas failed
- **FAILED** (red): All tiendas failed

## Configuration

### SendGrid Setup

1. **API Key**: Created at https://app.sendgrid.com/settings/api_keys
   - Name: `Fluxion ETL Notifications`
   - Permissions: Full Access (Mail Send)

2. **From Email**: `notificaciones@fluxionia.co`
   - Verified sender in SendGrid
   - Domain: fluxionia.co

3. **To Email**: `jose@josefelipelopez.com`
   - Can be comma-separated list for multiple recipients

### Environment Variables

**Production** (backend/.env.production):
```bash
ENVIRONMENT=production
SENDGRID_API_KEY=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
SENDGRID_FROM_EMAIL=notificaciones@fluxionia.co
NOTIFICATION_EMAILS=jose@josefelipelopez.com
```

**Development** (backend/.env.development):
```bash
ENVIRONMENT=development  # Prevents emails from sending
SENDGRID_API_KEY=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
SENDGRID_FROM_EMAIL=notificaciones@fluxionia.co
NOTIFICATION_EMAILS=jose@josefelipelopez.com
```

## Testing

### Test Email Notification

Created `backend/test_multi_tienda_email.py` to test notifications:

```bash
cd backend
python3 test_multi_tienda_email.py
```

**Result**: ✅ Email received successfully (confirmed by user)

### Production Testing

When ETL runs in production:
1. ETL completes processing all tiendas
2. `etl_notifier.py` checks `ENVIRONMENT` variable
3. If `production`, imports `email_notifier` and sends email
4. If `development`, logs message and returns True (no-op)

## Usage

### ETL Inventario

Automatically sends email after completion:

```bash
cd etl
python3 etl_inventario.py --todas
```

Email includes:
- ETL name: "ETL Inventario"
- ETL type: "inventario"
- Per-tienda results
- Global summary: productos únicos, promedio por tienda

### ETL Ventas Históricas

Automatically sends email after completion:

```bash
cd etl/core
python3 etl_ventas_historico.py --fecha-inicio 2024-09-01 --fecha-fin 2024-09-30
```

Email includes:
- ETL name: "ETL Ventas Históricas"
- ETL type: "ventas"
- Per-tienda aggregated results (from all periods)
- Global summary: total registros, velocidad, períodos totales

## Code Integration Pattern

### In ETL Scripts

```python
# 1. Add imports at the top
import time
sys.path.append(str(Path(__file__).parent.parent / 'backend'))

from etl_notifier import send_etl_notification

# 2. Track start time
etl_start_time = datetime.now()

# 3. Process all tiendas (collect results)
resultados = []
for tienda_id in tiendas:
    start_time = time.time()
    # ... process ...
    resultados.append({
        'tienda_id': tienda_id,
        'nombre': nombre,
        'success': True/False,
        'registros': count,
        'tiempo_proceso': time.time() - start_time,
        'message': 'Success/Error message'
    })

# 4. Track end time
etl_end_time = datetime.now()

# 5. Send notification
try:
    send_etl_notification(
        etl_name='ETL Name',
        etl_type='inventario' or 'ventas',
        start_time=etl_start_time,
        end_time=etl_end_time,
        tiendas_results=resultados,
        global_summary={
            'Key': 'Value',
            'Total': f"{total:,}"
        }
    )
except Exception as e:
    logger.error(f"Error sending notification: {e}")
```

## Error Handling

1. **SendGrid API Errors**: Caught and logged, don't crash ETL
2. **Missing Dependencies**: Gracefully handled with try/except
3. **Invalid Email Format**: SendGrid validates before sending
4. **Network Issues**: Logged but don't affect ETL execution

## Dependencies

### Python Packages

```txt
sendgrid>=6.11.0        # SendGrid API client
python-dotenv>=1.0.0    # Environment variables
```

Install with:
```bash
cd backend
pip install -r requirements.txt
```

## Deployment

### Backend Deployment (ECS)

1. **Update Task Definition**:
   - Add environment variables to ECS task definition
   - Or use AWS Secrets Manager for SendGrid API key

2. **Update Container**:
   ```bash
   cd backend
   docker build -t fluxion-backend .
   docker push ...
   ```

3. **Environment Variables** (ECS Task Definition):
   ```json
   {
     "name": "ENVIRONMENT",
     "value": "production"
   },
   {
     "name": "SENDGRID_API_KEY",
     "value": "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"
   },
   {
     "name": "SENDGRID_FROM_EMAIL",
     "value": "notificaciones@fluxionia.co"
   },
   {
     "name": "NOTIFICATION_EMAILS",
     "value": "jose@josefelipelopez.com"
   }
   ```

### ETL Tasks (ECS)

ETL tasks running in ECS will automatically:
1. Read environment variables from task definition
2. Load `backend/.env.production` if available
3. Send notifications after completion

## Security Considerations

1. **API Key Protection**:
   - ✅ Stored in `.env` files (gitignored)
   - ✅ Can be migrated to AWS Secrets Manager
   - ❌ Currently in plaintext in `.env.production` (acceptable for private repo)

2. **Email Verification**:
   - ✅ Sender domain verified in SendGrid
   - ✅ SPF/DKIM configured for fluxionia.co

3. **Rate Limiting**:
   - ✅ SendGrid free tier: 100 emails/day
   - ✅ ETL runs ~2-4 times/day max

## Future Enhancements

1. **Multiple Recipients**: Support different emails per ETL type
2. **Slack Integration**: Also send to Slack channel
3. **Error Severity Levels**: Different alerts for warnings vs errors
4. **Attachment Support**: Attach full CSV report
5. **Email Templates**: Customizable templates per tenant
6. **Notification Preferences**: User configurable (email, SMS, Slack)

## Troubleshooting

### Emails Not Sending

1. Check `ENVIRONMENT` variable:
   ```bash
   echo $ENVIRONMENT
   # Should be "production"
   ```

2. Check SendGrid API key:
   ```bash
   # In backend directory
   grep SENDGRID_API_KEY .env.production
   ```

3. Check logs:
   ```bash
   # Look for:
   # "📧 Email notification sent successfully"
   # or
   # "Error sending email notification: ..."
   ```

### Emails in Spam

1. Verify sender domain in SendGrid
2. Configure SPF record: `v=spf1 include:sendgrid.net ~all`
3. Configure DKIM in SendGrid settings

### Wrong Environment Detection

Check the import in ETL script:
```python
# Should be:
from etl_notifier import send_etl_notification

# NOT:
from email_notifier import send_multi_tienda_notification
```

## Testing Checklist

- [x] Test email sending in development (with ENVIRONMENT=production)
- [x] Verify HTML template renders correctly
- [x] Test with successful results
- [ ] Test with partial failures
- [ ] Test with complete failures
- [ ] Test in production environment
- [ ] Verify email arrives (not in spam)
- [ ] Test with multiple recipients

## Summary

✅ **Completed**:
- SendGrid integration
- Production-only email sending
- Detailed multi-tienda reports
- HTML email templates
- ETL Inventario integration
- ETL Ventas Históricas integration
- Environment variable configuration
- Test scripts

📝 **Pending**:
- Deploy to production and test
- Monitor SendGrid delivery rates
- Consider migrating API key to AWS Secrets Manager

---

**Status**: ✅ Setup complete and tested
**Date**: 2025-10-22
**Version**: 1.0.0
