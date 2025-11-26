# ETL PostgreSQL - Fluxion AI

Este documento explica cómo usar los ETLs adaptados para PostgreSQL (AWS RDS).

## Contexto

Durante la migración de **DuckDB → PostgreSQL**, se crearon versiones de los ETLs que cargan datos directamente a PostgreSQL en lugar de DuckDB.

## Arquitectura

```
┌─────────────────┐
│   KLK API       │  ← Fuente de datos (sistema ERP La Granja)
└────────┬────────┘
         │ HTTP requests
         ▼
┌─────────────────┐
│   Extractor     │  ← Extrae datos del API KLK
└────────┬────────┘
         │ pandas DataFrame
         ▼
┌─────────────────┐
│  Transformer    │  ← Mapea/valida al esquema PostgreSQL
└────────┬────────┘
         │ pandas DataFrame (productos + stock)
         ▼
┌─────────────────┐
│     Loader      │  ← loader_inventario_postgres.py
│   (PostgreSQL)  │     - UPSERT productos
└────────┬────────┘     - Snapshot histórico
         │ psycopg2     - INSERT inventario_actual
         ▼
┌─────────────────┐
│  PostgreSQL RDS │  ← Destino final (AWS RDS o Docker local)
└─────────────────┘
```

## Scripts Disponibles

### 1. ETL Inventario KLK → PostgreSQL

**Archivo:** `etl_inventario_klk_postgres.py`

**Descripción:**
Extrae inventario actual desde el sistema KLK y lo carga directamente a PostgreSQL.

**Uso:**

```bash
cd etl

# Modo producción (carga a PostgreSQL)
python3 etl_inventario_klk_postgres.py

# Modo dry-run (solo extrae y transforma, no carga)
python3 etl_inventario_klk_postgres.py --dry-run

# Procesar tiendas específicas
python3 etl_inventario_klk_postgres.py --tiendas tienda_01 tienda_08

# Dry-run de tiendas específicas
python3 etl_inventario_klk_postgres.py --dry-run --tiendas tienda_01
```

**Qué hace:**

1. **Extracción**: Consulta el API KLK para cada tienda configurada (5 tiendas KLK actualmente)
2. **Transformación**: Mapea datos al esquema PostgreSQL (productos + inventario_actual)
3. **Carga**:
   - **Productos**: UPSERT en tabla `productos` (si no existe, lo crea)
   - **Inventario Histórico**: Guarda snapshot ANTES de actualizar (tabla `inventario_historico`)
   - **Inventario Actual**: DELETE + INSERT en tabla `inventario_actual`

**Tablas afectadas:**

- `productos`: Maestro de productos (UPSERTs)
- `inventario_actual`: Estado actual del inventario (REPLACE completo por tienda/almacén)
- `inventario_historico`: Snapshots históricos (INSERT de versión previa)

**Logs:**

```bash
# Logs se guardan en:
etl/logs/inventario_klk_postgres_YYYYMMDD.log
```

## Variables de Entorno Requeridas

### Para conectarse a PostgreSQL Local (Docker)

```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=fluxion_production
export POSTGRES_USER=fluxion
export POSTGRES_PASSWORD=fluxion_dev_2025
export DB_MODE=postgresql  # Esto fuerza modo PostgreSQL
```

### Para conectarse a PostgreSQL en AWS RDS (Producción)

```bash
export POSTGRES_HOST=<RDS_ENDPOINT>  # ej: fluxion-db.xyz.us-east-1.rds.amazonaws.com
export POSTGRES_PORT=5432
export POSTGRES_DB=fluxion_production
export POSTGRES_USER=fluxion_admin
export POSTGRES_PASSWORD=<SECURE_PASSWORD>
export DB_MODE=postgresql
```

**IMPORTANTE**: Para conectarse a AWS RDS desde tu máquina local, necesitas:

1. Estar conectado a la VPN de AWS (si está configurada)
2. O ajustar el Security Group del RDS para permitir tu IP pública
3. O ejecutar los ETLs desde una instancia EC2 dentro de la VPC

## Testing Local con PostgreSQL Docker

### 1. Iniciar PostgreSQL Local

```bash
# Desde el directorio raíz del proyecto
docker-compose up -d postgres
```

Esto levanta PostgreSQL 16.3 en `localhost:5432` con la base de datos `fluxion_production`.

### 2. Verificar que las migraciones estén aplicadas

```bash
# Ejecutar migraciones si no se han aplicado
cd database
python3 run_migrations.py
```

Esto debería aplicar las migraciones 001-008, creando todas las tablas necesarias:

- `ubicaciones`
- `productos`
- `inventario_actual`
- `inventario_historico`
- `usuarios`
- `configuraciones`
- `ventas`
- `pedidos_sugeridos`
- `pedidos_productos`

### 3. Ejecutar ETL de inventario (dry-run primero)

```bash
cd etl

# Dry-run para verificar que todo funciona
python3 etl_inventario_klk_postgres.py --dry-run --tiendas tienda_01

# Si todo se ve bien, ejecutar sin dry-run
python3 etl_inventario_klk_postgres.py --tiendas tienda_01
```

### 4. Verificar datos cargados

```bash
# Conectar a PostgreSQL
psql -h localhost -p 5432 -U fluxion -d fluxion_production

# Verificar productos cargados
SELECT COUNT(*) FROM productos;

# Verificar inventario actual
SELECT COUNT(*) FROM inventario_actual;

# Ver últimos registros de inventario
SELECT
    u.nombre as tienda,
    p.codigo,
    p.nombre as producto,
    ia.cantidad,
    ia.fecha_actualizacion
FROM inventario_actual ia
INNER JOIN ubicaciones u ON ia.ubicacion_id = u.id
INNER JOIN productos p ON ia.producto_id = p.id
ORDER BY ia.fecha_actualizacion DESC
LIMIT 10;
```

## Ejecución en Producción (AWS RDS)

### Opción 1: Desde instancia EC2 en la misma VPC

La forma más segura y recomendada es ejecutar los ETLs desde una instancia EC2 que esté en la misma VPC que el RDS.

```bash
# SSH a la instancia EC2
ssh ec2-user@<EC2_IP>

# Clonar el repositorio si no está
git clone https://github.com/josefe-ing/fluxion-workspace.git
cd fluxion-workspace/etl

# Configurar variables de entorno
export POSTGRES_HOST=<RDS_ENDPOINT>
export POSTGRES_PORT=5432
export POSTGRES_DB=fluxion_production
export POSTGRES_USER=fluxion_admin
export POSTGRES_PASSWORD=<RDS_PASSWORD>
export DB_MODE=postgresql

# Ejecutar ETL
python3 etl_inventario_klk_postgres.py
```

### Opción 2: Desde tu máquina local (requiere VPN o Security Group ajustado)

```bash
# Configurar variables de entorno
export POSTGRES_HOST=<RDS_ENDPOINT>
export POSTGRES_PORT=5432
export POSTGRES_DB=fluxion_production
export POSTGRES_USER=fluxion_admin
export POSTGRES_PASSWORD=<RDS_PASSWORD>
export DB_MODE=postgresql

# Ejecutar ETL
cd etl
python3 etl_inventario_klk_postgres.py
```

### Opción 3: Como Lambda Function (futuro)

Se puede empaquetar el ETL como una Lambda Function y programarlo con EventBridge para que se ejecute automáticamente cada 30 minutos.

## Monitoreo y Troubleshooting

### Ver logs del ETL

```bash
# Ver logs en tiempo real
tail -f etl/logs/inventario_klk_postgres_$(date +%Y%m%d).log

# Buscar errores
grep "ERROR" etl/logs/inventario_klk_postgres_*.log

# Ver estadísticas de la última ejecución
grep "RESUMEN ETL" etl/logs/inventario_klk_postgres_*.log | tail -20
```

### Errores comunes

#### 1. "No se pudo conectar a PostgreSQL"

**Causa**: Credenciales incorrectas o RDS no accesible desde tu ubicación.

**Solución**:

```bash
# Verificar que puedes conectarte
psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB

# Si falla, verificar Security Group del RDS
aws rds describe-db-instances --db-instance-identifier fluxion-db \
  --query 'DBInstances[0].VpcSecurityGroups'
```

#### 2. "relation 'productos' does not exist"

**Causa**: Las migraciones PostgreSQL no se han ejecutado.

**Solución**:

```bash
cd database
python3 run_migrations.py
```

#### 3. "psycopg2.errors.ForeignKeyViolation"

**Causa**: Intentando insertar en `inventario_actual` sin que exista el producto o ubicación referenciada.

**Solución**: El loader debería crear automáticamente los productos y ubicaciones. Verificar logs para ver si hubo algún error previo en la carga de productos.

## Comparación DuckDB vs PostgreSQL

| Aspecto | DuckDB (Legacy) | PostgreSQL (Nuevo) |
|---------|----------------|-------------------|
| **Script** | `etl_inventario_klk.py` | `etl_inventario_klk_postgres.py` |
| **Loader** | `loader_inventario.py` | `loader_inventario_postgres.py` |
| **Destino** | `data/fluxion_production.db` (16GB archivo local) | AWS RDS PostgreSQL (remoto) |
| **Concurrencia** | Limitada (archivo único) | Alta (ACID compliant) |
| **Snapshots históricos** | No implementado | Sí (tabla `inventario_historico`) |
| **Escalabilidad** | Limitada al disco local | Alta (RDS con autoscaling) |
| **Uso** | Desarrollo y análisis local | Producción |

## Próximos Pasos

### Fase 1 (Actual): ETL Inventario ✅

- [x] Crear `etl_inventario_klk_postgres.py`
- [x] Crear `loader_inventario_postgres.py`
- [x] Documentar uso
- [ ] Testing local con PostgreSQL Docker
- [ ] Ejecutar en producción (AWS RDS)

### Fase 2: ETL Ventas (Próximo)

- [ ] Crear `etl_ventas_klk_postgres.py`
- [ ] Crear `loader_ventas_postgres.py`
- [ ] Testing y despliegue

### Fase 3: Backend Endpoints

- [ ] Adaptar endpoints de inventario para usar PostgreSQL
- [ ] Adaptar endpoints de ventas para usar PostgreSQL
- [ ] Testing endpoints

### Fase 4: Frontend

- [ ] Verificar funcionalidad con backend PostgreSQL
- [ ] Pruebas end-to-end

## Soporte

Para preguntas o problemas, contactar al equipo de desarrollo o revisar los logs en `etl/logs/`.

---

**Última actualización**: 2025-11-25
**Versión**: 1.0.0
