# Cron Jobs ETL KLK - Actualizaciones en Tiempo Real

**Sistema:** KLK POS API
**Frecuencia:** Cada 30 minutos
**Fecha:** 2025-11-24

---

## 📋 Descripción

Sistema de cron jobs optimizado para mantener datos de **inventario** y **ventas** actualizados en tiempo casi real desde las tiendas KLK.

### Ventajas del Sistema KLK

✅ **Servidor Único:** Una sola API centralizada (`http://190.6.32.3:7002`)
✅ **API REST:** Sin necesidad de VPN o conexiones SQL complejas
✅ **Alta Frecuencia:** Actualizaciones cada 30 minutos sin sobrecarga
✅ **Tiempo Real:** Datos frescos para decisiones inmediatas
✅ **Modo Incremental:** Extrae solo los últimos 30 minutos de ventas (ultra rápido: ~2-5 segundos por tienda)

---

## ⏰ Horario de Ejecución

### Inventario (Cada 30 minutos)
```
00:00, 00:30, 01:00, 01:30, 02:00, 02:30, 03:00, ...
```
**Total:** 48 ejecuciones por día

### Ventas (Cada 30 minutos con offset de 5 min)
```
00:05, 00:35, 01:05, 01:35, 02:05, 02:35, 03:05, ...
```
**Total:** 48 ejecuciones por día

### Estrategia de Offset

El inventario se ejecuta **5 minutos antes** que las ventas para asegurar:
1. Stock actualizado primero
2. Ventas usan inventario fresco
3. Evitar conflictos de escritura en DB

---

## 🚀 Instalación

### Opción 1: Instalador Automático (Recomendado)

```bash
cd /Users/jose/Developer/fluxion-workspace/etl

# Ver estado actual
./install_cron_klk.sh status

# Instalar cron jobs
./install_cron_klk.sh install

# Verificar instalación
./install_cron_klk.sh status
```

### Opción 2: Manual

```bash
# Editar crontab
crontab -e

# Agregar las siguientes líneas:
0,30 * * * * /Users/jose/Developer/fluxion-workspace/etl/cron_klk_realtime.sh inventario
5,35 * * * * /Users/jose/Developer/fluxion-workspace/etl/cron_klk_realtime.sh ventas
```

---

## 🧪 Pruebas

### Probar ETLs sin instalar cron

```bash
cd /Users/jose/Developer/fluxion-workspace/etl

# Test completo (dry-run)
./install_cron_klk.sh test

# Test manual de inventario
./cron_klk_realtime.sh inventario

# Test manual de ventas
./cron_klk_realtime.sh ventas
```

---

## 📝 Logs

### Ubicación

```
etl/logs/cron_klk_inventario_YYYYMMDD.log
etl/logs/cron_klk_ventas_YYYYMMDD.log
```

### Monitoreo en Tiempo Real

```bash
# Ver todos los logs KLK
tail -f etl/logs/cron_klk_*.log

# Solo inventario
tail -f etl/logs/cron_klk_inventario_*.log

# Solo ventas
tail -f etl/logs/cron_klk_ventas_*.log

# Últimas 100 líneas
tail -100 etl/logs/cron_klk_inventario_$(date +%Y%m%d).log
```

### Análisis de Logs

```bash
# Contar ejecuciones de hoy
grep "ETL completado" etl/logs/cron_klk_inventario_$(date +%Y%m%d).log | wc -l

# Ver errores
grep "ERROR\|❌" etl/logs/cron_klk_*.log

# Últimas ejecuciones exitosas
grep "✅ ETL.*completado" etl/logs/cron_klk_*.log | tail -10
```

---

## 🔧 Gestión

### Ver Estado

```bash
./install_cron_klk.sh status
```

### Desinstalar

```bash
./install_cron_klk.sh uninstall
```

### Reinstalar

```bash
./install_cron_klk.sh uninstall
./install_cron_klk.sh install
```

### Pausar Temporalmente

```bash
# Comentar las líneas en crontab
crontab -e

# Agregar # al inicio de cada línea:
# 0,30 * * * * /path/to/cron_klk_realtime.sh inventario
# 5,35 * * * * /path/to/cron_klk_realtime.sh ventas
```

---

## 📊 Monitoreo de Performance

### Verificar Última Ejecución

```bash
# Inventario
grep "ETL completado" etl/logs/cron_klk_inventario_$(date +%Y%m%d).log | tail -1

# Ventas
grep "ETL completado" etl/logs/cron_klk_ventas_$(date +%Y%m%d).log | tail -1
```

### Duración de ETLs

```bash
# Ver duración de inventario
grep "Duración:" etl/logs/cron_klk_inventario_$(date +%Y%m%d).log

# Ver duración de ventas
grep "Duración:" etl/logs/cron_klk_ventas_$(date +%Y%m%d).log
```

### Verificar Base de Datos

```bash
cd /Users/jose/Developer/fluxion-workspace/etl

source venv/bin/activate && python3 -c "
import duckdb
from datetime import datetime

conn = duckdb.connect('../data/fluxion_production.db')

# Última actualización de stock
print('🗄️ ÚLTIMO STOCK:')
result = conn.execute('''
    SELECT ubicacion_id, MAX(fecha_actualizacion) as ultima_act
    FROM stock_actual
    WHERE ubicacion_id IN ('tienda_01', 'tienda_08', 'tienda_17', 'tienda_20')
    GROUP BY ubicacion_id
    ORDER BY ubicacion_id
''').fetchall()
for row in result:
    print(f'  {row[0]}: {row[1]}')

# Últimas ventas
print('\n💰 ÚLTIMAS VENTAS:')
result = conn.execute('''
    SELECT ubicacion_id, MAX(fecha_carga) as ultima_carga
    FROM ventas_raw
    WHERE ubicacion_id IN ('tienda_01', 'tienda_08', 'tienda_17', 'tienda_20')
    GROUP BY ubicacion_id
    ORDER BY ubicacion_id
''').fetchall()
for row in result:
    print(f'  {row[0]}: {row[1]}')

conn.close()
"
```

---

## ⚠️ Troubleshooting

### Cron no ejecuta

```bash
# Verificar que cron esté corriendo
ps aux | grep cron

# Ver logs del sistema (macOS)
log show --predicate 'eventMessage contains "cron"' --info --last 1h

# Verificar permisos
ls -la /Users/jose/Developer/fluxion-workspace/etl/cron_klk_realtime.sh
```

### ETL falla

```bash
# Ver último error
tail -50 etl/logs/cron_klk_inventario_$(date +%Y%m%d).log

# Ejecutar manualmente para debug
cd /Users/jose/Developer/fluxion-workspace/etl
./cron_klk_realtime.sh inventario
```

### API KLK no responde

```bash
# Test de conectividad
curl -X POST http://190.6.32.3:7002/ventas \
  -H "Content-Type: application/json" \
  -d '{"sucursal": "SUC001", "fecha_desde": "2025-11-24", "fecha_hasta": "2025-11-24"}'
```

### Logs muy grandes

```bash
# Limpiar logs antiguos (más de 30 días)
find etl/logs -name "cron_klk_*.log" -mtime +30 -delete

# Comprimir logs viejos
find etl/logs -name "cron_klk_*.log" -mtime +7 -exec gzip {} \;
```

---

## 🎯 Best Practices

1. **Monitorear regularmente** - Revisar logs diariamente
2. **Alertas** - Configurar notificaciones para fallos (email/Slack)
3. **Backup de crontab** - Guardar configuración antes de cambios
4. **Rotación de logs** - Limpiar logs antiguos mensualmente
5. **Testing** - Probar cambios en dry-run primero

---

## 📈 Métricas Esperadas

### Por Ejecución (Modo Incremental)

| ETL | Tiendas | Registros | Tiempo | Modo |
|-----|---------|-----------|--------|------|
| Inventario | 4 | ~15K productos | ~30-60s | Completo |
| Ventas | 4 | ~400-1,000 líneas | **~5-15s** | **Incremental (30 min)** |

### Por Día

- **96 ejecuciones** totales (48 inventario + 48 ventas)
- **~720K registros** de inventario actualizados
- **~24K líneas** de venta nuevas (promedio: 500 líneas x 48 ejecuciones)

### Uso de Recursos

- **CPU:** < 5% durante ejecución
- **RAM:** ~200-500MB por ETL
- **Network:** ~1-3MB por ejecución incremental (mucho menos que modo completo)
- **Disk I/O:** Moderado (DuckDB es eficiente)

### Performance del Modo Incremental

El modo incremental de ventas es **5-10x más rápido** que extraer el día completo:
- **Modo completo** (día entero): 7,000+ líneas, ~20-30s
- **Modo incremental** (30 min): 400-500 líneas, ~2-5s ⚡

---

## 🔮 Mejoras Futuras

1. **Dashboard de Monitoreo** - Visualizar estado de ETLs en tiempo real
2. **Alertas Automáticas** - Email/Slack cuando falla un ETL
3. **Health Checks** - Endpoint para verificar estado
4. **Retry Inteligente** - Reintentar con backoff exponencial
5. **Métricas Detalladas** - Prometheus/Grafana para monitoreo

---

**Última actualización:** 2025-11-24
**Mantenido por:** ETL Team
