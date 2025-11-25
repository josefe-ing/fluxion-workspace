# Post-Deploy Steps - Sistema KLK v2.0

**Deploy Status**: ✅ EXITOSO
**Fecha**: 2025-11-24 15:10
**Workflow**: https://github.com/josefe-ing/fluxion-workspace/actions/runs/19645390484

---

## ✅ Deploy Completado

Todos los jobs del workflow completaron exitosamente:
- ✅ Backend Build & Test
- ✅ Frontend Build & Test
- ✅ Build & Push Backend Docker Image
- ✅ Deploy Infrastructure & Backend
- ✅ Deploy Frontend
- ✅ Health Check

**URLs de Producción**:
- Frontend: https://d20a0g9yxinot2.cloudfront.net
- Backend: https://d1tgnaj74tv17v.cloudfront.net

---

## ⚠️  Paso Crítico Pendiente

### El código está desplegado PERO falta crear la tabla en DB de producción

**Error actual**:
```
Catalog Error: Table with name etl_ejecuciones does not exist!
```

**Causa**: El schema SQL `database/schema_etl_tracking.sql` NO se ejecutó automáticamente en la base de datos de producción.

---

## 🔧 Solución: Ejecutar Schema SQL

### Opción 1: Via ECS Task (Recomendado)

1. **Conectarse al backend container via SSM**:
```bash
# 1. Obtener task ID
TASK_ID=$(aws ecs list-tasks --cluster fluxion-cluster \
  --service-name FluxionStackV2-FluxionBackendServiceE051E4B7-3D0YfNUbXnmp \
  --query 'taskArns[0]' --output text | cut -d'/' -f3)

echo "Task ID: $TASK_ID"

# 2. Conectarse al container
aws ecs execute-command \
  --cluster fluxion-cluster \
  --task $TASK_ID \
  --container fluxion-backend \
  --interactive \
  --command "/bin/bash"
```

2. **Dentro del container, ejecutar el schema**:
```bash
# Verificar que el schema existe
ls -la /app/database/schema_etl_tracking.sql

# Ejecutar schema con Python
python3 << 'EOF'
import duckdb
from pathlib import Path

# Path a la DB en EFS
db_path = "/mnt/efs/data/fluxion_production.db"
schema_path = "/app/database/schema_etl_tracking.sql"

# Leer schema
with open(schema_path, 'r') as f:
    schema_sql = f.read()

# Conectar y ejecutar
conn = duckdb.connect(db_path)

# Ejecutar cada statement
for statement in schema_sql.split(';'):
    statement = statement.strip()
    if statement:
        print(f"Ejecutando: {statement[:60]}...")
        try:
            conn.execute(statement)
            print("  ✅ OK")
        except Exception as e:
            print(f"  ⚠️  Error: {e}")

conn.close()
print("\n✅ Schema aplicado exitosamente!")
EOF

# Verificar que la tabla existe
python3 << 'EOF'
import duckdb
conn = duckdb.connect("/mnt/efs/data/fluxion_production.db")
result = conn.execute("SELECT COUNT(*) as count FROM etl_ejecuciones").fetchone()
print(f"✅ Tabla etl_ejecuciones creada - {result[0]} registros")
conn.close()
EOF
```

3. **Salir del container**:
```bash
exit
```

### Opción 2: Via Script de Migración

Crear un script de migración y ejecutarlo como ECS task one-off:

```bash
# 1. Crear script de migración
cat > /tmp/apply_etl_tracking_schema.py << 'EOF'
#!/usr/bin/env python3
import duckdb
from pathlib import Path

db_path = Path("/mnt/efs/data/fluxion_production.db")
schema_path = Path("/app/database/schema_etl_tracking.sql")

print(f"🔍 Verificando DB: {db_path}")
print(f"🔍 Schema file: {schema_path}")

with open(schema_path, 'r') as f:
    schema_sql = f.read()

conn = duckdb.connect(str(db_path))

statements = [s.strip() for s in schema_sql.split(';') if s.strip()]
print(f"\n📝 Ejecutando {len(statements)} statements...")

for i, statement in enumerate(statements, 1):
    try:
        conn.execute(statement)
        print(f"  [{i}/{len(statements)}] ✅ OK")
    except Exception as e:
        print(f"  [{i}/{len(statements)}] ⚠️  {str(e)[:100]}")

conn.close()
print("\n✅ Migración completada!")
EOF

# 2. Copiar al container y ejecutar
# (requiere acceso al container via ECS exec)
```

### Opción 3: Via WireGuard Bridge + DuckDB CLI

Si tienes acceso directo a la DB via WireGuard:

```bash
# 1. Conectarse a la instancia WireGuard
aws ssm start-session --target i-07cc62e4314a4a67a

# 2. Desde la instancia, acceder a EFS
sudo su
cd /mnt/efs/data

# 3. Aplicar schema
duckdb fluxion_production.db < /path/to/schema_etl_tracking.sql

# 4. Verificar
duckdb fluxion_production.db "SELECT COUNT(*) FROM etl_ejecuciones"
```

---

## 🧪 Validación Post-Schema

Después de aplicar el schema, verificar:

### 1. Endpoint de Ejecuciones
```bash
curl 'https://d1tgnaj74tv17v.cloudfront.net/api/etl/tracking/ejecuciones?limite=5'
# Debería retornar: [] (array vacío, no error)
```

### 2. Endpoint de Cron Status
```bash
curl 'https://d1tgnaj74tv17v.cloudfront.net/api/etl/tracking/cron/status' | jq
# Debería retornar JSON con métricas (ejecuciones_hoy: 0)
```

### 3. Endpoint de Gaps
```bash
curl 'https://d1tgnaj74tv17v.cloudfront.net/api/etl/tracking/gaps' | jq
# Debería retornar: [] (array vacío)
```

### 4. Frontend - Panel de Tracking
```bash
open https://d20a0g9yxinot2.cloudfront.net
# Navegar a: Configuración → KLK Tracking
# Debería mostrar: "No hay ejecuciones registradas" (sin errores HTTP 500)
```

---

## 📊 Estado Actual del Sistema

### Código Desplegado
- ✅ Backend: Nuevo código con etl_tracking_router
- ✅ Frontend: Componentes de tracking UI
- ✅ Docker Images: Pusheadas a ECR
- ✅ CloudFront: Invalidado y actualizado

### Base de Datos
- ⚠️  Tabla `etl_ejecuciones`: **NO EXISTE AÚN**
- ⚠️  Vistas SQL: **NO EXISTEN AÚN**
- ⚠️  Secuencias: **NO EXISTEN AÚN**

### Funcionalidad
- ✅ Backend health check: Funcionando
- ✅ Endpoints existentes: Funcionando
- ⚠️  Endpoints `/api/etl/tracking/*`: **ERROR 500** (tabla faltante)
- ⚠️  Frontend tracking panels: **ERROR** (API falla)

---

## 🚨 Errores Pre-Existentes (NO Causados por Deploy)

Los siguientes errores ya existían ANTES del deploy:

1. **`almacen_codigo` column not found** (ubicaciones/summary)
2. **`fecha_pedido` column not found** (pedidos-sugeridos)

Estos NO son relacionados con el deploy de hoy y pueden ser ignorados por ahora.

---

## 🎯 Próximos Pasos (Orden)

1. **[CRÍTICO]** Ejecutar schema SQL en producción (usar Opción 1)
2. **[VALIDAR]** Probar endpoints de tracking
3. **[VALIDAR]** Abrir frontend y verificar panels de tracking
4. **[OPCIONAL]** Configurar Sentry DSN en variables de entorno ECS
5. **[OPCIONAL]** Ejecutar primer ETL manual para poblar tabla
6. **[OPCIONAL]** Configurar alertas en Sentry

---

## 📞 Comando Rápido para Aplicar Schema

```bash
# Todo en uno - Ejecutar schema via ECS exec
TASK_ID=$(aws ecs list-tasks --cluster fluxion-cluster \
  --service-name FluxionStackV2-FluxionBackendServiceE051E4B7-3D0YfNUbXnmp \
  --query 'taskArns[0]' --output text | cut -d'/' -f3)

aws ecs execute-command \
  --cluster fluxion-cluster \
  --task $TASK_ID \
  --container fluxion-backend \
  --interactive \
  --command "/bin/bash"

# Luego dentro del container:
# python3 -c "import duckdb; conn = duckdb.connect('/mnt/efs/data/fluxion_production.db'); conn.execute(open('/app/database/schema_etl_tracking.sql').read()); print('✅ Schema aplicado!')"
```

---

**Estado**: ⏸️  Deploy exitoso, esperando aplicación de schema SQL
**Próximo paso**: Ejecutar schema en producción para activar funcionalidad de tracking
