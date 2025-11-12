# Instalación del Cron Job para ABC-XYZ

## 📋 Resumen

Este documento explica cómo configurar la ejecución automática diaria del cálculo ABC-XYZ.

---

## 🚀 Instalación Rápida

### Paso 1: Verificar el Script

El script ya está creado y listo para usar:

```bash
# Verificar que existe y es ejecutable
ls -lh /Users/jose/Developer/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh
```

✅ Debería mostrar: `-rwxr-xr-x` (ejecutable)

### Paso 2: Probar Manualmente

Antes de configurar el cron, prueba que el script funciona:

```bash
cd /Users/jose/Developer/fluxion-workspace

# Ejecutar manualmente
./scripts/ejecutar_abc_xyz_diario.sh
```

El script:
- ✅ Ejecuta cálculo ABC
- ✅ Ejecuta cálculo XYZ
- ✅ Detecta cambios automáticamente
- ✅ Guarda logs en `logs/abc-xyz/abc-xyz-YYYY-MM-DD.log`
- ✅ Limpia logs antiguos (>30 días)

### Paso 3: Configurar Cron Job

#### Opción A: Cron Simple (Recomendado)

```bash
# Abrir crontab
crontab -e

# Agregar esta línea al final del archivo:
0 3 * * * /Users/jose/Developer/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh

# Guardar y salir (:wq en vim)
```

**Explicación**: Ejecuta todos los días a las 3:00 AM

#### Opción B: Con Log Centralizado

```bash
# Abrir crontab
crontab -e

# Agregar:
0 3 * * * /Users/jose/Developer/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh >> /Users/jose/Developer/fluxion-workspace/logs/cron-abc-xyz.log 2>&1
```

**Explicación**: Además del log del script, guarda un log del cron.

#### Opción C: Horarios Alternativos

```bash
# Cada 12 horas (3 AM y 3 PM)
0 3,15 * * * /Users/jose/Developer/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh

# Solo días laborales a las 6 AM
0 6 * * 1-5 /Users/jose/Developer/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh

# Cada 6 horas
0 */6 * * * /Users/jose/Developer/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh
```

### Paso 4: Verificar que Cron Está Activo

```bash
# Listar cron jobs configurados
crontab -l

# Verificar servicio de cron (macOS)
sudo launchctl list | grep cron
```

---

## 📊 Monitoreo

### Ver Logs en Tiempo Real

```bash
# Ver log del día actual
tail -f logs/abc-xyz/abc-xyz-$(date +%Y-%m-%d).log

# Ver últimas 50 líneas
tail -50 logs/abc-xyz/abc-xyz-$(date +%Y-%m-%d).log

# Buscar errores
grep "ERROR" logs/abc-xyz/*.log
```

### Verificar Última Ejecución

```bash
# Ver último log modificado
ls -lt logs/abc-xyz/ | head -5

# Ver resumen del último log
tail -20 logs/abc-xyz/abc-xyz-$(date +%Y-%m-%d).log
```

### Verificar Datos Actualizados

```bash
python3 -c "
import duckdb
from datetime import datetime

conn = duckdb.connect('data/fluxion_production.db')

# Ver última actualización
ultima = conn.execute('SELECT MAX(fecha_calculo) FROM productos_abc_v2').fetchone()[0]
print(f'✅ Última actualización ABC: {ultima}')

# Ver total de alertas
alertas = conn.execute('SELECT COUNT(*) FROM alertas_cambio_clasificacion WHERE fecha_cambio >= CURRENT_DATE - INTERVAL 7 DAYS').fetchone()[0]
print(f'📋 Alertas últimos 7 días: {alertas}')

conn.close()
"
```

---

## 🔔 Notificaciones (Opcional)

### Opción 1: Email en Caso de Error

Modificar el cron para recibir emails:

```bash
# Configurar email en crontab
MAILTO=tu_email@empresa.com

0 3 * * * /Users/jose/Developer/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh
```

**Nota**: Requiere configurar `sendmail` o similar en el sistema.

### Opción 2: Slack Webhook

Agregar al final del script `ejecutar_abc_xyz_diario.sh`:

```bash
# Notificar a Slack
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d "{\"text\":\"✅ Cálculo ABC-XYZ completado. Alertas: $TOTAL_ALERTAS\"}"
```

---

## 🧪 Testing

### Simular Ejecución de Cron

```bash
# Ejecutar como lo haría cron (sin variables de entorno)
env -i /Users/jose/Developer/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh

# Ver salida
cat logs/abc-xyz/abc-xyz-$(date +%Y-%m-%d).log
```

### Forzar Ejecución Inmediata

```bash
# Ejecutar ahora (sin esperar a las 3 AM)
./scripts/ejecutar_abc_xyz_diario.sh

# Ver resultado en tiempo real
tail -f logs/abc-xyz/abc-xyz-$(date +%Y-%m-%d).log
```

---

## 🐛 Troubleshooting

### Cron no ejecuta el script

**Problema**: El cron está configurado pero no se ejecuta.

**Solución**:
```bash
# 1. Verificar que cron tiene permisos (macOS)
# Sistema → Privacidad y Seguridad → Acceso Total al Disco → Cron

# 2. Verificar logs del sistema
tail -f /var/log/cron.log  # Linux
tail -f /var/log/system.log | grep cron  # macOS

# 3. Usar rutas absolutas
# En el crontab, usar SIEMPRE rutas absolutas
```

### Script falla cuando cron lo ejecuta

**Problema**: El script funciona manualmente pero falla en cron.

**Solución**:
```bash
# Agregar PATH al crontab
PATH=/usr/local/bin:/usr/bin:/bin

0 3 * * * /Users/jose/Developer/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh
```

### No se generan logs

**Problema**: El script se ejecuta pero no hay logs.

**Solución**:
```bash
# Verificar permisos del directorio de logs
chmod 755 /Users/jose/Developer/fluxion-workspace/logs/abc-xyz

# Crear manualmente si no existe
mkdir -p /Users/jose/Developer/fluxion-workspace/logs/abc-xyz
```

### Base de datos bloqueada

**Problema**: Error "database is locked"

**Solución**:
```bash
# Verificar que no hay otro proceso usando la BD
lsof | grep fluxion_production.db

# Matar proceso si es necesario
kill -9 <PID>

# Verificar que el backend no está bloqueando
# Si el backend está corriendo 24/7, asegúrate que cierra conexiones correctamente
```

---

## 📈 Optimizaciones

### Ejecutar Solo en Cambio de Datos

Si quieres ejecutar solo cuando hay nuevos datos ETL:

```bash
# En el script de ETL, agregar al final:
if [ $? -eq 0 ]; then
    echo "ETL completado, ejecutando cálculo ABC-XYZ..."
    /Users/jose/Developer/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh
fi
```

### Prioridad Baja (No Impactar Performance)

```bash
# Ejecutar con prioridad baja
0 3 * * * nice -n 19 /Users/jose/Developer/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh
```

---

## 📝 Registro de Cambios

### Ver Historial de Ejecuciones

```bash
# Últimas 10 ejecuciones
ls -lt logs/abc-xyz/ | head -11

# Buscar fallos
grep -l "ERROR" logs/abc-xyz/*.log

# Ver estadísticas por fecha
for log in logs/abc-xyz/abc-xyz-*.log; do
    echo "=== $log ==="
    grep "Clasificaciones ABC totales" "$log"
    grep "Alertas registradas" "$log"
done
```

---

## ✅ Checklist de Instalación

- [ ] Script existe y es ejecutable
- [ ] Script funciona al ejecutarlo manualmente
- [ ] Cron job configurado en crontab
- [ ] Primera ejecución automática completada exitosamente
- [ ] Logs se están generando correctamente
- [ ] Dashboard muestra datos actualizados
- [ ] Notificaciones configuradas (opcional)
- [ ] Monitoreo configurado

---

## 📞 Soporte

- **Script**: [scripts/ejecutar_abc_xyz_diario.sh](../scripts/ejecutar_abc_xyz_diario.sh)
- **Logs**: `logs/abc-xyz/abc-xyz-YYYY-MM-DD.log`
- **Documentación**: [SISTEMA_HISTORICO_CLASIFICACIONES.md](SISTEMA_HISTORICO_CLASIFICACIONES.md)

---

**¡Listo!** El sistema se ejecutará automáticamente todos los días a las 3 AM.
