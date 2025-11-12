# Guía de Deployment a Producción - Fluxion AI

## Fecha de Release: 2025-11-12

---

## Cambios Incluidos en Este Release

### 1. Sistema de Alertas de Reclasificación ABC-XYZ
- **Commit**: `75430d2`
- **Descripción**: Sistema completo de tracking histórico y alertas para cambios en clasificaciones
- **Archivos modificados**: 14 archivos (3,523 líneas agregadas)

### 2. Sistema de Conjuntos Sustituibles y Mejoras ETL
- **Commit**: `6220c85`
- **Descripción**: Gestión de productos sustituibles y mejoras en extracción de datos
- **Archivos modificados**: 14 archivos (3,751 líneas agregadas)

---

## Pre-requisitos en Servidor de Producción

### Software Requerido
- Python 3.14.0+
- Node.js 18+ y npm
- DuckDB 1.4+
- Git
- Cron (para automatización)

### Acceso Necesario
- SSH al servidor de producción
- Permisos de escritura en directorio de aplicación
- Acceso a configurar cron jobs

---

## Pasos de Deployment

### 1. Backup de Base de Datos (CRÍTICO)

```bash
# Conectarse al servidor de producción
ssh usuario@servidor-produccion

# Ir al directorio de la aplicación
cd /ruta/a/fluxion-workspace

# Crear backup de la base de datos
cp data/fluxion_production.db data/backups/fluxion_production_$(date +%Y%m%d_%H%M%S).db

# Verificar que el backup se creó correctamente
ls -lh data/backups/
```

**IMPORTANTE**: NO continuar si el backup falla.

---

### 2. Pull de Código Nuevo

```bash
# Detener servicios actuales (si están corriendo)
./stop.sh

# Pull del código nuevo
git fetch origin
git pull origin main

# Verificar que estamos en el commit correcto
git log -3 --oneline
# Debería mostrar:
# 6220c85 feat: agregar sistema de conjuntos sustituibles y mejoras ETL
# 75430d2 feat: implementar sistema completo de alertas de reclasificación ABC-XYZ
```

---

### 3. Actualizar Dependencias Backend

```bash
cd backend

# Activar entorno virtual
source venv/bin/activate

# Actualizar dependencias
pip install --upgrade -r requirements.txt

# Verificar instalación
python3 -c "import fastapi; import duckdb; print('Backend OK')"
```

---

### 4. Actualizar Dependencias Frontend

```bash
cd ../frontend

# Instalar nuevas dependencias
npm install

# Build para producción
npm run build

# Verificar que el build fue exitoso
ls -lh dist/
```

---

### 5. Aplicar Migraciones de Base de Datos

#### 5.1 Crear Tabla de Alertas

```bash
cd ../database

# Aplicar esquema de alertas
python3 -c "
import duckdb
conn = duckdb.connect('../data/fluxion_production.db')
with open('schema_alertas_clasificacion.sql', 'r') as f:
    sql = f.read()
    conn.execute(sql)
print('✅ Tabla de alertas creada')
conn.close()
"
```

#### 5.2 Verificar Tablas Creadas

```bash
python3 -c "
import duckdb
conn = duckdb.connect('../data/fluxion_production.db')

# Verificar tabla de alertas
count = conn.execute('SELECT COUNT(*) FROM alertas_cambio_clasificacion').fetchone()[0]
print(f'✅ Tabla alertas_cambio_clasificacion: {count} registros')

# Verificar tabla de histórico
try:
    count = conn.execute('SELECT COUNT(*) FROM productos_abc_v2_historico').fetchone()[0]
    print(f'✅ Tabla productos_abc_v2_historico: {count} registros')
except:
    print('ℹ️  Tabla productos_abc_v2_historico se creará en primera ejecución ABC')

conn.close()
"
```

---

### 6. Configurar Cron Job para ABC-XYZ

```bash
cd ../

# Hacer script ejecutable (si no lo es)
chmod +x scripts/ejecutar_abc_xyz_diario.sh

# Crear directorio de logs
mkdir -p logs/abc-xyz

# Probar ejecución manual
./scripts/ejecutar_abc_xyz_diario.sh

# Verificar que funcionó
tail -50 logs/abc-xyz/abc-xyz-$(date +%Y-%m-%d).log
```

#### Configurar Cron

```bash
# Abrir crontab
crontab -e

# Agregar línea (ajustar la ruta):
0 3 * * * /ruta/completa/a/fluxion-workspace/scripts/ejecutar_abc_xyz_diario.sh >> /ruta/completa/a/fluxion-workspace/logs/cron-abc-xyz.log 2>&1

# Guardar y salir

# Verificar que se guardó
crontab -l
```

---

### 7. Iniciar Servicios

```bash
# Desde el directorio raíz del proyecto
cd /ruta/a/fluxion-workspace

# Iniciar backend
cd backend
source venv/bin/activate
nohup python3 start.py > ../logs/backend.log 2>&1 &
echo $! > ../backend.pid

# Verificar que está corriendo
curl http://localhost:8001/ || echo "Backend NO está respondiendo"

# Servir frontend
# Opción 1: Usar nginx (recomendado)
# Copiar dist/ a directorio de nginx
sudo cp -r frontend/dist/* /var/www/html/fluxion/

# Opción 2: Usar servidor simple de Node
cd frontend
nohup npx serve -s dist -l 3001 > ../logs/frontend.log 2>&1 &
echo $! > ../frontend.pid
```

---

### 8. Verificación Post-Deployment

#### 8.1 Verificar Backend

```bash
# Health check
curl http://localhost:8001/

# Probar endpoints nuevos de alertas
curl http://localhost:8001/api/alertas/cambios-clasificacion | jq .

# Probar endpoint de resumen
curl http://localhost:8001/api/alertas/resumen-tiendas | jq .
```

#### 8.2 Verificar Frontend

```bash
# Abrir en navegador
# http://servidor-produccion:3001/

# Verificar que las rutas nuevas cargan:
# - /administrador/alertas
# - Dashboard de productos con modal de histórico
```

#### 8.3 Verificar Base de Datos

```bash
python3 -c "
import duckdb
conn = duckdb.connect('data/fluxion_production.db')

# Verificar tablas
tables = conn.execute(\"\"\"
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'main'
    ORDER BY table_name
\"\"\").fetchall()

print('📊 Tablas en base de datos:')
for t in tables:
    count = conn.execute(f'SELECT COUNT(*) FROM {t[0]}').fetchone()[0]
    print(f'  - {t[0]}: {count:,} registros')

conn.close()
"
```

#### 8.4 Verificar Cron

```bash
# Ver último log del cron (después de primera ejecución)
tail -100 logs/cron-abc-xyz.log

# Ver log detallado del día
tail -100 logs/abc-xyz/abc-xyz-$(date +%Y-%m-%d).log
```

---

## Testing en Producción

### Test 1: Ejecutar Cálculo ABC-XYZ Manualmente

```bash
# Ejecutar script
./scripts/ejecutar_abc_xyz_diario.sh

# Verificar salida
# Debería mostrar:
# ✅ Cálculo ABC v2 completado exitosamente
# ✅ Cálculo XYZ completado exitosamente
# 📊 Estadísticas: X clasificaciones, Y alertas
```

### Test 2: Verificar API de Alertas

```bash
# Obtener alertas
curl -X GET "http://localhost:8001/api/alertas/cambios-clasificacion?dias=30&limit=10" | jq .

# Debería retornar JSON con:
# - alertas: []
# - estadisticas: { total, criticas, alta_prioridad, pendientes }
```

### Test 3: Verificar Dashboard Frontend

1. Abrir navegador: `http://servidor:3001/administrador/alertas`
2. Verificar que carga sin errores
3. Probar filtros (período, tienda)
4. Verificar que estadísticas se muestran
5. Click en "Ver detalle" en una alerta
6. Verificar modal de detalle

### Test 4: Verificar Histórico de Producto

1. Ir a dashboard de productos
2. Buscar un producto
3. Click en "Ver Histórico"
4. Verificar que modal muestra clasificación actual
5. Verificar que muestra histórico (si existe)

---

## Rollback (En Caso de Problemas)

### Si hay problemas con el código:

```bash
# Detener servicios
pkill -f "python3 start.py"
pkill -f "npx serve"

# Volver al commit anterior
git log --oneline  # Ver commits
git reset --hard b735d6e  # Commit anterior al release

# Restaurar base de datos desde backup
cp data/backups/fluxion_production_YYYYMMDD_HHMMSS.db data/fluxion_production.db

# Reinstalar dependencias anteriores
cd backend
pip install -r requirements.txt

cd ../frontend
npm install
npm run build

# Reiniciar servicios
./start_dev.sh
```

### Si solo hay problemas con el cron:

```bash
# Desactivar cron
crontab -e
# Comentar la línea del cron (agregar # al inicio)

# Guardar y verificar
crontab -l
```

---

## Monitoreo Post-Deployment

### Logs a Monitorear

```bash
# Backend
tail -f logs/backend.log

# Cron ABC-XYZ
tail -f logs/cron-abc-xyz.log

# Detalles diarios
tail -f logs/abc-xyz/abc-xyz-$(date +%Y-%m-%d).log
```

### Métricas Clave

```bash
# Número de alertas generadas por día
python3 -c "
import duckdb
conn = duckdb.connect('data/fluxion_production.db')
result = conn.execute('''
    SELECT
        DATE(fecha_cambio) as fecha,
        COUNT(*) as alertas,
        SUM(CASE WHEN es_critico THEN 1 ELSE 0 END) as criticas
    FROM alertas_cambio_clasificacion
    WHERE fecha_cambio >= CURRENT_DATE - INTERVAL 7 DAYS
    GROUP BY DATE(fecha_cambio)
    ORDER BY fecha DESC
''').fetchall()

for row in result:
    print(f'{row[0]}: {row[1]} alertas ({row[2]} críticas)')
"
```

### Alertas a Configurar

1. **Cron no ejecuta**: Verificar logs diarios
2. **Base de datos crece mucho**: Monitorear tamaño de `productos_abc_v2_historico`
3. **API responde lento**: Verificar queries de alertas
4. **Alertas no se generan**: Verificar scripts de cálculo

---

## Optimizaciones Post-Deployment

### 1. Índices de Base de Datos

Los índices ya están creados en el schema, pero verificar:

```bash
python3 -c "
import duckdb
conn = duckdb.connect('data/fluxion_production.db')
indices = conn.execute(\"\"\"
    SELECT * FROM duckdb_indexes()
    WHERE table_name IN ('alertas_cambio_clasificacion', 'productos_abc_v2_historico')
\"\"\").fetchall()
print('Índices creados:')
for idx in indices:
    print(f'  - {idx}')
"
```

### 2. Limpieza de Datos Antiguos

Configurar limpieza mensual de alertas viejas:

```bash
# Agregar a crontab (mensual, día 1 a las 2 AM)
0 2 1 * * python3 /ruta/a/fluxion-workspace/scripts/limpiar_alertas_antiguas.py
```

Crear script `scripts/limpiar_alertas_antiguas.py`:

```python
import duckdb
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"
conn = duckdb.connect(str(DB_PATH))

# Borrar alertas revisadas con más de 90 días
result = conn.execute("""
    DELETE FROM alertas_cambio_clasificacion
    WHERE revisado = true
    AND fecha_cambio < CURRENT_DATE - INTERVAL 90 DAYS
""")

print(f"✅ Limpieza completada: {result.fetchone()[0]} alertas eliminadas")
conn.close()
```

---

## Contacto y Soporte

- **Repositorio**: https://github.com/josefe-ing/fluxion-workspace
- **Documentación**:
  - Sistema de Alertas: `docs/SISTEMA_HISTORICO_CLASIFICACIONES.md`
  - Guía de Usuario: `docs/GUIA_USO_ALERTAS_CLASIFICACION.md`
  - Instalación Cron: `docs/INSTALACION_CRON_ABC_XYZ.md`

---

## Checklist Final de Deployment

- [ ] Backup de base de datos creado
- [ ] Código actualizado (git pull)
- [ ] Dependencias backend instaladas
- [ ] Frontendbuildeado
- [ ] Tabla de alertas creada
- [ ] Cron job configurado
- [ ] Script ABC-XYZ probado manualmente
- [ ] Backend iniciado y respondiendo
- [ ] Frontend accesible
- [ ] API de alertas funciona
- [ ] Dashboard de alertas carga
- [ ] Modal de histórico funciona
- [ ] Logs se están generando
- [ ] Monitoreo configurado

---

**Deployment completado el**: ________________
**Deployado por**: ________________
**Versión**: v1.0-alertas-abc-xyz
**Status**: ⬜ PENDING / ⬜ IN PROGRESS / ⬜ COMPLETED / ⬜ ROLLED BACK

---

## Notas Adicionales

_(Espacio para notas durante el deployment)_
