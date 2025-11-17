# Deployment: Features ABC-XYZ Analysis

**Fecha**: 2025-11-11
**Versión**: v1.2.0
**Tipo**: Feature Release

---

## 📦 Cambios Incluidos

### Backend
1. ✅ Endpoint `/api/productos/matriz-abc-xyz` - Análisis matriz ABC-XYZ
2. ✅ Endpoint `/api/productos/lista-por-matriz` - Listar productos por celda de matriz
3. ✅ Endpoint `/api/productos/{codigo}/detalle-completo` - Detalle completo por tienda
4. ✅ Endpoint `/api/productos/{codigo}/ventas-semanales` - Ventas semanales
5. ✅ Endpoint `/api/productos/{codigo}/historico-clasificacion` - Histórico de 12 meses

### Frontend
1. ✅ Nueva sección "Productos" en menú principal
2. ✅ Componente `ABCXYZAnalysis` - Dashboard de análisis
3. ✅ Componente `MatrizABCXYZ` - Visualización de matriz interactiva
4. ✅ Componente `ProductoDetalleModal` - Modal con análisis completo
5. ✅ Gráficos Recharts:
   - ABCDistributionChart (Pie chart)
   - XYZDistributionChart (Pie chart)
   - VentasSemanalesChart (Line chart)
   - ClasificacionHistoricoChart (Line charts ABC y XYZ)

### Dependencias Nuevas
- **Frontend**: `recharts` (ya en package.json)

---

## 🗄️ Migraciones de Base de Datos

### Cambios Necesarios en Producción

El sistema ABC-XYZ requiere agregar columnas a la tabla `productos_abc_v2` existente.

#### Archivo: `database/schema_abc_xyz.sql`

Este script:
1. Agrega columnas XYZ a `productos_abc_v2`
2. Crea vistas para análisis
3. Crea índices para performance

**Comando para aplicar**:
```sql
-- Conectarse a la BD de producción
duckdb /path/to/fluxion_production.db

-- Ejecutar el script
.read database/schema_abc_xyz.sql
```

#### ⚠️ IMPORTANTE: Verificación Previa

Antes de aplicar el schema, verificar que la tabla `productos_abc_v2` existe:

```sql
SELECT COUNT(*) FROM productos_abc_v2;
```

Si la tabla NO existe, primero hay que:
1. Crear la tabla con `database/schema_abc_v2.sql`
2. Ejecutar cálculo inicial con `database/calcular_abc_v2_por_tienda.py`
3. Luego aplicar `schema_abc_xyz.sql`

---

## 📋 Plan de Deployment

### Paso 1: Preparación (Local)
```bash
# Verificar que todos los tests pasen
cd frontend
npm run lint
npm run type-check
npm run build

# Verificar backend
cd ../backend
flake8 main.py
```

### Paso 2: Commit y Push
```bash
git add .
git commit -m "feat: ABC-XYZ analysis dashboard with historical charts

- Add ABC-XYZ matrix visualization
- Add product detail modal with classification history
- Add Recharts integration for distribution and trend charts
- Add 12-month historical classification tracking
- Add weekly sales analysis charts
- Extend historico endpoint to show 12 months of data

Frontend changes:
- New /productos route with ABCXYZAnalysis component
- Interactive matrix with drill-down to products
- Distribution pie charts for ABC and XYZ
- Historical line charts showing classification evolution
- Product detail modal with comprehensive store-level analysis

Backend changes:
- GET /api/productos/matriz-abc-xyz
- GET /api/productos/lista-por-matriz
- GET /api/productos/{codigo}/detalle-completo
- GET /api/productos/{codigo}/ventas-semanales
- GET /api/productos/{codigo}/historico-clasificacion (12 months)

Database:
- schema_abc_xyz.sql with XYZ columns and views
- Historical classification tracking
"

git push origin main
```

### Paso 3: Monitorear GitHub Actions
El workflow automáticamente:
1. ✅ Build y lint del frontend
2. ✅ Build y lint del backend
3. ✅ Build Docker images (backend + ETL)
4. ✅ Push a ECR
5. ✅ Deploy CDK infrastructure
6. ✅ Deploy frontend a S3
7. ✅ Invalidate CloudFront cache
8. ✅ Health check

**URL del workflow**:
https://github.com/[tu-repo]/fluxion-workspace/actions

### Paso 4: Aplicar Migración de BD en Producción

**⚠️ CRÍTICO**: Este paso se hace MANUALMENTE después del deploy

```bash
# 1. Conectarse a la instancia EC2 donde corre el backend
aws ssm start-session --target i-[instance-id]

# 2. Ubicar el archivo de la BD
ls /data/fluxion_production.db

# 3. Backup de la BD (OBLIGATORIO)
cp /data/fluxion_production.db /data/fluxion_production_backup_$(date +%Y%m%d_%H%M%S).db

# 4. Aplicar migración
duckdb /data/fluxion_production.db < /app/database/schema_abc_xyz.sql

# 5. Verificar que se aplicó correctamente
duckdb /data/fluxion_production.db
```

**Verificaciones en DuckDB**:
```sql
-- Verificar que las columnas existen
DESCRIBE productos_abc_v2;

-- Debe mostrar:
-- - clasificacion_xyz
-- - coeficiente_variacion
-- - demanda_promedio_semanal
-- - desviacion_estandar_semanal
-- - semanas_con_venta
-- - semanas_analizadas
-- - matriz_abc_xyz
-- - confiabilidad_calculo
-- - es_estacional
-- - es_extremadamente_volatil

-- Verificar que hay datos
SELECT COUNT(*) FROM productos_abc_v2 WHERE clasificacion_xyz IS NOT NULL;

-- Si clasificacion_xyz es NULL, ejecutar cálculo:
-- python3 /app/database/calcular_xyz_por_tienda.py
```

### Paso 5: Restart del Backend (si es necesario)

Si la BD estaba en uso, reiniciar el servicio:

```bash
aws ecs update-service \
  --cluster fluxion-cluster \
  --service FluxionStackV2-FluxionBackendServiceE051E4B7-3D0YfNUbXnmp \
  --force-new-deployment
```

### Paso 6: Smoke Testing en Producción

```bash
# Test 1: Health check
curl https://[backend-url]/

# Test 2: Matriz ABC-XYZ
curl https://[backend-url]/api/productos/matriz-abc-xyz

# Test 3: Lista de productos AX
curl https://[backend-url]/api/productos/lista-por-matriz?matriz=AX&limit=10

# Test 4: Detalle de un producto
curl https://[backend-url]/api/productos/[codigo]/detalle-completo

# Test 5: Histórico (debe retornar 12 meses)
curl https://[backend-url]/api/productos/[codigo]/historico-clasificacion | jq '.historico | length'
# Esperado: 12
```

### Paso 7: Validación en Frontend

1. Abrir https://[cloudfront-url]/login
2. Login con credenciales
3. Navegar a **Productos** en el menú
4. Verificar que carga la matriz ABC-XYZ
5. Click en una celda (ej: AX)
6. Verificar que muestra lista de productos
7. Click en un producto
8. Verificar modal con:
   - ✅ Información básica
   - ✅ Gráficos de distribución ABC y XYZ
   - ✅ Gráfico de ventas semanales
   - ✅ Gráfico histórico de clasificación (12 meses)
   - ✅ Tabla por tienda

### Paso 8: Monitoreo Post-Deploy

```bash
# Ver logs del backend
aws logs tail /aws/ecs/fluxion-backend --follow

# Ver métricas de CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=fluxion-backend \
  --start-time $(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average

# Ver status de ECS
aws ecs describe-services \
  --cluster fluxion-cluster \
  --services FluxionStackV2-FluxionBackendServiceE051E4B7-3D0YfNUbXnmp
```

---

## 🔧 Troubleshooting

### Problema: Frontend no muestra la nueva sección "Productos"

**Causa**: CloudFront cache no invalidado
**Solución**:
```bash
aws cloudfront create-invalidation \
  --distribution-id [CLOUDFRONT_ID] \
  --paths "/*"
```

### Problema: Backend retorna error 500 en endpoints nuevos

**Causa**: Columnas XYZ no existen en la BD
**Solución**: Aplicar `schema_abc_xyz.sql` como se describe en Paso 4

### Problema: Histórico retorna solo 6 meses en vez de 12

**Causa**: Código anterior no deployado
**Solución**: Verificar que el último commit se deployó correctamente

### Problema: Gráficos Recharts no se renderizan

**Causa**: Dependencia `recharts` no instalada
**Solución**: Ya está en package.json, verificar que `npm ci` corrió en el build

### Problema: Error "Cannot read properties of undefined (toFixed)"

**Causa**: Ya fue fixeado en este deployment
**Solución**: Verificar que se deployó la última versión del frontend

---

## 📊 Métricas a Monitorear

### Performance
- **Tiempo de carga de matriz**: < 2s
- **Tiempo de carga de lista de productos**: < 1s
- **Tiempo de carga de modal detalle**: < 3s

### Errores
- **Error rate de endpoints nuevos**: < 1%
- **Frontend errors en console**: 0

### Uso
- **Usuarios que visitan /productos**: Trackear en los próximos 7 días
- **Productos más consultados**: Top 10

---

## 🔄 Rollback Plan

Si hay problemas críticos:

### Frontend Rollback
```bash
# Revertir a commit anterior
git revert HEAD
git push origin main

# O manualmente:
# 1. Checkout commit anterior
git checkout [commit-anterior]

# 2. Build y deploy manual
cd frontend
npm run build
aws s3 sync dist/ s3://[bucket]/ --delete
aws cloudfront create-invalidation --distribution-id [id] --paths "/*"
```

### Backend Rollback
```bash
# Revertir servicio ECS a task definition anterior
aws ecs update-service \
  --cluster fluxion-cluster \
  --service FluxionStackV2-FluxionBackendServiceE051E4B7-3D0YfNUbXnmp \
  --task-definition [task-definition-anterior]
```

### Database Rollback
```bash
# Restaurar backup
cp /data/fluxion_production_backup_[timestamp].db /data/fluxion_production.db

# Reiniciar backend
aws ecs update-service ... --force-new-deployment
```

---

## ✅ Checklist de Deployment

### Pre-Deploy
- [ ] Documento PLAN_CONJUNTOS_SUSTITUIBLES.md creado
- [ ] Todos los archivos documentados comprometidos
- [ ] Frontend build exitoso localmente
- [ ] Backend lint pasa
- [ ] Git status clean (todo commiteado)

### Durante Deploy
- [ ] Commit realizado con mensaje descriptivo
- [ ] Push a main completado
- [ ] GitHub Actions workflow iniciado
- [ ] Todos los jobs del workflow pasaron (green checkmarks)

### Post-Deploy - Backend
- [ ] Migración de BD aplicada (`schema_abc_xyz.sql`)
- [ ] Verificación de columnas nuevas en `productos_abc_v2`
- [ ] Datos ABC-XYZ presentes (clasificacion_xyz NOT NULL)
- [ ] Health check exitoso
- [ ] Test de endpoints nuevos exitoso

### Post-Deploy - Frontend
- [ ] CloudFront invalidation completada
- [ ] Sección "Productos" visible en menú
- [ ] Matriz ABC-XYZ carga correctamente
- [ ] Drill-down a productos funciona
- [ ] Modal de detalle abre y muestra datos
- [ ] Gráficos Recharts se renderizan
- [ ] Histórico muestra 12 meses

### Monitoring
- [ ] Logs del backend sin errores críticos
- [ ] Métricas de CloudWatch normales
- [ ] Frontend console sin errores
- [ ] Performance dentro de SLAs

---

## 📝 Notas Finales

### Archivos Importantes

**Backend**:
- `backend/main.py` - Endpoints nuevos para ABC-XYZ

**Frontend**:
- `frontend/src/components/productos/ABCXYZAnalysis.tsx` - Dashboard principal
- `frontend/src/components/productos/ProductoDetalleModal.tsx` - Modal detalle
- `frontend/src/components/productos/charts/*` - Gráficos Recharts
- `frontend/src/services/productosService.ts` - API client

**Database**:
- `database/schema_abc_xyz.sql` - Migración de BD
- `database/calcular_xyz_por_tienda.py` - Script para calcular XYZ

**Documentación**:
- `PLAN_CONJUNTOS_SUSTITUIBLES.md` - Plan futuro de conjuntos
- `docs/ABC_V2_DOCUMENTACION.md` - Documentación completa ABC-XYZ

### Próximos Pasos (Post-Deployment)

1. **Semana 1**: Monitorear uso y performance
2. **Semana 2**: Recoger feedback de usuarios
3. **Semana 3**: Iniciar implementación de Conjuntos Sustituibles
4. **Semana 4**: Beta testing de Conjuntos

---

**Deployment Owner**: Jose
**Reviewed By**: [Pendiente]
**Approved By**: [Pendiente]
**Deployment Date**: [A determinar después del commit]
