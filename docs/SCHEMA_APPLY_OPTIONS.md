# Opciones para Aplicar Schema SQL en Producción

**Contexto**: La DB de producción está en EFS montado en `/data` dentro del container ECS.

**File System**: `fs-0ecbd91cff161c4d2` (16 GB)
**Mount Point**: `/data` en containers ECS
**DB Path**: `/data/fluxion_production.db`

---

## ✅ Opción 1: Endpoint API Temporal (MÁS RÁPIDA)

Crear un endpoint temporal en el backend para ejecutar el schema.

### Ventajas
- ✅ No requiere acceso SSH/SSM
- ✅ Se ejecuta desde el navegador
- ✅ Inmediato (< 2 minutos)
- ✅ El backend ya tiene acceso a la DB

### Implementación

1. **Agregar endpoint temporal al backend**:
```python
# En backend/main.py - agregar temporalmente

@app.post("/admin/apply-etl-tracking-schema")
async def apply_etl_tracking_schema(admin_token: str = Header(None)):
    """TEMPORAL - Aplicar schema de ETL tracking"""

    # Simple auth token
    if admin_token != "temp-deploy-2025-11-24":
        raise HTTPException(403, "Unauthorized")

    try:
        import duckdb
        from pathlib import Path

        db_path = Path("/data/fluxion_production.db")
        schema_path = Path("/app/database/schema_etl_tracking.sql")

        if not schema_path.exists():
            return {"error": "Schema file not found"}

        with open(schema_path, 'r') as f:
            schema_sql = f.read()

        conn = duckdb.connect(str(db_path))

        results = []
        for statement in schema_sql.split(';'):
            statement = statement.strip()
            if statement:
                try:
                    conn.execute(statement)
                    results.append({"statement": statement[:60], "status": "OK"})
                except Exception as e:
                    results.append({"statement": statement[:60], "error": str(e)})

        # Verificar tabla creada
        count = conn.execute("SELECT COUNT(*) FROM etl_ejecuciones").fetchone()[0]
        conn.close()

        return {
            "success": True,
            "statements_executed": len(results),
            "table_count": count,
            "results": results
        }

    except Exception as e:
        return {"success": False, "error": str(e)}
```

2. **Hacer deploy rápido**:
```bash
git add backend/main.py
git commit -m "temp: add schema apply endpoint"
git push origin main
# Esperar 10 minutos
```

3. **Ejecutar desde navegador o curl**:
```bash
curl -X POST https://d1tgnaj74tv17v.cloudfront.net/admin/apply-etl-tracking-schema \
  -H "admin-token: temp-deploy-2025-11-24" | jq
```

4. **Remover endpoint** (después de usar):
```bash
# Eliminar el endpoint del código
git add backend/main.py
git commit -m "temp: remove schema apply endpoint"
git push origin main
```

---

## ✅ Opción 2: ECS Run Task One-Off (MÁS ELEGANTE)

Ejecutar un task ECS one-off con un script Python.

### Ventajas
- ✅ Método "correcto" y profesional
- ✅ No modifica código del backend
- ✅ Reusable para futuras migraciones

### Desventajas
- ⚠️  Más complejo (requiere configurar task definition)
- ⚠️  Toma más tiempo (~15-20 minutos)

### Implementación

1. **Crear script de migración**:
```python
# scripts/apply_schema.py
import duckdb
from pathlib import Path

db_path = Path("/data/fluxion_production.db")
schema_path = Path("/app/database/schema_etl_tracking.sql")

print(f"📂 DB: {db_path}")
print(f"📂 Schema: {schema_path}")

with open(schema_path, 'r') as f:
    schema_sql = f.read()

conn = duckdb.connect(str(db_path))

statements = [s.strip() for s in schema_sql.split(';') if s.strip()]
print(f"\n🚀 Ejecutando {len(statements)} statements...")

for i, statement in enumerate(statements, 1):
    try:
        conn.execute(statement)
        print(f"  [{i}/{len(statements)}] ✅")
    except Exception as e:
        print(f"  [{i}/{len(statements)}] ⚠️  {str(e)[:60]}")

# Verificar
count = conn.execute("SELECT COUNT(*) FROM etl_ejecuciones").fetchone()[0]
print(f"\n✅ Schema aplicado! Tabla tiene {count} registros")
conn.close()
```

2. **Ejecutar via ECS run-task**:
```bash
aws ecs run-task \
  --cluster fluxion-cluster \
  --task-definition FluxionStackV2FluxionBackendTask94E5B2B4:23 \
  --overrides '{
    "containerOverrides": [{
      "name": "fluxion-backend",
      "command": ["python3", "/app/scripts/apply_schema.py"]
    }]
  }' \
  --launch-type FARGATE \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["subnet-xxx"],
      "securityGroups": ["sg-xxx"],
      "assignPublicIp": "DISABLED"
    }
  }'
```

---

## ✅ Opción 3: Via ETL Task con DuckDB CLI

Usar el container de ETL que ya tiene DuckDB instalado.

### Ventajas
- ✅ ETL ya tiene DuckDB CLI
- ✅ Acceso directo a EFS

### Desventajas
- ⚠️  Requiere verificar si ETL task tiene EFS montado

### Implementación

Similar a Opción 2 pero usando el task definition de ETL.

---

## ✅ Opción 4: Iniciar Instancia WireGuard Temporal

Iniciar una nueva instancia WireGuard para acceso SSH.

### Ventajas
- ✅ Acceso completo al sistema
- ✅ Útil para debugging

### Desventajas
- ⚠️  Más lento (~10-15 minutos)
- ⚠️  Requiere configurar security groups
- ⚠️  Costo adicional de EC2

### Implementación

```bash
# 1. Iniciar instancia via CDK o console
# 2. Montar EFS
# 3. Ejecutar schema
# 4. Terminar instancia
```

---

## 🎯 Recomendación

**OPCIÓN 1** (Endpoint API Temporal) es la más rápida y práctica para este caso:

### Pros:
- ⚡ 2 minutos de implementación
- ✅ Sin cambios de infraestructura
- ✅ Ejecutable desde curl/navegador
- ✅ Fácil de remover después

### Contras:
- ⚠️  Requiere otro micro-deploy (10 min)
- ⚠️  Endpoint temporal en producción

### Timeline:
1. Agregar endpoint: 2 min
2. Deploy: 10 min
3. Ejecutar: 30 seg
4. Remover endpoint: 2 min
5. Deploy: 10 min

**Total: ~25 minutos**

---

## 📝 Plan de Acción Recomendado

```bash
# 1. Crear endpoint temporal
# (ver código arriba)

# 2. Deploy rápido
git add backend/main.py
git commit -m "temp: endpoint para aplicar schema ETL tracking"
git push origin main

# 3. Esperar deploy (~10 min)
# Monitor: https://github.com/josefe-ing/fluxion-workspace/actions

# 4. Ejecutar schema
curl -X POST https://d1tgnaj74tv17v.cloudfront.net/admin/apply-etl-tracking-schema \
  -H "admin-token: temp-deploy-2025-11-24" | jq

# 5. Verificar
curl https://d1tgnaj74tv17v.cloudfront.net/api/etl/tracking/cron/status | jq

# 6. Remover endpoint
# (eliminar código del endpoint)
git add backend/main.py
git commit -m "temp: remover endpoint de schema (ya ejecutado)"
git push origin main
```

---

**Decisión**: ¿Cuál opción prefieres?
- Opción 1: Endpoint API (rápido, requiere micro-deploy)
- Opción 2: ECS Run Task (elegante, más complejo)
- Opción 3: ETL Task (verificar EFS montado primero)
- Opción 4: EC2 Temporal (más lento, más control)
