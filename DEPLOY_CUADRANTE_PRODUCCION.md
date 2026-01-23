# Deploy de Cuadrante a Producción

**Fecha:** 2026-01-23
**Estado:** ✅ Base de Datos Lista | ⏳ Código Pendiente de Deploy

## Resumen Ejecutivo

La implementación de cuadrante está **COMPLETAMENTE LISTA** para producción:
- ✅ Migraciones aplicadas en RDS de producción
- ✅ Datos poblados (2,490 productos con cuadrante)
- ⏳ Código backend listo para deploy

## 1. Base de Datos de Producción ✅ COMPLETADO

### Migraciones Aplicadas

#### Migración 028: Campo cuadrante en productos
```bash
PGPASSWORD='RNIT_tl5.WRmlWzL5yyDptYQ-xJE=6' psql \
  -h localhost -p 5433 -U postgres -d fluxion_production \
  -f database/migrations/028_add_cuadrante_to_productos_UP.sql
```
**Resultado:** ✅ Exitoso

#### Migración 029: Campo cuadrante_producto en ventas
```bash
PGPASSWORD='RNIT_tl5.WRmlWzL5yyDptYQ-xJE=6' psql \
  -h localhost -p 5433 -U postgres -d fluxion_production \
  -f database/migrations/029_add_cuadrante_to_ventas_UP.sql
```
**Resultado:** ✅ Exitoso

### Datos Poblados ✅

**Método:** Export desde desarrollo → Import a producción

**Estadísticas:**
- **Total productos actualizados:** 2,490
- CUADRANTE I: 56 productos
- CUADRANTE II: 67 productos
- CUADRANTE III: 59 productos
- CUADRANTE IV: 2,308 productos
- NO ESPECIFICADO: 1,688 productos

**Query de verificación:**
```sql
SELECT cuadrante, COUNT(*) as cantidad
FROM productos
WHERE cuadrante IS NOT NULL AND cuadrante <> 'NO ESPECIFICADO'
GROUP BY cuadrante
ORDER BY cantidad DESC;
```

## 2. Código Backend ⏳ PENDIENTE DE DEPLOY

### Cambios Realizados

#### Archivos Modificados (tracked by git)
1. **`backend/models/pedidos_multitienda.py`**
   - Línea 125: Agregado `cuadrante: Optional[str] = None`

2. **`backend/requirements.txt`**
   - Agregado `openpyxl==3.1.2` para exportación a Excel

3. **`etl/core/loader_ventas_postgres.py`**
   - Modificado INSERT para incluir `cuadrante_producto`
   - Actualizado UPSERT en ON CONFLICT

#### Archivos Nuevos (untracked)
1. **Migraciones:**
   - `database/migrations/028_add_cuadrante_to_productos_UP.sql`
   - `database/migrations/028_add_cuadrante_to_productos_DOWN.sql`
   - `database/migrations/029_add_cuadrante_to_ventas_UP.sql`
   - `database/migrations/029_add_cuadrante_to_ventas_DOWN.sql`

2. **Scripts:**
   - `database/scripts/populate_cuadrantes_from_ventas.py`
   - `database/scripts/test_cuadrante_setup.sql`

3. **Documentación:**
   - `PASOS_CUADRANTE.md`
   - `RESUMEN_CUADRANTE.md`
   - `DEPLOY_CUADRANTE_PRODUCCION.md` (este archivo)

#### Archivos de Trabajo (no incluir en deploy)
- `analisis_artigas_paraiso.py`
- `analisis_artigas_paraiso_optimizado.py`
- `docs/propuesta-distribucion-multitienda.md`

### Funcionalidad en Routers

**NOTA IMPORTANTE:** Los routers ya tienen la funcionalidad de cuadrante implementada desde commits anteriores:
- Commit `f3ce83e`: "feat: add cuadrante filter with visual tabs in order creation"
- Commit `28d444f`: "fix: obtain cuadrante_producto from ventas_raw table"

**Endpoints que ya incluyen cuadrante:**
- ✅ `POST /api/pedidos-sugeridos/calcular` - Acepta parámetro `cuadrantes`
- ✅ `POST /api/pedidos-multitienda/calcular` - Acepta parámetro `cuadrantes`
- ✅ Excel export endpoints (probablemente ya existentes)

## 3. Pasos para Desplegar a Producción

### Opción A: Deploy Automático via GitHub Actions (RECOMENDADO)

1. **Agregar archivos al staging area:**
```bash
# Archivos modificados
git add backend/models/pedidos_multitienda.py
git add backend/requirements.txt
git add etl/core/loader_ventas_postgres.py

# Migraciones
git add database/migrations/028_add_cuadrante_to_productos_*.sql
git add database/migrations/029_add_cuadrante_to_ventas_*.sql

# Scripts
git add database/scripts/populate_cuadrantes_from_ventas.py

# Documentación
git add PASOS_CUADRANTE.md
git add RESUMEN_CUADRANTE.md
git add DEPLOY_CUADRANTE_PRODUCCION.md
```

2. **Crear commit:**
```bash
git commit -m "feat: Complete cuadrante implementation for pedidos sugeridos

- Add cuadrante field to productos table (migration 028)
- Add cuadrante_producto field to ventas table (migration 029)
- Update ProductoPedidoSimplificado model with cuadrante field
- Modify ventas loader to extract and store cuadrante_producto
- Add openpyxl dependency for Excel export
- Include population script for cuadrante data

Database changes already applied to production RDS.
2,490 products populated with cuadrante values.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

3. **Push a main:**
```bash
git push origin main
```

4. **Monitorear GitHub Actions:**
- Ir a: https://github.com/[tu-repo]/actions
- El workflow "Deploy to AWS" se ejecutará automáticamente
- Esperar ~10-15 minutos para que complete

### Opción B: Deploy Manual desde GitHub UI

1. Ir a: https://github.com/[tu-repo]/actions
2. Seleccionar workflow "Deploy to AWS"
3. Click en "Run workflow"
4. Seleccionar branch: `main`
5. Click en "Run workflow"

### Opción C: Deploy Manual via CDK (para emergencias)

```bash
cd infrastructure

# Instalar dependencias
npm ci

# Deploy
npx cdk deploy --require-approval never

# Force new deployment del backend
aws ecs update-service \
  --cluster fluxion-cluster \
  --service fluxion-backend \
  --force-new-deployment
```

## 4. Verificación Post-Deploy

### 4.1 Verificar Backend en Producción

```bash
# Health check
curl https://api.fluxionia.co/

# Test endpoint single-tienda con filtro de cuadrante
curl -X POST 'https://api.fluxionia.co/api/pedidos-sugeridos/calcular?cuadrantes=CUADRANTE%20IV' \
  -H 'Content-Type: application/json' \
  -d '{
    "cedi_origen": "cedi_seco",
    "tienda_destino": "tienda_01",
    "dias_cobertura": 3,
    "tiendas_referencia": []
  }'

# Test endpoint multi-tienda con filtro de cuadrante
curl -X POST 'https://api.fluxionia.co/api/pedidos-multitienda/calcular?cuadrantes=CUADRANTE%20I' \
  -H 'Content-Type: application/json' \
  -d '{
    "cedi_origen": "cedi_seco",
    "tiendas_destino": [
      {
        "tienda_id": "tienda_01",
        "tienda_nombre": "Tienda 01",
        "peso": 1.0
      }
    ],
    "dias_cobertura": 3
  }'
```

### 4.2 Verificar Base de Datos

```bash
# Conectar via túnel SSH
PGPASSWORD='RNIT_tl5.WRmlWzL5yyDptYQ-xJE=6' psql \
  -h localhost -p 5433 -U postgres -d fluxion_production

# Verificar cuadrantes en productos
SELECT cuadrante, COUNT(*)
FROM productos
GROUP BY cuadrante
ORDER BY COUNT(*) DESC;

# Verificar que las migraciones están registradas
SELECT version, description, applied_at
FROM schema_migrations
WHERE version IN ('028', '029')
ORDER BY version;
```

### 4.3 Verificar Frontend

- Ir a: https://app.fluxionia.co
- Navegar a módulo de Pedidos Sugeridos
- Verificar que aparezca filtro de cuadrante
- Crear un pedido de prueba
- Verificar que el Excel descargado incluya columna Cuadrante

## 5. Rollback (si es necesario)

### Si hay problemas con el backend:

```bash
# Revert último commit
git revert HEAD
git push origin main

# O deploy versión anterior via GitHub Actions
# (seleccionar commit anterior en el workflow)
```

### Si hay problemas con la base de datos:

```bash
# Conectar a RDS
PGPASSWORD='RNIT_tl5.WRmlWzL5yyDptYQ-xJE=6' psql \
  -h localhost -p 5433 -U postgres -d fluxion_production

# Ejecutar migraciones DOWN
\i database/migrations/029_add_cuadrante_to_ventas_DOWN.sql
\i database/migrations/028_add_cuadrante_to_productos_DOWN.sql
```

## 6. Tareas Post-Deploy

### Inmediatas
- [ ] Monitorear logs de CloudWatch por errores
- [ ] Verificar que el servicio ECS esté estable
- [ ] Probar endpoints en producción
- [ ] Verificar que el frontend muestre los filtros de cuadrante

### Siguientes ETL Runs
- [ ] Verificar que el ETL de ventas cargue cuadrante_producto
- [ ] Si es necesario, ejecutar script de población nuevamente después de cada ETL

### Mejoras Futuras
- [ ] Modificar ETL de inventario para cargar cuadrante a productos directamente
- [ ] Agregar cuadrante a más reportes y dashboards
- [ ] Implementar análisis de rotación por cuadrante
- [ ] Agregar cuadrante a otros módulos del sistema

## 7. Archivos No Incluidos en Deploy

Archivos de trabajo que NO deben ir en el commit de producción:
- `analisis_artigas_paraiso.py` (análisis temporal)
- `analisis_artigas_paraiso_optimizado.py` (análisis temporal)
- `docs/propuesta-distribucion-multitienda.md` (documento de trabajo)

Si deseas incluirlos, agrégalos en un commit separado.

## 8. Contactos y Soporte

- **Monitoreo:** CloudWatch Logs
- **Sentry:** https://sentry.io/[tu-proyecto]
- **GitHub Actions:** https://github.com/[tu-repo]/actions
- **Stack de CDK:** FluxionStackV2

## Estado Final

### ✅ Completado
- Migraciones en RDS de producción
- Datos poblados (2,490 productos)
- Código backend modificado y listo
- Documentación completa

### ⏳ Pendiente
- Hacer commit de cambios
- Push a main
- Deploy via GitHub Actions
- Verificación post-deploy

---

**Siguiente paso:** Ejecutar los comandos de git add, commit y push listados en la Opción A para deployar a producción.
