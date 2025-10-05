# 🛡️ Estrategia de Backup - Fluxion AI DuckDB

**Crítico:** Base de datos de 16GB con 81.8M registros de ventas

---

## 📊 Estado Actual

```
data/
├── fluxion_production.db  # 15GB - Base principal (81.8M ventas)
└── granja_analytics.db    # 1.1GB - Base analytics
```

**Valor:** Datos históricos irremplazables (13 meses de ventas, 16 tiendas)

---

## 🎯 Estrategia Multi-Capa

### CAPA 1: Backup Local (Diario)

**Ubicación:** Disco externo o carpeta local fuera del repo

```bash
# Script: scripts/backup_daily.sh
#!/bin/bash

BACKUP_DIR="$HOME/fluxion-backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup completo con timestamp
cp data/fluxion_production.db "$BACKUP_DIR/fluxion_production_$DATE.db"
cp data/granja_analytics.db "$BACKUP_DIR/granja_analytics_$DATE.db"

# Mantener solo últimos 7 backups (por espacio)
cd "$BACKUP_DIR"
ls -t fluxion_production_*.db | tail -n +8 | xargs rm -f 2>/dev/null || true
ls -t granja_analytics_*.db | tail -n +8 | xargs rm -f 2>/dev/null || true

echo "✅ Backup completado: $BACKUP_DIR"
echo "📁 Archivos:"
ls -lh "$BACKUP_DIR"
```

**Automatizar con cron:**
```bash
# Editar crontab
crontab -e

# Agregar (backup diario a las 2 AM)
0 2 * * * /Users/jose/Developer/fluxion-workspace/scripts/backup_daily.sh >> /Users/jose/fluxion-backups/backup.log 2>&1
```

---

### CAPA 2: Cloud Backup (Semanal)

**Opciones recomendadas:**

#### Opción A: Google Drive (GRATIS hasta 15GB)
```bash
# Instalar rclone
brew install rclone

# Configurar Google Drive
rclone config

# Script: scripts/backup_cloud_gdrive.sh
#!/bin/bash
DATE=$(date +%Y%m%d)

# Comprimir antes de subir (ahorra tiempo)
tar -czf /tmp/fluxion_backup_$DATE.tar.gz data/

# Subir a Google Drive
rclone copy /tmp/fluxion_backup_$DATE.tar.gz gdrive:fluxion-backups/

# Limpiar temp
rm /tmp/fluxion_backup_$DATE.tar.gz

echo "✅ Backup cloud completado"
```

**Automatizar (domingos a las 3 AM):**
```bash
0 3 * * 0 /Users/jose/Developer/fluxion-workspace/scripts/backup_cloud_gdrive.sh
```

#### Opción B: Dropbox (2GB gratis, 2TB con suscripción)
```bash
# Similar a Google Drive pero usando Dropbox
rclone copy /tmp/fluxion_backup_$DATE.tar.gz dropbox:fluxion-backups/
```

#### Opción C: AWS S3 (Más profesional, ~$0.50/mes por 16GB)
```bash
# Instalar AWS CLI
brew install awscli

# Configurar
aws configure

# Script: scripts/backup_cloud_s3.sh
#!/bin/bash
DATE=$(date +%Y%m%d)

# Comprimir
tar -czf /tmp/fluxion_backup_$DATE.tar.gz data/

# Subir a S3 (usar Glacier para bajo costo)
aws s3 cp /tmp/fluxion_backup_$DATE.tar.gz \
  s3://fluxion-backups-jose/backups/fluxion_backup_$DATE.tar.gz \
  --storage-class GLACIER

# Limpiar
rm /tmp/fluxion_backup_$DATE.tar.gz

echo "✅ Backup S3 completado"
```

---

### CAPA 3: DuckDB Export (Incremental)

**Ventaja:** Backups más pequeños con SQL export

```bash
# Script: scripts/backup_export.sh
#!/bin/bash

BACKUP_DIR="$HOME/fluxion-backups/exports"
DATE=$(date +%Y%m%d)

mkdir -p "$BACKUP_DIR"

# Export usando DuckDB CLI
duckdb data/fluxion_production.db << EOF
EXPORT DATABASE '$BACKUP_DIR/export_$DATE' (FORMAT PARQUET);
EOF

echo "✅ Export Parquet completado: $BACKUP_DIR/export_$DATE"
```

**Ventaja:** Formato Parquet es más comprimido (~50-70% menos espacio)

---

### CAPA 4: Backup Git LFS (Para sincronizar con equipo)

**Git LFS** permite versionar archivos grandes en Git:

```bash
# Instalar Git LFS
brew install git-lfs
git lfs install

# Trackear archivos .db
git lfs track "data/*.db"
git add .gitattributes

# Commit y push (sube a GitHub LFS)
git add data/fluxion_production.db
git commit -m "chore: add database to Git LFS"
git push origin main
```

**⚠️ COSTO:** GitHub LFS gratis hasta 1GB, luego:
- Data pack 50GB: $5/mes
- Data pack 100GB: $10/mes

**Alternativa:** Usar solo para `granja_analytics.db` (1.1GB) y dejar `fluxion_production.db` fuera.

---

## 📋 Plan Recomendado (GRATIS)

### Setup Inicial (Una vez)

```bash
# 1. Crear directorio de backups local
mkdir -p ~/fluxion-backups

# 2. Instalar rclone para cloud
brew install rclone

# 3. Configurar Google Drive
rclone config
# Seguir wizard: New remote → Google Drive → Autorizar

# 4. Copiar scripts
cp scripts/backup_daily.sh ~/
cp scripts/backup_cloud_gdrive.sh ~/
chmod +x ~/backup_daily.sh
chmod +x ~/backup_cloud_gdrive.sh
```

### Backups Automáticos

```bash
# Editar crontab
crontab -e

# Agregar estas líneas:
# Backup local diario (2 AM)
0 2 * * * ~/backup_daily.sh >> ~/fluxion-backups/backup.log 2>&1

# Backup cloud semanal (domingos 3 AM)
0 3 * * 0 ~/backup_cloud_gdrive.sh >> ~/fluxion-backups/cloud.log 2>&1
```

---

## 🔄 Proceso de Restore

### Restaurar desde backup local:

```bash
# Listar backups disponibles
ls -lh ~/fluxion-backups/

# Restaurar (PRECAUCIÓN: sobrescribe actual)
cp ~/fluxion-backups/fluxion_production_20251002_020000.db data/fluxion_production.db
```

### Restaurar desde Google Drive:

```bash
# Listar backups en cloud
rclone ls gdrive:fluxion-backups/

# Descargar
rclone copy gdrive:fluxion-backups/fluxion_backup_20251002.tar.gz /tmp/

# Descomprimir
cd /Users/jose/Developer/fluxion-workspace
tar -xzf /tmp/fluxion_backup_20251002.tar.gz
```

### Restaurar desde DuckDB Export:

```bash
# Importar export Parquet
duckdb data/fluxion_production_restored.db << EOF
IMPORT DATABASE '~/fluxion-backups/exports/export_20251002';
EOF
```

---

## ⚡ Backup Manual Rápido (Antes de cambios grandes)

```bash
# Antes de hacer cambios importantes a la DB
cp data/fluxion_production.db data/fluxion_production_before_change.db

# O usar timestamp
cp data/fluxion_production.db data/fluxion_production_$(date +%Y%m%d_%H%M%S).db
```

---

## 📊 Tabla de Comparación

| Método | Espacio | Costo | Velocidad | Seguridad |
|--------|---------|-------|-----------|-----------|
| **Local Daily** | 112GB/semana | GRATIS | ⚡ Rápido | 🟡 Media |
| **Google Drive** | 16GB | GRATIS* | 🐌 Lento (upload) | 🟢 Alta |
| **AWS S3 Glacier** | 16GB | $0.50/mes | 🐌 Lento | 🟢 Alta |
| **DuckDB Export** | ~6GB (Parquet) | GRATIS | ⚡ Rápido | 🟢 Alta |
| **Git LFS** | 16GB | $5-10/mes | 🚀 Sync auto | 🟢 Alta |

*Google Drive gratis hasta 15GB (justo cabe)

---

## 🎯 Configuración Recomendada AHORA

### Paso 1: Backup Inmediato

```bash
# Crear primer backup YA
mkdir -p ~/fluxion-backups
cp data/fluxion_production.db ~/fluxion-backups/fluxion_production_$(date +%Y%m%d).db
cp data/granja_analytics.db ~/fluxion-backups/granja_analytics_$(date +%Y%m%d).db

echo "✅ Primer backup creado en ~/fluxion-backups/"
ls -lh ~/fluxion-backups/
```

### Paso 2: Configurar Google Drive (10 min)

```bash
# Instalar rclone
brew install rclone

# Configurar (seguir wizard)
rclone config

# Probar subida
tar -czf /tmp/fluxion_test.tar.gz data/
rclone copy /tmp/fluxion_test.tar.gz gdrive:fluxion-backups/
rm /tmp/fluxion_test.tar.gz

echo "✅ Cloud backup configurado"
```

### Paso 3: Automatizar (5 min)

```bash
# Agregar a crontab
crontab -e

# Pegar:
0 2 * * * cp ~/Developer/fluxion-workspace/data/fluxion_production.db ~/fluxion-backups/fluxion_production_$(date +\%Y\%m\%d).db
0 3 * * 0 cd ~/Developer/fluxion-workspace && tar -czf /tmp/fluxion_$(date +\%Y\%m\%d).tar.gz data/ && rclone copy /tmp/fluxion_$(date +\%Y\%m\%d).tar.gz gdrive:fluxion-backups/ && rm /tmp/fluxion_$(date +\%Y\%m\%d).tar.gz
```

---

## 🚨 Checklist de Seguridad

- [ ] **Backup local creado** (~/fluxion-backups/)
- [ ] **Google Drive configurado** (rclone)
- [ ] **Primer backup cloud subido**
- [ ] **Crontab configurado** (backups automáticos)
- [ ] **Restore testeado** (bajar y verificar funciona)
- [ ] **Documentación actualizada** (este archivo)
- [ ] **Equipo notificado** (dónde están los backups)

---

## 📞 Contacto en Emergencia

Si pierdes acceso a la base de datos:

1. **Backup local:** `~/fluxion-backups/`
2. **Backup cloud:** Google Drive → carpeta `fluxion-backups`
3. **Logs de backup:** `~/fluxion-backups/backup.log`

---

**Última actualización:** Octubre 2025
**Responsable:** Jose
**Criticidad:** 🔴 MÁXIMA (datos irremplazables)
