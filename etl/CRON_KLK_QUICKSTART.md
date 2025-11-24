# 🚀 Quick Start - Cron Jobs KLK en Tiempo Real

## ⚡ Instalación en 2 Pasos

### 1. Ver Estado Actual
```bash
cd /Users/jose/Developer/fluxion-workspace/etl
./install_cron_klk.sh status
```

### 2. Instalar
```bash
./install_cron_klk.sh install
```

¡Listo! Los ETLs se ejecutarán automáticamente cada 30 minutos.

---

## 📅 ¿Cuándo se ejecutan?

### Inventario
```
00:00, 00:30, 01:00, 01:30, 02:00, 02:30, 03:00, ...
```

### Ventas (5 min después)
```
00:05, 00:35, 01:05, 01:35, 02:05, 02:35, 03:05, ...
```

**Total:** 96 actualizaciones por día (datos cada 30 min)

---

## 📝 Ver Logs

```bash
# En tiempo real
tail -f logs/cron_klk_*.log

# Últimas 50 líneas
tail -50 logs/cron_klk_inventario_$(date +%Y%m%d).log
```

---

## 🛠️ Comandos Útiles

```bash
# Ver estado
./install_cron_klk.sh status

# Desinstalar
./install_cron_klk.sh uninstall

# Prueba manual
./cron_klk_realtime.sh inventario
./cron_klk_realtime.sh ventas
```

---

## 📚 Documentación Completa

Ver: [docs/CRON_KLK_REALTIME.md](docs/CRON_KLK_REALTIME.md)

---

**✅ Sistema listo para producción**
