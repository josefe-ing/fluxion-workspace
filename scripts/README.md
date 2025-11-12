# Scripts de Automatización

Este directorio contiene scripts para automatizar procesos del sistema Fluxion AI.

## 📜 Scripts Disponibles

### `ejecutar_abc_xyz_diario.sh`

**Descripción**: Script de ejecución diaria de cálculos ABC-XYZ con detección automática de cambios.

**Uso**:
```bash
./scripts/ejecutar_abc_xyz_diario.sh
```

**Funciones**:
- ✅ Ejecuta cálculo ABC v2 por tienda
- ✅ Ejecuta cálculo XYZ por tienda
- ✅ Detecta cambios automáticamente
- ✅ Guarda logs rotados por fecha
- ✅ Limpia logs antiguos (>30 días)
- ✅ Manejo robusto de errores

**Logs**:
- Ubicación: `logs/abc-xyz/abc-xyz-YYYY-MM-DD.log`
- Rotación: Diaria
- Retención: 30 días

**Configuración Cron**:
```bash
# Ejecutar diariamente a las 3 AM
0 3 * * * /Users/jose/Developer/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh
```

**Documentación completa**: [../docs/INSTALACION_CRON_ABC_XYZ.md](../docs/INSTALACION_CRON_ABC_XYZ.md)

---

## 🔧 Requisitos

- Python 3.14+
- DuckDB instalado
- Base de datos en `data/fluxion_production.db`
- Scripts de cálculo en `database/`

---

## 📊 Monitoreo

Ver logs en tiempo real:
```bash
tail -f logs/abc-xyz/abc-xyz-$(date +%Y-%m-%d).log
```

Ver últimas 20 líneas:
```bash
tail -20 logs/abc-xyz/abc-xyz-$(date +%Y-%m-%d).log
```

Buscar errores:
```bash
grep "ERROR" logs/abc-xyz/*.log
```

---

## 🐛 Troubleshooting

Si el script falla:

1. **Verificar permisos**:
   ```bash
   chmod +x scripts/ejecutar_abc_xyz_diario.sh
   ```

2. **Verificar rutas**:
   ```bash
   ls -lh data/fluxion_production.db
   ls -lh database/calcular_abc_v2_por_tienda.py
   ```

3. **Ver log completo**:
   ```bash
   cat logs/abc-xyz/abc-xyz-$(date +%Y-%m-%d).log
   ```

---

Para más información, ver [INSTALACION_CRON_ABC_XYZ.md](../docs/INSTALACION_CRON_ABC_XYZ.md)
